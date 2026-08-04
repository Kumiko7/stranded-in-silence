/**
 * Ravenhollow Manor's material library.
 *
 * Every material in the pack is created once, here, and handed out by name. A
 * room that calls `ctx.materials.get('wall.damaskGreen')` three hundred times
 * gets the same object three hundred times, which is what lets `MeshBatcher`
 * collapse a room to a handful of draw calls.
 *
 * The names come in two families:
 *   - `surface.*` for architecture (floors, walls, ceilings, trim)
 *   - everything else for props
 * plus the fixed names shared art requires (see docs/art/SHARED_ART.md §3.1).
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
  roughnessMap?: boolean;
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
      roughness: opts.roughness ?? 0.92,
      metalness: opts.metalness ?? 0,
      flatShading: opts.flat ?? false,
    });
    if (opts.map) material.map = opts.map();
    if (opts.normalMap) material.normalMap = opts.normalMap();
    if (opts.roughnessMap) material.roughnessMap = tex.grimeRoughness();
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

/** Unlit. For flames, filaments and glows that must survive being in the dark. */
const glow = (color: number, opacity = 1): (() => THREE.Material) => () =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    fog: true,
  });

export function createMaterials(): MaterialLibrary {
  return materialLibrary({
    /* --- floors ----------------------------------------------------------- */
    'surface.parquet': standard(0xffffff, { map: tex.parquet, normalMap: tex.parquetNormal, roughnessMap: true, roughness: 0.72 }),
    'surface.boards': standard(0xffffff, { map: tex.boards, roughnessMap: true, roughness: 0.95 }),
    'surface.marble': standard(0xffffff, { map: tex.marbleCheck, roughnessMap: true, roughness: 0.45 }),
    'surface.carpet': standard(0xffffff, { map: tex.carpet, roughness: 1 }),
    'surface.tile': standard(0xffffff, { map: tex.wallTile, normalMap: tex.wallTileNormal, roughness: 0.35 }),
    'surface.brick': standard(0xffffff, { map: tex.brick, normalMap: tex.brickNormal, roughnessMap: true }),
    'surface.stone': standard(0xffffff, { map: tex.stone, roughnessMap: true }),

    /* --- walls ------------------------------------------------------------ */
    'surface.damaskGreen': standard(0xffffff, { map: tex.damaskGreen, roughnessMap: true }),
    'surface.damaskRed': standard(0xffffff, { map: tex.damaskRed, roughnessMap: true }),
    'surface.damaskBlue': standard(0xffffff, { map: tex.damaskBlue, roughnessMap: true }),
    'surface.plaster': standard(0xffffff, { map: tex.plaster, roughnessMap: true }),
    'surface.panel': standard(0xffffff, { map: tex.walnut, roughnessMap: true, roughness: 0.68 }),
    'surface.ceiling': standard(0xffffff, { map: tex.ceilingPlaster, roughness: 0.98 }),

    /* --- structural timber and trim --------------------------------------- */
    wood: standard(0xffffff, { map: tex.walnut, roughness: 0.72 }),
    woodPale: standard(0xb59a72, { roughness: 0.9 }),
    woodDark: standard(0x6a4b30, { roughness: 0.8 }),
    beam: standard(0x6d5637, { roughness: 0.95, flat: true }),

    /* --- metals ----------------------------------------------------------- */
    brass: standard(0xb8964e, { roughness: 0.34, metalness: 0.85 }),
    iron: standard(0x74777e, { roughness: 0.62, metalness: 0.6 }),
    ironBlack: standard(0x54565d, { roughness: 0.78, metalness: 0.45 }),
    silver: standard(0xc2c6cc, { roughness: 0.24, metalness: 0.9 }),
    copper: standard(0xa9663c, { roughness: 0.42, metalness: 0.8 }),
    rust: standard(0x8a5636, { roughness: 0.98, roughnessMap: true }),

    /* --- soft furnishing -------------------------------------------------- */
    velvetRed: standard(0x7e4048, { roughness: 0.96 }),
    velvetGreen: standard(0x47604f, { roughness: 0.96 }),
    velvetGold: standard(0x9a7f42, { roughness: 0.94 }),
    leather: standard(0x6c4a34, { roughness: 0.66 }),
    dustSheet: standard(0xffffff, { map: tex.dustCanvas, roughness: 1 }),
    linen: standard(0xb4ae9d, { roughness: 1 }),
    /**
     * Hanging cloth. Double-sided because a sheet on a line is one plane with a
     * player on either side of it, and faintly self-lit because real linen with a
     * lamp behind it glows rather than going black - which is what a backlit
     * single-sided plane does, and it reads as a hole in the room.
     */
    sheetLinen: standard(0xb4ae9d, {
      map: tex.dustCanvas,
      roughness: 1,
      side: THREE.DoubleSide,
      emissive: 0x6b6455,
      emissiveIntensity: 0.3,
    }),

    /* --- surfaces you look at closely ------------------------------------- */
    porcelain: standard(0xd2d2c9, { roughness: 0.22 }),
    marbleWhite: standard(0xbdb8ab, { roughness: 0.38 }),
    marbleBlack: standard(0x5a5860, { roughness: 0.34 }),
    gilt: standard(0xc0a05a, { roughness: 0.3, metalness: 0.75 }),
    paper: standard(0xa9a394, { roughness: 1 }),
    portrait: standard(0xffffff, { map: tex.portraits, roughness: 0.62 }),
    mirror: standard(0x8d94a0, { roughness: 0.08, metalness: 1 }),
    glass: standard(0x9fb0b8, { roughness: 0.06, metalness: 0.1, transparent: 0.22 }),
    stained: standard(0xffffff, {
      map: tex.stainedGlass,
      emissive: 0xffffff,
      emissiveMap: tex.stainedGlass,
      emissiveIntensity: 1.6,
      roughness: 0.35,
    }),

    /* --- organic ---------------------------------------------------------- */
    soil: standard(0x5f4f3f, { roughness: 1 }),
    deadLeaf: standard(0x6e6642, { roughness: 1, side: THREE.DoubleSide }),
    ivy: standard(0x4d5c42, { roughness: 1, side: THREE.DoubleSide }),
    fur: standard(0x6d573c, { roughness: 1 }),
    bone: standard(0xbdb49c, { roughness: 0.8 }),
    wax: standard(0xd8cdb2, { roughness: 0.6 }),
    cobweb: standard(0xc8c8c8, { transparent: 0.16, side: THREE.DoubleSide, roughness: 1 }),
    ash: standard(0x6b6a68, { roughness: 1 }),

    /* --- books, in three tired colours ------------------------------------ */
    bookRed: standard(0x8a4b42, { roughness: 0.92 }),
    bookGreen: standard(0x53664c, { roughness: 0.92 }),
    bookTan: standard(0xa08a63, { roughness: 0.92 }),

    /* --- light sources (unlit, so they read in the dark) ------------------- */
    flame: glow(0xffb45a),
    emberGlow: glow(0xff7a33, 0.85),
    lampShade: standard(0xd9b98a, { emissive: 0xffcf95, emissiveIntensity: 0.9, roughness: 0.9, transparent: 0.92 }),
    bulb: glow(0xffe4b0),
    moonShaft: glow(0x9fb6d8, 0.055),
    warmShaft: glow(0xffc98a, 0.06),

    /* --- names shared art requires (docs/art/SHARED_ART.md §3.1) ----------- */
    door: standard(0xffffff, { map: tex.walnut, roughness: 0.7 }),
    doorFrame: standard(0x5b442c, { roughness: 0.8 }),
    lockIndicator: standard(0xc9a227, { emissive: 0xc9a227, emissiveIntensity: 1.1, roughness: 0.4, metalness: 0.6 }),

    exitDoor: standard(0x6f8f74, { roughness: 0.7 }),
    exitFrame: standard(0x44553f, { roughness: 0.85 }),
    exitGlow: glow(0x7fe8ad, 0.18),

    chest: standard(0x6f4f31, { roughness: 0.82 }),
    chestTrim: standard(0xb8964e, { roughness: 0.36, metalness: 0.8 }),
    locker: standard(0x7d715e, { roughness: 0.72, metalness: 0.15 }),
    lockerVent: standard(0x4a4740, { roughness: 0.9 }),
    itemMetal: standard(0xc4b072, { roughness: 0.34, metalness: 0.85 }),

    playerBody: standard(0x6f7690, { roughness: 0.85 }),
    playerMask: standard(0xd8d4c8, { roughness: 0.6 }),

    // Cloned by the ghost builder so it can tint per alert level without
    // touching the shared cache - see art/shared/characters/ghost.ts.
    ghostShroud: () =>
      new THREE.MeshStandardMaterial({ color: 0x2f3648, roughness: 1, transparent: true, opacity: 0.82 }),
    ghostAlert: () => new THREE.MeshStandardMaterial({ color: 0x39506b, emissive: 0x39506b, emissiveIntensity: 1 }),
  });
}
