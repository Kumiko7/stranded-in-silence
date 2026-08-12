import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import { ball, boulders, candleStand, cyl, debris, disc, drip, dustMotes, lichenPatch, quad, rimstonePool, stalagmite } from '../kit/props';

/** Small rock and pigment: none of it is worth a shadow, and none of it receives one. */
const NO_SHADOW_OPTS = { castShadow: false } as const;
const FLAT = { castShadow: false, receiveShadow: false } as const;

/**
 * The Painted Cave - thirty thousand years older than the tomb, and the only
 * room in the map whose dead left no bodies.
 *
 * A gallery in the living rock with hands blown in red ochre across one wall,
 * two beasts drawn over them, a rimstone pool, and a hearth on the floor with
 * charcoal still in it. Somebody from the crypt has been down here to look:
 * there is a candle stand in front of the paintings that is six hundred years
 * old, which makes it the newest thing in the room by twenty-nine thousand.
 *
 * The one room in the pack that is lit for a REASON - a warm light in front of
 * the art and cold lichen everywhere else - and the temperature clash is the
 * whole point of it.
 */
export const painted: RoomBlueprint = {
  id: 'crypt.painted',
  nameKey: 'room.crypt.painted',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 9,
  tags: ['cave'],
  anchors: {
    chest: [{ position: [2.6, 0, -3.15], rotationY: Math.PI }],
    locker: [{ position: [2.55, 0, 3.15], rotationY: 0 }],
    itemSpawn: [
      { position: [-2.75, 0.66, -1.35] },
      { position: [-2.95, 0.66, -2.5] },
      { position: [0.4, 0, 2.6] },
    ],
    patrolPoint: [
      { position: [-1.4, 0, 0.4] },
      { position: [1.6, 0, -2.2] },
      { position: [1.2, 0, 2.6] },
    ],
    enemySpawn: [{ position: [-2.9, 0, 2.6] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, painted);
  room.shell({
    floor: 'clay',
    wall: 'rock',
    ceiling: 'cave',
    dado: 'none',
    lamps: 'lichen',
    lampSpacing: 3.2,
    mouth: 'rubble',
    seam: false,
    // A fissure in the west wall, over the paintings: it is where the cold air
    // comes from, and it is the reason the pigment survived on this wall and
    // nowhere else in the cave.
    niches: [{ side: 'west', kind: 'crevice' }],
  });

  /* --- the paintings ---------------------------------------------------------- */
  // On the west wall, either side of the fissure, as two panels of rock rather
  // than one: the pigment is IN the flowstone, so the panels are boxes standing a
  // few centimetres proud of the wall with the rock's own normal map on them.
  for (const [z, w, h, y] of [
    [-2.05, 2.5, 1.9, 0.55],
    [2.15, 2.3, 1.6, 0.75],
  ] as const) {
    room.box('surface.caveArt', [0.09, h, w], [-3.62, y, z], 0, { tile: 2.6 });
    // The lip of flowstone that has grown down over the top of each panel, which
    // is what has been protecting them.
    for (let i = 0; i < 5; i++) {
      const lz = z - w / 2 + (w * (i + 0.5)) / 5;
      room.geo('flowstone', ball(room.range(0.14, 0.24), 6), tiltMatrix([-3.56, y + h, lz], [0, i, 0], [0.7, 0.5, 1.6]), { tile: 0.4 });
    }
  }

  /* --- the ledge the painters worked from ------------------------------------- */
  // A shelf of rock at working height with their kit still on it: ochre lumps, a
  // grinding stone with the pigment ground into it, and two hollow bird bones
  // they blew the paint through. That last detail is the room.
  room.solid('caveRock', [1.0, 0.62, 2.2], [-2.85, 0, -1.8], 0.04, { tile: 0.9 });
  room.geo('caveRockPale', cyl(0.34, 0.3, 0.07, 9), poseMatrix([-2.6, 0.65, -1.2]), { tile: 0.4 });
  room.geo('ochre', cyl(0.3, 0.26, 0.02, 9), poseMatrix([-2.6, 0.69, -1.2]), FLAT);
  for (let i = 0; i < 4; i++) {
    room.geo('ochre', ball(room.range(0.05, 0.1), 5), tiltMatrix([-2.5 + room.range(-0.2, 0.2), 0.66, -2.4 + room.range(-0.4, 0.4)], [0, i, 0], [1.2, 0.8, 1]), NO_SHADOW_OPTS);
  }
  for (const [z, lean] of [
    [-1.75, 0.4],
    [-1.95, -0.3],
  ] as const) {
    room.geo('bonePale', cyl(0.016, 0.02, 0.26, 5), tiltMatrix([-2.7, 0.66, z], [Math.PI / 2, lean, 0]), NO_SHADOW_OPTS);
  }
  // And an ochre hand print on the ledge itself, where one of them steadied it.
  room.geo('ochre', quad(0.16, 0.2), tiltMatrix([-2.7, 0.632, -2.7], [-Math.PI / 2, 0.3, 0]), FLAT);

  /* --- the hearth ------------------------------------------------------------- */
  // A ring of stones with charcoal in it, on the floor in front of the wall. Cold
  // for thirty thousand years, and the soot from it is still on the roof above.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    room.geo('caveRock', ball(room.range(0.13, 0.2), 5), tiltMatrix([-1.5 + Math.cos(a) * 0.62, 0.05, -0.2 + Math.sin(a) * 0.62], [0, a, 0], [1.2, 0.7, 1]), { tile: 0.4 });
  }
  room.geo('ash', disc(0.55, 12), tiltMatrix([-1.5, 0.014, -0.2], [-Math.PI / 2, 0.4, 0]), FLAT);
  for (let i = 0; i < 5; i++) {
    room.geo('bitumen', ball(room.range(0.05, 0.09), 5), tiltMatrix([-1.5 + room.range(-0.34, 0.34), 0.04, -0.2 + room.range(-0.34, 0.34)], [0, i, 0], [1.3, 0.6, 1]), FLAT);
  }
  // No soot patch on the roof: an opaque near-black quad two centimetres under the
  // ceiling reads as a hole cut in it, and the ceiling over an unlit hearth is dark
  // enough already.

  /* --- the visitor ------------------------------------------------------------ */
  // Six hundred years old and the newest thing here by a factor of fifty: a
  // pricket stand in front of the paintings, with the wax still on the floor round
  // its feet. It is the room's warm light, and it is pointed at the art.
  // In front of the NORTH panel rather than between the two of them: ochre on wet
  // rock needs a light within a metre of it, and split between two panels it lit
  // neither. The south panel is left for a player to walk to.
  candleStand(room, -2.0, -1.5, true, 1.2, 9);

  /* --- the rest of the cave --------------------------------------------------- */
  // Same rule as the Sink: nothing that carries a collider goes within reach of a
  // container anchor or a doorway, and a pool 1.15 m across is 1.5 m of collider.
  rimstonePool(room, 1.2, 0.9, 0.85, false);
  stalagmite(room, 3.2, 0.4, 1.15, 0.24);
  stalagmite(room, 0.9, -2.9, 0.5, 0.18);
  boulders(room, -1.9, -2.1, 0.7, 3);
  drip(room, 1.2, 0.9, 3.28);
  lichenPatch(room, 3.3, 1.4, -2.4, 1.2, true, 6);
  lichenPatch(room, -0.6, 0.9, 3.2, 0.8, false);
  debris(room, -0.4, -2.8, 0.7, 6);
  dustMotes(room, -1.4, 1.4, 0.4, 2.8, 18);

  return room.finish();
}

