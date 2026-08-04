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

    chest: standard(0x7a5c3a),
    chestTrim: standard(0x8f939c, 0.5, 0.7),
    locker: standard(0x6d7a80, 0.6, 0.45),
    lockerVent: standard(0x33393d),

    /* --- the item roster -------------------------------------------------- */
    itemMetal: standard(0xc4b072, 0.4, 0.8),
    itemSteel: standard(0x8d9199, 0.45, 0.7),
    itemWood: standard(0x7c5a38, 0.86),
    itemCloth: standard(0xd8cfb8, 1),
    itemAccent: standard(0x9c2f28, 0.7),
    itemBrass: standard(0xbe9a4c, 0.3, 0.9),
    itemEnamel: standard(0xe6dfc9, 0.45),
    itemGold: standard(0xc9a13a, 0.28, 0.9),
    itemTar: standard(0x0e0f13, 0.18, 0.25),
    itemGlass: () =>
      new THREE.MeshStandardMaterial({ color: 0xa8bcc4, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.32 }),
    itemGem: () =>
      new THREE.MeshStandardMaterial({
        color: 0xcdeaff,
        roughness: 0.05,
        metalness: 0.15,
        emissive: 0x7fc9e8,
        emissiveIntensity: 0.75,
      }),

    /* --- thrown-item effects ---------------------------------------------- */
    'vfx.tar': () =>
      new THREE.MeshStandardMaterial({ color: 0x0d0e12, roughness: 0.14, metalness: 0.3, transparent: true, opacity: 0.95 }),
    // The rim under the slick: matte and a shade lighter, so the edge catches the
    // room's light and the pool reads as spilt rather than as a hole in the floor.
    'vfx.tarRim': standard(0x2b2822, 0.85),
    // Cloned by the flare burst so it can fade its own copy out.
    'vfx.flash': () =>
      new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.9, depthWrite: false, fog: false }),

    exitDoor: standard(0x5f9a76),
    exitFrame: standard(0x3d5c48),
    exitGlow: () =>
      new THREE.MeshBasicMaterial({ color: 0x6fe3a0, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),

    lampHousing: standard(0x3a3a42),
    lampGlow: () => new THREE.MeshBasicMaterial({ color: 0xffdca8 }),

    playerBody: standard(0x6f7690),
    playerMask: () => new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.6 }),

    // The ghost clones both of these so it can tint per alert level without
    // touching the shared cache - see art/shared/characters/ghost.ts.
    ghostShroud: () =>
      new THREE.MeshStandardMaterial({ color: 0x2f3648, roughness: 1, transparent: true, opacity: 0.82 }),
    ghostAlert: () => new THREE.MeshStandardMaterial({ color: 0x39506b, emissive: 0x39506b, emissiveIntensity: 1 }),
  });
}
