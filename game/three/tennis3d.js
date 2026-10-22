// tennis3d.js: the tennis court, in 3D.
//
// Builds the court, the net, the surround and the far player, and parks the
// camera over your shoulder. The rally logic is not here — this file only
// knows how to show a ball at a position and a player at a position.

import * as THREE from 'three';
import { flat } from './stage.js';
import { Figure } from './figure.js';

const COURT = { length: 23.8, width: 10.97, singles: 8.23 };

export function buildTennis(stage) {
  stage.sky('#8fd2f0', '#dcf1fb');
  stage.ground('#4f9e5e', 400);

  const line = flat('#ffffff');
  const group = new THREE.Group();
  stage.world.add(group);

  // The court surface, raised a hair so it wins the depth fight with the grass.
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.width + 7, COURT.length + 12).rotateX(-Math.PI / 2),
    flat('#4a8ac4'),
  );
  surface.position.y = 0.01;
  surface.receiveShadow = true;
  group.add(surface);

  const inner = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.width + 0.1, COURT.length + 0.1).rotateX(-Math.PI / 2),
    flat('#5aa0dd'),
  );
  inner.position.y = 0.02;
  inner.receiveShadow = true;
  group.add(inner);

  // Painted lines, each a thin box so they catch the light like paint.
  const paint = (w, l, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, l), line);
    m.position.set(x, 0.03, z);
    m.receiveShadow = true;
    group.add(m);
  };
  const half = COURT.length / 2;
  paint(COURT.width, 0.08, 0, half);                 // baselines
  paint(COURT.width, 0.08, 0, -half);
  paint(0.08, COURT.length, COURT.width / 2, 0);     // doubles tramlines
  paint(0.08, COURT.length, -COURT.width / 2, 0);
  paint(0.08, COURT.length, COURT.singles / 2, 0);   // singles sidelines
  paint(0.08, COURT.length, -COURT.singles / 2, 0);
  paint(COURT.singles, 0.08, 0, 6.4);                // service lines
  paint(COURT.singles, 0.08, 0, -6.4);
  paint(0.08, 12.8, 0, 0);                           // centre service line

  // The net: a translucent sheet, a white band along the top, and two posts.
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.width + 1.2, 1.07),
    new THREE.MeshStandardMaterial({ color: '#2d3b45', transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
  );
  mesh.position.set(0, 0.535, 0);
  group.add(mesh);
  const band = new THREE.Mesh(new THREE.BoxGeometry(COURT.width + 1.2, 0.09, 0.05), line);
  band.position.set(0, 1.07, 0);
  band.castShadow = true;
  group.add(band);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 10), flat('#2d3b45'));
    post.position.set(s * (COURT.width / 2 + 0.6), 0.6, 0);
    post.castShadow = true;
    group.add(post);
  }

  // A low wall around the outside, so the court sits in something.
  for (const [w, l, x, z] of [[COURT.width + 9, 0.3, 0, half + 6.2], [COURT.width + 9, 0.3, 0, -half - 6.2],
                              [0.3, COURT.length + 12.4, COURT.width / 2 + 4.4, 0],
                              [0.3, COURT.length + 12.4, -COURT.width / 2 - 4.4, 0]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, l), flat('#2f6b4e'));
    wall.position.set(x, 1.1, z);
    wall.receiveShadow = true;
    group.add(wall);
  }

  // You, and the far player.
  const you = new Figure({ shirt: '#5aa8ea' });
  you.root.position.set(0, 0, half + 1.6);
  stage.world.add(you.root);

  const them = new Figure({ shirt: '#ef6a5a', hair: '#6b4b30' });
  them.root.position.set(0, 0, -half - 1.2);
  them.root.rotation.y = Math.PI;
  stage.world.add(them.root);

  // The ball, with a shadow blob of its own: a round shadow on the ground is
  // the only reliable way to read height in a 3D scene like this.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), flat('#e9f58a'));
  ball.castShadow = true;
  stage.world.add(ball);
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.16, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#2d3b45', transparent: true, opacity: 0.22 }),
  );
  stage.world.add(blob);

  // The racket, carried in the playing hand.
  const racket = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.3, 8), flat('#2d3b45'));
  handle.position.y = -0.15;
  racket.add(handle);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 24), flat('#f7fbfd'));
  rim.scale.set(1, 1.2, 1);
  rim.position.y = 0.18;
  racket.add(rim);
  const strings = new THREE.Mesh(
    new THREE.CircleGeometry(0.16, 20),
    new THREE.MeshStandardMaterial({ color: '#dfeaf1', transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
  );
  strings.scale.set(1, 1.2, 1);
  strings.position.y = 0.18;
  racket.add(strings);
  you.arms.right.elbow.add(racket);
  racket.position.y = -you.u * 1.5;
  racket.rotation.x = -0.5;

  return {
    group, you, them, ball, blob, racket,
    // ballAt takes court coordinates: x across, y up, z down the court.
    ballAt(x, y, z) {
      ball.position.set(x, Math.max(0.11, y), z);
      blob.position.set(x, 0.04, z);
      const lift = Math.min(1, y / 3);
      blob.scale.setScalar(1 + lift * 1.6);
      blob.material.opacity = 0.22 * (1 - lift * 0.6);
    },
    // Over your shoulder: far enough back that you are in the lower third of
    // frame and the far baseline is still visible above you.
    frame(stage2, depth01 = 0.5) {
      const back = half + 8.4 - depth01 * 2.2;
      stage2.look({
        from: { x: 1.4, y: 3.4, z: back },
        at: { x: 0, y: 1.5, z: -1 },
        lerp: 0.12,
      });
    },
  };
}
