/**
 * The hat library's own materials.
 *
 * Hats are the second piece of shared art that brings its own materials rather
 * than asking the pack for them - `vfx.throwArc` is the other, and the reason
 * is the same in spirit: neither is a thing standing in the world that a map is
 * entitled to theme. A player **bought** a top hat. It has to be that top hat
 * in the manor, in the leviathan and in the cabin, or the shop is lying. On top
 * of that, a themeable hat roster would mean adding two dozen material names to
 * every pack every time a hat ships, which is exactly the kind of tax that
 * stops new hats being cheap.
 *
 * Cached at module scope and never disposed, like the texture cache: one set is
 * shared by every hat on every head in the run, and the next run reuses it.
 */
import * as THREE from 'three';
import type { MaterialLibrary } from '../../lib/contract';
import { materialLibrary } from '../../lib/build';
import { fbm, normalTexture } from '../../lib/textures';

interface Opts {
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  opacity?: number;
  side?: THREE.Side;
  normalMap?: () => THREE.Texture;
  flat?: boolean;
}

function standard(color: number, opts: Opts = {}): () => THREE.Material {
  return () => {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.85,
      metalness: opts.metalness ?? 0,
      flatShading: opts.flat ?? false,
    });
    if (opts.emissive !== undefined) {
      material.emissive = new THREE.Color(opts.emissive);
      material.emissiveIntensity = opts.emissiveIntensity ?? 1;
    }
    if (opts.opacity !== undefined) {
      material.transparent = true;
      material.opacity = opts.opacity;
    }
    if (opts.side) material.side = opts.side;
    if (opts.normalMap) material.normalMap = opts.normalMap();
    return material;
  };
}

/** Unlit, so a flame or a halo survives being in an unlit corridor. */
const glow = (color: number, opacity = 1): (() => THREE.Material) => () =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    fog: true,
  });

/* --- surfaces worth a map ----------------------------------------------------- */

/** Chunky knit: two crossing rows of loops, deep enough to catch a rim light. */
const knit = (): THREE.Texture =>
  normalTexture(
    'hat.knit',
    128,
    (x, y, size) => {
      const u = (x / size) * 14;
      const v = (y / size) * 11;
      const row = Math.floor(v);
      // Every other row is offset half a stitch, which is what a knit does.
      const stitch = Math.sin((u + (row % 2) * 0.5) * Math.PI * 2);
      const loop = Math.sin(v * Math.PI * 2);
      return stitch * 0.5 + loop * 0.35;
    },
    2.4,
  );

/** Felt nap: no pattern at all, just a fine tooth so it is never a plastic shell. */
const nap = (): THREE.Texture =>
  normalTexture(
    'hat.nap',
    128,
    (x, y, size) => fbm((x / size) * 26, (y / size) * 26, 26, 26, 4409, 3) - 0.5,
    1.1,
  );

let cached: MaterialLibrary | null = null;

/** The one library, built on first use. */
export function hatMaterials(): MaterialLibrary {
  if (cached) return cached;

  cached = materialLibrary({
    /* --- cloth and leather ---------------------------------------------- */
    felt: standard(0x24242a, { roughness: 0.96, normalMap: nap }),
    // Light enough to read AS brown in an unlit corridor. The first pass was
    // 0x4a3a2a and the cowboy hat came out indistinguishable from the top hat.
    feltBrown: standard(0x6b5238, { roughness: 0.95, normalMap: nap }),
    tweed: standard(0x6f6650, { roughness: 0.97, normalMap: nap }),
    wool: standard(0x9c5a4c, { roughness: 1, normalMap: knit }),
    woolPale: standard(0xd9d2c1, { roughness: 1, normalMap: knit }),
    silk: standard(0x14141a, { roughness: 0.24 }),
    leather: standard(0x6a4a30, { roughness: 0.62 }),
    fabricRed: standard(0xb0413a, { roughness: 0.9 }),
    fabricBlue: standard(0x3a5d8c, { roughness: 0.9 }),
    paper: standard(0xd8d5ca, { roughness: 0.95 }),

    /* --- metals and stones ------------------------------------------------ */
    brass: standard(0xb8964e, { roughness: 0.3, metalness: 0.85 }),
    steel: standard(0x9aa0aa, { roughness: 0.34, metalness: 0.8 }),
    gold: standard(0xd0a94a, { roughness: 0.2, metalness: 0.95 }),
    gem: standard(0x9c2f45, { roughness: 0.08, metalness: 0.2, emissive: 0x4a0f1c, emissiveIntensity: 0.6 }),

    /* --- plastics --------------------------------------------------------- */
    safety: standard(0xe0a92a, { roughness: 0.36 }),
    cone: standard(0xd85a1e, { roughness: 0.5 }),
    reflective: standard(0xe8e6dd, { roughness: 0.3, emissive: 0xbdbcb2, emissiveIntensity: 0.4 }),
    duck: standard(0xf2c73a, { roughness: 0.44 }),
    beak: standard(0xe2822c, { roughness: 0.44 }),
    eye: standard(0x14141a, { roughness: 0.25 }),

    /* --- edible ----------------------------------------------------------- */
    sponge: standard(0xb9834f, { roughness: 0.98, flat: true }),
    frosting: standard(0xeaa2bc, { roughness: 0.55 }),
    wax: standard(0xe9e3d0, { roughness: 0.6 }),

    /* --- weather ---------------------------------------------------------- */
    cloud: standard(0xa8afbd, { roughness: 1, flat: true }),
    cloudDark: standard(0x6f7686, { roughness: 1, flat: true }),
    rain: standard(0x8fc4e2, { roughness: 0.1, opacity: 0.55 }),

    /* --- things that make their own light --------------------------------- */
    flame: glow(0xffb45a),
    lamp: glow(0xfff0c4),
    halo: glow(0xffdc86, 0.92),
    haloSoft: glow(0xffe6a8, 0.2),
    beam: glow(0xffeeb8, 0.13),
    spark: glow(0xbdf0ff),
    antennaGlow: glow(0x86f0a8),
  });

  return cached;
}
