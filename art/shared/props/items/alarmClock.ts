/**
 * `item.alarmClock` - a twin-bell wind-up clock.
 *
 * Contract (docs/art/SHARED_ART.md): fits the 0.35 x 0.35 x 0.4 m size class,
 * origin at the floor centre, facing -Z, no collider.
 *
 * `api.setActive(on)` turns the ringing on. The shake itself is idle motion and
 * belongs to the art (SHARED_ART.md §2), so it runs off `onBeforeRender` - logic
 * only ever says whether the thing is going off, never how it looks doing it.
 */
import * as THREE from 'three';
import type { ArtApi, ArtBuildContext, BuiltArt } from '../../../lib/contract';
import { box } from '../../../lib/build';

const CASE_RADIUS = 0.082;
const CASE_DEPTH = 0.05;
const BELL_RADIUS = 0.042;

const caseGeometry = new THREE.CylinderGeometry(CASE_RADIUS, CASE_RADIUS, CASE_DEPTH, 20, 1);
const bezelGeometry = new THREE.TorusGeometry(CASE_RADIUS - 0.004, 0.008, 6, 20);
const faceGeometry = new THREE.CircleGeometry(CASE_RADIUS - 0.012, 20);
const bellGeometry = new THREE.SphereGeometry(BELL_RADIUS, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.58);
const footGeometry = new THREE.CylinderGeometry(0.009, 0.012, 0.03, 8, 1);
const stemGeometry = new THREE.CylinderGeometry(0.006, 0.006, 0.03, 8, 1);

export function buildAlarmClock(ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  const steel = ctx.materials.get('itemSteel');
  const brass = ctx.materials.get('itemBrass');
  const enamel = ctx.materials.get('itemEnamel');
  const accent = ctx.materials.get('itemAccent');

  // Everything but the feet hangs off this, so the whole clock can rattle.
  const shell = new THREE.Group();
  shell.position.y = 0.03;
  object.add(shell);

  const drum = new THREE.Mesh(caseGeometry, steel);
  drum.rotation.x = Math.PI / 2;
  drum.position.y = CASE_RADIUS;
  shell.add(drum);

  const bezel = new THREE.Mesh(bezelGeometry, brass);
  bezel.position.set(0, CASE_RADIUS, -CASE_DEPTH / 2);
  shell.add(bezel);

  const face = new THREE.Mesh(faceGeometry, enamel);
  face.position.set(0, CASE_RADIUS, -CASE_DEPTH / 2 - 0.002);
  shell.add(face);

  // Four marks and two hands. Any more and it is mush at two metres.
  for (let i = 0; i < 4; i++) {
    const mark = box(steel, [0.006, 0.018, 0.002], [0, 0, 0]);
    mark.position.set(
      Math.sin((i * Math.PI) / 2) * (CASE_RADIUS - 0.024),
      CASE_RADIUS + Math.cos((i * Math.PI) / 2) * (CASE_RADIUS - 0.024) - 0.009,
      -CASE_DEPTH / 2 - 0.004,
    );
    mark.rotation.z = (i * Math.PI) / 2;
    shell.add(mark);
  }

  const hands = new THREE.Group();
  hands.position.set(0, CASE_RADIUS, -CASE_DEPTH / 2 - 0.005);
  const hour = box(accent, [0.006, 0.036, 0.002], [0, -0.004, 0]);
  hour.rotation.z = -0.9;
  const minute = box(accent, [0.005, 0.056, 0.002], [0, -0.004, 0]);
  minute.rotation.z = 2.3;
  hands.add(hour, minute);
  shell.add(hands);

  // Bells, hammer and the winding stem behind them.
  const bells: THREE.Object3D[] = [];
  for (const x of [-0.058, 0.058]) {
    const bell = new THREE.Mesh(bellGeometry, brass);
    bell.position.set(x, CASE_RADIUS * 1.72, 0);
    bell.rotation.z = x < 0 ? -0.35 : 0.35;
    shell.add(bell);
    bells.push(bell);

    const stem = new THREE.Mesh(stemGeometry, steel);
    stem.position.set(x * 0.55, CASE_RADIUS * 1.62, 0);
    stem.rotation.z = x < 0 ? -0.6 : 0.6;
    shell.add(stem);
  }

  const hammer = new THREE.Group();
  hammer.position.set(0, CASE_RADIUS * 1.55, 0);
  hammer.add(box(steel, [0.007, 0.05, 0.007], [0, 0, 0]));
  hammer.add(box(steel, [0.02, 0.014, 0.014], [0, 0.05, 0]));
  shell.add(hammer);

  for (const x of [-0.05, 0.05]) {
    const foot = new THREE.Mesh(footGeometry, brass);
    foot.position.set(x, 0.015, 0.012);
    foot.rotation.x = -0.25;
    object.add(foot);
  }

  // --- ringing -------------------------------------------------------------
  let ringing = false;
  const restY = shell.position.y;

  drum.onBeforeRender = (): void => {
    if (!ringing) {
      hammer.rotation.z = 0;
      shell.position.set(0, restY, 0);
      shell.rotation.z = 0;
      return;
    }
    // ~14 Hz: fast enough to blur, slow enough to read as a hammer.
    const t = performance.now() / 1000;
    hammer.rotation.z = Math.sin(t * 88) * 0.5;
    shell.position.x = Math.sin(t * 88) * 0.004;
    shell.position.y = restY + Math.abs(Math.sin(t * 44)) * 0.006;
    shell.rotation.z = Math.sin(t * 44 + 1) * 0.05;
    for (const bell of bells) bell.position.y = CASE_RADIUS * 1.72 + Math.sin(t * 88) * 0.002;
  };

  const gripAnchor = new THREE.Object3D();
  gripAnchor.position.set(0, CASE_RADIUS, 0);
  object.add(gripAnchor);

  const restAnchor = new THREE.Object3D();
  object.add(restAnchor);

  const api: ArtApi = {
    setActive(on: boolean): void {
      ringing = on;
    },
  };

  return { object, colliders: [], parts: { gripAnchor, restAnchor }, api };
}
