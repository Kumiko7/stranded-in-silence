/**
 * `item.barricade` - a strapped bundle of planks with the nails already in them.
 *
 * Contract (docs/art/SHARED_ART.md): fits the 0.35 x 0.35 x 0.4 m size class,
 * origin at the floor centre, no collider.
 *
 * Deliberately reads as the same timber that ends up nailed across the door
 * (`door.barricade`) - picking it up should tell you what it will look like when
 * it is used.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../../lib/contract';
import { box } from '../../../lib/build';

const LENGTH = 0.32;
const PLANK_W = 0.085;
const PLANK_H = 0.026;

const nailGeometry = new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, 6, 1);

export function buildBarricade(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const wood = ctx.materials.get('itemWood');
  const steel = ctx.materials.get('itemSteel');
  const accent = ctx.materials.get('itemAccent');

  // Three planks, stacked and never quite square with each other.
  for (let i = 0; i < 3; i++) {
    const plank = box(wood, [LENGTH, PLANK_H, PLANK_W], [0, i * (PLANK_H + 0.002), 0]);
    plank.rotation.y = (ctx.rng() - 0.5) * 0.16;
    plank.position.z = (ctx.rng() - 0.5) * 0.012;
    object.add(plank);
  }

  const top = 3 * (PLANK_H + 0.002);

  // A leather strap holding the bundle together, in two visible loops.
  for (const x of [-LENGTH * 0.22, LENGTH * 0.22]) {
    object.add(box(accent, [0.02, top + 0.008, PLANK_W + 0.012], [x, -0.004, 0]));
  }

  // Nails through the top plank, ready and pointing the wrong way, as they are.
  for (const [x, tilt] of [[-LENGTH * 0.36, 0.25], [LENGTH * 0.33, -0.3]] as const) {
    const nail = new THREE.Mesh(nailGeometry, steel);
    nail.position.set(x, top + 0.01, PLANK_W * 0.18);
    nail.rotation.z = Math.PI / 2 + tilt;
    object.add(nail);
  }

  const gripAnchor = new THREE.Object3D();
  gripAnchor.position.set(0, top / 2, 0);
  object.add(gripAnchor);

  const restAnchor = new THREE.Object3D();
  object.add(restAnchor);

  return { object, colliders: [], parts: { gripAnchor, restAnchor } };
}
