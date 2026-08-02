/**
 * `chest.standard`.
 *
 * Contract (docs/art/SHARED_ART.md): 1.0 x 0.7 m footprint, <= 1.1 m tall, origin
 * at the floor centre, facing -Z. Build it SHUT - logic drives `lid.rotation.x`
 * over the hold duration.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../lib/contract';
import { box, boxCollider } from '../../lib/build';

const WIDTH = 1.0;
const DEPTH = 0.7;
const BODY_HEIGHT = 0.52;
const LID_HEIGHT = 0.14;
const PANEL = 0.06;

export function buildChest(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const shell = ctx.materials.get('chest');
  const trim = ctx.materials.get('chestTrim');

  // Hollow, so an opened chest actually shows what is inside it.
  object.add(box(shell, [WIDTH, PANEL, DEPTH], [0, 0, 0]));
  for (const z of [-DEPTH / 2 + PANEL / 2, DEPTH / 2 - PANEL / 2]) {
    object.add(box(shell, [WIDTH, BODY_HEIGHT, PANEL], [0, 0, z]));
  }
  for (const x of [-WIDTH / 2 + PANEL / 2, WIDTH / 2 - PANEL / 2]) {
    object.add(box(shell, [PANEL, BODY_HEIGHT, DEPTH - PANEL * 2], [x, 0, 0]));
  }

  // Iron banding, so the silhouette reads as a container and not a crate.
  for (const x of [-WIDTH / 2 + 0.11, WIDTH / 2 - 0.11]) {
    object.add(box(trim, [0.07, BODY_HEIGHT + 0.02, DEPTH + 0.02], [x, 0, 0]));
  }

  // Hinged along the back edge (+Z), so the lid falls away from the player.
  const lid = new THREE.Group();
  lid.position.set(0, BODY_HEIGHT, DEPTH / 2);
  lid.add(box(shell, [WIDTH, LID_HEIGHT, DEPTH], [0, 0, -DEPTH / 2]));
  lid.add(box(trim, [WIDTH + 0.03, 0.05, 0.07], [0, LID_HEIGHT * 0.4, -DEPTH]));
  object.add(lid);

  const contentsAnchor = new THREE.Object3D();
  contentsAnchor.position.set(0, PANEL, 0);
  object.add(contentsAnchor);

  const interactAnchor = new THREE.Object3D();
  interactAnchor.position.set(0, BODY_HEIGHT + 0.1, -DEPTH / 2);
  object.add(interactAnchor);

  return {
    object,
    colliders: [boxCollider([WIDTH, BODY_HEIGHT, DEPTH], [0, 0, 0])],
    parts: { lid, contentsAnchor, interactAnchor },
  };
}
