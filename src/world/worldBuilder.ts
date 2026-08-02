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
import type { ArtBuildContext, ArtPack, Collider, MaterialLibrary, RoomBuildContext, RoomDims } from '@art/lib/contract';
import { doorKey } from '@art/lib/contract';
import { resolveArt } from '@art/shared/index';
import type { ItemsConfig, WorldConfig } from '@/config/types';
import { stream } from '@/core/rng';
import type { WorldItem } from '@/entities/items';
import { CollisionWorld } from './collision';
import type { Chest, Locker } from './containers';
import type { Door } from './doors';
import type { RunLayout } from './generation';

export interface BuiltWorld {
  root: THREE.Group;
  collision: CollisionWorld;
  doors: Door[];
  chests: Chest[];
  lockers: Locker[];
  items: Map<string, WorldItem>;
  /** Everything a look-ray can hit: doors, containers, items and room geometry. */
  raycastTargets: THREE.Object3D[];
  /** Room-index-tagged lights, so only the nearest few are ever enabled. */
  lights: { light: THREE.Light; x: number; z: number }[];
  materials: MaterialLibrary;
  /** Drops an item into the world - chest contents, or something a player dropped. */
  spawnItem(id: string, itemId: string, x: number, y: number, z: number): WorldItem | null;
  removeItem(id: string): void;
  /** Hides geometry beyond `renderDistanceRooms`. Fog hides it anyway - this stops us drawing it. */
  updateVisibility(x: number, z: number, radius: number): void;
  dispose(): void;
}

export function buildWorld(layout: RunLayout, pack: ArtPack, world: WorldConfig, itemsConfig: ItemsConfig): BuiltWorld {
  const root = new THREE.Group();
  const collision = new CollisionWorld(world.grid.cellSize);
  const doors: Door[] = [];
  const chests: Chest[] = [];
  const lockers: Locker[] = [];
  const items = new Map<string, WorldItem>();
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

  /** Builds a shared-art piece, parks it in the world and tags it for the look-ray. */
  function place(
    artId: string,
    streamName: string,
    x: number,
    y: number,
    z: number,
    rotationY: number,
    tag: { key: string; value: string },
  ): { object: THREE.Object3D; parts: Record<string, THREE.Object3D> } {
    const ctx: ArtBuildContext = { materials, rng: stream(layout.seed, streamName), dims };
    const art = resolveArt(artId, pack.overrides)(ctx);

    art.object.position.set(x, y, z);
    art.object.rotation.y = rotationY;
    art.object.updateMatrixWorld(true);
    root.add(art.object);
    raycastTargets.push(art.object);
    cullable.push({ object: art.object, x, z });
    collision.add(art.colliders.map((collider) => rotate(collider, rotationY)), x, z);

    art.object.traverse((child) => {
      child.userData[tag.key] = tag.value;
    });

    for (const light of art.lights ?? []) lights.push({ light, x, z });
    if (art.dispose) disposers.push(art.dispose);
    return { object: art.object, parts: art.parts };
  }

  /** Art returns colliders in its own local space; placing it rotates them too. */
  function rotate(collider: Collider, rotationY: number): Collider {
    if (rotationY === 0) return collider;
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    const [cx, cz] = collider.center;
    const center = [cx * cos + cz * sin, -cx * sin + cz * cos] as const;
    return collider.kind === 'box'
      ? { ...collider, center, rotationY: (collider.rotationY ?? 0) + rotationY }
      : { ...collider, center };
  }

  function part(parts: Record<string, THREE.Object3D>, artId: string, name: string): THREE.Object3D {
    const found = parts[name];
    if (!found) throw new Error(`art "${artId}" is missing part "${name}"`);
    return found;
  }

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
  for (const placed of layout.doors) {
    const artId = placed.isExit ? 'door.exit' : 'door.standard';
    const { object, parts } = place(
      artId,
      'doorArt',
      placed.position[0],
      0,
      placed.position[1],
      placed.rotationY,
      { key: 'doorId', value: placed.id },
    );

    const lockIndicator = part(parts, artId, 'lockIndicator');
    lockIndicator.visible = placed.locked;

    // A closed door blocks the opening; the collider is disabled as it swings.
    const halfWidth = dims.doorWidth / 2;
    const alongZ = Math.abs(placed.rotationY) > 0.1;
    const [collider] = collision.add(
      [{ kind: 'box', center: [0, 0], halfExtents: alongZ ? [0.12, halfWidth] : [halfWidth, 0.12] }],
      placed.position[0],
      placed.position[1],
    );

    doors.push({
      id: placed.id,
      isExit: placed.isExit,
      object,
      hinge: part(parts, artId, 'hinge'),
      lockIndicator,
      x: placed.position[0],
      z: placed.position[1],
      locked: placed.locked,
      open: false,
      progress: 0,
      collider: collider ?? null,
    });
  }

  // --- chests and lockers --------------------------------------------------
  for (const placed of layout.containers) {
    const artId = placed.kind === 'chest' ? 'chest.standard' : 'locker.standard';
    const { object, parts } = place(
      artId,
      `container:${placed.id}`,
      placed.position[0],
      placed.position[1],
      placed.position[2],
      placed.rotationY,
      { key: placed.kind === 'chest' ? 'chestId' : 'lockerId', value: placed.id },
    );

    if (placed.kind === 'chest') {
      chests.push({
        id: placed.id,
        object,
        lid: part(parts, artId, 'lid'),
        contentsAnchor: part(parts, artId, 'contentsAnchor'),
        x: placed.position[0],
        z: placed.position[2],
        contents: placed.contents,
        opened: false,
        progress: 0,
      });
    } else {
      const inside = part(parts, artId, 'insideAnchor').getWorldPosition(new THREE.Vector3());
      lockers.push({
        id: placed.id,
        object,
        doorLeft: part(parts, artId, 'doorLeft'),
        doorRight: part(parts, artId, 'doorRight'),
        inside: { x: inside.x, y: inside.y, z: inside.z },
        x: placed.position[0],
        z: placed.position[2],
        yaw: placed.rotationY,
        occupied: false,
        progress: 0,
      });
    }
  }

  function spawnItem(id: string, itemId: string, x: number, y: number, z: number): WorldItem | null {
    const def = itemsConfig.items[itemId];
    if (!def) {
      console.warn(`[world] no item "${itemId}" in config/items.json`);
      return null;
    }
    // Items get no collider: they rest on tables and shelves, and a floor-plane
    // collider under a shelf ledge would block a doorway you can see through.
    const { object } = place(def.artId, `item:${id}`, x, y, z, 0, { key: 'worldItemId', value: id });

    const item: WorldItem = { id, itemId, object, x, y, z };
    items.set(id, item);
    return item;
  }

  function removeItem(id: string): void {
    const item = items.get(id);
    if (!item) return;
    items.delete(id);
    root.remove(item.object);

    const rayIndex = raycastTargets.indexOf(item.object);
    if (rayIndex >= 0) raycastTargets.splice(rayIndex, 1);
    const cullIndex = cullable.findIndex((entry) => entry.object === item.object);
    if (cullIndex >= 0) cullable.splice(cullIndex, 1);
  }

  // --- loose items ---------------------------------------------------------
  for (const placed of layout.items) {
    spawnItem(placed.id, placed.itemId, placed.position[0], placed.position[1], placed.position[2]);
  }

  // Static geometry needs valid world matrices before the first interaction ray,
  // which happens during the sim step ahead of the first render.
  root.updateMatrixWorld(true);

  return {
    root,
    collision,
    doors,
    chests,
    lockers,
    items,
    raycastTargets,
    lights,
    materials,
    spawnItem,
    removeItem,
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
