// bowling.js: ten frames, proper scoring.
//
// What the body does: an underarm roll. Swing your arm down and forward and
// let go low. Swing speed is ball speed; the angle your hand travels through
// is the line the ball takes; and how much the hand cuts across decides the
// hook. Nothing is thrown with the keyboard.
//
// The pins are knocked down by a model rather than by physics: the ball's
// position at the deck decides which pins it hits, and those pins pass the hit
// on to their neighbours with a chance that falls off down the chain. That is
// enough to make pocket hits, splits and taps all happen on their own.

import { PALETTE, text, roundRect } from '../ui.js';
import { clamp, lerp } from '../filters.js';
import { Sound } from '../audio.js';

// Standard layout, in metres from the headpin. 12 inches between centres.
const SPACING = 0.3048;
export const PINS = [
  { n: 1,  x: 0,             z: 0 },
  { n: 2,  x: -SPACING / 2,  z: -0.264 },
  { n: 3,  x: SPACING / 2,   z: -0.264 },
  { n: 4,  x: -SPACING,      z: -0.528 },
  { n: 5,  x: 0,             z: -0.528 },
  { n: 6,  x: SPACING,       z: -0.528 },
  { n: 7,  x: -SPACING * 1.5, z: -0.792 },
  { n: 8,  x: -SPACING / 2,  z: -0.792 },
  { n: 9,  x: SPACING / 2,   z: -0.792 },
  { n: 10, x: SPACING * 1.5, z: -0.792 },
];

const LANE_HALF = 0.533;          // a lane is 1.066 m between the gutters

export const bowling = {
  id: 'bowling',
  label: 'Bowling',
  note: 'Roll it down the lane',
  twoPlayerStyle: 'turns',
  tutorial: [
    'Stand side-on with room to swing your arm.',
    'Swing down and forward, underarm, and release low.',
    'Swing faster for a quicker ball.',
    'Cut across the ball to put hook on it.',
  ],
  icon(ctx, x, y, r) {
    ctx.save();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = r * 0.13;
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y + r * 0.3, r * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x + r * (0.25 + i * 0.3), y + r * 0.7);
      ctx.lineTo(x + r * (0.25 + i * 0.3), y - r * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  },

  create({ input, toasts, twoPlayer, difficulty }) {
    // A harder setting makes the pins less generous about passing a hit on.
    const chain = [0.92, 0.82, 0.72][difficulty];

    const state = {
      frame: 0,
      roll: 0,                    // 0 or 1 within the frame; the 10th allows 2
      rolls: [],                  // every roll's pin count, in order
      standing: PINS.map(p => p.n),
      ball: null,                 // { t, x, hook, speed } while it is travelling
      total: 0,
      turn: 0,
      lastHit: null,
      message: '',
      done: false,
    };

    function resetPins() { state.standing = PINS.map(p => p.n); }

    // Standard scoring, walked from the start each time: a strike is worth ten
    // plus the next two rolls, a spare ten plus the next one.
    function score() {
      let total = 0, i = 0;
      for (let frame = 0; frame < 10 && i < state.rolls.length; frame++) {
        if (state.rolls[i] === 10) {
          total += 10 + (state.rolls[i + 1] ?? 0) + (state.rolls[i + 2] ?? 0);
          i += 1;
        } else if ((state.rolls[i] ?? 0) + (state.rolls[i + 1] ?? 0) === 10) {
          total += 10 + (state.rolls[i + 2] ?? 0);
          i += 2;
        } else {
          total += (state.rolls[i] ?? 0) + (state.rolls[i + 1] ?? 0);
          i += 2;
        }
      }
      return total;
    }

    // Which pins go down. The ball takes out whatever it passes through, then
    // each fallen pin gets a chance at its neighbours, weaker each step along
    // the chain — which is where splits and taps come from.
    function knockDown(entryX) {
      const hit = new Set();
      const BALL_R = 0.108;
      for (const pin of PINS) {
        if (!state.standing.includes(pin.n)) continue;
        if (Math.abs(pin.x - entryX) < BALL_R + 0.06) hit.add(pin.n);
      }

      let wave = [...hit];
      let strength = chain;
      while (wave.length && strength > 0.2) {
        const next = [];
        for (const n of wave) {
          const from = PINS.find(p => p.n === n);
          for (const pin of PINS) {
            if (hit.has(pin.n) || !state.standing.includes(pin.n)) continue;
            const d = Math.hypot(pin.x - from.x, pin.z - from.z);
            if (d < SPACING * 1.25 && Math.random() < strength) {
              hit.add(pin.n);
              next.push(pin.n);
            }
          }
        }
        wave = next;
        strength *= 0.62;
      }
      return [...hit];
    }

    function land() {
      const b = state.ball;
      const entryX = b.x + b.hook;                 // where it crosses the deck
      let down = [];

      if (Math.abs(entryX) > LANE_HALF - 0.05) {
        toasts.add('Gutter', { color: PALETTE.inkSoft, size: 26 });
        Sound.miss();
      } else {
        down = knockDown(entryX);
        state.standing = state.standing.filter(n => !down.includes(n));
        if (down.length) Sound.thud(clamp(down.length / 10));
      }

      const pocket = Math.abs(entryX - (-0.085)) < 0.07;
      state.lastHit = {
        speedMph: Math.round(b.speed * 0.45 * 2.237 * 10) / 10,
        line: Math.abs(entryX) > LANE_HALF - 0.05 ? 'gutter'
          : pocket ? 'pocket' : entryX < 0 ? 'left' : 'right',
        hook: `${b.hook >= 0 ? '+' : ''}${(b.hook * 100).toFixed(0)} cm`,
        pins: down.length,
      };

      state.rolls.push(down.length);
      state.ball = null;

      const firstRoll = state.roll === 0;
      const cleared = state.standing.length === 0;

      if (firstRoll && cleared) {
        toasts.add('STRIKE', { color: PALETTE.gold, size: 46 });
        Sound.crowd(1.1);
      } else if (!firstRoll && cleared) {
        toasts.add('Spare', { color: PALETTE.gold, size: 34 });
        Sound.crowd(0.5);
      } else if (!down.length && !firstRoll) {
        toasts.add('Open frame', { color: PALETTE.inkSoft, size: 22 });
      }

      state.total = score();

      // On to the next roll, or the next frame.
      const tenth = state.frame === 9;
      if (tenth) {
        // The tenth gives you a third roll if you struck or spared.
        const rollsThisFrame = state.rolls.length - frameStartIndex();
        const earned = cleared || rollsThisFrame < 2;
        if (rollsThisFrame >= 3 || (rollsThisFrame === 2 && !earnedBonus())) {
          state.done = true;
        } else {
          if (cleared) resetPins();
          state.roll++;
        }
      } else if (firstRoll && !cleared) {
        state.roll = 1;
      } else {
        state.frame++;
        state.roll = 0;
        resetPins();
      }
    }

    // Where this frame's rolls begin in the flat list.
    function frameStartIndex() {
      let i = 0;
      for (let f = 0; f < state.frame; f++) {
        if (state.rolls[i] === 10) i += 1;
        else i += 2;
      }
      return i;
    }

    function earnedBonus() {
      const start = frameStartIndex();
      const a = state.rolls[start] ?? 0, b = state.rolls[start + 1] ?? 0;
      return a === 10 || a + b === 10;
    }

    function roll(event) {
      if (state.ball || state.done) return;
      // A roll is an underarm swing: down and forward, released low. The
      // sideways component of the same swing is the hook.
      const speed = Math.max(2.8, event.speed);
      state.ball = {
        t: 0,
        speed,
        // Where it starts across the lane, from how far the hand was out.
        x: clamp(event.across * 0.5, -1, 1) * LANE_HALF * 0.75,
        // Hook: the angle the hand travelled through, scaled by how long the
        // ball is on the lane — a slower ball has more time to curve.
        hook: clamp((event.angle + 90) / 90, -1.5, 1.5) * 0.12 * (6 / speed),
        travel: 1.6 + speed * 0.1,
      };
      Sound.whoosh(clamp(speed / 9));
    }

    return {
      get state() { return state; },
      get done() { return state.done; },
      get result() {
        return {
          score: state.total,
          win: state.total >= 100,
          detail: `${state.total} pins`,
        };
      },

      update(dt, now, events) {
        for (const e of events) {
          if (e.type !== 'swing') continue;
          if (twoPlayer && e.player !== state.turn) continue;
          roll(e);
        }
        if (state.ball) {
          state.ball.t += dt / state.ball.travel;
          if (state.ball.t >= 1) land();
        }
      },

      // A plain overhead lane, for the flat build and for testing.
      draw(ctx, w, h) {
        ctx.fillStyle = '#2d3b45';
        ctx.fillRect(0, 0, w, h);
        const laneW = w * 0.3, laneX = w / 2 - laneW / 2;
        ctx.fillStyle = PALETTE.wood;
        ctx.fillRect(laneX, 0, laneW, h);
        ctx.fillStyle = '#1b2029';
        ctx.fillRect(laneX - laneW * 0.1, 0, laneW * 0.1, h);
        ctx.fillRect(laneX + laneW, 0, laneW * 0.1, h);

        const toX = x => laneX + laneW * (0.5 + x / (LANE_HALF * 2));
        const deckY = h * 0.16;
        for (const pin of PINS) {
          if (!state.standing.includes(pin.n)) continue;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(toX(pin.x), deckY + pin.z * -70, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = PALETTE.red;
          ctx.fillRect(toX(pin.x) - 6, deckY + pin.z * -70 - 2, 12, 2.5);
        }
        if (state.ball) {
          const t = state.ball.t;
          const x = state.ball.x + state.ball.hook * t * t;
          ctx.fillStyle = '#5aa8ea';
          ctx.beginPath();
          ctx.arc(toX(x), lerp(h * 0.95, deckY, t), 12, 0, Math.PI * 2);
          ctx.fill();
        }
        text(ctx, String(state.total), w / 2, 40, { size: 30, weight: 700, color: '#ffffff' });
        text(ctx, `frame ${Math.min(10, state.frame + 1)} of 10`, w / 2, 66,
          { size: 13, color: PALETTE.dim });
      },
    };
  },
};
