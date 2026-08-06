/**
 * Renderer, camera and the global lighting rig, all driven by config/graphics.json.
 *
 * There is no player flashlight - rooms light themselves (see docs/art/ART_GUIDE.md).
 * `minAmbientFloor` is the hard "dark but never blind" guarantee: ambient is never
 * allowed below it, whatever a map's overrides ask for.
 */
import * as THREE from 'three';
import type { GraphicsConfig, PlayerConfig } from '@/config/types';
import { FeedbackLayer } from './feedback';

/** A room lamp, with the world position the "nearest few" ranking sorts on. */
interface RankedLight {
  light: THREE.Light;
  x: number;
  z: number;
  /** Scratch: squared distance to the camera, refreshed by each ranking pass. */
  distance: number;
  /**
   * The colour the art asked for. Fading is done by scaling this rather than by
   * scaling `intensity`, because art already animates intensity - `flicker()`
   * rewrites it every frame - and the two would fight. Nothing in the game
   * changes a room lamp's colour after it is built, so this knob is ours.
   */
  colour: THREE.Color;
  /** 0 = off, 1 = as authored. Ramps toward `target` at the config's fade rate. */
  gain: number;
  target: number;
}

/**
 * How often the "nearest few lamps" ranking is redone. Not a fade rate - the
 * fade is `graphics.lightFadeSeconds` - just how often the question is asked.
 * At walking pace a tenth of a second is under 30 cm of travel.
 */
const LIGHT_SORT_SECONDS = 0.1;

/**
 * Config values are real three.js light units - no hidden scaling here.
 * `minAmbientFloor` enforces the design rule that the game is dark but never
 * blind, so a map override can never make the world unreadable.
 */
function ambientIntensity(graphics: GraphicsConfig): number {
  return Math.max(graphics.minAmbientFloor, graphics.ambientIntensity);
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Alert wash, heartbeat, damage flash and health vignettes. */
  readonly feedback: FeedbackLayer;
  readonly #ambient: THREE.AmbientLight;
  /**
   * Room lamps, split by whether they cast a shadow, because each pool has its
   * own fixed budget - see `updateLights`.
   */
  #casting: RankedLight[] = [];
  #plain: RankedLight[] = [];
  #castingBudget = 0;
  #plainBudget = 0;
  #lightSortTimer = 0;

  /**
   * The options-menu brightness, as a multiplier on whatever exposure the
   * current scene asks for. Kept here rather than folded into the config so a
   * map override and a player preference stay independent: switching to the
   * bright lobby must not quietly discard the setting.
   */
  #brightness = 1;
  /** The last graphics block applied, so a brightness change can re-apply it. */
  #graphics: GraphicsConfig;

  constructor(canvas: HTMLCanvasElement, graphics: GraphicsConfig, player: PlayerConfig) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: graphics.antialias });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, graphics.pixelRatioCap));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = graphics.exposure;
    this.renderer.shadowMap.enabled = graphics.shadows.enabled;
    this.#graphics = graphics;

    this.camera = new THREE.PerspectiveCamera(player.camera.fovDegrees, 1, 0.05, 400);

    this.#ambient = new THREE.AmbientLight(new THREE.Color(graphics.ambientColor), ambientIntensity(graphics));
    this.scene.add(this.#ambient);

    if (graphics.fog.enabled) {
      this.scene.fog = new THREE.FogExp2(new THREE.Color(graphics.fog.color), graphics.fog.density);
    }
    this.scene.background = new THREE.Color(graphics.fog.color);

    this.feedback = new FeedbackLayer(document.body, canvas, player);
    this.resize();
  }

  /** Re-applies per-map graphics overrides without rebuilding the renderer. */
  applyGraphics(graphics: GraphicsConfig): void {
    this.#graphics = graphics;
    this.#ambient.color = new THREE.Color(graphics.ambientColor);
    this.#ambient.intensity = ambientIntensity(graphics);
    this.renderer.toneMappingExposure = graphics.exposure * this.#brightness;

    if (graphics.fog.enabled) {
      this.scene.fog = new THREE.FogExp2(new THREE.Color(graphics.fog.color), graphics.fog.density);
    } else {
      this.scene.fog = null;
    }
    this.scene.background = new THREE.Color(graphics.fog.color);
  }

  /* --- options ------------------------------------------------------------- */

  /** Options menu. `1` is exactly the exposure the current scene asked for. */
  setBrightness(brightness: number): void {
    this.#brightness = brightness;
    this.renderer.toneMappingExposure = this.#graphics.exposure * brightness;
  }

  setFov(degrees: number): void {
    if (this.camera.fov === degrees) return;
    this.camera.fov = degrees;
    this.camera.updateProjectionMatrix();
  }

  setShadows(enabled: boolean): void {
    if (this.renderer.shadowMap.enabled === enabled) return;
    this.renderer.shadowMap.enabled = enabled;
    // Materials cache their shadow-aware program, so a live toggle needs them
    // recompiled - otherwise the change only shows on the next scene load.
    this.renderer.shadowMap.needsUpdate = true;
    this.scene.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      if (!material) return;
      for (const entry of Array.isArray(material) ? material : [material]) entry.needsUpdate = true;
    });
  }

  /**
   * Hands over a scene's room lamps. `x`/`z` is where the camera will be, so the
   * budgets are already filled on the first frame rather than one tick later.
   */
  setRoomLights(lights: { light: THREE.Light; x: number; z: number }[], x = 0, z = 0): void {
    for (const pool of [this.#casting, this.#plain]) {
      for (const entry of pool) {
        entry.light.visible = false;
        entry.light.color.copy(entry.colour);
      }
    }

    const ranked: RankedLight[] = lights.map((entry) => ({
      ...entry,
      distance: 0,
      colour: (entry.light as THREE.PointLight).color.clone(),
      gain: 0,
      target: 0,
    }));
    this.#casting = ranked.filter((entry) => entry.light.castShadow);
    this.#plain = ranked.filter((entry) => !entry.light.castShadow);

    // Fixed for the lifetime of the scene, which is the whole point: see below.
    const total = Math.max(0, this.#graphics.maxActiveLights);
    this.#castingBudget = Math.min(this.#casting.length, this.#graphics.shadows.maxCastingLights, total);
    this.#plainBudget = Math.min(this.#plain.length, total - this.#castingBudget);

    // Full brightness straight away: nobody should watch the room they spawned
    // in come up from black.
    this.#rank(x, z);
    for (const pool of [this.#casting, this.#plain]) {
      for (const entry of pool) {
        entry.gain = entry.target;
        entry.light.visible = entry.target === 1;
        entry.light.color.copy(entry.colour).multiplyScalar(entry.gain);
      }
    }
    this.#lightSortTimer = LIGHT_SORT_SECONDS;
  }

  /**
   * Enables the nearest lamps, and always exactly as many of them.
   *
   * Two things are going on. The first is the obvious one: three.js compiles
   * every visible light into the shader, so thirty-six room lamps at once would
   * be unusable, and through the fog you can only see a few rooms anyway.
   *
   * The second is why the *count* is fixed rather than capped. A program is
   * compiled per material PER LIGHT COUNT, so a set that goes 6 lights / 1
   * shadow one moment and 6 / 2 the next makes three.js recompile every
   * material in the map - a frozen second, mid-run, the first time you walk
   * into a room that happens to change the mix. Keeping both counts constant
   * means everything can be compiled once behind the loading card (`warmUp`)
   * and never again. A lamp enabled out of its own `distance` costs a slot and
   * lights nothing, which is a trade worth making.
   */
  updateLights(dt: number, x: number, z: number): void {
    // `||` would skip the second pool the moment the first is busy.
    const castingBusy = this.#fade(this.#casting, dt);
    const plainBusy = this.#fade(this.#plain, dt);

    this.#lightSortTimer -= dt;
    // Never re-rank mid-handover: the set has to hold still until it is dark.
    if (castingBusy || plainBusy || this.#lightSortTimer > 0) return;
    this.#lightSortTimer = LIGHT_SORT_SECONDS;
    this.#rank(x, z);
  }

  /**
   * Advances one pool's fades, and hands the slots over once the lamps on their
   * way out are dark. Returns whether anything is still moving.
   */
  #fade(pool: RankedLight[], dt: number): boolean {
    const step = dt / Math.max(0.01, this.#graphics.lightFadeSeconds);
    let leaving = false;
    let moving = false;

    for (const entry of pool) {
      if (!entry.light.visible || entry.gain === entry.target) continue;
      entry.gain =
        entry.target > entry.gain
          ? Math.min(entry.target, entry.gain + step)
          : Math.max(entry.target, entry.gain - step);
      entry.light.color.copy(entry.colour).multiplyScalar(entry.gain);
      moving = true;
      if (entry.target === 0) leaving = true;
    }
    if (leaving) return true;

    // Everything on its way out is black, so the swap itself cannot be seen.
    // One lamp off and one on in the same pass keeps the count where it was.
    for (const entry of pool) {
      if (!entry.light.visible || entry.target !== 0) continue;
      entry.light.visible = false;
      entry.light.color.copy(entry.colour);
      entry.gain = 0;
    }
    for (const entry of pool) {
      if (entry.light.visible || entry.target !== 1) continue;
      entry.light.visible = true;
      entry.gain = 0;
      entry.light.color.copy(entry.colour).multiplyScalar(0);
      moving = true;
    }
    return moving;
  }

  /** Aims each pool's fades at the nearest `budget` lamps. */
  #rank(x: number, z: number): void {
    rankPool(this.#casting, this.#castingBudget, x, z);
    rankPool(this.#plain, this.#plainBudget, x, z);
  }

  /* --- warm-up -------------------------------------------------------------- */

  /**
   * Pays every one-off rendering cost a scene has, while a loading card is
   * still covering the screen.
   *
   * Two of them used to land on the frame a room first came into view, and both
   * are long enough to be felt:
   *
   * - **Shader compilation.** three.js compiles lazily, per material, per light
   *   count. `updateLights` fixes the light counts, so one pass here compiles
   *   the exact programs the whole run will use.
   * - **Shadow maps.** A point light renders six faces the first frame it is
   *   visible. Room lamps are static (`shadow.autoUpdate` is off in the art),
   *   so their maps only ever need rendering once - this walks every one of
   *   them through the active slots to get it done up front, with the whole
   *   map visible so nothing is missing from a map baked later.
   */
  async warmUp(): Promise<void> {
    const hidden = this.#revealAll();
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
      this.#bakeShadows();
    } finally {
      for (const object of hidden) object.visible = false;
    }
  }

  /**
   * Everything visible for the duration of the warm-up, so a shadow map is
   * baked against the whole map rather than whatever happened to be in view.
   * Lights are left alone: changing how many are on is the one thing that would
   * make the warm-up compile the wrong programs.
   */
  #revealAll(): THREE.Object3D[] {
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((object) => {
      if (object.visible || (object as THREE.Light).isLight) return;
      object.visible = true;
      hidden.push(object);
    });
    return hidden;
  }

  #bakeShadows(): void {
    const pool = this.#casting;
    const budget = this.#castingBudget;
    if (!this.renderer.shadowMap.enabled || budget === 0) return;

    const wasVisible = pool.map((entry) => entry.light.visible);
    // Exactly `budget` lamps on for every pass, wrapping round the pool, so the
    // light count never changes and no pass compiles a program of its own.
    for (let start = 0; start < pool.length; start += budget) {
      for (const entry of pool) entry.light.visible = false;
      for (let i = 0; i < budget; i++) pool[(start + i) % pool.length]!.light.visible = true;
      this.renderer.render(this.scene, this.camera);
    }
    pool.forEach((entry, i) => {
      entry.light.visible = wasVisible[i] ?? false;
    });
  }

  resize(): void {
    const width = innerWidth;
    const height = innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.feedback.dispose();
    this.renderer.dispose();
  }
}

/**
 * Aims the nearest `budget` lamps at full and the rest at black. Sorts in
 * place - the order is scratch, not meaning.
 *
 * Nothing here touches `visible`: that is `#fade`'s job, and only once the lamp
 * losing its slot has gone dark.
 */
function rankPool(pool: RankedLight[], budget: number, x: number, z: number): void {
  if (pool.length === 0) return;
  for (const entry of pool) entry.distance = (entry.x - x) ** 2 + (entry.z - z) ** 2;
  pool.sort((a, b) => a.distance - b.distance);
  for (let i = 0; i < pool.length; i++) pool[i]!.target = i < budget ? 1 : 0;
}
