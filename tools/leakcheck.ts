/**
 * Leak check — drives lobby → run → lobby cycles through the REAL scene code and
 * reports what each cycle left behind.
 *
 * Nothing here re-implements a teardown. It calls `buildLobbyScene()`,
 * `generate()`, `buildWorld()`, `Renderer.warmUp()` and the same three-step
 * teardown `Game.end()` / `Lobby.end()` do (remove from the scene, `dispose()`,
 * `clearGeometryCache()`), so a number that grows here grows in the game.
 *
 * The instrument is three.js's own monotonic ids: every `BufferGeometry`,
 * `Material` and `Texture` takes the next integer from a global counter, so the
 * count CREATED during a cycle is a subtraction, and `dispose()` is patched to
 * count the other side. Anything created and not disposed by the end of a cycle
 * is retained for as long as the tab is open — which is exactly the leak shape
 * that is invisible in `renderer.info`, because merged geometry is cloned into a
 * batch and never uploaded to the GPU.
 *
 * Usage:  /tools/leakcheck.html?map=abyss&cycles=8
 *   map      abyss | mansion | viscera            (default abyss)
 *   cycles   how many lobby→run→lobby round trips (default 8)
 *   seed     fixed base seed; each cycle uses seed+i (default 20260811)
 *   repeat   `1` to rebuild the SAME seed every cycle — a real cache reuses
 *            everything on a repeat, a growing one only grows on new seeds
 *   frames   camera poses sampled per run (default 48)
 *   lobby    `0` to skip the lobby half and cycle runs only
 *   rooms    `1` to also print a per-blueprint triangle/mesh breakdown of the
 *            first cycle's world, worst first — where a map's cost actually is
 *   props    `1` to attribute every batched triangle to the art function that
 *            added it, by stack frame. Slow, and only the first cycle; this is
 *            the one that says WHICH prop to spend the budget on.
 */
import * as THREE from 'three';
import { getArtPack } from '@art/packs/index';
import { clearGeometryCache } from '@art/lib/build';
import { MeshBatcher } from '@art/lib/merge';
import { configForRun, enabledMapIds, loadConfig, lobbyGraphics } from '@/config/index';
import { Renderer } from '@/render/Renderer';
import { generate } from '@/world/generation';
import { buildLobbyScene } from '@/world/lobbyScene';
import { buildWorld } from '@/world/worldBuilder';

/* --- options ---------------------------------------------------------------- */

const params = new URLSearchParams(location.search);
const mapId = params.get('map') ?? 'abyss';
const cycles = Number(params.get('cycles') ?? '8');
const baseSeed = Number(params.get('seed') ?? '20260811');
const repeatSeed = params.get('repeat') === '1';
const frames = Number(params.get('frames') ?? '48');
const withLobby = params.get('lobby') !== '0';
const withRooms = params.get('rooms') === '1';
const withProps = params.get('props') === '1';
/** Keeps a stack per geometry so a double free can name the call that did it first. */
const traceDisposal = params.get('trace') === '1';

const statusEl = document.getElementById('status') as HTMLElement;
const canvas = document.getElementById('shot-canvas') as HTMLCanvasElement;
const lines: string[] = [];

function log(line: string): void {
  lines.push(line);
  statusEl.textContent = lines.join('\n');
  console.info(`[leakcheck] ${line}`);
}

/** Lets the page paint between cycles, so a long run is watchable. */
const breathe = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/* --- the instrument ---------------------------------------------------------- */

/**
 * Live counts of the three things a scene allocates. `id` is three.js's global
 * counter, so a probe object reads how many have ever been made.
 */
interface Counts {
  geometries: number;
  materials: number;
  textures: number;
}

let disposedGeometries = 0;
let disposedMaterials = 0;
let disposedTextures = 0;
/**
 * Geometry ids seen by `dispose()` more than once. A cache entry handed to the
 * batcher with `consume: true` is freed while it is still in the cache, and
 * `clearGeometryCache()` then frees it again - so this is how that shows up.
 */
const seenDisposed = new Set<number>();
/** `?trace=1` only: where each geometry was first freed, so a double names its culprit. */
const firstDispose = new Map<number, string>();
let doubleDisposed = 0;

function patchDisposal(): void {
  const geo = THREE.BufferGeometry.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function (this: THREE.BufferGeometry): void {
    disposedGeometries++;
    if (seenDisposed.has(this.id)) {
      doubleDisposed++;
      // The FIRST dispose names the culprit - the second is always the cache
      // teardown finding a buffer somebody already freed.
      if (traceDisposal && doubleDisposed === 1) console.warn('[leakcheck] freed twice, first by:\n', firstDispose.get(this.id));
    } else {
      seenDisposed.add(this.id);
      if (traceDisposal) firstDispose.set(this.id, (new Error().stack ?? '').split('\n').slice(1, 6).join('\n'));
    }
    geo.call(this);
  };
  const mat = THREE.Material.prototype.dispose;
  THREE.Material.prototype.dispose = function (this: THREE.Material): void {
    disposedMaterials++;
    mat.call(this);
  };
  const tex = THREE.Texture.prototype.dispose;
  THREE.Texture.prototype.dispose = function (this: THREE.Texture): void {
    disposedTextures++;
    tex.call(this);
  };
}

/**
 * How many of each have ever been constructed. Reading it costs one throwaway of
 * each kind, which is why the probes are subtracted back out.
 */
let probes = 0;
function created(): Counts {
  probes++;
  return {
    geometries: new THREE.BufferGeometry().id - probes,
    // `Material.id` is real but undeclared in @types/three.
    materials: (new THREE.Material() as unknown as { id: number }).id - probes,
    textures: new THREE.Texture().id - probes,
  };
}

interface Sample {
  cycle: number;
  /** Created minus disposed over the cycle: what it left behind. */
  keptGeometries: number;
  keptMaterials: number;
  keptTextures: number;
  builtGeometries: number;
  buildMs: number;
  warmMs: number;
  frameMs: number;
  worstFrameMs: number;
  calls: number;
  triangles: number;
  avgCalls: number;
  avgTriangles: number;
  lights: number;
  castingLights: number;
  /** Geometries disposed more than once over the cycle: a cache freed by a `consume`. */
  doubleDisposed: number;
  /** `renderer.info` and the scene graph, for the GPU-side half of the picture. */
  gpuGeometries: number;
  gpuTextures: number;
  programs: number;
  sceneObjects: number;
  heapMB: number;
}

const samples: Sample[] = [];

function heapMB(): number {
  const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? memory.usedJSHeapSize / 1048576 : 0;
}

function countScene(scene: THREE.Scene): number {
  let n = 0;
  scene.traverse(() => {
    n++;
  });
  return n;
}

/* --- where a map's cost is ---------------------------------------------------- */

/**
 * Triangles and meshes under one object, however deep, with the see-through half
 * counted separately: a transparent surface is sorted, drawn after everything
 * else and pays for every pixel it covers whether or not it is behind something,
 * so it is the half that hurts a fill-rate-bound machine rather than a
 * geometry-bound one.
 */
interface Cost {
  triangles: number;
  meshes: number;
  clearTriangles: number;
  clearMeshes: number;
}

function costOf(object: THREE.Object3D): Cost {
  const cost: Cost = { triangles: 0, meshes: 0, clearTriangles: 0, clearMeshes: 0 };
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const index = mesh.geometry.getIndex();
    const position = mesh.geometry.getAttribute('position');
    const triangles = (index ? index.count : (position?.count ?? 0)) / 3;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    cost.meshes++;
    cost.triangles += triangles;
    if (material?.transparent) {
      cost.clearMeshes++;
      cost.clearTriangles += triangles;
    }
  });
  return cost;
}

/**
 * Per blueprint, summed over every instance the layout placed: what it costs to
 * DRAW one, and how many draws that takes. Culling decides how often you pay it;
 * this is the bill when you do.
 */
function roomReport(root: THREE.Group, blueprintIds: readonly string[]): string {
  const totals = new Map<string, Cost & { count: number }>();
  blueprintIds.forEach((id, index) => {
    const object = root.children[index];
    if (!object) return;
    const cost = costOf(object);
    const entry = totals.get(id) ?? { triangles: 0, meshes: 0, clearTriangles: 0, clearMeshes: 0, count: 0 };
    entry.triangles += cost.triangles;
    entry.meshes += cost.meshes;
    entry.clearTriangles += cost.clearTriangles;
    entry.clearMeshes += cost.clearMeshes;
    entry.count++;
    totals.set(id, entry);
  });

  const rows = [...totals.entries()]
    .map(([id, e]) => ({
      id,
      tris: e.triangles / e.count,
      meshes: e.meshes / e.count,
      clearTris: e.clearTriangles / e.count,
      clearMeshes: e.clearMeshes / e.count,
      count: e.count,
    }))
    .sort((a, b) => b.tris - a.tris);

  const total = rows.reduce((sum, r) => sum + r.tris * r.count, 0);
  const clearTotal = rows.reduce((sum, r) => sum + r.clearTris * r.count, 0);
  const head = ['room', 'x', 'tris/room', 'draws/room', 'see-through tris', 'draws'];
  const body = rows.map((r) => [
    r.id,
    String(r.count),
    r.tris.toFixed(0),
    r.meshes.toFixed(1),
    r.clearTris.toFixed(0),
    r.clearMeshes.toFixed(1),
  ]);
  const table = [head, ...body];
  const widths = head.map((_, i) => Math.max(...table.map((row) => row[i]!.length)));
  return (
    `\nper-room cost (${(total / 1000).toFixed(0)}k triangles standing in the whole map, ` +
    `${(clearTotal / 1000).toFixed(0)}k of them see-through):\n` +
    table.map((row) => row.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!))).join('  ')).join('\n')
  );
}

/* --- which art function spends the triangles ----------------------------------- */

/**
 * Every triangle handed to `MeshBatcher.add`, charged to the art function that
 * added it.
 *
 * The attribution is the call stack: `Room.box`, `Room.geo` and the kit's own
 * one-line wrappers are pass-throughs, so the interesting frame is the first one
 * that is neither. Stack text is engine-specific and this is a dev tool, so a
 * frame it cannot read is charged to `?` rather than guessed at.
 */
const propTriangles = new Map<string, { triangles: number; calls: number }>();
const PASS_THROUGH = /^(Room\.|MeshBatcher\.|add$|box$|geo$|solid$|post$|strut$)/;

function chargeCaller(triangles: number): void {
  const stack = (new Error().stack ?? '').split('\n').slice(2);
  let name = '?';
  for (const line of stack) {
    const match = /at ([\w.$]+) \(([^)]+)\)/.exec(line);
    if (!match) continue;
    const [, fn, where] = match as unknown as [string, string, string];
    if (!where.includes('/art/')) continue;
    if (PASS_THROUGH.test(fn)) continue;
    const file = /\/art\/(.+?):\d+:\d+$/.exec(where)?.[1] ?? '?';
    name = `${fn}  (${file})`;
    break;
  }
  const entry = propTriangles.get(name) ?? { triangles: 0, calls: 0 };
  entry.triangles += triangles;
  entry.calls++;
  propTriangles.set(name, entry);
}

function patchBatcher(): void {
  const add = MeshBatcher.prototype.add;
  MeshBatcher.prototype.add = function (
    this: MeshBatcher,
    material: THREE.Material,
    geometry: THREE.BufferGeometry,
    matrix: THREE.Matrix4,
    options?: Parameters<MeshBatcher['add']>[3],
  ): void {
    const index = geometry.getIndex();
    const position = geometry.getAttribute('position');
    chargeCaller((index ? index.count : (position?.count ?? 0)) / 3);
    add.call(this, material, geometry, matrix, options);
  };
}

function propReport(): string {
  const rows = [...propTriangles.entries()]
    .map(([name, e]) => ({ name, ...e }))
    .sort((a, b) => b.triangles - a.triangles)
    .slice(0, 30);
  const total = [...propTriangles.values()].reduce((sum, e) => sum + e.triangles, 0);

  const head = ['art function', 'ktris', '% of map', 'calls', 'tris/call'];
  const body = rows.map((r) => [
    r.name,
    (r.triangles / 1000).toFixed(1),
    `${((r.triangles / total) * 100).toFixed(1)}%`,
    String(r.calls),
    (r.triangles / r.calls).toFixed(0),
  ]);
  const table = [head, ...body];
  const widths = head.map((_, i) => Math.max(...table.map((row) => row[i]!.length)));
  return (
    `\ntriangles by the art function that added them (${(total / 1000).toFixed(0)}k batched):\n` +
    table.map((row) => row.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!))).join('  ')).join('\n')
  );
}

/* --- one cycle --------------------------------------------------------------- */

async function runCycle(renderer: Renderer, cycle: number): Promise<Sample> {
  const before = created();
  const disposedBefore = { g: disposedGeometries, m: disposedMaterials, t: disposedTextures };
  const doubleBefore = doubleDisposed;

  // --- the lobby half ---------------------------------------------------------
  if (withLobby) {
    renderer.applyGraphics(lobbyGraphics());
    const lobby = buildLobbyScene(loadConfig(), enabledMapIds());
    renderer.scene.add(lobby.root);
    renderer.setRoomLights(lobby.lights);
    renderer.render();

    renderer.scene.remove(lobby.root);
    lobby.dispose();
    renderer.setRoomLights([]);
    clearGeometryCache();
  }

  // --- the run half -----------------------------------------------------------
  const seed = repeatSeed ? baseSeed : baseSeed + cycle;
  const config = configForRun(mapId, config0.difficulty.default);
  renderer.applyGraphics(config.graphics);

  const pack = getArtPack(config.maps.maps[mapId]?.artPack ?? mapId);
  const archetype = config.enemy.archetypes[config.enemy.defaultArchetype];
  if (!archetype) throw new Error(`no enemy archetype "${config.enemy.defaultArchetype}"`);

  const buildStart = performance.now();
  const layout = generate(mapId, seed, config.world, pack.rooms, archetype.spawn);
  const world = buildWorld(layout, pack, config.world, config.items, config.graphics);
  const buildMs = performance.now() - buildStart;
  const afterBuild = created();

  renderer.scene.add(world.root);
  const spawn = layout.playerSpawns[0]!;
  renderer.setRoomLights(world.lights, spawn.position[0], spawn.position[2]);

  const warmStart = performance.now();
  await renderer.warmUp();
  const warmMs = performance.now() - warmStart;

  // --- a walk through the map -------------------------------------------------
  // Every door open, which is the expensive end of the run (RENDERING.md §3), and
  // the same poses every cycle so frame cost is comparable.
  for (const door of world.doors) {
    door.open = true;
    door.progress = 1;
  }

  const eye = config.player.body.standHeight + config.player.body.eyeHeightOffset;
  const cells = layout.cells;
  let total = 0;
  let worst = 0;
  let calls = 0;
  let triangles = 0;
  let sumCalls = 0;
  let sumTriangles = 0;

  for (let i = 0; i < frames; i++) {
    const cell = cells[Math.floor((i / frames) * cells.length)]!;
    const yaw = (i / frames) * Math.PI * 8;
    const x = cell.cell[0] * config.world.grid.cellSize;
    const z = cell.cell[1] * config.world.grid.cellSize;

    renderer.camera.position.set(x, eye, z);
    renderer.camera.rotation.set(0, yaw, 0, 'YXZ');
    renderer.camera.updateMatrixWorld(true);

    const start = performance.now();
    world.updateVisibility(renderer.camera, x, z, config.graphics.renderDistanceRooms);
    renderer.updateLights(1 / 60, x, z);
    renderer.render();
    // The GPU is a pipe behind this, so the number is CPU frame cost. It is the
    // one that grows when something is being walked that should not be.
    const ms = performance.now() - start;
    total += ms;
    worst = Math.max(worst, ms);
    calls = Math.max(calls, renderer.renderer.info.render.calls);
    triangles = Math.max(triangles, renderer.renderer.info.render.triangles);
    sumCalls += renderer.renderer.info.render.calls;
    sumTriangles += renderer.renderer.info.render.triangles;
  }

  if (withRooms && cycle === 0) {
    log(roomReport(world.root, layout.rooms.map((placed) => placed.blueprintId)));
  }
  if (withProps && cycle === 0) log(propReport());

  const gpuGeometries = renderer.renderer.info.memory.geometries;
  const gpuTextures = renderer.renderer.info.memory.textures;
  const programs = renderer.renderer.info.programs?.length ?? 0;
  const sceneObjects = countScene(renderer.scene);

  // --- teardown, exactly as Game.end() does it --------------------------------
  renderer.scene.remove(world.root);
  world.dispose();
  renderer.setRoomLights([]);
  clearGeometryCache();

  const after = created();
  return {
    cycle,
    keptGeometries: after.geometries - before.geometries - (disposedGeometries - disposedBefore.g),
    keptMaterials: after.materials - before.materials - (disposedMaterials - disposedBefore.m),
    keptTextures: after.textures - before.textures - (disposedTextures - disposedBefore.t),
    builtGeometries: afterBuild.geometries - before.geometries,
    buildMs,
    warmMs,
    frameMs: total / frames,
    worstFrameMs: worst,
    calls,
    triangles,
    avgCalls: sumCalls / frames,
    avgTriangles: sumTriangles / frames,
    lights: world.lights.length,
    castingLights: world.lights.filter((entry) => entry.light.castShadow).length,
    doubleDisposed: doubleDisposed - doubleBefore,
    gpuGeometries,
    gpuTextures,
    programs,
    sceneObjects,
    heapMB: heapMB(),
  };
}

/* --- report ------------------------------------------------------------------ */

const COLUMNS: { head: string; of(sample: Sample): string }[] = [
  { head: 'cyc', of: (s) => String(s.cycle) },
  { head: 'kept geo', of: (s) => String(s.keptGeometries) },
  { head: 'kept mat', of: (s) => String(s.keptMaterials) },
  { head: 'kept tex', of: (s) => String(s.keptTextures) },
  { head: 'built geo', of: (s) => String(s.builtGeometries) },
  { head: 'build ms', of: (s) => s.buildMs.toFixed(0) },
  { head: 'warm ms', of: (s) => s.warmMs.toFixed(0) },
  { head: 'frame ms', of: (s) => s.frameMs.toFixed(2) },
  { head: 'worst ms', of: (s) => s.worstFrameMs.toFixed(1) },
  { head: 'draws~', of: (s) => s.avgCalls.toFixed(0) },
  { head: 'draws^', of: (s) => String(s.calls) },
  { head: 'ktris~', of: (s) => (s.avgTriangles / 1000).toFixed(1) },
  { head: 'ktris^', of: (s) => (s.triangles / 1000).toFixed(1) },
  { head: 'lights', of: (s) => `${s.castingLights}/${s.lights}` },
  { head: '2xfree', of: (s) => String(s.doubleDisposed) },
  { head: 'gpu geo', of: (s) => String(s.gpuGeometries) },
  { head: 'gpu tex', of: (s) => String(s.gpuTextures) },
  { head: 'progs', of: (s) => String(s.programs) },
  { head: 'objs', of: (s) => String(s.sceneObjects) },
  { head: 'heap MB', of: (s) => s.heapMB.toFixed(1) },
];

function table(): string {
  const rows = [COLUMNS.map((c) => c.head), ...samples.map((s) => COLUMNS.map((c) => c.of(s)))];
  const widths = COLUMNS.map((_, i) => Math.max(...rows.map((row) => row[i]!.length)));
  return rows.map((row) => row.map((cell, i) => cell.padStart(widths[i]!)).join('  ')).join('\n');
}

/* --- main -------------------------------------------------------------------- */

const config0 = loadConfig();

async function main(): Promise<void> {
  patchDisposal();
  if (withProps) patchBatcher();
  log(`map=${mapId} cycles=${cycles} frames=${frames} seed=${repeatSeed ? `${baseSeed} (repeated)` : `${baseSeed}+i`} lobby=${withLobby}`);

  const renderer = new Renderer(canvas, configForRun(mapId, config0.difficulty.default).graphics, config0.player);
  renderer.renderer.setSize(640, 400, false);
  renderer.camera.aspect = 640 / 400;
  renderer.camera.updateProjectionMatrix();

  for (let cycle = 0; cycle < cycles; cycle++) {
    samples.push(await runCycle(renderer, cycle));
    statusEl.textContent = `${lines.join('\n')}\n\n${table()}`;
    await breathe();
  }

  // Cycle 0 pays every one-off (procedural textures, first compile), so the
  // trend that matters starts at cycle 1.
  const rest = samples.slice(1);
  const first = rest[0] ?? samples[0]!;
  const last = samples[samples.length - 1]!;
  const mean = (of: (sample: Sample) => number): number =>
    rest.reduce((sum, s) => sum + of(s), 0) / Math.max(1, rest.length);

  // Heap sawtooths between collections, so the difference between two arbitrary
  // cycles says nothing. What retention would move is the FLOOR - the lowest
  // reading seen, which is the closest thing here to a post-GC measurement.
  const floorEarly = Math.min(...rest.slice(0, Math.ceil(rest.length / 2)).map((s) => s.heapMB));
  const floorLate = Math.min(...rest.slice(Math.floor(rest.length / 2)).map((s) => s.heapMB));

  log('');
  log(
    `over cycles ${first.cycle}..${last.cycle}:  ` +
      `kept geo/cycle ${mean((s) => s.keptGeometries).toFixed(1)}  ` +
      `kept mat/cycle ${mean((s) => s.keptMaterials).toFixed(1)}  ` +
      `freed twice/cycle ${mean((s) => s.doubleDisposed).toFixed(1)}\n` +
      `                heap floor ${floorEarly.toFixed(0)} -> ${floorLate.toFixed(0)} MB  ` +
      `frame ${first.frameMs.toFixed(2)} -> ${last.frameMs.toFixed(2)} ms  ` +
      `gpu geo ${first.gpuGeometries} -> ${last.gpuGeometries}  ` +
      `programs ${first.programs} -> ${last.programs}`,
  );
  statusEl.textContent = `${lines.join('\n')}\n\n${table()}`;
  statusEl.className = 'done';
}

void main().catch((error: unknown) => {
  log(`FAILED: ${error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)}`);
  statusEl.className = 'failed';
});
