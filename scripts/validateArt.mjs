/**
 * Art validation - `npm run validate:art`.
 *
 * Builds every room of every pack, headless, and checks the things a human
 * cannot check by eye. It exists because art is authored blind: a room author
 * never runs the game, and a room that looks perfect can still trap a player in
 * a corner for one particular combination of doors and one particular seed.
 *
 * The checks, in rough order of how much they matter:
 *
 *   1. **Nobody gets stuck.** For every legal combination of doors and several
 *      seeds, the room is voxelised against its own colliders at the player's
 *      radius and flood-filled from each doorway. Every doorway must reach every
 *      other doorway, and every anchor must be reachable. This is the check the
 *      brief asks for and the reason this script exists.
 *   2. **Doors are respected.** A side the generator left closed must actually be
 *      walled; a side it opened must actually be walkable.
 *   3. **Anchors are usable.** Nothing buried in furniture, nothing in a doorway,
 *      counts within the ranges in docs/art/ROOM_FORMAT.md §3. The doorway half
 *      of that has to model what the GENERATOR places, not what `build()`
 *      returns: a chest arrives at its anchor after the room is built, so it is
 *      absent from the colliders every other check here walks around.
 *   4. **Determinism.** The same seed builds byte-identical geometry, and no art
 *      source calls `Math.random()`.
 *   5. **Budgets.** Draw calls, triangles, lights, materials. Reported as
 *      warnings: docs/art/ROOM_FORMAT.md §7 is a guideline, and a room that goes
 *      over is a conversation, not a build failure.
 *
 * Rooms are loaded through Vite so they resolve exactly as they do in the game
 * (aliases, TypeScript, `three/examples`). Art never touches the DOM or a GL
 * context, which is what makes running it in Node possible at all - see
 * docs/art/ART_GUIDE.md §7.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

const world = json('../config/world.json');
const player = json('../config/player.json');

const DIMS = {
  cellSize: world.grid.cellSize,
  ceilingHeight: world.grid.ceilingHeight,
  wallThickness: world.grid.wallThickness,
  doorWidth: world.doors.width,
  doorHeight: world.doors.height,
};
const PLAYER_RADIUS = player.body.radius;
/**
 * Real lights a room may declare: two for a 1x1, one more per extra cell,
 * capped at four. Must match `lightBudget` in src/world/worldBuilder.ts.
 */
const lightBudgetFor = (footprint) => Math.min(4, 1 + footprint.length);

/** Grid resolution for the reachability flood fill, in metres. */
const CELL = 0.12;

/**
 * Every one of these is set just above the largest room that actually ships, so
 * it says nothing about rooms already reviewed and speaks up for the next one to
 * grow. That means each is RATCHETED DOWN whenever a pass reduces the worst
 * room, and the history is the point:
 *
 *   triangles  40 000 -> 25 000 -> 21 000
 *
 * 40 000 was headroom nobody was going to use and so never said anything - the
 * manor's worst room is 8 400, and Kerberos Deep spent the whole allowance a
 * room at a time without tripping it. 25 000 sat just above `abyss.archive` at
 * 23 878. 21 000 sits just above `crypt.ossuary` at 20 730, which is now the
 * largest 1x1 that ships: a pass over the biggest spenders took the archive to
 * 18 178 and `abyss.jelly` to 16 440, all of it segment counts on small round
 * things there are hundreds of. See docs/systems/RENDERING.md.
 *
 * `drawCalls` is deliberately NOT tightened, and it is the one that matters
 * most. Measured in the running game, a frame on the heaviest map is 400-500
 * draw calls and CPU-bound on submitting them - `tools/perf.html` reports frame
 * time and submission time side by side and they are the same number. But the
 * two rooms over 40 are a 3-cell (16 draws a cell) and the crypt's hinge room,
 * both argued in the docs, and every other room is at 30-38: tightening the
 * number would flag a dozen rooms without reducing anything. What would
 * actually move it is the culler, not the budget.
 */
const BUDGET = { drawCalls: 40, triangles: 21000, lights: 2, shadowLights: 1, colliders: 25 };

/** Packs that are scaffolding, not maps. See the note where this is used. */
const SCAFFOLD_PACKS = new Set(['test']);

const SIDES = ['north', 'east', 'south', 'west'];
const STEP = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
/** Unit vector pointing from a wall into the room. */
const INWARD = { north: [0, 1], east: [-1, 0], south: [0, -1], west: [1, 0] };

const errors = new Map();
const warnings = new Map();
const rows = [];

/**
 * Every room is built dozens of times (each door combination x each seed), so a
 * single bad anchor would otherwise be reported sixty times. Dedupe on the room
 * and the message, and keep the first context - that one is enough to reproduce.
 */
const dedupe = (where, message) => `${where.replace(/\s*\[[^\]]*\] seed .*$/, '')}|${message}`;
const record = (into) => (where, message) => {
  const key = dedupe(where, message);
  if (!into.has(key)) into.set(key, `${where}: ${message}`);
};
const fail = record(errors);
const warn = record(warnings);

/* --- seeded rng, matching src/core/rng.ts -------------------------------------- */

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
  };
}

/* --- collider maths ------------------------------------------------------------ */

/** Does a circle of `radius` at (x, z) overlap this collider? */
function hits(collider, x, z, radius) {
  const [cx, cz] = collider.center;
  if (collider.kind === 'circle') {
    return Math.hypot(x - cx, z - cz) <= collider.radius + radius;
  }
  const angle = collider.rotationY ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Into the box's own frame. Colliders are rotated by +rotationY, so undo it.
  const dx = x - cx;
  const dz = z - cz;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const [hx, hz] = collider.halfExtents;
  const nx = Math.max(0, Math.abs(lx) - hx);
  const nz = Math.max(0, Math.abs(lz) - hz);
  return Math.hypot(nx, nz) <= radius;
}

const blocked = (colliders, x, z, radius) => colliders.some((c) => hits(c, x, z, radius));

/* --- reachability -------------------------------------------------------------- */

/**
 * Voxelises the room at the player's radius and floods from every open doorway.
 * Returns a lookup that answers "can a player stand here" and "did the flood
 * reach here".
 */
function floodFrom(colliders, footprint, seeds, radius) {
  const half = DIMS.cellSize / 2;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [gx, gy] of footprint) {
    minX = Math.min(minX, gx * DIMS.cellSize - half);
    maxX = Math.max(maxX, gx * DIMS.cellSize + half);
    minZ = Math.min(minZ, gy * DIMS.cellSize - half);
    maxZ = Math.max(maxZ, gy * DIMS.cellSize + half);
  }

  const w = Math.ceil((maxX - minX) / CELL);
  const h = Math.ceil((maxZ - minZ) / CELL);
  const toX = (i) => minX + (i + 0.5) * CELL;
  const toZ = (j) => minZ + (j + 0.5) * CELL;
  const index = (i, j) => j * w + i;

  const free = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      free[index(i, j)] = blocked(colliders, toX(i), toZ(j), radius) ? 0 : 1;
    }
  }

  const seen = new Uint8Array(w * h);
  const queue = [];
  for (const [sx, sz] of seeds) {
    const i = Math.round((sx - minX) / CELL - 0.5);
    const j = Math.round((sz - minZ) / CELL - 0.5);
    if (i < 0 || j < 0 || i >= w || j >= h) continue;
    if (!free[index(i, j)] || seen[index(i, j)]) continue;
    seen[index(i, j)] = 1;
    queue.push(index(i, j));
  }

  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    const i = at % w;
    const j = (at - i) / w;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const n = index(ni, nj);
      if (!free[n] || seen[n]) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }

  const cellAt = (x, z) => {
    const i = Math.round((x - minX) / CELL - 0.5);
    const j = Math.round((z - minZ) / CELL - 0.5);
    if (i < 0 || j < 0 || i >= w || j >= h) return -1;
    return index(i, j);
  };

  return {
    /** A player can stand exactly here. */
    standable: (x, z) => {
      const at = cellAt(x, z);
      return at >= 0 && free[at] === 1;
    },
    /** A player can walk here from a doorway. */
    reached: (x, z) => {
      const at = cellAt(x, z);
      return at >= 0 && seen[at] === 1;
    },
    /** Is there anywhere a player can stand within `r` metres of this point? */
    reachedNear: (x, z, r) => {
      const steps = Math.ceil(r / CELL);
      for (let dj = -steps; dj <= steps; dj++) {
        for (let di = -steps; di <= steps; di++) {
          if (Math.hypot(di, dj) * CELL > r) continue;
          const at = cellAt(x + di * CELL, z + dj * CELL);
          if (at >= 0 && seen[at] === 1) return true;
        }
      }
      return false;
    },
    freeCells: free.reduce((sum, v) => sum + v, 0),
    reachedCells: seen.reduce((sum, v) => sum + v, 0),
  };
}

/* --- geometry accounting -------------------------------------------------------- */

function measure(object) {
  let drawCalls = 0;
  let triangles = 0;
  const materials = new Set();
  object.traverse((child) => {
    if (!child.isMesh && !child.isInstancedMesh) return;
    const count = child.isInstancedMesh ? child.count : 1;
    drawCalls += 1;
    const geometry = child.geometry;
    const verts = geometry.index ? geometry.index.count : geometry.getAttribute('position')?.count ?? 0;
    triangles += (verts / 3) * count;
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (material) materials.add(material);
    }
  });
  return { drawCalls, triangles: Math.round(triangles), materials };
}

/** A cheap structural fingerprint, for the determinism check. */
function fingerprint(object) {
  let hash = 2166136261 >>> 0;
  const mix = (value) => {
    hash ^= Math.round(value * 4096) | 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  };
  object.traverse((child) => {
    if (!child.isMesh) return;
    const position = child.geometry.getAttribute('position');
    if (!position) return;
    mix(position.count);
    const array = position.array;
    // Sampling is enough to catch a reordered or reseeded build.
    for (let i = 0; i < array.length; i += Math.max(1, Math.floor(array.length / 512))) mix(array[i]);
    mix(child.matrixWorld.elements[12]);
    mix(child.matrixWorld.elements[14]);
  });
  return hash >>> 0;
}

/* --- door combinations ---------------------------------------------------------- */

/**
 * Every set of doors the generator could hand this blueprint. Capped, because a
 * six-edge multi-cell room has 63 of them and the first 40 find every bug the
 * last 23 would.
 */
function doorCombos(blueprint, limit = 40) {
  const walls = blueprint.doorWalls;
  const combos = [];
  const total = 1 << walls.length;
  for (let mask = 1; mask < total && combos.length < limit; mask++) {
    combos.push(walls.filter((_, i) => (mask >> i) & 1));
  }
  // The all-open case is the one most likely to break furniture placement.
  combos.push(walls.slice());
  return combos;
}

const keyFor = (cell, side) => `${cell[0]},${cell[1]}:${side}`;

/* --- per-blueprint validation ---------------------------------------------------- */

function checkMetadata(packId, blueprint, seen) {
  const where = blueprint.id;

  if (!blueprint.id.startsWith(`${packId}.`)) fail(where, `id must start with "${packId}."`);
  if (seen.has(blueprint.id)) fail(where, 'duplicate blueprint id');
  seen.add(blueprint.id);

  const cells = new Set(blueprint.footprint.map(([x, y]) => `${x},${y}`));
  if (!cells.has('0,0')) fail(where, 'footprint must include [0,0]');

  // Orthogonally connected?
  const start = blueprint.footprint[0];
  const queue = [start];
  const seenCells = new Set([`${start[0]},${start[1]}`]);
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    for (const side of SIDES) {
      const [dx, dy] = STEP[side];
      const key = `${x + dx},${y + dy}`;
      if (cells.has(key) && !seenCells.has(key)) {
        seenCells.add(key);
        queue.push([x + dx, y + dy]);
      }
    }
  }
  if (seenCells.size !== cells.size) fail(where, 'footprint is not orthogonally connected');

  for (const wall of blueprint.doorWalls) {
    if (!cells.has(`${wall.cell[0]},${wall.cell[1]}`)) {
      fail(where, `doorWall on cell [${wall.cell}] which is not in the footprint`);
    }
    const [dx, dy] = STEP[wall.side];
    if (cells.has(`${wall.cell[0] + dx},${wall.cell[1] + dy}`)) {
      fail(where, `doorWall ${keyFor(wall.cell, wall.side)} is an interior edge, not an outer one`);
    }
  }
  if (!blueprint.doorWalls.length) fail(where, 'no doorWalls: the room could never be placed');

  const anchors = blueprint.anchors ?? {};
  const count = (kind) => (anchors[kind] ?? []).length;

  if (count('patrolPoint') < 2) fail(where, `needs >= 2 patrolPoint anchors, has ${count('patrolPoint')}`);
  if (count('itemSpawn') < 1) fail(where, `needs >= 1 itemSpawn anchor, has ${count('itemSpawn')}`);
  if (count('itemSpawn') > 4) warn(where, `${count('itemSpawn')} itemSpawn anchors, guidance is 1-4`);
  if (count('chest') > 2) warn(where, `${count('chest')} chest anchors, guidance is 0-2`);
  if (count('locker') > 3) warn(where, `${count('locker')} locker anchors, guidance is 0-3`);
  if (count('enemySpawn') > 1) warn(where, `${count('enemySpawn')} enemySpawn anchors, guidance is 0-1`);
  if ((blueprint.tags ?? []).includes('entrance') && count('playerSpawn') < 4) {
    fail(where, 'tagged `entrance` but declares fewer than 4 playerSpawn anchors');
  }

  /**
   * Anchors must not sit on top of each other. The build-time flood fill cannot
   * see this: chests, lockers and the enemy are placed by the generator AFTER the
   * room is built, so a locker anchor 30 cm from a patrol point looks fine to
   * every other check and produces an enemy standing inside a wardrobe.
   */
  // Half-width of what the generator will actually drop here, from the sizes in
  // SHARED_ART.md §3. Two lockers 0.9 m apart are shoulder to shoulder, which is
  // fine; a patrol point 0.3 m from one is an enemy standing inside a wardrobe.
  const SOLID = { chest: 0.5, locker: 0.45, trap: 0.4 };
  const placed = Object.entries(anchors).flatMap(([kind, list]) =>
    (list ?? []).map((anchor) => ({ kind, x: anchor.position[0], z: anchor.position[2] })),
  );
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      // Someone has to stand there, so they need their own radius clear of it.
      const person = STANDABLE.has(a.kind) || STANDABLE.has(b.kind) ? PLAYER_RADIUS : 0;
      const minimum = (SOLID[a.kind] ?? 0) + (SOLID[b.kind] ?? 0) + person;
      const gap = Math.hypot(a.x - b.x, a.z - b.z);
      if (minimum > 0 && gap < minimum) {
        fail(
          where,
          `${a.kind} anchor at [${a.x}, ${a.z}] and ${b.kind} at [${b.x}, ${b.z}] are ${gap.toFixed(2)} m apart, ` +
            `they need ${minimum.toFixed(2)} m`,
        );
      }
    }
  }

  // Anchors must be inside the footprint.
  const half = DIMS.cellSize / 2;
  for (const [kind, list] of Object.entries(anchors)) {
    for (const anchor of list ?? []) {
      const [x, , z] = anchor.position;
      const inside = blueprint.footprint.some(
        ([gx, gy]) =>
          Math.abs(x - gx * DIMS.cellSize) <= half + 0.01 && Math.abs(z - gy * DIMS.cellSize) <= half + 0.01,
      );
      if (!inside) fail(where, `${kind} anchor at [${anchor.position}] is outside the footprint`);
    }
  }
}

/** Anchors a player or the enemy has to STAND on, versus ones they reach toward. */
const STANDABLE = new Set(['playerSpawn', 'patrolPoint', 'enemySpawn', 'trap']);
/**
 * How far from an anchor a player may stand and still use it.
 *
 * You pick an item up by LOOKING at it, so the middle of a long dining table is
 * fine as long as somebody can stand within interaction range - hence the
 * derivation from `player.json`. Chests and lockers you have to walk up to, and
 * ROOM_FORMAT.md §3 gives them their own clearances.
 */
const LOOK_REACH = player.interaction.rayLength - 0.4;
const REACH = { chest: 1.35, locker: 1.25, itemSpawn: LOOK_REACH, treasure: LOOK_REACH };

/**
 * Clear floor a container needs IN FRONT OF IT, from docs/art/ROOM_FORMAT.md §3.
 * `width` is the object's own width, `depth` how far the clearance runs.
 *
 * Facing matters and is easy to get wrong by a quarter turn: shared art faces
 * `-Z` by default and the anchor's `rotationY` turns it, so a locker backed
 * against the west wall wants `-PI/2`. Get the sign wrong and you have built a
 * locker facing into the plaster - which looks completely fine in the room and is
 * unusable in the run, because the player has to stand in front of it to hide.
 */
const CLEARANCE = {
  chest: { width: 1.0, depth: 1.6 },
  locker: { width: 0.9, depth: 1.2 },
};

/**
 * Within this distance of the container the floor must be clear across its whole
 * width - that is where a player stands to open it, or steps to hide inside it.
 * Past it only the centre line has to be walkable, so a rug, a table two metres
 * away or a chair off to one side is not an error.
 */
const APPROACH_DEPTH = 0.95;

/**
 * How far into the room a doorway has to stay clear, from ROOM_FORMAT.md §3
 * rule 2.
 */
const DOOR_CLEARANCE = 1.2;

/** Art returns colliders in its own local space; placing it rotates them too. */
function rotateCollider(collider, rotationY) {
  if (!rotationY) return collider;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const [cx, cz] = collider.center;
  const center = [cx * cos + cz * sin, -cx * sin + cz * cos];
  return collider.kind === 'box'
    ? { ...collider, center, rotationY: (collider.rotationY ?? 0) + rotationY }
    : { ...collider, center };
}

/**
 * What the GENERATOR will drop into this room, in room-local world space.
 *
 * This is the blind spot every other collider check in this file shares: a
 * chest is not built by `build()`, it is placed at an anchor afterwards by
 * `worldBuilder.place()`, so the room the flood fill walks around does not
 * contain one. A chest anchor in a doorway therefore passed everything - and
 * shipped a door you cannot walk through.
 *
 * Built through the pack's overrides and rotated exactly as `place()` does, so
 * this is the real collider at the real facing, not an approximation of one.
 */
function containersAt(blueprint, art) {
  const placed = [];
  for (const kind of ['chest', 'locker']) {
    const built = art[kind];
    if (!built) continue;
    for (const anchor of blueprint.anchors?.[kind] ?? []) {
      const [x, , z] = anchor.position;
      placed.push({
        kind,
        x,
        z,
        colliders: (built.colliders ?? []).map((collider) => {
          const turned = rotateCollider(collider, anchor.rotationY ?? 0);
          return { ...turned, center: [turned.center[0] + x, turned.center[1] + z] };
        }),
      });
    }
  }
  return placed;
}

/**
 * Can a player still walk through every doorway once the generator has filled
 * this room's container anchors?
 *
 * Every entry in `doorWalls` is checked, not just the ones open in some door
 * combination, because the anchors do not move: a chest that stands in the north
 * doorway stands there on every map that opens the north door, and no seed makes
 * it not. That also makes this a per-blueprint check rather than a per-build one,
 * so a bad anchor is reported once rather than sixty times.
 *
 * The test is the walk itself - a player-radius circle down the middle of the
 * opening, from the wall to `DOOR_CLEARANCE` inside. A container that merely
 * clips the edge of the span leaves a gap you can still get through, and this
 * deliberately does not fail it; one that stops the circle is a sealed door.
 */
function checkDoorwaysClear(blueprint, containers) {
  const where = blueprint.id;
  const half = DIMS.cellSize / 2;

  for (const wall of blueprint.doorWalls) {
    const [gx, gy] = wall.cell;
    const [ix, iz] = INWARD[wall.side];
    const wallX = gx * DIMS.cellSize - ix * half;
    const wallZ = gy * DIMS.cellSize - iz * half;

    for (const container of containers) {
      let depthHit = null;
      for (let depth = PLAYER_RADIUS + 0.08; depth <= DOOR_CLEARANCE + 1e-6; depth += 0.1) {
        if (blocked(container.colliders, wallX + ix * depth, wallZ + iz * depth, PLAYER_RADIUS)) {
          depthHit = depth;
          break;
        }
      }
      if (depthHit === null) continue;

      fail(
        where,
        `a ${container.kind} the generator may place at [${container.x}, ${container.z}] stands in the ` +
          `${wall.side} doorway of cell [${gx},${gy}]: it stops a player ${depthHit.toFixed(2)} m in, and ` +
          `ROOM_FORMAT.md §3 rule 2 asks for ${DOOR_CLEARANCE} m clear. Anchors are filled at random, so this ` +
          `is a door nobody can use on any map that opens that side.`,
      );
    }
  }
}

function checkBuild(packId, blueprint, doors, seed, library, THREE) {
  const where = `${blueprint.id} [${doors.map((d) => d.side).join('|') || 'none'}] seed ${seed}`;
  const doorStates = {};
  for (const wall of doors) doorStates[keyFor(wall.cell, wall.side)] = 'open';

  const ctx = {
    doors: doorStates,
    kit: library.kit,
    materials: library.materials,
    rng: makeRng(seed),
    dims: DIMS,
    roomIndex: 0,
    lightBudget: lightBudgetFor(blueprint.footprint),
  };

  let built;
  try {
    built = blueprint.build(ctx);
  } catch (error) {
    fail(where, `build() threw: ${error.message}`);
    return null;
  }

  const colliders = built.colliders ?? [];
  const lights = built.lights ?? [];
  built.object.updateMatrixWorld(true);

  /* --- doors are respected --------------------------------------------------- */
  const open = new Set(doors.map((wall) => keyFor(wall.cell, wall.side)));
  const doorSeeds = [];
  for (const [gx, gy] of blueprint.footprint) {
    for (const side of SIDES) {
      const [sx, sy] = STEP[side];
      if (blueprint.footprint.some(([ax, ay]) => ax === gx + sx && ay === gy + sy)) continue;

      const [ix, iz] = INWARD[side];
      const wallX = gx * DIMS.cellSize - ix * (DIMS.cellSize / 2);
      const wallZ = gy * DIMS.cellSize - iz * (DIMS.cellSize / 2);
      const mouth = [wallX + ix * (PLAYER_RADIUS + 0.08), wallZ + iz * (PLAYER_RADIUS + 0.08)];
      const inner = [wallX + ix * 1.2, wallZ + iz * 1.2];

      if (open.has(keyFor([gx, gy], side))) {
        if (blocked(colliders, mouth[0], mouth[1], PLAYER_RADIUS)) {
          fail(where, `the ${side} doorway of cell [${gx},${gy}] is blocked by geometry`);
        }
        doorSeeds.push(inner);
      } else if (!blocked(colliders, mouth[0], mouth[1], PLAYER_RADIUS)) {
        fail(where, `the ${side} wall of cell [${gx},${gy}] is closed this run but has no collider`);
      }
    }
  }

  /* --- nobody gets stuck ------------------------------------------------------ */
  const flood = floodFrom(colliders, blueprint.footprint, doorSeeds, PLAYER_RADIUS);

  for (const [x, z] of doorSeeds) {
    if (!flood.reached(x, z)) fail(where, `a doorway at [${x.toFixed(2)}, ${z.toFixed(2)}] is cut off from the others`);
  }
  if (doorSeeds.length && flood.reachedCells < flood.freeCells * 0.5) {
    warn(where, `only ${flood.reachedCells}/${flood.freeCells} of the free floor is reachable from the doors`);
  }

  for (const [kind, list] of Object.entries(blueprint.anchors ?? {})) {
    for (const anchor of list ?? []) {
      const [x, , z] = anchor.position;
      if (STANDABLE.has(kind)) {
        if (!flood.standable(x, z)) fail(where, `${kind} anchor at [${x}, ${z}] is inside a collider`);
        else if (doorSeeds.length && !flood.reached(x, z)) fail(where, `${kind} anchor at [${x}, ${z}] is unreachable`);
      } else if (doorSeeds.length) {
        const reach = REACH[kind] ?? 1.0;
        if (!flood.reachedNear(x, z, reach)) {
          fail(where, `${kind} anchor at [${x}, ${z}] has no reachable floor within ${reach} m`);
        }
      }

      /* --- the space a container opens into --------------------------------- */
      const clearance = CLEARANCE[kind];
      if (!clearance || !doorSeeds.length) continue;

      // Shared art faces -Z, and the anchor's rotationY turns it (SHARED_ART.md §2).
      const facing = anchor.rotationY ?? 0;
      const forward = [-Math.sin(facing), -Math.cos(facing)];
      const across = [Math.cos(facing), -Math.sin(facing)];

      // Two zones, because "1.6 m clear" does not mean "no furniture anywhere in
      // front of it": what has to hold is that a player can stand at it across
      // its whole width, and can approach it down the middle.
      const stuck = [];
      for (let depth = 0.45; depth <= clearance.depth + 0.001; depth += 0.25) {
        const lateral = depth <= APPROACH_DEPTH ? [-clearance.width / 2 + PLAYER_RADIUS, 0, clearance.width / 2 - PLAYER_RADIUS] : [0];
        for (const offset of lateral) {
          const px = x + forward[0] * depth + across[0] * offset;
          const pz = z + forward[1] * depth + across[1] * offset;
          if (!flood.standable(px, pz) || !flood.reached(px, pz)) stuck.push([px, pz]);
        }
      }

      if (stuck.length) {
        const [bx, bz] = stuck[0];
        const degrees = Math.round((facing * 180) / Math.PI);
        fail(
          where,
          `${kind} anchor at [${x}, ${z}] facing ${degrees}deg needs ${clearance.depth} m clear in front of it, ` +
            `but ${stuck.length} sample(s) are blocked or unreachable (first at [${bx.toFixed(2)}, ${bz.toFixed(2)}]). ` +
            `If the space looks clear, check rotationY - shared art faces -Z, so a container backed ` +
            `against the west wall faces -PI/2 and one against the south wall faces 0.`,
        );
      }
    }
  }

  /* --- budgets ---------------------------------------------------------------- */
  const stats = measure(built.object);
  const shadowLights = lights.filter((light) => light.castShadow).length;

  const budget = lightBudgetFor(blueprint.footprint);
  if (lights.length > budget) fail(where, `${lights.length} lights, budget is ${budget}`);
  if (lights.length === 0) fail(where, 'no light at all - there is no player flashlight, so the room is unnavigable');
  if (shadowLights > BUDGET.shadowLights) warn(where, `${shadowLights} shadow-casting lights, budget is ${BUDGET.shadowLights}`);

  for (const material of stats.materials) {
    if (!library.handedOut.has(material)) {
      fail(where, `uses a material that did not come from ctx.materials (${material.name || material.type})`);
      break;
    }
  }

  if (built.dispose) built.dispose();
  return { stats, colliders: colliders.length, lights: lights.length, shadowLights, object: built.object };
}

/* --- source-level rules ----------------------------------------------------------- */

async function checkSources() {
  const { globSync } = await import('node:fs');
  const { join } = await import('node:path');
  const files = globSync('art/**/*.ts', { cwd: ROOT });

  for (const relative of files) {
    // Comments talk about these rules constantly; only real code counts.
    const source = readFileSync(join(ROOT, relative), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    if (/\bMath\.random\s*\(/.test(source)) {
      fail(relative, 'calls Math.random() - art must draw from ctx.rng or peers desync');
    }
    if (/from\s+['"](@\/|(\.\.\/)+src\/)/.test(source)) {
      fail(relative, 'imports from src/ - art may only import three and art/lib');
    }
    if (/\bdocument\s*\.|\.createElement\s*\(|\bnavigator\s*\.|\blocalStorage\b/.test(source)) {
      fail(relative, 'touches the DOM - art must build headless (the validator runs in Node)');
    }
  }
}

/* --- the lobby cabin --------------------------------------------------------------- */

/**
 * The lobby is not a room blueprint, so none of the checks above reach it - but
 * it is the one place every player stands before every run, and "can you
 * actually walk to the poster wall" is exactly the kind of thing nobody notices
 * until a playtest.
 *
 * Checks: it builds, it builds deterministically, every piece logic drives
 * exposes the parts logic drives it by, and every one of them is reachable on
 * foot from all four arrival spots.
 */
function checkLobby(sharedArt, buildLobby, createLobbyMaterials, maps, game) {
  const where = 'lobby.cabin';

  const materials = createLobbyMaterials();
  const handedOut = new Set();
  const spy = {
    get: (name) => {
      const material = materials.get(name);
      handedOut.add(material);
      return material;
    },
    dispose: () => materials.dispose(),
  };

  const slots = Math.max(1, game.lobby.posterSlots);
  const build = (seed) => buildLobby({ materials: spy, rng: makeRng(seed), dims: DIMS }, slots);

  let cabin;
  try {
    cabin = build(1);
  } catch (error) {
    fail(where, `failed to build: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }

  const twin = build(1);
  if (fingerprint(cabin.object) !== fingerprint(twin.object)) {
    fail(where, 'two builds with the same seed differ - something is reading outside ctx.rng');
  }
  if (twin.dispose) twin.dispose();

  const stats = measure(cabin.object);
  if (!cabin.lights.length) fail(where, 'no light at all - the cabin would be unnavigable');

  for (const material of stats.materials) {
    if (!handedOut.has(material)) {
      // The player model clones its body material so it can be tinted per
      // player, so a clone here is expected and only a stray original is not.
      const source = material.name || material.type;
      warn(where, `uses a material that did not come from ctx.materials (${source})`);
      break;
    }
  }

  /* --- the pieces logic drives ----------------------------------------------- */

  const REQUIRED = {
    'poster.blank': ['tick', 'mark'],
    'poster.random': ['tick', 'mark'],
    'lobby.wardrobe': ['doorLeft', 'doorRight'],
    'lobby.lever': ['handle'],
    'lobby.dartStand': ['interactAnchor'],
    'lobby.scoreboard': ['rows'],
    // The board and the dart have no parts: logic drives both from the anchor
    // pose and `config/darts.json`, which is the whole point of that file.
    'lobby.dartboard': [],
    'lobby.dart': [],
  };
  // Every poster a map names has to satisfy the poster contract too.
  for (const [mapId, entry] of Object.entries(maps.maps)) {
    if (entry.posterArtId && sharedArt[entry.posterArtId]) REQUIRED[entry.posterArtId] = ['tick', 'mark'];
    else if (entry.posterArtId) warn(where, `map "${mapId}" names poster "${entry.posterArtId}", which is not registered`);
  }

  const placed = [];
  for (const [artId, parts] of Object.entries(REQUIRED)) {
    const builder = sharedArt[artId];
    if (!builder) {
      fail(where, `no art registered for "${artId}"`);
      continue;
    }
    const art = builder({ materials: spy, rng: makeRng(7), dims: DIMS });
    for (const part of parts) {
      if (!art.parts[part]) fail(artId, `is missing part "${part}" (docs/art/SHARED_ART.md)`);
    }
    placed.push({ artId, art });
  }
  if (!sharedArt['lobby.lever']) fail(where, 'the difficulty lever has no art');

  /* --- can you get to any of it? ---------------------------------------------- */

  // A footprint whose bounding box comfortably contains the cabin, so the flood
  // fill has room to prove the walls actually stop you.
  const reach = Math.ceil(8 / DIMS.cellSize);
  const footprint = [];
  for (let gx = -reach; gx <= reach; gx++) {
    for (let gy = -reach; gy <= reach; gy++) footprint.push([gx, gy]);
  }

  const spawns = cabin.anchors.playerSpawns;
  const flood = floodFrom(
    cabin.colliders,
    footprint,
    spawns.map((pose) => [pose.position[0], pose.position[2]]),
    PLAYER_RADIUS,
  );

  for (const [index, pose] of spawns.entries()) {
    if (!flood.standable(pose.position[0], pose.position[2])) {
      fail(where, `player spawn ${index + 1} is inside something`);
    }
  }

  /** Interaction range, with a little slack for standing at an angle. */
  const ARM = 2.2;
  const targets = [
    ...cabin.anchors.posters.map((pose, index) => ({ name: `poster slot ${index + 1}`, pose })),
    { name: 'the wardrobe', pose: cabin.anchors.wardrobe },
    { name: 'the difficulty lever', pose: cabin.anchors.lever },
    { name: 'the dart stand', pose: cabin.anchors.dartStand },
  ];
  for (const { name, pose } of targets) {
    if (!flood.reachedNear(pose.position[0], pose.position[2], ARM)) {
      fail(where, `${name} cannot be reached on foot from the arrival spots`);
    }
  }

  // The mannequin has to be visible from the wardrobe camera, which at minimum
  // means the camera is somewhere a player could stand. The mannequin itself is
  // NOT checked for reachability any more - it stands inside the mirror now, on
  // the far side of a wall, which is exactly where a reflection belongs.
  const camera = cabin.anchors.wardrobeCamera;
  if (!flood.reachedNear(camera.position[0], camera.position[2], 0.6)) {
    warn(where, 'the wardrobe camera is parked somewhere a player could not stand');
  }

  /**
   * The dart annex is scenery behind a fence, so the one thing that can go
   * wrong with it is the fence not being there: if the flood fill can reach the
   * board, the perimeter has a hole in it and players can walk into the annex.
   */
  const board = cabin.anchors.dartboard;
  if (flood.reachedNear(board.position[0], board.position[2], 0.5)) {
    fail(where, 'the dart annex is walkable - the fence is not stopping anyone');
  }

  for (const { art } of placed) if (art.dispose) art.dispose();
  if (cabin.dispose) cabin.dispose();
  spy.dispose();

  return {
    id: 'lobby.cabin',
    cells: slots,
    draws: stats.drawCalls,
    tris: stats.triangles,
    lights: cabin.lights.length,
    colliders: cabin.colliders.length,
  };
}

/* --- entry point ------------------------------------------------------------------ */

async function main() {
  const server = await createServer({
    root: ROOT,
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'warn',
  });

  let THREE;
  let artPacks;
  let shared;
  let lobbyArt;
  try {
    THREE = await server.ssrLoadModule('three');
    ({ artPacks } = await server.ssrLoadModule('/art/packs/index.ts'));
    shared = await server.ssrLoadModule('/art/shared/index.ts');
    lobbyArt = await server.ssrLoadModule('/art/shared/lobby/index.ts');
  } finally {
    // Load first, then keep the server alive until we are done building.
  }

  for (const [packId, pack] of Object.entries(artPacks)) {
    if (pack.id !== packId) fail(packId, `pack.id is "${pack.id}" but it is registered as "${packId}"`);

    const materials = pack.createMaterials();
    const handedOut = new Set();
    const spy = {
      get: (name) => {
        const material = materials.get(name);
        handedOut.add(material);
        return material;
      },
      dispose: () => materials.dispose(),
    };
    const library = { materials: spy, kit: pack.createKit(), handedOut };

    /**
     * The containers this pack's rooms will actually get, resolved the way
     * `worldBuilder.place()` resolves them. Built off the raw library rather
     * than the spy, so shared art cannot quietly widen the "every material came
     * from ctx.materials" check that the rooms themselves are held to.
     */
    const plainMaterials = { get: (name) => materials.get(name), dispose: () => {} };
    const containerArt = {};
    for (const [kind, artId] of [
      ['chest', 'chest.standard'],
      ['locker', 'locker.standard'],
    ]) {
      const builder = pack.overrides?.[artId] ?? shared.sharedArt[artId];
      if (!builder) {
        fail(packId, `no art registered for "${artId}"`);
        continue;
      }
      containerArt[kind] = builder({ materials: plainMaterials, rng: makeRng(1), dims: DIMS });
    }

    const seenIds = new Set();
    const oneByOne = pack.rooms.filter((room) => room.footprint.length === 1).length;
    const withPlayerSpawn = pack.rooms.filter((room) => (room.anchors.playerSpawn ?? []).length > 0).length;
    const withChest = pack.rooms.filter((room) => (room.anchors.chest ?? []).length > 0).length;

    // `test` is the greybox scaffold that exists so world systems could be built
    // before any real art did (art/packs/test/pack.ts). It is deliberately not a
    // shippable map, so pack-completeness is a warning there and an error
    // everywhere else. Every per-room check still applies to it in full.
    const complete = SCAFFOLD_PACKS.has(packId) ? warn : fail;

    if (pack.rooms.length < 15) complete(packId, `${pack.rooms.length} rooms, a pack needs at least 15`);
    if (oneByOne / pack.rooms.length < 0.8) {
      complete(packId, `${oneByOne}/${pack.rooms.length} rooms are 1x1, at least 80 % must be`);
    }
    if (withPlayerSpawn < 4) complete(packId, `${withPlayerSpawn} rooms declare playerSpawn, at least 4 must`);
    if (withChest < 6) complete(packId, `${withChest} rooms declare a chest anchor, at least 6 must`);

    // A pack needs a room that fits any slot, or generation falls back and warns.
    const anywhere = pack.rooms.some(
      (room) => room.footprint.length === 1 && SIDES.every((side) => room.doorWalls.some((wall) => wall.side === side)),
    );
    if (!anywhere) fail(packId, 'no 1x1 room offers all four walls, so some slots have nothing that fits');

    for (const blueprint of pack.rooms) {
      checkMetadata(packId, blueprint, seenIds);
      checkDoorwaysClear(blueprint, containersAt(blueprint, containerArt));

      let worst = null;
      const combos = doorCombos(blueprint);
      for (const doors of combos) {
        for (const seed of [1, 424242, 0x5eed]) {
          const result = checkBuild(packId, blueprint, doors, seed, library, THREE);
          if (result && (!worst || result.stats.drawCalls > worst.stats.drawCalls)) worst = result;
        }
      }

      // Determinism: the same seed, twice, must produce the same geometry.
      const a = checkBuild(packId, blueprint, blueprint.doorWalls, 99, library, THREE);
      const b = checkBuild(packId, blueprint, blueprint.doorWalls, 99, library, THREE);
      if (a && b && fingerprint(a.object) !== fingerprint(b.object)) {
        fail(blueprint.id, 'two builds with the same seed differ - something is reading outside ctx.rng');
      }

      if (worst) {
        rows.push({
          id: blueprint.id,
          cells: blueprint.footprint.length,
          draws: worst.stats.drawCalls,
          tris: worst.stats.triangles,
          lights: worst.lights,
          colliders: worst.colliders,
        });
        if (worst.stats.drawCalls > BUDGET.drawCalls) {
          warn(blueprint.id, `${worst.stats.drawCalls} draw calls, budget is ${BUDGET.drawCalls}`);
        }
        if (worst.stats.triangles > BUDGET.triangles) {
          warn(blueprint.id, `${worst.stats.triangles} triangles, budget is ${BUDGET.triangles}`);
        }
        if (worst.colliders > BUDGET.colliders) {
          warn(blueprint.id, `${worst.colliders} colliders, budget is about ${BUDGET.colliders}`);
        }
      }
    }

    for (const built of Object.values(containerArt)) if (built.dispose) built.dispose();
    spy.dispose();
  }

  const lobbyRow = checkLobby(
    shared.sharedArt,
    lobbyArt.buildLobby,
    lobbyArt.createLobbyMaterials,
    json('../config/maps.json'),
    json('../config/game.json'),
  );
  if (lobbyRow) rows.push(lobbyRow);

  await checkSources();
  await server.close();

  /* --- report ------------------------------------------------------------------- */
  rows.sort((a, b) => b.draws - a.draws);
  const pad = (value, width) => String(value).padEnd(width);
  const num = (value, width) => String(value).padStart(width);
  console.log(`\n${pad('room', 30)}${num('cells', 6)}${num('draws', 7)}${num('tris', 9)}${num('lights', 8)}${num('coll', 6)}`);
  console.log('-'.repeat(66));
  for (const row of rows) {
    console.log(`${pad(row.id, 30)}${num(row.cells, 6)}${num(row.draws, 7)}${num(row.tris, 9)}${num(row.lights, 8)}${num(row.colliders, 6)}`);
  }

  if (warnings.size) {
    console.log(`\n${warnings.size} warning(s) - budgets in docs/art/ROOM_FORMAT.md §7 are guidance:`);
    for (const message of warnings.values()) console.log(`  ! ${message}`);
  }

  if (errors.size) {
    console.log(`\n${errors.size} error(s):`);
    for (const message of errors.values()) console.log(`  x ${message}`);
    console.log('');
    process.exit(1);
  }

  console.log(`\nOK - ${rows.length} blueprint(s) validated.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
