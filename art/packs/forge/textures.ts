/**
 * Vulcan's Anvil - the surfaces, generated as procedural pixel data.
 *
 * Same three rules as everywhere else in art (art/lib/textures.ts): no canvas, no
 * `Math.random()`, cached at module scope. Every recipe below is a pure function
 * of pixel coordinates, so a room builds identically in a browser, on a peer's
 * machine, and headless inside `scripts/validateArt.mjs`.
 *
 * `*_TILE` is the size in METRES that one repeat covers. `merge.ts` bakes UVs in
 * world units, so a texture keeps its density whether it lands on a 0.3 m
 * conduit or an 8 m casting floor. Floor tiles are deliberately small - between
 * one and two metres, which is a size a player can take a step across. A 3 m
 * tile on an 8 m floor is under three repeats and reads from standing height as
 * one flat smear (docs/art/ROOM_REVIEW.md).
 *
 * The pack splits down the middle, and the split is a **temperature inversion**.
 *
 * - **The Works** is the black site: ablative hex tile, machined graphite panel,
 *   ferrocrete, hazard chevron, heat-tempered steel. Straight lines, hard edges,
 *   everything stencilled with a number, and every one of them discoloured by a
 *   heat it was not built for. It lights itself COLD - arc-white and cyan - with
 *   red where something has failed.
 * - **The Mountain** is what the Works was drilled into: pahoehoe basalt,
 *   obsidian, ash, sulphur crust, welded tuff. No straight lines anywhere. It
 *   lights itself with the only genuinely hot thing in the map, which is the
 *   magma, and that is orange.
 *
 * So the usual horror rule is inverted on purpose and it still works: the fill
 * is cold blue, the *facility* is cold white, and the warm sources are the
 * mountain leaking into the building. Walking out of a lab into a lava tube is a
 * change of temperature you feel before you have read a single prop.
 *
 * Albedos are mid-tones. Colour is converted to linear space before lighting,
 * where a near-black picked in a colour wheel is effectively 0 and no amount of
 * incandescence brings it back. The Works is dark because of the lighting and
 * the fog, not because the steel is black.
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
 * One function does cooling cracks, weld beads, sulphur veining and the grain
 * boundaries in a slab of cooled lava - the most useful primitive in the pack.
 */
const ridge = (n: number, width: number): number => Math.max(0, 1 - Math.abs(n - 0.5) / width);

/**
 * The crack network a crust of cooled lava has: two ridge fields at different
 * scales, the coarse one carrying the plate boundaries and the fine one the
 * hairlines running off them.
 *
 * This is the single most important function in the file. Every hot surface in
 * the map - the lava lake, the fissures, the crust under the wall register, the
 * slag in the smelter - is this mask with a different colour ramp on it, which
 * is why they all read as the same substance at different temperatures.
 */
function crackMask(x: number, y: number, size: number, seed: number, scale = 4): number {
  const plates = ridge(n2(x, y, size, scale, seed, 3), 0.075);
  const fine = ridge(n2(x, y, size, scale * 2.7, seed + 91, 3), 0.045) * 0.55;
  const web = ridge(n2(x, y, size, scale * 6.1, seed + 173, 2), 0.05) * 0.22;
  return Math.min(1, plates + fine * plates * 1.4 + fine * 0.35 + web);
}

/**
 * Heat discolouration on steel: the straw / bronze / violet / blue tempering
 * sequence, in that order, driven by one scalar. Nothing else says "this metal
 * has been much too hot for much too long" nearly as fast, and it is free.
 */
function temper(base: RGB, heat: number): RGB {
  if (heat <= 0) return base;
  const h = Math.min(1, heat);
  if (h < 0.28) return mix(base, rgb(0xb08a3c), h / 0.28);
  if (h < 0.52) return mix(rgb(0xb08a3c), rgb(0x8a4a2a), (h - 0.28) / 0.24);
  if (h < 0.76) return mix(rgb(0x8a4a2a), rgb(0x5a3a72), (h - 0.52) / 0.24);
  return mix(rgb(0x5a3a72), rgb(0x2f5a8a), (h - 0.76) / 0.24);
}

/** Generic grime multiplier around 1, for anything that has sat in ash. */
function soot(x: number, y: number, size: number, seed: number, strength: number): number {
  const patch = n2(x, y, size, 5, seed, 4);
  return 1 - Math.max(0, patch - 0.48) * strength * 1.6;
}

/* --- shared roughness maps ------------------------------------------------------ */

/** Scuffed metal: polished where hands and boots go, dull elsewhere. */
export const metalRoughness = (): THREE.Texture =>
  dataTexture('forge.metalRough', 128, (x, y, size) => 0.28 + n2s(x, y, size, 16, 5, 3301) * 0.56);

/** Dry roughness, for ash, tuff and sulphur. Broken up rather than pooled. */
export const dryRoughness = (): THREE.Texture =>
  dataTexture('forge.dryRough', 128, (x, y, size) => 0.68 + n2(x, y, size, 13, 3407) * 0.32);

/**
 * Vitrified roughness: mirror-smooth where rock has actually melted and gone to
 * glass, matte where it only baked. The one map that makes obsidian and slag
 * read as different materials from basalt rather than as darker basalt.
 */
export const glassyRoughness = (): THREE.Texture =>
  dataTexture('forge.glassRough', 128, (x, y, size) => 0.06 + Math.pow(n2(x, y, size, 7, 3511), 1.8) * 0.62);

/* --- the Works: floors ----------------------------------------------------------- */

export const HEXTILE_TILE = 1.5;

/** Per-pixel hex decomposition, shared by the colour and height passes. */
function hexAt(x: number, y: number, size: number): { edge: number; cell: number; id: number } {
  // Axial hex lattice, sampled by testing the three axis distances. Six tiles to
  // a repeat puts each one at about 25 cm - a real ablative tile size, and small
  // enough that the joints read as joints rather than as a painted grid.
  const s = size / 6;
  const u = x / s;
  const v = y / s;
  const q = u - v * 0.5;
  const r = v;
  const t = -q - r;
  const rq = Math.round(q);
  const rr = Math.round(r);
  const rt = Math.round(t);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const dt = Math.abs(rt - t);
  // Distance to the nearest cell boundary, in lattice units.
  const sorted = [dq, dr, dt].sort((a, b) => b - a);
  const edge = 1 - Math.min(1, ((sorted[1] ?? 0) - (sorted[2] ?? 0)) * 2.6);
  return { edge, cell: 1 - (sorted[0] ?? 0) * 2, id: hash1(rq * 31 + rr * 17, 97, 4201) };
}

/**
 * Ablative thermal tile: the floor of everything in the Works that stands over
 * hot rock. Pale ceramic hexes, soot in every joint, and a scatter of tiles that
 * have cracked or been replaced with a fresh one that has not weathered yet.
 */
export const hexTile = (): THREE.Texture =>
  colorTexture('forge.hexTile', SIZE, (x, y, size) => {
    const { edge, id } = hexAt(x, y, size);
    const grain = n2(x, y, size, 22, 4211, 3);

    // Two thirds of the tiles are the original ceramic, weathered to a warm
    // grey; the rest are replacements or have burned through to the substrate.
    let base = id > 0.86 ? rgb(0x9c9a90) : id < 0.14 ? rgb(0x555049) : rgb(0x7c7a70);
    base = mix(base, rgb(0x8e8c78), grain * 0.5);
    // Scorch blooms, drifting across the joints rather than following them. Held
    // to half strength: at 0.72 the whole floor went to near-black, and a
    // near-black albedo is zero in linear space whatever you light it with.
    const bloom = Math.max(0, n2(x, y, size, 3.4, 4231, 4) - 0.5) * 2.4;
    base = mix(base, rgb(0x3f3a35), Math.min(0.5, bloom));
    // The joint: dark, and slightly wider on one axis because it is grouted.
    base = mix(base, rgb(0x22201e), Math.min(1, edge * 1.15));
    return shade(base, 0.9 + grain * 0.2);
  });

export const hexTileNormal = (): THREE.Texture =>
  normalTexture('forge.hexTileN', SIZE, (x, y, size) => {
    const { edge, cell } = hexAt(x, y, size);
    return cell * 0.25 - edge * 0.85 + 0.5;
  }, 2.2);

export const GRATE_TILE = 0.95;

/** Open steel grating with the dark under it. Walkways, plant rooms, gantries. */
export const grating = (): THREE.Texture =>
  colorTexture('forge.grate', SIZE, (x, y, size) => {
    const bar = 0.14;
    const cx = (x / size) * 6;
    const cy = (y / size) * 6;
    const along = Math.abs((cx % 1) - 0.5) > 0.5 - bar ? 1 : 0;
    // Cross-bars are sparser than the bearing bars, exactly as real grating is.
    const across = Math.abs((cy % 3) / 3 - 0.5) > 0.5 - bar * 0.55 ? 1 : 0;
    const metal = Math.max(along, across);
    if (metal < 0.5) {
      // The void under the deck, with a hint of something warm a long way down.
      const deep = n2(x, y, size, 4, 4307, 3);
      return shade(mix(rgb(0x14100e), rgb(0x2e1a12), deep), 0.9);
    }
    const wear = n2s(x, y, size, 5, 14, 4313, 3);
    return temper(mix(rgb(0x5c6166), rgb(0x8c9298), wear * 0.9), Math.max(0, n2(x, y, size, 3, 4327) - 0.46) * 1.6);
  });

export const gratingNormal = (): THREE.Texture =>
  normalTexture('forge.grateN', SIZE, (x, y, size) => {
    const bar = 0.14;
    const cx = (x / size) * 6;
    const cy = (y / size) * 6;
    const along = Math.abs((cx % 1) - 0.5) > 0.5 - bar ? 1 : 0;
    const across = Math.abs((cy % 3) / 3 - 0.5) > 0.5 - bar * 0.55 ? 0.7 : 0;
    return Math.max(along, across);
  }, 3.4);

export const FERRO_TILE = 2.2;

/**
 * Basalt-aggregate ferrocrete: what the black site is actually cast out of. It
 * is poured, so it has form-tie holes and shutter lines, and it is cast from the
 * mountain it stands in, so the aggregate showing through is black.
 */
export const ferrocrete = (): THREE.Texture =>
  colorTexture('forge.ferro', SIZE, (x, y, size) => {
    const fine = n2(x, y, size, 26, 4401, 4);
    const patch = n2(x, y, size, 4, 4409, 4);
    let base = mix(rgb(0x5e5b56), rgb(0x77736c), patch * 0.9);
    // Exposed aggregate: dark angular chips, only where the surface has spalled.
    const spall = Math.max(0, n2(x, y, size, 9, 4421, 3) - 0.56) * 2.3;
    base = mix(base, rgb(0x35322f), Math.min(0.75, spall * (0.4 + fine)));
    // Shutter lines every 1.1 m of the tile, with form-tie holes on them.
    const board = ((y / size) * 4) % 1;
    if (board < 0.035) base = mix(base, rgb(0x403d39), 0.65);
    const tie = Math.hypot(((x / size) * 4) % 1 - 0.5, board - 0.017);
    if (tie < 0.02) base = mix(base, rgb(0x2c2a28), 0.85);
    // Heat has been through here: a warm bloom low in the tile.
    base = mix(base, rgb(0x6a4a34), Math.max(0, n2s(x, y, size, 3, 6, 4433, 3) - 0.55) * 1.4);
    return shade(base, (0.88 + fine * 0.24) * soot(x, y, size, 47, 0.35));
  });

/* --- the Works: walls ------------------------------------------------------------ */

export const PANEL_TILE = 2.4;

function panelAt(x: number, y: number, size: number): { seam: number; fastener: number; ribbed: number } {
  // Tall machined panels, three across a repeat, staggered course by course.
  const pw = size / 3;
  const ph = size / 2;
  const course = Math.floor(y / ph);
  const ox = (course % 2) * (pw / 2);
  const inX = (x + ox) % pw;
  const inY = y % ph;
  const seam = inX < 2.5 || inY < 2.5 ? 1 : 0;
  // Machine screws down each seam, at a spacing that reads as manufactured.
  const fastener = inX < 5 && Math.abs((inY % 26) - 13) < 2.2 ? 1 : 0;
  // A ribbed register across the middle third of every panel: it catches a
  // grazing light and is what stops a flat panel wall reading as cardboard.
  const ribbed = inY > ph * 0.42 && inY < ph * 0.68 ? (Math.abs(((inX / 7) % 1) - 0.5) < 0.28 ? 1 : 0) : 0;
  return { seam, fastener, ribbed };
}

/** Machined graphite panel. The Works' default wall: dark, precise, and hot. */
export const graphitePanel = (): THREE.Texture =>
  colorTexture('forge.panel', SIZE, (x, y, size) => {
    const { seam, fastener, ribbed } = panelAt(x, y, size);
    const brush = n2s(x, y, size, 40, 3, 4501, 2);
    const heat = Math.max(0, n2s(x, y, size, 2.5, 5, 4519, 3) - 0.42) * 2.1;

    let base = mix(rgb(0x4b4e52), rgb(0x60646a), brush * 0.85);
    base = temper(base, heat * 0.85);
    base = mix(base, rgb(0x6d7178), ribbed * 0.35);
    base = mix(base, rgb(0x26282b), seam * 0.8);
    base = mix(base, rgb(0x9aa0a6), fastener * 0.7);
    return shade(base, (0.9 + brush * 0.18) * soot(x, y, size, 53, 0.3));
  });

export const graphitePanelNormal = (): THREE.Texture =>
  normalTexture('forge.panelN', SIZE, (x, y, size) => {
    const { seam, fastener, ribbed } = panelAt(x, y, size);
    return 0.5 - seam * 0.55 + fastener * 0.4 + ribbed * 0.18;
  }, 2.0);

export const STENCIL_TILE = 2.8;

/**
 * Painted steel with the compartment number stencilled across it, half burned
 * off. Big flat letterforms drawn as boxes: from four metres in fog what reads
 * is that somebody labelled this place, not what the label says.
 */
export const stencilSteel = (): THREE.Texture =>
  colorTexture('forge.stencil', SIZE, (x, y, size) => {
    const u = (x / size) * 2 % 1;
    const v = (y / size) * 2 % 1;
    const brush = n2s(x, y, size, 30, 4, 4601, 2);
    let base = mix(rgb(0x585c54), rgb(0x6c7166), brush * 0.9);
    base = temper(base, Math.max(0, n2(x, y, size, 3.5, 4603) - 0.5) * 1.8);

    // Three glyph blocks in a row: a bar, a bar with a gap, and a ring.
    const paint = (): number => {
      if (v < 0.34 || v > 0.66) return 0;
      const g = (u - 0.16) * 3.4;
      if (g < 0 || g > 3) return 0;
      const slot = Math.floor(g);
      const f = g - slot;
      if (slot === 0) return f < 0.3 || (f > 0.62 && v > 0.46) ? 1 : 0;
      if (slot === 1) return f < 0.26 || f > 0.7 || Math.abs(v - 0.5) < 0.05 ? 1 : 0;
      return Math.abs(Math.hypot((f - 0.45) * 1.5, v - 0.5) - 0.13) < 0.055 ? 1 : 0;
    };
    // The paint has flaked: noise punches holes in the glyphs.
    const wear = n2(x, y, size, 16, 4611, 3);
    const glyph = paint() * (wear > 0.36 ? 1 : 0);
    base = mix(base, rgb(0xc8b878), glyph * 0.9);
    return shade(base, (0.88 + brush * 0.2) * soot(x, y, size, 59, 0.4));
  });

export const HAZARD_TILE = 1.0;

/** Chevrons, not stripes: this facility warns you which way to run. */
export const hazardChevron = (): THREE.Texture =>
  colorTexture('forge.hazard', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    // A chevron field is a triangle wave in x folded about the middle of y.
    const fold = Math.abs(v - 0.5) * 2;
    const band = ((u * 4 + fold * 0.8) % 1) < 0.5 ? 1 : 0;
    const wear = n2(x, y, size, 12, 4701, 4);
    const chip = Math.max(0, n2(x, y, size, 30, 4703, 3) - 0.55) * 2.4;
    const amber = mix(rgb(0xb08a24), rgb(0xd0a838), wear * 0.8);
    const black = mix(rgb(0x2a2724), rgb(0x3c3833), wear * 0.7);
    let base = band ? amber : black;
    // Bare metal where the paint has been kicked off.
    base = mix(base, rgb(0x74797d), Math.min(0.8, chip));
    return shade(base, (0.86 + wear * 0.26) * soot(x, y, size, 61, 0.45));
  });

export const SCORCH_TILE = 2.6;

/**
 * Heat-tempered plate, and the pack's prettiest surface. Nothing else in the
 * game has a rainbow on it, and here it is physically what happens to steel that
 * has spent twenty years next to something molten.
 */
export const scorchedPlate = (): THREE.Texture =>
  colorTexture('forge.scorch', SIZE, (x, y, size) => {
    const brush = n2s(x, y, size, 34, 4, 4801, 2);
    // The heat gradient is a big soft field, so whole plates go one colour and
    // the tempering bands run across them rather than speckling.
    const heat = n2(x, y, size, 2.2, 4813, 3) * 1.15;
    const weld = ridge(n2s(x, y, size, 3, 9, 4817, 3), 0.05);
    let base = temper(mix(rgb(0x4e5257), rgb(0x676c72), brush * 0.9), heat);
    // Weld beads: proud, brighter, and tempered harder than the plate.
    base = mix(base, temper(rgb(0x8a8f95), Math.min(1, heat + 0.3)), weld * 0.75);
    return shade(base, (0.9 + brush * 0.2) * soot(x, y, size, 67, 0.25));
  });

export const DUCT_TILE = 1.7;

/** Perforated ceiling duct panel: what the Works has instead of a ceiling. */
export const ductPanel = (): THREE.Texture =>
  colorTexture('forge.duct', SIZE, (x, y, size) => {
    const p = 16;
    const hole = Math.hypot(((x % p) - p / 2) / (p / 2), ((y % p) - p / 2) / (p / 2)) < 0.36 ? 1 : 0;
    const frame = x % (p * 6) < 3 || y % (p * 6) < 3 ? 1 : 0;
    const brush = n2s(x, y, size, 24, 6, 4901, 2);
    let base = mix(rgb(0x484c50), rgb(0x5b6065), brush * 0.9);
    base = mix(base, rgb(0x17191b), hole * 0.85);
    base = mix(base, rgb(0x63686d), frame * 0.5);
    return shade(base, (0.9 + brush * 0.16) * soot(x, y, size, 71, 0.35));
  });

/* --- the Mountain: rock ---------------------------------------------------------- */

export const BASALT_TILE = 2.0;

function basaltAt(x: number, y: number, size: number): { rope: number; crack: number; vesicle: number } {
  // Pahoehoe: the skin of a lava flow, folded into ropes. Stretched noise warped
  // by a second field, which is what stops the ropes reading as corrugated iron.
  const warp = n2(x, y, size, 3, 5101, 3) * 2.6;
  const rope = 0.5 + 0.5 * Math.sin(((y / size) * 7 + warp) * Math.PI * 2);
  const crack = crackMask(x, y, size, 5107, 3.2);
  // Gas bubbles frozen in the surface.
  const vesicle = Math.max(0, n2(x, y, size, 34, 5113, 2) - 0.6) * 2.5;
  return { rope, crack, vesicle };
}

/** Cooled pahoehoe. The Mountain's default surface, floor and wall alike. */
export const basalt = (): THREE.Texture =>
  colorTexture('forge.basalt', SIZE, (x, y, size) => {
    const { rope, crack, vesicle } = basaltAt(x, y, size);
    const grain = n2(x, y, size, 18, 5119, 3);
    // Warm-grey rather than black: a near-black albedo is 0 in linear space and
    // no amount of magma light brings it back.
    let base = mix(rgb(0x413c38), rgb(0x5b5450), rope * 0.7 + grain * 0.35);
    // The crack network is DARKER here - these are cold cracks, not hot ones.
    base = mix(base, rgb(0x272322), Math.min(0.85, crack * 0.9));
    base = mix(base, rgb(0x2e2a28), vesicle * 0.6);
    // An iridescent bloom on the high spots, the way fresh basalt glazes.
    base = mix(base, rgb(0x4a4a5e), Math.max(0, rope - 0.82) * 1.6);
    return shade(base, 0.88 + grain * 0.26);
  });

export const basaltNormal = (): THREE.Texture =>
  normalTexture('forge.basaltN', SIZE, (x, y, size) => {
    const { rope, crack, vesicle } = basaltAt(x, y, size);
    return rope * 0.5 - crack * 0.6 - vesicle * 0.35 + 0.4;
  }, 2.4);

export const TUFF_TILE = 2.6;

/**
 * Welded tuff: the compacted ash the tube walls are cut through. Bedded in
 * courses, full of lithic fragments, and much paler than the basalt - which is
 * what makes a tuff room and a basalt room read as two different places rather
 * than as one dark cave.
 */
export const tuff = (): THREE.Texture =>
  colorTexture('forge.tuff', SIZE, (x, y, size) => {
    const bed = n2s(x, y, size, 2.5, 11, 5201, 4);
    const fine = n2(x, y, size, 30, 5209, 3);
    let base = mix(rgb(0x6b6259), rgb(0x847a6e), bed * 0.9);
    // Lithic clasts: angular dark chunks thrown in when the ash fell.
    const clast = Math.max(0, n2(x, y, size, 13, 5231, 2) - 0.58) * 2.6;
    base = mix(base, rgb(0x3c3733), Math.min(0.8, clast));
    // Pale pumice fragments, the other half of the fall deposit.
    const pumice = Math.max(0, n2(x, y, size, 21, 5237, 2) - 0.63) * 2.8;
    base = mix(base, rgb(0xa8a094), Math.min(0.6, pumice));
    return shade(base, (0.86 + fine * 0.28) * soot(x, y, size, 73, 0.3));
  });

export const tuffNormal = (): THREE.Texture =>
  normalTexture('forge.tuffN', SIZE, (x, y, size) => {
    const clast = Math.max(0, n2(x, y, size, 13, 5231, 2) - 0.58) * 2.6;
    return n2s(x, y, size, 2.5, 11, 5201, 4) * 0.35 + clast * 0.5 + 0.35;
  }, 2.0);

export const OBSIDIAN_TILE = 1.6;

/**
 * Volcanic glass. Conchoidal fracture - the curved shell-shaped chips a glass
 * takes when it breaks - drawn as concentric arcs off scattered impact points,
 * with a cold sheen on the fresh faces.
 */
export const obsidian = (): THREE.Texture =>
  colorTexture('forge.obsidian', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    let shell = 0;
    for (let i = 0; i < 5; i++) {
      const cx = hash1(i, 17, 5301);
      const cy = hash1(i + 40, 17, 5303);
      const d = Math.hypot(
        Math.min(Math.abs(u - cx), 1 - Math.abs(u - cx)),
        Math.min(Math.abs(v - cy), 1 - Math.abs(v - cy)),
      );
      shell = Math.max(shell, ridge((d * 9) % 1, 0.16) * Math.max(0, 1 - d * 2.2));
    }
    const grain = n2(x, y, size, 16, 5309, 3);
    // Not black: a very dark warm grey with a blue-violet sheen on the fractures.
    let base = mix(rgb(0x322e33), rgb(0x413c44), grain * 0.7);
    base = mix(base, rgb(0x6a6480), shell * 0.55);
    // Rare snowflake inclusions, which are what say "obsidian" and not "asphalt".
    const flake = Math.max(0, n2(x, y, size, 44, 5323, 2) - 0.72) * 3.4;
    base = mix(base, rgb(0x9c9080), Math.min(0.55, flake));
    return shade(base, 0.9 + grain * 0.2);
  });

export const obsidianNormal = (): THREE.Texture =>
  normalTexture('forge.obsidianN', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    let shell = 0;
    for (let i = 0; i < 5; i++) {
      const cx = hash1(i, 17, 5301);
      const cy = hash1(i + 40, 17, 5303);
      const d = Math.hypot(
        Math.min(Math.abs(u - cx), 1 - Math.abs(u - cx)),
        Math.min(Math.abs(v - cy), 1 - Math.abs(v - cy)),
      );
      shell = Math.max(shell, ridge((d * 9) % 1, 0.16) * Math.max(0, 1 - d * 2.2));
    }
    return shell * 0.6 + 0.35;
  }, 1.6);

export const ASH_TILE = 1.8;

/**
 * Fall ash on a floor. Dune ripples warped hard - a stripe field warped by less
 * than one period reads as printed corduroy rather than as a surface something
 * blew across (docs/art/ROOM_REVIEW.md).
 */
export const ashFloor = (): THREE.Texture =>
  colorTexture('forge.ash', SIZE, (x, y, size) => {
    const warp = n2(x, y, size, 2.2, 5401, 3) * 3.4;
    const drift = n2(x, y, size, 5, 5407, 3);
    const ripple = 0.5 + 0.5 * Math.sin(((x / size) * 9 + warp + drift * 2.2) * Math.PI * 2);
    const fine = n2(x, y, size, 40, 5413, 2);
    let base = mix(rgb(0x615c57), rgb(0x7d766e), ripple * 0.55 + drift * 0.4);
    // Cinders sitting on top of the ash: the coarse fraction never buries.
    const cinder = Math.max(0, n2(x, y, size, 26, 5419, 2) - 0.6) * 2.6;
    base = mix(base, rgb(0x322c29), Math.min(0.7, cinder));
    return shade(base, (0.87 + fine * 0.24) * (1 - Math.max(0, drift - 0.6) * 0.5));
  });

export const ashNormal = (): THREE.Texture =>
  normalTexture('forge.ashN', SIZE, (x, y, size) => {
    const warp = n2(x, y, size, 2.2, 5401, 3) * 3.4;
    const drift = n2(x, y, size, 5, 5407, 3);
    return (0.5 + 0.5 * Math.sin(((x / size) * 9 + warp + drift * 2.2) * Math.PI * 2)) * 0.5 + 0.3;
  }, 1.4);

export const SULPHUR_TILE = 1.3;

/**
 * Sulphur crust round a fumarole: needle crystals growing out of a yellow rind,
 * with the rock showing through where the gas has not reached. The one saturated
 * surface in the pack that is not on fire.
 */
export const sulphurCrust = (): THREE.Texture =>
  colorTexture('forge.sulphur', SIZE, (x, y, size) => {
    const bloom = n2(x, y, size, 4, 5501, 4);
    const needle = ridge(n2s(x, y, size, 12, 26, 5507, 3), 0.09);
    const grain = n2(x, y, size, 28, 5519, 2);
    // Under the crust is baked rock; the crust itself runs from ochre to a
    // greenish citron where it is thickest and freshest.
    let base = mix(rgb(0x5d5348), rgb(0xa8952e), Math.min(1, Math.max(0, bloom - 0.32) * 2.6));
    base = mix(base, rgb(0xd6cf52), needle * Math.max(0, bloom - 0.36) * 2.2);
    // Realgar-red patches: arsenic sulphide, and the reason nobody goes in there.
    base = mix(base, rgb(0x9a4a2c), Math.max(0, n2(x, y, size, 8, 5527, 3) - 0.66) * 2.2);
    return shade(base, 0.88 + grain * 0.24);
  });

export const sulphurNormal = (): THREE.Texture =>
  normalTexture('forge.sulphurN', SIZE, (x, y, size) => {
    const bloom = n2(x, y, size, 4, 5501, 4);
    const needle = ridge(n2s(x, y, size, 12, 26, 5507, 3), 0.09);
    return needle * Math.max(0, bloom - 0.36) * 2.2 * 0.7 + bloom * 0.3 + 0.25;
  }, 2.6);

export const SLAG_TILE = 1.6;

/** Vitrified slag: what is left in the bottom of a crucible. Bubbled, glassy. */
export const slag = (): THREE.Texture =>
  colorTexture('forge.slag', SIZE, (x, y, size) => {
    const froth = n2(x, y, size, 14, 5601, 4);
    const bubble = Math.max(0, n2(x, y, size, 24, 5609, 2) - 0.5) * 2.2;
    let base = mix(rgb(0x38352f), rgb(0x56504a), froth * 0.85);
    base = mix(base, rgb(0x6a5a48), Math.min(0.7, bubble));
    // A metallic prill or two, frozen where it ran.
    base = mix(base, rgb(0x9a9188), Math.max(0, n2(x, y, size, 40, 5623, 2) - 0.72) * 3);
    return shade(base, 0.86 + froth * 0.28);
  });

/* --- the hot surfaces ------------------------------------------------------------ */

export const MAGMA_TILE = 2.4;

/**
 * The lava lake: a crust of cooled plates with incandescence in every crack.
 *
 * There are TWO recipes and they are the same mask twice. The colour map is what
 * the surface looks like in the dark - a black crust with dull red in the
 * fissures. The emissive map is what it emits, and it goes from deep red at the
 * edge of a crack to a yellow-white core. Kept as a colour texture rather than a
 * greyscale one so the material's emissive can be plain white and the HUE ramp
 * comes out of the picture, which is what makes the middle of a crack look
 * hotter rather than just brighter.
 */
export const magmaCrust = (): THREE.Texture =>
  colorTexture('forge.magma', SIZE, (x, y, size) => {
    const crack = crackMask(x, y, size, 5701, 3.4);
    const plate = n2(x, y, size, 7, 5711, 3);
    let base = mix(rgb(0x211a18), rgb(0x3a2f2a), plate * 0.8);
    // The rind either side of a crack is warm before the crack itself is hot.
    base = mix(base, rgb(0x7a3418), Math.min(1, crack * 1.5));
    base = mix(base, rgb(0xd8621e), Math.max(0, crack - 0.55) * 2.2);
    base = mix(base, rgb(0xffc85a), Math.max(0, crack - 0.84) * 6);
    return base;
  });

export const magmaEmissive = (): THREE.Texture =>
  colorTexture('forge.magmaE', SIZE, (x, y, size) => {
    const crack = crackMask(x, y, size, 5701, 3.4);
    // Nothing outside a crack emits at all: a crust that glows everywhere reads
    // as a sheet of orange plastic rather than as rock with fire under it.
    const hot = Math.max(0, crack - 0.34) * 1.52;
    let c = mix(rgb(0x000000), rgb(0x902000), Math.min(1, hot * 1.6));
    c = mix(c, rgb(0xff5a10), Math.max(0, hot - 0.35) * 1.9);
    c = mix(c, rgb(0xfff0b0), Math.max(0, hot - 0.78) * 4.2);
    return c;
  });

export const magmaNormal = (): THREE.Texture =>
  normalTexture('forge.magmaN', SIZE, (x, y, size) => {
    const crack = crackMask(x, y, size, 5701, 3.4);
    return n2(x, y, size, 7, 5711, 3) * 0.4 - crack * 0.7 + 0.5;
  }, 2.2);

export const CRUST_TILE = 1.9;

/**
 * The same substance a stage cooler: black crust with a dull ember network. This
 * is what the shell's heat register is made of, and what a fissure in a wall is
 * lined with. Deliberately far dimmer than `magma` - the register runs round
 * every wall of every room in the Mountain half, and at the magma's brightness
 * the whole map would be one orange wash with no darkness left in it.
 */
export const emberCrust = (): THREE.Texture =>
  colorTexture('forge.crust', SIZE, (x, y, size) => {
    const crack = crackMask(x, y, size, 5801, 4.6);
    const plate = n2(x, y, size, 11, 5807, 3);
    let base = mix(rgb(0x252020), rgb(0x393130), plate * 0.85);
    base = mix(base, rgb(0x6a2c14), Math.max(0, crack - 0.4) * 1.7);
    base = mix(base, rgb(0xb8541c), Math.max(0, crack - 0.78) * 3.4);
    return base;
  });

export const emberCrustEmissive = (): THREE.Texture =>
  colorTexture('forge.crustE', SIZE, (x, y, size) => {
    const crack = crackMask(x, y, size, 5801, 4.6);
    const hot = Math.max(0, crack - 0.5) * 2;
    let c = mix(rgb(0x000000), rgb(0x7a2200), Math.min(1, hot * 1.5));
    c = mix(c, rgb(0xff6a18), Math.max(0, hot - 0.45) * 2.2);
    return c;
  });

/* --- the bio strand -------------------------------------------------------------- */

export const CHITIN_TILE = 1.2;

/**
 * What was grown in the Vivarium and got out. A hard segmented rind over a
 * translucent interior, in a green nobody chose - it is the colour of a
 * chemosynthetic thing that has never seen daylight, and it belongs to neither
 * half of the map, which is exactly why it is frightening in both.
 */
export const chitin = (): THREE.Texture =>
  colorTexture('forge.chitin', SIZE, (x, y, size) => {
    const seg = 0.5 + 0.5 * Math.sin(((y / size) * 11 + n2(x, y, size, 3, 5901, 3) * 1.6) * Math.PI * 2);
    const pore = Math.max(0, n2(x, y, size, 30, 5903, 2) - 0.58) * 2.6;
    const vein = ridge(n2s(x, y, size, 6, 14, 5911, 3), 0.06);
    let base = mix(rgb(0x3e4a38), rgb(0x5e6b46), seg * 0.8);
    base = mix(base, rgb(0x8fa858), vein * 0.6);
    base = mix(base, rgb(0x232a20), Math.min(0.7, pore));
    return shade(base, 0.86 + seg * 0.26);
  });

/** The glow inside it: only in the veins, so it reads as lit from within. */
export const chitinEmissive = (): THREE.Texture =>
  colorTexture('forge.chitinE', SIZE, (x, y, size) => {
    const vein = ridge(n2s(x, y, size, 6, 14, 5911, 3), 0.06);
    const pulse = n2(x, y, size, 4, 5917, 3);
    return mix(rgb(0x000000), rgb(0x6ef0a0), Math.min(1, Math.max(0, vein - 0.25) * 1.6 * (0.4 + pulse)));
  });

/* --- screens and signage --------------------------------------------------------- */

/**
 * The mimic board: a schematic of the mountain and the shafts driven into it,
 * with the live circuits picked out. Green on near-black, because that is what a
 * plant mimic looks like and because it is the one screen colour that does not
 * fight the map's orange.
 */
export const screenMimic = (): THREE.Texture =>
  colorTexture('forge.scrMimic', 128, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const bg = rgb(0x08120c);
    // The cone of the mountain, as two diagonals.
    const cone = Math.abs(Math.abs(u - 0.5) - (0.92 - v) * 0.42) < 0.012 ? 1 : 0;
    // Level lines: the galleries, at four depths, with node boxes on them.
    let line = 0;
    for (let i = 0; i < 4; i++) {
      const ly = 0.2 + i * 0.16;
      if (Math.abs(v - ly) < 0.008 && Math.abs(u - 0.5) < 0.1 + i * 0.08) line = 1;
      for (let n = 0; n < 3; n++) {
        const nx = 0.5 + (n - 1) * (0.09 + i * 0.07);
        if (Math.abs(u - nx) < 0.022 && Math.abs(v - ly) < 0.018) line = hash1(i * 7 + n, 23, 6001) > 0.3 ? 1 : 0.25;
      }
    }
    // The shaft down the middle, and the bore at the bottom of it.
    const shaft = Math.abs(u - 0.5) < 0.006 && v > 0.14 && v < 0.86 ? 1 : 0;
    const bore = Math.hypot((u - 0.5) * 1.2, v - 0.14) < 0.035 ? 1 : 0;
    const glyph = Math.max(cone * 0.55, Math.max(line, Math.max(shaft * 0.8, bore)));
    const scan = 0.82 + 0.18 * (y % 2);
    return shade(mix(bg, rgb(0x64ffa8), glyph), scan);
  });

/** A seismograph, drawn as four traces. One of them is not quiet. */
export const screenSeismo = (): THREE.Texture =>
  colorTexture('forge.scrSeismo', 128, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    let hit = 0;
    for (let i = 0; i < 4; i++) {
      const base = 0.16 + i * 0.22;
      const energy = i === 2 ? 0.06 : 0.008;
      const wave =
        Math.sin(u * 41 + i * 3) * energy +
        Math.sin(u * 113 + i) * energy * 0.5 +
        (hash1(Math.floor(u * 60) + i * 31, 61, 6101) - 0.5) * energy * 2.4;
      if (Math.abs(v - (base + wave)) < 0.006) hit = 1;
      if (Math.abs(v - base) < 0.0025) hit = Math.max(hit, 0.2);
    }
    const grid = (u * 16) % 1 < 0.03 || (v * 8) % 1 < 0.04 ? 0.13 : 0;
    const scan = 0.84 + 0.16 * (y % 2);
    return shade(mix(rgb(0x0a1014), mix(rgb(0x2f6a7a), rgb(0xa8f0ff), hit), Math.max(hit, grid)), scan);
  });

/** A column of readout, mostly numbers, one line of it flashing red. */
export const screenReadout = (): THREE.Texture =>
  colorTexture('forge.scrRead', 128, (x, y, size) => {
    const row = Math.floor((y / size) * 16);
    const col = Math.floor((x / size) * 22);
    const live = hash1(row * 31 + col, 89, 6201);
    const inRow = ((y / size) * 16) % 1 > 0.22 && ((y / size) * 16) % 1 < 0.82;
    const inCol = ((x / size) * 22) % 1 < 0.66;
    const alarm = row === 11;
    const on = inRow && inCol && live > (col < 4 ? 0.15 : 0.52);
    const ink = alarm ? rgb(0xff5a3c) : col < 4 ? rgb(0x50a888) : rgb(0x9ce0c0);
    return shade(mix(rgb(0x081010), ink, on ? 1 : 0), 0.85 + 0.15 * (y % 2));
  });

/* --- masks for the things that are LIGHT rather than surface ---------------------- */

/**
 * A radial falloff, white in the middle and black at the rim.
 *
 * Every additive wash in the pack carries this as its `map`, and it is the
 * difference between a pool of light and a flat disc of paint. Additive blending
 * adds the texture's colour, so black adds exactly nothing: the edge of a pool
 * fades out instead of ending on a hard circle. Without it the map's floors came
 * out with beige pancakes on them wherever anything was hot, which is the same
 * failure as an emissive decal carrying its own dark background - one direction
 * along.
 *
 * The rim is squared off with a power curve rather than left linear, because a
 * linear falloff still shows its boundary as a faint ring.
 */
export const radialFalloff = (): THREE.Texture =>
  colorTexture('forge.falloff', 128, (x, y, size) => {
    const d = Math.hypot(x / size - 0.5, y / size - 0.5) * 2;
    const v = Math.pow(Math.max(0, 1 - d), 2.1);
    // A little noise in it, so a big pool is not a perfect gradient.
    const n = 0.82 + n2(x, y, size, 5, 7101, 3) * 0.36;
    const k = clamp255(v * n * 255);
    return [k, k, k];
  });

/**
 * A plume: soft at the sides, thinning as it rises, with structure in it.
 *
 * Steam, gas and heat shimmer are all quads carrying this. A plume quad with no
 * mask has four hard edges and reads as a pane of fog standing in the room - the
 * exact failure the viscera pass hit with its membrane curtains, and the reason
 * every column of vapour in this pack is masked rather than merely faint.
 */
export const plumeFade = (): THREE.Texture =>
  colorTexture('forge.plume', 128, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    // Side falloff, wider at the bottom; vertical falloff, thinning to nothing.
    const side = Math.pow(Math.max(0, 1 - Math.abs(u - 0.5) * 2 / (0.55 + v * 0.45)), 1.7);
    const rise = Math.pow(Math.max(0, 1 - v), 1.25) * Math.min(1, v * 6);
    const churn = 0.55 + fbm(u * 4, v * 3 - v * 2, 4, 3, 7207, 4) * 0.9;
    const k = clamp255(side * rise * churn * 255);
    return [k, k, k];
  });

/* --- what is behind a slit ------------------------------------------------------- */

/**
 * The picture hung behind an armoured viewing slit: a magma shaft going down
 * further than the frame. Unlit, so it survives being in the dark, and painted
 * with its own depth gradient because it is standing in for a volume.
 */
export const shaftBackdrop = (): THREE.Texture =>
  colorTexture('forge.shaft', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    // Rock walls converging toward the bottom of the frame.
    const throat = 0.5 - v * 0.16;
    const du = Math.abs(u - 0.5);
    const wallN = n2(x, y, size, 6, 6301, 4);

    if (du > throat) {
      // The shaft wall, going black as it goes up and away.
      const away = Math.min(1, (du - throat) * 2.6);
      let wall = mix(rgb(0x4a3a30), rgb(0x2a2220), wallN * 0.7 + away * 0.6);
      // Lit from below by what is at the bottom.
      wall = mix(wall, rgb(0x8a3a12), Math.max(0, 0.42 - v) * 1.6 * (1 - away));
      return shade(wall, 0.9 + wallN * 0.2);
    }
    // The column of air, and the glow rising up it.
    const rise = Math.max(0, 1 - v / 0.55);
    let air = mix(rgb(0x140c0a), rgb(0xff7a22), Math.pow(rise, 1.5));
    air = mix(air, rgb(0xffd888), Math.pow(Math.max(0, 1 - Math.hypot(du * 3.2, v - 0.04) / 0.3), 2.4));
    // Sparks and falling scoria, so the volume is not a flat gradient.
    const fleck = Math.max(0, n2(x, y, size, 46, 6311, 2) - 0.72) * 3.4;
    air = mix(air, rgb(0xffb060), Math.min(0.7, fleck * rise));
    return air;
  });

/**
 * The other thing behind a slit: an ash sky at the top of a bore, seen from a
 * long way down. The only piece of "outside" anywhere in the map, and it is
 * still not daylight.
 */
export const skyBackdrop = (): THREE.Texture =>
  colorTexture('forge.sky', SIZE, (x, y, size) => {
    const v = y / size;
    const cloud = n2s(x, y, size, 4, 2.5, 6401, 4);
    const high = n2s(x, y, size, 9, 5, 6407, 3);
    // Ash cloud lit from beneath by the vent: brown at the bottom, lead at the top.
    let c = mix(rgb(0x2a2a34), rgb(0x5a4a44), Math.pow(v, 1.4));
    c = mix(c, rgb(0x8a6a48), Math.max(0, cloud - 0.4) * 1.6 * Math.pow(v, 1.8));
    c = mix(c, rgb(0x1c1c24), Math.max(0, high - 0.55) * 1.8 * (1 - v));
    return shade(c, 0.9 + cloud * 0.2);
  });

/* --- surfaces authored in 0..1 UV space (shared art is NOT batched) --------------- */

/**
 * The door leaf. Shared art carries ONE UV repeat over the whole leaf, so a
 * tiling map smears into a blank slab (docs/art/SHARED_ART.md §3.1). This is
 * therefore composed AS a door: a heavy centre rib, two hinge straps, a vision
 * slot and a stencilled number block, all placed in 0..1.
 */
export const blastDoorSkin = (): THREE.Texture =>
  colorTexture('forge.doorSkin', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const brush = n2s(x, y, size, 26, 8, 6501, 2);
    let base = temper(mix(rgb(0x4e5257), rgb(0x63686e), brush * 0.9), Math.max(0, n2(x, y, size, 3, 6503) - 0.45) * 1.5);

    // Border frame, inset a little from the edge.
    const border = u < 0.07 || u > 0.93 || v < 0.05 || v > 0.95;
    if (border) base = mix(base, rgb(0x3a3e42), 0.6);
    // Vertical centre rib with a shadow line either side of it.
    if (Math.abs(u - 0.5) < 0.045) base = mix(base, rgb(0x777d83), 0.55);
    if (Math.abs(Math.abs(u - 0.5) - 0.055) < 0.008) base = mix(base, rgb(0x2b2e31), 0.7);
    // Two hinge straps across the leaf, with bolts.
    for (const hy of [0.22, 0.78]) {
      if (Math.abs(v - hy) < 0.038) {
        base = mix(base, rgb(0x6e747a), 0.6);
        if (((u * 12) % 1) < 0.18) base = mix(base, rgb(0x9aa0a6), 0.7);
      }
    }
    // The vision slot: a dark laminated pane, high and central.
    if (Math.abs(u - 0.5) < 0.17 && Math.abs(v - 0.62) < 0.06) {
      base = mix(rgb(0x1a2226), rgb(0x33454c), n2(x, y, size, 14, 6511, 2));
      if (Math.abs(v - 0.62) > 0.05 || Math.abs(u - 0.5) > 0.16) base = rgb(0x2f3438);
    }
    // A stencilled hazard block low on the leaf.
    if (v > 0.1 && v < 0.16 && u > 0.16 && u < 0.84) {
      const band = ((u * 9 + Math.abs(v - 0.13) * 6) % 1) < 0.5;
      base = mix(base, band ? rgb(0xb08a24) : rgb(0x2a2724), 0.8);
    }
    return shade(base, (0.9 + brush * 0.18) * soot(x, y, size, 79, 0.3));
  });

/** The exit door: the same construction, painted in the one colour that means out. */
export const exitDoorSkin = (): THREE.Texture =>
  colorTexture('forge.exitSkin', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const brush = n2s(x, y, size, 24, 8, 6601, 2);
    let base = mix(rgb(0x2e6a62), rgb(0x47897e), brush * 0.85);
    if (u < 0.07 || u > 0.93 || v < 0.05 || v > 0.95) base = mix(base, rgb(0x1f4a46), 0.7);
    // A big chevron pointing up: the print reads as "this way" at any distance.
    const cv = (v - 0.3) * 1.6;
    if (cv > 0 && cv < 1 && Math.abs(Math.abs(u - 0.5) - (0.36 - cv * 0.22)) < 0.075) {
      base = mix(base, rgb(0xbdf0dc), 0.85);
    }
    if (Math.abs(u - 0.5) < 0.05) base = mix(base, rgb(0x1c4440), 0.5);
    return shade(base, 0.9 + brush * 0.2);
  });

/** The chest: a transit case for something that must not get out. */
export const caseSkin = (): THREE.Texture =>
  colorTexture('forge.caseSkin', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const grain = n2s(x, y, size, 18, 10, 6701, 3);
    let base = mix(rgb(0x54544e), rgb(0x6a6a62), grain * 0.9);
    // Ribbed shell: broad flutes, which is how a hard case is stiffened.
    const flute = Math.abs(((u * 7) % 1) - 0.5);
    base = mix(base, rgb(0x7c7c72), Math.max(0, 0.3 - flute) * 2);
    if (flute > 0.46) base = mix(base, rgb(0x33332f), 0.7);
    // Corner bumpers and a hazard label across the middle.
    if ((u < 0.09 || u > 0.91) && (v < 0.14 || v > 0.86)) base = mix(base, rgb(0x2a2724), 0.75);
    if (v > 0.44 && v < 0.56 && u > 0.22 && u < 0.78) {
      base = mix(base, ((u * 10) % 1) < 0.5 ? rgb(0xb08a24) : rgb(0x2a2724), 0.85);
    }
    return shade(base, (0.9 + grain * 0.2) * soot(x, y, size, 83, 0.3));
  });

/** The locker: a crew locker, dented, with a louvre and a name card holder. */
export const lockerSkin = (): THREE.Texture =>
  colorTexture('forge.lockerSkin', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const brush = n2s(x, y, size, 22, 9, 6801, 2);
    let base = mix(rgb(0x4a5450), rgb(0x5e6a64), brush * 0.9);
    if (u < 0.06 || u > 0.94) base = mix(base, rgb(0x333b38), 0.6);
    // Louvres, in the top third.
    if (v > 0.66 && v < 0.9 && ((v * 46) % 1) < 0.45 && u > 0.18 && u < 0.82) base = mix(base, rgb(0x1d2422), 0.85);
    // Name card holder.
    if (v > 0.55 && v < 0.62 && u > 0.28 && u < 0.72) base = mix(base, rgb(0xa8a498), 0.7);
    // The handle recess, low and to one side.
    if (u > 0.74 && u < 0.86 && v > 0.4 && v < 0.5) base = mix(base, rgb(0x2c3230), 0.8);
    // Dents.
    base = mix(base, rgb(0x6f7a74), Math.max(0, n2(x, y, size, 8, 6811, 3) - 0.6) * 1.8);
    return shade(base, (0.9 + brush * 0.18) * soot(x, y, size, 89, 0.35));
  });
