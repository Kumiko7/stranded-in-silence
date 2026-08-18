import * as THREE from 'three';
import { boxGeometry } from '../../../lib/build';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import {
  ball,
  brackets,
  cyl,
  eggSac,
  foxfire,
  gillLamp,
  glowPool,
  limb,
  litter,
  motes,
  plume,
  quad,
  spiderShape,
  strut,
  webCorner,
  wrapped,
} from '../kit/props';

/**
 * The Spinner's Gallery - an L of gallery that something has moved into and
 * furnished.
 *
 * Sheet web across the corners, anchor lines across the ceiling, four egg sacs
 * the size of a curled child hanging in the north-east arm, and one wrapped
 * thing at the elbow that still has an arm out of the wrapping.
 *
 * The spider is over the elbow, five metres up and mostly out of the light: what
 * you can resolve from the floor is eight legs coming down out of the dark and
 * four points of light where its eyes are. Those eyes are a legibility object as
 * much as a decoration - they have to carry across the whole L and through fog,
 * because a player's first read of this room needs to be "do not stand under
 * that" and nothing else.
 *
 * The L is what makes it work: you cannot see one arm from the other, so the
 * larder in the east arm and the two wrapped things in the south arm are two
 * separate discoveries rather than one wide shot of a set.
 */
export const spinners: RoomBlueprint = {
  id: 'heartwood.spinners',
  nameKey: 'room.heartwood.spinners',
  footprint: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'west'),
    ...wallsOn([1, 0], 'north', 'east'),
    ...wallsOn([0, 1], 'west', 'south'),
  ],
  weight: 5,
  tags: ['thicket', 'landmark'],
  anchors: {
    chest: [{ position: [10.6, 0, 3.25], rotationY: 0 }],
    locker: [{ position: [3.3, 0, 10.6], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [10.6, 0, -2.9] },
      { position: [-2.9, 0, 10.9] },
      { position: [9.2, 0.64, 1.9] },
      { position: [7.2, 0, 2.7] },
    ],
    patrolPoint: [
      { position: [-0.6, 0, -0.6] },
      { position: [9.4, 0, 0.6] },
      { position: [0.6, 0, 9.4] },
      { position: [1.6, 0, 2.2] },
    ],
    enemySpawn: [{ position: [10.8, 0, 1.4] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, spinners);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'loam',
    wall: 'bark',
    ceiling: 'web',
    band: 'bark',
    bandHeight: 0.5,
    register: 'weep',
    mouth: 'grown',
    ports: [
      { cell: [1, 0], side: 'south', kind: 'webbed' },
      { cell: [0, 1], side: 'east', kind: 'webbed' },
    ],
  });

  /* --- the web --------------------------------------------------------------- */
  // Sheet in the corners rather than across the room: a curtain right across a
  // gallery blocks the one thing the gallery is for, and at any distance reads as
  // a flat grey rectangle floating in it (docs/art/ROOM_REVIEW.md).
  webCorner(room, -3.0, 2.3, -3.0, 2.2, 0.8, 3);
  webCorner(room, 11.0, 2.5, -3.0, 2.0, -2.4, 2);
  webCorner(room, -3.0, 2.4, 11.0, 2.0, 2.2, 2);
  webCorner(room, 3.3, 2.7, 3.3, 2.0, -0.8, 2);

  /**
   * The anchor lines. Sixty of them across the whole L, unlit `strand` so a
   * single thread survives being in the dark, and all of them running BETWEEN
   * fixed points rather than at random angles - a web is a structure, and lines
   * that do not meet anything read as scratches on the lens.
   */
  const nodes: readonly [number, number, number][] = [
    [-3.2, 3.0, -3.2],
    [3.2, 3.1, -3.4],
    [11.0, 2.9, -3.2],
    [11.2, 2.7, 3.2],
    [3.4, 3.2, 3.4],
    [-3.2, 2.8, 3.0],
    [-3.4, 3.0, 10.8],
    [3.2, 2.6, 11.0],
    [7.0, 3.0, 0.4],
    [0.4, 3.0, 7.0],
  ];
  for (let i = 0; i < nodes.length; i++) {
    for (let k = i + 1; k < nodes.length; k++) {
      const a = nodes[i];
      const b = nodes[k];
      if (!a || !b) continue;
      const d = Math.hypot(a[0] - b[0], a[2] - b[2]);
      // Only the SHORT spans. The first pass allowed anything under nine metres
      // and the result was a dozen full-length lines crossing the whole L, which
      // at any brightness read as laser beams rather than as thread.
      if (d > 5.5 || d < 1) continue;
      strut(room, 'strand', a, b, 0.008, 4, { tile: 0.4, castShadow: false, receiveShadow: false });
    }
  }
  // Drop lines with things on the end of them, hanging into the walking space.
  for (let i = 0; i < 9; i++) {
    const hx = room.range(-3.0, 10.6);
    const hz = hx > 4 ? room.range(-3.2, 3.2) : room.range(-3.2, 10.6);
    const drop = room.range(0.5, 1.7);
    room.geo('strand', cyl(0.008, 0.008, drop, 4), poseMatrix([hx, ceilingHeight - drop / 2 - 0.1, hz]), { castShadow: false, receiveShadow: false });
    room.geo('carapacePale', ball(room.range(0.05, 0.13), 6), tiltMatrix([hx, ceilingHeight - drop - 0.1, hz], [0, i, 0], [0.9, 1.4, 0.9]), { tile: 0.2, castShadow: false });
  }

  /* --- the larder ------------------------------------------------------------ */
  // Egg sacs in the north-east arm, hung at four heights so the cluster has a
  // shape. There are always more than you first counted.
  eggSac(room, 8.6, 2.2, -2.6, 0.36);
  eggSac(room, 9.6, 1.8, -1.8, 0.28);
  eggSac(room, 8.2, 2.6, -1.2, 0.22);
  eggSac(room, 10.4, 2.0, -3.0, 0.32);
  eggSac(room, 7.4, 2.4, -3.1, 0.19);
  // One split open, low, with the husk still on it.
  room.geo('carapacePale', ball(0.34, 8), tiltMatrix([9.2, 0.3, 1.9], [0, 0.6, 0], [1, 0.8, 1]), { tile: 0.3, castShadow: true });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    room.geo('carapacePale', quad(0.24, 0.34), tiltMatrix([9.2 + Math.cos(a) * 0.3, 0.42, 1.9 + Math.sin(a) * 0.3], [-0.7, -a, 0]), { castShadow: false, receiveShadow: false });
  }
  room.blockCircle(9.2, 1.9, 0.34);

  // The wrapped one, at the elbow, where both arms can see it.
  wrapped(room, 2.6, 2.4, ceilingHeight - 0.15, 1.7);
  // And two more that are further along, in the corner of the south arm.
  wrapped(room, -2.7, 8.4, ceilingHeight - 0.3, 1.3);

  /* --- the spinner ----------------------------------------------------------- */
  /**
   * Over the elbow. Nothing here is animated: what makes it frightening is that
   * it is holding still.
   *
   * It hangs at 2.45 m rather than tucked up under the ceiling, and it is the
   * size it is because of the contact sheet: at 0.62 scale and 2.85 m it was
   * above every sight line in the room and behind the ceiling's own web, so the
   * one object the whole gallery is built around did not appear in a single
   * doorway view. A silhouette that is not in frame is not a silhouette.
   */
  spiderShape(room, 1.9, 1.9, ceilingHeight - 0.95, 0.8, 8);

  /* --- the gallery itself ---------------------------------------------------- */
  // Roots and boughs crossing overhead, so the web has something to be strung
  // between and the ceiling is not a flat lid with string on it.
  for (const [ax, az, bx2, bz2] of [
    [-3.6, -3.2, 3.4, 3.6],
    [11.4, -1.4, 4.0, 3.6],
    [-3.6, 4.4, 2.0, 11.4],
    [3.6, -3.4, 10.8, 2.2],
  ] as const) {
    limb(room, 'root', [ax, ceilingHeight - 0.34, az], [bx2, ceilingHeight - 0.95, bz2], 0.15, 0.09, 0.45, ax + az, 6, { tile: 0.7, castShadow: true });
  }

  brackets(room, 'north', -2.8, 1.3, 3);
  brackets(room, 'west', 9.6, 1.5, 3, [0, 1]);
  litter(room, 6.6, 2.4, 1.4, 12);
  litter(room, -2.2, 5.6, 1.4, 11);
  litter(room, 9.8, -1.0, 1.2, 9);
  foxfire(room, [-2.6, 0.3, 1.4], 0.9, 10);
  foxfire(room, [10.2, 0.3, 0.8], 0.8, 9);
  foxfire(room, [0.6, 0.3, 9.6], 0.9, 10);
  plume(room, 2.0, 2.0, 0.5, 1.9, 1.8, 'hazeMist');
  motes(room, 1.0, 1.0, 3.0, 2.8, 20, 'dust');
  motes(room, 9.0, 0.4, 2.4, 2.6, 14, 'spore');
  motes(room, 0.4, 9.0, 2.4, 2.6, 14, 'dust');

  // Husks on the floor under the larder: legs, shells, and the parts that are
  // not eaten. Flat and collider-free, because this arm has to stay walkable.
  for (let i = 0; i < 16; i++) {
    const hx = 7.0 + room.range(-1.6, 3.2);
    const hz = room.range(-3.4, 2.6);
    if (i % 3 === 0) {
      room.geo('chitin', cyl(0.012, 0.022, room.range(0.2, 0.5), 4), tiltMatrix([hx, 0.03, hz], [Math.PI / 2 + room.range(-0.2, 0.2), room.range(0, 3), 0]), { tile: 0.2, castShadow: false, receiveShadow: false });
    } else {
      room.geo('carapacePale', ball(room.range(0.05, 0.13), 6), tiltMatrix([hx, 0.02, hz], [0, i, 0], [1.3, 0.4, 1.0]), { tile: 0.2, castShadow: false, receiveShadow: false });
    }
  }
  // A ring of silk trodden flat where a path has been worn round the elbow. Even
  // this uses the floor as its canvas: the room needs its middle to stay open.
  for (let i = 0; i < 5; i++) {
    room.geo('silkProp', quad(room.range(0.8, 1.6), room.range(0.6, 1.2)), tiltMatrix([room.range(0.6, 3.3), 0.016, room.range(0.6, 3.3)], [-Math.PI / 2, room.range(0, 3), 0]), { castShadow: false, receiveShadow: false });
  }

  /* --- light ------------------------------------------------------------------ */
  // Four lamps for three cells, all of them cold, and all of them low: what has
  // to read in this room is silk, which catches a grazing light and vanishes
  // under a flat one.
  const first = gillLamp(room, 'north', 2.2, 1.5, true, 11);
  if (first) {
    first.castShadow = true;
    first.shadow.mapSize.set(512, 512);
    first.shadow.autoUpdate = false;
    first.shadow.needsUpdate = true;
  }
  gillLamp(room, 'east', -1.6, 1.7, true, 10, [1, 0]);
  gillLamp(room, 'south', -2.0, 1.6, true, 10, [0, 1]);

  // The fourth is warm, behind the spinner, so the legs come down as silhouettes
  // rather than as lit sticks. It is also the only warm thing in the room.
  /**
   * Under and behind the spinner, near the floor.
   *
   * The first attempt hung a lit panel on the far side of it to silhouette it
   * against - which worked, and read as a glowing orange window floating in the
   * middle of the room, because the corner cell has no far wall: both of its
   * remaining edges are interior. Lighting the FLOOR instead gives the same
   * silhouette and underlights the legs, which is better anyway.
   */
  const behind = new THREE.PointLight(0xffb478, 9, ctx.dims.cellSize * 1.25, 2);
  behind.position.set(1.0, 0.55, 3.3);
  room.light(behind);
  const phase = room.range(0, 20);
  room.tick((t) => {
    behind.intensity = 9 * (1 + 0.1 * Math.sin(t * 0.42 + phase));
  });
  // What is burning down there: a bleed of sap that has run out of the floor.
  for (let i = 0; i < 4; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = i === 0 ? 0 : room.range(0.25, 0.7);
    room.geo('surface.sapHot', quad(room.range(0.4, 0.9), room.range(0.4, 0.9)), tiltMatrix([1.0 + Math.cos(a) * d, 0.016 + i * 0.0006, 3.3 + Math.sin(a) * d], [-Math.PI / 2, a, 0]), { castShadow: false, receiveShadow: false });
  }

  glowPool(room, -2.6, 1.4, 2.4, 'foxWash');
  glowPool(room, 10.0, 0.6, 2.2, 'foxWash');
  glowPool(room, 0.6, 9.4, 2.4, 'foxWash');
  glowPool(room, 1.0, 3.3, 3.0);

  return room.finish();
}
