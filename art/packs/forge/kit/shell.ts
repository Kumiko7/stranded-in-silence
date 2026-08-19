/**
 * Vulcan's Anvil's shell: floors, ceilings, walls, trim, hatchways and ports.
 *
 * Every room calls this first and then decorates, which is what guarantees door
 * openings line up between neighbours no matter who authored the rooms either
 * side. The style options are the pack's main lever for variety: the same
 * function builds a refrigerated morgue and a lava tube.
 *
 * Five things worth knowing before you use it:
 *
 * - It writes into a `MeshBatcher` rather than building meshes. A forge room is
 *   several hundred boxes of plate, conduit and rock; batched, that is a handful
 *   of draw calls. See `art/lib/merge.ts`.
 * - **Every opening gets a mouth.** A hole cut in a blast wall is a machined
 *   frame with the shutter parked in a header box above it; one cut in rock is a
 *   ragged arch with a lip of cooled lava over it. That ring is the single detail
 *   that makes the whole pack read as one place, so it lives in the shell rather
 *   than being left to each room.
 * - **Every room gets a heat register.** This is the pack's repeatable trick: a
 *   channel along the base of every wall with the mountain's heat showing in it -
 *   a louvred vent with ember crust behind it on the built side, a raw fissure on
 *   the rock side. It costs no light budget, it is the same object in both halves
 *   of the map, and it is what guarantees the rule in ROOM_FORMAT.md §6 - a
 *   player with no torch can always read the layout and find the doors.
 *   It is also, at roughly ninety triangles a wall run, about 3 % of the map -
 *   which is what a trick in the shell costs, and why it is built out of the
 *   cheapest geometry that reads.
 * - **A port may only go on a side the blueprint never opens as a door.** The
 *   generator decides doors at run time, so the only walls guaranteed solid are
 *   the ones missing from `doorWalls`. Passing `doorWalls` in lets the shell
 *   throw immediately rather than shipping a room with a window in a doorway.
 *   Every port opening starts above the floor, so the wall keeps one collider
 *   across its whole run - a decorative hole must never be a hole in the wall
 *   (docs/art/ROOM_REVIEW.md).
 * - **A slit leans about 1.1 m out of its room** to hold the shaft behind the
 *   glass. That is deliberate and handled - a room is culled by the cells its
 *   geometry reaches, not the cells it occupies (ROOM_FORMAT.md §7).
 */
import * as THREE from 'three';
import type { BuiltPiece, Cell, Collider, PackKit, RoomBuildContext, Side } from '../../../lib/contract';
import { SIDES, doorKey } from '../../../lib/contract';
import { boxCollider, boxGeometry } from '../../../lib/build';
import { MeshBatcher, poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ball, cyl, spike } from './props';
import * as tex from '../textures';

export type FloorStyle = 'hex' | 'grate' | 'ferro' | 'scorch' | 'basalt' | 'ash' | 'obsidian' | 'sulphur' | 'slag';
export type WallStyle = 'panel' | 'ferro' | 'stencil' | 'scorch' | 'basalt' | 'tuff' | 'obsidian' | 'sulphur';
export type CeilingStyle = 'duct' | 'beams' | 'pipes' | 'cable' | 'trusses' | 'rock' | 'tube' | 'open';
/** The lower band of the wall, where a different material takes over. */
export type BandStyle = 'none' | 'hazard' | 'scorch' | 'ferro' | 'panel' | 'basalt';
/** What the ring around a hatchway is made of. */
export type MouthStyle = 'blast' | 'fissure' | 'collar' | 'none';
/**
 * The heat register: the pack's signature course along the base of every wall.
 * `vent` and `fissure` are the two halves of the map; `cold` is the handful of
 * rooms that are refrigerated, sterile or dead, and it is a deliberate absence
 * of heat rather than a different colour of it.
 */
export type RegisterStyle = 'none' | 'vent' | 'fissure' | 'cold' | 'bio';

export type PortKind = 'slit' | 'screens' | 'grille' | 'sealed' | 'crack' | 'bore';
/** What is on the far side of a slit. */
export type PortScene = 'shaft' | 'sky' | 'lake' | 'gantry';

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
  /** The kick plate / talus of rubble where wall meets floor. On by default. */
  readonly kick?: boolean;
  /** A rub rail at hand height, the way a working gallery is fitted out. */
  readonly rail?: boolean;
  /** The cornice where wall meets ceiling. On by default. */
  readonly seam?: boolean;
  readonly mouth?: MouthStyle;
  readonly register?: RegisterStyle;
  /** A room standing over live rock: the register runs a stage hotter. */
  readonly hot?: boolean;
  readonly ports?: readonly PortSpec[];
  /** Sides the blueprint may open. Required if `ports` is set. */
  readonly doorWalls?: readonly { readonly cell: Cell; readonly side: Side }[];
}

const FLOOR_MATERIAL: Record<FloorStyle, [string, number]> = {
  hex: ['surface.hex', tex.HEXTILE_TILE],
  grate: ['surface.grate', tex.GRATE_TILE],
  ferro: ['surface.ferro', tex.FERRO_TILE],
  scorch: ['surface.scorch', tex.SCORCH_TILE],
  basalt: ['surface.basalt', tex.BASALT_TILE],
  ash: ['surface.ash', tex.ASH_TILE],
  obsidian: ['surface.obsidian', tex.OBSIDIAN_TILE],
  sulphur: ['surface.sulphur', tex.SULPHUR_TILE],
  slag: ['surface.slag', tex.SLAG_TILE],
};

const WALL_MATERIAL: Record<WallStyle, [string, number]> = {
  panel: ['surface.panel', tex.PANEL_TILE],
  ferro: ['surface.ferro', tex.FERRO_TILE],
  stencil: ['surface.stencil', tex.STENCIL_TILE],
  scorch: ['surface.scorch', tex.SCORCH_TILE],
  basalt: ['surface.basalt', tex.BASALT_TILE],
  tuff: ['surface.tuff', tex.TUFF_TILE],
  obsidian: ['surface.obsidian', tex.OBSIDIAN_TILE],
  sulphur: ['surface.sulphur', tex.SULPHUR_TILE],
};

const BAND_MATERIAL: Record<Exclude<BandStyle, 'none'>, [string, number]> = {
  hazard: ['surface.hazard', tex.HAZARD_TILE],
  scorch: ['surface.scorch', tex.SCORCH_TILE],
  ferro: ['surface.ferro', tex.FERRO_TILE],
  panel: ['surface.panel', tex.PANEL_TILE],
  basalt: ['surface.basalt', tex.BASALT_TILE],
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
 * turned by this. That is what stops the class of bug where a header box built
 * on the north wall comes out inside-out on the east one: the sizes are never
 * swapped by hand, so there is nothing to swap wrongly.
 */
const FACE_IN: Record<Side, number> = {
  north: 0,
  east: -Math.PI / 2,
  south: Math.PI,
  west: Math.PI / 2,
};

const KICK_HEIGHT = 0.22;
const RAIL_Y = 1.02;

/**
 * Which wall styles are man-made. It decides the trim: a machined kick plate
 * under a wall of pahoehoe reads as a cave somebody fitted a skirting board to,
 * which is the one thing this pack must never look like.
 */
const BUILT: ReadonlySet<WallStyle> = new Set<WallStyle>(['panel', 'ferro', 'stencil', 'scorch']);

/**
 * Anything up at the ceiling is ABOVE every light a room can hang, so all of it
 * casts a hard bar straight down across the floor it is decorating. Ceiling
 * treatment is therefore never a shadow caster - see docs/art/ROOM_REVIEW.md.
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

  const [floorName, floorTile] = FLOOR_MATERIAL[options.floor ?? 'hex'];
  const wallStyle = options.wall ?? 'panel';
  const [wallName, wallTile] = WALL_MATERIAL[wallStyle];
  const bandStyle = options.band ?? 'none';
  const [bandName, bandTile] = bandStyle === 'none' ? WALL_MATERIAL[wallStyle] : BAND_MATERIAL[bandStyle];
  const bandHeight = options.bandHeight ?? 1.05;
  const built = BUILT.has(wallStyle);
  const mouthStyle = options.mouth ?? (built ? 'blast' : 'fissure');
  const registerStyle = options.register ?? (built ? 'vent' : 'fissure');
  const ceilingStyle = options.ceiling ?? 'duct';

  const floorMat = ctx.materials.get(floorName);
  const wallMat = ctx.materials.get(wallName);
  const bandMat = ctx.materials.get(bandName);
  const ceilMat = ctx.materials.get(
    ceilingStyle === 'rock' || ceilingStyle === 'tube' ? 'surface.basalt' : 'surface.duct',
  );
  const ceilTile = ceilingStyle === 'rock' || ceilingStyle === 'tube' ? tex.BASALT_TILE : tex.DUCT_TILE;
  const steelMat = ctx.materials.get('steel');
  const steelDark = ctx.materials.get('steelDark');
  const steelPale = ctx.materials.get('steelPale');
  const temperedMat = ctx.materials.get('tempered');
  const cableMat = ctx.materials.get('cable');
  const rockMat = ctx.materials.get('rockDark');
  const cinderMat = ctx.materials.get('cinder');
  const ashMat = ctx.materials.get('ashPale');
  const hazardMat = ctx.materials.get('surface.hazard');
  const crustMat = ctx.materials.get(options.hot ? 'surface.crustHot' : 'surface.crust');
  const graphiteMat = ctx.materials.get('graphite');

  const occupied = new Set(footprint.map(([x, y]) => `${x},${y}`));
  const off = cellSize / 2 - wallThickness / 2;

  const ports = options.ports ?? [];
  if (ports.length && options.doorWalls) {
    for (const spec of ports) {
      const cell = spec.cell ?? ([0, 0] as const);
      const clash = options.doorWalls.some(
        (wall) => wall.side === spec.side && wall.cell[0] === cell[0] && wall.cell[1] === cell[1],
      );
      if (clash) throw new Error(`forge shell: port on ${cell}:${spec.side} collides with a declared doorWall`);
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
   * The trim: a kick plate where wall meets floor, the heat register just above
   * it, an optional rub rail at hand height, and the cornice where wall meets
   * ceiling. All of it follows the same gaps as the wall, so nothing crosses a
   * doorway - and the register in particular must not, or the doorway stops
   * being the darkest thing on the wall and stops reading as a way out.
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
          // A bolted kick plate with a shadow gap over it. Two courses, the
          // lower proud: it catches a grazing light and gives the floor a hard
          // edge to end on.
          strip(slab.offset, slab.width, 0, KICK_HEIGHT * 0.74, 0.075, steelDark, 0.8);
          strip(slab.offset, slab.width, KICK_HEIGHT * 0.74, 0.035, 0.11, steelPale, 0.5);
        } else {
          // Where rock meets floor there is a talus of fallen scoria, not a
          // skirting board. Lumpy, and it never sits at the same height twice.
          strip(slab.offset, slab.width, 0, KICK_HEIGHT * 0.55, 0.24, cinderMat, 0.7);
          strip(slab.offset, slab.width, KICK_HEIGHT * 0.45, KICK_HEIGHT * 0.55, 0.13, rockMat, 0.5);
        }
      }

      /* --- the heat register: the thing that holds the pack together -------- */
      if (registerStyle !== 'none' && slab.y0 < 0.01 && slab.y1 > 0.5) {
        const y = built ? 0.34 : 0.26;
        if (registerStyle === 'vent') {
          // A machined channel with the mountain showing at the bottom of it. The
          // recess is set back and DARK, the crust sits deep inside it, and a
          // narrow lit line runs at the MOUTH of the channel - so what a player
          // sees is light coming out of a hole rather than a stripe painted on a
          // wall.
          //
          // The lit line is the part that earns its place. On the first contact
          // sheet the glow was buried behind the fins and the whole Works half of
          // the map had no navigation light at all: a register a player cannot
          // see is a register that is not doing its job, whatever it costs.
          strip(slab.offset, slab.width, y - 0.075, 0.24, 0.045, graphiteMat, 0.4);
          strip(slab.offset, slab.width, y - 0.05, 0.14, 0.02, crustMat, 0.34);
          strip(slab.offset, slab.width, y + 0.005, 0.035, 0.055, ctx.materials.get('lumenAmber'), 0.4);
          // Fins across it, at a spacing that lets more light past than it stops.
          const fins = Math.max(2, Math.round(slab.width / 0.7));
          for (let i = 0; i < fins; i++) {
            const x = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / fins;
            strip(x, 0.115, y - 0.075, 0.24, 0.085, steelDark, 0.25);
          }
          strip(slab.offset, slab.width, y + 0.165, 0.05, 0.11, steelMat, 0.4);
        } else if (registerStyle === 'fissure') {
          // A crack in the rock with the heat in it: nodules along the line, not
          // a line. A continuous glowing strip on a cave wall reads as a strip
          // light somebody screwed to the rock.
          strip(slab.offset, slab.width, y - 0.09, 0.24, 0.07, rockMat, 0.5);
          const count = Math.max(2, Math.round(slab.width / 0.7));
          for (let i = 0; i < count; i++) {
            const x = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / count;
            const h = 0.08 + ((i * 37) % 7) / 52;
            strip(x, 0.29 + ((i * 13) % 5) / 24, y - h / 2, h, 0.1, crustMat, 0.26);
          }
        } else if (registerStyle === 'cold') {
          // The absence of it: the same channel, running an arc-white service
          // light instead. Reserved for rooms that are refrigerated or sealed,
          // and it is how a player knows before anything else that this room is
          // not part of the mountain.
          strip(slab.offset, slab.width, y - 0.05, 0.18, 0.045, graphiteMat, 0.4);
          strip(slab.offset, slab.width, y - 0.01, 0.06, 0.02, ctx.materials.get('lumenCyan'), 0.34);
          strip(slab.offset, slab.width, y + 0.13, 0.045, 0.1, steelPale, 0.4);
        } else {
          // The bio strand's version: a vein that has grown along the channel,
          // in the one colour that belongs to neither half of the map.
          strip(slab.offset, slab.width, y - 0.08, 0.22, 0.06, ctx.materials.get('sinew'), 0.4);
          const count = Math.max(2, Math.round(slab.width / 0.64));
          for (let i = 0; i < count; i++) {
            const x = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / count;
            strip(x, 0.24, y - 0.02, 0.09, 0.085, ctx.materials.get('chitin'), 0.24);
          }
        }
      }

      if (bandStyle !== 'none' && slab.y1 > bandHeight) {
        strip(slab.offset, slab.width, bandHeight, 0.05, 0.065, steelDark, 0.7);
        if (built) {
          // Stiffeners: the vertical ribs that make a band read as plate rather
          // than as a stripe of paint.
          const count = Math.max(1, Math.round(slab.width / 1.4));
          for (let i = 0; i <= count; i++) {
            const x = slab.offset - slab.width / 2 + (slab.width * i) / count;
            strip(x, 0.075, KICK_HEIGHT, bandHeight - KICK_HEIGHT, 0.035, steelMat, 0.5);
          }
        }
      }

      // A rail crosses a port's sill, so a wall with one goes without.
      if (options.rail && built && !hasPort && slab.y1 > RAIL_Y + 0.12) {
        strip(slab.offset, slab.width, RAIL_Y, 0.055, 0.12, steelMat, 0.6);
        strip(slab.offset, slab.width, RAIL_Y - 0.05, 0.05, 0.055, steelDark, 0.4);
      }
    }

    // The cornice runs above every opening the shell can cut, so it crosses the
    // whole wall rather than breaking over each hatchway.
    if (options.seam !== false) {
      if (built) {
        strip(0, cellSize, ceilingHeight - 0.24, 0.24, 0.11, steelDark, 1.1);
        // A cable tray tucked into the corner, because there always is one.
        strip(0, cellSize, ceilingHeight - 0.42, 0.08, 0.22, cableMat, 0.5);
        strip(0, cellSize, ceilingHeight - 0.34, 0.05, 0.26, steelMat, 0.4);
      } else {
        strip(0, cellSize, ceilingHeight - 0.3, 0.3, 0.18, rockMat, 1.0);
        strip(0, cellSize, ceilingHeight - 0.36, 0.08, 0.26, ashMat, 0.6);
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
   * The ring around an opening. A hole in a blast wall is never a clean
   * rectangle: it is a machined frame with the shutter parked in a header box
   * over it, and the floor in front of it is painted so you know where the
   * shutter lands.
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

    if (mouthStyle === 'blast') {
      // Jambs: a machined frame standing proud of the wall, with guide channels
      // for the shutter cut down the inside of each one.
      for (const s of [-1, 1]) {
        put(steelMat, 0.24, head + 0.5, 0.28, s * (half + 0.12), (head + 0.5) / 2, 0.14, 0, 0.7);
        put(graphiteMat, 0.07, head + 0.44, 0.36, s * (half + 0.03), (head + 0.44) / 2, 0.2, 0, 0.35);
        put(steelPale, 0.05, head + 0.32, 0.1, s * (half + 0.21), (head + 0.32) / 2, 0.17, 0, 0.3);
        // Latch bolts down the jamb: this door was made to be sealed.
        for (let i = 0; i < 3; i++) {
          const y = 0.55 + i * (head / 3.1);
          put(steelPale, 0.12, 0.1, 0.17, s * (half + 0.22), y, 0.25, 0, 0.25);
          batch.add(
            graphiteMat,
            cyl(0.035, 0.035, 0.15, 6),
            tiltMatrix(at(s * (half + 0.22), y, 0.32), [Math.PI / 2, yaw, 0]),
            { tile: 0.3, castShadow: false },
          );
        }
      }
      // The header box: the shutter is parked up there, and you can see the
      // bottom edge of it. This is what makes a doorway in this map read as
      // something that can be closed on you.
      put(steelMat, opening.width + 0.74, 0.42, 0.34, 0, head + 0.21, 0.17, 0, 0.9);
      put(temperedMat, opening.width + 0.5, 0.09, 0.12, 0, head + 0.045, 0.2, 0, 0.5);
      put(hazardMat, opening.width + 0.62, 0.1, 0.36, 0, head + 0.44, 0.18, 0, 0.4);
      // Knee braces either end of the header.
      for (const s of [-1, 1]) {
        put(steelMat, 0.32, 0.32, 0.22, s * (half + 0.3), head - 0.02, 0.17, s * 0.78, 0.4);
      }
      // A low threshold plate across the sill, six centimetres, so it reads as a
      // shutter track and never as something a player has to step over -
      // collision is a floor-plane test and this deliberately carries no
      // collider.
      put(hazardMat, opening.width + 0.34, 0.05, 0.44, 0, 0.025, 0.13, 0, 0.5);
      put(graphiteMat, opening.width + 0.34, 0.03, 0.1, 0, 0.055, 0.34, 0, 0.3);
    } else if (mouthStyle === 'fissure') {
      // A hole in rock, with the lip of a flow that came through it once.
      // Sampled all the way round as one loop rather than as jambs plus a
      // lintel: the corners are exactly where a four-piece frame gives itself
      // away, and a natural opening has no corners at all.
      // Thirteen lumps, not eighteen, each one bigger to close the gaps that
      // leaves, and through `ball()` so the ramp in lib/build.ts can size them:
      // a mouth is built on every opening of every room, so its step count is
      // multiplied by the whole map before a single prop is placed in one.
      const steps = 13;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const a = t * Math.PI * 2;
        const along = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.6) * (half + 0.22);
        const rise = head / 2 + Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.6) * (head / 2 + 0.16);
        if (rise < 0.1) continue; // the floor takes the bottom of the ring
        // Roughly equidimensional lumps: stretched along the ring they come out
        // as a chain of sausages, which reads as something anatomical rather
        // than as broken rock.
        const lump = 0.21 + Math.abs(Math.sin(a * 2.4 + 0.9)) * 0.11;
        batch.add(
          rockMat,
          ball(lump),
          tiltMatrix(at(along, rise, 0.08 + lump * 0.3), [0, yaw, a], [1.1, 0.95, 0.85]),
          { tile: 0.5, castShadow: false },
        );
      }
      // Two drips of cooled lava over the head of the opening: the flow that got
      // this far and stopped. It is the detail that dates the hole.
      for (const s of [-1, 1]) {
        batch.add(
          cinderMat,
          spike(0.1, 0.42, 5),
          tiltMatrix(at(s * half * 0.62, head + 0.02, 0.13), [Math.PI, yaw, 0]),
          { tile: 0.3, castShadow: false },
        );
      }
    } else {
      // Collar: a steel liner driven into rock, at the seam between the Works
      // and the mountain. Clean on the inside, grouted and bleeding rubble on
      // the outside, and the only mouth that admits both materials at once.
      for (const s of [-1, 1]) {
        put(temperedMat, 0.2, head + 0.3, 0.34, s * (half + 0.1), (head + 0.3) / 2, 0.17, 0, 0.5);
        put(rockMat, 0.24, head + 0.4, 0.16, s * (half + 0.26), (head + 0.4) / 2, 0.08, 0, 0.4);
      }
      put(temperedMat, opening.width + 0.56, 0.22, 0.34, 0, head + 0.11, 0.17, 0, 0.6);
      const segments = 7;
      for (let i = 0; i <= segments; i++) {
        const a = Math.PI * (i / segments);
        put(rockMat, 0.26, 0.22, 0.2, -Math.cos(a) * (half + 0.3), head + 0.1 + Math.sin(a) * 0.26, 0.06, 0, 0.35);
      }
      put(graphiteMat, opening.width + 0.2, 0.05, 0.24, 0, 0.025, 0.16, 0, 0.3);
    }
  }

  /**
   * A port: an aperture in a wall the generator can never open. This pack's
   * window, and in the case of `slit` its most important object - the whole
   * premise of the map is that you can see what the facility is standing over.
   */
  function buildPort(spec: PortSpec, side: Side, cx: number, cz: number, opening: { width: number; y0: number; y1: number }): void {
    const { yaw, at } = frame(side, cx, cz);
    const h = opening.y1 - opening.y0;
    const midY = (opening.y0 + opening.y1) / 2;
    const kind = spec.kind ?? 'slit';
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

    if (kind === 'screens') {
      // Not a window: a recessed rack of screens. It lights the room and it is
      // the only thing in the Works still doing its job.
      put(graphiteMat, opening.width + 0.26, h + 0.26, 0.13, 0, midY, -0.02, 0.6);
      const cols = 4;
      const rows = 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const w = opening.width / cols - 0.09;
          const hh = h / rows - 0.1;
          const along = -opening.width / 2 + (opening.width * (c + 0.5)) / cols;
          const y = opening.y0 + (h * (r + 0.5)) / rows;
          const live = rng() > 0.3;
          const face = live ? (rng() > 0.6 ? 'screenSeismo' : rng() > 0.4 ? 'screenMimic' : 'screenData') : 'screenDead';
          put(graphiteMat, w + 0.07, hh + 0.07, 0.14, along, y, 0.06, 0.35);
          pane(ctx.materials.get(face), w, hh, along, y, 0.14);
        }
      }
      put(steelMat, opening.width + 0.32, 0.1, 0.28, 0, opening.y1 + 0.1, 0.11, 0.4);
      put(steelMat, opening.width + 0.32, 0.15, 0.36, 0, opening.y0 - 0.09, 0.15, 0.4);
    } else if (kind === 'grille') {
      // A pressure-relief louvre. Hot air comes out of it, and the wall above it
      // is stained where twenty years of that has been going on.
      pane(ctx.materials.get('hazeWarm'), opening.width, h, 0, midY, -0.05);
      put(ctx.materials.get('surface.crust'), opening.width - 0.1, h - 0.1, 0.06, 0, midY, -0.08, 0.3);
      put(graphiteMat, opening.width + 0.22, h + 0.22, 0.11, 0, midY, 0.02, 0.5);
      const slats = 6;
      for (let i = 0; i < slats; i++) {
        const y = opening.y0 + (h * (i + 0.5)) / slats;
        batch.add(steelMat, boxGeometry(opening.width, 0.1, 0.2), tiltMatrix(at(0, y, 0.09), [0.6, yaw, 0]), {
          tile: 0.5,
          castShadow: false,
        });
      }
      put(ctx.materials.get('signAmber'), opening.width - 0.34, 0.05, 0.04, 0, opening.y0 + 0.05, -0.02, 0.3);
      // The scorch plume above it.
      put(graphiteMat, opening.width * 0.8, 0.9, 0.012, 0, opening.y1 + 0.45, -0.01, 0.9);
    } else if (kind === 'sealed') {
      /**
       * A blast door that was welded shut, and then bulged. The bulge is the
       * whole point: the plate is dished OUT into the room, so whatever it was
       * closed against was on the far side and was pushing this way.
       */
      put(temperedMat, opening.width + 0.3, h + 0.3, 0.16, 0, midY, 0.02, 0.7);
      // Dished plate, built as four leaning panels round a proud centre.
      put(temperedMat, opening.width * 0.98, h * 0.5, 0.12, 0, midY + h * 0.24, 0.14, 0.6);
      put(temperedMat, opening.width * 0.98, h * 0.5, 0.12, 0, midY - h * 0.24, 0.14, 0.6);
      put(temperedMat, opening.width * 0.7, h * 0.62, 0.16, 0, midY, 0.23, 0.5);
      // Weld beads all round: somebody did this in a hurry and from this side.
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        put(steelPale, 0.2, 0.07, 0.09, Math.cos(a) * (opening.width / 2 + 0.04), midY + Math.sin(a) * (h / 2 + 0.03), 0.11, 0.2);
      }
      // Two stencil blocks and a hazard bar across it.
      put(hazardMat, opening.width * 0.86, 0.16, 0.03, 0, midY - h * 0.34, 0.3, 0.35);
      put(ctx.materials.get('signRed'), 0.4, 0.12, 0.03, opening.width * 0.26, midY + h * 0.3, 0.3, 0.2);
      // A hand's worth of dents from the inside, low down.
      for (let i = 0; i < 4; i++) {
        put(steelDark, 0.15, 0.13, 0.07, (rng() - 0.5) * opening.width * 0.7, opening.y0 + rng() * h * 0.5, 0.27, 0.2);
      }
    } else if (kind === 'crack') {
      /**
       * Not an aperture anybody built: the wall has split, and there is a room's
       * worth of heat behind it. A jagged column rather than a rectangle - the
       * opening the shell cut is only the budget it fits inside.
       */
      pane(ctx.materials.get('backdropShaft'), opening.width + 0.5, h + 0.5, 0, midY, -0.55);
      const steps = 9;
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        const y = opening.y0 + h * t;
        const w = (0.2 + Math.sin(t * Math.PI) * 0.55) * opening.width;
        const drift = (rng() - 0.5) * opening.width * 0.28;
        put(crustMat, w, h / steps + 0.03, 0.1, drift, y, -0.14, 0.3);
        // The lips of the crack, standing proud and dark, so the glow is a hole
        // and not a painted stripe.
        for (const s of [-1, 1]) {
          batch.add(
            rockMat,
            ball(0.16 + rng() * 0.09, 6),
            tiltMatrix(at(drift + (s * w) / 2, y, 0.06), [0, yaw, rng() * 3], [1.05, 1.25, 0.7]),
            { tile: 0.4, castShadow: false },
          );
        }
      }
    } else if (kind === 'bore') {
      /**
       * A round bore driven straight through to the outside, seen from a very
       * long way down it. The one piece of sky in the map, and it is still not
       * daylight - the ash cloud over the vent never clears.
       */
      const r = Math.min(opening.width, h) * 0.46;
      pane(ctx.materials.get('backdropSky'), r * 2.3, r * 2.3, 0, midY, -0.5);
      // The barrel of the bore, so the sky is at the far end of a tube.
      batch.add(rockMat, cyl(r * 1.05, r * 1.05, 1.1, 16, true), tiltMatrix(at(0, midY, -0.5), [Math.PI / 2, yaw, 0]), {
        tile: 0.7,
        castShadow: false,
      });
      // A steel liner ring where it was cut through the wall, and a grating over
      // it - the hole is real, and this is what stops things coming down it.
      // Graphite rather than bright steel, and three thin bars rather than a
      // full grid: a polished ring with a cross in it reads as a porthole with a
      // plus sign painted on it, and what has to read here is the depth behind.
      batch.add(graphiteMat, new THREE.TorusGeometry(r * 1.08, 0.05, 5, 16), poseMatrix(at(0, midY, 0.05), yaw), {
        tile: 0.4,
        castShadow: false,
        consume: true,
      });
      for (let i = 0; i < 3; i++) {
        put(graphiteMat, r * 2.0, 0.03, 0.04, 0, midY - r * 0.55 + (r * 1.1 * i) / 2, 0.02, 0.2);
      }
    } else {
      /* --- the slit ------------------------------------------------------- */
      /**
       * A viewing slit into a shaft that should not be open. Built in five
       * layers, front to back, and the ORDER is the whole thing:
       *
       *   1. the surround: a heavy machined frame standing proud of the wall
       *   2. the glazing - a highlight and a gold film, never a glow
       *   3. a faint haze volume INSIDE the glass, giving the shaft depth
       *   4. the scene: whatever this one looks out at
       *   5. the backdrop, a picture of the shaft, 1.1 m back
       *
       * Nothing translucent ever goes in FRONT of something lit
       * (ROOM_REVIEW.md) - the haze sits behind the glass, and the glass carries
       * almost no opacity of its own, or the whole window greys over.
       */
      const back = -1.1;

      pane(ctx.materials.get(spec.scene === 'sky' ? 'backdropSky' : 'backdropShaft'), opening.width + 1.1, h + 1.0, 0, midY + 0.08, back);
      pane(ctx.materials.get('hazeWarm'), opening.width + 0.5, h + 0.36, 0, midY, back * 0.45);
      pane(ctx.materials.get('hazeWarm'), opening.width + 0.2, h + 0.1, 0, midY, back * 0.16);

      buildPortScene(spec.scene ?? 'shaft', at, yaw, opening, back);

      // The glazing: laminate, plus the gold radiant film that makes anything
      // behind it read as much hotter than it is.
      batch.add(ctx.materials.get('glassPane'), new THREE.PlaneGeometry(opening.width, h), poseMatrix(at(0, midY, 0.02), yaw), {
        castShadow: false,
        receiveShadow: false,
        consume: true,
      });
      batch.add(ctx.materials.get('goldFilm'), new THREE.PlaneGeometry(opening.width, h), poseMatrix(at(0, midY, 0.05), yaw), {
        castShadow: false,
        receiveShadow: false,
        consume: true,
      });
      for (const s of [-1, 1]) {
        put(ctx.materials.get('glassEdge'), 0.07, h, 0.3, (s * opening.width) / 2, midY, 0, 0.4);
      }
      put(ctx.materials.get('glassEdge'), opening.width, 0.07, 0.3, 0, opening.y1, 0, 0.4);
      put(ctx.materials.get('glassEdge'), opening.width, 0.07, 0.3, 0, opening.y0, 0, 0.4);

      // The surround: a heavy clamped frame, bolted every 40 cm. This is what
      // sells the pressure - a big window with a thin frame reads as a picture.
      put(steelMat, opening.width + 0.5, 0.26, 0.44, 0, opening.y1 + 0.13, 0.09, 0.7);
      put(steelMat, opening.width + 0.5, 0.32, 0.48, 0, opening.y0 - 0.16, 0.11, 0.7);
      for (const s of [-1, 1]) {
        put(steelMat, 0.26, h + 0.62, 0.44, (s * (opening.width + 0.26)) / 2, midY, 0.09, 0.7);
        put(graphiteMat, 0.1, h + 0.52, 0.52, (s * (opening.width + 0.44)) / 2, midY, 0.15, 0.4);
      }
      const bolts = Math.max(3, Math.round(opening.width / 0.42));
      for (let i = 0; i < bolts; i++) {
        const along = -opening.width / 2 + (opening.width * (i + 0.5)) / bolts;
        for (const y of [opening.y1 + 0.13, opening.y0 - 0.15]) {
          put(steelPale, 0.07, 0.07, 0.09, along, y, 0.31, 0.2);
        }
      }
      // Heat staining running up the wall above the frame, and a crack in the
      // laminate on about half of them.
      put(graphiteMat, opening.width * 0.7, 0.7, 0.012, 0, opening.y1 + 0.65, -0.01, 0.9);
      if (rng() > 0.5) {
        const cx0 = (rng() - 0.5) * opening.width * 0.5;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + 0.4;
          const len = 0.15 + (i % 2) * 0.2;
          batch.add(
            ctx.materials.get('glassCrack'),
            boxGeometry(len, 0.012, 0.012),
            tiltMatrix(at(cx0 + Math.cos(a) * len * 0.5, midY + Math.sin(a) * len * 0.5, 0.07), [0, yaw, a]),
            { tile: 0.2, castShadow: false, receiveShadow: false },
          );
        }
      }
    }

    if (spec.light) {
      const colour = kind === 'screens' ? 0x64c8e0 : kind === 'bore' ? 0x6a7a90 : 0xff7a28;
      const lamp = new THREE.PointLight(colour, kind === 'screens' ? 9 : 13, cellSize * 1.6, 2);
      lamp.position.set(...at(0, midY, 0.6));
      extra.add(lamp);
      lights.push(lamp);
    }

    portAnchors.push({ position: at(0, midY, 0), side, kind });
  }

  /**
   * What is on the other side of a slit. Everything here sits between the glass
   * and the backdrop, so it is silhouetted against the glow - which is why the
   * shapes matter far more than the surfaces: at that distance and that light
   * level you are reading outlines and nothing else.
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

    if (scene === 'lake') {
      // A surface of crusted magma a long way below the sill, with plates on it
      // and a fountain going up at the back. Read as a floor, not as a wall.
      batch.add(
        ctx.materials.get('surface.magma'),
        boxGeometry(opening.width + 1.6, 0.1, 1.5),
        tiltMatrix(at(0, floorY - 0.1, back * 0.55), [0.1, yaw, 0]),
        { tile: 1.1, castShadow: false },
      );
      for (let i = 0; i < 5; i++) {
        batch.add(
          ctx.materials.get('rockDark'),
          ball(r(0.14, 0.3), 6),
          tiltMatrix(at(r(-span, span), floorY - 0.02, r(back * 0.85, back * 0.3)), [0, r(0, 3), 0], [1.6, 0.35, 1.2]),
          { tile: 0.5, castShadow: false },
        );
      }
      // The fountain: a column of bright specks going up and falling back.
      for (let i = 0; i < 14; i++) {
        batch.add(
          ctx.materials.get('lumenMolten'),
          ball(r(0.02, 0.055), 4),
          poseMatrix(at(r(-span * 0.5, span * 0.5), floorY + r(0.05, opening.y1 - floorY), back * r(0.5, 0.85))),
          { castShadow: false },
        );
      }
    } else if (scene === 'gantry') {
      // Looking down the outside of the facility: a stack of catwalks running
      // out of frame both ways, with the glow coming up between them.
      const iron = ctx.materials.get('tempered');
      for (let i = 0; i < 3; i++) {
        const y = floorY + 0.25 + i * ((opening.y1 - floorY) / 3);
        batch.add(iron, boxGeometry(opening.width * 1.6, 0.07, 0.5), tiltMatrix(at(r(-0.3, 0.3), y, back * r(0.5, 0.8)), [0, yaw, r(-0.05, 0.05)]), {
          tile: 0.8,
          castShadow: false,
        });
        for (let p = 0; p < 5; p++) {
          batch.add(iron, boxGeometry(0.05, 0.5, 0.05), poseMatrix(at(-span + p * (span / 2), y + 0.25, back * 0.62)), {
            tile: 0.3,
            castShadow: false,
          });
        }
      }
      // Two dark verticals running the whole height: the columns it hangs off.
      for (const s of [-1, 1]) {
        batch.add(ctx.materials.get('graphite'), boxGeometry(0.26, (opening.y1 - floorY) * 2, 0.26), poseMatrix(at(s * span * 1.05, floorY, back * 0.7)), {
          tile: 0.6,
          castShadow: false,
        });
      }
    } else if (scene === 'sky') {
      // The rim of the bore, far above, and the ash falling down it. Nothing
      // else - the emptiness is the point.
      for (let i = 0; i < 20; i++) {
        batch.add(
          ctx.materials.get('ashPale'),
          ball(r(0.012, 0.03), 4),
          poseMatrix(at(r(-span * 1.2, span * 1.2), r(opening.y0, opening.y1), r(back * 0.9, back * 0.15))),
          { castShadow: false },
        );
      }
      for (let i = 0; i < 3; i++) {
        batch.add(
          ctx.materials.get('rockDark'),
          ball(r(0.2, 0.4), 6),
          tiltMatrix(at(r(-span, span), opening.y0 - 0.1, back * 0.8), [0, r(0, 3), 0], [1.4, 0.6, 1]),
          { tile: 0.6, castShadow: false },
        );
      }
    } else {
      // The shaft: two rock walls closing in, a few things falling, and one
      // ledge with something standing on it that is not quite readable.
      for (const s of [-1, 1]) {
        batch.add(
          ctx.materials.get('rockDark'),
          boxGeometry(0.7, (opening.y1 - floorY) * 2.2, 0.9),
          tiltMatrix(at(s * (span + 0.5), floorY, back * 0.7), [0, yaw + s * 0.2, s * 0.1]),
          { tile: 1.0, castShadow: false },
        );
      }
      for (let i = 0; i < 4; i++) {
        batch.add(
          ctx.materials.get('cinder'),
          ball(r(0.1, 0.24), 6),
          tiltMatrix(at(r(-span, span), r(opening.y0, opening.y1), r(back * 0.85, back * 0.35)), [0, r(0, 3), 0], [1.3, 0.8, 1.1]),
          { tile: 0.5, castShadow: false },
        );
      }
      for (let i = 0; i < 12; i++) {
        batch.add(
          ctx.materials.get('ember'),
          ball(r(0.012, 0.032), 4),
          poseMatrix(at(r(-span * 1.1, span * 1.1), r(opening.y0 - 0.2, opening.y1), r(back * 0.9, back * 0.2))),
          { castShadow: false },
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
      case 'beams': {
        /**
         * Rolled I-beams across the short way, with the deck plate showing
         * between them. Sampled as three boxes each so the flange reads.
         *
         * Worth knowing before you investigate one: a raised corner view on a
         * contact sheet is parked at about beam height, so an eight-metre girder
         * passing a hand's breadth from the camera blacks out most of the frame.
         * That is the camera, not the room - a player's eye is at 1.6 m and never
         * gets near them. It is the same finding as the crypt's groin vaults.
         */
        for (let i = 0; i < 4; i++) {
          const z = cz - cellSize / 2 + cellSize * ((i + 0.5) / 4);
          const y = ceilingHeight - 0.26;
          batch.add(steelMat, boxGeometry(cellSize, 0.05, 0.32), poseMatrix([cx, y + 0.17, z]), { tile: 1.0, ...CEILING_OPTS });
          batch.add(graphiteMat, boxGeometry(cellSize, 0.3, 0.08), poseMatrix([cx, y, z]), { tile: 0.8, ...CEILING_OPTS });
          batch.add(steelMat, boxGeometry(cellSize, 0.05, 0.28), poseMatrix([cx, y - 0.17, z]), { tile: 1.0, ...CEILING_OPTS });
          for (const s of [-1, 1]) {
            batch.add(steelMat, boxGeometry(0.5, 0.32, 0.09), tiltMatrix([cx + s * (cellSize / 2 - 0.35), y - 0.02, z], [0, 0, s * 0.5]), {
              tile: 0.4,
              ...CEILING_OPTS,
            });
          }
        }
        break;
      }
      case 'pipes': {
        // Bundled service runs at three heights, with hanger straps. The single
        // fastest way to make a ceiling read as machinery rather than as a lid.
        const radii = [0.15, 0.09, 0.12, 0.06];
        for (let i = 0; i < 4; i++) {
          const z = cz - cellSize / 2 + cellSize * ((i + 0.7) / 4.6);
          const y = ceilingHeight - 0.3 - (i % 2) * 0.17;
          const radius = radii[i] ?? 0.1;
          batch.add(
            i % 3 === 0 ? ctx.materials.get('copperBus') : steelMat,
            cyl(radius, radius, cellSize, 8),
            tiltMatrix([cx, y, z], [0, 0, Math.PI / 2]),
            { tile: 0.7, ...CEILING_OPTS },
          );
          // Lagging bandages and flanges: a pipe without joints is a rod.
          for (const t of [-0.3, 0.14]) {
            batch.add(
              ctx.materials.get('canvasPale'),
              cyl(radius * 1.45, radius * 1.45, 0.16, 8),
              tiltMatrix([cx + t * cellSize, y, z], [0, 0, Math.PI / 2]),
              { tile: 0.3, ...CEILING_OPTS },
            );
          }
          for (const t of [-0.34, 0.02, 0.36]) {
            batch.add(steelDark, boxGeometry(0.05, 0.36, radius * 2.6), poseMatrix([cx + t * cellSize, ceilingHeight - 0.16, z]), {
              tile: 0.3,
              ...CEILING_OPTS,
            });
          }
        }
        break;
      }
      case 'cable': {
        // Cable trays: a ladder rack with bundles lying in it, and one drop loop.
        for (let i = 0; i < 2; i++) {
          const z = cz - cellSize / 2 + cellSize * (i === 0 ? 0.32 : 0.7);
          const y = ceilingHeight - 0.36;
          for (const s of [-1, 1]) {
            batch.add(steelMat, boxGeometry(cellSize, 0.11, 0.04), poseMatrix([cx, y, z + s * 0.23]), { tile: 0.8, ...CEILING_OPTS });
          }
          for (let r2 = 0; r2 < 12; r2++) {
            batch.add(steelDark, boxGeometry(0.05, 0.03, 0.46), poseMatrix([cx - cellSize / 2 + (cellSize * (r2 + 0.5)) / 12, y - 0.04, z]), {
              tile: 0.2,
              ...CEILING_OPTS,
            });
          }
          for (const [dz, radius] of [[-0.1, 0.055], [0.02, 0.075], [0.13, 0.04]] as const) {
            batch.add(cableMat, cyl(radius, radius, cellSize, 6), tiltMatrix([cx, y + 0.05, z + dz], [0, 0, Math.PI / 2]), {
              tile: 0.4,
              ...CEILING_OPTS,
            });
          }
        }
        batch.add(cableMat, new THREE.TorusGeometry(0.36, 0.05, 5, 10, Math.PI), tiltMatrix([cx + cellSize * 0.2, ceilingHeight - 0.42, cz - cellSize * 0.2], [0, 0.6, 0]), {
          tile: 0.3,
          ...CEILING_OPTS,
          consume: true,
        });
        break;
      }
      case 'trusses': {
        // Open truss girders with the void above them. For the big volumes.
        for (let i = 0; i < 2; i++) {
          const z = cz - cellSize / 2 + cellSize * (i === 0 ? 0.28 : 0.72);
          const top = ceilingHeight - 0.14;
          const bottom = ceilingHeight - 0.8;
          batch.add(steelMat, boxGeometry(cellSize, 0.1, 0.15), poseMatrix([cx, top, z]), { tile: 0.9, ...CEILING_OPTS });
          batch.add(steelMat, boxGeometry(cellSize, 0.1, 0.15), poseMatrix([cx, bottom, z]), { tile: 0.9, ...CEILING_OPTS });
          const bays = 7;
          for (let b = 0; b <= bays; b++) {
            const x = cx - cellSize / 2 + (cellSize * b) / bays;
            batch.add(graphiteMat, boxGeometry(0.07, top - bottom, 0.11), poseMatrix([x, (top + bottom) / 2, z]), { tile: 0.3, ...CEILING_OPTS });
            if (b < bays) {
              const run = cellSize / bays;
              const diag = Math.hypot(run, top - bottom);
              batch.add(graphiteMat, boxGeometry(diag, 0.055, 0.08), tiltMatrix([x + run / 2, (top + bottom) / 2, z], [0, 0, (b % 2 ? 1 : -1) * Math.atan2(top - bottom, run)]), {
                tile: 0.3,
                ...CEILING_OPTS,
              });
            }
          }
        }
        break;
      }
      case 'rock': {
        /**
         * The roof of the chamber: lumps, in two materials and squashed flat.
         *
         * Six-segment spheres poking through a ceiling show only their bottom cap,
         * and at 0.8 of their own height that cap is a hard-edged polygon - on the
         * first contact sheet the caldera's roof read as dark panels floating over
         * the lake rather than as rock. Squashed to 0.4 and alternated with cinder
         * they read as a knobbly surface instead.
         */
        for (let i = 0; i < 13; i++) {
          const ax = cx - cellSize / 2 + cellSize * ((((i * 5) % 13) + 0.5) / 13);
          const az = cz - cellSize / 2 + cellSize * ((((i * 7) % 13) + 0.5) / 13);
          const size = 0.55 + ((i * 37) % 11) / 14;
          batch.add(i % 3 === 0 ? cinderMat : rockMat, ball(size, 7), tiltMatrix([ax, ceilingHeight + size * 0.62, az], [0, i, 0], [1.35, 0.4, 1.25]), {
            tile: 1.2,
            ...CEILING_OPTS,
          });
        }
        break;
      }
      case 'tube': {
        /**
         * The roof of a lava tube. What hangs off one is not a stalactite: it is
         * a **lavacicle**, a drip of the flow that was running along the ceiling
         * when the tube drained, and they hang in rows along the flow direction
         * rather than scattered.
         */
        for (let row = 0; row < 3; row++) {
          const az = cz - cellSize / 2 + cellSize * ((row + 0.6) / 3.4);
          batch.add(cinderMat, boxGeometry(cellSize, 0.22, 0.5), poseMatrix([cx, ceilingHeight - 0.1, az]), {
            tile: 1.0,
            ...CEILING_OPTS,
          });
          for (let i = 0; i < 6; i++) {
            const ax = cx - cellSize / 2 + cellSize * ((i + 0.5 + ((row * 3) % 4) * 0.1) / 6);
            const len = 0.18 + ((i * 41 + row * 13) % 11) / 22;
            batch.add(cinderMat, spike(0.085, len, 5), poseMatrix([ax, ceilingHeight - 0.2 - len / 2, az]), {
              tile: 0.35,
              ...CEILING_OPTS,
            });
          }
        }
        break;
      }
      case 'duct':
      default: {
        // The service grid holding the panels up, one duct run and one dead
        // recessed fitting.
        for (const t of [-0.25, 0.25]) {
          batch.add(graphiteMat, boxGeometry(cellSize, 0.09, 0.1), poseMatrix([cx, ceilingHeight - 0.05, cz + t * cellSize]), { tile: 0.7, ...CEILING_OPTS });
          batch.add(graphiteMat, boxGeometry(0.1, 0.09, cellSize), poseMatrix([cx + t * cellSize, ceilingHeight - 0.05, cz]), { tile: 0.7, ...CEILING_OPTS });
        }
        batch.add(steelDark, boxGeometry(0.9, 0.34, cellSize), poseMatrix([cx - cellSize * 0.24, ceilingHeight - 0.2, cz]), { tile: 0.8, ...CEILING_OPTS });
        batch.add(steelMat, boxGeometry(0.98, 0.05, cellSize), poseMatrix([cx - cellSize * 0.24, ceilingHeight - 0.38, cz]), { tile: 0.5, ...CEILING_OPTS });
        batch.add(graphiteMat, boxGeometry(1.3, 0.1, 0.44), poseMatrix([cx + cellSize * 0.22, ceilingHeight - 0.06, cz - cellSize * 0.2]), { tile: 0.5, ...CEILING_OPTS });
        batch.add(ctx.materials.get('screenDead'), boxGeometry(1.1, 0.05, 0.28), poseMatrix([cx + cellSize * 0.22, ceilingHeight - 0.13, cz - cellSize * 0.2]), {
          tile: 0.4,
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
        const kind = port.kind ?? 'slit';
        // Every one of these starts well above the floor, so the wall keeps one
        // collider across its whole run. A decorative opening must never be a
        // hole a player can walk into.
        if (kind === 'screens') opening = { width: 2.4, y0: 1.0, y1: 2.15 };
        else if (kind === 'grille') opening = { width: 1.2, y0: 0.62, y1: 1.5 };
        else if (kind === 'sealed') opening = { width: 1.6, y0: 0.5, y1: 2.5 };
        else if (kind === 'crack') opening = { width: 1.1, y0: 0.55, y1: ceilingHeight - 0.5 };
        else if (kind === 'bore') opening = { width: 1.5, y0: 1.05, y1: 2.55 };
        else opening = port.tall ? { width: 4.0, y0: 0.62, y1: ceilingHeight - 0.6 } : { width: 2.6, y0: 1.0, y1: 2.4 };
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
 * The contract-facing kit. Forge rooms call `addShell()` directly so they can
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
