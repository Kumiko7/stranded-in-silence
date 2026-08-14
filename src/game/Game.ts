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
import { clearGeometryCache } from '@art/lib/build';
import type { RoomDims } from '@art/lib/contract';
import { configForRun, type Config } from '@/config/index';
import { rangeInt, stream, type Rng } from '@/core/rng';
import type { EnemyArchetype, HealthState, ItemDef } from '@/config/types';
import { createPlayerState, applyLook, eyeHeight, stepPlayer, type PlayerState } from '@/entities/player';
import { applyGiveUp, applyHeal, applyHit, applyRevive, isDown, tickHealth } from '@/entities/health';
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
import {
  createEnemy,
  updateEnemy,
  type EnemyLocker,
  type EnemyPeer,
  type EnemyState,
  type LockerEntry,
} from '@/ai/enemy';
import { footstepInterval, footstepKind, noiseSpec, NoiseBus, type NoiseKind } from '@/ai/noiseBus';
import type { PerceptionTarget } from '@/ai/perception';
import { RoomGraph } from '@/ai/roomGraph';
import type { Audio } from '@/audio/index';
import type { Input } from '@/input/index';
import type { ClaimKind, EnemyTransform, Net } from '@/net/index';
import { shortestAngle, TransformBuffer } from '@/net/interpolation';
import type { Renderer } from '@/render/Renderer';
import { heartbeatCloseness, type AlertLevel } from '@/render/feedback';
import type { VoiceChat } from '@/voice/index';
import { generate, type RunLayout } from '@/world/generation';
import { isBarricaded, setBarricade, toggleDoor, unlockDoor, updateDoors, type Door } from '@/world/doors';
import { updateChests, updateLockers, type Locker } from '@/world/containers';
import { RunEffects, type Effect } from '@/world/effects';
import { RunState } from '@/world/runState';
import { RunStats, sanitiseStats, type PlayerStats, type StatId } from '@/world/runStats';
import { WallGrid } from '@/world/wallGrid';
import { colourHexOf, createPlayerBody, defaultCosmetic, type PlayerBody } from '@/render/playerBody';
import { playerPortrait } from '@/render/portraits';
import type { Cosmetic } from '@shared/cosmetics';
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
  /** Raw binding the hint line is about, e.g. `Mouse0`. The HUD draws the cap. */
  keyCode: string;
  /**
   * Locale key of the hint under the verb, taking `{key}`. Empty means show the
   * cap on its own - a mouse with its left button lit says everything a
   * throwable in hand needs to.
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
  /** They dropped out. The line stays, greyed: a team of three should look like one. */
  disconnected: boolean;
  /** They are out through the door. Also greyed, but for the good reason. */
  escaped: boolean;
  pulse: { loudness: number; heard: boolean; token: number } | null;
}

/**
 * Whose eyes a spectator is currently borrowing.
 *
 * `index` is that player's roster number rather than their peer id, because it
 * is what the rest of the interface already calls them; `position` and `count`
 * are the "2 of 3" a spectator needs to know there is somebody else to look at.
 */
export interface SpectateView {
  targetId: string;
  index: number;
  position: number;
  count: number;
}

/**
 * One player's column on the post-run scoreboard: who they are, how their run
 * ended, and what they did. `stats` is keyed by the category ids in
 * `game.json -> scoring.categories`.
 */
export interface ScoreRow {
  id: string;
  index: number;
  self: boolean;
  /**
   * A rendered picture of THIS player's body, hat and all - the real model,
   * not an illustration of it (`src/render/portraits.ts`). Null only if the
   * browser refused a second GL context, and the card falls back to a
   * silhouette in their colour.
   */
  portrait: string | null;
  /** Their wardrobe colour, which still tints the card behind the portrait. */
  colourHex: string;
  /** `escaped` outranks health: getting out is how a run ends well. */
  status: 'escaped' | 'disconnected' | HealthState;
  stats: PlayerStats;
}

/**
 * One hunter, from this browser's point of view.
 *
 * `state` is the simulation and only the host has one; everybody else knows a
 * hunter purely as the last transform it was sent and the buffer that plays it
 * back. How many there are is not replicated: `(mapId, seed, difficultyId)`
 * decides it, so every peer builds the same list and a snapshot only has to name
 * an index into it.
 */
interface Hunter {
  /** Host only. `null` on a client, which never simulates one. */
  state: EnemyState | null;
  view: EnemyTransform;
  /** Snapshot playback, so a client draws it moving rather than jumping. */
  buffer: TransformBuffer;
  art: {
    object: THREE.Object3D;
    root: THREE.Object3D;
    setAlert?: (level: string) => void;
    dispose?: () => void;
  } | null;
  /** The level currently pushed to the art, so a change costs one call. */
  artAlert: string;
  /** Its own stream, so two hunters do not draw the same patrol from one source. */
  rng: Rng;
}

export interface RunHooks {
  onInteractTargetChange(target: InteractTarget | null): void;
  onHoldProgress(progress: number): void;
  onHandsChange(hands: { left: string | null; right: string | null }): void;
  /** What the hand buttons are offering, or null when they are offering nothing. */
  onUseChange(use: UseView | null): void;
  /** The shared run purse changed. It only becomes real money if you get out. */
  onCoinsChange(coins: number): void;
  /**
   * Through the exit door. It does NOT end the run for this player any more -
   * they drop into the spectator's chair and the purse keeps growing behind
   * them. What they actually bank is decided when they walk away from it.
   */
  onEscaped(): void;
  /**
   * This player is out of the run - escaped, or gave up - and is watching
   * somebody who is not. `null` means there is nobody left to watch, which is
   * the same thing as the run being over for them.
   */
  onSpectate(view: SpectateView | null): void;
  /** 0..1 while a downed player holds the give-up key. */
  onGiveUpProgress(progress: number): void;
  /**
   * The scoreboard, once the run is over for this player. Fired again whenever
   * a teammate's tally arrives afterwards, so a column cannot sit at zero
   * because their last message was still in flight.
   */
  onScoreboard(rows: ScoreRow[]): void;
  onPlayerCountChange(count: number): void;
  /**
   * A moment the tutorial has a line for: `chest`, `heard`, `seen`. Reported
   * rather than acted on - whether anything is drawn is `Tutorial`'s business,
   * and this file does not know it exists.
   */
  onTutorial(id: string): void;
  onHealthChange(state: HealthState): void;
  onRosterChange(roster: RosterEntry[]): void;
  /** Everyone is on the floor. The run is over and it was not a win. */
  onWiped(): void;
}

interface RemotePlayer {
  /** The body clones its materials per player, so it has to be freed per player. */
  body: PlayerBody;
  /** `body.object` and `body.root`, lifted out because the frame touches them a lot. */
  object: THREE.Object3D;
  root: THREE.Object3D;
  /** The latest transform received. The SIMULATION reads this one. */
  target: {
    x: number;
    z: number;
    yaw: number;
    pitch: number;
    height: number;
    hiding: boolean;
    health: HealthState;
    left: string | null;
    right: string | null;
  };
  /** Where the body is DRAWN: the same transforms, played back a little late. */
  buffer: TransformBuffer;
}

/**
 * A claim sent to the host that has not been answered yet.
 *
 * Only `take` shows anything before the answer arrives - it has to, because a
 * pick-up is a press and a hand that fills a round trip later feels broken.
 * Everything else here follows a hold, where the ring finishing is the feedback
 * and the result landing 50 ms after it is invisible.
 */
interface PendingClaim {
  kind: ClaimKind;
  id: string;
  /** The item put in a hand optimistically, and which hand it went into. */
  itemId?: string;
  hand?: Hand;
  /**
   * What that hand was holding before. It does not hit the floor until the
   * pick-up is granted, so a swap the host refuses leaves both hands as they
   * were rather than costing you the item you already had.
   */
  displaced?: string | null;
  x?: number;
  y?: number;
  z?: number;
}

/** The one item id logic names directly: E on a locked door has to find it. */
const KEY_ITEM = 'key';

/** Decor id of the aim arc. There is only ever one, and it is the local player's. */
const ARC_ID = 'aim:arc';

/** The crosshair, in the normalised coordinates a raycaster wants. Never changes. */
const CENTRE_SCREEN = new THREE.Vector2(0, 0);

/* Scratch for the forgiving item test (`#softItemTag`), which runs every tick
   over the handful of items within arm's reach. Reused rather than allocated. */
const ITEM_BOX = new THREE.Box3();
const ITEM_SPHERE = new THREE.Sphere();
const OFFSET = new THREE.Vector3();

/**
 * How often a peer re-sends its scoreboard tally while a run is going. Nothing
 * reads it until the run ends, so this is deliberately lazy - it exists only so
 * a player who disconnects mid-run still has a column worth looking at.
 */
const STATS_INTERVAL_SECONDS = 1;

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
  /** Reused by `#lookTag`, which runs both of its passes every tick. */
  #lookCandidates: THREE.Object3D[] = [];
  /**
   * How big each item's model is, worked out once. `Box3.setFromObject` walks
   * every vertex, and the forgiving pick-up test would otherwise pay for that
   * on every item within reach on every tick. Stored as an offset from the
   * object's own position rather than as a world sphere, so it stays right if
   * anything ever animates one; keyed weakly, so a taken item's entry goes with
   * the mesh.
   */
  #itemBounds = new WeakMap<THREE.Object3D, { dx: number; dy: number; dz: number; radius: number }>();
  /** What the look-ray hit this tick. Both E and the hand buttons read it. */
  #look: { key: string; value: string } | null = null;
  #target: InteractTarget | null = null;
  #hold = 0;
  #holdDone = false;
  #hiding: { locker: Locker; active: boolean } | null = null;
  #escaped = false;
  #moveTimer = 0;

  /* --- out of the run ------------------------------------------------------ */
  /** Whose eyes this player is borrowing, once they are out of the run. */
  #spectating: string | null = null;
  /**
   * Last view handed to the UI, so an unchanged one is not pushed every tick.
   * `null` means NOTHING has been pushed yet, and is deliberately distinct from
   * the empty string that means "pushed, and there was nobody to watch": the
   * last player out of a run full of dead teammates goes straight from playing
   * to having no targets, and starting this at `''` swallowed exactly that
   * transition and left them standing at the exit door with no way on.
   */
  #spectateSignature: string | null = null;
  /** Seconds the give-up key has been held while downed. */
  #giveUpHold = 0;
  #giveUpPushed = 0;
  #dropCount = 0;
  #dims: RoomDims | null = null;
  /**
   * Claims sent and not yet answered, keyed `kind:id`. It is also what stops a
   * second request going out for the same thing while the first is in flight.
   */
  #pending = new Map<string, PendingClaim>();

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

  /* --- the hunters --------------------------------------------------------- */
  #noise = new NoiseBus();
  /** Lockers climbed into this tick, local or remote. Cleared with the noise bus. */
  #lockerEntries: LockerEntry[] = [];
  #graph: RoomGraph | null = null;
  #doorsById = new Map<string, Door>();
  /** One per `layout.enemySpawns`. Usually one; `hard` puts a second behind a lock. */
  #hunters: Hunter[] = [];
  /** Tracked separately from the art's, so a sting does not need art to exist. */
  #audioAlert = '';
  /**
   * Edges, so the two hunter tutorial cues fire on the change rather than every
   * tick the hunter spends worked up.
   */
  #cued = { heard: false, seen: false };
  #enemyTimer = 0;
  #footstepTimer = 0;
  /** Speaking re-emits on this interval; noise events only live one tick. */
  #voiceNoiseTimer = 0;
  #run = new RunState();
  #over = false;

  /* --- scoreboard ---------------------------------------------------------- */
  /** Every player's tally. This browser counts its own and is told the rest. */
  #stats = new RunStats();
  /** Seconds until this player's block goes out again, if it has changed. */
  #statsTimer = 0;

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

  /** Read-only view of the hunters, for the dev handle and later a debug overlay. */
  get enemies(): readonly EnemyState[] {
    return this.#hunters.map((hunter) => hunter.state).filter((state): state is EnemyState => state !== null);
  }

  /** This player got through the exit door. It is what decides whether they bank. */
  get escaped(): boolean {
    return this.#escaped;
  }

  /** The shared run purse as it stands. Read when this player leaves the run. */
  get coins(): number {
    return this.#coins;
  }

  /**
   * Out of the run, still in the world: escaped, or gave up on the floor. What
   * makes the difference to every other system is that this player has no body
   * to be hunted, heard or interacted with any more.
   */
  get spectating(): boolean {
    const state = this.#player?.health.state;
    return this.#escaped || state === 'dead';
  }

  /**
   * The number the whole interface calls a peer by. Public because the chat log
   * needs it in the cabin as well as in a run, and this is the one place that
   * numbering is decided (`#indexOf`).
   */
  playerNumber(id: string): number {
    return this.#indexOf(id, id === this.#net.selfId);
  }

  /**
   * Chat obeys the voice rule: a player still down there never hears from one
   * who is out. Otherwise the channel separation `voice/` exists for would be
   * defeated by anybody who can type - a dead player calling a room clear is
   * exactly what it is there to stop. Outside a run everybody talks to
   * everybody, because in the cabin there is nothing to give away.
   */
  canHearChatFrom(id: string): boolean {
    if (!this.#world || this.spectating) return true;
    return !this.#run.isSpectator(id);
  }

  /**
   * `slot` selects this player's spawn point within the shared start room, and
   * `difficultyId` picks the config overlay every peer applies before it
   * generates - so the map, the hunters and their numbers all follow from
   * `(mapId, seed, difficultyId)` without any of it crossing the wire.
   */
  start(mapId: string, seed: number, slot = 0, difficultyId = this.#config.difficulty.default): void {
    this.end();

    const config = configForRun(mapId, difficultyId);
    this.#config = config;
    this.#renderer.applyGraphics(config.graphics);

    const pack = getArtPack(config.maps.maps[mapId]?.artPack ?? mapId);
    const layout = generate(mapId, seed, config.world, pack.rooms, this.#archetype(config).spawn);
    const world = buildWorld(layout, pack, config.world, config.items, config.graphics);

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

    const spawn = layout.playerSpawns[slot % layout.playerSpawns.length] ?? layout.playerSpawns[0]!;
    this.#player = createPlayerState(spawn.position[0], spawn.position[2], spawn.yaw, config.player);
    // After the spawn is known, so the light budget is filled from the first
    // frame: a frame drawn with a different number of lights compiles its own
    // set of shaders, which is exactly what `warmUp()` exists to avoid.
    this.#renderer.setRoomLights(world.lights, spawn.position[0], spawn.position[2]);
    this.#inventory = createInventory();
    this.#escaped = false;
    this.#over = false;
    this.#spectating = null;
    this.#spectateSignature = null;
    this.#giveUpHold = 0;
    this.#giveUpPushed = 0;
    this.#hooks.onGiveUpProgress(0);
    this.#pending.clear();
    this.#resetHold();
    this.#clearItemState();
    this.#walls = new WallGrid(layout);
    this.#coins = 0;
    this.#hooks.onCoinsChange(0);
    this.#hooks.onHandsChange({ left: null, right: null });
    this.#hooks.onPlayerCountChange(this.#remotes.size + 1);
    this.#hooks.onHealthChange('healthy');
    this.#pulses.clear();

    // --- the hunter --------------------------------------------------------
    this.#graph = new RoomGraph(layout);
    this.#doorsById = new Map(world.doors.map((door) => [door.id, door]));
    this.#noise.clear();
    this.#footstepTimer = 0;

    // Rebuilt from who is actually here: last run's dropouts are not this
    // run's problem, and the roster is drawn from this.
    this.#run.clear();
    this.#run.add(this.#net.selfId);
    for (const id of this.#remotes.keys()) this.#run.add(id);
    this.#pushRoster();

    this.#stats.clear();
    this.#statsTimer = 0;

    this.#hunters = layout.enemySpawns.map(({ position }, index) => {
      const [ex, ez] = position;
      const buffer = new TransformBuffer(config.net.simulation);
      buffer.reset({ x: ex, z: ez, yaw: 0, pitch: 0, height: 0 }, now());
      return {
        // A client is handed every hunter's transform and simulates none of them.
        state: this.#isHost ? createEnemy(ex, ez) : null,
        view: { index, x: ex, z: ez, yaw: 0, alert: 'calm' },
        buffer,
        art: this.#buildEnemyArt(index),
        artAlert: '',
        rng: stream(seed, `enemy:${index}`),
      };
    });
    this.#audioAlert = '';
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
    // Freed rather than silenced: a run's sustains include one key per alarm
    // clock it spawned, and those keys never come round again.
    this.#audio.releaseSustains();
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
    this.#spectating = null;
    this.#hunters = [];
    this.#graph = null;
    this.#doorsById.clear();
    this.#pending.clear();
    this.#run.clear();
    // Last, once the world, the bodies and the hunter are all down: the shared
    // box cache belongs to the build that filled it, and every mesh holding one
    // of its buffers has just gone. See `art/lib/build.ts`.
    clearGeometryCache();
  }

  /**
   * Everything a thrown item put into the world. The art lives on `world.root`
   * or in the scene, so this has to run BEFORE the world is torn down.
   */
  #clearItemState(): void {
    for (const effect of this.#effects.all) this.#audio.releaseSustain(`effect:${effect.id}`);
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

  /**
   * The archetype every hunter on this map uses. One for now; `maps.json` picks
   * later. A second hunter is a second instance of the same thing, which is why
   * "two on Hard" costs no config beyond a spawn entry.
   */
  #archetype(config: Config = this.#config): EnemyArchetype {
    const { enemy } = config;
    const archetype = enemy.archetypes[enemy.defaultArchetype];
    if (!archetype) throw new Error(`config: no enemy archetype "${enemy.defaultArchetype}"`);
    return archetype;
  }

  #buildEnemyArt(index: number): Hunter['art'] {
    const world = this.#world;
    const layout = this.#layout;
    if (!world || !layout || !this.#dims) return null;

    const art = resolveArt(this.#archetype().artId)({
      materials: world.materials,
      // Per hunter, so two of them are not the same silhouette twice over.
      rng: stream(layout.seed, `enemyArt:${index}`),
      dims: this.#dims,
    });

    this.#renderer.scene.add(art.object);
    return {
      object: art.object,
      root: art.parts['root'] ?? art.object,
      setAlert: art.api?.setAlert?.bind(art.api),
      // The ghost clones its shroud and alert materials so it can tint one
      // hunter rather than every material in the pack cache, so the run that
      // built them is the run that has to free them.
      ...(art.dispose ? { dispose: art.dispose.bind(art) } : {}),
    };
  }

  #removeEnemyArt(): void {
    for (const hunter of this.#hunters) {
      if (!hunter.art) continue;
      this.#renderer.scene.remove(hunter.art.object);
      hunter.art.dispose?.();
      hunter.art = null;
    }
  }

  /* --- remote players ----------------------------------------------------- */

  addRemote(id: string): void {
    // No world means no run: a transform from a peer already down a hole must
    // not put a body in the cabin behind you.
    if (this.#remotes.has(id) || !this.#dims || !this.#world) return;

    const body = createPlayerBody(
      this.#config.player,
      this.#world?.materials ?? getArtPack('test').createMaterials(),
      stream(0, `remote:${id}`),
      this.#dims,
    );
    // Tagged so the look-ray can offer "revive" on a downed teammate.
    body.object.traverse((child) => {
      child.userData['playerId'] = id;
    });

    this.#renderer.scene.add(body.object);
    const remote: RemotePlayer = {
      body,
      object: body.object,
      root: body.root,
      target: {
        x: 0,
        z: 0,
        yaw: 0,
        pitch: 0,
        height: this.#config.player.body.standHeight,
        hiding: false,
        health: 'healthy',
        left: null,
        right: null,
      },
      buffer: new TransformBuffer(this.#config.net.simulation),
    };
    body.wear(this.#net.cosmeticOf(id) ?? defaultCosmetic(this.#config.player));
    this.#remotes.set(id, remote);
    // Somebody standing in front of you is not disconnected, whatever an
    // earlier drop-out left behind.
    this.#run.add(id).disconnected = false;
    this.#hooks.onPlayerCountChange(this.#remotes.size + 1);
    this.#pushRoster();
  }

  /** A teammate changed clothes in the lobby, or turned up already dressed. */
  setRemoteCosmetic(id: string, cosmetic: Cosmetic): void {
    this.#remotes.get(id)?.body.wear(cosmetic);
  }

  #disposeRemote(remote: RemotePlayer): void {
    this.#renderer.scene.remove(remote.object);
    remote.body.dispose();
  }

  /**
   * A teammate is gone - a closed tab, a dead connection, or they walked out of
   * the run back to the cabin. Either way their body leaves and their line stays:
   * a run they were part of should still show what they did with it.
   */
  removeRemote(id: string): void {
    const remote = this.#remotes.get(id);
    if (!remote) return;

    // Whatever they were holding falls where they stood. A key that leaves the
    // map inside a closed tab is a run nobody can finish, and the host is the
    // only peer allowed to put it back so it lands in exactly one place.
    if (this.#isHost) this.#dropRemoteItems(remote);

    this.#disposeRemote(remote);
    this.#remotes.delete(id);
    this.#run.setDisconnected(id);
    this.#hooks.onPlayerCountChange(this.#remotes.size + 1);
    this.#pushRoster();
    // Losing the last player still on their feet is a wipe like any other.
    if (this.#isHost) this.#checkRunOver();
    if (this.#over || this.#escaped) this.#pushScoreboard();
  }

  #dropRemoteItems(remote: RemotePlayer): void {
    for (const hand of HANDS) {
      const itemId = remote.target[hand];
      if (!itemId) continue;
      const id = `drop:${this.#net.selfId}:lost:${this.#dropCount++}`;
      this.dropWorldItem(id, itemId, remote.target.x, 0, remote.target.z);
      this.#net.broadcast({ t: 'drop', id, itemId, x: remote.target.x, y: 0, z: remote.target.z });
    }
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
    remote.buffer.push(
      { x: transform.x, z: transform.z, yaw: transform.yaw, pitch: transform.pitch, height: transform.height },
      now(),
    );
    this.#run.setHealth(id, transform.health);
    if (healthChanged) this.#pushRoster();
  }

  /* --- host authority ------------------------------------------------------ */

  /**
   * Asks for something only one player can have. On the host - and offline -
   * this resolves in the same call, so nothing about a solo run goes near the
   * wire; on a client it goes up and the answer comes back as a grant or a
   * denial.
   *
   * One request per thing at a time: `#pending` is both the record of what to
   * undo and the guard against a second press sending a second claim.
   */
  #claim(kind: ClaimKind, id: string, value = 0, optimistic?: Omit<PendingClaim, 'kind' | 'id'>): void {
    const key = `${kind}:${id}`;
    if (this.#pending.has(key)) return;
    this.#pending.set(key, { kind, id, ...optimistic });
    this.#net.claim(kind, id, value);
  }

  /**
   * Host only: the decision itself. Every answer comes from world state the
   * host already holds, so granting one claim is exactly what makes the next
   * claim on the same thing fail - there is no ledger to keep in step.
   */
  arbitrate(kind: ClaimKind, id: string): boolean {
    const world = this.#world;
    if (!world) return false;

    switch (kind) {
      case 'take':
        return world.items.has(id);
      case 'chest':
        return world.chests.some((chest) => chest.id === id && !chest.opened);
      case 'unlock': {
        const door = this.#doorById(id);
        return door?.locked === true;
      }
      case 'barricade': {
        const door = this.#doorById(id);
        return door !== undefined && !door.open && !isBarricaded(door);
      }
    }
  }

  /** The host's word. Every peer applies this, the winner included. */
  applyGrant(kind: ClaimKind, id: string, by: string, value: number): void {
    const pending = this.#takePending(kind, id);
    const self = by === this.#net.selfId;

    switch (kind) {
      case 'take':
        this.#applyTake(id, by, pending);
        break;
      case 'chest':
        this.#openChest(id);
        break;
      case 'unlock': {
        const door = this.#doorById(id);
        if (!door) break;
        unlockDoor(door);
        this.#audio.play('door.unlock', { at: { x: door.x, z: door.z } });
        // The key is spent here and nowhere else, so a lock somebody else got
        // to first costs you nothing but the time you spent turning it.
        if (self && pending?.hand && this.#inventory[pending.hand] === KEY_ITEM) {
          dropFrom(this.#inventory, pending.hand);
          this.#pushHands();
          this.#count('itemsUsed');
        }
        break;
      }
      case 'barricade':
        this.#applyBarricade(id, value);
        if (self && pending?.hand && this.#inventory[pending.hand] === pending.itemId) {
          dropFrom(this.#inventory, pending.hand);
          this.#pushHands();
          this.#count('itemsUsed');
        }
        break;
    }
  }

  /**
   * Somebody else got there first. Only a pick-up has anything to undo: a lock
   * still has its key and a barricade still has its planks, because neither is
   * spent until the grant arrives.
   */
  applyDeny(kind: ClaimKind, id: string): void {
    const pending = this.#takePending(kind, id);
    if (kind !== 'take' || !pending?.hand || !pending.itemId) return;

    // The hand goes back exactly as it was, holding whatever the pick-up
    // displaced. The item itself is NOT put back on the floor: a take is only
    // ever denied because it is already in somebody else's hand.
    if (this.#inventory[pending.hand] !== pending.itemId) return;
    this.#inventory[pending.hand] = pending.displaced ?? null;
    this.#pushHands();
  }

  #takePending(kind: ClaimKind, id: string): PendingClaim | undefined {
    const key = `${kind}:${id}`;
    const pending = this.#pending.get(key);
    this.#pending.delete(key);
    return pending;
  }

  /**
   * A pick-up, settled. The taker already has it in hand; everyone else simply
   * watches it leave the floor. Coins are the exception - they belong to the
   * team, so every peer adds the same amount, derived from the run seed rather
   * than sent, which is why a lost `coins` message can no longer cost the purse.
   */
  #applyTake(worldItemId: string, by: string, pending: PendingClaim | undefined): void {
    const item = this.#world?.items.get(worldItemId);
    const itemId = item?.itemId ?? pending?.itemId ?? null;
    const at = item ? { x: item.x, z: item.z } : null;
    this.#world?.removeItem(worldItemId);

    const def = itemDef(this.#config.items, itemId);
    if (def && def.occupiesSlot === false) this.#collect(worldItemId, def, by, at);

    // Only now does the hand this went into let go of what it was holding.
    if (pending?.displaced) {
      if (pending.x !== undefined && pending.y !== undefined && pending.z !== undefined) {
        this.#dropAt(pending.displaced, pending.x, pending.y, pending.z);
      } else if (this.#player) {
        this.#dropIntoWorld(pending.displaced, this.#player);
      }
    }
  }

  /* --- replicated world events -------------------------------------------- */

  /** The host's word on a door. Whatever this browser was showing gives way. */
  setDoor(doorId: string, open: boolean): void {
    const door = this.#doorById(doorId);
    if (!door) return;
    const was = door.open;
    toggleDoor(door, open);
    if (door.open !== was) this.#playDoor(door);
  }

  /**
   * Host only: a client wants a door open or shut. It is applied here and the
   * result published to everyone - including back to the peer that asked, whose
   * optimistic swing is corrected if the door turned out to be locked or wedged
   * on this side of the wire.
   */
  applyDoorRequest(doorId: string, open: boolean): void {
    const door = this.#doorById(doorId);
    if (!door) return;
    const was = door.open;
    toggleDoor(door, open);
    if (door.open !== was) this.#playDoor(door);
    this.#net.broadcast({ t: 'door', id: door.id, open: door.open });
  }

  /**
   * Opens a door on this browser and gets the host's ruling on it. The swing
   * starts at once either way: a door that waited a round trip before moving
   * would feel broken, and the host's own `door` message puts it right within
   * one if it disagrees.
   */
  #requestDoor(door: Door, open: boolean): void {
    toggleDoor(door, open);
    this.#playDoor(door);
    if (this.#isHost) this.#net.broadcast({ t: 'door', id: door.id, open: door.open });
    else this.#net.broadcast({ t: 'doorRequest', id: door.id, open });
  }

  /**
   * Doors sound from their state, not from the noise bus, so a door the hunter
   * opens two rooms away is heard by every peer and not just the host.
   */
  #playDoor(door: Door): void {
    this.#audio.play(door.open ? 'door.open' : 'door.close', { at: { x: door.x, z: door.z } });
  }

  /** Only ever reached through a granted `chest` claim - one lid, one lot of loot. */
  #openChest(chestId: string): void {
    const chest = this.#world?.chests.find((candidate) => candidate.id === chestId);
    if (!chest || chest.opened) return;

    chest.opened = true;
    
    if (this.#world) {
      const idx = this.#world.raycastTargets.indexOf(chest.object);
      if (idx >= 0) this.#world.raycastTargets.splice(idx, 1);
      chest.object.traverse((child) => {
        delete child.userData['chestId'];
      });
    }
    
    if (!chest.contents) return;

    // The id is derived from the chest, so every peer names the same item.
    const anchor = chest.contentsAnchor.getWorldPosition(new THREE.Vector3());
    this.#world?.spawnItem(`${chest.id}:loot`, chest.contents, anchor.x, anchor.y, anchor.z);
    chest.contents = null;
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

    // Every peer sees every noise, but only this browser's own goes on its
    // scoreboard line - each peer counts itself and the rest arrive over the
    // wire. Loudness rather than a count: a sprint is not one footstep.
    if (sourceId === this.#net.selfId) this.#count('noiseMade', spec.loudness);

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
   * The same test a hunter's own hearing makes, run locally so every peer can
   * colour the roster. Clients use the last snapshot, which is close enough for
   * a warning light. Any hunter hearing it lights the ring - which is the honest
   * answer, even though it does not say which one.
   */
  #enemyCanHear(loudness: number, radius: number, x: number, z: number): boolean {
    if (!this.#hunters.length) return false;
    const { hearing } = this.#archetype();
    if (loudness * hearing.hearingMultiplier < hearing.threshold) return false;
    return this.#nearestEnemyDistance(x, z) <= radius * hearing.rangeMultiplier;
  }

  /**
   * Numbering is stable for the life of the session: a teammate keeps their
   * line whether they are standing next to you or gone, and slot 1 is always
   * yours whichever order people turned up in.
   */
  #indexOf(id: string, self: boolean): number {
    let index = this.#playerIndex.get(id);
    if (index === undefined) {
      index = self ? 1 : Math.max(2, this.#playerIndex.size + 1);
      this.#playerIndex.set(id, index);
    }
    return index;
  }

  /**
   * The roster runs off `RunState` rather than off the bodies in the scene, so
   * somebody who dropped out keeps their line - greyed, but there. A team of
   * four that becomes a team of three should be able to see that happen.
   */
  #pushRoster(): void {
    const self = this.#net.selfId;
    const roster: RosterEntry[] = this.#run.players.map((player) => ({
      id: player.id,
      index: this.#indexOf(player.id, player.id === self),
      health: player.id === self ? (this.#player?.health.state ?? 'healthy') : player.health,
      self: player.id === self,
      disconnected: player.disconnected,
      escaped: player.escaped,
      pulse: this.#pulses.get(player.id) ?? null,
    }));
    roster.sort((a, b) => a.index - b.index);

    this.#hooks.onRosterChange(roster);
  }

  /**
   * Host -> client hunter transform. Clients never simulate one. An index this
   * browser has no hunter for is dropped rather than grown into: the count comes
   * from the difficulty overlay both ends already applied, so a mismatch means
   * the snapshot is wrong, not that the list is short.
   */
  setEnemyTransform(transform: EnemyTransform): void {
    const hunter = this.#hunters[transform.index];
    if (!hunter) return;
    hunter.view = transform;
    hunter.buffer.push({ x: transform.x, z: transform.z, yaw: transform.yaw, pitch: 0, height: 0 }, now());
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
    // The host plays this from the attack itself; a client only learns of it
    // here, and `hit` does not name a hunter - so it comes from whichever one is
    // standing on top of you, which is the one that just swung.
    const caught = this.#player ? this.#nearestEnemy(this.#player.x, this.#player.z) : null;
    if (this.#net.role === 'client' && caught) {
      this.#audio.play('enemy.attack', { at: this.#enemyPosition(caught) });
    }
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

  /**
   * A peer is out through the door. Their body stops being drawn, hunted and
   * thrown at from here - they are not in the building any more - and anybody
   * spectating them is moved on by `#updateSpectator` on the next tick.
   */
  markEscaped(id: string): void {
    this.#run.setEscaped(id);
    this.#pushRoster();
    this.#pushScoreboard();
  }

  endWiped(): void {
    if (this.#over) return;
    this.#over = true;
    this.#audio.stopSustains();
    this.#audio.play('run.wiped');
    this.#sendStats(0, true);
    this.#hooks.onWiped();
    this.#pushScoreboard();
  }

  /* --- scoreboard ---------------------------------------------------------- */

  /** Credits the local player. Remote lines only ever arrive over the wire. */
  #count(stat: StatId, amount = 1): void {
    this.#stats.add(this.#net.selfId, stat, amount);
  }

  /** A teammate's own tally. Whole, so a lost message costs nothing. */
  setStats(id: string, stats: PlayerStats): void {
    this.#stats.set(id, sanitiseStats(stats));
    // A column that filled in after the screen went up must not stay at zero.
    if (this.#over || this.#escaped) this.#pushScoreboard();
  }

  /**
   * Sends this player's block when it has changed, at most once a second - the
   * scoreboard is the only thing that reads it, so it is never urgent until the
   * run ends, and `force` is exactly that moment.
   */
  #sendStats(dt: number, force = false): void {
    this.#statsTimer -= dt;
    if (!force && this.#statsTimer > 0) return;
    if (!this.#stats.takeDirty() && !force) return;

    this.#statsTimer = STATS_INTERVAL_SECONDS;
    this.#net.broadcast({ t: 'stats', id: this.#net.selfId, stats: this.#stats.get(this.#net.selfId) });
  }

  /**
   * One column per player, in roster order. Built fresh each time rather than
   * kept, because it is read a handful of times at the end of a run and the
   * inputs (health, escaped, tallies) all live somewhere else already.
   */
  scoreboard(): ScoreRow[] {
    const self = this.#net.selfId;

    // Off `RunState`, so a player who dropped out halfway still gets a column.
    // Their tally was arriving every second until the moment they went.
    const rows: ScoreRow[] = this.#run.players.map((player) => {
      const mine = player.id === self;
      const health = mine ? (this.#player?.health.state ?? 'healthy') : player.health;
      // Getting out outranks everything; leaving outranks how you were when you did.
      const status = player.escaped ? 'escaped' : player.disconnected ? 'disconnected' : health;
      // Cached per outfit inside `playerPortrait`, which matters: this whole
      // block runs again every time a late tally lands.
      const cosmetic = this.#net.cosmeticOf(player.id) ?? defaultCosmetic(this.#config.player);
      return {
        id: player.id,
        index: this.#indexOf(player.id, mine),
        self: mine,
        portrait: playerPortrait(this.#config.player, this.#config.world, cosmetic),
        colourHex: colourHexOf(this.#config.player, cosmetic.colourId),
        status,
        stats: this.#stats.get(player.id),
      };
    });

    rows.sort((a, b) => a.index - b.index);
    return rows;
  }

  #pushScoreboard(): void {
    this.#hooks.onScoreboard(this.scoreboard());
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

  /**
   * `live` is false while the world is built but the run is still held at the
   * loading screen waiting for the rest of the team. Everything still presents -
   * the camera is in the room you will start in, the conversation carries on -
   * but the hunter does not move and nothing can be touched. The one thing a
   * shared start has to prevent is somebody being hunted while a teammate is
   * still generating the map.
   */
  update(dt: number, controlsEnabled: boolean, live = true): void {
    const world = this.#world;
    const player = this.#player;
    if (!world || !player) return;

    // A flare in the face takes the controls away, not the camera: you are stood
    // there, blind, listening to something decide what to do about you.
    this.#stunFor = Math.max(0, this.#stunFor - dt);
    // Out of the run there is nothing to aim, carry, open or be stunned by. The
    // only input left is which pair of eyes to sit behind.
    const spectating = this.spectating;
    const active = controlsEnabled && live && this.#stunFor <= 0 && !spectating;

    if (active) {
      const look = this.#input.consumeLook();
      applyLook(player, look.x, look.y, this.#config.player, this.#input.mouseSensitivity, this.#input.invertY);

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
    // Whose eyes the world is drawn, culled, lit and listened to from. Every
    // one of those has to agree, or a spectator gets a room culled around the
    // body they are standing in rather than the one they are watching.
    if (spectating) this.#updateSpectator(controlsEnabled && live);
    const eye = this.#eye(player);
    this.#updateCamera(eye);
    this.#updateGiveUp(dt, player, controlsEnabled && live);
    // One ray a tick, read by both E and the hand buttons.
    this.#look = active ? this.#lookTag(world) : null;
    this.#updateInteraction(dt, active);
    this.#updateItems(dt, player, active);
    if (!spectating) this.#updateFootsteps(dt, player);
    this.#updateVoice(dt, player);

    const { doors, containers } = this.#config.world;
    updateDoors(world.doors, dt, doors.openSeconds, doors.closeSeconds);
    updateChests(world.chests, dt, containers.chestOpenHoldSeconds);
    updateLockers(world.lockers, dt, containers.lockerEnterSeconds, containers.lockerExitSeconds);
    if (this.#hiding && !this.#hiding.active && this.#hiding.locker.progress === 0) this.#hiding = null;

    this.#updateProjectiles(dt);
    this.#updateEffects(dt);
    this.#updateEnemy(dt, player, live);
    this.#tutorialCues();
    // One tick, one chance to be heard or seen. Nothing here ages.
    this.#noise.clear();
    this.#lockerEntries.length = 0;

    // After `#updateCamera`: culling projects each doorway through the camera
    // that is about to be rendered with, not the one from the previous tick.
    world.updateVisibility(
      this.#renderer.camera,
      eye.x,
      eye.z,
      this.#config.graphics.renderDistanceRooms * this.#config.world.grid.cellSize,
    );
    this.#renderer.updateLights(dt, eye.x, eye.z);
    this.#interpolateRemotes(dt);
    // A spectator has no body left to broadcast. The last transform they sent
    // went out when they left the run, with their hands already empty.
    if (!spectating) this.#sendTransform(dt, player);
    this.#sendStats(dt);
  }

  /* --- spectating ----------------------------------------------------------- */

  /**
   * Everyone still down there, in roster order so that "next" means the same
   * thing to every spectator watching the same run. Escaped, dead and dropped
   * players are not on it; DOWNED players are, because somebody lying on a
   * floor is exactly the person a spectator wants to be watching.
   */
  #spectateTargets(): string[] {
    return [...this.#remotes.keys()]
      .filter((id) => this.#run.isInMap(id))
      .sort((a, b) => this.#indexOf(a, false) - this.#indexOf(b, false));
  }

  /**
   * Takes this player out of the run and puts them behind somebody else's eyes.
   * Called once, from the exit door or from giving up on the floor.
   */
  #enterSpectate(player: PlayerState): void {
    // One last transform, so every peer's copy of this body agrees it is empty
    // handed before it stops moving - otherwise a later disconnect would spawn
    // a second copy of whatever it was last seen holding.
    this.#sendTransform(0, player, true);
    this.#resetHold();
    // Only what this player was doing, NOT `#clearItemState()` - the tar, the
    // clocks and everyone else's thrown items belong to a run that is still
    // going on without them.
    this.#cancelAim();
    this.#itemHold = null;
    this.#stunFor = 0;
    this.#pushUse(null);
    this.#updateUseLoop(null);
    this.#updateHoldLoop(null);
    this.#hiding = null;
    this.#giveUpHold = 0;
    this.#pushGiveUp(0);
    this.#spectating = null;
    this.#updateSpectator(false);
  }

  /**
   * Keeps the spectator pointed at somebody who is still in the map, and reads
   * the two keys that change who that is. Handing the UI `null` is how the run
   * ends for a spectator: there is nobody left to watch, so it is over.
   */
  #updateSpectator(controlsEnabled: boolean): void {
    const targets = this.#spectateTargets();

    if (!targets.length) {
      this.#spectating = null;
      this.#pushSpectate(null);
      return;
    }

    let position = this.#spectating ? targets.indexOf(this.#spectating) : -1;
    // Whoever we were watching got out, gave up or dropped: fall to the first
    // person still down there rather than to a black screen.
    if (position < 0) position = 0;

    if (controlsEnabled) {
      if (this.#input.justPressed('spectateNext')) position += 1;
      if (this.#input.justPressed('spectatePrev')) position -= 1;
      position = (position + targets.length) % targets.length;
    }

    const targetId = targets[position]!;
    if (targetId !== this.#spectating) this.#audio.play('ui.click');
    this.#spectating = targetId;
    this.#pushSpectate({
      targetId,
      index: this.#indexOf(targetId, false),
      position: position + 1,
      count: targets.length,
    });
  }

  #pushSpectate(view: SpectateView | null): void {
    const signature = view ? `${view.targetId}|${view.position}|${view.count}` : '';
    if (signature === this.#spectateSignature) return;
    this.#spectateSignature = signature;
    this.#hooks.onSpectate(view);
  }

  /**
   * Where the camera, the ears, the lights and the culling all sit this tick:
   * your own eyes, or the eyes of whoever you are watching. A spectator with no
   * target keeps the last place they were, which is only ever on screen for the
   * frame before the scoreboard replaces it.
   */
  #eye(player: PlayerState): { x: number; y: number; z: number; yaw: number; pitch: number } {
    const remote = this.#spectating ? this.#remotes.get(this.#spectating) : null;
    if (!remote || remote.buffer.empty) {
      return {
        x: player.x,
        y: eyeHeight(player, this.#config.player),
        z: player.z,
        yaw: player.yaw,
        pitch: player.pitch,
      };
    }

    // Drawn from the same buffer their body is, so the view does not run ahead
    // of the map it is looking at.
    const view = remote.buffer.sample(now());
    const body = this.#config.player.body;
    const height = isDown(remote.target.health) ? body.downedEyeHeight : view.height + body.eyeHeightOffset;
    return { x: view.x, y: height, z: view.z, yaw: view.yaw, pitch: view.pitch };
  }

  /* --- giving up ------------------------------------------------------------ */

  /**
   * The one way off the floor that is not a teammate. Nobody bleeds out here,
   * so a downed player with nobody coming would otherwise be stuck watching a
   * corridor until the run ended around them.
   */
  #updateGiveUp(dt: number, player: PlayerState, enabled: boolean): void {
    const holding =
      enabled && !this.spectating && player.health.state === 'downed' && this.#input.isDown('giveUp');

    if (!holding) {
      this.#giveUpHold = 0;
      this.#pushGiveUp(0);
      return;
    }

    const seconds = this.#config.player.health.giveUpHoldSeconds;
    this.#giveUpHold += dt;
    this.#pushGiveUp(Math.min(1, this.#giveUpHold / Math.max(0.01, seconds)));
    if (this.#giveUpHold < seconds) return;

    const state = applyGiveUp(player.health);
    if (!state) return;

    // Everything in their hands hits the floor where they lay, for exactly the
    // reason a dropped peer's does: a key that leaves the map inside somebody
    // who has stopped playing is a run nobody can finish.
    for (const hand of HANDS) {
      const itemId = dropFrom(this.#inventory, hand);
      if (itemId) this.#dropIntoWorld(itemId, player);
    }
    this.#pushHands();

    this.#announceHealth(state);
    this.#enterSpectate(player);
  }

  #pushGiveUp(progress: number): void {
    if (progress === this.#giveUpPushed) return;
    this.#giveUpPushed = progress;
    this.#hooks.onGiveUpProgress(progress);
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
    const spectator = this.spectating;

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

  #updateEnemy(dt: number, player: PlayerState, live: boolean): void {
    const world = this.#world;
    const graph = this.#graph;
    if (!world || !graph) return;

    if (this.#isHost && live) {
      // Every hunter perceives the same world in the same tick, so the targets
      // and the lockers are gathered once rather than per hunter.
      const targets = this.#perceptionTargets(player);
      const lockers = this.#enemyLockers(player);

      for (const hunter of this.#hunters) {
        const enemy = hunter.state;
        if (!enemy) continue;

        updateEnemy(enemy, dt, {
          targets,
          noise: this.#noise.events,
          lockerEntries: this.#lockerEntries,
          others: this.#otherHunters(hunter),
          graph,
          doors: this.#doorsById,
          lockers,
          collision: world.collision,
          config: this.#archetype(),
          rng: hunter.rng,
          slowAt: (x, z) => this.#effects.slowAt(x, z),
          openDoor: (doorId) => this.#enemyOpensDoor(doorId),
          attack: (targetId) => this.#enemyAttacks(hunter, targetId),
          searchLocker: (lockerId) => this.#enemySearchesLocker(lockerId),
        });

        hunter.view = { index: hunter.view.index, x: enemy.x, z: enemy.z, yaw: enemy.yaw, alert: enemy.alert };
      }

      this.#sendEnemy(dt);
      this.#checkRunOver();
    }

    this.#drawEnemies();
    this.#updateFeedback(dt, player);
  }

  /**
   * What one hunter knows about the others: nothing but where they are and where
   * they are heading, and only so that patrols spread out over the map instead
   * of stacking up in one wing. They share no perception and no target.
   */
  #otherHunters(self: Hunter): EnemyPeer[] {
    const others: EnemyPeer[] = [];
    for (const hunter of this.#hunters) {
      if (hunter === self || !hunter.state) continue;
      others.push({ x: hunter.state.x, z: hunter.state.z, destination: hunter.state.destination });
    }
    return others;
  }

  /** Offline counts as host: there is nobody else to run the simulation. */
  get #isHost(): boolean {
    return this.#net.role !== 'client';
  }

  #perceptionTargets(player: PlayerState): PerceptionTarget[] {
    const targets: PerceptionTarget[] = [];

    // Nobody who is out of the run is a target. An escaped player is not in the
    // building and a dead one is not a threat, an interest or a body it could
    // walk to - and leaving them in gave the hunter something to stand and
    // stare at for the rest of the run.
    if (!this.spectating) {
      targets.push({
        id: this.#net.selfId,
        x: player.x,
        z: player.z,
        crouching: player.crouching,
        hidden: this.#hiding?.active === true,
        downed: isDown(player.health.state),
        inDarkness: this.#inDarkness(player.x, player.z),
      });
    }

    for (const [id, remote] of this.#remotes) {
      if (!this.#run.isInMap(id)) continue;
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

  #enemyAttacks(hunter: Hunter, targetId: string): void {
    this.#audio.play('enemy.attack', { at: this.#enemyPosition(hunter) });
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
    // One message per hunter, each naming its index. They are sent whole and
    // re-sent every tick, so one lost on the way costs nothing.
    for (const hunter of this.#hunters) this.#net.broadcast({ t: 'enemy', ...hunter.view });
  }

  /**
   * The two moments a hunter changes the situation, reported once each.
   *
   * `heard` is any hunter leaving `calm`: it has something to go and look at,
   * and the honest advice is the same whatever put it there. `seen` is one
   * actually chasing.
   *
   * On the HOST that is exact - the hunter's target is right there. A client
   * only ever receives an alert level, so on a client "chasing somebody" has to
   * stand in for "chasing you". Both come out identical in the solo and hosted
   * runs a player learning the game is in, and telling a client to run from a
   * hunter that is chasing their teammate two rooms away is not bad advice.
   */
  #tutorialCues(): void {
    let heard = false;
    let seen = false;

    for (const hunter of this.#hunters) {
      if (hunter.view.alert !== 'calm') heard = true;
      if (hunter.view.alert !== 'chasing') continue;
      seen ||= hunter.state ? hunter.state.targetId === this.#net.selfId : true;
    }

    if (heard && !this.#cued.heard) this.#hooks.onTutorial('heard');
    if (seen && !this.#cued.seen) this.#hooks.onTutorial('seen');
    this.#cued = { heard, seen };
  }

  /** Presentation only: the sim never reads back from the art. */
  #drawEnemies(): void {
    for (const hunter of this.#hunters) {
      const art = hunter.art;
      if (!art) continue;

      // The host owns the sim, so it draws exactly where the hunter is. A client
      // has only snapshots, so it plays them back through the same buffer the
      // remote players use.
      const view = this.#isHost ? hunter.view : hunter.buffer.sample(now());
      art.object.position.x = view.x;
      art.object.position.z = view.z;
      art.root.rotation.y = view.yaw;

      if (hunter.artAlert !== hunter.view.alert) {
        hunter.artAlert = hunter.view.alert;
        art.setAlert?.(hunter.artAlert);
      }
    }
  }

  #updateFeedback(dt: number, player: PlayerState): void {
    // Two hunters do not make two heartbeats: the screen and the mix answer to
    // the nearest one and to the most worked-up one, which need not be the same.
    const distance = this.#nearestEnemyDistance(player.x, player.z);
    // A spectator has no body to be hurt in, so no vignette belongs on their
    // screen - and `dead` would otherwise read as the downed one for good.
    const spectating = this.spectating;
    this.#renderer.feedback.update(dt, {
      alert: this.#peakAlert() as AlertLevel,
      enemyDistance: distance,
      injured: !spectating && player.health.state === 'injured',
      downed: !spectating && isDown(player.health.state),
    });
    this.#updateAudio(distance);
  }

  /** Metres to the closest hunter, or `Infinity` when there is none in the map. */
  #nearestEnemyDistance(x: number, z: number): number {
    let nearest = Infinity;
    for (const hunter of this.#hunters) {
      nearest = Math.min(nearest, Math.hypot(hunter.view.x - x, hunter.view.z - z));
    }
    return nearest;
  }

  /** The hunter a sound at `(x, z)` most likely came from. Null with none in the map. */
  #nearestEnemy(x: number, z: number): Hunter | null {
    let nearest: Hunter | null = null;
    let best = Infinity;
    for (const hunter of this.#hunters) {
      const distance = Math.hypot(hunter.view.x - x, hunter.view.z - z);
      if (distance >= best) continue;
      best = distance;
      nearest = hunter;
    }
    return nearest;
  }

  /** The highest alert level any hunter is at, by `alert.levels` order. */
  #peakAlert(): string {
    const { levels } = this.#archetype().alert;
    let peak = levels[0] ?? 'calm';
    for (const hunter of this.#hunters) {
      if (levels.indexOf(hunter.view.alert) > levels.indexOf(peak)) peak = hunter.view.alert;
    }
    return peak;
  }

  /** Where a hunter actually is on the host, where it was last seen on a client. */
  #enemyPosition(hunter: Hunter): { x: number; z: number } {
    const enemy = hunter.state;
    if (enemy && this.#isHost) return { x: enemy.x, z: enemy.z };
    return { x: hunter.view.x, z: hunter.view.z };
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
    const over = this.spectating || this.#over;
    const closeness = over ? 0 : heartbeatCloseness(this.#config.player, enemyDistance);
    const alert = over ? 'calm' : this.#peakAlert();

    this.#audio.sustain('heartbeat', 'player.heartbeat', {
      on: closeness > 0,
      level: closeness,
      rate: 1 + closeness * (cues.heartbeatMaxRate - 1),
    });

    // One drone each, spatialised where each hunter is: the drone is how you
    // work out there are two of them, and where the other one went.
    for (const hunter of this.#hunters) {
      this.#audio.sustain(`enemy:${hunter.view.index}`, 'enemy.idle.loop', {
        on: !over && hunter.art !== null,
        at: this.#enemyPosition(hunter),
      });
    }

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

  /** `eye` is the local player's, or - for a spectator - the one they borrowed. */
  #updateCamera(eye: { x: number; y: number; z: number; yaw: number; pitch: number }): void {
    const camera = this.#renderer.camera;
    let { x, y, z } = eye;

    // Sliding into and out of a locker is the same lerp, driven by its animation.
    const hiding = this.#hiding;
    if (hiding) {
      const t = hiding.locker.progress;
      x += (hiding.locker.inside.x - x) * t;
      y += (hiding.locker.inside.y - y) * t;
      z += (hiding.locker.inside.z - z) * t;
    }

    camera.position.set(x, y, z);
    camera.rotation.set(eye.pitch, eye.yaw, 0, 'YXZ');
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
        this.#requestDoor(door, !door.open);
        if (door.open) this.#count('doorsOpened');
        // Closing a door behind you is a slam - louder than opening one, and
        // sometimes worth it anyway.
        this.#emitNoise(door.open ? 'doorOpen' : 'doorSlam', door.x, door.z);
        break;
      }
      case 'unlock': {
        const door = this.#doorById(target.id);
        const used = hand ?? this.#keyHand();
        if (!door || !used) break;
        // The key stays in the hand until the host confirms the lock was still
        // there to turn. Two people with keys must not both spend one on it.
        this.#claim('unlock', door.id, 0, { itemId: KEY_ITEM, hand: used });
        break;
      }
      case 'forceOpen': {
        const door = this.#doorById(target.id);
        if (!door || !isBarricaded(door)) break;
        this.#clearBarricade(door.id);
        this.#net.broadcast({ t: 'barricade', id: door.id, seconds: 0 });
        this.#requestDoor(door, true);
        this.#count('doorsOpened');
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
          // The tally goes out before the screen does, so the teammates still
          // down there have this player's final column already.
          this.#sendStats(0, true);
          this.#hooks.onEscaped();
          this.#pushRoster();
          this.#pushScoreboard();
          // Out of the run, not out of the game: the purse keeps filling behind
          // them for as long as they stay and watch.
          this.#enterSpectate(player);
        }
        break;
      case 'chest': {
        const chest = world.chests.find((candidate) => candidate.id === target.id);
        this.#hooks.onTutorial('chest');
        // The lid is the host's to lift, so one chest yields one lot of loot.
        this.#claim('chest', target.id);
        // The noise is not: you wrenched at it whether or not you were first,
        // and the whole map heard you do it.
        if (chest) this.#emitNoise('chestOpen', chest.x, chest.z);
        break;
      }
      case 'item':
        this.#pickUp(target.id);
        break;
      case 'revive':
        this.#net.broadcast({ t: 'revive', id: target.id });
        // Picking someone up off the floor counts as a heal, and it is the one
        // that costs nothing but the time you stood there in the open.
        this.#count('heals');
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
    if (!world || !this.#player) return;

    const item = world.items.get(worldItemId);
    if (!item) return;

    // Coins never reach a hand. Nobody should have to decide whether picking
    // money up is worth a slot, and nobody should have to argue about who did -
    // so there is nothing to show early either, and they simply wait for the
    // host's word.
    const def = itemDef(this.#config.items, item.itemId);
    if (def && def.occupiesSlot === false) {
      this.#claim('take', worldItemId, 0, { itemId: item.itemId });
      return;
    }

    // Into the hand at once, and back out again if the host says somebody else
    // reached it first. A pick-up is a press: a hand that filled a round trip
    // later would feel broken every single time.
    this.#audio.play('item.pickup');
    const { hand, displaced } = takeItem(this.#inventory, item.itemId);
    this.#pushHands();

    // The claim goes out BEFORE the item leaves this browser's world, because on
    // the host this browser IS the arbiter: taking it off the floor first would
    // have it rule that the item was already gone and deny its own pick-up.
    // A displaced item waits for the answer too, so a refused swap costs nothing.
    this.#claim('take', worldItemId, 0, {
      itemId: item.itemId,
      hand,
      displaced,
      x: item.x,
      y: item.y,
      z: item.z,
    });

    // A client shows it gone at once; on the host the grant has already done it.
    world.removeItem(worldItemId);
  }

  /**
   * A pile of coins, spent the instant it is touched. Every peer runs this off
   * the same grant and reaches the same number, so the purse needs no message
   * of its own and cannot drift when one goes missing.
   */
  #collect(worldItemId: string, def: ItemDef, by: string, at: { x: number; z: number } | null): void {
    const min = Math.round(itemParam(def, 'minValue', 0));
    const max = Math.round(itemParam(def, 'maxValue', min));
    // Derived from the run seed and the item's own id, so the pile in the cellar
    // is worth the same to whoever gets to it first.
    const rng = stream(this.#layout?.seed ?? 0, `coinValue:${worldItemId}`);
    const amount = Math.max(1, rangeInt(rng, min, max + 1));

    // In your own hands, or over where they picked it up.
    const self = by === this.#net.selfId;
    this.#audio.play('item.coins', self || !at ? {} : { at });
    this.#addCoins(amount);
    // The purse is shared, but who bent down for it is not - the scoreboard
    // credits the pile to whoever walked into it.
    if (self) this.#count('goldCollected', amount);
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
    this.#count('goldCollected', bounty);
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
      keyCode: this.#handKey(hand),
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
          keyCode: this.#handKey(hand),
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
          keyCode: this.#handKey(hand),
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
      // Patching yourself up counts too. It is still a bandage spent on keeping
      // somebody on their feet, and it is still one you cannot use later.
      this.#count('heals');
      if (hold.def.consumedOnUse) {
        this.#count('itemsUsed');
        dropFrom(this.#inventory, hold.hand);
        this.#pushHands();
      }
      return;
    }

    if (hold.def.behaviour === 'barricade' && hold.targetId) {
      // The planks and the item that became them are both spent on the grant,
      // so two people wedging one door cannot cost two barricades.
      const seconds = itemParam(hold.def, 'openSeconds', 9);
      this.#claim('barricade', hold.targetId, seconds, { itemId: hold.itemId, hand: hold.hand });
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
    return this.#input.bindingFor(hand === 'left' ? 'useLeft' : 'useRight');
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
      keyCode: this.#handKey(aim.hand === 'left' ? 'right' : 'left'),
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
    this.#count('itemsUsed');
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
    if (player && !this.spectating && Math.hypot(player.x - at.x, player.z - at.z) <= radius) {
      this.#stunFor = Math.max(this.#stunFor, itemParam(def, 'playerStunSeconds', 2.2));
      this.#renderer.feedback.blind(itemParam(def, 'blindSeconds', 3));
      this.#cancelAim();
      this.#itemHold = null;
    }

    if (!this.#isHost) return;
    // Every hunter in the light, not just the one it was aimed at: a flare going
    // off in a room does not get to pick which of them was looking.
    for (const hunter of this.#hunters) {
      const enemy = hunter.state;
      if (!enemy || Math.hypot(enemy.x - at.x, enemy.z - at.z) > radius) continue;
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
    // An effect id is minted once and never reused, so its voice goes with it -
    // a long run gets through a lot of alarm clocks.
    this.#audio.releaseSustain(`effect:${effect.id}`);
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
    // Bodies that are out of the run are out of the list on every peer alike,
    // which is what keeps four independent simulations of one arc agreeing.
    const bodies: ProjectileBody[] = [];
    if (!this.spectating) {
      bodies.push({ id: this.#net.selfId, x: player.x, z: player.z, radius, height: standHeight });
    }
    for (const [id, remote] of this.#remotes) {
      if (!this.#run.isInMap(id)) continue;
      bodies.push({ id, x: remote.target.x, z: remote.target.z, radius, height: standHeight });
    }
    const enemy = this.#archetype().body;
    for (const hunter of this.#hunters) {
      bodies.push({
        id: `enemy:${hunter.view.index}`,
        x: hunter.view.x,
        z: hunter.view.z,
        radius: enemy.radius,
        height: enemy.height,
      });
    }

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

  #dropAt(itemId: string, x: number, y: number, z: number): void {
    const world = this.#world;
    if (!world) return;

    // Ids are namespaced by peer so two players dropping at once cannot collide.
    const id = `drop:${this.#net.selfId}:${this.#dropCount++}`;
    world.spawnItem(id, itemId, x, y, z);
    this.#net.broadcast({ t: 'drop', id, itemId, x, y, z });
    this.#emitNoise('itemDrop', x, z);
  }

  #dropIntoWorld(itemId: string, player: PlayerState): void {
    const reach = this.#config.items.defaults.dropForwardOffset;
    const x = player.x - Math.sin(player.yaw) * reach;
    const z = player.z - Math.cos(player.yaw) * reach;
    this.#dropAt(itemId, x, 0, z);
  }

  /**
   * One ray down the crosshair per tick, shared by E and by the hand buttons.
   *
   * A ray rather than a distance check, so you cannot open a door through the
   * wall next to it - or bandage a teammate standing on the other side of one.
   */
  #lookTag(world: BuiltWorld): { key: string; value: string } | null {
    const camera = this.#renderer.camera;
    const raycaster = this.#raycaster;
    raycaster.setFromCamera(CENTRE_SCREEN, camera);
    raycaster.far = this.#config.player.interaction.rayLength;

    // Two passes, because room geometry is nine tenths of the triangles in the
    // map and can only ever take a target AWAY. Doors, containers, items and
    // teammates are small, few, and rejected on a bounding sphere the ray
    // misses; a room is a couple of hundred merged boxes whose bounding sphere
    // the camera is standing INSIDE, so every one of its triangles gets tested.
    // Asking the cheap question first turns a ray that cost 20 ms a tick into
    // one that usually costs nothing at all.
    this.#lookCandidates.length = 0;
    for (const target of world.raycastTargets) this.#lookCandidates.push(target);
    // Teammates are in the scene rather than the world, so they join the ray here.
    for (const remote of this.#remotes.values()) this.#lookCandidates.push(remote.object);

    const hit = raycaster.intersectObjects(this.#lookCandidates, true)[0];

    // Something is in reach; the only question left is whether a wall is in the
    // way. Only rooms being drawn can be, and only nearer than the hit itself.
    const precise = hit && !this.#occluded(world, hit.distance) ? findTag(hit.object) : null;
    if (precise) return precise;

    // Nothing exact under the crosshair. An item is allowed a second, blunter
    // chance at it - see `#softItemTag`.
    raycaster.far = this.#config.player.interaction.rayLength;
    return this.#softItemTag(world);
  }

  /** Whether a drawn room stands between the eye and something `distance` away. */
  #occluded(world: BuiltWorld, distance: number): boolean {
    const raycaster = this.#raycaster;
    this.#lookCandidates.length = 0;
    for (const occluder of world.occluders) if (occluder.visible) this.#lookCandidates.push(occluder);
    raycaster.far = distance - 0.3;
    return raycaster.intersectObjects(this.#lookCandidates, true).length > 0;
  }

  /**
   * The forgiving half of the look-ray, and what `interaction.rayRadius` is for.
   *
   * A door or a chest is most of a wall and an exact ray finds it every time. A
   * key is four centimetres of geometry lying on floorboards, and having to put
   * the crosshair on the model itself turns picking it up into a game of its
   * own. So items - and ONLY items - also answer to a cylinder around the ray:
   * the model's own bounding radius plus `rayRadius`, so a big thing is easier
   * to hit than a small one and a small one is still easy enough.
   *
   * It runs only when the exact ray offered nothing, so it can never take a
   * press away from the door behind the key.
   */
  #softItemTag(world: BuiltWorld): { key: string; value: string } | null {
    const { rayLength, rayRadius } = this.#config.player.interaction;
    const { origin, direction } = this.#raycaster.ray;

    let best: { id: string; along: number; radius: number } | null = null;

    for (const [id, item] of world.items) {
      // Cheap reject on the anchor first: at 2.6 m of reach this leaves the one
      // or two items actually near you, and only those pay for a bounding box.
      OFFSET.set(item.x - origin.x, item.y - origin.y, item.z - origin.z);
      if (OFFSET.lengthSq() > (rayLength + 1) ** 2) continue;

      const bounds = this.#itemSize(item.object);
      if (!bounds) continue;

      OFFSET.set(
        item.object.position.x + bounds.dx - origin.x,
        item.object.position.y + bounds.dy - origin.y,
        item.object.position.z + bounds.dz - origin.z,
      );
      const along = OFFSET.dot(direction);
      if (along < 0 || along > rayLength) continue;
      if (best && along >= best.along) continue;

      // Perpendicular distance from the ray, by Pythagoras on the projection.
      const reach = bounds.radius + rayRadius;
      if (OFFSET.lengthSq() - along * along > reach * reach) continue;

      best = { id, along, radius: bounds.radius };
    }

    if (!best) return null;

    // Same wall test the exact ray gets, but measured to the NEAR SIDE of the
    // item rather than to its centre. Aim through a gap in the model - between
    // the prongs of a key - and the ray carries on to the floor the key is lying
    // on, a few centimetres short of its middle. Testing to the centre made that
    // floor an occluder, so the one place you would naturally point at a key was
    // the one place it could not be picked up.
    // const clear = Math.max(0, best.along - best.radius);
    // if (clear > 0 && this.#occluded(world, clear)) return null;
    return { key: 'worldItemId', value: best.id };
  }

  /** An item model's extent, measured once and remembered. */
  #itemSize(object: THREE.Object3D): { dx: number; dy: number; dz: number; radius: number } | null {
    const cached = this.#itemBounds.get(object);
    if (cached) return cached;

    const box = ITEM_BOX.setFromObject(object);
    if (box.isEmpty()) return null;
    box.getBoundingSphere(ITEM_SPHERE);

    const bounds = {
      dx: ITEM_SPHERE.center.x - object.position.x,
      dy: ITEM_SPHERE.center.y - object.position.y,
      dz: ITEM_SPHERE.center.z - object.position.z,
      radius: ITEM_SPHERE.radius,
    };
    this.#itemBounds.set(object, bounds);
    return bounds;
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

  /**
   * Remote bodies are drawn from their snapshot buffers rather than chased with
   * a lerp: playback runs `interpolationDelayMs` behind, so there is a sample on
   * each side of the playback head and a body moves at the speed it was
   * actually moving. See `src/net/interpolation.ts`.
   */
  #interpolateRemotes(dt: number): void {
    const at = now();
    const blend = Math.min(1, dt * 12);

    for (const [id, remote] of this.#remotes) {
      // Nothing has been heard from them yet: a body at the origin is worse
      // than no body at all. An escaped one is worse still - they walked out of
      // the building, and a copy of them left standing at the exit door reads
      // as a teammate who is still with you.
      if (remote.buffer.empty || this.#run.get(id)?.escaped) {
        remote.object.visible = false;
        continue;
      }
      remote.object.visible = true;

      const view = remote.buffer.sample(at);
      remote.object.position.x = view.x;
      remote.object.position.z = view.z;
      remote.root.rotation.y = view.yaw;
      remote.root.scale.y = view.height / this.#config.player.body.standHeight;

      // Health is a state rather than a transform, so it still eases: it is the
      // pose changing, not the body moving.
      const down = isDown(remote.target.health) ? Math.PI / 2 : 0;
      remote.root.rotation.x += (down - remote.root.rotation.x) * blend;
    }
  }

  /** `force` sends one out of turn - the last word from a body about to stop. */
  #sendTransform(dt: number, player: PlayerState, force = false): void {
    if (this.#net.role === 'offline') return;

    this.#moveTimer -= dt;
    if (this.#moveTimer > 0 && !force) return;
    this.#moveTimer = 1 / this.#config.net.simulation.snapshotRateHz;

    this.#net.broadcast({
      t: 'move',
      id: this.#net.selfId,
      x: player.x,
      z: player.z,
      yaw: player.yaw,
      // Nothing draws a body with this. It is here so a spectator can sit
      // behind these eyes rather than at their shoulder height looking level.
      pitch: player.pitch,
      height: player.height,
      // The host's enemy needs to know who is hidden and who is already down.
      hiding: this.#hiding?.active === true,
      health: player.health.state,
      // Two strings that are usually null, so that a key does not leave the map
      // inside a closed tab - see `#dropRemoteItems`.
      left: this.#inventory.left,
      right: this.#inventory.right,
    });
  }
}

/** One monotonic clock for every replicated transform, in seconds. */
function now(): number {
  return performance.now() / 1000;
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
