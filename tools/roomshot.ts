/**
 * Room review — renders every room of an art pack through the REAL game renderer
 * and writes a contact sheet per room to `shots/<pack>/`.
 *
 * The point is that nothing here re-implements the look of the game. It uses
 * `src/render/Renderer` (tone mapping, exposure, fog, ambient floor, nearest-N
 * light culling), `src/world/worldBuilder` (the same call the run makes, so doors,
 * chests, lockers and items are placed exactly as the generator would place them)
 * and the map's own `config/maps.json` graphics overrides. If a room looks wrong
 * in a sheet, it looks wrong in the game.
 *
 * What it fakes is only the layout: a one-room `RunLayout` with every declared
 * `doorWall` opened and every container/item anchor filled, which is the worst
 * case for clearance and the most useful case for review.
 *
 * Usage and the review loop: docs/art/ROOM_REVIEW.md.
 */
import * as THREE from 'three';
import type { Cell, RoomBlueprint, Side } from '@art/lib/contract';
import { getArtPack } from '@art/packs/index';
import { resolveArt } from '@art/shared/index';
import { configForMap, enabledMapIds, loadConfig, lobbyGraphics } from '@/config/index';
import { stream } from '@/core/rng';
import { Renderer } from '@/render/Renderer';
import type { PlacedContainer, PlacedDoor, PlacedItem, RunLayout } from '@/world/generation';
import { buildLobbyScene } from '@/world/lobbyScene';
import { buildWorld } from '@/world/worldBuilder';

/* --- options ---------------------------------------------------------------- */

const params = new URLSearchParams(location.search);
const mapId = params.get('map') ?? 'mansion';
/** `?rooms=library,study` — bare names or full ids. Omit for the whole pack. */
const only = (params.get('rooms') ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
/** Same role as a run seed: it drives every `ctx.rng()` in `build()`. */
const seed = Number(params.get('seed') ?? '20260804');
const tileWidth = Number(params.get('width') ?? '512');
const tileHeight = Math.round(tileWidth * 0.625);
/**
 * Multiplies the map's own exposure. Leave at 1 to judge whether a room is
 * navigable on its own light; raise it only to inspect composition in a corner
 * the game keeps black. Anything but 1 is stamped on the sheet.
 */
const exposureBoost = Number(params.get('exposure') ?? '1');
/** Written to disk unless you only want to eyeball the page. */
const save = params.get('save') !== 'off';

const COLUMNS = 3;
const HEADER = 26;
const LABEL = 20;
/** How far inside the doorway the camera stands: a step into the room. */
const DOOR_STEP_IN = 1.0;
/** Doorway views are the gameplay-true ones, so they get the budget. */
const MAX_DOOR_VIEWS = 4;

const STEP: Record<Side, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

/* --- page ------------------------------------------------------------------- */

const statusEl = document.getElementById('status') as HTMLElement;
const gallery = document.getElementById('gallery') as HTMLElement;
const canvas = document.getElementById('shot-canvas') as HTMLCanvasElement;
const lines: string[] = [];

function log(line: string): void {
  lines.push(line);
  statusEl.textContent = lines.join('\n');
  console.info(`[roomshot] ${line}`);
}

/* --- one-room layout -------------------------------------------------------- */

/**
 * A `RunLayout` holding exactly this blueprint, with every wall it is willing to
 * open opened and every anchor filled. `buildWorld()` cannot tell the difference,
 * which is the whole trick.
 */
function layoutFor(blueprint: RoomBlueprint, cellSize: number): RunLayout {
  const doors: PlacedDoor[] = blueprint.doorWalls.map((wall, index) => {
    const [dx, dy] = STEP[wall.side];
    return {
      id: `shot:${index}`,
      position: [(wall.cell[0] + dx / 2) * cellSize, (wall.cell[1] + dy / 2) * cellSize],
      rotationY: dx !== 0 ? Math.PI / 2 : 0,
      isExit: false,
      // One locked door per room, so the lock indicator is always under review.
      locked: index === 0,
    };
  });

  const containers: PlacedContainer[] = [];
  for (const [index, anchor] of (blueprint.anchors.chest ?? []).entries()) {
    containers.push({
      id: `shot:chest:${index}`,
      kind: 'chest',
      position: anchor.position,
      rotationY: anchor.rotationY ?? 0,
      contents: 'key',
    });
  }
  for (const [index, anchor] of (blueprint.anchors.locker ?? []).entries()) {
    containers.push({
      id: `shot:locker:${index}`,
      kind: 'locker',
      position: anchor.position,
      rotationY: anchor.rotationY ?? 0,
      contents: null,
    });
  }

  const items: PlacedItem[] = (blueprint.anchors.itemSpawn ?? []).map((anchor, index) => ({
    id: `shot:item:${index}`,
    itemId: 'key',
    position: anchor.position,
  }));

  const cells = blueprint.footprint.map((cell) => ({
    cell,
    room: 0,
    doors: [] as Side[],
    interior: [] as Side[],
    patrolPoints: [[cell[0] * cellSize, cell[1] * cellSize] as const],
  }));

  return {
    seed,
    mapId,
    grid: { width: 1, height: 1, cellSize },
    rooms: [
      {
        cell: [0, 0],
        blueprintId: blueprint.id,
        rotationY: 0,
        cells: blueprint.footprint,
        doors: blueprint.doorWalls.map((wall) => ({ cell: wall.cell, side: wall.side })),
        region: 0,
        patrolPoints: (blueprint.anchors.patrolPoint ?? []).map(
          (anchor) => [anchor.position[0], anchor.position[2]] as const,
        ),
      },
    ],
    cells,
    doors,
    containers,
    items,
    playerSpawns: [],
    exitCell: [0, 0],
    enemySpawn: { cell: [0, 0], position: [0, 0] },
  };
}

/* --- cameras ---------------------------------------------------------------- */

interface View {
  label: string;
  from: THREE.Vector3;
  look: THREE.Vector3;
}

/**
 * The centroid of the cells the room actually occupies. Not the centre of its
 * bounding box: for an L that point is in the cell the room does not have, and
 * every camera would be aiming at a wall.
 */
function centroid(footprint: readonly Cell[], cellSize: number): { cx: number; cz: number } {
  const count = Math.max(1, footprint.length);
  return {
    cx: (footprint.reduce((sum, cell) => sum + cell[0], 0) / count) * cellSize,
    cz: (footprint.reduce((sum, cell) => sum + cell[1], 0) / count) * cellSize,
  };
}

/**
 * A doorway view per door (how a player actually meets the room, at eye height
 * and the player's own FOV), plus two raised corner views for reading the layout.
 */
function viewsFor(blueprint: RoomBlueprint, cellSize: number, ceilingHeight: number, eyeHeight: number): View[] {
  const box = centroid(blueprint.footprint, cellSize);
  const centre = new THREE.Vector3(box.cx, 1.25, box.cz);
  const views: View[] = [];

  // What the run opens on, for a room tagged `entrance`. Aimed exactly the way
  // Game.#updateCamera aims it: `camera.rotation.y = anchor.rotationY`.
  const spawn = blueprint.anchors.playerSpawn?.[0];
  if (spawn) {
    const yaw = spawn.rotationY ?? 0;
    const from = new THREE.Vector3(spawn.position[0], eyeHeight, spawn.position[2]);
    views.push({
      label: 'player spawn 1',
      from,
      look: from.clone().add(new THREE.Vector3(-Math.sin(yaw) * 4, -0.25, -Math.cos(yaw) * 4)),
    });
  }

  const walls = blueprint.doorWalls;
  const stride = Math.max(1, Math.ceil(walls.length / MAX_DOOR_VIEWS));
  for (let i = 0; i < walls.length; i += stride) {
    const wall = walls[i];
    if (!wall) continue;
    const [dx, dz] = STEP[wall.side];
    const from = new THREE.Vector3(
      (wall.cell[0] + dx / 2) * cellSize - dx * DOOR_STEP_IN,
      eyeHeight,
      (wall.cell[1] + dz / 2) * cellSize - dz * DOOR_STEP_IN,
    );
    views.push({ label: `from the ${wall.side} door`, from, look: centre.clone() });
  }

  // Raised corner views, anchored on OCCUPIED cells: the SE corner of an
  // L-shaped room's bounding box is outside the room, and a camera there sees
  // the back of a wall.
  const ordered = [...blueprint.footprint].sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  const first = ordered[0] ?? ([0, 0] as Cell);
  const last = ordered[ordered.length - 1] ?? ([0, 0] as Cell);
  const corner = cellSize / 2 - 0.7;
  const high = ceilingHeight - 0.35;
  const look = new THREE.Vector3(box.cx, 0.85, box.cz);

  views.push({
    label: 'overview NW',
    from: new THREE.Vector3(first[0] * cellSize - corner, high, first[1] * cellSize - corner),
    look: look.clone(),
  });
  views.push({
    label: 'overview SE',
    from: new THREE.Vector3(last[0] * cellSize + corner, high, last[1] * cellSize + corner),
    look: look.clone(),
  });

  return views;
}

/* --- sheet ------------------------------------------------------------------ */

function sheetContext(count: number): CanvasRenderingContext2D {
  const columns = Math.min(COLUMNS, count);
  const rows = Math.ceil(count / columns);
  const sheet = document.createElement('canvas');
  sheet.width = columns * tileWidth;
  sheet.height = HEADER + rows * (tileHeight + LABEL);

  const ctx = sheet.getContext('2d');
  if (!ctx) throw new Error('roomshot: no 2d context');
  ctx.fillStyle = '#0b0c11';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  return ctx;
}

function caption(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, height: number, colour: string): void {
  ctx.fillStyle = '#141724';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = colour;
  ctx.font = `${Math.round(height * 0.62)}px ui-monospace, Consolas, monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 8, y + height / 2 + 1);
}

/* --- writing ---------------------------------------------------------------- */

async function write(file: string, dataUrl: string): Promise<void> {
  if (!save) return;
  const response = await fetch('/__roomshot/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ file, data: dataUrl.slice(dataUrl.indexOf(',') + 1) }),
  });
  if (!response.ok) throw new Error(`save failed (${response.status}): ${await response.text()}`);
}

/* --- the lobby --------------------------------------------------------------- */

/**
 * `?map=lobby` reviews the cabin instead of a pack. It is not a room blueprint,
 * so it gets its own pass - but through the same `Renderer`, the same
 * `buildLobbyScene()` the game calls and the same `graphics.json -> lobby`
 * overrides, so what lands in the sheet is what a player sees.
 */
async function shootLobby(): Promise<void> {
  const config = loadConfig();
  const graphics = lobbyGraphics();

  const renderer = new Renderer(canvas, graphics, config.player);
  renderer.renderer.toneMappingExposure = graphics.exposure * exposureBoost;
  renderer.renderer.setSize(tileWidth, tileHeight, false);
  renderer.camera.aspect = tileWidth / tileHeight;
  renderer.camera.updateProjectionMatrix();

  const world = buildLobbyScene(config, enabledMapIds());
  renderer.scene.add(world.root);
  renderer.setRoomLights(world.lights);

  // The mannequin is placed by `src/game/Lobby.ts`, not by the scene - but the
  // wardrobe view exists to answer "does the model land on the right", so the
  // sheet has to stand one there too.
  const model = resolveArt('player.masked')({
    materials: world.materials,
    rng: stream(0, 'mannequin'),
    dims: {
      cellSize: config.world.grid.cellSize,
      ceilingHeight: config.world.grid.ceilingHeight,
      wallThickness: config.world.grid.wallThickness,
      doorWidth: config.world.doors.width,
      doorHeight: config.world.doors.height,
    },
  });
  model.object.position.set(world.mannequin.position[0], 0, world.mannequin.position[2]);
  (model.parts['root'] ?? model.object).rotation.y = world.mannequin.rotationY;
  model.api?.setColour?.(config.player.customisation.colours[1]?.hex ?? '#9c5638');
  renderer.scene.add(model.object);

  const eye = config.player.body.standHeight + config.player.body.eyeHeightOffset;
  const spawn = world.spawns[0];
  const from = new THREE.Vector3(spawn?.position[0] ?? 0, eye, spawn?.position[2] ?? 0);
  const yaw = spawn?.rotationY ?? 0;

  const at = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const views: View[] = [
    // What you actually see the instant you arrive.
    { label: 'arrival', from, look: from.clone().add(at(-Math.sin(yaw) * 6, -0.35, -Math.cos(yaw) * 6)) },
    { label: 'the window', from: at(0.5, eye, 1.2), look: at(0, 1.9, -12) },
    { label: 'the fire', from: at(-1.4, eye, 0.2), look: at(-5.6, 1.0, 0) },
    { label: 'the poster wall', from: at(0, eye, -0.4), look: at(0, 1.8, 6) },
    { label: 'posters, close', from: at(-2.6, eye, 2.4), look: at(-2.2, 1.5, 5) },
    // Built from the pose the game actually uses, not from a lookAt: the whole
    // question this view answers is whether the model lands on the right.
    (() => {
      const view = world.wardrobeCamera;
      const from = at(view.position[0], view.position[1], view.position[2]);
      return {
        label: 'the wardrobe view',
        from,
        look: from
          .clone()
          .add(at(-Math.sin(view.yaw) * 4, Math.tan(view.pitch) * 4, -Math.cos(view.yaw) * 4)),
      };
    })(),
    { label: 'the difficulty lever', from: at(world.lever.x + 1.9, eye, world.lever.z + 0.5), look: at(world.lever.x, 0.9, world.lever.z) },
    { label: 'the minigame wall', from: at(2.6, eye, 2.6), look: at(6.0, 1.4, 2.1) },
    { label: 'overview', from: at(4.6, 3.0, 3.4), look: at(-2.0, 1.2, -1.2) },
  ];

  const ctx = sheetContext(views.length);
  const columns = Math.min(COLUMNS, views.length);
  let calls = 0;
  let triangles = 0;

  views.forEach((view, index) => {
    renderer.camera.position.copy(view.from);
    renderer.camera.lookAt(view.look);
    renderer.updateLights(1, view.from.x, view.from.z);
    renderer.render();
    calls = Math.max(calls, renderer.renderer.info.render.calls);
    triangles = Math.max(triangles, renderer.renderer.info.render.triangles);

    const x = (index % columns) * tileWidth;
    const y = HEADER + Math.floor(index / columns) * (tileHeight + LABEL);
    ctx.drawImage(renderer.renderer.domElement, x, y, tileWidth, tileHeight);
    caption(ctx, `${index + 1}. ${view.label}`, x, y + tileHeight, tileWidth, LABEL, '#9aa2bb');
  });

  caption(
    ctx,
    [
      'lobby.cabin',
      `${world.posters.length} poster slots`,
      `${calls} draws/scene`,
      `${(triangles / 1000).toFixed(1)}k tris`,
      `${world.lights.length} lights`,
      ...(exposureBoost === 1 ? [] : [`EXPOSURE x${exposureBoost}`]),
    ].join('  ·  '),
    0,
    0,
    ctx.canvas.width,
    HEADER,
    '#d8dcea',
  );

  const dataUrl = ctx.canvas.toDataURL('image/png');
  await write('lobby/cabin.png', dataUrl);

  const img = new Image();
  img.src = dataUrl;
  img.title = 'lobby/cabin.png';
  gallery.append(img);

  renderer.scene.remove(model.object);
  model.dispose?.();
  renderer.scene.remove(world.root);
  world.dispose();
  renderer.dispose();
  log(`  lobby/cabin.png  (${views.length} views, ${calls} draws, ${(triangles / 1000).toFixed(1)}k tris)`);
  log(save ? 'done — shots/lobby/' : 'done (save=off)');
  statusEl.classList.add('done');
}

/* --- run -------------------------------------------------------------------- */

async function run(): Promise<void> {
  if (mapId === 'lobby') {
    await shootLobby();
    return;
  }

  const config = configForMap(mapId);
  const entry = config.maps.maps[mapId];
  if (!entry) throw new Error(`no map "${mapId}" in config/maps.json`);
  const pack = getArtPack(entry.artPack);

  const renderer = new Renderer(canvas, config.graphics, config.player);
  renderer.renderer.toneMappingExposure = config.graphics.exposure * exposureBoost;
  renderer.renderer.setSize(tileWidth, tileHeight, false);
  renderer.camera.aspect = tileWidth / tileHeight;
  renderer.camera.updateProjectionMatrix();

  const { cellSize, ceilingHeight } = config.world.grid;
  const eyeHeight = config.player.body.standHeight + config.player.body.eyeHeightOffset;

  const wanted = only.length
    ? pack.rooms.filter((room) => only.includes(room.id) || only.includes(room.id.split('.')[1] ?? ''))
    : [...pack.rooms];
  if (!wanted.length) throw new Error(`no rooms matched "${only.join(',')}" in pack "${pack.id}"`);

  log(`${pack.id}: ${wanted.length} room(s), seed ${seed}, ${tileWidth}x${tileHeight} per view`);

  for (const blueprint of wanted) {
    const layout = layoutFor(blueprint, cellSize);
    const world = buildWorld(layout, pack, config.world, config.items);
    renderer.scene.add(world.root);
    renderer.setRoomLights(world.lights);

    const views = viewsFor(blueprint, cellSize, ceilingHeight, eyeHeight);
    const ctx = sheetContext(views.length);
    const columns = Math.min(COLUMNS, views.length);
    let calls = 0;
    let triangles = 0;

    views.forEach((view, index) => {
      renderer.camera.position.copy(view.from);
      renderer.camera.lookAt(view.look);
      // Same nearest-N light rule the game applies, and nothing culled by distance.
      renderer.updateLights(1, view.from.x, view.from.z);
      world.updateVisibility(view.from.x, view.from.z, 1e6);
      renderer.render();
      calls = Math.max(calls, renderer.renderer.info.render.calls);
      triangles = Math.max(triangles, renderer.renderer.info.render.triangles);

      const x = (index % columns) * tileWidth;
      const y = HEADER + Math.floor(index / columns) * (tileHeight + LABEL);
      // Copied in the same task as the render: the drawing buffer is not preserved.
      ctx.drawImage(renderer.renderer.domElement, x, y, tileWidth, tileHeight);
      caption(ctx, `${index + 1}. ${view.label}`, x, y + tileHeight, tileWidth, LABEL, '#9aa2bb');
    });

    const anchors = blueprint.anchors;
    const summary = [
      blueprint.id,
      `${blueprint.footprint.length} cell(s)`,
      `doors ${blueprint.doorWalls.map((wall) => wall.side[0]?.toUpperCase()).join('')}`,
      `chest ${anchors.chest?.length ?? 0}`,
      `locker ${anchors.locker?.length ?? 0}`,
      `item ${anchors.itemSpawn?.length ?? 0}`,
      `patrol ${anchors.patrolPoint?.length ?? 0}`,
      // Scene totals: the room PLUS every door, container and item in it, which
      // is why they run well above the per-room numbers `npm run validate:art`
      // reports. Shared art is not free.
      `${calls} draws/scene`,
      `${(triangles / 1000).toFixed(1)}k tris`,
      `${world.lights.length} lights`,
      ...(exposureBoost === 1 ? [] : [`EXPOSURE x${exposureBoost}`]),
    ].join('  ·  ');
    caption(ctx, summary, 0, 0, ctx.canvas.width, HEADER, '#d8dcea');

    const name = blueprint.id.split('.')[1] ?? blueprint.id;
    const file = `${pack.id}/${name}.png`;
    const dataUrl = ctx.canvas.toDataURL('image/png');
    await write(file, dataUrl);

    const img = new Image();
    img.src = dataUrl;
    img.title = file;
    gallery.append(img);

    renderer.scene.remove(world.root);
    world.dispose();
    log(`  ${file}  (${views.length} views, ${calls} draws, ${(triangles / 1000).toFixed(1)}k tris)`);
  }

  renderer.dispose();
  log(save ? `done — shots/${pack.id}/` : 'done (save=off)');
  statusEl.classList.add('done');
}

run().catch((error: unknown) => {
  log(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
  statusEl.classList.add('failed');
  console.error(error);
});
