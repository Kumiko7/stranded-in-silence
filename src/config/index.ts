/**
 * Config loading and layering. See docs/CONFIG.md.
 *
 * Layers, later winning:
 *   1. config/*.json                          base
 *   2. maps.json -> maps.<id>.overrides       when a map is chosen
 *   3. difficulty.json -> modes.<id>.overrides  when a run starts
 *   4. save profile                           options-menu changes (not wired yet)
 *
 * Files are imported at build time, so editing a JSON file hot-reloads the dev
 * build. Logic must read config through here, never by importing JSON directly.
 */
import type { Config, DeepPartial, GraphicsConfig } from './types';

const modules = import.meta.glob('/config/*.json', { eager: true, import: 'default' });

type Json = Record<string, unknown>;

/** `$doc` / `$note` keys are documentation. They never reach logic. */
function stripDocKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDocKeys);
  if (value && typeof value === 'object') {
    const out: Json = {};
    for (const [key, val] of Object.entries(value as Json)) {
      if (key.startsWith('$')) continue;
      out[key] = stripDocKeys(val);
    }
    return out;
  }
  return value;
}

/** Objects merge recursively; arrays and primitives are replaced wholesale. */
export function deepMerge<T>(base: T, overlay: DeepPartial<T> | undefined): T {
  if (!overlay) return base;
  if (base === null || typeof base !== 'object' || Array.isArray(base)) return overlay as T;

  const out: Json = { ...(base as unknown as Json) };
  for (const [key, val] of Object.entries(overlay as Json)) {
    if (val === undefined) continue;
    const current = out[key];
    out[key] =
      current && typeof current === 'object' && !Array.isArray(current) && val && typeof val === 'object' && !Array.isArray(val)
        ? (deepMerge(current, val as never) as unknown)
        : val;
  }
  return out as unknown as T;
}

let base: Config | null = null;

export function loadConfig(): Config {
  if (base) return base;

  const sections: Json = {};
  for (const [path, value] of Object.entries(modules)) {
    const name = path.replace(/^.*\//, '').replace(/\.json$/, '');
    sections[name] = stripDocKeys(value) as Json;
  }

  const required = ['audio', 'darts', 'difficulty', 'game', 'player', 'world', 'enemy', 'items', 'graphics', 'input', 'net', 'maps', 'ui'];
  const missing = required.filter((name) => !sections[name]);
  if (missing.length) throw new Error(`config: missing ${missing.join(', ')}.json`);

  base = sections as unknown as Config;
  return base;
}

/**
 * The chosen quality tier, as an id into `graphics.json -> quality.tiers`.
 *
 * Module state rather than a parameter, because the alternative is threading it
 * through every call that reads graphics - `configForMap`, `configForRun`,
 * `lobbyGraphics` and every one of their callers - to express one fact that is
 * true of the whole session. `main.tsx` sets it from the save profile at boot
 * and again whenever the options menu changes it, and it is the only writer.
 */
let quality: string | null = null;

export function setQuality(tierId: string | null): void {
  quality = tierId;
}

export function qualityTierIds(): string[] {
  return Object.keys(loadConfig().graphics.quality?.tiers ?? {});
}

/** What a profile that has never chosen plays on. */
export function defaultQualityTier(): string {
  const block = loadConfig().graphics.quality;
  return block?.default ?? qualityTierIds()[0] ?? 'high';
}

/**
 * The chosen tier's overlay on top of a graphics block.
 *
 * Applied LAST, after the map's and the lobby's own overrides, because it is
 * the player's machine talking and it should win: a map that asks for six
 * lights does not get to overrule someone who has said their laptop cannot
 * draw them.
 */
function withQuality(graphics: GraphicsConfig): GraphicsConfig {
  const tiers = graphics.quality?.tiers;
  if (!tiers) return graphics;
  return deepMerge(graphics, tiers[quality ?? graphics.quality?.default ?? '']);
}

/** Base config with the chosen map's overrides applied. This is what a run uses. */
export function configForMap(mapId: string): Config {
  const cfg = loadConfig();
  const entry = cfg.maps.maps[mapId];
  if (!entry) throw new Error(`config: unknown map "${mapId}"`);

  return {
    ...cfg,
    graphics: withQuality(deepMerge(cfg.graphics, entry.overrides?.graphics)),
    world: deepMerge(cfg.world, entry.overrides?.world),
  };
}

/**
 * The config a run actually plays on: the map's overrides, then the chosen
 * difficulty's on top. Both are pure data overlays, which is what keeps adding
 * either of them a config change rather than a code change.
 *
 * Every peer calls this with the same `(mapId, difficultyId)`, so the layout and
 * the hunters they each derive agree without any of it crossing the wire.
 */
export function configForRun(mapId: string, difficultyId: string): Config {
  const cfg = configForMap(mapId);
  const overrides = loadConfig().difficulty.modes[difficultyId]?.overrides;
  if (!overrides) return cfg;

  return {
    ...cfg,
    enemy: deepMerge(cfg.enemy, overrides.enemy),
    world: deepMerge(cfg.world, overrides.world),
    player: deepMerge(cfg.player, overrides.player),
  };
}

/** Graphics with `graphics.json -> lobby` applied. The lobby is the bright place. */
export function lobbyGraphics(): GraphicsConfig {
  const { graphics } = loadConfig();
  return withQuality(deepMerge(graphics, graphics.lobby));
}

/** Graphics for the main menu and anything else outside a scene. */
export function menuGraphics(): GraphicsConfig {
  return withQuality(loadConfig().graphics);
}

export function enabledMapIds(): string[] {
  const cfg = loadConfig();
  return Object.entries(cfg.maps.maps)
    .filter(([, entry]) => entry.enabled !== false)
    .map(([id]) => id);
}

/** Difficulties the lobby lever may cycle, in the order `difficulty.json` lists them. */
export function enabledDifficultyIds(): string[] {
  const cfg = loadConfig();
  const ids = Object.entries(cfg.difficulty.modes)
    .filter(([, mode]) => mode.enabled === true)
    .map(([id]) => id);
  return ids.length ? ids : [cfg.difficulty.default];
}

export type { Config } from './types';
