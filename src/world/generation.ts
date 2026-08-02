/**
 * Map generation. See docs/systems/GENERATION.md.
 *
 * Pure and deterministic: generate(mapId, seed, config) always produces the same
 * RunLayout, which is why peers exchange a seed rather than a map.
 *
 * It plans the whole map from blueprint METADATA only - footprint, which walls
 * may open, anchors. It never builds a 3D object. That is what makes art
 * swappable: two rooms with the same footprint and anchors play identically.
 */
import type { RoomBlueprint, Side } from '@art/lib/contract';
import { SIDES } from '@art/lib/contract';
import type { WorldConfig } from '@/config/types';
import { pickWeighted, shuffle, stream, type Rng } from '@/core/rng';

export interface PlacedRoom {
  cell: readonly [number, number];
  blueprintId: string;
  /** Sides of this cell that have an opening. */
  doors: readonly Side[];
}

export interface PlacedDoor {
  id: string;
  /** World position of the door's centre, on the boundary between two cells. */
  position: readonly [number, number];
  /** 0 for a door in a wall running east-west, PI/2 for north-south. */
  rotationY: number;
  isExit: boolean;
}

export interface RunLayout {
  seed: number;
  mapId: string;
  grid: { width: number; height: number; cellSize: number };
  rooms: PlacedRoom[];
  doors: PlacedDoor[];
  /** Every spawn point in the shared start room. Players take one each by slot. */
  playerSpawns: { position: readonly [number, number, number]; yaw: number }[];
  exitCell: readonly [number, number];
}

const OPPOSITE: Record<Side, Side> = { north: 'south', south: 'north', east: 'west', west: 'east' };
const STEP: Record<Side, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

const key = (x: number, y: number) => `${x},${y}`;
const edgeKey = (x: number, y: number, side: Side) =>
  side === 'north' ? `h:${x},${y}` : side === 'south' ? `h:${x},${y + 1}` : side === 'west' ? `v:${x},${y}` : `v:${x + 1},${y}`;

export function generate(
  mapId: string,
  seed: number,
  world: WorldConfig,
  blueprints: readonly RoomBlueprint[],
): RunLayout {
  const { width, height, cellSize } = world.grid;
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;

  // --- 1. connect: spanning tree so everything is reachable, then loops -----
  const layoutRng = stream(seed, 'layout');
  const open = new Set<string>();
  const visited = new Set<string>([key(0, 0)]);
  const frontier: { from: readonly [number, number]; side: Side }[] = [];

  const pushFrontier = (x: number, y: number) => {
    for (const side of shuffle(layoutRng, [...SIDES])) {
      const [dx, dy] = STEP[side];
      if (inBounds(x + dx, y + dy) && !visited.has(key(x + dx, y + dy))) {
        frontier.push({ from: [x, y], side });
      }
    }
  };
  pushFrontier(0, 0);

  while (frontier.length) {
    const index = Math.floor(layoutRng() * frontier.length);
    const [entry] = frontier.splice(index, 1);
    if (!entry) break;

    const [fx, fy] = entry.from;
    const [dx, dy] = STEP[entry.side];
    const [tx, ty] = [fx + dx, fy + dy];
    if (visited.has(key(tx, ty))) continue;

    visited.add(key(tx, ty));
    open.add(edgeKey(fx, fy, entry.side));
    pushFrontier(tx, ty);
  }

  // Extra edges: a pure tree plays as a frustrating dead-end farm.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (const side of ['east', 'south'] as const) {
        const [dx, dy] = STEP[side];
        if (!inBounds(x + dx, y + dy)) continue;
        if (layoutRng() < world.layout.extraDoorChance) open.add(edgeKey(x, y, side));
      }
    }
  }

  const doorsOf = (x: number, y: number): Side[] =>
    SIDES.filter((side) => {
      const [dx, dy] = STEP[side];
      return inBounds(x + dx, y + dy) && open.has(edgeKey(x, y, side));
    });

  // --- 2. spawn and exit ---------------------------------------------------
  const placeRng = stream(seed, 'placement');
  const boundary = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) boundary.push([x, y] as const);
    }
  }

  const spawnCell = boundary[Math.floor(placeRng() * boundary.length)] ?? ([0, 0] as const);
  const distance = bfs(spawnCell, doorsOf, width, height);

  // Farthest boundary cell, so the exit is a genuine trek from the spawn.
  let exitCell = spawnCell;
  let best = -1;
  for (const cell of shuffle(placeRng, [...boundary])) {
    const d = distance.get(key(cell[0], cell[1])) ?? -1;
    if (d > best) {
      best = d;
      exitCell = cell;
    }
  }
  if (best < world.exit.minGridDistanceFromSpawn) {
    console.warn(`[generation] exit only ${best} rooms from spawn`);
  }

  // The exit opens through an outer wall - the one direction normal doors never go.
  const exitSide =
    exitCell[0] === 0 ? 'west' : exitCell[0] === width - 1 ? 'east' : exitCell[1] === 0 ? 'north' : 'south';

  // --- 3. assign blueprints by door mask -----------------------------------
  const roomRng = stream(seed, 'blueprints');
  const usage = new Map<string, number>();
  const rooms: PlacedRoom[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const required = doorsOf(x, y);
      if (x === exitCell[0] && y === exitCell[1]) required.push(exitSide);

      // The start room must actually declare somewhere to stand, or players
      // spawn on the room's centre point and possibly inside its furniture.
      const isSpawn = x === spawnCell[0] && y === spawnCell[1];
      const prefer = isSpawn ? (bp: RoomBlueprint) => (bp.anchors.playerSpawn?.length ?? 0) > 0 : undefined;

      rooms.push({
        cell: [x, y],
        blueprintId: chooseBlueprint(blueprints, required, usage, world.layout.maxDuplicatesPerRoom, roomRng, prefer),
        doors: required,
      });
    }
  }

  // --- 4. door objects, one per shared edge --------------------------------
  const doors: PlacedDoor[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (const side of ['east', 'south'] as const) {
        const [dx, dy] = STEP[side];
        if (!inBounds(x + dx, y + dy) || !open.has(edgeKey(x, y, side))) continue;
        doors.push({
          id: edgeKey(x, y, side),
          position: [(x + dx / 2) * cellSize, (y + dy / 2) * cellSize],
          rotationY: side === 'east' ? Math.PI / 2 : 0,
          isExit: false,
        });
      }
    }
  }

  const [ex, ey] = exitCell;
  const [edx, edy] = STEP[exitSide];
  doors.push({
    id: `exit:${ex},${ey}`,
    position: [(ex + edx / 2) * cellSize, (ey + edy / 2) * cellSize],
    rotationY: edx !== 0 ? Math.PI / 2 : 0,
    isExit: true,
  });

  // --- 5. spawn transforms from the start room's own anchors ----------------
  // Every player starts in this one room, on a different anchor, so they begin
  // together without standing inside each other.
  const spawnRoom = rooms.find((room) => room.cell[0] === spawnCell[0] && room.cell[1] === spawnCell[1]);
  const spawnBlueprint = blueprints.find((bp) => bp.id === spawnRoom?.blueprintId);
  const [sx, sy] = spawnCell;

  const anchors = spawnBlueprint?.anchors.playerSpawn ?? [];
  const playerSpawns = anchors.length
    ? anchors.map((anchor) => ({
        position: [sx * cellSize + anchor.position[0], 0, sy * cellSize + anchor.position[2]] as const,
        yaw: anchor.rotationY ?? 0,
      }))
    : [{ position: [sx * cellSize, 0, sy * cellSize] as const, yaw: 0 }];

  return {
    seed,
    mapId,
    grid: { width, height, cellSize },
    rooms,
    doors,
    playerSpawns,
    exitCell,
  };
}

/**
 * A blueprint fits a slot when its `doorWalls` is a SUPERSET of the sides the
 * slot needs. A room offering all four walls fits anywhere; a one-door closet
 * only fits dead ends.
 */
function chooseBlueprint(
  blueprints: readonly RoomBlueprint[],
  required: readonly Side[],
  usage: Map<string, number>,
  maxDuplicates: number,
  rng: Rng,
  /** Extra requirement (e.g. "must have a player spawn"). Ignored if nothing satisfies it. */
  prefer?: (bp: RoomBlueprint) => boolean,
): string {
  const offers = (bp: RoomBlueprint, side: Side) =>
    bp.doorWalls.some((wall) => wall.side === side && wall.cell[0] === 0 && wall.cell[1] === 0);

  let fits = blueprints.filter((bp) => required.every((side) => offers(bp, side)));
  if (prefer) {
    const preferred = fits.filter(prefer);
    if (preferred.length) fits = preferred;
  }

  const underCap = fits.filter((bp) => (usage.get(bp.id) ?? 0) < (bp.maxPerMap ?? maxDuplicates));
  const pool = underCap.length ? underCap : fits;

  if (!pool.length) {
    // Should be unreachable while a pack has an all-four-walls room, but never
    // fail generation over it - a duplicate is far better than a broken map.
    const fallback = blueprints[0];
    if (!fallback) throw new Error('generation: art pack has no rooms');
    console.warn(`[generation] no blueprint fits [${required.join(',')}], using ${fallback.id}`);
    return fallback.id;
  }

  const chosen = pickWeighted(rng, pool, (bp) => bp.weight ?? 10);
  usage.set(chosen.id, (usage.get(chosen.id) ?? 0) + 1);
  return chosen.id;
}

function bfs(
  from: readonly [number, number],
  doorsOf: (x: number, y: number) => Side[],
  width: number,
  height: number,
): Map<string, number> {
  const distance = new Map<string, number>([[key(from[0], from[1]), 0]]);
  const queue: (readonly [number, number])[] = [from];

  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    if (!cell) break;
    const [x, y] = cell;
    const d = distance.get(key(x, y)) ?? 0;

    for (const side of doorsOf(x, y)) {
      const [dx, dy] = STEP[side];
      const [nx, ny] = [x + dx, y + dy];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (distance.has(key(nx, ny))) continue;
      distance.set(key(nx, ny), d + 1);
      queue.push([nx, ny]);
    }
  }
  return distance;
}
