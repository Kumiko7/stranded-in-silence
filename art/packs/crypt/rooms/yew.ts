import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, bracketFungus, cyl, debris, disc, dustMotes, puddle, quad, rootMass, sarcophagus, skull, sporeCluster, strut } from '../kit/props';

/**
 * Under the Yew - the churchyard tree got here first.
 *
 * A root two feet thick has come down through the vault, split a tomb chest in
 * half, and gone on into the floor. Everything in the room is arranged round
 * that one shape: pale rootlets hanging in curtains, moss where the water runs
 * down them, and a stone lid balanced on top of the root a metre off the ground
 * where the tree lifted it.
 *
 * The room's one idea is scale - a single object crossing the whole space beats
 * twenty small ones, and it is what stops this reading as the same room as the
 * Bloom next door.
 */
export const yew: RoomBlueprint = {
  id: 'crypt.yew',
  nameKey: 'room.crypt.yew',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 8,
  tags: ['rot', 'hinge'],
  anchors: {
    chest: [{ position: [2.5, 0, 3.15], rotationY: 0 }],
    locker: [{ position: [-2.7, 0, 3.15], rotationY: 0 }],
    itemSpawn: [
      { position: [0.5, 0.7, -1.4] },
      { position: [-2.4, 0, -2.9] },
      { position: [3.0, 0, -1.2] },
    ],
    patrolPoint: [
      { position: [-2.5, 0, -1.6] },
      { position: [2.9, 0, 0.6] },
      { position: [0.2, 0, 2.6] },
    ],
    enemySpawn: [{ position: [-3.0, 0, 1.4] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, yew);
  room.shell({
    floor: 'earth',
    wall: 'moss',
    ceiling: 'roots',
    dado: 'none',
    lamps: 'spore',
    mouth: 'root',
    plinth: false,
    // A corpse shelf the root has grown straight through, and it is not lit: the
    // fungus is, and a player finds this one by walking into it.
    niches: [{ side: 'south', kind: 'loculus' }],
  });

  /* --- the root -------------------------------------------------------------------- */
  // One object, corner to corner, in five tapering segments so it bends. Anything
  // this size has to change direction or it reads as a pipe.
  const spine: [number, number, number][] = [
    [-3.4, 3.4, -3.2],
    [-2.1, 2.5, -1.9],
    [-0.7, 1.6, -1.2],
    [0.9, 1.05, -1.5],
    [2.4, 0.55, -2.6],
    [3.4, 0.1, -3.4],
  ];
  for (let i = 1; i < spine.length; i++) {
    const a = spine[i - 1];
    const b = spine[i];
    if (!a || !b) continue;
    strut(room, i < 3 ? 'root' : 'rootPale', a, b, 0.3 - i * 0.035, 8, { tile: 0.9 });
    // A knuckle at every bend: a straight cylinder chain is a hose, and the lumps
    // are what make it read as timber.
    room.geo('root', ball(0.32 - i * 0.035, 8), tiltMatrix(b, [0, i, 0], [1.2, 0.85, 1.1]), { tile: 0.6 });
  }
  // Collision on the two segments low enough to walk into, kept out of every door
  // lane - north and west are offered walls and this crosses both corners.
  room.collider({ kind: 'circle', center: [0.9, -1.5], radius: 0.34 });
  room.collider({ kind: 'circle', center: [2.4, -2.6], radius: 0.4 });

  // Rootlets hanging off the underside of it in curtains, and drips off those.
  for (let i = 0; i < 14; i++) {
    const t = room.range(0.15, 0.85);
    const idx = Math.min(spine.length - 2, Math.floor(t * (spine.length - 1)));
    const a = spine[idx];
    const b = spine[idx + 1];
    if (!a || !b) continue;
    const f = t * (spine.length - 1) - idx;
    const x = a[0] + (b[0] - a[0]) * f;
    const y = a[1] + (b[1] - a[1]) * f;
    const z = a[2] + (b[2] - a[2]) * f;
    const len = room.range(0.3, 1.0);
    strut(room, 'rootPale', [x, y - 0.2, z], [x + room.range(-0.2, 0.2), y - 0.2 - len, z + room.range(-0.2, 0.2)], room.range(0.012, 0.03), 5, {
      castShadow: false,
    });
  }

  /* --- the tomb it went through ---------------------------------------------------- */
  // The chest is in two pieces with the root standing in the break, and the lid is
  // balanced on top of the root where the tree lifted it.
  sarcophagus(room, 0.5, -1.4, 0.1, { lid: 'none', open: true, occupant: false, length: 2.0 });
  room.geo('surface.slab', ball(0.9, 8), tiltMatrix([1.1, 1.28, -1.9], [0.12, 0.4, 0.24], [2.1, 0.1, 0.75]), { tile: 1.0 });
  skull(room, 0.0, 0.38, -1.2, room.range(0, 6), 1.05, 'boneDark');

  /* --- water and moss -------------------------------------------------------------- */
  // Everything the root brought down with it: water off the rootlets, moss under
  // the drips, and one bright cluster where it pooled.
  puddle(room, -1.4, -0.6, 0.8);
  puddle(room, 1.6, -0.4, 0.6);
  puddle(room, -0.4, 1.9, 0.7);
  room.geo('moss', disc(1.9, 14), tiltMatrix([-1.9, 0.014, 0.2], [-Math.PI / 2, 0.6, 0]), { castShadow: false, receiveShadow: false });
  room.geo('moss', disc(1.4, 12), tiltMatrix([2.2, 0.014, 1.4], [-Math.PI / 2, 2.1, 0]), { castShadow: false, receiveShadow: false });
  for (let i = 0; i < 6; i++) {
    // Drips, as very short thin cylinders. Cheap, and they make a wet room wet.
    room.geo('water', cyl(0.006, 0.006, room.range(0.1, 0.3), 4), poseMatrix([room.range(-2.4, 2.4), room.range(1.4, 2.6), room.range(-2.4, 2.4)]), {
      castShadow: false,
      receiveShadow: false,
    });
  }

  /* --- light ----------------------------------------------------------------------- */
  // Two clusters, teal and violet, at opposite ends of the room. Both breathe
  // rather than flicker, and between them they are the whole light budget.
  sporeCluster(room, -2.6, 0, 0.6, 1.3, true, 9, true);
  sporeCluster(room, 1.9, 0, 2.5, 1.1, true, 8, false);
  sporeCluster(room, -1.0, 0, -2.9, 0.7, false);
  bracketFungus(room, 'west', 2.2, 0.8, 3);
  bracketFungus(room, 'north', 2.6, 1.2, 3);
  rootMass(room, 'east', 1.8, [0, 0], 4);

  /* --- the crypt underneath -------------------------------------------------------- */
  debris(room, -2.9, -2.6, 0.7, 7);
  debris(room, 2.8, 0.6, 0.6, 6);
  room.box('surface.ashlar', [1.8, 1.4, 0.06], [-1.6, 1.1, 3.64], 0, { tile: 1.4 });
  // Motes only. The crossed haze quads that used to hang here were three metres
  // across and read as panes of glass from both doorways.
  dustMotes(room, 0, 1.6, 0, 3.0, 26, true);

  return room.finish();
}
