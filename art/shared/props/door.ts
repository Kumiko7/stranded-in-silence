/**
 * `door.standard` and `door.exit`.
 *
 * Contract (docs/art/SHARED_ART.md): origin at the floor centre of the opening,
 * facing -Z, leaf parented to `hinge` so logic can swing it by rotating one node.
 * Build it CLOSED - logic owns the open angle.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../lib/contract';
import { box } from '../../lib/build';

const LEAF_THICKNESS = 0.08;
const FRAME_WIDTH = 0.09;

function buildFrame(ctx: ArtBuildContext, material: THREE.Material): THREE.Group {
  const { doorWidth: w, doorHeight: h } = ctx.dims;
  const frame = new THREE.Group();
  const jamb: [number, number, number] = [FRAME_WIDTH, h, FRAME_WIDTH * 1.6];
  frame.add(box(material, jamb, [-w / 2 - FRAME_WIDTH / 2, 0, 0]));
  frame.add(box(material, jamb, [w / 2 + FRAME_WIDTH / 2, 0, 0]));
  frame.add(box(material, [w + FRAME_WIDTH * 2, FRAME_WIDTH, FRAME_WIDTH * 1.6], [0, h, 0]));
  return frame;
}

/** Hinged on the -X edge; logic rotates `hinge.rotation.y`. */
function buildLeaf(ctx: ArtBuildContext, material: THREE.Material): { hinge: THREE.Group; handle: THREE.Object3D } {
  const { doorWidth: w, doorHeight: h } = ctx.dims;

  const hinge = new THREE.Group();
  hinge.position.set(-w / 2, 0, 0);

  // Leaf is a child offset by half its width, so the hinge sits on its edge.
  const leaf = box(material, [w, h - 0.04, LEAF_THICKNESS], [w / 2, 0, 0]);
  hinge.add(leaf);

  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    material,
  );
  handle.position.set(w - 0.16, 1.05, LEAF_THICKNESS);
  hinge.add(handle);

  return { hinge, handle };
}

export function buildDoor(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const wood = ctx.materials.get('door');

  object.add(buildFrame(ctx, ctx.materials.get('doorFrame')));
  const { hinge, handle } = buildLeaf(ctx, wood);
  object.add(hinge);

  const lockIndicator = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.07, 0.03),
    ctx.materials.get('lockIndicator'),
  );
  lockIndicator.position.set(ctx.dims.doorWidth / 2 - 0.16, 1.25, LEAF_THICKNESS);
  lockIndicator.visible = false;
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

  object.add(buildFrame(ctx, ctx.materials.get('exitFrame')));
  const { hinge, handle } = buildLeaf(ctx, ctx.materials.get('exitDoor'));
  object.add(hinge);

  // The exit must read as the way out from across a dark room.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 0.5, h + 0.4),
    ctx.materials.get('exitGlow'),
  );
  glow.position.set(0, (h + 0.4) / 2, 0.14);
  object.add(glow);

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
