import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { bioMotes, cageLamp, controlDesk, crate, cryoPod, debris, disc, glowShaft, quad, stripLight } from '../kit/props';

/**
 * The Cryo Bay - one door in, one door out, and it is the same door.
 *
 * Six pods stand along the side walls facing each other across a narrow aisle,
 * every one of them rimed over. Five are occupied. The sixth is open, and the
 * frost on the deck in front of it has been broken by something walking away.
 *
 * The whole north wall is glass, and the shoal outside it is the only thing in
 * the room that moves. The pack's one true dead end: nothing in here goes
 * anywhere, which is exactly what makes walking in feel like a decision.
 */
export const cryo: RoomBlueprint = {
  id: 'abyss.cryo',
  nameKey: 'room.abyss.cryo',
  footprint: [[0, 0]],
  doorWalls: wallsFor('south'),
  weight: 8,
  tags: ['station', 'deadend', 'cold'],
  anchors: {
    chest: [{ position: [-3.2, 0, 2.7], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.25, 0, 2.7], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.2, 0.84, -3.16] },
      { position: [2.4, 0, 1.9] },
      { position: [-2.6, 0.62, 0.6] },
    ],
    patrolPoint: [
      { position: [0, 0, -1.5] },
      { position: [-1.6, 0, 1.4] },
      { position: [1.6, 0, 1.4] },
    ],
    enemySpawn: [{ position: [2.3, 0, -3.1] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, cryo);
  room.shell({
    floor: 'deck',
    wall: 'paint',
    ceiling: 'pipes',
    band: 'steel',
    bandHeight: 0.9,
    rail: true,
    strip: 'cyan',
    mouth: 'bulkhead',
    // Floor to near-ceiling on the far wall. It is the first thing you see, and
    // the room is lit by it - the pod glow alone would leave the aisle black.
    ports: [{ side: 'north', kind: 'viewpane', scene: 'swarm', tall: true, light: true }],
  });

  /* --- the pods ---------------------------------------------------------------- */
  // Three a side, backed against the plate and facing each other. Only one is
  // open, and it is the one nearest the door.
  for (const z of [-2.9, -1.85, -0.8]) {
    cryoPod(room, -3.35, z, -Math.PI / 2, room.chance(0.75));
  }
  for (const [z, open] of [
    [-2.9, false],
    [-1.85, false],
    [0.9, true],
  ] as const) {
    cryoPod(room, 3.35, z, Math.PI / 2, !open && room.chance(0.8), open);
  }

  /* --- the cold ---------------------------------------------------------------- */
  // Frost creeping out of the pod line and across the deck, and a low bank of
  // vapour lying in the aisle. Both are flat and unlit - it is the pods that
  // glow, and a bright fog in front of them would grey the whole room over.
  for (let i = 0; i < 7; i++) {
    const x = room.chance(0.5) ? room.range(-3.3, -1.6) : room.range(1.6, 3.3);
    room.geo('frost', disc(room.range(0.3, 0.8), 12), tiltMatrix([x, 0.012, room.range(-3.2, 2.6)], [-Math.PI / 2, room.range(0, 3), 0]), {
      castShadow: false,
      receiveShadow: false,
    });
  }
  for (let i = 0; i < 5; i++) {
    room.geo('waterHaze', quad(room.range(2.0, 4.2), room.range(0.5, 0.9)), tiltMatrix([room.range(-1.4, 1.4), 0.35, room.range(-2.6, 2.4)], [1.35, room.range(0, 3), 0]), {
      castShadow: false,
      receiveShadow: false,
    });
  }
  // A shaft of cold coming off the pane, down the length of the aisle.
  glowShaft(room, [0, 2.4, -3.5], [0, 0.4, 0.6], 2.6);
  bioMotes(room, 0, 1.6, -1.4, 1.7, 20);

  /* --- the watch station -------------------------------------------------------- */
  // Under the pane, off to one side so the glass keeps its middle. Somebody sat
  // here and logged the temperature of each pod every hour for six years.
  controlDesk(room, -2.2, -3.1, 1.7, Math.PI, true);
  crate(room, -2.6, 0.6, 0.3, 0.9, 0.6, 0.7);
  debris(room, 2.6, -1.9, 0.8, 8);
  debris(room, -1.4, 2.6, 0.9, 7);

  // Two dead strips down the aisle, a live one at the door, and one caged lamp
  // over the open pod. The pane is the second real light; everything else here
  // is emissive and costs nothing.
  stripLight(room, 0, 2.6, 2.2, 0, true, false, 9);
  stripLight(room, 0, 0.4, 2.2, 0, false, true);
  stripLight(room, 0, -1.8, 2.2, 0, false, true);
  cageLamp(room, 'east', -0.9, 2.2, false, true);
  cageLamp(room, 'west', -2.4, 2.2, false, true);

  return room.finish();
}
