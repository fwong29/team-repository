// golf3d.js: the hole, in 3D.
//
// Built from the same hole description the 2D version used — bend, width,
// hazards — so a dogleg is a dogleg here too. The fairway is a ribbon of
// geometry following the centre line, which is what makes the turn readable
// from the tee.

import * as THREE from 'three';
import { flat } from './stage.js';
import { Figure } from './figure.js';
import { clouds, hills, bench } from './stadium3d.js';

const SCALE = 0.42;                 // world metres per yard, so a hole fits

function centreAt(hole, t) {
  const turn = Math.max(0, (t - hole.bendAt) / Math.max(0.01, 1 - hole.bendAt));
  return hole.bend * Math.pow(Math.min(1, turn), 1.35);
}

export function buildGolf(stage, hole) {
  stage.sky('#8fd2f0', '#dcf1fb');
  stage.ground('#4f8a35', 600);

  const group = new THREE.Group();
  stage.world.add(group);
  const length = hole.length * SCALE;
  const spread = 26;                // how far a bend of 1.0 moves sideways

  // Where the middle of the hole is, in world space, at a point down it.
  const at = (t, off = 0) => new THREE.Vector3(
    centreAt(hole, t) * spread + off * 14,
    0,
    -t * length,
  );

  // The fairway, as a ribbon of triangles down the centre line — and mown in
  // alternating bands, which is both what a fairway looks like and the only
  // thing that separates it from the rough at this camera height.
  const steps = 48;
  const band = 4;                     // steps per mown stripe
  for (let b = 0; b * band < steps; b++) {
    const positions = [];
    const indices = [];
    const from = b * band, to = Math.min(steps, from + band);
    for (let i = from; i <= to; i++) {
      const t = i / steps;
      const l = at(t, -hole.width), r = at(t, hole.width);
      positions.push(l.x, 0.03, l.z, r.x, 0.03, r.z);
      if (i < to) {
        const a = (i - from) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const strip = new THREE.Mesh(geo, flat(b % 2 ? '#9ad86a' : '#8ac95b'));
    strip.receiveShadow = true;
    group.add(strip);
  }

  // The green, and the pin on it.
  const pinPos = at(1);
  const green = new THREE.Mesh(new THREE.CircleGeometry(7, 28).rotateX(-Math.PI / 2), flat('#c3e89b'));
  green.position.set(pinPos.x, 0.06, pinPos.z);
  green.receiveShadow = true;
  group.add(green);
  const cup = new THREE.Mesh(new THREE.CircleGeometry(0.35, 14).rotateX(-Math.PI / 2), flat('#1f2d1f'));
  cup.position.set(pinPos.x, 0.07, pinPos.z);
  group.add(cup);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8), flat('#f7fbfd'));
  stick.position.set(pinPos.x, 1.6, pinPos.z);
  stick.castShadow = true;
  group.add(stick);
  const flagCloth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.85), new THREE.MeshStandardMaterial({ color: '#ef6a5a', side: THREE.DoubleSide }));
  flagCloth.position.set(pinPos.x + 0.6, 2.8, pinPos.z);
  group.add(flagCloth);

  // Hazards.
  for (const hz of hole.hazards) {
    const p = at(hz.at, hz.off);
    if (hz.kind === 'trees') {
      for (let i = 0; i < 5; i++) {
        const tx = p.x + (i - 2) * 3.4 + (i % 2) * 1.6;
        const tz = p.z + (i % 3) * 3;
        group.add(makeTree(tx, tz, 4 + (i % 3)));
      }
    } else {
      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(5 * hz.size, 22).rotateX(-Math.PI / 2),
        flat(hz.kind === 'water' ? '#5aa0dd' : '#f4e1a8', { rough: hz.kind === 'water' ? 0.25 : 1 }),
      );
      pad.position.set(p.x, 0.04, p.z);
      pad.receiveShadow = true;
      group.add(pad);
    }
  }

  // A tree line down both sides, so the corridor reads.
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const l = at(t, -hole.width - 0.9), r = at(t, hole.width + 0.9);
    group.add(makeTree(l.x, l.z, 5 + (i % 3)));
    group.add(makeTree(r.x, r.z, 5 + ((i + 1) % 3)));
  }

  // Sky and distance: cloud overhead and hills at the far edge, so the hole
  // sits in a landscape instead of on an infinite green plane.
  stage.world.add(clouds({ count: 16, seed: 13, height: 80, spread: 300 }));
  stage.world.add(hills({ radius: 230, count: 20, seed: 21, colour: '#6cb152' }));

  // A tee box, a bench on it, and markers either side.
  const teeBox = new THREE.Mesh(new THREE.BoxGeometry(7, 0.18, 5), flat('#a3d874'));
  teeBox.position.set(0, 0.09, 1.5);
  teeBox.receiveShadow = true;
  group.add(teeBox);
  for (const s2 of [-1, 1]) {
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), flat('#ef6a5a'));
    marker.position.set(s2 * 1.9, 0.26, 1.2);
    group.add(marker);
  }
  const teeBench = bench(2.4, { seats: 2, seed: 31, shirt: '#f6d98a' });
  teeBench.position.set(3.6, 0.18, 2.4);
  teeBench.rotation.y = -0.5;
  group.add(teeBench);

  // A rake leaning in each bunker, and a cart path down one side.
  for (const hz of hole.hazards.filter(h => h.kind === 'sand')) {
    const p2 = at(hz.at, hz.off);
    const rake = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), flat('#d99a52'));
    handle.rotation.z = 0.6;
    rake.add(handle);
    const headBar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.1), flat('#2d3b45'));
    headBar.position.set(0.62, -1.0, 0);
    rake.add(headBar);
    rake.position.set(p2.x + 3 * hz.size, 1.1, p2.z);
    group.add(rake);
  }
  const path = new THREE.Mesh(new THREE.PlaneGeometry(2.4, length).rotateX(-Math.PI / 2), flat('#cbd4cf'));
  path.position.set(-hole.width * 14 - 7, 0.02, -length / 2);
  group.add(path);

  const you = new Figure({ shirt: '#5aa8ea' });
  stage.world.add(you.root);

  // The club, carried in the hands.
  const club = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1.1, 8), flat('#cfdde8'));
  shaft.position.y = -0.55;
  club.add(shaft);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.12), flat('#8ea4b2', { metal: 0.5, rough: 0.35 }));
  head.position.set(0.06, -1.1, 0.02);
  club.add(head);
  you.arms.right.elbow.add(club);
  club.position.y = -you.u * 1.5;

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), flat('#ffffff'));
  ball.castShadow = true;
  stage.world.add(ball);

  return {
    group, you, ball, club, at,
    ballAt(along, off, height = 0) {
      const p = at(clampN(along), off);
      ball.position.set(p.x, 0.055 + height, p.z);
    },
    standAt(along, off) {
      const p = at(clampN(along), off);
      you.root.position.set(p.x - 1.1, 0, p.z + 0.6);
      you.root.rotation.y = 0;
    },
    frame(stage2, along) {
      const p = at(clampN(along));
      stage2.look({
        from: { x: p.x - 1.0, y: 3.2, z: p.z + 7.5 },
        at: { x: p.x, y: 1.1, z: p.z - 16 },
        lerp: 0.1,
      });
    },
  };
}

function clampN(x) { return Math.min(1, Math.max(0, x)); }

function makeTree(x, z, size) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, size * 0.5, 7), flat('#a9794f'));
  trunk.position.y = size * 0.25;
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(size * (0.42 - i * 0.07), 10, 8),
      flat(['#6aab52', '#74b85a', '#7fc463'][i]));
    blob.position.set((i - 1) * size * 0.16, size * (0.55 + i * 0.18), (i % 2) * size * 0.14);
    blob.castShadow = true;
    g.add(blob);
  }
  g.position.set(x, 0, z);
  return g;
}
