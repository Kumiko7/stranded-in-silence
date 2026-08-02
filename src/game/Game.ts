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
import type { Input } from '@/input/index';
import type { Net } from '@/net/index';
import type { Renderer } from '@/render/Renderer';
import { generate, type RunLayout } from '@/world/generation';
import { toggleDoor, updateDoors, type Door } from '@/world/doors';
import { buildWorld, type BuiltWorld } from '@/world/worldBuilder';

export interface InteractTarget {
  door: Door;
  verbKey: string;
  hold: boolean;
}

export interface RunHooks {
  onInteractTargetChange(target: InteractTarget | null): void;
  onExitProgress(progress: number): void;
  onEscaped(): void;
  onPlayerCountChange(count: number): void;
}

interface RemotePlayer {
  object: THREE.Object3D;
  root: THREE.Object3D;
  target: { x: number; z: number; yaw: number; height: number };
}

export class Game {
  #config: Config;
  #renderer: Renderer;
  #input: Input;
  #net: Net;
  #hooks: RunHooks;

  #world: BuiltWorld | null = null;
  #layout: RunLayout | null = null;
  #player: PlayerState | null = null;
  #remotes = new Map<string, RemotePlayer>();

  #raycaster = new THREE.Raycaster();
  #target: InteractTarget | null = null;
  #exitHold = 0;
  #escaped = false;
  #moveTimer = 0;
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

  start(mapId: string, seed: number): void {
    this.end();

    const config = configForMap(mapId);
    this.#config = config;
    this.#renderer.applyGraphics(config.graphics);

    const pack = getArtPack(config.maps.maps[mapId]?.artPack ?? mapId);
    const layout = generate(mapId, seed, config.world, pack.rooms);
    const world = buildWorld(layout, pack, config.world);

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

    this.#player = createPlayerState(
      layout.playerSpawn.position[0],
      layout.playerSpawn.position[2],
      layout.playerSpawn.yaw,
      config.player,
    );
    this.#escaped = false;
    this.#exitHold = 0;
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

  setDoor(doorId: string, open: boolean): void {
    const door = this.#world?.doors.find((candidate) => candidate.id === doorId);
    if (door) toggleDoor(door, open);
  }

  /* --- frame -------------------------------------------------------------- */

  update(dt: number, controlsEnabled: boolean): void {
    const world = this.#world;
    const player = this.#player;
    if (!world || !player) return;

    if (controlsEnabled) {
      const look = this.#input.consumeLook();
      applyLook(player, look.x, look.y, this.#config.player, this.#input.mouseSensitivity);
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

    this.#updateCamera(player);
    this.#updateInteraction(dt, controlsEnabled);

    updateDoors(world.doors, dt, this.#config.world.doors.openSeconds, this.#config.world.doors.closeSeconds);
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
    camera.position.set(player.x, eyeHeight(player, this.#config.player), player.z);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    // The interaction ray is cast during the sim step, but matrices are
    // otherwise only refreshed by render() afterwards - so without this the ray
    // would be built from last frame's camera transform.
    camera.updateMatrixWorld();
  }

  #updateInteraction(dt: number, controlsEnabled: boolean): void {
    const world = this.#world;
    const player = this.#player;
    if (!world || !player) return;

    const previous = this.#target;
    this.#target = controlsEnabled ? this.#findTarget(world) : null;

    // Compare the verb too, not just the door: opening a door changes the prompt
    // from "Open" to "Close" while you are still looking at the same door.
    if (this.#target?.door.id !== previous?.door.id || this.#target?.verbKey !== previous?.verbKey) {
      this.#hooks.onInteractTargetChange(this.#target);
      if (previous?.door.isExit && !this.#target?.door.isExit) {
        this.#exitHold = 0;
        this.#hooks.onExitProgress(0);
      }
    }

    const target = this.#target;
    if (!target) return;

    if (target.hold) {
      if (this.#input.isDown('interact')) {
        this.#exitHold += dt;
        this.#hooks.onExitProgress(Math.min(1, this.#exitHold / this.#config.world.exit.holdSeconds));
        if (this.#exitHold >= this.#config.world.exit.holdSeconds && !this.#escaped) {
          this.#escaped = true;
          this.#hooks.onEscaped();
        }
      } else if (this.#exitHold > 0) {
        this.#exitHold = 0;
        this.#hooks.onExitProgress(0);
      }
    } else if (this.#input.justPressed('interact')) {
      toggleDoor(target.door);
      this.#net.broadcast({ t: 'door', id: target.door.id, open: target.door.open });
    }
  }

  /**
   * Raycasts rather than doing a distance check, so you cannot open a door
   * through the wall next to it.
   */
  #findTarget(world: BuiltWorld): InteractTarget | null {
    const camera = this.#renderer.camera;
    this.#raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    this.#raycaster.far = this.#config.player.interaction.rayLength;

    const hits = this.#raycaster.intersectObjects(world.raycastTargets, true);
    const hit = hits[0];
    if (!hit) return null;

    const doorId = findDoorId(hit.object);
    if (!doorId) return null;

    const door = world.doors.find((candidate) => candidate.id === doorId);
    if (!door) return null;

    if (door.isExit) return { door, verbKey: 'hud.interact.escape', hold: true };
    return { door, verbKey: door.open ? 'hud.interact.close' : 'hud.interact.open', hold: false };
  }

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

function findDoorId(object: THREE.Object3D): string | null {
  let node: THREE.Object3D | null = object;
  while (node) {
    const id = node.userData['doorId'];
    if (typeof id === 'string') return id;
    node = node.parent;
  }
  return null;
}
