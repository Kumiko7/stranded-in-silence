import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { tiltMatrix } from '../../../lib/merge';
import { ALL_WALLS, Room } from './common';
import { banner, boneHeap, brazier, cobweb, debris, disc, pew, sconce, statue } from '../kit/props';

/**
 * The Threshold - where the Order let mourners in, and no further.
 *
 * A vaulted vestibule with a door on every wall, a bench nobody has sat on for
 * six hundred years, and a hooded saint in the corner watching the way you came
 * in. It is the pack's crossroads room: four doors, nothing in the middle, and
 * enough light to make a decision by.
 *
 * The one room in the crypt that was meant to be seen by the living, which is
 * why it is the only one with a floor swept clean enough to read.
 */
export const gate: RoomBlueprint = {
  id: 'crypt.gate',
  nameKey: 'room.crypt.gate',
  footprint: [[0, 0]],
  doorWalls: ALL_WALLS,
  weight: 13,
  tags: ['sanctum', 'entrance', 'open'],
  anchors: {
    chest: [{ position: [-3.15, 0, 2.55], rotationY: -Math.PI / 2 }],
    locker: [{ position: [3.15, 0, -2.55], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.5, 0.53, -2.9] },
      { position: [2.7, 0, 2.8] },
      { position: [2.55, 0.53, 2.2] },
    ],
    playerSpawn: [
      { position: [-1.85, 0, 2.05], rotationY: 0 },
      { position: [-0.6, 0, 2.5], rotationY: 0 },
      { position: [0.6, 0, 2.5], rotationY: 0 },
      { position: [1.85, 0, 2.05], rotationY: 0 },
    ],
    patrolPoint: [
      { position: [0, 0, -2.2] },
      { position: [-2.4, 0, 0] },
      { position: [2.4, 0, 0] },
      { position: [0, 0, 2.2] },
    ],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, gate);
  room.shell({
    floor: 'flag',
    wall: 'ashlar',
    ceiling: 'groin',
    dado: 'stone',
    dadoHeight: 0.95,
    lamps: 'votive',
    mouth: 'gothic',
  });

  /* --- the corners ------------------------------------------------------------ */
  // Everything solid lives outside the door lanes, because the generator may
  // open any of the four walls (ROOM_FORMAT.md §5).
  statue(room, -2.65, -2.6, room.range(2.2, 2.6), 'saint');
  pew(room, -2.5, -2.9, Math.PI / 2, 1.9);
  pew(room, 2.55, 2.2, -Math.PI / 2, 1.9);

  // Two braziers on the diagonal, so the room is lit from both ends and the vault
  // gets a shadow of its own ribs.
  //
  // They stand INBOARD rather than in the corners, because the corners are where
  // the chest and the locker go and a container wants 1.6 m of clear floor in
  // front of it measured across its whole width. A brazier in the corner opposite
  // a chest anchor is a chest nobody can open, and it is the single most common way
  // to fail `npm run validate:art`.
  brazier(room, -1.9, 1.2, true, 9, true);
  brazier(room, 1.9, -1.2, true, 7);

  /* --- the fabric ------------------------------------------------------------- */
  // Banners between the doorways: the arms of the nine, all but one of them
  // rotted through.
  banner(room, 'north', 2.45, 2.6, 0.85);
  banner(room, 'west', -2.5, 2.55, 0.85);
  sconce(room, 'south', 2.6, 1.9, false);
  sconce(room, 'east', 2.6, 1.9, false);

  // A century of masonry down out of the vault, swept into the corners rather
  // than cleared: somebody kept this room usable, and then stopped.
  debris(room, 1.9, 3.0, 0.8, 8);
  debris(room, -3.0, -1.4, 0.7, 7);
  boneHeap(room, 3.05, 3.05, 0.5, 7);
  cobweb(room, -3.2, 2.9, -3.2, 0.9, 0.4);
  cobweb(room, 3.2, 3.0, 3.2, 0.8, 2.3);

  // The wet patch under the boss where the vault has been weeping since it was
  // built. Flat, unlit, and the only thing in the room that shines.
  room.geo('water', disc(0.62, 14), tiltMatrix([0.4, 0.013, 0.5], [-Math.PI / 2, 0.4, 0]), {
    castShadow: false,
    receiveShadow: false,
  });

  return room.finish();
}
