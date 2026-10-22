// golf.js: three holes, one swing at a time.
//
// What the body does: a vertical swing. How high the hand got on the backswing
// is power, and the angle the hand is travelling at the bottom bends the ball
// left or right. Lean to aim before you swing. Wind pushes every shot.

import { PALETTE, text, drawMeter, roundRect, drawAvatar } from '../ui.js';
import { layer, sky, clouds, tree, mownStripes, rng } from '../scenery.js';
import { clamp, lerp } from '../filters.js';
import { CONFIG } from '../config.js';
import { Sound } from '../audio.js';

// The course. Every hole is described by the same handful of numbers, and the
// fairway, the hazards and the gameplay all read from them — so adding a hole
// is adding a row here, not new drawing code.
//
//   bend     where the fairway ends up sideways, -1 left .. 1 right
//   bendAt   how far down the hole the turn starts, 0..1
//   width    half-width of the fairway in the same units as the ball's offset
//   rise     uphill is positive: it costs carry. Downhill gives it back.
//   hazards  { at, off, size, kind } — kind is water, sand or trees
const HOLES = [
  { name: 'The Opener', length: 180, par: 3, bend: 0, bendAt: 0.5, width: 0.62, rise: 0,
    hazards: [{ at: 0.9, off: -0.5, size: 0.7, kind: 'sand' }, { at: 0.9, off: 0.5, size: 0.7, kind: 'sand' }] },

  { name: 'Elbow Right', length: 340, par: 4, bend: 0.62, bendAt: 0.35, width: 0.5, rise: 0,
    hazards: [{ at: 0.6, off: 0.72, size: 1.1, kind: 'water' }, { at: 0.42, off: -0.7, size: 0.9, kind: 'trees' }] },

  { name: 'The Island', length: 165, par: 3, bend: -0.2, bendAt: 0.2, width: 0.42, rise: -0.1,
    hazards: [{ at: 0.82, off: 0, size: 2.2, kind: 'water' }] },

  { name: 'Long Way Home', length: 480, par: 5, bend: -0.55, bendAt: 0.3, width: 0.58, rise: 0.15,
    hazards: [{ at: 0.5, off: -0.9, size: 1.0, kind: 'sand' }, { at: 0.75, off: 0.55, size: 1.2, kind: 'trees' }] },

  { name: 'The Corridor', length: 300, par: 4, bend: 0.15, bendAt: 0.6, width: 0.3, rise: 0,
    hazards: [{ at: 0.45, off: -0.75, size: 1.3, kind: 'trees' }, { at: 0.45, off: 0.75, size: 1.3, kind: 'trees' }] },

  { name: 'Drop Shot', length: 150, par: 3, bend: 0, bendAt: 0.5, width: 0.5, rise: -0.35,
    hazards: [{ at: 0.6, off: 0, size: 1.4, kind: 'water' }] },

  { name: 'Elbow Left', length: 355, par: 4, bend: -0.68, bendAt: 0.38, width: 0.48, rise: 0.05,
    hazards: [{ at: 0.48, off: -0.85, size: 1.0, kind: 'sand' }, { at: 0.8, off: 0.6, size: 0.9, kind: 'sand' }] },

  { name: 'The Climb', length: 505, par: 5, bend: 0.3, bendAt: 0.55, width: 0.66, rise: 0.4,
    hazards: [{ at: 0.35, off: 0.8, size: 1.0, kind: 'trees' }, { at: 0.88, off: -0.6, size: 0.8, kind: 'sand' }] },

  { name: 'Last Call', length: 370, par: 4, bend: 0.4, bendAt: 0.45, width: 0.44, rise: -0.1,
    hazards: [{ at: 0.65, off: -0.65, size: 1.4, kind: 'water' },
              { at: 0.9, off: 0.55, size: 0.8, kind: 'sand' }, { at: 0.9, off: -0.2, size: 0.7, kind: 'sand' }] },
];

// Where the middle of the fairway sits at a given point down the hole. This is
// the dogleg: a shot hit dead straight runs out of fairway on a bending hole,
// which is the whole reason to shape one.
function centreAt(hole, t) {
  const turn = Math.max(0, (t - hole.bendAt) / Math.max(0.01, 1 - hole.bendAt));
  return hole.bend * Math.pow(Math.min(1, turn), 1.35);
}

// The fairway narrows into the distance like everything else, but a hole with
// a small `width` is genuinely tighter to hit.
function widthAt(hole, t) {
  return hole.width * (1 - t * 0.25);
}

// Fairway, rough, sand or water — what the ball is sitting on, which decides
// how far the next one goes.
function lieAt(hole, along, off) {
  for (const hz of hole.hazards) {
    if (hz.kind === 'trees') continue;
    const dx = (off - hz.off) / (hz.size * 0.42);
    const dy = (along - hz.at) / (hz.size * 0.11);
    if (dx * dx + dy * dy < 1) return hz.kind;
  }
  return Math.abs(off - centreAt(hole, along)) <= widthAt(hole, along) ? 'fairway' : 'rough';
}

const LIE_CARRY = { fairway: 1, rough: 0.68, sand: 0.55, water: 1 };

export const golf = {
  id: 'golf',
  label: 'Golf',
  note: 'Swing down and through',
  twoPlayerStyle: 'turns',
  tutorial: [
    'Stand side-on with room to swing.',
    'Lean left or right to aim.',
    'Swing downward — a bigger backswing is more power.',
    'The angle through the ball bends the shot.',
  ],
  icon(ctx, x, y, r) {
    ctx.save();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = r * 0.14;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.4, y - r * 0.7);
    ctx.lineTo(x - r * 0.4, y + r * 0.7);
    ctx.stroke();
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.4, y - r * 0.7);
    ctx.lineTo(x + r * 0.6, y - r * 0.4);
    ctx.lineTo(x - r * 0.4, y - r * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  create({ input, toasts, twoPlayer, difficulty, startHole = 0 }) {
    const state = {
      hole: Math.min(Math.max(0, startHole), HOLES.length - 1),
      turn: 0,
      strokes: [0, 0],
      total: [0, 0],
      ball: { along: 0, off: 0 },   // along the hole 0..1, off the centre line -1..1
      lie: 'fairway',
      flight: null,
      wind: (Math.random() - 0.5) * 0.5,
      aim: 0,
      phase: 'aim',
      message: '',
      done: false,
    };

    // Clamped: the last hole finishing pushes state.hole past the end, and
    // draw() still runs for the frame before the results screen takes over.
    const hole = () => HOLES[Math.min(state.hole, HOLES.length - 1)];
    const players = twoPlayer ? 2 : 1;

    function nextTurn(holed) {
      if (holed) {
        const strokes = state.strokes[state.turn];
        state.total[state.turn] += strokes;
        const par = hole().par;
        const name = strokes === 1 ? 'Hole in one!' : strokes < par ? 'Under par' :
          strokes === par ? 'Par' : `+${strokes - par}`;
        toasts.add(name, { color: strokes <= par ? PALETTE.gold : PALETTE.dim, size: 34 });
        Sound[strokes <= par ? 'score' : 'miss']();
        if (strokes <= par) Sound.crowd(0.5);
      }
      if (twoPlayer && !holed) { state.turn = 1 - state.turn; }
      if (holed) {
        state.turn = 0;
        state.hole++;
        state.strokes = [0, 0];
        state.wind = (Math.random() - 0.5) * 0.5;
        if (state.hole >= HOLES.length) { state.done = true; return; }
      }
      state.ball = { along: 0, off: 0 };
      state.lie = 'fairway';
      state.phase = 'aim';
    }

    function strike(event) {
      state.strokes[state.turn]++;
      const h0 = hole();
      // Power from the swing, bend from the angle it travels at, then the lie
      // and the slope take their cut.
      const power = clamp(0.25 + event.power * 0.95);
      const shape = clamp((event.angle + 90) / 120, -1, 1) * 0.35;
      const carry = power * (1 - state.ball.along) * 1.15
        * LIE_CARRY[state.lie] * (1 - h0.rise * 0.3);
      state.flight = {
        t: 0,
        from: { ...state.ball },
        to: {
          along: clamp(state.ball.along + carry, 0, 1.08),
          off: clamp(state.ball.off + state.aim * 0.4 + shape + state.wind * power * 0.4, -1.3, 1.3),
        },
        power,
      };
      state.phase = 'fly';
      Sound.hit(power);
    }

    function settle() {
      const h0 = hole();
      const to = state.flight.to;
      state.ball = { along: clamp(to.along, 0, 1.06), off: to.off };
      state.flight = null;

      const lie = lieAt(h0, state.ball.along, state.ball.off);
      if (lie === 'water') {
        toasts.add('In the water — one back', { color: PALETTE.blue, size: 24 });
        Sound.bounce();
        state.strokes[state.turn]++;
        state.ball.along = Math.max(0, state.ball.along - 0.16);
        state.ball.off = centreAt(h0, state.ball.along);
        state.lie = 'fairway';
      } else {
        state.lie = lie;
        if (lie === 'sand') toasts.add('Bunkered', { color: PALETTE.sand, size: 24 });
        else if (lie === 'rough') toasts.add('In the rough', { color: PALETTE.grassDark, size: 22 });
      }

      // The hole sits at the end of the fairway, wherever the dogleg left it.
      const pinOff = centreAt(h0, 1);
      const distance = Math.hypot(1 - state.ball.along, (state.ball.off - pinOff) * 0.5);
      if (distance < 0.06) { nextTurn(true); return; }
      if (state.strokes[state.turn] >= 9) {
        toasts.add('Picked up', { color: PALETTE.dim, size: 22 });
        nextTurn(true);
        return;
      }
      state.phase = 'aim';
      if (twoPlayer) state.turn = 1 - state.turn;
    }

    return {
      get done() { return state.done; },
      get result() {
        const par = HOLES.reduce((a, b) => a + b.par, 0);
        const diff = state.total[0] - par;
        return {
          score: state.total[0],
          win: diff <= 0,
          detail: `${state.total[0]} strokes (${diff === 0 ? 'par' : diff > 0 ? `+${diff}` : diff})`,
        };
      },

      update(dt, now, events) {
        const body = input.player(twoPlayer ? state.turn : 0);
        if (state.phase === 'aim' && body?.ok) state.aim = lerp(state.aim, body.lean, 0.12);

        if (state.phase === 'fly') {
          state.flight.t += dt * 1.5;
          if (state.flight.t >= 1) settle();
          return;
        }
        for (const e of events) {
          if (e.type !== 'swing') continue;
          if (twoPlayer && e.player !== state.turn) continue;
          if (state.phase !== 'aim') continue;
          strike(e);
        }
      },

      // The hole, drawn once per hole: sky, hills, tree line, fairway, rough
      // and whatever hazard this hole carries.
      course(w, h, holeIndex) {
        const h0 = HOLES[Math.min(holeIndex, HOLES.length - 1)];
        return layer(`golf-${holeIndex}`, w, h, (c) => {
          const horizon = h * 0.42;
          sky(c, w, horizon, '#7fcdf0', '#dcf1fb');
          clouds(c, w, horizon, 31, 6);

          // Hills behind the course.
          const r = rng(holeIndex * 17 + 3);
          for (const [tint, lift, seed] of [['#7cc063', 0.10, 1], ['#6cb152', 0.055, 2]]) {
            c.fillStyle = tint;
            c.beginPath();
            c.moveTo(0, horizon);
            for (let x = 0; x <= w; x += w / 14) {
              c.lineTo(x, horizon - h * lift * (0.4 + Math.sin(x / w * 6 + seed * 2 + r()) * 0.6));
            }
            c.lineTo(w, horizon);
            c.closePath();
            c.fill();
          }

          // Rough either side, then the mown fairway over the top of it.
          c.fillStyle = '#74b84b';
          c.fillRect(0, horizon, w, h - horizon);
          // The fairway is a ribbon down the centre line, not a trapezoid, so
          // a dogleg is visible from the tee as the grass bending away.
          const proj = (t, off) => ({
            x: w * (0.5 + off * lerp(0.4, 0.08, t) + centreAt(h0, t) * lerp(0.4, 0.34, t)),
            y: h * lerp(0.93, 0.43, t),
          });
          c.save();
          c.beginPath();
          for (let i = 0; i <= 24; i++) {
            const t = i / 24;
            const p2 = proj(t, -widthAt(h0, t));
            i ? c.lineTo(p2.x, p2.y) : c.moveTo(p2.x, p2.y);
          }
          for (let i = 24; i >= 0; i--) {
            const t = i / 24;
            const p2 = proj(t, widthAt(h0, t));
            c.lineTo(p2.x, p2.y);
          }
          c.closePath();
          c.clip();
          mownStripes(c, 0, horizon, w, h - horizon, { bands: 13, light: '#8ccc5c', dark: '#7cc04d', skew: 1.7 });
          c.restore();

          // The green: a paler apron around the hole.
          const pin = proj(1, 0);
          c.fillStyle = '#a3d874';
          c.beginPath();
          c.ellipse(pin.x, h * 0.445, w * 0.1, h * 0.022, 0, 0, Math.PI * 2);
          c.fill();

          // A tree line down both sides, smaller toward the horizon.
          for (let i = 0; i < 9; i++) {
            const t = i / 9;
            const yy = horizon + (h - horizon) * Math.pow(t, 1.9) + h * 0.01;
            const size = h * (0.05 + t * 0.2);
            const inset = lerp(w * 0.41, w * 0.06, Math.pow(t, 1.2));
            tree(c, inset - size * 0.3, yy, size, { seed: i * 7 + 1, kind: i % 3 === 0 ? 'pine' : 'round' });
            tree(c, w - inset + size * 0.3, yy, size, { seed: i * 7 + 90, kind: i % 4 === 0 ? 'pine' : 'round' });
          }

          // Every hazard on the hole, each at its own spot and offset.
          for (const hz of h0.hazards) {
            const hp = proj(hz.at, hz.off);
            const hs = lerp(1, 0.25, hz.at);
            if (hz.kind === 'water') {
              c.fillStyle = '#5aa0dd';
              c.beginPath();
              c.ellipse(hp.x, hp.y, w * 0.1 * hz.size * hs, h * 0.028 * hz.size * hs, 0, 0, Math.PI * 2);
              c.fill();
              c.strokeStyle = 'rgba(255,255,255,0.45)';
              c.lineWidth = 1.5;
              for (let i = 0; i < 3; i++) {
                c.beginPath();
                c.ellipse(hp.x + (i - 1) * w * 0.035 * hs, hp.y + (i % 2 - 0.5) * h * 0.01 * hs,
                  w * 0.022 * hs, h * 0.004 * hs, 0, 0, Math.PI * 2);
                c.stroke();
              }
            } else if (hz.kind === 'sand') {
              c.fillStyle = '#f4e1a8';
              c.beginPath();
              c.ellipse(hp.x, hp.y, w * 0.07 * hz.size * hs, h * 0.022 * hz.size * hs, 0, 0, Math.PI * 2);
              c.fill();
              c.strokeStyle = 'rgba(190,165,100,0.6)';
              c.lineWidth = 2;
              c.stroke();
            } else {
              // A clump of trees, sized with distance.
              const tr = rng(Math.round(hz.at * 100 + hz.off * 50));
              for (let i = 0; i < 4; i++) {
                tree(c, hp.x + (tr() - 0.5) * w * 0.1 * hz.size * hs,
                  hp.y + tr() * h * 0.02 * hs, h * 0.16 * hz.size * hs,
                  { seed: i * 11 + 5, kind: i % 2 ? 'pine' : 'round' });
              }
            }
          }

          // Yardage markers down the left edge.
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          for (const t of [0.33, 0.66]) {
            const my = proj(t, 0).y;
            const mx = proj(t, -widthAt(h0, t) * 1.3).x;
            const ms = lerp(1, 0.25, t);
            c.fillStyle = '#f2efe9';
            c.beginPath();
            c.arc(mx, my, 9 * ms + 3, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#2d3b45';
            c.font = `700 ${Math.max(8, 11 * ms + 3)}px system-ui, sans-serif`;
            c.fillText(String(Math.round(h0.length * (1 - t))), mx, my + 1);
          }
        });
      },

      // The hole from above. Tee at the bottom, pin at the top, drawn from
      // the same bend/width/hazard numbers the course itself is built from.
      holeMap(ctx, x, y, mw, mh, h0, ball, lie) {
        ctx.save();
        ctx.fillStyle = PALETTE.paper;
        roundRect(ctx, x, y, mw, mh, 12);
        ctx.fill();
        ctx.strokeStyle = PALETTE.paperEdge;
        ctx.lineWidth = 2;
        ctx.stroke();

        const pad = 12;
        const inner = { x: x + pad, y: y + pad, w: mw - pad * 2, h: mh - pad * 2 };
        // Lateral room for the dogleg: the map squeezes so a hard bend fits.
        const spread = 0.42 / (1 + Math.abs(h0.bend) * 0.8);
        const at = (t, off) => ({
          x: inner.x + inner.w * (0.5 + (off + centreAt(h0, t)) * spread),
          y: inner.y + inner.h * (1 - t),
        });

        ctx.save();
        roundRect(ctx, inner.x, inner.y, inner.w, inner.h, 8);
        ctx.clip();
        ctx.fillStyle = '#74b84b';                       // rough
        ctx.fillRect(inner.x, inner.y, inner.w, inner.h);

        // The fairway as a ribbon.
        ctx.fillStyle = '#9ad56a';
        ctx.beginPath();
        for (let i = 0; i <= 30; i++) {
          const t = i / 30, p = at(t, -widthAt(h0, t));
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
        }
        for (let i = 30; i >= 0; i--) {
          const t = i / 30, p = at(t, widthAt(h0, t));
          ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fill();

        for (const hz of h0.hazards) {
          const p = at(hz.at, hz.off);
          ctx.fillStyle = hz.kind === 'water' ? '#5aa0dd'
            : hz.kind === 'sand' ? '#f4e1a8' : '#4f9e5e';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, inner.w * 0.1 * hz.size, inner.h * 0.035 * hz.size, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // The green, then the pin on it.
        const pin = at(1, 0);
        ctx.fillStyle = '#c3e89b';
        ctx.beginPath();
        ctx.ellipse(pin.x, pin.y + 4, inner.w * 0.1, inner.h * 0.035, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2d3b45';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pin.x, pin.y + 4);
        ctx.lineTo(pin.x, pin.y - 8);
        ctx.stroke();
        ctx.fillStyle = PALETTE.red;
        ctx.beginPath();
        ctx.moveTo(pin.x, pin.y - 8);
        ctx.lineTo(pin.x + 7, pin.y - 5);
        ctx.lineTo(pin.x, pin.y - 2);
        ctx.closePath();
        ctx.fill();

        // Tee box, and your ball where it actually lies.
        const tee = at(0, 0);
        ctx.fillStyle = '#b4c7d6';
        ctx.fillRect(tee.x - 5, tee.y - 6, 10, 6);
        const bp = at(clamp(ball.along), ball.off - centreAt(h0, clamp(ball.along)));
        ctx.fillStyle = '#2d3b45';
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        text(ctx, lie, x + mw / 2, y + mh - 2, { size: 10, color: PALETTE.inkSoft });
        ctx.restore();
      },

      draw(ctx, w, h) {
        ctx.drawImage(this.course(w, h, state.hole), 0, 0, w, h);

        // Matches the course layer exactly: `off` is absolute, so the part of
        // it that is the fairway's own swing is projected wide, and only the
        // player's deviation from the centre line is squeezed.
        const h0c = hole();
        const project = (along, off) => {
          const t = clamp(along);
          const mid = centreAt(h0c, t);
          return {
            x: w * (0.5 + (off - mid) * lerp(0.4, 0.08, t) + mid * lerp(0.4, 0.34, t)),
            y: h * lerp(0.93, 0.43, t),
            s: lerp(1, 0.25, t),
          };
        };
        // The pin is wherever the dogleg finished, not straight ahead.
        const pinOff = centreAt(hole(), 1);

        // Flag.
        const flag = project(1, pinOff);
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(flag.x, flag.y);
        ctx.lineTo(flag.x, flag.y - 42);
        ctx.stroke();
        // The flag flies with the wind, and flutters: the one place the wind
        // reading on the HUD becomes something you can see.
        const gust = Math.sin(performance.now() / 180) * 3;
        const fly = Math.sign(state.wind || 1) * (10 + Math.abs(state.wind) * 34);
        ctx.fillStyle = PALETTE.red;
        ctx.beginPath();
        ctx.moveTo(flag.x, flag.y - 42);
        ctx.quadraticCurveTo(flag.x + fly * 0.6, flag.y - 44 + gust, flag.x + fly, flag.y - 36 + gust);
        ctx.quadraticCurveTo(flag.x + fly * 0.5, flag.y - 32 - gust, flag.x, flag.y - 26);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#1b2a1b';
        ctx.beginPath();
        ctx.ellipse(flag.x, flag.y, 9, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ball, on the ground or in the air.
        let bp;
        if (state.flight) {
          const t = state.flight.t;
          const along = lerp(state.flight.from.along, state.flight.to.along, t);
          const off = lerp(state.flight.from.off, state.flight.to.off, t);
          bp = project(along, off);
          bp.y -= Math.sin(t * Math.PI) * h * 0.3 * state.flight.power;
        } else {
          bp = project(state.ball.along, state.ball.off);
        }
        ctx.fillStyle = PALETTE.ink;
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, Math.max(3, 8 * bp.s), 0, Math.PI * 2);
        ctx.fill();

        // You at address, seen from behind and off to the side, with the club
        // running down to the ball.
        if (!state.flight) {
          const body = input.player(twoPlayer ? state.turn : 0);
          const ground = project(state.ball.along, state.ball.off);
          const rightHanded = CONFIG.handedness !== 'left';
          const side = rightHanded ? -1 : 1;
          const youH = h * 0.62 * Math.max(0.42, ground.s);
          const youX = ground.x + side * youH * 0.42;
          const youY = ground.y + youH * 0.06;

          if (body?.ok) drawAvatar(ctx, body, { x: youX, y: youY, height: youH, back: true });

          const hand = body?.ok
            ? (body.hands.right.y < body.hands.left.y ? body.hands.right : body.hands.left)
            : null;
          const lift = hand ? clamp((0.62 - hand.y) * 2) : 0.15;
          const gripX = youX - side * youH * 0.1;
          const gripY = youY - youH * (0.5 + lift * 0.25);

          ctx.save();
          ctx.strokeStyle = '#b9cbd8';
          ctx.lineWidth = Math.max(2.5, youH * 0.022);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(gripX, gripY);
          ctx.lineTo(ground.x, ground.y - 2);
          ctx.stroke();
          ctx.save();
          ctx.translate(ground.x, ground.y);
          ctx.rotate(rightHanded ? 0.2 : -0.2);
          ctx.fillStyle = '#2d3b45';
          roundRect(ctx, -youH * 0.1, -youH * 0.055, youH * 0.17, youH * 0.08, youH * 0.025);
          ctx.fill();
          ctx.restore();
          ctx.restore();
        }

        // Aim line, only while you are stood over the ball.
        if (state.phase === 'aim') {
          const target = project(clamp(state.ball.along + 0.3), state.ball.off + state.aim * 0.4);
          ctx.strokeStyle = 'rgba(231,193,92,0.6)';
          ctx.setLineDash([6, 6]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(bp.x, bp.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // A light panel carries the readouts; this style never darkens.
        ctx.fillStyle = PALETTE.paper;
        roundRect(ctx, w / 2 - 150, 14, 300, 50, 14);
        ctx.fill();

        const h0 = hole();
        text(ctx, `Hole ${state.hole + 1} of ${HOLES.length}`, w / 2, 32, { size: 18, weight: 700, color: PALETTE.ink });
        text(ctx, `${h0.name} · ${h0.length} yds · par ${h0.par}`, w / 2, 52, { size: 13, color: PALETTE.inkSoft });
        ctx.fillStyle = PALETTE.paper;
        roundRect(ctx, 18, 14, 124, twoPlayer ? 52 : 34, 10);
        ctx.fill();
        text(ctx, `Strokes ${state.strokes[state.turn]}`, 30, 31, { size: 15, align: 'left', color: PALETTE.ink });
        if (twoPlayer) text(ctx, `Player ${state.turn + 1}`, 30, 52, { size: 12, align: 'left', color: PALETTE.inkSoft });

        const windDir = state.wind > 0 ? '→' : '←';
        ctx.fillStyle = PALETTE.paper;
        roundRect(ctx, w - 150, 14, 132, 34, 10);
        ctx.fill();
        text(ctx, `wind ${windDir} ${Math.abs(state.wind * 20).toFixed(0)} mph`, w - 84, 31,
          { size: 13, color: PALETTE.ink });

        this.holeMap(ctx, w - 162, 60, 144, h * 0.46, h0, state.ball, state.lie);
      },
    };
  },
};
