/**
 * `door.standard` and `door.exit`.
 *
 * Contract (docs/art/SHARED_ART.md): origin at the floor centre of the opening,
 * facing -Z, leaf parented to `hinge` so logic can swing it by rotating one
 * node. Build it CLOSED - logic owns the open angle.
 *
 * The **leaf stays one box**, on purpose. Shared art is not batched, so a box
 * carries a single UV repeat over its whole face, and a pack that authored its
 * door texture as a door (`viscera`'s `bonePlate`) is relying on exactly that.
 * Everything below therefore sits ON the leaf - raised panel mouldings, a mid
 * rail, a kick plate, hardware - rather than cutting it into pieces that would
 * each get their own squeezed copy of the pack's map.
 *
 * Hardware geometry is fixed-size and built once at module scope, because a
 * thirty-three-room map hangs a lot of doors and every one of them wants the
 * same three hinges.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../lib/contract';
import { box } from '../../lib/build';

const LEAF_THICKNESS = 0.08;
const FRAME_WIDTH = 0.09;
/** How far a moulding or a plate stands off the leaf face. */
const PROUD = 0.009;
/** Width of the strips that draw a panel. */
const MOULD = 0.038;
/** How far in from the leaf's edges the panels start - i.e. the stile width. */
const STILE = 0.19;
/** Handle centre, measured back from the leaf's free edge. Clear of the panel. */
const HANDLE_INSET = 0.1;

/* --- hardware, shared by every door in the game ------------------------------ */

const HINGE_BARREL = new THREE.CylinderGeometry(0.021, 0.021, 0.115, 10);
const HANDLE_ROSE = new THREE.CylinderGeometry(0.048, 0.052, 0.022, 16);
const HANDLE_NECK = new THREE.CylinderGeometry(0.017, 0.02, 0.07, 10);
const HANDLE_LEVER = new THREE.CapsuleGeometry(0.017, 0.11, 4, 10);
const KEYHOLE = new THREE.CylinderGeometry(0.014, 0.014, 0.03, 10);
const BOLT_HEAD = new THREE.CylinderGeometry(0.026, 0.026, 0.024, 12);
const PUSH_BAR = new THREE.CylinderGeometry(0.028, 0.028, 1, 14);

/** A rectangular ring of four strips: one raised panel, on one face. */
function panelRing(
  material: THREE.Material,
  centre: readonly [number, number],
  size: readonly [number, number],
  z: number,
): THREE.Group {
  const group = new THREE.Group();
  const [cx = 0, cy = 0] = centre;
  const [w = 0, h = 0] = size;
  const t = PROUD * 2;

  group.add(box(material, [w, MOULD, t], [cx, cy - h / 2, z]));
  group.add(box(material, [w, MOULD, t], [cx, cy + h / 2 - MOULD, z]));
  for (const sx of [-1, 1]) {
    group.add(box(material, [MOULD, h - MOULD * 2, t], [cx + sx * (w / 2 - MOULD / 2), cy - h / 2 + MOULD, z]));
  }
  return group;
}

/**
 * The casing: jambs, head, an architrave standing proud of them, and a
 * threshold. The architrave is what stops a doorway reading as a hole with a
 * stick down each side.
 */
function buildFrame(ctx: ArtBuildContext, material: THREE.Material): THREE.Group {
  const { doorWidth: w, doorHeight: h } = ctx.dims;
  const frame = new THREE.Group();

  const jamb: [number, number, number] = [FRAME_WIDTH, h, FRAME_WIDTH * 1.6];
  frame.add(box(material, jamb, [-w / 2 - FRAME_WIDTH / 2, 0, 0]));
  frame.add(box(material, jamb, [w / 2 + FRAME_WIDTH / 2, 0, 0]));
  frame.add(box(material, [w + FRAME_WIDTH * 2, FRAME_WIDTH, FRAME_WIDTH * 1.6], [0, h, 0]));

  // Architrave: a wider, thinner band on both faces of the wall.
  const casing = 0.062;
  for (const z of [-FRAME_WIDTH * 0.8 - 0.014, FRAME_WIDTH * 0.8 + 0.014]) {
    for (const sx of [-1, 1]) {
      frame.add(box(material, [casing, h + casing, 0.028], [(sx * (w + FRAME_WIDTH * 2 + casing)) / 2 - (sx * casing) / 2 - casing / 2, 0, z]));
    }
    frame.add(box(material, [w + FRAME_WIDTH * 2 + casing * 2, casing, 0.028], [0, h, z]));
  }

  // Threshold. A door that meets bare floor always looks like it is hovering.
  frame.add(box(material, [w + FRAME_WIDTH, 0.018, FRAME_WIDTH * 1.9], [0, 0, 0]));
  return frame;
}

/**
 * Hinged on the -X edge; logic rotates `hinge.rotation.y`. Returns the leaf's
 * own group so callers can hang their own hardware on it.
 */
function buildLeaf(
  ctx: ArtBuildContext,
  leafMaterial: THREE.Material,
  trim: THREE.Material,
): { hinge: THREE.Group; handle: THREE.Object3D } {
  const { doorWidth: w, doorHeight: h } = ctx.dims;
  const leafHeight = h - 0.04;

  const hinge = new THREE.Group();
  hinge.position.set(-w / 2, 0, 0);

  // ONE box, so the pack's door texture lands on it exactly as authored.
  hinge.add(box(leafMaterial, [w, leafHeight, LEAF_THICKNESS], [w / 2, 0, 0]));

  /* --- panelling ------------------------------------------------------------ */

  const railY = leafHeight * 0.42;
  const margin = STILE;
  const lowerTop = railY - 0.07;
  const upperBottom = railY + 0.07;

  for (const z of [-LEAF_THICKNESS / 2 - PROUD, LEAF_THICKNESS / 2 + PROUD]) {
    hinge.add(panelRing(trim, [w / 2, (margin + lowerTop) / 2], [w - margin * 2, lowerTop - margin], z));
    hinge.add(
      panelRing(
        trim,
        [w / 2, (upperBottom + leafHeight - margin) / 2],
        [w - margin * 2, leafHeight - margin - upperBottom],
        z,
      ),
    );
    // The mid rail, and a kick plate along the bottom where a boot lands.
    hinge.add(box(trim, [w, 0.05, PROUD * 2], [w / 2, railY - 0.025, z]));
    hinge.add(box(trim, [w - 0.05, 0.075, PROUD * 1.4], [w / 2, 0.028, z]));
  }

  /* --- hardware ------------------------------------------------------------- */

  for (const y of [0.3, leafHeight * 0.55, leafHeight - 0.28]) {
    const barrel = new THREE.Mesh(HINGE_BARREL, trim);
    barrel.position.set(0.004, y, -LEAF_THICKNESS / 2 - 0.012);
    hinge.add(barrel);
    hinge.add(box(trim, [0.075, 0.09, 0.012], [0.004, y - 0.045, -LEAF_THICKNESS / 2 - 0.018]));
  }

  const handle = new THREE.Object3D();
  handle.position.set(w - HANDLE_INSET, 1.03, 0);
  hinge.add(handle);

  for (const side of [-1, 1]) {
    const face = side * (LEAF_THICKNESS / 2);

    const rose = new THREE.Mesh(HANDLE_ROSE, trim);
    rose.rotation.x = Math.PI / 2;
    rose.position.z = face + side * 0.011;
    handle.add(rose);

    const neck = new THREE.Mesh(HANDLE_NECK, trim);
    neck.rotation.x = Math.PI / 2;
    neck.position.z = face + side * 0.05;
    handle.add(neck);

    // The lever points back toward the hinge, which is the way a hand takes it.
    const lever = new THREE.Mesh(HANDLE_LEVER, trim);
    lever.rotation.z = Math.PI / 2;
    lever.position.set(-0.062, -0.012, face + side * 0.078);
    handle.add(lever);

    hinge.add(box(trim, [0.062, 0.1, 0.014], [w - HANDLE_INSET, 0.86, face + side * 0.007]));

    const keyhole = new THREE.Mesh(KEYHOLE, leafMaterial);
    keyhole.rotation.x = Math.PI / 2;
    keyhole.position.set(w - HANDLE_INSET, 0.912, face + side * 0.02);
    hinge.add(keyhole);
  }

  return { hinge, handle };
}

/**
 * The locked signal. A group rather than one block, because logic toggles a
 * single `.visible` and what it turns on should look like a bolt thrown across
 * the door rather than like a sticker on it.
 */
function buildLockIndicator(ctx: ArtBuildContext, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const x = ctx.dims.doorWidth - HANDLE_INSET;

  for (const side of [-1, 1]) {
    const face = side * (LEAF_THICKNESS / 2 + 0.012);
    group.add(box(material, [0.18, 0.055, 0.022], [x - 0.06, 1.27, face]));
    const head = new THREE.Mesh(BOLT_HEAD, material);
    head.rotation.x = Math.PI / 2;
    head.position.set(x - 0.15, 1.2975, face + side * 0.012);
    group.add(head);
  }
  group.visible = false;
  return group;
}

export function buildDoor(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const leafMaterial = ctx.materials.get('door');
  const trim = ctx.materials.get('doorFrame');

  object.add(buildFrame(ctx, trim));
  const { hinge, handle } = buildLeaf(ctx, leafMaterial, trim);
  object.add(hinge);

  const lockIndicator = buildLockIndicator(ctx, ctx.materials.get('lockIndicator'));
  hinge.add(lockIndicator);

  return {
    object,
    colliders: [],
    parts: { hinge, handle, lockIndicator, frame: object },
  };
}

export function buildExitDoor(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const { doorWidth: w, doorHeight: h } = ctx.dims;
  const trim = ctx.materials.get('exitFrame');
  const glowMaterial = ctx.materials.get('exitGlow');

  object.add(buildFrame(ctx, trim));
  const { hinge, handle } = buildLeaf(ctx, ctx.materials.get('exitDoor'), trim);
  object.add(hinge);

  // A push bar across the leaf: the one piece of hardware that says "this one
  // opens outward, and you do not need a key for it".
  const bar = new THREE.Mesh(PUSH_BAR, trim);
  bar.rotation.z = Math.PI / 2;
  bar.scale.y = w - 0.26;
  bar.position.set(w / 2, 1.06, -LEAF_THICKNESS / 2 - 0.075);
  hinge.add(bar);
  for (const x of [0.22, w - 0.22]) {
    hinge.add(box(trim, [0.05, 0.045, 0.09], [x, 1.038, -LEAF_THICKNESS / 2 - 0.075]));
  }

  /**
   * The exit has to be read as the way out from across a dark room, so the
   * glow is a group: a wash over the whole opening and a lit sign above it.
   * Logic pulses the group, not a plane.
   */
  const glow = new THREE.Group();
  object.add(glow);

  const wash = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.5, h + 0.4), glowMaterial);
  wash.position.set(0, (h + 0.4) / 2, 0.14);
  glow.add(wash);

  // A lit sign box over the head of the frame, readable from both sides -
  // whichever way you come at the exit, it should already be the brightest
  // thing in the corridor.
  const signWidth = 0.52;
  object.add(box(trim, [signWidth + 0.06, 0.2, 0.12], [0, h + 0.09, -0.06]));
  for (const side of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(signWidth, 0.14), glowMaterial);
    face.position.set(0, h + 0.16, -0.06 + side * 0.062);
    // A plane faces +Z by default, so only the one on the -Z side turns round.
    if (side < 0) face.rotation.y = Math.PI;
    glow.add(face);
  }

  const lamp = new THREE.PointLight(0x6fe3a0, 14, 11, 2);
  lamp.position.set(0, h - 0.1, 0.6);
  object.add(lamp);

  const progressAnchor = new THREE.Object3D();
  progressAnchor.position.set(0, 1.4, 0.4);
  object.add(progressAnchor);

  return {
    object,
    colliders: [],
    parts: { hinge, handle, glow, progressAnchor, frame: object, lockIndicator: new THREE.Object3D() },
    lights: [lamp],
  };
}
