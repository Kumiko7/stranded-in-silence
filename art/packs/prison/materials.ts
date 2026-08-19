/**
 * Blackgate's material library.
 *
 * Every material in the pack is created once, here, and handed out by name, so a
 * room that asks for `surface.block` three hundred times gets the same object
 * three hundred times - which is what lets `MeshBatcher` collapse a room built
 * from four hundred boxes down to a handful of draw calls.
 *
 * Names come in three families:
 *   - `surface.*`  architecture (the shell: floors, walls, ceilings, dados)
 *   - plain names  props (ironBar, enamel, canvas, hemp, wax, brine...)
 *   - fixed names  the ones shared art requires (docs/art/SHARED_ART.md §3.1)
 *
 * **Emission is this pack's lighting budget.** There are two real lights per
 * room and no player torch, so most of what a player navigates by is an emissive
 * surface: the night-light course along the base of every wall, a lit sign over
 * a gate, an x-ray box, the mouth of a furnace. Those are tuned to read at 6-8 m
 * through the map's fog, and they are the reason a room can look lit while
 * spending one point light on it.
 *
 * **Three temperatures.** The Blocks light themselves WARM - forty-watt tungsten
 * behind a wire guard, the night circuit that was never switched off. The Ward
 * lights itself COLD - failing fluorescent and x-ray green-white. The ambient
 * fill is cold blue, which is what makes the Blocks' tungsten read as the only
 * warmth in the building and the Ward read as colder than the dark it stands in.
 * The Programme runs on germicidal ULTRAVIOLET, a violet that belongs to neither
 * and is the whole reason those two rooms are frightening in a building where
 * everything else is at least explicable.
 *
 * One number decides whether that works: **an emissive is judged against the
 * room's own lamps, never on its own.** The moment a decoration reads brighter
 * than the practicals it stops being a detail and becomes the light source, and
 * the room's design collapses - which is why the night light in the wall course
 * runs at a third of a caged lamp's intensity even though it is the same bulb.
 *
 * And one number decides whether the metal works: **there is no environment map
 * in this renderer**, so a surface at `metalness: 0.9` can only show what it
 * reflects and has nothing to reflect. Every metal here is around 0.45, which is
 * the finding this project has now paid for three times (docs/art/ROOM_REVIEW.md).
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
  /** Gloss paint, dry mineral, glazed ceramic or wet. Rooms never pick this - the surface does. */
  rough?: 'gloss' | 'dry' | 'glazed' | 'wet';
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
    if (opts.rough === 'gloss') material.roughnessMap = tex.glossRoughness();
    if (opts.rough === 'dry') material.roughnessMap = tex.dryRoughness();
    if (opts.rough === 'glazed') material.roughnessMap = tex.glazedRoughness();
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

/** Unlit. For anything that has to survive being in the dark: filament, glass, a bulb. */
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
 * actually does - painted as an ordinary emissive decal, a pool of lamplight
 * brings its own black background and lays it over the floor
 * (docs/art/ROOM_REVIEW.md).
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

/** Unlit and mapped: a picture that must not be lit, like the yard behind a window. */
const picture = (map: () => THREE.Texture, color = 0xffffff, side: THREE.Side = THREE.FrontSide): (() => THREE.Material) => () =>
  new THREE.MeshBasicMaterial({ color, map: map(), fog: true, side });

export function createMaterials(): MaterialLibrary {
  return materialLibrary({
    /* --- the shell: the Blocks ---------------------------------------------- */
    'surface.concrete': standard(0xffffff, {
      map: tex.concreteFloor,
      normalMap: tex.concreteFloorNormal,
      rough: 'dry',
      roughness: 0.88,
    }),
    /**
     * Quarry tile is UNGLAZED, and the first pass forgot it: with the glaze
     * roughness map under a 0.62 base it put a mirror highlight on every tile and
     * the mess hall came back looking like a wet shopping centre. Dry, and high -
     * the only shine on a floor like this is the polish in the traffic lane, and
     * the colour map already paints that.
     */
    'surface.quarry': standard(0xffffff, {
      map: tex.quarryTile,
      normalMap: tex.quarryTileNormal,
      rough: 'dry',
      roughness: 0.84,
    }),
    'surface.gravel': standard(0xffffff, { map: tex.gravelYard, normalMap: tex.gravelNormal, rough: 'dry', roughness: 0.96 }),
    'surface.drain': standard(0xffffff, { map: tex.drainTile, normalMap: tex.drainTileNormal, rough: 'wet', roughness: 0.4 }),
    /**
     * The wall of nearly every room in the Blocks. `rough: 'gloss'` is doing more
     * work here than the colour map is: institutional paint is polished where
     * shoulders and trolleys go and dead matte everywhere else, and that one
     * variation is what makes a flat buff wall read as painted rather than as
     * rendered.
     */
    'surface.block': standard(0xffffff, {
      map: tex.paintedBlock,
      normalMap: tex.paintedBlockNormal,
      rough: 'gloss',
      roughness: 0.68,
    }),
    'surface.dado': standard(0xffffff, { map: tex.paintedDado, rough: 'gloss', roughness: 0.5 }),
    'surface.brick': standard(0xffffff, { map: tex.prisonBrick, normalMap: tex.prisonBrickNormal, rough: 'dry', roughness: 0.9 }),
    'surface.rivet': standard(0xffffff, {
      map: tex.rivetedPlate,
      normalMap: tex.rivetedPlateNormal,
      rough: 'gloss',
      roughness: 0.6,
      metalness: 0.4,
    }),
    'surface.rubble': standard(0xffffff, { map: tex.rubbleStone, normalMap: tex.rubbleStoneNormal, rough: 'dry', roughness: 0.92 }),
    'surface.soffit': standard(0xffffff, { map: tex.concreteSoffit, rough: 'dry', roughness: 0.93 }),

    /* --- the shell: the Ward ------------------------------------------------- */
    'surface.wardTile': standard(0xffffff, {
      map: tex.wardTile,
      normalMap: tex.wardTileNormal,
      rough: 'glazed',
      roughness: 0.44,
      metalness: 0.04,
    }),
    'surface.terrazzo': standard(0xffffff, { map: tex.terrazzo, rough: 'glazed', roughness: 0.44 }),
    'surface.lino': standard(0xffffff, { map: tex.chequerLino, rough: 'gloss', roughness: 0.56 }),
    'surface.enamel': standard(0xffffff, { map: tex.enamelPanel, rough: 'glazed', roughness: 0.36, metalness: 0.2 }),
    'surface.padded': standard(0xffffff, { map: tex.paddedCanvas, normalMap: tex.paddedCanvasNormal, roughness: 0.96 }),
    'surface.distemper': standard(0xffffff, { map: tex.distemper, normalMap: tex.distemperNormal, rough: 'dry', roughness: 0.94 }),
    'surface.rubber': standard(0xffffff, { map: tex.rubberMat, normalMap: tex.rubberMatNormal, roughness: 0.86 }),

    /* --- the shell: shared signage ------------------------------------------- */
    'surface.stencil': standard(0xffffff, { map: tex.stencilSteel, rough: 'gloss', roughness: 0.56, metalness: 0.35 }),
    'surface.hazard': standard(0xffffff, { map: tex.hazardBand, rough: 'gloss', roughness: 0.58, metalness: 0.16 }),
    'surface.cards': standard(0xffffff, { map: tex.indexCards, rough: 'dry', roughness: 0.95 }),
    /** Tally marks cut into the paint. Only ever used at eye height, in a cell. */
    'surface.tally': standard(0xffffff, { map: tex.tallyMarks, normalMap: tex.tallyMarksNormal, rough: 'gloss', roughness: 0.7 }),

    /* --- the Programme -------------------------------------------------------- */
    /**
     * What has grown over the two rooms nobody has an explanation for. Emissive
     * map for the veins, emissive colour left white so the hue ramp in the
     * picture comes through - which is what makes the middle of a node read as
     * hotter rather than merely brighter.
     */
    'surface.resin': standard(0xffffff, {
      map: tex.resinCrust,
      normalMap: tex.resinCrustNormal,
      emissive: 0xffffff,
      emissiveMap: tex.resinCrustEmissive,
      emissiveIntensity: 1.0,
      roughness: 0.44,
    }),
    /** The soft part. Thin, double-sided, faintly lit, so a lamp behind it glows through. */
    caul: standard(0x7c6a90, {
      roughness: 0.34,
      transparent: 0.4,
      side: THREE.DoubleSide,
      emissive: 0x6a3ca0,
      emissiveIntensity: 0.65,
    }),
    /** Tendon, root and hair: dark, matte, and it must read as silhouette not glow. */
    sinew: standard(0x4a4248, { roughness: 0.88, flat: true }),
    /**
     * What has run out of a burst tank and pooled. NOT `caul`: a translucent pale
     * sheet lying flat reads as a rug. Dark, wet, glossy, with only enough glow
     * to say it is not water.
     */
    spill: standard(0x241e2c, { roughness: 0.12, metalness: 0.1, emissive: 0x4a1a86, emissiveIntensity: 0.45 }),

    /* --- iron, steel and paint ------------------------------------------------ */
    /**
     * The bars. Every gate, cage, grille and window guard in the map is this: a
     * near-black painted iron that has to read as a SILHOUETTE, because that is
     * the whole visual language of the genre. Slightly metallic so a raking lamp
     * puts a highlight down one edge of each bar - without it a row of bars is a
     * row of flat black rectangles and stops reading as round.
     */
    ironBar: standard(0x3a3d38, { rough: 'gloss', roughness: 0.44, metalness: 0.45 }),
    ironPale: standard(0x6e736a, { rough: 'gloss', roughness: 0.4, metalness: 0.45 }),
    /** Bright steel: hinges, hasps, the working faces of anything mechanical. */
    steel: standard(0x969c94, { rough: 'gloss', roughness: 0.36, metalness: 0.4 }),
    steelDark: standard(0x4c514c, { rough: 'gloss', roughness: 0.48, metalness: 0.45 }),
    /**
     * Surgical steel: the Ward's instruments, trolleys and slabs.
     *
     * It was 0.55 metalness on the first pass and the operating table - the thing
     * the whole room is arranged around, directly under the brightest lamp in the
     * map - rendered as a dark slab. There is no environment map in this renderer,
     * so a half-metal can only show what it reflects and has nothing to reflect.
     * Everything metal in this pack is around 0.4 for that reason, and this is the
     * one the mistake was most expensive on (docs/art/ROOM_REVIEW.md).
     */
    surgical: standard(0xb6bec0, { rough: 'gloss', roughness: 0.32, metalness: 0.34 }),
    /** Rust as a prop material, for anything that has stopped being maintained. */
    rust: standard(0x6f4530, { rough: 'dry', roughness: 0.92, flat: true }),
    /** The building's one colour of paint, on props rather than on walls. */
    paintGreen: standard(0x4e5f4c, { rough: 'gloss', roughness: 0.44, metalness: 0.12 }),
    paintCream: standard(0x9a9682, { rough: 'gloss', roughness: 0.46, metalness: 0.1 }),
    /** Red lead: fire points, the drop lever, anything that had to be found fast. */
    paintRed: standard(0x8e3a2c, { rough: 'gloss', roughness: 0.46, metalness: 0.12 }),
    /** Brass: key tags, taps, the chapel rail, the scale pans. Half-metal, always. */
    brass: standard(0xb0913f, { rough: 'gloss', roughness: 0.36, metalness: 0.4 }),
    copper: standard(0x8d5c38, { rough: 'gloss', roughness: 0.42, metalness: 0.45 }),
    /** Lead and zinc: pipework, cisterns, the roof of the chapel porch. */
    lead: standard(0x6a6e72, { rough: 'dry', roughness: 0.66, metalness: 0.34 }),

    /* --- timber, cloth and rope ------------------------------------------------ */
    /** Institutional hardwood: pews, benches, the gallows beam, a warder's desk. */
    timber: standard(0x5f4b36, { rough: 'gloss', roughness: 0.62 }),
    timberPale: standard(0x8a7351, { rough: 'dry', roughness: 0.82 }),
    timberDark: standard(0x40342a, { rough: 'gloss', roughness: 0.56 }),
    /**
     * Mattress ticking, sheeting, a straitjacket. Double-sided and faintly
     * self-lit for the same reason the manor's hanging linen is: a single-sided
     * blade with a lamp behind it reads as a hole cut in the room, and real cloth
     * backlit glows (docs/art/ROOM_REVIEW.md).
     */
    canvas: standard(0x9c9278, {
      roughness: 0.97,
      side: THREE.DoubleSide,
      emissive: 0x2c2a24,
      emissiveIntensity: 0.5,
    }),
    /** Bed linen and shrouds: paler, and there must never be more than two in a room. */
    linen: standard(0x9e9884, {
      roughness: 0.98,
      side: THREE.DoubleSide,
      emissive: 0x30302a,
      emissiveIntensity: 0.55,
    }),
    /** Serge and blanket: the dark grey wool of everything issued in this building. */
    wool: standard(0x4e5158, { roughness: 1 }),
    /** Restraint leather. Every strap, cuff, muzzle and harness in the map. */
    leather: standard(0x4a3628, { rough: 'gloss', roughness: 0.5 }),
    /** Hemp: the rope, the mats, the sandbag on the gallows beam. */
    hemp: standard(0x8a7a54, { rough: 'dry', roughness: 0.94 }),
    /**
     * Perished plastic strip, hung across a doorway in blades. Translucent and
     * faintly self-lit for the same reason every hanging sheet in this pack is: a
     * blade of clear glass in a dark room is not there at all, and on the first
     * contact sheet the decontamination curtain was invisible from every doorway.
     */
    stripCurtain: standard(0xa8b4a8, {
      roughness: 0.3,
      side: THREE.DoubleSide,
      transparent: 0.4,
      emissive: 0x2a3430,
      emissiveIntensity: 0.6,
    }),
    /** Perished rubber: hose, matting, apron, the mask over a face. */
    rubberProp: standard(0x35383a, { roughness: 0.86 }),
    /** Oilcloth and mackintosh sheeting: the Ward's aprons and trolley covers. */
    oilcloth: standard(0x5a5c50, { rough: 'gloss', roughness: 0.36 }),

    /* --- ceramic, glass and water ---------------------------------------------- */
    /** Sanitary ware: basins, pans, jugs, bedpans. The whitest thing in the map. */
    porcelain: standard(0xc4c6bc, { rough: 'glazed', roughness: 0.16 }),
    /** Vitreous enamel as a prop: bowls, kidney dishes, the shade of a Ward lamp. */
    enamel: standard(0xb8bcb2, { rough: 'glazed', roughness: 0.22, metalness: 0.12 }),
    /**
     * Wax: the anatomical models in the Collection, and the candles in the chapel.
     * Subsurface is not on the table here, so it fakes it with a warm emissive at
     * a level well under any practical - enough that a face in a dark case is not
     * a black lump, never enough to read as lit.
     */
    wax: standard(0xc0a894, { roughness: 0.5, emissive: 0x4a2c22, emissiveIntensity: 0.34 }),
    /**
     * Laboratory glass: jars, bottles, the bell of a specimen dome. Glass reads by
     * its HIGHLIGHT, not by its brightness - low roughness, a little metalness,
     * almost no opacity. An emissive pane is a lamp, which a jar must never be.
     */
    glassPane: () =>
      new THREE.MeshStandardMaterial({
        color: 0xa4b4b0,
        roughness: 0.06,
        metalness: 0.16,
        transparent: true,
        opacity: 0.17,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    /** Georgian wire glass: the same, with the mesh baked into a faint tint. */
    glassWire: () =>
      new THREE.MeshStandardMaterial({
        color: 0xa8b09c,
        roughness: 0.14,
        metalness: 0.14,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    /**
     * One-way glass. From the dark side it is a window; from the lit side it is a
     * mirror, and the whole point of the observation gallery is that the person
     * on the other side does not know which side they are on. Higher metalness
     * than the rest so it takes a hard specular from the gallery's own lamp.
     */
    glassMirror: () =>
      new THREE.MeshStandardMaterial({
        color: 0x9aa6a4,
        roughness: 0.08,
        metalness: 0.34,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    /** The cut edge of thick glass: the one place the material shows its colour. */
    glassEdge: standard(0x6f8e88, { roughness: 0.16, metalness: 0.2, emissive: 0x28504a, emissiveIntensity: 0.45 }),
    glassCrack: glow(0xd0dcd4, 0.45),
    /**
     * Water in a container is `BackSide`. A tank, a bath or a jar is a box, and a
     * front-faced box of water is an opaque wall between the eye and everything
     * floating in it. Back-faced, only the far wall draws and the contents read
     * (docs/art/ROOM_REVIEW.md - the Kerberos Deep pass).
     */
    /**
     * Fluid in a container, BACK-faced so only the far wall of the drum draws and
     * the thing floating in it sits in front of that rather than behind an opaque
     * cylinder. It is deliberately dark: an unlit material draws at its own value
     * whatever the room is doing, so a pale one is the brightest thing in every
     * shot it appears in and a tank stops being a tank and becomes a lamp.
     */
    brine: () => new THREE.MeshBasicMaterial({ color: 0x1d2f2a, side: THREE.BackSide, fog: true }),
    /**
     * Standing water lying on a floor. Never near-black: a dark glossy disc on a
     * dark floor reads as a hole in the floor, and this pack would have made that
     * mistake in six rooms.
     */
    water: standard(0x62787e, { rough: 'wet', roughness: 0.22, metalness: 0.14, transparent: 0.5 }),
    /** Scum, mould and the green that grows where it is always damp. */
    mould: standard(0x54604a, { rough: 'wet', roughness: 0.62, flat: true }),
    /** Cold-room frost: the one place in the map where a surface is not warm. */
    frost: standard(0xbcd0d4, { roughness: 0.58 }),
    /** Rime of lime scale, whitewash dust, spilled quicklime. */
    lime: standard(0xb4b6a8, { rough: 'dry', roughness: 0.9 }),
    /** Coal and coke: the furnace, and the bunker beside it. */
    coal: standard(0x35322e, { rough: 'dry', roughness: 0.94, flat: true }),
    /** Ash, soot and the fine grey that settles on everything near a boiler. */
    ash: standard(0x6a655c, { rough: 'dry', roughness: 0.97 }),
    /** Paper as a prop material, on floors, in drifts, pinned to boards. */
    paper: standard(0xffffff, { map: tex.ledgerPaper, rough: 'dry', roughness: 0.95 }),
    /** Old blood and what forty years does to it. Dark, matte, and never red. */
    stain: standard(0x4a2f28, { roughness: 0.88 }),
    /**
     * The three decal materials every wall stain uses.
     *
     * They exist because the first contact sheet came back with a red rectangle
     * bolted to the wall of half the pack: `rust` and `mould` are PROP materials,
     * opaque, and a quad of an opaque material laid flat on a wall is a panel. A
     * stain is a film over whatever is under it, so these are transparent, and
     * they are the only place in this library where that is the whole point of
     * the material rather than a side effect of it.
     */
    decalRust: standard(0x6f4530, { rough: 'dry', roughness: 0.9, transparent: 0.5 }),
    decalMould: standard(0x4c5744, { rough: 'wet', roughness: 0.7, transparent: 0.46 }),
    decalStain: standard(0x453029, { roughness: 0.9, transparent: 0.44 }),

    /* --- the things that glow -------------------------------------------------- */
    /**
     * The pack's light sources. Saturated on purpose: an emissive that is nearly
     * white blows out under ACES and stops reading as a colour of light at all.
     *
     * `lumenTungsten` is the one that matters, because it is in the night-light
     * course along the base of EVERY wall in the Blocks. It is deliberately the
     * dimmest of the family: on hundreds of metres of wall, an emissive tuned at
     * prop scale clips through ACES to flat white and every room in half the pack
     * gets a neon tube screwed to its skirting (docs/art/ROOM_REVIEW.md - the
     * Heartwood pass).
     */
    lumenTungsten: standard(0xd8a860, { emissive: 0xffb44c, emissiveIntensity: 1.5, roughness: 0.46 }),
    /** The same fitting at full strength, for a lamp a player stands under. */
    lumenLamp: standard(0xe8c890, { emissive: 0xffc266, emissiveIntensity: 2.5, roughness: 0.42 }),
    /** Fluorescent: the Ward's own light, and it is green-white rather than blue. */
    lumenTube: standard(0xc8dcc8, { emissive: 0xcaf0dc, emissiveIntensity: 2.4, roughness: 0.36 }),
    /** Germicidal ultraviolet: the Programme, and nothing else in the map. */
    lumenUV: standard(0xb69ae4, { emissive: 0xc49aff, emissiveIntensity: 2.6, roughness: 0.4 }),
    lumenRed: standard(0xb03830, { emissive: 0xff2a18, emissiveIntensity: 2.3, roughness: 0.44 }),
    lumenGreen: standard(0x58a86c, { emissive: 0x3ce07a, emissiveIntensity: 2.2, roughness: 0.42 }),
    /** A working filament behind glass. Unlit, so a bulb is a bulb in the dark. */
    bulb: glow(0xffe0aa, 0.95),
    bulbCold: glow(0xdcf2e4, 0.95),
    /** A dead fitting. There have to be some, or a corridor of lamps is a fairground. */
    bulbDead: standard(0x4a4c48, { roughness: 0.3, metalness: 0.2 }),
    ember: glow(0xff6a24, 0.9),
    /** The mouth of the furnace: the one genuinely hot thing in the building. */
    firebox: standard(0xffb060, { emissive: 0xff6a1e, emissiveIntensity: 2.2, roughness: 0.34 }),

    /* --- lit signage and screens ------------------------------------------------ */
    signGreen: standard(0x3a8a52, { emissive: 0x3ce07a, emissiveIntensity: 1.4, roughness: 0.44 }),
    signRed: standard(0x9a3028, { emissive: 0xff2a18, emissiveIntensity: 1.6, roughness: 0.44 }),
    signAmber: standard(0xa8862c, { emissive: 0xffa42a, emissiveIntensity: 1.4, roughness: 0.44 }),
    /** An x-ray on a light box: the Ward's one lit picture and its coldest surface. */
    xray: standard(0xffffff, {
      map: tex.xrayFilm,
      emissive: 0xffffff,
      emissiveMap: tex.xrayFilm,
      emissiveIntensity: 1.7,
      roughness: 0.2,
    }),

    /* --- light AS light, not as a surface --------------------------------------- */
    /**
     * The pools a lamp throws on the floor and the wall around it.
     *
     * Two things make these work. **Additive**, so the dark half of the material
     * contributes nothing and only the net brightness lands - painted as an
     * ordinary emissive decal a pool brings its own black background with it. And
     * **masked with a radial falloff**, so it ends by fading rather than on a hard
     * circle. Both lessons are in docs/art/ROOM_REVIEW.md and both have been paid
     * for by two packs already.
     */
    warmWash: additive(0xff9a3c, 0.3, tex.radialFalloff),
    coldWash: additive(0xa8e4d0, 0.24, tex.radialFalloff),
    violetWash: additive(0xb478ff, 0.19, tex.radialFalloff),
    /**
     * The signature image of the whole genre: barred light on a floor.
     *
     * The map cannot afford a shadow-casting lamp in every room, so it is painted
     * - an additive quad carrying a bar gobo, laid where a caged lamp's light
     * would fall through a gate. It costs one draw call's worth of geometry, no
     * light budget at all, and it is the single most recognisable thing in the
     * pack.
     */
    barWash: additive(0xffb460, 0.34, tex.barGobo),
    barWashCold: additive(0xbceada, 0.26, tex.barGobo),
    /**
     * Suspended volume - steam, dust in a beam, the fog off a hose, disinfectant
     * haze.
     *
     * All of it **additive and masked**, which is two lessons at once. Additive
     * because vapour in a dark room is light scattering, not a grey surface: an
     * alpha-blended plume lays a film over whatever is behind it and greys out the
     * very thing it is rising off. Masked because a bare quad has four hard edges
     * and reads as a pane of fog standing in the room, however faint you make it.
     */
    steam: additive(0xa8b4ae, 0.22, tex.plumeFade),
    dust: additive(0xb0a894, 0.16, tex.plumeFade),
    /** Gas off a decontamination sprayer: citron, and no more opaque. */
    fumes: additive(0xa8c078, 0.15, tex.plumeFade),
    /** Smoke off something burning. Nearly black, so it reads as a hole in the light. */
    smoke: glow(0x14100e, 0.08),

    /* --- what is on the other side of a wall ------------------------------------- */
    backdropYard: picture(tex.yardBackdrop),
    backdropCell: picture(tex.cellBackdrop),
    backdropObserved: picture(tex.observedBackdrop),
    backdropShaft: picture(tex.shaftBackdrop),
    /**
     * The chapel window. Unlit, like every backdrop - a stained window that is
     * emissive stops being a picture and becomes the room's light source, and the
     * chapel's design is that the light comes from the candles beneath it.
     */
    backdropGlass: picture(tex.stainedGlass, 0xffffff, THREE.DoubleSide),

    /* --- names shared art requires (docs/art/SHARED_ART.md §3.1) ----------------- */
    /**
     * Doors are cell doors. `cellDoorSkin`, not `surface.rivet`: shared art is not
     * batched, so a door leaf carries ONE UV repeat and a tiling map smears across
     * it into a blank slab. The skin is composed AS a door, with the judas hatch,
     * the feeding flap and the lock case in the places a door has them.
     */
    door: standard(0xffffff, { map: tex.cellDoorSkin, normalMap: tex.cellDoorNormal, rough: 'gloss', roughness: 0.52, metalness: 0.4 }),
    doorFrame: standard(0x474c46, { rough: 'gloss', roughness: 0.5, metalness: 0.4 }),
    lockIndicator: standard(0xb03830, { emissive: 0xff3a24, emissiveIntensity: 1.8, roughness: 0.35 }),

    /**
     * The way out is the only red door in the building, and the only surface with
     * daylight under it - which is the entire design brief for an exit in a place
     * like this.
     */
    exitDoor: standard(0xffffff, { map: tex.exitGateSkin, rough: 'gloss', roughness: 0.5, metalness: 0.3 }),
    exitFrame: standard(0x554438, { roughness: 0.7 }),
    exitGlow: glow(0xffe0b0, 0.24),

    chest: standard(0xffffff, { map: tex.trunkSkin, rough: 'dry', roughness: 0.9 }),
    chestTrim: standard(0x7c7466, { rough: 'gloss', roughness: 0.44, metalness: 0.45 }),
    locker: standard(0xffffff, { map: tex.lockerSkin, rough: 'gloss', roughness: 0.52, metalness: 0.38 }),
    lockerVent: standard(0x22262a, { roughness: 0.9 }),

    /* --- the item roster --------------------------------------------------------- */
    itemMetal: standard(0xbca868, { roughness: 0.32, metalness: 0.55 }),
    itemSteel: standard(0x8e9490, { roughness: 0.34, metalness: 0.5 }),
    itemWood: standard(0x6f5638, { roughness: 0.86 }),
    itemCloth: standard(0xd0c8b0, { roughness: 1 }),
    itemAccent: standard(0xa8462c, { roughness: 0.66 }),
    itemBrass: standard(0xb8963c, { roughness: 0.3, metalness: 0.5 }),
    itemEnamel: standard(0xe2dcc6, { roughness: 0.34 }),
    itemGold: standard(0xc09a34, { roughness: 0.28, metalness: 0.52 }),
    itemTar: standard(0x101116, { roughness: 0.16, metalness: 0.2 }),
    itemGlass: () =>
      new THREE.MeshStandardMaterial({ color: 0xa4b4b8, roughness: 0.06, metalness: 0.12, transparent: true, opacity: 0.32 }),
    itemGem: standard(0xd8e4e0, { roughness: 0.05, metalness: 0.14, emissive: 0x5a90a0, emissiveIntensity: 0.7 }),

    /* --- thrown-item effects ------------------------------------------------------ */
    'vfx.tar': () =>
      new THREE.MeshStandardMaterial({ color: 0x0e0f12, roughness: 0.14, metalness: 0.24, transparent: true, opacity: 0.95 }),
    'vfx.tarRim': standard(0x2c2a24, { roughness: 0.86 }),
    'vfx.flash': () =>
      new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.9, depthWrite: false, fog: false }),

    playerBody: standard(0x6a6f78, { roughness: 0.84 }),
    playerMask: standard(0xd4cec0, { roughness: 0.56 }),

    // Cloned by the ghost builder so it can tint per alert level without touching
    // the shared cache - see art/shared/characters/ghost.ts.
    ghostShroud: () => new THREE.MeshStandardMaterial({ color: 0x3c3a34, roughness: 1, transparent: true, opacity: 0.82 }),
    ghostAlert: () => new THREE.MeshStandardMaterial({ color: 0x8a6a2c, emissive: 0x8a6a2c, emissiveIntensity: 1 }),
  });
}
