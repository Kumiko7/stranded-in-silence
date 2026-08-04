/**
 * `item.medicine` - a field dressing tin with a roll of bandage strapped to it.
 *
 * Contract (docs/art/SHARED_ART.md): fits the 0.35 x 0.35 x 0.4 m size class,
 * origin at the floor centre of the footprint, no collider. Built lying flat on
 * its surface, with `gripAnchor` where a hand socket takes hold.
 *
 * It has to be legible from across a dark room and from a chest's contents
 * anchor, which is why the cross is the largest thing on it.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../../lib/contract';
import { box } from '../../../lib/build';

const WIDTH = 0.23;
const DEPTH = 0.15;
const TIN = 0.062;
const LID = 0.018;
const ARM = 0.012;

// Module scope: one geometry shared by every dressing on the map.
const rollGeometry = new THREE.CylinderGeometry(0.043, 0.043, 0.115, 16, 1);
const coreGeometry = new THREE.CylinderGeometry(0.014, 0.014, 0.117, 10, 1);

export function buildMedicine(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const steel = ctx.materials.get('itemSteel');
  const enamel = ctx.materials.get('itemEnamel');
  const accent = ctx.materials.get('itemAccent');
  const cloth = ctx.materials.get('itemCloth');

  // The tin, in two halves so it reads as something that opens.
  object.add(box(steel, [WIDTH, TIN, DEPTH], [0, 0, 0]));
  object.add(box(enamel, [WIDTH + 0.012, LID, DEPTH + 0.012], [0, TIN, 0]));

  // The cross, on the lid, big enough to read at range.
  const top = TIN + LID;
  object.add(box(accent, [WIDTH * 0.52, 0.004, ARM], [0, top, 0]));
  object.add(box(accent, [ARM, 0.004, DEPTH * 0.5], [0, top, 0]));

  // A leather strap round the middle, which is what stops it looking like a box.
  for (const x of [-WIDTH * 0.28, WIDTH * 0.28]) {
    object.add(box(accent, [0.018, TIN + LID + 0.008, DEPTH + 0.016], [x, -0.002, 0]));
  }

  // The roll, laid END-ON beside the tin rather than behind it. Behind it, the
  // tin hides it from three sides out of four and the item is a plain box from
  // most of the room; beside it, there is always a cylinder next to a box.
  const rollX = WIDTH / 2 + 0.05;
  const roll = new THREE.Mesh(rollGeometry, cloth);
  roll.rotation.x = Math.PI / 2;
  roll.position.set(rollX, 0.043, 0);
  object.add(roll);

  const core = new THREE.Mesh(coreGeometry, enamel);
  core.rotation.x = Math.PI / 2;
  core.position.copy(roll.position);
  object.add(core);

  // The loose end of the bandage, unwound onto the floor.
  const tail = box(cloth, [0.05, 0.004, 0.075], [rollX, 0.001, -DEPTH / 2 - 0.02]);
  tail.rotation.y = (ctx.rng() - 0.5) * 0.5;
  object.add(tail);

  const gripAnchor = new THREE.Object3D();
  gripAnchor.position.set(0, TIN / 2, 0);
  object.add(gripAnchor);

  const restAnchor = new THREE.Object3D();
  object.add(restAnchor);

  return { object, colliders: [], parts: { gripAnchor, restAnchor } };
}
