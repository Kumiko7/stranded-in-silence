# Main-menu stills

**Drop images in here, list them in `config/ui.json`, and the menu shows them.**

The main menu cross-fades a slideshow of the game behind its lockup. The set is
config, not code:

```json
"menus": {
  "mainMenuBackground": "screenshots",
  "background": {
    "folder": "/ui/menu/",
    "images": ["mansion-foyer.jpg", "crypt-sepulchre.jpg", "..."],
    "holdSeconds": 9,
    "fadeSeconds": 2.4,
    "drift": 0.09,
    "dim": 0.4,
    "grain": 0.05
  }
}
```

`assets/` is served as `/`, so `folder: "/ui/menu/"` is this directory. Add a file,
add its name to `images`, done. Set `mainMenuBackground` to anything else and the
menu falls back to its flat gradient.

The order is shuffled at boot, so nobody opens the game on the same frame every
launch.

## What makes a good one

- **16:9, 1600×900 or larger.** Anything is cover-cropped to the window, so a
  different aspect loses its edges rather than letterboxing.
- **Interest on the right.** The lockup and the nav sit in the left third under a
  wash — a subject there is a subject nobody sees.
- **Do not grade them.** The menu lays its own dim, vignette and grain over the
  top (`dim` / `grain` above). A still that is already crushed comes out black,
  and the set has to look like one set.
- **Keep the file small.** They are all fetched at boot so a cross-fade never
  waits on the network. Six at ~200 kB is the budget that assumption is worth.

## Where the ones in here came from

They are single views cropped out of the room-review contact sheets that
`tools/roomshot` writes to `shots/` — see
[`docs/art/ROOM_REVIEW.md`](../../../docs/art/ROOM_REVIEW.md). One per map, plus a
second mansion room:

| File | Room |
| --- | --- |
| `mansion-foyer.jpg` | `mansion/foyer` |
| `mansion-ballroom.jpg` | `mansion/ballroom` |
| `crypt-sepulchre.jpg` | `crypt/sepulchre` |
| `abyss-whalefall.jpg` | `abyss/whalefall` |
| `forge-lavafall.jpg` | `forge/lavafall` |
| `viscera-eye.jpg` | `viscera/eye` |

They are placeholders in the sense that any of them can be swapped for a better
shot — of a real run, with players in it — without touching a line of code.
