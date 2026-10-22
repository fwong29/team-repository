// boxing3d.js: the ring.

import * as THREE from 'three';
import { flat } from './stage.js';
import { Figure } from './figure.js';
import { stand } from './stadium3d.js';

const RING = 6.1;                    // half the canvas, in metres

export function buildBoxing(stage) {
  stage.sky('#cfe0ea', '#eaf4fa');
  const group = new THREE.Group();
  stage.world.add(group);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), flat('#9fb4c4'));
  floor.receiveShadow = true;
  group.add(floor);

  // The ring platform, its skirt, and the canvas on top.
  const platform = new THREE.Mesh(new THREE.BoxGeometry(RING * 2 + 1.6, 1, RING * 2 + 1.6), flat('#4a8ac4'));
  platform.position.y = 0.5;
  platform.receiveShadow = true;
  platform.castShadow = true;
  group.add(platform);
  const canvasTop = new THREE.Mesh(new THREE.PlaneGeometry(RING * 2, RING * 2).rotateX(-Math.PI / 2), flat('#5aa0dd'));
  canvasTop.position.y = 1.005;
  canvasTop.receiveShadow = true;
  group.add(canvasTop);

  // Four posts with padding, and three ropes on all four sides.
  const corners = [[-RING, -RING], [RING, -RING], [RING, RING], [-RING, RING]];
  corners.forEach(([x, z], i) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.1, 10), flat('#8ea4b2'));
    post.position.set(x, 2.05, z);
    post.castShadow = true;
    group.add(post);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.5, 12),
      flat(i === 0 || i === 2 ? '#ef6a5a' : '#5aa8ea'));
    pad.position.set(x, 2.0, z);
    group.add(pad);
  });

  for (let r = 0; r < 3; r++) {
    const y = 1.55 + r * 0.44;
    for (let c = 0; c < 4; c++) {
      const [x1, z1] = corners[c];
      const [x2, z2] = corners[(c + 1) % 4];
      const a = new THREE.Vector3(x1, y, z1), b = new THREE.Vector3(x2, y, z2);
      const rope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, a.distanceTo(b), 8), flat('#ffffff'));
      rope.position.copy(a).add(b).multiplyScalar(0.5);
      rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      rope.castShadow = true;
      group.add(rope);
    }
  }

  // Crowd on all sides, below the ring.
  for (let i = 0; i < 4; i++) {
    const bank = stand(30, 9, 7, { seed: 90 + i, deck: '#b4c7d6' });
    const a = (i / 4) * Math.PI * 2;
    bank.position.set(Math.sin(a) * 17, 0, Math.cos(a) * 17);
    bank.rotation.y = a + Math.PI;
    group.add(bank);
  }

  const you = new Figure({ shirt: '#5aa8ea' });
  you.root.position.set(0, 1, 3.1);
  stage.world.add(you.root);

  const them = new Figure({ shirt: '#ef6a5a', hair: '#5a3f2c' });
  them.root.position.set(0, 1, -2.4);
  them.root.rotation.y = Math.PI;
  stage.world.add(them.root);

  // Gloves, on both fighters' hands.
  const glove = (parent, colour, u) => {
    const g = new THREE.Mesh(new THREE.SphereGeometry(u * 0.62, 14, 12), flat(colour));
    g.scale.set(1, 0.9, 1.15);
    g.position.y = -u * 1.4;
    g.castShadow = true;
    parent.add(g);
    return g;
  };
  const gloves = {
    youLeft: glove(you.arms.left.elbow, '#ffb14e', you.u),
    youRight: glove(you.arms.right.elbow, '#ffb14e', you.u),
    themLeft: glove(them.arms.left.elbow, '#ef6a5a', them.u),
    themRight: glove(them.arms.right.elbow, '#ef6a5a', them.u),
  };

  return {
    group, you, them, gloves,
    frame(stage2) {
      stage2.look({
        from: { x: 1.5, y: 3.4, z: 6.4 },
        at: { x: 0, y: 2.0, z: -1.6 },
        lerp: 0.1,
      });
    },
  };
}
