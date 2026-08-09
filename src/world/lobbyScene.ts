/**
 * Turns the lobby cabin art into a walkable scene, the way `worldBuilder.ts`
 * turns a `RunLayout` into a map.
 *
 * The split is the same one the run uses: art builds the room and hands back
 * anchors; this file places everything logic drives at those anchors, tags it
 * for the look-ray, and registers collision. Nothing here knows what a poster
 * *means* - that is `src/game/Lobby.ts`.
 */
import * as THREE from 'three';
import type { ArtBuildContext, Collider, MaterialLibrary, RoomDims } from '@art/lib/contract';
import { hasArt, resolveArt } from '@art/shared/index';
import { buildLobby, createLobbyMaterials, FENCE_RAIL, HALF_X, type Pose } from '@art/shared/lobby/index';
import type { Config } from '@/config/index';
import { stream } from '@/core/rng';
import { CollisionWorld } from './collision';

/** Hung in a slot no map has claimed yet, and in place of a missing poster art. */
const BLANK_POSTER = 'poster.blank';

/**
 * What a pick records when somebody presses E on the `?` poster.
 *
 * It is a pick like any other - it is tallied, it marks the frame, it opens the
 * countdown - and it is only resolved to an actual map at the moment the run
 * starts. Not a map id, and deliberately unable to collide with one.
 */
export const RANDOM_PICK = '*random';

export interface LobbyPoster {
  /** Position on the wall, left to right then down. Stable across peers. */
  slot: number;
  /** The map this poster advertises. Null for the `?` and for empty frames. */
  mapId: string | null;
  /** What pressing E on it records: a map id, `*random`, or null for a blank. */
  pickId: string | null;
  object: THREE.Object3D;
  /** Shown once the local player has escaped this map themselves. */
  tick: THREE.Object3D;
  /** The pick highlight. Logic shows and tints it. */
  mark: THREE.Object3D;
  setMark(hex: string): void;
  x: number;
  z: number;
}

export interface LobbyFixture {
  object: THREE.Object3D;
  x: number;
  z: number;
}

export interface LobbyWorld {
  root: THREE.Group;
  collision: CollisionWorld;
  posters: LobbyPoster[];
  lever: LobbyFixture & { setLever(t: number): void };
  wardrobe: LobbyFixture;
  /** The rack you take darts from. */
  dartStand: LobbyFixture;
  /** Where a dart is thrown, and what it is thrown at. World space. */
  darts: {
    board: { x: number; y: number; z: number; nx: number; nz: number };
    /** The fence, as a distance in front of the board along its normal. */
    fenceDistance: number;
    fenceTop: number;
    setScores(scores: readonly number[]): void;
  };
  /** Everything the look-ray is looking FOR: posters, the lever, the wardrobe. */
  raycastTargets: THREE.Object3D[];
  /** The cabin itself, which the ray can only be stopped by. See `Game.#lookTag`. */
  occluders: THREE.Object3D[];
  lights: { light: THREE.Light; x: number; z: number }[];
  materials: MaterialLibrary;
  spawns: readonly Pose[];
  /** Where the local player's own model stands while the wardrobe is open. */
  mannequin: Pose;
  wardrobeCamera: { position: readonly [number, number, number]; yaw: number; pitch: number };
  dispose(): void;
}

/**
 * `slots` frames, filled in order by the enabled maps and left blank after that.
 * Twenty maps are planned; one exists. The wall is built for the twenty.
 */
export function buildLobbyScene(config: Config, mapIds: readonly string[]): LobbyWorld {
  const root = new THREE.Group();
  const collision = new CollisionWorld(config.world.grid.cellSize);
  const raycastTargets: THREE.Object3D[] = [];
  const occluders: THREE.Object3D[] = [];
  const lights: LobbyWorld['lights'] = [];
  const disposers: (() => void)[] = [];

  const materials = createLobbyMaterials();
  const dims: RoomDims = {
    cellSize: config.world.grid.cellSize,
    ceilingHeight: config.world.grid.ceilingHeight,
    wallThickness: config.world.grid.wallThickness,
    doorWidth: config.world.doors.width,
    doorHeight: config.world.doors.height,
  };

  // A fixed seed, so every peer's cabin is arranged identically. Nothing about
  // the lobby is simulated, but two players describing different rooms to each
  // other over voice would be a bad first impression of a co-op game.
  const cabin = buildLobby(
    { materials, rng: stream(0, 'lobby'), dims },
    Math.max(1, config.game.lobby.posterSlots),
  );

  root.add(cabin.object);
  occluders.push(cabin.object);
  collision.add(cabin.colliders, 0, 0);
  // World matrices have to be valid before the lights are ranked by position.
  root.updateMatrixWorld(true);
  for (const light of cabin.lights) {
    const at = light.getWorldPosition(new THREE.Vector3());
    lights.push({ light, x: at.x, z: at.z });
  }
  disposers.push(cabin.dispose);

  /** Builds a shared-art piece, parks it in the cabin and tags it for the ray. */
  function place(artId: string, streamName: string, pose: Pose, tag: { key: string; value: string }) {
    const ctx: ArtBuildContext = { materials, rng: stream(0, streamName), dims };
    const art = resolveArt(artId)(ctx);

    art.object.position.set(pose.position[0], pose.position[1], pose.position[2]);
    art.object.rotation.y = pose.rotationY;
    art.object.updateMatrixWorld(true);
    root.add(art.object);
    raycastTargets.push(art.object);
    collision.add(art.colliders.map((collider) => rotate(collider, pose.rotationY)), pose.position[0], pose.position[2]);

    art.object.traverse((child) => {
      child.userData[tag.key] = tag.value;
    });

    if (art.dispose) disposers.push(art.dispose);
    return art;
  }

  /* --- the poster wall ---------------------------------------------------- */

  const posters: LobbyPoster[] = [];
  // The `?` takes the frame straight after the last real map, so it sits with
  // the maps rather than out on its own at the end of a row of blanks.
  const randomSlot = config.game.lobby.randomPoster ? mapIds.length : -1;

  cabin.anchors.posters.forEach((pose, slot) => {
    const random = slot === randomSlot;
    const mapId = random ? null : mapIds[slot] ?? null;
    const wanted = random ? 'poster.random' : mapId ? config.maps.maps[mapId]?.posterArtId ?? BLANK_POSTER : BLANK_POSTER;
    // A map whose poster art has not been drawn yet still gets a frame and is
    // still playable - it just hangs blank, like the slots with no map at all.
    const artId = hasArt(wanted) ? wanted : BLANK_POSTER;

    const art = place(artId, `poster:${slot}`, pose, { key: 'posterSlot', value: String(slot) });
    posters.push({
      slot,
      mapId,
      pickId: random ? RANDOM_PICK : mapId,
      object: art.object,
      tick: art.parts['tick'] ?? art.object,
      mark: art.parts['mark'] ?? art.object,
      setMark: art.api?.setMark?.bind(art.api) ?? (() => {}),
      x: pose.position[0],
      z: pose.position[2],
    });
  });

  /* --- fixtures ------------------------------------------------------------ */

  const leverArt = place('lobby.lever', 'lever', cabin.anchors.lever, { key: 'lobbyId', value: 'lever' });
  const wardrobeArt = place('lobby.wardrobe', 'wardrobe', cabin.anchors.wardrobe, {
    key: 'lobbyId',
    value: 'wardrobe',
  });

  /* --- the dart minigame ---------------------------------------------------- */

  const standArt = place('lobby.dartStand', 'dartStand', cabin.anchors.dartStand, {
    key: 'lobbyId',
    value: 'dartStand',
  });
  // Neither of these is ever looked AT - they are behind a fence nobody can
  // reach - so both are tagged as scenery and the look-ray walks past them.
  const boardPose = cabin.anchors.dartboard;
  place('lobby.dartboard', 'dartboard', boardPose, { key: 'lobbyScenery', value: 'dartboard' });
  const scoreArt = place('lobby.scoreboard', 'scoreboard', cabin.anchors.scoreboard, {
    key: 'lobbyScenery',
    value: 'scoreboard',
  });

  root.updateMatrixWorld(true);

  return {
    root,
    collision,
    posters,
    lever: {
      object: leverArt.object,
      setLever: leverArt.api?.setLever?.bind(leverArt.api) ?? (() => {}),
      x: cabin.anchors.lever.position[0],
      z: cabin.anchors.lever.position[2],
    },
    wardrobe: {
      object: wardrobeArt.object,
      x: cabin.anchors.wardrobe.position[0],
      z: cabin.anchors.wardrobe.position[2],
    },
    dartStand: {
      object: standArt.object,
      x: cabin.anchors.dartStand.position[0],
      z: cabin.anchors.dartStand.position[2],
    },
    darts: {
      // The board faces -X, so its normal points back down the throwing line.
      board: { x: boardPose.position[0], y: boardPose.position[1], z: boardPose.position[2], nx: -1, nz: 0 },
      fenceDistance: boardPose.position[0] - (HALF_X + 0.17),
      fenceTop: FENCE_RAIL,
      setScores: scoreArt.api?.setScores?.bind(scoreArt.api) ?? ((): void => {}),
    },
    raycastTargets,
    occluders,
    lights,
    materials,
    spawns: cabin.anchors.playerSpawns,
    mannequin: cabin.anchors.mannequin,
    wardrobeCamera: cabin.anchors.wardrobeCamera,
    dispose(): void {
      for (const dispose of disposers) dispose();
      // A shadow map is a render target the renderer holds until the light that
      // owns it is disposed - exactly as in `worldBuilder.dispose`. The cabin
      // is entered once per run rather than once per session, so the fire's
      // cube map is a fresh one every time a team comes back from a map.
      for (const entry of lights) (entry.light as THREE.PointLight).shadow?.dispose();
      root.clear();
      materials.dispose();
      collision.clear();
    },
  };
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
