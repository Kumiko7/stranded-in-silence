#!/usr/bin/env node
// Freesound API v2 client. Personal / non-commercial use.
// No dependencies: Node 22 native fetch.
//
//   node freesound.mjs search <query> [options]
//   node freesound.mjs info <id> [--json]
//   node freesound.mjs preview <id> --out <path> [--quality hq|lq] [--format ogg|mp3]
//   node freesound.mjs download <id> --out <path>          (needs OAuth2)
//   node freesound.mjs auth url [--redirect-uri <uri>]
//   node freesound.mjs auth token <code>
//   node freesound.mjs auth status

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const API = 'https://freesound.org/apiv2';
const TOKEN_STORE = path.join(os.homedir(), '.claude', 'freesound-oauth.json');

const LICENSE_FILTERS = {
  cc0: 'Creative Commons 0',
  by: 'Attribution',
  'by-nc': 'Attribution NonCommercial',
  'sampling+': 'Sampling+',
};

const DEFAULT_FIELDS =
  'id,name,username,license,duration,filesize,type,samplerate,channels,num_downloads,avg_rating,tags,previews,download,url';

// --- credentials -----------------------------------------------------------

/** Read an env var, falling back to the Windows user environment (HKCU). */
function fromEnv(name) {
  if (process.env[name]) return process.env[name].trim();
  if (process.platform !== 'win32') return undefined;
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', name], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const m = out.match(/REG_(?:EXPAND_)?SZ\s+(.+)/);
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

function credentials() {
  const key = fromEnv('FREESOUND_API_KEY');
  const clientId = fromEnv('FREESOUND_CLIENT_ID');
  if (!key) fail('FREESOUND_API_KEY is not set.');
  return { key, clientId };
}

// --- tiny arg parser -------------------------------------------------------

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags[a.slice(2)] = argv[++i];
      } else {
        flags[a.slice(2)] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

// --- http ------------------------------------------------------------------

async function apiGet(endpoint, params = {}) {
  const { key } = credentials();
  const url = new URL(API + endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { Authorization: `Token ${key}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    fail(`${res.status} ${res.statusText} on ${endpoint}\n${body.slice(0, 500)}`);
  }
  return res.json();
}

// --- oauth2 ----------------------------------------------------------------

function readTokens() {
  if (!existsSync(TOKEN_STORE)) return null;
  try {
    return JSON.parse(readFileSync(TOKEN_STORE, 'utf8'));
  } catch {
    return null;
  }
}

function writeTokens(t) {
  mkdirSync(path.dirname(TOKEN_STORE), { recursive: true });
  writeFileSync(TOKEN_STORE, JSON.stringify(t, null, 2), { mode: 0o600 });
}

async function exchange(body) {
  const { key, clientId } = credentials();
  if (!clientId) fail('FREESOUND_CLIENT_ID is not set; OAuth2 needs it.');
  const res = await fetch(`${API}/oauth2/access_token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: key, ...body }),
  });
  const text = await res.text();
  if (!res.ok) fail(`token exchange failed: ${res.status} ${text.slice(0, 500)}`);
  const t = JSON.parse(text);
  t.obtained_at = Date.now();
  writeTokens(t);
  return t;
}

/** Return a valid bearer token, refreshing if it has expired. */
async function bearer() {
  const t = readTokens();
  if (!t?.access_token) {
    fail('not authorised for downloads. Run: node freesound.mjs auth url');
  }
  const expiresAt = t.obtained_at + (t.expires_in ?? 86400) * 1000 - 60_000;
  if (Date.now() < expiresAt) return t.access_token;
  if (!t.refresh_token) fail('access token expired and no refresh token. Re-run: auth url');
  const fresh = await exchange({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
  return fresh.access_token;
}

// --- formatting ------------------------------------------------------------

const fmtDuration = (s) => (s == null ? '?' : `${s.toFixed(2)}s`);
const fmtSize = (b) => (b == null ? '?' : `${(b / 1024).toFixed(0)}KB`);

function licenseShort(url = '') {
  if (url.includes('publicdomain/zero')) return 'CC0';
  if (url.includes('by-nc')) return 'CC BY-NC';
  if (url.includes('/by/')) return 'CC BY';
  if (url.includes('sampling')) return 'Sampling+';
  return url || 'unknown';
}

function printSound(s, indent = '') {
  const bits = [
    fmtDuration(s.duration),
    licenseShort(s.license),
    s.type,
    s.samplerate ? `${s.samplerate}Hz` : null,
    s.channels ? `${s.channels}ch` : null,
    fmtSize(s.filesize),
    s.num_downloads != null ? `${s.num_downloads} dl` : null,
    s.avg_rating ? `★${s.avg_rating.toFixed(1)}` : null,
  ].filter(Boolean);
  console.log(`${indent}[${s.id}] ${s.name}  — by ${s.username}`);
  console.log(`${indent}      ${bits.join(' · ')}`);
  if (s.tags?.length) console.log(`${indent}      tags: ${s.tags.slice(0, 12).join(', ')}`);
  if (s.url) console.log(`${indent}      ${s.url}`);
}

/** The attribution line a CC BY / BY-NC sound legally requires. */
function attribution(s) {
  return `"${s.name}" by ${s.username} — ${s.url ?? `https://freesound.org/s/${s.id}/`} — ${licenseShort(s.license)}`;
}

// --- commands --------------------------------------------------------------

async function cmdSearch(positional, flags) {
  const query = positional.join(' ');
  if (!query && !flags.filter) fail('search needs a query (or --filter).');

  const filters = [];
  if (flags.filter) filters.push(flags.filter);
  if (flags.license) {
    const v = LICENSE_FILTERS[String(flags.license).toLowerCase()];
    if (!v) fail(`unknown --license; use one of: ${Object.keys(LICENSE_FILTERS).join(', ')}`);
    filters.push(`license:"${v}"`);
  }
  if (flags.type) filters.push(`type:${flags.type}`);
  const min = flags['min-duration'] ?? '*';
  const max = flags['max-duration'] ?? '*';
  if (min !== '*' || max !== '*') filters.push(`duration:[${min} TO ${max}]`);

  const data = await apiGet('/search/text/', {
    query,
    filter: filters.join(' ') || undefined,
    sort: flags.sort,
    page: flags.page,
    page_size: flags['page-size'] ?? 15,
    fields: flags.fields ?? DEFAULT_FIELDS,
  });

  if (flags.json) return console.log(JSON.stringify(data, null, 2));
  console.log(`${data.count} results for "${query}"${filters.length ? ` (${filters.join(' ')})` : ''}\n`);
  for (const s of data.results) {
    printSound(s);
    console.log('');
  }
  if (data.next) console.log('(more: pass --page 2)');
}

async function cmdInfo(positional, flags) {
  const id = positional[0];
  if (!id) fail('info needs a sound id.');
  const s = await apiGet(`/sounds/${id}/`, { fields: flags.fields ?? `${DEFAULT_FIELDS},description,pack,created` });
  if (flags.json) return console.log(JSON.stringify(s, null, 2));
  printSound(s);
  if (s.description) console.log(`\n${s.description.trim().slice(0, 1200)}`);
  console.log(`\nattribution: ${attribution(s)}`);
}

/** Resolve --out to a concrete file path, creating the directory. */
function resolveOut(out, defaultName) {
  if (!out || out === true) fail('--out <path> is required.');
  let target = path.resolve(String(out));
  const isDir = existsSync(target) && statSync(target).isDirectory();
  if (isDir || !path.extname(target)) target = path.join(target, defaultName);
  mkdirSync(path.dirname(target), { recursive: true });
  return target;
}

const safeName = (name) => name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120);

async function saveResponse(res, target) {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    fail(`${res.status} ${res.statusText}\n${body.slice(0, 500)}`);
  }
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
  console.log(`saved ${target} (${fmtSize(statSync(target).size)})`);
}

async function cmdPreview(positional, flags) {
  const id = positional[0];
  if (!id) fail('preview needs a sound id.');
  const quality = flags.quality ?? 'hq';
  const format = flags.format ?? 'ogg';
  const s = await apiGet(`/sounds/${id}/`, { fields: 'id,name,username,license,url,previews' });
  const url = s.previews?.[`preview-${quality}-${format}`];
  if (!url) fail(`no preview-${quality}-${format} for sound ${id}.`);

  const base = safeName(path.parse(s.name).name);
  const target = resolveOut(flags.out, `${base}.${format}`);
  await saveResponse(await fetch(url), target);
  console.log(`attribution: ${attribution(s)}`);
}

async function cmdDownload(positional, flags) {
  const id = positional[0];
  if (!id) fail('download needs a sound id.');
  const token = await bearer();
  const s = await apiGet(`/sounds/${id}/`, { fields: 'id,name,username,license,url,type' });

  const target = resolveOut(flags.out, safeName(s.name));
  const res = await fetch(`${API}/sounds/${id}/download/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await saveResponse(res, target);
  console.log(`attribution: ${attribution(s)}`);
}

async function cmdAuth(positional, flags) {
  const sub = positional[0] ?? 'status';
  const { clientId } = credentials();

  if (sub === 'url') {
    if (!clientId) fail('FREESOUND_CLIENT_ID is not set.');
    const u = new URL(`${API}/oauth2/authorize/`);
    u.searchParams.set('client_id', clientId);
    u.searchParams.set('response_type', 'code');
    if (flags['redirect-uri']) u.searchParams.set('redirect_uri', String(flags['redirect-uri']));
    console.log('Open this URL, approve access, then copy the code you are shown:\n');
    console.log(u.toString());
    console.log('\nThen run:  node freesound.mjs auth token <code>');
    return;
  }

  if (sub === 'token') {
    const code = positional[1];
    if (!code) fail('auth token needs the authorization code.');
    const t = await exchange({ grant_type: 'authorization_code', code });
    console.log(`authorised. Token stored in ${TOKEN_STORE}, valid ${Math.round((t.expires_in ?? 0) / 3600)}h (auto-refreshes).`);
    return;
  }

  if (sub === 'status') {
    const t = readTokens();
    if (!t?.access_token) return console.log('not authorised (previews still work; original downloads do not).');
    const left = t.obtained_at + (t.expires_in ?? 86400) * 1000 - Date.now();
    console.log(
      left > 0
        ? `authorised — access token valid for ${Math.round(left / 60000)} min`
        : `access token expired; will refresh automatically${t.refresh_token ? '' : ' — but no refresh token, re-run auth url'}`,
    );
    return;
  }

  fail(`unknown auth subcommand "${sub}" (url | token | status).`);
}

// --- entry -----------------------------------------------------------------

const USAGE = `freesound — search and download sounds from freesound.org

  search <query...>   [--license cc0|by|by-nc|sampling+] [--type wav|ogg|mp3|flac|aiff]
                      [--min-duration N] [--max-duration N] [--sort <s>]
                      [--page N] [--page-size N] [--filter <raw>] [--fields <f>] [--json]
  info <id>           [--json]
  preview <id>        --out <file|dir> [--quality hq|lq] [--format ogg|mp3]
  download <id>       --out <file|dir>        (original file; needs OAuth2)
  auth url|token|status

  sort: score (default) | rating_desc | downloads_desc | created_desc
        | duration_asc | duration_desc (and the _asc/_desc counterparts)`;

const { positional, flags } = parseArgs(process.argv.slice(2));
const [command, ...rest] = positional;

const commands = {
  search: cmdSearch,
  info: cmdInfo,
  preview: cmdPreview,
  download: cmdDownload,
  auth: cmdAuth,
};

if (!command || flags.help || command === 'help') {
  console.log(USAGE);
  process.exit(command ? 0 : 1);
}
if (!commands[command]) fail(`unknown command "${command}".\n\n${USAGE}`);

await commands[command](rest, flags);
