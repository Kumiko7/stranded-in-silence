import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { barrel, candleCluster, cobwebs, cyl, debris, flicker, pendantLamp } from '../kit/props';

/**
 * The Wine Cellar - eleven hundred bottles and somebody drank the good ones.
 *
 * Brick vaults and floor-to-ceiling racks that turn the room into three narrow
 * aisles. You can hear someone in the next aisle and never see them, which is
 * the best and worst thing about it.
 */
export const cellar: RoomBlueprint = {
  id: 'mansion.cellar',
  nameKey: 'room.mansion.cellar',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 9,
  tags: ['cluttered', 'cold'],
  anchors: {
    chest: [{ position: [2.6, 0, 3.15], rotationY: 0 }],
    locker: [{ position: [3.25, 0, 1.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.4, 0.94, 2.6] },
      { position: [-2.4, 1.3, -3.4] },
      { position: [2.4, 1.3, -3.4] },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [-1.6, 0, -2.0] },
      { position: [1.6, 0, 2.0] },
    ],
    enemySpawn: [{ position: [2.6, 0, -2.4] }],
  },
  build,
};

/**
 * A rack of bottle cells, most of them still full.
 *
 * The carcass is one solid slab with the shelves and bottles drawn on the front
 * of it, which from a doorway read as a dark board with a grid of dots punched
 * in it. What makes a rack read as a rack is the **cell** - so there are
 * vertical dividers between the columns now, and the shelf boards are pale, and
 * the two together give the eye the lattice it was looking for.
 */
function wineRack(room: Room, x: number, z: number, width: number, rotationY: number): void {
  const height = 2.4;
  room.solid('woodDark', [width, height, 0.5], [x, 0, z], rotationY, { tile: 1.4 });

  const cols = Math.floor(width / 0.34);
  const at = (s: number, d: number): [number, number] => [
    x + Math.cos(rotationY) * s - Math.sin(rotationY) * d,
    z - Math.sin(rotationY) * s - Math.cos(rotationY) * d,
  ];
  // Uprights: one per cell boundary, standing proud of the carcass.
  for (let c = 0; c <= cols; c++) {
    const s = -width / 2 + 0.06 + (c * (width - 0.12)) / cols;
    const [px, pz] = at(s, 0.13);
    room.box('woodPale', [0.05, height - 0.16, 0.24], [px, 0.14, pz], rotationY, { tile: 0.8 });
  }
  for (let r = 0; r < 6; r++) {
    const y = 0.22 + r * 0.36;
    room.box('woodPale', [width - 0.06, 0.03, 0.44], [x, y, z], rotationY);
    for (let c = 0; c < cols; c++) {
      // A rack this full is a rack nobody has drunk from. Two in five cells
      // empty reads as a cellar in use, and this room places eight racks.
      if (room.chance(0.4)) continue;
      const s = -width / 2 + 0.17 + c * 0.34;
      const px = x + Math.cos(rotationY) * s;
      const pz = z - Math.sin(rotationY) * s;
      room.geo(
        room.chance(0.35) ? 'bookGreen' : 'glass',
        cyl(0.05, 0.05, 0.34, 8),
        tiltMatrix([px, y + 0.08, pz], [Math.PI / 2, rotationY, 0]),
        {},
      );
      // The foil capsule, on about half of them. A rack where every neck is
      // wrapped is a shop shelf, and the capsule is a third of a bottle's cost.
      if (room.chance(0.5)) {
        room.geo('wax', cyl(0.026, 0.026, 0.12, 6), tiltMatrix([px - Math.sin(rotationY) * 0.22, y + 0.08, pz - Math.cos(rotationY) * 0.22], [Math.PI / 2, rotationY, 0]), {
        });
      }
    }
  }
}

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, cellar);
  room.shell({ floor: 'stone', wall: 'brick', ceiling: 'ribs', cornice: false, skirting: false });

  // Two aisles: racks across the north half, back to back down the middle.
  wineRack(room, -2.4, -3.4, 2.2, 0);
  wineRack(room, 2.4, -3.4, 2.2, 0);
  wineRack(room, -3.4, -2.4, 2.0, -Math.PI / 2);
  wineRack(room, 3.4, -2.4, 2.0, Math.PI / 2);

  // A tasting table made of a plank on two barrels, back against the south wall.
  barrel(room, -3.0, 0, 2.6, 0);
  barrel(room, -1.8, 0, 2.6, 0);
  room.box('woodPale', [2.6, 0.08, 0.9], [-2.4, 0.86, 2.6], 0.03, { tile: 1.4 });
  candleCluster(room, [-2.9, 0.94, 2.6]);
  for (let i = 0; i < 3; i++) {
    room.geo('glass', cyl(0.045, 0.06, 0.16, 8), poseMatrix([-2.0 + i * 0.3, 0.94, 2.5 + room.range(-0.2, 0.2)]), {
    });
  }

  barrel(room, 1.4, 0, 3.1, Math.PI / 2, 1.0);

  /*
   * The cellar's dressing is almost entirely **collider-free**, and that is a
   * decision rather than laziness.
   *
   * From three of its four doorways this room read as an empty brick box: the
   * racks are all flat against the walls of the north half and everything else
   * was a plank on two barrels. But it offers all four walls, so both lanes have
   * to stay walkable, and its four anchors take the four corners the checklist
   * says a container needs - there is nowhere left that a solid prop may stand.
   * So the detail goes on the walls and flat on the floor instead, where it
   * costs nothing a player can walk into. `validate:art` caught the first
   * version of this in eight separate ways.
   */

  // Racking hooks and a chalked tally board, at head height where they read.
  for (const [hx, hz, rot] of [
    [-3.5, 1.5, Math.PI / 2],
    [3.5, 2.6, -Math.PI / 2],
    [-3.5, -0.4, Math.PI / 2],
  ] as const) {
    room.box('woodDark', [0.9, 0.05, 0.14], [hx, 1.85, hz], rot, { tile: 0.8 });
    for (let i = 0; i < 3; i++) {
      room.geo('iron', new THREE.TorusGeometry(0.045, 0.01, 4, 8), tiltMatrix([hx, 1.79, hz - 0.3 + i * 0.3], [0, rot, 0]), {
        consume: true,
      });
    }
  }
  room.box('ash', [0.9, 0.62, 0.03], [2.2, 1.5, -3.52], 0, { tile: 0.8 });
  for (let i = 0; i < 9; i++) {
    room.geo(
      'linen',
      new THREE.BoxGeometry(0.015, 0.11, 0.006),
      poseMatrix([1.85 + (i % 5) * 0.09 + Math.floor(i / 5) * 0.02, 1.68 - Math.floor(i / 5) * 0.22, -3.5]),
      { consume: true },
    );
  }

  // Bottles binned flat against the skirting, where a cellar actually stacks the
  // ones that came off a broken rack. Nothing here places a collider.
  for (const [bx, bz, rot, count] of [
    [-1.9, -3.3, 0, 7],
    [3.3, -0.9, Math.PI / 2, 6],
  ] as const) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < count - r; c++) {
        const s = -((count - r - 1) * 0.115) / 2 + c * 0.115;
        room.geo(
          room.chance(0.35) ? 'bookGreen' : 'glass',
          cyl(0.05, 0.05, 0.3, 7),
          tiltMatrix([bx + Math.cos(rot) * s, 0.055 + r * 0.098, bz - Math.sin(rot) * s], [Math.PI / 2, rot, 0]),
          {},
        );
      }
    }
  }

  // A dropped crate and the straw out of it, flat on the flags.
  room.box('woodPale', [0.66, 0.34, 0.5], [-2.9, 0, -1.9], 0.35, { tile: 0.9 });
  room.box('woodPale', [0.52, 0.04, 0.42], [-2.55, 0.02, -1.4], -0.5, { tile: 0.9 });
  for (let i = 0; i < 14; i++) {
    room.geo(
      'deadLeaf',
      new THREE.BoxGeometry(room.range(0.1, 0.24), 0.006, 0.014),
      poseMatrix([-2.7 + room.range(-0.7, 0.7), 0.008, -1.7 + room.range(-0.6, 0.6)], room.range(0, Math.PI)),
      { consume: true },
    );
  }

  // Broken glass and a long-dried spill.
  for (let i = 0; i < 16; i++) {
    room.geo(
      'glass',
      new THREE.PlaneGeometry(room.range(0.05, 0.14), room.range(0.05, 0.14)),
      tiltMatrix([room.range(-2.4, 2.4), 0.012, room.range(-1.2, 1.8)], [-Math.PI / 2, room.range(0, Math.PI), 0]),
      { castShadow: false, consume: true },
    );
  }

  pendantLamp(room, 0, 0.4, true);
  const lantern = new THREE.PointLight(0xffb265, 7, 6, 2);
  lantern.position.set(-2.9, 1.1, 2.6);
  room.light(lantern);
  flicker(room, lantern, 7, 0.3, 6);

  debris(room, 0.4, -1.0, 1.6, 9);
  cobwebs(room, -3.2, 3.2, 5.5, 1.4);
  cobwebs(room, 3.2, 3.2, 3.9, 1.2);

  return room.finish();
}
