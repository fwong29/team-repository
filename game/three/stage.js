// stage.js: the 3D stage every sport is played on — renderer, camera, lights
// and the ground. Sports add their own props to `scene` and move the camera;
// nothing else here knows what sport is running.
//
// Three.js is loaded through the import map in the page, so the version is
// pinned in one place and not repeated across modules.

import * as THREE from 'three';

export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Flat and bright: no tone curve crushing the colours toward grey.
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
    this.camera.position.set(0, 2.6, 6);
    this.camera.lookAt(0, 1.2, 0);

    // Three lights and no more: a warm key that casts the shadows, a cool
    // sky/ground bounce, and a dim fill so the shadowed side is not black.
    this.key = new THREE.DirectionalLight('#fff6e0', 2.1);
    this.key.position.set(6, 12, 7);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 60;
    const d = 22;
    Object.assign(this.key.shadow.camera, { left: -d, right: d, top: d, bottom: -d });
    this.key.shadow.bias = -0.0006;
    this.scene.add(this.key, this.key.target);

    this.scene.add(new THREE.HemisphereLight('#cfeeff', '#6f9a55', 1.5));
    const fill = new THREE.DirectionalLight('#cfe6ff', 0.5);
    fill.position.set(-7, 5, -4);
    this.scene.add(fill);

    this.world = new THREE.Group();     // everything a sport adds goes here
    this.scene.add(this.world);

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  sky(top = '#9fd8f2', bottom = '#dcf1fb') {
    // A gradient sky as a big inside-out sphere. Cheaper and flatter-looking
    // than a cube map, and it matches the 2D palette.
    const geo = new THREE.SphereGeometry(200, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(top) },
        bottom: { value: new THREE.Color(bottom) },
      },
      vertexShader: `varying vec3 vPos;
        void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
        void main() {
          float t = clamp(normalize(vPos).y * 1.6 + 0.35, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottom, top, t), 1.0);
        }`,
    });
    const dome = new THREE.Mesh(geo, mat);
    this.scene.add(dome);
    return dome;
  }

  ground(color = '#8ccc5c', size = 300) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
    );
    mesh.receiveShadow = true;
    this.world.add(mesh);
    return mesh;
  }

  // Put the camera over a point, looking at a target. Every sport frames its
  // scene through this so the feel stays consistent.
  look({ from, at, lerp = 1 }) {
    if (lerp >= 1) this.camera.position.set(from.x, from.y, from.z);
    else this.camera.position.lerp(new THREE.Vector3(from.x, from.y, from.z), lerp);
    this.camera.lookAt(at.x, at.y, at.z);
  }

  // Everything a sport added, thrown away between games.
  clearWorld() {
    for (const child of [...this.world.children]) {
      this.world.remove(child);
      child.traverse?.(n => {
        n.geometry?.dispose?.();
        if (Array.isArray(n.material)) n.material.forEach(m => m.dispose());
        else n.material?.dispose?.();
      });
    }
  }

  render() { this.renderer.render(this.scene, this.camera); }
}

// Shared materials: one place for the flat, bright look.
export function flat(color, { rough = 0.85, metal = 0 } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}
