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
import type { Anchor, RoomBlueprint, Side } from '@art/lib/contract';
import { SIDES } from '@art/lib/contract';
import type { WorldConfig } from '@/config/types';
import { pickWeighted, rangeInt, shuffle, stream, type Rng } from '@/core/rng';

export interface PlacedRoom {
  cell: readonly [number, number];
  blueprintId: string;
  /** Sides of this cell that have an opening. */
  doors: readonly Side[];
  /** How many locked doors sit between the spawn room and this one. */
  region: number;
  /**
   * World-space points the enemy walks while patrolling this room, from the
   * blueprint's `patrolPoint` anchors. Always at least one (the room centre).
   */
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
  doors: PlacedDoor[];
  containers: PlacedContainer[];
  items: PlacedItem[];
  /** Every spawn point in the shared start room. Players take one each by slot. */
  playerSpawns: { position: readonly [number, number, number]; yaw: number }[];
  exitCell: readonly [number, number];
  /** Where the hunter starts: far from the players, and behind no locked door. */
  enemySpawn: { cell: readonly [number, number]; position: readonly [number, number] };
}

const STEP: Record<Side, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

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

/** A key slot the generator can fill: either a chest's contents or a floor spawn. */
interface Slot {
  cell: readonly [number, number];
  region: number;
  container?: PlacedContainer;
  item?: PlacedItem;
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

  // --- 1. spanning tree: every room reachable, every path unique --------------
  const layoutRng = stream(seed, 'layout');
  const tree = new Set<string>();
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
    tree.add(edgeKey(fx, fy, entry.side));
    pushFrontier(tx, ty);
  }

  /** Walkable neighbours of a cell, over whichever edge set is passed in. */
  const stepsFrom = (x: number, y: number, edges: ReadonlySet<string>, blocked?: ReadonlySet<string>) =>
    SIDES.filter((side) => {
      const [dx, dy] = STEP[side];
      if (!inBounds(x + dx, y + dy)) return false;
      const edge = edgeKey(x, y, side);
      return edges.has(edge) && !blocked?.has(edge);
    });

  // --- 2. spawn and exit, measured over the TREE -----------------------------
  // Tree distance is what matters here: it is the route the player must walk
  // before any loop shortcuts exist, and the locks in step 3 sit on it.
  const placeRng = stream(seed, 'placement');
  const boundary: (readonly [number, number])[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) boundary.push([x, y] as const);
    }
  }

  const spawnCell = boundary[Math.floor(placeRng() * boundary.length)] ?? ([0, 0] as const);
  const treeWalk = walk(spawnCell, tree, stepsFrom);

  let exitCell = spawnCell;
  let best = -1;
  for (const cell of shuffle(placeRng, [...boundary])) {
    const d = treeWalk.distance.get(key(cell[0], cell[1])) ?? -1;
    if (d > best) {
      best = d;
      exitCell = cell;
    }
  }
  if (best < world.exit.minGridDistanceFromSpawn) {
    console.warn(`[generation] exit only ${best} rooms from spawn`);
  }

  // --- 3. lock doors on the spawn -> exit route ------------------------------
  // Because the tree gives exactly one route, every edge on it is a door the
  // player MUST pass. Locking those is what makes "X locked doors between you
  // and the exit" structural rather than a hopeful post-check.
  const routeEdges: { edge: string; from: readonly [number, number]; to: readonly [number, number] }[] = [];
  for (let cell = exitCell; !same(cell, spawnCell); ) {
    const from = treeWalk.previous.get(key(cell[0], cell[1]));
    if (!from) break;
    routeEdges.push({ edge: edgeBetween(from, cell), from, to: cell });
    cell = from;
  }
  routeEdges.reverse(); // spawn -> exit order

  const eligible = routeEdges.slice(Math.max(0, world.doors.lockedDoorMinDepth - 1));
  const lockCount = Math.min(world.doors.lockedDoorCount, eligible.length);
  const locks: { edge: string; beyond: readonly [number, number] }[] = [];
  for (let i = 0; i < lockCount; i++) {
    // Evenly spaced along the eligible stretch, so two locks are never adjacent.
    const chosen = eligible[Math.floor(((i + 1) * eligible.length) / (lockCount + 1))];
    if (chosen) locks.push({ edge: chosen.edge, beyond: chosen.to });
  }
  const lockedEdges = new Set(locks.map((lock) => lock.edge));
  if (lockCount < world.doors.lockedDoorCount) {
    console.warn(`[generation] only ${lockCount} of ${world.doors.lockedDoorCount} locked doors fit the route`);
  }

  // Region i is everything you can reach after opening the first i locks. Cells
  // hanging off the route inherit the region of the branch they hang from.
  const region = new Map<string, number>();
  const claim = (from: readonly [number, number], index: number) => {
    for (const cell of walk(from, tree, stepsFrom, lockedEdges).distance.keys()) {
      if (!region.has(cell)) region.set(cell, index);
    }
  };
  claim(spawnCell, 0);
  locks.forEach((lock, index) => claim(lock.beyond, index + 1));
  const regionOf = (x: number, y: number) => region.get(key(x, y)) ?? 0;

  // --- 4. loops, but never around a lock -------------------------------------
  // A pure tree plays as a dead-end farm, so extra doors are added - except any
  // that would join two regions, which would let players walk around a lock.
  const open = new Set(tree);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (const side of ['east', 'south'] as const) {
        const [dx, dy] = STEP[side];
        if (!inBounds(x + dx, y + dy)) continue;
        if (layoutRng() >= world.layout.extraDoorChance) continue;
        if (regionOf(x, y) !== regionOf(x + dx, y + dy)) continue;
        open.add(edgeKey(x, y, side));
      }
    }
  }

  const doorsOf = (x: number, y: number) => stepsFrom(x, y, open);

  // The exit opens through an outer wall - the one direction normal doors never go.
  const exitSide =
    exitCell[0] === 0 ? 'west' : exitCell[0] === width - 1 ? 'east' : exitCell[1] === 0 ? 'north' : 'south';

  // --- 5. assign blueprints by door mask -------------------------------------
  const roomRng = stream(seed, 'blueprints');
  const usage = new Map<string, number>();
  const rooms: PlacedRoom[] = [];
  const byId = new Map(blueprints.map((bp) => [bp.id, bp]));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const required = doorsOf(x, y);
      if (x === exitCell[0] && y === exitCell[1]) required.push(exitSide);

      // The start room must actually declare somewhere to stand, or players
      // spawn on the room's centre point and possibly inside its furniture.
      const isSpawn = same([x, y], spawnCell);
      const prefer = isSpawn ? (bp: RoomBlueprint) => (bp.anchors.playerSpawn?.length ?? 0) > 0 : undefined;

      const blueprintId = chooseBlueprint(blueprints, required, usage, world.layout.maxDuplicatesPerRoom, roomRng, prefer);
      const anchors = byId.get(blueprintId)?.anchors.patrolPoint ?? [];

      rooms.push({
        cell: [x, y],
        blueprintId,
        doors: required,
        region: regionOf(x, y),
        // A room that declares no patrol anchors still has to be walkable to,
        // so it falls back to its own centre.
        patrolPoints: anchors.length
          ? anchors.map((anchor) => [x * cellSize + anchor.position[0], y * cellSize + anchor.position[2]] as const)
          : [[x * cellSize, y * cellSize] as const],
      });
    }
  }

  // --- 6. door objects, one per shared edge ----------------------------------
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

  // --- 7. contents, then keys ------------------------------------------------
  const { containers, items, slots } = fillContents(rooms, byId, world, seed, cellSize);
  placeKeys(slots, locks.length, world, seed);

  // --- 8. spawn transforms from the start room's own anchors -----------------
  // Every player starts in this one room, on a different anchor, so they begin
  // together without standing inside each other.
  const spawnRoom = rooms.find((room) => same(room.cell, spawnCell));
  const spawnBlueprint = byId.get(spawnRoom?.blueprintId ?? '');
  const [sx, sy] = spawnCell;

  const anchors = spawnBlueprint?.anchors.playerSpawn ?? [];
  const playerSpawns = anchors.length
    ? anchors.map((anchor) => ({
        position: [sx * cellSize + anchor.position[0], 0, sy * cellSize + anchor.position[2]] as const,
        yaw: anchor.rotationY ?? 0,
      }))
    : [{ position: [sx * cellSize, 0, sy * cellSize] as const, yaw: 0 }];

  // --- 9. the hunter's start room --------------------------------------------
  // Measured over the OPEN edge set with locks blocked, so the enemy can always
  // walk to the players without a key, and starts far enough away that nobody is
  // ambushed on the spawn tile. Falls back to the furthest room it can reach.
  const enemyWalk = walk(spawnCell, open, stepsFrom, lockedEdges);
  const reachable = rooms
    .filter((room) => enemyWalk.distance.has(key(room.cell[0], room.cell[1])))
    .map((room) => ({ room, distance: enemyWalk.distance.get(key(room.cell[0], room.cell[1])) ?? 0 }));

  const farEnough = reachable.filter((entry) => entry.distance >= enemySpawn.minRoomDistanceFromPlayers);
  const enemyRng = stream(seed, 'enemySpawn');
  const chosen =
    farEnough.length > 0
      ? shuffle(enemyRng, farEnough)[0]
      : reachable.sort((a, b) => b.distance - a.distance)[0];

  if (!farEnough.length) {
    console.warn(`[generation] no room ${enemySpawn.minRoomDistanceFromPlayers}+ from spawn for the enemy`);
  }

  const enemyRoom = chosen?.room ?? rooms[0];
  const enemyPoint = enemyRoom?.patrolPoints[0] ?? ([0, 0] as const);

  return {
    seed,
    mapId,
    grid: { width, height, cellSize },
    rooms,
    doors,
    containers,
    items: items.filter((item) => item.itemId !== ''),
    playerSpawns,
    exitCell,
    enemySpawn: { cell: enemyRoom?.cell ?? [0, 0], position: enemyPoint },
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

    const [cx, cz] = [room.cell[0] * cellSize, room.cell[1] * cellSize];
    const place = (anchor: Anchor) =>
      [cx + anchor.position[0], anchor.position[1], cz + anchor.position[2]] as const;

    const chestAnchors = blueprint.anchors.chest ?? [];
    const chosenChests = drawn(chestAnchors, roll(world.contents.chests, chestAnchors.length));
    const takenChests = new Set(chosenChests.map((entry) => entry.index));
    for (const { value: anchor, index } of chosenChests) {
      const container: PlacedContainer = {
        id: `chest:${room.cell[0]},${room.cell[1]}:${index}`,
        kind: 'chest',
        position: place(anchor),
        rotationY: anchor.rotationY ?? 0,
        contents: lootFrom(world.loot.chestTable),
      };
      containers.push(container);
      slots.push({ cell: room.cell, region: room.region, container });
    }
    chestAnchors.forEach((anchor, index) => {
      if (!takenChests.has(index)) spareChestAnchors.push({ room, anchor, index });
    });

    const lockerAnchors = blueprint.anchors.locker ?? [];
    for (const { value: anchor, index } of drawn(lockerAnchors, roll(world.contents.lockers, lockerAnchors.length))) {
      containers.push({
        id: `locker:${room.cell[0]},${room.cell[1]}:${index}`,
        kind: 'locker',
        position: place(anchor),
        rotationY: anchor.rotationY ?? 0,
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
        position: place(anchor),
      };
      items.push(item);
      slots.push({ cell: room.cell, region: room.region, item });
    }
  }

  // A map with no chests has nowhere interesting to hide a key, so top up.
  const chestCount = () => containers.filter((entry) => entry.kind === 'chest').length;
  for (const { room, anchor, index } of shuffle(contentsRng, spareChestAnchors)) {
    if (chestCount() >= world.contents.chests.mapTotalMin) break;
    const container: PlacedContainer = {
      id: `chest:${room.cell[0]},${room.cell[1]}:${index}`,
      kind: 'chest',
      position: [room.cell[0] * cellSize + anchor.position[0], anchor.position[1], room.cell[1] * cellSize + anchor.position[2]],
      rotationY: anchor.rotationY ?? 0,
      contents: lootFrom(world.loot.chestTable),
    };
    containers.push(container);
    slots.push({ cell: room.cell, region: room.region, container });
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

/** Breadth-first flood over an edge set, recording distance and the way back. */
function walk(
  from: readonly [number, number],
  edges: ReadonlySet<string>,
  stepsFrom: (x: number, y: number, edges: ReadonlySet<string>, blocked?: ReadonlySet<string>) => Side[],
  blocked?: ReadonlySet<string>,
): { distance: Map<string, number>; previous: Map<string, readonly [number, number]> } {
  const distance = new Map<string, number>([[key(from[0], from[1]), 0]]);
  const previous = new Map<string, readonly [number, number]>();
  const queue: (readonly [number, number])[] = [from];

  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    if (!cell) break;
    const [x, y] = cell;
    const d = distance.get(key(x, y)) ?? 0;

    for (const side of stepsFrom(x, y, edges, blocked)) {
      const [dx, dy] = STEP[side];
      const next = [x + dx, y + dy] as const;
      if (distance.has(key(next[0], next[1]))) continue;
      distance.set(key(next[0], next[1]), d + 1);
      previous.set(key(next[0], next[1]), cell);
      queue.push(next);
    }
  }
  return { distance, previous };
}

function same(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function edgeBetween(from: readonly [number, number], to: readonly [number, number]): string {
  const side = SIDES.find((candidate) => STEP[candidate][0] === to[0] - from[0] && STEP[candidate][1] === to[1] - from[1]);
  return edgeKey(from[0], from[1], side ?? 'north');
}
