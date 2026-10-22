// golf3d.js: the hole, in 3D.
//
// Built from the same hole description the 2D version used — bend, width,
// hazards — so a dogleg is a dogleg here too. The fairway is a ribbon of
// geometry following the centre line, which is what makes the turn readable
// from the tee.

import * as THREE from 'three';
import { flat } from './stage.js';
import { Figure } from './figure.js';

const SCALE = 0.42;                 // world metres per yard, so a hole fits

function centreAt(hole, t) {
  const turn = Math.max(0, (t - hole.bendAt) / Math.max(0.01, 1 - hole.bendAt));
  return hole.bend * Math.pow(Math.min(1, turn), 1.35);
}

export function buildGolf(stage, hole) {
  stage.sky('#8fd2f0', '#dcf1fb');
  stage.ground('#5f9e3f', 600);

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

  // The fairway, as one ribbon of triangles down the centre line.
  const steps = 48;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = hole.width * 14;
    const l = at(t, -hole.width), r = at(t, hole.width);
    positions.push(l.x, 0.03, l.z, r.x, 0.03, r.z);
    if (i < steps) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const ribbon = new THREE.BufferGeometry();
  ribbon.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  ribbon.setIndex(indices);
  ribbon.computeVertexNormals();
  const fairway = new THREE.Mesh(ribbon, flat('#9ad86a'));
  fairway.receiveShadow = true;
  group.add(fairway);

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
