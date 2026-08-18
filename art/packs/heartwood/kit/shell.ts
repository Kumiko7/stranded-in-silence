/**
 * Heartwood's shell: floors, ceilings, walls, trim, doorways and ports.
 *
 * Every room calls this first and then decorates, which is what guarantees door
 * openings line up between neighbours no matter who authored the rooms either
 * side. The style options are the pack's main lever for variety: the same
 * function builds a carved elven hall and a rotten bark canyon.
 *
 * Five things worth knowing before you use it:
 *
 * - It writes into a `MeshBatcher` rather than building meshes. A Heartwood room
 *   is several hundred boxes of board, root and bark; batched, that is a handful
 *   of draw calls. See `art/lib/merge.ts`.
 * - **Every opening gets a mouth.** A doorway in the Bower is a carved arch with
 *   fluted jambs, a foliate head and a boss; one in the Thicket is a place where
 *   the wood *parted*, ringed with lipped bark and a drip of set sap; a burrow
 *   door is a banded round ring with a stone sill. That ring is in every view of
 *   every room in the pack - a contact sheet stands its cameras in doorways, and
 *   so does a player - which is why it lives in the shell rather than being left
 *   to each room.
 * - **Every room gets a register.** This is the pack's other repeatable trick: a
 *   course along the base of every wall carrying the light this map navigates by.
 *   In the Bower it is a **sapline** - a carved channel of live resin with tapped
 *   phials hanging off it. In the Thicket it is a **weep** - a split in the wood
 *   with foxfire growing in the wound. In the Bloom it is a violet lace. It costs
 *   no light budget, it is the same object in three materials, and it is what
 *   guarantees the rule in ROOM_FORMAT.md §6: a player with no torch can always
 *   read the layout and find the doors.
 * - **A port may only go on a side the blueprint never opens as a door.** The
 *   generator decides doors at run time, so the only walls guaranteed solid are
 *   the ones missing from `doorWalls`. Passing `doorWalls` in lets the shell
 *   throw immediately rather than shipping a room with a window in a doorway.
 *   Every port opening starts above the floor, so the wall keeps one collider
 *   across its whole run - a decorative hole must never be a hole in the wall
 *   (docs/art/ROOM_REVIEW.md).
 * - **A knothole leans about 1.1 m out of its room** to hold the view behind the
 *   glass. That is deliberate and handled - a room is culled by the cells its
 *   geometry reaches, not the cells it occupies (ROOM_FORMAT.md §7).
 */
import * as THREE from 'three';
import type { BuiltPiece, Cell, Collider, PackKit, RoomBuildContext, Side } from '../../../lib/contract';
import { SIDES, doorKey } from '../../../lib/contract';
import { boxCollider, boxGeometry } from '../../../lib/build';
import { MeshBatcher, poseMatrix, tiltMatrix } from '../../../lib/merge';
import * as tex from '../textures';

export type FloorStyle = 'parquet' | 'plank' | 'moss' | 'loam' | 'root' | 'bark' | 'pulp' | 'rot' | 'silk';
export type WallStyle = 'heart' | 'birch' | 'lattice' | 'wicker' | 'clay' | 'bark' | 'pulp' | 'rot' | 'fungus' | 'silk' | 'bloom';
export type CeilingStyle = 'rafters' | 'vault' | 'boughs' | 'roots' | 'canopy' | 'web' | 'knots' | 'open';
/** The lower band of the wall, where a different material takes over. */
export type BandStyle = 'none' | 'plank' | 'wicker' | 'bark' | 'lattice' | 'heart' | 'clay' | 'root' | 'pulp';
/** What the ring around a doorway is made of. */
export type MouthStyle = 'carved' | 'grown' | 'burrow' | 'none';
/**
 * The register: the pack's signature course along the base of every wall.
 * `sapline` and `weep` are the two halves of the map; `bloomvein` is the third
 * strand; `comb` is the apiary's variant, which is the same idea built by bees.
 */
export type RegisterStyle = 'none' | 'sapline' | 'weep' | 'bloomvein' | 'comb';

export type PortKind = 'knothole' | 'pane' | 'niche' | 'webbed' | 'hive' | 'burst' | 'shutter';
/** What is on the far side of a knothole or a pane. */
export type PortScene = 'hollow' | 'forest' | 'canopy' | 'roots';

export interface PortSpec {
  readonly cell?: Cell;
  readonly side: Side;
  readonly kind?: PortKind;
  readonly scene?: PortScene;
  /** Adds a practical behind it. Counts against the room's light budget. */
  readonly light?: boolean;
  /** Floor-to-near-ceiling, for a room that wants one wall to be mostly window. */
  readonly tall?: boolean;
}

export interface ShellOptions {
  readonly floor?: FloorStyle;
  readonly wall?: WallStyle;
  readonly ceiling?: CeilingStyle;
  readonly band?: BandStyle;
  /** Height the band reaches. Default 1.05 m. */
  readonly bandHeight?: number;
  /** The skirting / talus where wall meets floor. On by default. */
  readonly kick?: boolean;
  /** A carved dado rail at hand height, the way a finished hall is fitted out. */
  readonly rail?: boolean;
  /** The cornice where wall meets ceiling. On by default. */
  readonly seam?: boolean;
  readonly mouth?: MouthStyle;
  readonly register?: RegisterStyle;
  /** A room standing over live sap or an open wound: the register runs a stage brighter. */
  readonly hot?: boolean;
  readonly ports?: readonly PortSpec[];
  /** Sides the blueprint may open. Required if `ports` is set. */
  readonly doorWalls?: readonly { readonly cell: Cell; readonly side: Side }[];
}

const FLOOR_MATERIAL: Record<FloorStyle, [string, number]> = {
  parquet: ['surface.parquet', tex.PARQUET_TILE],
  plank: ['surface.plank', tex.PLANK_TILE],
  moss: ['surface.moss', tex.MOSS_TILE],
  loam: ['surface.loam', tex.LOAM_TILE],
  root: ['surface.root', tex.ROOT_TILE],
  bark: ['surface.bark', tex.BARK_TILE],
  pulp: ['surface.pulp', tex.PULP_TILE],
  rot: ['surface.rot', tex.ROT_TILE],
  silk: ['surface.silk', tex.SILK_TILE],
};

const WALL_MATERIAL: Record<WallStyle, [string, number]> = {
  heart: ['surface.heart', tex.HEART_TILE],
  birch: ['surface.birch', tex.BIRCH_TILE],
  lattice: ['surface.lattice', tex.LATTICE_TILE],
  wicker: ['surface.wicker', tex.WICKER_TILE],
  clay: ['surface.clay', tex.CLAY_TILE],
  bark: ['surface.bark', tex.BARK_TILE],
  pulp: ['surface.pulp', tex.PULP_TILE],
  rot: ['surface.rot', tex.ROT_TILE],
  fungus: ['surface.fungus', tex.FUNGUS_TILE],
  silk: ['surface.silk', tex.SILK_TILE],
  bloom: ['surface.bloom', tex.BLOOM_TILE],
};

const BAND_MATERIAL: Record<Exclude<BandStyle, 'none'>, [string, number]> = {
  plank: ['surface.plank', tex.PLANK_TILE],
  wicker: ['surface.wicker', tex.WICKER_TILE],
  bark: ['surface.bark', tex.BARK_TILE],
  lattice: ['surface.lattice', tex.LATTICE_TILE],
  heart: ['surface.heart', tex.HEART_TILE],
  clay: ['surface.clay', tex.CLAY_TILE],
  root: ['surface.root', tex.ROOT_TILE],
  pulp: ['surface.pulp', tex.PULP_TILE],
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
 * turned by this. That is what stops the class of bug where a head-piece built on
 * the north wall comes out inside-out on the east one: the sizes are never
 * swapped by hand, so there is nothing to swap wrongly.
 */
const FACE_IN: Record<Side, number> = {
  north: 0,
  east: -Math.PI / 2,
  south: Math.PI,
  west: Math.PI / 2,
};

const KICK_HEIGHT = 0.24;
const RAIL_Y = 1.04;

/**
 * Which wall styles somebody made. It decides the trim: a moulded skirting board
 * under a wall of raw bark reads as a cave with a dado rail in it, which is the
 * one thing this pack must never look like.
 */
const BUILT: ReadonlySet<WallStyle> = new Set<WallStyle>(['heart', 'birch', 'lattice', 'wicker', 'clay']);

/**
 * Anything up at the ceiling is ABOVE every light a room can hang, so all of it
 * casts a hard bar straight down across the floor it is decorating. Ceiling
 * treatment is therefore never a shadow caster - see docs/art/ROOM_REVIEW.md.
 */
const CEILING_OPTS = { castShadow: false } as const;

/** The vertical centre of an opening. */
const midOf = (opening: { y0: number; y1: number }): number => (opening.y0 + opening.y1) / 2;

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

  const [floorName, floorTile] = FLOOR_MATERIAL[options.floor ?? 'plank'];
  const wallStyle = options.wall ?? 'heart';
  const [wallName, wallTile] = WALL_MATERIAL[wallStyle];
  const bandStyle = options.band ?? 'none';
  const [bandName, bandTile] = bandStyle === 'none' ? WALL_MATERIAL[wallStyle] : BAND_MATERIAL[bandStyle];
  const bandHeight = options.bandHeight ?? 1.05;
  const built = BUILT.has(wallStyle);
  const mouthStyle = options.mouth ?? (built ? 'carved' : 'grown');
  const registerStyle = options.register ?? (built ? 'sapline' : 'weep');
  const ceilingStyle = options.ceiling ?? (built ? 'rafters' : 'knots');

  const floorMat = ctx.materials.get(floorName);
  const wallMat = ctx.materials.get(wallName);
  const bandMat = ctx.materials.get(bandName);
  const ceilingIsWood = ceilingStyle === 'rafters' || ceilingStyle === 'vault';
  const ceilMat = ctx.materials.get(ceilingIsWood ? 'surface.plank' : ceilingStyle === 'web' ? 'surface.silk' : 'surface.bark');
  const ceilTile = ceilingIsWood ? tex.PLANK_TILE : ceilingStyle === 'web' ? tex.SILK_TILE : tex.BARK_TILE;

  const timberMat = ctx.materials.get('timber');
  const timberPale = ctx.materials.get('timberPale');
  const timberDark = ctx.materials.get('timberDark');
  const rootMat = ctx.materials.get('root');
  const barkMat = ctx.materials.get('barkProp');
  const mossMat = ctx.materials.get('moss');
  const vineMat = ctx.materials.get('vine');
  const leafMat = ctx.materials.get('leaf');
  const boneMat = ctx.materials.get('bone');
  const copperMat = ctx.materials.get('copper');
  const silkMat = ctx.materials.get('silkProp');
  const sapMat = ctx.materials.get(options.hot ? 'surface.sapHot' : 'surface.sap');
  const foxMat = ctx.materials.get(options.hot ? 'surface.foxHot' : 'surface.fox');

  const occupied = new Set(footprint.map(([x, y]) => `${x},${y}`));
  const off = cellSize / 2 - wallThickness / 2;

  const ports = options.ports ?? [];
  if (ports.length && options.doorWalls) {
    for (const spec of ports) {
      const cell = spec.cell ?? ([0, 0] as const);
      const clash = options.doorWalls.some(
        (wall) => wall.side === spec.side && wall.cell[0] === cell[0] && wall.cell[1] === cell[1],
      );
      if (clash) throw new Error(`heartwood shell: port on ${cell}:${spec.side} collides with a declared doorWall`);
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
   * The trim: a skirting or a talus where wall meets floor, the register just
   * above it, an optional dado rail, and the cornice where wall meets ceiling.
   * All of it follows the same gaps as the wall, so nothing crosses a doorway -
   * and the register in particular must not, or the doorway stops being the
   * darkest thing on the wall and stops reading as a way out.
   */
  function wallTrim(side: Side, cx: number, cz: number, slabs: readonly Slab[], hasPort: boolean): void {
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
      tile = 1.0,
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

      if (options.kick !== false && slab.y0 < 0.01) {
        if (built) {
          // A moulded skirting: a plinth, a bead standing proud of it, and a
          // shadow gap over the top. The proud bead is what catches a grazing
          // lantern and gives the floor a hard edge to end on.
          strip(slab.offset, slab.width, 0, KICK_HEIGHT * 0.72, 0.07, timberDark, 0.7);
          strip(slab.offset, slab.width, KICK_HEIGHT * 0.72, 0.04, 0.105, timberMat, 0.45);
        } else {
          // Where the wall grew rather than being built there is a swell of root
          // and a drift of leaf litter against it, not a skirting board. Lumpy,
          // and it never sits at the same height twice.
          strip(slab.offset, slab.width, 0, KICK_HEIGHT * 0.5, 0.26, rootMat, 0.6);
          strip(slab.offset, slab.width, KICK_HEIGHT * 0.42, KICK_HEIGHT * 0.6, 0.14, barkMat, 0.55);
        }
      }

      /* --- the register: the thing that holds the pack together ------------- */
      if (registerStyle !== 'none' && slab.y0 < 0.01 && slab.y1 > 0.5) {
        const y = built ? 0.36 : 0.28;
        if (registerStyle === 'sapline') {
          // A channel cut into the wainscot with live resin standing in it, and
          // the collecting phials hung under it every half metre.
          //
          // The lit line runs at the MOUTH of the channel with the dark recess
          // behind it, not buried at the back where it is physically right and
          // completely invisible - a register a player cannot see is not doing
          // its job, whatever it costs (docs/art/ART_PACK_CHECKLIST.md).
          strip(slab.offset, slab.width, y - 0.08, 0.23, 0.04, timberDark, 0.4);
          strip(slab.offset, slab.width, y - 0.055, 0.15, 0.02, sapMat, 0.3);
          // The lit line is BEADS on a dark channel rather than a continuous
          // filament. A continuous strip at this brightness came back off the
          // first contact sheet as a strip light somebody had screwed to the
          // skirting board in every room in the Bower - the same finding as the
          // viscera nerve runs, three packs later (docs/art/ROOM_REVIEW.md).
          const beads = Math.max(2, Math.round(slab.width / 0.55));
          for (let i = 0; i < beads; i++) {
            const bx = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / beads;
            strip(bx, 0.16 + ((i * 17) % 5) / 40, y + 0.005, 0.035, 0.05, ctx.materials.get('lumenSap'), 0.2);
          }
          // The lip of the channel, and the drip spouts along it.
          strip(slab.offset, slab.width, y + 0.155, 0.05, 0.1, timberMat, 0.4);
          const spouts = Math.max(2, Math.round(slab.width / 0.62));
          for (let i = 0; i < spouts; i++) {
            const x = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / spouts;
            strip(x, 0.055, y - 0.2, 0.13, 0.075, copperMat, 0.2);
            strip(x, 0.03, y - 0.26, 0.07, 0.045, sapMat, 0.12);
          }
        } else if (registerStyle === 'weep') {
          // A split in the wood with the wound lit from inside it: nodules along
          // the line, not a line. A continuous glowing strip on a bark wall
          // reads as a strip light somebody screwed to the tree.
          strip(slab.offset, slab.width, y - 0.1, 0.26, 0.06, ctx.materials.get('pulpProp'), 0.45);
          const count = Math.max(2, Math.round(slab.width / 0.44));
          for (let i = 0; i < count; i++) {
            const x = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / count;
            const h = 0.075 + ((i * 37) % 7) / 58;
            strip(x, 0.19 + ((i * 13) % 5) / 28, y - h / 2, h, 0.095, foxMat, 0.24);
            // One bright core per other nodule. The crust alone was legible from
            // two metres and invisible from six, which is not a navigation light
            // - and finding the doors is the whole job of this course
            // (docs/art/ROOM_FORMAT.md 6).
            if (i % 2 === 0) strip(x, 0.09, y - 0.02, 0.05, 0.11, ctx.materials.get('lumenFox'), 0.12);
          }
          // The lips of the split, standing proud and dark, so the glow reads as
          // coming out of a wound rather than as a stripe painted on the bark.
          strip(slab.offset, slab.width, y + 0.1, 0.07, 0.13, barkMat, 0.4);
          strip(slab.offset, slab.width, y - 0.15, 0.06, 0.12, barkMat, 0.4);
        } else if (registerStyle === 'comb') {
          // Built by bees: a course of comb along the wall with the honey in it
          // lit. The one register that is neither cut nor torn.
          strip(slab.offset, slab.width, y - 0.1, 0.3, 0.05, ctx.materials.get('wax'), 0.35);
          const cells = Math.max(3, Math.round(slab.width / 0.3));
          for (let i = 0; i < cells; i++) {
            const x = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / cells;
            const h = 0.14 + ((i * 29) % 5) / 42;
            strip(x, 0.2, y - 0.06 + ((i % 2) * 0.05), h, 0.085, ctx.materials.get('comb'), 0.2);
          }
          strip(slab.offset, slab.width, y + 0.2, 0.06, 0.13, ctx.materials.get('wax'), 0.4);
        } else {
          // The Bloom's version: a lace of violet root that has grown along the
          // channel, in the one colour that belongs to neither half of the map.
          strip(slab.offset, slab.width, y - 0.09, 0.24, 0.055, rootMat, 0.4);
          const count = Math.max(2, Math.round(slab.width / 0.4));
          for (let i = 0; i < count; i++) {
            const x = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / count;
            strip(x, 0.15, y - 0.03, 0.1, 0.08, ctx.materials.get('surface.bloomVein'), 0.2);
            if (i % 2 === 0) strip(x, 0.06, y + 0.1, 0.16, 0.06, ctx.materials.get('petalViolet'), 0.14);
          }
        }
      }

      if (bandStyle !== 'none' && slab.y1 > bandHeight) {
        // The capping moulding on the wainscot, plus the stiles that make it read
        // as panelling rather than as a stripe of a different colour.
        strip(slab.offset, slab.width, bandHeight, 0.055, 0.06, timberDark, 0.6);
        if (built) {
          const count = Math.max(1, Math.round(slab.width / 0.95));
          for (let i = 0; i <= count; i++) {
            const x = slab.offset - slab.width / 2 + (slab.width * i) / count;
            strip(x, 0.075, KICK_HEIGHT, bandHeight - KICK_HEIGHT, 0.03, timberMat, 0.5);
          }
        }
      }

      // A rail crosses a port's sill, so a wall with one goes without.
      if (options.rail && built && !hasPort && slab.y1 > RAIL_Y + 0.12) {
        strip(slab.offset, slab.width, RAIL_Y, 0.06, 0.115, timberMat, 0.55);
        strip(slab.offset, slab.width, RAIL_Y - 0.05, 0.05, 0.06, timberDark, 0.4);
        // Pegs along it. Something has been hung on every one of them at some
        // point, and about half still have something on them.
        const pegs = Math.max(1, Math.round(slab.width / 1.1));
        for (let i = 0; i < pegs; i++) {
          const x = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / pegs;
          strip(x, 0.045, RAIL_Y - 0.12, 0.045, 0.16, timberDark, 0.15);
        }
      }
    }

    // The cornice runs above every opening the shell can cut, so it crosses the
    // whole wall rather than breaking over each doorway.
    if (options.seam !== false) {
      if (built) {
        strip(0, cellSize, ceilingHeight - 0.26, 0.26, 0.1, timberMat, 1.0);
        strip(0, cellSize, ceilingHeight - 0.32, 0.07, 0.19, timberDark, 0.45);
        // Carved brackets under it: three to a wall, so the cornice reads as
        // carpentry rather than as a band of paint.
        for (const t of [-0.3, 0, 0.3]) {
          strip(t * cellSize, 0.16, ceilingHeight - 0.55, 0.29, 0.16, timberMat, 0.2);
        }
      } else {
        // Where the wall grew, the top of it overhangs and things hang off it.
        strip(0, cellSize, ceilingHeight - 0.32, 0.32, 0.2, barkMat, 0.95);
        strip(0, cellSize, ceilingHeight - 0.4, 0.09, 0.28, mossMat, 0.5);
        for (const t of [-0.28, 0.06, 0.34]) {
          strip(t * cellSize, 0.06, ceilingHeight - 0.86, 0.48, 0.06, vineMat, 0.2);
        }
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
   * The ring around an opening, and the single detail most responsible for the
   * pack reading as one place: a contact sheet stands its cameras in doorways,
   * and so does a player.
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

    if (mouthStyle === 'carved') {
      /**
       * An elven arch: fluted jambs on plinths, capitals, a foliate head with a
       * boss at its crown, and a threshold board. Twelve boxes and four small
       * curved pieces, into the trim batch the room is already paying for.
       */
      for (const s of [-1, 1]) {
        // Plinth, shaft, capital.
        put(timberDark, 0.26, 0.2, 0.3, s * (half + 0.15), 0.1, 0.15, 0, 0.4);
        put(timberMat, 0.22, head - 0.34, 0.26, s * (half + 0.15), (head - 0.34) / 2 + 0.2, 0.13, 0, 0.6);
        // Two reeds down the face of each jamb: this is the pack's fluting, at
        // the size a hand would find it.
        for (const r of [-0.055, 0.055]) {
          put(timberPale, 0.045, head - 0.44, 0.05, s * (half + 0.15) + r, (head - 0.44) / 2 + 0.24, 0.27, 0, 0.25);
        }
        put(timberDark, 0.3, 0.09, 0.32, s * (half + 0.15), head - 0.11, 0.16, 0, 0.3);
        put(timberMat, 0.26, 0.05, 0.28, s * (half + 0.15), head - 0.16, 0.14, 0, 0.25);
      }
      // The head: a shallow arch built as five segments, so it is a curve rather
      // than a lintel with the corners knocked off.
      const segments = 5;
      for (let i = 0; i < segments; i++) {
        const t = (i + 0.5) / segments;
        const a = Math.PI * t;
        const x = -Math.cos(a) * (half + 0.16);
        const rise = head + 0.06 + Math.sin(a) * 0.17;
        put(timberMat, (opening.width + 0.32) / segments + 0.05, 0.2, 0.28, x, rise, 0.14, (t - 0.5) * 0.5, 0.35);
      }
      // The boss at the crown: a carved rosette, and the one thing on a doorway
      // a player's eye lands on.
      batch.add(boneMat, new THREE.SphereGeometry(0.1, 8, 6), tiltMatrix(at(0, head + 0.26, 0.24), [0, yaw, 0], [1, 1, 0.55]), {
        tile: 0.2,
        castShadow: false,
        consume: true,
      });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        put(timberPale, 0.11, 0.05, 0.06, Math.cos(a) * 0.13, head + 0.26 + Math.sin(a) * 0.13, 0.26, a, 0.12);
      }
      // A carved cornice shelf over the whole thing, and the threshold board.
      put(timberDark, opening.width + 0.72, 0.09, 0.36, 0, head + 0.44, 0.18, 0, 0.6);
      put(timberMat, opening.width + 0.56, 0.06, 0.28, 0, head + 0.38, 0.14, 0, 0.5);
      // A low threshold, five centimetres, so it reads as a sill and never as
      // something to step over - collision is a floor-plane test and this
      // deliberately carries no collider.
      put(timberDark, opening.width + 0.3, 0.045, 0.4, 0, 0.022, 0.12, 0, 0.4);
    } else if (mouthStyle === 'grown') {
      /**
       * The wood parted. Sampled all the way round as one loop rather than as
       * jambs plus a lintel: the corners are exactly where a four-piece frame
       * gives itself away, and an opening that grew has no corners at all.
       */
      const steps = 18;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const a = t * Math.PI * 2;
        const along = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.62) * (half + 0.2);
        const rise = head / 2 + Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.62) * (head / 2 + 0.15);
        if (rise < 0.1) continue; // the floor takes the bottom of the ring
        // Roughly equidimensional lumps: stretched along the ring they come out
        // as a chain of sausages, which reads as something anatomical rather
        // than as bark rolled over a wound.
        const lump = 0.16 + Math.abs(Math.sin(a * 2.3 + 0.8)) * 0.1;
        batch.add(
          barkMat,
          new THREE.SphereGeometry(lump, 6, 5),
          tiltMatrix(at(along, rise, 0.07 + lump * 0.3), [0, yaw, a], [1.1, 0.95, 0.85]),
          { tile: 0.5, castShadow: false, consume: true },
        );
      }
      // The pale rim of callus tissue just inside the ring, which is what a tree
      // actually does to a wound, and the one thing that makes this read as
      // healing rather than as broken.
      for (let i = 0; i < 10; i++) {
        const t = (i + 0.5) / 10;
        const a = Math.PI * t;
        put(ctx.materials.get('pulpProp'), 0.24, 0.16, 0.1, -Math.cos(a) * (half + 0.02), head * 0.5 + Math.sin(a) * (head * 0.5 + 0.02), 0.02, a, 0.2);
      }
      // Two runs of set sap over the head of the opening: the drip that got this
      // far and hardened. It is the detail that dates the hole.
      for (const s of [-1, 1]) {
        batch.add(
          sapMat,
          new THREE.ConeGeometry(0.075, 0.4, 5),
          tiltMatrix(at(s * half * 0.66, head - 0.02, 0.11), [Math.PI, yaw, 0]),
          { tile: 0.25, castShadow: false, consume: true },
        );
      }
    } else {
      /**
       * A burrow door: a round opening ringed in banded timber, with a stone
       * sill and a bell-pull beside it. The one mouth in the pack that is
       * unmistakably somebody's front door.
       */
      const segments = 11;
      for (let i = 0; i <= segments; i++) {
        const a = Math.PI * (i / segments);
        const x = -Math.cos(a) * (half + 0.24);
        const rise = 0.18 + Math.sin(a) * (head - 0.06);
        // Alternating light and dark staves, the way a barrel hoop is built.
        put(i % 2 === 0 ? timberMat : timberDark, 0.3, 0.3, 0.26, x, rise, 0.13, a - Math.PI / 2, 0.3);
      }
      // The inner liner: a smooth ring inside the staves, so the opening is round
      // rather than polygonal.
      for (let i = 0; i <= segments + 3; i++) {
        const a = Math.PI * (i / (segments + 3));
        const x = -Math.cos(a) * (half + 0.06);
        const rise = 0.1 + Math.sin(a) * (head - 0.14);
        put(timberPale, 0.22, 0.1, 0.14, x, rise, 0.24, a - Math.PI / 2, 0.2);
      }
      // Stone sill, worn hollow in the middle by however many years of feet.
      put(ctx.materials.get('stone'), opening.width + 0.5, 0.07, 0.46, 0, 0.03, 0.14, 0, 0.4);
      put(ctx.materials.get('stone'), opening.width * 0.6, 0.04, 0.34, 0, 0.03, 0.16, 0, 0.3);
      // A bell on a bracket, and a boot scraper under it.
      put(copperMat, 0.05, 0.24, 0.05, half + 0.42, head * 0.62, 0.2, 0, 0.12);
      batch.add(copperMat, new THREE.ConeGeometry(0.075, 0.13, 7), tiltMatrix(at(half + 0.42, head * 0.62 - 0.08, 0.2), [Math.PI, yaw, 0]), {
        tile: 0.15,
        castShadow: false,
        consume: true,
      });
      put(ctx.materials.get('iron'), 0.24, 0.02, 0.1, -(half + 0.4), 0.09, 0.24, 0, 0.12);
    }
  }

  /**
   * A port: an aperture in a wall the generator can never open. This pack's
   * window, and in the case of `knothole` its most important object - the whole
   * premise of the map is that you can see how much more tree there is.
   */
  function buildPort(spec: PortSpec, side: Side, cx: number, cz: number, opening: { width: number; y0: number; y1: number }): void {
    const { yaw, at } = frame(side, cx, cz);
    const h = opening.y1 - opening.y0;
    const midY = (opening.y0 + opening.y1) / 2;
    const kind = spec.kind ?? 'knothole';
    const rng = ctx.rng;

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

    if (kind === 'niche') {
      /**
       * A carved recess with something standing in it. The crypt's trick, made
       * of wood: a shrine box with a figure of bound twigs and a votive in front
       * of it, and it is the cheapest way to make a solid wall worth looking at.
       */
      put(timberDark, opening.width + 0.24, h + 0.24, 0.14, 0, midY, -0.02, 0.5);
      // The back of the recess, and the two side reveals.
      put(ctx.materials.get('surface.heart'), opening.width, h, 0.06, 0, midY, -0.16, 0.6);
      for (const s of [-1, 1]) {
        put(timberMat, 0.09, h + 0.18, 0.3, (s * (opening.width + 0.09)) / 2, midY, -0.02, 0.3);
      }
      put(timberMat, opening.width + 0.34, 0.11, 0.34, 0, opening.y1 + 0.05, 0.02, 0.4);
      put(timberMat, opening.width + 0.34, 0.13, 0.36, 0, opening.y0 - 0.07, 0.04, 0.4);

      // The figure: a bound bundle of twigs with a head and no face, standing on
      // the sill. Two legs, a waist narrower than the shoulders and a round head
      // is what makes a silhouette a person rather than a stack of boxes.
      const fy = opening.y0 + 0.02;
      const fh = h * 0.72;
      put(vineMat, 0.13, fh * 0.42, 0.1, -0.03, fy + fh * 0.21, -0.1, 0.15);
      put(vineMat, 0.09, fh * 0.4, 0.08, 0.05, fy + fh * 0.2, -0.09, 0.15);
      put(vineMat, 0.2, fh * 0.36, 0.13, 0, fy + fh * 0.58, -0.1, 0.2);
      batch.add(boneMat, new THREE.SphereGeometry(fh * 0.11, 7, 5), poseMatrix(at(0, fy + fh * 0.84, -0.1), yaw), {
        tile: 0.15,
        castShadow: false,
        consume: true,
      });
      // Antlers, because everything the Bower made a figure of has them.
      for (const s of [-1, 1]) {
        put(boneMat, 0.03, fh * 0.28, 0.03, s * 0.05, fy + fh * 0.92, -0.1, 0.1);
        put(boneMat, 0.09, 0.024, 0.024, s * 0.1, fy + fh * 1.08, -0.1, 0.08);
      }
      // The votive: a cup of resin burning on the sill, and the wash it lays on
      // the back of the recess.
      put(ctx.materials.get('pottery'), 0.11, 0.07, 0.11, 0.2, opening.y0 + 0.035, 0.04, 0.1);
      put(ctx.materials.get('lumenSap'), 0.06, 0.045, 0.06, 0.2, opening.y0 + 0.1, 0.04, 0.08);
      pane(ctx.materials.get('sapWash'), opening.width * 1.1, h * 0.9, 0.06, midY - 0.1, -0.14);
    } else if (kind === 'hive') {
      // Comb built into a hollow in the wall, full and lit. Not a window: a
      // light source that is also a larder, and the only one in the map.
      put(timberDark, opening.width + 0.22, h + 0.22, 0.12, 0, midY, -0.02, 0.5);
      put(ctx.materials.get('wax'), opening.width, h, 0.1, 0, midY, -0.12, 0.4);
      // Combs hung in it, at different depths so it has a front and a back.
      for (let i = 0; i < 4; i++) {
        const along = -opening.width / 2 + (opening.width * (i + 0.5)) / 4;
        const hh = h * (0.62 + rng() * 0.3);
        put(ctx.materials.get('comb'), opening.width / 4 - 0.05, hh, 0.09, along, opening.y1 - hh / 2 - 0.02, -0.04 + rng() * 0.08, 0.2);
        put(ctx.materials.get('wax'), opening.width / 4 - 0.02, 0.05, 0.13, along, opening.y1 - 0.02, 0.0, 0.15);
      }
      // Bees on it. Three, and they are the size of a thumb, which is the point.
      for (let i = 0; i < 3; i++) {
        batch.add(
          ctx.materials.get('chitin'),
          new THREE.SphereGeometry(0.035, 6, 4),
          tiltMatrix(at((rng() - 0.5) * opening.width, opening.y0 + rng() * h, 0.06), [0, yaw, rng()], [1.7, 0.9, 0.9]),
          { tile: 0.1, castShadow: false, consume: true },
        );
      }
      put(timberMat, opening.width + 0.3, 0.1, 0.3, 0, opening.y1 + 0.05, 0.02, 0.4);
      put(timberMat, opening.width + 0.3, 0.14, 0.34, 0, opening.y0 - 0.07, 0.05, 0.4);
    } else if (kind === 'webbed') {
      // An opening choked with sheet web, with a wrapped bundle hanging in it.
      // You can see there is space beyond and you cannot see into it, which is
      // the whole job.
      pane(ctx.materials.get('backdropHollow'), opening.width + 0.8, h + 0.7, 0, midY, -0.75);
      // Overlapping patches rather than three full-size panes: a pane the size of
      // the opening is a lit rectangle hanging in the wall, and what has to read
      // here is that you can ALMOST see through.
      for (let i = 0; i < 7; i++) {
        const w = opening.width * (0.3 + rng() * 0.3);
        pane(silkMat, w, h * (0.28 + rng() * 0.3), (rng() - 0.5) * opening.width * 0.6, midY + (rng() - 0.5) * h * 0.6, -0.55 + i * 0.07);
      }
      // Radial anchor lines out of the corners of the opening.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        const len = 0.4 + rng() * 0.5;
        batch.add(
          ctx.materials.get('strand'),
          boxGeometry(len, 0.012, 0.012),
          tiltMatrix(at(Math.cos(a) * len * 0.5, midY + Math.sin(a) * len * 0.5, 0.04), [0, yaw, a]),
          { tile: 0.2, castShadow: false, receiveShadow: false },
        );
      }
      // The bundle: something the size of a person, wrapped, hanging a little
      // in front of the web so it is silhouetted against the pale.
      const bl = h * 0.55;
      batch.add(
        ctx.materials.get('carapacePale'),
        new THREE.SphereGeometry(0.19, 7, 6),
        tiltMatrix(at(opening.width * 0.16, midY - 0.05, 0.12), [0.2, yaw, 0.15], [1, bl / 0.38, 0.85]),
        { tile: 0.3, castShadow: false, consume: true },
      );
      put(silkMat, 0.03, h * 0.5, 0.03, opening.width * 0.16, opening.y1 - h * 0.16, 0.12, 0.1);
      put(ctx.materials.get('barkProp'), opening.width + 0.3, 0.16, 0.24, 0, opening.y1 + 0.06, 0.03, 0.4);
      put(ctx.materials.get('barkProp'), opening.width + 0.3, 0.18, 0.28, 0, opening.y0 - 0.09, 0.05, 0.4);
    } else if (kind === 'burst') {
      /**
       * Not an aperture anybody made: something has come THROUGH the wall from
       * the far side and the wood has split around it. A jagged column rather
       * than a rectangle - the opening the shell cut is only the budget it fits
       * inside.
       */
      pane(ctx.materials.get('backdropRoots'), opening.width + 0.6, h + 0.6, 0, midY, -0.6);
      const steps = 9;
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        const y = opening.y0 + h * t;
        const w = (0.22 + Math.sin(t * Math.PI) * 0.5) * opening.width;
        const drift = (rng() - 0.5) * opening.width * 0.26;
        put(ctx.materials.get('pulpProp'), w, h / steps + 0.03, 0.09, drift, y, -0.16, 0.3);
        // The splinters either side, standing proud and dark.
        for (const s of [-1, 1]) {
          batch.add(
            ctx.materials.get('barkProp'),
            new THREE.ConeGeometry(0.1 + rng() * 0.05, 0.34 + rng() * 0.2, 4),
            tiltMatrix(at(drift + (s * w) / 2, y, 0.08), [rng() * 0.5 - 0.25, yaw, s * (1.2 + rng() * 0.5)], [1, 1, 0.5]),
            { tile: 0.3, castShadow: false, consume: true },
          );
        }
      }
      // The thing itself: one dark root, coming out and turning down the wall.
      batch.add(
        ctx.materials.get('root'),
        new THREE.CylinderGeometry(0.13, 0.19, h * 0.9, 7),
        tiltMatrix(at(0.1, midY, 0.16), [1.05, yaw, 0.3]),
        { tile: 0.5, castShadow: false, consume: true },
      );
    } else if (kind === 'shutter') {
      /**
       * A window somebody boarded, from the INSIDE. The boards are nailed over
       * a shutter that already had a bar across it, and one board has been
       * levered off at the bottom - which is the wrong way round.
       */
      put(ctx.materials.get('surface.plank'), opening.width + 0.12, h + 0.12, 0.07, 0, midY, -0.08, 0.6);
      const boards = 5;
      for (let i = 0; i < boards; i++) {
        if (i === 3) continue; // the missing one
        const y = opening.y0 + (h * (i + 0.5)) / boards;
        batch.add(timberMat, boxGeometry(opening.width + 0.42, h / boards - 0.03, 0.06), tiltMatrix(at(0, y, 0.06), [0, yaw, (rng() - 0.5) * 0.07]), {
          tile: 0.45,
          castShadow: false,
        });
        for (const s of [-1, 1]) {
          put(ctx.materials.get('iron'), 0.05, 0.05, 0.05, (s * (opening.width + 0.24)) / 2, y, 0.11, 0.1);
        }
      }
      // The gap where the fourth board was, with the dark of the shaft behind it.
      pane(ctx.materials.get('backdropHollow'), opening.width, h / boards + 0.05, 0, opening.y0 + (h * 3.5) / boards, -0.14);
      // The board itself, on the floor under the window, snapped.
      put(timberMat, opening.width * 0.7, 0.05, 0.14, -0.2, opening.y0 - 0.4, 0.42, 0.35);
      put(ctx.materials.get('iron'), opening.width + 0.2, 0.07, 0.09, 0, midY, 0.14, 0.3);
      put(timberDark, opening.width + 0.5, 0.13, 0.3, 0, opening.y1 + 0.06, 0.04, 0.5);
      put(timberDark, opening.width + 0.5, 0.15, 0.34, 0, opening.y0 - 0.08, 0.06, 0.5);
    } else if (kind === 'pane') {
      /**
       * A glazed window: leaded resin quarries in a carved frame, looking out of
       * the trunk into the forest. The one place in the map with a sky in it.
       *
       * Built in four layers, front to back, and the ORDER is the whole thing:
       * frame, glazing (a highlight, never a glow), a faint haze INSIDE the
       * glass, and the picture 1.1 m back. Nothing translucent ever goes in
       * FRONT of something lit (docs/art/ROOM_REVIEW.md).
       */
      const back = -1.1;
      pane(ctx.materials.get(spec.scene === 'canopy' ? 'backdropCanopy' : spec.scene === 'hollow' ? 'backdropHollow' : 'backdropForest'), opening.width + 1.2, h + 1.1, 0, midY + 0.06, back);
      pane(ctx.materials.get('hazeMist'), opening.width + 0.5, h + 0.34, 0, midY, back * 0.45);

      buildPortScene(spec.scene ?? 'forest', at, yaw, opening, back);

      batch.add(ctx.materials.get('glassPane'), new THREE.PlaneGeometry(opening.width, h), poseMatrix(at(0, midY, 0.03), yaw), {
        castShadow: false,
        receiveShadow: false,
        consume: true,
      });
      // The leading: diamond quarries, which is what makes it read as a window
      // and not as a hole with a shine on it.
      const rows = Math.max(3, Math.round(h / 0.34));
      const cols = Math.max(3, Math.round(opening.width / 0.34));
      for (let r = 0; r <= rows; r++) {
        put(ctx.materials.get('copper'), opening.width, 0.018, 0.04, 0, opening.y0 + (h * r) / rows, 0.05, 0.15);
      }
      for (let c = 0; c <= cols; c++) {
        put(ctx.materials.get('copper'), 0.018, h, 0.04, -opening.width / 2 + (opening.width * c) / cols, midY, 0.05, 0.15);
      }
      for (const s of [-1, 1]) {
        put(ctx.materials.get('glassEdge'), 0.05, h, 0.24, (s * opening.width) / 2, midY, 0.02, 0.3);
      }
      // The surround: a carved frame with a sill deep enough to put things on,
      // and a pair of shutters folded back against the wall.
      put(timberMat, opening.width + 0.44, 0.2, 0.36, 0, opening.y1 + 0.1, 0.09, 0.55);
      put(timberDark, opening.width + 0.62, 0.09, 0.44, 0, opening.y1 + 0.24, 0.13, 0.4);
      put(timberMat, opening.width + 0.5, 0.1, 0.44, 0, opening.y0 - 0.05, 0.14, 0.5);
      put(timberDark, opening.width + 0.5, 0.07, 0.16, 0, opening.y0 - 0.12, 0.3, 0.3);
      for (const s of [-1, 1]) {
        put(timberMat, 0.2, h + 0.4, 0.34, (s * (opening.width + 0.2)) / 2, midY, 0.08, 0.5);
        put(ctx.materials.get('surface.plank'), 0.26, h * 0.94, 0.05, (s * (opening.width + 0.62)) / 2, midY, 0.22, 0.4);
        put(ctx.materials.get('iron'), 0.05, 0.06, 0.09, (s * (opening.width + 0.5)) / 2, midY + h * 0.3, 0.24, 0.1);
      }
    } else {
      /* --- the knothole ---------------------------------------------------- */
      /**
       * A hole where a branch was, opening into the Hollow - the shaft of trunk
       * this whole map is somewhere inside. It is round, it is ringed with the
       * callus the tree grew round the wound, and the scale cue is that the
       * lantern lights on the far side are TINY.
       */
      const r = Math.min(opening.width, h) * 0.46;
      const back = -1.05;
      pane(ctx.materials.get(spec.scene === 'canopy' ? 'backdropCanopy' : spec.scene === 'roots' ? 'backdropRoots' : spec.scene === 'forest' ? 'backdropForest' : 'backdropHollow'), r * 2.7, r * 2.7, 0, midY, back);
      // The barrel of the hole, so the view is at the far end of something.
      batch.add(
        ctx.materials.get('surface.pulp'),
        new THREE.CylinderGeometry(r * 1.04, r * 1.16, Math.abs(back) - 0.06, 14, 1, true),
        tiltMatrix(at(0, midY, back / 2), [Math.PI / 2, yaw, 0]),
        { tile: 0.7, castShadow: false, consume: true },
      );
      pane(ctx.materials.get('hazeMist'), r * 2.2, r * 2.2, 0, midY, back * 0.4);
      buildPortScene(spec.scene ?? 'hollow', at, yaw, opening, back);

      // The callus roll: a torus of healed wood standing proud of the wall,
      // lumpy rather than smooth, which is what a tree actually grows.
      const lumps = 14;
      for (let i = 0; i < lumps; i++) {
        const a = (i / lumps) * Math.PI * 2;
        const lump = 0.1 + Math.abs(Math.sin(a * 2.6 + 1.1)) * 0.06;
        batch.add(
          ctx.materials.get('barkProp'),
          new THREE.SphereGeometry(lump, 6, 5),
          tiltMatrix(at(Math.cos(a) * (r + 0.1), midY + Math.sin(a) * (r + 0.1), 0.06), [0, yaw, a], [1.15, 1.0, 0.8]),
          { tile: 0.4, castShadow: false, consume: true },
        );
      }
      // A pale inner rim of live tissue, and three strands of web across it,
      // because nothing in this tree stays open for long.
      batch.add(ctx.materials.get('pulpProp'), new THREE.TorusGeometry(r * 1.02, 0.045, 5, 16), poseMatrix(at(0, midY, 0.02), yaw), {
        tile: 0.3,
        castShadow: false,
        consume: true,
      });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI + 0.4;
        batch.add(
          ctx.materials.get('strand'),
          boxGeometry(r * 2, 0.012, 0.012),
          tiltMatrix(at(0, midY, 0.03), [0, yaw, a]),
          { tile: 0.2, castShadow: false, receiveShadow: false },
        );
      }
    }

    if (spec.light) {
      const colour = kind === 'hive' ? 0xffb84a : kind === 'burst' ? 0x58c898 : kind === 'niche' ? 0xffa64a : 0x8fb0c8;
      const lamp = new THREE.PointLight(colour, kind === 'pane' || kind === 'knothole' ? 7 : 10, cellSize * 1.5, 2);
      lamp.position.set(...at(0, midY, 0.55));
      extra.add(lamp);
      lights.push(lamp);
    }

    portAnchors.push({ position: at(0, midY, 0), side, kind });
  }

  /**
   * What is on the other side of an opening. Everything here sits between the
   * glass and the backdrop, so it is silhouetted against whatever light is back
   * there - which is why the shapes matter far more than the surfaces: at that
   * distance and that light level you are reading outlines and nothing else.
   */
  function buildPortScene(
    scene: PortScene,
    at: (along: number, y: number, depth: number) => [number, number, number],
    yaw: number,
    opening: { width: number; y0: number; y1: number },
    back: number,
  ): void {
    const rng = ctx.rng;
    const span = opening.width * 0.55;
    const floorY = opening.y0 - 0.3;
    const r = (min: number, max: number): number => min + rng() * (max - min);

    if (scene === 'forest') {
      // Trunks going away, and a low mist between them. Three is enough: what
      // makes a forest read is the *gaps*, and a wall of them is a fence.
      for (let i = 0; i < 3; i++) {
        batch.add(
          ctx.materials.get('barkProp'),
          new THREE.CylinderGeometry(r(0.1, 0.2), r(0.14, 0.26), (opening.y1 - floorY) * 2.2, 6),
          tiltMatrix(at(r(-span * 1.3, span * 1.3), floorY, r(back * 0.9, back * 0.4)), [0, yaw, r(-0.06, 0.06)]),
          { tile: 0.9, castShadow: false, consume: true },
        );
      }
      // A branch across the top of the view, near enough to be black.
      batch.add(
        ctx.materials.get('root'),
        new THREE.CylinderGeometry(0.05, 0.08, opening.width * 2, 5),
        tiltMatrix(at(0, opening.y1 - 0.1, back * 0.32), [Math.PI / 2, yaw, 0.24]),
        { tile: 0.4, castShadow: false, consume: true },
      );
      for (let i = 0; i < 9; i++) {
        batch.add(
          ctx.materials.get('leaf'),
          new THREE.PlaneGeometry(r(0.1, 0.2), r(0.07, 0.14)),
          tiltMatrix(at(r(-span, span), opening.y1 - r(0.05, 0.4), back * 0.3), [r(-0.5, 0.5), yaw + r(-0.4, 0.4), r(-0.6, 0.6)]),
          { castShadow: false, receiveShadow: false, consume: true },
        );
      }
    } else if (scene === 'canopy') {
      // Looking up a shaft: the walls converging, and things going up it. The
      // emptiness in the middle is the point.
      for (const s of [-1, 1]) {
        batch.add(
          ctx.materials.get('barkProp'),
          boxGeometry(0.6, (opening.y1 - floorY) * 2.4, 0.8),
          tiltMatrix(at(s * (span + 0.45), floorY, back * 0.7), [0, yaw + s * 0.22, s * 0.12]),
          { tile: 1.0, castShadow: false },
        );
      }
      // Moths in the shaft: pale specks, and they are what gives it scale.
      for (let i = 0; i < 12; i++) {
        batch.add(
          ctx.materials.get('down'),
          new THREE.PlaneGeometry(r(0.02, 0.05), r(0.015, 0.035)),
          tiltMatrix(at(r(-span * 1.1, span * 1.1), r(opening.y0 - 0.2, opening.y1 + 0.2), r(back * 0.9, back * 0.2)), [r(0, 3), yaw, r(0, 3)]),
          { castShadow: false, receiveShadow: false, consume: true },
        );
      }
    } else if (scene === 'roots') {
      // Down into the root void. Two roots crossing and nothing else - what
      // makes a hole frightening is that you cannot resolve the bottom of it.
      for (let i = 0; i < 2; i++) {
        batch.add(
          ctx.materials.get('root'),
          new THREE.CylinderGeometry(r(0.06, 0.13), r(0.08, 0.16), opening.width * 2.4, 5),
          tiltMatrix(at(r(-0.2, 0.2), midOf(opening) + r(-0.4, 0.4), r(back * 0.8, back * 0.35)), [Math.PI / 2, yaw, r(-0.7, 0.7)]),
          { tile: 0.5, castShadow: false, consume: true },
        );
      }
      for (let i = 0; i < 5; i++) {
        batch.add(
          ctx.materials.get('lumenFox'),
          new THREE.SphereGeometry(r(0.014, 0.032), 4, 3),
          poseMatrix(at(r(-span, span), r(opening.y0 - 0.3, opening.y1), r(back * 0.9, back * 0.3))),
          { castShadow: false, consume: true },
        );
      }
    } else {
      // The Hollow: hanging cords with things on the end of them, going away in
      // both directions, and a few motes of lantern-lit dust.
      for (let i = 0; i < 4; i++) {
        const x = r(-span * 1.2, span * 1.2);
        const drop = r(0.3, 0.9);
        batch.add(
          ctx.materials.get('strand'),
          boxGeometry(0.014, drop, 0.014),
          poseMatrix(at(x, opening.y1 - drop / 2, r(back * 0.85, back * 0.35))),
          { tile: 0.2, castShadow: false, receiveShadow: false },
        );
        batch.add(
          ctx.materials.get('carapacePale'),
          new THREE.SphereGeometry(r(0.04, 0.09), 6, 4),
          tiltMatrix(at(x, opening.y1 - drop, r(back * 0.85, back * 0.35)), [0, r(0, 3), 0], [0.9, 1.5, 0.9]),
          { tile: 0.2, castShadow: false, consume: true },
        );
      }
      for (let i = 0; i < 10; i++) {
        batch.add(
          ctx.materials.get('lumenSap'),
          new THREE.SphereGeometry(r(0.008, 0.02), 4, 3),
          poseMatrix(at(r(-span * 1.2, span * 1.2), r(opening.y0 - 0.2, opening.y1 + 0.1), r(back * 0.9, back * 0.2))),
          { castShadow: false, consume: true },
        );
      }
    }
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
      case 'rafters': {
        /**
         * Hewn beams across the short way with purlins over them, and the boards
         * showing between. Sampled as three pieces each so the beam has a top,
         * a body and a chamfer - a plain box up there reads as a stripe.
         *
         * Worth knowing before you investigate one: a raised corner view on a
         * contact sheet is parked at about beam height, so an eight-metre beam
         * passing a hand's breadth from the camera blacks out most of the frame.
         * That is the camera, not the room - a player's eye is at 1.6 m and
         * never gets near them.
         */
        for (let i = 0; i < 4; i++) {
          const z = cz - cellSize / 2 + cellSize * ((i + 0.5) / 4);
          const y = ceilingHeight - 0.26;
          batch.add(timberDark, boxGeometry(cellSize, 0.3, 0.19), poseMatrix([cx, y, z]), { tile: 0.9, ...CEILING_OPTS });
          batch.add(timberMat, boxGeometry(cellSize, 0.05, 0.26), poseMatrix([cx, y + 0.17, z]), { tile: 0.7, ...CEILING_OPTS });
          // Chamfer stops and a peg at each end: carpentry, not extrusion.
          for (const s of [-1, 1]) {
            batch.add(timberMat, boxGeometry(0.4, 0.26, 0.24), tiltMatrix([cx + s * (cellSize / 2 - 0.3), y - 0.02, z], [0, 0, s * 0.16]), {
              tile: 0.3,
              ...CEILING_OPTS,
            });
            batch.add(timberPale, boxGeometry(0.06, 0.06, 0.3), poseMatrix([cx + s * (cellSize / 2 - 0.5), y, z]), {
              tile: 0.15,
              ...CEILING_OPTS,
            });
          }
        }
        // One purlin running the other way, over the beams.
        batch.add(timberMat, boxGeometry(0.22, 0.16, cellSize), poseMatrix([cx - cellSize * 0.18, ceilingHeight - 0.06, cz]), {
          tile: 0.6,
          ...CEILING_OPTS,
        });
        break;
      }
      case 'vault': {
        /**
         * Carved ribs springing from the corners and meeting at a boss - the
         * Bower's grand ceiling. Sampled at eight steps a rib, because a curve
         * built from five unrotated boxes reads as blocks floating under the
         * ceiling rather than as vaulting (docs/art/ROOM_REVIEW.md).
         */
        const steps = 8;
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          for (let i = 0; i < steps; i++) {
            const t = (i + 0.5) / steps;
            const x = cx + sx * (cellSize / 2) * (1 - t);
            const z = cz + sz * (cellSize / 2) * (1 - t);
            const y = ceilingHeight - 0.52 + Math.pow(t, 1.7) * 0.44;
            const pitch = Math.atan2(0.44 * 1.7 * Math.pow(t, 0.7) / steps, (cellSize / 2 / steps) * 1.414);
            batch.add(
              timberMat,
              boxGeometry(0.19, 0.2, (cellSize / steps) * 0.78),
              tiltMatrix([x, y, z], [pitch, Math.atan2(-sx, -sz), 0]),
              { tile: 0.4, ...CEILING_OPTS },
            );
          }
        }
        // The boss where they meet, and the pendant hanging off it.
        batch.add(boneMat, new THREE.SphereGeometry(0.24, 9, 7), tiltMatrix([cx, ceilingHeight - 0.1, cz], [0, 0, 0], [1, 0.7, 1]), {
          tile: 0.3,
          ...CEILING_OPTS,
          consume: true,
        });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          batch.add(leafMat, new THREE.PlaneGeometry(0.19, 0.11), tiltMatrix([cx + Math.cos(a) * 0.2, ceilingHeight - 0.19, cz + Math.sin(a) * 0.2], [-0.5, a, 0]), {
            ...CEILING_OPTS,
            receiveShadow: false,
            consume: true,
          });
        }
        break;
      }
      case 'boughs': {
        // Branches crossing overhead with leaf hanging off them. The one ceiling
        // that reads as being *inside a tree* rather than under a roof.
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI + 0.35;
          const y = ceilingHeight - 0.22 - (i % 3) * 0.14;
          const len = cellSize * (1.05 + (i % 2) * 0.2);
          batch.add(
            rootMat,
            new THREE.CylinderGeometry(0.07 + (i % 3) * 0.03, 0.11 + (i % 3) * 0.03, len, 6),
            tiltMatrix([cx + ((i * 37) % 11) / 11 - 0.5, y, cz + ((i * 23) % 13) / 13 - 0.5], [Math.PI / 2, a, 0]),
            { tile: 0.6, ...CEILING_OPTS, consume: true },
          );
          // Twigs off it.
          for (let k = 0; k < 3; k++) {
            const t = (k + 0.5) / 3 - 0.5;
            batch.add(
              rootMat,
              new THREE.CylinderGeometry(0.02, 0.035, 0.5, 4),
              tiltMatrix([cx + Math.cos(a) * t * len, y - 0.2, cz - Math.sin(a) * t * len], [Math.PI / 2.4, a + 1.2, 0]),
              { tile: 0.2, ...CEILING_OPTS, consume: true },
            );
          }
        }
        for (let i = 0; i < 14; i++) {
          const ax = cx - cellSize / 2 + cellSize * (((i * 5) % 14) + 0.5) / 14;
          const az = cz - cellSize / 2 + cellSize * (((i * 9) % 14) + 0.5) / 14;
          batch.add(
            leafMat,
            new THREE.PlaneGeometry(0.26 + (i % 3) * 0.08, 0.16),
            tiltMatrix([ax, ceilingHeight - 0.42 - ((i * 7) % 5) * 0.06, az], [(((i * 11) % 7) / 7 - 0.5) * 1.4, i * 0.9, (((i * 3) % 5) / 5 - 0.5) * 1.2]),
            { ...CEILING_OPTS, receiveShadow: false, consume: true },
          );
        }
        break;
      }
      case 'roots': {
        // A mat of roots hanging down through the ceiling, in three lengths, and
        // the soil they came through packed between them.
        for (let i = 0; i < 11; i++) {
          const ax = cx - cellSize / 2 + cellSize * (((i * 7) % 11) + 0.5) / 11;
          const az = cz - cellSize / 2 + cellSize * (((i * 5) % 11) + 0.5) / 11;
          const len = 0.4 + ((i * 41) % 13) / 14;
          batch.add(
            rootMat,
            new THREE.CylinderGeometry(0.025, 0.075, len, 5),
            tiltMatrix([ax, ceilingHeight - len / 2, az], [((i % 5) / 5 - 0.5) * 0.4, i, 0]),
            { tile: 0.4, ...CEILING_OPTS, consume: true },
          );
        }
        for (let i = 0; i < 7; i++) {
          const ax = cx - cellSize / 2 + cellSize * (((i * 3) % 7) + 0.5) / 7;
          const az = cz - cellSize / 2 + cellSize * (((i * 5) % 7) + 0.5) / 7;
          batch.add(
            ctx.materials.get('earth'),
            new THREE.SphereGeometry(0.42 + ((i * 13) % 9) / 22, 6, 5),
            tiltMatrix([ax, ceilingHeight + 0.16, az], [0, i, 0], [1.3, 0.5, 1.2]),
            { tile: 0.9, ...CEILING_OPTS, consume: true },
          );
        }
        break;
      }
      case 'canopy': {
        // Leaf canopy with gaps in it and light coming through - the ceiling for
        // anything with a garden in it. The masked shafts are what make the gaps
        // read as holes rather than as pale patches.
        /**
         * Leaf, and the numbers are the whole recipe.
         *
         * The first pass hung twenty half-metre quads at a near-flat pitch, and
         * every canopy in the pack read as a scatter of green paper rectangles
         * stuck to the ceiling. What makes a canopy is SMALL blades at wildly
         * varied pitch and roll, packed until they overlap - the individual leaf
         * has to stop being resolvable, which is a count-and-angle problem
         * rather than a material one.
         */
        for (let i = 0; i < 78; i++) {
          const ax = cx - cellSize / 2 + cellSize * (((i * 7) % 26) + 0.5) / 26 + (((i * 11) % 7) / 7 - 0.5) * 0.24;
          const az = cz - cellSize / 2 + cellSize * (((i * 17) % 26) + 0.5) / 26 + (((i * 5) % 7) / 7 - 0.5) * 0.24;
          const w = 0.16 + ((i * 5) % 7) * 0.03;
          batch.add(
            i % 9 === 0 ? ctx.materials.get('leafPale') : leafMat,
            new THREE.PlaneGeometry(w, w * (0.5 + ((i * 3) % 5) * 0.12)),
            tiltMatrix(
              [ax, ceilingHeight - 0.1 - ((i * 5) % 7) * 0.055, az],
              [-1.9 + (((i * 13) % 11) / 11) * 1.4, i * 0.83, (((i * 17) % 9) / 9 - 0.5) * 2.2],
            ),
            { ...CEILING_OPTS, receiveShadow: false, consume: true },
          );
        }
        for (const [tx, tz] of [[-0.22, 0.2], [0.28, -0.24]] as const) {
          batch.add(
            ctx.materials.get('shaftCold'),
            new THREE.PlaneGeometry(0.9, 2.6),
            tiltMatrix([cx + tx * cellSize, ceilingHeight - 1.3, cz + tz * cellSize], [0, 0.5, 0]),
            { ...CEILING_OPTS, receiveShadow: false, consume: true },
          );
          batch.add(
            ctx.materials.get('shaftCold'),
            new THREE.PlaneGeometry(0.9, 2.6),
            tiltMatrix([cx + tx * cellSize, ceilingHeight - 1.3, cz + tz * cellSize], [0, 0.5 + Math.PI / 2, 0]),
            { ...CEILING_OPTS, receiveShadow: false, consume: true },
          );
        }
        break;
      }
      case 'web': {
        // Sheet web slung under the ceiling in sagging panels, with anchor lines
        // up to it. Not a full-width sheet: a curtain right across a room reads
        // as a flat grey rectangle floating in it (docs/art/ROOM_REVIEW.md).
        // Nine small pockets rather than four big panels. A 3.4 m quad of silk
        // under a ceiling is a billboard: what makes sheet web read is a lot of
        // overlapping little sags at different heights and angles, which is also
        // what stops any one of them being a readable rectangle.
        for (let i = 0; i < 9; i++) {
          const ax = cx - cellSize / 2 + cellSize * (((i % 3) + 0.5) / 3);
          const az = cz - cellSize / 2 + cellSize * ((Math.floor(i / 3) + 0.5) / 3);
          batch.add(
            silkMat,
            new THREE.PlaneGeometry(cellSize * 0.2 + ((i * 7) % 5) * 0.12, cellSize * 0.2 + ((i * 11) % 5) * 0.1),
            tiltMatrix([ax, ceilingHeight - 0.28 - (i % 4) * 0.13, az], [Math.PI / 2 + ((i % 3) - 1) * 0.34, i * 0.9, ((i % 5) - 2) * 0.14]),
            { ...CEILING_OPTS, receiveShadow: false, consume: true },
          );
          for (let k = 0; k < 2; k++) {
            batch.add(
              ctx.materials.get('strand'),
              boxGeometry(0.012, 0.34, 0.012),
              poseMatrix([ax + ((k * 7) % 5) / 8 - 0.3, ceilingHeight - 0.16, az + ((k * 11) % 5) / 8 - 0.3]),
              { tile: 0.2, ...CEILING_OPTS, receiveShadow: false },
            );
          }
        }
        break;
      }
      case 'knots':
      default: {
        /**
         * The raw underside of the wood: burls and knots poking through.
         *
         * Six-segment spheres poking through a ceiling show only their bottom
         * cap, and at 0.8 of their own height that cap is a hard-edged polygon -
         * squashed to 0.4 and alternated with a second material they read as a
         * knobbly surface instead (docs/art/ROOM_REVIEW.md).
         */
        for (let i = 0; i < 12; i++) {
          const ax = cx - cellSize / 2 + cellSize * (((i * 5) % 12) + 0.5) / 12;
          const az = cz - cellSize / 2 + cellSize * (((i * 7) % 12) + 0.5) / 12;
          const size = 0.5 + ((i * 37) % 11) / 15;
          batch.add(
            i % 3 === 0 ? ctx.materials.get('surface.pulp') : barkMat,
            new THREE.SphereGeometry(size, 7, 5),
            tiltMatrix([ax, ceilingHeight + size * 0.62, az], [0, i, 0], [1.3, 0.42, 1.2]),
            { tile: 1.1, ...CEILING_OPTS, consume: true },
          );
        }
        // Two dead branch stubs coming out of it, which is what a knot is.
        for (let i = 0; i < 2; i++) {
          batch.add(
            rootMat,
            new THREE.CylinderGeometry(0.06, 0.11, 0.44, 5),
            tiltMatrix([cx + (i ? 2.1 : -1.8), ceilingHeight - 0.28, cz + (i ? -1.6 : 2.2)], [0.35 + i * 0.2, i * 2, 0]),
            { tile: 0.3, ...CEILING_OPTS, consume: true },
          );
        }
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
        const kind = port.kind ?? 'knothole';
        // Every one of these starts well above the floor, so the wall keeps one
        // collider across its whole run. A decorative opening must never be a
        // hole a player can walk into (docs/art/ROOM_REVIEW.md).
        if (kind === 'niche') opening = { width: 0.9, y0: 0.72, y1: 2.3 };
        else if (kind === 'hive') opening = { width: 1.6, y0: 0.9, y1: 2.35 };
        else if (kind === 'webbed') opening = { width: 1.7, y0: 0.6, y1: 2.5 };
        else if (kind === 'burst') opening = { width: 1.2, y0: 0.55, y1: ceilingHeight - 0.55 };
        else if (kind === 'shutter') opening = { width: 1.5, y0: 0.95, y1: 2.3 };
        else if (kind === 'pane') opening = port.tall ? { width: 3.4, y0: 0.7, y1: ceilingHeight - 0.7 } : { width: 2.2, y0: 1.0, y1: 2.35 };
        else opening = port.tall ? { width: 2.6, y0: 0.7, y1: ceilingHeight - 0.7 } : { width: 1.6, y0: 1.0, y1: 2.5 };
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
 * The contract-facing kit. Heartwood rooms call `addShell()` directly so they can
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
