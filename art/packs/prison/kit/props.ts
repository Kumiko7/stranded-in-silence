/**
 * Blackgate's prop library - everything a room is furnished from.
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
 *   inside its own glowing mesh lights the inside of a sphere and nothing else.
 * - **Anything animated stays out of the room's batch, but gets a batcher of its
 *   own.** One `THREE.Mesh` per link of a hanging chain is thirty draw calls for
 *   one prop.
 * - **Shadow casting is opt-in in this pack.** `MeshBatcher` splits a material
 *   into two meshes when some of its geometry casts and some does not, so a
 *   material shared between a shadowed gallows beam and an unshadowed piece of
 *   skirting costs two draw calls. What earns `castShadow: true` is a silhouette
 *   a player reads across a room.
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
 * Where to put something bolted to `side`, `along` metres from the wall's centre
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
 *
 * Every one of them resolves its segment count through `sides()`, which caps it
 * by how big the thing actually is: a default chosen for a boiler drum must not
 * be paid on a two-centimetre bead, and there are hundreds of those in this pack.
 */
const cylCache = new Map<string, THREE.CylinderGeometry>();
export function cyl(rTop: number, rBot: number, h: number, seg = 9, open = false): THREE.CylinderGeometry {
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
export function ball(r: number, seg = 8): THREE.SphereGeometry {
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
    // Six sides on the tube, not sixteen: a shackle 8 mm thick seen through fog
    // is the single easiest place in a pack to spend 40,000 triangles nobody can
    // resolve (docs/systems/RENDERING.md).
    geo = new THREE.TorusGeometry(mm(r), mm(tube), sides(tube, 6), seg);
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

/** Upright cylinder whose `y` is its bottom. */
export function post(
  room: Room,
  material: string,
  rTop: number,
  rBot: number,
  h: number,
  p: Vec3,
  seg = 9,
  options: BatchOptions = {},
): void {
  room.geo(material, cyl(rTop, rBot, h, seg), poseMatrix([p[0], p[1] + h / 2, p[2]]), { tile: 0.6, ...options });
}

/**
 * A cylinder from one point to another, at any angle. Pipes, bars, chains,
 * conduit and rope all come down to this, and doing it by hand is where a
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
    cyl(radius, radius, length, seg),
    tiltMatrix([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2], [pitch, yaw, 0]),
    { tile: 0.6, ...options },
  );
}

/** A flat box lying at an angle: a leaning plank, a tipped lid, a sloping tray. */
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

/* --- animation ------------------------------------------------------------------ */

/**
 * A tungsten filament on a failing supply: a slow warm sag with an occasional
 * dip, never a stutter. An incandescent bulb has thermal mass - it CANNOT snap
 * on and off, and animating one as if it could is the fastest way to make a
 * period building read as a film set.
 */
export function sag(room: Room, light: THREE.Light, base: number, depth = 0.22, speed = 0.7): void {
  const phase = room.range(0, 20);
  room.tick((t) => {
    const slow = Math.sin(t * speed + phase) * 0.6 + Math.sin(t * speed * 2.3 + phase * 1.7) * 0.4;
    const dip = Math.max(0, Math.sin(t * 0.21 + phase) - 0.93) * 9;
    light.intensity = base * (1 + slow * depth * 0.4) * (1 - dip * 0.55);
  });
}

/**
 * A fluorescent tube that is going: mostly on, with a hard strobe that arrives
 * at an interval you cannot quite predict, and a 100 Hz hum underneath. The
 * opposite of `sag`, and the difference is the whole reason the Ward feels like
 * a different building.
 */
export function strobe(room: Room, light: THREE.Light, base: number, depth = 0.7, period = 5.5): void {
  const phase = room.range(0, 20);
  room.tick((t) => {
    const cycle = ((t + phase) % period) / period;
    const burst = cycle < 0.1 ? Math.abs(Math.sin((cycle / 0.1) * Math.PI * 6.5)) : 1;
    const hum = 1 - 0.05 * (0.5 + 0.5 * Math.sin(t * 38 + phase));
    light.intensity = base * hum * (1 - depth * (1 - burst));
  });
}

/** A hard slow pulse: an alarm lamp, a charging bank, the Programme's tubes. */
export function pulse(room: Room, light: THREE.Light, base: number, period = 1.8, floor = 0.14): void {
  const phase = room.range(0, 6);
  room.tick((t) => {
    const cycle = ((t + phase) % period) / period;
    const on = Math.pow(Math.max(0, Math.sin(cycle * Math.PI)), 3);
    light.intensity = base * (floor + (1 - floor) * on);
  });
}

/** A slow drift, for anything hanging. */
export function sway(room: Room, object: THREE.Object3D, amount: number, speed = 0.45): void {
  const phase = room.range(0, 20);
  const base = object.rotation.z;
  room.tick((t) => {
    object.rotation.z = base + Math.sin(t * speed + phase) * amount;
  });
}

/** A slow bob plus a lazy turn: a suspended cage, a hoist block, a body on a rope. */
export function bob(room: Room, object: THREE.Object3D, amount: number, speed = 0.35): void {
  const phase = room.range(0, 20);
  const y = object.position.y;
  room.tick((t) => {
    object.position.y = y + Math.sin(t * speed + phase) * amount;
    object.rotation.y += 0.0011;
  });
}

/** A steady spin: an extractor fan, a drum, a centrifuge nobody switched off. */
export function spin(room: Room, object: THREE.Object3D, speed = 1.2): void {
  room.tick(() => {
    object.rotation.y += speed * 0.016;
  });
}

/* --- the Blocks: light fittings --------------------------------------------------- */

/**
 * The Blocks' practical: a cast bulkhead fitting with a glass dish and a wire
 * cage over it, screwed to a wall that has been cooking under it for fifty
 * years.
 *
 * `lit` spends one of the room's real lights - without it the fitting still
 * glows and still washes the wall, it just does not throw anything.
 */
export function cagedLamp(
  room: Room,
  side: Side,
  along: number,
  y: number,
  lit = false,
  intensity = 9,
  cell: Cell = [0, 0],
): THREE.PointLight | null {
  const { position, rotationY } = wallPose(room, side, along, 0.02, cell);
  const [x, , z] = position;
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  const out = (d: number): Vec3 => [x + inward[0] * d, y, z + inward[2] * d];

  // Back plate and the fixing lugs.
  room.geo('ironBar', boxGeometry(0.3, 0.3, 0.06), poseMatrix(out(0.03), rotationY), { tile: 0.3, castShadow: false });
  // The body: a shallow drum standing off the wall.
  room.geo('ironBar', cyl(0.15, 0.17, 0.15, 8, true), tiltMatrix(out(0.16), [Math.PI / 2, rotationY, 0]), {
    tile: 0.3,
    castShadow: false,
  });
  // The glass dish and the filament in it. Unlit materials, so a bulb is a bulb
  // in a dark room whatever the lighting does.
  room.geo('glassPane', ball(0.13, 7), poseMatrix(out(0.24)), FLAT);
  room.geo('bulb', ball(0.05, 5), poseMatrix(out(0.24)), FLAT);
  // The cage: a rim and four ribs over the face. Four reads as a cage at 6 m and
  // eight reads as a grey ball.
  room.geo('ironBar', ring(0.15, 0.011, 9), tiltMatrix(out(0.24), [0, rotationY, 0]), FLAT);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const tan: Vec3 = [Math.cos(rotationY), 0, -Math.sin(rotationY)];
    strut(
      room,
      'ironBar',
      [out(0.14)[0] + tan[0] * Math.cos(a) * 0.15, y + Math.sin(a) * 0.15, out(0.14)[2] + tan[2] * Math.cos(a) * 0.15],
      [out(0.32)[0], y, out(0.32)[2]],
      0.009,
      4,
      FLAT,
    );
  }
  // The scorch on the wall above it: the fitting has been cooking the paint.
  room.geo('stain', quad(0.46, 0.8), poseMatrix([x + inward[0] * 0.015, y + 0.62, z + inward[2] * 0.015], rotationY + Math.PI), FLAT);
  // And the wash the fitting lays on the wall, which is what makes it read as a
  // lamp rather than as a bright speck in a black box.
  room.geo('warmWash', quad(1.9, 1.9), poseMatrix([x + inward[0] * 0.02, y - 0.05, z + inward[2] * 0.02], rotationY + Math.PI), FLAT);

  if (!lit) return null;
  const lamp = new THREE.PointLight(0xffb060, intensity, room.ctx.dims.cellSize * 1.5, 2);
  lamp.position.set(...out(0.55));
  lamp.position.y = y - 0.08;
  room.light(lamp);
  return lamp;
}

/**
 * A bare bulb on a flex with a tin coolie shade: the light in every store,
 * cellar and back passage in the building. Hangs over the walking lane rather
 * than against a wall, because a wall lamp only ever lights the wall it is
 * bolted to (docs/art/ROOM_REVIEW.md - the Heartwood pass).
 */
export function pendantBulb(
  room: Room,
  x: number,
  z: number,
  drop = 0.9,
  lit = false,
  intensity = 10,
  shade = true,
): THREE.PointLight | null {
  const { ceilingHeight } = room.ctx.dims;
  const y = ceilingHeight - drop;
  room.geo('ironBar', ball(0.07, 6), poseMatrix([x, ceilingHeight - 0.06, z]), FLAT);
  strut(room, 'ironBar', [x, ceilingHeight - 0.06, z], [x, y + 0.1, z], 0.009, 4, FLAT);
  if (shade) {
    // A tin coolie, open at the bottom. It deliberately has NO inner disc: the
    // first pass closed the top of the cone with a pale one thirteen centimetres
    // from the filament, and every pendant in the pack came back as a white
    // flower stuck to the ceiling. A shade lit from inside is the thing a player
    // stands closest to, so it is judged from a metre away, not from across the
    // room (docs/art/ROOM_REVIEW.md).
    room.geo('paintGreen', cyl(0.085, 0.26, 0.16, 9, true), poseMatrix([x, y + 0.1, z]), { tile: 0.3, castShadow: false });
    room.geo('ironBar', ring(0.26, 0.012, 10), tiltMatrix([x, y + 0.02, z], [Math.PI / 2, 0, 0]), FLAT);
  }
  room.geo('bulb', ball(0.05, 6), poseMatrix([x, y - 0.06, z]), FLAT);
  // The pool it lays on the floor under it, masked so it fades out.
  room.geo('warmWash', disc(shade ? 1.5 : 2.1, 18), tiltMatrix([x, 0.012, z], [-Math.PI / 2, 0, 0]), FLAT);

  if (!lit) return null;
  const lamp = new THREE.PointLight(0xffbc70, intensity, room.ctx.dims.cellSize * 1.5, 2);
  lamp.position.set(x, y - 0.26, z);
  room.light(lamp);
  return lamp;
}

/**
 * The Ward's fluorescent batten: a tube in a sheet-steel reflector on two drop
 * rods. About half of them are dead - a corridor where every fitting works has
 * no horror in it at all.
 */
export function tubeLight(
  room: Room,
  x: number,
  z: number,
  length = 1.9,
  rotationY = 0,
  live = true,
  lit = false,
  intensity = 8,
  drop = 0.4,
): THREE.PointLight | null {
  const { ceilingHeight } = room.ctx.dims;
  const y = ceilingHeight - drop;
  for (const s of [-1, 1]) {
    const px = x + Math.cos(rotationY) * s * length * 0.4;
    const pz = z - Math.sin(rotationY) * s * length * 0.4;
    strut(room, 'surgical', [px, ceilingHeight - 0.05, pz], [px, y + 0.07, pz], 0.014, 4, FLAT);
  }
  room.geo('enamel', boxGeometry(length, 0.08, 0.22), poseMatrix([x, y + 0.07, z], rotationY), { tile: 0.5, castShadow: false });
  room.geo('surgical', boxGeometry(length + 0.05, 0.05, 0.28), poseMatrix([x, y + 0.12, z], rotationY), { tile: 0.4, castShadow: false });
  // The tube, face down. A dead one is a dark grey rod, not a black one.
  room.geo(live ? 'bulbCold' : 'bulbDead', cyl(0.024, 0.024, length - 0.12, 6), tiltMatrix([x, y, z], [0, rotationY, Math.PI / 2]), FLAT);
  if (live) {
    room.geo('coldWash', quad(length * 1.5, 1.7), tiltMatrix([x, 0.013, z], [-Math.PI / 2, rotationY, 0]), FLAT);
  }
  if (!live || !lit) return null;
  const lamp = new THREE.PointLight(0xcaf0dc, intensity, room.ctx.dims.cellSize * 1.5, 2);
  lamp.position.set(x, y - 0.15, z);
  room.light(lamp);
  return lamp;
}

/**
 * An x-ray viewing box: a shallow white case with a film clipped into it. The
 * Ward's coldest surface and its one lit picture, and it is worth a light on its
 * own in any room that has one.
 */
export function xrayBox(room: Room, side: Side, along: number, y: number, lit = false, cell: Cell = [0, 0]): THREE.PointLight | null {
  const { position, rotationY } = wallPose(room, side, along, 0.04, cell);
  const [x, , z] = position;
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  room.geo('enamel', boxGeometry(0.78, 0.94, 0.12), poseMatrix([x, y, z], rotationY), { tile: 0.4, castShadow: false });
  room.geo('surgical', boxGeometry(0.84, 0.06, 0.14), poseMatrix([x, y + 0.5, z], rotationY), { tile: 0.3, castShadow: false });
  // The film. `rotationY + PI` because a PlaneGeometry faces +Z and a prop faces
  // -Z: the exact rotation that points a fitting into the room points its face
  // into the plaster (docs/art/ROOM_REVIEW.md).
  room.geo('xray', quad(0.64, 0.8), poseMatrix([x + inward[0] * 0.07, y, z + inward[2] * 0.07], rotationY + Math.PI), FLAT);
  // Two clips at the top, and a wash on the wall around it.
  for (const s of [-1, 1]) {
    room.geo('surgical', boxGeometry(0.09, 0.05, 0.04), poseMatrix([x + inward[0] * 0.08 + Math.cos(rotationY) * s * 0.18, y + 0.36, z + inward[2] * 0.08 - Math.sin(rotationY) * s * 0.18], rotationY), FLAT);
  }
  room.geo('coldWash', quad(2.2, 2.2), poseMatrix([x + inward[0] * 0.02, y, z + inward[2] * 0.02], rotationY + Math.PI), FLAT);

  if (!lit) return null;
  const lamp = new THREE.PointLight(0xbfe8dc, 6, room.ctx.dims.cellSize * 1.1, 2);
  lamp.position.set(x + inward[0] * 0.5, y, z + inward[2] * 0.5);
  room.light(lamp);
  return lamp;
}

/**
 * A germicidal tube in a wire guard, mounted on a wall or over a bench. The
 * Programme's only light, and the reason those rooms are violet.
 */
export function uvTube(room: Room, x: number, y: number, z: number, length = 1.2, rotationY = 0, lit = false, intensity = 8): THREE.PointLight | null {
  room.geo('steelDark', boxGeometry(length, 0.07, 0.12), poseMatrix([x, y + 0.09, z], rotationY), { tile: 0.4, castShadow: false });
  room.geo('lumenUV', cyl(0.022, 0.022, length - 0.14, 6), tiltMatrix([x, y, z], [0, rotationY, Math.PI / 2]), FLAT);
  for (let i = 0; i < 4; i++) {
    const t = (i / 3 - 0.5) * (length - 0.2);
    room.geo('ironBar', ring(0.055, 0.008, 7), tiltMatrix([x + Math.cos(rotationY) * t, y, z - Math.sin(rotationY) * t], [0, rotationY, Math.PI / 2]), FLAT);
  }
  if (!lit) return null;
  const lamp = new THREE.PointLight(0x9a4cff, intensity, room.ctx.dims.cellSize * 1.4, 2);
  lamp.position.set(x, y - 0.2, z);
  room.light(lamp);
  return lamp;
}

/**
 * A run of candles on a stand or a ledge: the chapel's own light, and the only
 * open flame in the building. Points of light on a dark line, never a continuous
 * bar of glow.
 */
export function candleRow(room: Room, x: number, y: number, z: number, count = 5, spread = 1.1, rotationY = 0): void {
  for (let i = 0; i < count; i++) {
    const t = (i / Math.max(1, count - 1) - 0.5) * spread;
    const px = x + Math.cos(rotationY) * t;
    const pz = z - Math.sin(rotationY) * t;
    const h = room.range(0.08, 0.24);
    room.geo('brass', cyl(0.035, 0.045, 0.03, 7), poseMatrix([px, y + 0.015, pz]), FLAT);
    room.geo('wax', cyl(0.021, 0.024, h, 6), poseMatrix([px, y + 0.03 + h / 2, pz]), FLAT);
    if (room.chance(0.7)) {
      room.geo('bulb', spike(0.016, 0.06, 5), poseMatrix([px, y + 0.06 + h, pz]), FLAT);
      room.geo('warmWash', quad(0.5, 0.5), tiltMatrix([px, y + 0.09 + h, pz], [0, rotationY + Math.PI, 0]), FLAT);
    }
  }
}

/**
 * A cast alarm bell in a wire guard, with a red lamp beside it. The one red
 * thing in a green room, and the fastest way to say that whatever happened here
 * is still happening.
 */
export function alarmBell(room: Room, side: Side, along: number, y: number, lit = false, cell: Cell = [0, 0]): THREE.PointLight | null {
  const { position, rotationY } = wallPose(room, side, along, 0.03, cell);
  const [x, , z] = position;
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  const out = (d: number): Vec3 => [x + inward[0] * d, y, z + inward[2] * d];

  room.geo('paintRed', boxGeometry(0.34, 0.4, 0.09), poseMatrix(out(0.045), rotationY), { tile: 0.3, castShadow: false });
  // The gong: a shallow dome facing out, with the striker under it.
  room.geo('brass', cyl(0.16, 0.13, 0.09, 10, true), tiltMatrix(out(0.16), [Math.PI / 2, rotationY, 0]), { tile: 0.3, castShadow: false });
  room.geo('brass', disc(0.155, 10), tiltMatrix(out(0.21), [0, rotationY + Math.PI, 0]), FLAT);
  room.geo('steel', ball(0.035, 5), poseMatrix([out(0.19)[0], y - 0.17, out(0.19)[2]]), FLAT);
  room.geo('lumenRed', ball(0.05, 6), poseMatrix([out(0.1)[0] + Math.cos(rotationY) * 0.24, y + 0.15, out(0.1)[2] - Math.sin(rotationY) * 0.24]), FLAT);

  if (!lit) return null;
  const lamp = new THREE.PointLight(0xff3018, 5, room.ctx.dims.cellSize * 1.0, 2);
  lamp.position.set(out(0.4)[0] + Math.cos(rotationY) * 0.24, y + 0.15, out(0.4)[2] - Math.sin(rotationY) * 0.24);
  room.light(lamp);
  pulse(room, lamp, 5, 2.4);
  return lamp;
}

/** A lit sign screwed to a wall. Green for a way out, red for the other kind. */
export function wallSign(
  room: Room,
  side: Side,
  along: number,
  y: number,
  kind: 'green' | 'red' | 'amber' = 'amber',
  width = 0.62,
  cell: Cell = [0, 0],
): void {
  const { position, rotationY } = wallPose(room, side, along, 0.03, cell);
  const [x, , z] = position;
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  room.geo('steelDark', boxGeometry(width + 0.07, 0.26, 0.06), poseMatrix([x, y, z], rotationY), { tile: 0.3, castShadow: false });
  room.geo(
    kind === 'green' ? 'signGreen' : kind === 'red' ? 'signRed' : 'signAmber',
    quad(width, 0.19),
    poseMatrix([x + inward[0] * 0.04, y, z + inward[2] * 0.04], rotationY + Math.PI),
    FLAT,
  );
  strut(room, 'ironBar', [x, y + 0.13, z], [x, y + 0.44, z], 0.013, 4, FLAT);
}

/** A stencilled plate or notice screwed flat to a wall. No light, no collider. */
export function notice(
  room: Room,
  side: Side,
  along: number,
  y: number,
  w = 0.5,
  h = 0.34,
  material = 'surface.stencil',
  cell: Cell = [0, 0],
): void {
  const { position, rotationY } = wallPose(room, side, along, 0.02, cell);
  const [x, , z] = position;
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  room.geo(material, boxGeometry(w, h, 0.02), poseMatrix([x + inward[0] * 0.01, y, z + inward[2] * 0.01], rotationY), {
    tile: 0.5,
    castShadow: false,
  });
  for (const s of [-1, 1]) {
    room.geo('steel', ball(0.011, 4), poseMatrix([x + inward[0] * 0.03 + Math.cos(rotationY) * s * (w / 2 - 0.04), y + h / 2 - 0.04, z + inward[2] * 0.03 - Math.sin(rotationY) * s * (w / 2 - 0.04)]), FLAT);
  }
}

/**
 * Tally marks cut into the paint at eye height. A `surface.tally` panel with a
 * normal map, which is far cheaper and far more legible than any attempt to
 * model scratches - and it is the one detail in the pack that is about a person.
 */
export function tallyWall(room: Room, side: Side, along: number, y = 1.35, w = 1.2, h = 0.9, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.005, cell);
  const [x, , z] = position;
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  room.geo('surface.tally', boxGeometry(w, h, 0.012), poseMatrix([x + inward[0] * 0.006, y, z + inward[2] * 0.006], rotationY), {
    tile: 0.85,
    castShadow: false,
  });
}

/* --- the Blocks: fittings --------------------------------------------------------- */

/**
 * A run of bars standing in the room: a gate, a cage front, the grille across a
 * recess. The single most important prop in the pack, because the whole visual
 * language of the genre is a silhouette seen through vertical lines.
 *
 * Bars are cylinders rather than boxes so a raking lamp puts a highlight down
 * one edge of each - a row of flat black rectangles stops reading as round and
 * the whole thing goes to a grey hatch.
 */
export function barRun(
  room: Room,
  from: readonly [number, number],
  to: readonly [number, number],
  height = 2.6,
  blocking = true,
  pitch = 0.16,
  gateAt = -1,
): void {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  if (length < 0.05) return;
  const yaw = Math.atan2(dx, dz);
  const mx = (from[0] + to[0]) / 2;
  const mz = (from[1] + to[1]) / 2;
  const ux = dx / length;
  const uz = dz / length;

  // Head and foot rails, plus one at waist height: bars without rails read as a
  // barcode rather than as ironwork.
  for (const [y, t] of [[0.06, 0.055], [1.06, 0.045], [height - 0.05, 0.07]] as const) {
    room.geo('ironBar', boxGeometry(length, t * 2, 0.075), poseMatrix([mx, y, mz], -yaw + Math.PI / 2), { tile: 0.5, castShadow: false });
  }
  const count = Math.max(2, Math.round(length / pitch));
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    // The gate leaf's own gap, if this run has one: a bay left open.
    if (gateAt >= 0 && Math.abs(t - gateAt) < 0.09) continue;
    room.geo('ironBar', cyl(0.021, 0.021, height, 5), poseMatrix([from[0] + ux * length * t, height / 2, from[1] + uz * length * t]), {
      tile: 0.2,
      castShadow: false,
    });
  }
  // Stiles at both ends, heavier than the bars.
  for (const [px, pz] of [from, to] as const) {
    room.geo('ironBar', boxGeometry(0.08, height, 0.08), poseMatrix([px, height / 2, pz], -yaw), { tile: 0.3, castShadow: false });
  }
  if (blocking) {
    room.collider({ kind: 'box', center: [mx, mz], halfExtents: [length / 2, 0.09], rotationY: -yaw + Math.PI / 2 });
  }
}

/**
 * A hinged barred gate standing open in a run: a leaf swung back against the
 * wall, with its lock box and a chain hanging off it. Carries no collider - the
 * leaf is out of the way, which is the whole point of showing it open.
 */
export function barGate(room: Room, x: number, z: number, width = 1.1, rotationY = 0, height = 2.4): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  for (const [y, t] of [[0.06, 0.05], [height - 0.05, 0.06]] as const) {
    room.geo('ironBar', boxGeometry(width, t * 2, 0.06), poseMatrix([x + (c * width) / 2, y, z - (s * width) / 2], rotationY), {
      tile: 0.4,
      castShadow: false,
    });
  }
  const count = Math.max(3, Math.round(width / 0.15));
  for (let i = 0; i < count; i++) {
    const t = ((i + 0.5) / count) * width;
    room.geo('ironBar', cyl(0.019, 0.019, height, 5), poseMatrix([x + c * t, height / 2, z - s * t]), { tile: 0.2, castShadow: false });
  }
  room.geo('ironBar', boxGeometry(0.07, height, 0.07), poseMatrix([x, height / 2, z], rotationY), { tile: 0.3, castShadow: false });
  room.geo('ironBar', boxGeometry(0.07, height, 0.07), poseMatrix([x + c * width, height / 2, z - s * width], rotationY), { tile: 0.3, castShadow: false });
  // The lock case and the keep, on the free stile.
  room.geo('ironPale', boxGeometry(0.16, 0.24, 0.12), poseMatrix([x + c * width, 1.06, z - s * width], rotationY), { tile: 0.2, castShadow: false });
  room.geo('brass', cyl(0.03, 0.03, 0.05, 7), tiltMatrix([x + c * (width + 0.02), 1.06, z - s * (width + 0.02)], [Math.PI / 2, rotationY, 0]), FLAT);
}

/**
 * A cell front: a bay of bars with a sliding door in it, the number plate over
 * the head, and the dark of the cell behind. It is what a landing is made of.
 *
 * The interior is a shallow recess with a bunk silhouette in it rather than a
 * real room - a player never gets inside one, and a painted depth at this light
 * level is indistinguishable from a modelled one.
 */
export function cellFront(room: Room, x: number, z: number, rotationY = 0, width = 2.2, open = false): void {
  const { ceilingHeight } = room.ctx.dims;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  /**
   * `depth` runs INTO the wall here rather than into the room, which is the
   * opposite of every other prop in this file and is deliberate: a cell front is
   * a hole, not an object. The origin sits on the wall face and the recess is
   * behind it.
   *
   * It is kept to 0.6 m for a reason worth knowing. Art may lean out of its own
   * room (ROOM_FORMAT.md §7) but only into the wall, not through it - two
   * adjacent rooms leave about a wall thickness between their own walls, so a
   * recess deeper than about 0.7 m comes out inside the neighbour. At this light
   * level a painted depth of 0.6 m and a modelled one are indistinguishable.
   */
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along + s * depth, y, z - s * along + c * depth];

  const height = Math.min(2.7, ceilingHeight - 0.5);
  const depth = 0.6;
  room.geo('steelDark', boxGeometry(width, height, 0.05), poseMatrix(at(0, height / 2, depth), rotationY), { tile: 0.9, castShadow: false });
  for (const side of [-1, 1]) {
    room.geo('surface.block', boxGeometry(0.05, height, depth), poseMatrix(at((side * width) / 2, height / 2, depth / 2), rotationY), {
      tile: 1.0,
      castShadow: false,
    });
  }
  room.geo('surface.concrete', boxGeometry(width, 0.06, depth), poseMatrix(at(0, 0.03, depth / 2), rotationY), { tile: 1.2, castShadow: false });
  room.geo('surface.block', boxGeometry(width, 0.06, depth), poseMatrix(at(0, height - 0.03, depth / 2), rotationY), { tile: 1.0, castShadow: false });
  // A bunk frame against the back wall, and a rolled mattress on it.
  room.geo('ironBar', boxGeometry(width * 0.75, 0.07, 0.42), poseMatrix(at(-width * 0.04, 0.44, depth * 0.6), rotationY), { tile: 0.4, castShadow: false });
  room.geo('wool', boxGeometry(width * 0.66, 0.13, 0.34), poseMatrix(at(-width * 0.04, 0.51, depth * 0.6), rotationY), { tile: 0.4, castShadow: false });
  room.geo('porcelain', cyl(0.13, 0.11, 0.32, 8), poseMatrix(at(width * 0.34, 0.16, depth * 0.66), rotationY), FLAT);

  // The head beam and the number plate over the opening.
  room.geo('surface.block', boxGeometry(width + 0.5, ceilingHeight - height, 0.34), poseMatrix(at(0, (height + ceilingHeight) / 2, 0), rotationY), {
    tile: 1.0,
    castShadow: false,
  });
  room.geo('surface.stencil', boxGeometry(0.5, 0.16, 0.03), poseMatrix(at(-width * 0.3, height + 0.16, -0.14), rotationY), { tile: 0.4, castShadow: false });

  // The bars across it, and the sliding leaf parked to one side.
  const opening = width - 0.16;
  const count = Math.max(6, Math.round(opening / 0.15));
  for (let i = 0; i < count; i++) {
    const t = -opening / 2 + (opening * (i + 0.5)) / count;
    if (open && t > opening * 0.06) continue;
    room.geo('ironBar', cyl(0.023, 0.023, height, 5), poseMatrix(at(t, height / 2, -0.02)), { tile: 0.2, castShadow: false });
  }
  for (const [y, t] of [[0.07, 0.055], [1.14, 0.04], [height - 0.06, 0.065]] as const) {
    room.geo('ironBar', boxGeometry(width, t * 2, 0.08), poseMatrix(at(0, y, -0.02), rotationY), { tile: 0.4, castShadow: false });
  }
  // The track the leaf runs on, above and below, and its handle.
  room.geo('ironPale', boxGeometry(width + 0.6, 0.07, 0.1), poseMatrix(at(0, height + 0.03, -0.09), rotationY), { tile: 0.4, castShadow: false });
  if (open) {
    room.geo('ironBar', boxGeometry(0.09, height, 0.09), poseMatrix(at(opening * 0.06, height / 2, -0.09), rotationY), { tile: 0.3, castShadow: false });
    room.geo('ironPale', boxGeometry(0.1, 0.2, 0.14), poseMatrix(at(opening * 0.06 - 0.1, 1.1, -0.14), rotationY), { tile: 0.2, castShadow: false });
  } else {
    room.geo('ironPale', boxGeometry(0.14, 0.26, 0.13), poseMatrix(at(opening * 0.42, 1.1, -0.12), rotationY), { tile: 0.2, castShadow: false });
  }
  room.collider({ kind: 'box', center: [at(0, 0, 0.02)[0], at(0, 0, 0.02)[2]], halfExtents: [width / 2, 0.12], rotationY });
}

/**
 * An iron bunk: a frame of angle and mesh with a straw mattress and one folded
 * blanket. Stacked or single, and the stacked one is the silhouette that says
 * "two people lived in a space this size".
 */
export function bunk(room: Room, x: number, z: number, rotationY = 0, stacked = true, made = true): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  const w = 1.94;
  const d = 0.72;

  const levels = stacked ? [0.42, 1.42] : [0.42];
  for (const y of levels) {
    room.geo('ironBar', boxGeometry(w, 0.06, d), poseMatrix(at(0, y, 0), rotationY), { tile: 0.5, castShadow: false });
    // Mesh springs under the frame, as three cross members.
    for (let i = 0; i < 3; i++) {
      room.geo('steelDark', boxGeometry(0.04, 0.03, d - 0.08), poseMatrix(at(-w / 2 + (w * (i + 1)) / 4, y - 0.05, 0), rotationY), FLAT);
    }
    if (made) {
      room.geo('canvas', boxGeometry(w - 0.1, 0.11, d - 0.08), poseMatrix(at(0, y + 0.09, 0), rotationY), { tile: 0.5, castShadow: false });
      room.geo('wool', boxGeometry(w * 0.42, 0.09, d - 0.06), poseMatrix(at(w * 0.24, y + 0.19, 0), rotationY), { tile: 0.4, castShadow: false });
    } else {
      // Not made: the mattress rolled and shoved to one end, ticking showing.
      room.geo('canvas', cyl(0.16, 0.16, d - 0.1, 8), tiltMatrix(at(-w * 0.28, y + 0.19, 0), [0, rotationY, Math.PI / 2]), { tile: 0.4, castShadow: false });
    }
  }
  // Four legs, and the head and foot ends if it is stacked.
  const topY = stacked ? 1.86 : 0.72;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      post(room, 'ironBar', 0.024, 0.024, topY, at(sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04)), 5, FLAT);
    }
    room.geo('ironBar', boxGeometry(0.05, 0.05, d - 0.06), poseMatrix(at(sx * (w / 2 - 0.04), topY, 0), rotationY), FLAT);
    for (let i = 0; i < 3; i++) {
      post(room, 'ironBar', 0.014, 0.014, topY - (stacked ? 1.5 : 0.46), at(sx * (w / 2 - 0.04), stacked ? 1.5 : 0.46, -d / 2 + (d * (i + 1)) / 4), 4, FLAT);
    }
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [w / 2 - 0.05, d / 2 - 0.05], rotationY });
}

/** A wall-hung shelf on two brackets. Returns the pose, for placing item anchors. */
export function shelf(
  room: Room,
  side: Side,
  along: number,
  y: number,
  width = 1.2,
  depth = 0.34,
  cell: Cell = [0, 0],
): { position: Vec3; rotationY: number } {
  const pose = wallPose(room, side, along, depth / 2, cell);
  const [x, , z] = pose.position;
  room.geo('timber', boxGeometry(width, 0.045, depth), poseMatrix([x, y, z], pose.rotationY), { tile: 0.5, castShadow: false });
  for (const s of [-1, 1]) {
    const bx = x + Math.cos(pose.rotationY) * s * (width / 2 - 0.12);
    const bz = z - Math.sin(pose.rotationY) * s * (width / 2 - 0.12);
    room.geo('ironBar', boxGeometry(0.035, 0.2, depth * 0.8), poseMatrix([bx, y - 0.12, bz], pose.rotationY), FLAT);
  }
  return pose;
}

/** A cast-iron column radiator: the most institutional object ever manufactured. */
export function radiator(room: Room, side: Side, along: number, columns = 9, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.16, cell);
  const [x, , z] = position;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const width = columns * 0.075;
  for (let i = 0; i < columns; i++) {
    const t = -width / 2 + width * ((i + 0.5) / columns);
    room.geo('paintCream', cyl(0.036, 0.036, 0.62, 6), poseMatrix([x + c * t, 0.38, z - s * t]), { tile: 0.2, castShadow: false });
  }
  for (const y of [0.08, 0.7]) {
    room.geo('paintCream', boxGeometry(width + 0.06, 0.09, 0.13), poseMatrix([x, y, z], rotationY), { tile: 0.3, castShadow: false });
  }
  // The valve and the tail pipe down to the floor.
  room.geo('brass', cyl(0.028, 0.028, 0.14, 7), poseMatrix([x + c * (width / 2 + 0.04), 0.14, z - s * (width / 2 + 0.04)]), FLAT);
  strut(room, 'lead', [x + c * (width / 2 + 0.04), 0.02, z - s * (width / 2 + 0.04)], [x + c * (width / 2 + 0.04), 0.2, z - s * (width / 2 + 0.04)], 0.02, 5, FLAT);
  room.collider({ kind: 'box', center: [x, z], halfExtents: [width / 2, 0.1], rotationY });
}

/**
 * A pipe run through a list of points, with a bracket at each corner. Every
 * institutional building is held together by these and they cost almost nothing.
 */
export function pipeRun(room: Room, points: readonly Vec3[], radius = 0.055, material = 'lead', braced = true): void {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    strut(room, material, a, b, radius, 6, { tile: 0.5, castShadow: false });
    // A collar at every joint: a pipe without joints is a rod.
    room.geo(material, cyl(radius * 1.4, radius * 1.4, radius * 2.4, 7), poseMatrix(b as Vec3), FLAT);
    if (braced && i % 2 === 0) {
      room.geo('ironBar', boxGeometry(radius * 3.4, 0.03, 0.05), poseMatrix([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + radius * 1.4, (a[2] + b[2]) / 2]), FLAT);
    }
  }
}

/** A handwheel valve on a pipe. Two rings and four spokes, and it reads instantly. */
export function valve(room: Room, p: Vec3, radius = 0.16, rotationY = 0, red = false): void {
  room.geo(red ? 'paintRed' : 'brass', cyl(0.05, 0.06, 0.14, 8), poseMatrix([p[0], p[1], p[2]]), FLAT);
  room.geo(red ? 'paintRed' : 'brass', ring(radius, 0.018, 9), tiltMatrix([p[0], p[1] + 0.11, p[2]], [Math.PI / 2, rotationY, 0]), FLAT);
  for (let i = 0; i < 4; i++) {
    const a = rotationY + (i / 4) * Math.PI * 2;
    strut(room, red ? 'paintRed' : 'brass', [p[0], p[1] + 0.11, p[2]], [p[0] + Math.cos(a) * radius, p[1] + 0.11, p[2] + Math.sin(a) * radius], 0.012, 4, FLAT);
  }
}

/** A dial gauge on a wall or a machine face. */
export function gauge(room: Room, side: Side, along: number, y: number, radius = 0.12, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.02, cell);
  const [x, , z] = position;
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  room.geo('brass', cyl(radius, radius, 0.07, 10), tiltMatrix([x + inward[0] * 0.035, y, z + inward[2] * 0.035], [Math.PI / 2, rotationY, 0]), FLAT);
  room.geo('itemEnamel', disc(radius * 0.82, 10), poseMatrix([x + inward[0] * 0.075, y, z + inward[2] * 0.075], rotationY + Math.PI), FLAT);
  room.geo('paintRed', boxGeometry(radius * 0.7, 0.012, 0.008), tiltMatrix([x + inward[0] * 0.08, y, z + inward[2] * 0.08], [0, rotationY + Math.PI, room.range(-1.2, 1.2)]), FLAT);
}

/**
 * A railing: two rails on posts. `blocking` is a real decision - a barrier that
 * seals a strip makes the far half of a room an unreachable pocket, and a rail
 * with a way round it is what a rail twenty years in actually looks like.
 */
export function railing(room: Room, from: Vec3, to: Vec3, blocking = true, height = 1.04): void {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  if (length < 0.05) return;
  const yaw = Math.atan2(dx, dz);
  const mid: Vec3 = [(from[0] + to[0]) / 2, 0, (from[2] + to[2]) / 2];
  for (const y of [height, height * 0.55]) {
    room.geo('ironBar', cyl(0.026, 0.026, length, 6), tiltMatrix([mid[0], y, mid[2]], [Math.PI / 2, yaw, 0]), { tile: 0.4, castShadow: false });
  }
  const posts = Math.max(2, Math.round(length / 1.3) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1);
    post(room, 'ironBar', 0.028, 0.032, height, [from[0] + dx * t, 0, from[2] + dz * t], 6, FLAT);
  }
  if (blocking) room.collider({ kind: 'box', center: [mid[0], mid[2]], halfExtents: [length / 2, 0.08], rotationY: -yaw + Math.PI / 2 });
}

/** A fixed ladder up a wall. Vertical interest without vertical movement. */
export function ladder(room: Room, side: Side, along: number, cell: Cell = [0, 0]): void {
  const { ceilingHeight } = room.ctx.dims;
  const { position, rotationY } = wallPose(room, side, along, 0.2, cell);
  const [x, , z] = position;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  for (const sx of [-1, 1]) {
    post(room, 'ironBar', 0.026, 0.026, ceilingHeight - 0.1, [x + c * sx * 0.22, 0.05, z - s * sx * 0.22], 6, FLAT);
  }
  const rungs = Math.floor((ceilingHeight - 0.4) / 0.28);
  for (let i = 0; i < rungs; i++) {
    room.geo('ironBar', cyl(0.016, 0.016, 0.44, 5), tiltMatrix([x, 0.3 + i * 0.28, z], [0, rotationY, Math.PI / 2]), FLAT);
  }
}

/**
 * A hanging chain with something on the end of it. Anything on a chain needs a
 * batcher of ITS OWN: built as one `THREE.Mesh` per link it is thirty draw calls
 * for one prop (docs/art/ROOM_REVIEW.md).
 */
export function hangingChain(room: Room, x: number, z: number, drop = 1.4, hook: 'hook' | 'shackle' | 'none' = 'hook', from = -1): void {
  const { ceilingHeight } = room.ctx.dims;
  const batch = new MeshBatcher();
  const iron = room.mat('ironBar');
  const top = from >= 0 ? from : ceilingHeight - 0.1;
  const links = Math.max(3, Math.round(drop / 0.17));
  for (let i = 0; i < links; i++) {
    const y = -(drop * (i + 0.5)) / links;
    batch.add(iron, ring(0.05, 0.014, 7), tiltMatrix([0, y, 0], [i % 2 ? Math.PI / 2 : 0, 0, 0]), {
      tile: 0.2,
      castShadow: false,
      receiveShadow: false,
    });
  }
  if (hook === 'hook') {
    batch.add(room.mat('ironPale'), ring(0.09, 0.02, 8), tiltMatrix([0, -drop - 0.1, 0], [0, 0, 0]), { tile: 0.2, castShadow: false, receiveShadow: false });
    batch.add(room.mat('ironPale'), cyl(0.018, 0.018, 0.18, 5), tiltMatrix([0, -drop - 0.2, 0], [0.4, 0, 0]), { tile: 0.2, castShadow: false, receiveShadow: false });
  } else if (hook === 'shackle') {
    batch.add(room.mat('ironPale'), ring(0.075, 0.018, 8), tiltMatrix([0, -drop - 0.09, 0], [Math.PI / 2, 0, 0]), { tile: 0.2, castShadow: false, receiveShadow: false });
    batch.add(room.mat('ironPale'), boxGeometry(0.13, 0.05, 0.05), poseMatrix([0, -drop - 0.02, 0]), { tile: 0.2, castShadow: false, receiveShadow: false });
  }
  const built = batch.build();
  const group = new THREE.Group();
  group.position.set(x, top, z);
  group.add(built.object);
  room.loose(group);
  room.own(built);
  sway(room, group, 0.04, 0.33);
}

/**
 * A course of shackle rings bolted to a wall, with a chain hanging from some of
 * them. The single cheapest way to make a room read as a place people were kept
 * rather than stored.
 */
export function shackleWall(room: Room, side: Side, along: number, count = 3, y = 1.5, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.03, cell);
  const [x, , z] = position;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  for (let i = 0; i < count; i++) {
    const t = (i - (count - 1) / 2) * 0.78;
    const px = x + c * t;
    const pz = z - s * t;
    // The plate and the eye bolted through it.
    room.geo('ironPale', boxGeometry(0.14, 0.14, 0.04), poseMatrix([px + inward[0] * 0.02, y, pz + inward[2] * 0.02], rotationY), FLAT);
    room.geo('ironBar', ring(0.06, 0.014, 8), poseMatrix([px + inward[0] * 0.08, y, pz + inward[2] * 0.08], rotationY), FLAT);
    // Rust running down the wall under each one, which is what dates them.
    room.geo('rust', quad(0.12, 0.7), poseMatrix([px + inward[0] * 0.012, y - 0.4, pz + inward[2] * 0.012], rotationY + Math.PI), FLAT);
    if (i % 2 === 0) {
      const drop = room.range(0.5, 0.95);
      const links = Math.max(3, Math.round(drop / 0.17));
      for (let k = 0; k < links; k++) {
        room.geo('ironBar', ring(0.045, 0.012, 7), tiltMatrix([px + inward[0] * 0.09, y - (drop * (k + 0.5)) / links, pz + inward[2] * 0.09], [k % 2 ? Math.PI / 2 : 0, rotationY, 0]), FLAT);
      }
      room.geo('ironPale', ring(0.06, 0.016, 8), tiltMatrix([px + inward[0] * 0.09, y - drop - 0.06, pz + inward[2] * 0.09], [Math.PI / 2, rotationY, 0]), FLAT);
    }
  }
}

/* --- the Blocks: furniture --------------------------------------------------------- */

/** A refectory table with a bench either side of it, bolted to the floor. */
export function messTable(room: Room, x: number, z: number, rotationY = 0, length = 3.2): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  room.geo('timber', boxGeometry(length, 0.05, 0.78), poseMatrix(at(0, 0.75, 0), rotationY), { tile: 0.6, castShadow: false });
  room.geo('ironBar', boxGeometry(length * 0.7, 0.05, 0.06), poseMatrix(at(0, 0.44, 0), rotationY), FLAT);
  for (const sx of [-1, 1]) {
    // The pedestal frames, which is how a bolted-down table is actually built.
    room.geo('ironBar', boxGeometry(0.07, 0.72, 0.07), poseMatrix(at(sx * (length / 2 - 0.4), 0.36, 0), rotationY), FLAT);
    room.geo('ironBar', boxGeometry(0.1, 0.05, 1.9), poseMatrix(at(sx * (length / 2 - 0.4), 0.03, 0), rotationY), FLAT);
    for (const sz of [-1, 1]) {
      room.geo('ironBar', boxGeometry(0.06, 0.42, 0.06), poseMatrix(at(sx * (length / 2 - 0.4), 0.03, sz * 0.72), rotationY), FLAT);
    }
  }
  for (const sz of [-1, 1]) {
    room.geo('timber', boxGeometry(length * 0.94, 0.045, 0.3), poseMatrix(at(0, 0.45, sz * 0.72), rotationY), { tile: 0.5, castShadow: false });
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [length / 2, 0.94], rotationY });
}

/** A chapel pew: a plank seat, a back and two shaped ends. */
export function pew(room: Room, x: number, z: number, rotationY = 0, length = 2.6): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  room.geo('timberDark', boxGeometry(length, 0.05, 0.4), poseMatrix(at(0, 0.44, 0), rotationY), { tile: 0.5, castShadow: false });
  slab(room, 'timberDark', [length, 0.045, 0.36], at(0, 0.72, 0.19), [-0.16, rotationY, 0], { tile: 0.5 });
  room.geo('timberDark', boxGeometry(length, 0.04, 0.2), poseMatrix(at(0, 0.24, -0.14), rotationY), FLAT);
  for (const sx of [-1, 1]) {
    room.geo('timberDark', boxGeometry(0.06, 0.9, 0.44), poseMatrix(at(sx * (length / 2 - 0.03), 0, 0.02), rotationY), { tile: 0.4, castShadow: false });
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [length / 2, 0.32], rotationY });
}

/** A warder's desk: a knee-hole table with a ledger, an inkwell and a lamp base. */
export function dutyDesk(room: Room, x: number, z: number, rotationY = 0, width = 1.5): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  room.geo('timber', boxGeometry(width, 0.055, 0.72), poseMatrix(at(0, 0.75, 0), rotationY), { tile: 0.5, castShadow: false });
  room.geo('timberDark', boxGeometry(width - 0.05, 0.34, 0.66), poseMatrix(at(0, 0.4, 0), rotationY), { tile: 0.4, castShadow: false });
  for (const sx of [-1, 1]) {
    room.geo('timberDark', boxGeometry(0.4, 0.72, 0.68), poseMatrix(at(sx * (width / 2 - 0.22), 0.36, 0), rotationY), { tile: 0.4, castShadow: false });
    for (let i = 0; i < 2; i++) {
      room.geo('brass', boxGeometry(0.12, 0.025, 0.03), poseMatrix(at(sx * (width / 2 - 0.22), 0.32 + i * 0.26, -0.35), rotationY), FLAT);
    }
  }
  // The ledger, open, and a pen tray beside it.
  slab(room, 'paper', [0.44, 0.035, 0.32], at(-0.14, 0.79, 0.02), [0, rotationY, 0.03], { tile: 0.35 });
  room.geo('timberDark', boxGeometry(0.5, 0.02, 0.36), poseMatrix(at(-0.14, 0.77, 0.02), rotationY), FLAT);
  room.geo('brass', cyl(0.035, 0.04, 0.05, 8), poseMatrix(at(0.36, 0.78, 0.14), rotationY), FLAT);
  room.collider({ kind: 'box', center: [x, z], halfExtents: [width / 2, 0.38], rotationY });
}

/** A wooden chair, upright, and the one prop that makes an empty room frightening. */
export function chair(room: Room, x: number, z: number, rotationY = 0, material = 'timber'): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  room.geo(material, boxGeometry(0.42, 0.04, 0.4), poseMatrix(at(0, 0.44, 0), rotationY), { tile: 0.3, castShadow: false });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      post(room, material, 0.02, 0.023, sz > 0 ? 0.88 : 0.44, at(sx * 0.18, 0, sz * 0.17), 5, FLAT);
    }
  }
  room.geo(material, boxGeometry(0.4, 0.07, 0.03), poseMatrix(at(0, 0.82, 0.17), rotationY), FLAT);
  room.geo(material, boxGeometry(0.4, 0.05, 0.03), poseMatrix(at(0, 0.66, 0.17), rotationY), FLAT);
  room.blockCircle(x, z, 0.22);
}

/** A filing cabinet, with one drawer hanging out of it. */
export function filingCabinet(room: Room, x: number, z: number, rotationY = 0, open = -1, drawers = 4): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  const h = 0.34 * drawers + 0.1;
  room.geo('paintGreen', boxGeometry(0.5, h, 0.62), poseMatrix(at(0, h / 2, 0), rotationY), { tile: 0.5, ...CASTS });
  for (let i = 0; i < drawers; i++) {
    const y = 0.08 + i * 0.34;
    const out = i === open ? 0.34 : 0.0;
    room.geo('paintGreen', boxGeometry(0.46, 0.3, 0.05), poseMatrix(at(0, y + 0.15, -0.31 - out), rotationY), { tile: 0.3, castShadow: false });
    room.geo('brass', boxGeometry(0.16, 0.035, 0.03), poseMatrix(at(0, y + 0.15, -0.35 - out), rotationY), FLAT);
    room.geo('paper', boxGeometry(0.1, 0.05, 0.02), poseMatrix(at(-0.15, y + 0.24, -0.35 - out), rotationY), FLAT);
    if (i === open) {
      // The drawer body and the files standing in it.
      room.geo('paintGreen', boxGeometry(0.44, 0.26, 0.56), poseMatrix(at(0, y + 0.14, -0.06 - out), rotationY), { tile: 0.3, castShadow: false });
      for (let k = 0; k < 6; k++) {
        slab(room, 'paper', [0.4, 0.24, 0.02], at(0, y + 0.16, -0.28 - out + k * 0.075), [room.range(-0.14, -0.02), rotationY, 0], { tile: 0.25 });
      }
    }
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [0.26, 0.32], rotationY });
}

/**
 * A wall of index cards behind a wire front: the records office's whole
 * identity, and the Ward's ledger boards. One `surface.cards` panel with a grid
 * of dividers over it, which reads far better than any modelled drawer.
 */
export function cardWall(room: Room, side: Side, along: number, y = 1.5, width = 2.4, height = 1.6, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.06, cell);
  const [x, , z] = position;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  room.geo('timberDark', boxGeometry(width + 0.12, height + 0.12, 0.1), poseMatrix([x, y, z], rotationY), { tile: 0.5, castShadow: false });
  room.geo('surface.cards', boxGeometry(width, height, 0.03), poseMatrix([x + inward[0] * 0.05, y, z + inward[2] * 0.05], rotationY), {
    tile: 0.95,
    castShadow: false,
  });
  // Dividers: three horizontal rails and two verticals, so it reads as a rack.
  for (let i = 1; i < 4; i++) {
    room.geo('timberDark', boxGeometry(width, 0.035, 0.06), poseMatrix([x + inward[0] * 0.075, y - height / 2 + (height * i) / 4, z + inward[2] * 0.075], rotationY), FLAT);
  }
  for (const sx of [-1, 1]) {
    room.geo('timberDark', boxGeometry(0.035, height, 0.06), poseMatrix([x + inward[0] * 0.075 + c * sx * (width / 4), y, z + inward[2] * 0.075 - s * sx * (width / 4)], rotationY), FLAT);
  }
}

/** A key board: a rack of hooks with brass tags on it, behind a swung-open door. */
export function keyBoard(room: Room, side: Side, along: number, y = 1.55, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.04, cell);
  const [x, , z] = position;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  room.geo('timberDark', boxGeometry(1.1, 0.86, 0.09), poseMatrix([x, y, z], rotationY), { tile: 0.4, castShadow: false });
  room.geo('surface.dado', boxGeometry(1.02, 0.78, 0.03), poseMatrix([x + inward[0] * 0.045, y, z + inward[2] * 0.045], rotationY), { tile: 0.4, castShadow: false });
  // Hooks in rows, most of them with a tag, some of them empty. The empty ones
  // are the detail: somebody took those keys.
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 7; k++) {
      const hx = x + c * (-0.42 + k * 0.14) + inward[0] * 0.07;
      const hz = z - s * (-0.42 + k * 0.14) + inward[2] * 0.07;
      const hy = y + 0.3 - r * 0.19;
      room.geo('steel', cyl(0.006, 0.006, 0.05, 4), tiltMatrix([hx, hy, hz], [Math.PI / 2, rotationY, 0]), FLAT);
      if (room.chance(0.7)) {
        room.geo('brass', boxGeometry(0.045, 0.07, 0.008), poseMatrix([hx + inward[0] * 0.03, hy - 0.05, hz + inward[2] * 0.03], rotationY), FLAT);
        room.geo('itemMetal', boxGeometry(0.018, 0.06, 0.006), poseMatrix([hx + inward[0] * 0.034, hy - 0.11, hz + inward[2] * 0.034], rotationY), FLAT);
      }
    }
  }
  // The glazed door, hanging open on its hinge.
  slab(room, 'timberDark', [1.06, 0.82, 0.035], [x + c * 0.5 + inward[0] * 0.42, y, z - s * 0.5 + inward[2] * 0.42], [0, rotationY + 1.05, 0], { tile: 0.4 });
  room.geo('warmWash', quad(1.7, 1.5), poseMatrix([x + inward[0] * 0.02, y, z + inward[2] * 0.02], rotationY + Math.PI), FLAT);
}

/* --- water, tile and the wash-house ------------------------------------------------ */

/**
 * A row of shower standards: a header pipe on brackets with roses hanging off
 * it, and no valves a prisoner could reach. One of them is still running, which
 * is what makes the room read as a place somebody left rather than a fitting.
 */
export function showerRow(room: Room, side: Side, along: number, count = 4, spread = 3.4, running = 1, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.28, cell);
  const [x, , z] = position;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const y = 2.15;
  room.geo('lead', cyl(0.045, 0.045, spread + 0.4, 7), tiltMatrix([x, y, z], [0, rotationY, Math.PI / 2]), { tile: 0.4, castShadow: false });
  for (let i = 0; i < count; i++) {
    const t = (i / Math.max(1, count - 1) - 0.5) * spread;
    const px = x + c * t;
    const pz = z - s * t;
    // The drop, the elbow, the valve body and the rose - four pieces, because a
    // bare stub hanging off a header does not read as a shower from six metres,
    // and six metres is where a player meets this wall.
    strut(room, 'lead', [px, y, pz], [px, y - 0.46, pz], 0.026, 6, FLAT);
    room.geo('lead', cyl(0.045, 0.045, 0.1, 8), poseMatrix([px, y - 0.5, pz]), FLAT);
    room.geo('brass', cyl(0.055, 0.055, 0.08, 8), poseMatrix([px, y - 0.6, pz]), FLAT);
    room.geo('brass', cyl(0.075, 0.14, 0.11, 10), poseMatrix([px, y - 0.7, pz]), FLAT);
    room.geo('brass', disc(0.135, 10), tiltMatrix([px, y - 0.706, pz], [Math.PI / 2, 0, 0]), FLAT);
    // A ring of lime scale on the tile behind each one.
    room.geo('lime', quad(0.5, 0.5), tiltMatrix([px, y - 0.3, pz + (rotationY === 0 ? 0.24 : 0)], [0, rotationY + Math.PI, 0]), FLAT);
    if (i === running) {
      // The water: a thin unlit column and a wet patch under it, plus steam.
      room.geo('water', cyl(0.022, 0.04, y - 0.78, 5), poseMatrix([px, (y - 0.78) / 2 + 0.02, pz]), FLAT);
      room.geo('water', disc(0.62, 12), tiltMatrix([px, 0.014, pz], [-Math.PI / 2, 0, 0]), FLAT);
      steamPlume(room, px, pz, 0.05, 1.7, 0.9);
    }
  }
  // The brackets holding the header up.
  for (const sx of [-1, 1]) {
    room.geo('ironBar', boxGeometry(0.05, 0.05, 0.3), poseMatrix([x + c * sx * (spread / 2 + 0.1), y, z - s * sx * (spread / 2 + 0.1)], rotationY), FLAT);
  }
}

/** A trough sink on cast brackets, with two taps and a stopper chain. */
export function washTrough(room: Room, side: Side, along: number, width = 1.8, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.26, cell);
  const [x, , z] = position;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  room.geo('porcelain', boxGeometry(width, 0.26, 0.46), poseMatrix([x, 0.84, z], rotationY), { tile: 0.5, castShadow: false });
  room.geo('steelDark', boxGeometry(width - 0.14, 0.06, 0.36), poseMatrix([x, 0.98, z], rotationY), FLAT);
  for (const sx of [-1, 1]) {
    room.geo('ironBar', boxGeometry(0.06, 0.34, 0.36), poseMatrix([x + c * sx * (width / 2 - 0.14), 0.5, z - s * sx * (width / 2 - 0.14)], rotationY), FLAT);
  }
  const taps = Math.max(2, Math.round(width / 0.75));
  for (let i = 0; i < taps; i++) {
    const t = (i - (taps - 1) / 2) * (width / taps);
    const px = x + c * t - inward[0] * 0.22;
    const pz = z - s * t - inward[2] * 0.22;
    post(room, 'brass', 0.018, 0.022, 0.2, [px, 1.02, pz], 6, FLAT);
    strut(room, 'brass', [px, 1.2, pz], [px + inward[0] * 0.14, 1.16, pz + inward[2] * 0.14], 0.016, 5, FLAT);
  }
  room.geo('lead', boxGeometry(width * 0.2, 0.02, 0.3), poseMatrix([x, 0.84, z], rotationY), FLAT);
  room.collider({ kind: 'box', center: [x, z], halfExtents: [width / 2, 0.26], rotationY });
}

/**
 * A floor channel with a grating over it: the wash-house's spine, and the one
 * thing that gives a tiled room a direction.
 *
 * It is a raised kerb with a dark bed, never a hole - the kit lays one solid
 * floor slab per cell and anything below `y = 0` is simply behind it
 * (ROOM_FORMAT.md §5). It carries no collider: you step over a gutter.
 */
export function drainChannel(room: Room, from: readonly [number, number], to: readonly [number, number], width = 0.3): void {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  if (length < 0.1) return;
  // The channel is authored running along its own local +X, then turned.
  const yaw = -Math.atan2(dx, dz) + Math.PI / 2;
  const mx = (from[0] + to[0]) / 2;
  const mz = (from[1] + to[1]) / 2;
  const nx = Math.sin(yaw);
  const nz = Math.cos(yaw);

  room.geo('itemTar', boxGeometry(length, 0.02, width), poseMatrix([mx, 0.012, mz], yaw), { tile: 0.5, castShadow: false });
  // The kerbs either side, in the floor's own tile so they read as formed.
  for (const s of [-1, 1]) {
    room.geo('surface.drain', boxGeometry(length, 0.05, 0.08), poseMatrix([mx + nx * s * (width / 2 + 0.04), 0.014, mz + nz * s * (width / 2 + 0.04)], yaw), {
      tile: 0.4,
      castShadow: false,
    });
  }
  const bars = Math.max(6, Math.round(length / 0.12));
  for (let i = 0; i < bars; i++) {
    const t = (i + 0.5) / bars;
    room.geo('ironBar', boxGeometry(0.04, 0.03, width), poseMatrix([from[0] + dx * t, 0.04, from[1] + dz * t], yaw), FLAT);
  }
  room.geo('water', quad(length * 0.9, width * 0.7), tiltMatrix([mx, 0.024, mz], [-Math.PI / 2, yaw, 0]), FLAT);
}

/** A round gully in the floor with a grating: cheap, and every wet room has one. */
export function floorGully(room: Room, x: number, z: number, radius = 0.16): void {
  room.geo('steelDark', cyl(radius + 0.05, radius + 0.05, 0.03, 10), poseMatrix([x, 0.02, z]), FLAT);
  room.geo('itemTar', disc(radius, 10), tiltMatrix([x, 0.036, z], [-Math.PI / 2, 0, 0]), FLAT);
  const yaw = room.range(0, 1.2);
  for (let i = 0; i < 3; i++) {
    room.geo('ironBar', boxGeometry(radius * 2, 0.012, 0.02), poseMatrix([x + Math.sin(yaw) * (i - 1) * radius * 0.5, 0.042, z + Math.cos(yaw) * (i - 1) * radius * 0.5], yaw), FLAT);
  }
  room.geo('water', disc(radius * 3.4, 12), tiltMatrix([x, 0.013, z], [-Math.PI / 2, 0, 0]), FLAT);
}

/** A patch of standing water. Never near-black: a dark disc on a floor is a hole. */
export function puddle(room: Room, x: number, z: number, radius = 0.8): void {
  // Four overlapping lobes rather than one circle: a single disc reads as a dot
  // of paint (docs/art/ROOM_REVIEW.md - the Heartwood pass).
  for (let i = 0; i < 3; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = room.range(0, radius * 0.3);
    room.geo('water', disc(radius * room.range(0.4, 0.66), 12), tiltMatrix([x + Math.cos(a) * d, 0.013 + i * 0.001, z + Math.sin(a) * d], [-Math.PI / 2, 0, 0]), FLAT);
  }
}

/**
 * A hospital bath with a canvas lid over it and a head sticking out of the hole
 * in the middle. Hydrotherapy, and it is the most upsetting object in the pack
 * precisely because it is a completely ordinary piece of equipment.
 */
export function hydroTub(room: Room, x: number, z: number, rotationY = 0, occupied = false): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  const w = 1.72;
  const d = 0.78;
  // The tub: a porcelain box on four ball feet, with the water back-faced inside.
  room.geo('porcelain', boxGeometry(w, 0.62, d), poseMatrix(at(0, 0.31, 0), rotationY), { tile: 0.6, ...CASTS });
  room.geo('brine', boxGeometry(w - 0.14, 0.4, d - 0.14), poseMatrix(at(0, 0.36, 0), rotationY), FLAT);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      room.geo('brass', ball(0.055, 6), poseMatrix(at(sx * (w / 2 - 0.14), 0.05, sz * (d / 2 - 0.12))), FLAT);
    }
  }
  // The canvas lid, laced down, with a collar hole at one end.
  room.geo('canvas', boxGeometry(w - 0.04, 0.035, d - 0.04), poseMatrix(at(0, 0.6, 0), rotationY), { tile: 0.5, castShadow: false });
  room.geo('leather', ring(0.15, 0.026, 10), tiltMatrix(at(-w * 0.32, 0.63, 0), [Math.PI / 2, rotationY, 0]), FLAT);
  for (let i = 0; i < 6; i++) {
    const t = -w / 2 + (w * (i + 0.5)) / 6;
    for (const sz of [-1, 1]) {
      room.geo('leather', boxGeometry(0.05, 0.11, 0.03), poseMatrix(at(t, 0.55, sz * (d / 2 - 0.01)), rotationY), FLAT);
    }
  }
  if (occupied) {
    // A head, tipped back, and nothing else. What makes it read as a person is
    // that it is a sphere with a jaw on it and it is not centred in the collar.
    room.geo('wax', ball(0.115, 8), poseMatrix(at(-w * 0.32 + 0.02, 0.7, 0.02)), { tile: 0.2, castShadow: false });
    room.geo('wax', boxGeometry(0.11, 0.09, 0.13), poseMatrix(at(-w * 0.3, 0.65, 0.03), rotationY), FLAT);
    room.geo('canvas', boxGeometry(0.2, 0.05, 0.19), poseMatrix(at(-w * 0.36, 0.72, 0.01), rotationY), FLAT);
  }
  // The filling pipe and its handwheel, coming up at one end.
  const foot = at(w / 2 + 0.16, 0.02, 0);
  const riser = at(w / 2 + 0.16, 0.92, 0);
  const spout = at(w / 2 - 0.12, 0.92, 0);
  pipeRun(room, [foot, riser, spout], 0.028, 'lead', false);
  room.geo('brass', ring(0.07, 0.014, 8), tiltMatrix(at(w / 2 + 0.16, 0.78, 0), [Math.PI / 2, rotationY, 0]), FLAT);
  room.collider({ kind: 'box', center: [x, z], halfExtents: [w / 2, d / 2], rotationY });
}

/** Steam or vapour rising: additive and masked, so it never greys out what is behind. */
export function steamPlume(room: Room, x: number, z: number, from = 0, height = 1.8, width = 1.0, material = 'steam'): void {
  for (let i = 0; i < 2; i++) {
    room.geo(material, quad(width, height), tiltMatrix([x, from + height / 2, z], [0, i * Math.PI * 0.5 + room.range(-0.2, 0.2), 0]), FLAT);
  }
}

/* --- the Ward: clinical equipment -------------------------------------------------- */

/** A wheeled instrument trolley with a tray of instruments laid out on it. */
export function trolley(room: Room, x: number, z: number, rotationY = 0, loaded = true): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  for (const y of [0.78, 0.42]) {
    room.geo('surgical', boxGeometry(0.66, 0.035, 0.44), poseMatrix(at(0, y, 0), rotationY), { tile: 0.4, castShadow: false });
    room.geo('surgical', boxGeometry(0.7, 0.035, 0.03), poseMatrix(at(0, y + 0.03, -0.22), rotationY), FLAT);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      post(room, 'surgical', 0.016, 0.016, 0.78, at(sx * 0.3, 0.06, sz * 0.19), 5, FLAT);
      room.geo('rubberProp', cyl(0.035, 0.035, 0.025, 6), tiltMatrix(at(sx * 0.3, 0.035, sz * 0.19), [0, 0, Math.PI / 2]), FLAT);
    }
  }
  if (loaded) {
    room.geo('enamel', boxGeometry(0.34, 0.035, 0.24), poseMatrix(at(-0.1, 0.81, 0), rotationY), FLAT);
    for (let i = 0; i < 5; i++) {
      room.geo('surgical', boxGeometry(room.range(0.09, 0.2), 0.012, 0.016), poseMatrix(at(-0.14 + i * 0.045, 0.83, room.range(-0.07, 0.07)), rotationY + room.range(-0.2, 0.2)), FLAT);
    }
    room.geo('itemGlass', cyl(0.035, 0.035, 0.11, 7), poseMatrix(at(0.22, 0.8, 0.04)), FLAT);
  }
  room.blockCircle(x, z, 0.3);
}

/**
 * An operating or examination table: a steel top with a channel round it, a
 * pedestal, and four restraint straps hanging off the sides.
 *
 * The straps are the whole prop. A table without them is furniture; a table with
 * four of them, one of them fastened, is a room with a history.
 */
export function slabTable(room: Room, x: number, z: number, rotationY = 0, strapped = 2, drain = true): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  const w = 1.92;
  const d = 0.66;
  room.geo('surgical', boxGeometry(w, 0.06, d), poseMatrix(at(0, 0.86, 0), rotationY), { tile: 0.5, ...CASTS });
  // The channel round the edge, and the fall to the foot.
  for (const sz of [-1, 1]) {
    room.geo('surgical', boxGeometry(w, 0.035, 0.04), poseMatrix(at(0, 0.9, sz * (d / 2 - 0.02)), rotationY), FLAT);
  }
  room.geo('surgical', boxGeometry(0.04, 0.035, d), poseMatrix(at(-w / 2 + 0.02, 0.9, 0), rotationY), FLAT);
  // Pedestal and base.
  room.geo('surgical', cyl(0.09, 0.13, 0.8, 9), poseMatrix(at(0, 0.46, 0)), { tile: 0.3, castShadow: false });
  room.geo('surgical', cyl(0.3, 0.34, 0.07, 12), poseMatrix(at(0, 0.05, 0)), { tile: 0.3, castShadow: false });
  if (drain) {
    room.geo('steelDark', cyl(0.05, 0.05, 0.04, 8), poseMatrix(at(w / 2 - 0.16, 0.84, 0)), FLAT);
    pipeRun(room, [at(w / 2 - 0.16, 0.84, 0), at(w / 2 - 0.16, 0.3, 0), at(w / 2 + 0.5, 0.06, 0)], 0.028, 'lead', false);
    room.geo('enamel', cyl(0.16, 0.14, 0.14, 9), poseMatrix(at(w / 2 + 0.5, 0.02, 0)), FLAT);
  }
  // The straps: leather tails hanging off the sides, one of them buckled across.
  for (let i = 0; i < 4; i++) {
    const t = -w / 2 + (w * (i + 0.5)) / 4;
    for (const sz of [-1, 1]) {
      const drop = room.range(0.2, 0.42);
      slab(room, 'leather', [0.055, drop, 0.02], at(t, 0.86 - drop / 2, sz * (d / 2 + 0.01)), [0, rotationY, room.range(-0.12, 0.12)], { tile: 0.2 });
    }
    if (i < strapped) {
      room.geo('leather', boxGeometry(0.06, 0.02, d + 0.06), poseMatrix(at(t, 0.94, 0), rotationY), FLAT);
      room.geo('brass', boxGeometry(0.05, 0.025, 0.05), poseMatrix(at(t, 0.95, d * 0.3), rotationY), FLAT);
    }
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [w / 2 - 0.06, d / 2 - 0.02], rotationY });
}

/**
 * The theatre lamp: a saucer of reflectors on a jointed arm. The biggest object
 * in the Ward and the one a player looks up at, so it earns a shadow flag and a
 * real light.
 */
export function theatreLamp(room: Room, x: number, z: number, lit = false, intensity = 12, drop = 1.05): THREE.PointLight | null {
  const { ceilingHeight } = room.ctx.dims;
  const y = ceilingHeight - drop;
  room.geo('surgical', cyl(0.09, 0.11, 0.16, 9), poseMatrix([x, ceilingHeight - 0.08, z]), FLAT);
  strut(room, 'surgical', [x, ceilingHeight - 0.14, z], [x + 0.36, y + 0.4, z], 0.032, 6, FLAT);
  strut(room, 'surgical', [x + 0.36, y + 0.4, z], [x, y + 0.1, z], 0.028, 6, FLAT);
  // The saucer: a shallow dish with five reflector cups in it, face down.
  room.geo('enamel', cyl(0.54, 0.62, 0.15, 16, true), poseMatrix([x, y + 0.07, z]), { tile: 0.4, castShadow: false });
  room.geo('enamel', disc(0.58, 16), tiltMatrix([x, y + 0.15, z], [Math.PI / 2, 0, 0]), FLAT);
  for (let i = 0; i < 5; i++) {
    const a = i === 4 ? 0 : (i / 4) * Math.PI * 2;
    const r = i === 4 ? 0 : 0.34;
    room.geo('surgical', cyl(0.14, 0.09, 0.09, 9, true), poseMatrix([x + Math.cos(a) * r, y + 0.01, z + Math.sin(a) * r]), FLAT);
    // Facing DOWN. A CircleGeometry fronts on +Z, so the obvious quarter turn
    // points every reflector up into the saucer and the biggest lamp in the Ward
    // renders as a dark plate (docs/art/ROOM_REVIEW.md).
    room.geo('bulbCold', disc(0.095, 9), tiltMatrix([x + Math.cos(a) * r, y - 0.036, z + Math.sin(a) * r], [Math.PI / 2, 0, 0]), FLAT);
  }
  room.geo('surgical', ring(0.61, 0.02, 16), tiltMatrix([x, y + 0.03, z], [Math.PI / 2, 0, 0]), FLAT);
  // The pool it lays on the table under it, hard-edged for a theatre lamp.
  room.geo('coldWash', disc(1.9, 20), tiltMatrix([x, 0.014, z], [-Math.PI / 2, 0, 0]), FLAT);

  if (!lit) return null;
  const lamp = new THREE.PointLight(0xdcf4e6, intensity, room.ctx.dims.cellSize * 1.7, 2);
  lamp.position.set(x, y - 0.25, z);
  room.light(lamp);
  return lamp;
}

/** A hospital cot with a wire frame, a rubber sheet and restraints at the wrists. */
export function medCot(room: Room, x: number, z: number, rotationY = 0, strapped = false, sheeted = true): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  const w = 1.9;
  const d = 0.78;
  room.geo('surgical', boxGeometry(w, 0.05, d), poseMatrix(at(0, 0.56, 0), rotationY), { tile: 0.4, castShadow: false });
  room.geo(sheeted ? 'linen' : 'canvas', boxGeometry(w - 0.08, 0.12, d - 0.06), poseMatrix(at(0, 0.61, 0), rotationY), { tile: 0.5, castShadow: false });
  if (sheeted) {
    // A drop of sheet over the side with a fold in it: a smooth cloth under a
    // lamp is a white plank (docs/art/ROOM_REVIEW.md).
    for (const sz of [-1, 1]) {
      slab(room, 'linen', [w - 0.1, 0.3, 0.02], at(0, 0.58, sz * (d / 2 + 0.02)), [0, rotationY, 0], { tile: 0.4 });
      slab(room, 'linen', [w - 0.3, 0.16, 0.02], at(0.1, 0.46, sz * (d / 2 + 0.06)), [0.3, rotationY, 0], { tile: 0.4 });
    }
  }
  // Head and foot ends: tubular frames with three uprights each.
  for (const sx of [-1, 1]) {
    const hh = sx < 0 ? 0.95 : 0.72;
    for (const sz of [-1, 1]) post(room, 'surgical', 0.019, 0.019, hh, at(sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.05)), 5, FLAT);
    room.geo('surgical', cyl(0.019, 0.019, d - 0.1, 5), tiltMatrix(at(sx * (w / 2 - 0.03), hh, 0), [Math.PI / 2, rotationY, 0]), FLAT);
    for (let i = 0; i < 3; i++) {
      post(room, 'surgical', 0.011, 0.011, hh - 0.56, at(sx * (w / 2 - 0.03), 0.56, -d / 2 + (d * (i + 1)) / 4), 4, FLAT);
    }
  }
  // Castors.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    room.geo('rubberProp', cyl(0.04, 0.04, 0.025, 6), tiltMatrix(at(sx * (w / 2 - 0.03), 0.04, sz * (d / 2 - 0.05)), [0, 0, Math.PI / 2]), FLAT);
  }
  if (strapped) {
    for (const sx of [-0.62, 0.5]) {
      for (const sz of [-1, 1]) {
        room.geo('leather', boxGeometry(0.06, 0.025, d * 0.5), poseMatrix(at(sx * w * 0.5, 0.7, sz * d * 0.16), rotationY), FLAT);
        slab(room, 'leather', [0.055, 0.34, 0.02], at(sx * w * 0.5, 0.5, sz * (d / 2 + 0.01)), [0, rotationY, 0.1], { tile: 0.2 });
      }
    }
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [w / 2 - 0.04, d / 2 - 0.02], rotationY });
}

/**
 * A rail of hospital curtain, hung in panels with real gaps between them.
 *
 * The gaps are the point: three panels six centimetres apart is arithmetically a
 * gap and visually a wall, and what makes a screened bay frightening is not
 * being able to check all of what is behind it (docs/art/ROOM_REVIEW.md).
 */
export function curtainRail(room: Room, from: Vec3, to: Vec3, drawn = 0.6, height = 2.1): void {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const mid: Vec3 = [(from[0] + to[0]) / 2, height, (from[2] + to[2]) / 2];
  room.geo('surgical', cyl(0.016, 0.016, length, 5), tiltMatrix(mid, [Math.PI / 2, yaw, 0]), FLAT);
  for (const t of [0, 1]) {
    strut(room, 'surgical', [from[0] + dx * t, height, from[2] + dz * t], [from[0] + dx * t, room.ctx.dims.ceilingHeight, from[2] + dz * t], 0.012, 4, FLAT);
  }
  const panels = Math.max(2, Math.round((length * drawn) / 0.55));
  for (let i = 0; i < panels; i++) {
    const t = ((i + 0.5) / panels) * drawn;
    const px = from[0] + dx * t;
    const pz = from[2] + dz * t;
    // Each panel is a leaf with its own hang and its own gap to the next.
    slab(room, 'canvas', [0.52, height - 0.42, 0.015], [px, height - (height - 0.42) / 2 - 0.02, pz], [0, yaw + room.range(-0.22, 0.22), 0], { tile: 0.7 });
    room.geo('surgical', ring(0.022, 0.005, 6), tiltMatrix([px, height, pz], [0, yaw, Math.PI / 2]), FLAT);
  }
}

/** A tall glazed instrument cabinet. Two shelves of steel and a lot of reflection. */
export function medCabinet(room: Room, side: Side, along: number, cell: Cell = [0, 0]): { position: Vec3; rotationY: number } {
  const pose = wallPose(room, side, along, 0.22, cell);
  const [x, , z] = pose.position;
  const rotationY = pose.rotationY;
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  room.geo('enamel', boxGeometry(0.94, 1.86, 0.4), poseMatrix([x, 0.93, z], rotationY), { tile: 0.5, ...CASTS });
  room.geo('steelDark', boxGeometry(0.86, 1.7, 0.06), poseMatrix([x + inward[0] * 0.18, 0.98, z + inward[2] * 0.18], rotationY), FLAT);
  for (let i = 0; i < 3; i++) {
    const y = 0.42 + i * 0.5;
    room.geo('surgical', boxGeometry(0.84, 0.02, 0.32), poseMatrix([x, y, z], rotationY), FLAT);
    for (let k = 0; k < 4; k++) {
      room.geo(k % 2 ? 'itemGlass' : 'enamel', boxGeometry(0.12, room.range(0.1, 0.22), 0.12), poseMatrix([x + Math.cos(rotationY) * (-0.3 + k * 0.2), y + 0.02, z - Math.sin(rotationY) * (-0.3 + k * 0.2)], rotationY), FLAT);
    }
  }
  // The glass doors and their frames, plus the highlight that makes them glass.
  for (const s of [-1, 1]) {
    room.geo('glassPane', quad(0.42, 1.62), poseMatrix([x + inward[0] * 0.2 + Math.cos(rotationY) * s * 0.22, 0.98, z + inward[2] * 0.2 - Math.sin(rotationY) * s * 0.22], rotationY + Math.PI), FLAT);
    room.geo('surgical', boxGeometry(0.03, 1.7, 0.05), poseMatrix([x + inward[0] * 0.2 + Math.cos(rotationY) * s * 0.44, 0.98, z + inward[2] * 0.2 - Math.sin(rotationY) * s * 0.44], rotationY), FLAT);
  }
  room.geo('glassCrack', quad(0.14, 1.5), tiltMatrix([x + inward[0] * 0.22, 0.98, z + inward[2] * 0.22], [0, rotationY + Math.PI, 0.1]), FLAT);
  room.collider({ kind: 'box', center: [x, z], halfExtents: [0.44, 0.2], rotationY });
  return pose;
}

/**
 * A specimen jar: a glass cylinder of fluid with something in it. Back-faced
 * fluid, so the contents sit in front of the far wall rather than behind an
 * opaque drum (docs/art/ROOM_REVIEW.md - the Kerberos Deep pass).
 */
export function specimenJar(room: Room, x: number, y: number, z: number, radius = 0.09, height = 0.26, lit = false): void {
  room.geo('brine', cyl(radius - 0.012, radius - 0.012, height - 0.03, 9), poseMatrix([x, y + height / 2, z]), FLAT);
  // The specimen: two lumps at two heights, so it reads from every angle.
  room.geo(lit ? 'caul' : 'wax', ball(radius * 0.5, 6), poseMatrix([x + radius * 0.15, y + height * 0.42, z]), FLAT);
  room.geo(lit ? 'caul' : 'wax', ball(radius * 0.32, 5), poseMatrix([x - radius * 0.2, y + height * 0.66, z + radius * 0.15]), FLAT);
  room.geo('glassPane', cyl(radius, radius, height, 9, true), poseMatrix([x, y + height / 2, z]), FLAT);
  room.geo('itemTar', cyl(radius * 1.05, radius * 1.05, 0.02, 9), poseMatrix([x, y + height, z]), FLAT);
  room.geo('paper', boxGeometry(radius * 1.1, height * 0.3, 0.004), poseMatrix([x, y + height * 0.3, z - radius], 0), FLAT);
  if (lit) room.geo('violetWash', disc(radius * 4, 12), tiltMatrix([x, y + 0.004, z], [-Math.PI / 2, 0, 0]), FLAT);
}

/** A shelf of specimen jars, evenly spaced with two gaps in the run. */
export function jarShelf(room: Room, side: Side, along: number, y: number, count = 5, width = 1.6, lit = false, cell: Cell = [0, 0]): void {
  const pose = shelf(room, side, along, y, width, 0.32, cell);
  const [x, , z] = pose.position;
  const c = Math.cos(pose.rotationY);
  const s = Math.sin(pose.rotationY);
  for (let i = 0; i < count; i++) {
    if (room.chance(0.16)) continue;
    const t = (i - (count - 1) / 2) * (width / count);
    specimenJar(room, x + c * t, y + 0.025, z - s * t, room.range(0.07, 0.1), room.range(0.2, 0.3), lit);
  }
}

/**
 * An anatomical wax figure on a stand: the Collection's centrepiece. Built as a
 * standing torso rather than a whole body, because what makes it read is the
 * cut - a figure with its front opened and the inside painted.
 */
export function waxModel(room: Room, x: number, z: number, rotationY = 0, height = 1.5): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  // Plinth.
  room.geo('timberDark', cyl(0.24, 0.28, 0.16, 10), poseMatrix(at(0, 0.08, 0)), { tile: 0.3, castShadow: false });
  post(room, 'ironBar', 0.03, 0.03, height - 0.9, at(0, 0.16, 0), 6, FLAT);
  // The torso: a waist narrower than the shoulders, which is the whole trick.
  const base = height - 0.74;
  room.geo('wax', cyl(0.16, 0.2, 0.34, 9), poseMatrix(at(0, base + 0.17, 0)), { tile: 0.3, ...CASTS });
  room.geo('wax', cyl(0.24, 0.17, 0.3, 9), poseMatrix(at(0, base + 0.47, 0)), { tile: 0.3, castShadow: false });
  // The cut: a dark cavity down the front with two pale ribs across it.
  room.geo('stain', boxGeometry(0.19, 0.5, 0.1), poseMatrix(at(0, base + 0.34, 0.16), rotationY), FLAT);
  for (let i = 0; i < 4; i++) {
    room.geo('lime', boxGeometry(0.2, 0.022, 0.03), poseMatrix(at(0, base + 0.5 - i * 0.09, 0.2), rotationY + (i % 2 ? 0.05 : -0.05)), FLAT);
  }
  // Shoulders, arms cut at the elbow, and a head tipped very slightly back.
  for (const sx of [-1, 1]) {
    room.geo('wax', cyl(0.055, 0.07, 0.3, 7), tiltMatrix(at(sx * 0.24, base + 0.5, 0), [0.25, rotationY, sx * 0.28]), FLAT);
  }
  room.geo('wax', cyl(0.055, 0.07, 0.11, 7), poseMatrix(at(0, base + 0.62, 0)), FLAT);
  room.geo('wax', ball(0.115, 8), poseMatrix(at(0, base + 0.79, -0.01)), { tile: 0.2, castShadow: false });
  room.geo('wax', boxGeometry(0.13, 0.1, 0.13), poseMatrix(at(0, base + 0.74, 0.03), rotationY), FLAT);
  room.blockCircle(x, z, 0.3);
}

/** A bank of mortuary drawers, with one of them standing open and empty. */
export function mortuaryDrawers(room: Room, side: Side, along: number, cols = 3, rows = 3, openIndex = -1, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.24, cell);
  const [x, , z] = position;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  const cw = 0.62;
  const ch = 0.56;
  const width = cols * cw;
  const height = rows * ch;
  room.geo('surgical', boxGeometry(width + 0.06, height + 0.08, 0.46), poseMatrix([x, height / 2, z], rotationY), { tile: 0.6, ...CASTS });
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const index = r * cols + k;
      const t = -width / 2 + cw * (k + 0.5);
      const y = ch * (r + 0.5);
      const out = index === openIndex ? 0.62 : 0;
      const px = x + c * t + inward[0] * (0.23 + out);
      const pz = z - s * t + inward[2] * (0.23 + out);
      if (index === openIndex) {
        // The dark of the empty chamber, and the tray sliding out of it.
        room.geo('steelDark', boxGeometry(cw - 0.08, ch - 0.08, 0.44), poseMatrix([x + c * t + inward[0] * 0.02, y, z - s * t + inward[2] * 0.02], rotationY), FLAT);
        room.geo('surgical', boxGeometry(cw - 0.12, 0.04, 0.9), poseMatrix([x + c * t + inward[0] * 0.36, y - 0.14, z - s * t + inward[2] * 0.36], rotationY), FLAT);
        room.geo('lime', boxGeometry(cw - 0.2, 0.012, 0.7), poseMatrix([x + c * t + inward[0] * 0.4, y - 0.11, z - s * t + inward[2] * 0.4], rotationY), FLAT);
      }
      room.geo('surgical', boxGeometry(cw - 0.05, ch - 0.05, 0.05), poseMatrix([px, y, pz], rotationY), { tile: 0.4, castShadow: false });
      room.geo('steelDark', boxGeometry(0.2, 0.045, 0.06), poseMatrix([px + inward[0] * 0.04, y - 0.06, pz + inward[2] * 0.04], rotationY), FLAT);
      room.geo('paper', boxGeometry(0.12, 0.08, 0.006), poseMatrix([px + inward[0] * 0.03, y + 0.13, pz + inward[2] * 0.03], rotationY), FLAT);
    }
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [width / 2, 0.22], rotationY });
}

/**
 * The treatment machine: a mahogany case of dials with two electrode leads
 * hanging out of it. Period electro-convulsive equipment looked exactly like a
 * radiogram, and that is what makes it frightening.
 */
export function treatmentMachine(room: Room, x: number, z: number, rotationY = 0, live = true): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  // The trolley it stands on.
  room.geo('timberDark', boxGeometry(0.78, 0.05, 0.5), poseMatrix(at(0, 0.7, 0), rotationY), { tile: 0.4, castShadow: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) post(room, 'steelDark', 0.018, 0.018, 0.7, at(sx * 0.34, 0, sz * 0.21), 5, FLAT);
  // The case.
  room.geo('timberDark', boxGeometry(0.72, 0.44, 0.44), poseMatrix(at(0, 0.97, 0), rotationY), { tile: 0.4, ...CASTS });
  room.geo('bulbDead', boxGeometry(0.6, 0.3, 0.03), poseMatrix(at(0, 0.99, -0.22), rotationY), FLAT);
  // Dials and switches on the fascia.
  for (let i = 0; i < 3; i++) {
    room.geo('brass', cyl(0.055, 0.055, 0.03, 9), tiltMatrix(at(-0.2 + i * 0.2, 1.06, -0.24), [Math.PI / 2, rotationY, 0]), FLAT);
    room.geo('itemEnamel', disc(0.045, 9), poseMatrix(at(-0.2 + i * 0.2, 1.06, -0.26), rotationY + Math.PI), FLAT);
    room.geo('paintRed', boxGeometry(0.03, 0.008, 0.006), tiltMatrix(at(-0.2 + i * 0.2, 1.06, -0.27), [0, rotationY + Math.PI, room.range(-1, 1)]), FLAT);
  }
  for (let i = 0; i < 5; i++) {
    room.geo('ironPale', boxGeometry(0.02, 0.05, 0.02), poseMatrix(at(-0.24 + i * 0.12, 0.87, -0.24), rotationY), FLAT);
  }
  room.geo(live ? 'lumenRed' : 'bulbDead', ball(0.026, 5), poseMatrix(at(0.26, 1.12, -0.24)), FLAT);
  // The leads: two cables running off the side and ending in rubber electrodes.
  for (const sz of [-1, 1]) {
    const ex = at(0.42, 0.55, sz * 0.24);
    pipeRun(room, [at(0.36, 0.95, sz * 0.12), at(0.5, 0.7, sz * 0.2), ex], 0.014, 'rubberProp', false);
    room.geo('rubberProp', cyl(0.055, 0.055, 0.03, 8), tiltMatrix(ex, [Math.PI / 2, rotationY, 0]), FLAT);
    room.geo('brass', disc(0.04, 8), poseMatrix([ex[0], ex[1], ex[2]], rotationY), FLAT);
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [0.38, 0.26], rotationY });
}

/**
 * A restraint chair: a heavy frame bolted to the floor with straps at every
 * joint and a head clamp. The one prop in the pack whose whole shape is about a
 * body that is not there.
 */
export function restraintChair(room: Room, x: number, z: number, rotationY = 0, hood = false): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  // Bolted base plate and four legs.
  room.geo('ironPale', boxGeometry(0.6, 0.035, 0.6), poseMatrix(at(0, 0.02, 0), rotationY), FLAT);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) post(room, 'ironBar', 0.026, 0.03, 0.46, at(sx * 0.22, 0.03, sz * 0.22), 5, FLAT);
  // Seat, back and arms. The back is tall and slightly raked.
  room.geo('timberDark', boxGeometry(0.52, 0.05, 0.5), poseMatrix(at(0, 0.48, 0), rotationY), { tile: 0.3, castShadow: false });
  slab(room, 'timberDark', [0.52, 0.9, 0.05], at(0, 0.94, 0.24), [-0.1, rotationY, 0], { tile: 0.3, castShadow: true });
  for (const sx of [-1, 1]) {
    room.geo('timberDark', boxGeometry(0.06, 0.05, 0.48), poseMatrix(at(sx * 0.28, 0.68, -0.02), rotationY), FLAT);
    post(room, 'ironBar', 0.018, 0.018, 0.2, at(sx * 0.28, 0.5, -0.2), 5, FLAT);
    // Wrist cuffs on the arms, and ankle cuffs at the base.
    room.geo('leather', ring(0.055, 0.016, 8), tiltMatrix(at(sx * 0.28, 0.73, -0.16), [0, rotationY, Math.PI / 2]), FLAT);
    room.geo('leather', ring(0.06, 0.017, 8), tiltMatrix(at(sx * 0.16, 0.1, -0.24), [0, rotationY, Math.PI / 2]), FLAT);
  }
  // Chest and waist straps across the back, one hanging loose.
  room.geo('leather', boxGeometry(0.56, 0.05, 0.03), poseMatrix(at(0, 1.02, 0.16), rotationY), FLAT);
  slab(room, 'leather', [0.05, 0.4, 0.02], at(0.3, 0.72, 0.16), [0, rotationY, 0.28], { tile: 0.2 });
  if (hood) {
    // A canvas hood over the head rest. Nothing in it, which is worse.
    room.geo('canvas', ball(0.14, 8), poseMatrix(at(0, 1.32, 0.14)), { tile: 0.2, castShadow: false });
    room.geo('canvas', cyl(0.12, 0.15, 0.16, 8), poseMatrix(at(0, 1.2, 0.14)), FLAT);
    room.geo('leather', ring(0.13, 0.016, 9), tiltMatrix(at(0, 1.16, 0.14), [Math.PI / 2, rotationY, 0]), FLAT);
  } else {
    // The head clamp: two pads on a yoke.
    room.geo('ironBar', boxGeometry(0.36, 0.04, 0.05), poseMatrix(at(0, 1.3, 0.2), rotationY), FLAT);
    for (const sx of [-1, 1]) room.geo('leather', cyl(0.045, 0.045, 0.06, 7), tiltMatrix(at(sx * 0.14, 1.3, 0.14), [0, rotationY, Math.PI / 2]), FLAT);
  }
  room.blockCircle(x, z, 0.36);
}

/* --- machinery, heat and the works -------------------------------------------------- */

/**
 * The furnace: a riveted drum with a firebox door standing open and the fire
 * still in. The only genuinely hot thing in the building, and the one warm
 * silhouette in the map that is not a light bulb.
 */
export function furnace(room: Room, x: number, z: number, rotationY = 0, lit = false, intensity = 13): THREE.PointLight | null {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  // The drum, lying on its side on two brick piers.
  room.geo('surface.rivet', cyl(0.78, 0.78, 2.2, 14), tiltMatrix(at(0, 0.98, 0), [0, rotationY, Math.PI / 2]), { tile: 1.0, ...CASTS });
  for (const sx of [-1, 1]) {
    room.geo('surface.brick', boxGeometry(0.5, 0.24, 1.5), poseMatrix(at(sx * 0.8, 0.02, 0), rotationY), { tile: 0.8, castShadow: false });
    room.geo('ironBar', ring(0.79, 0.05, 14), tiltMatrix(at(sx * 0.72, 0.98, 0), [0, rotationY, Math.PI / 2]), { tile: 0.3, castShadow: false });
  }
  // The door frame and the open door swung to one side.
  room.geo('ironBar', boxGeometry(0.86, 0.86, 0.12), poseMatrix(at(0, 0.98, 0.72), rotationY), { tile: 0.4, castShadow: false });
  slab(room, 'ironBar', [0.8, 0.8, 0.06], at(-0.62, 0.98, 1.0), [0, rotationY + 1.1, 0], { tile: 0.4 });
  room.geo('brass', cyl(0.03, 0.03, 0.16, 6), tiltMatrix(at(-0.9, 0.98, 1.16), [Math.PI / 2, rotationY, 0]), FLAT);
  // The fire: a dark bed of coke with the incandescence between the lumps rather
  // than on them - what makes a fire read is the dark, not the glow.
  room.geo('firebox', boxGeometry(0.66, 0.62, 0.5), poseMatrix(at(0, 0.7, 0.52), rotationY), { tile: 0.4, castShadow: false });
  for (let i = 0; i < 7; i++) {
    room.geo('coal', ball(room.range(0.07, 0.14), 5), poseMatrix(at(room.range(-0.28, 0.28), room.range(0.7, 1.16), room.range(0.44, 0.62))), FLAT);
  }
  // The ash pan under it, pulled half out and full.
  room.geo('ironBar', boxGeometry(0.72, 0.16, 0.5), poseMatrix(at(0, 0.28, 0.86), rotationY), FLAT);
  room.geo('ash', boxGeometry(0.66, 0.06, 0.44), poseMatrix(at(0, 0.4, 0.86), rotationY), FLAT);
  // The flue going up out of the top.
  pipeRun(room, [at(0.5, 1.7, 0), at(0.5, room.ctx.dims.ceilingHeight, 0)], 0.19, 'lead', false);
  room.geo('warmWash', disc(2.4, 18), tiltMatrix(at(0, 0.013, 1.1), [-Math.PI / 2, 0, 0]), FLAT);
  room.collider({ kind: 'box', center: [x, z], halfExtents: [1.2, 0.86], rotationY });

  if (!lit) return null;
  const lamp = new THREE.PointLight(0xff6a1e, intensity, room.ctx.dims.cellSize * 1.8, 2);
  lamp.position.set(...at(0, 1.0, 1.05));
  room.light(lamp);
  sag(room, lamp, intensity, 0.32, 1.1);
  return lamp;
}

/** A heap of coal or coke, with a shovel standing in it. */
export function coalHeap(room: Room, x: number, z: number, radius = 1.1, shovel = true): void {
  for (let i = 0; i < 14; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * radius;
    const r = room.range(0.08, 0.2) * (1 - d / (radius * 1.6));
    room.geo('coal', ball(Math.max(0.05, r), 5), tiltMatrix([x + Math.cos(a) * d, r * 0.7, z + Math.sin(a) * d], [0, a, 0], [1.3, 0.8, 1.1]), {
      tile: 0.4,
      castShadow: false,
    });
  }
  if (shovel) {
    strut(room, 'timber', [x + radius * 0.3, 0.3, z], [x + radius * 0.7, 1.3, z + 0.2], 0.022, 5, FLAT);
    slab(room, 'steelDark', [0.24, 0.03, 0.3], [x + radius * 0.3, 0.28, z], [0.4, 0.3, 0], { tile: 0.2 });
  }
  room.blockCircle(x, z, radius * 0.7);
}

/**
 * A big industrial laundry drum on a plinth: a barrel on end with a hatch in the
 * side and a door standing open. The Laundry's whole silhouette.
 */
export function laundryDrum(room: Room, x: number, z: number, rotationY = 0, open = true): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  room.geo('surface.rivet', boxGeometry(1.2, 0.24, 1.0), poseMatrix(at(0, 0, 0), rotationY), { tile: 0.8, castShadow: false });
  room.geo('surface.rivet', cyl(0.55, 0.58, 1.3, 14), poseMatrix(at(0, 0.89, 0)), { tile: 1.0, ...CASTS });
  room.geo('paintGreen', cyl(0.58, 0.58, 0.12, 14), poseMatrix(at(0, 1.5, 0)), { tile: 0.4, castShadow: false });
  // The hatch: a round door in the front, swung open, with dark behind it.
  room.geo('steelDark', disc(0.31, 12), poseMatrix(at(0, 1.02, -0.56), rotationY + Math.PI), FLAT);
  room.geo('ironBar', ring(0.33, 0.035, 12), poseMatrix(at(0, 1.02, -0.56), rotationY), { tile: 0.3, castShadow: false });
  if (open) {
    slab(room, 'ironPale', [0.62, 0.62, 0.05], at(-0.5, 1.02, -0.84), [0, rotationY + 1.2, 0], { tile: 0.3 });
    // A tongue of wet linen hanging out of it, which is what makes it read as
    // abandoned mid-cycle rather than as a machine.
    slab(room, 'linen', [0.34, 0.6, 0.03], at(0.06, 0.76, -0.62), [0.22, rotationY, 0.15], { tile: 0.5 });
  }
  // The drive: a belt wheel and a motor beside it.
  room.geo('ironBar', ring(0.24, 0.05, 12), tiltMatrix(at(0.62, 1.1, 0.2), [0, rotationY, Math.PI / 2]), { tile: 0.3, castShadow: false });
  room.geo('paintGreen', cyl(0.16, 0.16, 0.34, 9), tiltMatrix(at(0.62, 0.42, 0.2), [0, rotationY, Math.PI / 2]), { tile: 0.3, castShadow: false });
  strut(room, 'rubberProp', at(0.62, 0.86, 0.2), at(0.62, 0.56, 0.2), 0.02, 4, FLAT);
  // Steam pipes into the base.
  pipeRun(room, [at(-0.7, 0.1, 0.4), at(-0.7, 0.8, 0.4), at(-0.4, 0.8, 0.4)], 0.05, 'lead', false);
  room.collider({ kind: 'circle', center: [x, z], radius: 0.62 });
}

/** A mangle: two rollers in a cast frame with a handwheel. */
export function mangle(room: Room, x: number, z: number, rotationY = 0): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  for (const sx of [-1, 1]) {
    room.geo('paintGreen', boxGeometry(0.09, 1.1, 0.42), poseMatrix(at(sx * 0.52, 0, 0), rotationY), { tile: 0.4, castShadow: false });
    room.geo('paintGreen', boxGeometry(0.22, 0.06, 0.5), poseMatrix(at(sx * 0.52, 0, 0), rotationY), FLAT);
  }
  for (const y of [0.86, 1.02]) {
    room.geo('timberPale', cyl(0.09, 0.09, 0.96, 10), tiltMatrix(at(0, y, 0), [0, rotationY, Math.PI / 2]), { tile: 0.3, castShadow: false });
  }
  room.geo('ironBar', ring(0.22, 0.022, 11), tiltMatrix(at(0.66, 1.02, 0), [0, rotationY, Math.PI / 2]), FLAT);
  strut(room, 'ironBar', at(0.66, 1.02, 0), at(0.66, 1.24, 0), 0.016, 4, FLAT);
  room.geo('timberDark', cyl(0.026, 0.026, 0.12, 6), tiltMatrix(at(0.72, 1.24, 0), [0, rotationY, Math.PI / 2]), FLAT);
  // A sheet caught between the rollers and hanging down the far side.
  slab(room, 'linen', [0.8, 0.7, 0.02], at(0, 0.6, 0.28), [0.12, rotationY, 0], { tile: 0.5 });
  room.collider({ kind: 'box', center: [x, z], halfExtents: [0.56, 0.26], rotationY });
}

/**
 * A hanging sheet on a line. Double-sided and faintly self-lit, because a
 * single-sided blade with a lamp behind it goes black and reads as a hole cut in
 * the room (docs/art/ROOM_REVIEW.md - the mansion pass).
 *
 * No collider: a player walks through washing.
 */
export function hangingSheet(room: Room, x: number, y: number, z: number, w = 0.8, h = 1.5, rotationY = 0): void {
  /**
   * Three narrow leaves rather than one wide one, at three angles and three
   * drops.
   *
   * A single quad the full width of the sheet is a pale slab floating in the
   * room - the same finding as the Spinner's Gallery web and the viscera
   * membrane curtain, and it arrives here as a wall of cardboard across every
   * doorway (docs/art/ROOM_REVIEW.md). What makes hung linen read as linen is
   * that its silhouette is not a rectangle: the leaves are different widths,
   * they hang at different angles, and the lowest one stops short.
   */
  const leaves = 3;
  for (let i = 0; i < leaves; i++) {
    const t = (i - (leaves - 1) / 2) / leaves;
    const lw = w * room.range(0.4, 0.62);
    const lh = h * room.range(0.72, 1.0);
    const yaw = rotationY + room.range(-0.34, 0.34);
    slab(
      room,
      'linen',
      [lw, lh, 0.012],
      [x + Math.cos(rotationY) * t * w, y - lh / 2 - room.range(0, 0.08), z - Math.sin(rotationY) * t * w],
      [0, yaw, room.range(-0.09, 0.09)],
      { tile: 0.7 },
    );
  }
  for (const s of [-1, 1]) {
    room.geo('timberPale', boxGeometry(0.04, 0.09, 0.03), poseMatrix([x + Math.cos(rotationY) * s * w * 0.42, y + 0.02, z - Math.sin(rotationY) * s * w * 0.42], rotationY), FLAT);
  }
}

/** A washing line strung between two points, with the sheets already hung on it. */
export function washingLine(room: Room, from: Vec3, to: Vec3, count = 3, drop = 1.4): void {
  strut(room, 'hemp', from, to, 0.008, 4, FLAT);
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const x = from[0] + (to[0] - from[0]) * t;
    const y = from[1] + (to[1] - from[1]) * t;
    const z = from[2] + (to[2] - from[2]) * t;
    const yaw = Math.atan2(to[0] - from[0], to[2] - from[2]) + Math.PI / 2;
    hangingSheet(room, x, y - 0.02, z, room.range(0.66, 0.94), drop * room.range(0.8, 1.15), yaw);
  }
}

/* --- the set pieces ------------------------------------------------------------------ */

/**
 * The drop: a beam, a rope, a noose, the double trap and the lever that works
 * it. The single most loaded object in the pack, and it is built to be read as a
 * silhouette from the doorway - which is why the beam and the rope cast and
 * nothing else does.
 */
export function gallows(room: Room, x: number, z: number, rotationY = 0, sprung = false): void {
  const { ceilingHeight } = room.ctx.dims;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];

  // Two posts and the beam across them, all in heavy timber.
  const span = 2.5;
  for (const sx of [-1, 1]) {
    room.geo('timber', boxGeometry(0.19, ceilingHeight - 0.1, 0.19), poseMatrix(at(sx * (span / 2), (ceilingHeight - 0.1) / 2, 0), rotationY), {
      tile: 0.6,
      ...CASTS,
    });
    // Knee braces into the beam.
    slab(room, 'timber', [0.5, 0.11, 0.11], at(sx * (span / 2 - 0.22), ceilingHeight - 0.44, 0), [0, rotationY, sx * 0.78], { tile: 0.4 });
  }
  room.geo('timber', boxGeometry(span + 0.5, 0.24, 0.2), poseMatrix(at(0, ceilingHeight - 0.28, 0), rotationY), { tile: 0.6, ...CASTS });
  // The chain and shackle the rope hangs from.
  room.geo('ironPale', boxGeometry(0.16, 0.06, 0.26), poseMatrix(at(-0.35, ceilingHeight - 0.4, 0), rotationY), FLAT);
  // The rope: a hemp line down to a noose with a real coil in it.
  const ropeTop = ceilingHeight - 0.44;
  const ropeBottom = sprung ? 0.5 : 1.32;
  strut(room, 'hemp', at(-0.35, ropeTop, 0), at(-0.35, ropeBottom + 0.22, 0), 0.026, 6, CASTS);
  for (let i = 0; i < 6; i++) {
    room.geo('hemp', ring(0.1, 0.026, 9), tiltMatrix(at(-0.35, ropeBottom + 0.2 - i * 0.032, 0), [Math.PI / 2, rotationY, 0.06]), FLAT);
  }
  room.geo('hemp', ring(0.15, 0.028, 12), tiltMatrix(at(-0.35, ropeBottom, 0), [Math.PI / 2 - 0.22, rotationY, 0]), CASTS);
  // A second rope coiled on the beam, because they always kept a spare.
  for (let i = 0; i < 4; i++) {
    room.geo('hemp', ring(0.13, 0.016, 10), tiltMatrix(at(0.75, ceilingHeight - 0.2 + i * 0.03, 0), [0.1, rotationY, Math.PI / 2]), FLAT);
  }

  // The trap: two leaves in the floor with a hinge line and a hard black gap.
  // At deck level with a raised frame, never recessed - the floor is a solid
  // slab and there is no hole in it (ROOM_FORMAT.md §5).
  room.geo('timberDark', boxGeometry(2.2, 0.06, 1.9), poseMatrix(at(0, 0.01, 0), rotationY), { tile: 0.7, castShadow: false });
  room.geo('ironBar', boxGeometry(2.3, 0.05, 0.09), poseMatrix(at(0, 0.02, 0), rotationY), FLAT);
  if (sprung) {
    // The leaves hanging down, and the dark under them.
    room.geo('itemTar', boxGeometry(1.9, 0.02, 1.6), poseMatrix(at(0, 0.05, 0), rotationY), FLAT);
    for (const sz of [-1, 1]) {
      slab(room, 'timberDark', [1.9, 0.05, 0.8], at(0, 0.06, sz * 0.88), [sz * 0.9, rotationY, 0], { tile: 0.5 });
    }
  } else {
    for (const sz of [-1, 1]) {
      room.geo('timberDark', boxGeometry(2.0, 0.05, 0.86), poseMatrix(at(0, 0.05, sz * 0.46), rotationY), { tile: 0.6, castShadow: false });
    }
    room.geo('itemTar', boxGeometry(2.0, 0.02, 0.03), poseMatrix(at(0, 0.09, 0), rotationY), FLAT);
  }
  // The lever: a long iron arm in a quadrant, painted red, at the edge of the trap.
  const lx = 1.6;
  room.geo('ironBar', boxGeometry(0.26, 0.12, 0.5), poseMatrix(at(lx, 0.02, 0), rotationY), FLAT);
  slab(room, 'ironBar', [0.09, 1.1, 0.09], at(lx, 0.6, sprung ? 0.32 : -0.3), [0, rotationY, sprung ? 0.55 : -0.5], { tile: 0.3 });
  room.geo('paintRed', ball(0.075, 7), poseMatrix(at(lx + (sprung ? 0.5 : -0.48), 1.06, 0)), FLAT);
  room.geo('ironBar', ring(0.44, 0.03, 12), tiltMatrix(at(lx, 0.5, 0), [0, rotationY + Math.PI / 2, 0]), { tile: 0.3, castShadow: false });
  room.collider({ kind: 'box', center: [at(lx, 0, 0)[0], at(lx, 0, 0)[2]], halfExtents: [0.2, 0.28], rotationY });
}

/**
 * A flogging frame: a triangle of timber with shackles at the apex and the feet,
 * standing over a floor somebody has scrubbed a great many times.
 */
export function floggingFrame(room: Room, x: number, z: number, rotationY = 0): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (along: number, y: number, depth: number): Vec3 => [x + c * along - s * depth, y, z - s * along - c * depth];
  const h = 2.35;
  const spread = 0.85;
  for (const sx of [-1, 1]) {
    slab(room, 'timber', [0.12, h, 0.12], at(sx * spread * 0.5, h / 2, 0), [0, rotationY, sx * 0.36], { tile: 0.4, castShadow: true });
    room.geo('ironPale', boxGeometry(0.22, 0.05, 0.24), poseMatrix(at(sx * spread, 0.02, 0), rotationY), FLAT);
    room.geo('ironBar', ring(0.06, 0.015, 8), tiltMatrix(at(sx * spread * 0.98, 0.16, 0), [0, rotationY, Math.PI / 2]), FLAT);
    room.geo('leather', ring(0.055, 0.018, 8), tiltMatrix(at(sx * spread * 0.94, 0.24, 0.02), [Math.PI / 2, rotationY, 0]), FLAT);
  }
  // The back leg, so it stands up.
  slab(room, 'timber', [0.1, h * 0.95, 0.1], at(0, h * 0.46, -0.5), [0.42, rotationY, 0], { tile: 0.4 });
  // The apex: a bolted plate with two shackles and a strap hanging from each.
  room.geo('ironPale', boxGeometry(0.3, 0.16, 0.16), poseMatrix(at(0, h - 0.08, 0), rotationY), FLAT);
  for (const sx of [-1, 1]) {
    room.geo('ironBar', ring(0.065, 0.016, 8), tiltMatrix(at(sx * 0.11, h - 0.2, 0), [Math.PI / 2, rotationY, 0]), FLAT);
    slab(room, 'leather', [0.05, 0.42, 0.02], at(sx * 0.11, h - 0.44, 0.02), [0, rotationY, sx * 0.14], { tile: 0.2 });
  }
  room.blockCircle(x, z, 0.42);
}

/**
 * A tall containment tank with something suspended in it: the Programme's
 * centrepiece. Back-faced fluid, a dark silhouette inside, and the lamp OUTSIDE
 * the glass - a light sunk inside its own glowing mesh lights the inside of a
 * cylinder and nothing else (docs/art/ROOM_REVIEW.md).
 */
export function subjectTank(
  room: Room,
  x: number,
  z: number,
  radius = 0.52,
  height = 2.1,
  occupied = true,
  lit = false,
  intensity = 7,
): THREE.PointLight | null {
  // Base and cap, both heavier than the glass.
  room.geo('steelDark', cyl(radius + 0.11, radius + 0.14, 0.24, 12), poseMatrix([x, 0.12, z]), { tile: 0.4, castShadow: false });
  room.geo('steelDark', cyl(radius + 0.12, radius + 0.09, 0.2, 12), poseMatrix([x, height - 0.1, z]), { tile: 0.4, castShadow: false });
  // The fluid, back-faced, so the contents draw in front of the far wall.
  room.geo('brine', cyl(radius - 0.03, radius - 0.03, height - 0.5, 12), poseMatrix([x, 0.24 + (height - 0.5) / 2, z]), FLAT);
  if (occupied) {
    // The thing in it: a hunched silhouette, head down, knees up. Two masses and
    // a round head, which is what separates a person from a sack.
    room.geo('sinew', ball(radius * 0.62, 8), tiltMatrix([x, height * 0.44, z], [0, 0.6, 0], [1, 1.25, 0.9]), FLAT);
    room.geo('sinew', ball(radius * 0.34, 7), poseMatrix([x + radius * 0.16, height * 0.66, z - radius * 0.1]), FLAT);
    room.geo('caul', ball(radius * 0.72, 8), tiltMatrix([x, height * 0.46, z], [0, 0.6, 0], [1, 1.2, 0.95]), FLAT);
    // Feed lines going down into it from the cap.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      strut(room, 'rubberProp', [x + Math.cos(a) * radius * 0.5, height - 0.2, z + Math.sin(a) * radius * 0.5], [x + Math.cos(a) * radius * 0.2, height * 0.62, z + Math.sin(a) * radius * 0.2], 0.014, 4, FLAT);
    }
  }
  // The glass, the hoops that band it, and the four stiles holding it. The hoops
  // are what stop a back-faced drum reading as a flat card standing against the
  // wall: they catch the room's own light down one side and give it a round edge.
  room.geo('glassPane', cyl(radius, radius, height - 0.34, 12, true), poseMatrix([x, 0.24 + (height - 0.34) / 2, z]), FLAT);
  for (const hy of [0.52, height * 0.54, height - 0.44]) {
    room.geo('steelDark', ring(radius + 0.015, 0.022, 14), tiltMatrix([x, hy, z], [Math.PI / 2, 0, 0]), { tile: 0.3, castShadow: false });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    post(room, 'steelDark', 0.026, 0.026, height - 0.3, [x + Math.cos(a) * (radius + 0.02), 0.22, z + Math.sin(a) * (radius + 0.02)], 5, FLAT);
  }
  room.geo('violetWash', disc(radius * 3.6, 16), tiltMatrix([x, 0.013, z], [-Math.PI / 2, 0, 0]), FLAT);
  room.collider({ kind: 'circle', center: [x, z], radius: radius + 0.1 });

  if (!lit) return null;
  const lamp = new THREE.PointLight(0x9a4cff, intensity, room.ctx.dims.cellSize * 1.5, 2);
  lamp.position.set(x, height * 0.7, z + radius + 0.35);
  room.light(lamp);
  return lamp;
}

/** A cocoon of resin grown into a corner or against a wall, with something in it. */
export function cocoon(room: Room, side: Side, along: number, y = 0.5, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.34, cell);
  const [x, , z] = position;
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  const at = (d: number, yy: number): Vec3 => [x + inward[0] * d, yy, z + inward[2] * d];
  // The sac: two masses at two heights, never one lozenge.
  room.geo('surface.resin', ball(0.34, 8), tiltMatrix(at(0, y + 0.5), [0, rotationY, 0], [1, 1.5, 0.8]), { tile: 0.5, castShadow: false });
  room.geo('surface.resin', ball(0.26, 7), tiltMatrix(at(0.04, y + 1.1), [0, rotationY, 0], [1, 1.25, 0.8]), { tile: 0.5, castShadow: false });
  room.geo('caul', ball(0.36, 8), tiltMatrix(at(0, y + 0.55), [0, rotationY, 0], [1, 1.55, 0.85]), FLAT);
  // Guys of resin anchoring it to the wall, out and up.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    strut(room, 'sinew', at(-0.3, y + 0.8 + Math.sin(a) * 0.55), at(0.16 + Math.abs(Math.cos(a)) * 0.2, y + 0.8 + Math.sin(a) * 0.9), 0.017, 4, FLAT);
  }
  room.geo('violetWash', quad(1.6, 1.8), poseMatrix([x + inward[0] * 0.02, y + 0.8, z + inward[2] * 0.02], rotationY + Math.PI), FLAT);
  room.collider({ kind: 'circle', center: [x + inward[0] * 0.1, z + inward[2] * 0.1], radius: 0.36 });
}

/** A lump of resin growth on the floor or over a prop. No collider - it is scenery. */
export function resinGrowth(room: Room, x: number, z: number, radius = 0.5, count = 5, from = 0): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * radius;
    const r = room.range(0.12, 0.3);
    room.geo('surface.resin', ball(r, 6), tiltMatrix([x + Math.cos(a) * d, from + r * 0.5, z + Math.sin(a) * d], [0, a, 0], [1.3, 0.75, 1.1]), {
      tile: 0.5,
      castShadow: false,
    });
  }
  room.geo('spill', disc(radius * 1.2, 14), tiltMatrix([x, from + 0.014, z], [-Math.PI / 2, 0, 0]), FLAT);
}

/* --- atmosphere ---------------------------------------------------------------------- */

/** An additive pool of light on the floor. For anything lit that has no lamp. */
export function glowPool(room: Room, x: number, z: number, radius = 1.2, kind: 'warm' | 'cold' | 'violet' = 'warm'): void {
  room.geo(kind === 'cold' ? 'coldWash' : kind === 'violet' ? 'violetWash' : 'warmWash', disc(radius, 18), tiltMatrix([x, 0.011, z], [-Math.PI / 2, 0, 0]), FLAT);
}

/**
 * Barred light on a floor: the signature image of the whole genre, painted
 * rather than cast.
 *
 * A shadow-casting lamp per room is not something the light budget can pay for,
 * so this is an additive quad carrying a bar gobo, laid where a caged lamp's
 * light would fall through a gate. `rotationY` is the direction the bars run.
 */
export function barShadow(room: Room, x: number, z: number, w = 2.4, l = 3.2, rotationY = 0, cold = false): void {
  room.geo(cold ? 'barWashCold' : 'barWash', quad(w, l), tiltMatrix([x, 0.014, z], [-Math.PI / 2, rotationY, 0]), FLAT);
}

/** The same, thrown up a wall: what a window does to the room behind you. */
export function barShadowWall(room: Room, side: Side, along: number, y: number, w = 2.0, h = 2.2, cold = false, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.02, cell);
  const [x, , z] = position;
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  room.geo(cold ? 'barWashCold' : 'barWash', quad(w, h), poseMatrix([x + inward[0] * 0.02, y, z + inward[2] * 0.02], rotationY + Math.PI), FLAT);
}

/**
 * A shaft of light: two crossed additive quads from a source to a landing point.
 * Additive, so it adds only the bright and never lays a grey film over what is
 * behind it.
 */
export function lightShaft(room: Room, from: Vec3, to: Vec3, width: number, cold = false): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  const yaw = Math.atan2(dx, dz);
  // A `PlaneGeometry(w, length)` runs its length along local +Y, so this is the
  // same pose `strut()` uses for a cylinder. Subtracting a quarter turn from the
  // pitch - the obvious guess - lays the shaft on its side.
  const pitch = Math.acos(Math.min(1, Math.max(-1, dy / length)));
  const mid: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  for (let i = 0; i < 2; i++) {
    room.geo(cold ? 'coldWash' : 'warmWash', quad(width, length), tiltMatrix(mid, [pitch, yaw + i * Math.PI * 0.5, 0]), FLAT);
  }
}

/**
 * Motes drifting in the air: dust, lime, spores. Three-segment specks, because a
 * four-segment mote and a three-segment mote are indistinguishable at the fog
 * density they are seen through and there are hundreds of them.
 */
export function motes(room: Room, x: number, y: number, z: number, radius = 1.5, count = 12, kind: 'dust' | 'lime' | 'spore' = 'dust'): void {
  const material = kind === 'lime' ? 'lime' : kind === 'spore' ? 'caul' : 'ash';
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * radius;
    room.geo(material, ball(room.range(0.011, 0.028), 4), poseMatrix([x + Math.cos(a) * d, y + room.range(-0.8, 0.8), z + Math.sin(a) * d]), FLAT);
  }
}

/**
 * A pale patch on a floor: quicklime spilt, a stretch of boards scrubbed pale, a
 * ring of scale round a drain.
 *
 * Four overlapping lobes at four radii, never one circle. A single disc of an
 * opaque pale material lying flat reads as a dot of paint, which is the same
 * finding as an unmasked additive wash one material family over
 * (docs/art/ROOM_REVIEW.md - the Heartwood pass).
 */
export function palePatch(room: Room, x: number, z: number, radius = 1.0, material = 'lime'): void {
  for (let i = 0; i < 4; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = room.range(0, radius * 0.36);
    room.geo(material, disc(radius * room.range(0.5, 0.82), 12), tiltMatrix([x + Math.cos(a) * d, 0.012 + i * 0.001, z + Math.sin(a) * d], [-Math.PI / 2, 0, 0]), FLAT);
  }
}

/** Loose debris on a floor: a spill of small dark shapes that reads as damage. */
export function debris(room: Room, x: number, z: number, radius = 0.9, count = 8): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * radius;
    room.geo(
      room.chance(0.35) ? 'surface.brick' : room.chance(0.5) ? 'ash' : 'steelDark',
      boxGeometry(room.range(0.1, 0.3), room.range(0.02, 0.07), room.range(0.08, 0.26)),
      tiltMatrix([x + Math.cos(a) * d, 0.03, z + Math.sin(a) * d], [room.range(-0.1, 0.1), room.range(0, 3), room.range(-0.1, 0.1)]),
      { tile: 0.25, castShadow: false },
    );
  }
}

/** A drift of loose paper, which is what a records office actually looks like. */
export function paperDrift(room: Room, x: number, z: number, radius = 1.0, count = 12): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * radius;
    slab(
      room,
      'paper',
      [room.range(0.18, 0.3), 0.006, room.range(0.24, 0.36)],
      [x + Math.cos(a) * d, 0.015 + room.range(0, 0.03), z + Math.sin(a) * d],
      [room.range(-0.06, 0.06), room.range(0, 3), room.range(-0.06, 0.06)],
      { tile: 0.3, ...FLAT },
    );
  }
}

/** A stain running down a wall from a fixing, a leak or a hand. */
/**
 * Prop materials are opaque, so a stain painted with one is a PANEL screwed to
 * the wall - which is what half the pack looked like on its first contact sheet.
 * Every stain goes through a transparent decal instead.
 */
const STAIN_DECAL: Readonly<Record<string, string>> = { rust: 'decalRust', mould: 'decalMould', stain: 'decalStain' };

export function wallStain(room: Room, side: Side, along: number, y: number, w = 0.5, h = 1.2, material = 'stain', cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.008, cell);
  const [x, , z] = position;
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  room.geo(STAIN_DECAL[material] ?? material, quad(w, h), poseMatrix([x + inward[0] * 0.01, y, z + inward[2] * 0.01], rotationY + Math.PI), FLAT);
}

/** A mop and bucket left standing. One prop, and a room becomes a place with staff. */
export function mopBucket(room: Room, x: number, z: number, rotationY = 0): void {
  room.geo('paintGreen', cyl(0.17, 0.14, 0.3, 10), poseMatrix([x, 0.15, z]), { tile: 0.3, castShadow: false });
  room.geo('water', disc(0.15, 10), tiltMatrix([x, 0.26, z], [-Math.PI / 2, 0, 0]), FLAT);
  room.geo('ironBar', ring(0.17, 0.008, 10), tiltMatrix([x, 0.3, z], [Math.PI / 2, 0, 0]), FLAT);
  strut(room, 'timberPale', [x + 0.08, 0.2, z], [x + 0.36, 1.5, z + 0.14], 0.018, 5, FLAT);
  room.geo('hemp', ball(0.1, 6), tiltMatrix([x + 0.38, 1.56, z + 0.15], [0, 0, 0], [0.8, 1.2, 0.8]), FLAT);
  room.blockCircle(x, z, 0.2);
}

/** A stack of tin bowls, mugs or trays: the mess hall's and the servery's clutter. */
export function tinStack(room: Room, x: number, y: number, z: number, count = 5, radius = 0.11): void {
  for (let i = 0; i < count; i++) {
    room.geo('enamel', cyl(radius, radius * 0.92, 0.035, 9), poseMatrix([x + room.range(-0.012, 0.012), y + 0.02 + i * 0.032, z + room.range(-0.012, 0.012)]), FLAT);
  }
}

/** A crate or a stack of them. Cheap volume, and every store room needs some. */
export function crate(room: Room, x: number, z: number, rotationY = 0, w = 0.8, h = 0.58, d = 0.62, stacked = false): void {
  room.geo('timberPale', boxGeometry(w, h, d), poseMatrix([x, h / 2, z], rotationY), { tile: 0.5, ...CASTS });
  for (const s of [-1, 1]) {
    room.geo('timberDark', boxGeometry(w + 0.02, 0.05, 0.05), poseMatrix([x, h * (0.5 + s * 0.38), z], rotationY), FLAT);
  }
  if (stacked) {
    const y2 = h + 0.02;
    room.geo('timberPale', boxGeometry(w * 0.86, h * 0.8, d * 0.9), poseMatrix([x + 0.06, y2 + (h * 0.8) / 2, z - 0.04], rotationY + 0.24), { tile: 0.5, castShadow: false });
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [w / 2 - 0.03, d / 2 - 0.03], rotationY });
}
