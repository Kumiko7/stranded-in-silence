# Room Review — screenshots of every room, through the real renderer

`npm run validate:art` proves a room *works*: nothing strands a player, no anchor is
buried, the doors line up. It cannot tell you the room is **ugly**, that a rail is
standing on end, or that the chandelier is painting a black bar across the floor.

This is the tool for that. It renders every room of an art pack through the game's
own renderer and writes one **contact sheet per room** to `shots/<pack>/`, which you
then look at — with your own eyes if you are a person, with the `Read` tool if you
are Claude — and iterate.

---

## 1. Running it

```bash
npm run dev
```

Then open **`http://localhost:5173/tools/roomshot.html`**. The page sweeps the pack,
writes a PNG per room and lists what it wrote. No extra dependency, no headless
browser: the renderer needs a GL context, so the review runs where the game runs.

Sheets land in `shots/<pack>/<room>.png` (git-ignored — they are regenerated, never
committed). Then read them:

```
Read C:/<repo>/shots/mansion/library.png
```

### Query parameters

| Parameter | Default | What it does |
| --- | --- | --- |
| `map` | `mansion` | Map id from `config/maps.json`. Its art pack **and its graphics overrides** are used, so a shot matches what that map looks like in a run. The special value **`lobby`** reviews the cabin instead of a pack — see §5.1. |
| `rooms` | all | Comma-separated. Bare names or full ids: `?rooms=library,study`. This is the iteration loop — edit a room, reload, look. |
| `seed` | `20260804` | Drives every `ctx.rng()` call in `build()`. Change it to check a room's per-instance variation. |
| `width` | `512` | Pixels per view. Raise it (`?width=740`) to inspect one room closely. |
| `exposure` | `1` | Multiplies the map's exposure. **Leave it at 1 to judge lighting**; raise it only to see what is in a corner the game keeps black. Anything but 1 is stamped on the sheet so a boosted shot is never mistaken for a real one. |
| `save` | on | `?save=off` renders to the page without writing files. |

Vite dev only. The write endpoint (`/__roomshot/save`, a plugin in `vite.config.ts`)
does not exist in a build, and refuses any path outside `shots/`.

---

## 2. What a sheet shows

```
mansion.library · 1 cell(s) · doors NESW · chest 1 · locker 1 · item 4 · patrol 3 · 79 draws/scene · 10.3k tris · 1 lights
┌──────────────────┬──────────────────┬──────────────────┐
│ from the north   │ from the east    │ from the south   │
├──────────────────┼──────────────────┼──────────────────┤
│ from the west    │ overview NW      │ overview SE      │
└──────────────────┴──────────────────┴──────────────────┘
```

- **One view per doorway**, standing a step inside it at the player's eye height and
  the player's FOV. This is how a player actually meets the room, and it is the view
  that matters: if you cannot read the room from its own doorway, it is broken.
- **Two raised corner views** for judging layout and clearance. Anchored on cells the
  room actually occupies, so an L-shaped footprint never puts a camera in the void.
- **A player-spawn view**, for a room that declares one — the first frame of a run,
  aimed exactly the way `Game` aims it. A spawn anchor facing a wall is invisible in
  every other view and is the first thing four players will see.
- Door views are capped at four; a `1x3` hall offering six doorways gets a spread of
  four of them.

**Counts in the header are scene totals** — the room *plus* the doors, containers and
items standing in it, and the triangle count includes the shadow pass. They run well
above the per-room numbers `npm run validate:art` prints, and they are the honest
"what a populated room costs" figure. Use `validate:art` for budget compliance and
this for a sanity check.

## 3. What it fakes, and what it does not

Nothing about the *look* is re-implemented. The tool calls `new Renderer(...)` and
`buildWorld(...)` — the same two calls a run makes — with `configForMap()` applied,
so tone mapping, exposure, fog, the ambient floor, the nearest-N light culling, the
material library and the placement of every shared-art piece are identical to the
game. If a room looks wrong in a sheet, it looks wrong in the game.

What is synthesised is the **layout**: a one-room `RunLayout` in which

- **every wall the blueprint offers is a door**, and one of them is locked (so the
  lock indicator is always under review). Windows are unaffected — the shell only
  puts a window on a side the blueprint never offers, so this cannot hide one;
- **every `chest` and `locker` anchor is filled**, not the generator's random
  subset. That is the worst case for clearance and the most useful case for review;
- **every `itemSpawn` anchor holds an item**.

Two consequences worth remembering:

- A room sees more doors and more furniture here than it usually will in a run.
- Only this room's own lights exist. In a run the nearest few lights may include a
  neighbour's, so a sheet is very slightly the darker case — which is the right way
  round for testing "every room must light itself" (`ROOM_FORMAT.md §6`).

---

## 4. The review loop

1. `npm run dev`, open `/tools/roomshot.html`, read the sheets.
2. Note what is wrong. Sort it: **bugs** (geometry in the wrong place, a prop reading
   as a black slab, a shadow artefact) come before **taste** (this wall is boring).
3. Fix it in `art/`. Re-render just that room: `?rooms=<name>`.
4. Compare against the previous sheet. Keep the old PNG open — a side-by-side is how
   you tell "better" from "different".
5. `npm run typecheck` and `npm run validate:art` before you call it done. The
   review tool checks how a room *looks*; the validator still owns whether it *works*.

### Things this pass actually caught

Worth knowing, because they are the failure classes to look for in the next pack:

- **A rail standing on end.** `poseMatrix()` only rotates about Y. A horizontal
  cylinder posed with it stays vertical — the kitchen's pot rack was a pole through
  the ceiling for three plan steps. Anything lying down needs `tiltMatrix`.
- **A light fixture shadowing its own room.** The chandelier is the only
  shadow-casting light in the rooms that have one, and its stem sat *below* that
  light, so it drew a hard black bar across the floor of every room it lit. Anything
  inside a light's own volume — a candle, a chandelier arm, a lustre — must pass
  `castShadow: false`.
- **A single-sided plane you can walk around.** The laundry's hanging sheets went
  black whenever the lamp was behind them. A sheet needs a double-sided, faintly
  self-lit material; real backlit linen glows rather than turning into a hole.
- **A curve sampled too coarsely.** The `ribs` ceiling was five unrotated boxes on an
  arc, which read as blocks floating under the ceiling rather than as vaulting.

### And the ones the viscera pass caught

Different pack, same lesson every time: **the thing you meant to show is behind
something else**. Worth reading before you author, because none of these is
visible in the code and all of them are obvious in a sheet.

- **A light inside its own mesh.** The heart had its lamp sunk in the muscle,
  where it lit the inside of a sphere and nothing else; the room was a black
  lump in a black chamber. Same bug in the ganglion. A point light belongs
  *outside* the thing it is lighting — beside it rims the silhouette, under it
  underlights, inside it does nothing at all.
- **A translucent film over a glow.** Every emissive pod had a `caul` shell
  wrapped round it "for wetness", and a semi-transparent grey layer in front of
  a light source turns it grey. Collars, rims and wraps go *behind* or *around*
  a glow, never in front of it.
- **An iris behind its own sclera.** Both the wall eyes and the four-metre one
  had the iris disc tucked inside the eyeball, which is where it anatomically
  belongs and renders as a black pit. The iris has to stand proud of the sphere.
- **A near-horizontal cylinder is a fan blade.** The lung's bronchi and the
  heart's great vessels both ran out sideways at a shallow angle, and both read
  as the blades of a ceiling fan from every doorway. Slope them steeply, or ring
  them with collars so the eye reads a pipe.
- **A glowing line beside a dark one is a string of party lights.** The nerve
  runs alternated bare emissive cord with pale sheath and came out as bunting.
  Glow has to be *points* on a dark line, not half of it.
- **A full-width sheet is a pane of fog.** A curtain of membrane hung right
  across a corridor blocked the one thing that corridor was for, and at any
  distance read as a flat grey rectangle floating in the room.
- **A wall texture at a tile size bigger than the wall.** A 2.6 m floor texture
  on an 8 m floor is three repeats, which from standing height is one flat
  smear. Floors want a tile you could take a step across.

### And the ones the Kerberos Deep pass caught

Third pack, and the failures were almost all about **light that is not a light**
and **geometry drawn in front of the thing it was decorating**. Every one of
these validated clean and every one of them was obvious in a sheet.

- **A decal that carries its own darkness.** Caustics were painted as an
  emissive patch, so the dark half of the texture was drawn over the deck as
  well as the bright half, and every floor came out as black-and-white cow
  print. Light landing on a surface is **additive**: a `MeshBasicMaterial` with
  `blending: THREE.AdditiveBlending` drops the dark half entirely and only the
  net lands. Anything that represents light *on* something wants this; anything
  that represents a *surface* does not.
- **An emissive tuned by eye in isolation.** The same caustics ran at
  `emissiveIntensity: 1.5` and blew straight through ACES into flat white.
  Judge an emissive against the room's actual lamps, not on its own - the moment
  a decoration reads brighter than the practicals, the room stops making sense.
- **A tank is a cylinder, and a cylinder has a near wall.** Every aquarium in
  the pack was a flat opaque drum with an invisible shoal inside it, because the
  water was front-faced. Water in a container has to be **`side: BackSide`** so
  it draws the far wall only and the contents sit in front of it. Same fix for
  jars, incubators and pods.
- **A translucent sphere is a grey blob.** Smoke over the hydrothermal vents was
  five 1.3 m spheres at 0.32 opacity, which greyed out everything behind them
  including the thing they were meant to be rising off. Volume in this engine
  wants to be *thin* - 0.1 or less, and small.
- **You cannot recess anything.** The moon pool's water was set half a metre
  below the deck and vanished: the kit lays a solid floor slab per cell and
  there is no hole in it, so everything below `y = 0` is behind the floor. Water
  at deck level plus a coaming reads as a well; a hole does not exist.
- **A set piece outside the room it belongs to.** The angler's lure and half its
  teeth were built at the creature's own scale from a head position that put
  them 1.8 m inside the room, straight through the glass. When you build behind
  a pane, write down where the glass is and check every extremity against it.
- **A prop faces `-Z`; a plane faces `+Z`.** Props are authored facing `-Z` to
  match shared art, but a `PlaneGeometry`'s front face is `+Z`, so every flat
  thing hung on a wall-posed prop needs `rotationY + Math.PI` or it faces into
  the plaster. Single-sided materials go black; the pack lost a cryo-pod window,
  a gauge dial and four monitors to this before anyone looked.
- **A `TorusGeometry` stands on edge.** It lies in its own XY plane, so a ring
  meant to lie flat on the floor needs `tiltMatrix(..., [Math.PI/2, 0, 0])`. A
  bare `poseMatrix` leaves it standing up like a wheel.
- **A four-segment torus is a cross.** Same ring, used as a dark rim inside a
  square pool, read as an X painted on the water.
- **Thirty-two draw calls for one plant.** Anything animated has to stay out of
  the room's batch - but "out of the batch" does not mean "one mesh per leaf".
  Give it a `MeshBatcher` of its **own**, animate the group the batcher returns,
  and hand the result to the room's `dispose`. Two draws instead of thirty-two.
- **Ribs the thickness of wire.** The whale skeleton's ribs were 5 cm and read as
  a black scribble from every doorway. Backlighting a shape only works if the
  shape has enough width to survive being a silhouette.
- **A pale material multiplies.** Bacterial mat at near-white with a dozen
  patches buried the skeleton it was growing on; silt drifts at near-white
  turned a rock floor into spilt plaster. Pale surfaces are the loudest thing in
  a dark room - use two, not twelve.
- **Warp your stripes harder than their spacing.** Sand ripples warped by less
  than one period read as printed corduroy rather than as a seabed.

### And the ones the Sepulchre of the Nine pass caught

Fourth pack. Almost every failure this time was about **light** — either faking
it, or forgetting what it lands on — and two of them are repeats of lessons
already in this file, which is worth saying out loud: the ones that repeat are
the ones a new pack will hit too.

- **An additive wash is a seasoning, not a light source.** Painting the halo
  round a flame as an additive quad is right (see the abyss caustics, above), but
  the crypt's votive course throws one per station, three stations a wall, four
  walls — twelve overlapping quads at 0.5 opacity, plus two point lights, and
  every room in the pack came out the same shade of orange with no darkness left
  in it anywhere. They are at 0.18 now and only on the wall, not the floor.
- **A warm ambient under warm practicals leaves nothing for the warmth to be
  warm against.** The map shipped its first pass with `ambientColor: #2c2a33`,
  which is what a crypt "feels" like and is exactly wrong: the guide's "warm
  sources, cold ambient" is not a preference, it is the only thing that makes a
  candle read as a candle. Cold blue-grey fill, and the same rooms became stone.
- **Metal with no environment map has to take DIFFUSE light.** Every gold surface
  in the Necropolis was `metalness: 0.9`, which is physically right and rendered
  black: there is no env map in this renderer, so a full metal can only show what
  it reflects, and it has nothing to reflect. The gilded sarcophagus the whole map
  is built around was a dark slab under two lamps until every metal in the pack
  came down to about 0.45.
- **A tile size is a look, not a setting.** Three of these in one pack: painted
  registers at a 2.3 m tile made the figures 45 cm and a wall of them read as a
  bank of card-index drawers; brick at 1.5 m made the vault bricks 6 cm and the
  ceiling read as basketwork; gold stars at a 2.4 m tile came out 40 cm across
  and read as clover leaves. All three were fixed by changing one number.
- **A figure built from stacked rectangles is a drawer.** The frieze's people
  were a body box, a wig box and a kilt box, and no amount of colour fixed them.
  What makes a silhouette read as a person is that it is *not* a rectangle: two
  legs with daylight between them, a waist narrower than the shoulders, a round
  head. The same lesson as the ghost's empty sleeves, one dimension down.
- **A niche is a hole in the LOOK of a wall and must not be a hole in the wall.**
  The shell cuts the masonry either side of a recess and leaves a sill under it -
  but a recess that opens at floor level has no sill, so `validate:art` reported
  eight rooms where "the wall is closed this run but has no collider", and a
  player could have walked into a corpse shelf and out through the picture at the
  back of it. Any decorative opening needs one collider across the whole run.
- **Anything on a chain needs a batcher of its own** — a repeat of the abyss
  kelp, and it cost exactly as much: three swinging props built as one
  `THREE.Mesh` per chain link put the corridor at 66 draw calls, and the same
  props merged into one mesh each put it at 32.
- **Shadow casting is a decision a pack makes once.** `MeshBatcher` splits a
  material into two meshes when some of its geometry casts and some does not, so
  one material shared between a shadowed tomb chest and an unshadowed piece of
  trim costs two draws instead of one. With thirty materials in a room that is the
  difference between 54 draws and 34. Casting is now opt-in in this pack, and
  what opts in is a silhouette a player reads across a room.
- **A cylinder has a top cap, and a light above it will find it.** The brazier's
  coal bed was inside the bowl, so what a player saw was the bowl's lit top cap:
  a bowl of soup on a stool. The coals go ON the cap, dark, with the light well
  above the rim.
- **A near-black glossy disc on a floor is a hole in the floor**, and the pack
  made this mistake twice in one room - a "wet patch" and a sump - after it was
  already written down for the abyss's puddles. Water needs a colour you can see.
- **A black wedge across an overview is the vault, not a bug.** Two rooms were
  investigated for a shadow that turned out to be the groin vault's diagonal rib
  seen from a camera parked at the springing, which is where the review tool puts
  its raised corner views. Turning shadows off in `graphics.json` for one render
  is the cheapest way to tell a shadow from geometry.
- **`?props=1` will find the one detail that is 15 % of your map.** Here it was
  the votive lamp station - 80,000 triangles over 1,932 of them, three quarters
  of it in 7 x 6 spheres on flames two centimetres across. Five-segment flames
  cost the pack nothing anybody can see and gave back 50,000 triangles. This is
  the same finding as `tubeWorms`, in the same place in the process, for the same
  reason.

### And what the Sepulchre's second pass caught

The pack came back with three notes - too many rooms of one kind, some floating
props, and a frame-rate concern - and fixing those found four failure classes the
first pass had not:

- **A prop that places its own colliders at RANDOM positions must not go near an
  anchor.** `boulders()` and `stalagmite()` scatter their rocks from the seeded
  RNG, so a heap of them a metre from a chest anchor is fine on most seeds and a
  chest nobody can open on the rest. `npm run validate:art` builds several seeds
  per room and caught it; a single seed would have shipped it. Keep random
  colliders in the half of the room that has no anchors in it.
- **A container anchor is checked for what it opens ONTO, never for what it stands
  IN.** The validator walks a player across the clearance in front of a chest, and
  nothing looks at the ground under it - so a chest anchored in the middle of a
  mudbrick bay was placed standing inside a heap of natron, and validated clean.
  This is the class of bug the review tool exists for: every container anchor in
  the pack now gets looked at on a sheet with the chest actually standing in it.
- **An item anchor outlives the furniture it was resting on.** A tomb chest moved
  1.2 m when a row was thinned, and the item anchor on its lid stayed where it
  was - an item floating at chest height in the middle of a corridor. If a prop
  moves, grep the blueprint for anchors at that prop's height.
- **A cylinder's cap is a bright ring, and a stack of them is a wedding cake.**
  Dripstone built as a stack of short closed cylinders read as a pile of discs,
  because every cap is a horizontal face catching light the sides do not. Sections
  that overlap by half their height with `open: true` read as one continuous
  surface - and cost less, because they have no caps.
- **A round strake is a log.** The ship burial's clinker hull was built from
  cylinders and read as a stack of firewood; the same hull in flat 5 cm boxes
  leaning outboard reads as planking. A plank is flat, and a hull is the ONLY
  place in the pack where that difference is the whole object.
- **A pale light at high intensity beats a saturated light at low intensity.**
  Two cave lamps at `0x64e0d8` and intensity 5 turned an entire limestone chamber
  into one flat teal wash with no rock colour left in it. The same lamps at
  `0x9ce0d4` and intensity 7 are brighter *and* the rock is grey again: what
  floods a room is the saturation, not the brightness.

### And the ones the Vulcan's Anvil pass caught

Fifth pack, and the first one built with every lesson above already written
down — which is exactly why the failures it did hit are worth having. Two of
them are **new classes**, three are old lessons arriving through a door nobody
had watched, and one turned out not to be a bug at all.

- **An additive wash still needs a MASK.** "Light on a surface is additive" is
  already in this file twice, and the first sheet of this pack still came back
  with beige pancakes on every floor: additive fixes the *dark background*, it
  does nothing about the *hard edge*. A `disc()` of flat colour ends on a circle
  wherever you stop it, and a quad of haze has four corners. Every wash and every
  plume in the pack now carries a radial or a plume-shaped falloff as its `map`,
  which costs one 128px texture for the whole pack and is the difference between
  a pool of light and a disc of paint.
- **Vapour should be additive too.** Steam, gas and heat shimmer began as
  alpha-blended grey at 0.055 — already following the "translucent volume wants
  to be thin" rule — and still read as a pane of fog standing in front of the
  lavafall, because *any* alpha grey lays a film over what is behind it. Vapour
  in a dark room is light scattering, not a surface: switched to additive with
  the same mask it can be four times as strong and never greys anything out.
- **A shadow-casting lamp near a big caster paints the room black.** The drill
  chamber has a four-metre cutter head against one wall, and its warm practical
  stood two metres in front of it: three of five views were solid black with a
  rim of orange. The fix is not smaller geometry, it is that the room's ONE baked
  lamp has to be the one with nothing enormous between it and the room — here the
  cold work lamp in the far corner — and that a set piece that size never casts.
- **A black wedge across a raised view is the ceiling, not a bug**, and this pack
  spent an hour re-learning it. The corner cameras on a contact sheet sit at
  roughly beam height, so an eight-metre I-beam a hand's breadth from the lens
  blacks out most of the frame. It is the same finding as the crypt's groin
  vaults. **The cheapest way to settle it is to render the room once with the
  ceiling style swapped**, which is one reload and answers the question outright.
- **Concentric anything on a floor is a bullseye.** Flow banding in the obsidian
  field was drawn as arcs about a point, which is geologically right and reads as
  a target painted on the deck — the same failure one dimension up from the
  four-segment torus that read as a cross. Banding runs in ONE direction.
- **A second lamp of the same colour is not a second lamp.** Three Mountain rooms
  had two warm practicals each and came out as three versions of the same orange
  cave. Giving the glass field a pale violet as its second light — the only cold
  lamp on that side of the map — separated it from the other two at a glance
  without changing a single prop.

And two that are about the *shape of the work* rather than about what a sheet
shows, both of which cost more time than any of the above:

- **Put every collider-bearing prop 1.5 m clear of a door lane, and prefer props
  that carry no collider at all.** `boulders()` scatters its rocks from the
  seeded RNG, so a heap of them near a doorway seals it on some seeds and not
  others — `npm run validate:art` caught eleven separate instances of this across
  the Mountain half, each one a different room. The pack now has a `rubble()` that
  is visually identical and places nothing, and `boulders()` is reserved for
  corners with a metre and a half of margin. This is the crypt's finding again,
  and the general form of it is: **a prop that places random colliders is a prop
  you have to think about, so most props should not.**
- **A helper whose third argument is a yaw will be passed a coordinate.**
  `workLamp(room, x, z, rotationY)` got `(room, 2.4, 2.9, -2.4)` and parked a
  tripod, with its collider, precisely where a locker had to open. It validated
  as "the approach is unreachable", which is the correct message and the least
  helpful possible place to start looking. Neither the compiler nor the validator
  can see it; what catches it is reading the failure as *geometry in the wrong
  place* rather than as *anchor in the wrong place*.

### And the ones the shared-art pass caught

Characters and props are not rooms, but they get reviewed the same way — a
contact sheet, several angles, one close-up of whatever has to read. All five of
these looked fine in code:

- **A tiling pattern on 0..1 UVs is bobbles.** The suit's first normal map wove
  thirty-two threads and quilted four panels across the tile. A body's UVs run
  0..1 over the *whole torso*, so every one of those came out centimetres deep
  and the player was a knitted golf ball. On a character, a surface map should be
  noise you can feel and not read. Save patterns for things with world-unit UVs.
- **An emissive faceplate is not glass, it is a lamp.** The visor was lit at
  `emissiveIntensity` 0.55 and came out brighter than the suit around it — a pale
  slab where a dark window should be. Glass reads by its **highlight**: low
  roughness, some metalness, and almost no glow.
- **A bezel wider than a hand's breadth eats the thing it frames.** The pale rim
  round the visor started five degrees wider than the glass and won the face
  outright. It is now three, and reads as a bezel.
- **A monotonic profile spun around an axis is a bottle.** The ghost's robe only
  ever narrowed from hem to hood, and no amount of shroud on top of that reads as
  a figure. It needed a waist, a collar and — the single biggest fix — **empty
  sleeves**: arms that end in nothing are what separate a robed figure from an
  object.
- **A wobbly edge is not a torn one.** The hem was a band of quads whose bottom
  edge moved up and down, and it read as a hoop of cloth. What makes cloth look
  torn is the **gaps**, so the tatters have to come to points.
- **Frame for the tallest thing, not the average one.** The scoreboard portrait
  camera was framed on a 1.8 m body. A player in a candelabra is 2.4 m, and a
  crown with its points cut off is exactly what makes a card look broken.

---

## 5. Using it on a new pack

Nothing in the tool is mansion-specific. Add the pack to `art/packs/index.ts` and a
map entry to `config/maps.json` (which you have to do anyway —
[`ART_PACK_CHECKLIST.md`](ART_PACK_CHECKLIST.md)), then:

```
/tools/roomshot.html?map=<yourMapId>
```

The tool asks the pack for nothing beyond the `ArtPack` contract, so a pack that
builds at all can be reviewed.

### 5.1 The lobby cabin

```
/tools/roomshot.html?map=lobby
```

The lobby is not a room blueprint, so it gets its own pass — but through the same
`Renderer`, the same `buildLobbyScene()` the game calls, and `graphics.json → lobby`,
so the sheet is what a player sees. It writes `shots/lobby/cabin.png`.

Nine views: the arrival spot, the window, the fire, the poster wall (wide and close),
the wardrobe, the difficulty lever, the minigame wall and an overview. The wardrobe
view is built from the **pose the game uses**, not from a `lookAt`, and stands a
`player.masked` at the mannequin anchor — the whole question that view answers is
whether the model lands on the right of the screen with the panel's half clear.

`npm run validate:art` covers the cabin too: that it builds, builds deterministically,
that every poster / wardrobe / lever exposes the parts logic drives it by, and that
all of them are **reachable on foot** from the four arrival spots.

---

## 6. Related docs

- [`ROOM_FORMAT.md`](ROOM_FORMAT.md) — the blueprint contract and the budgets
- [`ART_GUIDE.md`](ART_GUIDE.md) — the visual direction you are reviewing against
- [`ART_PACK_CHECKLIST.md`](ART_PACK_CHECKLIST.md) — shipping a whole pack
