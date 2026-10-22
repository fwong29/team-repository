// baseball3d.js: the ballpark.

import * as THREE from 'three';
import { flat } from './stage.js';
import { Figure } from './figure.js';
import { stand, floodlight, board } from './stadium3d.js';

export function buildBaseball(stage) {
  stage.sky('#8fd2f0', '#dcf1fb');
  const group = new THREE.Group();
  stage.world.add(group);

  // Outfield grass, then the infield dirt over the top of it.
  const grass = new THREE.Mesh(new THREE.CircleGeometry(95, 48).rotateX(-Math.PI / 2), flat('#8ccc5c'));
  grass.receiveShadow = true;
  group.add(grass);

  const dirt = new THREE.Mesh(new THREE.CircleGeometry(29, 40).rotateX(-Math.PI / 2), flat('#e49c66'));
  dirt.position.set(0, 0.01, -16);
  dirt.receiveShadow = true;
  group.add(dirt);
  const infieldGrass = new THREE.Mesh(new THREE.CircleGeometry(19, 36).rotateX(-Math.PI / 2), flat('#8ccc5c'));
  infieldGrass.position.set(0, 0.02, -19);
  group.add(infieldGrass);

  // Home plate, the mound and the bases.
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 5), flat('#ffffff'));
  plate.position.set(0, 0.04, 0);
  plate.rotation.y = Math.PI / 4;
  group.add(plate);

  const mound = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 3.2, 0.3, 24), flat('#e49c66'));
  mound.position.set(0, 0.15, -18.4);
  mound.receiveShadow = true;
  group.add(mound);

  for (const [bx, bz] of [[19, -19], [0, -38], [-19, -19]]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 1.1), flat('#ffffff'));
    base.position.set(bx, 0.06, bz);
    group.add(base);
  }

  // Foul lines, out to the corners.
  for (const s of [-1, 1]) {
    const chalk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 86), flat('#ffffff'));
    chalk.position.set(s * 30, 0.04, -30);
    chalk.rotation.y = s * Math.PI / 4;
    group.add(chalk);
  }

  // Outfield wall, stands behind it, lights above.
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(92, 92, 4, 48, 1, true, Math.PI * 0.75, Math.PI * 1.5), flat('#4f9e5e'));
  wall.position.y = 2;
  wall.material.side = THREE.DoubleSide;
  group.add(wall);

  for (let i = 0; i < 5; i++) {
    const a = Math.PI * 0.82 + i * Math.PI * 0.34 / 4;
    const bank = stand(44, 11, 9, { seed: 20 + i });
    bank.position.set(Math.cos(a) * 99, 4, Math.sin(a) * 99 * -1);
    bank.lookAt(0, 6, -20);
    group.add(bank);
  }
  group.add(floodlight(-62, -78, 26), floodlight(62, -78, 26));
  group.add(board(20, 8, 0, 10, -97));

  // You at the plate, the pitcher on the mound, two fielders.
  const you = new Figure({ shirt: '#5aa8ea' });
  you.root.position.set(1.6, 0, 0.6);
  stage.world.add(you.root);

  const bat = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.032, 1.05, 10), flat('#e8c084'));
  barrel.position.y = -0.52;
  bat.add(barrel);
  you.arms.right.elbow.add(bat);
  bat.position.y = -you.u * 1.5;
  bat.rotation.z = 0.5;

  const pitcher = new Figure({ shirt: '#ffffff', hair: '#3a2b20' });
  pitcher.root.position.set(0, 0.3, -18.4);
  pitcher.root.rotation.y = 0;
  stage.world.add(pitcher.root);

  const fielders = [];
  for (const [fx, fz] of [[22, -30], [-22, -30]]) {
    const f = new Figure({ shirt: '#ffffff', hair: '#4a3626', height: 1.7 });
    f.root.position.set(fx, 0, fz);
    stage.world.add(f.root);
    fielders.push(f);
  }

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), flat('#ffffff'));
  ball.castShadow = true;
  stage.world.add(ball);

  return {
    group, you, pitcher, fielders, ball, bat,
    ballAt(x, y, z) { ball.position.set(x, y, z); },
    frame(stage2) {
      stage2.look({
        from: { x: 4.6, y: 3.0, z: 6.2 },
        at: { x: -0.4, y: 1.5, z: -13 },
        lerp: 0.1,
      });
    },
  };
}
