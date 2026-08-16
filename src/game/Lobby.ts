/**
 * The lobby: everything that happens in the cabin between runs.
 *
 * It is deliberately its own orchestrator rather than a mode of `Game`. The two
 * share a player controller and a camera and nothing else - the lobby has no
 * enemy, no noise bus, no health, no items and no doors, and `Game` is already
 * the largest file in `src/`. What they genuinely share (`stepPlayer`, the voice
 * update, the shared-art player model) is imported, not duplicated.
 *
 * Authority mirrors the run: the host owns the tally, the difficulty and the
 * countdown, and publishes the whole lobby on every change. Clients send what
 * they did and apply what comes back. A solo player is their own host and skips
 * the countdown entirely - there is nobody to wait for.
 */
import * as THREE from 'three';
import { clearGeometryCache } from '@art/lib/build';
import type { RoomDims } from '@art/lib/contract';
import { resolveArt } from '@art/shared/index';
import type { Config } from '@/config/index';
import { randomSeed, stream } from '@/core/rng';
import { applyLook, createPlayerState, eyeHeight, stepPlayer, type PlayerState } from '@/entities/player';
import { createDart, dartVelocity, stepDart, type Dart, type DartLanding, type DartWorld } from '@/entities/dart';
import { HANDS, type Hand } from '@/entities/items';
import type { Audio } from '@/audio/index';
import type { Input } from '@/input/index';
import { TransformBuffer } from '@/net/interpolation';
import type { LobbySnapshot, Net, RunStart } from '@/net/index';
import { nowSeconds } from '@/net/timing';
import type { Renderer } from '@/render/Renderer';
import type { Save } from '@/save/index';
import type { VoiceChat } from '@/voice/index';
import { buildLobbyScene, RANDOM_PICK, type LobbyPoster, type LobbyWorld } from '@/world/lobbyScene';
import { createPlayerBody, defaultCosmetic, type Cosmetic, type PlayerBody } from '@/render/playerBody';
import type { NameplateView, RosterEntry, UseView } from './Game';

/** What the look-ray is offering in the cabin. Everything here is a press, not a hold. */
export interface LobbyTarget {
  kind: 'poster' | 'posterEmpty' | 'wardrobe' | 'lever' | 'dartStand';
  /** The pick id for a poster, the fixture name otherwise. */
  id: string;
  verbKey: string;
  /** Locale key naming what the prompt is about, where there is one. */
  nameKey?: string;
}

/** One line of the expedition panel: a map somebody picked, and how many picked it. */
export interface PickTally {
  mapId: string;
  nameKey: string;
  votes: number;
  /** Whether this is the local player's own pick. */
  mine: boolean;
}

/** Everything the lobby UI draws. Pushed on change, never polled. */
export interface LobbyView {
  players: number;
  tally: PickTally[];
  difficultyId: string;
  difficultyNameKey: string;
  /** Whole seconds left, or null when nothing is counting. */
  countdown: number | null;
  /** How many players have not picked yet. */
  undecided: number;
}

export interface LobbyHooks {
  onInteractTargetChange(target: LobbyTarget | null): void;
  onViewChange(view: LobbyView): void;
  /**
   * Who is in the cabin. The same shape the run pushes, because it feeds the
   * same two things - the pause menu's per-teammate mutes and the names over
   * their heads - and a second shape for "the people here" would be one more
   * thing to keep in step. Nobody in a cabin is hurt, escaped or gone, so
   * those fields are simply what they always are in here.
   */
  onRosterChange(roster: RosterEntry[]): void;
  /**
   * A dart went into a hand, or left one. Locale keys, not item ids: the cabin
   * has no item roster to look them up in, and the HUD only wants the words.
   */
  onHandsChange(hands: { left: string | null; right: string | null }): void;
  /** What the hand buttons are offering, or null when they are offering nothing. */
  onUseChange(use: UseView | null): void;
  /** The player opened the wardrobe. The screen layer takes it from here. */
  onWardrobe(open: boolean): void;
  /** The countdown finished, or a solo player pressed E. Time to load a map. */
  onStartRun(run: RunStart): void;
  /**
   * A moment the tutorial has a line for: `pick`. Reported rather than acted
   * on - whether anything is drawn is `Tutorial`'s business, and the cabin does
   * not know it exists.
   */
  onTutorial(id: string): void;
}

interface RemotePlayer {
  body: PlayerBody;
  target: { x: number; z: number; yaw: number };
  /**
   * The same playback buffer a run uses. The cabin used to chase the latest
   * packet with an exponential lerp, which is exactly the rubbery motion the
   * run's buffer exists to replace - and a foyer is where you spend the most
   * time looking at other people standing still.
   */
  buffer: TransformBuffer;
}

/** Where the cabin is being looked at from: the player's eyes, blended towards the wardrobe. */
interface CabinEye {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** How often lobby transforms go out. Nothing here is precise; it is a foyer. */
const MOVE_RATE_HZ = 10;

/** Scratch for the nameplate projection, which runs per body per FRAME. */
const HEAD = new THREE.Vector3();

/** Highlight colours for the poster mark: your own pick reads differently. */
const MARK_MINE = '#d8593c';
const MARK_OTHER = '#8a8677';

/** Hand button -> hand, in the order the two are polled. Same as a run's. */
const USE_ACTIONS: readonly (readonly [string, Hand])[] = [
  ['useLeft', 'left'],
  ['useRight', 'right'],
];

/** The one thing you can hold in the cabin. There is no item roster in here. */
const DART_NAME_KEY = 'lobby.dart.name';

/** How far behind the surface a landed dart's origin sits, so its point buries. */
const DART_BURY = 0.045;

export class Lobby {
  readonly #config: Config;
  readonly #renderer: Renderer;
  readonly #input: Input;
  readonly #net: Net;
  readonly #audio: Audio;
  readonly #voice: VoiceChat;
  readonly #save: Save;
  readonly #hooks: LobbyHooks;

  #world: LobbyWorld | null = null;
  #player: PlayerState | null = null;
  #remotes = new Map<string, RemotePlayer>();
  #mannequin: RemotePlayer | null = null;
  #raycaster = new THREE.Raycaster();
  #target: LobbyTarget | null = null;
  #moveTimer = 0;
  #dims: RoomDims;
  /** The enabled maps, in poster order. What a `?` pick is resolved against. */
  #mapIds: readonly string[] = [];

  /* --- the dart minigame ---------------------------------------------------- */
  /** Which hands hold a dart. The stand never runs out, so this is two booleans. */
  #hands = { left: false, right: false };
  /** The hand whose button is down, with a dart drawn in front of the camera. */
  #ready: Hand | null = null;
  #readyArt: THREE.Object3D | null = null;
  /** 0..1 as the held dart is brought up. Pure presentation. */
  #readyBlend = 0;
  /** One dart, built once and cloned per throw - geometry and materials shared. */
  #dartTemplate: { object: THREE.Object3D; dispose?: () => void } | null = null;
  #flying: { dart: Dart; object: THREE.Object3D }[] = [];
  /** Landed darts, oldest first, each with the time it gets pulled out again. */
  #landed: { object: THREE.Object3D; until: number }[] = [];
  #dartCount = 0;
  /**
   * Seconds since this browser entered the cabin. The wind is a pure function
   * of it, and a throw carries its own reading so every peer blows the same way.
   */
  #clock = 0;
  /** Dart totals per peer. Self-reported, and wiped the moment anyone leaves. */
  #scores = new Map<string, number>();
  #useSignature = '';

  /* --- lobby state --------------------------------------------------------- */
  /** The host's copy is authoritative; a client's is the last snapshot it got. */
  #state: LobbySnapshot;
  /** Fractional seconds. The snapshot only ever carries whole ones. */
  #countdown: number | null = null;
  #lastSentSecond = -1;
  #starting = false;

  /* --- the wardrobe -------------------------------------------------------- */
  #wardrobeOpen = false;
  /** 0 = first person, 1 = parked in front of the mannequin. */
  #wardrobeBlend = 0;
  /** The view at the end of the last two ticks. Frames are drawn between them. */
  #eyeWas: CabinEye | null = null;
  #eyeIs: CabinEye | null = null;

  /* --- audio ---------------------------------------------------------------- */
  #listenerForward = new THREE.Vector3();
  #listenerUp = new THREE.Vector3();

  constructor(
    config: Config,
    renderer: Renderer,
    input: Input,
    net: Net,
    audio: Audio,
    voice: VoiceChat,
    save: Save,
    hooks: LobbyHooks,
  ) {
    this.#config = config;
    this.#renderer = renderer;
    this.#input = input;
    this.#net = net;
    this.#audio = audio;
    this.#voice = voice;
    this.#save = save;
    this.#hooks = hooks;
    this.#dims = {
      cellSize: config.world.grid.cellSize,
      ceilingHeight: config.world.grid.ceilingHeight,
      wallThickness: config.world.grid.wallThickness,
      doorWidth: config.world.doors.width,
      doorHeight: config.world.doors.height,
    };
    this.#state = { picks: {}, difficultyId: config.difficulty.default, countdown: null };
  }

  get active(): boolean {
    return this.#world !== null;
  }

  get wardrobeOpen(): boolean {
    return this.#wardrobeOpen;
  }

  /* --- lifecycle ----------------------------------------------------------- */

  /** `slot` picks which of the four spots in the cabin this player arrives at. */
  start(slot = 0, mapIds: readonly string[]): void {
    this.end();

    const world = buildLobbyScene(this.#config, mapIds);
    this.#world = world;
    this.#mapIds = mapIds;
    this.#renderer.scene.add(world.root);

    const spawn = world.spawns[slot % world.spawns.length] ?? world.spawns[0];
    this.#player = createPlayerState(
      spawn?.position[0] ?? 0,
      spawn?.position[2] ?? 0,
      spawn?.rotationY ?? 0,
      this.#config.player,
    );
    // The arrival spot, so the light budget is filled before the first frame.
    this.#renderer.setRoomLights(world.lights, spawn?.position[0] ?? 0, spawn?.position[2] ?? 0);

    // Nothing to interpolate from yet: the first frame in the cabin must not be
    // drawn somewhere between here and wherever the last run ended.
    this.#eyeWas = null;
    this.#eyeIs = null;

    this.#starting = false;
    this.#wardrobeOpen = false;
    this.#wardrobeBlend = 0;
    this.#moveTimer = 0;
    this.#target = null;
    this.#hooks.onInteractTargetChange(null);

    // Dart scores belong to a visit, not to a profile: walking out of the cabin
    // for any reason at all wipes them, and `start()` is every way back in.
    this.#clock = 0;
    this.#dartCount = 0;
    this.#scores.clear();
    this.#hands = { left: false, right: false };
    this.#dartTemplate = this.#buildDart();
    this.#readyArt = this.#dartTemplate?.object.clone() ?? null;
    if (this.#readyArt) {
      this.#readyArt.visible = false;
      this.#renderer.scene.add(this.#readyArt);
    }
    this.#pushHands();
    this.#pushUse(null);
    this.#pushScores();

    // A poster's tick is a fact about THIS player, not about the session: it is
    // there because you escaped that map, not because your team did.
    for (const poster of world.posters) {
      poster.tick.visible = poster.mapId !== null && this.#save.hasCompleted(poster.mapId);
    }

    this.#mannequin = this.#createBody('mannequin', this.#net.selfId);
    if (this.#mannequin) {
      const pose = world.mannequin;
      this.#mannequin.body.object.position.set(pose.position[0], pose.position[1], pose.position[2]);
      this.#mannequin.body.root.rotation.y = pose.rotationY;
      this.#mannequin.body.wear(this.#ownCosmetic());
    }

    // Rejoining the cabin clears whatever the last round decided.
    if (this.#isHost) {
      this.#state = { picks: {}, difficultyId: this.#state.difficultyId, countdown: null };
      this.#countdown = null;
      this.#publish();
    }

    for (const id of this.#net.players) this.addRemote(id);
    this.#applyMarks();
    this.#applyLever();
    this.#pushView();
    this.#pushRoster();

    // No score in the cabin. The menu's is a title theme and it does not belong
    // over a room people are standing in and talking to each other in - the
    // fire, the darts and four voices are the whole soundtrack down here.
    this.#audio.music.setScene('none');
  }

  end(): void {
    // Back to the title theme. If the cabin is being left for a RUN rather than
    // for the menu, `Game.start` sets `run` a moment later and wins - one
    // wasted ramp target, and the alternative is the cabin knowing where the
    // player is going next.
    this.#audio.music.setScene('menu');
    if (this.#world) {
      this.#renderer.scene.remove(this.#world.root);
      this.#world.dispose();
    }
    for (const remote of this.#remotes.values()) this.#disposeBody(remote);
    this.#remotes.clear();
    if (this.#mannequin) this.#disposeBody(this.#mannequin);
    this.#mannequin = null;

    // Every dart in the air, in the board and in a hand. Clones share the
    // template's geometry and materials, so only the template is disposed.
    for (const entry of this.#flying) this.#renderer.scene.remove(entry.object);
    for (const entry of this.#landed) this.#renderer.scene.remove(entry.object);
    this.#flying = [];
    this.#landed = [];
    if (this.#readyArt) this.#renderer.scene.remove(this.#readyArt);
    this.#readyArt = null;
    this.#ready = null;
    this.#dartTemplate?.dispose?.();
    this.#dartTemplate = null;
    this.#scores.clear();

    this.#renderer.setRoomLights([]);
    this.#world = null;
    this.#player = null;
    this.#target = null;
    this.#wardrobeOpen = false;
    // Last, once the cabin and every body in it are down. See `art/lib/build.ts`.
    clearGeometryCache();
  }

  /* --- people -------------------------------------------------------------- */

  addRemote(id: string): void {
    if (!this.#world || this.#remotes.has(id)) return;
    const body = this.#createBody(`remote:${id}`, id);
    if (!body) return;

    body.body.object.traverse((child) => {
      child.userData['playerId'] = id;
    });
    body.body.wear(this.#net.cosmeticOf(id) ?? defaultCosmetic(this.#config.player));
    // Off to one side of the arrival spots, so nobody spawns inside anyone.
    const spawn = this.#world.spawns[(this.#remotes.size + 1) % this.#world.spawns.length];
    body.target = { x: spawn?.position[0] ?? 0, z: spawn?.position[2] ?? 0, yaw: spawn?.rotationY ?? 0 };
    body.body.object.position.set(body.target.x, 0, body.target.z);
    // Standing where they were put until the first transform lands, rather than
    // gliding in from the origin.
    body.buffer.reset({ ...body.target, pitch: 0, height: 0 }, nowSeconds());
    this.#remotes.set(id, body);
    this.#pushView();
    this.#pushRoster();
    this.#pushScores();
  }

  removeRemote(id: string): void {
    const remote = this.#remotes.get(id);
    if (!remote) return;
    this.#disposeBody(remote);
    this.#remotes.delete(id);
    this.#scores.delete(id);
    this.#pushScores();

    // A player who leaves takes their pick with them, which can be what tips the
    // countdown into its short form.
    if (this.#isHost && this.#state.picks[id] !== undefined) {
      const picks = { ...this.#state.picks };
      delete picks[id];
      this.#state = { ...this.#state, picks };
      this.#publish();
      this.#applyMarks();
    }
    this.#pushView();
    this.#pushRoster();
  }

  moveRemote(id: string, x: number, z: number, yaw: number, at: number): void {
    const remote = this.#remotes.get(id);
    if (!remote) {
      this.addRemote(id);
      return;
    }
    // `target` is what voice attenuates against and what the tally reads; the
    // buffer is what the body is drawn from. They are the same numbers a few
    // tens of milliseconds apart, and neither wants the other's timing.
    remote.target = { x, z, yaw };
    remote.buffer.push({ x, z, yaw, pitch: 0, height: 0 }, at);
  }

  /** A teammate changed clothes, or turned up already dressed. */
  setRemoteCosmetic(id: string, cosmetic: Cosmetic): void {
    this.#remotes.get(id)?.body.wear(cosmetic);
  }

  /** A peer named themselves. The lines are rebuilt from `net/`, as in a run. */
  refreshNames(): void {
    if (this.#world) this.#pushRoster();
  }

  /**
   * Everybody in the cabin, this player included. It is what the pause menu's
   * voice list is built from - which is why it is pushed at all in here, where
   * there is nobody to lose and no health to draw.
   */
  #pushRoster(): void {
    const self = this.#net.selfId;
    const roster: RosterEntry[] = [self, ...this.#remotes.keys()].map((id) => ({
      id,
      name: this.#net.nameOf(id),
      index: this.#net.playerNumber(id),
      health: 'healthy',
      self: id === self,
      disconnected: false,
      escaped: false,
      pulse: null,
    }));
    roster.sort((a, b) => a.index - b.index);
    this.#hooks.onRosterChange(roster);
  }

  /**
   * Names over the heads in the cabin, exactly as in a run and for the same
   * reason - it is where you find out who you are about to go down a hole with.
   * The one difference is that nothing tests line of sight: the cabin is a
   * single room you can see across, and the run's rule exists to stop a
   * nameplate reporting somebody through a wall.
   */
  nameplates(): NameplateView[] {
    const config = this.#config.ui.hud.nameplates;
    if (!config.enabled || !this.#world || !this.#remotes.size) return [];

    const camera = this.#renderer.camera;
    const eye = camera.position;
    const height = this.#config.player.body.standHeight + config.heightOffset;
    const fade = config.maxDistance - config.fadeDistance;
    const views: NameplateView[] = [];

    for (const [id, remote] of this.#remotes) {
      const at = remote.body.object.position;
      const distance = Math.hypot(at.x - eye.x, at.z - eye.z);
      if (distance > config.maxDistance) continue;

      HEAD.set(at.x, at.y + height, at.z).project(camera);
      if (HEAD.z > 1) continue;
      if (Math.abs(HEAD.x) > 1.2 || Math.abs(HEAD.y) > 1.2) continue;

      views.push({
        id,
        name: this.#net.nameOf(id),
        index: this.#net.playerNumber(id),
        x: (HEAD.x * 0.5 + 0.5) * 100,
        y: (HEAD.y * -0.5 + 0.5) * 100,
        opacity: fade > 0 ? Math.min(1, Math.max(0, (config.maxDistance - distance) / fade)) : 1,
      });
    }

    return views;
  }

  /**
   * `peerId` is whose clock this body is played back against. The mannequin
   * passes this browser's own, which is never fed and never sampled - it stands
   * where the wardrobe puts it.
   */
  #createBody(streamName: string, peerId: string): RemotePlayer | null {
    const world = this.#world;
    if (!world) return null;

    const body = createPlayerBody(this.#config.player, world.materials, stream(0, streamName), this.#dims);
    this.#renderer.scene.add(body.object);
    return {
      body,
      target: { x: 0, z: 0, yaw: 0 },
      buffer: new TransformBuffer(
        this.#net.clockFor(peerId),
        this.#config.net.simulation.interpolation.maxExtrapolationMs,
      ),
    };
  }

  #disposeBody(remote: RemotePlayer): void {
    this.#renderer.scene.remove(remote.body.object);
    remote.body.dispose();
  }

  /* --- the wardrobe -------------------------------------------------------- */

  /**
   * The wardrobe changed something. Whatever it was, the whole outfit is saved,
   * broadcast and put on the mannequin in one path - a colour and a hat are the
   * same kind of decision and there is no reason for two.
   */
  setCosmetic(cosmetic: Cosmetic): void {
    this.#save.setColourId(cosmetic.colourId);
    this.#save.setHatId(cosmetic.hatId);
    this.#net.setCosmetic(cosmetic);
    this.#mannequin?.body.wear(cosmetic);
  }

  /**
   * Puts something on the mannequin WITHOUT buying, saving or telling anybody.
   * This is how you try a hat on before you pay for it - the model is standing
   * two metres away with the camera already pointed at it, and a shop that made
   * you buy before you could look would be a worse shop.
   */
  previewCosmetic(cosmetic: Cosmetic): void {
    this.#mannequin?.body.wear(cosmetic);
  }

  closeWardrobe(): void {
    if (!this.#wardrobeOpen) return;
    this.#wardrobeOpen = false;
    // Whatever was being tried on comes back off on the way out.
    this.#mannequin?.body.wear(this.#ownCosmetic());
    this.#hooks.onWardrobe(false);
  }

  /** What this profile is wearing, with the configured defaults filled in. */
  #ownCosmetic(): Cosmetic {
    const fallback = defaultCosmetic(this.#config.player);
    const { colourId, hatId } = this.#save.profile;
    return { colourId: colourId ?? fallback.colourId, hatId: hatId ?? fallback.hatId };
  }

  /* --- picks, difficulty and the countdown --------------------------------- */

  /** Offline counts as host: there is nobody else to keep the tally. */
  get #isHost(): boolean {
    return this.#net.role !== 'client';
  }

  /** Everyone in the cabin, this player included. */
  get #playerCount(): number {
    return this.#remotes.size + 1;
  }

  /** A client's copy of the host's lobby. The host ignores this. */
  applyState(state: LobbySnapshot): void {
    if (this.#isHost) return;
    this.#state = state;
    this.#countdown = state.countdown;
    this.#applyMarks();
    this.#applyLever();
    this.#pushView();
  }

  /** Host only. A peer picked a map, or withdrew. */
  applyPick(id: string, mapId: string | null): void {
    if (!this.#isHost) return;
    const picks = { ...this.#state.picks };
    if (mapId) picks[id] = mapId;
    else delete picks[id];
    this.#state = { ...this.#state, picks };
    this.#publish();
    this.#applyMarks();
    this.#pushView();
  }

  /** Host only. Somebody pulled the lever. */
  applyDifficulty(difficultyId: string): void {
    if (!this.#isHost) return;
    this.#state = { ...this.#state, difficultyId };
    this.#publish();
    this.#applyLever();
    this.#pushView();
  }

  /**
   * A solo player is not waiting for anybody, so pressing E on a poster starts
   * the run there and then. In company it records a pick and opens - or shortens
   * - the countdown.
   *
   * `pickId` is a map id, or `RANDOM_PICK` from the `?` poster. The two are
   * tallied identically and only told apart when a map actually has to be named.
   */
  #pick(pickId: string): void {
    // Before the solo branch below, which leaves for the map without returning.
    this.#hooks.onTutorial('pick');

    if (this.#playerCount === 1 && this.#isHost) {
      this.#beginRun(this.#resolve(pickId));
      return;
    }

    const self = this.#net.selfId;
    // Pressing E on the poster you already picked withdraws it, which is the
    // only way to change your mind back to nothing.
    const next = this.#state.picks[self] === pickId ? null : pickId;

    if (this.#isHost) this.applyPick(self, next);
    else this.#net.sendPick(next);

    this.#audio.play('ui.click');
  }

  /** A pick, as a map. `RANDOM_PICK` becomes one of the enabled maps here. */
  #resolve(pickId: string): string {
    if (pickId !== RANDOM_PICK) return pickId;
    return this.#randomMap();
  }

  /**
   * `Math.random()` is right here, as it is in `#winner()`: this is a host-only
   * decision that is then broadcast as a concrete `(mapId, seed)`, not something
   * peers re-derive.
   */
  #randomMap(): string {
    const ids = this.#mapIds.length ? this.#mapIds : [this.#config.maps.defaultMapId];
    return ids[Math.floor(Math.random() * ids.length)] ?? this.#config.maps.defaultMapId;
  }

  #pullLever(): void {
    const ids = this.#difficultyIds;
    const index = Math.max(0, ids.indexOf(this.#state.difficultyId));
    const next = ids[(index + 1) % ids.length] ?? this.#config.difficulty.default;

    if (this.#isHost) this.applyDifficulty(next);
    else this.#net.sendDifficulty(next);

    this.#audio.play('ui.click');
  }

  /**
   * Difficulties the lever cycles. Only the enabled ones - the rest are written
   * and waiting for step 38 to apply their overlays.
   */
  get #difficultyIds(): string[] {
    const ids = Object.entries(this.#config.difficulty.modes)
      .filter(([, mode]) => mode.enabled === true)
      .map(([id]) => id);
    return ids.length ? ids : [this.#config.difficulty.default];
  }

  /**
   * The countdown. Opened by the first pick and running at
   * `lobby.autoStartSeconds`, it drops to `allReadyStartSeconds` the moment
   * everybody has picked - which is what makes a decisive group fast and a
   * dithering one bounded.
   */
  #updateCountdown(dt: number): void {
    if (!this.#isHost || this.#starting) return;

    const { autoStartSeconds, allReadyStartSeconds } = this.#config.game.lobby;
    const picked = Object.keys(this.#state.picks).length;

    if (picked === 0) {
      if (this.#countdown !== null) {
        this.#countdown = null;
        this.#publish();
      }
      return;
    }

    const target = picked >= this.#playerCount ? allReadyStartSeconds : autoStartSeconds;
    // `min` rather than assignment: everyone picking pulls the clock in, but a
    // player leaving must never push it back out.
    this.#countdown = this.#countdown === null ? target : Math.min(this.#countdown, target);
    this.#countdown -= dt;

    if (this.#countdown <= 0) {
      this.#beginRun(this.#winner());
      return;
    }

    // Only the whole second crosses the wire.
    const second = Math.ceil(this.#countdown);
    if (second !== this.#lastSentSecond) {
      this.#lastSentSecond = second;
      this.#publish();
      this.#pushView();
    }
  }

  /**
   * Most-picked map wins; a tie is broken at random, per
   * `game.json -> lobby.mapVoteMode`.
   *
   * **A `?` vote never beats a real one.** Somebody who picked the manor wants
   * the manor; somebody who picked `?` has said they do not mind - so the random
   * votes are dropped from the tally entirely, and the dice only come out when
   * there is nothing else left to count. That also makes `?` the right thing to
   * press when you genuinely have no preference, instead of a way to overrule
   * three people who do.
   */
  #winner(): string {
    const counts = new Map<string, number>();
    for (const pickId of Object.values(this.#state.picks)) {
      if (pickId === RANDOM_PICK) continue;
      counts.set(pickId, (counts.get(pickId) ?? 0) + 1);
    }
    if (counts.size === 0) return this.#randomMap();

    let best = 0;
    for (const count of counts.values()) best = Math.max(best, count);

    const leaders = [...counts.entries()].filter(([, count]) => count === best).map(([mapId]) => mapId);
    return leaders[Math.floor(Math.random() * leaders.length)] ?? this.#config.maps.defaultMapId;
  }

  #beginRun(mapId: string): void {
    if (this.#starting) return;
    this.#starting = true;

    const run: RunStart = { mapId, seed: randomSeed(), difficultyId: this.#state.difficultyId };
    this.#net.startRun(run);
    this.#hooks.onStartRun(run);
  }

  #publish(): void {
    if (!this.#isHost) return;
    const countdown = this.#countdown === null ? null : Math.max(0, Math.ceil(this.#countdown));
    this.#state = { ...this.#state, countdown };
    this.#net.setLobbyState(this.#state);
  }

  /* --- presentation -------------------------------------------------------- */

  /** Highlights every picked poster, and yours in the accent colour. */
  #applyMarks(): void {
    const world = this.#world;
    if (!world) return;

    const self = this.#net.selfId;
    const picked = new Set(Object.values(this.#state.picks));
    const mine = this.#state.picks[self] ?? null;

    for (const poster of world.posters) {
      const on = poster.pickId !== null && picked.has(poster.pickId);
      poster.mark.visible = on;
      if (on) poster.setMark(poster.pickId === mine ? MARK_MINE : MARK_OTHER);
    }
  }

  #applyLever(): void {
    const ids = this.#difficultyIds;
    const index = Math.max(0, ids.indexOf(this.#state.difficultyId));
    this.#world?.lever.setLever(ids.length > 1 ? index / (ids.length - 1) : 0);
  }

  #pushView(): void {
    const counts = new Map<string, number>();
    for (const mapId of Object.values(this.#state.picks)) counts.set(mapId, (counts.get(mapId) ?? 0) + 1);

    const mine = this.#state.picks[this.#net.selfId] ?? null;
    const tally: PickTally[] = [...counts.entries()]
      .map(([mapId, votes]) => ({
        mapId,
        nameKey: mapId === RANDOM_PICK ? 'map.random.name' : this.#config.maps.maps[mapId]?.nameKey ?? 'map.unknown.name',
        votes,
        mine: mapId === mine,
      }))
      // A `?` never outranks a real pick, so it never sits at the top of the
      // list that says what the team is doing either.
      .sort((a, b) => Number(a.mapId === RANDOM_PICK) - Number(b.mapId === RANDOM_PICK) || b.votes - a.votes);

    const difficultyId = this.#state.difficultyId;
    this.#hooks.onViewChange({
      players: this.#playerCount,
      tally,
      difficultyId,
      difficultyNameKey: this.#config.difficulty.modes[difficultyId]?.nameKey ?? 'difficulty.normal.name',
      countdown: this.#state.countdown,
      undecided: Math.max(0, this.#playerCount - Object.keys(this.#state.picks).length),
    });
  }

  /* --- frame --------------------------------------------------------------- */

  update(dt: number, controlsEnabled: boolean): void {
    const world = this.#world;
    const player = this.#player;
    if (!world || !player) return;

    // The wardrobe takes the camera; walking around behind an open panel would
    // only put the model off screen.
    const walking = controlsEnabled && !this.#wardrobeOpen;

    // Escape is NOT read here. It is one ordered stack in `src/main.tsx`, which
    // closes the innermost open thing and nothing else - handling it in two
    // places is how a panel ends up closing straight into the escape menu.

    if (walking) {
      const look = this.#input.consumeLook();
      applyLook(player, look.x, look.y, this.#config.player, this.#input.mouseSensitivity, this.#input.invertY);
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

    this.#updateCamera(dt, player);
    // Kept so the frames between this tick and the next are drawn from
    // somewhere rather than from here twice - see `present`.
    this.#eyeWas = this.#eyeIs;
    this.#eyeIs = this.#cameraEye(player);
    this.#updateInteraction(walking, world);
    // After the camera: the look-ray above is cast through it, and would be one
    // tick stale otherwise. Where the readied dart is DRAWN is not decided here
    // at all - it is pinned to the camera every frame, in `present`.
    this.#updateDartHands(walking);
    this.#updateReadyArt(dt);
    this.#updateDarts(dt);
    this.#updateVoice(dt, player);
    this.#updateCountdown(dt);
    this.#renderer.updateLights(dt, player.x, player.z);
    this.#sendTransform(dt, player);
  }

  /**
   * What the cabin DRAWS, at the display's rate. Same split as a run and for
   * the same reason: the tick decides where everything is, the frame decides
   * what that looks like from here, and a screen faster than 60 Hz gets more
   * than 60 distinct views out of it.
   */
  present(alpha: number): void {
    const player = this.#player;
    if (!this.#world || !player) return;

    const a = this.#eyeWas;
    const b = this.#eyeIs;
    if (a && b) {
      const t = Math.min(1, Math.max(0, alpha));
      this.#writeCamera({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        yaw: a.yaw + shortestAngle(a.yaw, b.yaw) * t,
        pitch: a.pitch + (b.pitch - a.pitch) * t,
      });
    }
    // After the camera, always: it is pinned to it.
    this.#pinReadyArt();
    this.#interpolateRemotes();
  }

  #updateCamera(dt: number, player: PlayerState): void {
    // Ease between first person and the wardrobe view rather than cutting: the
    // cut reads as a bug the first time you see it.
    const wanted = this.#wardrobeOpen ? 1 : 0;
    this.#wardrobeBlend += (wanted - this.#wardrobeBlend) * Math.min(1, dt * 7);
    if (Math.abs(this.#wardrobeBlend - wanted) < 0.002) this.#wardrobeBlend = wanted;

    this.#writeCamera(this.#cameraEye(player));
  }

  /** Where the view sits this tick, wardrobe blend included. Pure. */
  #cameraEye(player: PlayerState): CabinEye {
    const view = this.#world?.wardrobeCamera;
    const t = this.#wardrobeBlend;

    let x = player.x;
    let y = eyeHeight(player, this.#config.player);
    let z = player.z;
    let yaw = player.yaw;
    let pitch = player.pitch;

    if (view && t > 0) {
      x += (view.position[0] - x) * t;
      y += (view.position[1] - y) * t;
      z += (view.position[2] - z) * t;
      yaw += shortestAngle(yaw, view.yaw) * t;
      pitch += (view.pitch - pitch) * t;
    }

    return { x, y, z, yaw, pitch };
  }

  #writeCamera(eye: CabinEye): void {
    const camera = this.#renderer.camera;
    camera.position.set(eye.x, eye.y, eye.z);
    camera.rotation.set(eye.pitch, eye.yaw, 0, 'YXZ');
    camera.updateMatrixWorld();

    camera.getWorldDirection(this.#listenerForward);
    this.#listenerUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    this.#audio.setListener(camera.position, this.#listenerForward, this.#listenerUp);
  }

  /* --- interaction --------------------------------------------------------- */

  #updateInteraction(enabled: boolean, world: LobbyWorld): void {
    const previous = this.#target;
    this.#target = enabled ? this.#findTarget(world) : null;

    if (this.#target?.id !== previous?.id || this.#target?.verbKey !== previous?.verbKey) {
      this.#hooks.onInteractTargetChange(this.#target);
    }

    const target = this.#target;
    if (!target || !this.#input.justPressed('interact')) return;

    switch (target.kind) {
      case 'poster':
        this.#pick(target.id);
        break;
      case 'wardrobe':
        this.#wardrobeOpen = true;
        this.#audio.play('ui.click');
        this.#hooks.onWardrobe(true);
        break;
      case 'lever':
        this.#pullLever();
        break;
      case 'dartStand':
        this.#takeDart();
        break;
      case 'posterEmpty':
        // Nothing to pick. The prompt already said so.
        break;
    }
  }

  #findTarget(world: LobbyWorld): LobbyTarget | null {
    const camera = this.#renderer.camera;
    this.#raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    // A poster wall is looked at from further back than a door is opened from.
    this.#raycaster.far = this.#config.player.interaction.rayLength * 1.6;

    // Posters first, the cabin only if one was found: the same two-pass ray the
    // run uses, and for the same reason (`Game.#lookTag`).
    const hit = this.#raycaster.intersectObjects(world.raycastTargets, true)[0];
    if (!hit) return null;
    this.#raycaster.far = hit.distance - 1e-3;
    if (this.#raycaster.intersectObjects(world.occluders, true).length > 0) return null;

    const tagged = findTag(hit.object);
    if (!tagged) return null;

    if (tagged.key === 'posterSlot') {
      const poster = world.posters[Number(tagged.value)];
      if (!poster) return null;
      return this.#posterTarget(poster);
    }

    if (tagged.value === 'wardrobe') {
      return { kind: 'wardrobe', id: 'wardrobe', verbKey: 'hud.interact.wardrobe' };
    }
    if (tagged.value === 'lever') {
      return { kind: 'lever', id: 'lever', verbKey: 'hud.interact.difficulty' };
    }
    if (tagged.value === 'dartStand') {
      // Both hands full is still a target, just a useless one - saying so beats
      // the prompt silently disappearing when you already have what it offers.
      const full = this.#hands.left && this.#hands.right;
      return { kind: 'dartStand', id: 'dartStand', verbKey: full ? 'hud.interact.dartsFull' : 'hud.interact.takeDart' };
    }
    return null;
  }

  #posterTarget(poster: LobbyPoster): LobbyTarget {
    if (!poster.pickId) {
      return { kind: 'posterEmpty', id: `slot:${poster.slot}`, verbKey: 'hud.interact.mapLocked' };
    }

    const chosen = this.#state.picks[this.#net.selfId] === poster.pickId;
    if (poster.pickId === RANDOM_PICK) {
      return {
        kind: 'poster',
        id: RANDOM_PICK,
        verbKey: chosen ? 'hud.interact.pickMapAgain' : 'hud.interact.pickRandom',
        nameKey: 'map.random.name',
      };
    }

    const nameKey = this.#config.maps.maps[poster.pickId]?.nameKey ?? 'map.unknown.name';
    return {
      kind: 'poster',
      id: poster.pickId,
      verbKey: chosen ? 'hud.interact.pickMapAgain' : 'hud.interact.pickMap',
      nameKey,
    };
  }

  /* --- darts ---------------------------------------------------------------- */

  /**
   * The whole minigame, in one place.
   *
   * Deliberately NOT the run's throwing code with different numbers. A thrown
   * flask aims down an arc that has to be drawn because it is the only honest
   * way to show a ballistic curve indoors; a dart is thrown at one disc across
   * an open room, and drawing a line to it would answer the only question the
   * game is asking. So there is no arc: the dart comes up in front of you while
   * the button is down, and where the crosshair is when you let go is where it
   * goes - give or take a draught nobody can see.
   */
  #buildDart(): { object: THREE.Object3D; dispose?: () => void } | null {
    const world = this.#world;
    if (!world) return null;
    const art = resolveArt('lobby.dart')({ materials: world.materials, rng: stream(0, 'dart'), dims: this.#dims });
    // The template itself is never in the scene: every dart is a clone of it, so
    // a dozen in the board share one set of geometry and materials.
    return { object: art.object, dispose: art.dispose };
  }

  #takeDart(): void {
    const hand = HANDS.find((each) => !this.#hands[each]);
    if (!hand) return;
    this.#hands[hand] = true;
    this.#audio.play('item.pickup');
    this.#pushHands();
    // The prompt now says "hands full", so it has to be re-pushed.
    this.#target = null;
  }

  /**
   * The hand buttons. A hand with a dart in it draws on the press and throws on
   * the release; a hand without one does nothing at all.
   */
  #updateDartHands(enabled: boolean): void {
    if (!enabled) {
      this.#cancelReady();
      return;
    }

    const ready = this.#ready;
    if (ready) {
      const action = ready === 'left' ? 'useLeft' : 'useRight';
      // Escape puts the dart back down rather than throwing it: it is the "I did
      // not mean that" gesture everywhere else in the game too.
      if (this.#input.justPressed('pauseMenu')) this.#cancelReady();
      else if (!this.#input.isDown(action)) this.#throwDart(ready);
      else this.#pushUse({ verbKey: 'hud.use.aiming', itemNameKey: null, keyCode: this.#handKey(ready), hintKey: '', hold: false, progress: 0 });
      return;
    }

    for (const [action, hand] of USE_ACTIONS) {
      if (!this.#input.justPressed(action) || !this.#hands[hand]) continue;
      this.#ready = hand;
      this.#readyBlend = 0;
      return;
    }

    // Nothing is being thrown, but the HUD should still say what COULD be.
    const holding = HANDS.find((hand) => this.#hands[hand]);
    this.#pushUse(
      holding
        ? {
            verbKey: 'hud.use.throw',
            itemNameKey: DART_NAME_KEY,
            keyCode: this.#handKey(holding),
            hintKey: '',
            hold: false,
            progress: 0,
          }
        : null,
    );
  }

  #cancelReady(): void {
    this.#ready = null;
    if (this.#readyArt) this.#readyArt.visible = false;
    this.#pushUse(null);
  }

  /** Brings the held dart up into view and keeps it pinned to the camera. */
  #updateReadyArt(dt: number): void {
    const art = this.#readyArt;
    if (!art) return;

    const wanted = this.#ready ? 1 : 0;
    const rate = Math.max(0.01, this.#config.darts.hand.raiseSeconds);
    this.#readyBlend += Math.sign(wanted - this.#readyBlend) * (dt / rate);
    this.#readyBlend = Math.max(0, Math.min(1, this.#readyBlend));
    art.visible = this.#readyBlend > 0.001;
  }

  /**
   * Pins the readied dart to the camera. In `present` rather than in the tick,
   * because it is placed in WORLD space from the camera's matrix and the camera
   * now moves every frame - pinned at tick rate it would swim about in front of
   * a face that had already turned.
   */
  #pinReadyArt(): void {
    const art = this.#readyArt;
    if (!art?.visible) return;

    const camera = this.#renderer.camera;
    const [ox = 0.16, oy = -0.15, oz = -0.42] = this.#config.darts.hand.offset;
    // Rises into place from below rather than appearing, which is the whole job
    // of `raiseSeconds`.
    art.position.set(ox, oy - (1 - this.#readyBlend) * 0.22, oz).applyMatrix4(camera.matrixWorld);
    art.quaternion.copy(camera.quaternion);
    // Held across the line of sight rather than straight down it, or all you can
    // see of a dart pointing away from you is its flights.
    art.rotateY(0.42);
    art.rotateX(-0.12);
  }

  #throwDart(hand: Hand): void {
    const player = this.#player;
    this.#cancelReady();
    if (!player || !this.#hands[hand]) return;

    this.#hands[hand] = false;
    this.#pushHands();

    const darts = this.#config.darts;
    const from = {
      x: player.x,
      y: eyeHeight(player, this.#config.player) + darts.throw.releaseHeightOffset,
      z: player.z,
    };
    const velocity = dartVelocity(darts, player.yaw, player.pitch);
    const id = `dart:${this.#net.selfId}:${this.#dartCount++}`;

    this.#spawnDart(id, this.#net.selfId, from, velocity, this.#clock);
    this.#net.broadcast({
      t: 'dart',
      id,
      owner: this.#net.selfId,
      x: from.x,
      y: from.y,
      z: from.z,
      vx: velocity.x,
      vy: velocity.y,
      vz: velocity.z,
      wind: this.#clock,
    });
    this.#audio.play('item.throw');
  }

  /** A peer threw one. Its flight is re-run here rather than streamed. */
  dartThrown(
    id: string,
    ownerId: string,
    from: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number },
    wind: number,
  ): void {
    if (ownerId === this.#net.selfId) return;
    this.#spawnDart(id, ownerId, from, velocity, wind);
    this.#audio.play('item.throw', { at: from });
  }

  /** A peer's running total. They keep their own; nobody arbitrates a scoreboard. */
  setDartScore(id: string, score: number): void {
    this.#scores.set(id, Math.max(0, Math.round(score)));
    this.#pushScores();
  }

  #spawnDart(
    id: string,
    ownerId: string,
    from: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number },
    wind: number,
  ): void {
    const template = this.#dartTemplate;
    if (!this.#world || !template) return;

    const object = template.object.clone();
    object.position.set(from.x, from.y, from.z);
    aimAlong(object, velocity.x, velocity.y, velocity.z);
    this.#renderer.scene.add(object);
    this.#flying.push({ dart: createDart(id, ownerId, from, velocity, wind), object });
  }

  #updateDarts(dt: number): void {
    const world = this.#world;
    if (!world) return;
    this.#clock += dt;

    // Pull the oldest ones out, by age and by count. A board that never clears
    // ends up a pin cushion, and every dart in it is a draw call.
    const { maxInWorld } = this.#config.darts.stick;
    while (this.#landed.length > 0) {
      const oldest = this.#landed[0];
      if (!oldest || (oldest.until > this.#clock && this.#landed.length <= maxInWorld)) break;
      this.#renderer.scene.remove(oldest.object);
      this.#landed.shift();
    }

    if (this.#flying.length === 0) return;

    const dartWorld: DartWorld = {
      config: this.#config.darts,
      board: { ...world.darts.board, radius: this.#config.darts.board.radius },
      fence: { distance: world.darts.fenceDistance, top: world.darts.fenceTop },
      floorY: 0,
    };

    const landed: string[] = [];
    for (const entry of this.#flying) {
      const landing = stepDart(entry.dart, dt, dartWorld);
      entry.object.position.set(entry.dart.x, entry.dart.y, entry.dart.z);
      aimAlong(entry.object, entry.dart.vx, entry.dart.vy, entry.dart.vz);
      if (!landing) continue;
      landed.push(entry.dart.id);
      this.#landDart(entry, landing);
    }
    if (landed.length) this.#flying = this.#flying.filter((entry) => !landed.includes(entry.dart.id));
  }

  #landDart(entry: { dart: Dart; object: THREE.Object3D }, landing: DartLanding): void {
    const { dart, object } = entry;
    // Back it off along its own flight so the point buries and the barrel stands
    // out of the surface, rather than the whole dart floating on it.
    const speed = Math.hypot(dart.vx, dart.vy, dart.vz) || 1;
    object.position.set(
      landing.x - (dart.vx / speed) * DART_BURY,
      landing.y - (dart.vy / speed) * DART_BURY,
      landing.z - (dart.vz / speed) * DART_BURY,
    );
    this.#landed.push({ object, until: this.#clock + this.#config.darts.stick.seconds });
    this.#audio.play('item.impact', { at: { x: landing.x, z: landing.z } });

    // Only the thrower counts their own darts, exactly as only a player's own
    // client counts their own footsteps for the run scoreboard. Everybody else
    // is running this flight for the picture.
    const self = this.#net.selfId;
    if (dart.ownerId !== self || !landing.hit || landing.hit.score <= 0) return;

    const total = (this.#scores.get(self) ?? 0) + landing.hit.score;
    this.#scores.set(self, total);
    this.#net.broadcast({ t: 'dartScore', id: self, score: total });
    this.#pushScores();
  }

  /**
   * The board in the annex. Rows are ordered by peer id, which is the one
   * ordering every peer agrees on - a shared object in the world must not read
   * differently depending on who is looking at it.
   */
  #pushScores(): void {
    const ids = [this.#net.selfId, ...this.#remotes.keys()].sort();
    this.#world?.darts.setScores(ids.map((id) => this.#scores.get(id) ?? 0));
  }

  #handKey(hand: Hand): string {
    return this.#input.bindingFor(hand === 'left' ? 'useLeft' : 'useRight');
  }

  #pushHands(): void {
    this.#hooks.onHandsChange({
      left: this.#hands.left ? DART_NAME_KEY : null,
      right: this.#hands.right ? DART_NAME_KEY : null,
    });
  }

  /** Pushed on change only: this is asked every frame and answers the same thing. */
  #pushUse(use: UseView | null): void {
    const signature = use ? `${use.verbKey}|${use.itemNameKey ?? ''}|${use.keyCode}` : '';
    if (signature === this.#useSignature) return;
    this.#useSignature = signature;
    this.#hooks.onUseChange(use);
  }

  /* --- voice ---------------------------------------------------------------- */

  /**
   * Proximity chat works exactly as it does in a run. Peers who are NOT in the
   * cabin - the ones still loading into a map, or already down there - are left
   * out of the list on purpose: `voice/` treats a peer with no position as flat
   * and fully audible, which is what keeps a conversation going across the load
   * rather than cutting it off at the door.
   */
  #updateVoice(dt: number, player: PlayerState): void {
    this.#voice.update(dt, {
      pushToTalk: this.#input.isDown('pushToTalk'),
      listener: { x: player.x, z: player.z },
      spectator: false,
      peers: [...this.#remotes]
        .filter(([id]) => this.#net.sceneOf(id) === 'lobby')
        .map(([id, remote]) => ({ id, x: remote.target.x, z: remote.target.z, spectator: false })),
    });

    if (this.#input.justPressed('toggleVoiceMute')) this.#voice.toggleSelfMute();
  }

  /* --- networking ----------------------------------------------------------- */

  #interpolateRemotes(): void {
    const at = nowSeconds();
    for (const remote of this.#remotes.values()) {
      if (remote.buffer.empty) continue;
      const view = remote.buffer.sample(at);
      const object = remote.body.object;
      object.position.x = view.x;
      object.position.z = view.z;
      remote.body.root.rotation.y = view.yaw;
    }
  }

  #sendTransform(dt: number, player: PlayerState): void {
    if (this.#net.role === 'offline' || this.#remotes.size === 0) return;

    this.#moveTimer -= dt;
    if (this.#moveTimer > 0) return;
    this.#moveTimer = 1 / MOVE_RATE_HZ;

    this.#net.broadcast({ t: 'lobbyMove', id: this.#net.selfId, x: player.x, z: player.z, yaw: player.yaw });
  }
}

/**
 * Points a dart's nose down its own velocity.
 *
 * `lookAt` aims an ordinary object's +Z at the target and a dart's point is on
 * its -Z, so the target is the position with the velocity subtracted rather than
 * added. Scratch vector at module scope: this runs once per dart per frame.
 */
const AIM = new THREE.Vector3();

function aimAlong(object: THREE.Object3D, vx: number, vy: number, vz: number): void {
  if (vx === 0 && vy === 0 && vz === 0) return;
  AIM.set(object.position.x - vx, object.position.y - vy, object.position.z - vz);
  object.lookAt(AIM);
}

/** Signed shortest way round from `from` to `to`. */
function shortestAngle(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Walks up to the nearest ancestor carrying one of the interaction tags. */
function findTag(object: THREE.Object3D): { key: string; value: string } | null {
  const keys = ['posterSlot', 'lobbyId'];
  // `lobbyScenery` is deliberately not in that list: the board and the
  // scoreboard are behind a fence and there is nothing to press on either.
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
