/**
 * `item.diamond` - the Ravenhollow Diamond, sitting in its claw setting.
 *
 * Contract (docs/art/SHARED_ART.md): fits the 0.35 x 0.35 x 0.4 m size class,
 * origin at the floor centre, no collider.
 *
 * The one item in the game worth a fortune, and the only one you will ever find
 * ONE of, so it is built to be spotted: a brilliant cut standing proud of a
 * brass claw, in a material that is faintly self-lit. Everything else in the
 * roster is a tool; this is the reason to have come down here.
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../../lib/contract';

const GIRDLE = 0.055;
const CROWN = 0.024;
const PAVILION = 0.062;
const SEAT = 0.036;

// A brilliant cut is a short frustum over a long cone: 8 facets each, which is
// enough to throw distinct highlights without becoming a sphere.
const crownGeometry = new THREE.CylinderGeometry(GIRDLE * 0.62, GIRDLE, CROWN, 8, 1);
const pavilionGeometry = new THREE.ConeGeometry(GIRDLE, PAVILION, 8, 1);
const girdleGeometry = new THREE.TorusGeometry(GIRDLE, 0.003, 5, 8);
const baseGeometry = new THREE.CylinderGeometry(0.055, 0.068, 0.014, 14, 1);
const clawGeometry = new THREE.CylinderGeometry(0.005, 0.008, 0.05, 6, 1);

export function buildDiamond(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const gem = ctx.materials.get('itemGem');
  const brass = ctx.materials.get('itemBrass');
  const cloth = ctx.materials.get('itemAccent');

  const base = new THREE.Mesh(baseGeometry, brass);
  base.position.y = 0.007;
  object.add(base);

  // A scrap of red velvet in the cup, so the stone is not sitting on bare metal.
  const pad = new THREE.Mesh(baseGeometry, cloth);
  pad.scale.set(0.8, 0.3, 0.8);
  pad.position.y = 0.016;
  object.add(pad);

  const claws = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3 + 0.4;
    const claw = new THREE.Mesh(clawGeometry, brass);
    claw.position.set(Math.cos(angle) * 0.046, 0.032, Math.sin(angle) * 0.046);
    claw.rotation.set(Math.sin(angle) * 0.3, 0, -Math.cos(angle) * 0.3);
    claws.add(claw);
  }
  object.add(claws);

  // The stone: pavilion down into the claws, table up where the light is.
  const stone = new THREE.Group();
  stone.position.y = SEAT + PAVILION / 2;

  const pavilion = new THREE.Mesh(pavilionGeometry, gem);
  pavilion.rotation.x = Math.PI;
  stone.add(pavilion);

  const crown = new THREE.Mesh(crownGeometry, gem);
  crown.position.y = PAVILION / 2 + CROWN / 2;
  stone.add(crown);

  const girdle = new THREE.Mesh(girdleGeometry, gem);
  girdle.rotation.x = Math.PI / 2;
  girdle.position.y = PAVILION / 2;
  stone.add(girdle);

  // A slow turn, so it catches a different facet every time you glance at it.
  // Idle motion belongs to the art (docs/art/SHARED_ART.md §2).
  const spin = ctx.rng() * Math.PI * 2;
  crown.onBeforeRender = (): void => {
    stone.rotation.y = spin + performance.now() / 4200;
  };
  object.add(stone);

  const gripAnchor = new THREE.Object3D();
  gripAnchor.position.set(0, SEAT + PAVILION / 2, 0);
  object.add(gripAnchor);

  const restAnchor = new THREE.Object3D();
  object.add(restAnchor);

  return { object, colliders: [], parts: { gripAnchor, restAnchor } };
}
