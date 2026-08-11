import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { MeshBatcher, poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { bioMotes, bob, cageLamp, causticPatch, debris, jelly as jellyBody, quad, shelf, stripLight, swell, tankColumn } from '../kit/props';

/**
 * The Drift - two columns of jellyfish, and nothing else.
 *
 * A display room: two floor-to-ceiling acrylic cylinders down the east side,
 * each holding a slow violet cloud, and a rack of specimen tubes either side of
 * the viewing pane opposite them. The tanks are almost the only light and they
 * are all one colour, which makes every silhouette in the room read as a
 * cut-out - including yours, from the doorway, to anybody already inside.
 *
 * Two, not three. A tank is 1.6 m across with its collider and the east
 * hatchway's lane is 1.2 m wide, so the middle of that wall has to stay empty:
 * the third cylinder would have been a door nobody can use.
 *
 * One jelly in the fore tank actually moves, and it takes fourteen seconds to
 * cross it.
 */
export const jelly: RoomBlueprint = {
  id: 'abyss.jelly',
  nameKey: 'room.abyss.jelly',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'south', 'east'),
  weight: 9,
  tags: ['abyss', 'aquarium', 'lit'],
  anchors: {
    // On the fore and aft plate, not the west wall: the west wall is three
    // courses of specimen racking from 1.25 m up, and a 2 m locker would go
    // straight through it.
    chest: [{ position: [-2.4, 0, -3.2], rotationY: Math.PI }],
    locker: [{ position: [-2.4, 0, 3.25], rotationY: 0 }],
    itemSpawn: [
      { position: [-3.42, 1.31, -2.6] },
      { position: [-3.42, 1.84, 2.6] },
      { position: [0.4, 0, 2.9] },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [-1.9, 0, -2.0] },
      { position: [1.0, 0, 2.4] },
    ],
    enemySpawn: [{ position: [-3.25, 0, -1.9] }],
  },
  build,
};

/** Shelf courses on the west wall, either side of the pane. */
const COURSES = [1.25, 1.78, 2.31];

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, jelly);
  room.shell({
    floor: 'concrete',
    wall: 'paint',
    ceiling: 'beams',
    band: 'algae',
    bandHeight: 0.7,
    strip: 'cyan',
    mouth: 'collar',
    ports: [{ side: 'west', kind: 'viewpane', scene: 'swarm' }],
  });

  /* --- the columns ------------------------------------------------------------------ */
  // Both down the east side, well clear of the hatchway lane between them, and
  // only the fore one lit: two tanks at full brightness would flatten the room.
  tankColumn(room, 2.5, -2.6, 0.78, 3.0, true, 'jelly', 12);
  tankColumn(room, 2.5, 2.6, 0.72, 2.8, false, 'jelly');

  /**
   * One jelly is not batched, so it can drift. It lives in the middle tank and
   * crosses it slowly - a room of perfectly still jellyfish reads as a museum
   * diorama, and one moving body is enough to fix that. Both geometries are
   * handed to `room.own()`, because nothing outside the batcher frees itself.
   */
  const bell = new THREE.SphereGeometry(0.22, 14, 9);
  const skirt = new THREE.PlaneGeometry(0.09, 0.72);
  const swim = new MeshBatcher();
  swim.add(room.mat('jellyBell'), bell, tiltMatrix([0, 0, 0], [0, 0, 0], [1, 0.78, 1]), { castShadow: false });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    swim.add(room.mat('jellyTrail'), skirt, tiltMatrix([Math.cos(a) * 0.14, -0.42, Math.sin(a) * 0.14], [0, a, room.range(-0.15, 0.15)]), {
      castShadow: false,
      receiveShadow: false,
    });
  }
  bell.dispose();
  skirt.dispose();
  // Batched separately from the room, for the same reason as the kelp: a merged
  // mesh cannot be animated, but seven loose ones are seven draw calls.
  const swimmer = swim.build();
  swimmer.object.position.set(2.5, 1.7, -2.6);
  room.loose(swimmer.object);
  room.own(swimmer);
  bob(room, swimmer.object, 0.55, 0.22);

  /* --- the specimen racking ------------------------------------------------------------ */
  /**
   * Two runs on the west wall, one either side of the pane, which is 2.8 m wide
   * and centred - so nothing goes between z = -1.4 and z = 1.4. `along` on a
   * west wall runs +z, which is why these read straight off the anchors.
   */
  for (const y of COURSES) {
    for (const along of [-2.6, 2.6]) {
      shelf(room, 'west', along, y, 1.7, 0.32);
      for (let i = 0; i < 4; i++) {
        const z = along - 0.63 + i * 0.42;
        if (Math.abs(y - 1.25) < 0.1 && Math.abs(z + 2.6) < 0.25) continue; // an item anchor's slot
        if (Math.abs(y - 1.78) < 0.1 && Math.abs(z - 2.6) < 0.25) continue;
        const h = room.range(0.24, 0.4);
        room.geo('tankGlow', new THREE.CylinderGeometry(0.055, 0.055, h * 0.84, 10), poseMatrix([-3.44, y + 0.06 + h * 0.42, z]), {
          castShadow: false,
          consume: true,
        });
        jellyBody(room, -3.44, y + 0.06 + h * 0.52, z, 0.04);
        room.geo('glassPane', new THREE.CylinderGeometry(0.068, 0.068, h, 10, 1, true), poseMatrix([-3.44, y + 0.06 + h / 2, z]), {
          castShadow: false,
          receiveShadow: false,
          consume: true,
        });
        room.geo('steelPale', new THREE.CylinderGeometry(0.072, 0.068, 0.03, 10), poseMatrix([-3.44, y + 0.06 + h, z]), {
          tile: 0.2,
          castShadow: false,
          consume: true,
        });
      }
      // A label plate under the course. Unreadable by design: art has no access
      // to `t()`, so nothing in a room may carry real words.
      room.geo('steelDark', quad(0.34, 0.07), poseMatrix([-3.66, y - 0.06, along], Math.PI / 2), {
        castShadow: false,
        receiveShadow: false,
      });
    }
  }

  /* --- the room ----------------------------------------------------------------------- */
  causticPatch(room, 1.2, -2.4, 1.6);
  causticPatch(room, 1.2, 2.4, 1.1);
  causticPatch(room, -1.9, 0.4, 1.3);
  bioMotes(room, 0.6, 1.5, 0.2, 2.2, 20);
  bioMotes(room, -2.2, 1.8, -1.6, 1.2, 10);
  debris(room, -0.6, -1.4, 0.9, 7);
  debris(room, 1.4, 3.1, 0.8, 6);

  // A dead ceiling strip, and one cold caged lamp by the aft hatch so the way
  // out is findable with three tanks between you and it.
  stripLight(room, 0, 0, 3.0, Math.PI / 2, false, true);
  cageLamp(room, 'south', -2.9, 2.2, true, true, 6);
  const tank = room.lights[0];
  if (tank) swell(room, tank, 12, 0.16, 0.34);

  return room.finish();
}
