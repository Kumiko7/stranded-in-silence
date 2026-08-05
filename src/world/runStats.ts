/**
 * What each player did with their run, for the scoreboard.
 *
 * Which categories exist is `game.json -> scoring.categories`, not this file:
 * the ids below are the ones logic knows how to count, and the config decides
 * which of them are shown, in what order, and whether more is better.
 *
 * **Every peer counts its own.** There is no authority here and there does not
 * need to be - a player's own client is the only thing that sees every one of
 * their footsteps, and a scoreboard is not worth an arbitration protocol. Each
 * peer broadcasts its block; everyone else stores what they are sent.
 */

/** The categories logic knows how to count. */
export const STAT_IDS = ['doorsOpened', 'itemsUsed', 'heals', 'goldCollected', 'noiseMade'] as const;

export type StatId = (typeof STAT_IDS)[number];

export type PlayerStats = Record<StatId, number>;

export function emptyStats(): PlayerStats {
  return { doorsOpened: 0, itemsUsed: 0, heals: 0, goldCollected: 0, noiseMade: 0 };
}

/**
 * Anything off the wire is treated as hostile in the same way a save profile is:
 * a peer on a different build sends a shape this one does not know, and one bad
 * number must not take the scoreboard down with it.
 */
export function sanitiseStats(raw: unknown): PlayerStats {
  const source = (raw ?? {}) as Record<string, unknown>;
  const stats = emptyStats();
  for (const id of STAT_IDS) {
    const value = source[id];
    if (typeof value === 'number' && Number.isFinite(value)) stats[id] = Math.max(0, value);
  }
  return stats;
}

export class RunStats {
  #byPlayer = new Map<string, PlayerStats>();
  /** Set whenever the local player's own block changes, cleared by the sender. */
  #dirty = false;

  clear(): void {
    this.#byPlayer.clear();
    this.#dirty = false;
  }

  get(id: string): PlayerStats {
    let stats = this.#byPlayer.get(id);
    if (!stats) {
      stats = emptyStats();
      this.#byPlayer.set(id, stats);
    }
    return stats;
  }

  /**
   * `amount` is a count for everything except `noiseMade`, which accumulates
   * loudness: a run measured in footstep *events* would say a sprinter and a
   * crouching player were equally loud, which is the opposite of true.
   */
  add(id: string, stat: StatId, amount = 1): void {
    if (amount <= 0) return;
    this.get(id)[stat] += amount;
    this.#dirty = true;
  }

  /** A peer's own count of what they did. Replaces rather than merges. */
  set(id: string, stats: PlayerStats): void {
    this.#byPlayer.set(id, stats);
  }

  remove(id: string): void {
    this.#byPlayer.delete(id);
  }

  /** True once since the last call: the cue to broadcast this player's block. */
  takeDirty(): boolean {
    const dirty = this.#dirty;
    this.#dirty = false;
    return dirty;
  }
}
