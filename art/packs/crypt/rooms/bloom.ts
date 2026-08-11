import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, bracketFungus, cyl, debris, disc, dustMotes, quad, rootMass, sarcophagus, sporeCluster, strut, wrappedBody } from '../kit/props';

/**
 * The Bloom - the room the crypt is losing.
 *
 * Something came up through the west wall and has been growing ever since. Caps
 * the size of a shield on the walls, a mycelial felt over the flagstones thick
 * enough to hide them, and a tomb chest split open by a root with a stand of
 * fungus fruiting out of what was inside it.
 *
 * The Rot's light is violet and teal and it does not FLICKER - `breathe()`
 * instead of `flicker()`, one slow pulse and no stutter. Nothing down here that
 * glows has a flame in it, and the absence of a flicker is the whole effect.
 */
export const bloom: RoomBlueprint = {
  id: 'crypt.bloom',
  nameKey: 'room.crypt.bloom',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 8,
  tags: ['rot', 'hinge'],
  anchors: {
    chest: [{ position: [2.6, 0, -3.15], rotationY: Math.PI }],
    itemSpawn: [
      { position: [-1.9, 0.8, 1.1] },
      { position: [2.9, 0, 2.6] },
      { position: [-2.6, 0, -2.9] },
    ],
    patrolPoint: [
      { position: [0.6, 0, -2.4] },
      { position: [1.4, 0, 2.4] },
      { position: [-2.4, 0, 0.4] },
    ],
    enemySpawn: [{ position: [-3.0, 0, 2.9] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, bloom);
  room.shell({
    floor: 'rot',
    wall: 'rot',
    ceiling: 'roots',
    dado: 'none',
    lamps: 'spore',
    mouth: 'root',
    plinth: false,
    // Where it got in. The recess opens on a picture of depth rather than on a
    // box, and it is the only real light on that side of the room.
    niches: [{ side: 'west', kind: 'breach', light: true }],
  });

  /* --- the split tomb -------------------------------------------------------------- */
  // A root came up under it and took the lid off. What is fruiting out of the
  // occupant is the room's centrepiece and the reason a player looks twice.
  sarcophagus(room, -1.9, 1.1, 0.34, { lid: 'flat', open: true, occupant: false, length: 2.0 });
  wrappedBody(room, -1.9, 0.78, 1.1, 0.34, 1.6);
  sporeCluster(room, -2.1, 0.86, 1.0, 0.85, true, 9, false);
  sporeCluster(room, -1.4, 0.82, 1.3, 0.6, false, 0, true);
  // The root itself, coming out of the floor under the tomb and into the vault.
  strut(room, 'root', [-3.0, 0.1, 2.4], [-2.1, 1.4, 1.6], 0.16, 7, { castShadow: false });
  strut(room, 'root', [-2.1, 1.4, 1.6], [-1.3, 3.1, 0.7], 0.12, 7, { castShadow: false });
  strut(room, 'root', [-2.8, 0.1, 2.0], [-2.4, 0.9, 0.9], 0.08, 6, { castShadow: false });

  /* --- what is growing ------------------------------------------------------------ */
  // Big caps low and small caps high, so the room has a vertical rhythm rather
  // than an even sprinkling. Only ONE of these is a real light: the breach in the
  // west wall is the other, and a 1x1 gets two.
  sporeCluster(room, 2.4, 0, -1.6, 1.35, false, 0, true);
  sporeCluster(room, 0.9, 0, 3.0, 0.9, false);
  sporeCluster(room, -3.0, 0, -1.4, 1.0, false, 0, true);
  sporeCluster(room, 3.0, 0, 1.2, 0.7, false);
  bracketFungus(room, 'north', -2.6, 0.7, 4);
  bracketFungus(room, 'east', 2.4, 1.1, 3);
  bracketFungus(room, 'south', 2.5, 0.6, 3);
  rootMass(room, 'north', 1.9);
  rootMass(room, 'east', -1.6, [0, 0], 4);

  // The felt over the floor: two broad patches, not a dozen. A pale surface is
  // the loudest thing in a dark room, and this one is nearly the floor.
  room.geo('mycelium', disc(2.3, 16), tiltMatrix([-1.4, 0.014, -0.4], [-Math.PI / 2, 0.4, 0]), { castShadow: false, receiveShadow: false });
  room.geo('mycelium', disc(1.7, 14), tiltMatrix([1.8, 0.014, 1.8], [-Math.PI / 2, 1.2, 0]), { castShadow: false, receiveShadow: false });
  // Threads climbing the ashlar out of both patches.
  for (let i = 0; i < 9; i++) {
    const a = room.range(0, Math.PI * 2);
    const x = Math.cos(a) * 3.5;
    const z = Math.sin(a) * 3.5;
    if (Math.abs(x) > 3.5 || Math.abs(z) > 3.5) continue;
    room.geo('rootPale', cyl(0.012, 0.03, room.range(0.5, 1.5), 5), tiltMatrix([Math.max(-3.5, Math.min(3.5, x)), 0.4, Math.max(-3.5, Math.min(3.5, z))], [room.range(-0.2, 0.2), a, room.range(-0.2, 0.2)]), {
      tile: 0.3,
      castShadow: false,
    });
  }

  /* --- the spore air --------------------------------------------------------------- */
  // Motes, and ONE small column under the big cap's gills. The four-metre crossed
  // haze quads this used to have read as sheets of glass standing in the room from
  // every doorway - a full-width translucent sheet is a pane of fog, and it is worse
  // than no atmosphere at all (docs/art/ROOM_REVIEW.md §4).
  dustMotes(room, -0.6, 1.4, 0.6, 3.0, 30, true);
  room.geo('hazeSpore', quad(0.7, 1.5), tiltMatrix([2.4, 0.78, -1.6], [0, 0.6, 0]), { castShadow: false, receiveShadow: false });

  /* --- the crypt underneath -------------------------------------------------------- */
  // Enough masonry left showing to say what this room used to be. A shallow BOX
  // rather than a quad: a flat plane on a wall of mycelium reads as a poster of a
  // wall, and it has to have a shadowed edge to read as the wall under the growth.
  room.box('surface.ashlar', [2.2, 1.6, 0.06], [0.4, 0.9, -3.64], 0, { tile: 1.4 });
  debris(room, 0.2, -3.0, 0.8, 8);
  debris(room, 2.9, 2.6, 0.6, 6);
  room.geo('bone', ball(0.1, 6), tiltMatrix([-2.5, 0.06, -2.9], [0, 0.4, 0], [1.4, 0.7, 1]), { castShadow: false });

  return room.finish();
}
