/**
 * Kerberos Deep's material library.
 *
 * Every material in the pack is created once, here, and handed out by name, so
 * a room that asks for `surface.hull` three hundred times gets the same object
 * three hundred times - which is what lets `MeshBatcher` collapse a room built
 * from four hundred boxes down to a handful of draw calls.
 *
 * Names come in three families:
 *   - `surface.*`  architecture (the shell: decks, bulkheads, ceilings, bands)
 *   - plain names  props (steel, cable, coral, kelp, bone, glass...)
 *   - fixed names  the ones shared art requires (docs/art/SHARED_ART.md §3.1)
 *
 * **Emission is this pack's lighting budget.** There are two real lights per
 * room and no player torch, so most of what a player navigates by is an
 * emissive surface: instrument screens, emergency strips, tank glow, coral,
 * jellyfish, the vent smokers. Those materials are tuned to read at 6-8 m
 * through the map's fog, and they are the reason a room can look lit while
 * spending one point light on it.
 *
 * **Two temperatures, and never mix them in one room.** The station lights
 * itself amber and sodium-orange - failing emergency circuits - against a cold
 * blue ambient. The abyss lights itself cyan, teal and violet, which is the
 * colour of everything alive at this depth. A room that uses both reads as
 * broken rather than as a boundary; the two rooms that are *meant* to be a
 * boundary (`breach`, `moonpool`) are the exception and earn it.
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
  /** Condensation sheen, scuffed metal, or dry grit. Rooms never pick this - the surface does. */
  rough?: 'wet' | 'metal' | 'dry';
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
    if (opts.rough === 'metal') material.roughnessMap = tex.metalRoughness();
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

/** Unlit. For anything that has to survive being in the dark: filament, glow, water. */
const glow = (color: number, opacity = 1): (() => THREE.Material) => () =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide,
    fog: true,
  });

/** Unlit and mapped: a picture that must not be lit, like the water behind a pane. */
const picture = (map: () => THREE.Texture, color = 0xffffff, side: THREE.Side = THREE.FrontSide): (() => THREE.Material) => () =>
  new THREE.MeshBasicMaterial({ color, map: map(), fog: true, side });

export function createMaterials(): MaterialLibrary {
  return materialLibrary({
    /* --- the shell: station ------------------------------------------------ */
    'surface.deck': standard(0xffffff, { map: tex.deckPlate, normalMap: tex.deckNormal, rough: 'metal', metalness: 0.55, roughness: 0.6 }),
    'surface.hull': standard(0xffffff, { map: tex.hullPlate, normalMap: tex.hullNormal, rough: 'metal', metalness: 0.4, roughness: 0.66 }),
    'surface.paint': standard(0xffffff, { map: tex.paintedSteel, normalMap: tex.paintNormal, rough: 'metal', metalness: 0.22, roughness: 0.7 }),
    'surface.tile': standard(0xffffff, { map: tex.labTile, normalMap: tex.labTileNormal, rough: 'wet', roughness: 0.4 }),
    'surface.concrete': standard(0xffffff, { map: tex.wetConcrete, rough: 'wet', roughness: 0.78 }),
    'surface.panel': standard(0xffffff, { map: tex.ceilingPanel, rough: 'metal', metalness: 0.3, roughness: 0.72 }),
    'surface.rust': standard(0xffffff, { map: tex.rustedSteel, rough: 'dry', roughness: 0.92 }),
    'surface.hazard': standard(0xffffff, { map: tex.hazardStripe, rough: 'metal', roughness: 0.62, metalness: 0.2 }),

    /* --- the shell: abyss --------------------------------------------------- */
    'surface.silt': standard(0xffffff, { map: tex.siltFloor, normalMap: tex.siltNormal, rough: 'dry', roughness: 0.94 }),
    'surface.basalt': standard(0xffffff, { map: tex.basalt, normalMap: tex.basaltNormal, rough: 'wet', roughness: 0.74 }),
    'surface.crust': standard(0xffffff, { map: tex.crust, normalMap: tex.crustNormal, rough: 'wet', roughness: 0.6 }),
    'surface.algae': standard(0xffffff, { map: tex.biofilm, rough: 'wet', roughness: 0.34 }),
    'surface.salt': standard(0xffffff, { map: tex.brineCrystal, rough: 'dry', roughness: 0.46 }),

    /**
     * The net of light a water surface throws, and the only ADDITIVE material in
     * the pack.
     *
     * Caustics are light landing on a surface, not a surface. Painted as an
     * ordinary lit or emissive patch they bring their own dark water with them,
     * and every floor they touched came out as black-and-white cow print -
     * because the dark half of the texture was being drawn over the deck. Added
     * instead, the dark half contributes nothing and only the bright net lands,
     * which is what light actually does.
     */
    'surface.caustic': () =>
      new THREE.MeshBasicMaterial({
        map: tex.caustics(),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0.85,
        fog: true,
      }),

    /* --- station props ------------------------------------------------------- */
    steel: standard(0x7c848a, { rough: 'metal', roughness: 0.52, metalness: 0.65 }),
    steelDark: standard(0x454c52, { rough: 'metal', roughness: 0.58, metalness: 0.6 }),
    steelPale: standard(0xa4aeb2, { rough: 'metal', roughness: 0.4, metalness: 0.7 }),
    painted: standard(0x6f8a7c, { rough: 'metal', roughness: 0.68, metalness: 0.18 }),
    paintedWarn: standard(0xb98a2e, { rough: 'metal', roughness: 0.66, metalness: 0.15 }),
    paintedRed: standard(0x9a3a30, { rough: 'metal', roughness: 0.68, metalness: 0.15 }),
    rust: standard(0xffffff, { map: tex.rustedSteel, rough: 'dry', roughness: 0.95 }),
    rubber: standard(0x2f3338, { roughness: 0.95 }),
    cable: standard(0x2b2f36, { roughness: 0.8 }),
    plastic: standard(0xbfc0b4, { roughness: 0.55 }),
    canvasSuit: standard(0xc2662c, { roughness: 0.92 }),
    canvasPale: standard(0xb9b39c, { roughness: 0.95 }),
    copperPipe: standard(0x8a6034, { rough: 'metal', roughness: 0.44, metalness: 0.75 }),
    /** Rime on a cryo pod window. Nearly white, and it must catch a rim light. */
    frost: standard(0xc2d6da, { roughness: 0.62 }),
    /**
     * Rime spreading on the deck. Same idea as `frost` but see-through, because
     * an opaque one lying flat reads as spilt milk rather than as ice - which is
     * exactly what the first pass of the cryo bay looked like.
     */
    rime: standard(0xa8c2c8, { roughness: 0.72, transparent: 0.4 }),
    foam: standard(0x33383c, { roughness: 1 }),

    /* --- glass ---------------------------------------------------------------- */
    /**
     * Twenty centimetres of acrylic. Glass reads by its HIGHLIGHT, not by its
     * brightness - low roughness, a little metalness and almost no opacity. An
     * emissive pane would be a lamp, which is exactly what a viewing window must
     * not look like (docs/art/ROOM_REVIEW.md §4).
     */
    glassPane: () =>
      new THREE.MeshStandardMaterial({
        color: 0x9fc4c8,
        roughness: 0.06,
        metalness: 0.16,
        transparent: true,
        opacity: 0.17,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    /** The cut edge of thick acrylic: the one place the material shows its colour. */
    glassEdge: standard(0x6fa9a4, { roughness: 0.14, metalness: 0.2, emissive: 0x2c6a63, emissiveIntensity: 0.5 }),
    glassCrack: glow(0xcfe8e4, 0.5),

    /* --- what is on the other side of the glass -------------------------------- */
    /** The open trench: a picture of depth, hung behind a pane. Never lit. */
    backdrop: picture(tex.abyssBackdrop),
    /**
     * A metre of specimen-tank water, and **back-faced on purpose**.
     *
     * A tank is a cylinder of this with things floating in it, and a front-faced
     * cylinder is an opaque wall between the eye and every one of them - the
     * first pass of the oceanarium was a flat teal drum with an invisible shoal
     * inside it. Rendering only the far wall puts the water BEHIND the contents,
     * which is the whole job.
     */
    tankFluid: picture(tex.tankWater, 0xffffff, THREE.BackSide),
    /** The lit interior of a small tank. Same back-facing trick, no map. */
    tankGlow: () => new THREE.MeshBasicMaterial({ color: 0x2fbf9c, side: THREE.BackSide, fog: true }),
    /** Suspended volume: haze, silt columns, the beam of a lamp in water. */
    waterHaze: glow(0x4fc0c8, 0.04),
    waterHazeWarm: glow(0xffb070, 0.035),
    waterDeep: glow(0x0a2230, 0.55),

    /* --- screens and signage ---------------------------------------------------- */
    screenSonar: standard(0xffffff, {
      map: tex.sonarScreen,
      emissive: 0xffffff,
      emissiveMap: tex.sonarScreen,
      emissiveIntensity: 2.1,
      roughness: 0.2,
    }),
    screenData: standard(0xffffff, {
      map: tex.readoutScreen,
      emissive: 0xffffff,
      emissiveMap: tex.readoutScreen,
      emissiveIntensity: 1.9,
      roughness: 0.2,
    }),
    /** A dead screen. There have to be some, or a wall of monitors reads as a disco. */
    screenDead: standard(0x1b2126, { roughness: 0.24, metalness: 0.25 }),
    signAmber: standard(0xc08a2a, { emissive: 0xffa42a, emissiveIntensity: 1.6, roughness: 0.42 }),

    /* --- the things that glow ---------------------------------------------------- */
    /**
     * The pack's light sources. Saturated on purpose: an emissive that is nearly
     * white blows out under ACES and stops reading as a colour of light at all.
     */
    lumenCyan: standard(0x64d0e0, { emissive: 0x36d8ff, emissiveIntensity: 2.8, roughness: 0.4 }),
    lumenTeal: standard(0x5ad8b4, { emissive: 0x2ff0b8, emissiveIntensity: 2.9, roughness: 0.4 }),
    lumenViolet: standard(0x9a6ad0, { emissive: 0x9b52ff, emissiveIntensity: 2.6, roughness: 0.42 }),
    lumenAmber: standard(0xe0a05a, { emissive: 0xff9028, emissiveIntensity: 3.0, roughness: 0.44 }),
    lumenRed: standard(0xc04a44, { emissive: 0xff3a2a, emissiveIntensity: 2.4, roughness: 0.44 }),
    /** A working filament behind glass. Unlit, so a bulb is a bulb even in the dark. */
    bulb: glow(0xffe0b0, 0.95),
    bulbCold: glow(0xd6f4ff, 0.95),
    ember: glow(0xff7a3c, 0.9),

    /* --- abyss props -------------------------------------------------------------- */
    rockDark: standard(0x424b56, { rough: 'wet', roughness: 0.8, flat: true }),
    rockPale: standard(0x6d7580, { rough: 'dry', roughness: 0.88, flat: true }),
    // Knocked back from the near-white it started at: a drift of this catches
    // any warm lamp and comes out as a pale beige pancake on the floor, and a
    // room with six of them reads as spilt plaster rather than as sediment.
    sandPale: standard(0x757a6b, { rough: 'dry', roughness: 0.96 }),
    shellWhite: standard(0xc8c6b2, { roughness: 0.56 }),
    boneWhale: standard(0xbeb9a4, { rough: 'dry', roughness: 0.72 }),
    /** Dead white coral: the skeleton left when the polyps go. Reads at any distance. */
    coralDead: standard(0xb6b3a0, { roughness: 0.78, flat: true }),
    coralPink: standard(0xc06a72, { roughness: 0.6, emissive: 0x8a2f4a, emissiveIntensity: 0.45 }),
    coralBlue: standard(0x4a7ea8, { roughness: 0.58, emissive: 0x2f6ad0, emissiveIntensity: 0.5 }),
    spongeOrange: standard(0xbb6a34, { roughness: 0.82, emissive: 0x6a2f0e, emissiveIntensity: 0.3 }),
    /**
     * Kelp and sea grass. Double-sided and faintly self-lit for the same reason
     * the manor's hanging sheets are: a backlit single-sided blade reads as a
     * hole cut in the water, and real weed glows when a lamp is behind it.
     */
    kelp: standard(0x3d4c2f, {
      roughness: 0.66,
      side: THREE.DoubleSide,
      emissive: 0x131f0e,
      emissiveIntensity: 0.3,
    }),
    kelpPale: standard(0x62693c, { roughness: 0.7, side: THREE.DoubleSide, emissive: 0x1c2110, emissiveIntensity: 0.3 }),
    anemone: standard(0xd0806a, { roughness: 0.5, emissive: 0x8a3020, emissiveIntensity: 0.6 }),
    wormTube: standard(0xc9c4ae, { rough: 'dry', roughness: 0.8 }),
    wormPlume: standard(0xc4302e, { roughness: 0.55, emissive: 0x7a1210, emissiveIntensity: 0.7 }),
    urchin: standard(0x2e2434, { roughness: 0.6, flat: true }),
    /** A bell of jelly. Thin, cold and lit from inside, because they always are. */
    jellyBell: standard(0x9fd8e8, {
      roughness: 0.2,
      transparent: 0.42,
      side: THREE.DoubleSide,
      emissive: 0x4fb8e0,
      emissiveIntensity: 1.5,
    }),
    jellyTrail: glow(0x8fe4ff, 0.42),
    /**
     * Bacterial mat: the shag that grows on a whale fall and round a seep.
     *
     * Off-white rather than white, and barely self-lit. At full brightness a
     * dozen patches of it turned the whale-fall floor into cow print and buried
     * the skeleton it was supposed to be growing on.
     */
    bacterialMat: standard(0x9a9782, {
      map: tex.brineCrystal,
      roughness: 0.76,
      emissive: 0x38412f,
      emissiveIntensity: 0.18,
    }),
    /**
     * The black smoke off a chimney. Very thin: a translucent grey sphere in
     * front of a lit thing turns it grey, and at 0.32 the vent room was five
     * flat pale blobs hanging over everything it was supposed to be lighting.
     */
    smokePlume: glow(0x14101a, 0.11),
    /**
     * The surface of standing water seen from above - a brine pool, a moon pool.
     * Glossy, and genuinely emissive: this is the one surface in the pack that
     * is meant to BE a light source, and at the 0.35 it started on the moon pool
     * read as a black square cut in the deck.
     */
    brineSheen: standard(0x35604f, { roughness: 0.06, metalness: 0.3, emissive: 0x33c8a0, emissiveIntensity: 1.15 }),
    /**
     * Standing water on a deck. Dark and glossy, but **not** a black mirror:
     * there is no environment map in this renderer, so a near-black metal at
     * roughness 0.06 reflects nothing at all and a puddle of it reads as a hole
     * cut in the floor. What sells water is a tight specular highlight on a
     * surface you can still see the colour of.
     */
    puddle: standard(0x3a4850, { roughness: 0.16, metalness: 0.12 }),

    /* --- names shared art requires (docs/art/SHARED_ART.md §3.1) --------------- */
    /**
     * Doors are pressure hatches. `hatchPlate`, not `surface.hull`: shared art is
     * not batched, so a door leaf carries ONE UV repeat and a tiling map smears
     * across it into a blank slab. See textures.ts.
     */
    door: standard(0xffffff, { map: tex.hatchPlate, rough: 'metal', roughness: 0.62, metalness: 0.4 }),
    doorFrame: standard(0x4d565a, { rough: 'metal', roughness: 0.7, metalness: 0.35 }),
    lockIndicator: standard(0xc23c2e, { emissive: 0xff3a24, emissiveIntensity: 1.8, roughness: 0.35 }),

    /**
     * The way out is the surface. Nothing else this far down is daylight-coloured,
     * which is the entire design brief for an exit door.
     */
    exitDoor: standard(0x7fa8a0, { rough: 'metal', roughness: 0.5, metalness: 0.3 }),
    exitFrame: standard(0x3f5a56, { roughness: 0.74 }),
    exitGlow: glow(0xa8f0e0, 0.22),

    chest: standard(0xffffff, { map: tex.caseSkin, rough: 'metal', roughness: 0.55, metalness: 0.3 }),
    chestTrim: standard(0xa8b0a6, { rough: 'metal', roughness: 0.42, metalness: 0.6 }),
    locker: standard(0xffffff, { map: tex.lockerSkin, rough: 'metal', roughness: 0.6, metalness: 0.32 }),
    lockerVent: standard(0x2c3336, { roughness: 0.88 }),

    /* --- the item roster ------------------------------------------------------- */
    itemMetal: standard(0xc4b072, { roughness: 0.34, metalness: 0.85 }),
    itemSteel: standard(0x8d9199, { roughness: 0.4, metalness: 0.78 }),
    itemWood: standard(0x7c5a38, { roughness: 0.88 }),
    itemCloth: standard(0xd8cfb8, { roughness: 1 }),
    itemAccent: standard(0xb0472c, { roughness: 0.66 }),
    itemBrass: standard(0xbe9a4c, { roughness: 0.28, metalness: 0.9 }),
    itemEnamel: standard(0xe6dfc9, { roughness: 0.4 }),
    itemGold: standard(0xc9a13a, { roughness: 0.26, metalness: 0.95 }),
    itemTar: standard(0x0e0f13, { roughness: 0.16, metalness: 0.25 }),
    itemGlass: () =>
      new THREE.MeshStandardMaterial({ color: 0xa8bcc4, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.32 }),
    itemGem: standard(0xcdeaff, { roughness: 0.04, metalness: 0.15, emissive: 0x7fc9e8, emissiveIntensity: 0.75 }),

    /* --- thrown-item effects ----------------------------------------------------- */
    'vfx.tar': () =>
      new THREE.MeshStandardMaterial({ color: 0x0d0e12, roughness: 0.14, metalness: 0.3, transparent: true, opacity: 0.95 }),
    'vfx.tarRim': standard(0x2b2822, { roughness: 0.85 }),
    'vfx.flash': () =>
      new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.9, depthWrite: false, fog: false }),

    playerBody: standard(0x5f7d8c, { roughness: 0.84 }),
    playerMask: standard(0xd8d4c8, { roughness: 0.58 }),

    // Cloned by the ghost builder so it can tint per alert level without touching
    // the shared cache - see art/shared/characters/ghost.ts.
    ghostShroud: () =>
      new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 1, transparent: true, opacity: 0.82 }),
    ghostAlert: () => new THREE.MeshStandardMaterial({ color: 0x357a86, emissive: 0x357a86, emissiveIntensity: 1 }),
  });
}
