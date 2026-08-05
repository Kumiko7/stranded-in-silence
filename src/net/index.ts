/**
 * Multiplayer over PeerJS (WebRTC), using its default public signalling server.
 *
 * Topology is a STAR: everyone connects to the host, and the host relays. That
 * is the smallest thing that works for 4 players and it keeps the host as the
 * single source of truth for the run seed.
 *
 * The host is authoritative over everything two players can disagree about: the
 * run seed, the hunter, door state, and every contested claim on a single thing
 * in the world (an item, a chest, a lock, a door to wedge). Requests go up as
 * `claim` / `doorRequest` and the answer comes back down as `granted` / `denied`
 * / `door`, which is why those four are the only messages the host does NOT
 * relay: it consumes them and publishes its own decision instead.
 *
 * Movement is deliberately still owned by each peer (see docs/systems/
 * NETWORKING.md, "What the host does not own"). Nothing else is trusted.
 *
 * VOICE is the exception to the star: a media call needs only the other peer's
 * id, not a data connection, so voice is a true mesh even though gameplay data
 * still goes through the host. Nothing about voice is relayed or mixed here -
 * this only carries the tracks (docs/systems/AUDIO_VOICE.md).
 */
import Peer, { type DataConnection, type MediaConnection } from 'peerjs';
import type { NoiseKind } from '@/ai/noiseBus';
import type { HealthState, NetConfig } from '@/config/types';
import type { PlayerStats } from '@/world/runStats';

/** Namespaced so a 6-character code cannot collide with another app on the public server. */
const PEER_PREFIX = 'stranded-in-silence-';

export interface PlayerTransform {
  x: number;
  z: number;
  yaw: number;
  height: number;
  /** Hidden players cannot be seen by the enemy - but a searched locker finds them. */
  hiding: boolean;
  health: HealthState;
  /**
   * What is in each hand. It rides along with the transform for one reason:
   * when a peer drops out, the host has to put whatever they were carrying back
   * on the floor - a key that leaves with a closed tab would strand the run.
   */
  left: string | null;
  right: string | null;
}

/**
 * Something only one player may have. Every one of these is a request to the
 * host, which answers `granted` to everybody or `denied` to the loser alone.
 *
 * `take`      a world item, including a pile of coins
 * `chest`     the first hold on a chest is the one that opens it
 * `unlock`    a lock is spent once, so only one key is
 * `barricade` one set of planks per door
 */
export type ClaimKind = 'take' | 'chest' | 'unlock' | 'barricade';

/** The enemy runs on the host; everyone else just receives this. */
export interface EnemyTransform {
  x: number;
  z: number;
  yaw: number;
  alert: string;
}

/** Which of the two worlds a peer is standing in. Voice spans both. */
export type Scene = 'lobby' | 'run';

/**
 * The whole lobby, as the host sees it. Small enough to send entire on every
 * change, which removes any question of two peers disagreeing about the tally.
 */
export interface LobbySnapshot {
  /** peer id -> the map they picked. Absent means they have not picked. */
  picks: Record<string, string>;
  difficultyId: string;
  /** Seconds left before the run starts, or null when nothing is counting. */
  countdown: number | null;
}

/** Everything a peer needs to build the same run. */
export interface RunStart {
  mapId: string;
  seed: number;
  difficultyId: string;
}

export type NetMessage =
  | {
      t: 'welcome';
      id: string;
      host: string;
      slot: number;
      peers: string[];
      lobby: LobbySnapshot;
      /** Set only when the host is already in a run, so a late joiner catches up. */
      run: RunStart | null;
    }
  | { t: 'join'; id: string }
  | { t: 'leave'; id: string }
  /* --- lobby -------------------------------------------------------------- */
  /** Host -> all, whenever the tally, the difficulty or the countdown changes. */
  | { t: 'lobby'; state: LobbySnapshot }
  /** Any peer -> the host. `mapId` of null withdraws a pick. */
  | { t: 'pick'; id: string; mapId: string | null }
  /** Any peer -> the host. Anyone may pull the lever. */
  | { t: 'setDifficulty'; difficultyId: string }
  /** Host -> all. The countdown finished, or a solo player pressed E. */
  | { t: 'runStart'; run: RunStart }
  /* --- the load gate ------------------------------------------------------ */
  /** Any -> host. "My map is built." Nobody moves until everybody has said it. */
  | { t: 'ready'; id: string }
  /** Host -> all. How many are in, for the loading screen. */
  | { t: 'loading'; ready: number; total: number }
  /** Host -> all. Everyone is in, or the load timeout ran out. Play. */
  | { t: 'runGo' }
  /** Any -> all, on an interval. Silence for `timeoutSeconds` is a disconnect. */
  | { t: 'ping'; id: string }
  | { t: 'lobbyMove'; id: string; x: number; z: number; yaw: number }
  /** Any -> all, on change and on anyone joining. Voice reads it across scenes. */
  | { t: 'scene'; id: string; scene: Scene }
  | { t: 'cosmetic'; id: string; colourId: string }
  | {
      t: 'move';
      id: string;
      x: number;
      z: number;
      yaw: number;
      height: number;
      hiding: boolean;
      health: HealthState;
      left: string | null;
      right: string | null;
    }
  /* --- host authority ------------------------------------------------------ */
  /** Any -> host. `value` carries whatever the result needs, e.g. barricade seconds. */
  | { t: 'claim'; kind: ClaimKind; id: string; by: string; value: number }
  /** Host -> all. `by` won it; everybody applies the result. */
  | { t: 'granted'; kind: ClaimKind; id: string; by: string; value: number }
  /** Host -> the loser alone. Whatever they showed optimistically comes back off. */
  | { t: 'denied'; kind: ClaimKind; id: string; by: string }
  /** Any -> host. "I want this door like this." The host answers with `door`. */
  | { t: 'doorRequest'; id: string; open: boolean }
  /** Host -> all. The door's authoritative state. Clients apply it as given. */
  | { t: 'door'; id: string; open: boolean }
  | { t: 'drop'; id: string; itemId: string; x: number; y: number; z: number }
  /**
   * A throw, as its release state. Every peer runs the same ballistics from
   * this, so the arc, the landing and whatever it leaves behind never cross the
   * wire at all - see `src/entities/projectile.ts`.
   */
  | {
      t: 'throw';
      id: string;
      itemId: string;
      owner: string;
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
    }
  /** A door wedged shut, or the wedge coming off again with `seconds` of 0. */
  | { t: 'barricade'; id: string; seconds: number }
  /** Somebody used medicine on this player. They apply it and echo their health. */
  | { t: 'heal'; id: string; toState: HealthState }
  /** Coins into the shared run purse. Everyone keeps the same running total. */
  | { t: 'coins'; amount: number }
  | { t: 'escaped'; id: string }
  /**
   * A peer's own tally of what they did this run, for the scoreboard. Sent
   * whole rather than as deltas and re-sent whenever it changes, so a message
   * lost on the way costs nothing: the next one carries the truth anyway.
   */
  | { t: 'stats'; id: string; stats: PlayerStats }
  /** Any peer may emit noise; the host feeds it all into one bus. */
  | { t: 'noise'; id: string; kind: NoiseKind; x: number; z: number }
  | { t: 'enemy'; x: number; z: number; yaw: number; alert: string }
  /** Host -> the player it caught. They apply their own health ladder and echo it. */
  | { t: 'hit'; id: string }
  | { t: 'health'; id: string; state: HealthState }
  | { t: 'revive'; id: string }
  | { t: 'wiped' };

export type NetRole = 'offline' | 'host' | 'client';

export interface NetEvents {
  /** `slot` picks which spawn point in the shared start room this player uses. */
  onRunStart(run: RunStart, slot: number): void;
  /** How many peers have finished loading. Only the loading screen reads it. */
  onLoading(ready: number, total: number): void;
  /** Everybody is in. Until this arrives the world is built but frozen. */
  onRunGo(): void;
  /**
   * The host is gone. There is no migration by design, so the session is over -
   * see docs/ARCHITECTURE.md, "Deliberately NOT built".
   */
  onHostLost(): void;
  /** This browser is now a client of `host`, standing in their lobby. */
  onLobbyJoined(slot: number): void;
  /** The host's view of the lobby changed. Clients apply it wholesale. */
  onLobbyState(state: LobbySnapshot): void;
  /** A peer picked a map (host only - clients learn from `onLobbyState`). */
  onPick(id: string, mapId: string | null): void;
  /** Somebody pulled the lever (host only, for the same reason). */
  onDifficulty(difficultyId: string): void;
  onLobbyMove(id: string, x: number, z: number, yaw: number): void;
  onCosmetic(id: string, colourId: string): void;
  onPeerJoin(id: string): void;
  onPeerLeave(id: string): void;
  onPeerMove(id: string, transform: PlayerTransform): void;
  /** A peer moved between the cabin and a run. Both worlds drop bodies that left. */
  onScene(id: string, scene: Scene): void;
  /** The host's word on a door. Whatever this browser showed gives way to it. */
  onDoor(doorId: string, open: boolean): void;
  /** Host only: a peer wants a door open or shut. */
  onDoorRequest(doorId: string, open: boolean): void;
  /** Host only: decide a contested claim. `true` grants it. */
  onClaim(kind: ClaimKind, id: string, by: string, value: number): boolean;
  /** `by` won the claim. Every peer applies the result, winner included. */
  onGranted(kind: ClaimKind, id: string, by: string, value: number): void;
  /** This browser lost. Take back whatever it showed in the meantime. */
  onDenied(kind: ClaimKind, id: string): void;
  onItemDropped(id: string, itemId: string, x: number, y: number, z: number): void;
  /** A peer threw something. Its arc is re-simulated locally, not replicated. */
  onItemThrown(
    id: string,
    itemId: string,
    owner: string,
    from: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number },
  ): void;
  onBarricade(doorId: string, seconds: number): void;
  onHealed(toState: HealthState): void;
  onCoins(amount: number): void;
  onNoise(id: string, kind: NoiseKind, x: number, z: number): void;
  onEnemy(transform: EnemyTransform): void;
  /** The host caught this browser's player. */
  onHit(): void;
  onHealth(id: string, state: HealthState): void;
  onRevive(id: string): void;
  onPeerEscaped(id: string): void;
  /** A peer's scoreboard tally. Replaces whatever was held for them. */
  onStats(id: string, stats: PlayerStats): void;
  onWiped(): void;
  /** A peer's voice track arrived. Attenuation is the listener's own business. */
  onVoiceStream(id: string, stream: MediaStream): void;
  onVoiceEnded(id: string): void;
  onStatus(status: string): void;
}

/**
 * Requests the host answers rather than passes on. Relaying one would let a
 * client's opinion reach another client without the host ever deciding, which
 * is exactly what authority is for. `ping` is per-connection liveness and means
 * nothing to a third party.
 */
const NOT_RELAYED: ReadonlySet<NetMessage['t']> = new Set([
  'welcome',
  'pick',
  'setDifficulty',
  'claim',
  'doorRequest',
  'ready',
  'ping',
]);

export class Net {
  #peer: Peer | null = null;
  #connections = new Map<string, DataConnection>();
  #events: NetEvents;
  #config: NetConfig;
  #code = '';
  role: NetRole = 'offline';

  /* --- liveness ------------------------------------------------------------ */
  /** Seconds since anything at all arrived from each peer. */
  #silence = new Map<string, number>();
  #pingTimer = 0;

  /* --- the load gate ------------------------------------------------------- */
  /** Host only: who has finished building the map. */
  #ready = new Set<string>();
  /** Whether a run is currently being held at the loading screen. */
  #gateOpen = false;
  /** Whether the run has been let out of it. */
  #going = false;
  #loadTimer = 0;

  /* --- voice mesh ---------------------------------------------------------- */
  /** Everyone in the session, including peers this browser has no data link to. */
  #players = new Set<string>();
  #calls = new Map<string, MediaConnection>();
  #voiceStream: MediaStream | null = null;

  /** Set by the host when a run starts, replayed to anyone who joins later. */
  #run: RunStart | null = null;
  /** The host's lobby, replayed to anyone who joins. Clients keep a copy to send on. */
  #lobby: LobbySnapshot = { picks: {}, difficultyId: '', countdown: null };
  /** Host-assigned spawn slots. The host is always 0. */
  #slots = new Map<string, number>();
  #nextSlot = 1;

  /* --- scenes -------------------------------------------------------------- */
  /**
   * Which world each peer is standing in. Voice spans both, so a teammate still
   * loading into a run has to stay audible to one still in the lobby - that is
   * the whole reason this is tracked rather than assumed.
   */
  #scene: Scene = 'lobby';
  #scenes = new Map<string, Scene>();

  /* --- identity ------------------------------------------------------------ */
  /** Host-assigned spawn slot for THIS browser. The host is always 0. */
  #mySlot = 0;
  /** Wardrobe choices, so a peer joining mid-lobby sees everyone as they are. */
  #cosmetic = '';
  #cosmetics = new Map<string, string>();

  constructor(events: NetEvents, config: NetConfig) {
    this.#events = events;
    this.#config = config;
  }

  get code(): string {
    return this.#code;
  }

  get selfId(): string {
    return this.#code;
  }

  get peerIds(): string[] {
    return [...this.#connections.keys()];
  }

  /**
   * Everyone else in the session, including peers this browser has no data link
   * to. Not the same as `peerIds`: in the star topology a client is connected
   * only to the host, but it can still see - and call - the other players.
   */
  get players(): string[] {
    return [...this.#players];
  }

  /** Registers this browser with the signalling server and claims a lobby code. */
  async open(code: string): Promise<void> {
    await this.#dispose();
    this.#code = code;

    await new Promise<void>((resolve, reject) => {
      const peer = new Peer(PEER_PREFIX + code, { debug: 0 });
      this.#peer = peer;

      const onOpen = () => {
        peer.off('error', onError);
        resolve();
      };
      const onError = (error: Error) => {
        peer.off('open', onOpen);
        reject(error);
      };

      peer.once('open', onOpen);
      peer.once('error', onError);

      peer.on('connection', (connection) => this.#accept(connection));
      // Answering with our own track makes one call carry both directions, so
      // only one side ever needs to place it (see `#callPeer`).
      peer.on('call', (call) => {
        call.answer(this.#voiceStream ?? undefined);
        this.#registerCall(shortId(call.peer), call);
      });
      peer.on('disconnected', () => this.#events.onStatus('disconnected'));
    });
  }

  /**
   * Becomes the host of a lobby. From here the code is joinable and this browser
   * owns the vote tally, the difficulty and the countdown.
   */
  hostLobby(difficultyId: string): void {
    this.role = 'host';
    this.#run = null;
    this.#lobby = { picks: {}, difficultyId, countdown: null };
    for (const id of this.#connections.keys()) this.#sendWelcome(id);
  }

  /**
   * Host only. Starts the run for everyone and remembers it, so a peer who joins
   * mid-run gets the same seed rather than ending up alone in a different map.
   */
  startRun(run: RunStart): void {
    this.#run = run;
    this.#openGate();
    this.broadcast({ t: 'runStart', run });
  }

  /** Host only. The run is over; the code goes back to being a lobby code. */
  endRun(): void {
    this.#run = null;
    this.#gateOpen = false;
    this.#going = false;
    this.#ready.clear();
  }

  /* --- the load gate ------------------------------------------------------- */

  /**
   * Everybody builds the same map from the same seed, but not at the same
   * speed - a slower machine can be twenty seconds behind. Letting each peer in
   * as it finishes drops them into a run already underway, alone, with the
   * hunter awake. So the world is built, this is called, and nothing moves
   * until the host says everyone is in.
   */
  reportReady(): void {
    if (this.role === 'offline') {
      this.#going = true;
      this.#events.onRunGo();
      return;
    }
    // Belt and braces: a run entered by any route other than `startRun` still
    // gets a gate, because a loading screen that never lifts is the worst thing
    // this could do.
    if (!this.#gateOpen && !this.#going) this.#openGate();

    if (this.role === 'host') {
      this.#markReady(this.selfId);
      return;
    }
    this.broadcast({ t: 'ready', id: this.selfId });
  }

  #openGate(): void {
    this.#ready.clear();
    this.#gateOpen = true;
    this.#going = false;
    this.#loadTimer = this.#config.connection.loadTimeoutSeconds;
  }

  /** Host only. */
  #markReady(id: string): void {
    this.#ready.add(id);

    // A peer that turned up after the gate opened is not being waited for -
    // they were handed the run in their welcome and can walk straight in.
    if (this.#going) {
      if (id !== this.selfId) this.#sendTo(id, { t: 'runGo' });
      return;
    }

    this.broadcast({ t: 'loading', ready: this.#ready.size, total: this.#connections.size + 1 });
    this.#events.onLoading(this.#ready.size, this.#connections.size + 1);
    this.#checkGate();
  }

  /** Host only. Opens the run once nobody is left to wait for. */
  #checkGate(): void {
    if (this.#going || !this.#gateOpen) return;
    if (this.#ready.size < this.#connections.size + 1) return;
    this.#letEveryoneIn();
  }

  #letEveryoneIn(): void {
    this.#gateOpen = false;
    this.#going = true;
    this.broadcast({ t: 'runGo' });
    this.#events.onRunGo();
  }

  /* --- liveness ------------------------------------------------------------ */

  /**
   * Heartbeats out, silence measured in. A browser tab that is closed, crashes
   * or loses its network never sends a goodbye and WebRTC can take the best
   * part of a minute to admit it, so a peer nothing has been heard from for
   * `timeoutSeconds` is treated as gone. The cost of being wrong is one
   * reconnect; the cost of not doing it is a body standing in a corridor for
   * the rest of the run.
   */
  tick(dt: number): void {
    if (this.role === 'offline') return;
    const { heartbeatSeconds, timeoutSeconds } = this.#config.connection;

    this.#pingTimer -= dt;
    if (this.#pingTimer <= 0) {
      this.#pingTimer = heartbeatSeconds;
      this.broadcast({ t: 'ping', id: this.selfId });
    }

    for (const id of [...this.#connections.keys()]) {
      const silence = (this.#silence.get(id) ?? 0) + dt;
      this.#silence.set(id, silence);
      if (silence < timeoutSeconds) continue;
      console.warn('[net] no word from', id, 'for', timeoutSeconds, 'seconds - dropping');
      this.#close(id);
    }

    // Nobody is stranded at a spinner by one peer who never finished loading.
    if (this.role !== 'host' || !this.#gateOpen) return;
    this.#loadTimer -= dt;
    if (this.#loadTimer <= 0) {
      console.warn('[net] load timeout - starting without everyone');
      this.#letEveryoneIn();
    }
  }

  /** Hangs up on a peer and puts everyone else in the same position. */
  #close(id: string): void {
    const connection = this.#connections.get(id);
    this.#connections.delete(id);
    this.#silence.delete(id);
    connection?.close();
    this.#onLost(id);
  }

  /**
   * A connection is gone, however it went. On a client that connection is the
   * host, and losing it ends the session; on the host it is one player, and the
   * run carries on without them.
   */
  #onLost(id: string): void {
    this.#removePlayer(id);

    if (this.role === 'client') {
      this.#events.onHostLost();
      return;
    }
    if (this.role !== 'host') return;

    this.#relay({ t: 'leave', id }, id);
    this.#ready.delete(id);
    this.#checkGate();
  }

  get lobby(): LobbySnapshot {
    return this.#lobby;
  }

  /** Host only. Publishes the tally, the difficulty and the countdown. */
  setLobbyState(state: LobbySnapshot): void {
    this.#lobby = state;
    this.broadcast({ t: 'lobby', state });
  }

  /** A client asking the host to record a pick. The host applies its own directly. */
  sendPick(mapId: string | null): void {
    this.broadcast({ t: 'pick', id: this.selfId, mapId });
  }

  sendDifficulty(difficultyId: string): void {
    this.broadcast({ t: 'setDifficulty', difficultyId });
  }

  /* --- scenes -------------------------------------------------------------- */

  get scene(): Scene {
    return this.#scene;
  }

  /** Announced rather than inferred, so voice knows who to attenuate and who not to. */
  setScene(scene: Scene): void {
    if (this.#scene === scene) return;
    this.#scene = scene;
    this.broadcast({ t: 'scene', id: this.selfId, scene });
  }

  sceneOf(id: string): Scene {
    return this.#scenes.get(id) ?? 'lobby';
  }

  get slot(): number {
    return this.#mySlot;
  }

  /* --- cosmetics ----------------------------------------------------------- */

  setCosmetic(colourId: string): void {
    if (this.#cosmetic === colourId) return;
    this.#cosmetic = colourId;
    this.broadcast({ t: 'cosmetic', id: this.selfId, colourId });
  }

  /** This browser's own choice included, so the scoreboard can colour every row. */
  cosmeticOf(id: string): string | null {
    if (id === this.selfId) return this.#cosmetic || null;
    return this.#cosmetics.get(id) ?? null;
  }

  /** Peers standing in the same world as this browser. Voice attenuates only these. */
  peersInScene(scene: Scene): string[] {
    return [...this.#players].filter((id) => this.sceneOf(id) === scene);
  }

  async join(code: string): Promise<void> {
    const peer = this.#peer;
    if (!peer) throw new Error('net: not opened');

    this.role = 'client';
    const connection = peer.connect(PEER_PREFIX + code.toUpperCase(), { reliable: true });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 12000);
      connection.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      connection.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      peer.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    this.#register(connection);
  }

  #accept(connection: DataConnection): void {
    connection.on('open', () => {
      this.#register(connection);
      const id = shortId(connection.peer);

      if (this.role !== 'host') return;
      if (!this.#slots.has(id)) this.#slots.set(id, this.#nextSlot++);

      this.#sendWelcome(id);
      this.#relay({ t: 'join', id }, id);
      this.#addPlayer(id);
    });
  }

  #sendWelcome(id: string): void {
    const connection = this.#connections.get(id);
    if (!connection) return;
    if (!this.#slots.has(id)) this.#slots.set(id, this.#nextSlot++);

    this.#send(connection, {
      t: 'welcome',
      id,
      host: this.#code,
      slot: this.#slots.get(id) ?? 0,
      peers: this.peerIds.filter((peerId) => peerId !== id),
      lobby: this.#lobby,
      run: this.#run,
    });
  }

  #register(connection: DataConnection): void {
    const id = shortId(connection.peer);
    this.#connections.set(id, connection);
    this.#silence.set(id, 0);

    connection.on('data', (data) => {
      this.#silence.set(id, 0);
      this.#receive(id, data as NetMessage);
    });
    const lost = (): void => {
      if (this.#connections.get(id) !== connection) return;
      this.#connections.delete(id);
      this.#silence.delete(id);
      this.#onLost(id);
    };
    connection.on('close', lost);
    connection.on('error', (error) => {
      console.warn('[net] connection error', id, error);
      lost();
    });
  }

  #receive(from: string, message: NetMessage): void {
    switch (message.t) {
      case 'welcome': {
        this.#run = message.run;
        this.#lobby = message.lobby;
        this.#mySlot = message.slot;
        // The scene has to exist before remotes can be added to it. A joiner
        // lands in the lobby unless the host is already down a hole.
        if (message.run) this.#events.onRunStart(message.run, message.slot);
        else this.#events.onLobbyJoined(message.slot);
        this.#events.onLobbyState(message.lobby);
        // The host is a player too, and it is not in its own peer list.
        this.#addPlayer(message.host);
        for (const peerId of message.peers) this.#addPlayer(peerId);
        break;
      }
      case 'join':
        this.#addPlayer(message.id);
        break;
      case 'leave':
        this.#removePlayer(message.id);
        break;
      case 'lobby':
        this.#lobby = message.state;
        this.#events.onLobbyState(message.state);
        break;
      case 'pick':
        // Only the host tallies. A client seeing this is the relay passing by.
        if (this.role === 'host') this.#events.onPick(message.id, message.mapId);
        break;
      case 'setDifficulty':
        if (this.role === 'host') this.#events.onDifficulty(message.difficultyId);
        break;
      case 'runStart':
        this.#run = message.run;
        this.#gateOpen = false;
        this.#going = false;
        this.#events.onRunStart(message.run, this.#mySlot);
        break;
      case 'ready':
        if (this.role === 'host') this.#markReady(message.id);
        break;
      case 'loading':
        this.#events.onLoading(message.ready, message.total);
        break;
      case 'runGo':
        this.#going = true;
        this.#events.onRunGo();
        break;
      case 'ping':
        // The arrival is the whole message. Silence is what it prevents.
        break;
      case 'lobbyMove':
        this.#events.onLobbyMove(message.id, message.x, message.z, message.yaw);
        break;
      case 'scene':
        this.#scenes.set(message.id, message.scene);
        this.#events.onScene(message.id, message.scene);
        break;
      case 'cosmetic':
        this.#cosmetics.set(message.id, message.colourId);
        this.#events.onCosmetic(message.id, message.colourId);
        break;
      case 'move':
        this.#events.onPeerMove(message.id, message);
        break;
      case 'door':
        this.#events.onDoor(message.id, message.open);
        break;
      case 'doorRequest':
        if (this.role === 'host') this.#events.onDoorRequest(message.id, message.open);
        break;
      case 'claim':
        this.#resolveClaim(message.kind, message.id, message.by, message.value);
        break;
      case 'granted':
        this.#events.onGranted(message.kind, message.id, message.by, message.value);
        break;
      case 'denied':
        // Addressed, not broadcast: only the peer that lost has anything to undo.
        if (message.by === this.selfId) this.#events.onDenied(message.kind, message.id);
        break;
      case 'drop':
        this.#events.onItemDropped(message.id, message.itemId, message.x, message.y, message.z);
        break;
      case 'throw':
        this.#events.onItemThrown(
          message.id,
          message.itemId,
          message.owner,
          { x: message.x, y: message.y, z: message.z },
          { x: message.vx, y: message.vy, z: message.vz },
        );
        break;
      case 'barricade':
        this.#events.onBarricade(message.id, message.seconds);
        break;
      case 'heal':
        // Addressed, not broadcast: only the treated player applies it.
        if (message.id === this.selfId) this.#events.onHealed(message.toState);
        break;
      case 'coins':
        this.#events.onCoins(message.amount);
        break;
      case 'noise':
        this.#events.onNoise(message.id, message.kind, message.x, message.z);
        break;
      case 'enemy':
        this.#events.onEnemy(message);
        break;
      case 'hit':
        // Addressed, not broadcast: only the caught player applies it.
        if (message.id === this.selfId) this.#events.onHit();
        break;
      case 'health':
        this.#events.onHealth(message.id, message.state);
        break;
      case 'revive':
        if (message.id === this.selfId) this.#events.onRevive(message.id);
        break;
      case 'wiped':
        this.#events.onWiped();
        break;
      case 'escaped':
        this.#events.onPeerEscaped(message.id);
        break;
      case 'stats':
        this.#events.onStats(message.id, message.stats);
        break;
    }

    // The host is the only path between clients, so pass it along - unless it
    // was a request addressed to the host, which it answers rather than repeats.
    if (this.role === 'host' && !NOT_RELAYED.has(message.t)) this.#relay(message, from);
  }

  /* --- host authority ------------------------------------------------------ */

  /**
   * The one place a contested thing is decided. Everything the answer depends
   * on - is that item still there, is that door still locked - is world state
   * the host already has, so there is no claim ledger to keep in step: granting
   * a claim is what makes the next one for the same thing fail.
   */
  #resolveClaim(kind: ClaimKind, id: string, by: string, value: number): void {
    if (this.role === 'client') return;

    if (!this.#events.onClaim(kind, id, by, value)) {
      if (by === this.selfId) this.#events.onDenied(kind, id);
      else this.#sendTo(by, { t: 'denied', kind, id, by });
      return;
    }

    this.broadcast({ t: 'granted', kind, id, by, value });
    this.#events.onGranted(kind, id, by, value);
  }

  /**
   * Asks the host for something only one player can have. Offline and on the
   * host this resolves in place, so a solo run never notices there is a
   * protocol at all.
   */
  claim(kind: ClaimKind, id: string, value = 0): void {
    if (this.role === 'client') {
      this.broadcast({ t: 'claim', kind, id, by: this.selfId, value });
      return;
    }
    this.#resolveClaim(kind, id, this.selfId, value);
  }

  /* --- voice --------------------------------------------------------------- */

  /**
   * Hands voice the outgoing track, or `null` to hang up. The track is created
   * once and lives for the session, so this is called on entering and leaving a
   * run - never on a mode change, which is only the gain on that track.
   */
  setVoiceStream(stream: MediaStream | null): void {
    this.#voiceStream = stream;

    if (!stream) {
      for (const call of this.#calls.values()) call.close();
      this.#calls.clear();
      return;
    }
    for (const id of this.#players) this.#callPeer(id);
  }

  /**
   * Places the call for a pair, exactly once. Both sides would otherwise ring
   * each other and every word would arrive twice, so the lower id always dials
   * and the higher always answers.
   */
  #callPeer(id: string): void {
    const peer = this.#peer;
    const stream = this.#voiceStream;
    if (!peer || !stream || this.#calls.has(id) || this.selfId >= id) return;

    this.#registerCall(id, peer.call(PEER_PREFIX + id, stream));
  }

  #registerCall(id: string, call: MediaConnection): void {
    this.#calls.get(id)?.close();
    this.#calls.set(id, call);

    call.on('stream', (remote: MediaStream) => {
      this.#limitBitrate(call);
      this.#events.onVoiceStream(id, remote);
    });
    call.on('close', () => {
      if (this.#calls.get(id) === call) this.#calls.delete(id);
      this.#events.onVoiceEnded(id);
    });
    call.on('error', (error: Error) => {
      console.warn('[net] voice call failed', id, error);
      this.#events.onVoiceEnded(id);
    });
  }

  /**
   * Speech does not need more than `voice.bitrateKbps`, and the gameplay data
   * channels share the same connection - a voice track that grabs the bandwidth
   * would cost everyone their position updates.
   */
  #limitBitrate(call: MediaConnection): void {
    for (const sender of call.peerConnection?.getSenders() ?? []) {
      if (sender.track?.kind !== 'audio') continue;
      const parameters = sender.getParameters();
      parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
      for (const encoding of parameters.encodings) encoding.maxBitrate = this.#config.voice.bitrateKbps * 1000;
      void sender.setParameters(parameters).catch((error: unknown) => {
        console.warn('[net] could not cap voice bitrate', error);
      });
    }
  }

  #addPlayer(id: string): void {
    const known = this.#players.has(id);
    this.#players.add(id);
    this.#events.onPeerJoin(id);
    this.#callPeer(id);

    // Somebody new can see us: say where we are and what colour we are wearing.
    // Cheaper and far simpler than folding both into the welcome and keeping
    // them in step there as well.
    if (!known) {
      this.broadcast({ t: 'scene', id: this.selfId, scene: this.#scene });
      if (this.#cosmetic) this.broadcast({ t: 'cosmetic', id: this.selfId, colourId: this.#cosmetic });
    }
  }

  #removePlayer(id: string): void {
    this.#players.delete(id);
    this.#scenes.delete(id);
    this.#cosmetics.delete(id);
    this.#calls.get(id)?.close();
    this.#calls.delete(id);
    this.#events.onVoiceEnded(id);
    this.#events.onPeerLeave(id);
  }

  #relay(message: NetMessage, exceptId: string): void {
    for (const [id, connection] of this.#connections) {
      if (id !== exceptId) this.#send(connection, message);
    }
  }

  broadcast(message: NetMessage): void {
    for (const connection of this.#connections.values()) this.#send(connection, message);
  }

  /** Host -> one peer. Used where an answer concerns nobody else. */
  #sendTo(id: string, message: NetMessage): void {
    const connection = this.#connections.get(id);
    if (connection) this.#send(connection, message);
  }

  #send(connection: DataConnection, message: NetMessage): void {
    if (!connection.open) return;
    try {
      connection.send(message);
    } catch (error) {
      console.warn('[net] send failed', error);
    }
  }

  async #dispose(): Promise<void> {
    for (const call of this.#calls.values()) call.close();
    this.#calls.clear();
    this.#players.clear();
    this.#scenes.clear();
    this.#cosmetics.clear();
    this.#silence.clear();
    this.#ready.clear();
    this.#gateOpen = false;
    this.#going = false;
    for (const connection of this.#connections.values()) connection.close();
    this.#connections.clear();
    this.#peer?.destroy();
    this.#peer = null;
  }

  async close(): Promise<void> {
    this.role = 'offline';
    this.#run = null;
    this.#lobby = { picks: {}, difficultyId: '', countdown: null };
    this.#mySlot = 0;
    this.#scene = 'lobby';
    await this.#dispose();
  }

  /** Leaves the session but keeps the peer alive, so the code stays claimed. */
  leave(): void {
    this.role = 'offline';
    this.#run = null;
    this.#lobby = { picks: {}, difficultyId: '', countdown: null };
    this.#mySlot = 0;
    this.#scene = 'lobby';
    this.#slots.clear();
    this.#nextSlot = 1;
    this.#silence.clear();
    this.#ready.clear();
    this.#gateOpen = false;
    this.#going = false;
    for (const call of this.#calls.values()) call.close();
    this.#calls.clear();
    for (const id of [...this.#players]) this.#removePlayer(id);
    for (const connection of this.#connections.values()) connection.close();
    this.#connections.clear();
  }
}

function shortId(peerId: string): string {
  return peerId.startsWith(PEER_PREFIX) ? peerId.slice(PEER_PREFIX.length) : peerId;
}

export function makeLobbyCode(alphabet: string, length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}
