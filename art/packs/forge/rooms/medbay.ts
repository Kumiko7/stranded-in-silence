import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  alarmBeacon,
  battenLight,
  crate,
  cyl,
  debris,
  glowPool,
  medBed,
  motes,
  quad,
  shelf,
  specimenJar,
  strut,
  wallSign,
} from '../kit/props';

/**
 * Triage - the burn ward, which in a facility built into a volcano is the
 * biggest room on the plan and was still not big enough.
 *
 * Two beds against the south wall with a curtain track between them and the
 * curtain half drawn. The curtain is double-sided and faintly self-lit, because
 * a single-sided sheet with a lamp behind it is a hole cut in the room; real
 * fabric backlit glows.
 *
 * One of the two beds has straps on it. Nothing else in the room does.
 */
export const medbay: RoomBlueprint = {
  id: 'forge.medbay',
  nameKey: 'room.forge.medbay',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['works', 'entrance'],
  anchors: {
    chest: [{ position: [-3.35, 0, -2.5], rotationY: -Math.PI / 2 }],
    locker: [{ position: [2.6, 0, -3.4], rotationY: Math.PI }],
    itemSpawn: [
      { position: [-2.6, 0.83, 2.0] },
      { position: [-3.16, 1.52, 1.3] },
      { position: [1.3, 0, -2.7] },
    ],
    playerSpawn: [
      { position: [-1.6, 0, -1.6], rotationY: -Math.PI * 0.25 },
      { position: [1.6, 0, -1.6], rotationY: Math.PI * 0.25 },
      { position: [-2.4, 0, 0.4], rotationY: -Math.PI / 2 },
      { position: [2.4, 0, 0.4], rotationY: Math.PI / 2 },
    ],
    patrolPoint: [
      { position: [0, 0, 0.2] },
      { position: [-2.5, 0, -1.4] },
      { position: [2.5, 0, 1.2] },
    ],
    enemySpawn: [{ position: [1.6, 0, 3.3] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, medbay);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'hex',
    wall: 'panel',
    ceiling: 'duct',
    band: 'panel',
    bandHeight: 1.35,
    register: 'cold',
    mouth: 'blast',
    rail: true,
    ports: [{ side: 'south', kind: 'screens', light: true }],
  });

  /* --- the beds ------------------------------------------------------------------ */
  // Heads to the south wall, so a player coming through any doorway is looking
  // down the length of both of them.
  medBed(room, -2.6, 2.6, Math.PI / 2, false);
  medBed(room, 2.6, 2.6, Math.PI / 2, true);

  // The curtain track between them, and the curtain half drawn along it.
  room.geo('steelPale', cyl(0.022, 0.022, 2.4, 5), tiltMatrix([0, 2.34, 2.6], [Math.PI / 2, 0, 0]));
  for (const s of [-1, 1]) strut(room, 'steelPale', [0, 2.34, 2.6 + s * 1.15], [0, ceilingHeight - 0.1, 2.6 + s * 1.0], 0.016, 4);
  // Six leaves, at slightly different depths AND heights so the folds read and the
  // hem is not one straight line. It hangs to 0.15 m off the deck: a sheet whose
  // bottom edge stops at knee height reads as a hoarding rather than as cloth.
  for (let i = 0; i < 6; i++) {
    const z = 1.55 + i * 0.29;
    const h = room.range(2.0, 2.16);
    room.geo('curtain', quad(0.32, h), tiltMatrix([room.range(-0.05, 0.05), 2.3 - h / 2, z], [0, Math.PI / 2 + room.range(-0.24, 0.24), 0]), {
      receiveShadow: false,
    });
  }

  /* --- the working side ------------------------------------------------------------ */
  // A trolley between the beds' feet and the door, with what was on it still on it.
  room.solid('steelPale', [1.0, 0.8, 0.56], [-2.6, 0, 1.95], 0, { tile: 0.4 });
  room.box('steelPale', [1.08, 0.05, 0.62], [-2.6, 0.8, 1.95], 0, { tile: 0.3 });
  for (let i = 0; i < 5; i++) {
    room.box('steelPale', [0.045, 0.02, 0.22], [-2.95 + i * 0.16, 0.85, 2.05], room.range(-0.12, 0.12), { tile: 0.2 });
  }
  specimenJar(room, -2.35, 0.85, 1.82, 0.075, 0.2, false);

  shelf(room, 'west', 1.3, 1.5, 1.5, 0.36);
  shelf(room, 'west', 1.3, 1.98, 1.5, 0.36);
  for (let i = 0; i < 6; i++) specimenJar(room, -3.16, 2.03, 0.7 + i * 0.24, 0.07, 0.19, false);

  // A drip stand, tipped over, and the mess round it.
  strut(room, 'steelPale', [1.5, 0, -1.9], [1.9, 1.3, -2.6], 0.024, 5);
  room.geo('steelPale', cyl(0.2, 0.2, 0.02, 8), poseMatrix([1.5, 0.02, -1.9]));
  room.geo('itemGlass', cyl(0.07, 0.07, 0.22, 7), poseMatrix([1.94, 1.36, -2.66]));
  debris(room, 1.6, -2.2, 0.9, 6);

  crate(room, 3.35, -2.0, 0.4, 0.7, 0.55, 0.6, false);
  motes(room, 0, 1.7, 0, 3.0, 10, 'ash');
  wallSign(room, 'north', -2.4, 2.45, false);
  wallSign(room, 'east', 2.7, 2.2, true);
  alarmBeacon(room, -3.5, 2.55, 3.0, false);

  // A hand-print smear at chest height beside the west doorway, going out.
  room.geo('itemAccent', quad(0.24, 0.5), poseMatrix([-3.66, 1.3, -1.5], -Math.PI / 2), { receiveShadow: false });

  /* --- light ------------------------------------------------------------------------ */
  // One is the screen rack's own, spent by the shell. The second is a batten
  // between the two beds, which is what backlights the curtain.
  battenLight(room, 0, 1.9, 2.4, Math.PI / 2, true, true, 11, 0.7);
  glowPool(room, 0, 2.6, 1.8, true);

  return room.finish();
}
