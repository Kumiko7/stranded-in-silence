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
import { type LinkHealth, type LinkQuality, nowSeconds, PeerClock } from '@/net/timing';
import type { PlayerStats } from '@/world/runStats';
import type { Cosmetic } from '@shared/cosmetics';
import { cleanPlayerName } from '@shared/playerName';

/** Namespaced so a 6-character code cannot collide with another app on the public server. */
const PEER_PREFIX = 'stranded-in-silence-';

export interface PlayerTransform {
  x: number;
  z: number;
  yaw: number;
  /**
   * Where they are looking vertically. No body is drawn with it - it rides
   * along so that a SPECTATOR can sit behind this player's eyes, which is the
   * one place in the game that needs to know (plan step 39).
   */
  pitch: number;
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

/** The hunters run on the host; everyone else just receives this. */
export interface EnemyTransform {
  /**
   * Which hunter. How many there are is a pure function of the map and the
   * difficulty (`enemy.json -> spawn.regions`), which every peer already has -
   * so an index is all that has to cross the wire.
   */
  index: number;
  x: number;
  z: number;
  yaw: number;
  alert: string;
  /**
   * Whose doing this is - the player whose noise it heard, whose body it saw,
   * or who it watched climb into a locker. Null while it is calm.
   *
   * It is here because an alert is not a fact about the world the way a
   * position is, it is a fact about somebody's *situation*: the sting that says
   * "it has noticed" belongs to the player who was noticed, and playing it in
   * four browsers at once tells three of them a lie about their own run.
   */
  by: string | null;
  /**
   * The place it is worked up ABOUT - the noise, the last sighting - rather than
   * where it currently is. Its own position when there is nothing.
   *
   * A hunter that heard a door slam next to you starts walking over from the
   * far end of the map, and the tension belongs to where the slam was, not to
   * where the hunter has got to. Without this a teammate setting something off
   * beside you would be silent until the thing arrived.
   */
  ax: number;
  az: number;
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

/**
 * The two fields every continuous message carries, filled in by `Net` on the
 * way out and always there on the way in.
 *
 * `st` is the SENDER's monotonic clock. It is what lets a receiver put samples
 * back on a timeline of their own instead of stamping them with when they
 * happened to arrive - see `src/net/timing.ts`, which is where the whole
 * argument for it lives. `q` is a per-sender packet counter: the `state`
 * channel is unordered and lossy on purpose, so the gaps in it are how a link's
 * packet loss is measured.
 *
 * A relayed message keeps the ORIGINAL sender's pair, never the relay's, so a
 * client measures the trip from the peer that moved rather than from the host
 * that passed it on.
 */
type Stamped = { q: number; st: number };

export type NetMessage =
  | {
      t: 'welcome';
      id: string;
      host: string;
      slot: number;
      /**
       * Every peer's slot, sent whole. The slot is not only where somebody
       * spawns: it is the number the interface calls them by, so it has to be
       * the same on every screen - and a map small enough to send entire
       * removes any question of two peers disagreeing about it.
       */
      slots: Record<string, number>;
      peers: string[];
      lobby: LobbySnapshot;
      /** Set only when the host is already in a run, so a late joiner catches up. */
      run: RunStart | null;
    }
  /** `slot` is the host's, so a joiner is the same number to everybody at once. */
  | { t: 'join'; id: string; slot: number }
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
  /**
   * Any -> all, on an interval. Silence for `timeoutSeconds` is a disconnect.
   * `n` is a nonce the answering `pong` quotes back, which is what turns a
   * heartbeat into a round-trip measurement.
   */
  | ({ t: 'ping'; id: string; n: number } & Partial<Stamped>)
  /** The answer to one `ping`, addressed to whoever sent it and nobody else. */
  | ({ t: 'pong'; id: string; to: string; n: number } & Partial<Stamped>)
  | ({ t: 'lobbyMove'; id: string; x: number; z: number; yaw: number } & Partial<Stamped>)
  /**
   * A dart, as its release state plus the thrower's wind clock. Every peer
   * re-runs the same flight from it, exactly as they do for a `throw` - the
   * clock is here because the wind is a function of time and two browsers have
   * not been in the cabin for the same number of seconds
   * (`src/entities/dart.ts`).
   */
  | {
      t: 'dart';
      id: string;
      owner: string;
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
      wind: number;
    }
  /**
   * A player's running dart total. Self-reported and sent whole, like the run's
   * `stats` block and for the same reason: nobody arbitrates a scoreboard, and
   * a message lost on the way costs nothing because the next one is the truth.
   */
  | { t: 'dartScore'; id: string; score: number }
  /** Any -> all, on change and on anyone joining. Voice reads it across scenes. */
  | { t: 'scene'; id: string; scene: Scene }
  | { t: 'cosmetic'; id: string; colourId: string; hatId: string }
  /**
   * What this peer calls itself, re-announced the same way a cosmetic is. The
   * only free text in the protocol other than chat, so it is cleaned on arrival
   * rather than trusted (`@shared/playerName`).
   */
  | { t: 'name'; id: string; name: string }
  /**
   * One line of text, broadcast to the whole session. Who is allowed to READ it
   * is the receiver's business, not this layer's: a live player drops a line
   * from a spectator, by the same rule that keeps them off the voice channel
   * (`Game.canHearChatFrom`). Sending it to everyone and filtering on arrival
   * is what keeps that one rule in one place.
   */
  | { t: 'chat'; id: string; text: string }
  | ({
      t: 'move';
      id: string;
      x: number;
      z: number;
      yaw: number;
      pitch: number;
      height: number;
      hiding: boolean;
      health: HealthState;
      left: string | null;
      right: string | null;
      /**
       * The last word from a body about to stop moving - a player leaving the
       * run, out of turn. It is the one transform that has to arrive: it says
       * the hands are empty, and a later disconnect that never saw it would
       * spawn a second copy of whatever they were last holding. So this one
       * takes the reliable channel, and keeps taking it when the host relays it.
       */
      final?: boolean;
    } & Partial<Stamped>)
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
  | ({
      t: 'enemy';
      index: number;
      x: number;
      z: number;
      yaw: number;
      alert: string;
      /** Whose doing it is, and where it is worked up about - see `EnemyTransform`. */
      by: string | null;
      ax: number;
      az: number;
    } & Partial<Stamped>)
  /** Host -> the player it caught. They apply their own health ladder and echo it. */
  | { t: 'hit'; id: string }
  | { t: 'health'; id: string; state: HealthState }
  | { t: 'revive'; id: string }
  /**
   * Somebody's hands are on `id`, or have come off again. Addressed like `heal`:
   * only the player on the floor applies it, because the only thing it does is
   * stop their bleed-out clock. Sent on the edges of the hold, not per tick.
   */
  | { t: 'reviving'; id: string; by: string; active: boolean }
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
  onLobbyMove(id: string, x: number, z: number, yaw: number, at: number): void;
  /** A peer threw a dart. Its flight is re-simulated locally, not replicated. */
  onDartThrown(
    id: string,
    owner: string,
    from: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number },
    wind: number,
  ): void;
  /** A peer's dart total. Replaces whatever was held for them. */
  onDartScore(id: string, score: number): void;
  onCosmetic(id: string, cosmetic: Cosmetic): void;
  /** A peer named itself. Everything that draws a name re-reads `nameOf`. */
  onName(id: string, name: string | null): void;
  /** A line of text from a peer. Whether it is shown is decided above this. */
  onChat(id: string, text: string): void;
  onPeerJoin(id: string): void;
  onPeerLeave(id: string): void;
  /**
   * `at` is when this sample belongs on THIS machine's timeline, worked out
   * from the sender's own clock rather than from when the packet turned up.
   * Presentation buffers key on it; the simulation ignores it.
   */
  onPeerMove(id: string, transform: PlayerTransform, at: number): void;
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
  onEnemy(transform: EnemyTransform, at: number): void;
  /** The host caught this browser's player. */
  onHit(): void;
  onHealth(id: string, state: HealthState): void;
  onRevive(id: string): void;
  /** Somebody's hands are on this browser's player, or have come off. */
  onReviving(by: string, active: boolean): void;
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
  'pong',
]);

/**
 * What rides the `state` channel: unordered, never retransmitted, and dropped
 * outright rather than queued when the link is backing up.
 *
 * The rule is one question - does a copy that arrives late still say something
 * true? A transform does not: the next one is already on its way and is a
 * better answer than the one that was lost. A door opening does, for ever, so
 * it goes on the reliable channel with everything else.
 *
 * This is the single largest thing standing between a choppy connection and a
 * body that jumps. On one ordered reliable channel, ONE lost snapshot holds up
 * every message behind it until it has been re-sent - so a body freezes for a
 * round trip and then teleports through the backlog. Nothing in the buffer can
 * smooth that out, because by the time the samples arrive they are all in the
 * past at once.
 */
const STATE_MESSAGES: ReadonlySet<NetMessage['t']> = new Set(['move', 'enemy', 'lobbyMove', 'ping', 'pong']);

/** The label both sides open the out-of-band channel under. */
const STATE_LABEL = 'state';

/** Worst-first ordering, for picking the one link an indicator can show. */
const RANK: Record<LinkHealth, number> = { good: 0, unstable: 1, lost: 2 };

/**
 * Past this much unsent data the state channel is treated as blocked and
 * snapshots are thrown away instead of queued. Queueing them is how a link that
 * recovers replays thirty stale positions at once.
 */
const STATE_BUFFER_LIMIT = 64 * 1024;

/**
 * One peer's transport: the reliable connection PeerJS made, the unreliable
 * channel opened alongside it on the same peer connection, and how well the
 * pair of them are doing.
 */
interface Link {
  id: string;
  connection: DataConnection;
  /** Null until the out-of-band channel opens, and if it never does. */
  state: RTCDataChannel | null;
  /** Seconds since anything at all arrived from this peer. */
  silence: number;
  health: LinkHealth;
}

export class Net {
  #peer: Peer | null = null;
  #links = new Map<string, Link>();
  #events: NetEvents;
  #config: NetConfig;
  #code = '';
  role: NetRole = 'offline';

  /* --- liveness ------------------------------------------------------------ */
  #pingTimer = 0;
  /** Nonce -> when it went out, so a `pong` measures a real round trip. */
  #pings = new Map<number, number>();
  #pingNonce = 0;

  /* --- signalling ---------------------------------------------------------- */
  /**
   * The socket to the signalling server, which is not the peer links. Losing it
   * costs nobody their game - but nobody else can join, and it never comes back
   * by itself, so it is re-opened quietly underneath a run in progress.
   */
  #signalRetries = 0;
  #signalTimer: ReturnType<typeof setTimeout> | null = null;

  /* --- timing -------------------------------------------------------------- */
  /**
   * One clock per PLAYER rather than per connection: in the star a client hears
   * about its two teammates through the host, and the trip that matters is the
   * one from whoever actually moved.
   */
  #clocks = new Map<string, PeerClock>();
  /** This browser's outgoing packet counter for the state channel. */
  #seq = 0;

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
  /**
   * Spawn slots, and with them the number every screen calls a player by. The
   * HOST hands them out and publishes the whole map, so "Player 2" means the
   * same person in four browsers - which a number each peer worked out for
   * itself never could, because everybody would be Player 1 to themselves.
   */
  #slots = new Map<string, number>();

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
  /** The code of the lobby this browser joined. Empty while hosting its own. */
  #hostCode = '';
  /** Wardrobe choices, so a peer joining mid-lobby sees everyone as they are. */
  #cosmetic: Cosmetic | null = null;
  #cosmetics = new Map<string, Cosmetic>();
  /** Names, announced and re-announced exactly as the cosmetics are. */
  #name: string | null = null;
  #names = new Map<string, string>();

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
    return [...this.#links.keys()];
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
      // The signalling socket, not a peer link. Existing games carry on over
      // the top of this; what it costs while it is down is anyone joining.
      peer.on('disconnected', () => {
        this.#events.onStatus('disconnected');
        this.#restoreSignalling();
      });
      peer.on('open', () => {
        this.#signalRetries = 0;
        this.#events.onStatus('connected');
      });
    });
  }

  /**
   * Re-opens the socket to the signalling server on the configured backoff.
   * PeerJS gives up after one attempt of its own, and a lobby whose code has
   * quietly stopped being joinable looks exactly like one that works.
   */
  #restoreSignalling(): void {
    const peer = this.#peer;
    const { reconnectAttempts, reconnectBackoffSeconds } = this.#config.signalling;
    if (!peer || peer.destroyed || this.#signalTimer) return;
    if (this.#signalRetries >= reconnectAttempts) return;

    const waits = reconnectBackoffSeconds;
    const wait = waits[Math.min(this.#signalRetries, waits.length - 1)] ?? 1;
    this.#signalRetries++;

    this.#signalTimer = setTimeout(() => {
      this.#signalTimer = null;
      if (!this.#peer || this.#peer.destroyed || !this.#peer.disconnected) return;
      try {
        this.#peer.reconnect();
      } catch (error) {
        console.warn('[net] signalling reconnect failed', error);
      }
      // Whether that took is answered by `open` or by another `disconnected`,
      // so there is nothing to check here.
      this.#restoreSignalling();
    }, wait * 1000);
  }

  /**
   * Becomes the host of a lobby. From here the code is joinable and this browser
   * owns the vote tally, the difficulty and the countdown.
   */
  hostLobby(difficultyId: string): void {
    this.role = 'host';
    this.#run = null;
    this.#lobby = { picks: {}, difficultyId, countdown: null };
    // The host is player one of its own lobby. Cleared first because anyone
    // already connected is about to be dealt a fresh slot with the welcome.
    this.#slots.clear();
    this.#slots.set(this.selfId, 0);
    for (const id of this.#links.keys()) this.#sendWelcome(id);
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

    this.broadcast({ t: 'loading', ready: this.#ready.size, total: this.#links.size + 1 });
    this.#events.onLoading(this.#ready.size, this.#links.size + 1);
    this.#checkGate();
  }

  /** Host only. Opens the run once nobody is left to wait for. */
  #checkGate(): void {
    if (this.#going || !this.#gateOpen) return;
    if (this.#ready.size < this.#links.size + 1) return;
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
    // The jitter buffers keep adapting whatever the session is doing: they are
    // measured in real seconds, and a peer standing in a menu is still moving.
    for (const clock of this.#clocks.values()) clock.tick(dt);
    if (this.role === 'offline') return;
    const { heartbeatSeconds, unstableSeconds, timeoutSeconds } = this.#config.connection;

    this.#pingTimer -= dt;
    if (this.#pingTimer <= 0) {
      this.#pingTimer = heartbeatSeconds;
      const n = ++this.#pingNonce;
      this.#pings.set(n, nowSeconds());
      // Older than any answer could reasonably be. Left alone this would grow
      // for the length of a session.
      for (const [nonce, at] of this.#pings) {
        if (nowSeconds() - at > timeoutSeconds) this.#pings.delete(nonce);
      }
      this.broadcast({ t: 'ping', id: this.selfId, n });
    }

    for (const link of [...this.#links.values()]) {
      link.silence += dt;

      // Three stages, not two. A link that has gone quiet for a couple of
      // seconds is a bad connection, and dropping somebody for it is the
      // failure this split exists to prevent: their body would leave, their
      // key would fall on the floor and the run would carry on without them
      // over a wifi hiccup. Only real silence is a real disconnect.
      if (link.silence >= timeoutSeconds) {
        console.warn('[net] no word from', link.id, 'for', timeoutSeconds, 'seconds - dropping');
        this.#close(link.id);
        continue;
      }
      link.health = link.silence >= unstableSeconds ? 'unstable' : 'good';
    }

    // Nobody is stranded at a spinner by one peer who never finished loading.
    if (this.role !== 'host' || !this.#gateOpen) return;
    this.#loadTimer -= dt;
    if (this.#loadTimer <= 0) {
      console.warn('[net] load timeout - starting without everyone');
      this.#letEveryoneIn();
    }
  }

  /* --- connection quality -------------------------------------------------- */

  /**
   * How this browser's own link is doing, or null when there is nothing to
   * report. A client has exactly one link that matters - the host's. A host has
   * one per player, and the honest answer for a single indicator is the worst
   * of them: a host whose game is fine while one player's is not still has a
   * problem, and it is one only the host can see.
   */
  linkQuality(): LinkQuality | null {
    let worst: LinkQuality | null = null;
    for (const link of this.#links.values()) {
      const quality = this.#clock(link.id).quality(link.health);
      if (!worst) {
        worst = quality;
        continue;
      }
      // Health outranks latency, and only breaks ties with it. A slow link that
      // is still delivering must never displace a silent one in the report.
      const rank = RANK[quality.health] - RANK[worst.health];
      if (rank > 0 || (rank === 0 && (quality.rttMs ?? 0) > (worst.rttMs ?? 0))) worst = quality;
    }
    return worst;
  }

  /** The same figures for one peer, whether or not there is a direct link. */
  qualityOf(id: string): LinkQuality {
    return this.#clock(id).quality(this.#links.get(id)?.health ?? 'good');
  }

  /**
   * The clock a body replicated by `id` should be played back against. Handed
   * to every `TransformBuffer`, which is the only thing above `net/` that has
   * any business knowing this exists: the buffer asks it how far in the past to
   * draw, and it answers with what this link is measurably doing.
   *
   * Every hunter shares the host's, because they all come off one machine on
   * one send.
   */
  clockFor(id: string): PeerClock {
    return this.#clock(id);
  }

  /**
   * Whoever is running the simulation: the host's code on a client, this
   * browser's own otherwise. What a client's hunters are timed against.
   */
  get hostId(): string {
    return this.role === 'client' && this.#hostCode ? this.#hostCode : this.#code;
  }

  /**
   * The clock for one player, made on demand. Peers a client has no link to -
   * its two teammates, in the star - still have one, because their transforms
   * still arrive stamped with a clock of their own.
   */
  #clock(id: string): PeerClock {
    let clock = this.#clocks.get(id);
    if (!clock) {
      clock = new PeerClock(this.#config.simulation.interpolation, this.#config.connection.rttSamples);
      this.#clocks.set(id, clock);
    }
    return clock;
  }

  /** Hangs up on a peer and puts everyone else in the same position. */
  #close(id: string): void {
    const link = this.#links.get(id);
    this.#links.delete(id);
    link?.state?.close();
    link?.connection.close();
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
    // Their number goes back in the pot only between runs - see `#claimSlot`.
    if (!this.#run) this.#slots.delete(id);
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

  /**
   * The number every screen calls a player by: their host-dealt slot plus one.
   *
   * It is the host's answer rather than each browser's own, which is the whole
   * point - a peer numbering itself 1 and everybody else from 2 gives four
   * players four different rosters, and "Player 2 has the key" means four
   * different people. A peer the host has not placed yet takes the lowest free
   * number locally and is corrected the moment the real map lands, so a body is
   * never drawn with no name at all.
   */
  playerNumber(id: string): number {
    return this.#claimSlot(id) + 1;
  }

  /** Which slot the host gave someone, if anyone has said yet. */
  slotOf(id: string): number | null {
    return this.#slots.get(id) ?? null;
  }

  /**
   * The code that gets somebody into the lobby this browser is IN, which is the
   * host's rather than its own. A client showing its own code in the escape
   * menu is offering a lobby nobody is standing in.
   */
  get lobbyCode(): string {
    return this.role === 'client' && this.#hostCode ? this.#hostCode : this.#code;
  }

  /* --- cosmetics ----------------------------------------------------------- */

  setCosmetic(cosmetic: Cosmetic): void {
    const current = this.#cosmetic;
    if (current && current.colourId === cosmetic.colourId && current.hatId === cosmetic.hatId) return;
    this.#cosmetic = cosmetic;
    this.broadcast({ t: 'cosmetic', id: this.selfId, colourId: cosmetic.colourId, hatId: cosmetic.hatId });
  }

  /** This browser's own choice included, so the scoreboard can dress every row. */
  cosmeticOf(id: string): Cosmetic | null {
    if (id === this.selfId) return this.#cosmetic;
    return this.#cosmetics.get(id) ?? null;
  }

  /* --- names --------------------------------------------------------------- */

  /** Already cleaned by the caller; sent only when it actually changed. */
  setName(name: string | null): void {
    if (this.#name === name) return;
    this.#name = name;
    this.broadcast({ t: 'name', id: this.selfId, name: name ?? '' });
  }

  /** This browser included, so one lookup answers for every line of every list. */
  nameOf(id: string): string | null {
    if (id === this.selfId) return this.#name;
    return this.#names.get(id) ?? null;
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

      // Their welcome carries the whole slot map, so it has to be dealt before
      // the welcome goes out - and the relay tells everyone already here who
      // the newcomer is going to be numbered as.
      this.#sendWelcome(id);
      this.#relay({ t: 'join', id, slot: this.#claimSlot(id) }, id);
      this.#addPlayer(id);
    });
  }

  #sendWelcome(id: string): void {
    const link = this.#links.get(id);
    if (!link) return;
    const slot = this.#claimSlot(id);

    this.#send(link, {
      t: 'welcome',
      id,
      host: this.#code,
      slot,
      slots: Object.fromEntries(this.#slots),
      peers: this.peerIds.filter((peerId) => peerId !== id),
      lobby: this.#lobby,
      run: this.#run,
    });
  }

  /**
   * The lowest free slot. Lowest rather than "one more than the last one dealt"
   * so that a lobby people come and go from stays four players numbered one to
   * four, rather than climbing to Player 7 in a room of two.
   *
   * A slot is only ever freed **between runs** (`#onLost`). Inside one, the
   * player who dropped keeps their number for as long as the run they were part
   * of lasts: their roster line and their scoreboard column are still there,
   * greyed, and a newcomer inheriting that number would put two of them on it.
   */
  #claimSlot(id: string): number {
    const held = this.#slots.get(id);
    if (held !== undefined) return held;

    const taken = new Set(this.#slots.values());
    let slot = 0;
    while (taken.has(slot)) slot++;
    this.#slots.set(id, slot);
    return slot;
  }

  #register(connection: DataConnection): void {
    const id = shortId(connection.peer);
    const link: Link = { id, connection, state: null, silence: 0, health: 'good' };
    this.#links.set(id, link);
    this.#clock(id);

    connection.on('data', (data) => {
      link.silence = 0;
      this.#receive(id, data as NetMessage);
    });
    const lost = (): void => {
      if (this.#links.get(id) !== link) return;
      this.#links.delete(id);
      link.state?.close();
      this.#onLost(id);
    };
    // A connection that CLOSES is a peer that has gone, and is not waited out:
    // the silence timeout is for a link that might still come back, and this
    // one has already said it is not going to.
    connection.on('close', lost);
    connection.on('error', (error) => {
      console.warn('[net] connection error', id, error);
      lost();
    });

    this.#openStateChannel(link);
  }

  /**
   * Opens the unreliable half of this link.
   *
   * It is a second data channel on the SAME peer connection PeerJS already
   * negotiated, declared out of band on a fixed id so both ends can create it
   * without another offer/answer round - which is the whole reason it is done
   * this way rather than by opening a second PeerJS connection. One ICE
   * negotiation per pair, two channels over it.
   *
   * PeerJS itself only offers `reliable: true | false`, and its `false` is
   * unordered but still retransmitted. Going to the peer connection directly is
   * what buys `maxRetransmits: 0`: a snapshot that has to be re-sent has already
   * been replaced by a newer one, and delivering it late is worse than not at all.
   */
  #openStateChannel(link: Link): void {
    const peerConnection = link.connection.peerConnection;
    if (!peerConnection || link.state) return;
    const { id, ordered, maxRetransmits } = this.#config.channels.state;

    let channel: RTCDataChannel;
    try {
      channel = peerConnection.createDataChannel(STATE_LABEL, { negotiated: true, id, ordered, maxRetransmits });
    } catch (error) {
      // Nothing here is fatal: every state message falls back to the reliable
      // connection, which is exactly where they all used to go.
      console.warn('[net] no unreliable channel - snapshots will use the reliable one', error);
      return;
    }

    channel.onmessage = (event: MessageEvent<string>) => {
      link.silence = 0;
      try {
        this.#receive(link.id, JSON.parse(event.data) as NetMessage);
      } catch (error) {
        console.warn('[net] bad state message', error);
      }
    };
    // Losing this channel is not losing the peer. The link carries on over the
    // reliable connection until the peer connection itself goes.
    channel.onclose = () => {
      if (link.state === channel) link.state = null;
    };
    channel.onerror = () => {
      if (link.state === channel) link.state = null;
    };

    link.state = channel;
  }

  /**
   * Where a stamped message belongs on THIS machine's timeline. Everything
   * continuous goes through here on arrival, and nothing above `net/` ever sees
   * an arrival time - which is the point, because an arrival time carries the
   * connection's jitter and a send time does not.
   */
  #place(from: string, message: NetMessage): number {
    const local = nowSeconds();
    const stamped = message as Partial<Stamped>;
    if (stamped.st === undefined) return local;

    // The sender, not the relay: in the star a client hears about its teammates
    // through the host, and the clock that matters is the one they moved on.
    const source = 'id' in message && typeof message.id === 'string' ? message.id : from;
    const clock = this.#clock(source);
    if (stamped.q !== undefined) clock.countSequence(stamped.q);
    return clock.accept(stamped.st, local) ?? local;
  }

  #receive(from: string, message: NetMessage): void {
    const at = this.#place(from, message);

    switch (message.t) {
      case 'welcome': {
        this.#run = message.run;
        this.#lobby = message.lobby;
        this.#mySlot = message.slot;
        this.#hostCode = message.host;
        // Wholesale, like the lobby: the host's map is the only one that counts.
        this.#slots = new Map(Object.entries(message.slots));
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
        this.#slots.set(message.id, message.slot);
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
        // Arriving is most of what it does - silence is what it prevents - but
        // quoting the nonce straight back is what turns it into a measurement.
        this.#sendTo(from, { t: 'pong', id: this.selfId, to: message.id, n: message.n });
        break;
      case 'pong': {
        if (message.to !== this.selfId) break;
        const sent = this.#pings.get(message.n);
        if (sent !== undefined) this.#clock(message.id).observeRoundTrip(nowSeconds() - sent);
        break;
      }
      case 'lobbyMove':
        this.#events.onLobbyMove(message.id, message.x, message.z, message.yaw, at);
        break;
      case 'dart':
        this.#events.onDartThrown(
          message.id,
          message.owner,
          { x: message.x, y: message.y, z: message.z },
          { x: message.vx, y: message.vy, z: message.vz },
          message.wind,
        );
        break;
      case 'dartScore':
        this.#events.onDartScore(message.id, message.score);
        break;
      case 'scene':
        this.#scenes.set(message.id, message.scene);
        this.#events.onScene(message.id, message.scene);
        break;
      case 'cosmetic': {
        const cosmetic = { colourId: message.colourId, hatId: message.hatId };
        this.#cosmetics.set(message.id, cosmetic);
        this.#events.onCosmetic(message.id, cosmetic);
        break;
      }
      case 'name': {
        // Cleaned here rather than trusted: this is the only place a peer gets
        // to put text of its own choosing on somebody else's screen.
        const name = cleanPlayerName(message.name, this.#config.identity.nameMaxLength);
        if (name) this.#names.set(message.id, name);
        else this.#names.delete(message.id);
        this.#events.onName(message.id, name);
        break;
      }
      case 'chat':
        this.#events.onChat(message.id, message.text);
        break;
      case 'move':
        this.#events.onPeerMove(message.id, message, at);
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
        this.#events.onEnemy(message, at);
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
      case 'reviving':
        // Addressed, not broadcast: only the player on the floor has a clock.
        if (message.id === this.selfId) this.#events.onReviving(message.by, message.active);
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
      const cosmetic = this.#cosmetic;
      if (cosmetic) {
        this.broadcast({ t: 'cosmetic', id: this.selfId, colourId: cosmetic.colourId, hatId: cosmetic.hatId });
      }
      if (this.#name) this.broadcast({ t: 'name', id: this.selfId, name: this.#name });
    }
  }

  #removePlayer(id: string): void {
    this.#players.delete(id);
    this.#clocks.delete(id);
    this.#scenes.delete(id);
    this.#cosmetics.delete(id);
    this.#names.delete(id);
    this.#calls.get(id)?.close();
    this.#calls.delete(id);
    this.#events.onVoiceEnded(id);
    this.#events.onPeerLeave(id);
  }

  /**
   * Passes a message on to everyone but its sender, keeping the stamp it
   * arrived with. Re-stamping it here would measure the trip from the host
   * rather than from the peer that actually moved, and the buffer at the far
   * end would be covering the wrong link's jitter.
   */
  #relay(message: NetMessage, exceptId: string): void {
    for (const [id, link] of this.#links) {
      if (id !== exceptId) this.#send(link, message);
    }
  }

  broadcast(message: NetMessage): void {
    this.#stamp(message);
    for (const link of this.#links.values()) this.#send(link, message);
  }

  /** Host -> one peer. Used where an answer concerns nobody else. */
  #sendTo(id: string, message: NetMessage): void {
    const link = this.#links.get(id);
    if (!link) return;
    this.#stamp(message);
    this.#send(link, message);
  }

  /**
   * Writes this browser's clock and packet counter onto anything continuous, on
   * the way out and in one place, so nothing above `net/` has to know that
   * replicated motion is timed at all.
   */
  #stamp(message: NetMessage): void {
    if (!STATE_MESSAGES.has(message.t)) return;
    const stamped = message as Partial<Stamped>;
    if (stamped.st !== undefined) return; // already been through here
    stamped.q = this.#seq++;
    stamped.st = nowSeconds();
  }

  #send(link: Link, message: NetMessage): void {
    if (STATE_MESSAGES.has(message.t) && !mustArrive(message)) {
      const channel = link.state;
      if (channel?.readyState === 'open') {
        // A backed-up unreliable channel is a link that has stopped moving
        // data, and every byte waiting in it is already out of date. Dropping
        // them is what stops a recovered link replaying a minute of stale
        // positions - which looks exactly like a body teleporting.
        if (channel.bufferedAmount > STATE_BUFFER_LIMIT) return;
        try {
          channel.send(JSON.stringify(message));
          return;
        } catch (error) {
          console.warn('[net] state channel send failed', error);
        }
      }
    }

    if (!link.connection.open) return;
    try {
      link.connection.send(message);
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
    this.#names.clear();
    this.#ready.clear();
    this.#gateOpen = false;
    this.#going = false;
    this.#closeLinks();
    if (this.#signalTimer) clearTimeout(this.#signalTimer);
    this.#signalTimer = null;
    this.#signalRetries = 0;
    this.#peer?.destroy();
    this.#peer = null;
  }

  /** Hangs up every link, both halves of each, and forgets what they measured. */
  #closeLinks(): void {
    for (const link of this.#links.values()) {
      link.state?.close();
      link.connection.close();
    }
    this.#links.clear();
    this.#clocks.clear();
    this.#pings.clear();
  }

  async close(): Promise<void> {
    this.role = 'offline';
    this.#run = null;
    this.#lobby = { picks: {}, difficultyId: '', countdown: null };
    this.#mySlot = 0;
    this.#hostCode = '';
    this.#slots.clear();
    this.#scene = 'lobby';
    await this.#dispose();
  }

  /** Leaves the session but keeps the peer alive, so the code stays claimed. */
  leave(): void {
    this.role = 'offline';
    this.#run = null;
    this.#lobby = { picks: {}, difficultyId: '', countdown: null };
    this.#mySlot = 0;
    this.#hostCode = '';
    this.#scene = 'lobby';
    this.#slots.clear();
    this.#ready.clear();
    this.#gateOpen = false;
    this.#going = false;
    for (const call of this.#calls.values()) call.close();
    this.#calls.clear();
    for (const id of [...this.#players]) this.#removePlayer(id);
    this.#closeLinks();
  }
}

/**
 * A message that normally rides the lossy channel but this once cannot be
 * allowed to disappear. It says so in the message itself rather than at the
 * call site, so a host relaying it on makes the same decision the sender did.
 */
function mustArrive(message: NetMessage): boolean {
  return message.t === 'move' && message.final === true;
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
