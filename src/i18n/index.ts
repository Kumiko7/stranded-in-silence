/**
 * Localisation. See docs/LOCALISATION.md.
 *
 * No user-visible string is ever written in code - every one is a key here.
 * t() never throws: a missing key renders as the key itself and warns once, so a
 * missing string is visible in-game but never a crash.
 */
const localeModules = import.meta.glob('/config/locales/*.json', { eager: true, import: 'default' });

type Strings = Record<string, string>;

interface Manifest {
  defaultLocale: string;
  fallbackLocale: string;
  locales: Record<string, { nativeName: string; file: string; complete: boolean }>;
}

function moduleFor(file: string): unknown {
  return localeModules[`/config/locales/${file}`];
}

let manifest: Manifest;
let strings: Strings = {};
let fallback: Strings = {};
let current = 'en';
const warned = new Set<string>();

function stringsFor(locale: string): Strings {
  const entry = manifest.locales[locale];
  if (!entry) return {};
  const raw = moduleFor(entry.file) as Record<string, unknown> | undefined;
  if (!raw) return {};

  const out: Strings = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith('$') && typeof value === 'string') out[key] = value;
  }
  return out;
}

export function initI18n(preferred?: string): void {
  manifest = moduleFor('manifest.json') as Manifest;
  if (!manifest) throw new Error('i18n: config/locales/manifest.json missing');

  fallback = stringsFor(manifest.fallbackLocale);
  setLocale(preferred ?? navigator.language.split('-')[0] ?? manifest.defaultLocale);
}

export function setLocale(locale: string): void {
  current = manifest.locales[locale] ? locale : manifest.defaultLocale;
  strings = stringsFor(current);
}

export function currentLocale(): string {
  return current;
}

export function availableLocales(): { code: string; nativeName: string }[] {
  return Object.entries(manifest.locales).map(([code, entry]) => ({ code, nativeName: entry.nativeName }));
}

/** `t('lobby.code', { code })` -> "Code: K7XQ2M". Placeholders are `{name}`. */
export function t(key: string, params?: Record<string, string | number>): string {
  const template = strings[key] ?? fallback[key];
  if (template === undefined) {
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] missing key "${key}"`);
    }
    return key;
  }
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
