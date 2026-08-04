/**
 * `item.coinPile` - loose coins, spilled where somebody dropped them.
 *
 * Contract (docs/art/SHARED_ART.md): fits the 0.35 x 0.35 x 0.4 m size class,
 * origin at the floor centre, no collider.
 *
 * The scatter is drawn from `ctx.rng`, never `Math.random()`: every peer builds
 * the same pile, and the pile in the corner of the cellar looks the same to all
 * four players (docs/art/ROOM_FORMAT.md §4.1).
 */
import * as THREE from 'three';
import type { ArtBuildContext, BuiltArt } from '../../../lib/contract';
import { range } from '../../../lib/build';

const COIN_R = 0.026;
const COIN_H = 0.005;

const coinGeometry = new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_H, 14, 1);
const rimGeometry = new THREE.TorusGeometry(COIN_R - 0.003, 0.002, 5, 14);

export function buildCoinPile(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const gold = ctx.materials.get('itemGold');

  /** One coin, milled edge and all, lying at whatever angle it landed. */
  const coin = (x: number, y: number, z: number, tilt: number, spin: number): THREE.Group => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(coinGeometry, gold));
    const rim = new THREE.Mesh(rimGeometry, gold);
    rim.rotation.x = Math.PI / 2;
    group.add(rim);
    group.position.set(x, y + COIN_H / 2, z);
    group.rotation.set(tilt, spin, tilt * 0.6);
    return group;
  };

  // Two short stacks, because a heap of nothing but singles reads as gravel.
  for (const [sx, sz] of [[-0.03, 0.018], [0.036, -0.024]] as const) {
    const height = 3 + Math.floor(ctx.rng() * 3);
    for (let i = 0; i < height; i++) {
      object.add(coin(sx + range(ctx.rng, -0.004, 0.004), i * COIN_H, sz + range(ctx.rng, -0.004, 0.004), 0, ctx.rng() * Math.PI));
    }
  }

  // Then the spill around them.
  for (let i = 0; i < 11; i++) {
    const angle = ctx.rng() * Math.PI * 2;
    const radius = range(ctx.rng, 0.02, 0.115);
    object.add(
      coin(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
        range(ctx.rng, -0.22, 0.22),
        ctx.rng() * Math.PI,
      ),
    );
  }

  // One stood on its edge, leaning on the stack. Always the coin people look at.
  const leaner = coin(-0.006, 0.004, 0.03, Math.PI / 2 - 0.3, 0.4);
  object.add(leaner);

  const gripAnchor = new THREE.Object3D();
  gripAnchor.position.set(0, 0.02, 0);
  object.add(gripAnchor);

  const restAnchor = new THREE.Object3D();
  object.add(restAnchor);

  return { object, colliders: [], parts: { gripAnchor, restAnchor } };
}
