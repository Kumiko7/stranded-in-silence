/**
 * One remote player's voice: their track, placed in the world.
 *
 *   remote stream -> source -> [meter] -> panner (direction only) -> gain -> voice bus
 *
 * The panner does the *direction* - it is the same HRTF model the rest of the
 * game's positional audio uses, so a teammate behind you sounds behind you - and
 * its rolloff is switched off so the *distance* law is entirely ours, from
 * `net.json -> voice` (see `attenuation.ts`). Two attenuations stacked would make
 * `hearingRange` a lie.
 *
 * The meter sits BEFORE the gain, so the speaking indicator tells you who is
 * talking even when they are too far away to hear or you have muted them.
 */
import type { AudioConfig, VoiceConfig } from '@/config/types';
import { createPanner, placePanner } from '@/audio/panner';
import { Gate, LevelMeter } from './vad';

/** Voices come from head height, like every other sound in the game. */
const VOICE_HEIGHT = 1.5;

export class PeerVoice {
  readonly #context: AudioContext;
  readonly #config: VoiceConfig;
  readonly #source: MediaStreamAudioSourceNode;
  readonly #meter: LevelMeter;
  readonly #gate: Gate;
  readonly #panner: PannerNode;
  readonly #gain: GainNode;
  /**
   * Chrome will not pull audio through a `MediaStreamAudioSourceNode` unless the
   * stream is also attached to a media element. It is muted and never heard - the
   * Web Audio graph is what you actually listen to.
   */
  readonly #sink: HTMLAudioElement;

  muted = false;

  constructor(context: AudioContext, stream: MediaStream, destination: AudioNode, config: VoiceConfig, spatial: AudioConfig['spatial']) {
    this.#context = context;
    this.#config = config;

    this.#source = context.createMediaStreamSource(stream);
    this.#meter = new LevelMeter(context, this.#source);
    this.#gate = new Gate(config.speakingThresholdDb, config.speakingHoldMs);

    this.#panner = createPanner(context, spatial);
    this.#panner.rolloffFactor = 0;

    this.#gain = context.createGain();
    this.#gain.gain.value = 0;

    this.#source.connect(this.#panner);
    this.#panner.connect(this.#gain);
    this.#gain.connect(destination);

    this.#sink = new window.Audio();
    this.#sink.srcObject = stream;
    this.#sink.muted = true;
    void this.#sink.play().catch(() => {
      // Autoplay refusal is harmless here: the element is only a pump, and the
      // next user gesture resumes the context that actually makes the sound.
    });
  }

  /** True while they are actually saying something, hangover included. */
  get speaking(): boolean {
    return this.#gate.open;
  }

  /**
   * `gain` is the attenuation for this frame; `at` is where they are, or null
   * when there is no run and voice should simply be flat.
   */
  update(dt: number, gain: number, at: { x: number; z: number } | null): void {
    this.#gate.update(this.#meter.sample(), dt);

    if (at) placePanner(this.#panner, at.x, VOICE_HEIGHT, at.z);
    const target = this.muted ? 0 : Math.max(0, gain);
    this.#gain.gain.setTargetAtTime(target, this.#context.currentTime, this.#config.gainSmoothingSeconds);
  }

  dispose(): void {
    this.#sink.pause();
    this.#sink.srcObject = null;
    this.#meter.dispose();
    this.#source.disconnect();
    this.#panner.disconnect();
    this.#gain.disconnect();
  }
}
