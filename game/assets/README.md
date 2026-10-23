# game/assets/

Optional image art. **This folder is empty on purpose and the game is complete
without it.** Everything you see on screen is drawn in code; a file dropped in
here replaces one piece of that drawing, and deleting it brings the drawn
version straight back.

Nothing is committed here because the sprite sheets most people reach for are
ripped from a shipped game and are not ours to put in a public repository.
Download them yourself, keep them local, and the live site keeps working for
anyone who clones without them.

## The names the game looks for

Exact filenames, from `MANIFEST` in `../sprites.js`:

| File | Replaces |
|---|---|
| `icon-tennis.png` | the Tennis menu tile icon |
| `icon-boxing.png` | the Boxing menu tile icon |
| `icon-golf.png` | the Golf menu tile icon |
| `icon-baseball.png` | the Baseball menu tile icon |
| `icon-basketball.png` | the Basketball menu tile icon |
| `icon-bowling.png` | the Bowling menu tile icon |
| `court-tennis.png` | the entire Tennis backdrop |

Any other filename is ignored. To add a swap point of your own, put the name in
`MANIFEST` and call `drawSprite` where you want it — the pattern is in
`sprites.js`.

## What makes a good file here

- **Icons**: square, transparent background, around 128×128 up to 512×512. They
  are drawn `contain`, so the whole image fits inside the tile and nothing is
  cropped. A sheet with several icons on it will not work; cut out one icon per
  file.
- **Backdrops**: landscape, roughly 16:9, around 1600×900. They are drawn
  `cover`, so the picture fills the screen and the overflow is cropped — put
  nothing important in the last few percent at the edges.
- PNG. The manifest names `.png` and nothing strips the extension.

## Checking that a file was picked up

Open the game with `?debug` in the URL. The overlay in the corner prints a
`sprites` line, like `sprites    2/7 loaded`. If a file you just added does not
move that number, the name does not match the table above.

A sprite that arrives after the first frame still appears: the cached backdrops
include a load counter in their cache key, so they rebuild themselves once the
file decodes.
