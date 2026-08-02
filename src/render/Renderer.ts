/**
 * Renderer, camera and the global lighting rig, all driven by config/graphics.json.
 *
 * There is no player flashlight - rooms light themselves (see docs/art/ART_GUIDE.md).
 * `minAmbientFloor` is the hard "dark but never blind" guarantee: ambient is never
 * allowed below it, whatever a map's overrides ask for.
 */
import * as THREE from 'three';
import type { GraphicsConfig, PlayerConfig } from '@/config/types';

/** Point lights are per-room; only the nearest few are enabled to keep shaders sane. */
const MAX_ACTIVE_LIGHTS = 6;

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
  readonly #ambient: THREE.AmbientLight;
  #lights: { light: THREE.Light; x: number; z: number }[] = [];
  #lightSortTimer = 0;

  constructor(canvas: HTMLCanvasElement, graphics: GraphicsConfig, player: PlayerConfig) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: graphics.antialias });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, graphics.pixelRatioCap));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = graphics.exposure;
    this.renderer.shadowMap.enabled = graphics.shadows.enabled;

    this.camera = new THREE.PerspectiveCamera(player.camera.fovDegrees, 1, 0.05, 400);

    this.#ambient = new THREE.AmbientLight(new THREE.Color(graphics.ambientColor), ambientIntensity(graphics));
    this.scene.add(this.#ambient);

    if (graphics.fog.enabled) {
      this.scene.fog = new THREE.FogExp2(new THREE.Color(graphics.fog.color), graphics.fog.density);
    }
    this.scene.background = new THREE.Color(graphics.fog.color);

    this.resize();
  }

  /** Re-applies per-map graphics overrides without rebuilding the renderer. */
  applyGraphics(graphics: GraphicsConfig): void {
    this.#ambient.color = new THREE.Color(graphics.ambientColor);
    this.#ambient.intensity = ambientIntensity(graphics);
    this.renderer.toneMappingExposure = graphics.exposure;

    if (graphics.fog.enabled) {
      this.scene.fog = new THREE.FogExp2(new THREE.Color(graphics.fog.color), graphics.fog.density);
    } else {
      this.scene.fog = null;
    }
    this.scene.background = new THREE.Color(graphics.fog.color);
  }

  setRoomLights(lights: { light: THREE.Light; x: number; z: number }[]): void {
    this.#lights = lights;
    for (const entry of lights) entry.light.visible = false;
    this.#lightSortTimer = 0;
  }

  /**
   * Enables only the nearest lights. three.js compiles every visible light into
   * the shader, so 36 room lamps at once would be unusable - and a player can
   * only see a few rooms through the fog anyway.
   */
  updateLights(dt: number, x: number, z: number): void {
    this.#lightSortTimer -= dt;
    if (this.#lightSortTimer > 0 || this.#lights.length === 0) return;
    this.#lightSortTimer = 0.2;

    const ranked = this.#lights
      .map((entry) => ({ entry, distance: (entry.x - x) ** 2 + (entry.z - z) ** 2 }))
      .sort((a, b) => a.distance - b.distance);

    for (let i = 0; i < ranked.length; i++) {
      const item = ranked[i];
      if (item) item.entry.light.visible = i < MAX_ACTIVE_LIGHTS;
    }
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
    this.renderer.dispose();
  }
}
