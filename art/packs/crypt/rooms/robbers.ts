import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, boneHeap, coinHoard, cyl, debris, disc, dustMotes, quad, ring, sandDrift, skull, sporeCluster, strut, urn } from '../kit/props';

/**
 * The Robbers' Tunnel - somebody else got here first, and did not get out.
 *
 * A dynastic chamber with a hole knocked through one wall, the spoil still lying
 * where it was shovelled, two timber props holding up what the hole cost, and a
 * man's skeleton against the wall beside a lamp that burned out four hundred
 * years before anybody came looking for him.
 *
 * The pack's hinge room. Sandstone and gold on one side, mycelium coming through
 * the breach on the other, and it is the ONE place the two temperatures are
 * allowed in the same shot - which is exactly why the doorways here are ragged
 * holes rather than built arches.
 */
export const robbers: RoomBlueprint = {
  id: 'crypt.robbers',
  nameKey: 'room.crypt.robbers',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 9,
  tags: ['necropolis', 'hinge', 'treasure'],
  anchors: {
    chest: [{ position: [2.6, 0, -3.15], rotationY: Math.PI }],
    itemSpawn: [
      { position: [-2.05, 0.14, 2.3] },
      { position: [1.0, 0.96, 1.4] },
      { position: [3.0, 0, 2.7] },
    ],
    patrolPoint: [
      { position: [0.4, 0, -2.3] },
      { position: [-2.4, 0, -1.2] },
      { position: [1.8, 0, 2.5] },
    ],
    enemySpawn: [{ position: [-3.0, 0, -2.9] }],
    treasure: [{ position: [-1.6, 0, 2.6] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, robbers);
  room.shell({
    floor: 'sand',
    wall: 'sandstone',
    ceiling: 'slabs',
    dado: 'glyph',
    dadoHeight: 0.95,
    lamps: 'oil',
    // Every opening in this room was made with a pick. It is the one room in the
    // pack whose doorways are not architecture.
    mouth: 'rubble',
    niches: [{ side: 'west', kind: 'breach', light: true }],
  });

  /* --- the hole -------------------------------------------------------------------- */
  // The spoil out of the breach, thrown back into the room, and two props holding
  // the lintel up. Both props are cracked and one has already started to go.
  for (let i = 0; i < 9; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = room.range(0.2, 1.4);
    room.geo(i % 3 === 0 ? 'stoneWarmPale' : 'stoneWarm', ball(room.range(0.12, 0.26), 6), tiltMatrix([-2.6 + Math.cos(a) * r, 0.06, Math.sin(a) * r], [0, a, 0], [1.3, 0.6, 1.1]), {
      tile: 0.4,
      castShadow: false,
    });
  }
  room.geo('sandLoose', disc(1.6, 14), tiltMatrix([-2.6, 0.013, 0], [-Math.PI / 2, 0.4, 0]), { castShadow: false, receiveShadow: false });
  for (const s of [-1, 1]) {
    strut(room, 'timber', [-3.3, 0.05, s * 1.15], [-3.1, 2.3, s * 0.95], 0.085, 7, { tile: 0.6 });
    room.collider({ kind: 'circle', center: [-3.2, s * 1.05], radius: 0.12 });
  }
  room.geo('timber', cyl(0.075, 0.075, 2.4, 7), tiltMatrix([-3.15, 2.32, 0], [Math.PI / 2, 0, 0]), { tile: 0.6, castShadow: false });
  // A split down one prop, and the wedges hammered in under it.
  room.geo('stoneDark', quad(0.05, 1.4), poseMatrix([-3.02, 1.3, 0.95], 0), { castShadow: false, receiveShadow: false });
  for (let i = 0; i < 3; i++) {
    room.geo('timberDark', ball(0.07, 6), tiltMatrix([-3.2, 0.05 + i * 0.07, -1.0 + i * 0.06], [0, i, 0], [1.6, 0.5, 1]), { castShadow: false });
  }

  /* --- the man --------------------------------------------------------------------- */
  // Sitting against the wall where he stopped, with the lamp beside him and the
  // bag between his knees. Legs out, head down: the pose is the whole story, and
  // it is five bones.
  const mx = -2.05;
  const mz = 2.3;
  boneHeap(room, mx, mz, 0.34, 6);
  skull(room, mx + 0.1, 0.2, mz - 0.15, 2.2, 1.05, 'boneDark');
  for (const s of [-1, 1]) {
    // Femur out, tibia bent back: a seated skeleton, and it reads instantly.
    strut(room, 'bone', [mx + 0.1 + s * 0.14, 0.09, mz - 0.1], [mx + 0.7 + s * 0.2, 0.11, mz - 0.45], 0.03, 6, { castShadow: false });
    strut(room, 'bone', [mx + 0.7 + s * 0.2, 0.11, mz - 0.45], [mx + 1.15 + s * 0.14, 0.1, mz - 0.05], 0.026, 6, { castShadow: false });
    // An arm along the wall.
    strut(room, 'bone', [mx + 0.05 + s * 0.2, 0.14, mz - 0.05], [mx + 0.45 + s * 0.3, 0.09, mz + 0.35], 0.022, 5, { castShadow: false });
  }
  // The bag: a slumped sack with what he had already taken spilling out of it.
  room.geo('linen', ball(0.3, 9), tiltMatrix([mx + 0.85, 0.02, mz + 0.05], [0, 0.5, 0], [1.1, 0.75, 0.95]), { tile: 0.5, castShadow: false });
  room.geo('rope', ring(0.09, 0.018, 9), tiltMatrix([mx + 0.85, 0.4, mz + 0.05], [1.2, 0.5, 0]), { castShadow: false });
  coinHoard(room, mx + 1.25, mz + 0.35, 0.36);
  urn(room, mx + 0.15, 0, mz + 0.7, 0.3, true);
  // His lamp, on its side, and the soot ring where it burned out.
  room.geo('stoneWarmPale', cyl(0.09, 0.07, 0.05, 9), tiltMatrix([mx - 0.35, 0.05, mz + 0.15], [1.5, 0.7, 0]), { castShadow: false });
  room.geo('ash', disc(0.16, 9), tiltMatrix([mx - 0.35, 0.013, mz + 0.15], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  /* --- what he was after ----------------------------------------------------------- */
  // A gilded shrine chest, levered open and stripped, with the marks of the lever
  // still on the lip. It is the room's one gold object and it is empty.
  room.solid('surface.sandstone', [1.5, 0.9, 0.9], [1.0, 0, 1.5], 0.24, { tile: 0.8 });
  room.box('gold', [1.35, 0.14, 0.78], [1.0, 0.9, 1.5], 0.24, { tile: 0.5 });
  room.box('stoneDark', [1.1, 0.05, 0.56], [1.0, 0.9, 1.5], 0.24, { tile: 0.4, castShadow: false });
  room.geo('goldDim', ring(0.06, 0.014, 9), tiltMatrix([1.6, 0.98, 1.35], [0.4, 0.24, 0]), { castShadow: false });
  // The lid, dragged off and dumped on the floor face down.
  room.geo('gold', ball(0.7, 8), tiltMatrix([2.2, 0.08, 0.5], [0.1, 0.9, 0.16], [1.7, 0.14, 0.95]), { tile: 0.7, castShadow: false });
  room.geo('ironPale', cyl(0.024, 0.03, 1.1, 6), tiltMatrix([1.7, 0.24, 2.1], [1.35, 0.8, 0]), { tile: 0.3, castShadow: false });

  /* --- the two temperatures -------------------------------------------------------- */
  // Mycelium coming in through the breach and running out across the sand: the one
  // room where the Rot and the Necropolis are in the same shot, and the reason the
  // boundary reads as deliberate rather than as an accident of generation.
  room.geo('mycelium', disc(1.7, 14), tiltMatrix([-2.9, 0.014, 0.6], [-Math.PI / 2, 0.7, 0]), { castShadow: false, receiveShadow: false });
  room.geo('mycelium', disc(0.9, 12), tiltMatrix([-1.5, 0.014, -0.9], [-Math.PI / 2, 2.1, 0]), { castShadow: false, receiveShadow: false });
  // The second of the room's two lights, and the cold one. His lamp burned out
  // four centuries ago; this did not, and it is why the breach end of the room is
  // the only part of it you can see clearly.
  sporeCluster(room, -2.9, 0, -0.9, 0.8, true, 4, true);
  sporeCluster(room, -1.9, 0, 0.9, 0.5, false);
  for (let i = 0; i < 6; i++) {
    room.geo('rootPale', cyl(0.01, 0.026, room.range(0.4, 1.1), 5), tiltMatrix([-3.5, room.range(0.6, 1.9), room.range(-1.4, 1.4)], [0, 0, room.range(-0.3, 0.3)]), {
      tile: 0.3,
      castShadow: false,
    });
  }

  /* --- the sand -------------------------------------------------------------------- */
  // And the tracks through it: two lines of them, going one way only.
  sandDrift(room, 2.4, -1.4, 1.4, 0.3);
  sandDrift(room, 0.4, 3.0, 1.5, 1.8);
  for (let i = 0; i < 7; i++) {
    for (const s of [-1, 1]) {
      room.geo('stoneDark', disc(0.075, 6), tiltMatrix([-2.2 + i * 0.55, 0.014, 1.5 + s * 0.16 + i * 0.05], [-Math.PI / 2, 0.4, 0]), {
        castShadow: false,
        receiveShadow: false,
      });
    }
  }
  debris(room, 1.4, -2.9, 0.7, 7, true);
  debris(room, 3.0, 0.6, 0.55, 5, true);
  dustMotes(room, -1.4, 1.4, 0.6, 2.6, 20);

  return room.finish();
}
