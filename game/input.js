// input.js: the whole input layer, and the only file that knows a camera and an
// ultrasonic sensor exist. Everything above it — menus, all five sports — reads
// two things and nothing else:
//
//   state   continuous values: where the hands are, how fast, how far away
//   events  discrete things that happened: a swing, a punch, a shot, a step
//
// Swap the sensors out and the games do not change. That is the point.
//
// Thresholds are in BODY UNITS (one shoulder width), so a tall player near the
// camera and a short one across the room read the same.

import { CONFIG } from './config.js';
import { OneEuro, clamp } from './filters.js';
import { L } from './tracker.js';

const JOINTS = Object.values(L);
const SAVE_KEY = 'motion-sports-calibration-v1';

// ---- Calibration -----------------------------------------------------------
// Measured once, standing in the play position: how wide the shoulders read,
// how long the arm is, how tall the body is, and how far the sensor says that
// is. Everything else is a ratio against these.

export const Calibration = {
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; } // private window, blocked storage: just recalibrate
  },
  save(value) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(value)); } catch { /* fine */ }
  },
  clear() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* fine */ }
  },
  get default() {
    return { shoulderSpan: 0.22, armLength: 0.30, bodyHeight: 0.55, neutralCm: 150 };
  },
};

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// Reach, including depth. MediaPipe's z runs in roughly the same units as x
// and gets smaller as a joint comes toward the camera, so a punch thrown at
// the lens grows this number even though the wrist hardly moves on screen.
function reach(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function angleAt(a, b, c) { // the angle at b, in degrees
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (mag === 0) return 180;
  return (Math.acos(clamp(dot / mag, -1, 1)) * 180) / Math.PI;
}

// ---- One body --------------------------------------------------------------
// Smoothing, the derived measurements, and the gesture state machines for a
// single tracked person. Two of these run in a two-player game.

class Body {
  constructor(calib) {
    this.calib = calib;
    this.ok = false;
    this.joints = {};
    this.filters = {};
    for (const i of JOINTS) {
      this.filters[i] = {
        x: new OneEuro(CONFIG.smoothing),
        y: new OneEuro(CONFIG.smoothing),
        z: new OneEuro(CONFIG.depthSmoothing),
      };
    }
    this.scale = calib.shoulderSpan;
    this.hands = {
      left: { x: 0.5, y: 0.5, speed: 0, vx: 0, vy: 0, extension: 0, up: false },
      right: { x: 0.5, y: 0.5, speed: 0, vx: 0, vy: 0, extension: 0, up: false },
    };
    this.lean = 0;
    this.turn = 0;
    this.centre = { x: 0.5, y: 0.5 };
    this._prev = { left: null, right: null };
    this._swing = { left: null, right: null };
    this._cool = { swingLeft: 0, swingRight: 0, punchLeft: 0, punchRight: 0, shoot: 0 };
    this._raise = { since: 0, fired: false };
    this._wave = { swaps: 0, since: 0, sign: 0 };
    this._pause = { since: 0, fired: false };
    this._shoot = { armed: false, peak: 0 };
  }

  // points: one pose's 33 landmarks, already mirrored. dt in seconds.
  update(points, dt, now, events, depthCm) {
    const visible = points && points[L.leftShoulder] && points[L.rightShoulder] &&
      points[L.leftShoulder].v > CONFIG.minVisibility &&
      points[L.rightShoulder].v > CONFIG.minVisibility;

    if (!visible) {
      // A landmark we cannot see is missing, never zero. Freezing beats
      // reporting a phantom swing from a limb that left the frame.
      this.ok = false;
      this.hands.left.speed = 0;
      this.hands.right.speed = 0;
      this._prev.left = this._prev.right = null;
      this._swing.left = this._swing.right = null;
      return;
    }
    this.ok = true;

    for (const i of JOINTS) {
      const p = points[i];
      if (!p) continue;
      this.joints[i] = {
        x: this.filters[i].x.filter(p.x, dt),
        y: this.filters[i].y.filter(p.y, dt),
        z: this.filters[i].z.filter(p.z ?? 0, dt),
        v: p.v,
      };
    }

    const ls = this.joints[L.leftShoulder], rs = this.joints[L.rightShoulder];
    const lh = this.joints[L.leftHip], rh = this.joints[L.rightHip];

    // Body units. Shoulder span shrinks with distance and with turning, so it
    // is floored: a half-turned player should not make every threshold double.
    this.scale = Math.max(dist(ls, rs), this.calib.shoulderSpan * 0.45);
    this.centre = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };

    const hipCentre = lh && rh ? { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 } : this.centre;
    this.lean = clamp((this.centre.x - hipCentre.x) / (this.calib.shoulderSpan * 0.6), -1, 1);
    this.turn = clamp(1 - dist(ls, rs) / this.calib.shoulderSpan, -1, 1);

    this.measureHand('left', L.leftShoulder, L.leftElbow, L.leftWrist, dt);
    this.measureHand('right', L.rightShoulder, L.rightElbow, L.rightWrist, dt);

    this.detectSwing('left', now, events);
    this.detectSwing('right', now, events);
    this.detectPunch('left', now, events, depthCm);
    this.detectPunch('right', now, events, depthCm);
    this.detectShoot(now, events);
    this.detectRaise(now, events);
    this.detectWave(now, events);
    this.detectPause(now, events);
  }

  measureHand(side, shoulderIdx, elbowIdx, wristIdx, dt) {
    const hand = this.hands[side];
    const shoulder = this.joints[shoulderIdx];
    const elbow = this.joints[elbowIdx];
    const wrist = this.joints[wristIdx];
    if (!wrist || !shoulder) { hand.speed = 0; return; }

    const prev = this._prev[side];
    hand.x = wrist.x;
    hand.y = wrist.y;
    hand.visible = wrist.v > CONFIG.minVisibility;

    if (prev && dt > 0) {
      // Body units per second: divide the movement by shoulder width.
      hand.vx = ((wrist.x - prev.x) / this.scale) / dt;
      hand.vy = ((wrist.y - prev.y) / this.scale) / dt;
      hand.speed = Math.hypot(hand.vx, hand.vy);
    } else {
      hand.vx = hand.vy = hand.speed = 0;
    }
    this._prev[side] = { x: wrist.x, y: wrist.y };

    hand.extension = clamp(reach(shoulder, wrist) / this.calib.armLength, 0, 1.4);
    hand.elbowAngle = elbow ? angleAt(shoulder, elbow, wrist) : 180;
    hand.up = wrist.y < shoulder.y;
    // How far the hand sits from the body's midline, signed. Tennis reads this
    // to tell a forehand from a backhand.
    hand.acrossBody = (wrist.x - this.centre.x) / this.scale;
  }

  // A swing: speed climbs past the threshold, peaks, then falls away. Firing on
  // the fall rather than the rise means the event carries the real peak speed
  // and the real direction, not whatever the first fast frame happened to be.
  detectSwing(side, now, events) {
    const hand = this.hands[side];
    const key = side === 'left' ? 'swingLeft' : 'swingRight';
    if (now < this._cool[key]) return;

    let swing = this._swing[side];
    if (!swing) {
      if (hand.speed < CONFIG.gestures.swingSpeed) return;
      this._swing[side] = {
        peak: hand.speed, vx: hand.vx, vy: hand.vy,
        startX: hand.acrossBody, fromX: hand.x, fromY: hand.y, top: hand.y,
      };
      return;
    }
    if (hand.speed > swing.peak) {
      swing.peak = hand.speed;
      swing.vx = hand.vx;
      swing.vy = hand.vy;
    }
    swing.top = Math.min(swing.top, hand.y);

    if (hand.speed > swing.peak * CONFIG.gestures.swingRelease) return;

    // Net travel over the whole swing, not one frame's velocity: a single
    // bad landmark frame can point the wrong way, a whole swing cannot.
    const travelX = hand.x - swing.fromX;
    const travelY = hand.y - swing.fromY;
    const horizontal = Math.abs(travelX) >= Math.abs(travelY);
    events.push({
      type: 'swing',
      side,
      speed: swing.peak,
      power: clamp((swing.peak - CONFIG.gestures.swingSpeed) / 5),
      dirX: Math.sign(travelX) || Math.sign(swing.vx),
      dirY: Math.sign(travelY) || Math.sign(swing.vy),
      plane: horizontal ? 'horizontal' : 'vertical',
      // Positive means the hand finished on its own side of the body.
      across: hand.acrossBody - swing.startX,
      apex: swing.top,
      angle: (Math.atan2(travelY, travelX) * 180) / Math.PI,
    });
    this._swing[side] = null;
    this._cool[key] = now + CONFIG.gestures.swingCooldownMs;
  }

  // A punch is an arm extending along the axis the camera cannot see. In the
  // picture it barely moves, which is exactly why the HC-SR04 is here: a real
  // punch pulls the distance reading in. Without the sensor we fall back to
  // extension speed alone, which works but forgives more.
  detectPunch(side, now, events, depthCm) {
    const hand = this.hands[side];
    const key = side === 'left' ? 'punchLeft' : 'punchRight';
    if (now < this._cool[key]) return;
    if (!hand.visible) return;

    const prevExt = hand._prevExtension ?? hand.extension;
    const rate = (hand.extension - prevExt) * 60; // per second at 60fps
    hand._prevExtension = hand.extension;

    // A punch comes from the guard, not from an arm hanging at the side —
    // and a hanging arm already reads as near-full extension.
    if (hand.y > this.centre.y + this.scale * 0.6) return;
    if (hand.extension < CONFIG.gestures.punchExtension) return;
    if (rate < CONFIG.gestures.punchSpeed * 0.12) return;
    // Lateral speed well above the extension rate means this is a swing
    // travelling across the body, not a punch going away from it.
    if (Math.abs(hand.vx) > 2.4 && Math.abs(hand.vx) > rate * 2.5) return;

    const depth = depthCm && depthCm.closing > 0 ? clamp(depthCm.closing / 18) : 0;
    events.push({
      type: 'punch',
      side,
      power: clamp(0.35 + rate * 0.18 + depth * 0.45),
      extension: hand.extension,
      depth,
      high: hand.y < this.centre.y,
    });
    this._cool[key] = now + CONFIG.gestures.punchCooldownMs;
  }

  // A shot: both hands rise from below the shoulders and push up and out. It
  // fires at the top, where the hands stop climbing.
  detectShoot(now, events) {
    const left = this.hands.left, right = this.hands.right;
    if (now < this._cool.shoot) return;

    const bothUp = left.up && right.up;
    const rising = -(left.vy + right.vy) / 2;
    const reach = (left.extension + right.extension) / 2;

    if (!this._shoot.armed) {
      if (!left.up && !right.up) this._shoot.armed = true; // loaded at the chest
      return;
    }
    if (!bothUp) return;
    if (rising > this._shoot.peak) { this._shoot.peak = rising; return; }
    if (this._shoot.peak < CONFIG.gestures.shootSpeed) return;
    if (rising > this._shoot.peak * 0.45) return;

    const elbow = (left.elbowAngle + right.elbowAngle) / 2;
    events.push({
      type: 'shoot',
      power: clamp((this._shoot.peak - 0.8) / 3.2),
      // A straighter arm at release throws flatter; a bent one lobs it.
      arc: clamp(1 - (elbow - 90) / 90),
      reach,
    });
    this._shoot = { armed: false, peak: 0 };
    this._cool.shoot = now + CONFIG.gestures.shootCooldownMs;
  }

  // One hand held above the shoulder. The menus use this to confirm.
  detectRaise(now, events) {
    const up = (this.hands.left.up && this.hands.left.visible) ||
               (this.hands.right.up && this.hands.right.visible);
    if (!up) { this._raise = { since: 0, fired: false }; return; }
    if (!this._raise.since) this._raise.since = now;
    if (this._raise.fired) return;
    if (now - this._raise.since >= CONFIG.gestures.raiseHoldMs) {
      events.push({ type: 'raise' });
      this._raise.fired = true;
    }
  }

  // A wave: a raised hand changing direction a few times in a second or so.
  // This is "go back" everywhere in the game.
  detectWave(now, events) {
    const hand = this.hands.right.up ? this.hands.right : this.hands.left;
    if (!hand.up || !hand.visible || Math.abs(hand.vx) < 1.1) return;
    const sign = Math.sign(hand.vx);
    if (now - this._wave.since > CONFIG.gestures.waveWindowMs) {
      this._wave = { swaps: 0, since: now, sign };
      return;
    }
    if (sign !== 0 && sign !== this._wave.sign) {
      this._wave.sign = sign;
      this._wave.swaps++;
      if (this._wave.swaps >= CONFIG.gestures.waveSwaps) {
        events.push({ type: 'wave' });
        this._wave = { swaps: 0, since: now, sign };
      }
    }
  }

  // Both arms straight overhead. Pause and quit hang off this one.
  detectPause(now, events) {
    const nose = this.joints[L.nose];
    const both = nose &&
      this.hands.left.y < nose.y && this.hands.right.y < nose.y &&
      this.hands.left.visible && this.hands.right.visible;
    if (!both) { this._pause = { since: 0, fired: false }; return; }
    if (!this._pause.since) this._pause.since = now;
    if (this._pause.fired) return;
    if (now - this._pause.since >= CONFIG.gestures.pauseHoldMs) {
      events.push({ type: 'pause' });
      this._pause.fired = true;
    }
  }
}

// ---- The input layer -------------------------------------------------------

export class Input {
  constructor(tracker, ultrasonic, calib) {
    this.tracker = tracker;
    this.ultrasonic = ultrasonic;
    this.calib = calib || Calibration.load() || Calibration.default;
    this.bodies = [new Body(this.calib), new Body(this.calib)];
    this.events = [];
    this.distanceCm = this.calib.neutralCm;
    this.distanceFrom = 'none';
    this._depthHistory = [];
    this._step = 'neutral';
    this._last = performance.now();
  }

  recalibrate(calib) {
    this.calib = calib;
    Calibration.save(calib);
    this.bodies = [new Body(calib), new Body(calib)];
  }

  // The player count the games see. Zero means nobody has stepped in yet.
  get playerCount() { return this.bodies.filter(b => b.ok).length; }
  player(i) { return this.bodies[i]; }

  // Fusing the two sensors. The ultrasonic is the truth when it is talking;
  // when it is not, shoulder width stands in — wider means nearer — so the
  // whole game still plays on a laptop with no Arduino attached.
  fuseDistance(body) {
    if (this.ultrasonic?.fresh) {
      this.distanceFrom = 'sensor';
      return this.ultrasonic.cm;
    }
    if (body?.ok && body.scale > 0) {
      this.distanceFrom = 'camera';
      return this.calib.neutralCm * (this.calib.shoulderSpan / body.scale);
    }
    this.distanceFrom = 'none';
    return this.calib.neutralCm;
  }

  update(now = performance.now()) {
    const dt = Math.min(0.1, (now - this._last) / 1000) || 1 / 60;
    this._last = now;
    this.events.length = 0;

    this.tracker.poll();
    const poses = this.tracker.poses;

    this.distanceCm = this.fuseDistance(this.bodies[0].ok ? this.bodies[0] : null);

    // How fast the player is closing on the screen, in cm per second. A punch
    // or a step forward shows up here before the camera has much to say.
    this._depthHistory.push({ cm: this.distanceCm, at: now });
    while (this._depthHistory.length && now - this._depthHistory[0].at > 220) {
      this._depthHistory.shift();
    }
    const oldest = this._depthHistory[0];
    const closing = oldest ? (oldest.cm - this.distanceCm) : 0;
    const depth = { cm: this.distanceCm, closing };

    for (let i = 0; i < this.bodies.length; i++) {
      const before = this.events.length;
      this.bodies[i].update(poses[i], dt, now, this.events, i === 0 ? depth : null);
      // Stamp every event with who made it, so a two-player game can tell.
      for (let e = before; e < this.events.length; e++) this.events[e].player = i;
    }

    this.detectStep(now);
    return this.events;
  }

  // Stepping in and out of the play zone, from the fused distance. Emitted on
  // the change only, so a game can treat it as a discrete move.
  detectStep(now) {
    const neutral = this.calib.neutralCm;
    const band = CONFIG.gestures.stepCm;
    let zone = 'neutral';
    if (this.distanceCm < neutral - band) zone = 'in';
    else if (this.distanceCm > neutral + band) zone = 'back';
    if (zone !== this._step) {
      this._step = zone;
      this.events.push({ type: 'step', zone, cm: this.distanceCm, player: 0 });
    }
  }

  // Where the player stands between the back of the zone and the front, 0 to 1.
  // Tennis uses this directly for court position.
  get depth01() {
    const neutral = this.calib.neutralCm;
    return clamp((neutral + CONFIG.gestures.stepCm * 2 - this.distanceCm) /
      (CONFIG.gestures.stepCm * 4));
  }
}
