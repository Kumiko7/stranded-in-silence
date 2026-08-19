import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
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
  mossPatch,
  motes,
  plume,
  toadstools,
} from '../kit/props';

/**
 * The Fungal Deep - the wood has stopped being wood here, and the thing that
 * replaced it glows.
 *
 * Two columns of bracket fungus growing out of opposite corners like a stack of
 * plates two metres across, a floor of leaf mould that gives underfoot, and
 * eleven kinds of fruiting body between them. The light is all gill glow: cold,
 * green, and coming from UNDER things, which is why every shape in the room is
 * lit from beneath and reads a foot taller than it is.
 *
 * It offers all four walls, so the columns are hard against the corners and the
 * middle is open mould. That openness is the trap: a room this bright feels safe
 * and has nothing to hide behind.
 */
export const fungalDeep: RoomBlueprint = {
  id: 'heartwood.fungaldeep',
  nameKey: 'room.heartwood.fungaldeep',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 10,
  tags: ['thicket'],
  anchors: {
    chest: [{ position: [-3.2, 0, 2.0], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.3, 0, -2.0], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.4, 1.33, -3.0] },
      { position: [2.6, 0, -3.3] },
      { position: [0.5, 0, -3.3] },
    ],
    patrolPoint: [
      { position: [0, 0, 0] },
      { position: [-2.1, 0, -1.2] },
      { position: [2.0, 0, 1.4] },
    ],
    enemySpawn: [{ position: [-2.9, 0, 2.9] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, fungalDeep);
  room.shell({
    floor: 'loam',
    wall: 'fungus',
    ceiling: 'roots',
    band: 'pulp',
    bandHeight: 0.6,
    register: 'weep',
    mouth: 'grown',
  });

  /**
   * A column of shelf fungus: a rotten core with brackets growing out of it in a
   * rising spiral.
   *
   * Each bracket is a squashed hemisphere with a disc of gills under it, and the
   * gills are where the light comes from - which is both what a bracket fungus
   * does and what makes a stack of them read as a shape rather than as a pile of
   * pale blobs.
   */
  const column = (cx: number, cz: number, height: number, seed: number): void => {
    room.geo('rotProp', cyl(0.26, 0.42, height, 9), poseMatrix([cx, height / 2, cz]), { tile: 0.6, castShadow: true });
    // Mycelium running up the core, so the column is furred rather than turned.
    for (let i = 0; i < 6; i++) {
      const a = seed + i * 1.9;
      room.geo('mycelium', cyl(0.014, 0.02, height * 0.5, 4), tiltMatrix([cx + Math.cos(a) * 0.3, height * (0.2 + (i % 3) * 0.2), cz + Math.sin(a) * 0.3], [0.2, a, 0]), { tile: 0.2, castShadow: false, receiveShadow: false });
    }
    const shelves = 7;
    for (let i = 0; i < shelves; i++) {
      const t = i / shelves;
      const a = seed + t * 7.4;
      const y = 0.32 + t * (height - 0.5);
      const r = 0.7 - t * 0.28 + ((i % 3) - 1) * 0.09;
      const px = cx + Math.cos(a) * 0.24;
      const pz = cz + Math.sin(a) * 0.24;
      room.geo('bracket', ball(r, 10), tiltMatrix([px, y, pz], [0.16, a, 0], [1.15, 0.2, 0.85]), { tile: 0.4, castShadow: true });
      room.geo('gill', disc(r * 0.82, 14), tiltMatrix([px, y - 0.05, pz], [Math.PI / 2 - 0.12, a, 0]), { castShadow: false, receiveShadow: false });
      // Radial gill blades under the biggest ones, which is what stops the
      // underside reading as a painted disc.
      if (i % 3 === 0) {
        for (let k = 0; k < 5; k++) {
          const g = a + (k / 5 - 0.5) * 2.2;
          room.box('gill', [0.012, 0.03, r * 0.78], [px + Math.cos(g) * 0.05, y - 0.075, pz + Math.sin(g) * 0.05], -g + Math.PI / 2, { tile: 0.1, castShadow: false, receiveShadow: false });
        }
      }
    }
    room.blockCircle(cx, cz, 0.52);
  };

  column(-2.85, -2.85, 2.7, 1.3);
  column(2.95, 2.95, 2.3, 4.1);

  /* --- the floor ------------------------------------------------------------- */
  // Fruiting bodies at four sizes. A field of one mushroom is wallpaper; what
  // makes a fungal floor read is that the scales disagree.
  toadstools(room, -1.6, 2.2, 1.2, 8, true);
  toadstools(room, 2.1, -1.9, 1.0, 6, false);
  toadstools(room, 0.4, -3.2, 0.8, 5, true);
  toadstools(room, -3.2, 0.6, 0.7, 4, false);

  // Puffballs: big, pale and low, and they are the one shape in here that is not
  // on a stalk.
  for (const [px, pz, r] of [
    [1.4, 2.6, 0.34],
    [1.9, 3.1, 0.22],
    [-2.4, -1.2, 0.28],
    [3.2, -0.4, 0.2],
  ] as const) {
    room.geo('toadstool', ball(r, 9), tiltMatrix([px, r * 0.72, pz], [0, px + pz, 0], [1, 0.85, 1]), { tile: 0.3, castShadow: true });
    room.geo('mycelium', disc(r * 1.5, 12), tiltMatrix([px, 0.014, pz], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
    // The pore at the top of a ripe one, and the spore plume coming out of it.
    room.geo('rotProp', disc(r * 0.24, 8), tiltMatrix([px, r * 1.42, pz], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
    if (r > 0.25) plume(room, px, pz, r * 1.4, 1.1, 0.7, 'hazeSpore');
  }

  // Mycelial cords running across the mould between everything, flat and
  // collider-free: this room's floor is its picture and nothing on it blocks.
  for (let i = 0; i < 14; i++) {
    const a = room.range(0, Math.PI * 2);
    const px = room.range(-3.0, 3.0);
    const pz = room.range(-3.0, 3.0);
    limb(
      room,
      'mycelium',
      [px, 0.02, pz],
      [px + Math.cos(a) * room.range(0.8, 2.4), 0.02, pz + Math.sin(a) * room.range(0.8, 2.4)],
      0.016,
      0.008,
      0.2,
      i * 3,
      4,
      { tile: 0.2, castShadow: false, receiveShadow: false },
    );
  }

  brackets(room, 'north', 1.4, 1.2, 4);
  brackets(room, 'south', -1.5, 1.6, 4);
  brackets(room, 'east', 1.8, 1.0, 3);
  mossPatch(room, -1.0, 0.02, 1.2, 1.3, 8);
  mossPatch(room, 2.4, 0.02, -3.2, 0.9, 6);
  litter(room, 0.5, -3.3, 1.0, 8);

  foxfire(room, [-3.4, 0.9, 0.6], 0.7, 9, true);
  foxfire(room, [1.2, 0.25, 3.3], 0.7, 8);
  motes(room, 0, 0, 3.0, 2.6, 22, 'spore');

  /* --- light ------------------------------------------------------------------ */
  // Both lamps are gill glow and both are LOW, because everything in this room is
  // lit from underneath and a lamp at head height would flatten it. The two are
  // on opposite walls so the columns throw across each other.
  const west = gillLamp(room, 'west', -0.4, 1.4, true, 10);
  if (west) {
    west.castShadow = true;
    west.shadow.mapSize.set(512, 512);
    west.shadow.autoUpdate = false;
    west.shadow.needsUpdate = true;
  }
  gillLamp(room, 'east', -0.4, 1.2, true, 8);

  // The columns' own glow on the floor beneath them, which is what a bank of
  // gills would really do and what stops the corners going black.
  glowPool(room, -2.85, -2.85, 2.8, 'foxWash');
  glowPool(room, 2.95, 2.95, 2.6, 'foxWash');
  glowPool(room, -1.6, 2.2, 2.2, 'foxWash');
  glowPool(room, 0.4, -3.2, 1.6, 'foxWash');

  return room.finish();
}
