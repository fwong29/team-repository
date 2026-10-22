// tennis.js: a rally. The ball comes at you, you swing, it goes back.
//
// What the body does: swing direction across the torso decides forehand or
// backhand and which way the ball leaves. Swing speed is power. Stepping
// toward or away from the screen — the HC-SR04's job — moves you up and down
// the court, which changes how early you have to swing.

import { PALETTE, text, drawScorebar, drawMeter, drawAvatar, roundRect } from '../ui.js';
import { clamp, lerp } from '../filters.js';
import { Sound } from '../audio.js';

const WIN = 5;

export const tennis = {
  id: 'tennis',
  label: 'Tennis',
  note: 'Swing to rally',
  twoPlayerStyle: 'live', // player two takes the far side of the court
  tutorial: [
    'Stand side-on, arm free.',
    'Swing across your body as the ball arrives.',
    'Swing early for cross-court, late to go down the line.',
    'Step forward to move up the court, back to retreat.',
  ],
  icon(ctx, x, y, r) {
    ctx.save();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.2, r * 0.52, r * 0.68, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.48);
    ctx.lineTo(x, y + r);
    ctx.stroke();
    ctx.restore();
  },

  create({ input, toasts, twoPlayer, difficulty }) {
    const ai = [{ speed: 0.55, error: 0.30 }, { speed: 0.75, error: 0.18 }, { speed: 0.92, error: 0.09 }][difficulty];
    const state = {
      ball: { x: 0.5, y: 0.5, vx: 0, vy: 0, height: 0, owner: 'far' },
      scores: [0, 0],
      rally: 0,
      serveIn: 1.2,
      court: 0.5,          // where the player stands, near to far
      farX: 0.5,
      message: 'Get ready',
      shake: 0,
      done: false,
    };

    function serve(toNear = true) {
      state.ball = {
        x: 0.35 + Math.random() * 0.3,
        y: toNear ? 0.22 : 0.78,
        vx: (Math.random() - 0.5) * 0.12,
        vy: toNear ? 0.52 : -0.52,
        height: 0.4,
        owner: toNear ? 'near' : 'far',
      };
      state.rally = 0;
      Sound.bounce();
    }

    function point(who) {
      state.scores[who]++;
      Sound[who === 0 ? 'score' : 'miss']();
      if (who === 0) Sound.crowd(0.6);
      state.message = who === 0 ? 'Your point' : (twoPlayer ? 'Their point' : 'Point against');
      toasts.add(state.message, { color: who === 0 ? PALETTE.gold : PALETTE.red });
      state.serveIn = 1.4;
      if (Math.max(...state.scores) >= WIN) state.done = true;
    }

    // A swing connects when the ball is inside the hitting band in front of
    // the player. The band is generous on purpose: an unplayable game is a
    // failed game, and the timing still decides where the ball goes.
    function tryHit(event) {
      if (state.ball.owner !== 'near') return;
      const reach = 0.22;
      const dy = Math.abs(state.ball.y - (0.82 - state.court * 0.2));
      if (dy > reach) {
        toasts.add('Too early', { color: PALETTE.dim, size: 22, y: 0.6 });
        return;
      }
      const timing = 1 - dy / reach;             // 1 is dead centre of the band
      const aim = clamp(0.5 + event.dirX * (0.18 + event.power * 0.3) + (Math.random() - 0.5) * 0.06);
      state.ball.vx = (aim - state.ball.x) * 1.5;
      state.ball.vy = -(0.42 + event.power * 0.5 + timing * 0.2);
      state.ball.owner = 'far';
      state.ball.height = 0.35 + event.power * 0.4;
      state.rally++;
      state.shake = 0.35 + event.power * 0.4;
      Sound.hit(event.power);
      const shot = event.dirX > 0 ? 'Forehand' : 'Backhand';
      toasts.add(timing > 0.72 ? `${shot}!` : shot, {
        color: timing > 0.72 ? PALETTE.gold : PALETTE.ink, size: 26, y: 0.62,
      });
    }

    function farSideReturns(dt) {
      // Player two, when there is one; otherwise the computer.
      if (twoPlayer) {
        const body = input.player(1);
        if (body?.ok) state.farX = lerp(state.farX, clamp(body.centre.x), 0.15);
        return;
      }
      const target = state.ball.x;
      state.farX = lerp(state.farX, target, ai.speed * dt * 4);
    }

    return {
      get done() { return state.done; },
      get result() {
        return {
          score: state.scores[0],
          win: state.scores[0] > state.scores[1],
          detail: `${state.scores[0]} – ${state.scores[1]}`,
        };
      },

      update(dt, now, events) {
        state.shake = Math.max(0, state.shake - dt * 2.5);
        state.court = lerp(state.court, input.depth01, 0.1);

        if (state.serveIn > 0) {
          state.serveIn -= dt;
          if (state.serveIn <= 0) serve(true);
          return;
        }

        for (const e of events) {
          if (e.type !== 'swing') continue;
          if (e.player === 0) tryHit(e);
          else if (twoPlayer && state.ball.owner === 'far') {
            state.ball.vy = 0.45 + e.power * 0.5;
            state.ball.vx = (clamp(0.5 + e.dirX * 0.3) - state.ball.x) * 1.5;
            state.ball.owner = 'near';
            state.rally++;
            Sound.hit(e.power);
          }
        }

        const b = state.ball;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.height = Math.max(0, b.height - dt * 0.55);
        if (b.x < 0.06 || b.x > 0.94) b.vx *= -1;

        farSideReturns(dt);

        if (b.owner === 'far' && b.y < 0.2) {
          // The far side plays it back, with an error that shrinks as the
          // difficulty rises. A miss is a point for the player.
          const miss = twoPlayer ? false : Math.random() < ai.error * (1 + state.rally * 0.04);
          if (miss) { point(0); state.serveIn = 1.3; }
          else if (!twoPlayer) {
            b.vy = 0.46 + Math.random() * 0.22;
            b.vx = (clamp(0.5 + (Math.random() - 0.5) * 0.7) - b.x) * 1.4;
            b.owner = 'near';
            b.height = 0.4;
            state.rally++;
            Sound.hit(0.5);
          }
        }
        if (b.owner === 'near' && b.y > 0.97) { point(1); }
        if (b.owner === 'far' && b.y < 0.03) { point(twoPlayer ? 0 : 0); }
      },

      draw(ctx, w, h) {
        const shake = state.shake * 6;
        ctx.save();
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

        // Court: a trapezoid, wide at the near end.
        ctx.fillStyle = PALETTE.court;
        ctx.beginPath();
        ctx.moveTo(w * 0.1, h);
        ctx.lineTo(w * 0.9, h);
        ctx.lineTo(w * 0.66, h * 0.16);
        ctx.lineTo(w * 0.34, h * 0.16);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w * 0.22, h * 0.56);
        ctx.lineTo(w * 0.78, h * 0.56);
        ctx.stroke();

        const farY = h * 0.2;
        ctx.fillStyle = PALETTE.red;
        ctx.beginPath();
        ctx.arc(w * state.farX, farY, 16, 0, Math.PI * 2);
        ctx.fill();

        const nearY = h * (0.82 - state.court * 0.2);
        const body = input.player(0);
        if (body?.ok) drawAvatar(ctx, body, { x: w * 0.5, y: nearY + h * 0.1, height: h * 0.26 });
        else {
          ctx.fillStyle = PALETTE.blue;
          ctx.beginPath();
          ctx.arc(w * 0.5, nearY, 20, 0, Math.PI * 2);
          ctx.fill();
        }

        // The hitting band, so the timing is something you can see and learn.
        ctx.strokeStyle = 'rgba(231,193,92,0.35)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(w * 0.12, nearY - h * 0.22);
        ctx.lineTo(w * 0.88, nearY - h * 0.22);
        ctx.moveTo(w * 0.12, Math.min(h - 2, nearY + h * 0.22));
        ctx.lineTo(w * 0.88, Math.min(h - 2, nearY + h * 0.22));
        ctx.stroke();
        ctx.setLineDash([]);

        const b = state.ball;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(b.x * w, b.y * h, 11, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.gold;
        ctx.beginPath();
        ctx.arc(b.x * w, b.y * h - b.height * h * 0.12, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        drawScorebar(ctx, w, { name: 'You', score: state.scores[0] },
          { name: twoPlayer ? 'Player 2' : 'Computer', score: state.scores[1] });
        if (state.rally > 2) text(ctx, `Rally ${state.rally}`, w / 2, 92, { size: 15, color: PALETTE.dim });

        drawMeter(ctx, 24, h - 44, 160, 14, state.court, PALETTE.blue);
        text(ctx, 'court position', 104, h - 58, { size: 11, color: PALETTE.dim });
        if (state.serveIn > 0) text(ctx, 'Get ready', w / 2, h * 0.42, { size: 42, weight: 700 });
      },
    };
  },
};
