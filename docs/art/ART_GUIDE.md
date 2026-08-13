# Art Guide

Everything visual is authored **in code, in three.js**, under `art/`. No modelling
tools, no imported meshes. `assets/` holds only raw media (audio, textures, UI images).

If you are here to build **a room**, read [`ROOM_FORMAT.md`](ROOM_FORMAT.md).
If you are here to build **a whole new map**, read [`ART_PACK_CHECKLIST.md`](ART_PACK_CHECKLIST.md).
If you are here to build **a door / chest / item / character**, read [`SHARED_ART.md`](SHARED_ART.md).
If you are here to **look at what you built**, read [`ROOM_REVIEW.md`](ROOM_REVIEW.md) —
it screenshots every room through the game's own renderer, which is the only way to
review art you cannot see.

---

## 1. The one rule

> **Art may not import from `src/`.**

Art receives everything it needs through the build context and returns a
`THREE.Object3D` plus metadata. Logic never inspects the inside of an art object,
only the named parts the contract promises. This is what lets a prison map and a
mansion map run byte-identical gameplay code.

The dependency arrow is one-way:

```
src/  ──reads──►  art/lib/contract (types only)
src/  ──calls──►  art pack builders (at runtime, via the pack registry)
art/  ──✗──────►  src/   and   art/ ──✗──► config/
```

Art imports **only** `three` and `art/lib/*`. Even world dimensions arrive through
`ctx.dims` rather than a config import, so an art pack is a self-contained unit.

## 2. Visual direction

**Horror. Dark, but never blind.**

The lighting design is doing the heavy lifting so the geometry does not have to be
AAA. Lean into that:

- **Silhouette over detail.** A recognisable shape in low light beats a dense mesh.
- **Contrast, not darkness.** Players carry **no light source**, so every room must
  light itself: a dim practical, moonlight from a window, embers. If a player cannot
  navigate your room on its own light, the room is broken.
- **Warm sources, cold ambient.** Practicals are candle-warm (`#ffe9c8`-ish);
  ambient fill is blue-grey (`#2a2f45`). That split reads as horror instantly.
- **Use mid-grey albedos, not near-blacks.** Colours are converted to *linear*
  space before lighting, where `#2b2b33` is about `0.025` — effectively black, and
  no amount of light will recover it. Darkness comes from the lighting and the fog.
  A wall that looks right in a colour picker is usually far too dark in the engine.
- **Fog is a feature.** It hides the far wall and the seams between rooms. Do not
  fight it with bright far-field geometry.
- **Decay and asymmetry.** Nothing is level, nothing is clean, nothing is new.
  Tilt paintings a few degrees. Vary spacing. Break symmetry with `ctx.rng`.
- **Negative space is scary.** An empty room with one chair is more effective than
  a cluttered one. Vary density room to room.

## 3. Density and variety

A pack needs **at least 15 unique rooms**. Rooms repeat within a run, so they must
survive being seen three times:

- Give each room a strong **one-line identity** ("the flooded kitchen", "the room
  with all the clocks"). If you cannot write it, the room is not distinct enough.
- Use `ctx.rng` for per-instance variation: which paintings, which candles are lit,
  where the debris sits. Two copies of the same blueprint should not look identical.
- Vary vertical interest — mezzanines, low beams, tall shelves — even though
  movement is flat.

## 4. Materials

- **Always** get materials from `ctx.materials`. Creating materials per room instance
  is the fastest way to tank the frame rate with duplicate rooms.
- Prefer `MeshStandardMaterial` with high roughness. Metalness is almost always `0`
  except for actual metal.
- Procedural textures are preferred over image files — they ship as code, scale
  free, and keep `assets/` small. Generate them as a **`THREE.DataTexture` from a
  typed array, never from a `<canvas>`**: art has to build headless in Node for
  `npm run validate:art` (§7), and `document.createElement('canvas')` would work in
  a browser and throw there. `art/lib/textures.ts` has the seeded noise, the colour
  helpers and the cache; `art/packs/mansion/textures.ts` is a worked example.
- Cache textures at **module scope**. There is a fixed set of them — one per named
  recipe — so the cache is bounded and `MaterialLibrary.dispose()` deliberately
  leaves them alone for the next run to reuse.
  **A cache keyed on numbers a room made up is a different thing**: the box cache in
  `art/lib/build.ts` is keyed by size, and because art sizes furniture from the
  seeded RNG, a new seed mints a new key for nearly every box it places. It pays for
  itself inside one build and would grow forever across runs, so it is scoped to a
  world and freed by `clearGeometryCache()` (`Game.end()` / `Lobby.end()` call it).
  If you add a cache, know which of those two it is.
- **A size-keyed cache in a pack must call `ownGeometryCache()`**, once, at module
  scope beside it — that is what gives it the same per-world lifetime. Both packs'
  `kit/props.ts` do it for their `cyl` / `ball` / `ring` / `quad` / `spike` / `disc`
  helpers. One viscera build fills those with 2,677 geometries; unregistered, every
  one of them is retained until the tab closes and nothing will report it.
- Vertex colours are cheap and great for grime, water lines and soot.
- **Light landing on a surface is additive; a surface is not.** A patch of
  caustics, a projected glow, a light spill on a floor - painted as an ordinary
  lit or emissive decal, all of them bring their own dark background with them
  and lay it over whatever they touch. A `MeshBasicMaterial` with
  `blending: THREE.AdditiveBlending` drops the dark half and adds only the
  bright, which is what light does.
- **And it still needs a mask.** Additive fixes the dark background; it does
  nothing about the *edge*. A flat-coloured disc ends on a hard circle and a quad
  of haze has four corners, so an unmasked wash reads as a pancake of paint
  however faint you make it. Give every wash a radial falloff and every plume a
  soft-sided one as its `map` - one small texture serves a whole pack, and it is
  the difference between a pool of light and a decal.
- **Vapour is additive too.** Steam, gas, heat shimmer and dust are light
  scattering, not a grey surface: alpha-blended they lay a film over whatever is
  behind them at any opacity you can still see. Added and masked, they can be
  several times stronger and never grey anything out.
- **Water in a container is `side: THREE.BackSide`.** A tank is a cylinder and a
  front-faced cylinder of water is an opaque wall between the eye and everything
  floating in it. Back-faced, only the far wall draws and the contents read.
- **Translucent volume wants to be thin.** Fog, smoke, haze, a light shaft: 0.05
  opacity, not 0.3, and never in front of something lit. Two crossed quads
  double whatever number you picked.
- Tune an emissive **against the room's own lamps**, never on its own. Anything
  that ends up brighter than the practicals stops reading as a detail and starts
  reading as the light source, and the room's lighting design collapses.

## 5. Geometry

- Build geometry **once at module scope** and reuse it across instances:
  ```ts
  const PLANK = new THREE.BoxGeometry(0.14, 0.04, 2.2);   // module scope: good
  ```
- Use `InstancedMesh` for anything appearing >20 times (books, bottles, tiles).
- Merge static geometry that shares a material. `art/lib/merge.ts` (`MeshBatcher`)
  does it for you: add posed geometry, get back one mesh per material. That is the
  difference between a detailed room costing 300 draw calls and costing 20. It can
  also re-project UVs onto world axes, so texel density stays consistent whether a
  texture lands on a 0.4 m skirting board or an 8 m ballroom floor.
- Anything the batcher allocated must be freed: return its `dispose` as
  `BuiltRoom.dispose`.
- **Animated geometry gets a batcher of its own.** A merged mesh cannot move, so
  anything the room animates has to stay out of the room's batch - but that does
  *not* mean one `THREE.Mesh` per leaf. Give it a second `MeshBatcher`, animate
  the group `build()` hands back, and free that batcher too. A swaying kelp stand
  cost 32 draw calls as loose meshes and 2 as its own batch.
- **Nothing outside the batcher frees itself.** `BuiltRoom.dispose` is whatever
  you return; a geometry you `new`-ed for a loose mesh is retained until the tab
  closes and no tool will report it. Chain those disposals into the same
  `dispose` (`Room.own()` in the abyss pack is one way to do it).
- **`consume: true` is only ever for geometry made at the call site.** Passing it
  a cached helper (`quad()`, `disc()`, `boxGeometry()`) frees a buffer the next
  room is still using, and the result is an object that silently stops drawing
  several rooms later.
- Never generate geometry in a render loop.

## 6. Performance budgets

Per room — full table in [`ROOM_FORMAT.md §7`](ROOM_FORMAT.md#7-performance-budget-per-room).

| | Budget |
| --- | --- |
| Draw calls | ≤ 40 |
| Triangles | ≤ 40 000 |
| Real lights | ≤ `ctx.lightBudget` — 2 for a 1x1, +1 per extra cell, max 4 (≤ 1 casting shadows) |
| Materials created | 0 |

There is one quality level. Build to the budget above and do not branch on
performance settings — quality presets are a deliberate future addition
(see [`../ARCHITECTURE.md`](../ARCHITECTURE.md) → "Deliberately NOT built").

## 7. Determinism

Multiplayer peers must build **identical** worlds. Therefore:

- **Never call `Math.random()` in `art/`.** Use `ctx.rng`.
- Never read `Date`, `performance.now()` or any device state during `build()`.
- Never branch on screen size, device pixel ratio or platform inside `build()`.
  (Animation and shader work in the render loop may, since it is cosmetic only.)
- **Never touch the DOM anywhere in `art/`** — no `document`, no `<canvas>`, no
  `window`. Beyond determinism, `npm run validate:art` builds every room in Node
  with no DOM and no GL context, which is what lets it prove, before anybody
  launches the game, that no combination of doors and seeds can strand a player.

## 8. Animation

Minimal by design. The enemy floats, doors swing, chest lids lift, locker doors
open. That is nearly all of it.

- Logic owns state; art owns appearance. Logic sets `hinge.rotation.y`; art decides
  what the hinge looks like.
- Cosmetic self-driven motion belongs on a mesh's `onBeforeRender`, where reading
  the clock is fine and the work stops the moment the room is culled. `BuiltRoom`
  has no `update()` and nothing calls one.
- Anything purely cosmetic and self-driven (a flickering candle, a swaying chandelier,
  drifting dust) can be animated by art via an optional `update(dt)` on the build result.
  It must never affect collision or gameplay.

## 9. Adding sound hooks

Art does not play sound. If a piece needs a sound, add a `soundId` to
`config/audio.json` and let logic trigger it. Art may expose an anchor part so the
sound is positioned correctly (e.g. `handle` on a door).

## 10. Where things live

```
art/
├─ lib/            Contract types + helper builders shared by ALL art
│  ├─ contract.ts  the art/logic contract - the only thing src/ may import
│  ├─ build.ts     per-world cached box geometry, colliders, the material library
│  ├─ merge.ts     MeshBatcher: merge by material, world-space UV baking
│  └─ textures.ts  seeded noise + DataTexture builders (no canvas, ever)
├─ shared/         Gameplay art used by every map
│  ├─ characters/  player, enemy
│  ├─ props/       doors, exit doors, chests, lockers, items, traps
│  ├─ materials/   shared material library
│  └─ vfx/         alert indicators, heartbeat, damage flash, escape glow
└─ packs/
   └─ <packId>/
      ├─ pack.ts     manifest: id, room list, shared-art overrides, palette
      ├─ materials.ts pack material library
      ├─ kit/        pack-specific shell + furniture builders
      └─ rooms/      one file per room blueprint
```
