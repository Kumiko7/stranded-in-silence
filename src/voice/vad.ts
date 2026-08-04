/**
 * Voice activity detection: is this stream making a sound worth sending?
 *
 * An `AnalyserNode` RMS in decibels, plus a gate with a hangover so a gap
 * between words does not chop the sentence in half. The same meter is used
 * three ways, at three thresholds:
 *
 *   voiceActivityThresholdDb  open the mic (open-mic mode)
 *   noiseThresholdDb          loud enough for the hunter to get a noise event
 *   speakingThresholdDb       loud enough to light the HUD icon on a received track
 *
 * That is the "small noises do not give you away" rule: breathing into an open
 * mic is below all three, talking to your team is above the first, and shouting
 * is above the second.
 */

/** Below this the analyser is reading its own noise floor, not a person. */
const SILENCE_DB = -100;

export class LevelMeter {
  readonly #analyser: AnalyserNode;
  readonly #samples: Float32Array<ArrayBuffer>;
  #db = SILENCE_DB;

  constructor(context: AudioContext, source: AudioNode) {
    this.#analyser = context.createAnalyser();
    this.#analyser.fftSize = 1024;
    // Enough smoothing that the meter reads as a voice rather than a strobe.
    this.#analyser.smoothingTimeConstant = 0.6;
    this.#samples = new Float32Array(this.#analyser.fftSize);
    source.connect(this.#analyser);
  }

  /** Reads the analyser once. Call at most once per frame. */
  sample(): number {
    this.#analyser.getFloatTimeDomainData(this.#samples);

    let sum = 0;
    for (const value of this.#samples) sum += value * value;
    const rms = Math.sqrt(sum / this.#samples.length);

    this.#db = rms > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(rms)) : SILENCE_DB;
    return this.#db;
  }

  get db(): number {
    return this.#db;
  }

  /** 0..1 for a meter widget: `floorDb` reads empty, 0 dB reads full. */
  normalised(floorDb: number): number {
    const floor = Math.min(-1, floorDb);
    return Math.max(0, Math.min(1, (this.#db - floor) / -floor));
  }

  dispose(): void {
    this.#analyser.disconnect();
  }
}

/**
 * A threshold with a tail. `open` goes true the moment the level crosses and
 * stays true for `hangoverMs` after it drops back, which is what stops a gate
 * clipping the ends of words.
 */
export class Gate {
  #openFor = 0;

  constructor(
    private readonly thresholdDb: number,
    private readonly hangoverMs: number,
  ) {}

  update(db: number, dt: number): boolean {
    if (db >= this.thresholdDb) this.#openFor = this.hangoverMs / 1000;
    else this.#openFor = Math.max(0, this.#openFor - dt);
    return this.#openFor > 0;
  }

  get open(): boolean {
    return this.#openFor > 0;
  }

  close(): void {
    this.#openFor = 0;
  }
}
