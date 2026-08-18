import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { boxGeometry } from '../../../lib/build';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  basket,
  bench,
  candles,
  cyl,
  disc,
  glowPool,
  litter,
  mossPatch,
  hangingLantern,
  mothLantern,
  motes,
  phial,
  pot,
  quad,
  ring,
  shelf,
  stool,
  strut,
} from '../kit/props';

/**
 * The Warren - three front doors in a wall, and one of them is open.
 *
 * Somebody hollowed dwellings out of the trunk the way you would dig them out of
 * a hillside: round doors with brass furniture, a scraper and a mat at each, a
 * window box on the middle one, a name board nobody can read any more. Two are
 * shut. The third stands open onto a hole with a dead fire in it, and there is a
 * chair pulled up to that fire with its back to you.
 *
 * The whole set piece is in the west band, which this room never opens - the
 * three doors are guaranteed to be there for the entire run, whichever way the
 * generator turns the room.
 */
export const burrow: RoomBlueprint = {
  id: 'heartwood.burrow',
  nameKey: 'room.heartwood.burrow',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 10,
  tags: ['bower', 'entrance'],
  anchors: {
    chest: [{ position: [2.9, 0, 3.3], rotationY: 0 }],
    locker: [{ position: [3.3, 0, -2.7], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.55, 0.48, 0.05] },
      { position: [2.85, 1.32, 2.2] },
      { position: [-2.9, 0, -3.2] },
    ],
    playerSpawn: [
      { position: [0.4, 0, 2.6], rotationY: Math.PI / 2 },
      { position: [1.6, 0, 2.6], rotationY: Math.PI / 2 },
      { position: [0.4, 0, -2.6], rotationY: Math.PI / 2 },
      { position: [1.6, 0, -2.6], rotationY: Math.PI / 2 },
    ],
    patrolPoint: [
      { position: [0, 0, 0.4] },
      { position: [-2.3, 0, 2.6] },
      { position: [2.5, 0, -1.2] },
    ],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, burrow);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'plank',
    wall: 'clay',
    ceiling: 'rafters',
    band: 'wicker',
    bandHeight: 0.95,
    register: 'sapline',
    mouth: 'burrow',
    ports: [{ side: 'west', kind: 'niche' }],
  });

  /* --- the three doors ------------------------------------------------------ */
  // A round door, its banded ring, its furniture and its threshold. The middle
  // one is open; a room with three shut doors in it is a corridor.
  const doorAt = (z: number, open: boolean, tint: string): void => {
    const x = -3.55;
    const r = 0.82;
    // The ring of staves round the opening, exactly the burrow mouth's language
    // so the whole room agrees with its own doorways.
    /**
     * The ring of staves round the opening.
     *
     * `room.box()` only rotates about Y, so the first pass laid fourteen
     * axis-aligned cubes along an arc and the doors read as a chain of blocks
     * rather than as a hoop - the same class of bug as the manor's pot rack
     * standing on end. A stave has to be TURNED to the ring, which means
     * `tiltMatrix` and a roll about X (docs/art/ROOM_REVIEW.md).
     */
    for (let i = 0; i <= 13; i++) {
      const a = Math.PI * (i / 13);
      const dz = -Math.cos(a) * (r + 0.18);
      const y = 0.16 + Math.sin(a) * (r * 1.92);
      room.geo(
        i % 2 === 0 ? 'timber' : 'timberDark',
        boxGeometry(0.3, 0.32, 0.2),
        tiltMatrix([x + 0.12, y, z + dz], [a - Math.PI / 2, 0, 0]),
        { tile: 0.25 },
      );
    }
    // A smooth liner inside the staves, so the opening is round and not
    // fourteen-sided.
    for (let i = 0; i <= 17; i++) {
      const a = Math.PI * (i / 17);
      room.geo(
        'timberPale',
        boxGeometry(0.24, 0.14, 0.17),
        tiltMatrix([x + 0.3, 0.16 + Math.sin(a) * (r * 1.78), z - Math.cos(a) * (r + 0.02)], [a - Math.PI / 2, 0, 0]),
        { tile: 0.2 },
      );
    }
    room.box('stone', [0.42, 0.06, r * 2 + 0.5], [x + 0.16, 0.02, z], 0, { tile: 0.3 });

    if (open) {
      // The inside: a dark bubble of a room with a dead hearth and a chair in it,
      // built shallow and leaning out of the room by about half a metre.
      room.geo('surface.rot', cyl(r * 0.94, r * 0.94, 1.1, 14, true), tiltMatrix([x - 0.55, r, z], [0, 0, Math.PI / 2]), { tile: 0.7, castShadow: false });
      room.geo('surface.rot', disc(r * 0.94, 14), poseMatrix([x - 1.1, r, z], -Math.PI / 2), { castShadow: false, receiveShadow: false });
      // A chair with its back to the doorway. That is the whole prop.
      room.box('timberDark', [0.34, 0.05, 0.34], [x - 0.75, 0.42, z + 0.1], 0.3, { tile: 0.2 });
      room.box('timberDark', [0.36, 0.56, 0.05], [x - 0.6, 0.42, z + 0.1], 0.3, { tile: 0.2 });
      for (const s of [-1, 1]) {
        room.box('timberDark', [0.04, 0.42, 0.04], [x - 0.75 + s * 0.13, 0, z + 0.1 + s * 0.13], 0, { tile: 0.15 });
      }
      // The dead fire: ash, and three embers that have not quite gone out.
      room.geo('earth', disc(0.24, 10), tiltMatrix([x - 0.85, 0.02, z - 0.4], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
      for (let i = 0; i < 3; i++) {
        room.geo('ember', ball(room.range(0.02, 0.04), 4), poseMatrix([x - 0.85 + room.range(-0.15, 0.15), 0.04, z - 0.4 + room.range(-0.12, 0.12)]), { castShadow: false, receiveShadow: false });
      }
      room.geo('sapWash', disc(0.9, 12), tiltMatrix([x - 0.7, 0.03, z - 0.2], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
    } else {
      // The leaf itself: boarded round, with a ring of pegs and a knob dead
      // centre - which is the one detail that makes it a burrow door.
      room.geo(tint, cyl(r, r, 0.09, 16), tiltMatrix([x + 0.06, r + 0.16, z], [0, 0, Math.PI / 2]), { tile: 0.6, castShadow: true });
      // Boards across the leaf, each cut to the chord at its own height, which is
      // what makes a round door read as boarded rather than as a disc.
      for (let i = 0; i < 7; i++) {
        const t = -r * 0.85 + (r * 1.7 * i) / 6;
        const half = Math.sqrt(Math.max(0, r * r - t * t)) * 0.96;
        room.box('timberDark', [0.03, 2 * half, 0.025], [x + 0.12, r + 0.16 - half, z + t], 0, { tile: 0.2 });
      }
      room.geo('copper', ring(r * 0.88, 0.035, 16), poseMatrix([x + 0.13, r + 0.16, z], Math.PI / 2), { tile: 0.3, castShadow: false });
      room.geo('copper', ball(0.075, 8), poseMatrix([x + 0.16, r + 0.16, z]), { tile: 0.15, castShadow: false });
      room.geo('copper', ring(0.12, 0.018, 10), tiltMatrix([x + 0.17, r - 0.04, z], [0, Math.PI / 2, 0]), { tile: 0.15, castShadow: false });
      // A lit fanlight over the door. Every shut door in this pack needs one
      // point of light on it or it is a dark patch on a dark wall.
      room.geo('lumenMoth', cyl(r * 0.3, r * 0.3, 0.05, 12), tiltMatrix([x + 0.15, r + 0.16 + r * 0.62, z], [0, 0, Math.PI / 2]), { castShadow: false, receiveShadow: false });
      room.geo('copper', ring(r * 0.31, 0.02, 12), poseMatrix([x + 0.18, r + 0.16 + r * 0.62, z], Math.PI / 2), { tile: 0.15, castShadow: false });
      // A boot scraper and a mat that has been rained on for a very long time.
      room.geo('weave', quad(0.62, 0.42), tiltMatrix([x + 0.5, 0.026, z], [-Math.PI / 2, 0.06, 0]), { castShadow: false, receiveShadow: false });
    }
    // A lamp bracket over each, whether or not it is still burning.
    room.box('iron', [0.06, 0.06, 0.06], [x + 0.2, r * 2 + 0.28, z], 0, { tile: 0.1 });
    strut(room, 'iron', [x + 0.2, r * 2 + 0.34, z], [x + 0.55, r * 2 + 0.4, z], 0.014, 5, { tile: 0.15, castShadow: false, receiveShadow: false });
  };

    doorAt(-2.5, false, 'surface.birch');
  doorAt(0.05, true, 'surface.plank');
  doorAt(2.6, false, 'surface.heart');

  // The middle door's window box, which somebody kept up and somebody stopped.
  room.box('timber', [0.24, 0.16, 0.8], [-3.34, 1.9, 0.05], 0, { tile: 0.25 });
  for (let i = 0; i < 7; i++) {
    room.geo(i % 3 === 0 ? 'petalPale' : 'leafDead', quad(room.range(0.1, 0.2), room.range(0.08, 0.16)), tiltMatrix([-3.3, 2.06 + room.range(0, 0.14), -0.3 + i * 0.12], [room.range(-1.4, -0.4), room.range(0, 3), 0]), { castShadow: false, receiveShadow: false });
  }
  // A name board over the open door. There is no text in this project, so it is
  // a carved sigil, which is better: nobody can read it.
  room.box('timberDark', [0.05, 0.24, 0.62], [-3.3, 2.05, -2.5], 0, { tile: 0.2 });
  for (let i = 0; i < 3; i++) {
    room.box('timberPale', [0.02, 0.1, 0.03], [-3.26, 2.1 + (i % 2) * 0.06, -2.68 + i * 0.16], 0, { tile: 0.1 });
  }

  /* --- the lane in front of them --------------------------------------------- */
  // Everything here is against the wall or in a corner: this room offers three
  // walls, so the T through the middle stays bare boards.
  bench(room, -2.55, 0.05, 1.3, Math.PI / 2, 0.48);
  stool(room, -2.4, -1.5);
  basket(room, -2.4, 1.5, 0.26, 0.38, false);
  basket(room, -2.75, 1.95, 0.19, 0.28, true);
  pot(room, -2.9, 0, -3.2, 0.19, 0.36);
  pot(room, -3.2, 0, -3.5, 0.13, 0.26, 'verdigris');

  shelf(room, 'east', -2.0, 1.28, 1.6, 0.32);
  for (let i = 0; i < 5; i++) {
    phial(room, 2.85, 1.33, 1.5 + i * 0.36, 0.045, 0.16, i === 2);
  }
  room.box('timberDark', [0.42, 0.3, 0.28], [3.2, 1.33, 3.0], Math.PI / 2, { tile: 0.2 });

  // Herbs drying from the rafters, in the two corners the doors do not reach.
  for (const [hx, hz] of [[2.6, -3.2], [-1.6, 3.4]] as const) {
    for (let i = 0; i < 3; i++) {
      const px = hx + room.range(-0.4, 0.4);
      const pz = hz + room.range(-0.3, 0.3);
      const len = room.range(0.4, 0.75);
      room.geo('strand', cyl(0.008, 0.008, 0.2, 4), poseMatrix([px, ceilingHeight - 0.38, pz]), { castShadow: false, receiveShadow: false });
      for (let k = 0; k < 5; k++) {
        room.geo('leafDead', quad(room.range(0.06, 0.13), len), tiltMatrix([px + room.range(-0.05, 0.05), ceilingHeight - 0.5 - len / 2, pz + room.range(-0.05, 0.05)], [0, room.range(0, 3), room.range(-0.2, 0.2)]), { castShadow: false, receiveShadow: false });
      }
    }
  }

  mossPatch(room, -3.2, 0.02, 3.6, 0.6, 4);
  litter(room, 1.9, -3.4, 0.9, 7);

  /* --- light ------------------------------------------------------------------ */
  // One lantern over the shut doors, warm, and it is the room's shadow caster
  // because the doors and the bench are what a player needs to read. The second
  // is a low fire-coloured lamp inside the open burrow, which pulls the eye to
  // the one thing in here that is wrong.
  // HUNG rather than bracketed, and out in the lane in front of the doors. A
  // wall lantern on the same wall as the set piece lights the wall and leaves
  // the thing bolted to it in its own shadow.
  const lamp = hangingLantern(room, -1.85, 0.6, 2.35, true, 12);
  if (lamp) {
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(512, 512);
    lamp.shadow.autoUpdate = false;
    lamp.shadow.needsUpdate = true;
  }
  mothLantern(room, 'north', 2.4, 2.2, false);

  const fire = new THREE.PointLight(0xff8434, 5.5, ctx.dims.cellSize * 0.95, 2);
  fire.position.set(-3.9, 0.5, 0.05);
  room.light(fire);
  const phase = room.range(0, 20);
  room.tick((t) => {
    fire.intensity = 5.5 * (0.86 + 0.14 * Math.sin(t * 1.1 + phase) + 0.06 * Math.sin(t * 5.3 + phase));
  });

  candles(room, -2.55, 0.48, 0.6, 2, 0.1);
  motes(room, -2.4, 0.4, 1.6, 2.2, 12, 'dust');
  glowPool(room, -3.0, 0.05, 2.4);

  return room.finish();
}
