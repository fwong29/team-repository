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

// ---- Scenery ----------------------------------------------------------------
// Props more than one venue wants. All of it is built from boxes, spheres and
// cylinders — there are no models or textures anywhere in this project.

// Puffy clouds, high and far. A flat gradient sky reads as empty; three or
// four of these and the scene has air in it.
export function clouds({ count = 14, seed = 5, height = 90, spread = 420 } = {}) {
  const g = new THREE.Group();
  const r = rng(seed);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#cfe6f5', emissiveIntensity: 0.25 });
  for (let i = 0; i < count; i++) {
    const puff = new THREE.Group();
    const size = 8 + r() * 12;
    for (let b = 0; b < 5; b++) {
      const lump = new THREE.Mesh(new THREE.SphereGeometry(size * (0.5 + r() * 0.5), 10, 8), mat);
      lump.position.set((b - 2) * size * 0.6, (r() - 0.5) * size * 0.3, (r() - 0.5) * size * 0.5);
      puff.add(lump);
    }
    const a = r() * Math.PI * 2;
    puff.position.set(Math.cos(a) * spread * (0.5 + r() * 0.5),
                      height + r() * 40,
                      Math.sin(a) * spread * (0.5 + r() * 0.5));
    g.add(puff);
  }
  return g;
}

// A ring of low hills on the horizon, so an outdoor scene has a far edge.
export function hills({ radius = 260, count = 22, seed = 9, colour = '#6cb152' } = {}) {
  const g = new THREE.Group();
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const size = 26 + r() * 34;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      flat(colour));
    hill.scale.set(1, 0.42 + r() * 0.3, 1);
    hill.position.set(Math.cos(a) * radius, -2, Math.sin(a) * radius);
    g.add(hill);
  }
  return g;
}

// A bench, with people sitting on it: courtside, dugout, bullpen.
export function bench(width, { seats = 4, seed = 3, shirt = '#ffffff' } = {}) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, 0.5), flat('#b4c7d6'));
  seat.position.y = 0.45;
  seat.castShadow = true;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(width, 0.5, 0.08), flat('#b4c7d6'));
  back.position.set(0, 0.72, -0.24);
  g.add(back);

  const r = rng(seed);
  for (let i = 0; i < seats; i++) {
    const x = -width / 2 + (i + 0.5) * (width / seats);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.34, 4, 8), flat(shirt));
    torso.position.set(x, 0.78, 0);
    torso.castShadow = true;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), flat(r() > 0.7 ? '#c08e6a' : '#ffd9b8'));
    head.position.set(x, 1.12, 0);
    g.add(head);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.5), flat('#45586a'));
    legs.position.set(x, 0.5, 0.3);
    g.add(legs);
  }
  return g;
}

// A banner on a rail or a wall: a flat panel with a stripe across it. No text
// and no marks that stand for anything — just colour, so the venue is not bare.
export function banner(width, height, colour = '#ef6a5a') {
  const g = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ color: colour, side: THREE.DoubleSide, roughness: 1 }));
  g.add(cloth);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.8, height * 0.16),
    new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
  stripe.position.z = 0.01;
  g.add(stripe);
  return g;
}

// An overhead truss with lamps along it — indoor venues.
export function lightRig(width, lamps = 7) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, 0.5), flat('#8ea4b2'));
  g.add(beam);
  for (let i = 0; i < lamps; i++) {
    const x = -width / 2 + (i + 0.5) * (width / lamps);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.45, 10), flat('#6d8291'));
    can.position.set(x, -0.35, 0);
    g.add(can);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12).rotateX(Math.PI / 2), flat('#fff6d2'));
    lens.position.set(x, -0.58, 0);
    g.add(lens);
  }
  return g;
}

// Chain-link fencing with a windscreen along the bottom: the thing that makes
// an outdoor court look like a court and not a painted rectangle.
export function fence(width, height, { screen = '#2f6b4e' } = {}) {
  const g = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(width, height * 0.62),
    new THREE.MeshStandardMaterial({ color: screen, side: THREE.DoubleSide, roughness: 1 }));
  cloth.position.y = height * 0.31;
  g.add(cloth);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height * 0.38),
    new THREE.MeshStandardMaterial({ color: '#9fb4c4', side: THREE.DoubleSide,
      transparent: true, opacity: 0.35 }));
  mesh.position.y = height * 0.81;
  g.add(mesh);
  for (let x = -width / 2; x <= width / 2; x += 4) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, height, 6), flat('#8ea4b2'));
    post.position.set(x, height / 2, 0);
    g.add(post);
  }
  return g;
}
