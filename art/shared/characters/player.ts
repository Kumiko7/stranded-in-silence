/**
 * `player.masked` - the player body: teammates in a run, and the figure standing
 * in front of the lobby wardrobe.
 *
 * Contract (docs/art/SHARED_ART.md): 0.64 m across, 1.8 m tall, origin at the
 * floor centre, facing -Z. Logic yaws `root`, pitches `head` and tints the body
 * through `api.setColour()`.
 *
 * Still deliberately minimal - a proper masked human lands with plan step 33.
 * It has limbs only because the wardrobe stands it full height two metres from
 * the camera, where a bare floating capsule reads as a bug.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../lib/contract';
import { box } from '../../lib/build';

export function buildPlayer(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const root = new THREE.Group();
  object.add(root);

  // Cloned per player so `setColour` can tint one body without every other
  // player in the run changing with it - the same reason the ghost clones its
  // alert material.
  const cloth = ctx.materials.get('playerBody').clone();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.56, 4, 10), cloth);
  torso.position.y = 1.16;
  root.add(torso);

  /**
   * Legs and arms are four boxes and nothing more. They exist because the body
   * stands still and full height in front of the wardrobe, and a bare capsule
   * hovering over the floorboards reads as a bug rather than as a person. The
   * real masked human is plan step 33.
   */
  for (const side of [-1, 1]) {
    const leg = box(cloth, [0.16, 0.86, 0.19], [side * 0.11, 0, 0]);
    root.add(leg);
    const arm = box(cloth, [0.11, 0.6, 0.13], [side * 0.31, 0.82, -0.01]);
    root.add(arm);
    const boot = box(ctx.materials.get('playerMask'), [0.18, 0.08, 0.26], [side * 0.11, 0, -0.03]);
    root.add(boot);
  }

  const head = new THREE.Group();
  head.position.y = 1.62;
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
    api: {
      setColour(hex: string): void {
        (cloth as THREE.MeshStandardMaterial).color?.set(hex);
      },
    },
    dispose(): void {
      cloth.dispose();
      torso.geometry.dispose();
      skull.geometry.dispose();
    },
  };
}
