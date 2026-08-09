/**
 * Ravenhollow's furniture kit.
 *
 * These are the pieces that recur across rooms - the things that make a space
 * read as "the family lived here and then stopped". Rooms compose them; almost
 * nothing is modelled twice.
 *
 * **Facing convention.** Every prop is authored facing `-Z`, the same direction
 * shared art faces (docs/art/SHARED_ART.md §2), so one set of wall rotations
 * works for props, chests and lockers alike. `wallPose()` gives you the position
 * and rotation for something standing against a given wall.
 *
 * Everything writes into the room's batcher, so a room can afford a hundred of
 * these and still cost single-digit draw calls.
 */
import * as THREE from 'three';
import { ownGeometryCache } from '../../../lib/build';
import type { Cell, Side } from '../../../lib/contract';
import type { BatchOptions } from '../../../lib/merge';
import { poseMatrix, subUV, tiltMatrix } from '../../../lib/merge';
import type { Room, Vec3 } from '../rooms/common';

/**
 * Anything that lives inside its own light source. A candle two centimetres from
 * a point light casts a shadow the length of the room, which reads as a black bar
 * across the floor rather than as a candle.
 */
const NO_SHADOW: BatchOptions = { castShadow: false };

/** Rotation that turns a `-Z`-facing prop to face into the room off this wall. */
export const FACE: Record<Side, number> = {
  north: Math.PI,
  east: Math.PI / 2,
  south: 0,
  west: -Math.PI / 2,
};

const INWARD: Record<Side, readonly [number, number]> = {
  north: [0, 1],
  east: [-1, 0],
  south: [0, -1],
  west: [1, 0],
};

/**
 * Where to put something standing against `side`, `along` metres from the wall's
 * centre (along the prop's own local +X) and `inset` metres out from the plaster.
 */
export function wallPose(
  room: Room,
  side: Side,
  along: number,
  inset: number,
  cell: Cell = [0, 0],
): { position: Vec3; rotationY: number } {
  const { cellSize, wallThickness } = room.ctx.dims;
  const rotationY = FACE[side];
  const face = cellSize / 2 - wallThickness;
  const cx = cell[0] * cellSize;
  const cz = cell[1] * cellSize;

  const inward = INWARD[side];
  const wallX = cx - inward[0] * face;
  const wallZ = cz - inward[1] * face;
  const tangent: readonly [number, number] = [Math.cos(rotationY), -Math.sin(rotationY)];

  return {
    position: [wallX + inward[0] * inset + tangent[0] * along, 0, wallZ + inward[1] * inset + tangent[1] * along],
    rotationY,
  };
}

/* --- geometry caches ----------------------------------------------------------- */

/**
 * Keyed by size, exactly like the box cache in `art/lib/build.ts`, and freed by
 * the same `clearGeometryCache()` when a world comes down - the sizes come from
 * the seeded RNG, so a new seed reuses almost nothing and these would otherwise
 * grow for as long as the tab is open. Register every cache added here.
 */
const cylCache = new Map<string, THREE.CylinderGeometry>();
function cyl(rTop: number, rBot: number, h: number, seg = 10): THREE.CylinderGeometry {
  const key = `${rTop},${rBot},${h},${seg}`;
  let geo = cylCache.get(key);
  if (!geo) {
    geo = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    cylCache.set(key, geo);
  }
  return geo;
}

const sphereCache = new Map<string, THREE.SphereGeometry>();
function ball(r: number, seg = 10): THREE.SphereGeometry {
  const key = `${r},${seg}`;
  let geo = sphereCache.get(key);
  if (!geo) {
    geo = new THREE.SphereGeometry(r, seg, Math.max(4, seg / 2));
    sphereCache.set(key, geo);
  }
  return geo;
}

const torusCache = new Map<string, THREE.TorusGeometry>();
function ring(r: number, tube: number, seg = 16): THREE.TorusGeometry {
  const key = `${r},${tube},${seg}`;
  let geo = torusCache.get(key);
  if (!geo) {
    geo = new THREE.TorusGeometry(r, tube, 6, seg);
    torusCache.set(key, geo);
  }
  return geo;
}

const planeCache = new Map<string, THREE.PlaneGeometry>();
function quad(w: number, h: number): THREE.PlaneGeometry {
  const key = `${w},${h}`;
  let geo = planeCache.get(key);
  if (!geo) {
    geo = new THREE.PlaneGeometry(w, h);
    planeCache.set(key, geo);
  }
  return geo;
}

for (const cache of [cylCache, sphereCache, torusCache, planeCache]) ownGeometryCache(cache);

/** Upright cylinder whose `y` is its bottom. */
function post(
  room: Room,
  material: string,
  rTop: number,
  rBot: number,
  h: number,
  p: Vec3,
  seg = 10,
  options: BatchOptions = {},
): void {
  room.geo(material, cyl(rTop, rBot, h, seg), poseMatrix([p[0], p[1] + h / 2, p[2]]), { tile: 0.6, ...options });
}

/* --- light sources ------------------------------------------------------------- */

/** A candle stub with a flame. No real light - it is the glow that sells it. */
export function candle(room: Room, p: Vec3, height = 0.2): void {
  post(room, 'wax', 0.021, 0.024, height, p, 6, NO_SHADOW);
  post(room, 'ash', 0.004, 0.004, 0.02, [p[0], p[1] + height, p[2]], 4, NO_SHADOW);
  room.geo('flame', cyl(0.001, 0.017, 0.075, 6), poseMatrix([p[0], p[1] + height + 0.05, p[2]]), NO_SHADOW);
}

/** Three candles of different ages, the way a real stub-end cluster looks. */
export function candleCluster(room: Room, p: Vec3): void {
  for (let i = 0; i < 3; i++) {
    candle(room, [p[0] + room.range(-0.07, 0.07), p[1], p[2] + room.range(-0.07, 0.07)], room.range(0.09, 0.24));
  }
}

/** Brass candelabrum: stem, spread arms, a candle on each. */
export function candelabra(room: Room, p: Vec3, arms = 3): void {
  post(room, 'brass', 0.02, 0.075, 0.34, p, 8);
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + 0.4;
    const r = 0.13;
    const x = p[0] + Math.cos(a) * r;
    const z = p[2] + Math.sin(a) * r;
    room.geo('brass', cyl(0.012, 0.012, r, 6), tiltMatrix([(p[0] + x) / 2, p[1] + 0.3, (p[2] + z) / 2], [0, -a, Math.PI / 2]));
    post(room, 'brass', 0.03, 0.02, 0.06, [x, p[1] + 0.3, z], 8);
    candle(room, [x, p[1] + 0.36, z], room.range(0.1, 0.22));
  }
  candle(room, [p[0], p[1] + 0.34, p[2]], 0.26);
}

/**
 * Wall sconce. `lit` spends one of the room's two real lights - a sconce is the
 * cheapest way to make a corridor navigable without a ceiling fixture.
 */
export function sconce(room: Room, side: Side, along: number, y = 1.95, lit = false, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.06, cell);
  const [x, , z] = position;
  const fwd: Vec3 = [-Math.sin(rotationY) * 0.14, 0, -Math.cos(rotationY) * 0.14];

  room.box('brass', [0.09, 0.34, 0.06], [x, y - 0.1, z], rotationY);
  room.geo('brass', cyl(0.055, 0.03, 0.09, 8), poseMatrix([x + fwd[0], y + 0.22, z + fwd[2]]));
  candle(room, [x + fwd[0], y + 0.26, z + fwd[2]], 0.16);
  room.geo('brass', ring(0.1, 0.012, 12), tiltMatrix([x + fwd[0] * 0.5, y + 0.34, z + fwd[2] * 0.5], [Math.PI / 2, rotationY, 0]));

  if (lit) {
    const lamp = new THREE.PointLight(0xffc98a, 9, 7.5, 2);
    lamp.position.set(x + fwd[0], y + 0.32, z + fwd[2]);
    room.light(lamp);
    flicker(room, lamp, 9, 0.16);
  }
}

/** Ceiling chandelier: chain, tiers of arms, candles, and one warm light. */
export function chandelier(
  room: Room,
  x: number,
  z: number,
  radius = 0.62,
  lit = true,
  tiers = 2,
  castShadow = true,
): void {
  const { ceilingHeight } = room.ctx.dims;
  // Low enough to feel oppressive, high enough that nobody walks into it.
  const hang = ceilingHeight - 0.88;

  // None of the fixture casts a shadow: the room's one shadow-casting light sits
  // inside it, so a shadow-casting stem or ring paints a hard black bar right
  // across the floor it is meant to be lighting.
  room.geo('brass', cyl(0.09, 0.14, 0.09, 10), poseMatrix([x, ceilingHeight - 0.05, z]), NO_SHADOW);
  post(room, 'brass', 0.014, 0.014, ceilingHeight - hang - 0.05, [x, hang, z], 6, NO_SHADOW);
  post(room, 'brass', 0.035, 0.05, 0.5, [x, hang - 0.28, z], 8, NO_SHADOW);
  room.geo('brass', ball(0.06, 8), poseMatrix([x, hang - 0.32, z]), NO_SHADOW);

  for (let t = 0; t < tiers; t++) {
    const r = radius * (1 - t * 0.32);
    const y = hang + t * 0.24;
    const count = 8 - t * 2;
    room.geo('brass', ring(r, 0.016, 20), poseMatrix([x, y, z]), NO_SHADOW);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + t * 0.4;
      const cx = x + Math.cos(a) * r;
      const cz = z + Math.sin(a) * r;
      post(room, 'brass', 0.028, 0.018, 0.05, [cx, y, cz], 6, NO_SHADOW);
      candle(room, [cx, y + 0.05, cz], room.range(0.1, 0.2));
      // Lustres: the little glass drops that catch what light there is.
      if (t === 0) room.geo('glass', ball(0.028, 6), poseMatrix([cx, y - 0.09, cz]), NO_SHADOW);
    }
  }

  if (lit) {
    const lamp = new THREE.PointLight(0xffd7a0, 26, room.ctx.dims.cellSize * 1.9, 2);
    lamp.position.set(x, hang + 0.1, z);
    // At most one shadow-casting light per room (ROOM_FORMAT.md §7), and the
    // manor is static - so render the shadow map once and stop paying for it.
    lamp.castShadow = castShadow;
    if (castShadow) {
      lamp.shadow.mapSize.set(512, 512);
      lamp.shadow.autoUpdate = false;
      lamp.shadow.needsUpdate = true;
    }
    room.light(lamp);
    flicker(room, lamp, 26, 0.07);
    sway(room, lamp, 0.02);
  }
}

/** Hanging oil lamp or gasolier - a smaller, meaner ceiling light. */
export function pendantLamp(room: Room, x: number, z: number, lit = true): void {
  const { ceilingHeight } = room.ctx.dims;
  const y = ceilingHeight - 0.85;
  room.geo('ironBlack', cyl(0.06, 0.06, 0.06, 8), poseMatrix([x, ceilingHeight - 0.03, z]));
  post(room, 'ironBlack', 0.008, 0.008, ceilingHeight - y - 0.03, [x, y, z], 5);
  room.geo('ironBlack', cyl(0.24, 0.06, 0.16, 12), poseMatrix([x, y - 0.02, z]));
  room.geo('bulb', ball(0.05, 8), poseMatrix([x, y - 0.11, z]));

  if (lit) {
    const lamp = new THREE.PointLight(0xffdca8, 15, room.ctx.dims.cellSize * 1.5, 2);
    lamp.position.set(x, y - 0.14, z);
    room.light(lamp);
    flicker(room, lamp, 15, 0.1);
  }
}

/**
 * A fireplace: surround, mantel, sooty firebox and - if `lit` - embers plus the
 * warmest light in the manor. Occupies 1.9 m of wall.
 */
export function fireplace(room: Room, side: Side, along: number, lit = true, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0, cell);
  const [x, , z] = position;
  const fwd = (d: number): Vec3 => [x - Math.sin(rotationY) * d, 0, z - Math.cos(rotationY) * d];
  const side3 = (s: number, d: number): Vec3 => {
    const f = fwd(d);
    return [f[0] + Math.cos(rotationY) * s, 0, f[2] - Math.sin(rotationY) * s];
  };

  // Marble surround.
  for (const s of [-0.78, 0.78]) {
    const p = side3(s, 0.16);
    room.solid('marbleBlack', [0.34, 1.16, 0.34], [p[0], 0, p[2]], rotationY);
  }
  const lintel = side3(0, 0.16);
  room.box('marbleBlack', [1.9, 0.26, 0.34], [lintel[0], 1.16, lintel[2]], rotationY);
  const shelf = side3(0, 0.22);
  room.box('marbleWhite', [2.24, 0.09, 0.46], [shelf[0], 1.42, shelf[2]], rotationY);

  // Firebox: brick reveal, sooty back, a fallen grate.
  const back = fwd(-0.02);
  room.box('surface.brick', [1.2, 1.16, 0.08], [back[0], 0, back[2]], rotationY, { tile: 0.9 });
  const hearth = fwd(0.28);
  room.box('surface.stone', [2.1, 0.06, 0.66], [hearth[0], 0, hearth[2]], rotationY, { tile: 1.4 });

  const grate = fwd(0.1);
  for (let i = 0; i < 5; i++) {
    const p = side3(-0.36 + i * 0.18, 0.1);
    room.box('ironBlack', [0.04, 0.18, 0.44], [p[0], 0.1, p[2]], rotationY);
  }
  room.box('ash', [1.0, 0.09, 0.42], [grate[0], 0, grate[2]], rotationY);

  if (lit) {
    for (let i = 0; i < 7; i++) {
      const p = side3(room.range(-0.4, 0.4), room.range(0.02, 0.22));
      room.box('emberGlow', [room.range(0.05, 0.12), 0.05, room.range(0.05, 0.1)], [p[0], 0.08, p[2]], rotationY, {
        castShadow: false,
      });
    }
    const f = fwd(0.1);
    const lamp = new THREE.PointLight(0xff9a4a, 13, 8.5, 2);
    lamp.position.set(f[0], 0.42, f[2]);
    room.light(lamp);
    flicker(room, lamp, 13, 0.3, 3.1);
  } else {
    const f = fwd(0.1);
    room.box('ash', [1.0, 0.12, 0.4], [f[0], 0.06, f[2]], rotationY);
  }
}

/* --- animation ------------------------------------------------------------------ */

/** Candle-ish intensity wobble. Cosmetic only; never touches gameplay. */
export function flicker(room: Room, light: THREE.Light, base: number, amount: number, speed = 7): void {
  const phase = room.range(0, 20);
  room.tick((t) => {
    const wobble = Math.sin(t * speed + phase) * 0.6 + Math.sin(t * speed * 2.37 + phase * 1.7) * 0.4;
    light.intensity = base * (1 + wobble * amount);
  });
}

/** A slow drift, for anything that hangs. */
export function sway(room: Room, object: THREE.Object3D, amount: number): void {
  const phase = room.range(0, 20);
  const x = object.position.x;
  const z = object.position.z;
  room.tick((t) => {
    object.position.x = x + Math.sin(t * 0.6 + phase) * amount;
    object.position.z = z + Math.cos(t * 0.47 + phase) * amount;
  });
}

/* --- surfaces and dressing ------------------------------------------------------ */

/** A rug or runner. No collider - you walk over it. */
export function rug(room: Room, x: number, z: number, w: number, d: number, rotationY = 0): void {
  room.box('surface.carpet', [w, 0.022, d], [x, 0.001, z], rotationY, { tile: 3.0, castShadow: false });
  // Frayed edge: a slightly larger, thinner underlay reads as a worn border.
  room.box('linen', [w + 0.08, 0.008, d + 0.08], [x, 0, z], rotationY, { castShadow: false });
}

/**
 * A framed portrait from the shared 2x2 atlas. Hung a few degrees off true,
 * because nothing in this house is level.
 */
export function painting(
  room: Room,
  side: Side,
  along: number,
  y: number,
  w = 0.72,
  h = 0.95,
  variant = 0,
  cell: Cell = [0, 0],
): void {
  const { position, rotationY } = wallPose(room, side, along, 0.03, cell);
  const [x, , z] = position;
  const tilt = room.range(-0.045, 0.045);
  const centre: Vec3 = [x, y + h / 2, z];
  const rot: Vec3 = [0, rotationY, tilt];

  room.geo('gilt', new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.05), tiltMatrix(centre, rot), { tile: 0.4, consume: true });
  room.geo('woodDark', new THREE.BoxGeometry(w + 0.02, h + 0.02, 0.03), tiltMatrix([x, y + h / 2, z], rot), { consume: true });

  const u = (variant % 2) * 0.5;
  const v = Math.floor((variant % 4) / 2) * 0.5;
  const canvas = subUV(quad(w, h), u, v, u + 0.5, v + 0.5);
  const out: Vec3 = [
    x - Math.sin(rotationY) * 0.035,
    y + h / 2,
    z - Math.cos(rotationY) * 0.035,
  ];
  room.geo('portrait', canvas, tiltMatrix(out, rot), { castShadow: false, consume: true });
}

/** A tall mirror, or what is left of one. */
export function wallMirror(room: Room, side: Side, along: number, y: number, w = 0.9, h = 1.6, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.04, cell);
  const [x, , z] = position;
  room.box('gilt', [w + 0.14, h + 0.14, 0.06], [x, y, z], rotationY, { tile: 0.4 });
  const out: Vec3 = [x - Math.sin(rotationY) * 0.04, y + h / 2, z - Math.cos(rotationY) * 0.04];
  room.geo('mirror', quad(w, h), poseMatrix(out, rotationY), { castShadow: false });
}

/** Velvet drapes with a pelmet. Put them beside a window, or over a blank wall. */
export function curtains(room: Room, side: Side, along: number, width = 2.1, height = 2.7, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.16, cell);
  const [x, , z] = position;
  const at = (s: number, d: number): Vec3 => [
    x + Math.cos(rotationY) * s - Math.sin(rotationY) * d,
    0,
    z - Math.sin(rotationY) * s - Math.cos(rotationY) * d,
  ];

  const pelmet = at(0, 0);
  room.box('velvetGold', [width + 0.3, 0.22, 0.16], [pelmet[0], height, pelmet[2]], rotationY, { tile: 0.8 });

  for (const s of [-1, 1]) {
    const drapeW = width * 0.3;
    const p = at(s * (width / 2 - drapeW / 2 + 0.06), 0);
    room.box('velvetRed', [drapeW, height, 0.13], [p[0], 0.02, p[2]], rotationY, { tile: 0.9 });
    // Folds.
    for (let i = 0; i < 3; i++) {
      const f = at(s * (width / 2 - drapeW + 0.1) + s * i * 0.09, 0.06);
      room.box('velvetRed', [0.05, height - 0.1, 0.06], [f[0], 0.05, f[2]], rotationY, { tile: 0.6 });
    }
  }
}

/** Cobwebs in a ceiling corner. Three planes is plenty in this light. */
export function cobwebs(room: Room, x: number, z: number, facing = 0, scale = 1): void {
  const { ceilingHeight } = room.ctx.dims;
  for (let i = 0; i < 3; i++) {
    const s = (0.5 + i * 0.22) * scale;
    room.geo(
      'cobweb',
      quad(s, s),
      tiltMatrix([x, ceilingHeight - 0.12 - i * 0.06, z], [-Math.PI / 2 + room.range(-0.3, 0.3), facing + room.range(-0.4, 0.4), 0]),
      { castShadow: false, receiveShadow: false },
    );
  }
}

/** Fallen plaster, splinters and grit. Pure decoration, never a collider. */
export function debris(room: Room, x: number, z: number, radius: number, count = 10): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = Math.sqrt(room.rng()) * radius;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    const chunky = room.chance(0.3);
    room.box(
      chunky ? 'woodPale' : 'ash',
      chunky ? [room.range(0.3, 0.8), 0.04, 0.09] : [room.range(0.06, 0.18), room.range(0.02, 0.05), room.range(0.06, 0.16)],
      [px, 0.01, pz],
      room.range(0, Math.PI),
      { castShadow: false },
    );
  }
}

/* --- furniture ------------------------------------------------------------------ */

/** A table with turned legs. `h` is the top surface - put item anchors there. */
export function table(room: Room, x: number, z: number, w: number, d: number, h = 0.76, rotationY = 0): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (lx: number, lz: number): Vec3 => [x + lx * cos + lz * sin, 0, z - lx * sin + lz * cos];

  room.box('wood', [w, 0.06, d], [x, h - 0.06, z], rotationY, { tile: 1.6 });
  room.box('woodDark', [w - 0.14, 0.09, d - 0.14], [x, h - 0.15, z], rotationY);
  for (const lx of [-w / 2 + 0.14, w / 2 - 0.14]) {
    for (const lz of [-d / 2 + 0.14, d / 2 - 0.14]) {
      const p = at(lx, lz);
      post(room, 'woodDark', 0.045, 0.06, h - 0.15, [p[0], 0, p[2]], 8);
      room.geo('woodDark', ball(0.055, 8), poseMatrix([p[0], h * 0.55, p[2]]));
    }
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [w / 2 - 0.05, d / 2 - 0.05], rotationY });
}

/** A dining chair: seat, splat back, four legs. */
export function chair(room: Room, x: number, z: number, rotationY = 0, tall = true): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (lx: number, lz: number): Vec3 => [x + lx * cos + lz * sin, 0, z - lx * sin + lz * cos];

  room.box('woodDark', [0.44, 0.05, 0.44], [x, 0.44, z], rotationY);
  room.box('velvetRed', [0.38, 0.05, 0.38], [x, 0.49, z], rotationY, { tile: 0.5 });
  for (const lx of [-0.18, 0.18]) {
    for (const lz of [-0.18, 0.18]) {
      const p = at(lx, lz);
      post(room, 'woodDark', 0.022, 0.028, 0.44, [p[0], 0, p[2]], 6);
    }
  }
  if (tall) {
    for (const lx of [-0.19, 0.19]) {
      const p = at(lx, 0.2);
      post(room, 'woodDark', 0.024, 0.028, 0.55, [p[0], 0.44, p[2]], 6);
    }
    const b = at(0, 0.2);
    room.box('woodDark', [0.38, 0.22, 0.04], [b[0], 0.72, b[2]], rotationY);
    room.box('woodDark', [0.1, 0.28, 0.03], [b[0], 0.5, b[2]], rotationY);
  }
  room.blockCircle(x, z, 0.26);
}

/** A wing-back armchair, sagging. */
export function armchair(room: Room, x: number, z: number, rotationY = 0, sheeted = false): void {
  const cover = sheeted ? 'dustSheet' : 'leather';
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (lx: number, lz: number): Vec3 => [x + lx * cos + lz * sin, 0, z - lx * sin + lz * cos];

  room.box(cover, [0.82, 0.36, 0.78], [x, 0.06, z], rotationY, { tile: 1.1 });
  const seat = at(0, -0.02);
  room.box(cover, [0.68, 0.14, 0.62], [seat[0], 0.42, seat[2]], rotationY, { tile: 0.9 });
  const back = at(0, 0.3);
  room.box(cover, [0.82, 0.72, 0.18], [back[0], 0.4, back[2]], rotationY, { tile: 1.1 });
  for (const lx of [-0.36, 0.36]) {
    const p = at(lx, 0.04);
    room.box(cover, [0.12, 0.28, 0.66], [p[0], 0.42, p[2]], rotationY, { tile: 0.7 });
  }
  if (!sheeted) {
    for (const lx of [-0.34, 0.34]) {
      for (const lz of [-0.32, 0.32]) {
        const p = at(lx, lz);
        post(room, 'woodDark', 0.03, 0.035, 0.07, [p[0], 0, p[2]], 6);
      }
    }
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [0.38, 0.36], rotationY });
}

/** A sofa, usually under a dust sheet. */
export function sofa(room: Room, x: number, z: number, rotationY = 0, sheeted = true): void {
  const cover = sheeted ? 'dustSheet' : 'velvetGreen';
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (lx: number, lz: number): Vec3 => [x + lx * cos + lz * sin, 0, z - lx * sin + lz * cos];

  room.box(cover, [1.94, 0.4, 0.82], [x, 0.05, z], rotationY, { tile: 1.4 });
  const back = at(0, 0.31);
  room.box(cover, [1.94, 0.76, 0.2], [back[0], 0.4, back[2]], rotationY, { tile: 1.4 });
  for (const lx of [-0.5, 0.5]) {
    const p = at(lx, -0.04);
    room.box(cover, [0.86, 0.16, 0.6], [p[0], 0.45, p[2]], rotationY, { tile: 1 });
  }
  for (const lx of [-0.9, 0.9]) {
    const p = at(lx, 0.02);
    room.box(cover, [0.16, 0.32, 0.74], [p[0], 0.45, p[2]], rotationY, { tile: 0.8 });
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [0.94, 0.4], rotationY });
}

/**
 * A dust sheet thrown over something shapeless. The most useful prop in the
 * pack: it says "closed up" without you having to model what is underneath.
 */
export function sheetedShape(room: Room, x: number, z: number, w: number, h: number, d: number, rotationY = 0): void {
  room.box('dustSheet', [w, h, d], [x, 0, z], rotationY, { tile: 1.3 });
  room.box('dustSheet', [w + 0.14, h * 0.34, d + 0.14], [x, 0, z], rotationY, { tile: 1.3 });
  room.box('dustSheet', [w * 0.86, 0.1, d * 0.86], [x, h, z], rotationY, { tile: 1.3 });
  // A corner of the sheet, hanging.
  room.geo('dustSheet', quad(0.4, 0.5), tiltMatrix([x + w / 2, h * 0.6, z], [0.1, rotationY + 0.4, 0.2]), { tile: 1 });
  room.collider({ kind: 'box', center: [x, z], halfExtents: [w / 2, d / 2], rotationY });
}

/** A run of books on a shelf: varied widths, heights, leans and three colours. */
export function bookRow(room: Room, x: number, y: number, z: number, length: number, rotationY = 0, density = 0.85): void {
  const colours = ['bookRed', 'bookGreen', 'bookTan'] as const;
  let cursor = -length / 2;
  while (cursor < length / 2 - 0.04) {
    const w = room.range(0.028, 0.055);
    if (cursor + w > length / 2) break;
    if (room.chance(1 - density)) {
      cursor += w + room.range(0.01, 0.06);
      continue;
    }
    const h = room.range(0.18, 0.28);
    const lean = room.chance(0.12) ? room.range(-0.28, 0.28) : 0;
    const s = cursor + w / 2;
    const px = x + Math.cos(rotationY) * s;
    const pz = z - Math.sin(rotationY) * s;
    room.geo(
      room.pick(colours),
      new THREE.BoxGeometry(w, h, room.range(0.14, 0.2)),
      tiltMatrix([px, y + h / 2, pz], [0, rotationY, lean]),
      { tile: 0.4, consume: true },
    );
    cursor += w + 0.004;
  }
}

/** A bookcase against a wall, full of books. `shelves` sets its height. */
export function bookcase(room: Room, side: Side, along: number, width = 1.6, shelves = 5, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.16, cell);
  const [x, , z] = position;
  const depth = 0.32;
  const height = 0.34 + shelves * 0.42;
  const at = (s: number, d: number): Vec3 => [
    x + Math.cos(rotationY) * s - Math.sin(rotationY) * d,
    0,
    z - Math.sin(rotationY) * s - Math.cos(rotationY) * d,
  ];

  room.box('surface.panel', [width, height, 0.05], [at(0, -depth / 2)[0], 0, at(0, -depth / 2)[2]], rotationY, { tile: 1.4 });
  for (const s of [-width / 2 + 0.03, width / 2 - 0.03]) {
    const p = at(s, 0);
    room.box('surface.panel', [0.06, height, depth], [p[0], 0, p[2]], rotationY, { tile: 1.4 });
  }
  room.box('woodDark', [width + 0.1, 0.09, depth + 0.08], [x, height, z], rotationY);
  room.box('woodDark', [width, 0.14, depth], [x, 0, z], rotationY);

  for (let i = 0; i < shelves; i++) {
    const y = 0.2 + i * 0.42;
    room.box('woodDark', [width - 0.1, 0.035, depth - 0.04], [x, y, z], rotationY);
    const rowZ = at(0, 0.02);
    bookRow(room, rowZ[0], y + 0.035, rowZ[2], width - 0.16, rotationY, room.range(0.5, 0.95));
  }

  room.collider({
    kind: 'box',
    center: [x, z],
    halfExtents: [width / 2 - 0.04, depth / 2 - 0.02],
    rotationY,
  });
}

/** A chest of drawers / sideboard. Flat top, good for item anchors. */
export function sideboard(room: Room, side: Side, along: number, width = 1.5, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.26, cell);
  const [x, , z] = position;
  room.box('wood', [width, 0.78, 0.5], [x, 0.08, z], rotationY, { tile: 1.4 });
  room.box('woodDark', [width + 0.08, 0.05, 0.56], [x, 0.86, z], rotationY);
  for (let i = 0; i < 3; i++) {
    const s = (i - 1) * (width / 3);
    const p: Vec3 = [
      x + Math.cos(rotationY) * s - Math.sin(rotationY) * 0.26,
      0,
      z - Math.sin(rotationY) * s - Math.cos(rotationY) * 0.26,
    ];
    room.box('woodDark', [width / 3 - 0.06, 0.3, 0.03], [p[0], 0.3, p[2]], rotationY, { tile: 0.6 });
    room.geo('brass', ball(0.028, 8), poseMatrix([p[0] - Math.sin(rotationY) * 0.03, 0.45, p[2] - Math.cos(rotationY) * 0.03]));
  }
  for (const s of [-width / 2 + 0.08, width / 2 - 0.08]) {
    const p: Vec3 = [x + Math.cos(rotationY) * s, 0, z - Math.sin(rotationY) * s];
    post(room, 'woodDark', 0.035, 0.045, 0.08, [p[0], 0, p[2]], 6);
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [width / 2 - 0.04, 0.24], rotationY });
}

/** A steamer trunk, strapped and studded. */
export function trunk(room: Room, x: number, z: number, rotationY = 0, open = false): void {
  room.box('leather', [0.86, 0.44, 0.5], [x, 0, z], rotationY, { tile: 1 });
  room.box('woodDark', [0.9, 0.06, 0.54], [x, open ? 0.44 : 0.44, z], rotationY);
  for (const s of [-0.26, 0.26]) {
    const p: Vec3 = [x + Math.cos(rotationY) * s, 0, z - Math.sin(rotationY) * s];
    room.box('iron', [0.07, 0.5, 0.54], [p[0], 0, p[2]], rotationY, { tile: 0.5 });
  }
  if (open) {
    room.geo('leather', new THREE.BoxGeometry(0.86, 0.3, 0.06), tiltMatrix([x, 0.6, z + 0.24], [-0.9, rotationY, 0]), { tile: 0.8, consume: true });
    room.box('linen', [0.76, 0.08, 0.4], [x, 0.42, z], rotationY);
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [0.42, 0.24], rotationY });
}

/** A grandfather clock. Stopped, obviously. */
export function longcaseClock(room: Room, side: Side, along: number, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.22, cell);
  const [x, , z] = position;
  const out = (d: number): Vec3 => [x - Math.sin(rotationY) * d, 0, z - Math.cos(rotationY) * d];

  room.box('surface.panel', [0.56, 2.05, 0.36], [x, 0, z], rotationY, { tile: 1.2 });
  room.box('woodDark', [0.66, 0.1, 0.42], [x, 2.05, z], rotationY);
  room.box('woodDark', [0.2, 0.16, 0.2], [x, 2.15, z], rotationY);

  const glass = out(0.19);
  room.geo('glass', quad(0.36, 0.9), poseMatrix([glass[0], 0.75, glass[2]], rotationY), { castShadow: false });
  // Pendulum, hanging dead still.
  const inner = out(0.1);
  room.box('brass', [0.02, 0.78, 0.02], [inner[0], 0.62, inner[2]], rotationY);
  room.geo('brass', cyl(0.09, 0.09, 0.015, 12), tiltMatrix([inner[0], 0.66, inner[2]], [Math.PI / 2, rotationY, 0]));

  const face = out(0.185);
  room.geo('bone', cyl(0.19, 0.19, 0.02, 16), tiltMatrix([face[0], 1.68, face[2]], [Math.PI / 2, rotationY, 0]));
  room.geo('gilt', ring(0.2, 0.018, 16), poseMatrix([face[0], 1.68, face[2]], rotationY));
  const hands = out(0.2);
  room.box('ironBlack', [0.012, 0.13, 0.008], [hands[0], 1.68, hands[2]], rotationY);
  room.geo('ironBlack', new THREE.BoxGeometry(0.1, 0.012, 0.008), tiltMatrix([hands[0], 1.71, hands[2]], [0, rotationY, 0.35]), { consume: true });

  room.collider({ kind: 'box', center: [x, z], halfExtents: [0.28, 0.18], rotationY });
}

/** A fluted column with base and capital. */
export function column(room: Room, x: number, z: number, radius = 0.26): void {
  const { ceilingHeight } = room.ctx.dims;
  room.box('marbleWhite', [radius * 2.6, 0.16, radius * 2.6], [x, 0, z]);
  post(room, 'marbleWhite', radius * 0.88, radius, ceilingHeight - 0.5, [x, 0.16, z], 14);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    room.geo(
      'marbleWhite',
      cyl(0.028, 0.028, ceilingHeight - 0.62, 5),
      poseMatrix([x + Math.cos(a) * radius, (ceilingHeight - 0.62) / 2 + 0.2, z + Math.sin(a) * radius]),
    );
  }
  room.box('marbleWhite', [radius * 2.7, 0.2, radius * 2.7], [x, ceilingHeight - 0.34, z]);
  room.box('marbleWhite', [radius * 3, 0.14, radius * 3], [x, ceilingHeight - 0.14, z]);
  room.blockCircle(x, z, radius + 0.06);
}

/** A marble bust on a plinth. Someone nobody remembers. */
export function bust(room: Room, x: number, z: number, rotationY = 0): void {
  // A box, not a circle: a circle round a square plinth blocks 30 cm more floor
  // than the marble does, which is enough to swallow a chest's clearance.
  room.solid('marbleWhite', [0.42, 0.9, 0.42], [x, 0, z], rotationY, { tile: 0.8 });
  room.box('marbleWhite', [0.5, 0.06, 0.5], [x, 0.9, z], rotationY);
  room.geo('marbleWhite', cyl(0.14, 0.2, 0.22, 10), poseMatrix([x, 1.07, z]));
  room.geo('marbleWhite', ball(0.13, 10), poseMatrix([x, 1.29, z]));
  room.geo('marbleWhite', new THREE.BoxGeometry(0.1, 0.1, 0.06), tiltMatrix([x - Math.sin(rotationY) * 0.12, 1.28, z - Math.cos(rotationY) * 0.12], [0, rotationY, 0]), { consume: true });
}

/**
 * A flight of stairs, dressed flat. The manor reads as having an upstairs; the
 * player never goes there, and the whole thing is one collider.
 */
export function stairFlight(room: Room, side: Side, along: number, width = 2.2, steps = 9, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0, cell);
  const [x, , z] = position;
  const rise = 0.19;
  const run = 0.27;

  for (let i = 0; i < steps; i++) {
    const d = 0.2 + i * run;
    const p: Vec3 = [x - Math.sin(rotationY) * d, 0, z - Math.cos(rotationY) * d];
    room.box('surface.carpet', [width - 0.16, rise, run], [p[0], (steps - 1 - i) * rise, p[2]], rotationY, { tile: 1.2 });
    room.box('woodDark', [width, 0.05, run + 0.03], [p[0], (steps - i) * rise - 0.05, p[2]], rotationY);
  }
  // The flight climbs INTO the wall, so the wall gets a dark opening above it -
  // the manor reads as having an upstairs the player will never reach.
  room.box('ash', [width - 0.1, 3.4 - steps * rise - 0.3, 0.12], [x, steps * rise, z], rotationY, { castShadow: false });
  room.box('woodDark', [width + 0.16, 0.14, 0.2], [x, steps * rise + (3.4 - steps * rise - 0.3), z], rotationY);

  // Newel post and balusters on the open side.
  for (const s of [-width / 2, width / 2]) {
    const p: Vec3 = [
      x + Math.cos(rotationY) * s - Math.sin(rotationY) * (0.2 + steps * run),
      0,
      z - Math.sin(rotationY) * s - Math.cos(rotationY) * (0.2 + steps * run),
    ];
    room.box('woodDark', [0.13, 1.05, 0.13], [p[0], 0, p[2]], rotationY);
    room.geo('woodDark', ball(0.09, 8), poseMatrix([p[0], 1.1, p[2]]));
  }

  const depth = 0.2 + steps * run;
  const c: Vec3 = [x - Math.sin(rotationY) * (depth / 2), 0, z - Math.cos(rotationY) * (depth / 2)];
  room.collider({ kind: 'box', center: [c[0], c[2]], halfExtents: [width / 2, depth / 2], rotationY });
}

/** Turned balusters under a handrail, for landings and galleries. */
export function balustrade(room: Room, x: number, z: number, length: number, rotationY = 0, height = 0.98): void {
  const count = Math.max(2, Math.round(length / 0.19));
  for (let i = 0; i <= count; i++) {
    const s = -length / 2 + (length * i) / count;
    const px = x + Math.cos(rotationY) * s;
    const pz = z - Math.sin(rotationY) * s;
    post(room, 'woodDark', 0.028, 0.04, height - 0.08, [px, 0, pz], 8);
    room.geo('woodDark', ball(0.045, 8), poseMatrix([px, height * 0.55, pz]));
  }
  room.box('wood', [length, 0.08, 0.12], [x, height - 0.08, z], rotationY, { tile: 1.2 });
  room.box('woodDark', [length, 0.06, 0.09], [x, 0, z], rotationY);
  room.collider({ kind: 'box', center: [x, z], halfExtents: [length / 2, 0.09], rotationY });
}

/** A run of iron pipe along a wall, with flanges and a valve wheel. */
export function pipeRun(room: Room, side: Side, y: number, radius = 0.07, cell: Cell = [0, 0]): void {
  const { cellSize } = room.ctx.dims;
  const { position, rotationY } = wallPose(room, side, 0, 0.22, cell);
  const [x, , z] = position;
  const axis: Vec3 = [Math.cos(rotationY), 0, -Math.sin(rotationY)];

  room.geo(
    'rust',
    cyl(radius, radius, cellSize - 0.7, 8),
    tiltMatrix([x, y, z], [0, rotationY, Math.PI / 2]),
    { tile: 0.8 },
  );
  for (const s of [-1.9, 0.4, 2.2]) {
    const p: Vec3 = [x + axis[0] * s, y, z + axis[2] * s];
    room.geo('ironBlack', cyl(radius * 1.5, radius * 1.5, 0.07, 8), tiltMatrix(p, [0, rotationY, Math.PI / 2]));
  }
  const valve: Vec3 = [x + axis[0] * 1.2, y, z + axis[2] * 1.2];
  room.geo('ironBlack', cyl(radius * 1.3, radius * 1.3, 0.16, 8), poseMatrix([valve[0], valve[1] + 0.1, valve[2]]));
  room.geo('rust', ring(0.13, 0.018, 12), poseMatrix([valve[0], valve[1] + 0.2, valve[2]]));
}

/** A barrel or cask on its side, in a rack. */
export function barrel(room: Room, x: number, y: number, z: number, rotationY = 0, length = 0.86): void {
  room.geo('woodDark', cyl(0.28, 0.28, length, 12), tiltMatrix([x, y + 0.3, z], [0, rotationY, Math.PI / 2]), { tile: 1 });
  room.geo('wood', cyl(0.31, 0.31, length * 0.55, 12), tiltMatrix([x, y + 0.3, z], [0, rotationY, Math.PI / 2]), { tile: 1 });
  for (const s of [-length * 0.3, length * 0.3]) {
    const p: Vec3 = [x + Math.cos(rotationY) * s, y + 0.3, z - Math.sin(rotationY) * s];
    room.geo('iron', cyl(0.315, 0.315, 0.05, 12), tiltMatrix(p, [0, rotationY, Math.PI / 2]));
  }
  room.blockCircle(x, z, 0.3);
}

/** A dead potted fern. Nothing survived the house. */
export function deadPlant(room: Room, x: number, y: number, z: number, scale = 1): void {
  room.geo('rust', cyl(0.2 * scale, 0.15 * scale, 0.26 * scale, 10), poseMatrix([x, y + 0.13 * scale, z]), { tile: 0.5 });
  room.geo('soil', cyl(0.18 * scale, 0.18 * scale, 0.03, 10), poseMatrix([x, y + 0.25 * scale, z]));
  for (let i = 0; i < 9; i++) {
    const a = room.range(0, Math.PI * 2);
    const lean = room.range(0.5, 1.25);
    const len = room.range(0.3, 0.62) * scale;
    room.geo(
      'deadLeaf',
      quad(0.09 * scale, len),
      tiltMatrix([x + Math.cos(a) * 0.12 * scale, y + 0.26 * scale + len * 0.35, z + Math.sin(a) * 0.12 * scale], [lean, a, 0]),
      { castShadow: false },
    );
  }
}

/** Ivy or creeper coming in through a broken window. */
export function creeper(room: Room, x: number, y: number, z: number, spread = 1, count = 14): void {
  for (let i = 0; i < count; i++) {
    const dx = room.range(-spread, spread);
    const dy = room.range(-spread * 0.7, spread * 0.4);
    room.geo(
      'ivy',
      quad(room.range(0.1, 0.22), room.range(0.1, 0.2)),
      tiltMatrix([x + dx * 0.4, y + dy, z + dx * 0.1], [room.range(-0.4, 0.4), room.range(0, Math.PI), room.range(0, Math.PI)]),
      { castShadow: false },
    );
  }
}

/**
 * A hanging sheet on a line - laundry, or a covered doorway. Breaks sightlines.
 *
 * `sheetLinen` rather than `linen`: a sheet is a single plane you can stand on
 * either side of, so it has to be double-sided, and the side facing away from
 * the lamp has to keep reading as cloth instead of as a black slab.
 */
export function hangingSheet(room: Room, x: number, z: number, width: number, height: number, rotationY = 0): void {
  const { ceilingHeight } = room.ctx.dims;
  const y = height / 2 + (ceilingHeight - height) * 0.5;

  room.geo('sheetLinen', quad(width, height), poseMatrix([x, y, z], rotationY), NO_SHADOW);
  // Folds either side, so it is not obviously one flat plane.
  for (const s of [-width * 0.3, width * 0.3]) {
    const px = x + Math.cos(rotationY) * s;
    const pz = z - Math.sin(rotationY) * s;
    room.geo('sheetLinen', quad(width * 0.28, height * 0.96), tiltMatrix([px, y, pz], [0, rotationY, 0], [1, 1, 1]), NO_SHADOW);
  }
}

/** A shaft of light: a long, faint, unlit wedge. Cheap god-rays. */
export function lightShaft(room: Room, from: Vec3, to: Vec3, width: number, warm = false): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.asin(-dy / Math.max(0.001, length));
  const centre: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];

  for (const roll of [0, Math.PI / 2]) {
    room.geo(warm ? 'warmShaft' : 'moonShaft', quad(width, length), tiltMatrix(centre, [pitch + Math.PI / 2, yaw, roll]), {
      castShadow: false,
      receiveShadow: false,
    });
  }
}
