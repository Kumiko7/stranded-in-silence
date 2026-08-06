/**
 * The Leviathan's material library.
 *
 * Every material in the pack is created once, here, and handed out by name, so
 * a room that asks for `surface.flesh` three hundred times gets the same object
 * three hundred times - which is what lets `MeshBatcher` collapse a room built
 * from four hundred boxes down to a handful of draw calls.
 *
 * Names come in three families:
 *   - `surface.*`  architecture (the shell: floors, walls, ceilings, bands)
 *   - plain names  props (meat, bone, tendon, resin, glow...)
 *   - fixed names  the ones shared art requires (docs/art/SHARED_ART.md §3.1)
 *
 * **Emission is this pack's lighting budget.** There are two real lights per
 * room and no player torch, so almost everything a player navigates by is an
 * emissive surface: bile pools, nerve cord, spore blooms, the eyes. Those
 * materials are tuned to read at 6-8 m through the map's fog, and they are the
 * reason a room can look lit while spending one point light on it.
 */
import * as THREE from 'three';
import { materialLibrary } from '../../lib/build';
import type { MaterialLibrary } from '../../lib/contract';
import * as tex from './textures';

interface Opts {
  roughness?: number;
  metalness?: number;
  map?: () => THREE.Texture;
  normalMap?: () => THREE.Texture;
  /** Wet flesh sheen, or dry calcified pitting. Rooms never pick this - the surface does. */
  rough?: 'wet' | 'dry';
  emissive?: number;
  emissiveIntensity?: number;
  emissiveMap?: () => THREE.Texture;
  transparent?: number;
  side?: THREE.Side;
  flat?: boolean;
}

function standard(color: number, opts: Opts = {}): () => THREE.Material {
  return () => {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.9,
      metalness: opts.metalness ?? 0,
      flatShading: opts.flat ?? false,
    });
    if (opts.map) material.map = opts.map();
    if (opts.normalMap) material.normalMap = opts.normalMap();
    if (opts.rough === 'wet') material.roughnessMap = tex.wetRoughness();
    if (opts.rough === 'dry') material.roughnessMap = tex.dryRoughness();
    if (opts.emissive !== undefined) {
      material.emissive = new THREE.Color(opts.emissive);
      material.emissiveIntensity = opts.emissiveIntensity ?? 1;
    }
    if (opts.emissiveMap) material.emissiveMap = opts.emissiveMap();
    if (opts.transparent !== undefined) {
      material.transparent = true;
      material.opacity = opts.transparent;
      material.depthWrite = false;
    }
    if (opts.side) material.side = opts.side;
    return material;
  };
}

/** Unlit. For anything that has to survive being in the dark: flames, glow, fluid. */
const glow = (color: number, opacity = 1): (() => THREE.Material) => () =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide,
    fog: true,
  });

export function createMaterials(): MaterialLibrary {
  return materialLibrary({
    /* --- the shell: wet -------------------------------------------------- */
    'surface.flesh': standard(0xffffff, { map: tex.flesh, normalMap: tex.fleshNormal, rough: 'wet', roughness: 0.62 }),
    'surface.muscle': standard(0xffffff, { map: tex.muscle, normalMap: tex.muscleNormal, rough: 'wet', roughness: 0.58 }),
    'surface.gut': standard(0xffffff, { map: tex.gut, normalMap: tex.gutNormal, rough: 'wet', roughness: 0.5 }),
    'surface.membrane': standard(0xffffff, {
      map: tex.membrane,
      rough: 'wet',
      roughness: 0.55,
      // A membrane has something behind it. Even where a room does not light it,
      // it should never fall to a flat black panel.
      emissive: 0x53303a,
      emissiveIntensity: 0.28,
    }),
    'surface.cortex': standard(0xffffff, { map: tex.cortex, normalMap: tex.cortexNormal, rough: 'wet', roughness: 0.6 }),
    'surface.mucosa': standard(0xffffff, { map: tex.mucosa, rough: 'wet', roughness: 0.42 }),
    'surface.ceiling': standard(0xffffff, { map: tex.fleshCeiling, rough: 'wet', roughness: 0.7 }),

    /* --- the shell: calcified -------------------------------------------- */
    'surface.bone': standard(0xffffff, { map: tex.bone, normalMap: tex.boneNormal, rough: 'dry' }),
    'surface.suture': standard(0xffffff, { map: tex.suture, normalMap: tex.sutureNormal, rough: 'dry' }),
    'surface.chitin': standard(0xffffff, { map: tex.chitin, normalMap: tex.chitinNormal, roughness: 0.38, metalness: 0.22 }),
    'surface.cartilage': standard(0xffffff, { map: tex.cartilage, rough: 'dry', roughness: 0.55 }),
    'surface.scute': standard(0xffffff, { map: tex.scute, normalMap: tex.scuteNormal, roughness: 0.52, metalness: 0.12 }),
    'surface.enamel': standard(0xffffff, { map: tex.enamel, roughness: 0.28 }),
    'surface.marrow': standard(0xffffff, { map: tex.marrow, rough: 'wet', roughness: 0.6 }),
    'surface.comb': standard(0xffffff, { map: tex.comb, normalMap: tex.combNormal, rough: 'dry', roughness: 0.62 }),
    'surface.spore': standard(0xffffff, {
      map: tex.spore,
      emissive: 0xffffff,
      emissiveMap: tex.spore,
      emissiveIntensity: 0.85,
      roughness: 0.85,
    }),
    'surface.resin': standard(0xffffff, {
      map: tex.resin,
      roughness: 0.24,
      emissive: 0x6a3f12,
      emissiveIntensity: 0.45,
    }),

    /* --- meat ------------------------------------------------------------- */
    meat: standard(0x8e4a4a, { rough: 'wet', roughness: 0.55 }),
    meatPale: standard(0xb0827c, { rough: 'wet', roughness: 0.6 }),
    meatDark: standard(0x5f3038, { rough: 'wet', roughness: 0.5 }),
    fat: standard(0xc4b283, { roughness: 0.7 }),
    tendon: standard(0xc8bda4, { roughness: 0.62 }),
    sinew: standard(0xa8977c, { roughness: 0.66 }),
    organ: standard(0x94505b, { rough: 'wet', roughness: 0.45 }),
    vein: standard(0x6a2f3c, { rough: 'wet', roughness: 0.36 }),
    gland: standard(0x9a6a52, { rough: 'wet', roughness: 0.4 }),

    /* --- calcified props --------------------------------------------------- */
    bone: standard(0xffffff, { map: tex.bone, normalMap: tex.boneNormal, rough: 'dry' }),
    bonePale: standard(0xc6bda6, { roughness: 0.72 }),
    boneDark: standard(0x7e7460, { roughness: 0.86 }),
    tooth: standard(0xffffff, { map: tex.enamel, roughness: 0.26 }),
    chitinPlate: standard(0xffffff, { map: tex.chitin, normalMap: tex.chitinNormal, roughness: 0.36, metalness: 0.25 }),
    chitinDark: standard(0x4a4a52, { roughness: 0.44, metalness: 0.3 }),
    cartilage: standard(0xffffff, { map: tex.cartilage, rough: 'dry', roughness: 0.5 }),
    scute: standard(0xffffff, { map: tex.scute, normalMap: tex.scuteNormal, roughness: 0.5, metalness: 0.12 }),
    calcite: standard(0xa9a493, { roughness: 0.8, flat: true }),
    grit: standard(0x83796a, { roughness: 1 }),

    /* --- fluids and films --------------------------------------------------- */
    /**
     * Hanging films: mucus curtains, birth caul, the skin over a healed wound.
     * Double-sided and faintly self-lit for the same reason the manor's laundry
     * sheets are - a single-sided plane with the light behind it reads as a hole
     * cut in the room, and real wet tissue glows when it is backlit.
     */
    caul: standard(0xa8848a, {
      map: tex.membrane,
      roughness: 0.42,
      side: THREE.DoubleSide,
      // Thin. At 0.62 a curtain of this read as a pane of fog filling the whole
      // frame; the film has to show what is behind it or it is just a wall.
      transparent: 0.36,
      emissive: 0x5c3238,
      emissiveIntensity: 0.3,
    }),
    strand: standard(0xc0b2a6, { roughness: 0.5, transparent: 0.5, side: THREE.DoubleSide }),
    slick: standard(0x4a2c30, { roughness: 0.12, metalness: 0.1 }),
    blood: standard(0x6d2226, { roughness: 0.14, metalness: 0.05 }),

    /* --- the things that glow ------------------------------------------------ */
    /**
     * The pack's light sources. There are two real lights per room and no torch,
     * so these carry the navigation load: everything here is tuned to still read
     * as a light source at the far side of an 8 m cell through the map's fog.
     */
    bile: standard(0xffffff, {
      map: tex.acid,
      emissive: 0xffffff,
      emissiveMap: tex.acid,
      emissiveIntensity: 1.9,
      roughness: 0.14,
      metalness: 0.1,
    }),
    // Saturated on purpose: an emissive that is nearly white blows out to white
    // under ACES and stops reading as a colour of light at all.
    lumen: standard(0x74d8a4, { emissive: 0x3fe09a, emissiveIntensity: 3.2, roughness: 0.4 }),
    lumenWarm: standard(0xe0995a, { emissive: 0xff8a3c, emissiveIntensity: 3.0, roughness: 0.42 }),
    lumenCold: standard(0x7aa8e0, { emissive: 0x4f96ff, emissiveIntensity: 3.0, roughness: 0.4 }),
    // Kept low and saturated: at high intensity a blue emissive clips to white
    // under ACES and the cord stops reading as blue at all.
    nerve: standard(0x4d86c8, { emissive: 0x2f78e0, emissiveIntensity: 1.1, roughness: 0.5 }),
    ember: glow(0xff7a44, 0.9),
    pulse: glow(0xff5f6d, 0.85),
    /** Faint volumetric wedges - a shaft of glow through a membrane, a spore haze. */
    haze: glow(0x8fd8b4, 0.05),
    hazeWarm: glow(0xffa070, 0.055),

    /* --- eyes ---------------------------------------------------------------- */
    // Albedo AND emissive from the same atlas, so the iris burns and the pupil
    // stays a hole. This is what makes a wall of eyes light a room for free.
    iris: standard(0xffffff, {
      map: tex.irises,
      emissive: 0xffffff,
      emissiveMap: tex.irises,
      emissiveIntensity: 1.25,
      roughness: 0.12,
    }),
    sclera: standard(0xb7aea0, { roughness: 0.18 }),

    /* --- growth --------------------------------------------------------------- */
    eggShell: standard(0xb9b09a, { roughness: 0.42, transparent: 0.8, emissive: 0x6d7f4a, emissiveIntensity: 0.5 }),
    embryo: standard(0x8a5a52, { emissive: 0x7a3a44, emissiveIntensity: 0.55, roughness: 0.5 }),
    // Tinted well below white. At full brightness the map plus its own emissive
    // came out as opaque cream, and a pool of it read as spilt paint.
    resin: standard(0x9a6a26, {
      map: tex.resin,
      roughness: 0.16,
      transparent: 0.72,
      emissive: 0x502c07,
      emissiveIntensity: 0.5,
    }),
    fungus: standard(0xffffff, {
      map: tex.spore,
      emissive: 0xffffff,
      emissiveMap: tex.spore,
      emissiveIntensity: 1.5,
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),

    /* --- names shared art requires (docs/art/SHARED_ART.md §3.1) ------------- */
    // The doors are valves: a plate of ossified bone in a cartilage frame, with a
    // sphincter of muscle where the lock is.
    // `bonePlate`, not `bone`: shared art is not batched, so a door leaf carries
    // one UV repeat and a tiling map smears across it. See textures.ts.
    door: standard(0xdcd2bc, { map: tex.bonePlate, rough: 'dry', roughness: 0.68 }),
    doorFrame: standard(0x6d5f4c, { roughness: 0.84 }),
    lockIndicator: standard(0xd4a03c, { emissive: 0xffae3a, emissiveIntensity: 1.4, roughness: 0.35 }),

    // The way out is a wound that has not closed. Nothing else in the beast is
    // this colour, which is the entire design brief for an exit door.
    exitDoor: standard(0x6f8f8a, { roughness: 0.62 }),
    exitFrame: standard(0x40544f, { roughness: 0.8 }),
    exitGlow: glow(0x8bf0d0, 0.2),

    // Flat tints rather than tiling maps, for the same reason as the door: a
    // chest is a box of shared art with one UV repeat on it.
    chest: standard(0x574c48, { roughness: 0.4, metalness: 0.25 }),
    chestTrim: standard(0xbdb094, { roughness: 0.5 }),
    locker: standard(0xa8a390, { roughness: 0.58 }),
    lockerVent: standard(0x54473f, { roughness: 0.9 }),

    /* --- the item roster ------------------------------------------------------ */
    itemMetal: standard(0xc4b072, { roughness: 0.34, metalness: 0.85 }),
    itemSteel: standard(0x8d9199, { roughness: 0.42, metalness: 0.75 }),
    itemWood: standard(0x7c5a38, { roughness: 0.86 }),
    itemCloth: standard(0xd8cfb8, { roughness: 1 }),
    itemAccent: standard(0x9c2f28, { roughness: 0.68 }),
    itemBrass: standard(0xbe9a4c, { roughness: 0.28, metalness: 0.9 }),
    itemEnamel: standard(0xe6dfc9, { roughness: 0.42 }),
    itemGold: standard(0xc9a13a, { roughness: 0.26, metalness: 0.95 }),
    itemTar: standard(0x0e0f13, { roughness: 0.16, metalness: 0.25 }),
    itemGlass: () =>
      new THREE.MeshStandardMaterial({ color: 0xa8bcc4, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.32 }),
    itemGem: standard(0xcdeaff, { roughness: 0.04, metalness: 0.15, emissive: 0x7fc9e8, emissiveIntensity: 0.75 }),

    /* --- thrown-item effects --------------------------------------------------- */
    'vfx.tar': () =>
      new THREE.MeshStandardMaterial({ color: 0x0d0e12, roughness: 0.14, metalness: 0.3, transparent: true, opacity: 0.95 }),
    'vfx.tarRim': standard(0x2b2822, { roughness: 0.85 }),
    'vfx.flash': () =>
      new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.9, depthWrite: false, fog: false }),

    playerBody: standard(0x6f7690, { roughness: 0.85 }),
    playerMask: standard(0xd8d4c8, { roughness: 0.6 }),

    // Cloned by the ghost builder so it can tint per alert level without touching
    // the shared cache - see art/shared/characters/ghost.ts.
    ghostShroud: () =>
      new THREE.MeshStandardMaterial({ color: 0x2f3648, roughness: 1, transparent: true, opacity: 0.82 }),
    ghostAlert: () => new THREE.MeshStandardMaterial({ color: 0x39506b, emissive: 0x39506b, emissiveIntensity: 1 }),
  });
}
