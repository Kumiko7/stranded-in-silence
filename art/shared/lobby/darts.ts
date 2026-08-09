/**
 * The dart minigame's furniture: the board, the scoreboard beside it, the stand
 * you take darts from, and the dart itself.
 *
 * Contracts are in docs/art/SHARED_ART.md §3.2. All four are shared-art builders
 * rather than cabin geometry for the usual reason - logic has to find, tag,
 * drive and (for the dart) spawn them by the hundred.
 *
 * The board and the scoreboard hang in the annex on the far side of the fence,
 * which nobody can walk into, so neither carries a collider. The stand does.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../lib/contract';
import { boxGeometry } from '../../lib/build';
import { MeshBatcher, poseMatrix, tiltMatrix } from '../../lib/merge';

/** Outer radius of the sisal, in metres. Regulation, and `darts.json` agrees. */
export const BOARD_RADIUS = 0.2255;

/** `y` is the bottom face, as everywhere else in art. */
function at(size: readonly [number, number, number], position: readonly [number, number, number], rotationY = 0): THREE.Matrix4 {
  return poseMatrix([position[0], position[1] + size[1] / 2, position[2]], rotationY);
}

/* --- the board ------------------------------------------------------------------ */

/**
 * `lobby.dartboard` - origin at the CENTRE of the board, facing -Z.
 *
 * The one piece in the lobby whose origin is not at its base: a board is hung at
 * a height and everything about it - the rings, the scoring, where a dart
 * sticks - is measured from the middle, so measuring it from the floor would
 * mean every caller subtracting the same number.
 *
 * No parts and no api. Logic scores a dart from `config/darts.json` and the
 * anchor pose; the picture and the maths share their ring radii through that
 * file rather than through a part.
 */
export function buildDartboard(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const batch = new MeshBatcher();

  const timber = ctx.materials.get('timberDark');
  const surround = ctx.materials.get('dart.surround');

  // Backboard: a square of dark timber that catches everything thrown wide, and
  // the thing that stops the board reading as a sticker on a wall.
  batch.add(timber, boxGeometry(0.9, 0.9, 0.05), poseMatrix([0, 0, 0.055]), { tile: 0.8 });
  for (const sign of [-1, 1]) {
    batch.add(timber, boxGeometry(0.06, 0.98, 0.08), poseMatrix([sign * 0.45, 0, 0.05]), { tile: 0.6 });
    batch.add(timber, boxGeometry(0.98, 0.06, 0.08), poseMatrix([0, sign * 0.45, 0.05]), { tile: 0.6 });
  }

  // The sisal: a shallow drum, with the printed face on the front of it.
  const drum = new THREE.CylinderGeometry(BOARD_RADIUS, BOARD_RADIUS, 0.038, 40);
  batch.add(surround, drum, tiltMatrix([0, 0, 0.011], [Math.PI / 2, 0, 0]), { tile: 0.6, consume: true });
  // A ring of black wire round the outside, standing a hair proud of the beds.
  const ring = new THREE.TorusGeometry(BOARD_RADIUS - 0.004, 0.006, 6, 40);
  batch.add(surround, ring, poseMatrix([0, 0, -0.01]), { consume: true });

  const face = new THREE.CircleGeometry(BOARD_RADIUS, 48);
  batch.add(
    ctx.materials.get('dart.board'),
    face,
    // Turned to face -Z, out into the cabin. Its own UVs ARE the artwork, so the
    // batcher must be left to keep them (no `tile`).
    tiltMatrix([0, 0, -0.009], [0, Math.PI, 0]),
    { consume: true, castShadow: false },
  );

  const built = batch.build();
  object.add(built.object);

  return { object, colliders: [], parts: {}, dispose: built.dispose };
}

/* --- the scoreboard -------------------------------------------------------------- */

/** How many rows the board has. One per player the session can hold. */
const ROWS = 4;
/** Digits per row. Three is 999, which no lobby is going to run past. */
const DIGITS = 3;

/**
 * A colour per row, so a player can find their own line at a glance. Rows are
 * ordered by peer id, which is stable across peers - see `src/game/Lobby.ts`.
 */
const ROW_COLOURS = ['#e2703a', '#5aa9e6', '#7fc45f', '#d9c04a'] as const;

/**
 * `lobby.scoreboard` - `1.15 x 0.94 m`, origin at the BOTTOM CENTRE, facing -Z.
 *
 * A seven-segment display, built as one small plane per digit with a material
 * per glyph. Eleven materials (ten digits and an unlit one) are shared by all
 * twelve planes, so setting a score swaps `mesh.material` and touches nothing
 * else - no canvas, no text, and nothing for `t()` to translate, which matters
 * because art cannot reach it.
 *
 * | Part | Purpose |
 * | `rows` | The twelve digit planes and four pips, as one node. |
 */
export function buildScoreboard(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const batch = new MeshBatcher();

  const width = 1.32;
  const height = 1.08;
  const timber = ctx.materials.get('timberDark');
  const slate = ctx.materials.get('score.panel');

  // Case: a slate panel in a timber surround, with a hood over the top of it.
  batch.add(slate, boxGeometry(width - 0.12, height - 0.12, 0.05), at([width, height, 0.05], [0, 0.06, 0]), { tile: 0.9 });
  batch.add(timber, boxGeometry(width, 0.07, 0.1), at([width, 0.07, 0.1], [0, 0, -0.02]), { tile: 0.7 });
  batch.add(timber, boxGeometry(width, 0.07, 0.1), at([width, 0.07, 0.1], [0, height - 0.07, -0.02]), { tile: 0.7 });
  for (const sign of [-1, 1]) {
    batch.add(timber, boxGeometry(0.07, height, 0.1), at([0.07, height, 0.1], [(sign * (width - 0.07)) / 2, 0, -0.02]), {
      tile: 0.7,
    });
  }
  batch.add(timber, boxGeometry(width + 0.1, 0.05, 0.18), at([width + 0.1, 0.05, 0.18], [0, height, -0.08]), { tile: 0.7 });

  const built = batch.build();
  object.add(built.object);

  /* --- the display ---------------------------------------------------------- */

  const rows = new THREE.Group();
  object.add(rows);

  // Ten lit glyphs plus one unlit, shared by every digit on the board.
  const glyphs = Array.from({ length: 10 }, (_, value) => ctx.materials.get(`score.digit${value}`));
  const blank = ctx.materials.get('score.blank');

  const digitWidth = 0.13;
  const digitHeight = 0.2;
  const digitPitch = digitWidth + 0.026;
  const digitGeometry = new THREE.PlaneGeometry(digitWidth, digitHeight);
  const pipGeometry = boxGeometry(0.08, 0.08, 0.02);

  const cells: THREE.Mesh[][] = [];
  const pips: THREE.Mesh[] = [];
  const pipMaterials: THREE.Material[] = [];

  const top = height - 0.19;
  const pitch = 0.23;

  /**
   * Everything on the display is turned to face -Z, and turning a plane about Y
   * puts its local +X on the viewer's LEFT. So `x` is negated here: laid out in
   * reading order and then mirrored, rather than laid out backwards and read
   * as 081 when the score says 180.
   */
  for (let row = 0; row < ROWS; row++) {
    const y = top - row * pitch;

    // The pip. Its material is cloned per row so tinting one line cannot leak
    // into the shared cache - the same rule the poster's mark follows.
    const material = ctx.materials.get('score.pip').clone();
    (material as THREE.MeshBasicMaterial).color.set(ROW_COLOURS[row] ?? '#ffffff');
    pipMaterials.push(material);
    const pip = new THREE.Mesh(pipGeometry, material);
    pip.position.set(width / 2 - 0.17, y, -0.04);
    rows.add(pip);
    pips.push(pip);

    const line: THREE.Mesh[] = [];
    for (let digit = 0; digit < DIGITS; digit++) {
      const mesh = new THREE.Mesh(digitGeometry, blank);
      // Right-aligned, so a score growing from 9 to 10 does not shuffle sideways.
      mesh.position.set(-(width / 2 - 0.17 - (DIGITS - 1 - digit) * digitPitch), y, -0.036);
      mesh.rotation.y = Math.PI;
      rows.add(mesh);
      line.push(mesh);
    }
    cells.push(line);
  }

  /**
   * Rows past the end of `scores` go dark, pip and all: a two-player lobby
   * should not show two lines of zeroes belonging to nobody.
   */
  const setScores = (scores: readonly number[]): void => {
    for (let row = 0; row < ROWS; row++) {
      const score = scores[row];
      const line = cells[row];
      const pip = pips[row];
      if (pip) pip.visible = score !== undefined;
      if (!line) continue;

      const text = score === undefined ? '' : String(Math.max(0, Math.min(999, Math.round(score))));
      for (let digit = 0; digit < DIGITS; digit++) {
        const mesh = line[digit];
        if (!mesh) continue;
        // Leading positions stay unlit rather than showing a zero.
        const index = digit - (DIGITS - text.length);
        const value = index >= 0 ? Number(text[index]) : NaN;
        mesh.material = Number.isNaN(value) ? blank : glyphs[value] ?? blank;
      }
    }
  };
  setScores([]);

  return {
    object,
    colliders: [],
    parts: { rows },
    api: { setScores },
    dispose(): void {
      built.dispose();
      digitGeometry.dispose();
      pipGeometry.dispose();
      for (const material of pipMaterials) material.dispose();
    },
  };
}

/* --- the stand -------------------------------------------------------------------- */

/**
 * `lobby.dartStand` - `0.5 x 0.4 m` footprint, `1.05 m` tall, facing -Z.
 *
 * A rack of darts on a post, standing in front of the fence. It never runs out,
 * which is why the darts in it are geometry rather than instances of anything:
 * taking one does not remove one.
 *
 * | Part | Purpose |
 * | `interactAnchor` | Prompt position. |
 */
export function buildDartStand(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const batch = new MeshBatcher();

  const timber = ctx.materials.get('timber');
  const dark = ctx.materials.get('timberDark');
  const iron = ctx.materials.get('iron');
  const add = (
    material: THREE.Material,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
  ): void => {
    batch.add(material, boxGeometry(size[0], size[1], size[2]), at(size, position), { tile: 0.6 });
  };

  // Cross-footed base and a post, so it does not read as a box on the floor.
  add(dark, [0.56, 0.08, 0.18], [0, 0, 0]);
  add(dark, [0.18, 0.08, 0.46], [0, 0, 0]);
  add(timber, [0.16, 0.78, 0.16], [0, 0.08, 0]);
  // A collar where the post meets the tray, so the top does not float.
  add(dark, [0.26, 0.06, 0.26], [0, 0.8, 0]);

  // The tray on top, tilted toward the player, with a lip to stop a spill.
  const tray = boxGeometry(0.5, 0.07, 0.34);
  batch.add(timber, tray, tiltMatrix([0, 0.9, 0], [-0.18, 0, 0]), { tile: 0.6 });
  add(dark, [0.52, 0.07, 0.05], [0, 0.86, -0.17]);

  // Darts standing point-down in it. Six, in a row, at slightly different leans:
  // "there are always more" is the whole message of this prop.
  for (let i = 0; i < 6; i++) {
    const x = -0.17 + i * 0.068;
    const lean = ctx.rng() * 0.12 - 0.06;
    const barrel = new THREE.CylinderGeometry(0.008, 0.008, 0.11, 6);
    batch.add(ctx.materials.get('dart.barrel'), barrel, tiltMatrix([x, 0.99, 0.01], [lean, 0, lean * 0.6]), {
      tile: 0.3,
      consume: true,
    });
    add(ctx.materials.get('dart.flight'), [0.035, 0.055, 0.005], [x, 1.04, 0.01]);
  }

  // A brass plate on the post. It says nothing - art has no `t()` - but it is
  // what makes the thing read as "help yourself" rather than as a coat stand.
  add(ctx.materials.get('brass'), [0.16, 0.1, 0.02], [0, 0.6, -0.06]);
  batch.add(iron, boxGeometry(0.12, 0.02, 0.02), poseMatrix([0, 0.65, -0.075]), { tile: 0.2 });

  const interactAnchor = new THREE.Object3D();
  interactAnchor.position.set(0, 1.05, -0.25);
  object.add(interactAnchor);

  const built = batch.build();
  object.add(built.object);

  return {
    object,
    colliders: [{ kind: 'circle', center: [0, 0], radius: 0.3 }],
    parts: { interactAnchor },
    dispose: built.dispose,
  };
}

/* --- the dart --------------------------------------------------------------------- */

/**
 * `lobby.dart` - roughly `0.16 m` long, origin at its CENTRE, point along -Z.
 *
 * Pointing along -Z rather than standing upright is what lets logic aim it with
 * a single `lookAt` down the velocity: this is a thing whose whole life is
 * spent pointing where it is going, or where it went.
 *
 * The same builder serves all three lives of a dart - the one in your hand, the
 * one in flight, and the ones stuck in the board - so it is deliberately merged
 * down to two meshes. There can be a dozen in the board at once.
 */
export function buildDart(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const batch = new MeshBatcher();

  const steel = ctx.materials.get('dart.barrel');
  const flight = ctx.materials.get('dart.flight');

  // Point, barrel, shaft: one line of steel, thickest where you hold it.
  const point = new THREE.ConeGeometry(0.005, 0.036, 6);
  batch.add(steel, point, tiltMatrix([0, 0, -0.062], [-Math.PI / 2, 0, 0]), { consume: true });
  const barrel = new THREE.CylinderGeometry(0.0065, 0.0055, 0.058, 7);
  batch.add(steel, barrel, tiltMatrix([0, 0, -0.015], [Math.PI / 2, 0, 0]), { tile: 0.2, consume: true });
  // Two knurled rings, which is what reads as "dart" rather than "nail".
  for (const z of [-0.03, 0.0]) {
    const knurl = new THREE.CylinderGeometry(0.0078, 0.0078, 0.006, 7);
    batch.add(steel, knurl, tiltMatrix([0, 0, z], [Math.PI / 2, 0, 0]), { tile: 0.2, consume: true });
  }
  const shaft = new THREE.CylinderGeometry(0.0035, 0.0045, 0.034, 6);
  batch.add(steel, shaft, tiltMatrix([0, 0, 0.031], [Math.PI / 2, 0, 0]), { tile: 0.2, consume: true });

  // Flights: two blades crossed at the tail.
  for (const roll of [0, Math.PI / 2]) {
    const blade = boxGeometry(0.034, 0.0015, 0.042);
    batch.add(flight, blade, tiltMatrix([0, 0, 0.066], [Math.PI / 2, 0, roll]), { consume: true });
  }

  const built = batch.build();
  object.add(built.object);

  return { object, colliders: [], parts: {}, dispose: built.dispose };
}
