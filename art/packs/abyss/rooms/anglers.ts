import * as THREE from 'three';
import type { BuiltRoom, RoomBlueprint, RoomBuildContext } from '../../../lib/contract';
import { poseMatrix, tiltMatrix } from '../../../lib/merge';
import { Room, wallsFor } from './common';
import {
  ball,
  bioMotes,
  causticPatch,
  controlDesk,
  crate,
  cyl,
  debris,
  glowShaft,
  quad,
  railing,
  spike,
  stripLight,
  swell,
} from '../kit/props';

/**
 * The Deep Tank - the exhibit, and the reason nobody works this shift alone.
 *
 * Four metres of acrylic in the aft-facing wall, and on the other side of it a
 * volume of black water with something in it that is bigger than the window.
 * You see a jaw, an eye and a lure, and never the whole animal - the body runs
 * out of frame in both directions, which is the entire trick: a monster you can
 * see all of is a monster you have measured.
 *
 * The lure hangs a hand's breadth from the glass. It is the brightest thing in
 * the room and the only warm colour in it.
 */
export const anglers: RoomBlueprint = {
  id: 'abyss.anglers',
  nameKey: 'room.abyss.anglers',
  footprint: [[0, 0]],
  doorWalls: wallsFor('north', 'south'),
  weight: 8,
  tags: ['abyss', 'aquarium', 'landmark'],
  anchors: {
    chest: [{ position: [-3.2, 0, -2.7], rotationY: -Math.PI / 2 }],
    locker: [{ position: [-3.25, 0, 2.7], rotationY: -Math.PI / 2 }],
    itemSpawn: [
      { position: [-2.2, 0.84, 0.4] },
      { position: [2.3, 0.62, -2.9] },
      { position: [1.4, 0, 2.9] },
    ],
    patrolPoint: [
      { position: [1.6, 0, -1.4] },
      { position: [1.6, 0, 1.4] },
      { position: [-2.2, 0, -1.4] },
    ],
    enemySpawn: [{ position: [-3.2, 0, 0.2] }],
  },
  build,
};

function build(ctx: RoomBuildContext): BuiltRoom {
  const room = new Room(ctx, anglers);
  room.shell({
    floor: 'concrete',
    wall: 'paint',
    ceiling: 'beams',
    band: 'steel',
    bandHeight: 0.6,
    strip: 'cyan',
    mouth: 'collar',
    ports: [
      { side: 'east', kind: 'viewpane', scene: 'open', tall: true },
      { side: 'west', kind: 'monitors', light: true },
    ],
  });

  /* --- what is in the tank -------------------------------------------------------- */
  /**
   * Everything below lives BEHIND the east pane, between x = 4.1 and x = 5.4 -
   * the shell hangs the backdrop at about 1.25 m back, so this sits in the water
   * in front of it. Geometry that leans out of its room costs the room a cell in
   * the culler and nothing else (ROOM_FORMAT.md §7), which is a cheap price for
   * the one thing this map is remembered for.
   *
   * It is built almost entirely as silhouette. At this light level the player is
   * reading an outline, so the shapes are few, big, and unmistakable: a skull, a
   * jaw full of teeth, one eye, and a rod with a light on the end of it.
   */
  /**
   * `HEAD_X` is 5.5, not 4.5. The inside face of that wall is at x = 3.7 and the
   * glass sits at 3.87, so EVERYTHING here has to stay east of about 4.1 - the
   * first pass had the lure and half the teeth hanging in the middle of the
   * room, which turned the exhibit into a decoration standing on the deck.
   */
  const HEAD_X = 5.5;
  const dark = room.mat('rockDark');

  // The skull: a flattened mass, wider than the window is tall.
  room.geo(dark, ball(1.15, 16), tiltMatrix([HEAD_X, 1.62, 0.2], [0, 0.5, 0.1], [1.0, 0.86, 1.35]), {
    tile: 1.4,
    castShadow: false,
  });
  // The body, running out of frame aft. Two masses, each bigger than the last.
  room.geo(dark, ball(1.35, 14), tiltMatrix([HEAD_X + 1.1, 1.75, 1.6], [0, 0.6, 0], [1.1, 0.9, 1.5]), {
    tile: 1.6,
    castShadow: false,
  });
  room.geo(dark, ball(1.1, 12), tiltMatrix([HEAD_X + 0.7, 1.5, -1.9], [0, 0.4, 0], [1.0, 0.8, 1.4]), {
    tile: 1.5,
    castShadow: false,
  });

  /**
   * The jaw. Teeth are cones on TWO arcs, upper and lower, and the lower arc is
   * dropped so the mouth is open - a closed mouth on a shape this size reads as
   * a rock. They are the pale element in an otherwise black animal, which is
   * what makes the silhouette legible.
   */
  for (const [arc, yBase, drop, count] of [
    [1, 1.32, 0, 11],
    [-1, 0.72, 0.12, 9],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count - 0.5;
      const z = t * 2.3;
      const x = HEAD_X - 1.0 + Math.abs(t) * 0.9;
      const len = (0.16 + Math.cos(t * Math.PI) * 0.28) * (arc > 0 ? 1 : 0.86);
      room.geo(
        'shellWhite',
        spike(len * 0.28, len, 5),
        tiltMatrix([x, yBase - arc * (len / 2) - drop, 0.2 + z], [arc > 0 ? Math.PI : 0, 0, t * 0.4]),
        { tile: 0.3, castShadow: false },
      );
    }
    // The gum line the teeth are set in.
    room.geo(dark, new THREE.TorusGeometry(1.05, 0.13, 5, 16, Math.PI), tiltMatrix([HEAD_X - 0.3, yBase, 0.2], [Math.PI / 2, arc > 0 ? 0 : Math.PI, 0]), {
      tile: 0.4,
      castShadow: false,
      consume: true,
    });
  }

  // The eye: a dark sphere set proud of the skull with a small cold pupil ring.
  // Set PROUD, not sunk - an iris tucked inside its own eyeball renders as a
  // black pit, which is the failure ROOM_REVIEW.md §4 records twice.
  room.geo('glassPane', ball(0.24, 12), poseMatrix([HEAD_X - 0.62, 2.05, -0.75]), {
    castShadow: false,
    receiveShadow: false,
  });
  room.geo('lumenCyan', ball(0.1, 9), poseMatrix([HEAD_X - 0.78, 2.05, -0.82]), { castShadow: false });

  /**
   * The illicium: a rod off the brow, arching forward until the lure is a hand's
   * breadth from the glass. Sampled in six segments so it curves - a straight
   * rod at this scale reads as a girder.
   */
  const arc: readonly (readonly [number, number, number])[] = [
    [HEAD_X - 0.55, 2.6, 0.3],
    [HEAD_X - 0.9, 2.92, 0.26],
    [HEAD_X - 1.2, 2.82, 0.2],
    [HEAD_X - 1.32, 2.42, 0.15],
    [HEAD_X - 1.3, 1.95, 0.1],
  ];
  for (let i = 1; i < arc.length; i++) {
    const a = arc[i - 1];
    const b = arc[i];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    room.geo(
      dark,
      cyl(0.05, 0.065, len, 6),
      tiltMatrix([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [Math.acos((b[1] - a[1]) / len), Math.atan2(b[0] - a[0], b[2] - a[2]), 0]),
      { tile: 0.4, castShadow: false },
    );
  }
  const tip = arc[arc.length - 1] ?? [HEAD_X - 1.3, 1.95, 0.1];
  room.geo('lumenAmber', ball(0.16, 12), poseMatrix([tip[0], tip[1], tip[2]]), { castShadow: false });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    room.geo(
      'lumenAmber',
      cyl(0.008, 0.004, 0.34, 4),
      tiltMatrix([tip[0], tip[1] - 0.22, tip[2]], [0.3, a, 0]),
      { castShadow: false },
    );
  }
  // Its own light, in the water, throwing the animal's shadow onto the backdrop.
  const lure = new THREE.PointLight(0xffa838, 14, ctx.dims.cellSize * 1.9, 2);
  lure.position.set(tip[0] - 0.22, tip[1], tip[2]);
  room.light(lure);
  swell(room, lure, 14, 0.28, 0.5);

  /* --- the room in front of it ------------------------------------------------------ */
  // A rail across the glass, an observation desk under the monitor bank, and
  // almost nothing else: the room's whole job is to be a place to stand.
  railing(room, [2.5, 0, -2.0], [2.5, 0, 2.9], false, 1.02);
  controlDesk(room, -2.2, 0.4, 1.7, -Math.PI / 2, true);
  crate(room, 2.3, -2.9, 0.3, 0.9, 0.62, 0.7, false);
  crate(room, -2.9, -1.5, -0.2, 0.7, 0.5, 0.6, true);

  causticPatch(room, 1.8, 0.4, 2.0);
  causticPatch(room, 0.6, -2.2, 1.2);
  glowShaft(room, [3.4, 2.0, 0.2], [0.2, 0.9, 0.2], 3.0, true);
  bioMotes(room, 2.2, 1.6, 0.4, 1.8, 18, true);
  debris(room, 0.4, 2.6, 1.0, 8);
  debris(room, -1.0, -3.0, 0.8, 6);

  // Warning plates on the rail. Dark, unreadable, and there are a lot of them.
  for (let i = 0; i < 3; i++) {
    room.geo('steelDark', quad(0.46, 0.2), tiltMatrix([2.45, 0.88, -1.2 + i * 1.8], [-0.85, -Math.PI / 2, 0]), {
      castShadow: false,
      receiveShadow: false,
    });
  }

  // No ceiling fitting in here works. The room is lit by the lure and by the
  // monitor bank behind you, which is exactly two real lights.
  stripLight(room, 0, -1.6, 2.2, Math.PI / 2, false, true);
  stripLight(room, 0, 1.6, 2.2, Math.PI / 2, false, true);
  // The volume of water, BEHIND the glass. In front of it a translucent sheet
  // would grey the whole window over, which is the one thing a viewing pane
  // cannot survive (ROOM_REVIEW.md §4).
  room.geo('waterHaze', quad(5.4, 2.6), poseMatrix([4.4, 1.7, 0.2], -Math.PI / 2), { castShadow: false, receiveShadow: false });

  return room.finish();
}
