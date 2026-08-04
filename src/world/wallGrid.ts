/**
 * What stands between two cells: nothing, a door, or wall.
 *
 * Thrown items need an answer collision cannot give them. `CollisionWorld` is
 * one flat set of 2D shapes - a wall, a bookcase and a chest are the same thing
 * to it - and a flask that dies on a table leg it visibly sailed over reads as a
 * bug every single time. The maze itself already knows which cell edges are
 * walls, which are doorways and which are open floor inside one big room, so
 * that is what a throw is tested against instead. See docs/systems/GENERATION.md.
 *
 * Pure data built from the RunLayout, so every peer builds the same one.
 */
import type { Side } from '@art/lib/contract';
import { doorIdBetween, type RunLayout } from './generation';

export type Edge = { kind: 'open' } | { kind: 'door'; doorId: string } | { kind: 'solid' };

const OPEN: Edge = { kind: 'open' };
const SOLID: Edge = { kind: 'solid' };

const key = (x: number, z: number, side: Side): string => `${x},${z}:${side}`;

export class WallGrid {
  readonly #edges = new Map<string, Edge>();
  readonly #cellSize: number;

  constructor(layout: RunLayout) {
    this.#cellSize = layout.grid.cellSize;

    for (const placed of layout.cells) {
      const [x, z] = placed.cell;
      // Two halves of one room: open floor, nothing to stop anything.
      for (const side of placed.interior) this.#edges.set(key(x, z, side), OPEN);
      for (const side of placed.doors) {
        this.#edges.set(key(x, z, side), { kind: 'door', doorId: doorIdBetween(x, z, side) });
      }
    }

    // The exit is the one door that leads out of the grid, so no cell lists it.
    // Its side falls out of where its centre sits relative to its cell.
    for (const door of layout.doors) {
      if (!door.isExit) continue;
      const [ex, ez] = layout.exitCell;
      const dx = door.position[0] / this.#cellSize - ex;
      const dz = door.position[1] / this.#cellSize - ez;
      const side: Side = dx > 0.25 ? 'east' : dx < -0.25 ? 'west' : dz > 0.25 ? 'south' : 'north';
      this.#edges.set(key(ex, ez, side), { kind: 'door', doorId: door.id });
    }
  }

  /** Cell index a world coordinate falls in. Cells are centred on their index. */
  cellIndex(value: number): number {
    return Math.round(value / this.#cellSize);
  }

  /** World coordinate of the wall plane between cell `index` and `index + 1`. */
  boundary(index: number): number {
    return (index + 0.5) * this.#cellSize;
  }

  /** Anything not explicitly opened is wall - including the edge of the map. */
  edge(x: number, z: number, side: Side): Edge {
    return this.#edges.get(key(x, z, side)) ?? SOLID;
  }
}
