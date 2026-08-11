/**
 * Kerberos Deep's surfaces, generated as procedural pixel data.
 *
 * Same three rules as everywhere else in art (art/lib/textures.ts): no canvas, no
 * `Math.random()`, cached at module scope. Every recipe below is a pure function
 * of pixel coordinates, so a room builds identically in a browser, on a peer's
 * machine, and headless inside `scripts/validateArt.mjs`.
 *
 * `*_TILE` is the size in METRES that one repeat covers. `merge.ts` bakes UVs in
 * world units, so a texture keeps its density whether it lands on a 0.4 m pipe
 * lagging or an 8 m hangar floor.
 *
 * The pack splits down the middle. **Station** surfaces - tread plate, riveted
 * hull, lab tile, painted steel - are hard, straight-edged and man-made, and
 * every one of them is losing to salt. **Abyss** surfaces - silt, pillow basalt,
 * barnacle crust, brine crystal - have no straight lines in them at all. Walking
 * from one into the other should register before you have read a single prop,
 * which is why the two families share no colour and no frequency.
 *
 * Albedos are mid-tones. Colour is converted to linear space before lighting,
 * where a near-black picked in a colour wheel is effectively 0 and no amount of
 * bioluminescence brings it back. The station is dark because of the lighting
 * and the fog, not because the steel is black.
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
 * One function does hairline cracks, weld beads, salt veining and the branch
 * structure of coral - the single most useful primitive in the pack.
 */
const ridge = (n: number, width: number): number => Math.max(0, 1 - Math.abs(n - 0.5) / width);

/**
 * Rust and salt bloom running DOWN a surface. Everything vertical in this
 * station has weeping stains under every fastener, and this is the one function
 * that puts them there.
 */
function weep(x: number, y: number, size: number, seed: number, strength: number): number {
  const runs = n2s(x, y, size, 7, 2, seed, 4);
  const blotch = n2(x, y, size, 6, seed + 61, 3);
  return Math.max(0, runs - 0.5) * strength * 1.7 + Math.max(0, blotch - 0.6) * strength;
}

/** Generic grime multiplier around 1, for anything that has sat in salt water. */
function grime(x: number, y: number, size: number, seed: number, strength: number): number {
  const patch = n2(x, y, size, 5, seed, 4);
  return 1 - Math.max(0, patch - 0.52) * strength * 1.4;
}

/* --- shared maps ---------------------------------------------------------------- */

/**
 * Wet roughness. Nothing down here is dry: condensation pools in the low spots
 * and dries on the high ones, and that variation is most of what tells the eye a
 * surface is cold and damp rather than painted plastic.
 */
export const wetRoughness = (): THREE.Texture =>
  dataTexture('abyss.wetRough', 128, (x, y, size) => 0.16 + Math.pow(n2(x, y, size, 8, 1201), 1.5) * 0.6);

/** Scuffed metal roughness: polished where hands and boots go, dull elsewhere. */
export const metalRoughness = (): THREE.Texture =>
  dataTexture('abyss.metalRough', 128, (x, y, size) => 0.3 + n2s(x, y, size, 18, 5, 1307) * 0.55);

/** Dry roughness, for silt, rock and salt. Broken up rather than pooled. */
export const dryRoughness = (): THREE.Texture =>
  dataTexture('abyss.dryRough', 128, (x, y, size) => 0.66 + n2(x, y, size, 14, 1409) * 0.34);

/* --- station: steel, tile, concrete ---------------------------------------------- */

export const DECK_TILE = 1.7;

/** Per-pixel tread-plate decomposition, shared by the colour and height passes. */
function deckAt(x: number, y: number): { tread: number; seam: number } {
  // Elongated diamonds in a staggered lattice, alternating direction row to row -
  // which is what real anti-slip plate does, and what stops it reading as a
  // wallpaper pattern.
  const cell = 34;
  const row = Math.floor(y / cell);
  const ox = (row % 2) * (cell / 2);
  const lx = (((x + ox) % cell) / cell) - 0.5;
  const ly = ((y % cell) / cell) - 0.5;
  const a = (row % 2 ? 1 : -1) * 0.72;
  const u = lx * Math.cos(a) - ly * Math.sin(a);
  const v = lx * Math.sin(a) + ly * Math.cos(a);
  const tread = Math.max(0, 1 - (Math.abs(u) / 0.4 + Math.abs(v) / 0.115));
  // Plate joins every four cells: the deck is bolted down in sections.
  const seam = Math.min(x % (cell * 4), y % (cell * 4)) < 2 ? 1 : 0;
  return { tread: Math.min(1, tread * 1.6), seam };
}

/** Galvanised anti-slip deck plate, worn to bare metal on the walking line. */
export const deckPlate = (): THREE.Texture =>
  colorTexture('abyss.deck', SIZE, (x, y, size) => {
    const { tread, seam } = deckAt(x, y);
    const wear = n2s(x, y, size, 4, 9, 2101, 4);
    const rust = Math.max(0, n2(x, y, size, 7, 2213, 4) - 0.54) * 2.2;

    let base = mix(rgb(0x4c5359), rgb(0x767f86), wear * 0.8);
    // The treads are polished by boots; the field between them holds the dirt.
    base = mix(base, rgb(0x9aa3a8), tread * 0.65);
    base = mix(base, rgb(0x6d4526), Math.min(0.8, rust));
    base = mix(base, rgb(0x2f3438), seam * 0.7);
    return shade(base, (0.86 + wear * 0.24) * grime(x, y, size, 31, 0.4));
  });

export const deckNormal = (): THREE.Texture =>
  normalTexture(
    'abyss.deckN',
    SIZE,
    (x, y) => {
      const { tread, seam } = deckAt(x, y);
      return tread * 0.9 - seam * 0.5 + 0.3;
    },
    2.6,
  );

export const HULL_TILE = 2.6;

function hullAt(x: number, y: number, size: number): { seam: number; rivet: number; plate: number; dent: number } {
  // Plates are wider than they are tall, staggered course by course, exactly as a
  // pressure hull is shelled. The rivets follow the seams, which is the detail
  // that makes it read as riveted rather than as a grid drawn on a wall.
  const ph = 84;
  const pw = 132;
  const course = Math.floor(y / ph);
  const ox = (course % 2) * (pw / 2);
  const inY = y % ph;
  const inX = (x + ox) % pw;
  const seam = Math.min(inY, ph - inY) < 2.5 || Math.min(inX, pw - inX) < 2.5 ? 1 : 0;

  // Rivet heads: a ring of them 7 px in from each seam.
  const rx = Math.min(inX, pw - inX);
  const ry = Math.min(inY, ph - inY);
  const along = rx < ry ? inY : inX;
  const edge = Math.min(rx, ry);
  const spacing = 18;
  const near = Math.abs((along % spacing) - spacing / 2);
  const rivet = edge > 4 && edge < 12 && near < 3.4 ? Math.max(0, 1 - (Math.hypot(edge - 8, near) / 3.4)) : 0;

  const dent = n2(x, y, size, 9, 2311, 3);
  return { seam, rivet, plate: hash1(course * 31 + Math.floor((x + ox) / pw) * 17, 64, 2417), dent };
}

/** Riveted pressure hull. Grey-green marine paint, weeping rust from every seam. */
export const hullPlate = (): THREE.Texture =>
  colorTexture('abyss.hull', SIZE, (x, y, size) => {
    const { seam, rivet, plate, dent } = hullAt(x, y, size);
    const stain = weep(x, y, size, 2531, 0.9);

    let base = mix(rgb(0x505c5e), rgb(0x6b7876), plate * 0.5 + dent * 0.6);
    base = mix(base, rgb(0x333c3e), seam * 0.85);
    base = mix(base, rgb(0x8b9491), rivet * 0.7);
    // Rust always arrives from above: bleed it down out of the seams.
    base = mix(base, rgb(0x7a4622), Math.min(0.75, stain));
    return shade(base, (0.88 + dent * 0.2) * grime(x, y, size, 43, 0.35));
  });

export const hullNormal = (): THREE.Texture =>
  normalTexture(
    'abyss.hullN',
    SIZE,
    (x, y, size) => {
      const { seam, rivet, dent } = hullAt(x, y, size);
      return 0.45 + rivet * 0.6 - seam * 0.45 + dent * 0.12;
    },
    2.4,
  );

export const PAINT_TILE = 2.2;

/**
 * Institutional painted steel, in the pale sea-green every research vessel
 * built before 1990 was painted with. The paint is failing in sheets rather than
 * fading, so the interest is all in the CHIP EDGES - a hard boundary between
 * mint green and orange rust, which no amount of noise on its own gives you.
 */
export const paintedSteel = (): THREE.Texture =>
  colorTexture('abyss.paint', SIZE, (x, y, size) => {
    // The chip threshold is high on purpose. At 0.56 a third of every bulkhead
    // was bare rust and the pale-green paint stopped being the surface at all -
    // what sells failing paint is a few hard-edged holes in a lot of paint.
    const field = n2(x, y, size, 4.5, 3101, 4);
    const chip = field > 0.64 ? 1 : 0;
    const lip = ridge(field - 0.05, 0.018);
    const scratch = ridge(n2s(x, y, size, 30, 6, 3203, 2), 0.02);
    const stain = weep(x, y, size, 3307, 0.7);

    let base = mix(rgb(0x6d8579), rgb(0x8ea79a), n2(x, y, size, 11, 3413, 3) * 0.9);
    if (chip) base = mix(rgb(0x64503c), rgb(0x7d6340), n2(x, y, size, 16, 3517, 3));
    base = mix(base, rgb(0xa9bcae), lip * 0.6);
    base = mix(base, rgb(0x54655d), scratch * 0.4);
    base = mix(base, rgb(0x7d4a24), Math.min(0.6, stain));
    return shade(base, 0.9 + n2(x, y, size, 22, 3623, 2) * 0.2);
  });

export const paintNormal = (): THREE.Texture =>
  normalTexture(
    'abyss.paintN',
    SIZE,
    (x, y, size) => {
      const field = n2(x, y, size, 4.5, 3101, 4);
      return (field > 0.64 ? 0.3 : 0.55) + ridge(n2s(x, y, size, 30, 6, 3203, 2), 0.02) * 0.15;
    },
    1.6,
  );

export const LAB_TILE = 1.6;

function labAt(x: number, y: number): { grout: number; cracked: boolean; tone: number; chip: number } {
  const cell = 30;
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const inX = x % cell;
  const inY = y % cell;
  const d = Math.min(inX, cell - inX, inY, cell - inY);
  const tone = hash1(gx * 23 + gy * 41, 64, 4103);
  return {
    grout: Math.max(0, 1 - d / 2.4),
    // One tile in fifteen is gone entirely, showing the bedding behind it.
    cracked: hash1(gx * 7 + gy * 13, 64, 4211) > 0.93,
    tone,
    chip: Math.max(0, 1 - Math.min(d, 5) / 5),
  };
}

/** Lab and wet-room tile: clinical mint ceramic, grouted, and long past clean. */
export const labTile = (): THREE.Texture =>
  colorTexture('abyss.labTile', SIZE, (x, y, size) => {
    const { grout, cracked, tone, chip } = labAt(x, y);
    const film = n2(x, y, size, 8, 4317, 4);
    const mould = Math.max(0, n2(x, y, size, 13, 4421, 3) - 0.56) * 2.4;

    let base = cracked
      ? mix(rgb(0x4b4a44), rgb(0x63605a), film)
      : mix(rgb(0xa7bdb4), rgb(0xc6d6cd), tone * 0.55 + film * 0.5);
    base = mix(base, rgb(0x6f7a72), grout * 0.9);
    base = mix(base, rgb(0x89988f), chip * 0.18);
    // The grout is where the mould lives, so weight it there.
    base = mix(base, rgb(0x3f5442), Math.min(0.8, mould * (0.4 + grout)));
    return shade(base, (0.9 + film * 0.18) * grime(x, y, size, 59, 0.3));
  });

export const labTileNormal = (): THREE.Texture =>
  normalTexture('abyss.labTileN', SIZE, (x, y) => 0.6 - labAt(x, y).grout * 0.6, 2.6);

export const CONCRETE_TILE = 3.2;

/** Poured concrete, cast against boards, blooming salt out of every crack. */
export const wetConcrete = (): THREE.Texture =>
  colorTexture('abyss.concrete', SIZE, (x, y, size) => {
    const body = n2(x, y, size, 7, 5101, 5);
    const aggregate = Math.max(0, n2(x, y, size, 40, 5209, 2) - 0.62) * 2.6;
    const board = Math.abs((((y / size) * 9) % 1) - 0.5) * 2;
    const crack = ridge(n2(x, y, size, 3.5, 5323, 3), 0.012);
    const bloom = ridge(n2(x, y, size, 5, 5431, 3), 0.05);

    let base = mix(rgb(0x5f6469), rgb(0x848a8c), body * 0.95);
    base = mix(base, rgb(0x9aa09c), aggregate * 0.5);
    base = mix(base, rgb(0x4b5055), Math.max(0, 0.16 - board) * 3);
    base = mix(base, rgb(0x33383c), crack * 0.8);
    // Efflorescence: white salt pushing out of the concrete along the damp.
    base = mix(base, rgb(0xcfd6cf), bloom * 0.35);
    return shade(base, (0.88 + body * 0.2) * grime(x, y, size, 67, 0.35));
  });

export const PANEL_TILE = 2.4;

/**
 * The ceiling of every station room: framed steel panels, half of them
 * perforated, with the frame grid holding them up. A ceiling is seen edge-on
 * from a standing eye, so the frames matter far more than the panel faces.
 */
export const ceilingPanel = (): THREE.Texture =>
  colorTexture('abyss.panel', SIZE, (x, y, size) => {
    const cell = 64;
    const inX = x % cell;
    const inY = y % cell;
    const frame = Math.min(inX, cell - inX, inY, cell - inY) < 3.5 ? 1 : 0;
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    const perforated = hash1(gx * 19 + gy * 7, 32, 6101) > 0.45;
    const hole = perforated && (inX % 7 < 3 && inY % 7 < 3) ? 1 : 0;
    const stain = n2(x, y, size, 6, 6203, 4);

    let base = mix(rgb(0x53585e), rgb(0x6a7076), stain * 0.9);
    base = mix(base, rgb(0x30343a), hole * 0.85);
    base = mix(base, rgb(0x7d848a), frame * 0.55);
    // Water has been through this ceiling more than once.
    base = mix(base, rgb(0x6b5a3a), Math.max(0, stain - 0.62) * 1.8);
    return shade(base, 0.84 + stain * 0.22);
  });

export const RUST_TILE = 2.0;

/** Steel that gave up: scaling, flaking, orange over black. */
export const rustedSteel = (): THREE.Texture =>
  colorTexture('abyss.rust', SIZE, (x, y, size) => {
    const scale = n2(x, y, size, 9, 7103, 5);
    const flake = ridge(n2(x, y, size, 14, 7211, 3), 0.06);
    const deep = Math.max(0, n2(x, y, size, 5, 7321, 3) - 0.58) * 2.4;
    let base = mix(rgb(0x6b3d1f), rgb(0xa2683a), scale * 0.95);
    base = mix(base, rgb(0xc08b4c), flake * 0.4);
    base = mix(base, rgb(0x33251c), Math.min(0.85, deep));
    return shade(base, 0.86 + scale * 0.26);
  });

export const HAZARD_TILE = 1.0;

/** Diagonal chevrons. Every station in the world marks a hazard the same way. */
export const hazardStripe = (): THREE.Texture =>
  colorTexture('abyss.hazard', 128, (x, y, size) => {
    const band = (((x + y) / 34) % 1 + 1) % 1;
    const wear = n2(x, y, size, 6, 8101, 4);
    const scuff = Math.max(0, n2(x, y, size, 18, 8209, 2) - 0.55) * 2.4;
    let base = band < 0.5 ? mix(rgb(0xb59227), rgb(0xd8b23c), wear) : mix(rgb(0x24242a), rgb(0x3a3a42), wear);
    base = mix(base, rgb(0x6d5a3c), Math.min(0.7, scuff));
    return shade(base, 0.86 + wear * 0.24);
  });

/* --- abyss: silt, rock, growth ---------------------------------------------------- */

export const SILT_TILE = 2.6;

function siltAt(x: number, y: number, size: number): { ripple: number; drift: number; shell: number } {
  // Sand ripples: a low-frequency band field, warped hard so the crests meander.
  // A lightly warped one is corduroy - the crests have to wander by more than
  // their own spacing before the eye stops reading them as a printed stripe.
  const warp = n2(x, y, size, 2.2, 9101, 3) * 40;
  const ripple = Math.abs((((y + warp) / 23) % 1) - 0.5) * 2;
  const drift = n2(x, y, size, 5, 9209, 4);
  const shell = Math.max(0, n2(x, y, size, 34, 9311, 2) - 0.66) * 3;
  return { ripple, drift, shell };
}

/** The seafloor: pale grey-green ooze, rippled, littered with shell hash. */
export const siltFloor = (): THREE.Texture =>
  colorTexture('abyss.silt', SIZE, (x, y, size) => {
    const { ripple, drift, shell } = siltAt(x, y, size);
    let base = mix(rgb(0x6c7268), rgb(0x99a08e), drift * 0.85 + (1 - ripple) * 0.35);
    base = mix(base, rgb(0x4e544e), Math.max(0, ripple - 0.6) * 1.6);
    base = mix(base, rgb(0xc3c6b4), Math.min(0.75, shell));
    // Organic dark matter settling in the troughs.
    base = mix(base, rgb(0x3f4741), Math.max(0, n2(x, y, size, 8, 9419, 3) - 0.62) * 1.8);
    return shade(base, 0.88 + drift * 0.22);
  });

export const siltNormal = (): THREE.Texture =>
  normalTexture('abyss.siltN', SIZE, (x, y, size) => 1 - siltAt(x, y, size).ripple * 0.8, 1.1);

export const BASALT_TILE = 3.0;

function basaltAt(x: number, y: number, size: number): { lobe: number; crack: number; glassy: number } {
  // Pillow basalt: rounded lobes with a chilled glass rind, cracked radially.
  const warpX = n2(x, y, size, 2.5, 10103, 2) * 30;
  const warpY = n2(x, y, size, 2.5, 10211, 2) * 30;
  const field = n2(x + warpX, y + warpY, size, 3, 10313, 3);
  return {
    lobe: field,
    crack: ridge(n2(x + warpX * 0.4, y + warpY * 0.4, size, 6, 10427, 3), 0.022),
    glassy: ridge(field, 0.09),
  };
}

/** Pillow basalt: the trench wall, black-blue, glassy where it chilled. */
export const basalt = (): THREE.Texture =>
  colorTexture('abyss.basalt', SIZE, (x, y, size) => {
    const { lobe, crack, glassy } = basaltAt(x, y, size);
    const dust = n2(x, y, size, 16, 10531, 3);
    let base = mix(rgb(0x3b444f), rgb(0x5b6672), lobe * 0.9);
    base = mix(base, rgb(0x272d36), crack * 0.9);
    base = mix(base, rgb(0x707c88), glassy * 0.4);
    // Manganese and settled silt lying on every up-facing surface.
    base = mix(base, rgb(0x7d8378), Math.max(0, dust - 0.62) * 1.4);
    return shade(base, 0.86 + lobe * 0.26);
  });

export const basaltNormal = (): THREE.Texture =>
  normalTexture(
    'abyss.basaltN',
    SIZE,
    (x, y, size) => {
      const { lobe, crack } = basaltAt(x, y, size);
      return lobe * 0.9 - crack * 0.7 + 0.3;
    },
    3.0,
  );

export const CRUST_TILE = 1.2;

function crustAt(x: number, y: number, size: number): { cone: number; tone: number; mat: number } {
  // Barnacles: a jittered lattice of little cones, each with a crater in it.
  const cell = 15;
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  let best = 9;
  let tone = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const jx = hash1((gx + dx) * 37 + (gy + dy) * 11, 128, 11003);
      const jy = hash1((gx + dx) * 59 + (gy + dy) * 5, 128, 11113);
      const d = Math.hypot(x - (gx + dx + jx) * cell, y - (gy + dy + jy) * cell) / cell;
      if (d < best) {
        best = d;
        tone = hash1((gx + dx) * 17 + (gy + dy) * 31, 64, 11213);
      }
    }
  }
  // Only two thirds of the lattice sites are actually occupied.
  const live = tone > 0.34;
  return { cone: live ? Math.max(0, 1 - best * 2.1) : 0, tone, mat: n2(x, y, size, 12, 11317, 3) };
}

/** Barnacle and serpulid crust: what grows on anything that stops moving. */
export const crust = (): THREE.Texture =>
  colorTexture('abyss.crust', SIZE, (x, y, size) => {
    const { cone, tone, mat } = crustAt(x, y, size);
    let base = mix(rgb(0x4a5250), rgb(0x66706b), mat * 0.9);
    base = mix(base, mix(rgb(0xa9a795), rgb(0xd4d2be), tone), cone * 0.92);
    // The crater in the top of each shell.
    base = mix(base, rgb(0x33373a), Math.max(0, cone - 0.78) * 3.2);
    // Rusty-orange sponge filling the gaps between them.
    base = mix(base, rgb(0x8c5a3c), Math.max(0, mat - 0.63) * 1.9 * (1 - cone));
    return shade(base, 0.86 + mat * 0.26);
  });

export const crustNormal = (): THREE.Texture =>
  normalTexture('abyss.crustN', SIZE, (x, y, size) => crustAt(x, y, size).cone, 3.0);

export const ALGAE_TILE = 1.9;

/** Biofilm: the slick black-green skin that grows on everything wet and lit. */
export const biofilm = (): THREE.Texture =>
  colorTexture('abyss.algae', SIZE, (x, y, size) => {
    const mat = n2(x, y, size, 6, 12101, 4);
    const strand = ridge(n2s(x, y, size, 5, 17, 12211, 3), 0.06);
    const bald = Math.max(0, n2(x, y, size, 9, 12317, 3) - 0.6) * 2.2;
    let base = mix(rgb(0x2e4038), rgb(0x4e6a4c), mat * 0.95);
    base = mix(base, rgb(0x6f8a58), strand * 0.5);
    base = mix(base, rgb(0x6a6e64), Math.min(0.7, bald));
    return shade(base, 0.84 + mat * 0.3);
  });

export const SALT_TILE = 1.5;

/**
 * Brine-pool crystal: the shelf of halite that grows round a hypersaline pool.
 * Bladed, translucent, and the only near-white surface in the pack - which is
 * exactly why the brine room reads as a different place.
 */
export const brineCrystal = (): THREE.Texture =>
  colorTexture('abyss.salt', SIZE, (x, y, size) => {
    const blade = ridge(n2(x, y, size, 7, 13001, 3), 0.07) + ridge(n2(x, y, size, 15, 13109, 2), 0.05) * 0.7;
    const body = n2(x, y, size, 5, 13217, 4);
    const stain = Math.max(0, n2(x, y, size, 11, 13327, 3) - 0.62) * 2;
    let base = mix(rgb(0x9aa5a6), rgb(0xd7dcd2), body * 0.95);
    base = mix(base, rgb(0xf0efe2), Math.min(1, blade * 0.85));
    base = mix(base, rgb(0x9c8a5e), Math.min(0.6, stain));
    return shade(base, 0.88 + body * 0.22);
  });

/* --- light and water -------------------------------------------------------------- */

export const CAUSTIC_TILE = 3.4;

/**
 * Caustics: the net of light a water surface throws on whatever is under it.
 * Used as an emissive map on floor patches beneath a tank, which is how a room
 * gets the single most recognisable "you are underwater" cue for free.
 *
 * Two ridged noise fields at different scales, multiplied - a single one gives
 * you worms, and the product is what gives you the interlocking net.
 */
export const caustics = (): THREE.Texture =>
  colorTexture('abyss.caustic', SIZE, (x, y, size) => {
    const a = ridge(n2(x, y, size, 4, 14003, 3), 0.085);
    const b = ridge(n2(x + 40, y - 25, size, 6.5, 14107, 3), 0.07);
    // Sharpened hard and topped out well below white: a caustic net is a thin
    // bright line on dark water, and a fat one reads as marbling on the floor.
    const net = Math.pow(Math.max(a, b * 0.8) * (0.4 + a * b * 2.4), 2.0);
    return shade(mix(rgb(0x061219), rgb(0x74cfe0), Math.min(1, net)), 0.9);
  });

/**
 * What is on the far side of a viewing pane: the open trench.
 *
 * Authored in 0..1 UV space, not tiled - it is a backdrop hung a metre behind
 * the glass, so it is a PICTURE of depth. A gradient that goes black downward, a
 * suspended snow of marine particulate lit from the room side, and the faintest
 * of far-off glows so the pane never reads as a painted black rectangle.
 */
export const abyssBackdrop = (): THREE.Texture =>
  colorTexture('abyss.backdrop', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    /**
     * v = 0 is the bottom of the pane, and the water gets blacker downward.
     *
     * The whole field is kept DARK. A pane is the brightest thing in a room by a
     * long way, and at the first pass's brightness every window came out as a
     * pale rectangle with nothing legible in it - the silhouettes only read if
     * the water behind them is nearly black.
     */
    const depth = Math.pow(1 - v, 1.2);
    const column = n2s(x, y, size, 3, 2, 15001, 3);
    let base = mix(rgb(0x0d2430), rgb(0x03070b), depth * 0.94 + column * 0.14);

    // Marine snow: hard little specks, denser near the glass (top of the frame).
    const flake = Math.max(0, n2(x, y, size, 46, 15107, 2) - 0.7) * 3.4;
    base = mix(base, rgb(0x8fa6ad), Math.min(0.6, flake * (0.3 + v * 0.8)));

    // A slow shear of brighter water, so the field is not a flat gradient.
    const shear = Math.max(0, n2(x, y, size, 2.5, 15213, 3) - 0.52) * 1.4;
    base = mix(base, rgb(0x17414f), shear * 0.4 * (1 - depth));

    // The distant lamp of something a long way off, low and to one side.
    const far = Math.max(0, 1 - Math.hypot((u - 0.72) * 2.4, (v - 0.32) * 2.4) * 3.4);
    base = mix(base, rgb(0x3fbfae), Math.pow(far, 2.4) * 0.45);
    return base;
  });

/**
 * The water inside a specimen tank. Same idea as the backdrop but far closer
 * and far greener: this is a volume you are looking a metre into, not a trench
 * you are looking a kilometre into.
 */
export const tankWater = (): THREE.Texture =>
  colorTexture('abyss.tankWater', SIZE, (x, y, size) => {
    const v = y / size;
    const swirl = n2(x, y, size, 4, 16001, 4);
    const mote = Math.max(0, n2(x, y, size, 40, 16111, 2) - 0.7) * 3.2;
    let base = mix(rgb(0x123a3c), rgb(0x1d5c58), swirl * 0.9 + v * 0.35);
    base = mix(base, rgb(0x8fd6c4), Math.min(0.6, mote));
    // Sediment settled at the bottom of the glass.
    base = mix(base, rgb(0x2a3428), Math.max(0, 0.18 - v) * 3.5);
    return shade(base, 0.88 + swirl * 0.24);
  });

/* --- screens ---------------------------------------------------------------------- */

/**
 * A sonar repeater, authored in 0..1 UV: range rings, a bearing grid, a swept
 * sector still glowing where the beam last passed, and three returns on it. One
 * of them is very close, which is the whole reason this screen is in the map.
 */
export const sonarScreen = (): THREE.Texture =>
  colorTexture('abyss.sonar', SIZE, (x, y, size) => {
    const u = (x / size - 0.5) * 2;
    const v = (y / size - 0.5) * 2;
    const r = Math.hypot(u, v);
    const a = Math.atan2(v, u);
    const bg = rgb(0x04140f);
    if (r > 0.96) return shade(bg, 0.5);

    let base: RGB = mix(bg, rgb(0x0a2a1e), Math.max(0, 1 - r) * 0.8);

    // The sweep: a wedge fading behind the beam head.
    const head = 1.05;
    let behind = head - a;
    if (behind < 0) behind += Math.PI * 2;
    const sweep = Math.max(0, 1 - behind / 2.2);
    base = mix(base, rgb(0x2fbf6a), Math.pow(sweep, 2.4) * 0.55);

    // Range rings and bearing spokes.
    const ring = Math.min(1, Math.max(0, 1 - Math.abs(((r * 4) % 1) - 0.5) * 14));
    const spoke = Math.max(0, 1 - Math.abs((((a / Math.PI) * 6) % 1) - 0.5) * 22);
    base = mix(base, rgb(0x3ce08a), ring * 0.4 + spoke * 0.25);

    // Contacts. The one at 0.2 is inside the station.
    for (const [cr, ca, size2] of [
      [0.72, 2.4, 0.05],
      [0.48, -1.1, 0.035],
      [0.2, 0.35, 0.075],
    ] as const) {
      const d = Math.hypot(u - Math.cos(ca) * cr, v - Math.sin(ca) * cr);
      base = mix(base, rgb(0xc8ffd8), Math.max(0, 1 - d / size2) * 0.95);
    }

    // Scanlines, because a CRT without them is a poster.
    return shade(base, y % 3 < 1 ? 0.72 : 1);
  });

/**
 * A generic instrument readout: a header bar, a bar-graph column, a trace and
 * rows of text-sized ticks. Never legible, and it must not be - art has no
 * access to `t()`, so a screen with real words on it would be a screen in the
 * wrong language for most of the people who see it.
 */
export const readoutScreen = (): THREE.Texture =>
  colorTexture('abyss.readout', 128, (x, y, size) => {
    const u = x / size;
    const v = 1 - y / size;
    const bg = mix(rgb(0x06131c), rgb(0x0b2130), n2(x, y, size, 6, 17003, 2) * 0.7);
    let base: RGB = bg;

    if (v < 0.1) base = mix(rgb(0x1d5f7a), rgb(0x2b7f9c), u); // header bar
    else if (v < 0.44) {
      // A waveform trace across the middle band.
      const trace = 0.27 + Math.sin(u * 19) * 0.05 + n2s(x, 0, size, 9, 1, 17109, 3) * 0.09;
      if (Math.abs(v - trace) < 0.014) base = rgb(0x4fe0b0);
      if (Math.abs(v - 0.12) < 0.004 || Math.abs(v - 0.42) < 0.004) base = mix(base, rgb(0x24505e), 0.9);
    } else if (v < 0.94) {
      // Rows of ticks that read as data at a glance and as nothing up close.
      const row = Math.floor((v - 0.44) * 16);
      const len = 0.14 + hash1(row * 13, 32, 17211) * 0.6;
      if (u > 0.08 && u < 0.08 + len && ((v - 0.44) * 16) % 1 < 0.45) {
        base = mix(rgb(0x2e7f8f), rgb(0x63c8cf), hash1(row * 29, 32, 17317));
      }
      // A right-hand column of bars.
      const bar = hash1(row * 7, 32, 17419);
      if (u > 0.74 && u < 0.74 + bar * 0.2 && ((v - 0.44) * 16) % 1 < 0.6) base = rgb(0xd8a24c);
    }
    return shade(base, y % 3 < 1 ? 0.75 : 1);
  });

/* --- 0..1 skins for shared art ----------------------------------------------------- */

/**
 * The door leaf, authored to FILL a 0..1 UV rather than to tile.
 *
 * Shared art is not batched through `merge.ts`, so a door carries a box's own
 * UVs - one repeat over the whole leaf - and a tiling hull map on that comes out
 * as one smeared patch (docs/art/SHARED_ART.md §3.1). This one is composed *as a
 * door*: a pressure hatch with a raised centre boss, six dogging lugs round it,
 * a hazard band across the bottom and a stencilled compartment number.
 */
export const hatchPlate = (): THREE.Texture =>
  colorTexture('abyss.hatchPlate', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const du = (u - 0.5) * 1.35;
    const dv = v - 0.56;
    const r = Math.hypot(du, dv);
    const a = Math.atan2(dv, du);
    const grain = n2(x, y, size, 12, 18001, 4);

    let base = mix(rgb(0x5a6668), rgb(0x76837f), grain * 0.85);

    // Hazard band along the bottom, where a hatch always has one.
    if (v < 0.13) {
      const band = ((u * 7 + v * 3) % 1 + 1) % 1;
      base = band < 0.5 ? rgb(0xb08f2c) : rgb(0x2a2a30);
      base = mix(base, rgb(0x6a5636), Math.max(0, n2(x, y, size, 14, 18109, 2) - 0.5) * 1.6);
    } else {
      // The boss: a raised disc with a bevel, and the dogging lugs round it.
      if (r < 0.3) base = mix(base, rgb(0x8b9791), 0.35);
      if (Math.abs(r - 0.3) < 0.022) base = mix(base, rgb(0x353d40), 0.85);
      if (Math.abs(r - 0.26) < 0.012) base = mix(base, rgb(0x9fa9a2), 0.7);
      for (let i = 0; i < 6; i++) {
        const la = (i / 6) * Math.PI * 2 + 0.5;
        const d = Math.hypot(du - Math.cos(la) * 0.38, dv - Math.sin(la) * 0.38);
        if (d < 0.05) base = mix(base, rgb(0x424b4c), 0.8);
        if (d < 0.028) base = mix(base, rgb(0x99a49c), 0.75);
      }
      // The spindle in the middle of the boss.
      if (r < 0.055) base = mix(base, rgb(0x2f3639), 0.9);

      // A stencilled block, top left. Bars, not letters: see readoutScreen.
      const sx = (u - 0.13) * 9;
      const sy = (v - 0.83) * 26;
      if (sx > 0 && sx < 3 && sy > 0 && sy < 1 && hash1(Math.floor(sx * 5), 32, 18211) > 0.35) {
        base = mix(base, rgb(0xc9cfc4), 0.75);
      }
    }

    // A raised border where the leaf meets the frame, and rust weeping from it.
    const edge = Math.min(u, 1 - u, v, 1 - v);
    if (edge < 0.045) base = mix(base, rgb(0x333b3d), (0.045 - edge) * 16);
    else if (edge < 0.075) base = mix(base, rgb(0x8e9a94), 0.3);
    base = mix(base, rgb(0x7a4a24), Math.min(0.55, weep(x, y, size, 18317, 0.85)));

    return shade(base, (0.9 + grain * 0.18) * grime(x, y, size, 18421, 0.3));
  });

/**
 * The specimen case a chest is made from, in 0..1 UV for the same reason: a
 * ribbed transit case with two throw latches, a corner bumper and a label card.
 */
export const caseSkin = (): THREE.Texture =>
  colorTexture('abyss.caseSkin', 128, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const grain = n2(x, y, size, 14, 19001, 3);
    // Ribs running across the case.
    const rib = Math.abs(((u * 9) % 1) - 0.5) * 2;
    let base = mix(rgb(0x3f4a52), rgb(0x59666d), grain * 0.8 + (1 - rib) * 0.3);
    // Latches, left and right of centre.
    for (const lu of [0.22, 0.78]) {
      if (Math.abs(u - lu) < 0.075 && v > 0.34 && v < 0.62) base = mix(base, rgb(0x9aa39c), 0.75);
      if (Math.abs(u - lu) < 0.045 && v > 0.4 && v < 0.56) base = mix(base, rgb(0x2f3438), 0.7);
    }
    // A label card, off to one side and peeling.
    if (u > 0.4 && u < 0.62 && v > 0.62 && v < 0.85) {
      base = mix(rgb(0xc9c6b0), rgb(0xa39d86), n2(x, y, size, 20, 19109, 2));
      const line = Math.floor((v - 0.62) * 14);
      if (((v - 0.62) * 14) % 1 < 0.4 && u < 0.42 + hash1(line, 16, 19211) * 0.16) base = rgb(0x3c3a34);
    }
    const edge = Math.min(u, 1 - u, v, 1 - v);
    if (edge < 0.05) base = mix(base, rgb(0x23282c), (0.05 - edge) * 14);
    return shade(base, (0.9 + grain * 0.2) * grime(x, y, size, 19317, 0.3));
  });

/**
 * A crew locker door: louvred vents top and bottom, a hasp, a number plate and
 * somebody's sticker. 0..1 UV, same reason as the other two.
 */
export const lockerSkin = (): THREE.Texture =>
  colorTexture('abyss.lockerSkin', 128, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const grain = n2(x, y, size, 11, 20011, 3);
    let base = mix(rgb(0x5c6a63), rgb(0x77857b), grain * 0.85);

    // Two louvre stacks, top and bottom.
    const louvre = (v > 0.66 && v < 0.92) || (v > 0.08 && v < 0.24);
    if (louvre) {
      const slat = ((v * 34) % 1 + 1) % 1;
      if (u > 0.16 && u < 0.84) {
        base = mix(base, rgb(0x1d2225), Math.max(0, 1 - Math.abs(slat - 0.25) * 5) * 0.9);
        base = mix(base, rgb(0x93a096), Math.max(0, 1 - Math.abs(slat - 0.62) * 6) * 0.5);
      }
    }
    // Hasp and handle down the right-hand edge.
    if (u > 0.86 && v > 0.42 && v < 0.56) base = mix(base, rgb(0x9ba49b), 0.8);
    // Number plate.
    if (u > 0.4 && u < 0.6 && v > 0.5 && v < 0.6) {
      base = rgb(0x2b3134);
      const d = Math.floor((u - 0.4) * 6);
      if (((u - 0.4) * 6) % 1 < 0.6 && hash1(d, 16, 20113) > 0.3 && v > 0.52 && v < 0.58) base = rgb(0xd2d8cc);
    }
    const edge = Math.min(u, 1 - u, v, 1 - v);
    if (edge < 0.04) base = mix(base, rgb(0x2c3336), (0.04 - edge) * 18);
    base = mix(base, rgb(0x7a4a24), Math.min(0.5, weep(x, y, size, 20217, 0.8)));
    return shade(base, (0.9 + grain * 0.18) * grime(x, y, size, 20321, 0.3));
  });
