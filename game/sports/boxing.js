// boxing.js: punch, guard, dodge.
//
// What the body does: an arm extending fast is a punch, and which arm decides
// which glove. The HC-SR04 is doing real work here — a punch travels along the
// axis the camera is worst at, so the distance reading closing is what tells a
// real punch from an arm waved about. Hands up by the face is a guard; leaning
// hard to one side is a dodge.

import { PALETTE, text, drawMeter, roundRect, drawAvatar } from '../ui.js';
import { layer, crowd, rng, figure, groundShadow, vignette, speckle, flashes } from '../scenery.js';
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
      lastHit: null,
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

    function land(power, side, event) {
      if (event) {
        state.lastHit = {
          side,
          // Reach per second across an arm's length, turned into mph.
          speedMph: Math.round(event.extension * event.power * 12 * 10) / 10,
          depth: event.depth > 0.05 ? `${Math.round(event.depth * 100)}%` : 'camera only',
          power: `${Math.round(power * 100)}%`,
        };
      }
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
      // The whole game in one object. The 2D draw() below and the 3D
      // scene both read it; neither owns it.
      get state() { return state; },
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
            land(e.power, e.side, e);
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

      // The arena, the ring and the far ropes. Static, so it is drawn once.
      backdrop(w, h) {
        return layer('ring', w, h, (c) => {
          // A dark hall: the crowd is lit only by spill from the ring.
          c.fillStyle = '#dfeaf1';
          c.fillRect(0, 0, w, h);
          crowd(c, 0, h * 0.02, w, h * 0.3, { seed: 77, rows: 8 });
          

          // The lighting rig itself, hanging over the ring.
          c.fillStyle = '#c6d6e2';
          c.fillRect(w * 0.14, 0, w * 0.72, h * 0.035);
          for (let i = 0; i < 9; i++) {
            const lx = w * 0.17 + i * w * 0.0825;
            c.fillStyle = '#b4c7d6';
            c.fillRect(lx - 9, h * 0.035, 18, h * 0.016);
            c.fillStyle = '#fff6d8';
            c.beginPath();
            c.ellipse(lx, h * 0.051, 8, 4, 0, 0, Math.PI * 2);
            c.fill();
          }

          // Spotlight cones from the rig above.
          for (const sx of [w * 0.26, w * 0.5, w * 0.74]) {
            const cone = c.createLinearGradient(sx, 0, sx, h * 0.8);
            cone.addColorStop(0, 'rgba(255,255,255,0.3)');
            cone.addColorStop(1, 'rgba(255,255,255,0)');
            c.fillStyle = cone;
            c.beginPath();
            c.moveTo(sx - 26, 0);
            c.lineTo(sx + 26, 0);
            c.lineTo(sx + w * 0.26, h * 0.8);
            c.lineTo(sx - w * 0.26, h * 0.8);
            c.closePath();
            c.fill();
          }

          // The canvas, in perspective: narrow at the back, wide at the front.
          const backY = h * 0.34, frontY = h * 1.04;
          c.fillStyle = '#5aa0dd';
          c.beginPath();
          c.moveTo(w * 0.17, backY);
          c.lineTo(w * 0.83, backY);
          c.lineTo(w * 1.16, frontY);
          c.lineTo(-w * 0.16, frontY);
          c.closePath();
          c.fill();

          // Scuff on the canvas, so it is not a flat blue field.
          const r = rng(9);
          c.globalAlpha = 0.025;
          c.fillStyle = '#ffffff';
          for (let i = 0; i < 90; i++) {
            const t = r();
            const yy = backY + (frontY - backY) * t;
            const halfWidth = w * (0.33 + t * 0.49);
            c.beginPath();
            c.ellipse(w / 2 + (r() - 0.5) * halfWidth * 2, yy, 20 + r() * 50, 4 + r() * 6, 0, 0, Math.PI * 2);
            c.fill();
          }
          c.globalAlpha = 1;

          // The apron skirt hanging off the front edge.
          c.fillStyle = '#4a8ac4';
          c.fillRect(-w * 0.16, h * 0.995, w * 1.32, h * 0.1);
          c.fillStyle = 'rgba(255,255,255,0.06)';
          c.fillRect(-w * 0.16, h * 0.995, w * 1.32, 3);

          // Corner stools waiting in the far corners between rounds.
          for (const sx of [w * 0.235, w * 0.765]) {
            c.fillStyle = '#b4c7d6';
            c.fillRect(sx - 11, backY + h * 0.025, 22, 5);
            c.fillRect(sx - 9, backY + h * 0.03, 3, h * 0.03);
            c.fillRect(sx + 6, backY + h * 0.03, 3, h * 0.03);
            c.fillStyle = '#d99a52';                    // a bucket beside it
            c.fillRect(sx + 16, backY + h * 0.045, 11, 13);
          }

          // Back ropes and the two far posts.
          const post = (x, colour) => {
            c.fillStyle = '#8ea4b2';
            c.fillRect(x - 7, backY - h * 0.26, 14, h * 0.28);
            c.fillStyle = colour;                       // turnbuckle padding
            for (let i = 0; i < 3; i++) {
              roundRect(c, x - 11, backY - h * 0.23 + i * h * 0.075, 22, h * 0.05, 5);
              c.fill();
            }
          };
          const rope = (y, x0, x1, sag) => {
            c.strokeStyle = '#ffffff';
            c.lineWidth = 4;
            c.beginPath();
            c.moveTo(x0, y);
            c.quadraticCurveTo((x0 + x1) / 2, y + sag, x1, y);
            c.stroke();
          };
          for (let i = 0; i < 3; i++) rope(backY - h * 0.2 + i * h * 0.075, w * 0.17, w * 0.83, 5);
          post(w * 0.17, '#c4473a');
          post(w * 0.83, '#3f6fa8');
        });
      },

      // The near ropes and the two side runs, drawn after the boxers so they
      // are genuinely in front. A ring has four sides: the back run is in the
      // backdrop, these are the other three.
      foreground(ctx, w, h) {
        // Side ropes, each sloping from its far post down to its near post.
        const backY = h * 0.34;
        for (const [farX, nearX] of [[w * 0.17, w * 0.02], [w * 0.83, w * 0.98]]) {
          for (let i = 0; i < 3; i++) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 4 + i * 1.6;
            ctx.beginPath();
            ctx.moveTo(farX, backY - h * 0.2 + i * h * 0.075);
            ctx.lineTo(nearX, h * 0.72 + i * h * 0.1);
            ctx.stroke();
          }
        }

        // Photographers at the ring apron, shooting up at the fighters.
        for (const [px2, face] of [[w * 0.1, 1], [w * 0.22, 1], [w * 0.78, -1], [w * 0.9, -1]]) {
          figure(ctx, px2, h * 1.06, h * 0.2, { shirt: '#6d8291', pants: '#56697a', pose: 'point', facing: face });
          ctx.fillStyle = '#2d3b45';
          ctx.beginPath();
          ctx.arc(px2 + face * h * 0.055, h * 0.92, h * 0.022, 0, Math.PI * 2);
          ctx.fill();
        }

        const y0 = h * 0.72;
        for (let i = 0; i < 3; i++) {
          const y = y0 + i * h * 0.1;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 7 + i * 2;
          ctx.beginPath();
          ctx.moveTo(-w * 0.05, y);
          ctx.quadraticCurveTo(w / 2, y + 12 + i * 4, w * 1.05, y);
          ctx.stroke();
        }
        // Near posts at the corners of the frame.
        for (const [x, colour] of [[w * 0.02, '#c4473a'], [w * 0.98, '#3f6fa8']]) {
          ctx.fillStyle = '#8ea4b2';
          ctx.fillRect(x - 13, h * 0.58, 26, h * 0.45);
          ctx.fillStyle = colour;
          for (let i = 0; i < 3; i++) {
            roundRect(ctx, x - 19, h * 0.69 + i * h * 0.1, 38, h * 0.07, 7);
            ctx.fill();
          }
        }
      },

      draw(ctx, w, h) {
        ctx.drawImage(this.backdrop(w, h), 0, 0, w, h);
        

        // The referee, moving with the action but staying out of the way.
        const refX = w * 0.5 + Math.sin(state.bob * 0.4) * w * 0.17 + w * 0.2;
        const refY = h * 0.56;
        groundShadow(ctx, refX, refY + 2, h * 0.05, { alpha: 0.3 });
        figure(ctx, refX, refY, h * 0.17, { shirt: '#ffffff', pants: '#56697a', pose: 'stand',
          facing: -1, lean: Math.sin(state.bob * 0.4) * 0.3 });

        // The opponent, bobbing, and winding up in red when an attack is coming.
        const bobY = Math.sin(state.bob) * 8;
        const cx = w * 0.64 + (state.windup > 0 ? state.attackSide * 26 * (1 - state.windup) : 0);
        const cy = h * 0.44 + bobY;
        ctx.save();
        if (state.hitFlash > 0) {
          ctx.globalAlpha = 1;
          ctx.translate((Math.random() - 0.5) * state.hitFlash * 14, 0);
        }
        // Legs and boots, so the challenger stands on the canvas.
        ctx.strokeStyle = '#56697a';
        ctx.lineWidth = 26;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 26, cy + 96);
        ctx.lineTo(cx - 34, cy + 160);
        ctx.moveTo(cx + 26, cy + 96);
        ctx.lineTo(cx + 34, cy + 160);
        ctx.stroke();
        ctx.fillStyle = '#f0705f';
        roundRect(ctx, cx - 50, cy + 160, 34, 20, 6);
        ctx.fill();
        roundRect(ctx, cx + 16, cy + 160, 34, 20, 6);
        ctx.fill();

        // Trunks.
        ctx.fillStyle = state.windup > 0 ? '#e05a48' : '#6d8291';
        roundRect(ctx, cx - 44, cy + 72, 88, 48, 12);
        ctx.fill();
        ctx.fillStyle = '#e7c15c';
        ctx.fillRect(cx - 44, cy + 74, 88, 7);

        ctx.fillStyle = state.windup > 0 ? PALETTE.red : '#d98f6e';
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
        // Gloves, with laces and a highlight so they read as leather.
        const gloveY = cy + 24 + (state.windup > 0 ? -18 : 0);
        for (const gx of [cx - 72, cx + 72]) {
          const lit = ctx.createRadialGradient(gx - 7, gloveY - 8, 2, gx, gloveY, 24);
          lit.addColorStop(0, '#f78a78');
          lit.addColorStop(1, '#d4523f');
          ctx.fillStyle = lit;
          ctx.beginPath();
          ctx.arc(gx, gloveY, 22, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#f2efe9';
          ctx.lineWidth = 2;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(gx - 6, gloveY + i * 6);
            ctx.lineTo(gx + 6, gloveY + i * 6);
            ctx.stroke();
          }
        }
        ctx.restore();

        // You, from behind and large in the lower left, with the challenger
        // ahead and to the right — the same over-the-shoulder camera the rest
        // of the game uses.
        const me = input.player(0);
        const guard = guarding(me);
        const youX = w * 0.3;
        const youY = h * 1.12;
        const youH = h * 0.78;
        if (me?.ok) drawAvatar(ctx, me, { x: youX, y: youY, height: youH, back: true });

        // Gloves on your own hands, so a punch is something you watch land.
        for (const side of ['left', 'right']) {
          const hand = me?.ok ? me.hands[side] : null;
          const out = hand ? clamp(hand.extension, 0, 1.2) : 0.3;
          // Placed on the tracked wrist, mapped into the figure's own space,
          // so the glove is where your hand actually is.
          const lateral = side === 'left' ? -1 : 1;
          const gx = me?.ok && hand
            ? youX + (hand.x - me.centre.x) * (youH / Math.max(0.05, me.calib.shoulderSpan)) * 0.55
            : youX + lateral * youH * 0.22;
          const gy = me?.ok && hand
            ? youY - youH * 0.62 + (hand.y - me.centre.y) * (youH / Math.max(0.05, me.calib.shoulderSpan)) * 0.55
            : youY - youH * 0.5;
          const size = youH * (0.1 + out * 0.03);

          const lit = ctx.createRadialGradient(gx - size * 0.3, gy - size * 0.35, size * 0.1, gx, gy, size * 1.2);
          lit.addColorStop(0, '#79c0f5');
          lit.addColorStop(1, '#3f7fc0');
          ctx.fillStyle = lit;
          ctx.beginPath();
          ctx.arc(gx, gy, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(2, size * 0.1);
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(gx - size * 0.3, gy + i * size * 0.28);
            ctx.lineTo(gx + size * 0.3, gy + i * size * 0.28);
            ctx.stroke();
          }
        }

        this.foreground(ctx, w, h);
        

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
