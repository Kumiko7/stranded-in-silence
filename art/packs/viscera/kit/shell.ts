/**
 * The Leviathan's shell: floor, ceiling, walls, trim, orifices and pores.
 *
 * Every room calls this first and then decorates, which is what guarantees door
 * openings line up between neighbours no matter who authored the rooms either
 * side. The style options are the pack's main lever for variety: the same
 * function builds a bile-flooded stomach and a dry chitin armoury.
 *
 * Three things worth knowing before you use it:
 *
 * - It writes into a `MeshBatcher` rather than building meshes. A viscera room
 *   is several hundred boxes of rib, fold and tooth; batched, that is a handful
 *   of draw calls. See `art/lib/merge.ts`.
 * - **Every opening gets a mouth.** A doorway cut in meat is a sphincter; one
 *   cut in bone is an arch of vertebrae. That ring is the single detail that
 *   makes the whole pack read as one creature, so it is in the shell rather
 *   than left to each room to remember.
 * - **A pore may only go on a side the blueprint never opens as a door.** The
 *   generator decides doors at run time, so the only walls guaranteed solid are
 *   the ones missing from `doorWalls`. Passing `doorWalls` in lets the shell
 *   throw immediately rather than shipping a room with a window in a doorway.
 */
import * as THREE from 'three';
import type { BuiltPiece, Cell, Collider, PackKit, RoomBuildContext, Side } from '../../../lib/contract';
import { SIDES, doorKey } from '../../../lib/contract';
import { boxCollider, boxGeometry } from '../../../lib/build';
import { ball, spike } from './props';
import { MeshBatcher, poseMatrix, subUV, tiltMatrix } from '../../../lib/merge';
import * as tex from '../textures';

export type FloorStyle = 'flesh' | 'gut' | 'mucosa' | 'bone' | 'suture' | 'chitin' | 'scute' | 'cartilage' | 'marrow';
export type WallStyle =
  | 'flesh'
  | 'muscle'
  | 'gut'
  | 'membrane'
  | 'cortex'
  | 'bone'
  | 'suture'
  | 'chitin'
  | 'cartilage'
  | 'scute'
  | 'comb'
  | 'marrow'
  | 'enamel';
export type CeilingStyle = 'flesh' | 'membrane' | 'ribs' | 'sinew' | 'palate' | 'vault' | 'chitin' | 'sacs' | 'spines';
/** The lower band of the wall, where a different tissue has taken over. */
export type BandStyle = 'none' | 'bone' | 'chitin' | 'scute' | 'gut' | 'cartilage' | 'comb';
/** What the ring around a doorway is made of. */
export type MouthStyle = 'sphincter' | 'vertebrae' | 'mandible' | 'none';
export type PoreKind = 'membrane' | 'ossified' | 'iris' | 'vent';

export interface PoreSpec {
  readonly cell?: Cell;
  readonly side: Side;
  readonly kind?: PoreKind;
  /** Adds a practical behind it. Counts against the room's light budget. */
  readonly light?: boolean;
  /** Floor to near-ceiling, for a room that wants one wall to be mostly aperture. */
  readonly tall?: boolean;
}

export interface ShellOptions {
  readonly floor?: FloorStyle;
  readonly wall?: WallStyle;
  readonly ceiling?: CeilingStyle;
  readonly band?: BandStyle;
  /** Height the band reaches. Default 1.05 m. */
  readonly bandHeight?: number;
  /** The calcified ridge where wall meets floor. On by default. */
  readonly sill?: boolean;
  /** A cartilage rail at head height, the way a body braces a cavity. */
  readonly ridge?: boolean;
  /** The fold where wall meets ceiling. On by default. */
  readonly seam?: boolean;
  readonly mouth?: MouthStyle;
  readonly pores?: readonly PoreSpec[];
  /** Sides the blueprint may open. Required if `pores` is set. */
  readonly doorWalls?: readonly { readonly cell: Cell; readonly side: Side }[];
}

const FLOOR_MATERIAL: Record<FloorStyle, [string, number]> = {
  flesh: ['surface.flesh', tex.FLESH_TILE],
  gut: ['surface.gut', tex.GUT_TILE],
  mucosa: ['surface.mucosa', tex.MUCOSA_TILE],
  bone: ['surface.bone', tex.BONE_TILE],
  suture: ['surface.suture', tex.SUTURE_TILE],
  chitin: ['surface.chitin', tex.CHITIN_TILE],
  scute: ['surface.scute', tex.SCUTE_TILE],
  cartilage: ['surface.cartilage', tex.CARTILAGE_TILE],
  marrow: ['surface.marrow', tex.MARROW_TILE],
};

const WALL_MATERIAL: Record<WallStyle, [string, number]> = {
  flesh: ['surface.flesh', tex.FLESH_TILE],
  muscle: ['surface.muscle', tex.MUSCLE_TILE],
  gut: ['surface.gut', tex.GUT_TILE],
  membrane: ['surface.membrane', tex.MEMBRANE_TILE],
  cortex: ['surface.cortex', tex.CORTEX_TILE],
  bone: ['surface.bone', tex.BONE_TILE],
  suture: ['surface.suture', tex.SUTURE_TILE],
  chitin: ['surface.chitin', tex.CHITIN_TILE],
  cartilage: ['surface.cartilage', tex.CARTILAGE_TILE],
  scute: ['surface.scute', tex.SCUTE_TILE],
  comb: ['surface.comb', tex.COMB_TILE],
  marrow: ['surface.marrow', tex.MARROW_TILE],
  enamel: ['surface.enamel', tex.ENAMEL_TILE],
};

const BAND_MATERIAL: Record<Exclude<BandStyle, 'none'>, [string, number]> = {
  bone: ['surface.bone', tex.BONE_TILE],
  chitin: ['surface.chitin', tex.CHITIN_TILE],
  scute: ['surface.scute', tex.SCUTE_TILE],
  gut: ['surface.gut', tex.GUT_TILE],
  cartilage: ['surface.cartilage', tex.CARTILAGE_TILE],
  comb: ['surface.comb', tex.COMB_TILE],
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

/**
 * Yaw that turns a piece authored in "wall-local" space - length along +X, depth
 * along +Z - onto this wall, and a plane's front face into the room.
 *
 * Everything hung on a wall is authored once, flat, in that local frame and then
 * turned by this. That is what stops the class of bug where a mouth built on the
 * north wall comes out inside-out on the east one: the sizes are never swapped
 * by hand, so there is nothing to swap wrongly.
 */
const FACE_IN: Record<Side, number> = {
  north: 0,
  east: -Math.PI / 2,
  south: Math.PI,
  west: Math.PI / 2,
};

const SILL_HEIGHT = 0.22;
const RIDGE_Y = 2.18;

/**
 * Which wall styles are living tissue. It decides the trim: a bone skirting
 * under a wall of muscle reads as a room with a skirting board in it, which is
 * the one thing this pack must never look like.
 */
const WET: ReadonlySet<WallStyle> = new Set<WallStyle>(['flesh', 'muscle', 'gut', 'membrane', 'cortex']);

/**
 * Anything up at the ceiling is ABOVE every light a room can hang, so all of it
 * casts a hard bar straight down across the floor it is decorating. Ceiling
 * treatment is therefore never a shadow caster - see docs/art/ROOM_REVIEW.md §4.
 */
const CEILING_OPTS = { castShadow: false } as const;

/** A horizontal slice of one wall run: `offset` along it, spanning `y0..y1`. */
interface Slab {
  offset: number;
  width: number;
  y0: number;
  y1: number;
  /** Floor-level slabs block movement; a lintel is walked under. */
  blocking: boolean;
}

/** Splits a wall run into the solid pieces left around an opening. */
function slabsFor(length: number, height: number, opening: null | { width: number; y0: number; y1: number }): Slab[] {
  if (!opening) return [{ offset: 0, width: length, y0: 0, y1: height, blocking: true }];

  const side = (length - opening.width) / 2;
  const slabs: Slab[] = [
    { offset: -(length + opening.width) / 4, width: side, y0: 0, y1: height, blocking: true },
    { offset: (length + opening.width) / 4, width: side, y0: 0, y1: height, blocking: true },
  ];
  if (opening.y0 > 0.001) slabs.push({ offset: 0, width: opening.width, y0: 0, y1: opening.y0, blocking: true });
  if (opening.y1 < height - 0.001) slabs.push({ offset: 0, width: opening.width, y0: opening.y1, y1: height, blocking: false });
  return slabs;
}

export interface ShellResult extends BuiltPiece {
  /** Room-local centres of every pore, for rooms that want to dress them. */
  poreAnchors: { position: readonly [number, number, number]; side: Side }[];
}

/**
 * Builds the shell into `batch`. Returns colliders and any pore lights; the
 * caller owns the batcher and therefore the draw calls.
 */
export function addShell(
  batch: MeshBatcher,
  ctx: RoomBuildContext,
  footprint: readonly Cell[],
  options: ShellOptions = {},
): { colliders: Collider[]; lights: THREE.Light[]; extra: THREE.Object3D; poreAnchors: ShellResult['poreAnchors'] } {
  const { cellSize, ceilingHeight, wallThickness, doorWidth, doorHeight } = ctx.dims;
  const colliders: Collider[] = [];
  const lights: THREE.Light[] = [];
  const extra = new THREE.Group();
  const poreAnchors: ShellResult['poreAnchors'] = [];

  const [floorName, floorTile] = FLOOR_MATERIAL[options.floor ?? 'flesh'];
  const [wallName, wallTile] = WALL_MATERIAL[options.wall ?? 'flesh'];
  const bandStyle = options.band ?? 'none';
  const [bandName, bandTile] = bandStyle === 'none' ? WALL_MATERIAL[options.wall ?? 'flesh'] : BAND_MATERIAL[bandStyle];
  const bandHeight = options.bandHeight ?? 1.05;
  const mouthStyle = options.mouth ?? 'sphincter';
  const wet = WET.has(options.wall ?? 'flesh');

  const floorMat = ctx.materials.get(floorName);
  const wallMat = ctx.materials.get(wallName);
  const bandMat = ctx.materials.get(bandName);
  const ceilMat = ctx.materials.get(options.ceiling === 'membrane' ? 'surface.membrane' : 'surface.ceiling');
  const boneMat = ctx.materials.get('bone');
  const bonePale = ctx.materials.get('bonePale');
  const meatMat = ctx.materials.get('meat');
  const meatDark = ctx.materials.get('meatDark');
  const tendonMat = ctx.materials.get('tendon');
  const cartilageMat = ctx.materials.get('cartilage');
  const chitinMat = ctx.materials.get('chitinPlate');
  const toothMat = ctx.materials.get('tooth');

  const occupied = new Set(footprint.map(([x, y]) => `${x},${y}`));
  const off = cellSize / 2 - wallThickness / 2;

  const pores = options.pores ?? [];
  if (pores.length && options.doorWalls) {
    for (const spec of pores) {
      const cell = spec.cell ?? ([0, 0] as const);
      const clash = options.doorWalls.some(
        (wall) => wall.side === spec.side && wall.cell[0] === cell[0] && wall.cell[1] === cell[1],
      );
      if (clash) throw new Error(`viscera shell: pore on ${cell}:${spec.side} collides with a declared doorWall`);
    }
  }
  const poreFor = (cell: Cell, side: Side): PoreSpec | undefined =>
    pores.find((spec) => {
      const c = spec.cell ?? ([0, 0] as const);
      return spec.side === side && c[0] === cell[0] && c[1] === cell[1];
    });

  /** Emits a wall slab, split at the band line so the lower tissue can differ. */
  function wallSlab(side: Side, cx: number, cz: number, slab: Slab): void {
    const runsAlongX = side === 'north' || side === 'south';
    const wallPos = side === 'north' ? cz - off : side === 'south' ? cz + off : side === 'west' ? cx - off : cx + off;

    const bands: [number, number, THREE.Material, number][] = [];
    const split = bandStyle === 'none' ? slab.y0 : Math.min(Math.max(bandHeight, slab.y0), slab.y1);
    if (split > slab.y0 + 0.001) bands.push([slab.y0, split, bandMat, bandTile]);
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
      const position: [number, number, number] = runsAlongX ? [cx + slab.offset, 0, wallPos] : [wallPos, 0, cz + slab.offset];
      colliders.push(boxCollider(size, position));
    }
  }

  /**
   * The trim: a sill where wall meets floor, an optional cartilage ridge at head
   * height, and the seam where wall meets ceiling. All three follow the same
   * gaps as the wall, so nothing crosses a doorway.
   */
  function wallTrim(side: Side, cx: number, cz: number, slabs: readonly Slab[], hasPore: boolean): void {
    const runsAlongX = side === 'north' || side === 'south';
    const wallPos = side === 'north' ? cz - off : side === 'south' ? cz + off : side === 'west' ? cx - off : cx + off;
    const inward = INWARD[side];
    const sign = runsAlongX ? inward[1] : inward[0];

    const strip = (
      offset: number,
      width: number,
      y: number,
      height: number,
      depth: number,
      material: THREE.Material,
      tile = 1.2,
    ): void => {
      const near = wallPos + sign * (wallThickness / 2 + depth / 2);
      const size: [number, number, number] = runsAlongX ? [width, height, depth] : [depth, height, width];
      const position: [number, number, number] = runsAlongX
        ? [cx + offset, y + height / 2, near]
        : [near, y + height / 2, cz + offset];
      batch.add(material, boxGeometry(size[0], size[1], size[2]), poseMatrix(position), { tile, castShadow: false });
    };

    for (const slab of slabs) {
      if (!slab.blocking) continue;

      if (options.sill !== false && slab.y0 < 0.01) {
        // Where the wall meets the floor. Two courses, the lower one proud: a
        // body never meets itself at a right angle, and the double step catches
        // a grazing light. In wet rooms it is a fold of meat rather than a
        // course of bone, or the chamber reads as a room with a skirting board.
        if (wet) {
          strip(slab.offset, slab.width, 0, SILL_HEIGHT * 0.7, 0.16, meatMat, 0.7);
          strip(slab.offset, slab.width, SILL_HEIGHT * 0.7, SILL_HEIGHT * 0.5, 0.09, meatDark, 0.5);
        } else {
          strip(slab.offset, slab.width, 0, SILL_HEIGHT * 0.55, 0.12, boneMat, 0.9);
          strip(slab.offset, slab.width, SILL_HEIGHT * 0.55, SILL_HEIGHT * 0.45, 0.07, bonePale, 0.7);
        }
      }
      if (bandStyle !== 'none' && slab.y1 > bandHeight) {
        strip(slab.offset, slab.width, bandHeight, 0.07, 0.1, cartilageMat, 0.8);
        // Buttress ribs: the vertical struts that make a band read as armour.
        const count = Math.max(1, Math.round(slab.width / 1.3));
        for (let i = 0; i <= count; i++) {
          const x = slab.offset - slab.width / 2 + (slab.width * i) / count;
          strip(x, 0.09, SILL_HEIGHT, bandHeight - SILL_HEIGHT, 0.045, cartilageMat, 0.5);
        }
      }
      // A ridge crosses a pore's head, so a wall with one goes without.
      if (options.ridge && !hasPore && slab.y1 > RIDGE_Y + 0.12) {
        strip(slab.offset, slab.width, RIDGE_Y, 0.07, 0.09, cartilageMat, 0.7);
      }
    }

    // The seam runs above every opening the shell can cut, so it crosses the
    // whole wall rather than breaking over each doorway.
    if (options.seam !== false) {
      strip(0, cellSize, ceilingHeight - 0.2, 0.2, 0.14, ceilMat, 1.4);
      strip(0, cellSize, ceilingHeight - 0.26, 0.07, 0.2, wet ? meatDark : bonePale, 0.9);
    }
  }

  /**
   * A wall-local frame: `along` runs across the wall, `depth` runs into the
   * room, and `yaw` turns a piece authored in that frame onto this wall.
   */
  function frame(side: Side, cx: number, cz: number): {
    yaw: number;
    at: (along: number, y: number, depth: number) => [number, number, number];
  } {
    const yaw = FACE_IN[side];
    const inward = INWARD[side];
    const u: readonly [number, number] = [Math.cos(yaw), -Math.sin(yaw)];
    const wallX = cx - inward[0] * off;
    const wallZ = cz - inward[1] * off;
    return {
      yaw,
      at: (along, y, depth) => [wallX + u[0] * along + inward[0] * depth, y, wallZ + u[1] * along + inward[1] * depth],
    };
  }

  /**
   * The ring around an opening. A hole in a body is never a clean rectangle:
   * meat purses around it, bone arches over it, chitin bites at it.
   */
  function mouth(side: Side, cx: number, cz: number, opening: { width: number; y0: number; y1: number }): void {
    if (mouthStyle === 'none') return;
    const { yaw, at } = frame(side, cx, cz);

    /** Places a box `along` metres across the opening, `depth` out of the wall. */
    const put = (
      material: THREE.Material,
      w: number,
      h: number,
      d: number,
      along: number,
      y: number,
      depth: number,
      roll = 0,
      tile = 0.8,
    ): void => {
      batch.add(material, boxGeometry(w, h, d), tiltMatrix(at(along, y, depth), [0, yaw, roll]), {
        tile,
        castShadow: false,
      });
    };

    const half = opening.width / 2;
    const head = opening.y1;

    if (mouthStyle === 'sphincter') {
      /**
       * A ring of muscle pursed around the hole. Sampled all the way round as
       * one loop rather than built as jambs plus a lintel: a lip is continuous,
       * and the corners are exactly where a four-piece frame gives itself away.
       *
       * The radial squash is what does the work - each segment is a stretched
       * sphere lying along the ring, thickest where the purse is tightest.
       */
      const steps = 16;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const a = t * Math.PI * 2;
        // A rounded-rectangle path around the opening, not a circle.
        const along = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.6) * (half + 0.14);
        const rise = head / 2 + Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.6) * (head / 2 + 0.1);
        if (rise < 0.06) continue; // the floor takes the bottom of the ring
        const bulge = 0.13 + Math.abs(Math.sin(a * 3 + 0.7)) * 0.065;
        batch.add(
          meatMat,
          ball(bulge),
          tiltMatrix(at(along, rise, 0.16 + bulge * 0.5), [0, yaw, a], [1, 2.1, 1.35]),
          { tile: 0.4, castShadow: false },
        );
      }
      // The inner lip: darker, wetter, set back into the throat of the opening.
      for (let i = 0; i < 10; i++) {
        const t = i / 10;
        const a = t * Math.PI * 2;
        const along = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.6) * (half + 0.02);
        const rise = head / 2 + Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.6) * (head / 2 - 0.02);
        if (rise < 0.1) continue;
        put(meatDark, 0.14, 0.14, 0.26, along, rise, 0.02, a, 0.3);
      }
      // Folds radiating out of the corners, so the purse pulls at the wall.
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const y = head * (0.24 + i * 0.28);
          put(meatMat, 0.5, 0.13, 0.13, s * (half + 0.34), y, 0.12, s * 0.45, 0.4);
        }
      }
    } else if (mouthStyle === 'vertebrae') {
      // A bone arch: jambs of stacked vertebrae, seven voussoirs over the head,
      // and a keystone that reads from across the room.
      for (const s of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const y = 0.1 + i * (head / 5);
          const w = 0.19 + (i % 2) * 0.05;
          put(boneMat, w, head / 5 - 0.05, 0.22, s * (half + 0.11), y + head / 10, 0.14, 0, 0.7);
          put(bonePale, 0.1, 0.07, 0.3, s * (half + 0.13), y + head / 10, 0.26, 0, 0.4);
        }
      }
      const segments = 7;
      const rise = 0.34;
      for (let i = 0; i < segments; i++) {
        const a0 = Math.PI * (i / segments);
        const a1 = Math.PI * ((i + 1) / segments);
        const x0 = -Math.cos(a0) * (half + 0.12);
        const x1 = -Math.cos(a1) * (half + 0.12);
        const y0 = head - 0.1 + Math.sin(a0) * rise;
        const y1 = head - 0.1 + Math.sin(a1) * rise;
        put(
          boneMat,
          Math.hypot(x1 - x0, y1 - y0) + 0.06,
          0.19,
          0.26,
          (x0 + x1) / 2,
          (y0 + y1) / 2,
          0.15,
          Math.atan2(y1 - y0, x1 - x0),
          0.6,
        );
      }
      put(bonePale, 0.17, 0.2, 0.32, 0, head + rise - 0.02, 0.18, 0, 0.4);
    } else {
      // Mandible: chitin plates that meet the opening at an angle, with a row of
      // small teeth along the head. The doorway you do not want to walk through.
      for (const s of [-1, 1]) {
        put(chitinMat, 0.26, head * 0.55, 0.3, s * (half + 0.13), head * 0.3, 0.16, s * 0.12, 0.7);
        put(chitinMat, 0.2, head * 0.5, 0.24, s * (half + 0.19), head * 0.74, 0.14, -s * 0.16, 0.7);
        put(ctx.materials.get('chitinDark'), 0.09, head * 0.9, 0.34, s * (half + 0.24), head * 0.48, 0.3, s * 0.05, 0.4);
      }
      put(chitinMat, opening.width + 0.5, 0.24, 0.3, 0, head + 0.1, 0.16, 0, 0.9);
      for (let i = 0; i < 7; i++) {
        const t = (i + 0.5) / 7 - 0.5;
        const size = 0.08 + Math.cos(t * Math.PI) * 0.05;
        put(toothMat, size * 0.7, size * 2.2, size * 0.7, t * (opening.width + 0.2), head - size * 0.9, 0.2, t * 0.3, 0.3);
      }
    }
  }

  /** An aperture in a wall the generator can never open: the pack's window. */
  function buildPore(spec: PoreSpec, side: Side, cx: number, cz: number, opening: { width: number; y0: number; y1: number }): void {
    const { yaw, at } = frame(side, cx, cz);
    const h = opening.y1 - opening.y0;
    const midY = (opening.y0 + opening.y1) / 2;
    const kind = spec.kind ?? 'membrane';

    const put = (material: THREE.Material, w: number, hh: number, d: number, along: number, y: number, depth: number, tile = 0.7): void => {
      batch.add(material, boxGeometry(w, hh, d), poseMatrix(at(along, y, depth), yaw), { tile, castShadow: false });
    };

    const pane = (material: THREE.Material, w: number, hh: number, along: number, y: number, depth: number): void => {
      batch.add(material, new THREE.PlaneGeometry(w, hh), poseMatrix(at(along, y, depth), yaw), {
        castShadow: false,
        receiveShadow: false,
        consume: true,
      });
    };

    // A rim of cartilage all the way round, so the aperture never reads as a
    // rectangle somebody cut with a knife.
    put(cartilageMat, opening.width + 0.34, 0.13, wallThickness + 0.16, 0, opening.y0 - 0.06, 0, 0.6);
    put(cartilageMat, opening.width + 0.3, 0.12, wallThickness + 0.14, 0, opening.y1 + 0.06, 0, 0.6);
    for (const s of [-1, 1]) {
      put(cartilageMat, 0.13, h + 0.24, wallThickness + 0.14, (s * (opening.width + 0.13)) / 2, midY, 0, 0.6);
    }

    if (kind === 'iris') {
      // An eye set in the wall, looking in. The single most unsettling thing the
      // shell can do, so it is rationed to one or two rooms.
      const r = Math.min(opening.width, h) * 0.46;
      batch.add(ctx.materials.get('sclera'), ball(r * 1.12, 16), poseMatrix(at(0, midY, -0.02)), {
        castShadow: false,
      });
      const disc = subUV(new THREE.CircleGeometry(r, 24), 0, 0, 0.5, 0.5);
      batch.add(ctx.materials.get('iris'), disc, poseMatrix(at(0, midY, r * 0.42), yaw), {
        castShadow: false,
        receiveShadow: false,
        consume: true,
      });
      // Lids: heavy folds of meat top and bottom, not quite closed.
      for (const s of [-1, 1]) {
        put(meatMat, opening.width + 0.1, h * 0.3, 0.34, 0, midY + s * (h * 0.36), 0.12, 0.6);
      }
    } else if (kind === 'ossified') {
      // Bone lattice with the light of the next cavity coming through it.
      pane(ctx.materials.get('haze'), opening.width, h, 0, midY, -0.03);
      pane(ctx.materials.get('lumen'), opening.width - 0.1, h - 0.1, 0, midY, 0.005);
      const bars = 5;
      for (let i = 0; i < bars; i++) {
        const along = -opening.width / 2 + (opening.width * (i + 0.5)) / bars;
        put(boneMat, 0.11, h, 0.13, along, midY, 0.06, 0.5);
      }
      for (let i = 1; i < 3; i++) {
        put(boneMat, opening.width, 0.1, 0.11, 0, opening.y0 + (h * i) / 3, 0.06, 0.5);
      }
    } else if (kind === 'vent') {
      // A slit vent breathing warm air from somewhere deeper in.
      pane(ctx.materials.get('hazeWarm'), opening.width, h, 0, midY, -0.03);
      const slats = 6;
      for (let i = 0; i < slats; i++) {
        const y = opening.y0 + (h * (i + 0.5)) / slats;
        // Tipped out of the wall about the run of the slat, so the vent reads as
        // breathing outward rather than as a grille painted on.
        batch.add(ctx.materials.get('chitinPlate'), boxGeometry(opening.width, 0.12, 0.2), tiltMatrix(at(0, y, 0.07), [0.5, yaw, 0]), {
          tile: 0.6,
          castShadow: false,
        });
      }
      put(ctx.materials.get('lumenWarm'), opening.width - 0.2, 0.06, 0.05, 0, opening.y0 + 0.05, -0.02, 0.4);
    } else {
      // The default: a stretched membrane with something lit behind it. Cheap,
      // and it is what makes a wet room feel like one chamber among many.
      pane(ctx.materials.get('haze'), opening.width + 0.2, h + 0.2, 0, midY, -0.05);
      pane(ctx.materials.get('caul'), opening.width, h, 0, midY, 0.01);
      // Vein cords crossing it, which is what tells you it is skin and not glass.
      for (let i = 0; i < 4; i++) {
        const t = (i + 0.5) / 4;
        const bow = Math.sin(t * Math.PI) * 0.12;
        batch.add(
          ctx.materials.get('vein'),
          boxGeometry(0.05, h * 0.94, 0.05),
          tiltMatrix(at(-opening.width / 2 + opening.width * t, midY, 0.045), [0, yaw, bow]),
          { tile: 0.4, castShadow: false },
        );
      }
    }

    if (spec.light) {
      const colour = kind === 'vent' ? 0xff9a52 : kind === 'iris' ? 0xd8a63a : 0x7fe0b4;
      const lamp = new THREE.PointLight(colour, kind === 'iris' ? 8 : 12, cellSize * 1.7, 2);
      lamp.position.set(...at(0, midY, 0.5));
      extra.add(lamp);
      lights.push(lamp);
    }

    poreAnchors.push({ position: at(0, midY, 0), side });
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

    switch (options.ceiling ?? 'flesh') {
      case 'ribs': {
        // Transverse ribs sprung from both walls. Sampled at eleven segments per
        // arch: any coarser and a rib stops reading as bone and starts reading
        // as a row of blocks floating under the ceiling.
        for (let i = 0; i < 3; i++) {
          const z = cz - cellSize / 2 + cellSize * ((i + 0.5) / 3);
          const span = cellSize / 2 - 0.1;
          const rise = 0.62;
          const spring = ceilingHeight - 0.16 - rise;
          const segments = 11;
          for (let s = 0; s < segments; s++) {
            const a0 = (Math.PI * s) / segments;
            const a1 = (Math.PI * (s + 1)) / segments;
            const x0 = Math.cos(a0) * span;
            const x1 = Math.cos(a1) * span;
            const y0 = spring + Math.sin(a0) * rise;
            const y1 = spring + Math.sin(a1) * rise;
            const taper = 0.24 - Math.abs(0.5 - s / segments) * 0.1;
            batch.add(
              boneMat,
              boxGeometry(Math.hypot(x1 - x0, y1 - y0) + 0.07, taper, 0.3),
              tiltMatrix([cx + (x0 + x1) / 2, (y0 + y1) / 2, z], [0, 0, Math.atan2(y1 - y0, x1 - x0)]),
              { tile: 1.2, ...CEILING_OPTS },
            );
          }
        }
        // The spine the ribs hang from, running the other way.
        for (let i = 0; i < 6; i++) {
          const x = cx - cellSize / 2 + cellSize * ((i + 0.5) / 6);
          batch.add(bonePale, boxGeometry(cellSize / 6 - 0.06, 0.26, 0.34), poseMatrix([x, ceilingHeight - 0.2, cz]), { tile: 0.8, ...CEILING_OPTS });
        }
        break;
      }
      case 'sinew':
        // Cables strung corner to corner, sagging, with drips hanging off them.
        for (let i = 0; i < 5; i++) {
          const t = (i + 0.5) / 5;
          const z = cz - cellSize / 2 + cellSize * t;
          const sag = 0.1 + Math.sin(t * Math.PI) * 0.16;
          batch.add(tendonMat, boxGeometry(cellSize, 0.09, 0.09), poseMatrix([cx, ceilingHeight - 0.16 - sag, z]), { tile: 0.7, ...CEILING_OPTS });
          batch.add(
            meatDark,
            boxGeometry(0.05, 0.3 + sag, 0.05),
            poseMatrix([cx - cellSize * 0.3 + i * 0.9, ceilingHeight - 0.34 - sag, z]),
            { tile: 0.3, ...CEILING_OPTS },
          );
        }
        break;
      case 'palate':
        // The ridged roof of a mouth: transverse rugae, deepest in the middle.
        for (let i = 0; i < 7; i++) {
          const t = (i + 0.5) / 7;
          const z = cz - cellSize / 2 + cellSize * t;
          const drop = 0.1 + Math.sin(t * Math.PI) * 0.14;
          batch.add(meatMat, boxGeometry(cellSize - 0.4 * i * 0.1, drop, 0.36), poseMatrix([cx, ceilingHeight - drop / 2 - 0.04, z]), {
            tile: 1.1,
            ...CEILING_OPTS,
          });
        }
        break;
      case 'vault':
        // Bone coffers: plates locked together over your head.
        for (let i = 0; i <= 3; i++) {
          const t = -cellSize / 2 + (cellSize * i) / 3;
          batch.add(bonePale, boxGeometry(cellSize, 0.22, 0.18), poseMatrix([cx, ceilingHeight - 0.11, cz + t]), { tile: 1, ...CEILING_OPTS });
          batch.add(bonePale, boxGeometry(0.18, 0.22, cellSize), poseMatrix([cx + t, ceilingHeight - 0.11, cz]), { tile: 1, ...CEILING_OPTS });
        }
        for (const [dx, dz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const) {
          batch.add(boneMat, boxGeometry(0.3, 0.3, 0.3), poseMatrix([cx + dx * 1.33, ceilingHeight - 0.14, cz + dz * 1.33]), {
            tile: 0.5,
            ...CEILING_OPTS,
          });
        }
        break;
      case 'chitin':
        // Plates locked across the roof, overlapping the way a carapace does.
        for (let i = 0; i < 5; i++) {
          const t = (i + 0.5) / 5;
          const z = cz - cellSize / 2 + cellSize * t;
          batch.add(chitinMat, boxGeometry(cellSize, 0.16, cellSize / 5 + 0.12), tiltMatrix([cx, ceilingHeight - 0.1, z], [0.06, 0, 0]), {
            tile: 1.1,
            ...CEILING_OPTS,
          });
          batch.add(ctx.materials.get('chitinDark'), boxGeometry(cellSize, 0.07, 0.1), poseMatrix([cx, ceilingHeight - 0.2, z + cellSize / 10]), {
            tile: 0.5,
            ...CEILING_OPTS,
          });
        }
        break;
      case 'sacs':
        // Sagging membranous sacs, each a squashed sphere. They are lit from
        // inside by whatever the room lights itself with, and they are the
        // reason a lung ceiling reads as breathing rather than as a plane.
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const r = i === 4 ? 0 : cellSize * 0.26;
          const size = i === 4 ? 0.9 : 0.6;
          batch.add(
            ctx.materials.get('surface.membrane'),
            ball(size, 12),
            tiltMatrix([cx + Math.cos(a) * r, ceilingHeight - size * 0.42, cz + Math.sin(a) * r], [0, a, 0], [1, 0.62, 1]),
            { tile: 1.4, castShadow: false },
          );
        }
        break;
      case 'spines':
        // Downward spines. Nothing up there wants you standing under it.
        for (let i = 0; i < 12; i++) {
          const ax = cx - cellSize / 2 + cellSize * (((i * 5) % 12) + 0.5) / 12;
          const az = cz - cellSize / 2 + cellSize * (((i * 7) % 12) + 0.5) / 12;
          const len = 0.3 + ((i * 37) % 11) / 22;
          batch.add(toothMat, spike(0.09, len, 6), poseMatrix([ax, ceilingHeight - len / 2 - 0.04, az]), {
            tile: 0.4,
            ...CEILING_OPTS,
          });
        }
        break;
      case 'membrane':
      default:
        break;
    }

    for (const side of SIDES) {
      const step = NEIGHBOUR[side];
      if (occupied.has(`${gx + step[0]},${gy + step[1]}`)) continue; // interior edge: open

      const hasDoor = (ctx.doors[doorKey([gx, gy], side)] ?? 'none') !== 'none';
      const pore = hasDoor ? undefined : poreFor([gx, gy], side);

      let opening: { width: number; y0: number; y1: number } | null = null;
      if (hasDoor) opening = { width: doorWidth, y0: 0, y1: doorHeight };
      else if (pore) {
        opening = pore.tall
          ? { width: 1.9, y0: 0.28, y1: ceilingHeight - 0.6 }
          : { width: 1.55, y0: 0.95, y1: 2.45 };
      }

      const slabs = slabsFor(cellSize, ceilingHeight, opening);
      for (const slab of slabs) wallSlab(side, cx, cz, slab);
      wallTrim(side, cx, cz, slabs, pore !== undefined);

      if (hasDoor && opening) mouth(side, cx, cz, opening);
      if (pore && opening) buildPore(pore, side, cx, cz, opening);
    }
  }

  return { colliders, lights, extra, poreAnchors };
}

/**
 * The contract-facing kit. Viscera rooms call `addShell()` directly so they can
 * pass style options and share one batcher with their furniture; this exists so
 * anything holding only a `PackKit` still gets a correct, plain shell.
 *
 * `BuiltPiece` has no `dispose`, so the geometry this path merges is never
 * freed. That is fine because nothing in a run uses it - every room goes through
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
