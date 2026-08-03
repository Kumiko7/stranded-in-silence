/**
 * A sustained, looping sound the caller keeps a handle on: the heartbeat, the
 * hunter's drone, a chest being forced, the exit charging.
 *
 * One-shots are fire-and-forget (`Audio.play`); these have a lifetime, a moving
 * position and an intensity that logic drives per frame.
 */
import { createPanner, placePanner } from './panner';
import type { AudioConfig } from '@/config/types';

const FADE_SECONDS = 0.12;

export class Voice {
  readonly #context: AudioContext;
  readonly #buffer: AudioBuffer;
  readonly #gain: GainNode;
  readonly #panner: PannerNode | null;
  #source: AudioBufferSourceNode | null = null;
  #level = 1;
  #rate = 1;
  #volume: number;

  constructor(
    context: AudioContext,
    buffer: AudioBuffer,
    destination: AudioNode,
    volume: number,
    spatial: AudioConfig['spatial'] | null,
  ) {
    this.#context = context;
    this.#buffer = buffer;
    this.#volume = volume;

    this.#gain = context.createGain();
    this.#gain.gain.value = 0;

    if (spatial) {
      this.#panner = createPanner(context, spatial);
      this.#gain.connect(this.#panner);
      this.#panner.connect(destination);
    } else {
      this.#panner = null;
      this.#gain.connect(destination);
    }
  }

  get playing(): boolean {
    return this.#source !== null;
  }

  start(): void {
    if (this.#source) return;
    const source = this.#context.createBufferSource();
    source.buffer = this.#buffer;
    source.loop = true;
    source.playbackRate.value = this.#rate;
    source.connect(this.#gain);
    source.start();
    this.#source = source;
    this.#ramp(this.#level * this.#volume);
  }

  stop(): void {
    const source = this.#source;
    if (!source) return;
    this.#source = null;
    this.#ramp(0);
    // Let the fade finish before the node goes, or stopping clicks.
    setTimeout(() => {
      source.stop();
      source.disconnect();
    }, FADE_SECONDS * 1000 + 40);
  }

  /** 0..1 multiplier over the registry volume. */
  level(value: number): void {
    this.#level = Math.max(0, value);
    if (this.#source) this.#ramp(this.#level * this.#volume);
  }

  rate(value: number): void {
    this.#rate = Math.max(0.01, value);
    this.#source?.playbackRate.setTargetAtTime(this.#rate, this.#context.currentTime, 0.05);
  }

  position(x: number, y: number, z: number): void {
    if (this.#panner) placePanner(this.#panner, x, y, z);
  }

  #ramp(target: number): void {
    const now = this.#context.currentTime;
    this.#gain.gain.cancelScheduledValues(now);
    this.#gain.gain.setValueAtTime(this.#gain.gain.value, now);
    this.#gain.gain.linearRampToValueAtTime(target, now + FADE_SECONDS);
  }

  dispose(): void {
    this.stop();
    this.#gain.disconnect();
    this.#panner?.disconnect();
  }
}
