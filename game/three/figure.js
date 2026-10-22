// figure.js: the player's character in 3D.
//
// An original design built from primitives: a rounded body, a round head with
// a hair cap, capsule limbs, mitten hands and chunky shoes. Nothing here is
// loaded from a file — it is geometry and colour.
//
// How it is posed matters as much as how it is built. Webcam tracking is
// jittery and drops limbs, and copying raw landmark angles onto a character
// looks broken. So:
//
//   - the ARMS follow your tracked wrists, heavily damped, clamped to poses an
//     arm can actually reach
//   - the LEGS, torso and head run a small idle cycle of their own
//   - a swing or a punch plays an AUTHORED pose that the tracking only
//     triggers, it does not drive
//
// The result reads as "the character is doing what I did" without inheriting
// every bad frame.

import * as THREE from 'three';
import { flat } from './stage.js';

const SKIN = '#ffd9b8';
const HAIR = '#4e3a2c';
const SHOE = '#f7fbfd';
const LEG = '#45586a';

export class Figure {
  constructor({ shirt = '#5aa8ea', hair = HAIR, skin = SKIN, height = 1.7 } = {}) {
    this.root = new THREE.Group();
    this.height = height;
    const u = height / 7.5;                 // one head, roughly

    const body = flat(shirt);
    const skinMat = flat(skin, { rough: 0.9 });
    const legMat = flat(LEG);
    const shoeMat = flat(SHOE);
    const hairMat = flat(hair, { rough: 1 });

    const mesh = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };

    // Torso: a capsule, wider than it is deep so the silhouette reads.
    this.torso = mesh(new THREE.CapsuleGeometry(u * 1.05, u * 1.7, 6, 16), body);
    this.torso.scale.set(1, 1, 0.72);
    this.torso.position.y = u * 3.9;
    this.root.add(this.torso);

    // Head on a short neck, with a hair cap over the top and back.
    this.head = new THREE.Group();
    this.head.position.y = u * 5.65;
    const skull = mesh(new THREE.SphereGeometry(u * 0.98, 24, 18), skinMat);
    this.head.add(skull);
    const cap = mesh(new THREE.SphereGeometry(u * 1.02, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.42), hairMat);
    cap.position.y = u * 0.04;
    this.head.add(cap);
    // Hair down the back of the crown only, so the face and the sides stay
    // skin and the head does not read as one dark ball.
    const back = mesh(new THREE.SphereGeometry(u * 1.01, 20, 16, Math.PI * 0.55, Math.PI * 0.9, Math.PI * 0.18, Math.PI * 0.46), hairMat);
    this.head.add(back);
    this.root.add(this.head);

    this.eyes = new THREE.Group();
    for (const side of [-1, 1]) {
      const eye = mesh(new THREE.SphereGeometry(u * 0.11, 12, 10), flat('#2d3b45'));
      eye.position.set(side * u * 0.33, u * 0.04, u * 0.88);
      this.eyes.add(eye);
    }
    this.head.add(this.eyes);

    // Arms: a shoulder pivot with an upper and a lower segment, so an elbow
    // bend is possible without a skeleton.
    this.arms = {};
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? -1 : 1;
      const shoulder = new THREE.Group();
      shoulder.position.set(s * u * 1.0, u * 4.8, 0);

      const upper = mesh(new THREE.CapsuleGeometry(u * 0.34, u * 1.0, 5, 12), body);
      upper.position.y = -u * 0.7;
      shoulder.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -u * 1.4;
      const lower = mesh(new THREE.CapsuleGeometry(u * 0.3, u * 0.95, 5, 12), body);
      lower.position.y = -u * 0.65;
      elbow.add(lower);

      const hand = mesh(new THREE.SphereGeometry(u * 0.42, 14, 12), skinMat);
      hand.position.y = -u * 1.32;
      elbow.add(hand);

      shoulder.add(elbow);
      this.root.add(shoulder);
      this.arms[side] = { shoulder, elbow, hand, s };
    }

    // Legs, with shoes on the ground.
    this.legs = {};
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? -1 : 1;
      const hip = new THREE.Group();
      hip.position.set(s * u * 0.5, u * 2.6, 0);

      const thigh = mesh(new THREE.CapsuleGeometry(u * 0.4, u * 1.0, 5, 12), legMat);
      thigh.position.y = -u * 0.7;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -u * 1.4;
      const shin = mesh(new THREE.CapsuleGeometry(u * 0.34, u * 0.9, 5, 12), legMat);
      shin.position.y = -u * 0.6;
      knee.add(shin);

      const shoe = mesh(new THREE.BoxGeometry(u * 0.75, u * 0.42, u * 1.3), shoeMat);
      shoe.position.set(0, -u * 1.15, u * 0.26);
      knee.add(shoe);

      hip.add(knee);
      this.root.add(hip);
      this.legs[side] = { hip, knee, s };
    }

    this.u = u;
    this.clock = 0;
    this.action = null;       // an authored pose currently playing
  }

  // Start an authored pose. `name` is looked up in POSES; `duration` is how
  // long it takes to play out. The tracking triggers these, it does not drive
  // them, which is what keeps a swing looking like a swing.
  play(name, duration = 0.55) {
    if (!POSES[name]) return;
    this.action = { name, t: 0, duration };
  }

  // body: the tracked Body from input.js, or null. dt in seconds.
  update(dt, body, { facing = 0 } = {}) {
    this.clock += dt;
    const u = this.u;
    const breathe = Math.sin(this.clock * 1.6) * 0.02;
    const sway = Math.sin(this.clock * 0.9) * 0.03;

    this.root.rotation.y = facing;
    this.torso.position.y = u * 3.9 + breathe * u;
    this.torso.rotation.z = sway * 0.3;
    this.head.position.y = u * 5.65 + breathe * u;
    this.head.rotation.z = -sway * 0.2;

    // A small idle in the legs, always. Tracking never touches them: feet are
    // the first thing a webcam loses and the first thing that looks wrong.
    for (const side of ['left', 'right']) {
      const { hip, knee, s } = this.legs[side];
      hip.rotation.x = -0.08 + Math.sin(this.clock * 1.6 + (s > 0 ? 0 : Math.PI)) * 0.04;
      hip.rotation.z = s * 0.05;
      knee.rotation.x = 0.12;
    }

    if (this.action) {
      this.action.t += dt / this.action.duration;
      if (this.action.t >= 1) this.action = null;
      else { POSES[this.action.name](this, this.action.t); return; }
    }

    // Arms follow the tracked wrists, damped hard and clamped.
    for (const side of ['left', 'right']) {
      const arm = this.arms[side];
      const hand = body?.ok ? body.hands[side] : null;
      let pitch = 0.1, roll = arm.s * 0.12, bend = 0.3;
      if (hand && hand.visible) {
        // Wrist height above the shoulders swings the arm up; reach straightens
        // the elbow. Both are ratios, so they do not care about frame size.
        const up = clamp((body.centre.y - hand.y) / Math.max(0.05, body.calib.armLength), -0.6, 1.3);
        const out = clamp(hand.acrossBody * 0.7, -1.2, 1.2);
        pitch = -up * 1.5;
        roll = arm.s * (0.12 + Math.abs(out) * 0.9) * (Math.sign(out) === arm.s ? 1 : 0.3);
        bend = clamp(1.1 - hand.extension * 1.2, 0.05, 1.3);
      }
      arm.shoulder.rotation.x = damp(arm.shoulder.rotation.x, pitch, 10, dt);
      arm.shoulder.rotation.z = damp(arm.shoulder.rotation.z, roll, 10, dt);
      arm.elbow.rotation.x = damp(arm.elbow.rotation.x, bend, 10, dt);
    }
  }
}

function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

// Exponential damping that behaves the same at any frame rate.
function damp(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

// ---- Authored poses ---------------------------------------------------------
// Each takes the figure and a 0..1 progress, and puts the arms where a good
// version of that motion would put them. t is eased so the fast part of the
// motion lands in the middle.

const ease = t => t * t * (3 - 2 * t);

export const POSES = {
  // A flat swing across the body: load behind, whip through, finish high.
  swing(f, t) {
    const e = ease(t);
    const right = f.arms.right, left = f.arms.left;
    const arc = -2.3 + e * 4.0;
    right.shoulder.rotation.y = arc;
    right.shoulder.rotation.x = -0.5 - Math.sin(e * Math.PI) * 0.5;
    right.shoulder.rotation.z = 0.4 + e * 0.5;
    right.elbow.rotation.x = 0.9 - Math.sin(e * Math.PI) * 0.75;
    left.shoulder.rotation.y = arc * 0.5;
    left.shoulder.rotation.x = -0.4;
    left.elbow.rotation.x = 0.8;
    f.torso.rotation.y = -0.7 + e * 1.5;
  },

  // A golf swing: the same idea on a steeper plane, through the ball.
  golf(f, t) {
    const e = ease(t);
    for (const side of ['left', 'right']) {
      const a = f.arms[side];
      a.shoulder.rotation.x = 0.5 - Math.sin(e * Math.PI) * 0.4;
      a.shoulder.rotation.y = -1.9 + e * 3.4;
      a.shoulder.rotation.z = a.s * 0.25;
      a.elbow.rotation.x = 0.35;
    }
    f.torso.rotation.y = -0.9 + e * 1.8;
  },

  // A straight punch: one arm out fast, the other stays up guarding.
  punch(f, t, side = 'right') {
    const e = Math.sin(ease(t) * Math.PI);          // out and back
    const a = f.arms[side];
    const other = f.arms[side === 'right' ? 'left' : 'right'];
    a.shoulder.rotation.x = -1.3 - e * 0.35;
    a.shoulder.rotation.z = a.s * 0.1;
    a.elbow.rotation.x = 1.3 - e * 1.25;
    other.shoulder.rotation.x = -1.4;
    other.elbow.rotation.x = 1.5;
    f.torso.rotation.y = other.s * e * 0.35;
  },

  punchLeft(f, t) { POSES.punch(f, t, 'left'); },

  // A shot: both hands from the chest, up and out, finishing with the wrists
  // over the head.
  shoot(f, t) {
    const e = ease(t);
    for (const side of ['left', 'right']) {
      const a = f.arms[side];
      a.shoulder.rotation.x = -0.6 - e * 2.3;
      a.shoulder.rotation.z = a.s * (0.4 - e * 0.25);
      a.elbow.rotation.x = 1.5 - e * 1.35;
    }
    f.torso.rotation.y = 0;
  },

  // A guard: both gloves up by the face.
  guard(f) {
    for (const side of ['left', 'right']) {
      const a = f.arms[side];
      a.shoulder.rotation.x = -1.45;
      a.shoulder.rotation.z = a.s * 0.18;
      a.elbow.rotation.x = 1.6;
    }
  },
};
