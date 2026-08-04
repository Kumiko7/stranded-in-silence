/**
 * Multiplayer over PeerJS (WebRTC), using its default public signalling server.
 *
 * Topology is a STAR: everyone connects to the host, and the host relays. That
 * is the smallest thing that works for 4 players and it keeps the host as the
 * single source of truth for the run seed.
 *
 * Scope note: right now the host is only authoritative over the SEED. Player
 * transforms and door toggles are broadcast and trusted, which is fine with no
 * enemy and no items. The authoritative simulation and client prediction are
 * plan steps 25-27 - see docs/systems/NETWORKING.md.
 *
 * VOICE is the exception to the star: a media call needs only the other peer's
 * id, not a data connection, so voice is a true mesh even though gameplay data
 * still goes through the host. Nothing about voice is relayed or mixed here -
 * this only carries the tracks (docs/systems/AUDIO_VOICE.md).
 */
import Peer, { type DataConnection, type MediaConnection } from 'peerjs';
import type { NoiseKind } from '@/ai/noiseBus';
import type { HealthState, VoiceConfig } from '@/config/types';

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
}

/** The enemy runs on the host; everyone else just receives this. */
export interface EnemyTransform {
  x: number;
  z: number;
  yaw: number;
  alert: string;
}

export type NetMessage =
  | { t: 'welcome'; id: string; host: string; slot: number; mapId: string; seed: number; peers: string[] }
  | { t: 'join'; id: string }
  | { t: 'leave'; id: string }
  | { t: 'move'; id: string; x: number; z: number; yaw: number; height: number; hiding: boolean; health: HealthState }
  | { t: 'door'; id: string; open: boolean }
  | { t: 'unlock'; id: string }
  | { t: 'chest'; id: string }
  | { t: 'take'; id: string }
  | { t: 'drop'; id: string; itemId: string; x: number; y: number; z: number }
  | { t: 'escaped'; id: string }
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
  onRunStart(mapId: string, seed: number, slot: number): void;
  onPeerJoin(id: string): void;
  onPeerLeave(id: string): void;
  onPeerMove(id: string, transform: PlayerTransform): void;
  onDoor(doorId: string, open: boolean): void;
  onDoorUnlocked(doorId: string): void;
  onChestOpened(chestId: string): void;
  onItemTaken(id: string): void;
  onItemDropped(id: string, itemId: string, x: number, y: number, z: number): void;
  onNoise(id: string, kind: NoiseKind, x: number, z: number): void;
  onEnemy(transform: EnemyTransform): void;
  /** The host caught this browser's player. */
  onHit(): void;
  onHealth(id: string, state: HealthState): void;
  onRevive(id: string): void;
  onPeerEscaped(id: string): void;
  onWiped(): void;
  /** A peer's voice track arrived. Attenuation is the listener's own business. */
  onVoiceStream(id: string, stream: MediaStream): void;
  onVoiceEnded(id: string): void;
  onStatus(status: string): void;
}

export class Net {
  #peer: Peer | null = null;
  #connections = new Map<string, DataConnection>();
  #events: NetEvents;
  #voice: VoiceConfig;
  #code = '';
  role: NetRole = 'offline';

  /* --- voice mesh ---------------------------------------------------------- */
  /** Everyone in the session, including peers this browser has no data link to. */
  #players = new Set<string>();
  #calls = new Map<string, MediaConnection>();
  #voiceStream: MediaStream | null = null;

  /** Set by the host when a run starts, replayed to anyone who joins later. */
  #run: { mapId: string; seed: number } | null = null;
  /** Host-assigned spawn slots. The host is always 0. */
  #slots = new Map<string, number>();
  #nextSlot = 1;

  constructor(events: NetEvents, voice: VoiceConfig) {
    this.#events = events;
    this.#voice = voice;
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
   * Becomes the host of a run. Anyone already connected is pulled into it, and
   * late joiners get the same seed - otherwise a peer who connected before the
   * host pressed Play would end up alone in a different map.
   */
  hostRun(mapId: string, seed: number): void {
    this.role = 'host';
    this.#run = { mapId, seed };
    for (const id of this.#connections.keys()) this.#sendWelcome(id);
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

      // No run yet? They stay connected and hostRun() will pull them in.
      if (this.#run) this.#sendWelcome(id);
      this.#relay({ t: 'join', id }, id);
      this.#addPlayer(id);
    });
  }

  #sendWelcome(id: string): void {
    const connection = this.#connections.get(id);
    if (!connection || !this.#run) return;
    if (!this.#slots.has(id)) this.#slots.set(id, this.#nextSlot++);

    this.#send(connection, {
      t: 'welcome',
      id,
      host: this.#code,
      slot: this.#slots.get(id) ?? 0,
      mapId: this.#run.mapId,
      seed: this.#run.seed,
      peers: this.peerIds.filter((peerId) => peerId !== id),
    });
  }

  #register(connection: DataConnection): void {
    const id = shortId(connection.peer);
    this.#connections.set(id, connection);

    connection.on('data', (data) => this.#receive(id, data as NetMessage));
    connection.on('close', () => {
      this.#connections.delete(id);
      this.#removePlayer(id);
      if (this.role === 'host') this.#relay({ t: 'leave', id }, id);
    });
  }

  #receive(from: string, message: NetMessage): void {
    switch (message.t) {
      case 'welcome':
        this.#run = { mapId: message.mapId, seed: message.seed };
        // The run has to exist before remotes can be added to it.
        this.#events.onRunStart(message.mapId, message.seed, message.slot);
        // The host is a player too, and it is not in its own peer list.
        this.#addPlayer(message.host);
        for (const peerId of message.peers) this.#addPlayer(peerId);
        break;
      case 'join':
        this.#addPlayer(message.id);
        break;
      case 'leave':
        this.#removePlayer(message.id);
        break;
      case 'move':
        this.#events.onPeerMove(message.id, message);
        break;
      case 'door':
        this.#events.onDoor(message.id, message.open);
        break;
      case 'unlock':
        this.#events.onDoorUnlocked(message.id);
        break;
      case 'chest':
        this.#events.onChestOpened(message.id);
        break;
      case 'take':
        this.#events.onItemTaken(message.id);
        break;
      case 'drop':
        this.#events.onItemDropped(message.id, message.itemId, message.x, message.y, message.z);
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
    }

    // The host is the only path between clients, so pass it along.
    if (this.role === 'host' && message.t !== 'welcome') this.#relay(message, from);
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
      for (const encoding of parameters.encodings) encoding.maxBitrate = this.#voice.bitrateKbps * 1000;
      void sender.setParameters(parameters).catch((error: unknown) => {
        console.warn('[net] could not cap voice bitrate', error);
      });
    }
  }

  #addPlayer(id: string): void {
    this.#players.add(id);
    this.#events.onPeerJoin(id);
    this.#callPeer(id);
  }

  #removePlayer(id: string): void {
    this.#players.delete(id);
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
    for (const connection of this.#connections.values()) connection.close();
    this.#connections.clear();
    this.#peer?.destroy();
    this.#peer = null;
  }

  async close(): Promise<void> {
    this.role = 'offline';
    this.#run = null;
    await this.#dispose();
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
