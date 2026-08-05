/**
 * Persistence, behind an adapter so the packaged build can swap `localStorage`
 * for an OS save directory without anything above this file noticing.
 *
 * The profile holds what the player has earned (escaped maps, coins), what they
 * chose to look like, and their options. Nothing here is gameplay tuning - the
 * options block stores only what the player moved, and every default it falls
 * back to is read from `config/` (see `options.ts`).
 *
 * There is no format versioning, by explicit decision (docs/ARCHITECTURE.md -
 * "Deliberately NOT built"). Instead, every field is validated on the way in and
 * a bad one costs that field alone: a corrupt profile is a fresh profile, never
 * a failed boot.
 */
import type { Config } from '@/config/types';
import { defaultOptions, optionRanges, sanitiseOptions, type Options, type OptionRanges } from './options';

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
  /** Everything the options menu writes. Defaults come from `config/`. */
  options: Options;
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
  #profile: Profile;
  readonly #defaults: Options;
  readonly #ranges: OptionRanges;
  readonly #storage: Storage;

  constructor(config: Config, storage: Storage = browserStorage) {
    this.#defaults = defaultOptions(config);
    this.#ranges = optionRanges(config);
    this.#storage = storage;
    this.#profile = this.#empty();
  }

  #empty(): Profile {
    return { completedMaps: [], colourId: null, coins: 0, options: structuredClone(this.#defaults) };
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
        options: sanitiseOptions(parsed.options, this.#defaults, this.#ranges),
      };
    } catch (error) {
      console.warn('[save] profile unreadable, starting fresh', error);
      this.#profile = this.#empty();
    }
    return this.#profile;
  }

  get profile(): Readonly<Profile> {
    return this.#profile;
  }

  /* --- options -------------------------------------------------------------- */

  get options(): Readonly<Options> {
    return this.#profile.options;
  }

  /** The ranges the sliders may be dragged across. Straight out of config. */
  get ranges(): Readonly<OptionRanges> {
    return this.#ranges;
  }

  /**
   * Applies a patch and persists it. Deliberately not a deep merge: the options
   * menu owns whole sub-objects and handing this a half-built `graphics` block
   * should be a type error rather than a silent hole.
   */
  setOptions(patch: Partial<Options>): Options {
    this.#profile.options = { ...this.#profile.options, ...patch };
    this.#flush();
    return this.#profile.options;
  }

  /** Back to exactly what `config/` ships with. */
  resetOptions(): Options {
    this.#profile.options = structuredClone(this.#defaults);
    this.#flush();
    return this.#profile.options;
  }

  /* --- progress ------------------------------------------------------------- */

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

export type { Options, OptionRanges, Range } from './options';
