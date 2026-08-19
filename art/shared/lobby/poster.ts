/**
 * Lobby posters - one per map, hung on the cabin's poster wall.
 *
 * Contract (docs/art/SHARED_ART.md): 0.86 m wide x 1.22 m tall, origin at the
 * BOTTOM CENTRE of the frame, facing -Z. Logic drives two parts:
 *
 *   `tick`  shown once this player has escaped that map themselves
 *   `mark`  the pick highlight; logic shows it and tints it via `api.setMark()`
 *
 * A poster carries NO text: art has no access to `t()`, and a map's name is a
 * locale key. The name reaches the player through the interact prompt and the
 * expedition panel, both of which are localised properly.
 *
 * Twenty of these hang on one wall, so each is merged down to four meshes - two
 * of which are normally invisible and therefore free.
 */
import * as THREE from 'three';
import type { ArtBuildContext, ArtBuilder, BuiltArt } from '../../lib/contract';
import { boxGeometry } from '../../lib/build';
import { MeshBatcher, poseMatrix, tiltMatrix } from '../../lib/merge';

export const POSTER_WIDTH = 0.72;
export const POSTER_HEIGHT = 1.02;

const FRAME = 0.055;
const DEPTH = 0.045;
const HALF = POSTER_WIDTH / 2;

/** `y` is the bottom face, matching the convention everywhere else in art. */
function at(size: readonly [number, number, number], position: readonly [number, number, number]): THREE.Matrix4 {
  return poseMatrix([position[0], position[1] + size[1] / 2, position[2]]);
}

/**
 * Builds a poster whose print comes from `materialName`. Every registered poster
 * is this function with a different material, which is what makes adding the
 * nineteenth map a texture plus a line in `config/maps.json`.
 */
function posterBuilder(materialName: string): ArtBuilder {
  return (ctx: ArtBuildContext): BuiltArt => {
    const object = new THREE.Group();

    /* --- frame and print, merged ----------------------------------------- */
    const still = new MeshBatcher();
    const timber = ctx.materials.get('timberDark');
    const bar = (size: readonly [number, number, number], position: readonly [number, number, number]): void => {
      still.add(timber, boxGeometry(size[0], size[1], size[2]), at(size, position), { tile: 0.6 });
    };
    bar([POSTER_WIDTH, FRAME, DEPTH], [0, POSTER_HEIGHT - FRAME, 0]);
    bar([POSTER_WIDTH, FRAME, DEPTH], [0, 0, 0]);
    bar([FRAME, POSTER_HEIGHT, DEPTH], [-HALF + FRAME / 2, 0, 0]);
    bar([FRAME, POSTER_HEIGHT, DEPTH], [HALF - FRAME / 2, 0, 0]);

    // A plane, not a box: its own UVs are the artwork's composition, so the
    // batcher must be left to keep them (no `tile`).
    const paper = new THREE.PlaneGeometry(POSTER_WIDTH - FRAME * 2, POSTER_HEIGHT - FRAME * 2);
    still.add(
      ctx.materials.get(materialName),
      paper,
      // Turned to face -Z, out into the room.
      tiltMatrix([0, POSTER_HEIGHT / 2, -DEPTH / 2 + 0.004], [0, Math.PI, 0]),
      { consume: true, castShadow: false },
    );
    const frame = still.build();
    object.add(frame.object);

    /* --- the completion tick ---------------------------------------------- */
    /**
     * Two thick angled strokes rather than a glyph texture: it has to read as a
     * tick from across a 12 m room, and heavy linework does that far better.
     */
    const tickBatch = new MeshBatcher();
    const stroke = ctx.materials.get('poster.tick');
    const tickX = HALF - 0.17;
    const tickZ = -DEPTH / 2 - 0.008;
    tickBatch.add(
      stroke,
      boxGeometry(0.085, 0.028, 0.014),
      tiltMatrix([tickX - 0.042, 0.2, tickZ], [0, 0, -Math.PI / 4]),
      { tile: 0.3 },
    );
    tickBatch.add(
      stroke,
      boxGeometry(0.17, 0.028, 0.014),
      tiltMatrix([tickX + 0.028, 0.243, tickZ], [0, 0, Math.PI / 3.1]),
      { tile: 0.3 },
    );
    const tickBuilt = tickBatch.build();
    const tick = tickBuilt.object;
    tick.visible = false;
    object.add(tick);

    /* --- the pick highlight ----------------------------------------------- */
    /**
     * A border just outside the frame. Its material is cloned so logic can tint
     * one poster - "somebody picked this" vs "you picked this" - without the
     * change leaking into the shared material cache.
     */
    const markMaterial = ctx.materials.get('poster.mark').clone();
    const markBatch = new MeshBatcher();
    const edge = 0.028;
    const outerW = POSTER_WIDTH + edge * 2;
    const outerH = POSTER_HEIGHT + edge * 2;
    const markZ = -DEPTH / 2 - 0.004;
    const markBar = (size: readonly [number, number, number], position: readonly [number, number, number]): void => {
      markBatch.add(markMaterial, boxGeometry(size[0], size[1], size[2]), at(size, position), { tile: 0.4 });
    };
    markBar([outerW, edge, 0.012], [0, POSTER_HEIGHT, markZ]);
    markBar([outerW, edge, 0.012], [0, -edge, markZ]);
    markBar([edge, outerH, 0.012], [-HALF - edge / 2, -edge, markZ]);
    markBar([edge, outerH, 0.012], [HALF + edge / 2, -edge, markZ]);
    const markBuilt = markBatch.build();
    const mark = markBuilt.object;
    mark.visible = false;
    object.add(mark);

    const interactAnchor = new THREE.Object3D();
    interactAnchor.position.set(0, POSTER_HEIGHT * 0.55, -0.12);
    object.add(interactAnchor);

    return {
      object,
      // The poster wall is a wall: there is nothing extra to walk into.
      colliders: [],
      parts: { tick, mark, interactAnchor },
      api: {
        setMark(colour: string): void {
          (markMaterial as THREE.MeshBasicMaterial).color.set(colour);
        },
      },
      dispose(): void {
        frame.dispose();
        tickBuilt.dispose();
        markBuilt.dispose();
        markMaterial.dispose();
      },
    };
  };
}

/** A slot with nothing pinned in it: a map that does not exist yet. */
export const buildPosterBlank = posterBuilder('poster.blank');
/**
 * "Whichever one you like." Structurally an ordinary poster - same frame, same
 * tick, same mark - because it has to be pressed, marked and tallied exactly
 * like the maps it hangs beside. What it resolves to is `src/game/Lobby.ts`.
 */
export const buildPosterRandom = posterBuilder('poster.random');
export const buildPosterMansion = posterBuilder('poster.mansion');
export const buildPosterViscera = posterBuilder('poster.viscera');
export const buildPosterAbyss = posterBuilder('poster.abyss');
export const buildPosterCrypt = posterBuilder('poster.crypt');
export const buildPosterForge = posterBuilder('poster.forge');
export const buildPosterHeartwood = posterBuilder('poster.heartwood');
export const buildPosterPrison = posterBuilder('poster.prison');
export const buildPosterTest = posterBuilder('poster.test');
