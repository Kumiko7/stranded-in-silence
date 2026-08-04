/**
 * `item.tarFlask` - a wax-sealed glass flask, three quarters full of something
 * that does not reflect anything.
 *
 * Contract (docs/art/SHARED_ART.md): fits the 0.35 x 0.35 x 0.4 m size class,
 * origin at the floor centre, no collider.
 *
 * The tar is a second, smaller mesh INSIDE the glass rather than a tint on it:
 * a transparent shell with an opaque core is the only way a bottle reads as
 * full in a room this dark.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../../lib/contract';

const BULB = 0.072;
const NECK = 0.062;

const bulbGeometry = new THREE.SphereGeometry(BULB, 16, 12);
const fillGeometry = new THREE.SphereGeometry(BULB - 0.008, 14, 10);
const neckGeometry = new THREE.CylinderGeometry(0.021, 0.03, NECK, 12, 1);
const corkGeometry = new THREE.CylinderGeometry(0.02, 0.023, 0.032, 12, 1);
const sealGeometry = new THREE.TorusGeometry(0.023, 0.007, 6, 14);
const twineGeometry = new THREE.TorusGeometry(0.031, 0.005, 6, 14);

export function buildTarFlask(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const glass = ctx.materials.get('itemGlass');
  const tar = ctx.materials.get('itemTar');
  const wood = ctx.materials.get('itemWood');
  const accent = ctx.materials.get('itemAccent');

  const bulb = new THREE.Mesh(bulbGeometry, glass);
  bulb.scale.set(1, 0.88, 1);
  bulb.position.y = BULB * 0.88;
  object.add(bulb);

  // The contents, sitting low the way a heavy liquid does. Kept well clear of
  // the shoulder: the empty band of glass above it is the only thing that says
  // "bottle" rather than "cannonball".
  const fill = new THREE.Mesh(fillGeometry, tar);
  fill.scale.set(1, 0.62, 1);
  fill.position.y = BULB * 0.62;
  object.add(fill);

  // The neck stands clear of the bulb, or the cork reads as a lid on a ball.
  const neck = new THREE.Mesh(neckGeometry, glass);
  neck.position.y = BULB * 1.76 + NECK / 2 - 0.012;
  object.add(neck);

  const cork = new THREE.Mesh(corkGeometry, wood);
  cork.position.y = neck.position.y + NECK / 2 + 0.012;
  object.add(cork);

  // Wax over the cork: the promise that it has not leaked yet.
  const seal = new THREE.Mesh(sealGeometry, accent);
  seal.rotation.x = Math.PI / 2;
  seal.position.y = cork.position.y + 0.008;
  object.add(seal);

  // Twine round the shoulder, wound at a different angle on each flask.
  const twine = new THREE.Mesh(twineGeometry, wood);
  twine.rotation.set(Math.PI / 2, 0, 0);
  twine.rotation.z = (ctx.rng() - 0.5) * 0.4;
  twine.position.y = BULB * 1.66;
  object.add(twine);

  const gripAnchor = new THREE.Object3D();
  gripAnchor.position.set(0, BULB * 1.7, 0);
  object.add(gripAnchor);

  const restAnchor = new THREE.Object3D();
  object.add(restAnchor);

  return { object, colliders: [], parts: { gripAnchor, restAnchor } };
}
