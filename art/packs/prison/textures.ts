/**
 * Blackgate - the surfaces, generated as procedural pixel data.
 *
 * Same three rules as everywhere else in art (art/lib/textures.ts): no canvas, no
 * `Math.random()`, cached at module scope. Every recipe below is a pure function
 * of pixel coordinates, so a room builds identically in a browser, on a peer's
 * machine, and headless inside `scripts/validateArt.mjs`.
 *
 * `*_TILE` is the size in METRES that one repeat covers. `merge.ts` bakes UVs in
 * world units, so a texture keeps its density whether it lands on a 0.3 m
 * conduit or an 8 m landing floor. Floor tiles are deliberately small - between
 * one and two metres, which is a size a player can take a step across. A 3 m
 * tile on an 8 m floor is under three repeats and reads from standing height as
 * one flat smear (docs/art/ROOM_REVIEW.md).
 *
 * The pack splits down the middle, and the split is a **century**.
 *
 * - **The Blocks** is the gaol as it was built: painted cinderblock and brick,
 *   poured concrete, red quarry tile, riveted bar steel, gloss paint over
 *   everything up to shoulder height and distemper above it. Every surface has
 *   been repainted more often than it has been repaired, so the colour is thick
 *   and the damage under it shows through. It lights itself WARM - caged tungsten
 *   at forty watts, one every few metres, the night circuit that was never off.
 * - **The Ward** is the annexe that was added later, and it is a hospital that
 *   happens to have locks on it: white glazed tile, terrazzo, chequer lino,
 *   enamelled steel, quilted canvas. It lights itself COLD - failing fluorescent
 *   tubes and x-ray boxes, a green-white that makes skin look wrong.
 *
 * The fill is cold blue, so the Blocks' tungsten reads as the only warmth in the
 * building and the Ward reads as colder than the dark it stands in. A third,
 * much smaller strand - **the Programme** - runs on germicidal ultraviolet, a
 * violet that belongs to neither and is why those two rooms are frightening in a
 * building where everything else is at least explicable.
 *
 * Albedos are mid-tones. Colour is converted to linear space before lighting,
 * where a near-black picked in a colour wheel is effectively 0 and no amount of
 * incandescence brings it back. Blackgate is dark because of the lighting and
 * the fog, not because the paint is black.
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

/** Ridged noise: 1 exactly on the zero-crossing of a noise field, 0 away from it. */
const ridge = (n: number, width: number): number => Math.max(0, 1 - Math.abs(n - 0.5) / width);

/**
 * Cracks in a hard glossy surface - paint, glaze, plaster, enamel.
 *
 * Short, fine, and gated by a separate LOW-frequency mask so they cluster in
 * failed patches with sound surface in between. A single contour of a
 * low-frequency field gives one continuous line meandering across two thirds of
 * a metre, and on a wall that does not read as a crack, it reads as something
 * crawling (docs/art/ROOM_REVIEW.md - the manor's second pass).
 */
function crackle(x: number, y: number, size: number, seed: number, scale: number, width = 0.028): number {
  const gate = Math.max(0, n2(x, y, size, scale * 0.32, seed + 411, 3) - 0.5) * 2.6;
  if (gate <= 0.02) return 0;
  const fine = ridge(n2(x, y, size, scale, seed, 3), width);
  const finer = ridge(n2(x, y, size, scale * 2.3, seed + 77, 2), width * 0.8) * 0.6;
  return Math.min(1, (fine + finer) * Math.min(1, gate));
}

/**
 * The single most useful function in the file: paint that has been put on too
 * thick, too often, and has started to come off.
 *
 * Returns how much of the coat has failed at this pixel, 0..1. Institutional
 * gloss does not wear evenly - it blisters in patches where damp has come
 * through the block behind it, and it chips to a hard edge where something has
 * hit it. Every painted surface in the Blocks is one base colour, this mask, and
 * whatever is underneath.
 */
function paintLoss(x: number, y: number, size: number, seed: number, amount: number): number {
  // Blisters: big soft patches, gated so most of the wall is sound.
  const damp = Math.max(0, n2(x, y, size, 3.1, seed, 4) - 0.54) * 3.4;
  // Chips: small, hard-edged, and only inside a blister or near one.
  const flake = Math.max(0, n2(x, y, size, 17, seed + 131, 2) - 0.46) * 3.2;
  return Math.min(1, damp * amount * (0.45 + flake));
}

/** Generic grime multiplier around 1, for anything that has sat in a locked building. */
function grime(x: number, y: number, size: number, seed: number, strength: number): number {
  const patch = n2(x, y, size, 4.5, seed, 4);
  return 1 - Math.max(0, patch - 0.46) * strength * 1.7;
}

/**
 * A run of damp coming DOWN a surface: stronger at the top, tapering, and
 * anisotropic so it reads as gravity rather than as noise. Walls in this
 * building leak, and it is what dates them.
 */
function weep(x: number, y: number, size: number, seed: number): number {
  // `v` runs 0 at the BOTTOM of a texture: a `DataTexture` is not flipped and
  // `merge.ts` bakes wall UVs straight from world Y. So a run that starts high
  // and tapers downward is strongest as v approaches 1, not 0 - which is the
  // single easiest sign convention in this file to get backwards.
  const v = y / size;
  const run = n2s(x, y, size, 9, 2, seed, 3);
  return Math.max(0, run - 0.5) * 2.2 * Math.pow(v, 0.7);
}

/* --- shared roughness maps ------------------------------------------------------ */

/**
 * Gloss paint: polished to a shine where hands, shoulders and trolleys go, dull
 * where nothing has touched it in fifty years. Institutional paint is the one
 * surface in the game where the roughness map does more work than the colour.
 */
export const glossRoughness = (): THREE.Texture =>
  dataTexture('prison.glossRough', 128, (x, y, size) => 0.2 + n2s(x, y, size, 14, 4, 5101) * 0.62);

/** Dry, broken-up roughness: concrete, brick, plaster, gravel. */
export const dryRoughness = (): THREE.Texture =>
  dataTexture('prison.dryRough', 128, (x, y, size) => 0.7 + n2(x, y, size, 12, 5107) * 0.3);

/** Glazed: mirror-smooth on the tile face, matte in the grout. */
export const glazedRoughness = (): THREE.Texture =>
  dataTexture('prison.glazeRough', 128, (x, y, size) => 0.2 + Math.pow(n2(x, y, size, 9, 5113), 1.6) * 0.55);

/** Wet: standing water and the ring round it. Half the Ward's floors. */
export const wetRoughness = (): THREE.Texture =>
  dataTexture('prison.wetRough', 128, (x, y, size) => 0.1 + Math.pow(Math.max(0, n2(x, y, size, 4, 5119) - 0.32), 0.7) * 1.3);

/* --- the Blocks: floors ---------------------------------------------------------- */

export const CONCRETE_TILE = 1.9;

/**
 * Poured concrete: the floor of most of the gaol. Trowel sweeps, a construction
 * joint every couple of metres, aggregate showing through where the laitance has
 * worn off, and a stain wherever something stood for twenty years.
 */
export const concreteFloor = (): THREE.Texture =>
  colorTexture('prison.concrete', SIZE, (x, y, size) => {
    const fine = n2(x, y, size, 26, 5201, 4);
    const broad = n2(x, y, size, 3.6, 5209, 4);
    let base = mix(rgb(0x6e6d67), rgb(0x807d74), broad);
    // Trowel sweeps: a warped stripe field in ONE direction. Concentric anything
    // on a floor is a bullseye (docs/art/ROOM_REVIEW.md).
    const sweep = Math.sin((x / size) * 5.4 + n2(x, y, size, 2.2, 5211, 3) * 5.4) * 0.5 + 0.5;
    base = shade(base, 0.965 + sweep * 0.07);
    // Exposed aggregate where the surface has worn through.
    const worn = Math.max(0, n2(x, y, size, 5, 5217, 4) - 0.55) * 2.6;
    if (worn > 0.05) {
      const stone = hash1(Math.floor(x / 2) * 37 + Math.floor(y / 2) * 11, 211, 5221);
      base = mix(base, stone > 0.7 ? rgb(0x928d80) : rgb(0x54524c), Math.min(0.7, worn) * (0.3 + stone * 0.5));
    }
    // Construction joints: a saw cut every third of the tile, one axis only.
    const joint = Math.abs(((y / size) % 1) - 0.5) > 0.492 ? 1 : 0;
    base = mix(base, rgb(0x44433c), joint * 0.7);
    // Cracks, and a long stain running off the low corner.
    base = mix(base, rgb(0x413f38), crackle(x, y, size, 5227, 11, 0.024) * 0.8);
    base = mix(base, rgb(0x51483a), weep(x, y, size, 5231) * 0.55);
    return shade(base, grime(x, y, size, 5233, 0.5) * (0.92 + fine * 0.16));
  });

export const concreteFloorNormal = (): THREE.Texture =>
  normalTexture('prison.concreteN', SIZE, (x, y, size) => {
    const joint = Math.abs(((y / size) % 1) - 0.5) > 0.492 ? 1 : 0;
    return n2(x, y, size, 24, 5201, 3) * 0.3 - joint * 0.7 - crackle(x, y, size, 5227, 11, 0.024) * 0.5;
  }, 1.9);

export const QUARRY_TILE = 1.35;

/**
 * Red quarry tile: the floor of the older halls, the chapel and the mess. Six to
 * a repeat puts a tile at about 22 cm, which is the real size and small enough
 * that the joints read as joints rather than as a painted grid.
 */
export const quarryTile = (): THREE.Texture =>
  colorTexture('prison.quarry', SIZE, (x, y, size) => {
    const n = 6;
    const u = (x / size) * n;
    const v = (y / size) * n;
    const id = hash1(Math.floor(u) * 41 + Math.floor(v) * 17, 89, 5301);
    const joint = Math.max(Math.abs((u % 1) - 0.5), Math.abs((v % 1) - 0.5)) > 0.455 ? 1 : 0;

    const fired = n2(x, y, size, 20, 5303, 3);
    // The clay runs from an oxidised red to a reduced liver colour, tile to tile.
    let base = mix(rgb(0x8a5340), rgb(0x6b4436), id);
    base = mix(base, rgb(0x77503f), fired * 0.5);
    // A scatter of tiles replaced from a paler batch, and a few burst by frost.
    if (id > 0.9) base = mix(base, rgb(0x9a7358), 0.7);
    if (id < 0.07) base = mix(base, rgb(0x413730), 0.6);
    // Polished traffic lane down the middle, one axis, worn to the biscuit.
    const lane = Math.pow(Math.max(0, 1 - Math.abs(x / size - 0.5) * 2.6), 2.2);
    base = mix(base, rgb(0x8f7a63), lane * 0.34);
    base = mix(base, rgb(0x504640), joint * 0.9);
    base = mix(base, rgb(0x33302a), crackle(x, y, size, 5307, 14, 0.02) * 0.7);
    return shade(base, grime(x, y, size, 5311, 0.6) * (0.93 + fired * 0.14));
  });

export const quarryTileNormal = (): THREE.Texture =>
  normalTexture('prison.quarryN', SIZE, (x, y, size) => {
    const n = 6;
    const u = (x / size) * n;
    const v = (y / size) * n;
    const joint = Math.max(Math.abs((u % 1) - 0.5), Math.abs((v % 1) - 0.5)) > 0.455 ? 1 : 0;
    return 0.5 - joint * 0.85 + n2(x, y, size, 22, 5303, 2) * 0.18;
  }, 2.4);

export const GRAVEL_TILE = 1.5;

/** Cinder and clinker: the airing court, and anywhere the floor is outside. */
export const gravelYard = (): THREE.Texture =>
  colorTexture('prison.gravel', SIZE, (x, y, size) => {
    const cell = 8;
    const id = hash1(Math.floor(x / cell) * 29 + Math.floor(y / cell) * 53, 307, 5401);
    const bed = n2(x, y, size, 7, 5403, 4);
    let base = mix(rgb(0x4e4a45), rgb(0x635d54), bed);
    // Clinker: dark, angular, about a third of the surface.
    if (id > 0.66) base = mix(base, rgb(0x393530), 0.55 + id * 0.3);
    else if (id < 0.12) base = mix(base, rgb(0x847c6e), 0.5);
    // Puddles in the ruts. Not black - a near-black glossy patch on a floor is a
    // hole in the floor (docs/art/ROOM_REVIEW.md).
    const rut = Math.max(0, n2s(x, y, size, 2.4, 8, 5407, 3) - 0.56) * 3;
    base = mix(base, rgb(0x4a5560), Math.min(0.75, rut));
    return shade(base, 0.9 + bed * 0.2);
  });

export const gravelNormal = (): THREE.Texture =>
  normalTexture('prison.gravelN', SIZE, (x, y, size) => {
    const cell = 8;
    const id = hash1(Math.floor(x / cell) * 29 + Math.floor(y / cell) * 53, 307, 5401);
    return n2(x, y, size, 22, 5403, 3) * 0.5 + id * 0.5;
  }, 2.6);

export const DRAIN_TILE = 1.25;

/**
 * The wash-house floor: small white tile falling to a channel, so it is the one
 * floor in the pack with a direction. The fall is baked into the normal map,
 * which is what makes a shower block read as drained rather than as tiled.
 */
export const drainTile = (): THREE.Texture =>
  colorTexture('prison.drain', SIZE, (x, y, size) => {
    const n = 10;
    const u = (x / size) * n;
    const v = (y / size) * n;
    const joint = Math.max(Math.abs((u % 1) - 0.5), Math.abs((v % 1) - 0.5)) > 0.43 ? 1 : 0;
    const id = hash1(Math.floor(u) * 31 + Math.floor(v) * 7, 149, 5501);
    let base = mix(rgb(0xa8a89a), rgb(0x93958a), id);
    // The wet lane toward the channel: darker, and it collects everything.
    const fall = Math.pow(Math.abs(y / size - 0.5) * 2, 1.5);
    base = mix(base, rgb(0x6e7568), (1 - fall) * 0.42);
    // Grout gone to mould, worst nearest the channel.
    base = mix(base, mix(rgb(0x5c6152), rgb(0x40483c), 1 - fall), joint * 0.92);
    // Lime scale bloom, and rust from the fixings.
    base = mix(base, rgb(0xc4c2b0), Math.max(0, n2(x, y, size, 8, 5503, 4) - 0.6) * 2.2);
    base = mix(base, rgb(0x7a4a2e), Math.max(0, n2(x, y, size, 15, 5507, 3) - 0.66) * 2.4);
    return shade(base, grime(x, y, size, 5509, 0.45));
  });

export const drainTileNormal = (): THREE.Texture =>
  normalTexture('prison.drainN', SIZE, (x, y, size) => {
    const n = 10;
    const u = (x / size) * n;
    const v = (y / size) * n;
    const joint = Math.max(Math.abs((u % 1) - 0.5), Math.abs((v % 1) - 0.5)) > 0.43 ? 1 : 0;
    // The fall toward the channel, as a shallow V across the whole tile.
    const fall = Math.abs(y / size - 0.5) * 0.55;
    return fall + 0.4 - joint * 0.5;
  }, 2.2);

/* --- the Blocks: walls ----------------------------------------------------------- */

export const BLOCK_TILE = 1.6;

/** Per-pixel cinderblock decomposition, shared by the colour and height passes. */
function blockAt(x: number, y: number, size: number): { joint: number; id: number } {
  // Four courses to a 1.6 m tile is a 40 cm block, which is the real thing. A
  // course height chosen for the look rather than the size is how a wall ends up
  // reading as breeze blocks or as basketwork (docs/art/ROOM_REVIEW.md).
  const courses = 4;
  const v = (y / size) * courses;
  const row = Math.floor(v);
  const stagger = (row % 2) * 0.5;
  const u = (x / size) * 2 + stagger;
  const col = Math.floor(u);
  const fu = u % 1;
  const fv = v % 1;
  const joint = Math.max(0, 1 - Math.min(Math.min(fu, 1 - fu) / 0.045, Math.min(fv, 1 - fv) / 0.09));
  return { joint, id: hash1(col * 61 + row * 23, 197, 5601) };
}

/**
 * Painted cinderblock: the wall of nearly every room in the Blocks.
 *
 * It is one colour of gloss, applied about eleven times, over block that was
 * never sound. What makes it read is not the block - it is the paint coming off
 * it, which is why `paintLoss` is doing more here than the lattice is.
 */
export const paintedBlock = (): THREE.Texture =>
  colorTexture('prison.block', SIZE, (x, y, size) => {
    const { joint, id } = blockAt(x, y, size);
    const grain = n2(x, y, size, 30, 5603, 3);

    // The paint: an institutional buff that has yellowed unevenly.
    let base = mix(rgb(0x8d8977), rgb(0x9c9782), grain * 0.8);
    base = shade(base, 0.96 + id * 0.09);
    // Where it has come off: raw block, a cold grey against a warm coat.
    const loss = paintLoss(x, y, size, 5607, 0.9);
    base = mix(base, mix(rgb(0x6b6a66), rgb(0x585751), grain), loss);
    // Damp running down from the ceiling line, and the salt bloom it leaves.
    base = mix(base, rgb(0x5f6156), weep(x, y, size, 5609) * 0.5);
    base = mix(base, rgb(0xb6b4a4), Math.max(0, n2(x, y, size, 6, 5613, 4) - 0.63) * 2.0);
    // The mortar joint last, so paint loss does not eat it.
    base = mix(base, rgb(0x6a675c), joint * 0.7);
    return shade(base, grime(x, y, size, 5617, 0.55));
  });

export const paintedBlockNormal = (): THREE.Texture =>
  normalTexture('prison.blockN', SIZE, (x, y, size) => {
    const { joint } = blockAt(x, y, size);
    const loss = paintLoss(x, y, size, 5607, 0.9);
    return 0.5 - joint * 0.6 - loss * 0.35 + n2(x, y, size, 28, 5603, 3) * 0.2;
  }, 2.0);

export const DADO_TILE = 1.5;

/**
 * The dado: the gloss band that runs round the bottom of every institutional
 * wall in the world, in the green nobody has ever chosen for their own house.
 *
 * It gets a texture of its own rather than a tint because the damage on it is
 * different in kind: it is at shoulder height in a corridor full of trolleys, so
 * it is scraped rather than blistered, and the scrapes run horizontally.
 */
export const paintedDado = (): THREE.Texture =>
  colorTexture('prison.dado', SIZE, (x, y, size) => {
    const { joint } = blockAt(x, y, size);
    const grain = n2(x, y, size, 26, 5701, 3);
    let base = mix(rgb(0x4e5f4c), rgb(0x5d6d55), grain * 0.9);
    // Horizontal scrapes, hard-edged, at trolley and shoulder height.
    const scrape = Math.max(0, n2s(x, y, size, 3, 26, 5703, 3) - 0.58) * 3.2;
    base = mix(base, rgb(0x8d8977), Math.min(0.8, scrape));
    // Chips down to the block, worst near the floor - which is v near 0.
    const low = Math.pow(1 - y / size, 1.4);
    base = mix(base, rgb(0x64635e), paintLoss(x, y, size, 5707, 0.7 + low * 0.9));
    base = mix(base, rgb(0x38443a), joint * 0.6);
    // A skirt of black boot-scuff along the very bottom.
    base = mix(base, rgb(0x2f342e), Math.pow(Math.max(0, 0.18 - y / size) / 0.18, 1.6) * 0.55);
    return shade(base, grime(x, y, size, 5711, 0.5));
  });

export const BRICK_TILE = 1.45;

/**
 * Painted brick: the oldest parts of the gaol - the chapel, the gallows shed,
 * the furnace. Twelve courses to a 1.45 m tile is a 12 cm course, which is a
 * brick. A course at 20 cm is blockwork and the whole room reads as a bunker
 * (docs/art/ROOM_REVIEW.md - "a tile size is a look, not a setting").
 */
function brickAt(x: number, y: number, size: number): { joint: number; id: number } {
  const courses = 12;
  const v = (y / size) * courses;
  const row = Math.floor(v);
  const stagger = (row % 2) * 0.5;
  const u = (x / size) * 5.5 + stagger;
  const col = Math.floor(u);
  const fu = u % 1;
  const fv = v % 1;
  const joint = Math.max(0, 1 - Math.min(Math.min(fu, 1 - fu) / 0.06, Math.min(fv, 1 - fv) / 0.12));
  return { joint, id: hash1(col * 43 + row * 19, 233, 5801) };
}

export const prisonBrick = (): THREE.Texture =>
  colorTexture('prison.brick', SIZE, (x, y, size) => {
    const { joint, id } = brickAt(x, y, size);
    const grain = n2(x, y, size, 34, 5803, 3);
    // Limewash over a hard red brick, thinning where it has weathered.
    let base = mix(rgb(0x9a9384), rgb(0xa8a191), grain * 0.7);
    const bare = paintLoss(x, y, size, 5807, 1.1) * (0.6 + id * 0.6);
    base = mix(base, mix(rgb(0x7d5241), rgb(0x5f4237), id), Math.min(0.95, bare));
    base = mix(base, rgb(0x726d61), joint * 0.75);
    // Efflorescence: white salt crystallising out of the mortar, in patches.
    base = mix(base, rgb(0xc0bcac), Math.max(0, n2(x, y, size, 4.4, 5811, 4) - 0.6) * 2.3 * (0.4 + joint));
    base = mix(base, rgb(0x4f5348), weep(x, y, size, 5813) * 0.55);
    return shade(base, grime(x, y, size, 5817, 0.6) * (0.94 + grain * 0.12));
  });

export const prisonBrickNormal = (): THREE.Texture =>
  normalTexture('prison.brickN', SIZE, (x, y, size) => {
    const { joint, id } = brickAt(x, y, size);
    return 0.5 - joint * 0.75 + id * 0.06 + n2(x, y, size, 30, 5803, 3) * 0.15;
  }, 2.3);

export const RIVET_TILE = 1.2;

/**
 * Riveted plate: the gates, the gantries, the shutter over the yard arch, and
 * the walls of the strong room. Painted the same green as the dado, because
 * whoever ran this building only ever bought one colour.
 */
export const rivetedPlate = (): THREE.Texture =>
  colorTexture('prison.rivet', SIZE, (x, y, size) => {
    const panelsX = 2;
    const panelsY = 3;
    const u = (x / size) * panelsX;
    const v = (y / size) * panelsY;
    const seamU = Math.min(u % 1, 1 - (u % 1));
    const seamV = Math.min(v % 1, 1 - (v % 1));
    const seam = Math.max(0, 1 - Math.min(seamU, seamV) / 0.035);

    const wear = n2s(x, y, size, 8, 5, 5901, 3);
    let base = mix(rgb(0x4a5a4c), rgb(0x596a58), wear * 0.9);
    // Rust breaking through, worst on the seams and the bottom of each panel.
    const rust = Math.min(1, paintLoss(x, y, size, 5903, 1.2) + seam * 0.4 * Math.max(0, n2(x, y, size, 9, 5907, 3) - 0.4) * 2);
    base = mix(base, mix(rgb(0x7d4a2c), rgb(0x5a3524), n2(x, y, size, 22, 5909, 2)), Math.min(0.9, rust));
    // Rivets: a run down each seam, sized so they read at arm's length.
    const rx = (x / size) * panelsX * 9;
    const ry = (y / size) * panelsY * 9;
    const near = seamU < seamV;
    const along = near ? ry : rx;
    const across = near ? seamU : seamV;
    const head = across < 0.03 && Math.abs((along % 1) - 0.5) < 0.28 ? 1 : 0;
    base = mix(base, mix(rgb(0x717b6c), rgb(0x8a5a38), rust), head * 0.8);
    base = mix(base, rgb(0x2e332c), seam * 0.4);
    return shade(base, grime(x, y, size, 5913, 0.5));
  });

export const rivetedPlateNormal = (): THREE.Texture =>
  normalTexture('prison.rivetN', SIZE, (x, y, size) => {
    const panelsX = 2;
    const panelsY = 3;
    const u = (x / size) * panelsX;
    const v = (y / size) * panelsY;
    const seamU = Math.min(u % 1, 1 - (u % 1));
    const seamV = Math.min(v % 1, 1 - (v % 1));
    const seam = Math.max(0, 1 - Math.min(seamU, seamV) / 0.035);
    const rx = (x / size) * panelsX * 9;
    const ry = (y / size) * panelsY * 9;
    const near = seamU < seamV;
    const along = near ? ry : rx;
    const across = near ? seamU : seamV;
    const head = across < 0.03 ? Math.max(0, 1 - Math.abs((along % 1) - 0.5) / 0.28) : 0;
    return 0.45 - seam * 0.3 + head * 0.55 + n2(x, y, size, 40, 5901, 2) * 0.1;
  }, 2.4);

export const RUBBLE_TILE = 2.0;

/** Rubble stone: the foundations, the sub-level, the well of the furnace. */
export const rubbleStone = (): THREE.Texture =>
  colorTexture('prison.rubble', SIZE, (x, y, size) => {
    // Irregular stones, from a warped lattice so no two courses line up.
    const warp = n2(x, y, size, 3, 6001, 3) * 1.6;
    const u = (x / size) * 5 + warp;
    const v = (y / size) * 4 + n2(x, y, size, 3, 6003, 3) * 1.2;
    const id = hash1(Math.floor(u) * 37 + Math.floor(v) * 71, 251, 6007);
    const fu = Math.abs((u % 1) - 0.5);
    const fv = Math.abs((v % 1) - 0.5);
    const joint = Math.max(0, (Math.max(fu, fv) - 0.36) / 0.14);

    const grain = n2(x, y, size, 28, 6011, 3);
    let base = mix(rgb(0x64615a), rgb(0x7a746a), id);
    base = shade(base, 0.9 + grain * 0.22);
    base = mix(base, rgb(0x4b4941), Math.min(1, joint * 1.2));
    // Wet: this is below the water table and it never dries.
    base = mix(base, rgb(0x454b4a), Math.max(0, n2(x, y, size, 5, 6013, 4) - 0.44) * 1.8);
    base = mix(base, rgb(0x6d7a5e), Math.max(0, n2(x, y, size, 11, 6017, 3) - 0.62) * 2.4);
    return shade(base, grime(x, y, size, 6019, 0.5));
  });

export const rubbleStoneNormal = (): THREE.Texture =>
  normalTexture('prison.rubbleN', SIZE, (x, y, size) => {
    const warp = n2(x, y, size, 3, 6001, 3) * 1.6;
    const u = (x / size) * 5 + warp;
    const v = (y / size) * 4 + n2(x, y, size, 3, 6003, 3) * 1.2;
    const fu = Math.abs((u % 1) - 0.5);
    const fv = Math.abs((v % 1) - 0.5);
    const joint = Math.max(0, (Math.max(fu, fv) - 0.36) / 0.14);
    return 0.55 - Math.min(1, joint) * 0.8 + n2(x, y, size, 26, 6011, 3) * 0.25;
  }, 2.8);

export const SOFFIT_TILE = 2.2;

/**
 * Board-marked concrete soffit: the ceiling of the whole building. The board
 * marks run one way and there is a form-tie hole every so often, which is the
 * cheapest thing in the file and the only reason a flat grey lid reads as
 * anything at all.
 */
export const concreteSoffit = (): THREE.Texture =>
  colorTexture('prison.soffit', SIZE, (x, y, size) => {
    const board = (x / size) * 9;
    const edge = Math.max(0, 1 - Math.abs((board % 1) - 0.5) / 0.46);
    const grain = n2s(x, y, size, 4, 30, 6101, 3);
    let base = mix(rgb(0x6a6862), rgb(0x7b7870), grain * 0.8);
    base = shade(base, 0.95 + Math.pow(edge, 3) * 0.1);
    base = mix(base, rgb(0x4c4a44), Math.pow(edge, 8) * 0.6);
    // Form-tie holes, plugged and stained.
    const tx = Math.abs((((x / size) * 4.5) % 1) - 0.5);
    const ty = Math.abs((((y / size) * 4.5) % 1) - 0.5);
    base = mix(base, rgb(0x504b42), Math.max(0, 1 - Math.hypot(tx, ty) / 0.055) * 0.85);
    // Leaks: the floor above is a washroom, on and off, for a century.
    base = mix(base, rgb(0x574f42), Math.max(0, n2(x, y, size, 3.4, 6103, 4) - 0.5) * 2.2);
    base = mix(base, rgb(0x33322c), crackle(x, y, size, 6107, 9, 0.022) * 0.75);
    return shade(base, grime(x, y, size, 6109, 0.5));
  });

/* --- the Ward: surfaces ---------------------------------------------------------- */

export const WARDTILE_TILE = 1.05;

/** Per-pixel decomposition of a glazed brick-bond tile wall. */
function wardAt(x: number, y: number, size: number): { joint: number; id: number } {
  // Seven courses to a 1.05 m tile is a 15 cm tile: a real glazed brick. Courses
  // are half-bonded, which is what makes a tiled wall read as tiled rather than
  // as graph paper.
  const courses = 7;
  const v = (y / size) * courses;
  const row = Math.floor(v);
  const u = (x / size) * 3.5 + (row % 2) * 0.5;
  const col = Math.floor(u);
  const fu = u % 1;
  const fv = v % 1;
  const joint = Math.max(0, 1 - Math.min(Math.min(fu, 1 - fu) / 0.05, Math.min(fv, 1 - fv) / 0.1));
  return { joint, id: hash1(col * 53 + row * 29, 181, 6201) };
}

/**
 * White glazed tile: the Ward's wall, floor to ceiling, in every room where
 * something had to be hosed down afterwards.
 *
 * It is not white. It is a cold off-white that has crazed all over, gone yellow
 * where a lamp has stood against it, and has grout the colour of a bad tooth.
 * The three things that make it read as a hospital rather than as a bathroom are
 * the crazing, the missing tiles, and the fact that the grout is darker than
 * anything else in the room.
 */
export const wardTile = (): THREE.Texture =>
  colorTexture('prison.wardTile', SIZE, (x, y, size) => {
    const { joint, id } = wardAt(x, y, size);
    const grain = n2(x, y, size, 24, 6203, 3);

    let base = mix(rgb(0xb4b8b0), rgb(0xc2c4ba), id * 0.7 + grain * 0.3);
    // Nicotine and lamp-yellow, in broad patches.
    base = mix(base, rgb(0xb0a487), Math.max(0, n2(x, y, size, 3.2, 6207, 4) - 0.48) * 2.0);
    // Crazing: the fine map of cracks in an old glaze. Fine and clustered.
    base = mix(base, rgb(0x8e9088), crackle(x, y, size, 6211, 26, 0.02) * 0.55);
    // Missing tiles, back to grey render. About one in forty.
    if (id > 0.965) base = mix(base, mix(rgb(0x726e64), rgb(0x5f5c54), grain), 0.85);
    // Grout: dark, and it is where everything lives.
    base = mix(base, mix(rgb(0x5b5c50), rgb(0x46483e), grain), joint * 0.95);
    // A splash line low down, worst nearest the floor.
    base = mix(base, rgb(0x7d6a52), Math.max(0, n2s(x, y, size, 5, 2, 6213, 3) - 0.6) * 2.2 * Math.pow(1 - y / size, 1.6));
    return shade(base, grime(x, y, size, 6217, 0.4));
  });

export const wardTileNormal = (): THREE.Texture =>
  normalTexture('prison.wardTileN', SIZE, (x, y, size) => {
    const { joint, id } = wardAt(x, y, size);
    const missing = id > 0.965 ? 1 : 0;
    return 0.55 - joint * 0.75 - missing * 0.35 - crackle(x, y, size, 6211, 26, 0.02) * 0.2;
  }, 2.4);

export const TERRAZZO_TILE = 1.8;

/**
 * Terrazzo: the floor of the Ward's public rooms, in brass-divided bays. Cheap
 * to generate and extremely effective - a floor of speckle reads as "a place
 * that once had a budget", which is exactly the note the Ward needs against the
 * Blocks' bare concrete.
 */
export const terrazzo = (): THREE.Texture =>
  colorTexture('prison.terrazzo', SIZE, (x, y, size) => {
    const chip = (scale: number, seed: number): number =>
      hash1(Math.floor((x / size) * scale) * 31 + Math.floor((y / size) * scale) * 67, 331, seed);
    const bed = n2(x, y, size, 20, 6301, 3);
    let base = mix(rgb(0x8e8c84), rgb(0x9c9a90), bed);
    // Three sizes of aggregate, three colours: grey, cream, and a dark green.
    const a = chip(96, 6303);
    const b = chip(52, 6307);
    const c = chip(30, 6311);
    if (a > 0.78) base = mix(base, rgb(0xb2aea2), 0.5);
    if (b > 0.87) base = mix(base, rgb(0x6a7268), 0.44);
    if (c > 0.93) base = mix(base, rgb(0x7a6e64), 0.4);
    // Brass divider strips, one grid, quite far apart.
    const du = Math.abs((((x / size) * 2) % 1) - 0.5);
    const dv = Math.abs((((y / size) * 2) % 1) - 0.5);
    const strip = Math.max(du, dv) > 0.492 ? 1 : 0;
    base = mix(base, rgb(0x9a7f42), strip * 0.8);
    // Worn to a shine down the traffic lane, and stained at the edges.
    base = mix(base, rgb(0xa8a598), Math.pow(Math.max(0, 1 - Math.abs(x / size - 0.5) * 2.4), 2) * 0.22);
    base = mix(base, rgb(0x5b544a), Math.max(0, n2(x, y, size, 4, 6313, 4) - 0.56) * 2.2);
    return shade(base, grime(x, y, size, 6317, 0.4));
  });

export const LINO_TILE = 1.55;

/**
 * Chequered lino: the Ward's corridors and treatment rooms. Worn through to the
 * hessian in the lane a trolley takes, which is the whole reason it is here -
 * the wear tells you where people were pushed.
 */
export const chequerLino = (): THREE.Texture =>
  colorTexture('prison.lino', SIZE, (x, y, size) => {
    const n = 4;
    const u = Math.floor((x / size) * n);
    const v = Math.floor((y / size) * n);
    const dark = (u + v) % 2 === 0;
    const grain = n2(x, y, size, 26, 6401, 3);
    let base = dark ? mix(rgb(0x4e4f4a), rgb(0x5c5d56), grain) : mix(rgb(0xa8a494), rgb(0xb4b0a0), grain);
    // The lane: a wide worn strip where everything got wheeled, one direction.
    const lane = Math.pow(Math.max(0, 1 - Math.abs(x / size - 0.42) * 2.8), 1.8);
    const scuff = Math.max(0, n2s(x, y, size, 3, 22, 6403, 3) - 0.42) * 2;
    base = mix(base, rgb(0x8a7f6c), Math.min(0.8, lane * (0.4 + scuff)));
    // Right through, to the brown hessian backing.
    base = mix(base, rgb(0x6d5a44), Math.max(0, lane * scuff - 0.62) * 2.6);
    // Seams between rolls, and the tacks holding them.
    const seam = Math.abs((((y / size) * 1.5) % 1) - 0.5) > 0.494 ? 1 : 0;
    base = mix(base, rgb(0x3b3b36), seam * 0.7);
    base = mix(base, rgb(0x4a4438), crackle(x, y, size, 6407, 12, 0.016) * 0.6);
    return shade(base, grime(x, y, size, 6409, 0.45));
  });

export const ENAMEL_TILE = 1.35;

/**
 * Vitreous enamel panel: the Ward's fittings, its ductwork casings and the
 * cladding on anything that had to look clean. Chipped to black iron at every
 * edge, because that is the one way enamel fails.
 */
export const enamelPanel = (): THREE.Texture =>
  colorTexture('prison.enamel', SIZE, (x, y, size) => {
    const panelsX = 3;
    const panelsY = 2;
    const u = (x / size) * panelsX;
    const v = (y / size) * panelsY;
    const eu = Math.min(u % 1, 1 - (u % 1));
    const ev = Math.min(v % 1, 1 - (v % 1));
    const edge = Math.max(0, 1 - Math.min(eu, ev) / 0.05);

    const grain = n2(x, y, size, 22, 6501, 3);
    let base = mix(rgb(0xbcc0b8), rgb(0xa8ada4), grain * 0.7);
    // Chips: hard-edged, and only where the edge is.
    const chip = Math.max(0, n2(x, y, size, 30, 6503, 2) - 0.5) * 2.6 * (0.25 + edge);
    base = mix(base, mix(rgb(0x2f322f), rgb(0x6a4530), grain), Math.min(0.9, chip));
    base = mix(base, rgb(0x77796e), edge * 0.35);
    base = mix(base, rgb(0x9a8f74), Math.max(0, n2(x, y, size, 4, 6507, 4) - 0.56) * 2.0);
    return shade(base, grime(x, y, size, 6511, 0.35));
  });

export const PAD_TILE = 1.15;

/**
 * Quilted canvas: the padded cell, and the restraint cots in the isolation
 * rooms. Buttoned on a diamond grid, stained in a way that is worse for being
 * vague, and split along one seam where the horsehair has come out.
 */
export const paddedCanvas = (): THREE.Texture =>
  colorTexture('prison.padded', SIZE, (x, y, size) => {
    const n = 4;
    const u = (x / size) * n;
    const v = (y / size) * n;
    // Diamond quilting: a rotated lattice, so the seams run on the diagonal.
    const du = u + v;
    const dv = u - v;
    const seam = Math.max(
      Math.max(0, 1 - Math.abs((du % 1) - 0.5) / 0.09),
      Math.max(0, 1 - Math.abs((dv % 1) - 0.5) / 0.09),
    );
    const button = Math.max(0, 1 - Math.hypot((du % 1) - 0.5, (dv % 1) - 0.5) / 0.1);

    const weave = n2s(x, y, size, 60, 60, 6601, 2);
    let base = mix(rgb(0x9c9278), rgb(0xaaa084), weave);
    // The stains. Two kinds, and neither is identifiable, which is the point.
    base = mix(base, rgb(0x7d6c50), Math.max(0, n2(x, y, size, 3.6, 6603, 4) - 0.48) * 2.2);
    base = mix(base, rgb(0x6a5442), Math.max(0, n2(x, y, size, 8, 6607, 3) - 0.62) * 2.6);
    base = shade(base, 1 - seam * 0.22);
    base = mix(base, rgb(0x6e6552), button * 0.7);
    // One long split, with the stuffing showing pale through it.
    const split = Math.max(0, 1 - Math.abs(n2s(x, y, size, 2, 6, 6611, 2) - 0.5) / 0.02);
    base = mix(base, rgb(0x50493c), split * 0.8);
    base = mix(base, rgb(0xc0b69c), Math.max(0, split - 0.62) * 2.2);
    return shade(base, grime(x, y, size, 6613, 0.35));
  });

export const paddedCanvasNormal = (): THREE.Texture =>
  normalTexture('prison.paddedN', SIZE, (x, y, size) => {
    const n = 4;
    const u = (x / size) * n;
    const v = (y / size) * n;
    const du = u + v;
    const dv = u - v;
    const seam = Math.max(
      Math.max(0, 1 - Math.abs((du % 1) - 0.5) / 0.09),
      Math.max(0, 1 - Math.abs((dv % 1) - 0.5) / 0.09),
    );
    const button = Math.max(0, 1 - Math.hypot((du % 1) - 0.5, (dv % 1) - 0.5) / 0.1);
    return 0.62 - seam * 0.4 - button * 0.35 + n2s(x, y, size, 50, 50, 6601, 2) * 0.12;
  }, 2.2);

export const DISTEMPER_TILE = 2.0;

/**
 * Cracked distemper over plaster: the Ward's upper walls and ceilings, above the
 * tile line. Cream that has gone grey, blown in sheets, and fallen off in
 * patches to the brown scratch coat underneath.
 */
export const distemper = (): THREE.Texture =>
  colorTexture('prison.distemper', SIZE, (x, y, size) => {
    const grain = n2(x, y, size, 30, 6701, 3);
    let base = mix(rgb(0xa6a294), rgb(0xb2ae9e), grain * 0.8);
    base = mix(base, rgb(0x9a9074), Math.max(0, n2(x, y, size, 3.4, 6703, 4) - 0.48) * 1.8);
    // Blown patches: the plaster has come away in sheets with hard edges.
    const blown = Math.max(0, n2(x, y, size, 5.2, 6707, 3) - 0.575);
    const patch = Math.min(1, blown * 14);
    base = mix(base, mix(rgb(0x7d6b56), rgb(0x6a5b49), grain), patch * 0.9);
    // A rim of lifted paint round each patch, paler than either.
    base = mix(base, rgb(0xc4bfae), Math.max(0, 1 - Math.abs(blown - 0.005) / 0.006) * 0.5);
    base = mix(base, rgb(0x6f6a5c), crackle(x, y, size, 6711, 15, 0.024) * 0.7);
    base = mix(base, rgb(0x5d5b4e), weep(x, y, size, 6713) * 0.5);
    return shade(base, grime(x, y, size, 6717, 0.5));
  });

export const distemperNormal = (): THREE.Texture =>
  normalTexture('prison.distemperN', SIZE, (x, y, size) => {
    const blown = Math.max(0, n2(x, y, size, 5.2, 6707, 3) - 0.575);
    return 0.6 - Math.min(1, blown * 14) * 0.45 - crackle(x, y, size, 6711, 15, 0.024) * 0.3 + n2(x, y, size, 28, 6701, 2) * 0.14;
  }, 2.0);

export const RUBBER_TILE = 1.0;

/** Studded rubber matting: the treatment rooms, where the floor had to insulate. */
export const rubberMat = (): THREE.Texture =>
  colorTexture('prison.rubber', SIZE, (x, y, size) => {
    const n = 12;
    const u = (x / size) * n;
    const v = (y / size) * n;
    const stud = Math.max(0, 1 - Math.hypot((u % 1) - 0.5, (v % 1) - 0.5) / 0.3);
    const grain = n2(x, y, size, 40, 6801, 2);
    let base = mix(rgb(0x55524c), rgb(0x625e57), grain);
    base = shade(base, 0.88 + stud * 0.3);
    // Perished and cracked in the traffic lane, showing pale canvas beneath.
    base = mix(base, rgb(0x6d6558), crackle(x, y, size, 6803, 13, 0.03) * 0.65);
    base = mix(base, rgb(0x2f3a3a), Math.max(0, n2(x, y, size, 4, 6807, 4) - 0.58) * 2.2);
    return shade(base, 0.94 + grain * 0.14);
  });

export const rubberMatNormal = (): THREE.Texture =>
  normalTexture('prison.rubberN', SIZE, (x, y, size) => {
    const n = 12;
    const u = (x / size) * n;
    const v = (y / size) * n;
    const stud = Math.max(0, 1 - Math.hypot((u % 1) - 0.5, (v % 1) - 0.5) / 0.3);
    return 0.4 + Math.pow(stud, 0.6) * 0.5 - crackle(x, y, size, 6803, 13, 0.03) * 0.2;
  }, 2.2);

/* --- the Programme --------------------------------------------------------------- */

export const RESIN_TILE = 1.3;

/**
 * What has grown over the Programme's rooms: a wet crust somewhere between
 * secreted resin, mould and scar tissue, with a lattice of hairline channels
 * running through it that carry a light of their own.
 *
 * Colour map for what it is, emissive map for the channels, and the emissive
 * colour left at white so the hue ramp painted into the picture comes through.
 * The glow is POINTS on a dark web rather than the whole web, because a
 * continuous glowing line reads as a string of party lights
 * (docs/art/ROOM_REVIEW.md).
 */
function resinVeins(x: number, y: number, size: number): number {
  const web = ridge(n2(x, y, size, 5.5, 6901, 3), 0.05);
  const fine = ridge(n2(x, y, size, 13, 6907, 2), 0.04) * 0.55;
  // Nodes: where the veins are actually bright.
  const node = Math.max(0, n2(x, y, size, 9, 6911, 2) - 0.46) * 2.6;
  return Math.min(1, (web + fine * web) * node);
}

export const resinCrust = (): THREE.Texture =>
  colorTexture('prison.resin', SIZE, (x, y, size) => {
    const grain = n2(x, y, size, 24, 6913, 3);
    const lobe = n2(x, y, size, 4.5, 6917, 4);
    let base = mix(rgb(0x4a4450), rgb(0x5c5060), lobe);
    base = shade(base, 0.9 + grain * 0.24);
    // Pale rind where it has dried against the air.
    base = mix(base, rgb(0x8c7f8e), Math.max(0, lobe - 0.62) * 2.2);
    // The veins as a dark web in the albedo, so the emissive has something to sit in.
    base = mix(base, rgb(0x2e2836), ridge(n2(x, y, size, 5.5, 6901, 3), 0.06) * 0.7);
    base = mix(base, rgb(0xa878c4), resinVeins(x, y, size) * 0.6);
    return base;
  });

export const resinCrustEmissive = (): THREE.Texture =>
  colorTexture('prison.resinE', SIZE, (x, y, size) => {
    const v = resinVeins(x, y, size);
    // A hue ramp: the middle of a node is whiter than its edge, which is what
    // makes it read as hotter rather than merely brighter.
    const core = Math.max(0, v - 0.62) * 2.6;
    const c = mix(rgb(0x000000), rgb(0x7a2ec4), Math.min(1, v * 1.3));
    return mix(c, rgb(0xdcb0ff), Math.min(1, core));
  });

export const resinCrustNormal = (): THREE.Texture =>
  normalTexture(
    'prison.resinN',
    SIZE,
    (x, y, size) => n2(x, y, size, 4.5, 6917, 4) * 0.7 - ridge(n2(x, y, size, 5.5, 6901, 3), 0.06) * 0.45,
    2.2,
  );

/* --- signage, paper and screens -------------------------------------------------- */

export const STENCIL_TILE = 0.9;

/**
 * Stencilled steel: the plates screwed to every door, gate and locker in the
 * building. Authored as a tiling surface, so it is the NUMBERS as a texture
 * rather than any particular number - a stencil is a shape and the map is read
 * at three metres.
 */
export const stencilSteel = (): THREE.Texture =>
  colorTexture('prison.stencil', SIZE, (x, y, size) => {
    const wear = n2s(x, y, size, 10, 4, 7001, 3);
    let base = mix(rgb(0x585c54), rgb(0x6b6f66), wear * 0.9);
    base = mix(base, mix(rgb(0x7a4a2c), rgb(0x5c3722), wear), paintLoss(x, y, size, 7003, 1.0) * 0.85);

    // Four stencil glyph slots across the middle band of the tile. Each is a
    // blocky bar figure - it has to read as "a number" at range, not as a number.
    const v = y / size;
    if (v > 0.3 && v < 0.68) {
      const slot = (x / size) * 4;
      const gi = Math.floor(slot);
      const fu = ((slot % 1) - 0.5) * 2.1;
      const fv = ((v - 0.3) / 0.38 - 0.5) * 2.1;
      const seedG = hash1(gi * 17, 41, 7007);
      const bar = (yy: number): boolean => Math.abs(fv - yy) < 0.22 && Math.abs(fu) < 0.55;
      const stem = (xx: number, lo: number, hi: number): boolean => Math.abs(fu - xx) < 0.2 && fv > lo && fv < hi;
      const on =
        (seedG > 0.15 && bar(-0.78)) ||
        (seedG > 0.45 && bar(0)) ||
        (seedG > 0.1 && bar(0.78)) ||
        (seedG > 0.3 && stem(-0.46, -0.85, 0.05)) ||
        (seedG < 0.7 && stem(0.46, -0.85, 0.05)) ||
        (seedG > 0.55 && stem(-0.46, -0.05, 0.85)) ||
        (seedG < 0.85 && stem(0.46, -0.05, 0.85));
      // Stencil bridges: the gaps a real stencil leaves in every stroke.
      const bridge = Math.abs(((fv * 3) % 1) - 0.5) < 0.08 || Math.abs(((fu * 3) % 1) - 0.5) < 0.08;
      if (on && !bridge) base = mix(base, rgb(0xd0cbb8), 0.78 - wear * 0.3);
    }
    return shade(base, grime(x, y, size, 7011, 0.5));
  });

export const HAZARD_TILE = 0.75;

/**
 * A hazard chevron band: the yellow-black diagonal painted on anything that can
 * crush, close or electrocute. In this building that is most of the Ward.
 */
export const hazardBand = (): THREE.Texture =>
  colorTexture('prison.hazard', SIZE, (x, y, size) => {
    const s = ((x + y) / size) * 4;
    const black = s % 1 < 0.5;
    const wear = n2(x, y, size, 14, 7101, 3);
    let base = black ? mix(rgb(0x33322c), rgb(0x44433c), wear) : mix(rgb(0x8a7822), rgb(0x9c8a30), wear);
    base = mix(base, rgb(0x6c6a60), paintLoss(x, y, size, 7103, 1.1) * 0.85);
    return shade(base, grime(x, y, size, 7107, 0.5));
  });

export const CARD_TILE = 0.95;

/**
 * A wall of index cards: the records office, and the ledger boards in the Ward.
 * A grid of pale rectangles with a written line on each, which at reading
 * distance is the single fastest way to say "everything about you is in here".
 */
export const indexCards = (): THREE.Texture =>
  colorTexture('prison.cards', SIZE, (x, y, size) => {
    const cols = 5;
    const rows = 9;
    const u = (x / size) * cols;
    const v = (y / size) * rows;
    const gap = Math.max(Math.abs((u % 1) - 0.5), Math.abs((v % 1) - 0.5)) > 0.45 ? 1 : 0;
    const id = hash1(Math.floor(u) * 47 + Math.floor(v) * 13, 271, 7201);
    const age = n2(x, y, size, 16, 7203, 3);

    if (gap) return shade(mix(rgb(0x3b3830), rgb(0x4a463c), age), 0.9);
    // Card stock, foxed unevenly, with a few pulled out.
    let base = mix(rgb(0xb6ae96), rgb(0xa39a80), id * 0.7 + age * 0.3);
    if (id > 0.94) base = mix(base, rgb(0x413d34), 0.85);
    // Two ruled lines and a scrawl on each, as bands of a darker value.
    const fv = v % 1;
    if (Math.abs(fv - 0.36) < 0.035) base = mix(base, rgb(0x6d6752), 0.55);
    if (Math.abs(fv - 0.66) < 0.035) base = mix(base, rgb(0x6d6752), 0.55);
    const ink = Math.max(0, n2s(x, y, size, 60, 22, 7207, 2) - 0.5) * 2.6;
    if (fv > 0.2 && fv < 0.8) base = mix(base, rgb(0x3e3a30), Math.min(0.8, ink) * (id > 0.3 ? 0.9 : 0.3));
    // A red diagonal across about one card in eight: the ones that were closed.
    if (id > 0.82 && Math.abs((u % 1) - (v % 1)) < 0.06) base = mix(base, rgb(0x8e3226), 0.7);
    return shade(base, grime(x, y, size, 7211, 0.45));
  });

/**
 * An x-ray on a light box: the Ward's one genuinely lit picture, and it has to
 * read as a chest at four metres. Authored in 0..1, so it goes on a plane at
 * whatever size the fitting is.
 */
export const xrayFilm = (): THREE.Texture =>
  colorTexture('prison.xray', 128, (x, y, size) => {
    const u = x / size;
    // `v` from the TOP: the skull end is up. A DataTexture is not flipped,
    // so the raw row index runs upward and every picture in this file turns it
    // over once, here, rather than inverting a dozen constants further down.
    const v = 1 - y / size;
    const grain = n2(x, y, size, 40, 7301, 2);
    // The film base: bright at the edges (nothing in the way), dark in the middle.
    let k = 0.9;
    const torso = Math.hypot((u - 0.5) / 0.36, (v - 0.52) / 0.42);
    k -= Math.max(0, 1 - torso) * 0.55;
    // The spine: a column of denser blocks down the middle.
    const spine = Math.max(0, 1 - Math.abs(u - 0.5) / 0.055) * Math.max(0, 1 - Math.abs(v - 0.52) / 0.44);
    k += spine * 0.42 * (0.6 + 0.4 * Math.abs(Math.sin(v * 42)));
    // Ribs: arcs sweeping down and out from the spine, both sides.
    const rib = Math.abs(Math.sin((v * 13 + Math.pow(Math.abs(u - 0.5) * 2.6, 1.5) * 3.4) * Math.PI));
    if (torso < 1) k += Math.max(0, rib - 0.86) * 2.4 * Math.min(1, (1 - torso) * 3);
    // And the thing that is not anatomy: a bright foreign object, low and left.
    const object = Math.max(0, 1 - Math.hypot((u - 0.37) / 0.05, (v - 0.34) / 0.075));
    k += Math.pow(object, 0.5) * 0.75;
    k = Math.max(0, Math.min(1, k * (0.92 + grain * 0.16)));
    // A cold blue-grey ramp, never neutral: an x-ray box is the coldest light here.
    return mix(rgb(0x0c1218), rgb(0xd4e4ee), k);
  });

export const PAPER_TILE = 0.7;

/**
 * A ledger page or a wall of pinned notes: an unlit paper picture for anything
 * that has to read as writing without art having access to text.
 */
export const ledgerPaper = (): THREE.Texture =>
  colorTexture('prison.paper', SIZE, (x, y, size) => {
    const age = n2(x, y, size, 9, 7401, 4);
    let base = mix(rgb(0xa8a08a), rgb(0xb8b09a), age);
    base = mix(base, rgb(0x8a7c60), Math.max(0, n2(x, y, size, 3.5, 7403, 4) - 0.5) * 2.2);
    // Ruled lines and a column rule.
    const line = Math.abs((((y / size) * 22) % 1) - 0.5) > 0.44 ? 1 : 0;
    base = mix(base, rgb(0x8a8a94), line * 0.35);
    if (Math.abs(x / size - 0.24) < 0.004) base = mix(base, rgb(0x9a4a3a), 0.6);
    // Handwriting: short broken runs on the lines, not a continuous scribble.
    const rowY = Math.floor((y / size) * 22);
    const filled = hash1(rowY * 7, 53, 7407) > 0.24;
    const ink = Math.max(0, n2s(x, y, size, 70, 26, 7409, 2) - 0.48) * 2.4;
    if (filled && Math.abs((((y / size) * 22) % 1) - 0.32) < 0.18 && x / size > 0.28) {
      base = mix(base, rgb(0x3a3630), Math.min(0.85, ink));
    }
    return shade(base, grime(x, y, size, 7411, 0.4));
  });

export const TALLY_TILE = 0.85;

/**
 * Tally marks scratched into a wall: the one texture in the pack that is about a
 * person rather than about a building. It goes on the cell walls, inside the
 * padded room, and on the back of the gallows door.
 */
function tallyCut(x: number, y: number, size: number): { cut: number; burr: number } {
  const bands = 5;
  const v = (y / size) * bands;
  const row = Math.floor(v);
  const fv = ((v % 1) - 0.5) * 2;
  const groups = 7;
  const u = (x / size) * groups;
  const gi = Math.floor(u);
  const fu = ((u % 1) - 0.5) * 2;
  const density = hash1(row * 31 + gi * 11, 97, 7507);
  if (density <= 0.18 || Math.abs(fv) > 0.62) return { cut: 0, burr: 0 };
  const stroke = Math.abs(((fu * 2.6) % 1) - 0.5) < 0.09 && fu > -0.85 && fu < 0.45;
  const slash = density > 0.62 && Math.abs(fu * 0.9 - fv * 0.5) < 0.07 && Math.abs(fu) < 0.75;
  const cut = stroke || slash ? 1 : 0;
  const burr = cut ? Math.max(0, 1 - Math.abs(((fu * 2.6) % 1) - 0.62) / 0.05) : 0;
  return { cut, burr };
}

export const tallyMarks = (): THREE.Texture =>
  colorTexture('prison.tally', SIZE, (x, y, size) => {
    const { joint } = blockAt(x, y, size);
    const grain = n2(x, y, size, 30, 7501, 3);
    let base = mix(rgb(0x8d8977), rgb(0x9c9782), grain * 0.8);
    base = mix(base, mix(rgb(0x6b6a66), rgb(0x585751), grain), paintLoss(x, y, size, 7503, 0.7));

    // A scratch is a dark line with a pale burr on one side of it.
    const { cut, burr } = tallyCut(x, y, size);
    base = mix(base, rgb(0x4b483f), cut * 0.8);
    base = mix(base, rgb(0xb8b3a0), burr * 0.4);
    base = mix(base, rgb(0x6a675c), joint * 0.6);
    return shade(base, grime(x, y, size, 7511, 0.5));
  });

export const tallyMarksNormal = (): THREE.Texture =>
  normalTexture('prison.tallyN', SIZE, (x, y, size) => {
    const { joint } = blockAt(x, y, size);
    return 0.55 - tallyCut(x, y, size).cut * 0.4 - joint * 0.4;
  }, 2.0);

/* --- what is behind a port ------------------------------------------------------- */

/**
 * The airing court at night, hung behind a barred window.
 *
 * A wall is a wall and the room beyond it is not drawn, so every window in this
 * game needs its own backdrop (docs/art/ROOM_FORMAT.md §7). This is the one view
 * out of the building in the whole pack, and it is deliberately not a way out:
 * a yard, a wall too high to see over, wire above that, and a tower with a light
 * in it that is looking somewhere else.
 */
export const yardBackdrop = (): THREE.Texture =>
  colorTexture('prison.yard', SIZE, (x, y, size) => {
    const u = x / size;
    // `v` from the TOP: the sky is at the top of the picture. A DataTexture is not flipped,
    // so the raw row index runs upward and every picture in this file turns it
    // over once, here, rather than inverting a dozen constants further down.
    const v = 1 - y / size;
    const grain = n2(x, y, size, 12, 7601, 3);

    // v runs 0 at the TOP of the picture: sky first.
    const skyline = 0.46;
    if (v < skyline) {
      // Overcast night, a shade lighter toward the horizon, with the moon behind
      // it as a diffuse patch rather than a disc.
      let sky = mix(rgb(0x28364c), rgb(0x435469), Math.pow(v / skyline, 1.4));
      const cloud = n2s(x, y, size, 3, 2, 7603, 4);
      sky = mix(sky, rgb(0x54637a), Math.max(0, cloud - 0.42) * 1.4);
      // A window shows the middle of its backdrop and nothing else. The picture
      // overhangs the opening by a good half metre either side so it does not
      // come apart when a player moves, which means anything composed out at the
      // edges is simply never seen: the moon and the tower were at u 0.7 and 0.84
      // on the first pass and both of them were behind the masonry.
      const moon = Math.max(0, 1 - Math.hypot((u - 0.61) / 0.14, (v - 0.15) / 0.12));
      sky = mix(sky, rgb(0xbccada), Math.pow(moon, 1.4) * 0.9);
      // The tower: a black block with one lit slot in it, left of centre.
      if (u > 0.34 && u < 0.44 && v > 0.1) {
        if (u > 0.355 && u < 0.425 && v > 0.17 && v < 0.25) return rgb(0xb0994c);
        return shade(mix(rgb(0x11151c), rgb(0x1a1f28), grain), 0.9);
      }
      return sky;
    }

    // The perimeter wall: a dark band with a coping and a run of wire on top.
    const wallTop = skyline;
    const wallBottom = 0.78;
    if (v < wallBottom) {
      const down = (v - wallTop) / (wallBottom - wallTop);
      let wall = mix(rgb(0x2a2c2e), rgb(0x191b1e), Math.pow(down, 0.6));
      if (down < 0.05) wall = mix(wall, rgb(0x555c62), 0.7);
      if (Math.abs(((u * 9) % 1) - 0.5) < 0.02 && down < 0.9) wall = mix(wall, rgb(0x101215), 0.6);
      return mix(wall, rgb(0x3c4148), grain * 0.25);
    }

    // The yard itself, running away from the viewer and lit by nothing much.
    const near = (v - wallBottom) / (1 - wallBottom);
    let ground = mix(rgb(0x24262a), rgb(0x35373a), Math.pow(near, 0.8));
    ground = mix(ground, rgb(0x3f4146), Math.max(0, n2(x, y, size, 8, 7607, 3) - 0.5) * 1.6);
    // Standing water catching the sky. The one bright thing at ground level.
    const pool = Math.max(0, n2s(x, y, size, 4, 9, 7609, 3) - 0.58) * 3;
    return mix(ground, rgb(0x4a5666), Math.min(0.8, pool));
  });

/**
 * The inside of an unlit cell, hung behind a judas hatch. Nothing but a bunk
 * frame, a slot of grey where its own window is, and a shape on the bunk that
 * you cannot resolve and that is not, on inspection, quite the right size.
 */
export const cellBackdrop = (): THREE.Texture =>
  colorTexture('prison.cellback', 128, (x, y, size) => {
    const u = x / size;
    // `v` from the TOP: the window is high in the wall. A DataTexture is not flipped,
    // so the raw row index runs upward and every picture in this file turns it
    // over once, here, rather than inverting a dozen constants further down.
    const v = 1 - y / size;
    const grain = n2(x, y, size, 14, 7701, 3);
    let base = shade(mix(rgb(0x1c1d1e), rgb(0x2a2b29), grain), 0.9);

    // The far window: a bright vertical slot, high and right.
    if (u > 0.66 && u < 0.78 && v > 0.12 && v < 0.44) {
      const bar = Math.abs(((v * 9) % 1) - 0.5) < 0.14 ? 1 : 0;
      return mix(rgb(0x515c66), rgb(0x14161a), bar);
    }
    base = mix(base, rgb(0x3c3e3c), Math.max(0, 1 - Math.hypot(u - 0.72, v - 0.3) / 0.5) * 0.5);
    // The bunk: a horizontal band across the lower half.
    if (v > 0.6 && v < 0.72) base = mix(base, rgb(0x33342f), 0.7);
    if (v > 0.55 && v < 0.62 && u > 0.14 && u < 0.86) {
      // The shape on it. Longer than a person, and the wrong proportions.
      const along = (u - 0.14) / 0.72;
      if (v < 0.62 - 0.05 * Math.sin(along * Math.PI)) base = mix(base, rgb(0x46443c), 0.75);
    }
    return base;
  });

/**
 * The observation cell, seen through one-way glass: the ONE lit picture in the
 * pack and the only place a player sees the Ward doing its job. A white room, a
 * chair bolted to the floor, and a figure in it whose head is turned toward the
 * glass it cannot see through.
 */
export const observedBackdrop = (): THREE.Texture =>
  colorTexture('prison.observed', SIZE, (x, y, size) => {
    const u = x / size;
    // `v` from the TOP: the lamp is on the ceiling. A DataTexture is not flipped,
    // so the raw row index runs upward and every picture in this file turns it
    // over once, here, rather than inverting a dozen constants further down.
    const v = 1 - y / size;
    const grain = n2(x, y, size, 18, 7801, 3);

    // A tiled white room, lit hard from above. The vignette is what gives the
    // flat picture depth: bright under the lamp, falling off into the corners.
    const lamp = Math.max(0, 1 - Math.hypot((u - 0.5) / 0.75, (v - 0.2) / 0.6));
    let base = mix(rgb(0x2e3332), rgb(0xcfd2c4), Math.pow(lamp, 0.7));
    const grid = Math.max(Math.abs(((u * 14) % 1) - 0.5), Math.abs(((v * 12) % 1) - 0.5)) > 0.455 ? 1 : 0;
    if (v < 0.68) base = mix(base, rgb(0x5e625a), grid * 0.4);
    if (Math.abs(v - 0.68) < 0.006) base = mix(base, rgb(0x3e423c), 0.7);
    if (v > 0.68) base = shade(mix(base, rgb(0x8a8e84), 0.4), 0.85);
    base = shade(base, 0.94 + grain * 0.12);

    // The chair: bolted down, dead centre, with a shadow under it.
    const chairX = Math.abs(u - 0.5);
    if (v > 0.5 && v < 0.86 && chairX < 0.075) base = mix(base, rgb(0x191a18), 0.92);
    if (v > 0.82 && v < 0.9 && chairX < 0.13) base = mix(base, rgb(0x1e201d), 0.7);

    // The figure. Not a rectangle: a round head, shoulders wider than the waist,
    // and it stops at the seat. What makes a silhouette read as a person is the
    // shape of the negative space (docs/art/ROOM_REVIEW.md).
    if (Math.hypot((u - 0.5) / 0.045, (v - 0.33) / 0.05) < 1) base = mix(base, rgb(0x1e1c1a), 0.95);
    if (v > 0.41 && v < 0.62) {
      const t = (v - 0.41) / 0.21;
      const halfW = 0.03 + Math.pow(t, 0.45) * 0.085;
      if (chairX < halfW) base = mix(base, rgb(0x24221e), 0.94);
    }
    // The one bright mark: light catching the side of the face, turned this way.
    // It is what makes the figure read as looking rather than as sitting.
    if (Math.hypot((u - 0.474) / 0.014, (v - 0.335) / 0.02) < 1) base = mix(base, rgb(0xb8ac96), 0.8);
    return base;
  });

/**
 * The chapel window: a stained light that is not about salvation.
 *
 * Three lancets, a leaded quarry ground, and one figure per light. It is the
 * only saturated colour in the Blocks, and it is UNLIT - a picture, so it
 * survives being in the dark and never turns into the room's light source.
 */
export const stainedGlass = (): THREE.Texture =>
  colorTexture('prison.stained', SIZE, (x, y, size) => {
    const u = x / size;
    // `v` from the TOP: the arch is at the head of the light. A DataTexture is not flipped,
    // so the raw row index runs upward and every picture in this file turns it
    // over once, here, rather than inverting a dozen constants further down.
    const v = 1 - y / size;

    // Three lancets with stone mullions between them, and a head to each.
    const lancet = Math.floor(u * 3);
    const lu = (u * 3) % 1;
    const arch = 0.16 + Math.pow(Math.abs(lu - 0.5) * 2, 2.2) * 0.12;
    if (lu < 0.07 || lu > 0.93 || v < arch || v > 0.965) {
      return shade(mix(rgb(0x4a4740), rgb(0x5c584e), n2(x, y, size, 20, 7901, 3)), 0.9);
    }

    // The lead: a diamond quarry ground behind everything.
    const q = 14;
    const du = lu * q + v * q * 0.9;
    const dv = lu * q - v * q * 0.9;
    const lead = Math.min(Math.abs((du % 1) - 0.5), Math.abs((dv % 1) - 0.5)) < 0.075 ? 1 : 0;

    // The ground: a cold blue-green quarry, which is what the outside looks like.
    const tint = hash1(Math.floor(du) * 13 + Math.floor(dv) * 29, 71, 7903);
    let glass = mix(rgb(0x2a4a54), rgb(0x36616a), tint);

    // The figure in each light. Robed, hands together, no face - a head that is a
    // plain oval of pale glass reads far better at this size than any attempt at
    // features, and it is more frightening for it.
    const fx = (lu - 0.5) * 2;
    if (v > 0.34 && v < 0.9 && Math.abs(fx) < 0.28 + (v - 0.34) * 0.5) {
      const robe = lancet === 1 ? rgb(0x8e2a24) : lancet === 0 ? rgb(0x2c4a86) : rgb(0x4a6a2c);
      glass = mix(glass, robe, 0.92);
      glass = mix(glass, rgb(0xc4a45c), Math.max(0, Math.sin(fx * 9 + v * 3) - 0.6) * 1.6);
    }
    const headY = 0.29;
    if (Math.hypot(fx / 0.15, (v - headY) / 0.055) < 1) glass = mix(rgb(0xd8c898), rgb(0xbca878), tint);
    if (lancet === 1 && Math.abs(Math.hypot(fx / 0.28, (v - headY) / 0.105) - 1) < 0.16) glass = rgb(0xc09a3c);

    // The one thing that is not iconography: each figure holds something, and in
    // the middle light it is a rope with a loop in the end of it.
    if (lancet === 1) {
      const ry = v - 0.5;
      const rope = Math.abs(fx - 0.02 - Math.sin(ry * 6) * 0.06) < 0.035 && v > 0.44 && v < 0.72;
      const loop = Math.abs(Math.hypot(fx / 0.1, (v - 0.78) / 0.075) - 1) < 0.28;
      if (rope || loop) glass = rgb(0xd4b06c);
    } else {
      const ky = v - 0.62;
      if (Math.abs(fx - 0.16) < 0.03 && Math.abs(ky) < 0.14) glass = rgb(0xc8a24c);
      if (Math.abs(Math.hypot((fx - 0.16) / 0.055, (ky + 0.16) / 0.05) - 1) < 0.35) glass = rgb(0xc8a24c);
    }

    // Cracked and boarded panes: about one quarry in twenty is gone to black.
    if (tint > 0.955) glass = rgb(0x14161a);
    return mix(glass, rgb(0x1a1c1e), lead * 0.85);
  });

/**
 * What is behind a barred vent or a grating: a dark shaft with a long way down
 * it, and just enough structure that the eye reads depth rather than a black
 * rectangle.
 */
export const shaftBackdrop = (): THREE.Texture =>
  colorTexture('prison.shaft', 128, (x, y, size) => {
    const u = x / size;
    // `v` from the TOP: the shaft goes down. A DataTexture is not flipped,
    // so the raw row index runs upward and every picture in this file turns it
    // over once, here, rather than inverting a dozen constants further down.
    const v = 1 - y / size;
    const grain = n2(x, y, size, 10, 8001, 3);
    const throat = 0.5 - v * 0.1;
    const du = Math.abs(u - 0.5);
    if (du > throat) {
      const away = Math.min(1, (du - throat) * 3.2);
      return shade(mix(rgb(0x22242a), rgb(0x3a3d42), away * grain), 0.85);
    }
    let deep = mix(rgb(0x0e1013), rgb(0x1c2026), Math.pow(1 - v, 0.7) * 0.6);
    // Two brackets crossing it, at different depths, catching a little light.
    for (const [by, k] of [[0.3, 0.5], [0.66, 0.28]] as const) {
      if (Math.abs(v - by) < 0.02) deep = mix(deep, rgb(0x4a4d52), k);
    }
    return deep;
  });

/* --- masks: light, not surface --------------------------------------------------- */

/**
 * The radial falloff every wash in the pack carries as its `map`.
 *
 * Additive fixes the dark background; it does nothing about the EDGE. A flat
 * disc of colour ends on a hard circle wherever you stop it, and a wash without
 * a mask reads as a pancake of paint however faint you make it
 * (docs/art/ROOM_REVIEW.md - the Vulcan's Anvil pass).
 */
export const radialFalloff = (): THREE.Texture =>
  colorTexture('prison.falloff', 128, (x, y, size) => {
    const d = Math.hypot(x / size - 0.5, y / size - 0.5) * 2;
    const v = Math.pow(Math.max(0, 1 - d), 2.1);
    const n = 0.84 + n2(x, y, size, 5, 8101, 3) * 0.32;
    const k = clamp255(v * n * 255);
    return [k, k, k];
  });

/** A plume: soft at the sides, thinning as it rises, with structure in it. */
export const plumeFade = (): THREE.Texture =>
  colorTexture('prison.plume', 128, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const side = Math.pow(Math.max(0, 1 - (Math.abs(u - 0.5) * 2) / (0.55 + v * 0.45)), 1.7);
    const rise = Math.pow(Math.max(0, 1 - v), 1.25) * Math.min(1, v * 6);
    const churn = 0.55 + fbm(u * 4, v * 3 - v * 2, 4, 3, 8107, 4) * 0.9;
    const k = clamp255(side * rise * churn * 255);
    return [k, k, k];
  });

/**
 * A bar-shadow gobo: the pattern a caged lamp throws through a gate.
 *
 * Barred light on a floor is the single most recognisable image in this genre,
 * and the map cannot afford a shadow-casting lamp in every room to make it - so
 * it is painted: an additive quad carrying this, laid where the light would
 * fall. Soft at both ends, so it does not end on a rectangle.
 */
export const barGobo = (): THREE.Texture =>
  colorTexture('prison.gobo', 128, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    // Bars running across, spreading slightly as they go - a projection does.
    const spread = 0.7 + v * 0.5;
    const bars = Math.abs(((((u - 0.5) / spread + 0.5) * 7) % 1) - 0.5);
    const lit = Math.pow(Math.max(0, (bars - 0.16) / 0.34), 0.7);
    const alongFade = Math.pow(Math.max(0, 1 - Math.abs(v - 0.42) / 0.55), 1.6);
    const sideFade = Math.pow(Math.max(0, 1 - Math.abs(u - 0.5) * 2), 0.9);
    const k = clamp255(lit * alongFade * sideFade * 255);
    return [k, k, k];
  });

/* --- shared art: skins authored in 0..1 UV --------------------------------------- */

/**
 * Shared art is NOT batched, so a door leaf carries ONE UV repeat over the whole
 * leaf and a tiling map smears across it into a blank slab
 * (docs/art/SHARED_ART.md §3.1). These four are therefore composed AS the thing:
 * a door with a hatch and a lock in the right places, a locker with a vent, a
 * trunk with straps.
 */
export const cellDoorSkin = (): THREE.Texture =>
  colorTexture('prison.doorSkin', SIZE, (x, y, size) => {
    const u = x / size;
    // `v` from the TOP: the judas hatch is at eye height. A DataTexture is not flipped,
    // so the raw row index runs upward and every picture in this file turns it
    // over once, here, rather than inverting a dozen constants further down.
    const v = 1 - y / size;
    const wear = n2s(x, y, size, 8, 5, 8201, 3);
    let base = mix(rgb(0x4c5a4d), rgb(0x5b6a59), wear * 0.9);
    // Rust up from the bottom rail and out from the hinge side.
    const rustMask = Math.min(1, Math.pow(v, 2.4) * 1.6 + Math.pow(Math.max(0, u - 0.86) / 0.14, 2) * 0.8);
    base = mix(base, mix(rgb(0x7d4a2c), rgb(0x5a3524), wear), Math.min(0.85, rustMask * (0.4 + paintLoss(x, y, size, 8203, 1.3))));

    // A raised border and a centre rail: the leaf is a frame with two panels.
    const border = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v));
    if (border < 0.055) base = mix(base, rgb(0x63715f), 0.5);
    if (Math.abs(v - 0.52) < 0.028) base = mix(base, rgb(0x63715f), 0.5);

    // The judas hatch: a small dark square, high, with a hinged flap over it.
    if (Math.abs(u - 0.5) < 0.13 && v > 0.2 && v < 0.34) {
      const inner = Math.abs(u - 0.5) < 0.1 && v > 0.225 && v < 0.315;
      return inner ? rgb(0x121415) : mix(rgb(0x6d7a68), rgb(0x8a5a38), wear * 0.5);
    }
    // The feeding hatch: a wider flap at waist height, with two hinges.
    if (Math.abs(u - 0.5) < 0.22 && v > 0.58 && v < 0.72) {
      if (Math.abs(v - 0.58) < 0.012 || Math.abs(v - 0.72) < 0.012) return rgb(0x333a32);
      if (v > 0.7 && Math.abs(((u * 6) % 1) - 0.5) < 0.16) return rgb(0x333a32);
      return mix(mix(rgb(0x5a6858), rgb(0x6b7a66), wear), rgb(0x7d4a2c), Math.max(0, wear - 0.6) * 1.6);
    }
    // The lock case, on the closing side, and the plate over it.
    if (u > 0.7 && u < 0.9 && v > 0.42 && v < 0.62) {
      return mix(rgb(0x6e7568), rgb(0x8a8f80), Math.max(0, 1 - Math.hypot(u - 0.8, v - 0.52) / 0.09) * 0.7);
    }
    // A stencilled number plate near the top.
    if (Math.abs(u - 0.5) < 0.16 && v > 0.08 && v < 0.16) {
      const glyph = Math.abs(((u * 22) % 1) - 0.5) < 0.22 && Math.abs(v - 0.12) < 0.026;
      return glyph ? rgb(0xc8c2ac) : rgb(0x3d4a3c);
    }
    return shade(base, grime(x, y, size, 8207, 0.5));
  });

export const cellDoorNormal = (): THREE.Texture =>
  normalTexture('prison.doorSkinN', SIZE, (x, y, size) => {
    const u = x / size;
    // `v` from the TOP: matches the skin above. A DataTexture is not flipped,
    // so the raw row index runs upward and every picture in this file turns it
    // over once, here, rather than inverting a dozen constants further down.
    const v = 1 - y / size;
    const border = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v));
    let h = border < 0.055 ? 0.75 : 0.5;
    if (Math.abs(v - 0.52) < 0.028) h = 0.75;
    if (Math.abs(u - 0.5) < 0.13 && v > 0.2 && v < 0.34) h = 0.3;
    if (Math.abs(u - 0.5) < 0.22 && v > 0.58 && v < 0.72) h = 0.62;
    if (u > 0.7 && u < 0.9 && v > 0.42 && v < 0.62) h = 0.9;
    return h + n2(x, y, size, 30, 8201, 2) * 0.1;
  }, 2.4);

/**
 * The way out. Everything else in this building is green or white; the gate out
 * is the only thing painted red, and the only surface with daylight under it.
 */
export const exitGateSkin = (): THREE.Texture =>
  colorTexture('prison.exitSkin', SIZE, (x, y, size) => {
    const u = x / size;
    // `v` from the TOP: the daylight is under the leaf. A DataTexture is not flipped,
    // so the raw row index runs upward and every picture in this file turns it
    // over once, here, rather than inverting a dozen constants further down.
    const v = 1 - y / size;
    const wear = n2s(x, y, size, 8, 5, 8301, 3);
    let base = mix(rgb(0x8e3a2c), rgb(0xa04a34), wear * 0.9);
    base = mix(base, mix(rgb(0x7d4a2c), rgb(0x50402e), wear), paintLoss(x, y, size, 8303, 0.9) * 0.7);
    const border = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v));
    if (border < 0.06) base = mix(base, rgb(0xb05a3c), 0.5);
    // A wide chevron band across the middle: the only hazard marking in the map
    // that means something good.
    if (Math.abs(v - 0.5) < 0.11) {
      const s = ((u + v) * 9) % 1;
      base = s < 0.5 ? mix(rgb(0x2e2c26), rgb(0x3c3a32), wear) : mix(rgb(0xb8a238), rgb(0xcfb84a), wear);
    }
    // The gap at the bottom of the leaf, with daylight under it.
    if (v > 0.955) base = mix(rgb(0xa8c0c8), rgb(0x7e949c), wear);
    // Two grab bars, vertical, on the closing side.
    if (u > 0.72 && u < 0.79 && v > 0.34 && v < 0.68) base = rgb(0x8a9096);
    return shade(base, grime(x, y, size, 8307, 0.4));
  });

/** A property trunk: canvas over ply, two straps, a number stencilled on the lid. */
export const trunkSkin = (): THREE.Texture =>
  colorTexture('prison.trunkSkin', SIZE, (x, y, size) => {
    const u = x / size;
    const v = y / size;
    const weave = n2s(x, y, size, 70, 70, 8401, 2);
    let base = mix(rgb(0x6d6350), rgb(0x7c7259), weave);
    base = mix(base, rgb(0x584e40), Math.max(0, n2(x, y, size, 4, 8403, 4) - 0.5) * 2.0);
    // Two leather straps running one way, with buckles.
    for (const sx of [0.28, 0.72]) {
      if (Math.abs(u - sx) < 0.055) {
        base = mix(rgb(0x4a3a2c), rgb(0x5c4a36), weave);
        if (Math.abs(v - 0.5) < 0.06) base = rgb(0x8a7a4a);
      }
    }
    if (Math.min(u, 1 - u) < 0.1 && Math.min(v, 1 - v) < 0.1) base = mix(base, rgb(0x6a6458), 0.6);
    // A stencil block, off centre.
    if (u > 0.38 && u < 0.62 && v > 0.24 && v < 0.33 && Math.abs(((u * 16) % 1) - 0.5) < 0.24) {
      base = mix(base, rgb(0xc0b89c), 0.75);
    }
    return shade(base, grime(x, y, size, 8407, 0.5));
  });

/** A staff locker: enamelled steel, a louvred vent, a card holder and a hasp. */
export const lockerSkin = (): THREE.Texture =>
  colorTexture('prison.lockerSkin', SIZE, (x, y, size) => {
    const u = x / size;
    // `v` from the TOP: the louvre is above the card holder. A DataTexture is not flipped,
    // so the raw row index runs upward and every picture in this file turns it
    // over once, here, rather than inverting a dozen constants further down.
    const v = 1 - y / size;
    const wear = n2s(x, y, size, 7, 4, 8501, 3);
    let base = mix(rgb(0x5d6a5b), rgb(0x6d7a68), wear * 0.9);
    base = mix(base, mix(rgb(0x7d4a2c), rgb(0x5a3524), wear), paintLoss(x, y, size, 8503, 1.0) * 0.8);
    const border = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v));
    if (border < 0.05) base = mix(base, rgb(0x74836f), 0.5);
    // The louvre stack, upper third, and a smaller one near the floor.
    for (const [lo, hi, halfW] of [[0.1, 0.3, 0.24], [0.86, 0.94, 0.18]] as const) {
      if (v > lo && v < hi && Math.abs(u - 0.5) < halfW) {
        const slat = ((v - lo) * 26) % 1;
        return slat < 0.45 ? rgb(0x1a1d1b) : mix(rgb(0x7a8874), rgb(0x8e9c88), wear);
      }
    }
    // The hasp and staple on the closing side, and a card holder.
    if (u > 0.8 && u < 0.92 && Math.abs(v - 0.5) < 0.07) base = rgb(0x8e948a);
    if (Math.abs(u - 0.5) < 0.11 && v > 0.38 && v < 0.46) base = mix(rgb(0xaaa48c), rgb(0x8e8a72), wear);
    return shade(base, grime(x, y, size, 8507, 0.5));
  });

/** Unused re-export guard: keeps `RGB` referenced for the helpers above. */
export type { RGB };
