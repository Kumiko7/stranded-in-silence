/**
 * The manor shell: floor, ceiling, walls, trim and windows for a footprint.
 *
 * Every room calls this first and then decorates, which is what guarantees door
 * openings line up between neighbours no matter who authored the rooms on either
 * side. The style options are the pack's main lever for variety: the same shell
 * builds a gilded ballroom and a soot-black boiler room.
 *
 * Two things worth knowing before you use it:
 *
 * - It writes into a `MeshBatcher` rather than building meshes. A mansion room is
 *   several hundred boxes of trim and panelling; batched, that is about six draw
 *   calls. See `art/lib/merge.ts`.
 * - **Windows may only go on a side the blueprint never opens as a door.** The
 *   generator decides doors at run time, so the only walls guaranteed solid are
 *   the ones missing from `doorWalls`. Passing `doorWalls` in lets the shell
 *   throw immediately rather than shipping a room with a window in a doorway.
 */
import * as THREE from 'three';
import type { BuiltPiece, Cell, Collider, PackKit, RoomBuildContext, Side } from '../../../lib/contract';
import { SIDES, doorKey } from '../../../lib/contract';
import { boxCollider, boxGeometry } from '../../../lib/build';
import { MeshBatcher, poseMatrix, tiltMatrix } from '../../../lib/merge';
import * as tex from '../textures';

export type FloorStyle = 'parquet' | 'boards' | 'marble' | 'carpet' | 'tile' | 'brick' | 'stone';
export type WallStyle = 'damaskGreen' | 'damaskRed' | 'damaskBlue' | 'plaster' | 'panel' | 'tile' | 'brick' | 'stone';
export type CeilingStyle = 'plaster' | 'beams' | 'coffered' | 'ribs' | 'boards';
export type WainscotStyle = 'none' | 'panel' | 'tile' | 'stone';

export type WindowKind = 'glazed' | 'broken' | 'boarded' | 'stained';

export interface WindowSpec {
  readonly cell?: Cell;
  readonly side: Side;
  readonly kind?: WindowKind;
  /** Adds a cold practical just outside. Counts against the room's light budget. */
  readonly light?: boolean;
  /** Tall window: sill on the floor, head near the ceiling. Ballroom, conservatory. */
  readonly tall?: boolean;
}

export interface ShellOptions {
  readonly floor?: FloorStyle;
  readonly wall?: WallStyle;
  readonly ceiling?: CeilingStyle;
  readonly wainscot?: WainscotStyle;
  readonly skirting?: boolean;
  readonly pictureRail?: boolean;
  readonly cornice?: boolean;
  readonly windows?: readonly WindowSpec[];
  /** Sides the blueprint may open. Required if `windows` is set. */
  readonly doorWalls?: readonly { readonly cell: Cell; readonly side: Side }[];
}

const FLOOR_MATERIAL: Record<FloorStyle, [string, number]> = {
  parquet: ['surface.parquet', tex.PARQUET_TILE],
  boards: ['surface.boards', tex.BOARDS_TILE],
  marble: ['surface.marble', tex.MARBLE_TILE],
  carpet: ['surface.carpet', tex.CARPET_TILE],
  tile: ['surface.tile', tex.TILE_TILE],
  brick: ['surface.brick', tex.BRICK_TILE],
  stone: ['surface.stone', tex.STONE_TILE],
};

const WALL_MATERIAL: Record<WallStyle, [string, number]> = {
  damaskGreen: ['surface.damaskGreen', tex.DAMASK_TILE],
  damaskRed: ['surface.damaskRed', tex.DAMASK_TILE],
  damaskBlue: ['surface.damaskBlue', tex.DAMASK_TILE],
  plaster: ['surface.plaster', tex.PLASTER_TILE],
  panel: ['surface.panel', tex.PANEL_TILE],
  tile: ['surface.tile', tex.TILE_TILE],
  brick: ['surface.brick', tex.BRICK_TILE],
  stone: ['surface.stone', tex.STONE_TILE],
};

const WAINSCOT_MATERIAL: Record<Exclude<WainscotStyle, 'none'>, [string, number]> = {
  panel: ['surface.panel', tex.PANEL_TILE],
  tile: ['surface.tile', tex.TILE_TILE],
  stone: ['surface.stone', tex.STONE_TILE],
};

const NEIGHBOUR: Record<Side, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

/** Unit vector pointing from a wall into the room. Trim is inset along it. */
const INWARD: Record<Side, readonly [number, number]> = {
  north: [0, 1],
  east: [-1, 0],
  south: [0, -1],
  west: [1, 0],
};

const WAINSCOT_HEIGHT = 1.04;
const SKIRTING_HEIGHT = 0.19;
const PICTURE_RAIL_Y = 2.25;

/** A horizontal slice of one wall run: `offset` along it, spanning `y0..y1`. */
interface Slab {
  offset: number;
  width: number;
  y0: number;
  y1: number;
  /** Floor-level slabs block movement; a lintel is walked under. */
  blocking: boolean;
}

/** Splits a wall run into the solid pieces left around a door and/or a window. */
function slabsFor(length: number, height: number, opening: null | { width: number; y0: number; y1: number }): Slab[] {
  if (!opening) return [{ offset: 0, width: length, y0: 0, y1: height, blocking: true }];

  const side = (length - opening.width) / 2;
  const slabs: Slab[] = [
    { offset: -(length + opening.width) / 4, width: side, y0: 0, y1: height, blocking: true },
    { offset: (length + opening.width) / 4, width: side, y0: 0, y1: height, blocking: true },
  ];
  if (opening.y0 > 0.001) {
    slabs.push({ offset: 0, width: opening.width, y0: 0, y1: opening.y0, blocking: true });
  }
  if (opening.y1 < height - 0.001) {
    slabs.push({ offset: 0, width: opening.width, y0: opening.y1, y1: height, blocking: false });
  }
  return slabs;
}

export interface ShellResult extends BuiltPiece {
  /** Room-local centres of every window opening, for rooms that want to dress them. */
  windowAnchors: { position: readonly [number, number, number]; side: Side }[];
}

/**
 * Builds the shell into `batch`. Returns colliders and any window lights; the
 * caller owns the batcher and therefore the draw calls.
 */
export function addShell(
  batch: MeshBatcher,
  ctx: RoomBuildContext,
  footprint: readonly Cell[],
  options: ShellOptions = {},
): { colliders: Collider[]; lights: THREE.Light[]; extra: THREE.Object3D; windowAnchors: ShellResult['windowAnchors'] } {
  const { cellSize, ceilingHeight, wallThickness, doorWidth, doorHeight } = ctx.dims;
  const colliders: Collider[] = [];
  const lights: THREE.Light[] = [];
  const extra = new THREE.Group();
  const windowAnchors: ShellResult['windowAnchors'] = [];

  const [floorName, floorTile] = FLOOR_MATERIAL[options.floor ?? 'parquet'];
  const [wallName, wallTile] = WALL_MATERIAL[options.wall ?? 'damaskGreen'];
  const wainscotStyle = options.wainscot ?? 'none';
  const [wainscotName, wainscotTile] =
    wainscotStyle === 'none' ? WALL_MATERIAL[options.wall ?? 'damaskGreen'] : WAINSCOT_MATERIAL[wainscotStyle];

  const floorMat = ctx.materials.get(floorName);
  const wallMat = ctx.materials.get(wallName);
  const wainscotMat = ctx.materials.get(wainscotName);
  const ceilMat = ctx.materials.get('surface.ceiling');
  const trimMat = ctx.materials.get('woodDark');
  const beamMat = ctx.materials.get('beam');
  const stoneMat = ctx.materials.get('surface.stone');

  const occupied = new Set(footprint.map(([x, y]) => `${x},${y}`));
  const off = cellSize / 2 - wallThickness / 2;

  const windows = options.windows ?? [];
  if (windows.length && options.doorWalls) {
    for (const spec of windows) {
      const cell = spec.cell ?? ([0, 0] as const);
      const clash = options.doorWalls.some(
        (wall) => wall.side === spec.side && wall.cell[0] === cell[0] && wall.cell[1] === cell[1],
      );
      if (clash) {
        throw new Error(`mansion shell: window on ${cell}:${spec.side} collides with a declared doorWall`);
      }
    }
  }
  const windowFor = (cell: Cell, side: Side): WindowSpec | undefined =>
    windows.find((spec) => {
      const c = spec.cell ?? ([0, 0] as const);
      return spec.side === side && c[0] === cell[0] && c[1] === cell[1];
    });

  /** Emits a wall slab, split at the wainscot line so the lower band can differ. */
  function wallSlab(side: Side, cx: number, cz: number, slab: Slab): void {
    const runsAlongX = side === 'north' || side === 'south';
    const wallPos = side === 'north' ? cz - off : side === 'south' ? cz + off : side === 'west' ? cx - off : cx + off;

    const bands: [number, number, THREE.Material, number][] = [];
    const split = wainscotStyle === 'none' ? slab.y0 : Math.min(Math.max(WAINSCOT_HEIGHT, slab.y0), slab.y1);
    if (split > slab.y0 + 0.001) bands.push([slab.y0, split, wainscotMat, wainscotTile]);
    if (slab.y1 > split + 0.001) bands.push([split, slab.y1, wallMat, wallTile]);

    for (const [y0, y1, material, tile] of bands) {
      const h = y1 - y0;
      const size: [number, number, number] = runsAlongX ? [slab.width, h, wallThickness] : [wallThickness, h, slab.width];
      const position: [number, number, number] = runsAlongX
        ? [cx + slab.offset, y0 + h / 2, wallPos]
        : [wallPos, y0 + h / 2, cz + slab.offset];
      batch.add(material, boxGeometry(size[0], size[1], size[2]), poseMatrix(position), { tile, castShadow: false });
    }

    if (slab.blocking) {
      const size: [number, number, number] = runsAlongX
        ? [slab.width, slab.y1 - slab.y0, wallThickness]
        : [wallThickness, slab.y1 - slab.y0, slab.width];
      const position: [number, number, number] = runsAlongX
        ? [cx + slab.offset, 0, wallPos]
        : [wallPos, 0, cz + slab.offset];
      colliders.push(boxCollider(size, position));
    }
  }

  /** Skirting, wainscot cap and picture rail, following the same gaps as the wall. */
  function wallTrim(side: Side, cx: number, cz: number, slabs: readonly Slab[], hasWindow: boolean): void {
    const runsAlongX = side === 'north' || side === 'south';
    const wallPos = side === 'north' ? cz - off : side === 'south' ? cz + off : side === 'west' ? cx - off : cx + off;
    const inward = INWARD[side];
    const sign = runsAlongX ? inward[1] : inward[0];

    const strip = (offset: number, width: number, y: number, height: number, depth: number, material: THREE.Material): void => {
      const near = wallPos + sign * (wallThickness / 2 + depth / 2);
      const size: [number, number, number] = runsAlongX ? [width, height, depth] : [depth, height, width];
      const position: [number, number, number] = runsAlongX ? [cx + offset, y + height / 2, near] : [near, y + height / 2, cz + offset];
      batch.add(material, boxGeometry(size[0], size[1], size[2]), poseMatrix(position), { tile: 1.2, castShadow: false });
    };

    for (const slab of slabs) {
      if (!slab.blocking) continue;

      if (options.skirting !== false && slab.y0 < 0.01) {
        strip(slab.offset, slab.width, 0, SKIRTING_HEIGHT, 0.055, trimMat);
      }
      if (wainscotStyle !== 'none' && slab.y1 > WAINSCOT_HEIGHT) {
        strip(slab.offset, slab.width, WAINSCOT_HEIGHT, 0.055, 0.09, trimMat);
        // Stiles: the vertical ribs that make panelling read as panelling.
        const count = Math.max(1, Math.round(slab.width / 0.82));
        for (let i = 0; i <= count; i++) {
          const x = slab.offset - slab.width / 2 + (slab.width * i) / count;
          strip(x, 0.075, SKIRTING_HEIGHT, WAINSCOT_HEIGHT - SKIRTING_HEIGHT, 0.03, trimMat);
        }
      }
      // A picture rail crosses a window head, so a wall with one goes without.
      if (options.pictureRail && !hasWindow && slab.y1 > PICTURE_RAIL_Y + 0.1) {
        strip(slab.offset, slab.width, PICTURE_RAIL_Y, 0.05, 0.05, trimMat);
      }
    }

    // The cornice sits above every opening the shell can cut, so it runs the
    // whole length rather than breaking over each doorway.
    if (options.cornice !== false) strip(0, cellSize, ceilingHeight - 0.16, 0.16, 0.11, ceilMat);
  }

  /** Frame, mullions, glass and whatever is left of the panes. */
  function buildWindow(spec: WindowSpec, side: Side, cx: number, cz: number, opening: { width: number; y0: number; y1: number }): void {
    const runsAlongX = side === 'north' || side === 'south';
    const wallPos = side === 'north' ? cz - off : side === 'south' ? cz + off : side === 'west' ? cx - off : cx + off;
    const inward = INWARD[side];
    const centre: [number, number, number] = runsAlongX
      ? [cx, (opening.y0 + opening.y1) / 2, wallPos]
      : [wallPos, (opening.y0 + opening.y1) / 2, cz];
    const h = opening.y1 - opening.y0;
    const kind = spec.kind ?? 'glazed';

    const at = (along: number, y: number, depth: number): [number, number, number] =>
      runsAlongX
        ? [cx + along, y, wallPos + inward[1] * depth]
        : [wallPos + inward[0] * depth, y, cz + along];

    const put = (material: THREE.Material, w: number, hh: number, d: number, along: number, y: number, depth: number, tile = 0.7): void => {
      const size: [number, number, number] = runsAlongX ? [w, hh, d] : [d, hh, w];
      batch.add(material, boxGeometry(size[0], size[1], size[2]), poseMatrix(at(along, y, depth)), { tile, castShadow: false });
    };

    // Sill, jambs and head.
    put(trimMat, opening.width + 0.36, 0.09, wallThickness + 0.18, 0, opening.y0 - 0.045, 0);
    put(trimMat, opening.width + 0.24, 0.08, wallThickness + 0.1, 0, opening.y1 + 0.04, 0);
    put(trimMat, 0.1, h, wallThickness + 0.1, -(opening.width + 0.1) / 2, opening.y0 + h / 2, 0);
    put(trimMat, 0.1, h, wallThickness + 0.1, (opening.width + 0.1) / 2, opening.y0 + h / 2, 0);

    const pane = (material: THREE.Material, w: number, hh: number, along: number, y: number, depth: number): void => {
      batch.add(material, new THREE.PlaneGeometry(w, hh), poseMatrix(at(along, y, depth), runsAlongX ? 0 : Math.PI / 2), {
        castShadow: false,
        receiveShadow: false,
        consume: true,
      });
    };

    if (kind === 'boarded') {
      for (let i = 0; i < 5; i++) {
        const y = opening.y0 + 0.18 + (h - 0.36) * (i / 4);
        put(ctx.materials.get('woodPale'), opening.width + 0.2, 0.16, 0.05, (ctx.rng() - 0.5) * 0.12, y, 0.08, 1.1);
      }
      // Night leaks between the boards, which is the only reason to board a window.
      pane(ctx.materials.get('moonShaft'), opening.width, h, 0, opening.y0 + h / 2, -0.02);
    } else {
      const glassMat = ctx.materials.get(kind === 'stained' ? 'stained' : 'glass');
      const cols = 2;
      const rows = spec.tall ? 4 : 3;
      const paneW = (opening.width - 0.14) / cols;
      const paneH = (h - 0.14) / rows;

      // Night behind the glass, so a window never reads as a hole in the wall.
      pane(ctx.materials.get('moonShaft'), opening.width, h, 0, opening.y0 + h / 2, -0.04);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // A broken window keeps roughly half its panes, and which half varies.
          if (kind === 'broken' && ctx.rng() < 0.45) continue;
          const along = -opening.width / 2 + 0.07 + paneW * (c + 0.5);
          const y = opening.y0 + 0.07 + paneH * (r + 0.5);
          pane(glassMat, paneW - 0.05, paneH - 0.05, along, y, 0.01);
        }
      }

      // Mullions and transoms.
      for (let c = 1; c < cols; c++) {
        put(trimMat, 0.05, h - 0.1, 0.07, -opening.width / 2 + 0.07 + paneW * c, opening.y0 + h / 2, 0.02, 0.5);
      }
      for (let r = 1; r < rows; r++) {
        put(trimMat, opening.width - 0.1, 0.05, 0.07, 0, opening.y0 + 0.07 + paneH * r, 0.02, 0.5);
      }
    }

    if (spec.light) {
      const cold = kind === 'stained' ? 0xbfa06a : 0xa8c4e8;
      const lamp = new THREE.PointLight(cold, kind === 'boarded' ? 5 : 13, cellSize * 1.6, 2);
      lamp.position.set(...at(0, opening.y0 + h * 0.62, 0.45));
      extra.add(lamp);
      lights.push(lamp);
    }

    windowAnchors.push({ position: centre, side });
  }

  /* --- per cell -------------------------------------------------------------- */
  for (const [gx, gy] of footprint) {
    const cx = gx * cellSize;
    const cz = gy * cellSize;

    batch.add(floorMat, boxGeometry(cellSize, 0.12, cellSize), poseMatrix([cx, -0.06, cz]), {
      tile: floorTile,
      castShadow: false,
    });
    batch.add(ceilMat, boxGeometry(cellSize, 0.12, cellSize), poseMatrix([cx, ceilingHeight + 0.06, cz]), {
      tile: tex.CEILING_TILE,
      castShadow: false,
    });

    switch (options.ceiling ?? 'plaster') {
      case 'beams':
        for (let i = 0; i < 4; i++) {
          const z = cz - cellSize / 2 + cellSize * ((i + 0.5) / 4);
          batch.add(beamMat, boxGeometry(cellSize, 0.26, 0.24), poseMatrix([cx, ceilingHeight - 0.13, z]), { tile: 1.4 });
        }
        break;
      case 'boards':
        for (let i = 0; i < 8; i++) {
          const z = cz - cellSize / 2 + cellSize * ((i + 0.5) / 8);
          batch.add(beamMat, boxGeometry(cellSize, 0.07, cellSize / 8 - 0.03), poseMatrix([cx, ceilingHeight - 0.035, z]), { tile: 1.4 });
        }
        break;
      case 'coffered':
        for (let i = 0; i <= 3; i++) {
          const t = -cellSize / 2 + (cellSize * i) / 3;
          batch.add(ctx.materials.get('woodDark'), boxGeometry(cellSize, 0.2, 0.16), poseMatrix([cx, ceilingHeight - 0.1, cz + t]), { tile: 1 });
          batch.add(ctx.materials.get('woodDark'), boxGeometry(0.16, 0.2, cellSize), poseMatrix([cx + t, ceilingHeight - 0.1, cz]), { tile: 1 });
        }
        break;
      case 'ribs':
        // Three transverse arches. Each is built from short segments turned to
        // follow the curve and overlapped at the joints: sample it too coarsely
        // and the rib stops reading as vaulting and starts reading as a row of
        // blocks floating under the ceiling.
        for (let i = 0; i < 3; i++) {
          const z = cz - cellSize / 2 + cellSize * ((i + 0.5) / 3);
          const span = cellSize / 2 - 0.15;
          const rise = 0.55;
          const spring = ceilingHeight - 0.14 - rise;
          const segments = 11;

          for (let s = 0; s < segments; s++) {
            const a0 = (Math.PI * s) / segments;
            const a1 = (Math.PI * (s + 1)) / segments;
            const x0 = Math.cos(a0) * span;
            const x1 = Math.cos(a1) * span;
            const y0 = spring + Math.sin(a0) * rise;
            const y1 = spring + Math.sin(a1) * rise;

            batch.add(
              stoneMat,
              boxGeometry(Math.hypot(x1 - x0, y1 - y0) + 0.07, 0.2, 0.3),
              tiltMatrix([cx + (x0 + x1) / 2, (y0 + y1) / 2, z], [0, 0, Math.atan2(y1 - y0, x1 - x0)]),
              { tile: 1.4 },
            );
          }
        }
        break;
      default:
        break;
    }

    for (const side of SIDES) {
      const step = NEIGHBOUR[side];
      if (occupied.has(`${gx + step[0]},${gy + step[1]}`)) continue; // interior edge: open

      const hasDoor = (ctx.doors[doorKey([gx, gy], side)] ?? 'none') !== 'none';
      const window = hasDoor ? undefined : windowFor([gx, gy], side);

      let opening: { width: number; y0: number; y1: number } | null = null;
      if (hasDoor) opening = { width: doorWidth, y0: 0, y1: doorHeight };
      else if (window) {
        opening = window.tall
          ? { width: 1.9, y0: 0.22, y1: ceilingHeight - 0.55 }
          : { width: 1.55, y0: 0.92, y1: 2.45 };
      }

      const slabs = slabsFor(cellSize, ceilingHeight, opening);
      for (const slab of slabs) wallSlab(side, cx, cz, slab);
      wallTrim(side, cx, cz, slabs, window !== undefined);

      if (window && opening) buildWindow(window, side, cx, cz, opening);
    }
  }

  return { colliders, lights, extra, windowAnchors };
}

/**
 * The contract-facing kit. Mansion rooms call `addShell()` directly so they can
 * pass style options and share one batcher with their furniture; this exists so
 * anything holding only a `PackKit` still gets a correct, plain shell.
 *
 * `BuiltPiece` has no `dispose`, so the geometry this path merges is never freed.
 * That is fine because nothing in a run uses it - every room goes through
 * `addShell()` and returns the batcher's `dispose` as `BuiltRoom.dispose`.
 */
export function createKit(): PackKit {
  return {
    shell(ctx: RoomBuildContext, footprint: readonly Cell[]): BuiltPiece {
      const batch = new MeshBatcher();
      const { colliders, lights, extra } = addShell(batch, ctx, footprint);
      const built = batch.build();
      built.object.add(extra);
      return { object: built.object, colliders, lights };
    },
  };
}
