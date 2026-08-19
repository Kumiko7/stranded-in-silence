import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  basket,
  brackets,
  buttress,
  cyl,
  disc,
  foxfire,
  gillLamp,
  glowPool,
  limb,
  litter,
  motes,
  phial,
  plume,
  quad,
  rootWeb,
  strut,
  toadstools,
} from '../kit/props';

/**
 * The Root Tangle - the west wall has failed and about forty roots have come
 * through it, and they have brought things with them.
 *
 * Roots the thickness of an arm woven into a lattice you can see through and
 * cannot get past, and caught in the weave: a lantern, a basket, a ladder, a
 * boot, a birdcage with the door open. All of it is somebody's, none of it is
 * damaged, and all of it is at the height a thing would be if it had been
 * carried in rather than swept in.
 *
 * There is one pale shape near the top of the weave that is not any of those,
 * and it is deliberately never lit directly.
 */
export const rootCoil: RoomBlueprint = {
  id: 'heartwood.rootcoil',
  nameKey: 'room.heartwood.rootcoil',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 10,
  tags: ['thicket'],
  anchors: {
    chest: [{ position: [2.9, 0, 3.3], rotationY: 0 }],
    locker: [{ position: [3.3, 0, -2.8], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.0, 1.05, -1.35] },
      { position: [-2.3, 0, 2.6] },
      { position: [2.6, 0, -0.4] },
    ],
    patrolPoint: [
      { position: [0.4, 0, 0.2] },
      { position: [-0.9, 0, -2.7] },
      { position: [2.4, 0, 1.8] },
    ],
    enemySpawn: [{ position: [1.2, 0, -3.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, rootCoil);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'root',
    wall: 'bark',
    ceiling: 'roots',
    band: 'root',
    bandHeight: 0.6,
    register: 'weep',
    mouth: 'grown',
    ports: [{ side: 'west', kind: 'burst' }],
  });

  /**
   * The weave.
   *
   * Twenty-two roots running corner to corner across the west band at three
   * depths, each of them kinked rather than straight - `limb()` is what makes a
   * root a root and a `strut` a pipe. The depths matter more than the count: a
   * single plane of them reads as a fence, and three planes read as something
   * you cannot see through properly.
   */
  for (let layer = 0; layer < 3; layer++) {
    const x = -3.2 + layer * 0.46;
    const count = 6 - layer;
    for (let i = 0; i < count; i++) {
      const t0 = room.range(-3.6, 3.6);
      const t1 = room.range(-3.6, 3.6);
      const y0 = layer % 2 === 0 ? 0.05 : ceilingHeight - 0.1;
      const y1 = layer % 2 === 0 ? ceilingHeight - 0.1 : 0.05;
      limb(
        room,
        'root',
        [x + room.range(-0.2, 0.2), y0, t0],
        [x + room.range(-0.2, 0.2), y1, t1],
        room.range(0.06, 0.14),
        room.range(0.04, 0.1),
        room.range(0.2, 0.55),
        layer * 7 + i,
        5,
        { tile: 0.5, castShadow: layer === 2 },
      );
    }
    // Cross-braces, so the weave is woven rather than combed.
    for (let i = 0; i < 3; i++) {
      const y = room.range(0.4, ceilingHeight - 0.5);
      limb(room, 'root', [x, y, -3.6], [x + room.range(-0.3, 0.3), y + room.range(-0.5, 0.5), 3.6], 0.055, 0.04, 0.4, layer * 13 + i, 6, { tile: 0.4, castShadow: false });
    }
  }
  // Rootlets and hair roots filling the gaps - the fine stuff is what makes a
  // tangle unreadable, and it costs almost nothing.
  rootWeb(room, -3.0, 1.5, 0, 1.9, 12, 'vine');
  rootWeb(room, -3.0, 2.6, 1.6, 1.4, 8, 'vine');
  // One collider across the whole run, at the depth a player would actually
  // touch it. Individual root colliders would be a maze of snags.
  room.collider({ kind: 'box', center: [-3.0, 0], halfExtents: [0.85, 3.8] });

  /* --- what is caught in it --------------------------------------------------- */
  // A lantern, still hanging the right way up.
  room.geo('copper', ball(0.16, 9), tiltMatrix([-2.05, 2.35, -1.9], [0.2, 0.4, 0], [1, 1.2, 1]), { tile: 0.2, castShadow: false });
  room.geo('lumenMoth', ball(0.13, 9), tiltMatrix([-2.05, 2.33, -1.9], [0, 0, 0], [1, 1.15, 1]), { castShadow: false, receiveShadow: false });
  room.geo('copper', cyl(0.045, 0.02, 0.1, 6), poseMatrix([-2.05, 2.56, -1.9]), { tile: 0.1, castShadow: false });

  // A basket, wedged on its side, with what was in it still in it.
  basket(room, -2.2, 0.6, 0.26, 0.4, false);
  room.geo('surface.wicker', cyl(0.24, 0.2, 0.4, 12, true), tiltMatrix([-2.3, 1.75, 1.5], [1.35, 0.6, 0]), { tile: 0.3, castShadow: true });
  for (let i = 0; i < 4; i++) {
    room.geo('bracket', ball(room.range(0.05, 0.1), 6), poseMatrix([-2.2 + room.range(-0.2, 0.2), 1.7 - i * 0.32, 1.45 + room.range(-0.2, 0.2)]), { tile: 0.1, castShadow: false });
  }

  // A ladder, gone in at an angle, and a boot on a rung.
  for (const s of [-1, 1]) {
    strut(room, 'timber', [-2.45 + s * 0.16, 0.4, 2.6], [-3.1 + s * 0.2, 2.9, 3.2], 0.035, 5, { tile: 0.3, castShadow: true });
  }
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6;
    room.geo('timberDark', cyl(0.02, 0.02, 0.36, 5), tiltMatrix([-2.45 - t * 0.65, 0.4 + t * 2.5, 2.6 + t * 0.6], [Math.PI / 2, 0.75, 0]), { tile: 0.15, castShadow: false });
  }
  room.geo('itemTar', ball(0.09, 6), tiltMatrix([-2.7, 1.28, 2.9], [0.4, 0.9, 0], [1, 0.85, 1.7]), { tile: 0.1, castShadow: false });

  // A birdcage, and the door is open.
  const cx = -2.0;
  const cy = 1.05;
  const cz = -1.35;
  room.geo('iron', disc(0.19, 12), tiltMatrix([cx, cy, cz], [-Math.PI / 2, 0, 0]), { castShadow: false });
  room.geo('iron', disc(0.15, 12), tiltMatrix([cx, cy + 0.52, cz], [-Math.PI / 2, 0, 0]), { castShadow: false });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    if (i === 3 || i === 4) continue; // the open door
    strut(room, 'iron', [cx + Math.cos(a) * 0.18, cy, cz + Math.sin(a) * 0.18], [cx + Math.cos(a) * 0.14, cy + 0.52, cz + Math.sin(a) * 0.14], 0.008, 4, { castShadow: false, receiveShadow: false });
  }
  for (let i = 3; i < 5; i++) {
    const a = (i / 10) * Math.PI * 2;
    strut(room, 'iron', [cx + Math.cos(a) * 0.3, cy + 0.06, cz + Math.sin(a) * 0.3], [cx + Math.cos(a) * 0.28, cy + 0.5, cz + Math.sin(a) * 0.28], 0.008, 4, { castShadow: false, receiveShadow: false });
  }
  room.geo('iron', cyl(0.012, 0.012, 0.3, 5), poseMatrix([cx, cy + 0.66, cz]), { castShadow: false, receiveShadow: false });
  room.geo('down', quad(0.1, 0.07), tiltMatrix([cx + 0.1, cy + 0.03, cz + 0.1], [-Math.PI / 2, 0.6, 0]), { castShadow: false, receiveShadow: false });

  /**
   * The pale shape near the top of the weave.
   *
   * It is never lit directly: both practicals in this room are low and on the
   * other side of it, so what a player gets is an outline against the west
   * wall's glow and no detail at all. That is the whole point - the moment it
   * resolves, it stops working.
   */
  room.geo('carapacePale', ball(0.26, 8), tiltMatrix([-2.85, 2.75, 0.4], [0, 0.5, 0], [0.8, 1.15, 0.75]), { tile: 0.25, castShadow: false });
  room.geo('carapacePale', ball(0.16, 7), tiltMatrix([-2.85, 3.05, 0.35], [0, 0.5, 0], [0.9, 1, 0.85]), { tile: 0.2, castShadow: false });
  for (const s of [-1, 1]) {
    limb(room, 'carapacePale', [-2.85 + s * 0.16, 2.8, 0.4], [-2.5 + s * 0.3, 2.2, 0.55], 0.035, 0.022, 0.06, s * 5, 4, { tile: 0.15, castShadow: false });
  }

  /* --- the rest of the room --------------------------------------------------- */
  // No buttress in here: this room already has a collider across its whole west
  // band, and a heap of root in a corner is how a locker's approach gets sealed
  // on the seeds where the scatter lands badly.
  brackets(room, 'north', -1.6, 1.4, 3);
  brackets(room, 'south', 1.8, 1.2, 3);
  toadstools(room, -1.4, 3.2, 0.9, 8, true);
  toadstools(room, 2.6, -0.4, 0.7, 6, false);
  litter(room, 0.6, 2.8, 1.3, 11);
  litter(room, 1.8, -3.2, 1.1, 9);
  for (let i = 0; i < 3; i++) {
    phial(room, -2.35, 0.42, 0.4 + i * 0.24, 0.04, 0.13, i === 1);
  }

  foxfire(room, [-1.9, 0.3, -3.2], 0.8, 10);
  foxfire(room, [3.2, 0.3, 1.6], 0.7, 8);
  plume(room, -2.6, 0.4, 0.4, 1.6, 1.3, 'hazeMist');
  motes(room, -1.2, 0, 2.4, 2.7, 16, 'dust');

  /* --- light -------------------------------------------------------------------- */
  // Both lamps are on the room side of the weave and both are LOW, so the roots
  // are lit from in front and everything caught in them is thrown back onto the
  // west wall as a shadow twice its size.
  const near = gillLamp(room, 'south', -2.4, 1.5, true, 9);
  if (near) {
    near.castShadow = true;
    near.shadow.mapSize.set(512, 512);
    near.shadow.autoUpdate = false;
    near.shadow.needsUpdate = true;
  }
  // The lantern caught in the weave is the room's one warm point, and it is
  // behind the tangle - the only thing that light does here is outline roots.
  const lantern = new THREE.PointLight(0xffb268, 5.5, ctx.dims.cellSize * 0.95, 2);
  lantern.position.set(-1.75, 2.3, -1.9);
  room.light(lantern);
  const phase = room.range(0, 20);
  room.tick((t) => {
    lantern.intensity = 5.5 * (1 + 0.15 * (Math.sin(t * 4.6 + phase) * 0.6 + Math.sin(t * 8.9 + phase) * 0.4));
  });

  glowPool(room, -2.2, -1.9, 2.2);
  glowPool(room, -2.4, 1.6, 2.2, 'foxWash');
  glowPool(room, 2.0, -1.0, 1.8, 'foxWash');

  return room.finish();
}
