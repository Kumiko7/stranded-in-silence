import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { barrel, candleCluster, cobwebs, debris, flicker, pendantLamp } from '../kit/props';

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

/** A rack of bottle cells, most of them still full. */
function wineRack(room: Room, x: number, z: number, width: number, rotationY: number): void {
  const height = 2.4;
  room.solid('woodDark', [width, height, 0.5], [x, 0, z], rotationY, { tile: 1.4 });

  const cols = Math.floor(width / 0.34);
  for (let r = 0; r < 6; r++) {
    const y = 0.22 + r * 0.36;
    room.box('woodPale', [width - 0.06, 0.03, 0.44], [x, y, z], rotationY);
    for (let c = 0; c < cols; c++) {
      if (room.chance(0.24)) continue;
      const s = -width / 2 + 0.17 + c * 0.34;
      const px = x + Math.cos(rotationY) * s;
      const pz = z - Math.sin(rotationY) * s;
      room.geo(
        room.chance(0.35) ? 'bookGreen' : 'glass',
        new THREE.CylinderGeometry(0.05, 0.05, 0.34, 8),
        tiltMatrix([px, y + 0.08, pz], [Math.PI / 2, rotationY, 0]),
        { consume: true },
      );
      room.geo('wax', new THREE.CylinderGeometry(0.026, 0.026, 0.12, 6), tiltMatrix([px - Math.sin(rotationY) * 0.22, y + 0.08, pz - Math.cos(rotationY) * 0.22], [Math.PI / 2, rotationY, 0]), {
        consume: true,
      });
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
    room.geo('glass', new THREE.CylinderGeometry(0.045, 0.06, 0.16, 8), poseMatrix([-2.0 + i * 0.3, 0.94, 2.5 + room.range(-0.2, 0.2)]), {
      consume: true,
    });
  }

  barrel(room, 1.4, 0, 3.1, Math.PI / 2, 1.0);

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
