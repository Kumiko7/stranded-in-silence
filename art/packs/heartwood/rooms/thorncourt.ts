import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import {
  ball,
  bloomFlower,
  carvedPanel,
  cyl,
  disc,
  faeFigure,
  glowPool,
  limb,
  litter,
  motes,
  plume,
  quad,
  ring,
  strut,
  vineFall,
} from '../kit/props';

/**
 * The Thorn Court - the largest room in Heartwood, and the one it is all for.
 *
 * A ring of nine standing figures round a throne of thorn, in a hall the Bower
 * built and the Bloom finished. The figures are bound twig and antler wearing
 * wooden masks, and they are all facing the throne. The throne is empty. Whatever
 * used to sit in it has grown into the floor behind it and come up through the
 * boards as a flower two metres across.
 *
 * Everything here is violet, which is the map's third temperature and belongs to
 * neither half of it. Two rooms in twenty-two use this colour. That is the entire
 * reason it works.
 *
 * The room is a 2x2, so it is placed at most once per map: it is a set piece and
 * a landmark, and a team that finds it will remember where it was.
 */
export const thornCourt: RoomBlueprint = {
  id: 'heartwood.thorncourt',
  nameKey: 'room.heartwood.thorncourt',
  footprint: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'west'),
    ...wallsOn([1, 0], 'north'),
    ...wallsOn([0, 1], 'south'),
    ...wallsOn([1, 1], 'east', 'south'),
  ],
  weight: 4,
  tags: ['bloom', 'landmark'],
  anchors: {
    chest: [
      { position: [-3.2, 0, 5.4], rotationY: -Math.PI / 2 },
      { position: [11.3, 0, 2.6], rotationY: Math.PI / 2 },
    ],
    locker: [{ position: [4.6, 0, -3.3], rotationY: Math.PI }],
    itemSpawn: [
      { position: [4.0, 0.57, 4.15] },
      { position: [-2.8, 0, -2.8] },
      { position: [11.0, 0, 10.8] },
      { position: [0.4, 0, 10.9] },
    ],
    patrolPoint: [
      { position: [0.4, 0, 0.4] },
      { position: [8.0, 0, 0.6] },
      { position: [0.6, 0, 8.0] },
      { position: [8.0, 0, 8.0] },
    ],
    enemySpawn: [{ position: [11.0, 0, -3.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, thornCourt);
  room.shell({
    floor: 'parquet',
    wall: 'bloom',
    ceiling: 'vault',
    band: 'lattice',
    bandHeight: 1.25,
    register: 'bloomvein',
    mouth: 'carved',
    ports: [
      { cell: [1, 0], side: 'east', kind: 'niche', light: true },
      { cell: [0, 1], side: 'west', kind: 'niche' },
    ],
  });

  const CX = 4.0;
  const CZ = 4.0;

  /* --- the ring ------------------------------------------------------------------ */
  /**
   * Nine figures on a circle of radius 2.15 about the middle of the room, all of
   * them facing in. The radius is not arbitrary: a 2x2 offering six edges has to
   * keep the strips `|x| < 1.5`, `|x - 8| < 1.5`, `|z| < 1.5` and `|z - 8| < 1.5`
   * walkable, and the disc between them is exactly what is left.
   */
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const fx = CX + Math.cos(a) * 2.15;
    const fz = CZ + Math.sin(a) * 2.15;
    /**
     * Facing the throne. A prop authored facing -Z points along
     * `(sin y, -cos y)`, so the yaw that turns one toward a point is
     * `atan2(dx, -dz)` and NOT `atan2(dx, dz)` - get that backwards and you get
     * a ring of nine figures all facing carefully outward at the walls, which
     * validates perfectly and is a different room.
     */
    faeFigure(room, fx, fz, Math.atan2(CX - fx, fz - CZ), room.range(1.7, 2.05), i % 3 !== 1);
    // A low plinth under each, so the ring reads as placed rather than as grown.
    room.geo('timberDark', cyl(0.32, 0.38, 0.1, 10), poseMatrix([fx, 0.05, fz]), { tile: 0.2, castShadow: false });
    room.geo('surface.bloomVein', ring(0.34, 0.02, 12), tiltMatrix([fx, 0.11, fz], [Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  }
  // The circle inlaid in the floor that the plinths stand on, laid additively so
  // it lightens the parquet rather than painting a disc on it.
  room.geo('bloomWash', disc(2.85, 24), tiltMatrix([CX, 0.014, CZ], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    room.box('surface.bloomVein', [0.16, 0.008, 0.05], [CX + Math.cos(a) * 2.62, 0.012, CZ + Math.sin(a) * 2.62], -a, { castShadow: false, receiveShadow: false });
  }

  /* --- the throne ---------------------------------------------------------------- */
  /**
   * A high seat of thorn: a back of forty interlaced canes rising to a point, two
   * arms, and a seat that is a slab of heartwood the court clearly put there
   * afterwards. The canes are what carry it, so they are sampled as kinked limbs
   * rather than as straight sticks.
   */
  room.solid('timberDark', [1.35, 0.46, 1.1], [CX, 0, CZ + 0.15], 0, { tile: 0.5, castShadow: true });
  room.box('surface.heart', [1.5, 0.09, 1.25], [CX, 0.46, CZ + 0.15], 0, { tile: 0.4, castShadow: true });
  for (let i = 0; i < 22; i++) {
    const t = i / 21;
    const spread = (t - 0.5) * 2;
    const top = 2.2 - Math.abs(spread) * 1.05;
    limb(
      room,
      'root',
      [CX + spread * 0.68, 0.5, CZ + 0.62],
      [CX + spread * 1.15, top, CZ + 0.45 - Math.abs(spread) * 0.2],
      0.045,
      0.02,
      0.12,
      i * 2.7,
      5,
      { tile: 0.3, castShadow: true },
    );
  }
  // Thorns on the canes. Short, backward-pointing, and there are a lot of them.
  for (let i = 0; i < 34; i++) {
    const t = room.range(-1, 1);
    const y = room.range(0.6, 2.0 - Math.abs(t) * 0.9);
    room.geo('bone', cyl(0.004, 0.022, 0.13, 4), tiltMatrix([CX + t * room.range(0.7, 1.15), y, CZ + 0.55], [room.range(1.8, 2.6), room.range(0, 3), 0]), { castShadow: false, receiveShadow: false });
  }
  for (const s of [-1, 1]) {
    limb(room, 'root', [CX + s * 0.72, 0.5, CZ - 0.4], [CX + s * 0.78, 0.86, CZ + 0.6], 0.06, 0.05, 0.06, s * 9, 4, { tile: 0.3, castShadow: true });
    room.geo('bone', ball(0.075, 7), poseMatrix([CX + s * 0.78, 0.9, CZ - 0.42]), { tile: 0.1, castShadow: false });
  }
  room.blockCircle(CX, CZ + 0.2, 0.95);

  /**
   * What is coming up behind it. One flower two metres across, growing out of the
   * boards, with the parquet lifted and split around its foot - which is the
   * detail that says it came up through the floor rather than being put there.
   */
  bloomFlower(room, CX, 0.9, CZ + 1.9, 0.95, [0.35, 0.4, 0]);
  room.geo('bloomFlesh', cyl(0.22, 0.34, 0.95, 10), poseMatrix([CX, 0.42, CZ + 1.9]), { tile: 0.3, castShadow: true });
  room.blockCircle(CX, CZ + 1.9, 0.42);
  for (let i = 0; i < 9; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = room.range(0.45, 1.3);
    // Boards levered up round it, standing on end.
    room.geo('surface.parquet', quad(room.range(0.2, 0.5), room.range(0.3, 0.7)), tiltMatrix([CX + Math.cos(a) * d, room.range(0.06, 0.22), CZ + 1.9 + Math.sin(a) * d], [room.range(-1.2, -0.4), a, 0]), { tile: 0.4, castShadow: false });
    room.geo('surface.bloomVein', cyl(0.02, 0.035, room.range(0.4, 1.1), 4), tiltMatrix([CX + Math.cos(a) * d * 0.8, 0.06, CZ + 1.9 + Math.sin(a) * d * 0.8], [Math.PI / 2, a, 0]), { castShadow: false, receiveShadow: false });
  }
  // Smaller blooms out along the cracks, getting sparser toward the walls.
  for (let i = 0; i < 12; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = room.range(2.0, 5.2);
    bloomFlower(room, CX + Math.cos(a) * d, 0.02, CZ + Math.sin(a) * d, room.range(0.1, 0.24));
  }

  /* --- the hall itself ------------------------------------------------------------ */
  // Columns at the four inner corners of the 2x2, which is the one place in a
  // four-cell room that is guaranteed clear of every door lane.
  // Off the 1.6 grid on purpose: a column at 1.6 blocks out to 2.16 once the
  // flood fill has walked a 0.32 m circle round it, and the north and south door
  // lanes need |x| < 1.5 walkable for the whole run.
  for (const [px, pz] of [[2.15, 2.15], [5.85, 2.15], [2.15, 5.85], [5.85, 5.85]] as const) {
    room.geo('timber', cyl(0.17, 0.22, 2.5, 9), poseMatrix([px, 1.25, pz]), { tile: 0.6, castShadow: true });
    room.geo('timberDark', cyl(0.26, 0.2, 0.18, 9), poseMatrix([px, 2.59, pz]), { tile: 0.2, castShadow: false });
    room.geo('timberDark', cyl(0.24, 0.3, 0.16, 9), poseMatrix([px, 0.08, pz]), { tile: 0.2, castShadow: false });
    // The Bloom has got into the columns too: a vein up each one and a rosette
    // at the capital.
    limb(room, 'surface.bloomVein', [px + 0.16, 0.2, pz], [px + 0.1, 2.5, pz + 0.16], 0.025, 0.012, 0.12, px + pz, 5, { castShadow: false, receiveShadow: false });
    bloomFlower(room, px, 2.62, pz, 0.14);
    room.blockCircle(px, pz, 0.24);
    // A hanging lamp bracket between each pair, and the ribbons tied to it.
    strut(room, 'copper', [px, 2.75, pz], [CX, 2.95, CZ], 0.014, 4, { castShadow: false, receiveShadow: false });
    // Ribbons tied to the rib, half of them rotted through.
    for (let k = 0; k < 3; k++) {
      const t = 0.25 + k * 0.22;
      room.geo('weave', quad(0.07, room.range(0.2, 0.5)), tiltMatrix([px + (CX - px) * t, 2.75 + 0.2 * t - 0.12, pz + (CZ - pz) * t], [0, room.range(0, 3), room.range(-0.3, 0.3)]), { castShadow: false, receiveShadow: false });
    }
  }
  // The boss the four ribs meet at, and one bloom hanging out of it.
  room.geo('timberDark', ball(0.2, 9), tiltMatrix([CX, 2.95, CZ], [0, 0, 0], [1, 0.6, 1]), { tile: 0.2, castShadow: false });
  bloomFlower(room, CX, 2.78, CZ, 0.24, [Math.PI, 0, 0]);

  for (const [side, along, cell] of [
    ['north', -2.4, [0, 0]],
    ['north', 2.4, [1, 0]],
    ['south', -2.4, [1, 1]],
    ['south', 2.4, [0, 1]],
  ] as const) {
    carvedPanel(room, side, along, 1.55, 1.8, 1.2, 2, cell);
  }
  vineFall(room, -3.3, -3.3, 0.6, 5, 'tendril', false);
  vineFall(room, 11.3, 11.3, 0.6, 5, 'tendril', false);
  litter(room, -2.6, 9.6, 1.2, 9);
  litter(room, 9.8, -2.2, 1.2, 9);
  plume(room, CX, CZ + 1.9, 1.6, 1.8, 2.0, 'hazeBloom');
  motes(room, CX, CZ, 3.2, 2.9, 26, 'bloom');
  motes(room, 9.6, 9.6, 2.2, 2.6, 12, 'bloom');

  /* --- light ------------------------------------------------------------------------ */
  /**
   * Four lamps for four cells, and three of them are violet - which is the only
   * place in the map that colour is a practical rather than an emissive. The
   * fourth is warm, low, behind the throne, so the ring of figures is rimmed from
   * the middle and every one of them throws outward at a player standing in a
   * doorway.
   */
  const centre = new THREE.PointLight(0xc878f0, 9, ctx.dims.cellSize * 1.6, 2);
  // At eye height rather than up in the vault: the first pass had it at 2.35 and
  // the brightest thing in the room was a violet patch on the ceiling, with the
  // ring of figures it was meant to light left as flat shapes.
  centre.position.set(CX, 1.15, CZ);
  room.shadowLight(centre, 512);
  const phase = room.range(0, 20);
  room.tick((t) => {
    centre.intensity = 9 * (1 + 0.14 * Math.sin(t * 0.38 + phase) + 0.05 * Math.sin(t * 1.1 + phase * 1.3));
  });

  const bloomLamp = new THREE.PointLight(0xd07cff, 7, ctx.dims.cellSize * 1.3, 2);
  bloomLamp.position.set(CX, 1.5, CZ + 2.9);
  room.light(bloomLamp);
  room.tick((t) => {
    bloomLamp.intensity = 7 * (1 + 0.18 * Math.sin(t * 0.29 + phase * 1.7));
  });

  const hearthGlow = new THREE.PointLight(0xffa860, 6, ctx.dims.cellSize * 1.2, 2);
  hearthGlow.position.set(9.6, 1.4, 9.6);
  room.light(hearthGlow);
  room.tick((t) => {
    hearthGlow.intensity = 6 * (1 + 0.12 * Math.sin(t * 3.9 + phase));
  });
  // What that warm one is: a fire somebody lit in the far corner and left. It is
  // the only thing in this room that a person did recently.
  room.geo('stone', cyl(0.6, 0.7, 0.24, 12, true), poseMatrix([9.6, 0.12, 9.6]), { tile: 0.3, castShadow: true });
  room.geo('earth', disc(0.55, 12), tiltMatrix([9.6, 0.24, 9.6], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  for (let i = 0; i < 6; i++) {
    room.geo('rotProp', cyl(0.05, 0.065, room.range(0.4, 0.7), 5), tiltMatrix([9.6 + room.range(-0.2, 0.2), 0.3, 9.6 + room.range(-0.2, 0.2)], [Math.PI / 2, room.range(0, 3), 0]), { tile: 0.2, castShadow: false });
  }
  for (let i = 0; i < 7; i++) {
    room.geo('lumenSap', ball(room.range(0.03, 0.07), 5), poseMatrix([9.6 + room.range(-0.32, 0.32), room.range(0.28, 0.42), 9.6 + room.range(-0.32, 0.32)]), { castShadow: false, receiveShadow: false });
  }
  room.blockCircle(9.6, 9.6, 0.68);

  glowPool(room, CX, CZ, 3.6, 'bloomWash');
  glowPool(room, CX, CZ + 2.4, 2.4, 'bloomWash');
  glowPool(room, 9.6, 9.6, 2.4);
  glowPool(room, 0.4, 0.4, 2.0, 'bloomWash');

  return room.finish();
}
