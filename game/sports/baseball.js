// baseball.js: batting. Three outs and you are done.
//
// What the body does: a flat swing across the body, timed to the pitch. The
// window is wide enough to be fair and narrow enough that timing decides
// whether it is a foul, a single or a ball over the fence. Swinging on a
// vertical plane is a golf swing, and misses on purpose.

import { PALETTE, text, roundRect, drawAvatar } from '../ui.js';
import { layer, sky, clouds, stand, crowd, floodlight, mownStripes, scoreboard } from '../scenery.js';
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

      // The stadium: drawn once into an offscreen canvas and blitted after,
      // because none of it moves and there are several hundred shapes in it.
      backdrop(w, h) {
        return layer('ballpark', w, h, (c) => {
          const horizon = h * 0.30;

          sky(c, w, horizon, '#2f4668', '#8a7f8e');
          clouds(c, w, horizon, 12, 6);

          // Outfield stands, wrapping the back of the park.
          stand(c, 0, horizon * 0.22, w, horizon * 0.72, { seed: 21, rows: 9, deck: '#272c35' });
          floodlight(c, w * 0.14, horizon * 0.1, h * 0.022);
          floodlight(c, w * 0.86, horizon * 0.1, h * 0.022);

          // The outfield wall, padded, with a yellow home-run line on top.
          const wallY = horizon * 0.94;
          const wallH = h * 0.055;
          c.fillStyle = '#1f4a33';
          c.fillRect(0, wallY, w, wallH);
          c.strokeStyle = 'rgba(255,255,255,0.1)';
          c.lineWidth = 1;
          for (let x = 0; x < w; x += w / 26) {
            c.beginPath();
            c.moveTo(x, wallY);
            c.lineTo(x, wallY + wallH);
            c.stroke();
          }
          c.fillStyle = '#e7c15c';
          c.fillRect(0, wallY, w, 3);

          // Grass, mown in bands that narrow toward the wall.
          const fieldY = wallY + wallH;
          mownStripes(c, 0, fieldY, w, h - fieldY, { bands: 11, light: '#4f8f5a', dark: '#44804e' });

          // Infield dirt, the mound, and the base paths.
          c.fillStyle = '#b4643c';
          c.beginPath();
          c.ellipse(w / 2, h * 0.92, w * 0.44, h * 0.30, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#4f8f5a';
          c.beginPath();
          c.ellipse(w / 2, h * 0.95, w * 0.30, h * 0.20, 0, 0, Math.PI * 2);
          c.fill();

          c.fillStyle = '#b4643c';
          c.beginPath();
          c.ellipse(w / 2, h * 0.52, w * 0.055, h * 0.028, 0, 0, Math.PI * 2);
          c.fill();

          // Bases, laid out as the diamond looks from behind home plate.
          const bases = [[w / 2 + w * 0.30, h * 0.80], [w / 2, h * 0.60], [w / 2 - w * 0.30, h * 0.80]];
          for (const [bx, by] of bases) {
            c.save();
            c.translate(bx, by);
            c.scale(1, 0.5);
            c.rotate(Math.PI / 4);
            c.fillStyle = 'rgba(0,0,0,0.3)';
            c.fillRect(-10, -7, 20, 20);
            c.fillStyle = '#f2efe9';
            c.fillRect(-9, -9, 18, 18);
            c.restore();
          }

          // Foul lines running out to the corners.
          c.strokeStyle = 'rgba(255,255,255,0.28)';
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(w / 2, h * 0.9);
          c.lineTo(w * 1.02, fieldY + 6);
          c.moveTo(w / 2, h * 0.9);
          c.lineTo(-w * 0.02, fieldY + 6);
          c.stroke();

          // Batter's boxes, chalked either side of the plate.
          c.lineWidth = 2;
          c.strokeStyle = 'rgba(255,255,255,0.5)';
          c.strokeRect(w / 2 - 128, h * 0.80, 74, h * 0.15);
          c.strokeRect(w / 2 + 54, h * 0.80, 74, h * 0.15);

          // Dugouts down each side.
          for (const dx of [w * 0.06, w * 0.82]) {
            c.fillStyle = '#20242c';
            c.fillRect(dx, h * 0.62, w * 0.12, h * 0.07);
            c.fillStyle = 'rgba(0,0,0,0.45)';
            c.fillRect(dx + 4, h * 0.635, w * 0.12 - 8, h * 0.04);
            crowd(c, dx + 6, h * 0.632, w * 0.12 - 12, h * 0.042, { seed: 44, rows: 1, dim: 0.35 });
          }
        });
      },

      draw(ctx, w, h) {
        const shake = state.shake * 5;
        ctx.save();
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

        ctx.drawImage(this.backdrop(w, h), 0, 0, w, h);

        // Home plate.
        ctx.fillStyle = '#f2efe9';
        ctx.beginPath();
        ctx.moveTo(w / 2 - 20, h * 0.875);
        ctx.lineTo(w / 2 + 20, h * 0.875);
        ctx.lineTo(w / 2 + 20, h * 0.9);
        ctx.lineTo(w / 2, h * 0.925);
        ctx.lineTo(w / 2 - 20, h * 0.9);
        ctx.closePath();
        ctx.fill();

        // The pitcher on the mound, winding up as the pitch comes.
        const wind = state.pitch ? Math.min(1, state.pitch.t / (state.pitch.duration * 0.3)) : 0;
        const px = w / 2, py = h * 0.5;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(px, py + 44, 22, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d9dde4';                       // away greys
        roundRect(ctx, px - 13, py - 2, 26, 44, 9);
        ctx.fill();
        ctx.strokeStyle = '#d9dde4';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();                                  // throwing arm
        ctx.moveTo(px + 9, py + 6);
        ctx.lineTo(px + 9 + wind * 20, py + 6 - wind * 26);
        ctx.stroke();
        ctx.beginPath();                                  // legs
        ctx.moveTo(px - 6, py + 42);
        ctx.lineTo(px - 10 - wind * 8, py + 60);
        ctx.moveTo(px + 6, py + 42);
        ctx.lineTo(px + 12, py + 60);
        ctx.stroke();
        ctx.fillStyle = '#f0cba8';
        ctx.beginPath();
        ctx.arc(px, py - 14, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2b4a7a';                        // cap
        ctx.beginPath();
        ctx.arc(px, py - 16, 12, Math.PI, 0);
        ctx.fill();

        // Catcher and umpire, crouched behind the plate in the foreground.
        const cy = h * 0.985;
        ctx.fillStyle = '#4b5b73';
        ctx.beginPath();
        ctx.ellipse(w / 2 + 6, cy, 54, 46, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#39414f';
        ctx.beginPath();
        ctx.arc(w / 2 + 6, cy - 46, 21, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2a2f3a';
        ctx.beginPath();
        ctx.ellipse(w / 2 + 74, cy + 6, 46, 40, 0, Math.PI, 0);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w / 2 + 74, cy - 36, 18, 0, Math.PI * 2);
        ctx.fill();

        // The ball grows as it comes, which is the only depth cue there is.
        if (state.pitch) {
          const t = clamp(state.pitch.t / state.pitch.duration, 0, 1.1);
          const x = w * lerp(0.5, state.pitch.x + state.pitch.curve * t, t);
          const y = h * lerp(0.52, 0.87, t);
          const r = lerp(3.5, 17, t);
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.beginPath();
          ctx.ellipse(x, h * 0.9, r, r * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#f6f4ee';
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#c4473a';
          ctx.lineWidth = Math.max(1, r * 0.13);
          ctx.beginPath();
          ctx.arc(x - r * 0.5, y, r * 0.85, -0.75, 0.75);
          ctx.arc(x + r * 0.5, y, r * 0.85, Math.PI - 0.75, Math.PI + 0.75);
          ctx.stroke();
        }

        // The batter, with a bat.
        const batter = input.player(twoPlayer ? state.turn : 0);
        const bx = w / 2 - 155;
        if (batter?.ok) {
          drawAvatar(ctx, batter, { x: bx, y: h * 0.95, height: h * 0.34 });
          const swung = state.swungAt !== null;
          ctx.save();
          ctx.translate(bx + 24, h * 0.72);
          ctx.rotate(swung ? 0.5 : -0.95);
          const grad = ctx.createLinearGradient(0, 0, 0, -h * 0.2);
          grad.addColorStop(0, '#8a5a32');
          grad.addColorStop(1, '#c79a63');
          ctx.fillStyle = grad;
          roundRect(ctx, -4, -h * 0.2, 8, h * 0.2, 4);
          ctx.fill();
          ctx.restore();
        }

        // The strike zone, so the timing is learnable.
        ctx.strokeStyle = 'rgba(242,239,233,0.3)';
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 2;
        ctx.strokeRect(w / 2 - w * 0.065, h * 0.68, w * 0.13, h * 0.17);
        ctx.setLineDash([]);
        ctx.restore();

        scoreboard(ctx, w - 196, h - 92, 180, 74, [
          twoPlayer ? `P1 ${state.runs[0]}   P2 ${state.runs[1]}` : `RUNS  ${state.runs[0]}`,
          `${state.strikes} STRIKE   ${state.outs} OUT`,
        ]);
      },
    };
  },
};
