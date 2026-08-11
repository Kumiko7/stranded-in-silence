/**
 * The Sepulchre of the Nine - every surface, generated as procedural pixel data.
 *
 * Same three rules as everywhere else in art (art/lib/textures.ts): no canvas, no
 * `Math.random()`, cached at module scope. Every recipe below is a pure function
 * of pixel coordinates, so a room builds identically in a browser, on a peer's
 * machine, and headless inside `scripts/validateArt.mjs`.
 *
 * `*_TILE` is the size in METRES that one repeat covers. `merge.ts` bakes UVs in
 * world units, so a texture keeps its density whether it lands on a 0.3 m coffin
 * lid or a 24 m column hall floor.
 *
 * The pack splits down the middle, and the two halves share no colour and no
 * frequency, so a player registers the change before reading a single prop:
 *
 * - **SANCTUM** - the crypt the Order built. Cold grey limestone ashlar, lime
 *   plaster failing off it, brick vaulting, flagstones polished by six hundred
 *   years of feet, bone stacked as revetment. Straight courses, tight joints,
 *   everything losing to damp.
 * - **NECROPOLIS** - the dynastic tomb the Order built *on top of*, and never
 *   understood. Warm ochre sandstone, painted plaster registers, mudbrick, gold
 *   leaf, drifted sand. Bigger blocks, batter rather than plumb, dry instead of
 *   wet.
 * - **THE ROT** - what is coming up through both. Mycelial felt, moss, root. It
 *   has no courses at all, and it is the only family that glows.
 *
 * Albedos are mid-tones. Colour is converted to linear space before lighting,
 * where a near-black picked in a colour wheel is effectively 0 and no amount of
 * candlelight brings it back. This place is dark because of two lamps a room and
 * a fog density of 0.05, not because the stone is black.
 */
import type * as THREE from 'three';
import { colorTexture, dataTexture, fbm, hash1, mix, normalTexture, rgb, shade } from '../../lib/textures';

const SIZE = 256;

/** Isotropic fractal noise over a texture, seamless at the edges. */
const n2 = (x: number, y: number, size: number, scale: number, seed: number, octaves = 4): number =>
  fbm((x / size) * scale, (y / size) * scale, scale, scale, seed, octaves);

/** Stretched noise: `sx` repeats across, `sy` down. Both wrap. */
const n2s = (x: number, y: number, size: number, sx: number, sy: number, seed: number, octaves = 3): number =>
  fbm((x / size) * sx, (y / size) * sy, sx, sy, seed, octaves);

/**
 * Ridged noise: 1 exactly on the zero-crossing of a noise field, 0 away from it.
 * One function does hairline cracks in plaster, the veining in marble, mycelial
 * threads and the crazing on old glaze - the most useful primitive in the pack.
 */
const ridge = (n: number, width: number): number => Math.max(0, 1 - Math.abs(n - 0.5) / width);

/**
 * Damp running DOWN a surface. Every vertical face in this place has water
 * coming out of the joint above it, and this is the one function that puts it
 * there: long vertical runs plus a few slow blotches.
 */
function seep(x: number, y: number, size: number, seed: number, strength: number): number {
  const runs = n2s(x, y, size, 6, 2, seed, 4);
  const blotch = n2(x, y, size, 5, seed + 61, 3);
  return Math.max(0, runs - 0.52) * strength * 1.8 + Math.max(0, blotch - 0.62) * strength;
}

/** Generic grime multiplier around 1, for anything that has stood in the dark. */
function soil(x: number, y: number, size: number, seed: number, strength: number): number {
  const patch = n2(x, y, size, 5, seed, 4);
  return 1 - Math.max(0, patch - 0.5) * strength * 1.4;
}

/**
 * A course of blocks: which one you are in, and how close you are to its joint.
 *
 * Both stone families come out of this. The masonry differs only in proportion
 * and in how much the courses stagger - the Order laid thin tight ashlar, the
 * dynasty laid blocks a man could not lift - so sharing one decomposition is
 * what keeps the two families reading as the same *kind* of thing built by two
 * different peoples.
 */
function coursedAt(
  x: number,
  y: number,
  blockW: number,
  blockH: number,
  jointPx: number,
  stagger: number,
  seed: number,
): { joint: number; block: number; u: number; v: number } {
  const course = Math.floor(y / blockH);
  const ox = ((course % 2) * stagger + hash1(course, 32, seed) * 0.3) * blockW;
  const inY = y % blockH;
  const inX = (x + ox) % blockW;
  const dJoint = Math.min(Math.min(inY, blockH - inY), Math.min(inX, blockW - inX));
  return {
    joint: Math.max(0, 1 - dJoint / jointPx),
    block: hash1(course * 61 + Math.floor((x + ox) / blockW) * 17, 128, seed + 7),
    u: inX / blockW,
    v: inY / blockH,
  };
}

/* --- shared roughness maps -------------------------------------------------- */

/**
 * Damp roughness. Nothing in the Sanctum is dry: water pools in the low spots of
 * every surface and dries on the high ones, and that variation is most of what
 * tells the eye a stone is cold rather than dusty.
 */
export const dampRoughness = (): THREE.Texture =>
  dataTexture('crypt.dampRough', 128, (x, y, size) => 0.42 + Math.pow(n2(x, y, size, 8, 4201), 1.4) * 0.5);

/** Dry roughness, for the Necropolis: broken up rather than pooled. Never shiny. */
export const dryRoughness = (): THREE.Texture =>
  dataTexture('crypt.dryRough', 128, (x, y, size) => 0.7 + n2(x, y, size, 13, 4307) * 0.3);

/** Scuffed metal: polished where hands and rope go, dull with rust elsewhere. */
export const ironRoughness = (): THREE.Texture =>
  dataTexture('crypt.ironRough', 128, (x, y, size) => 0.34 + n2s(x, y, size, 16, 5, 4409) * 0.55);

/** Wax, bone and horn: soft, waxy, faintly translucent-looking. */
export const waxRoughness = (): THREE.Texture =>
  dataTexture('crypt.waxRough', 128, (x, y, size) => 0.4 + n2(x, y, size, 6, 4507) * 0.34);

/* --- SANCTUM: limestone, plaster, brick, bone -------------------------------- */

export const ASHLAR_TILE = 2.4;

function ashlarAt(x: number, y: number, size: number): { joint: number; block: number; pit: number; tool: number } {
  const { joint, block, u, v } = coursedAt(x, y, 78, 42, 2.6, 0.5, 5101);
  // Chisel draft: the diagonal tooling a mason leaves on a dressed face. It runs
  // the same way on every block of a course and flips course to course, which is
  // what makes a wall read as *cut* rather than as noise on a grid.
  const dir = block > 0.5 ? 1 : -1;
  const tool = ridge(n2s(x + dir * y * 0.6, y, size, 26, 7, 5203, 2), 0.16) * 0.5;
  // Pitting: limestone weathers as small dark holes, not as an even fade.
  const pit = Math.max(0, n2(x, y, size, 22, 5307, 3) - 0.58) * 2.4;
  return { joint, block, pit, tool: tool * (0.4 + Math.abs(u - 0.5) * 0.6 + v * 0.2) };
}

/**
 * Dressed limestone ashlar, six hundred years cold. Grey with a green cast in
 * the damp, a paler salt bloom creeping out of the joints, and hairline cracks
 * that cross a course rather than following it.
 */
export const ashlar = (): THREE.Texture =>
  colorTexture('crypt.ashlar', SIZE, (x, y, size) => {
    const { joint, block, pit, tool } = ashlarAt(x, y, size);
    const damp = seep(x, y, size, 5401, 0.85);
    const bloom = Math.max(0, n2(x, y, size, 4, 5503, 3) - 0.56) * 1.9;
    const crack = ridge(n2(x, y, size, 3.2, 5601, 4), 0.012);

    let base = mix(rgb(0x6c6f6d), rgb(0x82857f), block * 0.65 + tool * 0.5);
    // Mortar is paler and rougher than the stone, and it is where the salt is.
    base = mix(base, rgb(0x8d8c82), joint * 0.75);
    base = mix(base, rgb(0x9ea19a), Math.min(0.5, bloom));
    // Damp arrives from above and darkens with a green cast, never a brown one.
    base = mix(base, rgb(0x414d45), Math.min(0.62, damp));
    base = mix(base, rgb(0x3d403f), pit * 0.5 + crack * 0.7);
    return shade(base, (0.88 + block * 0.2) * soil(x, y, size, 53, 0.3));
  });

export const ashlarNormal = (): THREE.Texture =>
  normalTexture(
    'crypt.ashlarN',
    SIZE,
    (x, y, size) => {
      const { joint, block, pit, tool } = ashlarAt(x, y, size);
      return 0.5 + block * 0.14 + tool * 0.22 - joint * 0.55 - pit * 0.3;
    },
    2.5,
  );

export const FLAG_TILE = 2.2;

function flagAt(x: number, y: number, size: number): { joint: number; slab: number; wear: number; chip: number } {
  // Big irregular flags, laid without a bond. Wider than they are deep so a
  // floor has a direction.
  const { joint, block, u, v } = coursedAt(x, y, 92, 64, 3.2, 0.36, 6101);
  // The walking line: a broad soft path polished into the middle of the floor.
  const wear = Math.max(0, n2s(x, y, size, 3, 5, 6203, 3) - 0.36) * 1.6;
  // Corners break off flags before their middles do.
  const corner = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5));
  const chip = corner > 0.42 ? Math.max(0, n2(x, y, size, 18, 6307, 2) - 0.5) * 2.2 : 0;
  return { joint, slab: block, wear: Math.min(1, wear), chip };
}

/** Flagstones worn hollow down the middle, with grave numbers cut into some. */
export const flagstone = (): THREE.Texture =>
  colorTexture('crypt.flag', SIZE, (x, y, size) => {
    const { joint, slab, wear, chip } = flagAt(x, y, size);
    const grit = n2(x, y, size, 30, 6401, 3);
    const wet = Math.max(0, n2(x, y, size, 6, 6503, 3) - 0.6) * 2;

    let base = mix(rgb(0x666560), rgb(0x7d7b72), slab * 0.7 + grit * 0.25);
    // Polished stone goes lighter and colder, not darker: it is the dirt in the
    // joints that is dark, and that contrast is the whole read of an old floor.
    base = mix(base, rgb(0x8f8d84), wear * 0.5);
    base = mix(base, rgb(0x3c3b36), joint * 0.85);
    base = mix(base, rgb(0x55534c), chip * 0.6);
    base = mix(base, rgb(0x3f4645), Math.min(0.45, wet));
    return shade(base, (0.9 + grit * 0.16) * soil(x, y, size, 61, 0.34));
  });

export const flagNormal = (): THREE.Texture =>
  normalTexture(
    'crypt.flagN',
    SIZE,
    (x, y, size) => {
      const { joint, slab, wear, chip } = flagAt(x, y, size);
      return 0.5 + slab * 0.1 - joint * 0.6 - wear * 0.12 - chip * 0.35;
    },
    2.2,
  );

export const SLAB_TILE = 2.9;

function slabAt(x: number, y: number, size: number): { joint: number; slab: number; incised: number; cross: number } {
  const { joint, block, u, v } = coursedAt(x, y, 120, 76, 3.4, 0.0, 7101);
  // Ledger stones: an incised border, a cross down the middle of some, and a
  // band of lettering across the head of others. All shallow - this is a floor
  // people have walked on since it was carved.
  const border = Math.min(Math.abs(u - 0.12), Math.abs(u - 0.88), Math.abs(v - 0.12), Math.abs(v - 0.88));
  const inBorder = u > 0.1 && u < 0.9 && v > 0.1 && v < 0.9 ? Math.max(0, 1 - border / 0.02) : 0;
  const hasCross = block > 0.55;
  const cross = hasCross
    ? Math.max(
        Math.abs(u - 0.5) < 0.035 && v > 0.2 && v < 0.78 ? 1 : 0,
        Math.abs(v - 0.6) < 0.03 && u > 0.32 && u < 0.68 ? 1 : 0,
      )
    : 0;
  // Lettering: a run of short vertical strokes, which at this texel density is
  // exactly what an inscription looks like from standing height.
  const line = block > 0.55 ? 0.28 : 0.62;
  const letter =
    Math.abs(v - line) < 0.022 && u > 0.2 && u < 0.8 && hash1(Math.floor(u * 46), 64, 7203) > 0.32 ? 1 : 0;
  return { joint, slab: block, incised: Math.max(inBorder, letter * 0.8), cross };
}

/** Grave slabs: ledger stones with their inscriptions half walked away. */
export const graveSlab = (): THREE.Texture =>
  colorTexture('crypt.slab', SIZE, (x, y, size) => {
    const { joint, slab, incised, cross } = slabAt(x, y, size);
    const wear = n2s(x, y, size, 3, 4, 7307, 3);
    const cut = Math.max(incised, cross);

    let base = mix(rgb(0x5f5e5a), rgb(0x767469), slab * 0.6 + wear * 0.45);
    // Dirt collects in a cut line, which is the only reason a shallow carving
    // reads at all under one candle.
    base = mix(base, rgb(0x35342f), cut * 0.72);
    base = mix(base, rgb(0x33322d), joint * 0.9);
    base = mix(base, rgb(0x4a5450), Math.min(0.4, seep(x, y, size, 7401, 0.6)));
    return shade(base, (0.9 + wear * 0.18) * soil(x, y, size, 71, 0.3));
  });

export const slabNormal = (): THREE.Texture =>
  normalTexture(
    'crypt.slabN',
    SIZE,
    (x, y, size) => {
      const { joint, incised, cross } = slabAt(x, y, size);
      return 0.55 - joint * 0.5 - Math.max(incised, cross) * 0.4;
    },
    2.0,
  );

export const EARTH_TILE = 2.0;

/** Grave earth: dug, backfilled and dug again. Bone chips and pebbles in it. */
export const graveEarth = (): THREE.Texture =>
  colorTexture('crypt.earth', SIZE, (x, y, size) => {
    const clod = n2(x, y, size, 9, 8101, 4);
    const fine = n2(x, y, size, 34, 8203, 3);
    // Spade cuts: straight-ish edges where a trench was backfilled, and the one
    // thing that separates a grave from a patch of dirt.
    const cut = ridge(n2s(x, y, size, 2.4, 6, 8307, 2), 0.03);
    const bone = Math.max(0, n2(x, y, size, 46, 8401, 2) - 0.74) * 4;
    const root = ridge(n2(x, y, size, 7, 8503, 4), 0.02);

    let base = mix(rgb(0x453b30), rgb(0x5d5142), clod * 0.9 + fine * 0.2);
    base = mix(base, rgb(0x332b23), cut * 0.5);
    base = mix(base, rgb(0x2d2620), Math.max(0, clod - 0.62) * 1.6);
    base = mix(base, rgb(0x9d9782), Math.min(0.75, bone));
    base = mix(base, rgb(0x6e6a4e), root * 0.4);
    return shade(base, 0.9 + fine * 0.22);
  });

export const earthNormal = (): THREE.Texture =>
  normalTexture(
    'crypt.earthN',
    SIZE,
    (x, y, size) => n2(x, y, size, 9, 8101, 4) * 0.7 + n2(x, y, size, 34, 8203, 3) * 0.3,
    3.0,
  );

export const PLASTER_TILE = 2.4;

function plasterAt(x: number, y: number, size: number): { flake: number; lip: number; crack: number; stone: number } {
  // Limewash comes off in sheets with a hard edge, and the interest is entirely
  // in that edge. The threshold is high on purpose: what sells failing plaster
  // is a few hard-edged holes in a lot of plaster, not an even mottle.
  const field = n2(x, y, size, 4, 9101, 4);
  const flake = field > 0.62 ? 1 : 0;
  const lip = ridge(field - 0.04, 0.016);
  const crack = ridge(n2(x, y, size, 2.6, 9203, 4), 0.009) + ridge(n2(x, y, size, 6, 9307, 3), 0.006) * 0.6;
  return { flake, lip, crack: Math.min(1, crack), stone: n2(x, y, size, 20, 9401, 3) };
}

/**
 * Limewashed plaster over rubble, painted with a dado band a long time ago. It
 * is the palest surface in the pack, so it is doing the work of a light source
 * in half the Sanctum: keep it a bone white rather than a paper one, or a room
 * with two walls of it stops having any darkness in it at all.
 */
export const limePlaster = (): THREE.Texture =>
  colorTexture('crypt.plaster', SIZE, (x, y, size) => {
    const { flake, lip, crack, stone } = plasterAt(x, y, size);
    const damp = seep(x, y, size, 9503, 1.0);
    const soot = Math.max(0, n2s(x, y, size, 3, 7, 9601, 3) - 0.56) * 1.8;

    let base = mix(rgb(0x9d9887), rgb(0xaea895), n2(x, y, size, 9, 9701, 3) * 0.9);
    // Under the plaster is the rubble wall, a good deal darker and warmer.
    base = mix(base, mix(rgb(0x6a655a), rgb(0x7b7466), stone), flake * 0.92);
    base = mix(base, rgb(0xc0bba8), lip * 0.5);
    base = mix(base, rgb(0x54514a), crack * 0.55);
    base = mix(base, rgb(0x5b6156), Math.min(0.6, damp));
    base = mix(base, rgb(0x3f3b35), Math.min(0.5, soot));
    return shade(base, 0.9 + stone * 0.14);
  });

export const plasterNormal = (): THREE.Texture =>
  normalTexture(
    'crypt.plasterN',
    SIZE,
    (x, y, size) => {
      const { flake, crack, stone } = plasterAt(x, y, size);
      return 0.6 - flake * 0.35 - crack * 0.3 + stone * 0.1;
    },
    2.2,
  );

// 2.4 m, not 1.5: five repeats of a 1.5 m brick across an 8 m vault made the
// bricks 6 cm and the whole ceiling read as basketwork.
export const BRICK_TILE = 2.4;

function brickAt(x: number, y: number): { joint: number; brick: number } {
  const { joint, block } = coursedAt(x, y, 62, 22, 3.0, 0.5, 10101);
  return { joint, brick: block };
}

/** Thin medieval brick, as the vaults and the relieving arches are built. */
export const brickVault = (): THREE.Texture =>
  colorTexture('crypt.brick', SIZE, (x, y, size) => {
    const { joint, brick } = brickAt(x, y);
    const burn = n2(x, y, size, 16, 10203, 3);
    const damp = seep(x, y, size, 10307, 0.7);
    const salt = Math.max(0, n2(x, y, size, 5, 10401, 3) - 0.58) * 2;

    // Hand-made brick is never one colour: some are underfired pink, some are
    // burnt near-black, and that per-brick spread is the whole texture.
    //
    // The reds are pulled well back from where they started (0x7d5340 /
    // 0x9a6a4e). Every vault in this pack is seen under tallow light, which is
    // itself orange, and a saturated brick under an orange lamp came out as a red
    // barn roof rather than as masonry. Brick that reads as brick in this map is
    // nearly grey with a warm cast, and the LIGHT is what makes it warm.
    let base = mix(rgb(0x6b5a4e), rgb(0x877462), brick);
    if (brick > 0.86) base = mix(base, rgb(0x3d3832), 0.7);
    base = mix(base, rgb(0x9a968a), joint * 0.9);
    base = mix(base, rgb(0xa9a897), Math.min(0.55, salt));
    base = mix(base, rgb(0x44443c), Math.min(0.5, damp));
    return shade(base, (0.88 + burn * 0.22) * soil(x, y, size, 83, 0.3));
  });

export const brickNormal = (): THREE.Texture =>
  normalTexture('crypt.brickN', SIZE, (x, y) => 0.55 - brickAt(x, y).joint * 0.6, 2.6);

export const BONE_TILE = 1.15;

function boneAt(x: number, y: number, size: number): { bone: number; gap: number; skull: number; grain: number } {
  // Revetment: courses of long bones laid end-on, with a course of skulls every
  // third. The bones are the STRUCTURE, so they have to be a lattice with real
  // gaps between them - an even field of pale lumps reads as gravel.
  const courseH = 30;
  const course = Math.floor(y / courseH);
  const isSkull = course % 3 === 2;
  const pitch = isSkull ? 44 : 26;
  const ox = hash1(course, 32, 11101) * pitch;
  const inX = (x + ox) % pitch;
  const inY = y % courseH;
  const u = inX / pitch - 0.5;
  const v = inY / courseH - 0.5;

  if (isSkull) {
    // A skull is a dome with two dark pits and a shadow under the arch.
    const d = Math.hypot(u * 1.5, (v + 0.06) * 1.25);
    const dome = Math.max(0, 1 - d / 0.42);
    const socketL = Math.max(0, 1 - Math.hypot((u + 0.11) * 1.9, (v + 0.06) * 1.5) / 0.12);
    const socketR = Math.max(0, 1 - Math.hypot((u - 0.11) * 1.9, (v + 0.06) * 1.5) / 0.12);
    const nose = Math.max(0, 1 - Math.hypot(u * 4.5, (v - 0.14) * 1.6) / 0.1);
    return { bone: dome, gap: 1 - dome, skull: Math.max(socketL, socketR, nose * 0.8), grain: n2(x, y, size, 40, 11203, 2) };
  }
  const shaft = Math.max(0, 1 - Math.abs(v) / 0.34) * Math.max(0, 1 - Math.pow(Math.abs(u) / 0.46, 6));
  // Condyles: a femur is fat at both ends, and that is what stops a course of
  // them reading as a stack of dowels.
  const knuckle = Math.max(0, 1 - Math.hypot((Math.abs(u) - 0.4) * 3.4, v * 1.5) / 0.3);
  const bone = Math.min(1, Math.max(shaft, knuckle) * 1.3);
  return { bone, gap: 1 - bone, skull: 0, grain: n2(x, y, size, 40, 11203, 2) };
}

/**
 * Ossuary revetment: the walls of the bone chapel, faced in the dead. Ivory
 * rather than white, because a wall of white in a dark room is the loudest thing
 * a player will ever see and this is supposed to be a *surface*.
 */
export const boneCourse = (): THREE.Texture =>
  colorTexture('crypt.bone', SIZE, (x, y, size) => {
    const { bone, gap, skull, grain } = boneAt(x, y, size);
    const stain = n2(x, y, size, 7, 11307, 3);

    let base = mix(rgb(0x3a352c), rgb(0xa79c82), bone);
    base = mix(base, rgb(0x8d8265), Math.max(0, stain - 0.5) * 1.6 * bone);
    // Sockets and the shadow between bones. This is where the horror is: a bone
    // wall is frightening because of the holes, not because of the ivory.
    base = mix(base, rgb(0x1d1a15), Math.max(skull, gap * 0.85));
    return shade(base, 0.88 + grain * 0.2);
  });

export const boneNormal = (): THREE.Texture =>
  normalTexture(
    'crypt.boneN',
    SIZE,
    (x, y, size) => {
      const { bone, skull, grain } = boneAt(x, y, size);
      return bone * 0.85 - skull * 0.5 + grain * 0.1;
    },
    3.4,
  );

/* --- NECROPOLIS: sandstone, painted plaster, mudbrick, sand ----------------- */

export const SANDSTONE_TILE = 2.7;

function sandstoneAt(x: number, y: number, size: number): { joint: number; block: number; bed: number; peck: number } {
  // Blocks a course tall and two courses wide, laid with barely any joint at
  // all: the dynasty ground its stone to fit rather than bedding it in mortar.
  const { joint, block, v } = coursedAt(x, y, 118, 58, 1.9, 0.42, 12101);
  // Bedding planes: sandstone is a laid-down rock and shows the layers it was
  // laid down in, faintly, running with the block rather than with the wall.
  const bed = Math.sin((v + block * 0.4) * Math.PI * 6) * 0.5 + 0.5;
  // Peck marks from a copper chisel, all over the face.
  const peck = Math.max(0, n2(x, y, size, 44, 12203, 2) - 0.52) * 2;
  return { joint, block, bed, peck };
}

/** Dressed ochre sandstone, cut with copper, dry for four thousand years. */
export const sandstoneBlock = (): THREE.Texture =>
  colorTexture('crypt.sandstone', SIZE, (x, y, size) => {
    const { joint, block, bed, peck } = sandstoneAt(x, y, size);
    const dust = n2(x, y, size, 6, 12307, 3);
    const iron = Math.max(0, n2(x, y, size, 3.4, 12401, 3) - 0.54) * 2.2;

    let base = mix(rgb(0x9a7c50), rgb(0xb59a68), block * 0.7 + bed * 0.22);
    // Iron staining: the rust-red blush that runs through every quarry face.
    base = mix(base, rgb(0xa4643a), Math.min(0.42, iron));
    base = mix(base, rgb(0x6d5636), joint * 0.8);
    base = mix(base, rgb(0x8b7452), peck * 0.35);
    // Dust lies on everything down here, and it is warmer and paler than the
    // stone rather than grey.
    base = mix(base, rgb(0xc2b291), Math.max(0, dust - 0.58) * 1.3);
    return shade(base, 0.88 + block * 0.2);
  });

export const sandstoneNormal = (): THREE.Texture =>
  normalTexture(
    'crypt.sandstoneN',
    SIZE,
    (x, y, size) => {
      const { joint, block, bed, peck } = sandstoneAt(x, y, size);
      return 0.5 + block * 0.1 + bed * 0.08 - joint * 0.45 - peck * 0.25;
    },
    2.4,
  );

/**
 * 3.4 m, not 2.3. At 2.3 the four registers were 57 cm each, the figures 45 cm,
 * and a whole wall of them read as a bank of labelled index-card drawers - which
 * is a long way from a painted tomb. At 3.4 a register is 85 cm and a figure is
 * two thirds of a metre, which is the size a figure has to be to read as one.
 */
export const FRIEZE_TILE = 3.4;

/**
 * Painted plaster in registers: bands of figures and glyph columns divided by
 * ruled lines, in the six pigments the dynasty had.
 *
 * The figures are deliberately *readable as figures and no more*. At two metres
 * under one oil lamp, a wall painting is a rhythm of ochre bodies and blue-black
 * wigs on a cream ground, and trying for anatomy at 256 px gets you mud.
 */
export const paintedFrieze = (): THREE.Texture =>
  colorTexture('crypt.frieze', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const ground = mix(rgb(0xb2a181), rgb(0xc4b492), n2(x, y, size, 8, 13101, 3) * 0.9);
    const loss = n2(x, y, size, 3.6, 13203, 4);
    const crack = ridge(n2(x, y, size, 2.8, 13307, 4), 0.008);

    // Three registers, the middle one a glyph column band. Four at this tile size
    // is a filing cabinet.
    const band = v * 3;
    const reg = Math.floor(band);
    const inBand = band - reg;
    let paint = ground;

    if (inBand < 0.022 || inBand > 0.978) {
      // The ruled divider between registers. Thin and dull: at 6 % of a register it
      // was a 10 cm red stripe running the length of every wall, and three of those
      // are what turned this texture into shelving.
      paint = mix(rgb(0x8a4a30), ground, 0.35);
    } else if (reg === 1) {
      // Glyph columns: blocky marks in ruled vertical lanes.
      const lane = Math.floor(u * 9);
      const inLane = (u * 9) % 1;
      if (inLane > 0.16 && inLane < 0.84) {
        const cellV = Math.floor((inBand - 0.06) * 9);
        const roll = hash1(lane * 31 + cellV * 7, 128, 13401);
        if (roll > 0.42) {
          const glyph = roll > 0.86 ? rgb(0x2b6f8f) : roll > 0.68 ? rgb(0x9a4a2e) : rgb(0x2c2620);
          const shp = ((inBand - 0.06) * 9) % 1;
          // Three glyph silhouettes, chosen by the same hash: a bar, a bowl and
          // a tall reed. Enough variety to read as writing.
          const solid =
            roll > 0.86
              ? shp > 0.2 && shp < 0.8
              : roll > 0.68
                ? Math.abs(inLane - 0.5) < 0.16 || shp < 0.3
                : shp > 0.35;
          if (solid) paint = glyph;
        }
      } else {
        paint = mix(ground, rgb(0x7a6a4e), 0.5);
      }
    } else {
      /**
       * Figure registers: standing bodies at a regular pitch, ochre skin, dark
       * wigs, white kilts, all facing the same way as they always do.
       *
       * The silhouette is built in PARTS with gaps between them - two legs with
       * daylight between, a waist, shoulders wider than the waist, a round head
       * with a wig behind it - because the first pass was three stacked rectangles
       * per figure and an entire wall of it read as a bank of card-index drawers.
       * What makes a shape read as a person is that it is NOT a rectangle.
       */
      const pitch = 0.26;
      const fig = Math.floor(u / pitch);
      const inFig = (u / pitch) % 1;
      const h = (inBand - 0.03) / 0.94;
      const roll = hash1(fig * 13 + reg * 5, 64, 13503);
      // Two figures in three: the ground has to win, or the wall is a crowd.
      if (roll > 0.34) {
        const dx = inFig - 0.44;
        const skin = roll > 0.6 ? rgb(0xa25f30) : rgb(0x8f4f27);
        const wig = rgb(0x22252d);
        const kilt = mix(rgb(0xd8cdb0), rgb(0xb5a888), roll);

        // Legs: two bars with a gap, the forward one advanced (they always are).
        if (h < 0.34) {
          if (Math.abs(dx + 0.035) < 0.022 || Math.abs(dx - 0.04) < 0.022) paint = skin;
          if (h < 0.03 && Math.abs(dx) < 0.09) paint = rgb(0x2c2620);
        } else if (h < 0.48) {
          // The kilt: a wedge, wider at the hem.
          if (Math.abs(dx) < 0.05 + (0.48 - h) * 0.16) paint = kilt;
        } else if (h < 0.68) {
          // Torso, widening to the shoulders, with one arm out in front of it.
          if (Math.abs(dx) < 0.035 + (h - 0.48) * 0.22) paint = skin;
          if (h > 0.56 && h < 0.61 && dx > 0.05 && dx < 0.15) paint = skin;
          if (h > 0.5 && h < 0.56 && dx > 0.12 && dx < 0.15) paint = rgb(0x6d5636);
        } else if (h < 0.78) {
          // Neck and collar.
          if (Math.abs(dx) < 0.03) paint = skin;
          if (h < 0.71 && Math.abs(dx) < 0.075) paint = mix(rgb(0x2b6f8f), kilt, 0.45);
        } else if (h < 0.94) {
          // The head, and the wig hanging behind and below it.
          const d = Math.hypot(dx * 1.35, h - 0.855);
          if (d < 0.062) paint = skin;
          if (d < 0.062 && dx < -0.012) paint = wig;
          if (h < 0.84 && dx < -0.02 && dx > -0.085) paint = wig;
        }
      }
    }

    // The plaster is falling off in hard-edged patches, and what shows through is
    // the sandstone behind. That loss is what makes it four thousand years old.
    let out = mix(paint, mix(rgb(0x9a7c50), rgb(0x86683f), n2(x, y, size, 14, 13601, 2)), loss > 0.63 ? 0.95 : 0);
    out = mix(out, rgb(0x4a4238), crack * 0.5);
    // Soot from the lamps that lit it, always higher up than lower.
    out = mix(out, rgb(0x33302a), Math.max(0, n2s(x, y, size, 3, 6, 13701, 3) - 0.6) * 1.5 * (0.3 + v));
    return shade(out, 0.9 + n2(x, y, size, 26, 13801, 2) * 0.18);
  });

export const friezeNormal = (): THREE.Texture =>
  normalTexture(
    'crypt.friezeN',
    SIZE,
    (x, y, size) => {
      const loss = n2(x, y, size, 3.6, 13203, 4);
      const crack = ridge(n2(x, y, size, 2.8, 13307, 4), 0.008);
      return 0.62 - (loss > 0.63 ? 0.32 : 0) - crack * 0.25;
    },
    2.0,
  );

export const MUDBRICK_TILE = 1.8;

/** Mud brick with the straw still showing. The dynasty's cheap wall. */
export const mudbrick = (): THREE.Texture =>
  colorTexture('crypt.mudbrick', SIZE, (x, y, size) => {
    const { joint, block } = coursedAt(x, y, 76, 30, 4.2, 0.5, 14101);
    const straw = ridge(n2s(x, y, size, 30, 22, 14203, 2), 0.05);
    const crumble = Math.max(0, n2(x, y, size, 12, 14307, 3) - 0.56) * 2;

    let base = mix(rgb(0x8a6a48), rgb(0x9d7d55), block * 0.8);
    base = mix(base, rgb(0xb9a274), straw * 0.5);
    base = mix(base, rgb(0x6b5236), joint * 0.7 + crumble * 0.4);
    return shade(base, 0.9 + block * 0.18);
  });

export const mudbrickNormal = (): THREE.Texture =>
  normalTexture(
    'crypt.mudbrickN',
    SIZE,
    (x, y, size) => {
      const { joint } = coursedAt(x, y, 76, 30, 4.2, 0.5, 14101);
      return 0.55 - joint * 0.5 + ridge(n2s(x, y, size, 30, 22, 14203, 2), 0.05) * 0.2;
    },
    2.6,
  );

export const SAND_TILE = 3.2;

/**
 * Drifted sand over stone. The ripples are warped by rather more than one period
 * of their own spacing: warped by less, they read as printed corduroy instead of
 * as something the air moved (see docs/art/ROOM_REVIEW.md §4).
 */
export const sandDrift = (): THREE.Texture =>
  colorTexture('crypt.sand', SIZE, (x, y, size) => {
    // Five ripples per tile, warped hard. Nine came out at 35 cm apart with the
    // crests picked out by a strength-1.8 normal map, and the floor read as
    // corrugated cardboard: sand ripples are wide, low and irregular, and warping
    // them by less than one period of their own spacing is what makes them corduroy
    // (docs/art/ROOM_REVIEW.md §4).
    const warp = n2(x, y, size, 2.4, 15101, 3) * 3.4;
    const ripple = Math.sin((y / size + warp * 0.55) * Math.PI * 2 * 5) * 0.5 + 0.5;
    const grain = n2(x, y, size, 48, 15203, 2);
    // Where the drift is thin the flagstone under it shows through.
    const thin = n2(x, y, size, 4, 15307, 3);

    let base = mix(rgb(0xa6906a), rgb(0xb9a47e), ripple * 0.34 + grain * 0.3);
    base = mix(base, rgb(0x7b6a4c), Math.max(0, 0.44 - thin) * 1.6);
    base = mix(base, rgb(0x8a7d63), Math.max(0, n2(x, y, size, 9, 15401, 3) - 0.58) * 1.5);
    return shade(base, 0.92 + grain * 0.16);
  });

export const sandNormal = (): THREE.Texture =>
  normalTexture(
    'crypt.sandN',
    SIZE,
    (x, y, size) => {
      const warp = n2(x, y, size, 2.4, 15101, 3) * 3.4;
      return (Math.sin((y / size + warp * 0.55) * Math.PI * 2 * 5) * 0.5 + 0.5) * 0.7 + n2(x, y, size, 48, 15203, 2) * 0.3;
    },
    0.45,
  );

// 1.7 m: at 2.4 the stars came out 40 cm across and read as gold clover leaves
// printed on a ceiling rather than as a star field.
export const STAR_TILE = 1.7;

/**
 * The star ceiling: deep Egyptian blue with five-pointed gold stars in a ruled
 * grid, which is what the dynasty painted over every burial chamber. Half of it
 * has fallen, so the grid has holes with bare stone in them.
 */
export const starVault = (): THREE.Texture =>
  colorTexture('crypt.stars', SIZE, (x, y, size) => {
    const cell = 44;
    const row = Math.floor(y / cell);
    const ox = (row % 2) * (cell / 2);
    const u = (((x + ox) % cell) / cell - 0.5) * 2;
    const v = ((y % cell) / cell - 0.5) * 2;
    const loss = n2(x, y, size, 4, 16101, 4);

    let base = mix(rgb(0x243a63), rgb(0x2f4c7a), n2(x, y, size, 10, 16203, 3) * 0.8);
    // A five-pointed star, as a radial spike function. Cheap and unmistakable.
    const a = Math.atan2(v, u);
    const r = Math.hypot(u, v);
    // Sharper points and a smaller body than it started with, for the same reason:
    // a blobby five-pointed star at half a metre across is a flower.
    const spike = 0.14 + 0.34 * Math.pow(Math.abs(Math.cos(a * 2.5)), 0.45);
    if (r < spike && hash1(row * 17 + Math.floor((x + ox) / cell) * 5, 128, 16307) > 0.12) {
      base = mix(rgb(0xc9a244), rgb(0xe0c078), 1 - r / spike);
    }
    // Where the paint has gone, the stone above shows - and it shows DARK. At
    // 0x8a7250 the loss patches were paler than the gold stars and read as big
    // amorphous gold blobs, which is the opposite of what missing paint looks like.
    base = mix(base, mix(rgb(0x54483a), rgb(0x655645), n2(x, y, size, 18, 16401, 2)), loss > 0.68 ? 0.85 : 0);
    return shade(base, 0.86 + n2(x, y, size, 30, 16503, 2) * 0.2);
  });

export const HIEROGLYPH_TILE = 1.25;

/**
 * Ruled columns of incised glyphs, for the jambs of every dynastic doorway, the
 * shafts of its columns and the dado of its chambers. Sunk relief: the marks are
 * dark because they are *holes*, and the shadow in them carries the whole read.
 *
 * Three lanes per tile rather than one column per tile, deliberately. UVs are
 * baked in world units, so a texture with a single centred column would land
 * wherever the world happened to put it and half the jambs in the map would show
 * nothing but its border. Lanes at 42 cm read as glyph columns from any offset.
 */
function glyphAt(x: number, y: number, size: number): { solid: boolean; roll: number; border: number } {
  const u = x / size;
  const v = y / size;
  const lane = Math.floor(u * 3);
  const inLane = (u * 3) % 1;
  const border = Math.max(0, 1 - Math.min(inLane, 1 - inLane) / 0.1);
  const cellV = Math.floor(v * 9);
  const inV = (v * 9) % 1;
  const roll = hash1(lane * 37 + cellV * 7, 128, 17203);
  const inU = (inLane - 0.14) / 0.72;
  if (inLane < 0.14 || inLane > 0.86 || roll < 0.14) return { solid: false, roll, border };
  // Four glyph silhouettes: a seated figure, an owl, a reed and a bowl. All of
  // them are blobs with the right proportions, which is all that survives being
  // twenty pixels tall.
  const solid =
    roll > 0.76
      ? Math.abs(inU - 0.5) < 0.3 && inV > 0.2 && inV < 0.72
      : roll > 0.54
        ? Math.hypot((inU - 0.5) * 1.4, inV - 0.5) < 0.3
        : roll > 0.32
          ? Math.abs(inU - 0.5) < 0.14 && inV > 0.12 && inV < 0.86
          : inV > 0.52 && inV < 0.78 && Math.abs(inU - 0.5) < 0.34;
  return { solid, roll, border };
}

export const hieroglyphBand = (): THREE.Texture =>
  colorTexture('crypt.glyph', SIZE, (x, y, size) => {
    const { solid, roll, border } = glyphAt(x, y, size);
    let base = mix(rgb(0x9a7c50), rgb(0xb0956a), n2(x, y, size, 12, 17101, 3) * 0.9);
    base = mix(base, rgb(0x6a5334), border * 0.55);
    if (solid) {
      base = mix(base, rgb(0x453422), 0.85);
      // A trace of the original pigment left in the deepest cuts.
      if (roll > 0.62) base = mix(base, rgb(0x2b5f7c), 0.4);
    }
    const loss = n2(x, y, size, 5, 17307, 3);
    base = mix(base, rgb(0x8a7250), loss > 0.66 ? 0.6 : 0);
    return shade(base, 0.9 + n2(x, y, size, 34, 17401, 2) * 0.16);
  });

export const glyphNormal = (): THREE.Texture =>
  normalTexture(
    'crypt.glyphN',
    SIZE,
    (x, y, size) => {
      const { solid, border } = glyphAt(x, y, size);
      return 0.7 - (solid ? 0.45 : 0) - border * 0.15 + n2(x, y, size, 30, 17401, 2) * 0.08;
    },
    3.0,
  );

export const INSCRIPTION_TILE = 1.3;

/**
 * The Sanctum's answer to the glyph band: a carved memorial inscription in
 * blocky Roman capitals, four lines of it, worn shallow. Used on tomb chests,
 * arch hood-moulds and the dado of the chapels.
 */
export const inscription = (): THREE.Texture =>
  colorTexture('crypt.inscription', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    let base = mix(rgb(0x6e6d67), rgb(0x827f75), n2(x, y, size, 14, 18101, 3) * 0.9);

    const lines = 4;
    const line = Math.floor((1 - v) * lines);
    const inLine = ((1 - v) * lines) % 1;
    if (inLine > 0.24 && inLine < 0.76) {
      // Letters as vertical strokes of varying width with spaces for words - at
      // this density that is exactly what carved capitals look like.
      const pitch = 0.031;
      const idx = Math.floor(u / pitch);
      const inCell = (u / pitch) % 1;
      const roll = hash1(idx * 7 + line * 31, 128, 18203);
      const space = roll < 0.12;
      // Lines get shorter down the block, the way a memorial is centred.
      const margin = 0.08 + line * 0.05;
      if (!space && u > margin && u < 1 - margin) {
        const w = 0.24 + roll * 0.36;
        if (Math.abs(inCell - 0.5) < w) base = mix(base, rgb(0x35342e), 0.8);
        // The horizontal bar of an E, an H or an A, on some of them.
        if (roll > 0.7 && Math.abs(inLine - 0.5) < 0.07) base = mix(base, rgb(0x35342e), 0.7);
      }
    }

    const damage = n2(x, y, size, 6, 18307, 3);
    base = mix(base, mix(rgb(0x757269), rgb(0x8b877c), damage), damage > 0.62 ? 0.75 : 0);
    return shade(base, 0.9 + n2(x, y, size, 28, 18401, 2) * 0.16);
  });

export const inscriptionNormal = (): THREE.Texture =>
  normalTexture(
    'crypt.inscriptionN',
    SIZE,
    (x, y, size) => {
      const u = x / size;
      const v = y / size;
      const line = Math.floor((1 - v) * 4);
      const inLine = ((1 - v) * 4) % 1;
      if (inLine < 0.24 || inLine > 0.76) return 0.65;
      const idx = Math.floor(u / 0.031);
      const roll = hash1(idx * 7 + line * 31, 128, 18203);
      const inCell = (u / 0.031) % 1;
      const margin = 0.08 + line * 0.05;
      const cut = roll >= 0.12 && u > margin && u < 1 - margin && Math.abs(inCell - 0.5) < 0.24 + roll * 0.36;
      return 0.68 - (cut ? 0.4 : 0) + n2(x, y, size, 28, 18401, 2) * 0.06;
    },
    2.8,
  );

/* --- THE ROT: mycelium, moss, root ----------------------------------------- */

export const ROT_TILE = 1.7;

/**
 * Mycelial felt. What a wall looks like after the thing under the tomb has been
 * growing through it for a while: a pale skin of threads with rot showing
 * through, and it does not have a single straight line in it.
 */
export const mycelialFelt = (): THREE.Texture =>
  colorTexture('crypt.rot', SIZE, (x, y, size) => {
    const felt = n2(x, y, size, 16, 19101, 4);
    // Threads: ridged noise at two scales, radiating rather than aligned.
    const thread = ridge(n2(x, y, size, 5, 19203, 3), 0.05) * 0.8 + ridge(n2(x, y, size, 13, 19307, 2), 0.04) * 0.5;
    const rot = Math.max(0, n2(x, y, size, 3.2, 19401, 4) - 0.5) * 2.2;
    // Fruiting bodies: small dark discs dotted through the felt.
    const bud = Math.max(0, n2(x, y, size, 34, 19503, 2) - 0.68) * 3.2;

    let base = mix(rgb(0x6f7462), rgb(0x8b9078), felt * 0.9);
    base = mix(base, rgb(0xa6ab8c), Math.min(0.8, thread));
    base = mix(base, rgb(0x33352a), Math.min(0.75, rot));
    base = mix(base, rgb(0x4a3f4e), Math.min(0.6, bud));
    return shade(base, 0.88 + felt * 0.2);
  });

export const rotNormal = (): THREE.Texture =>
  normalTexture(
    'crypt.rotN',
    SIZE,
    (x, y, size) =>
      n2(x, y, size, 16, 19101, 4) * 0.5 + ridge(n2(x, y, size, 5, 19203, 3), 0.05) * 0.4 + n2(x, y, size, 34, 19503, 2) * 0.2,
    3.2,
  );

export const MOSS_TILE = 1.4;

/** Wet moss and algae on stone, in the rooms water gets into. */
export const mossStone = (): THREE.Texture =>
  colorTexture('crypt.moss', SIZE, (x, y, size) => {
    const clump = n2(x, y, size, 11, 20101, 4);
    const fine = n2(x, y, size, 42, 20203, 2);
    const bare = n2(x, y, size, 4, 20307, 3);

    let base = mix(rgb(0x3f4a33), rgb(0x5a6740), clump * 0.9 + fine * 0.25);
    // Bald patches where the stone shows through, and it is grey and cold.
    base = mix(base, mix(rgb(0x63655e), rgb(0x767870), fine), Math.max(0, 0.42 - bare) * 1.9);
    base = mix(base, rgb(0x272e20), Math.max(0, clump - 0.68) * 2);
    return shade(base, 0.86 + fine * 0.24);
  });

/* --- fabric, wax, metal, gold ---------------------------------------------- */

export const LINEN_TILE = 0.95;

/** Grave linen: a coarse open weave, gone the colour of tea and worse. */
export const shroudLinen = (): THREE.Texture =>
  colorTexture('crypt.linen', SIZE, (x, y, size) => {
    // A real weave, over and under, at a pitch you can just resolve at arm's
    // length. On a wrapped body this is the whole material.
    const pitch = 7;
    const warp = Math.abs(((x % pitch) / pitch) - 0.5);
    const weft = Math.abs(((y % pitch) / pitch) - 0.5);
    const over = (Math.floor(x / pitch) + Math.floor(y / pitch)) % 2 === 0;
    const thread = over ? 1 - weft * 1.6 : 1 - warp * 1.6;
    const stain = n2(x, y, size, 5, 21101, 4);
    const rot = Math.max(0, n2(x, y, size, 14, 21203, 3) - 0.62) * 2.4;

    let base = mix(rgb(0x8d8367), rgb(0xa89d7e), thread * 0.7);
    base = mix(base, rgb(0x6d5a3c), Math.max(0, stain - 0.46) * 1.7);
    base = mix(base, rgb(0x3b342a), Math.min(0.7, rot));
    return shade(base, 0.9 + thread * 0.16);
  });

export const linenNormal = (): THREE.Texture =>
  normalTexture(
    'crypt.linenN',
    SIZE,
    (x, y) => {
      const pitch = 7;
      const warp = Math.abs(((x % pitch) / pitch) - 0.5);
      const weft = Math.abs(((y % pitch) / pitch) - 0.5);
      const over = (Math.floor(x / pitch) + Math.floor(y / pitch)) % 2 === 0;
      return over ? 1 - weft * 1.6 : 1 - warp * 1.6;
    },
    1.6,
  );

export const GILT_TILE = 0.85;

/**
 * Gold leaf over gesso, chased with a stylus and rubbed through to the red bole
 * under it on every edge. Gold is the Necropolis's one saturated colour and the
 * only bright thing in the whole map that is not on fire, so it has to be
 * *hammered* rather than smooth or it reads as painted yellow plastic.
 */
export const giltPanel = (): THREE.Texture =>
  colorTexture('crypt.gilt', SIZE, (x, y, size) => {
    const hammer = n2(x, y, size, 26, 22101, 3);
    // Chased lines: a ruled lattice of shallow grooves, offset course by course.
    const cell = 38;
    const gx = Math.abs(((x % cell) / cell) - 0.5);
    const gy = Math.abs((((y + (Math.floor(x / cell) % 2) * cell * 0.5) % cell) / cell) - 0.5);
    const chase = Math.max(0, 1 - Math.min(gx, gy) / 0.06);
    const wear = Math.max(0, n2(x, y, size, 5, 22203, 3) - 0.56) * 2.2;

    // Pushed up and out from where it started (0xb08a2e / 0xd8b555). This map's
    // gold hangs on sandstone walls under oil lamps, and at that saturation the one
    // gilded sarcophagus in the pack was the same colour as the floor it stood on.
    // Gold has to be the most saturated thing in the room or it is just a pale box.
    let base = mix(rgb(0xc79a2a), rgb(0xf0cf60), hammer * 0.9);
    base = mix(base, rgb(0x9a7420), chase * 0.6);
    // Rubbed through to the bole: a dull brick red, which is what makes gold read as
    // leaf rather than as metal. Kept to the edges - it is wear, not the surface.
    base = mix(base, rgb(0x7a3a26), Math.min(0.38, wear));
    return shade(base, 0.9 + hammer * 0.2);
  });

export const giltNormal = (): THREE.Texture =>
  normalTexture(
    'crypt.giltN',
    SIZE,
    (x, y, size) => {
      const cell = 38;
      const gx = Math.abs(((x % cell) / cell) - 0.5);
      const gy = Math.abs((((y + (Math.floor(x / cell) % 2) * cell * 0.5) % cell) / cell) - 0.5);
      return 0.6 - Math.max(0, 1 - Math.min(gx, gy) / 0.06) * 0.4 + n2(x, y, size, 26, 22101, 3) * 0.15;
    },
    2.2,
  );

export const IRON_TILE = 1.1;

/** Wrought iron: hammer facets, pitting, and the rust that always wins. */
export const wroughtIron = (): THREE.Texture =>
  colorTexture('crypt.iron', SIZE, (x, y, size) => {
    const facet = n2s(x, y, size, 14, 5, 23101, 2);
    const scale = Math.max(0, n2(x, y, size, 9, 23203, 4) - 0.48) * 2.2;
    const pit = Math.max(0, n2(x, y, size, 30, 23307, 2) - 0.62) * 2.6;

    let base = mix(rgb(0x4a4b4c), rgb(0x6b6c6a), facet * 0.8);
    base = mix(base, rgb(0x7d4a26), Math.min(0.8, scale));
    base = mix(base, rgb(0x2c2723), pit * 0.6);
    return shade(base, 0.86 + facet * 0.24);
  });

export const WAX_TILE = 0.5;

/** Candle wax: layered drips, dust in the folds, wick soot at the top. */
export const candleWax = (): THREE.Texture =>
  colorTexture('crypt.wax', SIZE, (x, y, size) => {
    // Runs down the outside, at a wandering pitch. A candle that has burned for
    // years is mostly the wax that missed.
    const run = ridge(n2s(x, y, size, 9, 2, 24101, 3), 0.12);
    const pool = n2(x, y, size, 7, 24203, 3);
    let base = mix(rgb(0xbdb39a), rgb(0xd6ceb4), pool * 0.8 + run * 0.4);
    base = mix(base, rgb(0x8f866f), Math.max(0, 0.4 - pool) * 1.5);
    return shade(base, 0.9 + run * 0.18);
  });

export const TIMBER_TILE = 1.2;

/** Oak, six centuries in the damp: hard grain, soft between it, black at the ends. */
export const oldOak = (): THREE.Texture =>
  colorTexture('crypt.oak', SIZE, (x, y, size) => {
    const grain = n2s(x, y, size, 3, 26, 25101, 4);
    const ring = Math.sin((grain * 5 + (y / size) * 3.4) * Math.PI * 2) * 0.5 + 0.5;
    const rot = Math.max(0, n2(x, y, size, 6, 25203, 3) - 0.58) * 2;
    const split = ridge(n2s(x, y, size, 2, 20, 25307, 2), 0.02);

    let base = mix(rgb(0x4e3a28), rgb(0x6b5136), ring * 0.85);
    base = mix(base, rgb(0x2f2620), split * 0.7);
    // Wet rot goes grey-green, not brown, and it is what dates the wood.
    base = mix(base, rgb(0x484c40), Math.min(0.55, rot));
    return shade(base, 0.88 + ring * 0.2);
  });

export const oakNormal = (): THREE.Texture =>
  normalTexture(
    'crypt.oakN',
    SIZE,
    (x, y, size) => {
      const grain = n2s(x, y, size, 3, 26, 25101, 4);
      const ring = Math.sin((grain * 5 + (y / size) * 3.4) * Math.PI * 2) * 0.5 + 0.5;
      return 0.5 + ring * 0.3 - ridge(n2s(x, y, size, 2, 20, 25307, 2), 0.02) * 0.4;
    },
    2.0,
  );

export const PARCHMENT_TILE = 0.6;

/** Vellum: a written page at the density you can read as writing and not words. */
export const parchment = (): THREE.Texture =>
  colorTexture('crypt.parchment', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    let base = mix(rgb(0xa89c7e), rgb(0xc0b493), n2(x, y, size, 9, 26101, 3) * 0.9);
    // Ruled lines with ink strokes on them, and a rubricated initial.
    const line = Math.floor(v * 15);
    const inLine = (v * 15) % 1;
    if (inLine > 0.3 && inLine < 0.62 && u > 0.14 && u < 0.86) {
      const idx = Math.floor(u * 60);
      if (hash1(idx * 5 + line * 17, 128, 26203) > 0.34) base = mix(base, rgb(0x2e2620), 0.75);
    }
    if (u > 0.16 && u < 0.24 && v > 0.72 && v < 0.86) base = mix(base, rgb(0x8a2b22), 0.8);
    // Foxing and a burn along one edge.
    base = mix(base, rgb(0x8a7448), Math.max(0, n2(x, y, size, 6, 26307, 3) - 0.56) * 1.8);
    base = mix(base, rgb(0x3a2f22), Math.max(0, u - 0.9) * 6);
    return shade(base, 0.92 + n2(x, y, size, 40, 26401, 2) * 0.14);
  });

/* --- authored in 0..1 UV space: shared art and glass ----------------------- */

/**
 * Shared art is NOT batched (docs/art/SHARED_ART.md §3.1), so a door leaf, a
 * chest and a locker carry ONE UV repeat over the whole surface. A tiling stone
 * map on a door is a single smeared patch that reads as a blank slab, so these
 * three are composed as pictures of the object: border, centre line, and detail
 * exactly where the object has detail.
 */

/** A crypt door: oak boards, iron straps, studs, and a cross gouged in it. */
export const doorSkin = (): THREE.Texture =>
  colorTexture('crypt.doorSkin', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;

    // Six vertical boards with a dark gap between them.
    const boards = 6;
    const bIdx = Math.floor(u * boards);
    const inB = (u * boards) % 1;
    const grain = n2s(x, y, size, 4, 30, 27101, 4);
    const ring = Math.sin((grain * 5 + v * 4) * Math.PI * 2) * 0.5 + 0.5;
    let base = mix(rgb(0x4a3626), rgb(0x674e34), ring * 0.8 + hash1(bIdx, 16, 27203) * 0.3);
    if (inB < 0.035 || inB > 0.965) base = mix(base, rgb(0x211a15), 0.85);

    // Ledges: three iron straps across, wider at the hinge side, each ending in
    // a fleur. Plus a stud line down every strap.
    for (const sy of [0.16, 0.5, 0.84]) {
      if (Math.abs(v - sy) < 0.048) {
        const iron = mix(rgb(0x3f4144), rgb(0x5d5b55), n2(x, y, size, 20, 27307, 2));
        base = mix(iron, rgb(0x77451f), Math.max(0, n2(x, y, size, 10, 27401, 3) - 0.5) * 1.8);
        const stud = Math.abs(((u * 9) % 1) - 0.5);
        if (stud < 0.16 && Math.abs(v - sy) < 0.026) base = mix(base, rgb(0x8f8d84), 0.5);
      }
    }
    // The hinge plate down the left edge.
    if (u < 0.07) base = mix(base, rgb(0x44464a), 0.8);

    // A cross cut into the boards above the middle strap: shallow, and dark
    // because it is a hole.
    const cross =
      (Math.abs(u - 0.5) < 0.022 && v > 0.56 && v < 0.78) || (Math.abs(v - 0.71) < 0.02 && Math.abs(u - 0.5) < 0.075);
    if (cross) base = mix(base, rgb(0x1a1512), 0.8);

    // Damp climbing the bottom of the leaf.
    base = mix(base, rgb(0x3c4239), Math.max(0, 0.22 - v) * 2.4);
    return shade(base, 0.9 + ring * 0.16);
  });

/** A reliquary chest: iron-bound oak with gilt corners and an enamel plaque. */
export const chestSkin = (): THREE.Texture =>
  colorTexture('crypt.chestSkin', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const grain = n2s(x, y, size, 6, 24, 28101, 4);
    let base = mix(rgb(0x46331f), rgb(0x60472c), (Math.sin((grain * 5 + u * 3) * Math.PI * 2) * 0.5 + 0.5) * 0.8);

    // Iron bands: two horizontal, three vertical, all with studs.
    const band =
      Math.abs(v - 0.24) < 0.055 || Math.abs(v - 0.76) < 0.055 || Math.abs(((u * 3) % 1) - 0.5) < 0.075;
    if (band) {
      base = mix(rgb(0x3e4145), rgb(0x5a5851), n2(x, y, size, 24, 28203, 2));
      base = mix(base, rgb(0x7b4620), Math.max(0, n2(x, y, size, 12, 28307, 3) - 0.52) * 1.7);
    }
    // Gilt corner plates.
    if ((u < 0.1 || u > 0.9) && (v < 0.12 || v > 0.88)) base = mix(rgb(0xb08a2e), rgb(0xd8b555), n2(x, y, size, 30, 28401, 2));
    // The enamel plaque in the middle: a blue field with a gold cross on it.
    if (Math.abs(u - 0.5) < 0.15 && Math.abs(v - 0.5) < 0.13) {
      const inCross = Math.abs(u - 0.5) < 0.025 || Math.abs(v - 0.5) < 0.022;
      base = inCross ? rgb(0xcaa447) : mix(rgb(0x24406e), rgb(0x2d5285), n2(x, y, size, 22, 28503, 2));
      if (Math.abs(u - 0.5) > 0.135 || Math.abs(v - 0.5) > 0.115) base = rgb(0xb08a2e);
    }
    return shade(base, 0.9 + n2(x, y, size, 34, 28601, 2) * 0.16);
  });

/** A vestry aumbry: a tall cupboard, carved arcade on each door, iron hinges. */
export const lockerSkin = (): THREE.Texture =>
  colorTexture('crypt.lockerSkin', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const grain = n2s(x, y, size, 5, 30, 29101, 4);
    let base = mix(rgb(0x413020), rgb(0x5b4530), (Math.sin((grain * 5 + v * 5) * Math.PI * 2) * 0.5 + 0.5) * 0.8);

    // Two leaves with a shut line between them and a stile round each.
    if (Math.abs(u - 0.5) < 0.012) base = mix(base, rgb(0x1c1712), 0.9);
    const leafU = u < 0.5 ? u / 0.5 : (u - 0.5) / 0.5;
    const stile = Math.min(leafU, 1 - leafU);
    if (stile < 0.14 || v < 0.06 || v > 0.94) base = mix(base, rgb(0x38291b), 0.5);

    // A blind arcade sunk into each leaf: two pointed arches per door. This is
    // the whole read of the object, so it is cut deep and dark.
    if (stile > 0.16 && v > 0.12 && v < 0.9) {
      const bay = Math.floor(((leafU - 0.16) / 0.68) * 2);
      const inBay = (((leafU - 0.16) / 0.68) * 2) % 1;
      const arch = 0.62 + 0.18 * (1 - Math.pow(Math.abs(inBay - 0.5) * 2, 1.6));
      const inside = Math.abs(inBay - 0.5) < 0.36 && v < arch && v > 0.18;
      if (inside) base = mix(base, rgb(0x231b14), 0.75);
      // The moulding round the arch head, catching a highlight.
      const onArch = Math.abs(v - arch) < 0.022 && Math.abs(inBay - 0.5) < 0.4;
      if (onArch || (Math.abs(Math.abs(inBay - 0.5) - 0.36) < 0.018 && v < arch)) {
        base = mix(base, rgb(0x7d6244), 0.7);
      }
      if (bay < 0) base = mix(base, rgb(0x38291b), 0.4);
    }

    // Strap hinges on the outer edges, and a hasp at the shut line.
    if ((u < 0.055 || u > 0.945) && (Math.abs(v - 0.22) < 0.05 || Math.abs(v - 0.72) < 0.05)) {
      base = mix(rgb(0x3f4145), rgb(0x5c5a53), n2(x, y, size, 22, 29203, 2));
    }
    if (Math.abs(u - 0.5) < 0.05 && Math.abs(v - 0.46) < 0.06) base = mix(rgb(0x4a4c50), rgb(0x6b6963), n2(x, y, size, 26, 29307, 2));

    base = mix(base, rgb(0x3d4238), Math.max(0, 0.16 - v) * 2.6);
    return shade(base, 0.9 + n2(x, y, size, 36, 29401, 2) * 0.14);
  });

/**
 * A stained lancet, authored in 0..1 so the pointed head lands where the opening
 * is. Lead lines, four pigments, and a haloed figure that is missing its face -
 * the pane is the coldest light in the Sanctum and the only daylight in the map.
 */
export const stainedLancet = (): THREE.Texture =>
  colorTexture('crypt.lancet', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;

    // The arch: outside it is stone, so the light is a shape rather than a
    // rectangle. A rectangular glowing panel reads as a monitor.
    const half = 0.5 - Math.max(0, (v - 0.62) / 0.38) * 0.5;
    if (Math.abs(u - 0.5) > half * 0.86 || v > 0.985) return rgb(0x2a2a28);

    // Leaded quarries: a diamond grid, with the lead as a dark line.
    const gx = (u * 9) % 1;
    const gy = (v * 16) % 1;
    const diamond = Math.abs(gx - 0.5) + Math.abs(gy - 0.5);
    const lead = diamond > 0.86 || diamond < 0.14 ? 1 : 0;

    const cell = Math.floor(u * 9) * 31 + Math.floor(v * 16) * 7;
    const roll = hash1(cell, 256, 30101);
    // Cold blues and greens dominate, with one in six a warm amber, which is
    // what stops the window reading as a fish tank.
    let glass = roll > 0.84 ? rgb(0xc98f36) : roll > 0.58 ? rgb(0x2f5c86) : roll > 0.34 ? rgb(0x3d7a72) : rgb(0x6a7f9a);

    // The figure: a haloed standing saint in the middle third, in red and white,
    // with a blank where the head should be.
    const fx = Math.abs(u - 0.5);
    if (v > 0.16 && v < 0.66 && fx < 0.1 + (0.66 - v) * 0.2) {
      glass = v > 0.5 ? rgb(0xa8332c) : rgb(0xc4bda4);
    }
    if (Math.hypot((u - 0.5) * 1.1, v - 0.7) < 0.075) glass = rgb(0xc98f36);
    if (Math.hypot((u - 0.5) * 1.1, v - 0.7) < 0.045) glass = rgb(0x1d1c1a);

    if (lead) return mix(rgb(0x35342f), glass, 0.15);
    // Grime and a couple of cracked quarries, because nothing here is intact.
    const grime = n2(x, y, size, 12, 30203, 3);
    const crack = ridge(n2(x, y, size, 4, 30307, 3), 0.006);
    return shade(mix(glass, rgb(0x4a4a44), Math.max(0, grime - 0.6) * 1.4 + crack * 0.5), 0.9 + grime * 0.2);
  });

/**
 * The dark on the other side of a grate or a broken wall: a picture of depth,
 * never lit, with a few pale motes hanging in it. Hung a metre and a bit behind
 * the opening so the recess has a bottom the eye cannot find.
 */
export const voidBackdrop = (): THREE.Texture =>
  colorTexture('crypt.void', 128, (x, y, size) => {
    const v = y / size;
    // Darker at the bottom, faintly warmer at the top, so the void has an up.
    let base = mix(rgb(0x14161c), rgb(0x22252c), Math.pow(v, 1.4));
    const rock = n2(x, y, size, 7, 31101, 4);
    base = mix(base, rgb(0x2b2f36), Math.max(0, rock - 0.56) * 1.6);
    const mote = Math.max(0, n2(x, y, size, 42, 31203, 2) - 0.76) * 4;
    base = mix(base, rgb(0x6e7a68), Math.min(0.5, mote));
    return base;
  });

/** The same idea in the Necropolis: a hot dark full of hanging dust. */
export const sandVoidBackdrop = (): THREE.Texture =>
  colorTexture('crypt.voidWarm', 128, (x, y, size) => {
    const v = y / size;
    let base = mix(rgb(0x18130f), rgb(0x2a2119), Math.pow(v, 1.3));
    base = mix(base, rgb(0x3b2f22), Math.max(0, n2(x, y, size, 8, 32101, 4) - 0.54) * 1.6);
    base = mix(base, rgb(0x8a7a5c), Math.min(0.45, Math.max(0, n2(x, y, size, 40, 32203, 2) - 0.75) * 4));
    return base;
  });

/**
 * A soft radial falloff, for the ADDITIVE pools of light a candle throws on a
 * floor or a wall.
 *
 * Light landing on a surface is additive: painted as an ordinary emissive decal
 * a glow pool brings its own dark square with it and lays it over the flagstones
 * (docs/art/ROOM_REVIEW.md §4). Added, only the bright half lands.
 */
export const glowFalloff = (): THREE.Texture =>
  colorTexture('crypt.glowFalloff', 128, (x, y, size) => {
    const u = x / size - 0.5;
    const v = y / size - 0.5;
    const r = Math.min(1, Math.hypot(u, v) * 2);
    // Squared falloff with a soft core, broken up so a pool is never a perfect
    // circle - a flame is not a lightbulb.
    const wobble = 0.86 + n2(x, y, size, 5, 33101, 3) * 0.28;
    const k = Math.pow(Math.max(0, 1 - r / wobble), 2.2);
    return [k * 255, k * 255, k * 255];
  });

/** The lobby poster for this map lives with the others, in art/shared/lobby/. */
