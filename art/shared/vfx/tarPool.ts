/**
 * `vfx.tarPool` - the slick a thrown flask leaves on the floor.
 *
 * Built at UNIT radius. Logic scales the object to the radius from
 * `items.json`, and drives `api.setProgress(t)` from 0 to 1 while it spreads, so
 * a bigger flask is a config change and never an art change.
 *
 * Flat on the floor by design: collision in this game is a 2D floor-plane test
 * (docs/ARCHITECTURE.md §10), so anything that slows you down has to BE the
 * floor, and has to look like it from standing height.
 */
import * as THREE from 'three';
import type { ArtApi, ArtBuildContext, BuiltArt } from '../../lib/contract';
import { range } from '../../lib/build';

const discGeometry = new THREE.CircleGeometry(1, 40);
const bubbleGeometry = new THREE.SphereGeometry(1, 8, 6);

export function buildTarPool(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const tar = ctx.materials.get('vfx.tar');

  // Everything that spreads hangs off this; logic drives its scale.
  const spread = new THREE.Group();
  object.add(spread);

  /** One flattened disc of tar, lying just clear of the floorboards. */
  const blob = (x: number, z: number, radius: number, y: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(discGeometry, tar);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(radius, radius, 1);
    mesh.position.set(x, y, z);
    return mesh;
  };

  // A raised rim, a shade lighter than the body. Without it a black disc on a
  // dark floor reads as a hole in the boards rather than as something spilt.
  const rim = ctx.materials.get('vfx.tarRim');
  const edge = new THREE.Mesh(discGeometry, rim);
  edge.rotation.x = -Math.PI / 2;
  edge.scale.set(0.9, 0.9, 1);
  edge.position.y = 0.01;
  spread.add(edge);

  // A main body plus lobes, so the edge is ragged rather than a drawn circle.
  spread.add(blob(0, 0, 0.82, 0.014));
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + range(ctx.rng, -0.3, 0.3);
    const distance = range(ctx.rng, 0.3, 0.55);
    spread.add(blob(Math.cos(angle) * distance, Math.sin(angle) * distance, range(ctx.rng, 0.3, 0.48), 0.013));
  }

  // Thrown spatter, further out and much smaller. This is what sells "flask".
  for (let i = 0; i < 6; i++) {
    const angle = ctx.rng() * Math.PI * 2;
    const distance = range(ctx.rng, 0.7, 0.98);
    spread.add(blob(Math.cos(angle) * distance, Math.sin(angle) * distance, range(ctx.rng, 0.06, 0.15), 0.012));
  }

  // Two bubbles that rise and go flat again. Idle motion belongs to the art.
  const bubbles: { mesh: THREE.Mesh; phase: number; x: number; z: number; size: number }[] = [];
  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.Mesh(bubbleGeometry, tar);
    const angle = ctx.rng() * Math.PI * 2;
    const distance = range(ctx.rng, 0.1, 0.45);
    const entry = {
      mesh,
      phase: ctx.rng() * Math.PI * 2,
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      size: range(ctx.rng, 0.05, 0.09),
    };
    mesh.position.set(entry.x, 0.014, entry.z);
    bubbles.push(entry);
    spread.add(mesh);
  }

  const body = spread.children[1] as THREE.Mesh;
  body.onBeforeRender = (): void => {
    const t = performance.now() / 1000;
    for (const bubble of bubbles) {
      const swell = Math.max(0, Math.sin(t * 0.9 + bubble.phase));
      bubble.mesh.scale.set(bubble.size, bubble.size * swell * 0.9, bubble.size);
      bubble.mesh.position.y = 0.014;
    }
  };

  const api: ArtApi = {
    setProgress(t: number): void {
      const scale = Math.max(0.001, t);
      spread.scale.set(scale, 1, scale);
    },
  };

  return { object, colliders: [], parts: { spread }, api };
}
