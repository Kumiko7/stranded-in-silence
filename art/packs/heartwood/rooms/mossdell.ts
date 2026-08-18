import * as THREE from 'three';
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
  litter,
  mossPatch,
  motes,
  quad,
  stump,
  toadstools,
  vineFall,
} from '../kit/props';

/**
 * The Moss Dell - one stone, one shaft of light, and eight metres of moss.
 *
 * The emptiest room in the pack and the only one with nothing in it that wants
 * anything. There is a hole in the canopy overhead and a cold column of light
 * standing under it, and in the middle of that column there is a boulder the
 * size of a table with moss over every centimetre of it and a shallow bowl worn
 * into the top.
 *
 * The bowl has rainwater in it. Somebody has put three small things round the
 * rim, evenly spaced, and that is the entire content of the room.
 *
 * It offers all four walls, which makes it the connective tissue of the Thicket
 * half - so a player meets it three times a run, and it works by being the one
 * place they are not being looked at.
 */
export const mossDell: RoomBlueprint = {
  id: 'heartwood.mossdell',
  nameKey: 'room.heartwood.mossdell',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 11,
  tags: ['thicket', 'quiet'],
  anchors: {
    chest: [{ position: [-3.2, 0, 2.1], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.3, 0, -2.1], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [0.42, 0.86, -0.35] },
      { position: [-2.9, 0, -2.9] },
      { position: [2.9, 0, 2.85] },
    ],
    patrolPoint: [
      { position: [-2.2, 0, 0.2] },
      { position: [2.2, 0, -0.2] },
      { position: [0, 0, 2.6] },
    ],
    enemySpawn: [{ position: [3.1, 0, -3.1] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, mossDell);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'moss',
    wall: 'bark',
    ceiling: 'canopy',
    band: 'root',
    bandHeight: 0.45,
    register: 'weep',
    mouth: 'grown',
  });

  /* --- the stone ----------------------------------------------------------------- */
  /**
   * A boulder built as five overlapping squashed spheres, mossed over the top and
   * bare on the underside where the light does not reach - which is the one
   * detail that keeps it from reading as a green cushion.
   */
  const bx = 0.2;
  const bz = -0.3;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const d = i === 0 ? 0 : room.range(0.2, 0.5);
    const r = i === 0 ? 0.68 : room.range(0.3, 0.52);
    room.geo('stone', ball(r, 9), tiltMatrix([bx + Math.cos(a) * d, room.range(0.18, 0.42), bz + Math.sin(a) * d], [room.range(-0.2, 0.2), a, 0], [1.25, 0.82, 1.15]), { tile: 0.7, castShadow: true });
  }
  // The moss cap, and the pale lichen crusts on the sunward side of it.
  mossPatch(room, bx, 0.78, bz, 0.8, 20);
  for (let i = 0; i < 5; i++) {
    const a = room.range(-1.0, 1.0);
    const d = room.range(0.3, 0.75);
    room.geo('lichen', ball(room.range(0.08, 0.16), 6), tiltMatrix([bx + Math.cos(a) * d, room.range(0.35, 0.6), bz + Math.sin(a) * d], [0, a, 0], [1.2, 0.4, 1.1]), { tile: 0.2, castShadow: false });
  }
  // The bowl worn into the top, and the water standing in it.
  room.geo('stone', cyl(0.34, 0.3, 0.09, 14, true), poseMatrix([bx, 0.79, bz]), { tile: 0.2, castShadow: false });
  // The water sits just under the rim, not at the bottom of the well - sunk, it
  // read as a black hole punched in the top of the boulder.
  room.geo('water', disc(0.31, 14), tiltMatrix([bx, 0.845, bz], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  room.geo('moonWash', disc(0.33, 14), tiltMatrix([bx, 0.848, bz], [-Math.PI / 2, 0, 0]), { castShadow: false, receiveShadow: false });
  room.blockCircle(bx, bz, 0.82);

  // The three things on the rim. A tooth, a coin of bark and a bead of amber -
  // evenly spaced, which is the part that means somebody did it.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const px = bx + Math.cos(a) * 0.42;
    const pz = bz + Math.sin(a) * 0.42;
    if (i === 0) room.geo('bone', cyl(0.012, 0.026, 0.07, 5), poseMatrix([px, 0.87, pz]), { castShadow: false, receiveShadow: false });
    else if (i === 1) room.geo('barkProp', cyl(0.045, 0.045, 0.012, 9), poseMatrix([px, 0.845, pz]), { castShadow: false, receiveShadow: false });
    else room.geo('surface.sapHot', ball(0.035, 6), poseMatrix([px, 0.87, pz]), { castShadow: false, receiveShadow: false });
  }

  /* --- the dell ------------------------------------------------------------------ */
  // Everything else is against a wall or in a corner: this room offers all four
  // sides, so there is nowhere else a solid thing may stand.
  stump(room, -3.15, -3.15, 0.6, 0.75);
  stump(room, 3.2, 3.2, 0.5, 0.5);
  toadstools(room, -3.15, -3.15, 0.9, 8, false);
  toadstools(room, 2.3, -3.2, 0.8, 7, true);
  toadstools(room, -2.4, 3.2, 0.7, 6, false);
  mossPatch(room, -1.6, 0.02, 2.6, 1.4, 9);
  mossPatch(room, 2.4, 0.02, 1.0, 1.2, 8);
  litter(room, 3.2, -1.0, 0.9, 7);
  vineFall(room, -3.3, 3.3, 0.5, 4);
  vineFall(room, 3.3, -3.3, 0.5, 4);
  brackets(room, 'east', 2.8, 1.4, 3);
  brackets(room, 'west', -2.8, 1.2, 3);

  // Grass and seed heads round the edges of the moss, which is what stops a moss
  // floor reading as green carpet.
  for (let i = 0; i < 24; i++) {
    const a = room.range(0, Math.PI * 2);
    const d = 2.2 + room.range(0, 1.4);
    const px = Math.cos(a) * d;
    const pz = Math.sin(a) * d;
    const h = room.range(0.2, 0.6);
    room.geo('vine', cyl(0.006, 0.01, h, 4), tiltMatrix([px, h / 2, pz], [room.range(-0.25, 0.25), a, 0]), { castShadow: false, receiveShadow: false });
    if (i % 3 === 0) room.geo('leafPale', quad(0.04, room.range(0.08, 0.16)), tiltMatrix([px, h, pz], [0, a, room.range(-0.4, 0.4)]), { castShadow: false, receiveShadow: false });
  }

  foxfire(room, [-2.6, 0.25, -1.4], 0.7, 8);
  foxfire(room, [2.6, 0.25, 1.6], 0.6, 7);
  motes(room, bx, bz, 1.6, 2.8, 18, 'dust');

  /* --- light ----------------------------------------------------------------------- */
  /**
   * The shaft. Two crossed masked quads and a cold lamp above the stone: the mask
   * is what makes it a beam rather than a pane of fog standing in the room, and
   * the crossing is what stops it disappearing when a player walks round it.
   */
  for (let i = 0; i < 2; i++) {
    room.geo('shaftCold', quad(1.5, ceilingHeight - 0.2), tiltMatrix([bx, (ceilingHeight - 0.2) / 2, bz], [0, 0.4 + (i * Math.PI) / 2, 0]), { castShadow: false, receiveShadow: false });
  }
  const shaft = new THREE.PointLight(0xb0c8dc, 9, ctx.dims.cellSize * 1.5, 2);
  shaft.position.set(bx, 2.7, bz);
  room.shadowLight(shaft);
  const phase = room.range(0, 20);
  room.tick((t) => {
    // A leaf moving somewhere a long way up. Slow, shallow, and it is the only
    // thing in this room that changes.
    shaft.intensity = 9 * (1 + 0.09 * Math.sin(t * 0.21 + phase) + 0.04 * Math.sin(t * 0.53 + phase * 1.7));
  });

  gillLamp(room, 'north', -2.7, 1.3, true, 6);

  glowPool(room, bx, bz, 2.6, 'moonWash');
  glowPool(room, -2.7, -1.5, 1.8, 'foxWash');
  glowPool(room, 2.5, 1.6, 1.6, 'foxWash');

  return room.finish();
}
