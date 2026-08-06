/**
 * Scoreboard portraits: the REAL player body, rendered off screen to an image.
 *
 * The scoreboard used to draw an SVG that imitated `player.masked`. That was
 * fine while the body was a capsule and four boxes, and it stopped being fine
 * the moment the wardrobe started selling hats: every hat would have needed a
 * second, hand-drawn, flat version of itself, and the two would have drifted
 * apart by the third one.
 *
 * So the card shows a picture of the actual model. This module owns a small
 * off-screen renderer, builds the same `player.masked` the run builds, dresses
 * it in that player's wardrobe choice, takes one frame and hands back a data
 * URL. Screens still never touch `THREE` (docs/systems/UI.md rule 5) - what
 * reaches Preact is a string in an `<img src>`.
 *
 * It renders on its OWN `WebGLRenderer` rather than borrowing the game's,
 * because the game's canvas is the game's canvas: rendering a portrait into it
 * would need `preserveDrawingBuffer` and would fight whatever is on screen.
 * One 256x384 context, created on first use and cached with its results.
 *
 * Results are cached by outfit, so the scoreboard re-rendering as late tallies
 * arrive costs one map lookup per card rather than four draws.
 */
import * as THREE from 'three';
import { createLobbyMaterials } from '@art/shared/lobby/index';
import type { MaterialLibrary, RoomDims } from '@art/lib/contract';
import type { PlayerConfig, WorldConfig } from '@/config/types';
import type { Cosmetic } from '@shared/cosmetics';
import { createPlayerBody } from './playerBody';

/** Card-shaped: the scoreboard stage is taller than it is wide. */
const WIDTH = 256;
const HEIGHT = 384;

/**
 * Turned off straight-on, so the visor catches the key light and the silhouette
 * shows a shoulder. A body facing the camera square reads as a mugshot.
 */
const BODY_YAW = 0.42;

class PortraitStudio {
  #renderer: THREE.WebGLRenderer | null = null;
  #canvas: HTMLCanvasElement | null = null;
  #scene: THREE.Scene | null = null;
  #camera: THREE.PerspectiveCamera | null = null;
  #materials: MaterialLibrary | null = null;
  readonly #cache = new Map<string, string>();

  /**
   * A portrait of somebody in this outfit, as a PNG data URL, or `null` if the
   * browser will not give us a second GL context. A card with no picture is a
   * card; a crash on the scoreboard is the end of the run.
   */
  render(player: PlayerConfig, world: WorldConfig, cosmetic: Cosmetic): string | null {
    const key = `${cosmetic.colourId}|${cosmetic.hatId}`;
    const cached = this.#cache.get(key);
    if (cached) return cached;

    const studio = this.#studio(world);
    if (!studio) return null;

    // A fresh body per portrait: it clones its materials and hangs a hat, and
    // the whole point of the cache above is that this happens once per outfit.
    const body = createPlayerBody(player, studio.materials, () => 0.5, studio.dims);
    body.wear(cosmetic);
    body.root.rotation.y = BODY_YAW;
    studio.scene.add(body.object);

    let url: string | null = null;
    try {
      studio.renderer.render(studio.scene, studio.camera);
      url = studio.canvas.toDataURL('image/png');
    } catch (error) {
      console.warn('[portraits] could not render a scoreboard portrait', error);
    } finally {
      studio.scene.remove(body.object);
      body.dispose();
    }

    if (url) this.#cache.set(key, url);
    return url;
  }

  #studio(world: WorldConfig): {
    renderer: THREE.WebGLRenderer;
    canvas: HTMLCanvasElement;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    materials: MaterialLibrary;
    dims: RoomDims;
  } | null {
    if (!this.#renderer) {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;

      let renderer: THREE.WebGLRenderer;
      try {
        // `preserveDrawingBuffer` so `toDataURL` still has something to read
        // after the draw call returns.
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      } catch (error) {
        console.warn('[portraits] no second WebGL context available', error);
        return null;
      }
      renderer.setSize(WIDTH, HEIGHT, false);
      renderer.setClearAlpha(0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;

      const scene = new THREE.Scene();
      // A studio, not a room: the card is lit to show a costume off, which is
      // the exact opposite of everywhere else in this game.
      scene.add(new THREE.AmbientLight(0x8894a8, 1.5));
      const key = new THREE.DirectionalLight(0xfff2dd, 2.6);
      key.position.set(-2.2, 3.4, -2.6);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x7fb0dc, 1.5);
      rim.position.set(2.6, 1.4, 2.2);
      scene.add(rim);
      const fill = new THREE.DirectionalLight(0xffd9b0, 0.8);
      fill.position.set(1.8, 0.6, -2.4);
      scene.add(fill);

      // Framed for the TALLEST thing a player can wear, not for the body: a
      // 1.8 m figure under a candelabra reaches nearly 2.4 m, and a crown with
      // its points cut off is exactly what makes a card look broken. At a
      // 34-degree vertical field, 4.4 m shows about 2.7 m. The camera sits at
      // chest height rather than eye height, so nobody is looked down on.
      const camera = new THREE.PerspectiveCamera(34, WIDTH / HEIGHT, 0.1, 14);
      camera.position.set(0, 1.12, -4.4);
      camera.lookAt(0, 1.12, 0);

      this.#canvas = canvas;
      this.#renderer = renderer;
      this.#scene = scene;
      this.#camera = camera;
      this.#materials = createLobbyMaterials();
    }

    const renderer = this.#renderer;
    const canvas = this.#canvas;
    const scene = this.#scene;
    const camera = this.#camera;
    const materials = this.#materials;
    if (!renderer || !canvas || !scene || !camera || !materials) return null;

    return {
      renderer,
      canvas,
      scene,
      camera,
      materials,
      dims: {
        cellSize: world.grid.cellSize,
        ceilingHeight: world.grid.ceilingHeight,
        wallThickness: world.grid.wallThickness,
        doorWidth: world.doors.width,
        doorHeight: world.doors.height,
      },
    };
  }

  dispose(): void {
    this.#materials?.dispose();
    this.#renderer?.dispose();
    this.#renderer = null;
    this.#canvas = null;
    this.#scene = null;
    this.#camera = null;
    this.#materials = null;
    this.#cache.clear();
  }
}

/**
 * One studio for the process. A portrait of a given outfit is the same picture
 * every time, so both the context and the cache are worth keeping between runs.
 */
const studio = new PortraitStudio();

export function playerPortrait(player: PlayerConfig, world: WorldConfig, cosmetic: Cosmetic): string | null {
  return studio.render(player, world, cosmetic);
}

/** Teardown only. Nothing during a session should need this. */
export function disposePortraits(): void {
  studio.dispose();
}
