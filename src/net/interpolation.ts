/**
 * Snapshot interpolation for everything this browser does not simulate: remote
 * players and, on a client, the hunter.
 *
 * Transforms arrive at `simulation.snapshotRateHz` (15 Hz, one every ~67 ms) and
 * are drawn every frame, so something has to fill the gaps. Chasing the latest
 * packet with a lerp - which is what this replaces - makes a remote body speed
 * up and slow down between packets and stutter whenever one is late.
 *
 * Instead every sample is stamped as it arrives and playback runs
 * `simulation.interpolationDelayMs` in the past, which keeps a sample on each
 * side of the playback head to interpolate BETWEEN. When nothing new has
 * arrived - a hiccup, or a peer that stopped sending - the last known velocity
 * carries the body for at most `maxExtrapolationMs` and then it stands still,
 * because a body that keeps gliding through a wall is worse than one that waits.
 *
 * Presentation only: the simulation reads the latest received transform
 * directly. This decides where a body is DRAWN, never where it is.
 */

/** One replicated transform, stamped with the local time it arrived. */
export interface TransformSample {
  time: number;
  x: number;
  z: number;
  yaw: number;
  /** Eye height for a player. The hunter has one height and passes 0. */
  height: number;
}

export type Transform = Omit<TransformSample, 'time'>;

export interface InterpolationConfig {
  interpolationDelayMs: number;
  maxExtrapolationMs: number;
}

/** Kept just long enough to always bracket the playback head. */
const MAX_SAMPLES = 12;

export class TransformBuffer {
  #samples: TransformSample[] = [];
  #delay: number;
  #maxExtrapolation: number;
  #out: Transform = { x: 0, z: 0, yaw: 0, height: 0 };

  constructor(config: InterpolationConfig) {
    this.#delay = config.interpolationDelayMs / 1000;
    this.#maxExtrapolation = config.maxExtrapolationMs / 1000;
  }

  /** Drops the history and puts the body at one known place, e.g. on spawn. */
  reset(transform: Transform, now: number): void {
    this.#samples = [{ time: now, ...transform }];
    this.#out = { ...transform };
  }

  push(transform: Transform, now: number): void {
    const last = this.#samples[this.#samples.length - 1];
    // Out-of-order arrivals are dropped rather than sorted in: on an ordered
    // channel there are none, and on an unordered one the newer sample already
    // says everything the older one would have.
    if (last && now <= last.time) return;

    this.#samples.push({ time: now, ...transform });
    if (this.#samples.length > MAX_SAMPLES) this.#samples.shift();
  }

  get empty(): boolean {
    return this.#samples.length === 0;
  }

  /** Where the body should be drawn at `now`. The returned object is reused. */
  sample(now: number): Transform {
    const samples = this.#samples;
    const newest = samples[samples.length - 1];
    if (!newest) return this.#out;

    const at = now - this.#delay;

    // Behind the whole buffer: a body that has just appeared, or one whose
    // owner has gone quiet for longer than the buffer is long.
    const oldest = samples[0]!;
    if (at <= oldest.time) return this.#write(oldest);

    for (let i = samples.length - 1; i > 0; i--) {
      const b = samples[i]!;
      const a = samples[i - 1]!;
      if (at < a.time || at > b.time) continue;
      const span = b.time - a.time;
      return this.#blend(a, b, span > 0 ? (at - a.time) / span : 1);
    }

    // Past the newest sample: carry on at the speed it was going, briefly.
    const previous = samples[samples.length - 2];
    const ahead = Math.min(at - newest.time, this.#maxExtrapolation);
    if (!previous || ahead <= 0) return this.#write(newest);

    const span = newest.time - previous.time;
    if (span <= 0) return this.#write(newest);

    const t = 1 + ahead / span;
    return this.#blend(previous, newest, t);
  }

  #blend(a: TransformSample, b: TransformSample, t: number): Transform {
    this.#out.x = a.x + (b.x - a.x) * t;
    this.#out.z = a.z + (b.z - a.z) * t;
    this.#out.height = a.height + (b.height - a.height) * t;
    this.#out.yaw = a.yaw + shortestAngle(a.yaw, b.yaw) * t;
    return this.#out;
  }

  #write(sample: TransformSample): Transform {
    this.#out.x = sample.x;
    this.#out.z = sample.z;
    this.#out.yaw = sample.yaw;
    this.#out.height = sample.height;
    return this.#out;
  }
}

/** Signed shortest way round from `from` to `to`. */
export function shortestAngle(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}
