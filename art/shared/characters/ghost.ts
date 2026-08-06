/**
 * `enemy.ghost` - the hunter.
 *
 * Contract (docs/art/SHARED_ART.md): capsule 0.84 m across, 1.95 m tall, origin
 * at the floor centre, facing -Z. Logic yaws `root` and calls `api.setAlert()`.
 *
 * It floats, deliberately: minimal animation reads better than bad animation,
 * and a robe with a torn hem hides the fact that there is none. Everything it
 * is made of is a surface of revolution or a strip built off one - a robe, a
 * cowl with nothing inside it, and a skirt whose bottom edge is torn - so the
 * silhouette holds up from every angle without a single hand-placed box.
 *
 * The alert colour is the player's primary warning and must be readable across
 * a dark room, so it drives four things at once: the eyes, a halo, a core
 * burning through the cloth, and a light the ghost carries with it.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../lib/contract';
import { shroudFolds } from './textures';

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

/** How high off the floor everything hangs. The bob is added to this. */
const HOVER = 0.22;

/**
 * The robe, as a profile spun around Y. Radius never exceeds the 0.42 m
 * contract - and it has a WAIST, which the first pass did not: a taper that
 * only ever narrows, spun around an axis, is a bottle, and no amount of shroud
 * on top of one reads as a figure.
 */
const ROBE: readonly (readonly [number, number])[] = [
  [0.26, 0.1],
  [0.355, 0.26],
  [0.4, 0.44],
  [0.395, 0.62],
  [0.35, 0.8],
  [0.338, 0.92],
  [0.372, 1.06],
  [0.362, 1.16],
  [0.3, 1.26],
  [0.235, 1.34],
];

/**
 * A torn hem: a ring of TAPERED TRIANGLES, each dropping from the cloth's edge
 * to a single point at a different depth.
 *
 * The first pass made it a band of quads with a wobbly bottom edge, and a band
 * is exactly what it looked like - a hoop of cloth round the bottom of a
 * bottle. What makes a hem read as torn is the GAPS between the tatters, and
 * only a shape that comes to a point can have any.
 */
function tornHem(
  rng: () => number,
  segments: number,
  topY: number,
  topR: number,
  spread: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];

  const p = (angle: number, radius: number, y: number): number[] => [
    Math.sin(angle) * radius,
    y,
    Math.cos(angle) * radius,
  ];

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    // Wide variance on purpose: rags that are all one length are a scallop, and
    // a scallop reads as decoration rather than as damage.
    const length = 0.12 + rng() * spread;
    const tip = (a0 + a1) / 2 + (rng() - 0.5) * 0.12;

    positions.push(...p(a0, topR, topY), ...p(a1, topR, topY), ...p(tip, topR * 1.04, topY - length));
    const u0 = i / segments;
    uvs.push(u0, 1, u0 + 1 / segments, 1, u0 + 0.5 / segments, 0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

export function buildGhost(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const root = new THREE.Group();
  object.add(root);

  const geometries: THREE.BufferGeometry[] = [];

  // Hovering: everything hangs off a node lifted clear of the floor.
  const float = new THREE.Group();
  float.position.y = HOVER;
  root.add(float);

  /* --- materials ------------------------------------------------------------ */

  const shroudMaterial = ctx.materials.get('ghostShroud').clone();
  shroudMaterial.side = THREE.DoubleSide;
  // A pack is free to hand back something that is not a standard material; the
  // shroud still has to build, it just stops taking a normal map and a glow.
  const shroudPbr = shroudMaterial instanceof THREE.MeshStandardMaterial ? shroudMaterial : null;
  if (shroudPbr && !shroudPbr.normalMap) {
    shroudPbr.normalMap = shroudFolds();
    shroudPbr.normalScale = new THREE.Vector2(0.9, 0.9);
  }

  // The inside of the hood. Opaque and nearly black, so the cowl reads as
  // having nothing in it rather than as a translucent bag.
  const voidMaterial = shroudMaterial.clone();
  voidMaterial.transparent = false;
  voidMaterial.opacity = 1;
  if (voidMaterial instanceof THREE.MeshStandardMaterial) {
    voidMaterial.color.multiplyScalar(0.22);
    voidMaterial.normalMap = null;
  }

  const alertMaterial = ctx.materials.get('ghostAlert').clone();
  const cloned = [shroudMaterial, voidMaterial, alertMaterial];

  /* --- the robe -------------------------------------------------------------- */

  const robeGeometry = new THREE.LatheGeometry(
    ROBE.map(([r, y]) => new THREE.Vector2(r, y)),
    28,
  );
  geometries.push(robeGeometry);
  const robe = new THREE.Mesh(robeGeometry, shroudMaterial);
  float.add(robe);

  // Two layers at different heights, so the hem has depth when the ghost turns
  // rather than being one paper edge.
  const hem = tornHem(ctx.rng, 22, 0.3, 0.365, 0.5);
  geometries.push(hem);
  float.add(new THREE.Mesh(hem, shroudMaterial));

  const innerHem = tornHem(ctx.rng, 16, 0.46, 0.33, 0.42);
  geometries.push(innerHem);
  const inner = new THREE.Mesh(innerHem, shroudMaterial);
  float.add(inner);

  /**
   * Empty sleeves. They are the single biggest thing between "a robed figure"
   * and "a bottle": a body with no arms at all reads as an object, and a body
   * whose arms end in nothing reads as a ghost.
   */
  for (const side of [-1, 1]) {
    const sleeve = new THREE.CylinderGeometry(0.108, 0.078, 0.6, 12, 1, true);
    geometries.push(sleeve);
    const mesh = new THREE.Mesh(sleeve, shroudMaterial);
    mesh.position.set(side * 0.285, 0.86, -0.03);
    // Angled out rather than hanging straight, so a sleeve clears the robe's
    // own widest point and shows against the gap instead of inside it.
    mesh.rotation.z = side * 0.16;
    float.add(mesh);

    const cuff = new THREE.TorusGeometry(0.079, 0.022, 6, 14);
    geometries.push(cuff);
    const cuffMesh = new THREE.Mesh(cuff, shroudMaterial);
    cuffMesh.rotation.x = Math.PI / 2;
    cuffMesh.position.set(side * 0.333, 0.565, -0.03);
    float.add(cuffMesh);

    // Threads hanging out of the cuff, so the sleeve is visibly empty.
    const frayed = tornHem(ctx.rng, 9, 0.565, 0.076, 0.22);
    geometries.push(frayed);
    const frayedMesh = new THREE.Mesh(frayed, shroudMaterial);
    frayedMesh.position.set(side * 0.333, 0, -0.03);
    float.add(frayedMesh);
  }

  /* --- the cowl -------------------------------------------------------------- */

  const hood = new THREE.Group();
  hood.position.y = 1.38;
  float.add(hood);

  // A sphere with a bite taken out of the front: the opening faces -Z, which is
  // the direction the whole contract is built around.
  const cowlGeometry = new THREE.SphereGeometry(0.27, 22, 16, -Math.PI / 2 + 0.66, Math.PI * 2 - 1.32);
  geometries.push(cowlGeometry);
  const cowl = new THREE.Mesh(cowlGeometry, shroudMaterial);
  cowl.scale.set(1, 1.12, 1.05);
  hood.add(cowl);

  // The peak, drooping forward. A hood that stands straight up looks like a bag.
  const peakGeometry = new THREE.ConeGeometry(0.15, 0.3, 14, 1, true);
  geometries.push(peakGeometry);
  const peak = new THREE.Mesh(peakGeometry, shroudMaterial);
  peak.position.set(0, 0.2, 0.03);
  peak.rotation.x = 0.28;
  hood.add(peak);

  const hollowGeometry = new THREE.SphereGeometry(0.228, 16, 12);
  geometries.push(hollowGeometry);
  const hollow = new THREE.Mesh(hollowGeometry, voidMaterial);
  hollow.scale.set(0.95, 1.05, 0.9);
  hood.add(hollow);

  // Shoulders, so the robe has somewhere to hang from.
  const collarGeometry = new THREE.TorusGeometry(0.29, 0.07, 8, 26);
  geometries.push(collarGeometry);
  const collar = new THREE.Mesh(collarGeometry, shroudMaterial);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.19;
  collar.scale.set(1, 1, 0.62);
  float.add(collar);

  /* --- what the alert level drives ------------------------------------------- */

  const alertVisual = new THREE.Group();
  alertVisual.position.y = 1.38;
  float.add(alertVisual);

  // Two slits rather than two dots: a dot reads as a bead, a slit reads as a
  // look. They sit inside the hood, so the cowl frames them from the front.
  for (const side of [-1, 1]) {
    const eyeGeometry = new THREE.SphereGeometry(0.058, 12, 8);
    geometries.push(eyeGeometry);
    const eye = new THREE.Mesh(eyeGeometry, alertMaterial);
    eye.scale.set(1.6, 0.66, 0.5);
    eye.position.set(side * 0.085, -0.01, -0.2);
    eye.rotation.z = side * 0.22;
    alertVisual.add(eye);
  }

  // The halo says how much trouble you are in from behind, where the eyes say
  // nothing at all.
  const haloGeometry = new THREE.TorusGeometry(0.34, 0.028, 8, 28);
  geometries.push(haloGeometry);
  const halo = new THREE.Mesh(haloGeometry, alertMaterial);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.3;
  alertVisual.add(halo);

  // Motes riding the halo. They are what makes `chasing` read as agitation
  // rather than as the same shape in a different colour.
  const motes = new THREE.Group();
  motes.position.y = 0.3;
  alertVisual.add(motes);
  for (let i = 0; i < 6; i++) {
    const moteGeometry = new THREE.SphereGeometry(0.022 + ctx.rng() * 0.014, 8, 6);
    geometries.push(moteGeometry);
    const mote = new THREE.Mesh(moteGeometry, alertMaterial);
    const angle = (i / 6) * Math.PI * 2;
    const radius = 0.3 + ctx.rng() * 0.14;
    mote.position.set(Math.sin(angle) * radius, (ctx.rng() - 0.5) * 0.24, Math.cos(angle) * radius);
    motes.add(mote);
  }

  // A core burning inside the robe. Seen THROUGH the cloth, which is the whole
  // reason the shroud is translucent.
  const coreGeometry = new THREE.SphereGeometry(0.13, 14, 10);
  geometries.push(coreGeometry);
  const core = new THREE.Mesh(coreGeometry, alertMaterial);
  core.position.y = 0.9;
  core.scale.set(1, 1.35, 1);
  float.add(core);

  const lamp = new THREE.PointLight(CALM_COLOUR, 2.5, 9, 2);
  lamp.position.y = 1.36;
  float.add(lamp);

  const eyeAnchor = new THREE.Object3D();
  eyeAnchor.position.set(0, 1.38, -0.3);
  float.add(eyeAnchor);

  /* --- alert ----------------------------------------------------------------- */

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
    if (shroudPbr) {
      shroudPbr.emissive.setHex(colour);
      shroudPbr.emissiveIntensity = intensity * 0.12;
    }
    lamp.color.setHex(colour);
    lamp.intensity = 2 + intensity * 2.5;
  };

  applyAlert('calm');

  // Bob, drift and spin, driven off the object's own clock: the enemy sim only
  // ever sets a position, a yaw and an alert level, so idle motion belongs here.
  // Hung on a MESH because Object3D.onBeforeRender only fires for drawn objects.
  const clock = new THREE.Clock();
  robe.onBeforeRender = () => {
    const chasing = alert === 'chasing';
    phase += clock.getDelta() * (chasing ? 4.5 : 1.6);
    float.position.y = HOVER + Math.sin(phase) * 0.07;
    halo.rotation.z = phase * 0.5;
    motes.rotation.y = -phase * (chasing ? 1.1 : 0.4);
    // The robe swings a little as it drifts, which is all the animation a thing
    // with no legs needs.
    robe.rotation.z = Math.sin(phase * 0.6) * 0.035;
    inner.rotation.y = phase * 0.18;
    core.scale.y = 1.35 + Math.sin(phase * 1.7) * (chasing ? 0.22 : 0.08);
  };

  return {
    object,
    colliders: [],
    parts: { root, alertVisual, eyeAnchor },
    api: { setAlert: applyAlert },
    dispose(): void {
      for (const material of cloned) material.dispose();
      for (const geometry of geometries) geometry.dispose();
    },
  };
}
