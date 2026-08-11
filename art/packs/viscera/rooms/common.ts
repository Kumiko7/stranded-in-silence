/**
 * The scaffolding every viscera room is written against.
 *
 * `Room` owns the batcher, the collider list and the light list, so a room file
 * reads as a description of the space rather than as three.js bookkeeping. It
 * also enforces the two rules that are easy to get wrong at 1 a.m.:
 *
 *   - geometry goes through the batcher, so a room stays inside its draw budget
 *   - anything the batcher allocated is disposed when the room unloads
 *
 * Positions follow the room-local convention in docs/art/ROOM_FORMAT.md: `y` is
 * the BOTTOM of the thing you are placing, because that is how anchors are
 * written and it is far easier to reason about a bone slab at 0.78 than about
 * its centre at 0.39.
 */
import * as THREE from 'three';
import type { BuiltRoom, Cell, Collider, RoomBlueprint, RoomBuildContext, Side } from '../../../lib/contract';
import { boxCollider, boxGeometry } from '../../../lib/build';
import type { BatchOptions } from '../../../lib/merge';
import { MeshBatcher, poseMatrix } from '../../../lib/merge';
import { addShell, type ShellOptions } from '../kit/shell';

export type Vec3 = readonly [number, number, number];
export type Size3 = readonly [number, number, number];

/** All four walls, for the many rooms that fit anywhere in the maze. */
export const ALL_WALLS = (['north', 'east', 'south', 'west'] as const).map((side: Side) => ({
  cell: [0, 0] as const,
  side,
}));

/** A subset of walls, for rooms keeping one solid for a pore or a set piece. */
export const wallsFor = (...sides: readonly Side[]) => sides.map((side) => ({ cell: [0, 0] as const, side }));

/** The same, on a named cell of a multi-cell footprint. */
export const wallsOn = (cell: Cell, ...sides: readonly Side[]) => sides.map((side) => ({ cell, side }));

/**
 * Doorways are centred on each wall and 1.2 m wide, so the lane in front of one
 * runs |x| < 1.1 (or |z| < 1.1). Solid anatomy belongs outside that.
 */
export const DOOR_LANE = 1.1;

export class Room {
  readonly batch = new MeshBatcher();
  /** Lights and anything else that must stay its own object. */
  readonly extra = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly lights: THREE.Light[] = [];
  readonly #ticks: ((time: number) => void)[] = [];
  readonly #owned: { dispose(): void }[] = [];
  #shellLights = 0;

  constructor(
    readonly ctx: RoomBuildContext,
    readonly blueprint: RoomBlueprint,
  ) {}

  get rng(): () => number {
    return this.ctx.rng;
  }

  mat(name: string): THREE.Material {
    return this.ctx.materials.get(name);
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.ctx.rng() * (max - min);
  }

  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.ctx.rng() * items.length)];
    if (item === undefined) throw new Error('Room.pick() from an empty array');
    return item;
  }

  chance(p: number): boolean {
    return this.ctx.rng() < p;
  }

  /** Floor, ceiling, walls, trim, orifices and pores. Every room calls this first. */
  shell(options: ShellOptions = {}): { poreAnchors: { position: Vec3; side: Side }[] } {
    const result = addShell(this.batch, this.ctx, this.blueprint.footprint, {
      doorWalls: this.blueprint.doorWalls,
      ...options,
    });
    this.colliders.push(...result.colliders);
    this.lights.push(...result.lights);
    this.#shellLights = result.lights.length;
    this.extra.add(result.extra);
    return { poreAnchors: result.poreAnchors };
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

  /** Arbitrary geometry, already posed. Use for cylinders, spheres, cones and planes. */
  geo(material: string | THREE.Material, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, options: BatchOptions = {}): void {
    this.batch.add(typeof material === 'string' ? this.mat(material) : material, geometry, matrix, options);
  }

  collider(collider: Collider): void {
    this.colliders.push(collider);
  }

  blockCircle(x: number, z: number, radius: number): void {
    this.colliders.push({ kind: 'circle', center: [x, z], radius });
  }

  /**
   * Adds a real light. Throws past `ctx.lightBudget` rather than silently
   * blowing the frame rate in a build nobody profiles until release. Most of
   * this pack's illumination is emissive and costs nothing - see kit/props.ts.
   */
  light(light: THREE.Light): void {
    if (this.lights.length >= this.ctx.lightBudget) {
      throw new Error(
        `room "${this.blueprint.id}" exceeds lightBudget ${this.ctx.lightBudget} (${this.#shellLights} of them from pores)`,
      );
    }
    this.lights.push(light);
    this.extra.add(light);
  }

  /**
   * Something that must stay its own object rather than being merged: a mesh
   * the room animates, a light's own halo. Costs a draw call, so it is for the
   * one or two pieces per room that genuinely move.
   */
  loose(object: THREE.Object3D): void {
    this.extra.add(object);
  }

  /**
   * Hands the room ownership of a geometry (or anything else disposable) that
   * did NOT go through the batcher.
   *
   * Everything batched is freed by `MeshBatcher.dispose`, but a `loose()` mesh
   * built for one room instance is not, and nothing in the engine will report
   * it - it is simply a buffer per room per run, retained until the tab closes.
   * Any room that animates something has at least one of these.
   */
  own(disposable: { dispose(): void }): void {
    this.#owned.push(disposable);
  }

  /**
   * Cosmetic per-frame motion: a light breathing, a heart beating. Runs off the
   * room's own `onBeforeRender`, so it stops the moment the room is culled and
   * never touches collision or gameplay.
   */
  tick(fn: (time: number) => void): void {
    this.#ticks.push(fn);
  }

  finish(): BuiltRoom {
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

    const owned = this.#owned;
    return {
      object,
      colliders: this.colliders,
      lights: this.lights,
      dispose(): void {
        built.dispose();
        for (const item of owned) item.dispose();
        owned.length = 0;
      },
    };
  }
}
