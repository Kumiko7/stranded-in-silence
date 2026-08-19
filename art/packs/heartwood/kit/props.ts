/**
 * Heartwood's prop library - everything a room is furnished from.
 *
 * A room file should read as a description of a place, not as three.js
 * bookkeeping, so anything used by more than one room lives here and takes a
 * `Room` (see `../rooms/common.ts`) as its first argument. Everything writes
 * into that room's batcher, so a room built from four hundred boxes still costs
 * a handful of draw calls.
 *
 * Four rules this file exists to keep:
 *
 * - **Geometry is cached by size and the caches are registered.** A pack cache
 *   keyed on numbers the seeded RNG made up belongs to ONE world;
 *   `ownGeometryCache()` is what gives it that lifetime, and a cache nobody
 *   registered is a leak no tool will report (docs/systems/RENDERING.md §3a).
 * - **A light belongs outside the thing it is lighting.** A point light sunk
 *   inside its own glowing lantern lights the inside of a paper shade and
 *   nothing else.
 * - **Anything animated stays out of the room's batch, but gets a batcher of its
 *   own.** One `THREE.Mesh` per leaf of a swaying vine is thirty draw calls for
 *   one prop.
 * - **Shadow casting is opt-in in this pack.** `MeshBatcher` splits a material
 *   into two meshes when some of its geometry casts and some does not, so a
 *   material shared between a shadowed table and an unshadowed piece of trim
 *   costs two draw calls. What earns `castShadow: true` is a silhouette a player
 *   reads across a room.
 *
 * And one rule about colliders, learned in two packs and paid for in both:
 * **a prop that places random colliders is a prop you have to think about, so
 * most props here place none.** `deadfall()` scatters branches from the seeded
 * RNG and is reserved for corners with a metre and a half of margin; `litter()`
 * looks the same and blocks nothing.
 */
import * as THREE from 'three';
import type { Cell, Side } from '../../../lib/contract';
import { bands, boxGeometry, mm, ownGeometryCache, sides } from '../../../lib/build';
import type { BatchOptions } from '../../../lib/merge';
import { MeshBatcher, poseMatrix, tiltMatrix } from '../../../lib/merge';
import type { Room, Vec3 } from '../rooms/common';

/** Anything living inside its own light source, or lying flat on a surface. */
const FLAT: BatchOptions = { castShadow: false, receiveShadow: false };
/** A silhouette worth casting: the handful of big shapes per room. */
const CASTS: BatchOptions = { castShadow: true };

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
 * Where to put something fixed to `side`, `along` metres from the wall's centre
 * (along the prop's own local +X) and `inset` metres out from the face.
 *
 * `along` runs along the prop's own local +X, which is TURNED by the wall's
 * facing: on a south wall `+along` is `+x`, on a north wall `-x`, on an east
 * wall `-z` and on a west wall `+z`. Pair every wall-mounted shelf with its item
 * anchor by eye on a contact sheet - see docs/art/ROOM_FORMAT.md §2.1.1.
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
export function cyl(rTop: number, rBot: number, h: number, seg = 8, open = false): THREE.CylinderGeometry {
  seg = sides(Math.max(Math.abs(rTop), Math.abs(rBot)), seg);
  const key = `${mm(rTop)},${mm(rBot)},${mm(h)},${seg},${open}`;
  let geo = cylCache.get(key);
  if (!geo) {
    geo = new THREE.CylinderGeometry(mm(rTop), mm(rBot), mm(h), seg, 1, open);
    cylCache.set(key, geo);
  }
  return geo;
}

const sphereCache = new Map<string, THREE.SphereGeometry>();
export function ball(r: number, seg = 7): THREE.SphereGeometry {
  seg = sides(r, seg);
  const key = `${mm(r)},${seg}`;
  let geo = sphereCache.get(key);
  if (!geo) {
    geo = new THREE.SphereGeometry(mm(r), seg, bands(seg));
    sphereCache.set(key, geo);
  }
  return geo;
}

const coneCache = new Map<string, THREE.ConeGeometry>();
export function spike(r: number, h: number, seg = 6): THREE.ConeGeometry {
  seg = sides(r, seg);
  const key = `${mm(r)},${mm(h)},${seg}`;
  let geo = coneCache.get(key);
  if (!geo) {
    geo = new THREE.ConeGeometry(mm(r), mm(h), seg);
    coneCache.set(key, geo);
  }
  return geo;
}

const torusCache = new Map<string, THREE.TorusGeometry>();
export function ring(r: number, tube: number, seg = 12): THREE.TorusGeometry {
  seg = sides(r, seg);
  const key = `${mm(r)},${mm(tube)},${seg}`;
  let geo = torusCache.get(key);
  if (!geo) {
    // Five sides on the tube, not sixteen: a hoop 8 mm thick seen through fog is
    // the single easiest place in a pack to spend 40,000 triangles nobody can
    // resolve (docs/systems/RENDERING.md).
    geo = new THREE.TorusGeometry(mm(r), mm(tube), sides(tube, 5), seg);
    torusCache.set(key, geo);
  }
  return geo;
}

const planeCache = new Map<string, THREE.PlaneGeometry>();
export function quad(w: number, h: number): THREE.PlaneGeometry {
  const key = `${mm(w)},${mm(h)}`;
  let geo = planeCache.get(key);
  if (!geo) {
    geo = new THREE.PlaneGeometry(mm(w), mm(h));
    planeCache.set(key, geo);
  }
  return geo;
}

const discCache = new Map<string, THREE.CircleGeometry>();
export function disc(r: number, seg = 16): THREE.CircleGeometry {
  seg = sides(r, seg);
  const key = `${mm(r)},${seg}`;
  let geo = discCache.get(key);
  if (!geo) {
    geo = new THREE.CircleGeometry(mm(r), seg);
    discCache.set(key, geo);
  }
  return geo;
}

for (const cache of [cylCache, sphereCache, coneCache, torusCache, planeCache, discCache]) ownGeometryCache(cache);

/* --- primitives ------------------------------------------------------------------ */

/** Upright cylinder whose `y` is its bottom. */
export function post(
  room: Room,
  material: string,
  rTop: number,
  rBot: number,
  h: number,
  p: Vec3,
  seg = 8,
  options: BatchOptions = {},
): void {
  room.geo(material, cyl(rTop, rBot, h, seg), poseMatrix([p[0], p[1] + h / 2, p[2]]), { tile: 0.6, ...options });
}

/**
 * A cylinder from one point to another, at any angle. Branches, roots, vines,
 * beams, rails and rope all come down to this, and doing it by hand is where a
 * horizontal rail ends up standing on end (docs/art/ROOM_REVIEW.md).
 */
export function strut(
  room: Room,
  material: string,
  from: Vec3,
  to: Vec3,
  radius: number,
  seg = 6,
  options: BatchOptions = {},
  open = false,
): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  if (length < 0.001) return;
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.acos(Math.min(1, Math.max(-1, dy / length)));
  room.geo(
    material,
    cyl(radius, radius, length, seg, open),
    tiltMatrix([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2], [pitch, yaw, 0]),
    { tile: 0.6, ...options },
  );
}

/** A flat box lying at an angle: a leaning board, a plank, a fallen shelf. */
export function slab(
  room: Room,
  material: string,
  size: Vec3,
  position: Vec3,
  rotation: readonly [number, number, number],
  options: BatchOptions = {},
): void {
  room.geo(material, boxGeometry(size[0], size[1], size[2]), tiltMatrix(position, rotation), { tile: 0.8, ...options });
}

/**
 * A tapering, kinked run of cylinder: a branch, a root, a vine, a tentacle.
 *
 * Everything in this pack that is longer than it is thick and not straight goes
 * through here. Six segments is enough to read as organic and cheap enough to
 * use forty of; a straight `strut` is what a branch looks like when nobody
 * bothered.
 */
export function limb(
  room: Room,
  material: string,
  from: Vec3,
  to: Vec3,
  rStart: number,
  rEnd: number,
  bend: number,
  seed: number,
  segments = 4,
  options: BatchOptions = {},
): Vec3 {
  const wobble = (i: number, k: number): number => Math.sin(seed * 1.7 + i * 1.31 + k * 2.4) * bend;
  let prev: Vec3 = from;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const arc = Math.sin(t * Math.PI);
    const next: Vec3 = [
      from[0] + (to[0] - from[0]) * t + wobble(i, 0) * arc,
      from[1] + (to[1] - from[1]) * t + wobble(i, 1) * arc * 0.6,
      from[2] + (to[2] - from[2]) * t + wobble(i, 2) * arc,
    ];
    const r0 = rStart + (rEnd - rStart) * ((i - 1) / segments);
    const r1 = rStart + (rEnd - rStart) * t;
    // Open-ended: every cap but the two at the ends of the run is inside the
    // next link, and a branch is the commonest shape in the pack.
    strut(room, material, prev, next, (r0 + r1) / 2, 5, options, true);
    prev = next;
  }
  return prev;
}

/* --- animation ------------------------------------------------------------------ */

/**
 * A guttering flame: mostly steady with an irregular waver. The Bower's lamps
 * all do this - a resin wick is a flame, and a flame wavers rather than snapping.
 */
export function gutter(room: Room, light: THREE.Light, base: number, depth = 0.16, speed = 5.5): void {
  const phase = room.range(0, 20);
  room.tick((t) => {
    const wave =
      Math.sin(t * speed + phase) * 0.5 + Math.sin(t * speed * 2.31 + phase * 1.7) * 0.3 + Math.sin(t * speed * 4.7 + phase) * 0.2;
    light.intensity = base * (1 + wave * depth);
  });
}

/**
 * The slow breathing of something alive. Everything on the Thicket side does
 * this rather than flickering: foxfire does not gutter, it swells, and the
 * period is long enough that you see it in the shadows before you notice it in
 * the light.
 */
export function breathe(room: Room, light: THREE.Light, base: number, amount = 0.22, speed = 0.36): void {
  const phase = room.range(0, 20);
  room.tick((t) => {
    const wave = Math.sin(t * speed + phase) * 0.7 + Math.sin(t * speed * 1.63 + phase * 1.4) * 0.3;
    light.intensity = base * (1 + wave * amount);
  });
}

/** A slow sway, for anything hanging: a lantern, a cradle, a wrapped bundle. */
export function sway(room: Room, object: THREE.Object3D, amount = 0.05, speed = 0.7): void {
  const phase = room.range(0, 20);
  room.tick((t) => {
    object.rotation.z = Math.sin(t * speed + phase) * amount;
    object.rotation.x = Math.cos(t * speed * 0.83 + phase * 1.3) * amount * 0.6;
  });
}

/* --- light ------------------------------------------------------------------------ */

/**
 * The pool a lamp lays on the surface it stands against.
 *
 * A practical in this renderer lights itself and about a metre of what it is
 * bolted to, so a lit lantern reads as a bright speck in a black box. Every
 * practical in this pack lays one of these: it costs nothing against the light
 * budget and it is the whole difference between "there is a lamp here" and
 * "this room is lit" (docs/art/ROOM_REVIEW.md).
 */
export function glowPool(room: Room, x: number, z: number, radius: number, material = 'sapWash'): void {
  room.geo(material, disc(radius, 18), tiltMatrix([x, 0.015, z], [-Math.PI / 2, 0, 0]), FLAT);
}

/** The same, laid on a wall rather than on the floor. */
export function wallGlow(room: Room, side: Side, along: number, y: number, size: number, material = 'sapWash', cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.06, cell);
  room.geo(material, quad(size, size), poseMatrix([position[0], y, position[2]], rotationY + Math.PI), FLAT);
}

/**
 * A moth lantern: a resin-paper globe on a bracket or a chain, with the moths
 * that never leave it.
 *
 * The Bower's principal practical. The lamp itself sits OUTSIDE the globe and
 * below it, because a point light inside its own shade lights the inside of a
 * sphere and nothing else (docs/art/ROOM_REVIEW.md).
 */
export function mothLantern(
  room: Room,
  side: Side,
  along: number,
  y: number,
  lit: boolean,
  intensity = 9,
  cell: Cell = [0, 0],
): THREE.PointLight | null {
  const { position: p, rotationY } = wallPose(room, side, along, 0.1, cell);
  const out = 0.42;
  const dir: Vec3 = [Math.sin(rotationY + Math.PI) * out, 0, Math.cos(rotationY + Math.PI) * out];
  const gx = p[0] - dir[0];
  const gz = p[2] - dir[2];

  // Bracket: a scrolled arm off the wall, with a leaf under the scroll.
  room.box('timberDark', [0.1, 0.12, 0.16], [p[0], y + 0.16, p[2]], rotationY, { tile: 0.2 });
  strut(room, 'copper', [p[0], y + 0.2, p[2]], [gx, y + 0.26, gz], 0.022, 5, { tile: 0.2 });
  strut(room, 'copper', [gx, y + 0.26, gz], [gx, y + 0.06, gz], 0.02, 5, { tile: 0.2 });
  room.geo('leaf', quad(0.2, 0.12), tiltMatrix([(p[0] + gx) / 2, y + 0.16, (p[2] + gz) / 2], [-0.5, rotationY, 0]), FLAT);

  // The globe: a squashed sphere of resin paper, with a copper crown and finial.
  room.geo(lit ? 'lumenMoth' : 'parchment', ball(0.155, 9), tiltMatrix([gx, y - 0.11, gz], [0, 0, 0], [1, 1.18, 1]), {
    tile: 0.3,
    ...FLAT,
  });
  room.geo('copper', ring(0.15, 0.014, 10), tiltMatrix([gx, y - 0.04, gz], [Math.PI / 2, 0, 0]), { tile: 0.2, ...FLAT });
  room.geo('copper', spike(0.05, 0.08, 6), poseMatrix([gx, y + 0.05, gz]), { tile: 0.15, ...FLAT });

  // Moths on and around it. Four, and they are the reason it is called that.
  for (let i = 0; i < 4; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = room.range(0.17, 0.34);
    room.geo(
      'down',
      quad(room.range(0.05, 0.09), room.range(0.03, 0.055)),
      tiltMatrix([gx + Math.cos(a) * d, y - 0.12 + room.range(-0.12, 0.16), gz + Math.sin(a) * d], [room.range(0, 3), a, room.range(0, 3)]),
      FLAT,
    );
  }

  if (!lit) return null;
  wallGlow(room, side, along, y + 0.1, 1.9, 'sapWash', cell);
  const lamp = new THREE.PointLight(0xffc478, intensity, room.ctx.dims.cellSize * 1.45, 2);
  lamp.position.set(gx, y - 0.34, gz);
  room.light(lamp);
  gutter(room, lamp, intensity);
  return lamp;
}

/**
 * The same globe on a chain from the rafters rather than on a wall bracket.
 *
 * A wall lamp only ever lights what it is bolted to and about a metre either
 * side, which is fine for a room whose set piece is against a wall and useless
 * for one whose set piece is in the middle of the floor - a 24 m gallery with a
 * stair up one side of it, or three front doors a player is meant to look AT
 * rather than stand beside. Both of those rooms came back off the first contact
 * sheet as black corridors with a lit skirting board.
 */
export function hangingLantern(
  room: Room,
  x: number,
  z: number,
  y: number,
  lit: boolean,
  intensity = 10,
): THREE.PointLight | null {
  const ceiling = room.ctx.dims.ceilingHeight;
  // The chain, and the hook it is on. A globe with nothing above it floats.
  room.geo('timberDark', cyl(0.05, 0.06, 0.09, 7), poseMatrix([x, ceiling - 0.05, z]), { tile: 0.1, ...FLAT });
  room.geo('copper', cyl(0.012, 0.012, ceiling - 0.1 - y, 5), poseMatrix([x, (ceiling - 0.1 + y) / 2, z]), { tile: 0.2, ...FLAT });
  // The gallery ring the globe hangs in, and three straps down to it.
  room.geo('copper', ring(0.19, 0.014, 12), tiltMatrix([x, y + 0.12, z], [Math.PI / 2, 0, 0]), { tile: 0.2, ...FLAT });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    strut(room, 'copper', [x, y + 0.28, z], [x + Math.cos(a) * 0.19, y + 0.12, z + Math.sin(a) * 0.19], 0.01, 4, FLAT);
  }
  room.geo(lit ? 'lumenMoth' : 'parchment', ball(0.175, 10), tiltMatrix([x, y - 0.06, z], [0, 0, 0], [1, 1.15, 1]), { tile: 0.3, ...FLAT });
  room.geo('copper', spike(0.055, 0.09, 7), tiltMatrix([x, y - 0.24, z], [Math.PI, 0, 0]), { tile: 0.1, ...FLAT });

  for (let i = 0; i < 5; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = room.range(0.2, 0.42);
    room.geo(
      'down',
      quad(room.range(0.05, 0.1), room.range(0.03, 0.06)),
      tiltMatrix([x + Math.cos(a) * d, y + room.range(-0.16, 0.2), z + Math.sin(a) * d], [room.range(0, 3), a, room.range(0, 3)]),
      FLAT,
    );
  }

  if (!lit) return null;
  glowPool(room, x, z, 2.6);
  const lamp = new THREE.PointLight(0xffc478, intensity, room.ctx.dims.cellSize * 1.7, 2);
  lamp.position.set(x, y - 0.3, z);
  room.light(lamp);
  gutter(room, lamp, intensity);
  return lamp;
}

/**
 * A tapped sap spigot with a bowl under it: the Bower's other warm light, and
 * the one that says somebody is still farming this tree.
 */
export function sapTap(room: Room, side: Side, along: number, y: number, lit: boolean, intensity = 8, cell: Cell = [0, 0]): THREE.PointLight | null {
  const { position: p, rotationY } = wallPose(room, side, along, 0.08, cell);
  const out = 0.3;
  const gx = p[0] - Math.sin(rotationY + Math.PI) * out;
  const gz = p[2] - Math.cos(rotationY + Math.PI) * out;

  // The wound in the wall, the spile driven into it, and the run down the wall.
  room.box('pulpProp', [0.34, 0.44, 0.05], [p[0], y - 0.1, p[2]], rotationY, { tile: 0.2 });
  room.geo('copper', cyl(0.032, 0.038, 0.3, 7), tiltMatrix([(p[0] + gx) / 2, y + 0.08, (p[2] + gz) / 2], [Math.PI / 2.3, rotationY, 0]), {
    tile: 0.2,
    ...FLAT,
  });
  room.box(lit ? 'surface.sapHot' : 'sapWet', [0.06, 0.5, 0.03], [p[0], y - 0.16, p[2]], rotationY, { tile: 0.15 });

  // The bowl, and what is in it. Back-faced fluid so the bowl is not a drum.
  room.geo('pottery', cyl(0.17, 0.11, 0.13, 12), poseMatrix([gx, y - 0.42, gz]), { tile: 0.25, ...FLAT });
  room.geo(lit ? 'surface.sapHot' : 'sapWet', disc(0.15, 12), tiltMatrix([gx, y - 0.36, gz], [-Math.PI / 2, 0, 0]), FLAT);
  // A stand under the bowl, because a bowl floating at chest height is a bug.
  post(room, 'timberDark', 0.05, 0.09, y - 0.48, [gx, 0, gz], 6, FLAT);
  room.geo('timberDark', disc(0.2, 10), tiltMatrix([gx, 0.02, gz], [-Math.PI / 2, 0, 0]), FLAT);

  if (!lit) return null;
  glowPool(room, gx, gz, 1.5);
  wallGlow(room, side, along, y - 0.1, 1.4, 'sapWash', cell);
  const lamp = new THREE.PointLight(0xffa040, intensity, room.ctx.dims.cellSize * 1.3, 2);
  lamp.position.set(gx, y - 0.16, gz);
  room.light(lamp);
  gutter(room, lamp, intensity, 0.1, 3.2);
  return lamp;
}

/**
 * A patch of foxfire growing on something: the Thicket's whole lighting design,
 * and it costs no light budget at all.
 *
 * Nodules on a dark ground, never a continuous crust - a glowing line beside a
 * dark one reads as a string of party lights (docs/art/ROOM_REVIEW.md), and the
 * same is true of a glowing sheet.
 */
export function foxfire(room: Room, centre: Vec3, radius: number, count: number, vertical = false): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * radius;
    const r = room.range(0.025, 0.075);
    // Scattered across the floor plane, or up a wall face if `vertical`.
    const p: Vec3 = vertical
      ? [centre[0] + Math.cos(a) * d, centre[1] + Math.sin(a) * d, centre[2] + room.range(-0.05, 0.05)]
      : [centre[0] + Math.cos(a) * d, centre[1] + room.range(-0.04, 0.04), centre[2] + Math.sin(a) * d];
    room.geo('surface.foxHot', ball(r, 6), tiltMatrix(p, [0, a, 0], [1.3, 0.55, 1.1]), { tile: 0.2, ...FLAT });
    if (i % 3 === 0) room.geo('gill', disc(r * 1.5, 8), tiltMatrix([p[0], p[1] + r * 0.5, p[2]], [-Math.PI / 2, a, 0]), FLAT);
  }
}

/**
 * A bank of glowing gill-fungus on a wall: the Thicket's practical.
 *
 * The caps are dark on top and the light comes off the UNDERSIDE, which is both
 * what a mushroom does and what makes it read as a shape rather than as a blob.
 */
export function gillLamp(room: Room, side: Side, along: number, y: number, lit: boolean, intensity = 8, cell: Cell = [0, 0]): THREE.PointLight | null {
  const { position: p, rotationY } = wallPose(room, side, along, 0.04, cell);
  const outX = -Math.sin(rotationY + Math.PI);
  const outZ = -Math.cos(rotationY + Math.PI);

  for (let i = 0; i < 4; i++) {
    const dy = y + room.range(-0.3, 0.3);
    const dAlong = room.range(-0.34, 0.34);
    const r = room.range(0.12, 0.26);
    const px = p[0] + Math.cos(rotationY) * dAlong + outX * r * 0.42;
    const pz = p[2] - Math.sin(rotationY) * dAlong + outZ * r * 0.42;
    // The cap: a squashed half-dome leaning out and down off the wall.
    room.geo('bracket', ball(r, 8), tiltMatrix([px, dy, pz], [0.24, rotationY, 0], [1.15, 0.36, 0.85]), { tile: 0.3, ...FLAT });
    // The gills under it. This is the light.
    room.geo(lit ? 'gill' : 'mycelium', disc(r * 0.86, 12), tiltMatrix([px, dy - 0.055, pz], [Math.PI / 2 - 0.2, rotationY, 0]), FLAT);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3 - 0.5) * 1.8;
      room.box(lit ? 'gill' : 'mycelium', [0.012, 0.03, r * 0.8], [px + Math.cos(rotationY + a) * 0.03, dy - 0.075, pz - Math.sin(rotationY + a) * 0.03], rotationY + a, { tile: 0.1, ...FLAT });
    }
  }

  if (!lit) return null;
  wallGlow(room, side, along, y - 0.1, 2.2, 'foxWash', cell);
  /**
   * Pale rather than saturated, and brighter to compensate.
   *
   * The first pass ran this at `0x7ce0b4` and every Thicket room came back off
   * the contact sheet as one flat green wash with no wood colour left in it -
   * which is the crypt's cave-lamp finding in a different hue. What floods a
   * room is the saturation, not the brightness (docs/art/ROOM_REVIEW.md).
   */
  const lamp = new THREE.PointLight(0xc4ecd8, intensity * 1.35, room.ctx.dims.cellSize * 1.5, 2);
  lamp.position.set(p[0] + outX * 0.55, y - 0.24, p[2] + outZ * 0.55);
  room.light(lamp);
  breathe(room, lamp, intensity * 1.35, 0.24, 0.3);
  return lamp;
}

/** Wax candles in a group, on a surface. Emissive only - no light budget spent. */
export function candles(room: Room, x: number, y: number, z: number, count: number, spread = 0.16): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + room.range(0, 1);
    const d = i === 0 ? 0 : room.range(spread * 0.4, spread);
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const h = room.range(0.08, 0.24);
    room.geo('wax', cyl(0.021, 0.026, h, 6), poseMatrix([px, y + h / 2, pz]), { tile: 0.1, ...FLAT });
    // The drip skirt: a candle without one is a dowel.
    room.geo('wax', ball(0.035, 6), tiltMatrix([px, y + 0.02, pz], [0, a, 0], [1, 0.5, 1]), { tile: 0.1, ...FLAT });
    room.geo('flame', spike(0.016, 0.055, 5), poseMatrix([px, y + h + 0.028, pz]), FLAT);
  }
  room.geo('sapWash', disc(spread * 3.4, 12), tiltMatrix([x, y + 0.008, z], [-Math.PI / 2, 0, 0]), FLAT);
}

/* --- suspended volume --------------------------------------------------------- */

/**
 * Motes hanging in the air: pollen, spores, dust in a shaft, ash.
 *
 * Tiny unlit specks rather than a haze quad, because a hundred points of light
 * in a column read as volume and one translucent rectangle reads as a pane of
 * fog standing in the room.
 */
export function motes(
  room: Room,
  x: number,
  z: number,
  radius: number,
  height: number,
  count: number,
  kind: 'pollen' | 'spore' | 'bloom' | 'dust' = 'pollen',
): void {
  const material = kind === 'spore' ? 'lumenFox' : kind === 'bloom' ? 'lumenBloom' : kind === 'dust' ? 'down' : 'lumenSap';
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * radius;
    room.geo(
      material,
      ball(room.range(0.008, 0.022), 4),
      poseMatrix([x + Math.cos(a) * d, room.range(0.3, height), z + Math.sin(a) * d]),
      FLAT,
    );
  }
}

/**
 * A plume of something rising: spore smoke off a bracket, pollen off a bloom,
 * mist off standing water.
 *
 * Additive and masked. Vapour in a dark room is light scattering, not a grey
 * surface: alpha-blended it lays a film over the very thing it is rising off,
 * and unmasked it has four hard corners (docs/art/ART_GUIDE.md §4).
 */
export function plume(room: Room, x: number, z: number, y: number, height: number, width: number, material = 'hazeSpore'): void {
  for (let i = 0; i < 2; i++) {
    room.geo(material, quad(width, height), tiltMatrix([x, y + height / 2, z], [0, (i * Math.PI) / 2 + 0.4, 0]), FLAT);
  }
}

/* --- the Bower's furniture ------------------------------------------------------ */

/**
 * A trestle table: top, two carved trestle ends, a stretcher.
 *
 * The collider is the whole footprint - you cannot walk under a table in a game
 * with no vertical movement, so pretending you might is a snag rather than a
 * feature.
 */
export function table(room: Room, x: number, z: number, w: number, d: number, h = 0.78, rotationY = 0): void {
  room.box('timber', [w, 0.07, d], [x, h, z], rotationY, { tile: 0.9, ...CASTS });
  room.box('timberDark', [w - 0.14, 0.05, d - 0.12], [x, h - 0.05, z], rotationY, { tile: 0.5 });
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  for (const s of [-1, 1]) {
    const ox = cos * s * (w / 2 - 0.3);
    const oz = -sin * s * (w / 2 - 0.3);
    // A slab trestle with a shaped foot, not four sticks: a shaped end is what
    // makes a table read as joinery.
    room.box('timber', [0.11, h - 0.12, d - 0.16], [x + ox, 0.12, z + oz], rotationY, { tile: 0.4 });
    room.box('timberDark', [0.2, 0.09, d - 0.06], [x + ox, 0.03, z + oz], rotationY, { tile: 0.3 });
    room.box('timber', [0.28, 0.09, d - 0.3], [x + ox, h - 0.16, z + oz], rotationY, { tile: 0.3 });
  }
  room.box('timber', [w - 0.5, 0.08, 0.09], [x, h * 0.42, z], rotationY, { tile: 0.4 });
  room.collider({ kind: 'box', center: [x, z], halfExtents: [w / 2 - 0.06, d / 2 - 0.06], rotationY });
}

/** A bench, with the same trestle language as the table. */
export function bench(room: Room, x: number, z: number, w: number, rotationY = 0, h = 0.44): void {
  room.box('timber', [w, 0.06, 0.36], [x, h, z], rotationY, { tile: 0.7 });
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  for (const s of [-1, 1]) {
    room.box('timberDark', [0.09, h, 0.3], [x + cos * s * (w / 2 - 0.22), 0, z - sin * s * (w / 2 - 0.22)], rotationY, { tile: 0.3 });
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [w / 2 - 0.05, 0.16], rotationY });
}

/** A stool: three legs and a dished seat. No collider - you step round it. */
export function stool(room: Room, x: number, z: number, h = 0.42): void {
  room.geo('timber', cyl(0.17, 0.15, 0.05, 10), poseMatrix([x, h, z]), { tile: 0.2, ...FLAT });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + room.range(0, 0.6);
    strut(room, 'timberDark', [x + Math.cos(a) * 0.1, h, z + Math.sin(a) * 0.1], [x + Math.cos(a) * 0.16, 0, z + Math.sin(a) * 0.16], 0.022, 5, FLAT);
  }
}

/**
 * A chair with a high carved back. The one piece of Bower furniture with a
 * silhouette, which is why the back is tall and pierced.
 */
export function chair(room: Room, x: number, z: number, rotationY = 0): void {
  room.box('timber', [0.42, 0.05, 0.4], [x, 0.44, z], rotationY, { tile: 0.3 });
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const ox = cos * sx * 0.17 + sin * sz * 0.16;
    const oz = -sin * sx * 0.17 + cos * sz * 0.16;
    room.box('timberDark', [0.045, 0.44, 0.045], [x + ox, 0, z + oz], rotationY, { tile: 0.2 });
  }
  // The back: two stiles, a crest rail and a pierced splat.
  for (const s of [-1, 1]) {
    room.box('timberDark', [0.05, 0.62, 0.05], [x + cos * s * 0.18 - sin * 0.17, 0.44, z - sin * s * 0.18 - cos * 0.17], rotationY, { tile: 0.2 });
  }
  room.box('timber', [0.44, 0.09, 0.06], [x - sin * 0.17, 1.02, z - cos * 0.17], rotationY, { tile: 0.2 });
  room.box('timber', [0.13, 0.5, 0.03], [x - sin * 0.17, 0.5, z - cos * 0.17], rotationY, { tile: 0.2 });
  room.geo('leaf', quad(0.2, 0.16), poseMatrix([x - sin * 0.19, 0.82, z - cos * 0.19], rotationY + Math.PI), FLAT);
}

/**
 * A wall shelf on carved brackets. `along` runs along the prop's own +X, which
 * the wall's facing turns - pair the item anchor with it by eye on a sheet
 * (docs/art/ROOM_FORMAT.md §2.1.1).
 */
export function shelf(room: Room, side: Side, along: number, y: number, width: number, depth = 0.32, cell: Cell = [0, 0]): void {
  const { position: p, rotationY } = wallPose(room, side, along, depth / 2, cell);
  room.box('timber', [width, 0.05, depth], [p[0], y, p[2]], rotationY, { tile: 0.5 });
  room.box('timberDark', [width, 0.03, 0.05], [p[0] - Math.sin(rotationY + Math.PI) * (depth / 2 - 0.02), y + 0.05, p[2] - Math.cos(rotationY + Math.PI) * (depth / 2 - 0.02)], rotationY, { tile: 0.3 });
  const brackets = Math.max(2, Math.round(width / 0.8));
  for (let i = 0; i < brackets; i++) {
    const t = -width / 2 + (width * (i + 0.5)) / brackets;
    const bx = p[0] + Math.cos(rotationY) * t;
    const bz = p[2] - Math.sin(rotationY) * t;
    room.geo('timberDark', spike(0.1, 0.22, 4), tiltMatrix([bx, y - 0.11, bz], [Math.PI, rotationY + Math.PI / 4, 0], [1, 1, 0.5]), { tile: 0.2, ...FLAT });
  }
}

/** A standing cupboard or dresser, backed against a wall. Blocks. */
export function cupboard(room: Room, side: Side, along: number, width: number, height = 1.8, depth = 0.44, cell: Cell = [0, 0]): void {
  const { position: p, rotationY } = wallPose(room, side, along, depth / 2 + 0.02, cell);
  room.solid('timber', [width, height, depth], [p[0], 0, p[2]], rotationY, { tile: 0.8, ...CASTS });
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const outX = -Math.sin(rotationY + Math.PI) * (depth / 2 + 0.01);
  const outZ = -Math.cos(rotationY + Math.PI) * (depth / 2 + 0.01);
  // Two doors with a muntin between them and a carved panel in each.
  for (const s of [-1, 1]) {
    const ox = cos * s * width * 0.24;
    const oz = -sin * s * width * 0.24;
    room.box('timberDark', [width * 0.44, height * 0.52, 0.03], [p[0] + ox + outX, height * 0.24, p[2] + oz + outZ], rotationY, { tile: 0.3 });
    room.geo('copper', ball(0.035, 6), poseMatrix([p[0] + cos * s * 0.06 + outX * 1.6, height * 0.5, p[2] - sin * s * 0.06 + outZ * 1.6]), { tile: 0.1, ...FLAT });
  }
  // A cornice, because a box with a cornice is furniture and a box is a box.
  room.box('timberDark', [width + 0.1, 0.08, depth + 0.09], [p[0], height, p[2]], rotationY, { tile: 0.3 });
  room.box('timber', [width + 0.05, 0.05, depth + 0.05], [p[0], height + 0.08, p[2]], rotationY, { tile: 0.3 });
}

/** A woven basket, open or lidded. Small enough to carry no collider. */
export function basket(room: Room, x: number, z: number, r: number, h: number, lidded = false): void {
  room.geo('surface.wicker', cyl(r, r * 0.82, h, 12, true), poseMatrix([x, h / 2, z]), { tile: 0.4, ...FLAT });
  room.geo('surface.wicker', disc(r * 0.85, 12), tiltMatrix([x, 0.02, z], [-Math.PI / 2, 0, 0]), FLAT);
  room.geo('timberDark', ring(r, 0.02, 12), tiltMatrix([x, h, z], [Math.PI / 2, 0, 0]), { tile: 0.2, ...FLAT });
  if (lidded) {
    room.geo('surface.wicker', ball(r * 1.02, 10), tiltMatrix([x, h, z], [0, room.range(0, 3), 0], [1, 0.34, 1]), { tile: 0.3, ...FLAT });
  }
}

/** A fired clay pot or jar on a surface. */
export function pot(room: Room, x: number, y: number, z: number, r: number, h: number, material = 'pottery'): void {
  room.geo(material, cyl(r * 0.62, r * 0.8, h * 0.35, 10), poseMatrix([x, y + h * 0.175, z]), { tile: 0.2, ...FLAT });
  room.geo(material, ball(r, 9), tiltMatrix([x, y + h * 0.5, z], [0, 0, 0], [1, h / (r * 2.2), 1]), { tile: 0.25, ...FLAT });
  room.geo(material, cyl(r * 0.42, r * 0.34, h * 0.22, 9), poseMatrix([x, y + h * 0.88, z]), { tile: 0.15, ...FLAT });
}

/** A glass phial of sap, standing or hanging. The fluid is back-faced. */
export function phial(room: Room, x: number, y: number, z: number, r: number, h: number, lit: boolean): void {
  room.geo(lit ? 'sapFluid' : 'itemGlass', cyl(r * 0.92, r * 0.92, h * 0.7, 8), poseMatrix([x, y + h * 0.35, z]), { tile: 0.1, ...FLAT });
  room.geo('itemGlass', cyl(r, r, h, 8, true), poseMatrix([x, y + h / 2, z]), { tile: 0.1, ...FLAT });
  room.geo('wax', cyl(r * 0.55, r * 0.7, h * 0.16, 7), poseMatrix([x, y + h, z]), { tile: 0.1, ...FLAT });
  if (lit) room.geo('lumenSap', ball(r * 0.6, 6), poseMatrix([x, y + h * 0.32, z]), FLAT);
}

/**
 * A hanging: tapestry, banner, dust sheet or drying herbs, on a rail.
 *
 * Double-sided and faintly self-lit through the material, and hung with a fold
 * in it: a flat panel of cloth reads as a painted rectangle, and it is the
 * *fall* catching light at a different angle that makes it cloth
 * (docs/art/ROOM_REVIEW.md).
 */
export function hanging(room: Room, side: Side, along: number, y: number, width: number, height: number, material = 'weave', cell: Cell = [0, 0]): void {
  const { position: p, rotationY } = wallPose(room, side, along, 0.1, cell);
  room.box('timberDark', [width + 0.16, 0.05, 0.06], [p[0], y + height, p[2]], rotationY, { tile: 0.3 });
  const folds = Math.max(3, Math.round(width / 0.36));
  for (let i = 0; i < folds; i++) {
    const t = -width / 2 + (width * (i + 0.5)) / folds;
    const lean = ((i % 2) - 0.5) * 0.18;
    const px = p[0] + Math.cos(rotationY) * t - Math.sin(rotationY + Math.PI) * (0.02 + Math.abs(lean) * 0.1);
    const pz = p[2] - Math.sin(rotationY) * t - Math.cos(rotationY + Math.PI) * (0.02 + Math.abs(lean) * 0.1);
    room.geo(material, quad(width / folds + 0.06, height), tiltMatrix([px, y + height / 2, pz], [0, rotationY + Math.PI, lean * 0.12]), FLAT);
  }
}

/* --- growing things ------------------------------------------------------------ */

/**
 * A buttress root swelling out of a wall corner. Blocks - it is the size of a
 * sofa - so it belongs in a corner with a metre and a half of margin.
 */
export function buttress(room: Room, x: number, z: number, rotationY: number, height: number, spread = 1.0): void {
  const top: Vec3 = [x, height, z];
  const foot: Vec3 = [x + Math.sin(rotationY) * spread, 0, z + Math.cos(rotationY) * spread];
  // The blade of the buttress: three overlapping slabs leaning out.
  for (let i = 0; i < 3; i++) {
    const t = i / 3;
    slab(
      room,
      'barkProp',
      [0.52 - t * 0.14, height * (1 - t * 0.5), 0.3 + t * 0.3],
      [x + (foot[0] - x) * t * 0.9, (height * (1 - t * 0.5)) / 2, z + (foot[2] - z) * t * 0.9],
      [0, rotationY, 0],
      { tile: 0.9, ...CASTS },
    );
  }
  limb(room, 'root', top, foot, 0.19, 0.28, 0.1, x + z, 5, { tile: 0.7 });
  // Rootlets running away from the foot, flat on the floor and carrying nothing.
  for (let i = 0; i < 4; i++) {
    const a = rotationY + room.range(-0.9, 0.9);
    limb(
      room,
      'root',
      [foot[0], 0.06, foot[2]],
      [foot[0] + Math.sin(a) * room.range(0.7, 1.5), 0.03, foot[2] + Math.cos(a) * room.range(0.7, 1.5)],
      0.08,
      0.025,
      0.12,
      i * 3 + x,
      4,
      { tile: 0.4, ...FLAT },
    );
  }
  room.collider({ kind: 'circle', center: [x + Math.sin(rotationY) * spread * 0.4, z + Math.cos(rotationY) * spread * 0.4], radius: 0.46 });
}

/**
 * A tangle of roots across a wall or the floor: decoration only, no collider.
 * The version you can safely put anywhere.
 */
export function rootWeb(room: Room, x: number, y: number, z: number, radius: number, count: number, material = 'root'): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const b = a + room.range(1.6, 4.6);
    limb(
      room,
      material,
      [x + Math.cos(a) * radius, y + room.range(-0.1, 0.3), z + Math.sin(a) * radius],
      [x + Math.cos(b) * radius, y + room.range(-0.1, 0.3), z + Math.sin(b) * radius],
      room.range(0.03, 0.08),
      room.range(0.02, 0.05),
      room.range(0.1, 0.35),
      i * 7 + x,
      5,
      { tile: 0.4, ...FLAT },
    );
  }
}

/**
 * Vines falling from the ceiling. Their own batcher and a slow sway, because
 * anything animated has to stay out of the room's batch - but "out of the batch"
 * is not "one mesh per leaf" (docs/art/ROOM_REVIEW.md).
 */
export function vineFall(
  room: Room,
  x: number,
  z: number,
  radius: number,
  count: number,
  material = 'vine',
  leaves = true,
): void {
  const batch = new MeshBatcher();
  const group = new THREE.Group();
  const ceiling = room.ctx.dims.ceilingHeight;
  const mat = room.mat(material);
  // A stand with leaves costs TWO draw calls and one without costs one, which is
  // the difference between nine stands of tendril at nine draws and at eighteen.
  // Only reach for the leafed version where the leaves are the point.
  const leafMat = leaves ? room.mat(material === 'vine' ? 'leaf' : 'leafDead') : mat;

  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * radius;
    const px = Math.cos(a) * d;
    const pz = Math.sin(a) * d;
    const len = room.range(0.7, ceiling - 0.6);
    const segs = 3;
    let prev: Vec3 = [px, ceiling - 0.1, pz];
    const seed = i * 3.7;
    for (let k = 1; k <= segs; k++) {
      const t = k / segs;
      const next: Vec3 = [
        px + Math.sin(seed + t * 3) * 0.12 * t,
        ceiling - 0.1 - len * t,
        pz + Math.cos(seed + t * 2.3) * 0.12 * t,
      ];
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const dz = next[2] - prev[2];
      const l = Math.hypot(dx, dy, dz);
      batch.add(
        mat,
        cyl(0.016, 0.024, l, 4, true),
        tiltMatrix([(prev[0] + next[0]) / 2, (prev[1] + next[1]) / 2, (prev[2] + next[2]) / 2], [Math.acos(dy / l), Math.atan2(dx, dz), 0]),
        { tile: 0.3, castShadow: false, receiveShadow: false },
      );
      if (k === segs) {
        if (leaves) {
          batch.add(
            leafMat,
            quad(room.range(0.1, 0.2), room.range(0.07, 0.13)),
            tiltMatrix(next, [room.range(-1, 1), room.range(0, 3), room.range(-1, 1)]),
            { castShadow: false, receiveShadow: false },
          );
        } else {
          // A swelling instead of a leaf, in the cord's own material.
          batch.add(mat, ball(room.range(0.026, 0.05), 5), tiltMatrix(next, [0, k, 0], [1, 1.4, 1]), {
            tile: 0.15,
            castShadow: false,
            receiveShadow: false,
          });
        }
      }
      prev = next;
    }
  }
  const built = batch.build();
  group.add(built.object);
  group.position.set(x, 0, z);
  room.loose(group);
  room.own(built);

  // Sway about the ceiling rather than about the floor: pivoting a hanging thing
  // at its bottom is how a curtain ends up scything through the room.
  const phase = room.range(0, 20);
  room.tick((t) => {
    group.rotation.x = Math.sin(t * 0.42 + phase) * 0.018;
    group.rotation.z = Math.cos(t * 0.33 + phase * 1.3) * 0.018;
  });
}

/** Shelf fungus climbing a wall or a trunk: dry caps, no glow. */
export function brackets(room: Room, side: Side, along: number, y0: number, count: number, cell: Cell = [0, 0]): void {
  const { position: p, rotationY } = wallPose(room, side, along, 0.02, cell);
  for (let i = 0; i < count; i++) {
    const dy = y0 + i * room.range(0.24, 0.42);
    const dAlong = room.range(-0.4, 0.4);
    const r = room.range(0.16, 0.34);
    const px = p[0] + Math.cos(rotationY) * dAlong - Math.sin(rotationY + Math.PI) * r * 0.4;
    const pz = p[2] - Math.sin(rotationY) * dAlong - Math.cos(rotationY + Math.PI) * r * 0.4;
    room.geo('bracket', ball(r, 9), tiltMatrix([px, dy, pz], [0.18, rotationY + room.range(-0.3, 0.3), 0], [1.2, 0.24, 0.8]), { tile: 0.35, ...FLAT });
    room.geo('mycelium', disc(r * 0.8, 10), tiltMatrix([px, dy - 0.04, pz], [Math.PI / 2 - 0.16, rotationY, 0]), FLAT);
  }
}

/** Toadstools on the floor. Pale, waxy, and there is always one lying over. */
export function toadstools(room: Room, x: number, z: number, radius: number, count: number, glowing = false): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * radius;
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const h = room.range(0.1, 0.34);
    const cap = room.range(0.05, 0.14);
    const lean = room.range(-0.16, 0.16);
    room.geo('toadstool', cyl(cap * 0.28, cap * 0.42, h, 6), tiltMatrix([px, h / 2, pz], [lean, a, 0]), { tile: 0.15, ...FLAT });
    room.geo('toadstool', ball(cap, 8), tiltMatrix([px + Math.sin(lean) * h, h, pz], [0, a, 0], [1, 0.62, 1]), { tile: 0.2, ...FLAT });
    room.geo(glowing ? 'gill' : 'mycelium', disc(cap * 0.86, 9), tiltMatrix([px + Math.sin(lean) * h, h - 0.012, pz], [Math.PI / 2, 0, 0]), FLAT);
  }
  if (glowing) glowPool(room, x, z, radius * 1.7, 'foxWash');
}

/** A stump or a sawn bough end, with rings on the cut face. Blocks. */
export function stump(room: Room, x: number, z: number, r: number, h: number): void {
  room.geo('barkProp', cyl(r * 0.95, r, h, 11), poseMatrix([x, h / 2, z]), { tile: 0.7, ...CASTS });
  room.geo('surface.parquet', disc(r * 0.93, 12), tiltMatrix([x, h + 0.005, z], [-Math.PI / 2, 0, 0]), FLAT);
  // Two or three roots running away from the base, flat and collider-free.
  for (let i = 0; i < 3; i++) {
    const a = room.range(0, Math.PI * 2);
    limb(room, 'root', [x + Math.cos(a) * r * 0.8, 0.07, z + Math.sin(a) * r * 0.8], [x + Math.cos(a) * (r + room.range(0.5, 1.1)), 0.02, z + Math.sin(a) * (r + room.range(0.5, 1.1))], 0.09, 0.03, 0.1, i + x, 4, { tile: 0.4, ...FLAT });
  }
  room.blockCircle(x, z, r - 0.04);
}

/**
 * Fallen branches and bark plate. Places colliders at seeded-random positions,
 * so it belongs in a corner with a metre and a half of margin - a heap of it
 * near a doorway seals the doorway on some seeds and not others, which
 * `validate:art` reports eleven different ways.
 */
export function deadfall(room: Room, x: number, z: number, radius: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * radius;
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const len = room.range(0.5, 1.5);
    const yaw = room.range(0, Math.PI * 2);
    const r = room.range(0.05, 0.11);
    room.geo(i % 3 === 0 ? 'rotProp' : 'barkProp', cyl(r * 0.7, r, len, 6), tiltMatrix([px, r + room.range(0, 0.08), pz], [Math.PI / 2 + room.range(-0.2, 0.2), yaw, 0]), { tile: 0.4, ...CASTS });
    if (i % 2 === 0) {
      room.collider({ kind: 'box', center: [px, pz], halfExtents: [len / 2 - 0.05, r], rotationY: yaw });
    }
  }
}

/** The same look with nothing solid in it. Use this anywhere near a door lane. */
export function litter(room: Room, x: number, z: number, radius: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * radius;
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const kind = i % 4;
    if (kind === 0) {
      room.geo('barkProp', ball(room.range(0.1, 0.22), 5), tiltMatrix([px, 0.02, pz], [room.range(-0.2, 0.2), room.range(0, 3), 0], [1.5, 0.16, 1.1]), { tile: 0.4, ...FLAT });
    } else if (kind === 1) {
      room.geo('leafDead', quad(room.range(0.12, 0.24), room.range(0.09, 0.16)), tiltMatrix([px, 0.015 + room.range(0, 0.02), pz], [-Math.PI / 2 + room.range(-0.3, 0.3), room.range(0, 3), 0]), FLAT);
    } else if (kind === 2) {
      room.geo('rotProp', cyl(0.03, 0.045, room.range(0.2, 0.5), 5), tiltMatrix([px, 0.035, pz], [Math.PI / 2, room.range(0, 3), 0]), { tile: 0.2, ...FLAT });
    } else {
      room.geo('moss', ball(room.range(0.12, 0.26), 6), tiltMatrix([px, 0.01, pz], [0, room.range(0, 3), 0], [1.3, 0.2, 1.2]), { tile: 0.3, ...FLAT });
    }
  }
}

/** Moss and lichen creeping up something. Flat, cheap, and it goes everywhere. */
export function mossPatch(room: Room, x: number, y: number, z: number, radius: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * radius;
    room.geo(
      i % 4 === 0 ? 'lichen' : 'moss',
      ball(room.range(0.08, 0.2), 6),
      tiltMatrix([x + Math.cos(a) * d, y, z + Math.sin(a) * d], [0, a, 0], [1.3, 0.18, 1.2]),
      { tile: 0.3, ...FLAT },
    );
  }
}

/* --- what lives here ------------------------------------------------------------ */

/**
 * A corner of sheet web with radial lines out of it.
 *
 * Never a full-width curtain: a sheet right across a room blocks the one thing
 * that room is for, and at any distance reads as a flat grey rectangle floating
 * in it (docs/art/ROOM_REVIEW.md).
 */
export function webCorner(room: Room, x: number, y: number, z: number, size: number, rotationY: number, layers = 3): void {
  // `size` is the SPREAD of the patch, not the size of one quad. Three quads at
  // the full spread is three pale slabs; a dozen at a third of it, at scattered
  // angles and depths, is sheet web (docs/art/ROOM_REVIEW.md).
  const count = layers * 4;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const s = size * (0.2 + room.rng() * 0.22);
    room.geo(
      'silkProp',
      quad(s, s * room.range(0.7, 1.3)),
      tiltMatrix(
        [x + room.range(-size * 0.35, size * 0.35), y + room.range(-size * 0.3, size * 0.25), z + room.range(-size * 0.35, size * 0.35)],
        [room.range(-1.0, 1.0), rotationY + t * 3.4, room.range(-0.9, 0.9)],
      ),
      FLAT,
    );
  }
  for (let i = 0; i < 5; i++) {
    const a = room.range(0, Math.PI * 2);
    const len = room.range(0.4, 1.1);
    room.geo(
      'strand',
      boxGeometry(len, 0.011, 0.011),
      tiltMatrix([x + Math.cos(a) * len * 0.5, y + room.range(-0.4, 0.4), z + Math.sin(a) * len * 0.5], [room.range(-0.5, 0.5), a, room.range(-0.3, 0.3)]),
      { tile: 0.2, ...FLAT },
    );
  }
}

/** An egg sac: pale, papery, and there are always more than you first counted. */
export function eggSac(room: Room, x: number, y: number, z: number, r: number, hanging = true): void {
  room.geo('carapacePale', ball(r, 8), tiltMatrix([x, y, z], [0, room.range(0, 3), 0], [1, 1.2, 0.95]), { tile: 0.25, ...FLAT });
  room.geo('silkProp', ball(r * 1.12, 7), tiltMatrix([x, y + r * 0.1, z], [0, room.range(0, 3), 0], [1, 1.05, 1]), { tile: 0.3, ...FLAT });
  if (hanging) {
    room.geo('strand', boxGeometry(0.014, room.ctx.dims.ceilingHeight - y - r, 0.014), poseMatrix([x, (room.ctx.dims.ceilingHeight + y + r) / 2, z]), FLAT);
  }
  // The mass of eyes on it is what makes it a sac rather than a bag.
  for (let i = 0; i < 5; i++) {
    const a = room.range(0, Math.PI * 2);
    room.geo('chitin', ball(r * 0.09, 4), poseMatrix([x + Math.cos(a) * r * 0.7, y + room.range(-r * 0.5, r * 0.5), z + Math.sin(a) * r * 0.7]), FLAT);
  }
}

/**
 * Something the size of a person, wrapped and hanging. The pack's most direct
 * horror prop, so it is deliberately never more than one per room.
 */
export function wrapped(room: Room, x: number, z: number, topY: number, length: number): void {
  const bodyY = topY - length * 0.55;
  room.geo('strand', boxGeometry(0.016, length * 0.35, 0.016), poseMatrix([x, topY - length * 0.175, z]), FLAT);
  // The wrap: a spindle with a narrow waist, not a cylinder. It has to read as a
  // shape with a head end.
  room.geo('silkProp', ball(length * 0.2, 8), tiltMatrix([x, bodyY + length * 0.2, z], [0, 0.4, 0], [0.72, 1.35, 0.72]), { tile: 0.3, ...FLAT });
  room.geo('silkProp', ball(length * 0.22, 8), tiltMatrix([x, bodyY - length * 0.1, z], [0, 1.1, 0], [0.86, 1.5, 0.8]), { tile: 0.3, ...FLAT });
  room.geo('carapacePale', ball(length * 0.12, 7), tiltMatrix([x, bodyY + length * 0.36, z], [0, 0.2, 0], [0.9, 1, 0.85]), { tile: 0.2, ...FLAT });
  // Binding turns, so it looks wound rather than moulded.
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    room.geo('strand', ring(length * (0.2 - t * 0.06), 0.012, 8), tiltMatrix([x, bodyY + length * (0.38 - t * 0.7), z], [Math.PI / 2 + room.range(-0.14, 0.14), room.range(0, 3), 0]), FLAT);
  }
  // One arm has come free of the wrapping. That is the whole prop.
  limb(room, 'carapacePale', [x + length * 0.1, bodyY + length * 0.1, z], [x + length * 0.34, bodyY - length * 0.18, z + length * 0.1], 0.045, 0.028, 0.05, x + z, 4, { tile: 0.2, ...FLAT });
}

/**
 * A spider, or the parts of one you can see: legs coming down out of the dark
 * and a body you cannot quite resolve.
 *
 * Built high and mostly out of the light. It is a silhouette, so the legs have
 * to be thick enough to survive being one - 5 cm ribs read as a black scribble
 * (docs/art/ROOM_REVIEW.md).
 */
export function spiderShape(room: Room, x: number, z: number, y: number, scale: number, legs = 8): void {
  room.geo('chitin', ball(scale * 0.46, 9), tiltMatrix([x, y, z], [0, 0.3, 0], [1, 0.78, 1.3]), { tile: 0.5, ...CASTS });
  room.geo('chitin', ball(scale * 0.26, 8), tiltMatrix([x, y - scale * 0.06, z - scale * 0.5], [0, 0, 0], [1, 0.85, 1]), { tile: 0.3, ...CASTS });
  /**
   * Eyes. These are a gameplay-legibility object rather than a decoration: a
   * player's first read of the room it stands in has to be "do not go under
   * that", so they are sized to carry the length of an L-shaped gallery and
   * through fog - which on the first contact sheet, at half this size, they did
   * not.
   */
  for (let i = 0; i < 4; i++) {
    const s = i < 2 ? -1 : 1;
    const k = i % 2;
    const px = x + s * scale * (0.1 + k * 0.11);
    const py = y - scale * 0.02 + k * scale * 0.07;
    const pz = z - scale * 0.7;
    room.geo('eyeDark', ball(scale * (k ? 0.08 : 0.1), 6), poseMatrix([px, py, pz]), FLAT);
    room.geo('eyeGlow', ball(scale * (k ? 0.055 : 0.075), 6), poseMatrix([px, py, pz - scale * 0.04]), FLAT);
  }
  for (let i = 0; i < legs; i++) {
    const s = i % 2 === 0 ? -1 : 1;
    const t = Math.floor(i / 2) / (legs / 2 - 1 || 1);
    const a = -0.7 + t * 1.4;
    const knee: Vec3 = [x + s * scale * (0.9 + t * 0.4), y + scale * 0.55, z + Math.sin(a) * scale * 1.5];
    const foot: Vec3 = [x + s * scale * (1.5 + t * 0.7), y - scale * 1.4, z + Math.sin(a) * scale * 2.3];
    limb(room, 'chitin', [x + s * scale * 0.3, y + scale * 0.1, z + Math.sin(a) * scale * 0.3], knee, scale * 0.075, scale * 0.05, 0.02, i * 3, 4, { tile: 0.3, ...CASTS });
    limb(room, 'chitin', knee, foot, scale * 0.05, scale * 0.02, 0.04, i * 5, 4, { tile: 0.3, ...CASTS });
  }
}

/**
 * Eyes opening in a wall. A gameplay-legibility object as much as a decoration:
 * it has to carry across a dark room and through fog.
 *
 * The iris stands PROUD of the sphere. Tucked inside where it anatomically
 * belongs, it renders as a black pit (docs/art/ROOM_REVIEW.md).
 */
export function wallEyes(room: Room, side: Side, along: number, y: number, count: number, spread = 0.9, cell: Cell = [0, 0]): void {
  const { position: p, rotationY } = wallPose(room, side, along, 0.02, cell);
  const outX = -Math.sin(rotationY + Math.PI);
  const outZ = -Math.cos(rotationY + Math.PI);
  for (let i = 0; i < count; i++) {
    const dAlong = room.range(-spread, spread);
    const dy = y + room.range(-spread * 0.6, spread * 0.6);
    const r = room.range(0.05, 0.11);
    const px = p[0] + Math.cos(rotationY) * dAlong + outX * r * 0.5;
    const pz = p[2] - Math.sin(rotationY) * dAlong + outZ * r * 0.5;
    // Lid: a lipped almond of pale tissue around the eye.
    room.geo('pulpProp', ball(r * 1.6, 7), tiltMatrix([px, dy, pz], [0, rotationY, 0], [1.3, 0.75, 0.42]), { tile: 0.2, ...FLAT });
    room.geo('eyeGlow', ball(r, 7), poseMatrix([px + outX * r * 0.42, dy, pz + outZ * r * 0.42]), FLAT);
    room.geo('eyeDark', ball(r * 0.42, 6), poseMatrix([px + outX * r * 0.95, dy, pz + outZ * r * 0.95]), FLAT);
  }
}

/**
 * The Bloom's flower: a rosette of violet petals on a fleshy boss, with a
 * stamen crown. Small ones scatter; one big one is a set piece.
 */
export function bloomFlower(room: Room, x: number, y: number, z: number, r: number, rotation: readonly [number, number, number] = [0, 0, 0]): void {
  const petals = 7;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 + room.range(-0.12, 0.12);
    room.geo(
      'petalViolet',
      quad(r * 0.8, r * 1.5),
      tiltMatrix([x + Math.cos(a) * r * 0.6, y + r * 0.24, z + Math.sin(a) * r * 0.6], [rotation[0] - 0.95, -a + rotation[1], rotation[2]]),
      FLAT,
    );
  }
  room.geo('bloomFlesh', ball(r * 0.42, 8), tiltMatrix([x, y + r * 0.16, z], rotation as [number, number, number], [1, 0.7, 1]), { tile: 0.2, ...FLAT });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    strut(room, 'lumenBloom', [x + Math.cos(a) * r * 0.1, y + r * 0.2, z + Math.sin(a) * r * 0.1], [x + Math.cos(a) * r * 0.3, y + r * 0.72, z + Math.sin(a) * r * 0.3], r * 0.045, 4, FLAT, true);
    room.geo('lumenBloom', ball(r * 0.09, 5), poseMatrix([x + Math.cos(a) * r * 0.3, y + r * 0.74, z + Math.sin(a) * r * 0.3]), FLAT);
  }
}

/**
 * A fae figure: a standing thing of bound twig, antler and flowers, wearing a
 * face that is a wooden mask.
 *
 * What makes a silhouette read as a person is that it is NOT a rectangle: two
 * legs with daylight between them, a waist narrower than the shoulders, a round
 * head (docs/art/ROOM_REVIEW.md). What makes this one read as *wrong* is that it
 * is a person built out of the wrong materials.
 */
export function faeFigure(room: Room, x: number, z: number, rotationY: number, height = 1.85, crowned = true): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (dx: number, y: number, dz: number): Vec3 => [x + cos * dx - sin * dz, y, z + sin * dx + cos * dz];

  // Two legs, with a real gap between them.
  for (const s of [-1, 1]) {
    limb(room, 'vine', at(s * 0.11, 0, 0), at(s * 0.14, height * 0.5, 0.02), 0.055, 0.045, 0.02, s * 3 + x, 4, { tile: 0.3 });
  }
  // A waist, then shoulders wider than it.
  room.geo('vine', cyl(0.15, 0.11, height * 0.3, 8), poseMatrix(at(0, height * 0.65, 0)), { tile: 0.3, ...CASTS });
  room.geo('weaveGreen', cyl(0.2, 0.15, height * 0.2, 9, true), poseMatrix(at(0, height * 0.76, 0)), { tile: 0.3, ...FLAT });
  room.box('vine', [0.4, 0.08, 0.13], at(0, height * 0.84, 0), rotationY, { tile: 0.2 });
  // Arms hanging, ending in nothing. Empty sleeves are what separate a robed
  // figure from an object.
  for (const s of [-1, 1]) {
    limb(room, 'vine', at(s * 0.2, height * 0.84, 0), at(s * 0.26, height * 0.44, 0.06), 0.045, 0.03, 0.05, s * 7 + z, 4, { tile: 0.25 });
  }
  // Head: a round mask on a thin neck.
  room.geo('vine', cyl(0.035, 0.045, 0.09, 6), poseMatrix(at(0, height * 0.9, 0)), { tile: 0.15, ...FLAT });
  room.geo('timberPale', ball(0.115, 9), tiltMatrix(at(0, height * 0.97, 0), [0, rotationY, 0], [1, 1.15, 0.9]), { tile: 0.2, ...CASTS });
  // The mask's two holes. Dark, not glowing: the ones in the wall glow, and this
  // is more frightening for not doing it.
  for (const s of [-1, 1]) {
    room.geo('eyeDark', ball(0.028, 5), poseMatrix(at(s * 0.045, height * 0.99, -0.1)), FLAT);
  }
  if (crowned) {
    // Antlers, and flowers growing out of them.
    for (const s of [-1, 1]) {
      const tip = limb(room, 'bone', at(s * 0.06, height * 1.05, 0), at(s * 0.24, height * 1.32, -0.04), 0.022, 0.012, 0.05, s * 11, 4, { tile: 0.2 });
      for (let i = 0; i < 2; i++) {
        limb(room, 'bone', at(s * (0.1 + i * 0.06), height * (1.12 + i * 0.08), -0.02), [tip[0] + s * 0.1, tip[1] + 0.1 - i * 0.06, tip[2] + 0.1], 0.014, 0.008, 0.03, s * 13 + i, 3, { tile: 0.15 });
      }
    }
    bloomFlower(room, ...(at(0.08, height * 1.12, -0.04) as [number, number, number]), 0.09, [0.6, rotationY, 0]);
  }
  room.blockCircle(x, z, 0.26);
}

/**
 * A carved relief panel on a wall: the Bower's storytelling, and the cheapest
 * way to make a solid wall worth looking at.
 *
 * Figures are built as bodies with a gap between the legs rather than as stacked
 * rectangles, for the reason in the crypt's notes: a person made of boxes is a
 * chest of drawers.
 */
export function carvedPanel(room: Room, side: Side, along: number, y: number, width: number, height: number, figures = 3, cell: Cell = [0, 0]): void {
  const { position: p, rotationY } = wallPose(room, side, along, 0.05, cell);
  room.box('timberDark', [width + 0.14, height + 0.14, 0.05], [p[0], y, p[2]], rotationY, { tile: 0.5 });
  room.box('surface.heart', [width, height, 0.04], [p[0], y + 0.07, p[2]], rotationY, { tile: 0.7 });
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const outX = -Math.sin(rotationY + Math.PI) * 0.06;
  const outZ = -Math.cos(rotationY + Math.PI) * 0.06;
  for (let i = 0; i < figures; i++) {
    const t = -width / 2 + (width * (i + 0.5)) / figures;
    const fx = p[0] + cos * t + outX;
    const fz = p[2] - sin * t + outZ;
    const fh = height * room.range(0.6, 0.82);
    const base = y + 0.14;
    for (const s of [-1, 1]) {
      room.box('timberPale', [0.045, fh * 0.42, 0.03], [fx + cos * s * 0.045, base, fz - sin * s * 0.045], rotationY, { tile: 0.15 });
    }
    room.box('timberPale', [0.14, fh * 0.34, 0.035], [fx, base + fh * 0.4, fz], rotationY, { tile: 0.15 });
    room.box('timberPale', [0.24, 0.05, 0.03], [fx, base + fh * 0.68, fz], rotationY, { tile: 0.12 });
    room.geo('timberPale', ball(0.055, 6), poseMatrix([fx + outX, base + fh * 0.8, fz + outZ]), { tile: 0.1, ...FLAT });
    // A pair of antlers on about half of them, which is the story.
    if (i % 2 === 0) {
      for (const s of [-1, 1]) {
        room.box('bone', [0.02, 0.16, 0.02], [fx + cos * s * 0.035 + outX, base + fh * 0.86, fz - sin * s * 0.035 + outZ], rotationY, { tile: 0.1 });
      }
    }
  }
  // A carved border of running vine along the top and bottom.
  for (const dy of [height / 2 + 0.02, -height / 2 - 0.02]) {
    room.box('timber', [width + 0.1, 0.05, 0.055], [p[0], y + 0.07 + dy, p[2]], rotationY, { tile: 0.25 });
  }
}

/**
 * A ladder or a stair flight, dressed flat. Vertical interest without vertical
 * movement, which is the only kind this engine has.
 */
export function ladder(room: Room, side: Side, along: number, height: number, cell: Cell = [0, 0]): void {
  const { position: p, rotationY } = wallPose(room, side, along, 0.28, cell);
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  for (const s of [-1, 1]) {
    slab(room, 'timber', [0.07, height, 0.06], [p[0] + cos * s * 0.24, height / 2, p[2] - sin * s * 0.24], [0, rotationY, 0], { tile: 0.4 });
  }
  const rungs = Math.floor(height / 0.32);
  for (let i = 1; i < rungs; i++) {
    room.geo('timberDark', cyl(0.024, 0.024, 0.48, 5), tiltMatrix([p[0], i * 0.32, p[2]], [Math.PI / 2, rotationY + Math.PI / 2, 0]), { tile: 0.2, ...FLAT });
  }
}

/** A well, trough or basin at deck level with a raised rim. You cannot cut a hole in the floor. */
export function basin(room: Room, x: number, z: number, r: number, fluid: 'sap' | 'water' | 'fox', rimHeight = 0.34): void {
  const surfaceMat = fluid === 'sap' ? 'surface.sapHot' : fluid === 'fox' ? 'surface.foxHot' : 'water';
  room.geo('timberDark', cyl(r + 0.12, r + 0.16, rimHeight, 14, true), poseMatrix([x, rimHeight / 2, z]), { tile: 0.5, ...CASTS });
  room.geo('stone', ring(r + 0.13, 0.07, 14), tiltMatrix([x, rimHeight, z], [Math.PI / 2, 0, 0]), { tile: 0.3, ...FLAT });
  room.geo(surfaceMat, disc(r + 0.05, 16), tiltMatrix([x, rimHeight - 0.08, z], [-Math.PI / 2, 0, 0]), FLAT);
  room.blockCircle(x, z, r + 0.1);
}

/**
 * A hearth: a stone surround, a bed of embers and a smoke stain up the wall.
 * The Bower's fire, and the one place in the map with an open flame in it.
 *
 * The embers go ON the cap of the bed, not inside it: a bowl with the coals sunk
 * in it shows only its lit top rim and reads as a bowl of soup (crypt notes).
 */
export function hearth(room: Room, side: Side, along: number, lit: boolean, intensity = 11, cell: Cell = [0, 0]): THREE.PointLight | null {
  const { position: p, rotationY } = wallPose(room, side, along, 0.42, cell);
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const outX = -Math.sin(rotationY + Math.PI);
  const outZ = -Math.cos(rotationY + Math.PI);

  // The surround: two jambs, a lintel and a hood.
  for (const s of [-1, 1]) {
    room.solid('stone', [0.3, 1.15, 0.7], [p[0] + cos * s * 0.72, 0, p[2] - sin * s * 0.72], rotationY, { tile: 0.5, ...CASTS });
  }
  room.box('timberDark', [1.9, 0.19, 0.76], [p[0], 1.15, p[2]], rotationY, { tile: 0.5 });
  room.box('stone', [1.6, 0.85, 0.5], [p[0] - outX * 0.12, 1.34, p[2] - outZ * 0.12], rotationY, { tile: 0.6 });
  // The back and the bed.
  room.box('stone', [1.5, 1.15, 0.14], [p[0] - outX * 0.32, 0, p[2] - outZ * 0.32], rotationY, { tile: 0.5 });
  room.box('stone', [1.7, 0.11, 0.72], [p[0], 0, p[2]], rotationY, { tile: 0.4 });
  room.collider({ kind: 'box', center: [p[0], p[2]], halfExtents: [0.85, 0.3], rotationY });

  // Ash, then logs, then the embers on top of the whole thing.
  room.geo('earth', disc(0.55, 12), tiltMatrix([p[0], 0.115, p[2]], [-Math.PI / 2, 0, 0]), FLAT);
  for (let i = 0; i < 4; i++) {
    const a = room.range(0, Math.PI);
    room.geo('rotProp', cyl(0.06, 0.075, room.range(0.5, 0.8), 6), tiltMatrix([p[0] + room.range(-0.2, 0.2), 0.17 + i * 0.05, p[2] + room.range(-0.15, 0.15)], [Math.PI / 2, rotationY + a, 0]), { tile: 0.3, ...FLAT });
  }
  if (lit) {
    for (let i = 0; i < 9; i++) {
      room.geo('lumenSap', ball(room.range(0.03, 0.07), 5), poseMatrix([p[0] + room.range(-0.42, 0.42), room.range(0.17, 0.34), p[2] + room.range(-0.24, 0.24)]), FLAT);
    }
    for (let i = 0; i < 3; i++) {
      room.geo('flame', spike(room.range(0.05, 0.09), room.range(0.16, 0.36), 5), poseMatrix([p[0] + room.range(-0.3, 0.3), 0.3, p[2] + room.range(-0.16, 0.16)]), FLAT);
    }
    glowPool(room, p[0] + outX * 0.6, p[2] + outZ * 0.6, 2.4);
    room.geo('smoke', quad(1.4, 1.5), poseMatrix([p[0] - outX * 0.28, 1.9, p[2] - outZ * 0.28], rotationY + Math.PI), FLAT);
    const lamp = new THREE.PointLight(0xff9840, intensity, room.ctx.dims.cellSize * 1.7, 2);
    lamp.position.set(p[0] + outX * 0.34, 0.62, p[2] + outZ * 0.34);
    room.light(lamp);
    gutter(room, lamp, intensity, 0.2, 4.2);
    return lamp;
  }
  room.geo('smoke', quad(1.4, 1.5), poseMatrix([p[0] - outX * 0.28, 1.9, p[2] - outZ * 0.28], rotationY + Math.PI), FLAT);
  return null;
}
