/**
 * The Sepulchre's material library.
 *
 * Every material is created once, here, and handed out by name, so a room that
 * asks for `surface.ashlar` four hundred times gets the same object four hundred
 * times - which is what lets `MeshBatcher` collapse a room built out of six
 * hundred boxes into a handful of draw calls.
 *
 * Names come in three families:
 *   - `surface.*`  architecture (the shell: floors, walls, dados, ceilings)
 *   - plain names  props (stone, bone, iron, gold, wax, linen, fungus...)
 *   - fixed names  the ones shared art requires (docs/art/SHARED_ART.md §3.1)
 *
 * **Flame is the whole lighting design.** Two real lights in a 1x1 room and no
 * player torch, so nearly everything a player navigates by is an *emissive*
 * surface: candle stubs in the wall niches, oil lamps on a dado, coals in a
 * brazier, glowing fungus, a rune cut in a floor. Those materials are tuned to
 * read at six to eight metres through a fog density of 0.05, and they are why a
 * room can look lit while spending one point light on it.
 *
 * **Three temperatures, and a room picks one.** The Sanctum burns tallow: warm
 * amber against a cold blue-grey ambient. The Necropolis burns oil in gold:
 * hotter, lower, and reflected off gilding. The Rot does not burn at all -
 * violet and cold green, and it is the only family whose light has no flicker in
 * it. A room that mixes two reads as broken rather than as a boundary; the rooms
 * that are *meant* to be a boundary (`bloom`, `robbers`, `roots`) earn it.
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
  /** Condensation, dry dust, pitted iron or soft wax. Rooms never pick this - the surface does. */
  rough?: 'damp' | 'dry' | 'iron' | 'wax';
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
    if (opts.rough === 'damp') material.roughnessMap = tex.dampRoughness();
    if (opts.rough === 'dry') material.roughnessMap = tex.dryRoughness();
    if (opts.rough === 'iron') material.roughnessMap = tex.ironRoughness();
    if (opts.rough === 'wax') material.roughnessMap = tex.waxRoughness();
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

/** Unlit. For anything that has to survive being in the dark: flame, glow, water. */
const glow = (color: number, opacity = 1): (() => THREE.Material) => () =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide,
    fog: true,
  });

/** Unlit and mapped: a picture that must not be lit, like the dark behind a grate. */
const picture = (map: () => THREE.Texture, color = 0xffffff, side: THREE.Side = THREE.FrontSide): (() => THREE.Material) => () =>
  new THREE.MeshBasicMaterial({ color, map: map(), fog: true, side });

/**
 * Light LANDING on something, as opposed to something lit.
 *
 * A candle throws a pool on the flagstones and a wash up the wall behind it.
 * Painted as an ordinary emissive decal, the dark half of the falloff is drawn
 * over the floor as well as the bright half, and every lamp in the map sits in a
 * dark square (docs/art/ROOM_REVIEW.md §4). Added, only the net lands - which is
 * what light does.
 */
const wash = (color: number, opacity: number): (() => THREE.Material) => () =>
  new THREE.MeshBasicMaterial({
    color,
    map: tex.glowFalloff(),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    opacity,
    fog: true,
  });

export function createMaterials(): MaterialLibrary {
  return materialLibrary({
    /* --- the shell: SANCTUM ------------------------------------------------- */
    'surface.ashlar': standard(0xffffff, { map: tex.ashlar, normalMap: tex.ashlarNormal, rough: 'damp', roughness: 0.82 }),
    'surface.flag': standard(0xffffff, { map: tex.flagstone, normalMap: tex.flagNormal, rough: 'damp', roughness: 0.72 }),
    'surface.slab': standard(0xffffff, { map: tex.graveSlab, normalMap: tex.slabNormal, rough: 'damp', roughness: 0.7 }),
    'surface.earth': standard(0xffffff, { map: tex.graveEarth, normalMap: tex.earthNormal, rough: 'dry', roughness: 0.96 }),
    'surface.plaster': standard(0xffffff, { map: tex.limePlaster, normalMap: tex.plasterNormal, rough: 'damp', roughness: 0.88 }),
    'surface.brick': standard(0xffffff, { map: tex.brickVault, normalMap: tex.brickNormal, rough: 'damp', roughness: 0.86 }),
    'surface.bone': standard(0xffffff, { map: tex.boneCourse, normalMap: tex.boneNormal, rough: 'wax', roughness: 0.66 }),
    'surface.inscription': standard(0xffffff, { map: tex.inscription, normalMap: tex.inscriptionNormal, rough: 'damp', roughness: 0.8 }),

    /* --- the shell: NECROPOLIS ---------------------------------------------- */
    'surface.sandstone': standard(0xffffff, { map: tex.sandstoneBlock, normalMap: tex.sandstoneNormal, rough: 'dry', roughness: 0.9 }),
    'surface.sand': standard(0xffffff, { map: tex.sandDrift, normalMap: tex.sandNormal, rough: 'dry', roughness: 0.97 }),
    'surface.frieze': standard(0xffffff, { map: tex.paintedFrieze, normalMap: tex.friezeNormal, rough: 'dry', roughness: 0.86 }),
    'surface.mudbrick': standard(0xffffff, { map: tex.mudbrick, normalMap: tex.mudbrickNormal, rough: 'dry', roughness: 0.94 }),
    'surface.stars': standard(0xffffff, { map: tex.starVault, rough: 'dry', roughness: 0.84 }),
    'surface.glyph': standard(0xffffff, { map: tex.hieroglyphBand, normalMap: tex.glyphNormal, rough: 'dry', roughness: 0.88 }),
    'surface.gilt': standard(0xffffff, { map: tex.giltPanel, normalMap: tex.giltNormal, roughness: 0.36, metalness: 0.42 }),

    /* --- the shell: THE ROT -------------------------------------------------- */
    'surface.rot': standard(0xffffff, { map: tex.mycelialFelt, normalMap: tex.rotNormal, rough: 'damp', roughness: 0.8 }),
    'surface.moss': standard(0xffffff, { map: tex.mossStone, rough: 'damp', roughness: 0.7 }),

    /**
      * Light landing on things (additive; see `wash` above).
      *
      * These started at 0.5 and every room in the pack came out the same shade of
      * orange: a votive course throws three of them per wall, and twelve overlapping
      * additive quads plus two point lights is not a dark crypt with candles in it,
      * it is a room lit by fog. At 0.18 a wash reads as the halo round a flame and
      * nothing else, which is the whole job.
      */
    'wash.warm': wash(0xffb457, 0.18),
    'wash.gold': wash(0xffc165, 0.17),
    'wash.cold': wash(0x7fd0c0, 0.14),
    'wash.spore': wash(0x9a7fe0, 0.16),

    /* --- stone, brick and marble as PROPS ----------------------------------- */
    stone: standard(0x74766f, { rough: 'damp', roughness: 0.84, flat: false }),
    stoneDark: standard(0x53564f, { rough: 'damp', roughness: 0.88 }),
    stonePale: standard(0x8b8d84, { rough: 'damp', roughness: 0.8 }),
    stoneWarm: standard(0x9a7f56, { rough: 'dry', roughness: 0.9 }),
    stoneWarmPale: standard(0xb09468, { rough: 'dry', roughness: 0.88 }),
    mortar: standard(0x8a8578, { rough: 'dry', roughness: 0.95 }),
    /**
     * Statuary marble. The palest thing in the Sanctum after bone, so it is the
     * one material a room can rely on to hold a silhouette in the dark - and the
     * reason there is never more than one statue lit at a time.
     */
    marble: standard(0xa8a79c, { roughness: 0.52 }),
    marbleDark: standard(0x6d6c66, { roughness: 0.6 }),
    // Barely self-lit: at 0.35 an alabaster lamp bowl with a point light 10 cm
    // above it came out as a white blob rather than as translucent stone.
    alabaster: standard(0xb8b09a, { roughness: 0.42, emissive: 0x241d14, emissiveIntensity: 0.18 }),

    /* --- bone --------------------------------------------------------------- */
    // Knocked well back from white: a pile of this catches every candle in the
    // room and a room with six piles reads as spilt plaster rather than as the
    // dead (the lesson the whale fall taught, docs/art/ROOM_REVIEW.md §4).
    bone: standard(0x9e957c, { rough: 'wax', roughness: 0.68 }),
    bonePale: standard(0xb0a68a, { rough: 'wax', roughness: 0.6 }),
    boneDark: standard(0x6f6754, { rough: 'dry', roughness: 0.82 }),
    /** Mummified tissue: dark, dry, leathery, and never red. */
    fleshDry: standard(0x54402c, { rough: 'dry', roughness: 0.86, flat: true }),
    fleshRot: standard(0x4a4436, { rough: 'damp', roughness: 0.78 }),

    /* --- timber, iron, precious metal --------------------------------------- */
    timber: standard(0xffffff, { map: tex.oldOak, normalMap: tex.oakNormal, rough: 'damp', roughness: 0.9 }),
    timberDark: standard(0x3e2f21, { rough: 'damp', roughness: 0.92 }),
    iron: standard(0xffffff, { map: tex.wroughtIron, rough: 'iron', roughness: 0.62, metalness: 0.4 }),
    ironDark: standard(0x44464a, { rough: 'iron', roughness: 0.68, metalness: 0.38 }),
    ironPale: standard(0x868a8e, { rough: 'iron', roughness: 0.46, metalness: 0.45 }),
    lead: standard(0x62666b, { roughness: 0.56, metalness: 0.5 }),
    /**
      * Metal, at metalness 0.45 rather than 0.9.
      *
      * There is no environment map in this renderer. A fully metallic surface has
      * almost no diffuse response, so it can only show what it reflects - and with
      * nothing to reflect, the gilded sarcophagus that this whole map is built
      * around came out as a black slab under two oil lamps. Half-metal takes the
      * light, and the `giltPanel` map plus its normal map do the work of saying
      * "hammered leaf" that the specular was supposed to do.
      */
    brass: standard(0xb99247, { rough: 'iron', roughness: 0.4, metalness: 0.45 }),
    copper: standard(0x9a6740, { rough: 'iron', roughness: 0.46, metalness: 0.42 }),
    silver: standard(0xa8aeb2, { roughness: 0.34, metalness: 0.48 }),
    gold: standard(0xffffff, { map: tex.giltPanel, normalMap: tex.giltNormal, roughness: 0.34, metalness: 0.45 }),
    goldPlain: standard(0xd0a844, { roughness: 0.32, metalness: 0.48 }),
    goldDim: standard(0x9c8036, { roughness: 0.46, metalness: 0.4 }),

    /* --- cloth, wax, rope --------------------------------------------------- */
    linen: standard(0xffffff, { map: tex.shroudLinen, normalMap: tex.linenNormal, roughness: 0.96 }),
    /**
     * A shroud with a lamp behind it. Double-sided and faintly self-lit for the
     * same reason the manor's hanging sheets are: a backlit single-sided cloth
     * reads as a hole cut in the air, and real linen glows when it is lit from
     * the other side.
     */
    linenLit: standard(0xffffff, {
      map: tex.shroudLinen,
      roughness: 0.94,
      side: THREE.DoubleSide,
      emissive: 0x2e2a20,
      emissiveIntensity: 0.5,
    }),
    velvet: standard(0x5a2028, { roughness: 1 }),
    velvetDark: standard(0x38181e, { roughness: 1 }),
    rope: standard(0x8a7a58, { rough: 'dry', roughness: 0.98 }),
    wax: standard(0xffffff, { map: tex.candleWax, rough: 'wax', roughness: 0.52 }),
    waxPale: standard(0xd0c8ae, { rough: 'wax', roughness: 0.46 }),
    parchment: standard(0xffffff, { map: tex.parchment, roughness: 0.92 }),

    /* --- the alchemist's bench ---------------------------------------------- */
    /** Retort glass. Reads by its highlight, not by any glow of its own. */
    glassVessel: () =>
      new THREE.MeshStandardMaterial({
        color: 0xa9bdb4,
        roughness: 0.07,
        metalness: 0.14,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    /**
     * What is inside the vessel, and **back-faced on purpose**: a front-faced
     * cylinder of fluid is an opaque plug between the eye and whatever is
     * floating in it. Rendering only the far wall puts the liquid behind the
     * contents, which is the entire job (docs/art/ROOM_REVIEW.md §4).
     */
    fluidGreen: () => new THREE.MeshBasicMaterial({ color: 0x3f8f5a, side: THREE.BackSide, fog: true }),
    fluidAmber: () => new THREE.MeshBasicMaterial({ color: 0x8a6a24, side: THREE.BackSide, fog: true }),
    fluidRed: () => new THREE.MeshBasicMaterial({ color: 0x6f2226, side: THREE.BackSide, fog: true }),
    mercury: standard(0xb4bcc0, { roughness: 0.05, metalness: 0.95 }),
    natron: standard(0xb5b3a2, { rough: 'dry', roughness: 0.62 }),
    bitumen: standard(0x241f1c, { roughness: 0.34, metalness: 0.1 }),
    resin: standard(0x6a4420, { roughness: 0.3, emissive: 0x2a1406, emissiveIntensity: 0.4 }),
    ash: standard(0x4e4c48, { rough: 'dry', roughness: 0.99 }),
    sandLoose: standard(0x9e8a64, { rough: 'dry', roughness: 0.97 }),

    /* --- the Rot ------------------------------------------------------------ */
    mycelium: standard(0xffffff, { map: tex.mycelialFelt, normalMap: tex.rotNormal, rough: 'damp', roughness: 0.76 }),
    moss: standard(0xffffff, { map: tex.mossStone, rough: 'damp', roughness: 0.72 }),
    /**
     * A fungus cap that is lit from inside, because everything down here that
     * grows in the dark is. Saturated: an emissive nearly white blows straight
     * through ACES and stops reading as a colour of light at all.
     */
    capViolet: standard(0x9a7ec4, { roughness: 0.44, emissive: 0x8a52ff, emissiveIntensity: 2.2 }),
    capTeal: standard(0x6fc4b0, { roughness: 0.44, emissive: 0x2fe0c0, emissiveIntensity: 2.3 }),
    capPale: standard(0xb4ae94, { roughness: 0.62, emissive: 0x3a4a3a, emissiveIntensity: 0.4 }),
    stem: standard(0xa8a48c, { rough: 'damp', roughness: 0.7 }),
    /** Gills, seen from under a cap. The brightest part of any mushroom. */
    gill: glow(0xc8b0ff, 0.85),
    root: standard(0x5b4a34, { rough: 'damp', roughness: 0.88, flat: true }),
    rootPale: standard(0x9a8f74, { rough: 'damp', roughness: 0.8 }),
    /**
     * Cobweb. Double-sided, unlit and very thin - a web is only ever visible
     * because it catches a light, so an opaque one reads as a sheet of paper.
     */
    cobweb: () =>
      new THREE.MeshBasicMaterial({ color: 0x9a9a92, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, fog: true }),

    /* --- water, air, smoke -------------------------------------------------- */
    /**
     * Standing black water on a stone floor. Dark and glossy but **not** a black
     * mirror: there is no environment map in this renderer, so a near-black
     * metal at roughness 0.05 reflects nothing at all and reads as a hole cut in
     * the floor. What sells water is a tight highlight on a surface you can
     * still see the colour of.
     */
    water: standard(0x515c5e, { roughness: 0.22, metalness: 0.08 }),
    /** The same water where something luminous is under it. */
    // Faintly, and no more: at emissive 0x1d5a52 / 0.7 the sump in the undercroft was
    // a turquoise swimming pool in a room lit by one tallow lantern. The point is
    // that a player notices something is lighting the water from underneath, not
    // that the water is the brightest thing in the crypt.
    waterLit: standard(0x4a5a56, { roughness: 0.2, metalness: 0.1, emissive: 0x143a33, emissiveIntensity: 0.4 }),
    /** Suspended volume: dust in a shaft, censer smoke, spore haze. Thin, always. */
    // 0.022, not 0.035: two crossed quads double whatever number you pick, and at
    // 0.07 effective a light shaft is a wall of frosted glass.
    hazeWarm: glow(0xffcf92, 0.022),
    hazeCold: glow(0x8fc4d8, 0.022),
    hazeSpore: glow(0xb49aff, 0.03),
    smoke: glow(0x14121a, 0.1),

    /* --- flame, ember, glow ------------------------------------------------- */
    /** A living flame. Unlit, so a candle is a candle even with nothing lighting it. */
    flame: glow(0xffd89a, 0.95),
    flameGreen: glow(0x9affc0, 0.9),
    flameViolet: glow(0xcfa8ff, 0.9),
    ember: glow(0xff7a34, 0.9),
    /** A wick still in the wax, and the char on it. */
    wick: standard(0x2a2622, { roughness: 0.95 }),
    /** Tallow burning in a niche: the Sanctum's whole lighting design. */
    lumenTallow: standard(0xe0b878, { emissive: 0xffa848, emissiveIntensity: 2.6, roughness: 0.5 }),
    /** Oil burning in a pottery lamp: the Necropolis's, hotter and lower. */
    lumenOil: standard(0xdca858, { emissive: 0xff8a20, emissiveIntensity: 2.9, roughness: 0.5 }),
    /** Witchfire. Nothing natural is this colour, which is exactly the point. */
    lumenSoul: standard(0x7ad8a0, { emissive: 0x38ff9a, emissiveIntensity: 2.7, roughness: 0.42 }),
    lumenSpore: standard(0x9c7ed8, { emissive: 0x8a4cff, emissiveIntensity: 2.5, roughness: 0.44 }),
    lumenRed: standard(0xc04a40, { emissive: 0xff3820, emissiveIntensity: 2.2, roughness: 0.46 }),
    /** A cut rune with something in the cut. Reads as a line of light on stone. */
    runeGold: standard(0xc9a24a, { emissive: 0xffb43c, emissiveIntensity: 2.0, roughness: 0.5 }),
    runeSoul: standard(0x6ac490, { emissive: 0x2ce894, emissiveIntensity: 2.2, roughness: 0.5 }),

    /* --- glass and what is behind it ---------------------------------------- */
    /**
     * A stained lancet, seen from inside a crypt at night. It is emissive
     * because there is a sky behind it and no light in here to light it - but
     * tuned well down: the moment a window is brighter than the candles the room
     * stops making sense and becomes a room with a television in it.
     */
    lancetGlass: standard(0xffffff, {
      map: tex.stainedLancet,
      emissive: 0xffffff,
      emissiveMap: tex.stainedLancet,
      emissiveIntensity: 1.5,
      roughness: 0.24,
      side: THREE.DoubleSide,
    }),
    glassPane: () =>
      new THREE.MeshStandardMaterial({
        color: 0xa4b8b4,
        roughness: 0.08,
        metalness: 0.14,
        transparent: true,
        opacity: 0.19,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    glassCrack: glow(0xd8e4e0, 0.45),
    /** The dark on the other side of a grate. A picture of depth; never lit. */
    backdropVoid: picture(tex.voidBackdrop),
    backdropWarm: picture(tex.sandVoidBackdrop),

    /* --- names shared art requires (docs/art/SHARED_ART.md §3.1) ------------ */
    /**
     * Doors are iron-bound oak. `doorSkin`, not `surface.ashlar`: shared art is
     * not batched, so a leaf carries ONE UV repeat and a tiling map smears
     * across it into a blank slab. See textures.ts.
     */
    door: standard(0xffffff, { map: tex.doorSkin, rough: 'damp', roughness: 0.84 }),
    doorFrame: standard(0x6a6c64, { rough: 'damp', roughness: 0.86 }),
    lockIndicator: standard(0xc03a2c, { emissive: 0xff3a20, emissiveIntensity: 1.8, roughness: 0.4 }),

    /**
     * The way out is upward, into air. Nothing else this deep is the colour of
     * a sky, which is the entire design brief for an exit door.
     */
    exitDoor: standard(0x8f9a86, { rough: 'damp', roughness: 0.7 }),
    exitFrame: standard(0x59604f, { roughness: 0.82 }),
    exitGlow: glow(0xdff0c0, 0.24),

    chest: standard(0xffffff, { map: tex.chestSkin, rough: 'damp', roughness: 0.78 }),
    chestTrim: standard(0xb59247, { rough: 'iron', roughness: 0.42, metalness: 0.45 }),
    locker: standard(0xffffff, { map: tex.lockerSkin, rough: 'damp', roughness: 0.84 }),
    lockerVent: standard(0x2b241c, { roughness: 0.92 }),

    /* --- the item roster ---------------------------------------------------- */
    itemMetal: standard(0xc4b072, { roughness: 0.36, metalness: 0.5 }),
    itemSteel: standard(0x939aa2, { roughness: 0.42, metalness: 0.5 }),
    itemWood: standard(0x6d4f30, { roughness: 0.9 }),
    itemCloth: standard(0xcdc3a8, { roughness: 1 }),
    itemAccent: standard(0x9c3a2a, { roughness: 0.68 }),
    itemBrass: standard(0xc4a054, { roughness: 0.32, metalness: 0.5 }),
    itemEnamel: standard(0xe2dac4, { roughness: 0.4 }),
    itemGold: standard(0xd0a844, { roughness: 0.3, metalness: 0.5 }),
    itemTar: standard(0x0e0f13, { roughness: 0.16, metalness: 0.25 }),
    itemGlass: () =>
      new THREE.MeshStandardMaterial({ color: 0xa8bcc4, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.32 }),
    itemGem: standard(0xcbe4ff, { roughness: 0.04, metalness: 0.15, emissive: 0x6fb0e0, emissiveIntensity: 0.8 }),

    /* --- thrown-item effects ------------------------------------------------ */
    'vfx.tar': () =>
      new THREE.MeshStandardMaterial({ color: 0x0d0e12, roughness: 0.14, metalness: 0.3, transparent: true, opacity: 0.95 }),
    'vfx.tarRim': standard(0x2b2822, { roughness: 0.85 }),
    'vfx.flash': () =>
      new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.9, depthWrite: false, fog: false }),

    playerBody: standard(0x6a6152, { roughness: 0.88 }),
    playerMask: standard(0xd4cbb4, { roughness: 0.6 }),

    // Cloned by the ghost builder so it can tint per alert level without touching
    // the shared cache - see art/shared/characters/ghost.ts.
    ghostShroud: () =>
      new THREE.MeshStandardMaterial({ color: 0x39352c, roughness: 1, transparent: true, opacity: 0.84 }),
    ghostAlert: () => new THREE.MeshStandardMaterial({ color: 0x8fa85c, emissive: 0x8fa85c, emissiveIntensity: 1 }),
  });
}
