/**
 * Heartwood's material library.
 *
 * Every material in the pack is created once, here, and handed out by name, so a
 * room that asks for `surface.bark` three hundred times gets the same object
 * three hundred times - which is what lets `MeshBatcher` collapse a room built
 * from four hundred boxes down to a handful of draw calls.
 *
 * Names come in three families:
 *   - `surface.*`  architecture (the shell: floors, walls, ceilings, the sapline)
 *   - plain names  props (timber, vine, silk, comb, antler...)
 *   - fixed names  the ones shared art requires (docs/art/SHARED_ART.md §3.1)
 *
 * **Emission is this pack's lighting budget.** There are two real lights per
 * room and no player torch, so most of what a player navigates by is an emissive
 * surface: the sap vein round the base of every wall, a bank of foxfire in a
 * wound, a lantern's own gallery, a comb full of lit honey. Those are tuned to
 * read at 6-8 m through the map's fog, and they are the reason a room can look
 * lit while spending one point light on it.
 *
 * **Three temperatures, and the ordinary horror rule holds here.** The ambient
 * fill is cold blue-green. The **Bower** lights itself warm - tapped sap, wax,
 * moth lanterns, embers - which is what makes a carved hall feel like somewhere
 * people lived. The **Thicket** lights itself cold - foxfire, gill glow, the
 * shine off silk - which is what makes it feel like nobody does. The **Bloom**
 * is violet and belongs to neither, which is why two rooms of it unsettle twenty.
 *
 * Three numbers decide whether all of that works:
 *
 * - **An emissive is judged against the room's own lamps, never on its own.**
 *   The moment a decoration reads brighter than the practicals it stops being a
 *   detail and becomes the light source. The sapline runs at a third of a sap
 *   well's intensity even though it is the same substance.
 * - **Nothing here is a full metal.** There is no environment map in this
 *   renderer, so a `metalness: 0.9` surface can only show what it reflects and
 *   has nothing to reflect - every gilded thing in the Necropolis rendered black
 *   before this was written down. Copper, silver and iron all sit near 0.45.
 * - **Pale multiplies.** Birch, silk, bone and lichen are the four loudest
 *   things in a dark room, and there are four of them for that reason.
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
  /** Waxed joinery, dry fibre, or wet. Rooms never pick this - the surface does. */
  rough?: 'wax' | 'dry' | 'wet';
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
    if (opts.rough === 'wax') material.roughnessMap = tex.waxRoughness();
    if (opts.rough === 'dry') material.roughnessMap = tex.dryRoughness();
    if (opts.rough === 'wet') material.roughnessMap = tex.wetRoughness();
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

/** Unlit. For anything that has to survive being in the dark: a flame, a spark, a bulb. */
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
 * Light landing on something, rather than a surface. Additive drops the dark
 * half of the texture entirely and only the bright part lands, which is what
 * light actually does - painted as an ordinary emissive decal, a pool of lantern
 * light brings its own black background and lays it over the floor.
 *
 * All of them carry a falloff mask, because additive fixes the dark background
 * and does nothing about the hard EDGE (docs/art/ART_GUIDE.md §4).
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

/** Unlit and mapped: a picture that must not be lit, like the forest behind a pane. */
const picture = (map: () => THREE.Texture, color = 0xffffff, side: THREE.Side = THREE.FrontSide): (() => THREE.Material) => () =>
  new THREE.MeshBasicMaterial({ color, map: map(), fog: true, side });

/**
 * Foliage, cloth and anything else hung as a thin sheet. Double-sided and
 * faintly self-lit for the reason the manor's hanging linen is: a single-sided
 * blade with a lamp behind it reads as a hole cut in the room, and real leaves
 * backlit glow (docs/art/ROOM_REVIEW.md).
 */
const sheet = (color: number, emissive: number, opts: Opts = {}): (() => THREE.Material) =>
  standard(color, {
    roughness: 0.88,
    side: THREE.DoubleSide,
    emissive,
    emissiveIntensity: 0.5,
    ...opts,
  });

export function createMaterials(): MaterialLibrary {
  return materialLibrary({
    /* --- the shell: the Bower ---------------------------------------------- */
    'surface.parquet': standard(0xffffff, { map: tex.parquet, normalMap: tex.parquetNormal, rough: 'wax', roughness: 0.6 }),
    'surface.plank': standard(0xffffff, { map: tex.plank, normalMap: tex.plankNormal, rough: 'wax', roughness: 0.74 }),
    'surface.heart': standard(0xffffff, { map: tex.heartwood, normalMap: tex.heartwoodNormal, rough: 'wax', roughness: 0.62 }),
    'surface.birch': standard(0xffffff, { map: tex.birch, normalMap: tex.birchNormal, rough: 'dry', roughness: 0.78 }),
    'surface.lattice': standard(0xffffff, { map: tex.lattice, normalMap: tex.latticeNormal, rough: 'wax', roughness: 0.66 }),
    'surface.wicker': standard(0xffffff, { map: tex.wicker, normalMap: tex.wickerNormal, rough: 'dry', roughness: 0.86 }),
    'surface.clay': standard(0xffffff, { map: tex.clay, normalMap: tex.clayNormal, rough: 'dry', roughness: 0.92 }),

    /* --- the shell: the Thicket --------------------------------------------- */
    'surface.bark': standard(0xffffff, { map: tex.bark, normalMap: tex.barkNormal, rough: 'dry', roughness: 0.9 }),
    'surface.pulp': standard(0xffffff, { map: tex.pulp, normalMap: tex.pulpNormal, rough: 'wet', roughness: 0.6 }),
    'surface.rot': standard(0xffffff, { map: tex.rotwood, normalMap: tex.rotwoodNormal, rough: 'wet', roughness: 0.74 }),
    'surface.fungus': standard(0xffffff, { map: tex.fungusMat, normalMap: tex.fungusNormal, rough: 'dry', roughness: 0.88 }),
    'surface.silk': standard(0xffffff, { map: tex.silk, normalMap: tex.silkNormal, roughness: 0.82 }),
    'surface.loam': standard(0xffffff, { map: tex.loam, normalMap: tex.loamNormal, rough: 'dry', roughness: 0.95 }),
    'surface.root': standard(0xffffff, { map: tex.rootMat, normalMap: tex.rootNormal, rough: 'dry', roughness: 0.87 }),
    'surface.moss': standard(0xffffff, { map: tex.mossFloor, normalMap: tex.mossNormal, rough: 'dry', roughness: 0.96 }),

    /* --- the shell: the Bloom ------------------------------------------------ */
    'surface.bloom': standard(0xffffff, { map: tex.bloomBark, normalMap: tex.bloomNormal, rough: 'dry', roughness: 0.84 }),

    /**
     * The sapline: the pack's signature course along the base of every wall in
     * the Bower, and the substance every warm light in the map is made of.
     *
     * Colour map for what it looks like, emissive map for what it emits, and the
     * emissive colour left white so the hue ramp painted into the picture comes
     * through - which is what makes the middle of a pour read as hotter rather
     * than merely brighter. It is on hundreds of metres of wall, so it runs at a
     * third of what a sap well does; brighter and the whole map washes amber
     * with no darkness left in it anywhere.
     */
    'surface.sap': standard(0xffffff, {
      map: tex.amber,
      emissive: 0xffffff,
      emissiveMap: tex.amberEmissive,
      emissiveIntensity: 0.62,
      rough: 'wet',
      roughness: 0.3,
    }),
    /** The same resin, live and running. For the wells and the tapped trunks. */
    'surface.sapHot': standard(0xffffff, {
      map: tex.amber,
      emissive: 0xffffff,
      emissiveMap: tex.amberEmissive,
      emissiveIntensity: 1.15,
      rough: 'wet',
      roughness: 0.2,
    }),
    /**
     * Foxfire crust: the Thicket's half of the same idea, and the cold light this
     * map navigates by wherever nobody has hung a lantern.
     */
    'surface.fox': standard(0xffffff, {
      map: tex.foxfire,
      emissive: 0xffffff,
      emissiveMap: tex.foxfireEmissive,
      emissiveIntensity: 1.05,
      rough: 'dry',
      roughness: 0.72,
    }),
    'surface.foxHot': standard(0xffffff, {
      map: tex.foxfire,
      emissive: 0xffffff,
      emissiveMap: tex.foxfireEmissive,
      emissiveIntensity: 1.8,
      rough: 'dry',
      roughness: 0.66,
    }),
    /** The Bloom's vein: violet, spored, and it belongs to neither temperature. */
    'surface.bloomVein': standard(0xffffff, {
      map: tex.bloomGlowMap,
      emissive: 0xffffff,
      emissiveMap: tex.bloomGlowMap,
      emissiveIntensity: 0.95,
      roughness: 0.6,
    }),

    /* --- structural props ---------------------------------------------------- */
    /** Plain worked timber: posts, beams, benches, everything the Bower built. */
    timber: standard(0x6f5232, { rough: 'wax', roughness: 0.78 }),
    /** Sun-bleached and dry: rafters, ladders, old furniture. */
    timberPale: standard(0x9a8258, { rough: 'dry', roughness: 0.88 }),
    /** Bog oak, near-black and hard. The Bower's ironwork substitute. */
    timberDark: standard(0x3c3026, { rough: 'wax', roughness: 0.7 }),
    /** Raw bark as a prop: branch, stump, buttress. */
    barkProp: standard(0xffffff, { map: tex.bark, normalMap: tex.barkNormal, rough: 'dry', roughness: 0.92 }),
    /** Living root and bough. Matte and dark, so it reads as a silhouette. */
    root: standard(0x4a3c28, { rough: 'dry', roughness: 0.9, flat: true }),
    /** Wet inner wood, exposed. The wound colour. */
    pulpProp: standard(0xb09878, { rough: 'wet', roughness: 0.52 }),
    /** Punk rot as a prop: collapsing furniture, a fallen bough gone soft. */
    rotProp: standard(0x4e4237, { rough: 'wet', roughness: 0.8, flat: true }),
    /** Packed earth, for burrow steps and planters. */
    earth: standard(0x6a563c, { rough: 'dry', roughness: 0.96, flat: true }),
    /** River stone. The Bower has almost none, which is why a hearth reads. */
    stone: standard(0x6f6a5c, { rough: 'dry', roughness: 0.88, flat: true }),

    /* --- growing things ------------------------------------------------------- */
    /**
     * Vine and creeper. Deliberately NOT the same green as moss: a room where
     * every growing thing is one hue reads as plastic aquarium planting.
     */
    vine: standard(0x46502e, { rough: 'dry', roughness: 0.86, flat: true }),
    /** The thick ones, the ones that move. Darker, wetter, and they are not plants. */
    tendril: standard(0x39412c, { rough: 'wet', roughness: 0.52, flat: true }),
    moss: standard(0x49573a, { rough: 'dry', roughness: 0.97, flat: true }),
    lichen: standard(0x9aa48c, { rough: 'dry', roughness: 0.95, flat: true }),
    /** Foliage. Thin, double-sided, faintly lit so a lamp behind it glows through. */
    leaf: sheet(0x50632f, 0x1a2410, { emissiveIntensity: 0.32 }),
    leafPale: sheet(0x8fa062, 0x2e3618, { emissiveIntensity: 0.32 }),
    /** Dead leaf, hanging. The Thicket's version of the same object. */
    leafDead: sheet(0x7a5a2e, 0x2a2012, { emissiveIntensity: 0.35 }),
    /** Petals: the Bower's gardens and the Bloom's rosettes. */
    petal: sheet(0xd8c0a8, 0x4a3830, { roughness: 0.7 }),
    petalViolet: sheet(0xb884c8, 0x5a2a6e, { roughness: 0.66, emissiveIntensity: 0.75 }),
    petalPale: sheet(0xdcd4c0, 0x50503c, { roughness: 0.7 }),
    /** The Bloom's own flesh: what is under a petal that should not have one. */
    bloomFlesh: standard(0x7a4a72, { rough: 'wet', roughness: 0.42, emissive: 0x4a1a5a, emissiveIntensity: 0.55 }),

    /* --- fungus ---------------------------------------------------------------- */
    /** Bracket caps: the dry top of a shelf fungus. */
    bracket: standard(0x8a7452, { rough: 'dry', roughness: 0.9, flat: true }),
    /** Gills: the underside, and it is where the light comes from. */
    gill: standard(0xa8c4a0, { roughness: 0.66, emissive: 0x6ae0b0, emissiveIntensity: 1.25 }),
    /** Stalk and cap of the tall ones. Pale, waxy, unpleasant. */
    toadstool: standard(0xc4bca8, { roughness: 0.6 }),
    /** Mycelium threads, running over everything. Pale and dry. */
    mycelium: standard(0xb0ac98, { rough: 'dry', roughness: 0.96 }),
    /** Slime mould. Wet, yellow, and it has definitely moved since you looked. */
    /**
     * Slime mould. Knocked well back from the yellow it wants to be: at 0xa8942c
     * with an emissive on top, a pool of it on a floor read as a disc of poster
     * paint rather than as something wet, which is the same failure as the
     * abyss's bacterial mat (docs/art/ROOM_REVIEW.md).
     */
    slime: standard(0x6b6224, { rough: 'wet', roughness: 0.22, emissive: 0x2e2606, emissiveIntensity: 0.4 }),

    /* --- what lives here -------------------------------------------------------- */
    /** Chitin: spider leg, beetle back, wasp plate. Dark, hard, faintly iridescent. */
    chitin: standard(0x2c2620, { roughness: 0.34, metalness: 0.3, flat: true }),
    /** The pale underside of a thing: abdomen, grub, egg sac. */
    carapacePale: standard(0x9c8e72, { roughness: 0.52, flat: true }),
    /** A grub, a larva, the thing in the gall. Wet and segmented. */
    grub: standard(0xc0b088, { rough: 'wet', roughness: 0.3 }),
    /** Silk as a prop: cable, wrap, a hanging line. Pale and slightly lit. */
    /**
     * Silk as a prop. Knocked well back from the near-white it started at: on the
     * first sheet the Spinner's Gallery was a room full of pale grey slabs, which
     * is "a pale material multiplies" and "a full-width sheet is a pane of fog"
     * arriving at once (docs/art/ROOM_REVIEW.md). What makes silk read is the
     * highlight along a strand, not the value of the sheet.
     */
    silkProp: sheet(0x817f74, 0x24241c, { roughness: 0.6, emissiveIntensity: 0.2, transparent: 0.62 }),
    /** A drawn strand. Unlit so a single thread survives being in the dark. */
    /**
     * A drawn strand. Unlit so one thread survives being in the dark - but at 0.55
     * a gallery of them read as a bundle of laser beams crossing the room, so it
     * is down to 0.3 and a shade darker. A thread is a HINT of a line.
     */
    strand: glow(0x7a786e, 0.28),
    /** Bone and antler. The other pale thing, and there is not much of it. */
    bone: standard(0xc4bca6, { rough: 'dry', roughness: 0.72 }),
    /** Feather and down, from whatever the moths are not. */
    down: sheet(0xa89c86, 0x3a352c, { roughness: 0.94 }),

    /* --- the Bower's making ------------------------------------------------------ */
    /** Beeswax: candles, seals, the comb frames. */
    wax: standard(0xd8c078, { roughness: 0.5, emissive: 0x6a4a10, emissiveIntensity: 0.28 }),
    /** Honeycomb, full and lit from inside. The apiary's whole light source. */
    comb: standard(0xffffff, {
      map: tex.amber,
      emissive: 0xffffff,
      emissiveMap: tex.amberEmissive,
      emissiveIntensity: 0.85,
      roughness: 0.42,
    }),
    /** Woven cloth: hangings, bedding, the elves' plainer work. */
    linen: sheet(0xa89a80, 0x342e26, { roughness: 0.96 }),
    /** Dyed and figured: tapestry, banner, the good hangings. */
    weave: sheet(0x5e5238, 0x2a2418, { roughness: 0.94 }),
    /** Deep green wool, the one saturated cloth. Cushions, cloaks, table runners. */
    weaveGreen: sheet(0x35502e, 0x14200f, { roughness: 0.96 }),
    /** Old copper gone green. Nowhere near a full metal - there is nothing to reflect. */
    copper: standard(0x7e6a3e, { roughness: 0.44, metalness: 0.42 }),
    verdigris: standard(0x4e7a62, { roughness: 0.62, metalness: 0.2 }),
    /** Elf-silver: pale, satin, and still only half a metal. */
    silver: standard(0xa8aeb0, { roughness: 0.34, metalness: 0.45 }),
    iron: standard(0x494a4c, { roughness: 0.58, metalness: 0.4 }),
    /** Parchment and leaf-paper: the archive, the pinned notes, the labels. */
    parchment: standard(0xb8ac8e, { rough: 'dry', roughness: 0.94 }),
    /** Fired clay: pots, phials, the burrow's crockery. */
    pottery: standard(0x9a5f42, { roughness: 0.56 }),

    /* --- liquid ------------------------------------------------------------------ */
    /**
     * Standing water in the rot. It needs a colour you can SEE - a near-black
     * glossy disc on a dark floor is a hole in the floor, which this project has
     * now got wrong in three separate packs (docs/art/ROOM_REVIEW.md).
     */
    water: standard(0x2c3a34, { roughness: 0.09, metalness: 0.24, emissive: 0x0e1c18, emissiveIntensity: 0.5 }),
    /** Raw sap, running. Thick, glossy and warm. */
    sapWet: standard(0x8a5418, { rough: 'wet', roughness: 0.14, emissive: 0xc06818, emissiveIntensity: 0.75 }),
    /**
     * Sap held in a vessel. BACK-FACED, so only the far wall of a phial or a
     * trough draws and whatever is suspended in it reads in front of the fluid
     * rather than behind an opaque drum (docs/art/ART_GUIDE.md §4).
     */
    sapFluid: () => new THREE.MeshBasicMaterial({ color: 0xd0842c, side: THREE.BackSide, fog: true }),
    foxFluid: () => new THREE.MeshBasicMaterial({ color: 0x58b890, side: THREE.BackSide, fog: true }),

    /* --- glass -------------------------------------------------------------------- */
    /**
     * Resin glazing: a pane of set sap in a leaded frame. Glass reads by its
     * HIGHLIGHT, not by its brightness - low roughness, a little metalness and
     * almost no opacity. An emissive pane is a lamp, which is exactly what a
     * window must not look like.
     */
    glassPane: () =>
      new THREE.MeshStandardMaterial({
        color: 0xb8b0a0,
        roughness: 0.07,
        metalness: 0.16,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    /** The cut edge of a thick resin pane: the one place it shows its colour. */
    glassEdge: standard(0xa07a3c, { roughness: 0.18, metalness: 0.18, emissive: 0x6a4210, emissiveIntensity: 0.55 }),

    /* --- what is on the other side --------------------------------------------- */
    backdropHollow: picture(tex.backdropHollow),
    backdropForest: picture(tex.backdropForest),
    backdropCanopy: picture(tex.backdropCanopy),
    backdropRoots: picture(tex.backdropRoots),

    /* --- suspended volume ---------------------------------------------------------- */
    /**
     * All of it **additive and masked**, which is two lessons at once. Additive
     * because pollen, spores and mist in a dark room are light scattering, not a
     * grey surface: alpha-blended, a plume lays a film over the very thing it is
     * rising off. Masked because a bare quad has four hard edges and reads as a
     * pane of fog standing in the room, however faint you make it.
     */
    hazePollen: additive(0xe0b060, 0.15, tex.plumeFade),
    hazeSpore: additive(0x9cd8b8, 0.13, tex.plumeFade),
    hazeBloom: additive(0xc078e0, 0.14, tex.plumeFade),
    hazeMist: additive(0xa8bcc0, 0.12, tex.plumeFade),
    /** A shaft of light coming down through a hole. Vertical mask, not radial. */
    shaftWarm: additive(0xffd090, 0.13, tex.shaftFade),
    shaftCold: additive(0xa8c0d8, 0.11, tex.shaftFade),
    /** Smoke off something smouldering. Nearly black - a hole in the light. */
    smoke: glow(0x120e0a, 0.07),

    /* --- light AS light, not as a surface ---------------------------------------- */
    /**
     * The pools a lamp throws on the surface it stands against.
     *
     * A practical in this renderer lights itself and about a metre of what it is
     * bolted to, so a lit lantern reads as a bright speck in a black box. Every
     * practical in the pack lays one of these on its wall or its floor: it costs
     * nothing against the light budget and it is the whole difference between
     * "there is a lamp here" and "this room is lit".
     */
    sapWash: additive(0xffab42, 0.3, tex.radialFalloff),
    foxWash: additive(0x64e0b0, 0.24, tex.radialFalloff),
    bloomWash: additive(0xc060f0, 0.24, tex.radialFalloff),
    moonWash: additive(0x9cb8d8, 0.2, tex.radialFalloff),

    /* --- the things that glow ------------------------------------------------------ */
    /**
     * The pack's emissive light sources. Saturated on purpose: an emissive that
     * is nearly white blows out under ACES and stops reading as a colour of light
     * at all.
     */
    /**
     * Tuned DOWN from 2.6 after the first contact sheet: at that value the
     * sapline running round the base of every Bower wall clipped through ACES to
     * flat white and read as a neon tube screwed to the skirting, which is the
     * exact failure the crypt's votive course hit. It is on hundreds of metres of
     * wall, so it is the one emissive in the pack that has to be judged at the
     * scale it actually ships at rather than on a prop.
     */
    lumenSap: standard(0xe0a050, { emissive: 0xff9a30, emissiveIntensity: 1.5, roughness: 0.42 }),
    /**
     * A lantern globe. Down from 2.4: this is the one emissive a player stands
     * within arm's length of - a moth lantern is at head height on a wall and a
     * hanging one is right over the walking lane - and at 2.4 every globe in the
     * Bower came back off the sheet as a featureless white ball. A shade lit from
     * inside must never be brighter than the practical it is fitted to
     * (docs/art/ROOM_REVIEW.md).
     */
    lumenMoth: standard(0xe8dcb8, { emissive: 0xffcf86, emissiveIntensity: 1.35, roughness: 0.44 }),
    lumenFox: standard(0x9ce0c0, { emissive: 0x7cffcc, emissiveIntensity: 2.2, roughness: 0.44 }),
    lumenBloom: standard(0xa864c8, { emissive: 0xd44cff, emissiveIntensity: 2.5, roughness: 0.44 }),
    /** A live flame or a hot filament behind glass. Unlit, so it is a flame in the dark. */
    flame: glow(0xffcf86, 0.95),
    flameCold: glow(0xa8f0d0, 0.92),
    flameBloom: glow(0xe0a0ff, 0.9),
    ember: glow(0xff8a3c, 0.85),

    /**
     * Eyes. There is a room in this map whose entire premise is that the wall is
     * looking at you, so this is a gameplay-legibility colour rather than a
     * decoration: it has to carry across a dark room and through fog.
     */
    eyeGlow: glow(0xffe08a, 0.95),
    eyeDark: standard(0x14100c, { roughness: 0.18, metalness: 0.15 }),

    /* --- names shared art requires (docs/art/SHARED_ART.md §3.1) ------------------ */
    /**
     * A door is a carved leaf of heartwood. `doorSkin`, not `surface.heart`:
     * shared art is not batched, so a door leaf carries ONE UV repeat and a
     * tiling map smears across it into a blank slab. See textures.ts.
     */
    door: standard(0xffffff, { map: tex.doorSkin, rough: 'wax', roughness: 0.66 }),
    doorFrame: standard(0x4a3626, { rough: 'wax', roughness: 0.76 }),
    lockIndicator: standard(0xb0442c, { emissive: 0xff4a24, emissiveIntensity: 1.7, roughness: 0.4 }),

    /**
     * The way out is a door that is still alive, in the one clean green in the
     * map - which is the entire design brief for an exit in a place where
     * everything else is either rotting or pretending not to be.
     */
    exitDoor: standard(0xffffff, { map: tex.exitDoorSkin, rough: 'wax', roughness: 0.6 }),
    exitFrame: standard(0x3c4a30, { roughness: 0.78 }),
    exitGlow: glow(0xb0f0a0, 0.22),

    chest: standard(0xffffff, { map: tex.chestSkin, rough: 'dry', roughness: 0.78 }),
    chestTrim: standard(0x6e5a2e, { roughness: 0.48, metalness: 0.4 }),
    locker: standard(0xffffff, { map: tex.lockerSkin, rough: 'dry', roughness: 0.76 }),
    lockerVent: standard(0x241f18, { roughness: 0.9 }),

    /* --- the item roster ----------------------------------------------------------- */
    itemMetal: standard(0xc0a860, { roughness: 0.36, metalness: 0.45 }),
    itemSteel: standard(0x8e9294, { roughness: 0.42, metalness: 0.45 }),
    itemWood: standard(0x7a5734, { roughness: 0.86 }),
    itemCloth: standard(0xd0c6ac, { roughness: 1 }),
    itemAccent: standard(0xa8462c, { roughness: 0.66 }),
    itemBrass: standard(0xbe9a4c, { roughness: 0.3, metalness: 0.45 }),
    itemEnamel: standard(0xe4dcc4, { roughness: 0.4 }),
    itemGold: standard(0xc9a13a, { roughness: 0.28, metalness: 0.45 }),
    itemTar: standard(0x100d0a, { roughness: 0.16, metalness: 0.24 }),
    itemGlass: () =>
      new THREE.MeshStandardMaterial({ color: 0xb0b4a4, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.32 }),
    itemGem: standard(0xffcf98, { roughness: 0.05, metalness: 0.14, emissive: 0xff8a3c, emissiveIntensity: 0.8 }),

    /* --- thrown-item effects --------------------------------------------------------- */
    'vfx.tar': () =>
      new THREE.MeshStandardMaterial({ color: 0x100e14, roughness: 0.14, metalness: 0.28, transparent: true, opacity: 0.95 }),
    'vfx.tarRim': standard(0x2c2820, { roughness: 0.86 }),
    'vfx.flash': () =>
      new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.9, depthWrite: false, fog: false }),

    playerBody: standard(0x6a7256, { roughness: 0.84 }),
    playerMask: standard(0xd4cbb0, { roughness: 0.58 }),

    // Cloned by the ghost builder so it can tint per alert level without touching
    // the shared cache - see art/shared/characters/ghost.ts.
    ghostShroud: () =>
      new THREE.MeshStandardMaterial({ color: 0x3a3a30, roughness: 1, transparent: true, opacity: 0.82 }),
    ghostAlert: () => new THREE.MeshStandardMaterial({ color: 0x7a8a3c, emissive: 0x7a8a3c, emissiveIntensity: 1 }),
  });
}
