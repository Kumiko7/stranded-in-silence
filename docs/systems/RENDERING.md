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

**Within one run, cost grows as a team opens the map up, and that is real rather
than a leak.**
An open door is an open sight line. Measured over a whole map: 40 average draw
calls with every door shut, 106 with all 35 open. Simulating four minutes in one
spot showed no growth in objects, textures, programs or frame time, and the HUD
and feedback layers build their DOM once, so there is nothing accumulating.

**Verified** by rendering 864 camera poses per map twice, once culled and once
with every object forced visible, and comparing the framebuffers: 0.03 % of
pixels differ on average, and the worst case is a one-pixel z-fighting seam
between two rooms' back-to-back walls that is *absent* from the culled image.

## 3a. Across runs, a scene has to leave nothing behind

Lobby → run → lobby is a loop a session goes round all evening, and it used to
get slower every time round. Three kinds of thing survived a teardown, none of
them visible in a profile of a single run:

| Leaked | Per cycle | Fix |
| --- | --- | --- |
| The cabin fire's cube shadow map — a render target the renderer holds until the light that owns it is disposed | 1 texture | `lobbyScene.dispose()` now disposes light shadows, as `worldBuilder.dispose()` already did |
| Size-keyed geometry caches at module scope — the shared box cache in `art/lib/build.ts` **and one per shape in each pack's `kit/props.ts`**. Art sizes furniture from the seeded RNG, so a new seed reuses almost nothing and mints fresh keys for nearly everything it places | ~1,270 geometries (mansion), ~3,450 (viscera) | A cache belongs to one world: `clearGeometryCache()` at the tail of `Game.end()` and `Lobby.end()`, with pack caches joining it through `ownGeometryCache()` |
| Sustained audio voices keyed `effect:<id>` — silenced but kept, each an HRTF panner still wired to a bus | one per alarm clock | `releaseSustain()` / `releaseSustains()`, see [`AUDIO_VOICE.md`](AUDIO_VOICE.md) |

A second pass over the same loop, once `abyss` shipped, found two more — both of
them **outside** `renderer.info`, and neither growing the numbers that pass
watched:

| Leaked | Per cycle | Fix |
| --- | --- | --- |
| A **cache entry handed to the batcher with `consume: true`**. `consume` frees the geometry it was given, which is right for a geometry built at the call site and wrong for one that came from `boxGeometry()` / `cyl()` / a pack cache — the buffer is freed while the cache still holds it, and `clearGeometryCache()` then frees it a second time. Five sites: `debris()` in the abyss and viscera kits, the cabin's mirror sheen, the dart flight, and the scoreboard's pip geometry (which `dartBoard.dispose()` freed by hand) | ~130 double frees (abyss), ~135 (viscera) | The geometry stays the cache's. `consume` is only ever for geometry built at the call site |
| Loose geometry no teardown owned: the exit door's glow wash and two sign faces (`art/shared/props/door.ts`), and the four lobes of the viscera heart | 3 per run + 4 on viscera | The door returns a `dispose`; viscera's `Room` gained the `own()` seam abyss's already had |

The first of those is the more interesting one, because a double free is not a
leak — it is a **freed buffer still in a cache**, waiting for the next room that
asks for the same size. It survives today only because everything that reaches it
is cloned into a merge before the free lands, which is luck, not design.

**Verified** by driving lobby-run-lobby cycles through `tools/leakcheck.html`
(`?map=abyss&cycles=10`), which builds and tears down the real lobby scene and
the real world through `Game.end()`'s exact three steps and reads
`renderer.info` at the bottom of each. Its instrument is three.js's own monotonic
ids: every geometry, material and texture takes the next integer from a global
counter, so what a cycle CREATED is a subtraction and `dispose` is patched to
count the other side. Created-minus-disposed is now **0 geometries and 0
materials per cycle on all three maps**, and no geometry is freed twice.

`kept tex` stays at `3 × shadow-casting lights + 3`, which is not a leak: a
`LightShadow` frees its render target rather than the target's `Texture`, so the
counter never sees it. `renderer.info.memory.textures` is flat, which is the half
that matters.

Earlier, over 20 cycles on unique seeds:
textures, geometries and programs flat and identical every cycle, heap growth
0.025 MB per cycle (noise) against 2.6 MB before. At a pinned camera and a fixed
seed, draw calls, triangles, CPU render time and GPU time (`EXT_disjoint_timer_
query_webgl2`) are identical cycle to cycle. WeakRefs to each cycle's roots,
meshes and materials confirm all of them are collected, and the cache sizes go
back to exactly zero on every teardown.

The invariant to keep: **anything a build allocates is freed by the teardown of
the thing that built it.** The one deliberate exception is the texture cache in
`art/lib/textures.ts`, which is bounded by a fixed set of named recipes — it
plateaus (70 textures with both packs loaded) instead of growing.

Worth knowing when chasing the next one: a leak like this is invisible in
`renderer.info` when the geometry is only ever *cloned* into a `MeshBatcher`
merge, because it is never uploaded to the GPU. It shows up as JS heap and as GC
pressure, so measure both — and the cheapest decisive test is to rebuild the
**same seed** twice. Sizes come from the seeded RNG, so a real cache reuses
everything on a repeat and a growing one only grows on new seeds.

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

## 5. Quality tiers

`config/graphics.json → quality.tiers`. Each tier is an **overlay** merged over
the graphics block, exactly the way a map's or a difficulty's overrides are, and
it is applied **last** — after the map's and the lobby's — because it is the
player's machine talking and it should win over a map that asked for six lights.

Nothing in `src/` lists the tiers. `qualityTierIds()` reads them from config, the
options screen renders a chip per id, and the save profile stores the id. Adding
a tier is a config change plus one `options.quality.<id>` locale key per
language.

Only four things are in them, and the order is the measured order of what they
buy on a machine that is struggling:

| In a tier | Applies |
| --- | --- |
| `pixelRatioCap` | **immediately.** Below 1 it is a render scale rather than a cap, because `devicePixelRatio` is 1 on an ordinary monitor. The one knob that scales the whole fragment cost of a frame at once |
| `renderDistanceRooms` | immediately — it is a per-call radius |
| `maxActiveLights`, `shadows.maxCastingLights` | **on the next scene.** A shader's light count may not change while a world is up (§1), so the budgets are read when `setRoomLights` hands a scene over. The options screen says so rather than pretending otherwise |

**`antialias` is deliberately not in them.** It is a WebGL context flag, fixed
when the context is created, so a tier that changed it would quietly wait for a
restart — and a setting that lies about when it takes effect is worse than one
that is not offered. `powerPreference` is the same and is absent for the same
reason.

### Which tier a machine starts on

Measured, once, on the first launch on that machine and never again — silently,
before the menu is drawn. `src/render/probe.ts` opens a throwaway context, draws
a few hundred individually-drawn boxes lit by the same number of lights the game
runs, times a block of them the way `tools/perf.html` learned to, and maps the
result through `graphics.json → quality.probe.thresholds`.

A benchmark rather than a table of GPU names, for three reasons: a table is
wrong the day a new chip ships, it says nothing about the **CPU** — which is
what this game runs out of first — and it cannot see a driver that has quietly
fallen back to software rendering, which a benchmark spots without being told
anything.

It errs **downward**. Someone on a fast machine who starts on `medium` finds the
setting and moves it up; someone on a slow machine who starts on `high` sees a
slideshow and may never learn why. Every unknown — a probe that threw, a context
that would not open, a warm-up that blew `budgetMs` — resolves to the slowest
tier, which is why the thresholds list it first.

It runs **only when there was no profile at all**. A profile that failed to
parse is not a first run: somebody had settings, and silently re-deciding them
is worse than the defaults they will recognise. After the first launch the
answer is the player's.

What the tiers are worth, measured on Kerberos Deep — the heaviest map, and the
one where the signal is clearest:

| | frame | draw calls | triangles | pixels |
| --- | --- | --- | --- | --- |
| `medium` | −14 % | — | — | −44 % on a HiDPI screen |
| `low` | **−39 %** | 525 → 379 (−28 %) | 87k → 68k (−22 %) | −44 % |

The Leviathan and the manor move the same way (−28 % draw calls, −28 % frame).
Note where each saving comes from: the draw calls and triangles are the shorter
render distance, the pixels are the 0.75 render scale, and `medium` buys its
14 % almost entirely from the light budget. On a **fast** card the pixel column
is nearly free and the draw-call column is the whole story; on a weak one the
pixel column is the one that saves the frame. The tier moves both because the
machine that needs it usually cannot do either.

**Read the frame column with care, and prefer the counters.** Draw calls,
triangles and pixels are deterministic; frame time on a fast card is a small
number measured on a busy desktop, and single runs of `tools/perf.html` have
disagreed with each other by 30 % on the lighter maps. Raise `?rounds=` and
trust the heaviest map.

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

### What each map costs

Measured with `tools/perf.html` and `tools/leakcheck.html?rooms=1&props=1`, every
door open, at 1920x1080. Nothing here is a leak — it is what the packs are.

**The per-frame numbers in this table were wrong for a long time and are four to
five times higher than they used to say.** `updateVisibility` takes a radius in
METRES and `renderDistanceRooms` is a room count; `Game` has always multiplied
by the cell size and `leakcheck.ts` never did. Every draw-call and triangle
figure this tool printed was therefore taken with a **three-metre** render
distance, which culls everything but the cell the camera stands in. Fixed, and
worth remembering the shape of: a measuring tool that agrees with your hopes is
the one to check first.

| | mansion | viscera | abyss | crypt | forge | heartwood |
| --- | --- | --- | --- | --- | --- | --- |
| Triangles standing in the map | 155k | ~230k | ~390k | ~400k | 249k | **433k** |
| Triangles drawn, average pose | 25k | 49k | 61k | 67k | 51k | **71–89k** |
| Draw calls, average pose | 299 | 290 | 327 | 348 | 331 | **315–364** |
| Shadow-casting lights (of a budget of 2 lit at once) | 3–6 | 5–7 | 11–17 | 7–11 | 22–25 | 31–33 |

**Every triangle figure in that table predates the 10 000-per-cell pass and is
now about a third too high.** Re-measure with `tools/perf.html` before quoting
it; the shape of the map — draw calls, the ranking of the packs, where the cost
sits — did not move, and the light counts did not move at all.

What the pass did move, measured exactly by `npm run validate:art` over every
door combination and three seeds. "Library" is the sum of every blueprint the
pack ships, which is not a map (a map repeats rooms) but is the number a room
pass actually changes:

| | mansion | viscera | abyss | crypt | forge | heartwood |
| --- | --- | --- | --- | --- | --- | --- |
| Blueprint library, before | 127k | 231k | 274k | 296k | 168k | 300k |
| Blueprint library, after | **101k** | **202k** | **198k** | **212k** | **157k** | **220k** |
| Worst room, before (per cell) | cellar, 10.8k | tendrils, 17.0k | vents, 19.1k | ossuary, 20.7k | roots, 10.1k | tendrils, 18.9k |
| Worst room, after (per cell) | library, 9.96k | bloom, 9.85k | jelly, 9.94k | ossuary, 9.91k | roots, 8.69k | fungaldeep, 9.89k |

1.60 M triangles standing across the six libraries, down to 1.09 M. **Every
blueprint in the game is now inside 10 000 triangles per cell**, which is the
first time the triangle budget has had no argued exceptions in it at all.

`heartwood` is the heaviest map standing and it is worth knowing where that went,
because the answer is the same one `forge` found and it is not the set pieces:
**18.9 % of the whole map is `strip()` in its `kit/shell.ts`** — the trim and the
register course round the base of every wall, 7,248 calls at twelve triangles
each. A trick in the shell is a trick you pay for in every room, and the cheapest
time to find that out is `tools/leakcheck.html?props=1` before the rooms are
written rather than after.

Those are the numbers **after** "a wall is a wall" below, which is most of why
they are close together now. Before it, abyss was 525 draws and 87k triangles
and viscera 402 and 64k; the packs differed mainly in how many walls they left
unreserved, which is not a thing anybody was authoring on purpose.

**The frame is draw-call bound, not fill bound**, and that is the single most
useful thing measured here. On an RTX 4070 at 1080p, `tools/perf.html` reports
frame time and `render()` submission time as the *same number* on every map and
every variant: 400-500 draw calls at roughly 11 µs of JS each is the whole
frame, and halving the resolution changes it by less than the noise. A weak GPU
will feel the pixels too — which is what the low quality tier's render scale is
for — but a weak CPU is what the packs are actually up against, and the lever
for that is fewer draws: culling, and materials per room.

Two knobs worth their cost, measured against `base` on Kerberos Deep:
`renderDistanceRooms` 3 → 2 is **−20 % draw calls**, and `maxActiveLights` 6 → 4
is about **−10 % of frame time**. Both are in the low tier.

Every abyss room is inside the per-cell budget in
[`../art/ROOM_FORMAT.md`](../art/ROOM_FORMAT.md) §7 — as, now, is every room in
every pack. Only 8% of abyss's triangles are see-through, so this is geometry
cost rather than an overdraw problem.

The crypt stands as heavy as abyss and draws two thirds of it, because it is a
map of small walled rooms rather than of halls with sight lines through them:
only 4.6% of its triangles are see-through, and the culler gets more out of a
crypt than out of an oceanarium. Two warnings are accepted rather than fixed:
`crypt.robbers` at 41 draw calls, which is the hinge room and legitimately
carries both halves' material sets, and `crypt.hypostyle` at 34 colliders, which
is three cells' worth of shell wall against a guideline written for one. Its
2x2 set piece, `crypt.sepulchre`, used to be the pack's one argued triangle
exception at 36.1k under a flat 25k; the budget counts per cell now and it was
never over that.

The pack came down from 489k triangles to 413k in two `?props=1` passes without a
visible change, and every reduction was the same shape — **segment counts on
small round things there are a thousand of**. In order: the votive flames (7 × 6
spheres on a two-centimetre flame, 15 % of the map), mushroom caps (9 × 5 domes,
6 %), dust motes (4-segment specks, 3.5 %), rubble and the arch voussoirs. A
five-segment flame and a three-segment mote are indistinguishable at the fog
density they are seen through, and together they were a fifth of the map.

Two findings from that pack generalise, and both are in
[`../art/ROOM_REVIEW.md`](../art/ROOM_REVIEW.md) in full:

- **Shadow casting is a per-pack decision, and the default should be off.**
  `MeshBatcher` splits a material into two meshes when some of its geometry casts
  and some does not, so a material shared between a shadowed tomb and an
  unshadowed skirting costs two draw calls. Making casting opt-in took the crypt's
  worst room from 54 draws to 34 across the whole pack.
- **`?props=1` finds the 15% detail every time.** Abyss's was `tubeWorms`;
  the crypt's was the votive lamp station, 80k triangles over 1,932 of them,
  three quarters of it in 7 × 6 spheres on two-centimetre flames. Five-segment
  flames gave back 50k triangles and look identical.

**Vulcan's Anvil is the first pack built with all of that already written down**,
and it shows in the shape of the numbers rather than in any one of them: 249k
standing against abyss's 429k, no 1x1 over 10.2k, and the whole map inside the
25k per-room budget of the day without a single argued exception. What it cost instead is
**shadow casters** - 22 to 25 of them declared, more than any other pack - because
almost every room has one baked lamp and the pack's silhouettes (a crucible, a
cutter head, a rack bank, an ash cast) are what earn casting. Only two are lit at
once, so that is a load-time cost at `warmUp()` and nothing per frame.

Its `?props=1` line item is the same one the crypt had, in the same place, for
the same reason: **the shell's own trim is the biggest single spender.** `strip()`
- the kick plate, the heat register, the band stiffeners and the cornice - is
18.5 % of the map over 4,260 calls at twelve triangles each. That is already the
cheapest geometry that reads (a box), so unlike the crypt's votive flames there
is nothing to give back; the lesson is only that **a course that runs round every
wall of every room is a fifth of your map before you have placed a prop**, and
that it should be costed on the day it is written rather than after twenty rooms
are built on top of it.

`?props=1` charges every batched triangle to the art function that added it,
which is where the budget conversation should start rather than with a room. It
is what found the one reduction made so far: `tubeWorms` was **15% of the whole
map**, three quarters of it in the growth bands, because `ring()` is a 6 × 7
torus — 84 triangles for an 8 mm band, on a tube that has six sides itself. A
six-sided collar is 24, and the pack lost 40k triangles (8.5%) on a detail
nobody can resolve at the fog density it is seen through. The remaining large
line items, if more is ever wanted: `mouth` 42.5k, `strip` 37.4k, `specimenJar`
28.9k, `bioMotes` 22.9k (764 glowing specks at ~30 triangles each).

### Halving the packs, and why it took three passes over everything

The budget went from 21 000 a room to 10 000 a cell because the frame could not
carry six packs at 1.6 M triangles standing. That is the first time this number
has driven the art rather than followed it, and the interesting part is what the
profile looked like when the work started: **there was nothing big left.**

`tools/leakcheck.html?props=1` and its node twin had already found and taken the
one-line items every previous pass lived on — the tube worms' growth bands, the
votive flames, the dust motes. What was left, in every pack, was a flat tail:
after the first pass no art function anywhere was over 4 % of its own map, and
the top thirty summed to about half of it. A map is forty thousand boxes at
twelve triangles each and fifteen thousand small round things at twenty to
eighty, and **a box is already the cheapest thing that reads.** There is no
fifteen-per-cent detail to find twice.

So it came from three things applied to everything at once, in this order of
yield:

| | What | Worth |
| --- | --- | --- |
| 1 | **A size ramp under every round primitive.** `sides(radius, asked)` in `art/lib/build.ts`; every pack's `ball`/`cyl`/`ring`/`spike`/`disc` resolves through it, and so does every `new THREE.SphereGeometry` the shells and rooms used to build by hand | ~15 % |
| 2 | **Open-ended tubes wherever a chain hides its own caps** — a branch, a vine, a rib, a worm tube. Every cap but the two at the ends of the run is inside the next link | ~5 % |
| 3 | **About a third off the pitch of every course that runs round a wall**, pieces grown to match so the course still reads as beaded rather than gapped | ~8 % |

and only then, room by room, whichever prop `?props=1` charged a quarter of a
room to.

Three things are worth carrying forward from it:

- **The ramp had to stop being a call-site decision to land.** "Segment counts on
  small round things there are hundreds of" is the oldest note in these
  documents, and it had been applied by hand four times, to whichever function
  the profiler happened to name. Putting it under the helpers instead caught
  every call in the game in one change, including the ones nobody had profiled —
  and because it is a `Math.min` against what the caller asked for, it can only
  take detail off something too small to show it. A wheel that asked for six
  sides still gets six.
- **Routing the shells' and rooms' hand-built geometry through the cached kit
  helpers was worth as much as the ramp itself**, because roughly a third of the
  round geometry in the game was constructed with `new THREE.SphereGeometry(...)`
  at the call site and never saw a helper at all. That change has a trap in it:
  `consume: true` frees the geometry it was given, which is right for a buffer
  built at the call site and a double free for one that came out of a cache (see
  §3a). Every converted call had to drop `consume` — and `subUV()` had to keep
  it, because it CLONES.
- **A course in a `kit/shell.ts` is multiplied by the whole map before a prop is
  placed in a room.** This file has said that twice already, about the crypt's
  trim and the forge's. It is now the reason the third pass exists: widening the
  pitch of the register, the beads, the fins, the stiffeners and the pegs across
  five packs cost nothing anyone can see and was most of a tenth of the game.

### A wall is a wall

The culler used to treat every wall a blueprint had not reserved for a door as
**possibly** having a window in it, and therefore as permanently open. Logic
cannot see art, so that was the conservative answer. It was also, on Kerberos
Deep, **38 % of the draw calls in an average frame**, on a game that spends its
frames submitting draw calls.

It bought nothing. Measured with `tools/perf.html?verify=1`, which renders every
pose culled and again with the whole map visible and counts the pixels that
differ, dropping the assumption costs:

| mansion | viscera | abyss | crypt | forge |
| --- | --- | --- | --- | --- |
| 0.000 % | 0.013 % | +0.54 % | 0.000 % | 0.167 % |

Four of the five packs are pixel-identical. The reason is that **art never
showed the next room through a window anyway**: a manor casement has a night
pane behind its glass, an abyss viewpane has the ocean painted behind it, a
crypt shaft has its own light column. The far room was being drawn so that it
could be entirely hidden by the near room's own backdrop.

There was no art change needed for this and none was made. A new window still
works — it just shows what the art puts behind it, which is what every window in
the game already did.

### The 1.1 % on Kerberos Deep, which predates all of this

`verify` reports abyss at 1.630 %, and only 0.54 % of that is the change above:
the map measured **1.089 % with the old culler too**, at the identical worst
pose. Standing in `abyss.vents@4,2` looking north, a large lit area of the map
is culled and should not be. It is not a window — that room declares no ports,
and a ray down the crosshair hits its own north wall first, at 3.70 m, with the
next room's wall 30 cm behind it. Whatever is drawing those far rooms over an
opaque near wall is not culling, and finding it is worth doing: reproduce with
`tools/perf.html?verify=1&map=abyss`, and `&shot=diff` paints the missing
region red over the frame it went missing from.

The lesson from getting this wrong the first time is in the tool, not the map.
The first comparison said the old culler scored 0.085 % and the new one 1.34 %,
and the change was reverted on the strength of it. Both numbers were taken
before `verify` learned to silence the art's own animation and freeze the shadow
maps — a revealed room's frozen `onBeforeRender` clock jumps, some of that
motion moves a LAMP, and the relit map reads as culling having hidden something.
Measured properly, the two rules differ by half a percent. **Compare rules under
one instrument, and be suspicious of a measurement that agrees with you.**

## Deliberately not done

- **A general post-processing stack.** Gameplay feedback is a DOM compositing
  layer — see [`../ARCHITECTURE.md`](../ARCHITECTURE.md) §10.
- **Quality tiers.** `graphics.json` is flat, by decision.
- **Room streaming.** Rooms are all built up front and culled, not loaded and
  unloaded. At 33 rooms and a 110 ms build that is still the right trade; the
  seam is `BuiltWorld.updateVisibility`.
- **A BVH for raycasts.** The two-pass split made the ray cheap enough that a
  dependency and a per-geometry acceleration structure would buy nothing.
