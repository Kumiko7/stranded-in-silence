/**
 * `locker.standard`.
 *
 * Contract (docs/art/SHARED_ART.md): 0.9 x 0.7 m footprint, 2.0 m tall, origin
 * at the floor centre, facing -Z. Single-door, so `doorRight` is the empty
 * placeholder the contract allows. Build it SHUT - logic swings the door.
 *
 * The hinge point and the leaf's size are unchanged from the greybox: logic
 * rotates `doorLeft.rotation.y` and nothing here may move where that pivot is.
 * What is new is everything a player sees while deciding whether to get inside
 * one - a recessed panel, real louvres angled to shed the light, a latch, and
 * an interior with a shelf in it so an open locker is somewhere to hide rather
 * than a hole.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../lib/contract';
import { box, boxCollider } from '../../lib/build';

const WIDTH = 0.9;
const DEPTH = 0.7;
const HEIGHT = 2.0;
const PANEL = 0.05;
/** Plinth height. The carcass sits on it; the contract height is unchanged. */
const PLINTH = 0.07;

const LEAF_WIDTH = WIDTH - PANEL * 2;

/* --- fixed geometry, built once ---------------------------------------------- */

const HANDLE_BAR = new THREE.CylinderGeometry(0.017, 0.017, 0.19, 10);
const HANDLE_STUB = new THREE.CylinderGeometry(0.014, 0.018, 0.045, 8);
const HINGE_PIP = new THREE.CylinderGeometry(0.019, 0.019, 0.075, 10);
const HOOK = new THREE.TorusGeometry(0.026, 0.007, 6, 12, Math.PI * 1.3);

/**
 * A louvred vent: slats tilted down and forward, the way a real one is, so the
 * shadow between them changes as you walk past instead of staying a flat grille.
 */
function louvres(material: THREE.Material, count: number, bottom: number): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const slat = box(material, [LEAF_WIDTH * 0.66, 0.028, 0.05], [LEAF_WIDTH / 2, bottom + i * 0.065, -0.012]);
    slat.rotation.x = -0.55;
    group.add(slat);
  }
  return group;
}

export function buildLocker(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const metal = ctx.materials.get('locker');
  const vent = ctx.materials.get('lockerVent');

  /* --- carcass --------------------------------------------------------------- */

  // A plinth set back from the face, which is what gives a steel cabinet its
  // shadow line along the floor.
  object.add(box(vent, [WIDTH - 0.05, PLINTH, DEPTH - 0.05], [0, 0, 0]));

  object.add(box(metal, [WIDTH, PANEL, DEPTH], [0, HEIGHT - PANEL, 0]));
  object.add(box(metal, [WIDTH, PANEL, DEPTH], [0, PLINTH, 0]));
  object.add(box(metal, [WIDTH, HEIGHT, PANEL], [0, 0, DEPTH / 2 - PANEL / 2]));
  for (const x of [-WIDTH / 2 + PANEL / 2, WIDTH / 2 - PANEL / 2]) {
    object.add(box(metal, [PANEL, HEIGHT, DEPTH], [x, 0, 0]));
  }

  // A lip over the top and a shadow gap under it: a flat-topped box reads as a
  // crate, and this thing has to read as furniture from across a room.
  object.add(box(vent, [WIDTH + 0.03, 0.035, DEPTH + 0.03], [0, HEIGHT, 0]));

  /* --- what is inside it ------------------------------------------------------ */

  const inside = DEPTH - PANEL * 2;
  object.add(box(vent, [LEAF_WIDTH - 0.02, 0.022, inside - 0.02], [0, HEIGHT * 0.72, 0.02]));
  object.add(box(vent, [LEAF_WIDTH - 0.02, 0.03, 0.035], [0, HEIGHT * 0.68, DEPTH / 2 - PANEL - 0.03]));
  for (const x of [-0.16, 0.16]) {
    const hook = new THREE.Mesh(HOOK, vent);
    hook.rotation.set(Math.PI / 2, 0, Math.PI);
    hook.position.set(x, HEIGHT * 0.665, DEPTH / 2 - PANEL - 0.045);
    object.add(hook);
  }

  /* --- the door --------------------------------------------------------------- */

  // Hinged on the -X edge of the front face; logic rotates `doorLeft.rotation.y`.
  const doorLeft = new THREE.Group();
  doorLeft.position.set(-WIDTH / 2 + PANEL, 0, -DEPTH / 2 + PANEL / 2);

  const leafHeight = HEIGHT - PANEL * 2;
  doorLeft.add(box(metal, [LEAF_WIDTH, leafHeight, PANEL], [LEAF_WIDTH / 2, PANEL, 0]));

  // A recessed centre panel: a shallow frame proud of the leaf on three sides,
  // stopping short of the vent so the two never argue.
  const panelBottom = 0.24;
  const panelTop = HEIGHT * 0.6;
  const inset = 0.085;
  for (const y of [panelBottom, panelTop - 0.03]) {
    doorLeft.add(box(vent, [LEAF_WIDTH - inset * 2, 0.03, 0.014], [LEAF_WIDTH / 2, y, -PANEL / 2 - 0.007]));
  }
  for (const sx of [-1, 1]) {
    doorLeft.add(
      box(
        vent,
        [0.03, panelTop - panelBottom, 0.014],
        [LEAF_WIDTH / 2 + sx * (LEAF_WIDTH / 2 - inset - 0.015), panelBottom, -PANEL / 2 - 0.007],
      ),
    );
  }

  const slats = louvres(vent, 6, HEIGHT * 0.66);
  doorLeft.add(slats);

  // Number plate, top left. Every locker in every changing room has one, and it
  // is the cheapest possible way to say "this is a locker, not a cupboard".
  doorLeft.add(box(vent, [0.13, 0.09, 0.012], [LEAF_WIDTH / 2, HEIGHT - 0.24, -PANEL / 2 - 0.006]));

  // Handle: a vertical bar on two stubs, with a latch tongue beside it.
  const handleX = LEAF_WIDTH - 0.085;
  const bar = new THREE.Mesh(HANDLE_BAR, vent);
  bar.position.set(handleX, HEIGHT * 0.47, -PANEL / 2 - 0.055);
  doorLeft.add(bar);
  for (const y of [HEIGHT * 0.47 - 0.085, HEIGHT * 0.47 + 0.085]) {
    const stub = new THREE.Mesh(HANDLE_STUB, vent);
    stub.rotation.x = Math.PI / 2;
    stub.position.set(handleX, y, -PANEL / 2 - 0.028);
    doorLeft.add(stub);
  }
  doorLeft.add(box(vent, [0.05, 0.11, 0.016], [handleX, HEIGHT * 0.53, -PANEL / 2 - 0.008]));

  object.add(doorLeft);

  // Hinge pips on the carcass, not the leaf, so they stay put as it swings.
  for (const y of [0.28, HEIGHT * 0.5, HEIGHT - 0.32]) {
    const pip = new THREE.Mesh(HINGE_PIP, vent);
    pip.position.set(-WIDTH / 2 + 0.018, y, -DEPTH / 2 - 0.012);
    object.add(pip);
  }

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
