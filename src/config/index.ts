/**
 * Config loading and layering. See docs/CONFIG.md.
 *
 * Layers, later winning:
 *   1. config/*.json                          base
 *   2. maps.json -> maps.<id>.overrides       when a map is chosen
 *   3. difficulty.json -> modes.<id>.overrides  when a run starts (not wired yet)
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

/** Base config with the chosen map's overrides applied. This is what a run uses. */
export function configForMap(mapId: string): Config {
  const cfg = loadConfig();
  const entry = cfg.maps.maps[mapId];
  if (!entry) throw new Error(`config: unknown map "${mapId}"`);
  if (!entry.overrides) return cfg;

  return {
    ...cfg,
    graphics: deepMerge(cfg.graphics, entry.overrides.graphics),
    world: deepMerge(cfg.world, entry.overrides.world),
  };
}

/** Graphics with `graphics.json -> lobby` applied. The lobby is the bright place. */
export function lobbyGraphics(): GraphicsConfig {
  const { graphics } = loadConfig();
  return deepMerge(graphics, graphics.lobby);
}

export function enabledMapIds(): string[] {
  const cfg = loadConfig();
  return Object.entries(cfg.maps.maps)
    .filter(([, entry]) => entry.enabled !== false)
    .map(([id]) => id);
}

/**
 * Difficulties the lobby lever may cycle. Only `normal` is enabled until step 38
 * applies the overlays - a lever that changed a label and nothing else would lie.
 */
export function enabledDifficultyIds(): string[] {
  const cfg = loadConfig();
  const ids = Object.entries(cfg.difficulty.modes)
    .filter(([, mode]) => mode.enabled === true)
    .map(([id]) => id);
  return ids.length ? ids : [cfg.difficulty.default];
}

export type { Config } from './types';
