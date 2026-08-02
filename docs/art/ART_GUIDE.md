# Art Guide

Everything visual is authored **in code, in three.js**, under `art/`. No modelling
tools, no imported meshes. `assets/` holds only raw media (audio, textures, UI images).

If you are here to build **a room**, read [`ROOM_FORMAT.md`](ROOM_FORMAT.md).
If you are here to build **a whole new map**, read [`ART_PACK_CHECKLIST.md`](ART_PACK_CHECKLIST.md).
If you are here to build **a door / chest / item / character**, read [`SHARED_ART.md`](SHARED_ART.md).

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
art/  ──reads──►  config/  (dimensions only)
art/  ──✗──────►  src/
```

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
- Procedural textures (canvas-generated noise, gradients) are preferred over image
  files — they ship as code, scale free, and keep `assets/` small.
- Vertex colours are cheap and great for grime, water lines and soot.

## 5. Geometry

- Build geometry **once at module scope** and reuse it across instances:
  ```ts
  const PLANK = new THREE.BoxGeometry(0.14, 0.04, 2.2);   // module scope: good
  ```
- Use `InstancedMesh` for anything appearing >20 times (books, bottles, tiles).
- Merge static geometry that shares a material with `BufferGeometryUtils.mergeGeometries`.
- Never generate geometry in a render loop.

## 6. Performance budgets

Per room — full table in [`ROOM_FORMAT.md §7`](ROOM_FORMAT.md#7-performance-budget-per-room).

| | Budget |
| --- | --- |
| Draw calls | ≤ 40 |
| Triangles | ≤ 40 000 |
| Real lights | ≤ 2 (≤ 1 casting shadows) |
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

## 8. Animation

Minimal by design. The enemy floats, doors swing, chest lids lift, locker doors
open. That is nearly all of it.

- Logic owns state; art owns appearance. Logic sets `hinge.rotation.y`; art decides
  what the hinge looks like.
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
│                  (geometry utils, procedural textures, noise, greeble, kit base)
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
