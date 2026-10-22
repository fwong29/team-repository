// golf.js: three holes, one swing at a time.
//
// What the body does: a vertical swing. How high the hand got on the backswing
// is power, and the angle the hand is travelling at the bottom bends the ball
// left or right. Lean to aim before you swing. Wind pushes every shot.

import { PALETTE, text, drawMeter, roundRect, drawAvatar } from '../ui.js';
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

      draw(ctx, w, h) {
        const sky = ctx.createLinearGradient(0, 0, 0, h * 0.5);
        sky.addColorStop(0, PALETTE.sky);
        sky.addColorStop(1, '#6d7f8e');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h * 0.42);
        ctx.fillStyle = PALETTE.grassDark;
        ctx.fillRect(0, h * 0.42, w, h * 0.58);

        // The fairway, running up the screen into the distance.
        ctx.fillStyle = PALETTE.grass;
        ctx.beginPath();
        ctx.moveTo(w * 0.1, h);
        ctx.lineTo(w * 0.9, h);
        ctx.lineTo(w * 0.58, h * 0.42);
        ctx.lineTo(w * 0.42, h * 0.42);
        ctx.closePath();
        ctx.fill();

        const project = (along, off) => {
          const t = clamp(along);
          const width = lerp(0.4, 0.08, t);
          return { x: w * (0.5 + off * width), y: h * lerp(0.98, 0.43, t), s: lerp(1, 0.25, t) };
        };

        const haz = hole().hazard;
        if (haz) {
          const p = project(haz.at, 0);
          ctx.fillStyle = haz.kind === 'water' ? PALETTE.court : PALETTE.sand;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, w * 0.16 * p.s, h * 0.035 * p.s, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Flag.
        const flag = project(1, 0);
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(flag.x, flag.y);
        ctx.lineTo(flag.x, flag.y - 42);
        ctx.stroke();
        ctx.fillStyle = PALETTE.red;
        ctx.beginPath();
        ctx.moveTo(flag.x, flag.y - 42);
        ctx.lineTo(flag.x + 22, flag.y - 34);
        ctx.lineTo(flag.x, flag.y - 26);
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
            drawAvatar(ctx, body, {
              x: ground.x - 42 * ground.s,
              y: ground.y + 6 * ground.s,
              height: h * 0.3 * ground.s,
            });
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
