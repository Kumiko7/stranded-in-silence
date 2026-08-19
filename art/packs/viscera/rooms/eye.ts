import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, subUV, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { ball, breathe, cyl, disc, drools, eyeOn, fleshFolds, glowShaft, polyps, spike } from '../kit/props';

/**
 * The Regard - a chamber with an eye in the roof of it, and nineteen smaller
 * ones in the walls.
 *
 * Every one of them is open. The big one is four metres across and its iris is
 * the only light in the room, so a player crossing the floor is lit from
 * directly above by the thing watching them do it. The small ones are set at
 * every height, including two at ankle level, which is the detail people notice
 * last and like least.
 */
export const eye: RoomBlueprint = {
  id: 'viscera.eye',
  nameKey: 'room.viscera.eye',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 7,
  maxPerMap: 1,
  tags: ['wet', 'landmark', 'open'],
  anchors: {
    chest: [{ position: [-2.9, 0, -3.0], rotationY: Math.PI }],
    itemSpawn: [
      { position: [3.15, 0.86, -2.4] },
      { position: [3.15, 0.86, 2.4] },
      { position: [-2.6, 0.0, 2.9] },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [-2.4, 0, 1.6] },
      { position: [2.2, 0, -1.4] },
    ],
    enemySpawn: [{ position: [3.2, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, eye);
  const { ceilingHeight } = ctx.dims;
  room.shell({ floor: 'flesh', wall: 'flesh', ceiling: 'flesh', mouth: 'sphincter', ridge: true });

  /* --- the great eye --------------------------------------------------------- */
  /**
   * A sclera dome bulging out of the ceiling, its iris turned straight down.
   *
   * The numbers matter: the dome's underside sits at 3.02 m and the iris hangs
   * at 2.96, PROUD of it. Tucked up inside the sphere - which is where an
   * eyeball's iris anatomically belongs - the dome's own underside hides it and
   * the whole thing renders as a black pit in the ceiling.
   */
  const eyeY = ceilingHeight - 0.05;
  const domeY = ceilingHeight + 0.9;
  room.geo('sclera', ball(1.75, 20), tiltMatrix([0, domeY, 0], [0, 0, 0], [1, 0.7, 1]), {
    castShadow: false,
    tile: 1.4,
  });
  room.geo('iris', subUV(disc(1.16, 28), 0.5, 0, 1, 0.5), tiltMatrix([0, domeY - 1.29, 0], [Math.PI / 2, 0, 0]), {
    castShadow: false,
    receiveShadow: false,
    consume: true,
  });
  /**
   * The socket, then the lids. The ring goes on first and the lids sit outside
   * it: at the size they started - two spheres nearly two metres across, a
   * metre and a half apart - they simply covered the iris, and the ceiling read
   * as a pair of orange balloons with a slot between them.
   */
  room.geo('meat', new THREE.TorusGeometry(1.42, 0.4, 8, 24), tiltMatrix([0, eyeY - 0.18, 0], [-Math.PI / 2, 0, 0]), {
    tile: 1.0,
    castShadow: false,
    consume: true,
  });
  for (const s of [-1, 1]) {
    room.geo('meat', ball(1.5, 14), tiltMatrix([0, eyeY - 0.1, s * 2.05], [0, 0, 0], [1.1, 0.24, 0.5]), { tile: 1.2 });
    for (let i = 0; i < 9; i++) {
      const x = -1.25 + i * 0.31;
      room.geo(
        'tooth',
        spike(0.045, 0.42, 5),
        tiltMatrix([x, eyeY - 0.34, s * 1.98], [s * 1.05, 0, 0]),
        { tile: 0.3 },
      );
    }
  }
  // Vessels crawling out of the socket into the ceiling.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    room.geo(
      'vein',
      cyl(0.05, 0.09, 2.1, 5),
      tiltMatrix([Math.cos(a) * 2.3, eyeY - 0.22, Math.sin(a) * 2.3], [Math.PI / 2 - 0.35, Math.PI / 2 - a, 0]),
      { tile: 0.4 },
    );
  }
  glowShaft(room, [0, eyeY - 0.9, 0], [0, 0.1, 0], 2.2, true);

  /* --- the small ones --------------------------------------------------------- */
  // Set at every height, including two you meet at knee level. Kept off the
  // middle of each wall so no eye is ever cut in half by a doorway.
  const watchers: readonly (readonly ['north' | 'east' | 'south' | 'west', number, number, number, number])[] = [
    ['north', -2.6, 2.15, 0.3, 0],
    ['north', 2.3, 1.35, 0.2, 1],
    ['north', 3.1, 2.6, 0.14, 2],
    ['east', -2.9, 1.75, 0.26, 3],
    ['east', 2.4, 0.55, 0.18, 1],
    ['east', 3.2, 2.35, 0.15, 0],
    ['south', -2.2, 2.45, 0.22, 2],
    ['south', 2.7, 1.15, 0.3, 3],
    ['west', -3.0, 0.48, 0.2, 0],
    ['west', 1.9, 2.2, 0.27, 1],
    ['west', 3.2, 1.5, 0.16, 2],
  ];
  for (const [side, along, y, r, variant] of watchers) eyeOn(room, side, along, y, r, variant);

  /* --- the room --------------------------------------------------------------- */
  // Two ledges of bone on the east wall, holding items, and one low shelf south.
  for (const z of [-2.4, 2.4]) {
    room.solid('bone', [0.7, 0.86, 1.0], [3.35, 0, z], 0, { tile: 0.9 });
    room.geo('bonePale', ball(0.26, 9), tiltMatrix([3.35, 0.88, z], [0, 0.3, 0], [1.3, 0.3, 1.8]), { tile: 0.5 });
  }
  fleshFolds(room, 'south', 2.4, 2.0, 4);
  fleshFolds(room, 'west', -2.4, 2.0, 4);
  polyps(room, -2.9, 0, 0.4, 0.6, 8, true);
  polyps(room, 1.4, 0, 3.2, 0.5, 6, false);
  drools(room, -1.8, -2.6, 1.4, 7);

  // The iris is emissive, so the room already glows; this is what makes it
  // throw. Under the eye, never in it.
  const gaze = new THREE.PointLight(0xffc25a, 13, ctx.dims.cellSize * 1.9, 2);
  gaze.position.set(0, ceilingHeight - 1.45, 0);
  room.light(gaze);
  breathe(room, gaze, 13, 0.12, 0.4);

  return room.finish();
}
