/**
 * Test pack materials. Deliberately plain - flat colours and high roughness, so
 * lighting and fog do the atmospheric work. Real packs add procedural texture.
 */
import * as THREE from 'three';
import { materialLibrary } from '../../lib/build';
import type { MaterialLibrary } from '../../lib/contract';

const standard = (color: number, roughness = 0.92, metalness = 0) =>
  () => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/**
 * Albedos are mid-greys, not the near-blacks the horror palette suggests. Colour
 * is converted to LINEAR space before lighting, where #2b2b33 is about 0.025 -
 * effectively black. Darkness comes from the lighting and fog, not the materials.
 */
export function createMaterials(): MaterialLibrary {
  return materialLibrary({
    floor: standard(0x6e7078),
    ceiling: standard(0x4c4e57),
    wall: standard(0x87899a),
    wallTrim: standard(0x5a5c66),
    wood: standard(0x8a6a4a),
    metal: standard(0x9aa0aa, 0.55, 0.6),
    fabric: standard(0x8a5a60),
    stone: standard(0x7d8189),

    door: standard(0x9c7449),
    doorFrame: standard(0x5e4a30),
    lockIndicator: () => new THREE.MeshStandardMaterial({ color: 0xc9a227, emissive: 0xc9a227, emissiveIntensity: 0.7 }),

    exitDoor: standard(0x5f9a76),
    exitFrame: standard(0x3d5c48),
    exitGlow: () =>
      new THREE.MeshBasicMaterial({ color: 0x6fe3a0, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),

    lampHousing: standard(0x3a3a42),
    lampGlow: () => new THREE.MeshBasicMaterial({ color: 0xffdca8 }),

    playerBody: standard(0x6f7690),
    playerMask: () => new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.6 }),
  });
}
