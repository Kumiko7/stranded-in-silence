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
- Cache textures at **module scope**, like the geometry cache in `art/lib/build.ts`.
  `MaterialLibrary.dispose()` deliberately leaves them alone so the next run reuses
  them.
- Vertex colours are cheap and great for grime, water lines and soot.

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
│  ├─ build.ts     cached box geometry, colliders, the material library
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
