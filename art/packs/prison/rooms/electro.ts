import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  cyl,
  debris,
  disc,
  medCot,
  motes,
  notice,
  restraintChair,
  slab,
  strobe,
  strut,
  treatmentMachine,
  trolley,
  tubeLight,
  wallStain,
  xrayBox,
} from '../kit/props';

/**
 * Treatment - a cot, a machine that looks like a radiogram, and two rubber
 * electrodes on a coiled lead.
 *
 * The most upsetting room in the map is the one with the least in it, because
 * every object in here is a completely ordinary piece of 1940s medical
 * equipment: a mahogany case of dials, a rubber floor to insulate whoever was
 * standing, a bite block on a tray, a cot with wrist straps. Nothing here is a
 * device of torture and everything here was used on people who could not leave.
 *
 * The floor is studded rubber, which is the one surface in the pack that exists
 * for a reason a player can work out.
 */
export const electro: RoomBlueprint = {
  id: 'prison.electro',
  nameKey: 'room.prison.electro',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['ward'],
  anchors: {
    chest: [{ position: [-1.9, 0, -3.35], rotationY: Math.PI }],
    locker: [{ position: [3.35, 0, -2.5], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [1.0, 0.81, 3.0] },
      { position: [-2.6, 1.02, 3.0] },
      { position: [2.9, 0, 0.4] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.4] },
      { position: [0, 0, -2.4] },
      { position: [2.5, 0, -2.2] },
    ],
    enemySpawn: [{ position: [-3.1, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, electro);
  room.shell({
    floor: 'rubber',
    wall: 'wardTile',
    band: 'none',
    ceiling: 'soffit',
    register: 'strip',
    mouth: 'clinic',
    // A judas hatch on the one wall the generator can never open. Whatever
    // happened in here, somebody watched it from the corridor.
    ports: [{ side: 'south', kind: 'judas' }],
  });

  /* --- the cot ---------------------------------------------------------------------- */
  // In the band against the far wall, turned so a player entering from the north
  // sees it end-on with the machine beside it and the lead running between them.
  medCot(room, 2.45, 2.4, 0, true, false);
  treatmentMachine(room, -2.6, 2.65, 0.12, true);
  trolley(room, 1.0, 3.0, -0.3, true);
  // A bite block on the trolley: a wrapped roll of rubber with the marks in it.
  room.geo('rubberProp', cyl(0.035, 0.035, 0.13, 7), tiltMatrix([1.0, 0.83, 3.0], [0, 0.4, Math.PI / 2]), { castShadow: false });
  room.geo('itemCloth', cyl(0.045, 0.045, 0.05, 7), tiltMatrix([0.95, 0.83, 3.0], [0, 0.4, Math.PI / 2]), { castShadow: false });

  // The lead: from the machine, up over a hook on the ceiling and down to the
  // cot, which is how it was actually run so nobody tripped on it.
  strut(room, 'rubberProp', [-2.2, 1.35, 2.65], [-0.4, 2.9, 2.5], 0.016, 5, { castShadow: false });
  strut(room, 'rubberProp', [-0.4, 2.9, 2.5], [1.9, 1.2, 2.45], 0.016, 5, { castShadow: false });
  room.geo('surgical', ball(0.05, 6), poseMatrix([-0.4, 2.94, 2.5]), { castShadow: false });
  for (let i = 0; i < 6; i++) {
    room.geo('rubberProp', cyl(0.02, 0.02, 0.05, 5), tiltMatrix([1.9 + i * 0.02, 1.16 - i * 0.055, 2.45], [0.2, 0, 0.6]), { castShadow: false });
  }

  /* --- the chair -------------------------------------------------------------------- */
  // Standing in the corner, out of the way, and it is the older equipment: they
  // used it before the cot, and nobody has moved it since.
  restraintChair(room, -3.0, -2.95, 0.5, true);
  slab(room, 'paper', [0.26, 0.01, 0.3], [-1.6, 0.02, -1.4], [0, 0.5, 0], { tile: 0.25 });

  /* --- the wall -------------------------------------------------------------------- */
  xrayBox(room, 'south', 2.7, 1.65, false);
  room.box('surface.cards', [0.03, 1.1, 1.6], [-3.66, 1.6, -0.4], 0, { tile: 0.9, castShadow: false });
  notice(room, 'north', -2.6, 1.9, 0.56, 0.42, 'surface.stencil');
  notice(room, 'east', -2.4, 1.7, 0.46, 0.62, 'paper');
  wallStain(room, 'west', 2.5, 2.5, 0.6, 1.5, 'rust');
  wallStain(room, 'south', -2.9, 2.6, 0.5, 1.4, 'mould');
  debris(room, 2.9, 0.4, 0.6, 4);
  motes(room, 0, 1.6, 1.4, 2.8, 11, 'dust');

  /* --- light ------------------------------------------------------------------------ */
  // Two battens. The one over the cot is the shadow caster and it is the only
  // thing in the room that is bright: everything else - the machine's pilot lamp,
  // the strip in the skirting - is a point of light in the dark.
  const over = tubeLight(room, 1.6, 2.0, 2.2, 0, true, true, 9, 0.42);
  if (over) {
    room.bakeShadow(over, 512);
    strobe(room, over, 9, 0.45, 7.2);
  }
  const near = tubeLight(room, -0.6, -1.8, 2.0, 0, true, true, 6, 0.42);
  if (near) strobe(room, near, 6, 0.8, 4.0);
  room.geo('coldWash', disc(2.3, 18), tiltMatrix([1.6, 0.014, 2.2], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  return room.finish();
}
