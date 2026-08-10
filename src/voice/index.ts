/**
 * Proximity voice chat. See docs/systems/AUDIO_VOICE.md part 2.
 *
 * One microphone, one outgoing track, one `PeerVoice` per teammate. Nothing is
 * mixed anywhere but here: every listener computes their own attenuation from
 * their own position, so there is no voice server, no mixing hop and nobody is
 * authoritative over what anyone else hears.
 *
 * Three facts drive the whole design:
 *
 *   - Players hear each other at `voice.hearingRange` (22 m); the hunter hears
 *     speech only within `enemy.json -> hearing.voiceRoomLimit` rooms. Talking is
 *     generous, and deliberately safer than sprinting.
 *   - Speaking is a noise emitter, but only above `voice.noiseThresholdDb`, so
 *     the small sounds an open mic picks up cannot give you away.
 *   - A downed player is immobile but not silent. Calling out is how they are
 *     found - and how the hunter is pulled back. That is the trade.
 *
 * Voice is never required to play: a denied microphone leaves everything else
 * working and the player still hears their team.
 */
import type { Audio } from '@/audio/index';
import type { VoiceConfig, VoiceMode } from '@/config/types';
import type { Net } from '@/net/index';
import { voiceGain } from './attenuation';
import { MicCapture } from './capture';
import { needsMicrophone, nextMode, shouldTransmit } from './modes';
import { PeerVoice } from './peerAudio';
import { Gate } from './vad';

/** What the world looks like to the local listener this frame. */
export interface VoiceView {
  /** The push-to-talk action, read by the caller so `voice/` needs no input. */
  pushToTalk: boolean;
  /** The local player's position, or null when there is no run to be in. */
  listener: { x: number; z: number } | null;
  /** Escaped or dead: on the spectator channel, not the live one. */
  spectator: boolean;
  peers: readonly { id: string; x: number; z: number; spectator: boolean }[];
}

/** Everything the UI needs. Rebuilt on demand, never held. */
export interface VoiceStatus {
  /** Voice is running: in a run, with somebody to talk to. */
  live: boolean;
  mode: VoiceMode;
  /** A real microphone is feeding the graph. */
  available: boolean;
  /** The player has muted themselves, whatever the mode says. */
  selfMuted: boolean;
  /** The gate is open right now: everyone nearby can hear you. */
  transmitting: boolean;
  /** 0..1 input level, for the meter. */
  level: number;
  /** Locale key of the last capture failure, or null. */
  errorKey: string | null;
  /** Ids of everyone currently talking, the local player included. */
  speaking: string[];
  /** Ids the local player has muted. */
  muted: string[];
  /** How loud this player is sending, 0..1. */
  selfVolume: number;
  /** Peer id -> how loud this listener has chosen to have them, 0..1. */
  volumes: Record<string, number>;
}

/** Shown when the microphone is refused or missing. Both read the same to a player. */
const ERROR_KEY = 'error.microphone';

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;

export class VoiceChat {
  readonly #config: VoiceConfig;
  readonly #audio: Audio;
  readonly #net: Net;
  readonly #capture: MicCapture;
  readonly #peers = new Map<string, PeerVoice>();
  /** Muting a teammate survives them reconnecting, so it is kept outside `#peers`. */
  readonly #muted = new Set<string>();
  /**
   * Per-teammate volume, and for the same reason kept out of `#peers`: a peer
   * whose call drops and comes back should come back at the volume you set.
   *
   * Session state, like the mutes and the mode - deliberately NOT in the save
   * profile. A peer id is a lobby code that means somebody different next week,
   * so a stored one is worse than no memory at all.
   */
  readonly #volumes = new Map<string, number>();
  #selfVolume = 1;
  readonly #activity: Gate;
  readonly #noise: Gate;

  #mode: VoiceMode;
  #selfMuted = false;
  #active = false;
  #transmitting = false;
  /** Last value of `live`, so the microphone is only opened or closed on a change. */
  #wasLive = false;

  constructor(config: VoiceConfig, audio: Audio, net: Net) {
    this.#config = config;
    this.#audio = audio;
    this.#net = net;
    this.#mode = config.enabled ? config.defaultMode : 'off';
    this.#capture = new MicCapture(audio.context, config);
    // Every peer gets the outgoing track the moment they connect, silent or not.
    // Handing it over later would mean whoever answered a call before starting
    // their run could never send anything without renegotiating it.
    net.setVoiceStream(this.#capture.stream);
    this.#activity = new Gate(config.voiceActivityThresholdDb, config.voiceActivityHangoverMs);
    // The hunter's threshold gets the same hangover, so one loud word emits for
    // as long as it is being said rather than for a single tick.
    this.#noise = new Gate(config.noiseThresholdDb, config.voiceActivityHangoverMs);
  }

  get mode(): VoiceMode {
    return this.#mode;
  }

  /**
   * Voice needs a run and somebody to talk to. A solo run never asks for the
   * microphone at all - there is nobody to hear it, and the only thing it could
   * do is hand the hunter a noise event for free.
   *
   * Recomputed rather than latched, so someone joining mid-run turns it on.
   */
  get live(): boolean {
    return this.#active && this.#config.enabled && this.#net.players.length > 0;
  }

  /**
   * True while the local player is loud enough for the hunter to have something
   * to walk towards. The caller turns this into a noise event - what players
   * hear and what the enemy perceives are separate systems (docs/systems/AI.md).
   */
  get emittingNoise(): boolean {
    return this.#config.emitsNoiseToEnemy && this.#transmitting && this.#noise.open;
  }

  get active(): boolean {
    return this.#active;
  }

  /* --- controls ------------------------------------------------------------ */

  setMode(mode: VoiceMode): void {
    if (this.#mode === mode) return;
    this.#mode = mode;
    this.#applyCapture();
  }

  /** The one-button cycle the pause menu and the design brief both ask for. */
  cycleMode(): VoiceMode {
    this.setMode(nextMode(this.#config.modes, this.#mode));
    return this.#mode;
  }

  toggleSelfMute(): void {
    this.#selfMuted = !this.#selfMuted;
    if (this.#selfMuted) this.#transmit(false);
  }

  toggleMute(id: string): void {
    if (this.#muted.has(id)) this.#muted.delete(id);
    else this.#muted.add(id);

    const peer = this.#peers.get(id);
    if (peer) peer.muted = this.#muted.has(id);
  }

  isMuted(id: string): boolean {
    return this.#muted.has(id);
  }

  /** How loud this player sends. A gain on the outgoing track, nothing more. */
  setSelfVolume(volume: number): void {
    this.#selfVolume = clamp01(volume);
    this.#capture.setSendLevel(this.#selfVolume);
  }

  /** How loud one teammate is heard, on top of the distance law. */
  setPeerVolume(id: string, volume: number): void {
    const value = clamp01(volume);
    this.#volumes.set(id, value);
    const peer = this.#peers.get(id);
    if (peer) peer.volume = value;
  }

  /* --- lifecycle ----------------------------------------------------------- */

  /**
   * The MICROPHONE follows the run - a permission prompt on the main menu is a
   * good way to get told no. The calls themselves are not touched: they live as
   * long as the peers do, so nothing has to be renegotiated at the moment a run
   * starts, which is exactly the moment nobody can afford to be inaudible.
   */
  setActive(active: boolean): void {
    if (this.#active === active) return;
    this.#active = active;

    this.#applyCapture();
    if (active) return;

    this.#audio.music.setVoiceDucking(false);
    // Out of the world, out of the attenuation: teammates go flat rather than
    // staying frozen at whatever distance the run ended on.
    for (const peer of this.#peers.values()) peer.update(0, 1, null);
  }

  /** A peer's audio track arrived. Called by `net`. */
  addPeer(id: string, stream: MediaStream): void {
    this.#peers.get(id)?.dispose();

    const peer = new PeerVoice(
      this.#audio.context,
      stream,
      this.#audio.bus('voice'),
      this.#config,
      this.#audio.spatial,
    );
    peer.muted = this.#muted.has(id);
    peer.volume = this.#volumes.get(id) ?? 1;
    this.#peers.set(id, peer);
  }

  removePeer(id: string): void {
    this.#peers.get(id)?.dispose();
    this.#peers.delete(id);
  }

  /* --- frame --------------------------------------------------------------- */

  update(dt: number, view: VoiceView): void {
    // Someone joining or leaving a solo run is what turns the microphone on and
    // off, so it is checked here rather than only at the run boundary.
    if (this.live !== this.#wasLive) this.#applyCapture();

    const db = this.#capture.sample();
    const activity = this.#activity.update(db, dt);
    this.#noise.update(db, dt);

    const wanted = this.live && !this.#selfMuted && shouldTransmit(this.#mode, activity, view.pushToTalk);
    this.#transmit(wanted);

    let loudest = 0;
    for (const [id, peer] of this.#peers) {
      const player = view.peers.find((candidate) => candidate.id === id);
      const gain = this.#gainFor(view, player);
      peer.update(dt, gain, player && !view.spectator ? player : null);
      if (peer.speaking && !peer.muted) loudest = Math.max(loudest, gain);
    }

    // The score steps back for anyone actually audible, not for anyone talking
    // somewhere across the map.
    this.#audio.music.setVoiceDucking(loudest > 0.05);
  }

  /**
   * Distance only, plus the one channel rule: live players never hear the
   * escaped and the dead (`voice.spectatorChannelSeparate`), while spectators
   * hear everybody, flat - they have no body left to hear from.
   */
  #gainFor(view: VoiceView, player: VoiceView['peers'][number] | undefined): number {
    if (view.spectator) return 1;
    // Connected but not placed in the world - a lobby, or a peer whose first
    // transform has not arrived yet. Flat is the honest answer.
    if (!player || !view.listener) return 1;
    if (player.spectator && this.#config.spectatorChannelSeparate) return 0;

    return voiceGain(Math.hypot(player.x - view.listener.x, player.z - view.listener.z), this.#config);
  }

  status(): VoiceStatus {
    const speaking: string[] = [];
    if (this.#transmitting) speaking.push(this.#net.selfId);
    for (const [id, peer] of this.#peers) if (peer.speaking) speaking.push(id);

    return {
      live: this.live,
      mode: this.#mode,
      available: this.#capture.live,
      selfMuted: this.#selfMuted,
      transmitting: this.#transmitting,
      level: this.#transmitting ? this.#capture.level : 0,
      errorKey: this.#capture.error ? ERROR_KEY : null,
      speaking,
      muted: [...this.#muted],
      selfVolume: this.#selfVolume,
      volumes: Object.fromEntries(this.#volumes),
    };
  }

  dispose(): void {
    this.setActive(false);
    this.#net.setVoiceStream(null);
    for (const peer of this.#peers.values()) peer.dispose();
    this.#peers.clear();
    this.#capture.dispose();
  }

  /* --- internals ----------------------------------------------------------- */

  #transmit(on: boolean): void {
    this.#transmitting = on;
    this.#capture.transmit(on);
  }

  /** `off` stops the microphone outright rather than merely muting it. */
  #applyCapture(): void {
    this.#wasLive = this.live;
    if (this.#wasLive && needsMicrophone(this.#mode)) void this.#capture.open();
    else this.#capture.close();

    this.#activity.close();
    this.#noise.close();
    this.#transmit(false);
  }
}
