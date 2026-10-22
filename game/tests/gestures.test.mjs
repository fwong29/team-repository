// gestures.test.mjs: the gesture detectors, fed synthetic landmark sequences.
//
// No camera, no Arduino, no browser. Every detector in input.js is pure
// arithmetic over landmark arrays, so a made-up body moving in a made-up way
// is enough to prove a swing is a swing and a still player fires nothing.
//
//   node game/tests/gestures.test.mjs

import { Input } from '../input.js';
import { L } from '../tracker.js';
import { OneEuro, Median } from '../filters.js';

let passed = 0, failed = 0;

function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

// A body standing square to the camera. Shoulders 0.2 apart, arms at the side.
function standing({ rightWrist, leftWrist, nose } = {}) {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, v: 0.95 }));
  const put = (i, x, y, z = 0) => { points[i] = { x, y, z, v: 0.95 }; };
  put(L.nose, nose?.x ?? 0.5, nose?.y ?? 0.22);
  put(L.leftShoulder, 0.40, 0.35);
  put(L.rightShoulder, 0.60, 0.35);
  put(L.leftElbow, 0.37, 0.47);
  put(L.rightElbow, 0.63, 0.47);
  put(L.leftWrist, leftWrist?.x ?? 0.36, leftWrist?.y ?? 0.58, leftWrist?.z ?? 0);
  put(L.rightWrist, rightWrist?.x ?? 0.64, rightWrist?.y ?? 0.58, rightWrist?.z ?? 0);
  put(L.leftHip, 0.43, 0.62);
  put(L.rightHip, 0.57, 0.62);
  put(L.leftKnee, 0.43, 0.78);
  put(L.rightKnee, 0.57, 0.78);
  put(L.leftAnkle, 0.43, 0.92);
  put(L.rightAnkle, 0.57, 0.92);
  return points;
}

const CALIB = { shoulderSpan: 0.20, armLength: 0.26, bodyHeight: 0.55, neutralCm: 150 };

// A stand-in for the camera and the Arduino. Both are just values the input
// layer reads, so a test can set them directly.
function rig({ cm = null } = {}) {
  const tracker = { poses: [], poll: () => true, fps: 30 };
  const ultrasonic = {
    cm, at: 0, connected: cm !== null, rawLine: '',
    get fresh() { return cm !== null; },
  };
  const input = new Input(tracker, ultrasonic, CALIB);
  let now = 1000;
  return {
    input,
    setDistance(value) { ultrasonic.cm = value; },
    // Runs one frame and returns the events it produced.
    step(points, ms = 1000 / 60) {
      tracker.poses = points ? [points] : [];
      now += ms;
      return input.update(now).map(e => ({ ...e }));
    },
  };
}

function run(name, fn) {
  console.log(`\n${name}`);
  fn();
}

run('a still body fires nothing', () => {
  const r = rig();
  let events = [];
  for (let i = 0; i < 60; i++) events = events.concat(r.step(standing()));
  const noise = events.filter(e => ['swing', 'punch', 'shoot'].includes(e.type));
  check('no phantom swings or punches', noise.length === 0, `got ${noise.map(e => e.type)}`);
});

run('a wrist thrown across the body is a swing', () => {
  const r = rig();
  for (let i = 0; i < 10; i++) r.step(standing());          // settle the filters
  let events = [];
  // Accelerate the right wrist across, then stop: the detector fires on the
  // fall away from peak speed, not on the first fast frame.
  const path = [0.66, 0.68, 0.66, 0.58, 0.46, 0.36, 0.30, 0.29, 0.29, 0.29, 0.29, 0.29];
  for (const x of path) events = events.concat(r.step(standing({ rightWrist: { x, y: 0.56 } })));
  for (let i = 0; i < 6; i++) events = events.concat(r.step(standing({ rightWrist: { x: 0.29, y: 0.56 } })));

  const swing = events.find(e => e.type === 'swing');
  check('a swing was detected', !!swing);
  check('it was on the right side', swing?.side === 'right', swing?.side);
  check('it read as horizontal', swing?.plane === 'horizontal', swing?.plane);
  check('it travelled leftward', swing?.dirX === -1, String(swing?.dirX));
  check('it carries usable power', swing?.power > 0.1 && swing?.power <= 1, String(swing?.power));
});

run('a swing fires once, not once per frame', () => {
  const r = rig();
  for (let i = 0; i < 10; i++) r.step(standing());
  let events = [];
  const path = [0.66, 0.64, 0.56, 0.44, 0.34, 0.30, 0.29, 0.29, 0.29, 0.29];
  for (const x of path) events = events.concat(r.step(standing({ rightWrist: { x, y: 0.56 } })));
  for (let i = 0; i < 10; i++) events = events.concat(r.step(standing({ rightWrist: { x: 0.29, y: 0.56 } })));
  const swings = events.filter(e => e.type === 'swing');
  check('exactly one swing event', swings.length === 1, `got ${swings.length}`);
});

run('an arm thrown at the camera is a punch', () => {
  const r = rig({ cm: 150 });
  const guard = z => standing({ rightWrist: { x: 0.56, y: 0.42, z }, leftWrist: { x: 0.44, y: 0.42 } });
  for (let i = 0; i < 14; i++) r.step(guard(0));   // settle in the guard
  let events = [];
  // The wrist barely moves on screen. What changes is z, coming toward the
  // lens, and the distance reading closing. This is the case the camera alone
  // cannot see, and the whole reason the HC-SR04 is in the project.
  const depths = [-0.04, -0.10, -0.17, -0.23, -0.27, -0.30, -0.32];
  depths.forEach((z, i) => {
    r.setDistance(150 - i * 5);
    events = events.concat(r.step(guard(z)));
  });

  const punch = events.find(e => e.type === 'punch');
  check('a punch was detected', !!punch);
  check('it was the right hand', punch?.side === 'right', punch?.side);
  check('the sensor contributed depth', punch?.depth > 0, String(punch?.depth));
  check('power is in range', punch?.power > 0 && punch?.power <= 1, String(punch?.power));
});

run('a raised hand confirms', () => {
  const r = rig();
  let events = [];
  for (let i = 0; i < 40; i++) {
    events = events.concat(r.step(standing({ rightWrist: { x: 0.64, y: 0.18 } })));
  }
  const raises = events.filter(e => e.type === 'raise');
  check('raise fired', raises.length >= 1);
  check('raise fired only once while held', raises.length === 1, `got ${raises.length}`);
});

run('both arms overhead pauses', () => {
  const r = rig();
  let events = [];
  for (let i = 0; i < 80; i++) {
    events = events.concat(r.step(standing({
      rightWrist: { x: 0.62, y: 0.10 },
      leftWrist: { x: 0.38, y: 0.10 },
    })));
  }
  check('pause fired', events.some(e => e.type === 'pause'));
});

run('a body that leaves the frame freezes instead of lying', () => {
  const r = rig();
  for (let i = 0; i < 10; i++) r.step(standing());
  let events = [];
  for (let i = 0; i < 20; i++) events = events.concat(r.step(null));
  check('nothing fires with no body', events.filter(e => e.type !== 'step').length === 0);
  check('player count drops to zero', r.input.playerCount === 0);
});

run('distance falls back to the camera with no sensor', () => {
  const r = rig();                 // no ultrasonic
  for (let i = 0; i < 12; i++) r.step(standing());
  check('a distance is still reported', Number.isFinite(r.input.distanceCm));
  check('it says where it came from', r.input.distanceFrom === 'camera', r.input.distanceFrom);
});

run('filters behave', () => {
  const m = new Median(5);
  [10, 10, 400, 10, 10].forEach(v => m.push(v));
  check('median rejects a single spike', m.push(10) === 10);

  const f = new OneEuro({ minCutoff: 1.7, beta: 0.4, dCutoff: 1 });
  let out = 0;
  for (let i = 0; i < 40; i++) out = f.filter(1, 1 / 60);
  check('a constant signal converges', Math.abs(out - 1) < 0.02, String(out));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
