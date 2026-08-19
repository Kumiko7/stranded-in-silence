import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  cocoon,
  debris,
  disc,
  glowPool,
  medCot,
  motes,
  notice,
  pipeRun,
  resinGrowth,
  slab,
  specimenJar,
  strobe,
  strut,
  subjectTank,
  trolley,
  uvTube,
  valve,
  wallStain,
} from '../kit/props';

/**
 * The Incubation Ward - three tanks, a germicidal circuit that nobody switched
 * off, and something growing along the pipes that was not in anybody's plan.
 *
 * The Programme is two rooms and one colour. Everything else in Blackgate is
 * either a warm tungsten night circuit or a cold clinical batten; this half is
 * lit by ultraviolet, which is neither, and it is the only place in the map
 * where the light itself is wrong before anything in it is.
 *
 * The crust growing out of the register and up the tanks is a hard rind with a
 * lattice of channels in it, and the channels carry the glow. Beads on a dark
 * web, never a lit web - a continuous glowing line reads as a string of party
 * lights (docs/art/ROOM_REVIEW.md).
 */
export const incubation: RoomBlueprint = {
  id: 'prison.incubation',
  nameKey: 'room.prison.incubation',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 5,
  maxPerMap: 1,
  tags: ['programme', 'landmark'],
  anchors: {
    chest: [{ position: [3.35, 0, -2.6], rotationY: Math.PI / 2 }],
    locker: [{ position: [-3.35, 0, -1.8], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [2.1, 0.81, -0.4] },
      { position: [-3.1, 0.95, 1.6] },
      { position: [0.9, 0, -2.8] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.2] },
      { position: [-1.4, 0, -1.6] },
      { position: [2.5, 0, -2.2] },
    ],
    enemySpawn: [{ position: [-3.1, 0, 3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, incubation);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'wardTile',
    wall: 'wardTile',
    band: 'none',
    ceiling: 'lath',
    // The Programme's own course: the same channel as every other room in the
    // pack, running a germicidal tube instead of a bulb, with the crust growing
    // over both ends of it.
    register: 'uv',
    // And its own mouth: a bulkhead ring clamped into the opening with a row of
    // dogs round it, which is the seal somebody fitted after the fact.
    mouth: 'seal',
    ports: [{ side: 'south', kind: 'grille' }],
  });

  /* --- the tanks ------------------------------------------------------------------- */
  // Three, across the band against the wall the generator can never open. The
  // outer two are empty and clouded; the middle one is not, and it is lit from
  // outside the glass rather than inside it - a lamp sunk in its own glowing mesh
  // lights the inside of a cylinder and nothing else.
  subjectTank(room, -2.5, 2.4, 0.5, 2.1, false, false);
  const lit = subjectTank(room, 0, 2.55, 0.55, 2.2, true, true, 11);
  if (lit) {
    room.bakeShadow(lit, 512);
    strobe(room, lit, 11, 0.28, 7.5);
  }
  subjectTank(room, 2.5, 2.4, 0.5, 2.1, false, false);

  // The feed gantry over them: a header with three drops and a valve on each,
  // which is what makes three cylinders read as equipment rather than as decor.
  pipeRun(
    room,
    [
      [-3.4, 2.95, 3.3],
      [3.4, 2.95, 3.3],
    ],
    0.06,
    'surgical',
  );
  for (const tx of [-2.5, 0, 2.5]) {
    strut(room, 'surgical', [tx, 2.95, 3.3], [tx, 2.28, 2.9], 0.035, 5, { castShadow: false });
    valve(room, [tx, 2.16, 2.85], 0.11, 0, false);
  }

  /* --- what got out ------------------------------------------------------------------ */
  // It came out of the middle tank, went along the register and up the corner,
  // and there is a cocoon on the east wall where it stopped.
  resinGrowth(room, 0, 1.5, 1.1, 6);
  resinGrowth(room, -1.6, 0.2, 0.8, 4);
  resinGrowth(room, 2.9, 1.2, 0.7, 4);
  cocoon(room, 'east', 1.4, 0.55);
  for (let i = 0; i < 7; i++) {
    // Guys running up the corner into the lath: the growth is under tension.
    strut(room, 'sinew', [3.2 - i * 0.06, 1.6 + i * 0.22, 2.4 + i * 0.1], [2.4 - i * 0.12, ceilingHeight - 0.1, 1.9 + i * 0.16], 0.018, 4, {
      castShadow: false,
    });
  }
  room.geo('surface.resin', ball(0.5, 8), tiltMatrix([2.2, ceilingHeight - 0.22, 1.7], [0, 0.4, 0], [1.5, 0.5, 1.3]), { tile: 0.5, castShadow: false });

  /* --- the ward ---------------------------------------------------------------------- */
  medCot(room, -2.2, -3.0, 0, true, false);
  trolley(room, 2.1, -0.4, 0.4, true);
  specimenJar(room, 2.1, 0.81, -0.5, 0.09, 0.26, true);
  room.solid('enamel', [0.86, 0.9, 0.5], [-3.1, 0, 1.6], 0, { tile: 0.5 });
  room.box('surgical', [0.92, 0.05, 0.58], [-3.1, 0.9, 1.6], 0, { tile: 0.4, castShadow: false });
  for (let i = 0; i < 4; i++) {
    specimenJar(room, -3.1, 0.95, 1.05 + i * 0.32, 0.06, 0.16, i === 2);
  }

  /* --- the room ----------------------------------------------------------------------- */
  notice(room, 'north', -2.6, 1.9, 0.56, 0.42, 'surface.cards');
  notice(room, 'west', 2.6, 1.75, 0.44, 0.6, 'paper');
  wallStain(room, 'east', -2.6, 2.5, 0.6, 1.6, 'mould');
  slab(room, 'paper', [0.28, 0.01, 0.34], [0.9, 0.015, -2.8], [0, 0.5, 0], { tile: 0.25 });
  debris(room, -1.4, -2.9, 0.8, 5);
  motes(room, 0, 1.6, 1.6, 3.2, 14, 'spore');

  /* --- light -------------------------------------------------------------------------- */
  // Two lamps and both of them violet. The tube over the ward end is on a wire
  // guard nobody can reach; the tank is the other, and it is the shadow caster,
  // which puts the shape inside it on eight metres of tile.
  const tube = uvTube(room, -1.0, 2.55, -1.6, 1.6, Math.PI / 2, true, 11);
  if (tube) strobe(room, tube, 11, 0.32, 6.8);
  uvTube(room, 2.2, 2.5, -2.6, 1.2, 0, false);
  glowPool(room, 0, 2.4, 2.4, 'violet');
  glowPool(room, -1.6, -2.6, 1.6, 'violet');
  room.geo('violetWash', disc(1.4, 14), tiltMatrix([2.9, 0.014, 1.4], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  room.geo('spill', disc(1.1, 14), tiltMatrix([0.4, 0.013, 1.4], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  for (let i = 0; i < 5; i++) {
    room.geo('caul', ball(room.range(0.03, 0.06), 5), poseMatrix([room.range(-1.5, 1.5), room.range(0.4, 2.2), room.range(0.6, 2.2)]), { castShadow: false });
  }
  return room.finish();
}
