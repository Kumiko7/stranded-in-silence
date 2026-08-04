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
  /** Where the player's own model stands while the wardrobe is open. */
  readonly mannequin: Pose;
  /** Camera pose for the wardrobe panel: model on the right, options on the left. */
  readonly wardrobeCamera: { readonly position: readonly [number, number, number]; readonly yaw: number; readonly pitch: number };
  readonly lever: Pose;
  readonly minigame: Pose;
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
  fireplace(b);
  posterWall(b, posterSlots);
  furniture(b);
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
      // quarter turn the other way.
      wardrobe: { position: [HALF_X - 0.42, 0, -2.9], rotationY: Math.PI / 2 },
      // Standing out in front of the open doors, turned back toward the camera.
      mannequin: { position: [HALF_X - 1.65, 0, -2.2], rotationY: 2.257 },
      /**
       * Parked across from the mannequin and turned a third of a radian past it,
       * which is what puts the model on the right of the screen and leaves the
       * left half clear for the wardrobe panel.
       */
      wardrobeCamera: { position: [HALF_X - 3.6, 1.5, -0.6], yaw: -0.544, pitch: -0.12 },
      // Turned to face +X: the players arrive east of it and walk west.
      lever: { position: [0, 0, 0.2], rotationY: -Math.PI / 2 },
      minigame: { position: [HALF_X - 0.1, 1.1, 2.1], rotationY: Math.PI / 2 },
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
  for (let y = from + LOG_COURSE / 2; y < to; y += LOG_COURSE) {
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

function logWalls(b: Builder): void {
  const span = HALF_X * 2 + WALL * 2;

  // The poster wall. Most of it ends up behind the board, but the ends show.
  b.box('cabin.log', [span, EAVE + 0.1, WALL], [0, 0, HALF_Z + WALL / 2], 0, { tile: 1.9 });
  logCourses(b, true, HALF_Z, 0, span, 0, EAVE);

  // Gable ends: the fireplace stands against one, the wardrobe against the other.
  for (const sign of [-1, 1]) {
    b.box('cabin.log', [WALL, EAVE + 0.1, HALF_Z * 2 + WALL * 2], [sign * (HALF_X + WALL / 2), 0, 0], 0, { tile: 1.9 });
    logCourses(b, false, sign * HALF_X, 0, HALF_Z * 2, 0, EAVE);

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

function fireplace(b: Builder): void {
  const x = -HALF_X;
  const breadth = 3.0;
  const proud = 0.62;

  // Chimney breast: full height, from floor to the ridge, with a battered base.
  b.solid('cabin.stone', [proud, RIDGE, breadth], [x + proud / 2, 0, 0], 0, { tile: 2.6 });
  b.solid('cabin.stone', [proud + 0.3, 1.2, breadth + 0.4], [x + (proud + 0.3) / 2, 0, 0], 0, { tile: 2.6 });

  // The opening, formed by two cheeks and a soot-blackened back.
  const mouthWidth = 1.6;
  const mouthHeight = 1.15;
  const hearth = 0.28;
  for (const sign of [-1, 1]) {
    const width = (breadth - mouthWidth) / 2;
    b.box('cabin.stone', [proud + 0.34, mouthHeight + 0.1, width], [x + (proud + 0.34) / 2, hearth, sign * (mouthWidth + width) / 2], 0, { tile: 2.6 });
  }
  b.box('cabin.soot', [0.1, mouthHeight, mouthWidth], [x + 0.34, hearth, 0], 0, { tile: 1.2 });
  b.box('cabin.soot', [proud + 0.3, 0.08, mouthWidth], [x + (proud + 0.3) / 2, hearth + mouthHeight, 0], 0, { tile: 1.2 });

  // Raised hearthstone, which is also the thing that stops you standing in it.
  b.solid('cabin.stone', [proud + 0.55, hearth, breadth + 0.4], [x + (proud + 0.55) / 2, 0, 0], 0, { tile: 2.6 });

  // Mantel: one enormous adzed beam, and the clutter that lives on it.
  b.box('beam', [proud + 0.5, 0.26, breadth + 0.1], [x + (proud + 0.5) / 2, hearth + mouthHeight + 0.14, 0], 0, { tile: 1.4 });
  b.box('ceramic', [0.2, 0.3, 0.2], [x + 0.5, hearth + mouthHeight + 0.4, -0.95], 0.3, { tile: 0.4 });
  b.box('brass', [0.16, 0.22, 0.16], [x + 0.46, hearth + mouthHeight + 0.4, 1.05], -0.2, { tile: 0.4 });
  b.box('timberDark', [0.1, 0.34, 0.5], [x + 0.5, hearth + mouthHeight + 0.4, 0.2], 0.08, { tile: 0.5 });

  /* --- the fire itself --------------------------------------------------- */

  const fireX = x + 0.62;
  const fireY = hearth + 0.04;

  // Logs, criss-crossed. Charcoal is faintly emissive, so the pile glows from
  // within rather than only being lit from outside.
  const logs: readonly (readonly [number, number, number, number])[] = [
    [fireX - 0.06, 0.09, -0.3, 0.5],
    [fireX + 0.08, 0.1, 0.28, -0.7],
    [fireX, 0.24, 0.0, 0.15],
    [fireX + 0.02, 0.22, -0.22, -1.1],
  ];
  for (const [lx, ly, lz, yaw] of logs) {
    const geometry = new THREE.CylinderGeometry(0.075, 0.085, 0.9, 7);
    b.geo('charcoal', geometry, tiltMatrix([lx, fireY + ly, lz], [0, yaw, Math.PI / 2]), {
      tile: 0.5,
      consume: true,
    });
  }

  // Embers under the logs.
  for (let i = 0; i < 7; i++) {
    b.box('ember', [0.07, 0.03, 0.07], [fireX + b.range(-0.16, 0.16), fireY, b.range(-0.5, 0.5)], b.range(0, 1.5), {
      tile: 0.2,
      castShadow: false,
    });
  }

  /**
   * The flame. Six cones on their own node - not batched, because they are
   * scaled and swayed every frame. Cosmetic motion belongs to art, driven from
   * `onBeforeRender`, so it stops dead the moment the lobby is torn down.
   */
  const flames = new THREE.Group();
  flames.position.set(fireX, fireY + 0.18, 0);
  b.attach(flames);

  const tongues: { mesh: THREE.Mesh; phase: number; base: number }[] = [];
  // Tall and narrow: a flame is a tongue, and a squat cone reads as a blob.
  const flameGeometry = new THREE.ConeGeometry(0.11, 0.86, 6, 1, true);
  const coreGeometry = new THREE.ConeGeometry(0.07, 0.44, 6, 1, true);
  b.own(() => {
    flameGeometry.dispose();
    coreGeometry.dispose();
  });

  // Outer tongues spread along the log pile; the pale cores sit low inside them.
  for (let i = 0; i < 9; i++) {
    const core = i >= 6;
    const mesh = new THREE.Mesh(core ? coreGeometry : flameGeometry, b.mat(core ? 'flameCore' : 'flame'));
    const spread = core ? 0.26 : 0.46;
    mesh.position.set(
      b.range(-0.08, 0.08),
      core ? 0.02 : 0.36,
      // Spaced rather than random, so no two tongues land on top of each other.
      (((i % 3) - 1) * spread) / 1.2 + b.range(-0.08, 0.08),
    );
    flames.add(mesh);
    tongues.push({ mesh, phase: b.range(0, Math.PI * 2), base: core ? b.range(0.8, 1.1) : b.range(0.65, 1.15) });
  }

  const fireLight = new THREE.PointLight(0xffa451, 22, 15, 2);
  fireLight.position.set(fireX + 0.1, fireY + 0.55, 0);
  fireLight.castShadow = true;
  fireLight.shadow.camera.far = 16;
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
    fireLight.intensity = 18 + (sum / tongues.length) * 7;
  });

  // Fire irons and a basket of split logs, because a fire needs feeding.
  b.box('iron', [0.05, 0.9, 0.05], [x + 0.9, hearth, 1.35], 0.1, { tile: 0.4 });
  b.box('iron', [0.05, 0.86, 0.05], [x + 1.0, hearth, 1.45], -0.14, { tile: 0.4 });
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

  // The long table down the middle of the room, where the lever stands at one
  // end and everyone naturally gathers at the other.
  const tableX = -0.4;
  b.solid('timber', [3.4, 0.1, 1.2], [tableX, 0.74, -2.4], 0, { tile: 1.2 });
  for (const [dx, dz] of [[-1.5, -0.45], [1.5, -0.45], [-1.5, 0.45], [1.5, 0.45]] as const) {
    b.box('timberDark', [0.14, 0.74, 0.14], [tableX + dx, 0, -2.4 + dz], 0, { tile: 0.5 });
  }
  b.box('timberDark', [3.0, 0.1, 0.12], [tableX, 0.58, -2.4], 0, { tile: 0.6 });
  bench(b, tableX - 0.1, -3.25, 0);
  bench(b, tableX + 0.1, -1.55, 0);
  // A lantern and a couple of mugs on it.
  standingLantern(b, tableX + 1.2, 0.84, -2.4);
  b.box('ceramic', [0.11, 0.13, 0.11], [tableX - 0.5, 0.84, -2.55], 0.2, { tile: 0.3 });
  b.box('ceramic', [0.11, 0.13, 0.11], [tableX - 0.2, 0.84, -2.2], -0.5, { tile: 0.3 });

  // Bookshelf against the east gable, south of the minigame wall - the poster
  // board owns the whole of the +Z wall and nothing may stand in front of it.
  const shelfX = HALF_X - 0.35;
  b.solid('timber', [0.34, 2.0, 1.4], [shelfX, 0, 3.4], 0, { tile: 1.0 });
  for (let shelf = 0; shelf < 4; shelf++) {
    const y = 0.34 + shelf * 0.42;
    b.box('timberDark', [0.3, 0.04, 1.3], [shelfX, y, 3.4], 0, { tile: 0.6 });
    let z = 2.85;
    while (z < 3.9) {
      const w = b.range(0.04, 0.09);
      const h = b.range(0.2, 0.32);
      b.box(b.pick(['cushion', 'cushionGreen', 'timberDark', 'hide']), [0.22, h, w], [shelfX - 0.02, y + 0.04, z], 0, {
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

  // Wall lanterns on the gable ends, clear of both the chimney breast and the
  // poster board.
  lantern(b, -HALF_X + 0.1, 1.75, -2.9, [1, 0]);
  lantern(b, -HALF_X + 0.1, 1.75, 2.9, [1, 0]);
  lantern(b, HALF_X - 0.1, 1.75, 0.4, [-1, 0]);
}

/** The same lantern, standing on a table rather than hanging off a wall. */
function standingLantern(b: Builder, x: number, y: number, z: number): void {
  b.box('brass', [0.17, 0.04, 0.17], [x, y, z], 0, { tile: 0.3 });
  b.box('glass', [0.14, 0.24, 0.14], [x, y + 0.04, z], 0, { castShadow: false });
  b.box('lampGlow', [0.07, 0.14, 0.07], [x, y + 0.09, z], 0, { castShadow: false });
  b.box('brass', [0.2, 0.05, 0.2], [x, y + 0.28, z], 0, { tile: 0.3 });
  const hoop = new THREE.TorusGeometry(0.05, 0.01, 5, 10, Math.PI);
  b.geo('iron', hoop, tiltMatrix([x, y + 0.33, z], [0, 0, 0]), { consume: true });
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

function bench(b: Builder, x: number, z: number, yaw: number): void {
  b.solid('timber', [2.6, 0.08, 0.4], [x, 0.46, z], yaw, { tile: 1.0 });
  for (const dx of [-1.05, 1.05]) {
    b.box('timberDark', [0.12, 0.46, 0.34], [x + dx, 0, z], yaw, { tile: 0.5 });
  }
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

  // A treeline on the near slope, thinning as it climbs.
  for (let i = 0; i < 44; i++) {
    const tx = b.range(-46, 46);
    const tz = b.range(-38, -9);
    // Nothing directly in front of the window: the mountains are the view.
    if (Math.abs(tx) < 6 && tz > -16) continue;

    const height = b.range(3.5, 8);
    const trunk = new THREE.CylinderGeometry(0.12, 0.2, height * 0.35, 5);
    b.geo('pineTrunk', trunk, poseMatrix([tx, -0.9 + height * 0.175, tz]), { ...flat, tile: 1, consume: true });
    for (let tier = 0; tier < 3; tier++) {
      const t = tier / 3;
      const skirt = new THREE.ConeGeometry(height * (0.3 - t * 0.08), height * 0.42, 6, 1);
      b.geo('pineNeedle', skirt, poseMatrix([tx, -0.9 + height * (0.3 + t * 0.24), tz]), {
        ...flat,
        tile: 3,
        consume: true,
      });
    }
  }

  snowfall(b);
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
