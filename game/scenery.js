// scenery.js: the world behind the games — crowds, stands, sky, trees, floods,
// hardwood, turf. Shared so five sports do not each invent a crowd.
//
// Two rules hold this file together:
//
//   Scenery is DETERMINISTIC. Every crowd face, every blade of rough, every
//   cloud comes out of a seeded generator, so the same scene draws identically
//   on every frame. Calling Math.random() in a draw loop makes a stadium that
//   boils.
//
//   Scenery is CACHED. A stadium is hundreds of little shapes and none of them
//   move, so each backdrop is drawn once into an offscreen canvas and blitted
//   after that. Rebuilt only when the window size changes.

// A small deterministic generator. Same seed, same stadium, forever.
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const layers = new Map();

// Draw once, blit after. `key` must change whenever the picture should.
export function layer(key, w, h, draw) {
  const id = `${key}@${Math.round(w)}x${Math.round(h)}`;
  let canvas = layers.get(id);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    draw(canvas.getContext('2d'), canvas.width, canvas.height);
    layers.set(id, canvas);
    // A couple of resizes should not leak every size ever seen.
    if (layers.size > 24) layers.delete(layers.keys().next().value);
  }
  return canvas;
}

// ---- Sky --------------------------------------------------------------------

export function sky(ctx, w, horizon, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, horizon);
}

export function clouds(ctx, w, horizon, seed = 7, count = 5) {
  const r = rng(seed);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = r() * w;
    const y = horizon * (0.15 + r() * 0.5);
    const s = horizon * (0.05 + r() * 0.07);
    ctx.fillStyle = `rgba(255,255,255,${0.07 + r() * 0.09})`;
    ctx.beginPath();
    for (let p = 0; p < 5; p++) {
      ctx.arc(x + p * s * 0.7 - s, y + Math.sin(p * 1.7 + i) * s * 0.22, s * (0.6 + r() * 0.5), 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
}

// ---- Crowds -----------------------------------------------------------------
// A head and shoulders per person, in rows that get smaller and darker toward
// the back. Close up they read as people; from across the screen they read as
// the texture a full stadium has.

const SHIRTS = ['#f4a9a0', '#a8cdf0', '#f6d98a', '#b6e0a4', '#d3bdf0',
                '#f7c9a0', '#9fd8e8', '#e9b7d4', '#c9d7e8', '#f2e4a8'];

export function crowd(ctx, x, y, w, h, { seed = 1, rows = 7, dim = 0, warm = false } = {}) {
  const r = rng(seed);
  const rowH = h / rows;
  for (let row = 0; row < rows; row++) {
    const ry = y + h - (row + 1) * rowH;
    const head = Math.max(1.6, rowH * 0.3);
    const spacing = head * 2.6;
    // Back rows only slightly paler. No shading, no gradients: the whole
    // stand should stay bright.
    const fade = 1 - (row / rows) * 0.22 - dim;
    for (let px = x - spacing; px < x + w + spacing; px += spacing) {
      const cx = px + (r() - 0.5) * spacing * 0.4;
      const cy = ry + rowH * 0.6;
      ctx.globalAlpha = Math.max(0.3, Math.min(1, fade));
      ctx.fillStyle = SHIRTS[Math.floor(r() * SHIRTS.length)];
      // One rounded shape for the body.
      roundRect(ctx, cx - head * 1.2, cy, head * 2.4, head * 2.1, head);
      ctx.fill();
      // One circle for the head.
      ctx.fillStyle = r() > 0.75 ? '#c08e6a' : '#ffd9b8';
      ctx.beginPath();
      ctx.arc(cx, cy - head * 0.2, head, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// A tier of seating: the concrete deck, the crowd on it, and a rail in front.
export function stand(ctx, x, y, w, h, { seed = 1, deck = '#cfdde8', rail = '#ffffff', dim = 0, rows = 7 } = {}) {
  ctx.fillStyle = deck;
  ctx.fillRect(x, y, w, h);
  crowd(ctx, x, y, w, h * 0.93, { seed, rows, dim });
  ctx.fillStyle = rail;
  ctx.fillRect(x, y + h - Math.max(2, h * 0.05), w, Math.max(2, h * 0.05));
}

// ---- Turf and surfaces ------------------------------------------------------

// Mown stripes, narrowing with distance so the field reads as going away.
export function mownStripes(ctx, x, y, w, h, { bands = 9, light = '#4f8f5a', dark = '#467f52', skew = 0.55 } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = light;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = dark;
  for (let i = 0; i < bands; i += 2) {
    const t0 = i / bands, t1 = (i + 1) / bands;
    const yy0 = y + h * Math.pow(t0, skew);
    const yy1 = y + h * Math.pow(t1, skew);
    ctx.fillRect(x, yy0, w, Math.max(1, yy1 - yy0));
  }
  ctx.restore();
}

export function hardwood(ctx, x, y, w, h, { seed = 3, base = '#e8c084', line = 'rgba(150,100,45,0.14)' } = {}) {
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  // Boards converging toward the back, so the floor has a direction.
  for (let i = 0; i <= 26; i++) {
    const t = i / 26;
    ctx.globalAlpha = 0.25 + r() * 0.3;
    ctx.beginPath();
    ctx.moveTo(x + w * t, y + h);
    ctx.lineTo(x + w * (0.3 + t * 0.4), y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---- Props ------------------------------------------------------------------

export function tree(ctx, x, groundY, size, { seed = 1, kind = 'round' } = {}) {
  const r = rng(seed);
  ctx.save();
  ctx.fillStyle = '#a9794f';
  ctx.fillRect(x - size * 0.07, groundY - size * 0.42, size * 0.14, size * 0.42);
  if (kind === 'pine') {
    // Three tiers, each wider and lower than the one above it.
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      ctx.fillStyle = ['#6aab52', '#74b85a', '#7fc463'][i];
      const apex = groundY - size * (1.02 - t * 0.26);
      const base = groundY - size * (0.62 - t * 0.2);
      const half = size * (0.26 + t * 0.26);
      ctx.beginPath();
      ctx.moveTo(x, apex);
      ctx.lineTo(x + half, base);
      ctx.lineTo(x - half, base);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // A few overlapping blobs read as a canopy and never as a circle.
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = ['#74b85a', '#7fc463', '#6aab52'][i % 3];
      ctx.beginPath();
      ctx.arc(x + (r() - 0.5) * size * 0.55,
              groundY - size * (0.52 + r() * 0.3),
              size * (0.2 + r() * 0.16), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function floodlight(ctx, x, y, size, { on = true } = {}) {
  ctx.save();
  ctx.strokeStyle = '#b9cbd8';
  ctx.lineWidth = size * 0.1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + size * 2.6);
  ctx.stroke();
  ctx.fillStyle = '#c6d6e2';
  ctx.fillRect(x - size * 0.8, y - size * 0.5, size * 1.6, size * 0.56);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = on ? '#fff6d2' : '#d6dee6';
    ctx.beginPath();
    ctx.arc(x - size * 0.55 + i * size * 0.37, y - size * 0.22, size * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// A scoreboard panel: dark face, a lit border, and whatever text is handed in.
export function scoreboard(ctx, x, y, w, h, lines, { accent = '#e7c15c' } = {}) {
  ctx.save();
  ctx.fillStyle = '#f7fbfd';
  roundRect(ctx, x, y, w, h, Math.min(12, h * 0.2));
  ctx.fill();
  ctx.strokeStyle = '#dfeaf1';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? '#2d3b45' : '#6d8291';
    ctx.font = `${i === 0 ? 700 : 500} ${h * (i === 0 ? 0.4 : 0.26)}px ui-monospace, monospace`;
    ctx.fillText(line, x + w / 2, y + h * (i === 0 ? 0.36 : 0.74));
  });
  ctx.restore();
}

// Bunting along a rail: small triangles, the cheapest "event is happening" cue.
export function bunting(ctx, x, y, w, { seed = 5, size = 10, colors = ['#d4604f', '#e7c15c', '#5a9fd4'] } = {}) {
  const r = rng(seed);
  for (let px = x; px < x + w; px += size * 1.4) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px + size, y);
    ctx.lineTo(px + size / 2, y + size * 1.3);
    ctx.closePath();
    ctx.fill();
  }
}

// ---- Small people -----------------------------------------------------------
// Fielders, line judges, ball kids, cornermen, photographers. Too small for the
// jointed avatar in ui.js and too many to draw by hand, so one function makes
// them all: head, torso, two arms, two legs, posed.

export function figure(ctx, x, groundY, height, {
  shirt = '#d9dde4', pants = '#2f3a4a', skin = '#f0cba8', cap = null,
  pose = 'stand', facing = 1, lean = 0,
} = {}) {
  const u = height / 8;                    // one unit ≈ a head
  const hipY = groundY - u * 3.2;
  const shoulderY = groundY - u * 5.6;
  const headY = groundY - u * 6.6;

  ctx.save();
  ctx.translate(x, 0);
  ctx.rotate(lean * 0.12);
  ctx.lineCap = 'round';

  // Legs.
  ctx.strokeStyle = pants;
  ctx.lineWidth = u * 0.85;
  const stance = pose === 'ready' ? u * 1.3 : u * 0.7;
  ctx.beginPath();
  ctx.moveTo(-u * 0.4, hipY);
  ctx.lineTo(-stance, groundY);
  ctx.moveTo(u * 0.4, hipY);
  ctx.lineTo(stance, groundY);
  ctx.stroke();

  // Torso.
  ctx.fillStyle = shirt;
  roundRect(ctx, -u * 1.1, shoulderY, u * 2.2, hipY - shoulderY + u * 0.4, u * 0.6);
  ctx.fill();

  // Arms, posed.
  ctx.strokeStyle = shirt;
  ctx.lineWidth = u * 0.65;
  ctx.beginPath();
  if (pose === 'ready') {                  // crouched, hands out in front
    ctx.moveTo(-u * 1.0, shoulderY + u * 0.5);
    ctx.lineTo(-u * 1.9 * facing, hipY);
    ctx.moveTo(u * 1.0, shoulderY + u * 0.5);
    ctx.lineTo(u * 1.9 * facing, hipY);
  } else if (pose === 'cheer') {           // both arms up
    ctx.moveTo(-u * 1.0, shoulderY + u * 0.4);
    ctx.lineTo(-u * 1.7, shoulderY - u * 1.8);
    ctx.moveTo(u * 1.0, shoulderY + u * 0.4);
    ctx.lineTo(u * 1.7, shoulderY - u * 1.8);
  } else if (pose === 'point') {           // one arm out to the side
    ctx.moveTo(-u * 1.0, shoulderY + u * 0.5);
    ctx.lineTo(-u * 1.3, hipY + u * 0.3);
    ctx.moveTo(u * 1.0, shoulderY + u * 0.4);
    ctx.lineTo(u * 2.6 * facing, shoulderY - u * 0.3);
  } else {                                 // arms at the sides
    ctx.moveTo(-u * 1.0, shoulderY + u * 0.5);
    ctx.lineTo(-u * 1.4, hipY + u * 0.5);
    ctx.moveTo(u * 1.0, shoulderY + u * 0.5);
    ctx.lineTo(u * 1.4, hipY + u * 0.5);
  }
  ctx.stroke();

  // Head, and a cap if it was asked for.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, headY, u * 0.95, 0, Math.PI * 2);
  ctx.fill();
  if (cap) {
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.arc(0, headY - u * 0.15, u * 0.95, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(facing > 0 ? 0 : -u * 1.5, headY - u * 0.3, u * 1.5, u * 0.26);
  }
  ctx.restore();
}

// ui.js has its own copy. Scenery keeps one here rather than importing, so the
// two modules stay independent of each other.
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

// ---- Finishing touches ------------------------------------------------------

// A soft contact shadow. Everything standing on a surface needs one, or it
// floats — the single cheapest thing that makes a flat scene read as solid.
export function groundShadow(ctx, x, y, rx, { alpha = 0.15, squash = 0.26 } = {}) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(45,59,69,${alpha})`);
  g.addColorStop(1, 'rgba(45,59,69,0)');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, squash);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Darkens the corners. Pulls the eye to the middle and hides the places where
// a perspective trick stops holding up.
// Kept for callers, but this style does not darken corners: a flat, evenly
// lit picture is the whole point. Pass a strength explicitly to force it.
export function vignette(ctx, w, h, strength = 0) {
  if (strength <= 0) return;
  const g = ctx.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.32,
                                     w / 2, h * 0.52, Math.max(w, h) * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// Fine grain over a flat fill: grass, dirt, canvas. Keeps big areas from
// looking like a paint bucket.
// Grain does not belong in a flat style either. Off unless asked for.
export function speckle(ctx, x, y, w, h, { seed = 1, count = 0, colors = ['rgba(255,255,255,0.05)'], size = 2 } = {}) {
  if (count <= 0) return;
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    ctx.fillRect(x + r() * w, y + r() * h, size * (0.5 + r()), size * (0.5 + r()));
  }
}

// Banners draped over a stand's front rail.
export function banners(ctx, x, y, w, h, { seed = 2, count = 6, colors = ['#c4473a', '#3f6fa8', '#e7c15c', '#4f8f5a'] } = {}) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const bw = w * (0.05 + r() * 0.07);
    const bx = x + r() * (w - bw);
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    ctx.globalAlpha = 0.85;
    ctx.fillRect(bx, y, bw, h);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(bx + bw * 0.14, y + h * 0.36, bw * 0.72, h * 0.14);
    ctx.globalAlpha = 1;
  }
}

// Camera flashes in a dark crowd. Takes the clock, so it cannot be cached with
// the rest of the backdrop — call it per frame, over the top.
export function flashes(ctx, x, y, w, h, now, { seed = 4, count = 26 } = {}) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const fx = x + r() * w;
    const fy = y + r() * h;
    const period = 900 + r() * 3600;
    const phase = (now + r() * 5000) % period;
    if (phase > 110) continue;             // lit for a tenth of a second
    const a = 1 - phase / 110;
    ctx.fillStyle = `rgba(255,252,235,${a * 0.9})`;
    ctx.beginPath();
    ctx.arc(fx, fy, 2.4 + a * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,252,235,${a * 0.18})`;
    ctx.beginPath();
    ctx.arc(fx, fy, 9 + a * 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Birds, for an outdoor sky. Two strokes each, which is all a distant bird is.
export function birds(ctx, x, y, size, now, { seed = 6, count = 5 } = {}) {
  const r = rng(seed);
  ctx.strokeStyle = 'rgba(40,50,60,0.45)';
  ctx.lineWidth = Math.max(1, size * 0.06);
  for (let i = 0; i < count; i++) {
    const drift = ((now / 90) * (0.3 + r() * 0.4) + r() * 900) % 1200 - 100;
    const bx = x + drift;
    const by = y + r() * size * 3;
    const flap = Math.sin(now / 160 + i) * size * 0.22;
    ctx.beginPath();
    ctx.moveTo(bx - size * 0.5, by);
    ctx.quadraticCurveTo(bx - size * 0.25, by - flap - size * 0.2, bx, by);
    ctx.quadraticCurveTo(bx + size * 0.25, by - flap - size * 0.2, bx + size * 0.5, by);
    ctx.stroke();
  }
}
