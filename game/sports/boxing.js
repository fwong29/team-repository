// boxing.js: punch, guard, dodge.
//
// What the body does: an arm extending fast is a punch, and which arm decides
// which glove. The HC-SR04 is doing real work here — a punch travels along the
// axis the camera is worst at, so the distance reading closing is what tells a
// real punch from an arm waved about. Hands up by the face is a guard; leaning
// hard to one side is a dodge.

import { PALETTE, text, drawMeter, drawAvatar, roundRect } from '../ui.js';
import { clamp, lerp } from '../filters.js';
import { Sound } from '../audio.js';

export const boxing = {
  id: 'boxing',
  label: 'Boxing',
  note: 'Punch, guard, dodge',
  twoPlayerStyle: 'live',
  tutorial: [
    'Stand square to the camera, fists up.',
    'Punch straight at the screen — either hand.',
    'Hands up by your face to block.',
    'Lean hard left or right to dodge a telegraphed swing.',
  ],
  icon(ctx, x, y, r) {
    ctx.save();
    ctx.fillStyle = PALETTE.ink;
    roundRect(ctx, x - r * 0.5, y - r * 0.62, r * 1.0, r * 0.95, r * 0.34);  // the fist
    ctx.fill();
    roundRect(ctx, x - r * 0.84, y - r * 0.2, r * 0.42, r * 0.46, r * 0.2);  // the thumb
    ctx.fill();
    roundRect(ctx, x - r * 0.46, y + r * 0.3, r * 0.92, r * 0.34, r * 0.12); // the cuff
    ctx.fill();
    ctx.strokeStyle = PALETTE.night;
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();                                                         // knuckle seam
    ctx.moveTo(x - r * 0.28, y - r * 0.5);
    ctx.lineTo(x - r * 0.28, y + r * 0.18);
    ctx.stroke();
    ctx.restore();
  },

  create({ input, toasts, twoPlayer, difficulty }) {
    const ai = [
      { every: 2.4, windup: 0.75, damage: 7 },
      { every: 1.7, windup: 0.58, damage: 10 },
      { every: 1.2, windup: 0.42, damage: 13 },
    ][difficulty];

    const state = {
      health: [100, 100],
      stamina: 1,
      nextAttack: 2,
      windup: 0,
      attackSide: 1,
      hitFlash: 0,
      hurtFlash: 0,
      bob: 0,
      done: false,
    };

    function guarding(body) {
      if (!body?.ok) return false;
      const { left, right } = body.hands;
      // Both gloves up and tucked in near the midline.
      return left.up && right.up &&
        Math.abs(left.acrossBody) < 0.9 && Math.abs(right.acrossBody) < 0.9;
    }

    function dodging(body) {
      return !!body?.ok && Math.abs(body.lean) > 0.45;
    }

    function land(power, side) {
      const damage = (6 + power * 16) * (0.4 + state.stamina * 0.6);
      state.health[1] = Math.max(0, state.health[1] - damage);
      state.stamina = clamp(state.stamina - 0.1 - power * 0.1);
      state.hitFlash = 0.4;
      Sound.thud(power);
      toasts.add(power > 0.7 ? 'BIG HIT' : (side === 'left' ? 'Left' : 'Right'), {
        y: 0.35, color: power > 0.7 ? PALETTE.gold : PALETTE.ink, size: power > 0.7 ? 40 : 26,
      });
      if (state.health[1] <= 0) { state.done = true; Sound.crowd(1.2); }
    }

    return {
      get done() { return state.done; },
      get result() {
        return {
          score: Math.round(state.health[0]),
          win: state.health[1] <= 0,
          detail: state.health[1] <= 0 ? 'Knockout' : 'You went down',
        };
      },

      update(dt, now, events) {
        state.hitFlash = Math.max(0, state.hitFlash - dt * 3);
        state.hurtFlash = Math.max(0, state.hurtFlash - dt * 3);
        state.bob += dt * 2.2;
        state.stamina = clamp(state.stamina + dt * 0.22);

        const me = input.player(0);
        const them = input.player(1);

        for (const e of events) {
          if (e.type !== 'punch') continue;
          if (e.player === 0) {
            if (state.stamina < 0.12) { toasts.add('Winded', { color: PALETTE.dim, size: 20, y: 0.6 }); continue; }
            land(e.power, e.side);
          } else if (twoPlayer) {
            state.health[0] = Math.max(0, state.health[0] - (6 + e.power * 14));
            state.hurtFlash = 0.5;
            Sound.thud(e.power);
            if (state.health[0] <= 0) state.done = true;
          }
        }

        if (twoPlayer) return; // player two does the attacking instead

        // The computer telegraphs, then strikes. The windup is the window the
        // player has to get a guard up or lean out of the way.
        if (state.windup > 0) {
          state.windup -= dt;
          if (state.windup <= 0) {
            const blocked = guarding(me);
            const dodged = dodging(me);
            if (dodged) {
              toasts.add('Dodged', { color: PALETTE.blue, size: 28, y: 0.38 });
              Sound.swish();
            } else if (blocked) {
              state.health[0] = Math.max(0, state.health[0] - ai.damage * 0.25);
              toasts.add('Blocked', { color: PALETTE.dim, size: 24, y: 0.38 });
              Sound.thud(0.3);
            } else {
              state.health[0] = Math.max(0, state.health[0] - ai.damage);
              state.hurtFlash = 0.6;
              Sound.thud(0.8);
              toasts.add('Hit!', { color: PALETTE.red, size: 30, y: 0.38 });
            }
            if (state.health[0] <= 0) state.done = true;
            state.nextAttack = ai.every * (0.7 + Math.random() * 0.6);
          }
        } else {
          state.nextAttack -= dt;
          if (state.nextAttack <= 0) {
            state.windup = ai.windup;
            state.attackSide = Math.random() < 0.5 ? -1 : 1;
            Sound.whoosh(0.4);
          }
        }
      },

      draw(ctx, w, h) {
        // Ring.
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#1b2230');
        g.addColorStop(1, '#2d1f28');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(242,239,233,0.25)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(0, h * (0.58 + i * 0.1));
          ctx.lineTo(w, h * (0.58 + i * 0.1));
          ctx.stroke();
        }

        // The opponent, bobbing, and winding up in red when an attack is coming.
        const bobY = Math.sin(state.bob) * 8;
        const cx = w / 2 + (state.windup > 0 ? state.attackSide * 26 * (1 - state.windup) : 0);
        const cy = h * 0.42 + bobY;
        ctx.save();
        if (state.hitFlash > 0) {
          ctx.globalAlpha = 1;
          ctx.translate((Math.random() - 0.5) * state.hitFlash * 14, 0);
        }
        ctx.fillStyle = state.windup > 0 ? PALETTE.red : '#8f5c52';
        roundRect(ctx, cx - 62, cy - 40, 124, 150, 26);
        ctx.fill();
        ctx.fillStyle = '#f0cba8';
        ctx.beginPath();
        ctx.arc(cx, cy - 72, 42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2f3a4a';
        ctx.beginPath();
        ctx.arc(cx - 15, cy - 78, 5, 0, Math.PI * 2);
        ctx.arc(cx + 15, cy - 78, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2f3a4a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy - 58, 16, state.windup > 0 ? Math.PI : 0.2 * Math.PI,
          state.windup > 0 ? Math.PI * 2 : 0.8 * Math.PI);
        ctx.stroke();
        // Gloves.
        ctx.fillStyle = PALETTE.red;
        ctx.beginPath();
        ctx.arc(cx - 72, cy + 24 + (state.windup > 0 ? -18 : 0), 22, 0, Math.PI * 2);
        ctx.arc(cx + 72, cy + 24 + (state.windup > 0 ? -18 : 0), 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        const me = input.player(0);
        if (me?.ok) drawAvatar(ctx, me, { x: w * 0.5, y: h * 1.32, height: h * 0.66 });

        if (state.hurtFlash > 0) {
          ctx.fillStyle = `rgba(212,96,79,${state.hurtFlash * 0.4})`;
          ctx.fillRect(0, 0, w, h);
        }
        if (guarding(me)) {
          ctx.strokeStyle = PALETTE.blue;
          ctx.lineWidth = 6;
          ctx.globalAlpha = 0.5;
          roundRect(ctx, 10, 10, w - 20, h - 20, 18);
          ctx.stroke();
          ctx.globalAlpha = 1;
          text(ctx, 'GUARD', w / 2, h - 40, { size: 18, color: PALETTE.blue, weight: 700 });
        }

        drawMeter(ctx, 24, 24, w / 2 - 70, 20, state.health[0] / 100, PALETTE.blue);
        text(ctx, 'You', 24, 58, { size: 12, align: 'left', color: PALETTE.dim });
        drawMeter(ctx, w / 2 + 46, 24, w / 2 - 70, 20, state.health[1] / 100, PALETTE.red);
        text(ctx, twoPlayer ? 'Player 2' : 'Challenger', w - 24, 58, { size: 12, align: 'right', color: PALETTE.dim });
        drawMeter(ctx, 24, 56, 150, 10, state.stamina, PALETTE.gold);
        text(ctx, 'stamina', 24, 76, { size: 10, align: 'left', color: PALETTE.dim });
      },
    };
  },
};
