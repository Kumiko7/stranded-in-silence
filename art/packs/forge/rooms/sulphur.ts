import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  boulders,
  debris,
  disc,
  floorFissure,
  glowPool,
  motes,
  mudPot,
  rubble,
  spike,
  steamJet,
  sulphurChimney,
  surge,
  wallSign,
} from '../kit/props';

/**
 * The Sulphur Garden - a solfatara field the drilling opened into, and the only
 * saturated colour in the map that is not on fire.
 *
 * Chimneys of yellow crystal growing out of a crusted floor, a mud pot working
 * away in the corner, and gas coming off all of it. The light here is citron
 * rather than orange, which puts it between the Works' cold white and the
 * Mountain's ember - and makes it the one room a player cannot immediately
 * place.
 *
 * Nobody who worked here would have gone in without a mask. The suits are two
 * rooms away.
 */
export const sulphur: RoomBlueprint = {
  id: 'forge.sulphur',
  nameKey: 'room.forge.sulphur',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['mountain'],
  anchors: {
    chest: [{ position: [2.6, 0, -3.35], rotationY: Math.PI }],
    itemSpawn: [
      { position: [2.4, 0, 3.2] },
      { position: [-3.3, 0, -0.6] },
      { position: [1.2, 0, -2.2] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.4] },
      { position: [-2.4, 0, -0.4] },
      { position: [2.4, 0, 1.9] },
    ],
    enemySpawn: [{ position: [3.3, 0, -2.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, sulphur);
  room.shell({
    floor: 'sulphur',
    wall: 'tuff',
    ceiling: 'rock',
    band: 'basalt',
    bandHeight: 0.45,
    register: 'fissure',
    mouth: 'fissure',
  });

  /* --- the field ------------------------------------------------------------------- */
  // Everything is in the south band, because this room offers three walls and the
  // T through the middle has to stay bare. Three chimneys at three heights: a row
  // at one height reads as a fence.
  sulphurChimney(room, 0.4, 2.4, 1.5, true);
  sulphurChimney(room, 1.6, 3.2, 0.9, true);
  sulphurChimney(room, -0.8, 3.3, 1.15, false);
  sulphurChimney(room, 3.1, 1.9, 0.7, false);

  mudPot(room, -2.7, 2.5, 0.8);

  // A crust apron out from the chimneys: pale rind with needles standing in it.
  for (let i = 0; i < 22; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * 2.4;
    const x = 0.6 + Math.cos(a) * d;
    const z = 2.6 + Math.sin(a) * d * 0.6;
    room.geo('sulphurCrystal', spike(room.range(0.03, 0.07), room.range(0.1, 0.3), 5), tiltMatrix([x, 0.02, z], [room.range(-0.4, 0.4), a, room.range(-0.4, 0.4)]), {
      tile: 0.2,
    });
  }
  for (let i = 0; i < 9; i++) {
    room.geo('sulphurCrystal', ball(room.range(0.16, 0.34), 5), tiltMatrix([room.range(-3.0, 3.0), 0.02, room.range(1.4, 3.4)], [0, i, 0], [1.4, 0.3, 1.2]), {
      tile: 0.4,
    });
  }

  /* --- the rock -------------------------------------------------------------------- */
  // Two fissures crossing the open floor. They are flat and carry no collider, so
  // a player walks over them and the room stays a room rather than a maze.
  floorFissure(room, -1.4, -2.4, 3.0, 0.4, true);
  floorFissure(room, 2.2, -1.6, 2.6, -0.6, false);
  // `rubble()` rather than `boulders()` in the open half: boulders place their
  // own colliders at seeded-random positions, so a heap of them within a metre
  // and a half of a doorway seals it on some seeds and not on others.
  rubble(room, -2.8, -2.6, 1.2, 12);
  rubble(room, 0.4, -1.0, 1.4, 12);
  rubble(room, 3.0, -1.2, 0.9, 8);
  debris(room, 2.6, 3.1, 0.7, 4);

  // Gas hanging in the air. Thin, and only where it is coming from something.
  steamJet(room, 0.4, 2.4, 1.55, 1.7, true);
  steamJet(room, -2.7, 1.9, 0.2, 1.4);
  motes(room, 0, 1.6, 1.2, 3.2, 12, 'ash');

  // A dead gas meter clamped to a rock, and the peg tape somebody ran out to it.
  room.box('steelDark', [0.22, 0.28, 0.14], [-3.4, 0.7, -0.6], 0.5, { tile: 0.2 });
  room.geo('screenDead', disc(0.08, 8), poseMatrix([-3.34, 0.82, -0.72], 0.5), { receiveShadow: false });
  for (let i = 0; i < 5; i++) {
    room.geo('paintedWarn', ball(0.03, 4), tiltMatrix([-3.2 + i * 0.7, 0.9, -0.5 + i * 0.35], [0, 0.5, 1.3], [1, 11, 1]), { receiveShadow: false });
  }
  wallSign(room, 'north', -2.4, 2.2, true);

  glowPool(room, 0.6, 2.6, 2.6);
  glowPool(room, -1.4, -2.4, 1.5);

  /* --- light ------------------------------------------------------------------------ */
  // Citron from inside the chimney field, and a dull ember from the fissures. The
  // citron lamp is deliberately pale and bright rather than saturated and dim: a
  // saturated lamp floods a room with one colour and takes the rock away with it.
  const gas = new THREE.PointLight(0xd8e07a, 9, ctx.dims.cellSize * 1.6, 2);
  gas.position.set(0.5, 1.15, 2.5);
  room.shadowLight(gas);
  surge(room, gas, 9, 0.2, 0.7);

  const ember = new THREE.PointLight(0xff6a20, 6, ctx.dims.cellSize * 1.3, 2);
  ember.position.set(-1.4, 0.45, -2.4);
  room.light(ember);
  surge(room, ember, 6, 0.26, 0.45);

  return room.finish();
}
