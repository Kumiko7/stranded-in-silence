/**
 * The enemy's map: the run's rooms as a graph, and A* over it.
 *
 * The world is already a graph of rooms joined by doors, so hierarchical pathing
 * on it is cheaper and far more controllable than a navmesh - "search a nearby
 * room" is one query. See docs/ARCHITECTURE.md section 10 and docs/systems/AI.md.
 *
 * Edge cost is rooms walked plus what a door costs in TIME: a closed door is the
 * enemy standing still while it opens, and a locked one is a wall.
 */
import type { Side } from '@art/lib/contract';
import { doorIdBetween, sideStep, type RunLayout } from '@/world/generation';
import type { Door } from '@/world/doors';

export type CellKey = string;

export interface RoomNode {
  cell: readonly [number, number];
  key: CellKey;
  /** Index into `RunLayout.rooms`. Several cells of a big room share one. */
  room: number;
  /** World-space centre of the cell. */
  x: number;
  z: number;
  patrolPoints: readonly (readonly [number, number])[];
  /** `doorId` is `''` for an interior link - two cells of one room. */
  links: { key: CellKey; doorId: string; side: Side }[];
}

export interface PathCosts {
  /** Seconds the enemy loses standing at a closed door. */
  doorSeconds: number;
  canOpenLockedDoors: boolean;
}

export const cellKey = (x: number, y: number): CellKey => `${x},${y}`;

export class RoomGraph {
  readonly #nodes = new Map<CellKey, RoomNode>();
  readonly #cellSize: number;

  constructor(layout: RunLayout) {
    this.#cellSize = layout.grid.cellSize;

    // One node per CELL, not per room: a 2x2 ballroom is four nodes joined by
    // interior links, which keeps `cellAt()` a rounding operation and keeps the
    // enemy's "search the next room" query meaning something inside a big room.
    for (const placed of layout.cells) {
      this.#nodes.set(cellKey(placed.cell[0], placed.cell[1]), {
        cell: placed.cell,
        key: cellKey(placed.cell[0], placed.cell[1]),
        room: placed.room,
        x: placed.cell[0] * layout.grid.cellSize,
        z: placed.cell[1] * layout.grid.cellSize,
        patrolPoints: placed.patrolPoints,
        links: [],
      });
    }

    // A cell lists the sides it opens on; the door on that side is named the
    // same by both cells, which is what makes the link two-way for free.
    for (const placed of layout.cells) {
      const node = this.#nodes.get(cellKey(placed.cell[0], placed.cell[1]));
      if (!node) continue;

      const link = (side: Side, doorId: string): void => {
        const [dx, dy] = sideStep(side);
        const neighbour = this.#nodes.get(cellKey(placed.cell[0] + dx, placed.cell[1] + dy));
        if (!neighbour) return; // the exit door leads out of the grid
        node.links.push({ key: neighbour.key, doorId, side });
      };

      for (const side of placed.doors) link(side, doorIdBetween(placed.cell[0], placed.cell[1], side));
      // Two halves of the same room: open floor, no door, nothing to unlock.
      for (const side of placed.interior) link(side, '');
    }
  }

  get nodes(): readonly RoomNode[] {
    return [...this.#nodes.values()];
  }

  node(key: CellKey): RoomNode | undefined {
    return this.#nodes.get(key);
  }

  /** Which room a world position is standing in. */
  cellAt(x: number, z: number): CellKey {
    return cellKey(Math.round(x / this.#cellSize), Math.round(z / this.#cellSize));
  }

  centreOf(key: CellKey): { x: number; z: number } {
    const node = this.#nodes.get(key);
    return { x: node?.x ?? 0, z: node?.z ?? 0 };
  }

  /**
   * A* from room to room. Returns the rooms to walk, `from` excluded, or null
   * when there is no route the enemy can take (every option locked).
   */
  path(from: CellKey, to: CellKey, doors: ReadonlyMap<string, Door>, costs: PathCosts): CellKey[] | null {
    if (from === to) return [];

    const open: CellKey[] = [from];
    const cameFrom = new Map<CellKey, CellKey>();
    const gScore = new Map<CellKey, number>([[from, 0]]);
    const goal = this.#nodes.get(to);
    if (!goal || !this.#nodes.has(from)) return null;

    const heuristic = (key: CellKey): number => {
      const node = this.#nodes.get(key);
      if (!node) return 0;
      return Math.abs(node.cell[0] - goal.cell[0]) + Math.abs(node.cell[1] - goal.cell[1]);
    };

    while (open.length) {
      // The graph is 36 rooms; a linear scan beats maintaining a heap.
      let bestIndex = 0;
      let bestScore = Infinity;
      for (let i = 0; i < open.length; i++) {
        const key = open[i] as CellKey;
        const score = (gScore.get(key) ?? Infinity) + heuristic(key);
        if (score < bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }

      const current = open.splice(bestIndex, 1)[0] as CellKey;
      if (current === to) {
        const route: CellKey[] = [current];
        for (let step = cameFrom.get(current); step !== undefined; step = cameFrom.get(step)) route.unshift(step);
        route.shift(); // drop `from`
        return route;
      }

      const node = this.#nodes.get(current);
      if (!node) continue;

      for (const link of node.links) {
        const cost = this.#edgeCost(link.doorId, doors, costs);
        if (cost === Infinity) continue;

        const tentative = (gScore.get(current) ?? Infinity) + cost;
        if (tentative >= (gScore.get(link.key) ?? Infinity)) continue;

        cameFrom.set(link.key, current);
        gScore.set(link.key, tentative);
        if (!open.includes(link.key)) open.push(link.key);
      }
    }
    return null;
  }

  #edgeCost(doorId: string, doors: ReadonlyMap<string, Door>, costs: PathCosts): number {
    const door = doors.get(doorId);
    if (!door) return 1;
    if (door.locked && !costs.canOpenLockedDoors) return Infinity;
    // A barricade is not a wall, it is a bill - so it makes the route expensive
    // rather than impossible, and the enemy will happily go round if it can.
    return door.open ? 1 : 1 + costs.doorSeconds + door.barricadeSeconds;
  }

  /** Rooms within `depth` links of a start room, ignoring door state. */
  roomsWithin(from: CellKey, depth: number): CellKey[] {
    const seen = new Set<CellKey>([from]);
    let frontier: CellKey[] = [from];

    for (let step = 0; step < depth; step++) {
      const next: CellKey[] = [];
      for (const key of frontier) {
        for (const link of this.#nodes.get(key)?.links ?? []) {
          if (seen.has(link.key)) continue;
          seen.add(link.key);
          next.push(link.key);
        }
      }
      frontier = next;
    }
    seen.delete(from);
    return [...seen];
  }

  /** Rooms between two positions, for the "voice only carries a room" rule. */
  roomDistance(a: CellKey, b: CellKey): number {
    if (a === b) return 0;
    const distance = new Map<CellKey, number>([[a, 0]]);
    const queue: CellKey[] = [a];

    for (let head = 0; head < queue.length; head++) {
      const key = queue[head] as CellKey;
      const d = distance.get(key) ?? 0;
      for (const link of this.#nodes.get(key)?.links ?? []) {
        if (distance.has(link.key)) continue;
        distance.set(link.key, d + 1);
        if (link.key === b) return d + 1;
        queue.push(link.key);
      }
    }
    return Infinity;
  }
}
