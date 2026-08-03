/**
 * `enemy.ghost` - the hunter.
 *
 * Contract (docs/art/SHARED_ART.md): capsule 0.84 m across, 1.95 m tall, origin
 * at the floor centre, facing -Z. Logic yaws `root` and calls `api.setAlert()`.
 *
 * Mostly floating, deliberately: minimal animation reads better than bad
 * animation, and the shroud hides the fact that there is none. The alert colour
 * is the player's primary warning - it must be readable across a dark room, so
 * it drives an emissive shroud AND a light the ghost carries with it.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../lib/contract';

const CALM_COLOUR = 0x39506b;

/** Alert level -> the colour the ghost burns. Calm is barely there. */
const ALERT_COLOURS: Record<string, number> = {
  calm: CALM_COLOUR,
  suspicious: 0xc9a227,
  alerted: 0xd06a24,
  chasing: 0xd2261f,
};

const ALERT_INTENSITY: Record<string, number> = {
  calm: 0.5,
  suspicious: 1.1,
  alerted: 1.8,
  chasing: 3.0,
};

export function buildGhost(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const root = new THREE.Group();
  object.add(root);

  // Hovering: everything hangs off a node lifted clear of the floor.
  const float = new THREE.Group();
  float.position.y = 0.25;
  root.add(float);

  const shroudMaterial = ctx.materials.get('ghostShroud').clone();
  const shroud = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.85, 6, 14), shroudMaterial);
  shroud.position.y = 1.0;
  float.add(shroud);

  // A ragged hem, so it does not read as a plain capsule from behind.
  const hemMaterial = ctx.materials.get('ghostShroud');
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    const length = 0.28 + ctx.rng() * 0.34;
    const rag = new THREE.Mesh(new THREE.ConeGeometry(0.1, length, 4), hemMaterial);
    rag.position.set(Math.sin(angle) * 0.34, 0.5 - length / 2, Math.cos(angle) * 0.34);
    rag.rotation.x = Math.PI;
    float.add(rag);
  }

  const alertMaterial = ctx.materials.get('ghostAlert').clone();
  const alertVisual = new THREE.Group();
  alertVisual.position.y = 1.62;
  float.add(alertVisual);

  // Two eyes and a halo: the eyes say where it is looking, the halo says how
  // much trouble you are in from any angle.
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), alertMaterial);
    eye.position.set(side * 0.12, 0, -0.33);
    alertVisual.add(eye);
  }

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 6, 20), alertMaterial);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.24;
  alertVisual.add(halo);

  const lamp = new THREE.PointLight(CALM_COLOUR, 2.5, 9, 2);
  lamp.position.y = 1.5;
  float.add(lamp);

  const eyeAnchor = new THREE.Object3D();
  eyeAnchor.position.set(0, 1.62, -0.35);
  float.add(eyeAnchor);

  let phase = ctx.rng() * Math.PI * 2;
  let alert = 'calm';

  const applyAlert = (level: string): void => {
    alert = level;
    const colour = ALERT_COLOURS[level] ?? CALM_COLOUR;
    const intensity = ALERT_INTENSITY[level] ?? 1;

    if (alertMaterial instanceof THREE.MeshStandardMaterial) {
      alertMaterial.color.setHex(colour);
      alertMaterial.emissive.setHex(colour);
      alertMaterial.emissiveIntensity = intensity;
    } else if ('color' in alertMaterial) {
      (alertMaterial as THREE.MeshBasicMaterial).color.setHex(colour);
    }
    if (shroudMaterial instanceof THREE.MeshStandardMaterial) {
      shroudMaterial.emissive.setHex(colour);
      shroudMaterial.emissiveIntensity = intensity * 0.12;
    }
    lamp.color.setHex(colour);
    lamp.intensity = 2 + intensity * 2.5;
  };

  applyAlert('calm');

  // Bob and drift, driven off the object's own clock: the enemy sim only ever
  // sets a position, a yaw and an alert level, so idle motion belongs here.
  // Hung on a MESH because Object3D.onBeforeRender only fires for drawn objects.
  const clock = new THREE.Clock();
  shroud.onBeforeRender = () => {
    phase += clock.getDelta() * (alert === 'chasing' ? 4.5 : 1.6);
    float.position.y = 0.25 + Math.sin(phase) * 0.07;
    halo.rotation.z = phase * 0.5;
  };

  return {
    object,
    colliders: [],
    parts: { root, alertVisual, eyeAnchor },
    api: { setAlert: applyAlert },
    dispose(): void {
      shroudMaterial.dispose();
      alertMaterial.dispose();
    },
  };
}
