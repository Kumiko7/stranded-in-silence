/**
 * What quality tier this machine should START on, decided by measuring it.
 *
 * Runs once, on the first launch on a machine and never again - after that the
 * profile has an answer and it is the player's, not ours. It is silent: there
 * is no dialog, no "detecting hardware" card, and the whole thing is over
 * before the menu is drawn.
 *
 * ## Why a benchmark and not a GPU name
 *
 * The obvious implementation is to read `WEBGL_debug_renderer_info` and look
 * the adapter up in a table. That is a table somebody has to maintain forever,
 * it is wrong the day a new chip ships, it says nothing about the CPU - and
 * this game is CPU-bound on submitting draw calls (docs/systems/RENDERING.md),
 * so the GPU name is not even the thing worth knowing. It also cannot see a
 * driver quietly falling back to software rendering, which is the one case that
 * matters most and the one a benchmark spots without being told anything.
 *
 * So: draw a frame shaped like a real one and time it.
 *
 * ## What is drawn
 *
 * The workload deliberately mirrors what `tools/perf.html` measured a real
 * frame to be: a few hundred individually-drawn meshes lit by the same number
 * of lights the game runs, at the window's own size. Draw-call submission and
 * fragment cost in roughly the proportion the game spends them, so a machine
 * that is slow at either lands in a lower tier for the right reason.
 *
 * ## How it is timed
 *
 * The same way `tools/perf.html` learned to: submit a block of frames with no
 * synchronisation and drain once at the end with a one-pixel `readPixels`.
 * `EXT_disjoint_timer_query_webgl2` is quantised by the browser and useless at
 * this scale, and timing `render()` alone measures only the JavaScript half.
 *
 * ## Which way it errs
 *
 * Down. A player on a fast machine who starts on `medium` sees a menu with a
 * setting in it and moves it up; a player on a slow one who starts on `high`
 * sees a slideshow and may never find out why. Every unknown - a probe that
 * threw, a context that would not open, a machine slow enough that the warm-up
 * alone blew the budget - resolves to the lowest tier.
 */
import * as THREE from 'three';
import type { GraphicsConfig } from '@/config/types';

/** A tier and the frame time at or above which the machine gets it. */
export interface QualityThreshold {
  readonly tier: string;
  readonly atLeastMs: number;
}

export interface ProbeConfig {
  readonly enabled: boolean;
  readonly drawCalls: number;
  readonly frames: number;
  /** Tried in order; the first one the measurement reaches wins. */
  readonly thresholds: readonly QualityThreshold[];
  /** Give up and take the slowest tier if setting up costs more than this. */
  readonly budgetMs: number;
}

/** The slowest tier configured, which is what every unknown resolves to. */
function slowest(probe: ProbeConfig, fallback: string): string {
  return probe.thresholds[0]?.tier ?? fallback;
}

export interface ProbeResult {
  readonly tier: string;
  /** Milliseconds a synthetic frame took, or `null` if it could not be measured. */
  readonly frameMs: number | null;
  readonly reason: string;
}

/**
 * Measures this machine and returns the tier it should start on.
 *
 * Synchronous and self-contained: it opens its own canvas and context, throws
 * both away, and touches nothing the game will later use. That is what lets it
 * run BEFORE the real renderer exists, so the tier is already known when the
 * context that has to live with it is created - `antialias` and
 * `powerPreference` are fixed at that moment and cannot be revisited.
 */
export function probeQuality(graphics: GraphicsConfig): ProbeResult {
  const probe = graphics.quality?.probe;
  const configured = graphics.quality?.default ?? 'high';
  if (!probe?.enabled) return { tier: configured, frameMs: null, reason: 'probe disabled' };

  const started = performance.now();
  const canvas = document.createElement('canvas');
  let renderer: THREE.WebGLRenderer | null = null;

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: graphics.antialias,
      powerPreference: graphics.powerPreference ?? 'high-performance',
    });
    // The window's own size at 1:1. Not `devicePixelRatio` - the point is to
    // find out what this machine can do, not to make the test harder on the
    // machines most likely to fail it.
    renderer.setPixelRatio(1);
    renderer.setSize(Math.max(320, innerWidth), Math.max(240, innerHeight), false);
    renderer.shadowMap.enabled = graphics.shadows.enabled;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, innerWidth / Math.max(1, innerHeight), 0.05, 400);
    camera.position.set(0, 0, 0);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.8 });

    // Spread over the sphere around the camera so most of them are on screen
    // and overlapping, which is what makes this cost fragments as well as
    // draw calls. Not instanced, deliberately: the draw call IS the workload.
    for (let i = 0; i < probe.drawCalls; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      const angle = (i / probe.drawCalls) * Math.PI * 2 * 7;
      const radius = 3 + (i % 11);
      mesh.position.set(Math.cos(angle) * radius, ((i % 7) - 3) * 0.8, Math.sin(angle) * radius);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      scene.add(mesh);
    }

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    for (let i = 0; i < Math.max(1, graphics.maxActiveLights); i++) {
      const light = new THREE.PointLight(0xffffff, 12, 40, 2);
      const angle = (i / Math.max(1, graphics.maxActiveLights)) * Math.PI * 2;
      light.position.set(Math.cos(angle) * 5, 1.5, Math.sin(angle) * 5);
      scene.add(light);
    }

    const gl = renderer.getContext();
    const pixel = new Uint8Array(4);
    const drain = (): void => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

    // Two thrown away: the first pays for compiling the program and for
    // whatever the driver defers to first use, and neither is a frame cost.
    renderer.render(scene, camera);
    renderer.render(scene, camera);
    drain();

    // A machine that cannot get through the setup inside the budget has already
    // answered the question, and spending another second proving it is a second
    // of a black screen on the machine least able to afford it.
    if (performance.now() - started > probe.budgetMs) {
      return {
        tier: slowest(probe, configured),
        frameMs: null,
        reason: `warm-up alone took ${Math.round(performance.now() - started)} ms`,
      };
    }

    const from = performance.now();
    for (let i = 0; i < probe.frames; i++) renderer.render(scene, camera);
    drain();
    const frameMs = (performance.now() - from) / Math.max(1, probe.frames);

    geometry.dispose();
    material.dispose();

    for (const threshold of probe.thresholds) {
      if (frameMs >= threshold.atLeastMs) {
        return { tier: threshold.tier, frameMs, reason: `${frameMs.toFixed(2)} ms/frame` };
      }
    }
    return { tier: configured, frameMs, reason: `${frameMs.toFixed(2)} ms/frame` };
  } catch (error) {
    // Including "could not create a WebGL context", which the real renderer is
    // about to fail on too - but if it somehow does not, the machine that could
    // barely manage one context should not be handed the expensive settings.
    return {
      tier: slowest(probe, configured),
      frameMs: null,
      reason: `probe failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    // The context is released rather than left to garbage collection, because a
    // browser allows only a handful and the real one is about to be created.
    renderer?.forceContextLoss();
    renderer?.dispose();
  }
}
