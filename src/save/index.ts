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
  /** Id from `player.json -> customisation.hats`, or null for the default. */
  hatId: string | null;
  /**
   * Hats this player has BOUGHT. Free ones (`cost: 0`) are never in here - what
   * you can wear is "owned or free", and keeping the free ones out means
   * repricing a hat to zero hands it to everybody without a migration.
   */
  ownedHats: string[];
  /**
   * Coins banked across every run. A run's purse only lands here when this
   * player personally makes it out - see `Game.#cashOut()`. The wardrobe's hat
   * shop is what spends them.
   */
  coins: number;
  /**
   * Tutorial tips this player has already been through. Progress rather than an
   * option: the *switch* is in `options.tutorial`, and this is what it turns
   * itself off at the end of, and what turning it back on wipes.
   */
  tutorialSeen: string[];
  /** Everything the options menu writes. Defaults come from `config/`. */
  options: Options;
}

/**
 * The seam. A browser with storage disabled falls through to an in-memory
 * profile rather than failing to boot, and the packaged build swaps the whole
 * thing for a file in the OS's per-user application data directory.
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

/**
 * The desktop build's store: a real file, written by the main process
 * (`electron/main.cjs`). The game does not know the path and does not want to -
 * `window.strandedShell` being there at all is the whole of "am I packaged".
 */
const shellStorage: Storage = {
  read: () => {
    try {
      return window.strandedShell?.save.read() ?? null;
    } catch (error) {
      console.warn('[save] could not read profile', error);
      return null;
    }
  },
  write: (value) => {
    try {
      window.strandedShell?.save.write(value);
    } catch (error) {
      console.warn('[save] could not persist profile', error);
    }
  },
};

/** A file when the shell offers one, `localStorage` when it does not. */
function defaultStorage(): Storage {
  return typeof window !== 'undefined' && window.strandedShell ? shellStorage : browserStorage;
}

export class Save {
  #profile: Profile;
  readonly #defaults: Options;
  readonly #ranges: OptionRanges;
  readonly #storage: Storage;

  constructor(config: Config, storage: Storage = defaultStorage()) {
    this.#defaults = defaultOptions(config);
    this.#ranges = optionRanges(config);
    this.#storage = storage;
    this.#profile = this.#empty();
  }

  #empty(): Profile {
    return {
      completedMaps: [],
      colourId: null,
      hatId: null,
      ownedHats: [],
      coins: 0,
      tutorialSeen: [],
      options: structuredClone(this.#defaults),
    };
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
        hatId: typeof parsed.hatId === 'string' ? parsed.hatId : null,
        ownedHats: Array.isArray(parsed.ownedHats)
          ? parsed.ownedHats.filter((id): id is string => typeof id === 'string')
          : [],
        coins: Number.isFinite(parsed.coins) ? Math.max(0, Math.floor(parsed.coins as number)) : 0,
        tutorialSeen: Array.isArray(parsed.tutorialSeen)
          ? parsed.tutorialSeen.filter((id): id is string => typeof id === 'string')
          : [],
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

  /* --- tutorial ------------------------------------------------------------- */

  hasSeenTip(id: string): boolean {
    return this.#profile.tutorialSeen.includes(id);
  }

  markTipSeen(id: string): void {
    if (this.hasSeenTip(id)) return;
    this.#profile.tutorialSeen.push(id);
    this.#flush();
  }

  /** Back to knowing nothing. What switching the tutorial back on does. */
  resetTips(): void {
    if (!this.#profile.tutorialSeen.length) return;
    this.#profile.tutorialSeen = [];
    this.#flush();
  }

  setColourId(colourId: string): void {
    if (this.#profile.colourId === colourId) return;
    this.#profile.colourId = colourId;
    this.#flush();
  }

  /* --- the wardrobe's shop ---------------------------------------------------- */

  setHatId(hatId: string): void {
    if (this.#profile.hatId === hatId) return;
    this.#profile.hatId = hatId;
    this.#flush();
  }

  ownsHat(hatId: string): boolean {
    return this.#profile.ownedHats.includes(hatId);
  }

  /**
   * Buys a hat, or refuses. One call rather than a `spendCoins` and a
   * `grantHat`, because a purchase that took the money and lost the hat is
   * exactly the failure a two-call API invites - and there is no server to ask.
   *
   * `cost` is the caller's, from `player.json -> customisation.hats`: `save/`
   * holds the numbers and never reads the config that prices them.
   */
  buyHat(hatId: string, cost: number): boolean {
    if (this.ownsHat(hatId)) return true;
    if (cost > this.#profile.coins) return false;

    this.#profile.coins -= Math.max(0, Math.floor(cost));
    this.#profile.ownedHats.push(hatId);
    this.#flush();
    return true;
  }

  #flush(): void {
    this.#storage.write(JSON.stringify(this.#profile));
  }
}

export type { Options, OptionRanges, Range } from './options';
