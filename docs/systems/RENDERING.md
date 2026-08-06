# Rendering

Owner: `src/render/`, plus the culling half in `src/world/visibility.ts`.
Config: `config/graphics.json`.

The look is documented in [`../art/ART_GUIDE.md`](../art/ART_GUIDE.md) and the
lighting rules in [`../art/ROOM_FORMAT.md`](../art/ROOM_FORMAT.md) §7. This file
is about the three things that decide whether a frame arrives on time.

---

## 1. The light count is fixed, not capped

three.js compiles a shader program **per material, per light count**. Six point
lights and one shadow caster is a different program from six and two — so a
renderer that simply enables "the nearest six lamps" recompiles every material
in the map each time the mix changes. That is a frozen frame, mid-run, and there
were seven different mixes in a single walk across the mansion.

So `Renderer` keeps two pools and a fixed budget for each:

| Config | Meaning |
| --- | --- |
| `maxActiveLights` | Point lights on at once, full stop. |
| `shadows.maxCastingLights` | How many of those are shadow casters. |

Both are filled to exactly their budget, nearest first, for as long as a scene
is up. When there is no shadow-casting lamp nearby, a distant one is enabled
anyway: it costs a slot and lights nothing (point lights reach exactly `distance`
and no further), which is a much better trade than a recompile.

**A slot changing hands is faded, not switched** (`lightFadeSeconds`), or you
watch rooms come on as you walk up to them. The fade cannot keep the outgoing
lamp lit alongside the incoming one — that is one more light, and one more light
is a different shader — so the handover is sequential: the lamp losing the slot
goes down to black, and only then does the slot change hands and the new lamp
come up. The count never moves. The fade is applied to the lamp's **colour**,
not its intensity, because art already animates intensity (`flicker()` rewrites
it every frame) and the two would fight.

Two consequences worth knowing:

- **Culling never hides a room outright.** three.js does not light anything from
  a light whose parent is hidden, so hiding a room switches its lamps off — and
  the count moves again. `hidableParts()` in `worldBuilder` therefore hides the
  biggest subtrees that hold *no* light and leaves the path down to each lamp
  standing: one entry for the room's merged geometry, a couple for whatever is
  not batched. What is *lit* and what is *drawn* stay separate questions, which
  is how the manor has always looked — a fire behind a shut door spills round it.

  Moving the lamps out into a group of their own is the obvious alternative and
  it is a trap. Art animates them in its own local space: `sway()` on a
  chandelier rewrites the lamp's `position` every frame from a value captured at
  build. A reparented lamp gets dragged back to where the room thinks it is, and
  the room goes black. It cost an afternoon; do not do it.
- **A culled room's cosmetic tick stops** (`Room.tick` runs off `onBeforeRender`),
  so a flicker in a room you cannot see holds still. It still lights what it lit.

## 2. Everything one-off is paid at the loading card

`Renderer.warmUp()` is awaited before a peer reports `ready`, so it happens
behind the loading screen the load gate already puts up
([`NETWORKING.md`](NETWORKING.md) → "Starting together"). It does two things:

- `compileAsync()` over the whole scene. Because the light counts are fixed,
  the programs it compiles are the exact ones the run will use, and no material
  is ever compiled again.
- Walks every shadow-casting lamp through the active slots, one render each,
  with the whole map temporarily visible. A point light renders six faces the
  first time it is seen; room lamps set `shadow.autoUpdate = false` in the art,
  so once is all they ever need. Doing it with everything visible also means a
  map baked here is not missing the furniture that happened to be culled.

It costs about 60 ms on top of a 110 ms world build. It replaces freezes of up
to a second and a quarter, arriving at random while somebody is being chased.

## 3. Portal culling: a room is drawn if it can be seen

`src/world/visibility.ts`. Distance alone (`renderDistanceRooms`) stops helping
the moment a team has opened most of the doors, because on a 6×6 grid nearly
everything is then within range of everything — which is why a run got slower
the more of the map had been explored.

Instead, flood the cell graph out from the cell the camera stands in, and step
through an opening only if it is not shut **and** its projection still overlaps
the screen rectangle inherited from the openings already walked through. A
doorway you are not looking at hides its room whether it is open or not.

Three details make it correct rather than merely fast:

- **A doorway is not the only opening.** The mansion shell cuts windows into any
  wall the blueprint did not reserve for a door, and its glass is thin enough to
  see through. Logic cannot see art, but `RoomBlueprint.doorWalls` tells it which
  walls are *reserved* — those are solid when they get no door. Every other wall
  is treated as permanently open, which costs about one extra portal per room.
  Only the **near** room's wall is asked about: through a hole in it you see the
  far room's own wall, which is drawn with the far room.
- **Art is allowed to lean out of its room.** A moonbeam from a window falls
  through the wall behind it. Objects are therefore culled by the cells their
  geometry actually *reaches* (`cellsCovered`), not the cells their room
  occupies, with one wall thickness of slack so ordinary walls do not count.
- **A door counts as open the moment it starts to swing**, so the room behind it
  is already there before the gap is wide enough to look through.

It runs **inside** the distance test rather than replacing it, and every case it
cannot answer exactly — a doorway straddling the camera plane, a camera outside
the grid — answers "visible". It can only hide what distance was about to hide,
so it cannot introduce pop-in. `culling.enabled: false` turns it off and leaves
the distance test on its own.

`culling.screenMargin` is worth understanding before touching it. It widens
every projected doorway, and it **compounds through each doorway in a sight
line**, so it is the difference between 106 and 146 average draw calls in an
opened-up map. It is only numerical slack: culling runs in the same fixed tick
that sets the camera, and the camera does not move between the frames drawn from
that tick, so there is no lag for it to cover.

**Cost grows as a team opens the map up, and that is real rather than a leak.**
An open door is an open sight line. Measured over a whole map: 40 average draw
calls with every door shut, 106 with all 35 open. Simulating four minutes in one
spot showed no growth in objects, textures, programs or frame time, and the HUD
and feedback layers build their DOM once, so there is nothing accumulating.

**Verified** by rendering 864 camera poses per map twice, once culled and once
with every object forced visible, and comparing the framebuffers: 0.03 % of
pixels differ on average, and the worst case is a one-pixel z-fighting seam
between two rooms' back-to-back walls that is *absent* from the culled image.

## 4. The interaction ray is two passes

`Game.#lookTag`. Room geometry is nine tenths of the triangles in the map and
the camera stands inside its bounding spheres, so a ray tested against it scans
every triangle of every nearby room — 20 ms, sixty times a second, for a 2.6 m
ray. It also cannot ever *find* anything, because room geometry carries no tag.

So the ray asks the cheap question first: doors, containers, items and teammates
(`BuiltWorld.raycastTargets`), which are small and rejected on a bounding sphere.
Only when one is hit does it test the rooms being drawn
(`BuiltWorld.occluders`), with `far` set to that hit, to find out whether a wall
is in the way. The answer is identical — verified against the old single-pass ray
over 2016 poses — and it costs 0.14 ms instead of 20.

`MeshBatcher` also gives merged geometry a bounding **box** as well as a sphere,
because a merged batch is usually a slab (the floor, the ceiling, one wall) and
three.js tests the box second.

---

## Numbers

Mansion, 6×6, measured in the running game across every cell of the map at eight
headings, over several seeds.

| | Before | After |
| --- | --- | --- |
| Interaction ray | 20.7 ms / tick | 0.14 ms / tick |
| Draw calls, every door shut | 459 avg, 803 peak | 40 avg, 133 peak |
| Draw calls, every door open | 459 avg, 803 peak | 106 avg, 325 peak |
| Triangles drawn | ~76 000 | 5 200 – 12 600 |
| Shader programs after three passes over the map | 12 → 135, still climbing | 14, constant |
| Visible light mixes seen in one walk | 7 | 1 |
| Biggest single-frame jump in a lamp's brightness, walking 39 m | 1.0 (a switch) | 0.026 |
| Frames over 16 ms | 20 in 4320, worst 1194 ms | 0 in 4320, worst 11.7 ms |
| Load | 110 ms world build | + 61 ms warm-up |

## Deliberately not done

- **A general post-processing stack.** Gameplay feedback is a DOM compositing
  layer — see [`../ARCHITECTURE.md`](../ARCHITECTURE.md) §10.
- **Quality tiers.** `graphics.json` is flat, by decision.
- **Room streaming.** Rooms are all built up front and culled, not loaded and
  unloaded. At 33 rooms and a 110 ms build that is still the right trade; the
  seam is `BuiltWorld.updateVisibility`.
- **A BVH for raycasts.** The two-pass split made the ray cheap enough that a
  dependency and a per-geometry acceleration structure would buy nothing.
