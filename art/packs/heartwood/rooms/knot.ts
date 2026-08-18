import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  brackets,
  cyl,
  disc,
  foxfire,
  gillLamp,
  glowPool,
  limb,
  litter,
  motes,
  plume,
  quad,
  strut,
  toadstools,
  wallEyes,
} from '../kit/props';

/**
 * The Knot - a pocket where a branch used to be, and something else lives in it
 * now.
 *
 * One way in. The whole north half is a burl the size of a cart, split down the
 * middle, and inside the split is a nest: a bowl of hair and twig and chewed
 * bark, lined with things that were pulled off other things. It is warm. There
 * is nothing in it at the moment.
 *
 * The only dead end in the pack, and it earns being one: three of its four walls
 * are guaranteed solid, so it is the one room where the shell can put an opening
 * in every wall a player is not walking through, and all three of them look out
 * at somewhere worse.
 */
export const knot: RoomBlueprint = {
  id: 'heartwood.knot',
  nameKey: 'room.heartwood.knot',
  footprint: [[0, 0]],
  doorWalls: wallsFor('south'),
  weight: 7,
  tags: ['thicket', 'deadend'],
  anchors: {
    chest: [{ position: [3.2, 0, 0.5], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-0.6, 1.15, -2.2] },
      { position: [-3.1, 0, 2.4] },
    ],
    patrolPoint: [
      { position: [0, 0, 2.5] },
      { position: [-2.4, 0, 0.6] },
    ],
    enemySpawn: [{ position: [2.6, 0, 3.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, knot);
  room.shell({
    floor: 'rot',
    wall: 'pulp',
    ceiling: 'knots',
    band: 'bark',
    bandHeight: 0.8,
    register: 'weep',
    mouth: 'grown',
    hot: true,
    ports: [
      { side: 'north', kind: 'burst' },
      { side: 'east', kind: 'knothole', scene: 'roots' },
      { side: 'west', kind: 'webbed' },
    ],
  });

  /* --- the burl --------------------------------------------------------------- */
  /**
   * A mass of overlapping squashed spheres rather than one big one: a single
   * sphere at this size reads as a balloon, and what makes a burl a burl is that
   * it is many swellings that have run together.
   */
  const bx = -0.4;
  const bz = -2.5;
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const d = i === 0 ? 0 : room.range(0.4, 1.0);
    const r = i === 0 ? 1.25 : room.range(0.5, 0.95);
    room.geo(
      'barkProp',
      ball(r, 8),
      tiltMatrix([bx + Math.cos(a) * d, room.range(0.6, 1.5), bz + Math.sin(a) * d * 0.55], [room.range(-0.3, 0.3), a, 0], [1.2, 0.95, 1.0]),
      { tile: 0.9, castShadow: true },
    );
  }
  // Growth rings running round the swelling, which is what says wood rather than
  // flesh - and this room needs saying, because the inside of it is not wood.
  for (let i = 0; i < 5; i++) {
    room.geo('root', new THREE.TorusGeometry(1.1 + i * 0.12, 0.045, 5, 16, Math.PI * 1.2), tiltMatrix([bx, 0.5 + i * 0.34, bz], [Math.PI / 2 - 0.2, 0.4 + i * 0.2, 0]), {
      tile: 0.4,
      castShadow: false,
      consume: true,
    });
  }

  /**
   * The split, and the nest inside it.
   *
   * The lips of the split stand proud and dark so the glow inside reads as
   * coming out of a hole; the nest itself is a bowl of fine cross-hatched twigs
   * with a lining of hair, and the lining is the part that is wrong.
   */
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      room.geo(
        'barkProp',
        ball(room.range(0.16, 0.3), 6),
        tiltMatrix([bx + s * (0.55 + t * 0.2), 0.55 + t * 1.25, bz + 0.9 - t * 0.3], [0, s, 0], [1.1, 1.3, 0.8]),
        { tile: 0.4, castShadow: false },
      );
    }
  }
  room.geo('surface.pulp', ball(0.78, 10), tiltMatrix([bx, 1.15, bz + 0.5], [0, 0, 0], [0.72, 1.15, 0.85]), { tile: 0.5, castShadow: false });
  // The bowl: twigs laid across each other at every angle, then hair over them.
  for (let i = 0; i < 26; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = room.range(0.16, 0.52);
    strut(
      room,
      i % 4 === 0 ? 'root' : 'vine',
      [bx + Math.cos(a) * r, 1.0 + room.range(0, 0.34), bz + 0.5 + Math.sin(a) * r * 0.8],
      [bx + Math.cos(a + room.range(1.4, 2.6)) * r, 1.0 + room.range(0, 0.34), bz + 0.5 + Math.sin(a + room.range(1.4, 2.6)) * r * 0.8],
      room.range(0.012, 0.028),
      4,
      { tile: 0.2, castShadow: false, receiveShadow: false },
    );
  }
  for (let i = 0; i < 12; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = room.range(0.05, 0.34);
    room.geo('down', quad(room.range(0.1, 0.24), room.range(0.06, 0.14)), tiltMatrix([bx + Math.cos(a) * r, 1.06 + room.range(0, 0.08), bz + 0.5 + Math.sin(a) * r * 0.8], [-Math.PI / 2 + room.range(-0.5, 0.5), a, 0]), { castShadow: false, receiveShadow: false });
  }
  // What the lining is made of, and the two small pale things at the bottom of
  // the bowl that are not eggs.
  for (let i = 0; i < 9; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = room.range(0.1, 0.4);
    room.geo('strand', cyl(0.005, 0.005, room.range(0.14, 0.4), 4), tiltMatrix([bx + Math.cos(a) * r, 1.12, bz + 0.5 + Math.sin(a) * r * 0.8], [room.range(1.2, 1.9), a, 0]), { castShadow: false, receiveShadow: false });
  }
  for (const [ox, oz] of [[-0.14, 0.05], [0.12, -0.08]] as const) {
    room.geo('bone', ball(0.085, 7), tiltMatrix([bx + ox, 1.06, bz + 0.5 + oz], [0, 0.4, 0], [0.85, 1.15, 0.85]), { tile: 0.15, castShadow: false });
  }
  room.blockCircle(bx, bz, 1.5);
  room.blockCircle(bx - 1.1, bz + 0.5, 0.6);
  room.blockCircle(bx + 1.1, bz + 0.5, 0.6);

  /* --- the rest of it ---------------------------------------------------------- */
  // Roots coming out of the ceiling and down the corners, and one running across
  // the floor that a player steps over.
  for (const [rx, rz] of [[-3.2, -3.2], [3.2, -3.0]] as const) {
    limb(room, 'root', [rx, ctx.dims.ceilingHeight, rz], [rx * 0.7, 0.1, rz * 0.5], 0.19, 0.09, 0.3, rx + rz, 6, { tile: 0.6, castShadow: true });
  }
  limb(room, 'root', [-3.6, 0.06, 1.4], [3.4, 0.05, 2.9], 0.1, 0.07, 0.4, 3, 6, { tile: 0.4, castShadow: false, receiveShadow: false });

  brackets(room, 'east', 2.6, 1.2, 3);
  brackets(room, 'west', -2.4, 1.6, 3);
  toadstools(room, -3.0, 2.4, 0.7, 7, true);
  toadstools(room, 2.4, -3.2, 0.5, 5, false);
  litter(room, 1.4, 2.6, 1.1, 9);

  // The wall is watching. Six of them, low on the west wall behind the web, and
  // they are the reason this room is the one people remember.
  wallEyes(room, 'west', 1.4, 1.5, 6, 0.8);
  foxfire(room, [-3.3, 0.35, -1.0], 0.6, 9);
  foxfire(room, [1.9, 0.3, 3.3], 0.5, 7);
  plume(room, -0.4, -1.4, 1.6, 1.5, 1.2, 'hazeSpore');

  /* --- light -------------------------------------------------------------------- */
  // A bank of gills on the south wall lights the way in, and a warm one INSIDE
  // the split lights the nest - so the burl is a dark mass with something lit at
  // the centre of it, which is the only thing this room has to say.
  const gills = gillLamp(room, 'south', 2.6, 1.7, true, 8);
  if (gills) {
    gills.castShadow = true;
    gills.shadow.mapSize.set(512, 512);
    gills.shadow.autoUpdate = false;
    gills.shadow.needsUpdate = true;
  }
  const nest = new THREE.PointLight(0xffa860, 6, ctx.dims.cellSize * 0.9, 2);
  nest.position.set(bx, 1.35, bz + 0.55);
  room.light(nest);
  const phase = room.range(0, 20);
  room.tick((t) => {
    nest.intensity = 6 * (1 + 0.13 * Math.sin(t * 0.7 + phase) + 0.05 * Math.sin(t * 2.9 + phase));
  });
  room.geo('surface.sapHot', disc(0.42, 12), tiltMatrix([bx, 1.02, bz + 0.5], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  motes(room, -0.4, -1.6, 1.4, 2.4, 12, 'spore');
  glowPool(room, bx, bz + 1.2, 2.2);
  glowPool(room, 2.4, 3.0, 2.0, 'foxWash');

  return room.finish();
}
