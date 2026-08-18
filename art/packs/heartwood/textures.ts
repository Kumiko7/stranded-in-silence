/**
 * Heartwood - the surfaces, generated as procedural pixel data.
 *
 * Same three rules as everywhere else in art (art/lib/textures.ts): no canvas, no
 * `Math.random()`, cached at module scope. Every recipe below is a pure function
 * of pixel coordinates, so a room builds identically in a browser, on a peer's
 * machine, and headless inside `scripts/validateArt.mjs`.
 *
 * `*_TILE` is the size in METRES that one repeat covers. `merge.ts` bakes UVs in
 * world units, so a texture keeps its density whether it lands on a 0.2 m spindle
 * or an 8 m floor. Floors are tiled between one and two metres - a size a player
 * can take a step across. A 3 m tile on an 8 m floor is under three repeats and
 * reads from standing height as one flat smear (docs/art/ROOM_REVIEW.md).
 *
 * ## The one thing every surface in this map has in common
 *
 * You are inside a trunk, so **the grain runs vertically on every wall.** The
 * batcher projects wall UVs with `v` along world Y, so vertical grain means a
 * field stretched hard in `y` and busy in `x` - `n2s(x, y, size, many, few)`.
 * That single fact is doing more work than any individual recipe: it is why a
 * carved elven hall and a rotten bark canyon read as two rooms of one organism
 * rather than as two art styles.
 *
 * ## The three families
 *
 * - **The Bower** is what moved in and made a home: heartwood polished to honey,
 *   silver birch panelling, carved lattice, woven willow, packed clay with straw
 *   in it, leaf-inlaid parquet. Somebody's hands were on all of it. It lights
 *   itself WARM - tapped sap, moth lanterns, wax.
 * - **The Thicket** is the tree itself and the things living in the tree: deep
 *   bark fissure, wet sapwood pulp, black punk rot, mycelium felt, silk. Nothing
 *   here was made. It lights itself COLD - foxfire in the wounds, gill glow, the
 *   pale shine off silk.
 * - **The Bloom** is the third thing, and it is small on purpose: bark laced with
 *   violet, petals that are not petals. It belongs to neither temperature, which
 *   is exactly why it is frightening in both halves.
 *
 * Albedos are mid-tones. Colour is converted to linear space before lighting,
 * where a near-black picked in a colour wheel is effectively 0 and no amount of
 * light brings it back. This map is dark because of the fog and the lighting,
 * not because the bark is black.
 */
import type * as THREE from 'three';
import { clamp255, colorTexture, dataTexture, fbm, hash1, mix, normalTexture, rgb, shade, type RGB } from '../../lib/textures';

const SIZE = 256;

/** Isotropic fractal noise over a texture, seamless at the edges. */
const n2 = (x: number, y: number, size: number, scale: number, seed: number, octaves = 4): number =>
  fbm((x / size) * scale, (y / size) * scale, scale, scale, seed, octaves);

/** Stretched noise: `sx` repeats across, `sy` down. Both wrap. */
const n2s = (x: number, y: number, size: number, sx: number, sy: number, seed: number, octaves = 3): number =>
  fbm((x / size) * sx, (y / size) * sy, sx, sy, seed, octaves);

/**
 * Ridged noise: 1 exactly on the zero-crossing of a noise field, 0 away from it.
 * One function does bark fissures, root braids, silk strands, leaf veins and the
 * crack network in dried clay - the most reused primitive in the file.
 */
const ridge = (n: number, width: number): number => Math.max(0, 1 - Math.abs(n - 0.5) / width);

const sat = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Growth rings, warped.
 *
 * A trunk seen from inside is not a bullseye - you are looking at the rings
 * edge-on, so they are near-parallel lines running with the fibre and drifting
 * across it. `across` is the coordinate that crosses the grain and `along` the
 * one that runs with it; warping `across` by a low-frequency field of `along` is
 * what makes them wander the way real timber does rather than reading as
 * corduroy (docs/art/ROOM_REVIEW.md - "warp your stripes harder than their
 * spacing").
 */
function rings(across: number, along: number, count: number, warp: number, seed: number): number {
  const drift = (fbm(along * 2.1, across * 0.4, 4, 4, seed, 3) - 0.5) * warp;
  const phase = (across + drift) * count;
  return Math.abs((phase % 1) - 0.5) * 2;
}

/**
 * The fibre: long thin streaks running with the grain. Everything wooden in the
 * pack has this on top of whatever else it is doing, which is most of why a
 * carved boss and a rotten plank read as the same substance.
 */
const fibre = (x: number, y: number, size: number, seed: number, strength = 1): number =>
  (n2s(x, y, size, 26, 2.5, seed, 3) - 0.5) * strength;

/** Generic grime multiplier around 1, for anything that has sat under a tree. */
function grime(x: number, y: number, size: number, seed: number, strength: number): number {
  const patch = n2(x, y, size, 4.5, seed, 4);
  return 1 - Math.max(0, patch - 0.46) * strength * 1.7;
}

/* --- shared roughness maps ------------------------------------------------------ */

/** Waxed and worked wood: polished where hands go, dull in the carving. */
export const waxRoughness = (): THREE.Texture =>
  dataTexture('hw.waxRough', 128, (x, y, size) => 0.3 + n2s(x, y, size, 5, 14, 7717) * 0.5);

/** Dry and fibrous: bark, wicker, thatch, dead leaf. */
export const dryRoughness = (): THREE.Texture =>
  dataTexture('hw.dryRough', 128, (x, y, size) => 0.72 + n2(x, y, size, 12, 7723) * 0.28);

/**
 * Wet roughness: mirror-slick where sap or rot water is standing, matte where it
 * has only been damp. The one map that keeps pulp and rot from reading as darker
 * bark.
 */
export const wetRoughness = (): THREE.Texture =>
  dataTexture('hw.wetRough', 128, (x, y, size) => 0.1 + Math.pow(n2(x, y, size, 6, 7741), 1.7) * 0.66);

/* --- the Bower: floors ----------------------------------------------------------- */

export const PARQUET_TILE = 1.6;

/**
 * Leaf parquet: the floor of every hall the fae actually finished.
 *
 * Not a chequerboard. It is a herringbone of narrow staves in two woods with a
 * leaf-vein figure cut into the pale ones, so it reads as marquetry from
 * standing height and as joinery when you are on top of it. The staves are 18 cm
 * across, which at a 1.6 m tile is nine to a repeat.
 */
export const parquet = (): THREE.Texture =>
  colorTexture('hw.parquet', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    // Herringbone: alternate blocks run at ninety degrees, and which block you
    // are in is decided by a coarse chequer of the two axes.
    const block = 4;
    const bx = Math.floor(u * block);
    const by = Math.floor(v * block);
    const turned = (bx + by) % 2 === 0;
    const across = turned ? u : v;
    const along = turned ? v : u;
    const staves = 9;
    const stave = Math.floor(across * staves);
    const id = hash1(stave * 13 + bx * 7 + by * 29, 61, 8101);
    const seam = Math.abs(((across * staves) % 1) - 0.5) * 2;

    const warm = mix(rgb(0x8a6134), rgb(0xa87a42), id);
    const pale = mix(rgb(0xb59a6c), rgb(0xc9b489), id);
    let c = id > 0.55 ? pale : warm;

    // Vein figure cut into the pale staves only: a central rib with ribs off it.
    if (id > 0.55) {
      const rib = ridge(fbm(along * 7, across * 22, 7, 22, 8111, 2), 0.09);
      const spine = Math.max(0, 1 - Math.abs(((along * 2) % 1) - 0.5) * 6);
      c = mix(c, rgb(0x6d4f2c), sat(rib * 0.5 + spine * 0.22));
    }
    c = mix(c, shade(c, 0.55), Math.max(0, 1 - seam / 0.12) * 0.8);
    c = shade(c, 1 + fibre(x, y, size, 8121, turned ? 0.14 : 0.1));
    // Wear: the middle of a room is walked on and the corners are not.
    return shade(c, grime(x, y, size, 8131, 0.4) * (0.92 + n2(x, y, size, 2.5, 8141) * 0.2));
  });

export const parquetNormal = (): THREE.Texture =>
  normalTexture(
    'hw.parquetN',
    128,
    (x, y, size) => {
      const u = x / size;
      const v = y / size;
      const block = 4;
      const turned = (Math.floor(u * block) + Math.floor(v * block)) % 2 === 0;
      const across = turned ? u : v;
      const seam = Math.abs(((across * 9) % 1) - 0.5) * 2;
      return Math.max(0, 1 - seam / 0.1) * -0.5 + n2(x, y, size, 20, 8151) * 0.14;
    },
    1.5,
  );

export const PLANK_TILE = 1.8;

/** Plain riven boards, pegged. The Bower's working floors and every gallery. */
export const plank = (): THREE.Texture =>
  colorTexture('hw.plank', SIZE, (x, y, size) => {
    const v = y / size;
    const boards = 5;
    const board = Math.floor(v * boards);
    const id = hash1(board, boards, 8201);
    const seam = Math.abs(((v * boards) % 1) - 0.5) * 2;

    let c = mix(rgb(0x6e5334), rgb(0x93714a), id);
    // Rings running along each board, at a spacing that changes per board.
    const r = rings(v * boards, x / size, 3 + id * 3, 0.5, 8211 + board * 17);
    c = mix(c, shade(c, 0.7), Math.pow(1 - r, 3) * 0.55);
    c = shade(c, 1 + fibre(x, y, size, 8221, 0.18));
    // The gap between boards, and the pegs holding them down.
    c = mix(c, rgb(0x241a12), Math.max(0, 1 - seam / 0.07));
    const px = (x / size) * 6;
    if (Math.hypot((px % 1) - 0.5, (seam - 0.72) * 2.2) < 0.11) c = mix(c, rgb(0x3d2c1c), 0.75);
    return shade(c, grime(x, y, size, 8231, 0.45));
  });

export const plankNormal = (): THREE.Texture =>
  normalTexture(
    'hw.plankN',
    128,
    (x, y, size) => {
      const v = y / size;
      const seam = Math.abs(((v * 5) % 1) - 0.5) * 2;
      return Math.max(0, 1 - seam / 0.06) * -0.8 + n2s(x, y, size, 22, 3, 8241) * 0.2;
    },
    1.7,
  );

export const MOSS_TILE = 1.3;

/**
 * Living moss floor. Two species and a scatter of tiny caps.
 *
 * The trap here is saturation: a floor of one green is a snooker table. This is
 * mostly a desaturated olive with the emerald only in the clumps, and the pale
 * lichen crust is the thing that makes it read as growing rather than as carpet.
 */
export const mossFloor = (): THREE.Texture =>
  colorTexture('hw.moss', SIZE, (x, y, size) => {
    const clump = n2(x, y, size, 5, 8301, 4);
    const fine = n2(x, y, size, 34, 8311, 3);
    const lichen = Math.max(0, n2(x, y, size, 8, 8321, 3) - 0.6) * 2.4;

    let c = mix(rgb(0x3c4630), rgb(0x55663a), clump);
    c = mix(c, rgb(0x6f8a44), Math.max(0, clump - 0.62) * 2.2);
    c = shade(c, 0.86 + fine * 0.34);
    // Lichen crust: blue-grey, the pale accent that stops the green flattening.
    c = mix(c, rgb(0x9aa48c), sat(lichen) * 0.7);
    // Bare loam showing through the thin patches.
    c = mix(c, rgb(0x322619), Math.max(0, 0.34 - clump) * 2.0);
    // Sporophyte caps: a scatter of pinheads on stalks, one pixel wide.
    const cap = hash1(Math.floor(x / 4) * 71 + Math.floor(y / 4) * 13, 512, 8331);
    if (cap > 0.984) c = mix(c, rgb(0xb08a52), 0.8);
    return c;
  });

export const mossNormal = (): THREE.Texture =>
  normalTexture('hw.mossN', 128, (x, y, size) => n2(x, y, size, 30, 8341, 4) * 0.6 + n2(x, y, size, 6, 8301, 3) * 0.4, 2.2);

/* --- the Bower: walls ------------------------------------------------------------- */

export const HEART_TILE = 2.2;

/**
 * Heartwood, worked and waxed: the Bower's principal wall.
 *
 * Deep honey, vertical grain, and a fluted rhythm cut into it - the carving is
 * IN the texture rather than in geometry, because it is on every wall of eleven
 * rooms and geometry that size is a per-room draw call for something you read as
 * surface. What sells it is that the flutes catch the light on one side only.
 */
export const heartwood = (): THREE.Texture =>
  colorTexture('hw.heart', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const r = rings(u, v, 7, 0.75, 8401);
    let c = mix(rgb(0x6a4626), rgb(0x9b6c39), Math.pow(r, 0.7));
    // The darker latewood band on the edge of each ring.
    c = mix(c, rgb(0x4a2f19), Math.pow(1 - r, 5) * 0.7);
    c = shade(c, 1 + fibre(x, y, size, 8411, 0.2));

    // Fluting: five reeds to a repeat, so at 2.2 m they are 44 cm - a hand's
    // span, which is the size a carved reed actually is.
    const flute = (u * 5) % 1;
    const lit = Math.cos((flute - 0.5) * Math.PI);
    c = shade(c, 0.82 + sat(lit) * 0.36);
    // The quirk between reeds: a hard dark line, not a gradient.
    if (flute < 0.055 || flute > 0.945) c = shade(c, 0.6);

    // Wax bloom, and soot where a lantern has hung for a long time.
    c = mix(c, rgb(0xc7a469), Math.max(0, n2(x, y, size, 9, 8421, 3) - 0.66) * 1.6);
    return shade(c, grime(x, y, size, 8431, 0.35));
  });

export const heartwoodNormal = (): THREE.Texture =>
  normalTexture(
    'hw.heartN',
    128,
    (x, y, size) => {
      const flute = ((x / size) * 5) % 1;
      return Math.cos((flute - 0.5) * Math.PI) * 0.7 + n2s(x, y, size, 24, 4, 8441) * 0.22;
    },
    1.6,
  );

export const BIRCH_TILE = 2.4;

/**
 * Silver birch panelling: the pale wood the elves used where they wanted a room
 * to feel clean.
 *
 * Almost white, which makes it the loudest surface in the pack - it is used in
 * three rooms and no more (docs/art/ROOM_REVIEW.md: "a pale material
 * multiplies"). The dark lenticel dashes are the whole identity of it, and they
 * have to run ACROSS the grain, which is the opposite of everything else here.
 */
export const birch = (): THREE.Texture =>
  colorTexture('hw.birch', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    let c = mix(rgb(0xb9b3a4), rgb(0xd8d2c2), n2s(x, y, size, 4, 16, 8501, 3));
    // The pink-grey bloom real birch has under the white.
    c = mix(c, rgb(0xa89484), Math.max(0, n2(x, y, size, 3.5, 8511, 3) - 0.55) * 1.6);
    c = shade(c, 1 + fibre(x, y, size, 8521, 0.08));

    /**
     * Lenticels: short horizontal dashes, in scattered bands.
     *
     * The first pass put them on 26 evenly spaced rows at high contrast, and a
     * wall of birch came back off the contact sheet reading as a brick bond -
     * which is "a tile size is a look, not a setting" arriving as a rhythm
     * rather than as a scale (docs/art/ROOM_REVIEW.md). Half as many rows, each
     * row nudged off the grid by its own hash, most rows empty, and the marks
     * themselves a good deal softer.
     */
    const bandRow = Math.floor(v * 13);
    const band = hash1(bandRow, 13, 8531);
    if (band > 0.58) {
      const nudge = (hash1(bandRow * 7 + 3, 13, 8536) - 0.5) * 0.55;
      const cell = Math.floor(u * 9 + nudge * 3);
      const jitter = hash1(cell * 31 + bandRow, 512, 8541);
      const width = 0.07 + jitter * 0.26;
      const t = (u * 9 + nudge * 3) % 1;
      const dy = Math.abs((((v + nudge / 13) * 13) % 1) - 0.5) * 2;
      if (t > 0.5 - width / 2 && t < 0.5 + width / 2 && dy < 0.2) {
        c = mix(c, rgb(0x3b3227), (0.55 - dy * 0.5) * (0.5 + jitter * 0.6));
      }
    }
    // Where the bark has been peeled back to the salmon layer under it.
    const peel = Math.max(0, n2(x, y, size, 2.6, 8551, 3) - 0.68) * 3;
    c = mix(c, rgb(0x8a6350), sat(peel));
    return shade(c, grime(x, y, size, 8561, 0.3));
  });

export const birchNormal = (): THREE.Texture =>
  normalTexture('hw.birchN', 128, (x, y, size) => n2s(x, y, size, 6, 20, 8571, 3) * 0.5 + n2(x, y, size, 26, 8581) * 0.2, 1.2);

export const LATTICE_TILE = 1.9;

/**
 * Carved lattice over a dark void: the Bower's screen wall.
 *
 * A woven diagonal grid of ribs with a boss where they cross, and DARKNESS
 * behind it rather than another wood colour - a lattice whose ground is the same
 * value as its ribs is a rug pattern, and this has to read as something you
 * could put a hand through.
 */
export const lattice = (): THREE.Texture =>
  colorTexture('hw.lattice', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const a = ((u + v) * 5) % 1;
    const b = ((u - v) * 5 + 1) % 1;
    const ra = Math.max(0, 1 - Math.abs(a - 0.5) * 5.4);
    const rb = Math.max(0, 1 - Math.abs(b - 0.5) * 5.4);
    const rib = Math.max(ra, rb);
    const cross = ra * rb;

    const dark = rgb(0x16120e);
    let c = mix(rgb(0x7a5730), rgb(0xa07c46), n2(x, y, size, 12, 8601, 3));
    c = shade(c, 0.7 + rib * 0.5);
    // The boss at each crossing: a raised knob, catching more light.
    c = mix(c, rgb(0xc09a5c), Math.pow(cross, 1.6) * 0.8);
    c = mix(dark, c, sat(rib * 1.6));
    return shade(c, grime(x, y, size, 8611, 0.35));
  });

export const latticeNormal = (): THREE.Texture =>
  normalTexture(
    'hw.latticeN',
    128,
    (x, y, size) => {
      const u = x / size;
      const v = y / size;
      const ra = Math.max(0, 1 - Math.abs((((u + v) * 5) % 1) - 0.5) * 5.4);
      const rb = Math.max(0, 1 - Math.abs((((u - v) * 5 + 1) % 1) - 0.5) * 5.4);
      return Math.max(ra, rb) * 0.8 + ra * rb * 0.4;
    },
    2.4,
  );

export const WICKER_TILE = 1.4;

/**
 * Woven willow: the walls of the burrow dwellings, and every basket in the map.
 *
 * A plain over-under weave sampled as two interleaved stripe fields, with the
 * strand that is currently on top getting the highlight. The rods are 7 cm,
 * which at a 1.4 m tile is twenty to a repeat.
 */
export const wicker = (): THREE.Texture =>
  colorTexture('hw.wicker', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const cols = 10;
    const rows = 10;
    const cu = Math.floor(u * cols);
    const cv = Math.floor(v * rows);
    const over = (cu + cv) % 2 === 0;
    const tu = (u * cols) % 1;
    const tv = (v * rows) % 1;
    // The strand on top runs the full width of its cell; the one under it is
    // pinched where it passes beneath.
    const t = over ? tv : tu;
    const round = Math.sin(t * Math.PI);
    const id = hash1(over ? cu : cv * 7, 64, 8701);

    let c = mix(rgb(0x7d6134), rgb(0xa8874c), id);
    c = shade(c, 0.5 + Math.pow(round, 0.6) * 0.72);
    // A hint of the rod's own grain along its length.
    c = shade(c, 1 + (n2s(x, y, size, over ? 4 : 40, over ? 40 : 4, 8711, 2) - 0.5) * 0.2);
    // The shadow gap where two rods cross.
    const gap = Math.min(Math.abs(tu - 0.5), Math.abs(tv - 0.5));
    c = mix(c, rgb(0x241c10), Math.max(0, 1 - gap * 9) * 0.35);
    return shade(c, grime(x, y, size, 8721, 0.4));
  });

export const wickerNormal = (): THREE.Texture =>
  normalTexture(
    'hw.wickerN',
    128,
    (x, y, size) => {
      const u = x / size;
      const v = y / size;
      const over = (Math.floor(u * 10) + Math.floor(v * 10)) % 2 === 0;
      const t = over ? (v * 10) % 1 : (u * 10) % 1;
      return Math.sin(t * Math.PI) * 0.8;
    },
    2.0,
  );

export const CLAY_TILE = 2.0;

/**
 * Packed earth and straw, limewashed: the burrow walls, and what a hobbit hole
 * is actually made of.
 *
 * The straw is the whole recipe. Without it this is a beige wall; with it, it is
 * cob. Short bright fibres at every angle, gated to the patches where the wash
 * has come off, plus a crack network that clusters rather than meandering across
 * the whole surface (docs/art/ROOM_REVIEW.md - "the crack in the plaster was a
 * worm").
 */
export const clay = (): THREE.Texture =>
  colorTexture('hw.clay', SIZE, (x, y, size) => {
    const wash = n2(x, y, size, 3, 8801, 4);
    let c = mix(rgb(0x93866e), rgb(0xb0a68f), n2(x, y, size, 7, 8811, 3));
    // Where the limewash has failed, the brown cob under it shows.
    const bare = Math.max(0, 0.46 - wash) * 2.6;
    c = mix(c, rgb(0x8a6f4c), sat(bare));

    // Straw: only in the bare patches, and always short.
    if (bare > 0.15) {
      const straw = ridge(n2s(x, y, size, 40, 9, 8821, 2), 0.03) * ridge(n2s(x, y, size, 9, 40, 8831, 2), 0.03);
      const alt = ridge(n2s(x, y, size, 11, 34, 8841, 2), 0.035);
      c = mix(c, rgb(0xcbb173), sat((straw * 2 + alt * 0.7) * bare));
    }

    // Cracks: fine, short, and gated by a separate low-frequency mask so they
    // cluster in failed patches with sound plaster in between.
    const gate = Math.max(0, n2(x, y, size, 2.2, 8851, 2) - 0.5) * 2.6;
    const crack = ridge(n2(x, y, size, 16, 8861, 3), 0.022) * gate;
    c = mix(c, rgb(0x584634), sat(crack));
    return shade(c, grime(x, y, size, 8871, 0.4));
  });

export const clayNormal = (): THREE.Texture =>
  normalTexture(
    'hw.clayN',
    128,
    (x, y, size) => {
      const gate = Math.max(0, n2(x, y, size, 2.2, 8851, 2) - 0.5) * 2.6;
      return n2(x, y, size, 11, 8881, 4) * 0.4 - ridge(n2(x, y, size, 16, 8861, 3), 0.022) * gate * 0.7;
    },
    1.8,
  );

/* --- the Thicket: the tree itself ------------------------------------------------- */

export const BARK_TILE = 2.6;

/**
 * Deep-fissured bark: the Thicket's principal wall, and the surface the whole
 * map is named for.
 *
 * Ridges running vertically with black canyons between them, which is one ridged
 * noise field stretched sixteen to one. The important number is the CONTRAST:
 * the fissures go to near-black and the plates stay mid-grey-brown, because that
 * gap is the only thing giving an unlit bark wall any legibility at all.
 */
export const bark = (): THREE.Texture =>
  colorTexture('hw.bark', SIZE, (x, y, size) => {
    // Plates: the field that decides which slab of bark you are on.
    const plate = n2s(x, y, size, 7, 1.6, 8901, 3);
    const fissure = ridge(plate, 0.11);
    const fine = ridge(n2s(x, y, size, 17, 3.4, 8911, 3), 0.07) * 0.6;

    let c = mix(rgb(0x4a3a2c), rgb(0x6d573f), n2s(x, y, size, 9, 2.2, 8921, 3));
    c = shade(c, 1 + fibre(x, y, size, 8931, 0.22));
    // The canyon floors, and the shadow shoulder either side of them.
    c = mix(c, rgb(0x1c1510), sat(fissure * 1.25 + fine * 0.55));
    // Moss and algae collecting on the up-facing edges of the plates.
    const damp = Math.max(0, n2(x, y, size, 3.4, 8941, 3) - 0.5) * 2;
    c = mix(c, rgb(0x4c5a38), sat(damp * (1 - fissure) * 0.55));
    // Pale lichen crusts: the one bright thing on a bark wall.
    const lich = Math.max(0, n2(x, y, size, 12, 8951, 3) - 0.68) * 3;
    c = mix(c, rgb(0x8e977e), sat(lich * (1 - fissure)) * 0.7);
    return shade(c, grime(x, y, size, 8961, 0.3));
  });

export const barkNormal = (): THREE.Texture =>
  normalTexture(
    'hw.barkN',
    128,
    (x, y, size) => {
      const fissure = ridge(n2s(x, y, size, 7, 1.6, 8901, 3), 0.11);
      const fine = ridge(n2s(x, y, size, 17, 3.4, 8911, 3), 0.07);
      return -fissure * 0.9 - fine * 0.3 + n2s(x, y, size, 22, 5, 8971, 3) * 0.2;
    },
    2.6,
  );

export const PULP_TILE = 2.0;

/**
 * Wet sapwood: what is under the bark where something has taken the bark off.
 *
 * Pale, fibrous, and it looks like a wound because it is one. Long stringy
 * fibres, a damp sheen from the roughness map, and rusty stain where the sap has
 * oxidised. This is the map's flesh, and it is deliberately the only place the
 * palette goes anywhere near skin.
 */
export const pulp = (): THREE.Texture =>
  colorTexture('hw.pulp', SIZE, (x, y, size) => {
    const strand = n2s(x, y, size, 30, 2.4, 9001, 3);
    let c = mix(rgb(0xa08c68), rgb(0xc0ad86), strand);
    // Torn fibre: hairs standing out of the surface. Deliberately low contrast -
    // at 0.55 toward a near-white these read as a hatch of bright vertical
    // scratches over every wet wall in the map, which is a pale material
    // multiplying across whole rooms (docs/art/ROOM_REVIEW.md).
    const hair = ridge(n2s(x, y, size, 46, 3, 9011, 2), 0.05);
    c = mix(c, rgb(0xbfae8c), sat(hair) * 0.3);
    // Oxidised sap: the rust-brown weeping runs, which run DOWN.
    const run = ridge(n2s(x, y, size, 12, 1.1, 9021, 3), 0.13);
    c = mix(c, rgb(0x74452a), sat(run * 0.85));
    // Wet patches gone dark.
    c = mix(c, rgb(0x53412c), Math.max(0, n2(x, y, size, 4, 9031, 3) - 0.54) * 1.7);
    return shade(c, grime(x, y, size, 9041, 0.3));
  });

export const pulpNormal = (): THREE.Texture =>
  normalTexture('hw.pulpN', 128, (x, y, size) => n2s(x, y, size, 34, 3, 9051, 3) * 0.7 + ridge(n2s(x, y, size, 46, 3, 9011, 2), 0.05) * 0.3, 1.9);

export const ROT_TILE = 2.1;

/**
 * Punk wood: heart rot, wet and black and going to fibre.
 *
 * The darkest surface in the pack and the one that most needed watching - a
 * near-black albedo is 0.02 in linear space and no lamp recovers it. So the
 * ground here is a mid brown-grey and what makes it read as rot is the CUBICAL
 * cracking: rot fails in blocks, not in strings, and a grid of shrunken cubes
 * separated by black is instantly recognisable as decay.
 */
export const rotwood = (): THREE.Texture =>
  colorTexture('hw.rot', SIZE, (x, y, size) => {
    // Cubical checking: two crossed crack fields, warped so the blocks are not
    // a grid.
    const wx = (n2(x, y, size, 3, 9101, 2) - 0.5) * 0.6;
    const wy = (n2(x, y, size, 3, 9111, 2) - 0.5) * 0.6;
    const cx = ridge(n2s(x + wx * size, y, size, 9, 2, 9121, 2), 0.14);
    const cy = ridge(n2s(x, y + wy * size, size, 2, 11, 9131, 2), 0.12);
    const check = sat(Math.max(cx, cy) * 1.3);

    let c = mix(rgb(0x453c31), rgb(0x5f5142), n2(x, y, size, 6, 9141, 3));
    c = shade(c, 1 + fibre(x, y, size, 9151, 0.2));
    c = mix(c, rgb(0x191410), check);
    // White rot: the pale bleached patches where the fungus has eaten the lignin.
    const white = Math.max(0, n2(x, y, size, 4.5, 9161, 3) - 0.56) * 2.2;
    c = mix(c, rgb(0x9a9382), sat(white) * 0.7);
    // Wet slime over the low patches.
    c = mix(c, rgb(0x2a2c20), Math.max(0, n2(x, y, size, 8, 9171, 3) - 0.6) * 1.6);
    return c;
  });

export const rotwoodNormal = (): THREE.Texture =>
  normalTexture(
    'hw.rotN',
    128,
    (x, y, size) => {
      const cx = ridge(n2s(x, y, size, 9, 2, 9121, 2), 0.14);
      const cy = ridge(n2s(x, y, size, 2, 11, 9131, 2), 0.12);
      return -Math.max(cx, cy) * 0.8 + n2(x, y, size, 18, 9181, 3) * 0.25;
    },
    2.2,
  );

export const FUNGUS_TILE = 1.7;

/**
 * Mycelium felt with gills in it: the wall of the fungal rooms.
 *
 * A mat of white threads over a dark ground, with radiating gill fans wherever a
 * fruiting body has spread. The gills are the readable part, so they run at a
 * per-patch angle rather than all one way - a whole wall of parallel gills is
 * corduroy.
 */
export const fungusMat = (): THREE.Texture =>
  colorTexture('hw.fungus', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    let c = mix(rgb(0x3a382c), rgb(0x53503c), n2(x, y, size, 5, 9201, 3));
    // The felt: fine threads at every angle.
    const felt = ridge(n2(x, y, size, 40, 9211, 2), 0.05);
    c = mix(c, rgb(0xa9a894), sat(felt) * 0.5);

    // Fruiting patches. Four of them per repeat, each with its own centre and
    // its own gill direction.
    for (let i = 0; i < 4; i++) {
      const px = hash1(i * 17, 32, 9221);
      const py = hash1(i * 29 + 3, 32, 9231);
      const du = ((u - px + 1.5) % 1) - 0.5;
      const dv = ((v - py + 1.5) % 1) - 0.5;
      const d = Math.hypot(du, dv);
      // Kept small and low-contrast on purpose. At 0.24 of a 1.7 m tile and a
      // near-white cap these came back off the first contact sheet as pale polka
      // dots forty centimetres across - "a pale material multiplies", on a
      // surface that covers whole rooms (docs/art/ROOM_REVIEW.md).
      const radius = 0.09 + hash1(i, 8, 9241) * 0.07;
      if (d > radius) continue;
      const a = Math.atan2(dv, du);
      const gill = Math.abs(((a / Math.PI) * 13) % 1);
      const g = Math.max(0, 1 - Math.abs(gill - 0.5) * 3.2);
      const fade = 1 - d / radius;
      let cap = mix(rgb(0x6e6349), rgb(0x93876a), g);
      cap = mix(cap, rgb(0x352e22), Math.pow(1 - g, 2) * 0.8);
      c = mix(c, cap, sat(fade * 1.4));
    }
    return shade(c, grime(x, y, size, 9251, 0.35));
  });

export const fungusNormal = (): THREE.Texture =>
  normalTexture('hw.fungusN', 128, (x, y, size) => n2(x, y, size, 36, 9261, 3) * 0.6 + n2(x, y, size, 7, 9271, 3) * 0.4, 1.8);

export const SILK_TILE = 2.2;

/**
 * Spider silk sheeting, laid on and laid on again.
 *
 * Layered strand fields at three angles with the ground going black between
 * them, plus the dust and husks that collect in old web. It is pale, so it is
 * used on one wall of two rooms and never as a floor - a room lined in this
 * would be a bright box.
 */
export const silk = (): THREE.Texture =>
  colorTexture('hw.silk', SIZE, (x, y, size) => {
    let c = rgb(0x1a1a18);
    const layers: readonly [number, number, number, number][] = [
      [26, 5, 9301, 0.62],
      [7, 24, 9311, 0.5],
      [18, 17, 9321, 0.4],
    ];
    for (const [sx, sy, seed, weight] of layers) {
      const s = ridge(n2s(x, y, size, sx, sy, seed, 2), 0.045);
      c = mix(c, mix(rgb(0x9a9a90), rgb(0xd6d4c6), weight), sat(s) * weight);
    }
    // Sheet web: the felted patches where it has been walked over a thousand
    // times, which is what makes it read as inhabited rather than as decoration.
    const sheet = Math.max(0, n2(x, y, size, 3.2, 9331, 3) - 0.48) * 2.2;
    c = mix(c, rgb(0xb2b0a2), sat(sheet) * 0.7);
    // Dust and husks caught in it.
    const dust = hash1(Math.floor(x / 3) * 53 + Math.floor(y / 3) * 11, 1024, 9341);
    if (dust > 0.985) c = mix(c, rgb(0x4a3f2e), 0.7);
    return c;
  });

export const silkNormal = (): THREE.Texture =>
  normalTexture('hw.silkN', 128, (x, y, size) => ridge(n2s(x, y, size, 26, 5, 9301, 2), 0.045) * 0.5 + n2(x, y, size, 3.2, 9331, 3) * 0.35, 1.0);

export const LOAM_TILE = 1.5;

/**
 * Leaf litter over black soil: the floor of everything that grew rather than was
 * laid.
 *
 * Whole leaves, not a mush - individual blades with a midrib, at every angle and
 * three colours, over dark humus. A litter floor made of noise reads as gravel;
 * what makes it leaves is that the shapes have edges and a vein down the middle.
 */
export const loam = (): THREE.Texture =>
  colorTexture('hw.loam', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    let c = mix(rgb(0x2a2018), rgb(0x3d3024), n2(x, y, size, 8, 9401, 4));
    // Twigs and rootlets in the humus.
    c = mix(c, rgb(0x4a3a26), ridge(n2(x, y, size, 22, 9411, 2), 0.03) * 0.6);

    // The leaves: sixteen per repeat, each an oriented ellipse with a rib.
    for (let i = 0; i < 16; i++) {
      const lx = hash1(i * 13, 64, 9421);
      const ly = hash1(i * 31 + 7, 64, 9431);
      const a = hash1(i * 7 + 2, 64, 9441) * Math.PI;
      const len = 0.09 + hash1(i * 3, 32, 9451) * 0.06;
      const du = ((u - lx + 1.5) % 1) - 0.5;
      const dv = ((v - ly + 1.5) % 1) - 0.5;
      const rx = du * Math.cos(a) + dv * Math.sin(a);
      const ry = -du * Math.sin(a) + dv * Math.cos(a);
      const d = Math.hypot(rx / len, ry / (len * 0.42));
      if (d > 1) continue;
      const tint = hash1(i * 19, 32, 9461);
      let leaf = tint > 0.66 ? rgb(0x64502f) : tint > 0.33 ? rgb(0x4e3f28) : rgb(0x6f5f42);
      // Midrib and the shading toward the leaf's edge.
      leaf = mix(leaf, shade(leaf, 1.35), Math.max(0, 1 - Math.abs(ry) / (len * 0.07)));
      leaf = shade(leaf, 0.78 + (1 - d) * 0.4);
      c = mix(c, leaf, 0.94);
    }
    return shade(c, grime(x, y, size, 9471, 0.3));
  });

export const loamNormal = (): THREE.Texture =>
  normalTexture('hw.loamN', 128, (x, y, size) => n2(x, y, size, 16, 9481, 4) * 0.7 + n2(x, y, size, 40, 9491, 2) * 0.3, 1.9);

export const ROOT_TILE = 2.3;

/**
 * Braided root: the floor and wall of the tangle rooms.
 *
 * Interwoven cords rather than a fibre field. Three ridge layers at different
 * angles and widths, each one rounded so it reads as a cylinder, over a black
 * void - it has to look like you could get a foot caught in it.
 */
export const rootMat = (): THREE.Texture =>
  colorTexture('hw.root', SIZE, (x, y, size) => {
    let c = rgb(0x14100c);
    const cords: readonly [number, number, number, number, number][] = [
      [3.4, 9.5, 9501, 0.16, 0.0],
      [8.5, 3.2, 9511, 0.13, 0.35],
      [6.0, 6.4, 9521, 0.1, 0.7],
    ];
    for (const [sx, sy, seed, width, tint] of cords) {
      const n = n2s(x, y, size, sx, sy, seed, 2);
      const d = Math.abs(n - 0.5) / width;
      if (d > 1) continue;
      const round = Math.sqrt(1 - d * d);
      let cord = mix(rgb(0x50402c), rgb(0x7d6544), tint);
      cord = shade(cord, 0.42 + round * 0.85);
      // Bark texture running along each cord.
      cord = shade(cord, 1 + (n2s(x, y, size, sx * 5, sy * 5, seed + 1, 2) - 0.5) * 0.25);
      c = mix(c, cord, sat(round * 1.7));
    }
    // Soil packed into the gaps.
    c = mix(c, rgb(0x2c2318), Math.max(0, n2(x, y, size, 7, 9531, 3) - 0.52) * 1.4);
    return c;
  });

export const rootNormal = (): THREE.Texture =>
  normalTexture(
    'hw.rootN',
    128,
    (x, y, size) => {
      let h = 0;
      for (const [sx, sy, seed, width] of [
        [3.4, 9.5, 9501, 0.16],
        [8.5, 3.2, 9511, 0.13],
        [6.0, 6.4, 9521, 0.1],
      ] as const) {
        const d = Math.abs(n2s(x, y, size, sx, sy, seed, 2) - 0.5) / width;
        if (d < 1) h = Math.max(h, Math.sqrt(1 - d * d));
      }
      return h;
    },
    2.4,
  );

/* --- the Bloom -------------------------------------------------------------------- */

export const BLOOM_TILE = 2.4;

/**
 * Bark laced with the thing that is going through the tree.
 *
 * The same fissure structure as ordinary bark - it has to read as the SAME wood
 * - with a violet vein network in the canyons and a bloom of petals opening out
 * of them. Two rooms use it. That is the whole point of a third strand: if it
 * were everywhere it would be a second theme rather than an intrusion.
 */
export const bloomBark = (): THREE.Texture =>
  colorTexture('hw.bloom', SIZE, (x, y, size) => {
    const fissure = ridge(n2s(x, y, size, 7, 1.6, 8901, 3), 0.11);
    let c = mix(rgb(0x453a34), rgb(0x60503f), n2s(x, y, size, 9, 2.2, 8921, 3));
    c = shade(c, 1 + fibre(x, y, size, 8931, 0.2));
    c = mix(c, rgb(0x1a1418), sat(fissure * 1.2));

    // The vein network, which lives IN the fissures rather than on the plates.
    const vein = ridge(n2(x, y, size, 14, 9601, 3), 0.06) * (0.35 + fissure * 1.4);
    c = mix(c, rgb(0x6e3a86), sat(vein));
    c = mix(c, rgb(0xb45cd0), Math.max(0, vein - 0.62) * 2.4);

    // Petals: small pale rosettes opening where the veins are thickest.
    const u = x / size;
    const v = y / size;
    for (let i = 0; i < 5; i++) {
      const px = hash1(i * 23, 32, 9611);
      const py = hash1(i * 41 + 5, 32, 9621);
      const du = ((u - px + 1.5) % 1) - 0.5;
      const dv = ((v - py + 1.5) % 1) - 0.5;
      const d = Math.hypot(du, dv);
      const radius = 0.055 + hash1(i, 16, 9631) * 0.04;
      if (d > radius) continue;
      const a = Math.atan2(dv, du);
      const lobes = 0.6 + 0.4 * Math.cos(a * 5);
      if (d > radius * lobes) continue;
      const petal = mix(rgb(0xd8b0d4), rgb(0x8a4a92), d / (radius * lobes));
      c = mix(c, petal, 0.9);
    }
    return c;
  });

export const bloomNormal = (): THREE.Texture =>
  normalTexture(
    'hw.bloomN',
    128,
    (x, y, size) => -ridge(n2s(x, y, size, 7, 1.6, 8901, 3), 0.11) * 0.9 + ridge(n2(x, y, size, 14, 9601, 3), 0.06) * 0.35,
    2.4,
  );

/* --- the surfaces that glow ------------------------------------------------------- */

export const SAP_TILE = 0.9;

/**
 * Amber: sap that has run, pooled and set.
 *
 * Colour map and emissive map from the same field, so the middle of a pour is
 * hotter rather than merely brighter. The emissive is deliberately blotchy - a
 * uniformly glowing amber is a plastic light box, and what makes resin read as
 * resin is that some of it has gone cloudy.
 */
export const amber = (): THREE.Texture =>
  colorTexture('hw.amber', 128, (x, y, size) => {
    const flow = n2s(x, y, size, 3, 9, 9701, 3);
    const cloud = n2(x, y, size, 9, 9711, 3);
    let c = mix(rgb(0x8a4a12), rgb(0xd88c28), flow);
    c = mix(c, rgb(0xffc86a), Math.pow(flow, 2.4));
    // Cloudy bands and trapped bubbles.
    c = mix(c, rgb(0xb08a52), Math.max(0, cloud - 0.58) * 1.8);
    const bub = hash1(Math.floor(x / 4) * 37 + Math.floor(y / 4) * 19, 256, 9721);
    if (bub > 0.972) c = mix(c, rgb(0xffe0aa), 0.6);
    return c;
  });

export const amberEmissive = (): THREE.Texture =>
  colorTexture('hw.amberE', 128, (x, y, size) => {
    const flow = n2s(x, y, size, 3, 9, 9701, 3);
    const cloud = n2(x, y, size, 9, 9711, 3);
    const heat = sat(Math.pow(flow, 1.6) * (1 - Math.max(0, cloud - 0.56) * 1.6));
    return mix(rgb(0x180c04), mix(rgb(0xc06018), rgb(0xffc060), Math.pow(heat, 1.5)), heat);
  });

export const FOX_TILE = 1.1;

/**
 * Foxfire: the cold light in the wounds of the tree.
 *
 * A crust of luminous mycelium, and the same colour-plus-emissive pairing as the
 * amber. Green-cyan, and PALE rather than saturated - a saturated emerald wash
 * takes the wood colour out of a whole room, which is the crypt's cave-lamp
 * lesson in a different hue (docs/art/ROOM_REVIEW.md).
 */
export const foxfire = (): THREE.Texture =>
  colorTexture('hw.fox', 128, (x, y, size) => {
    const cell = n2(x, y, size, 7, 9801, 3);
    const grainy = n2(x, y, size, 26, 9811, 2);
    let c = mix(rgb(0x24382c), rgb(0x54785c), cell);
    c = mix(c, rgb(0x9ad8b0), Math.pow(cell, 2.2));
    return shade(c, 0.85 + grainy * 0.3);
  });

export const foxfireEmissive = (): THREE.Texture =>
  colorTexture('hw.foxE', 128, (x, y, size) => {
    const cell = n2(x, y, size, 7, 9801, 3);
    const grainy = n2(x, y, size, 26, 9811, 2);
    const heat = sat(Math.pow(cell, 2.0) * (0.6 + grainy * 0.7));
    return mix(rgb(0x060c08), mix(rgb(0x2e8a68), rgb(0xa8f0c8), Math.pow(heat, 1.4)), heat);
  });

/** The Bloom's own light: violet, and it has spores in it. */
export const bloomGlowMap = (): THREE.Texture =>
  colorTexture('hw.bloomE', 128, (x, y, size) => {
    const cell = n2(x, y, size, 6, 9901, 3);
    const speck = hash1(Math.floor(x / 2) * 61 + Math.floor(y / 2) * 23, 512, 9911);
    const heat = sat(Math.pow(cell, 1.8));
    let c = mix(rgb(0x0c0610), mix(rgb(0x6a2a92), rgb(0xd894f0), Math.pow(heat, 1.4)), heat);
    if (speck > 0.978) c = mix(c, rgb(0xf0d8ff), 0.8);
    return c;
  });

/* --- masks ------------------------------------------------------------------------ */

/**
 * A radial falloff, used as the `map` on every additive wash in the pack.
 *
 * Additive blending drops the dark half of a decal; it does NOT do anything
 * about the EDGE. Without this, a pool of lantern light on a floor is a disc of
 * paint with a hard rim (docs/art/ART_GUIDE.md §4). One 128 px texture serves
 * the whole pack.
 */
export const radialFalloff = (): THREE.Texture =>
  colorTexture('hw.radial', 128, (x, y, size) => {
    const d = Math.hypot(x / size - 0.5, y / size - 0.5) * 2;
    const v = clamp255(Math.pow(Math.max(0, 1 - d), 2.1) * 255);
    return [v, v, v];
  });

/** Soft-sided, for a plume of spores, pollen or mist rising off something. */
export const plumeFade = (): THREE.Texture =>
  colorTexture('hw.plume', 128, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const across = Math.max(0, 1 - Math.abs(u - 0.5) * 2.1);
    const up = Math.max(0, 1 - Math.abs(v - 0.5) * 2.0);
    const wobble = 0.72 + n2(x, y, size, 4, 9921, 3) * 0.56;
    const val = clamp255(Math.pow(across * up, 1.5) * wobble * 255);
    return [val, val, val];
  });

/**
 * A vertical shaft mask: bright at the top, gone at the bottom, soft at the
 * sides. What a beam of light coming down through a hole in a canopy looks like.
 */
export const shaftFade = (): THREE.Texture =>
  colorTexture('hw.shaft', 128, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const across = Math.max(0, 1 - Math.abs(u - 0.5) * 2.2);
    const val = clamp255(Math.pow(across, 1.8) * Math.pow(v, 1.5) * (0.75 + n2(x, y, size, 3, 9931, 2) * 0.5) * 255);
    return [val, val, val];
  });

/* --- what is on the other side of an opening -------------------------------------- */

/**
 * The Hollow: a shaft of trunk running away in both directions, with other
 * people's lantern light a very long way off.
 *
 * A wall is a wall and the room behind it is not drawn, so every port in this
 * pack has to bring its own backdrop (docs/art/ROOM_FORMAT.md §7). This is the
 * one that says how big the tree is, and the scale cue is that the lights are
 * TINY.
 */
export const backdropHollow = (): THREE.Texture =>
  colorTexture('hw.bdHollow', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    // Two converging walls of bark, closing toward the centre.
    const depth = 1 - Math.abs(u - 0.5) * 2;
    let c = mix(rgb(0x2a2018), rgb(0x0a0806), Math.pow(depth, 0.55));
    const fis = ridge(n2s(x, y, size, 9 - depth * 5, 1.4, 8901, 3), 0.1);
    c = mix(c, rgb(0x080605), sat(fis) * (1 - depth * 0.5));
    // Hanging things, silhouetted: long dark verticals of different widths.
    for (let i = 0; i < 7; i++) {
      const hx = hash1(i * 13, 32, 9941);
      const w = 0.004 + hash1(i * 7, 16, 9951) * 0.012;
      const drop = 0.25 + hash1(i * 23, 16, 9961) * 0.6;
      if (Math.abs(u - hx) < w && v > 1 - drop) c = rgb(0x060504);
    }
    // Lantern lights on the far side, small and warm, with a halo.
    for (let i = 0; i < 9; i++) {
      const lx = hash1(i * 29, 64, 9971);
      const ly = 0.18 + hash1(i * 17 + 3, 64, 9981) * 0.7;
      const d = Math.hypot((u - lx) * 1.4, v - ly);
      const near = 1 - Math.abs(lx - 0.5) * 2;
      const size2 = 0.006 + near * 0.008;
      if (d < size2 * 5) c = mix(c, rgb(0xffcf86), Math.pow(Math.max(0, 1 - d / (size2 * 5)), 2.4) * 0.9);
    }
    return c;
  });

/**
 * Out of the trunk into the forest, at night. The one place in the map with a
 * sky in it, and it is nearly closed over.
 */
export const backdropForest = (): THREE.Texture =>
  colorTexture('hw.bdForest', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    // Sky: cold, and darker at the bottom where the canopy closes in.
    let c = mix(rgb(0x0e1420), rgb(0x2a3850), Math.pow(v, 1.3));
    // Mist banded through the trunks.
    c = mix(c, rgb(0x3a4a5e), Math.max(0, n2s(x, y, size, 3, 7, 10001, 3) - 0.44) * 1.4 * (1 - v * 0.5));
    // The moon, off centre and behind the mist.
    const md = Math.hypot((u - 0.68) * 1.05, v - 0.78);
    c = mix(c, rgb(0xbcc8d8), Math.pow(Math.max(0, 1 - md / 0.22), 3) * 0.75);
    if (md < 0.035) c = mix(c, rgb(0xe6ecf2), 0.85);

    // Trunks: hard black verticals of different widths, nearer ones wider.
    for (let i = 0; i < 14; i++) {
      const tx = hash1(i * 19, 64, 10011);
      const w = 0.006 + Math.pow(hash1(i * 31, 32, 10021), 3) * 0.06;
      const lean = (hash1(i * 7, 16, 10031) - 0.5) * 0.12;
      if (Math.abs(u - tx - lean * v) < w) return rgb(0x05070a);
    }
    // The canopy closing over the top.
    const leaf = n2(x, y, size, 7, 10041, 3);
    if (v > 0.72 + leaf * 0.2) return rgb(0x060809);
    // Ground fog at the bottom.
    c = mix(c, rgb(0x18202c), Math.max(0, 0.2 - v) * 4);
    return c;
  });

/**
 * Looking up the inside of the trunk into the canopy: leaves against a grey sky,
 * a long way up, with moths crossing it.
 */
export const backdropCanopy = (): THREE.Texture =>
  colorTexture('hw.bdCanopy', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    // The light at the top of the shaft.
    const d = Math.hypot((u - 0.5) * 1.15, (v - 0.62) * 1.0);
    let c = mix(rgb(0x8fa08a), rgb(0x101812), Math.pow(sat(d / 0.5), 0.75));
    // Leaves in front of it, in layers.
    for (let layer = 0; layer < 3; layer++) {
      const scale = 9 + layer * 7;
      const mask = n2(x, y, size, scale, 10101 + layer * 13, 3);
      const dark = shade(mix(rgb(0x2a3a26), rgb(0x121a12), layer / 2), 1);
      if (mask > 0.56 - layer * 0.03) c = mix(c, dark, 0.82);
    }
    // Branches crossing: black, and they have to be thick enough to be branches.
    for (let i = 0; i < 5; i++) {
      const a = hash1(i * 11, 16, 10111) * Math.PI;
      const off = hash1(i * 23, 16, 10121) - 0.5;
      const p = (u - 0.5) * Math.sin(a) + (v - 0.5) * Math.cos(a);
      if (Math.abs(p - off) < 0.008 + hash1(i * 5, 8, 10131) * 0.016) c = rgb(0x080a08);
    }
    // Moths: pale specks in the light.
    const m = hash1(Math.floor(x / 3) * 43 + Math.floor(y / 3) * 17, 2048, 10141);
    if (m > 0.9975 && d < 0.44) c = mix(c, rgb(0xe0dcc0), 0.8);
    return c;
  });

/**
 * Down into the root void: black, with pale things moving in it. Nearly empty on
 * purpose - what makes a hole frightening is that you cannot resolve the bottom.
 */
export const backdropRoots = (): THREE.Texture =>
  colorTexture('hw.bdRoots', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    let c = mix(rgb(0x100c0a), rgb(0x030302), Math.pow(1 - v, 0.6));
    // Roots crossing the void, going away.
    for (let i = 0; i < 9; i++) {
      const a = hash1(i * 13, 32, 10201) * Math.PI;
      const off = (hash1(i * 29, 32, 10211) - 0.5) * 1.2;
      const p = (u - 0.5) * Math.sin(a) + (v - 0.5) * Math.cos(a);
      const w = 0.004 + Math.pow(hash1(i * 7, 16, 10221), 2) * 0.03;
      const near = hash1(i * 3, 8, 10231);
      if (Math.abs(p - off) < w) c = mix(c, shade(rgb(0x4a3c2a), 0.3 + near * 0.7), 0.9);
    }
    // Foxfire deep down, cold and small.
    for (let i = 0; i < 6; i++) {
      const lx = hash1(i * 37, 64, 10241);
      const ly = hash1(i * 19 + 5, 64, 10251) * 0.55;
      const d = Math.hypot((u - lx) * 1.3, v - ly);
      if (d < 0.06) c = mix(c, rgb(0x6ad0a0), Math.pow(1 - d / 0.06, 2.6) * 0.55);
    }
    return c;
  });

/* --- shared-art skins ------------------------------------------------------------- */

/**
 * Shared art is NOT batched, so a door, a chest and a locker carry a box's own
 * UVs - one repeat over the whole leaf. A tiling wall map on a door is a single
 * smeared patch that reads as a blank slab (docs/art/SHARED_ART.md §3.1), so
 * these four are composed IN 0..1 SPACE: a border where a border goes, a panel
 * where a panel goes, and the detail at the size it would really be.
 */

/** A door of grown heartwood: two leaves of carved panel with an iron-oak brace. */
export const doorSkin = (): THREE.Texture =>
  colorTexture('hw.doorSkin', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const border = Math.min(u, 1 - u, v, 1 - v);

    // The stiles and rails: darker, with the grain running the length of each.
    let c = mix(rgb(0x5c3f22), rgb(0x7d5730), n2s(x, y, size, 4, 14, 10301, 3));
    if (border > 0.13) {
      // The panel. A carved leaf-and-vine roundel, cut in relief.
      const du = u - 0.5;
      const dv = v - 0.52;
      const d = Math.hypot(du, dv * 1.35);
      c = mix(rgb(0x6b4a28), rgb(0x8e6537), n2s(x, y, size, 3, 12, 10311, 3));
      const a = Math.atan2(dv, du);
      // Vine ring.
      const ringD = Math.abs(d - 0.24);
      if (ringD < 0.022 + Math.sin(a * 7) * 0.008) c = mix(c, rgb(0xb08a4e), 0.8);
      // Leaves off the ring.
      const lobe = Math.abs(((a / Math.PI) * 6) % 1 - 0.5) * 2;
      if (Math.abs(d - 0.24) < 0.075 && lobe > 0.62) c = mix(c, rgb(0x9c7440), 0.7);
      // The boss at the centre.
      if (d < 0.055) c = mix(c, rgb(0xc09a58), 1 - d / 0.06);
      // Panel field shadow toward its edges.
      c = shade(c, 0.86 + Math.min(1, (border - 0.13) * 8) * 0.2);
    }
    // The wrought strap hinge and its nails, on the left third.
    if (v > 0.2 && v < 0.28 && u < 0.62) c = mix(c, rgb(0x3a3a3c), 0.9);
    if (v > 0.72 && v < 0.8 && u < 0.62) c = mix(c, rgb(0x3a3a3c), 0.9);
    const nail = ((u * 9) % 1 < 0.16) && ((v > 0.21 && v < 0.27) || (v > 0.73 && v < 0.79));
    if (nail && u < 0.6) c = mix(c, rgb(0x6a6a68), 0.8);
    // A dark shadow line all round the leaf, so it reads as a door in a frame.
    c = shade(c, 0.45 + Math.min(1, border * 22) * 0.62);
    return shade(c, grime(x, y, size, 10321, 0.4));
  });

/** The way out: living wood, still leafed, with light behind it. */
export const exitDoorSkin = (): THREE.Texture =>
  colorTexture('hw.exitSkin', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const border = Math.min(u, 1 - u, v, 1 - v);
    let c = mix(rgb(0x4a4432), rgb(0x6a6146), n2s(x, y, size, 4, 12, 10401, 3));
    if (border > 0.11) {
      // A trunk of pale living wood, splitting into three boughs and leafing out.
      c = mix(rgb(0x38402e), rgb(0x2a3226), n2(x, y, size, 8, 10411, 3));
      const trunkW = 0.055 - Math.max(0, v - 0.45) * 0.05;
      if (Math.abs(u - 0.5) < trunkW && v < 0.62) c = mix(rgb(0xa8b088), rgb(0xd0d4a8), v);
      for (const s of [-1, 1] as const) {
        const t = sat((v - 0.36) / 0.42);
        const bx = 0.5 + s * t * 0.3;
        if (Math.abs(u - bx) < 0.03 * (1 - t * 0.6) && v > 0.36) c = mix(rgb(0xa8b088), rgb(0xd8dcb0), t);
      }
      // Leaf mass at the top, luminous.
      const canopy = n2(x, y, size, 11, 10421, 3);
      if (v > 0.62 && canopy > 0.46 - (v - 0.62) * 0.5) c = mix(rgb(0x7ac088), rgb(0xd8f0a0), canopy);
      // Roots at the bottom.
      if (v < 0.3 && ridge(n2s(x, y, size, 9, 4, 10431, 2), 0.06) > 0.35) c = mix(c, rgb(0x8a9070), 0.7);
    }
    c = shade(c, 0.5 + Math.min(1, border * 20) * 0.6);
    return c;
  });

/** A chest woven and lidded, banded with copper the tree has grown around. */
export const chestSkin = (): THREE.Texture =>
  colorTexture('hw.chestSkin', 128, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    // Wicker field.
    const cols = 12;
    const rows = 8;
    const over = (Math.floor(u * cols) + Math.floor(v * rows)) % 2 === 0;
    const t = over ? (v * rows) % 1 : (u * cols) % 1;
    let c = mix(rgb(0x7a5c30), rgb(0x9e7c44), hash1(Math.floor(u * cols) * 7 + Math.floor(v * rows), 64, 10501));
    c = shade(c, 0.55 + Math.pow(Math.sin(t * Math.PI), 0.6) * 0.6);
    // Copper bands, verdigrised, across the thirds.
    for (const by of [0.16, 0.84] as const) {
      if (Math.abs(v - by) < 0.055) c = mix(rgb(0x6e5a2e), rgb(0x4e7a62), n2(x, y, size, 9, 10511, 3));
    }
    // The hasp, dead centre.
    if (Math.abs(u - 0.5) < 0.07 && v > 0.34 && v < 0.66) c = mix(rgb(0x5a6a58), rgb(0x86a08c), n2(x, y, size, 14, 10521, 2));
    return shade(c, grime(x, y, size, 10531, 0.4));
  });

/** A locker: a standing cupboard of birch board with a carved vent. */
export const lockerSkin = (): THREE.Texture =>
  colorTexture('hw.lockerSkin', 128, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    let c = mix(rgb(0x9e9482), rgb(0xbdb49c), n2s(x, y, size, 3, 14, 10601, 3));
    // Board seams down the leaf.
    if (Math.abs(((u * 3) % 1) - 0.5) > 0.46) c = shade(c, 0.6);
    // The vent: a pierced pattern of slots high up.
    if (v > 0.62 && v < 0.88 && u > 0.2 && u < 0.8) {
      const slot = ((v - 0.62) * 14) % 1;
      if (slot < 0.45) c = mix(c, rgb(0x1a1814), 0.85);
    }
    // Lenticel dashes, because it is birch.
    const row = Math.floor(v * 22);
    if (hash1(row, 22, 10611) > 0.55 && ((u * 9) % 1) < 0.3) c = mix(c, rgb(0x33291f), 0.65);
    return shade(c, grime(x, y, size, 10621, 0.35));
  });
