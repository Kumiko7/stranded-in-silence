/**
 * `player.masked` - the player body: teammates in a run, the four figures on
 * the scoreboard, and the one standing in front of the lobby wardrobe.
 *
 * Contract (docs/art/SHARED_ART.md): 0.64 m across, 1.8 m tall, origin at the
 * floor centre, facing -Z. Logic yaws `root`, pitches `head`, tints the body
 * through `api.setColour()` and parents a hat to `hatAnchor`.
 *
 * It is a suit, not a person. The silhouette that has to survive a dark
 * corridor is a rounded coloured body on two short legs with one bright visor
 * saying which way it is looking - so everything below adds surface to that
 * shape rather than arguing with it.
 *
 * Two material names carry the whole body. `playerBody` is cloned three times
 * and re-tinted from the wardrobe colour every time `setColour` runs - the suit
 * itself, a darker shade for boots, gloves, pack and webbing, and a near-black
 * one for the visor - while `playerMask` stays exactly the pale the pack asked
 * for and does the trim. That is why a hundred wardrobe colours cost a pack
 * nothing: it states two colours and gets a whole body out of them.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../lib/contract';
import { suitWear, suitWeave } from './textures';

/**
 * Contract sizes. Everything below is measured off these - and `HEAD_R` is also
 * where the hat anchor sits, so the whole hat roster is authored against it
 * (`art/shared/characters/hats.ts` -> `HEAD`). Moving it moves sixteen hats.
 */
const HEAD_Y = 1.6;
const HEAD_R = 0.19;
/** Half the contract width, less the arms, so nothing pokes outside 0.64 m. */
const ARM_X = 0.252;

type Standard = THREE.MeshStandardMaterial;

/** A capsule standing on its own centre, positioned by that centre. */
function capsule(
  material: THREE.Material,
  radius: number,
  length: number,
  position: readonly [number, number, number],
  keep: THREE.BufferGeometry[],
): THREE.Mesh {
  const geometry = new THREE.CapsuleGeometry(radius, length, 6, 16);
  keep.push(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  return mesh;
}

/** A squashed sphere - pads, joints, boot caps, anything soft. */
function blob(
  material: THREE.Material,
  radius: number,
  scale: readonly [number, number, number],
  position: readonly [number, number, number],
  keep: THREE.BufferGeometry[],
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 16, 12);
  keep.push(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.position.set(position[0], position[1], position[2]);
  return mesh;
}

/**
 * The torso, as a profile spun around Y: narrow at the hips, widest across the
 * chest, tucked in again at the collar. A lathe rather than a capsule because
 * the capsule is what made the old body read as a pill with legs.
 */
function torsoProfile(): THREE.Vector2[] {
  return [
    [0.0, 0.6],
    [0.15, 0.605],
    [0.208, 0.66],
    [0.238, 0.78],
    [0.25, 0.95],
    [0.246, 1.1],
    [0.224, 1.22],
    [0.185, 1.34],
    [0.13, 1.42],
    [0.075, 1.46],
    [0.0, 1.47],
  ].map(([r, y]) => new THREE.Vector2(r ?? 0, y ?? 0));
}

/**
 * A patch of a sphere's surface, centred on -Z. Used for the visor and the
 * paler rim that shows around it - the rim is a WIDER window at a smaller
 * radius, so it peeks out all the way round without anyone modelling a ring.
 */
function faceShell(
  material: THREE.Material,
  radius: number,
  spread: number,
  rise: number,
  keep: THREE.BufferGeometry[],
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(
    radius,
    24,
    16,
    -Math.PI / 2 - spread,
    spread * 2,
    Math.PI / 2 - rise,
    rise * 1.75,
  );
  keep.push(geometry);
  return new THREE.Mesh(geometry, material);
}

export function buildPlayer(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const root = new THREE.Group();
  object.add(root);

  const geometries: THREE.BufferGeometry[] = [];

  /**
   * Everything is cloned - never shared - because `setColour` tints ONE player
   * and a shared material would repaint the whole team at once. The weave and
   * wear maps are only attached where the pack has not already put one, so a
   * pack that themes the suit still wins the argument about how it looks.
   */
  const base = ctx.materials.get('playerBody') as Standard;
  const suit = base.clone();
  const dark = base.clone();
  const visorGlass = base.clone();
  const trim = (ctx.materials.get('playerMask') as Standard).clone();
  const cloned = [suit, dark, trim, visorGlass];

  for (const material of [suit, dark, trim]) {
    if (!material.normalMap) {
      material.normalMap = suitWeave();
      material.normalScale = new THREE.Vector2(0.28, 0.28);
    }
    if (!material.roughnessMap) material.roughnessMap = suitWear();
  }
  suit.roughness = 0.82;
  dark.roughness = 0.66;
  dark.metalness = 0.12;
  trim.roughness = 0.5;
  trim.metalness = 0.2;
  // The visor is the one part of a player that must read across a dark room, so
  // it is glossy and never gets the cloth maps. The glow is deliberately weak:
  // the first pass lit it at 0.55 and the glass came out brighter than the suit,
  // which turned a dark faceplate into a pale slab. Glass reads by its
  // HIGHLIGHT, not by its brightness.
  visorGlass.roughness = 0.06;
  visorGlass.metalness = 0.55;
  visorGlass.normalMap = null;
  visorGlass.roughnessMap = null;
  visorGlass.emissiveIntensity = 0.16;

  /* --- legs ---------------------------------------------------------------- */

  for (const side of [-1, 1]) {
    root.add(capsule(suit, 0.086, 0.4, [side * 0.108, 0.4, 0], geometries));
    // Knee pad and boot in the dark shade: the two places a suit takes a beating.
    root.add(blob(dark, 0.075, [1, 0.8, 0.85], [side * 0.108, 0.36, -0.045], geometries));
    root.add(blob(dark, 0.115, [0.72, 0.62, 1.15], [side * 0.108, 0.075, -0.022], geometries));
    root.add(capsule(dark, 0.052, 0.06, [side * 0.108, 0.16, 0], geometries));
  }

  /* --- torso --------------------------------------------------------------- */

  const torsoGeometry = new THREE.LatheGeometry(torsoProfile(), 26);
  geometries.push(torsoGeometry);
  const torso = new THREE.Mesh(torsoGeometry, suit);
  root.add(torso);

  // Hips, so the legs meet something rather than emerging from a curve.
  root.add(blob(dark, 0.2, [1.12, 0.36, 0.92], [0, 0.63, 0], geometries));

  // Webbing: two straps over the shoulders into a belt. Thin boxes, but they
  // are what stop the chest reading as one undivided lump of colour.
  const belt = new THREE.TorusGeometry(0.229, 0.026, 8, 24);
  geometries.push(belt);
  const beltMesh = new THREE.Mesh(belt, dark);
  beltMesh.rotation.x = Math.PI / 2;
  beltMesh.position.y = 0.83;
  beltMesh.scale.z = 0.9;
  root.add(beltMesh);

  for (const side of [-1, 1]) {
    const strap = new THREE.BoxGeometry(0.052, 0.56, 0.03);
    geometries.push(strap);
    const mesh = new THREE.Mesh(strap, dark);
    mesh.position.set(side * 0.1, 1.09, -0.215);
    mesh.rotation.set(-0.12, 0, side * 0.14);
    root.add(mesh);
  }

  // One pale chest plate, and shoulder pads in the dark shade. The pads were
  // pale in the first pass and fought the visor for the eye, which a face has
  // to win: on a body with no expression, the visor IS the expression.
  const plate = new THREE.BoxGeometry(0.15, 0.052, 0.026);
  geometries.push(plate);
  const plateMesh = new THREE.Mesh(plate, trim);
  plateMesh.position.set(0, 1.21, -0.216);
  root.add(plateMesh);

  for (const side of [-1, 1]) {
    root.add(blob(dark, 0.092, [1, 0.42, 0.95], [side * 0.185, 1.29, -0.03], geometries));
  }

  /* --- the pack ------------------------------------------------------------ */

  const packBody = new THREE.BoxGeometry(0.27, 0.4, 0.15);
  geometries.push(packBody);
  const pack = new THREE.Mesh(packBody, dark);
  pack.position.set(0, 1.05, 0.235);
  root.add(pack);

  // Two slim pipes, not two slabs: at the first pass's radius the pale trim
  // took over the whole back, which is the one view a teammate ahead of you has.
  for (const side of [-1, 1]) {
    const tank = new THREE.CylinderGeometry(0.031, 0.031, 0.25, 12);
    geometries.push(tank);
    const mesh = new THREE.Mesh(tank, trim);
    mesh.position.set(side * 0.088, 1.06, 0.325);
    root.add(mesh);
  }

  // A hose from the pack to the collar. One curve, and it does more for "this
  // is equipment" than another six boxes would.
  const hose = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.1, 1.25, 0.3),
      new THREE.Vector3(0.16, 1.36, 0.2),
      new THREE.Vector3(0.13, 1.44, 0.06),
      new THREE.Vector3(0.05, 1.45, -0.02),
    ]),
    16,
    0.019,
    8,
    false,
  );
  geometries.push(hose);
  root.add(new THREE.Mesh(hose, dark));

  /* --- arms ---------------------------------------------------------------- */

  for (const side of [-1, 1]) {
    root.add(blob(suit, 0.082, [1, 1, 1], [side * (ARM_X - 0.025), 1.26, -0.01], geometries));
    root.add(capsule(suit, 0.057, 0.26, [side * ARM_X, 1.02, -0.012], geometries));
    root.add(blob(dark, 0.072, [0.9, 1.05, 1], [side * ARM_X, 0.86, -0.02], geometries));
  }

  /* --- head ---------------------------------------------------------------- */

  const head = new THREE.Group();
  head.position.y = HEAD_Y;
  root.add(head);

  const skull = new THREE.SphereGeometry(HEAD_R, 24, 18);
  geometries.push(skull);
  const helmet = new THREE.Mesh(skull, suit);
  helmet.scale.set(1, 1.04, 1.02);
  head.add(helmet);

  // Collar seal, so the helmet sits ON the suit instead of floating over it.
  const collar = new THREE.TorusGeometry(0.115, 0.032, 8, 20);
  geometries.push(collar);
  const collarMesh = new THREE.Mesh(collar, dark);
  collarMesh.rotation.x = Math.PI / 2;
  collarMesh.position.y = -0.155;
  head.add(collarMesh);

  // The rim is only three degrees wider than the visor at a smaller radius, so
  // it reads as a bezel round the glass. Anything more and the pale material
  // wins the face outright, which is what the first pass did.
  head.add(faceShell(trim, HEAD_R + 0.006, 0.86, 0.6, geometries));
  head.add(faceShell(visorGlass, HEAD_R + 0.014, 0.81, 0.57, geometries));

  // Ear cans. Small, off to the sides, and deliberately clear of the crown, so
  // a hat never has to fight them for the same space.
  for (const side of [-1, 1]) {
    const can = new THREE.CylinderGeometry(0.045, 0.05, 0.04, 12);
    geometries.push(can);
    const mesh = new THREE.Mesh(can, dark);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(side * 0.182, -0.01, 0.02);
    head.add(mesh);
  }

  /**
   * Where a cosmetic hat is parented (docs/art/SHARED_ART.md). It sits on the
   * crown and rides the head, so a hat pitches with the look like the head it
   * is on rather than hovering level while its owner stares at the floor.
   */
  const hatAnchor = new THREE.Object3D();
  hatAnchor.position.set(0, HEAD_R, 0);
  head.add(hatAnchor);

  /* --- sockets and anchors -------------------------------------------------- */

  const handLeft = new THREE.Object3D();
  handLeft.position.set(-ARM_X - 0.02, 0.84, -0.09);
  root.add(handLeft);

  const handRight = new THREE.Object3D();
  handRight.position.set(ARM_X + 0.02, 0.84, -0.09);
  root.add(handRight);

  const nameAnchor = new THREE.Object3D();
  nameAnchor.position.set(0, 2.1, 0);
  root.add(nameAnchor);

  /* --- tinting -------------------------------------------------------------- */

  const scratch = new THREE.Color();

  /**
   * One wardrobe colour, four shades of it. The dark and light shades are
   * mixed toward black and white rather than being separate config entries,
   * because a suit whose webbing does not follow its own colour reads as two
   * objects that happen to be touching.
   */
  const applyColour = (hex: string): void => {
    suit.color.set(hex);
    dark.color.copy(scratch.set(hex)).lerp(BLACK, 0.62);
    visorGlass.color.copy(scratch.set(hex)).lerp(BLACK, 0.86);
    visorGlass.emissive.copy(scratch.set(hex)).lerp(BLACK, 0.4);
  };

  applyColour(DEFAULT_COLOUR);

  return {
    object,
    colliders: [],
    parts: { root, head, handLeft, handRight, nameAnchor, hatAnchor },
    api: { setColour: applyColour },
    dispose(): void {
      for (const material of cloned) material.dispose();
      for (const geometry of geometries) geometry.dispose();
    },
  };
}

const BLACK = new THREE.Color(0x000000);
const WHITE = new THREE.Color(0xffffff);

/** Only ever seen for the frame before logic calls `setColour`. */
const DEFAULT_COLOUR = '#6f7690';
