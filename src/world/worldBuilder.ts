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
import type {
  ArtApi,
  ArtBuildContext,
  ArtPack,
  Collider,
  MaterialLibrary,
  RoomBuildContext,
  RoomDims,
} from '@art/lib/contract';
import { doorKey } from '@art/lib/contract';
import { hasArt, resolveArt } from '@art/shared/index';
import type { GraphicsConfig, ItemsConfig, WorldConfig } from '@/config/types';
import { stream } from '@/core/rng';
import type { WorldItem } from '@/entities/items';
import { CollisionWorld } from './collision';
import type { Chest, Locker } from './containers';
import type { Door } from './doors';
import { rotateCell, rotateSide, type RunLayout } from './generation';
import { cellKey, cellsCovered, PortalVisibility, wallKey, type CellKey } from './visibility';

/** A piece of temporary scenery, with whatever hooks its art chose to expose. */
export interface BuiltDecor {
  object: THREE.Object3D;
  api?: ArtApi;
}

export interface BuiltWorld {
  root: THREE.Group;
  collision: CollisionWorld;
  doors: Door[];
  chests: Chest[];
  lockers: Locker[];
  items: Map<string, WorldItem>;
  /**
   * Everything the look-ray is looking FOR: doors, containers and items, each
   * tagged with what it is. Small, few, and cheap to test.
   */
  raycastTargets: THREE.Object3D[];
  /**
   * Room geometry, which the look-ray can only ever be *stopped* by - none of
   * it is tagged, so a hit on it is a miss. Kept apart from `raycastTargets`
   * because it is two orders of magnitude more triangles and the camera stands
   * inside its bounding spheres, so it is only worth testing once something
   * has actually been found for it to occlude. See `Game.#lookTag`.
   */
  occluders: THREE.Object3D[];
  /** Room-index-tagged lights, so only the nearest few are ever enabled. */
  lights: { light: THREE.Light; x: number; z: number }[];
  materials: MaterialLibrary;
  /** Drops an item into the world - chest contents, or something a player dropped. */
  spawnItem(id: string, itemId: string, x: number, y: number, z: number): WorldItem | null;
  removeItem(id: string): void;
  /**
   * Scenery with a lifetime: a thrown item in flight, a tar slick, a barricade.
   * Unlike an item it has no collider, cannot be looked at and is never culled -
   * these are all short-lived and all of them matter while they exist.
   */
  spawnDecor(id: string, artId: string, x: number, y: number, z: number, rotationY?: number): BuiltDecor | null;
  removeDecor(id: string): void;
  /**
   * Hides everything the camera cannot reach: beyond `renderDistanceRooms`, and
   * behind any doorway that is shut or off screen. See `./visibility.ts`.
   */
  updateVisibility(camera: THREE.Camera, x: number, z: number, radius: number): void;
  dispose(): void;
}

export function buildWorld(
  layout: RunLayout,
  pack: ArtPack,
  world: WorldConfig,
  itemsConfig: ItemsConfig,
  graphics: GraphicsConfig,
): BuiltWorld {
  const root = new THREE.Group();
  const collision = new CollisionWorld(world.grid.cellSize);
  const doors: Door[] = [];
  const chests: Chest[] = [];
  const lockers: Locker[] = [];
  const items = new Map<string, WorldItem>();
  const raycastTargets: THREE.Object3D[] = [];
  const occluders: THREE.Object3D[] = [];
  const lights: BuiltWorld['lights'] = [];
  /** Everything culled, tagged with the grid cells it stands in. */
  const cullable: { object: THREE.Object3D; cells: CellKey[] }[] = [];

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

  // Every wall edge a blueprint reserved for a door, in world terms. The shell
  // will not cut a window into one, so a reserved wall that got no door this
  // run is genuinely solid - which is what lets the culler see through the rest.
  const solidWalls = new Set<string>();
  for (const placed of layout.rooms) {
    const blueprint = blueprints.get(placed.blueprintId);
    if (!blueprint) continue;
    const turns = Math.round(placed.rotationY / (Math.PI / 2));
    for (const wall of blueprint.doorWalls) {
      const [dx, dy] = rotateCell(wall.cell, turns);
      solidWalls.add(wallKey(placed.cell[0] + dx, placed.cell[1] + dy, rotateSide(wall.side, turns)));
    }
  }

  const visibility = new PortalVisibility(
    layout,
    {
      cellSize: world.grid.cellSize,
      ceilingHeight: world.grid.ceilingHeight,
      doorWidth: world.doors.width,
      doorHeight: world.doors.height,
      solidWalls,
    },
    graphics.culling,
  );

  /**
   * The parts of a built thing that culling is allowed to hide.
   *
   * Never the whole object, if it holds a light. three.js does not light
   * anything from a light whose parent is hidden, so hiding a room outright
   * switches its lamps off - and then the *number* of lights a shader sees
   * changes every few steps, which is the one thing `Renderer.updateLights`
   * exists to prevent. It would also change how the manor looks, where a fire
   * behind a shut door still spills round it.
   *
   * Moving the lights out instead is the obvious alternative and it is a trap:
   * art animates them in its own local space (`sway()` on a chandelier writes
   * the lamp's `position` every frame), so a reparented lamp gets dragged back
   * to where the room thinks it is and the room goes black.
   *
   * So keep the path from the object down to each light visible, and hide the
   * biggest subtrees that hold no light. In practice that is one entry for a
   * room's merged geometry and a couple for whatever is not batched.
   */
  function hidableParts(object: THREE.Object3D, held: readonly THREE.Light[]): THREE.Object3D[] {
    const keep = new Set<THREE.Object3D>();
    for (const light of held) {
      for (let node: THREE.Object3D | null = light; node; node = node.parent) {
        keep.add(node);
        if (node === object) break;
      }
    }
    if (!keep.has(object)) return [object];

    const parts: THREE.Object3D[] = [];
    const walk = (node: THREE.Object3D): void => {
      for (const child of node.children) {
        if (keep.has(child)) walk(child);
        else parts.push(child);
      }
    };
    walk(object);
    return parts;
  }

  /** Real world position, so "nearest few lamps" is right for a rotated room. */
  function trackLight(light: THREE.Light): void {
    const at = light.getWorldPosition(new THREE.Vector3());
    lights.push({ light, x: at.x, z: at.z });
  }

  /**
   * Builds a shared-art piece, parks it in the world and tags it for the look-ray.
   *
   * `cells` is which grid cells it is culled with, and defaults to the ones its
   * geometry reaches. A door is the exception: it sits on the boundary and has
   * to be drawn from whichever side of it can be seen, open or shut.
   */
  function place(
    artId: string,
    streamName: string,
    x: number,
    y: number,
    z: number,
    rotationY: number,
    tag: { key: string; value: string },
    cells?: CellKey[],
  ): { object: THREE.Object3D; parts: Record<string, THREE.Object3D> } {
    const ctx: ArtBuildContext = { materials, rng: stream(layout.seed, streamName), dims };
    const art = resolveArt(artId, pack.overrides)(ctx);

    art.object.position.set(x, y, z);
    art.object.rotation.y = rotationY;
    art.object.updateMatrixWorld(true);
    root.add(art.object);
    raycastTargets.push(art.object);
    const at = cells ?? coveredCells(art.object);
    for (const part of hidableParts(art.object, art.lights ?? [])) cullable.push({ object: part, cells: at });
    collision.add(art.colliders.map((collider) => rotate(collider, rotationY)), x, z);

    art.object.traverse((child) => {
      child.userData[tag.key] = tag.value;
    });

    for (const light of art.lights ?? []) trackLight(light);
    if (art.dispose) disposers.push(art.dispose);
    return { object: art.object, parts: art.parts };
  }

  /** Which cells an object's geometry actually reaches. Its world matrix must be current. */
  const _box = new THREE.Box3();
  function coveredCells(object: THREE.Object3D): CellKey[] {
    return cellsCovered(_box.setFromObject(object), dims.cellSize, world.grid.wallThickness);
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

    // The generator hands the openings back in the blueprint's OWN frame, so a
    // rotated room cuts its doors in exactly the walls it thinks it is cutting.
    const doorStates: Record<string, 'open'> = {};
    for (const { cell, side } of placed.doors) doorStates[doorKey(cell, side)] = 'open';

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
    built.object.rotation.y = placed.rotationY;
    built.object.updateMatrixWorld(true);
    root.add(built.object);
    // Every cell the room occupies - a 1x3 hall culled on its origin alone would
    // vanish while you stood at the far end of it - plus any it leans into.
    const at = [...new Set([...placed.cells.map((cell) => cellKey(cell[0], cell[1])), ...coveredCells(built.object)])];
    for (const part of hidableParts(built.object, built.lights ?? [])) {
      cullable.push({ object: part, cells: at });
      // The parts are the room's geometry, which is exactly what the look-ray
      // needs to be stopped by - and being culled, they say when to skip it.
      occluders.push(part);
    }

    // Colliders come back in room-local space; placing the room rotates them too.
    collision.add(
      built.colliders.map((collider) => rotate(collider, placed.rotationY)),
      originX,
      originZ,
    );
    for (const light of built.lights ?? []) trackLight(light);
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
      [...visibility.cellsOfDoor(placed.id)],
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
      rotationY: placed.rotationY,
      locked: placed.locked,
      open: false,
      progress: 0,
      collider: collider ?? null,
      barricadeSeconds: 0,
    });
  }

  // Culling asks about a door's live state every tick; the room graph names
  // them, so this is the lookup between the two.
  const doorsById = new Map(doors.map((door) => [door.id, door]));

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

  // --- temporary scenery ----------------------------------------------------
  const decor = new Map<string, { object: THREE.Object3D; dispose?(): void }>();

  function spawnDecor(id: string, artId: string, x: number, y: number, z: number, rotationY = 0): BuiltDecor | null {
    if (!hasArt(artId, pack.overrides)) {
      console.warn(`[world] no art registered for "${artId}"`);
      return null;
    }
    removeDecor(id);

    const ctx: ArtBuildContext = { materials, rng: stream(layout.seed, `decor:${id}`), dims };
    const art = resolveArt(artId, pack.overrides)(ctx);
    art.object.position.set(x, y, z);
    art.object.rotation.y = rotationY;
    root.add(art.object);

    decor.set(id, { object: art.object, ...(art.dispose ? { dispose: art.dispose.bind(art) } : {}) });
    return { object: art.object, ...(art.api ? { api: art.api } : {}) };
  }

  function removeDecor(id: string): void {
    const entry = decor.get(id);
    if (!entry) return;
    decor.delete(id);
    root.remove(entry.object);
    entry.dispose?.();
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
    occluders,
    lights,
    materials,
    spawnItem,
    removeItem,
    spawnDecor,
    removeDecor,
    updateVisibility(camera: THREE.Camera, x: number, z: number, radius: number): void {
      // A door counts as see-through the moment it starts to swing, so the room
      // behind it is already there by the time the gap is wide enough to look
      // through - it must never appear in front of you.
      visibility.update(camera, x, z, radius, (doorId) => {
        const door = doorsById.get(doorId);
        return !door || door.open || door.progress > 0;
      });
      for (const entry of cullable) entry.object.visible = visibility.anyVisible(entry.cells);
    },
    dispose(): void {
      // Geometry is intentionally NOT disposed here: art/lib/build.ts caches box
      // geometry by size across worlds, so disposing it would break the next run.
      // Art that allocates outside the cache returns its own `dispose`.
      for (const id of [...decor.keys()]) removeDecor(id);
      for (const dispose of disposers) dispose();
      // A shadow map is a render target the renderer holds until the light that
      // owns it is disposed. Five of them a run adds up over an evening.
      for (const entry of lights) (entry.light as THREE.PointLight).shadow?.dispose();
      root.clear();
      materials.dispose();
      collision.clear();
    },
  };
}
