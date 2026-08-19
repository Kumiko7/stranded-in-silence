/**
 * Kerberos Deep's shell: decks, bulkheads, ceilings, trim, hatchways and ports.
 *
 * Every room calls this first and then decorates, which is what guarantees door
 * openings line up between neighbours no matter who authored the rooms either
 * side. The style options are the pack's main lever for variety: the same
 * function builds a tiled surgical wet lab and a basalt cave with the trench
 * coming through the floor.
 *
 * Five things worth knowing before you use it:
 *
 * - It writes into a `MeshBatcher` rather than building meshes. An abyss room is
 *   several hundred boxes of plate, pipe and coral; batched, that is a handful
 *   of draw calls. See `art/lib/merge.ts`.
 * - **Every opening gets a mouth.** A hatchway cut in a pressure hull is a
 *   welded coaming with dogging lugs; one cut in rock is a ragged arch furred
 *   with barnacle. That ring is the single detail that makes the whole pack read
 *   as one place, so it lives in the shell rather than being left to each room.
 * - **Every room gets a strip.** The station's emergency circuit and the abyss's
 *   bioluminescent seep are the same object: an emissive line along the base of
 *   every wall, broken at the doorways. It costs no light budget and it is what
 *   guarantees the rule in ROOM_FORMAT.md §6 - a player with no torch can always
 *   read the layout and find the doors.
 * - **A port may only go on a side the blueprint never opens as a door.** The
 *   generator decides doors at run time, so the only walls guaranteed solid are
 *   the ones missing from `doorWalls`. Passing `doorWalls` in lets the shell
 *   throw immediately rather than shipping a room with a window in a doorway.
 * - **A viewpane leans about 1.3 m out of its room** to hold the water behind
 *   the glass. That is deliberate and handled - a room is culled by the cells its
 *   geometry reaches, not the cells it occupies (ROOM_FORMAT.md §7).
 */
import * as THREE from 'three';
import type { BuiltPiece, Cell, Collider, PackKit, RoomBuildContext, Side } from '../../../lib/contract';
import { SIDES, doorKey } from '../../../lib/contract';
import { boxCollider, boxGeometry } from '../../../lib/build';
import { MeshBatcher, poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ball, cyl, disc, spike } from './props';
import * as tex from '../textures';

export type FloorStyle = 'deck' | 'tile' | 'concrete' | 'silt' | 'rock' | 'crust' | 'salt' | 'algae';
export type WallStyle = 'hull' | 'paint' | 'tile' | 'concrete' | 'rust' | 'rock' | 'crust' | 'algae';
export type CeilingStyle = 'panels' | 'beams' | 'pipes' | 'conduit' | 'trusses' | 'rock' | 'rusticles' | 'open';
/** The lower band of the wall, where a different material takes over. */
export type BandStyle = 'none' | 'hazard' | 'rust' | 'crust' | 'tile' | 'steel' | 'algae';
/** What the ring around a hatchway is made of. */
export type MouthStyle = 'bulkhead' | 'arch' | 'collar' | 'none';
/** The emissive line along the base of every wall. Free light, and the map's spine. */
export type StripStyle = 'none' | 'amber' | 'cyan' | 'red' | 'bio';

export type PortKind = 'porthole' | 'viewpane' | 'grille' | 'monitors';
/** What is on the far side of a viewpane. */
export type PortScene = 'open' | 'kelp' | 'coral' | 'swarm' | 'wreck';

export interface PortSpec {
  readonly cell?: Cell;
  readonly side: Side;
  readonly kind?: PortKind;
  readonly scene?: PortScene;
  /** Adds a practical behind it. Counts against the room's light budget. */
  readonly light?: boolean;
  /** Floor to near-ceiling, for a room that wants one wall to be mostly window. */
  readonly tall?: boolean;
}

export interface ShellOptions {
  readonly floor?: FloorStyle;
  readonly wall?: WallStyle;
  readonly ceiling?: CeilingStyle;
  readonly band?: BandStyle;
  /** Height the band reaches. Default 1.1 m. */
  readonly bandHeight?: number;
  /** The kick plate / silt drift where wall meets floor. On by default. */
  readonly kick?: boolean;
  /** A rub rail at hand height, the way a working corridor is fitted out. */
  readonly rail?: boolean;
  /** The cornice where wall meets ceiling. On by default. */
  readonly seam?: boolean;
  readonly mouth?: MouthStyle;
  readonly strip?: StripStyle;
  readonly ports?: readonly PortSpec[];
  /** Sides the blueprint may open. Required if `ports` is set. */
  readonly doorWalls?: readonly { readonly cell: Cell; readonly side: Side }[];
}

const FLOOR_MATERIAL: Record<FloorStyle, [string, number]> = {
  deck: ['surface.deck', tex.DECK_TILE],
  tile: ['surface.tile', tex.LAB_TILE],
  concrete: ['surface.concrete', tex.CONCRETE_TILE],
  silt: ['surface.silt', tex.SILT_TILE],
  rock: ['surface.basalt', tex.BASALT_TILE],
  crust: ['surface.crust', tex.CRUST_TILE],
  salt: ['surface.salt', tex.SALT_TILE],
  algae: ['surface.algae', tex.ALGAE_TILE],
};

const WALL_MATERIAL: Record<WallStyle, [string, number]> = {
  hull: ['surface.hull', tex.HULL_TILE],
  paint: ['surface.paint', tex.PAINT_TILE],
  tile: ['surface.tile', tex.LAB_TILE],
  concrete: ['surface.concrete', tex.CONCRETE_TILE],
  rust: ['surface.rust', tex.RUST_TILE],
  rock: ['surface.basalt', tex.BASALT_TILE],
  crust: ['surface.crust', tex.CRUST_TILE],
  algae: ['surface.algae', tex.ALGAE_TILE],
};

const BAND_MATERIAL: Record<Exclude<BandStyle, 'none'>, [string, number]> = {
  hazard: ['surface.hazard', tex.HAZARD_TILE],
  rust: ['surface.rust', tex.RUST_TILE],
  crust: ['surface.crust', tex.CRUST_TILE],
  tile: ['surface.tile', tex.LAB_TILE],
  steel: ['surface.deck', tex.DECK_TILE],
  algae: ['surface.algae', tex.ALGAE_TILE],
};

const STRIP_MATERIAL: Record<Exclude<StripStyle, 'none'>, string> = {
  amber: 'lumenAmber',
  cyan: 'lumenCyan',
  red: 'lumenRed',
  bio: 'lumenTeal',
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
 * turned by this. That is what stops the class of bug where a hatch coaming
 * built on the north wall comes out inside-out on the east one: the sizes are
 * never swapped by hand, so there is nothing to swap wrongly.
 */
const FACE_IN: Record<Side, number> = {
  north: 0,
  east: -Math.PI / 2,
  south: Math.PI,
  west: Math.PI / 2,
};

const KICK_HEIGHT = 0.2;
const RAIL_Y = 1.02;

/** Which wall styles are man-made. It decides the trim: a steel kick plate under
 *  a wall of pillow basalt reads as a cave somebody fitted a skirting board to,
 *  which is the one thing this pack must never look like. */
const BUILT: ReadonlySet<WallStyle> = new Set<WallStyle>(['hull', 'paint', 'tile', 'concrete', 'rust']);

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

  const [floorName, floorTile] = FLOOR_MATERIAL[options.floor ?? 'deck'];
  const wallStyle = options.wall ?? 'hull';
  const [wallName, wallTile] = WALL_MATERIAL[wallStyle];
  const bandStyle = options.band ?? 'none';
  const [bandName, bandTile] = bandStyle === 'none' ? WALL_MATERIAL[wallStyle] : BAND_MATERIAL[bandStyle];
  const bandHeight = options.bandHeight ?? 1.1;
  const mouthStyle = options.mouth ?? (BUILT.has(wallStyle) ? 'bulkhead' : 'arch');
  const stripStyle = options.strip ?? (BUILT.has(wallStyle) ? 'amber' : 'bio');
  const ceilingStyle = options.ceiling ?? 'panels';
  const built = BUILT.has(wallStyle);

  const floorMat = ctx.materials.get(floorName);
  const wallMat = ctx.materials.get(wallName);
  const bandMat = ctx.materials.get(bandName);
  const ceilMat = ctx.materials.get(
    ceilingStyle === 'rock' || ceilingStyle === 'rusticles' ? 'surface.basalt' : 'surface.panel',
  );
  const ceilTile = ceilingStyle === 'rock' || ceilingStyle === 'rusticles' ? tex.BASALT_TILE : tex.PANEL_TILE;
  const steelMat = ctx.materials.get('steel');
  const steelDark = ctx.materials.get('steelDark');
  const steelPale = ctx.materials.get('steelPale');
  const rustMat = ctx.materials.get('rust');
  const cableMat = ctx.materials.get('cable');
  const rockMat = ctx.materials.get('rockDark');
  const crustMat = ctx.materials.get('surface.crust');
  const siltMat = ctx.materials.get('sandPale');
  const hazardMat = ctx.materials.get('surface.hazard');
  const stripMat = stripStyle === 'none' ? steelMat : ctx.materials.get(STRIP_MATERIAL[stripStyle]);

  const occupied = new Set(footprint.map(([x, y]) => `${x},${y}`));
  const off = cellSize / 2 - wallThickness / 2;

  const ports = options.ports ?? [];
  if (ports.length && options.doorWalls) {
    for (const spec of ports) {
      const cell = spec.cell ?? ([0, 0] as const);
      const clash = options.doorWalls.some(
        (wall) => wall.side === spec.side && wall.cell[0] === cell[0] && wall.cell[1] === cell[1],
      );
      if (clash) throw new Error(`abyss shell: port on ${cell}:${spec.side} collides with a declared doorWall`);
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
   * The trim: a kick plate where wall meets deck, the emergency strip just above
   * it, an optional rub rail at hand height, and the cornice where wall meets
   * ceiling. All of it follows the same gaps as the wall, so nothing crosses a
   * doorway - and the strip in particular must not, or the doorway stops being
   * the darkest thing on the wall and stops reading as a way out.
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

      if (options.kick !== false && slab.y0 < 0.01) {
        if (built) {
          // A welded kick plate with a shadow gap over it. Two courses, the lower
          // proud: it catches a grazing light and gives the deck a hard edge.
          strip(slab.offset, slab.width, 0, KICK_HEIGHT * 0.78, 0.07, steelDark, 0.9);
          strip(slab.offset, slab.width, KICK_HEIGHT * 0.78, 0.035, 0.1, steelPale, 0.5);
        } else {
          // Where rock meets floor there is a drift of settled silt, not a
          // skirting board. Lumpy, and it never sits at the same height twice.
          strip(slab.offset, slab.width, 0, KICK_HEIGHT * 0.6, 0.22, siltMat, 0.8);
          strip(slab.offset, slab.width, KICK_HEIGHT * 0.5, KICK_HEIGHT * 0.5, 0.12, crustMat, 0.5);
        }
      }

      // The emergency strip. Set in a dark channel so the light has a housing to
      // come out of rather than floating on the wall as a painted line.
      if (stripStyle !== 'none' && slab.y0 < 0.01 && slab.y1 > 0.42) {
        const y = built ? 0.3 : 0.24;
        strip(slab.offset, slab.width, y - 0.045, 0.13, built ? 0.05 : 0.09, steelDark, 0.5);
        if (built) {
          strip(slab.offset, slab.width, y, 0.035, 0.075, stripMat, 0.5);
        } else {
          // A seep, not a light fitting: nodules along the line, not a line.
          const count = Math.max(2, Math.round(slab.width / 0.8));
          for (let i = 0; i < count; i++) {
            const x = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / count;
            strip(x, 0.22, y - 0.01, 0.07, 0.1, stripMat, 0.3);
          }
        }
      }

      if (bandStyle !== 'none' && slab.y1 > bandHeight) {
        strip(slab.offset, slab.width, bandHeight, 0.05, 0.06, steelDark, 0.7);
        if (built) {
          // Stiffeners: the vertical ribs that make a band read as plate rather
          // than as a stripe of paint.
          const count = Math.max(1, Math.round(slab.width / 1.4));
          for (let i = 0; i <= count; i++) {
            const x = slab.offset - slab.width / 2 + (slab.width * i) / count;
            strip(x, 0.07, KICK_HEIGHT, bandHeight - KICK_HEIGHT, 0.035, steelMat, 0.5);
          }
        }
      }

      // A rail crosses a port's sill, so a wall with one goes without.
      if (options.rail && built && !hasPort && slab.y1 > RAIL_Y + 0.12) {
        strip(slab.offset, slab.width, RAIL_Y, 0.055, 0.11, steelMat, 0.6);
        strip(slab.offset, slab.width, RAIL_Y - 0.05, 0.05, 0.05, steelDark, 0.4);
      }
    }

    // The cornice runs above every opening the shell can cut, so it crosses the
    // whole wall rather than breaking over each hatchway.
    if (options.seam !== false) {
      if (built) {
        strip(0, cellSize, ceilingHeight - 0.22, 0.22, 0.1, steelDark, 1.2);
        // A conduit run tucked into the corner, because there always is one.
        strip(0, cellSize, ceilingHeight - 0.4, 0.075, 0.2, cableMat, 0.5);
        strip(0, cellSize, ceilingHeight - 0.33, 0.05, 0.24, steelMat, 0.4);
      } else {
        strip(0, cellSize, ceilingHeight - 0.28, 0.28, 0.16, rockMat, 1.1);
        strip(0, cellSize, ceilingHeight - 0.34, 0.08, 0.24, crustMat, 0.6);
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
   * The ring around an opening. A hole in a pressure hull is never a clean
   * rectangle: it is a welded coaming with the dogging gear still on it, and the
   * deck in front of it is painted so you do not trip over the sill in the dark.
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

    if (mouthStyle === 'bulkhead') {
      // Jambs: a plate frame standing proud of the wall, with a chamfer.
      for (const s of [-1, 1]) {
        put(steelMat, 0.22, head + 0.34, 0.26, s * (half + 0.11), (head + 0.34) / 2, 0.13, 0, 0.7);
        put(steelDark, 0.08, head + 0.3, 0.34, s * (half + 0.2), (head + 0.3) / 2, 0.2, 0, 0.4);
        put(steelPale, 0.05, head + 0.2, 0.1, s * (half + 0.02), (head + 0.2) / 2, 0.16, 0, 0.3);
        // Dogging lugs down the jamb: this hatch was made to be sealed.
        for (let i = 0; i < 3; i++) {
          const y = 0.5 + i * (head / 3.2);
          put(steelPale, 0.11, 0.09, 0.16, s * (half + 0.21), y, 0.24, 0, 0.25);
          batch.add(steelDark, cyl(0.035, 0.035, 0.14, 7), tiltMatrix(at(s * (half + 0.21), y, 0.31), [Math.PI / 2, yaw, 0]), {
            tile: 0.3,
            castShadow: false,
          });
        }
      }
      // The lintel, and the stiffener knee braces either end of it.
      put(steelMat, opening.width + 0.66, 0.24, 0.28, 0, head + 0.12, 0.14, 0, 0.9);
      put(steelDark, opening.width + 0.5, 0.09, 0.36, 0, head + 0.26, 0.2, 0, 0.5);
      for (const s of [-1, 1]) {
        put(steelMat, 0.3, 0.3, 0.2, s * (half + 0.26), head - 0.06, 0.16, s * 0.78, 0.4);
      }
      // A low threshold plate across the sill. Six centimetres, so it reads as a
      // coaming and never as something a player has to step over - collision is
      // a floor-plane test and this deliberately carries no collider.
      put(hazardMat, opening.width + 0.3, 0.055, 0.42, 0, 0.028, 0.12, 0, 0.5);
      put(steelDark, opening.width + 0.3, 0.03, 0.1, 0, 0.06, 0.32, 0, 0.3);
    } else if (mouthStyle === 'arch') {
      // A hole in rock, furred with everything that has settled on the edge of
      // it. Sampled all the way round as one loop rather than as jambs plus a
      // lintel: the corners are exactly where a four-piece frame gives itself
      // away, and a natural opening has no corners at all.
      // Fourteen lumps, not twenty, each one bigger to close the gaps that
      // leaves, and through `ball()` so the ramp in lib/build.ts can size them:
      // a mouth is built on every opening of every room, so its step count is
      // multiplied by the whole map before a single prop is placed in one.
      const steps = 7;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const a = t * Math.PI * 2;
        const along = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.62) * (half + 0.2);
        const rise = head / 2 + Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.62) * (head / 2 + 0.14);
        if (rise < 0.08) continue; // the floor takes the bottom of the ring
        // Roughly equidimensional lumps. Stretched 1.5x along the ring they
        // came out as a chain of sausages round every hatchway, which read as
        // something anatomical rather than as broken rock.
        const lump = 0.34 + Math.abs(Math.sin(a * 2.7 + 1.1)) * 0.18;
        batch.add(
          rockMat,
          ball(lump),
          tiltMatrix(at(along, rise, 0.08 + lump * 0.35), [0, yaw, a], [1.15, 0.95, 0.85]),
          { tile: 0.5, castShadow: false },
        );
        if (i % 4 === 0) {
          batch.add(crustMat, ball(lump * 0.6), poseMatrix(at(along, rise, 0.26)), {
            tile: 0.3,
            castShadow: false,
          });
        }
      }
    } else {
      // Collar: a rolled acrylic-and-steel tube through the wall, the way an
      // aquarium joins two water-tight volumes. Smooth, clean, and wrong.
      for (const s of [-1, 1]) {
        put(steelPale, 0.16, head + 0.22, 0.3, s * (half + 0.09), (head + 0.22) / 2, 0.15, 0, 0.5);
      }
      put(steelPale, opening.width + 0.5, 0.18, 0.3, 0, head + 0.09, 0.15, 0, 0.6);
      const segments = 9;
      for (let i = 0; i <= segments; i++) {
        const a = Math.PI * (i / segments);
        const along = -Math.cos(a) * (half + 0.09);
        const rise = head - 0.08 + Math.sin(a) * 0.2;
        put(ctx.materials.get('glassEdge'), 0.16, 0.1, 0.3, along, rise, 0.15, 0, 0.3);
      }
      put(ctx.materials.get('glassEdge'), opening.width + 0.2, 0.05, 0.06, 0, 0.02, 0.2, 0, 0.3);
    }
  }

  /**
   * A port: an aperture in a wall the generator can never open. The pack's
   * window, and in the case of `viewpane` its single most important object -
   * the whole premise of the map is that you can see the thing outside.
   */
  function buildPort(spec: PortSpec, side: Side, cx: number, cz: number, opening: { width: number; y0: number; y1: number }): void {
    const { yaw, at } = frame(side, cx, cz);
    const h = opening.y1 - opening.y0;
    const midY = (opening.y0 + opening.y1) / 2;
    const kind = spec.kind ?? 'viewpane';
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

    if (kind === 'porthole') {
      // A deadlight: a thick round window in a bolted ring, sunk into the plate.
      const r = Math.min(opening.width, h) * 0.44;
      pane(ctx.materials.get('backdrop'), r * 2.4, r * 2.4, 0, midY, -0.14);
      batch.add(
        ctx.materials.get('glassPane'),
        disc(r, 20),
        poseMatrix(at(0, midY, 0.03), yaw),
        { castShadow: false, receiveShadow: false },
      );
      // The barrel through the plate, so the glass has thickness behind it.
      batch.add(steelDark, cyl(r * 1.06, r * 1.06, 0.42, 18, true), tiltMatrix(at(0, midY, -0.16), [Math.PI / 2, yaw, 0]), {
        tile: 0.5,
        castShadow: false,
      });
      // The ring and its bolts.
      batch.add(steelMat, new THREE.TorusGeometry(r * 1.13, 0.07, 6, 22), poseMatrix(at(0, midY, 0.09), yaw), {
        tile: 0.4,
        castShadow: false,
        consume: true,
      });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.2;
        put(steelPale, 0.055, 0.055, 0.07, Math.cos(a) * r * 1.22, midY + Math.sin(a) * r * 1.22, 0.09, 0.2);
      }
      // Condensation running off the bottom of the ring.
      put(ctx.materials.get('puddle'), r * 0.9, 0.03, 0.05, 0, midY - r * 1.2, 0.06, 0.3);
    } else if (kind === 'grille') {
      pane(ctx.materials.get('waterHazeWarm'), opening.width, h, 0, midY, -0.04);
      put(steelDark, opening.width + 0.2, h + 0.2, 0.1, 0, midY, 0.02, 0.5);
      const slats = 6;
      for (let i = 0; i < slats; i++) {
        const y = opening.y0 + (h * (i + 0.5)) / slats;
        batch.add(steelMat, boxGeometry(opening.width, 0.1, 0.18), tiltMatrix(at(0, y, 0.08), [0.55, yaw, 0]), {
          tile: 0.5,
          castShadow: false,
        });
      }
      put(ctx.materials.get('signAmber'), opening.width - 0.3, 0.05, 0.04, 0, opening.y0 + 0.04, -0.02, 0.3);
    } else if (kind === 'monitors') {
      // Not a window: a recessed rack of screens. It lights the room and it is
      // the only thing in the station still doing its job.
      put(steelDark, opening.width + 0.24, h + 0.24, 0.12, 0, midY, -0.02, 0.6);
      const cols = 4;
      const rows = 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const w = opening.width / cols - 0.09;
          const hh = h / rows - 0.1;
          const along = -opening.width / 2 + (opening.width * (c + 0.5)) / cols;
          const y = opening.y0 + (h * (r + 0.5)) / rows;
          const live = rng() > 0.32;
          put(steelDark, w + 0.07, hh + 0.07, 0.13, along, y, 0.06, 0.35);
          pane(ctx.materials.get(live ? (rng() > 0.65 ? 'screenSonar' : 'screenData') : 'screenDead'), w, hh, along, y, 0.135);
        }
      }
      put(steelMat, opening.width + 0.3, 0.1, 0.26, 0, opening.y1 + 0.1, 0.1, 0.4);
      put(steelMat, opening.width + 0.3, 0.14, 0.34, 0, opening.y0 - 0.08, 0.14, 0.4);
    } else {
      /* --- the viewpane --------------------------------------------------- */
      /**
       * Twenty centimetres of acrylic with the trench behind it. Built in five
       * layers, front to back, and the ORDER is the whole thing:
       *
       *   1. the frame and its bolts, standing proud of the wall
       *   2. the pane itself - a highlight, not a glow
       *   3. a faint haze volume, INSIDE the glass, giving the water depth
       *   4. the scene: rock, growth, whatever lives in this one
       *   5. the backdrop, a picture of the open deep, 1.2 m back
       *
       * Nothing translucent ever goes in FRONT of something lit (ROOM_REVIEW.md
       * §4) - the haze sits behind the glass, and the glass carries almost no
       * opacity of its own, or the whole window greys over.
       */
      const back = -1.24;

      // The picture of the deep, filling the frame generously so no edge shows.
      pane(ctx.materials.get('backdrop'), opening.width + 1.2, h + 1.0, 0, midY + 0.1, back);
      // Water volume between the backdrop and the glass.
      pane(ctx.materials.get('waterHaze'), opening.width + 0.6, h + 0.4, 0, midY, back * 0.45);
      pane(ctx.materials.get('waterHaze'), opening.width + 0.2, h + 0.1, 0, midY, back * 0.16);

      // The tank floor, sloping away, so the space behind the glass has a bottom.
      batch.add(
        ctx.materials.get('surface.silt'),
        boxGeometry(opening.width + 1.4, 0.12, 1.3),
        tiltMatrix(at(0, opening.y0 - 0.34, back * 0.5), [0.14, yaw, 0]),
        { tile: 1.2, castShadow: false },
      );

      buildPortScene(spec.scene ?? 'open', at, yaw, opening, back);

      // The pane. A single sheet, plus the cut edge at the reveal - which is the
      // only place acrylic ever shows what colour it is.
      batch.add(
        ctx.materials.get('glassPane'),
        new THREE.PlaneGeometry(opening.width, h),
        poseMatrix(at(0, midY, 0.02), yaw),
        { castShadow: false, receiveShadow: false, consume: true },
      );
      for (const s of [-1, 1]) {
        put(ctx.materials.get('glassEdge'), 0.07, h, 0.3, (s * opening.width) / 2, midY, 0, 0.4);
      }
      put(ctx.materials.get('glassEdge'), opening.width, 0.07, 0.3, 0, opening.y1, 0, 0.4);
      put(ctx.materials.get('glassEdge'), opening.width, 0.07, 0.3, 0, opening.y0, 0, 0.4);

      // The frame: a heavy clamped surround, bolted every 40 cm. This is what
      // sells the pressure - a big window with a thin frame reads as a picture.
      put(steelMat, opening.width + 0.5, 0.24, 0.42, 0, opening.y1 + 0.12, 0.08, 0.7);
      put(steelMat, opening.width + 0.5, 0.3, 0.46, 0, opening.y0 - 0.15, 0.1, 0.7);
      for (const s of [-1, 1]) {
        put(steelMat, 0.24, h + 0.6, 0.42, (s * (opening.width + 0.24)) / 2, midY, 0.08, 0.7);
        put(steelDark, 0.1, h + 0.5, 0.5, (s * (opening.width + 0.42)) / 2, midY, 0.14, 0.4);
      }
      const bolts = Math.max(3, Math.round(opening.width / 0.42));
      for (let i = 0; i < bolts; i++) {
        const along = -opening.width / 2 + (opening.width * (i + 0.5)) / bolts;
        for (const y of [opening.y1 + 0.12, opening.y0 - 0.14]) {
          put(steelPale, 0.07, 0.07, 0.08, along, y, 0.3, 0.2);
        }
      }
      // Sealant weeping at the bottom corners, and a stress crack in one of them.
      for (const s of [-1, 1]) {
        put(ctx.materials.get('puddle'), 0.4, 0.025, 0.3, (s * opening.width) / 2.6, opening.y0 - 0.29, 0.2, 0.3);
      }
      if (rng() > 0.45) {
        const cx0 = (rng() - 0.5) * opening.width * 0.5;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + 0.4;
          const len = 0.14 + (i % 2) * 0.18;
          batch.add(
            ctx.materials.get('glassCrack'),
            boxGeometry(len, 0.012, 0.012),
            tiltMatrix(at(cx0 + Math.cos(a) * len * 0.5, midY + Math.sin(a) * len * 0.5, 0.035), [0, yaw, a]),
            { tile: 0.2, castShadow: false, receiveShadow: false },
          );
        }
      }
    }

    if (spec.light) {
      const colour = kind === 'grille' ? 0xffa050 : kind === 'monitors' ? 0x64c8e0 : 0x3fc8d8;
      const lamp = new THREE.PointLight(colour, kind === 'porthole' ? 7 : 13, cellSize * 1.7, 2);
      lamp.position.set(...at(0, midY, 0.55));
      extra.add(lamp);
      lights.push(lamp);
    }

    portAnchors.push({ position: at(0, midY, 0), side, kind });
  }

  /**
   * What is living behind a viewpane. Everything here sits between the glass and
   * the backdrop, so it is silhouetted against the deep - which is why the
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
    const floorY = opening.y0 - 0.28;
    const r = (min: number, max: number): number => min + rng() * (max - min);

    if (scene === 'kelp') {
      /**
       * A stand of giant kelp, backlit. Blades are double-sided and faintly
       * self-lit so a lamp behind them glows through instead of punching a hole.
       *
       * Seven stipes, not eleven, and the blades hang at irregular heights: a
       * regular ladder of them across a pane reads as green rungs rather than as
       * weed, which is exactly what the first pass of the gallery looked like.
       */
      const kelpMat = ctx.materials.get('kelp');
      const kelpPale = ctx.materials.get('kelpPale');
      for (let i = 0; i < 8; i++) {
        const along = r(-span, span);
        const depth = r(back * 0.9, back * 0.25);
        const height = r(1.3, opening.y1 - floorY + 0.5);
        batch.add(ctx.materials.get('kelp'), cyl(0.03, 0.055, height, 5),
          tiltMatrix(at(along, floorY + height / 2, depth), [0, yaw, r(-0.16, 0.16)]), { tile: 0.5, castShadow: false });
        const blades = 4 + Math.floor(r(0, 4));
        for (let b = 0; b < blades; b++) {
          // Every blade gets its own depth as well as its own height and lean.
          // Sharing one depth plane is what turns a stand of kelp into a ladder.
          const by = floorY + height * r(0.15, 1.0);
          const lean = r(-1.1, 1.1);
          batch.add(
            b % 3 === 0 ? kelpPale : kelpMat,
            new THREE.PlaneGeometry(r(0.3, 0.8), r(0.05, 0.12)),
            tiltMatrix(
              at(along + Math.sign(lean) * r(0.1, 0.4), by, depth + r(-0.18, 0.18)),
              [r(-0.6, 0.6), yaw + lean, r(-1.0, 1.0)],
            ),
            { castShadow: false, receiveShadow: false, consume: true },
          );
        }
      }
    } else if (scene === 'coral') {
      /**
       * A cold-water reef: dead white skeleton with living polyps on the tips.
       *
       * Five heads rather than nine, each bigger, and the living colour is kept
       * to ONE tip per branch and desaturated. A dense scatter of small
       * saturated spheres reads as sprinkles on a cake - the structure has to be
       * the white skeleton, and the colour is a highlight on it.
       */
      for (let i = 0; i < 5; i++) {
        const along = r(-span, span);
        const depth = r(back * 0.8, back * 0.25);
        const size = r(0.3, 0.6);
        batch.add(ctx.materials.get('rockDark'), ball(size * 1.25, 7),
          tiltMatrix(at(along, floorY + size * 0.35, depth), [0, r(0, 3), 0], [1.3, 0.6, 1.1]), { tile: 0.6, castShadow: false });
        for (let b = 0; b < 6; b++) {
          const a = (b / 6) * Math.PI * 2 + r(-0.3, 0.3);
          const len = r(0.35, 0.8);
          batch.add(
            ctx.materials.get('coralDead'),
            cyl(0.025, 0.06, len, 5),
            tiltMatrix(at(along + Math.cos(a) * size * 0.5, floorY + size * 0.35 + len / 2, depth + Math.sin(a) * size * 0.4), [r(-0.5, 0.5), yaw, r(-0.6, 0.6)]),
            { tile: 0.4, castShadow: false },
          );
          if (b % 3 === 0) {
            batch.add(
              ctx.materials.get(i % 2 ? 'coralPink' : 'coralBlue'),
              ball(r(0.04, 0.07), 6),
              poseMatrix(at(along + Math.cos(a) * size * 0.6, floorY + size * 0.35 + len, depth + Math.sin(a) * size * 0.4)),
              { tile: 0.3, castShadow: false },
            );
          }
        }
      }
    } else if (scene === 'swarm') {
      // A shoal hanging in the water column: dozens of small dark bodies with a
      // cold point of light on each. Nothing reads as "deep water with something
      // in it" faster, and it costs almost nothing.
      const body = ctx.materials.get('rockDark');
      const eye = ctx.materials.get('lumenCyan');
      for (let i = 0; i < 34; i++) {
        const along = r(-span * 1.15, span * 1.15);
        const y = r(opening.y0 + 0.15, opening.y1 - 0.1);
        const depth = r(back * 0.9, back * 0.2);
        const len = r(0.1, 0.24);
        batch.add(body, ball(len * 0.5, 6), tiltMatrix(at(along, y, depth), [0, yaw + r(-0.6, 0.6), r(-0.3, 0.3)], [2.3, 0.7, 0.8]), {
          tile: 0.3,
          castShadow: false,
        });
        batch.add(eye, ball(0.017, 5), poseMatrix(at(along + len * 0.5, y, depth)), {
          castShadow: false,
        });
      }
    } else if (scene === 'wreck') {
      // The corner of something much bigger, half buried and running out of
      // frame both ways - which is what makes it read as big.
      const iron = ctx.materials.get('rust');
      batch.add(iron, boxGeometry(opening.width * 1.5, 1.5, 0.9), tiltMatrix(at(-0.4, floorY + 0.4, back * 0.72), [0.1, yaw + 0.24, 0.16]), {
        tile: 1.4,
        castShadow: false,
      });
      for (let i = 0; i < 5; i++) {
        batch.add(iron, boxGeometry(0.14, r(0.7, 1.5), 0.14), tiltMatrix(at(-span + i * (span / 2.2), floorY + 0.6, back * 0.5), [r(-0.3, 0.3), yaw, r(-0.35, 0.35)]), {
          tile: 0.4,
          castShadow: false,
        });
      }
      for (let i = 0; i < 6; i++) {
        batch.add(ctx.materials.get('surface.crust'), ball(r(0.09, 0.2), 6), poseMatrix(at(r(-span, span), floorY + r(0.5, 1.3), back * 0.62)), {
          tile: 0.3,
          castShadow: false,
        });
      }
    } else {
      // Open water. Two boulders on the bottom for scale, marine snow, and a
      // single silhouette far enough back to be ambiguous.
      for (let i = 0; i < 3; i++) {
        batch.add(ctx.materials.get('rockDark'), ball(r(0.24, 0.5), 7),
          tiltMatrix(at(r(-span, span), floorY + 0.1, r(back * 0.85, back * 0.4)), [0, r(0, 3), 0], [1.3, 0.7, 1]), { tile: 0.7, castShadow: false });
      }
      for (let i = 0; i < 16; i++) {
        batch.add(ctx.materials.get('bacterialMat'), ball(r(0.012, 0.03), 4),
          poseMatrix(at(r(-span * 1.2, span * 1.2), r(opening.y0, opening.y1), r(back * 0.9, back * 0.15))), { castShadow: false });
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
        // Rolled I-beams across the short way, with the deck plate showing
        // between them. Sampled as three boxes each so the flange reads.
        for (let i = 0; i < 4; i++) {
          const z = cz - cellSize / 2 + cellSize * ((i + 0.5) / 4);
          const y = ceilingHeight - 0.3;
          batch.add(steelMat, boxGeometry(cellSize, 0.05, 0.3), poseMatrix([cx, y + 0.16, z]), { tile: 1.0, ...CEILING_OPTS });
          batch.add(steelDark, boxGeometry(cellSize, 0.28, 0.075), poseMatrix([cx, y, z]), { tile: 0.8, ...CEILING_OPTS });
          batch.add(steelMat, boxGeometry(cellSize, 0.05, 0.26), poseMatrix([cx, y - 0.16, z]), { tile: 1.0, ...CEILING_OPTS });
          // Gusset plates where the beam lands on the wall.
          for (const s of [-1, 1]) {
            batch.add(steelMat, boxGeometry(0.5, 0.3, 0.09), tiltMatrix([cx + s * (cellSize / 2 - 0.35), y - 0.02, z], [0, 0, s * 0.5]), {
              tile: 0.4,
              ...CEILING_OPTS,
            });
          }
        }
        break;
      }
      case 'pipes': {
        // Bundled pipe runs, at three heights, with hanger straps. The single
        // fastest way to make a ceiling read as machinery rather than as a lid.
        const radii = [0.14, 0.09, 0.11, 0.06];
        for (let i = 0; i < 4; i++) {
          const z = cz - cellSize / 2 + cellSize * ((i + 0.7) / 4.6);
          const y = ceilingHeight - 0.28 - (i % 2) * 0.16;
          const radius = radii[i] ?? 0.1;
          batch.add(i % 3 === 0 ? ctx.materials.get('copperPipe') : steelMat, cyl(radius, radius, cellSize, 9),
            tiltMatrix([cx, y, z], [0, 0, Math.PI / 2]), { tile: 0.7, ...CEILING_OPTS });
          // Flanges: a pipe without joints is a rod.
          for (const t of [-0.3, 0.12]) {
            batch.add(steelDark, cyl(radius * 1.4, radius * 1.4, 0.09, 9), tiltMatrix([cx + t * cellSize, y, z], [0, 0, Math.PI / 2]), {
              tile: 0.3,
              ...CEILING_OPTS,
            });
          }
          for (const t of [-0.34, 0.02, 0.36]) {
            batch.add(steelDark, boxGeometry(0.05, 0.34, radius * 2.6), poseMatrix([cx + t * cellSize, ceilingHeight - 0.16, z]), {
              tile: 0.3,
              ...CEILING_OPTS,
            });
          }
        }
        break;
      }
      case 'conduit': {
        // Cable trays: a ladder rack with bundles lying in it, and drop loops.
        for (let i = 0; i < 2; i++) {
          const z = cz - cellSize / 2 + cellSize * (i === 0 ? 0.32 : 0.7);
          const y = ceilingHeight - 0.34;
          for (const s of [-1, 1]) {
            batch.add(steelMat, boxGeometry(cellSize, 0.11, 0.04), poseMatrix([cx, y, z + s * 0.22]), { tile: 0.8, ...CEILING_OPTS });
          }
          for (let r2 = 0; r2 < 14; r2++) {
            batch.add(steelDark, boxGeometry(0.05, 0.03, 0.44), poseMatrix([cx - cellSize / 2 + (cellSize * (r2 + 0.5)) / 14, y - 0.04, z]), {
              tile: 0.2,
              ...CEILING_OPTS,
            });
          }
          for (const [dz, radius] of [[-0.1, 0.05], [0.02, 0.07], [0.12, 0.04]] as const) {
            batch.add(cableMat, cyl(radius, radius, cellSize, 6), tiltMatrix([cx, y + 0.04, z + dz], [0, 0, Math.PI / 2]), {
              tile: 0.4,
              ...CEILING_OPTS,
            });
          }
        }
        // One bundle that has come out of the tray and hangs.
        batch.add(cableMat, new THREE.TorusGeometry(0.34, 0.045, 5, 12, Math.PI), tiltMatrix([cx + cellSize * 0.18, ceilingHeight - 0.4, cz - cellSize * 0.18], [0, 0.6, 0]), {
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
          const bottom = ceilingHeight - 0.78;
          batch.add(steelMat, boxGeometry(cellSize, 0.1, 0.14), poseMatrix([cx, top, z]), { tile: 0.9, ...CEILING_OPTS });
          batch.add(steelMat, boxGeometry(cellSize, 0.1, 0.14), poseMatrix([cx, bottom, z]), { tile: 0.9, ...CEILING_OPTS });
          const bays = 8;
          for (let b = 0; b <= bays; b++) {
            const x = cx - cellSize / 2 + (cellSize * b) / bays;
            batch.add(steelDark, boxGeometry(0.07, top - bottom, 0.1), poseMatrix([x, (top + bottom) / 2, z]), { tile: 0.3, ...CEILING_OPTS });
            if (b < bays) {
              const run = cellSize / bays;
              const diag = Math.hypot(run, top - bottom);
              batch.add(steelDark, boxGeometry(diag, 0.055, 0.08), tiltMatrix([x + run / 2, (top + bottom) / 2, z], [0, 0, (b % 2 ? 1 : -1) * Math.atan2(top - bottom, run)]), {
                tile: 0.3,
                ...CEILING_OPTS,
              });
            }
          }
        }
        break;
      }
      case 'rock': {
        // The underside of the trench: lumps, and a few things pointing down.
        for (let i = 0; i < 9; i++) {
          const ax = cx - cellSize / 2 + cellSize * ((((i * 5) % 9) + 0.5) / 9);
          const az = cz - cellSize / 2 + cellSize * ((((i * 7) % 9) + 0.5) / 9);
          const size = 0.5 + ((i * 37) % 11) / 16;
          batch.add(rockMat, ball(size, 7), tiltMatrix([ax, ceilingHeight + size * 0.42, az], [0, i, 0], [1.3, 0.8, 1.2]), {
            tile: 1.2,
            ...CEILING_OPTS,
          });
        }
        break;
      }
      case 'rusticles': {
        // What hangs off a steel ceiling that has been underwater for decades:
        // ropes of iron-oxidising bacteria, like stalactites made of rust.
        for (let i = 0; i < 14; i++) {
          const ax = cx - cellSize / 2 + cellSize * ((((i * 5) % 14) + 0.5) / 14);
          const az = cz - cellSize / 2 + cellSize * ((((i * 9) % 14) + 0.5) / 14);
          const len = 0.3 + ((i * 41) % 13) / 13;
          batch.add(rustMat, spike(0.075 + len * 0.05, len, 6), poseMatrix([ax, ceilingHeight - len / 2, az]), {
            tile: 0.4,
            ...CEILING_OPTS,
          });
          if (i % 3 === 0) {
            batch.add(rustMat, ball(0.055, 5), poseMatrix([ax, ceilingHeight - len, az]), {
              ...CEILING_OPTS,
            });
          }
        }
        break;
      }
      case 'panels':
      default: {
        // The frame grid holding the panels up, plus one dead recessed fixture.
        for (const t of [-0.25, 0.25]) {
          batch.add(steelDark, boxGeometry(cellSize, 0.09, 0.1), poseMatrix([cx, ceilingHeight - 0.05, cz + t * cellSize]), { tile: 0.7, ...CEILING_OPTS });
          batch.add(steelDark, boxGeometry(0.1, 0.09, cellSize), poseMatrix([cx + t * cellSize, ceilingHeight - 0.05, cz]), { tile: 0.7, ...CEILING_OPTS });
        }
        batch.add(steelDark, boxGeometry(1.3, 0.1, 0.42), poseMatrix([cx + cellSize * 0.22, ceilingHeight - 0.06, cz - cellSize * 0.2]), { tile: 0.5, ...CEILING_OPTS });
        batch.add(ctx.materials.get('screenDead'), boxGeometry(1.1, 0.05, 0.26), poseMatrix([cx + cellSize * 0.22, ceilingHeight - 0.12, cz - cellSize * 0.2]), {
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
        const kind = port.kind ?? 'viewpane';
        if (kind === 'porthole') opening = { width: 1.0, y0: 1.18, y1: 2.18 };
        else if (kind === 'grille') opening = { width: 1.1, y0: 1.55, y1: 2.35 };
        else if (kind === 'monitors') opening = { width: 2.4, y0: 1.0, y1: 2.15 };
        else opening = port.tall ? { width: 4.2, y0: 0.42, y1: ceilingHeight - 0.55 } : { width: 2.8, y0: 0.92, y1: 2.62 };
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
 * The contract-facing kit. Abyss rooms call `addShell()` directly so they can
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
