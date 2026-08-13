/**
 * Vulcan's Anvil's prop library - everything a room is furnished from.
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
 *   own.** One `THREE.Mesh` per link of a swinging chain is thirty draw calls
 *   for one prop.
 * - **Shadow casting is opt-in in this pack.** `MeshBatcher` splits a material
 *   into two meshes when some of its geometry casts and some does not, so a
 *   material shared between a shadowed crucible and an unshadowed piece of trim
 *   costs two draw calls. What earns `castShadow: true` is a silhouette a player
 *   reads across a room.
 */
import * as THREE from 'three';
import type { Cell, Side } from '../../../lib/contract';
import { boxGeometry, ownGeometryCache } from '../../../lib/build';
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
 */
const cylCache = new Map<string, THREE.CylinderGeometry>();
export function cyl(rTop: number, rBot: number, h: number, seg = 9, open = false): THREE.CylinderGeometry {
  const key = `${rTop},${rBot},${h},${seg},${open}`;
  let geo = cylCache.get(key);
  if (!geo) {
    geo = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
    cylCache.set(key, geo);
  }
  return geo;
}

const sphereCache = new Map<string, THREE.SphereGeometry>();
export function ball(r: number, seg = 8): THREE.SphereGeometry {
  const key = `${r},${seg}`;
  let geo = sphereCache.get(key);
  if (!geo) {
    geo = new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg / 2)));
    sphereCache.set(key, geo);
  }
  return geo;
}

const coneCache = new Map<string, THREE.ConeGeometry>();
export function spike(r: number, h: number, seg = 6): THREE.ConeGeometry {
  const key = `${r},${h},${seg}`;
  let geo = coneCache.get(key);
  if (!geo) {
    geo = new THREE.ConeGeometry(r, h, seg);
    coneCache.set(key, geo);
  }
  return geo;
}

const torusCache = new Map<string, THREE.TorusGeometry>();
export function ring(r: number, tube: number, seg = 12): THREE.TorusGeometry {
  const key = `${r},${tube},${seg}`;
  let geo = torusCache.get(key);
  if (!geo) {
    // Six sides on the tube, not sixteen: a collar 8 mm thick seen through fog
    // is the single easiest place in a pack to spend 40,000 triangles nobody can
    // resolve (docs/systems/RENDERING.md).
    geo = new THREE.TorusGeometry(r, tube, 6, seg);
    torusCache.set(key, geo);
  }
  return geo;
}

const planeCache = new Map<string, THREE.PlaneGeometry>();
export function quad(w: number, h: number): THREE.PlaneGeometry {
  const key = `${w},${h}`;
  let geo = planeCache.get(key);
  if (!geo) {
    geo = new THREE.PlaneGeometry(w, h);
    planeCache.set(key, geo);
  }
  return geo;
}

const discCache = new Map<string, THREE.CircleGeometry>();
export function disc(r: number, seg = 16): THREE.CircleGeometry {
  const key = `${r},${seg}`;
  let geo = discCache.get(key);
  if (!geo) {
    geo = new THREE.CircleGeometry(r, seg);
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
 * A cylinder from one point to another, at any angle. Pipes, cables, struts,
 * conduit and rebar all come down to this, and doing it by hand is where a
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

/** A flat box lying at an angle: plate, planking, a leaning panel. */
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
 * A failing arc circuit: mostly steady, with a stutter that arrives at an
 * interval you cannot quite predict. Deliberately NOT a candle flicker - a gas
 * flame wavers, a dying tube snaps.
 */
export function stutter(room: Room, light: THREE.Light, base: number, depth = 0.6, period = 6.5): void {
  const phase = room.range(0, 20);
  room.tick((t) => {
    const cycle = ((t + phase) % period) / period;
    const burst = cycle < 0.12 ? Math.abs(Math.sin((cycle / 0.12) * Math.PI * 5.5)) : 1;
    const hum = 1 - 0.04 * (0.5 + 0.5 * Math.sin(t * 33 + phase));
    light.intensity = base * hum * (1 - depth * (1 - burst));
  });
}

/**
 * The breathing of something molten. Everything on the Mountain side does this
 * rather than flickering: a lava lake does not gutter, it surges, and the period
 * is long enough that you see it in the shadows before you notice it in the
 * light.
 */
export function surge(room: Room, light: THREE.Light, base: number, amount = 0.2, speed = 0.42): void {
  const phase = room.range(0, 20);
  room.tick((t) => {
    const wave = Math.sin(t * speed + phase) * 0.68 + Math.sin(t * speed * 1.71 + phase * 1.3) * 0.32;
    light.intensity = base * (1 + wave * amount);
  });
}

/** A hard fast pulse: an alarm beacon, a charging capacitor bank. */
export function pulse(room: Room, light: THREE.Light, base: number, period = 1.6, floor = 0.12): void {
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

/** A slow vertical bob plus a lazy turn: a suspended cage, a hoist block. */
export function bob(room: Room, object: THREE.Object3D, amount: number, speed = 0.35): void {
  const phase = room.range(0, 20);
  const y = object.position.y;
  room.tick((t) => {
    object.position.y = y + Math.sin(t * speed + phase) * amount;
    object.rotation.y += 0.0014;
  });
}

/** A steady spin: an extractor fan, a rotating beacon mirror, a turbine. */
export function spin(room: Room, object: THREE.Object3D, speed = 1.2): void {
  room.tick(() => {
    object.rotation.y += speed * 0.016;
  });
}

/* --- the Works: light fittings ---------------------------------------------------- */

/**
 * A caged arc fixture: the pack's cold practical. Bracket, a glass dish, a cage
 * of bars over it, and a scorch stain on the wall above where it has been
 * running hot for twenty years. `lit` spends one of the room's real lights -
 * without it the fixture still glows, it just does not throw anything.
 */
export function arcLamp(
  room: Room,
  side: Side,
  along: number,
  y: number,
  lit = false,
  intensity = 9,
  warm = false,
  cell: Cell = [0, 0],
): THREE.PointLight | null {
  const { position, rotationY } = wallPose(room, side, along, 0.02, cell);
  const [x, , z] = position;
  const inward: Vec3 = [-Math.sin(rotationY), 0, -Math.cos(rotationY)];
  const out = (d: number): Vec3 => [x + inward[0] * d, y, z + inward[2] * d];

  // Bracket and back plate.
  room.geo('steelDark', boxGeometry(0.3, 0.34, 0.09), poseMatrix([...out(0.05)] as Vec3, rotationY), { tile: 0.3, castShadow: false });
  strut(room, 'steel', out(0.06), out(0.3), 0.035, 5, FLAT);
  // The housing, a shallow open drum pointing down-and-out.
  room.geo('steel', cyl(0.15, 0.19, 0.16, 8, true), tiltMatrix(out(0.34), [0.5, rotationY, 0]), { tile: 0.35, castShadow: false });
  // The emitter INSIDE the drum: unlit, so it survives being in the dark.
  room.geo(warm ? 'bulb' : 'bulbCold', disc(0.13, 10), tiltMatrix([...out(0.36)] as Vec3, [Math.PI / 2 + 0.5, rotationY + Math.PI, 0]), FLAT);
  // Cage bars over the face. Three is plenty - it reads as a cage at 6 m.
  const tan: Vec3 = [Math.cos(rotationY), 0, -Math.sin(rotationY)];
  for (let i = -1; i <= 1; i++) {
    const a = out(0.3);
    const b = out(0.46);
    strut(
      room,
      'steelDark',
      [a[0] + tan[0] * i * 0.1, y - 0.19, a[2] + tan[2] * i * 0.1],
      [b[0] + tan[0] * i * 0.09, y - 0.1, b[2] + tan[2] * i * 0.09],
      0.012,
      4,
      FLAT,
    );
  }
  room.geo('steelDark', ring(0.17, 0.014, 9), poseMatrix(out(0.42), rotationY), { tile: 0.2, castShadow: false });
  // The stain above it: the fitting has been cooking the wall.
  room.geo('graphite', quad(0.44, 0.8), poseMatrix([x + inward[0] * 0.015, y + 0.62, z + inward[2] * 0.015], rotationY + Math.PI), FLAT);

  if (!lit) return null;
  const lamp = new THREE.PointLight(warm ? 0xffb060 : 0xbfe4ff, intensity, room.ctx.dims.cellSize * 1.5, 2);
  lamp.position.set(...out(0.55));
  lamp.position.y = y - 0.15;
  room.light(lamp);
  return lamp;
}

/**
 * A ceiling batten: a long tube in a reflector. The Works' general lighting, and
 * about half of them are dead - a corridor where every fitting works has no
 * horror in it at all.
 */
export function battenLight(
  room: Room,
  x: number,
  z: number,
  length = 2.0,
  rotationY = 0,
  live = true,
  lit = false,
  intensity = 7,
  drop = 0.5,
): THREE.PointLight | null {
  const { ceilingHeight } = room.ctx.dims;
  const y = ceilingHeight - drop;
  for (const s of [-1, 1]) {
    strut(room, 'steelDark', [x + Math.cos(rotationY) * s * length * 0.4, ceilingHeight - 0.06, z - Math.sin(rotationY) * s * length * 0.4],
      [x + Math.cos(rotationY) * s * length * 0.4, y + 0.06, z - Math.sin(rotationY) * s * length * 0.4], 0.018, 4, FLAT);
  }
  room.geo('steel', boxGeometry(length, 0.09, 0.24), poseMatrix([x, y + 0.06, z], rotationY), { tile: 0.6, castShadow: false });
  room.geo('steelDark', boxGeometry(length + 0.06, 0.06, 0.3), poseMatrix([x, y + 0.11, z], rotationY), { tile: 0.5, castShadow: false });
  // The tube itself, face down.
  room.geo(live ? 'bulbCold' : 'screenDead', boxGeometry(length - 0.14, 0.045, 0.11), poseMatrix([x, y, z], rotationY), FLAT);
  if (!live || !lit) return null;
  const lamp = new THREE.PointLight(0xcfe8ff, intensity, room.ctx.dims.cellSize * 1.5, 2);
  lamp.position.set(x, y - 0.18, z);
  room.light(lamp);
  return lamp;
}

/**
 * A rotating alarm beacon in a wire guard. The one red thing in a cold room, and
 * the single fastest way to say that whatever happened here is still happening.
 */
export function alarmBeacon(room: Room, x: number, y: number, z: number, lit = false, intensity = 7): THREE.PointLight | null {
  room.geo('steelDark', cyl(0.1, 0.13, 0.07, 8), poseMatrix([x, y, z]), { tile: 0.2, castShadow: false });
  room.geo('lumenRed', cyl(0.095, 0.105, 0.16, 8), poseMatrix([x, y + 0.15, z]), { tile: 0.2, castShadow: false });
  room.geo('steelDark', cyl(0.11, 0.1, 0.05, 8), poseMatrix([x, y + 0.25, z]), { tile: 0.2, castShadow: false });
  // The guard: four uprights and a top ring.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    strut(room, 'steelDark', [x + Math.cos(a) * 0.13, y + 0.02, z + Math.sin(a) * 0.13], [x + Math.cos(a) * 0.13, y + 0.26, z + Math.sin(a) * 0.13], 0.011, 4, FLAT);
  }
  room.geo('steelDark', ring(0.13, 0.012, 9), tiltMatrix([x, y + 0.27, z], [Math.PI / 2, 0, 0]), FLAT);
  if (!lit) return null;
  const lamp = new THREE.PointLight(0xff3018, intensity, room.ctx.dims.cellSize * 1.3, 2);
  lamp.position.set(x, y + 0.15, z);
  room.light(lamp);
  pulse(room, lamp, intensity);
  return lamp;
}

/** A lit sign screwed to a wall. Amber for information, red for the other kind. */
export function wallSign(room: Room, side: Side, along: number, y: number, red = false, width = 0.66, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.03, cell);
  const [x, , z] = position;
  room.geo('steelDark', boxGeometry(width + 0.07, 0.3, 0.05), poseMatrix([x, y, z], rotationY), { tile: 0.3, castShadow: false });
  room.geo(red ? 'signRed' : 'signAmber', quad(width, 0.22), poseMatrix([x - Math.sin(rotationY) * 0.035, y, z - Math.cos(rotationY) * 0.035], rotationY + Math.PI), FLAT);
  // Two conduit tails, because a lit sign is wired.
  strut(room, 'cable', [x, y + 0.15, z], [x, y + 0.42, z], 0.014, 4, FLAT);
}

/**
 * A work-light mast: a tripod with two heads on it, dragged in by whoever was
 * last working here and left pointing at whatever they were working on.
 */
export function workLamp(room: Room, x: number, z: number, rotationY = 0, lit = false, intensity = 10): THREE.PointLight | null {
  for (let i = 0; i < 3; i++) {
    const a = rotationY + (i / 3) * Math.PI * 2;
    strut(room, 'steelDark', [x, 0.02, z], [x + Math.cos(a) * 0.36, 0.02, z + Math.sin(a) * 0.36], 0.022, 4, FLAT);
    strut(room, 'steelDark', [x, 1.02, z], [x + Math.cos(a) * 0.34, 0.05, z + Math.sin(a) * 0.34], 0.016, 4, FLAT);
  }
  post(room, 'steel', 0.03, 0.036, 1.12, [x, 0.02, z], 6, FLAT);
  room.geo('steelDark', boxGeometry(0.42, 0.07, 0.09), poseMatrix([x, 1.16, z], rotationY), { tile: 0.2, castShadow: false });
  for (const s of [-1, 1]) {
    const hx = x + Math.cos(rotationY) * s * 0.17;
    const hz = z - Math.sin(rotationY) * s * 0.17;
    room.geo('steel', boxGeometry(0.2, 0.16, 0.11), tiltMatrix([hx, 1.24, hz], [0.34, rotationY, 0]), { tile: 0.2, castShadow: false });
    room.geo('bulbCold', quad(0.17, 0.12), tiltMatrix([hx - Math.sin(rotationY) * 0.06, 1.22, hz - Math.cos(rotationY) * 0.06], [0.34, rotationY + Math.PI, 0]), FLAT);
  }
  strut(room, 'cable', [x + 0.1, 0.04, z], [x + 0.7, 0.03, z + 0.5], 0.018, 4, FLAT);
  room.blockCircle(x, z, 0.3);
  if (!lit) return null;
  const lamp = new THREE.PointLight(0xd8ecff, intensity, room.ctx.dims.cellSize * 1.6, 2);
  lamp.position.set(x - Math.sin(rotationY) * 0.35, 1.3, z - Math.cos(rotationY) * 0.35);
  room.light(lamp);
  return lamp;
}

/* --- the Mountain: heat ----------------------------------------------------------- */

/**
 * A pool of magma at deck level with a raised rim of cooled crust.
 *
 * **At deck level, never below it.** The shell lays one solid floor slab per
 * cell and there is no hole in it, so anything recessed under `y = 0` is simply
 * behind the floor (docs/art/ROOM_REVIEW.md). A raised coaming reads as a well;
 * a hole does not exist. It brings a collider, because walking into it is not
 * something the design has an answer for.
 */
export function lavaPool(
  room: Room,
  x: number,
  z: number,
  w: number,
  d: number,
  rotationY = 0,
  lit = false,
  intensity = 13,
): THREE.PointLight | null {
  // The rim: a course of cooled blocks, uneven, sitting proud of the floor.
  const perimeter = 2 * (w + d);
  const blocks = Math.max(8, Math.round(perimeter / 0.6));
  for (let i = 0; i < blocks; i++) {
    const t = i / blocks;
    // Walk the rectangle: two long runs and two short ones.
    const along = t * perimeter;
    let lx: number;
    let lz: number;
    if (along < w) {
      lx = -w / 2 + along;
      lz = -d / 2;
    } else if (along < w + d) {
      lx = w / 2;
      lz = -d / 2 + (along - w);
    } else if (along < 2 * w + d) {
      lx = w / 2 - (along - w - d);
      lz = d / 2;
    } else {
      lx = -w / 2;
      lz = d / 2 - (along - 2 * w - d);
    }
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    const px = x + lx * c + lz * s;
    const pz = z - lx * s + lz * c;
    const h = 0.16 + ((i * 37) % 9) / 40;
    room.geo('cinder', ball(0.15 + ((i * 13) % 5) / 50, 6), tiltMatrix([px, h * 0.34, pz], [0, i * 1.7, 0], [1.3, 0.7, 1.0]), {
      tile: 0.5,
      castShadow: false,
    });
  }
  // The surface, just above the floor so it never z-fights with it.
  room.geo('surface.magma', boxGeometry(w, 0.05, d), poseMatrix([x, 0.045, z], rotationY), { tile: 1.4, castShadow: false });
  // Crust plates floating on it: darker islands, which is what stops a lava
  // surface reading as a lit rectangle. THREE of them, not a dozen - the plates
  // are the dark and the melt is the light, and a surface with more dark on it
  // than light stops reading as molten at all.
  for (let i = 0; i < 3; i++) {
    const px = x + (room.rng() - 0.5) * w * 0.55;
    const pz = z + (room.rng() - 0.5) * d * 0.55;
    room.geo('rockDark', ball(room.range(0.14, 0.3), 6), tiltMatrix([px, 0.06, pz], [0, room.range(0, 3), 0], [1.5, 0.16, 1.2]), {
      tile: 0.6,
      castShadow: false,
    });
  }
  // The wash it throws on the floor around it, added rather than painted.
  room.geo('heatWash', disc(Math.max(w, d) * 0.85, 18), tiltMatrix([x, 0.012, z], [-Math.PI / 2, 0, 0]), FLAT);
  room.collider({ kind: 'box', center: [x, z], halfExtents: [w / 2 + 0.1, d / 2 + 0.1], rotationY });

  if (!lit) return null;
  const lamp = new THREE.PointLight(0xff6a1e, intensity, room.ctx.dims.cellSize * 2.0, 2);
  // ABOVE the surface, not in it: a light inside its own glowing mesh lights the
  // inside of a box and nothing else.
  lamp.position.set(x, 0.75, z);
  room.light(lamp);
  surge(room, lamp, intensity);
  return lamp;
}

/**
 * A narrow runnel of magma running across the floor between two points: the
 * overflow channel, the tap line, the crack that opened last week. Same rules as
 * the pool, and it carries a collider along its length.
 */
export function lavaRunnel(room: Room, from: readonly [number, number], to: readonly [number, number], width = 0.55): void {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz) + Math.PI / 2;
  const mx = (from[0] + to[0]) / 2;
  const mz = (from[1] + to[1]) / 2;
  room.geo('surface.magma', boxGeometry(length, 0.05, width), poseMatrix([mx, 0.045, mz], -yaw), { tile: 0.9, castShadow: false });
  // Levees either side, built up out of what has spilled and frozen.
  const lumps = Math.max(4, Math.round(length / 0.42));
  for (let i = 0; i < lumps; i++) {
    const t = (i + 0.5) / lumps;
    const px = from[0] + dx * t;
    const pz = from[1] + dz * t;
    const nx = Math.cos(-yaw);
    const nz = -Math.sin(-yaw);
    for (const s of [-1, 1]) {
      room.geo(
        'cinder',
        ball(0.14 + ((i * 17) % 5) / 45, 6),
        tiltMatrix([px + nx * s * (width / 2 + 0.06), 0.05, pz + nz * s * (width / 2 + 0.06)], [0, i, 0], [1.2, 0.7, 1.0]),
        { tile: 0.4, castShadow: false },
      );
    }
  }
  room.geo('heatWash', quad(length, width * 3.2), tiltMatrix([mx, 0.014, mz], [-Math.PI / 2, -yaw, 0]), FLAT);
  room.collider({ kind: 'box', center: [mx, mz], halfExtents: [length / 2, width / 2 + 0.12], rotationY: -yaw });
}

/**
 * A hairline fissure in the floor: hot, but flat and thin enough to step over,
 * so it deliberately carries **no collider**. It is the cheapest thing in the
 * pack and it does more for a rock room than any prop in this file.
 */
export function floorFissure(room: Room, x: number, z: number, length = 2.4, rotationY = 0, hot = true): void {
  const steps = Math.max(3, Math.round(length / 0.55));
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps - 0.5;
    const drift = (room.rng() - 0.5) * 0.3;
    const px = x + Math.cos(rotationY) * t * length + Math.sin(rotationY) * drift;
    const pz = z - Math.sin(rotationY) * t * length + Math.cos(rotationY) * drift;
    const w = room.range(0.07, 0.17);
    room.geo(hot ? 'surface.crustHot' : 'surface.crust', boxGeometry(length / steps + 0.05, 0.03, w), poseMatrix([px, 0.02, pz], rotationY + room.range(-0.2, 0.2)), {
      tile: 0.3,
      castShadow: false,
    });
    // The lips: dark rock standing proud either side, so the glow is in a crack.
    for (const s of [-1, 1]) {
      room.geo('rockDark', ball(0.12, 5), tiltMatrix([px + Math.sin(rotationY + Math.PI / 2) * s * (w / 2 + 0.07), 0.02, pz + Math.cos(rotationY + Math.PI / 2) * s * (w / 2 + 0.07)], [0, i, 0], [1.4, 0.45, 0.8]), {
        tile: 0.3,
        castShadow: false,
      });
    }
  }
  room.geo('heatWash', quad(length * 1.1, 1.3), tiltMatrix([x, 0.013, z], [-Math.PI / 2, rotationY, 0]), FLAT);
}

/**
 * A spatter cone: a small chimney of welded blobs with a hot throat. The one
 * shape that says "this vent is currently doing something" without needing a
 * light, and it is the Mountain's answer to a candle.
 */
export function spatterCone(room: Room, x: number, z: number, height = 0.9, lit = false, intensity = 8): THREE.PointLight | null {
  const layers = Math.max(4, Math.round(height / 0.2));
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const r = 0.42 * (1 - t * 0.62);
    const blobs = Math.max(4, Math.round(r * 16));
    for (let b = 0; b < blobs; b++) {
      const a = (b / blobs) * Math.PI * 2 + i * 0.7;
      room.geo(
        'cinder',
        ball(0.11 + ((i * 7 + b * 3) % 5) / 60, 5),
        tiltMatrix([x + Math.cos(a) * r, t * height, z + Math.sin(a) * r], [0, a, 0], [1.2, 0.85, 1.0]),
        { tile: 0.4, castShadow: i === 0 },
      );
    }
  }
  // The throat: a small hot disc looking straight up, well down inside the rim.
  room.geo('surface.magma', disc(0.16, 10), tiltMatrix([x, height * 0.72, z], [-Math.PI / 2, 0, 0]), FLAT);
  room.geo('ember', disc(0.09, 8), tiltMatrix([x, height * 0.74, z], [-Math.PI / 2, 0, 0]), FLAT);
  room.blockCircle(x, z, 0.44);
  if (!lit) return null;
  const lamp = new THREE.PointLight(0xff7a2a, intensity, room.ctx.dims.cellSize * 1.5, 2);
  lamp.position.set(x, height + 0.35, z);
  room.light(lamp);
  surge(room, lamp, intensity, 0.24, 0.6);
  return lamp;
}

/**
 * A sheet of magma coming down a wall. Built as a stack of overlapping slabs
 * getting narrower toward the bottom, with a splash apron where it lands - and
 * the whole thing is on the wall rather than free-standing, so it never blocks
 * anything.
 */
export function lavafall(room: Room, side: Side, along: number, width = 2.0, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.1, cell);
  const [x, , z] = position;
  const { ceilingHeight } = room.ctx.dims;
  const inx = -Math.sin(rotationY);
  const inz = -Math.cos(rotationY);
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const y = ceilingHeight * (1 - t) - ceilingHeight / steps / 2;
    const w = width * (1 - t * 0.35) + Math.sin(t * 9) * 0.14;
    const depth = 0.06 + t * 0.22;
    room.geo('surface.magma', boxGeometry(w, ceilingHeight / steps + 0.06, 0.14), poseMatrix([x + inx * depth, y, z + inz * depth], rotationY), {
      tile: 1.0,
      castShadow: false,
    });
    // Cooled rind down the edges, so the sheet has a dark boundary.
    for (const s of [-1, 1]) {
      room.geo('cinder', boxGeometry(0.2, ceilingHeight / steps + 0.1, 0.2), poseMatrix([x + Math.cos(rotationY) * s * w * 0.5 + inx * (depth - 0.03), y, z - Math.sin(rotationY) * s * w * 0.5 + inz * (depth - 0.03)], rotationY), {
        tile: 0.4,
        castShadow: false,
      });
    }
  }
  // Where it lands: an apron of magma on the floor, and a crust bank round it.
  room.geo('surface.magma', boxGeometry(width * 1.15, 0.05, 1.0), poseMatrix([x + inx * 0.5, 0.045, z + inz * 0.5], rotationY), { tile: 1.0, castShadow: false });
  for (let i = 0; i < 7; i++) {
    const t = (i / 6 - 0.5) * width * 1.25;
    room.geo('cinder', ball(room.range(0.18, 0.3), 6), tiltMatrix([x + Math.cos(rotationY) * t + inx * 1.0, 0.05, z - Math.sin(rotationY) * t + inz * 1.0], [0, i, 0], [1.3, 0.7, 1.0]), {
      tile: 0.5,
      castShadow: false,
    });
  }
  room.geo('heatWash', quad(width * 2.2, 2.4), tiltMatrix([x + inx * 1.0, 0.014, z + inz * 1.0], [-Math.PI / 2, rotationY, 0]), FLAT);
  room.collider({
    kind: 'box',
    center: [x + inx * 0.5, z + inz * 0.5],
    halfExtents: [width * 0.6, 0.6],
    rotationY,
  });
}

/**
 * Rock. Scattered boulders with their own colliders, at positions drawn from the
 * seeded RNG - which is exactly why a heap of these must never go near an
 * anchor: it is fine on most seeds and a chest nobody can open on the rest
 * (docs/art/ROOM_REVIEW.md).
 */
export function boulders(room: Room, x: number, z: number, radius = 1.0, count = 5, material = 'rockDark'): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * radius;
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const r = room.range(0.22, 0.55);
    room.geo(material, ball(r, 6), tiltMatrix([px, r * 0.62, pz], [room.range(-0.3, 0.3), room.range(0, 3), room.range(-0.3, 0.3)], [1.25, 0.85, 1.1]), {
      tile: 0.8,
      castShadow: r > 0.4,
    });
    // A smaller one leaning on it, so nothing is a lone sphere.
    room.geo(material, ball(r * 0.5, 5), tiltMatrix([px + r * 0.8, r * 0.3, pz - r * 0.5], [0, room.range(0, 3), 0], [1.2, 0.8, 1]), {
      tile: 0.5,
      castShadow: false,
    });
    room.blockCircle(px, pz, r * 0.95);
  }
}

/** Loose rubble and cinder: decoration, no colliders, and it goes everywhere. */
export function rubble(room: Room, x: number, z: number, radius = 0.9, count = 10): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * radius;
    const r = room.range(0.05, 0.16);
    room.geo(
      room.chance(0.3) ? 'rockPale' : 'cinder',
      ball(r, 5),
      tiltMatrix([x + Math.cos(a) * d, r * 0.6, z + Math.sin(a) * d], [room.range(-0.4, 0.4), room.range(0, 3), room.range(-0.4, 0.4)], [1.3, 0.7, 1.1]),
      { tile: 0.3, castShadow: false },
    );
  }
}

/**
 * Obsidian blades: a fan of thin glassy slabs standing out of the floor. A
 * cylinder would read as a stump - what makes volcanic glass read is that it is
 * FLAT and has an edge, exactly as a clinker hull needs planks and not logs.
 */
export function obsidianBlades(room: Room, x: number, z: number, count = 4, scale = 1): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = room.range(0, 0.4) * scale;
    const h = room.range(0.5, 1.5) * scale;
    const w = room.range(0.22, 0.5) * scale;
    room.geo('glassRock', boxGeometry(w, h, 0.075), tiltMatrix([x + Math.cos(a) * d, h * 0.44, z + Math.sin(a) * d], [room.range(-0.28, 0.28), a, room.range(-0.3, 0.3)]), {
      tile: 0.5,
      castShadow: h > 0.9,
    });
    // A chipped foot at the base, so a blade grows out of something.
    room.geo('rockDark', ball(w * 0.5, 5), tiltMatrix([x + Math.cos(a) * d, 0.05, z + Math.sin(a) * d], [0, a, 0], [1.4, 0.5, 1.2]), { tile: 0.3, castShadow: false });
  }
  room.blockCircle(x, z, 0.42 * scale);
}

/**
 * A sulphur chimney: an encrusted vent with needle crystals round the mouth and
 * gas coming out of it. The one saturated colour in the map that is not fire.
 */
export function sulphurChimney(room: Room, x: number, z: number, height = 1.1, gas = true): void {
  const layers = Math.max(4, Math.round(height / 0.24));
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const r = 0.34 * (1 - t * 0.55);
    room.geo('sulphurCrystal', cyl(r * 0.86, r, height / layers + 0.05, 7, true), poseMatrix([x, t * height + height / layers / 2, z]), {
      tile: 0.4,
      castShadow: i === 0,
    });
  }
  // Needles round the mouth: short cones leaning outward.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    room.geo('sulphurCrystal', spike(0.045, room.range(0.13, 0.26), 5), tiltMatrix([x + Math.cos(a) * 0.17, height + 0.05, z + Math.sin(a) * 0.17], [0.5, a, 0]), {
      tile: 0.2,
      castShadow: false,
    });
  }
  room.geo('graphite', disc(0.13, 9), tiltMatrix([x, height - 0.02, z], [-Math.PI / 2, 0, 0]), FLAT);
  if (gas) steamJet(room, x, z, height + 0.1, 1.5, true);
  room.blockCircle(x, z, 0.36);
}

/**
 * Steam or gas rising. Thin, and thinner than feels right: at 0.3 opacity a
 * plume greys out everything behind it, including the thing it is rising off
 * (docs/art/ROOM_REVIEW.md). Two crossed quads double whatever number you picked.
 */
export function steamJet(room: Room, x: number, z: number, from = 0, height = 2.0, sulphurous = false): void {
  // Sulphurous gas is the same volume in a different colour: yellow-green, and
  // barely more opaque, because a plume you can see THROUGH is the only kind
  // that does not grey out the thing it is rising off.
  const material = sulphurous ? 'hazeSulphur' : 'steam';
  for (let i = 0; i < 2; i++) {
    const a = i * Math.PI * 0.5 + 0.4;
    room.geo(material, quad(0.5 + height * 0.12, height), tiltMatrix([x, from + height / 2, z], [0, a, 0]), FLAT);
  }
  // A few blobs so the column has structure rather than being two flat sheets.
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4;
    room.geo(material, ball(0.16 + t * 0.22, 5), poseMatrix([x + room.range(-0.14, 0.14), from + t * height, z + room.range(-0.14, 0.14)]), FLAT);
  }
}

/** A mud pot: boiling grey mud in a spattered rim, at deck level. */
export function mudPot(room: Room, x: number, z: number, radius = 0.8): void {
  const blocks = Math.max(7, Math.round(radius * 12));
  for (let i = 0; i < blocks; i++) {
    const a = (i / blocks) * Math.PI * 2;
    room.geo('mud', ball(0.16, 5), tiltMatrix([x + Math.cos(a) * radius, 0.06, z + Math.sin(a) * radius], [0, a, 0], [1.3, 0.7, 1.1]), { tile: 0.3, castShadow: false });
  }
  room.geo('mud', disc(radius, 16), tiltMatrix([x, 0.05, z], [-Math.PI / 2, 0, 0]), { tile: 0.6, castShadow: false, receiveShadow: true });
  // Bubbles: domes on the surface, at three sizes, and one of them is bursting.
  for (let i = 0; i < 5; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = room.rng() * radius * 0.7;
    const r = room.range(0.06, 0.17);
    room.geo('mud', ball(r, 6), poseMatrix([x + Math.cos(a) * d, 0.05 + r * 0.4, z + Math.sin(a) * d]), { tile: 0.3, castShadow: false });
  }
  steamJet(room, x, z, 0.1, 1.3);
  room.collider({ kind: 'circle', center: [x, z], radius: radius + 0.05 });
}

/**
 * A drift of fall ash, and the thing nobody wants to find in it: a hollow void
 * cast, the shape a body left when the ash set round it and the body did not
 * last. Built as a shallow trough with a person-shaped hole in the middle of it.
 */
export function ashCast(room: Room, x: number, z: number, rotationY = 0, curled = true): void {
  // The bed of ash it lies in.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    room.geo('ashPale', ball(room.range(0.24, 0.38), 5), tiltMatrix([x + Math.cos(a) * 0.85, 0.03, z + Math.sin(a) * 0.62], [0, a, 0], [1.4, 0.28, 1.2]), {
      tile: 0.5,
      castShadow: false,
    });
  }
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (lx: number, ly: number, lz: number): Vec3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c];

  // The figure. What makes a silhouette read as a person is that it is NOT a
  // rectangle: a waist narrower than the shoulders, a round head, and limbs with
  // daylight between them (docs/art/ROOM_REVIEW.md).
  const lean = curled ? 0.5 : 0.1;
  room.geo('ashPale', ball(0.28, 6), tiltMatrix(at(0, 0.2, 0), [lean, rotationY, 0], [1.5, 0.85, 0.8]), { tile: 0.4, castShadow: true });
  room.geo('ashPale', ball(0.19, 6), tiltMatrix(at(0, 0.19, -0.42), [lean, rotationY, 0], [1.2, 0.9, 0.9]), { tile: 0.3, castShadow: true });
  room.geo('ashPale', ball(0.13, 6), poseMatrix(at(0.02, 0.28, -0.72)), { tile: 0.25, castShadow: true });
  // Arms, drawn up over the head - which is what people actually do.
  for (const side of [-1, 1]) {
    room.geo('ashPale', ball(0.075, 5), tiltMatrix(at(side * 0.2, 0.24, -0.3), [0, rotationY, side * 0.7], [1.0, 2.4, 1.0]), { tile: 0.2, castShadow: false });
    room.geo('ashPale', ball(0.07, 5), tiltMatrix(at(side * 0.26, 0.3, -0.62), [0.5, rotationY, side * 0.3], [1.0, 2.0, 1.0]), { tile: 0.2, castShadow: false });
  }
  // Legs, folded.
  for (const side of [-1, 1]) {
    room.geo('ashPale', ball(0.095, 5), tiltMatrix(at(side * 0.13, 0.16, 0.38), [0.9, rotationY, 0], [1.0, 2.6, 1.0]), { tile: 0.2, castShadow: false });
    room.geo('ashPale', ball(0.085, 5), tiltMatrix(at(side * 0.16, 0.13, 0.72), [0.2, rotationY, 0], [1.0, 2.2, 1.0]), { tile: 0.2, castShadow: false });
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [0.55, 0.95], rotationY });
}

/** A drift of ash banked against something. Decoration - walk straight over it. */
export function ashDrift(room: Room, x: number, z: number, radius = 1.1, rotationY = 0): void {
  for (let i = 0; i < 6; i++) {
    const t = (i / 6 - 0.5) * radius * 1.8;
    const h = Math.cos((t / radius) * 1.1) * 0.24 + 0.04;
    room.geo('ashPale', ball(radius * 0.42, 6), tiltMatrix([x + Math.cos(rotationY) * t, h * 0.2, z - Math.sin(rotationY) * t], [0, rotationY, 0], [1.1, h, 1.5]), {
      tile: 0.7,
      castShadow: false,
    });
  }
}

/* --- the Works: structure and furniture -------------------------------------------- */

/** A work bench with a steel top, a lower shelf and a scatter of what is on it. */
export function bench(room: Room, x: number, z: number, w: number, d: number, h = 0.92, rotationY = 0): void {
  room.solid('steelDark', [w, h - 0.08, d * 0.9], [x, 0, z], rotationY, { tile: 0.7 });
  room.box('steelPale', [w + 0.07, 0.06, d + 0.06], [x, h - 0.08, z], rotationY, { tile: 0.5 });
  room.box('steelDark', [w - 0.1, 0.05, d * 0.8], [x, 0.28, z], rotationY, { tile: 0.4 });
  for (const s of [-1, 1]) {
    room.box('steel', [0.07, h - 0.08, 0.07], [x + Math.cos(rotationY) * s * (w / 2 - 0.06), 0, z - Math.sin(rotationY) * s * (w / 2 - 0.06)], rotationY, { tile: 0.3 });
  }
}

/** A wall shelf with brackets. Returns its own pose so item anchors can match it. */
export function shelf(room: Room, side: Side, along: number, y: number, width = 1.3, depth = 0.4, cell: Cell = [0, 0]): { position: Vec3; rotationY: number } {
  const pose = wallPose(room, side, along, depth / 2, cell);
  const [x, , z] = pose.position;
  room.box('steelPale', [width, 0.045, depth], [x, y, z], pose.rotationY, { tile: 0.5 });
  room.box('steelDark', [width, 0.05, 0.05], [x - Math.sin(pose.rotationY) * (depth / 2 - 0.03), y + 0.045, z - Math.cos(pose.rotationY) * (depth / 2 - 0.03)], pose.rotationY, { tile: 0.3 });
  for (const s of [-1, 1]) {
    const bx = x + Math.cos(pose.rotationY) * s * (width / 2 - 0.09);
    const bz = z - Math.sin(pose.rotationY) * s * (width / 2 - 0.09);
    room.geo('steel', boxGeometry(0.05, 0.3, depth * 0.9), tiltMatrix([bx, y - 0.1, bz], [0, pose.rotationY, 0.5]), { tile: 0.2, castShadow: false });
  }
  return { position: [x, y + 0.045, z], rotationY: pose.rotationY };
}

/**
 * A control desk: a sloped console with a row of screens standing on it, a
 * keyboard shelf and a chair pushed back from it. `live` decides whether the
 * screens are doing anything, and about a third of the desks in the map are not.
 */
export function controlDesk(room: Room, x: number, z: number, width = 1.8, rotationY = 0, live = true): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (lx: number, ly: number, lz: number): Vec3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c];

  room.solid('steelDark', [width, 0.72, 0.72], at(0, 0, 0), rotationY, { tile: 0.7 });
  // The sloped fascia, which is what makes a desk a console.
  room.geo('graphite', boxGeometry(width - 0.06, 0.3, 0.2), tiltMatrix(at(0, 0.84, -0.2), [0.6, rotationY, 0]), { tile: 0.4, castShadow: false });
  room.box('steelPale', [width + 0.06, 0.05, 0.78], [...at(0, 0.72, 0.02)] as Vec3, rotationY, { tile: 0.5 });
  // Rows of switches on the fascia: a dozen little boxes, three of them lit.
  for (let i = 0; i < 9; i++) {
    const lx = -width / 2 + 0.16 + i * ((width - 0.32) / 8);
    room.geo(i % 4 === 1 && live ? 'lumenAmber' : i % 4 === 3 && live ? 'lumenGreen' : 'steelPale', boxGeometry(0.055, 0.03, 0.045), tiltMatrix(at(lx, 0.93, -0.27), [0.6, rotationY, 0]), FLAT);
  }
  // Screens standing on the back edge.
  monitorBank(room, at(0, 0.79, 0.26)[0], 0.79, at(0, 0.79, 0.26)[2], rotationY, Math.max(2, Math.round(width / 0.75)), 1, live);
  room.box('cable', [0.06, 0.5, 0.06], [...at(width / 2 - 0.2, 0.2, 0.34)] as Vec3, rotationY, { tile: 0.2 });
}

/** A bank of flat screens on a frame. The Works' wallpaper. */
export function monitorBank(room: Room, x: number, y: number, z: number, rotationY = 0, cols = 3, rows = 1, live = true): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (lx: number, ly: number, lz: number): Vec3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
  const w = 0.46;
  const h = 0.34;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lx = (col - (cols - 1) / 2) * (w + 0.05);
      const ly = y + r * (h + 0.06) + h / 2 + 0.03;
      const on = live && room.chance(0.68);
      room.geo('graphite', boxGeometry(w, h, 0.06), poseMatrix(at(lx, ly, 0), rotationY), { tile: 0.3, castShadow: false });
      // A plane's front face is +Z, so a screen on a -Z-facing prop needs the
      // prop's yaw PLUS PI or it faces into the frame and goes black.
      room.geo(
        on ? room.pick(['screenData', 'screenSeismo', 'screenMimic']) : 'screenDead',
        quad(w - 0.055, h - 0.05),
        poseMatrix(at(lx, ly, -0.035), rotationY + Math.PI),
        FLAT,
      );
    }
  }
  room.geo('steelDark', boxGeometry(cols * (w + 0.05), 0.05, 0.14), poseMatrix(at(0, y + 0.02, 0.02), rotationY), { tile: 0.3, castShadow: false });
}

/**
 * A server rack: a black cabinet full of pinpricks. Ninety of them in one room
 * would be ninety draw calls of individual LEDs, so the lights are four narrow
 * emissive strips per rack with the units drawn as dark bars over them.
 */
export function rackCabinet(room: Room, x: number, z: number, rotationY = 0, live = true, height = 2.1): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (lx: number, ly: number, lz: number): Vec3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c];

  room.solid('graphite', [0.66, height, 0.9], [x, 0, z], rotationY, { tile: 0.8, castShadow: true });
  // Vent slots down both sides.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      room.geo('steelDark', boxGeometry(0.05, 0.16, 0.02), poseMatrix(at(side * 0.3, 0.35 + i * 0.24, -0.46), rotationY), FLAT);
    }
  }
  // The units, as a stack of bars, with a strip of status light behind them.
  const units = Math.floor((height - 0.3) / 0.13);
  for (let i = 0; i < units; i++) {
    const ly = 0.18 + i * 0.13;
    const alive = live && room.chance(0.72);
    room.geo(alive ? 'lumenGreen' : 'screenDead', boxGeometry(0.5, 0.02, 0.02), poseMatrix(at(0.02, ly + 0.04, -0.455), rotationY), FLAT);
    room.geo('steelDark', boxGeometry(0.58, 0.1, 0.03), poseMatrix(at(0, ly, -0.45), rotationY), { tile: 0.25, castShadow: false });
  }
  // Cable spill out of the back, which is where all the horror in a server room is.
  for (let i = 0; i < 5; i++) {
    strut(room, 'cable', at(room.range(-0.2, 0.2), height - 0.1, 0.42), at(room.range(-0.5, 0.5), room.range(0.2, 0.9), 0.9), 0.022, 5, FLAT);
  }
}

/** A stack of crates. Two sizes, never square-on, and no two stacks the same. */
export function crate(room: Room, x: number, z: number, rotationY = 0, w = 0.82, h = 0.62, d = 0.66, stacked = false): void {
  room.solid('steelDark', [w, h, d], [x, 0, z], rotationY, { tile: 0.7, castShadow: true });
  room.box('steelPale', [w + 0.03, 0.05, d + 0.03], [x, h - 0.05, z], rotationY, { tile: 0.3 });
  room.box('paintedWarn', [w * 0.5, 0.11, 0.02], [x - Math.sin(rotationY) * (d / 2 + 0.01), h * 0.55, z - Math.cos(rotationY) * (d / 2 + 0.01)], rotationY, { tile: 0.2 });
  if (stacked) {
    const r2 = rotationY + room.range(-0.3, 0.3);
    room.box('steelDark', [w * 0.82, h * 0.72, d * 0.82], [x + room.range(-0.06, 0.06), h, z + room.range(-0.06, 0.06)], r2, { tile: 0.6, castShadow: true });
    room.box('steelPale', [w * 0.85, 0.04, d * 0.85], [x, h + h * 0.72 - 0.04, z], r2, { tile: 0.3 });
  }
}

/** A drum. Upright, or tipped over and leaking something dark. */
export function drum(room: Room, x: number, z: number, tipped = false, material = 'paintedWarn'): void {
  if (!tipped) {
    post(room, material, 0.29, 0.29, 0.88, [x, 0, z], 10, CASTS);
    for (const y of [0.22, 0.62]) room.geo(material, ring(0.3, 0.028, 10), tiltMatrix([x, y, z], [Math.PI / 2, 0, 0]), { tile: 0.2, castShadow: false });
    room.geo('steelDark', disc(0.27, 12), tiltMatrix([x, 0.885, z], [-Math.PI / 2, 0, 0]), { tile: 0.3, castShadow: false });
    room.blockCircle(x, z, 0.3);
  } else {
    const yaw = room.range(0, Math.PI * 2);
    room.geo(material, cyl(0.29, 0.29, 0.88, 10), tiltMatrix([x, 0.29, z], [Math.PI / 2, yaw, 0]), { tile: 0.5, castShadow: true });
    room.geo('vfx.tar', disc(0.44, 14), tiltMatrix([x + Math.sin(yaw) * 0.6, 0.012, z + Math.cos(yaw) * 0.6], [-Math.PI / 2, 0, 0]), FLAT);
    room.blockCircle(x, z, 0.32);
  }
}

/** A run of pipe through a list of points, with a flange at every corner. */
export function pipeRun(room: Room, points: readonly Vec3[], radius = 0.09, material = 'steel', braced = true): void {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    strut(room, material, a, b, radius, 7, FLAT);
    if (i > 0) room.geo(material, ball(radius * 1.28, 6), poseMatrix(a), { tile: 0.2, castShadow: false });
    if (braced) {
      const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      room.geo('steelDark', cyl(radius * 1.4, radius * 1.4, 0.075, 8), tiltMatrix(mid, [Math.PI / 2, Math.atan2(b[0] - a[0], b[2] - a[2]), 0]), {
        tile: 0.2,
        castShadow: false,
        consume: false,
      });
    }
  }
}

/** A hand wheel on a body: the universal "something used to run through here". */
export function valve(room: Room, p: Vec3, radius = 0.2, rotationY = 0, red = false): void {
  room.geo(red ? 'paintedRed' : 'steel', cyl(0.11, 0.13, 0.22, 8), poseMatrix([p[0], p[1] + 0.11, p[2]]), { tile: 0.2, castShadow: false });
  room.geo(red ? 'paintedRed' : 'steelPale', ring(radius, 0.022, 12), tiltMatrix([p[0], p[1] + 0.26, p[2]], [0, rotationY, 0]), { tile: 0.2, castShadow: false });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    room.geo('steelPale', boxGeometry(radius * 1.9, 0.022, 0.022), tiltMatrix([p[0], p[1] + 0.26, p[2]], [0, rotationY + a, 0]), FLAT);
  }
}

/** A round gauge on a wall. Two per wall, at two sizes, is the right density. */
export function gauge(room: Room, side: Side, along: number, y: number, radius = 0.13, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.04, cell);
  const [x, , z] = position;
  room.geo('steel', cyl(radius, radius * 1.1, 0.09, 10), tiltMatrix([x, y, z], [Math.PI / 2, rotationY, 0]), { tile: 0.2, castShadow: false });
  room.geo('screenDead', disc(radius * 0.84, 12), poseMatrix([x - Math.sin(rotationY) * 0.05, y, z - Math.cos(rotationY) * 0.05], rotationY + Math.PI), FLAT);
  // The needle, pinned hard over to one side, because nothing here is nominal.
  room.geo('signRed', boxGeometry(radius * 0.72, 0.012, 0.008), tiltMatrix([x - Math.sin(rotationY) * 0.056, y, z - Math.cos(rotationY) * 0.056], [0, rotationY, room.range(0.8, 1.5)]), FLAT);
}

/** A railing. Blocking by default; a decorative one is honest about it. */
export function railing(room: Room, from: Vec3, to: Vec3, blocking = true, height = 1.05): void {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const mid: Vec3 = [(from[0] + to[0]) / 2, 0, (from[2] + to[2]) / 2];
  const posts = Math.max(2, Math.round(length / 1.1) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1);
    post(room, 'steel', 0.032, 0.038, height, [from[0] + dx * t, from[1], from[2] + dz * t], 6, FLAT);
  }
  for (const y of [height - 0.03, height * 0.55]) {
    room.geo('steel', cyl(0.028, 0.028, length, 6), tiltMatrix([mid[0], from[1] + y, mid[2]], [Math.PI / 2, yaw, 0]), { tile: 0.4, castShadow: false });
  }
  // A kick plate along the bottom: the detail that makes a rail industrial.
  room.geo('paintedWarn', boxGeometry(length, 0.14, 0.03), tiltMatrix([mid[0], from[1] + 0.09, mid[2]], [0, yaw + Math.PI / 2, 0]), { tile: 0.4, castShadow: false });
  if (blocking) {
    room.collider({ kind: 'box', center: [mid[0], mid[2]], halfExtents: [length / 2, 0.09], rotationY: yaw + Math.PI / 2 });
  }
}

/** A caged ladder bolted to a wall, going up out of sight. Vertical interest, free. */
export function ladder(room: Room, side: Side, along: number, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.14, cell);
  const [x, , z] = position;
  const { ceilingHeight } = room.ctx.dims;
  for (const s of [-1, 1]) {
    const px = x + Math.cos(rotationY) * s * 0.23;
    const pz = z - Math.sin(rotationY) * s * 0.23;
    post(room, 'steel', 0.028, 0.028, ceilingHeight, [px, 0, pz], 6, FLAT);
  }
  const rungs = Math.floor(ceilingHeight / 0.3);
  for (let i = 1; i < rungs; i++) {
    room.geo('steel', cyl(0.018, 0.018, 0.46, 5), tiltMatrix([x, i * 0.3, z], [Math.PI / 2, rotationY + Math.PI / 2, 0]), FLAT);
  }
  // The hoop guard, from 2.2 m up.
  for (let i = 0; i < 3; i++) {
    room.geo('steelDark', ring(0.36, 0.016, 10), poseMatrix([x - Math.sin(rotationY) * 0.22, 2.2 + i * 0.4, z - Math.cos(rotationY) * 0.22], rotationY), FLAT);
  }
}

/**
 * A catwalk overhead: a strip of grating on brackets, running wall to wall well
 * above head height. Vertical interest in a game with no vertical movement, and
 * it costs nothing because nobody can get up there.
 */
export function catwalk(room: Room, from: Vec3, to: Vec3, width = 1.0): void {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz) + Math.PI / 2;
  const mid: Vec3 = [(from[0] + to[0]) / 2, from[1], (from[2] + to[2]) / 2];
  room.geo('surface.grate', boxGeometry(length, 0.07, width), poseMatrix([mid[0], mid[1], mid[2]], -yaw), { tile: 0.8, castShadow: false });
  // Stringers down both edges. They have to be offset ACROSS the walk, which is
  // the axis `-yaw` turns +Z onto - getting this wrong stacks both of them in
  // the middle and the walk loses its edge.
  const across: readonly [number, number] = [Math.cos(-yaw), -Math.sin(-yaw)];
  for (const s of [-1, 1]) {
    room.geo(
      'steel',
      boxGeometry(length, 0.17, 0.05),
      poseMatrix([mid[0] + across[0] * s * (width / 2), mid[1] - 0.05, mid[2] + across[1] * s * (width / 2)], -yaw),
      { tile: 0.5, castShadow: false },
    );
  }
  // Handrails: two rails and posts, drawn at a coarse spacing.
  const posts = Math.max(2, Math.round(length / 1.6));
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    for (const s of [-1, 1]) {
      const px = from[0] + dx * t + across[0] * s * (width / 2);
      const pz = from[2] + dz * t + across[1] * s * (width / 2);
      post(room, 'steelDark', 0.024, 0.024, 0.72, [px, mid[1] + 0.03, pz], 5, FLAT);
    }
  }
  for (const s of [-1, 1]) {
    room.geo('steelDark', cyl(0.022, 0.022, length, 5), tiltMatrix([mid[0] + across[0] * s * (width / 2), mid[1] + 0.73, mid[2] + across[1] * s * (width / 2)], [Math.PI / 2, -yaw + Math.PI / 2, 0]), FLAT);
  }
}

/**
 * Heat-proximity suits hanging on a rack. Empty clothing at a person's height is
 * one of the cheapest frights in the medium, and a silvered one catches every
 * lamp in the room - so they read from the doorway as four people standing very
 * still against the wall.
 */
export function suitRack(room: Room, side: Side, along: number, count = 3, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.34, cell);
  const [x, , z] = position;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (lx: number, ly: number, lz: number): Vec3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
  const span = count * 0.62;
  room.geo('steel', cyl(0.026, 0.026, span + 0.3, 6), tiltMatrix(at(0, 2.1, 0), [Math.PI / 2, rotationY + Math.PI / 2, 0]), FLAT);
  for (const e of [-1, 1]) {
    strut(room, 'steel', at((e * (span + 0.3)) / 2, 2.1, 0), at((e * (span + 0.3)) / 2, 2.3, -0.32), 0.02, 4, FLAT);
  }
  for (let i = 0; i < count; i++) {
    const lx = -span / 2 + span * ((i + 0.5) / count);
    const drop = room.range(0, 0.1);
    // Hanger, hood, body, and the two sleeves that are the whole trick.
    room.geo('steelDark', boxGeometry(0.3, 0.02, 0.04), poseMatrix(at(lx, 2.02 - drop, 0), rotationY), FLAT);
    room.geo('heatSuit', ball(0.15, 6), tiltMatrix(at(lx, 1.86 - drop, 0), [0, rotationY, 0], [1.0, 1.15, 0.85]), { tile: 0.3, castShadow: true });
    room.geo('graphite', quad(0.15, 0.1), poseMatrix(at(lx, 1.88 - drop, -0.13), rotationY + Math.PI), FLAT);
    room.geo('heatSuit', boxGeometry(0.44, 0.78, 0.24), poseMatrix(at(lx, 1.32 - drop, 0), rotationY), { tile: 0.5, castShadow: true });
    for (const sl of [-1, 1]) {
      room.geo('heatSuit', boxGeometry(0.13, 0.66, 0.15), tiltMatrix(at(lx + sl * 0.26, 1.36 - drop, 0), [0, rotationY, sl * 0.16]), { tile: 0.3, castShadow: false });
    }
    room.geo('canvasPale', boxGeometry(0.4, 0.42, 0.2), poseMatrix(at(lx, 0.72 - drop, 0), rotationY), { tile: 0.4, castShadow: false });
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [0.34, 0.34], rotationY });
}

/**
 * A crucible: a graphite pot in a tilting yoke with molten metal in it. The
 * Smeltery's set piece, and the brightest thing in the Works.
 *
 * The melt is a disc set DOWN inside the pot with the light well above the rim -
 * a bowl whose top cap is lit reads as a bowl of soup on a stool
 * (docs/art/ROOM_REVIEW.md).
 */
export function crucible(room: Room, x: number, z: number, radius = 0.85, lit = false, intensity = 14): THREE.PointLight | null {
  const h = radius * 1.5;
  room.geo('graphite', cyl(radius, radius * 0.78, h, 12, true), poseMatrix([x, h / 2, z]), { tile: 0.8, castShadow: true });
  room.geo('firebrick', cyl(radius * 0.92, radius * 0.72, h - 0.06, 12, true), poseMatrix([x, h / 2 - 0.03, z]), { tile: 0.6, castShadow: false });
  room.geo('steel', ring(radius + 0.02, 0.06, 14), tiltMatrix([x, h - 0.04, z], [Math.PI / 2, 0, 0]), { tile: 0.3, castShadow: false });
  // The yoke: two trunnion arms and a hand wheel to tip it.
  for (const s of [-1, 1]) {
    room.geo('steel', boxGeometry(0.11, h * 1.1, 0.16), poseMatrix([x + s * (radius + 0.13), h * 0.55, z]), { tile: 0.4, castShadow: true });
    room.geo('steelPale', cyl(0.09, 0.09, 0.16, 8), tiltMatrix([x + s * (radius + 0.11), h * 0.62, z], [0, 0, Math.PI / 2]), { tile: 0.2, castShadow: false });
    post(room, 'steelDark', 0.09, 0.13, h * 0.55, [x + s * (radius + 0.13), 0, z], 7, CASTS);
  }
  valve(room, [x + radius + 0.16, h * 0.62, z + 0.3], 0.24, 0);
  // The melt, well down the pot, with a skin of dross drifting on it.
  room.geo('lumenMolten', disc(radius * 0.8, 14), tiltMatrix([x, h - 0.26, z], [-Math.PI / 2, 0, 0]), FLAT);
  for (let i = 0; i < 4; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = room.rng() * radius * 0.55;
    room.geo('cinder', ball(room.range(0.07, 0.16), 5), tiltMatrix([x + Math.cos(a) * d, h - 0.25, z + Math.sin(a) * d], [0, a, 0], [1.5, 0.25, 1.2]), FLAT);
  }
  room.blockCircle(x, z, radius + 0.22);
  if (!lit) return null;
  const lamp = new THREE.PointLight(0xffa040, intensity, room.ctx.dims.cellSize * 1.9, 2);
  lamp.position.set(x, h + 0.5, z);
  room.light(lamp);
  surge(room, lamp, intensity, 0.14, 0.7);
  return lamp;
}

/**
 * A laser emitter head on a mount, and the beam it is throwing. The beam is
 * additive, so it has no dark edge and no dark background - a line of light
 * painted as an ordinary emissive cylinder carries its own black with it.
 */
export function laserBeam(room: Room, from: Vec3, to: Vec3, cyan = false, radius = 0.014): void {
  strut(room, cyan ? 'beamCyan' : 'beamRed', from, to, radius, 5, FLAT);
  strut(room, cyan ? 'beamCyan' : 'beamRed', from, to, radius * 3.2, 5, FLAT);
  // The two dots at the ends: a beam has to LAND on something or it is a rod.
  room.geo(cyan ? 'beamCyan' : 'beamRed', ball(radius * 5, 6), poseMatrix(to), FLAT);
}

export function laserHead(room: Room, x: number, y: number, z: number, rotationY = 0, cyan = false): void {
  room.geo('graphite', boxGeometry(0.24, 0.2, 0.34), poseMatrix([x, y, z], rotationY), { tile: 0.3, castShadow: false });
  room.geo('steelPale', boxGeometry(0.3, 0.06, 0.08), poseMatrix([x, y + 0.12, z], rotationY), FLAT);
  room.geo('steel', cyl(0.055, 0.075, 0.2, 8), tiltMatrix([x - Math.sin(rotationY) * 0.24, y, z - Math.cos(rotationY) * 0.24], [Math.PI / 2, rotationY, 0]), { tile: 0.2, castShadow: false });
  room.geo(cyan ? 'lumenCyan' : 'lumenRed', disc(0.045, 8), poseMatrix([x - Math.sin(rotationY) * 0.34, y, z - Math.cos(rotationY) * 0.34], rotationY + Math.PI), FLAT);
  strut(room, 'cable', [x, y + 0.1, z], [x + 0.1, y + 0.6, z + 0.1], 0.018, 4, FLAT);
}

/**
 * A containment tank: an acrylic cylinder on a plinth with something in it.
 *
 * The fluid is **back-faced** so only the far wall draws and the contents sit in
 * front of it - a front-faced cylinder of water is an opaque drum with an
 * invisible specimen inside (docs/art/ROOM_REVIEW.md).
 */
export function containmentTank(
  room: Room,
  x: number,
  z: number,
  radius = 0.55,
  height = 1.8,
  contents: 'none' | 'specimen' | 'sludge' | 'broken' = 'specimen',
  lit = false,
  intensity = 7,
): THREE.PointLight | null {
  const base = 0.34;
  room.geo('steelDark', cyl(radius + 0.09, radius + 0.14, base, 14), poseMatrix([x, base / 2, z]), { tile: 0.5, castShadow: true });
  room.geo('steelPale', ring(radius + 0.06, 0.035, 16), tiltMatrix([x, base + 0.02, z], [Math.PI / 2, 0, 0]), { tile: 0.2, castShadow: false });

  if (contents === 'broken') {
    // The glass has gone, from the inside. Four jagged staves left standing.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      const hh = room.range(0.3, height * 0.75);
      room.geo('glassPane', boxGeometry(0.3, hh, 0.02), tiltMatrix([x + Math.cos(a) * radius, base + hh / 2, z + Math.sin(a) * radius], [0, a + Math.PI / 2, room.range(-0.1, 0.1)]), FLAT);
    }
    // What ran out of it, on the deck. NOT `bioFluid`: that is back-faced so a
    // tank draws its far wall only, and a back-faced disc lying flat is visible
    // from underneath the floor and from nowhere else.
    room.geo('membrane', disc(radius * 1.5, 14), tiltMatrix([x, 0.014, z], [-Math.PI / 2, 0, 0]), FLAT);
  } else {
    if (contents !== 'none') {
      // The fluid volume, back-faced, sitting behind whatever is floating in it.
      room.geo(contents === 'sludge' ? 'vfx.tar' : 'bioFluid', cyl(radius * 0.93, radius * 0.93, height * 0.9, 14, true), poseMatrix([x, base + (height * 0.9) / 2, z]), { tile: 0.8, castShadow: false });
    }
    if (contents === 'specimen') {
      // Something suspended: a curled body of segments with limbs off it. Not a
      // sphere - a sphere in a jar is a pickled onion.
      const cy = base + height * 0.5;
      for (let i = 0; i < 4; i++) {
        room.geo('chitin', ball(0.2 - i * 0.03, 6), tiltMatrix([x + Math.sin(i * 1.4) * 0.09, cy + 0.22 - i * 0.14, z + Math.cos(i * 1.4) * 0.05], [0, i, 0], [1.15, 0.85, 1.0]), { tile: 0.3, castShadow: false });
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.6;
        strut(room, 'sinew', [x + Math.cos(a) * 0.08, cy + 0.1, z + Math.sin(a) * 0.08], [x + Math.cos(a) * 0.34, cy - room.range(0.2, 0.45), z + Math.sin(a) * 0.34], 0.024, 5, FLAT);
      }
    }
    // The wall of the tank goes on LAST and carries almost no opacity, or the
    // whole thing greys over.
    room.geo('glassPane', cyl(radius, radius, height, 16, true), poseMatrix([x, base + height / 2, z]), FLAT);
  }
  // Cap, and the service head on top of it.
  room.geo('steelDark', cyl(radius + 0.07, radius + 0.04, 0.13, 14), poseMatrix([x, base + height + 0.06, z]), { tile: 0.3, castShadow: false });
  room.geo('steel', cyl(0.1, 0.1, 0.24, 8), poseMatrix([x, base + height + 0.24, z]), { tile: 0.2, castShadow: false });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    strut(room, 'cable', [x + Math.cos(a) * 0.08, base + height + 0.34, z + Math.sin(a) * 0.08], [x + Math.cos(a) * 0.5, room.ctx.dims.ceilingHeight - 0.2, z + Math.sin(a) * 0.5], 0.022, 4, FLAT);
  }
  room.blockCircle(x, z, radius + 0.14);

  if (!lit) return null;
  const lamp = new THREE.PointLight(contents === 'sludge' ? 0x7ab0c0 : 0x40e090, intensity, room.ctx.dims.cellSize * 1.3, 2);
  // Beside the tank, not inside it.
  lamp.position.set(x + radius + 0.4, base + height * 0.6, z);
  room.light(lamp);
  return lamp;
}

/** A small jar on a shelf. Ten of these are a laboratory; two are a desk. */
export function specimenJar(room: Room, x: number, y: number, z: number, radius = 0.1, height = 0.28, glowing = false): void {
  room.geo(glowing ? 'bioFluid' : 'vfx.tar', cyl(radius * 0.86, radius * 0.86, height * 0.8, 8, true), poseMatrix([x, y + (height * 0.8) / 2, z]), FLAT);
  room.geo('glassPane', cyl(radius, radius, height, 9, true), poseMatrix([x, y + height / 2, z]), FLAT);
  room.geo('steelDark', cyl(radius * 1.08, radius * 1.08, 0.035, 9), poseMatrix([x, y + height, z]), FLAT);
  if (glowing) room.geo('chitin', ball(radius * 0.5, 5), poseMatrix([x, y + height * 0.42, z]), FLAT);
}

/**
 * A wall of body drawers. The one refrigerated room in a volcano, and the
 * loudest thing in it is that one of the drawers is open.
 */
export function cryoDrawers(room: Room, side: Side, along: number, cols = 3, rows = 3, openIndex = -1, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.24, cell);
  const [x, , z] = position;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (lx: number, ly: number, lz: number): Vec3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
  const w = 0.62;
  const h = 0.56;
  room.geo('steelPale', boxGeometry(cols * w + 0.1, rows * h + 0.14, 0.5), poseMatrix(at(0, (rows * h) / 2 + 0.07, 0), rotationY), { tile: 0.7, castShadow: true });
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lx = (col - (cols - 1) / 2) * w;
      const ly = 0.14 + r * h + h / 2;
      const open = r * cols + col === openIndex;
      const out = open ? 0.62 : 0.0;
      room.geo('steelDark', boxGeometry(w - 0.05, h - 0.05, 0.06), poseMatrix(at(lx, ly, -0.26 - out), rotationY), { tile: 0.3, castShadow: false });
      room.geo('steelPale', boxGeometry(0.22, 0.045, 0.05), poseMatrix(at(lx, ly - 0.15, -0.31 - out), rotationY), FLAT);
      room.geo('canvasPale', quad(0.16, 0.08), poseMatrix(at(lx, ly + 0.14, -0.3 - out), rotationY + Math.PI), FLAT);
      if (open) {
        // The tray, and the sheet over what is on it. Empty is worse than full.
        room.geo('steelPale', boxGeometry(w - 0.1, 0.03, 0.62), poseMatrix(at(lx, ly - 0.2, -0.26 - out / 2), rotationY), { tile: 0.3, castShadow: false });
        room.geo('rime', boxGeometry(w - 0.16, 0.02, 0.5), poseMatrix(at(lx, ly - 0.17, -0.28 - out / 2), rotationY), FLAT);
        room.collider({ kind: 'box', center: [at(lx, 0, -0.26 - out / 2)[0], at(lx, 0, -0.26 - out / 2)[2]], halfExtents: [w / 2, 0.34], rotationY });
      }
    }
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [(cols * w) / 2, 0.25], rotationY });
}

/** A bunk, single or stacked. Crew quarters, and the mattress is never made. */
export function bunk(room: Room, x: number, z: number, rotationY = 0, stacked = true): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (lx: number, ly: number, lz: number): Vec3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
  for (const s2 of [-1, 1]) {
    for (const e of [-1, 1]) {
      post(room, 'steel', 0.035, 0.035, stacked ? 1.86 : 0.6, at(s2 * 0.94, 0, e * 0.4), 5, FLAT);
    }
  }
  const levels = stacked ? [0.48, 1.36] : [0.48];
  for (const y of levels) {
    room.geo('steelDark', boxGeometry(1.96, 0.06, 0.86), poseMatrix(at(0, y, 0), rotationY), { tile: 0.5, castShadow: true });
    room.geo('itemCloth', boxGeometry(1.84, 0.11, 0.76), poseMatrix(at(0, y + 0.085, 0), rotationY), { tile: 0.6, castShadow: false });
    // The blanket, thrown back rather than folded.
    room.geo('canvasPale', boxGeometry(1.0, 0.07, 0.8), tiltMatrix(at(room.range(-0.3, 0.3), y + 0.16, 0), [0, rotationY, room.range(-0.06, 0.06)]), { tile: 0.5, castShadow: false });
    room.geo('itemCloth', boxGeometry(0.42, 0.11, 0.28), poseMatrix(at(-0.7, y + 0.15, 0), rotationY), FLAT);
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [1.0, 0.45], rotationY });
}

/** A treatment bed with a rail and, on some of them, straps. */
export function medBed(room: Room, x: number, z: number, rotationY = 0, strapped = false): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (lx: number, ly: number, lz: number): Vec3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
  for (const s2 of [-1, 1]) for (const e of [-1, 1]) post(room, 'steelPale', 0.028, 0.032, 0.62, at(s2 * 0.88, 0, e * 0.32), 5, FLAT);
  room.geo('steelPale', boxGeometry(1.92, 0.07, 0.76), poseMatrix(at(0, 0.66, 0), rotationY), { tile: 0.5, castShadow: true });
  room.geo('rubber', boxGeometry(1.8, 0.1, 0.68), poseMatrix(at(0, 0.72, 0), rotationY), { tile: 0.5, castShadow: false });
  // The head end, raised.
  room.geo('rubber', boxGeometry(0.52, 0.09, 0.66), tiltMatrix(at(-0.66, 0.79, 0), [0, rotationY, 0.32]), { tile: 0.4, castShadow: false });
  for (const s2 of [-1, 1]) {
    room.geo('steelPale', boxGeometry(0.9, 0.035, 0.035), poseMatrix(at(0.4, 0.94, s2 * 0.36), rotationY), FLAT);
    for (const e of [-1, 1]) strut(room, 'steelPale', at(0.4 + e * 0.44, 0.7, s2 * 0.36), at(0.4 + e * 0.44, 0.95, s2 * 0.36), 0.016, 4, FLAT);
  }
  if (strapped) {
    for (const lx of [-0.3, 0.35]) {
      room.geo('itemAccent', boxGeometry(0.06, 0.03, 0.74), poseMatrix(at(lx, 0.79, 0), rotationY), FLAT);
      room.geo('steelDark', boxGeometry(0.07, 0.05, 0.05), poseMatrix(at(lx, 0.8, 0.2), rotationY), FLAT);
    }
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [0.95, 0.4], rotationY });
}

/**
 * A warhead cradle: whatever the black site is actually for, on a wheeled
 * trolley. Deliberately unlabelled - what makes it frightening is that it is
 * clearly finished and clearly for somewhere else.
 */
export function ordnanceCradle(room: Room, x: number, z: number, rotationY = 0, loaded = true): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (lx: number, ly: number, lz: number): Vec3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
  room.geo('steelDark', boxGeometry(2.2, 0.16, 0.8), poseMatrix(at(0, 0.34, 0), rotationY), { tile: 0.6, castShadow: true });
  for (const s2 of [-1, 1]) for (const e of [-1, 1]) {
    room.geo('rubber', cyl(0.13, 0.13, 0.08, 8), tiltMatrix(at(s2 * 0.86, 0.13, e * 0.32), [0, 0, Math.PI / 2]), { tile: 0.2, castShadow: false });
    post(room, 'steel', 0.04, 0.04, 0.24, at(s2 * 0.86, 0.1, e * 0.32), 5, FLAT);
  }
  // Two saddles.
  for (const lx of [-0.6, 0.6]) {
    room.geo('firebrick', boxGeometry(0.22, 0.3, 0.72), poseMatrix(at(lx, 0.5, 0), rotationY), { tile: 0.3, castShadow: false });
  }
  if (loaded) {
    room.geo('steelPale', cyl(0.29, 0.29, 1.7, 12), tiltMatrix(at(0, 0.79, 0), [Math.PI / 2, rotationY + Math.PI / 2, 0]), { tile: 0.7, castShadow: true });
    room.geo('graphite', spike(0.29, 0.5, 12), tiltMatrix(at(-1.1, 0.79, 0), [Math.PI / 2, rotationY + Math.PI / 2, 0]), { tile: 0.3, castShadow: true });
    for (const lx of [-0.55, 0.1, 0.7]) room.geo('paintedWarn', ring(0.3, 0.028, 12), tiltMatrix(at(lx, 0.79, 0), [0, rotationY + Math.PI / 2, Math.PI / 2]), FLAT);
    room.geo('steelDark', boxGeometry(0.3, 0.22, 0.5), poseMatrix(at(0.95, 0.79, 0), rotationY), { tile: 0.2, castShadow: false });
    room.geo('lumenRed', boxGeometry(0.1, 0.03, 0.03), poseMatrix(at(1.08, 0.82, 0.14), rotationY), FLAT);
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [1.15, 0.45], rotationY });
}

/**
 * The head of a tunnel boring machine, jammed in the rock face: a dished cutter
 * wheel with disc cutters bolted round it. The map's biggest single silhouette,
 * and it is built flat against a wall so it never eats the floor.
 */
export function boringHead(room: Room, side: Side, along: number, radius = 2.4, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.3, cell);
  const [x, , z] = position;
  const inx = -Math.sin(rotationY);
  const inz = -Math.cos(rotationY);
  const at = (d: number, ly: number, lateral = 0): Vec3 => [x + inx * d + Math.cos(rotationY) * lateral, ly, z + inz * d - Math.sin(rotationY) * lateral];
  const cy = radius * 0.78;

  /**
   * **Nothing on this head casts a shadow**, and that is not a saving - it is the
   * only way the room works. A four-metre disc a metre in front of the room's one
   * shadow-casting lamp throws a shadow the size of the room: the first contact
   * sheet of the drill chamber was three views of solid black with a rim of
   * orange, and the cause was not the geometry but the lamp behind it. Anything
   * this big and this close to a practical is a wall as far as the shadow map is
   * concerned (docs/art/ROOM_REVIEW.md).
   */
  // The dished face plate, built as three discs at three depths so it is a dish.
  room.geo('steel', cyl(radius, radius * 0.96, 0.28, 20), tiltMatrix(at(0.12, cy), [Math.PI / 2, rotationY, 0]), { tile: 1.1 });
  room.geo('graphite', cyl(radius * 0.72, radius * 0.72, 0.34, 18), tiltMatrix(at(0.3, cy), [Math.PI / 2, rotationY, 0]), { tile: 0.8, castShadow: false });
  room.geo('steelDark', cyl(radius * 0.3, radius * 0.34, 0.5, 14), tiltMatrix(at(0.48, cy), [Math.PI / 2, rotationY, 0]), { tile: 0.5, castShadow: false });
  // Four muck buckets cut into the rim, and the spokes between them.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    room.geo('graphite', boxGeometry(radius * 1.6, 0.34, 0.36), tiltMatrix(at(0.28, cy, 0), [0, rotationY, a]), { tile: 0.6, castShadow: false });
  }
  // Disc cutters: the rings that actually do the cutting, in a spiral.
  for (let i = 0; i < 13; i++) {
    const a = i * 2.4;
    const r = radius * (0.24 + (i / 13) * 0.72);
    const px = Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    room.geo('steelPale', cyl(0.17, 0.17, 0.1, 9), tiltMatrix(at(0.42, py, px), [0, rotationY, Math.PI / 2]), { tile: 0.2, castShadow: false });
    room.geo('steelDark', boxGeometry(0.18, 0.2, 0.2), poseMatrix(at(0.3, py, px), rotationY), FLAT);
  }
  // The rock it has stopped in, packed round the rim.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    room.geo('rockDark', ball(0.34, 6), tiltMatrix(at(0.02, cy + Math.sin(a) * (radius + 0.16), Math.cos(a) * (radius + 0.16)), [0, a, 0], [1.2, 1.0, 0.8]), {
      tile: 0.6,
      castShadow: false,
    });
  }
  room.collider({ kind: 'box', center: [x + inx * 0.32, z + inz * 0.32], halfExtents: [radius, 0.55], rotationY });
}

/** Rail track across the floor: two rails on sleepers. No collider - it is flat. */
export function railTrack(room: Room, from: readonly [number, number], to: readonly [number, number], gauge = 1.0): void {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const nx = Math.cos(yaw);
  const nz = -Math.sin(yaw);
  const mx = (from[0] + to[0]) / 2;
  const mz = (from[1] + to[1]) / 2;
  const sleepers = Math.max(3, Math.round(length / 0.65));
  for (let i = 0; i < sleepers; i++) {
    const t = (i + 0.5) / sleepers;
    room.geo('itemWood', boxGeometry(gauge + 0.5, 0.09, 0.2), poseMatrix([from[0] + dx * t, 0.045, from[1] + dz * t], -yaw + Math.PI / 2), { tile: 0.3, castShadow: false });
  }
  for (const s of [-1, 1]) {
    room.geo('steelPale', boxGeometry(length, 0.07, 0.07), poseMatrix([mx + nx * s * (gauge / 2), 0.12, mz + nz * s * (gauge / 2)], -yaw + Math.PI / 2), { tile: 0.5, castShadow: false });
  }
}

/** An ore tram car, tipped or upright. Big, dark, and it blocks. */
export function tramCar(room: Room, x: number, z: number, rotationY = 0, tipped = false): void {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (lx: number, ly: number, lz: number): Vec3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
  const lean = tipped ? 0.42 : 0;
  room.geo('steelDark', boxGeometry(2.0, 0.2, 1.0), poseMatrix(at(0, 0.36, 0), rotationY), { tile: 0.5, castShadow: true });
  for (const s2 of [-1, 1]) for (const e of [-1, 1]) {
    room.geo('steel', cyl(0.19, 0.19, 0.09, 9), tiltMatrix(at(s2 * 0.72, 0.19, e * 0.44), [0, 0, Math.PI / 2]), { tile: 0.2, castShadow: false });
  }
  // The tub: five leaning panels, so it is a hopper and not a box.
  room.geo('tempered', boxGeometry(1.86, 0.06, 0.92), tiltMatrix(at(0, 0.5, 0), [0, rotationY, lean]), { tile: 0.6, castShadow: false });
  for (const s2 of [-1, 1]) {
    room.geo('tempered', boxGeometry(1.86, 0.86, 0.06), tiltMatrix(at(Math.sin(lean) * 0.2, 0.86, s2 * 0.44), [s2 * 0.18, rotationY, lean]), { tile: 0.6, castShadow: true });
    room.geo('tempered', boxGeometry(0.06, 0.86, 0.92), tiltMatrix(at(s2 * 0.92, 0.86, 0), [0, rotationY, lean]), { tile: 0.5, castShadow: true });
  }
  // What is in it, spilling if it is tipped.
  for (let i = 0; i < 7; i++) {
    const lx = room.range(-0.7, 0.7);
    const lz = room.range(-0.3, 0.3);
    room.geo('cinder', ball(room.range(0.1, 0.2), 5), tiltMatrix(at(lx + (tipped ? 1.4 : 0), tipped ? 0.14 : 1.0, lz), [0, i, 0], [1.2, 0.8, 1.1]), { tile: 0.3, castShadow: false });
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [1.02, 0.56], rotationY });
}

/* --- the bio strand ---------------------------------------------------------------- */

/**
 * A sac of the thing that got out: a translucent membrane pod on a chitin
 * pedestal, lit from inside. Collars and rims go BEHIND a glow, never in front
 * of it - a translucent film over a light source turns the light grey
 * (docs/art/ROOM_REVIEW.md).
 */
export function bioSac(room: Room, x: number, y: number, z: number, scale = 1, lit = false, intensity = 6): THREE.PointLight | null {
  room.geo('sinew', ball(0.24 * scale, 7), tiltMatrix([x, y + 0.1 * scale, z], [0, 0, 0], [1.2, 0.55, 1.2]), { tile: 0.4, castShadow: false });
  // The pod: two stacked lobes, so it has a waist and reads as organic.
  room.geo('membrane', ball(0.34 * scale, 8), tiltMatrix([x, y + 0.42 * scale, z], [0, 0, 0], [1.0, 1.15, 1.0]), FLAT);
  room.geo('membrane', ball(0.24 * scale, 7), tiltMatrix([x, y + 0.82 * scale, z], [0, 0, 0], [1.0, 1.05, 1.0]), FLAT);
  // Something curled inside it, dark against the glow.
  room.geo('sinew', ball(0.16 * scale, 6), tiltMatrix([x, y + 0.44 * scale, z], [0.4, 0.6, 0], [1.3, 0.8, 0.9]), FLAT);
  // Chitin ribs up the outside, BEHIND the membrane's silhouette at the edges.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    strut(room, 'chitin', [x + Math.cos(a) * 0.3 * scale, y + 0.06 * scale, z + Math.sin(a) * 0.3 * scale], [x + Math.cos(a) * 0.1 * scale, y + 0.98 * scale, z + Math.sin(a) * 0.1 * scale], 0.024 * scale, 5, FLAT);
  }
  room.blockCircle(x, z, 0.3 * scale);
  if (!lit) return null;
  const lamp = new THREE.PointLight(0x3ce890, intensity, room.ctx.dims.cellSize * 1.2, 2);
  lamp.position.set(x + 0.5 * scale, y + 0.5 * scale, z);
  room.light(lamp);
  surge(room, lamp, intensity, 0.22, 0.5);
  return lamp;
}

/** Veins growing along a wall: a dark cord with glowing nodes ON it, not glowing cord. */
export function bioVeins(room: Room, side: Side, along: number, count = 4, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.06, cell);
  const [x, , z] = position;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (lx: number, ly: number, lz: number): Vec3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
  for (let i = 0; i < count; i++) {
    const lx = room.range(-1.4, 1.4);
    let y = 0.1;
    let cx = lx;
    while (y < room.ctx.dims.ceilingHeight - 0.4) {
      const ny = y + room.range(0.3, 0.6);
      const nx = cx + room.range(-0.26, 0.26);
      strut(room, 'sinew', at(cx, y, 0), at(nx, ny, 0), room.range(0.02, 0.045), 5, FLAT);
      // A glowing node ON the cord, at a joint. Glow has to be POINTS on a dark
      // line - a glowing line beside a dark one reads as bunting.
      if (room.chance(0.45)) room.geo('chitin', ball(room.range(0.04, 0.08), 5), poseMatrix(at(nx, ny, 0.02)), FLAT);
      cx = nx;
      y = ny;
    }
  }
}

/** A body wrapped in membrane, stuck to a wall. Two per room is more than enough. */
export function cocoon(room: Room, side: Side, along: number, y = 0.4, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.34, cell);
  const [x, , z] = position;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const at = (lx: number, ly: number, lz: number): Vec3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
  // The shape under the wrapping: shoulders, waist, a head tilted back.
  room.geo('sinew', ball(0.26, 7), tiltMatrix(at(0, y + 0.75, 0), [0.1, rotationY, 0], [1.0, 1.4, 0.75]), { tile: 0.4, castShadow: true });
  room.geo('sinew', ball(0.15, 6), tiltMatrix(at(0, y + 1.42, 0.02), [0.35, rotationY, 0], [1.0, 1.05, 0.9]), { tile: 0.3, castShadow: true });
  room.geo('sinew', ball(0.17, 6), tiltMatrix(at(0, y + 0.22, 0), [0, rotationY, 0], [1.0, 1.7, 0.75]), { tile: 0.3, castShadow: false });
  // The wrapping: three bands of membrane across it at three widths, and strands
  // out to the wall. Six evenly spaced bands read as a stack of discs - a wedding
  // cake - rather than as something wrapped (docs/art/ROOM_REVIEW.md).
  for (const [ly, bw, bh] of [
    [0.24, 0.5, 0.2],
    [0.86, 0.62, 0.3],
    [1.34, 0.42, 0.16],
  ] as const) {
    room.geo('membrane', boxGeometry(bw, bh, bw * 0.78), tiltMatrix(at(0, y + ly, 0), [0, rotationY, room.range(-0.16, 0.16)]), FLAT);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    strut(room, 'membrane', at(Math.cos(a) * 0.24, y + 0.8 + Math.sin(a) * 0.6, 0), at(Math.cos(a) * 0.72, y + 0.8 + Math.sin(a) * 1.1, -0.32), 0.018, 4, FLAT);
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [0.32, 0.3], rotationY });
}

/* --- atmosphere --------------------------------------------------------------------- */

/** An additive pool of light on the floor. For anything hot that has no lamp. */
export function glowPool(room: Room, x: number, z: number, radius = 1.2, cold = false): void {
  room.geo(cold ? 'arcWash' : 'heatWash', disc(radius, 18), tiltMatrix([x, 0.011, z], [-Math.PI / 2, 0, 0]), FLAT);
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
  // same pose `strut()` uses for a cylinder - `[acos(dy/L), atan2(dx,dz), 0]` in
  // YXZ. Subtracting a quarter turn from the pitch (the obvious guess) lays the
  // shaft on its side.
  const pitch = Math.acos(Math.min(1, Math.max(-1, dy / length)));
  const mid: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  for (let i = 0; i < 2; i++) {
    room.geo(cold ? 'arcWash' : 'heatWash', quad(width, length), tiltMatrix(mid, [pitch, yaw + i * Math.PI * 0.5, 0]), FLAT);
  }
}

/** Heat shimmer: a thin additive sheet standing in front of something hot. */
export function heatShimmer(room: Room, x: number, y: number, z: number, w: number, h: number, rotationY = 0): void {
  room.geo('hazeWarm', quad(w, h), poseMatrix([x, y, z], rotationY), FLAT);
}

/**
 * Motes drifting in the air: ash, sparks, spores. Three-segment specks, because
 * a four-segment mote and a three-segment mote are indistinguishable at the fog
 * density they are seen through and there are hundreds of them.
 */
export function motes(room: Room, x: number, y: number, z: number, radius = 1.5, count = 14, kind: 'ash' | 'spark' | 'spore' = 'ash'): void {
  const material = kind === 'spark' ? 'ember' : kind === 'spore' ? 'chitin' : 'ashPale';
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * radius;
    room.geo(material, ball(room.range(0.012, 0.032), 4), poseMatrix([x + Math.cos(a) * d, y + room.range(-0.8, 0.8), z + Math.sin(a) * d]), FLAT);
  }
}

/**
 * Sparks falling from a height, as a narrow cone of specks with a bright landing
 * spot. Cheap, and it makes a ceiling feel dangerous.
 */
export function sparkFall(room: Room, x: number, z: number, from: number, count = 12): void {
  for (let i = 0; i < count; i++) {
    const t = room.rng();
    room.geo('ember', ball(room.range(0.012, 0.028), 4), poseMatrix([x + room.range(-0.3, 0.3) * t, from - t * from, z + room.range(-0.3, 0.3) * t]), FLAT);
  }
  glowPool(room, x, z, 0.5);
}

/** Loose debris on a floor: a spill of small dark shapes that reads as damage. */
export function debris(room: Room, x: number, z: number, radius = 0.9, count = 9): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * radius;
    const w = room.range(0.1, 0.34);
    room.geo(
      room.chance(0.4) ? 'steelDark' : room.chance(0.5) ? 'cinder' : 'graphite',
      boxGeometry(w, room.range(0.02, 0.07), room.range(0.08, 0.28)),
      tiltMatrix([x + Math.cos(a) * d, 0.03, z + Math.sin(a) * d], [room.range(-0.1, 0.1), room.range(0, 3), room.range(-0.1, 0.1)]),
      { tile: 0.25, castShadow: false },
    );
  }
}

/**
 * A hanging chain with something on the end of it. Anything on a chain needs a
 * batcher of ITS OWN: built as one `THREE.Mesh` per link it is thirty draw calls
 * for one prop (docs/art/ROOM_REVIEW.md).
 */
export function hangingHook(room: Room, x: number, z: number, drop = 1.4): void {
  const { ceilingHeight } = room.ctx.dims;
  const batch = new MeshBatcher();
  const steel = room.mat('steelDark');
  const top = ceilingHeight - 0.1;
  const links = Math.max(3, Math.round(drop / 0.16));
  for (let i = 0; i < links; i++) {
    // Local space: the group is parked at the ceiling and swings about it, so
    // every link hangs at a negative y and the pivot is the origin.
    const y = -(drop * (i + 0.5)) / links;
    batch.add(steel, ring(0.05, 0.016, 7), tiltMatrix([0, y, 0], [i % 2 ? Math.PI / 2 : 0, 0, 0]), { tile: 0.2, castShadow: false, receiveShadow: false });
  }
  // The block and hook.
  batch.add(steel, boxGeometry(0.16, 0.24, 0.1), poseMatrix([0, -drop - 0.12, 0]), { tile: 0.2, castShadow: false, receiveShadow: false });
  batch.add(room.mat('steelPale'), ring(0.11, 0.026, 8), tiltMatrix([0, -drop - 0.34, 0], [0, 0, 0]), { tile: 0.2, castShadow: false, receiveShadow: false });
  const built = batch.build();
  const group = new THREE.Group();
  group.position.set(x, top, z);
  group.add(built.object);
  room.loose(group);
  room.own(built);
  sway(room, group, 0.045, 0.36);
}
