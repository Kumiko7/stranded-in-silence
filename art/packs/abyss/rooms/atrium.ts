import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsOn } from './common';
import { bioMotes, causticPatch, crate, debris, disc, drum, glowShaft, jelly, kelpStand, quad, railing, ring, stripLight, swell, urchin } from '../kit/props';

/**
 * The Oceanarium - the biggest volume in the station, and the reason anybody
 * ever came down here who was not a scientist.
 *
 * A four-cell hall with a two-storey acrylic drum standing in the middle of it,
 * a walkway ringing the drum, and the whole west side glazed floor to ceiling
 * onto the open trench. The drum holds a shoal; the trench holds whatever it
 * likes. You can see clean across sixteen metres of it, which makes this the
 * one room in the map where you get to watch something coming.
 *
 * A set piece, placed at most once per map. It is deliberately the brightest
 * room in the pack and it is still not a safe one.
 */
const FOOTPRINT = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
] as const;

export const atrium: RoomBlueprint = {
  id: 'abyss.atrium',
  nameKey: 'room.abyss.atrium',
  footprint: FOOTPRINT,
  /**
   * Five of the eight outer edges. The three left out are the two on the west
   * side - which become sixteen metres of glass - and the fore edge of the
   * north-east cell, which becomes the monitor bank. A wall the generator can
   * open is a wall that cannot hold a window (ROOM_FORMAT.md §6).
   */
  doorWalls: [
    ...wallsOn([0, 0], 'north'),
    ...wallsOn([1, 0], 'east'),
    ...wallsOn([1, 1], 'east', 'south'),
    ...wallsOn([0, 1], 'south'),
  ],
  weight: 6,
  maxPerMap: 1,
  tags: ['abyss', 'entrance', 'landmark', 'open'],
  anchors: {
    // The two on the west side stand on the pier between the panes, not in front
    // of them - a chest across a sixteen-metre window is a chest in the way of
    // the only thing this room is for.
    chest: [
      { position: [-3.2, 0, 3.4], rotationY: -Math.PI / 2 },
      { position: [11.2, 0, 6.6], rotationY: Math.PI / 2 },
    ],
    locker: [
      { position: [-3.25, 0, 4.7], rotationY: -Math.PI / 2 },
      { position: [11.25, 0, 1.4], rotationY: Math.PI / 2 },
    ],
    itemSpawn: [
      { position: [4.0, 0.58, -1.4] },
      { position: [4.0, 0.58, 9.4] },
      { position: [-1.4, 0.92, 10.9] },
      { position: [9.6, 0.92, -2.8] },
    ],
    playerSpawn: [
      { position: [1.2, 0, 8.4], rotationY: -Math.PI / 4 },
      { position: [2.4, 0, 10.4], rotationY: -Math.PI / 4 },
      { position: [6.8, 0, 8.4], rotationY: Math.PI / 4 },
      { position: [5.6, 0, 10.4], rotationY: Math.PI / 4 },
    ],
    patrolPoint: [
      { position: [4.0, 0, -2.6] },
      { position: [-1.6, 0, 4.0] },
      { position: [9.6, 0, 4.0] },
      { position: [4.0, 0, 10.6] },
    ],
    enemySpawn: [{ position: [10.8, 0, 10.8] }],
  },
  build,
};

const DRUM_X = 4;
const DRUM_Z = 4;
const DRUM_R = 2.35;

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, atrium);
  const { ceilingHeight } = ctx.dims;
  room.shell({
    floor: 'concrete',
    wall: 'paint',
    ceiling: 'trusses',
    band: 'steel',
    bandHeight: 0.55,
    strip: 'cyan',
    mouth: 'collar',
    // The whole west side is glass. Both cells offer no door on that edge, which
    // is what makes it safe to glaze - the generator can never open it.
    ports: [
      { cell: [0, 0], side: 'west', kind: 'viewpane', scene: 'swarm', tall: true, light: true },
      { cell: [0, 1], side: 'west', kind: 'viewpane', scene: 'kelp', tall: true, light: true },
      { cell: [1, 0], side: 'north', kind: 'monitors' },
    ],
  });

  /* --- the drum --------------------------------------------------------------------- */
  /**
   * Floor to ceiling in the middle of the hall. The plan is a donut: every
   * doorway is centred on its own cell, so the middle of a 2x2 is four metres
   * from the nearest lane and a set piece can stand there without ever coming
   * near one.
   */
  room.geo('steelDark', new THREE.CylinderGeometry(DRUM_R * 1.14, DRUM_R * 1.22, 0.34, 26), poseMatrix([DRUM_X, 0.17, DRUM_Z]), {
    tile: 0.8,
    consume: true,
  });
  room.geo('steel', ring(DRUM_R * 1.08, 0.07, 28), tiltMatrix([DRUM_X, 0.36, DRUM_Z], [Math.PI / 2, 0, 0]), {
    tile: 0.4,
    castShadow: false,
  });
  // The water, unlit and mapped, so it holds its colour with the lamps off.
  room.geo('tankFluid', new THREE.CylinderGeometry(DRUM_R * 0.95, DRUM_R * 0.95, ceilingHeight - 0.5, 26), poseMatrix([DRUM_X, 0.34 + (ceilingHeight - 0.5) / 2, DRUM_Z]), {
    castShadow: false,
    consume: true,
  });

  /**
   * The shoal. Sixty small dark bodies on three loose rings at three heights,
   * every one of them turned to swim the same way round - a shoal that is not
   * all pointing the same way reads as debris in a jar.
   */
  for (let ringIndex = 0; ringIndex < 3; ringIndex++) {
    const y = 0.9 + ringIndex * 0.95;
    const radius = DRUM_R * (0.45 + ringIndex * 0.16);
    const count = 16 + ringIndex * 4;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ringIndex * 0.4;
      const r = radius + room.range(-0.28, 0.28);
      const px = DRUM_X + Math.cos(a) * r;
      const pz = DRUM_Z + Math.sin(a) * r;
      room.geo('rockDark', new THREE.SphereGeometry(0.075, 6, 5), tiltMatrix([px, y + room.range(-0.25, 0.25), pz], [0, -a, room.range(-0.2, 0.2)], [2.6, 0.8, 0.9]), {
        castShadow: false,
        consume: true,
      });
      if (i % 3 === 0) {
        room.geo('lumenCyan', new THREE.SphereGeometry(0.016, 5, 4), poseMatrix([px + Math.sin(a) * 0.16, y + room.range(-0.25, 0.25), pz - Math.cos(a) * 0.16]), {
          castShadow: false,
          consume: true,
        });
      }
    }
  }
  // A few jellies drifting between the rings, and weed on the tank floor.
  for (let i = 0; i < 5; i++) {
    const a = room.range(0, Math.PI * 2);
    const r = Math.sqrt(room.rng()) * DRUM_R * 0.7;
    jelly(room, DRUM_X + Math.cos(a) * r, room.range(1.4, 2.9), DRUM_Z + Math.sin(a) * r, room.range(0.12, 0.22));
  }
  kelpStand(room, DRUM_X - 0.9, DRUM_Z + 0.7, 4, 2.1, 0.7);
  kelpStand(room, DRUM_X + 1.1, DRUM_Z - 0.8, 3, 1.7, 0.55);

  // The acrylic and its top ring. Open-ended, so you see through both walls and
  // read the shoal on the far side as well as the near one.
  room.geo('glassPane', new THREE.CylinderGeometry(DRUM_R, DRUM_R, ceilingHeight - 0.34, 30, 1, true), poseMatrix([DRUM_X, 0.34 + (ceilingHeight - 0.34) / 2, DRUM_Z]), {
    castShadow: false,
    receiveShadow: false,
    consume: true,
  });
  room.geo('glassEdge', ring(DRUM_R, 0.05, 30), tiltMatrix([DRUM_X, 0.38, DRUM_Z], [Math.PI / 2, 0, 0]), { tile: 0.3, castShadow: false });
  room.geo('steel', new THREE.CylinderGeometry(DRUM_R * 1.1, DRUM_R * 1.02, 0.28, 28), poseMatrix([DRUM_X, ceilingHeight - 0.14, DRUM_Z]), {
    tile: 0.6,
    consume: true,
  });
  // Six stanchions up the outside, so the drum reads as engineered.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    room.geo(
      'steel',
      new THREE.CylinderGeometry(0.07, 0.07, ceilingHeight - 0.5, 7),
      poseMatrix([DRUM_X + Math.cos(a) * (DRUM_R + 0.09), 0.36 + (ceilingHeight - 0.5) / 2, DRUM_Z + Math.sin(a) * (DRUM_R + 0.09)]),
      { tile: 0.4, consume: true },
    );
  }
  room.blockCircle(DRUM_X, DRUM_Z, DRUM_R + 0.2);

  /* --- the walkway ------------------------------------------------------------------ */
  // A rail ringing the drum a metre out, in eight straight runs. Not blocking:
  // it is a hand rail, and the drum behind it is what actually stops you.
  const walk = DRUM_R + 1.15;
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    const a1 = ((i + 1) / 8) * Math.PI * 2;
    railing(
      room,
      [DRUM_X + Math.cos(a0) * walk, 0, DRUM_Z + Math.sin(a0) * walk],
      [DRUM_X + Math.cos(a1) * walk, 0, DRUM_Z + Math.sin(a1) * walk],
      false,
      1.0,
    );
  }

  /* --- the hall around it ------------------------------------------------------------ */
  // Two long benches on the centre lines north and south of the drum, facing it.
  for (const z of [-1.4, 9.4]) {
    room.box('rockPale', [3.2, 0.1, 0.62], [DRUM_X, 0.46, z], 0, { tile: 1.0 });
    for (const dx of [-1.25, 1.25]) {
      room.box('steelDark', [0.14, 0.4, 0.5], [DRUM_X + dx, 0, z], 0, { tile: 0.4 });
    }
    room.collider({ kind: 'box', center: [DRUM_X, z], halfExtents: [1.6, 0.3] });
  }

  // Interpretive plinths in two corners, and the housekeeping in the others.
  for (const [x, z, spin] of [
    [-1.4, 10.9, 0.4],
    [9.6, -2.8, -0.5],
  ] as const) {
    room.solid('steelDark', [0.8, 0.9, 0.6], [x, 0, z], spin, { tile: 0.6 });
    room.geo('screenData', quad(0.6, 0.34), tiltMatrix([x, 1.02, z], [-0.9, spin + Math.PI, 0]), { castShadow: false, receiveShadow: false });
  }
  crate(room, 10.6, -1.6, 0.3, 1.0, 0.85, 0.7, false);
  crate(room, -2.6, -2.6, -0.2, 0.8, 0.6, 0.65, true);
  drum(room, 10.4, 2.4);
  drum(room, -2.8, 9.4, true);
  urchin(room, 1.2, 0.02, -3.2, 0.14);
  debris(room, 7.0, 10.4, 1.3, 10);
  debris(room, -2.0, -1.0, 1.1, 8);
  debris(room, 10.8, 8.0, 1.0, 8);

  /* --- the light ---------------------------------------------------------------------- */
  /**
   * Four lights, which is the whole budget for a four-cell room: two panes in
   * the west wall, one cold lamp beside the drum and one strip over the north
   * bench. The drum itself is emissive and lights the middle of the hall for
   * nothing, which is the only reason a space this size is affordable.
   */
  const drumLamp = new THREE.PointLight(0x46d0f0, 16, ctx.dims.cellSize * 2.4, 2);
  drumLamp.position.set(DRUM_X + DRUM_R + 0.9, 2.4, DRUM_Z - DRUM_R - 0.6);
  room.light(drumLamp);
  swell(room, drumLamp, 16, 0.13, 0.36);
  stripLight(room, DRUM_X, -2.4, 3.0, 0, true, false, 10);

  causticPatch(room, 4.0, 0.4, 2.4);
  causticPatch(room, 0.6, 4.0, 2.2);
  causticPatch(room, 7.6, 5.0, 2.0);
  causticPatch(room, 4.0, 8.4, 2.2);
  glowShaft(room, [-3.4, 2.6, 0.4], [1.0, 0.6, 2.0], 4.0);
  glowShaft(room, [-3.4, 2.6, 8.0], [1.0, 0.6, 6.4], 3.6);
  bioMotes(room, 1.0, 1.7, 2.0, 2.4, 24);
  bioMotes(room, 1.0, 1.7, 6.6, 2.4, 22);
  bioMotes(room, 7.4, 1.5, 7.4, 2.0, 16);
  room.geo('surface.caustic', disc(3.0, 22), tiltMatrix([DRUM_X, ceilingHeight - 0.85, DRUM_Z], [Math.PI / 2, 0, 0]), {
    castShadow: false,
    receiveShadow: false,
    tile: 3.4,
  });

  for (const [index, lamp] of room.lights.entries()) {
    if (index > 1) break; // the two panes; the drum lamp breathes on its own
    swell(room, lamp, 13, 0.12, 0.3 + index * 0.2);
  }

  return room.finish();
}
