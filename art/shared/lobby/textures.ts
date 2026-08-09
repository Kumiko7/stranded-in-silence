/**
 * The lobby cabin's surfaces, generated as procedural pixel data.
 *
 * Same three rules as every other texture module (see `art/lib/textures.ts`): no
 * canvas, no `Math.random()`, cached at module scope. The cabin is not part of a
 * map pack, so it carries its own recipes rather than borrowing a pack's.
 *
 * This is the one place in the game that is meant to feel *good*: warm pine,
 * daylight off snow, a fire. Albedos are correspondingly bright - the manor's
 * "mid-tones only" rule still applies, but the mid-tone is a lot higher up here.
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

/* --- timber ------------------------------------------------------------------- */

export const LOG_TILE = 1.9;
const LOG_COURSE = 64;

/** Height of one stacked log course: round in the middle, dark chink at the seam. */
function logProfile(y: number): { across: number; seam: number } {
  const across = (y % LOG_COURSE) / LOG_COURSE;
  // Two chinking lines per course - one at each shoulder of the round face.
  const seam = Math.min(across, 1 - across) < 0.09 ? 0 : 1;
  return { across, seam };
}

/**
 * Stacked pine logs, planed flat inside. The dominant surface of the cabin, so
 * it carries the strongest grain in the room and everything else stays quieter.
 */
export const pineLog = (): THREE.Texture =>
  colorTexture('lobby.pineLog', SIZE, (x, y, size) => {
    const { across, seam } = logProfile(y);
    const course = Math.floor(y / LOG_COURSE);
    const tone = hash1(course, 16, 5501);

    // Grain runs along the log, so the noise is stretched hard on x.
    const grain = n2s(x, y, size, 3, 40, 617 + course * 7, 4);
    const knot = n2(x + course * 91, y, size, 7, 883, 3);

    const base = mix(rgb(0xb08a5c), rgb(0xd8b183), tone * 0.55 + grain * 0.45);
    // Round face: the shoulders fall into shadow, the middle catches the light.
    const round = 0.78 + Math.sin(across * Math.PI) * 0.3;
    const knotted = knot > 0.68 ? shade(base, 0.62) : base;
    return shade(knotted, round * seam * (0.9 + grain * 0.2));
  });

export const pineLogNormal = (): THREE.Texture =>
  normalTexture(
    'lobby.pineLogN',
    SIZE,
    (x, y, size) => {
      const { across, seam } = logProfile(y);
      if (!seam) return 0;
      return Math.sin(across * Math.PI) * 0.8 + n2s(x, y, size, 3, 40, 617, 3) * 0.2;
    },
    2.4,
  );

export const PLANK_TILE = 2.2;
const PLANK_ROW = 40;

/** Wide pine floorboards, waxed and walked on. */
export const plankFloor = (): THREE.Texture =>
  colorTexture('lobby.plankFloor', SIZE, (x, y, size) => {
    const row = Math.floor(y / PLANK_ROW);
    const inRow = y % PLANK_ROW;
    // Boards are staggered, so the butt joints never line up across the floor.
    const shift = hash1(row, 8, 4409) * SIZE;
    const along = (x + shift) % SIZE;
    const joint = along % 128 < 1.5 ? 0.55 : 1;
    const edge = inRow < 1.5 || inRow > PLANK_ROW - 1.5 ? 0.62 : 1;

    const tone = hash1(row * 13 + Math.floor(along / 128), 32, 991);
    const grain = n2s(along, inRow * 6, size, 4, 30, 233 + row, 4);
    const base = mix(rgb(0xa8845a), rgb(0xd0ac7c), tone * 0.5 + grain * 0.5);
    return shade(base, joint * edge * (0.88 + grain * 0.22));
  });

export const plankFloorNormal = (): THREE.Texture =>
  normalTexture(
    'lobby.plankFloorN',
    SIZE,
    (x, y) => {
      const row = Math.floor(y / PLANK_ROW);
      const inRow = y % PLANK_ROW;
      return inRow < 1.5 || inRow > PLANK_ROW - 1.5 ? 0 : 0.7 + hash1(row, 8, 77) * 0.3;
    },
    1.4,
  );

export const BOARD_TILE = 1.4;

/** Vertical tongue-and-groove: the gable ends and the ceiling between rafters. */
export const boardCeiling = (): THREE.Texture =>
  colorTexture('lobby.boardCeiling', SIZE, (x, y, size) => {
    const board = Math.floor(x / 26);
    const inBoard = x % 26;
    const tone = hash1(board, 16, 1279);
    const grain = n2s(x * 6, y, size, 30, 4, 401 + board, 3);
    const groove = inBoard < 1.5 ? 0.6 : 1;
    const base = mix(rgb(0xc0a077), rgb(0xdcc09a), tone * 0.5 + grain * 0.4);
    return shade(base, groove * (0.9 + grain * 0.18));
  });

/* --- stone -------------------------------------------------------------------- */

export const STONE_TILE = 2.6;

/** Per-pixel fieldstone decomposition, shared by the colour and height passes. */
function fieldstoneAt(x: number, y: number, size: number): { tone: number; mortar: number } {
  // Wobble the lattice with noise so the "stones" are lumpy rather than bricks.
  const wx = x + n2(x, y, size, 6, 1601, 2) * 26 - 13;
  const wy = y + n2(x, y, size, 6, 2711, 2) * 22 - 11;

  const row = Math.floor(wy / 46);
  const offset = (row % 2) * 28;
  const col = Math.floor((wx + offset) / 58);

  const cx = ((wx + offset) % 58) / 58;
  const cy = (wy % 46) / 46;
  const edge = Math.min(cx, 1 - cx, cy, 1 - cy);

  return { tone: hash1(row * 31 + col, 64, 7717), mortar: edge < 0.07 ? 0 : 1 };
}

/** The chimney breast and hearth: cold grey river stone against all that pine. */
export const fieldstone = (): THREE.Texture =>
  colorTexture('lobby.fieldstone', SIZE, (x, y, size) => {
    const { tone, mortar } = fieldstoneAt(x, y, size);
    const speckle = n2(x, y, size, 26, 3313, 3);
    const base = mix(rgb(0x7b7d80), rgb(0xa9a49c), tone);
    const tinted: RGB = mortar ? base : rgb(0xb6b0a3);
    return shade(tinted, 0.84 + speckle * 0.32);
  });

export const fieldstoneNormal = (): THREE.Texture =>
  normalTexture(
    'lobby.fieldstoneN',
    SIZE,
    (x, y, size) => {
      const { tone, mortar } = fieldstoneAt(x, y, size);
      return mortar ? 0.55 + tone * 0.45 : 0.05;
    },
    3.2,
  );

/* --- soft furnishing ----------------------------------------------------------- */

export const WOOL_TILE = 1.6;

/** The hearth rug: a coarse cream weave with a red border stripe in the pattern. */
export const wool = (): THREE.Texture =>
  colorTexture('lobby.wool', SIZE, (x, y, size) => {
    const weave = ((Math.floor(x / 3) + Math.floor(y / 3)) % 2) * 0.06;
    const fibre = n2(x, y, size, 40, 5087, 3);
    // A band across the middle of the tile reads as a woven stripe on the rug.
    const band = y % 128 > 104 && y % 128 < 120;
    const base = band ? rgb(0x9c4a3c) : mix(rgb(0xd6c8ad), rgb(0xefe4cd), fibre);
    return shade(base, 0.9 + weave + fibre * 0.16);
  });

export const woolRoughness = (): THREE.Texture =>
  dataTexture('lobby.woolRough', 128, (x, y, size) => 0.86 + n2(x, y, size, 20, 4001) * 0.14);

export const HIDE_TILE = 2.0;

/** Tanned hide for the armchairs and the wardrobe's leather straps. */
export const hide = (): THREE.Texture =>
  colorTexture('lobby.hide', SIZE, (x, y, size) => {
    const crease = n2(x, y, size, 14, 6151, 4);
    const pore = n2(x, y, size, 60, 6421, 2);
    return shade(mix(rgb(0x8a5a3a), rgb(0xb07d54), crease), 0.86 + pore * 0.26);
  });

/* --- outside ------------------------------------------------------------------- */

export const SNOW_TILE = 8.0;

/** Snowfield. Bright, but not blown out - the drifts have to read as shapes. */
export const snow = (): THREE.Texture =>
  colorTexture('lobby.snow', SIZE, (x, y, size) => {
    const drift = n2(x, y, size, 4, 8081, 4);
    const sparkle = n2(x, y, size, 90, 8291, 2);
    return shade(mix(rgb(0xd5e0ee), rgb(0xf4f8ff), drift), 0.92 + sparkle * 0.14);
  });

/**
 * The sky, as a vertical gradient with a haze band on the horizon. Painted onto
 * the inside of a backdrop cylinder, so `y` runs bottom to top.
 */
export const sky = (): THREE.Texture =>
  colorTexture('lobby.sky', 64, (_x, y, size) => {
    const t = y / (size - 1);
    const horizon = mix(rgb(0xfdf3e2), rgb(0xc6dcf3), Math.min(1, t * 2.2));
    return mix(horizon, rgb(0x74a5da), Math.max(0, t - 0.45) * 1.7);
  });

/**
 * Distant rock face for the mountains. Deliberately low-contrast: they sit far
 * enough back that detail would only fight the fog.
 */
/**
 * Distant rock. Deliberately low-contrast - the peaks sit far enough back that
 * detail would only fight the fog.
 *
 * There is no snow line baked in here: the snow is a second, smaller cone
 * capping each peak (`cabin.ts`). A line in the texture would have to land at a
 * particular world height to look right, and world-space UVs make that a
 * different height on every mountain.
 */
export const rockFace = (): THREE.Texture =>
  colorTexture('lobby.rockFace', 128, (x, y, size) => {
    const strata = n2s(x, y, size, 5, 14, 9001, 4);
    const gully = n2s(x, y, size, 14, 4, 9311, 3);
    return shade(mix(rgb(0x6b7484), rgb(0xb2b9c5), strata * 0.65 + gully * 0.35), 0.88 + strata * 0.24);
  });

export const DUST_TILE = 1.4;

/** Plain linen weave for the dust sheet over the minigame wall. */
export const dustSheet = (): THREE.Texture =>
  colorTexture('lobby.dustSheet', 128, (x, y, size) => {
    const weave = ((Math.floor(x / 2) + Math.floor(y / 2)) % 2) * 0.05;
    const slub = n2s(x, y, size, 26, 8, 4517, 3);
    const stain = n2(x, y, size, 6, 4703, 3);
    const base = mix(rgb(0xcfc4ab), rgb(0xe8dfc9), slub);
    return shade(base, 0.9 + weave + slub * 0.12 - Math.max(0, stain - 0.62) * 0.35);
  });

export const PINE_TILE = 2.4;

/**
 * Conifer foliage: sprays of needles with dark gaps between them.
 *
 * The treeline used to be flat-shaded green cones, which read as paper cutouts
 * the moment you stood at the window and looked at them. What sells a fir at
 * fifteen metres is the broken, clumpy edge of the needles, and that is a
 * texture job - the geometry is already as many cones as it can afford.
 */
export const pineFoliage = (): THREE.Texture =>
  colorTexture('lobby.pineFoliage', 128, (x, y, size) => {
    // Needle sprays hang down and out, so the noise is stretched along y.
    const spray = n2s(x, y, size, 9, 26, 7331, 4);
    const clump = n2(x, y, size, 5, 7561, 3);
    // The gaps are where you would see through to the branch behind.
    const gap = spray < 0.36 ? 0.58 : 1;
    return shade(mix(rgb(0x2c4535), rgb(0x5b8158), clump * 0.55 + spray * 0.45), gap * (0.86 + spray * 0.3));
  });

/** Fissured conifer bark for the trunks, which now show under the skirts. */
export const pineBark = (): THREE.Texture =>
  colorTexture('lobby.pineBark', 128, (x, y, size) => {
    const fissure = n2s(x, y, size, 7, 22, 7907, 4);
    const plate = n2s(x, y, size, 13, 6, 8123, 3);
    return shade(mix(rgb(0x3c2d23), rgb(0x7a624a), plate * 0.6 + fissure * 0.4), 0.78 + fissure * 0.44);
  });

/** The cap on a peak, and the snowfields the foothills are made of. */
export const snowCap = (): THREE.Texture =>
  colorTexture('lobby.snowCap', 128, (x, y, size) => {
    const strata = n2s(x, y, size, 6, 16, 9601, 4);
    const shadow = n2s(x, y, size, 12, 5, 9767, 3);
    return shade(mix(rgb(0xd3ddec), rgb(0xffffff), strata * 0.7 + shadow * 0.3), 0.92 + strata * 0.18);
  });

/* --- posters ------------------------------------------------------------------- */

export const POSTER_TILE = 1.0;

/** Foxed paper. Every poster sits on this, printed or blank. */
function paperAt(x: number, y: number, size: number): RGB {
  const fibre = n2(x, y, size, 50, 2207, 3);
  const foxing = n2(x, y, size, 7, 2609, 3);
  const aged = mix(rgb(0xf2ece0), rgb(0xdfd4bf), Math.max(0, foxing - 0.55) * 1.6);
  return shade(aged, 0.94 + fibre * 0.12);
}

/** A slot on the wall with nothing pinned in it yet. */
export const posterBlank = (): THREE.Texture =>
  colorTexture('lobby.posterBlank', 128, (x, y, size) => paperAt(x, y, size));

/**
 * Ravenhollow Manor's poster: the house on its hill under a bruised sky, in the
 * flat two-colour style of a travel print that has aged badly.
 *
 * `y` runs 0 at the BOTTOM of the poster, because that is how the UV lands on a
 * wall-mounted plane.
 */
export const posterMansion = (): THREE.Texture =>
  colorTexture('lobby.posterMansion', 256, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const paper = paperAt(x, y, size);

    // Margin: the print does not run to the paper edge.
    if (u < 0.08 || u > 0.92 || v < 0.2 || v > 0.94) return paper;

    const sky = mix(rgb(0x3a3348), rgb(0x8f6f6a), Math.max(0, (v - 0.5) * 1.8));

    // The hill the manor stands on.
    const hill = 0.3 + n2s(x, 0, size, 4, 1, 3701, 2) * 0.06;
    if (v < hill) return rgb(0x241f2c);

    // The house: a central block with two wings and a tower on the left.
    const houseTop = 0.52 + (Math.abs(u - 0.5) < 0.12 ? 0.06 : 0);
    const tower = Math.abs(u - 0.28) < 0.045 && v < 0.66;
    const body = Math.abs(u - 0.5) < 0.26 && v < houseTop;
    if (tower || body) {
      // Lit windows, in a grid, most of them dark.
      const wx = Math.floor((u - 0.24) * 26);
      const wy = Math.floor((v - hill) * 22);
      const lit = hash1(wx * 7 + wy * 13, 64, 6607) > 0.78;
      const inWindow = ((u - 0.24) * 26) % 1 < 0.45 && ((v - hill) * 22) % 1 < 0.5;
      if (inWindow && v > hill + 0.02) return lit ? rgb(0xd8a54e) : rgb(0x1b1720);
      return rgb(0x2a2431);
    }

    return sky;
  });

/**
 * The Leviathan's poster: the view from inside the mouth, looking out.
 *
 * A ribbed throat framing a bright aperture, teeth all round it, and a figure
 * standing in the light with its back to you. Same flat two-colour print style
 * as the manor's, so the wall reads as one series.
 */
export const posterViscera = (): THREE.Texture =>
  colorTexture('lobby.posterViscera', 256, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const paper = paperAt(x, y, size);
    if (u < 0.08 || u > 0.92 || v < 0.2 || v > 0.94) return paper;

    // Distance from the aperture, squashed into a tall oval.
    const du = (u - 0.5) / 0.3;
    const dv = (v - 0.56) / 0.34;
    const r = Math.hypot(du, dv) + n2(x, y, size, 7, 8101, 3) * 0.08 - 0.04;
    const a = Math.atan2(dv, du);

    // The figure: a small silhouette standing in the light, facing away.
    const fx = Math.abs(u - 0.5);
    if (v > 0.3 && v < 0.47 && fx < 0.026 + (0.47 - v) * 0.12) return rgb(0x241a1e);

    if (r < 0.72) {
      // The way out. Sickly, and the only bright thing on the print.
      return mix(rgb(0xc8d08a), rgb(0x8fae74), Math.pow(r / 0.72, 2) * 0.9);
    }

    // Teeth around the rim, alternating long and short.
    const tooth = 0.74 + (Math.abs(((a / Math.PI) * 9) % 1 - 0.5) * 2) * 0.16;
    if (r < tooth) return mix(rgb(0xcfc7ae), rgb(0x8d8570), (r - 0.72) * 4);

    // The throat: ribs closing in, darker the further out you look.
    const rib = Math.abs(((r * 5.5) % 1) - 0.5) * 2;
    const depth = Math.min(1, (r - 0.74) * 0.9);
    const base = mix(rgb(0x5e2630), rgb(0x1d1116), depth);
    return shade(base, 0.82 + rib * 0.4);
  });

/**
 * The random-map poster: a question mark on a sunburst, in the same flat print
 * style as the rest of the wall so it reads as one more expedition rather than
 * as a UI element that wandered into the room.
 */
export const posterRandom = (): THREE.Texture =>
  colorTexture('lobby.posterRandom', 256, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const paper = paperAt(x, y, size);
    if (u < 0.08 || u > 0.92 || v < 0.2 || v > 0.94) return paper;

    const du = u - 0.5;
    const dv = v - 0.58;

    /* --- the mark ----------------------------------------------------------- */

    // Hook: a ring segment, open at the bottom left, with the stem hanging off
    // its right-hand end and the dot under that.
    const hookR = Math.hypot(du, dv - 0.1);
    const hookA = Math.atan2(du, dv - 0.1);
    const onHook = Math.abs(hookR - 0.15) < 0.045 && hookA > -2.1;
    const onStem = Math.abs(du) < 0.045 && v > 0.5 && v < 0.6;
    const onDot = Math.hypot(du, v - 0.42) < 0.05;
    if (onHook || onStem || onDot) return rgb(0xe8dcc4);

    /* --- the field ---------------------------------------------------------- */

    const a = Math.atan2(dv, du);
    const ray = Math.abs((((a / Math.PI) * 8) % 1) - 0.5) * 2;
    const depth = Math.min(1, Math.hypot(du, dv) * 2.2);
    return shade(mix(rgb(0x3a3b57), rgb(0x1d1e2c), depth), 0.86 + ray * 0.28);
  });

/** The test map's poster: a flat plan-view grid, because that is what it is. */
export const posterTest = (): THREE.Texture =>
  colorTexture('lobby.posterTest', 128, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const paper = paperAt(x, y, size);
    if (u < 0.1 || u > 0.9 || v < 0.22 || v > 0.92) return paper;

    const grid = (u * 8) % 1 < 0.08 || (v * 8) % 1 < 0.08;
    return grid ? rgb(0x5c6472) : shade(paper, 0.94);
  });

/* --- the dart annex -------------------------------------------------------------- */

/**
 * The sisal. Ring radii are the real ones, as fractions of the board's outer
 * radius, so `src/entities/dart.ts` and this picture agree about where a treble
 * is by construction - both read `config/darts.json`, and these are the same
 * numbers written where a texture can use them.
 */
const BULL_INNER = 0.0282;
const BULL_OUTER = 0.0705;
const TREBLE_INNER = 0.439;
const TREBLE_OUTER = 0.4745;
const DOUBLE_INNER = 0.7184;
const DOUBLE_OUTER = 0.7539;

/** Clockwise from the top. The 20 is black-bedded, and every other one after it. */
export const DART_SECTORS: readonly number[] = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
];

/** A 3x5 bitmap per digit, top row first. Enough to letter the number ring. */
const GLYPHS: readonly (readonly number[])[] = [
  [0b111, 0b101, 0b101, 0b101, 0b111],
  [0b010, 0b110, 0b010, 0b010, 0b111],
  [0b111, 0b001, 0b111, 0b100, 0b111],
  [0b111, 0b001, 0b111, 0b001, 0b111],
  [0b101, 0b101, 0b111, 0b001, 0b001],
  [0b111, 0b100, 0b111, 0b001, 0b111],
  [0b111, 0b100, 0b111, 0b101, 0b111],
  [0b111, 0b001, 0b001, 0b001, 0b001],
  [0b111, 0b101, 0b111, 0b101, 0b111],
  [0b111, 0b101, 0b111, 0b001, 0b111],
];

/** Whether `(col, row)` of `digit`'s 3x5 glyph is on. Row 0 is the TOP row. */
function glyphOn(digit: number, col: number, row: number): boolean {
  const bits = GLYPHS[digit]?.[row];
  if (bits === undefined || col < 0 || col > 2) return false;
  return (bits & (1 << (2 - col))) !== 0;
}

/**
 * The board itself: twenty beds, the two scoring rings, the bull, and the
 * numbers painted round the wire.
 *
 * The numbers are the reason this is 512 rather than 256. They are three pixels
 * wide at the source resolution and all but illegible from the throwing line -
 * which is exactly right. What they do is make the ring read as *lettered*, and
 * a dartboard without that reads as a target.
 */
export const dartboard = (): THREE.Texture =>
  colorTexture('lobby.dartboard', 512, (x, y, size) => {
    const u = (x / (size - 1)) * 2 - 1;
    const v = (y / (size - 1)) * 2 - 1;
    const r = Math.hypot(u, v);
    if (r > 1) return rgb(0x171412);

    // Angle clockwise from straight up, which is the middle of the 20 bed.
    // `local` is the offset within that bed, which is what both the wire between
    // beds and the number ring are measured from.
    const angle = Math.atan2(u, v);
    const step = (Math.PI * 2) / 20;
    const nearest = Math.round(angle / step);
    const index = ((nearest % 20) + 20) % 20;
    const local = angle - nearest * step;
    const number = DART_SECTORS[index] ?? 20;
    // The 20 is black-bedded and they alternate from there.
    const dark = index % 2 === 0;

    const grain = n2(x, y, size, 60, 4241, 3) * 0.5 + n2(x, y, size, 12, 4643, 3) * 0.5;
    const wire = Math.abs(local) > step / 2 - 0.006 && r > BULL_OUTER;

    if (r < BULL_INNER) return shade(rgb(0xb4302a), 0.9 + grain * 0.2);
    if (r < BULL_OUTER) return shade(rgb(0x2f7a46), 0.9 + grain * 0.2);

    if (r < DOUBLE_OUTER) {
      const scoring = (r > TREBLE_INNER && r < TREBLE_OUTER) || r > DOUBLE_INNER;
      const bed = scoring
        ? dark
          ? rgb(0xb4302a)
          : rgb(0x2f7a46)
        : dark
          ? rgb(0x241f1c)
          : rgb(0xd8c9a4);
      // The spider: bright wire between every bed and around every ring.
      const ringWire =
        Math.abs(r - TREBLE_INNER) < 0.006 ||
        Math.abs(r - TREBLE_OUTER) < 0.006 ||
        Math.abs(r - DOUBLE_INNER) < 0.006 ||
        Math.abs(r - DOUBLE_OUTER) < 0.006 ||
        Math.abs(r - BULL_OUTER) < 0.006;
      if (wire || ringWire) return rgb(0xa9a49a);
      return shade(bed, 0.88 + grain * 0.24);
    }

    /* --- the number ring ---------------------------------------------------- */

    const black = shade(rgb(0x131110), 0.85 + grain * 0.3);
    if (r < 0.79 || r > 0.95) return black;

    // Into the bed's own frame: `across` runs tangentially, `along` radially.
    const across = r * Math.sin(local);
    const along = r * Math.cos(local);

    const text = String(number);
    const cell = 0.032;
    const width = text.length * cell;
    const col = Math.floor((across + width / 2) / cell);
    if (col < 0 || col >= text.length) return black;

    const inCell = (across + width / 2) / cell - col;
    const gx = Math.floor(inCell * 4);
    const gy = Math.floor(((0.945 - along) / 0.115) * 5);
    if (gx > 2 || gy < 0 || gy > 4) return black;

    const digit = Number(text[col]);
    return glyphOn(digit, gx, gy) ? rgb(0xf0e8d6) : black;
  });

/** Brushed dark slate for the scoreboard's carcass. */
export const scoreSlate = (): THREE.Texture =>
  colorTexture('lobby.scoreSlate', 128, (x, y, size) => {
    const brush = n2s(x, y, size, 40, 4, 5209, 3);
    return shade(mix(rgb(0x171a21), rgb(0x272c36), brush), 0.9 + brush * 0.2);
  });

/**
 * One seven-segment glyph. `value` is 0..9, or -1 for a digit that is not lit -
 * which still shows its segments, faintly, the way a real display does.
 */
const SEGMENTS: readonly (readonly [number, number, number, number])[] = [
  [0.22, 0.86, 0.78, 0.96], // A, top
  [0.78, 0.54, 0.9, 0.86], // B, upper right
  [0.78, 0.16, 0.9, 0.48], // C, lower right
  [0.22, 0.06, 0.78, 0.16], // D, bottom
  [0.1, 0.16, 0.22, 0.48], // E, lower left
  [0.1, 0.54, 0.22, 0.86], // F, upper left
  [0.22, 0.46, 0.78, 0.56], // G, middle
];

/** Which segments each digit lights, as a bitmask over `SEGMENTS`. */
const DIGIT_SEGMENTS: readonly number[] = [
  0b0111111, 0b0000110, 0b1011011, 0b1001111, 0b1100110, 0b1101101, 0b1111101, 0b0000111, 0b1111111, 0b1101111,
];

export const segmentDigit = (value: number): THREE.Texture =>
  colorTexture(`lobby.digit${value}`, 64, (x, y, size) => {
    const u = x / (size - 1);
    const v = y / (size - 1);
    const mask = value >= 0 ? DIGIT_SEGMENTS[value] ?? 0 : 0;

    for (let i = 0; i < SEGMENTS.length; i++) {
      const seg = SEGMENTS[i];
      if (!seg) continue;
      if (u < seg[0] || u > seg[2] || v < seg[1] || v > seg[3]) continue;
      return (mask & (1 << i)) !== 0 ? rgb(0xffb347) : rgb(0x2a1f14);
    }
    return rgb(0x0e1014);
  });

/* --- misc ---------------------------------------------------------------------- */

/** Soot and heat staining above the fire, and grime under the window seat. */
export const sootRoughness = (): THREE.Texture =>
  dataTexture('lobby.sootRough', 128, (x, y, size) => 0.55 + n2(x, y, size, 9, 3931) * 0.45);
