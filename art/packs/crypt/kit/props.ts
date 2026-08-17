/**
 * The Sepulchre's fittings kit.
 *
 * These are the pieces that recur across rooms - the things that make a space
 * read as a consecrated crypt, as a dynastic tomb four thousand years older, or
 * as the growth that is coming up through both. Rooms compose them; almost
 * nothing is modelled twice.
 *
 * **Facing convention.** Every prop is authored facing `-Z`, the same direction
 * shared art faces (docs/art/SHARED_ART.md §2), so one set of wall rotations
 * works for props, chests and lockers alike. `wallPose()` gives you the position
 * and rotation for something set against a given wall.
 *
 * **Light convention.** Two real lights in a 1x1 room and the player carries
 * none, so most of what you can see by is emissive: the shell's lamp course,
 * candle flames, coals, glowing fungus, a rune cut in a floor. Only
 * `candleStand(..., lit)`, `sconce(..., lit)`, `brazier(..., lit)`,
 * `hangingLamp(..., lit)`, `soulFire(..., lit)`, `coronaLucis(..., lit)`,
 * `sporeCluster(..., lit)` and `lampStand(..., lit)` ever spend a real one, and
 * they all say so in their signature.
 *
 * **Cached geometry only.** Every shape below comes from one of the size-keyed
 * caches in this file, so nothing here is ever handed to the batcher with
 * `consume: true` - that flag frees the buffer, and these buffers belong to the
 * cache until the world comes down (docs/art/ART_GUIDE.md §5).
 *
 * Everything writes into the room's batcher, so a room can afford a hundred of
 * these and still cost single-digit draw calls.
 */
import * as THREE from 'three';
import { boxGeometry, mm, ownGeometryCache } from '../../../lib/build';
import type { Cell, Side } from '../../../lib/contract';
import type { BatchOptions } from '../../../lib/merge';
import { MeshBatcher, poseMatrix, tiltMatrix } from '../../../lib/merge';
import type { Room, Vec3 } from '../rooms/common';

/**
 * Anything living inside its own light source. A candle flame two centimetres
 * from a point light casts a shadow the length of the room, which reads as a
 * black bar across the flagstones rather than as a candle.
 */
const NO_SHADOW: BatchOptions = { castShadow: false };
/**
 * The handful of things big enough to be worth a shadow. Casting is opt-in in
 * this pack (see `Room.box`): a material used by both a caster and a non-caster
 * is two draw calls rather than one, so only silhouettes a player reads across a
 * room ask for it - a tomb chest, a statue, a pier.
 */
const SHADOW: BatchOptions = { castShadow: true };
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
 * Where to put something set against `side`, `along` metres from the wall's
 * centre (along the prop's own local +X) and `inset` metres out from the face.
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
  const key = `${mm(rTop)},${mm(rBot)},${mm(h)},${seg},${open}`;
  let geo = cylCache.get(key);
  if (!geo) {
    geo = new THREE.CylinderGeometry(mm(rTop), mm(rBot), mm(h), seg, 1, open);
    cylCache.set(key, geo);
  }
  return geo;
}

const sphereCache = new Map<string, THREE.SphereGeometry>();
export function ball(r: number, seg = 9): THREE.SphereGeometry {
  const key = `${mm(r)},${seg}`;
  let geo = sphereCache.get(key);
  if (!geo) {
    geo = new THREE.SphereGeometry(mm(r), seg, Math.max(4, Math.round(seg / 2)));
    sphereCache.set(key, geo);
  }
  return geo;
}

const coneCache = new Map<string, THREE.ConeGeometry>();
export function spike(r: number, h: number, seg = 7): THREE.ConeGeometry {
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
  const key = `${mm(r)},${mm(tube)},${seg}`;
  let geo = torusCache.get(key);
  if (!geo) {
    // Six sides round the tube, not twelve: a 6 x 12 torus is 144 triangles for
    // a band nobody can resolve, and that detail was 15 % of a whole map once
    // (see systems/RENDERING.md).
    geo = new THREE.TorusGeometry(mm(r), mm(tube), 6, seg);
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
export function disc(r: number, seg = 18): THREE.CircleGeometry {
  const key = `${mm(r)},${seg}`;
  let geo = discCache.get(key);
  if (!geo) {
    geo = new THREE.CircleGeometry(mm(r), seg);
    discCache.set(key, geo);
  }
  return geo;
}

for (const cache of [cylCache, sphereCache, coneCache, torusCache, planeCache, discCache]) ownGeometryCache(cache);

/** The cached box geometry, for the few props that want one without a collider. */
export function boxLike(w: number, h: number, d: number): THREE.BoxGeometry {
  return boxGeometry(w, h, d);
}

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
 * A cylinder from one point to another, at any angle. Chains, roots, bones,
 * candle stems and iron bars all come down to this, and doing it by hand is
 * where a horizontal rail ends up standing on end (docs/art/ROOM_REVIEW.md §4).
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

/* --- animation ------------------------------------------------------------------ */

/**
 * A tallow flame. Three sine terms at incommensurate rates plus a slow envelope,
 * so it never repeats on a count you can hear - and deliberately NOT the
 * station-lighting stutter of a dying tube: a flame wavers, it does not snap.
 */
export function flicker(room: Room, light: THREE.Light, base: number, depth = 0.2, speed = 6.5): void {
  const phase = room.range(0, 20);
  room.tick((t) => {
    const wave =
      Math.sin(t * speed + phase) * 0.5 + Math.sin(t * speed * 2.7 + phase * 1.7) * 0.32 + Math.sin(t * speed * 5.1 + phase * 0.6) * 0.18;
    // A draught crossing the room every few seconds, which is when a candle
    // actually does something worth noticing.
    const draught = 1 - 0.3 * Math.max(0, Math.sin(t * 0.31 + phase) - 0.86) * 7;
    light.intensity = base * Math.max(0.15, (1 + wave * depth) * draught);
  });
}

/**
 * Coals. Almost steady, with a slow deep swell - a bed of embers breathes rather
 * than flickering, and animating it like a candle is what makes a brazier read
 * as a torch.
 */
export function embers(room: Room, light: THREE.Light, base: number, amount = 0.16, speed = 0.7): void {
  const phase = room.range(0, 20);
  room.tick((t) => {
    const wave = Math.sin(t * speed + phase) * 0.7 + Math.sin(t * speed * 1.7 + phase * 1.3) * 0.3;
    light.intensity = base * (1 + wave * amount);
  });
}

/**
 * The Rot's light. A slow pulse with no flicker at all: nothing down here that
 * glows has a flame in it, and the absence of a stutter is exactly what makes
 * the fungus read as alive rather than as a lamp somebody left on.
 */
export function breathe(room: Room, light: THREE.Light, base: number, amount = 0.3, speed = 0.34): void {
  const phase = room.range(0, 20);
  room.tick((t) => {
    const wave = Math.pow(0.5 + 0.5 * Math.sin(t * speed + phase), 1.6) * 2 - 1;
    light.intensity = base * (1 + wave * amount);
  });
}

/** A slow swing, for anything hanging on a chain. */
export function sway(room: Room, object: THREE.Object3D, amount: number, speed = 0.5): void {
  const phase = room.range(0, 20);
  const baseZ = object.rotation.z;
  const baseX = object.rotation.x;
  room.tick((t) => {
    object.rotation.z = baseZ + Math.sin(t * speed + phase) * amount;
    object.rotation.x = baseX + Math.sin(t * speed * 0.73 + phase * 1.4) * amount * 0.6;
  });
}

/** A slow vertical drift plus a lazy turn: dust, spores, something floating. */
export function drift(room: Room, object: THREE.Object3D, amount: number, speed = 0.3): void {
  const phase = room.range(0, 20);
  const y = object.position.y;
  room.tick((t) => {
    object.position.y = y + Math.sin(t * speed + phase) * amount;
    object.rotation.y += 0.0011;
  });
}

/**
 * A batcher for the two or three things in a room that MOVE.
 *
 * A merged mesh cannot be animated, so anything on a chain has to stay out of the
 * room's batch - but "out of the batch" does not mean one `THREE.Mesh` per link.
 * A lantern built that way is twenty-odd draw calls on its own, and a corridor
 * with two of them spends more on its lamps than on the corridor (the lesson the
 * abyss pack's kelp taught: docs/art/ROOM_REVIEW.md §4).
 *
 * So: a `MeshBatcher` of its own, merged, parented to the group the room animates,
 * and handed to `room.own()` so the buffers it allocated are freed with the room.
 */
function swinging(room: Room, x: number, y: number, z: number): {
  put(material: string, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): void;
  finish(): THREE.Group;
} {
  const batch = new MeshBatcher();
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  return {
    put(material, geometry, matrix) {
      batch.add(room.mat(material), geometry, matrix, { tile: 0.4, castShadow: false });
    },
    finish() {
      const built = batch.build();
      pivot.add(built.object);
      room.loose(pivot);
      room.own(built);
      return pivot;
    },
  };
}

/* --- light: the Sanctum burns tallow -------------------------------------------- */

/**
 * A pricket stand: a wrought-iron tripod, a shaft, a pan and a crowd of candles
 * of every remaining length. The Sanctum's main practical.
 *
 * The candles must be RAGGED - a matched set reads as a shop display, and what
 * makes a votive stand frightening is that every one of them was left by
 * somebody who wanted something.
 */
export function candleStand(room: Room, x: number, z: number, lit = false, height = 1.15, intensity = 7): void {
  const feet = 3;
  for (let i = 0; i < feet; i++) {
    const a = (i / feet) * Math.PI * 2 + 0.4;
    strut(room, 'iron', [x, 0.02, z], [x + Math.cos(a) * 0.29, 0.16, z + Math.sin(a) * 0.29], 0.022, 5, NO_SHADOW);
    room.geo('iron', ball(0.035, 6), poseMatrix([x + Math.cos(a) * 0.3, 0.035, z + Math.sin(a) * 0.3]), NO_SHADOW);
  }
  post(room, 'iron', 0.025, 0.038, height, [x, 0.1, z], 8, NO_SHADOW);
  // A collar halfway up, because a bare rod is a rod.
  room.geo('iron', ring(0.055, 0.014, 8), tiltMatrix([x, height * 0.55, z], [Math.PI / 2, 0, 0]), NO_SHADOW);
  // The pan, with a lip: it is the wax that has run into it over a century that
  // makes the object.
  room.geo('iron', cyl(0.2, 0.15, 0.045, 12), poseMatrix([x, height + 0.12, z]), NO_SHADOW);
  room.geo('iron', ring(0.2, 0.016, 12), tiltMatrix([x, height + 0.14, z], [Math.PI / 2, 0, 0]), NO_SHADOW);
  room.geo('waxPale', cyl(0.19, 0.16, 0.035, 12), poseMatrix([x, height + 0.15, z]), NO_SHADOW);

  const count = 5 + Math.floor(room.range(0, 4));
  let tallest = 0;
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = room.range(0.02, 0.15);
    const cx = x + Math.cos(a) * r;
    const cz = z + Math.sin(a) * r;
    const len = room.range(0.06, 0.34);
    tallest = Math.max(tallest, len);
    const lean = room.range(-0.09, 0.09);
    room.geo('wax', cyl(0.019, 0.023, len, 6), tiltMatrix([cx, height + 0.17 + len / 2, cz], [0, 0, lean]), { tile: 0.2, ...NO_SHADOW });
    if (room.chance(0.72)) {
      // Wick, then the hot wax round it, then the flame. Three sizes stacked is
      // what makes a candle tip read at two metres.
      room.geo('wick', cyl(0.004, 0.004, 0.03, 4), poseMatrix([cx, height + 0.19 + len, cz]), FLAT);
      room.geo('lumenTallow', ball(0.02, 7), tiltMatrix([cx, height + 0.19 + len, cz], [0, 0, 0], [1, 1.4, 1]), FLAT);
      room.geo('flame', ball(0.016, 6), tiltMatrix([cx, height + 0.23 + len, cz], [0, 0, 0], [0.7, 2.4, 0.7]), FLAT);
    }
    // Wax running over the rim of the pan.
    if (i % 3 === 0) {
      room.geo('waxPale', cyl(0.016, 0.022, room.range(0.08, 0.2), 5), poseMatrix([x + Math.cos(a) * 0.185, height + 0.02, z + Math.sin(a) * 0.185]), NO_SHADOW);
    }
  }

  // The pool of light it throws, on the floor. Additive, so it adds the bright
  // and brings no dark square with it (docs/art/ROOM_REVIEW.md §4).
  room.geo('wash.warm', disc(1.05, 14), tiltMatrix([x, 0.014, z], [-Math.PI / 2, 0, 0]), FLAT);

  if (lit) {
    const lamp = new THREE.PointLight(0xffd2a0, intensity, room.ctx.dims.cellSize * 1.35, 2);
    lamp.position.set(x, height + 0.3 + tallest, z);
    room.light(lamp);
    flicker(room, lamp, intensity);
  }
}

/**
 * A wall sconce: a bracket, a drip pan and either a candle or the stub of a
 * torch, with two centuries of soot up the wall over it. The cheapest way to
 * tell a player a wall is a wall.
 */
export function sconce(room: Room, side: Side, along: number, y = 1.85, lit = false, torch = false, intensity = 6, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.02, cell);
  const [x, , z] = position;
  const out = (d: number, h = 0): Vec3 => [x - Math.sin(rotationY) * d, y + h, z - Math.cos(rotationY) * d];

  // Back plate, and the pin driven into the joint.
  room.box('ironDark', [0.14, 0.24, 0.05], [x, y - 0.12, z], rotationY, { tile: 0.3, castShadow: false });
  const arm = out(0.22, 0.1);
  strut(room, 'iron', [x, y, z], arm, 0.017, 5, NO_SHADOW);
  strut(room, 'iron', [x, y - 0.16, z], [arm[0], arm[1] - 0.04, arm[2]], 0.013, 4, NO_SHADOW);
  // A scrolled terminal on the arm: one ring, and the bracket stops being a nail.
  room.geo('iron', ring(0.035, 0.011, 8), poseMatrix(out(0.26, 0.1), rotationY), NO_SHADOW);
  room.geo('iron', cyl(0.075, 0.055, 0.03, 10), poseMatrix(out(0.24, 0.13)), NO_SHADOW);

  if (torch) {
    // A pitch torch burnt down to the binding: a charred stub, the iron ferrule
    // and a crown of flame.
    room.geo('timberDark', cyl(0.03, 0.035, 0.3, 6), tiltMatrix(out(0.24, 0.28), [0, rotationY, 0.1]), NO_SHADOW);
    room.geo('iron', ring(0.038, 0.01, 7), tiltMatrix(out(0.24, 0.22), [Math.PI / 2, rotationY, 0]), NO_SHADOW);
    room.geo('ember', ball(0.055, 7), tiltMatrix(out(0.25, 0.44), [0, rotationY, 0], [1, 1.3, 1]), FLAT);
    room.geo('flame', ball(0.045, 7), tiltMatrix(out(0.25, 0.53), [0, rotationY, 0], [0.85, 2.1, 0.85]), FLAT);
  } else {
    const len = room.range(0.12, 0.26);
    room.geo('wax', cyl(0.023, 0.028, len, 6), poseMatrix(out(0.24, 0.15 + len / 2)), { tile: 0.2, ...NO_SHADOW });
    room.geo('lumenTallow', ball(0.021, 7), tiltMatrix(out(0.24, 0.16 + len), [0, 0, 0], [1, 1.4, 1]), FLAT);
    room.geo('flame', ball(0.017, 6), tiltMatrix(out(0.24, 0.2 + len), [0, 0, 0], [0.7, 2.4, 0.7]), FLAT);
    // Wax hanging off the pan, which is where a sconce shows its age.
    room.geo('waxPale', cyl(0.012, 0.02, 0.14, 5), poseMatrix(out(0.21, 0.02)), NO_SHADOW);
  }

  // Soot: a plume widening up the wall. The single detail that makes a fitting
  // look like it has been burning for four hundred years.
  room.geo('stoneDark', quad(0.3, 0.6), poseMatrix([x - Math.sin(rotationY) * 0.02, y + 0.62, z - Math.cos(rotationY) * 0.02], rotationY + Math.PI), FLAT);
  room.geo('wash.warm', quad(0.85, 1.15), poseMatrix([x - Math.sin(rotationY) * 0.03, y + 0.1, z - Math.cos(rotationY) * 0.03], rotationY + Math.PI), FLAT);

  if (lit) {
    const lamp = new THREE.PointLight(torch ? 0xffab62 : 0xffd6a8, intensity, room.ctx.dims.cellSize * 1.3, 2);
    const p = out(0.3, torch ? 0.5 : 0.24);
    lamp.position.set(p[0], p[1], p[2]);
    room.light(lamp);
    flicker(room, lamp, intensity, torch ? 0.28 : 0.18, torch ? 8 : 6);
  }
}

/**
 * An iron brazier on a tripod, with a bed of coals in it and ash spilt round the
 * feet. The one warm thing in a stone room, and the room's floor-level light.
 */
export function brazier(room: Room, x: number, z: number, lit = false, intensity = 9, shadow = false): void {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    strut(room, 'iron', [x + Math.cos(a) * 0.34, 0.02, z + Math.sin(a) * 0.34], [x + Math.cos(a) * 0.16, 0.62, z + Math.sin(a) * 0.16], 0.028, 5, NO_SHADOW);
    // A splayed foot, so the tripod stands on something.
    room.geo('iron', cyl(0.05, 0.07, 0.035, 6), poseMatrix([x + Math.cos(a) * 0.35, 0.018, z + Math.sin(a) * 0.35]), NO_SHADOW);
  }
  room.geo('iron', ring(0.22, 0.02, 12), tiltMatrix([x, 0.4, z], [Math.PI / 2, 0, 0]), NO_SHADOW);
  // The bowl: deeper than it is wide, with a rim and a band of rivets. At 0.42 m
  // across and 0.24 deep it read as a drinks table with a plate on it - a brazier
  // is a bucket of fire, so the silhouette has to be tall enough to hold the fire
  // BELOW its rim.
  room.geo('iron', cyl(0.33, 0.19, 0.4, 13), poseMatrix([x, 0.78, z]), { tile: 0.5, ...NO_SHADOW });
  room.geo('ironPale', ring(0.33, 0.028, 13), tiltMatrix([x, 0.98, z], [Math.PI / 2, 0, 0]), NO_SHADOW);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    room.geo('ironPale', ball(0.022, 5), poseMatrix([x + Math.cos(a) * 0.29, 0.68, z + Math.sin(a) * 0.29]), NO_SHADOW);
  }

  // The coals, laid ON the bowl's closed top and just under its rim.
  //
  // A `CylinderGeometry` has a top cap, and with a point light 25 cm above it that
  // cap was the brightest thing in the room - a bowl of soup on a stool. The bed
  // has to sit on top of the cap and be DARK, so that what a player sees is a few
  // live coals in a black bucket rather than a lit disc.
  room.geo('bitumen', cyl(0.31, 0.28, 0.05, 12), poseMatrix([x, 0.985, z]), NO_SHADOW);
  for (let i = 0; i < 10; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = room.range(0, 0.24);
    const cx = x + Math.cos(a) * r;
    const cz = z + Math.sin(a) * r;
    const s = room.range(0.035, 0.07);
    room.geo(i % 3 === 0 ? 'ember' : 'ash', ball(s, 5), tiltMatrix([cx, 1.0 + room.range(0, 0.03), cz], [0, a, 0], [1.2, 0.7, 1]), FLAT);
  }
  // Ash and a spilt coal or two on the floor, and the pool of light.
  room.geo('ash', disc(room.range(0.6, 0.85), 14), tiltMatrix([x, 0.011, z], [-Math.PI / 2, room.range(0, 3), 0]), FLAT);
  room.geo('wash.warm', disc(1.35, 14), tiltMatrix([x, 0.015, z], [-Math.PI / 2, 0, 0]), FLAT);
  // Smoke, thin and small. A translucent sphere in front of a lit thing greys it
  // out, so this is 0.1 opacity and 40 cm across, not 0.3 and a metre.
  for (let i = 0; i < 3; i++) {
    room.geo('smoke', ball(room.range(0.16, 0.3), 7), poseMatrix([x + room.range(-0.14, 0.14), 1.25 + i * 0.36, z + room.range(-0.14, 0.14)]), FLAT);
  }

  room.blockCircle(x, z, 0.4);

  if (lit) {
    const lamp = new THREE.PointLight(0xffa860, intensity, room.ctx.dims.cellSize * 1.6, 2);
    // Well above the coal bed. Level with the rim, the light was inside the bowl,
    // where it lit the inside of a bucket and blew its top cap out to white.
    lamp.position.set(x, 1.42, z);
    lamp.castShadow = shadow;
    if (shadow) {
      lamp.shadow.mapSize.set(512, 512);
      lamp.shadow.autoUpdate = false;
      lamp.shadow.needsUpdate = true;
    }
    room.light(lamp);
    embers(room, lamp, intensity);
  }
}

/**
 * A lantern on a chain from the vault, swinging very slightly. Loose rather than
 * batched, because it is the one thing in most rooms that moves - and a room
 * with nothing moving in it reads as a photograph.
 */
export function hangingLamp(room: Room, x: number, z: number, drop = 1.1, lit = false, intensity = 7): void {
  const { ceilingHeight } = room.ctx.dims;
  const swing = swinging(room, x, ceilingHeight - 0.1, z);

  // The chain: alternating links, which is the only way a chain reads as a chain.
  const links = Math.max(3, Math.round(drop / 0.14));
  for (let i = 0; i < links; i++) {
    const y = -0.06 - i * (drop / links);
    swing.put('iron', ring(0.032, 0.009, 7), tiltMatrix([0, y, 0], [i % 2 ? Math.PI / 2 : 0, 0, Math.PI / 2]));
  }
  // The lantern: a pierced iron housing round a glass, with a spike finial. The
  // glass is unlit so it is a lamp even when nothing is lighting it.
  const ly = -drop - 0.16;
  swing.put('iron', cyl(0.11, 0.14, 0.06, 8), poseMatrix([0, ly + 0.19, 0]));
  swing.put(lit ? 'flame' : 'waxPale', cyl(0.1, 0.1, 0.24, 9), poseMatrix([0, ly, 0]));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    swing.put('iron', cyl(0.011, 0.011, 0.3, 4), poseMatrix([Math.cos(a) * 0.105, ly, Math.sin(a) * 0.105]));
  }
  swing.put('iron', ring(0.105, 0.012, 9), tiltMatrix([0, ly + 0.13, 0], [Math.PI / 2, 0, 0]));
  swing.put('iron', ring(0.105, 0.012, 9), tiltMatrix([0, ly - 0.13, 0], [Math.PI / 2, 0, 0]));
  swing.put('iron', cyl(0.13, 0.09, 0.08, 8), poseMatrix([0, ly - 0.17, 0]));
  swing.put('iron', spike(0.03, 0.1, 5), poseMatrix([0, ly - 0.26, 0]));
  if (lit) swing.put('flame', ball(0.05, 7), tiltMatrix([0, ly, 0], [0, 0, 0], [0.9, 1.6, 0.9]));

  const pivot = swing.finish();
  sway(room, pivot, 0.035, 0.4);

  if (lit) {
    const lamp = new THREE.PointLight(0xffd6a8, intensity, room.ctx.dims.cellSize * 1.4, 2);
    lamp.position.set(0, ly, 0);
    pivot.add(lamp);
    // Declared, but parented into the swinging group: a light logic has not been
    // told about is a light that goes out (ROOM_FORMAT.md §6).
    room.lights.push(lamp);
    if (room.lights.length > room.ctx.lightBudget) {
      throw new Error(`room "${room.blueprint.id}" exceeds lightBudget ${room.ctx.lightBudget}`);
    }
    flicker(room, lamp, intensity, 0.14, 4.5);
  }

  room.geo('wash.warm', disc(1.2, 14), tiltMatrix([x, 0.013, z], [-Math.PI / 2, 0, 0]), FLAT);
}

/**
 * A censer swinging on a chain, still smoking. Costs no light and does more for
 * a room than most things that do.
 */
export function censer(room: Room, x: number, z: number, drop = 1.4): void {
  const { ceilingHeight } = room.ctx.dims;
  const swing = swinging(room, x, ceilingHeight - 0.1, z);
  const links = Math.max(3, Math.round(drop / 0.16));
  for (let i = 0; i < links; i++) {
    swing.put('brass', ring(0.028, 0.008, 6), tiltMatrix([0, -0.05 - i * (drop / links), 0], [i % 2 ? Math.PI / 2 : 0, 0, Math.PI / 2]));
  }
  const by = -drop - 0.1;
  swing.put('brass', ball(0.11, 10), tiltMatrix([0, by, 0], [0, 0, 0], [1, 0.8, 1]));
  swing.put('brass', cyl(0.1, 0.115, 0.09, 10), poseMatrix([0, by + 0.11, 0]));
  swing.put('brass', spike(0.05, 0.09, 6), poseMatrix([0, by + 0.2, 0]));
  swing.put('ember', ball(0.05, 7), poseMatrix([0, by - 0.02, 0]));
  sway(room, swing.finish(), 0.16, 0.55);

  // The smoke it has left hanging in the air, which does not swing with it.
  for (let i = 0; i < 4; i++) {
    room.geo('smoke', ball(room.range(0.18, 0.34), 7), poseMatrix([x + room.range(-0.3, 0.3), ceilingHeight - drop + 0.3 + i * 0.3, z + room.range(-0.3, 0.3)]), FLAT);
  }
}

/**
 * Witchfire: a flame with no fuel under it, sitting in a bowl, on a skull, or in
 * the palm of something. Cold green, no smoke, no wax, and no flicker worth the
 * name - it is the absence of all the things a candle has that makes it wrong.
 */
export function soulFire(room: Room, x: number, y: number, z: number, size = 1, lit = false, intensity = 6): void {
  room.geo('lumenSoul', ball(0.07 * size, 8), tiltMatrix([x, y + 0.07 * size, z], [0, 0, 0], [1, 1.5, 1]), FLAT);
  room.geo('flameGreen', ball(0.05 * size, 7), tiltMatrix([x, y + 0.2 * size, z], [0, 0, 0], [0.8, 2.6, 0.8]), FLAT);
  room.geo('flameGreen', ball(0.026 * size, 6), tiltMatrix([x, y + 0.36 * size, z], [0, 0, 0], [0.7, 2.2, 0.7]), FLAT);
  room.geo('wash.cold', disc(0.9 * size, 12), tiltMatrix([x, 0.016, z], [-Math.PI / 2, 0, 0]), FLAT);
  if (lit) {
    const lamp = new THREE.PointLight(0x6effb4, intensity, room.ctx.dims.cellSize * 1.3, 2);
    lamp.position.set(x, y + 0.24 * size, z);
    room.light(lamp);
    breathe(room, lamp, intensity, 0.14, 0.8);
  }
}

/**
 * A corona lucis: the ring of light that hangs over a crossing, here made of
 * iron and long bones with candles standing in it. The room's set-piece
 * fitting, and the one place a shadow-casting light earns its keep.
 *
 * Everything inside the light's own volume passes `castShadow: false`, or the
 * ring draws a hard black wheel across the floor it is lighting - which is
 * exactly what the manor's chandelier did for three plan steps.
 */
export function coronaLucis(room: Room, x: number, z: number, radius = 0.85, lit = false, intensity = 11, shadow = true): void {
  const { ceilingHeight } = room.ctx.dims;
  const y = ceilingHeight - 1.05;

  // Three chains up to the vault, and the ring itself in two courses.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    strut(room, 'iron', [x + Math.cos(a) * radius * 0.8, y + 0.05, z + Math.sin(a) * radius * 0.8], [x, ceilingHeight - 0.06, z], 0.012, 4, FLAT);
  }
  room.geo('iron', ring(radius, 0.035, 20), tiltMatrix([x, y, z], [Math.PI / 2, 0, 0]), FLAT);
  room.geo('iron', ring(radius, 0.02, 20), tiltMatrix([x, y - 0.14, z], [Math.PI / 2, 0, 0]), FLAT);
  const uprights = 10;
  for (let i = 0; i < uprights; i++) {
    const a = (i / uprights) * Math.PI * 2;
    const cx = x + Math.cos(a) * radius;
    const cz = z + Math.sin(a) * radius;
    room.geo('iron', cyl(0.012, 0.012, 0.16, 4), poseMatrix([cx, y - 0.07, cz]), FLAT);
    // A femur hung between every second pair of prickets: this is a crypt, and
    // the ironwork was finished with what the crypt had.
    if (i % 2 === 0) {
      const b = ((i + 1) / uprights) * Math.PI * 2;
      strut(room, 'bone', [cx, y - 0.16, cz], [x + Math.cos(b) * radius, y - 0.16, z + Math.sin(b) * radius], 0.028, 5, FLAT);
    }
    // The pricket, and a candle on most of them.
    room.geo('iron', cyl(0.05, 0.035, 0.035, 8), poseMatrix([cx, y + 0.02, cz]), FLAT);
    if (room.chance(0.78)) {
      const len = room.range(0.1, 0.3);
      room.geo('wax', cyl(0.019, 0.024, len, 6), poseMatrix([cx, y + 0.055, cz]), { tile: 0.2, ...FLAT });
      room.geo('lumenTallow', ball(0.019, 7), tiltMatrix([cx, y + 0.06 + len, cz], [0, 0, 0], [1, 1.4, 1]), FLAT);
      room.geo('flame', ball(0.015, 6), tiltMatrix([cx, y + 0.1 + len, cz], [0, 0, 0], [0.7, 2.4, 0.7]), FLAT);
      // Wax stalactites hanging off the ring, which is what tells you it has
      // been burning here a very long time.
      if (i % 3 === 0) room.geo('waxPale', cyl(0.01, 0.02, room.range(0.1, 0.3), 5), poseMatrix([cx, y - 0.18, cz]), FLAT);
    }
  }

  room.geo('wash.warm', disc(1.7, 16), tiltMatrix([x, 0.014, z], [-Math.PI / 2, 0, 0]), FLAT);

  if (lit) {
    const lamp = new THREE.PointLight(0xffd2a0, intensity, room.ctx.dims.cellSize * 1.7, 2);
    lamp.position.set(x, y + 0.08, z);
    lamp.castShadow = shadow;
    if (shadow) {
      lamp.shadow.mapSize.set(512, 512);
      lamp.shadow.autoUpdate = false;
      lamp.shadow.needsUpdate = true;
    }
    room.light(lamp);
    flicker(room, lamp, intensity, 0.1, 5);
  }
}

/**
 * The Necropolis's practical: a tall alabaster lamp on a stone stand, burning
 * oil. Lower and hotter than tallow, and it lights gold rather than stone.
 */
export function lampStand(room: Room, x: number, z: number, lit = false, intensity = 8): void {
  post(room, 'stoneWarm', 0.14, 0.19, 0.16, [x, 0, z], 9, NO_SHADOW);
  post(room, 'stoneWarm', 0.055, 0.075, 0.86, [x, 0.16, z], 8, NO_SHADOW);
  room.geo('stoneWarmPale', cyl(0.13, 0.075, 0.09, 10), poseMatrix([x, 1.06, z]));
  // The lamp: an alabaster bowl, translucent-looking, with a lip for the wick.
  room.geo('alabaster', cyl(0.15, 0.1, 0.1, 12), poseMatrix([x, 1.16, z]), NO_SHADOW);
  room.geo('alabaster', ring(0.15, 0.014, 12), tiltMatrix([x, 1.21, z], [Math.PI / 2, 0, 0]), NO_SHADOW);
  room.geo('lumenOil', ball(0.045, 8), tiltMatrix([x + 0.09, 1.2, z], [0, 0, 0], [1.1, 1, 1.1]), FLAT);
  room.geo('flame', ball(0.035, 7), tiltMatrix([x + 0.09, 1.28, z], [0, 0, 0], [0.8, 2.3, 0.8]), FLAT);
  room.geo('wash.gold', disc(1.15, 14), tiltMatrix([x, 0.014, z], [-Math.PI / 2, 0, 0]), FLAT);
  room.blockCircle(x, z, 0.2);
  if (lit) {
    const lamp = new THREE.PointLight(0xffc078, intensity, room.ctx.dims.cellSize * 1.4, 2);
    // Above the bowl, not in it: level with the rim, the light blew the alabaster
    // out to a white blob and lost the shape of the lamp entirely.
    lamp.position.set(x, 1.46, z);
    room.light(lamp);
    flicker(room, lamp, intensity, 0.13, 5.5);
  }
}

/* --- tombs, bones and what is left of people ------------------------------------ */

export type LidStyle = 'flat' | 'gabled' | 'effigy' | 'anthropoid' | 'none';

/**
 * A chest tomb. A moulded plinth, a coffin the size of a person and one of four
 * lids, all of it sized so a player reads it as a thing you could open.
 *
 * `open` slides the lid clear and shows what is inside, which is nearly always
 * nothing. An empty coffin with its lid pushed off is the single most useful
 * object in this pack: it asks a question the room does not answer.
 */
export function sarcophagus(
  room: Room,
  x: number,
  z: number,
  rotationY = 0,
  options: { lid?: LidStyle; open?: boolean; gilt?: boolean; length?: number; occupant?: boolean } = {},
): void {
  const lidStyle = options.lid ?? 'flat';
  const len = options.length ?? 2.2;
  const wide = 0.95;
  const bodyH = 0.62;
  const stone = options.gilt ? 'stoneWarm' : 'stone';
  const pale = options.gilt ? 'stoneWarmPale' : 'stonePale';
  // The LID takes the mid tone and only the mouldings take the pale one. Lid, body
  // and plinth all in `stonePale` came out as a row of white kitchen counters down
  // both sides of the corridor, and an effigy carved in marble on top of a pale lid
  // has nothing to be pale against.
  const lidMat = options.gilt ? 'stoneWarm' : 'stone';
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  /** Local (along, across) to world. `along` runs down the tomb's length. */
  const at = (along: number, across: number): Vec3 => [x + cos * along + sin * across, 0, z - sin * along + cos * across];

  // Plinth, body, and a chamfered top course. Three widths is what makes stone
  // furniture read as moulded rather than as a crate.
  const plinth = at(0, 0);
  room.box(pale, [len + 0.24, 0.14, wide + 0.24], plinth, rotationY, { tile: 0.8, castShadow: false });
  room.box(stone, [len, bodyH, wide], [plinth[0], 0.14, plinth[2]], rotationY, { tile: 0.9, ...SHADOW });
  room.box(pale, [len + 0.12, 0.07, wide + 0.12], [plinth[0], 0.14 + bodyH, plinth[2]], rotationY, { tile: 0.6, castShadow: false });

  // Blind arcading down the long sides: five bays of it, which is what turns a
  // box into a fourteenth-century tomb chest.
  const bays = 4;
  for (let i = 0; i < bays; i++) {
    const along = -len / 2 + (len * (i + 0.5)) / bays;
    for (const s of [-1, 1]) {
      const p = at(along, s * (wide / 2 + 0.015));
      room.box('stoneDark', [len / bays - 0.14, bodyH * 0.62, 0.04], [p[0], 0.24, p[2]], rotationY, { tile: 0.3, castShadow: false });
      // The shaft between bays, and a trefoil head over each: two boxes.
      const q = at(along - len / bays / 2, s * (wide / 2 + 0.02));
      room.box(pale, [0.08, bodyH * 0.8, 0.05], [q[0], 0.18, q[2]], rotationY, { tile: 0.3, castShadow: false });
      room.geo(pale, cyl(len / bays / 2 - 0.06, len / bays / 2 - 0.06, 0.05, 7), tiltMatrix([p[0], 0.24 + bodyH * 0.62, p[2]], [Math.PI / 2, rotationY, 0]), {
        tile: 0.3,
      });
    }
  }
  // An inscription band on one end.
  const end = at(-len / 2 - 0.02, 0);
  room.box('surface.inscription', [0.05, 0.34, wide * 0.72], [end[0], 0.3, end[2]], rotationY, { tile: 0.45, castShadow: false });

  const lidY = 0.14 + bodyH + 0.07;
  const slide = options.open ? len * 0.34 : 0;
  const lidPos = at(slide, options.open ? 0.16 : 0);

  if (lidStyle === 'flat') {
    room.box(lidMat, [len + 0.16, 0.16, wide + 0.16], [lidPos[0], lidY, lidPos[2]], rotationY + (options.open ? 0.07 : 0), { tile: 0.8, ...SHADOW });
    // A cross incised the length of it, in two boxes.
    room.box('stoneDark', [len * 0.72, 0.02, 0.09], [lidPos[0], lidY + 0.16, lidPos[2]], rotationY + (options.open ? 0.07 : 0), { tile: 0.3, castShadow: false });
  } else if (lidStyle === 'gabled') {
    // A coped lid: two slopes meeting in a ridge, which is how a stone coffin
    // shed the water it was never going to see.
    for (const s of [-1, 1]) {
      const p = at(slide, s * wide * 0.24);
      room.box(lidMat, [len + 0.16, 0.3, wide * 0.56], [p[0], lidY, p[2]], rotationY, { tile: 0.8, ...SHADOW });
      room.box(pale, [len + 0.16, 0.06, wide * 0.5], [p[0], lidY + 0.3, p[2] - s * 0.05], rotationY - s * 0.34, { tile: 0.5, castShadow: false });
    }
    room.box('stonePale', [len + 0.2, 0.1, 0.14], [lidPos[0], lidY + 0.36, lidPos[2]], rotationY, { tile: 0.4, castShadow: false });
  } else if (lidStyle === 'effigy') {
    room.box(lidMat, [len + 0.16, 0.14, wide + 0.16], [lidPos[0], lidY, lidPos[2]], rotationY, { tile: 0.8, ...SHADOW });
    effigy(room, lidPos[0], lidY + 0.14, lidPos[2], rotationY, len);
  } else if (lidStyle === 'anthropoid') {
    // A body-shaped lid: shoulders, a tapering trunk and a mask. The silhouette
    // is the whole object, so it is built from the outline in rather than as a
    // box with a face on it.
    const gild = options.gilt ? 'gold' : pale;
    const segs = 7;
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      // Widest at the shoulders a fifth of the way down, then tapering to the
      // feet. A monotonic taper is a bottle, not a person.
      const w = wide * (t < 0.2 ? 0.62 + t * 1.6 : 0.94 - Math.pow((t - 0.2) / 0.8, 1.3) * 0.42);
      const p = at(-len / 2 + (len * (i + 0.5)) / segs, 0);
      room.box(gild, [len / segs + 0.02, 0.26 - t * 0.09, w], [p[0], lidY, p[2]], rotationY, { tile: 0.7, ...SHADOW });
    }
    // The head end: a mask with a headdress either side of it and a beard under.
    const head = at(-len / 2 + 0.24, 0);
    room.geo(gild, ball(0.26, 10), tiltMatrix([head[0], lidY + 0.3, head[2]], [0, rotationY, 0], [0.85, 1, 1.05]), { tile: 0.5 });
    for (const s of [-1, 1]) {
      const p = at(-len / 2 + 0.3, s * 0.3);
      room.box(gild, [0.44, 0.14, 0.13], [p[0], lidY + 0.18, p[2]], rotationY, { tile: 0.4, castShadow: false });
    }
    const face = at(-len / 2 + 0.05, 0);
    room.box('bitumen', [0.06, 0.15, 0.3], [face[0], lidY + 0.24, face[2]], rotationY, { tile: 0.3, castShadow: false });
    // The eyes: inlaid, and the only two bright points on a dark object.
    for (const s of [-1, 1]) {
      const p = at(-len / 2 + 0.08, s * 0.09);
      room.geo('itemEnamel', ball(0.035, 6), poseMatrix([p[0], lidY + 0.34, p[2]]), NO_SHADOW);
      room.geo('bitumen', ball(0.018, 5), poseMatrix([p[0] - sin * 0.02, lidY + 0.34, p[2] - cos * 0.02]), NO_SHADOW);
    }
    // A collar of glyph bands across the chest.
    for (let i = 0; i < 3; i++) {
      const p = at(-len / 2 + 0.62 + i * 0.3, 0);
      room.box('surface.glyph', [0.14, 0.03, wide * 0.8], [p[0], lidY + 0.2 - i * 0.02, p[2]], rotationY, { tile: 0.4, castShadow: false });
    }
  }

  if (options.open || lidStyle === 'none') {
    // The inside: a dark hollow with a stained floor, and what is left in it.
    room.box('stoneDark', [len - 0.2, 0.34, wide - 0.22], [plinth[0], 0.32, plinth[2]], rotationY, { tile: 0.5, castShadow: false });
    if (options.occupant ?? true) {
      const dust = at(0, 0);
      room.box('fleshDry', [len - 0.5, 0.09, wide - 0.44], [dust[0], 0.32, dust[2]], rotationY, { tile: 0.5, castShadow: false });
      skull(room, at(-len / 2 + 0.42, 0.03)[0], 0.42, at(-len / 2 + 0.42, 0.03)[2], rotationY + room.range(-0.4, 0.4), 1);
      // A femur and a rib or two, not a skeleton: the shapes that read as bone
      // at two metres are the long ones and the round one.
      for (let i = 0; i < 4; i++) {
        const p = at(room.range(-len * 0.3, len * 0.35), room.range(-0.25, 0.25));
        strut(room, 'bone', [p[0], 0.36, p[2]], [p[0] + cos * room.range(0.18, 0.4), 0.37, p[2] - sin * room.range(0.18, 0.4)], 0.028, 5, NO_SHADOW);
      }
    }
  }

  room.collider({
    kind: 'box',
    center: [plinth[0], plinth[2]],
    halfExtents: [(len + 0.16) / 2 - 0.04, (wide + 0.16) / 2 - 0.04],
    rotationY,
  });
}

/**
 * A recumbent effigy, carved on the lid of its own tomb: legs together, hands
 * folded on the breast, head on a cushion, feet on a hound. It is the pose that
 * carries it - a horizontal figure reads as a person the moment the hands are
 * where they belong.
 */
export function effigy(room: Room, x: number, y: number, z: number, rotationY = 0, len = 2.2, marble = 'marble'): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (along: number, across: number): Vec3 => [x + cos * along + sin * across, 0, z - sin * along + cos * across];

  // Body: legs, hips, chest, shoulders. Each a box, each a different width.
  const stack: [number, number, number, number][] = [
    [-len * 0.3, 0.62, 0.34, 0.2],
    [0.02, 0.42, 0.4, 0.24],
    [len * 0.22, 0.5, 0.46, 0.3],
  ];
  for (const [along, l, w, h] of stack) {
    const p = at(along, 0);
    room.box(marble, [l, h, w], [p[0], y, p[2]], rotationY, { tile: 0.6, ...SHADOW });
  }
  // The cushion under the head, at a slight angle, and the head itself turned a
  // few degrees - level and square is what makes carving look like furniture.
  const pillow = at(len * 0.42, 0);
  room.box('marbleDark', [0.34, 0.14, 0.44], [pillow[0], y, pillow[2]], rotationY + 0.04, { tile: 0.4 });
  const head = at(len * 0.42, 0);
  room.geo(marble, ball(0.135, 8), tiltMatrix([head[0], y + 0.24, head[2]], [0, rotationY + 0.09, 0], [1.15, 1, 0.95]), { tile: 0.4, ...SHADOW });
  // A mitre, a helm or a coif: a low dome, and it dates the figure.
  room.geo(marble, ball(0.13, 7), tiltMatrix([head[0], y + 0.3, head[2]], [0, rotationY, 0], [1, 0.7, 1]), { tile: 0.3 });
  // Hands folded on the breast, in prayer: two wedges meeting.
  const hands = at(len * 0.16, 0);
  for (const s of [-1, 1]) {
    room.box(marble, [0.2, 0.12, 0.09], [hands[0] + sin * s * 0.05, y + 0.3, hands[2] + cos * s * 0.05], rotationY + s * 0.18, { tile: 0.3, castShadow: false });
  }
  // Arms down the sides to reach them.
  for (const s of [-1, 1]) {
    const p = at(len * 0.05, s * 0.2);
    room.box(marble, [0.44, 0.11, 0.12], [p[0], y + 0.2, p[2]], rotationY + s * 0.06, { tile: 0.3, castShadow: false });
  }
  // Feet, and the hound they rest on: the detail everyone who has seen one
  // remembers, and it is four boxes.
  const feet = at(-len * 0.4, 0);
  for (const s of [-1, 1]) {
    room.box(marble, [0.2, 0.14, 0.13], [feet[0] + sin * s * 0.09, y + 0.16, feet[2] + cos * s * 0.09], rotationY, { tile: 0.3, castShadow: false });
  }
  const hound = at(-len * 0.48, 0);
  room.box('marbleDark', [0.3, 0.17, 0.19], [hound[0], y, hound[2]], rotationY, { tile: 0.3 });
  room.geo('marbleDark', ball(0.1, 6), tiltMatrix([hound[0] - cos * 0.16, y + 0.14, hound[2] + sin * 0.16], [0, rotationY, 0], [1.25, 0.85, 0.9]), { tile: 0.3 });
  // A sword or a crozier laid down the length of the figure.
  const sword = at(0, 0.13);
  room.box('marbleDark', [len * 0.56, 0.05, 0.07], [sword[0], y + 0.18, sword[2]], rotationY, { tile: 0.3, castShadow: false });
  room.box('marbleDark', [0.06, 0.05, 0.24], [at(len * 0.26, 0.13)[0], y + 0.18, at(len * 0.26, 0.13)[2]], rotationY, { tile: 0.2, castShadow: false });
}

/**
 * A skull: cranium, brow, sockets, nasal hole and a jaw that has come loose.
 * Six pieces, and the two dark sockets are doing nine tenths of the work - a
 * pale sphere is a stone, and a pale sphere with two holes in it is never
 * anything else.
 */
export function skull(room: Room, x: number, y: number, z: number, rotationY = 0, scale = 1, material = 'bone'): void {
  const s = 0.11 * scale;
  const sin = Math.sin(rotationY);
  const cos = Math.cos(rotationY);
  const out = (d: number, up = 0, side = 0): Vec3 => [x - sin * d + cos * side, y + up, z - cos * d - sin * side];

  /*
   * Seven segments on an 11 cm dome, and four on the sockets below.
   *
   * A skull is the most repeated object in this pack - the ossuary is a wall of
   * them - and at nine segments the dome alone was 72 triangles. What makes a
   * skull read is written three lines down and it is not the roundness: it is
   * two dark spots the right size in the right place, and those cost nothing.
   */
  room.geo(material, ball(s, 7), tiltMatrix([x, y + s * 0.9, z], [0, rotationY, 0], [0.92, 1.05, 1.1]), { tile: 0.25, ...NO_SHADOW });
  // The face plate: a shorter box forward of the dome, which is what stops a
  // skull reading as a ball.
  room.box(material, [s * 1.3, s * 0.9, s * 0.5], out(s * 0.75, s * 0.5), rotationY, { tile: 0.2, castShadow: false });
  // The sockets are `bitumen`, not `stoneDark`, and they are nearly half the width
  // of the face. Two dark spots are the entire difference between a skull and a
  // stone, and at `stoneDark` under a tallow lamp they were mid-grey on beige - a
  // cairn of them read as a pile of potatoes from four metres.
  for (const side of [-1, 1]) {
    room.geo('bitumen', ball(s * 0.42, 4), poseMatrix(out(s * 0.94, s * 1.0, side * s * 0.44)), FLAT);
  }
  room.geo('bitumen', ball(s * 0.24, 4), tiltMatrix(out(s * 0.98, s * 0.58), [0, rotationY, 0], [0.7, 1.4, 1]), FLAT);
  // Cheekbones, and the jaw hanging open under them.
  for (const side of [-1, 1]) {
    room.box(material, [s * 0.3, s * 0.22, s * 0.4], out(s * 0.7, s * 0.66, side * s * 0.6), rotationY, { tile: 0.2, castShadow: false });
  }
  room.box(material, [s * 1.1, s * 0.3, s * 0.6], out(s * 0.62, s * 0.05), rotationY + 0.05, { tile: 0.2, castShadow: false });
  // Teeth: one pale strip. Individual teeth at this size are noise.
  room.box('bonePale', [s * 0.9, s * 0.1, s * 0.12], out(s * 0.86, s * 0.34), rotationY, { tile: 0.15, castShadow: false });
}

/**
 * A heap of bones: long ones crossed, a couple of skulls, and rib cage arcs.
 * Never a neat pile - what makes an ossuary heap read is that everything is
 * lying at a different angle.
 */
export function boneHeap(room: Room, x: number, z: number, radius = 0.7, count = 14): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = room.range(0, radius);
    const cx = x + Math.cos(a) * r;
    const cz = z + Math.sin(a) * r;
    const y = 0.04 + room.range(0, 0.16);
    const kind = i % 5;
    if (kind === 0) {
      // A rib: an arc of three short segments.
      const dir = room.range(0, Math.PI * 2);
      for (let k = 0; k < 3; k++) {
        const t = k / 3;
        strut(
          room,
          'bone',
          [cx + Math.cos(dir + t) * t * 0.3, y + t * 0.05, cz + Math.sin(dir + t) * t * 0.3],
          [cx + Math.cos(dir + t + 0.5) * (t + 0.34) * 0.3, y + (t + 0.3) * 0.05, cz + Math.sin(dir + t + 0.5) * (t + 0.34) * 0.3],
          0.014,
          4,
          NO_SHADOW,
        );
      }
    } else if (kind === 1) {
      skull(room, cx, y, cz, room.range(0, Math.PI * 2), room.range(0.85, 1.05), i % 3 === 0 ? 'boneDark' : 'bone');
    } else {
      // A long bone with a knuckle at each end. The knuckles are what separate
      // femurs from dowels.
      const dir = room.range(0, Math.PI * 2);
      const len = room.range(0.24, 0.44);
      const from: Vec3 = [cx - Math.cos(dir) * len * 0.5, y, cz - Math.sin(dir) * len * 0.5];
      const to: Vec3 = [cx + Math.cos(dir) * len * 0.5, y + room.range(-0.02, 0.05), cz + Math.sin(dir) * len * 0.5];
      strut(room, i % 4 === 0 ? 'boneDark' : 'bone', from, to, 0.021, 5, NO_SHADOW);
      room.geo('bone', ball(0.036, 6), poseMatrix(from), NO_SHADOW);
      room.geo('bone', ball(0.034, 6), poseMatrix(to), NO_SHADOW);
    }
  }
}

/**
 * A wall of stacked bone: courses of long bones laid end-on with a course of
 * skulls every third. The ossuary's whole reason for existing.
 *
 * The gaps are the horror. A solid field of ivory reads as gravel, so the
 * courses are set proud of a dark ground and the skull rows are pushed forward
 * of the bone rows.
 */
export function boneStack(room: Room, side: Side, along: number, width = 3.0, height = 1.5, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.06, cell);
  const [x, , z] = position;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (a: number, y: number, d: number): Vec3 => [x + cos * a - sin * d, y, z - sin * a - cos * d];

  // The dark ground the stack stands against, so every gap reads as depth.
  room.box('stoneDark', [width, height + 0.1, 0.05], at(0, 0, -0.02), rotationY, { tile: 0.5 });

  /**
   * A skull built for a WALL rather than for a table: a dome, two socket boxes
   * and a jaw. Sixty triangles instead of the two hundred the full `skull()`
   * spends, which matters because a room faced in these places two hundred of
   * them - the first pass of the bone chapel came out at 96,000 triangles
   * against a budget of 25,000, and every one of them was here.
   */
  const wallSkull = (a: number, y: number, d: number, dark: boolean): void => {
    const p = at(a, y, d);
    room.geo(dark ? 'boneDark' : 'bone', ball(0.105, 6), tiltMatrix(p, [0, rotationY, 0], [1, 1.1, 1.15]), { tile: 0.25 });
    for (const s of [-1, 1]) {
      room.box('bitumen', [0.07, 0.05, 0.02], at(a + s * 0.038, y - 0.004, d + 0.09), rotationY, { tile: 0.2 });
    }
    room.box(dark ? 'boneDark' : 'bonePale', [0.085, 0.036, 0.05], at(a, y - 0.085, d + 0.04), rotationY, { tile: 0.2 });
  };

  const courseH = 0.3;
  const courses = Math.max(3, Math.floor(height / courseH));
  for (let c = 0; c < courses; c++) {
    const y = 0.1 + c * courseH;
    // A skull row every OTHER course rather than every third: at chest height a
    // stack is only four or five courses tall, and one skull row in five reads as a
    // wine rack with something odd on one shelf.
    const skulls = c % 2 === 1;
    // Coarse on purpose. At 0.32 the femur ends were 3 cm discs in rows of sixteen,
    // which from a doorway is a rack of bottle bottoms rather than a wall of bone.
    const pitch = skulls ? 0.42 : 0.44;
    const n = Math.floor(width / pitch);
    for (let i = 0; i < n; i++) {
      const a = -width / 2 + pitch * (i + 0.5) + (c % 2) * pitch * 0.28;
      if (a < -width / 2 + 0.05 || a > width / 2 - 0.05) continue;
      if ((i * 7 + c * 3) % 11 === 0) continue; // a gap: nothing here was stacked neatly
      if (skulls) {
        wallSkull(a, y + 0.09, 0.14, (i + c) % 5 === 2);
      } else {
        // A femur end-on: a short five-sided cylinder pointing out of the wall with
        // its condyle on the end. The knuckle is the difference between a wall of
        // bone and a wall of dowels, and one six-sided ball each is what it costs.
        const len = 0.22 + ((i * 3 + c) % 3) * 0.05;
        strut(room, (i + c) % 5 === 0 ? 'boneDark' : 'bone', at(a, y + courseH * 0.42, 0.02), at(a, y + courseH * 0.44, len), 0.052, 5, NO_SHADOW);
        room.geo('bonePale', ball(0.062, 6), poseMatrix(at(a, y + courseH * 0.44, len)), { tile: 0.2 });
      }
    }
    // A shelf plank between courses. It is the horizontal line that says somebody
    // put these here in layers, and without it the stack is a field of one thing.
    if (c > 0) room.box('stonePale', [width, 0.035, 0.16], at(0, y - 0.03, 0.08), rotationY, { tile: 0.4 });
  }
}

/**
 * A wrapped body on a shelf, a bier or the floor. Six tapering segments, the
 * cords that bind them, and a head - and the head is the only part anybody
 * looks at, so it is the only sphere.
 */
export function wrappedBody(room: Room, x: number, y: number, z: number, rotationY = 0, len = 1.8, gilt = false): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (along: number, across = 0): Vec3 => [x + cos * along + sin * across, 0, z - sin * along + cos * across];

  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const w = 0.36 - Math.pow(t, 1.4) * 0.2;
    const h = 0.27 - t * 0.13;
    const p = at(-len / 2 + (len * (i + 0.5)) / 6);
    room.box(i === 0 ? 'linenLit' : 'linen', [len / 6 + 0.02, h, w], [p[0], y, p[2]], rotationY + (i - 2.5) * 0.012, { tile: 0.6 });
  }
  const head = at(-len / 2 + 0.12);
  room.geo('linen', ball(0.15, 9), tiltMatrix([head[0], y + 0.17, head[2]], [0, rotationY + room.range(-0.25, 0.25), 0], [1, 1.15, 0.92]), { tile: 0.5, ...NO_SHADOW });
  if (gilt) {
    // A gilded mask over the face, and a collar under it. The one bright thing.
    const face = at(-len / 2 + 0.02);
    room.geo('goldPlain', ball(0.13, 9), tiltMatrix([face[0], y + 0.17, face[2]], [0, rotationY, 0], [0.7, 1.1, 0.95]), { tile: 0.3, ...NO_SHADOW });
    room.box('goldDim', [0.1, 0.05, 0.34], [at(-len / 2 + 0.3)[0], y + 0.2, at(-len / 2 + 0.3)[2]], rotationY, { tile: 0.3, castShadow: false });
  }
  for (const t of [0.24, 0.5, 0.76]) {
    const p = at(-len / 2 + len * t);
    room.box('rope', [0.035, 0.2, 0.32], [p[0], y + 0.03, p[2]], rotationY, { tile: 0.2, castShadow: false });
  }
}

/** A lead ossuary urn or an alabaster jar, depending on which half of the map. */
export function urn(room: Room, x: number, y: number, z: number, size = 0.34, warm = false): void {
  const material = warm ? 'alabaster' : 'lead';
  room.geo(material, cyl(size * 0.3, size * 0.22, size, 10), poseMatrix([x, y + size / 2, z]), { tile: 0.3, ...NO_SHADOW });
  room.geo(material, cyl(size * 0.34, size * 0.3, size * 0.1, 10), poseMatrix([x, y + size * 0.95, z]), { tile: 0.2, ...NO_SHADOW });
  room.geo(material, ball(size * 0.3, 9), tiltMatrix([x, y + size * 1.04, z], [0, 0, 0], [1, 0.5, 1]), { tile: 0.2, ...NO_SHADOW });
  room.geo(warm ? 'goldDim' : 'ironDark', ring(size * 0.1, size * 0.02, 8), tiltMatrix([x, y + size * 1.12, z], [Math.PI / 2, 0, 0]), NO_SHADOW);
}

/**
 * A canopic jar, with one of the four heads on it. The heads are what make a row
 * of them read as four gods rather than as four pots, so each is three pieces
 * and no more.
 */
export function canopic(room: Room, x: number, y: number, z: number, head: 0 | 1 | 2 | 3, rotationY = 0, size = 0.4): void {
  room.geo('alabaster', cyl(size * 0.3, size * 0.24, size * 0.78, 10), poseMatrix([x, y + size * 0.39, z]), { tile: 0.3, ...NO_SHADOW });
  room.box('surface.glyph', [size * 0.3, size * 0.3, 0.02], [x - Math.sin(rotationY) * size * 0.29, y + size * 0.2, z - Math.cos(rotationY) * size * 0.29], rotationY, {
    tile: 0.3,
    castShadow: false,
  });
  const hy = y + size * 0.78;
  room.geo('alabaster', cyl(size * 0.28, size * 0.3, size * 0.08, 10), poseMatrix([x, hy + size * 0.04, z]), NO_SHADOW);
  const sin = Math.sin(rotationY);
  const cos = Math.cos(rotationY);
  if (head === 0) {
    // A man: a plain head in a striped headcloth.
    room.geo('alabaster', ball(size * 0.22, 9), tiltMatrix([x, hy + size * 0.26, z], [0, rotationY, 0], [0.9, 1.1, 0.95]), NO_SHADOW);
    for (const s of [-1, 1]) {
      room.box('alabaster', [size * 0.1, size * 0.26, size * 0.09], [x + cos * s * size * 0.18, hy + size * 0.14, z - sin * s * size * 0.18], rotationY, NO_SHADOW);
    }
  } else if (head === 1) {
    // A jackal: a long muzzle and two tall ears, and nothing else is needed.
    room.geo('bitumen', ball(size * 0.18, 8), tiltMatrix([x, hy + size * 0.24, z], [0, rotationY, 0], [0.9, 1, 1]), NO_SHADOW);
    room.box('bitumen', [size * 0.12, size * 0.11, size * 0.3], [x - sin * size * 0.2, hy + size * 0.2, z - cos * size * 0.2], rotationY, NO_SHADOW);
    for (const s of [-1, 1]) {
      room.geo('bitumen', spike(size * 0.06, size * 0.28, 5), tiltMatrix([x + cos * s * size * 0.11, hy + size * 0.46, z - sin * s * size * 0.11], [0, 0, s * 0.12]), NO_SHADOW);
    }
  } else if (head === 2) {
    // A falcon: a round head and a hooked beak.
    room.geo('alabaster', ball(size * 0.2, 9), poseMatrix([x, hy + size * 0.24, z]), NO_SHADOW);
    room.geo('goldDim', spike(size * 0.07, size * 0.18, 5), tiltMatrix([x - sin * size * 0.2, hy + size * 0.22, z - cos * size * 0.2], [1.4, rotationY, 0]), NO_SHADOW);
  } else {
    // A baboon: a heavy brow and a mane.
    room.geo('bone', ball(size * 0.21, 9), tiltMatrix([x, hy + size * 0.24, z], [0, rotationY, 0], [1, 0.95, 0.9]), NO_SHADOW);
    room.geo('boneDark', ring(size * 0.24, size * 0.06, 10), poseMatrix([x, hy + size * 0.24, z], rotationY), NO_SHADOW);
    room.box('bone', [size * 0.22, size * 0.07, size * 0.12], [x - sin * size * 0.18, hy + size * 0.28, z - cos * size * 0.18], rotationY, NO_SHADOW);
  }
}

/* --- the Order: altars, books, gates -------------------------------------------- */

/**
 * An altar: a stone mensa on two piers, a frontal cloth, a pair of candlesticks
 * and whatever is standing between them. `y` is the floor.
 */
export function altar(room: Room, x: number, z: number, rotationY = 0, width = 1.7, cross = true): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (along: number, across: number): Vec3 => [x + cos * along + sin * across, 0, z - sin * along + cos * across];

  // Two piers rather than a solid block: the dark gap under an altar is worth
  // more than the stone.
  for (const s of [-1, 1]) {
    const p = at(s * (width / 2 - 0.22), 0);
    room.box('stonePale', [0.34, 0.86, 0.62], [p[0], 0, p[2]], rotationY, { tile: 0.6 });
  }
  room.box('marble', [width, 0.14, 0.78], [x, 0.86, z], rotationY, { tile: 0.8 });
  room.box('marbleDark', [width + 0.1, 0.05, 0.86], [x, 1.0, z], rotationY, { tile: 0.5, castShadow: false });
  // The frontal: a hanging cloth, its bottom edge irregular, faintly self-lit so
  // a lamp behind it glows through rather than punching a hole.
  const front = at(0, -0.42);
  room.box('velvet', [width - 0.1, 0.74, 0.03], [front[0], 0.1, front[2]], rotationY, { tile: 0.7, castShadow: false });
  room.box('goldDim', [width - 0.1, 0.05, 0.04], [front[0], 0.78, front[2]], rotationY, { tile: 0.3, castShadow: false });
  for (let i = 0; i < 5; i++) {
    const p = at(-width / 2 + 0.12 + i * ((width - 0.24) / 4), -0.42);
    room.box('velvetDark', [0.12, room.range(0.06, 0.16), 0.035], [p[0], 0.06, p[2]], rotationY, { tile: 0.3, castShadow: false });
  }

  // Candlesticks, and the cross between them. Two heights, so the group has a
  // silhouette instead of a line.
  for (const s of [-1, 1]) {
    const p = at(s * (width / 2 - 0.2), 0.06);
    room.geo('brass', cyl(0.07, 0.09, 0.04, 9), poseMatrix([p[0], 1.03, p[2]]), NO_SHADOW);
    room.geo('brass', cyl(0.02, 0.028, 0.28, 7), poseMatrix([p[0], 1.19, p[2]]), NO_SHADOW);
    room.geo('brass', cyl(0.05, 0.035, 0.03, 8), poseMatrix([p[0], 1.34, p[2]]), NO_SHADOW);
    const len = room.range(0.14, 0.3);
    room.geo('wax', cyl(0.021, 0.025, len, 6), poseMatrix([p[0], 1.36 + len / 2, p[2]]), { tile: 0.2, ...NO_SHADOW });
    if (room.chance(0.7)) {
      room.geo('lumenTallow', ball(0.019, 7), tiltMatrix([p[0], 1.37 + len, p[2]], [0, 0, 0], [1, 1.4, 1]), FLAT);
      room.geo('flame', ball(0.015, 6), tiltMatrix([p[0], 1.41 + len, p[2]], [0, 0, 0], [0.7, 2.4, 0.7]), FLAT);
    }
  }
  if (cross) {
    const p = at(0, 0.08);
    room.box('brass', [0.14, 0.06, 0.14], [p[0], 1.03, p[2]], rotationY, NO_SHADOW);
    room.box('brass', [0.05, 0.62, 0.05], [p[0], 1.09, p[2]], rotationY, { tile: 0.3, castShadow: false });
    room.box('brass', [0.32, 0.05, 0.05], [p[0], 1.45, p[2]], rotationY, { tile: 0.3, castShadow: false });
    room.geo('itemGem', ball(0.03, 7), poseMatrix([p[0], 1.48, p[2]]), FLAT);
  }
  room.geo('wash.warm', disc(1.3, 14), tiltMatrix([x, 0.014, z], [-Math.PI / 2, 0, 0]), FLAT);

  room.collider({ kind: 'box', center: [x, z], halfExtents: [width / 2 - 0.04, 0.4], rotationY });
}

/** A lectern: a splayed foot, a shaft and a sloped desk with a book open on it. */
export function lectern(room: Room, x: number, z: number, rotationY = 0, open = true): void {
  const sin = Math.sin(rotationY);
  const cos = Math.cos(rotationY);
  post(room, 'timberDark', 0.16, 0.24, 0.1, [x, 0, z], 8, NO_SHADOW);
  post(room, 'timber', 0.055, 0.08, 1.02, [x, 0.1, z], 8, NO_SHADOW);
  room.geo('timberDark', ring(0.1, 0.02, 9), tiltMatrix([x, 0.62, z], [Math.PI / 2, 0, 0]), NO_SHADOW);
  // The desk, sloped toward the reader, with a lip so the book does not slide.
  room.box('timber', [0.56, 0.05, 0.42], [x, 1.1, z], rotationY, { tile: 0.5 });
  room.box('timber', [0.56, 0.06, 0.06], [x - sin * 0.2, 1.08, z - cos * 0.2], rotationY, { tile: 0.3, castShadow: false });
  if (open) {
    // Two leaves and a gutter between them. A flat slab is a table; the V is
    // what makes it a book.
    for (const s of [-1, 1]) {
      room.box('parchment', [0.26, 0.035, 0.36], [x + cos * s * 0.14 - sin * 0.02, 1.15, z - sin * s * 0.14 - cos * 0.02], rotationY - s * 0.06, {
        tile: 0.35,
        castShadow: false,
      });
    }
    room.box('itemAccent', [0.05, 0.045, 0.38], [x, 1.14, z], rotationY, { tile: 0.2, castShadow: false });
    // A ribbon marker hanging out of it.
    room.box('itemAccent', [0.03, 0.16, 0.012], [x - sin * 0.2, 1.0, z - cos * 0.2], rotationY, FLAT);
  }
  room.blockCircle(x, z, 0.28);
}

/** A pile of books and a rolled document or two. Flat, waxy, and never square. */
export function bookPile(room: Room, x: number, y: number, z: number, count = 4, rotationY = 0): void {
  let top = y;
  for (let i = 0; i < count; i++) {
    const w = room.range(0.22, 0.32);
    const d = room.range(0.16, 0.24);
    const h = room.range(0.045, 0.09);
    const turn = rotationY + room.range(-0.5, 0.5);
    room.box(i % 2 ? 'timberDark' : 'itemAccent', [w, h, d], [x + room.range(-0.03, 0.03), top, z + room.range(-0.03, 0.03)], turn, { tile: 0.3, castShadow: false });
    // The block of pages, set in from the boards on three sides.
    room.box('parchment', [w - 0.03, h * 0.7, d - 0.05], [x + room.range(-0.02, 0.02), top + h * 0.15, z + room.range(-0.02, 0.02)], turn, {
      tile: 0.3,
      castShadow: false,
    });
    top += h;
  }
  if (room.chance(0.6)) {
    room.geo('parchment', cyl(0.035, 0.035, 0.3, 8), tiltMatrix([x + room.range(-0.15, 0.15), top + 0.04, z + room.range(-0.1, 0.1)], [Math.PI / 2, room.range(0, 3), 0]), {
      tile: 0.3,
      ...NO_SHADOW,
    });
  }
}

/**
 * An iron gate or grille across a recess, a stair or a doorway you are not meant
 * to go through. Bars both ways, a lock plate, and it blocks.
 */
export function ironGate(room: Room, side: Side, along: number, width = 2.0, height = 2.3, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.12, cell);
  const [x, , z] = position;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (a: number, y: number, d = 0): Vec3 => [x + cos * a - sin * d, y, z - sin * a - cos * d];

  // Frame: two stiles and a head, all heavier than the bars.
  for (const s of [-1, 1]) {
    room.box('iron', [0.09, height, 0.11], at(s * width * 0.5, 0), rotationY, { tile: 0.4 });
  }
  room.box('iron', [width + 0.09, 0.1, 0.11], at(0, height - 0.1), rotationY, { tile: 0.4, castShadow: false });
  const bars = Math.max(5, Math.round(width / 0.19));
  for (let i = 1; i < bars; i++) {
    const a = -width / 2 + (width * i) / bars;
    room.geo('iron', cyl(0.019, 0.019, height - 0.1, 6), poseMatrix(at(a, (height - 0.1) / 2)), { tile: 0.3, castShadow: false });
    // Every third bar ends in a spear head, which is what stops a grille reading
    // as a fence panel.
    if (i % 3 === 0) room.geo('iron', spike(0.032, 0.14, 5), poseMatrix(at(a, height - 0.02)), NO_SHADOW);
  }
  for (const t of [0.3, 0.72]) {
    room.geo('iron', cyl(0.024, 0.024, width, 6), tiltMatrix(at(0, height * t), [0, rotationY, Math.PI / 2]), { tile: 0.3, castShadow: false });
  }
  // The lock: a plate, a ring handle and a hasp. Where a player's eye goes.
  room.box('ironPale', [0.2, 0.26, 0.05], at(width * 0.16, height * 0.44, 0.05), rotationY, { tile: 0.2, castShadow: false });
  room.geo('iron', ring(0.06, 0.014, 9), poseMatrix(at(width * 0.16, height * 0.4, 0.09), rotationY), NO_SHADOW);

  room.collider({ kind: 'box', center: [x, z], halfExtents: [width / 2, 0.1], rotationY });
}

/**
 * A stone bench-pew, as a burial chapel has instead of furniture: a slab on two
 * blocks, worn hollow, with a kneeler in front.
 */
export function pew(room: Room, x: number, z: number, rotationY = 0, width = 2.2): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  for (const s of [-1, 1]) {
    room.box('stone', [0.26, 0.42, 0.44], [x + cos * s * (width / 2 - 0.2), 0, z - sin * s * (width / 2 - 0.2)], rotationY, { tile: 0.5 });
  }
  room.box('stonePale', [width, 0.11, 0.5], [x, 0.42, z], rotationY, { tile: 0.7 });
  room.box('timberDark', [width - 0.2, 0.06, 0.28], [x - sin * 0.45, 0.06, z - cos * 0.45], rotationY, { tile: 0.4, castShadow: false });
  room.collider({ kind: 'box', center: [x, z], halfExtents: [width / 2 - 0.04, 0.24], rotationY });
}

/* --- the alchemist and the necromancer ------------------------------------------ */

/**
 * A working bench: a plank top on trestles, with whatever the room needs on it.
 * `y` of the top is 0.92, which is where every item anchor over a bench goes.
 */
export function bench(room: Room, x: number, z: number, rotationY = 0, width = 2.0, depth = 0.7): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  for (const s of [-1, 1]) {
    const px = x + cos * s * (width / 2 - 0.18);
    const pz = z - sin * s * (width / 2 - 0.18);
    // A trestle: two splayed legs and a cross brace, not a post.
    for (const t of [-1, 1]) {
      room.geo('timber', cyl(0.045, 0.055, 0.9, 6), tiltMatrix([px - sin * t * depth * 0.3, 0.45, pz - cos * t * depth * 0.3], [t * 0.06, rotationY, 0]), {
        tile: 0.4,
        castShadow: false,
      });
    }
    room.box('timber', [0.08, 0.07, depth * 0.7], [px, 0.3, pz], rotationY, { tile: 0.3, castShadow: false });
  }
  room.box('timber', [width, 0.07, depth], [x, 0.85, z], rotationY, { tile: 0.6 });
  room.box('timberDark', [width + 0.04, 0.03, depth + 0.04], [x, 0.82, z], rotationY, { tile: 0.4, castShadow: false });
  room.collider({ kind: 'box', center: [x, z], halfExtents: [width / 2 - 0.04, depth / 2 - 0.04], rotationY });
}

/**
 * An alembic: a retort over a burner, with a condenser arm running down into a
 * receiver. The arm is what makes it read as apparatus rather than as a bottle,
 * and the fluid inside is BACK-FACED so it draws behind the contents instead of
 * plugging the glass (docs/art/ROOM_REVIEW.md §4).
 */
export function alembic(room: Room, x: number, y: number, z: number, rotationY = 0, lit = true, fluid = 'fluidGreen'): void {
  const sin = Math.sin(rotationY);
  const cos = Math.cos(rotationY);
  // The stand: a tripod of iron over a spirit burner.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    room.geo('iron', cyl(0.008, 0.008, 0.2, 4), poseMatrix([x + Math.cos(a) * 0.1, y + 0.1, z + Math.sin(a) * 0.1]), NO_SHADOW);
  }
  room.geo('iron', ring(0.1, 0.008, 9), tiltMatrix([x, y + 0.2, z], [Math.PI / 2, 0, 0]), NO_SHADOW);
  room.geo('brass', cyl(0.055, 0.07, 0.05, 8), poseMatrix([x, y, z]), NO_SHADOW);
  if (lit) {
    room.geo('flameGreen', ball(0.035, 6), tiltMatrix([x, y + 0.08, z], [0, 0, 0], [0.8, 1.9, 0.8]), FLAT);
    room.geo('wash.cold', disc(0.4, 10), tiltMatrix([x, y - 0.02, z], [-Math.PI / 2, 0, 0]), FLAT);
  }
  // The cucurbit, its fluid, and the head with the beak coming off it.
  room.geo('glassVessel', ball(0.13, 10), poseMatrix([x, y + 0.3, z]), FLAT);
  room.geo(fluid, ball(0.115, 9), tiltMatrix([x, y + 0.27, z], [0, 0, 0], [1, 0.8, 1]), FLAT);
  room.geo('glassVessel', cyl(0.05, 0.09, 0.14, 9), poseMatrix([x, y + 0.4, z]), FLAT);
  room.geo('glassVessel', ball(0.075, 9), poseMatrix([x, y + 0.58, z]), FLAT);
  // The beak: two segments so it bends, ending over the receiver.
  const bx = x - sin * 0.22;
  const bz = z - cos * 0.22;
  strut(room, 'glassVessel', [x, y + 0.58, z], [bx, y + 0.5, bz], 0.018, 6, FLAT);
  strut(room, 'glassVessel', [bx, y + 0.5, bz], [bx - sin * 0.06, y + 0.24, bz - cos * 0.06], 0.018, 6, FLAT);
  // The receiver, with a little in the bottom of it.
  room.geo('glassVessel', cyl(0.06, 0.075, 0.16, 9), poseMatrix([bx - sin * 0.06, y + 0.08, bz - cos * 0.06]), FLAT);
  room.geo(fluid, cyl(0.062, 0.07, 0.05, 8), poseMatrix([bx - sin * 0.06, y + 0.02, bz - cos * 0.06]), FLAT);
}

/** A specimen jar with something in it. The something is always a silhouette. */
export function specimenJar(room: Room, x: number, y: number, z: number, size = 0.3, fluid = 'fluidAmber'): void {
  room.geo('glassVessel', cyl(size * 0.34, size * 0.34, size, 10), poseMatrix([x, y + size / 2, z]), FLAT);
  room.geo(fluid, cyl(size * 0.31, size * 0.31, size * 0.86, 10), poseMatrix([x, y + size * 0.45, z]), FLAT);
  // What is in it: a dark mass with a pale thing showing through. Two shapes at
  // two scales, because one is a blob.
  room.geo('fleshRot', ball(size * 0.2, 8), tiltMatrix([x, y + size * 0.42, z], [0, room.range(0, 3), 0], [1, 1.3, 0.85]), FLAT);
  room.geo('bonePale', ball(size * 0.075, 6), poseMatrix([x + size * 0.08, y + size * 0.6, z]), FLAT);
  room.geo('lead', cyl(size * 0.36, size * 0.34, size * 0.07, 10), poseMatrix([x, y + size, z]), NO_SHADOW);
  room.geo('wax', cyl(size * 0.3, size * 0.34, size * 0.05, 9), poseMatrix([x, y + size * 1.06, z]), NO_SHADOW);
}

/**
 * A carved and inlaid circle in the floor, with sigils round it. The one thing
 * in the pack that is unambiguously somebody's fault.
 *
 * Additive on top of an incised ring, so the glow adds light to the flagstones
 * instead of laying a dark disc over them.
 */
export function runeCircle(room: Room, x: number, z: number, radius = 1.5, soul = true): void {
  const glowName = soul ? 'runeSoul' : 'runeGold';
  const cut = 'stoneDark';
  // Two incised rings with the cut showing dark, and the glow sitting in the cut.
  for (const r of [radius, radius * 0.72]) {
    room.geo(cut, ring(r, 0.035, 30), tiltMatrix([x, 0.012, z], [Math.PI / 2, 0, 0]), FLAT);
    room.geo(glowName, ring(r, 0.018, 30), tiltMatrix([x, 0.018, z], [Math.PI / 2, 0, 0]), FLAT);
  }
  // The pentacle-ish chords between them: straight cuts, five of them.
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * Math.PI * 2;
    const a1 = (((i + 2) % 5) / 5) * Math.PI * 2;
    const from: Vec3 = [x + Math.cos(a0) * radius * 0.72, 0.014, z + Math.sin(a0) * radius * 0.72];
    const to: Vec3 = [x + Math.cos(a1) * radius * 0.72, 0.014, z + Math.sin(a1) * radius * 0.72];
    const mid: Vec3 = [(from[0] + to[0]) / 2, 0.015, (from[2] + to[2]) / 2];
    const len = Math.hypot(to[0] - from[0], to[2] - from[2]);
    const yaw = Math.atan2(to[0] - from[0], to[2] - from[2]);
    room.box(cut, [len, 0.006, 0.05], mid, yaw + Math.PI / 2, FLAT);
    room.box(glowName, [len, 0.006, 0.022], [mid[0], 0.018, mid[2]], yaw + Math.PI / 2, FLAT);
  }
  // Sigils in the band between the rings: short marks at ten stations, each a
  // different length, so it reads as writing rather than as a dial.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13;
    const r = radius * 0.86;
    const p: Vec3 = [x + Math.cos(a) * r, 0.017, z + Math.sin(a) * r];
    room.box(glowName, [0.05 + (i % 3) * 0.04, 0.005, 0.11], p, -a, FLAT);
  }
  // Wax stubs and spilt salt round the perimeter: somebody stood here for hours.
  for (let i = 0; i < 7; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = radius * room.range(1.02, 1.14);
    const cx = x + Math.cos(a) * r;
    const cz = z + Math.sin(a) * r;
    const len = room.range(0.06, 0.16);
    room.geo('wax', cyl(0.021, 0.026, len, 6), poseMatrix([cx, len / 2, cz]), { tile: 0.2, ...NO_SHADOW });
    room.geo(soul ? 'lumenSoul' : 'lumenTallow', ball(0.02, 6), tiltMatrix([cx, len + 0.02, cz], [0, 0, 0], [1, 1.4, 1]), FLAT);
    room.geo(soul ? 'flameGreen' : 'flame', ball(0.015, 6), tiltMatrix([cx, len + 0.06, cz], [0, 0, 0], [0.7, 2.4, 0.7]), FLAT);
    room.geo('natron', disc(room.range(0.1, 0.22), 9), tiltMatrix([cx, 0.011, cz], [-Math.PI / 2, room.range(0, 3), 0]), FLAT);
  }
  room.geo(soul ? 'wash.cold' : 'wash.gold', disc(radius * 1.05, 18), tiltMatrix([x, 0.02, z], [-Math.PI / 2, 0, 0]), FLAT);
}

/**
 * A stone slab table with a channel cut round it and a drain at one end: the
 * embalmer's bench, and the most unpleasant object in the map precisely because
 * it is so obviously a piece of professional equipment.
 */
export function slabTable(room: Room, x: number, z: number, rotationY = 0, length = 2.1): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (along: number, across: number): Vec3 => [x + cos * along + sin * across, 0, z - sin * along + cos * across];
  // Four blocks rather than legs: it was cut, not joined.
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      const p = at(a * (length / 2 - 0.28), b * 0.28);
      room.box('stoneWarm', [0.28, 0.78, 0.24], [p[0], 0, p[2]], rotationY, { tile: 0.5 });
    }
  }
  // The slab: a top with a raised lip and a shallow dish inside it, tilted a
  // couple of degrees toward the drain end.
  room.box('stoneWarmPale', [length, 0.16, 0.92], [x, 0.78, z], rotationY, { tile: 0.8 });
  // The dish is a shade DOWN from the slab, not black: `stoneDark` across the whole
  // top made the table read as a hole with a rim round it.
  room.box('stoneWarm', [length - 0.3, 0.03, 0.58], [x, 0.94, z], rotationY, { tile: 0.5, castShadow: false });
  for (const s of [-1, 1]) {
    const p = at(0, s * 0.42);
    room.box('stoneWarmPale', [length, 0.06, 0.08], [p[0], 0.94, p[2]], rotationY, { tile: 0.4, castShadow: false });
  }
  // The channel and the spout, at the low end.
  const low = at(-length / 2 + 0.1, 0);
  room.geo('stoneDark', disc(0.09, 10), tiltMatrix([low[0], 0.945, low[2]], [-Math.PI / 2, 0, 0]), FLAT);
  const spout = at(-length / 2 - 0.06, 0);
  room.box('stoneWarmPale', [0.2, 0.07, 0.16], [spout[0], 0.86, spout[2]], rotationY, { tile: 0.3, castShadow: false });
  // A jar under the spout, and a stain running to it.
  urn(room, spout[0] - cos * 0.04, 0, spout[2] + sin * 0.04, 0.3, true);
  room.geo('bitumen', disc(0.26, 10), tiltMatrix([spout[0], 0.012, spout[2]], [-Math.PI / 2, 0, 0]), FLAT);
  room.collider({ kind: 'box', center: [x, z], halfExtents: [length / 2 - 0.04, 0.44], rotationY });
}

/** A wall shelf with room for jars, books or a skull. Decoration - no collider. */
export function wallShelf(room: Room, side: Side, along: number, y: number, width = 1.3, cell: Cell = [0, 0]): { position: Vec3; rotationY: number } {
  const pose = wallPose(room, side, along, 0.16, cell);
  const [x, , z] = pose.position;
  const rotationY = pose.rotationY;
  room.box('timber', [width, 0.05, 0.32], [x, y, z], rotationY, { tile: 0.5, castShadow: false });
  // Two brackets under it, and a batten behind: a plank on a wall is a plank.
  for (const s of [-1, 1]) {
    const bx = x + Math.cos(rotationY) * s * (width / 2 - 0.12);
    const bz = z - Math.sin(rotationY) * s * (width / 2 - 0.12);
    room.box('ironDark', [0.05, 0.16, 0.24], [bx, y - 0.16, bz], rotationY, { tile: 0.2, castShadow: false });
    room.geo('ironDark', cyl(0.012, 0.012, 0.24, 4), tiltMatrix([bx, y - 0.1, bz], [0.9, rotationY, 0]), NO_SHADOW);
  }
  return pose;
}

/* --- the Necropolis --------------------------------------------------------- */

/**
 * A column. Four profiles, and the capital is what dates each one: a clustered
 * gothic pier, a papyrus bundle, a palm, or a plain drum.
 */
export function pillar(room: Room, x: number, z: number, style: 'cluster' | 'papyrus' | 'palm' | 'drum' = 'cluster', radius = 0.42): void {
  const { ceilingHeight } = room.ctx.dims;
  if (style === 'cluster') {
    // A pier of five shafts on a moulded base, with a ring of capitals. The
    // cluster is the read: one cylinder is a pipe.
    room.geo('stonePale', cyl(radius * 1.25, radius * 1.4, 0.18, 12), poseMatrix([x, 0.09, z]), { tile: 0.5 });
    room.geo('stone', cyl(radius * 1.05, radius * 1.15, 0.14, 12), poseMatrix([x, 0.25, z]), { tile: 0.5, castShadow: false });
    post(room, 'stone', radius * 0.62, radius * 0.66, ceilingHeight - 0.7, [x, 0.32, z], 10, SHADOW);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const px = x + Math.cos(a) * radius * 0.66;
      const pz = z + Math.sin(a) * radius * 0.66;
      post(room, 'stonePale', radius * 0.24, radius * 0.26, ceilingHeight - 0.78, [px, 0.32, pz], 8, SHADOW);
      // A shaft ring a third of the way up, which is what a tall shaft needs.
      room.geo('stone', ring(radius * 0.27, 0.035, 9), tiltMatrix([px, 1.4, pz], [Math.PI / 2, 0, 0]), NO_SHADOW);
    }
    // The capital: a bell, an abacus and a run of stiff-leaf under it.
    room.geo('stonePale', cyl(radius * 1.3, radius * 0.8, 0.26, 12), poseMatrix([x, ceilingHeight - 0.62, z]), { tile: 0.4 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      room.geo('stonePale', ball(0.11, 6), tiltMatrix([x + Math.cos(a) * radius * 1.05, ceilingHeight - 0.6, z + Math.sin(a) * radius * 1.05], [0, a, 0], [1, 1.3, 0.7]), {
        tile: 0.3,
      });
    }
    room.box('stonePale', [radius * 2.7, 0.14, radius * 2.7], [x, ceilingHeight - 0.36, z], 0, { tile: 0.5, castShadow: false });
  } else if (style === 'papyrus') {
    // A bundle of eight stems, swelling at the base and bound under the capital,
    // with closed buds at the top. All of it in warm stone.
    room.box('stoneWarmPale', [radius * 2.5, 0.16, radius * 2.5], [x, 0, z], 0, { tile: 0.6 });
    const stems = 6;
    for (let i = 0; i < stems; i++) {
      const a = (i / stems) * Math.PI * 2;
      const px = x + Math.cos(a) * radius * 0.62;
      const pz = z + Math.sin(a) * radius * 0.62;
      post(room, 'stoneWarm', radius * 0.2, radius * 0.28, ceilingHeight - 0.9, [px, 0.16, pz], 7);
    }
    post(room, 'stoneWarm', radius * 0.5, radius * 0.6, ceilingHeight - 0.9, [x, 0.16, z], 10, SHADOW);
    // The binding: five cords, which is where a papyrus column is unmistakable.
    for (let i = 0; i < 3; i++) {
      room.geo('stoneWarmPale', ring(radius * 0.92, 0.03, 10), tiltMatrix([x, ceilingHeight - 0.96 + i * 0.07, z], [Math.PI / 2, 0, 0]), NO_SHADOW);
    }
    room.geo('stoneWarm', cyl(radius * 1.15, radius * 0.9, 0.42, 12), poseMatrix([x, ceilingHeight - 0.72, z]), { tile: 0.5 });
    room.box('stoneWarmPale', [radius * 2.2, 0.16, radius * 2.2], [x, ceilingHeight - 0.3, z], 0, { tile: 0.5, castShadow: false });
    // A glyph band round the shaft at reading height, painted.
    room.geo('surface.glyph', cyl(radius * 1.06, radius * 1.06, 0.7, 12), poseMatrix([x, 1.45, z]), { tile: 0.5, castShadow: false });
  } else if (style === 'palm') {
    room.box('stoneWarmPale', [radius * 2.4, 0.14, radius * 2.4], [x, 0, z], 0, { tile: 0.6 });
    post(room, 'stoneWarm', radius * 0.78, radius * 0.94, ceilingHeight - 0.8, [x, 0.14, z], 12, SHADOW);
    for (let i = 0; i < 3; i++) {
      room.geo('stoneWarmPale', ring(radius * 0.86, 0.028, 10), tiltMatrix([x, ceilingHeight - 0.94 + i * 0.07, z], [Math.PI / 2, 0, 0]), NO_SHADOW);
    }
    // Eight fronds splaying out of the top: the capital is the whole silhouette.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      room.geo('stoneWarm', spike(0.13, 0.62, 5), tiltMatrix([x + Math.cos(a) * radius * 0.72, ceilingHeight - 0.5, z + Math.sin(a) * radius * 0.72], [0.34, -a, 0]), {
        tile: 0.4,
        castShadow: false,
      });
    }
    room.box('stoneWarmPale', [radius * 2.1, 0.15, radius * 2.1], [x, ceilingHeight - 0.28, z], 0, { tile: 0.5, castShadow: false });
  } else {
    room.geo('stonePale', cyl(radius * 1.15, radius * 1.25, 0.2, 12), poseMatrix([x, 0.1, z]), { tile: 0.5 });
    post(room, 'stone', radius * 0.9, radius, ceilingHeight - 0.5, [x, 0.2, z], 12, SHADOW);
    room.box('stonePale', [radius * 2.4, 0.16, radius * 2.4], [x, ceilingHeight - 0.3, z], 0, { tile: 0.5, castShadow: false });
  }
  room.blockCircle(x, z, radius * 1.1);
}

/**
 * Ranks of shabti: the little servant figures the dynasty buried by the hundred,
 * standing in rows on a shelf or a floor. Cheap, and they read as a CROWD, which
 * is the only reason they are here.
 */
export function shabtiRanks(room: Room, x: number, y: number, z: number, rows = 3, cols = 6, rotationY = 0, pitch = 0.17): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r * 5 + c * 3) % 9 === 0) continue; // one in nine has fallen or gone
      const along = (c - (cols - 1) / 2) * pitch;
      const across = (r - (rows - 1) / 2) * pitch;
      const px = x + cos * along + sin * across;
      const pz = z - sin * along + cos * across;
      const h = 0.14 + ((r * 3 + c) % 4) * 0.012;
      const material = (r + c) % 5 === 0 ? 'bitumen' : (r + c) % 3 === 0 ? 'alabaster' : 'stoneWarmPale';
      // A mummiform body: a tapering block with a head and folded arms.
      room.geo(material, cyl(h * 0.24, h * 0.3, h, 7), poseMatrix([px, y + h / 2, pz]), NO_SHADOW);
      room.geo(material, ball(h * 0.26, 7), tiltMatrix([px, y + h + h * 0.14, pz], [0, rotationY, 0], [0.85, 1.1, 0.9]), NO_SHADOW);
      room.box(material, [h * 0.44, h * 0.09, h * 0.16], [px - sin * h * 0.22, y + h * 0.72, pz - cos * h * 0.22], rotationY, FLAT);
    }
  }
}

/** A model funerary boat on a stand: hull, prow, a cabin and a crew of two. */
export function funeraryBoat(room: Room, x: number, y: number, z: number, rotationY = 0, len = 0.9): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (along: number, across = 0): Vec3 => [x + cos * along + sin * across, 0, z - sin * along + cos * across];
  // The hull, in three widths so it has a sheer.
  for (let i = 0; i < 3; i++) {
    const t = (i + 0.5) / 3;
    const w = 0.2 - Math.abs(t - 0.5) * 0.16;
    const p = at(-len / 2 + len * t);
    room.box('timber', [len / 3 + 0.01, 0.1, w], [p[0], y, p[2]], rotationY, { tile: 0.3, castShadow: false });
  }
  // Prow and stern, curling up: two cones is all it takes.
  for (const s of [-1, 1]) {
    room.geo('timber', spike(0.05, 0.26, 6), tiltMatrix(at(s * len * 0.5, 0), [s * 0.5, rotationY, 0], [1, 1, 1]), NO_SHADOW);
  }
  // A cabin amidships, and two figures poling it. Two dark uprights on a pale
  // hull is the whole read at this scale.
  room.box('linen', [len * 0.3, 0.14, 0.16], [at(0)[0], y + 0.1, at(0)[2]], rotationY, { tile: 0.3, castShadow: false });
  for (const s of [-1, 1]) {
    const p = at(s * len * 0.28);
    room.geo('bitumen', cyl(0.02, 0.025, 0.11, 6), poseMatrix([p[0], y + 0.1, p[2]]), FLAT);
    room.geo('bitumen', ball(0.026, 6), poseMatrix([p[0], y + 0.22, p[2]]), FLAT);
  }
}

/* --- decay, water and growth ---------------------------------------------------- */

/**
 * Rubble and dust: chips of stone, bone fragments and a smear of dirt. Every
 * room gets two or three of these in the corners, and they are most of what
 * makes a floor look walked on rather than laid.
 */
export function debris(room: Room, x: number, z: number, radius = 0.8, count = 9, warm = false): void {
  room.geo(warm ? 'sandLoose' : 'ash', disc(radius * 1.15, 12), tiltMatrix([x, 0.011, z], [-Math.PI / 2, room.range(0, 3), 0]), FLAT);
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = room.range(0, radius);
    const size = room.range(0.05, 0.17);
    room.geo(
      i % 4 === 0 ? 'bone' : i % 3 === 0 ? 'stonePale' : 'stone',
      ball(size, 5),
      tiltMatrix([x + Math.cos(a) * r, size * 0.3, z + Math.sin(a) * r], [0, a, 0], [1.3, 0.55, 1.1]),
      { tile: 0.3, ...NO_SHADOW },
    );
  }
}

/** A drift of sand, blown into a corner or spilling through a doorway. */
export function sandDrift(room: Room, x: number, z: number, radius = 1.2, rotationY = 0): void {
  room.geo('surface.sand', disc(radius, 14), tiltMatrix([x, 0.013, z], [-Math.PI / 2, rotationY, 0]), FLAT);
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    room.geo(
      'sandLoose',
      ball(radius * room.range(0.3, 0.5), 8),
      tiltMatrix([x + Math.cos(rotationY) * (t - 0.5) * radius, 0.02, z - Math.sin(rotationY) * (t - 0.5) * radius], [0, rotationY, 0], [1.5, 0.18, 1]),
      { tile: 0.6, ...FLAT },
    );
  }
}

/**
 * Standing black water at deck level with a raised lip round it. You cannot
 * recess anything - the shell lays a solid floor slab per cell and everything
 * below y = 0 is behind it (docs/art/ROOM_REVIEW.md §4) - so a pool is water at
 * the floor plus a coaming, and that reads better anyway.
 */
export function pool(room: Room, x: number, z: number, w: number, d: number, lit = false, rotationY = 0): void {
  const material = lit ? 'waterLit' : 'water';
  room.box('stone', [w + 0.4, 0.13, d + 0.4], [x, 0, z], rotationY, { tile: 0.7 });
  room.box('stoneDark', [w + 0.1, 0.1, d + 0.1], [x, 0.03, z], rotationY, { tile: 0.5, castShadow: false });
  room.box(material, [w, 0.02, d], [x, 0.115, z], rotationY, FLAT);
  // Things in it: two stones breaking the surface, and a scum line on the lip.
  for (let i = 0; i < 3; i++) {
    room.geo('stoneDark', ball(room.range(0.08, 0.16), 6), tiltMatrix([x + room.range(-w / 3, w / 3), 0.1, z + room.range(-d / 3, d / 3)], [0, i, 0], [1.3, 0.5, 1]), FLAT);
  }
  if (lit) room.geo('wash.cold', disc(Math.max(w, d) * 0.9, 16), tiltMatrix([x, 0.13, z], [-Math.PI / 2, 0, 0]), FLAT);
  room.collider({ kind: 'box', center: [x, z], halfExtents: [w / 2 + 0.16, d / 2 + 0.16], rotationY });
}

/** A shallow puddle on the flags, with a wet halo round it. No collider. */
export function puddle(room: Room, x: number, z: number, radius = 0.6): void {
  room.geo('water', disc(radius, 14), tiltMatrix([x, 0.013, z], [-Math.PI / 2, room.range(0, 3), 0]), FLAT);
  room.geo('moss', disc(radius * 1.3, 14), tiltMatrix([x, 0.0115, z], [-Math.PI / 2, room.range(0, 3), 0]), FLAT);
}

/**
 * A cluster of luminous fungus: caps, stems, gills under the caps, and a mat of
 * mycelium under all of it. `lit` spends a real light; without it the cluster
 * still glows, it just does not throw anything.
 */
export function sporeCluster(room: Room, x: number, y: number, z: number, scale = 1, lit = false, intensity = 5, teal = false): void {
  const capMat = teal ? 'capTeal' : 'capViolet';
  room.geo('mycelium', disc(0.6 * scale, 12), tiltMatrix([x, y + 0.012, z], [-Math.PI / 2, room.range(0, 3), 0]), FLAT);
  const count = 4 + Math.floor(room.range(0, 4));
  let tallest = 0;
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = room.range(0, 0.32 * scale);
    const cx = x + Math.cos(a) * r;
    const cz = z + Math.sin(a) * r;
    const h = room.range(0.14, 0.5) * scale;
    const capR = room.range(0.07, 0.16) * scale;
    tallest = Math.max(tallest, h);
    const lean = room.range(-0.12, 0.12);
    room.geo('stem', cyl(capR * 0.28, capR * 0.42, h, 6), tiltMatrix([cx, y + h / 2, cz], [0, 0, lean]), { tile: 0.3, ...NO_SHADOW });
    /**
     * The cap: a squashed dome, and the gills UNDER it, which is where a mushroom is
     * brightest and what makes it read as lit from within.
     *
     * SIX segments, not nine. `tools/leakcheck.html?props=1` charged 6 % of the whole
     * map to this function - a thousand calls, most of the cost in 9 x 5 domes on
     * caps you read as a blob of light in the dark anyway. Six is 40 % cheaper and
     * looks the same at the fog density these are seen through.
     */
    room.geo(capMat, ball(capR, 6), tiltMatrix([cx + lean * h * 0.4, y + h, cz], [0, 0, lean], [1, 0.62, 1]), { tile: 0.3, ...FLAT });
    room.geo('gill', disc(capR * 0.8, 8), tiltMatrix([cx + lean * h * 0.4, y + h - capR * 0.05, cz], [Math.PI / 2, 0, 0]), FLAT);
    // A ring of smaller ones round the base of the big ones.
    if (i % 2 === 0) {
      for (let k = 0; k < 3; k++) {
        const b = a + k * 2.1;
        const kr = capR * 0.34;
        room.geo('stem', cyl(kr * 0.3, kr * 0.4, kr * 1.6, 4), poseMatrix([cx + Math.cos(b) * capR * 1.4, y + kr * 0.8, cz + Math.sin(b) * capR * 1.4]), FLAT);
        room.geo(capMat, ball(kr, 5), tiltMatrix([cx + Math.cos(b) * capR * 1.4, y + kr * 1.6, cz + Math.sin(b) * capR * 1.4], [0, 0, 0], [1, 0.6, 1]), FLAT);
      }
    }
  }
  room.geo(teal ? 'wash.cold' : 'wash.spore', disc(0.9 * scale, 12), tiltMatrix([x, y + 0.016, z], [-Math.PI / 2, 0, 0]), FLAT);
  if (lit) {
    const lamp = new THREE.PointLight(teal ? 0x50e8c0 : 0x9a5cff, intensity, room.ctx.dims.cellSize * 1.2, 2);
    lamp.position.set(x, y + tallest + 0.2, z);
    room.light(lamp);
    breathe(room, lamp, intensity);
  }
}

/** Bracket fungus growing out of a wall in shelves, like steps nobody can use. */
export function bracketFungus(room: Room, side: Side, along: number, y: number, count = 4, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.02, cell);
  const [x, , z] = position;
  for (let i = 0; i < count; i++) {
    const h = y + i * room.range(0.16, 0.3);
    const r = room.range(0.14, 0.3);
    const off = room.range(-0.2, 0.2);
    const px = x + Math.cos(rotationY) * off - Math.sin(rotationY) * r * 0.4;
    const pz = z - Math.sin(rotationY) * off - Math.cos(rotationY) * r * 0.4;
    room.geo('capPale', ball(r, 9), tiltMatrix([px, h, pz], [0, rotationY, 0], [1, 0.22, 0.7]), { tile: 0.4, ...NO_SHADOW });
    room.geo('gill', disc(r * 0.62, 9), tiltMatrix([px, h - r * 0.05, pz], [Math.PI / 2, 0, 0]), FLAT);
    // A dark rim on the leading edge: a bracket fungus has growth rings, and one
    // dark line does the whole job.
    room.geo('boneDark', ball(r * 0.98, 9), tiltMatrix([px, h - 0.01, pz], [0, rotationY, 0], [1, 0.1, 0.72]), FLAT);
  }
}

/** Roots coming through a wall or a vault and hanging down it. */
export function rootMass(room: Room, side: Side, along: number, cell: Cell = [0, 0], count = 5): void {
  const { ceilingHeight } = room.ctx.dims;
  const { position, rotationY } = wallPose(room, side, along, 0.05, cell);
  const [x, , z] = position;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  for (let i = 0; i < count; i++) {
    const a0 = room.range(-1.1, 1.1);
    const top: Vec3 = [x + cos * a0, ceilingHeight - room.range(0.1, 0.5), z - sin * a0];
    let from = top;
    // Three segments per root, each turning a little: a straight root is a cable.
    for (let k = 0; k < 3; k++) {
      const to: Vec3 = [
        from[0] + cos * room.range(-0.2, 0.2) - sin * room.range(0, 0.18),
        from[1] - room.range(0.4, 0.9),
        from[2] - sin * room.range(-0.2, 0.2) - cos * room.range(0, 0.18),
      ];
      strut(room, k === 0 ? 'root' : 'rootPale', from, to, 0.055 - k * 0.014, 6, NO_SHADOW);
      from = to;
    }
    if (i % 2 === 0) {
      room.geo('capPale', ball(room.range(0.05, 0.09), 7), tiltMatrix(from, [0, 0, 0], [1.4, 0.5, 1.4]), FLAT);
    }
  }
}

/** Cobweb in a corner: two crossed quads and a hanging strand. Never opaque. */
export function cobweb(room: Room, x: number, y: number, z: number, size = 0.8, rotationY = 0): void {
  room.geo('cobweb', quad(size, size), tiltMatrix([x, y, z], [0.5, rotationY, 0.7]), FLAT);
  room.geo('cobweb', quad(size * 0.7, size * 0.7), tiltMatrix([x, y - size * 0.2, z], [-0.4, rotationY + 1.2, 0.5]), FLAT);
  room.geo('cobweb', quad(0.04, size * 0.9), tiltMatrix([x + size * 0.2, y - size * 0.5, z], [0, rotationY, 0.1]), FLAT);
}

/**
 * A shaft of light coming down through something: dust in a beam, as two crossed
 * quads. Additive would blow out at this size, so it is a very thin haze - 0.035
 * opacity, and two crossed quads double whatever number you picked.
 */
export function dustShaft(room: Room, x: number, z: number, top: number, bottom: number, width = 1.0, warm = true): void {
  const h = top - bottom;
  const material = warm ? 'hazeWarm' : 'hazeCold';
  // HALF the width it is asked for, and one quad per axis. A 1.5 m crossed pair at
  // 0.035 opacity read as a sheet of glass standing in the middle of the room from
  // every doorway - the single most common way this pack made a room worse, and the
  // same failure the abyss pack's smoke had (docs/art/ROOM_REVIEW.md §4). A beam of
  // light is narrow, and it is the DUST in it you are meant to see.
  for (let i = 0; i < 2; i++) {
    room.geo(material, quad(width * 0.5, h), tiltMatrix([x, bottom + h / 2, z], [0, (i * Math.PI) / 2, 0.04]), FLAT);
  }
  // Motes in the beam, which is what actually sells it.
  dustMotes(room, x, bottom + h * 0.55, z, width * 0.4, 12, false);
  // The patch it lands on, which is what makes the beam look like it is coming
  // from somewhere rather than hanging in the air.
  room.geo(warm ? 'wash.warm' : 'wash.cold', disc(width * 0.6, 12), tiltMatrix([x, bottom + 0.015, z], [-Math.PI / 2, 0, 0]), FLAT);
}

/** Motes hanging in the air. Twenty specks, and a room stops being a vacuum. */
export function dustMotes(room: Room, x: number, y: number, z: number, radius = 1.6, count = 14, spore = false): void {
  // THREE segments and a fifth fewer of them. A mote is two pixels; at four
  // segments and eighteen a room this was 3.5 % of the map's triangles, which is a
  // lot to spend on something nobody can resolve the shape of.
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = room.range(0, radius);
    room.geo(
      spore ? 'lumenSpore' : 'waxPale',
      ball(room.range(0.008, 0.022), 3),
      poseMatrix([x + Math.cos(a) * r, y + room.range(-0.7, 0.9), z + Math.sin(a) * r]),
      FLAT,
    );
  }
}

/**
 * A funeral banner or a hanging pall: a rotting cloth on a pole, its bottom edge
 * torn to POINTS rather than merely uneven - what makes cloth read as torn is
 * the gaps (docs/art/ROOM_REVIEW.md §4).
 */
export function banner(room: Room, side: Side, along: number, y = 2.5, width = 0.9, cell: Cell = [0, 0]): void {
  const { position, rotationY } = wallPose(room, side, along, 0.06, cell);
  const [x, , z] = position;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  room.geo('iron', cyl(0.022, 0.022, width + 0.24, 6), tiltMatrix([x, y, z], [0, rotationY, Math.PI / 2]), NO_SHADOW);
  for (const s of [-1, 1]) {
    room.geo('iron', ball(0.035, 6), poseMatrix([x + cos * s * (width / 2 + 0.13), y, z - sin * s * (width / 2 + 0.13)]), NO_SHADOW);
  }
  const drop = 1.5;
  room.geo('velvet', quad(width, drop), poseMatrix([x - sin * 0.03, y - drop / 2, z - cos * 0.03], rotationY + Math.PI), {
    tile: 0.8,
    castShadow: false,
    receiveShadow: false,
  });
  // A charge on the field: a cross of gold thread, in two strips.
  room.geo('goldDim', quad(width * 0.16, drop * 0.5), poseMatrix([x - sin * 0.045, y - drop * 0.45, z - cos * 0.045], rotationY + Math.PI), FLAT);
  room.geo('goldDim', quad(width * 0.5, drop * 0.1), poseMatrix([x - sin * 0.045, y - drop * 0.34, z - cos * 0.045], rotationY + Math.PI), FLAT);
  // The tatters: triangles hanging off the bottom edge, with gaps between them.
  const teeth = 6;
  for (let i = 0; i < teeth; i++) {
    if (i % 3 === 1) continue;
    const a = -width / 2 + (width * (i + 0.5)) / teeth;
    room.geo('velvetDark', spike(width / teeth / 1.7, room.range(0.14, 0.34), 3), tiltMatrix([x + cos * a - sin * 0.03, y - drop - 0.06, z - sin * a - cos * 0.03], [Math.PI, rotationY, 0]), FLAT);
  }
}

/**
 * A heap of treasure: coins, plate, a cup on its side and one thing with a
 * stone in it. Sealed away, and the point of the room it stands in.
 *
 * Gold is the loudest material in the map, so a hoard is a LOW mound with a few
 * tall objects in it - a heap of pale spheres at chest height reads as popcorn.
 */
export function coinHoard(room: Room, x: number, z: number, radius = 0.6): void {
  room.geo('goldDim', ball(radius, 12), tiltMatrix([x, 0.01, z], [0, room.range(0, 3), 0], [1, 0.24, 1]), { tile: 0.4, ...NO_SHADOW });
  for (let i = 0; i < 16; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = room.range(0, radius * 1.15);
    const s = room.range(0.03, 0.055);
    room.geo(i % 4 === 0 ? 'silver' : 'goldPlain', cyl(s, s, 0.012, 8), tiltMatrix([x + Math.cos(a) * r, 0.02 + room.range(0, 0.06), z + Math.sin(a) * r], [room.range(0, 1.4), a, 0]), FLAT);
  }
  // A cup on its side, a plate, and a crown: three silhouettes, three heights.
  room.geo('goldPlain', cyl(0.075, 0.055, 0.14, 9), tiltMatrix([x + radius * 0.3, 0.09, z - radius * 0.2], [1.5, 0.4, 0]), NO_SHADOW);
  room.geo('goldPlain', cyl(0.03, 0.05, 0.05, 8), tiltMatrix([x + radius * 0.3, 0.07, z - radius * 0.05], [1.5, 0.4, 0]), NO_SHADOW);
  room.geo('silver', cyl(0.14, 0.14, 0.014, 12), tiltMatrix([x - radius * 0.4, 0.08, z + radius * 0.3], [0.3, 0.8, 0.2]), NO_SHADOW);
  room.geo('goldPlain', cyl(0.11, 0.1, 0.07, 10, true), poseMatrix([x - radius * 0.1, 0.12, z - radius * 0.35]), NO_SHADOW);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    room.geo('goldPlain', spike(0.022, 0.07, 4), poseMatrix([x - radius * 0.1 + Math.cos(a) * 0.1, 0.19, z - radius * 0.35 + Math.sin(a) * 0.1]), FLAT);
  }
  room.geo('itemGem', ball(0.028, 7), poseMatrix([x - radius * 0.1, 0.21, z - radius * 0.35]), FLAT);
  room.geo('wash.gold', disc(radius * 1.5, 14), tiltMatrix([x, 0.017, z], [-Math.PI / 2, 0, 0]), FLAT);
}

/**
 * A reliquary: a gilded casket on a pillar with a crystal window in it and a
 * bone inside. The Order's most valuable object, and it is a finger.
 */
export function reliquary(room: Room, x: number, z: number, rotationY = 0, height = 1.0): void {
  const sin = Math.sin(rotationY);
  const cos = Math.cos(rotationY);
  room.box('stonePale', [0.52, 0.12, 0.52], [x, 0, z], rotationY, { tile: 0.5 });
  post(room, 'stone', 0.15, 0.19, height - 0.24, [x, 0.12, z], 10);
  room.box('stonePale', [0.46, 0.09, 0.46], [x, height - 0.12, z], rotationY, { tile: 0.4, castShadow: false });
  // The casket: a box with a gabled lid and gilt cresting along the ridge.
  room.box('gold', [0.44, 0.24, 0.28], [x, height - 0.03, z], rotationY, { tile: 0.4 });
  for (const s of [-1, 1]) {
    room.box('gold', [0.44, 0.16, 0.16], [x - sin * s * 0.07, height + 0.21, z - cos * s * 0.07], rotationY + s * 0.5, { tile: 0.3, castShadow: false });
  }
  room.box('goldDim', [0.46, 0.05, 0.05], [x, height + 0.29, z], rotationY, { tile: 0.2, castShadow: false });
  for (let i = 0; i < 4; i++) {
    room.geo('goldDim', spike(0.022, 0.06, 4), poseMatrix([x + cos * (-0.16 + i * 0.11), height + 0.34, z - sin * (-0.16 + i * 0.11)]), FLAT);
  }
  // The window, and the relic behind it. The bone must be BEHIND the glass, and
  // the glass carries a highlight rather than a glow.
  const front = 0.15;
  room.geo('bonePale', cyl(0.015, 0.019, 0.14, 6), tiltMatrix([x - sin * front * 0.5, height + 0.06, z - cos * front * 0.5], [0, rotationY, 0.35]), FLAT);
  room.geo('goldDim', ring(0.024, 0.008, 8), tiltMatrix([x - sin * front * 0.5, height + 0.02, z - cos * front * 0.5], [Math.PI / 2, rotationY, 0]), FLAT);
  room.geo('glassPane', quad(0.16, 0.14), poseMatrix([x - sin * front, height + 0.08, z - cos * front], rotationY + Math.PI), FLAT);
  room.geo('goldDim', ring(0.1, 0.014, 10), poseMatrix([x - sin * (front + 0.005), height + 0.08, z - cos * (front + 0.005)], rotationY), FLAT);
  room.geo('wash.gold', disc(0.8, 12), tiltMatrix([x, 0.015, z], [-Math.PI / 2, 0, 0]), FLAT);
  room.blockCircle(x, z, 0.26);
}

/**
 * A statue standing free on the floor. `kind` picks who: a hooded saint of the
 * Order, a jackal-headed sentinel, or a striding ka-figure with its arms down.
 *
 * All three are built from a profile that narrows, widens and narrows again. A
 * monotonic taper spun round an axis is a bottle, whatever you put on top of it.
 */
export function statue(room: Room, x: number, z: number, rotationY = 0, kind: 'saint' | 'sentinel' | 'ka' = 'saint', scale = 1): void {
  const sin = Math.sin(rotationY);
  const cos = Math.cos(rotationY);
  const s = scale;
  const material = kind === 'saint' ? 'marble' : kind === 'sentinel' ? 'bitumen' : 'stoneWarmPale';
  const trim = kind === 'saint' ? 'marbleDark' : 'goldDim';

  // A plinth, and it is never square to the room.
  const turn = rotationY + room.range(-0.12, 0.12);
  room.box('stonePale', [0.8 * s, 0.24 * s, 0.8 * s], [x, 0, z], turn, { tile: 0.6 });
  room.box('stone', [0.66 * s, 0.1 * s, 0.66 * s], [x, 0.24 * s, z], turn, { tile: 0.5, castShadow: false });
  const base = 0.34 * s;

  if (kind === 'ka') {
    // Striding: one foot forward, arms at the sides, fists closed. It is the
    // FOOT that says dynastic, so it is placed first.
    const back = 0.1 * s;
    for (const side of [-1, 1]) {
      const fx = x + cos * side * 0.13 * s - sin * (side > 0 ? back : -back);
      const fz = z - sin * side * 0.13 * s - cos * (side > 0 ? back : -back);
      room.box(material, [0.16 * s, 0.09 * s, 0.36 * s], [fx, base, fz], turn, { tile: 0.3, castShadow: false });
      room.geo(material, cyl(0.075 * s, 0.09 * s, 0.66 * s, 7), poseMatrix([fx, base + 0.42 * s, fz]), { tile: 0.4, ...SHADOW });
      // Arms down the sides, ending in fists: the pose of every ka-statue there
      // has ever been.
      room.geo(material, cyl(0.05 * s, 0.058 * s, 0.62 * s, 6), poseMatrix([x + cos * side * 0.22 * s, base + 0.9 * s, z - sin * side * 0.22 * s]), { tile: 0.3, ...NO_SHADOW });
      room.geo(material, ball(0.06 * s, 7), poseMatrix([x + cos * side * 0.22 * s, base + 0.6 * s, z - sin * side * 0.22 * s]), NO_SHADOW);
    }
    room.geo(material, cyl(0.2 * s, 0.24 * s, 0.5 * s, 9), poseMatrix([x, base + 0.72 * s, z]), { tile: 0.4, ...SHADOW });
    room.geo(material, cyl(0.26 * s, 0.2 * s, 0.5 * s, 9), poseMatrix([x, base + 1.2 * s, z]), { tile: 0.4, ...SHADOW });
    // A kilt, which is one box and immediately reads.
    room.box(material, [0.44 * s, 0.3 * s, 0.34 * s], [x, base + 0.68 * s, z], turn, { tile: 0.4, castShadow: false });
    room.geo(material, ball(0.15 * s, 9), tiltMatrix([x, base + 1.82 * s, z], [0, turn, 0], [0.9, 1.1, 0.95]), { tile: 0.3 });
    // The nemes, lappets and a uraeus over the brow.
    for (const side of [-1, 1]) {
      room.box(material, [0.11 * s, 0.36 * s, 0.15 * s], [x + cos * side * 0.16 * s - sin * 0.04 * s, base + 1.66 * s, z - sin * side * 0.16 * s - cos * 0.04 * s], turn, {
        tile: 0.3,
        castShadow: false,
      });
    }
    room.geo(material, ball(0.17 * s, 9), tiltMatrix([x, base + 1.9 * s, z], [0, turn, 0], [1, 0.7, 1.1]), { tile: 0.3, castShadow: false });
    room.geo(trim, ball(0.04 * s, 6), poseMatrix([x - sin * 0.15 * s, base + 1.95 * s, z - cos * 0.15 * s]), FLAT);
    room.box(trim, [0.36 * s, 0.06 * s, 0.2 * s], [x, base + 1.5 * s, z], turn, { tile: 0.2, castShadow: false });
  } else if (kind === 'sentinel') {
    // A seated jackal on a shrine chest: the shape is a long back sloping to a
    // raised head, and the ears are the read from any distance.
    room.box('stoneWarm', [0.9 * s, 0.5 * s, 0.5 * s], [x, base, z], turn, { tile: 0.5, ...SHADOW });
    room.box(material, [0.72 * s, 0.26 * s, 0.3 * s], [x, base + 0.5 * s, z], turn, { tile: 0.4 });
    // Front legs down the face of the chest, and the chest of the animal.
    for (const side of [-1, 1]) {
      room.geo(material, cyl(0.05 * s, 0.055 * s, 0.5 * s, 6), tiltMatrix([x - sin * 0.3 * s + cos * side * 0.1 * s, base + 0.5 * s, z - cos * 0.3 * s - sin * side * 0.1 * s], [0.1, turn, 0]), {
        tile: 0.3,
        ...NO_SHADOW,
      });
    }
    room.geo(material, cyl(0.14 * s, 0.18 * s, 0.44 * s, 8), tiltMatrix([x - sin * 0.16 * s, base + 0.86 * s, z - cos * 0.16 * s], [0.16, turn, 0]), { tile: 0.4 });
    room.geo(material, ball(0.13 * s, 9), tiltMatrix([x - sin * 0.2 * s, base + 1.14 * s, z - cos * 0.2 * s], [0, turn, 0], [0.85, 1, 1]), { tile: 0.3 });
    room.box(material, [0.13 * s, 0.11 * s, 0.32 * s], [x - sin * 0.38 * s, base + 1.1 * s, z - cos * 0.38 * s], turn, { tile: 0.3, castShadow: false });
    for (const side of [-1, 1]) {
      room.geo(material, spike(0.05 * s, 0.3 * s, 5), tiltMatrix([x + cos * side * 0.09 * s - sin * 0.16 * s, base + 1.32 * s, z - sin * side * 0.09 * s - cos * 0.16 * s], [0, turn, side * 0.1]), {
        tile: 0.3,
        ...NO_SHADOW,
      });
    }
    // A tail curled down the side of the chest, and a gold collar.
    strut(room, material, [x + cos * 0.3 * s + sin * 0.3 * s, base + 0.7 * s, z - sin * 0.3 * s + cos * 0.3 * s], [x + sin * 0.42 * s, base + 0.4 * s, z + cos * 0.42 * s], 0.035 * s, 6, NO_SHADOW);
    room.geo(trim, ring(0.15 * s, 0.03 * s, 10), tiltMatrix([x - sin * 0.14 * s, base + 0.98 * s, z - cos * 0.14 * s], [0.16, turn, 0]), NO_SHADOW);
  } else {
    // A hooded figure. The hood is deep enough that where the face should be is
    // simply dark, and the sleeves end in nothing - empty sleeves are what
    // separate a robed figure from an object (docs/art/ROOM_REVIEW.md §4).
    room.geo(material, cyl(0.34 * s, 0.42 * s, 0.9 * s, 10), poseMatrix([x, base + 0.45 * s, z]), { tile: 0.5, ...SHADOW });
    room.geo(material, cyl(0.3 * s, 0.34 * s, 0.44 * s, 10), poseMatrix([x, base + 1.35 * s, z]), { tile: 0.4 });
    room.geo(material, cyl(0.34 * s, 0.28 * s, 0.2 * s, 10), poseMatrix([x, base + 1.79 * s, z]), { tile: 0.3, castShadow: false });
    // Folds: four vertical ridges down the robe. Without them it is a bollard.
    for (let i = 0; i < 5; i++) {
      const a = turn + (i / 5) * Math.PI * 2 + 0.4;
      room.geo(material, cyl(0.045 * s, 0.06 * s, 0.86 * s, 5), poseMatrix([x + Math.cos(a) * 0.36 * s, base + 0.45 * s, z + Math.sin(a) * 0.36 * s]), { tile: 0.3, castShadow: false });
    }
    room.geo(material, ball(0.2 * s, 10), tiltMatrix([x, base + 2.0 * s, z], [0, turn, 0], [1, 1.05, 1.12]), { tile: 0.3 });
    // The dark where the face is.
    room.geo('stoneDark', ball(0.13 * s, 8), poseMatrix([x - sin * 0.12 * s, base + 1.97 * s, z - cos * 0.12 * s]), FLAT);
    // Sleeves, empty, hanging forward with a gap under each cuff.
    for (const side of [-1, 1]) {
      room.geo(material, cyl(0.075 * s, 0.11 * s, 0.66 * s, 7), tiltMatrix([x + cos * side * 0.28 * s - sin * 0.08 * s, base + 1.28 * s, z - sin * side * 0.28 * s - cos * 0.08 * s], [0.2, turn, side * 0.09]), {
        tile: 0.3,
        ...NO_SHADOW,
      });
      room.geo('stoneDark', disc(0.07 * s, 8), tiltMatrix([x + cos * side * 0.3 * s - sin * 0.14 * s, base + 0.96 * s, z - sin * side * 0.3 * s - cos * 0.14 * s], [Math.PI / 2, 0, 0]), FLAT);
    }
    room.geo(trim, ring(0.2 * s, 0.03 * s, 10), tiltMatrix([x, base + 1.74 * s, z], [Math.PI / 2, 0, 0]), NO_SHADOW);
  }
  room.blockCircle(x, z, 0.42 * scale);
}

/**
 * A hanging gibbet cage with what is left of its occupant in it. Loose, because
 * it turns; and one of the two or three things in this pack that is unmistakably
 * a punishment rather than a burial.
 */
export function gibbet(room: Room, x: number, z: number, drop = 0.9): void {
  const { ceilingHeight } = room.ctx.dims;
  const swing = swinging(room, x, ceilingHeight - 0.1, z);

  const links = Math.max(3, Math.round(drop / 0.15));
  for (let i = 0; i < links; i++) {
    swing.put('iron', ring(0.034, 0.01, 7), tiltMatrix([0, -0.06 - i * (drop / links), 0], [i % 2 ? Math.PI / 2 : 0, 0, Math.PI / 2]));
  }
  // The cage: a hoop top and bottom, and staves between them, wider at the hips.
  const cy = -drop - 0.55;
  for (const [y, r] of [
    [cy + 0.55, 0.16],
    [cy + 0.3, 0.28],
    [cy - 0.05, 0.3],
    [cy - 0.5, 0.2],
  ] as const) {
    swing.put('iron', ring(r, 0.016, 12), tiltMatrix([0, y, 0], [Math.PI / 2, 0, 0]));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    swing.put('iron', cyl(0.012, 0.012, 1.1, 4), tiltMatrix([Math.cos(a) * 0.26, cy, Math.sin(a) * 0.26], [0, a, Math.cos(a) * 0.06]));
  }
  // What is in it: a skull leaning against the bars, and long bones fallen to the
  // bottom. Nothing else, because nothing else survives a cage.
  swing.put('bone', ball(0.1, 9), tiltMatrix([0.06, cy + 0.36, 0.04], [0, 0.4, 0.2], [0.92, 1.05, 1.1]));
  swing.put('stoneDark', ball(0.03, 5), poseMatrix([0.12, cy + 0.38, 0.1]));
  swing.put('stoneDark', ball(0.03, 5), poseMatrix([0.02, cy + 0.38, 0.13]));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    swing.put('bone', cyl(0.02, 0.02, 0.3, 5), tiltMatrix([Math.cos(a) * 0.1, cy - 0.44 + (i % 2) * 0.04, Math.sin(a) * 0.1], [Math.PI / 2, a, 0.2]));
  }
  sway(room, swing.finish(), 0.05, 0.32);
}

/**
 * A grave shaft: a stone rim at floor level with a black hole in it and a
 * windlass over it. You cannot cut the floor (ROOM_REVIEW.md §4), so the hole is
 * a dark disc at deck level inside a raised kerb - which reads as a shaft
 * precisely because the kerb tells you there is something to fall into.
 */
export function graveShaft(room: Room, x: number, z: number, radius = 1.0): void {
  const { ceilingHeight } = room.ctx.dims;
  // The kerb, in two courses, with one block missing.
  const blocks = 12;
  for (let i = 0; i < blocks; i++) {
    const a = (i / blocks) * Math.PI * 2;
    if (i === 5) continue;
    const px = x + Math.cos(a) * radius;
    const pz = z + Math.sin(a) * radius;
    room.box('stonePale', [0.42, 0.24, 0.3], [px, 0, pz], -a, { tile: 0.4 });
    if (i % 2 === 0) room.box('stone', [0.4, 0.1, 0.26], [px, 0.24, pz], -a + 0.04, { tile: 0.3, castShadow: false });
  }
  // The hole. Two discs: a dark one, and a darker smaller one inside it, which
  // is what gives a flat circle depth.
  room.geo('stoneDark', disc(radius - 0.12, 20), tiltMatrix([x, 0.02, z], [-Math.PI / 2, 0, 0]), FLAT);
  room.geo('bitumen', disc(radius - 0.34, 18), tiltMatrix([x, 0.025, z], [-Math.PI / 2, 0, 0]), FLAT);
  room.collider({ kind: 'circle', center: [x, z], radius: radius + 0.1 });

  // The windlass: two posts, a drum, a crank and a rope going down into it.
  for (const s of [-1, 1]) {
    const px = x + s * (radius + 0.12);
    room.box('timber', [0.16, 1.5, 0.16], [px, 0.2, z], 0, { tile: 0.5 });
    room.box('timber', [0.5, 0.1, 0.12], [px - s * 0.16, 1.4, z], 0, { tile: 0.3, castShadow: false });
  }
  room.geo('timber', cyl(0.12, 0.12, radius * 2 + 0.1, 9), tiltMatrix([x, 1.62, z], [0, 0, Math.PI / 2]), { tile: 0.4, castShadow: false });
  room.geo('iron', cyl(0.026, 0.026, 0.34, 6), tiltMatrix([x + radius + 0.28, 1.62, z], [0, 0, Math.PI / 2]), NO_SHADOW);
  room.geo('timber', cyl(0.03, 0.03, 0.26, 6), poseMatrix([x + radius + 0.44, 1.62, z]), NO_SHADOW);
  // The rope: on the drum, then straight down past the rim and gone.
  room.geo('rope', cyl(0.16, 0.16, 0.3, 9), tiltMatrix([x, 1.62, z], [0, 0, Math.PI / 2]), { tile: 0.3, castShadow: false });
  room.geo('rope', cyl(0.02, 0.02, 1.62, 6), poseMatrix([x, 0.81, z]), { tile: 0.3, ...NO_SHADOW });
  // A hook and a shred of what it was carrying.
  room.geo('iron', ring(0.05, 0.012, 8), tiltMatrix([x, 0.16, z], [0, 0.6, 0]), NO_SHADOW);
  room.geo('linen', quad(0.2, 0.3), tiltMatrix([x + 0.04, 0.28, z], [0.2, 0.8, 0.1]), FLAT);
  // Cold air coming up out of it.
  dustShaft(room, x, z, ceilingHeight - 0.2, 0.1, radius * 0.55, false);
}

/** Scarab shells and the husks of what fed on the dead. A floor detail with teeth. */
export function scarabLitter(room: Room, x: number, z: number, radius = 1.0, count = 16): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = room.range(0, radius);
    const s = room.range(0.025, 0.055);
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    // A carapace: a squashed dome with a dark seam down it, on its back as often
    // as not.
    room.geo(i % 4 === 0 ? 'bitumen' : 'resin', ball(s, 6), tiltMatrix([px, s * 0.4, pz], [0, a, i % 3 === 0 ? Math.PI : 0], [1.3, 0.55, 1]), FLAT);
    if (i % 3 !== 0) room.geo('bitumen', ball(s * 0.9, 5), tiltMatrix([px, s * 0.62, pz], [0, a, 0], [0.12, 0.5, 1.1]), FLAT);
    // Legs, for the ones on their backs. Three strokes each, and they are what
    // makes a player look twice.
    if (i % 3 === 0) {
      for (let k = 0; k < 3; k++) {
        room.geo('bitumen', cyl(0.004, 0.004, s * 1.3, 3), tiltMatrix([px, s * 0.7, pz], [1.1, a + k * 1.1, 0.4]), FLAT);
      }
    }
  }
}

/* --- the cave: the hill the crypt was cut into ---------------------------------- */

/**
 * A stalagmite: a stack of shallow discs, widest at the floor, each one a little
 * off the one below it so the column leans and bulges.
 *
 * Built as a stack rather than as a cone because a cone is a spike and a
 * stalagmite is a candle: the silhouette has to have steps in it, and the steps
 * are the ten thousand years.
 */
export function stalagmite(room: Room, x: number, z: number, height = 1.1, radius = 0.26): void {
  /**
   * Every section OVERLAPS the one below it by half its height, and the radius only
   * steps by a few per cent at a time.
   *
   * The first pass gave each section its own height and a big radius drop, and a
   * stalagmite came out as a stack of shallow discs - a wedding cake. What makes
   * dripstone read is a continuous taper with slight swellings on it, so the
   * sections have to blend into each other rather than sit on each other.
   */
  const steps = Math.max(4, Math.round(height / 0.2));
  let cx = x;
  let cz = z;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    // A swelling every third section, so the profile is not a cone either.
    const swell = 1 + (i % 3 === 1 ? 0.07 : 0);
    const r = radius * (1 - Math.pow(t, 1.4) * 0.7) * swell;
    const h = (height / steps) * 2.1;
    // OPEN-ended: a closed cylinder has a top cap, the cap is a horizontal disc
    // that catches the light differently from the sides, and fourteen of those up a
    // column is a stack of bright rings. Overlapping sections need no caps.
    room.geo(i % 4 === 0 ? 'flowstone' : 'caveRockPale', cyl(r * 0.93, r, h, 7, true), poseMatrix([cx, t * (height - h * 0.4) + h / 2, cz]), { tile: 0.5 });
    cx += room.range(-0.015, 0.015);
    cz += room.range(-0.015, 0.015);
  }
  // The wet tip, and the puddle it has been dripping into.
  room.geo('flowstone', ball(radius * 0.2, 6), poseMatrix([cx, height, cz]), NO_SHADOW);
  room.geo('water', disc(radius * 1.5, 10), tiltMatrix([x, 0.013, z], [-Math.PI / 2, room.range(0, 3), 0]), FLAT);
  if (height > 0.9) room.blockCircle(x, z, radius * 0.9);
}

/**
 * A flowstone column: a stalagmite and a stalactite that met. Floor to ceiling,
 * so it is the one thing in a cave that gives the space a vertical measure - and
 * the waist where the two halves joined is what tells the story.
 */
export function flowstoneColumn(room: Room, x: number, z: number, radius = 0.4): void {
  const { ceilingHeight } = room.ctx.dims;
  // Sections at twice the pitch they occupy, same as `stalagmite()`: overlapping
  // is what makes a column read as one object instead of as a stack of drums.
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    // Fat at both ends, pinched a third of the way up where the two halves met.
    const pinch = 0.5 + Math.abs(t - 0.36) * 1.3;
    const r = radius * Math.min(1, pinch);
    const h = (ceilingHeight / steps) * 2.0;
    room.geo(i % 4 === 0 ? 'flowstone' : 'caveRockPale', cyl(r * 0.96, r, h, 8, true), poseMatrix([x + Math.sin(t * 4) * 0.04, t * ceilingHeight, z]), {
      tile: 0.6,
      castShadow: true,
    });
  }
  // Drapery: two ribs of flowstone down the sides, as narrow BOXES. As quads they
  // were half-metre pale sheets standing in the room - the pane-of-fog failure with
  // an opaque material (docs/art/ROOM_REVIEW.md §4).
  for (const a of [0.8, 3.4]) {
    room.box(
      'flowstone',
      [0.12, ceilingHeight * 0.55, 0.3],
      [x + Math.cos(a) * radius * 0.85, ceilingHeight * 0.3, z + Math.sin(a) * radius * 0.85],
      -a,
      { tile: 0.6 },
    );
  }
  room.blockCircle(x, z, radius * 1.05);
}

/**
 * A rimstone pool: still water held behind a lip of calcite it built itself.
 *
 * Water at deck level with a raised rim, like every other pool in this pack
 * (docs/art/ROOM_REVIEW.md §4) - but the rim is a ring of lobes rather than a
 * kerb, because rimstone grows in scallops and a straight edge would read as
 * masonry.
 */
export function rimstonePool(room: Room, x: number, z: number, radius = 1.3, lit = false): void {
  const lobes = Math.max(8, Math.round(radius * 9));
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const r = radius * (0.94 + ((i * 7) % 5) * 0.03);
    room.geo('flowstone', ball(radius * 0.2, 6), tiltMatrix([x + Math.cos(a) * r, 0.02, z + Math.sin(a) * r], [0, a, 0], [1.5, 0.7, 1]), { tile: 0.4 });
  }
  room.geo(lit ? 'waterLit' : 'water', disc(radius * 0.92, 16), tiltMatrix([x, 0.075, z], [-Math.PI / 2, 0, 0]), FLAT);
  // Two stones breaking the surface, so it reads as shallow rather than as a hole.
  for (let i = 0; i < 2; i++) {
    room.geo('caveRock', ball(room.range(0.1, 0.17), 6), tiltMatrix([x + room.range(-radius * 0.5, radius * 0.5), 0.06, z + room.range(-radius * 0.5, radius * 0.5)], [0, i, 0], [1.3, 0.6, 1]), FLAT);
  }
  if (lit) {
    room.geo('wash.cold', disc(radius * 1.3, 14), tiltMatrix([x, 0.085, z], [-Math.PI / 2, 0, 0]), FLAT);
    // Lichen round the rim, where the water keeps it wet. Emissive only, and it is
    // what makes a lit pool read as lit BY something rather than as glowing.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      room.geo('lumenLichen', ball(0.05, 5), tiltMatrix([x + Math.cos(a) * radius * 1.02, 0.09, z + Math.sin(a) * radius * 1.02], [0, a, 0], [1.6, 0.7, 0.8]), FLAT);
    }
  }
  room.collider({ kind: 'circle', center: [x, z], radius: radius * 0.95 });
}

/**
 * A cluster of luminous lichen on rock: a wet patch of flowstone with the glow
 * sitting IN it. `lit` spends a real light.
 *
 * It does not flicker and it does not pulse - `breathe()` is for fungus, which is
 * alive in a way this is not. A cave is a place that was never lit, and a light
 * that holds perfectly still is how that reads.
 */
export function lichenPatch(room: Room, x: number, y: number, z: number, scale = 1, lit = false, intensity = 3): void {
  const spots = 5 + Math.floor(room.range(0, 4));
  for (let i = 0; i < spots; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = room.range(0, 0.34 * scale);
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    const py = y + room.range(-0.16, 0.16) * scale;
    const w = room.range(0.09, 0.2) * scale;
    room.geo('flowstone', ball(w * 1.5, 5), tiltMatrix([px, py, pz], [0, a, 0], [1.4, 0.8, 1]), { tile: 0.3 });
    room.geo('lumenLichen', ball(w * 0.6, 5), tiltMatrix([px, py + w * 0.3, pz], [0, a, 0], [1.5, 0.7, 1.2]), FLAT);
  }
  room.geo('wash.cold', disc(1.1 * scale, 12), tiltMatrix([x, y - 0.3, z], [-Math.PI / 2, 0, 0]), FLAT);
  if (lit) {
    // Pale rather than saturated, and weak. At 0x64e0d8 and intensity 5 two of
    // these turned the whole cave into one flat teal wash with no rock colour left
    // in it anywhere: lichen is a thing you find, not a thing that lights a room.
    const lamp = new THREE.PointLight(0x9ce0d4, intensity, room.ctx.dims.cellSize * 1.1, 2);
    lamp.position.set(x, y + 0.3, z);
    room.light(lamp);
  }
}

/** A boulder, or a heap of them where the roof has come down. No two alike. */
export function boulders(room: Room, x: number, z: number, radius = 1.2, count = 5): void {
  for (let i = 0; i < count; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = room.range(0, radius);
    const size = room.range(0.22, 0.55);
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    room.geo(i % 3 === 0 ? 'caveRockPale' : 'caveRock', ball(size, 6), tiltMatrix([px, size * 0.42, pz], [0, a, i * 0.4], [1.25, 0.8, 1.1]), { tile: 0.8, castShadow: true });
    if (size > 0.4) room.blockCircle(px, pz, size * 0.8);
  }
}

/** Water falling from a crack: a thin cylinder, a wet patch, and the splash ring. */
export function drip(room: Room, x: number, z: number, from: number, to = 0.02): void {
  room.geo('water', cyl(0.008, 0.008, from - to, 4), poseMatrix([x, (from + to) / 2, z]), FLAT);
  room.geo('water', disc(room.range(0.16, 0.3), 10), tiltMatrix([x, 0.013, z], [-Math.PI / 2, room.range(0, 3), 0]), FLAT);
  room.geo('flowstone', ring(0.2, 0.025, 10), tiltMatrix([x, 0.016, z], [Math.PI / 2, 0, 0]), FLAT);
}

/* --- the barrow: a ship under a mound -------------------------------------------- */

/**
 * A clinker-built hull, half buried, with the strakes overlapping and a row of
 * iron rivets along every seam.
 *
 * `length` runs along the prop's own X. The whole object is the SHEER - a boat
 * read from the side is one long curve rising at both ends - so the strakes are
 * sampled along that curve rather than laid out flat, and the rivets are what say
 * the timber was fastened rather than carved.
 */
export function shipHull(room: Room, x: number, z: number, rotationY = 0, length = 5.0): void {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const at = (along: number, across: number, y: number): Vec3 => [x + cos * along + sin * across, y, z - sin * along + cos * across];
  const half = length / 2;

  // Five strakes a side. Each is a run of short planks following the sheer, and
  // each sits a little outboard and higher than the one below it: that overlap is
  // what "clinker" means and it is the whole silhouette.
  const strakes = 5;
  const segs = 7;
  for (let k = 0; k < strakes; k++) {
    const t = k / (strakes - 1);
    const beam = 0.5 + t * 0.42;
    const rise = 0.12 + t * 0.5;
    for (let s of [-1, 1]) {
      for (let i = 0; i < segs; i++) {
        const f = (i + 0.5) / segs - 0.5;
        // The sheer: both ends of a strake lift, and the middle is the lowest point.
        const sheer = rise + Math.pow(Math.abs(f) * 2, 2.4) * (0.5 + t * 0.7);
        const w = beam * (1 - Math.pow(Math.abs(f) * 2, 3) * 0.72);
        const len = (length / segs) * 1.08;
        // A PLANK, not a log: 16 cm wide and 5 cm thick, leaning outboard so the
        // laps catch the light. Round strakes made the whole hull read as a stack of
        // firewood, which is what a clinker boat looks least like.
        room.geo(
          'timber',
          boxLike(len, 0.055, 0.17),
          tiltMatrix(at(f * length, s * w, sheer), [0, rotationY + Math.sign(f) * Math.abs(f) * 0.12, s * 0.42]),
          { tile: 0.6, castShadow: k > 2 },
        );
        // A rivet every other plank, on the lap.
        if (i % 2 === 0) {
          room.geo('ironPale', ball(0.028, 5), poseMatrix(at(f * length, s * (w + 0.05), sheer + 0.05)), FLAT);
        }
      }
    }
  }
  // Stem and stern posts, both curling up out of the sheer.
  for (const s of [-1, 1]) {
    room.geo('timber', cyl(0.09, 0.13, 1.5, 6), tiltMatrix(at(s * (half - 0.1), 0, 0.75), [s * 0.42, rotationY, 0]), { tile: 0.6, castShadow: true });
    room.geo('timber', ball(0.12, 6), tiltMatrix(at(s * (half + 0.5), 0, 1.42), [0, rotationY, 0], [1.4, 1, 0.8]), NO_SHADOW);
  }
  // The gunwale: a rail along the top strake either side. It is what the shields
  // hang on, and without it they read as floating in the dark.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const f = (i + 0.5) / 5 - 0.5;
      const sheer = 0.62 + Math.pow(Math.abs(f) * 2, 2.4) * 1.2;
      const w = 0.92 * (1 - Math.pow(Math.abs(f) * 2, 3) * 0.72);
      room.geo('timber', cyl(0.06, 0.06, length / 5 + 0.08, 6), tiltMatrix(at(f * length, s * w, sheer), [Math.PI / 2, rotationY, Math.PI / 2]), {
        tile: 0.5,
        castShadow: false,
      });
    }
  }
  // The keelson down the middle, and the mast step on it.
  room.box('timber', [length * 0.8, 0.14, 0.3], at(0, 0, 0.08), rotationY, { tile: 0.6 });
  room.collider({ kind: 'box', center: [x, z], halfExtents: [half * 0.92, 0.85], rotationY });
}

/** The mast, snapped off a metre up, with the shroud cleats still on it. */
export function mastStump(room: Room, x: number, z: number, height = 1.3): void {
  room.geo('timber', cyl(0.11, 0.15, height, 8), poseMatrix([x, height / 2, z]), { tile: 0.7, castShadow: true });
  // The break: splinters, which is what stops it reading as a bollard.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    room.geo('timber', spike(0.035, room.range(0.14, 0.34), 4), poseMatrix([x + Math.cos(a) * 0.07, height, z + Math.sin(a) * 0.07]), NO_SHADOW);
  }
  for (const y of [height * 0.4, height * 0.72]) {
    room.geo('ironDark', ring(0.14, 0.02, 9), tiltMatrix([x, y, z], [Math.PI / 2, 0, 0]), NO_SHADOW);
  }
  room.blockCircle(x, z, 0.16);
}

/**
 * A round shield: boards, a rim and an iron boss, painted in the two colours they
 * had. Hung on a gunwale or a wall - `tilt` leans it back against something.
 */
export function shield(room: Room, x: number, y: number, z: number, rotationY = 0, radius = 0.36, red = false, tilt = 0.1): void {
  const face = red ? 'shieldRed' : 'shieldPale';
  room.geo(face, cyl(radius, radius, 0.045, 14), tiltMatrix([x, y, z], [Math.PI / 2 + tilt, rotationY, 0]), { tile: 0.5, castShadow: false });
  // The other colour, as a quadrant: two colours in a pattern is what a shield is.
  room.geo(red ? 'shieldPale' : 'shieldRed', cyl(radius * 0.99, radius * 0.99, 0.05, 14, true), tiltMatrix([x, y, z], [Math.PI / 2 + tilt, rotationY, 0], [0.5, 1, 1]), {
    tile: 0.5,
    castShadow: false,
  });
  room.geo('iron', ring(radius, 0.03, 14), tiltMatrix([x, y, z], [tilt, rotationY, 0]), NO_SHADOW);
  const out = 0.05;
  room.geo('iron', ball(radius * 0.24, 7), tiltMatrix([x - Math.sin(rotationY) * out, y + tilt * 0.1, z - Math.cos(rotationY) * out], [0, 0, 0], [1, 1, 0.6]), NO_SHADOW);
}

/** A spear or an axe leaning against something: a shaft and a head. */
export function haft(room: Room, x: number, z: number, rotationY = 0, height = 1.9, axe = false): void {
  const lean = 0.14;
  const top: Vec3 = [x - Math.sin(rotationY) * height * lean, height, z - Math.cos(rotationY) * height * lean];
  strut(room, 'timber', [x, 0.02, z], top, 0.022, 5, NO_SHADOW);
  if (axe) {
    // A bearded axe: a socket and a blade that hangs below it.
    room.geo('ironPale', boxLike(0.05, 0.16, 0.09), poseMatrix([top[0], top[1] - 0.06, top[2]], rotationY), NO_SHADOW);
    room.geo('ironPale', quad(0.26, 0.3), poseMatrix([top[0] - 0.04, top[1] - 0.18, top[2]], rotationY + Math.PI / 2), FLAT);
  } else {
    room.geo('ironPale', spike(0.035, 0.34, 5), poseMatrix([top[0], top[1] + 0.14, top[2]]), NO_SHADOW);
    room.geo('ironPale', cyl(0.022, 0.03, 0.1, 6), poseMatrix([top[0], top[1] - 0.02, top[2]]), NO_SHADOW);
  }
}

/** A horse skull: a long muzzle, a heavy jaw and two sockets. Not a human one. */
export function horseSkull(room: Room, x: number, y: number, z: number, rotationY = 0, scale = 1): void {
  const s = 0.16 * scale;
  const sin = Math.sin(rotationY);
  const cos = Math.cos(rotationY);
  const out = (d: number, up = 0, side = 0): Vec3 => [x - sin * d + cos * side, y + up, z - cos * d - sin * side];
  // The cranium, then a muzzle twice as long as it: the proportion IS the horse.
  room.geo('bone', ball(s, 7), tiltMatrix([x, y + s * 0.8, z], [0, rotationY, 0], [0.9, 1, 1.15]), { tile: 0.3, ...NO_SHADOW });
  room.geo('bone', cyl(s * 0.42, s * 0.6, s * 2.4, 6), tiltMatrix(out(s * 1.5, s * 0.6), [Math.PI / 2, rotationY, 0.12]), { tile: 0.3, ...NO_SHADOW });
  room.geo('bonePale', cyl(s * 0.34, s * 0.42, s * 0.5, 6), tiltMatrix(out(s * 2.7, s * 0.42), [Math.PI / 2, rotationY, 0.2]), NO_SHADOW);
  // The eye sockets, high and to the sides, which is where a prey animal has them.
  for (const side of [-1, 1]) {
    room.geo('bitumen', ball(s * 0.3, 5), poseMatrix(out(s * 0.5, s * 1.1, side * s * 0.72)), FLAT);
  }
  // The jaw, hanging open, and the teeth in it.
  room.geo('bone', cyl(s * 0.3, s * 0.44, s * 2.0, 5), tiltMatrix(out(s * 1.4, s * 0.16), [Math.PI / 2, rotationY, 0.3]), NO_SHADOW);
  room.geo('bonePale', boxLike(s * 0.9, s * 0.14, s * 0.3), poseMatrix(out(s * 2.2, s * 0.3), rotationY), FLAT);
}

