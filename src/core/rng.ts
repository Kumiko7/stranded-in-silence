/**
 * Seeded RNG. Every peer generates the same map from the same seed, so the
 * network only ships (mapId, seed) instead of the world.
 *
 * `Math.random()` is banned in art/ and in generation for exactly this reason.
 *
 * Streams are named and independent: adding a loot roll must not shift the maze
 * layout, so each concern draws from its own stream derived from the run seed.
 */
export type Rng = () => number;

/** splitmix32 - small, fast, good enough distribution for level generation. */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
  };
}

/** Stable string hash, so stream names map to reproducible seeds. */
export function hashString(text: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/** A named sub-stream of a run seed: `stream(seed, 'layout')`. */
export function stream(seed: number, name: string): Rng {
  return makeRng((seed ^ hashString(name)) >>> 0);
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

export function rangeInt(rng: Rng, minInclusive: number, maxExclusive: number): number {
  return minInclusive + Math.floor(rng() * (maxExclusive - minInclusive));
}

export function pickWeighted<T>(rng: Rng, items: readonly T[], weightOf: (item: T) => number): T {
  let total = 0;
  for (const item of items) total += weightOf(item);

  let roll = rng() * total;
  for (const item of items) {
    roll -= weightOf(item);
    if (roll <= 0) return item;
  }
  const last = items[items.length - 1];
  if (last === undefined) throw new Error('pickWeighted from empty array');
  return last;
}

export function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}
