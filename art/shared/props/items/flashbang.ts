/**
 * `item.flashbang` - a flare charge: a steel canister with a brass cap, banded
 * in warning red and windowed so the charge inside shows.
 *
 * Contract (docs/art/SHARED_ART.md): fits the 0.35 x 0.35 x 0.4 m size class,
 * origin at the floor centre, no collider. Built standing, because a canister
 * on its end is the shape a player already knows means "this goes off".
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../../lib/contract';
import { box } from '../../../lib/build';

const RADIUS = 0.048;
const BODY = 0.17;

const bodyGeometry = new THREE.CylinderGeometry(RADIUS, RADIUS, BODY, 14, 1);
const bandGeometry = new THREE.CylinderGeometry(RADIUS + 0.006, RADIUS + 0.006, 0.016, 14, 1);
const capGeometry = new THREE.CylinderGeometry(RADIUS * 0.82, RADIUS + 0.004, 0.034, 14, 1);
const lensGeometry = new THREE.SphereGeometry(RADIUS * 0.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const ringGeometry = new THREE.TorusGeometry(0.022, 0.005, 6, 12);

export function buildFlashbang(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const steel = ctx.materials.get('itemSteel');
  const brass = ctx.materials.get('itemBrass');
  const accent = ctx.materials.get('itemAccent');
  const enamel = ctx.materials.get('itemEnamel');

  const body = new THREE.Mesh(bodyGeometry, steel);
  body.position.y = BODY / 2;
  object.add(body);

  // Two red bands. Nothing else in the roster is banded, so this is the tell.
  for (const y of [BODY * 0.3, BODY * 0.68]) {
    const band = new THREE.Mesh(bandGeometry, accent);
    band.position.y = y;
    object.add(band);
  }

  const cap = new THREE.Mesh(capGeometry, brass);
  cap.position.y = BODY + 0.017;
  object.add(cap);

  // The charge itself, showing through the top - the thing that is about to go
  // off, visible before it does.
  const lens = new THREE.Mesh(lensGeometry, enamel);
  lens.position.y = BODY + 0.034;
  object.add(lens);

  // The pull ring, hung off the cap and lying at a slightly different angle on
  // every charge in the map.
  const ring = new THREE.Mesh(ringGeometry, brass);
  ring.rotation.x = Math.PI / 2;
  ring.rotation.z = (ctx.rng() - 0.5) * 0.8;
  ring.position.set(RADIUS + 0.014, BODY + 0.012, 0);
  object.add(ring);

  // A stencilled label, so the canister is not a bare tube from every angle.
  object.add(box(enamel, [0.034, 0.05, 0.002], [0, BODY * 0.4, -RADIUS - 0.001]));

  const gripAnchor = new THREE.Object3D();
  gripAnchor.position.set(0, BODY * 0.45, 0);
  object.add(gripAnchor);

  const restAnchor = new THREE.Object3D();
  object.add(restAnchor);

  return { object, colliders: [], parts: { gripAnchor, restAnchor } };
}
