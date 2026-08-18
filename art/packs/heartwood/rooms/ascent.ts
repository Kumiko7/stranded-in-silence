import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import {
  ball,
  basket,
  bench,
  candles,
  carvedPanel,
  disc,
  glowPool,
  hanging,
  litter,
  mossPatch,
  motes,
  hangingLantern,
  mothLantern,
  phial,
  post,
  pot,
  quad,
  strut,
  vineFall,
} from '../kit/props';

/**
 * The Spiral Ascent - twenty-four metres of gallery with the great stair running
 * up one side of it and out through the ceiling.
 *
 * The flight is scenery, not a route: there is no vertical movement in this
 * engine, so what a stair is for here is a silhouette to walk the length of and
 * a hole in the roof to put a light in. The bottom of it is closed off with a
 * fallen bough and a rope, which is the honest way to say so - and the top of it
 * is the only place in the map you can see out of the room you are standing in.
 *
 * The gallery west of the balustrade is the widest continuous floor in the pack
 * and it is deliberately near-empty: a long sight line down a lit colonnade is
 * the one thing a maze of eight-metre boxes cannot give you, and it is worth a
 * whole set piece.
 */
export const ascent: RoomBlueprint = {
  id: 'heartwood.ascent',
  nameKey: 'room.heartwood.ascent',
  footprint: [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
  doorWalls: [
    ...wallsOn([0, 0], 'north', 'west', 'east'),
    ...wallsOn([0, 1], 'west'),
    ...wallsOn([0, 2], 'south', 'west'),
  ],
  weight: 6,
  tags: ['bower', 'entrance', 'landmark'],
  anchors: {
    chest: [
      { position: [-3.2, 0, 4.6], rotationY: -Math.PI / 2 },
      { position: [-3.2, 0, 11.6], rotationY: -Math.PI / 2 },
    ],
    locker: [
      { position: [-3.3, 0, -2.6], rotationY: -Math.PI / 2 },
      { position: [-3.3, 0, 18.6], rotationY: -Math.PI / 2 },
    ],
    itemSpawn: [
      { position: [-2.35, 0.5, 2.4] },
      { position: [2.4, 0.36, 6.05] },
      { position: [-3.5, 1.34, 14.0] },
      { position: [0.4, 0, 19.2] },
    ],
    playerSpawn: [
      { position: [-1.0, 0, 1.2], rotationY: Math.PI },
      { position: [0.6, 0, 1.2], rotationY: Math.PI },
      { position: [-1.0, 0, 3.0], rotationY: Math.PI },
      { position: [0.6, 0, 3.0], rotationY: Math.PI },
    ],
    patrolPoint: [
      { position: [-0.6, 0, 0.4] },
      { position: [-0.6, 0, 8.0] },
      { position: [-0.6, 0, 15.0] },
      { position: [1.0, 0, 19.0] },
    ],
    enemySpawn: [{ position: [-3.0, 0, 16.4] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, ascent);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'parquet',
    wall: 'heart',
    ceiling: 'rafters',
    band: 'plank',
    bandHeight: 1.15,
    rail: true,
    register: 'sapline',
    mouth: 'carved',
    ports: [
      { cell: [0, 1], side: 'east', kind: 'knothole', scene: 'hollow', tall: true },
      { cell: [0, 2], side: 'east', kind: 'knothole', scene: 'canopy', tall: true },
    ],
  });

  /* --- the flight -------------------------------------------------------------- */
  /**
   * Sixteen steps rising 2.6 m over seven metres, then a landing, then a hole in
   * the ceiling. Each step is a tread with a nosing and a riser under it - three
   * boxes, because a stair built from single slabs reads as a ramp with lines
   * drawn on it.
   */
  const STAIR_X = 2.45;
  const startZ = 5.2;
  const steps = 16;
  const going = 0.44;
  const rise = 0.163;
  for (let i = 0; i < steps; i++) {
    const z = startZ + i * going;
    const y = i * rise;
    room.box('surface.plank', [2.1, 0.06, going + 0.06], [STAIR_X, y + rise - 0.06, z], 0, { tile: 0.6 });
    room.box('timber', [2.1, rise - 0.06, going], [STAIR_X, y, z], 0, { tile: 0.4 });
    room.box('timberDark', [2.1, 0.03, 0.05], [STAIR_X, y + rise - 0.09, z - going / 2 - 0.02], 0, { tile: 0.2 });
  }
  // The string board carrying the outer end of the treads, cut to the rake.
  for (let i = 0; i < steps; i++) {
    const z = startZ + i * going;
    room.box('timberDark', [0.1, 0.42, 0.46], [1.36, Math.max(0, i * rise - 0.3), z], 0, { tile: 0.3 });
  }
  const topY = steps * rise;
  // The landing, and the flight going on up through the ceiling out of sight.
  const landingZ = startZ + steps * going + 0.6;
  room.box('surface.plank', [2.1, 0.08, 1.7], [STAIR_X, topY, landingZ], 0, { tile: 0.6, castShadow: true });
  room.box('timber', [2.1, topY, 1.7], [STAIR_X, 0, landingZ], 0, { tile: 0.6 });
  for (let i = 0; i < 4; i++) {
    const z = landingZ + 0.9 + i * going;
    room.box('surface.plank', [2.1, 0.06, going + 0.06], [STAIR_X, topY + (i + 1) * rise, z], 0, { tile: 0.6 });
    room.box('timber', [2.1, rise, going], [STAIR_X, topY + i * rise, z], 0, { tile: 0.4 });
  }
  // The well the flight goes up through: a lipped hole in the ceiling with the
  // underside of the next flight showing in it.
  const wellZ = landingZ + 1.8;
  for (const [dx, dz, w, d] of [
    [0, -1.0, 2.6, 0.2],
    [0, 1.0, 2.6, 0.2],
    [-1.2, 0, 0.2, 2.2],
    [1.2, 0, 0.2, 2.2],
  ] as const) {
    room.box('timberDark', [w, 0.26, d], [STAIR_X + dx, ceilingHeight - 0.26, wellZ + dz], 0, { tile: 0.4 });
  }
  room.box('timber', [2.2, 0.1, 1.9], [STAIR_X, ceilingHeight + 0.02, wellZ], 0, { tile: 0.5 });
  // The stair is one solid mass to the player: there is no climbing in this game,
  // so pretending otherwise is a snag rather than a feature.
  room.collider({ kind: 'box', center: [STAIR_X, 10.3], halfExtents: [1.14, 5.75] });

  /* --- the balustrade ---------------------------------------------------------- */
  /**
   * Turned spindles standing on the rake with a handrail over them, and a newel
   * at the foot and at the landing. This is the piece the eye actually follows
   * down the gallery, so it is sampled per step rather than as a few long boxes.
   */
  const treadY = (z: number): number => Math.min(topY, Math.max(0, (z - startZ) / going) * rise);
  const RAIL = 0.95;
  for (let i = 0; i <= steps + 3; i++) {
    const z = startZ - 0.2 + i * going;
    const base = treadY(z);
    post(room, 'timberPale', 0.026, 0.034, RAIL - 0.1, [1.36, base, z], 6, { tile: 0.2 });
    // A bulge halfway up each spindle: a plain taper is a dowel, and a rail of
    // forty dowels is a fence.
    room.geo('timberPale', ball(0.052, 7), tiltMatrix([1.36, base + RAIL * 0.42, z], [0, 0, 0], [1, 0.75, 1]), { tile: 0.1, castShadow: false });
  }
  for (let i = 0; i < steps + 3; i++) {
    const z0 = startZ - 0.2 + i * going;
    const z1 = z0 + going;
    strut(room, 'timber', [1.36, treadY(z0) + RAIL, z0], [1.36, treadY(z1) + RAIL, z1], 0.045, 7, { tile: 0.3, castShadow: true });
  }
  for (const nz of [startZ - 0.45, landingZ + 0.5]) {
    const base = treadY(nz);
    post(room, 'timberDark', 0.085, 0.115, RAIL + 0.42, [1.36, base, nz], 8, { tile: 0.4, castShadow: true });
    room.geo('timberDark', ball(0.13, 8), tiltMatrix([1.36, base + RAIL + 0.44, nz], [0, 0, 0], [1, 0.5, 1]), { tile: 0.1, castShadow: false });
    room.geo('bone', ball(0.12, 8), tiltMatrix([1.36, base + RAIL + 0.54, nz], [0, 0, 0], [1, 1.2, 1]), { tile: 0.2, castShadow: false });
  }

  /* --- the closure at the foot -------------------------------------------------- */
  // A fallen bough across the bottom three steps and a rope hung off two hooks.
  // This is the room telling you, honestly, that the stair is not a way out.
  strut(room, 'root', [1.2, 0.5, startZ - 0.2], [3.5, 0.9, startZ + 1.4], 0.16, 7, { tile: 0.6, castShadow: true });
  for (let i = 0; i < 4; i++) {
    strut(room, 'root', [1.6 + i * 0.5, 0.62 + i * 0.08, startZ + 0.1 + i * 0.35], [1.4 + i * 0.6, 1.3 + i * 0.12, startZ - 0.5 + i * 0.4], 0.045, 5, { tile: 0.3 });
  }
  for (const s of [0, 1]) {
    room.box('iron', [0.06, 0.06, 0.06], [1.36, 1.05, startZ - 0.4 + s * 1.2], 0, { tile: 0.1 });
  }
  for (let i = 0; i < 5; i++) {
    const t0 = i / 5;
    const t1 = (i + 1) / 5;
    strut(
      room,
      'weave',
      [1.36, 1.05 - Math.sin(t0 * Math.PI) * 0.28, startZ - 0.4 + t0 * 1.2],
      [1.36, 1.05 - Math.sin(t1 * Math.PI) * 0.28, startZ - 0.4 + t1 * 1.2],
      0.016,
      5,
      { tile: 0.2, castShadow: false },
    );
  }

  /* --- the gallery --------------------------------------------------------------- */
  // Deliberately sparse. Everything is against the west wall or in the corners,
  // because all three cells offer their west edge and the lanes at z = 0, 8 and
  // 16 have to stay open for the whole run.
  bench(room, -2.35, 2.4, 1.6, Math.PI / 2, 0.5);
  bench(room, -2.35, 13.6, 1.6, Math.PI / 2, 0.5);
  for (const cz of [4.6, 11.6]) {
    pot(room, -3.4, 0, cz - 1.5, 0.22, 0.42);
  }
  basket(room, -2.6, 6.4, 0.28, 0.42, false);
  basket(room, -3.2, 6.9, 0.2, 0.28, true);
  basket(room, 0.4, 19.2, 0.3, 0.44, false);

  // A row of carved panels down the west wall between the doorways: this is the
  // Bower's storytelling and a 24 m corridor is where it belongs.
  for (const [cz, along] of [
    [0, 2.4],
    [8, -2.4],
    [8, 2.4],
    [16, -2.4],
  ] as const) {
    carvedPanel(room, 'west', cz + along, 1.5, 1.7, 1.1, 2);
  }
  hanging(room, 'north', -2.3, 1.5, 1.4, 1.6, 'weaveGreen');
  hanging(room, 'south', 2.3, 1.5, 1.4, 1.6, 'weave', [0, 2]);

  // A shelf near the top with lamp phials on it, and one that has been knocked
  // off and broken on the boards under it.
  room.box('timber', [0.3, 0.05, 1.6], [-3.5, 1.28, 14.0], 0, { tile: 0.3 });
  for (let i = 0; i < 4; i++) {
    phial(room, -3.5, 1.33, 13.4 + i * 0.36, 0.05, 0.17, i === 0 || i === 2);
  }
  for (let i = 0; i < 6; i++) {
    room.geo('itemGlass', ball(room.range(0.02, 0.045), 5), tiltMatrix([-3.2 + room.range(-0.3, 0.3), 0.03, 14.4 + room.range(-0.4, 0.4)], [0, i, 0], [1.4, 0.4, 1.1]), { castShadow: false, receiveShadow: false });
  }
  room.geo('surface.sap', disc(0.42, 12), tiltMatrix([-3.2, 0.014, 14.4], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });

  mossPatch(room, -3.4, 0.02, 9.6, 0.9, 6);
  mossPatch(room, 3.5, 0.02, 1.4, 0.8, 5);
  litter(room, -1.6, -3.2, 0.9, 7);
  litter(room, 0.6, 17.6, 1.0, 8);
  vineFall(room, 3.4, 19.0, 0.6, 5);
  vineFall(room, -3.4, -3.2, 0.5, 4);

  /* --- light --------------------------------------------------------------------- */
  // Four lamps for three cells, which this room actually needs: a 24 m gallery lit
  // from two points has black ends a player cannot find the doors in, and the
  // stair has to read as a rake all the way up.
  // Two of the three are HUNG over the middle of the gallery rather than
  // bracketed to the west wall. The first pass had all three on the wall and the
  // room came back as twenty-four metres of black with a lit skirting board: a
  // wall lamp lights the wall it is on, and what has to read here is a stair
  // seven metres away from it (docs/art/ROOM_REVIEW.md).
  const low = mothLantern(room, 'west', -2.2, 2.2, true, 13);
  if (low) {
    low.castShadow = true;
    low.shadow.mapSize.set(512, 512);
    low.shadow.autoUpdate = false;
    low.shadow.needsUpdate = true;
  }
  hangingLantern(room, -0.3, 7.4, 2.6, true, 15);
  hangingLantern(room, -0.3, 16.4, 2.55, true, 13);
  mothLantern(room, 'west', 1.4, 2.2, false);
  mothLantern(room, 'north', 2.5, 2.1, false);

  /**
   * The fourth is up in the stair well, which is the whole reason the well is
   * there: a cold shaft coming down out of the ceiling at the top of the flight
   * gives the gallery a far end to walk toward.
   */
  const well = new THREE.PointLight(0xbcd4e4, 9, ctx.dims.cellSize * 1.5, 2);
  well.position.set(STAIR_X, ceilingHeight - 0.5, wellZ);
  room.light(well);
  const phase = room.range(0, 20);
  room.tick((t) => {
    well.intensity = 9 * (1 + 0.07 * Math.sin(t * 0.32 + phase));
  });
  for (let i = 0; i < 2; i++) {
    room.geo('shaftCold', quad(1.7, 2.6), tiltMatrix([STAIR_X, ceilingHeight - 1.3, wellZ], [0, (i * Math.PI) / 2 + 0.3, 0]), { castShadow: false, receiveShadow: false });
  }
  glowPool(room, STAIR_X, wellZ, 2.2, 'moonWash');

  candles(room, -2.35, 0.52, 2.4, 3, 0.13);
  motes(room, -1.0, 8.0, 2.6, 2.8, 20, 'dust');
  motes(room, 1.6, 17.0, 2.0, 2.6, 12, 'pollen');
  glowPool(room, -2.6, 0, 2.6);
  glowPool(room, 1.4, 7.4, 2.8);
  glowPool(room, 1.4, 16.4, 2.6);

  return room.finish();
}
