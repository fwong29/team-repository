// stadium3d.js: the pieces more than one venue needs — tiered stands with a
// crowd, floodlights and a simple scoreboard. Built once, reused by the
// baseball park, the basketball gym and the boxing arena.

import * as THREE from 'three';
import { flat } from './stage.js';

const SHIRTS = ['#f4a9a0', '#a8cdf0', '#f6d98a', '#b6e0a4', '#d3bdf0',
                '#f7c9a0', '#9fd8e8', '#e9b7d4', '#c9d7e8', '#f2e4a8'];

// A deterministic generator: the same crowd every frame and every reload.
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// A bank of seating. The crowd is one instanced mesh of capsules — thousands
// of separate meshes would cost more than the whole rest of the scene.
export function stand(width, depth, rows, { seed = 1, deck = '#cfdde8' } = {}) {
  const g = new THREE.Group();
  const rowH = 0.55, rowD = depth / rows;

  for (let r = 0; r < rows; r++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(width, rowH, rowD), flat(deck));
    step.position.set(0, rowH * (r + 0.5), -rowD * r);
    step.receiveShadow = true;
    g.add(step);
  }

  const perRow = Math.max(4, Math.floor(width / 0.75));
  const total = perRow * rows;
  const body = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.19, 0.3, 4, 8), flat('#ffffff'), total);
  const head = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.16, 8, 6), flat('#ffd9b8'), total);
  const m = new THREE.Matrix4();
  const colour = new THREE.Color();
  const r2 = rng(seed);
  let i = 0;
  for (let row = 0; row < rows; row++) {
    for (let s = 0; s < perRow; s++) {
      const x = -width / 2 + (s + 0.5) * (width / perRow) + (r2() - 0.5) * 0.2;
      const y = rowH * (row + 1) + 0.3;
      const z = -rowD * row;
      m.makeTranslation(x, y, z);
      body.setMatrixAt(i, m);
      m.makeTranslation(x, y + 0.42, z);
      head.setMatrixAt(i, m);
      body.setColorAt(i, colour.set(SHIRTS[Math.floor(r2() * SHIRTS.length)]));
      head.setColorAt(i, colour.set(r2() > 0.75 ? '#c08e6a' : '#ffd9b8'));
      i++;
    }
  }
  body.instanceMatrix.needsUpdate = true;
  head.instanceMatrix.needsUpdate = true;
  g.add(body, head);
  return g;
}

export function floodlight(x, z, height = 18) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, height, 8), flat('#b9cbd8'));
  pole.position.y = height / 2;
  pole.castShadow = true;
  g.add(pole);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 0.4), flat('#c6d6e2'));
  rack.position.y = height + 0.6;
  g.add(rack);
  for (let i = 0; i < 4; i++) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.2), flat('#fff6d2'));
    lamp.position.set(-1.4 + i * 0.95, height + 0.6, 0.25);
    g.add(lamp);
  }
  g.position.set(x, 0, z);
  return g;
}

export function board(width, height, x, y, z) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.4), flat('#e4edf3'));
  g.add(frame);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.88, height * 0.76), flat('#2d3b45'));
  face.position.z = 0.22;
  g.add(face);
  g.position.set(x, y, z);
  return g;
}
