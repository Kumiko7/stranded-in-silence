/**
 * Small geometry helpers shared by all art. Nothing here knows about gameplay.
 *
 * Geometry is cached by dimensions so duplicate rooms reuse buffers rather than
 * allocating a fresh BoxGeometry per instance.
 */
import * as THREE from 'three';
import type { Collider } from './contract';

const boxCache = new Map<string, THREE.BoxGeometry>();

export function boxGeometry(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`;
  let geo = boxCache.get(key);
  if (!geo) {
    geo = new THREE.BoxGeometry(w, h, d);
    boxCache.set(key, geo);
  }
  return geo;
}

/** A box mesh whose `y` is the position of its BOTTOM face, which is how rooms are laid out. */
export function box(
  material: THREE.Material,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  rotationY = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(boxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(position[0], position[1] + size[1] / 2, position[2]);
  mesh.rotation.y = rotationY;
  return mesh;
}

/** Axis-aligned collider matching a `box()` call. Only for things you cannot walk through. */
export function boxCollider(
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  rotationY = 0,
): Collider {
  return {
    kind: 'box',
    center: [position[0], position[2]],
    halfExtents: [size[0] / 2, size[2] / 2],
    rotationY,
  };
}

/** Both at once, for the common case of a solid piece of furniture. */
export function solid(
  material: THREE.Material,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  rotationY = 0,
): { mesh: THREE.Mesh; collider: Collider } {
  return {
    mesh: box(material, size, position, rotationY),
    collider: boxCollider(size, position, rotationY),
  };
}

/** Uniform float in [min, max) from a seeded stream. */
export function range(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error('pick() from empty array');
  return item;
}

/** Simple cached material library backed by a factory map. */
export function materialLibrary(
  factories: Record<string, () => THREE.Material>,
): { get(name: string): THREE.Material; dispose(): void } {
  const cache = new Map<string, THREE.Material>();
  return {
    get(name: string): THREE.Material {
      let mat = cache.get(name);
      if (!mat) {
        const factory = factories[name];
        if (!factory) throw new Error(`unknown material "${name}"`);
        mat = factory();
        cache.set(name, mat);
      }
      return mat;
    },
    dispose(): void {
      for (const mat of cache.values()) mat.dispose();
      cache.clear();
    },
  };
}
