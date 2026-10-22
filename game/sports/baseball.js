// baseball.js: batting. Three outs and you are done.
//
// What the body does: a flat swing across the body, timed to the pitch. The
// window is wide enough to be fair and narrow enough that timing decides
// whether it is a foul, a single or a ball over the fence. Swinging on a
// vertical plane is a golf swing, and misses on purpose.

import { PALETTE, text, drawScorebar, roundRect, drawAvatar } from '../ui.js';
import { clamp, lerp } from '../filters.js';
import { Sound } from '../audio.js';

export const baseball = {
  id: 'baseball',
  label: 'Baseball',
  note: 'Time the swing',
  twoPlayerStyle: 'turns',
  tutorial: [
    'Stand side-on, hands back.',
    'Swing flat and level as the ball reaches the plate.',
    'Swing late and you foul it off.',
    'Three outs and your half of the inning is over.',
  ],
  icon(ctx, x, y, r) {
    ctx.save();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = r * 0.14;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - r * 0.75, y, r * 0.62, -0.6, 0.6);
    ctx.arc(x + r * 0.75, y, r * 0.62, Math.PI - 0.6, Math.PI + 0.6);
    ctx.stroke();
    ctx.restore();
  },

  create({ input, toasts, twoPlayer, difficulty }) {
    const speeds = [1.45, 1.15, 0.92][difficulty]; // seconds from release to plate
    const state = {
      pitch: null,
      waiting: 1.6,
      strikes: 0,
      outs: 0,
      runs: [0, 0],
      bases: [false, false, false],
      turn: 0,
      swungAt: null,
      shake: 0,
      done: false,
    };

    function newPitch() {
      const across = (Math.random() - 0.5) * 0.4;
      state.pitch = {
        t: 0,
        duration: speeds * (0.85 + Math.random() * 0.3),
        x: 0.5 + across,
        curve: (Math.random() - 0.5) * 0.25,
        inZone: Math.abs(across) < 0.14,
      };
      state.swungAt = null;
      Sound.whoosh(0.3);
    }

    function advance(bases) {
      for (let i = 0; i < bases; i++) {
        if (state.bases[2]) { state.runs[state.turn]++; Sound.score(); }
        state.bases[2] = state.bases[1];
        state.bases[1] = state.bases[0];
        state.bases[0] = i === 0;
      }
    }

    function out(reason) {
      state.outs++;
      state.strikes = 0;
      toasts.add(reason, { color: PALETTE.red, size: 28 });
      Sound.miss();
      if (state.outs >= 3) {
        if (twoPlayer && state.turn === 0) {
          state.turn = 1;
          state.outs = 0;
          state.bases = [false, false, false];
          toasts.add('Player 2 up', { color: PALETTE.gold, size: 30, y: 0.35 });
        } else {
          state.done = true;
        }
      }
    }

    function swing(event) {
      if (!state.pitch || state.swungAt !== null) return;
      state.swungAt = state.pitch.t;

      // A vertical swing is the wrong shape for this sport.
      if (event.plane !== 'horizontal') {
        toasts.add('Swing flatter', { color: PALETTE.dim, size: 20, y: 0.62 });
        state.strikes++;
        if (state.strikes >= 3) out('Strikeout');
        state.pitch = null;
        state.waiting = 1.1;
        return;
      }

      const progress = state.pitch.t / state.pitch.duration;
      const error = Math.abs(progress - 0.82);    // 0.82 is the plate
      state.shake = 0.5;

      if (error > 0.2) {
        state.strikes++;
        toasts.add(progress < 0.82 ? 'Early' : 'Late', { color: PALETTE.dim, size: 24 });
        Sound.whoosh(0.5);
        if (state.strikes >= 3) out('Strikeout');
      } else if (error > 0.11) {
        toasts.add('Foul ball', { color: PALETTE.dim, size: 24 });
        Sound.hit(0.3);
        if (state.strikes < 2) state.strikes++;
      } else {
        const quality = (1 - error / 0.11) * (0.5 + event.power * 0.7);
        Sound.hit(clamp(quality));
        if (quality > 0.92) {
          toasts.add('HOME RUN', { color: PALETTE.gold, size: 46 });
          Sound.crowd(1.2);
          advance(4);
        } else if (quality > 0.62) {
          toasts.add('Double', { color: PALETTE.gold, size: 30 });
          Sound.crowd(0.5);
          advance(2);
        } else {
          toasts.add('Base hit', { size: 28 });
          advance(1);
        }
        state.strikes = 0;
      }
      state.pitch = null;
      state.waiting = 1.3;
    }

    return {
      get done() { return state.done; },
      get result() {
        return {
          score: state.runs[0],
          win: twoPlayer ? state.runs[0] >= state.runs[1] : state.runs[0] > 0,
          detail: twoPlayer ? `${state.runs[0]} – ${state.runs[1]}` : `${state.runs[0]} run${state.runs[0] === 1 ? '' : 's'}`,
        };
      },

      update(dt, now, events) {
        state.shake = Math.max(0, state.shake - dt * 2.5);
        for (const e of events) {
          if (e.type !== 'swing') continue;
          if (twoPlayer && e.player !== state.turn) continue;
          swing(e);
        }
        if (!state.pitch) {
          state.waiting -= dt;
          if (state.waiting <= 0 && !state.done) newPitch();
          return;
        }
        state.pitch.t += dt;
        if (state.pitch.t > state.pitch.duration * 1.08) {
          // Let it go by: a strike if it was over the plate, otherwise a ball.
          if (state.pitch.inZone) {
            state.strikes++;
            toasts.add('Strike', { color: PALETTE.dim, size: 24 });
            if (state.strikes >= 3) out('Caught looking');
          } else {
            toasts.add('Ball', { color: PALETTE.blue, size: 22 });
          }
          state.pitch = null;
          state.waiting = 1.2;
        }
      },

      draw(ctx, w, h) {
        const shake = state.shake * 5;
        ctx.save();
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

        ctx.fillStyle = PALETTE.sky;
        ctx.fillRect(0, 0, w, h * 0.38);
        ctx.fillStyle = PALETTE.grass;
        ctx.fillRect(0, h * 0.38, w, h * 0.62);
        ctx.fillStyle = PALETTE.clay;
        ctx.beginPath();
        ctx.ellipse(w / 2, h * 0.88, w * 0.3, h * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
        // Home plate.
        ctx.fillStyle = PALETTE.ink;
        ctx.beginPath();
        ctx.moveTo(w / 2 - 22, h * 0.86);
        ctx.lineTo(w / 2 + 22, h * 0.86);
        ctx.lineTo(w / 2 + 22, h * 0.89);
        ctx.lineTo(w / 2, h * 0.92);
        ctx.lineTo(w / 2 - 22, h * 0.89);
        ctx.closePath();
        ctx.fill();

        // The pitcher, small and far away — standing on the grass, not in
        // the sky: the horizon is at 0.38, so anything above that is floating.
        ctx.fillStyle = '#8f5c52';
        roundRect(ctx, w / 2 - 13, h * 0.44, 26, 42, 10);
        ctx.fill();
        ctx.fillStyle = '#f0cba8';
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.425, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(w / 2, h * 0.49, 20, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // The ball grows as it comes, which is the only depth cue there is.
        if (state.pitch) {
          const t = clamp(state.pitch.t / state.pitch.duration, 0, 1.1);
          const x = w * lerp(0.5, state.pitch.x + state.pitch.curve * t, t);
          const y = h * lerp(0.45, 0.87, t);
          const r = lerp(4, 17, t);
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.beginPath();
          ctx.ellipse(x, h * 0.9, r, r * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = PALETTE.ink;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = PALETTE.red;
          ctx.lineWidth = Math.max(1, r * 0.12);
          ctx.beginPath();
          ctx.arc(x - r * 0.5, y, r * 0.8, -0.7, 0.7);
          ctx.stroke();
        }

        // The batter, beside the plate.
        const batter = input.player(twoPlayer ? state.turn : 0);
        if (batter?.ok) drawAvatar(ctx, batter, { x: w / 2 - 155, y: h * 0.95, height: h * 0.34 });

        // The strike zone, so the timing is learnable.
        ctx.strokeStyle = 'rgba(242,239,233,0.25)';
        ctx.lineWidth = 2;
        ctx.strokeRect(w / 2 - w * 0.07, h * 0.6, w * 0.14, h * 0.2);
        ctx.restore();

        drawScorebar(ctx, w, { name: twoPlayer ? 'Player 1' : 'You', score: state.runs[0] },
          { name: twoPlayer ? 'Player 2' : 'Runs', score: state.runs[1] });

        text(ctx, `${state.strikes} strike${state.strikes === 1 ? '' : 's'}`, 24, 30, { size: 15, align: 'left' });
        text(ctx, `${state.outs} out${state.outs === 1 ? '' : 's'}`, 24, 52, { size: 15, align: 'left', color: PALETTE.dim });

        // Diamond of occupied bases.
        const bx = w - 70, by = 48;
        state.bases.forEach((on, i) => {
          const pos = [[bx + 18, by], [bx, by - 18], [bx - 18, by]][i];
          ctx.save();
          ctx.translate(pos[0], pos[1]);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = on ? PALETTE.gold : 'rgba(242,239,233,0.18)';
          ctx.fillRect(-7, -7, 14, 14);
          ctx.restore();
        });
      },
    };
  },
};
