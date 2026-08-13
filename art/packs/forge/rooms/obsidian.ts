import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  debris,
  disc,
  floorFissure,
  glowPool,
  heatShimmer,
  motes,
  obsidianBlades,
  quad,
  rubble,
  spatterCone,
  surge,
  wallSign,
} from '../kit/props';

/**
 * The Glass Field - where a flow hit cold rock and went to glass instead of
 * stone.
 *
 * A floor of black volcanic glass, polished enough to hold a highlight, with
 * blades of it standing out of the ground in fans. It is the only reflective
 * surface in the map and the only room where a player's own lamp-lit shape comes
 * back at them off the ground, which is exactly the effect worth having in a
 * game about not being alone.
 *
 * A crack in the south wall is doing all of the lighting.
 */
export const obsidianRoom: RoomBlueprint = {
  id: 'forge.obsidian',
  nameKey: 'room.forge.obsidian',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'west'),
  weight: 9,
  tags: ['mountain'],
  anchors: {
    chest: [{ position: [3.35, 0, -2.5], rotationY: Math.PI / 2 }],
    locker: [{ position: [3.4, 0, 2.5], rotationY: Math.PI / 2 }],
    itemSpawn: [
      { position: [0.8, 0, 3.2] },
      { position: [-1.4, 0.57, 3.2] },
      { position: [2.0, 0, -3.2] },
    ],
    patrolPoint: [
      { position: [0, 0, 0.4] },
      { position: [-2.4, 0, -0.4] },
      { position: [2.5, 0, -1.4] },
    ],
    enemySpawn: [{ position: [-2.0, 0, -2.0] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, obsidianRoom);
  room.shell({
    floor: 'obsidian',
    wall: 'basalt',
    ceiling: 'rock',
    band: 'basalt',
    bandHeight: 0.6,
    register: 'fissure',
    mouth: 'fissure',
    ports: [{ side: 'south', kind: 'crack', light: true }],
  });

  /* --- the blades ------------------------------------------------------------------ */
  // Three fans at three scales, none of them symmetrical. A blade is FLAT and has
  // an edge; a cylinder in the same place reads as a stump.
  // Both containers live on the east wall, so every fan of blades is kept west
  // of x = 1.5 and out of both door lanes.
  obsidianBlades(room, -2.4, 2.4, 6, 1.35);
  obsidianBlades(room, 0.6, 3.1, 5, 0.95);
  obsidianBlades(room, -2.9, -2.9, 3, 0.7);

  // A single tall one out on its own, tilted, catching the light from the crack.
  room.geo('glassRock', quad(0.9, 2.3), tiltMatrix([-0.8, 1.15, 2.0], [0.12, 0.7, 0.18]), { receiveShadow: false });
  room.geo('glassRock', ball(0.42, 6), tiltMatrix([-0.8, 0.1, 2.0], [0, 0.7, 0], [1.5, 0.5, 1.2]), { tile: 0.4, castShadow: true });
  room.blockCircle(-0.8, 2.0, 0.44);

  /* --- the floor -------------------------------------------------------------------- */
  // Flow banding in the glass: bands of paler rock frozen into it, running in ONE
  // direction with the spacing and the drift varying along it. Concentric arcs
  // about a point - the obvious first go - read as a bullseye painted on the
  // floor, which is the same failure as a four-segment torus reading as a cross.
  for (let i = 0; i < 8; i++) {
    const z = -1.4 + i * 0.62 + Math.sin(i * 1.7) * 0.14;
    room.geo('rockPale', quad(room.range(3.0, 6.2), room.range(0.06, 0.14)), tiltMatrix([room.range(-0.9, 0.9), 0.012, z], [-Math.PI / 2, 0.16 + Math.sin(i) * 0.1, 0]), {
      receiveShadow: false,
    });
  }
  floorFissure(room, -0.6, -2.6, 3.4, 0.2, true);
  spatterCone(room, -3.2, -2.4, 0.65, false);
  rubble(room, 1.4, -1.2, 1.3, 12);
  rubble(room, 2.6, 3.0, 1.0, 10);
  debris(room, -1.6, 3.0, 0.7, 4);

  // A block of glass somebody cut a slab off and left, with the saw marks on it.
  room.solid('glassRock', [0.9, 0.55, 0.8], [-1.4, 0, 3.2], 0.4, { tile: 0.4, castShadow: true });
  for (let i = 0; i < 4; i++) {
    room.geo('rockPale', quad(0.82, 0.02), tiltMatrix([-1.4, 0.56, 3.2 - 0.24 + i * 0.16], [-Math.PI / 2, 0.4, 0]), { receiveShadow: false });
  }

  heatShimmer(room, 0, 1.6, 3.2, 2.2, 2.4, 0);
  motes(room, 0, 1.7, 1.0, 3.0, 12, 'ash');
  glowPool(room, 0, 3.0, 2.6);
  glowPool(room, -0.6, -2.6, 1.5);
  wallSign(room, 'east', 2.7, 2.2, false);

  /* --- light ------------------------------------------------------------------------ */
  // One lamp is the crack's own, spent by the shell. The second is low and out in
  // the field, so the blades rake and the glass floor gets a highlight instead of
  // a flat wash.
  // COLD, and the only cold lamp on the Mountain side of the map. The crack's own
  // practical is already orange, and a second orange one made this room a third
  // lava chamber; a pale violet raking across black glass is what separates it
  // from the tube and the lavafall at a glance.
  const low = new THREE.PointLight(0xa89ad8, 7, ctx.dims.cellSize * 1.7, 2);
  low.position.set(-0.6, 0.55, -1.2);
  room.shadowLight(low);
  surge(room, low, 7, 0.12, 0.3);

  // A crown of small glow points along the tall blade's edge: light catching a
  // surface, not a light source. Points on a dark line, never half a bright one.
  for (let i = 0; i < 5; i++) {
    room.geo('ember', ball(0.022, 4), poseMatrix([-0.88 + i * 0.04, 0.5 + i * 0.42, 1.92]), { receiveShadow: false });
  }
  room.geo('surface.crustHot', disc(0.34, 10), tiltMatrix([-3.2, 0.68, -2.4], [-Math.PI / 2, 0, 0]), { receiveShadow: false });

  return room.finish();
}
