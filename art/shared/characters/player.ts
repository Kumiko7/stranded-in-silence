/**
 * `player.masked` - the remote-player body.
 *
 * Contract (docs/art/SHARED_ART.md): capsule 0.64 m across, 1.8 m tall, origin at
 * the floor centre, facing -Z. Logic yaws `root` and pitches `head`.
 * Deliberately minimal for now; a proper masked human lands with the art pass.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../lib/contract';
import { box } from '../../lib/build';

export function buildPlayer(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const root = new THREE.Group();
  object.add(root);

  const cloth = ctx.materials.get('playerBody');
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.72, 4, 10), cloth);
  torso.position.y = 1.02;
  root.add(torso);

  const head = new THREE.Group();
  head.position.y = 1.6;
  root.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), cloth);
  head.add(skull);

  // Flat pale mask on the front so you can tell which way someone is facing.
  const mask = box(ctx.materials.get('playerMask'), [0.2, 0.24, 0.03], [0, -0.12, -0.15]);
  head.add(mask);

  const handLeft = new THREE.Object3D();
  handLeft.position.set(-0.34, 1.05, -0.18);
  root.add(handLeft);

  const handRight = new THREE.Object3D();
  handRight.position.set(0.34, 1.05, -0.18);
  root.add(handRight);

  const nameAnchor = new THREE.Object3D();
  nameAnchor.position.set(0, 2.1, 0);
  root.add(nameAnchor);

  return {
    object,
    colliders: [],
    parts: { root, head, handLeft, handRight, nameAnchor },
  };
}
