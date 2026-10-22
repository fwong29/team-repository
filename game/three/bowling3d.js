// bowling3d.js: the lane.
//
// Real proportions: 18.29 m from the foul line to the headpin, 1.066 m
// between the gutters, pins 12 inches apart. Keeping those honest is what
// makes the lane read as long when you stand at the end of it.

import * as THREE from 'three';
import { flat } from './stage.js';
import { Figure } from './figure.js';
import { stand, bench, lightRig, banner } from './stadium3d.js';
import { PINS } from '../sports/bowling.js';

const LANE_LEN = 11.5;      // shortened from a regulation 18.29 m, for the camera
const LANE_HALF = 0.533;
const DECK_Z = -LANE_LEN;

export function buildBowling(stage) {
  stage.sky('#dfeaf1', '#eaf4fa');
  const group = new THREE.Group();
  stage.world.add(group);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 60).rotateX(-Math.PI / 2), flat('#4a5566'));
  floor.position.z = -14;
  floor.receiveShadow = true;
  group.add(floor);

  // The lane, with boards running its length.
  const lane = new THREE.Mesh(new THREE.BoxGeometry(LANE_HALF * 2, 0.12, LANE_LEN + 2), flat('#e8c084'));
  lane.position.set(0, 0.06, -LANE_LEN / 2 + 0.6);
  lane.receiveShadow = true;
  group.add(lane);
  for (let i = -6; i <= 6; i++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.01, LANE_LEN + 2), flat('#d2a96a'));
    board.position.set(i * 0.08, 0.125, -LANE_LEN / 2 + 0.6);
    group.add(board);
  }
  // Approach arrows, which is what you actually aim at.
  for (let i = -3; i <= 3; i++) {
    if (!i) continue;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 3).rotateX(-Math.PI / 2), flat('#9a6a3c'));
    arrow.position.set(i * 0.1, 0.127, -4.6 - Math.abs(i) * 0.5);
    group.add(arrow);
  }

  // Gutters either side, and the foul line.
  for (const s of [-1, 1]) {
    const gutter = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, LANE_LEN + 2), flat('#39414f'));
    gutter.position.set(s * (LANE_HALF + 0.13), 0.02, -LANE_LEN / 2 + 0.6);
    group.add(gutter);
  }
  const foul = new THREE.Mesh(new THREE.BoxGeometry(LANE_HALF * 2 + 0.6, 0.01, 0.06), flat('#2d3b45'));
  foul.position.set(0, 0.13, 0.6);
  group.add(foul);

  // The pin deck, the masking unit above it, and a back wall.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(LANE_HALF * 2 + 0.6, 0.12, 1.6), flat('#f0d3a2'));
  deck.position.set(0, 0.06, DECK_Z - 0.4);
  deck.receiveShadow = true;
  group.add(deck);
  const mask = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 0.3), flat('#5aa0dd'));
  mask.position.set(0, 2.2, DECK_Z - 1.4);
  group.add(mask);
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(20, 4, 0.4), flat('#b4c7d6'));
  backWall.position.set(0, 2, DECK_Z - 2.2);
  group.add(backWall);

  // Ten pins. Each is a cylinder with a waist and two red stripes.
  const pins = PINS.map(p => {
    const pin = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(0.075, 0.07, 0.46, 12);
    const body = new THREE.Mesh(bodyGeo, flat('#ffffff'));
    body.position.y = 0.23;
    body.castShadow = true;
    pin.add(body);
    const neck = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), flat('#ffffff'));
    neck.position.y = 0.48;
    neck.castShadow = true;
    pin.add(neck);
    for (const y of [0.36, 0.41]) {
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.02, 12), flat('#ef6a5a'));
      stripe.position.y = y;
      pin.add(stripe);
    }
    pin.position.set(p.x, 0.12, DECK_Z + p.z);
    pin.userData.n = p.n;
    pin.userData.home = pin.position.clone();
    group.add(pin);
    return pin;
  });

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.108, 20, 16), flat('#5aa8ea', { rough: 0.25 }));
  ball.castShadow = true;
  stage.world.add(ball);

  // The alley around the lane: neighbouring lanes, seating, lights, banners.
  for (const s of [-1, 1]) {
    const neighbour = new THREE.Mesh(new THREE.BoxGeometry(LANE_HALF * 2, 0.12, LANE_LEN + 2), flat('#dcb97e'));
    neighbour.position.set(s * 2.1, 0.06, -LANE_LEN / 2 + 0.6);
    group.add(neighbour);
  }
  const seats = bench(5, { seats: 4, seed: 51, shirt: '#a8cdf0' });
  seats.position.set(3.6, 0, 5.4);
  seats.rotation.y = -0.5;
  group.add(seats);
  const ballReturn = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 2), flat('#39414f'));
  ballReturn.position.set(-2.0, 0.4, 3.2);
  ballReturn.castShadow = true;
  group.add(ballReturn);

  for (const z of [-2, -6, -10]) {
    const rig = lightRig(10, 5);
    rig.position.set(0, 5.2, z);
    group.add(rig);
  }
  for (let i = 0; i < 3; i++) {
    const b = banner(3, 1, ['#ef6a5a', '#f6d98a', '#b6e0a4'][i]);
    b.position.set(-5 + i * 5, 3.1, DECK_Z - 1.9);
    group.add(b);
  }
  const crowd = stand(16, 5, 4, { seed: 52 });
  crowd.position.set(0, 0, 11);
  crowd.rotation.y = Math.PI;
  group.add(crowd);

  const you = new Figure({ shirt: '#5aa8ea' });
  you.root.position.set(-0.15, 0.13, 1.9);
  stage.world.add(you.root);

  return {
    group, you, ball, pins,
    // t runs 0 at the foul line to 1 at the deck.
    ballAt(x, t) {
      ball.position.set(x, 0.23, lerpN(0.6, DECK_Z, t));
      ball.rotation.x -= 0.4;
    },
    park() { ball.position.set(-2.0, 0.9, 3.2); },
    // Standing pins stand; knocked ones lie down where they were.
    setPins(standing) {
      for (const pin of pins) {
        const up = standing.includes(pin.userData.n);
        pin.visible = true;
        pin.position.copy(pin.userData.home);
        pin.rotation.set(up ? 0 : -Math.PI / 2, 0, up ? 0 : pin.userData.n * 0.7);
        if (!up) pin.position.y = 0.17;
      }
    },
    frame(stage2) {
      stage2.look({
        from: { x: 0.85, y: 2.5, z: 4.4 },
        at: { x: 0, y: 0.9, z: -8 },
        lerp: 0.1,
      });
    },
  };
}

function lerpN(a, b, t) { return a + (b - a) * Math.min(1, Math.max(0, t)); }
