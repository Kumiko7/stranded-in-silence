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
import { rangeInt, stream, type Rng } from '@/core/rng';
import type { EnemyArchetype, HealthState, ItemDef } from '@/config/types';
import { createPlayerState, applyLook, eyeHeight, stepPlayer, type PlayerState } from '@/entities/player';
import { applyHeal, applyHit, applyRevive, isDown, tickHealth } from '@/entities/health';
import {
  createInventory,
  dropFrom,
  handHolding,
  itemDef,
  itemParam,
  takeItem,
  HANDS,
  type Hand,
  type Inventory,
} from '@/entities/items';
import {
  createProjectile,
  sampleArc,
  stepProjectile,
  throwVelocity,
  type Projectile,
  type ProjectileBody,
  type ProjectileWorld,
} from '@/entities/projectile';
import { createEnemy, updateEnemy, type EnemyLocker, type EnemyState, type LockerEntry } from '@/ai/enemy';
import { footstepInterval, footstepKind, noiseSpec, NoiseBus, type NoiseKind } from '@/ai/noiseBus';
import type { PerceptionTarget } from '@/ai/perception';
import { RoomGraph } from '@/ai/roomGraph';
import type { Audio } from '@/audio/index';
import type { Input } from '@/input/index';
import type { EnemyTransform, Net } from '@/net/index';
import type { Renderer } from '@/render/Renderer';
import { heartbeatCloseness, type AlertLevel } from '@/render/feedback';
import type { VoiceChat } from '@/voice/index';
import { generate, type RunLayout } from '@/world/generation';
import { isBarricaded, setBarricade, toggleDoor, unlockDoor, updateDoors, type Door } from '@/world/doors';
import { updateChests, updateLockers, type Locker } from '@/world/containers';
import { RunEffects, type Effect } from '@/world/effects';
import { RunState } from '@/world/runState';
import { WallGrid } from '@/world/wallGrid';
import { buildWorld, type BuiltDecor, type BuiltWorld } from '@/world/worldBuilder';

/** What the look-ray is currently offering. `hold` targets fill a ring first. */
export interface InteractTarget {
  kind:
    | 'door'
    | 'exit'
    | 'unlock'
    | 'locked'
    | 'forceOpen'
    | 'chest'
    | 'lockerEnter'
    | 'lockerExit'
    | 'item'
    | 'revive';
  id: string;
  verbKey: string;
  /** Locale key of the item's name, for prompts that name what you are taking. */
  itemNameKey?: string;
  hold: boolean;
  holdSeconds: number;
}

/**
 * What the item in a hand can do right now: the second prompt on the HUD, keyed
 * to LMB or RMB rather than to E.
 */
export interface UseView {
  verbKey: string;
  /** Locale key of whatever the verb names - the item, or a teammate. */
  itemNameKey: string | null;
  /** The player's actual binding for the key the hint line is about, e.g. "LMB". */
  keyLabel: string;
  /**
   * Locale key of the hint under the verb, taking `{key}`. Empty means show the
   * binding on its own - "LMB" says everything a throwable in hand needs to.
   */
  hintKey: string;
  /** Whether it fills a ring (medicine, barricade) or is a throw being aimed. */
  hold: boolean;
  progress: number;
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
  /** What the hand buttons are offering, or null when they are offering nothing. */
  onUseChange(use: UseView | null): void;
  /** The shared run purse changed. It only becomes real money if you get out. */
  onCoinsChange(coins: number): void;
  /** `coins` is the purse this player is walking out with. */
  onEscaped(coins: number): void;
  onPlayerCountChange(count: number): void;
  onHealthChange(state: HealthState): void;
  onRosterChange(roster: RosterEntry[]): void;
  /** Everyone is on the floor. The run is over and it was not a win. */
  onWiped(): void;
}

interface RemotePlayer {
  object: THREE.Object3D;
  root: THREE.Object3D;
  /** The body clones its material per player, so it has to be freed per player. */
  dispose?(): void;
  setColour(hex: string): void;
  target: { x: number; z: number; yaw: number; height: number; hiding: boolean; health: HealthState };
}

/** The one item id logic names directly: E on a locked door has to find it. */
const KEY_ITEM = 'key';

/** Decor id of the aim arc. There is only ever one, and it is the local player's. */
const ARC_ID = 'aim:arc';

/** Hand button -> hand, in the order the two are polled. */
const USE_ACTIONS: readonly (readonly [string, Hand])[] = [
  ['useLeft', 'left'],
  ['useRight', 'right'],
];

/** A hold in progress on the item in one hand. */
interface ItemHold {
  hand: Hand;
  itemId: string;
  def: ItemDef;
  /** What it will be used on: a peer id for a heal, a door id for a barricade. */
  targetId: string | null;
  verbKey: string;
  nameKey: string | null;
  seconds: number;
  elapsed: number;
}

export class Game {
  #config: Config;
  #renderer: Renderer;
  #input: Input;
  #net: Net;
  #audio: Audio;
  #voice: VoiceChat;
  #hooks: RunHooks;

  #world: BuiltWorld | null = null;
  #layout: RunLayout | null = null;
  #player: PlayerState | null = null;
  #inventory: Inventory = createInventory();
  #remotes = new Map<string, RemotePlayer>();

  #raycaster = new THREE.Raycaster();
  /** What the look-ray hit this tick. Both E and the hand buttons read it. */
  #look: { key: string; value: string } | null = null;
  #target: InteractTarget | null = null;
  #hold = 0;
  #holdDone = false;
  #hiding: { locker: Locker; active: boolean } | null = null;
  #escaped = false;
  #moveTimer = 0;
  #dropCount = 0;
  #dims: RoomDims | null = null;

  /* --- items in hand ------------------------------------------------------- */
  /** Where a throw is allowed to stop. Walls and doors only - never furniture. */
  #walls: WallGrid | null = null;
  /** The hand currently drawing an aim arc, if any. */
  #aim: { hand: Hand; itemId: string; def: ItemDef } | null = null;
  #arc: BuiltDecor | null = null;
  #itemHold: ItemHold | null = null;
  #useSignature = '';
  /** Seconds the local player is frozen by a flare going off in their face. */
  #stunFor = 0;
  #projectiles: Projectile[] = [];
  #projectileArt = new Map<string, THREE.Object3D>();
  #throwCount = 0;
  /** Tar slicks, ringing clocks and flare after-images. Never replicated. */
  #effects = new RunEffects();
  #effectArt = new Map<string, BuiltDecor>();
  /** The shared purse. Only banked by a player who actually gets out. */
  #coins = 0;

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
  /** Speaking re-emits on this interval; noise events only live one tick. */
  #voiceNoiseTimer = 0;
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

  constructor(
    config: Config,
    renderer: Renderer,
    input: Input,
    net: Net,
    audio: Audio,
    voice: VoiceChat,
    hooks: RunHooks,
  ) {
    this.#config = config;
    this.#renderer = renderer;
    this.#input = input;
    this.#net = net;
    this.#audio = audio;
    this.#voice = voice;
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
    this.#clearItemState();
    this.#walls = new WallGrid(layout);
    this.#coins = 0;
    this.#hooks.onCoinsChange(0);
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

    // Voice is NOT started or stopped here. It follows the session - lobby and
    // run alike - so a conversation survives the load into a map rather than
    // being cut off at exactly the moment people are agreeing on a plan. Its
    // lifecycle is owned by the boot sequence in `src/main.tsx`.
    this.#voiceNoiseTimer = 0;
  }

  end(): void {
    this.#audio.stopSustains();
    this.#audio.music.setScene('menu');
    this.#clearItemState();
    if (this.#world) {
      this.#renderer.scene.remove(this.#world.root);
      this.#world.dispose();
    }
    for (const remote of this.#remotes.values()) this.#disposeRemote(remote);
    this.#remotes.clear();
    this.#removeEnemyArt();
    this.#renderer.setRoomLights([]);
    this.#renderer.feedback.reset();
    this.#world = null;
    this.#layout = null;
    this.#walls = null;
    this.#player = null;
    this.#target = null;
    this.#look = null;
    this.#hiding = null;
    this.#enemy = null;
    this.#graph = null;
    this.#doorsById.clear();
    this.#run.clear();
  }

  /**
   * Everything a thrown item put into the world. The art lives on `world.root`
   * or in the scene, so this has to run BEFORE the world is torn down.
   */
  #clearItemState(): void {
    for (const effect of this.#effects.all) this.#audio.sustain(`effect:${effect.id}`, null, { on: false });
    for (const id of this.#effectArt.keys()) this.#world?.removeDecor(id);
    for (const id of this.#projectileArt.keys()) this.#world?.removeDecor(id);
    this.#effectArt.clear();
    this.#projectileArt.clear();
    this.#projectiles.length = 0;
    this.#effects.clear();

    this.#world?.removeDecor(ARC_ID);
    this.#arc = null;
    this.#aim = null;
    this.#itemHold = null;
    this.#stunFor = 0;
    this.#pushUse(null);
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
    const remote: RemotePlayer = {
      object: art.object,
      root,
      ...(art.dispose ? { dispose: art.dispose.bind(art) } : {}),
      setColour: art.api?.setColour?.bind(art.api) ?? ((): void => {}),
      target: { x: 0, z: 0, yaw: 0, height: 1.8, hiding: false, health: 'healthy' },
    };
    remote.setColour(this.#colourHex(this.#net.cosmeticOf(id)));
    this.#remotes.set(id, remote);
    this.#run.add(id);
    this.#hooks.onPlayerCountChange(this.#remotes.size + 1);
    this.#pushRoster();
  }

  /** A teammate changed clothes in the lobby, or turned up already dressed. */
  setRemoteColour(id: string, colourId: string): void {
    this.#remotes.get(id)?.setColour(this.#colourHex(colourId));
  }

  #colourHex(colourId: string | null): string {
    const { colours, defaultColourId } = this.#config.player.customisation;
    const wanted = colourId ?? defaultColourId;
    return (colours.find((entry) => entry.id === wanted) ?? colours[0])?.hex ?? '#6f7690';
  }

  #disposeRemote(remote: RemotePlayer): void {
    this.#renderer.scene.remove(remote.object);
    remote.dispose?.();
  }

  removeRemote(id: string): void {
    const remote = this.#remotes.get(id);
    if (!remote) return;
    this.#disposeRemote(remote);
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
    this.#emitNoiseFrom(this.#net.selfId, kind, x, z);
  }

  /**
   * A noise credited to somebody else - a clock one of them threw, still
   * ringing. Emitted by the host only, because every peer is simulating that
   * clock and four copies of one noise is four times the volume.
   */
  #emitNoiseFrom(sourceId: string, kind: NoiseKind, x: number, z: number): void {
    this.addNoise(sourceId, kind, x, z);
    this.#net.broadcast({ t: 'noise', id: sourceId, kind, x, z });
  }

  /* --- frame -------------------------------------------------------------- */

  update(dt: number, controlsEnabled: boolean): void {
    const world = this.#world;
    const player = this.#player;
    if (!world || !player) return;

    // A flare in the face takes the controls away, not the camera: you are stood
    // there, blind, listening to something decide what to do about you.
    this.#stunFor = Math.max(0, this.#stunFor - dt);
    const active = controlsEnabled && this.#stunFor <= 0;

    if (active) {
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
          this.#effects.slowAt(player.x, player.z),
        );
      }
    }

    tickHealth(player.health, dt);
    this.#updateCamera(player);
    // One ray a tick, read by both E and the hand buttons.
    this.#look = active ? this.#lookTag(world) : null;
    this.#updateInteraction(dt, active);
    this.#updateItems(dt, player, active);
    this.#updateFootsteps(dt, player);
    this.#updateVoice(dt, player);

    const { doors, containers } = this.#config.world;
    updateDoors(world.doors, dt, doors.openSeconds, doors.closeSeconds);
    updateChests(world.chests, dt, containers.chestOpenHoldSeconds);
    updateLockers(world.lockers, dt, containers.lockerEnterSeconds, containers.lockerExitSeconds);
    if (this.#hiding && !this.#hiding.active && this.#hiding.locker.progress === 0) this.#hiding = null;

    this.#updateProjectiles(dt);
    this.#updateEffects(dt);
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

  /**
   * Attenuation for every teammate, and the one thing speaking costs you.
   *
   * Voice is the only noise a downed player can still make, and it is meant to
   * be made: it is how they are found. It is also how the hunter is pulled back
   * to them, which is why `voice.noiseThresholdDb` exists - talking carries to
   * the team well below the level the enemy gets anything from.
   */
  #updateVoice(dt: number, player: PlayerState): void {
    const spectator = this.#escaped || player.health.state === 'dead';

    this.#voice.update(dt, {
      pushToTalk: this.#input.isDown('pushToTalk'),
      listener: { x: player.x, z: player.z },
      spectator,
      // Peers still in the lobby, or loading into this map, are left out on
      // purpose: `voice/` treats a peer with no position as flat and fully
      // audible, which is what stops a conversation dying across the load.
      peers: [...this.#remotes]
        .filter(([id]) => this.#net.sceneOf(id) === 'run')
        .map(([id, remote]) => ({
          id,
          x: remote.target.x,
          z: remote.target.z,
          spectator: this.#run.isSpectator(id),
        })),
    });

    if (this.#input.justPressed('toggleVoiceMute')) this.#voice.toggleSelfMute();

    // Out of the run is out of the hunter's world: an escaped player shouting is
    // no longer standing anywhere it could go and look. Also ignore downed players.
    this.#voiceNoiseTimer -= dt;
    if (spectator || isDown(player.health.state) || !this.#voice.emittingNoise) return;
    if (this.#voiceNoiseTimer > 0) return;

    this.#voiceNoiseTimer = this.#config.net.voice.noiseIntervalSeconds;
    this.#emitNoise('voice', player.x, player.z);
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
        slowAt: (x, z) => this.#effects.slowAt(x, z),
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

    // It has already stood there for the barricade's full cost by the time it
    // gets here (`doorDelay` in ai/enemy.ts), so the planks come off.
    if (isBarricaded(door)) {
      this.#clearBarricade(doorId);
      this.#net.broadcast({ t: 'barricade', id: doorId, seconds: 0 });
    }

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
        this.#pushHands();
        this.#net.broadcast({ t: 'unlock', id: door.id });
        break;
      }
      case 'forceOpen': {
        const door = this.#doorById(target.id);
        if (!door || !isBarricaded(door)) break;
        this.#clearBarricade(door.id);
        this.#net.broadcast({ t: 'barricade', id: door.id, seconds: 0 });
        toggleDoor(door, true);
        this.#playDoor(door);
        this.#net.broadcast({ t: 'door', id: door.id, open: true });
        // Nails out of timber. The single loudest thing a player can do to a door.
        this.#emitNoise('wreck', door.x, door.z);
        break;
      }
      case 'exit':
        if (!this.#escaped) {
          // Treasure in your hands is worth nothing until you are through this
          // door, and then it belongs to everyone still to come through it.
          this.#cashInTreasure();
          this.#escaped = true;
          this.#run.setEscaped(this.#net.selfId);
          this.#audio.stopSustains();
          this.#audio.play('exit.escaped');
          this.#net.broadcast({ t: 'escaped', id: this.#net.selfId });
          this.#hooks.onEscaped(this.#coins);
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
    this.#net.broadcast({ t: 'take', id: worldItemId });

    // Coins never reach a hand. Nobody should have to decide whether picking
    // money up is worth a slot, and nobody should have to argue about who did.
    const def = itemDef(this.#config.items, item.itemId);
    if (def && def.occupiesSlot === false) {
      this.#collect(worldItemId, def);
      return;
    }

    this.#audio.play('item.pickup');
    const { displaced } = takeItem(this.#inventory, item.itemId);
    if (displaced) this.#dropIntoWorld(displaced, player);
    this.#pushHands();
  }

  /** A pile of coins, spent the instant it is touched. */
  #collect(worldItemId: string, def: ItemDef): void {
    const min = Math.round(itemParam(def, 'minValue', 0));
    const max = Math.round(itemParam(def, 'maxValue', min));
    // Derived from the run seed and the item's own id, so the pile in the cellar
    // is worth the same to whoever gets to it first.
    const rng = stream(this.#layout?.seed ?? 0, `coinValue:${worldItemId}`);
    const amount = Math.max(1, rangeInt(rng, min, max + 1));

    this.#audio.play('item.coins');
    this.#addCoins(amount);
    this.#net.broadcast({ t: 'coins', amount });
  }

  /** Coins anyone in the team picked up. One purse, one number, no arguing. */
  addCoins(amount: number): void {
    this.#addCoins(amount);
  }

  #addCoins(amount: number): void {
    if (amount <= 0) return;
    this.#coins += amount;
    this.#hooks.onCoinsChange(this.#coins);
  }

  /**
   * Cashes in whatever treasure is in this player's hands, into the shared
   * purse. Called at the exit door and nowhere else: a diamond on a body on the
   * floor of the cellar is worth exactly nothing.
   */
  #cashInTreasure(): void {
    let bounty = 0;
    for (const hand of HANDS) {
      const def = itemDef(this.#config.items, this.#inventory[hand]);
      if (def?.behaviour !== 'treasure') continue;
      bounty += Math.round(itemParam(def, 'value', 0));
      dropFrom(this.#inventory, hand);
    }
    if (bounty <= 0) return;

    this.#audio.play('item.treasure');
    this.#pushHands();
    this.#addCoins(bounty);
    this.#net.broadcast({ t: 'coins', amount: bounty });
  }

  #pushHands(): void {
    this.#hooks.onHandsChange({ left: this.#inventory.left, right: this.#inventory.right });
  }

  /* --- using what is in your hands ----------------------------------------- */

  /**
   * The hand buttons. Three shapes of item share them:
   *
   *   `hold`   fills a ring while the button is down (medicine, barricade)
   *   `throw`  draws an aim arc while it is down and lets go on release
   *   the key  is not handled here at all - it is spent through E on the door,
   *            which is the same action and would otherwise be two prompts
   *
   * Only one hand may be doing something at a time, so a mis-click cannot leave
   * a half-filled ring behind the arc you are now aiming.
   */
  #updateItems(dt: number, player: PlayerState, enabled: boolean): void {
    if (enabled) {
      for (const [action, hand] of [['dropLeft', 'left'], ['dropRight', 'right']] as const) {
        if (!this.#input.justPressed(action)) continue;
        const itemId = dropFrom(this.#inventory, hand);
        if (!itemId) continue;
        this.#cancelIfHand(hand);
        this.#dropIntoWorld(itemId, player);
        this.#pushHands();
      }
    }

    if (!enabled) {
      this.#cancelAim();
      this.#itemHold = null;
      this.#pushUse(null);
      this.#updateUseLoop(null);
      return;
    }

    if (this.#aim) {
      this.#updateAim(this.#aim, player);
      return;
    }

    // A press on a throwable takes the hand and starts the arc.
    for (const [action, hand] of USE_ACTIONS) {
      if (!this.#input.justPressed(action)) continue;
      const def = itemDef(this.#config.items, this.#inventory[hand]);
      if (def?.useMode !== 'throw') continue;
      this.#beginAim(hand, def, player);
      return;
    }

    this.#updateItemHold(dt, player);
  }

  /** Drops and consumption both have to clear whatever that hand was doing. */
  #cancelIfHand(hand: Hand): void {
    if (this.#aim?.hand === hand) this.#cancelAim();
    if (this.#itemHold?.hand === hand) this.#itemHold = null;
  }

  /* --- hold-to-use ---------------------------------------------------------- */

  #updateItemHold(dt: number, player: PlayerState): void {
    const held = USE_ACTIONS.find(([action]) => this.#input.isDown(action));
    const hand = held?.[1] ?? null;
    const def = hand ? itemDef(this.#config.items, this.#inventory[hand]) : null;
    const offer = this.#useOffer(hand, def, player);

    if (!offer || !hand || !def) {
      this.#itemHold = null;
      // Nothing is being done, but the HUD should still say what COULD be.
      this.#pushUse(this.#idleOffer(player));
      this.#updateUseLoop(null);
      return;
    }

    // Changing what you are pointing at restarts the work, exactly as the E-hold
    // does. A bandage half-applied to the wrong person is not carried over.
    const current = this.#itemHold;
    if (!current || current.hand !== hand || current.targetId !== offer.targetId || current.itemId !== offer.itemId) {
      this.#itemHold = { ...offer, hand, def, elapsed: 0 };
    }

    const hold = this.#itemHold;
    if (!hold) return;

    hold.elapsed += dt;
    const progress = Math.min(1, hold.elapsed / Math.max(0.01, hold.seconds));
    this.#pushUse({
      verbKey: hold.verbKey,
      itemNameKey: hold.nameKey,
      keyLabel: this.#handKey(hand),
      hintKey: 'hud.use.holdHint',
      hold: true,
      progress,
    });
    this.#updateUseLoop(progress < 1 ? hold : null);

    if (progress >= 1) {
      this.#applyItemHold(hold, player);
      this.#itemHold = null;
    }
  }

  /** What the item in `hand` could do at whatever the crosshair is on. */
  #useOffer(
    hand: Hand | null,
    def: ItemDef | null,
    player: PlayerState,
  ): { itemId: string; targetId: string | null; verbKey: string; nameKey: string | null; seconds: number } | null {
    const itemId = hand ? this.#inventory[hand] : null;
    if (!hand || !def || !itemId || def.useMode !== 'hold' || def.behaviour === 'unlock') return null;

    if (def.behaviour === 'heal') {
      const range = itemParam(def, 'range', 2.2);
      const seconds = itemParam(def, 'useSeconds', 3);
      const mate = this.#lookedAtTeammate(player, range);
      if (mate) {
        return { itemId, targetId: mate, verbKey: 'hud.use.healOther', nameKey: 'hud.player.teammate', seconds };
      }
      if (player.health.state === 'injured') {
        return { itemId, targetId: null, verbKey: 'hud.use.healSelf', nameKey: null, seconds };
      }
      return null;
    }

    if (def.behaviour === 'barricade') {
      const door = this.#lookedAtDoor();
      if (!door || door.open || door.isExit || isBarricaded(door)) return null;
      if (Math.hypot(door.x - player.x, door.z - player.z) > itemParam(def, 'range', 2.4)) return null;
      return {
        itemId,
        targetId: door.id,
        verbKey: 'hud.use.barricade',
        nameKey: null,
        seconds: itemParam(def, 'placeSeconds', 2),
      };
    }

    return null;
  }

  /**
   * The prompt shown when a hand is holding something usable but the button is
   * not down: "this is what LMB would do". A throwable always offers itself.
   */
  #idleOffer(player: PlayerState): UseView | null {
    for (const [, hand] of USE_ACTIONS) {
      const def = itemDef(this.#config.items, this.#inventory[hand]);
      if (!def) continue;

      if (def.useMode === 'throw') {
        return {
          verbKey: 'hud.use.throw',
          itemNameKey: def.nameKey,
          keyLabel: this.#handKey(hand),
          hintKey: '',
          hold: false,
          progress: 0,
        };
      }
      const offer = this.#useOffer(hand, def, player);
      if (offer) {
        return {
          verbKey: offer.verbKey,
          itemNameKey: offer.nameKey,
          keyLabel: this.#handKey(hand),
          hintKey: 'hud.use.holdHint',
          hold: true,
          progress: 0,
        };
      }
    }
    return null;
  }

  #applyItemHold(hold: ItemHold, player: PlayerState): void {
    if (hold.def.behaviour === 'heal') {
      const toState = (hold.def.params['toState'] as HealthState | undefined) ?? 'healthy';
      if (hold.targetId) {
        // The patient owns their own health ladder and echoes the result back,
        // exactly as they do for a hit.
        this.#net.broadcast({ t: 'heal', id: hold.targetId, toState });
      } else {
        const state = applyHeal(player.health, toState);
        if (state) this.#announceHealth(state);
      }
      this.#audio.play('player.healed');
    } else if (hold.def.behaviour === 'barricade' && hold.targetId) {
      const seconds = itemParam(hold.def, 'openSeconds', 9);
      this.#applyBarricade(hold.targetId, seconds);
      this.#net.broadcast({ t: 'barricade', id: hold.targetId, seconds });
    }

    if (hold.def.consumedOnUse) {
      dropFrom(this.#inventory, hold.hand);
      this.#pushHands();
    }
  }

  /** Somebody used medicine on this player. */
  healLocal(toState: HealthState): void {
    const player = this.#player;
    if (!player) return;
    const state = applyHeal(player.health, toState);
    if (!state) return;
    this.#audio.play('player.healed');
    this.#announceHealth(state);
  }

  #lookedAtTeammate(player: PlayerState, range: number): string | null {
    if (this.#look?.key !== 'playerId') return null;
    const remote = this.#remotes.get(this.#look.value);
    // Medicine treats a wound. Somebody on the floor needs a person, not a tin.
    if (!remote || remote.target.health !== 'injured') return null;
    if (Math.hypot(remote.target.x - player.x, remote.target.z - player.z) > range) return null;
    return this.#look.value;
  }

  #lookedAtDoor(): Door | undefined {
    return this.#look?.key === 'doorId' ? this.#doorById(this.#look.value) : undefined;
  }

  #handKey(hand: Hand): string {
    return this.#input.labelFor(hand === 'left' ? 'useLeft' : 'useRight');
  }

  /* --- barricades ----------------------------------------------------------- */

  /** Host or client, local or replicated: every peer wedges the door the same way. */
  #applyBarricade(doorId: string, seconds: number): void {
    const door = this.#doorById(doorId);
    if (!door) return;
    if (seconds <= 0) {
      this.#clearBarricade(doorId);
      return;
    }
    if (isBarricaded(door) || door.open) return;

    setBarricade(door, seconds);
    this.#world?.spawnDecor(barricadeId(doorId), 'door.barricade', door.x, 0, door.z, door.rotationY);
    this.#audio.play('item.barricade.placed', { at: { x: door.x, z: door.z } });
  }

  #clearBarricade(doorId: string): void {
    const door = this.#doorById(doorId);
    if (!door || !isBarricaded(door)) return;
    setBarricade(door, 0);
    this.#world?.removeDecor(barricadeId(doorId));
    this.#audio.play('item.barricade.broken', { at: { x: door.x, z: door.z } });
  }

  /** A peer barricaded a door, or tore one off. */
  setDoorBarricade(doorId: string, seconds: number): void {
    this.#applyBarricade(doorId, seconds);
  }

  /* --- aiming and throwing --------------------------------------------------- */

  #beginAim(hand: Hand, def: ItemDef, player: PlayerState): void {
    this.#itemHold = null;
    this.#aim = { hand, itemId: this.#inventory[hand] ?? '', def };
    this.#arc ??= this.#world?.spawnDecor(ARC_ID, 'vfx.throwArc', 0, 0, 0) ?? null;
    if (this.#arc) this.#arc.object.visible = true;
    this.#updateAim(this.#aim, player);
  }

  #updateAim(aim: { hand: Hand; itemId: string; def: ItemDef }, player: PlayerState): void {
    const holdAction = aim.hand === 'left' ? 'useLeft' : 'useRight';
    const cancelAction = aim.hand === 'left' ? 'useRight' : 'useLeft';

    // The other hand button, or Escape, throws the aim away. Escape also drops
    // pointer lock, which cancels it a tick later anyway - this just makes the
    // "I did not mean that" gesture instant.
    if (this.#input.justPressed(cancelAction) || this.#input.justPressed('pauseMenu')) {
      this.#cancelAim();
      return;
    }

    const flight = this.#aimFlight(player);
    if (!this.#input.isDown(holdAction)) {
      this.#throw(aim, flight);
      return;
    }

    const world = this.#projectileWorld();
    if (world && this.#arc?.api?.setArc) {
      this.#arc.api.setArc(sampleArc(this.#net.selfId, flight.from, flight.velocity, world).points);
    }
    // The hint names the OTHER hand: while you are aiming, the only thing you
    // still need told is how to change your mind.
    this.#pushUse({
      verbKey: 'hud.use.aiming',
      itemNameKey: aim.def.nameKey,
      keyLabel: this.#handKey(aim.hand === 'left' ? 'right' : 'left'),
      hintKey: 'hud.use.cancelHint',
      hold: false,
      progress: 0,
    });
  }

  /** Where the item leaves your hand, and how fast, for the way you are looking. */
  #aimFlight(player: PlayerState): {
    from: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
  } {
    const config = this.#config.items.defaults.throw;
    return {
      from: {
        x: player.x,
        y: eyeHeight(player, this.#config.player) + config.releaseHeightOffset,
        z: player.z,
      },
      velocity: throwVelocity(config, player.yaw, player.pitch),
    };
  }

  #throw(
    aim: { hand: Hand; itemId: string; def: ItemDef },
    flight: { from: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number } },
  ): void {
    const itemId = this.#inventory[aim.hand];
    this.#cancelAim();
    if (itemId !== aim.itemId || !itemId) return;

    // Namespaced by peer, exactly like a drop, so two throws at once cannot
    // collide on an id.
    const id = `throw:${this.#net.selfId}:${this.#throwCount++}`;
    this.#spawnProjectile(id, itemId, this.#net.selfId, flight.from, flight.velocity);
    this.#net.broadcast({
      t: 'throw',
      id,
      itemId,
      owner: this.#net.selfId,
      x: flight.from.x,
      y: flight.from.y,
      z: flight.from.z,
      vx: flight.velocity.x,
      vy: flight.velocity.y,
      vz: flight.velocity.z,
    });

    this.#audio.play('item.throw');
    dropFrom(this.#inventory, aim.hand);
    this.#pushHands();
  }

  #cancelAim(): void {
    this.#aim = null;
    if (this.#arc) this.#arc.object.visible = false;
    this.#pushUse(null);
  }

  /* --- projectiles ----------------------------------------------------------- */

  /** A peer threw something. Its arc is re-run here rather than streamed. */
  throwItem(
    id: string,
    itemId: string,
    ownerId: string,
    from: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number },
  ): void {
    this.#spawnProjectile(id, itemId, ownerId, from, velocity);
    this.#audio.play('item.throw', { at: from });
  }

  #spawnProjectile(
    id: string,
    itemId: string,
    ownerId: string,
    from: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number },
  ): void {
    const def = itemDef(this.#config.items, itemId);
    if (!def) return;

    this.#projectiles.push(createProjectile(id, itemId, ownerId, from, velocity));
    const art = this.#world?.spawnDecor(projectileId(id), def.artId, from.x, from.y, from.z);
    if (art) this.#projectileArt.set(projectileId(id), art.object);
  }

  #updateProjectiles(dt: number): void {
    if (!this.#projectiles.length) return;
    const world = this.#projectileWorld();
    if (!world) return;

    const landed: Projectile[] = [];
    for (const projectile of this.#projectiles) {
      const landing = stepProjectile(projectile, dt, world);
      const art = this.#projectileArt.get(projectileId(projectile.id));
      if (art) {
        art.position.set(projectile.x, projectile.y, projectile.z);
        if (!landing) {
          // Tumbling, at a rate set by how fast it is actually going.
          const speed = Math.hypot(projectile.vx, projectile.vy, projectile.vz);
          art.rotation.x += speed * dt * 0.9;
          art.rotation.z += speed * dt * 0.5;
        } else {
          art.rotation.set(0, art.rotation.y, 0);
        }
      }
      if (landing) landed.push(projectile);
    }

    if (!landed.length) return;
    this.#projectiles = this.#projectiles.filter((projectile) => !landed.includes(projectile));
    for (const projectile of landed) this.#land(projectile);
  }

  /** The one place a throw becomes a gameplay effect. */
  #land(projectile: Projectile): void {
    const def = itemDef(this.#config.items, projectile.itemId);
    const at = { x: projectile.x, y: projectile.y, z: projectile.z };
    this.#world?.removeDecor(projectileId(projectile.id));
    this.#projectileArt.delete(projectileId(projectile.id));
    if (!def) return;

    this.#audio.play('item.impact', { at });
    // Only the host feeds the bus, so four peers simulating the same throw do
    // not make four times the noise.
    if (this.#isHost) this.#emitNoiseFrom(projectile.ownerId, 'throwImpact', at.x, at.z);

    switch (def.behaviour) {
      case 'flash':
        this.#detonate(projectile, def, at);
        break;
      case 'alarm':
        this.#startAlarm(projectile, def, at);
        break;
      case 'tar':
        this.#spillTar(projectile, def, at);
        break;
      default:
        // Anything else simply lies there and can be picked up again.
        this.#world?.spawnItem(`land:${projectile.id}`, projectile.itemId, at.x, 0, at.z);
        break;
    }
  }

  #detonate(projectile: Projectile, def: ItemDef, at: { x: number; y: number; z: number }): void {
    const radius = itemParam(def, 'radius', 9);
    const burst = itemParam(def, 'burstSeconds', 1.1);

    this.#audio.play('item.flash', { at });
    const effect = this.#effects.add({
      id: projectile.id,
      kind: 'burst',
      ownerId: projectile.ownerId,
      x: at.x,
      z: at.z,
      duration: burst,
      spreadSeconds: burst,
    });
    const art = this.#world?.spawnDecor(effectId(effect.id), 'vfx.flashBurst', at.x, at.y, at.z);
    if (art) {
      art.object.scale.setScalar(radius);
      this.#effectArt.set(effectId(effect.id), art);
    }

    // Everyone in range is caught, thrower included. There is no friendly fire
    // rule here because there is no way to make one that is not a lie.
    const player = this.#player;
    if (player && !this.#escaped && Math.hypot(player.x - at.x, player.z - at.z) <= radius) {
      this.#stunFor = Math.max(this.#stunFor, itemParam(def, 'playerStunSeconds', 2.2));
      this.#renderer.feedback.blind(itemParam(def, 'blindSeconds', 3));
      this.#cancelAim();
      this.#itemHold = null;
    }

    if (!this.#isHost) return;
    const enemy = this.#enemy;
    if (enemy && Math.hypot(enemy.x - at.x, enemy.z - at.z) <= radius) {
      enemy.stunFor = Math.max(enemy.stunFor, itemParam(def, 'enemyStunSeconds', 5));
    }
    // Loud enough to bring it running if it was stood just outside the light.
    this.#emitNoiseFrom(projectile.ownerId, 'blast', at.x, at.z);
  }

  #startAlarm(projectile: Projectile, def: ItemDef, at: { x: number; y: number; z: number }): void {
    const effect = this.#effects.add({
      id: projectile.id,
      kind: 'alarm',
      ownerId: projectile.ownerId,
      x: at.x,
      z: at.z,
      duration: itemParam(def, 'durationSeconds', 14),
      noiseInterval: itemParam(def, 'ringIntervalSeconds', 0.9),
    });

    const art = this.#world?.spawnDecor(effectId(effect.id), def.artId, at.x, 0, at.z);
    if (art) {
      art.api?.setActive?.(true);
      this.#effectArt.set(effectId(effect.id), art);
    }
    this.#audio.sustain(`effect:${effect.id}`, 'item.alarm.loop', { on: true, at });
  }

  #spillTar(projectile: Projectile, def: ItemDef, at: { x: number; y: number; z: number }): void {
    const radius = itemParam(def, 'radius', 2.8);
    this.#audio.play('item.tar.spill', { at });

    const effect = this.#effects.add({
      id: projectile.id,
      kind: 'tar',
      ownerId: projectile.ownerId,
      x: at.x,
      z: at.z,
      radius,
      slowMultiplier: itemParam(def, 'slowMultiplier', 0.3),
      duration: itemParam(def, 'durationSeconds', 22),
      spreadSeconds: itemParam(def, 'spreadSeconds', 0.6),
    });

    const art = this.#world?.spawnDecor(effectId(effect.id), 'vfx.tarPool', at.x, 0, at.z);
    if (art) {
      // The art is built at unit radius; height is left alone so a wider slick
      // is wider rather than deeper.
      art.object.scale.set(radius, 1, radius);
      this.#effectArt.set(effectId(effect.id), art);
    }
  }

  #updateEffects(dt: number): void {
    for (const effect of this.#effects.all) {
      this.#effectArt.get(effectId(effect.id))?.api?.setProgress?.(RunEffects.progress(effect));
    }

    // The clock's noise is the host's to emit, for the same reason a landing is.
    if (this.#isHost) {
      for (const alarm of this.#effects.dueToSound()) {
        this.#emitNoiseFrom(alarm.ownerId, 'alarm', alarm.x, alarm.z);
      }
    }

    for (const expired of this.#effects.update(dt)) this.#endEffect(expired);
  }

  #endEffect(effect: Effect): void {
    this.#audio.sustain(`effect:${effect.id}`, null, { on: false });
    this.#world?.removeDecor(effectId(effect.id));
    this.#effectArt.delete(effectId(effect.id));
  }

  /**
   * Everything a throw is allowed to stop on.
   *
   * The local player is in the body list alongside the remotes, so every peer
   * tests the same set and skips only whoever threw it - which is what keeps
   * four independent simulations of one arc agreeing about where it went.
   */
  #projectileWorld(): ProjectileWorld | null {
    const walls = this.#walls;
    const player = this.#player;
    if (!walls || !player) return null;

    const { radius, standHeight } = this.#config.player.body;
    const bodies: ProjectileBody[] = [
      { id: this.#net.selfId, x: player.x, z: player.z, radius, height: standHeight },
    ];
    for (const [id, remote] of this.#remotes) {
      bodies.push({ id, x: remote.target.x, z: remote.target.z, radius, height: standHeight });
    }
    const enemy = this.#archetype().body;
    bodies.push({
      id: 'enemy',
      x: this.#enemyView.x,
      z: this.#enemyView.z,
      radius: enemy.radius,
      height: enemy.height,
    });

    return {
      config: this.#config.items.defaults.throw,
      ceilingHeight: this.#config.world.grid.ceilingHeight,
      walls,
      // The replicated boolean rather than the swing animation, so four peers
      // never disagree about whether a doorway was open at that instant.
      doorOpen: (doorId) => this.#doorById(doorId)?.open ?? true,
      bodies,
    };
  }

  /* --- the use prompt -------------------------------------------------------- */

  #pushUse(use: UseView | null): void {
    const signature = use ? `${use.verbKey}|${use.itemNameKey}|${use.hold}|${use.progress.toFixed(2)}` : '';
    if (signature === this.#useSignature) return;
    this.#useSignature = signature;
    this.#hooks.onUseChange(use);
  }

  /** The sound of a bandage being unrolled or a plank being hammered on. */
  #updateUseLoop(hold: ItemHold | null): void {
    const { cues } = this.#config.audio;
    const soundId = hold ? (cues.itemUseLoops[hold.def.behaviour] ?? null) : null;
    if (!hold || !soundId) {
      this.#audio.sustain('itemUse', null, { on: false });
      return;
    }
    this.#audio.sustain('itemUse', soundId, { on: true });
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
   * One ray down the crosshair per tick, shared by E and by the hand buttons.
   *
   * A ray rather than a distance check, so you cannot open a door through the
   * wall next to it - or bandage a teammate standing on the other side of one.
   */
  #lookTag(world: BuiltWorld): { key: string; value: string } | null {
    const camera = this.#renderer.camera;
    this.#raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    this.#raycaster.far = this.#config.player.interaction.rayLength;

    // Teammates are in the scene rather than the world, so they join the ray here.
    const candidates = [...world.raycastTargets, ...[...this.#remotes.values()].map((remote) => remote.object)];
    const hit = this.#raycaster.intersectObjects(candidates, true)[0];
    return hit ? findTag(hit.object) : null;
  }

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

    const tagged = this.#look;
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

    // A barricade outranks the lock: there is no getting at the keyhole until
    // the planks are off, and taking them off is loud.
    if (isBarricaded(door)) {
      return {
        kind: 'forceOpen',
        id: door.id,
        verbKey: 'hud.interact.forceOpen',
        hold: true,
        holdSeconds: door.barricadeSeconds,
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

/* --- decor ids ------------------------------------------------------------- */
/* One namespace per kind, so a door and the throw that landed next to it can
   never claim the same slot in the world's decor table. */

const barricadeId = (doorId: string): string => `barricade:${doorId}`;
const projectileId = (throwId: string): string => `flight:${throwId}`;
const effectId = (id: string): string => `effect:${id}`;

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
