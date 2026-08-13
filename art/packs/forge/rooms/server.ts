import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { MeshBatcher, poseMatrix, tiltMatrix } from '../../../lib/merge';
import { boxGeometry } from '../../../lib/build';
import { Room, wallsFor } from './common';
import {
  alarmBeacon,
  battenLight,
  controlDesk,
  cyl,
  debris,
  glowPool,
  monitorBank,
  motes,
  quad,
  rackCabinet,
  spin,
  strut,
  wallSign,
} from '../kit/props';

/**
 * The Choir - a rack hall that is still running, in a facility where nothing
 * else is.
 *
 * A row of cabinets backed against the south wall with a slot in the middle you
 * can walk into and stand in, and about seven hundred status lights in the dark.
 * No lamp is doing that work: the green comes off four narrow emissive strips a
 * rack, which is what stops a wall of LEDs costing a wall of draw calls.
 *
 * Cable comes out of the back of every cabinet, climbs the wall and disappears
 * into the ceiling, and there is a great deal more of it than a hall this size
 * should need.
 */
export const server: RoomBlueprint = {
  id: 'forge.server',
  nameKey: 'room.forge.server',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 8,
  tags: ['works', 'machinery'],
  anchors: {
    chest: [{ position: [-2.6, 0, -3.35], rotationY: Math.PI }],
    locker: [{ position: [-3.4, 0, -2.2], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [2.95, 0.78, -2.0] },
      { position: [0, 0, 3.35] },
      { position: [3.25, 0, 3.15] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.3] },
      { position: [-2.6, 0, 0.9] },
      { position: [2.6, 0, 0.9] },
    ],
    enemySpawn: [{ position: [-3.2, 0, 1.8] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, server);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'grate',
    wall: 'panel',
    ceiling: 'cable',
    band: 'panel',
    bandHeight: 0.85,
    register: 'cold',
    mouth: 'blast',
  });

  /* --- the racks ------------------------------------------------------------------ */
  // A row backed against the south wall, split by a slot at the middle. The slot
  // is 1.8 m wide, 0.9 m deep and there is nothing in it, which is the only
  // reason anybody ever looks into it twice. The row stops 0.7 m short of each
  // side wall so a player can get round the back of it.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      rackCabinet(room, s * (1.24 + i * 0.7), 3.2, 0, true, 2.1);
    }
  }
  // Two more standing free, forming the mouth of the slot.
  rackCabinet(room, -0.95, 1.85, Math.PI / 2, true, 1.85);
  rackCabinet(room, 0.95, 1.85, -Math.PI / 2, false, 1.85);

  // The cable, coming out of the backs and up the wall. This is the room.
  for (let i = 0; i < 9; i++) {
    const x = -3.0 + i * 0.75;
    strut(room, 'cable', [x, 2.1, 3.55], [x + room.range(-0.3, 0.3), ceilingHeight - 0.25, 2.6], room.range(0.02, 0.05), 5, {
      receiveShadow: false,
    });
  }
  for (let i = 0; i < 5; i++) {
    strut(
      room,
      'cable',
      [room.range(-2.6, 2.6), ceilingHeight - 0.3, 2.4],
      [room.range(-2.6, 2.6), ceilingHeight - room.range(0.8, 1.4), room.range(0.2, 1.4)],
      0.035,
      5,
      { receiveShadow: false },
    );
  }

  /* --- the operator's end ----------------------------------------------------------- */
  // Turned to face west, so whoever sat here had the racks over their shoulder.
  controlDesk(room, 3.0, -2.4, 1.8, Math.PI / 2, true);
  monitorBank(room, 1.4, 1.5, -3.5, Math.PI, 3, 2, true);
  debris(room, -1.6, -1.4, 0.9, 6);
  motes(room, 0, 1.6, 1.0, 3.0, 10, 'ash');
  wallSign(room, 'north', -1.4, 2.45, false);
  wallSign(room, 'east', 2.7, 2.2, true);
  alarmBeacon(room, -3.5, 2.6, -3.0, false);

  /* --- the extractor ------------------------------------------------------------------ */
  // The only moving thing in the room. A merged mesh cannot move, so it gets a
  // batcher of its OWN: five pieces merged into two draws rather than five loose
  // meshes, animated as the group the batcher hands back.
  const blades = new MeshBatcher();
  blades.add(room.mat('steelDark'), cyl(0.07, 0.07, 0.11, 7), tiltMatrix([0, 0, 0], [0, 0, Math.PI / 2]), {
    tile: 0.2,
    castShadow: false,
    receiveShadow: false,
  });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    blades.add(room.mat('steelPale'), boxGeometry(0.04, 0.16, 0.44), tiltMatrix([0, Math.sin(a) * 0.24, Math.cos(a) * 0.24], [0, 0, a + 0.5]), {
      tile: 0.2,
      castShadow: false,
      receiveShadow: false,
    });
  }
  const built = blades.build();
  const fan = new THREE.Group();
  fan.position.set(-3.5, 2.35, 2.6);
  fan.add(built.object);
  room.loose(fan);
  room.own(built);
  spin(room, fan, 3.2);
  // Its housing and guard, batched with the room. Bars across the face, and a
  // duct box behind it going into the wall.
  room.geo('graphite', cyl(0.56, 0.56, 0.3, 12, true), tiltMatrix([-3.56, 2.35, 2.6], [0, 0, Math.PI / 2]), { tile: 0.4 });
  for (let i = 0; i < 5; i++) {
    room.geo('steelDark', quad(0.05, 1.06), poseMatrix([-3.3, 2.35, 2.6], Math.PI / 2), { receiveShadow: false });
  }
  room.box('graphite', [0.12, 1.2, 1.2], [-3.7, 1.75, 2.0], 0, { tile: 0.4 });

  /* --- light -------------------------------------------------------------------------- */
  // Almost all the illumination here is the racks' own emissive strips. The two
  // real lamps are a cold batten over the desk and a low green wash in front of
  // the row, which is what makes the slot read as a hole rather than a shadow.
  battenLight(room, 3.0, -2.4, 2.2, Math.PI / 2, true, true, 10, 0.5);

  const glow = new THREE.PointLight(0x3cf089, 6, ctx.dims.cellSize * 1.2, 2);
  glow.position.set(0, 0.75, 2.5);
  room.light(glow);
  room.tick((t) => {
    glow.intensity = 6 * (1 + Math.sin(t * 1.7) * 0.08 + Math.sin(t * 11.3) * 0.03);
  });

  glowPool(room, 0, 2.7, 2.0, true);
  room.geo('lumenGreen', quad(2.2, 0.05), tiltMatrix([0, 0.02, 2.36], [-Math.PI / 2, 0, 0]), { receiveShadow: false });

  return room.finish();
}
