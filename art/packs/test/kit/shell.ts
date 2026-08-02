/**
 * Test pack shell: floor, ceiling and walls for a footprint, with openings cut
 * wherever the generator placed a door.
 *
 * This is the single most reused piece of a pack. Because every room calls it
 * first, door openings always line up between neighbours no matter who authored
 * the rooms on either side.
 */
import * as THREE from 'three';
import type { BuiltPiece, Cell, PackKit, RoomBuildContext, Side } from '../../../lib/contract';
import { SIDES, doorKey } from '../../../lib/contract';
import { box, boxCollider } from '../../../lib/build';

/** One horizontal run of wall: a slice of the full wall length, at some height band. */
interface Segment {
  offset: number;
  width: number;
  yBase: number;
  height: number;
}

const NEIGHBOUR: Record<Side, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

function segmentsFor(length: number, hasOpening: boolean, dims: RoomBuildContext['dims']): Segment[] {
  const height = dims.ceilingHeight;
  if (!hasOpening) return [{ offset: 0, width: length, yBase: 0, height }];

  const dw = dims.doorWidth;
  const dh = dims.doorHeight;
  const side = (length - dw) / 2;
  return [
    { offset: -(length + dw) / 4, width: side, yBase: 0, height },
    { offset: (length + dw) / 4, width: side, yBase: 0, height },
    { offset: 0, width: dw, yBase: dh, height: height - dh },
  ];
}

export function createKit(): PackKit {
  return {
    shell(ctx: RoomBuildContext, footprint: readonly Cell[]): BuiltPiece {
      const { cellSize, ceilingHeight, wallThickness } = ctx.dims;
      const object = new THREE.Group();
      const colliders = [];
      const lights: THREE.Light[] = [];

      const occupied = new Set(footprint.map(([x, y]) => `${x},${y}`));
      const floorMat = ctx.materials.get('floor');
      const ceilMat = ctx.materials.get('ceiling');
      const wallMat = ctx.materials.get('wall');
      const off = cellSize / 2 - wallThickness / 2;

      for (const [gx, gy] of footprint) {
        const cx = gx * cellSize;
        const cz = gy * cellSize;

        object.add(box(floorMat, [cellSize, 0.1, cellSize], [cx, -0.1, cz]));
        object.add(box(ceilMat, [cellSize, 0.1, cellSize], [cx, ceilingHeight, cz]));

        for (const side of SIDES) {
          const step = NEIGHBOUR[side];
          if (occupied.has(`${gx + step[0]},${gy + step[1]}`)) continue; // interior edge

          const state = ctx.doors[doorKey([gx, gy], side)] ?? 'none';
          const runsAlongX = side === 'north' || side === 'south';

          for (const seg of segmentsFor(cellSize, state !== 'none', ctx.dims)) {
            const size: [number, number, number] = runsAlongX
              ? [seg.width, seg.height, wallThickness]
              : [wallThickness, seg.height, seg.width];
            const position: [number, number, number] = runsAlongX
              ? [cx + seg.offset, seg.yBase, cz + (side === 'north' ? -off : off)]
              : [cx + (side === 'west' ? -off : off), seg.yBase, cz + seg.offset];

            object.add(box(wallMat, size, position));
            // Only floor-level segments block movement; a lintel is walked under.
            if (seg.yBase === 0) colliders.push(boxCollider(size, position));
          }
        }
      }

      // Every room lights itself - there is no player flashlight.
      if (ctx.lightBudget > 0) {
        const [lx, lz] = [footprint[0]![0] * cellSize, footprint[0]![1] * cellSize];
        object.add(box(ctx.materials.get('lampHousing'), [0.5, 0.12, 0.5], [lx, ceilingHeight - 0.12, lz]));
        object.add(box(ctx.materials.get('lampGlow'), [0.34, 0.04, 0.34], [lx, ceilingHeight - 0.16, lz]));

        // Candela. A room lamp has to carry the whole room - there is no flashlight.
        const lamp = new THREE.PointLight(0xffdca8, 17, cellSize * 2.2, 2);
        lamp.position.set(lx, ceilingHeight - 0.3, lz);
        object.add(lamp);
        lights.push(lamp);
      }

      return { object, colliders, lights };
    },
  };
}
