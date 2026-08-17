/**
 * Frame cost — what a map costs to DRAW, and which setting is buying it.
 *
 * `leakcheck.ts` answers "what did a run leave behind" and reports CPU time at a
 * postage-stamp resolution, which is the right instrument for a leak and the
 * wrong one for a slow machine: nothing in this game is CPU-bound in the render
 * step. This tool renders the real maps at a real window size and measures the
 * whole pipeline, then changes ONE setting at a time and measures again — so the
 * output is not "abyss is slow", it is "abyss is slow and two thirds of it is
 * fragment work you can buy back with a resolution scale".
 *
 * Two numbers per variant:
 *
 * - **frame** — the headline. A block of frames is submitted with no
 *   synchronisation at all and drained once at the end, so the elapsed time
 *   divided by the frame count is whatever the pipeline's actual limiter is:
 *   fragment work if the GPU is the bottleneck, submission if the CPU is. It is
 *   the number that predicts a frame rate.
 * - **cpu** — how long `render()` itself took, summed. Draw-call submission,
 *   which is what a weak CPU runs out of first. When `frame` is well above
 *   `cpu` the map is GPU-bound and a resolution scale will buy something; when
 *   the two are close it is draw-call-bound and only culling and batching will.
 *
 * `EXT_disjoint_timer_query_webgl2` was the obvious instrument and it is not
 * usable: Chrome quantises the results, and at 1080p on a fast card the whole
 * frame lands inside one quantum — the first version of this tool reported a
 * 50 % render scale as five times SLOWER than full resolution. Timing a block
 * of unsynchronised frames has no such floor.
 *
 * **Variants are interleaved, not run in sequence.** Measured in order, the
 * first run of this tool reported a 50 % render scale as 118 % SLOWER than
 * full resolution — which is drift, not a result: a browser tab warms up, the
 * machine picks up other work, and a table of one-shot measurements taken over
 * a minute reads as a ramp. Each round measures every variant once and the
 * report is the MEDIAN across rounds, so a slow patch of wall clock lands on
 * all of them or on none.
 *
 * A fast card is also its own problem: at 1080p an RTX 4070 draws the worst map
 * here in a third of a millisecond, and everything looks free. Run it at
 * `?w=3840&h=2160` as well — the variants that grow with the pixel count are
 * the fragment-bound ones, and those are exactly the ones a weak GPU feels.
 *
 * Usage:  /tools/perf.html?map=abyss&w=1920&h=1080
 *   map        one map id, or `all` (default all five shipping maps)
 *   variants   comma-separated (default `all`). One row per knob in VARIANTS
 *              below, plus a `tier:<id>` row per shipping quality tier
 *   poses      camera poses sampled per variant per round (default 32)
 *   rounds     how many times the whole variant set is measured (default 3)
 *   w, h       drawing buffer size before the scale variants (default 1920x1080)
 *   seed       fixed layout seed (default 20260811)
 *   doors      `closed` to measure with every door shut (default open — the
 *              expensive end of a run, see docs/systems/RENDERING.md §3)
 *   worst      `1` to also print the five most expensive poses of the baseline
 *   verify     `1` to skip the timing entirely and check that culling is EXACT
 *   shot       `diff`, with `verify=1`: paint the worst pose and pick out in
 *              RED everything culling removed from it
 *
 * ## verify
 *
 * Culling that is merely fast is worthless; it has to hide only things nobody
 * can see. `?verify=1` renders every pose with the whole map visible and again
 * as the culler leaves it, counts the pixels that differ, and then — at the
 * worst pose — puts each room back on its own to name the ones responsible.
 *
 * Two things have to be held still first or the number is meaningless, and both
 * cost hours to find. Rooms animate off `onBeforeRender`, so a culled room's
 * clock is frozen where it was last drawn and some of that motion moves a LAMP;
 * shadow maps are rendered from whatever is visible. Reveal a room and both
 * change the lighting of rooms you could see all along, which reads as culling
 * having hidden something. So the ticks are silenced and `shadowMap.autoUpdate`
 * is turned off for the whole check.
 *
 * Where it currently stands, at 32 poses with every door open:
 *
 *   mansion 0.000 %   viscera 0.002 %   abyss 0.085 %
 *
 * Abyss is not zero and that predates any of this: there are sight lines in
 * Kerberos Deep that the room graph does not describe. It is the reason the
 * culler still assumes an unreserved wall might be a window rather than
 * trusting `BuiltRoom.seeThrough` outright — see `src/world/visibility.ts`.
 */
import * as THREE from 'three';
import { getArtPack } from '@art/packs/index';
import { clearGeometryCache } from '@art/lib/build';
import { configForRun, deepMerge, loadConfig } from '@/config/index';
import type { GraphicsConfig } from '@/config/types';
import { Renderer } from '@/render/Renderer';
import { generate } from '@/world/generation';
import { buildWorld } from '@/world/worldBuilder';

/* --- options ---------------------------------------------------------------- */

const params = new URLSearchParams(location.search);
const config0 = loadConfig();
const ALL_MAPS = ['mansion', 'viscera', 'abyss', 'crypt', 'forge'];
const maps = params.get('map') && params.get('map') !== 'all' ? [params.get('map')!] : ALL_MAPS;
const poses = Number(params.get('poses') ?? '32');
const rounds = Number(params.get('rounds') ?? '3');
const width = Number(params.get('w') ?? '1920');
const height = Number(params.get('h') ?? '1080');
const seed = Number(params.get('seed') ?? '20260811');
const doorsOpen = params.get('doors') !== 'closed';
const showWorst = params.get('worst') === '1';
const verifying = params.get('verify') === '1';

const statusEl = document.getElementById('status') as HTMLElement;
const lines: string[] = [];

function log(line: string): void {
  lines.push(line);
  statusEl.textContent = lines.join('\n');
  console.info(`[perf] ${line}`);
}

const breathe = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/* --- the variants ------------------------------------------------------------- */

/**
 * One knob each, all measured against the same world, so the difference between
 * a row and `base` is the whole cost of that knob and nothing else.
 *
 * `scale` is the drawing-buffer multiplier (a render-resolution setting);
 * everything else is a `graphics.json` overlay.
 */
interface Variant {
  id: string;
  note: string;
  scale?: number;
  antialias?: boolean;
  patch?(graphics: GraphicsConfig): GraphicsConfig;
}

const VARIANTS: Variant[] = [
  { id: 'base', note: 'as shipped' },
  { id: 'noAA', note: 'antialias off', antialias: false },
  { id: 'scale75', note: '75 % render scale', scale: 0.75 },
  { id: 'scale50', note: '50 % render scale', scale: 0.5 },
  {
    id: 'noShadows',
    note: 'shadow maps off',
    patch: (g) => ({ ...g, shadows: { ...g.shadows, enabled: false } }),
  },
  {
    id: 'cast1',
    note: '1 shadow caster instead of 2',
    patch: (g) => ({ ...g, shadows: { ...g.shadows, maxCastingLights: 1 } }),
  },
  {
    id: 'lights4',
    note: '4 active lights instead of 6',
    patch: (g) => ({ ...g, maxActiveLights: 4 }),
  },
  {
    id: 'lights3cast1',
    note: '3 active, 1 caster',
    patch: (g) => ({ ...g, maxActiveLights: 3, shadows: { ...g.shadows, maxCastingLights: 1 } }),
  },
  {
    id: 'dist2',
    note: 'render distance 2 rooms instead of 3',
    patch: (g) => ({ ...g, renderDistanceRooms: 2 }),
  },
  // `culling.enabled` is deliberately absent: `PortalVisibility` is handed its
  // config when the world is BUILT, so a variant cannot switch it off. What
  // culling is worth is measured in docs/systems/RENDERING.md §3 instead.
];

/**
 * One row per shipping quality tier, built from `graphics.json -> quality.tiers`
 * rather than from a list here - so what this measures is what a player gets,
 * and a tier added to config turns up in the table without touching this file.
 *
 * `scale` is read off the tier's own `pixelRatioCap`, because a drawing buffer
 * is sized by the renderer and not by the graphics block the culler sees.
 */
function tierVariants(): Variant[] {
  const graphics = config0.graphics;
  return Object.entries(graphics.quality?.tiers ?? {}).map(([id, tier]) => ({
    id: `tier:${id}`,
    note: `quality tier "${id}"`,
    scale: Math.min(devicePixelRatio, (tier.pixelRatioCap as number | undefined) ?? graphics.pixelRatioCap),
    patch: (g) => deepMerge(g, tier),
  }));
}

const wanted = params.get('variants');
const ALL = [...VARIANTS, ...tierVariants()];
const variants = wanted && wanted !== 'all' ? ALL.filter((v) => wanted.split(',').includes(v.id)) : ALL;

/* --- the instrument ------------------------------------------------------------ */

/** Forces the driver to finish everything submitted. One pixel is enough. */
function drain(gl: WebGL2RenderingContext, pixel: Uint8Array): void {
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
}

const mean = (values: number[]): number =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

/** The frame a player actually notices is not the average one. */
function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;
}

const median = (values: number[]): number => percentile(values, 0.5);

/* --- one measurement ------------------------------------------------------------ */

/** What one round of one variant produced. Rounds are combined by median. */
interface Batch {
  frame: number;
  cpu: number;
  draws: number;
  triangles: number;
  worst: { ms: number; cell: [number, number] }[];
}

interface Row {
  variant: string;
  note: string;
  frame: number;
  cpu: number;
  draws: number;
  ktris: number;
  pixels: number;
  worst: { ms: number; cell: [number, number] }[];
}

/** A world, plus everything a measurement needs to drive it. */
interface Subject {
  world: ReturnType<typeof buildWorld>;
  cells: readonly { cell: readonly [number, number] }[];
  cellSize: number;
  eye: number;
  spawn: readonly [number, number];
  graphics: GraphicsConfig;
  /** Each placed room, in the order they were added to `root`. */
  rooms: readonly { id: string; cells: readonly (readonly [number, number])[]; doors: readonly string[] }[];
}

/** The graphics block and drawing-buffer scale a variant asks for. */
function settingsFor(subject: Subject, variant: Variant): { graphics: GraphicsConfig; scale: number } {
  return {
    graphics: variant.patch ? variant.patch(subject.graphics) : subject.graphics,
    scale: variant.scale ?? 1,
  };
}

async function measureOnce(renderer: Renderer, subject: Subject, variant: Variant): Promise<Batch> {
  const { graphics, scale } = settingsFor(subject, variant);

  renderer.applyGraphics(graphics);
  renderer.setShadows(graphics.shadows.enabled);
  renderer.renderer.setPixelRatio(scale);
  renderer.renderer.setSize(width, height, false);
  renderer.camera.aspect = width / height;
  renderer.camera.updateProjectionMatrix();

  renderer.scene.add(subject.world.root);
  renderer.setRoomLights(subject.world.lights, subject.spawn[0], subject.spawn[1]);
  // Compiles the exact programs this variant's light counts need, and bakes the
  // shadow maps, so none of that lands inside the walk. Cheap after the first
  // round: three.js caches the programs and the art's shadows never update.
  await renderer.warmUp();

  const gl = renderer.renderer.getContext() as WebGL2RenderingContext;
  const pixel = new Uint8Array(4);
  const perPose: { ms: number; cell: [number, number] }[] = [];
  let cpuTotal = 0;
  let draws = 0;
  let triangles = 0;
  let blockMs = 0;

  // Two passes: the first is thrown away. The frame after a warm-up still pays
  // first-use costs the driver defers - texture residency, pipeline state.
  for (let pass = 0; pass < 2; pass++) {
    drain(gl, pixel);
    const blockStart = performance.now();

    for (let i = 0; i < poses; i++) {
      const entry = subject.cells[Math.floor((i / poses) * subject.cells.length)]!;
      const x = entry.cell[0] * subject.cellSize;
      const z = entry.cell[1] * subject.cellSize;
      const yaw = (i / poses) * Math.PI * 8;

      renderer.camera.position.set(x, subject.eye, z);
      renderer.camera.rotation.set(0, yaw, 0, 'YXZ');
      renderer.camera.updateMatrixWorld(true);

      // METRES. `renderDistanceRooms` is a room count and the game multiplies
      // it by the cell size before it gets here.
      subject.world.updateVisibility(renderer.camera, x, z, graphics.renderDistanceRooms * subject.cellSize);
      renderer.updateLights(1 / 60, x, z);

      const start = performance.now();
      renderer.render();
      const submitMs = performance.now() - start;

      if (pass === 1) {
        cpuTotal += submitMs;
        perPose.push({ ms: submitMs, cell: [entry.cell[0], entry.cell[1]] });
        draws += renderer.renderer.info.render.calls;
        triangles += renderer.renderer.info.render.triangles;
      }
    }

    // The one synchronisation in the whole block. Everything above was
    // submitted without waiting, so this is where the GPU finishes catching up
    // and the elapsed time becomes the pipeline's real throughput.
    drain(gl, pixel);
    if (pass === 1) blockMs = performance.now() - blockStart;
  }

  renderer.scene.remove(subject.world.root);
  renderer.setRoomLights([]);

  return {
    frame: blockMs / poses,
    cpu: cpuTotal / poses,
    draws: draws / poses,
    triangles: triangles / poses,
    worst: perPose.sort((a, b) => b.ms - a.ms).slice(0, 5),
  };
}

/** Every variant, `rounds` times, interleaved. See the header — order is drift. */
async function measureAll(
  pick: (variant: Variant) => Renderer,
  subject: Subject,
  onProgress: (rows: Row[]) => void,
): Promise<Row[]> {
  const batches = new Map<string, Batch[]>(variants.map((v) => [v.id, []]));

  for (let round = 0; round < rounds; round++) {
    for (const variant of variants) {
      batches.get(variant.id)!.push(await measureOnce(pick(variant), subject, variant));
      onProgress(rowsFrom(batches));
      await breathe();
    }
  }
  return rowsFrom(batches);
}

function rowsFrom(batches: Map<string, Batch[]>): Row[] {
  const rows: Row[] = [];
  for (const variant of variants) {
    const taken = batches.get(variant.id) ?? [];
    if (!taken.length) continue;
    const scale = variant.scale ?? 1;
    rows.push({
      variant: variant.id,
      note: variant.note,
      frame: median(taken.map((b) => b.frame)),
      cpu: median(taken.map((b) => b.cpu)),
      draws: median(taken.map((b) => b.draws)),
      ktris: median(taken.map((b) => b.triangles)) / 1000,
      pixels: (width * scale * height * scale) / 1e6,
      worst: taken[0]!.worst,
    });
  }
  return rows;
}

/* --- is the culling exact? -------------------------------------------------------- */

/** A channel has to move by more than this to count. Below it is dithering. */
const DIFFERENT = 8;

function differingPixels(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (
      Math.abs(a[i]! - b[i]!) > DIFFERENT ||
      Math.abs(a[i + 1]! - b[i + 1]!) > DIFFERENT ||
      Math.abs(a[i + 2]! - b[i + 2]!) > DIFFERENT
    ) {
      n++;
    }
  }
  return n / 4;
}

/**
 * Renders every pose culled, culled again, and with the whole map forced
 * visible, and reports how much of the frame culling actually changed once the
 * art's own animation is accounted for.
 */
async function verify(renderer: Renderer, subject: Subject): Promise<string> {
  renderer.applyGraphics(subject.graphics);
  renderer.setShadows(subject.graphics.shadows.enabled);
  renderer.renderer.setPixelRatio(1);
  // Small on purpose: three readbacks a pose, and a culling mistake is a whole
  // room appearing or vanishing, not a pixel.
  const w = 640;
  const h = 360;
  renderer.renderer.setSize(w, h, false);
  renderer.camera.aspect = w / h;
  renderer.camera.updateProjectionMatrix();

  renderer.scene.add(subject.world.root);
  renderer.setRoomLights(subject.world.lights, subject.spawn[0], subject.spawn[1]);
  // Back ON for the warm-up, because the check below turns it off and this
  // renderer is reused for the next map. Left off, `warmUp()` bakes nothing and
  // every map after the first is measured with another map's shadows.
  renderer.renderer.shadowMap.autoUpdate = true;
  await renderer.warmUp();

  const gl = renderer.renderer.getContext() as WebGL2RenderingContext;
  const grab = (into: Uint8Array): void => {
    renderer.render();
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, into);
  };

  const culledA = new Uint8Array(w * h * 4);
  const culledB = new Uint8Array(w * h * 4);
  const forced = new Uint8Array(w * h * 4);
  const total = w * h;

  let motion = 0;
  let culling = 0;
  let worstPose = { fraction: 0, index: 0, cell: [0, 0] as [number, number], yaw: 0 };

  const poseAt = (i: number): { x: number; z: number; cell: [number, number] } => {
    const entry = subject.cells[Math.floor((i / poses) * subject.cells.length)]!;
    return {
      x: entry.cell[0] * subject.cellSize,
      z: entry.cell[1] * subject.cellSize,
      cell: [entry.cell[0], entry.cell[1]],
    };
  };

  const look = (i: number): void => {
    const { x, z } = poseAt(i);
    renderer.camera.position.set(x, subject.eye, z);
    renderer.camera.rotation.set(0, (i / poses) * Math.PI * 8, 0, 'YXZ');
    renderer.camera.updateMatrixWorld(true);
    subject.world.updateVisibility(renderer.camera, x, z, subject.graphics.renderDistanceRooms * subject.cellSize);
  };

  const showEverything = (): void => {
    subject.world.root.traverse((object) => {
      object.visible = true;
    });
  };

  /*
   * Silence every room's cosmetic animation for the whole check.
   *
   * A room's motion runs off `onBeforeRender`, so a culled room's clock is
   * frozen at whatever second it was last drawn - and some of that motion moves
   * a LAMP. Reveal a room that has been frozen and its lamp jumps, relighting
   * rooms all over the map, which reads as culling having hidden something when
   * it has hidden nothing at all. Nothing here is measuring animation, so the
   * honest thing is to stop it: with the ticks gone, the only difference
   * between two frames is what was drawn.
   */
  subject.world.root.traverse((object) => {
    object.onBeforeRender = (): void => {};
  });

  /*
   * And freeze the shadow maps, for the same reason.
   *
   * A shadow map is rendered from the scene as it stands, so revealing a room
   * changes what casts into every active caster's cube - and the shading of
   * rooms you CAN see moves with it. That is a real difference in the picture
   * and it is not culling hiding anything; the maps are baked once at
   * `warmUp()` and the art turns `autoUpdate` off per lamp precisely so they
   * stay baked.
   */
  renderer.renderer.shadowMap.autoUpdate = false;

  for (let i = 0; i < poses; i++) {
    look(i);

    /*
     * The forced frame comes FIRST, and twice.
     *
     * A room's cosmetic motion runs off `onBeforeRender`, so a culled room's
     * animation is frozen at whatever second it was last drawn - and some of
     * that motion moves a LAMP (`sway()` rewrites a chandelier's position every
     * frame). Reveal a room that has been frozen for a minute and its lamp
     * jumps, which relights rooms all over the map. Measured the naive way that
     * reads as culling hiding something, and it was worth 1.4 % of the frame on
     * Kerberos Deep - none of it anything you could see.
     *
     * So: show everything, draw once to let every frozen tick catch up to now,
     * and only then take the reference. The culled frame that follows inherits
     * those settled positions, and what is left between them is what culling
     * actually removed from the picture.
     */
    showEverything();
    grab(forced);
    showEverything();
    grab(forced);

    look(i);
    grab(culledA);
    grab(culledB);

    const noise = differingPixels(culledA, culledB);
    const changed = differingPixels(culledB, forced);
    motion += noise;
    culling += changed;
    const fraction = Math.max(0, changed - noise) / total;
    if (fraction > worstPose.fraction) worstPose = { fraction, index: i, cell: poseAt(i).cell, yaw: (i / poses) * Math.PI * 8 };
  }

  // Name the culprit. At the worst pose, put each room back on its own: the
  // ones that change the frame are the ones culling should not have hidden.
  const blamed: string[] = [];
  if (worstPose.fraction > 0.0005) {
    look(worstPose.index);
    grab(culledA);

    const standingIn = subject.rooms.find((room) =>
      room.cells.some((cell) => cell[0] === worstPose.cell[0] && cell[1] === worstPose.cell[1]),
    );
    const heading = (((worstPose.yaw * 180) / Math.PI) % 360).toFixed(0);
    blamed.push(
      `\n    [camera in ${standingIn?.id ?? '?'}, doors ${standingIn?.doors.join(' ') ?? '?'}, ` +
        `yaw ${heading} deg — 0 looks north (-z), 90 looks west (-x)]`,
    );

    /*
     * What is actually between the camera and the rooms it cannot see.
     *
     * The eye is a poor instrument for this: a dark rock wall three metres away
     * and no wall at all both photograph as black. A ray does not care how
     * brightly lit the thing it hits is, so this says whether the wall is
     * THERE - and if it is, the missing rooms cannot be a culling mistake at
     * all and the fault is somewhere else entirely.
     */
    showEverything();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), renderer.camera);
    const ownerOf = (hit: THREE.Object3D): string => {
      for (let node: THREE.Object3D | null = hit; node; node = node.parent) {
        const index = subject.world.root.children.indexOf(node);
        if (index >= 0) return subject.rooms[index]?.id ?? `child ${index}`;
      }
      return '?';
    };
    const hits = raycaster
      .intersectObject(subject.world.root, true)
      .slice(0, 6)
      .map((hit) => `${hit.distance.toFixed(2)}m ${ownerOf(hit.object)}`);
    blamed.push(`\n    [down the crosshair: ${hits.join(' | ') || 'NOTHING AT ALL'}]`);
    look(worstPose.index);
    grab(culledA);

    for (const [index, room] of subject.rooms.entries()) {
      const object = subject.world.root.children[index];
      if (!object) continue;
      // Same settling rule as above: draw it once so its frozen tick catches
      // up, and only then ask whether it is putting anything on the screen.
      object.traverse((node) => {
        node.visible = true;
      });
      grab(culledB);
      object.traverse((node) => {
        node.visible = true;
      });
      grab(culledB);
      const changed = differingPixels(culledA, culledB) / total;
      look(worstPose.index);
      grab(culledA);
      if (changed > 0.0005) {
        const cells = room.cells.map((cell) => `${cell[0]},${cell[1]}`).join(' ');
        const box = new THREE.Box3().setFromObject(object);
        const span = `x ${box.min.x.toFixed(1)}..${box.max.x.toFixed(1)}  z ${box.min.z.toFixed(1)}..${box.max.z.toFixed(1)}`;
        blamed.push(
          `\n    ${room.id} ${(changed * 100).toFixed(2)}%  cells=[${cells}]  doors=[${room.doors.join(' ')}]  box ${span}`,
        );
      }
    }
  }

  /*
   * `?shot=diff` paints the worst pose with everything culling removed picked
   * out in red. A number says how much the culler got wrong; this says WHERE,
   * and the shape of it is the diagnosis - a rectangle is a doorway the flood
   * did not step through, a whole half of the screen is a wall that is not
   * being drawn at all.
   */
  if (params.get('shot') === 'diff') {
    look(worstPose.index);
    grab(culledA);
    showEverything();
    grab(forced);

    // Flipped on the way out: `readPixels` counts rows from the bottom of the
    // framebuffer and a canvas counts them from the top.
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const from = ((h - 1 - y) * w + x) * 4;
        const to = (y * w + x) * 4;
        const lost =
          Math.abs(culledA[from]! - forced[from]!) > DIFFERENT ||
          Math.abs(culledA[from + 1]! - forced[from + 1]!) > DIFFERENT ||
          Math.abs(culledA[from + 2]! - forced[from + 2]!) > DIFFERENT;
        image.data[to] = lost ? 255 : forced[from]!;
        image.data[to + 1] = lost ? 0 : forced[from + 1]!;
        image.data[to + 2] = lost ? 0 : forced[from + 2]!;
        image.data[to + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    document.body.append(canvas);
    return 'red is what culling removed, over the frame it removed it from';
  }

  renderer.scene.remove(subject.world.root);
  renderer.setRoomLights([]);

  const pct = (n: number): string => `${((n / (poses * total)) * 100).toFixed(3)} %`;
  return (
    `culling vs everything visible: ${pct(culling)} of pixels differ, of which ${pct(motion)} is the art's own ` +
    `animation between two identical frames.\n  worst pose [${worstPose.cell}] at ` +
    `${(worstPose.fraction * 100).toFixed(3)} % over that floor.` +
    (blamed.length ? `\n  wrongly hidden there (camera at [${worstPose.cell}]):${blamed.join('')}` : '')
  );
}

/* --- report --------------------------------------------------------------------- */

function table(rows: Row[]): string {
  const base = rows.find((row) => row.variant === 'base');
  const head = ['variant', 'frame ms', 'vs base', 'cpu ms', 'draws', 'ktris', 'Mpx', 'what'];
  const body = rows.map((r) => [
    r.variant,
    r.frame.toFixed(2),
    base && base.frame > 0 ? `${(((r.frame - base.frame) / base.frame) * 100).toFixed(0)}%` : '-',
    r.cpu.toFixed(2),
    r.draws.toFixed(0),
    r.ktris.toFixed(1),
    r.pixels.toFixed(2),
    r.note,
  ]);
  const all = [head, ...body];
  const widths = head.map((_, i) => Math.max(...all.map((row) => row[i]!.length)));
  const last = head.length - 1;
  return all
    .map((row) => row.map((cell, i) => (i === 0 || i === last ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!))).join('  '))
    .join('\n');
}

/* --- main ------------------------------------------------------------------------ */

async function main(): Promise<void> {
  const canvasAA = document.getElementById('shot-canvas') as HTMLCanvasElement;
  // Both canvases stay ON SCREEN. Hiding the second one with `display: none`
  // let the compositor skip its frames entirely, and the antialias row came back
  // at a hundredth of a millisecond. CSS size has nothing to do with the drawing
  // buffer, so a 320-pixel-wide thumbnail still renders 1920x1080.
  const canvasFlat = document.createElement('canvas');
  canvasFlat.id = 'flat-canvas';
  canvasAA.after(canvasFlat);

  const graphics0 = configForRun(maps[0]!, config0.difficulty.default).graphics;
  // Two contexts for the whole run, because `antialias` is a context flag and a
  // fresh WebGL context per variant would run the browser out of them.
  const withAA = new Renderer(canvasAA, { ...graphics0, antialias: true }, config0.player);
  const noAA = new Renderer(canvasFlat, { ...graphics0, antialias: false }, config0.player);

  const gl = withAA.renderer.getContext() as WebGL2RenderingContext;
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  log(`${width}x${height}  poses=${poses}  rounds=${rounds}  doors=${doorsOpen ? 'open' : 'closed'}  seed=${seed}`);
  log(`renderer: ${debug ? (gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string) : 'unknown'}`);

  for (const mapId of maps) {
    const config = configForRun(mapId, config0.difficulty.default);
    const pack = getArtPack(config.maps.maps[mapId]?.artPack ?? mapId);
    const archetype = config.enemy.archetypes[config.enemy.defaultArchetype];
    if (!archetype) throw new Error(`no enemy archetype "${config.enemy.defaultArchetype}"`);

    const buildStart = performance.now();
    const layout = generate(mapId, seed, config.world, pack.rooms, archetype.spawn);
    const world = buildWorld(layout, pack, config.world, config.items, config.graphics);
    const buildMs = performance.now() - buildStart;

    for (const door of world.doors) {
      door.open = doorsOpen;
      door.progress = doorsOpen ? 1 : 0;
    }

    const spawn = layout.playerSpawns[0]!;
    const subject: Subject = {
      world,
      cells: layout.cells,
      cellSize: config.world.grid.cellSize,
      eye: config.player.body.standHeight + config.player.body.eyeHeightOffset,
      spawn: [spawn.position[0], spawn.position[2]],
      graphics: config.graphics,
      rooms: layout.rooms.map((placed) => ({
        id: `${placed.blueprintId}@${placed.cell}`,
        cells: placed.cells,
        doors: placed.doors.map((door) => `${door.cell}:${door.side}`),
      })),
    };

    log(`\n=== ${mapId} ===  build ${buildMs.toFixed(0)} ms, ${world.lights.length} lamps ` +
        `(${world.lights.filter((l) => l.light.castShadow).length} casting), ${layout.rooms.length} rooms`);

    if (verifying) {
      log(`  ${await verify(withAA, subject)}`);
      world.dispose();
      clearGeometryCache();
      await breathe();
      continue;
    }

    const rows = await measureAll(
      (variant) => (variant.antialias === false ? noAA : withAA),
      subject,
      (partial) => {
        statusEl.textContent = `${lines.join('\n')}\n${table(partial)}`;
      },
    );
    log(table(rows));
    const baseRow = rows.find((row) => row.variant === 'base');
    if (showWorst && baseRow) {
      log(`worst poses (base): ${baseRow.worst.map((w) => `[${w.cell}] ${w.ms.toFixed(1)}ms`).join('  ')}`);
    }

    world.dispose();
    clearGeometryCache();
    await breathe();
  }

  log('\ndone');
  statusEl.className = 'done';
}

void main().catch((error: unknown) => {
  log(`FAILED: ${error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)}`);
  statusEl.className = 'failed';
});
