// basketball.js: a timed shootout.
//
// What the body does: both hands come up from the chest and push out. How fast
// they leave is power, how bent the elbows are at release is the arc. The hoop
// moves further away each time you make one, so a shot that worked once will
// not keep working.

import { PALETTE, text, drawMeter, roundRect, drawAvatar } from '../ui.js';
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

      draw(ctx, w, h) {
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#30364a');
        sky.addColorStop(1, '#5a4336');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#7a5742';
        ctx.fillRect(0, h * 0.62, w, h * 0.38);
        ctx.strokeStyle = 'rgba(242,239,233,0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(w / 2, h * 0.68, w * 0.3, h * 0.07, 0, 0, Math.PI);
        ctx.stroke();

        // Backboard and rim.
        const hoopX = w / 2, hoopY = h * 0.3;
        ctx.fillStyle = 'rgba(242,239,233,0.85)';
        roundRect(ctx, hoopX - 58, hoopY - 66, 116, 76, 4);
        ctx.fill();
        ctx.strokeStyle = PALETTE.red;
        ctx.lineWidth = 4;
        ctx.strokeRect(hoopX - 24, hoopY - 34, 48, 34);
        ctx.beginPath();
        ctx.ellipse(hoopX, hoopY + 12, 32, 9, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(242,239,233,0.6)';
        ctx.lineWidth = 1.5;
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(hoopX + i * 10, hoopY + 12);
          ctx.lineTo(hoopX + i * 6, hoopY + 42);
          ctx.stroke();
        }

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
          ctx.fillStyle = '#d9792f';
          ctx.beginPath();
          ctx.arc(x, y, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#3a2416';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(x, y, 15, 0, Math.PI * 2);
          ctx.moveTo(x - 15, y);
          ctx.lineTo(x + 15, y);
          ctx.stroke();
        }

        // The shooter.
        const shooter = input.player(twoPlayer ? state.turn : 0);
        if (shooter?.ok && !state.shot) {
          drawAvatar(ctx, shooter, { x: hoopX, y: shooterY + 6, height: h * 0.34 });
        }

        // Distance and the push it needs, down the left so the shooter is not
        // standing in the middle of the text.
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
