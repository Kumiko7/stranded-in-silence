/**
 * Two of the things in the cabin that logic drives: the wardrobe and the
 * difficulty lever. The dart minigame's pieces are in `darts.ts`.
 *
 * Contracts are in docs/art/SHARED_ART.md. Each is a shared-art builder rather
 * than part of the cabin geometry, because logic has to find, tag and animate
 * them - the same reason doors and chests are not part of a room.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../lib/contract';
import { boxGeometry } from '../../lib/build';
import { MeshBatcher, poseMatrix } from '../../lib/merge';

/** `y` is the bottom face, as everywhere else in art. */
function at(size: readonly [number, number, number], position: readonly [number, number, number], rotationY = 0): THREE.Matrix4 {
  return poseMatrix([position[0], position[1] + size[1] / 2, position[2]], rotationY);
}

/* --- the wardrobe -------------------------------------------------------------- */

/**
 * `lobby.wardrobe` - 1.4 x 0.66 m footprint, 2.3 m tall, doors on -Z.
 *
 * A pine armoire standing open, with a full-length mirror in the left door. It
 * is open on purpose: a closed cupboard reads as scenery, an open one reads as
 * something you are meant to walk up to.
 *
 * | Part | Purpose |
 * | `doorLeft` / `doorRight` | The two leaves. Hung already open; nothing animates them. |
 * | `interactAnchor` | Where the prompt sits. |
 */
export function buildWardrobe(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const batch = new MeshBatcher();

  const carcass = ctx.materials.get('timber');
  const dark = ctx.materials.get('timberDark');
  const add = (
    material: THREE.Material,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    rotationY = 0,
  ): void => {
    batch.add(material, boxGeometry(size[0], size[1], size[2]), at(size, position, rotationY), { tile: 0.9 });
  };

  const width = 1.4;
  const depth = 0.66;
  const height = 2.3;

  // Carcass: back, two sides, top, bottom, and a plinth it stands on.
  add(carcass, [width, height, 0.05], [0, 0, depth / 2 - 0.025]);
  add(carcass, [0.05, height, depth], [-width / 2 + 0.025, 0, 0]);
  add(carcass, [0.05, height, depth], [width / 2 - 0.025, 0, 0]);
  add(dark, [width + 0.12, 0.1, depth + 0.12], [0, height, 0]);
  add(dark, [width + 0.08, 0.12, depth + 0.08], [0, 0, 0]);
  // Cornice detail, so the top does not read as a slab.
  add(dark, [width + 0.18, 0.05, depth + 0.18], [0, height + 0.1, 0]);

  // Rail and hanging clothes, because an empty wardrobe is a box.
  add(dark, [width - 0.14, 0.04, 0.04], [0, height - 0.35, 0]);
  const cloth = [ctx.materials.get('cushion'), ctx.materials.get('cushionGreen'), ctx.materials.get('canvas')];
  for (let i = 0; i < 5; i++) {
    const material = cloth[i % cloth.length];
    if (!material) continue;
    const w = 0.16 + ctx.rng() * 0.06;
    add(material, [w, 1.0 + ctx.rng() * 0.25, 0.16], [-0.5 + i * 0.25, height - 1.45, 0.06]);
  }

  // Two leaves, standing open at about 100 degrees.
  const doorLeft = new THREE.Group();
  doorLeft.position.set(-width / 2 + 0.03, 0, -depth / 2);
  doorLeft.rotation.y = -1.75;
  object.add(doorLeft);

  const doorRight = new THREE.Group();
  doorRight.position.set(width / 2 - 0.03, 0, -depth / 2);
  doorRight.rotation.y = 1.75;
  object.add(doorRight);

  // Leaves are their own objects (they are rotated), so they are not batched.
  const leaf = (parent: THREE.Group, mirrored: boolean): void => {
    const panel = new THREE.Mesh(boxGeometry(width / 2 - 0.05, height - 0.16, 0.05), carcass);
    panel.position.set((width / 2 - 0.05) / 2, (height - 0.16) / 2 + 0.1, 0);
    parent.add(panel);

    if (!mirrored) return;
    const glass = new THREE.Mesh(boxGeometry(width / 2 - 0.22, height - 0.6, 0.012), ctx.materials.get('mirror'));
    glass.position.set((width / 2 - 0.05) / 2, (height - 0.16) / 2 + 0.1, -0.032);
    parent.add(glass);
  };
  leaf(doorLeft, true);
  leaf(doorRight, false);

  const interactAnchor = new THREE.Object3D();
  interactAnchor.position.set(0, 1.5, -depth / 2 - 0.1);
  object.add(interactAnchor);

  const built = batch.build();
  object.add(built.object);

  return {
    object,
    colliders: [{ kind: 'box', center: [0, 0.05], halfExtents: [width / 2, depth / 2 + 0.06] }],
    parts: { doorLeft, doorRight, interactAnchor },
    dispose: built.dispose,
  };
}

/* --- the difficulty lever ------------------------------------------------------ */

/**
 * `lobby.lever` - 0.7 x 0.5 m footprint, 1.15 m tall, faces -Z.
 *
 * A cast-iron floor lever on a timber plinth, standing in the middle of the
 * room where nobody can miss it.
 *
 * | Part | Purpose |
 * | `handle` | Pivots along the lever's travel. Logic calls `api.setLever(t)`. |
 * | `interactAnchor` | Where the prompt sits. |
 */
export function buildLever(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const batch = new MeshBatcher();

  const timber = ctx.materials.get('timberPale');
  const iron = ctx.materials.get('iron');
  const brass = ctx.materials.get('brass');
  const add = (
    material: THREE.Material,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    rotationY = 0,
  ): void => {
    batch.add(material, boxGeometry(size[0], size[1], size[2]), at(size, position, rotationY), { tile: 0.5 });
  };

  // Plinth: a chamfered block, two courses so it does not read as one box.
  // Pale timber on purpose - a dark plinth in the middle of a lit floor reads
  // as a hole rather than as a thing you should walk up to.
  add(ctx.materials.get('timber'), [0.7, 0.12, 0.5], [0, 0, 0]);
  add(timber, [0.6, 0.42, 0.42], [0, 0.12, 0]);
  add(iron, [0.64, 0.05, 0.46], [0, 0.54, 0]);

  // The quadrant plate the handle sweeps across, with notches for each setting.
  add(brass, [0.05, 0.42, 0.3], [0.14, 0.59, 0]);
  for (let i = 0; i < 4; i++) {
    add(brass, [0.09, 0.03, 0.04], [0.12, 0.66 + i * 0.1, -0.1 + i * 0.055]);
  }

  const handle = new THREE.Group();
  handle.position.set(0, 0.62, 0);
  object.add(handle);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.52, 8), iron);
  shaft.position.y = 0.26;
  handle.add(shaft);
  const grip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), ctx.materials.get('copper'));
  grip.position.y = 0.53;
  handle.add(grip);

  const interactAnchor = new THREE.Object3D();
  interactAnchor.position.set(0, 1.0, -0.3);
  object.add(interactAnchor);

  const built = batch.build();
  object.add(built.object);

  // Travel is a 60 degree sweep about X, which reads clearly from every angle.
  const setLever = (t: number): void => {
    handle.rotation.x = (t - 0.5) * (Math.PI / 3);
  };
  setLever(0);

  return {
    object,
    colliders: [{ kind: 'circle', center: [0, 0], radius: 0.42 }],
    parts: { handle, interactAnchor },
    api: { setLever },
    dispose(): void {
      built.dispose();
      shaft.geometry.dispose();
      grip.geometry.dispose();
    },
  };
}
