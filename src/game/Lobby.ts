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
import { resolveArt } from '@art/shared/index';
import type { RoomDims } from '@art/lib/contract';
import type { Config } from '@/config/index';
import { randomSeed, stream } from '@/core/rng';
import { applyLook, createPlayerState, eyeHeight, stepPlayer, type PlayerState } from '@/entities/player';
import type { Audio } from '@/audio/index';
import type { Input } from '@/input/index';
import type { LobbySnapshot, Net, RunStart } from '@/net/index';
import type { Renderer } from '@/render/Renderer';
import type { Save } from '@/save/index';
import type { VoiceChat } from '@/voice/index';
import { buildLobbyScene, type LobbyPoster, type LobbyWorld } from '@/world/lobbyScene';

/** What the look-ray is offering in the cabin. Everything here is a press, not a hold. */
export interface LobbyTarget {
  kind: 'poster' | 'posterEmpty' | 'wardrobe' | 'lever';
  /** Map id for a poster, the fixture name otherwise. */
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
  /** The player opened the wardrobe. The screen layer takes it from here. */
  onWardrobe(open: boolean): void;
  /** The countdown finished, or a solo player pressed E. Time to load a map. */
  onStartRun(run: RunStart): void;
}

interface RemotePlayer {
  object: THREE.Object3D;
  root: THREE.Object3D;
  setColour(hex: string): void;
  dispose?(): void;
  target: { x: number; z: number; yaw: number };
}

/** How often lobby transforms go out. Nothing here is precise; it is a foyer. */
const MOVE_RATE_HZ = 10;

/** Highlight colours for the poster mark: your own pick reads differently. */
const MARK_MINE = '#d8593c';
const MARK_OTHER = '#8a8677';

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

    this.#starting = false;
    this.#wardrobeOpen = false;
    this.#wardrobeBlend = 0;
    this.#moveTimer = 0;
    this.#target = null;
    this.#hooks.onInteractTargetChange(null);

    // A poster's tick is a fact about THIS player, not about the session: it is
    // there because you escaped that map, not because your team did.
    for (const poster of world.posters) {
      poster.tick.visible = poster.mapId !== null && this.#save.hasCompleted(poster.mapId);
    }

    this.#mannequin = this.#createBody(`mannequin`);
    if (this.#mannequin) {
      const pose = world.mannequin;
      this.#mannequin.object.position.set(pose.position[0], pose.position[1], pose.position[2]);
      this.#mannequin.root.rotation.y = pose.rotationY;
      this.#mannequin.setColour(this.#colourHex(this.#save.profile.colourId));
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

    this.#audio.music.setScene('menu');
  }

  end(): void {
    if (this.#world) {
      this.#renderer.scene.remove(this.#world.root);
      this.#world.dispose();
    }
    for (const remote of this.#remotes.values()) this.#disposeBody(remote);
    this.#remotes.clear();
    if (this.#mannequin) this.#disposeBody(this.#mannequin);
    this.#mannequin = null;
    this.#renderer.setRoomLights([]);
    this.#world = null;
    this.#player = null;
    this.#target = null;
    this.#wardrobeOpen = false;
  }

  /* --- people -------------------------------------------------------------- */

  addRemote(id: string): void {
    if (!this.#world || this.#remotes.has(id)) return;
    const body = this.#createBody(`remote:${id}`);
    if (!body) return;

    body.object.traverse((child) => {
      child.userData['playerId'] = id;
    });
    body.setColour(this.#colourHex(this.#net.cosmeticOf(id)));
    // Off to one side of the arrival spots, so nobody spawns inside anyone.
    const spawn = this.#world.spawns[(this.#remotes.size + 1) % this.#world.spawns.length];
    body.target = { x: spawn?.position[0] ?? 0, z: spawn?.position[2] ?? 0, yaw: spawn?.rotationY ?? 0 };
    body.object.position.set(body.target.x, 0, body.target.z);
    this.#remotes.set(id, body);
    this.#pushView();
  }

  removeRemote(id: string): void {
    const remote = this.#remotes.get(id);
    if (!remote) return;
    this.#disposeBody(remote);
    this.#remotes.delete(id);

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
  }

  moveRemote(id: string, x: number, z: number, yaw: number): void {
    const remote = this.#remotes.get(id);
    if (!remote) {
      this.addRemote(id);
      return;
    }
    remote.target = { x, z, yaw };
  }

  setRemoteColour(id: string, colourId: string): void {
    this.#remotes.get(id)?.setColour(this.#colourHex(colourId));
  }

  #createBody(streamName: string): RemotePlayer | null {
    const world = this.#world;
    if (!world) return null;

    const art = resolveArt('player.masked')({
      materials: world.materials,
      rng: stream(0, streamName),
      dims: this.#dims,
    });
    this.#renderer.scene.add(art.object);
    return {
      object: art.object,
      root: art.parts['root'] ?? art.object,
      setColour: art.api?.setColour?.bind(art.api) ?? ((): void => {}),
      ...(art.dispose ? { dispose: art.dispose.bind(art) } : {}),
      target: { x: 0, z: 0, yaw: 0 },
    };
  }

  #disposeBody(body: RemotePlayer): void {
    this.#renderer.scene.remove(body.object);
    body.dispose?.();
  }

  /* --- the wardrobe -------------------------------------------------------- */

  setColour(colourId: string): void {
    this.#save.setColourId(colourId);
    this.#net.setCosmetic(colourId);
    this.#mannequin?.setColour(this.#colourHex(colourId));
  }

  closeWardrobe(): void {
    if (!this.#wardrobeOpen) return;
    this.#wardrobeOpen = false;
    this.#hooks.onWardrobe(false);
  }

  #colourHex(colourId: string | null): string {
    const { colours, defaultColourId } = this.#config.player.customisation;
    const wanted = colourId ?? defaultColourId;
    return (colours.find((entry) => entry.id === wanted) ?? colours[0])?.hex ?? '#6f7690';
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
   */
  #pick(mapId: string): void {
    if (this.#playerCount === 1 && this.#isHost) {
      this.#beginRun(mapId);
      return;
    }

    const self = this.#net.selfId;
    // Pressing E on the poster you already picked withdraws it, which is the
    // only way to change your mind back to nothing.
    const next = this.#state.picks[self] === mapId ? null : mapId;

    if (this.#isHost) this.applyPick(self, next);
    else this.#net.sendPick(next);

    this.#audio.play('ui.click');
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
   * `game.json -> lobby.mapVoteMode`. `Math.random()` is right here - this is a
   * host-only decision that is then broadcast, not something peers re-derive.
   */
  #winner(): string {
    const counts = new Map<string, number>();
    for (const mapId of Object.values(this.#state.picks)) {
      counts.set(mapId, (counts.get(mapId) ?? 0) + 1);
    }

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
      const on = poster.mapId !== null && picked.has(poster.mapId);
      poster.mark.visible = on;
      if (on) poster.setMark(poster.mapId === mine ? MARK_MINE : MARK_OTHER);
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
        nameKey: this.#config.maps.maps[mapId]?.nameKey ?? 'map.unknown.name',
        votes,
        mine: mapId === mine,
      }))
      .sort((a, b) => b.votes - a.votes);

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

    // Escape has to be handled here: the wardrobe releases pointer lock when it
    // opens, so the lock-change that normally opens the escape menu has already
    // happened and will not fire again.
    if (this.#wardrobeOpen && this.#input.justPressed('pauseMenu')) this.closeWardrobe();

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
    this.#updateInteraction(walking, world);
    this.#updateVoice(dt, player);
    this.#updateCountdown(dt);
    this.#interpolateRemotes(dt);
    this.#renderer.updateLights(dt, player.x, player.z);
    this.#sendTransform(dt, player);
  }

  #updateCamera(dt: number, player: PlayerState): void {
    const camera = this.#renderer.camera;
    const world = this.#world;

    // Ease between first person and the wardrobe view rather than cutting: the
    // cut reads as a bug the first time you see it.
    const wanted = this.#wardrobeOpen ? 1 : 0;
    this.#wardrobeBlend += (wanted - this.#wardrobeBlend) * Math.min(1, dt * 7);
    if (Math.abs(this.#wardrobeBlend - wanted) < 0.002) this.#wardrobeBlend = wanted;

    const t = this.#wardrobeBlend;
    const view = world?.wardrobeCamera;

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

    camera.position.set(x, y, z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
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
    return null;
  }

  #posterTarget(poster: LobbyPoster): LobbyTarget {
    if (!poster.mapId) {
      return { kind: 'posterEmpty', id: `slot:${poster.slot}`, verbKey: 'hud.interact.mapLocked' };
    }

    const nameKey = this.#config.maps.maps[poster.mapId]?.nameKey ?? 'map.unknown.name';
    const chosen = this.#state.picks[this.#net.selfId] === poster.mapId;
    return {
      kind: 'poster',
      id: poster.mapId,
      verbKey: chosen ? 'hud.interact.pickMapAgain' : 'hud.interact.pickMap',
      nameKey,
    };
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

  #interpolateRemotes(dt: number): void {
    const blend = Math.min(1, dt * 10);
    for (const remote of this.#remotes.values()) {
      remote.object.position.x += (remote.target.x - remote.object.position.x) * blend;
      remote.object.position.z += (remote.target.z - remote.object.position.z) * blend;
      remote.root.rotation.y += shortestAngle(remote.root.rotation.y, remote.target.yaw) * blend;
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
