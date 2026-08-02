/**
 * Run orchestration: owns the world, the local player, remote players and the
 * frame loop while a run is in progress.
 *
 * Everything it needs arrives through config; it knows nothing about which art
 * pack is loaded beyond the id in config/maps.json.
 */
import * as THREE from 'three';
import { getArtPack } from '@art/packs/index';
import { resolveArt } from '@art/shared/index';
import type { RoomDims } from '@art/lib/contract';
import { configForMap, type Config } from '@/config/index';
import { stream } from '@/core/rng';
import { createPlayerState, applyLook, eyeHeight, stepPlayer, type PlayerState } from '@/entities/player';
import {
  createInventory,
  dropFrom,
  handHolding,
  itemDef,
  itemParam,
  takeItem,
  type Hand,
  type Inventory,
} from '@/entities/items';
import type { Input } from '@/input/index';
import type { Net } from '@/net/index';
import type { Renderer } from '@/render/Renderer';
import { generate, type RunLayout } from '@/world/generation';
import { toggleDoor, unlockDoor, updateDoors, type Door } from '@/world/doors';
import { updateChests, updateLockers, type Locker } from '@/world/containers';
import { buildWorld, type BuiltWorld } from '@/world/worldBuilder';

/** What the look-ray is currently offering. `hold` targets fill a ring first. */
export interface InteractTarget {
  kind: 'door' | 'exit' | 'unlock' | 'locked' | 'chest' | 'lockerEnter' | 'lockerExit' | 'item';
  id: string;
  verbKey: string;
  /** Locale key of the item's name, for prompts that name what you are taking. */
  itemNameKey?: string;
  hold: boolean;
  holdSeconds: number;
}

export interface RunHooks {
  onInteractTargetChange(target: InteractTarget | null): void;
  onHoldProgress(progress: number): void;
  onHandsChange(hands: { left: string | null; right: string | null }): void;
  onEscaped(): void;
  onPlayerCountChange(count: number): void;
}

interface RemotePlayer {
  object: THREE.Object3D;
  root: THREE.Object3D;
  target: { x: number; z: number; yaw: number; height: number };
}

/** The unlock behaviour is the only item behaviour this slice implements. */
const KEY_ITEM = 'key';

export class Game {
  #config: Config;
  #renderer: Renderer;
  #input: Input;
  #net: Net;
  #hooks: RunHooks;

  #world: BuiltWorld | null = null;
  #layout: RunLayout | null = null;
  #player: PlayerState | null = null;
  #inventory: Inventory = createInventory();
  #remotes = new Map<string, RemotePlayer>();

  #raycaster = new THREE.Raycaster();
  #target: InteractTarget | null = null;
  #hold = 0;
  #holdDone = false;
  #hiding: { locker: Locker; active: boolean } | null = null;
  #escaped = false;
  #moveTimer = 0;
  #dropCount = 0;
  #dims: RoomDims | null = null;

  constructor(config: Config, renderer: Renderer, input: Input, net: Net, hooks: RunHooks) {
    this.#config = config;
    this.#renderer = renderer;
    this.#input = input;
    this.#net = net;
    this.#hooks = hooks;
  }

  get active(): boolean {
    return this.#world !== null;
  }

  get layout(): RunLayout | null {
    return this.#layout;
  }

  get player(): PlayerState | null {
    return this.#player;
  }

  /** `slot` selects this player's spawn point within the shared start room. */
  start(mapId: string, seed: number, slot = 0): void {
    this.end();

    const config = configForMap(mapId);
    this.#config = config;
    this.#renderer.applyGraphics(config.graphics);

    const pack = getArtPack(config.maps.maps[mapId]?.artPack ?? mapId);
    const layout = generate(mapId, seed, config.world, pack.rooms);
    const world = buildWorld(layout, pack, config.world, config.items);

    this.#layout = layout;
    this.#world = world;
    this.#dims = {
      cellSize: config.world.grid.cellSize,
      ceilingHeight: config.world.grid.ceilingHeight,
      wallThickness: config.world.grid.wallThickness,
      doorWidth: config.world.doors.width,
      doorHeight: config.world.doors.height,
    };

    this.#renderer.scene.add(world.root);
    this.#renderer.setRoomLights(world.lights);

    const spawn = layout.playerSpawns[slot % layout.playerSpawns.length] ?? layout.playerSpawns[0]!;
    this.#player = createPlayerState(spawn.position[0], spawn.position[2], spawn.yaw, config.player);
    this.#inventory = createInventory();
    this.#escaped = false;
    this.#resetHold();
    this.#hooks.onHandsChange({ left: null, right: null });
    this.#hooks.onPlayerCountChange(this.#remotes.size + 1);
  }

  end(): void {
    if (this.#world) {
      this.#renderer.scene.remove(this.#world.root);
      this.#world.dispose();
    }
    for (const remote of this.#remotes.values()) this.#renderer.scene.remove(remote.object);
    this.#remotes.clear();
    this.#renderer.setRoomLights([]);
    this.#world = null;
    this.#layout = null;
    this.#player = null;
    this.#target = null;
    this.#hiding = null;
  }

  /* --- remote players ----------------------------------------------------- */

  addRemote(id: string): void {
    if (this.#remotes.has(id) || !this.#dims) return;

    const art = resolveArt('player.masked')({
      materials: this.#world?.materials ?? getArtPack('test').createMaterials(),
      rng: stream(0, `remote:${id}`),
      dims: this.#dims,
    });
    const root = art.parts['root'] ?? art.object;

    this.#renderer.scene.add(art.object);
    this.#remotes.set(id, { object: art.object, root, target: { x: 0, z: 0, yaw: 0, height: 1.8 } });
    this.#hooks.onPlayerCountChange(this.#remotes.size + 1);
  }

  removeRemote(id: string): void {
    const remote = this.#remotes.get(id);
    if (!remote) return;
    this.#renderer.scene.remove(remote.object);
    this.#remotes.delete(id);
    this.#hooks.onPlayerCountChange(this.#remotes.size + 1);
  }

  moveRemote(id: string, transform: { x: number; z: number; yaw: number; height: number }): void {
    const remote = this.#remotes.get(id);
    if (!remote) {
      this.addRemote(id);
      return;
    }
    remote.target = transform;
  }

  /* --- replicated world events -------------------------------------------- */

  setDoor(doorId: string, open: boolean): void {
    const door = this.#doorById(doorId);
    if (door) toggleDoor(door, open);
  }

  setDoorUnlocked(doorId: string): void {
    const door = this.#doorById(doorId);
    if (door) unlockDoor(door);
  }

  openChest(chestId: string): void {
    const chest = this.#world?.chests.find((candidate) => candidate.id === chestId);
    if (!chest || chest.opened) return;

    chest.opened = true;
    if (!chest.contents) return;

    // The id is derived from the chest, so every peer names the same item.
    const anchor = chest.contentsAnchor.getWorldPosition(new THREE.Vector3());
    this.#world?.spawnItem(`${chest.id}:loot`, chest.contents, anchor.x, anchor.y, anchor.z);
    chest.contents = null;
  }

  takeWorldItem(itemId: string): void {
    this.#world?.removeItem(itemId);
  }

  dropWorldItem(id: string, itemId: string, x: number, y: number, z: number): void {
    this.#world?.spawnItem(id, itemId, x, y, z);
  }

  /* --- frame -------------------------------------------------------------- */

  update(dt: number, controlsEnabled: boolean): void {
    const world = this.#world;
    const player = this.#player;
    if (!world || !player) return;

    if (controlsEnabled) {
      const look = this.#input.consumeLook();
      applyLook(player, look.x, look.y, this.#config.player, this.#input.mouseSensitivity);

      // Hidden players cannot move; the locker is a trade of mobility for cover.
      if (!this.#hiding?.active) {
        stepPlayer(
          player,
          {
            forward: this.#input.axis('moveBack', 'moveForward'),
            strafe: this.#input.axis('moveLeft', 'moveRight'),
            sprint: this.#input.isDown('sprint'),
            crouch: this.#input.isDown('crouch'),
          },
          dt,
          this.#config.player,
          world.collision,
        );
      }
    }

    this.#updateCamera(player);
    this.#updateInteraction(dt, controlsEnabled);
    if (controlsEnabled) this.#updateHands(player);

    const { doors, containers } = this.#config.world;
    updateDoors(world.doors, dt, doors.openSeconds, doors.closeSeconds);
    updateChests(world.chests, dt, containers.chestOpenHoldSeconds);
    updateLockers(world.lockers, dt, containers.lockerEnterSeconds, containers.lockerExitSeconds);
    if (this.#hiding && !this.#hiding.active && this.#hiding.locker.progress === 0) this.#hiding = null;

    world.updateVisibility(
      player.x,
      player.z,
      this.#config.graphics.renderDistanceRooms * this.#config.world.grid.cellSize,
    );
    this.#renderer.updateLights(dt, player.x, player.z);
    this.#interpolateRemotes(dt);
    this.#sendTransform(dt, player);
  }

  #updateCamera(player: PlayerState): void {
    const camera = this.#renderer.camera;
    let x = player.x;
    let y = eyeHeight(player, this.#config.player);
    let z = player.z;

    // Sliding into and out of a locker is the same lerp, driven by its animation.
    const hiding = this.#hiding;
    if (hiding) {
      const t = hiding.locker.progress;
      x += (hiding.locker.inside.x - x) * t;
      y += (hiding.locker.inside.y - y) * t;
      z += (hiding.locker.inside.z - z) * t;
    }

    camera.position.set(x, y, z);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    // The interaction ray is cast during the sim step, but matrices are
    // otherwise only refreshed by render() afterwards - so without this the ray
    // would be built from last frame's camera transform.
    camera.updateMatrixWorld();
  }

  /* --- interaction --------------------------------------------------------- */

  #updateInteraction(dt: number, controlsEnabled: boolean): void {
    const world = this.#world;
    if (!world) return;

    const previous = this.#target;
    this.#target = controlsEnabled ? this.#findTarget(world) : null;

    // Compare the verb too, not just the id: opening a door changes the prompt
    // from "Open" to "Close" while you are still looking at the same door.
    if (this.#target?.id !== previous?.id || this.#target?.verbKey !== previous?.verbKey) {
      this.#hooks.onInteractTargetChange(this.#target);
      this.#resetHold();
    }

    const target = this.#target;
    if (!target) return;

    if (!target.hold) {
      if (this.#input.justPressed('interact')) this.#complete(target, null);
      return;
    }

    const hand = this.#holdingHand(target);
    if (hand === false) {
      if (this.#hold > 0) this.#resetHold();
      return;
    }

    this.#hold += dt;
    this.#hooks.onHoldProgress(Math.min(1, this.#hold / target.holdSeconds));
    if (this.#hold >= target.holdSeconds && !this.#holdDone) {
      this.#holdDone = true;
      this.#complete(target, hand);
    }
  }

  /**
   * Whether the hold input is engaged, and through which hand. `false` means
   * nothing is being held; `null` means E rather than a hand button.
   */
  #holdingHand(target: InteractTarget): Hand | null | false {
    if (this.#input.isDown('interact')) return target.kind === 'unlock' ? this.#keyHand() : null;
    if (target.kind !== 'unlock') return false;

    // Using the key directly is the same action as pressing E on the door.
    if (this.#input.isDown('useLeft') && this.#inventory.left === KEY_ITEM) return 'left';
    if (this.#input.isDown('useRight') && this.#inventory.right === KEY_ITEM) return 'right';
    return false;
  }

  #keyHand(): Hand | null {
    return handHolding(this.#inventory, KEY_ITEM);
  }

  #resetHold(): void {
    this.#hold = 0;
    this.#holdDone = false;
    this.#hooks.onHoldProgress(0);
  }

  #complete(target: InteractTarget, hand: Hand | null): void {
    const world = this.#world;
    const player = this.#player;
    if (!world || !player) return;

    switch (target.kind) {
      case 'door': {
        const door = this.#doorById(target.id);
        if (!door) break;
        toggleDoor(door);
        this.#net.broadcast({ t: 'door', id: door.id, open: door.open });
        break;
      }
      case 'unlock': {
        const door = this.#doorById(target.id);
        const used = hand ?? this.#keyHand();
        if (!door || !used) break;
        unlockDoor(door);
        dropFrom(this.#inventory, used);
        this.#hooks.onHandsChange({ ...this.#inventory });
        this.#net.broadcast({ t: 'unlock', id: door.id });
        break;
      }
      case 'exit':
        if (!this.#escaped) {
          this.#escaped = true;
          this.#hooks.onEscaped();
        }
        break;
      case 'chest':
        this.openChest(target.id);
        this.#net.broadcast({ t: 'chest', id: target.id });
        break;
      case 'item':
        this.#pickUp(target.id);
        break;
      case 'lockerEnter': {
        const locker = world.lockers.find((candidate) => candidate.id === target.id);
        if (!locker || locker.occupied) break;
        locker.occupied = true;
        this.#hiding = { locker, active: true };
        player.x = locker.x;
        player.z = locker.z;
        player.velocityX = 0;
        player.velocityZ = 0;
        break;
      }
      case 'lockerExit': {
        const hiding = this.#hiding;
        if (!hiding) break;
        hiding.locker.occupied = false;
        hiding.active = false;
        // Step out through the front face, which is -Z before the locker's yaw.
        const yaw = hiding.locker.yaw;
        player.x = hiding.locker.x - Math.sin(yaw) * 1.1;
        player.z = hiding.locker.z - Math.cos(yaw) * 1.1;
        break;
      }
      case 'locked':
        break;
    }
    this.#resetHold();
  }

  #pickUp(worldItemId: string): void {
    const world = this.#world;
    const player = this.#player;
    if (!world || !player) return;

    const item = world.items.get(worldItemId);
    if (!item) return;

    world.removeItem(worldItemId);
    this.#net.broadcast({ t: 'take', id: worldItemId });

    const { displaced } = takeItem(this.#inventory, item.itemId);
    if (displaced) this.#dropIntoWorld(displaced, player);
    this.#hooks.onHandsChange({ ...this.#inventory });
  }

  #updateHands(player: PlayerState): void {
    for (const [action, hand] of [['dropLeft', 'left'], ['dropRight', 'right']] as const) {
      if (!this.#input.justPressed(action)) continue;
      const itemId = dropFrom(this.#inventory, hand);
      if (!itemId) continue;
      this.#dropIntoWorld(itemId, player);
      this.#hooks.onHandsChange({ ...this.#inventory });
    }
  }

  #dropIntoWorld(itemId: string, player: PlayerState): void {
    const world = this.#world;
    if (!world) return;

    // Ids are namespaced by peer so two players dropping at once cannot collide.
    const id = `drop:${this.#net.selfId}:${this.#dropCount++}`;
    const reach = this.#config.items.defaults.dropForwardOffset;
    const x = player.x - Math.sin(player.yaw) * reach;
    const z = player.z - Math.cos(player.yaw) * reach;

    world.spawnItem(id, itemId, x, 0, z);
    this.#net.broadcast({ t: 'drop', id, itemId, x, y: 0, z });
  }

  /**
   * Raycasts rather than doing a distance check, so you cannot open a door
   * through the wall next to it.
   */
  #findTarget(world: BuiltWorld): InteractTarget | null {
    // Hiding replaces every other option: you can only get back out.
    if (this.#hiding?.active) {
      return {
        kind: 'lockerExit',
        id: this.#hiding.locker.id,
        verbKey: 'hud.interact.leaveLocker',
        hold: false,
        holdSeconds: 0,
      };
    }

    const camera = this.#renderer.camera;
    this.#raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    this.#raycaster.far = this.#config.player.interaction.rayLength;

    const hit = this.#raycaster.intersectObjects(world.raycastTargets, true)[0];
    if (!hit) return null;

    const tagged = findTag(hit.object);
    if (!tagged) return null;

    switch (tagged.key) {
      case 'worldItemId': {
        const item = world.items.get(tagged.value);
        const def = item ? itemDef(this.#config.items, item.itemId) : null;
        if (!def) return null;
        return {
          kind: 'item',
          id: tagged.value,
          verbKey: 'hud.interact.pickUp',
          itemNameKey: def.nameKey,
          hold: false,
          holdSeconds: 0,
        };
      }
      case 'chestId': {
        const chest = world.chests.find((candidate) => candidate.id === tagged.value);
        if (!chest || chest.opened) return null;
        return {
          kind: 'chest',
          id: chest.id,
          verbKey: 'hud.interact.search',
          hold: true,
          holdSeconds: this.#config.world.containers.chestOpenHoldSeconds,
        };
      }
      case 'lockerId': {
        const locker = world.lockers.find((candidate) => candidate.id === tagged.value);
        if (!locker || locker.occupied) return null;
        return { kind: 'lockerEnter', id: locker.id, verbKey: 'hud.interact.hide', hold: false, holdSeconds: 0 };
      }
      case 'doorId': {
        const door = world.doors.find((candidate) => candidate.id === tagged.value);
        if (!door) return null;
        return this.#doorTarget(door);
      }
      default:
        return null;
    }
  }

  #doorTarget(door: Door): InteractTarget {
    if (door.isExit) {
      return {
        kind: 'exit',
        id: door.id,
        verbKey: 'hud.interact.escape',
        hold: true,
        holdSeconds: this.#config.world.exit.holdSeconds,
      };
    }

    if (door.locked) {
      const key = itemDef(this.#config.items, KEY_ITEM);
      if (key && this.#keyHand()) {
        return {
          kind: 'unlock',
          id: door.id,
          verbKey: 'hud.interact.unlock',
          hold: true,
          holdSeconds: itemParam(key, 'unlockSeconds', 1),
        };
      }
      return { kind: 'locked', id: door.id, verbKey: 'hud.interact.locked', hold: false, holdSeconds: 0 };
    }

    return {
      kind: 'door',
      id: door.id,
      verbKey: door.open ? 'hud.interact.close' : 'hud.interact.open',
      hold: false,
      holdSeconds: 0,
    };
  }

  #doorById(doorId: string): Door | undefined {
    return this.#world?.doors.find((candidate) => candidate.id === doorId);
  }

  /* --- networking ---------------------------------------------------------- */

  #interpolateRemotes(dt: number): void {
    const blend = Math.min(1, dt * 12);
    for (const remote of this.#remotes.values()) {
      remote.object.position.x += (remote.target.x - remote.object.position.x) * blend;
      remote.object.position.z += (remote.target.z - remote.object.position.z) * blend;

      let delta = remote.target.yaw - remote.root.rotation.y;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      remote.root.rotation.y += delta * blend;

      const crouchScale = remote.target.height / this.#config.player.body.standHeight;
      remote.root.scale.y += (crouchScale - remote.root.scale.y) * blend;
    }
  }

  #sendTransform(dt: number, player: PlayerState): void {
    if (this.#net.role === 'offline') return;

    this.#moveTimer -= dt;
    if (this.#moveTimer > 0) return;
    this.#moveTimer = 1 / this.#config.net.simulation.snapshotRateHz;

    this.#net.broadcast({
      t: 'move',
      id: this.#net.selfId,
      x: player.x,
      z: player.z,
      yaw: player.yaw,
      height: player.height,
    });
  }
}

/** Walks up to the nearest ancestor carrying one of the interaction tags. */
function findTag(object: THREE.Object3D): { key: string; value: string } | null {
  const keys = ['worldItemId', 'chestId', 'lockerId', 'doorId'];
  let node: THREE.Object3D | null = object;
  while (node) {
    for (const key of keys) {
      const value = node.userData[key];
      if (typeof value === 'string') return { key, value };
    }
    node = node.parent;
  }
  return null;
}
