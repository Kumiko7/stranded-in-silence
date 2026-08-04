/**
 * The microphone, and the one outgoing track everybody else receives.
 *
 * The graph is deliberately fixed for the whole session:
 *
 *   getUserMedia -> source -> [meter] -> gate (GainNode) -> MediaStreamDestination
 *
 * The peer connections are negotiated once against that destination's track and
 * never renegotiated. Muting, push-to-talk and voice activity are all just the
 * gate's gain, which costs nothing and cannot desync a call. Switching the mode
 * to `off` goes further and stops the getUserMedia track outright - the browser's
 * recording indicator should go out when a player says the mic is off, not merely
 * go quiet (docs/systems/AUDIO_VOICE.md -> Failure handling).
 *
 * Because the destination exists before the mic does, a player who denies
 * permission still has a valid (silent) track to send, so calls connect and they
 * can hear everyone. Voice is never required to play.
 */
import type { VoiceConfig } from '@/config/types';
import { LevelMeter } from './vad';

export type CaptureError = 'denied' | 'unavailable' | null;

export class MicCapture {
  readonly #context: AudioContext;
  readonly #config: VoiceConfig;
  readonly #destination: MediaStreamAudioDestinationNode;
  readonly #gate: GainNode;

  #media: MediaStream | null = null;
  #source: MediaStreamAudioSourceNode | null = null;
  #meter: LevelMeter | null = null;
  #opening: Promise<void> | null = null;
  #error: CaptureError = null;

  constructor(context: AudioContext, config: VoiceConfig) {
    this.#context = context;
    this.#config = config;
    this.#destination = context.createMediaStreamDestination();
    this.#gate = context.createGain();
    this.#gate.gain.value = 0;
    this.#gate.connect(this.#destination);
  }

  /** The track sent to every peer. Silent, never absent. */
  get stream(): MediaStream {
    return this.#destination.stream;
  }

  /** True once a real microphone is feeding the graph. */
  get live(): boolean {
    return this.#media !== null;
  }

  get error(): CaptureError {
    return this.#error;
  }

  /**
   * Asks for the microphone. Idempotent and safe to call every frame - a second
   * call while the permission prompt is up joins the first.
   */
  open(): Promise<void> {
    if (this.#media || this.#opening) return this.#opening ?? Promise.resolve();

    const { echoCancellation, noiseSuppression, autoGainControl } = this.#config;
    this.#opening = navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation, noiseSuppression, autoGainControl }, video: false })
      .then((media) => {
        this.#media = media;
        this.#source = this.#context.createMediaStreamSource(media);
        this.#source.connect(this.#gate);
        this.#meter = new LevelMeter(this.#context, this.#source);
        this.#error = null;
      })
      .catch((error: unknown) => {
        // A refusal is not a crash: the game plays fine without a microphone.
        this.#error = error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'unavailable';
        console.warn('[voice] microphone unavailable', error);
      })
      .finally(() => {
        this.#opening = null;
      });

    return this.#opening;
  }

  /** Drops the microphone entirely. The outgoing track stays, and goes silent. */
  close(): void {
    this.#gate.gain.value = 0;
    this.#meter?.dispose();
    this.#meter = null;
    this.#source?.disconnect();
    this.#source = null;
    for (const track of this.#media?.getTracks() ?? []) track.stop();
    this.#media = null;
  }

  /** Reads the input level. Returns silence when there is no microphone. */
  sample(): number {
    return this.#meter?.sample() ?? -100;
  }

  get db(): number {
    return this.#meter?.db ?? -100;
  }

  /** 0..1 for the HUD meter, scaled off the open-mic threshold. */
  get level(): number {
    // The gate threshold reads as roughly a third of the meter, so a voice that
    // is opening the mic looks like it is opening the mic.
    return this.#meter?.normalised(this.#config.voiceActivityThresholdDb * 1.6) ?? 0;
  }

  /** Opens or closes the gate, ramped so it does not click. */
  transmit(on: boolean): void {
    const target = on && this.#media ? 1 : 0;
    if (Math.abs(this.#gate.gain.value - target) < 0.001) return;
    this.#gate.gain.setTargetAtTime(target, this.#context.currentTime, this.#config.gainSmoothingSeconds);
  }

  dispose(): void {
    this.close();
    this.#gate.disconnect();
  }
}
