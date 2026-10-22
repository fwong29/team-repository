// basketball3d.js: an indoor court.

import * as THREE from 'three';
import { flat } from './stage.js';
import { Figure } from './figure.js';
import { stand, board, bench, banner, lightRig } from './stadium3d.js';

export function buildBasketball(stage) {
  stage.sky('#dfeaf1', '#eaf4fa');
  const group = new THREE.Group();
  stage.world.add(group);

  // Hardwood, and the painted markings on top of it.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), flat('#e8c084'));
  floor.receiveShadow = true;
  group.add(floor);

  const paint = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 5.8).rotateX(-Math.PI / 2), flat('#5aa0dd'));
  paint.position.set(0, 0.01, -9.1);
  group.add(paint);

  const ring = (inner, outer, x, z, start = 0, sweep = Math.PI * 2) => {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 48, 1, start, sweep).rotateX(-Math.PI / 2),
      flat('#ffffff'));
    m.position.set(x, 0.02, z);
    group.add(m);
  };
  ring(1.75, 1.85, 0, -9.1);                       // free-throw circle
  ring(6.65, 6.78, 0, -11.9, 0, Math.PI);          // three-point arc
  ring(1.75, 1.85, 0, 0);                          // centre circle

  const stripe = (w, l, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), flat('#ffffff'));
    m.position.set(x, 0.02, z);
    group.add(m);
  };
  stripe(15, 0.1, 0, -12.5);                       // baseline
  stripe(0.1, 25, -7.5, 0);
  stripe(0.1, 25, 7.5, 0);

  // Backboard, rim and net, on a post behind the baseline.
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.2, 10), flat('#b4c7d6'));
  post.position.set(0, 2.1, -13.6);
  post.castShadow = true;
  group.add(post);
  const backboard = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.06), flat('#ffffff'));
  backboard.position.set(0, 3.3, -12.9);
  backboard.castShadow = true;
  group.add(backboard);
  const square = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.02), flat('#ef6a5a'));
  square.position.set(0, 3.1, -12.85);
  group.add(square);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 8, 20).rotateX(Math.PI / 2), flat('#ef6a5a'));
  rim.position.set(0, 3.05, -12.6);
  rim.castShadow = true;
  group.add(rim);
  const net = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.13, 0.45, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  net.position.set(0, 2.82, -12.6);
  group.add(net);

  // Stands behind the baseline and down one side.
  const back = stand(26, 8, 7, { seed: 61 });
  back.position.set(0, 0, -16);
  group.add(back);
  const sideBank = stand(22, 6, 5, { seed: 62 });
  sideBank.position.set(-13, 0, -4);
  sideBank.rotation.y = Math.PI / 2;
  group.add(sideBank);
  group.add(board(7, 3.2, 0, 7.2, -17.5));

  // A roof with a truss of lights over the court.
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(Math.PI / 2), flat('#dfeaf1'));
  roof.position.y = 12;
  group.add(roof);
  for (const z of [-10, -2, 6]) {
    const rig = lightRig(22, 7);
    rig.position.set(0, 10.6, z);
    group.add(rig);
  }

  // Banners hanging from the rafters. Colour only, no marks.
  for (let i = 0; i < 5; i++) {
    const b = banner(2.2, 3.4, ['#ef6a5a', '#5aa8ea', '#f6d98a', '#b6e0a4', '#d3bdf0'][i]);
    b.position.set(-13 + i * 6.5, 9.2, -15.4);
    group.add(b);
  }

  // Team benches and a scorer's table down the near side.
  for (const s2 of [-1, 1]) {
    const seats = bench(6, { seats: 5, seed: 70 + s2, shirt: s2 > 0 ? '#ffffff' : '#f4a9a0' });
    seats.position.set(s2 * 9.6, 0, -2);
    seats.rotation.y = -s2 * Math.PI / 2;
    group.add(seats);
  }
  const table = new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 0.8), flat('#b4c7d6'));
  table.position.set(0, 0.45, 9.6);
  table.castShadow = true;
  group.add(table);

  // Padding round the base of the hoop post.
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.2, 12), flat('#ef6a5a'));
  pad.position.set(0, 1.1, -13.6);
  group.add(pad);

  const you = new Figure({ shirt: '#5aa8ea' });
  stage.world.add(you.root);

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), flat('#e07c2c'));
  ball.castShadow = true;
  stage.world.add(ball);

  return {
    group, you, ball, hoop: new THREE.Vector3(0, 3.05, -12.6),
    standAt(spot) {
      // spot 0 is under the basket, 1 is a long way out.
      const z = -11.5 + spot * 8.5;
      you.root.position.set(0, 0, z);
      you.root.rotation.y = 0;
      return z;
    },
    ballAt(x, y, z) { ball.position.set(x, y, z); },
    frame(stage2, spot) {
      const z = -11.5 + spot * 8.5;
      stage2.look({
        from: { x: 1.3, y: 3.0, z: z + 5.2 },
        at: { x: 0, y: 2.4, z: -12 },
        lerp: 0.1,
      });
    },
  };
}
