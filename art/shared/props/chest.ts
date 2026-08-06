/**
 * `chest.standard`.
 *
 * Contract (docs/art/SHARED_ART.md): 1.0 x 0.7 m footprint, <= 1.1 m tall,
 * origin at the floor centre, facing -Z. Build it SHUT - logic drives
 * `lid.rotation.x` over the hold duration.
 *
 * The body is HOLLOW and lined, because logic drops the revealed item at
 * `contentsAnchor` as a real world object that the player then has to see and
 * click. A solid block swallows it.
 *
 * Every dimension here is a constant, so all the geometry that is not a plain
 * box lives at module scope and is shared by every chest in the map - the same
 * bargain `art/lib/build.ts` makes for boxes.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../lib/contract';
import { box, boxCollider } from '../../lib/build';

const WIDTH = 1.0;
const DEPTH = 0.7;
const BODY_HEIGHT = 0.52;
const PANEL = 0.06;
/** Corner feet, so the chest sits on the boards rather than melting into them. */
const FOOT = 0.055;
const BODY_TOP = FOOT + BODY_HEIGHT;

/* --- fixed geometry, built once ---------------------------------------------- */

/**
 * The lid: a half-cylinder lying along X. Rotating a half-cylinder into place
 * rather than stacking boxes is what turns the old flat plank into something
 * that reads as a chest from across a room.
 */
const LID_SHELL = new THREE.CylinderGeometry(DEPTH / 2, DEPTH / 2, WIDTH, 22, 1, false, 0, Math.PI);
/** A band over the lid: the same shell, barely wider, sliced thin. */
const LID_BAND = new THREE.CylinderGeometry(DEPTH / 2 + 0.012, DEPTH / 2 + 0.012, 0.07, 22, 1, false, 0, Math.PI);
const HINGE_BARREL = new THREE.CylinderGeometry(0.026, 0.026, 0.12, 10);
const RIVET = new THREE.CylinderGeometry(0.016, 0.016, 0.014, 8);
const LOCK_LOOP = new THREE.TorusGeometry(0.045, 0.014, 6, 14, Math.PI);

/** A row of rivet heads along a strap. */
function rivets(material: THREE.Material, x: number, z: number, heights: readonly number[]): THREE.Group {
  const group = new THREE.Group();
  for (const y of heights) {
    const rivet = new THREE.Mesh(RIVET, material);
    rivet.rotation.x = Math.PI / 2;
    rivet.position.set(x, y, z);
    group.add(rivet);
  }
  return group;
}

export function buildChest(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const shell = ctx.materials.get('chest');
  const trim = ctx.materials.get('chestTrim');

  /* --- the body ------------------------------------------------------------- */

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      object.add(box(trim, [0.13, FOOT, 0.13], [sx * (WIDTH / 2 - 0.08), 0, sz * (DEPTH / 2 - 0.08)]));
    }
  }

  object.add(box(shell, [WIDTH, PANEL, DEPTH], [0, FOOT, 0]));
  for (const z of [-DEPTH / 2 + PANEL / 2, DEPTH / 2 - PANEL / 2]) {
    object.add(box(shell, [WIDTH, BODY_HEIGHT, PANEL], [0, FOOT, z]));
  }
  for (const x of [-WIDTH / 2 + PANEL / 2, WIDTH / 2 - PANEL / 2]) {
    object.add(box(shell, [PANEL, BODY_HEIGHT, DEPTH - PANEL * 2], [x, FOOT, 0]));
  }

  // A lining a shade off the shell, set in from the walls. It is what makes an
  // open chest read as having an inside rather than as a box with no top.
  object.add(box(trim, [WIDTH - PANEL * 2 - 0.03, 0.014, DEPTH - PANEL * 2 - 0.03], [0, FOOT + PANEL, 0]));

  /* --- ironwork -------------------------------------------------------------- */

  const strapHeights = [FOOT + 0.08, FOOT + BODY_HEIGHT - 0.09];

  // Three vertical straps, riveted. The outer two double as corner brackets.
  for (const x of [-WIDTH / 2 + 0.12, 0, WIDTH / 2 - 0.12]) {
    object.add(box(trim, [0.075, BODY_HEIGHT + 0.012, DEPTH + 0.024], [x, FOOT, 0]));
    for (const z of [-DEPTH / 2 - 0.008, DEPTH / 2 + 0.008]) {
      object.add(rivets(trim, x, z, strapHeights));
    }
  }

  // A rail round the top edge, which is where a lid actually meets a body.
  for (const z of [-DEPTH / 2 + 0.02, DEPTH / 2 - 0.02]) {
    object.add(box(trim, [WIDTH + 0.02, 0.045, 0.045], [0, BODY_TOP - 0.045, z]));
  }
  for (const x of [-WIDTH / 2 + 0.02, WIDTH / 2 - 0.02]) {
    object.add(box(trim, [0.045, 0.045, DEPTH - 0.04], [x, BODY_TOP - 0.045, 0]));
  }

  // The hasp on the front, so there is something to have opened.
  object.add(box(trim, [0.14, 0.13, 0.03], [0, BODY_TOP - 0.16, -DEPTH / 2 - 0.012]));
  const keyhole = new THREE.Mesh(RIVET, shell);
  keyhole.rotation.x = Math.PI / 2;
  keyhole.position.set(0, BODY_TOP - 0.1, -DEPTH / 2 - 0.03);
  object.add(keyhole);

  /* --- the lid --------------------------------------------------------------- */

  // Hinged along the back edge (+Z), so the lid falls away from the player.
  const lid = new THREE.Group();
  lid.position.set(0, BODY_TOP, DEPTH / 2);

  const dome = new THREE.Mesh(LID_SHELL, shell);
  dome.rotation.z = Math.PI / 2;
  dome.position.z = -DEPTH / 2;
  lid.add(dome);

  for (const x of [-WIDTH / 2 + 0.12, 0, WIDTH / 2 - 0.12]) {
    const band = new THREE.Mesh(LID_BAND, trim);
    band.rotation.z = Math.PI / 2;
    band.position.set(x, 0, -DEPTH / 2);
    lid.add(band);
  }

  // A skirt under the dome, so the lid overlaps the body instead of balancing
  // on it - the one join that gives a hinged prop away when it is missing.
  for (const z of [-DEPTH + 0.022, -0.022]) {
    lid.add(box(trim, [WIDTH + 0.024, 0.05, 0.044], [0, -0.05, z]));
  }
  for (const x of [-WIDTH / 2 - 0.01, WIDTH / 2 + 0.01]) {
    lid.add(box(trim, [0.044, 0.05, DEPTH], [x, -0.05, -DEPTH / 2]));
  }

  // The other half of the hasp, hanging off the lid's front lip.
  const loop = new THREE.Mesh(LOCK_LOOP, trim);
  loop.position.set(0, -0.052, -DEPTH - 0.014);
  lid.add(loop);

  object.add(lid);

  for (const x of [-WIDTH / 2 + 0.22, WIDTH / 2 - 0.22]) {
    const barrel = new THREE.Mesh(HINGE_BARREL, trim);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(x, BODY_TOP + 0.012, DEPTH / 2 + 0.012);
    object.add(barrel);
  }

  /* --- anchors ---------------------------------------------------------------- */

  const contentsAnchor = new THREE.Object3D();
  contentsAnchor.position.set(0, FOOT + PANEL + 0.014, 0);
  object.add(contentsAnchor);

  const interactAnchor = new THREE.Object3D();
  interactAnchor.position.set(0, BODY_TOP + 0.06, -DEPTH / 2);
  object.add(interactAnchor);

  return {
    object,
    colliders: [boxCollider([WIDTH, BODY_HEIGHT, DEPTH], [0, 0, 0])],
    parts: { lid, contentsAnchor, interactAnchor },
  };
}
