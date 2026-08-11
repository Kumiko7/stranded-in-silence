/**
 * The lobby cabin's material library.
 *
 * The lobby is not a map, so it has no art pack and no pack material library -
 * it brings its own. It still satisfies every name shared art asks for
 * (docs/art/SHARED_ART.md §3.1), because the player model stands in front of the
 * wardrobe and is built through the same registry as everywhere else.
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
  roughnessMap?: () => THREE.Texture;
  emissive?: number;
  emissiveIntensity?: number;
  emissiveMap?: () => THREE.Texture;
  transparent?: number;
  side?: THREE.Side;
  flat?: boolean;
  /** Skip fog: only the sky dome, which IS the far distance. */
  fog?: boolean;
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
    if (opts.roughnessMap) material.roughnessMap = opts.roughnessMap();
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
    if (opts.fog === false) material.fog = false;
    return material;
  };
}

/** Unlit. Flames, embers and the sky, all of which must not be shaded. */
const unlit = (color: number, opacity = 1, fog = true): (() => THREE.Material) => () =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    fog,
    side: THREE.DoubleSide,
  });

/**
 * One lit seven-segment glyph for the dart scoreboard. Unlit, because a digital
 * display is a light source: shading it would make the score dim in the corner
 * of a room where the score is the only thing worth reading.
 */
const glyph = (value: number): (() => THREE.Material) => () =>
  new THREE.MeshBasicMaterial({ map: tex.segmentDigit(value) });

export function createLobbyMaterials(): MaterialLibrary {
  return materialLibrary({
    /* --- the shell -------------------------------------------------------- */
    'cabin.log': standard(0xffffff, { map: tex.pineLog, normalMap: tex.pineLogNormal, roughness: 0.82 }),
    'cabin.floor': standard(0xffffff, { map: tex.plankFloor, normalMap: tex.plankFloorNormal, roughness: 0.6 }),
    'cabin.boards': standard(0xffffff, { map: tex.boardCeiling, roughness: 0.85 }),
    'cabin.stone': standard(0xffffff, { map: tex.fieldstone, normalMap: tex.fieldstoneNormal, roughness: 0.94 }),
    'cabin.soot': standard(0x4a423c, { roughnessMap: tex.sootRoughness, roughness: 1 }),

    /* --- timber ----------------------------------------------------------- */
    beam: standard(0x8a6a45, { roughness: 0.86, flat: true }),
    timber: standard(0xa07d52, { roughness: 0.8 }),
    timberDark: standard(0x6d5133, { roughness: 0.82 }),
    timberPale: standard(0xc6a97e, { roughness: 0.78 }),

    /* --- metal ------------------------------------------------------------ */
    iron: standard(0x5b5f66, { roughness: 0.55, metalness: 0.7 }),
    brass: standard(0xc09a4e, { roughness: 0.3, metalness: 0.85 }),
    copper: standard(0xb0714a, { roughness: 0.4, metalness: 0.8 }),

    /* --- soft ------------------------------------------------------------- */
    rug: standard(0xffffff, { map: tex.wool, roughnessMap: tex.woolRoughness, roughness: 1 }),
    hide: standard(0xffffff, { map: tex.hide, roughness: 0.62 }),
    cushion: standard(0x8d5a4a, { roughness: 0.96 }),
    cushionGreen: standard(0x53694f, { roughness: 0.96 }),
    /**
     * Dust sheet. Textured and double-sided, and faintly self-lit for the same
     * reason the manor's hanging linen is: real cloth with a light behind it
     * glows, and a backlit single-sided plane reads as a hole in the wall.
     */
    canvas: standard(0xffffff, {
      map: tex.dustSheet,
      roughness: 1,
      side: THREE.DoubleSide,
      emissive: 0x6b6455,
      emissiveIntensity: 0.22,
    }),
    fur: standard(0xd9cfbb, { roughness: 1 }),

    /* --- surfaces you look at closely -------------------------------------- */
    paper: standard(0xffffff, { map: tex.posterBlank, roughness: 0.94 }),
    ceramic: standard(0xd8d2c4, { roughness: 0.3 }),
    /**
     * A slot with nothing pinned in it. Knocked back and NOT self-lit: a bright
     * white rectangle on a wall reads as a window, which is the last thing an
     * empty poster frame should look like.
     */
    'poster.blank': standard(0xb9b3a4, { map: tex.posterBlank, roughness: 0.98 }),
    // Printed posters get a whisper of self-illumination so a map you can
    // actually play still reads from across the room.
    'poster.mansion': standard(0xffffff, {
      map: tex.posterMansion,
      emissive: 0xffffff,
      emissiveMap: tex.posterMansion,
      emissiveIntensity: 0.12,
      roughness: 0.95,
    }),
    'poster.viscera': standard(0xffffff, {
      map: tex.posterViscera,
      emissive: 0xffffff,
      emissiveMap: tex.posterViscera,
      emissiveIntensity: 0.12,
      roughness: 0.95,
    }),
    'poster.abyss': standard(0xffffff, {
      map: tex.posterAbyss,
      emissive: 0xffffff,
      emissiveMap: tex.posterAbyss,
      emissiveIntensity: 0.12,
      roughness: 0.95,
    }),
    'poster.test': standard(0xffffff, {
      map: tex.posterTest,
      emissive: 0xffffff,
      emissiveMap: tex.posterTest,
      emissiveIntensity: 0.12,
      roughness: 0.95,
    }),
    'poster.random': standard(0xffffff, {
      map: tex.posterRandom,
      emissive: 0xffffff,
      emissiveMap: tex.posterRandom,
      emissiveIntensity: 0.14,
      roughness: 0.95,
    }),
    // The completion tick. Unlit green so it is unmistakable at a glance.
    'poster.tick': unlit(0x4fbe6a),
    /**
     * The selection border. Logic swaps its colour between "someone picked this"
     * and "you picked this" by tinting the material - it is cloned per poster so
     * that cannot leak into the shared cache.
     */
    'poster.mark': () =>
      new THREE.MeshBasicMaterial({ color: 0xd8593c, transparent: true, opacity: 0.9, fog: true }),

    glass: standard(0xcfe3f2, { roughness: 0.04, metalness: 0.05, transparent: 0.14 }),
    mirror: standard(0xa9b4c2, { roughness: 0.06, metalness: 1 }),
    /**
     * The big mirror's pane. Deliberately *mostly* transparent - what makes it
     * read as a mirror is the frame, the chamber behind it and the copy standing
     * in there; the glass only has to add a cold sheen over the top. Opaque
     * metal would hide the one thing the whole fixture exists to show.
     */
    mirrorGlass: standard(0xbdd2e6, { roughness: 0.05, metalness: 0.9, transparent: 0.22 }),
    /** The raked highlights on that pane. Unlit, or they stop being a highlight. */
    mirrorSheen: unlit(0xeaf3ff, 0.22),

    /* --- the fire ---------------------------------------------------------- */
    flame: unlit(0xff8a2b, 0.9),
    flameCore: unlit(0xffdc86),
    ember: unlit(0xff5a1e, 0.9),
    // Charred wood with a glow in the cracks. It was hotter than this and the
    // log pile read as a heap of molten cylinders through the flames.
    charcoal: standard(0x2f2b28, { roughness: 1, emissive: 0xff5a1e, emissiveIntensity: 0.26 }),
    lampGlow: standard(0xffe0aa, { emissive: 0xffcf95, emissiveIntensity: 1.4, roughness: 0.6, transparent: 0.9 }),

    /* --- the dart annex ------------------------------------------------------ */

    // The sisal, printed. Faintly self-lit for the same reason a poster is: it
    // hangs three metres behind a fence and still has to be readable.
    'dart.board': standard(0xffffff, {
      map: tex.dartboard,
      emissive: 0xffffff,
      emissiveMap: tex.dartboard,
      emissiveIntensity: 0.04,
      roughness: 0.92,
    }),
    'dart.surround': standard(0x241f1c, { roughness: 0.95 }),
    'dart.barrel': standard(0xbcc2cb, { roughness: 0.32, metalness: 0.9 }),
    'dart.flight': standard(0xd8593c, { roughness: 0.8, side: THREE.DoubleSide }),
    'score.panel': standard(0xffffff, { map: tex.scoreSlate, roughness: 0.55, metalness: 0.2 }),
    // Cloned per row by the scoreboard builder, which tints it - see setScores().
    'score.pip': () => new THREE.MeshBasicMaterial({ color: 0xffffff }),
    'score.blank': glyph(-1),
    ...Object.fromEntries(Array.from({ length: 10 }, (_, value) => [`score.digit${value}`, glyph(value)])),

    /* --- outside ----------------------------------------------------------- */
    snow: standard(0xffffff, { map: tex.snow, roughness: 0.72 }),
    rock: standard(0xffffff, { map: tex.rockFace, roughness: 0.95, flat: true }),
    snowCap: standard(0xffffff, { map: tex.snowCap, roughness: 0.8, flat: true }),
    pineNeedle: standard(0xffffff, { map: tex.pineFoliage, roughness: 1, flat: true }),
    /**
     * The lower skirts, and the trees furthest back. Same needles, tinted down
     * and cooled: a fir is darker at the bottom than at the crown, and the fog
     * alone does not get that across at fifteen metres.
     */
    pineNeedleDeep: standard(0x7e8f88, { map: tex.pineFoliage, roughness: 1, flat: true }),
    pineTrunk: standard(0xffffff, { map: tex.pineBark, roughness: 0.95 }),
    // The sky is the far distance itself, so fog must not be applied to it.
    sky: standard(0xffffff, {
      map: tex.sky,
      emissive: 0xffffff,
      emissiveMap: tex.sky,
      emissiveIntensity: 1,
      side: THREE.BackSide,
      fog: false,
      roughness: 1,
    }),
    snowfall: unlit(0xffffff, 0.55),

    /* --- names shared art requires (docs/art/SHARED_ART.md §3.1) ------------ */
    // Only the player model is ever built in the lobby, but the library has to
    // satisfy the whole contract so any shared piece could be placed here later.
    door: standard(0xa07d52, { roughness: 0.8 }),
    doorFrame: standard(0x6d5133, { roughness: 0.85 }),
    lockIndicator: standard(0xc9a227, { emissive: 0xc9a227, emissiveIntensity: 1.1, roughness: 0.4, metalness: 0.6 }),
    exitDoor: standard(0x6f8f74, { roughness: 0.7 }),
    exitFrame: standard(0x44553f, { roughness: 0.85 }),
    exitGlow: unlit(0x7fe8ad, 0.18),
    chest: standard(0x6f4f31, { roughness: 0.82 }),
    chestTrim: standard(0xb8964e, { roughness: 0.36, metalness: 0.8 }),
    locker: standard(0x7d715e, { roughness: 0.72, metalness: 0.15 }),
    lockerVent: standard(0x4a4740, { roughness: 0.9 }),
    itemMetal: standard(0xc4b072, { roughness: 0.34, metalness: 0.85 }),
    // Cloned by the player builder, which tints it per player - see setColour().
    playerBody: () => new THREE.MeshStandardMaterial({ color: 0x6f7690, roughness: 0.85 }),
    playerMask: standard(0xe4dfd2, { roughness: 0.55 }),
    ghostShroud: () =>
      new THREE.MeshStandardMaterial({ color: 0x2f3648, roughness: 1, transparent: true, opacity: 0.82 }),
    ghostAlert: () => new THREE.MeshStandardMaterial({ color: 0x39506b, emissive: 0x39506b, emissiveIntensity: 1 }),
  });
}
