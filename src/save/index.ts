/**
 * Persistence, behind an adapter so the packaged build can swap `localStorage`
 * for an OS save directory without anything above this file noticing.
 *
 * Deliberately tiny: it holds only what the lobby needs to exist - which maps
 * this player has personally escaped, and what they picked in the wardrobe.
 * Options, key binds and the rest of the profile land with plan step 35, which
 * is also where a real schema and validation go. There is no format versioning
 * yet, by explicit decision (docs/ARCHITECTURE.md - "Deliberately NOT built").
 */

const STORAGE_KEY = 'stranded.profile.v1';

export interface Profile {
  /**
   * Map ids this player has escaped **themselves**. Being carried out by a team
   * that escaped without you does not count, which is the whole point of the
   * tick on the poster.
   */
  completedMaps: string[];
  /** Id from `player.json -> customisation.colours`, or null for the default. */
  colourId: string | null;
  /**
   * Coins banked across every run. A run's purse only lands here when this
   * player personally makes it out - see `Game.#cashOut()`. Nothing spends them
   * yet; the lobby shop is plan step 42.
   */
  coins: number;
}

function empty(): Profile {
  return { completedMaps: [], colourId: null, coins: 0 };
}

/**
 * The seam. Swapped for a file-backed adapter when the game is packaged; a
 * browser with storage disabled falls through to an in-memory profile rather
 * than failing to boot.
 */
interface Storage {
  read(): string | null;
  write(value: string): void;
}

const browserStorage: Storage = {
  read: () => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  write: (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (error) {
      console.warn('[save] could not persist profile', error);
    }
  },
};

export class Save {
  #profile: Profile = empty();
  readonly #storage: Storage;

  constructor(storage: Storage = browserStorage) {
    this.#storage = storage;
  }

  /** Never throws: a corrupt profile is a fresh profile, not a failed boot. */
  load(): Profile {
    const raw = this.#storage.read();
    if (!raw) return this.#profile;

    try {
      const parsed = JSON.parse(raw) as Partial<Profile>;
      this.#profile = {
        completedMaps: Array.isArray(parsed.completedMaps)
          ? parsed.completedMaps.filter((id): id is string => typeof id === 'string')
          : [],
        colourId: typeof parsed.colourId === 'string' ? parsed.colourId : null,
        coins: Number.isFinite(parsed.coins) ? Math.max(0, Math.floor(parsed.coins as number)) : 0,
      };
    } catch (error) {
      console.warn('[save] profile unreadable, starting fresh', error);
      this.#profile = empty();
    }
    return this.#profile;
  }

  get profile(): Readonly<Profile> {
    return this.#profile;
  }

  hasCompleted(mapId: string): boolean {
    return this.#profile.completedMaps.includes(mapId);
  }

  /** Called when this player - not their team - makes it out of `mapId`. */
  markCompleted(mapId: string): void {
    if (this.hasCompleted(mapId)) return;
    this.#profile.completedMaps.push(mapId);
    this.#flush();
  }

  /** Banks a run's purse. Called only when this player got out with it. */
  addCoins(amount: number): void {
    if (amount <= 0) return;
    this.#profile.coins += Math.floor(amount);
    this.#flush();
  }

  setColourId(colourId: string): void {
    if (this.#profile.colourId === colourId) return;
    this.#profile.colourId = colourId;
    this.#flush();
  }

  #flush(): void {
    this.#storage.write(JSON.stringify(this.#profile));
  }
}
