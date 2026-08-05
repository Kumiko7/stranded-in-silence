/**
 * `npm run validate:locales`
 *
 * English is the reference. Every other locale is checked against it, because
 * a translation's failure modes are not "wrong words" - nobody can automate
 * that - they are structural, and all of them are silent at runtime:
 *
 *   - a MISSING key falls through to English, so half a menu quietly reverts;
 *   - an EXTRA key is a typo'd id that will never be shown to anyone;
 *   - a DROPPED PLACEHOLDER prints "Starting in" with no number;
 *   - an INVENTED PLACEHOLDER prints a literal `{seconds}` on screen.
 *
 * It also checks the manifest lines up with the files on disk, and that every
 * `scoring.categories` id and every item in `items.json` has its label - the
 * two places where a config id and a locale key have to agree
 * (docs/LOCALISATION.md).
 *
 * Exit code 1 on any error. Warnings do not fail the run.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localeDir = join(root, 'config', 'locales');

const errors = [];
const warnings = [];

const error = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** `$doc` / `$note` keys are documentation and never reach the game. */
function stringsOf(raw, label) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('$')) continue;
    if (typeof value !== 'string') {
      error(`${label}: "${key}" is ${typeof value}, expected a string`);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function placeholders(template) {
  return new Set([...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]));
}

/* --- manifest ------------------------------------------------------------- */

const manifest = readJson(join(localeDir, 'manifest.json'));
const declared = Object.entries(manifest.locales);
const onDisk = readdirSync(localeDir).filter((name) => name.endsWith('.json') && name !== 'manifest.json');

for (const [code, entry] of declared) {
  if (!onDisk.includes(entry.file)) error(`manifest: "${code}" names ${entry.file}, which does not exist`);
  if (!entry.nativeName) error(`manifest: "${code}" has no nativeName - the selector would show a blank row`);
}
for (const file of onDisk) {
  if (!declared.some(([, entry]) => entry.file === file)) {
    warn(`${file} is not in the manifest, so it can never be selected`);
  }
}

if (!manifest.locales[manifest.fallbackLocale]) {
  error(`manifest: fallbackLocale "${manifest.fallbackLocale}" is not a declared locale`);
}

/* --- keys ----------------------------------------------------------------- */

const reference = manifest.fallbackLocale;
const refEntry = manifest.locales[reference];
const refStrings = refEntry ? stringsOf(readJson(join(localeDir, refEntry.file)), reference) : {};
const refKeys = Object.keys(refStrings);

for (const [code, entry] of declared) {
  if (code === reference) continue;

  const strings = stringsOf(readJson(join(localeDir, entry.file)), code);
  const keys = new Set(Object.keys(strings));

  const missing = refKeys.filter((key) => !keys.has(key));
  const extra = [...keys].filter((key) => !(key in refStrings));

  // `complete: false` says the gaps are known and deliberate, so they drop to
  // warnings - a locale being worked on should not fail the build.
  const report = entry.complete === false ? warn : error;
  if (missing.length) report(`${code}: ${missing.length} missing key(s): ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ' …' : ''}`);
  if (extra.length) error(`${code}: ${extra.length} key(s) not in ${reference}: ${extra.slice(0, 6).join(', ')}${extra.length > 6 ? ' …' : ''}`);

  for (const [key, value] of Object.entries(strings)) {
    const expected = refStrings[key];
    if (expected === undefined) continue;

    const want = placeholders(expected);
    const got = placeholders(value);
    for (const name of want) {
      if (!got.has(name)) error(`${code}: "${key}" drops the {${name}} placeholder`);
    }
    for (const name of got) {
      if (!want.has(name)) error(`${code}: "${key}" invents a {${name}} placeholder`);
    }
    if (!value.trim()) error(`${code}: "${key}" is empty`);
  }
}

/* --- ids that must have labels -------------------------------------------- */
/*
 * The two places docs/LOCALISATION.md promises a config id and a locale key
 * line up. Checked against the reference only: the per-locale sweep above
 * already guarantees the others carry the same keys.
 */

const game = readJson(join(root, 'config', 'game.json'));
for (const category of game.scoring?.categories ?? []) {
  const key = `scoreboard.category.${category.id}`;
  if (!(key in refStrings)) error(`game.json: scoring category "${category.id}" has no "${key}"`);
}

const items = readJson(join(root, 'config', 'items.json'));
for (const [id, item] of Object.entries(items.items ?? {})) {
  if (id.startsWith('$')) continue;
  for (const key of [item.nameKey, item.descKey].filter(Boolean)) {
    if (!(key in refStrings)) error(`items.json: item "${id}" names "${key}", which does not exist`);
  }
}

const input = readJson(join(root, 'config', 'input.json'));
for (const [id, action] of Object.entries(input.actions ?? {})) {
  if (id.startsWith('$')) continue;
  if (action.labelKey && !(action.labelKey in refStrings)) {
    error(`input.json: action "${id}" names "${action.labelKey}", which does not exist`);
  }
}

const audio = readJson(join(root, 'config', 'audio.json'));
for (const [id, bus] of Object.entries(audio.buses ?? {})) {
  if (id.startsWith('$')) continue;
  if (bus.labelKey && !(bus.labelKey in refStrings)) {
    error(`audio.json: bus "${id}" names "${bus.labelKey}", which does not exist`);
  }
}

/* --- report --------------------------------------------------------------- */

for (const message of warnings) console.warn(`  ! ${message}`);
if (warnings.length) console.warn('');

if (errors.length) {
  for (const message of errors) console.error(`  x ${message}`);
  console.error(`\nFAILED - ${errors.length} error(s) across ${declared.length} locale(s).`);
  process.exit(1);
}

console.log(`OK - ${declared.length} locale(s), ${refKeys.length} keys each.`);
