// baseball.js: batting. Three outs and you are done.
//
// What the body does: a flat swing across the body, timed to the pitch. The
// window is wide enough to be fair and narrow enough that timing decides
// whether it is a foul, a single or a ball over the fence. Swinging on a
// vertical plane is a golf swing, and misses on purpose.

import { PALETTE, text, roundRect, drawAvatar } from '../ui.js';
import { layer, sky, clouds, stand, crowd, floodlight, mownStripes, scoreboard,
         figure, groundShadow, vignette, speckle, banners, birds } from '../scenery.js';
import { clamp, lerp } from '../filters.js';
import { CONFIG } from '../config.js';
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
      lastHit: null,
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
      state.lastHit = {
        speedMph: Math.round(event.speed * 0.45 * 2.237 * 10) / 10,
        timing: progress < 0.82 ? `${Math.round((0.82 - progress) * 1000)} ms early`
                                : `${Math.round((progress - 0.82) * 1000)} ms late`,
        contact: error > 0.2 ? 'missed' : error > 0.11 ? 'edge' : 'flush',
        plane: event.plane,
      };
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
      // The whole game in one object. The 2D draw() below and the 3D
      // scene both read it; neither owns it.
      get state() { return state; },
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

          sky(c, w, horizon, '#7fcdf0', '#dcf1fb');
          clouds(c, w, horizon, 12, 6);

          // Outfield stands, wrapping the back of the park, with banners over
          // the front rail.
          stand(c, 0, horizon * 0.22, w, horizon * 0.72, { seed: 21, rows: 9, deck: '#cfdde8' });
          banners(c, 0, horizon * 0.86, w, horizon * 0.09, { seed: 14, count: 9 });
          floodlight(c, w * 0.1, horizon * 0.06, h * 0.022);
          floodlight(c, w * 0.9, horizon * 0.06, h * 0.022);
          floodlight(c, w * 0.32, horizon * 0.02, h * 0.018);
          floodlight(c, w * 0.68, horizon * 0.02, h * 0.018);

          // The big board above the stands in centre field.
          const boardW = w * 0.2, boardX = w / 2 - boardW / 2;
          c.fillStyle = '#e4edf3';
          c.fillRect(boardX - 6, horizon * 0.1, boardW + 12, horizon * 0.36);
          scoreboard(c, boardX, horizon * 0.12, boardW, horizon * 0.3,
            ['HOME  AWAY', '1 2 3 4 5 6 7 8 9']);
          c.fillStyle = '#c6d6e2';
          c.fillRect(w / 2 - 5, horizon * 0.46, 10, horizon * 0.12);

          // The outfield wall, padded, with a yellow home-run line on top.
          const wallY = horizon * 0.94;
          const wallH = h * 0.055;
          c.fillStyle = '#4f9e5e';
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

          // Grass, mown in bands that narrow toward the wall, then a dirt
          // warning track along the foot of it so the wall is not a hard edge.
          const fieldY = wallY + wallH;
          mownStripes(c, 0, fieldY, w, h - fieldY, { bands: 11, light: '#8ccc5c', dark: '#7cc04d' });
          c.fillStyle = '#e0b081';
          c.fillRect(0, fieldY, w, h * 0.022);
          

          // Foul poles at the corners of the wall.
          for (const fx of [w * 0.035, w * 0.965]) {
            c.fillStyle = '#e7c15c';
            c.fillRect(fx - 3, horizon * 0.52, 6, fieldY - horizon * 0.52);
          }

          // Bullpen benches beyond the outfield grass.
          for (const bx of [w * 0.1, w * 0.78]) {
            c.fillStyle = '#cfdde8';
            c.fillRect(bx, fieldY + h * 0.03, w * 0.12, h * 0.012);
            for (let i = 0; i < 3; i++) {
              figure(c, bx + w * 0.025 + i * w * 0.035, fieldY + h * 0.03, h * 0.045,
                { shirt: '#ffffff', pants: '#cdd9e4', cap: '#5aa8ea' });
            }
          }

          // Infield dirt, the mound, and the base paths.
          c.fillStyle = '#e49c66';
          c.beginPath();
          c.ellipse(w * 0.47, h * 0.98, w * 0.6, h * 0.36, 0, 0, Math.PI * 2);
          c.fill();

          c.fillStyle = '#e49c66';
          c.beginPath();
          c.ellipse(w * 0.58, h * 0.5, w * 0.08, h * 0.034, 0, 0, Math.PI * 2);
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
          c.strokeStyle = 'rgba(255,255,255,0.8)';
          c.lineWidth = 5;
          c.beginPath();
          c.moveTo(w * 0.47, h * 0.96);
          c.lineTo(w * 1.3, h * 0.6);
          c.moveTo(w * 0.47, h * 0.96);
          c.lineTo(-w * 0.3, h * 0.6);
          c.stroke();

          // Batter's boxes, chalked either side of the plate.
          c.lineWidth = 2;
          c.strokeStyle = 'rgba(255,255,255,0.5)';
          c.strokeRect(w / 2 - 128, h * 0.80, 74, h * 0.15);
          c.strokeRect(w / 2 + 54, h * 0.80, 74, h * 0.15);

          // The fielders: shortstop, second, and the corners.
          const fielders = [[w * 0.14, h * 0.6], [w * 0.88, h * 0.6]];
          for (const [fx, fy] of fielders) {
            groundShadow(c, fx, fy + 2, h * 0.03, { alpha: 0.26 });
            figure(c, fx, fy, h * 0.11, { shirt: '#ffffff', pants: '#cdd9e4', cap: '#5aa8ea', pose: 'ready' });
          }

        });
      },

      draw(ctx, w, h) {
        const shake = state.shake * 5;
        ctx.save();
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

        ctx.drawImage(this.backdrop(w, h), 0, 0, w, h);
        birds(ctx, w * 0.1, h * 0.09, h * 0.022, performance.now(), { seed: 23, count: 4 });

        // Home plate.
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(w * 0.47 - 34, h * 0.9);
        ctx.lineTo(w * 0.47 + 34, h * 0.9);
        ctx.lineTo(w * 0.47 + 34, h * 0.94);
        ctx.lineTo(w * 0.47, h * 0.985);
        ctx.lineTo(w * 0.47 - 34, h * 0.94);
        ctx.closePath();
        ctx.fill();

        // The pitcher on the mound, winding up as the pitch comes.
        const wind = state.pitch ? Math.min(1, state.pitch.t / (state.pitch.duration * 0.3)) : 0;
        const px = w * 0.58, py = h * 0.47;
        groundShadow(ctx, px, py + 46, 30, { alpha: 0.3 });
        ctx.fillStyle = '#ffffff';                       // away whites
        roundRect(ctx, px - 13, py - 2, 26, 44, 9);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
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
        ctx.fillStyle = '#5aa8ea';                        // cap
        ctx.beginPath();
        ctx.arc(px, py - 16, 12, Math.PI, 0);
        ctx.fill();

        // The ball grows as it comes, which is the only depth cue there is.
        if (state.pitch) {
          const t = clamp(state.pitch.t / state.pitch.duration, 0, 1.1);
          const x = w * lerp(0.58, state.pitch.x + state.pitch.curve * t, t);
          const y = h * lerp(0.52, 0.87, t);
          const r = lerp(3.5, 17, t);
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.beginPath();
          ctx.ellipse(x, h * 0.9, r, r * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#f0705f';
          ctx.lineWidth = Math.max(1, r * 0.13);
          ctx.beginPath();
          ctx.arc(x - r * 0.5, y, r * 0.85, -0.75, 0.75);
          ctx.arc(x + r * 0.5, y, r * 0.85, Math.PI - 0.75, Math.PI + 0.75);
          ctx.stroke();
        }

        // You at the plate: left of centre, large in frame, seen from behind,
        // with the bat up over the shoulder. The camera sits just behind and
        // above you, so the plate and the mound are both in view.
        const batter = input.player(twoPlayer ? state.turn : 0);
        const swung = state.swungAt !== null;
        const rightHanded = CONFIG.handedness !== 'left';
        const side = rightHanded ? 1 : -1;
        const youX = w * 0.29;
        const youY = h * 1.0;
        const youH = h * 0.62;
        if (batter?.ok) drawAvatar(ctx, batter, { x: youX, y: youY, height: youH, back: true });

        // The bat, loaded up behind the shoulder and swung through on contact.
        const gripX = youX + side * youH * 0.1;
        const gripY = youY - youH * 0.66;
        ctx.save();
        ctx.translate(gripX, gripY);
        ctx.rotate(swung ? side * -1.6 : side * -0.42);
        const grain = ctx.createLinearGradient(0, 0, 0, -youH * 0.62);
        grain.addColorStop(0, '#c08a4e');
        grain.addColorStop(1, '#f2d9ab');
        ctx.fillStyle = grain;
        roundRect(ctx, -youH * 0.032, -youH * 0.62, youH * 0.064, youH * 0.62, youH * 0.03);
        ctx.fill();
        ctx.fillStyle = '#2d3b45';
        roundRect(ctx, -youH * 0.034, -youH * 0.15, youH * 0.068, youH * 0.15, youH * 0.026);
        ctx.fill();
        ctx.restore();

        // The strike zone, so the timing is learnable.
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.setLineDash([5, 9]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(w * 0.47 - w * 0.05, h * 0.68, w * 0.1, h * 0.14);
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
