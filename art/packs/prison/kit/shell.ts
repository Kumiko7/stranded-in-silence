/**
 * Blackgate's shell: floors, ceilings, walls, trim, gateways and ports.
 *
 * Every room calls this first and then decorates, which is what guarantees door
 * openings line up between neighbours no matter who authored the rooms either
 * side. The style options are the pack's main lever for variety: the same
 * function builds a Victorian gallows shed and a tiled operating theatre.
 *
 * Five things worth knowing before you use it:
 *
 * - It writes into a `MeshBatcher` rather than building meshes. A Blackgate room
 *   is several hundred boxes of block, bar and pipe; batched, that is a handful
 *   of draw calls. See `art/lib/merge.ts`.
 * - **Every room gets a night-light course.** This is the pack's signature and
 *   its whole lighting design: a channel along the base of every wall with the
 *   building's permanent night circuit in it - caged tungsten beads in the
 *   Blocks, a slotted cold strip in the Ward, a germicidal tube in the
 *   Programme. It costs no light budget, it is the same object in all three
 *   families in three materials, and it is what guarantees the rule in
 *   ROOM_FORMAT.md §6: a player with no torch can always read the layout and
 *   find the doors. The lit part is BEADS on a dark channel rather than a
 *   continuous filament - a glowing line beside a dark one reads as bunting, and
 *   an emissive tuned at prop scale clips to flat white when it is multiplied by
 *   a whole map (docs/art/ROOM_REVIEW.md).
 * - **Every opening gets a mouth**, and the mouth is what tells a player which
 *   family they have walked into before they have read a single prop: a barred
 *   gate frame with the bolt-bar parked over it, a rubber-gasketed clinical
 *   frame with a wire-glass vision panel, a brick relieving arch, or a clamped
 *   gasket ring bleeding resin.
 * - **A port may only go on a side the blueprint never opens as a door.** The
 *   generator decides doors at run time, so the only walls guaranteed solid for
 *   a whole run are the ones missing from `doorWalls`. Passing `doorWalls` in
 *   lets the shell throw immediately rather than shipping a room with a window
 *   in a doorway. Every port opening starts above the floor, so the wall keeps
 *   one collider across its whole run - a decorative hole must never be a hole
 *   in the wall (docs/art/ROOM_REVIEW.md).
 * - **A window leans about 1 m out of its room** to hold the backdrop behind the
 *   glass. That is deliberate and handled: a room is culled by the cells its
 *   geometry reaches, not the cells it occupies (ROOM_FORMAT.md §7).
 */
import * as THREE from 'three';
import type { BuiltPiece, Cell, Collider, PackKit, RoomBuildContext, Side } from '../../../lib/contract';
import { SIDES, doorKey } from '../../../lib/contract';
import { boxCollider, boxGeometry } from '../../../lib/build';
import { MeshBatcher, poseMatrix, tiltMatrix } from '../../../lib/merge';
import { cyl, quad, ring } from './props';
import * as tex from '../textures';

export type FloorStyle =
  | 'concrete'
  | 'quarry'
  | 'gravel'
  | 'drain'
  | 'wardTile'
  | 'terrazzo'
  | 'lino'
  | 'rubber'
  | 'rubble'
  | 'resin';
export type WallStyle = 'block' | 'brick' | 'rivet' | 'rubble' | 'wardTile' | 'distemper' | 'padded' | 'resin';
export type CeilingStyle = 'soffit' | 'joist' | 'mesh' | 'pipes' | 'vault' | 'lath' | 'gantry' | 'open';
/** The lower band of the wall, where a different material takes over. */
export type BandStyle = 'none' | 'dado' | 'tile' | 'hazard' | 'brick' | 'rivet' | 'block';
/** What the ring around a doorway is made of. */
export type MouthStyle = 'gate' | 'clinic' | 'arch' | 'seal' | 'none';
/**
 * The night-light course: the pack's signature, along the base of every wall.
 * `caged` and `strip` are the two halves of the map; `uv` is the Programme, and
 * `dead` is the handful of rooms where the circuit has failed - which is a
 * deliberate absence of the map's one guarantee, and a room that picks it has to
 * light itself some other way.
 */
export type RegisterStyle = 'none' | 'caged' | 'strip' | 'uv' | 'dead';

export type PortKind = 'judas' | 'bars' | 'mirror' | 'grille' | 'lancet' | 'hatch';

export interface PortSpec {
  readonly cell?: Cell;
  readonly side: Side;
  readonly kind?: PortKind;
  /** Adds a practical behind it. Counts against the room's light budget. */
  readonly light?: boolean;
  /** A window floor-to-near-ceiling, for a room that wants one wall to be mostly opening. */
  readonly tall?: boolean;
}

export interface ShellOptions {
  readonly floor?: FloorStyle;
  readonly wall?: WallStyle;
  readonly ceiling?: CeilingStyle;
  readonly band?: BandStyle;
  /** Height the band reaches. Default 1.05 m; the Ward's tile runs to about 2.1. */
  readonly bandHeight?: number;
  /** The skirting / kerb where wall meets floor. On by default. */
  readonly kick?: boolean;
  /** A hand rail at 1 m, the way a hospital corridor is fitted out. */
  readonly rail?: boolean;
  /** The picture rail or cornice where wall meets ceiling. On by default. */
  readonly seam?: boolean;
  readonly mouth?: MouthStyle;
  readonly register?: RegisterStyle;
  /** A room where the damp has won: the course runs behind a film of scale. */
  readonly damp?: boolean;
  readonly ports?: readonly PortSpec[];
  /** Sides the blueprint may open. Required if `ports` is set. */
  readonly doorWalls?: readonly { readonly cell: Cell; readonly side: Side }[];
}

const FLOOR_MATERIAL: Record<FloorStyle, [string, number]> = {
  concrete: ['surface.concrete', tex.CONCRETE_TILE],
  quarry: ['surface.quarry', tex.QUARRY_TILE],
  gravel: ['surface.gravel', tex.GRAVEL_TILE],
  drain: ['surface.drain', tex.DRAIN_TILE],
  wardTile: ['surface.wardTile', tex.WARDTILE_TILE],
  terrazzo: ['surface.terrazzo', tex.TERRAZZO_TILE],
  lino: ['surface.lino', tex.LINO_TILE],
  rubber: ['surface.rubber', tex.RUBBER_TILE],
  rubble: ['surface.rubble', tex.RUBBLE_TILE],
  resin: ['surface.resin', tex.RESIN_TILE],
};

const WALL_MATERIAL: Record<WallStyle, [string, number]> = {
  block: ['surface.block', tex.BLOCK_TILE],
  brick: ['surface.brick', tex.BRICK_TILE],
  rivet: ['surface.rivet', tex.RIVET_TILE],
  rubble: ['surface.rubble', tex.RUBBLE_TILE],
  wardTile: ['surface.wardTile', tex.WARDTILE_TILE],
  distemper: ['surface.distemper', tex.DISTEMPER_TILE],
  padded: ['surface.padded', tex.PAD_TILE],
  resin: ['surface.resin', tex.RESIN_TILE],
};

const BAND_MATERIAL: Record<Exclude<BandStyle, 'none'>, [string, number]> = {
  dado: ['surface.dado', tex.DADO_TILE],
  tile: ['surface.wardTile', tex.WARDTILE_TILE],
  hazard: ['surface.hazard', tex.HAZARD_TILE],
  brick: ['surface.brick', tex.BRICK_TILE],
  rivet: ['surface.rivet', tex.RIVET_TILE],
  block: ['surface.block', tex.BLOCK_TILE],
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
 * turned by this. That is what stops the class of bug where a lintel box built
 * on the north wall comes out inside-out on the east one: the sizes are never
 * swapped by hand, so there is nothing to swap wrongly.
 */
const FACE_IN: Record<Side, number> = {
  north: 0,
  east: -Math.PI / 2,
  south: Math.PI,
  west: Math.PI / 2,
};

const KICK_HEIGHT = 0.2;
const RAIL_Y = 0.98;

/**
 * Which wall styles are institutional joinery rather than raw fabric. It decides
 * the trim: a moulded skirting under a wall of wet rubble reads as a cellar
 * somebody fitted out, which is the one thing this pack must never look like.
 */
const FINISHED: ReadonlySet<WallStyle> = new Set<WallStyle>(['block', 'brick', 'rivet', 'wardTile', 'distemper', 'padded']);
/** The Ward's own surfaces, which take stainless trim rather than painted iron. */
const CLINICAL: ReadonlySet<WallStyle> = new Set<WallStyle>(['wardTile', 'distemper', 'padded']);

/**
 * Anything up at the ceiling is ABOVE every light a room can hang, so all of it
 * casts a hard bar straight down across the floor it is decorating. Ceiling
 * treatment is therefore never a shadow caster - see docs/art/ROOM_REVIEW.md.
 */
const CEILING_OPTS = { castShadow: false } as const;
const FLAT_OPTS = { castShadow: false, receiveShadow: false } as const;

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
  /** Room-local centres of every port, for rooms that want to dress them. */
  portAnchors: { position: readonly [number, number, number]; side: Side; kind: PortKind }[];
}

/**
 * Builds the shell into `batch`. Returns colliders and any port lights; the
 * caller owns the batcher and therefore the draw calls.
 */
export function addShell(
  batch: MeshBatcher,
  ctx: RoomBuildContext,
  footprint: readonly Cell[],
  options: ShellOptions = {},
): { colliders: Collider[]; lights: THREE.Light[]; extra: THREE.Object3D; portAnchors: ShellResult['portAnchors'] } {
  const { cellSize, ceilingHeight, wallThickness, doorWidth, doorHeight } = ctx.dims;
  const colliders: Collider[] = [];
  const lights: THREE.Light[] = [];
  const extra = new THREE.Group();
  const portAnchors: ShellResult['portAnchors'] = [];

  const [floorName, floorTile] = FLOOR_MATERIAL[options.floor ?? 'concrete'];
  const wallStyle = options.wall ?? 'block';
  const [wallName, wallTile] = WALL_MATERIAL[wallStyle];
  const bandStyle = options.band ?? 'none';
  const [bandName, bandTile] = bandStyle === 'none' ? WALL_MATERIAL[wallStyle] : BAND_MATERIAL[bandStyle];
  const bandHeight = options.bandHeight ?? 1.05;
  const finished = FINISHED.has(wallStyle);
  const clinical = CLINICAL.has(wallStyle);
  const mouthStyle = options.mouth ?? (clinical ? 'clinic' : finished ? 'gate' : 'arch');
  const registerStyle = options.register ?? (clinical ? 'strip' : 'caged');
  const ceilingStyle = options.ceiling ?? 'soffit';

  const floorMat = ctx.materials.get(floorName);
  const wallMat = ctx.materials.get(wallName);
  const bandMat = ctx.materials.get(bandName);
  const ceilName =
    ceilingStyle === 'vault' ? 'surface.brick' : ceilingStyle === 'lath' ? 'surface.distemper' : 'surface.soffit';
  const ceilTile = ceilingStyle === 'vault' ? tex.BRICK_TILE : ceilingStyle === 'lath' ? tex.DISTEMPER_TILE : tex.SOFFIT_TILE;
  const ceilMat = ctx.materials.get(ceilName);

  const ironMat = ctx.materials.get('ironBar');
  const ironPale = ctx.materials.get('ironPale');
  const steelMat = ctx.materials.get('steel');
  const steelDark = ctx.materials.get('steelDark');
  const surgicalMat = ctx.materials.get('surgical');
  const rustMat = ctx.materials.get('rust');
  const brickMat = ctx.materials.get('surface.brick');
  const stoneMat = ctx.materials.get('surface.rubble');
  const hazardMat = ctx.materials.get('surface.hazard');
  const stencilMat = ctx.materials.get('surface.stencil');
  const rubberMat = ctx.materials.get('rubberProp');
  const leadMat = ctx.materials.get('lead');
  const limeMat = ctx.materials.get('lime');
  const timberMat = ctx.materials.get('timber');

  const occupied = new Set(footprint.map(([x, y]) => `${x},${y}`));
  const off = cellSize / 2 - wallThickness / 2;

  const ports = options.ports ?? [];
  if (ports.length && options.doorWalls) {
    for (const spec of ports) {
      const cell = spec.cell ?? ([0, 0] as const);
      const clash = options.doorWalls.some(
        (wall) => wall.side === spec.side && wall.cell[0] === cell[0] && wall.cell[1] === cell[1],
      );
      if (clash) throw new Error(`prison shell: port on ${cell}:${spec.side} collides with a declared doorWall`);
    }
  }
  const portFor = (cell: Cell, side: Side): PortSpec | undefined =>
    ports.find((spec) => {
      const c = spec.cell ?? ([0, 0] as const);
      return spec.side === side && c[0] === cell[0] && c[1] === cell[1];
    });

  /** Emits a wall slab, split at the band line so the lower material can differ. */
  function wallSlab(side: Side, cx: number, cz: number, slab: Slab): void {
    const runsAlongX = side === 'north' || side === 'south';
    const wallPos = side === 'north' ? cz - off : side === 'south' ? cz + off : side === 'west' ? cx - off : cx + off;

    const courses: [number, number, THREE.Material, number][] = [];
    const split = bandStyle === 'none' ? slab.y0 : Math.min(Math.max(bandHeight, slab.y0), slab.y1);
    if (split > slab.y0 + 0.001) courses.push([slab.y0, split, bandMat, bandTile]);
    if (slab.y1 > split + 0.001) courses.push([split, slab.y1, wallMat, wallTile]);

    for (const [y0, y1, material, tile] of courses) {
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
   * The trim: a kerb where wall meets floor, the night-light course just above
   * it, an optional hand rail, and the picture rail where wall meets ceiling.
   * All of it follows the same gaps as the wall, so nothing crosses a doorway -
   * and the night course in particular must not, or the doorway stops being the
   * darkest thing on the wall and stops reading as a way out.
   */
  function wallTrim(side: Side, cx: number, cz: number, slabs: readonly Slab[], hasPort: boolean): void {
    const runsAlongX = side === 'north' || side === 'south';
    const wallPos = side === 'north' ? cz - off : side === 'south' ? cz + off : side === 'west' ? cx - off : cx + off;
    const inward = INWARD[side];
    const sign = runsAlongX ? inward[1] : inward[0];

    /** A course of `material` running `width` along the wall at height `y`. */
    const strip = (
      offset: number,
      width: number,
      y: number,
      height: number,
      depth: number,
      material: THREE.Material,
      tile = 1.0,
    ): void => {
      const near = wallPos + sign * (wallThickness / 2 + depth / 2);
      const size: [number, number, number] = runsAlongX ? [width, height, depth] : [depth, height, width];
      const position: [number, number, number] = runsAlongX
        ? [cx + offset, y + height / 2, near]
        : [near, y + height / 2, cz + offset];
      batch.add(material, boxGeometry(size[0], size[1], size[2]), poseMatrix(position), { tile, castShadow: false });
    };

    /**
     * A flat plane hung on the wall face - the additive washes.
     *
     * `FACE_IN` ALREADY turns a plane's front face into the room, which is what
     * makes it different from the props convention in `kit/props.ts` where a
     * `-Z`-facing prop's yaw needs a further half turn before a plane hung on it
     * points the right way. Adding that half turn here as well - which the first
     * pass did in six places - points every wash, every pane of glass and every
     * backdrop in the pack straight into the plaster, and nothing in
     * `validate:art` can see it (docs/art/ROOM_FORMAT.md §2.1.2).
     */
    const wash = (offset: number, width: number, y: number, height: number, material: THREE.Material): void => {
      const near = wallPos + sign * (wallThickness / 2 + 0.016);
      const position: [number, number, number] = runsAlongX ? [cx + offset, y, near] : [near, y, cz + offset];
      batch.add(material, quad(width, height), poseMatrix(position, FACE_IN[side]), FLAT_OPTS);
    };

    for (const slab of slabs) {
      if (!slab.blocking) continue;

      if (options.kick !== false && slab.y0 < 0.01) {
        if (clinical) {
          // A coved skirting: the Ward's floors run up the wall in one piece, so
          // there is no corner to collect anything. It is the single detail that
          // says "this room was designed to be hosed out".
          strip(slab.offset, slab.width, 0, KICK_HEIGHT * 0.9, 0.06, ctx.materials.get('surface.wardTile'), 0.5);
          strip(slab.offset, slab.width, KICK_HEIGHT * 0.9, 0.03, 0.08, surgicalMat, 0.4);
        } else if (finished) {
          // A concrete kerb with a steel angle over the arris. Two courses, the
          // lower proud: it catches a grazing light and gives the floor a hard
          // edge to end on.
          strip(slab.offset, slab.width, 0, KICK_HEIGHT * 0.78, 0.07, ctx.materials.get('surface.dado'), 0.7);
          strip(slab.offset, slab.width, KICK_HEIGHT * 0.78, 0.03, 0.1, steelDark, 0.4);
        } else {
          // Where raw fabric meets floor there is a talus of spalled mortar and
          // fallen brick, not a skirting board. Lumpy, and never level.
          strip(slab.offset, slab.width, 0, KICK_HEIGHT * 0.55, 0.22, rustMat, 0.6);
          strip(slab.offset, slab.width, KICK_HEIGHT * 0.4, KICK_HEIGHT * 0.6, 0.12, stoneMat, 0.5);
        }
      }

      /* --- the night-light course: the thing that holds the pack together ---- */
      if (registerStyle !== 'none' && slab.y0 < 0.01 && slab.y1 > 0.6) {
        const y = clinical ? 0.3 : 0.4;
        if (registerStyle === 'caged' || registerStyle === 'dead') {
          const live = registerStyle === 'caged';
          // A shallow recess with the night circuit in it: a dark back-box, a
          // hood over it, and a caged bead every couple of metres. The recess is
          // DARK and set back, so what a player sees is light coming out of a
          // hole rather than a stripe painted on a wall.
          strip(slab.offset, slab.width, y - 0.11, 0.24, 0.04, ctx.materials.get('steelDark'), 0.4);
          strip(slab.offset, slab.width, y + 0.13, 0.055, 0.13, finished ? ironMat : rustMat, 0.4);
          const stations = Math.max(1, Math.round(slab.width / 1.9));
          for (let i = 0; i < stations; i++) {
            const sx = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / stations;
            // The bead itself, deep in the recess.
            strip(sx, 0.2, y - 0.05, 0.13, 0.055, ctx.materials.get(live ? 'lumenTungsten' : 'bulbDead'), 0.2);
            // Two guard bars across it. A bulb behind wire is the whole idiom.
            for (const s of [-1, 1]) strip(sx + s * 0.055, 0.022, y - 0.08, 0.19, 0.085, ironMat, 0.15);
            // The wash on the wall above it - additive and masked, so it fades
            // rather than ending on a rectangle. It costs nothing against the
            // light budget and it is the whole difference between "there is a
            // lamp here" and "this room is lit" (docs/art/ROOM_REVIEW.md).
            if (live) wash(sx, 0.9, y + 0.22, 0.85, ctx.materials.get('warmWash'));
          }
        } else if (registerStyle === 'strip') {
          // The Ward's version: a continuous frosted line behind a stainless
          // slot, with fins across it so it reads as dashes rather than as a
          // filament. Cold, and about half as bright as the Blocks' beads.
          strip(slab.offset, slab.width, y - 0.06, 0.17, 0.035, ctx.materials.get('steelDark'), 0.4);
          strip(slab.offset, slab.width, y - 0.02, 0.075, 0.02, ctx.materials.get('lumenTube'), 0.3);
          const fins = Math.max(2, Math.round(slab.width / 0.62));
          for (let i = 0; i < fins; i++) {
            const sx = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / fins;
            strip(sx, 0.075, y - 0.06, 0.17, 0.06, surgicalMat, 0.2);
          }
          strip(slab.offset, slab.width, y + 0.11, 0.04, 0.09, surgicalMat, 0.4);
          const washes = Math.max(1, Math.round(slab.width / 2.6));
          for (let i = 0; i < washes; i++) {
            const sx = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / washes;
            wash(sx, 1.5, y + 0.3, 0.8, ctx.materials.get('coldWash'));
          }
        } else {
          // The Programme's: a germicidal tube in the same channel, with the
          // crust growing over the ends of it.
          strip(slab.offset, slab.width, y - 0.07, 0.2, 0.04, ctx.materials.get('steelDark'), 0.4);
          strip(slab.offset, slab.width, y - 0.02, 0.08, 0.022, ctx.materials.get('lumenUV'), 0.3);
          const lumps = Math.max(2, Math.round(slab.width / 0.8));
          for (let i = 0; i < lumps; i++) {
            const sx = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / lumps;
            strip(sx, 0.16 + ((i * 13) % 5) / 24, y - 0.09, 0.24, 0.07, ctx.materials.get('surface.resin'), 0.3);
            if (i % 2 === 0) wash(sx, 1.1, y + 0.28, 0.9, ctx.materials.get('violetWash'));
          }
        }
      }

      if (bandStyle !== 'none' && slab.y1 > bandHeight) {
        // The cap moulding on the band: a bullnose over a shadow gap, which is
        // exactly how a dado rail and a tile course both terminate.
        strip(slab.offset, slab.width, bandHeight, 0.045, 0.055, clinical ? surgicalMat : steelDark, 0.6);
        strip(slab.offset, slab.width, bandHeight - 0.03, 0.03, 0.025, ctx.materials.get('steelDark'), 0.4);
      }

      // A hand rail crosses a port's sill, so a wall with one goes without.
      if (options.rail && finished && !hasPort && slab.y1 > RAIL_Y + 0.12) {
        strip(slab.offset, slab.width, RAIL_Y, 0.055, 0.11, clinical ? surgicalMat : timberMat, 0.6);
        const brackets = Math.max(2, Math.round(slab.width / 2.2));
        for (let i = 0; i < brackets; i++) {
          const sx = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / brackets;
          strip(sx, 0.05, RAIL_Y - 0.08, 0.14, 0.055, steelDark, 0.2);
        }
      }
    }

    // The picture rail runs above every opening the shell can cut, so it crosses
    // the whole wall rather than breaking over each gateway.
    if (options.seam !== false) {
      if (clinical) {
        strip(0, cellSize, ceilingHeight - 0.16, 0.16, 0.07, ctx.materials.get('surface.distemper'), 0.9);
        strip(0, cellSize, ceilingHeight - 0.2, 0.045, 0.1, surgicalMat, 0.4);
      } else if (finished) {
        strip(0, cellSize, ceilingHeight - 0.2, 0.2, 0.09, ctx.materials.get('surface.dado'), 1.0);
        strip(0, cellSize, ceilingHeight - 0.26, 0.06, 0.14, steelDark, 0.4);
        // The conduit run that every institution has, tucked under the cornice.
        batch.add(ironMat, cyl(0.028, 0.028, cellSize, 6), tiltMatrix(
          runsAlongX
            ? [cx, ceilingHeight - 0.42, wallPos + sign * (wallThickness / 2 + 0.06)]
            : [wallPos + sign * (wallThickness / 2 + 0.06), ceilingHeight - 0.42, cz],
          [0, runsAlongX ? 0 : Math.PI / 2, Math.PI / 2],
        ), { tile: 0.4, castShadow: false });
      } else {
        strip(0, cellSize, ceilingHeight - 0.26, 0.26, 0.16, stoneMat, 1.0);
        strip(0, cellSize, ceilingHeight - 0.32, 0.07, 0.22, limeMat, 0.5);
      }
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
   * The ring around a doorway.
   *
   * A doorway is the one thing every view of every room contains - a contact
   * sheet stands its cameras in the doorways, and so does a player - so this is
   * where a pack gets the most for the least. It is also what tells a player
   * which half of the building they have just walked into, before they have read
   * a single prop.
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
      tile = 0.7,
    ): void => {
      batch.add(material, boxGeometry(w, h, d), tiltMatrix(at(along, y, depth), [0, yaw, roll]), { tile, castShadow: false });
    };

    const half = opening.width / 2;
    const head = opening.y1;

    if (mouthStyle === 'gate') {
      // Jambs: a heavy channel section standing proud of the wall, with the
      // keeper plate and three hinge blocks down the closing side.
      for (const s of [-1, 1]) {
        put(ironMat, 0.2, head + 0.34, 0.24, s * (half + 0.1), (head + 0.34) / 2, 0.12, 0, 0.6);
        put(steelDark, 0.06, head + 0.28, 0.3, s * (half + 0.02), (head + 0.28) / 2, 0.16, 0, 0.3);
        for (let i = 0; i < 3; i++) {
          const y = 0.42 + i * (head / 3.2);
          put(ironPale, 0.13, 0.11, 0.15, s * (half + 0.16), y, 0.2, 0, 0.2);
        }
      }
      // The head: a lintel box with the sliding bolt-bar parked across it, and
      // a transom grille above that. The bar is what makes a doorway in this map
      // read as something that can be shut on you.
      put(ironMat, opening.width + 0.6, 0.3, 0.28, 0, head + 0.15, 0.14, 0, 0.8);
      put(steelMat, opening.width + 0.9, 0.07, 0.1, 0, head + 0.06, 0.24, 0, 0.4);
      put(ironPale, 0.16, 0.13, 0.16, half + 0.4, head + 0.06, 0.28, 0, 0.2);
      // The transom: five bars over the head, so you can be looked at through
      // the door even when it is closed.
      const barTop = Math.min(ceilingHeight - 0.24, head + 0.86);
      if (barTop > head + 0.42) {
        put(ironMat, opening.width + 0.34, 0.08, 0.2, 0, barTop, 0.11, 0, 0.4);
        for (let i = 0; i < 5; i++) {
          const bx = -half + (opening.width * (i + 0.5)) / 5;
          batch.add(ironMat, cyl(0.021, 0.021, barTop - head - 0.32, 5), poseMatrix(at(bx, (head + 0.32 + barTop) / 2, 0.11)), {
            tile: 0.2,
            castShadow: false,
          });
        }
      }
      // A stencilled number plate on the head, and a threshold strip across the
      // sill. Six centimetres, so it reads as a track and never as something a
      // player has to step over - collision is a floor test and this carries no
      // collider.
      put(stencilMat, 0.62, 0.17, 0.03, -half + 0.42, head + 0.15, 0.29, 0, 0.5);
      put(steelDark, opening.width + 0.2, 0.045, 0.34, 0, 0.022, 0.1, 0, 0.4);
    } else if (mouthStyle === 'clinic') {
      // A rubber-gasketed frame with a hospital's kick plates and bumper rails.
      for (const s of [-1, 1]) {
        put(surgicalMat, 0.14, head + 0.24, 0.2, s * (half + 0.07), (head + 0.24) / 2, 0.1, 0, 0.4);
        put(rubberMat, 0.05, head + 0.2, 0.26, s * (half - 0.005), (head + 0.2) / 2, 0.13, 0, 0.25);
      }
      put(surgicalMat, opening.width + 0.34, 0.2, 0.2, 0, head + 0.1, 0.1, 0, 0.5);
      // The vision panel over the head: wire glass with a light behind it, dark
      // in half the rooms. It is the Ward's equivalent of the transom grille.
      put(steelDark, 0.72, 0.3, 0.13, 0, head + 0.42, 0.09, 0, 0.3);
      batch.add(ctx.materials.get('glassWire'), quad(0.6, 0.2), poseMatrix(at(0, head + 0.42, 0.16), yaw), FLAT_OPTS);
      // Hazard kick strip across the sill, and rubber bumpers at trolley height.
      put(hazardMat, opening.width + 0.14, 0.05, 0.3, 0, 0.024, 0.1, 0, 0.35);
      for (const s of [-1, 1]) {
        put(rubberMat, 0.1, 0.12, 0.16, s * (half + 0.2), 0.9, 0.11, 0, 0.2);
      }
      // A serial plate, small, low, on one jamb only.
      put(stencilMat, 0.15, 0.09, 0.02, half + 0.2, 1.45, 0.19, 0, 0.2);
    } else if (mouthStyle === 'arch') {
      // A brick relieving arch over a stone impost. The voussoirs are ROLLED to
      // the ring: an arch built from axis-aligned boxes is a chain of cubes
      // (docs/art/ROOM_REVIEW.md - the Heartwood pass).
      const voussoirs = 11;
      const radius = half + 0.16;
      for (let i = 0; i < voussoirs; i++) {
        const a = Math.PI * ((i + 0.5) / voussoirs);
        const roll = a - Math.PI / 2;
        put(
          brickMat,
          0.22,
          0.34,
          0.26,
          -Math.cos(a) * radius,
          head + 0.04 + Math.sin(a) * radius * 0.52,
          0.11,
          -roll * 0.62,
          0.3,
        );
      }
      // The imposts the arch springs from, and a keystone at the crown.
      for (const s of [-1, 1]) {
        put(stoneMat, 0.34, 0.16, 0.3, s * (half + 0.1), head + 0.02, 0.13, 0, 0.3);
        put(brickMat, 0.26, head, 0.22, s * (half + 0.12), head / 2, 0.09, 0, 0.5);
      }
      put(stoneMat, 0.3, 0.34, 0.3, 0, head + 0.42, 0.13, 0, 0.3);
      // A stone step worn into a dish, because everyone has crossed it.
      put(stoneMat, opening.width + 0.24, 0.05, 0.4, 0, 0.024, 0.13, 0, 0.4);
    } else {
      // The Programme: a bulkhead ring clamped into the opening, with a row of
      // dogs round it and the crust coming through where the gasket failed.
      for (const s of [-1, 1]) {
        put(steelDark, 0.18, head + 0.3, 0.26, s * (half + 0.09), (head + 0.3) / 2, 0.13, 0, 0.4);
      }
      put(steelDark, opening.width + 0.4, 0.22, 0.26, 0, head + 0.11, 0.13, 0, 0.5);
      const dogs = 9;
      for (let i = 0; i < dogs; i++) {
        const a = Math.PI * (i / (dogs - 1));
        const dx = -Math.cos(a) * (half + 0.19);
        const dy = 0.24 + Math.sin(a) * (head - 0.1);
        batch.add(steelMat, cyl(0.035, 0.035, 0.16, 5), tiltMatrix(at(dx, dy, 0.24), [Math.PI / 2, yaw, 0]), {
          tile: 0.2,
          castShadow: false,
        });
        batch.add(ctx.materials.get('surface.resin'), boxGeometry(0.2, 0.15, 0.1), tiltMatrix(at(dx, dy - 0.2, 0.15), [0, yaw, a]), {
          tile: 0.3,
          castShadow: false,
        });
      }
      put(ctx.materials.get('surface.resin'), opening.width + 0.3, 0.16, 0.14, 0, head + 0.24, 0.1, 0, 0.3);
      put(hazardMat, opening.width + 0.1, 0.05, 0.28, 0, 0.024, 0.1, 0, 0.3);
    }
  }

  /**
   * A port: an aperture in a wall the generator can never open. This pack's
   * window, its peephole and its one-way glass - and in the case of `mirror` its
   * most important object, because the whole premise of the Ward is that
   * somebody was watching.
   */
  function buildPort(
    spec: PortSpec,
    side: Side,
    cx: number,
    cz: number,
    opening: { width: number; y0: number; y1: number },
  ): void {
    const { yaw, at } = frame(side, cx, cz);
    const h = opening.y1 - opening.y0;
    const midY = (opening.y0 + opening.y1) / 2;
    const kind = spec.kind ?? 'bars';
    const rng = ctx.rng;

    const put = (
      material: THREE.Material,
      w: number,
      hh: number,
      d: number,
      along: number,
      y: number,
      depth: number,
      tile = 0.6,
    ): void => {
      batch.add(material, boxGeometry(w, hh, d), poseMatrix(at(along, y, depth), yaw), { tile, castShadow: false });
    };

    /** A single-sided plane facing INTO the room. `yaw` alone - see `wash()`. */
    const pane = (material: THREE.Material, w: number, hh: number, along: number, y: number, depth: number): void => {
      batch.add(material, quad(w, hh), poseMatrix(at(along, y, depth), yaw), FLAT_OPTS);
    };

    /** A run of vertical bars across the opening, which is most of this pack. */
    const bars = (count: number, radius: number, depth: number, material: THREE.Material): void => {
      for (let i = 0; i < count; i++) {
        const bx = -opening.width / 2 + (opening.width * (i + 0.5)) / count;
        batch.add(material, cyl(radius, radius, h + 0.06, 5), poseMatrix(at(bx, midY, depth)), { tile: 0.2, castShadow: false });
      }
    };

    if (kind === 'judas') {
      /**
       * An observation hatch: a small square of black at eye height with a
       * hinged shroud swung open over it, and the inside of a cell behind.
       *
       * It is the cheapest port in the pack and the most effective, because it
       * is the one that looks back. The backdrop sits close - 0.5 m - so what
       * you see through a 26 cm hole is a plausible amount of room.
       */
      pane(ctx.materials.get('backdropCell'), opening.width + 0.5, h + 0.5, 0, midY, -0.5);
      // The reveal: four faces of the hole, so it has thickness.
      for (const s of [-1, 1]) {
        put(steelDark, 0.04, h, 0.5, (s * opening.width) / 2, midY, -0.24, 0.2);
        put(steelDark, opening.width, 0.04, 0.5, 0, midY + (s * h) / 2, -0.24, 0.2);
      }
      // The escutcheon and its shroud, hanging open on one hinge.
      put(ironMat, opening.width + 0.26, h + 0.26, 0.06, 0, midY, 0.03, 0.3);
      batch.add(ironPale, boxGeometry(opening.width + 0.2, h + 0.2, 0.03), tiltMatrix(at(-opening.width * 0.75, midY, 0.12), [0, yaw + 0.9, 0]), {
        tile: 0.3,
        castShadow: false,
      });
      // Two bars across it, because even a peephole in this building has bars.
      for (const y of [midY - h * 0.2, midY + h * 0.2]) put(ironMat, opening.width, 0.022, 0.05, 0, y, 0.02, 0.15);
      put(stencilMat, 0.2, 0.1, 0.02, 0, opening.y0 - 0.14, 0.04, 0.2);
    } else if (kind === 'bars') {
      /**
       * The barred window: the one view out of the building in the whole pack,
       * and deliberately not a way out - a yard, a wall too high to see over,
       * and a tower looking somewhere else.
       *
       * Five layers front to back, and the order is the whole thing: the guard
       * bars, the sash, a haze volume, the yard, and a splayed masonry reveal
       * round all of it. Nothing translucent ever goes in front of something
       * lit, so the haze sits behind the glass.
       */
      const back = -1.0;
      pane(ctx.materials.get('backdropYard'), opening.width + 1.4, h + 1.2, 0, midY + 0.05, back);
      pane(ctx.materials.get('dust'), opening.width + 0.4, h + 0.3, 0, midY, back * 0.4);
      // The splayed reveal: a window in a half-metre wall has real depth, and
      // the splay is what shows it.
      for (const s of [-1, 1]) {
        batch.add(wallMat, boxGeometry(0.36, h + 0.5, 0.9), tiltMatrix(at((s * (opening.width + 0.3)) / 2, midY, -0.42), [0, yaw + s * 0.16, 0]), {
          tile: wallTile,
          castShadow: false,
        });
      }
      put(wallMat, opening.width + 0.9, 0.3, 0.9, 0, opening.y1 + 0.16, -0.42, wallTile);
      // The sill: stone, sloping, with a lead flashing and a puddle in it.
      put(stoneMat, opening.width + 0.7, 0.14, 0.86, 0, opening.y0 - 0.06, -0.36, 0.5);
      put(leadMat, opening.width + 0.4, 0.03, 0.5, 0, opening.y0 + 0.02, -0.2, 0.4);
      // The sash: a rusted casement with small panes, most of them gone.
      put(ironMat, opening.width, 0.05, 0.06, 0, midY, -0.14, 0.3);
      for (let i = 0; i < 3; i++) {
        put(i === 1 ? rustMat : ironMat, 0.04, h, 0.06, -opening.width / 2 + (opening.width * (i + 1)) / 4, midY, -0.14, 0.2);
      }
      batch.add(ctx.materials.get('glassWire'), quad(opening.width - 0.06, h - 0.06), poseMatrix(at(0, midY, -0.12), yaw), FLAT_OPTS);
      // The guard bars, inside the room, and a heavier frame round them.
      bars(spec.tall ? 7 : 5, 0.026, 0.08, ironMat);
      put(ironMat, opening.width + 0.16, 0.06, 0.12, 0, opening.y1 + 0.02, 0.07, 0.3);
      put(ironMat, opening.width + 0.16, 0.06, 0.12, 0, opening.y0 - 0.02, 0.07, 0.3);
      for (const s of [-1, 1]) put(ironMat, 0.06, h + 0.14, 0.12, (s * (opening.width + 0.14)) / 2, midY, 0.07, 0.3);
    } else if (kind === 'mirror') {
      /**
       * One-way glass, with the observation cell lit behind it.
       *
       * The ONE lit picture in the pack. Everything else a player looks at is
       * dark; this is bright, it has a person in it, and the person is turned
       * toward a piece of glass they cannot see through. The mirror material is
       * metallic enough to take a hard specular from the gallery's own lamp, so
       * from a shallow angle it becomes a mirror and the picture disappears -
       * which is exactly what one-way glass does.
       */
      pane(ctx.materials.get('backdropObserved'), opening.width + 0.3, h + 0.3, 0, midY, -0.75);
      // The chamber the picture sits in: four dark returns, so it is a box with
      // a lit back rather than a poster hung on the wall.
      for (const s of [-1, 1]) {
        put(steelDark, 0.05, h + 0.3, 0.78, (s * (opening.width + 0.05)) / 2, midY, -0.38, 0.3);
        put(steelDark, opening.width + 0.1, 0.05, 0.78, 0, midY + (s * (h + 0.3)) / 2, -0.38, 0.3);
      }
      batch.add(ctx.materials.get('glassMirror'), quad(opening.width, h), poseMatrix(at(0, midY, 0.02), yaw), FLAT_OPTS);
      // Two raked highlights on the glass: the thing that makes a pane read as
      // a pane rather than as a hole. They are 3 cm and 2 cm of the width, not a
      // third of it - the first pass drew them at a tenth and a twentieth of a
      // two-metre pane and buried the one lit picture in the map behind two grey
      // bars.
      for (const [hx, hw] of [[-0.3, 0.035], [0.24, 0.018]] as const) {
        batch.add(ctx.materials.get('glassCrack'), quad(hw * opening.width, h * 0.92), tiltMatrix(at(hx * opening.width, midY, 0.035), [0, yaw, 0.17]), FLAT_OPTS);
      }
      // A heavy surround, bolted, with a shelf under it and an ashtray on it.
      put(surgicalMat, opening.width + 0.34, 0.16, 0.24, 0, opening.y1 + 0.08, 0.07, 0.5);
      put(surgicalMat, opening.width + 0.34, 0.2, 0.3, 0, opening.y0 - 0.1, 0.1, 0.5);
      for (const s of [-1, 1]) put(surgicalMat, 0.17, h + 0.36, 0.24, (s * (opening.width + 0.17)) / 2, midY, 0.07, 0.5);
      put(steelDark, opening.width + 0.5, 0.05, 0.34, 0, opening.y0 - 0.24, 0.17, 0.4);
      put(ctx.materials.get('glassEdge'), 0.16, 0.05, 0.14, opening.width * 0.3, opening.y0 - 0.19, 0.2, 0.2);
      put(stencilMat, 0.28, 0.1, 0.02, -opening.width * 0.3, opening.y0 - 0.18, 0.21, 0.2);
    } else if (kind === 'grille') {
      // A pressure-relief louvre onto a service shaft. Cold air comes out of it
      // and the wall under it is stained where forty years of that has run down.
      pane(ctx.materials.get('backdropShaft'), opening.width + 0.4, h + 0.4, 0, midY, -0.45);
      put(steelDark, opening.width + 0.2, h + 0.2, 0.09, 0, midY, 0.01, 0.4);
      const slats = 5;
      for (let i = 0; i < slats; i++) {
        const y = opening.y0 + (h * (i + 0.5)) / slats;
        batch.add(ironMat, boxGeometry(opening.width, 0.08, 0.16), tiltMatrix(at(0, y, 0.07), [0.55, yaw, 0]), {
          tile: 0.4,
          castShadow: false,
        });
      }
      // The stain plume below it, and a wire guard over the whole thing.
      put(ctx.materials.get('mould'), opening.width * 0.8, 0.9, 0.012, 0, opening.y0 - 0.5, -0.01, 0.7);
      batch.add(ironMat, ring(Math.min(opening.width, h) * 0.5, 0.014, 8), poseMatrix(at(0, midY, 0.1), yaw), {
        tile: 0.2,
        castShadow: false,
      });
    } else if (kind === 'lancet') {
      /**
       * The chapel window. Three lancets of stained glass, a stone reveal, iron
       * ferramenta across the outside, and NO light of its own - it is a picture,
       * unlit, so it survives the dark and never becomes the room's lamp. The
       * chapel is lit by the candles under it, which is the whole design.
       */
      pane(ctx.materials.get('backdropGlass'), opening.width, h, 0, midY, -0.06);
      // A splayed stone reveal, deeper than any other port in the pack.
      for (const s of [-1, 1]) {
        batch.add(stoneMat, boxGeometry(0.4, h + 0.7, 0.8), tiltMatrix(at((s * (opening.width + 0.34)) / 2, midY, -0.3), [0, yaw + s * 0.2, 0]), {
          tile: 0.6,
          castShadow: false,
        });
      }
      // The arched head, as rolled voussoirs on a real ring.
      const ring2 = 9;
      for (let i = 0; i < ring2; i++) {
        const a = Math.PI * ((i + 0.5) / ring2);
        put(stoneMat, 0.3, 0.34, 0.44, -Math.cos(a) * (opening.width / 2 + 0.2), opening.y1 + Math.sin(a) * 0.42, -0.1, 0.4);
      }
      put(stoneMat, opening.width + 0.9, 0.2, 0.7, 0, opening.y0 - 0.1, -0.24, 0.5);
      // Two mullions in front of the glass, and the ferramenta across it.
      for (const s of [-1, 1]) put(stoneMat, 0.14, h + 0.1, 0.24, (s * opening.width) / 6, midY, 0.03, 0.3);
      for (let i = 0; i < 4; i++) {
        put(ironMat, opening.width, 0.022, 0.03, 0, opening.y0 + (h * (i + 0.5)) / 4, 0.06, 0.2);
      }
      // A boarded pane, low left, where something came through it.
      put(timberMat, opening.width * 0.24, 0.34, 0.04, -opening.width * 0.32, opening.y0 + 0.3, 0.05, 0.3);
    } else {
      /**
       * A serving hatch with the roller shutter half down. The half-open state is
       * the point: it says the building stopped mid-service rather than being
       * closed up.
       */
      pane(ctx.materials.get('backdropShaft'), opening.width + 0.3, h + 0.3, 0, midY, -0.5);
      put(steelDark, opening.width + 0.26, 0.2, 0.28, 0, opening.y1 + 0.1, 0.07, 0.4);
      for (const s of [-1, 1]) put(steelDark, 0.14, h + 0.2, 0.26, (s * (opening.width + 0.14)) / 2, midY, 0.06, 0.3);
      // The shutter: five slats hanging down from the head, stopping short.
      const drop = h * (0.32 + rng() * 0.24);
      for (let i = 0; i < 5; i++) {
        put(ironPale, opening.width, drop / 5 - 0.012, 0.05, 0, opening.y1 - (drop * (i + 0.5)) / 5, 0.02, 0.25);
      }
      put(ironMat, opening.width + 0.04, 0.05, 0.09, 0, opening.y1 - drop, 0.03, 0.2);
      // The counter under it, and a stack of trays left on it.
      put(surgicalMat, opening.width + 0.5, 0.07, 0.42, 0, opening.y0 - 0.04, -0.06, 0.5);
      put(ctx.materials.get('enamel'), 0.4, 0.13, 0.3, opening.width * 0.26, opening.y0 + 0.06, -0.08, 0.3);
    }

    if (spec.light) {
      const colour = kind === 'mirror' ? 0xcaf0dc : kind === 'lancet' ? 0x8ea6c0 : kind === 'bars' ? 0x9ab4d0 : 0xa8bcc8;
      const lamp = new THREE.PointLight(colour, kind === 'mirror' ? 9 : kind === 'bars' ? 10 : 7, cellSize * 1.6, 2);
      /**
       * A window's lamp stands just inside the room; a MIRROR's stands behind the
       * glass, in the chamber, because the whole premise is that the other side is
       * the lit one. The first pass put it half a metre in front of the pane and
       * blew the only lit picture in the map to a flat grey rectangle - the same
       * failure as an emissive tuned in isolation, arriving through a light.
       */
      lamp.position.set(...at(0, midY, kind === 'mirror' ? -0.42 : 0.5));
      extra.add(lamp);
      lights.push(lamp);
    }

    portAnchors.push({ position: at(0, midY, 0), side, kind });
  }

  /* --- per cell -------------------------------------------------------------- */
  for (const [gx, gy] of footprint) {
    const cx = gx * cellSize;
    const cz = gy * cellSize;

    batch.add(floorMat, boxGeometry(cellSize, 0.12, cellSize), poseMatrix([cx, -0.06, cz]), {
      tile: floorTile,
      castShadow: false,
    });
    if (ceilingStyle !== 'open') {
      batch.add(ceilMat, boxGeometry(cellSize, 0.12, cellSize), poseMatrix([cx, ceilingHeight + 0.06, cz]), {
        tile: ceilTile,
        castShadow: false,
      });
    }

    switch (ceilingStyle) {
      case 'joist': {
        // Downstand beams across the short way, with a chamfer on the arris.
        for (let i = 0; i < 3; i++) {
          const z = cz - cellSize / 2 + cellSize * ((i + 0.5) / 3);
          const y = ceilingHeight - 0.24;
          batch.add(ceilMat, boxGeometry(cellSize, 0.24, 0.4), poseMatrix([cx, y + 0.12, z]), { tile: 1.1, ...CEILING_OPTS });
          for (const s of [-1, 1]) {
            batch.add(ceilMat, boxGeometry(cellSize, 0.1, 0.1), tiltMatrix([cx, y + 0.03, z + s * 0.2], [0, 0, 0], [1, 1, 1]), {
              tile: 0.5,
              ...CEILING_OPTS,
            });
          }
          // The lamp conduit that runs along the underside of every one of them.
          batch.add(ironMat, cyl(0.024, 0.024, cellSize, 5), tiltMatrix([cx, y - 0.03, z], [0, 0, Math.PI / 2]), {
            tile: 0.4,
            ...CEILING_OPTS,
          });
        }
        break;
      }
      case 'mesh': {
        /**
         * Anti-suicide mesh: the single most recognisable ceiling in this genre,
         * and the reason a cell landing reads as a cell landing from any angle.
         *
         * A dark void plane above it and a grid of thin bars under, so what a
         * player sees is a lattice with black behind. Six by six rather than
         * twelve by twelve: at 3.4 m a finer grid reads as a grey haze, and this
         * is multiplied by every cell of every room that picks it.
         */
        batch.add(ctx.materials.get('steelDark'), boxGeometry(cellSize, 0.06, cellSize), poseMatrix([cx, ceilingHeight - 0.02, cz]), {
          tile: 1.4,
          ...CEILING_OPTS,
        });
        // Eight a way at 55 mm, not six at 35. The first pass was arithmetically
        // a lattice and visually a flat grey lid: at 3.4 m a bar has to have some
        // width to survive being a silhouette against the dark above it.
        const n = 8;
        for (let i = 0; i < n; i++) {
          const t = -cellSize / 2 + (cellSize * (i + 0.5)) / n;
          batch.add(ironMat, boxGeometry(cellSize, 0.055, 0.055), poseMatrix([cx, ceilingHeight - 0.15, cz + t]), {
            tile: 0.4,
            ...CEILING_OPTS,
          });
          batch.add(ironMat, boxGeometry(0.055, 0.055, cellSize), poseMatrix([cx + t, ceilingHeight - 0.21, cz]), {
            tile: 0.4,
            ...CEILING_OPTS,
          });
        }
        // The angle the mesh is stretched on, all four sides.
        for (const s of [-1, 1]) {
          batch.add(ironMat, boxGeometry(cellSize, 0.1, 0.08), poseMatrix([cx, ceilingHeight - 0.16, cz + s * (cellSize / 2 - 0.2)]), {
            tile: 0.5,
            ...CEILING_OPTS,
          });
          batch.add(ironMat, boxGeometry(0.08, 0.1, cellSize), poseMatrix([cx + s * (cellSize / 2 - 0.2), ceilingHeight - 0.16, cz]), {
            tile: 0.5,
            ...CEILING_OPTS,
          });
        }
        break;
      }
      case 'pipes': {
        // Bundled service runs at two heights with hanger straps and lagging.
        // The fastest way to make a ceiling read as plant rather than as a lid.
        const radii = [0.14, 0.08, 0.11, 0.05];
        for (let i = 0; i < 4; i++) {
          const z = cz - cellSize / 2 + cellSize * ((i + 0.7) / 4.6);
          const y = ceilingHeight - 0.3 - (i % 2) * 0.16;
          const radius = radii[i] ?? 0.1;
          batch.add(
            i % 3 === 0 ? ctx.materials.get('copper') : leadMat,
            cyl(radius, radius, cellSize, 7),
            tiltMatrix([cx, y, z], [0, 0, Math.PI / 2]),
            { tile: 0.6, ...CEILING_OPTS },
          );
          for (const t of [-0.28, 0.16]) {
            batch.add(
              ctx.materials.get('canvas'),
              cyl(radius * 1.5, radius * 1.5, 0.18, 7),
              tiltMatrix([cx + t * cellSize, y, z], [0, 0, Math.PI / 2]),
              { tile: 0.3, ...CEILING_OPTS },
            );
          }
          for (const t of [-0.34, 0.02, 0.36]) {
            batch.add(steelDark, boxGeometry(0.045, 0.34, radius * 2.6), poseMatrix([cx + t * cellSize, ceilingHeight - 0.16, z]), {
              tile: 0.3,
              ...CEILING_OPTS,
            });
          }
        }
        break;
      }
      case 'vault': {
        /**
         * A shallow brick barrel, sampled as fifteen rolled staves rather than as
         * five unrotated boxes: a curve sampled too coarsely reads as blocks
         * floating under the ceiling rather than as vaulting
         * (docs/art/ROOM_REVIEW.md - the mansion pass).
         */
        const steps = 15;
        const rise = 0.62;
        for (let i = 0; i < steps; i++) {
          const t = (i + 0.5) / steps;
          const a = (t - 0.5) * Math.PI;
          const z = cz + Math.sin(a) * (cellSize / 2);
          const drop = rise * Math.cos(a);
          batch.add(brickMat, boxGeometry(cellSize, 0.26, (cellSize / steps) * 1.5), tiltMatrix([cx, ceilingHeight - drop, z], [0, 0, 0], [1, 1, 1]), {
            tile: tex.BRICK_TILE,
            ...CEILING_OPTS,
          });
        }
        // Two transverse arch ribs, standing proud of the barrel.
        for (const t of [-0.32, 0.32]) {
          for (let i = 0; i < steps; i++) {
            const s2 = (i + 0.5) / steps;
            const a = (s2 - 0.5) * Math.PI;
            batch.add(stoneMat, boxGeometry(0.34, 0.2, (cellSize / steps) * 1.4), poseMatrix([cx + t * cellSize, ceilingHeight - rise * Math.cos(a) - 0.1, cz + Math.sin(a) * (cellSize / 2)]), {
              tile: 0.4,
              ...CEILING_OPTS,
            });
          }
        }
        break;
      }
      case 'lath': {
        // Sagging lath and plaster with one patch fallen out of it, showing the
        // joists and the dark above. A ceiling with a hole in it is worth four
        // ceilings without one.
        for (let i = 0; i < 4; i++) {
          const z = cz - cellSize / 2 + cellSize * ((i + 0.5) / 4);
          batch.add(timberMat, boxGeometry(cellSize, 0.16, 0.1), poseMatrix([cx, ceilingHeight - 0.09, z]), {
            tile: 0.7,
            ...CEILING_OPTS,
          });
        }
        // The failed patch: a dark void and a fringe of broken lath round it.
        const hx = cx + (ctx.rng() - 0.5) * cellSize * 0.4;
        const hz = cz + (ctx.rng() - 0.5) * cellSize * 0.4;
        batch.add(ctx.materials.get('steelDark'), boxGeometry(1.9, 0.05, 1.5), poseMatrix([hx, ceilingHeight - 0.03, hz]), {
          tile: 0.8,
          ...CEILING_OPTS,
        });
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          batch.add(timberMat, boxGeometry(0.5, 0.03, 0.06), tiltMatrix([hx + Math.cos(a) * 0.85, ceilingHeight - 0.1, hz + Math.sin(a) * 0.68], [0.2, a, 0.1]), {
            tile: 0.2,
            ...CEILING_OPTS,
          });
        }
        break;
      }
      case 'gantry': {
        // An upper landing running overhead: the thing that makes a cell hall
        // read as a hall with tiers rather than as a wide corridor. Deck plate,
        // a lattice of stringers under it, and a rail along the near edge.
        for (const s of [-1, 1]) {
          const z = cz + s * (cellSize * 0.34);
          batch.add(ctx.materials.get('surface.rivet'), boxGeometry(cellSize, 0.09, 1.5), poseMatrix([cx, ceilingHeight - 0.5, z]), {
            tile: tex.RIVET_TILE,
            ...CEILING_OPTS,
          });
          batch.add(ironMat, boxGeometry(cellSize, 0.22, 0.09), poseMatrix([cx, ceilingHeight - 0.62, z - s * 0.74]), {
            tile: 0.6,
            ...CEILING_OPTS,
          });
          for (let i = 0; i < 6; i++) {
            const bx = cx - cellSize / 2 + (cellSize * (i + 0.5)) / 6;
            batch.add(ironMat, cyl(0.022, 0.022, 0.62, 5), poseMatrix([bx, ceilingHeight - 0.14, z - s * 0.74]), {
              tile: 0.2,
              ...CEILING_OPTS,
            });
            batch.add(ironMat, boxGeometry(0.07, 0.34, 1.4), poseMatrix([bx, ceilingHeight - 0.72, z]), { tile: 0.3, ...CEILING_OPTS });
          }
          batch.add(ironMat, boxGeometry(cellSize, 0.05, 0.05), poseMatrix([cx, ceilingHeight - 0.14, z - s * 0.74]), {
            tile: 0.4,
            ...CEILING_OPTS,
          });
        }
        break;
      }
      case 'open':
        break;
      case 'soffit':
      default: {
        // A plain concrete soffit with one duct run, a lamp rose and a leak. The
        // cheapest ceiling in the pack, and most rooms use it.
        batch.add(ctx.materials.get('surface.enamel'), boxGeometry(0.8, 0.3, cellSize), poseMatrix([cx - cellSize * 0.26, ceilingHeight - 0.16, cz]), {
          tile: tex.ENAMEL_TILE,
          ...CEILING_OPTS,
        });
        batch.add(steelDark, boxGeometry(0.9, 0.05, cellSize), poseMatrix([cx - cellSize * 0.26, ceilingHeight - 0.33, cz]), {
          tile: 0.5,
          ...CEILING_OPTS,
        });
        for (const t of [-0.28, 0.3]) {
          batch.add(ironMat, cyl(0.03, 0.03, cellSize, 5), tiltMatrix([cx + cellSize * 0.22, ceilingHeight - 0.08, cz + t * cellSize], [0, 0, Math.PI / 2]), {
            tile: 0.4,
            ...CEILING_OPTS,
          });
        }
        batch.add(ctx.materials.get('mould'), boxGeometry(1.6, 0.02, 1.2), poseMatrix([cx + cellSize * 0.2, ceilingHeight - 0.02, cz - cellSize * 0.18]), {
          tile: 1.0,
          ...CEILING_OPTS,
        });
        break;
      }
    }

    for (const side of SIDES) {
      const step = NEIGHBOUR[side];
      if (occupied.has(`${gx + step[0]},${gy + step[1]}`)) continue; // interior edge: open

      const hasDoor = (ctx.doors[doorKey([gx, gy], side)] ?? 'none') !== 'none';
      const port = hasDoor ? undefined : portFor([gx, gy], side);

      let opening: { width: number; y0: number; y1: number } | null = null;
      if (hasDoor) opening = { width: doorWidth, y0: 0, y1: doorHeight };
      else if (port) {
        const kind = port.kind ?? 'bars';
        // Every one of these starts well above the floor, so the wall keeps one
        // collider across its whole run. A decorative opening must never be a
        // hole a player can walk into (docs/art/ROOM_REVIEW.md).
        if (kind === 'judas') opening = { width: 0.3, y0: 1.36, y1: 1.66 };
        else if (kind === 'mirror') opening = { width: 2.1, y0: 0.98, y1: 2.08 };
        else if (kind === 'grille') opening = { width: 0.95, y0: 2.1, y1: 2.7 };
        else if (kind === 'lancet') opening = { width: 2.4, y0: 0.96, y1: ceilingHeight - 0.55 };
        else if (kind === 'hatch') opening = { width: 1.7, y0: 1.0, y1: 1.95 };
        else opening = port.tall ? { width: 2.6, y0: 0.9, y1: ceilingHeight - 0.6 } : { width: 1.5, y0: 1.2, y1: 2.3 };
      }

      const slabs = slabsFor(cellSize, ceilingHeight, opening);
      for (const slab of slabs) wallSlab(side, cx, cz, slab);
      wallTrim(side, cx, cz, slabs, port !== undefined);

      if (hasDoor && opening) mouth(side, cx, cz, opening);
      if (port && opening) buildPort(port, side, cx, cz, opening);
    }
  }

  return { colliders, lights, extra, portAnchors };
}

/**
 * The contract-facing kit. Blackgate rooms call `addShell()` directly so they can
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
