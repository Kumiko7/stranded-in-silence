/**
 * `vfx.throwArc` - the aim line drawn while a throwable's use button is held.
 *
 * `api.setArc(points)` takes the flight path already computed by the simulation,
 * flattened as world-space `[x, y, z, ...]`. The art does no ballistics of its
 * own: the line on screen is the same integration the item will fly, so what you
 * see is exactly where it goes.
 *
 * This is the one shared piece that brings its OWN materials rather than asking
 * the pack for them (like the lobby does, docs/art/SHARED_ART.md §3.2). It is a
 * heads-up overlay drawn for one player, not a thing standing in the world, so a
 * pack theming it would only make an aim line harder to read.
 */
import * as THREE from 'three';
import type { ArtApi, ArtBuildContext, BuiltArt } from '../../lib/contract';

/** Comfortably above `items.json -> defaults.throw.aim.maxPoints`. */
const CAPACITY = 160;

/**
 * A soft round dot, so the trail reads as beads rather than square pixels.
 *
 * Written straight into a `DataTexture` rather than painted on a canvas: art has
 * to build headless (`npm run validate:art` runs every builder under Node), so
 * there is no `document` to draw on. See docs/art/ART_GUIDE.md §7.
 */
function dotTexture(): THREE.Texture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - centre, y - centre) / centre;
      // Soft shoulder, hard zero at the edge, so neighbouring dots never seam.
      const alpha = Math.max(0, 1 - distance) ** 2.2;
      const warmth = Math.max(0, 1 - distance * 1.4);
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = Math.round(216 + warmth * 39);
      data[index + 2] = Math.round(150 + warmth * 96);
      data[index + 3] = Math.round(alpha * 255);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const DOT = dotTexture();
const ringGeometry = new THREE.RingGeometry(0.2, 0.28, 28);

export function buildThrowArc(_ctx: ArtBuildContext): BuiltArt {
  const object = new THREE.Group();
  // Points are handed in already in world space, so the object must never be
  // moved, rotated or scaled by whoever parents it.
  object.matrixAutoUpdate = false;

  const positions = new Float32Array(CAPACITY * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);

  const dots = new THREE.PointsMaterial({
    // Big enough to read against a lit wall, small enough not to hide the room
    // the arc is crossing.
    size: 0.11,
    sizeAttenuation: true,
    map: DOT,
    transparent: true,
    depthWrite: false,
    // The arc has to stay legible through a doorway it is arcing over.
    depthTest: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });

  const trail = new THREE.Points(geometry, dots);
  trail.frustumCulled = false;
  trail.renderOrder = 20;
  object.add(trail);

  const markMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc98a,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const mark = new THREE.Mesh(ringGeometry, markMaterial);
  mark.rotation.x = -Math.PI / 2;
  mark.renderOrder = 20;
  object.add(mark);

  const api: ArtApi = {
    setArc(points: readonly number[]): void {
      const count = Math.min(CAPACITY, Math.floor(points.length / 3));
      for (let i = 0; i < count * 3; i++) positions[i] = points[i] as number;

      geometry.setDrawRange(0, count);
      geometry.attributes['position']!.needsUpdate = true;
      geometry.computeBoundingSphere();

      const last = (count - 1) * 3;
      // Lifted a finger's width off the floor, or it z-fights the floorboards.
      mark.visible = count > 1;
      if (count > 1) mark.position.set(points[last] as number, (points[last + 1] as number) + 0.02, points[last + 2] as number);
    },
  };

  return {
    object,
    colliders: [],
    parts: { trail, mark },
    api,
    dispose(): void {
      geometry.dispose();
      dots.dispose();
      markMaterial.dispose();
    },
  };
}
