// basketball.js: a timed shootout.
//
// What the body does: both hands come up from the chest and push out. How fast
// they leave is power, how bent the elbows are at release is the arc. The hoop
// moves further away each time you make one, so a shot that worked once will
// not keep working.

import { PALETTE, text, drawMeter, roundRect, drawAvatar } from '../ui.js';
import { layer, stand, hardwood, scoreboard } from '../scenery.js';
import { clamp, lerp } from '../filters.js';
import { Sound } from '../audio.js';

const ROUND_SECONDS = 60;

export const basketball = {
  id: 'basketball',
  label: 'Basketball',
  note: 'Push the shot up',
  twoPlayerStyle: 'turns',
  tutorial: [
    'Hold both hands at chest height.',
    'Push up and out to shoot.',
    'Push harder for the longer shots.',
    'Keep your elbows bent for a higher arc.',
  ],
  icon(ctx, x, y, r) {
    ctx.save();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = r * 0.13;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.68, y);
    ctx.lineTo(x + r * 0.68, y);
    ctx.moveTo(x, y - r * 0.68);
    ctx.lineTo(x, y + r * 0.68);
    ctx.stroke();
    ctx.restore();
  },

  create({ input, toasts, twoPlayer, difficulty }) {
    const forgiveness = [0.30, 0.22, 0.15][difficulty]; // how far off power can be
    const state = {
      time: ROUND_SECONDS,
      scores: [0, 0],
      made: [0, 0],
      taken: [0, 0],
      turn: 0,
      spot: 0.35,         // 0 is under the hoop, 1 is a long way out
      shot: null,
      streak: 0,
      done: false,
    };

    // Each spot needs its own push. This is the whole game: read the distance,
    // match the effort.
    const neededPower = () => 0.3 + state.spot * 0.6;
    const worth = () => (state.spot > 0.62 ? 3 : 2);

    function shoot(event) {
      if (state.shot) return;
      const need = neededPower();
      const off = event.power - need;
      const good = Math.abs(off) < forgiveness && event.arc > 0.25;
      state.taken[state.turn]++;
      state.shot = { t: 0, good, power: event.power, arc: event.arc, worth: worth(), off };
      Sound.whoosh(0.5 + event.power * 0.4);
    }

    function land() {
      const shot = state.shot;
      if (shot.good) {
        state.scores[state.turn] += shot.worth;
        state.made[state.turn]++;
        state.streak++;
        Sound.swish();
        if (state.streak >= 3) { Sound.crowd(0.8); toasts.add(`${state.streak} in a row!`, { color: PALETTE.gold, size: 36 }); }
        else toasts.add(shot.worth === 3 ? 'Three!' : 'Bucket', { color: PALETTE.gold, size: 32 });
        // Step back after a make.
        state.spot = clamp(state.spot + 0.12 + Math.random() * 0.1, 0.2, 0.95);
      } else {
        state.streak = 0;
        Sound.bounce();
        toasts.add(shot.off > 0 ? 'Long' : (shot.arc <= 0.25 ? 'Too flat' : 'Short'),
          { color: PALETTE.dim, size: 24 });
        state.spot = clamp(state.spot - 0.08, 0.2, 0.95);
      }
      state.shot = null;
      if (twoPlayer) state.turn = 1 - state.turn;
    }

    return {
      get done() { return state.done; },
      get result() {
        const pct = state.taken[0] ? Math.round((state.made[0] / state.taken[0]) * 100) : 0;
        return {
          score: state.scores[0],
          win: twoPlayer ? state.scores[0] >= state.scores[1] : state.scores[0] >= 12,
          detail: `${state.scores[0]} points · ${state.made[0]}/${state.taken[0]} (${pct}%)`,
        };
      },

      update(dt, now, events) {
        state.time -= dt;
        if (state.time <= 0) { state.time = 0; state.done = true; Sound.whistle(); return; }

        for (const e of events) {
          if (e.type !== 'shoot') continue;
          if (twoPlayer && e.player !== state.turn) continue;
          shoot(e);
        }
        if (state.shot) {
          state.shot.t += dt * 1.6;
          if (state.shot.t >= 1) land();
        }
      },

      // The gym: stands, hardwood, every painted line, and the hoop. Static.
      gym(w, h) {
        return layer('gym', w, h, (c) => {
          const floorY = h * 0.52;

          // Dark roof and the stands behind the baseline.
          c.fillStyle = '#14161d';
          c.fillRect(0, 0, w, floorY);
          stand(c, 0, h * 0.12, w, h * 0.4, { seed: 55, rows: 7, deck: '#242832', dim: 0.1 });
          c.fillStyle = '#2a2f3a';
          c.fillRect(0, h * 0.5, w, h * 0.025);         // the barrier at courtside

          // Hardwood, warm and boarded.
          hardwood(c, 0, floorY, w, h - floorY, { seed: 3, base: '#c08a46' });
          const glow = c.createLinearGradient(0, floorY, 0, h);
          glow.addColorStop(0, 'rgba(255,230,180,0.16)');
          glow.addColorStop(1, 'rgba(90,50,10,0.3)');
          c.fillStyle = glow;
          c.fillRect(0, floorY, w, h - floorY);

          // The painted lines. Everything is an ellipse or a trapezoid,
          // because the court is seen from behind the shooter.
          const line = (fn, width = 3, colour = 'rgba(248,246,240,0.85)') => {
            c.strokeStyle = colour;
            c.lineWidth = width;
            c.beginPath();
            fn();
            c.stroke();
          };

          // The paint, in team colour, narrowing toward the baseline.
          c.fillStyle = 'rgba(40,96,160,0.72)';
          c.beginPath();
          c.moveTo(w * 0.5 - w * 0.085, floorY + h * 0.02);
          c.lineTo(w * 0.5 + w * 0.085, floorY + h * 0.02);
          c.lineTo(w * 0.5 + w * 0.15, h * 0.86);
          c.lineTo(w * 0.5 - w * 0.15, h * 0.86);
          c.closePath();
          c.fill();
          line(() => {
            c.moveTo(w * 0.5 - w * 0.085, floorY + h * 0.02);
            c.lineTo(w * 0.5 + w * 0.085, floorY + h * 0.02);
            c.lineTo(w * 0.5 + w * 0.15, h * 0.86);
            c.lineTo(w * 0.5 - w * 0.15, h * 0.86);
            c.closePath();
          });

          // Free-throw circle at the top of the key.
          line(() => c.ellipse(w / 2, h * 0.86, w * 0.1, h * 0.035, 0, 0, Math.PI * 2));
          // Restricted arc under the rim.
          line(() => c.ellipse(w / 2, floorY + h * 0.05, w * 0.045, h * 0.016, 0, 0, Math.PI), 2);
          // Baseline, and the three-point arc running out to it.
          line(() => { c.moveTo(0, floorY + h * 0.015); c.lineTo(w, floorY + h * 0.015); });
          line(() => c.ellipse(w / 2, floorY + h * 0.04, w * 0.42, h * 0.33, 0, 0.08 * Math.PI, 0.92 * Math.PI), 3.5);

          // Backboard, on its post, with a rim and a net.
          c.fillStyle = '#3a414c';
          c.fillRect(w / 2 - 5, h * 0.06, 10, h * 0.2);
          c.fillStyle = 'rgba(236,240,245,0.92)';
          roundRect(c, w / 2 - 62, h * 0.21 - 70, 124, 82, 5);
          c.fill();
          c.strokeStyle = '#d4604f';
          c.lineWidth = 4;
          c.strokeRect(w / 2 - 62, h * 0.21 - 70, 124, 82);
          c.strokeRect(w / 2 - 25, h * 0.21 - 36, 50, 36);   // the shooter's square
          c.beginPath();                                      // rim
          c.ellipse(w / 2, h * 0.3 + 12, 33, 10, 0, 0, Math.PI * 2);
          c.stroke();
          c.strokeStyle = 'rgba(248,246,240,0.75)';
          c.lineWidth = 1.5;
          for (let i = -4; i <= 4; i++) {                     // net
            c.beginPath();
            c.moveTo(w / 2 + i * 8, h * 0.3 + 12);
            c.lineTo(w / 2 + i * 4.5, h * 0.3 + 46);
            c.stroke();
          }
          for (let row = 1; row <= 2; row++) {                // net cross-weave
            const yy = h * 0.3 + 12 + row * 15;
            c.beginPath();
            c.ellipse(w / 2, yy, 33 - row * 9, 7 - row * 2, 0, 0, Math.PI);
            c.stroke();
          }
        });
      },

      draw(ctx, w, h) {
        ctx.drawImage(this.gym(w, h), 0, 0, w, h);
        const hoopX = w / 2, hoopY = h * 0.3;

        // Where you are shooting from.
        const shooterY = lerp(h * 0.74, h * 0.94, state.spot);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(hoopX, shooterY + 8, 44, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        if (state.shot) {
          const t = state.shot.t;
          const x = lerp(hoopX, hoopX + (state.shot.good ? 0 : state.shot.off * 90), t);
          const peak = lerp(0.35, 0.95, state.shot.arc);
          const y = lerp(shooterY, state.shot.good ? hoopY + 12 : hoopY + 70, t) -
            Math.sin(t * Math.PI) * h * 0.3 * peak;
          const spin = t * 7;
          const ball = ctx.createRadialGradient(x - 5, y - 6, 2, x, y, 17);
          ball.addColorStop(0, '#f0a055');
          ball.addColorStop(1, '#c86f22');
          ctx.fillStyle = ball;
          ctx.beginPath();
          ctx.arc(x, y, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(spin);
          ctx.strokeStyle = '#4a2a12';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(0, 0, 16, 0, Math.PI * 2);
          ctx.moveTo(-16, 0);
          ctx.lineTo(16, 0);
          ctx.moveTo(0, -16);
          ctx.lineTo(0, 16);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(0, 0, 7, 16, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // The shooter.
        const shooter = input.player(twoPlayer ? state.turn : 0);
        if (shooter?.ok && !state.shot) {
          drawAvatar(ctx, shooter, { x: hoopX, y: shooterY + 6, height: h * 0.34 });
        }

        // Distance and the push it needs, down the left so the shooter is not
        // standing in the middle of the text. On a panel, or the hardwood
        // swallows it.
        ctx.fillStyle = 'rgba(10,12,16,0.62)';
        roundRect(ctx, 16, h - 118, 212, 102, 10);
        ctx.fill();
        const metres = (3 + state.spot * 6).toFixed(1);
        text(ctx, `${metres} m`, 28, h - 96, { size: 20, align: 'left', weight: 600 });
        text(ctx, worth() === 3 ? 'three-point range' : 'inside the arc', 28, h - 74,
          { size: 12, align: 'left', color: worth() === 3 ? PALETTE.gold : PALETTE.dim });
        drawMeter(ctx, 28, h - 56, 180, 12, neededPower(), PALETTE.gold);
        text(ctx, 'push this hard', 28, h - 30, { size: 11, align: 'left', color: PALETTE.dim });

        const mins = Math.floor(state.time / 60), secs = Math.floor(state.time % 60);
        text(ctx, `${mins}:${String(secs).padStart(2, '0')}`, w / 2, 36, { size: 30, weight: 700 });
        text(ctx, String(state.scores[0]), 40, 40, { size: 30, weight: 700, align: 'left' });
        if (twoPlayer) {
          text(ctx, String(state.scores[1]), w - 40, 40, { size: 30, weight: 700, align: 'right' });
          text(ctx, `Player ${state.turn + 1}`, w / 2, 62, { size: 13, color: PALETTE.gold });
        }
      },
    };
  },
};
