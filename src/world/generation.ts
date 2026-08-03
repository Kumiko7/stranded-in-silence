/**
 * Map generation. See docs/systems/GENERATION.md.
 *
 * Pure and deterministic: generate(mapId, seed, config) always produces the same
 * RunLayout, which is why peers exchange a seed rather than a map.
 *
 * It plans the whole map from blueprint METADATA only - footprint, which walls
 * may open, anchors. It never builds a 3D object. That is what makes art
 * swappable: two rooms with the same footprint and anchors play identically.
 *
 * The unit of layout is a SLOT, not a cell. Most slots are one cell, but a
 * multi-cell blueprint claims several before the maze is grown, and everything
 * after that - the spanning tree, the locks, the regions, the loops - works on
 * slots. Cells only come back at the end, because the enemy's room graph and the
 * "which room am I standing in" lookup are still per cell.
 */
import type { Anchor, Cell, RoomBlueprint, Side } from '@art/lib/contract';
import { SIDES } from '@art/lib/contract';
import type { WorldConfig } from '@/config/types';
import { pickWeighted, rangeInt, shuffle, stream, type Rng } from '@/core/rng';

export interface PlacedRoom {
  /** The world cell the blueprint's own `[0,0]` lands on. */
  cell: Cell;
  blueprintId: string;
  /** `0`, `PI/2`, `PI` or `3*PI/2`. Applied to the room object AND its colliders. */
  rotationY: number;
  /** Every world cell this room occupies. One entry for all but multi-cell rooms. */
  cells: readonly Cell[];
  /**
   * The openings this run gave the room, in BLUEPRINT-LOCAL cell and side, so
   * `build()` can key `ctx.doors` with them directly and never has to know it was
   * rotated.
   */
  doors: readonly { cell: Cell; side: Side }[];
  /** How many locked doors sit between the spawn room and this one. */
  region: number;
  /**
   * World-space points the enemy walks while patrolling, from the blueprint's
   * `patrolPoint` anchors, rotated and translated into the world.
   */
  patrolPoints: readonly (readonly [number, number])[];
}

/**
 * One grid cell. The enemy's graph is per cell rather than per room, so a 2x2
 * ballroom is four nodes joined by `interior` links that cost nothing - which
 * keeps "which room is this position in" a rounding operation.
 */
export interface PlacedCell {
  cell: Cell;
  /** Index into `RunLayout.rooms`. */
  room: number;
  /** Sides with a real door to a different room. */
  doors: readonly Side[];
  /** Sides that open into another cell of the SAME room. No door, no cost. */
  interior: readonly Side[];
  patrolPoints: readonly (readonly [number, number])[];
}

export interface PlacedDoor {
  id: string;
  /** World position of the door's centre, on the boundary between two cells. */
  position: readonly [number, number];
  /** 0 for a door in a wall running east-west, PI/2 for north-south. */
  rotationY: number;
  isExit: boolean;
  locked: boolean;
}

export interface PlacedContainer {
  id: string;
  kind: 'chest' | 'locker';
  position: readonly [number, number, number];
  rotationY: number;
  /** Chests only: the item id revealed on opening, or null for an empty chest. */
  contents: string | null;
}

export interface PlacedItem {
  id: string;
  itemId: string;
  position: readonly [number, number, number];
}

export interface RunLayout {
  seed: number;
  mapId: string;
  grid: { width: number; height: number; cellSize: number };
  rooms: PlacedRoom[];
  /** Every grid cell, tagged with the room that covers it. */
  cells: PlacedCell[];
  doors: PlacedDoor[];
  containers: PlacedContainer[];
  items: PlacedItem[];
  /** Every spawn point in the shared start room. Players take one each by slot. */
  playerSpawns: { position: readonly [number, number, number]; yaw: number }[];
  exitCell: Cell;
  /** Where the hunter starts: far from the players, and behind no locked door. */
  enemySpawn: { cell: Cell; position: readonly [number, number] };
}

const STEP: Record<Side, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

const OPPOSITE: Record<Side, Side> = { north: 'south', south: 'north', east: 'west', west: 'east' };

const key = (x: number, y: number) => `${x},${y}`;
const edgeKey = (x: number, y: number, side: Side) =>
  side === 'north' ? `h:${x},${y}` : side === 'south' ? `h:${x},${y + 1}` : side === 'west' ? `v:${x},${y}` : `v:${x + 1},${y}`;

/**
 * The door id shared by a cell and its neighbour across `side`. Both cells name
 * the same door, which is what lets the room graph walk from doors alone.
 */
export const doorIdBetween = edgeKey;

/** Cell step for a side, so consumers do not re-derive the grid convention. */
export const sideStep = (side: Side): readonly [number, number] => STEP[side];

/* --- rotation ---------------------------------------------------------------- */

const QUARTER = Math.PI / 2;

/**
 * One 90 degree step of the room object's own `rotation.y`, which maps a local
 * point `(x, z)` to `(z, -x)`. Everything else here follows from that: rotating
 * a room means rotating its footprint, its `doorWalls`, its anchors and its
 * colliders by exactly the same transform, so a blueprint never has to know.
 */
const TURNED: Record<Side, Side> = { north: 'west', east: 'north', south: 'east', west: 'south' };

const wrapTurns = (turns: number) => ((turns % 4) + 4) % 4;

export function rotateSide(side: Side, turns: number): Side {
  let result = side;
  for (let i = wrapTurns(turns); i > 0; i--) result = TURNED[result];
  return result;
}

export function rotateCell(cell: Cell, turns: number): Cell {
  let [x, y] = cell;
  for (let i = wrapTurns(turns); i > 0; i--) [x, y] = [y, -x];
  return [x, y];
}

/** Rotates a room-local `xz` offset the way the room object is rotated. */
function rotateXZ(x: number, z: number, turns: number): readonly [number, number] {
  const theta = wrapTurns(turns) * QUARTER;
  // Exact at quarter turns: Math.cos(PI/2) is 6e-17, and that drifts anchors.
  const cos = Math.round(Math.cos(theta));
  const sin = Math.round(Math.sin(theta));
  return [x * cos + z * sin, -x * sin + z * cos];
}

/* --- slots -------------------------------------------------------------------- */

/**
 * A patch of the grid that will hold exactly one room. Multi-cell slots know
 * their blueprint and rotation from the moment they are packed, because the maze
 * has to be grown around the walls that blueprint is willing to open.
 */
interface LayoutSlot {
  index: number;
  cells: Cell[];
  /** Where the blueprint's `[0,0]` sits. */
  origin: Cell;
  turns: number;
  /** Fixed for multi-cell slots; chosen after the maze for 1x1 slots. */
  blueprintId: string | null;
  /** World `x,y:side` edges this slot may open. `null` means "any outer edge". */
  allowed: ReadonlySet<string> | null;
}

const edgeAllowKey = (cell: Cell, side: Side) => `${cell[0]},${cell[1]}:${side}`;

/** `1x2`, `2x2`, `L`... matching the keys in `layout.multiCellRooms.footprintWeights`. */
function shapeKey(footprint: readonly Cell[]): string {
  const xs = footprint.map((c) => c[0]);
  const ys = footprint.map((c) => c[1]);
  const w = Math.max(...xs) - Math.min(...xs) + 1;
  const h = Math.max(...ys) - Math.min(...ys) + 1;
  return footprint.length === w * h ? `${w}x${h}` : 'L';
}

/** A key slot the generator can fill: either a chest's contents or a floor spawn. */
interface Slot {
  room: PlacedRoom;
  region: number;
  container?: PlacedContainer;
  item?: PlacedItem;
}

/**
 * Carves the grid into slots. Multi-cell blueprints go in first - once the maze
 * exists there is nowhere to put them - and each is used at most once per map,
 * so a run never has two ballrooms.
 *
 * Returns `null` when the packing left a slot no legal edge to reach, which the
 * caller retries; that is far simpler than trying to prove a packing is
 * connectable before committing to it.
 */
function packSlots(
  world: WorldConfig,
  blueprints: readonly RoomBlueprint[],
  rng: Rng,
  allowMultiCell: boolean,
): LayoutSlot[] | null {
  const { width, height } = world.grid;
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const taken = new Map<string, number>();
  const slots: LayoutSlot[] = [];

  const config = world.layout.multiCellRooms;
  if (allowMultiCell && config.enabled && config.maxSlots > 0) {
    const candidates = blueprints.filter((bp) => bp.footprint.length > 1);
    // Weighted order, so a 2x1 gets a look in long before an L does.
    const ordered: RoomBlueprint[] = [];
    const pool = [...candidates];
    while (pool.length) {
      const chosen = pickWeighted(rng, pool, (bp) => config.footprintWeights[shapeKey(bp.footprint)] ?? 1);
      ordered.push(chosen);
      pool.splice(pool.indexOf(chosen), 1);
    }

    const positions: { origin: Cell; turns: number }[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let turns = 0; turns < 4; turns++) positions.push({ origin: [x, y], turns });
      }
    }

    for (const blueprint of ordered) {
      if (slots.length >= config.maxSlots) break;

      for (const { origin, turns } of shuffle(rng, [...positions])) {
        const cells = blueprint.footprint.map((cell) => {
          const [dx, dy] = rotateCell(cell, turns);
          return [origin[0] + dx, origin[1] + dy] as Cell;
        });
        if (cells.some(([x, y]) => !inBounds(x, y) || taken.has(key(x, y)))) continue;

        const occupied = new Set(cells.map(([x, y]) => key(x, y)));
        const allowed = new Set<string>();
        let reachable = false;
        for (const wall of blueprint.doorWalls) {
          const [dx, dy] = rotateCell(wall.cell, turns);
          const cell: Cell = [origin[0] + dx, origin[1] + dy];
          const side = rotateSide(wall.side, turns);
          allowed.add(edgeAllowKey(cell, side));

          const [sx, sy] = STEP[side];
          const beyond: Cell = [cell[0] + sx, cell[1] + sy];
          if (inBounds(beyond[0], beyond[1]) && !occupied.has(key(beyond[0], beyond[1]))) reachable = true;
        }
        // A room whose every door faces the map edge could never be walked into.
        if (!reachable) continue;

        const index = slots.length;
        slots.push({ index, cells, origin, turns, blueprintId: blueprint.id, allowed });
        for (const [x, y] of cells) taken.set(key(x, y), index);
        break;
      }
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (taken.has(key(x, y))) continue;
      const index = slots.length;
      slots.push({ index, cells: [[x, y]], origin: [x, y], turns: 0, blueprintId: null, allowed: null });
      taken.set(key(x, y), index);
    }
  }

  // Every slot must be reachable from every other over the edges they permit.
  const slotAt = (x: number, y: number) => taken.get(key(x, y));
  const allows = (slot: LayoutSlot, cell: Cell, side: Side) => !slot.allowed || slot.allowed.has(edgeAllowKey(cell, side));

  const seen = new Set<number>([0]);
  const queue = [0];
  for (let head = 0; head < queue.length; head++) {
    const slot = slots[queue[head] as number];
    if (!slot) break;
    for (const cell of slot.cells) {
      for (const side of SIDES) {
        const [dx, dy] = STEP[side];
        const [nx, ny] = [cell[0] + dx, cell[1] + dy];
        const other = inBounds(nx, ny) ? slotAt(nx, ny) : undefined;
        if (other === undefined || other === slot.index || seen.has(other)) continue;
        const target = slots[other];
        if (!target || !allows(slot, cell, side) || !allows(target, [nx, ny], OPPOSITE[side])) continue;
        seen.add(other);
        queue.push(other);
      }
    }
  }

  return seen.size === slots.length ? slots : null;
}

export function generate(
  mapId: string,
  seed: number,
  world: WorldConfig,
  blueprints: readonly RoomBlueprint[],
  /** `enemy.json -> archetypes.<id>.spawn`. Kept as a parameter so generation reads one config file. */
  enemySpawn: { minRoomDistanceFromPlayers: number },
): RunLayout {
  const { width, height, cellSize } = world.grid;
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const byId = new Map(blueprints.map((bp) => [bp.id, bp]));

  // --- 0. slot the grid, packing multi-cell footprints first ------------------
  let slots: LayoutSlot[] | null = null;
  for (let attempt = 0; attempt < Math.max(1, world.validation.maxAttempts) && !slots; attempt++) {
    slots = packSlots(world, blueprints, stream(seed, `slots:${attempt}`), true);
  }
  // A grid of 1x1 slots is always connectable, so this cannot fail.
  slots ??= packSlots(world, blueprints, stream(seed, 'slots:flat'), false) ?? [];

  const slotOfCell = new Map<string, number>();
  for (const slot of slots) for (const [x, y] of slot.cells) slotOfCell.set(key(x, y), slot.index);

  const slotAt = (x: number, y: number): LayoutSlot | undefined => slots[slotOfCell.get(key(x, y)) ?? -1];
  const allows = (slot: LayoutSlot, cell: Cell, side: Side) => !slot.allowed || slot.allowed.has(edgeAllowKey(cell, side));

  /** Can this cell edge ever become a door? Interior edges of a room never can. */
  const legalEdge = (x: number, y: number, side: Side): boolean => {
    const [dx, dy] = STEP[side];
    if (!inBounds(x + dx, y + dy)) return false;
    const here = slotAt(x, y);
    const there = slotAt(x + dx, y + dy);
    if (!here || !there || here.index === there.index) return false;
    return allows(here, [x, y], side) && allows(there, [x + dx, y + dy], OPPOSITE[side]);
  };

  /** Every legal edge out of a slot, as the cell it leaves from. */
  const exitsOf = (slot: LayoutSlot, rng: Rng) => {
    const out: { cell: Cell; side: Side }[] = [];
    for (const cell of slot.cells) for (const side of SIDES) if (legalEdge(cell[0], cell[1], side)) out.push({ cell, side });
    return shuffle(rng, out);
  };

  // --- 1. spanning tree over SLOTS: every room reachable, every path unique ---
  const layoutRng = stream(seed, 'layout');
  const tree = new Set<string>();
  const startSlot = slotAt(0, 0);
  const visited = new Set<number>(startSlot ? [startSlot.index] : []);
  const frontier: { cell: Cell; side: Side }[] = startSlot ? exitsOf(startSlot, layoutRng) : [];

  while (frontier.length) {
    const index = Math.floor(layoutRng() * frontier.length);
    const [entry] = frontier.splice(index, 1);
    if (!entry) break;

    const [dx, dy] = STEP[entry.side];
    const target = slotAt(entry.cell[0] + dx, entry.cell[1] + dy);
    if (!target || visited.has(target.index)) continue;

    visited.add(target.index);
    tree.add(edgeKey(entry.cell[0], entry.cell[1], entry.side));
    frontier.push(...exitsOf(target, layoutRng));
  }

  /** Breadth-first over slots, across whichever edge set is passed in. */
  const walkSlots = (from: number, edges: ReadonlySet<string>, blocked?: ReadonlySet<string>) => {
    const distance = new Map<number, number>([[from, 0]]);
    const via = new Map<number, { cell: Cell; side: Side; from: number }>();
    const queue = [from];

    for (let head = 0; head < queue.length; head++) {
      const slot = slots[queue[head] as number];
      if (!slot) break;
      const d = distance.get(slot.index) ?? 0;

      for (const cell of slot.cells) {
        for (const side of SIDES) {
          if (!legalEdge(cell[0], cell[1], side)) continue;
          const edge = edgeKey(cell[0], cell[1], side);
          if (!edges.has(edge) || blocked?.has(edge)) continue;

          const [dx, dy] = STEP[side];
          const next = slotAt(cell[0] + dx, cell[1] + dy);
          if (!next || distance.has(next.index)) continue;
          distance.set(next.index, d + 1);
          via.set(next.index, { cell, side, from: slot.index });
          queue.push(next.index);
        }
      }
    }
    return { distance, via };
  };

  // --- 2. spawn and exit, measured over the TREE -----------------------------
  // Tree distance is what matters here: it is the route the player must walk
  // before any loop shortcuts exist, and the locks in step 3 sit on it.
  const placeRng = stream(seed, 'placement');
  const boundary: Cell[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) boundary.push([x, y]);
    }
  }

  const spawnCell = boundary[Math.floor(placeRng() * boundary.length)] ?? ([0, 0] as Cell);
  const spawnSlot = slotAt(spawnCell[0], spawnCell[1]);
  const treeWalk = walkSlots(spawnSlot?.index ?? 0, tree);

  // The exit opens through an outer wall - the one direction normal doors never
  // go - so the room there has to be willing to open that particular wall.
  const outwardSide = (cell: Cell): Side | null =>
    cell[0] === 0 ? 'west' : cell[0] === width - 1 ? 'east' : cell[1] === 0 ? 'north' : cell[1] === height - 1 ? 'south' : null;

  let exitCell = spawnCell;
  let exitSide = outwardSide(spawnCell) ?? 'north';
  let best = -1;
  for (const cell of shuffle(placeRng, [...boundary])) {
    const side = outwardSide(cell);
    const slot = slotAt(cell[0], cell[1]);
    if (!side || !slot || !allows(slot, cell, side)) continue;

    const d = treeWalk.distance.get(slot.index) ?? -1;
    if (d > best) {
      best = d;
      exitCell = cell;
      exitSide = side;
    }
  }
  if (best < world.exit.minGridDistanceFromSpawn) {
    console.warn(`[generation] exit only ${best} rooms from spawn`);
  }

  // --- 3. lock doors on the spawn -> exit route ------------------------------
  // Because the tree gives exactly one route, every edge on it is a door the
  // player MUST pass. Locking those is what makes "X locked doors between you
  // and the exit" structural rather than a hopeful post-check.
  const routeEdges: { edge: string; beyond: number }[] = [];
  for (let slot = slotAt(exitCell[0], exitCell[1])?.index ?? 0; slot !== spawnSlot?.index; ) {
    const step = treeWalk.via.get(slot);
    if (!step) break;
    routeEdges.push({ edge: edgeKey(step.cell[0], step.cell[1], step.side), beyond: slot });
    slot = step.from;
  }
  routeEdges.reverse(); // spawn -> exit order

  const eligible = routeEdges.slice(Math.max(0, world.doors.lockedDoorMinDepth - 1));
  const lockCount = Math.min(world.doors.lockedDoorCount, eligible.length);
  const locks: { edge: string; beyond: number }[] = [];
  for (let i = 0; i < lockCount; i++) {
    // Evenly spaced along the eligible stretch, so two locks are never adjacent.
    const chosen = eligible[Math.floor(((i + 1) * eligible.length) / (lockCount + 1))];
    if (chosen) locks.push(chosen);
  }
  const lockedEdges = new Set(locks.map((lock) => lock.edge));
  if (lockCount < world.doors.lockedDoorCount) {
    console.warn(`[generation] only ${lockCount} of ${world.doors.lockedDoorCount} locked doors fit the route`);
  }

  // Region i is everything you can reach after opening the first i locks. Slots
  // hanging off the route inherit the region of the branch they hang from.
  const region = new Map<number, number>();
  const claim = (from: number, index: number) => {
    for (const slot of walkSlots(from, tree, lockedEdges).distance.keys()) {
      if (!region.has(slot)) region.set(slot, index);
    }
  };
  claim(spawnSlot?.index ?? 0, 0);
  locks.forEach((lock, index) => claim(lock.beyond, index + 1));
  const regionOf = (slot: number) => region.get(slot) ?? 0;

  // --- 4. loops, but never around a lock -------------------------------------
  // A pure tree plays as a dead-end farm, so extra doors are added - except any
  // that would join two regions, which would let players walk around a lock.
  const open = new Set(tree);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (const side of ['east', 'south'] as const) {
        if (!legalEdge(x, y, side)) continue;
        if (layoutRng() >= world.layout.extraDoorChance) continue;
        const [dx, dy] = STEP[side];
        const here = slotAt(x, y);
        const there = slotAt(x + dx, y + dy);
        if (!here || !there || regionOf(here.index) !== regionOf(there.index)) continue;
        open.add(edgeKey(x, y, side));
      }
    }
  }

  // --- 5. assign blueprints and rotations ------------------------------------
  const roomRng = stream(seed, 'blueprints');
  const usage = new Map<string, number>();
  for (const slot of slots) if (slot.blueprintId) usage.set(slot.blueprintId, 1);

  /** Every open edge of a slot, in world terms. */
  const openEdgesOf = (slot: LayoutSlot) => {
    const out: { cell: Cell; side: Side }[] = [];
    for (const cell of slot.cells) {
      for (const side of SIDES) {
        if (!legalEdge(cell[0], cell[1], side) || !open.has(edgeKey(cell[0], cell[1], side))) continue;
        out.push({ cell, side });
      }
    }
    if (slot.cells.some((cell) => cell[0] === exitCell[0] && cell[1] === exitCell[1])) {
      out.push({ cell: exitCell, side: exitSide });
    }
    return out;
  };

  const rooms: PlacedRoom[] = [];
  const roomOfSlot = new Map<number, number>();

  for (const slot of slots) {
    const openings = openEdgesOf(slot);

    if (!slot.blueprintId) {
      const isSpawn = slot.cells.some((cell) => cell[0] === spawnCell[0] && cell[1] === spawnCell[1]);
      const prefer = isSpawn ? (bp: RoomBlueprint) => (bp.anchors.playerSpawn?.length ?? 0) > 0 : undefined;
      const fit = chooseBlueprint(
        blueprints,
        openings.map((opening) => opening.side),
        usage,
        world.layout.maxDuplicatesPerRoom,
        roomRng,
        prefer,
      );
      slot.blueprintId = fit.id;
      slot.turns = fit.turns;
    }

    const blueprint = byId.get(slot.blueprintId);
    const patrol = (blueprint?.anchors.patrolPoint ?? []).map((anchor) => {
      const [x, z] = rotateXZ(anchor.position[0], anchor.position[2], slot.turns);
      return [slot.origin[0] * cellSize + x, slot.origin[1] * cellSize + z] as const;
    });

    roomOfSlot.set(slot.index, rooms.length);
    rooms.push({
      cell: slot.origin,
      blueprintId: slot.blueprintId,
      rotationY: wrapTurns(slot.turns) * QUARTER,
      cells: slot.cells,
      // Back into the blueprint's own frame, so `build()` never sees the rotation.
      doors: openings.map((opening) => ({
        cell: rotateCell([opening.cell[0] - slot.origin[0], opening.cell[1] - slot.origin[1]], -slot.turns),
        side: rotateSide(opening.side, -slot.turns),
      })),
      region: regionOf(slot.index),
      // A room that declares no patrol anchors still has to be walkable to, so it
      // falls back to the centre of its first cell.
      patrolPoints: patrol.length
        ? patrol
        : [[(slot.cells[0]?.[0] ?? 0) * cellSize, (slot.cells[0]?.[1] ?? 0) * cellSize] as const],
    });
  }

  // --- 6. per-cell view, for the enemy's room graph --------------------------
  const cells: PlacedCell[] = [];
  for (const slot of slots) {
    const roomIndex = roomOfSlot.get(slot.index) ?? 0;
    const room = rooms[roomIndex];

    for (const cell of slot.cells) {
      const doors: Side[] = [];
      const interior: Side[] = [];
      for (const side of SIDES) {
        const [dx, dy] = STEP[side];
        if (!inBounds(cell[0] + dx, cell[1] + dy)) continue;
        const other = slotAt(cell[0] + dx, cell[1] + dy);
        if (!other) continue;
        if (other.index === slot.index) interior.push(side);
        else if (open.has(edgeKey(cell[0], cell[1], side)) && legalEdge(cell[0], cell[1], side)) doors.push(side);
      }

      // Patrol points belong to whichever cell they physically stand in.
      const mine = (room?.patrolPoints ?? []).filter(
        ([x, z]) => Math.round(x / cellSize) === cell[0] && Math.round(z / cellSize) === cell[1],
      );
      cells.push({
        cell,
        room: roomIndex,
        doors,
        interior,
        patrolPoints: mine.length ? mine : [[cell[0] * cellSize, cell[1] * cellSize] as const],
      });
    }
  }

  // --- 7. door objects, one per shared edge ----------------------------------
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
          locked: lockedEdges.has(edgeKey(x, y, side)),
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
    locked: false,
  });

  // --- 8. contents, then keys ------------------------------------------------
  const { containers, items, slots: keySlots } = fillContents(rooms, byId, world, seed, cellSize);
  placeKeys(keySlots, locks.length, world, seed);

  // --- 9. spawn transforms from the start room's own anchors -----------------
  // Every player starts in this one room, on a different anchor, so they begin
  // together without standing inside each other.
  const spawnRoom = rooms[roomOfSlot.get(spawnSlot?.index ?? 0) ?? 0];
  const spawnBlueprint = byId.get(spawnRoom?.blueprintId ?? '');

  const anchors = spawnBlueprint?.anchors.playerSpawn ?? [];
  const playerSpawns =
    spawnRoom && anchors.length
      ? anchors.map((anchor) => {
          const placed = placeAnchor(anchor, spawnRoom, cellSize);
          return { position: placed.position, yaw: placed.rotationY };
        })
      : [{ position: [spawnCell[0] * cellSize, 0, spawnCell[1] * cellSize] as const, yaw: 0 }];

  // --- 10. the hunter's start room -------------------------------------------
  // Measured over the OPEN edge set with locks blocked, so the enemy can always
  // walk to the players without a key, and starts far enough away that nobody is
  // ambushed on the spawn tile. Falls back to the furthest room it can reach.
  const enemyWalk = walkSlots(spawnSlot?.index ?? 0, open, lockedEdges);
  const reachable = slots
    .filter((slot) => enemyWalk.distance.has(slot.index))
    .map((slot) => ({ slot, distance: enemyWalk.distance.get(slot.index) ?? 0 }));

  const farEnough = reachable.filter((entry) => entry.distance >= enemySpawn.minRoomDistanceFromPlayers);
  const enemyRng = stream(seed, 'enemySpawn');
  const chosen =
    farEnough.length > 0 ? shuffle(enemyRng, farEnough)[0] : reachable.sort((a, b) => b.distance - a.distance)[0];

  if (!farEnough.length) {
    console.warn(`[generation] no room ${enemySpawn.minRoomDistanceFromPlayers}+ from spawn for the enemy`);
  }

  const enemyRoom = rooms[roomOfSlot.get(chosen?.slot.index ?? 0) ?? 0];
  const enemyPoint = enemyRoom?.patrolPoints[0] ?? ([0, 0] as const);

  return {
    seed,
    mapId,
    grid: { width, height, cellSize },
    rooms,
    cells,
    doors,
    containers,
    items: items.filter((item) => item.itemId !== ''),
    playerSpawns,
    exitCell,
    enemySpawn: {
      cell: [Math.round(enemyPoint[0] / cellSize), Math.round(enemyPoint[1] / cellSize)],
      position: enemyPoint,
    },
  };
}

/** An anchor in world space: rotated with its room, then moved onto its origin cell. */
function placeAnchor(
  anchor: Anchor,
  room: PlacedRoom,
  cellSize: number,
): { position: readonly [number, number, number]; rotationY: number } {
  const turns = Math.round(room.rotationY / QUARTER);
  const [x, z] = rotateXZ(anchor.position[0], anchor.position[2], turns);
  return {
    position: [room.cell[0] * cellSize + x, anchor.position[1], room.cell[1] * cellSize + z],
    rotationY: (anchor.rotationY ?? 0) + room.rotationY,
  };
}

/**
 * Rolls chests, lockers and item spawns into each room's declared anchors, and
 * returns every slot a key could later be dropped into.
 */
function fillContents(
  rooms: readonly PlacedRoom[],
  byId: ReadonlyMap<string, RoomBlueprint>,
  world: WorldConfig,
  seed: number,
  cellSize: number,
): { containers: PlacedContainer[]; items: PlacedItem[]; slots: Slot[] } {
  const contentsRng = stream(seed, 'contents');
  const lootRng = stream(seed, 'loot');
  const containers: PlacedContainer[] = [];
  const items: PlacedItem[] = [];
  const slots: Slot[] = [];
  const spareChestAnchors: { room: PlacedRoom; anchor: Anchor; index: number }[] = [];

  const roll = (range: { min: number; max: number }, available: number) =>
    Math.min(available, rangeInt(contentsRng, range.min, range.max + 1));

  const drawn = <T,>(list: readonly T[], count: number) =>
    shuffle(contentsRng, list.map((value, index) => ({ value, index }))).slice(0, count);

  const lootFrom = (table: Record<string, number>): string | null => {
    const entries = Object.entries(table).sort(([a], [b]) => a.localeCompare(b));
    if (!entries.length) return null;
    const [id] = pickWeighted(lootRng, entries, ([, weight]) => weight);
    return id === 'empty' ? null : id;
  };

  for (const room of rooms) {
    const blueprint = byId.get(room.blueprintId);
    if (!blueprint) continue;
    const at = (anchor: Anchor) => placeAnchor(anchor, room, cellSize);

    const chestAnchors = blueprint.anchors.chest ?? [];
    const chosenChests = drawn(chestAnchors, roll(world.contents.chests, chestAnchors.length));
    const takenChests = new Set(chosenChests.map((entry) => entry.index));
    for (const { value: anchor, index } of chosenChests) {
      const placed = at(anchor);
      const container: PlacedContainer = {
        id: `chest:${room.cell[0]},${room.cell[1]}:${index}`,
        kind: 'chest',
        position: placed.position,
        rotationY: placed.rotationY,
        contents: lootFrom(world.loot.chestTable),
      };
      containers.push(container);
      slots.push({ room, region: room.region, container });
    }
    chestAnchors.forEach((anchor, index) => {
      if (!takenChests.has(index)) spareChestAnchors.push({ room, anchor, index });
    });

    const lockerAnchors = blueprint.anchors.locker ?? [];
    for (const { value: anchor, index } of drawn(lockerAnchors, roll(world.contents.lockers, lockerAnchors.length))) {
      const placed = at(anchor);
      containers.push({
        id: `locker:${room.cell[0]},${room.cell[1]}:${index}`,
        kind: 'locker',
        position: placed.position,
        rotationY: placed.rotationY,
        contents: null,
      });
    }

    const itemAnchors = blueprint.anchors.itemSpawn ?? [];
    for (const { value: anchor, index } of drawn(itemAnchors, roll(world.contents.itemSpawns, itemAnchors.length))) {
      // Pushed even when it rolls empty - it is still a slot a key can land in.
      // Empty ones are dropped after key placement.
      const item: PlacedItem = {
        id: `item:${room.cell[0]},${room.cell[1]}:${index}`,
        itemId: lootFrom(world.loot.floorTable) ?? '',
        position: at(anchor).position,
      };
      items.push(item);
      slots.push({ room, region: room.region, item });
    }
  }

  // A map with no chests has nowhere interesting to hide a key, so top up.
  const chestCount = () => containers.filter((entry) => entry.kind === 'chest').length;
  for (const { room, anchor, index } of shuffle(contentsRng, spareChestAnchors)) {
    if (chestCount() >= world.contents.chests.mapTotalMin) break;
    const placed = placeAnchor(anchor, room, cellSize);
    const container: PlacedContainer = {
      id: `chest:${room.cell[0]},${room.cell[1]}:${index}`,
      kind: 'chest',
      position: placed.position,
      rotationY: placed.rotationY,
      contents: lootFrom(world.loot.chestTable),
    };
    containers.push(container);
    slots.push({ room, region: room.region, container });
  }

  return { containers, items, slots };
}

/**
 * Guarantees the run is completable: the key for lock i always sits in a region
 * you can already reach with the first i keys, so you can never be locked out of
 * your own progress. Spares go anywhere before the last lock.
 */
function placeKeys(slots: Slot[], lockCount: number, world: WorldConfig, seed: number): void {
  const keyRng = stream(seed, 'keys');
  const filled = new Set<Slot>();

  const fill = (maxRegion: number): boolean => {
    const free = slots.filter((slot) => slot.region <= maxRegion && !filled.has(slot));
    // Chests first: a key behind a slow, loud chest is the trade the game is about.
    const inChests = free.filter((slot) => slot.container);
    const pool = inChests.length ? inChests : free;
    const slot = pool[Math.floor(keyRng() * pool.length)];
    if (!slot) return false;

    filled.add(slot);
    if (slot.container) slot.container.contents = 'key';
    if (slot.item) slot.item.itemId = 'key';
    return true;
  };

  for (let i = 0; i < lockCount; i++) {
    if (!fill(i)) console.warn(`[generation] no slot for the key to locked door ${i + 1}`);
  }
  for (let i = 0; i < world.doors.keySpareCount; i++) fill(Math.max(0, lockCount - 1));
}

/**
 * A blueprint fits a 1x1 slot when, at SOME 90 degree rotation, its `doorWalls`
 * is a superset of the sides the slot needs. A room offering all four walls fits
 * anywhere at any angle; a one-door store room fits every dead end in the map
 * because it can be turned to face it.
 *
 * Rotation is picked at random among the ones that fit, so two copies of the
 * same blueprint rarely face the same way.
 */
function chooseBlueprint(
  blueprints: readonly RoomBlueprint[],
  required: readonly Side[],
  usage: Map<string, number>,
  maxDuplicates: number,
  rng: Rng,
  /** Extra requirement (e.g. "must have a player spawn"). Ignored if nothing satisfies it. */
  prefer?: (bp: RoomBlueprint) => boolean,
): { id: string; turns: number } {
  /** The rotations at which this blueprint covers everything the slot needs. */
  const turnsThatFit = (bp: RoomBlueprint): number[] => {
    if (bp.footprint.length !== 1) return []; // multi-cell rooms are packed, not fitted
    const offers = new Set(bp.doorWalls.filter((wall) => wall.cell[0] === 0 && wall.cell[1] === 0).map((wall) => wall.side));
    const out: number[] = [];
    for (let turns = 0; turns < 4; turns++) {
      if (required.every((side) => offers.has(rotateSide(side, -turns)))) out.push(turns);
    }
    return out;
  };

  const options = blueprints.map((bp) => ({ bp, turns: turnsThatFit(bp) })).filter((entry) => entry.turns.length > 0);
  let fits = options;
  if (prefer) {
    const preferred = fits.filter((entry) => prefer(entry.bp));
    if (preferred.length) fits = preferred;
  }

  const underCap = fits.filter((entry) => (usage.get(entry.bp.id) ?? 0) < (entry.bp.maxPerMap ?? maxDuplicates));
  const pool = underCap.length ? underCap : fits;

  if (!pool.length) {
    // Should be unreachable while a pack has an all-four-walls room, but never
    // fail generation over it - a duplicate is far better than a broken map.
    const fallback = blueprints.find((bp) => bp.footprint.length === 1);
    if (!fallback) throw new Error('generation: art pack has no 1x1 rooms');
    console.warn(`[generation] no blueprint fits [${required.join(',')}], using ${fallback.id}`);
    return { id: fallback.id, turns: 0 };
  }

  const chosen = pickWeighted(rng, pool, (entry) => entry.bp.weight ?? 10);
  usage.set(chosen.bp.id, (usage.get(chosen.bp.id) ?? 0) + 1);
  return { id: chosen.bp.id, turns: chosen.turns[Math.floor(rng() * chosen.turns.length)] ?? 0 };
}
