import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  crate,
  cyl,
  debris,
  disc,
  drainChannel,
  floorGully,
  motes,
  notice,
  pipeRun,
  puddle,
  quad,
  ring,
  slab,
  steamPlume,
  strobe,
  strut,
  trolley,
  tubeLight,
  valve,
  wallSign,
  wallStain,
} from '../kit/props';

/**
 * Decontamination - a spray tunnel, a curtain of perished plastic and a bin of
 * clothes nobody came back for.
 *
 * Two hoop frames of pipe with nozzles all round them, four metres apart, and
 * everything between them painted with a chevron so that whoever walked through
 * knew where to stand. It is the only room in the map with a direction built
 * into the floor as a marking rather than as a fall, and the direction it points
 * is deeper into the Ward.
 *
 * The vapour is additive and masked. Alpha-blended at any opacity you can see it
 * lays a grey film over the tunnel it is supposed to be filling, which is the
 * one mistake this pack could not afford to make in the room whose whole subject
 * is a haze (docs/art/ROOM_REVIEW.md).
 */
export const decon: RoomBlueprint = {
  id: 'prison.decon',
  nameKey: 'room.prison.decon',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['ward'],
  anchors: {
    chest: [{ position: [-3.25, 0, -2.6], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.3, 0, -2.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-3.0, 0.66, 1.6] },
      { position: [3.1, 0.62, 1.4] },
      { position: [1.1, 0, 3.1] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.2] },
      { position: [-2.5, 0, -2.2] },
      { position: [2.5, 0, -2.2] },
    ],
    enemySpawn: [{ position: [3.2, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, decon);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'drain',
    wall: 'wardTile',
    band: 'hazard',
    bandHeight: 0.55,
    ceiling: 'pipes',
    register: 'strip',
    mouth: 'clinic',
    damp: true,
    ports: [{ side: 'south', kind: 'grille' }],
  });

  /* --- the tunnel ------------------------------------------------------------------ */
  // Two hoops of pipe in the band against the wall the generator can never open,
  // with a run of nozzles round the inside of each. They are 1.4 m apart, so a
  // player walks between them rather than round them.
  for (const hz of [1.85, 3.15]) {
    const r = 1.15;
    for (let i = 0; i < 11; i++) {
      const a = Math.PI * (i / 10);
      const b = Math.PI * ((i + 1) / 10);
      strut(
        room,
        'surgical',
        [-Math.cos(a) * r, Math.sin(a) * r * 1.9 + 0.05, hz],
        [-Math.cos(b) * r, Math.sin(b) * r * 1.9 + 0.05, hz],
        0.038,
        5,
        { castShadow: false },
      );
      if (i % 2 === 0) {
        // The nozzles, pointing inward and down the tunnel.
        const nx = -Math.cos(a) * (r - 0.06);
        const ny = Math.sin(a) * (r - 0.06) * 1.9 + 0.05;
        room.geo('brass', cyl(0.014, 0.026, 0.1, 5), tiltMatrix([nx, ny, hz], [Math.PI / 2 - a * 0.3, 0, a - Math.PI / 2]), { castShadow: false });
      }
    }
    room.geo('surgical', cyl(0.05, 0.06, 0.12, 8), poseMatrix([-1.15, 0.06, hz]), { castShadow: false });
    room.geo('surgical', cyl(0.05, 0.06, 0.12, 8), poseMatrix([1.15, 0.06, hz]), { castShadow: false });
  }
  // The feed main and its valve, run down the east wall into the hoops.
  pipeRun(
    room,
    [
      [3.4, 2.5, -1.0],
      [3.4, 2.5, 2.5],
      [1.2, 2.32, 2.5],
    ],
    0.06,
    'lead',
  );
  valve(room, [3.4, 1.6, 1.3], 0.16, Math.PI / 2, true);
  strut(room, 'lead', [3.4, 2.5, 1.3], [3.4, 1.7, 1.3], 0.045, 5, { castShadow: false });

  // The chevron the tunnel is painted on, running one way only.
  room.geo('surface.hazard', quad(1.9, 3.4), tiltMatrix([0, 0.012, 2.4], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  steamPlume(room, 0, 1.85, 0.2, 2.3, 2.0, 'fumes');
  steamPlume(room, 0, 3.1, 0.2, 2.0, 1.7, 'fumes');

  /* --- the curtain ------------------------------------------------------------------ */
  // Perished plastic strip, hung across the mouth of the tunnel in separate
  // blades with real gaps between them. Three panels six centimetres apart is
  // arithmetically a gap and visually a wall (docs/art/ROOM_REVIEW.md).
  room.box('surgical', [3.0, 0.06, 0.08], [0, ceilingHeight - 0.5, 1.25], 0, { tile: 0.4, castShadow: false });
  for (let i = 0; i < 9; i++) {
    slab(room, 'stripCurtain', [0.24, 1.9, 0.01], [-1.32 + i * 0.33, ceilingHeight - 1.48, 1.25], [0, room.range(-0.3, 0.3), room.range(-0.06, 0.06)], {
      castShadow: false,
      receiveShadow: false,
    });
  }

  /* --- what came off ---------------------------------------------------------------- */
  // A wheeled bin of clothing with a lid half on, and a hose reel on the wall.
  room.geo('ironPale', cyl(0.44, 0.4, 0.82, 12), poseMatrix([-3.0, 0.41, 1.6]), { tile: 0.5, castShadow: true });
  for (let i = 0; i < 5; i++) {
    room.geo('itemCloth', ball(room.range(0.11, 0.19), 6), tiltMatrix([-3.0 + room.range(-0.2, 0.2), 0.84 + room.range(0, 0.1), 1.6 + room.range(-0.2, 0.2)], [0, room.range(0, 3), 0], [1.2, 0.7, 1.1]), {
      castShadow: false,
    });
  }
  slab(room, 'ironPale', [0.9, 0.04, 0.9], [-2.55, 0.95, 1.9], [0, 0.4, 0.45], { tile: 0.4 });
  room.blockCircle(-3.0, 1.6, 0.44);

  room.geo('ironBar', ring(0.32, 0.05, 12), tiltMatrix([3.42, 1.85, -1.6], [0, Math.PI / 2, Math.PI / 2]), { tile: 0.3, castShadow: false });
  for (let i = 0; i < 4; i++) {
    room.geo('rubberProp', ring(0.28 - i * 0.03, 0.028, 11), tiltMatrix([3.36, 1.85, -1.6], [0, Math.PI / 2, Math.PI / 2]), { castShadow: false });
  }
  strut(room, 'rubberProp', [3.3, 1.6, -1.6], [2.6, 0.1, -1.1], 0.028, 5, { castShadow: false });
  room.geo('brass', cyl(0.03, 0.04, 0.24, 7), tiltMatrix([2.5, 0.06, -1.0], [Math.PI / 2, 0.6, 0]), { castShadow: false });

  crate(room, 3.1, 1.4, -0.3, 0.7, 0.5, 0.58, false);
  trolley(room, -2.6, -1.4, 0.5, false);

  /* --- the wet ------------------------------------------------------------------------ */
  drainChannel(room, [-3.3, 1.2], [3.3, 1.2], 0.26);
  floorGully(room, 0, 2.5, 0.14);
  puddle(room, -1.2, 0.4, 0.9);
  puddle(room, 1.6, 2.6, 0.7);
  wallSign(room, 'north', -2.6, 2.35, 'red', 0.72);
  notice(room, 'east', 2.5, 1.9, 0.5, 0.36, 'surface.stencil');
  wallStain(room, 'west', 2.6, 2.5, 0.6, 1.6, 'mould');
  debris(room, 2.6, -2.8, 0.7, 5);
  motes(room, 0, 1.6, 2.2, 2.6, 12, 'lime');

  /* --- light ---------------------------------------------------------------------------- */
  // Two battens, both cold, both behind sealed glass because of what used to be
  // in the air in here. The near one is the shadow caster and the hoops are
  // between it and the far wall, which is the whole picture.
  const near = tubeLight(room, 0, -0.6, 2.4, 0, true, true, 9, 0.4);
  if (near) {
    room.bakeShadow(near, 512);
    strobe(room, near, 9, 0.5, 6.8);
  }
  const far = tubeLight(room, 0, 2.5, 2.2, 0, true, true, 6, 0.4);
  if (far) strobe(room, far, 6, 0.8, 4.4);
  room.geo('coldWash', disc(2.4, 18), tiltMatrix([0, 0.014, 2.4], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
