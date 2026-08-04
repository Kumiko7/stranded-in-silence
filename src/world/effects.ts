/**
 * What a thrown item leaves behind.
 *
 * Tar slicks, a clock that will not stop ringing, the after-image of a flare.
 * All three are the same shape - a thing at a position with a clock on it - so
 * they share one list and one update. Plain state; the art hung on each one is
 * the caller's business.
 *
 * Every peer simulates the same throws from the same release state, so every
 * peer builds the same effects. Nothing here is replicated.
 */

export type EffectKind = 'tar' | 'alarm' | 'burst';

export interface Effect {
  readonly id: string;
  readonly kind: EffectKind;
  /** Peer whose throw made it, so the noise it emits lands on the right roster line. */
  readonly ownerId: string;
  readonly x: number;
  readonly z: number;
  /** Metres. Zero for effects that occupy no ground. */
  readonly radius: number;
  /** Speed multiplier applied inside `radius`. 1 for effects that do not slow. */
  readonly slowMultiplier: number;
  /** Seconds left. */
  remaining: number;
  readonly duration: number;
  /** Seconds it takes to reach full size, for the art to grow into. */
  readonly spreadSeconds: number;
  /** Alarms only: seconds between noise events, and the clock counting to the next. */
  readonly noiseInterval: number;
  noiseTimer: number;
}

export interface EffectSpec {
  id: string;
  kind: EffectKind;
  ownerId: string;
  x: number;
  z: number;
  radius?: number;
  slowMultiplier?: number;
  duration: number;
  spreadSeconds?: number;
  noiseInterval?: number;
}

export class RunEffects {
  #effects: Effect[] = [];

  get all(): readonly Effect[] {
    return this.#effects;
  }

  add(spec: EffectSpec): Effect {
    const effect: Effect = {
      id: spec.id,
      kind: spec.kind,
      ownerId: spec.ownerId,
      x: spec.x,
      z: spec.z,
      radius: spec.radius ?? 0,
      slowMultiplier: spec.slowMultiplier ?? 1,
      remaining: spec.duration,
      duration: spec.duration,
      spreadSeconds: spec.spreadSeconds ?? 0,
      noiseInterval: spec.noiseInterval ?? 0,
      // Ringing starts the moment it lands, not one interval later.
      noiseTimer: 0,
    };
    this.#effects.push(effect);
    return effect;
  }

  /** Runs the clocks. Returns whatever expired this tick so the caller can free its art. */
  update(dt: number): Effect[] {
    const expired: Effect[] = [];
    for (const effect of this.#effects) {
      effect.remaining -= dt;
      effect.noiseTimer -= dt;
      if (effect.remaining <= 0) expired.push(effect);
    }
    if (expired.length) this.#effects = this.#effects.filter((effect) => effect.remaining > 0);
    return expired;
  }

  /**
   * Alarms due to make a noise this tick. Consuming it rearms the clock, so the
   * caller must act on every entry it is handed.
   */
  dueToSound(): Effect[] {
    const due: Effect[] = [];
    for (const effect of this.#effects) {
      if (effect.noiseInterval <= 0 || effect.noiseTimer > 0) continue;
      effect.noiseTimer = effect.noiseInterval;
      due.push(effect);
    }
    return due;
  }

  /** Slowest thing standing at this position has to obey. 1 when the ground is clear. */
  slowAt(x: number, z: number): number {
    let slowest = 1;
    for (const effect of this.#effects) {
      if (effect.slowMultiplier >= 1 || effect.radius <= 0) continue;
      if (Math.hypot(effect.x - x, effect.z - z) > effect.radius) continue;
      slowest = Math.min(slowest, effect.slowMultiplier);
    }
    return slowest;
  }

  /** How far an effect has grown, 0..1. Art fades and spreads on this. */
  static progress(effect: Effect): number {
    if (effect.spreadSeconds <= 0) return 1;
    const elapsed = effect.duration - effect.remaining;
    return Math.max(0, Math.min(1, elapsed / effect.spreadSeconds));
  }

  clear(): void {
    this.#effects.length = 0;
  }
}
