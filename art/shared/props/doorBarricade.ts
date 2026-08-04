/**
 * `door.barricade` - planks nailed across a closed door.
 *
 * Placed on the door's own transform (origin at the floor centre of the
 * opening, facing -Z), so it lines up with `door.standard` and every themed
 * variant of it without knowing anything about either. It never moves: the door
 * behind it stays shut until somebody tears this off, and tearing it off deletes
 * the whole piece.
 *
 * Sized from `ctx.dims`, so a pack with a wider doorway gets wider planks.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../lib/contract';
import { box, range } from '../../lib/build';

const PLANK_THICKNESS = 0.05;
const PLANK_DEPTH = 0.09;

const nailGeometry = new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6, 1);

export function buildDoorBarricade(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const wood = ctx.materials.get('itemWood');
  const steel = ctx.materials.get('itemSteel');

  const width = ctx.dims.doorWidth;
  const height = ctx.dims.doorHeight;
  // Over-length on purpose: a plank that stops at the frame reads as fitted
  // joinery. It has to look like it was grabbed and hammered on.
  const span = width + 0.34;

  /** One plank across the opening, nailed at both ends. */
  const plank = (y: number, tilt: number, slide: number): void => {
    const group = new THREE.Group();
    group.position.set(slide, y, 0);
    group.rotation.z = tilt;

    group.add(box(wood, [span, PLANK_THICKNESS, PLANK_DEPTH], [0, -PLANK_THICKNESS / 2, 0]));
    for (const x of [-width / 2 - 0.06, width / 2 + 0.06]) {
      const nail = new THREE.Mesh(nailGeometry, steel);
      nail.rotation.x = Math.PI / 2;
      nail.position.set(x, 0, 0);
      group.add(nail);
    }
    object.add(group);
  };

  plank(height * 0.32, range(ctx.rng, -0.06, 0.06), range(ctx.rng, -0.04, 0.04));
  plank(height * 0.58, range(ctx.rng, -0.05, 0.05), range(ctx.rng, -0.04, 0.04));
  plank(height * 0.82, range(ctx.rng, -0.07, 0.07), range(ctx.rng, -0.04, 0.04));

  // One brace on the diagonal. It is what turns three horizontals into a thing
  // somebody built in a hurry rather than a fence.
  const brace = new THREE.Group();
  brace.position.set(0, height * 0.55, -0.02);
  brace.rotation.z = -1.02;
  brace.add(box(wood, [height * 0.62, PLANK_THICKNESS * 0.8, PLANK_DEPTH * 0.8], [0, 0, 0]));
  object.add(brace);

  // Wedged under it, taking the weight. There is no part list to satisfy here -
  // logic only ever adds this piece and deletes it.
  const wedge = box(wood, [0.16, 0.09, 0.22], [width * 0.24, 0, -0.06]);
  wedge.rotation.z = 0.22;
  object.add(wedge);

  return { object, colliders: [], parts: {} };
}
