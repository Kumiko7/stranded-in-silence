/**
 * The options block of the save profile: schema, defaults and sanitising.
 *
 * Every default is READ FROM CONFIG rather than written here, so `config/` stays
 * the single source of truth for what the game ships with and "reset to
 * defaults" means exactly "whatever the config files say" (docs/CONFIG.md).
 *
 * Deliberately small. These are the settings every game has and nothing more -
 * no quality presets, no accessibility block, no rebinding. Each of those is
 * either a later plan step or on the "Deliberately NOT built" list in
 * docs/ARCHITECTURE.md; the shape here is additive, so none of them needs this
 * file rewritten.
 */
import type { Config } from '@/config/types';

/** One slider's live value plus the range it may be dragged across. */
export interface Range {
  min: number;
  max: number;
}

export interface Options {
  /**
   * Chosen language, or null to follow the browser. Null is not the same as
   * "en": a player who has never touched the setting should get their own
   * language if the game has it, and keep getting it if a later build adds one.
   */
  locale: string | null;
  /** Bus id -> volume, 0..1. Keys mirror `audio.json -> buses`. */
  volumes: Record<string, number>;
  graphics: {
    fovDegrees: number;
    /** Multiplies `graphics.json -> exposure`. 1 is exactly what the map asks for. */
    brightness: number;
    shadows: boolean;
  };
  controls: {
    sensitivity: number;
    invertY: boolean;
  };
  /**
   * Whether the corner tutorial line is offered at all. It turns itself off
   * once every tip has been seen, and turning it back on is what resets the
   * progress that turned it off - see `Tutorial.setEnabled()`.
   */
  tutorial: boolean;
  /**
   * Action id -> the raw code its PRIMARY key was moved to. Only overrides are
   * stored, never the full binding set, so a later build that adds an action or
   * changes a default is picked up rather than frozen out by an old profile.
   */
  binds: Record<string, string>;
}

/** The ranges the sliders may be dragged across, all straight out of config. */
export interface OptionRanges {
  volume: Range;
  fov: Range;
  brightness: Range;
  sensitivity: Range;
}

function range(pair: readonly number[] | undefined, fallback: Range): Range {
  const [min, max] = pair ?? [];
  return typeof min === 'number' && typeof max === 'number' && max > min ? { min, max } : fallback;
}

export function optionRanges(config: Config): OptionRanges {
  return {
    volume: { min: 0, max: 1 },
    fov: range(config.player.camera.fovRange, { min: 60, max: 110 }),
    brightness: range(config.graphics.brightnessRange, { min: 0.6, max: 1.6 }),
    sensitivity: range(config.input.mouse.sensitivityRange, { min: 0.1, max: 5 }),
  };
}

/** What a profile that has never opened the options menu behaves as. */
export function defaultOptions(config: Config): Options {
  const volumes: Record<string, number> = {};
  for (const [id, bus] of Object.entries(config.audio.buses)) volumes[id] = bus.defaultVolume;

  return {
    locale: null,
    volumes,
    graphics: {
      fovDegrees: config.player.camera.fovDegrees,
      brightness: 1,
      shadows: config.graphics.shadows.enabled,
    },
    controls: {
      sensitivity: config.input.mouse.sensitivity,
      invertY: config.player.camera.invertY,
    },
    tutorial: config.ui.hud.tutorial.enabled,
    binds: {},
  };
}

function clamp(value: unknown, { min, max }: Range, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Anything stored is treated as hostile: a hand-edited `localStorage` entry, or
 * a profile written by an older build whose config had different buses. Unknown
 * keys are dropped and missing ones fall back to the default, so a bad field
 * costs one setting rather than the whole profile.
 */
export function sanitiseOptions(raw: unknown, defaults: Options, ranges: OptionRanges): Options {
  const source = (raw ?? {}) as Partial<Record<keyof Options, unknown>>;
  const storedVolumes = (source.volumes ?? {}) as Record<string, unknown>;
  const graphics = (source.graphics ?? {}) as Record<string, unknown>;
  const controls = (source.controls ?? {}) as Record<string, unknown>;
  const storedBinds = (source.binds ?? {}) as Record<string, unknown>;

  const volumes: Record<string, number> = {};
  // Driven by the DEFAULTS, not by what was stored: a bus that no longer exists
  // in config must not survive in the profile.
  for (const [id, value] of Object.entries(defaults.volumes)) {
    volumes[id] = clamp(storedVolumes[id], ranges.volume, value);
  }

  // Binds are checked for shape only. Whether an action still exists is
  // `Input.applyBinds()`'s business, and it already ignores ones that do not -
  // keeping an unknown one here costs nothing and survives a rename round-trip.
  const binds: Record<string, string> = {};
  for (const [action, code] of Object.entries(storedBinds)) {
    if (typeof code === 'string' && code) binds[action] = code;
  }

  return {
    locale: typeof source.locale === 'string' ? source.locale : null,
    volumes,
    graphics: {
      fovDegrees: clamp(graphics['fovDegrees'], ranges.fov, defaults.graphics.fovDegrees),
      brightness: clamp(graphics['brightness'], ranges.brightness, defaults.graphics.brightness),
      shadows: bool(graphics['shadows'], defaults.graphics.shadows),
    },
    controls: {
      sensitivity: clamp(controls['sensitivity'], ranges.sensitivity, defaults.controls.sensitivity),
      invertY: bool(controls['invertY'], defaults.controls.invertY),
    },
    tutorial: bool(source.tutorial, defaults.tutorial),
    binds,
  };
}
