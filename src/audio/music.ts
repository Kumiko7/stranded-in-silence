/**
 * The score. Four layers that cross-fade on one intensity value, plus a room
 * ambience bed on its own bus.
 *
 *   menu      a sparse minor motif over the drone, front end only
 *   explore   the drone itself: always there while a run is live
 *   tension   an unresolved cluster that swells as the hunter takes an interest
 *   chase     a driving low ostinato once it is actually coming for you
 *
 * Intensity is `max(alert level, proximity)` - see `config/audio.json -> music`.
 * Every layer can be replaced wholesale by dropping a file in for it: the synth
 * graph is only built for layers that have no file.
 *
 * This is the one part of `src/audio/` that keeps a live Tone.js graph; sound
 * effects are rendered to buffers at boot and never touch Tone again.
 */
import * as Tone from 'tone';
import type { AudioConfig } from '@/config/types';
import { firstPresent } from './files';

export type MusicScene = 'none' | 'menu' | 'run';

/** Equal temperament, so a motif can be written in semitones off the root. */
function step(root: number, semitones: number): number {
  return root * 2 ** (semitones / 12);
}

/** A descending natural-minor phrase: A G F E, three octaves up from the root. */
const MOTIF = [36, 34, 32, 31];

export class MusicDirector {
  readonly #config: AudioConfig['music'];
  readonly #layers = new Map<string, Tone.Gain>();
  readonly #players: Tone.Player[] = [];
  readonly #sources: { start(time?: number): unknown }[] = [];
  readonly #loops: Tone.Loop[] = [];
  #started = false;
  #scene: MusicScene = 'none';
  #intensity = 0;

  constructor(music: AudioNode, ambience: AudioNode, config: AudioConfig['music']) {
    this.#config = config;
    const root = config.rootHz;

    this.#buildExplore(this.#layer('explore', music), root);
    this.#buildMenu(this.#layer('menu', music), root);
    this.#buildTension(this.#layer('tension', music), root);
    this.#buildChase(this.#layer('chase', music), root);
    this.#buildAmbience(this.#layer('ambience', ambience));

    Tone.getTransport().bpm.value = config.bpm;
  }

  /**
   * Creates a layer's gain node, and its file player if a file exists. Returns
   * null when a file took over, which tells the caller not to synthesise.
   */
  #layer(id: string, bus: AudioNode): Tone.Gain | null {
    const gain = new Tone.Gain(0).connect(bus);
    this.#layers.set(id, gain);

    const url = firstPresent(this.#config.layers[id]?.files ?? []);
    if (!url) return gain;

    this.#players.push(new Tone.Player({ url, loop: true }).connect(gain));
    return null;
  }

  /** A drone at a fixed level into a layer. Started later, with the transport. */
  #drone(layer: Tone.Gain, frequency: number, type: Tone.ToneOscillatorType, level: number, detune = 0): void {
    const gain = new Tone.Gain(level).connect(layer);
    const osc = new Tone.Oscillator(frequency, type).connect(gain);
    osc.detune.value = detune;
    this.#sources.push(osc);
  }

  #buildExplore(layer: Tone.Gain | null, root: number): void {
    if (!layer) return;

    // A slow filter sweep is what stops a drone sounding like a test tone.
    const filter = new Tone.Filter({ type: 'lowpass', frequency: 260, Q: 3 }).connect(layer);
    const sweep = new Tone.LFO({ frequency: 0.05, min: 170, max: 360 }).connect(filter.frequency);
    this.#sources.push(sweep);

    const body = new Tone.Gain(0.5).connect(filter);
    const saw = new Tone.Oscillator(root * 2, 'sawtooth').connect(body);
    const fifth = new Tone.Oscillator(root * 3, 'triangle').connect(body);
    saw.detune.value = -9;
    fifth.detune.value = 7;
    this.#sources.push(saw, fifth);

    this.#drone(layer, root, 'sine', 0.35);
  }

  #buildMenu(layer: Tone.Gain | null, root: number): void {
    if (!layer) return;

    const reverb = new Tone.Freeverb({ roomSize: 0.92, dampening: 1800, wet: 0.6 }).connect(layer);
    const synth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.06, decay: 1.4, sustain: 0.05, release: 2.4 },
      volume: -16,
    }).connect(reverb);

    let index = 0;
    this.#loops.push(
      new Tone.Loop((time) => {
        const semitones = MOTIF[index % MOTIF.length] ?? 0;
        synth.triggerAttackRelease(step(root, semitones), '2n', time);
        index++;
      }, '1m'),
    );
  }

  #buildTension(layer: Tone.Gain | null, root: number): void {
    if (!layer) return;

    const filter = new Tone.Filter({ type: 'lowpass', frequency: 900, Q: 2 }).connect(layer);
    const cluster = new Tone.Gain(0.32).connect(filter);
    // A minor second and a tritone: neither of them ever resolves.
    for (const [semitones, detune] of [[24, 0], [25, -6], [30, 8]] as const) {
      const osc = new Tone.Oscillator(step(root, semitones), 'sawtooth').connect(cluster);
      osc.detune.value = detune;
      this.#sources.push(osc);
    }

    // Something in the room breathing, in and out, every six seconds.
    const breathGain = new Tone.Gain(0).connect(layer);
    const breathFilter = new Tone.Filter({ type: 'bandpass', frequency: 820, Q: 3 }).connect(breathGain);
    const breath = new Tone.Noise('pink').connect(breathFilter);
    const swell = new Tone.LFO({ frequency: 0.17, min: 0, max: 0.22 }).connect(breathGain.gain);
    this.#sources.push(breath, swell);
  }

  #buildChase(layer: Tone.Gain | null, root: number): void {
    if (!layer) return;

    const filter = new Tone.Filter({ type: 'lowpass', frequency: 720, Q: 4 }).connect(layer);
    const bass = new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.004, decay: 0.14, sustain: 0, release: 0.05 },
      volume: -6,
    }).connect(filter);

    // Eighths on the root, with the flattened second leaning in every fourth
    // beat - the pulse is the point, the wrong note is the panic.
    let beat = 0;
    this.#loops.push(
      new Tone.Loop((time) => {
        const semitones = beat % 8 === 7 ? 13 : beat % 4 === 2 ? 12 : 0;
        bass.triggerAttackRelease(step(root * 2, semitones), '16n', time);
        beat++;
      }, '8n'),
    );

    const stabs = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.01, decay: 0.5, sustain: 0, release: 0.3 },
      volume: -20,
    }).connect(new Tone.Filter({ type: 'highpass', frequency: 400 }).connect(layer));

    this.#loops.push(
      new Tone.Loop((time) => {
        stabs.triggerAttackRelease([step(root, 36), step(root, 42)], '4n', time);
      }, '2m'),
    );
  }

  #buildAmbience(layer: Tone.Gain | null): void {
    if (!layer) return;

    const filter = new Tone.Filter({ type: 'lowpass', frequency: 600, Q: 1 }).connect(layer);
    const source = new Tone.Noise('pink').connect(filter);
    const drift = new Tone.LFO({ frequency: 0.031, min: 320, max: 900 }).connect(filter.frequency);
    this.#sources.push(source, drift);
  }

  /** Called once the context is unlocked - nothing can run before a gesture. */
  begin(): void {
    if (this.#started) return;
    this.#started = true;

    for (const source of this.#sources) source.start();
    for (const loop of this.#loops) loop.start(0);
    Tone.getTransport().start();

    for (const player of this.#players) {
      if (player.loaded) player.start();
      else player.buffer.onload = () => player.start();
    }
    this.#apply();
  }

  setScene(scene: MusicScene): void {
    if (this.#scene === scene) return;
    this.#scene = scene;
    if (scene !== 'run') this.#intensity = 0;
    this.#apply();
  }

  /** 0 = nothing is wrong, 1 = it is behind you. */
  setIntensity(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    if (Math.abs(clamped - this.#intensity) < 0.02) return;
    this.#intensity = clamped;
    if (this.#scene === 'run') this.#apply();
  }

  /** Where each alert level sits, before proximity is taken into account. */
  intensityForAlert(alert: string): number {
    return this.#config.intensityByAlert[alert] ?? 0;
  }

  get proximityWeight(): number {
    return this.#config.proximityWeight;
  }

  #apply(): void {
    if (!this.#started) return;

    const intensity = this.#intensity;
    const threshold = this.#config.chaseLayerThreshold;
    const chase = Math.max(0, (intensity - threshold) / Math.max(0.01, 1 - threshold));

    const targets =
      this.#scene === 'menu'
        ? { menu: 1, explore: 0.7, tension: 0, chase: 0, ambience: 0 }
        : this.#scene === 'run'
          // The drone thins out as the other layers arrive, rather than stacking.
          ? { menu: 0, explore: 1 - intensity * 0.4, tension: intensity, chase, ambience: 1 }
          : { menu: 0, explore: 0, tension: 0, chase: 0, ambience: 0 };

    for (const [id, amount] of Object.entries(targets)) {
      const layer = this.#layers.get(id);
      if (!layer) continue;
      const volume = this.#config.layers[id]?.volume ?? 1;
      layer.gain.rampTo(amount * volume, this.#config.crossfadeSeconds);
    }
  }
}
