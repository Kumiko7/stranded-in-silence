/**
 * Small geometry helpers shared by all art. Nothing here knows about gameplay.
 *
 * Geometry is cached by dimensions so duplicate rooms reuse buffers rather than
 * allocating a fresh BoxGeometry per instance. The reuse is real and worth
 * having WITHIN one build - a mansion fills about 900 entries placing many
 * thousands of boxes.
 *
 * Across builds it is worth nothing, because art sizes its furniture from the
 * seeded RNG: a new seed mints a new key for practically every box it places,
 * and rebuilding the same seed adds no entries at all. So the cache belongs to
 * one world and `clearGeometryCache()` ends it - without that it grew by ~300
 * permanently-retained geometries per run, which is a lobby-run-lobby loop that
 * gets slower the longer an evening goes on.
 *
 * Packs keep size-keyed caches of their own for the shapes this file does not
 * cover. They hand them the same lifetime with `ownGeometryCache()`.
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

/** The shape of a size-keyed cache: enough to free it, and nothing more. */
export interface GeometryCache {
  values(): Iterable<THREE.BufferGeometry>;
  clear(): void;
}

const caches: GeometryCache[] = [boxCache];

/**
 * Hands a pack's own size-keyed cache the same lifetime as this one.
 *
 * Packs keep their own (`cyl`, `ball`, `ring`, `quad`, ...) because the kit that
 * needs them is pack-local. Call this once, at module scope, next to the cache -
 * a cache keyed on numbers a room made up belongs to one world, and one that
 * nobody registered is a leak nothing will report.
 */
export function ownGeometryCache(cache: GeometryCache): void {
  caches.push(cache);
}

/**
 * Frees every registered cache. Call it once a world has been torn down and
 * nothing built from it is still standing - the meshes that share these buffers
 * are disposed with their world, so anything left holding one afterwards is a
 * bug this would turn into an invisible object rather than hide.
 */
export function clearGeometryCache(): void {
  for (const cache of caches) {
    for (const geometry of cache.values()) geometry.dispose();
    cache.clear();
  }
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
