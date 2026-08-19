import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { MeshBatcher, poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  anemones,
  ball,
  bioMotes,
  boulder,
  causticPatch,
  encrust,
  glowShaft,
  kelpStand,
  siltDrift,
  spike,
  sway,
  swell,
  tubeWorms,
  urchin,
} from '../kit/props';

/**
 * The Kelp Deck - a compartment the sea took back and planted.
 *
 * The deck plate has gone through in the middle and a stand of giant kelp has
 * come up out of the hole, right through what used to be a walkway. The blades
 * reach the ceiling. Everything is silhouetted against the pane in the west
 * bulkhead, and the whole room moves - the only room in the pack where anything
 * sways, because kelp is the one thing down here that would.
 *
 * Sightlines are terrible on purpose. You can see a shape through the fronds
 * from the far side of the room and you cannot tell what it is.
 */
export const kelp: RoomBlueprint = {
  id: 'abyss.kelp',
  nameKey: 'room.abyss.kelp',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'east', 'south'),
  weight: 10,
  tags: ['abyss', 'cluttered'],
  anchors: {
    chest: [{ position: [-3.2, 0, -2.7], rotationY: -Math.PI / 2 }],
    locker: [{ position: [-3.25, 0, 2.7], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [2.5, 0.72, -2.9] },
      { position: [-1.9, 0.5, 2.6] },
      { position: [2.9, 0, 2.6] },
    ],
    patrolPoint: [
      { position: [1.4, 0, 0] },
      { position: [-1.6, 0, -1.6] },
      { position: [0.4, 0, 2.6] },
    ],
    enemySpawn: [{ position: [-2.9, 0, 0.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, kelp);
  room.shell({
    floor: 'silt',
    wall: 'crust',
    ceiling: 'rusticles',
    band: 'algae',
    bandHeight: 1.25,
    strip: 'bio',
    mouth: 'arch',
    ports: [{ side: 'west', kind: 'viewpane', scene: 'kelp', tall: true, light: true }],
  });

  /* --- the breach in the deck ------------------------------------------------------- */
  // Torn plate curled up round a hole in the floor, with the silt of the trench
  // coming through it. Everything else in the room grows out of this.
  room.geo('rust', new THREE.TorusGeometry(1.25, 0.2, 5, 18), tiltMatrix([-0.4, 0.03, -0.6], [Math.PI / 2, 0.3, 0]), {
    tile: 0.6,
    castShadow: false,
    consume: true,
  });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    room.geo(
      'rust',
      spike(room.range(0.1, 0.2), room.range(0.25, 0.6), 4),
      tiltMatrix([-0.4 + Math.cos(a) * 1.25, 0.16, -0.6 + Math.sin(a) * 1.25], [room.range(0.5, 1.2), a, room.range(-0.4, 0.4)]),
      { tile: 0.3, castShadow: false },
    );
  }
  siltDrift(room, -0.4, -0.6, 1.5);
  siltDrift(room, 1.9, 2.6, 1.1);
  siltDrift(room, -2.6, -2.4, 1.0);

  /* --- the kelp ---------------------------------------------------------------------- */
  /**
   * Three stands, and the tall one is not batched: it hangs off `loose()` so it
   * can sway. One extra draw call for the only motion in the room, which is
   * exactly the trade the heart in the viscera pack makes for its beat.
   */
  kelpStand(room, -1.6, -1.9, 5, 2.7, 0.7);
  kelpStand(room, 0.6, -2.6, 4, 2.4, 0.6);
  kelpStand(room, 2.2, 1.6, 4, 2.2, 0.55);
  kelpStand(room, -1.2, 2.4, 3, 1.9, 0.5);

  /**
   * The swaying stand goes through a batcher of its OWN rather than the room's.
   *
   * It has to stay out of the room's batch, because a merged mesh cannot be
   * animated - but four stalks and twenty-eight blades as individual meshes is
   * thirty-two draw calls, which is most of a room's budget spent on one plant.
   * Batched separately it is two: one per material. `room.own()` frees it.
   */
  const drift = new MeshBatcher();
  const blade = new THREE.PlaneGeometry(0.62, 0.15);
  const stipe = new THREE.CylinderGeometry(0.025, 0.04, 3.0, 5);
  for (let i = 0; i < 4; i++) {
    const px = room.range(-1.0, 0.4);
    const pz = room.range(-1.2, 0.2);
    drift.add(room.mat('kelp'), stipe, poseMatrix([px, 1.5, pz]), { tile: 0.5, castShadow: false });
    for (let b = 0; b < 7; b++) {
      drift.add(
        room.mat(b % 2 ? 'kelpPale' : 'kelp'),
        blade,
        tiltMatrix(
          [px + (b % 2 ? 0.26 : -0.26), 0.5 + b * 0.38, pz + room.range(-0.1, 0.1)],
          [room.range(-0.3, 0.3), room.range(0, 3), room.range(-0.6, 0.6)],
        ),
        { castShadow: false, receiveShadow: false },
      );
    }
  }
  blade.dispose();
  stipe.dispose();
  const drifting = drift.build();
  room.loose(drifting.object);
  room.own(drifting);
  sway(room, drifting.object, 0.045, 0.32);
  room.blockCircle(-0.4, -0.6, 0.85);

  /* --- what came with it -------------------------------------------------------------- */
  boulder(room, 2.6, -2.7, 0.72, 0.9);
  boulder(room, -2.4, 1.4, 0.5, 0.7);
  anemones(room, 2.5, 0.74, -2.9, 3, 0.34);
  anemones(room, -2.4, 0.5, 1.4, 3, 0.3);
  tubeWorms(room, 0.9, 3.1, 7, 0.5, 0.8);
  urchin(room, -1.9, 0.44, 2.6, 0.16);
  urchin(room, 1.4, 0.02, -3.2, 0.13);
  encrust(room, 2.9, 0.9, 2.6, 0.7, 10);
  encrust(room, -0.9, 0.0, 1.4, 0.9, 12);

  // A low reef of crust growing up the plate on the south-east side.
  for (let i = 0; i < 6; i++) {
    room.geo(
      'surface.crust',
      ball(room.range(0.2, 0.44), 7),
      tiltMatrix([room.range(1.6, 3.3), room.range(0, 0.9), 3.4], [0, room.range(0, 3), 0], [1.2, 0.9, 0.7]),
      { tile: 0.6, castShadow: false },
    );
  }

  /* --- the light ---------------------------------------------------------------------- */
  // The pane is one. The other is a cold pod low in the north-east corner, so
  // the kelp is lit from two sides and reads as a volume rather than a curtain.
  causticPatch(room, -1.0, -0.4, 2.0);
  causticPatch(room, 2.2, 2.2, 1.3);
  glowShaft(room, [-3.3, 2.4, 0], [0.4, 0.4, -0.6], 2.6);
  bioMotes(room, -0.6, 1.6, -0.8, 2.0, 26);
  bioMotes(room, 2.4, 1.2, 2.2, 1.2, 12);

  const under = new THREE.PointLight(0x54e0b0, 9, ctx.dims.cellSize * 1.4, 2);
  under.position.set(2.4, 0.55, -1.4);
  room.light(under);
  swell(room, under, 9, 0.22, 0.6);
  const pane = room.lights[0];
  if (pane) swell(room, pane, 13, 0.14, 0.38);

  return room.finish();
}
