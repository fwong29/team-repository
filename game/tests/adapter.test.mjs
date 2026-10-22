// adapter.test.mjs: the 3D adapter reads a lot of fields off each sport's
// state. A typo there is invisible until someone plays that sport, so this
// walks every sport and touches every field the adapter uses.
//
//   node game/tests/adapter.test.mjs

import { tennis } from '../sports/tennis.js';
import { boxing } from '../sports/boxing.js';
import { golf } from '../sports/golf.js';
import { baseball } from '../sports/baseball.js';
import { basketball } from '../sports/basketball.js';
import { bowling } from '../sports/bowling.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

const body = () => ({
  ok: true, scale: 0.2, centre: { x: 0.5, y: 0.35 }, lean: 0, turn: 0,
  calib: { shoulderSpan: 0.2, armLength: 0.26, neutralCm: 150 },
  hands: {
    left: { x: 0.4, y: 0.5, vx: 0, vy: 0, speed: 0, extension: 0.6, up: false, visible: true, acrossBody: -0.4, elbowAngle: 140 },
    right: { x: 0.6, y: 0.5, vx: 0, vy: 0, speed: 0, extension: 0.6, up: false, visible: true, acrossBody: 0.4, elbowAngle: 140 },
  },
});
const input = { depth01: 0.5, distanceCm: 150, player: () => body(), playerCount: 1,
                calib: { shoulderSpan: 0.2, armLength: 0.26, neutralCm: 150 } };
const toasts = { add() {} };

const EVENTS = [
  { type: 'swing', side: 'right', speed: 6, power: 0.7, dirX: -1, dirY: 0, plane: 'horizontal', across: 0.4, apex: 0.3, angle: 175, player: 0 },
  { type: 'punch', side: 'right', power: 0.8, extension: 1, depth: 0.4, high: true, player: 0 },
  { type: 'shoot', power: 0.7, arc: 0.6, reach: 1, player: 0 },
];

// Exactly the fields game/three/main3d.js reaches for, per sport.
const READS = {
  tennis: s => [s.ball.x, s.ball.y, s.ball.height, s.farX, s.scores[0], s.scores[1], s.rally],
  boxing: s => [s.health[0], s.health[1], s.stamina, s.windup, s.attackSide],
  golf: s => [s.hole, s.ball.along, s.ball.off, s.strokes[s.turn], s.lie,
              s.flight ? [s.flight.t, s.flight.power, s.flight.from.along, s.flight.to.off] : 0],
  baseball: s => [s.runs[0], s.strikes, s.outs,
                  s.pitch ? [s.pitch.t, s.pitch.duration, s.pitch.x, s.pitch.curve] : 0],
  basketball: s => [s.scores[0], s.spot, s.time,
                    s.shot ? [s.shot.t, s.shot.arc, s.shot.good, s.shot.off] : 0],
  bowling: s => [s.total, s.frame, s.standing.length,
                 s.ball ? [s.ball.t, s.ball.x, s.ball.hook] : 0],
};

for (const sport of [tennis, boxing, golf, baseball, basketball, bowling]) {
  console.log(`\n${sport.label}`);
  const scene = sport.create({ input, toasts, twoPlayer: false, difficulty: 1 });
  ok('exposes state', !!scene.state);
  if (sport.id === 'golf') {
    ok('exposes the hole being played', !!scene.hole && typeof scene.hole.bend === 'number',
       JSON.stringify(scene.hole)?.slice(0, 60));
    ok('exposes the hole count', scene.holeCount > 1, String(scene.holeCount));
  }

  // Run a while, firing gestures, reading every field the adapter reads.
  let touched = 0, frames = 0, broke = null;
  try {
    for (let i = 0; i < 900 && !scene.done; i++) {
      scene.update(1 / 60, 1000 + i * 16, i % 23 === 0 ? EVENTS : []);
      frames++;
      const values = READS[sport.id](scene.state);
      for (const v of values.flat()) {
        if (v === undefined) throw new Error('a field the adapter reads is undefined');
        touched++;
      }
    }
  } catch (err) { broke = err.message; }
  ok('every field the 3D adapter reads exists', !broke, broke || '');
  // Enough frames to reach the interesting states (a ball in flight, a shot
  // in the air, a pitch on the way), however long the sport itself lasts.
  ok('ran to a real state', frames > 40 && touched > 100, `${frames} frames, ${touched} reads`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
