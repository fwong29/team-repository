// tennis.js: a rally. The ball comes at you, you swing, it goes back.
//
// What the body does: swing direction across the torso decides forehand or
// backhand and which way the ball leaves. Swing speed is power. Stepping
// toward or away from the screen — the HC-SR04's job — moves you up and down
// the court, which changes how early you have to swing.

import { PALETTE, text, drawScorebar, drawMeter, roundRect, drawAvatar } from '../ui.js';
import { layer, stand, scoreboard } from '../scenery.js';
import { clamp, lerp } from '../filters.js';
import { CONFIG } from '../config.js';
import { Sound } from '../audio.js';
import { drawSprite, spriteRevision } from '../sprites.js';

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
      lastHit: null,
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
      state.lastHit = {
        speedMph: Math.round(event.speed * 0.45 * 2.237 * 10) / 10,
        shot: event.dirX > 0 ? 'forehand' : 'backhand',
        timing: timing > 0.72 ? 'clean' : timing > 0.4 ? 'ok' : 'late',
        faceDeg: Math.round(event.angle),
      };
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
      // The whole game in one object. The 2D draw() below and the 3D
      // scene both read it; neither owns it.
      get state() { return state; },
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

      // The court and the stadium around it. Static, so drawn once.
      //
      // A court-tennis.png in game/assets/ replaces the whole picture. The
      // revision goes in the cache key so a file that decodes after the first
      // frame still appears, instead of waiting for a window resize.
      court(w, h) {
        return layer(`tennis-court-${spriteRevision()}`, w, h, (c) => {
          if (drawSprite(c, 'court/tennis', 0, 0, w, h, { fit: 'cover' })) return;

          const backY = h * 0.14;

          // Stands wrapping the back of the court.
          c.fillStyle = '#dfeaf1';
          c.fillRect(0, 0, w, backY);
          stand(c, 0, 0, w, backY * 0.92, { seed: 101, rows: 6, deck: '#cfdde8' });

          // The surround, then the court itself inside it.
          c.fillStyle = '#74b84b';
          c.fillRect(0, backY, w, h - backY);

          // Court corners, near wide and far narrow.
          const nx0 = w * 0.06, nx1 = w * 0.94, fx0 = w * 0.355, fx1 = w * 0.645;
          const at = (t, u) => ({                       // t: 0 near .. 1 far, u: 0 left .. 1 right
            x: lerp(lerp(nx0, nx1, u), lerp(fx0, fx1, u), t),
            y: lerp(h * 1.0, backY + h * 0.02, t),
          });
          c.fillStyle = '#5aa0dd';
          c.beginPath();
          const a = at(0, 0), b = at(0, 1), d = at(1, 1), e = at(1, 0);
          c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.lineTo(e.x, e.y);
          c.closePath();
          c.fill();

          const paint = (pts, width = 3) => {
            c.strokeStyle = 'rgba(255,255,255,0.88)';
            c.lineWidth = width;
            c.beginPath();
            pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
            c.stroke();
          };

          // Tramlines down both sides, then the singles lines inside them.
          paint([at(0, 0), at(1, 0)]);
          paint([at(0, 1), at(1, 1)]);
          paint([at(0, 0.11), at(1, 0.11)]);
          paint([at(0, 0.89), at(1, 0.89)]);
          // Baselines.
          paint([at(0.02, 0), at(0.02, 1)]);
          paint([at(0.98, 0), at(0.98, 1)]);
          // Service lines and the centre service line.
          paint([at(0.3, 0.11), at(0.3, 0.89)], 2.5);
          paint([at(0.7, 0.11), at(0.7, 0.89)], 2.5);
          paint([at(0.3, 0.5), at(0.7, 0.5)], 2.5);

          // The net: posts, mesh, and the white band along the top.
          const netL = at(0.5, 0), netR = at(0.5, 1);
          const netTop = netL.y - h * 0.085;
          c.save();
          c.strokeStyle = 'rgba(240,244,248,0.4)';
          c.lineWidth = 1;
          for (let i = 0; i <= 54; i++) {               // vertical mesh
            const x = lerp(netL.x, netR.x, i / 54);
            c.beginPath();
            c.moveTo(x, netTop + h * 0.012);
            c.lineTo(x, netL.y);
            c.stroke();
          }
          for (let i = 0; i <= 7; i++) {                // horizontal mesh
            const y = lerp(netTop + h * 0.012, netL.y, i / 7);
            c.beginPath();
            c.moveTo(netL.x, y);
            c.lineTo(netR.x, y);
            c.stroke();
          }
          c.restore();
          c.fillStyle = '#f2efe9';                      // the band
          c.fillRect(netL.x, netTop, netR.x - netL.x, h * 0.014);
          c.fillStyle = '#8ea4b2';                      // posts
          c.fillRect(netL.x - 7, netTop, 7, h * 0.1);
          c.fillRect(netR.x, netTop, 7, h * 0.1);

          // Umpire's chair, off to one side.
          const chairX = netR.x + w * 0.05;
          c.fillStyle = '#b4c7d6';
          c.fillRect(chairX - 4, netTop - h * 0.1, 8, h * 0.19);
          c.fillRect(chairX + 20, netTop - h * 0.1, 8, h * 0.19);
          c.fillStyle = '#5aa8ea';
          roundRect(c, chairX - 10, netTop - h * 0.14, 44, h * 0.05, 5);
          c.fill();
          c.fillStyle = '#ffd9b8';
          c.beginPath();
          c.arc(chairX + 12, netTop - h * 0.155, 9, 0, Math.PI * 2);
          c.fill();
        });
      },

      draw(ctx, w, h) {
        const shake = state.shake * 6;
        ctx.save();
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

        ctx.drawImage(this.court(w, h), 0, 0, w, h);

        // The far-side player, small with distance and leaning into the ball.
        const farY = h * 0.26;
        const fx = w * state.farX;
        const lean = clamp((state.ball.x - state.farX) * 2, -1, 1);
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(fx, farY + 30, 18, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2f3a4a';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(fx - 4, farY + 10);
        ctx.lineTo(fx - 9, farY + 30);
        ctx.moveTo(fx + 4, farY + 10);
        ctx.lineTo(fx + 9, farY + 30);
        ctx.stroke();
        ctx.fillStyle = PALETTE.red;
        roundRect(ctx, fx - 11, farY - 12, 22, 26, 7);
        ctx.fill();
        ctx.strokeStyle = PALETTE.red;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(fx + 8, farY - 6);
        ctx.lineTo(fx + 8 + lean * 18, farY - 16);
        ctx.stroke();
        ctx.strokeStyle = '#e8e4da';                 // racket
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(fx + 10 + lean * 26, farY - 21, 7, 9, lean * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#f0cba8';
        ctx.beginPath();
        ctx.arc(fx, farY - 20, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        const nearY = h * (0.82 - state.court * 0.2);

        // You, seen from behind and set off to one side, with the court in
        // front of you — the camera sits over your shoulder.
        const body = input.player(0);
        const rightHanded = CONFIG.handedness !== 'left';
        const youX = w * (rightHanded ? 0.33 : 0.67);
        const youY = h * 1.04;
        const youH = h * 0.6;
        if (body?.ok) drawAvatar(ctx, body, { x: youX, y: youY, height: youH, back: true });

        // The racket, held in the playing hand and swung with it.
        const hand = body?.ok ? (rightHanded ? body.hands.right : body.hands.left) : null;
        const swing = hand ? clamp(hand.vx * (rightHanded ? 0.3 : -0.3), -1, 1) : 0;
        const side = rightHanded ? 1 : -1;
        const rx = youX + side * youH * (0.3 + swing * 0.3);
        const ry = youY - youH * (0.52 + (hand ? clamp((0.6 - hand.y) * 1.2) : 0.1) * 0.2);
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(side * (0.5 - swing * 1.1));
        ctx.strokeStyle = '#2d3b45';
        ctx.lineWidth = youH * 0.05;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, youH * 0.22);
        ctx.lineTo(0, 0);
        ctx.stroke();
        ctx.fillStyle = '#f7fbfd';
        ctx.beginPath();
        ctx.ellipse(0, -youH * 0.14, youH * 0.14, youH * 0.19, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2d3b45';
        ctx.lineWidth = youH * 0.028;
        ctx.beginPath();
        ctx.ellipse(0, -youH * 0.14, youH * 0.14, youH * 0.19, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(45,59,69,0.28)';
        ctx.lineWidth = 1.2;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(i * youH * 0.045, -youH * 0.32);
          ctx.lineTo(i * youH * 0.045, youH * 0.04);
          ctx.moveTo(-youH * 0.135, -youH * 0.14 + i * youH * 0.06);
          ctx.lineTo(youH * 0.135, -youH * 0.14 + i * youH * 0.06);
          ctx.stroke();
        }
        ctx.restore();

        // The hitting band, so the timing is something you can see and learn.
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
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
        const by = b.y * h - b.height * h * 0.12;
        const fuzz = ctx.createRadialGradient(b.x * w - 3, by - 3, 1, b.x * w, by, 10);
        fuzz.addColorStop(0, '#e9f58a');
        fuzz.addColorStop(1, '#c6d436');
        ctx.fillStyle = fuzz;
        ctx.beginPath();
        ctx.arc(b.x * w, by, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(b.x * w - 7, by, 9, -0.7, 0.7);
        ctx.stroke();
        ctx.restore();

        drawScorebar(ctx, w, { name: 'You', score: state.scores[0] },
          { name: twoPlayer ? 'Player 2' : 'Computer', score: state.scores[1] });
        if (state.rally > 2) text(ctx, `Rally ${state.rally}`, w / 2, 92, { size: 15, color: PALETTE.dim });

        ctx.fillStyle = PALETTE.paper;
        roundRect(ctx, 18, h - 70, 180, 54, 12);
        ctx.fill();
        drawMeter(ctx, 30, h - 40, 156, 14, state.court, PALETTE.blue);
        text(ctx, 'court position', 108, h - 52, { size: 11, color: PALETTE.inkSoft });
        if (state.serveIn > 0) text(ctx, 'Get ready', w / 2, h * 0.42, { size: 42, weight: 700 });
      },
    };
  },
};
