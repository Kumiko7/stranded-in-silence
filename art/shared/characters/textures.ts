/**
 * Surface detail for the two characters every map shares - the player suit and
 * the hunter's shroud.
 *
 * These are the one place shared art brings maps of its own. Packs give the
 * characters a flat tint (`playerBody`, `ghostShroud`) and nothing else, and a
 * body seen from half a metre away in the wardrobe needs a weave to look like
 * cloth rather than like paint. Everything here is a NORMAL or ROUGHNESS map,
 * never a colour map, so a pack that later themes `playerBody` with an albedo
 * of its own still wins the argument about what colour the suit is.
 *
 * Tiling is baked into the pattern rather than set with `texture.repeat`: these
 * are module-cached and handed to every player in the run, so one body changing
 * the repeat would change all of them.
 *
 * Rules are `art/lib/textures.ts`'s rules: no canvas, no `Math.random()`,
 * cached at module scope.
 */
import * as THREE from 'three';
import { dataTexture, fbm, normalTexture } from '../../lib/textures';

const SIZE = 128;

/**
 * The suit's tooth.
 *
 * It is noise and nothing else, on purpose. The first version wove threads and
 * quilted panels into it, and both are a mistake at this scale: the body's UVs
 * run 0..1 over the WHOLE torso, so a lattice of any frequency you can see at
 * all comes out as centimetre-deep bobbles - a player in a knitted golf ball.
 * What a suit actually needs from a metre away is a surface that is not
 * perfectly smooth, which is this, at a normal scale low enough to be felt
 * rather than read.
 */
export function suitWeave(): THREE.Texture {
  return normalTexture(
    'char.suitTooth',
    SIZE,
    (x, y, size) => fbm((x / size) * 24, (y / size) * 24, 24, 24, 3117, 3) - 0.5,
    0.7,
  );
}

/** Where the suit has been rubbed shiny - knees, elbows, wherever it creases. */
export function suitWear(): THREE.Texture {
  return dataTexture('char.suitWear', SIZE, (x, y, size) => {
    const wear = fbm((x / size) * 5, (y / size) * 5, 5, 5, 8821, 4);
    return 0.72 + wear * 0.34;
  });
}

/**
 * The shroud: long vertical drapes, disturbed enough that it never reads as a
 * corrugated tube. Stretched noise, so the two lattice periods differ.
 */
export function shroudFolds(): THREE.Texture {
  return normalTexture(
    'char.shroudFolds',
    SIZE,
    (x, y, size) => {
      const u = x / size;
      const v = y / size;
      const drape = Math.sin(u * Math.PI * 18 + fbm(u * 4, v * 2, 4, 2, 511, 2) * 4);
      const creases = fbm(u * 10, v * 3, 10, 3, 6203, 4) - 0.5;
      return drape * 0.55 + creases * 0.7;
    },
    2.2,
  );
}
