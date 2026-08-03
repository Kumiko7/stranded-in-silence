/**
 * Map generation validation - `npm run validate:gen`.
 *
 * The generator is pure, deterministic and completely headless, which makes it
 * the one part of the game that can be proven rather than played. This script
 * generates every enabled map over hundreds of seeds and asserts the invariants
 * the design depends on - the ones that are cheap to state, expensive to test by
 * hand, and catastrophic to get wrong:
 *
 *   - the layout is a pure function of `(mapId, seed)`, so peers agree;
 *   - every grid cell belongs to exactly one room, and every room's cells are
 *     its blueprint's footprint rotated by its own `rotationY`;
 *   - a room's `doors` are walls it actually declared, in its own frame, so a
 *     rotated room cuts its openings where it thinks it does;
 *   - every cell is walkable from the spawn, and a greedy key hunt always
 *     reaches the exit - the "you can never be stuck" property;
 *   - the enemy can reach the players without a key;
 *   - each multi-cell blueprint is used at most once per map.
 *
 * See docs/systems/GENERATION.md. Room-level art checks live in the sibling
 * `validateArt.mjs`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

const baseWorld = json('../config/world.json');
const maps = json('../config/maps.json');
const enemy = json('../config/enemy.json');

const SEEDS = Number(process.argv[2] ?? 400);
const SIDES = ['north', 'east', 'south', 'west'];
const STEP = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const QUARTER = Math.PI / 2;

const failures = new Map();
const stats = { maps: 0, layouts: 0, multiCell: 0, rotated: 0, rooms: 0 };
/** How often each multi-cell blueprint actually made it into a map. */
const placements = new Map();

const fail = (where, message) => {
  const key = `${where}|${message}`;
  if (!failures.has(key)) failures.set(key, `${where}: ${message}`);
};

const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };
const cellKey = (x, y) => `${x},${y}`;
const edgeId = (x, y, side) =>
  side === 'north' ? `h:${x},${y}` : side === 'south' ? `h:${x},${y + 1}` : side === 'west' ? `v:${x},${y}` : `v:${x + 1},${y}`;

/**
 * Rotation, re-derived here rather than imported from the generator.
 *
 * This is the whole point of the script: importing `rotateSide` would test that
 * the generator agrees with itself, which it always will. Breaking rotation in
 * `generation.ts` has to make THIS file disagree, or the check is theatre.
 *
 * A room object rotated by `+PI/2` maps its local `(x, z)` to `(z, -x)`, and a
 * wall's outward normal follows: north `(0,-1)` becomes `(-1,0)`, which is west.
 */
const TURNED = { north: 'west', east: 'north', south: 'east', west: 'south' };
const wrapTurns = (turns) => ((turns % 4) + 4) % 4;

function rotSide(side, turns) {
  let result = side;
  for (let i = wrapTurns(turns); i > 0; i--) result = TURNED[result];
  return result;
}

function rotCell(cell, turns) {
  let [x, y] = cell;
  for (let i = wrapTurns(turns); i > 0; i--) [x, y] = [y, -x];
  return [x, y];
}

function rotXZ(x, z, turns) {
  const theta = wrapTurns(turns) * (Math.PI / 2);
  const cos = Math.round(Math.cos(theta));
  const sin = Math.round(Math.sin(theta));
  return [x * cos + z * sin, -x * sin + z * cos];
}

/** Deep merge for a map's `overrides.world`, matching the config loader. */
function merge(base, patch) {
  if (!patch) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(base?.[key] ?? {}, value) : value;
  }
  return out;
}

/* --- checks ------------------------------------------------------------------- */

function checkLayout(where, layout, blueprints, world) {
  const { width, height, cellSize } = layout.grid;
  const byId = new Map(blueprints.map((bp) => [bp.id, bp]));
  const doorAt = new Set(layout.doors.filter((door) => !door.isExit).map((door) => door.id));
  const exitDoor = layout.doors.find((door) => door.isExit);
  const exitId = exitDoor ? exitDoor.id : null;

  /*
   * Which wall the exit opens through, read off the door's own position rather
   * than guessed from the cell: a corner cell has two outer walls, and guessing
   * picks the wrong one half the time.
   */
  let exitEdge = null;
  if (exitDoor) {
    const [ex, ey] = layout.exitCell;
    const dx = Math.round((exitDoor.position[0] / cellSize - ex) * 2);
    const dy = Math.round((exitDoor.position[1] / cellSize - ey) * 2);
    const side = SIDES.find((candidate) => STEP[candidate][0] === dx && STEP[candidate][1] === dy);
    if (!side) fail(where, `the exit door is not on a wall of the exit cell [${layout.exitCell}]`);
    else {
      exitEdge = edgeId(ex, ey, side);
      const [nx, ny] = [ex + dx, ey + dy];
      if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
        fail(where, `the exit at [${layout.exitCell}] opens ${side}, into the map rather than out of it`);
      }
    }
  }

  /* every cell covered exactly once, by a room that admits to it */
  const owner = new Map();
  for (const placed of layout.cells) {
    const key = cellKey(placed.cell[0], placed.cell[1]);
    if (owner.has(key)) fail(where, `cell ${key} is claimed twice`);
    owner.set(key, placed);
    const room = layout.rooms[placed.room];
    if (!room) fail(where, `cell ${key} points at room ${placed.room}, which does not exist`);
    else if (!room.cells.some((c) => c[0] === placed.cell[0] && c[1] === placed.cell[1])) {
      fail(where, `cell ${key} says it belongs to room ${placed.room}, which does not list it`);
    }
  }
  if (owner.size !== width * height) fail(where, `${owner.size} cells covered, grid has ${width * height}`);

  /* rooms sit where their footprint says, at a legal rotation */
  const usedMultiCell = new Map();
  for (const room of layout.rooms) {
    stats.rooms += 1;
    const blueprint = byId.get(room.blueprintId);
    if (!blueprint) {
      fail(where, `room references unknown blueprint "${room.blueprintId}"`);
      continue;
    }

    const turns = Math.round(room.rotationY / QUARTER);
    if (Math.abs(room.rotationY - turns * QUARTER) > 1e-9 || turns < 0 || turns > 3) {
      fail(where, `${room.blueprintId} has rotationY ${room.rotationY}, which is not a quarter turn`);
    }
    if (turns !== 0) stats.rotated += 1;

    const expected = new Set(
      blueprint.footprint.map((cell) => {
        const [dx, dy] = rotCell(cell, turns);
        return cellKey(room.cell[0] + dx, room.cell[1] + dy);
      }),
    );
    const actual = new Set(room.cells.map((c) => cellKey(c[0], c[1])));
    if (expected.size !== actual.size || [...expected].some((c) => !actual.has(c))) {
      fail(where, `${room.blueprintId} occupies [${[...actual]}] but its footprint at ${turns} turns is [${[...expected]}]`);
    }

    if (blueprint.footprint.length > 1) {
      usedMultiCell.set(room.blueprintId, (usedMultiCell.get(room.blueprintId) ?? 0) + 1);
      placements.set(room.blueprintId, (placements.get(room.blueprintId) ?? 0) + 1);
      stats.multiCell += 1;
    }

    /*
     * The openings handed back are walls the blueprint offers, AND they land
     * where the doors physically are. The second half is the one that matters:
     * a room can be handed a perfectly legal set of local sides and still have
     * them rotated onto the wrong walls, which is a room whose doorway is solid
     * plaster and whose blank wall is a hole.
     */
    const worldDoorsOfRoom = new Set();
    for (const cell of room.cells) {
      for (const side of SIDES) {
        const id = edgeId(cell[0], cell[1], side);
        const [dx, dy] = STEP[side];
        const neighbour = room.cells.some((c) => c[0] === cell[0] + dx && c[1] === cell[1] + dy);
        if (!neighbour && (doorAt.has(id) || (exitEdge !== null && id === exitEdge))) worldDoorsOfRoom.add(`${cell};${side}`);
      }
    }

    for (const opening of room.doors) {
      const offered = blueprint.doorWalls.some(
        (wall) => wall.side === opening.side && wall.cell[0] === opening.cell[0] && wall.cell[1] === opening.cell[1],
      );
      if (!offered) {
        fail(where, `${room.blueprintId} was given a door at [${opening.cell}]:${opening.side}, which it never offered`);
      }

      const [dx, dy] = rotCell(opening.cell, turns);
      const worldCell = [room.cell[0] + dx, room.cell[1] + dy];
      const worldSide = rotSide(opening.side, turns);
      const tag = `${worldCell};${worldSide}`;
      if (!worldDoorsOfRoom.has(tag)) {
        fail(
          where,
          `${room.blueprintId} cuts an opening at local [${opening.cell}]:${opening.side}, which at ${turns} turns ` +
            `is world [${worldCell}]:${worldSide} - and there is no door there`,
        );
      }
      worldDoorsOfRoom.delete(tag);
    }
    for (const missed of worldDoorsOfRoom) {
      fail(where, `${room.blueprintId} has a door at world ${missed} that it was never told to cut`);
    }

    /* anchors rotate with the room, so they must land on its own cells */
    const halfCell = layout.grid.cellSize / 2 + 0.02;
    for (const [kind, list] of Object.entries(blueprint.anchors ?? {})) {
      for (const anchor of list ?? []) {
        const [ax, az] = rotXZ(anchor.position[0], anchor.position[2], turns);
        const wx = room.cell[0] * cellSize + ax;
        const wz = room.cell[1] * cellSize + az;
        const covered = room.cells.some(
          (cell) => Math.abs(wx - cell[0] * cellSize) <= halfCell && Math.abs(wz - cell[1] * cellSize) <= halfCell,
        );
        if (!covered) fail(where, `${room.blueprintId} rotated its ${kind} anchor out of its own footprint`);
      }
    }
  }

  for (const [id, count] of usedMultiCell) {
    if (count > 1) fail(where, `multi-cell room ${id} placed ${count} times; the cap is one per map`);
  }
  const multiCellRules = world.layout.multiCellRooms;
  const packed = [...usedMultiCell.values()].reduce((sum, count) => sum + count, 0);
  const allowance = multiCellRules.enabled ? multiCellRules.maxSlots : 0;
  if (packed > allowance) fail(where, `${packed} multi-cell rooms packed, but maxSlots is ${allowance}`);

  /* doors join two different rooms, and both cells name the same door */
  const doorIds = new Set(layout.doors.filter((door) => !door.isExit).map((door) => door.id));
  for (const placed of layout.cells) {
    for (const side of placed.doors) {
      const [dx, dy] = STEP[side];
      const other = owner.get(cellKey(placed.cell[0] + dx, placed.cell[1] + dy));
      if (!other) {
        fail(where, `cell ${cellKey(...placed.cell)} has a ${side} door leading off the grid`);
        continue;
      }
      if (other.room === placed.room) fail(where, `cell ${cellKey(...placed.cell)} has a ${side} door into its own room`);
      if (!doorIds.has(edgeId(placed.cell[0], placed.cell[1], side))) {
        fail(where, `cell ${cellKey(...placed.cell)} opens ${side} but no door object exists there`);
      }
      if (!other.doors.includes(OPPOSITE[side])) {
        fail(where, `the ${side} door out of ${cellKey(...placed.cell)} is not mirrored by its neighbour`);
      }
    }
    for (const side of placed.interior) {
      const [dx, dy] = STEP[side];
      const other = owner.get(cellKey(placed.cell[0] + dx, placed.cell[1] + dy));
      if (!other || other.room !== placed.room) {
        fail(where, `cell ${cellKey(...placed.cell)} claims a ${side} interior link to another room`);
      }
    }
  }

  /* every cell walkable from the spawn, ignoring locks */
  const spawn = layout.playerSpawns[0];
  const spawnCell = spawn
    ? cellKey(Math.round(spawn.position[0] / cellSize), Math.round(spawn.position[2] / cellSize))
    : '0,0';
  const walk = (blockedDoors) => {
    const seen = new Set([spawnCell]);
    const queue = [spawnCell];
    for (let head = 0; head < queue.length; head++) {
      const placed = owner.get(queue[head]);
      if (!placed) break;
      for (const side of [...placed.doors, ...placed.interior]) {
        const [dx, dy] = STEP[side];
        const key = cellKey(placed.cell[0] + dx, placed.cell[1] + dy);
        if (seen.has(key) || !owner.has(key)) continue;
        if (placed.doors.includes(side) && blockedDoors?.has(edgeId(placed.cell[0], placed.cell[1], side))) continue;
        seen.add(key);
        queue.push(key);
      }
    }
    return seen;
  };

  if (!owner.has(spawnCell)) fail(where, `the player spawn is at ${spawnCell}, which is not a cell`);
  const everywhere = walk();
  if (everywhere.size !== owner.size) {
    fail(where, `only ${everywhere.size}/${owner.size} cells are reachable from the spawn`);
  }

  /* a greedy key hunt always reaches the exit */
  const locked = new Set(layout.doors.filter((door) => door.locked).map((door) => door.id));
  const keySources = [
    ...layout.containers.filter((entry) => entry.contents === 'key'),
    ...layout.items.filter((entry) => entry.itemId === 'key'),
  ].map((entry) => ({
    entry,
    cell: cellKey(Math.round(entry.position[0] / cellSize), Math.round(entry.position[2] / cellSize)),
  }));

  const held = new Set();
  const shut = new Set(locked);
  for (let round = 0; round <= locked.size; round++) {
    const reach = walk(shut);
    for (const source of keySources) if (reach.has(source.cell)) held.add(source.entry);

    if (!shut.size) break;
    // Any key opens any one door (`world.json -> doors.keyReusable = false`), so
    // progress needs a key in hand that has not already been spent.
    if (held.size <= locked.size - shut.size) break;

    const next = layout.doors.find(
      (door) =>
        shut.has(door.id) &&
        [...reach].some((key) => {
          const placed = owner.get(key);
          return placed?.doors.some((side) => edgeId(placed.cell[0], placed.cell[1], side) === door.id);
        }),
    );
    if (!next) break;
    shut.delete(next.id);
  }
  const final = walk(shut);
  const exit = cellKey(layout.exitCell[0], layout.exitCell[1]);
  if (!final.has(exit)) fail(where, `the exit at ${exit} is not reachable after collecting every reachable key`);

  /* the enemy can walk to the players without a key */
  const enemyCell = cellKey(layout.enemySpawn.cell[0], layout.enemySpawn.cell[1]);
  if (!walk(locked).has(enemyCell)) {
    fail(where, `the enemy starts at ${enemyCell}, which the players cannot reach without unlocking a door`);
  }

  /* placed content stays inside the room that declared it */
  const half = cellSize / 2 + 0.02;
  const inside = (position) =>
    layout.rooms.some((room) =>
      room.cells.some(
        (cell) =>
          Math.abs(position[0] - cell[0] * cellSize) <= half && Math.abs(position[2] - cell[1] * cellSize) <= half,
      ),
    );
  for (const container of layout.containers) {
    if (!inside(container.position)) fail(where, `${container.kind} ${container.id} is outside every room`);
  }
  for (const item of layout.items) {
    if (!inside(item.position)) fail(where, `item ${item.id} is outside every room`);
  }
  for (const placedSpawn of layout.playerSpawns) {
    if (!inside(placedSpawn.position)) fail(where, 'a player spawn is outside every room');
  }
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

  // Only `generate` is imported: every transform this script checks against is
  // re-derived above, so a broken rotation in the generator cannot hide here.
  const { generate } = await server.ssrLoadModule('/src/world/generation.ts');
  const { getArtPack } = await server.ssrLoadModule('/art/packs/index.ts');
  await server.close();

  const spawnRules = enemy.archetypes?.ghost?.spawn ?? { minRoomDistanceFromPlayers: 4 };

  for (const [mapId, entry] of Object.entries(maps.maps)) {
    if (entry.enabled === false) continue;
    const pack = getArtPack(entry.artPack);
    const world = merge(baseWorld, entry.overrides?.world);
    stats.maps += 1;

    for (let seed = 1; seed <= SEEDS; seed++) {
      const where = `${mapId} seed ${seed}`;
      let layout;
      try {
        layout = generate(mapId, seed, world, pack.rooms, spawnRules);
      } catch (error) {
        fail(where, `generate() threw: ${error.message}`);
        continue;
      }
      stats.layouts += 1;

      // Determinism, on a sample of seeds - it is the expensive check.
      if (seed % 25 === 0) {
        const again = generate(mapId, seed, world, pack.rooms, spawnRules);
        if (JSON.stringify(again) !== JSON.stringify(layout)) {
          fail(where, 'two generations from the same seed differ');
        }
      }

      checkLayout(where, layout, pack.rooms, world);
    }
  }

  console.log(
    `\n${stats.layouts} layout(s) over ${stats.maps} map(s): ${stats.rooms} rooms, ` +
      `${stats.multiCell} multi-cell placements, ` +
      `${((stats.rotated / Math.max(1, stats.rooms)) * 100).toFixed(0)}% of rooms rotated.`,
  );
  for (const [id, count] of [...placements].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${id.padEnd(24)} in ${((count / SEEDS) * 100).toFixed(0)}% of maps`);
  }

  if (failures.size) {
    console.log(`\n${failures.size} error(s):`);
    for (const message of [...failures.values()].slice(0, 40)) console.log(`  x ${message}`);
    if (failures.size > 40) console.log(`  ... and ${failures.size - 40} more`);
    console.log('');
    process.exit(1);
  }

  console.log('OK - every invariant held.\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
