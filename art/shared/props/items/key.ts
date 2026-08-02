/**
 * `item.key`.
 *
 * Contract (docs/art/SHARED_ART.md): fits the 0.35 x 0.35 x 0.4 m size class,
 * origin at the floor centre of the footprint. Built lying flat on its surface,
 * with `gripAnchor` where a hand socket takes hold.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../../lib/contract';
import { box } from '../../../lib/build';

const LENGTH = 0.26;
const THICKNESS = 0.02;

// Module scope: one geometry shared by every key on the map.
const bowGeometry = new THREE.TorusGeometry(0.045, 0.011, 6, 12);

export function buildKey(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const metal = ctx.materials.get('itemMetal');

  const shaft = box(metal, [THICKNESS, THICKNESS, LENGTH], [0, THICKNESS, 0]);
  object.add(shaft);

  // Bow, lying flat so the key reads as a key from above.
  const bow = new THREE.Mesh(bowGeometry, metal);
  bow.rotation.x = Math.PI / 2;
  bow.position.set(0, THICKNESS * 1.5, LENGTH / 2 + 0.04);
  object.add(bow);

  for (const z of [-LENGTH / 2 + 0.02, -LENGTH / 2 + 0.06]) {
    object.add(box(metal, [0.05, THICKNESS, THICKNESS], [0.02, THICKNESS, z]));
  }

  const gripAnchor = new THREE.Object3D();
  gripAnchor.position.set(0, THICKNESS, LENGTH / 2);
  object.add(gripAnchor);

  const restAnchor = new THREE.Object3D();
  object.add(restAnchor);

  return { object, colliders: [], parts: { gripAnchor, restAnchor } };
}
