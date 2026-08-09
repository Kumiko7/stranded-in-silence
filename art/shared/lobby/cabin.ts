/**
 * The lobby: a log cabin high in the snow, and the only warm, bright, safe place
 * in the game.
 *
 * It is built to be the deliberate opposite of a run. The manor is dark, cold
 * and close; this is a big open hall with daylight coming off a glacier through
 * a seven-metre window, a fire going, and pine everywhere. That contrast is the
 * point: a lobby that looked like the game would make going in feel like nothing.
 *
 * Everything logic drives - the posters, the wardrobe, the difficulty lever -
 * is placed by `src/world/lobbyScene.ts` at the anchors this file returns. The
 * cabin itself is geometry and light.
 *
 * Frame: origin at the centre of the floor, -Z is the window wall, +Z the poster
 * wall, -X the fireplace, +X the far gable. As everywhere in art, `y` positions
 * are the BOTTOM of the thing being placed.
 */
import * as THREE from 'three';
import type { ArtBuildContext, Collider } from '../../lib/contract';
import { boxGeometry } from '../../lib/build';
import { poseMatrix, tiltMatrix } from '../../lib/merge';
import { Builder } from './build';
import { POSTER_HEIGHT, POSTER_WIDTH } from './poster';

/* --- the shape of the room ----------------------------------------------------- */

/** Interior half-extents. The hall is 12 m along X and 9 m along Z. */
export const HALF_X = 6;
export const HALF_Z = 4.5;
/** Wall plate height, and the ridge above it. The roof runs along X. */
export const EAVE = 3.4;
export const RIDGE = 4.7;

const WALL = 0.34;
const LOG_COURSE = 0.3;
/** How far a log course stands proud of the wall it is fixed to. */
const LOG_PROUD = LOG_COURSE * 0.56;

/** Front face of the poster board, and the plane the posters hang on in front of it. */
const BOARD_FACE = HALF_Z - LOG_PROUD - 0.03;
const POSTER_FACE = BOARD_FACE - 0.04;

/** Where the window is, in the -Z wall. */
const WINDOW_HALF = 3.5;
const WINDOW_SILL = 0.95;
const WINDOW_HEAD = 2.85;

/**
 * The two holes in the east gable, both of them measured along Z.
 *
 * The mirror is a lit chamber behind a pane of glass with a copy of the player
 * standing in it; the fence is a waist-high rail across a full-height opening
 * into the dart annex. Both need the logs left out over their span, which is why
 * that wall is built as panels rather than as one box.
 */
const MIRROR_Z = -1.55;
const MIRROR_HALF = 0.6;
const MIRROR_SILL = 0.05;
const MIRROR_HEAD = 2.2;
/** How far the chamber behind the glass runs back, past the wall. */
const MIRROR_DEPTH = 0.95;

export const FENCE_FROM = 0.4;
export const FENCE_TO = 3.95;
const FENCE_HEAD = 2.45;
/** Rail height. Chest high on a standing player: see over, never step over. */
export const FENCE_RAIL = 1.15;

/**
 * The dart annex on the far side of that fence: its own little room, floored,
 * walled and lit, with nothing in it but the board, the scoreboard and the
 * lamp over them. It is never walked into - the perimeter collider still stops
 * you at the fence - so it is built as scenery you look at through an opening.
 */
const ANNEX_DEPTH = 2.0;
const ANNEX_HEIGHT = 2.75;
/** Inner face of the annex's far wall: what a dart is thrown at. */
export const BOARD_X = HALF_X + WALL + ANNEX_DEPTH;
/** Centre of the board, and of the throwing line in front of it. */
export const BOARD_Z = 1.55;
/** Regulation, and it happens to sit dead centre of the opening. */
export const BOARD_HEIGHT = 1.73;
const SCOREBOARD_Z = 3.0;
const SCOREBOARD_Y = 1.12;

export interface Pose {
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
}

export interface CabinAnchors {
  /** Where the four players stand when they arrive. */
  readonly playerSpawns: readonly Pose[];
  /** One per poster slot, bottom-centre of the frame, already facing the room. */
  readonly posters: readonly Pose[];
  readonly wardrobe: Pose;
  /** Inside the mirror: where the player's own copy stands. */
  readonly mannequin: Pose;
  /** Camera pose for the wardrobe panel: model on the right, options on the left. */
  readonly wardrobeCamera: { readonly position: readonly [number, number, number]; readonly yaw: number; readonly pitch: number };
  readonly lever: Pose;
  /** The rack of darts on the cabin side of the fence. */
  readonly dartStand: Pose;
  /** The board on the annex's far wall, at its CENTRE rather than its bottom. */
  readonly dartboard: Pose;
  readonly scoreboard: Pose;
}

export interface BuiltCabin {
  object: THREE.Group;
  colliders: Collider[];
  lights: THREE.Light[];
  anchors: CabinAnchors;
  dispose(): void;
}

/** Clear air between one poster and the next, across and up. */
const POSTER_GAP_X = 0.34;
const POSTER_GAP_Y = 0.2;
/** Bottom of the lowest row: above the skirting, below the eye. */
const POSTER_BOTTOM = 0.55;

/**
 * Poster slots, laid out across the +Z wall.
 *
 * Columns are capped at ten so the wall never has to hold a poster narrower
 * than it is tall; extra slots stack into further rows, filling the top row
 * first so a short list lands at eye level rather than round the ankles.
 *
 * The vertical pitch is FIXED rather than fitted to the wall - fitting it is how
 * two rows end up overlapping the moment the slot count changes.
 */
function posterAnchors(slots: number): Pose[] {
  const columns = Math.min(10, Math.max(1, slots));
  const rows = Math.max(1, Math.ceil(slots / columns));

  const pitchX = POSTER_WIDTH + POSTER_GAP_X;
  const firstX = -((columns - 1) * pitchX) / 2;
  const pitchY = POSTER_HEIGHT + POSTER_GAP_Y;
  const topRow = POSTER_BOTTOM + (rows - 1) * pitchY;

  const anchors: Pose[] = [];
  for (let i = 0; i < slots; i++) {
    const row = Math.floor(i / columns);
    const column = i % columns;
    anchors.push({
      // Posters are built facing -Z, and -Z from this wall is into the room, so
      // they hang unrotated.
      position: [firstX + column * pitchX, topRow - row * pitchY, POSTER_FACE],
      rotationY: 0,
    });
  }
  return anchors;
}

export function buildCabin(ctx: ArtBuildContext, posterSlots: number): BuiltCabin {
  const b = new Builder(ctx.materials, ctx.rng);

  perimeter(b);
  floorAndCeiling(b);
  logWalls(b);
  window_(b);
  mirrorWall(b);
  fireplace(b);
  posterWall(b, posterSlots);
  furniture(b);
  dartAnnex(b);
  outside(b);
  lighting(b);

  const built = b.finish();
  return {
    object: built.object,
    colliders: built.colliders,
    lights: built.lights,
    anchors: {
      playerSpawns: [
        { position: [1.6, 0, 1.4], rotationY: Math.PI / 2 },
        { position: [2.8, 0, 0.2], rotationY: Math.PI / 2 },
        { position: [1.6, 0, -0.9], rotationY: Math.PI / 2 },
        { position: [3.2, 0, -1.9], rotationY: Math.PI / 2 },
      ],
      posters: posterAnchors(posterSlots),
      // Everything on the +X gable faces -X, which from a -Z default is a
      // quarter turn the other way. The wardrobe is pushed to the window end of
      // that wall to leave room for the mirror beside it.
      wardrobe: { position: [HALF_X - 0.42, 0, -3.35], rotationY: Math.PI / 2 },
      /**
       * Inside the mirror, not beside the wardrobe.
       *
       * The player's own model used to stand out on the floorboards, which read
       * as a fourth player standing very still - so it now stands in a lit
       * chamber behind a pane of glass, at about the depth a reflection of
       * somebody a metre from the mirror would be.
       */
      mannequin: { position: [HALF_X + 0.52, 0, MIRROR_Z], rotationY: Math.PI / 2 },
      /**
       * Square on to the mirror and turned a third of a radian past it, which is
       * what puts the model on the right of the screen and leaves the left half
       * clear for the wardrobe panel.
       */
      wardrobeCamera: { position: [3.5, 1.5, -0.9], yaw: -1.0, pitch: -0.117 },
      // Turned to face +X: the players arrive east of it and walk west.
      lever: { position: [0, 0, 0.2], rotationY: -Math.PI / 2 },
      // In front of the fence, square on to the dartboard through it.
      dartStand: { position: [HALF_X - 1.05, 0, BOARD_Z], rotationY: -Math.PI / 2 },
      // Both hang on the annex's far wall, so both face back into the cabin.
      dartboard: { position: [BOARD_X, BOARD_HEIGHT, BOARD_Z], rotationY: Math.PI / 2 },
      scoreboard: { position: [BOARD_X, SCOREBOARD_Y, SCOREBOARD_Z], rotationY: Math.PI / 2 },
    },
    dispose: built.dispose,
  };
}

/* --- shell --------------------------------------------------------------------- */

function floorAndCeiling(b: Builder): void {
  // Floor, and the joist ends you can see at the hearth step.
  b.box('cabin.floor', [HALF_X * 2 + WALL * 2, 0.2, HALF_Z * 2 + WALL * 2], [0, -0.2, 0], 0, {
    tile: 2.2,
    castShadow: false,
  });

  // Gabled ceiling: two slopes meeting over the middle of the room, boarded
  // between the rafters. The roof runs along X, so the slope is in Z.
  const run = HALF_Z + WALL;
  const rise = RIDGE - EAVE;
  const slope = Math.atan2(rise, run);
  const length = Math.hypot(run, rise);

  for (const sign of [-1, 1]) {
    const geometry = boxGeometry(HALF_X * 2 + WALL * 2, 0.12, length);
    b.geo(
      'cabin.boards',
      geometry,
      tiltMatrix([0, EAVE + rise / 2 + 0.06, (sign * run) / 2], [sign * slope, 0, 0]),
      { tile: 1.1, castShadow: false },
    );
  }

  // Ridge beam, purlins and rafters. Heavy timber is most of what says "cabin".
  b.box('beam', [HALF_X * 2 + WALL * 2, 0.28, 0.24], [0, RIDGE - 0.28, 0], 0, { tile: 1.4 });

  const rafterCount = 9;
  for (let i = 0; i < rafterCount; i++) {
    const x = -HALF_X + 0.4 + (i * (HALF_X * 2 - 0.8)) / (rafterCount - 1);
    for (const sign of [-1, 1]) {
      const geometry = boxGeometry(0.16, 0.22, length);
      b.geo('beam', geometry, tiltMatrix([x, EAVE + rise / 2 - 0.05, (sign * run) / 2], [sign * slope, 0, 0]), {
        tile: 1.2,
      });
    }
    // Collar tie across the two slopes, high enough to walk under.
    if (i % 2 === 0) b.box('beam', [0.14, 0.16, run * 1.15], [x, EAVE + 0.55, 0], 0, { tile: 1.2 });
  }

  // Wall plate the rafters sit on, all four sides.
  b.box('beam', [HALF_X * 2 + WALL * 2, 0.2, 0.26], [0, EAVE - 0.2, -HALF_Z - 0.06], 0, { tile: 1.4 });
  b.box('beam', [HALF_X * 2 + WALL * 2, 0.2, 0.26], [0, EAVE - 0.2, HALF_Z + 0.06], 0, { tile: 1.4 });
}

/**
 * Stacked log courses on the inside face of a wall.
 *
 * Full cylinders, centred exactly on the face plane, so half of each log is
 * buried in the wall behind it and half stands proud into the room. Half-shells
 * would be cheaper by a few triangles and would need their opening turned to
 * face the room on four different walls; this cannot be got wrong.
 */
function logCourses(b: Builder, alongX: boolean, face: number, centre: number, span: number, from: number, to: number): void {
  const radius = LOG_COURSE * 0.56;
  // Courses sit on ONE grid for the whole cabin rather than starting fresh at
  // the bottom of each panel - otherwise the logs either side of the window,
  // the mirror and the fence run at different heights and the wall falls apart.
  const first = Math.ceil((from - LOG_COURSE / 2) / LOG_COURSE) * LOG_COURSE + LOG_COURSE / 2;
  for (let y = first; y < to; y += LOG_COURSE) {
    const geometry = new THREE.CylinderGeometry(radius, radius, span, 7);
    b.geo(
      'cabin.log',
      geometry,
      alongX
        ? tiltMatrix([centre, y, face], [0, 0, Math.PI / 2])
        : tiltMatrix([face, y, centre], [Math.PI / 2, 0, 0]),
      { tile: 1.9, consume: true },
    );
  }
}

/**
 * The walkable bounds, as four slabs outside the room.
 *
 * Written explicitly rather than falling out of the wall boxes, because the log
 * courses stand 17 cm proud of the wall they are fixed to - collide against the
 * boxes alone and players sink into the logs.
 */
function perimeter(b: Builder): void {
  const insetX = HALF_X - LOG_PROUD;
  const insetZ = HALF_Z - LOG_PROUD;
  const thickness = 1;

  b.collider({ kind: 'box', center: [0, -insetZ - thickness], halfExtents: [HALF_X + 2, thickness] });
  b.collider({ kind: 'box', center: [0, insetZ + thickness], halfExtents: [HALF_X + 2, thickness] });
  b.collider({ kind: 'box', center: [-insetX - thickness, 0], halfExtents: [thickness, HALF_Z + 2] });
  b.collider({ kind: 'box', center: [insetX + thickness, 0], halfExtents: [thickness, HALF_Z + 2] });
}

/**
 * One panel of a gable wall: the log box plus the courses on its inner face.
 * `x` is the centre of the wall box; the face the courses sit on is derived from
 * which side of the room it is.
 */
function gablePanel(b: Builder, sign: number, fromZ: number, toZ: number, fromY: number, toY: number): void {
  const width = toZ - fromZ;
  const height = toY - fromY;
  if (width <= 0.002 || height <= 0.002) return;

  const centre = (fromZ + toZ) / 2;
  b.box('cabin.log', [WALL, height, width], [sign * (HALF_X + WALL / 2), fromY, centre], 0, { tile: 1.9 });
  logCourses(b, false, sign * HALF_X, centre, width, fromY, toY);
}

function logWalls(b: Builder): void {
  const span = HALF_X * 2 + WALL * 2;

  // The poster wall. Most of it ends up behind the board, but the ends show.
  b.box('cabin.log', [span, EAVE + 0.1, WALL], [0, 0, HALF_Z + WALL / 2], 0, { tile: 1.9 });
  logCourses(b, true, HALF_Z, 0, span, 0, EAVE);

  const end = HALF_Z + WALL;

  // West gable: the fireplace stands against it, and it is unbroken.
  gablePanel(b, -1, -end, end, 0, EAVE + 0.1);

  /**
   * East gable, in five pieces around the mirror and the fence. The wardrobe
   * stands at the window end of it, then the mirror, then the opening into the
   * dart annex - which is why nothing else is allowed to lean on this wall.
   */
  gablePanel(b, 1, -end, MIRROR_Z - MIRROR_HALF, 0, EAVE + 0.1);
  gablePanel(b, 1, MIRROR_Z - MIRROR_HALF, MIRROR_Z + MIRROR_HALF, 0, MIRROR_SILL);
  gablePanel(b, 1, MIRROR_Z - MIRROR_HALF, MIRROR_Z + MIRROR_HALF, MIRROR_HEAD, EAVE + 0.1);
  gablePanel(b, 1, MIRROR_Z + MIRROR_HALF, FENCE_FROM, 0, EAVE + 0.1);
  gablePanel(b, 1, FENCE_FROM, FENCE_TO, FENCE_HEAD, EAVE + 0.1);
  gablePanel(b, 1, FENCE_TO, end, 0, EAVE + 0.1);

  // Lintels over the two openings: the timber actually carrying the wall above.
  b.box('beam', [WALL + 0.16, 0.2, MIRROR_HALF * 2 + 0.3], [HALF_X + WALL / 2, MIRROR_HEAD - 0.2, MIRROR_Z], 0, { tile: 1.3 });
  b.box('beam', [WALL + 0.16, 0.24, FENCE_TO - FENCE_FROM + 0.4], [HALF_X + WALL / 2, FENCE_HEAD - 0.24, (FENCE_FROM + FENCE_TO) / 2], 0, {
    tile: 1.3,
  });

  for (const sign of [-1, 1]) {
    // The triangle above the wall plate is boarded, not logged - which is how
    // these were really built, and it keeps the ridge end from reading as a slab.
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const halfWidth = (HALF_Z + WALL) * (1 - t);
      b.box(
        'cabin.boards',
        [WALL, (RIDGE - EAVE) / steps + 0.02, halfWidth * 2],
        [sign * (HALF_X + WALL / 2), EAVE + t * (RIDGE - EAVE), 0],
        0,
        { tile: 1.1 },
      );
    }
  }
}

/* --- the mirror ---------------------------------------------------------------- */

/**
 * The mirror on the east gable, and the chamber behind it.
 *
 * This is a **fake** mirror and is meant to be. A real one is a second render
 * pass through a reflected camera, and the only thing in the cabin worth
 * reflecting is the player's own model - which was already being built and
 * stood on the floorboards, where it read as a fourth player standing very
 * still. So the model moved *into* the wall instead: a lit, boarded chamber
 * behind a tinted pane, floored with the same boards as the room, at about the
 * depth a reflection of somebody a metre out would sit at.
 *
 * `src/game/Lobby.ts` puts the copy at `anchors.mannequin`, which is inside
 * here. Nothing about that changed - only where the anchor points.
 */
function mirrorWall(b: Builder): void {
  const face = HALF_X - LOG_PROUD;
  const inner = HALF_X;
  const back = HALF_X + MIRROR_DEPTH;
  const half = MIRROR_HALF;
  const centre = (inner + back) / 2;
  const depth = back - inner;

  // Chamber: same floorboards as the room, dark boards everywhere else. The
  // floor is what sells it - a reflection stands on the floor you are on.
  b.box('cabin.floor', [depth + 0.2, 0.08, half * 2], [centre, -0.08, MIRROR_Z], 0, { tile: 2.2, castShadow: false });
  b.box('timberDark', [depth, 0.1, half * 2 + 0.2], [centre, MIRROR_HEAD, MIRROR_Z], 0, { tile: 1.0 });
  b.box('timberDark', [0.1, MIRROR_HEAD + 0.1, half * 2 + 0.2], [back, 0, MIRROR_Z], 0, { tile: 1.0 });
  for (const sign of [-1, 1]) {
    b.box('timberDark', [depth, MIRROR_HEAD + 0.1, 0.1], [centre, 0, MIRROR_Z + sign * (half + 0.05)], 0, { tile: 1.0 });
  }

  /**
   * A lamp inside it. Without one the copy is lit by ambient alone and reads as
   * a silhouette in a cupboard; with one the chamber glows faintly, which is
   * also what stops the glass reading as a black rectangle.
   */
  const glow = new THREE.PointLight(0xffe6c6, 3.4, 4.2, 2);
  glow.position.set(inner + 0.42, 2.0, MIRROR_Z);
  b.light(glow);

  // The pane. Tinted, glossy and mostly transparent: enough to say "glass",
  // not enough to hide what is behind it.
  b.box('mirrorGlass', [0.03, MIRROR_HEAD - MIRROR_SILL, half * 2], [face - 0.015, MIRROR_SILL, MIRROR_Z], 0, {
    castShadow: false,
    receiveShadow: false,
  });

  /**
   * Two pale streaks raked across the glass.
   *
   * This is the whole trick. Without them the chamber reads as a lit alcove
   * with somebody standing in it - the frame alone does not say "mirror",
   * because a display case has a frame too. A sheen that does not move when you
   * do is the one cue every fake mirror in every game leans on, and it costs two
   * transparent quads.
   */
  for (const [offset, extent, thickness] of [
    [0.24, 0.86, 0.1],
    [-0.14, 0.5, 0.045],
  ] as const) {
    // Thin along the normal (X), tall in Y, `thickness` wide in Z, then raked by
    // spinning it about the normal so it runs corner to corner.
    const streak = boxGeometry(0.008, (MIRROR_HEAD - MIRROR_SILL) * extent, thickness);
    b.geo('mirrorSheen', streak, tiltMatrix([face - 0.035, (MIRROR_HEAD + MIRROR_SILL) / 2, MIRROR_Z + offset], [0.34, 0, 0]), {
      castShadow: false,
      receiveShadow: false,
      consume: true,
    });
  }

  /**
   * Frame: two stiles, two rails, a moulded inner lip, a pediment and brass
   * bosses. Deliberately HEAVY - a thin surround round a lit recess reads as a
   * doorway with somebody standing in it, and no amount of glass fixes that.
   */
  const proud = 0.2;
  const fx = face - proud / 2;
  const outerHalf = half + 0.12;
  const tall = MIRROR_HEAD - MIRROR_SILL + 0.48;
  b.box('timber', [proud, tall, 0.24], [fx, MIRROR_SILL - 0.24, MIRROR_Z - outerHalf], 0, { tile: 0.7 });
  b.box('timber', [proud, tall, 0.24], [fx, MIRROR_SILL - 0.24, MIRROR_Z + outerHalf], 0, { tile: 0.7 });
  b.box('timber', [proud, 0.24, half * 2 + 0.48], [fx, MIRROR_SILL - 0.24, MIRROR_Z], 0, { tile: 0.7 });
  b.box('timber', [proud, 0.24, half * 2 + 0.48], [fx, MIRROR_HEAD, MIRROR_Z], 0, { tile: 0.7 });
  // Inner lip: a dark bead right against the glass, which is what reads as the
  // edge of a mirror rather than as the edge of a hole.
  for (const sz of [-1, 1]) {
    b.box('timberDark', [0.06, MIRROR_HEAD - MIRROR_SILL, 0.05], [face - 0.055, MIRROR_SILL, MIRROR_Z + sz * (half - 0.02)], 0, {
      tile: 0.5,
    });
  }
  b.box('timberDark', [0.06, 0.05, half * 2], [face - 0.055, MIRROR_HEAD - 0.05, MIRROR_Z], 0, { tile: 0.5 });
  b.box('timberDark', [0.06, 0.05, half * 2], [face - 0.055, MIRROR_SILL, MIRROR_Z], 0, { tile: 0.5 });
  b.box('timberDark', [proud + 0.09, 0.08, half * 2 + 0.66], [face - (proud + 0.09) / 2, MIRROR_HEAD + 0.24, MIRROR_Z], 0, {
    tile: 0.7,
  });
  for (const sz of [-1, 1]) {
    for (const sy of [MIRROR_SILL - 0.16, MIRROR_HEAD + 0.06]) {
      b.box('brass', [0.06, 0.08, 0.08], [face - proud - 0.02, sy, MIRROR_Z + sz * outerHalf], 0, { tile: 0.2 });
    }
  }

  // A shelf under it, with the sort of thing that ends up on one.
  b.box('timberDark', [0.24, 0.05, half * 2 + 0.66], [face - 0.12, MIRROR_SILL - 0.42, MIRROR_Z], 0, { tile: 0.6 });
  b.box('ceramic', [0.11, 0.14, 0.11], [face - 0.13, MIRROR_SILL - 0.37, MIRROR_Z - 0.5], 0.4, { tile: 0.3 });
  b.box('brass', [0.08, 0.1, 0.08], [face - 0.12, MIRROR_SILL - 0.37, MIRROR_Z + 0.58], -0.3, { tile: 0.2 });

  // The frame stands proud of the wall the perimeter collider is drawn on, so
  // it gets one of its own - otherwise you can put your head through it.
  b.collider({ kind: 'box', center: [face - proud / 2, MIRROR_Z], halfExtents: [proud / 2, outerHalf + 0.07] });
}

/* --- the dart annex -------------------------------------------------------------- */

/**
 * The fence across the east gable's big opening, and the room on the far side
 * of it. You can see over the fence and you can throw over it; you cannot walk
 * over it, because the cabin's perimeter collider was never cut for this
 * opening and does not need to be.
 *
 * The board and the scoreboard are placed at anchors by `lobbyScene.ts` - logic
 * drives both. Everything here is the room they live in.
 */
function dartAnnex(b: Builder): void {
  const inner = HALF_X + WALL;
  const width = FENCE_TO - FENCE_FROM;
  const centreZ = (FENCE_FROM + FENCE_TO) / 2;
  const depth = ANNEX_DEPTH;

  /* --- the room ------------------------------------------------------------ */

  /**
   * Floor, ceiling, far wall and two sides, all in DARK timber. The cabin is
   * pale pine everywhere else and the annex started out the same, which blew the
   * board out completely - a white disc with a dot in it. A dartboard has to be
   * the brightest thing in the room it is in, and the cheapest way to arrange
   * that is to make the room dark.
   */
  b.box('cabin.floor', [depth + 0.3, 0.2, width + 0.6], [inner + depth / 2, -0.2, centreZ], 0, {
    tile: 2.2,
    castShadow: false,
  });
  b.box('timberDark', [depth + 0.3, 0.14, width + 0.6], [inner + depth / 2, ANNEX_HEIGHT, centreZ], 0, {
    tile: 1.1,
    castShadow: false,
  });
  b.box('timberDark', [0.2, ANNEX_HEIGHT + 0.14, width + 0.6], [inner + depth + 0.1, 0, centreZ], 0, { tile: 1.1 });
  for (const sign of [-1, 1]) {
    b.box('timberDark', [depth + 0.3, ANNEX_HEIGHT + 0.14, 0.2], [inner + depth / 2, 0, centreZ + sign * (width / 2 + 0.2)], 0, {
      tile: 1.1,
    });
  }
  // Skirting, and a board along the foot of the far wall where the wides land.
  b.box('beam', [depth + 0.2, 0.18, 0.1], [inner + depth / 2, 0, centreZ - width / 2 - 0.08], 0, { tile: 0.9 });
  b.box('beam', [depth + 0.2, 0.18, 0.1], [inner + depth / 2, 0, centreZ + width / 2 + 0.08], 0, { tile: 0.9 });
  b.box('beam', [0.1, 0.18, width + 0.2], [inner + depth - 0.05, 0, centreZ], 0, { tile: 0.9 });
  // Corner posts at the FRONT corners only. They were at the back, where they
  // stood right in front of the scoreboard and took a digit off every score.
  for (const sign of [-1, 1]) {
    b.box('beam', [0.14, ANNEX_HEIGHT, 0.14], [inner + 0.07, 0, centreZ + sign * (width / 2 - 0.07)], 0, { tile: 0.9 });
  }

  /* --- the fence ------------------------------------------------------------ */

  // Reveal boards lining the opening, then the fence itself in it.
  for (const sign of [-1, 1]) {
    b.box('timberDark', [WALL + 0.1, FENCE_HEAD, 0.08], [HALF_X + WALL / 2, 0, centreZ + sign * (width / 2 - 0.04)], 0, {
      tile: 0.8,
    });
  }

  const fx = HALF_X + WALL / 2;
  const posts = 6;
  for (let i = 0; i < posts; i++) {
    const z = FENCE_FROM + 0.1 + (i * (width - 0.2)) / (posts - 1);
    b.box('timberDark', [0.11, FENCE_RAIL, 0.11], [fx, 0, z], 0, { tile: 0.5 });
  }
  // Two rails and a broad capping board you can lean a drink on.
  b.box('timber', [0.09, 0.09, width], [fx, 0.42, centreZ], 0, { tile: 1.0 });
  b.box('timber', [0.09, 0.09, width], [fx, 0.8, centreZ], 0, { tile: 1.0 });
  b.box('timber', [WALL + 0.14, 0.09, width + 0.1], [fx, FENCE_RAIL, centreZ], 0, { tile: 1.0 });
  // Chicken wire, in the form of a few slim uprights between the posts: enough
  // to say "barrier", cheap enough to see straight through.
  for (let i = 0; i < 15; i++) {
    const z = FENCE_FROM + 0.18 + (i * (width - 0.36)) / 14;
    b.box('iron', [0.03, FENCE_RAIL - 0.09, 0.03], [fx, 0, z], 0, { tile: 0.3 });
  }

  /* --- light --------------------------------------------------------------- */

  // A shaded lamp on the annex ceiling, hung over the board. The cabin's own
  // lights are all on the wrong side of a wall from here.
  const shadeY = ANNEX_HEIGHT - 0.45;
  b.box('iron', [0.03, 0.45, 0.03], [BOARD_X - 0.55, shadeY, BOARD_Z], 0, { tile: 0.3 });
  const shade = new THREE.ConeGeometry(0.3, 0.24, 10, 1, true);
  b.geo('iron', shade, tiltMatrix([BOARD_X - 0.55, shadeY - 0.02, BOARD_Z], [Math.PI, 0, 0]), { tile: 0.4, consume: true });
  b.box('lampGlow', [0.12, 0.1, 0.12], [BOARD_X - 0.61, shadeY - 0.14, BOARD_Z - 0.06], 0, { castShadow: false });

  const lamp = new THREE.PointLight(0xfff0d2, 7, 5, 2);
  lamp.position.set(BOARD_X - 0.7, shadeY - 0.1, BOARD_Z);
  b.light(lamp);
}

/**
 * The window wall. Built as four pieces around a 7 m opening, then mullions and
 * glass, then a seat under the sill. This is the view the whole room is aimed at.
 */
function window_(b: Builder): void {
  const z = -HALF_Z - WALL / 2;
  const outer = HALF_X + WALL;

  // Piers either side, and the panels above and below the opening. Collision is
  // the perimeter's job, so none of this carries a collider of its own.
  for (const sign of [-1, 1]) {
    const width = outer - WINDOW_HALF;
    const centre = sign * (WINDOW_HALF + width / 2);
    b.box('cabin.log', [width, EAVE + 0.1, WALL], [centre, 0, z], 0, { tile: 1.9 });
    logCourses(b, true, -HALF_Z, centre, width, 0, EAVE);
  }
  b.box('cabin.log', [WINDOW_HALF * 2, WINDOW_SILL, WALL], [0, 0, z], 0, { tile: 1.9 });
  logCourses(b, true, -HALF_Z, 0, WINDOW_HALF * 2, 0, WINDOW_SILL - 0.12);
  b.box('cabin.log', [WINDOW_HALF * 2, EAVE - WINDOW_HEAD + 0.1, WALL], [0, WINDOW_HEAD, z], 0, { tile: 1.9 });
  logCourses(b, true, -HALF_Z, 0, WINDOW_HALF * 2, WINDOW_HEAD + 0.28, EAVE);

  // A heavy timber lintel: the thing actually holding the wall up over 7 metres.
  b.box('beam', [WINDOW_HALF * 2 + 0.5, 0.3, WALL + 0.14], [0, WINDOW_HEAD - 0.02, z], 0, { tile: 1.3 });
  b.box('timberDark', [WINDOW_HALF * 2 + 0.5, 0.12, WALL + 0.22], [0, WINDOW_SILL - 0.12, z], 0, { tile: 1.3 });

  // Four lights, divided by mullions. Glass is one pane per bay so the frame
  // reads as joinery rather than as a grid drawn on a sheet.
  const bays = 4;
  const bayWidth = (WINDOW_HALF * 2) / bays;
  for (let i = 0; i <= bays; i++) {
    const x = -WINDOW_HALF + i * bayWidth;
    b.box('timberDark', [0.13, WINDOW_HEAD - WINDOW_SILL, WALL + 0.06], [x, WINDOW_SILL, z], 0, { tile: 0.9 });
  }
  // Transom across the middle of each bay.
  b.box('timberDark', [WINDOW_HALF * 2, 0.09, WALL + 0.04], [0, (WINDOW_SILL + WINDOW_HEAD) / 2, z], 0, { tile: 0.9 });

  for (let i = 0; i < bays; i++) {
    const x = -WINDOW_HALF + bayWidth * (i + 0.5);
    const geometry = boxGeometry(bayWidth - 0.13, WINDOW_HEAD - WINDOW_SILL - 0.09, 0.02);
    b.geo('glass', geometry, poseMatrix([x, (WINDOW_SILL + WINDOW_HEAD) / 2, z]), {
      castShadow: false,
      receiveShadow: false,
    });
  }

  // Window seat: cushions, a folded blanket, and a place to actually stand and
  // look. Solid, so nobody walks through it into the glass.
  b.solid('timber', [WINDOW_HALF * 2 - 0.3, 0.52, 0.62], [0, 0, -HALF_Z + 0.31], 0, { tile: 1.2 });
  for (let i = 0; i < 5; i++) {
    const x = -2.6 + i * 1.3;
    b.box(i % 2 === 0 ? 'cushion' : 'cushionGreen', [1.1, 0.14, 0.56], [x, 0.52, -HALF_Z + 0.31], 0, { tile: 0.8 });
  }
  b.box('fur', [1.0, 0.1, 0.5], [2.4, 0.66, -HALF_Z + 0.34], 0.06, { tile: 0.8 });
}

/* --- the fire ------------------------------------------------------------------ */

/**
 * The inglenook.
 *
 * The proportions here are all in service of one thing: from the middle of the
 * room you should see FIRE, not masonry. The opening is deliberately huge (2 m
 * across, 1.4 m tall) and everything above the mantel is a hood that steps in
 * and back on its way to the ridge, rather than the full-height slab of stone
 * this used to be - which was the single largest surface in the cabin and made
 * the whole west end read as a quarry face.
 */
function fireplace(b: Builder): void {
  const x = -HALF_X;
  const breadth = 3.0;
  const proud = 0.62;

  const mouthWidth = 2.0;
  const mouthHeight = 1.42;
  const hearth = 0.28;
  /** Top of the opening: the underside of the bressummer beam. */
  const lintel = hearth + mouthHeight;

  // Battered base, and the two cheeks the beam sits on. There is no stone at
  // all directly over the fire - the beam spans it, as it would in a real one.
  b.solid('cabin.stone', [proud + 0.3, 1.2, breadth + 0.4], [x + (proud + 0.3) / 2, 0, 0], 0, { tile: 2.6 });
  for (const sign of [-1, 1]) {
    const width = (breadth - mouthWidth) / 2;
    b.box('cabin.stone', [proud + 0.34, lintel, width], [x + (proud + 0.34) / 2, 0, (sign * (mouthWidth + width)) / 2], 0, {
      tile: 2.6,
    });
  }
  b.box('cabin.soot', [0.12, mouthHeight + 0.5, mouthWidth], [x + 0.3, hearth, 0], 0, { tile: 1.2 });

  // Raised hearthstone, which is also the thing that stops you standing in it.
  b.solid('cabin.stone', [proud + 0.55, hearth, breadth + 0.4], [x + (proud + 0.55) / 2, 0, 0], 0, { tile: 2.6 });

  // Mantel: one enormous adzed beam spanning the opening, and the clutter on it.
  const mantel = 0.3;
  b.box('beam', [proud + 0.5, mantel, breadth + 0.1], [x + (proud + 0.5) / 2, lintel, 0], 0, { tile: 1.4 });
  b.box('ceramic', [0.2, 0.3, 0.2], [x + 0.5, lintel + mantel, -1.1], 0.3, { tile: 0.4 });
  b.box('brass', [0.16, 0.22, 0.16], [x + 0.46, lintel + mantel, 1.2], -0.2, { tile: 0.4 });
  b.box('timberDark', [0.1, 0.34, 0.5], [x + 0.5, lintel + mantel, 0.35], 0.08, { tile: 0.5 });

  /**
   * The hood. Five courses, each narrower and shallower than the one below, so
   * the chimney tapers away toward the ridge instead of standing over the room.
   */
  const hoodBottom = lintel + mantel;
  const courses = 5;
  const course = (RIDGE - hoodBottom) / courses;
  for (let i = 0; i < courses; i++) {
    const t = i / courses;
    const width = breadth * (1 - t * 0.6);
    const depth = proud * (1 - t * 0.4);
    b.box('cabin.stone', [depth, course + 0.02, width], [x + depth / 2, hoodBottom + t * (RIDGE - hoodBottom), 0], 0, {
      tile: 2.6,
    });
  }

  /* --- the fire itself --------------------------------------------------- */

  const fireX = x + 0.58;
  const fireY = hearth + 0.04;

  // A wrought grate, so the pile sits UP in the middle of the opening rather
  // than lying on the floor of it where the hearthstone hides half of it.
  for (const sign of [-1, 1]) {
    b.box('iron', [0.42, 0.22, 0.06], [fireX - 0.21, fireY, sign * 0.5], 0, { tile: 0.3 });
  }
  for (let i = 0; i < 7; i++) {
    b.box('iron', [0.36, 0.03, 0.03], [fireX - 0.18, fireY + 0.2, -0.48 + i * 0.16], 0, { tile: 0.3 });
  }

  // Logs, criss-crossed on the grate. Charcoal is faintly emissive, so the pile
  // glows from within rather than only being lit from outside.
  const logs: readonly (readonly [number, number, number, number])[] = [
    [fireX - 0.08, 0.24, -0.34, 0.5],
    [fireX + 0.1, 0.25, 0.32, -0.7],
    [fireX - 0.02, 0.4, 0.02, 0.15],
    [fireX + 0.04, 0.38, -0.26, -1.1],
    [fireX - 0.04, 0.53, 0.16, 0.9],
    [fireX + 0.06, 0.55, -0.12, -0.35],
  ];
  for (const [lx, ly, lz, yaw] of logs) {
    const geometry = new THREE.CylinderGeometry(0.08, 0.09, 1.05, 7);
    b.geo('charcoal', geometry, tiltMatrix([lx, fireY + ly, lz], [0, yaw, Math.PI / 2]), {
      tile: 0.5,
      consume: true,
    });
  }

  // Embers, spread the full width of the grate. Small and flat on purpose - at
  // any size at all they stop being coals and start being marbles.
  for (let i = 0; i < 16; i++) {
    b.box('ember', [0.05, 0.02, 0.05], [fireX + b.range(-0.22, 0.22), fireY + 0.21, b.range(-0.6, 0.6)], b.range(0, 1.5), {
      tile: 0.2,
      castShadow: false,
    });
  }

  /**
   * The flame. Cones on their own node - not batched, because they are scaled
   * and swayed every frame. Cosmetic motion belongs to art, driven from
   * `onBeforeRender`, so it stops dead the moment the lobby is torn down.
   *
   * Eighteen of them rather than nine: the opening is now wide enough that a
   * thin row of tongues in the middle of it read as a candle in a cave.
   */
  const flames = new THREE.Group();
  flames.position.set(fireX, fireY + 0.5, 0);
  b.attach(flames);

  const tongues: { mesh: THREE.Mesh; phase: number; base: number }[] = [];
  // Tall and narrow: a flame is a tongue, and a squat cone reads as a blob.
  const flameGeometry = new THREE.ConeGeometry(0.13, 1.02, 6, 1, true);
  const coreGeometry = new THREE.ConeGeometry(0.09, 0.5, 6, 1, true);
  b.own(() => {
    flameGeometry.dispose();
    coreGeometry.dispose();
  });

  // Outer tongues spread along the log pile; the pale cores sit low inside them.
  const OUTER = 12;
  for (let i = 0; i < 18; i++) {
    const core = i >= OUTER;
    const mesh = new THREE.Mesh(core ? coreGeometry : flameGeometry, b.mat(core ? 'flameCore' : 'flame'));
    // Spaced rather than random, so no two tongues land on top of each other.
    const lane = core ? (i - OUTER) / 5 - 0.5 : (i % 6) / 5 - 0.5;
    mesh.position.set(
      b.range(-0.14, 0.14) + (core ? 0 : (Math.floor(i / 6) - 0.5) * 0.18),
      core ? 0.04 : 0.42,
      lane * (core ? 0.78 : 1.16) + b.range(-0.09, 0.09),
    );
    flames.add(mesh);
    // A wide spread of resting heights: a row of tongues the same length reads
    // as a pilot light, not as a fire.
    tongues.push({ mesh, phase: b.range(0, Math.PI * 2), base: core ? b.range(0.75, 1.15) : b.range(0.45, 1.25) });
  }

  const fireLight = new THREE.PointLight(0xffa451, 34, 19, 2);
  fireLight.position.set(fireX + 0.2, fireY + 0.8, 0);
  fireLight.castShadow = true;
  fireLight.shadow.camera.far = 20;
  fireLight.shadow.bias = -0.004;
  b.light(fireLight);

  b.tick((time) => {
    let sum = 0;
    for (const tongue of tongues) {
      const wobble = Math.sin(time * 7.3 + tongue.phase) * 0.18 + Math.sin(time * 3.1 + tongue.phase * 2) * 0.1;
      const scale = tongue.base * (1 + wobble);
      tongue.mesh.scale.set(1 + wobble * 0.3, scale, 1 + wobble * 0.3);
      tongue.mesh.rotation.z = Math.sin(time * 2.7 + tongue.phase) * 0.09;
      sum += scale;
    }
    // The light flickers with the flames rather than on a timer of its own, so
    // the shadows on the far wall always agree with what the fire is doing.
    fireLight.intensity = 28 + (sum / tongues.length) * 10;
  });

  // Fire irons and a basket of split logs, because a fire needs feeding.
  b.box('iron', [0.05, 0.9, 0.05], [x + 0.9, hearth, 1.55], 0.1, { tile: 0.4 });
  b.box('iron', [0.05, 0.86, 0.05], [x + 1.0, hearth, 1.65], -0.14, { tile: 0.4 });
  b.solid('timberDark', [0.62, 0.42, 0.62], [x + 1.35, 0, -1.5], 0.2, { tile: 0.6 });
  for (let i = 0; i < 5; i++) {
    const geometry = new THREE.CylinderGeometry(0.07, 0.08, 0.56, 6);
    b.geo(
      'timber',
      geometry,
      tiltMatrix([x + 1.35 + b.range(-0.12, 0.12), 0.42 + i * 0.05, -1.5 + b.range(-0.12, 0.12)], [0, b.range(0, 3), Math.PI / 2]),
      { tile: 0.5, consume: true },
    );
  }
}

/* --- the poster wall ----------------------------------------------------------- */

/**
 * The +Z wall, dressed so the posters read as a board rather than as pictures
 * hung on planks: a dark backing panel, a batten frame and a rail.
 */
function posterWall(b: Builder, slots: number): void {
  // The board's front face, with the board itself sunk back into the logs.
  const face = BOARD_FACE;
  const anchors = posterAnchors(slots);
  if (!anchors.length) return;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const anchor of anchors) {
    minX = Math.min(minX, anchor.position[0] - POSTER_WIDTH / 2);
    maxX = Math.max(maxX, anchor.position[0] + POSTER_WIDTH / 2);
    minY = Math.min(minY, anchor.position[1]);
    maxY = Math.max(maxY, anchor.position[1] + POSTER_HEIGHT);
  }

  const pad = 0.28;
  const width = maxX - minX + pad * 2;
  const height = maxY - minY + pad * 2;
  const centreX = (minX + maxX) / 2;

  // The board: 5 cm thick, its front face at `face`.
  b.box('timberDark', [width, height, 0.05], [centreX, minY - pad, face + 0.025], 0, {
    tile: 1.0,
    castShadow: false,
  });

  // Batten frame around it, standing proud of the posters so the whole thing
  // reads as one board rather than as pictures hung on a wall.
  const battenZ = face - 0.09;
  b.box('beam', [width + 0.14, 0.12, 0.14], [centreX, minY - pad + height, battenZ], 0, { tile: 0.9 });
  b.box('beam', [width + 0.14, 0.12, 0.14], [centreX, minY - pad - 0.12, battenZ], 0, { tile: 0.9 });
  b.box('beam', [0.12, height + 0.24, 0.14], [centreX - width / 2 - 0.06, minY - pad - 0.12, battenZ], 0, { tile: 0.9 });
  b.box('beam', [0.12, height + 0.24, 0.14], [centreX + width / 2 + 0.06, minY - pad - 0.12, battenZ], 0, { tile: 0.9 });

  // Skirting along the whole wall, and the crates of people who have come back
  // from somewhere, stacked on the floor under the board.
  b.box('timberDark', [HALF_X * 2, 0.18, 0.08], [0, 0, face - 0.02], 0, { tile: 0.9 });
  b.solid('timberDark', [0.7, 0.5, 0.44], [centreX - 2.4, 0, face - 0.4], 0.12, { tile: 0.6 });
  b.solid('timberDark', [0.6, 0.42, 0.4], [centreX + 2.6, 0, face - 0.38], -0.2, { tile: 0.6 });
  b.box('canvas', [0.66, 0.3, 0.4], [centreX + 2.6, 0.42, face - 0.38], -0.2, { tile: 0.5 });
}

/* --- furniture ----------------------------------------------------------------- */

function furniture(b: Builder): void {
  // Hearth rug, in front of the fire and clear of the hearthstone.
  b.box('rug', [3.0, 0.03, 2.8], [-3.0, 0.001, 0], 0.04, { tile: 1.6, castShadow: false });

  // Two leather armchairs facing each other across a low table.
  armchair(b, -3.2, -1.35, 0.35);
  armchair(b, -3.2, 1.35, Math.PI - 0.35);
  b.solid('timberDark', [0.8, 0.44, 1.0], [-3.4, 0, 0], 0.05, { tile: 0.8 });
  b.box('ceramic', [0.16, 0.1, 0.16], [-3.5, 0.44, -0.2], 0.3, { tile: 0.3 });
  b.box('paper', [0.28, 0.03, 0.36], [-3.3, 0.44, 0.25], -0.2, { tile: 0.4 });

  // The middle of the hall is deliberately clear: it is where four people stand
  // to talk before a run, and the lever is the only thing that belongs in it.

  // Bookshelf against the WEST gable, past the chimney breast. It used to stand
  // on the east one; the dart fence owns that wall now, and the poster board
  // owns the whole of +Z, so this corner is the only wall left it fits on.
  const shelfX = -HALF_X + 0.35;
  const shelfZ = 3.3;
  b.solid('timber', [0.34, 2.0, 1.4], [shelfX, 0, shelfZ], 0, { tile: 1.0 });
  for (let shelf = 0; shelf < 4; shelf++) {
    const y = 0.34 + shelf * 0.42;
    b.box('timberDark', [0.3, 0.04, 1.3], [shelfX, y, shelfZ], 0, { tile: 0.6 });
    let z = shelfZ - 0.55;
    while (z < shelfZ + 0.5) {
      const w = b.range(0.04, 0.09);
      const h = b.range(0.2, 0.32);
      b.box(b.pick(['cushion', 'cushionGreen', 'timberDark', 'hide']), [0.22, h, w], [shelfX + 0.02, y + 0.04, z], 0, {
        tile: 0.3,
      });
      z += w + 0.012;
    }
  }

  // Skis and snowshoes leaning by the fire, which sells "you came in from out
  // there" without needing a door.
  for (let i = 0; i < 2; i++) {
    const geometry = boxGeometry(0.03, 1.9, 0.1);
    b.geo('timberPale', geometry, tiltMatrix([-HALF_X + 0.3, 0.95, -3.6 + i * 0.16], [0, 0, -0.11]), { tile: 0.5 });
  }
  b.box('timberDark', [0.06, 0.62, 0.42], [-HALF_X + 0.24, 0.1, -2.9], 0.16, { tile: 0.4 });

  // Antler chandelier over the middle of the hall.
  chandelier(b, 0, -1.0);

  // Wall lanterns on the gable ends, clear of the chimney breast, the bookshelf
  // and the fence opening.
  lantern(b, -HALF_X + 0.1, 1.75, -2.9, [1, 0]);
  lantern(b, -HALF_X + 0.1, 1.75, 2.1, [1, 0]);
  lantern(b, HALF_X - 0.1, 1.75, -0.6, [-1, 0]);
}

function armchair(b: Builder, x: number, z: number, yaw: number): void {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const local = (lx: number, lz: number): readonly [number, number, number] => [
    x + lx * cos + lz * sin,
    0,
    z - lx * sin + lz * cos,
  ];

  b.solid('hide', [0.94, 0.42, 0.88], [x, 0, z], yaw, { tile: 0.9 });
  b.box('cushion', [0.8, 0.16, 0.74], [x, 0.42, z], yaw, { tile: 0.7 });
  // Back and two arms, placed in the chair's own frame.
  const back = local(0, 0.42);
  b.box('hide', [0.94, 0.62, 0.16], [back[0], 0.42, back[2]], yaw, { tile: 0.9 });
  for (const side of [-1, 1]) {
    const arm = local(side * 0.44, 0);
    b.box('hide', [0.14, 0.3, 0.86], [arm[0], 0.42, arm[2]], yaw, { tile: 0.9 });
  }
  b.box('fur', [0.7, 0.06, 0.4], [x, 0.58, z], yaw + 0.1, { tile: 0.6 });
}

/**
 * A hurricane lantern on a wrought bracket. `out` is the direction it stands
 * off the wall, so one function serves every wall in the cabin.
 */
function lantern(b: Builder, x: number, y: number, z: number, out: readonly [number, number]): void {
  const [ox, oz] = out;
  const armLength = 0.34;
  const hx = x + ox * armLength;
  const hz = z + oz * armLength;

  // Bracket: a plate on the wall and an arm out to the hook.
  b.box('iron', [0.1, 0.24, 0.1], [x, y + 0.34, z], 0, { tile: 0.3 });
  const arm = boxGeometry(0.035, 0.035, armLength);
  b.geo('iron', arm, tiltMatrix([x + ox * armLength * 0.5, y + 0.56, z + oz * armLength * 0.5], [0, Math.atan2(ox, oz), 0]), {
    tile: 0.3,
  });

  // The lantern itself: brass cap and base, glass between, a warm core inside.
  b.box('brass', [0.24, 0.05, 0.24], [hx, y, hz], 0, { tile: 0.3 });
  b.box('glass', [0.2, 0.34, 0.2], [hx, y + 0.05, hz], 0, { castShadow: false });
  b.box('lampGlow', [0.1, 0.2, 0.1], [hx, y + 0.12, hz], 0, { castShadow: false });
  b.box('brass', [0.28, 0.06, 0.28], [hx, y + 0.39, hz], 0, { tile: 0.3 });
  const hoop = new THREE.TorusGeometry(0.07, 0.012, 5, 10, Math.PI);
  b.geo('iron', hoop, tiltMatrix([hx, y + 0.45, hz], [0, 0, 0]), { consume: true });
}

/** Antlers, a wrought ring, four candles. The one thing hanging over the room. */
function chandelier(b: Builder, x: number, z: number): void {
  const y = 2.55;
  const geometry = new THREE.TorusGeometry(0.62, 0.035, 6, 20);
  b.geo('iron', geometry, tiltMatrix([x, y, z], [Math.PI / 2, 0, 0]), { consume: true });

  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const chain = boxGeometry(0.02, 1.3, 0.02);
    b.geo(
      'iron',
      chain,
      tiltMatrix([x + Math.cos(angle) * 0.5, y + 0.7, z + Math.sin(angle) * 0.5], [Math.sin(angle) * 0.16, 0, -Math.cos(angle) * 0.16]),
      { tile: 0.3 },
    );
  }

  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const cx = x + Math.cos(angle) * 0.62;
    const cz = z + Math.sin(angle) * 0.62;
    b.box('ceramic', [0.05, 0.16, 0.05], [cx, y + 0.03, cz], 0, { tile: 0.2 });
    b.box('lampGlow', [0.03, 0.07, 0.03], [cx, y + 0.19, cz], 0, { castShadow: false });
  }

  // Antler tines sweeping out of the ring: three per side, all slightly different.
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + 0.5;
    const length = b.range(0.5, 0.8);
    const tine = new THREE.CylinderGeometry(0.012, 0.03, length, 5);
    b.geo(
      'ceramic',
      tine,
      tiltMatrix(
        [x + Math.cos(angle) * 0.4, y + 0.12, z + Math.sin(angle) * 0.4],
        [Math.sin(angle) * 0.9, 0, -Math.cos(angle) * 0.9],
      ),
      { consume: true },
    );
  }
}

/* --- the view ------------------------------------------------------------------ */

/**
 * Everything past the glass: a snowfield, three ridges of mountains at
 * increasing distance, a treeline, and snow falling through it all.
 *
 * None of it casts or receives shadows and none of it is walkable - it exists
 * only to be looked at from inside, which is why it can be this cheap.
 */
function outside(b: Builder): void {
  const flat = { castShadow: false, receiveShadow: false } as const;

  // Sky. A backdrop cylinder painted with a gradient, unaffected by fog because
  // it IS the far distance.
  const dome = new THREE.CylinderGeometry(260, 260, 190, 24, 1, true);
  b.geo('sky', dome, poseMatrix([0, 40, 0]), { ...flat, consume: true });

  // The ground, dropping away from the cabin.
  const ground = new THREE.PlaneGeometry(520, 520);
  b.geo('snow', ground, tiltMatrix([0, -0.9, -140], [-Math.PI / 2, 0, 0]), { ...flat, tile: 8, consume: true });

  /**
   * Four ranges, each further back, taller and wider apart than the last; the
   * fog supplies the aerial perspective, so nothing here is painted paler by
   * hand.
   *
   * Each peak is TWO cones sharing an apex: grey rock for the whole mountain,
   * and a smaller white one capping the top third. A snow line baked into the
   * texture would have to land at one particular world height to look right,
   * and world-space UVs put that at a different fraction of every mountain.
   *
   * The nearest range is all snow and deliberately low - it is the ground the
   * cabin stands on rolling away, and without it the tall peaks have nothing to
   * rise behind and read as shards stuck in a field.
   */
  const ridges: readonly (readonly [number, number, number, number, number, number])[] = [
    // [distance, count, spread, minHeight, maxHeight, capFraction]
    [-40, 8, 150, 3, 7, 0],
    [-78, 8, 190, 20, 36, 0.4],
    [-126, 7, 260, 40, 64, 0.44],
    [-198, 6, 350, 70, 108, 0.5],
  ];

  for (const [distance, count, spread, minHeight, maxHeight, capFraction] of ridges) {
    for (let i = 0; i < count; i++) {
      const height = b.range(minHeight, maxHeight);
      // Broad bases: a mountain is a shallow cone, not a spike.
      const radius = height * b.range(1.0, 1.6);
      const sides = Math.round(b.range(5, 8));
      const x = (i / Math.max(1, count - 1) - 0.5) * spread + b.range(-16, 16);
      const z = distance + b.range(-22, 22);
      const tilt: readonly [number, number, number] = [
        b.range(-0.04, 0.04),
        b.range(0, Math.PI),
        b.range(-0.05, 0.05),
      ];
      // Squashed across the view, which is what turns a cone into a ridge.
      const scale: readonly [number, number, number] = [b.range(1.1, 1.9), 1, b.range(0.7, 1)];
      const base = height / 2 - 7;

      b.geo(
        capFraction > 0 ? 'rock' : 'snowCap',
        new THREE.ConeGeometry(radius, height, sides, 1),
        tiltMatrix([x, base, z], tilt, scale),
        { ...flat, tile: 30, consume: true },
      );

      if (capFraction <= 0) continue;
      // Same apex, same taper: a cone of `capFraction` of the height sits exactly
      // on the slope of the one below it.
      b.geo(
        'snowCap',
        new THREE.ConeGeometry(radius * capFraction, height * capFraction, sides, 1),
        tiltMatrix([x, base + (height * (1 - capFraction)) / 2, z], tilt, scale),
        { ...flat, tile: 22, consume: true },
      );
    }
  }

  treeline(b);
  snowfall(b);
}

/** Ground level outside, which the whole view is built down from. */
const GROUND = -0.9;

/**
 * One conifer.
 *
 * Three cones stacked on a stick is what this used to be, and from the window
 * seat - which is where players stand and look - it read as exactly that. A fir
 * is a *stack of skirts on a visible trunk*, each skirt narrower than the one
 * under it, each carrying snow on its shoulder, and it comes to a spire rather
 * than a blunt point. That is six or seven tiers, not three, and the snow is
 * what makes it belong to this mountain rather than to a park.
 *
 * Every piece is `consume: true` and shares three materials, so a hundred of
 * them still merge down to three draw calls. None of it casts or receives a
 * shadow: it is scenery on the far side of the glass.
 */
function conifer(b: Builder, x: number, z: number, height: number): void {
  const flat = { castShadow: false, receiveShadow: false } as const;

  // Trunk, tapered, plus a root flare - a pole stuck in snow reads as a pole.
  const trunkHeight = height * 0.74;
  b.geo(
    'pineTrunk',
    new THREE.CylinderGeometry(height * 0.011, height * 0.028, trunkHeight, 6),
    poseMatrix([x, GROUND + trunkHeight / 2, z]),
    { ...flat, tile: 1.4, consume: true },
  );
  b.geo(
    'pineTrunk',
    new THREE.ConeGeometry(height * 0.062, height * 0.13, 6, 1),
    poseMatrix([x, GROUND + height * 0.065, z]),
    { ...flat, tile: 1.2, consume: true },
  );

  // Clear trunk under the lowest skirt, and how wide the tree is at that skirt.
  const bare = height * 0.13;
  const spread = b.range(0.22, 0.3);
  const tiers = 7 + Math.floor(b.range(0, 3));
  /** Which way the whole tree leans. Nothing outdoors grows plumb. */
  const leanX = b.range(-0.05, 0.05);
  const leanZ = b.range(-0.05, 0.05);

  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const base = GROUND + bare + t * (height - bare) * 0.86;
    const radius = height * spread * (1 - t * 0.82) * b.range(0.86, 1.08);
    // Deep overlap between tiers: a fir is a continuous mass of needles with
    // whorls IN it, not a stack of separate skirts with air between them.
    const skirt = height * (0.34 - t * 0.14);
    const drift = base - GROUND;
    // Lean, plus a free spin and a little wander per whorl.
    const tilt: readonly [number, number, number] = [
      leanX + b.range(-0.05, 0.05),
      b.range(0, Math.PI),
      leanZ + b.range(-0.05, 0.05),
    ];
    const px = x + leanX * drift * 0.4 + b.range(-0.04, 0.04) * height * 0.1;
    const pz = z - leanZ * drift * 0.4 + b.range(-0.04, 0.04) * height * 0.1;

    b.geo(
      t < 0.4 ? 'pineNeedleDeep' : 'pineNeedle',
      new THREE.ConeGeometry(radius, skirt, 7, 1),
      tiltMatrix([px, base + skirt / 2, pz], tilt),
      { ...flat, tile: 2.4, consume: true },
    );

    /**
     * Snow on the shoulder of that whorl.
     *
     * Deliberately NOT a ring round the whole skirt - the first attempt was, and
     * a dozen even white bands up a cone reads as a wedding cake from the window
     * seat. It is a small, off-centre, differently-spun cone that catches part
     * of the shoulder and leaves the rest green, and only the upper whorls carry
     * it at all, because snow falls from above.
     */
    if (t < 0.25) continue;
    b.geo(
      'snowCap',
      new THREE.ConeGeometry(radius * 0.72, skirt * 0.42, 6, 1),
      tiltMatrix(
        [px + b.range(-0.06, 0.06) * radius, base + skirt * 0.5, pz + b.range(-0.06, 0.06) * radius],
        [tilt[0] + b.range(-0.09, 0.09), b.range(0, Math.PI), tilt[2] + b.range(-0.09, 0.09)],
      ),
      { ...flat, tile: 2, consume: true },
    );
  }

  // The spire, which is the silhouette people actually recognise, with a cap of
  // snow on the very tip of it.
  const tipX = x + leanX * height * 0.4;
  const tipZ = z - leanZ * height * 0.4;
  b.geo(
    'pineNeedle',
    new THREE.ConeGeometry(height * 0.055, height * 0.24, 6, 1),
    tiltMatrix([tipX, GROUND + height * 0.92, tipZ], [leanX, 0, leanZ]),
    { ...flat, tile: 1.6, consume: true },
  );
  b.geo(
    'snowCap',
    new THREE.ConeGeometry(height * 0.032, height * 0.1, 6, 1),
    tiltMatrix([tipX, GROUND + height * 0.99, tipZ], [leanX, 0, leanZ]),
    { ...flat, tile: 1.4, consume: true },
  );
}

/**
 * The treeline on the near slope: clumps rather than a scatter, because that is
 * how conifers actually grow and because an even sprinkle reads as wallpaper.
 * Nothing lands directly in front of the window - the mountains are the view.
 */
function treeline(b: Builder): void {
  const flat = { castShadow: false, receiveShadow: false } as const;
  const clear = (x: number, z: number): boolean => Math.abs(x) < 6.5 && z > -17;

  for (let clump = 0; clump < 16; clump++) {
    const cx = b.range(-54, 54);
    const cz = b.range(-42, -10);
    if (clear(cx, cz)) continue;

    // A clump is one big tree and its neighbours, all a little shorter.
    const tall = b.range(5.5, 10);
    const count = 2 + Math.floor(b.range(0, 5));
    for (let i = 0; i < count; i++) {
      const x = cx + b.range(-5.5, 5.5);
      const z = cz + b.range(-4.5, 4.5);
      if (clear(x, z)) continue;
      conifer(b, x, z, i === 0 ? tall : tall * b.range(0.42, 0.86));
    }

    // A snapped-off trunk or a stump at the edge of most clumps. Cheap, and it
    // is what stops a stand of firs looking like it was planted this morning.
    if (b.range(0, 1) > 0.45) {
      const sx = cx + b.range(-6, 6);
      const sz = cz + b.range(-5, 5);
      if (clear(sx, sz)) continue;
      const stub = b.range(0.6, 2.6);
      b.geo(
        'pineTrunk',
        new THREE.CylinderGeometry(stub * 0.09, stub * 0.16, stub, 6),
        tiltMatrix([sx, GROUND + stub / 2, sz], [b.range(-0.12, 0.12), 0, b.range(-0.12, 0.12)]),
        { ...flat, tile: 1.2, consume: true },
      );
      b.geo(
        'snowCap',
        new THREE.CylinderGeometry(stub * 0.11, stub * 0.11, 0.06, 6),
        poseMatrix([sx, GROUND + stub, sz]),
        { ...flat, tile: 1, consume: true },
      );
    }
  }
}

/**
 * Falling snow: one `InstancedMesh` of small quads, wrapped in a slab in front
 * of the window and animated on the cabin's tick. One draw call for the lot.
 */
function snowfall(b: Builder): void {
  const COUNT = 320;
  const SLAB = { x: 34, y: 16, z: 30, near: -7 };

  const geometry = new THREE.PlaneGeometry(0.05, 0.05);
  const mesh = new THREE.InstancedMesh(geometry, b.mat('snowfall'), COUNT);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  b.attach(mesh);
  b.own(() => {
    geometry.dispose();
    mesh.dispose();
  });

  const flakes = Array.from({ length: COUNT }, () => ({
    x: b.range(-SLAB.x, SLAB.x),
    y: b.range(0, SLAB.y),
    z: SLAB.near - b.range(0, SLAB.z),
    fall: b.range(0.5, 1.5),
    drift: b.range(0.2, 0.7),
    phase: b.range(0, Math.PI * 2),
  }));

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  let last = 0;

  b.tick((time) => {
    // First frame has no previous timestamp; a clamped delta also stops a tab
    // that was in the background teleporting every flake to the floor.
    const dt = last === 0 ? 0 : Math.min(0.1, time - last);
    last = time;

    for (let i = 0; i < flakes.length; i++) {
      const flake = flakes[i];
      if (!flake) continue;
      flake.y -= flake.fall * dt;
      if (flake.y < -1) flake.y = SLAB.y;

      position.set(flake.x + Math.sin(time * flake.drift + flake.phase) * 1.2, flake.y, flake.z);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
}

/* --- light --------------------------------------------------------------------- */

function lighting(b: Builder): void {
  /**
   * The window light. A directional light standing in for the sun off the
   * snowfield - cold, strong, and coming in low from the north, which is what
   * puts the long shadows down the floorboards.
   */
  const day = new THREE.DirectionalLight(0xd6e6ff, 2.6);
  day.position.set(-3, 7, -16);
  day.target.position.set(1, 0.6, 2);
  b.attach(day.target);
  b.light(day);

  // Bounce off the snow: a second, much softer fill from the same side, with no
  // shadow, so the window wall itself is not a silhouette.
  const bounce = new THREE.DirectionalLight(0x9dbbdd, 0.9);
  bounce.position.set(4, 2, -12);
  bounce.target.position.set(-2, 1.5, 3);
  b.attach(bounce.target);
  b.light(bounce);

  /**
   * A warm fill from the poster-wall side. Without it every surface facing +Z -
   * the lever, the near face of the table, the fronts of the armchairs - sees
   * nothing but blue ambient and reads as a silhouette in a room that is
   * supposed to feel like the safe place.
   */
  const fill = new THREE.DirectionalLight(0xffe4c4, 0.55);
  fill.position.set(2, 3, 11);
  fill.target.position.set(-1, 1, -3);
  b.attach(fill.target);
  b.light(fill);

  // The chandelier, warm, over the middle of the hall.
  const overhead = new THREE.PointLight(0xffd6a0, 14, 13, 2);
  overhead.position.set(0, 2.5, -1.0);
  b.light(overhead);

  // A wash on the poster wall so twenty posters are readable from the middle of
  // the room. It is the wall players spend the most time looking at.
  const wall = new THREE.PointLight(0xffe4bd, 11, 11, 2);
  wall.position.set(0, 2.9, HALF_Z - 1.6);
  b.light(wall);
}
