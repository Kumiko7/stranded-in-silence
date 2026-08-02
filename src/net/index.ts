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
 */
import Peer, { type DataConnection } from 'peerjs';

/** Namespaced so a 6-character code cannot collide with another app on the public server. */
const PEER_PREFIX = 'stranded-in-silence-';

export interface PlayerTransform {
  x: number;
  z: number;
  yaw: number;
  height: number;
}

export type NetMessage =
  | { t: 'welcome'; id: string; host: string; slot: number; mapId: string; seed: number; peers: string[] }
  | { t: 'join'; id: string }
  | { t: 'leave'; id: string }
  | { t: 'move'; id: string; x: number; z: number; yaw: number; height: number }
  | { t: 'door'; id: string; open: boolean }
  | { t: 'unlock'; id: string }
  | { t: 'chest'; id: string }
  | { t: 'take'; id: string }
  | { t: 'drop'; id: string; itemId: string; x: number; y: number; z: number }
  | { t: 'escaped'; id: string };

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
  onStatus(status: string): void;
}

export class Net {
  #peer: Peer | null = null;
  #connections = new Map<string, DataConnection>();
  #events: NetEvents;
  #code = '';
  role: NetRole = 'offline';

  /** Set by the host when a run starts, replayed to anyone who joins later. */
  #run: { mapId: string; seed: number } | null = null;
  /** Host-assigned spawn slots. The host is always 0. */
  #slots = new Map<string, number>();
  #nextSlot = 1;

  constructor(events: NetEvents) {
    this.#events = events;
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
      this.#events.onPeerJoin(id);
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
      this.#events.onPeerLeave(id);
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
        this.#events.onPeerJoin(message.host);
        for (const peerId of message.peers) this.#events.onPeerJoin(peerId);
        break;
      case 'join':
        this.#events.onPeerJoin(message.id);
        break;
      case 'leave':
        this.#events.onPeerLeave(message.id);
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
      case 'escaped':
        break;
    }

    // The host is the only path between clients, so pass it along.
    if (this.role === 'host' && message.t !== 'welcome') this.#relay(message, from);
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
