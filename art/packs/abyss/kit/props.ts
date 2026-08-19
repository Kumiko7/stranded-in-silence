/**
 * Kerberos Deep's fittings kit.
 *
 * These are the pieces that recur across rooms - the things that make a space
 * read as a research station eleven kilometres down, or as the trench that is
 * getting into it. Rooms compose them; almost nothing is modelled twice.
 *
 * **Facing convention.** Every prop is authored facing `-Z`, the same direction
 * shared art faces (docs/art/SHARED_ART.md §2), so one set of wall rotations
 * works for props, chests and lockers alike. `wallPose()` gives you the position
 * and rotation for something bolted to a given wall.
 *
 * **Light convention.** The pack has two real lights per room and the player
 * carries none, so most of what you can see by is emissive: the shell's
 * emergency strip, instrument screens, tank glow, coral, the smokers. Only
 * `cageLamp(..., lit)`, `stripLight(..., lit)`, `tankColumn(..., lit)`,
 * `beacon(..., lit)` and `smokerChimney(..., lit)` ever spend a real one, and
 * they say so in their signature.
 *
 * Everything writes into the room's batcher, so a room can afford a hundred of
 * these and still cost single-digit draw calls.
 */
import * as THREE from 'three';
import { bands, mm, ownGeometryCache, sides } from '../../../lib/build';
import type { Cell, Side } from '../../../lib/contract';
import type { BatchOptions } from '../../../lib/merge';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import type { Room, Vec3 } from '../rooms/common';

/**
 * Anything living inside its own light source. A glowing dome two centimetres
 * from a point light casts a shadow the length of the room, which reads as a
 * black bar across the deck rather than as a lamp.
 */
const NO_SHADOW: BatchOptions = { castShadow: false };
const FLAT: BatchOptions = { castShadow: false, receiveShadow: false };

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
 * (along the prop's own local +X) and `inset` metres out from the plate.
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
export function cyl(rTop: number, rBot: number, h: number, seg = 10, open = false): THREE.CylinderGeometry {
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
export function ball(r: number, seg = 10): THREE.SphereGeometry {
  seg = sides(r, seg);
  const key = `${mm(r)},${seg}`;
  let geo = sphereCache.get(key);
  if (!geo) {
    geo = new THREE.SphereGeometry(mm(r), seg, bands(seg));
    sphereCache.set(key, geo);
  }
  return geo;
}

/**
 * A unit speck: an octahedron, eight triangles, meant to be SCALED by the
 * caller's matrix rather than rebuilt at each size.
 *
 * Both halves of that matter for the things this is for - a millimetre of
 * bioluminescence, a bubble, a mote of silt, of which a map places hundreds.
 * At the fog density they are seen through, an eight-triangle solid and a
 * thirty-triangle sphere are the same pale dot; and because `ball()` keys its
 * cache on the radius, and these radii come out of the seeded RNG, every mote
 * was minting a geometry of its own - 764 of them on this map alone, built and
 * freed on every run. One shared geometry and a scale in the matrix is fewer
 * triangles AND several hundred fewer allocations a load.
 */
const speckCache = new Map<string, THREE.OctahedronGeometry>();
export function speck(): THREE.OctahedronGeometry {
  let geo = speckCache.get('unit');
  if (!geo) {
    geo = new THREE.OctahedronGeometry(1, 0);
    speckCache.set('unit', geo);
  }
  return geo;
}

const coneCache = new Map<string, THREE.ConeGeometry>();
export function spike(r: number, h: number, seg = 7): THREE.ConeGeometry {
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
export function ring(r: number, tube: number, seg = 16): THREE.TorusGeometry {
  seg = sides(r, seg);
  const key = `${mm(r)},${mm(tube)},${seg}`;
  let geo = torusCache.get(key);
  if (!geo) {
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
export function disc(r: number, seg = 20): THREE.CircleGeometry {
  seg = sides(r, seg);
  const key = `${mm(r)},${seg}`;
  let geo = discCache.get(key);
  if (!geo) {
    geo = new THREE.CircleGeometry(mm(r), seg);
    discCache.set(key, geo);
  }
  return geo;
}

for (const cache of [cylCache, sphereCache, speckCache, coneCache, torusCache, planeCache, discCache]) ownGeometryCache(cache);

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
 * A cylinder from one point to another, at any angle. Pipes, cables, struts and
 * kelp stipes all come down to this, and doing it by hand is where a horizontal
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

/* --- animation ------------------------------------------------------------------ */

/**
 * A failing fluorescent circuit: mostly steady, with a stutter that arrives at
 * an interval you cannot quite predict. Deliberately NOT a candle flicker - a
 * gas flame wavers, a dying tube snaps.
 */
export function stutter(room: Room, light: THREE.Light, base: number, depth = 0.55, period = 5.5): void {
  const phase = room.range(0, 20);
  room.tick((t) => {
    const cycle = ((t + phase) % period) / period;
    // One burst of three fast dropouts, then a long clean stretch.
    const burst = cycle < 0.14 ? Math.abs(Math.sin((cycle / 0.14) * Math.PI * 5.5)) : 1;
    const hum = 1 - 0.045 * (0.5 + 0.5 * Math.sin(t * 31 + phase));
    light.intensity = base * hum * (1 - depth * (1 - burst));
  });
}

/**
 * The slow breathing swell of a light seen through water. Everything on the
 * abyss side of the map does this rather than flickering: nothing alive down
 * here has a filament in it.
 */
export function swell(room: Room, light: THREE.Light, base: number, amount = 0.18, speed = 0.55): void {
  const phase = room.range(0, 20);
  room.tick((t) => {
    const wave = Math.sin(t * speed + phase) * 0.7 + Math.sin(t * speed * 1.63 + phase * 1.4) * 0.3;
    light.intensity = base * (1 + wave * amount);
  });
}

/** A slow drift, for anything hanging in water. */
export function sway(room: Room, object: THREE.Object3D, amount: number, speed = 0.4): void {
  const phase = room.range(0, 20);
  const base = object.rotation.z;
  room.tick((t) => {
    object.rotation.z = base + Math.sin(t * speed + phase) * amount;
  });
}

/** A slow vertical bob plus a lazy turn: a jellyfish, a suspended cage, a buoy. */
export function bob(room: Room, object: THREE.Object3D, amount: number, speed = 0.35): void {
  const phase = room.range(0, 20);
  const y = object.position.y;
  room.tick((t) => {
    object.position.y = y + Math.sin(t * speed + phase) * amount;
    object.rotation.y += 0.0016;
  });
}

/* --- station: light fittings ------------------------------------------------------ */

/**
 * A caged bulkhead lamp: the pack's candle. Bracket, glass dome, a cage of bars
 * over it, and a stain on the wall above where it has been running hot for
 * twenty years. `lit` spends one of the room's real lights - without it the lamp
 * still glows, it just does not throw anything.
 */
export function cageLamp(
  room: Room,
  side: Side,
  along: number,
  y: number,
  lit = false,
  cold = false,
  intensity = 9,
  cell: Cell = [0, 0],
): void {
  const { position, rotationY } = wallPose(room, side, along, 0.1, cell);
  const [x, , z] = position;
  const out = (d: number): Vec3 => [x - Math.sin(rotationY) * d, y, z - Math.cos(rotationY) * d];

  // Back plate and the conduit dropping into it.
  room.box('steelDark', [0.24, 0.3, 0.09], [x, y - 0.15, z], rotationY, { tile: 0.4, castShadow: false });
  room.geo('cable', cyl(0.028, 0.028, 0.4, 6), poseMatrix([x, y + 0.32, z]), { tile: 0.3, castShadow: false });

  const head = out(0.2);
  room.geo('steel', cyl(0.11, 0.13, 0.1, 10), poseMatrix([head[0], y, head[2]]), { tile: 0.3, castShadow: false });
  // The dome. Unlit material, so it is a lamp even when nothing is lighting it.
  room.geo(cold ? 'bulbCold' : 'bulb', ball(0.115, 10), tiltMatrix(out(0.29), [0, rotationY, 0], [1, 1, 1.25]), FLAT);
  // The cage: ribs over the dome plus a ring round its waist. This is the whole
  // silhouette - a bare glowing ball reads as a bug, a caged one as a fitting.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const p = out(0.3);
    room.geo(
      'steel',
      cyl(0.012, 0.012, 0.3, 4),
      tiltMatrix([p[0] + Math.cos(a) * 0.1 * Math.cos(rotationY), y + Math.sin(a) * 0.1, p[2] - Math.cos(a) * 0.1 * Math.sin(rotationY)], [Math.PI / 2, rotationY, 0]),
      { tile: 0.2, castShadow: false },
    );
  }
  // A torus lies in its own XY plane, so a yaw alone points its axis out of the
  // wall - which is what makes this a band round the dome rather than a hoop
  // standing on edge beside it.
  room.geo('steel', ring(0.115, 0.012, 10), poseMatrix(out(0.32), rotationY), { tile: 0.2, castShadow: false });

  if (lit) {
    const lamp = new THREE.PointLight(cold ? 0xbfe6ff : 0xffbe74, intensity, room.ctx.dims.cellSize * 1.5, 2);
    const p = out(0.42);
    lamp.position.set(p[0], y, p[2]);
    room.light(lamp);
    stutter(room, lamp, intensity, 0.4, room.range(4.5, 8));
  }
}

/**
 * A recessed ceiling strip: housing, diffuser, end caps. Half the ones in the
 * station are dead, and a room should always have at least one that is - a
 * ceiling where every fitting works does not read as abandoned.
 */
export function stripLight(
  room: Room,
  x: number,
  z: number,
  length = 1.8,
  rotationY = 0,
  lit = false,
  dead = false,
  intensity = 10,
  shadow = true,
): void {
  const { ceilingHeight } = room.ctx.dims;
  const y = ceilingHeight - 0.16;
  room.box('steelDark', [length + 0.2, 0.14, 0.34], [x, y - 0.02, z], rotationY, { tile: 0.6, castShadow: false });
  room.box(dead ? 'plastic' : 'bulbCold', [length, 0.03, 0.2], [x, y - 0.05, z], rotationY, FLAT);
  for (const s of [-1, 1]) {
    const px = x + Math.cos(rotationY) * s * (length / 2 + 0.06);
    const pz = z - Math.sin(rotationY) * s * (length / 2 + 0.06);
    room.box('steel', [0.08, 0.16, 0.36], [px, y - 0.03, pz], rotationY, { tile: 0.3, castShadow: false });
  }

  if (lit && !dead) {
    const lamp = new THREE.PointLight(0xcfe8ff, intensity, room.ctx.dims.cellSize * 1.6, 2);
    lamp.position.set(x, y - 0.22, z);
    // At most one shadow-casting light per room (ROOM_FORMAT.md §7), and rooms
    // are static - so bake the map once and stop paying for it. A room with two
    // lit strips has to pass `shadow: false` on the second.
    lamp.castShadow = shadow;
    if (shadow) {
      lamp.shadow.mapSize.set(512, 512);
      lamp.shadow.autoUpdate = false;
      lamp.shadow.needsUpdate = true;
    }
    room.light(lamp);
    stutter(room, lamp, intensity, 0.32, room.range(6, 11));
  }
}

/**
 * A rotating hazard beacon: amber dome on a bracket, with the mirror inside it
 * still turning. The one piece of the station that is unmistakably still
 * shouting about something.
 */
export function beacon(room: Room, x: number, y: number, z: number, lit = false, intensity = 8, red = false): void {
  room.box('steelDark', [0.24, 0.06, 0.24], [x, y, z], 0, { tile: 0.3, castShadow: false });
  room.geo(red ? 'lumenRed' : 'signAmber', cyl(0.13, 0.15, 0.19, 12), poseMatrix([x, y + 0.16, z]), NO_SHADOW);
  room.geo('steel', cyl(0.16, 0.16, 0.035, 12), poseMatrix([x, y + 0.27, z]), { tile: 0.2, castShadow: false });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    room.geo('steel', cyl(0.012, 0.012, 0.2, 4), poseMatrix([x + Math.cos(a) * 0.145, y + 0.16, z + Math.sin(a) * 0.145]), NO_SHADOW);
  }

  if (lit) {
    const lamp = new THREE.PointLight(red ? 0xff3826 : 0xffa424, intensity, room.ctx.dims.cellSize * 1.4, 2);
    lamp.position.set(x, y + 0.16, z);
    room.light(lamp);
    // A rotating mirror, expressed as intensity: bright as the beam comes past.
    const phase = room.range(0, 6);
    room.tick((t) => {
      const turn = ((t * 0.55 + phase) % 1);
      lamp.intensity = intensity * (0.25 + 0.95 * Math.pow(Math.max(0, Math.sin(turn * Math.PI * 2)), 5));
    });
  }
}

/** An illuminated placard on a wall. Free light, and it tells you a wall is a wall. */
export function wallSign(room: Room, side: Side, along: number, y: number, width = 0.62, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.05, cell);
  const [x, , z] = position;
  room.box('steelDark', [width + 0.06, 0.28, 0.06], [x, y, z], rotationY, { tile: 0.3, castShadow: false });
  room.box('signAmber', [width, 0.2, 0.03], [x - Math.sin(rotationY) * 0.04, y + 0.04, z - Math.cos(rotationY) * 0.04], rotationY, FLAT);
  // Two dark bars across it, so it reads as a legend rather than as a light box.
  for (const dy of [0.09, 0.14]) {
    room.box('steelDark', [width * room.range(0.3, 0.62), 0.022, 0.012], [x - Math.sin(rotationY) * 0.06, y + dy, z - Math.cos(rotationY) * 0.06], rotationY, FLAT);
  }
}

/* --- station: fabric of the place -------------------------------------------------- */

/**
 * A pipe run through a set of points, with a flange at every corner and a hanger
 * strap at intervals. Straight pipe is a rod; the fittings are the whole read.
 */
export function pipeRun(room: Room, points: readonly Vec3[], radius = 0.09, material = 'steel', braced = true): void {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    strut(room, material, a, b, radius, 9, { tile: 0.7, castShadow: false });

    // A pair of flanges at the joint: a pipe changes direction at a fitting.
    const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
    const pitch = Math.acos(Math.min(1, Math.max(-1, (b[1] - a[1]) / Math.max(0.001, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])))));
    for (const t of [0.06, 0.94]) {
      room.geo(
        'steelDark',
        cyl(radius * 1.45, radius * 1.45, 0.06, 10),
        tiltMatrix([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], [pitch, yaw, 0]),
        { tile: 0.3, castShadow: false },
      );
    }
    room.geo('steel', ball(radius * 1.25, 8), poseMatrix(b), { tile: 0.3, castShadow: false });

    if (braced) {
      // Hanger straps, hung off whatever is above the run.
      const steps = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 1.7));
      for (let s = 1; s <= steps; s++) {
        const t = s / (steps + 1);
        const px = a[0] + (b[0] - a[0]) * t;
        const py = a[1] + (b[1] - a[1]) * t;
        const pz = a[2] + (b[2] - a[2]) * t;
        room.box('steelDark', [0.045, 0.28, radius * 2.8], [px, py, pz], yaw, { tile: 0.2, castShadow: false });
      }
    }
  }
}

/** A hand wheel on a valve body, sat in a pipe. The station's punctuation. */
export function valve(room: Room, p: Vec3, radius = 0.19, rotationY = 0, red = false): void {
  room.geo('steelDark', cyl(0.11, 0.13, 0.24, 10), poseMatrix([p[0], p[1], p[2]]), { tile: 0.3, castShadow: false });
  room.geo('steel', cyl(0.045, 0.045, 0.16, 7), poseMatrix([p[0], p[1] + 0.18, p[2]]), { tile: 0.2, castShadow: false });
  room.geo(red ? 'paintedRed' : 'paintedWarn', ring(radius, 0.026, 14), tiltMatrix([p[0], p[1] + 0.26, p[2]], [Math.PI / 2, rotationY, 0]), {
    tile: 0.3,
    castShadow: false,
  });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rotationY;
    room.geo(
      red ? 'paintedRed' : 'paintedWarn',
      cyl(0.018, 0.018, radius * 2, 5),
      tiltMatrix([p[0], p[1] + 0.26, p[2]], [Math.PI / 2, a, 0]),
      { tile: 0.2, castShadow: false },
    );
  }
}

/** A pressure gauge: dial face, bezel, and a needle sitting a long way over. */
export function gauge(room: Room, side: Side, along: number, y: number, radius = 0.12, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.06, cell);
  const [x, , z] = position;
  const out = (d: number): Vec3 => [x - Math.sin(rotationY) * d, y, z - Math.cos(rotationY) * d];
  room.geo('steel', cyl(radius, radius, 0.09, 12), tiltMatrix(out(0.05), [Math.PI / 2, rotationY, 0]), { tile: 0.3, castShadow: false });
  // A plane's front face is +Z, and a prop's own facing is -Z (SHARED_ART.md §2),
  // so anything flat hung on a wall needs the half turn or it faces the plaster.
  room.geo('plastic', disc(radius * 0.86, 14), poseMatrix(out(0.1), rotationY + Math.PI), FLAT);
  // The needle, sitting a long way over. Rolled in the dial's own plane, which a
  // yaw cannot do - that is what `tiltMatrix` is for.
  const swing = room.range(1.1, 2.5);
  const tip = out(0.115);
  room.geo(
    'paintedRed',
    quad(radius * 0.68, 0.014),
    tiltMatrix([tip[0] + Math.cos(rotationY) * Math.cos(swing) * radius * 0.3, y + Math.sin(swing) * radius * 0.3, tip[2] - Math.sin(rotationY) * Math.cos(swing) * radius * 0.3], [0, rotationY + Math.PI, swing]),
    FLAT,
  );
  room.geo('steelDark', cyl(0.014, 0.014, 0.02, 6), tiltMatrix(out(0.12), [Math.PI / 2, rotationY, 0]), FLAT);
  room.geo('steelDark', cyl(0.024, 0.024, 0.12, 6), poseMatrix([x, y - radius - 0.06, z]), { tile: 0.2, castShadow: false });
}

/** A steel work bench: top, apron, undershelf and box legs. `h` is the top surface. */
export function bench(room: Room, x: number, z: number, w: number, d: number, h = 0.92, rotationY = 0): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (lx: number, lz: number): Vec3 => [x + lx * cos + lz * sin, 0, z - lx * sin + lz * cos];

  room.box('steelPale', [w, 0.05, d], [x, h - 0.05, z], rotationY, { tile: 1.2 });
  room.box('steelDark', [w - 0.06, 0.08, d - 0.06], [x, h - 0.13, z], rotationY, { tile: 0.6 });
  // A raised lip along the back edge, which is what a wet bench always has.
  const lip = at(0, -d / 2 + 0.03);
  room.box('steelPale', [w, 0.06, 0.05], [lip[0], h, lip[2]], rotationY, { tile: 0.4 });
  // Undershelf with a few things standing on it, and the legs.
  room.box('steel', [w - 0.2, 0.035, d - 0.14], [x, 0.24, z], rotationY, { tile: 0.8 });
  for (const lx of [-w / 2 + 0.1, w / 2 - 0.1]) {
    for (const lz of [-d / 2 + 0.09, d / 2 - 0.09]) {
      const p = at(lx, lz);
      room.box('steelDark', [0.07, h - 0.13, 0.07], [p[0], 0, p[2]], rotationY, { tile: 0.3 });
    }
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [w / 2 - 0.05, d / 2 - 0.05], rotationY });
}

/** A wall-mounted shelf on folded brackets. Where item spawns live in the station. */
export function shelf(room: Room, side: Side, along: number, y: number, width = 1.3, depth = 0.4, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, depth / 2, cell);
  const [x, , z] = position;
  room.box('steelPale', [width, 0.045, depth], [x, y, z], rotationY, { tile: 0.9 });
  room.box('steelDark', [width, 0.055, 0.035], [x - Math.sin(rotationY) * (depth / 2 - 0.02), y + 0.045, z - Math.cos(rotationY) * (depth / 2 - 0.02)], rotationY, {
    tile: 0.3,
  });
  for (const s of [-width / 2 + 0.13, width / 2 - 0.13]) {
    const px = x + Math.cos(rotationY) * s;
    const pz = z - Math.sin(rotationY) * s;
    // A folded triangular bracket, faked with two boxes and a diagonal.
    room.box('steel', [0.05, 0.24, 0.045], [px + Math.sin(rotationY) * (depth / 2 - 0.04), y - 0.24, pz + Math.cos(rotationY) * (depth / 2 - 0.04)], rotationY, { tile: 0.2 });
    room.geo(
      'steel',
      cyl(0.018, 0.018, depth * 0.95, 5),
      tiltMatrix([px, y - 0.13, pz], [Math.PI / 2 - 0.55, rotationY, 0]),
      { tile: 0.2 },
    );
  }
}

/**
 * A control console: a plinth, a sloped instrument face with screens and rows
 * of switches, and a rail across the top. The station's most legible furniture -
 * a lit console at the far end of a dark room tells you where the room's front
 * is, which is exactly the job a fireplace does in the manor.
 */
export function controlDesk(room: Room, x: number, z: number, width = 1.7, rotationY = 0, live = true): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (lx: number, lz: number, y = 0): Vec3 => [x + lx * cos + lz * sin, y, z - lx * sin + lz * cos];

  room.box('steelDark', [width, 0.72, 0.62], [x, 0, z], rotationY, { tile: 0.9 });
  room.box('steel', [width + 0.06, 0.1, 0.7], [x, 0.72, z], rotationY, { tile: 0.5 });
  room.box('steelDark', [width - 0.1, 0.06, 0.66], [x, 0, z], rotationY, { tile: 0.3 });

  // The sloped face. Tilted about its own long axis so it faces the operator.
  const faceCentre = at(0, -0.06, 0.98);
  room.geo(
    'steel',
    quad(width - 0.1, 0.46),
    tiltMatrix(faceCentre, [-0.85, rotationY + Math.PI, 0]),
    { tile: 0.6, castShadow: false },
  );
  // Screens set into it, and switch banks along the bottom edge.
  for (let i = 0; i < 2; i++) {
    const lx = -width / 4 + i * (width / 2);
    room.geo(
      live && room.chance(0.75) ? (i === 0 ? 'screenData' : 'screenSonar') : 'screenDead',
      quad(width / 2 - 0.22, 0.3),
      tiltMatrix(at(lx, -0.1, 1.0), [-0.85, rotationY + Math.PI, 0]),
      FLAT,
    );
  }
  for (let i = 0; i < 9; i++) {
    const lx = -width / 2 + 0.14 + i * ((width - 0.28) / 8);
    const lit = room.chance(0.4);
    room.geo(
      lit ? (room.chance(0.5) ? 'lumenAmber' : 'lumenTeal') : 'plastic',
      cyl(0.017, 0.017, 0.03, 6),
      tiltMatrix(at(lx, -0.2, 0.83), [Math.PI / 2 - 0.85, rotationY, 0]),
      FLAT,
    );
  }
  // A grab rail across the front, at the height a hand would find it.
  for (const s of [-1, 1]) {
    room.box('steel', [0.05, 0.1, 0.14], [at(s * (width / 2 - 0.12), -0.3)[0], 0.62, at(s * (width / 2 - 0.12), -0.3)[2]], rotationY, { tile: 0.2 });
  }
  room.geo('steel', cyl(0.022, 0.022, width - 0.2, 6), tiltMatrix(at(0, -0.32, 0.72), [0, rotationY, Math.PI / 2]), { tile: 0.3 });

  room.collider({ kind: 'box', center: [x, z], halfExtents: [width / 2 - 0.05, 0.34], rotationY });
}

/** A rack of CRT monitors standing on the floor, cabled into the ceiling. */
export function monitorStack(room: Room, x: number, z: number, rotationY = 0, rows = 3): void {
  room.box('steelDark', [1.0, 0.12, 0.6], [x, 0, z], rotationY, { tile: 0.5 });
  for (let r = 0; r < rows; r++) {
    const y = 0.12 + r * 0.52;
    room.box('plastic', [0.92, 0.48, 0.5], [x, y, z], rotationY, { tile: 0.6 });
    const face = room.chance(0.66) ? (room.chance(0.5) ? 'screenSonar' : 'screenData') : 'screenDead';
    room.geo(face, quad(0.7, 0.34), poseMatrix([x - Math.sin(rotationY) * 0.26, y + 0.25, z - Math.cos(rotationY) * 0.26], rotationY + Math.PI), FLAT);
    room.box('steelDark', [0.78, 0.05, 0.03], [x - Math.sin(rotationY) * 0.27, y + 0.05, z - Math.cos(rotationY) * 0.27], rotationY, FLAT);
  }
  // Uprights and the cable loom coming out of the back.
  for (const s of [-1, 1]) {
    room.box('steel', [0.06, rows * 0.52 + 0.16, 0.06], [x + Math.cos(rotationY) * s * 0.5, 0, z - Math.sin(rotationY) * s * 0.5], rotationY, { tile: 0.3 });
  }
  const backX = x + Math.sin(rotationY) * 0.34;
  const backZ = z + Math.cos(rotationY) * 0.34;
  strut(room, 'cable', [backX, rows * 0.5, backZ], [backX, room.ctx.dims.ceilingHeight - 0.4, backZ], 0.05, 6, NO_SHADOW);
  room.collider({ kind: 'box', center: [x, z], halfExtents: [0.5, 0.3], rotationY });
}

/** A shipping case, stacked or alone. The cheapest way to break up a floor. */
export function crate(room: Room, x: number, z: number, rotationY = 0, w = 0.8, h = 0.6, d = 0.6, stacked = false): void {
  const put = (y: number, sw: number, sh: number, sd: number, spin: number): void => {
    room.box('painted', [sw, sh, sd], [x, y, z], spin, { tile: 0.9 });
    // Ribs and corner castings: a plain box is a plain box.
    for (const t of [-0.28, 0.28]) {
      room.box('steelDark', [sw * 0.06, sh * 0.92, sd + 0.03], [x + Math.cos(spin) * sw * t, y + sh * 0.04, z - Math.sin(spin) * sw * t], spin, { tile: 0.3 });
    }
    room.box('steelPale', [sw + 0.04, 0.045, sd + 0.04], [x, y + sh - 0.045, z], spin, { tile: 0.3 });
    room.box('paintedWarn', [sw * 0.32, 0.1, 0.012], [x - Math.sin(spin) * (sd / 2 + 0.01), y + sh * 0.55, z - Math.cos(spin) * (sd / 2 + 0.01)], spin, FLAT);
  };
  put(0, w, h, d, rotationY);
  if (stacked) put(h, w * 0.86, h * 0.78, d * 0.86, rotationY + room.range(-0.3, 0.3));
  room.collider({ kind: 'box', center: [x, z], halfExtents: [w / 2 - 0.04, d / 2 - 0.04], rotationY });
}

/** A steel drum, upright or on its side. Rust, bung, a stencil band. */
export function drum(room: Room, x: number, z: number, tipped = false): void {
  const r = 0.29;
  const h = 0.86;
  if (tipped) {
    room.geo('rust', cyl(r, r, h, 12), tiltMatrix([x, r, z], [Math.PI / 2, room.range(0, 3), 0]), { tile: 0.8 });
    room.blockCircle(x, z, r + 0.1);
    return;
  }
  room.geo('rust', cyl(r, r, h, 14), poseMatrix([x, h / 2, z]), { tile: 0.8 });
  for (const t of [0.3, 0.7]) {
    room.geo('steelDark', cyl(r * 1.06, r * 1.06, 0.06, 14), poseMatrix([x, h * t, z]), { tile: 0.3 });
  }
  room.geo('paintedWarn', cyl(r * 1.02, r * 1.02, 0.16, 14), poseMatrix([x, h * 0.5, z]), { tile: 0.4 });
  room.geo('steelDark', cyl(0.05, 0.05, 0.04, 7), poseMatrix([x + r * 0.5, h, z]), NO_SHADOW);
  room.blockCircle(x, z, r + 0.05);
}

/**
 * Handrail: top rail, mid rail, stanchions and a toe board. Add a collider only
 * if it is meant to stop you - a rail round a moon pool is, a decorative one
 * along a wall is not.
 */
export function railing(room: Room, from: Vec3, to: Vec3, blocking = true, height = 1.05): void {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  if (length < 0.05) return;
  const yaw = Math.atan2(dx, dz);
  const mid: Vec3 = [(from[0] + to[0]) / 2, 0, (from[2] + to[2]) / 2];

  for (const y of [height, height * 0.52]) {
    room.geo('steel', cyl(0.026, 0.026, length, 7), tiltMatrix([mid[0], y, mid[2]], [Math.PI / 2, yaw, 0]), { tile: 0.4 });
  }
  const posts = Math.max(2, Math.round(length / 1.25));
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    const px = from[0] + dx * t;
    const pz = from[2] + dz * t;
    room.geo('steel', cyl(0.026, 0.03, height, 7), poseMatrix([px, height / 2, pz]), { tile: 0.3 });
    room.geo('steelDark', cyl(0.06, 0.06, 0.03, 8), poseMatrix([px, 0.015, pz]), NO_SHADOW);
  }
  room.box('steelDark', [length, 0.1, 0.03], [mid[0], 0.02, mid[2]], yaw, { tile: 0.3 });

  if (blocking) {
    room.collider({ kind: 'box', center: [mid[0], mid[2]], halfExtents: [length / 2, 0.1], rotationY: yaw });
  }
}

/** A wall ladder up to a hatch that is not there. Vertical interest, no collider. */
export function ladder(room: Room, side: Side, along: number, height = 0, cell: Cell = [0, 0]): void {
  const h = height || room.ctx.dims.ceilingHeight - 0.2;
  const { position, rotationY } = wallPose(room, side, along, 0.24, cell);
  const [x, , z] = position;
  for (const s of [-0.21, 0.21]) {
    const px = x + Math.cos(rotationY) * s;
    const pz = z - Math.sin(rotationY) * s;
    room.geo('steel', cyl(0.026, 0.026, h, 6), poseMatrix([px, h / 2, pz]), { tile: 0.4 });
  }
  const rungs = Math.floor(h / 0.3);
  for (let i = 1; i < rungs; i++) {
    room.geo('steelPale', cyl(0.018, 0.018, 0.42, 5), tiltMatrix([x, i * 0.3, z], [Math.PI / 2, rotationY, Math.PI / 2]), { tile: 0.2 });
  }
  // Stand-off brackets, or it reads as a ladder painted on the wall.
  for (const y of [0.4, h - 0.5]) {
    for (const s of [-0.21, 0.21]) {
      room.box('steelDark', [0.05, 0.06, 0.2], [x + Math.cos(rotationY) * s + Math.sin(rotationY) * 0.12, y, z - Math.sin(rotationY) * s + Math.cos(rotationY) * 0.12], rotationY, FLAT);
    }
  }
}

/**
 * An atmospheric dive suit hanging on its rack: the single best silhouette in
 * the station. Hard shell, jointed limbs ending in claws, and a dome helmet with
 * two dead lamps on it. Read at any distance as a person standing very still,
 * which is the point.
 */
export function diveSuit(room: Room, x: number, z: number, rotationY = 0, lit = false): void {
  const yaw = rotationY;
  const at = (lx: number, y: number, lz: number): Vec3 => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), y, z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

  // The rack it hangs on, and the hoist chain into the ceiling.
  room.geo('steel', cyl(0.05, 0.06, 2.3, 7), poseMatrix([x, 1.15, z]), { tile: 0.4 });
  room.box('steelDark', [0.6, 0.06, 0.1], [x, 2.24, z], yaw, { tile: 0.3 });
  strut(room, 'cable', [x, 2.3, z], [x, room.ctx.dims.ceilingHeight, z], 0.02, 5, NO_SHADOW);

  const front = at(0, 0, -0.16);
  // Torso: a barrel with hoop ribs, hanging clear of the floor.
  room.geo('canvasSuit', cyl(0.29, 0.33, 0.78, 12), poseMatrix([front[0], 1.32, front[2]]), { tile: 0.7 });
  for (const y of [1.06, 1.34, 1.62]) {
    room.geo('steelPale', ring(0.32, 0.028, 12), poseMatrix([front[0], y, front[2]]), { tile: 0.3 });
  }
  // Helmet: a dome with a dark faceplate and two lamp pods. Glass reads by its
  // HIGHLIGHT, so the port is dark and glossy, never emissive.
  room.geo('canvasSuit', cyl(0.24, 0.29, 0.16, 12), poseMatrix([front[0], 1.79, front[2]]), { tile: 0.4 });
  room.geo('steelPale', ball(0.25, 12), poseMatrix([front[0], 1.92, front[2]]), { tile: 0.5 });
  room.geo('glassPane', disc(0.14, 12), poseMatrix(at(0, 1.94, -0.42), yaw + Math.PI), FLAT);
  room.geo('steelDark', ring(0.15, 0.028, 12), poseMatrix(at(0, 1.94, -0.4), yaw), { tile: 0.2, castShadow: false });
  for (const s of [-1, 1]) {
    room.geo('steelDark', cyl(0.05, 0.055, 0.1, 8), tiltMatrix(at(s * 0.22, 2.0, -0.28), [Math.PI / 2, yaw, 0]), { tile: 0.2 });
    room.geo(lit ? 'bulbCold' : 'plastic', disc(0.042, 8), poseMatrix(at(s * 0.22, 2.0, -0.34), yaw + Math.PI), FLAT);
  }
  // Arms: two segments each, ending in a manipulator claw.
  for (const s of [-1, 1]) {
    const shoulder = at(s * 0.3, 1.6, -0.1);
    const elbow = at(s * 0.42, 1.16, -0.24);
    const wrist = at(s * 0.36, 0.78, -0.36);
    strut(room, 'canvasSuit', shoulder, elbow, 0.1, 8, { tile: 0.4 });
    room.geo('steelPale', ball(0.11, 8), poseMatrix(elbow), { tile: 0.3 });
    strut(room, 'canvasSuit', elbow, wrist, 0.085, 8, { tile: 0.4 });
    for (let f = 0; f < 2; f++) {
      strut(room, 'steelDark', wrist, at(s * (0.3 + f * 0.1), 0.58, -0.42 + f * 0.06), 0.022, 5, { tile: 0.2 });
    }
  }
  // Legs, hanging straight, ending in weighted boots.
  for (const s of [-1, 1]) {
    const hip = at(s * 0.15, 0.94, -0.14);
    const foot = at(s * 0.17, 0.24, -0.16);
    strut(room, 'canvasSuit', hip, foot, 0.115, 8, { tile: 0.4 });
    room.geo('steelDark', ball(0.13, 8), tiltMatrix(at(s * 0.17, 0.16, -0.2), [0, yaw, 0], [1, 0.75, 1.4]), { tile: 0.3 });
  }
  room.blockCircle(x, z, 0.42);
}

/**
 * A specimen jar: glass cylinder, sealed lid, fluid, and something suspended in
 * it. The `glow` variant is the wet lab's free light source, and the reason a
 * shelf of these lights a whole bench.
 */
export function specimenJar(room: Room, x: number, y: number, z: number, radius = 0.11, height = 0.3, glowing = false): void {
  /*
   * Eight sides, not twelve.
   *
   * A jar is 22 cm across and there are a hundred and forty of them in a map,
   * behind fog, in a room lit by the jars themselves - the silhouette that
   * reads is the pale shape suspended in the middle, not the profile of the
   * glass. This is the reduction docs/systems/RENDERING.md keeps finding:
   * segment counts on small round things there are a great many of.
   */
  /**
   * The fluid is BACK-FACED, so it is the far wall of the jar rather than a
   * cylinder wrapped round everything in it. Front-faced, the specimen inside
   * is behind an opaque tube and the jar is a glowing can.
   */
  room.geo(glowing ? 'tankGlow' : 'tankFluid', cyl(radius * 0.92, radius * 0.92, height * 0.84, 8), poseMatrix([x, y + height * 0.45, z]), NO_SHADOW);
  // What is in it: a pale coiled shape, never quite resolved.
  room.geo('canvasPale', ball(radius * 0.42, 6), tiltMatrix([x, y + height * 0.45, z], [0, room.range(0, 3), 0], [1, 1.6, 0.7]), NO_SHADOW);
  room.geo('glassPane', cyl(radius, radius, height, 8, true), poseMatrix([x, y + height / 2, z]), FLAT);
  /**
   * One collar, at the top, and no foot ring under the glass.
   *
   * The foot was a disc the same colour as the shelf it stood on, under a jar
   * that already has an opaque lid to end on - it was invisible in every shot
   * and it was a fifth of the jar. A hundred and forty of these stand in a map
   * and the archive alone holds ninety-six, which makes this the one prop in
   * the pack where a piece nobody can see is worth two thousand triangles.
   */
  room.geo('steelPale', cyl(radius * 1.08, radius * 1.02, 0.05, 8), poseMatrix([x, y + height, z]), { tile: 0.2, castShadow: false });
}

/**
 * A cryo pod: an upright coffin of steel and frosted glass, rimed over, with the
 * occupant's outline just readable through it. `open` leaves the door swung
 * back and the pod empty, which is far more frightening than a full one.
 */
export function cryoPod(room: Room, x: number, z: number, rotationY = 0, lit = false, open = false): void {
  const yaw = rotationY;
  const at = (lx: number, y: number, lz: number): Vec3 => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), y, z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

  // The shell: a rounded-back cabinet with a plinth of machinery under it.
  room.box('steelPale', [0.94, 2.1, 0.62], [x, 0.18, z], yaw, { tile: 0.9 });
  room.box('steelDark', [1.02, 0.2, 0.7], [x, 0, z], yaw, { tile: 0.4 });
  room.box('steelDark', [1.0, 0.14, 0.68], [x, 2.28, z], yaw, { tile: 0.4 });
  room.geo('steelPale', cyl(0.31, 0.31, 0.94, 10, true), tiltMatrix(at(0, 1.2, 0.3), [0, yaw, Math.PI / 2]), { tile: 0.6 });

  // The window and what is behind it. The fog inside is emissive; the glass is
  // not - a glowing faceplate is a lamp, not a window (ROOM_REVIEW.md §4).
  const face = at(0, 1.24, -0.3);
  room.geo('frost', quad(0.6, 1.42), poseMatrix([face[0], face[1], face[2]], yaw + Math.PI), NO_SHADOW);
  if (!open) {
    room.geo(lit ? 'lumenCyan' : 'waterDeep', quad(0.52, 1.34), poseMatrix(at(0, 1.24, -0.28), yaw + Math.PI), FLAT);
    // The occupant: a head and a shoulder line, no more. Anything more specific
    // resolves into a mannequin and stops being frightening.
    room.geo('canvasPale', ball(0.11, 8), poseMatrix(at(0, 1.66, -0.2)), NO_SHADOW);
    room.geo('canvasPale', ball(0.2, 8), tiltMatrix(at(0, 1.28, -0.18), [0, yaw, 0], [1.5, 1.7, 0.6]), NO_SHADOW);
  }
  room.geo('glassPane', quad(0.58, 1.4), poseMatrix(at(0, 1.24, -0.33), yaw + Math.PI), FLAT);
  room.box('steelDark', [0.66, 0.06, 0.05], [at(0, 0, -0.33)[0], 0.5, at(0, 0, -0.33)[2]], yaw, { tile: 0.2 });
  room.box('steelDark', [0.66, 0.06, 0.05], [at(0, 0, -0.33)[0], 1.98, at(0, 0, -0.33)[2]], yaw, { tile: 0.2 });

  if (open) {
    // The door, swung wide, with its hinge stack showing.
    const hinge = at(0.5, 0, -0.28);
    room.box('steelPale', [0.7, 1.9, 0.09], [hinge[0] + Math.cos(yaw + 1.2) * 0.35, 0.36, hinge[2] - Math.sin(yaw + 1.2) * 0.35], yaw + 1.2, { tile: 0.7 });
    room.blockCircle(hinge[0] + Math.cos(yaw + 1.2) * 0.35, hinge[2] - Math.sin(yaw + 1.2) * 0.35, 0.3);
  }

  // The readout panel beside the window: the only part of this that is cheerful.
  room.geo(lit ? 'screenData' : 'screenDead', quad(0.2, 0.16), poseMatrix(at(-0.35, 1.86, -0.32), yaw + Math.PI), FLAT);
  for (let i = 0; i < 3; i++) {
    room.geo(lit && room.chance(0.6) ? 'lumenTeal' : 'plastic', cyl(0.014, 0.014, 0.02, 6), tiltMatrix(at(-0.35 + i * 0.05, 1.7, -0.32), [Math.PI / 2, yaw, 0]), FLAT);
  }
  // Rime creeping out onto the deck. Translucent: an opaque pale disc lying
  // flat on a floor reads as spilt paint, not as ice.
  room.geo('rime', disc(0.52, 14), tiltMatrix([x, 0.014, z], [-Math.PI / 2, 0, 0]), FLAT);

  room.collider({ kind: 'box', center: [x, z], halfExtents: [0.48, 0.33], rotationY: yaw });
}

/**
 * A free-standing cylindrical display tank: base, acrylic column, capping ring,
 * water, and whatever is being kept in it. The signature furniture of the
 * aquarium side of the map, and the one prop that lights a whole room by itself.
 */
export function tankColumn(
  room: Room,
  x: number,
  z: number,
  radius = 0.7,
  height = 2.4,
  lit = false,
  content: 'kelp' | 'jelly' | 'coral' | 'empty' | 'specimen' = 'jelly',
  intensity = 11,
): void {
  room.geo('steelDark', cyl(radius * 1.16, radius * 1.24, 0.3, 16), poseMatrix([x, 0.15, z]), { tile: 0.6 });
  // A torus lies in its own XY plane: laying one flat on the floor takes a
  // quarter turn about X, and a bare `poseMatrix` leaves it standing on edge.
  room.geo('steel', ring(radius * 1.1, 0.05, 18), tiltMatrix([x, 0.32, z], [Math.PI / 2, 0, 0]), { tile: 0.3, castShadow: false });

  // The water column: unlit, mapped, and back-faced, so it sits BEHIND whatever
  // is floating in the tank instead of sealing it into an opaque teal drum.
  room.geo('tankFluid', cyl(radius * 0.93, radius * 0.93, height - 0.42, 16), poseMatrix([x, 0.3 + (height - 0.42) / 2, z]), NO_SHADOW);

  if (content === 'kelp') {
    for (let i = 0; i < 7; i++) {
      const a = room.range(0, Math.PI * 2);
      const r = Math.sqrt(room.rng()) * radius * 0.6;
      const h = room.range(height * 0.5, height * 0.86);
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      room.geo('kelp', cyl(0.02, 0.035, h, 5), tiltMatrix([px, 0.3 + h / 2, pz], [0, a, room.range(-0.12, 0.12)]), NO_SHADOW);
      for (let b = 0; b < 4; b++) {
        room.geo('kelpPale', quad(room.range(0.16, 0.34), 0.08), tiltMatrix([px, 0.5 + b * (h / 4.4), pz], [room.range(-0.4, 0.4), room.range(0, 3), room.range(-0.5, 0.5)]), FLAT);
      }
    }
  } else if (content === 'jelly') {
    for (let i = 0; i < 5; i++) {
      const a = room.range(0, Math.PI * 2);
      const r = Math.sqrt(room.rng()) * radius * 0.5;
      jelly(room, x + Math.cos(a) * r, room.range(0.7, height - 0.5), z + Math.sin(a) * r, room.range(0.1, 0.2));
    }
  } else if (content === 'coral') {
    coralHead(room, x, 0.32, z, radius * 0.8);
  } else if (content === 'specimen') {
    // One large thing, curled, occupying most of the tank. Pale, and never quite
    // resolving into an animal you could name.
    room.geo('canvasPale', ball(radius * 0.62, 12), tiltMatrix([x, height * 0.5, z], [0.2, room.range(0, 3), 0], [1, 1.25, 0.72]), NO_SHADOW);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      strut(
        room,
        'canvasPale',
        [x + Math.cos(a) * radius * 0.4, height * 0.42, z + Math.sin(a) * radius * 0.4],
        [x + Math.cos(a) * radius * 0.72, height * 0.2 + room.range(0, 0.4), z + Math.sin(a) * radius * 0.72],
        0.035,
        5,
        NO_SHADOW,
      );
    }
  }

  // The acrylic, then the cap. Open-ended cylinder so you see through both walls.
  room.geo('glassPane', cyl(radius, radius, height - 0.3, 20, true), poseMatrix([x, 0.3 + (height - 0.3) / 2, z]), FLAT);
  room.geo('glassEdge', ring(radius, 0.035, 20), tiltMatrix([x, 0.33, z], [Math.PI / 2, 0, 0]), { tile: 0.3, castShadow: false });
  room.geo('steel', cyl(radius * 1.1, radius * 1.04, 0.16, 18), poseMatrix([x, height - 0.08, z]), { tile: 0.4, castShadow: false });
  room.geo('steelDark', cyl(0.06, 0.06, room.ctx.dims.ceilingHeight - height, 8), poseMatrix([x, height + (room.ctx.dims.ceilingHeight - height) / 2, z]), NO_SHADOW);

  if (lit) {
    const lamp = new THREE.PointLight(content === 'kelp' ? 0x7ce098 : 0x40d0f0, intensity, room.ctx.dims.cellSize * 1.6, 2);
    // BESIDE the water column, not inside it: a lamp buried in a lit volume
    // lights the inside of a cylinder and nothing else (ROOM_REVIEW.md §4).
    lamp.position.set(x + radius * 1.4, height * 0.66, z);
    room.light(lamp);
    swell(room, lamp, intensity, 0.14, 0.5);
  }
  room.blockCircle(x, z, radius + 0.12);
}

/** Standing water on a deck: dark, nearly a mirror, with a tide line round it. */
export function puddle(room: Room, x: number, z: number, radius = 0.8): void {
  room.geo('puddle', disc(radius, 18), tiltMatrix([x, 0.014, z], [-Math.PI / 2, room.range(0, 3), 0]), FLAT);
  room.geo('surface.algae', ring(radius, 0.05, 20), tiltMatrix([x, 0.02, z], [Math.PI / 2, 0, 0]), { tile: 0.5, castShadow: false });
  for (let i = 0; i < 3; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = radius * room.range(0.9, 1.3);
    room.geo('puddle', disc(radius * room.range(0.15, 0.32), 10), tiltMatrix([x + Math.cos(a) * r, 0.013, z + Math.sin(a) * r], [-Math.PI / 2, 0, 0]), FLAT);
  }
}

/** A patch of caustic light on the deck, thrown by water somewhere above it. */
export function causticPatch(room: Room, x: number, z: number, radius = 1.4, y = 0.02): void {
  room.geo('surface.caustic', disc(radius, 20), tiltMatrix([x, y, z], [-Math.PI / 2, room.range(0, 3), 0]), {
    ...FLAT,
    tile: 3.4,
  });
}

/** A floor drain: a recessed grating in a shallow dish. Wet rooms all have one. */
export function drain(room: Room, x: number, z: number, radius = 0.24): void {
  room.geo('steelDark', cyl(radius * 1.3, radius * 1.4, 0.04, 12), poseMatrix([x, 0.02, z]), NO_SHADOW);
  for (let i = 0; i < 5; i++) {
    room.box('steel', [radius * 2, 0.02, 0.035], [x, 0.03, z - radius + (i + 0.5) * (radius / 2.5)], 0, FLAT);
  }
  room.geo('puddle', disc(radius * 1.7, 12), tiltMatrix([x, 0.012, z], [-Math.PI / 2, 0, 0]), FLAT);
}

/** A drip line from the ceiling, with the puddle it has made. Cheap, and unnerving. */
export function dripLine(room: Room, x: number, z: number): void {
  const { ceilingHeight } = room.ctx.dims;
  const len = room.range(0.5, 1.6);
  room.geo('puddle', cyl(0.006, 0.004, len, 4), poseMatrix([x, ceilingHeight - len / 2 - 0.12, z]), FLAT);
  room.geo('puddle', ball(0.028, 6), poseMatrix([x, ceilingHeight - len - 0.12, z]), FLAT);
  room.geo('surface.algae', disc(room.range(0.14, 0.3), 10), tiltMatrix([x, 0.013, z], [-Math.PI / 2, 0, 0]), FLAT);
}

/** Small debris: shed bolts, broken tile, a dropped tool. Never a collider. */
export function debris(room: Room, x: number, z: number, radius: number, count = 10): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = Math.sqrt(room.rng()) * radius;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    if (room.chance(0.3)) {
      room.geo(
        'steelDark',
        cyl(room.range(0.015, 0.03), room.range(0.02, 0.04), room.range(0.16, 0.5), 5),
        tiltMatrix([px, room.range(0.02, 0.05), pz], [Math.PI / 2 + room.range(-0.15, 0.15), room.range(0, Math.PI), 0]),
        // NOT `consume` - `cyl()` hands back a CACHE entry, and freeing it here
        // frees a buffer the cache still holds and `clearGeometryCache()` frees
        // again at teardown. Only geometry built at the call site is consumed.
        { tile: 0.3, ...FLAT },
      );
    } else {
      room.box(
        room.chance(0.45) ? 'rust' : 'steelPale',
        [room.range(0.06, 0.2), room.range(0.02, 0.06), room.range(0.05, 0.16)],
        [px, 0.008, pz],
        room.range(0, Math.PI),
        { ...FLAT, tile: 0.4 },
      );
    }
  }
}

/* --- the abyss ------------------------------------------------------------------- */

/** A boulder of pillow basalt, half sunk in silt. Blocks, and breaks a sightline. */
export function boulder(room: Room, x: number, z: number, radius = 0.7, tall = 0.8): void {
  room.geo('rockDark', ball(radius, 9), tiltMatrix([x, radius * tall * 0.62, z], [room.range(-0.2, 0.2), room.range(0, 3), room.range(-0.2, 0.2)], [1.2, tall, 1.05]), {
    tile: 1.1,
  });
  for (let i = 0; i < 3; i++) {
    const a = room.range(0, Math.PI * 2);
    room.geo(
      'rockPale',
      ball(radius * room.range(0.3, 0.55), 7),
      tiltMatrix([x + Math.cos(a) * radius * 0.7, radius * tall * 0.4, z + Math.sin(a) * radius * 0.7], [0, a, 0], [1.1, 0.7, 1]),
      { tile: 0.8 },
    );
  }
  // A skirt of settled silt round the base: nothing down here sits ON the floor.
  // Kept tight to the rock - a wide one is a pale disc, not a drift.
  room.geo('sandPale', cyl(radius * 1.08, radius * 1.24, 0.08, 12), poseMatrix([x, 0.035, z]), { tile: 0.8, castShadow: false });
  room.blockCircle(x, z, radius * 0.95);
}

/** A drift of silt: a soft mound, no collider, for softening a hard floor edge. */
export function siltDrift(room: Room, x: number, z: number, radius = 1.0): void {
  room.geo('sandPale', ball(radius, 12), tiltMatrix([x, -radius * 0.62, z], [0, room.range(0, 3), 0], [1.3, 0.86, 1.1]), {
    tile: 1.2,
    castShadow: false,
  });
  for (let i = 0; i < 4; i++) {
    const a = room.range(0, Math.PI * 2);
    room.geo('shellWhite', ball(room.range(0.03, 0.07), 6), tiltMatrix([x + Math.cos(a) * radius * 0.7, 0.02, z + Math.sin(a) * radius * 0.7], [0, a, 0], [1.6, 0.4, 1]), FLAT);
  }
}

/**
 * A head of cold-water coral: a dead white skeleton with living polyps on the
 * growing tips. Built as two generations of branches, which is the least that
 * reads as coral rather than as a bundle of sticks.
 */
export function coralHead(room: Room, x: number, y: number, z: number, scale = 0.8, warm = false): void {
  const tips: Vec3[] = [];
  const trunk = scale * room.range(0.28, 0.42);
  room.geo('coralDead', cyl(scale * 0.09, scale * 0.16, trunk, 7), poseMatrix([x, y + trunk / 2, z]), { tile: 0.5 });

  const arms = 4;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + room.range(-0.3, 0.3);
    const len = scale * room.range(0.4, 0.72);
    const lean = room.range(0.5, 1.0);
    const bx = x + Math.cos(a) * len * Math.sin(lean);
    const bz = z + Math.sin(a) * len * Math.sin(lean);
    const by = y + trunk + len * Math.cos(lean) * 0.9;
    strut(room, 'coralDead', [x, y + trunk, z], [bx, by, bz], scale * 0.055, 6, { tile: 0.4 }, true);

    for (let b = 0; b < 2; b++) {
      const a2 = a + room.range(-1.1, 1.1);
      const len2 = len * room.range(0.35, 0.6);
      const lean2 = lean * room.range(0.4, 0.8);
      const cx = bx + Math.cos(a2) * len2 * Math.sin(lean2);
      const cz = bz + Math.sin(a2) * len2 * Math.sin(lean2);
      const cy = by + len2 * Math.cos(lean2);
      strut(room, 'coralDead', [bx, by, bz], [cx, cy, cz], scale * 0.038, 5, { tile: 0.3 }, true);
      tips.push([cx, cy, cz]);
    }
  }
  // The living tips. Emissive, so a reef lights its own corner for free.
  for (const tip of tips) {
    room.geo(warm ? 'coralPink' : 'coralBlue', ball(scale * room.range(0.045, 0.085), 6), poseMatrix(tip), NO_SHADOW);
  }
  room.geo('surface.crust', cyl(scale * 0.4, scale * 0.5, 0.07, 8), poseMatrix([x, y + 0.02, z]), { tile: 0.5, castShadow: false });
}

/**
 * A stand of kelp. Stipes with blades hung off them, all double-sided and
 * faintly self-lit so a lamp behind the stand glows through instead of turning
 * every blade into a hole cut in the water.
 */
export function kelpStand(room: Room, x: number, z: number, count = 6, height = 2.2, spread = 0.7): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = Math.sqrt(room.rng()) * spread;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    const h = height * room.range(0.68, 1.08);
    const lean = room.range(-0.18, 0.18);
    room.geo('kelp', cyl(0.022, 0.045, h, 5), tiltMatrix([px, h / 2, pz], [0, a, lean]), { tile: 0.5, castShadow: false });
    // A holdfast: kelp grips, it does not stand in sand.
    room.geo('coralDead', ball(0.09, 7), tiltMatrix([px, 0.04, pz], [0, a, 0], [1.3, 0.5, 1.3]), { tile: 0.3, castShadow: false });
    const blades = Math.round(h * 2.4);
    for (let b = 0; b < blades; b++) {
      const by = 0.25 + (h - 0.35) * (b / blades);
      const side = b % 2 ? 1 : -1;
      room.geo(
        b % 3 === 0 ? 'kelpPale' : 'kelp',
        quad(room.range(0.32, 0.7), room.range(0.09, 0.17)),
        tiltMatrix(
          [px + Math.sin(lean) * by + side * 0.16, by, pz + side * 0.05],
          [room.range(-0.3, 0.3), a + side * room.range(0.4, 1.1), room.range(-0.55, 0.55)],
        ),
        FLAT,
      );
    }
  }
}

/** A cluster of anemones: a fleshy column with a crown of tentacles. */
export function anemones(room: Room, x: number, y: number, z: number, count = 4, spread = 0.5): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = Math.sqrt(room.rng()) * spread;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    const size = room.range(0.09, 0.2);
    room.geo('anemone', cyl(size * 0.8, size * 0.55, size * 1.5, 8), poseMatrix([px, y + size * 0.75, pz]), { tile: 0.3, castShadow: false });
    room.geo('anemone', disc(size * 0.95, 10), tiltMatrix([px, y + size * 1.52, pz], [-Math.PI / 2, 0, 0]), FLAT);
    for (let t = 0; t < 6; t++) {
      const ta = (t / 6) * Math.PI * 2;
      room.geo(
        'anemone',
        cyl(0.008, 0.015, size * 0.9, 4),
        tiltMatrix([px + Math.cos(ta) * size * 0.8, y + size * 1.8, pz + Math.sin(ta) * size * 0.8], [room.range(0.2, 0.7), ta, 0]),
        FLAT,
      );
    }
  }
}

/** Riftia: white tubes in a bundle, each with a blood-red plume out of the top. */
export function tubeWorms(room: Room, x: number, z: number, count = 9, spread = 0.5, scale = 1): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = Math.sqrt(room.rng()) * spread;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    const h = scale * room.range(0.35, 1.1);
    const lean = room.range(-0.22, 0.22);
    // Open-ended: the bottom cap is in the floor and the top one is inside the
    // plume, so a closed tube pays for two discs nothing ever sees.
    room.geo('wormTube', cyl(0.03 * scale, 0.05 * scale, h, 6, true), tiltMatrix([px, h / 2, pz], [0, a, lean]), { tile: 0.4, castShadow: false });
    /**
     * Growth bands down the tube, as a six-sided COLLAR rather than a torus.
     *
     * `ring()` is a 6 x 7 torus - 84 triangles for an 8 mm band, wrapped round a
     * tube that has six sides itself. Three per worm and a few hundred worms in
     * a map made `tubeWorms` 15% of the whole pack's geometry, three quarters of
     * it in these bands. A sleeve is 24 triangles, matches the facets it sits
     * on, and follows the tube's lean rather than approximating it.
     */
    for (let b = 1; b < 3; b++) {
      const f = b / 3;
      // The tube tapers 0.05 -> 0.03 up its length, so a band of one fixed
      // radius is buried at the bottom and floating at the top. Track it.
      const r = (0.05 - 0.02 * f + 0.006) * scale;
      room.geo('shellWhite', cyl(r, r, 0.022 * scale, 6, true), tiltMatrix([px + Math.sin(lean) * h * f, h * f, pz], [0, a, lean]), FLAT);
    }
    room.geo('wormPlume', ball(0.055 * scale, 7), tiltMatrix([px + Math.sin(lean) * h, h + 0.05 * scale, pz], [0, a, lean], [1, 1.7, 1]), NO_SHADOW);
  }
}

/** A sea urchin: a dark test bristling with spines. Reads instantly, costs little. */
export function urchin(room: Room, x: number, y: number, z: number, radius = 0.14): void {
  room.geo('urchin', ball(radius, 8), tiltMatrix([x, y + radius * 0.8, z], [0, 0, 0], [1, 0.8, 1]), { tile: 0.3, castShadow: false });
  for (let i = 0; i < 14; i++) {
    const a = room.range(0, Math.PI * 2);
    const p = room.range(0.1, 1.35);
    const len = radius * room.range(1.3, 2.4);
    room.geo(
      'urchin',
      cyl(0.006, 0.014, len, 4),
      tiltMatrix(
        [x + Math.cos(a) * Math.sin(p) * radius, y + radius * 0.8 + Math.cos(p) * radius * 0.8, z + Math.sin(a) * Math.sin(p) * radius],
        [p, Math.PI / 2 - a, 0],
      ),
      FLAT,
    );
  }
}

/** A jellyfish: a translucent bell with an oral arm bundle and trailing threads. */
export function jelly(room: Room, x: number, y: number, z: number, radius = 0.2): void {
  /*
   * Eight segments on the bell and eight on the trail ring, down from twelve
   * and fourteen. The bell was 120 triangles for a 20 cm dome and the ring 168
   * for a band a centimetre thick - and this is the softest, most translucent,
   * most out-of-focus thing in the map. Halved, it is 44 % of a jellyfish and
   * there are eight hundred of them.
   */
  room.geo('jellyBell', ball(radius, 8), tiltMatrix([x, y, z], [0, room.range(0, 3), 0], [1, 0.78, 1]), FLAT);
  room.geo('jellyTrail', ring(radius * 0.96, radius * 0.06, 8), tiltMatrix([x, y - radius * 0.5, z], [Math.PI / 2, 0, 0]), FLAT);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + room.range(-0.3, 0.3);
    room.geo(
      'jellyBell',
      quad(radius * 0.3, radius * room.range(1.6, 2.6)),
      tiltMatrix([x + Math.cos(a) * radius * 0.25, y - radius * 1.3, z + Math.sin(a) * radius * 0.25], [room.range(-0.15, 0.15), a, room.range(-0.2, 0.2)]),
      FLAT,
    );
  }
  // Four threads, not seven, and each is an open three-sided tube: a 4 mm
  // filament seen through fog has no ends and there are eight hundred of these.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    room.geo(
      'jellyTrail',
      cyl(0.005, 0.005, radius * room.range(2.5, 5), 3, true),
      tiltMatrix([x + Math.cos(a) * radius * 0.88, y - radius * 1.9, z + Math.sin(a) * radius * 0.88], [room.range(-0.1, 0.1), a, room.range(-0.12, 0.12)]),
      FLAT,
    );
  }
}

/**
 * A hydrothermal chimney: a stack of sulphide with a plume coming off the top,
 * worms round the base and the vent itself glowing orange at the mouth. `lit`
 * spends a real light, and it is worth it - this is the only warm thing in the
 * abyss zone.
 */
export function smokerChimney(room: Room, x: number, z: number, height = 2.0, lit = false, intensity = 10): void {
  const { ceilingHeight } = room.ctx.dims;
  const segments = 5;
  let r = 0.42;
  for (let i = 0; i < segments; i++) {
    const h = height / segments;
    const next = r * room.range(0.72, 0.88);
    room.geo('rockDark', cyl(next, r, h * 1.06, 9), tiltMatrix([x + room.range(-0.04, 0.04), h * (i + 0.5), z + room.range(-0.04, 0.04)], [0, room.range(0, 3), 0]), {
      tile: 0.7,
    });
    // Flanges of collapsed sulphide, which is what makes a chimney read as grown.
    if (i % 2 === 0) {
      room.geo('rockPale', ring(r * 1.25, r * 0.2, 10), tiltMatrix([x, h * (i + 0.9), z], [Math.PI / 2, room.range(0, 3), 0]), { tile: 0.4 });
    }
    r = next;
  }
  // The mouth, and the black smoke above it.
  room.geo('ember', cyl(r * 0.8, r * 0.8, 0.08, 9), poseMatrix([x, height, z]), FLAT);
  // Three balls of smoke, not five, each a size up: the plume is the softest
  // thing in the room and it is read as a column, not as a chain.
  for (let i = 0; i < 3; i++) {
    const t = i / 3;
    room.geo(
      'smokePlume',
      ball(0.3 + t * 0.62, 8),
      tiltMatrix([x + room.range(-0.2, 0.2) + t * 0.3, height + 0.25 + t * (ceilingHeight - height - 0.3), z + room.range(-0.2, 0.2)], [0, t * 3, 0], [1, 1.3, 1]),
      FLAT,
    );
  }
  tubeWorms(room, x + room.range(-0.4, 0.4), z + room.range(-0.4, 0.4), 7, r + 0.5, 0.9);
  room.blockCircle(x, z, 0.5);

  if (lit) {
    /**
     * The lamp sits OUT to one side of the stack and two thirds of the way up,
     * not in the mouth. Inside its own chimney it lit a cone of rock and the
     * stack itself stayed a black column from every doorway; out here it rims
     * the flanges and throws the whole thing's shadow across the floor - which
     * is the "light inside its own mesh" note in docs/art/ROOM_REVIEW.md §4.
     */
    const lamp = new THREE.PointLight(0xff7a2a, intensity, room.ctx.dims.cellSize * 1.5, 2);
    lamp.position.set(x + 0.62, height * 0.66, z + 0.4);
    room.light(lamp);
    swell(room, lamp, intensity, 0.24, 0.8);
  }
}

/** Rising bubbles: a column of small unlit spheres, thinning as they go up. */
export function bubbleColumn(room: Room, x: number, z: number, from = 0, to = 0, count = 16): void {
  const top = to || room.ctx.dims.ceilingHeight - 0.2;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const y = from + (top - from) * t;
    const spread = 0.05 + t * 0.4;
    // Small. At four centimetres they read as ping-pong balls hanging in the
    // room rather than as bubbles going up through water.
    room.geo(
      'jellyTrail',
      ball(room.range(0.008, 0.021) * (1 + t), 6),
      poseMatrix([x + room.range(-spread, spread), y, z + room.range(-spread, spread)]),
      FLAT,
    );
  }
}

/**
 * A thread of sediment falling out of a crack overhead and piling up under it.
 * Two crossed sheets of faint haze plus a cone of silt: the abyss's version of
 * a shaft of dust in a sunbeam, and the cheapest way to give a rock ceiling a
 * reason to be looked at.
 */
export function siltFall(room: Room, x: number, z: number, from = 0): void {
  const top = from || room.ctx.dims.ceilingHeight - 0.15;
  // One sheet, not a crossed pair: two overlapping translucent quads double the
  // density wherever they cross and the thread reads as a solid pale post.
  room.geo('waterHaze', quad(0.14, top - 0.1), tiltMatrix([x, top / 2, z], [0, room.range(0, 3), 0]), FLAT);
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    room.geo(
      'sandPale',
      ball(room.range(0.012, 0.03), 5),
      poseMatrix([x + room.range(-0.06, 0.06) * (1 + t * 3), top * (1 - t), z + room.range(-0.06, 0.06) * (1 + t * 3)]),
      FLAT,
    );
  }
  room.geo('sandPale', cyl(0.28, 0.02, 0.16, 10), poseMatrix([x, 0.08, z]), { tile: 0.5, castShadow: false });
}

/** Marine snow and bioluminescent motes hanging in the water. Free, and lovely. */
export function bioMotes(room: Room, x: number, y: number, z: number, spread = 1.2, count = 22, warm = false): void {
  for (let i = 0; i < count; i++) {
    // Drawn in this order on purpose: colour, then radius, then position, which
    // is the order the arguments used to be evaluated in. The stream is seeded,
    // so reordering these two lines would repaint every mote on every map.
    const material = warm ? 'lumenAmber' : room.chance(0.3) ? 'lumenViolet' : 'lumenCyan';
    const r = room.range(0.008, 0.022);
    room.geo(
      material,
      speck(),
      tiltMatrix(
        [x + room.range(-spread, spread), y + room.range(-spread * 0.7, spread * 0.7), z + room.range(-spread, spread)],
        [0, 0, 0],
        [r, r, r],
      ),
      FLAT,
    );
  }
}

/** A shaft of light through water: a long faint unlit wedge. Cheap god-rays. */
export function glowShaft(room: Room, from: Vec3, to: Vec3, width: number, warm = false): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.asin(-dy / Math.max(0.001, length));
  const centre: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];

  for (const roll of [0, Math.PI / 2]) {
    room.geo(warm ? 'waterHazeWarm' : 'waterHaze', quad(width, length), tiltMatrix(centre, [pitch + Math.PI / 2, yaw, roll]), FLAT);
  }
}

/**
 * A whale rib cage lying on the bottom: arches down both sides of a spine, with
 * the bone furred over in bacterial mat. Reads as a nave, which is exactly the
 * effect a whale fall has on anyone who has seen one.
 */
export function whaleSkeleton(room: Room, x: number, z: number, length = 5.0, rotationY = 0): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (lx: number, y: number, lz: number): Vec3 => [x + lx * cos + lz * sin, y, z - lx * sin + lz * cos];

  // The spine: vertebrae in a line, each with its process standing up.
  const count = Math.round(length / 0.42);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const lx = -length / 2 + length * t;
    const taper = 1 - Math.abs(t - 0.35) * 0.8;
    const p = at(lx, 0, 0);
    // Laid along the spine: a quarter turn about Z puts the cylinder on its
    // side, and the yaw then swings it round to the skeleton's own heading.
    room.geo('boneWhale', cyl(0.15 * taper, 0.16 * taper, 0.3, 10, true), tiltMatrix([p[0], 0.22, p[2]], [0, rotationY, Math.PI / 2]), { tile: 0.5 });
    room.geo('boneWhale', ball(0.17 * taper, 8), poseMatrix([p[0], 0.22, p[2]]), { tile: 0.4 });
    if (i % 2 === 0) {
      room.geo('boneWhale', cyl(0.03, 0.06, 0.34 * taper, 6), poseMatrix([p[0], 0.4, p[2]]), { tile: 0.3 });
    }
  }

  // Ribs, springing off the spine and curving down to the silt both sides.
  const ribs = Math.max(4, Math.round(length / 0.95));
  for (let i = 0; i < ribs; i++) {
    const t = (i + 0.5) / ribs;
    const lx = -length / 2 + length * t;
    const span = 1.5 * Math.sin(Math.PI * Math.min(1, t * 1.35));
    const rise = 1.25 * Math.sin(Math.PI * Math.min(1, t * 1.3));
    if (span < 0.25) continue;
    for (const s of [-1, 1]) {
      const segs = 5;
      let prev = at(lx, 0.28, 0);
      for (let k = 1; k <= segs; k++) {
        const a = (Math.PI / 2) * (k / segs);
        const next = at(lx, 0.28 + Math.sin(a) * rise * 0.72 + (1 - Math.cos(a)) * 0.1, s * (1 - Math.cos(a)) * span);
        // Ribs need real thickness. At 5 cm they read as black wire from every
        // doorway - a whale rib is as thick as an arm and that is what makes the
        // cage read as bone rather than as a scribble.
        strut(room, 'boneWhale', prev, next, 0.095 * (1.1 - (k / segs) * 0.45), 6, { tile: 0.4 }, true);
        prev = next;
      }
      // The far end of the rib, resting in the silt.
      room.geo('bacterialMat', ball(0.1, 7), poseMatrix(prev), { tile: 0.3, castShadow: false });
    }
  }

  // The mat that eats it: a shag over the bone and out onto the silt.
  for (let i = 0; i < 5; i++) {
    const p = at(room.range(-length / 2, length / 2), 0.02, room.range(-1.2, 1.2));
    room.geo('bacterialMat', disc(room.range(0.18, 0.42), 10), tiltMatrix([p[0], 0.018, p[2]], [-Math.PI / 2, room.range(0, 3), 0]), {
      ...FLAT,
      tile: 1.0,
    });
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [length * 0.44, 0.34], rotationY });
}

/** A slab of wreck plating, buckled and encrusted, leaning where it fell. */
export function wreckPlate(room: Room, x: number, z: number, w = 2.4, h = 1.8, rotationY = 0, lean = 0.22): void {
  room.geo('rust', new THREE.BoxGeometry(w, h, 0.1), tiltMatrix([x, h * 0.44, z], [lean, rotationY, 0.06]), {
    tile: 1.3,
    consume: true,
  });
  // Frames on the back of it, and the torn edge along the top.
  for (let i = 0; i < 3; i++) {
    const lx = -w / 2 + w * ((i + 0.5) / 3);
    room.geo('steelDark', new THREE.BoxGeometry(0.09, h * 0.94, 0.16), tiltMatrix([x + Math.cos(rotationY) * lx + Math.sin(rotationY) * 0.1, h * 0.44, z - Math.sin(rotationY) * lx + Math.cos(rotationY) * 0.1], [lean, rotationY, 0.06]), {
      tile: 0.4,
      consume: true,
    });
  }
  for (let i = 0; i < 6; i++) {
    const lx = -w / 2 + w * ((i + 0.5) / 6);
    room.geo(
      'rust',
      spike(room.range(0.06, 0.14), room.range(0.14, 0.36), 5),
      tiltMatrix([x + Math.cos(rotationY) * lx, h * 0.9 + room.range(0, 0.1), z - Math.sin(rotationY) * lx], [lean + room.range(-0.3, 0.3), rotationY, room.range(-0.4, 0.4)]),
      { tile: 0.3, castShadow: false },
    );
  }
  for (let i = 0; i < 5; i++) {
    room.geo('surface.crust', ball(room.range(0.08, 0.18), 6), poseMatrix([x + room.range(-w / 2, w / 2) * Math.cos(rotationY), room.range(0.1, h * 0.8), z - room.range(-w / 2, w / 2) * Math.sin(rotationY)]), {
      tile: 0.3,
      castShadow: false,
    });
  }
  room.collider({ kind: 'box', center: [x, z], halfExtents: [w / 2 - 0.1, 0.2], rotationY });
}

/** Encrusting growth on a surface: barnacle nodules, sponge, a few small shells. */
export function encrust(room: Room, x: number, y: number, z: number, spread = 0.6, count = 12): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = Math.sqrt(room.rng()) * spread;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    const size = room.range(0.04, 0.13);
    room.geo(room.chance(0.25) ? 'spongeOrange' : 'shellWhite', cyl(size * 0.55, size, size * 0.9, 6), tiltMatrix([px, y + size * 0.4, pz], [room.range(-0.3, 0.3), a, room.range(-0.3, 0.3)]), {
      tile: 0.3,
      castShadow: false,
    });
  }
}
