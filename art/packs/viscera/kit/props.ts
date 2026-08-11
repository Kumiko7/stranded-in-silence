/**
 * The Leviathan's anatomy kit.
 *
 * These are the pieces that recur across rooms - the things that make a space
 * read as being *inside something that is still alive*. Rooms compose them;
 * almost nothing is modelled twice.
 *
 * **Facing convention.** Every prop is authored facing `-Z`, the same direction
 * shared art faces (docs/art/SHARED_ART.md §2), so one set of wall rotations
 * works for props, chests and lockers alike. `wallPose()` gives you the position
 * and rotation for something growing off a given wall.
 *
 * **Light convention.** The pack has two real lights per room and the player
 * carries none, so most of what you can see by is emissive: `bilePool`,
 * `lumenPod`, `nerveRun`, `sporeBloom` and the eyes all light a room for free.
 * Only `lumenPod(..., lit)`, `bilePool(..., lit)` and `heartMass(..., lit)` ever
 * spend a real one, and they say so in their signature.
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
 * Anything living inside its own light source. A glowing pod two centimetres
 * from a point light casts a shadow the length of the room, which reads as a
 * black bar across the floor rather than as a lamp.
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
 * Where to put something growing off `side`, `along` metres from the wall's
 * centre (along the prop's own local +X) and `inset` metres out of the tissue.
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
export function cyl(rTop: number, rBot: number, h: number, seg = 10): THREE.CylinderGeometry {
  const key = `${rTop},${rBot},${h},${seg}`;
  let geo = cylCache.get(key);
  if (!geo) {
    geo = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    cylCache.set(key, geo);
  }
  return geo;
}

const sphereCache = new Map<string, THREE.SphereGeometry>();
export function ball(r: number, seg = 10): THREE.SphereGeometry {
  const key = `${r},${seg}`;
  let geo = sphereCache.get(key);
  if (!geo) {
    geo = new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg / 2)));
    sphereCache.set(key, geo);
  }
  return geo;
}

const coneCache = new Map<string, THREE.ConeGeometry>();
export function spike(r: number, h: number, seg = 7): THREE.ConeGeometry {
  const key = `${r},${h},${seg}`;
  let geo = coneCache.get(key);
  if (!geo) {
    geo = new THREE.ConeGeometry(r, h, seg);
    coneCache.set(key, geo);
  }
  return geo;
}

const torusCache = new Map<string, THREE.TorusGeometry>();
export function ring(r: number, tube: number, seg = 16): THREE.TorusGeometry {
  const key = `${r},${tube},${seg}`;
  let geo = torusCache.get(key);
  if (!geo) {
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
export function disc(r: number, seg = 20): THREE.CircleGeometry {
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
  seg = 10,
  options: BatchOptions = {},
): void {
  room.geo(material, cyl(rTop, rBot, h, seg), poseMatrix([p[0], p[1] + h / 2, p[2]]), { tile: 0.6, ...options });
}

/**
 * A cylinder from one point to another, at any angle. Cords, cables, ribs and
 * nerve runs all come down to this, and doing it by hand is where a horizontal
 * rail ends up standing on end (see docs/art/ROOM_REVIEW.md §4).
 */
export function strut(
  room: Room,
  material: string,
  from: Vec3,
  to: Vec3,
  radius: number,
  seg = 7,
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

/* --- light sources -------------------------------------------------------------- */

/**
 * A bioluminescent pod: a swollen sac of light on a short stalk. The pack's
 * candle. `lit` spends one of the room's two real lights - without it the pod
 * still glows, it just does not throw anything.
 */
export function lumenPod(room: Room, p: Vec3, radius = 0.17, lit = false, warm = false, intensity = 9): void {
  const skin = warm ? 'lumenWarm' : 'lumen';
  post(room, 'meatPale', 0.035, 0.06, 0.1, p, 6, NO_SHADOW);
  // The sac, and a collar of tissue gripping its base. Nothing translucent goes
  // over the top of it: a grey film in front of a glow just turns it grey.
  room.geo(skin, ball(radius, 12), tiltMatrix([p[0], p[1] + 0.1 + radius * 0.8, p[2]], [0, 0, 0], [1, 1.25, 1]), NO_SHADOW);
  room.geo('meatPale', cyl(radius * 0.72, radius * 0.5, radius * 0.5, 9), poseMatrix([p[0], p[1] + 0.14, p[2]]), {
    castShadow: false,
    tile: 0.3,
  });

  if (lit) {
    const lamp = new THREE.PointLight(warm ? 0xffb060 : 0x8ff0c4, intensity, room.ctx.dims.cellSize * 1.5, 2);
    lamp.position.set(p[0], p[1] + 0.16 + radius, p[2]);
    room.light(lamp);
    breathe(room, lamp, intensity, 0.16, 1.4);
  }
}

/**
 * A cluster of light organs hanging from the ceiling - the pack's chandelier.
 * Stalk, a knot of sacs, and threads of glowing mucus trailing off it.
 */
export function lumenCluster(room: Room, x: number, z: number, lit = true, warm = false, castShadow = true): void {
  const { ceilingHeight } = room.ctx.dims;
  const hang = ceilingHeight - 0.95;
  const skin = warm ? 'lumenWarm' : 'lumen';

  // Nothing in the fixture casts a shadow: the room's one shadow-casting light
  // sits inside it, and a shadow-casting stalk paints a black bar right across
  // the floor it is meant to be lighting.
  room.geo('meat', cyl(0.13, 0.06, ceilingHeight - hang, 8), poseMatrix([x, (ceilingHeight + hang) / 2, z]), NO_SHADOW);
  room.geo('meatPale', ball(0.16, 10), poseMatrix([x, hang, z]), NO_SHADOW);

  const sacs = 6;
  for (let i = 0; i < sacs; i++) {
    const a = (i / sacs) * Math.PI * 2 + 0.3;
    const r = room.range(0.16, 0.32);
    const drop = room.range(0.1, 0.34);
    const size = room.range(0.09, 0.16);
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    strut(room, 'meatDark', [x, hang, z], [px, hang - drop, pz], 0.022, 5, NO_SHADOW);
    room.geo(skin, ball(size, 10), tiltMatrix([px, hang - drop - size, pz], [0, 0, 0], [1, 1.35, 1]), NO_SHADOW);
    // The collar of tissue the sac hangs out of - above it, never in front of
    // it, or the glow is behind a grey film and stops being a light.
    room.geo('meatDark', cyl(size * 0.5, size * 0.8, size * 0.5, 8), poseMatrix([px, hang - drop + size * 0.1, pz]), {
      castShadow: false,
      tile: 0.3,
    });
    // A thread of glowing mucus, still dripping.
    if (room.chance(0.6)) {
      room.geo(skin, cyl(0.008, 0.004, room.range(0.2, 0.5), 4), poseMatrix([px, hang - drop - size * 2.2, pz]), NO_SHADOW);
    }
  }

  if (lit) {
    const lamp = new THREE.PointLight(warm ? 0xffa060 : 0x8ff0c4, 14, room.ctx.dims.cellSize * 1.9, 2);
    lamp.position.set(x, hang - 0.28, z);
    // At most one shadow-casting light per room (ROOM_FORMAT.md §7), and rooms
    // are static - so bake the map once and stop paying for it.
    lamp.castShadow = castShadow;
    if (castShadow) {
      lamp.shadow.mapSize.set(512, 512);
      lamp.shadow.autoUpdate = false;
      lamp.shadow.needsUpdate = true;
    }
    room.light(lamp);
    breathe(room, lamp, 14, 0.1, 1.1);
  }
}

/**
 * A pool of gastric fluid: the surface, a crust rim, and bubbles rising through
 * it. Emissive, so it lights the floor around it whether or not `lit` is set -
 * and when it is, the light sits *in* the pool and underlights everything.
 */
export function bilePool(room: Room, x: number, z: number, radius: number, lit = false, intensity = 10): void {
  room.geo('bile', disc(radius, 22), tiltMatrix([x, 0.028, z], [-Math.PI / 2, 0, 0]), {
    castShadow: false,
    receiveShadow: false,
    tile: 2.0,
  });
  // A crust where the fluid has eaten into what it is standing on.
  room.geo('grit', ring(radius, 0.075, 22), poseMatrix([x, 0.03, z]), { tile: 0.6, castShadow: false });
  for (let i = 0; i < 7; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = Math.sqrt(room.rng()) * (radius - 0.12);
    room.geo('bile', ball(room.range(0.03, 0.08), 6), poseMatrix([x + Math.cos(a) * r, 0.05, z + Math.sin(a) * r]), NO_SHADOW);
  }

  if (lit) {
    const lamp = new THREE.PointLight(0xa8d84a, intensity, room.ctx.dims.cellSize * 1.6, 2);
    lamp.position.set(x, 0.55, z);
    room.light(lamp);
    breathe(room, lamp, intensity, 0.2, 0.9);
  }
}

/**
 * Nerve cord: a glowing line run along a wall or across a ceiling, with nodes
 * at intervals. Free light, and the pack's most reliable way to make a dark
 * corridor legible - the eye follows it to the next doorway.
 */
export function nerveRun(room: Room, points: readonly Vec3[], radius = 0.03): void {
  /**
   * Each leg is split into four and sagged in the middle. A cord run dead
   * straight between two points reads as a strip light bolted to the ceiling -
   * the sag is the entire difference between "nerve" and "fluorescent tube".
   */
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const sag = Math.min(0.28, Math.hypot(b[0] - a[0], b[2] - a[2]) * 0.09);
    const steps = 4;
    let prev = a;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const next: Vec3 =
        s === steps
          ? b
          : [
              a[0] + (b[0] - a[0]) * t,
              a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag,
              a[2] + (b[2] - a[2]) * t,
            ];
      /**
       * Sheathed for its whole length, and dark. The glow is POINTS on a dark
       * line, never half the line: an earlier pass alternated bare emissive
       * cord with pale sheath and came out as a string of party lights strung
       * across the ceiling.
       */
      strut(room, 'meatDark', prev, next, radius * 1.3, 5, { castShadow: false, tile: 0.3 });
      // A node where the sheath breaks. This is the only lit part of the run.
      if (s < steps) room.geo('nerve', ball(radius * 1.45, 6), poseMatrix(next), NO_SHADOW);
      prev = next;
    }
    // A ganglion at every junction: the cord is knotted, not extruded.
    room.geo('meatPale', ball(radius * 2.4, 7), poseMatrix(b), { castShadow: false, tile: 0.3 });
    room.geo('nerve', ball(radius * 1.7, 6), poseMatrix([b[0], b[1] - radius * 1.8, b[2]]), NO_SHADOW);
  }
  const first = points[0];
  if (first) room.geo('meatPale', ball(radius * 2.4, 7), poseMatrix(first), { castShadow: false, tile: 0.3 });
}

/** A shaft of glow through an aperture: a long, faint, unlit wedge. Cheap god-rays. */
export function glowShaft(room: Room, from: Vec3, to: Vec3, width: number, warm = false): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.asin(-dy / Math.max(0.001, length));
  const centre: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];

  for (const roll of [0, Math.PI / 2]) {
    room.geo(warm ? 'hazeWarm' : 'haze', quad(width, length), tiltMatrix(centre, [pitch + Math.PI / 2, yaw, roll]), {
      castShadow: false,
      receiveShadow: false,
    });
  }
}

/* --- animation ------------------------------------------------------------------ */

/**
 * The slow swell of something alive. Every light in the pack breathes rather
 * than flickers: a candle gutters, an organ does not.
 */
export function breathe(room: Room, light: THREE.Light, base: number, amount: number, speed = 1.2): void {
  const phase = room.range(0, 20);
  room.tick((t) => {
    const swell = Math.sin(t * speed + phase) * 0.7 + Math.sin(t * speed * 1.61 + phase * 1.3) * 0.3;
    light.intensity = base * (1 + swell * amount);
  });
}

/**
 * A double thump, then a pause. Used by the heart and by anything that wants to
 * borrow its rhythm - it is the loudest thing the art can say without sound.
 */
export function heartbeat(room: Room, light: THREE.Light, base: number, amount = 0.55, bpm = 34): void {
  const phase = room.range(0, 6);
  const period = 60 / bpm;
  room.tick((t) => {
    const cycle = ((t + phase) % period) / period;
    const thump = Math.exp(-Math.pow((cycle - 0.06) / 0.05, 2)) + 0.62 * Math.exp(-Math.pow((cycle - 0.2) / 0.06, 2));
    light.intensity = base * (1 + thump * amount);
  });
}

/** A slow drift, for anything that hangs. */
export function sway(room: Room, object: THREE.Object3D, amount: number): void {
  const phase = room.range(0, 20);
  const x = object.position.x;
  const z = object.position.z;
  room.tick((t) => {
    object.position.x = x + Math.sin(t * 0.5 + phase) * amount;
    object.position.z = z + Math.cos(t * 0.39 + phase) * amount;
  });
}

/* --- soft tissue ---------------------------------------------------------------- */

/**
 * A tentacle. Segments follow a curve that leans and curls, tapering to a tip,
 * with suckers down one face. The single most useful silhouette in the pack:
 * one of these in a doorway reads from the far side of a room.
 */
export function tendril(
  room: Room,
  x: number,
  z: number,
  height: number,
  lean = 0.35,
  facing = 0,
  suckers = true,
  material = 'meat',
): void {
  const segments = 9;
  const curl = room.range(-0.5, 0.5);
  let px = x;
  let py = 0;
  let pz = z;
  let angle = 0;

  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const len = (height / segments) * (1.25 - t * 0.5);
    const radius = 0.19 * (1 - t * 0.82) + 0.015;
    angle += lean * (0.35 + t) * 0.42 + curl * t * 0.16;
    const nx = px + Math.sin(angle) * Math.sin(facing) * len;
    const ny = py + Math.cos(angle) * len;
    const nz = pz + Math.sin(angle) * Math.cos(facing) * len;

    strut(room, material, [px, py, pz], [nx, ny, nz], radius, 8, { tile: 0.7 });
    room.geo(material, ball(radius * 1.04, 8), poseMatrix([nx, ny, nz]), { tile: 0.7 });

    if (suckers && i > 0 && i < segments - 1) {
      // On the inside of the curl, where a real sucker face is. The torus lies
      // in its own XY plane, so a yaw alone points it out of the limb.
      const out = facing + Math.PI / 2;
      const sx = px + Math.sin(out) * radius * 0.92;
      const sz = pz + Math.cos(out) * radius * 0.92;
      room.geo('meatPale', ring(radius * 0.42, radius * 0.15, 8), tiltMatrix([sx, py + len * 0.45, sz], [0, out, 0]), {
        tile: 0.3,
      });
      room.geo('meatDark', disc(radius * 0.3, 8), poseMatrix([sx, py + len * 0.45, sz], out), NO_SHADOW);
    }
    px = nx;
    py = ny;
    pz = nz;
  }
  room.blockCircle(x, z, 0.22);
}

/** A knot of polyps: nodules budding out of a surface. Fills a dead corner. */
export function polyps(room: Room, x: number, y: number, z: number, spread = 0.5, count = 9, glowing = false): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = Math.sqrt(room.rng()) * spread;
    const size = room.range(0.06, 0.17);
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    room.geo('meatPale', ball(size, 8), tiltMatrix([px, y + size * 0.55, pz], [0, a, 0], [1, 0.8, 1]), { tile: 0.5 });
    if (glowing && room.chance(0.35)) {
      room.geo('lumen', ball(size * 0.42, 6), poseMatrix([px, y + size * 1.1, pz]), NO_SHADOW);
    }
  }
}

/** A swollen organ sac, hanging or resting. Squashed, veined, faintly lit inside. */
export function organSac(room: Room, x: number, y: number, z: number, radius: number, hanging = false): void {
  const yaw = room.range(0, 3);
  room.geo('organ', ball(radius, 12), tiltMatrix([x, y, z], [0, yaw, 0], [1, hanging ? 1.3 : 0.78, 1]), { tile: 1.1 });
  // Lobes rather than one clean ball, and NO translucent film over the top: a
  // caul wrapped round a sac reads as a grey balloon, which is what the first
  // pass of the lung and the ganglion both looked like.
  for (let i = 0; i < 3; i++) {
    const a = yaw + (i / 3) * Math.PI * 2;
    room.geo(
      'organ',
      ball(radius * 0.62, 9),
      tiltMatrix([x + Math.cos(a) * radius * 0.62, y - radius * 0.12, z + Math.sin(a) * radius * 0.62], [0, a, 0], [1, 0.85, 1]),
      { tile: 0.9 },
    );
  }
  // Vessels over the surface.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + room.range(-0.3, 0.3);
    room.geo(
      'vein',
      cyl(0.02, 0.035, radius * 1.9, 5),
      tiltMatrix([x + Math.cos(a) * radius * 0.72, y, z + Math.sin(a) * radius * 0.72], [0.35, a, 0.2]),
      { tile: 0.4 },
    );
  }
  if (hanging) {
    strut(room, 'meatDark', [x, y + radius * 1.2, z], [x, room.ctx.dims.ceilingHeight, z], 0.05, 6);
  }
}

/** Mucus strands hanging from the ceiling. Breaks up a flat overhead plane. */
export function drools(room: Room, x: number, z: number, spread: number, count = 7): void {
  const { ceilingHeight } = room.ctx.dims;
  for (let i = 0; i < count; i++) {
    const px = x + room.range(-spread, spread);
    const pz = z + room.range(-spread, spread);
    const len = room.range(0.3, 1.15);
    room.geo('strand', cyl(0.006, 0.022, len, 4), poseMatrix([px, ceilingHeight - len / 2 - 0.05, pz]), NO_SHADOW);
    if (room.chance(0.4)) room.geo('strand', ball(0.035, 6), poseMatrix([px, ceilingHeight - len - 0.05, pz]), NO_SHADOW);
  }
}

/**
 * A curtain of caul - a sheet of wet membrane hung across a space. Breaks
 * sightlines, which is what makes a room frightening to walk into.
 *
 * Double-sided and faintly self-lit for the same reason the manor's hanging
 * sheets are: a backlit single-sided plane reads as a hole cut in the room.
 */
export function caulCurtain(room: Room, x: number, z: number, width: number, height: number, rotationY = 0): void {
  const { ceilingHeight } = room.ctx.dims;
  const y = ceilingHeight - height / 2 - 0.1;
  room.geo('caul', quad(width, height), poseMatrix([x, y, z], rotationY), NO_SHADOW);
  for (const s of [-width * 0.3, width * 0.3]) {
    const px = x + Math.cos(rotationY) * s;
    const pz = z - Math.sin(rotationY) * s;
    room.geo('caul', quad(width * 0.3, height * 0.94), tiltMatrix([px, y, pz], [0, rotationY, 0.06]), NO_SHADOW);
  }
  // The rail it hangs off: a cord of tendon, sagging.
  room.geo('tendon', cyl(0.035, 0.035, width, 6), tiltMatrix([x, y + height / 2, z], [0, rotationY, Math.PI / 2]), { tile: 0.5 });
}

/** A wall of vertical muscle folds. Turns a flat wall into something breathing. */
export function fleshFolds(room: Room, side: Side, along: number, width = 2.4, count = 6, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.08, cell);
  const [x, , z] = position;
  const { ceilingHeight } = room.ctx.dims;

  for (let i = 0; i < count; i++) {
    const s = -width / 2 + (width * (i + 0.5)) / count;
    const px = x + Math.cos(rotationY) * s;
    const pz = z - Math.sin(rotationY) * s;
    const depth = room.range(0.1, 0.26);
    const h = room.range(ceilingHeight * 0.55, ceilingHeight - 0.25);
    const y = room.range(0, ceilingHeight - h);
    room.geo(
      'meat',
      cyl(depth * 0.8, depth, h, 7),
      tiltMatrix([px - Math.sin(rotationY) * depth * 0.4, y + h / 2, pz - Math.cos(rotationY) * depth * 0.4], [0, 0, room.range(-0.06, 0.06)]),
      { tile: 0.8 },
    );
    if (room.chance(0.4)) {
      room.geo('vein', cyl(0.03, 0.03, h * 0.8, 5), poseMatrix([px - Math.sin(rotationY) * (depth + 0.06), y + h / 2, pz - Math.cos(rotationY) * (depth + 0.06)]), { tile: 0.4 });
    }
  }
}

/* --- calcified ------------------------------------------------------------------- */

/**
 * A rib: one arch of bone springing from the floor, over your head, and back
 * down. Sampled at fifteen segments, because a rib built from five boxes reads
 * as a row of blocks rather than as bone.
 */
export function ribArch(
  room: Room,
  z: number,
  span: number,
  rise: number,
  thickness = 0.2,
  x = 0,
  rotationY = 0,
  material = 'bone',
): void {
  const segments = 15;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  /** `lx` runs across the arch; the arch itself stands at (x, z), turned by rotationY. */
  const at = (lx: number, y: number): Vec3 => [x + lx * cos, y, z - lx * sin];

  let prev = at(-span, 0);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const a = Math.PI * t;
    const next = at(-Math.cos(a) * span, Math.sin(a) * rise);
    const taper = thickness * (0.65 + Math.sin(a) * 0.45);
    strut(room, material, prev, next, taper / 2, 7, { tile: 1.0 });
    prev = next;
  }
  // The heads where it meets the floor: a rib is socketed, not planted.
  for (const s of [-1, 1]) {
    const p = at(s * span, 0.1);
    room.geo('bonePale', ball(thickness * 0.85, 8), poseMatrix(p), { tile: 0.5 });
  }
}

/** A stack of vertebrae: the pack's column. Solid, and it reads at any distance. */
export function vertebrae(room: Room, x: number, z: number, height = 0, radius = 0.3, spined = true): void {
  const h = height || room.ctx.dims.ceilingHeight;
  const count = Math.max(3, Math.round(h / 0.46));
  for (let i = 0; i < count; i++) {
    const y = (h * i) / count;
    const step = h / count;
    const wobble = room.range(-0.035, 0.035);
    room.geo('bone', cyl(radius * 0.78, radius * 0.86, step * 0.58, 12), poseMatrix([x + wobble, y + step * 0.3, z + wobble]), { tile: 0.9 });
    // The disc between two of them - the pale, wet part.
    room.geo('cartilage', cyl(radius * 0.72, radius * 0.72, step * 0.22, 12), poseMatrix([x, y + step * 0.72, z]), { tile: 0.5 });
    if (spined) {
      for (let s = 0; s < 4; s++) {
        const a = (s / 4) * Math.PI * 2 + i * 0.4;
        // A cone points +Y; tipping it a quarter turn and yawing by (90° - a)
        // lays it flat, pointing out along the angle `a`.
        room.geo(
          'bonePale',
          spike(radius * 0.26, radius * 0.95, 6),
          tiltMatrix([x + Math.cos(a) * radius * 0.95, y + step * 0.34, z + Math.sin(a) * radius * 0.95], [Math.PI / 2, Math.PI / 2 - a, 0]),
          { tile: 0.4 },
        );
      }
    }
  }
  room.blockCircle(x, z, radius + 0.1);
}

/**
 * A row of teeth along a wall, growing up from the floor or down from the
 * ceiling. Alternating sizes, because a row of identical cones is a comb.
 */
export function toothRow(
  room: Room,
  side: Side,
  along: number,
  width = 2.6,
  count = 7,
  down = false,
  cell: Cell = [0, 0],
): void {
  const { position, rotationY } = wallPose(room, side, along, 0.32, cell);
  const [x, , z] = position;
  const { ceilingHeight } = room.ctx.dims;

  for (let i = 0; i < count; i++) {
    const s = -width / 2 + (width * (i + 0.5)) / count;
    const px = x + Math.cos(rotationY) * s;
    const pz = z - Math.sin(rotationY) * s;
    const len = (i % 2 === 0 ? room.range(0.42, 0.72) : room.range(0.22, 0.4)) * (down ? 1.2 : 1);
    const r = 0.06 + len * 0.13;
    const tilt = room.range(-0.14, 0.14);
    room.geo(
      'tooth',
      spike(r, len, 7),
      tiltMatrix([px, down ? ceilingHeight - len / 2 : len / 2, pz], [down ? Math.PI : 0, rotationY, tilt]),
      { tile: 0.5 },
    );
    // The gum it is set in.
    room.geo('meat', ball(r * 1.3, 7), tiltMatrix([px, down ? ceilingHeight - 0.04 : 0.04, pz], [0, 0, 0], [1, 0.5, 1]), { tile: 0.4 });
  }
}

/**
 * A slab of bone on vertebral supports: the pack's table. `h` is the top
 * surface, so put item anchors there.
 */
export function boneSlab(room: Room, x: number, z: number, w: number, d: number, h = 0.78, rotationY = 0): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (lx: number, lz: number): Vec3 => [x + lx * cos + lz * sin, 0, z - lx * sin + lz * cos];

  room.box('bone', [w, 0.09, d], [x, h - 0.09, z], rotationY, { tile: 1.4 });
  room.box('bonePale', [w - 0.18, 0.06, d - 0.18], [x, h - 0.15, z], rotationY, { tile: 1.0 });
  for (const lx of [-w / 2 + 0.2, w / 2 - 0.2]) {
    const p = at(lx, 0);
    room.geo('bone', cyl(0.11, 0.16, h - 0.15, 9), poseMatrix([p[0], (h - 0.15) / 2, p[2]]), { tile: 0.6 });
    room.geo('cartilage', cyl(0.13, 0.13, 0.07, 9), poseMatrix([p[0], (h - 0.15) * 0.55, p[2]]), { tile: 0.4 });
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [w / 2 - 0.05, d / 2 - 0.05], rotationY });
}

/**
 * A shelf plate growing out of a wall - a chitin ledge, held on two brackets.
 * Where item spawns go in the calcified zones.
 */
export function chitinShelf(room: Room, side: Side, along: number, y: number, width = 1.3, depth = 0.42, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, depth / 2, cell);
  const [x, , z] = position;
  room.box('chitinPlate', [width, 0.07, depth], [x, y, z], rotationY, { tile: 0.9 });
  room.box('chitinDark', [width + 0.08, 0.04, depth * 0.5], [x, y - 0.05, z], rotationY, { tile: 0.6 });
  for (const s of [-width / 2 + 0.12, width / 2 - 0.12]) {
    const px = x + Math.cos(rotationY) * s - Math.sin(rotationY) * depth * 0.2;
    const pz = z - Math.sin(rotationY) * s - Math.cos(rotationY) * depth * 0.2;
    room.geo('bone', spike(0.07, 0.34, 6), tiltMatrix([px, y - 0.16, pz], [Math.PI, rotationY, 0.5]), { tile: 0.4 });
  }
}

/** Armour plating bolted onto a wall by the body itself. */
export function carapacePlate(room: Room, side: Side, along: number, y: number, width = 1.8, height = 1.2, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.12, cell);
  const [x, , z] = position;
  const rows = 3;
  for (let i = 0; i < rows; i++) {
    const h = height / rows;
    const inset = 0.1 + i * 0.05;
    room.box('chitinPlate', [width - i * 0.16, h * 0.94, inset], [x, y + i * h, z], rotationY, { tile: 1.1 });
    room.box('chitinDark', [width - i * 0.16 + 0.05, 0.045, inset + 0.04], [x, y + i * h + h * 0.94, z], rotationY, { tile: 0.5 });
  }
  for (const s of [-width / 2 + 0.16, 0, width / 2 - 0.16]) {
    const px = x + Math.cos(rotationY) * s - Math.sin(rotationY) * 0.2;
    const pz = z - Math.sin(rotationY) * s - Math.cos(rotationY) * 0.2;
    room.geo('bonePale', ball(0.055, 7), poseMatrix([px, y + height * 0.5, pz]));
  }
}

/** Bone shards, grit and chips of shell. Pure decoration, never a collider. */
export function boneDebris(room: Room, x: number, z: number, radius: number, count = 12): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = Math.sqrt(room.rng()) * radius;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    if (room.chance(0.32)) {
      // A long shard, half buried.
      room.geo(
        'bonePale',
        cyl(room.range(0.025, 0.05), room.range(0.03, 0.06), room.range(0.3, 0.75), 6),
        tiltMatrix([px, room.range(0.03, 0.08), pz], [Math.PI / 2 + room.range(-0.2, 0.2), room.range(0, Math.PI), 0]),
        // NOT `consume` - `cyl()` hands back a CACHE entry, and freeing it here
        // frees a buffer the cache still holds and `clearGeometryCache()` frees
        // again at teardown. Only geometry built at the call site is consumed.
        { tile: 0.4, castShadow: false },
      );
    } else {
      room.box(
        room.chance(0.4) ? 'grit' : 'bonePale',
        [room.range(0.07, 0.2), room.range(0.03, 0.08), room.range(0.06, 0.17)],
        [px, 0.01, pz],
        room.range(0, Math.PI),
        { castShadow: false, tile: 0.4 },
      );
    }
  }
}

/* --- growth ---------------------------------------------------------------------- */

/**
 * A clutch of eggs. Translucent, lit from within, with something curled inside
 * the big ones. Cheap, and it is the fastest way to make a room feel occupied.
 */
export function eggCluster(room: Room, x: number, z: number, count = 6, spread = 0.75): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = Math.sqrt(room.rng()) * spread;
    const size = room.range(0.16, 0.34);
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    room.geo('eggShell', ball(size, 10), tiltMatrix([px, size * 0.92, pz], [room.range(-0.2, 0.2), a, 0], [1, 1.32, 1]), {
      castShadow: false,
      tile: 0.8,
    });
    if (size > 0.24) {
      room.geo('embryo', ball(size * 0.5, 7), tiltMatrix([px, size * 0.85, pz], [0, a, 0], [1.2, 0.8, 1]), NO_SHADOW);
    }
    // The membrane pooling round the base.
    room.geo('caul', cyl(size * 1.15, size * 0.9, 0.06, 9), poseMatrix([px, 0.03, pz]), NO_SHADOW);
  }
  room.blockCircle(x, z, spread * 0.85);
}

/** A cocoon: something wrapped, hanging, and about the size of a person. */
export function cocoon(room: Room, x: number, z: number, length = 1.5, rotationY = 0): void {
  const { ceilingHeight } = room.ctx.dims;
  const top = ceilingHeight - 0.25;
  const y = top - length / 2 - 0.35;
  strut(room, 'strand', [x, top, z], [x, y + length / 2, z], 0.05, 5);
  room.geo('caul', ball(length * 0.28, 10), tiltMatrix([x, y, z], [0, rotationY, 0.1], [1, length / (length * 0.56), 1]), { tile: 1.0 });
  // Bindings, and a shape inside that is not quite hidden.
  for (let i = 0; i < 5; i++) {
    const ty = y - length * 0.35 + length * 0.18 * i;
    room.geo('strand', ring(length * 0.29 * (1 - Math.abs(i - 2) * 0.12), 0.022, 10), tiltMatrix([x, ty, z], [Math.PI / 2, rotationY, 0.1]), NO_SHADOW);
  }
  room.geo('embryo', ball(length * 0.16, 8), tiltMatrix([x, y, z], [0, rotationY, 0.1], [1, 1.9, 1]), NO_SHADOW);
}

/**
 * A bloom of luminous rot: fruiting bodies on stalks with a mat of filaments
 * under them. Free light, and the brightest thing in the pack's dark rooms.
 */
export function sporeBloom(room: Room, x: number, y: number, z: number, spread = 0.7, count = 8): void {
  room.geo('fungus', disc(spread * 1.25, 16), tiltMatrix([x, y + 0.012, z], [-Math.PI / 2, room.range(0, 3), 0]), {
    castShadow: false,
    receiveShadow: false,
    tile: 1.4,
  });
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = Math.sqrt(room.rng()) * spread;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    const stalk = room.range(0.12, 0.4);
    const cap = room.range(0.06, 0.15);
    const lean = room.range(-0.25, 0.25);
    room.geo('meatPale', cyl(cap * 0.3, cap * 0.16, stalk, 6), tiltMatrix([px, y + stalk / 2, pz], [0, a, lean]), { tile: 0.4 });
    room.geo('lumen', ball(cap, 8), tiltMatrix([px + Math.sin(lean) * stalk * 0.5, y + stalk + cap * 0.4, pz], [0, a, 0], [1.35, 0.75, 1.35]), NO_SHADOW);
    room.geo('fungus', ring(cap * 1.1, cap * 0.16, 9), tiltMatrix([px + Math.sin(lean) * stalk * 0.5, y + stalk + cap * 0.2, pz], [Math.PI / 2, a, 0]), NO_SHADOW);
  }
}

/**
 * Hardened secretion running down a surface and pooling: amber, cloudy, with
 * things caught in it. The calcified zones' equivalent of damp.
 */
export function resinFlow(room: Room, side: Side, along: number, y: number, width = 1.0, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.1, cell);
  const [x, , z] = position;
  for (let i = 0; i < 5; i++) {
    const s = room.range(-width / 2, width / 2);
    const px = x + Math.cos(rotationY) * s;
    const pz = z - Math.sin(rotationY) * s;
    const drop = room.range(0.35, y);
    room.geo('resin', cyl(room.range(0.03, 0.07), room.range(0.05, 0.11), drop, 6), poseMatrix([px, y - drop / 2, pz]), {
      tile: 0.5,
      castShadow: false,
    });
    room.geo('resin', ball(room.range(0.06, 0.12), 7), tiltMatrix([px, y - drop, pz], [0, 0, 0], [1, 1.4, 1]), NO_SHADOW);
  }
  // What has already reached the floor.
  room.geo('resin', disc(width * 0.55, 14), tiltMatrix([x - Math.sin(rotationY) * 0.16, 0.022, z - Math.cos(rotationY) * 0.16], [-Math.PI / 2, 0, 0]), {
    castShadow: false,
    receiveShadow: false,
    tile: 1.2,
  });
}

/**
 * An eye set into a surface, from the shared 2x2 atlas. Four variants: two
 * slit-pupilled, two round, all four a different colour, so a wall of them
 * never reads as wallpaper.
 */
export function eyeOn(room: Room, side: Side, along: number, y: number, radius = 0.28, variant = 0, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.02, cell);
  const [x, , z] = position;
  const out = (d: number): Vec3 => [x - Math.sin(rotationY) * d, y, z - Math.cos(rotationY) * d];

  // The eyeball is set BACK into the wall and the iris stands proud of it. Get
  // that the wrong way round - iris inside the sclera sphere - and the eye
  // renders as a black hole, which is exactly what the first pass did.
  room.geo('sclera', ball(radius * 1.15, 12), poseMatrix(out(-radius * 0.55)), { castShadow: false, tile: 0.6 });
  const u = (variant % 2) * 0.5;
  const v = Math.floor((variant % 4) / 2) * 0.5;
  room.geo('iris', subUV(disc(radius, 18), u, v, u + 0.5, v + 0.5), poseMatrix(out(radius * 0.66), rotationY + Math.PI), {
    castShadow: false,
    receiveShadow: false,
    consume: true,
  });
  // Lids, heavy, not quite meeting.
  for (const s of [-1, 1]) {
    const lid = out(radius * 0.15);
    room.geo(
      'meat',
      ball(radius * 1.2, 10),
      tiltMatrix([lid[0], y + s * radius * 0.95, lid[2]], [0, rotationY, 0], [1, 0.42, 1]),
      { tile: 0.5 },
    );
  }
}

/**
 * A gill or vent slit in a wall, breathing warm air. Pure decoration, but it
 * gives a blank calcified wall something to be.
 */
export function gillSlits(room: Room, side: Side, along: number, y: number, count = 4, length = 1.1, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.06, cell);
  const [x, , z] = position;
  for (let i = 0; i < count; i++) {
    const s = -0.5 + i * 0.34;
    const px = x + Math.cos(rotationY) * s;
    const pz = z - Math.sin(rotationY) * s;
    const len = length * room.range(0.75, 1.05);
    room.box('meatDark', [0.1, len, 0.1], [px, y - len / 2, pz], rotationY, { tile: 0.4 });
    room.box('chitinPlate', [0.16, len + 0.1, 0.14], [px - Math.sin(rotationY) * 0.05, y - len / 2 - 0.05, pz - Math.cos(rotationY) * 0.05], rotationY, {
      tile: 0.5,
    });
  }
}
