/**
 * What time it is on somebody else's machine, and how reliably their packets
 * are reaching this one.
 *
 * This exists because of one mistake that is very easy to make and very hard to
 * see afterwards: stamping a received transform with the time it ARRIVED. Two
 * snapshots sent 67 ms apart can arrive 4 ms apart on choppy wifi and then 130 ms
 * apart, and a buffer that interpolates between arrival times replays exactly
 * that - the body crosses the gap in 4 ms, stops for 130, and crosses the next
 * one in 4. The jitter of the connection becomes the motion of the body.
 *
 * The sender already knows when it sent each one, so it says so. All the
 * receiver needs is the OFFSET between the two clocks, and it can put every
 * sample back where it belongs on a timeline of its own:
 *
 *     localTimeOfSample = senderStamp + offset
 *
 * The offset cannot be measured directly - every packet's transit time is mixed
 * into it - but the fastest packet in a window is the one that spent the least
 * time in a queue, so `min(arrival - stamp)` over a window is the closest thing
 * to it, and everything else is that packet's transit above the floor. That
 * spread is the jitter, and the jitter is what the playback buffer has to cover.
 *
 * One clock per peer. Every hunter shares the host's, because they all come out
 * of one machine on one send.
 *
 * Nothing in here is simulation: it decides when a body is DRAWN, never where
 * it is.
 */
import type { InterpolationConfig } from '@/config/types';

/** How a link is doing, in the three states anything above this cares about. */
export type LinkHealth = 'good' | 'unstable' | 'lost';

export interface LinkQuality {
  health: LinkHealth;
  /** Round trip in milliseconds, smoothed. `null` until a pong comes back. */
  rttMs: number | null;
  /** Spread of arrival times around the fastest one, in milliseconds. */
  jitterMs: number;
  /** Share of the last window's sequence numbers that never turned up, 0..1. */
  loss: number;
  /** How far in the past this peer's body is being drawn, in milliseconds. */
  delayMs: number;
}

/** Sequence gaps are judged over a window rather than for ever. */
const LOSS_WINDOW = 64;

/**
 * The clock of one peer as seen from this machine, plus what the trip between
 * them costs. Fed by every stamped message that arrives from them.
 */
export class PeerClock {
  readonly #config: InterpolationConfig;

  /* --- the offset ----------------------------------------------------------- */
  /**
   * `localSeconds - senderSeconds` for the fastest packet in the window. Null
   * until the first stamped message lands.
   */
  #offset: number | null = null;
  /** When the winning sample was taken, so a stale floor can be retired. */
  #offsetAt = 0;
  /** The best offset seen since the window last turned over. */
  #candidate: number | null = null;
  #candidateAt = 0;

  /* --- jitter --------------------------------------------------------------- */
  /** Smoothed |transit - floor|, in seconds. RFC 3550's estimator, near enough. */
  #jitter = 0;
  /** The buffer depth this link is actually being played back with, in seconds. */
  #delay: number;

  /* --- loss ----------------------------------------------------------------- */
  #highestSeq = -1;
  #received = 0;
  #expected = 0;
  #loss = 0;

  /* --- round trip ----------------------------------------------------------- */
  #rtt: number | null = null;
  readonly #rttWeight: number;

  constructor(config: InterpolationConfig, rttSamples: number) {
    this.#config = config;
    this.#delay = config.baseDelayMs / 1000;
    // A plain exponential average over roughly `rttSamples` measurements. The
    // heartbeat is slow, so this is the difference between a number that means
    // something and one that jumps with every packet.
    this.#rttWeight = 2 / (Math.max(1, rttSamples) + 1);
  }

  /**
   * A stamped message arrived. Returns the time on THIS machine's clock that
   * the sample should be played back at, or `null` while no offset has been
   * established - which only ever means the very first message.
   */
  accept(senderSeconds: number, localSeconds: number): number | null {
    const transit = localSeconds - senderSeconds;

    // The fastest packet in the window is the one that queued the least, so it
    // is the best available reading of the offset. Anything faster than the
    // current floor replaces it outright; the window is what lets the floor
    // rise again when the two clocks drift apart, which they will.
    if (this.#offset === null || transit < this.#offset) {
      this.#offset = transit;
      this.#offsetAt = localSeconds;
      this.#candidate = transit;
      this.#candidateAt = localSeconds;
    } else {
      if (this.#candidate === null || transit < this.#candidate) {
        this.#candidate = transit;
        this.#candidateAt = localSeconds;
      }
      // The floor has stood unbeaten for a whole window: it is drift, not a
      // fast packet, so take the best of the window just gone and start again.
      if (localSeconds - this.#offsetAt > this.#config.clockWindowSeconds) {
        this.#offset = this.#candidate;
        this.#offsetAt = this.#candidateAt;
        this.#candidate = null;
      }

      // Everything above the floor is this packet's queueing delay. Smoothing
      // it the way RTP does gives a number that reacts inside a second but is
      // not moved by one unlucky arrival.
      this.#jitter += (Math.abs(transit - this.#offset) - this.#jitter) / 16;
    }

    return senderSeconds + this.#offset;
  }

  /**
   * Grows or shrinks the playback buffer towards what this link needs. Called
   * once a tick with real elapsed time, so the two time constants mean seconds
   * rather than frames - a machine drawing 30 of them must not adapt at half
   * the speed of one drawing 60.
   */
  tick(dt: number): void {
    const { baseDelayMs, minDelayMs, maxDelayMs, jitterMultiplier, growSeconds, shrinkSeconds } = this.#config;

    const wanted = Math.min(
      maxDelayMs / 1000,
      Math.max(minDelayMs / 1000, baseDelayMs / 1000 + this.#jitter * jitterMultiplier),
    );

    // Up fast, down slow. Coming up late is a body that has already stuttered;
    // going down early is a body that is about to. Both are exponential rather
    // than linear so the delay never steps, because a step in the delay is a
    // step in where the body is drawn - which is the very thing being fixed.
    const seconds = wanted > this.#delay ? growSeconds : shrinkSeconds;
    this.#delay += (wanted - this.#delay) * Math.min(1, dt / Math.max(0.001, seconds));
  }

  /**
   * Counts a sequence number towards the loss figure. Returns false if this
   * message is older than one already applied, which on an unordered channel is
   * a routine event and not a problem: the newer sample already says everything
   * the older one would have.
   */
  countSequence(seq: number): boolean {
    if (this.#highestSeq < 0) {
      this.#highestSeq = seq;
      this.#received = 1;
      this.#expected = 1;
      return true;
    }

    const ahead = seq - this.#highestSeq;
    if (ahead <= 0) {
      // A straggler that beat nothing. It still counts as received, so a
      // reordered pair does not read as a loss followed by a bonus.
      this.#received++;
      return false;
    }

    this.#expected += ahead;
    this.#received++;
    this.#highestSeq = seq;

    if (this.#expected >= LOSS_WINDOW) {
      this.#loss = Math.max(0, 1 - this.#received / this.#expected);
      this.#expected = 0;
      this.#received = 0;
    }
    return true;
  }

  /** A heartbeat came back. `roundTripSeconds` is measured, not estimated. */
  observeRoundTrip(roundTripSeconds: number): void {
    const ms = roundTripSeconds * 1000;
    this.#rtt = this.#rtt === null ? ms : this.#rtt + (ms - this.#rtt) * this.#rttWeight;
  }

  /** Playback depth in seconds. What the buffer subtracts from the clock. */
  get delay(): number {
    return this.#delay;
  }

  get ready(): boolean {
    return this.#offset !== null;
  }

  quality(health: LinkHealth): LinkQuality {
    return {
      health,
      rttMs: this.#rtt === null ? null : Math.round(this.#rtt),
      jitterMs: Math.round(this.#jitter * 1000),
      loss: this.#loss,
      delayMs: Math.round(this.#delay * 1000),
    };
  }

  /**
   * Throws away the offset without touching the measured jitter or loss. Used
   * when a link is re-established: the transit floor was measured through a
   * path that no longer exists, but how bad this player's connection is has not
   * changed and re-learning it from scratch would cost another stutter.
   */
  resync(): void {
    this.#offset = null;
    this.#candidate = null;
    this.#highestSeq = -1;
  }
}

/** One monotonic clock for the whole browser, in seconds. Never wall time. */
export function nowSeconds(): number {
  return performance.now() / 1000;
}
