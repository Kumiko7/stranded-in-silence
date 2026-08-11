# Building a New Map Pack

A "map" is an **art pack** plus **one entry in `config/maps.json`**. Nothing in
`src/` changes. This document is the complete procedure.

> Example brief: *"make a prison-themed map"* → you should be able to finish it from
> this file plus [`ROOM_FORMAT.md`](ROOM_FORMAT.md) and [`ART_GUIDE.md`](ART_GUIDE.md).

---

## 1. Scaffold

```
art/packs/<packId>/
├─ pack.ts          manifest
├─ materials.ts     material library for the theme
├─ kit/
│  ├─ shell.ts      floor / ceiling / walls with door openings
│  └─ props.ts      recurring themed furniture used by several rooms
└─ rooms/
   ├─ index.ts      re-exports every room
   └─ <room>.ts     one blueprint per file
```

`<packId>` is lowercase, no spaces: `mansion`, `prison`, `asylum`.

## 2. `pack.ts`

```ts
import type { ArtPack } from '@art/lib/contract';
import { rooms } from './rooms';
import { createMaterials } from './materials';
import { createKit } from './kit/shell';

export const pack: ArtPack = {
  id: 'prison',
  nameKey: 'map.prison.name',
  rooms,
  createMaterials,
  createKit,
  overrides: {
    // optional themed replacements for shared art, same contract as the defaults
    'door.standard': buildCellDoor,
  },
};
```

That is the whole of `ArtPack`; there is no palette field. **Ambient colour, fog
and exposure belong to the map, not the pack**, and live in the `graphics` block of
its `config/maps.json` entry (§5). Register the pack in `art/packs/index.ts`.

A pack must also supply every material name shared art asks for
([`SHARED_ART.md`](SHARED_ART.md) §3.1) — `door`, `chest`, `locker`, `itemMetal`,
`playerBody`, `ghostShroud` and the rest. Miss one and the first door in the map
throws.

## 3. The kit

`kit/shell.ts` is the single most reused piece of the pack. It must:

- Build floor, ceiling and four walls for **each cell of a footprint**.
- Cut a `1.2 m × 2.2 m` opening wherever `ctx.doors[cellSide] !== 'none'`, and leave
  the wall solid where it is `'none'`.
- Return colliders for every wall segment it builds.
- Carry the theme: wall material, skirting/trim, floor pattern, ceiling treatment.

Every room calls `ctx.kit.shell(ctx)` first, then decorates. This guarantees door
openings always line up between adjacent rooms regardless of who authored them.

## 4. Rooms — at least 15

Write each one to [`ROOM_FORMAT.md`](ROOM_FORMAT.md). Before you start, list 15+
one-line room identities so the set has spread. For a prison, e.g.:

| # | Room | Notes |
| --- | --- | --- |
| 1 | Cell block corridor | long sightlines, 4 doors |
| 2 | Single cell | tiny, 1 door, claustrophobic |
| 3 | Shower block | tile, drains, steam |
| 4 | Laundry | machines, hanging sheets to break sightlines |
| 5 | Kitchen | steel counters, big knives, chest anchors |
| 6 | Mess hall | 2×2 footprint, long tables |
| 7 | Guard station | monitors, keys on hooks — key-flavoured chest spot |
| 8 | Solitary | pitch dark except a slot of light |
| 9 | Infirmary | beds, curtains, medicine flavour |
| 10 | Chapel | pews, one stained window as the light source |
| 11 | Yard entrance | boarded, exterior light |
| 12 | Boiler room | pipes, one glowing furnace |
| 13 | Records office | filing cabinets, paper everywhere |
| 14 | Workshop | benches, tools, item spawn heaven |
| 15 | Visitation | booths, glass partitions |
| 16 | Stairwell (dressed flat) | vertical interest without vertical movement |

Aim for a mix of open (good sightlines, safer) and cluttered (blind corners, scary)
rooms — that variance is where the tension lives.

**Split the set into two zones and alternate them.** `viscera` is wet viscera
against calcified skeleton, half the rooms each, so walking the maze is a
rhythm of temperature changes rather than twenty variations on one idea;
`abyss` is a steel research station against the trench that is getting into it,
amber against cyan, straight lines against none; `crypt` is a consecrated
medieval crypt against the dynastic tomb it was built on top of, grey limestone
against ochre sandstone, tallow against oil, pointed arches against post and
lintel; the manor does the same thing more quietly with its grand rooms and its
service rooms. Give the two halves different palettes, different light colours
and different floor materials, and put one hinge room in the set that is honestly
both — it is the one that makes the transition read as deliberate. (`crypt` has a
third, smaller family for the thing eating both halves: two rooms of fungus and
root, violet where everything else is flame. A third strand works as long as it
is *small* and it is the one that crosses the boundary.)

**Find the pack's one repeatable trick and put it in the shell.** Every pack has
a single detail that does most of the work of making twenty rooms feel like one
place, and it belongs in `kit/shell.ts` rather than in each room: `viscera`
rings every opening with a sphincter or a bone arch, `abyss` runs an emissive
strip along the base of every wall and hangs a viewing pane in any wall the
generator cannot open, `crypt` sets a course of burning votive niches round every
wall and cuts a recess with something in it — a corpse shelf, a stack of skulls, a
hooded figure — into any wall the generator cannot open. All of them cost nothing
per room and all of them are the reason their set holds together.

Two things the crypt pass learned about that trick, both worth knowing before you
write one:

- **A wall course of lights is the whole lighting design, so cost it early.**
  Three stations a wall, four walls, twenty-two rooms is nineteen hundred of them,
  and at forty triangles each that was 15 % of the entire map (see
  [`../systems/RENDERING.md`](../systems/RENDERING.md)). Build it out of the
  cheapest geometry that reads and check it with `tools/leakcheck.html?props=1`
  before you build twenty rooms on top of it.
- **A decorative opening still has to stop a player.** The shell cuts real
  masonry for its recesses, and a recess that starts at floor level leaves the
  wall with no collider across the middle - `npm run validate:art` caught it in
  eight rooms at once. One collider across the whole wall run fixes every kind.

Two practical rules that decide half the layout before you start decorating:

- **The door lanes are sacred.** A doorway is 1.2 m wide and centred on its
  wall, so the strip `|x| < 1.1` (or `|z| < 1.1`) running from each offered wall
  into the room has to stay walkable — the generator may open *any* wall you
  listed. Everything solid belongs in the corners or against a wall you never
  offered. It is far cheaper to lay out on that grid from the start than to
  chase `the north doorway is blocked by geometry` around a finished room.
- **Containers need their approach.** A chest wants 1.6 m clear in front of it
  and a locker 1.2 m, measured along its own facing, which in a four-door 1x1
  leaves exactly four places a container can go. Place those four first.

Rooms are rotated in 90° steps to fit their slot, so count shapes, not
orientations: one `2x1` corridor, not a `2x1` and a `1x2`; one one-door dead end,
not one per compass point. A multi-cell room is placed **at most once per map**,
so treat each as a set piece rather than filler, and give it a generous set of
`doorWalls` — a big room that offers only two edges is a big room the generator
usually cannot place.

## 5. Register the map

`config/maps.json`:

```json
"prison": {
  "nameKey": "map.prison.name",
  "descKey": "map.prison.desc",
  "artPack": "prison",
  "posterArtId": "poster.prison",
  "enabled": true,
  "enemies": ["ghost"],
  "overrides": {
    "world": { "grid": { "width": 6, "height": 6 } },
    "graphics": { "fog": { "color": "#080a0e" }, "ambientIntensity": 0.1 }
  },
  "ambienceTrack": "ambience/prison_loop",
  "musicTrack": "music/prison_tension"
}
```

## 6. Strings

Add to `config/locales/en.json`:

```json
"map.prison.name": "Blackgate",
"map.prison.desc": "Nobody was released. The paperwork just stopped.",
```

Room `nameKey`s too, if you set any — and then to **every other locale in
`config/locales/`**, because `npm run validate:locales` requires the same key set
in all of them and a `complete: true` locale missing a key is an error, not a
warning. **No user-visible text goes in art or logic.**

## 7. Lobby poster

Three edits, all in `art/shared/lobby/`: a `poster<Pack>` recipe in `textures.ts`,
a `poster.<packId>` entry in `materials.ts`, and one line of
`posterBuilder('poster.<packId>')` in `poster.ts` exported and registered in
`art/shared/index.ts`. Name it from `maps.json → posterArtId`; an id that is not
registered falls back to `poster.blank` and `validate:art` warns.

The lobby wall renders one poster per enabled map; players hold `E` on a poster to
vote. The poster should read as a movie poster for the map's theme, and it is
authored in **0..1 UV space** rather than as a tiling texture — it is a picture,
not a surface.

## 8. Acceptance checklist

- [ ] ≥ 15 room blueprints, ≥ 80 % of them `1x1`
- [ ] One 1x1 offering all four walls, and one one-door dead end
- [ ] `npm run validate:locales` passes — every new key in all six locales
- [ ] Every room passes the [`ROOM_FORMAT.md §8`](ROOM_FORMAT.md#8-authoring-checklist) checklist
- [ ] Kit cuts door openings correctly for all four sides
- [ ] At least 4 rooms declare `playerSpawn` (tag them `entrance`)
- [ ] At least 6 rooms declare a `chest` anchor
- [ ] Every room declares ≥ 2 `patrolPoint`s
- [ ] Pack entry added to `config/maps.json`, strings added to `en.json`
- [ ] A lobby poster exists *(only once the lobby scene lands — plan step 29)*
- [ ] `npm run validate:art` passes
- [ ] Every room reviewed on a contact sheet — [`ROOM_REVIEW.md`](ROOM_REVIEW.md)
- [ ] Played a full run start to exit without getting stuck

`validate:art` enforces most of this list for you, including the parts that are
easy to lie to yourself about: the 1x1 share, the playerSpawn and chest counts, and
whether the pack has a room that fits a slot needing all four walls. Per room it
also proves that no combination of doors can strand a player — see
[`ROOM_FORMAT.md`](ROOM_FORMAT.md) §8.
