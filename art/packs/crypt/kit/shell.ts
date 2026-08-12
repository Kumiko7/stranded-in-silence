/**
 * The Sepulchre's shell: floors, walls, vaults, dados, arches, lamp courses and
 * wall niches.
 *
 * Every room calls this first and then decorates, which is what guarantees door
 * openings line up between neighbours no matter who authored the rooms either
 * side. The style options are the pack's main lever for variety: the same
 * function builds a groin-vaulted bone chapel and a corbelled sandstone burial
 * chamber with sand coming in under the door.
 *
 * Five things worth knowing before you use it:
 *
 * - It writes into a `MeshBatcher` rather than building meshes. A crypt room is
 *   several hundred boxes of ashlar, rib, bone and iron; batched, that is a
 *   handful of draw calls. See `art/lib/merge.ts`.
 * - **Every opening gets an arch.** A hole in a consecrated wall is a moulded
 *   two-centred arch with imposts and a keystone; one in a dynastic wall is a
 *   post-and-lintel with a cavetto cornice over it; one knocked through by
 *   robbers is a ragged mouth with the rubble still lying under it. That ring is
 *   the single detail that makes the whole pack read as one place, so it lives
 *   here rather than being left to each room.
 * - **Every room gets a lamp course.** Votive niches with candle stubs in them,
 *   oil saucers on a ledge, or clusters of luminous fungus in the joints - an
 *   emissive line of points along every wall, broken at the doorways. It costs no
 *   light budget and it is what guarantees the rule in ROOM_FORMAT.md §6: a
 *   player with no torch can always read the layout and find the doors.
 * - **A niche may only go on a side the blueprint never opens as a door.** The
 *   generator decides doors at run time, so the only walls guaranteed solid are
 *   the ones missing from `doorWalls`. Passing `doorWalls` in lets the shell
 *   throw immediately rather than shipping a room with a corpse shelf in a
 *   doorway.
 * - **A niche leans about 0.6 m out of its room** to hold the recess behind the
 *   wall. That is deliberate and handled - a room is culled by the cells its
 *   geometry reaches, not the cells it occupies (ROOM_FORMAT.md §7).
 */
import * as THREE from 'three';
import type { BuiltPiece, Cell, Collider, PackKit, RoomBuildContext, Side } from '../../../lib/contract';
import { SIDES, doorKey } from '../../../lib/contract';
import { boxCollider, boxGeometry } from '../../../lib/build';
import { MeshBatcher, poseMatrix, tiltMatrix } from '../../../lib/merge';
import * as tex from '../textures';

export type FloorStyle = 'flag' | 'slab' | 'earth' | 'sand' | 'sandstone' | 'bone' | 'moss' | 'rot' | 'clay' | 'rock';
export type WallStyle =
  | 'ashlar'
  | 'plaster'
  | 'brick'
  | 'bone'
  | 'sandstone'
  | 'frieze'
  | 'mudbrick'
  | 'rot'
  | 'moss'
  | 'rock'
  | 'timber';
export type CeilingStyle =
  | 'groin'
  | 'barrel'
  | 'ribs'
  | 'beams'
  | 'corbel'
  | 'slabs'
  | 'stars'
  | 'roots'
  | 'rock'
  | 'cave'
  | 'turf'
  | 'open';
/** The lower band of the wall, where a different material takes over. */
export type DadoStyle = 'none' | 'inscription' | 'glyph' | 'bone' | 'gilt' | 'plaster' | 'ashlar' | 'stone' | 'carving';
/** What the ring around a doorway is made of. */
export type MouthStyle = 'gothic' | 'lintel' | 'rubble' | 'root' | 'stave' | 'none';
/** The emissive course along every wall. Free light, and the map's spine. */
export type LampStyle = 'none' | 'votive' | 'oil' | 'spore' | 'soul' | 'lichen';

export type NicheKind =
  | 'loculus'
  | 'urns'
  | 'effigy'
  | 'grate'
  | 'lancet'
  | 'ossuary'
  | 'breach'
  | 'stela'
  | 'crevice'
  | 'runestone';

export interface NicheSpec {
  readonly cell?: Cell;
  readonly side: Side;
  readonly kind?: NicheKind;
  /** Adds a practical inside it. Counts against the room's light budget. */
  readonly light?: boolean;
}

export interface ShellOptions {
  readonly floor?: FloorStyle;
  readonly wall?: WallStyle;
  readonly ceiling?: CeilingStyle;
  readonly dado?: DadoStyle;
  /** Height the dado reaches. Default 1.05 m. */
  readonly dadoHeight?: number;
  /** The moulded plinth course where wall meets floor. On by default. */
  readonly plinth?: boolean;
  /** The cornice where wall meets ceiling. On by default. */
  readonly seam?: boolean;
  readonly mouth?: MouthStyle;
  readonly lamps?: LampStyle;
  /** How far apart the lamp course sets its lights. Default 2.3 m. */
  readonly lampSpacing?: number;
  readonly niches?: readonly NicheSpec[];
  /** Sides the blueprint may open. Required if `niches` is set. */
  readonly doorWalls?: readonly { readonly cell: Cell; readonly side: Side }[];
}

const FLOOR_MATERIAL: Record<FloorStyle, [string, number]> = {
  flag: ['surface.flag', tex.FLAG_TILE],
  slab: ['surface.slab', tex.SLAB_TILE],
  earth: ['surface.earth', tex.EARTH_TILE],
  sand: ['surface.sand', tex.SAND_TILE],
  sandstone: ['surface.sandstone', tex.SANDSTONE_TILE],
  bone: ['surface.bone', tex.BONE_TILE],
  moss: ['surface.moss', tex.MOSS_TILE],
  rot: ['surface.rot', tex.ROT_TILE],
  clay: ['surface.clay', tex.CLAY_TILE],
  rock: ['surface.limestone', tex.LIMESTONE_TILE],
};

const WALL_MATERIAL: Record<WallStyle, [string, number]> = {
  ashlar: ['surface.ashlar', tex.ASHLAR_TILE],
  plaster: ['surface.plaster', tex.PLASTER_TILE],
  brick: ['surface.brick', tex.BRICK_TILE],
  bone: ['surface.bone', tex.BONE_TILE],
  sandstone: ['surface.sandstone', tex.SANDSTONE_TILE],
  frieze: ['surface.frieze', tex.FRIEZE_TILE],
  mudbrick: ['surface.mudbrick', tex.MUDBRICK_TILE],
  rot: ['surface.rot', tex.ROT_TILE],
  moss: ['surface.moss', tex.MOSS_TILE],
  rock: ['surface.limestone', tex.LIMESTONE_TILE],
  timber: ['surface.timber', tex.TIMBER_TILE],
};

const DADO_MATERIAL: Record<Exclude<DadoStyle, 'none'>, [string, number]> = {
  inscription: ['surface.inscription', tex.INSCRIPTION_TILE],
  glyph: ['surface.glyph', tex.HIEROGLYPH_TILE],
  bone: ['surface.bone', tex.BONE_TILE],
  gilt: ['surface.gilt', tex.GILT_TILE],
  plaster: ['surface.plaster', tex.PLASTER_TILE],
  ashlar: ['surface.ashlar', tex.ASHLAR_TILE],
  // Ashlar at a short tile, not the grave-slab map: a ledger-stone texture on a
  // one-metre band came out as timber paneling with a chair rail on it.
  stone: ['surface.ashlar', tex.ASHLAR_TILE * 0.55],
  carving: ['surface.carving', tex.CARVING_TILE],
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
 * turned by this. That is what stops the class of bug where an arch built on the
 * north wall comes out inside-out on the east one: the sizes are never swapped
 * by hand, so there is nothing to swap wrongly. Note that this is the PLANE
 * convention - a `-Z`-facing prop wants this plus PI (docs/art/ROOM_FORMAT.md
 * §2.1.2).
 */
const FACE_IN: Record<Side, number> = {
  north: 0,
  east: -Math.PI / 2,
  south: Math.PI,
  west: Math.PI / 2,
};

const PLINTH_HEIGHT = 0.26;

/** Which wall styles were laid by a mason. It decides the trim: a moulded stone
 *  plinth under a wall furred with mycelium reads as a cave somebody fitted a
 *  skirting board to, which is the one thing this pack must never look like. */
const BUILT: ReadonlySet<WallStyle> = new Set<WallStyle>([
  'ashlar',
  'plaster',
  'brick',
  'sandstone',
  'frieze',
  'mudbrick',
  'bone',
  'timber',
]);
/** Which of those were laid by the DYNASTY. Warm stone, batter, no arches. */
const DYNASTIC: ReadonlySet<WallStyle> = new Set<WallStyle>(['sandstone', 'frieze', 'mudbrick']);
/** A stave-lined mound: built, but out of oak, so its trim is a sill and a plate. */
const TIMBERED: ReadonlySet<WallStyle> = new Set<WallStyle>(['timber']);

/**
 * Anything up at the ceiling is ABOVE every light a room can hang, so all of it
 * casts a hard bar straight down across the floor it is decorating. Ceiling
 * treatment is therefore never a shadow caster - see docs/art/ROOM_REVIEW.md §4.
 */
const CEILING_OPTS = { castShadow: false } as const;
const FLAT = { castShadow: false, receiveShadow: false } as const;
/**
 * For geometry built at the call site: `consume` frees it once it has been
 * copied into the batch. It is ONLY ever for geometry made here - handing it a
 * cached `boxGeometry()` frees a buffer the next room is still using
 * (docs/art/ART_GUIDE.md §5).
 */
const GLOW = { castShadow: false, receiveShadow: false, consume: true } as const;

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
  /** Room-local centres of every niche, for rooms that want to dress them. */
  nicheAnchors: { position: readonly [number, number, number]; side: Side; kind: NicheKind }[];
}

/**
 * Builds the shell into `batch`. Returns colliders and any niche lights; the
 * caller owns the batcher and therefore the draw calls.
 */
export function addShell(
  batch: MeshBatcher,
  ctx: RoomBuildContext,
  footprint: readonly Cell[],
  options: ShellOptions = {},
): { colliders: Collider[]; lights: THREE.Light[]; extra: THREE.Object3D; nicheAnchors: ShellResult['nicheAnchors'] } {
  const { cellSize, ceilingHeight, wallThickness, doorWidth, doorHeight } = ctx.dims;
  const colliders: Collider[] = [];
  const lights: THREE.Light[] = [];
  const extra = new THREE.Group();
  const nicheAnchors: ShellResult['nicheAnchors'] = [];

  const wallStyle = options.wall ?? 'ashlar';
  const [floorName, floorTile] = FLOOR_MATERIAL[options.floor ?? 'flag'];
  const [wallName, wallTile] = WALL_MATERIAL[wallStyle];
  const dadoStyle = options.dado ?? 'none';
  const [dadoName, dadoTile] = dadoStyle === 'none' ? WALL_MATERIAL[wallStyle] : DADO_MATERIAL[dadoStyle];
  const dadoHeight = options.dadoHeight ?? 1.05;
  const dynastic = DYNASTIC.has(wallStyle);
  const built = BUILT.has(wallStyle);
  const timbered = TIMBERED.has(wallStyle);
  /** Living rock, which is neither built nor grown and needs trim of its own. */
  const cave = wallStyle === 'rock';
  const mouthStyle =
    options.mouth ?? (timbered ? 'stave' : cave ? 'rubble' : dynastic ? 'lintel' : built ? 'gothic' : 'root');
  const lampStyle = options.lamps ?? (cave ? 'lichen' : dynastic || timbered ? 'oil' : built ? 'votive' : 'spore');
  const ceilingStyle = options.ceiling ?? (cave ? 'cave' : timbered ? 'turf' : dynastic ? 'corbel' : 'groin');
  const lampSpacing = options.lampSpacing ?? 2.3;

  const floorMat = ctx.materials.get(floorName);
  const wallMat = ctx.materials.get(wallName);
  const dadoMat = ctx.materials.get(dadoName);
  // The vault is brick in the Sanctum and dressed stone in the Necropolis; the
  // grown ceilings take the rock they are growing out of.
  /**
    * The vault WEB is plaster and the ribs are stone, which is what a vault looks
    * like and what makes the ribs read at all: brick for both put a dark red field
    * behind dark grey ribs, and the whole ceiling came out as a barn roof.
    */
  const ceilName =
    ceilingStyle === 'stars'
      ? 'surface.stars'
      : ceilingStyle === 'cave'
        ? 'surface.limestone'
        : ceilingStyle === 'turf'
          ? 'surface.turf'
          : ceilingStyle === 'rock' || ceilingStyle === 'roots'
            ? 'surface.ashlar'
            : ceilingStyle === 'corbel' || ceilingStyle === 'slabs'
              ? 'surface.sandstone'
              : 'surface.plaster';
  const ceilMat = ctx.materials.get(ceilName);
  const ceilTile =
    ceilingStyle === 'stars'
      ? tex.STAR_TILE
      : ceilingStyle === 'cave'
        ? tex.LIMESTONE_TILE
        : ceilingStyle === 'turf'
          ? tex.TURF_TILE
          : ceilingStyle === 'corbel' || ceilingStyle === 'slabs'
            ? tex.SANDSTONE_TILE
            : ceilingStyle === 'rock' || ceilingStyle === 'roots'
              ? tex.ASHLAR_TILE
              : tex.PLASTER_TILE;

  const stoneMat = ctx.materials.get(dynastic ? 'stoneWarm' : 'stone');
  const stoneDark = ctx.materials.get('stoneDark');
  const stonePale = ctx.materials.get(dynastic ? 'stoneWarmPale' : 'stonePale');
  const timberMat = ctx.materials.get('timber');
  const ironMat = ctx.materials.get('iron');
  const boneMat = ctx.materials.get('bone');
  const mossMat = ctx.materials.get('moss');
  const rootMat = ctx.materials.get('root');
  const dustMat = ctx.materials.get(dynastic ? 'sandLoose' : 'ash');
  const caveMat = ctx.materials.get('caveRock');
  const cavePale = ctx.materials.get('caveRockPale');
  const flowMat = ctx.materials.get('flowstone');
  const lichenMat = ctx.materials.get('lumenLichen');

  const occupied = new Set(footprint.map(([x, y]) => `${x},${y}`));
  const off = cellSize / 2 - wallThickness / 2;

  const niches = options.niches ?? [];
  if (niches.length && options.doorWalls) {
    for (const spec of niches) {
      const cell = spec.cell ?? ([0, 0] as const);
      const clash = options.doorWalls.some(
        (wall) => wall.side === spec.side && wall.cell[0] === cell[0] && wall.cell[1] === cell[1],
      );
      if (clash) throw new Error(`crypt shell: niche on ${cell}:${spec.side} collides with a declared doorWall`);
    }
  }
  const nicheFor = (cell: Cell, side: Side): NicheSpec | undefined =>
    niches.find((spec) => {
      const c = spec.cell ?? ([0, 0] as const);
      return spec.side === side && c[0] === cell[0] && c[1] === cell[1];
    });

  /**
   * Emits a wall slab, split at the dado line so the lower material can differ.
   *
   * `solid` is false for the slabs either side of a NICHE, because a niche gets
   * one collider across the whole wall run instead - see the per-side loop.
   */
  function wallSlab(side: Side, cx: number, cz: number, slab: Slab, solid = true): void {
    const runsAlongX = side === 'north' || side === 'south';
    const wallPos = side === 'north' ? cz - off : side === 'south' ? cz + off : side === 'west' ? cx - off : cx + off;

    const bands: [number, number, THREE.Material, number][] = [];
    const split = dadoStyle === 'none' ? slab.y0 : Math.min(Math.max(dadoHeight, slab.y0), slab.y1);
    if (split > slab.y0 + 0.001) bands.push([slab.y0, split, dadoMat, dadoTile]);
    if (slab.y1 > split + 0.001) bands.push([split, slab.y1, wallMat, wallTile]);

    for (const [y0, y1, material, tile] of bands) {
      const h = y1 - y0;
      const size: [number, number, number] = runsAlongX ? [slab.width, h, wallThickness] : [wallThickness, h, slab.width];
      const position: [number, number, number] = runsAlongX
        ? [cx + slab.offset, y0 + h / 2, wallPos]
        : [wallPos, y0 + h / 2, cz + slab.offset];
      batch.add(material, boxGeometry(size[0], size[1], size[2]), poseMatrix(position), { tile, castShadow: false });
    }

    if (slab.blocking && solid) {
      const size: [number, number, number] = runsAlongX
        ? [slab.width, slab.y1 - slab.y0, wallThickness]
        : [wallThickness, slab.y1 - slab.y0, slab.width];
      const position: [number, number, number] = runsAlongX ? [cx + slab.offset, 0, wallPos] : [wallPos, 0, cz + slab.offset];
      colliders.push(boxCollider(size, position));
    }
  }

  /** One collider across a whole wall run, for a wall with a niche cut in it. */
  function blockWall(side: Side, cx: number, cz: number): void {
    const runsAlongX = side === 'north' || side === 'south';
    const wallPos = side === 'north' ? cz - off : side === 'south' ? cz + off : side === 'west' ? cx - off : cx + off;
    const size: [number, number, number] = runsAlongX
      ? [cellSize, ceilingHeight, wallThickness]
      : [wallThickness, ceilingHeight, cellSize];
    colliders.push(boxCollider(size, runsAlongX ? [cx, 0, wallPos] : [wallPos, 0, cz]));
  }

  /**
   * A wall-local frame: `along` runs across the wall, `depth` runs into the room
   * FROM THE WALL'S INNER FACE, and `yaw` turns a piece authored in that frame
   * onto this wall.
   *
   * Measuring depth from the face rather than from the wall's mid-plane is the
   * difference between "this moulding stands 10 cm proud" and "this moulding is
   * buried in the plaster": a piece placed at `depth = thickness / 2` sits
   * exactly against the wall, and a niche's recess runs into negative depth.
   */
  function frame(side: Side, cx: number, cz: number): {
    yaw: number;
    at: (along: number, y: number, depth: number) => [number, number, number];
  } {
    const yaw = FACE_IN[side];
    const inward = INWARD[side];
    const u: readonly [number, number] = [Math.cos(yaw), -Math.sin(yaw)];
    const face = cellSize / 2 - wallThickness;
    const wallX = cx - inward[0] * face;
    const wallZ = cz - inward[1] * face;
    return {
      yaw,
      at: (along, y, depth) => [wallX + u[0] * along + inward[0] * depth, y, wallZ + u[1] * along + inward[1] * depth],
    };
  }

  /**
   * The trim: a moulded plinth where wall meets floor, the lamp course above it,
   * a string course at the dado line, and the cornice where wall meets ceiling.
   * All of it follows the same gaps as the wall, so nothing crosses a doorway -
   * and the lamp course in particular must not, or the doorway stops being the
   * darkest thing on the wall and stops reading as a way out.
   */
  function wallTrim(side: Side, cx: number, cz: number, slabs: readonly Slab[]): void {
    const runsAlongX = side === 'north' || side === 'south';
    const wallPos = side === 'north' ? cz - off : side === 'south' ? cz + off : side === 'west' ? cx - off : cx + off;
    const inward = INWARD[side];
    const sign = runsAlongX ? inward[1] : inward[0];

    const band = (
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

      if (options.plinth !== false && slab.y0 < 0.01) {
        if (cave) {
          // Where a cave wall meets a cave floor there is no line at all - the rock
          // simply thickens into a slope of fallen blocks and flowstone. A skirting
          // board here would be the one thing that says "cellar" instead of "cave".
          const lumps = Math.max(3, Math.round(slab.width / 0.62));
          for (let i = 0; i < lumps; i++) {
            const a = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / lumps;
            const h = 0.16 + ((i * 7) % 5) * 0.09;
            band(a, 0.52, 0, h, 0.26 + ((i * 3) % 3) * 0.08, i % 3 === 0 ? cavePale : caveMat, 0.7);
          }
        } else if (timbered) {
          // A sill beam laid on the ground with the staves standing on it. One
          // horizontal timber is the whole read of a stave-built wall.
          band(slab.offset, slab.width, 0, 0.2, 0.16, timberMat, tex.TIMBER_TILE * 0.6);
          band(slab.offset, slab.width, 0.2, 0.05, 0.19, stoneDark, 0.4);
        } else if (built) {
          // A plinth in three courses: a deep base, a chamfered weathering and a
          // thin fillet over it. Three planes at three angles to the light is
          // what makes a skirting read as moulded stone rather than as a stripe.
          band(slab.offset, slab.width, 0, PLINTH_HEIGHT * 0.62, 0.11, stoneMat, 0.9);
          band(slab.offset, slab.width, PLINTH_HEIGHT * 0.62, PLINTH_HEIGHT * 0.26, 0.075, stonePale, 0.5);
          band(slab.offset, slab.width, PLINTH_HEIGHT * 0.88, 0.035, 0.05, stoneDark, 0.4);
        } else {
          // Where fungus meets floor there is a drift of spent growth and fallen
          // stone, not a skirting board. Lumpy, and never the same height twice.
          band(slab.offset, slab.width, 0, PLINTH_HEIGHT * 0.5, 0.24, dustMat, 0.8);
          const lumps = Math.max(2, Math.round(slab.width / 0.55));
          for (let i = 0; i < lumps; i++) {
            const a = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / lumps;
            band(a, 0.34, PLINTH_HEIGHT * 0.3, 0.16 + (i % 3) * 0.06, 0.18, wallStyle === 'moss' ? mossMat : rootMat, 0.4);
          }
        }
      }

      // The lamp course. Set in its own housing so the light has something to
      // come out of rather than floating on the wall as a painted spot.
      if (lampStyle !== 'none' && slab.y0 < 0.01 && slab.y1 > 1.7) {
        const count = Math.max(1, Math.round(slab.width / lampSpacing));
        for (let i = 0; i < count; i++) {
          const a = slab.offset - slab.width / 2 + (slab.width * (i + 0.5)) / count;
          lampStation(side, cx, cz, a, i);
        }
      }

      if (dadoStyle !== 'none' && slab.y1 > dadoHeight) {
        // The string course capping the dado: a projecting shelf with a shadow
        // gap under it, which is the one detail that makes two materials meeting
        // on a wall look built rather than painted.
        band(slab.offset, slab.width, dadoHeight, 0.055, 0.09, stonePale, 0.7);
        band(slab.offset, slab.width, dadoHeight - 0.05, 0.05, 0.045, stoneDark, 0.4);
        if (built && !dynastic) {
          // Vertical mullions dividing the dado into bays: it is a blind arcade,
          // not a stripe of stone.
          const bays = Math.max(1, Math.round(slab.width / 1.15));
          for (let i = 0; i <= bays; i++) {
            const a = slab.offset - slab.width / 2 + (slab.width * i) / bays;
            band(a, 0.1, PLINTH_HEIGHT, dadoHeight - PLINTH_HEIGHT - 0.05, 0.05, stoneMat, 0.5);
          }
        }
      }
    }

    // The cornice runs above every opening the shell can cut, so it crosses the
    // whole wall rather than breaking over each doorway.
    if (options.seam !== false) {
      if (dynastic) {
        // A cavetto cornice with a torus roll under it - the dynastic profile,
        // and the fastest way to date a wall four thousand years earlier.
        band(0, cellSize, ceilingHeight - 0.3, 0.3, 0.13, stoneMat, 1.1);
        batch.add(stonePale, new THREE.CylinderGeometry(0.075, 0.075, cellSize, 8), rollAlong(side, cx, cz, ceilingHeight - 0.34, 0.16), {
          tile: 0.5,
          castShadow: false,
          consume: true,
        });
      } else if (cave) {
        // Nothing. A cave has no line where the wall becomes the roof, and drawing
        // one is what makes a natural chamber read as a room somebody built.
      } else if (timbered) {
        // The wall plate the rafters sit on, and the earth pressing down on it.
        band(0, cellSize, ceilingHeight - 0.26, 0.26, 0.16, timberMat, tex.TIMBER_TILE * 0.7);
        band(0, cellSize, ceilingHeight - 0.32, 0.07, 0.22, stoneDark, 0.4);
      } else if (built) {
        // A moulded cornice and, under it, the corbel table: small blocks at a
        // regular pitch, which is what a vault lands on.
        band(0, cellSize, ceilingHeight - 0.24, 0.24, 0.11, stoneMat, 1.1);
        band(0, cellSize, ceilingHeight - 0.3, 0.06, 0.16, stoneDark, 0.4);
        const corbels = Math.round(cellSize / 0.8);
        for (let i = 0; i < corbels; i++) {
          const a = -cellSize / 2 + (cellSize * (i + 0.5)) / corbels;
          band(a, 0.16, ceilingHeight - 0.52, 0.22, 0.19, stonePale, 0.4);
        }
      } else {
        band(0, cellSize, ceilingHeight - 0.34, 0.34, 0.18, rootMat, 1.0);
        band(0, cellSize, ceilingHeight - 0.42, 0.1, 0.26, mossMat, 0.6);
      }
    }
  }

  /** A cylinder lying along a wall, for the roll mouldings. */
  function rollAlong(side: Side, cx: number, cz: number, y: number, depth: number): THREE.Matrix4 {
    const { yaw, at } = frame(side, cx, cz);
    return tiltMatrix(at(0, y, depth), [0, yaw, Math.PI / 2]);
  }

  /**
   * One station of the lamp course: the pack's candle. What is burning changes
   * with the zone, but the job never does - a warm point at 1.4 m on every wall,
   * repeated all the way round, so a room without a single real light in it can
   * still be walked across.
   */
  function lampStation(side: Side, cx: number, cz: number, along: number, index: number): void {
    const { yaw, at } = frame(side, cx, cz);
    const put = (
      material: THREE.Material,
      w: number,
      h: number,
      d: number,
      a: number,
      y: number,
      depth: number,
      tile = 0.4,
    ): void => {
      batch.add(material, boxGeometry(w, h, d), poseMatrix(at(a, y + h / 2, depth), yaw), { tile, castShadow: false });
    };

    if (lampStyle === 'lichen') {
      /**
       * Not a fitting and not even a plant anybody would notice: a film of cold
       * luminous lichen in the wet seams of the rock. It is the only light in the
       * map that neither flickers nor pulses, which is what makes a cave feel like
       * a place that was never lit rather than a place whose lamps went out.
       */
      const seeps = 3;
      for (let i = 0; i < seeps; i++) {
        const y = 0.34 + ((index * 5 + i * 11) % 11) * 0.19;
        const a = along + (((i * 7) % 5) - 2) * 0.21;
        const w = 0.12 + ((i * 3 + index) % 4) * 0.05;
        // A wet patch of flowstone, and the glow sitting IN it rather than on it.
        batch.add(flowMat, boxGeometry(w * 1.7, w * 1.1, 0.05), poseMatrix(at(a, y, 0.02), yaw), {
          tile: 0.3,
          castShadow: false,
        });
        batch.add(lichenMat, new THREE.SphereGeometry(w * 0.42, 5, 4), tiltMatrix(at(a, y, 0.06), [0, yaw, 0], [1.5, 1, 0.5]), GLOW);
      }
      batch.add(
        ctx.materials.get('wash.cold'),
        new THREE.PlaneGeometry(1.2, 1.6),
        poseMatrix(at(along, 1.1, 0.03), yaw),
        { ...FLAT, consume: true },
      );
      return;
    }

    if (lampStyle === 'spore') {
      // Not a fitting at all: growth in the joints, at whatever height the joint
      // happened to be. A regular course of these would read as a light fitting,
      // which is exactly what the Rot must never look like.
      const seeds = 3;
      for (let i = 0; i < seeds; i++) {
        const y = 0.42 + ((index * 7 + i * 13) % 9) * 0.17;
        const a = along + ((i * 5) % 3) * 0.16 - 0.16;
        const r = 0.045 + ((i * 3 + index) % 4) * 0.014;
        batch.add(ctx.materials.get('stem'), new THREE.SphereGeometry(r * 1.5, 5, 4), poseMatrix(at(a, y, 0.05)), {
          tile: 0.3,
          castShadow: false,
          consume: true,
        });
        batch.add(
          ctx.materials.get(i % 2 ? 'lumenSpore' : 'capTeal'),
          new THREE.SphereGeometry(r, 5, 4),
          poseMatrix(at(a, y, 0.09)),
          { castShadow: false, consume: true },
        );
      }
      batch.add(
        ctx.materials.get('wash.spore'),
        new THREE.PlaneGeometry(1.1, 1.5),
        poseMatrix(at(along, 1.0, 0.03), yaw),
        { ...FLAT, consume: true },
      );
      return;
    }

    const y = lampStyle === 'oil' ? 1.24 : 1.42;

    // The recess: a dark panel with a moulded surround standing proud of it.
    // There is no hole in the wall - a dark rectangle inside a frame that catches
    // the light reads as a recess from two metres, and costs six boxes.
    const w = lampStyle === 'oil' ? 0.44 : 0.38;
    const h = lampStyle === 'oil' ? 0.34 : 0.56;
    put(stoneDark, w, h, 0.03, along, y - h * 0.34, 0.015, 0.3);
    for (const s of [-1, 1]) {
      put(stoneMat, 0.075, h + 0.1, 0.09, along + s * (w / 2 + 0.035), y - h * 0.34 - 0.05, 0.045, 0.3);
    }
    put(stoneMat, w + 0.19, 0.08, 0.1, along, y + h * 0.66 - 0.05, 0.05, 0.3);
    // The shelf, projecting far enough to hold something and to catch a rim of
    // light on its own top face.
    put(stonePale, w + 0.16, 0.055, 0.15, along, y - h * 0.34 - 0.055, 0.075, 0.3);

    if (lampStyle === 'oil') {
      // A pottery saucer lamp: a shallow dish with the wick lying in the lip.
      batch.add(ctx.materials.get('stoneWarmPale'), new THREE.CylinderGeometry(0.085, 0.06, 0.05, 7), poseMatrix(at(along, y - 0.06, 0.075)), {
        tile: 0.2,
        castShadow: false,
        consume: true,
      });
      batch.add(ctx.materials.get('lumenOil'), new THREE.SphereGeometry(0.038, 5, 4), tiltMatrix(at(along + 0.045, y - 0.03, 0.075), [0, yaw, 0], [1, 1.5, 1]), GLOW);
      batch.add(ctx.materials.get('flame'), new THREE.SphereGeometry(0.028, 5, 3), tiltMatrix(at(along + 0.045, y + 0.02, 0.075), [0, yaw, 0], [0.7, 2.1, 0.7]), GLOW);
    } else if (lampStyle === 'soul') {
      // A stone bowl with something burning in it that is not fire. No wax, no
      // wick, no smoke stain - the absence of all three is what sells it.
      batch.add(stoneMat, new THREE.CylinderGeometry(0.09, 0.055, 0.09, 7), poseMatrix(at(along, y - 0.04, 0.075)), {
        tile: 0.2,
        castShadow: false,
        consume: true,
      });
      batch.add(ctx.materials.get('lumenSoul'), new THREE.SphereGeometry(0.06, 6, 4), tiltMatrix(at(along, y + 0.05, 0.075), [0, yaw, 0], [1, 1.8, 1]), GLOW);
      batch.add(ctx.materials.get('flameGreen'), new THREE.SphereGeometry(0.035, 5, 3), tiltMatrix(at(along, y + 0.13, 0.075), [0, yaw, 0], [0.7, 2.4, 0.7]), GLOW);
    } else {
      // Tallow. Three stubs of different lengths, because a votive niche is
      // where a hundred people have each left one, and a matched pair reads as
      // a candelabrum somebody bought.
      /**
       * Two stubs, and every sphere on them is FIVE segments.
       *
       * `tools/leakcheck.html?props=1` charged 15.5 % of the whole map to this one
       * function - 80,000 triangles over 1,932 stations - and three quarters of that
       * was 7 x 6 spheres on flames 2 cm across. It is exactly the finding the abyss
       * pack's growth bands were (systems/RENDERING.md), and the fix is the same:
       * nobody can resolve a flame's silhouette, so it does not get one.
       */
      const stubs = 1 + (index % 2);
      for (let i = 0; i < stubs; i++) {
        const a = along + (i - (stubs - 1) / 2) * 0.12;
        const len = 0.09 + ((index * 5 + i * 7) % 5) * 0.035;
        batch.add(ctx.materials.get('wax'), new THREE.CylinderGeometry(0.024, 0.03, len, 5), poseMatrix(at(a, y - 0.02 + len / 2, 0.075)), {
          tile: 0.2,
          castShadow: false,
          consume: true,
        });
        batch.add(ctx.materials.get('lumenTallow'), new THREE.SphereGeometry(0.026, 5, 4), tiltMatrix(at(a, y - 0.02 + len + 0.02, 0.075), [0, yaw, 0], [1, 1.6, 1]), GLOW);
        batch.add(ctx.materials.get('flame'), new THREE.SphereGeometry(0.019, 5, 3), tiltMatrix(at(a, y - 0.02 + len + 0.07, 0.075), [0, yaw, 0], [0.75, 2.3, 0.75]), GLOW);
      }
      // Wax that has run down the shelf and set on the way. The Sanctum's signature
      // detail, and it costs two boxes.
      for (let i = 0; i < 2; i++) {
        const a = along + (i === 0 ? -0.1 : 0.13);
        put(ctx.materials.get('waxPale'), 0.05, 0.1 + i * 0.09, 0.05, a, y - h * 0.34 - 0.15 - i * 0.06, 0.09, 0.2);
      }
      // Soot: a plume of it up the wall, which is what dates the niche.
      put(stoneDark, w * 0.7, 0.34, 0.012, along, y + h * 0.4, 0.02, 0.3);
    }

    // The light this station throws, ADDED to the wall rather than painted on it -
    // see materials.ts. One quad, on the wall only: the floor wash this used to
    // have as well meant twelve overlapping pools per room, and a floor lit evenly
    // from twelve directions is a floor with no shadows on it anywhere.
    const washName = lampStyle === 'soul' ? 'wash.cold' : lampStyle === 'oil' ? 'wash.gold' : 'wash.warm';
    batch.add(ctx.materials.get(washName), new THREE.PlaneGeometry(1.0, 1.35), poseMatrix(at(along, y + 0.08, 0.03), yaw), {
      ...FLAT,
      consume: true,
    });
  }

  /**
   * The ring around a doorway. A hole in a wall is never a clean rectangle: in
   * the Sanctum it is a moulded two-centred arch with imposts, a keystone and a
   * hood mould; in the Necropolis a pair of glyph-cut jambs under a lintel and a
   * cavetto cornice; and where the robbers came through, a ragged mouth with the
   * rubble still lying in it.
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
      batch.add(material, boxGeometry(w, h, d), tiltMatrix(at(along, y, depth), [0, yaw, roll]), {
        tile,
        castShadow: false,
      });
    };

    const half = opening.width / 2;
    const head = opening.y1;

    if (mouthStyle === 'gothic') {
      /**
       * A two-centred arch. Sampled as voussoirs round the real curve, with the
       * hood mould following it one course out: the mansion's first ribbed
       * ceiling was five unrotated boxes on an arc and read as blocks floating
       * under the ceiling rather than as vaulting (docs/art/ROOM_REVIEW.md §4),
       * so every stone here is rolled to its own tangent.
       */
      const R = opening.width * 0.78;
      const cOff = R - half;
      const aMax = Math.atan2(Math.sqrt(Math.max(0, R * R - cOff * cOff)), cOff);
      // Six voussoirs a side and a hood mould on the same loop. Seven was 3.7 % of
      // the map on its own, and the seventh stone is 3 cm of arc.
      const steps = 6;
      for (const s of [-1, 1]) {
        for (let i = 0; i < steps; i++) {
          const a = ((i + 0.5) / steps) * aMax;
          const along = s * (R * Math.cos(a) - cOff);
          const y = head + R * Math.sin(a);
          const roll = Math.atan2(Math.cos(a), -s * Math.sin(a));
          const seg = ((R * aMax) / steps) * 1.3;
          put(stoneMat, seg, 0.22, 0.16, along, y, 0.08, roll, 0.5);
          // The hood mould: a thinner roll one course out, and the thing that
          // makes an arch read as an arch in a dark room.
          put(stonePale, seg, 0.09, 0.24, along + s * Math.cos(a) * 0.03, y + Math.sin(a) * 0.16 + 0.1, 0.12, roll, 0.3);
        }
      }
      // The keystone, standing a little proud, with the ring closed over it.
      const apex = head + Math.sqrt(Math.max(0, R * R - cOff * cOff));
      put(stonePale, 0.22, 0.34, 0.2, 0, apex - 0.08, 0.1, 0, 0.4);
      put(stoneDark, 0.3, 0.07, 0.26, 0, apex + 0.11, 0.13, 0, 0.3);
      // Imposts at the springing, and a weathered corbel head under each.
      for (const s of [-1, 1]) {
        put(stonePale, 0.34, 0.11, 0.28, s * (half + 0.14), head + 0.05, 0.13, 0, 0.3);
        put(stoneMat, 0.26, 0.07, 0.22, s * (half + 0.12), head - 0.05, 0.1, 0, 0.3);
        batch.add(stoneMat, new THREE.SphereGeometry(0.11, 7, 6), tiltMatrix(at(s * (half + 0.12), head - 0.19, 0.11), [0, yaw, 0], [1, 1.25, 0.9]), {
          tile: 0.25,
          castShadow: false,
          consume: true,
        });
        // The shafts the arch stands on, down each jamb.
        batch.add(stoneMat, new THREE.CylinderGeometry(0.07, 0.07, head - 0.3, 8), poseMatrix(at(s * (half + 0.11), (head - 0.3) / 2 + 0.06, 0.1)), {
          tile: 0.4,
          castShadow: false,
          consume: true,
        });
        put(stonePale, 0.19, 0.06, 0.19, s * (half + 0.11), 0.02, 0.1, 0, 0.2);
      }
      // A worn threshold slab. Six centimetres, so it reads as a step and never
      // as something a player has to climb - collision is a floor-plane test and
      // this deliberately carries no collider.
      put(ctx.materials.get('surface.slab'), opening.width + 0.34, 0.05, 0.44, 0, 0.026, 0.14, 0, 0.6);
    } else if (mouthStyle === 'lintel') {
      // Post and lintel, cut with a glyph column down each jamb. The jambs lean
      // in a little: the dynasty battered everything, and it is what makes this
      // read as older than the arch two rooms away.
      const glyphMat = ctx.materials.get('surface.glyph');
      for (const s of [-1, 1]) {
        put(glyphMat, 0.36, head + 0.06, 0.2, s * (half + 0.18), (head + 0.06) / 2, 0.1, s * -0.012, tex.HIEROGLYPH_TILE * 0.5);
        put(stoneMat, 0.1, head + 0.02, 0.28, s * (half + 0.39), (head + 0.02) / 2, 0.14, 0, 0.4);
      }
      put(stoneMat, opening.width + 1.0, 0.3, 0.24, 0, head + 0.15, 0.12, 0, 0.8);
      // The cavetto: a hollow moulding over the lintel with a roll under it.
      put(stonePale, opening.width + 1.16, 0.24, 0.34, 0, head + 0.45, 0.17, 0, 0.6);
      batch.add(stonePale, new THREE.CylinderGeometry(0.07, 0.07, opening.width + 1.1, 8), tiltMatrix(at(0, head + 0.32, 0.2), [0, yaw, Math.PI / 2]), {
        tile: 0.4,
        castShadow: false,
        consume: true,
      });
      // A winged disc over the doorway, in three pieces: the sun and two wings
      // swept back. Painted, so it is the one warm colour on a sand wall.
      batch.add(ctx.materials.get('goldDim'), new THREE.SphereGeometry(0.14, 9, 7), tiltMatrix(at(0, head + 0.6, 0.14), [0, yaw, 0], [1, 0.85, 0.5]), {
        tile: 0.3,
        castShadow: false,
        consume: true,
      });
      for (const s of [-1, 1]) {
        put(ctx.materials.get('goldDim'), 0.42, 0.07, 0.06, s * 0.3, head + 0.6, 0.13, s * 0.16, 0.3);
        put(ctx.materials.get('goldDim'), 0.3, 0.05, 0.05, s * 0.44, head + 0.52, 0.12, s * 0.3, 0.3);
      }
      // The sill: a single slab worn hollow in the middle by four thousand years
      // of nothing walking over it at all.
      put(ctx.materials.get('surface.sandstone'), opening.width + 0.4, 0.05, 0.46, 0, 0.026, 0.15, 0, 0.7);
    } else if (mouthStyle === 'stave') {
      /**
       * Two carved posts and a lintel, with a beast's head over the middle of it.
       *
       * The posts are the whole object: a Norse door is a pair of uprights carved
       * from the crown of an oak, and the head on the lintel is what tells a player
       * this was built by people who are not the ones who built the arches.
       */
      const carveMat = ctx.materials.get('surface.carving');
      for (const s of [-1, 1]) {
        put(carveMat, 0.34, head + 0.1, 0.32, s * (half + 0.19), (head + 0.1) / 2, 0.16, 0, tex.CARVING_TILE * 0.5);
        put(timberMat, 0.1, head + 0.06, 0.4, s * (half + 0.4), (head + 0.06) / 2, 0.2, 0, tex.TIMBER_TILE * 0.5);
        // A bracket under each end of the lintel, cut as a curve.
        put(timberMat, 0.3, 0.3, 0.26, s * (half + 0.22), head - 0.18, 0.13, s * 0.7, 0.4);
      }
      put(carveMat, opening.width + 0.9, 0.34, 0.34, 0, head + 0.17, 0.17, 0, tex.CARVING_TILE * 0.7);
      put(timberMat, opening.width + 1.0, 0.12, 0.42, 0, head + 0.4, 0.21, 0, 0.6);
      // The beast: a muzzle, a jaw, two eyes and a pair of ears. Six pieces, and it
      // reads from the far side of the room because it is on the centre line.
      batch.add(timberMat, new THREE.SphereGeometry(0.2, 8, 6), tiltMatrix(at(0, head + 0.56, 0.2), [0, yaw, 0], [1.1, 0.9, 1.2]), {
        tile: 0.4,
        castShadow: false,
        consume: true,
      });
      put(timberMat, 0.17, 0.15, 0.34, 0, head + 0.5, 0.36, 0, 0.3);
      put(ctx.materials.get('bitumen'), 0.2, 0.05, 0.06, 0, head + 0.44, 0.5, 0, 0.2);
      for (const s of [-1, 1]) {
        batch.add(ctx.materials.get('itemEnamel'), new THREE.SphereGeometry(0.032, 5, 4), poseMatrix(at(s * 0.09, head + 0.6, 0.3)), GLOW);
        put(timberMat, 0.1, 0.16, 0.1, s * 0.14, head + 0.68, 0.16, s * 0.4, 0.2);
      }
      // A threshold plank, worn hollow.
      put(timberMat, opening.width + 0.2, 0.06, 0.4, 0, 0.03, 0.13, 0, 0.5);
    } else if (mouthStyle === 'rubble') {
      // Somebody made this hole. Broken blocks round the edge, a cracked timber
      // prop each side and the spoil still lying where it fell.
      const steps = 14;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const a = t * Math.PI * 2;
        const along = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.7) * (half + 0.22);
        const rise = head / 2 + Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.7) * (head / 2 + 0.16);
        if (rise < 0.1) continue; // the floor takes the bottom of the ring
        const size = 0.17 + Math.abs(Math.sin(a * 3.1 + 0.7)) * 0.13;
        put(i % 3 === 0 ? stonePale : stoneMat, size, size * 0.72, 0.28, along, rise, 0.1, a * 0.4, 0.4);
      }
      for (const s of [-1, 1]) {
        batch.add(timberMat, new THREE.CylinderGeometry(0.075, 0.085, head - 0.1, 7), tiltMatrix(at(s * (half + 0.16), (head - 0.1) / 2, 0.2), [0, yaw, s * 0.045]), {
          tile: tex.TIMBER_TILE * 0.5,
          castShadow: false,
          consume: true,
        });
      }
      put(timberMat, opening.width + 0.5, 0.14, 0.22, 0, head - 0.12, 0.2, 0.02, 0.6);
      for (let i = 0; i < 5; i++) {
        const a = -half + (opening.width * (i + 0.5)) / 5;
        batch.add(stoneMat, new THREE.SphereGeometry(0.1 + (i % 3) * 0.05, 6, 5), tiltMatrix(at(a * 0.8, 0.05, 0.42 + (i % 2) * 0.2), [0, i, 0], [1.3, 0.6, 1.1]), {
          tile: 0.3,
          castShadow: false,
          consume: true,
        });
      }
    } else {
      // The Rot's own doorway: roots have got into the joints and pulled the
      // opening out of square, and the fungus has followed them in. Sampled as
      // one loop rather than as jambs plus a lintel, because the corners are
      // exactly where a four-piece frame gives itself away.
      const steps = 16;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const a = t * Math.PI * 2;
        const along = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.62) * (half + 0.19);
        const rise = head / 2 + Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.62) * (head / 2 + 0.15);
        if (rise < 0.09) continue;
        const r = 0.09 + Math.abs(Math.sin(a * 2.3 + 1.4)) * 0.07;
        batch.add(rootMat, new THREE.CylinderGeometry(r * 0.7, r, 0.42, 6), tiltMatrix(at(along, rise, 0.12), [Math.PI / 2 - 0.4, yaw, a]), {
          tile: 0.4,
          castShadow: false,
          consume: true,
        });
        if (i % 3 === 0) {
          batch.add(ctx.materials.get('capPale'), new THREE.SphereGeometry(r * 0.85, 6, 5), tiltMatrix(at(along, rise, 0.24), [0, yaw, 0], [1.4, 0.5, 1]), {
            tile: 0.3,
            castShadow: false,
            consume: true,
          });
        }
      }
      // One glowing cluster on the arch, so a doorway in the dark still reads.
      batch.add(ctx.materials.get('lumenSpore'), new THREE.SphereGeometry(0.055, 7, 6), poseMatrix(at(half * 0.4, head - 0.05, 0.2)), {
        castShadow: false,
        consume: true,
      });
    }
  }

  /**
   * A niche: a recess in a wall the generator can never open, with something in
   * it. The pack's window, and the reason half the rooms are frightening rather
   * than merely dark - a wall you can see *into* is worse than a wall.
   *
   * The wall is genuinely cut for the opening (see `slabsFor`), and the recess is
   * built behind it, so the shadow inside is real.
   */
  function buildNiche(spec: NicheSpec, side: Side, cx: number, cz: number, opening: { width: number; y0: number; y1: number }): void {
    const { yaw, at } = frame(side, cx, cz);
    const kind = spec.kind ?? 'loculus';
    const rng = ctx.rng;
    const r = (min: number, max: number): number => min + rng() * (max - min);
    const h = opening.y1 - opening.y0;
    const midY = (opening.y0 + opening.y1) / 2;
    const depth = kind === 'effigy' ? 0.9 : kind === 'loculus' ? 0.95 : 0.62;

    const put = (
      material: THREE.Material,
      w: number,
      hh: number,
      d: number,
      along: number,
      y: number,
      z: number,
      tile = 0.6,
      roll = 0,
    ): void => {
      batch.add(material, boxGeometry(w, hh, d), tiltMatrix(at(along, y, z), [0, yaw, roll]), { tile, castShadow: false });
    };
    const pane = (material: THREE.Material, w: number, hh: number, along: number, y: number, z: number): void => {
      batch.add(material, new THREE.PlaneGeometry(w, hh), poseMatrix(at(along, y, z), yaw), { ...FLAT, consume: true });
    };

    /**
     * A runestone leans against the wall rather than being cut into it: a carved
     * slab, red in the grooves, with a rubble kerb round its foot. Same idea as the
     * stela - a niche kind that is a THING against a solid wall rather than a hole
     * in one - and the reason both exist is that a wall the generator cannot open is
     * the only place a set piece is guaranteed to be safe.
     */
    if (kind === 'runestone') {
      const carveMat = ctx.materials.get('surface.carving');
      // The slab, leaning back a few degrees, wider at the foot.
      put(carveMat, opening.width * 0.82, h + 0.3, 0.22, 0, midY, 0.16, 0.03, tex.CARVING_TILE);
      put(carveMat, opening.width * 0.9, 0.24, 0.3, 0, 0.12, 0.2, 0, tex.CARVING_TILE * 0.6);
      // A rounded head on it, which is what a runestone has instead of a cornice.
      batch.add(carveMat, new THREE.CylinderGeometry(opening.width * 0.41, opening.width * 0.41, 0.22, 12), tiltMatrix(at(0, opening.y1 + 0.28, 0.16), [Math.PI / 2, yaw, 0]), {
        tile: tex.CARVING_TILE,
        castShadow: false,
        consume: true,
      });
      // The kerb of stones packed round its foot to hold it up.
      for (let i = 0; i < 7; i++) {
        const a = -opening.width * 0.5 + (opening.width * (i + 0.5)) / 7;
        batch.add(stoneMat, new THREE.SphereGeometry(r(0.13, 0.22), 6, 5), tiltMatrix(at(a, 0.06, r(0.34, 0.5)), [0, i, 0], [1.2, 0.7, 1]), {
          tile: 0.4,
          castShadow: false,
          consume: true,
        });
      }
      nicheAnchors.push({ position: at(0, midY, 0), side, kind });
      return;
    }

    // A stela is not a hole: it is a slab of relief standing against the wall,
    // and it takes the same surround as the recesses so a wall of them matches.
    if (kind === 'stela') {
      put(ctx.materials.get('surface.glyph'), opening.width, h, 0.14, 0, midY, 0.07, tex.HIEROGLYPH_TILE * 0.55);
      // A false door: the offering niche, its lintel and the two jambs, all
      // stepped back one course from each other. Nothing goes through it.
      put(stoneMat, opening.width + 0.3, 0.2, 0.24, 0, opening.y1 + 0.1, 0.12, 0.6);
      put(stonePale, opening.width + 0.42, 0.18, 0.3, 0, opening.y1 + 0.3, 0.15, 0.5);
      for (const s of [-1, 1]) {
        put(stoneMat, 0.2, h, 0.22, (s * (opening.width + 0.2)) / 2, midY, 0.11, 0.5);
      }
      put(stoneDark, opening.width * 0.5, h * 0.62, 0.04, 0, opening.y0 + h * 0.31, 0.15, 0.4);
      put(ctx.materials.get('goldDim'), opening.width * 0.34, 0.05, 0.05, 0, opening.y0 + h * 0.66, 0.18, 0.3);
      // The offering slab at its foot, with something still on it.
      put(ctx.materials.get('surface.sandstone'), opening.width * 0.7, 0.1, 0.4, 0, 0.05, 0.3, 0.5);
      for (let i = 0; i < 3; i++) {
        batch.add(ctx.materials.get('stoneWarmPale'), new THREE.CylinderGeometry(0.06, 0.05, 0.09, 8), poseMatrix(at(-0.2 + i * 0.2, 0.19, 0.3)), {
          tile: 0.2,
          castShadow: false,
          consume: true,
        });
      }
      nicheAnchors.push({ position: at(0, midY, 0), side, kind });
      return;
    }

    /* --- the recess box ---------------------------------------------------- */
    // Back, sides, soffit and floor. The back is the darkest material in the
    // pack: the whole point of a niche is that the eye cannot find the bottom.
    pane(ctx.materials.get(kind === 'breach' ? 'backdropVoid' : 'stoneDark'), opening.width + 0.5, h + 0.5, 0, midY, -depth);
    if (kind === 'grate' || kind === 'breach' || kind === 'crevice') {
      // These three open into somewhere rather than into a box, so they get a
      // picture of depth a good way further back and no side walls at all.
      pane(ctx.materials.get(DYNASTIC.has(wallStyle) ? 'backdropWarm' : 'backdropVoid'), opening.width + 1.4, h + 1.2, 0, midY, -depth - 0.7);
      pane(ctx.materials.get(DYNASTIC.has(wallStyle) ? 'hazeWarm' : 'hazeCold'), opening.width + 0.8, h + 0.6, 0, midY, -depth * 0.6);
    } else {
      for (const s of [-1, 1]) {
        put(stoneDark, 0.12, h + 0.2, depth, (s * (opening.width + 0.1)) / 2, midY, -depth / 2, 0.5);
      }
      put(stoneDark, opening.width + 0.2, 0.12, depth, 0, opening.y1 + 0.05, -depth / 2, 0.5);
      put(ctx.materials.get('surface.slab'), opening.width, 0.1, depth, 0, opening.y0 - 0.05, -depth / 2 + 0.02, 0.6);
    }

    /* --- the surround ------------------------------------------------------ */
    if (kind === 'crevice') {
      // A crack has no surround. Its own ragged loop of rock is built below.
    } else if (kind === 'breach') {
      // Broken through. No surround at all: rubble round the hole and a fall of
      // spoil out onto the floor of the room.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const along = Math.cos(a) * (opening.width / 2 + 0.2);
        const rise = midY + Math.sin(a) * (h / 2 + 0.18);
        if (rise < 0.12) continue;
        batch.add(stoneMat, new THREE.SphereGeometry(r(0.11, 0.22), 6, 5), tiltMatrix(at(along, rise, 0.06), [0, a, 0], [1.2, 0.75, 1]), {
          tile: 0.35,
          castShadow: false,
          consume: true,
        });
      }
      for (let i = 0; i < 6; i++) {
        batch.add(stoneMat, new THREE.SphereGeometry(r(0.1, 0.24), 6, 5), tiltMatrix(at(r(-1, 1), 0.04, r(0.2, 0.9)), [0, i, 0], [1.3, 0.5, 1.1]), {
          tile: 0.35,
          castShadow: false,
          consume: true,
        });
      }
    } else if (DYNASTIC.has(wallStyle)) {
      put(stoneMat, opening.width + 0.44, 0.18, 0.2, 0, opening.y1 + 0.09, 0.1, 0.6);
      put(stonePale, opening.width + 0.56, 0.16, 0.26, 0, opening.y1 + 0.26, 0.13, 0.5);
      for (const s of [-1, 1]) {
        put(ctx.materials.get('surface.glyph'), 0.22, h + 0.18, 0.18, (s * (opening.width + 0.22)) / 2, midY, 0.09, tex.HIEROGLYPH_TILE * 0.4);
      }
      put(stoneMat, opening.width + 0.4, 0.09, 0.28, 0, opening.y0 - 0.045, 0.14, 0.5);
    } else {
      // A moulded arched surround: two jambs, a semicircular head sampled as
      // voussoirs, and a sill that projects far enough to catch a light.
      for (const s of [-1, 1]) {
        put(stoneMat, 0.2, h, 0.2, (s * (opening.width + 0.2)) / 2, midY, 0.1, 0.5);
        put(stoneDark, 0.07, h + 0.1, 0.26, (s * (opening.width + 0.42)) / 2, midY, 0.13, 0.3);
      }
      const R = opening.width / 2 + 0.1;
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        const a = Math.PI * ((i + 0.5) / steps);
        const seg = ((Math.PI * R) / steps) * 1.35;
        put(i % 2 ? stonePale : stoneMat, seg, 0.19, 0.2, -Math.cos(a) * R, opening.y1 + Math.sin(a) * R * 0.62, 0.1, 0.4, a - Math.PI / 2);
      }
      put(stonePale, opening.width + 0.5, 0.085, 0.34, 0, opening.y0 - 0.04, 0.17, 0.5);
      put(stoneDark, opening.width + 0.5, 0.05, 0.06, 0, opening.y0 - 0.1, 0.32, 0.3);
    }

    /* --- what is in it ----------------------------------------------------- */
    if (kind === 'loculus') {
      // Two shelves, and on them what the Order put there. The shroud is
      // double-sided and faintly self-lit: a backlit single-sided cloth reads as
      // a hole cut in the air (docs/art/ROOM_REVIEW.md §4).
      const shelfY = opening.y0 + h * 0.5;
      put(ctx.materials.get('surface.slab'), opening.width, 0.09, depth - 0.06, 0, shelfY, -depth / 2, 0.6);
      for (const [y, occupied2] of [
        [opening.y0 + 0.06, true],
        [shelfY + 0.09, rng() > 0.35],
      ] as const) {
        if (!occupied2) continue;
        const len = Math.min(opening.width - 0.2, 1.75);
        // A body: a tapering wrapped form, wider at the shoulders, with the
        // ankles bound. Six segments, because a single box is a parcel.
        for (let i = 0; i < 6; i++) {
          const t = i / 5;
          const w = 0.34 - Math.pow(t, 1.4) * 0.19;
          const hh = 0.26 - t * 0.13;
          batch.add(
            ctx.materials.get(i === 0 ? 'linenLit' : 'linen'),
            boxGeometry(len / 6 + 0.02, hh, w),
            tiltMatrix(at(-len / 2 + (len * (i + 0.5)) / 6, y + hh / 2, -depth * 0.55), [0, yaw, (i - 2.5) * 0.014]),
            { tile: tex.LINEN_TILE * 0.6, castShadow: false },
          );
        }
        // The head, turned a little toward the opening. It is the one thing in
        // the recess a player will actually see, so it is the only sphere.
        batch.add(ctx.materials.get('linen'), new THREE.SphereGeometry(0.15, 8, 7), tiltMatrix(at(-len / 2 + 0.1, y + 0.17, -depth * 0.55), [0, yaw + r(-0.3, 0.3), 0], [1, 1.15, 0.92]), {
          tile: tex.LINEN_TILE * 0.5,
          castShadow: false,
          consume: true,
        });
        // The cords round the wrapping, every third of its length.
        for (const t of [0.22, 0.5, 0.78]) {
          put(ctx.materials.get('rope'), 0.035, 0.2, 0.3, -len / 2 + len * t, y + 0.1, -depth * 0.55, 0.2);
        }
      }
      // The name plate, on the surround where a name plate goes.
      put(ctx.materials.get('surface.inscription'), opening.width * 0.6, 0.2, 0.05, 0, opening.y0 - 0.3, 0.14, tex.INSCRIPTION_TILE * 0.5);
    } else if (kind === 'urns') {
      // Three shelves of vessels. In the Sanctum they are lead ossuary urns; in
      // the Necropolis, canopic jars with their four heads.
      const shelves = 3;
      for (let sIdx = 0; sIdx < shelves; sIdx++) {
        const y = opening.y0 + (h * sIdx) / shelves;
        if (sIdx > 0) put(ctx.materials.get('surface.slab'), opening.width, 0.07, depth - 0.06, 0, y, -depth / 2, 0.6);
        const count = 3;
        for (let i = 0; i < count; i++) {
          if (rng() > 0.85) continue;
          const a = -opening.width / 2 + (opening.width * (i + 0.6)) / count + r(-0.06, 0.06);
          const jar = h / shelves - 0.16;
          const warm = DYNASTIC.has(wallStyle);
          batch.add(
            ctx.materials.get(warm ? 'alabaster' : 'lead'),
            new THREE.CylinderGeometry(jar * 0.3, jar * 0.24, jar, 10),
            poseMatrix(at(a, y + 0.07 + jar / 2, -depth * 0.5)),
            { tile: 0.3, castShadow: false, consume: true },
          );
          // The stopper: a head, or a domed lid with a ring on it.
          if (warm) {
            const headKind = i % 3;
            batch.add(
              ctx.materials.get('alabaster'),
              headKind === 0
                ? new THREE.SphereGeometry(jar * 0.19, 8, 7)
                : headKind === 1
                  ? new THREE.ConeGeometry(jar * 0.2, jar * 0.42, 7)
                  : new THREE.CylinderGeometry(jar * 0.13, jar * 0.19, jar * 0.34, 8),
              poseMatrix(at(a, y + 0.07 + jar + jar * 0.16, -depth * 0.5)),
              { tile: 0.25, castShadow: false, consume: true },
            );
            if (headKind === 1) {
              // Ears, which is the whole difference between a jackal and a cone.
              for (const s of [-1, 1]) {
                put(ctx.materials.get('alabaster'), 0.035, jar * 0.2, 0.05, a + s * jar * 0.11, y + 0.07 + jar + jar * 0.34, -depth * 0.5, 0.2, s * 0.3);
              }
            }
          } else {
            batch.add(ctx.materials.get('lead'), new THREE.SphereGeometry(jar * 0.3, 9, 5), tiltMatrix(at(a, y + 0.07 + jar, -depth * 0.5), [0, 0, 0], [1, 0.5, 1]), {
              tile: 0.25,
              castShadow: false,
              consume: true,
            });
          }
        }
      }
    } else if (kind === 'effigy') {
      // A standing figure. What kind depends on the zone, but the read is the
      // same either way: a person-shaped pale thing at the back of a dark hole,
      // and it must NOT be centred - a statue square in its niche looks placed,
      // and one leaning looks left.
      const lean = r(-0.06, 0.06);
      const base = 0.22;
      const stoneName = DYNASTIC.has(wallStyle) ? 'stoneWarmPale' : 'marble';
      put(stoneMat, opening.width * 0.66, base, 0.5, 0, base / 2, -depth * 0.55, 0.4);
      // Legs, hips, chest, shoulders, head. A profile that narrows, widens and
      // narrows again - a monotonic taper is a bottle, not a figure
      // (docs/art/ROOM_REVIEW.md §4).
      const stack: [number, number, number][] = [
        [0.42, 0.62, base],
        [0.36, 0.2, base + 0.62],
        [0.44, 0.62, base + 0.82],
        [0.5, 0.16, base + 1.44],
        [0.24, 0.1, base + 1.6],
      ];
      for (const [w, hh, y] of stack) {
        batch.add(
          ctx.materials.get(stoneName),
          new THREE.CylinderGeometry(w / 2, (w / 2) * 1.04, hh, 9),
          tiltMatrix(at(0, y + hh / 2, -depth * 0.55), [0, yaw, lean]),
          { tile: 0.5, castShadow: false, consume: true },
        );
      }
      batch.add(ctx.materials.get(stoneName), new THREE.SphereGeometry(0.155, 9, 8), tiltMatrix(at(lean * -1.7, base + 1.78, -depth * 0.55), [0, yaw, 0], [0.92, 1.2, 0.95]), {
        tile: 0.4,
        castShadow: false,
        consume: true,
      });
      if (DYNASTIC.has(wallStyle)) {
        // A nemes headdress: two lappets falling either side of the face. It is
        // the silhouette that dates the statue, so it is worth four boxes.
        for (const s of [-1, 1]) {
          put(ctx.materials.get(stoneName), 0.11, 0.34, 0.16, s * 0.16, base + 1.6, -depth * 0.55 + 0.06, 0.3);
        }
        put(ctx.materials.get('goldDim'), 0.3, 0.07, 0.2, 0, base + 1.9, -depth * 0.55, 0.2);
        // Arms crossed on the chest, holding the crook and the flail.
        for (const s of [-1, 1]) {
          put(ctx.materials.get(stoneName), 0.34, 0.1, 0.14, s * 0.04, base + 1.16, -depth * 0.4, 0.3, s * 0.28);
        }
      } else {
        // A hood, and the empty sleeves that separate a robed figure from an
        // object. The Order's saints are all faceless: the hood is deep enough
        // that where the face should be is simply dark.
        batch.add(ctx.materials.get(stoneName), new THREE.SphereGeometry(0.23, 9, 8), tiltMatrix(at(0, base + 1.76, -depth * 0.55 - 0.03), [0, yaw, 0], [1, 1.05, 1.15]), {
          tile: 0.4,
          castShadow: false,
          consume: true,
        });
        put(stoneDark, 0.22, 0.26, 0.06, 0, base + 1.68, -depth * 0.55 + 0.19, 0.2);
        for (const s of [-1, 1]) {
          batch.add(
            ctx.materials.get(stoneName),
            new THREE.CylinderGeometry(0.085, 0.11, 0.62, 7),
            tiltMatrix(at(s * 0.26, base + 1.12, -depth * 0.5), [0.14, yaw, s * 0.1]),
            { tile: 0.4, castShadow: false, consume: true },
          );
        }
        // Hands together in front, holding something long: a sword point down.
        put(ctx.materials.get(stoneName), 0.13, 0.16, 0.13, 0, base + 0.98, -depth * 0.36, 0.2);
        put(ctx.materials.get('ironDark'), 0.07, 0.86, 0.03, 0, base + 0.12, -depth * 0.36, 0.3);
        put(ctx.materials.get('ironDark'), 0.24, 0.05, 0.05, 0, base + 0.94, -depth * 0.36, 0.2);
      }
    } else if (kind === 'grate') {
      // Iron bars in a stone rebate, and nothing behind them a player can
      // resolve. Bars run BOTH ways: a single set reads as a fence, two as a
      // grille that has been keeping something in.
      const bars = Math.max(4, Math.round(opening.width / 0.24));
      for (let i = 0; i < bars; i++) {
        const a = -opening.width / 2 + (opening.width * (i + 0.5)) / bars;
        batch.add(ironMat, new THREE.CylinderGeometry(0.022, 0.022, h + 0.14, 6), poseMatrix(at(a, midY, 0.04)), {
          tile: tex.IRON_TILE * 0.4,
          castShadow: false,
          consume: true,
        });
      }
      for (const t of [0.28, 0.72]) {
        batch.add(ironMat, new THREE.CylinderGeometry(0.026, 0.026, opening.width + 0.1, 6), tiltMatrix(at(0, opening.y0 + h * t, 0.06), [0, yaw, Math.PI / 2]), {
          tile: tex.IRON_TILE * 0.4,
          castShadow: false,
          consume: true,
        });
      }
      // The hasp and the chain hanging off it, cut through.
      put(ctx.materials.get('ironPale'), 0.1, 0.16, 0.09, opening.width * 0.32, midY, 0.1, 0.2);
      for (let i = 0; i < 4; i++) {
        batch.add(ironMat, new THREE.TorusGeometry(0.035, 0.011, 5, 8), tiltMatrix(at(opening.width * 0.32 + 0.02, midY - 0.14 - i * 0.06, 0.1), [0, yaw, i % 2 ? 0 : Math.PI / 2]), {
          tile: 0.2,
          castShadow: false,
          consume: true,
        });
      }
      // Handprints on the inside of the bars. Two, small, and low.
      for (const s of [-1, 1]) {
        pane(ctx.materials.get('stoneDark'), 0.13, 0.17, s * 0.2, midY - h * 0.18, -0.02);
      }
    } else if (kind === 'ossuary') {
      // Skulls, stacked to the soffit behind a lattice. This is the one niche
      // that is about DENSITY, so it is instanced tightly and the lattice in
      // front of it does the composition.
      const cols = Math.max(3, Math.round(opening.width / 0.28));
      const rows = Math.max(3, Math.round(h / 0.26));
      for (let ry = 0; ry < rows; ry++) {
        for (let cIdx = 0; cIdx < cols; cIdx++) {
          if ((ry * 7 + cIdx * 3) % 11 === 0) continue; // gaps: a stack is never full
          const a = -opening.width / 2 + (opening.width * (cIdx + 0.5)) / cols;
          const y = opening.y0 + 0.12 + (h - 0.2) * (ry / rows);
          const z = -depth * 0.45 - ((cIdx + ry) % 2) * 0.12;
          batch.add(ctx.materials.get(ry % 3 === 1 ? 'boneDark' : 'bone'), new THREE.SphereGeometry(0.09, 6, 5), tiltMatrix(at(a, y, z), [0, yaw + ((cIdx * 5) % 7) * 0.2, 0], [1, 1.12, 1.15]), {
            tile: 0.25,
            castShadow: false,
            consume: true,
          });
          // The sockets. Two dark spots is the entire difference between a skull
          // and a stone.
          put(stoneDark, 0.055, 0.035, 0.02, a - 0.028, y + 0.01, z + 0.085, 0.2);
          put(stoneDark, 0.055, 0.035, 0.02, a + 0.028, y + 0.01, z + 0.085, 0.2);
        }
      }
      // The lattice: long bones laid across the opening, one course of them.
      const lats = Math.max(3, Math.round(h / 0.34));
      for (let i = 0; i < lats; i++) {
        const y = opening.y0 + (h * (i + 0.5)) / lats;
        batch.add(boneMat, new THREE.CylinderGeometry(0.032, 0.038, opening.width + 0.06, 6), tiltMatrix(at(0, y, 0.05), [0, yaw, Math.PI / 2 + (i % 2 ? 0.02 : -0.02)]), {
          tile: 0.3,
          castShadow: false,
          consume: true,
        });
        for (const s of [-1, 1]) {
          batch.add(boneMat, new THREE.SphereGeometry(0.055, 6, 5), tiltMatrix(at((s * (opening.width + 0.06)) / 2, y, 0.05), [0, yaw, 0], [0.8, 1, 1.1]), {
            tile: 0.2,
            castShadow: false,
            consume: true,
          });
        }
      }
    } else if (kind === 'crevice') {
      /**
       * A fissure in living rock. No surround, no sill, no frame - a crack does not
       * have any of those - so what makes it read as depth is the picture of dark at
       * the back of it, the lichen on its wet lip, and the fact that its edge is a
       * ragged loop rather than a rectangle.
       */
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const along = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.55) * (opening.width / 2 + 0.16);
        const rise = midY + Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.55) * (h / 2 + 0.14);
        const lump = 0.14 + Math.abs(Math.sin(a * 2.3 + 0.6)) * 0.12;
        batch.add(caveMat, new THREE.SphereGeometry(lump, 6, 5), tiltMatrix(at(along, rise, 0.06 + lump * 0.3), [0, yaw, a], [1.2, 1, 0.8]), {
          tile: 0.5,
          castShadow: false,
          consume: true,
        });
        // Flowstone on the lower lip, where the water runs out of it, and lichen in
        // the wet: the only two bright things in the hole.
        if (rise < midY && i % 2 === 0) {
          batch.add(flowMat, new THREE.SphereGeometry(lump * 0.7, 5, 4), tiltMatrix(at(along, rise - 0.06, 0.16), [0, yaw, 0], [1.4, 0.6, 1]), {
            tile: 0.3,
            castShadow: false,
            consume: true,
          });
          if (i % 4 === 0) {
            batch.add(lichenMat, new THREE.SphereGeometry(0.05, 5, 4), tiltMatrix(at(along, rise - 0.02, 0.2), [0, yaw, 0], [1.6, 0.8, 0.6]), GLOW);
          }
        }
      }
      // Cold air coming out of it, and nothing else.
      pane(ctx.materials.get('hazeCold'), opening.width * 0.5, h * 0.9, 0, midY, -0.2);
    } else if (kind === 'lancet') {
      // A stained lancet with a night sky behind it: the only daylight-coloured
      // thing in the map, and the reason the chapel reads as being under
      // something rather than inside a hill.
      pane(ctx.materials.get('lancetGlass'), opening.width, h, 0, midY, -0.05);
      // Leaded ferramenta: two saddle bars across the light.
      for (const t of [0.34, 0.68]) {
        put(ctx.materials.get('ironDark'), opening.width + 0.04, 0.03, 0.05, 0, opening.y0 + h * t, -0.02, 0.2);
      }
      // The splayed reveal: the jambs cut back so the light spreads into the
      // room. Without the splay a window in a 0.3 m wall is a slot.
      for (const s of [-1, 1]) {
        put(stonePale, 0.34, h + 0.2, 0.3, (s * (opening.width + 0.3)) / 2, midY, 0.14, 0.5, 0);
      }
      // The shaft of light on the floor under it. Additive, so it does not lay a
      // dark rectangle over the flagstones.
      batch.add(
        ctx.materials.get('wash.cold'),
        new THREE.PlaneGeometry(opening.width + 1.1, 2.2),
        tiltMatrix(at(0, 0.016, 1.2), [-Math.PI / 2, yaw, 0]),
        { ...FLAT, consume: true },
      );
    } else {
      // breach: the Rot's own doorway into a room, hanging with growth.
      for (let i = 0; i < 7; i++) {
        const a = r(-opening.width / 2, opening.width / 2);
        const len = r(0.3, 0.9);
        batch.add(rootMat, new THREE.CylinderGeometry(0.03, 0.055, len, 6), tiltMatrix(at(a, opening.y1 - len / 2, r(-0.3, 0.1)), [r(-0.2, 0.2), yaw, r(-0.3, 0.3)]), {
          tile: 0.4,
          castShadow: false,
          consume: true,
        });
      }
      for (let i = 0; i < 5; i++) {
        const a = r(-opening.width / 2, opening.width / 2);
        const y = r(opening.y0 + 0.1, opening.y1 - 0.4);
        batch.add(ctx.materials.get(i % 2 ? 'capViolet' : 'capTeal'), new THREE.SphereGeometry(r(0.05, 0.1), 7, 6), tiltMatrix(at(a, y, r(-0.4, 0)), [0, yaw, 0], [1.3, 0.6, 1.3]), {
          castShadow: false,
          consume: true,
        });
      }
      batch.add(ctx.materials.get('hazeSpore'), new THREE.PlaneGeometry(opening.width + 0.6, h), poseMatrix(at(0, midY, -0.3), yaw), {
        ...FLAT,
        consume: true,
      });
    }

    if (spec.light) {
      const colour =
        kind === 'lancet' ? 0x9fd0e8 : kind === 'breach' ? 0x9a6cff : DYNASTIC.has(wallStyle) ? 0xffb060 : 0xffc074;
      const lamp = new THREE.PointLight(colour, kind === 'lancet' ? 9 : 7, cellSize * 1.3, 2);
      lamp.position.set(...at(0, midY + h * 0.2, kind === 'lancet' ? 0.5 : -depth * 0.3));
      extra.add(lamp);
      lights.push(lamp);
    }

    nicheAnchors.push({ position: at(0, midY, 0), side, kind });
  }

  /* --- per cell ------------------------------------------------------------ */
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
      case 'groin': {
        /**
         * A quadripartite vault: four diagonal ribs from the corners to a boss
         * at the crown, four transverse arches round the walls, and the flat
         * ceiling above reading as the web between them.
         *
         * Every rib stone is rolled to its own tangent. Sampled coarsely and
         * unrotated, this is the failure the manor's first ribbed ceiling shipped
         * with - blocks floating under a ceiling rather than vaulting.
         */
        // Springing at 2.45 rather than 2.25: the diagonal ribs land in the four
        // corners of the cell, which is exactly where the review tool parks its
        // raised overview cameras, and 20 cm of headroom is the difference between a
        // rib and a black wedge across half the contact sheet.
        const spring = ceilingHeight - 0.95;
        const crown = ceilingHeight - 0.13;
        const halfCell = cellSize / 2 - wallThickness;
        const diag = Math.hypot(halfCell, halfCell);
        for (let q = 0; q < 4; q++) {
          const a0 = q * (Math.PI / 2) + Math.PI / 4;
          const dx = Math.cos(a0);
          const dz = Math.sin(a0);
          const steps = 8;
          for (let i = 0; i < steps; i++) {
            const t = (i + 0.5) / steps;
            // A circular rise, so the rib is steep at the springing and flat at
            // the crown, the way a vault actually goes.
            const y = spring + (crown - spring) * Math.sin(t * (Math.PI / 2));
            const rise = (crown - spring) * (Math.PI / 2) * Math.cos(t * (Math.PI / 2)) / steps;
            const run = diag / steps;
            const pitch = Math.atan2(rise, run);
            const d = diag * (1 - t);
            batch.add(
              stoneMat,
              boxGeometry(Math.hypot(run, rise) * 1.35, 0.18, 0.2),
              tiltMatrix([cx + dx * d, y, cz + dz * d], [0, -a0, -pitch]),
              { tile: 0.5, ...CEILING_OPTS },
            );
          }
          // The springer: a moulded corbel the ribs land on, in the corner.
          batch.add(stonePale, new THREE.ConeGeometry(0.2, 0.44, 6), tiltMatrix([cx + dx * (diag - 0.12), spring - 0.18, cz + dz * (diag - 0.12)], [Math.PI, 0, 0]), {
            tile: 0.3,
            ...CEILING_OPTS,
            consume: true,
          });
        }
        // The boss at the crown: a carved knot, and the one place a vault has a
        // detail worth looking up at.
        batch.add(stonePale, new THREE.SphereGeometry(0.22, 9, 7), tiltMatrix([cx, crown - 0.12, cz], [0, 0, 0], [1, 0.7, 1]), {
          tile: 0.3,
          ...CEILING_OPTS,
          consume: true,
        });
        batch.add(ctx.materials.get('stoneDark'), new THREE.TorusGeometry(0.16, 0.045, 5, 10), tiltMatrix([cx, crown - 0.2, cz], [Math.PI / 2, 0, 0]), {
          tile: 0.2,
          ...CEILING_OPTS,
          consume: true,
        });
        /**
         * Transverse arches: a wall rib round all four sides.
         *
         * A box rolled about Z lies in the XY plane, which is right for a rib
         * running along X and tips a rib running along Z straight out of the
         * wall. The ones on the east and west walls are therefore pitched about
         * X instead. Getting this wrong is how a rail ends up standing on end
         * (docs/art/ROOM_REVIEW.md §4).
         */
        const arch = ctx.materials.get('surface.brick');
        for (const side of SIDES) {
          const runsAlongX = side === 'north' || side === 'south';
          const inward = INWARD[side];
          const steps = 7;
          for (let i = 0; i < steps; i++) {
            const a = Math.PI * ((i + 0.5) / steps);
            const along = -Math.cos(a) * halfCell;
            const y = spring + Math.sin(a) * (crown - spring);
            const seg = ((Math.PI * halfCell) / steps) * 1.25;
            const roll = a - Math.PI / 2;
            const px = runsAlongX ? cx + along : cx - inward[0] * (halfCell - 0.14);
            const pz = runsAlongX ? cz - inward[1] * (halfCell - 0.14) : cz + along;
            batch.add(
              arch,
              boxGeometry(runsAlongX ? seg : 0.22, 0.2, runsAlongX ? 0.22 : seg),
              tiltMatrix([px, y, pz], runsAlongX ? [0, 0, roll] : [-roll, 0, 0]),
              { tile: tex.BRICK_TILE * 0.4, ...CEILING_OPTS },
            );
          }
        }
        break;
      }
      case 'barrel': {
        // A tunnel vault running north-south, sampled as voussoirs. The courses
        // are the read: a smooth half-cylinder looks extruded, and a barrel
        // vault is built one ring at a time.
        const spring = ceilingHeight - 1.0;
        const R = cellSize / 2 - wallThickness;
        const rings = 9;
        const steps = 11;
        for (let ring = 0; ring < rings; ring++) {
          const z = cz - cellSize / 2 + (cellSize * (ring + 0.5)) / rings;
          for (let i = 0; i < steps; i++) {
            const a = Math.PI * ((i + 0.5) / steps);
            const x = cx - Math.cos(a) * R;
            const y = spring + Math.sin(a) * (ceilingHeight - spring - 0.1);
            const seg = ((Math.PI * R) / steps) * 1.3;
            // Plaster, not brick. A brick web behind grey brick ribs was a barrel of
            // brown planks; pale webs between darker ribs is what a vault looks like,
            // and it lifts the whole upper half of a room that has two candles in it.
            batch.add(
              ctx.materials.get('surface.plaster'),
              boxGeometry(seg, 0.16, cellSize / rings + 0.02),
              tiltMatrix([x, y, z], [0, 0, a - Math.PI / 2]),
              { tile: tex.PLASTER_TILE * 0.6, ...CEILING_OPTS },
            );
          }
        }
        // The transverse ribs standing proud of it, every third ring.
        for (const t of [0.2, 0.8]) {
          const z = cz - cellSize / 2 + cellSize * t;
          for (let i = 0; i < steps; i++) {
            const a = Math.PI * ((i + 0.5) / steps);
            const x = cx - Math.cos(a) * (R + 0.02);
            const y = spring + Math.sin(a) * (ceilingHeight - spring - 0.1);
            batch.add(stoneMat, boxGeometry(((Math.PI * R) / steps) * 1.3, 0.2, 0.26), tiltMatrix([x, y, z], [0, 0, a - Math.PI / 2]), {
              tile: 0.4,
              ...CEILING_OPTS,
            });
          }
        }
        break;
      }
      case 'ribs': {
        // Transverse stone arches with nothing between them but the ceiling
        // slab. The cheapest way to make a corridor feel like a crypt.
        const spring = ceilingHeight - 0.95;
        const R = cellSize / 2 - wallThickness;
        // Two arches, not three, and a 16 x 22 cm section in the PALE stone rather
        // than a 22 x 30 in the mid one: at the old size three of them crossed every
        // view as a lattice of black beams, because a rib two metres above the only
        // lamp in the room catches nothing.
        for (const t of [0.26, 0.74]) {
          const z = cz - cellSize / 2 + cellSize * t;
          const steps = 10;
          for (let i = 0; i < steps; i++) {
            const a = Math.PI * ((i + 0.5) / steps);
            const x = cx - Math.cos(a) * R;
            const y = spring + Math.sin(a) * (ceilingHeight - spring - 0.12);
            batch.add(stonePale, boxGeometry(((Math.PI * R) / steps) * 1.3, 0.16, 0.22), tiltMatrix([x, y, z], [0, 0, a - Math.PI / 2]), {
              tile: 0.5,
              ...CEILING_OPTS,
            });
          }
          for (const s of [-1, 1]) {
            batch.add(stonePale, new THREE.ConeGeometry(0.18, 0.4, 6), tiltMatrix([cx + s * (R - 0.05), spring - 0.16, z], [Math.PI, 0, 0]), {
              tile: 0.3,
              ...CEILING_OPTS,
              consume: true,
            });
          }
        }
        break;
      }
      case 'beams': {
        // Oak joists on stone corbels, with the boards over them and one of the
        // joists sprung out of its seat. Every board is 0.3 m, so the ceiling
        // has a grain and reads as timber rather than as a lid.
        for (let i = 0; i < 5; i++) {
          const z = cz - cellSize / 2 + cellSize * ((i + 0.5) / 5);
          const sag = i === 2 ? -0.06 : 0;
          batch.add(timberMat, boxGeometry(cellSize, 0.24, 0.2), tiltMatrix([cx, ceilingHeight - 0.16 + sag, z], [0, 0, i === 2 ? 0.012 : 0]), {
            tile: tex.TIMBER_TILE,
            ...CEILING_OPTS,
          });
          for (const s of [-1, 1]) {
            batch.add(stonePale, boxGeometry(0.36, 0.16, 0.28), poseMatrix([cx + s * (cellSize / 2 - 0.3), ceilingHeight - 0.3, z]), {
              tile: 0.3,
              ...CEILING_OPTS,
            });
          }
        }
        for (let i = 0; i < 13; i++) {
          batch.add(ctx.materials.get('timberDark'), boxGeometry(cellSize, 0.05, cellSize / 13), poseMatrix([cx, ceilingHeight - 0.03, cz - cellSize / 2 + (cellSize * (i + 0.5)) / 13]), {
            tile: 0.6,
            ...CEILING_OPTS,
          });
        }
        break;
      }
      case 'corbel': {
        // The dynastic ceiling: courses stepping in from both sides until they
        // nearly meet, with one enormous slab bridging the gap. No arch, because
        // they never built one.
        const courses = 3;
        for (let c = 0; c < courses; c++) {
          const inset = 0.15 + c * 0.62;
          const y = ceilingHeight - 0.16 - c * 0.28;
          for (const s of [-1, 1]) {
            batch.add(ctx.materials.get('surface.sandstone'), boxGeometry(cellSize, 0.28, cellSize / 2 - inset), poseMatrix([cx, y, cz + s * (cellSize / 4 + inset / 2)]), {
              tile: tex.SANDSTONE_TILE * 0.7,
              ...CEILING_OPTS,
            });
            // The arris of each course, catching whatever light is below it.
            batch.add(stonePale, boxGeometry(cellSize, 0.05, 0.09), poseMatrix([cx, y - 0.14, cz + s * (inset + 0.04)]), {
              tile: 0.4,
              ...CEILING_OPTS,
            });
          }
        }
        batch.add(ctx.materials.get('surface.sandstone'), boxGeometry(cellSize, 0.3, 1.3), poseMatrix([cx, ceilingHeight - 0.98, cz]), {
          tile: tex.SANDSTONE_TILE * 0.6,
          ...CEILING_OPTS,
        });
        break;
      }
      case 'slabs': {
        // Three roofing beams the size of a wall, with a hand's breadth of black
        // between them. Nothing says "a mountain is standing on this" faster.
        // 30 cm deep and hung 15 cm off the ceiling, not 44 and 22: at the old depth
        // the three beams came down to 2.94 m and the room had a black lid on it.
        for (let i = 0; i < 3; i++) {
          const z = cz - cellSize / 2 + cellSize * ((i + 0.5) / 3);
          batch.add(ctx.materials.get('surface.sandstone'), boxGeometry(cellSize, 0.3, cellSize / 3 - 0.1), poseMatrix([cx, ceilingHeight - 0.15, z]), {
            tile: tex.SANDSTONE_TILE * 0.8,
            ...CEILING_OPTS,
          });
          batch.add(stonePale, boxGeometry(cellSize, 0.05, cellSize / 3 - 0.02), poseMatrix([cx, ceilingHeight - 0.32, z]), {
            tile: 0.5,
            ...CEILING_OPTS,
          });
        }
        // A crack across one of them, propped from below in a hurry.
        batch.add(stoneDark, boxGeometry(cellSize, 0.06, 0.07), tiltMatrix([cx, ceilingHeight - 0.32, cz + 0.6], [0, 0.06, 0]), { tile: 0.3, ...CEILING_OPTS });
        break;
      }
      case 'roots': {
        // Roots have come through the vault and are holding the stone up as much
        // as breaking it. Two big runs and a mat of small ones, plus what grows
        // on the underside of a root in the dark.
        for (let i = 0; i < 3; i++) {
          const z = cz - cellSize / 2 + cellSize * ((i + 0.7) / 3.4);
          const r0 = 0.16 - i * 0.03;
          batch.add(rootMat, new THREE.CylinderGeometry(r0, r0 * 0.7, cellSize + 0.4, 7), tiltMatrix([cx, ceilingHeight - 0.28 - (i % 2) * 0.12, z], [0, 0.12 * (i - 1), Math.PI / 2]), {
            tile: 0.6,
            ...CEILING_OPTS,
            consume: true,
          });
          for (let b = 0; b < 4; b++) {
            const x = cx - cellSize / 2 + cellSize * ((b + 0.5) / 4);
            const len = 0.3 + ((i * 3 + b) % 4) * 0.16;
            batch.add(rootMat, new THREE.CylinderGeometry(0.025, 0.05, len, 6), tiltMatrix([x, ceilingHeight - 0.3 - len / 2, z], [((i + b) % 3) * 0.12, 0, ((b % 2) * 2 - 1) * 0.2]), {
              tile: 0.3,
              ...CEILING_OPTS,
              consume: true,
            });
            if ((i + b) % 3 === 0) {
              batch.add(ctx.materials.get('capPale'), new THREE.SphereGeometry(0.07, 6, 5), tiltMatrix([x, ceilingHeight - 0.34 - len, z], [0, b, 0], [1.5, 0.5, 1.5]), {
                ...CEILING_OPTS,
                consume: true,
              });
            }
          }
        }
        break;
      }
      case 'cave': {
        /**
         * The roof of a cave: lumps of rock, and stalactites hanging out of the
         * seams between them.
         *
         * The stalactites are the whole read, and what makes them read is that they
         * come in three lengths and hang in LINES rather than in a scatter - a
         * dripline follows a crack, and a crack is straight-ish. An even sprinkle of
         * identical cones is a spiked ceiling from a platform game.
         */
        for (let i = 0; i < 7; i++) {
          const ax = cx - cellSize / 2 + cellSize * ((((i * 5) % 7) + 0.5) / 7);
          const az = cz - cellSize / 2 + cellSize * ((((i * 3) % 7) + 0.5) / 7);
          const size = 0.62 + ((i * 37) % 11) / 12;
          batch.add(caveMat, new THREE.SphereGeometry(size, 6, 5), tiltMatrix([ax, ceilingHeight + size * 0.5, az], [0, i, 0], [1.4, 0.7, 1.3]), {
            tile: 1.4,
            ...CEILING_OPTS,
            consume: true,
          });
        }
        /**
         * Two driplines, each a run of cones of falling length along one crack.
         *
         * Three lines of five in pale flowstone read as a grid of spikes on a
         * ceiling: too many, too regular and much too bright. Two lines, mostly in
         * the rock's own colour, with one wet pale one per line, and the lengths
         * varying by a factor of four.
         */
        for (let line = 0; line < 2; line++) {
          const t = 0.3 + line * 0.36;
          const along = line % 2 === 0;
          const drips = 4;
          for (let i = 0; i < drips; i++) {
            const f = (i + 0.5) / drips;
            const ax = cx + (along ? (f - 0.5) * (cellSize - 1.6) : (t - 0.5) * (cellSize - 1.8));
            const az = cz + (along ? (t - 0.5) * (cellSize - 1.8) : (f - 0.5) * (cellSize - 1.6));
            const len = 0.2 + ((i * 5 + line * 3) % 4) * 0.3;
            batch.add(i === 1 ? flowMat : caveMat, new THREE.ConeGeometry(0.07 + len * 0.1, len, 6), poseMatrix([ax, ceilingHeight - len / 2, az]), {
              tile: 0.4,
              ...CEILING_OPTS,
              consume: true,
            });
            // A wet bead on the tip of the longest ones, which is where the water is.
            if (len > 0.6) {
              batch.add(ctx.materials.get('water'), new THREE.SphereGeometry(0.035, 5, 4), poseMatrix([ax, ceilingHeight - len - 0.03, az]), {
                ...CEILING_OPTS,
                consume: true,
              });
            }
          }
        }
        break;
      }
      case 'turf': {
        /**
         * The underside of a mound: rafters of split oak with the turf pressing
         * down between them, and the rafters sagging where it has won.
         */
        for (let i = 0; i < 6; i++) {
          const z = cz - cellSize / 2 + cellSize * ((i + 0.5) / 6);
          const sag = i === 2 || i === 4 ? -0.08 : 0;
          batch.add(timberMat, boxGeometry(cellSize, 0.2, 0.26), tiltMatrix([cx, ceilingHeight - 0.14 + sag, z], [0, 0, i === 2 ? 0.014 : 0]), {
            tile: tex.TIMBER_TILE,
            ...CEILING_OPTS,
          });
        }
        // The earth bulging between two of them, and roots coming through it.
        for (const [z, r] of [
          [cz - cellSize * 0.18, 0.5],
          [cz + cellSize * 0.28, 0.42],
        ] as const) {
          batch.add(ctx.materials.get('surface.turf'), new THREE.SphereGeometry(r, 7, 5), tiltMatrix([cx + 0.6, ceilingHeight - 0.1, z], [0, 0.4, 0], [2.6, 0.5, 1.2]), {
            tile: tex.TURF_TILE,
            ...CEILING_OPTS,
            consume: true,
          });
        }
        for (let i = 0; i < 5; i++) {
          const ax = cx - cellSize / 2 + cellSize * ((((i * 3) % 5) + 0.5) / 5);
          const az = cz - cellSize / 2 + cellSize * ((((i * 5) % 5) + 0.5) / 5);
          const len = 0.3 + ((i * 41) % 7) / 9;
          batch.add(rootMat, new THREE.CylinderGeometry(0.02, 0.05, len, 5), tiltMatrix([ax, ceilingHeight - 0.24 - len / 2, az], [(i % 3) * 0.1, i, 0.1]), {
            tile: 0.3,
            ...CEILING_OPTS,
            consume: true,
          });
        }
        break;
      }
      case 'rock': {
        // Living rock, where the crypt has been cut into the hill rather than
        // built. Lumps, and a few things pointing down.
        for (let i = 0; i < 9; i++) {
          const ax = cx - cellSize / 2 + cellSize * ((((i * 5) % 9) + 0.5) / 9);
          const az = cz - cellSize / 2 + cellSize * ((((i * 7) % 9) + 0.5) / 9);
          const size = 0.5 + ((i * 37) % 11) / 16;
          batch.add(stoneDark, new THREE.SphereGeometry(size, 7, 5), tiltMatrix([ax, ceilingHeight + size * 0.42, az], [0, i, 0], [1.3, 0.8, 1.2]), {
            tile: 1.2,
            ...CEILING_OPTS,
            consume: true,
          });
        }
        break;
      }
      case 'stars':
      default: {
        // The painted ceiling is the slab itself; what it needs is a border to
        // read as painted rather than as the colour of the stone, and a boss or
        // two so it is not a flat field.
        for (const t of [-0.5, 0.5]) {
          batch.add(ctx.materials.get('goldDim'), boxGeometry(cellSize, 0.05, 0.14), poseMatrix([cx, ceilingHeight - 0.04, cz + t * (cellSize - 0.6)]), { tile: 0.4, ...CEILING_OPTS });
          batch.add(ctx.materials.get('goldDim'), boxGeometry(0.14, 0.05, cellSize), poseMatrix([cx + t * (cellSize - 0.6), ceilingHeight - 0.04, cz]), { tile: 0.4, ...CEILING_OPTS });
        }
        batch.add(stoneDark, boxGeometry(cellSize, 0.06, 0.3), poseMatrix([cx, ceilingHeight - 0.05, cz]), { tile: 0.5, ...CEILING_OPTS });
        break;
      }
    }

    for (const side of SIDES) {
      const step = NEIGHBOUR[side];
      if (occupied.has(`${gx + step[0]},${gy + step[1]}`)) continue; // interior edge: open

      const hasDoor = (ctx.doors[doorKey([gx, gy], side)] ?? 'none') !== 'none';
      const niche = hasDoor ? undefined : nicheFor([gx, gy], side);

      let opening: { width: number; y0: number; y1: number } | null = null;
      if (hasDoor) opening = { width: doorWidth, y0: 0, y1: doorHeight };
      else if (niche) {
        const kind = niche.kind ?? 'loculus';
        if (kind === 'loculus') opening = { width: 2.1, y0: 0.5, y1: 2.15 };
        else if (kind === 'urns') opening = { width: 1.7, y0: 0.85, y1: 2.2 };
        else if (kind === 'effigy') opening = { width: 1.3, y0: 0.0, y1: 2.45 };
        else if (kind === 'grate') opening = { width: 1.5, y0: 0.55, y1: 2.0 };
        else if (kind === 'lancet') opening = { width: 0.95, y0: 1.45, y1: ceilingHeight - 0.42 };
        else if (kind === 'ossuary') opening = { width: 2.4, y0: 0.42, y1: 2.25 };
        else if (kind === 'breach') opening = { width: 1.9, y0: 0.0, y1: 2.1 };
        else if (kind === 'crevice') opening = { width: 1.3, y0: 0.45, y1: 2.15 };
        else opening = null; // a stela hangs on an unbroken wall
      }

      const slabs = slabsFor(cellSize, ceilingHeight, opening);
      for (const slab of slabs) wallSlab(side, cx, cz, slab, niche === undefined);
      wallTrim(side, cx, cz, slabs);

      /**
       * A niche is a hole in the LOOK of a wall and never a hole in the wall.
       *
       * `slabsFor` cuts the masonry either side of the opening and leaves a sill
       * under it - but an `effigy` or a `breach` opens at floor level, so there is
       * no sill, and the wall it was cut in stops stopping anybody. The recess
       * behind it is a picture: its back is a plane, so a player who walked in
       * would walk straight out of the room. One collider across the whole run
       * fixes every kind at once, and nothing in a niche was ever walkable.
       */
      if (niche) blockWall(side, cx, cz);

      if (hasDoor && opening) mouth(side, cx, cz, opening);
      if (niche) {
        buildNiche(
          niche,
          side,
          cx,
          cz,
          opening ?? { width: 1.3, y0: 0.35, y1: 2.3 },
        );
      }
    }
  }

  return { colliders, lights, extra, nicheAnchors };
}

/**
 * The contract-facing kit. Crypt rooms call `addShell()` directly so they can
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
