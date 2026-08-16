/**
 * Snapshot interpolation for everything this browser does not simulate: remote
 * players, remote bodies in the cabin, and on a client the hunter.
 *
 * Transforms are sent at `simulation.snapshotRateHz` (15 Hz, one every ~67 ms)
 * and drawn every frame, so something has to fill the gaps. Chasing the latest
 * packet with a lerp makes a body speed up and slow down between packets and
 * stutter whenever one is late.
 *
 * So playback runs in the past, which keeps a sample on each side of the
 * playback head to interpolate BETWEEN. Two things make that work under a
 * connection that is not ideal, and both live next door in `timing.ts`:
 *
 *  - Samples are placed on the SENDER's timeline, not stamped with when they
 *    arrived. Arrival times carry the connection's jitter; send times do not.
 *  - The depth of the buffer is measured rather than assumed. A link with 4 ms
 *    of jitter gets a 50 ms buffer and stays responsive; the same code on a
 *    link with 120 ms of jitter grows one deep enough to cover it.
 *
 * When nothing new has arrived - a hiccup, or a peer that stopped sending - the
 * last known velocity carries the body for at most `maxExtrapolationMs` and
 * then it stands still, because a body that keeps gliding through a wall is
 * worse than one that waits.
 *
 * Presentation only: the simulation reads the latest received transform
 * directly. This decides where a body is DRAWN, never where it is.
 */
import type { PeerClock } from '@/net/timing';

/** One replicated transform, placed on this machine's timeline. */
export interface TransformSample {
  time: number;
  x: number;
  z: number;
  yaw: number;
  /**
   * Where they are looking vertically. Nothing but a spectator's camera reads
   * it - a body is drawn from `yaw` alone - which is why it is clamped well
   * inside a half turn and can be blended straight rather than the long way
   * round like `yaw`.
   */
  pitch: number;
  /** Eye height for a player. The hunter has one height and passes 0. */
  height: number;
}

export type Transform = Omit<TransformSample, 'time'>;

/**
 * Enough to bracket the playback head at the deepest buffer the config allows:
 * 450 ms of delay at 15 Hz is seven samples, and a burst arriving together has
 * to fit alongside them.
 */
const MAX_SAMPLES = 24;

/**
 * A body's recent history, played back late. One per remote player and one per
 * hunter; the clock is shared with whoever else comes from the same machine.
 */
export class TransformBuffer {
  #samples: TransformSample[] = [];
  readonly #clock: PeerClock;
  readonly #maxExtrapolation: number;
  #out: Transform = { x: 0, z: 0, yaw: 0, pitch: 0, height: 0 };

  constructor(clock: PeerClock, maxExtrapolationMs: number) {
    this.#clock = clock;
    this.#maxExtrapolation = maxExtrapolationMs / 1000;
  }

  /** Drops the history and puts the body at one known place, e.g. on spawn. */
  reset(transform: Transform, now: number): void {
    this.#samples = [{ time: now, ...transform }];
    this.#out = { ...transform };
  }

  /**
   * A transform arrived. `at` is already on this machine's timeline - the
   * caller has run it through the sender's clock, which is the whole point.
   *
   * Out-of-order arrivals are inserted rather than dropped: the `state` channel
   * is unordered by design, so a pair that swapped places in flight is routine,
   * and putting them back in order costs one comparison against a list that is
   * almost always already sorted.
   */
  push(transform: Transform, at: number): void {
    const sample: TransformSample = { time: at, ...transform };
    const samples = this.#samples;
    const last = samples[samples.length - 1];

    if (!last || at > last.time) {
      samples.push(sample);
    } else {
      // Walk back to the insertion point. Same instant twice is the second one
      // winning; anything older finds its place. Neither happens often enough
      // to be worth more than a linear scan of a list that is almost always
      // already in order.
      let i = samples.length;
      while (i > 0 && samples[i - 1]!.time > at) i--;
      if (i > 0 && samples[i - 1]!.time === at) samples[i - 1] = sample;
      else samples.splice(i, 0, sample);
    }

    if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
  }

  get empty(): boolean {
    return this.#samples.length === 0;
  }

  /** Where the body should be drawn at `now`. The returned object is reused. */
  sample(now: number): Transform {
    const samples = this.#samples;
    const newest = samples[samples.length - 1];
    if (!newest) return this.#out;

    const at = now - this.#clock.delay;

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
    this.#out.pitch = a.pitch + (b.pitch - a.pitch) * t;
    return this.#out;
  }

  #write(sample: TransformSample): Transform {
    this.#out.x = sample.x;
    this.#out.z = sample.z;
    this.#out.yaw = sample.yaw;
    this.#out.pitch = sample.pitch;
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
