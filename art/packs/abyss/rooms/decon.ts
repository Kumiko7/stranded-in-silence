import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { bench, cageLamp, debris, disc, drain, dripLine, quad, shelf, stripLight, wallSign } from '../kit/props';

/**
 * Decontamination - tile, drains, and six showers that all ran at once.
 *
 * A pass-through: hatch fore, hatch aft, and everything else on the two side
 * walls. Six heads on a manifold down the east side over a grated channel, a
 * rack of hazard suits down the west, and a grille in the west bulkhead with
 * something warm behind it.
 *
 * The one room in the station that is meant to feel scrubbed, which is why
 * everything in it is failing so visibly: mould in the grout, a suit on the
 * floor, and the light stuttering hard enough to make the tile flash.
 */
export const decon: RoomBlueprint = {
  id: 'abyss.decon',
  nameKey: 'room.abyss.decon',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'south'),
  weight: 9,
  tags: ['station', 'clinical'],
  anchors: {
    chest: [{ position: [3.2, 0, -2.7], rotationY: Math.PI / 2 }],
    locker: [
      { position: [-3.25, 0, -2.7], rotationY: -Math.PI / 2 },
      { position: [-3.25, 0, 2.7], rotationY: -Math.PI / 2 },
    ],
    itemSpawn: [
      { position: [-2.5, 0.96, 1.2] },
      { position: [3.42, 1.56, 1.9] },
      { position: [1.9, 0, 3.1] },
    ],
    patrolPoint: [
      { position: [0, 0, -1.6] },
      { position: [0, 0, 1.6] },
      { position: [-2.2, 0, -0.2] },
    ],
    enemySpawn: [{ position: [2.6, 0, 2.9] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, decon);
  room.shell({
    floor: 'tile',
    wall: 'tile',
    ceiling: 'panels',
    band: 'tile',
    bandHeight: 2.1,
    strip: 'cyan',
    mouth: 'bulkhead',
    ports: [
      { side: 'west', kind: 'grille', light: true },
      { side: 'east', kind: 'porthole' },
    ],
  });

  /* --- the showers ----------------------------------------------------------------- */
  // A manifold down the east wall with six heads on it, over a grated channel.
  // All of it sits at |z| > 1.2 or hard against the plate, so the fore-and-aft
  // lane down the middle of the room never has anything in it.
  const manifoldY = 2.45;
  room.geo('steel', new THREE.CylinderGeometry(0.075, 0.075, 6.4, 10), tiltMatrix([3.28, manifoldY, 0], [Math.PI / 2, Math.PI / 2, 0]), {
    tile: 0.6,
    consume: true,
  });
  for (let i = 0; i < 6; i++) {
    const z = -2.75 + i * 1.1;
    room.geo('steel', new THREE.CylinderGeometry(0.025, 0.025, 0.34, 6), poseMatrix([3.28, manifoldY - 0.2, z]), {
      tile: 0.2,
      castShadow: false,
      consume: true,
    });
    room.geo('steelPale', new THREE.ConeGeometry(0.11, 0.1, 12), poseMatrix([3.28, manifoldY - 0.4, z]), { tile: 0.2, consume: true });
    room.geo('steelDark', disc(0.1, 12), tiltMatrix([3.28, manifoldY - 0.45, z], [Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
    // Two of them still dribbling.
    if (i === 1 || i === 4) {
      room.geo('puddle', new THREE.CylinderGeometry(0.006, 0.004, manifoldY - 0.45, 4), poseMatrix([3.28, (manifoldY - 0.45) / 2, z]), {
        castShadow: false,
        receiveShadow: false,
        consume: true,
      });
    }
  }
  // The channel: a recessed run of grating with the tile stepped down to it.
  room.box('surface.tile', [0.5, 0.03, 6.6], [3.35, 0, 0], 0, { tile: 1.2, castShadow: false });
  for (let i = 0; i < 20; i++) {
    room.box('steel', [0.42, 0.025, 0.05], [3.35, 0.03, -3.2 + i * 0.34], 0, { tile: 0.3, castShadow: false, receiveShadow: false });
  }
  for (const z of [-2.2, 0.4, 2.6]) drain(room, 2.6, z);

  /* --- the suit rack ---------------------------------------------------------------- */
  // Down the west wall between the two lockers: hooks, hangers and five suits.
  room.geo('steel', new THREE.CylinderGeometry(0.03, 0.03, 3.2, 6), tiltMatrix([-3.28, 2.15, 0], [Math.PI / 2, Math.PI / 2, 0]), {
    tile: 0.4,
    consume: true,
  });
  for (let i = 0; i < 5; i++) {
    const z = -1.4 + i * 0.72;
    const lean = room.range(-0.05, 0.05);
    room.geo('steelDark', new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5), poseMatrix([-3.28, 2.05, z]), {
      tile: 0.2,
      castShadow: false,
      consume: true,
    });
    room.box('canvasSuit', [0.4, 1.15, 0.16], [-3.34, 0.82, z], Math.PI / 2 + lean, { tile: 0.5, castShadow: false });
    room.box('canvasSuit', [0.26, 0.4, 0.2], [-3.32, 1.55, z], Math.PI / 2 + lean, { tile: 0.4, castShadow: false });
    room.geo('glassPane', quad(0.16, 0.13), poseMatrix([-3.2, 1.78, z], Math.PI / 2), { castShadow: false, receiveShadow: false });
  }
  // The sixth is on the floor where somebody stepped out of it.
  room.box('canvasSuit', [1.2, 0.16, 0.44], [-1.9, 0.005, -1.4], 0.5, { tile: 0.5, castShadow: false });
  room.geo('steelPale', new THREE.SphereGeometry(0.22, 9, 7), poseMatrix([-1.4, 0.2, -1.15]), { tile: 0.4, consume: true });

  /* --- the bench and the wash-down gear ---------------------------------------------- */
  // Pulled forward off the west plate: a locker anchor sits at z = 2.7 on that
  // wall, and it needs 1.2 m of clear floor to open into.
  bench(room, -2.5, 1.4, 1.6, 0.7, 0.94, Math.PI / 2);
  shelf(room, 'east', -1.9, 1.5, 1.2, 0.36);
  for (const z of [1.45, 2.35]) {
    room.geo('plastic', new THREE.CylinderGeometry(0.09, 0.09, 0.26, 10), poseMatrix([3.42, 1.68, z]), { tile: 0.3, consume: true });
  }
  wallSign(room, 'east', 3.0, 2.15);
  wallSign(room, 'west', -3.0, 2.15);

  // Mould in the grout, standing water, and the debris every wet room collects.
  for (let i = 0; i < 6; i++) {
    room.geo('surface.algae', disc(room.range(0.2, 0.6), 10), tiltMatrix([room.range(-3.2, 3.2), 0.012, room.range(-3.2, 3.2)], [-Math.PI / 2, room.range(0, 3), 0]), {
      tile: 0.8,
      castShadow: false,
      receiveShadow: false,
    });
  }
  // Streaks down the fore bulkhead, kept clear of |x| < 1.3: that wall becomes a
  // hatchway on most maps, and a stain hanging in an open doorway is a bug.
  for (let i = 0; i < 4; i++) {
    const x = (room.chance(0.5) ? -1 : 1) * room.range(1.4, 3.0);
    room.geo('surface.algae', quad(room.range(0.4, 1.1), room.range(0.5, 1.6)), poseMatrix([x, room.range(0.4, 1.6), -3.68], 0), {
      castShadow: false,
      receiveShadow: false,
    });
  }
  dripLine(room, 1.2, -2.6);
  dripLine(room, -1.4, 2.8);
  debris(room, 1.9, 2.6, 0.9, 8);

  /**
   * Two hard cold strips down the middle. This is the one room that is meant to
   * be BRIGHT - a scrub room reads as institutional or it reads as nothing - so
   * the horror here comes from the stutter rather than from the dark.
   */
  stripLight(room, 0, -1.7, 2.6, Math.PI / 2, true, false, 12);
  stripLight(room, 0, 1.7, 2.6, Math.PI / 2, false, true);
  cageLamp(room, 'north', 2.6, 2.5, false, true);

  return room.finish();
}
