/**
 * Turns a RunLayout into a walkable 3D world by calling the art pack.
 *
 * This is the one place where layout (pure data) meets art (three.js objects).
 * Everything above it deals in RunLayout; everything below deals in geometry.
 *
 * All rooms are built up front. Streaming by distance is a later plan step - at
 * 36 simple rooms it is not yet worth the complexity.
 */
import * as THREE from 'three';
import type { ArtPack, MaterialLibrary, RoomBuildContext, RoomDims } from '@art/lib/contract';
import { doorKey } from '@art/lib/contract';
import { resolveArt } from '@art/shared/index';
import type { WorldConfig } from '@/config/types';
import { stream } from '@/core/rng';
import { CollisionWorld } from './collision';
import type { Door } from './doors';
import type { RunLayout } from './generation';

export interface BuiltWorld {
  root: THREE.Group;
  collision: CollisionWorld;
  doors: Door[];
  /** Everything a look-ray can hit: doors plus anything that blocks sight. */
  raycastTargets: THREE.Object3D[];
  /** Room-index-tagged lights, so only the nearest few are ever enabled. */
  lights: { light: THREE.Light; x: number; z: number }[];
  materials: MaterialLibrary;
  /** Hides geometry beyond `renderDistanceRooms`. Fog hides it anyway - this stops us drawing it. */
  updateVisibility(x: number, z: number, radius: number): void;
  dispose(): void;
}

export function buildWorld(layout: RunLayout, pack: ArtPack, world: WorldConfig): BuiltWorld {
  const root = new THREE.Group();
  const collision = new CollisionWorld(world.grid.cellSize);
  const doors: Door[] = [];
  const raycastTargets: THREE.Object3D[] = [];
  const lights: BuiltWorld['lights'] = [];
  const cullable: { object: THREE.Object3D; x: number; z: number }[] = [];

  const materials = pack.createMaterials();
  const kit = pack.createKit();
  const dims: RoomDims = {
    cellSize: world.grid.cellSize,
    ceilingHeight: world.grid.ceilingHeight,
    wallThickness: world.grid.wallThickness,
    doorWidth: world.doors.width,
    doorHeight: world.doors.height,
  };

  const blueprints = new Map(pack.rooms.map((room) => [room.id, room]));
  const disposers: (() => void)[] = [];

  // --- rooms ---------------------------------------------------------------
  layout.rooms.forEach((placed, roomIndex) => {
    const blueprint = blueprints.get(placed.blueprintId);
    if (!blueprint) throw new Error(`world: pack "${pack.id}" has no room "${placed.blueprintId}"`);

    const doorStates: Record<string, 'open'> = {};
    for (const side of placed.doors) doorStates[doorKey([0, 0], side)] = 'open';

    const ctx: RoomBuildContext = {
      doors: doorStates,
      kit,
      materials,
      rng: stream(layout.seed, `room:${placed.cell[0]},${placed.cell[1]}`),
      dims,
      roomIndex,
      lightBudget: 2,
    };

    const built = blueprint.build(ctx);
    const originX = placed.cell[0] * dims.cellSize;
    const originZ = placed.cell[1] * dims.cellSize;

    built.object.position.set(originX, 0, originZ);
    root.add(built.object);
    raycastTargets.push(built.object);
    cullable.push({ object: built.object, x: originX, z: originZ });

    collision.add(built.colliders, originX, originZ);
    for (const light of built.lights ?? []) lights.push({ light, x: originX, z: originZ });
    if (built.dispose) disposers.push(built.dispose);
  });

  // --- doors ---------------------------------------------------------------
  const artCtx = { materials, rng: stream(layout.seed, 'doorArt'), dims };

  for (const placed of layout.doors) {
    const builder = resolveArt(placed.isExit ? 'door.exit' : 'door.standard', pack.overrides);
    const art = builder(artCtx);

    art.object.position.set(placed.position[0], 0, placed.position[1]);
    art.object.rotation.y = placed.rotationY;
    root.add(art.object);
    raycastTargets.push(art.object);
    cullable.push({ object: art.object, x: placed.position[0], z: placed.position[1] });

    const hinge = art.parts['hinge'];
    if (!hinge) throw new Error(`art "${placed.isExit ? 'door.exit' : 'door.standard'}" is missing part "hinge"`);

    // A closed door blocks the opening; the collider is disabled as it swings.
    const halfWidth = dims.doorWidth / 2;
    const alongZ = Math.abs(placed.rotationY) > 0.1;
    const [collider] = collision.add(
      [
        {
          kind: 'box',
          center: [0, 0],
          halfExtents: alongZ ? [0.12, halfWidth] : [halfWidth, 0.12],
        },
      ],
      placed.position[0],
      placed.position[1],
    );

    const door: Door = {
      id: placed.id,
      isExit: placed.isExit,
      object: art.object,
      hinge,
      x: placed.position[0],
      z: placed.position[1],
      open: false,
      progress: 0,
      collider: collider ?? null,
    };
    doors.push(door);

    // Tagged so the interaction ray can identify what it hit without a lookup table.
    art.object.traverse((child) => {
      child.userData['doorId'] = door.id;
    });

    for (const light of art.lights ?? []) lights.push({ light, x: placed.position[0], z: placed.position[1] });
    if (art.dispose) disposers.push(art.dispose);
  }

  // Static geometry needs valid world matrices before the first interaction ray,
  // which happens during the sim step ahead of the first render.
  root.updateMatrixWorld(true);

  return {
    root,
    collision,
    doors,
    raycastTargets,
    lights,
    materials,
    updateVisibility(x: number, z: number, radius: number): void {
      const limit = radius * radius;
      for (const entry of cullable) {
        entry.object.visible = (entry.x - x) ** 2 + (entry.z - z) ** 2 <= limit;
      }
    },
    dispose(): void {
      // Geometry is intentionally NOT disposed here: art/lib/build.ts caches box
      // geometry by size across worlds, so disposing it would break the next run.
      // Art that allocates outside the cache returns its own `dispose`.
      for (const dispose of disposers) dispose();
      root.clear();
      materials.dispose();
      collision.clear();
    },
  };
}
