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
import { stream, type Rng } from '@/core/rng';
import type { EnemyArchetype, HealthState } from '@/config/types';
import { createPlayerState, applyLook, eyeHeight, stepPlayer, type PlayerState } from '@/entities/player';
import { applyHit, applyRevive, isDown, tickHealth } from '@/entities/health';
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
import { createEnemy, updateEnemy, type EnemyLocker, type EnemyState, type LockerEntry } from '@/ai/enemy';
import { footstepInterval, footstepKind, noiseSpec, NoiseBus, type NoiseKind } from '@/ai/noiseBus';
import type { PerceptionTarget } from '@/ai/perception';
import { RoomGraph } from '@/ai/roomGraph';
import type { Audio } from '@/audio/index';
import type { Input } from '@/input/index';
import type { EnemyTransform, Net } from '@/net/index';
import type { Renderer } from '@/render/Renderer';
import { heartbeatCloseness, type AlertLevel } from '@/render/feedback';
import { generate, type RunLayout } from '@/world/generation';
import { toggleDoor, unlockDoor, updateDoors, type Door } from '@/world/doors';
import { updateChests, updateLockers, type Locker } from '@/world/containers';
import { RunState } from '@/world/runState';
import { buildWorld, type BuiltWorld } from '@/world/worldBuilder';

/** What the look-ray is currently offering. `hold` targets fill a ring first. */
export interface InteractTarget {
  kind: 'door' | 'exit' | 'unlock' | 'locked' | 'chest' | 'lockerEnter' | 'lockerExit' | 'item' | 'revive';
  id: string;
  verbKey: string;
  /** Locale key of the item's name, for prompts that name what you are taking. */
  itemNameKey?: string;
  hold: boolean;
  holdSeconds: number;
}

/**
 * One line of the player roster. `pulse` is the last noise this player made:
 * `token` changes per noise so the HUD can replay its animation, and `heard` is
 * whether the enemy was close enough for it to matter.
 */
export interface RosterEntry {
  id: string;
  /** Placeholder until players have names of their own. */
  index: number;
  health: HealthState;
  self: boolean;
  pulse: { loudness: number; heard: boolean; token: number } | null;
}

export interface RunHooks {
  onInteractTargetChange(target: InteractTarget | null): void;
  onHoldProgress(progress: number): void;
  onHandsChange(hands: { left: string | null; right: string | null }): void;
  onEscaped(): void;
  onPlayerCountChange(count: number): void;
  onHealthChange(state: HealthState): void;
  onRosterChange(roster: RosterEntry[]): void;
  /** Everyone is on the floor. The run is over and it was not a win. */
  onWiped(): void;
}

interface RemotePlayer {
  object: THREE.Object3D;
  root: THREE.Object3D;
  target: { x: number; z: number; yaw: number; height: number; hiding: boolean; health: HealthState };
}

/** The unlock behaviour is the only item behaviour this slice implements. */
const KEY_ITEM = 'key';

export class Game {
  #config: Config;
  #renderer: Renderer;
  #input: Input;
  #net: Net;
  #audio: Audio;
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

  /* --- the hunter ---------------------------------------------------------- */
  #noise = new NoiseBus();
  /** Lockers climbed into this tick, local or remote. Cleared with the noise bus. */
  #lockerEntries: LockerEntry[] = [];
  #graph: RoomGraph | null = null;
  #doorsById = new Map<string, Door>();
  #enemy: EnemyState | null = null;
  #enemyArt: { object: THREE.Object3D; root: THREE.Object3D; setAlert?: (level: string) => void } | null = null;
  /** What clients interpolate toward; the host writes it from its own sim. */
  #enemyView: EnemyTransform = { x: 0, z: 0, yaw: 0, alert: 'calm' };
  #enemyAlert = '';
  /** Tracked separately from the art's, so a sting does not need art to exist. */
  #audioAlert = '';
  #enemyRng: Rng = stream(0, 'enemy');
  #enemyTimer = 0;
  #footstepTimer = 0;
  #run = new RunState();
  #over = false;

  /* --- roster -------------------------------------------------------------- */
  /** Stable per-peer numbering, so a teammate keeps their line across runs. */
  #playerIndex = new Map<string, number>();
  #pulses = new Map<string, { loudness: number; heard: boolean; token: number }>();
  #pulseToken = 0;

  /* --- audio --------------------------------------------------------------- */
  /** Scratch vectors for the listener orientation; presentation only. */
  #listenerForward = new THREE.Vector3();
  #listenerUp = new THREE.Vector3();

  constructor(config: Config, renderer: Renderer, input: Input, net: Net, audio: Audio, hooks: RunHooks) {
    this.#config = config;
    this.#renderer = renderer;
    this.#input = input;
    this.#net = net;
    this.#audio = audio;
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

  /** Read-only view of the hunter, for the dev handle and later a debug overlay. */
  get enemy(): EnemyState | null {
    return this.#enemy;
  }

  /** `slot` selects this player's spawn point within the shared start room. */
  start(mapId: string, seed: number, slot = 0): void {
    this.end();

    const config = configForMap(mapId);
    this.#config = config;
    this.#renderer.applyGraphics(config.graphics);

    const pack = getArtPack(config.maps.maps[mapId]?.artPack ?? mapId);
    const layout = generate(mapId, seed, config.world, pack.rooms, this.#archetype(config).spawn);
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
    this.#over = false;
    this.#resetHold();
    this.#hooks.onHandsChange({ left: null, right: null });
    this.#hooks.onPlayerCountChange(this.#remotes.size + 1);
    this.#hooks.onHealthChange('healthy');
    this.#pulses.clear();
    this.#pushRoster();

    // --- the hunter --------------------------------------------------------
    this.#graph = new RoomGraph(layout);
    this.#doorsById = new Map(world.doors.map((door) => [door.id, door]));
    this.#noise.clear();
    this.#footstepTimer = 0;
    this.#enemyRng = stream(seed, 'enemy');

    this.#run.clear();
    this.#run.add(this.#net.selfId);
    for (const id of this.#remotes.keys()) this.#run.add(id);

    const [ex, ez] = layout.enemySpawn.position;
    this.#enemy = createEnemy(ex, ez);
    this.#enemyView = { x: ex, z: ez, yaw: 0, alert: 'calm' };
    this.#enemyAlert = '';
    this.#audioAlert = '';
    this.#spawnEnemyArt();
    this.#renderer.feedback.reset();

    this.#audio.stopSustains();
    this.#audio.music.setScene('run');
  }

  end(): void {
    this.#audio.stopSustains();
    this.#audio.music.setScene('menu');
    if (this.#world) {
      this.#renderer.scene.remove(this.#world.root);
      this.#world.dispose();
    }
    for (const remote of this.#remotes.values()) this.#renderer.scene.remove(remote.object);
    this.#remotes.clear();
    this.#removeEnemyArt();
    this.#renderer.setRoomLights([]);
    this.#renderer.feedback.reset();
    this.#world = null;
    this.#layout = null;
    this.#player = null;
    this.#target = null;
    this.#hiding = null;
    this.#enemy = null;
    this.#graph = null;
    this.#doorsById.clear();
    this.#run.clear();
  }

  /** The archetype this map's enemy uses. One for now; `maps.json` picks later. */
  #archetype(config: Config = this.#config): EnemyArchetype {
    const { enemy } = config;
    const archetype = enemy.archetypes[enemy.defaultArchetype];
    if (!archetype) throw new Error(`config: no enemy archetype "${enemy.defaultArchetype}"`);
    return archetype;
  }

  #spawnEnemyArt(): void {
    const world = this.#world;
    const layout = this.#layout;
    if (!world || !layout || !this.#dims) return;

    const art = resolveArt(this.#archetype().artId)({
      materials: world.materials,
      rng: stream(layout.seed, 'enemyArt'),
      dims: this.#dims,
    });

    this.#renderer.scene.add(art.object);
    this.#enemyArt = {
      object: art.object,
      root: art.parts['root'] ?? art.object,
      setAlert: art.api?.setAlert?.bind(art.api),
    };
  }

  #removeEnemyArt(): void {
    if (!this.#enemyArt) return;
    this.#renderer.scene.remove(this.#enemyArt.object);
    this.#enemyArt = null;
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
    // Tagged so the look-ray can offer "revive" on a downed teammate.
    art.object.traverse((child) => {
      child.userData['playerId'] = id;
    });

    this.#renderer.scene.add(art.object);
    this.#remotes.set(id, {
      object: art.object,
      root,
      target: { x: 0, z: 0, yaw: 0, height: 1.8, hiding: false, health: 'healthy' },
    });
    this.#run.add(id);
    this.#hooks.onPlayerCountChange(this.#remotes.size + 1);
    this.#pushRoster();
  }

  removeRemote(id: string): void {
    const remote = this.#remotes.get(id);
    if (!remote) return;
    this.#renderer.scene.remove(remote.object);
    this.#remotes.delete(id);
    this.#run.remove(id);
    this.#hooks.onPlayerCountChange(this.#remotes.size + 1);
    this.#pushRoster();
  }

  moveRemote(id: string, transform: RemotePlayer['target']): void {
    const remote = this.#remotes.get(id);
    if (!remote) {
      this.addRemote(id);
      return;
    }

    // A remote who has just started hiding has moved onto the locker they took,
    // so the host can offer the enemy the same "I watched you do that" chance.
    // The sight test uses their PREVIOUS position - where they were standing.
    if (transform.hiding && !remote.target.hiding) {
      const locker = this.#world?.lockers.find(
        (candidate) => Math.hypot(candidate.x - transform.x, candidate.z - transform.z) < 0.8,
      );
      if (locker) {
        this.#lockerEntries.push({ lockerId: locker.id, playerId: id, x: remote.target.x, z: remote.target.z });
      }
    }

    const healthChanged = remote.target.health !== transform.health;
    remote.target = transform;
    this.#run.setHealth(id, transform.health);
    if (healthChanged) this.#pushRoster();
  }

  /* --- replicated world events -------------------------------------------- */

  setDoor(doorId: string, open: boolean): void {
    const door = this.#doorById(doorId);
    if (!door) return;
    const was = door.open;
    toggleDoor(door, open);
    if (door.open !== was) this.#playDoor(door);
  }

  setDoorUnlocked(doorId: string): void {
    const door = this.#doorById(doorId);
    if (!door) return;
    unlockDoor(door);
    this.#audio.play('door.unlock', { at: { x: door.x, z: door.z } });
  }

  /**
   * Doors sound from their state, not from the noise bus, so a door the hunter
   * opens two rooms away is heard by every peer and not just the host.
   */
  #playDoor(door: Door): void {
    this.#audio.play(door.open ? 'door.open' : 'door.close', { at: { x: door.x, z: door.z } });
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

  /** A peer made a noise. Only the host's enemy listens, but every peer collects. */
  addNoise(sourceId: string, kind: NoiseKind, x: number, z: number): void {
    const spec = noiseSpec(this.#config.player, kind);
    this.#noise.emit({ x, z, radius: spec.radius, loudness: spec.loudness, kind, sourceId });

    // What the enemy perceives and what players hear are separate systems, but
    // a replicated noise event is the only signal a peer gets about someone
    // else moving - so it is where a teammate's footsteps become audible.
    this.#playNoise(sourceId, kind, x, z);

    // Silent by config is silent on the HUD too - a ring for a noise nothing can
    // ever hear would be a lie.
    if (spec.loudness <= 0) return;
    this.#pulses.set(sourceId, {
      loudness: Math.min(1, spec.loudness),
      heard: this.#enemyCanHear(spec.loudness, spec.radius, x, z),
      token: ++this.#pulseToken,
    });
    this.#pushRoster();
  }

  #playNoise(sourceId: string, kind: NoiseKind, x: number, z: number): void {
    const { cues } = this.#config.audio;
    const soundId = cues.noiseSounds[kind];
    if (!soundId) return;

    // Your own footsteps belong in the middle of your head. Panning them round
    // it as you turn is the fastest way to make a first-person game feel wrong.
    const flat = sourceId === this.#net.selfId && cues.selfFlat.kinds.includes(kind);
    this.#audio.play(soundId, flat ? {} : { at: { x, z } });
  }

  /**
   * The same test the enemy's own hearing makes, run locally so every peer can
   * colour the roster. Clients use the last enemy snapshot, which is close
   * enough for a warning light.
   */
  #enemyCanHear(loudness: number, radius: number, x: number, z: number): boolean {
    if (!this.#enemy && this.#net.role === 'offline') return false;
    const { hearing } = this.#archetype();
    if (loudness * hearing.hearingMultiplier < hearing.threshold) return false;
    return Math.hypot(this.#enemyView.x - x, this.#enemyView.z - z) <= radius * hearing.rangeMultiplier;
  }

  #pushRoster(): void {
    const entry = (id: string, health: HealthState, self: boolean): RosterEntry => {
      let index = this.#playerIndex.get(id);
      if (index === undefined) {
        // Slot 1 is always yours, whichever order peers turned up in.
        index = self ? 1 : Math.max(2, this.#playerIndex.size + 1);
        this.#playerIndex.set(id, index);
      }
      return { id, index, health, self, pulse: this.#pulses.get(id) ?? null };
    };

    const roster = [entry(this.#net.selfId, this.#player?.health.state ?? 'healthy', true)];
    for (const [id, remote] of this.#remotes) roster.push(entry(id, remote.target.health, false));
    roster.sort((a, b) => a.index - b.index);

    this.#hooks.onRosterChange(roster);
  }

  /** Host -> client enemy transform. Clients never simulate the enemy. */
  setEnemyTransform(transform: EnemyTransform): void {
    this.#enemyView = transform;
  }

  /** The enemy caught the local player. */
  takeHit(): void {
    const player = this.#player;
    if (!player) return;

    const { attack } = this.#archetype();
    const state = applyHit(player.health, attack, this.#config.player);
    if (!state) return;

    // Being caught in a locker throws you out of it - hiding is not a state you
    // get to keep once it has found you.
    if (this.#hiding) {
      this.#hiding.locker.occupied = false;
      this.#hiding.active = false;
    }

    this.#renderer.feedback.flash();
    // The host plays this from the attack itself; a client only learns of it here.
    if (this.#net.role === 'client') this.#audio.play('enemy.attack', { at: this.#enemyPosition() });
    this.#announceHealth(state);
  }

  setRemoteHealth(id: string, state: HealthState): void {
    const remote = this.#remotes.get(id);
    if (remote) {
      if (remote.target.health !== state) {
        this.#playHealth(state, { x: remote.target.x, z: remote.target.z });
      }
      remote.target.health = state;
    }
    this.#run.setHealth(id, state);
    this.#pushRoster();
  }

  /** Positionless for your own body, positional for a teammate's. */
  #playHealth(state: HealthState, at?: { x: number; z: number }): void {
    const options = at ? { at } : {};
    if (state === 'injured') this.#audio.play('player.injured', options);
    else if (isDown(state)) this.#audio.play('player.downed', options);
  }

  /** Someone finished a revive hold on the local player. */
  reviveLocal(): void {
    const player = this.#player;
    if (!player || !isDown(player.health.state)) return;
    this.#announceHealth(applyRevive(player.health, this.#config.player));
  }

  markEscaped(id: string): void {
    this.#run.setEscaped(id);
  }

  endWiped(): void {
    if (this.#over) return;
    this.#over = true;
    this.#audio.stopSustains();
    this.#audio.play('run.wiped');
    this.#hooks.onWiped();
  }

  #announceHealth(state: HealthState): void {
    this.#playHealth(state);
    this.#run.setHealth(this.#net.selfId, state);
    this.#hooks.onHealthChange(state);
    this.#pushRoster();
    this.#net.broadcast({ t: 'health', id: this.#net.selfId, state });
  }

  #emitNoise(kind: NoiseKind, x: number, z: number): void {
    this.addNoise(this.#net.selfId, kind, x, z);
    this.#net.broadcast({ t: 'noise', id: this.#net.selfId, kind, x, z });
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

    tickHealth(player.health, dt);
    this.#updateCamera(player);
    this.#updateInteraction(dt, controlsEnabled);
    if (controlsEnabled) this.#updateHands(player);
    this.#updateFootsteps(dt, player);

    const { doors, containers } = this.#config.world;
    updateDoors(world.doors, dt, doors.openSeconds, doors.closeSeconds);
    updateChests(world.chests, dt, containers.chestOpenHoldSeconds);
    updateLockers(world.lockers, dt, containers.lockerEnterSeconds, containers.lockerExitSeconds);
    if (this.#hiding && !this.#hiding.active && this.#hiding.locker.progress === 0) this.#hiding = null;

    this.#updateEnemy(dt, player);
    // One tick, one chance to be heard or seen. Nothing here ages.
    this.#noise.clear();
    this.#lockerEntries.length = 0;

    world.updateVisibility(
      player.x,
      player.z,
      this.#config.graphics.renderDistanceRooms * this.#config.world.grid.cellSize,
    );
    this.#renderer.updateLights(dt, player.x, player.z);
    this.#interpolateRemotes(dt);
    this.#sendTransform(dt, player);
  }

  /* --- noise --------------------------------------------------------------- */

  /**
   * Footsteps are the noise you make without meaning to. Sprinting is the
   * loudest thing a player does short of opening a chest.
   */
  #updateFootsteps(dt: number, player: PlayerState): void {
    const moving = Math.hypot(player.velocityX, player.velocityZ) > 0.3;
    if (!moving || this.#hiding?.active) {
      this.#footstepTimer = 0;
      return;
    }

    this.#footstepTimer -= dt;
    if (this.#footstepTimer > 0) return;

    this.#footstepTimer = footstepInterval(this.#config.player, player.sprinting, player.crouching);

    // Injury costs speed, not stealth: an injured player is exactly as loud as a
    // healthy one, so crouching is still worth doing when you are hurt.
    this.#emitNoise(footstepKind(player.sprinting, player.crouching), player.x, player.z);
  }

  /* --- the hunter ----------------------------------------------------------- */

  #updateEnemy(dt: number, player: PlayerState): void {
    const world = this.#world;
    const enemy = this.#enemy;
    const graph = this.#graph;
    if (!world || !enemy || !graph) return;

    if (this.#isHost) {
      updateEnemy(enemy, dt, {
        targets: this.#perceptionTargets(player),
        noise: this.#noise.events,
        lockerEntries: this.#lockerEntries,
        graph,
        doors: this.#doorsById,
        lockers: this.#enemyLockers(player),
        collision: world.collision,
        config: this.#archetype(),
        rng: this.#enemyRng,
        openDoor: (doorId) => this.#enemyOpensDoor(doorId),
        attack: (targetId) => this.#enemyAttacks(targetId),
        searchLocker: (lockerId) => this.#enemySearchesLocker(lockerId),
      });

      this.#enemyView = { x: enemy.x, z: enemy.z, yaw: enemy.yaw, alert: enemy.alert };
      this.#sendEnemy(dt);
      this.#checkRunOver();
    }

    this.#drawEnemy(dt);
    this.#updateFeedback(dt, player);
  }

  /** Offline counts as host: there is nobody else to run the simulation. */
  get #isHost(): boolean {
    return this.#net.role !== 'client';
  }

  #perceptionTargets(player: PlayerState): PerceptionTarget[] {
    const targets: PerceptionTarget[] = [
      {
        id: this.#net.selfId,
        x: player.x,
        z: player.z,
        crouching: player.crouching,
        hidden: this.#hiding?.active === true,
        downed: isDown(player.health.state) || this.#escaped,
        inDarkness: this.#inDarkness(player.x, player.z),
      },
    ];

    for (const [id, remote] of this.#remotes) {
      targets.push({
        id,
        x: remote.target.x,
        z: remote.target.z,
        crouching: remote.target.height < this.#config.player.body.standHeight - 0.2,
        hidden: remote.target.hiding,
        downed: isDown(remote.target.health),
        inDarkness: this.#inDarkness(remote.target.x, remote.target.z),
      });
    }
    return targets;
  }

  /**
   * Rooms light themselves and players carry no light, so "in darkness" is
   * simply: no room lamp near enough to be standing in.
   */
  #inDarkness(x: number, z: number): boolean {
    const world = this.#world;
    if (!world) return false;
    const reach = this.#config.world.grid.cellSize * 0.6;
    return !world.lights.some((entry) => Math.hypot(entry.x - x, entry.z - z) <= reach);
  }

  /** Lockers, with whoever is hiding in each one. Hiding beats sight, not a search. */
  #enemyLockers(player: PlayerState): EnemyLocker[] {
    return (this.#world?.lockers ?? []).map((locker) => {
      let occupantId: string | null = null;
      if (this.#hiding?.active && this.#hiding.locker.id === locker.id) occupantId = this.#net.selfId;
      else {
        for (const [id, remote] of this.#remotes) {
          if (!remote.target.hiding) continue;
          if (Math.hypot(remote.target.x - locker.x, remote.target.z - locker.z) < 0.8) occupantId = id;
        }
      }
      return { id: locker.id, x: locker.x, z: locker.z, occupantId };
    });
  }

  #enemyOpensDoor(doorId: string): void {
    const door = this.#doorsById.get(doorId);
    if (!door || door.open) return;
    toggleDoor(door, true);
    this.#playDoor(door);
    this.#net.broadcast({ t: 'door', id: door.id, open: true });
  }

  #enemySearchesLocker(lockerId: string): void {
    const locker = this.#world?.lockers.find((candidate) => candidate.id === lockerId);
    if (!locker) return;
    // Throwing the doors open is the same animation as a player leaving it.
    locker.progress = 1;
    if (this.#hiding?.active && this.#hiding.locker.id === lockerId) {
      this.#hiding.locker.occupied = false;
      this.#hiding.active = false;
    }
  }

  #enemyAttacks(targetId: string): void {
    this.#audio.play('enemy.attack', { at: this.#enemyPosition() });
    if (targetId === this.#net.selfId) {
      this.takeHit();
      return;
    }
    // The victim owns their own health ladder and echoes the result back.
    this.#net.broadcast({ t: 'hit', id: targetId });
  }

  #checkRunOver(): void {
    if (this.#over || this.#run.evaluate() !== 'wiped') return;
    this.#net.broadcast({ t: 'wiped' });
    this.endWiped();
  }

  #sendEnemy(dt: number): void {
    if (this.#net.role === 'offline') return;

    this.#enemyTimer -= dt;
    if (this.#enemyTimer > 0) return;
    this.#enemyTimer = 1 / this.#config.net.simulation.snapshotRateHz;
    this.#net.broadcast({ t: 'enemy', ...this.#enemyView });
  }

  /** Presentation only: the sim never reads back from the art. */
  #drawEnemy(dt: number): void {
    const art = this.#enemyArt;
    if (!art) return;

    // The host owns the sim, so it draws exactly where the enemy is; clients
    // only ever have snapshots, so they interpolate toward the last one.
    const blend = this.#isHost ? 1 : Math.min(1, dt * 12);
    art.object.position.x += (this.#enemyView.x - art.object.position.x) * blend;
    art.object.position.z += (this.#enemyView.z - art.object.position.z) * blend;

    let delta = this.#enemyView.yaw - art.root.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    art.root.rotation.y += delta * blend;

    if (this.#enemyAlert !== this.#enemyView.alert) {
      this.#enemyAlert = this.#enemyView.alert;
      art.setAlert?.(this.#enemyAlert);
    }
  }

  #updateFeedback(dt: number, player: PlayerState): void {
    const distance = Math.hypot(this.#enemyView.x - player.x, this.#enemyView.z - player.z);
    this.#renderer.feedback.update(dt, {
      alert: this.#enemyView.alert as AlertLevel,
      enemyDistance: distance,
      injured: player.health.state === 'injured',
      downed: isDown(player.health.state),
    });
    this.#updateAudio(distance);
  }

  /** Where the hunter actually is on the host, where it was last seen on a client. */
  #enemyPosition(): { x: number; z: number } {
    const enemy = this.#enemy;
    if (enemy && this.#isHost) return { x: enemy.x, z: enemy.z };
    return { x: this.#enemyView.x, z: this.#enemyView.z };
  }

  /**
   * The continuous half of the audio: the heartbeat, the drone the hunter drags
   * around with it, and where the score sits. All of it rides the same
   * proximity curve as the screen feedback, so they never disagree.
   */
  #updateAudio(enemyDistance: number): void {
    const { cues } = this.#config.audio;
    // Out of the run is out of danger: the hunter stops being your problem the
    // moment you are through the door, and the mix should say so at once.
    const over = this.#escaped || this.#over;
    const closeness = over ? 0 : heartbeatCloseness(this.#config.player, enemyDistance);
    const alert = over ? 'calm' : this.#enemyView.alert;

    this.#audio.sustain('heartbeat', 'player.heartbeat', {
      on: closeness > 0,
      level: closeness,
      rate: 1 + closeness * (cues.heartbeatMaxRate - 1),
    });

    this.#audio.sustain('enemy', 'enemy.idle.loop', {
      on: !over && this.#enemyArt !== null,
      at: this.#enemyPosition(),
    });

    // Only on the way up. It losing interest is not a moment worth a cue.
    if (alert !== this.#audioAlert) {
      const levels = this.#archetype().alert.levels;
      if (this.#audioAlert && levels.indexOf(alert) > levels.indexOf(this.#audioAlert)) {
        this.#audio.play(cues.alertStings[alert] ?? '');
      }
      this.#audioAlert = alert;
    }

    const music = this.#audio.music;
    music.setIntensity(Math.max(music.intensityForAlert(alert), closeness * music.proximityWeight));
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

    // The ears follow the camera, which is why hiding in a locker moves them too.
    camera.getWorldDirection(this.#listenerForward);
    this.#listenerUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    this.#audio.setListener(camera.position, this.#listenerForward, this.#listenerUp);
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
    if (!target) {
      this.#updateHoldLoop(null);
      return;
    }

    if (!target.hold) {
      this.#updateHoldLoop(null);
      if (this.#input.justPressed('interact')) this.#complete(target, null);
      return;
    }

    const hand = this.#holdingHand(target);
    if (hand === false) {
      if (this.#hold > 0) this.#resetHold();
      this.#updateHoldLoop(null);
      return;
    }

    this.#hold += dt;
    this.#hooks.onHoldProgress(Math.min(1, this.#hold / target.holdSeconds));
    this.#updateHoldLoop(target);
    if (this.#hold >= target.holdSeconds && !this.#holdDone) {
      this.#holdDone = true;
      this.#complete(target, hand);
    }
  }

  /**
   * The sound of a hold in progress - a chest being forced, a body being worked
   * on, the exit charging - rising in pitch as the ring fills.
   */
  #updateHoldLoop(target: InteractTarget | null): void {
    const { cues } = this.#config.audio;
    const soundId = target && !this.#holdDone ? (cues.holdLoops[target.kind] ?? null) : null;
    if (!target || !soundId) {
      this.#audio.sustain('hold', null, { on: false });
      return;
    }

    const progress = Math.min(1, this.#hold / Math.max(0.01, target.holdSeconds));
    const at = this.#targetPosition(target);
    this.#audio.sustain('hold', soundId, {
      on: true,
      ...(at ? { at } : {}),
      rate: 1 + progress * (cues.holdLoopEndRate - 1),
    });
  }

  /** World position of whatever the look-ray is offering, where it has one. */
  #targetPosition(target: InteractTarget): { x: number; z: number } | null {
    const world = this.#world;
    if (!world) return null;

    switch (target.kind) {
      case 'chest': {
        const chest = world.chests.find((candidate) => candidate.id === target.id);
        return chest ? { x: chest.x, z: chest.z } : null;
      }
      case 'revive': {
        const remote = this.#remotes.get(target.id);
        return remote ? { x: remote.target.x, z: remote.target.z } : null;
      }
      default: {
        const door = this.#doorById(target.id);
        return door ? { x: door.x, z: door.z } : null;
      }
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
        this.#playDoor(door);
        this.#net.broadcast({ t: 'door', id: door.id, open: door.open });
        // Closing a door behind you is a slam - louder than opening one, and
        // sometimes worth it anyway.
        this.#emitNoise(door.open ? 'doorOpen' : 'doorSlam', door.x, door.z);
        break;
      }
      case 'unlock': {
        const door = this.#doorById(target.id);
        const used = hand ?? this.#keyHand();
        if (!door || !used) break;
        unlockDoor(door);
        this.#audio.play('door.unlock', { at: { x: door.x, z: door.z } });
        dropFrom(this.#inventory, used);
        this.#hooks.onHandsChange({ ...this.#inventory });
        this.#net.broadcast({ t: 'unlock', id: door.id });
        break;
      }
      case 'exit':
        if (!this.#escaped) {
          this.#escaped = true;
          this.#run.setEscaped(this.#net.selfId);
          this.#audio.stopSustains();
          this.#audio.play('exit.escaped');
          this.#net.broadcast({ t: 'escaped', id: this.#net.selfId });
          this.#hooks.onEscaped();
        }
        break;
      case 'chest': {
        const chest = world.chests.find((candidate) => candidate.id === target.id);
        this.openChest(target.id);
        this.#net.broadcast({ t: 'chest', id: target.id });
        // The loudest thing in the game, and where most of the keys are.
        if (chest) this.#emitNoise('chestOpen', chest.x, chest.z);
        break;
      }
      case 'item':
        this.#pickUp(target.id);
        break;
      case 'revive':
        this.#net.broadcast({ t: 'revive', id: target.id });
        break;
      case 'lockerEnter': {
        const locker = world.lockers.find((candidate) => candidate.id === target.id);
        if (!locker || locker.occupied) break;
        locker.occupied = true;
        this.#hiding = { locker, active: true };
        // Recorded before the move, so it is where the enemy would have seen you.
        this.#lockerEntries.push({ lockerId: locker.id, playerId: this.#net.selfId, x: player.x, z: player.z });
        player.x = locker.x;
        player.z = locker.z;
        player.velocityX = 0;
        player.velocityZ = 0;
        this.#emitNoise('lockerEnter', locker.x, locker.z);
        break;
      }
      case 'lockerExit': {
        const hiding = this.#hiding;
        if (!hiding) break;
        hiding.locker.occupied = false;
        hiding.active = false;
        this.#audio.play('locker.exit', { at: { x: hiding.locker.x, z: hiding.locker.z } });
        // Step out through the front face, which is -Z before the locker's yaw.
        const yaw = hiding.locker.yaw;
        player.x = hiding.locker.x - Math.sin(yaw) * 1.1;
        player.z = hiding.locker.z - Math.cos(yaw) * 1.1;
        break;
      }
      case 'locked': {
        const door = this.#doorById(target.id);
        if (door) this.#audio.play('door.locked', { at: { x: door.x, z: door.z } });
        break;
      }
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
    this.#audio.play('item.pickup');
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
    this.#emitNoise('itemDrop', x, z);
  }

  /**
   * Raycasts rather than doing a distance check, so you cannot open a door
   * through the wall next to it.
   */
  #findTarget(world: BuiltWorld): InteractTarget | null {
    // On the floor you can do nothing but wait for someone to come back for you.
    if (this.#player && isDown(this.#player.health.state)) return null;

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

    // Teammates are in the scene rather than the world, so they join the ray here.
    const candidates = [...world.raycastTargets, ...[...this.#remotes.values()].map((remote) => remote.object)];
    const hit = this.#raycaster.intersectObjects(candidates, true)[0];
    if (!hit) return null;

    const tagged = findTag(hit.object);
    if (!tagged) return null;

    switch (tagged.key) {
      case 'playerId': {
        const remote = this.#remotes.get(tagged.value);
        if (!remote || remote.target.health !== 'downed') return null;
        return {
          kind: 'revive',
          id: tagged.value,
          verbKey: 'hud.interact.revive',
          itemNameKey: 'hud.player.teammate',
          hold: true,
          holdSeconds: this.#config.player.health.reviveHoldSeconds,
        };
      }
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

      // Downed teammates are on the floor - the pose IS the "come and get me".
      const down = isDown(remote.target.health) ? Math.PI / 2 : 0;
      remote.root.rotation.x += (down - remote.root.rotation.x) * blend;
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
      // The host's enemy needs to know who is hidden and who is already down.
      hiding: this.#hiding?.active === true,
      health: player.health.state,
    });
  }
}

/** Walks up to the nearest ancestor carrying one of the interaction tags. */
function findTag(object: THREE.Object3D): { key: string; value: string } | null {
  const keys = ['worldItemId', 'chestId', 'lockerId', 'doorId', 'playerId'];
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
