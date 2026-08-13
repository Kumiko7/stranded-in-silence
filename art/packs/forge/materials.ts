/**
 * Vulcan's Anvil's material library.
 *
 * Every material in the pack is created once, here, and handed out by name, so a
 * room that asks for `surface.panel` three hundred times gets the same object
 * three hundred times - which is what lets `MeshBatcher` collapse a room built
 * from four hundred boxes down to a handful of draw calls.
 *
 * Names come in three families:
 *   - `surface.*`  architecture (the shell: floors, walls, ceilings, bands)
 *   - plain names  props (steel, cable, glass, magma, chitin...)
 *   - fixed names  the ones shared art requires (docs/art/SHARED_ART.md §3.1)
 *
 * **Emission is this pack's lighting budget.** There are two real lights per
 * room and no player torch, so most of what a player navigates by is an emissive
 * surface: the crack network in a hot floor, an arc tube, a mimic board, the
 * heat register round the base of every wall. Those are tuned to read at 6-8 m
 * through the map's fog, and they are the reason a room can look lit while
 * spending one point light on it.
 *
 * **Three temperatures, and the split is inverted from the usual horror rule.**
 * The Works lights itself COLD - arc-white, cyan, with red where a circuit has
 * given up. The Mountain lights itself with the only genuinely hot thing here,
 * so it is orange and gold. The ambient fill is cold blue, which the Works sits
 * inside and the Mountain fights. The bio strand is a sick green that belongs to
 * neither, which is the whole point of it.
 *
 * One number decides whether all of that works: **an emissive is judged against
 * the room's own lamps, never on its own.** The moment a decoration reads
 * brighter than the practicals it stops being a detail and becomes the light
 * source, and the room's design collapses - which is why the ember crust in the
 * wall register runs at a third of the lava lake's intensity even though they
 * are physically the same substance.
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
  /** Scuffed metal, dry grit, or melted-to-glass. Rooms never pick this - the surface does. */
  rough?: 'metal' | 'dry' | 'glassy';
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
    if (opts.rough === 'metal') material.roughnessMap = tex.metalRoughness();
    if (opts.rough === 'dry') material.roughnessMap = tex.dryRoughness();
    if (opts.rough === 'glassy') material.roughnessMap = tex.glassyRoughness();
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

/** Unlit. For anything that has to survive being in the dark: filament, plasma, glass. */
const glow = (color: number, opacity = 1): (() => THREE.Material) => () =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide,
    fog: true,
  });

/**
 * Light landing on something, rather than a surface. Additive drops the dark half
 * of the texture entirely and only the bright part lands, which is what light
 * actually does - painted as an ordinary emissive decal, a glow pool brings its
 * own black background and lays it over the floor (docs/art/ROOM_REVIEW.md).
 */
const additive = (color: number, opacity: number, map?: () => THREE.Texture): (() => THREE.Material) => () => {
  const material = new THREE.MeshBasicMaterial({
    color,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    opacity,
    fog: true,
  });
  if (map) material.map = map();
  return material;
};

/** Unlit and mapped: a picture that must not be lit, like the shaft behind a slit. */
const picture = (map: () => THREE.Texture, color = 0xffffff, side: THREE.Side = THREE.FrontSide): (() => THREE.Material) => () =>
  new THREE.MeshBasicMaterial({ color, map: map(), fog: true, side });

export function createMaterials(): MaterialLibrary {
  return materialLibrary({
    /* --- the shell: the Works ---------------------------------------------- */
    'surface.hex': standard(0xffffff, { map: tex.hexTile, normalMap: tex.hexTileNormal, rough: 'dry', roughness: 0.78 }),
    'surface.grate': standard(0xffffff, { map: tex.grating, normalMap: tex.gratingNormal, rough: 'metal', metalness: 0.6, roughness: 0.56 }),
    'surface.ferro': standard(0xffffff, { map: tex.ferrocrete, rough: 'dry', roughness: 0.86 }),
    'surface.panel': standard(0xffffff, { map: tex.graphitePanel, normalMap: tex.graphitePanelNormal, rough: 'metal', metalness: 0.5, roughness: 0.6 }),
    'surface.stencil': standard(0xffffff, { map: tex.stencilSteel, rough: 'metal', metalness: 0.3, roughness: 0.7 }),
    'surface.hazard': standard(0xffffff, { map: tex.hazardChevron, rough: 'metal', metalness: 0.2, roughness: 0.66 }),
    'surface.scorch': standard(0xffffff, { map: tex.scorchedPlate, rough: 'metal', metalness: 0.62, roughness: 0.5 }),
    'surface.duct': standard(0xffffff, { map: tex.ductPanel, rough: 'metal', metalness: 0.42, roughness: 0.66 }),

    /* --- the shell: the Mountain -------------------------------------------- */
    'surface.basalt': standard(0xffffff, { map: tex.basalt, normalMap: tex.basaltNormal, rough: 'dry', roughness: 0.82, flat: false }),
    'surface.tuff': standard(0xffffff, { map: tex.tuff, normalMap: tex.tuffNormal, rough: 'dry', roughness: 0.9 }),
    'surface.obsidian': standard(0xffffff, { map: tex.obsidian, normalMap: tex.obsidianNormal, rough: 'glassy', roughness: 0.2, metalness: 0.15 }),
    'surface.ash': standard(0xffffff, { map: tex.ashFloor, normalMap: tex.ashNormal, rough: 'dry', roughness: 0.96 }),
    'surface.sulphur': standard(0xffffff, { map: tex.sulphurCrust, normalMap: tex.sulphurNormal, rough: 'dry', roughness: 0.72 }),
    'surface.slag': standard(0xffffff, { map: tex.slag, rough: 'glassy', roughness: 0.4 }),

    /**
     * The lava lake, and the hottest surface in the game.
     *
     * Colour map for what it looks like, emissive map for what it emits, and the
     * emissive colour left at white so the HUE ramp painted into the picture
     * comes through - which is what makes the middle of a crack read as hotter
     * rather than merely brighter. `emissiveIntensity` is the one number the
     * whole map's balance hangs on: at 2 it was a sheet of orange plastic and
     * every room it stood in lost its own lamps.
     */
    'surface.magma': standard(0xffffff, {
      map: tex.magmaCrust,
      normalMap: tex.magmaNormal,
      emissive: 0xffffff,
      emissiveMap: tex.magmaEmissive,
      emissiveIntensity: 0.95,
      rough: 'glassy',
      roughness: 0.44,
    }),
    /**
     * The same substance a stage cooler, and the pack's signature: the heat
     * register that runs round the base of every wall in the map. It is on
     * hundreds of metres of wall, so it is deliberately dim - a third of the
     * lake - or the whole map washes orange with no darkness left anywhere.
     */
    'surface.crust': standard(0xffffff, {
      map: tex.emberCrust,
      emissive: 0xffffff,
      emissiveMap: tex.emberCrustEmissive,
      emissiveIntensity: 0.6,
      rough: 'dry',
      roughness: 0.8,
    }),
    /** The register a stage hotter, for the few rooms with a live fissure in them. */
    'surface.crustHot': standard(0xffffff, {
      map: tex.emberCrust,
      emissive: 0xffffff,
      emissiveMap: tex.emberCrustEmissive,
      emissiveIntensity: 1.0,
      rough: 'dry',
      roughness: 0.78,
    }),

    /* --- the bio strand ------------------------------------------------------ */
    chitin: standard(0xffffff, {
      map: tex.chitin,
      emissive: 0xffffff,
      emissiveMap: tex.chitinEmissive,
      emissiveIntensity: 0.85,
      roughness: 0.54,
    }),
    /** The soft part. Thin, double-sided and faintly lit, so a lamp behind it glows through. */
    membrane: standard(0x86a06a, {
      roughness: 0.4,
      transparent: 0.38,
      side: THREE.DoubleSide,
      emissive: 0x4ad07a,
      emissiveIntensity: 0.7,
    }),
    /**
     * What has run out of a broken tank and pooled on the deck. NOT `membrane`:
     * a translucent pale sheet lying flat reads as a green rug, which is what the
     * first pass of the Vivarium had on its floor. Dark, wet and glossy, with
     * only enough glow to say it is not water.
     */
    bioSpill: standard(0x1e3326, { roughness: 0.14, metalness: 0.12, emissive: 0x1a6a3c, emissiveIntensity: 0.5 }),
    /** Tendon and root: dark, matte, and it must read as a silhouette not a glow. */
    sinew: standard(0x4a5240, { roughness: 0.86, flat: true }),
    /** A pod full of something. Back-faced so the contents sit in front of the fluid. */
    bioFluid: () => new THREE.MeshBasicMaterial({ color: 0x46b47c, side: THREE.BackSide, fog: true }),

    /* --- Works props --------------------------------------------------------- */
    steel: standard(0x757b80, { rough: 'metal', roughness: 0.5, metalness: 0.62 }),
    steelDark: standard(0x40454a, { rough: 'metal', roughness: 0.58, metalness: 0.58 }),
    steelPale: standard(0xa2a9ad, { rough: 'metal', roughness: 0.38, metalness: 0.68 }),
    /**
     * Refractory brick and castable: the lining of anything that holds heat.
     * Pale and dusty, and the one warm-neutral in the Works' cold half - which
     * is what stops a furnace reading as a filing cabinet.
     */
    firebrick: standard(0xa89078, { rough: 'dry', roughness: 0.92 }),
    /** Graphite: crucibles, electrodes, tile. Nearly black and very matte. */
    graphite: standard(0x3c3d42, { roughness: 0.94 }),
    painted: standard(0x5c7a72, { rough: 'metal', roughness: 0.66, metalness: 0.16 }),
    paintedWarn: standard(0xb2882c, { rough: 'metal', roughness: 0.64, metalness: 0.14 }),
    paintedRed: standard(0x9c3a2e, { rough: 'metal', roughness: 0.66, metalness: 0.14 }),
    /** Heat-tempered plate as a prop material, for gantries and shielding. */
    tempered: standard(0xffffff, { map: tex.scorchedPlate, rough: 'metal', roughness: 0.48, metalness: 0.6 }),
    copperBus: standard(0x8d5c30, { rough: 'metal', roughness: 0.42, metalness: 0.72 }),
    cable: standard(0x282c31, { roughness: 0.82 }),
    rubber: standard(0x2c3034, { roughness: 0.96 }),
    plastic: standard(0xb8bab0, { roughness: 0.52 }),
    /** Silvered heat-proximity suit. The only reflective cloth in the map. */
    heatSuit: standard(0xb6bcc0, { rough: 'metal', roughness: 0.3, metalness: 0.55 }),
    canvasPale: standard(0xa8a08c, { roughness: 0.94 }),
    /**
     * Ward curtain and anything else hung as a sheet. Double-sided and faintly
     * self-lit for the same reason the manor's hanging linen is: a single-sided
     * blade with a lamp behind it reads as a hole cut in the room, and real
     * fabric backlit glows.
     */
    curtain: standard(0x8f9aa0, {
      roughness: 0.95,
      side: THREE.DoubleSide,
      transparent: 0.88,
      emissive: 0x2c3238,
      emissiveIntensity: 0.5,
    }),
    /** Cold: the one refrigerated room in a volcano, and its frost. */
    frost: standard(0xc4d8de, { roughness: 0.6 }),
    rime: standard(0xa8c2c8, { roughness: 0.74, transparent: 0.3 }),

    /* --- rock props ---------------------------------------------------------- */
    rockDark: standard(0x453f3b, { rough: 'dry', roughness: 0.86, flat: true }),
    rockPale: standard(0x635c54, { rough: 'dry', roughness: 0.9, flat: true }),
    /**
     * Scoria: the frothy cinder a fountain throws. Knocked well back from the red
     * it wants to be - a floor of saturated cinders reads as gravel from a garden
     * centre, and the colour in this map has to come from the light.
     */
    cinder: standard(0x4a3a34, { rough: 'dry', roughness: 0.95, flat: true }),
    /** Volcanic glass as a prop: blades, shards, a knapped edge. */
    glassRock: standard(0x36323a, { rough: 'glassy', roughness: 0.16, metalness: 0.2, flat: true }),
    sulphurCrystal: standard(0xc4bc44, { roughness: 0.42, emissive: 0x6a6410, emissiveIntensity: 0.4, flat: true }),
    /** Fine ash as a prop: drifts, cones, the dust on everything. */
    ashPale: standard(0x6d675f, { rough: 'dry', roughness: 0.97 }),
    /** Boiling mud. Matte, grey-brown, and it moves. */
    mud: standard(0x6b6055, { roughness: 0.88 }),

    /* --- glass ---------------------------------------------------------------- */
    /**
     * Laminated blast glazing. Glass reads by its HIGHLIGHT, not by its
     * brightness - low roughness, a little metalness and almost no opacity. An
     * emissive pane would be a lamp, which is exactly what a viewing slit must
     * not look like (docs/art/ROOM_REVIEW.md).
     */
    glassPane: () =>
      new THREE.MeshStandardMaterial({
        color: 0xa8b8bc,
        roughness: 0.07,
        metalness: 0.18,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    /** The cut edge of thick laminate: the one place the material shows its colour. */
    glassEdge: standard(0x6f9aa4, { roughness: 0.16, metalness: 0.22, emissive: 0x2c5f6a, emissiveIntensity: 0.5 }),
    glassCrack: glow(0xd8e8ec, 0.5),
    /**
     * Gold-film radiant shielding on an observation port. Real furnace glass is
     * gold-coated to bounce the infra-red back, and it is the one see-through
     * surface in the map that is WARM - which is why anything viewed through it
     * reads as much hotter than the same thing seen through plain laminate.
     */
    goldFilm: () =>
      new THREE.MeshStandardMaterial({
        color: 0xd8ae58,
        roughness: 0.1,
        metalness: 0.5,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),

    /* --- what is on the other side ------------------------------------------- */
    backdropShaft: picture(tex.shaftBackdrop),
    backdropSky: picture(tex.skyBackdrop),
    /**
     * Suspended volume - heat shimmer, dust in a beam, steam, gas.
     *
     * All of it is **additive and masked**, which is two lessons at once. Additive
     * because vapour in a dark room is light scattering, not a grey surface: an
     * alpha-blended plume lays a film over whatever is behind it and greys out the
     * very thing it is rising off. Masked because a bare quad has four hard edges
     * and reads as a pane of fog standing in the room, however faint you make it.
     */
    hazeWarm: additive(0xff9a50, 0.16, tex.plumeFade),
    hazeCold: additive(0x9fd0e8, 0.13, tex.plumeFade),
    steam: additive(0xa8b0b6, 0.23, tex.plumeFade),
    /** The same volume coming off a sulphur vent: citron, and no more opaque. */
    hazeSulphur: additive(0xc0c458, 0.15, tex.plumeFade),
    /** Smoke off something burning. Nearly black, so it reads as a hole in the light. */
    smoke: glow(0x14100e, 0.08),

    /* --- screens and signage --------------------------------------------------- */
    screenMimic: standard(0xffffff, {
      map: tex.screenMimic,
      emissive: 0xffffff,
      emissiveMap: tex.screenMimic,
      emissiveIntensity: 1.9,
      roughness: 0.22,
    }),
    screenSeismo: standard(0xffffff, {
      map: tex.screenSeismo,
      emissive: 0xffffff,
      emissiveMap: tex.screenSeismo,
      emissiveIntensity: 2.0,
      roughness: 0.22,
    }),
    screenData: standard(0xffffff, {
      map: tex.screenReadout,
      emissive: 0xffffff,
      emissiveMap: tex.screenReadout,
      emissiveIntensity: 1.85,
      roughness: 0.22,
    }),
    /** A dead screen. There have to be some, or a wall of monitors reads as a disco. */
    screenDead: standard(0x1a1e22, { roughness: 0.26, metalness: 0.25 }),
    signAmber: standard(0xba862a, { emissive: 0xffa42a, emissiveIntensity: 1.5, roughness: 0.44 }),
    signRed: standard(0xa03028, { emissive: 0xff2a18, emissiveIntensity: 1.7, roughness: 0.44 }),

    /* --- the things that glow ---------------------------------------------------- */
    /**
     * The pack's light sources. Saturated on purpose: an emissive that is nearly
     * white blows out under ACES and stops reading as a colour of light at all.
     */
    lumenArc: standard(0xcfe0e8, { emissive: 0xd0ecff, emissiveIntensity: 2.6, roughness: 0.34 }),
    lumenCyan: standard(0x5cc8dc, { emissive: 0x2ad0ff, emissiveIntensity: 2.8, roughness: 0.4 }),
    lumenRed: standard(0xc0403a, { emissive: 0xff2a18, emissiveIntensity: 2.5, roughness: 0.42 }),
    lumenAmber: standard(0xe0a052, { emissive: 0xff8c1e, emissiveIntensity: 2.9, roughness: 0.44 }),
    lumenGreen: standard(0x66c88a, { emissive: 0x3cf089, emissiveIntensity: 2.6, roughness: 0.42 }),
    /** Molten metal running out of a spout. Brighter than anything else, briefly. */
    lumenMolten: standard(0xffc060, { emissive: 0xffb43c, emissiveIntensity: 2.5, roughness: 0.3 }),
    /** A working filament or arc behind glass. Unlit, so a bulb is a bulb in the dark. */
    bulb: glow(0xffe6c0, 0.95),
    bulbCold: glow(0xdcf2ff, 0.95),
    ember: glow(0xff7a30, 0.9),

    /* --- light AS light, not as a surface ------------------------------------- */
    /**
     * The pools a light throws on the floor and wall around it.
     *
     * Two things make these work and both were learned the hard way on the first
     * contact sheet. **Additive**, so the dark half of the material contributes
     * nothing and only the net brightness lands - painted as an ordinary emissive
     * decal a pool brings its own black background with it. And **masked with a
     * radial falloff**, so it ends by fading rather than on a hard circle: at a
     * flat 0.3 with no map, every floor in the map had a beige pancake on it and
     * the rooms lost their darkness entirely.
     */
    heatWash: additive(0xff7024, 0.34, tex.radialFalloff),
    /** The pool of an arc lamp. Cold, tight, and it belongs to the Works. */
    arcWash: additive(0x9cd8ff, 0.26, tex.radialFalloff),
    /** A laser: a line of light, drawn additively so it never has a dark edge. */
    beamRed: additive(0xff2452, 0.42),
    beamCyan: additive(0x40e8ff, 0.36),
    /** The bio strand's own wash. */
    bioWash: additive(0x46ff96, 0.24, tex.radialFalloff),

    /* --- names shared art requires (docs/art/SHARED_ART.md §3.1) --------------- */
    /**
     * Doors are blast hatches. `blastDoorSkin`, not `surface.panel`: shared art
     * is not batched, so a door leaf carries ONE UV repeat and a tiling map
     * smears across it into a blank slab. See textures.ts.
     */
    door: standard(0xffffff, { map: tex.blastDoorSkin, rough: 'metal', roughness: 0.6, metalness: 0.42 }),
    doorFrame: standard(0x4a4f54, { rough: 'metal', roughness: 0.68, metalness: 0.36 }),
    lockIndicator: standard(0xc03c2e, { emissive: 0xff3a24, emissiveIntensity: 1.8, roughness: 0.35 }),

    /**
     * The way out is up, and up is the only cold clean colour left in the map -
     * which is the entire design brief for an exit door in a place like this.
     */
    exitDoor: standard(0xffffff, { map: tex.exitDoorSkin, rough: 'metal', roughness: 0.52, metalness: 0.3 }),
    exitFrame: standard(0x35544f, { roughness: 0.74 }),
    exitGlow: glow(0xa8f0e0, 0.22),

    chest: standard(0xffffff, { map: tex.caseSkin, rough: 'metal', roughness: 0.58, metalness: 0.28 }),
    chestTrim: standard(0xa4aca4, { rough: 'metal', roughness: 0.42, metalness: 0.6 }),
    locker: standard(0xffffff, { map: tex.lockerSkin, rough: 'metal', roughness: 0.6, metalness: 0.32 }),
    lockerVent: standard(0x272d2b, { roughness: 0.88 }),

    /* --- the item roster ------------------------------------------------------- */
    itemMetal: standard(0xc4b072, { roughness: 0.34, metalness: 0.85 }),
    itemSteel: standard(0x8d9199, { roughness: 0.4, metalness: 0.78 }),
    itemWood: standard(0x7a5734, { roughness: 0.88 }),
    itemCloth: standard(0xd4cbb4, { roughness: 1 }),
    itemAccent: standard(0xb0472c, { roughness: 0.66 }),
    itemBrass: standard(0xbe9a4c, { roughness: 0.28, metalness: 0.9 }),
    itemEnamel: standard(0xe6dfc9, { roughness: 0.4 }),
    itemGold: standard(0xc9a13a, { roughness: 0.26, metalness: 0.95 }),
    itemTar: standard(0x0e0f13, { roughness: 0.16, metalness: 0.25 }),
    itemGlass: () =>
      new THREE.MeshStandardMaterial({ color: 0xa8bcc4, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.32 }),
    itemGem: standard(0xffd0a0, { roughness: 0.05, metalness: 0.15, emissive: 0xff8a3c, emissiveIntensity: 0.8 }),

    /* --- thrown-item effects ----------------------------------------------------- */
    'vfx.tar': () =>
      new THREE.MeshStandardMaterial({ color: 0x0d0e12, roughness: 0.14, metalness: 0.3, transparent: true, opacity: 0.95 }),
    'vfx.tarRim': standard(0x2b2822, { roughness: 0.85 }),
    'vfx.flash': () =>
      new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.9, depthWrite: false, fog: false }),

    playerBody: standard(0x6c7a80, { roughness: 0.82 }),
    playerMask: standard(0xd8d2c4, { roughness: 0.56 }),

    // Cloned by the ghost builder so it can tint per alert level without touching
    // the shared cache - see art/shared/characters/ghost.ts.
    ghostShroud: () =>
      new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 1, transparent: true, opacity: 0.82 }),
    ghostAlert: () => new THREE.MeshStandardMaterial({ color: 0x8a6a2c, emissive: 0x8a6a2c, emissiveIntensity: 1 }),
  });
}
