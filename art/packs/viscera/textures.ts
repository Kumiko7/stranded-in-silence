/**
 * The Leviathan's surfaces, generated as procedural pixel data.
 *
 * Same three rules as everywhere else in art (art/lib/textures.ts): no canvas, no
 * `Math.random()`, cached at module scope. Every recipe below is a pure function
 * of pixel coordinates, so a room builds identically in a browser, on a peer's
 * machine, and headless inside `scripts/validateArt.mjs`.
 *
 * `*_TILE` is the size in METRES that one repeat covers. `merge.ts` bakes UVs in
 * world units, so a texture keeps its density whether it lands on a 0.3 m rib or
 * an 8 m stomach floor.
 *
 * The pack splits down the middle: **wet** surfaces (flesh, muscle, gut, cortex,
 * mucosa) are warm, saturated and low-roughness; **calcified** surfaces (bone,
 * suture plate, chitin, cartilage, scute, enamel) are cool, desaturated and dry.
 * A zone reads as one or the other within a second of walking into it, which is
 * the whole point of having both.
 *
 * Albedos are mid-tones. Colour is converted to linear space before lighting,
 * where a near-black picked in a colour wheel is effectively 0 and no amount of
 * bioluminescence brings it back. The beast is dark because of the lighting and
 * the fog, not because the meat is black.
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

/**
 * Ridged noise: 1 exactly on the zero-crossing of a noise field, 0 away from it.
 * One function does capillaries, cranial sutures, muscle fascia and the fibres
 * in cartilage - it is the single most useful primitive in the pack.
 */
const vein = (n: number, width: number): number => Math.max(0, 1 - Math.abs(n - 0.5) / width);

/** Wet patches, dried crust and old staining. Returns a multiplier around 1. */
function soil(x: number, y: number, size: number, seed: number, strength: number): number {
  const runs = n2s(x, y, size, 6, 3, seed, 4);
  const blotch = n2(x, y, size, 7, seed + 47, 3);
  return 1 - Math.max(0, runs - 0.54) * strength * 1.5 - Math.max(0, blotch - 0.58) * strength;
}

/* --- shared maps ---------------------------------------------------------------- */

/**
 * Wet roughness. Flesh is never uniformly glossy - it pools and dries in
 * patches, and that variation is most of what makes a surface read as *alive*
 * rather than as painted plastic.
 */
export const wetRoughness = (): THREE.Texture =>
  dataTexture('viscera.wetRough', 128, (x, y, size) => 0.18 + Math.pow(n2(x, y, size, 7, 611), 1.6) * 0.62);

/** Dry roughness, for everything calcified. Pitted rather than pooled. */
export const dryRoughness = (): THREE.Texture =>
  dataTexture('viscera.dryRough', 128, (x, y, size) => 0.62 + n2(x, y, size, 12, 733) * 0.4);

/* --- wet: the meat of the thing --------------------------------------------------- */

export const FLESH_TILE = 2.4;

/** Per-pixel flesh decomposition, shared by the colour and the height pass. */
function fleshAt(x: number, y: number, size: number): { mottle: number; big: number; small: number; scar: number } {
  const mottle = n2(x, y, size, 6, 1301, 4);
  // Two vein networks at different scales: cords you can see across a room, and
  // the capillary web you only find when you put your face against the wall.
  const big = vein(n2(x, y, size, 3, 1409, 3), 0.055);
  const small = vein(n2(x, y, size, 11, 1511, 3), 0.09);
  const scar = Math.max(0, n2s(x, y, size, 2, 9, 1607, 3) - 0.6) * 2.5;
  return { mottle, big, small, scar };
}

/** Raw wall flesh: mottled meat under a capillary net, healed over in ridges. */
export const flesh = (): THREE.Texture =>
  colorTexture('viscera.flesh', SIZE, (x, y, size) => {
    const { mottle, big, small, scar } = fleshAt(x, y, size);
    let base = mix(rgb(0x7d4247), rgb(0xa8686a), mottle * 0.9);
    // Capillaries sit *under* the surface, so they darken rather than draw on it.
    base = mix(base, rgb(0x53222e), big * 0.75);
    base = mix(base, rgb(0x93404a), small * 0.4);
    // Scar tissue: paler, tighter, and the only cool colour in the recipe.
    base = mix(base, rgb(0xac9a8e), Math.min(0.7, scar));
    return shade(base, (0.88 + mottle * 0.22) * soil(x, y, size, 19, 0.4));
  });

export const fleshNormal = (): THREE.Texture =>
  normalTexture(
    'viscera.fleshN',
    SIZE,
    (x, y, size) => {
      const { mottle, big, small } = fleshAt(x, y, size);
      return mottle * 0.5 + big * 0.55 + small * 0.2;
    },
    2.2,
  );

export const MUSCLE_TILE = 1.7;

/**
 * Striated muscle. Fascicles run one way and are bundled by fascia, which is
 * what makes a muscle wall read as *pulling* in a direction rather than as
 * wallpaper with a red tint.
 *
 * The colour is doing something specific. An earlier pass had wide tan fascia
 * over brown fibre and came out looking exactly like planed wood - vertical
 * grain in warm brown is timber to the eye, whatever the author meant. Fixing
 * it needed the fibres finer and lower-contrast, the mid-tones pushed off
 * brown and into red, and a capillary net over the top, which is the one thing
 * timber never has.
 */
export const muscle = (): THREE.Texture =>
  colorTexture('viscera.muscle', SIZE, (x, y, size) => {
    // Long thin noise along Y = fibres. Wobbled in X so they are not a comb.
    const wobble = n2s(x, y, size, 3, 12, 2203, 3) * 14;
    const fibre = n2s(x + wobble, y, size, 64, 4, 2311, 2);
    const bundle = n2s(x + wobble * 0.4, y, size, 7, 2, 2417, 3);
    const fascia = vein(bundle, 0.045);
    const capillary = vein(n2(x, y, size, 10, 2521, 3), 0.075);

    let base = mix(rgb(0x8f353f), rgb(0xc2786f), fibre * 0.6 + bundle * 0.45);
    base = mix(base, rgb(0xd6bda6), fascia * 0.42);
    base = mix(base, rgb(0x611f2c), Math.max(0, 0.36 - fibre) * 1.5);
    base = mix(base, rgb(0x8e2536), capillary * 0.45);
    return shade(base, (0.9 + fibre * 0.18) * soil(x, y, size, 71, 0.3));
  });

export const muscleNormal = (): THREE.Texture =>
  normalTexture(
    'viscera.muscleN',
    SIZE,
    (x, y, size) => {
      const wobble = n2s(x, y, size, 3, 12, 2203, 3) * 12;
      return n2s(x + wobble, y, size, 40, 3, 2311, 2) * 0.8 + n2s(x, y, size, 7, 2, 2417, 3) * 0.3;
    },
    2.6,
  );

export const GUT_TILE = 1.9;

/** Villous gut lining: a floor of tiny wet fingers, greasy and slightly sweet. */
export const gut = (): THREE.Texture =>
  colorTexture('viscera.gut', SIZE, (x, y, size) => {
    // Jittered lattice of villi. Each cell gets its own centre and its own tone.
    const cell = 9;
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    let best = 9;
    let tone = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const jx = hash1((gx + dx) * 31 + (gy + dy) * 17, 128, 3301);
        const jy = hash1((gx + dx) * 53 + (gy + dy) * 7, 128, 3407);
        const cx = (gx + dx + jx) * cell;
        const cy = (gy + dy + jy) * cell;
        const d = Math.hypot(x - cx, y - cy) / cell;
        if (d < best) {
          best = d;
          tone = hash1((gx + dx) * 13 + (gy + dy) * 29, 64, 3511);
        }
      }
    }

    const crest = Math.max(0, 1 - best * 1.9);
    const grease = n2(x, y, size, 5, 3607, 3);
    let base = mix(rgb(0x6d3a30), rgb(0xb0855f), crest * 0.9 + tone * 0.25);
    base = mix(base, rgb(0xc9a878), Math.max(0, crest - 0.62) * 1.8);
    return shade(base, (0.84 + grease * 0.3) * soil(x, y, size, 23, 0.5));
  });

export const gutNormal = (): THREE.Texture =>
  normalTexture(
    'viscera.gutN',
    SIZE,
    (x, y) => {
      const cell = 9;
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      let best = 9;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const jx = hash1((gx + dx) * 31 + (gy + dy) * 17, 128, 3301);
          const jy = hash1((gx + dx) * 53 + (gy + dy) * 7, 128, 3407);
          const d = Math.hypot(x - (gx + dx + jx) * cell, y - (gy + dy + jy) * cell) / cell;
          if (d < best) best = d;
        }
      }
      return Math.max(0, 1 - best * 1.9);
    },
    2.4,
  );

export const MEMBRANE_TILE = 2.8;

/**
 * Thin membrane, stretched over something. Pale, nearly translucent, and mapped
 * with a branching vein tracery so a backlit sac reads as a lung and not as a
 * lampshade.
 */
export const membrane = (): THREE.Texture =>
  colorTexture('viscera.membrane', SIZE, (x, y, size) => {
    const sheen = n2(x, y, size, 4, 4103, 3);
    const trunk = vein(n2(x, y, size, 2.5, 4211, 3), 0.045);
    const branch = vein(n2(x, y, size, 8, 4327, 3), 0.075);
    const stretch = Math.max(0, n2s(x, y, size, 14, 4, 4409, 2) - 0.55) * 1.6;

    let base = mix(rgb(0x9d8b90), rgb(0xc8b8b0), sheen * 0.85 + stretch * 0.4);
    base = mix(base, rgb(0x6b3f4c), trunk * 0.8);
    base = mix(base, rgb(0x8b5a5e), branch * 0.45);
    return shade(base, 0.9 + sheen * 0.18);
  });

export const CORTEX_TILE = 1.5;

/**
 * Cerebral folds. The gyri are the ridges of a noise field walked twice - once
 * for the winding, once for the depth - so they meander the way a real cortex
 * does instead of looking like a fingerprint stamp.
 */
function cortexAt(x: number, y: number, size: number): { fold: number; sulcus: number } {
  const warpX = n2(x, y, size, 3, 5101, 2) * 26;
  const warpY = n2(x, y, size, 3, 5209, 2) * 26;
  const field = n2(x + warpX, y + warpY, size, 5, 5303, 3);
  const band = Math.abs(((field * 6) % 1) - 0.5) * 2;
  return { fold: 1 - band, sulcus: Math.max(0, band - 0.55) * 2.2 };
}

export const cortex = (): THREE.Texture =>
  colorTexture('viscera.cortex', SIZE, (x, y, size) => {
    const { fold, sulcus } = cortexAt(x, y, size);
    const skin = n2(x, y, size, 20, 5407, 2);
    let base = mix(rgb(0x8a6a63), rgb(0xb99a8c), fold * 0.95);
    base = mix(base, rgb(0x4f3736), Math.min(0.85, sulcus));
    // Pia mater: the fine vessels lying on top of the folds.
    base = mix(base, rgb(0x9c4a4e), vein(n2(x, y, size, 9, 5501, 3), 0.05) * 0.5);
    return shade(base, (0.88 + skin * 0.2) * soil(x, y, size, 53, 0.3));
  });

export const cortexNormal = (): THREE.Texture =>
  normalTexture('viscera.cortexN', SIZE, (x, y, size) => cortexAt(x, y, size).fold, 2.8);

export const MUCOSA_TILE = 1.7;

/**
 * The floor of a wet zone: meat under standing fluid. The pools are darker,
 * hard-edged and far smoother than the flesh around them, which is what sells
 * "you are walking in something" without a single transparent surface.
 *
 * The tile is small (1.7 m) on purpose. At the 2.6 m it started on, an 8 m
 * floor showed barely three repeats and read as one flat brown plane from
 * standing height - a floor needs detail at the scale of a footstep.
 */
export const mucosa = (): THREE.Texture =>
  colorTexture('viscera.mucosa', SIZE, (x, y, size) => {
    const meat = n2(x, y, size, 9, 6101, 4);
    const pool = n2(x, y, size, 4, 6203, 3);
    const strand = vein(n2s(x, y, size, 6, 15, 6301, 3), 0.045);
    const grain = n2(x, y, size, 28, 6421, 2);

    let base = mix(rgb(0x6b3a3c), rgb(0xa06a5a), meat * 0.95);
    base = mix(base, rgb(0x8d4a41), strand * 0.4);
    base = mix(base, rgb(0xbb907a), Math.max(0, grain - 0.66) * 1.7);
    // Standing fluid: a hard edge, then near-black under it.
    if (pool > 0.5) base = mix(base, rgb(0x2e1a22), Math.min(0.92, (pool - 0.5) * 5.5));
    return shade(base, 0.84 + meat * 0.3);
  });

export const CEILING_TILE = 3.0;

/** The roof over a wet zone: sagging, damp, a shade paler than the walls. */
export const fleshCeiling = (): THREE.Texture =>
  colorTexture('viscera.fleshCeiling', SIZE, (x, y, size) => {
    const sag = n2(x, y, size, 5, 7101, 4);
    const damp = n2(x, y, size, 3, 7207, 3);
    const web = vein(n2(x, y, size, 6, 7309, 3), 0.06);
    let base = mix(rgb(0x77494a), rgb(0x9e7168), sag * 0.9);
    base = mix(base, rgb(0x50303a), web * 0.6);
    if (damp > 0.56) base = mix(base, rgb(0x5c4a3f), Math.min(0.8, (damp - 0.56) * 4));
    return shade(base, 0.9 + sag * 0.18);
  });

/* --- calcified: what is left when the wet dries ----------------------------------- */

export const BONE_TILE = 2.6;

function boneAt(x: number, y: number, size: number): { grain: number; pore: number; crack: number } {
  const grain = n2(x, y, size, 9, 8101, 4);
  const pore = Math.max(0, n2(x, y, size, 34, 8209, 2) - 0.62) * 2.6;
  const crack = vein(n2(x, y, size, 4, 8311, 3), 0.014);
  return { grain, pore, crack };
}

/** Old bone: ivory gone yellow, pitted with foramina and finely cracked. */
export const bone = (): THREE.Texture =>
  colorTexture('viscera.bone', SIZE, (x, y, size) => {
    const { grain, pore, crack } = boneAt(x, y, size);
    let base = mix(rgb(0x9a9078), rgb(0xc7bda0), grain * 0.9);
    base = mix(base, rgb(0x6d6047), Math.min(0.9, pore));
    base = mix(base, rgb(0x5f5540), crack * 0.7);
    return shade(base, (0.9 + grain * 0.16) * soil(x, y, size, 89, 0.45));
  });

export const boneNormal = (): THREE.Texture =>
  normalTexture(
    'viscera.boneN',
    SIZE,
    (x, y, size) => {
      const { grain, pore, crack } = boneAt(x, y, size);
      return grain * 0.4 - pore * 0.5 - crack * 0.6 + 0.5;
    },
    2.0,
  );

export const SUTURE_TILE = 3.2;

/**
 * Cranial plate: big slabs of bone locked together along jagged sutures. The
 * seam is a noise ridge wobbled at high frequency, which is what gives it the
 * interlocking jigsaw bite a straight mortar line never has.
 */
function sutureAt(x: number, y: number, size: number): { seam: number; plate: number } {
  const wobble = n2(x, y, size, 26, 9103, 2) * 5;
  const field = n2(x + wobble, y + wobble, size, 2.5, 9209, 2);
  const seam = vein(field, 0.03);
  const plate = hash1(Math.floor(field * 9), 32, 9311);
  return { seam, plate };
}

export const suture = (): THREE.Texture =>
  colorTexture('viscera.suture', SIZE, (x, y, size) => {
    const { seam, plate } = sutureAt(x, y, size);
    const grain = n2(x, y, size, 12, 9403, 3);
    let base = mix(rgb(0x958b74), rgb(0xbfb59a), plate * 0.7 + grain * 0.4);
    base = mix(base, rgb(0x5c5240), Math.min(1, seam * 1.2));
    return shade(base, (0.88 + grain * 0.2) * soil(x, y, size, 97, 0.5));
  });

export const sutureNormal = (): THREE.Texture =>
  normalTexture('viscera.sutureN', SIZE, (x, y, size) => 0.7 - sutureAt(x, y, size).seam * 0.7, 2.2);

export const CHITIN_TILE = 1.9;

function chitinAt(x: number, y: number, size: number): { bevel: number; lamella: number; tint: number } {
  // Segmented plates, each with a bevelled edge - the segmentation is horizontal
  // because a carapace is banded across the body, not tiled like brick.
  const bandH = 42;
  const row = Math.floor(y / bandH);
  const shift = hash1(row, 16, 10103) * 64;
  const plateW = 74;
  const inRow = y % bandH;
  const inPlate = (x + shift) % plateW;
  const edge =
    Math.min(inRow, bandH - inRow) < 3 || Math.min(inPlate, plateW - inPlate) < 3 ? 1 : 0;
  const bevel =
    Math.min(Math.min(inRow, bandH - inRow), Math.min(inPlate, plateW - inPlate)) / 9;
  const lamella = Math.abs(((inRow / bandH) * 7) % 1 - 0.5) * 2;
  return { bevel: edge ? 0 : Math.min(1, bevel), lamella, tint: hash1(row * 7 + Math.floor((x + shift) / plateW) * 13, 64, 10211) };
}

/** Hardened shell: lacquered plates, banded, with an oily colour shift. */
export const chitin = (): THREE.Texture =>
  colorTexture('viscera.chitin', SIZE, (x, y, size) => {
    const { bevel, lamella, tint } = chitinAt(x, y, size);
    const grain = n2(x, y, size, 16, 10303, 3);
    // The iridescence: a plate leans blue or bronze, never both.
    const cool = mix(rgb(0x515d6b), rgb(0x6c7a86), grain);
    const warm = mix(rgb(0x6a5340), rgb(0x8a6c4c), grain);
    let base = mix(cool, warm, tint);
    base = shade(base, 0.55 + bevel * 0.65);
    base = mix(base, rgb(0x2f2a2c), (1 - lamella) * 0.12);
    return shade(base, (0.9 + grain * 0.2) * soil(x, y, size, 41, 0.35));
  });

export const chitinNormal = (): THREE.Texture =>
  normalTexture('viscera.chitinN', SIZE, (x, y, size) => chitinAt(x, y, size).bevel, 2.6);

export const CARTILAGE_TILE = 2.2;

/**
 * Petrified cartilage: translucent, fibrous, and the only pale-cool surface in
 * the pack. Lacunae - the little cavities where the cells used to live - are
 * what stop it reading as frosted glass.
 */
export const cartilage = (): THREE.Texture =>
  colorTexture('viscera.cartilage', SIZE, (x, y, size) => {
    const milk = n2(x, y, size, 6, 11003, 4);
    const fibre = vein(n2s(x, y, size, 4, 22, 11113, 3), 0.09);
    const lacunae = Math.max(0, n2(x, y, size, 30, 11213, 2) - 0.66) * 3;

    let base = mix(rgb(0x9fa8a4), rgb(0xcdd2c8), milk * 0.95);
    base = mix(base, rgb(0xb6bfb4), fibre * 0.5);
    base = mix(base, rgb(0x6c7472), Math.min(0.8, lacunae));
    return shade(base, (0.9 + milk * 0.16) * soil(x, y, size, 61, 0.3));
  });

export const SCUTE_TILE = 1.4;

function scuteAt(x: number, y: number): { rim: number; body: number; tone: number } {
  // Overlapping scales, offset row to row, each a rounded lens.
  const rowH = 26;
  const colW = 34;
  const row = Math.floor(y / rowH);
  const offset = (row % 2) * (colW / 2);
  const col = Math.floor((x + offset) / colW);
  const lx = ((x + offset) % colW) / colW - 0.5;
  const ly = (y % rowH) / rowH;
  // A lens: wide at the top of the cell, tapering to the tip at the bottom.
  const d = Math.hypot(lx * 2.05, (ly - 0.15) * 1.25);
  return { rim: Math.max(0, 1 - Math.abs(d - 0.95) * 7), body: Math.max(0, 1 - d), tone: hash1(col * 17 + row * 41, 64, 12007) };
}

/** Shed scutes: overlapping armour, bronze-olive, worn pale at the edges. */
export const scute = (): THREE.Texture =>
  colorTexture('viscera.scute', SIZE, (x, y, size) => {
    const { rim, body, tone } = scuteAt(x, y);
    const grain = n2(x, y, size, 18, 12101, 3);
    let base = mix(rgb(0x5f5a45), rgb(0x8e8666), body * 0.85 + tone * 0.35);
    base = mix(base, rgb(0xaba184), rim * 0.7);
    base = mix(base, rgb(0x3c3a30), Math.max(0, 0.18 - body) * 3);
    return shade(base, (0.88 + grain * 0.22) * soil(x, y, size, 37, 0.4));
  });

export const scuteNormal = (): THREE.Texture =>
  normalTexture('viscera.scuteN', SIZE, (x, y) => scuteAt(x, y).body, 2.4);

export const ENAMEL_TILE = 1.0;

/** Tooth enamel: near-white, streaked down its length with old staining. */
export const enamel = (): THREE.Texture =>
  colorTexture('viscera.enamel', SIZE, (x, y, size) => {
    const streak = n2s(x, y, size, 26, 3, 13001, 3);
    const stain = Math.max(0, n2s(x, y, size, 5, 2, 13109, 3) - 0.5) * 1.7;
    const chip = Math.max(0, n2(x, y, size, 22, 13217, 2) - 0.7) * 2;
    let base = mix(rgb(0xb6b2a0), rgb(0xdedac6), streak * 0.9);
    base = mix(base, rgb(0x8d7a56), Math.min(0.7, stain));
    base = mix(base, rgb(0x6f6a5c), Math.min(0.6, chip));
    return shade(base, 0.92 + streak * 0.14);
  });

export const MARROW_TILE = 1.8;

/** Trabecular marrow: a sponge of bone struts with something red still in it. */
export const marrow = (): THREE.Texture =>
  colorTexture('viscera.marrow', SIZE, (x, y, size) => {
    const strut = vein(n2(x, y, size, 10, 14003, 3), 0.13) + vein(n2(x, y, size, 19, 14107, 2), 0.09) * 0.7;
    const deep = n2(x, y, size, 6, 14211, 3);
    let base = mix(rgb(0x6e2f2c), rgb(0x9a4a38), deep * 0.9);
    base = mix(base, rgb(0xbcb094), Math.min(1, strut * 0.9));
    return shade(base, 0.86 + deep * 0.26);
  });

export const COMB_TILE = 1.2;

function combAt(x: number, y: number): { wall: number; depth: number; tone: number } {
  // Hex lattice by folding into a rectangle twice the row height.
  const R = 20;
  const w = R * 1.732;
  const h = R * 1.5;
  const row = Math.floor(y / h);
  const offset = (row % 2) * (w / 2);
  const cx = ((x + offset) % w) - w / 2;
  const cy = (y % h) - h / 2;
  // Distance to a hexagon edge, close enough for a wall thickness test.
  const d = Math.max(Math.abs(cx) * 0.866 + Math.abs(cy) * 0.5, Math.abs(cy));
  const edge = Math.max(0, 1 - Math.abs(d - R * 0.72) / 3.2);
  return {
    wall: edge,
    depth: Math.max(0, 1 - d / (R * 0.72)),
    tone: hash1(Math.floor((x + offset) / w) * 23 + row * 5, 64, 15013),
  };
}

/** Brood comb: hexagonal cells in a chitin lattice, most of them still full. */
export const comb = (): THREE.Texture =>
  colorTexture('viscera.comb', SIZE, (x, y, size) => {
    const { wall, depth, tone } = combAt(x, y);
    const grain = n2(x, y, size, 14, 15101, 3);
    // A cell is either capped - pale, waxed over, still full - or open, in which
    // case what you are looking into is the dark, and the dark is deep.
    const capped = tone > 0.5;
    const inner = capped
      ? mix(rgb(0x9b8a63), rgb(0xc0ae82), grain)
      : mix(rgb(0x4a3f33), rgb(0x2b2620), depth);
    const base = mix(inner, rgb(0x8d7d5d), wall * 0.95);
    return shade(base, 0.9 + grain * 0.2 - depth * 0.18);
  });

export const combNormal = (): THREE.Texture =>
  normalTexture('viscera.combN', SIZE, (x, y) => {
    const { wall, depth } = combAt(x, y);
    return wall * 0.9 - depth * 0.35 + 0.35;
  }, 3.0);

/* --- special ---------------------------------------------------------------------- */

export const IRIS_TILE = 1.0;

/**
 * Four eyes in one 2x2 atlas, so a whole wall of them costs one material and
 * merges into one mesh. Pick a quadrant with `subUV()`.
 *
 * Used as albedo AND emissive map, which is the trick that lets an eye glow
 * without spending one of the room's two real lights: the pupil is dark in the
 * texture, so it stays a hole while the iris burns.
 */
export const irises = (): THREE.Texture =>
  colorTexture('viscera.irises', SIZE, (x, y, size) => {
    const qx = Math.floor(x / 128);
    const qy = Math.floor(y / 128);
    const which = qy * 2 + qx;
    const u = ((x % 128) / 128 - 0.5) * 2;
    const v = ((y % 128) / 128 - 0.5) * 2;
    const r = Math.hypot(u, v);
    const a = Math.atan2(v, u);

    // Sclera: wet, off-white, threaded with vessels that get denser outward.
    if (r > 0.72) {
      const web = vein(n2(x, y, size, 13, 16001 + which * 7, 3), 0.07);
      const base = mix(rgb(0xb5ada0), rgb(0x8e8779), Math.max(0, r - 0.72) * 1.4);
      return mix(base, rgb(0x9c4038), web * 0.75);
    }
    // Limbus: the dark ring that makes an iris read as an iris.
    if (r > 0.63) return shade(rgb(0x3a2b2c), 0.9 + n2(x, y, size, 24, 16111, 2) * 0.25);

    const hue: RGB =
      which === 0 ? rgb(0xd8a63a) : which === 1 ? rgb(0x74b06a) : which === 2 ? rgb(0xa06ec0) : rgb(0xcfd6c6);

    // Pupil. Slit for two of the four, round for the others: nothing about this
    // animal is consistent, and a room of identical eyes reads as wallpaper.
    const slit = which === 0 || which === 2;
    const pupil = slit ? Math.hypot(u * 4.4, v * 1.05) : r * 2.9;
    if (pupil < 1) return shade(rgb(0x140f13), 0.8 + n2(x, y, size, 30, 16217, 2) * 0.4);

    // Stroma: radial fibres, plus a crypt ring where they knot together.
    const fibre = 0.5 + 0.5 * Math.sin(a * 46 + n2(x, y, size, 8, 16307 + which, 2) * 9);
    const crypt = Math.max(0, 1 - Math.abs(r - 0.4) * 8);
    let base = mix(shade(hue, 0.55), hue, fibre * 0.85);
    base = mix(base, shade(hue, 1.35), crypt * 0.5);
    return shade(base, 0.85 + fibre * 0.3);
  });

export const ACID_TILE = 2.0;

/**
 * Gastric fluid, used as albedo and emissive. It is the light source in half the
 * wet rooms, so the bright cells have to be genuinely bright: this is what a
 * player reads the floor by while standing in the stomach.
 */
export const acid = (): THREE.Texture =>
  colorTexture('viscera.acid', SIZE, (x, y, size) => {
    const churn = n2(x, y, size, 5, 17003, 4);
    const cells = vein(n2(x, y, size, 9, 17107, 3), 0.16);
    const froth = Math.max(0, n2(x, y, size, 26, 17211, 2) - 0.6) * 2.5;

    let base = mix(rgb(0x4a5a26), rgb(0x93a83c), churn * 0.9 + cells * 0.5);
    base = mix(base, rgb(0xc8d86a), Math.min(0.85, froth));
    return shade(base, 0.82 + churn * 0.36);
  });

export const RESIN_TILE = 1.6;

/** Hardened secretion: amber, cloudy, with things caught in it. */
export const resin = (): THREE.Texture =>
  colorTexture('viscera.resin', SIZE, (x, y, size) => {
    const flow = n2s(x, y, size, 4, 14, 18003, 4);
    const cloud = n2(x, y, size, 7, 18109, 3);
    const inclusion = Math.max(0, n2(x, y, size, 20, 18211, 2) - 0.68) * 3;
    let base = mix(rgb(0x8a5a1e), rgb(0xd0a24a), flow * 0.85 + cloud * 0.35);
    base = mix(base, rgb(0x4a3416), Math.min(0.8, inclusion));
    return shade(base, 0.86 + flow * 0.3);
  });

/**
 * The door plate, authored to fill a 0..1 UV rather than to tile.
 *
 * Shared art is not batched through `merge.ts`, so a door leaf carries a box's
 * own UVs - one repeat over the whole leaf. A tiling bone map on that comes out
 * as a single smeared patch, which is exactly why the first pass of this pack
 * had doors that read as blank khaki slabs. This one is composed *as a door*:
 * a bordered plate of grown bone with a central suture and growth ridges, so it
 * reads as a valve the beast sealed rather than as a rectangle.
 */
export const bonePlate = (): THREE.Texture =>
  colorTexture('viscera.bonePlate', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const grain = n2(x, y, size, 11, 20011, 4);

    // Growth ridges, running out from the central suture.
    const fromSeam = Math.abs(u - 0.5);
    const ridge = Math.abs(((fromSeam * 13 + n2(x, y, size, 5, 20107, 2) * 1.2) % 1) - 0.5) * 2;

    let base = mix(rgb(0x8e846c), rgb(0xb8ad91), grain * 0.85 + ridge * 0.3);

    // The suture down the middle, where the two halves grew together.
    if (fromSeam < 0.035 + n2(x, y, size, 20, 20211, 2) * 0.02) base = mix(base, rgb(0x554c3c), 0.8);

    // A raised border, darker where it meets the frame.
    const edge = Math.min(u, 1 - u, v, 1 - v);
    if (edge < 0.06) base = mix(base, rgb(0x5f5643), (0.06 - edge) * 12);
    else if (edge < 0.1) base = mix(base, rgb(0xcabfa1), 0.35);

    // Foramina: the little holes bone always has, denser toward the edges.
    const pore = Math.max(0, n2(x, y, size, 40, 20309, 2) - 0.66) * 3;
    base = mix(base, rgb(0x4e4636), Math.min(0.85, pore * (1.4 - edge * 3)));

    return shade(base, (0.9 + grain * 0.18) * soil(x, y, size, 20411, 0.35));
  });

export const SPORE_TILE = 1.4;

/**
 * The rot that grows where the beast has stopped healing: a mat of pale
 * filaments with fruiting bodies in it. Doubles as an emissive map, so a bloom
 * lights its own corner.
 */
export const spore = (): THREE.Texture =>
  colorTexture('viscera.spore', SIZE, (x, y, size) => {
    const mat = vein(n2(x, y, size, 16, 19003, 3), 0.14);
    const body = Math.max(0, n2(x, y, size, 11, 19109, 2) - 0.58) * 2.4;
    const dark = n2(x, y, size, 5, 19211, 3);
    let base = mix(rgb(0x2f3a34), rgb(0x53604c), dark * 0.9);
    base = mix(base, rgb(0x7fbf9a), mat * 0.55);
    base = mix(base, rgb(0xa8e8c4), Math.min(0.9, body));
    return shade(base, 0.85 + dark * 0.3);
  });
