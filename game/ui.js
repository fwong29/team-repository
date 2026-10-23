// ui.js: everything drawn that is not a sport — the hand cursor, the menus,
// the heads-up display, the tutorial cards and the debug overlay. Plus the
// cartoon figure the player drives, drawn from the pose landmarks with nothing
// but arcs and rounded rectangles.
//
// All art here is drawn in code. Image files are optional and live in
// game/assets/; see sprites.js. When one is absent, which is the state of a
// fresh clone, the drawn version below is what you see.

import { CONFIG } from './config.js';
import { clamp, lerp } from './filters.js';
import { L, BONES } from './tracker.js';
import { Sound } from './audio.js';
import { drawSpriteAt, spriteReport } from './sprites.js';

export const PALETTE = {
  // Bright, flat and high-key. Everything is a solid fill; there is no grain,
  // no vignette and almost no gradient anywhere in this game. Surfaces are
  // light, text is dark, and saturation stays low enough that the player's
  // figure is the most colourful thing on screen.
  ink: '#2d3b45',
  inkSoft: '#6d8291',
  paper: '#f7fbfd',
  paperEdge: '#dfeaf1',
  night: '#eaf4fa',

  sky: '#9fd8f2',
  skyPale: '#dcf1fb',
  grass: '#8ccc5c',
  grassDark: '#74b84b',
  grassPale: '#a3d874',
  court: '#5aa0dd',
  courtDark: '#4a8ac4',
  clay: '#e49c66',
  sand: '#f4e1a8',
  wood: '#e8c084',
  gold: '#f7c744',
  red: '#f0705f',
  blue: '#5aa8ea',
  purple: '#9f92e0',

  dim: '#8ea4b2',
  panel: 'rgba(45,59,69,0.05)',
  line: 'rgba(45,59,69,0.13)',
  skyWarm: '#ffdcb5',
};

export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function text(ctx, str, x, y, { size = 20, align = 'center', color = PALETTE.ink,
  weight = 500, baseline = 'middle', alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(str, x, y);
  ctx.restore();
}

// ---- The hand cursor --------------------------------------------------------
// No mouse anywhere in this game. A raised hand is the pointer; holding it over
// a tile fills a ring, and pushing the hand toward the screen picks instantly.

export class Cursor {
  constructor() {
    this.x = 0.5;
    this.y = 0.5;
    this.visible = false;
    this.hovering = null;
    this.dwell = 0;
    this.pushed = false;
    this._depth = [];
  }

  update(body, input, now, dt) {
    if (!body || !body.ok) { this.visible = false; this.hovering = null; this.dwell = 0; return; }
    // Whichever hand is higher drives the cursor, so either hand works and
    // swapping mid-menu is not a mode change.
    const hand = body.hands.left.y < body.hands.right.y ? body.hands.left : body.hands.right;
    if (!hand.visible) { this.visible = false; return; }
    this.visible = true;

    // The hand's travel is smaller than the screen, so map a comfortable box
    // around the shoulders onto the whole canvas.
    const reach = body.calib.armLength * 1.5;
    const nx = clamp((hand.x - body.centre.x) / reach * 0.5 + 0.5);
    const ny = clamp((hand.y - body.centre.y) / reach * 0.5 + 0.42);
    this.x = lerp(this.x, nx, CONFIG.cursor.smoothing);
    this.y = lerp(this.y, ny, CONFIG.cursor.smoothing);

    // Push to select: the distance reading dropping sharply over a short window.
    this._depth.push({ cm: input.distanceCm, at: now });
    while (this._depth.length && now - this._depth[0].at > CONFIG.cursor.pushWindowMs) this._depth.shift();
    const first = this._depth[0];
    this.pushed = !!first && first.cm - input.distanceCm > CONFIG.cursor.pushCm;

    if (this.hovering) this.dwell = clamp(this.dwell + dt * 1000 / CONFIG.cursor.dwellMs);
    else this.dwell = 0;
  }

  // Tiles: [{ id, x, y, w, h }] in canvas pixels. Returns an id when picked.
  pick(tiles, w, h) {
    if (!this.visible) { this.hovering = null; return null; }
    const px = this.x * w, py = this.y * h;
    const over = tiles.find(t => px >= t.x && px <= t.x + t.w && py >= t.y && py <= t.y + t.h);
    const id = over ? over.id : null;
    if (id !== this.hovering) {
      this.hovering = id;
      this.dwell = 0;
      if (id) Sound.hover();
    }
    if (!id) return null;
    if (this.dwell >= 1 || this.pushed) {
      this.dwell = 0;
      this._depth.length = 0;
      this.pushed = false;
      Sound.select();
      return id;
    }
    return null;
  }

  draw(ctx, w, h) {
    if (!this.visible) return;
    const x = this.x * w, y = this.y * h;
    ctx.save();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.ink;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    if (this.dwell > 0) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + this.dwell * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ---- Menus ------------------------------------------------------------------

export function menuTiles(items, w, h, { columns = 3, top = 0.34, maxWidth = 240 } = {}) {
  const rowsNeeded = Math.ceil(items.length / columns);
  // Also capped by the height left below `top`, so a short window shrinks the
  // tiles instead of pushing the last row off the screen.
  const byHeight = ((h * (0.96 - top)) / rowsNeeded - 18) / 0.72;
  const tileW = Math.min(maxWidth, (w * 0.82) / columns - 18, byHeight);
  const tileH = tileW * 0.72;
  const rows = Math.ceil(items.length / columns);
  const totalW = columns * tileW + (columns - 1) * 18;
  const startX = (w - totalW) / 2;
  const startY = h * top;
  return items.map((item, i) => ({
    ...item,
    x: startX + (i % columns) * (tileW + 18),
    y: startY + Math.floor(i / columns) * (tileH + 18),
    w: tileW,
    h: tileH,
    rows,
  }));
}

export function drawTile(ctx, tile, { hovered = false, dwell = 0 } = {}) {
  ctx.save();
  ctx.fillStyle = hovered ? '#ffffff' : PALETTE.paper;
  roundRect(ctx, tile.x, tile.y, tile.w, tile.h, 14);
  ctx.fill();
  ctx.strokeStyle = hovered ? PALETTE.gold : PALETTE.paperEdge;
  ctx.lineWidth = hovered ? 3 : 2;
  ctx.stroke();

  // A sprite named for this tile wins; otherwise the sport draws its own icon.
  const iconX = tile.x + tile.w / 2, iconY = tile.y + tile.h * 0.37, iconR = tile.w * 0.26;
  const drew = drawSpriteAt(ctx, tile.sprite || `icon/${tile.id}`, iconX, iconY, iconR);
  if (!drew && tile.icon) tile.icon(ctx, iconX, iconY, iconR);
  text(ctx, tile.label, tile.x + tile.w / 2, tile.y + tile.h * 0.74, { size: Math.max(15, tile.w * 0.1), weight: 600 });
  if (tile.note) {
    text(ctx, tile.note, tile.x + tile.w / 2, tile.y + tile.h * 0.88,
      { size: Math.max(11, tile.w * 0.068), color: PALETTE.dim });
  }
  if (hovered && dwell > 0) {
    ctx.fillStyle = PALETTE.gold;
    roundRect(ctx, tile.x, tile.y + tile.h - 4, tile.w * dwell, 4, 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---- Heads-up display -------------------------------------------------------

export function drawBanner(ctx, w, h, title, sub, { alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  text(ctx, title, w / 2, h * 0.42, { size: Math.min(68, w * 0.08), weight: 700 });
  if (sub) text(ctx, sub, w / 2, h * 0.52, { size: Math.min(24, w * 0.028), color: PALETTE.dim });
  ctx.restore();
}

export function drawScorebar(ctx, w, left, right) {
  ctx.save();
  ctx.fillStyle = PALETTE.paper;
  roundRect(ctx, w / 2 - 190, 18, 380, 54, 14);
  ctx.fill();
  text(ctx, left.name, w / 2 - 110, 36, { size: 13, color: PALETTE.dim });
  text(ctx, String(left.score), w / 2 - 110, 58, { size: 26, weight: 700 });
  text(ctx, right.name, w / 2 + 110, 36, { size: 13, color: PALETTE.dim });
  text(ctx, String(right.score), w / 2 + 110, 58, { size: 26, weight: 700 });
  text(ctx, '—', w / 2, 52, { size: 18, color: PALETTE.dim });
  ctx.restore();
}

export function drawMeter(ctx, x, y, w, h, value, color = PALETTE.gold, label = '') {
  ctx.save();
  ctx.fillStyle = 'rgba(45,59,69,0.12)';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, x, y, Math.max(h, w * clamp(value)), h, h / 2);
  ctx.fill();
  if (label) text(ctx, label, x + w / 2, y + h / 2, { size: h * 0.62, weight: 600 });
  ctx.restore();
}

// Short-lived text that floats up and fades. Every action gets one.
export class Toasts {
  constructor() { this.items = []; }
  add(message, { x = 0.5, y = 0.45, color = PALETTE.ink, size = 34 } = {}) {
    this.items.push({ message, x, y, color, size, born: performance.now() });
  }
  draw(ctx, w, h) {
    const now = performance.now();
    this.items = this.items.filter(t => now - t.born < 1100);
    for (const t of this.items) {
      const age = (now - t.born) / 1100;
      text(ctx, t.message, t.x * w, t.y * h - age * 46, {
        size: t.size, weight: 700, color: t.color, alpha: 1 - age * age,
      });
    }
  }
}

// ---- The player figure ------------------------------------------------------
// A flat cartoon body posed from the landmarks. Deliberately simple: a round
// head, capsule limbs, two dots and a smile. All original, all drawn here.

// x, y is where the FEET stand; height is how tall to draw the whole figure in
// pixels. Anchoring at the feet and sizing by the body's own head-to-ankle
// span is what keeps a figure standing on a court line instead of sliding off
// the bottom of the screen when the player crouches or steps closer.
export function drawAvatar(ctx, body, { x, y, height = 160, color = PALETTE.blue,
  hair = '#5a4433', skin = '#ffd9b8', facing = 1, back = false } = {}) {
  if (!body || !body.ok) return;
  const j = body.joints;

  const head = j[L.nose];
  const feet = j[L.leftAnkle] && j[L.rightAnkle]
    ? { y: Math.max(j[L.leftAnkle].y, j[L.rightAnkle].y) }
    : { y: body.centre.y + body.scale * 3 };
  const span = Math.max(0.12, feet.y - (head ? head.y : body.centre.y - body.scale));
  const unit = height / span;

  const hips = j[L.leftHip] && j[L.rightHip]
    ? (j[L.leftHip].x + j[L.rightHip].x) / 2
    : body.centre.x;
  const px = p => x + (p.x - hips) * unit * facing;
  const py = p => y - (feet.y - p.y) * unit;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // One limb width for the whole figure: thick and short, so the silhouette
  // reads as a chunky cartoon rather than a stick.
  const limb = height * 0.105;

  const bone = (a, b, width, colour) => {
    if (!j[a] || !j[b]) return;
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(px(j[a]), py(j[a]));
    ctx.lineTo(px(j[b]), py(j[b]));
    ctx.stroke();
  };

  // Legs, then shoes planted on the ground.
  for (const [a, b] of [[L.leftHip, L.leftKnee], [L.leftKnee, L.leftAnkle],
                        [L.rightHip, L.rightKnee], [L.rightKnee, L.rightAnkle]]) {
    bone(a, b, limb * 1.05, '#45586a');
  }
  for (const ankle of [L.leftAnkle, L.rightAnkle]) {
    if (!j[ankle]) continue;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, px(j[ankle]) - limb * 0.8, py(j[ankle]) - limb * 0.3,
      limb * 1.7, limb * 0.9, limb * 0.42);
    ctx.fill();
  }

  // Torso: one wide capsule from the shoulders to the hips.
  if (j[L.leftShoulder] && j[L.rightShoulder] && j[L.leftHip] && j[L.rightHip]) {
    const sx = (px(j[L.leftShoulder]) + px(j[L.rightShoulder])) / 2;
    const sy = (py(j[L.leftShoulder]) + py(j[L.rightShoulder])) / 2;
    const hx2 = (px(j[L.leftHip]) + px(j[L.rightHip])) / 2;
    const hy2 = (py(j[L.leftHip]) + py(j[L.rightHip])) / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = height * 0.26;
    ctx.beginPath();
    ctx.moveTo(sx, sy + height * 0.015);
    ctx.lineTo(hx2, hy2);
    ctx.stroke();
  }

  // Arms in the shirt colour.
  for (const [a, b] of [[L.leftShoulder, L.leftElbow], [L.leftElbow, L.leftWrist],
                        [L.rightShoulder, L.rightElbow], [L.rightElbow, L.rightWrist]]) {
    bone(a, b, limb * 1.1, color);
  }

  // Hands.
  ctx.fillStyle = skin;
  for (const w of [L.leftWrist, L.rightWrist]) {
    if (!j[w]) continue;
    ctx.beginPath();
    ctx.arc(px(j[w]), py(j[w]), limb * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head. Seen from behind it is just hair; seen from the front it gets eyes
  // and a smile.
  const nose = j[L.nose];
  if (nose && j[L.leftShoulder] && j[L.rightShoulder]) {
    const neckX = (px(j[L.leftShoulder]) + px(j[L.rightShoulder])) / 2;
    const neckY = (py(j[L.leftShoulder]) + py(j[L.rightShoulder])) / 2;
    const hx = px(nose), hy = py(nose);
    const r = height * 0.15;

    ctx.strokeStyle = skin;
    ctx.lineWidth = height * 0.075;
    ctx.beginPath();
    ctx.moveTo(neckX, neckY);
    ctx.lineTo(hx, hy + r * 0.45);
    ctx.stroke();

    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.fill();

    if (back) {
      // The back of the head: hair over everything but the jaw.
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(hx, hy - r * 0.08, r * 1.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.ellipse(hx, hy + r * 0.78, r * 0.52, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.arc(hx, hy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.ellipse(hx, hy - r * 0.62, r * 1.05, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#2d3b45';
      ctx.beginPath();
      ctx.arc(hx - r * 0.32 * facing, hy + r * 0.04, r * 0.12, 0, Math.PI * 2);
      ctx.arc(hx + r * 0.32 * facing, hy + r * 0.04, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2d3b45';
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.arc(hx, hy + r * 0.18, r * 0.4, 0.22 * Math.PI, 0.78 * Math.PI);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---- Debug overlay ----------------------------------------------------------
// Never needed to play. Toggled from the settings screen or ?debug in the URL.

export function drawDebug(ctx, w, h, { input, tracker, ultrasonic, video, events }) {
  const boxW = 240, boxH = boxW * 0.75;
  const x = w - boxW - 14, y = h - boxH - 14;

  ctx.save();
  ctx.globalAlpha = 0.9;
  if (video && video.readyState >= 2) {
    ctx.save();
    ctx.translate(x + boxW, y);
    ctx.scale(-1, 1); // the camera picture is mirrored, like the tracking
    ctx.drawImage(video, 0, 0, boxW, boxH);
    ctx.restore();
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, boxW, boxH);
  }

  for (const pose of tracker.poses) {
    ctx.strokeStyle = '#7ee787';
    ctx.lineWidth = 2;
    for (const [a, b] of BONES) {
      const p = pose[a], q = pose[b];
      if (!p || !q || p.v < CONFIG.minVisibility || q.v < CONFIG.minVisibility) continue;
      ctx.beginPath();
      // Mirror back, so the skeleton lands on the mirrored picture.
      ctx.moveTo(x + (1 - p.x) * boxW, y + p.y * boxH);
      ctx.lineTo(x + (1 - q.x) * boxW, y + q.y * boxH);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd866';
    for (const p of pose) {
      if (!p || p.v < CONFIG.minVisibility) continue;
      ctx.beginPath();
      ctx.arc(x + (1 - p.x) * boxW, y + p.y * boxH, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const sprites = spriteReport();
  const lines = [
    `pose fps   ${tracker.fps}`,
    `bodies     ${input.playerCount}`,
    `distance   ${input.distanceCm.toFixed(0)} cm (${input.distanceFrom})`,
    `sensor     ${ultrasonic.connected ? (ultrasonic.fresh ? ultrasonic.rawLine : 'stale') : 'not connected'}`,
    `depth01    ${input.depth01.toFixed(2)}`,
    `sprites    ${sprites.loaded}/${sprites.total} loaded`,
    ...events.slice(-3).map(e => `event      ${e.type} ${e.side || e.zone || ''}`),
  ];
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  roundRect(ctx, x, y - lines.length * 15 - 12, boxW, lines.length * 15 + 10, 6);
  ctx.fill();
  lines.forEach((line, i) => {
    text(ctx, line, x + 9, y - lines.length * 15 - 2 + i * 15, {
      size: 11, align: 'left', color: '#cfe8ff',
    });
  });
  ctx.restore();
}
