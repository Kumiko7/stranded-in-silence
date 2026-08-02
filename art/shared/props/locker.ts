/**
 * `locker.standard`.
 *
 * Contract (docs/art/SHARED_ART.md): 0.9 x 0.7 m footprint, 2.0 m tall, origin at
 * the floor centre, facing -Z. Single-door, so `doorRight` is the empty
 * placeholder the contract allows. Build it SHUT - logic swings the door.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../lib/contract';
import { box, boxCollider } from '../../lib/build';

const WIDTH = 0.9;
const DEPTH = 0.7;
const HEIGHT = 2.0;
const PANEL = 0.05;

export function buildLocker(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const metal = ctx.materials.get('locker');
  const vent = ctx.materials.get('lockerVent');

  object.add(box(metal, [WIDTH, PANEL, DEPTH], [0, HEIGHT - PANEL, 0]));
  object.add(box(metal, [WIDTH, PANEL, DEPTH], [0, 0, 0]));
  object.add(box(metal, [WIDTH, HEIGHT, PANEL], [0, 0, DEPTH / 2 - PANEL / 2]));
  for (const x of [-WIDTH / 2 + PANEL / 2, WIDTH / 2 - PANEL / 2]) {
    object.add(box(metal, [PANEL, HEIGHT, DEPTH], [x, 0, 0]));
  }

  // Hinged on the -X edge of the front face; logic rotates `doorLeft.rotation.y`.
  const doorLeft = new THREE.Group();
  doorLeft.position.set(-WIDTH / 2 + PANEL, 0, -DEPTH / 2 + PANEL / 2);
  const leafWidth = WIDTH - PANEL * 2;
  doorLeft.add(box(metal, [leafWidth, HEIGHT - PANEL * 2, PANEL], [leafWidth / 2, PANEL, 0]));

  const slats = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    slats.add(box(vent, [leafWidth * 0.6, 0.03, 0.02], [leafWidth / 2, HEIGHT * 0.62 + i * 0.08, -PANEL / 2]));
  }
  doorLeft.add(slats);
  object.add(doorLeft);

  // Single-door locker: the contract wants the part to exist regardless.
  const doorRight = new THREE.Object3D();
  object.add(doorRight);

  const insideAnchor = new THREE.Object3D();
  insideAnchor.position.set(0, HEIGHT * 0.78, 0);
  object.add(insideAnchor);

  return {
    object,
    colliders: [boxCollider([WIDTH, HEIGHT, DEPTH], [0, 0, 0])],
    parts: { doorLeft, doorRight, insideAnchor, slats },
  };
}
