/**
 * `vfx.flashBurst` - what a flare charge leaves in the room for a second after
 * it goes off.
 *
 * The white-out on the player's own screen is the feedback layer's job
 * (`src/render/feedback.ts`); this is the part everybody ELSE sees, including
 * the player who threw it from behind cover. Built at unit radius; logic scales
 * it to `items.json -> items.flashbang.params.radius` and drives
 * `api.setProgress(t)` from 0 to 1 across the burst.
 *
 * The material is **cloned**, because this fades its own copy out and a shared
 * one would dim every other flare in the run with it.
 */
import * as THREE from 'three';
import type { ArtApi, ArtBuildContext, BuiltArt } from '../../lib/contract';

const coreGeometry = new THREE.SphereGeometry(1, 16, 12);
const ringGeometry = new THREE.RingGeometry(0.86, 1, 40);

export function buildFlashBurst(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();

  const base = ctx.materials.get('vfx.flash');
  const material = base.clone();
  const core = new THREE.Mesh(coreGeometry, material);
  core.renderOrder = 15;
  object.add(core);

  // A shock ring across the floor: it is how you read the RADIUS of the thing,
  // which is the only part of it that matters tactically.
  const ring = new THREE.Mesh(ringGeometry, material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.renderOrder = 15;
  object.add(ring);

  const opacity = material.opacity;

  const api: ArtApi = {
    setProgress(t: number): void {
      // The core is a fireball, not the blast radius: at a nine-metre radius it
      // still only grows to about a metre across, because a white sphere the
      // size of the room reads as a bug rather than as a flare. What the RADIUS
      // is, is the ring's job - and the ring is the part that matters, because
      // it is the part that tells you who was caught.
      const eased = 1 - (1 - t) * (1 - t);
      core.scale.setScalar(0.03 + eased * 0.14);
      ring.scale.setScalar(0.06 + eased * 0.98);
      material.opacity = opacity * Math.max(0, 1 - t) ** 1.6;
    },
  };
  api.setProgress?.(0);

  return {
    object,
    colliders: [],
    parts: { core, ring },
    api,
    dispose(): void {
      material.dispose();
    },
  };
}
