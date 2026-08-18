import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  basket,
  bloomFlower,
  candles,
  carvedPanel,
  cyl,
  glowPool,
  hanging,
  limb,
  litter,
  motes,
  mothLantern,
  phial,
  plume,
  quad,
  shelf,
  stool,
  table,
} from '../kit/props';

/**
 * The Pollen Vault - a Bower room in the middle of losing an argument.
 *
 * Everything here was made: carved heartwood, a lattice wainscot, a vaulted
 * ceiling, a table with four chairs at it. And violet has come up through all of
 * it - along the fluting, out of the joints of the lattice, through the seams in
 * the parquet - and where it reaches a surface it opens.
 *
 * This is the pack's second hinge and it hinges on the third strand rather than
 * on the boundary between the two halves: the Bower's own language, one colour
 * out. The moth lantern on the north wall is still burning and is still warm,
 * which is what makes the violet read as an intrusion rather than as a theme.
 *
 * There is a place laid at the table for somebody who is standing in the niche.
 */
export const pollenVault: RoomBlueprint = {
  id: 'heartwood.pollenvault',
  nameKey: 'room.heartwood.pollenvault',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 7,
  tags: ['bloom', 'bower', 'hinge'],
  anchors: {
    chest: [{ position: [2.2, 0, 3.3], rotationY: 0 }],
    locker: [{ position: [3.3, 0, -2.8], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.2, 0.86, -0.5] },
      { position: [-2.2, 0.86, 1.1] },
      { position: [3.45, 1.36, 3.3] },
    ],
    patrolPoint: [
      { position: [0.4, 0, 0] },
      { position: [-0.8, 0, 2.8] },
      { position: [2.5, 0, -1.6] },
    ],
    enemySpawn: [{ position: [3.2, 0, 1.6] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, pollenVault);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'parquet',
    wall: 'bloom',
    ceiling: 'vault',
    band: 'lattice',
    bandHeight: 1.2,
    rail: true,
    register: 'bloomvein',
    mouth: 'carved',
    ports: [{ side: 'west', kind: 'niche', light: true }],
  });

  /* --- the table ------------------------------------------------------------ */
  // Four places laid, three of them used and one of them not. It is in the west
  // band, which this room never opens, so the tableau is guaranteed to survive
  // whichever way the generator turns the room.
  table(room, -2.2, 0.3, 2.6, 1.0, 0.8, Math.PI / 2);
  for (const [sx, sz] of [
    [-3.1, -0.7],
    [-3.1, 1.3],
    [-1.3, -0.3],
  ] as const) {
    stool(room, sx, sz, 0.44);
  }
  // The fourth chair is pushed right back from the table and turned to face the
  // niche. That is the whole tableau.
  room.box('timberDark', [0.42, 0.05, 0.4], [-0.9, 0.44, 0.9], -1.2, { tile: 0.3 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    room.box('timberDark', [0.045, 0.44, 0.045], [-0.9 + sx * 0.16, 0, 0.9 + sz * 0.16], 0, { tile: 0.2 });
  }
  room.box('timber', [0.44, 0.62, 0.05], [-0.9 + Math.sin(-1.2) * 0.17, 0.44, 0.9 + Math.cos(-1.2) * 0.17], -1.2, { tile: 0.3 });
  room.blockCircle(-0.9, 0.9, 0.24);

  // What is on it: four settings of plate and cup, three of them disturbed and
  // one still square to the table edge.
  for (let i = 0; i < 4; i++) {
    const pz = -1.0 + i * 0.75;
    const nudge = i === 2 ? 0 : room.range(-0.12, 0.12);
    room.geo('timberPale', cyl(0.13, 0.12, 0.022, 11), poseMatrix([-2.2 + nudge, 0.88, pz]), { tile: 0.1, castShadow: false });
    room.geo('pottery', cyl(0.045, 0.055, 0.09, 9), poseMatrix([-1.9 + nudge, 0.88, pz + 0.14]), { tile: 0.1, castShadow: false });
    if (i !== 2) {
      // A flower has opened in the middle of the plate. It is not a decoration
      // somebody put there: the stalk goes down through the table.
      bloomFlower(room, -2.2 + nudge, 0.9, pz, room.range(0.09, 0.15));
      room.geo('surface.bloomVein', cyl(0.012, 0.02, 0.85, 4), poseMatrix([-2.2 + nudge, 0.42, pz]), { castShadow: false, receiveShadow: false });
    }
  }
  // The centrepiece: a bowl that was full of something and is now full of petals.
  room.geo('copper', cyl(0.22, 0.15, 0.13, 12), poseMatrix([-2.2, 0.88, 0.3]), { tile: 0.15, castShadow: false });
  for (let i = 0; i < 11; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = Math.sqrt(room.rng()) * 0.2;
    room.geo('petalViolet', quad(room.range(0.07, 0.13), room.range(0.05, 0.09)), tiltMatrix([-2.2 + Math.cos(a) * d, 0.96 + room.range(0, 0.04), 0.3 + Math.sin(a) * d], [-Math.PI / 2 + room.range(-0.6, 0.6), a, 0]), { castShadow: false, receiveShadow: false });
  }

  /* --- the taking ------------------------------------------------------------ */
  /**
   * The violet coming up through the room's own carpentry.
   *
   * It follows the architecture rather than ignoring it: a vein up the quirk
   * between two reeds of the fluting, out of the joints of the lattice, and along
   * the seams of the parquet. That is the whole trick of this room - the Bloom
   * looks like it is *using* the Bower's geometry, which is far worse than it
   * simply covering it.
   */
  for (const [side, along] of [
    ['north', -1.6],
    ['north', 2.2],
    ['east', -2.0],
    ['south', 1.4],
    ['south', -2.6],
  ] as const) {
    const wall = side === 'north' ? [-along, -3.68] : side === 'south' ? [along, 3.68] : [3.68, -along];
    const wx = wall[0] ?? 0;
    const wz = wall[1] ?? 0;
    const inward = side === 'north' ? [0, 1] : side === 'south' ? [0, -1] : [-1, 0];
    const ix = (inward[0] ?? 0) * 0.06;
    const iz = (inward[1] ?? 0) * 0.06;
    limb(room, 'surface.bloomVein', [wx + ix, 0.5, wz + iz], [wx + ix + room.range(-0.3, 0.3), ceilingHeight - 0.4, wz + iz + room.range(-0.3, 0.3)], 0.03, 0.014, 0.16, wx + wz, 6, { castShadow: false, receiveShadow: false });
    for (let i = 0; i < 3; i++) {
      bloomFlower(room, wx + ix * 1.6, 0.9 + i * 0.8, wz + iz * 1.6, room.range(0.09, 0.17), [Math.PI / 2, Math.atan2(-(inward[0] ?? 0), -(inward[1] ?? 0)), 0]);
    }
  }
  // And along the parquet, out of the seams, getting thicker toward the niche.
  for (let i = 0; i < 15; i++) {
    const px = room.range(-3.4, 3.2);
    const pz = room.range(-3.4, 3.4);
    const weight = Math.max(0.15, 1 - (px + 3.6) / 6.5);
    limb(
      room,
      'surface.bloomVein',
      [px, 0.02, pz],
      [px + room.range(-1.2, 1.2), 0.02, pz + room.range(-1.2, 1.2)],
      0.016 * weight + 0.006,
      0.008,
      0.25,
      i * 4,
      4,
      { castShadow: false, receiveShadow: false },
    );
    if (room.chance(weight * 0.7)) bloomFlower(room, px, 0.02, pz, room.range(0.07, 0.16));
  }

  /* --- the rest of the room --------------------------------------------------- */
  shelf(room, 'east', -2.6, 1.3, 1.6, 0.32);
  for (let i = 0; i < 5; i++) {
    phial(room, 3.45, 1.36, 1.9 + i * 0.32, 0.045, 0.16, i === 0 || i === 3);
  }
  carvedPanel(room, 'north', 2.4, 1.5, 1.6, 1.0, 2);
  carvedPanel(room, 'south', -2.4, 1.5, 1.6, 1.0, 2);
  hanging(room, 'east', 2.0, 1.5, 1.3, 1.5, 'weaveGreen');
  basket(room, -3.2, 3.2, 0.28, 0.42, false);
  basket(room, 1.6, -3.3, 0.22, 0.3, true);
  litter(room, 2.6, 2.4, 0.9, 6);

  // Petals lying on the floor everywhere, which is what a room full of flowers
  // in a place with no wind would actually look like.
  for (let i = 0; i < 22; i++) {
    room.geo(
      'petalViolet',
      quad(room.range(0.07, 0.15), room.range(0.05, 0.1)),
      tiltMatrix([room.range(-3.4, 3.4), 0.014 + room.range(0, 0.008), room.range(-3.4, 3.4)], [-Math.PI / 2 + room.range(-0.4, 0.4), room.range(0, 3), 0]),
      { castShadow: false, receiveShadow: false },
    );
  }

  plume(room, -2.4, 0.3, 1.0, 1.9, 1.6, 'hazeBloom');
  motes(room, -1.6, 0.4, 2.4, 2.7, 22, 'bloom');
  motes(room, 2.0, -1.4, 1.6, 2.4, 10, 'pollen');

  /* --- light -------------------------------------------------------------------- */
  /**
   * The shell's niche lamp is the violet one and it is behind the table, so the
   * four settings are backlit and the empty chair is a silhouette against it.
   *
   * The second is a moth lantern, warm, still burning, on the far wall. That one
   * lamp is what makes this room read as a Bower room being taken rather than as
   * a Bloom room: with two violet lamps there would be no temperature left for
   * the violet to be strange against.
   */
  const lamp = mothLantern(room, 'north', -2.6, 2.2, true, 9);
  if (lamp) {
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(512, 512);
    lamp.shadow.autoUpdate = false;
    lamp.shadow.needsUpdate = true;
  }
  candles(room, -2.2, 0.88, 1.4, 2, 0.1);

  glowPool(room, -2.4, 0.3, 3.0, 'bloomWash');
  glowPool(room, -0.9, 0.9, 1.6, 'bloomWash');
  glowPool(room, 2.0, -2.4, 1.8);

  return room.finish();
}
