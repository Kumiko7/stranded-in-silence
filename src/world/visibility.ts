/**
 * Portal culling: which rooms the eye can actually reach.
 *
 * A map is a graph of boxes joined by openings, so "can this room be seen from
 * here" has an exact answer rather than a distance guess. Flood the cell graph
 * out from the cell the camera is standing in, and step through an opening only
 * if
 *
 *   1. the door in it is not shut, and
 *   2. the opening, projected to the screen, still overlaps the rectangle
 *      inherited from every opening already stepped through.
 *
 * **A wall is a wall.** Only a doorway is a portal, and a wall the generator
 * left shut is the end of the flood.
 *
 * It was not always. Every pack's shell cuts windows - a manor casement, a
 * viewpane onto the deep, a light shaft over a tomb - and logic cannot see art,
 * so every wall a blueprint had not reserved for a door was ASSUMED to maybe
 * have a hole in it and treated as permanently open. That is a portal on nearly
 * every wall of nearly every room, and it was expensive: on Kerberos Deep it
 * was **38 % of the draw calls in an average frame**, on a game whose frames are
 * spent submitting draw calls.
 *
 * What it bought was nothing, and that is measurable rather than argued.
 * `tools/perf.html?verify=1` renders every pose culled and again with the whole
 * map visible and counts the pixels that differ; dropping the assumption costs
 * **0.000 %** on the manor, **0.013 %** on the Leviathan and 0.54 % on Kerberos
 * Deep. The reason is that art never showed the next room through a window in
 * the first place - a manor casement has a night pane behind the glass, an
 * abyss viewpane has the ocean painted behind it. The far room was being drawn
 * so that it could be completely hidden by the near room's own backdrop.
 *
 * Point 2 is what makes this worth having. Distance alone stops helping the
 * moment a team has opened most of the doors - which is exactly when a run is
 * at its busiest - because everything is then within `renderDistanceRooms` of
 * everything. A doorway you are not looking at hides its room whether it is
 * open or not.
 *
 * **This is deliberately conservative.** It runs INSIDE the distance test
 * rather than replacing it, so it can only hide something the old test was
 * already about to hide, and every case it cannot answer exactly - a doorway
 * straddling the camera plane, a camera outside the grid - answers "visible".
 * Rooms are never *partly* drawn: reaching any cell of a room draws all of it.
 *
 * Lighting is untouched. A lamp in a room nobody can see still lights the rooms
 * it reaches, exactly as before; this decides what is drawn, not what is lit.
 */
import type * as THREE from 'three';
import type { Side } from '@art/lib/contract';
import type { GraphicsConfig } from '@/config/types';
import { doorIdBetween, sideStep, type RunLayout } from './generation';

/** `"x,y"` - a grid cell, and the unit everything here is keyed by. */
export type CellKey = string;

export const cellKey = (x: number, y: number): CellKey => `${x},${y}`;

/** The cell a world position stands in. Cell centres sit on multiples of `cellSize`. */
export function cellKeyAt(x: number, z: number, cellSize: number): CellKey {
  return cellKey(Math.round(x / cellSize), Math.round(z / cellSize));
}

/**
 * Every cell a world-space box reaches into, which is what an object is culled
 * with.
 *
 * Not the same question as which cells a room *occupies*. Art is allowed to
 * lean out of its own room - a moonbeam from a window falls through the wall
 * behind it, a cornice overhangs - and anything that does has to stay drawn
 * while the room it leans into can be seen. `inset` is what stops that being
 * every room: walls sit exactly on the cell boundary, so the box always touches
 * the neighbour by a hair. One wall thickness of slack is the right amount.
 */
export function cellsCovered(box: THREE.Box3, cellSize: number, inset: number): CellKey[] {
  const first = (v: number) => Math.round((v + inset) / cellSize);
  const last = (v: number) => Math.round((v - inset) / cellSize);
  const cells: CellKey[] = [];
  for (let x = Math.min(first(box.min.x), last(box.max.x)); x <= Math.max(first(box.min.x), last(box.max.x)); x++) {
    for (let z = Math.min(first(box.min.z), last(box.max.z)); z <= Math.max(first(box.min.z), last(box.max.z)); z++) {
      cells.push(cellKey(x, z));
    }
  }
  return cells;
}

/** One doorway, as the four world-space corners of the hole in the wall. */
type Portal = readonly (readonly [number, number, number])[];

interface Link {
  to: CellKey;
  /**
   * The door that can shut this opening. `''` for the one that never shuts: two
   * cells of one room, which have no `portal` either - it is open floor.
   */
  doorId: string;
  portal: Portal | null;
}

/** What the layout can tell the culler about a map's openings. */
export interface VisibilityInput {
  readonly cellSize: number;
  readonly doorWidth: number;
  readonly doorHeight: number;
}

interface Node {
  key: CellKey;
  x: number;
  z: number;
  links: Link[];
}

/** Screen-space rectangle in normalised device coordinates: `[x0, y0, x1, y1]`. */
type Rect = readonly [number, number, number, number];

const FULL_SCREEN: Rect = [-1, -1, 1, 1];

export class PortalVisibility {
  readonly #nodes = new Map<CellKey, Node>();
  /** Both cells a door sits between, so its own art is drawn from either side. */
  readonly #doorCells = new Map<string, readonly CellKey[]>();
  readonly #cellSize: number;
  readonly #config: GraphicsConfig['culling'];

  readonly #visible = new Set<CellKey>();
  /** Widest rectangle a cell has already been reached through, this frame. */
  readonly #reached = new Map<CellKey, Rect>();
  /** True until the first `update()`, so nothing is hidden before one has run. */
  #everything = true;
  /** Reused across frames. Cloned from the camera the first time one is seen. */
  #viewProjection: THREE.Matrix4 | null = null;

  constructor(layout: RunLayout, input: VisibilityInput, config: GraphicsConfig['culling']) {
    const { doorWidth, doorHeight } = input;
    this.#cellSize = layout.grid.cellSize;
    this.#config = config;

    for (const placed of layout.cells) {
      const [x, y] = placed.cell;
      this.#nodes.set(cellKey(x, y), { key: cellKey(x, y), x: x * this.#cellSize, z: y * this.#cellSize, links: [] });
    }

    const portals = new Map<string, Portal>();
    for (const door of layout.doors) {
      portals.set(door.id, openingQuad(door.position, door.rotationY, doorWidth, doorHeight, config.portalMarginMetres));
      // Both cells the door sits between, worked out from where it stands
      // rather than from the graph: the exit door has a room on one side only,
      // and it still has to be drawn.
      const alongZ = Math.abs(door.rotationY) > 0.1;
      const [px, pz] = door.position;
      const half = this.#cellSize / 2;
      this.#doorCells.set(
        door.id,
        alongZ
          ? [cellKeyAt(px - half, pz, this.#cellSize), cellKeyAt(px + half, pz, this.#cellSize)]
          : [cellKeyAt(px, pz - half, this.#cellSize), cellKeyAt(px, pz + half, this.#cellSize)],
      );
    }

    for (const placed of layout.cells) {
      const [x, y] = placed.cell;
      const node = this.#nodes.get(cellKey(x, y));
      if (!node) continue;

      const link = (side: Side, doorId: string, portal: Portal | null): void => {
        const [dx, dy] = sideStep(side);
        const to = cellKey(x + dx, y + dy);
        // The exit door leads out of the grid; there is no room on the far side.
        if (!this.#nodes.has(to)) return;
        node.links.push({ to, doorId, portal });
      };

      for (const side of placed.doors) {
        const id = doorIdBetween(x, y, side);
        link(side, id, portals.get(id) ?? null);
      }
      // Two halves of one room: no wall, no door, nothing to clip against.
      for (const side of placed.interior) link(side, '', null);

      // And nothing else. Every remaining side is a wall, and a wall stops the
      // flood - see the note at the top of this file for what asking otherwise
      // used to cost and what it bought.
    }
  }

  /** The cells a door's own art belongs to, so it is drawn from either side of it. */
  cellsOfDoor(doorId: string): readonly CellKey[] {
    return this.#doorCells.get(doorId) ?? [];
  }

  /**
   * Recomputes the visible set for one camera pose.
   *
   * `isOpen` is asked about a door's *live* state, and a door that has begun to
   * swing counts as open: the room behind it has to be there before the gap is
   * wide enough to see through, not on the frame it becomes so.
   */
  update(
    camera: THREE.Camera,
    x: number,
    z: number,
    radius: number,
    isOpen: (doorId: string) => boolean,
  ): void {
    this.#visible.clear();
    this.#reached.clear();

    const start = this.#nodes.get(cellKeyAt(x, z, this.#cellSize));
    this.#everything = false;
    // Switched off, or standing outside the grid - through the exit door, or
    // mid-teardown. There is nothing to flood from, so this is the distance
    // test on its own, which is what the culling replaced.
    if (!this.#config.enabled || !start) {
      for (const node of this.#nodes.values()) {
        if ((node.x - x) ** 2 + (node.z - z) ** 2 <= radius * radius) this.#visible.add(node.key);
      }
      return;
    }

    // The view matrix is derived here rather than read off the camera, because
    // `matrixWorldInverse` is only refreshed inside `renderer.render()` - and
    // this runs before it. Reading it would project every doorway through the
    // previous frame's view and cull the rooms either side of the one you are
    // actually looking at.
    camera.updateMatrixWorld();
    this.#viewProjection ??= camera.projectionMatrix.clone();
    const viewProjection = this.#viewProjection.copy(camera.matrixWorld).invert().premultiply(camera.projectionMatrix);
    const limit = radius * radius;
    const margin = this.#config.screenMargin;

    const stack: { node: Node; rect: Rect }[] = [{ node: start, rect: FULL_SCREEN }];
    this.#reached.set(start.key, FULL_SCREEN);

    while (stack.length) {
      const { node, rect } = stack.pop()!;
      this.#visible.add(node.key);

      for (const link of node.links) {
        const next = this.#nodes.get(link.to);
        if (!next) continue;
        if ((next.x - x) ** 2 + (next.z - z) ** 2 > limit) continue;
        if (link.doorId && !isOpen(link.doorId)) continue;

        const through = link.portal ? clip(rect, project(link.portal, viewProjection, margin)) : rect;
        if (!through) continue;

        // A cell already reached through a wider rectangle has nothing to gain
        // from this one - that is what stops a loop of open doors spinning.
        const before = this.#reached.get(link.to);
        if (before && contains(before, through)) continue;
        this.#reached.set(link.to, before ? union(before, through) : through);
        stack.push({ node: next, rect: through });
      }
    }
  }

  has(key: CellKey): boolean {
    return this.#everything || this.#visible.has(key);
  }

  /** An object is drawn if any cell it stands in can be seen. */
  anyVisible(cells: readonly CellKey[]): boolean {
    if (this.#everything) return true;
    for (const key of cells) if (this.#visible.has(key)) return true;
    return false;
  }
}

/** The hole in the wall, widened by `margin` to cover the reveal around it. */
function openingQuad(
  position: readonly [number, number],
  rotationY: number,
  doorWidth: number,
  doorHeight: number,
  margin: number,
): Portal {
  // Matches `worldBuilder`: a rotated door sits in a wall running north-south,
  // so its opening spans Z rather than X.
  const alongZ = Math.abs(rotationY) > 0.1;
  const half = doorWidth / 2 + margin;
  const [px, pz] = position;
  const low = -margin;
  const high = doorHeight + margin;

  return alongZ
    ? [
        [px, low, pz - half],
        [px, low, pz + half],
        [px, high, pz - half],
        [px, high, pz + half],
      ]
    : [
        [px - half, low, pz],
        [px + half, low, pz],
        [px - half, high, pz],
        [px + half, high, pz],
      ];
}

/**
 * The screen rectangle an opening covers, or the whole screen when it straddles
 * the camera plane - which is to say when you are standing in it.
 */
function project(portal: Portal, viewProjection: THREE.Matrix4, margin: number): Rect {
  const m = viewProjection.elements;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y, z] of portal) {
    const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
    if (w <= 1e-4) return FULL_SCREEN;
    const sx = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w;
    const sy = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w;
    if (sx < minX) minX = sx;
    if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;
  }

  return [minX - margin, minY - margin, maxX + margin, maxY + margin];
}

function clip(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[2], b[2]);
  const y1 = Math.min(a[3], b[3]);
  return x0 < x1 && y0 < y1 ? [x0, y0, x1, y1] : null;
}

function union(a: Rect, b: Rect): Rect {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

function contains(outer: Rect, inner: Rect): boolean {
  return outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
}
