// sprites.js: optional image art, laid over the art this game draws in code.
//
// Every other file still draws its own pixels, and the game runs with this
// file doing nothing at all. That is the point. Drop a PNG into game/assets/
// under one of the names below and it appears; delete it and the drawn version
// comes back. Nothing here throws, and a missing file is not an error — the
// asset folder is empty in the repository on purpose, because the sheets most
// people reach for are ripped from a shipped game and are not ours to commit.
//
// How a call site uses it:
//
//   if (!drawSprite(ctx, 'court/tennis', 0, 0, w, h)) {
//     ...the drawn court, exactly as before...
//   }
//
// Read that as "the picture, or failing that the shapes". Never put game logic
// behind it: a sport must play the same whether the folder is full or empty.

// The names the game asks for, mapped to files under game/assets/.
//
// `icon/<sport id>` replaces the menu tile icon that each sport draws in its
// own `icon()` function. `court/<sport id>` replaces that sport's whole
// backdrop. Those are the two swap points the game has today; add a name here
// and a matching `drawSprite` call where you want it.
export const MANIFEST = {
  'icon/tennis': 'assets/icon-tennis.png',
  'icon/boxing': 'assets/icon-boxing.png',
  'icon/golf': 'assets/icon-golf.png',
  'icon/baseball': 'assets/icon-baseball.png',
  'icon/basketball': 'assets/icon-basketball.png',
  'icon/bowling': 'assets/icon-bowling.png',

  'court/tennis': 'assets/court-tennis.png',
};

const images = new Map();   // name -> HTMLImageElement, only once it has decoded
let revision = 0;           // bumped per image that lands, for cache keys
let started = false;

// Cached backdrops are drawn once and blitted after that (see scenery.js), so
// a cache key has to change when a sprite arrives late. Put this in the key
// and the picture rebuilds itself the frame after the file decodes.
export function spriteRevision() {
  return revision;
}

export function sprite(name) {
  return images.get(name) || null;
}

export function hasSprite(name) {
  return images.has(name);
}

// Starts every load and resolves when they have all either decoded or failed.
// Safe to await on boot and safe to ignore: the game draws fine mid-load,
// because each sprite only starts being used once it is in the map.
//
// Outside a browser — the node tests — there is no Image, so this resolves
// immediately with nothing loaded, which is a perfectly good state.
export function loadSprites(manifest = MANIFEST) {
  if (started) return Promise.resolve(images);
  started = true;
  if (typeof Image === 'undefined') return Promise.resolve(images);

  const base = new URL('.', import.meta.url);
  const one = (name, path) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      // A decoded-but-empty image would blit as nothing and hide the drawn
      // art behind it, which looks like a bug rather than a missing file.
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        images.set(name, img);
        revision++;
      }
      resolve();
    };
    img.onerror = () => resolve();   // no file, no sprite, no complaint
    img.src = new URL(path, base).href;
  });

  return Promise.all(Object.entries(manifest).map(([n, p]) => one(n, p)))
    .then(() => images);
}

// Draws the sprite into the box and returns true. Returns false, having drawn
// nothing, when there is no such sprite — so `if (!drawSprite(...))` falls
// through to the drawn version.
//
// `fit` decides what happens when the image and the box disagree in shape:
//
//   'contain' (default) fits the whole image inside the box, which is what an
//              icon wants — a cropped icon reads as the wrong icon.
//   'cover'    fills the box and lets the overflow crop, which is what a
//              backdrop wants — a letterboxed court shows bars at the edges.
//   'stretch'  ignores the aspect ratio entirely.
export function drawSprite(ctx, name, x, y, w, h, { fit = 'contain', alpha = 1 } = {}) {
  const img = images.get(name);
  if (!img || w <= 0 || h <= 0) return false;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (fit === 'stretch') {
    ctx.drawImage(img, x, y, w, h);
  } else {
    const scale = fit === 'cover'
      ? Math.max(w / img.naturalWidth, h / img.naturalHeight)
      : Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    if (fit === 'cover') {
      // Crop to the box so the overflow cannot paint over the scorebar.
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
    }
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  ctx.restore();
  return true;
}

// Centred on a point, for the places that think in a radius rather than a box:
// a menu tile icon gets a centre and a size, not a rectangle.
export function drawSpriteAt(ctx, name, cx, cy, size, options) {
  return drawSprite(ctx, name, cx - size, cy - size, size * 2, size * 2, options);
}

// What actually loaded. The debug overlay prints this, so an asset folder that
// is not being picked up says so on screen instead of leaving you guessing.
export function spriteReport() {
  const names = Object.keys(MANIFEST);
  return { loaded: images.size, total: names.length, missing: names.filter(n => !images.has(n)) };
}
