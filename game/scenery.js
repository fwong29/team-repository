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

const SHIRTS = ['#c7d4e4', '#9fb3c8', '#d8b08a', '#b98c7a', '#8fa9a0',
                '#c9a0a0', '#a8a0c0', '#dcc89a', '#7f94a8', '#b5c2a0'];

export function crowd(ctx, x, y, w, h, { seed = 1, rows = 7, dim = 0, warm = false } = {}) {
  const r = rng(seed);
  const rowH = h / rows;
  for (let row = 0; row < rows; row++) {
    // Back rows sit higher, smaller and darker: cheap, convincing depth.
    const depth = 1 - row / rows;
    const ry = y + h - (row + 1) * rowH;
    const scale = 0.45 + (1 - depth) * 0.75;
    const head = Math.max(1.4, rowH * 0.3 * scale);
    const spacing = head * 2.5;
    const shade = 0.3 + (1 - depth) * 0.7 - dim;
    for (let px = x - spacing; px < x + w + spacing; px += spacing) {
      const jitter = (r() - 0.5) * spacing * 0.45;
      const cx = px + jitter;
      const cy = ry + rowH * 0.62 + (r() - 0.5) * rowH * 0.18;
      const shirt = SHIRTS[Math.floor(r() * SHIRTS.length)];
      ctx.globalAlpha = Math.max(0.12, Math.min(1, shade));
      // Shoulders.
      ctx.fillStyle = warm ? shiftWarm(shirt) : shirt;
      ctx.beginPath();
      ctx.ellipse(cx, cy + head * 1.5, head * 1.35, head * 1.15, 0, Math.PI, 0);
      ctx.fill();
      // Head.
      ctx.fillStyle = r() > 0.72 ? '#7a5a44' : '#e8c3a0';
      ctx.beginPath();
      ctx.arc(cx, cy, head, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function shiftWarm(hex) {
  const n = parseInt(hex.slice(1), 16);
  const red = Math.min(255, ((n >> 16) & 255) + 22);
  const green = Math.max(0, ((n >> 8) & 255) - 6);
  const blue = Math.max(0, (n & 255) - 18);
  return `rgb(${red},${green},${blue})`;
}

// A tier of seating: the concrete deck, the crowd on it, and a rail in front.
export function stand(ctx, x, y, w, h, { seed = 1, deck = '#2a2f38', rail = 'rgba(255,255,255,0.22)', dim = 0, rows = 7 } = {}) {
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

export function hardwood(ctx, x, y, w, h, { seed = 3, base = '#b4823f', line = 'rgba(80,45,15,0.22)' } = {}) {
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  // Boards converging toward the back, so the floor has a direction.
  for (let i = 0; i <= 26; i++) {
    const t = i / 26;
    ctx.globalAlpha = 0.35 + r() * 0.5;
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
  ctx.fillStyle = '#4a3326';
  ctx.fillRect(x - size * 0.07, groundY - size * 0.42, size * 0.14, size * 0.42);
  if (kind === 'pine') {
    // Three tiers, each wider and lower than the one above it.
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      ctx.fillStyle = ['#2b5736', '#32633c', '#396f42'][i];
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
      ctx.fillStyle = ['#3d7446', '#457f4d', '#356a3e'][i % 3];
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
  ctx.strokeStyle = '#3a414c';
  ctx.lineWidth = size * 0.1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + size * 2.6);
  ctx.stroke();
  ctx.fillStyle = '#39414d';
  ctx.fillRect(x - size * 0.8, y - size * 0.5, size * 1.6, size * 0.56);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = on ? '#f6edc8' : '#555b66';
    ctx.beginPath();
    ctx.arc(x - size * 0.55 + i * size * 0.37, y - size * 0.22, size * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
  if (on) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 3.4);
    glow.addColorStop(0, 'rgba(246,237,200,0.16)');
    glow.addColorStop(1, 'rgba(246,237,200,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, size * 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// A scoreboard panel: dark face, a lit border, and whatever text is handed in.
export function scoreboard(ctx, x, y, w, h, lines, { accent = '#e7c15c' } = {}) {
  ctx.save();
  ctx.fillStyle = '#15181f';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(242,239,233,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? accent : '#cfd6df';
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
