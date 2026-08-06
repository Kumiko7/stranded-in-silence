/**
 * Geometry batching.
 *
 * A room's draw-call budget is 40, and a mansion room made of individual meshes
 * blows past that on the wainscot alone. `MeshBatcher` collects transformed
 * geometry, groups it by material, and merges each group into ONE mesh - so a
 * room can be built out of two hundred little boxes and still cost six draws.
 *
 * The trade is that merged geometry is allocated per room instance rather than
 * shared, which is why `build()` hands back a `dispose()`. Rooms must return it
 * as `BuiltRoom.dispose`.
 *
 * Anything that must stay a separate object - lights, transparent glows, an
 * `InstancedMesh`, something logic animates - is not batched. Add it to the room
 * group directly.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface BatchOptions {
  /**
   * Re-project UVs onto world axes so texel density is identical everywhere,
   * whatever the source geometry's own UVs were. `tile` is the size in metres
   * that one texture repeat covers. Leave unset for geometry with meaningful UVs
   * of its own (a lathe, a shaped panel).
   */
  readonly tile?: number;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  /**
   * Dispose the source geometry once it has been copied into the batch. Set this
   * for one-off geometry built at the call site (a book of a random width, a
   * sub-UV'd canvas); leave it off for anything from a cache, or you will free a
   * buffer the next room is still using.
   */
  readonly consume?: boolean;
}

interface Entry {
  geometry: THREE.BufferGeometry;
  castShadow: boolean;
  receiveShadow: boolean;
}

const _matrix = new THREE.Matrix4();
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);
const _pos = new THREE.Vector3();

/**
 * Replaces UVs with world-axis projection, picked per-vertex from the dominant
 * normal axis. Must run AFTER the world matrix is applied.
 */
function bakeWorldUVs(geometry: THREE.BufferGeometry, tile: number): void {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = new Float32Array(position.count * 2);

  for (let i = 0; i < position.count; i++) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    let u: number;
    let v: number;
    if (nx >= ny && nx >= nz) {
      u = position.getZ(i);
      v = position.getY(i);
    } else if (ny >= nx && ny >= nz) {
      u = position.getX(i);
      v = position.getZ(i);
    } else {
      u = position.getX(i);
      v = position.getY(i);
    }
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export class MeshBatcher {
  readonly #groups = new Map<THREE.Material, Entry[]>();

  /** Adds `geometry` transformed by `matrix`. The source geometry is never modified. */
  add(material: THREE.Material, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, options: BatchOptions = {}): void {
    // Everything merged has to agree on indexing; non-indexed is the common
    // denominator (ExtrudeGeometry is never indexed).
    const copy = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    copy.applyMatrix4(matrix);
    if (options.tile !== undefined) bakeWorldUVs(copy, options.tile);

    // Merging needs identical attribute sets; drop anything exotic a primitive
    // might carry so one stray geometry cannot poison a whole batch.
    for (const name of Object.keys(copy.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') copy.deleteAttribute(name);
    }
    if (!copy.getAttribute('uv')) bakeWorldUVs(copy, 1);
    copy.clearGroups();

    if (options.consume) geometry.dispose();

    const entries = this.#groups.get(material) ?? [];
    entries.push({
      geometry: copy,
      castShadow: options.castShadow ?? true,
      receiveShadow: options.receiveShadow ?? true,
    });
    this.#groups.set(material, entries);
  }

  get materialCount(): number {
    return this.#groups.size;
  }

  /**
   * One mesh per material. Shadow flags split a material into at most two meshes,
   * which is still far cheaper than one mesh per box.
   */
  build(): { object: THREE.Group; dispose(): void } {
    const object = new THREE.Group();
    const owned: THREE.BufferGeometry[] = [];

    for (const [material, entries] of this.#groups) {
      for (const casts of [true, false]) {
        const subset = entries.filter((entry) => entry.castShadow === casts);
        if (!subset.length) continue;

        const merged = mergeGeometries(subset.map((entry) => entry.geometry));
        if (!merged) continue;
        merged.computeBoundingSphere();
        // A box as well as a sphere, because three.js tests it after the sphere
        // and a merged batch is usually a slab: the floor, the ceiling, one
        // wall. The interaction ray starts INSIDE the sphere of every one of
        // them, so without a box it scans all their triangles, every tick.
        merged.computeBoundingBox();

        const mesh = new THREE.Mesh(merged, material);
        mesh.castShadow = casts;
        mesh.receiveShadow = subset.some((entry) => entry.receiveShadow);
        mesh.matrixAutoUpdate = false;
        object.add(mesh);
        owned.push(merged);
      }
      for (const entry of entries) entry.geometry.dispose();
    }
    this.#groups.clear();

    return {
      object,
      dispose(): void {
        for (const geometry of owned) geometry.dispose();
        owned.length = 0;
      },
    };
  }
}

/**
 * Remaps a geometry's existing 0..1 UVs into a sub-rectangle, so several things
 * sharing one merged mesh can each read a different cell of an atlas - four
 * different portraits off one painting texture, say.
 */
export function subUV(
  geometry: THREE.BufferGeometry,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): THREE.BufferGeometry {
  const copy = geometry.clone();
  const uv = copy.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
  return copy;
}

/** Translation + Y rotation, the only transform room furniture ever needs. */
export function poseMatrix(position: readonly [number, number, number], rotationY = 0): THREE.Matrix4 {
  _euler.set(0, rotationY, 0);
  _quat.setFromEuler(_euler);
  _pos.set(position[0], position[1], position[2]);
  return _matrix.compose(_pos, _quat, _one).clone();
}

/** Full pose, for the handful of things that lean, tilt or hang crooked. */
export function tiltMatrix(
  position: readonly [number, number, number],
  rotation: readonly [number, number, number],
  scale: readonly [number, number, number] = [1, 1, 1],
): THREE.Matrix4 {
  _euler.set(rotation[0], rotation[1], rotation[2], 'YXZ');
  _quat.setFromEuler(_euler);
  _pos.set(position[0], position[1], position[2]);
  return new THREE.Matrix4().compose(_pos, _quat, new THREE.Vector3(scale[0], scale[1], scale[2]));
}
