/**
 * The scaffolding the cabin is written against.
 *
 * Exactly the job `art/packs/mansion/rooms/common.ts` does for mansion rooms -
 * batcher, collider list and light list in one place - but the lobby is not part
 * of a pack and cannot borrow a pack's `Room`, which is bound to that pack's
 * shell and kit. The two are deliberately not merged: `Room` grows toward room
 * blueprints and this grows toward one hand-built space.
 *
 * Positions follow the same convention as rooms: `y` is the BOTTOM of the thing
 * you are placing.
 */
import * as THREE from 'three';
import type { Collider, MaterialLibrary } from '../../lib/contract';
import { boxCollider, boxGeometry } from '../../lib/build';
import type { BatchOptions } from '../../lib/merge';
import { MeshBatcher, poseMatrix } from '../../lib/merge';

export type Vec3 = readonly [number, number, number];
export type Size3 = readonly [number, number, number];

export class Builder {
  readonly batch = new MeshBatcher();
  /** Lights, transparent glows and anything logic drives: never batched. */
  readonly extra = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly lights: THREE.Light[] = [];
  readonly #ticks: ((time: number) => void)[] = [];
  readonly #disposers: (() => void)[] = [];

  constructor(
    readonly materials: MaterialLibrary,
    readonly rng: () => number,
  ) {}

  mat(name: string): THREE.Material {
    return this.materials.get(name);
  }

  range(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }

  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.rng() * items.length)];
    if (item === undefined) throw new Error('Builder.pick() from an empty array');
    return item;
  }

  /** A box whose `y` is its BOTTOM face. Decoration only - no collider. */
  box(material: string | THREE.Material, size: Size3, position: Vec3, rotationY = 0, options: BatchOptions = {}): void {
    const mat = typeof material === 'string' ? this.mat(material) : material;
    this.batch.add(
      mat,
      boxGeometry(size[0], size[1], size[2]),
      poseMatrix([position[0], position[1] + size[1] / 2, position[2]], rotationY),
      { tile: 1.2, ...options },
    );
  }

  /** A box you cannot walk through. Collision is rounded 4 cm inward so nothing snags. */
  solid(material: string | THREE.Material, size: Size3, position: Vec3, rotationY = 0, options: BatchOptions = {}): void {
    this.box(material, size, position, rotationY, options);
    this.colliders.push(
      boxCollider([Math.max(0.08, size[0] - 0.08), size[1], Math.max(0.08, size[2] - 0.08)], position, rotationY),
    );
  }

  /** Arbitrary geometry, already posed. Cylinders, lathes, planes, cones. */
  geo(
    material: string | THREE.Material,
    geometry: THREE.BufferGeometry,
    matrix: THREE.Matrix4,
    options: BatchOptions = {},
  ): void {
    this.batch.add(typeof material === 'string' ? this.mat(material) : material, geometry, matrix, options);
  }

  collider(collider: Collider): void {
    this.colliders.push(collider);
  }

  blockCircle(x: number, z: number, radius: number): void {
    this.colliders.push({ kind: 'circle', center: [x, z], radius });
  }

  /**
   * A real light. The lobby has no `lightBudget` to blow: it is one hand-built
   * space with nothing else in the scene, so the renderer's nearest-N ranking
   * never has to choose. Rooms are the things that must stay cheap.
   */
  light(light: THREE.Light): void {
    this.lights.push(light);
    this.extra.add(light);
  }

  /** An object that stays its own node - a glow, a mannequin, something animated. */
  attach(object: THREE.Object3D): void {
    this.extra.add(object);
  }

  /** Cosmetic per-frame motion. Runs off the cabin's own `onBeforeRender`. */
  tick(fn: (time: number) => void): void {
    this.#ticks.push(fn);
  }

  /** Geometry allocated outside the shared caches, freed when the lobby unloads. */
  own(dispose: () => void): void {
    this.#disposers.push(dispose);
  }

  finish(): { object: THREE.Group; colliders: Collider[]; lights: THREE.Light[]; dispose(): void } {
    const built = this.batch.build();
    const object = new THREE.Group();
    object.add(built.object);
    object.add(this.extra);

    const first = built.object.children[0];
    if (first && this.#ticks.length) {
      const ticks = this.#ticks;
      first.onBeforeRender = (): void => {
        const time = performance.now() / 1000;
        for (const tick of ticks) tick(time);
      };
    }

    const disposers = this.#disposers;
    return {
      object,
      colliders: this.colliders,
      lights: this.lights,
      dispose(): void {
        built.dispose();
        for (const dispose of disposers) dispose();
        disposers.length = 0;
      },
    };
  }
}
