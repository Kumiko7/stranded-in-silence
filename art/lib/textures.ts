/**
 * Procedural textures, generated as raw pixel data.
 *
 * Three rules, all of them load-bearing:
 *
 * 1. **No canvas.** Textures are built into a `Uint8Array` and handed to a
 *    `THREE.DataTexture`. `document.createElement('canvas')` would work in a
 *    browser and explode in `scripts/validateArt.mjs`, which builds every room
 *    headless in Node. Art must be buildable without a DOM or a GL context.
 * 2. **No `Math.random()`.** Every value comes from `hash2()`, so two peers
 *    generate byte-identical textures.
 * 3. **Cached at module scope.** A texture is generated once per process and
 *    shared by every material and every world that asks for it, exactly like the
 *    geometry cache in `build.ts`. `MaterialLibrary.dispose()` deliberately does
 *    not dispose these - the next run reuses them.
 *
 * Texel density is in metres: a texture is authored to tile over `tileMetres`
 * of surface, and `merge.ts` bakes UVs in world units so every surface in a room
 * matches without anyone setting `texture.repeat`.
 */
import * as THREE from 'three';

export type RGB = readonly [number, number, number];

/* --- deterministic noise ---------------------------------------------------- */

/** Integer hash → [0,1). Same inputs, same output, on every machine. */
function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

const wrap = (v: number, p: number): number => ((v % p) + p) % p;

/**
 * Value noise on a lattice that wraps every `px` / `py` cells, so the texture
 * tiles seamlessly. The two periods are separate because stretched noise - wood
 * grain, water running down a wall - is anisotropic, and a single period would
 * put a visible seam down one edge.
 */
function valueNoise(x: number, y: number, px: number, py: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = smooth(x - x0);
  const sy = smooth(y - y0);

  const a = hash2(wrap(x0, px), wrap(y0, py), seed);
  const b = hash2(wrap(x0 + 1, px), wrap(y0, py), seed);
  const c = hash2(wrap(x0, px), wrap(y0 + 1, py), seed);
  const d = hash2(wrap(x0 + 1, px), wrap(y0 + 1, py), seed);

  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

/**
 * Fractal value noise in roughly [0,1). Coordinates are in lattice units, and
 * `px`/`py` are the periods those coordinates wrap at - pass the same numbers
 * you scaled by and the result tiles.
 */
export function fbm(x: number, y: number, px: number, py: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, px * frequency, py * frequency, seed + i * 101);
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum;
}

/** Deterministic scalar per integer index, wrapping at `period`. */
export function hash1(i: number, period: number, seed: number): number {
  return hash2(wrap(Math.floor(i), period), 0, seed);
}

/* --- small colour maths ----------------------------------------------------- */

export const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/** Split `#rrggbb` into bytes. */
export function rgb(hex: number): RGB {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function shade(c: RGB, factor: number): RGB {
  return [clamp255(c[0] * factor), clamp255(c[1] * factor), clamp255(c[2] * factor)];
}

/* --- texture construction --------------------------------------------------- */

const cache = new Map<string, THREE.Texture>();

function finish(texture: THREE.DataTexture, srgb: boolean): THREE.DataTexture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Builds (or returns the cached) colour texture. `shader(x, y, size)` returns the
 * pixel colour in bytes.
 */
export function colorTexture(key: string, size: number, shader: (x: number, y: number, size: number) => RGB): THREE.Texture {
  const cached = cache.get(key);
  if (cached) return cached;

  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = shader(x, y, size);
      const i = (y * size + x) * 4;
      data[i] = clamp255(c[0]);
      data[i + 1] = clamp255(c[1]);
      data[i + 2] = clamp255(c[2]);
      data[i + 3] = 255;
    }
  }
  const texture = finish(new THREE.DataTexture(data, size, size, THREE.RGBAFormat), true);
  cache.set(key, texture);
  return texture;
}

/** Single-channel data written to all three channels: roughness, AO, metalness. */
export function dataTexture(key: string, size: number, shader: (x: number, y: number, size: number) => number): THREE.Texture {
  const cached = cache.get(key);
  if (cached) return cached;

  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = clamp255(shader(x, y, size) * 255);
      const i = (y * size + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const texture = finish(new THREE.DataTexture(data, size, size, THREE.RGBAFormat), false);
  cache.set(key, texture);
  return texture;
}

/** Tangent-space normal map derived from a height field by central differences. */
export function normalTexture(
  key: string,
  size: number,
  height: (x: number, y: number, size: number) => number,
  strength = 2,
): THREE.Texture {
  const cached = cache.get(key);
  if (cached) return cached;

  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = height(x, y, size);

  const at = (x: number, y: number): number => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)] ?? 0;

  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = clamp255((dx / len * 0.5 + 0.5) * 255);
      data[i + 1] = clamp255((dy / len * 0.5 + 0.5) * 255);
      data[i + 2] = clamp255((1 / len * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const texture = finish(new THREE.DataTexture(data, size, size, THREE.RGBAFormat), false);
  cache.set(key, texture);
  return texture;
}

/** Frees every cached texture. Only the validator and teardown need this. */
export function disposeTextureCache(): void {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}
