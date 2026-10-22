// hud3d.js: the flat readouts drawn over the 3D scene.
//
// The input layer already measures swing speed, face angle, plane and depth.
// Until now the games used those numbers and threw them away. These panels put
// them back in front of the player, which is the difference between a game
// that feels random and one you can get better at.

import { PALETTE, text, roundRect } from '../ui.js';
import { clamp, lerp } from '../filters.js';

export function panel(ctx, x, y, w, h, r = 14) {
  ctx.fillStyle = PALETTE.paper;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = PALETTE.paperEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// The hole from above: tee at the bottom, pin at the top, built from the same
// bend and hazard numbers the course itself is. On a dogleg you cannot see the
// green from the tee, so this is how you know which way the hole goes.
export function holeMap(ctx, x, y, w, h, hole, ball, centreAt, widthAt) {
  panel(ctx, x, y, w, h);
  const pad = 12;
  const inner = { x: x + pad, y: y + pad, w: w - pad * 2, h: h - pad * 2 };
  const spread = 0.42 / (1 + Math.abs(hole.bend) * 0.8);
  const at = (t, off) => ({
    x: inner.x + inner.w * (0.5 + (off + centreAt(hole, t)) * spread),
    y: inner.y + inner.h * (1 - t),
  });

  ctx.save();
  roundRect(ctx, inner.x, inner.y, inner.w, inner.h, 8);
  ctx.clip();
  ctx.fillStyle = '#4f8a35';
  ctx.fillRect(inner.x, inner.y, inner.w, inner.h);

  ctx.fillStyle = '#9ad86a';
  ctx.beginPath();
  for (let i = 0; i <= 30; i++) {
    const t = i / 30, p = at(t, -widthAt(hole, t));
    i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
  }
  for (let i = 30; i >= 0; i--) {
    const t = i / 30, p = at(t, widthAt(hole, t));
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();

  for (const hz of hole.hazards) {
    const p = at(hz.at, hz.off);
    ctx.fillStyle = hz.kind === 'water' ? '#5aa0dd' : hz.kind === 'sand' ? '#f4e1a8' : '#3f7a32';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, inner.w * 0.1 * hz.size, inner.h * 0.035 * hz.size, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const pin = at(1, 0);
  ctx.fillStyle = '#c3e89b';
  ctx.beginPath();
  ctx.ellipse(pin.x, pin.y + 4, inner.w * 0.11, inner.h * 0.038, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pin.x, pin.y + 4);
  ctx.lineTo(pin.x, pin.y - 9);
  ctx.stroke();
  ctx.fillStyle = PALETTE.red;
  ctx.beginPath();
  ctx.moveTo(pin.x, pin.y - 9);
  ctx.lineTo(pin.x + 7, pin.y - 6);
  ctx.lineTo(pin.x, pin.y - 3);
  ctx.closePath();
  ctx.fill();

  const bp = at(clamp(ball.along), ball.off - centreAt(hole, clamp(ball.along)));
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.arc(bp.x, bp.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(bp.x, bp.y, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// How hard, and how straight. The bar is the power of the last swing; the
// needle below it is the face angle — centred is square through the ball,
// left is a draw, right is a fade.
export function swingBar(ctx, x, y, w, { power = 0, faceDeg = 0, label = 'last swing' } = {}) {
  const h = 76;
  panel(ctx, x, y, w, h, 12);
  text(ctx, label, x + 12, y + 16, { size: 10, align: 'left', color: PALETTE.inkSoft });

  // Power.
  const barY = y + 26;
  ctx.fillStyle = 'rgba(45,59,69,0.12)';
  roundRect(ctx, x + 12, barY, w - 24, 12, 6);
  ctx.fill();
  const grad = ctx.createLinearGradient(x + 12, 0, x + w - 12, 0);
  grad.addColorStop(0, '#b6e0a4');
  grad.addColorStop(0.6, '#f7c744');
  grad.addColorStop(1, '#ef6a5a');
  ctx.fillStyle = grad;
  roundRect(ctx, x + 12, barY, Math.max(12, (w - 24) * clamp(power)), 12, 6);
  ctx.fill();

  // Face angle, as a needle on a centred scale.
  const scaleY = y + 56;
  const cx = x + w / 2;
  ctx.strokeStyle = 'rgba(45,59,69,0.18)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 12, scaleY);
  ctx.lineTo(x + w - 12, scaleY);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.paperEdge;
  ctx.beginPath();
  ctx.moveTo(cx, scaleY - 7);
  ctx.lineTo(cx, scaleY + 7);
  ctx.stroke();

  const square = Math.abs(faceDeg) < 8;
  const nx = cx + clamp(faceDeg / 45, -1, 1) * (w / 2 - 14);
  ctx.fillStyle = square ? '#4f9e5e' : PALETTE.red;
  ctx.beginPath();
  ctx.moveTo(nx, scaleY - 9);
  ctx.lineTo(nx + 5, scaleY);
  ctx.lineTo(nx, scaleY + 9);
  ctx.lineTo(nx - 5, scaleY);
  ctx.closePath();
  ctx.fill();
  text(ctx, square ? 'square' : (faceDeg > 0 ? 'fade' : 'draw'),
    x + w - 12, y + 16, { size: 10, align: 'right', color: square ? '#4f9e5e' : PALETTE.red });
}

// What the last hit actually measured. Rows of label and value.
export function readout(ctx, x, y, w, rows, title = 'last shot') {
  const h = 26 + rows.length * 19;
  panel(ctx, x, y, w, h, 12);
  text(ctx, title, x + 12, y + 16, { size: 10, align: 'left', color: PALETTE.inkSoft });
  rows.forEach(([label, value], i) => {
    const ry = y + 34 + i * 19;
    text(ctx, label, x + 12, ry, { size: 12, align: 'left', color: PALETTE.inkSoft });
    text(ctx, String(value), x + w - 12, ry, { size: 13, align: 'right', weight: 600, color: PALETTE.ink });
  });
}

// A compass needle for the wind, with its strength beside it.
export function windDial(ctx, cx, cy, r, wind) {
  ctx.fillStyle = PALETTE.paper;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.paperEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
  const angle = wind >= 0 ? 0 : Math.PI;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = PALETTE.blue;
  ctx.beginPath();
  ctx.moveTo(r * 0.6, 0);
  ctx.lineTo(-r * 0.35, -r * 0.35);
  ctx.lineTo(-r * 0.12, 0);
  ctx.lineTo(-r * 0.35, r * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  text(ctx, `${Math.abs(wind * 20).toFixed(0)}`, cx, cy + r + 12, { size: 11, color: PALETTE.inkSoft });
}
