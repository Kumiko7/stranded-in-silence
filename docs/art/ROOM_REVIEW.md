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
| `map` | `mansion` | Map id from `config/maps.json`. Its art pack **and its graphics overrides** are used, so a shot matches what that map looks like in a run. |
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

---

## 6. Related docs

- [`ROOM_FORMAT.md`](ROOM_FORMAT.md) — the blueprint contract and the budgets
- [`ART_GUIDE.md`](ART_GUIDE.md) — the visual direction you are reviewing against
- [`ART_PACK_CHECKLIST.md`](ART_PACK_CHECKLIST.md) — shipping a whole pack
