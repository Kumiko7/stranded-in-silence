/**
 * Ravenhollow Manor's surfaces, generated as procedural pixel data.
 *
 * Every recipe here is a pure function of pixel coordinates - no canvas, no
 * `Math.random()`, no config - so a room builds identically in a browser, on a
 * peer's machine, and headless inside `scripts/validateArt.mjs`.
 *
 * `*_TILE` is the size in METRES that one repeat covers. `merge.ts` bakes UVs in
 * world units, so a texture keeps its density whether it lands on a 0.4 m
 * skirting board or an 8 m ballroom floor, and materials.ts never has to guess.
 *
 * Albedos are mid-tones on purpose. Colour is converted to linear space before
 * lighting, where a near-black picked in a colour wheel is effectively 0 and no
 * lamp will ever bring it back. The manor is dark because of the lighting and
 * the fog, not because the wallpaper is black.
 */
import type * as THREE from 'three';
import { colorTexture, dataTexture, fbm, hash1, mix, normalTexture, rgb, shade, type RGB } from '../../lib/textures';

const SIZE = 256;

/** Isotropic fractal noise over a texture, seamless at the edges. */
const n2 = (x: number, y: number, size: number, scale: number, seed: number, octaves = 4): number =>
  fbm((x / size) * scale, (y / size) * scale, scale, scale, seed, octaves);

/** Stretched noise: `sx` repeats across, `sy` down. Both wrap. */
const n2s = (x: number, y: number, size: number, sx: number, sy: number, seed: number, octaves = 3): number =>
  fbm((x / size) * sx, (y / size) * sy, sx, sy, seed, octaves);

/** Water runs, soot blooms and damp. Returns a multiplier around 1. */
function grime(x: number, y: number, size: number, seed: number, strength: number): number {
  const runs = n2s(x, y, size, 8, 2, seed, 4);
  const blotch = n2(x, y, size, 8, seed + 31, 3);
  return 1 - Math.max(0, runs - 0.52) * strength * 1.6 - Math.max(0, blotch - 0.58) * strength;
}

/* --- shared maps -------------------------------------------------------------- */

export const GRIME_TILE = 3.2;

/** One roughness map for the whole manor. Patchy sheen reads as damp and old. */
export const grimeRoughness = (): THREE.Texture =>
  dataTexture('mansion.grimeRough', 128, (x, y, size) => 0.6 + n2(x, y, size, 8, 91) * 0.45);

/* --- floors -------------------------------------------------------------------- */

export const PARQUET_TILE = 2.4;
const PARQUET_CELL = 64;
const PARQUET_PLANK = 16;

/** Per-pixel parquet decomposition, shared by the colour and the height pass. */
function parquetAt(x: number, y: number): { tone: number; gap: number; along: number; across: number } {
  const bx = Math.floor(x / PARQUET_CELL);
  const by = Math.floor(y / PARQUET_CELL);
  const horizontal = (bx + by) % 2 === 0;
  const lx = x % PARQUET_CELL;
  const ly = y % PARQUET_CELL;

  const plank = Math.floor((horizontal ? ly : lx) / PARQUET_PLANK);
  const along = horizontal ? lx : ly;
  const across = (horizontal ? ly : lx) % PARQUET_PLANK;

  const tone = hash1(bx * 17 + by * 5 + plank, 64, 3301);
  const edge = across < 1 || across >= PARQUET_PLANK - 1 || along < 1 || along >= PARQUET_CELL - 1;
  return { tone, gap: edge ? 0.42 : 1, along, across };
}

/** Basket-weave oak. The manor's default floor: waxed once, a long time ago. */
export const parquet = (): THREE.Texture =>
  colorTexture('mansion.parquet', SIZE, (x, y, size) => {
    const { tone, gap, along, across } = parquetAt(x, y);
    const grain = n2s(along * 4, across * 16, size, 32, 8, 77, 3);
    const base = mix(rgb(0x6f5133), rgb(0xa07a4d), tone * 0.8 + grain * 0.3);
    return shade(base, gap * (0.86 + grain * 0.24) * grime(x, y, size, 12, 0.5));
  });

export const parquetNormal = (): THREE.Texture =>
  normalTexture('mansion.parquetN', SIZE, (x, y) => {
    const { gap, tone } = parquetAt(x, y);
    return gap < 1 ? 0 : 0.6 + tone * 0.4;
  }, 1.6);

export const BOARDS_TILE = 2.0;

/** Bare pine boards: the half of the house the family never saw. */
export const boards = (): THREE.Texture =>
  colorTexture('mansion.boards', SIZE, (x, y, size) => {
    const row = Math.floor(y / 32);
    const inRow = y % 32;
    const tone = hash1(row, 8, 811);
    const grain = n2s(x, y, size, 48, 4, 401, 3);
    const gap = inRow < 1 || inRow > 30 ? 0.4 : 1;
    // A nail every so often, punched into a plank end.
    const nail = (x + row * 61) % 128 < 3 && (inRow < 6 || inRow > 26) ? 0.55 : 1;
    const base = mix(rgb(0x7d6746), rgb(0xa38f6b), tone * 0.6 + grain * 0.5);
    return shade(base, gap * nail * (0.84 + grain * 0.3) * grime(x, y, size, 55, 0.55));
  });

export const MARBLE_TILE = 2.4;

/** Black-and-white chequer, cracked. The foyer, the bathroom, the conservatory. */
export const marbleCheck = (): THREE.Texture =>
  colorTexture('mansion.marble', SIZE, (x, y, size) => {
    const bx = Math.floor(x / 64);
    const by = Math.floor(y / 64);
    const dark = (bx + by) % 2 === 1;
    const vein = Math.abs(n2s(x, y, size, 6, 24, 909, 4) - 0.5) * 2;
    const grout = x % 64 < 2 || y % 64 < 2 ? 0.68 : 1;

    const base = dark
      ? mix(rgb(0x4f4d55), rgb(0x6a6871), Math.pow(1 - vein, 3))
      : mix(rgb(0xc9c3b4), rgb(0x9d998e), Math.pow(1 - vein, 4) * 0.9);
    return shade(base, grout * grime(x, y, size, 3, 0.6));
  });

export const CARPET_TILE = 3.0;

/** A faded Persian: crimson ground, cream lattice, worn through to the weave. */
export const carpet = (): THREE.Texture =>
  colorTexture('mansion.carpet', SIZE, (x, y, size) => {
    const u = (x % 128) / 128 - 0.5;
    const v = (y % 128) / 128 - 0.5;
    const r = Math.hypot(u, v);
    const a = Math.atan2(v, u);

    const medallion = r < 0.19 + 0.05 * Math.cos(8 * a) ? 1 : 0;
    const ring = Math.abs(r - 0.32) < 0.025 ? 1 : 0;
    const lattice = Math.abs(Math.cos(a * 4)) > 0.985 && r > 0.34 ? 1 : 0;
    const border = Math.min(Math.abs(u), Math.abs(v)) > 0.44 ? 1 : 0;

    const fibre = n2(x, y, size, 64, 5, 3);
    const wear = Math.max(0, n2(x, y, size, 4, 61, 3) - 0.52) * 2.4;

    let base: RGB = rgb(0x8e5148);
    if (medallion || ring) base = rgb(0xb2a077);
    else if (lattice) base = rgb(0x4f5a72);
    else if (border) base = rgb(0x6d3b36);

    return shade(mix(base, rgb(0x8a8074), Math.min(0.75, wear)), 0.82 + fibre * 0.34);
  });

export const TILE_TILE = 1.6;
const TILE_CELL = 32;

function tileAt(x: number, y: number): { grout: boolean; tone: number; cracked: boolean } {
  const bx = Math.floor(x / TILE_CELL);
  const by = Math.floor(y / TILE_CELL);
  const grout = x % TILE_CELL < 2 || y % TILE_CELL < 2;
  const tone = hash1(bx * 13 + by * 29, 64, 5501);
  return { grout, tone, cracked: tone > 0.94 };
}

/** Glazed white tile - kitchen, bathroom, the cold end of the house. */
export const wallTile = (): THREE.Texture =>
  colorTexture('mansion.tile', SIZE, (x, y, size) => {
    const { grout, tone, cracked } = tileAt(x, y);
    const soil = n2(x, y, size, 10, 1234, 3);
    if (grout) return shade(rgb(0x83857c), 0.8 + soil * 0.3);
    const base = mix(rgb(0xb8bcb2), rgb(0xd2d4cb), tone);
    return shade(base, (cracked ? 0.72 : 1) * (0.86 + soil * 0.24) * grime(x, y, size, 44, 0.45));
  });

export const wallTileNormal = (): THREE.Texture =>
  normalTexture('mansion.tileN', SIZE, (x, y) => (tileAt(x, y).grout ? 0 : 1), 2.4);

export const BRICK_TILE = 2.2;
const BRICK_W = 64;
const BRICK_H = 24;

function brickAt(x: number, y: number): { mortar: boolean; tone: number } {
  const row = Math.floor(y / BRICK_H);
  const shift = (row % 2) * (BRICK_W / 2);
  const bx = Math.floor((x + shift) / BRICK_W);
  const mortar = (x + shift) % BRICK_W < 3 || y % BRICK_H < 3;
  return { mortar, tone: hash1(bx * 7 + row * 23, 64, 991) };
}

/** Cellar and boiler-room brick, soot-blackened toward the top. */
export const brick = (): THREE.Texture =>
  colorTexture('mansion.brick', SIZE, (x, y, size) => {
    const { mortar, tone } = brickAt(x, y);
    const rough = n2(x, y, size, 32, 17, 3);
    if (mortar) return shade(rgb(0x9a968a), 0.78 + rough * 0.3);
    const base = mix(rgb(0x7b5346), rgb(0xa2725c), tone);
    return shade(base, (0.84 + rough * 0.3) * grime(x, y, size, 8, 0.8));
  });

export const brickNormal = (): THREE.Texture =>
  normalTexture('mansion.brickN', SIZE, (x, y) => (brickAt(x, y).mortar ? 0.1 : 0.85 + brickAt(x, y).tone * 0.15), 2.2);

export const STONE_TILE = 3.2;

/** Ashlar block. Chapel walls, cellar vaults, the cold foundations. */
export const stone = (): THREE.Texture =>
  colorTexture('mansion.stone', SIZE, (x, y, size) => {
    const row = Math.floor(y / 48);
    const jitter = hash1(row, 8, 4409) * 64;
    const joint = (x + jitter) % 96 < 3 || y % 48 < 3;
    const block = hash1(Math.floor((x + jitter) / 96) * 11 + row * 5, 64, 733);
    const pit = n2(x, y, size, 24, 88, 4);
    if (joint) return shade(rgb(0x7c7a72), 0.8 + pit * 0.25);
    return shade(mix(rgb(0x807e76), rgb(0x9d9b90), block), (0.86 + pit * 0.26) * grime(x, y, size, 21, 0.6));
  });

/* --- walls --------------------------------------------------------------------- */

export const PANEL_TILE = 1.8;

/** Walnut panelling and shelving - straight grain, no plank gaps. */
export const walnut = (): THREE.Texture =>
  colorTexture('mansion.walnut', SIZE, (x, y, size) => {
    const grain = n2s(x, y, size, 4, 64, 1201, 4);
    const figure = Math.abs(Math.sin(grain * 22)) * 0.35;
    const base = mix(rgb(0x5f4229), rgb(0x8a6540), grain * 0.7 + figure);
    return shade(base, (0.88 + grain * 0.22) * grime(x, y, size, 66, 0.35));
  });

export const DAMASK_TILE = 1.4;

/**
 * Damask wallpaper, half-drop repeat, peeling. `plasterUnder` shows through
 * wherever the paper has let go - the single most "abandoned" thing in the pack.
 */
function damaskRecipe(key: string, ground: number, motif: number, seed: number) {
  return (): THREE.Texture =>
    colorTexture(key, SIZE, (x, y, size) => {
      const drop = Math.floor(y / 64) % 2 === 1 ? 32 : 0;
      const u = ((x + drop) % 64) / 64 - 0.5;
      const v = (y % 64) / 64 - 0.5;
      const r = Math.hypot(u, v);
      const a = Math.atan2(v, u);

      // A quatrefoil with a stem: cheap, and unmistakably Edwardian.
      const petal = 0.16 + 0.13 * Math.abs(Math.cos(2 * a)) + 0.05 * Math.cos(6 * a);
      const inMotif = r < petal;
      const stem = Math.abs(u) < 0.018 && Math.abs(v) < 0.42;
      const stripe = (x % 16 < 1) ? 0.94 : 1;

      const paper = n2(x, y, size, 16, seed, 3);
      let base = inMotif || stem ? mix(rgb(motif), rgb(ground), 0.25) : rgb(ground);
      base = shade(base, stripe * (0.9 + paper * 0.2));

      // Peel: torn edges are bright, the plaster behind them is not.
      const tear = n2(x, y, size, 3, seed + 5, 4);
      if (tear > 0.63) {
        const depth = Math.min(1, (tear - 0.63) * 9);
        base = mix(base, rgb(0x9c9587), depth);
      }
      return shade(base, grime(x, y, size, seed + 9, 0.85));
    });
}

export const damaskGreen = damaskRecipe('mansion.damaskGreen', 0x5f6b52, 0xa39a63, 210);
export const damaskRed = damaskRecipe('mansion.damaskRed', 0x7a4a45, 0xb09566, 340);
export const damaskBlue = damaskRecipe('mansion.damaskBlue', 0x4f5b6b, 0x9aa3a8, 470);

export const PLASTER_TILE = 2.6;

/** Cracked lime plaster. Every room that has lost its paper. */
export const plaster = (): THREE.Texture =>
  colorTexture('mansion.plaster', SIZE, (x, y, size) => {
    const mottle = n2(x, y, size, 8, 130, 4);
    const crackField = n2(x, y, size, 4, 555, 3);
    const crack = Math.abs(crackField - 0.5) < 0.012 ? 0.55 : 1;
    const patch = n2(x, y, size, 2, 777, 2) > 0.62 ? 0.9 : 1;
    return shade(mix(rgb(0x8f8a7c), rgb(0xafa899), mottle), crack * patch * (0.9 + mottle * 0.18) * grime(x, y, size, 130, 0.7));
  });

export const CEILING_TILE = 3.0;

/** Ceiling plaster: paler, water-stained, sagging in the corners. */
export const ceilingPlaster = (): THREE.Texture =>
  colorTexture('mansion.ceiling', SIZE, (x, y, size) => {
    const mottle = n2(x, y, size, 8, 191, 4);
    const damp = n2(x, y, size, 3, 202, 3);
    const base = mix(rgb(0x9b9689), rgb(0xb7b1a2), mottle);
    return shade(damp > 0.56 ? mix(base, rgb(0x8a7d63), Math.min(0.8, (damp - 0.56) * 5)) : base, 0.92 + mottle * 0.14);
  });

/* --- special --------------------------------------------------------------------- */

/**
 * Four portraits in one 2x2 atlas, so a whole gallery wall costs one material and
 * merges into one mesh. Pick a quadrant with `subUV()`.
 */
export const portraits = (): THREE.Texture =>
  colorTexture('mansion.portraits', SIZE, (x, y, size) => {
    const qx = Math.floor(x / 128);
    const qy = Math.floor(y / 128);
    const seed = 1000 + qx * 37 + qy * 91;
    const u = (x % 128) / 128;
    const v = (y % 128) / 128;

    const craquelure = n2(x, y, size, 64, 606, 2);
    const varnish = 0.86 + n2(x, y, size, 6, seed, 3) * 0.28;

    // Sitter: a pale oval and a suggestion of shoulders, floating in bitumen.
    const faceY = 0.34 + (seed % 5) * 0.012;
    const face = Math.hypot((u - 0.5) / 0.13, (v - faceY) / 0.17);
    const shoulders = v > faceY + 0.16 && Math.hypot((u - 0.5) / 0.36, (v - 0.95) / 0.44) < 1;

    let base: RGB = mix(rgb(0x4a4238), rgb(0x2e2a26), v);
    if (shoulders) base = mix(rgb(0x413a44), rgb(0x2f2b33), u);
    if (face < 1) {
      const lit = 1 - Math.max(0, u - 0.46) * 1.6;
      base = mix(rgb(0x8f7a63), rgb(0xc4ab8e), Math.max(0, lit));
      // Eyes. They are the whole point of a portrait gallery.
      const eye = Math.min(Math.hypot(u - 0.455, v - faceY + 0.01), Math.hypot(u - 0.545, v - faceY + 0.01));
      if (eye < 0.016) base = rgb(0x2a2622);
    }
    return shade(base, varnish * (craquelure > 0.72 ? 0.82 : 1));
  });

export const STAINED_TILE = 2.6;

/**
 * Leaded stained glass, used as BOTH albedo and emissive map so a chapel window
 * glows without spending one of the room's two real lights.
 */
export const stainedGlass = (): THREE.Texture =>
  colorTexture('mansion.stained', SIZE, (x, y, size) => {
    const u = x / size - 0.5;
    const v = y / size - 0.5;
    const r = Math.hypot(u, v);
    const a = Math.atan2(v, u);

    const lead = Math.abs(((a / Math.PI) * 6) % 1 - 0.5) > 0.46 || Math.abs(r % 0.11 - 0.055) > 0.048;
    if (lead) return rgb(0x2f3138);

    const petal = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12);
    const ring = Math.floor(r / 0.11);
    const pick = (petal * 3 + ring * 5) % 5;
    const jewel: RGB =
      pick === 0 ? rgb(0xc4433f) : pick === 1 ? rgb(0x3f6bb0) : pick === 2 ? rgb(0xd8a63c) : pick === 3 ? rgb(0x3f8f6a) : rgb(0xb9b0a0);
    return shade(jewel, 0.82 + n2(x, y, size, 32, 313, 2) * 0.3);
  });

/** Mildewed canvas: dust sheets, sacking, the tarpaulins in the attic. */
export const CANVAS_TILE = 2.2;
export const dustCanvas = (): THREE.Texture =>
  colorTexture('mansion.canvas', SIZE, (x, y, size) => {
    const weave = (x % 3 === 0 ? 0.94 : 1) * (y % 3 === 0 ? 0.96 : 1);
    const mould = n2(x, y, size, 6, 262, 4);
    const base = mix(rgb(0xa8a394), rgb(0x8d8a7a), mould);
    return shade(mould > 0.6 ? mix(base, rgb(0x6f7560), (mould - 0.6) * 2) : base, weave * (0.9 + mould * 0.16));
  });
