// golf.js: three holes, one swing at a time.
//
// What the body does: a vertical swing. How high the hand got on the backswing
// is power, and the angle the hand is travelling at the bottom bends the ball
// left or right. Lean to aim before you swing. Wind pushes every shot.

import { PALETTE, text, drawMeter, roundRect, drawAvatar } from '../ui.js';
import { layer, sky, clouds, tree, mownStripes, rng } from '../scenery.js';
import { clamp, lerp } from '../filters.js';
import { Sound } from '../audio.js';

const HOLES = [
  { length: 230, par: 3, hazard: null },
  { length: 320, par: 4, hazard: { at: 0.55, width: 0.09, kind: 'water' } },
  { length: 410, par: 4, hazard: { at: 0.68, width: 0.12, kind: 'sand' } },
];

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

  create({ input, toasts, twoPlayer, difficulty }) {
    const state = {
      hole: 0,
      turn: 0,
      strokes: [0, 0],
      total: [0, 0],
      ball: { along: 0, off: 0 },   // along the fairway 0..1, off the line -1..1
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
      state.phase = 'aim';
    }

    function strike(event) {
      state.strokes[state.turn]++;
      // Power from the speed of the swing, bend from the angle it travels at.
      const power = clamp(0.25 + event.power * 0.95);
      const bend = clamp((event.angle + 90) / 120, -1, 1) * 0.35;
      const carry = power * (1 - state.ball.along) * 1.15;
      state.flight = {
        t: 0,
        from: { ...state.ball },
        to: {
          along: clamp(state.ball.along + carry, 0, 1.08),
          off: clamp(state.ball.off + state.aim * 0.4 + bend + state.wind * power * 0.4, -1, 1),
        },
        power,
      };
      state.phase = 'fly';
      Sound.hit(power);
    }

    function settle() {
      const to = state.flight.to;
      state.ball = { along: clamp(to.along, 0, 1.04), off: to.off };
      state.flight = null;

      const h = hole();
      if (h.hazard && Math.abs(state.ball.along - h.hazard.at) < h.hazard.width / 2 && Math.abs(state.ball.off) < 0.45) {
        if (h.hazard.kind === 'water') {
          toasts.add('In the water — one back', { color: PALETTE.blue, size: 24 });
          Sound.bounce();
          state.strokes[state.turn]++;
          state.ball.along = Math.max(0, h.hazard.at - 0.12);
        } else {
          toasts.add('Bunkered', { color: PALETTE.sand, size: 24 });
        }
      }

      const distance = Math.hypot(1 - state.ball.along, state.ball.off * 0.5);
      if (distance < 0.06) { nextTurn(true); return; }
      if (state.strokes[state.turn] >= 8) {
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
          sky(c, w, horizon, '#5f7fa8', '#c3cbd0');
          clouds(c, w, horizon, 31, 6);

          // Hills behind the course.
          const r = rng(holeIndex * 17 + 3);
          for (const [tint, lift, seed] of [['#54705a', 0.10, 1], ['#47664f', 0.055, 2]]) {
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
          c.fillStyle = '#3d7047';
          c.fillRect(0, horizon, w, h - horizon);
          c.save();
          c.beginPath();
          c.moveTo(w * 0.08, h);
          c.lineTo(w * 0.92, h);
          c.lineTo(w * 0.575, horizon);
          c.lineTo(w * 0.425, horizon);
          c.closePath();
          c.clip();
          mownStripes(c, 0, horizon, w, h - horizon, { bands: 13, light: '#58995f', dark: '#4d8a56', skew: 1.7 });
          c.restore();

          // The green: a paler apron around the hole.
          c.fillStyle = '#6fae71';
          c.beginPath();
          c.ellipse(w / 2, h * 0.445, w * 0.1, h * 0.022, 0, 0, Math.PI * 2);
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

          // The hazard, in perspective at its spot up the fairway.
          if (h0.hazard) {
            const t = h0.hazard.at;
            const width = lerp(0.4, 0.08, t);
            const hx = w * 0.5, hy = h * lerp(0.93, 0.43, t), hs = lerp(1, 0.25, t);
            if (h0.hazard.kind === 'water') {
              c.fillStyle = '#3f6f9e';
              c.beginPath();
              c.ellipse(hx, hy, w * 0.17 * hs, h * 0.035 * hs, 0, 0, Math.PI * 2);
              c.fill();
              c.strokeStyle = 'rgba(255,255,255,0.35)';
              c.lineWidth = 1.5;
              for (let i = 0; i < 4; i++) {           // ripples
                c.beginPath();
                c.ellipse(hx + (i - 1.5) * w * 0.05 * hs, hy + (i % 2 - 0.5) * h * 0.012 * hs,
                  w * 0.03 * hs, h * 0.004 * hs, 0, 0, Math.PI * 2);
                c.stroke();
              }
            } else {
              c.fillStyle = '#d8c187';
              c.beginPath();
              c.ellipse(hx, hy, w * 0.16 * hs, h * 0.035 * hs, 0, 0, Math.PI * 2);
              c.fill();
              c.strokeStyle = 'rgba(160,140,90,0.5)';
              c.lineWidth = 2;
              c.beginPath();
              c.ellipse(hx, hy, w * 0.16 * hs, h * 0.035 * hs, 0, 0, Math.PI * 2);
              c.stroke();
            }
          }

          // Yardage markers down the left edge.
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          for (const t of [0.33, 0.66]) {
            const my = h * lerp(0.93, 0.43, t);
            const mx = w * (0.5 - lerp(0.4, 0.08, t) * 0.92);
            const ms = lerp(1, 0.25, t);
            c.fillStyle = '#f2efe9';
            c.beginPath();
            c.arc(mx, my, 9 * ms + 3, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#2f3a2f';
            c.font = `700 ${Math.max(8, 11 * ms + 3)}px system-ui, sans-serif`;
            c.fillText(String(Math.round(h0.length * (1 - t))), mx, my + 1);
          }
        });
      },

      draw(ctx, w, h) {
        ctx.drawImage(this.course(w, h, state.hole), 0, 0, w, h);

        const project = (along, off) => {
          const t = clamp(along);
          const width = lerp(0.4, 0.08, t);
          return { x: w * (0.5 + off * width), y: h * lerp(0.93, 0.43, t), s: lerp(1, 0.25, t) };
        };

        // Flag.
        const flag = project(1, 0);
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

        // The golfer, stood over the ball and shrinking with it into the
        // distance, so the perspective holds as the ball moves up the hole.
        if (!state.flight) {
          const body = input.player(twoPlayer ? state.turn : 0);
          const ground = project(state.ball.along, state.ball.off);
          if (body?.ok) {
            const gx = ground.x - 42 * ground.s;
            drawAvatar(ctx, body, { x: gx, y: ground.y + 6 * ground.s, height: h * 0.3 * ground.s });
            // The club: shaft from the hands down to the ball, with a head.
            ctx.save();
            ctx.strokeStyle = '#cfd4da';
            ctx.lineWidth = Math.max(1.5, 3 * ground.s);
            ctx.beginPath();
            ctx.moveTo(gx + 14 * ground.s, ground.y - h * 0.17 * ground.s);
            ctx.lineTo(ground.x - 4 * ground.s, ground.y + 2 * ground.s);
            ctx.stroke();
            ctx.fillStyle = '#9aa3ad';
            roundRect(ctx, ground.x - 12 * ground.s, ground.y - 2 * ground.s,
              14 * ground.s, 7 * ground.s, 2 * ground.s);
            ctx.fill();
            ctx.restore();
          }
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

        // A dark band so the readouts survive against a bright sky.
        const band = ctx.createLinearGradient(0, 0, 0, 86);
        band.addColorStop(0, 'rgba(10,12,16,0.62)');
        band.addColorStop(1, 'rgba(10,12,16,0)');
        ctx.fillStyle = band;
        ctx.fillRect(0, 0, w, 86);

        const h0 = hole();
        text(ctx, `Hole ${state.hole + 1} of ${HOLES.length}`, w / 2, 32, { size: 18, weight: 600 });
        text(ctx, `${h0.length} yds · par ${h0.par}`, w / 2, 54, { size: 13, color: PALETTE.dim });
        text(ctx, `Strokes ${state.strokes[state.turn]}`, 24, 32, { size: 16, align: 'left' });
        if (twoPlayer) text(ctx, `Player ${state.turn + 1}`, 24, 54, { size: 13, align: 'left', color: PALETTE.gold });

        const windDir = state.wind > 0 ? '→' : '←';
        text(ctx, `wind ${windDir} ${Math.abs(state.wind * 20).toFixed(0)} mph`, w - 24, 32,
          { size: 13, align: 'right', color: PALETTE.dim });
      },
    };
  },
};
