/**
 * The audio facade. Logic never names a file, a node or an oscillator - it calls
 * `play('door.open', { at: doorPosition })` and this resolves the rest through
 * `config/audio.json`.
 *
 * Sound effects are rendered to buffers once at boot (Tone.js recipes, or a
 * composer's files where they exist) and played back as plain buffer sources
 * through a `PannerNode`. The music is the one live Tone.js graph. See
 * docs/systems/AUDIO_VOICE.md.
 *
 * Nothing here is audible until `unlock()` runs on a user gesture - browsers
 * start every `AudioContext` suspended, and `init()` is safe to call long before.
 */
import * as Tone from 'tone';
import type { AudioConfig } from '@/config/types';
import { BusGraph } from './buses';
import { SoundLibrary } from './library';
import { MusicDirector } from './music';
import { createPanner, placeListener, placePanner } from './panner';
import { Voice } from './voices';

/** A world position makes a sound positional, unless the registry forbids it. */
export interface PlayOptions {
  at?: { x: number; y?: number; z: number };
  /** Extra multiplier over the registry volume, for intensity-driven one-shots. */
  gain?: number;
}

export interface SustainState {
  on: boolean;
  at?: { x: number; y?: number; z: number };
  /** 0..1 over the registry volume. */
  level?: number;
  /** Playback rate, which is how the heartbeat speeds up. */
  rate?: number;
}

interface Sustained {
  soundId: string;
  voice: Voice | null;
}

/** Sound sources default to ear height rather than the floor. */
const DEFAULT_HEIGHT = 1.4;

export class Audio {
  readonly #config: AudioConfig;
  readonly #context: AudioContext;
  readonly #buses: BusGraph;
  readonly #library = new SoundLibrary();
  readonly #music: MusicDirector;
  readonly #sustains = new Map<string, Sustained>();
  readonly #lastPlayed = new Map<string, number>();
  readonly #unknown = new Set<string>();
  #loading: Promise<void> | null = null;
  #loaded = false;
  #unlocking = false;
  #unlocked = false;

  constructor(config: AudioConfig) {
    this.#config = config;
    this.#context = Tone.getContext().rawContext as unknown as AudioContext;
    this.#buses = new BusGraph(this.#context, config.buses);
    this.#music = new MusicDirector(this.#buses.node('music'), this.#buses.node('ambience'), config.music);
  }

  get music(): MusicDirector {
    return this.#music;
  }

  /**
   * The one `AudioContext` in the app, and the bus to hand a stream to. Voice
   * chat attaches its peer audio here rather than opening a second context, so
   * one master slider governs everything the player hears.
   */
  get context(): AudioContext {
    return this.#context;
  }

  bus(id: string): AudioNode {
    return this.#buses.node(id);
  }

  /** Renders every recipe and decodes every file present. Safe before a gesture. */
  init(): Promise<void> {
    this.#loading ??= this.#library.load(this.#context, this.#config.sounds).then(() => {
      this.#loaded = true;
    });
    return this.#loading;
  }

  /**
   * Call from a real user gesture. Idempotent.
   *
   * Loading has to finish first: rendering a recipe swaps Tone's global context
   * for an offline one, and resuming *that* by starting in the middle of a
   * render leaves the render unable to complete. A player who hits Play in the
   * first half-second would otherwise get a game with no sound at all.
   */
  async unlock(): Promise<void> {
    if (this.#unlocked || this.#unlocking) return;
    this.#unlocking = true;
    try {
      await this.init();
      await Tone.start();
      this.#unlocked = true;
      this.#music.begin();
    } catch (error) {
      // A refused resume must not mute the game for good: the next gesture tries again.
      console.warn('[audio] could not start', error);
    } finally {
      this.#unlocking = false;
    }
  }

  get ready(): boolean {
    return this.#loaded && this.#unlocked;
  }

  play(soundId: string, options: PlayOptions = {}): void {
    if (!this.ready || !soundId) return;

    const def = this.#config.sounds[soundId];
    if (!def) {
      if (!this.#unknown.has(soundId)) {
        this.#unknown.add(soundId);
        console.warn(`[audio] no registry entry for "${soundId}"`);
      }
      return;
    }

    const now = this.#context.currentTime;
    if (def.cooldownSeconds && now - (this.#lastPlayed.get(soundId) ?? -Infinity) < def.cooldownSeconds) return;

    const buffer = this.#library.buffer(soundId);
    if (!buffer) return;
    this.#lastPlayed.set(soundId, now);

    const source = this.#context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch(def.pitchRange);

    const gain = this.#context.createGain();
    gain.gain.value = def.volume * (options.gain ?? 1);
    source.connect(gain);

    const panner = options.at && def.spatial !== false ? createPanner(this.#context, this.#config.spatial) : null;
    if (panner && options.at) {
      placePanner(panner, options.at.x, options.at.y ?? DEFAULT_HEIGHT, options.at.z);
      gain.connect(panner);
      panner.connect(this.#buses.node(def.bus));
    } else {
      gain.connect(this.#buses.node(def.bus));
    }

    source.onended = (): void => {
      source.disconnect();
      gain.disconnect();
      panner?.disconnect();
    };
    source.start();
  }

  /**
   * A named looping voice the caller drives per frame. Passing a different
   * `soundId` for the same key swaps the sound; `on: false` fades it out.
   */
  sustain(key: string, soundId: string | null, state: SustainState): void {
    // Only a genuine swap costs a rebuild; silencing a key keeps its voice, so
    // a hold that is started and abandoned repeatedly does not churn nodes.
    const existing = this.#sustains.get(key);
    if (existing && soundId !== null && existing.soundId !== soundId) {
      existing.voice?.dispose();
      this.#sustains.delete(key);
    }

    if (!soundId || !state.on) {
      this.#sustains.get(key)?.voice?.stop();
      return;
    }
    if (!this.ready) return;

    let entry = this.#sustains.get(key);
    if (!entry) {
      entry = { soundId, voice: this.#createVoice(soundId) };
      this.#sustains.set(key, entry);
    }

    const voice = entry.voice;
    if (!voice) return;

    voice.level(state.level ?? 1);
    if (state.rate !== undefined) voice.rate(state.rate);
    if (state.at) voice.position(state.at.x, state.at.y ?? DEFAULT_HEIGHT, state.at.z);
    voice.start();
  }

  #createVoice(soundId: string): Voice | null {
    const def = this.#config.sounds[soundId];
    const buffer = def ? this.#library.buffer(soundId) : null;
    if (!def || !buffer) return null;
    return new Voice(
      this.#context,
      buffer,
      this.#buses.node(def.bus),
      def.volume,
      def.spatial === false ? null : this.#config.spatial,
    );
  }

  /** Everything looping stops. Called when a run ends, however it ends. */
  stopSustains(): void {
    for (const entry of this.#sustains.values()) entry.voice?.stop();
  }

  /** Where the ears are, in world space. Driven from the camera every frame. */
  setListener(
    position: { x: number; y: number; z: number },
    forward: { x: number; y: number; z: number },
    up: { x: number; y: number; z: number },
  ): void {
    placeListener(this.#context.listener, position, forward, up);
  }

  /** For the options menu in step 35; bus ids come from `audio.json -> buses`. */
  setBusVolume(bus: string, volume: number): void {
    this.#buses.setVolume(bus, volume);
  }
}

function pitch(range: [number, number] | undefined): number {
  if (!range) return 1;
  const [low, high] = range;
  return low + (high - low) * Math.random();
}
