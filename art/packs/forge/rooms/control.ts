import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  alarmBeacon,
  arcLamp,
  controlDesk,
  crate,
  debris,
  gauge,
  glowPool,
  heatShimmer,
  monitorBank,
  motes,
  quad,
  railing,
  stutter,
  wallSign,
} from '../kit/props';

/**
 * Magma Control - the room the facility was run from, looking straight into the
 * thing it was running.
 *
 * The south wall is a four-metre armoured slit with the lake behind it, and
 * everything in the room is arranged to face it: two console banks with a gap
 * between them so you can walk up to the glass, and a rail across that gap
 * because somebody decided people should not. The rail does not reach the
 * consoles at either end, which is exactly how a rail like that fails.
 *
 * It is the brightest room in the Works and all of the light is coming from
 * outside through gold film, so everything in here is a silhouette.
 */
export const control: RoomBlueprint = {
  id: 'forge.control',
  nameKey: 'room.forge.control',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['works', 'landmark'],
  anchors: {
    chest: [{ position: [-2.6, 0, -3.35], rotationY: Math.PI }],
    itemSpawn: [
      { position: [-2.6, 0.78, 1.95] },
      { position: [2.9, 0.78, 1.95] },
      { position: [1.9, 0, -3.3] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.4] },
      { position: [-2.6, 0, -0.6] },
      { position: [2.6, 0, -0.6] },
    ],
    enemySpawn: [{ position: [-3.2, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, control);
  room.shell({
    floor: 'hex',
    wall: 'panel',
    ceiling: 'cable',
    band: 'panel',
    bandHeight: 0.9,
    register: 'vent',
    hot: true,
    rail: true,
    ports: [{ side: 'south', kind: 'slit', scene: 'lake', tall: true, light: true }],
  });

  /* --- the consoles ----------------------------------------------------------- */
  // Two banks with a gap in the middle so a player can walk to the glass. Both
  // face south: `controlDesk` puts its fascia on its own -Z, so at yaw 0 the
  // operator stands north of it looking into the window.
  controlDesk(room, -2.6, 2.05, 1.9, 0, true);
  controlDesk(room, 2.6, 2.05, 1.9, 0, false);
  // The rail across the gap. It deliberately stops 0.85 m short of each console:
  // a barrier that seals the strip behind it would make the far half of the room
  // an unreachable pocket, and a rail with a way round it is what a rail like
  // this actually looks like twenty years in.
  railing(room, [-0.8, 0, 1.5], [0.8, 0, 1.5], true, 1.02);

  // The tall slit takes the middle four metres of the south wall; the returns
  // either side of it are the only solid piece, and that is where the mimic
  // stacks go. Screens face -Z (into the room), which is `rotationY + PI`.
  monitorBank(room, -3.05, 1.15, 3.48, 0, 1, 2, true);
  monitorBank(room, 3.05, 1.15, 3.48, 0, 1, 2, false);
  gauge(room, 'south', -3.05, 2.5, 0.16);
  gauge(room, 'south', 3.05, 2.5, 0.12);

  // Heat shimmer standing just inside the glass. Thin, and in front of nothing.
  heatShimmer(room, 0, 1.7, 3.3, 4.4, 2.2, 0);

  /* --- the back of the room ---------------------------------------------------- */
  crate(room, 3.05, -2.9, 0.3, 0.8, 0.62, 0.66, true);
  debris(room, 1.2, -2.2, 0.9, 7);
  motes(room, 0, 1.8, 1.4, 3.2, 12, 'ash');

  // The floor plan painted on the deck in front of the rail, half worn away.
  room.geo('paintedWarn', quad(2.2, 0.1), tiltMatrix([0, 0.012, 1.16], [-Math.PI / 2, 0, 0]), { receiveShadow: false });

  /* --- light ------------------------------------------------------------------- */
  // One of the two lights is the slit's own practical, already spent by the
  // shell. The second is a failing arc fitting over the case, and it is what
  // makes the back of the room read as abandoned rather than merely dark.
  const lamp = arcLamp(room, 'west', -2.9, 2.45, true, 11);
  if (lamp) stutter(room, lamp, 11, 0.7, 5.2);
  alarmBeacon(room, 3.5, 2.5, 2.6, false);
  wallSign(room, 'north', 2.4, 2.4, true);
  wallSign(room, 'east', 2.6, 2.2, false);

  glowPool(room, 0, 2.9, 2.4);

  return room.finish();
}
