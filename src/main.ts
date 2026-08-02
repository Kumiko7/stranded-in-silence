/**
 * Entry point. Owns nothing except the boot sequence and the fatal-error surface.
 *
 * Boot order matters and is documented in docs/ARCHITECTURE.md:
 *   config -> i18n -> save/profile -> render -> input -> audio -> ui -> loop
 *
 * Steps not yet implemented are marked TODO(step N) against docs/PLAN.md.
 */
import * as THREE from 'three';
import { Loop } from './core/Loop';

const bootRoot = document.getElementById('boot-root');
const bootStatus = document.getElementById('boot-status');

function setBootStatus(text: string): void {
  if (bootStatus) bootStatus.textContent = text;
}

function fail(reason: string, err?: unknown): void {
  console.error('[boot]', reason, err);
  if (bootRoot) {
    bootRoot.classList.add('boot--error');
    setBootStatus(reason);
  }
}

async function boot(): Promise<void> {
  setBootStatus('checking device');

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('missing #game-canvas');

  // Probe on a throwaway canvas: the first getContext call fixes the context
  // attributes for the life of a canvas, so probing the real one would silently
  // discard the renderer's antialias/alpha settings.
  if (!document.createElement('canvas').getContext('webgl2')) {
    fail('This browser cannot run WebGL 2. Try a recent Chrome, Edge or Firefox.');
    return;
  }

  // TODO(step 2): loadConfig() then initI18n() - replaces every literal below.
  // TODO(step 4): replace this placeholder scene with src/render/Renderer.ts.
  setBootStatus('starting renderer');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setClearColor(0x07080c, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07080c, 0.06);

  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 200);
  camera.position.set(0, 1.65, 6);

  const placeholder = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1, 0.28, 128, 24),
    new THREE.MeshStandardMaterial({ color: 0x39405c, roughness: 0.7, metalness: 0.15 }),
  );
  placeholder.position.y = 1.6;
  scene.add(placeholder);

  scene.add(new THREE.AmbientLight(0x2a2f45, 0.6));
  const key = new THREE.PointLight(0xffe9c8, 24, 24, 2);
  key.position.set(2.5, 3.5, 3);
  scene.add(key);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  });

  const loop = new Loop({ tickRateHz: 30, maxSubStepsPerFrame: 5 });
  loop.add({
    render: (dt) => {
      placeholder.rotation.x += dt * 0.25;
      placeholder.rotation.y += dt * 0.4;
      renderer.render(scene, camera);
    },
  });
  loop.start();

  // TODO(step 6): mount the Preact screen manager into #screen-root and drop this.
  bootRoot?.classList.add('boot--scaffold');
  setBootStatus('scaffold running - see docs/PLAN.md');
}

boot().catch((err) => fail(err instanceof Error ? err.message : String(err), err));
