import * as THREE from 'three';
import { PAPER, PAPER_DEEP, INK } from '../palette.js';

const TAU = Math.PI * 2;
const CENTER_R = 1.05;   // WallManager.centerRadius
const MIN_HALF_W = 3.3;  // world units always visible left/right of the center (phones)
const MIN_HALF_H = 4.2;  // and above/below it (desktop)

/**
 * Flat top-down view: paper background split into wedges, an ink polygon in
 * the middle. The whole scene turns with the world; the camera only shakes.
 */
export class Renderer {
  constructor(containerId) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PAPER);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
    this.camera.position.z = 10;

    this.gl = new THREE.WebGLRenderer({ antialias: true });
    document.getElementById(containerId).appendChild(this.gl.domElement);

    this.wedges = new THREE.Group();
    this.wedges.position.z = -1;
    this.scene.add(this.wedges);
    this.wedgeMats = [
      new THREE.MeshBasicMaterial({ color: PAPER }),
      new THREE.MeshBasicMaterial({ color: PAPER_DEEP })
    ];
    // An odd count would put two equal wedges side by side: the last one takes the middle shade
    this.wedgeMid = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAPER).lerp(new THREE.Color(PAPER_DEEP), 0.5) });
    this.centerMat = new THREE.MeshBasicMaterial({ color: INK });
    this.center = null;
    this.sides = 0;

    this.shakeAmount = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Rebuilds the center polygon and the background wedges for a side count */
  setSides(sides) {
    if (sides === this.sides) return;
    this.sides = sides;
    const sector = TAU / sides;
    const corner = (i, r) => new THREE.Vector2(Math.cos(i * sector) * r, Math.sin(i * sector) * r);

    for (const m of this.wedges.children) m.geometry.dispose();
    this.wedges.clear();
    for (let i = 0; i < sides; i++) {
      const shape = new THREE.Shape([corner(i, CENTER_R), corner(i + 1, CENTER_R), corner(i + 1, 40), corner(i, 40)]);
      const mat = sides % 2 && i === sides - 1 ? this.wedgeMid : this.wedgeMats[i % 2];
      this.wedges.add(new THREE.Mesh(new THREE.ShapeGeometry(shape), mat));
    }

    if (this.center) {
      this.center.geometry.dispose();
      this.scene.remove(this.center);
    }
    const poly = new THREE.Shape(Array.from({ length: sides }, (_, i) => corner(i, CENTER_R)));
    this.center = new THREE.Mesh(new THREE.ShapeGeometry(poly), this.centerMat);
    this.center.position.z = 0.2; // above the walls sliding into it
    this.scene.add(this.center);
  }

  shake(amount) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  render(dt, rotation) {
    this.scene.rotation.z = rotation;
    const s = this.shakeAmount;
    this.camera.position.x = (Math.random() - 0.5) * s;
    this.camera.position.y = (Math.random() - 0.5) * s;
    this.shakeAmount = Math.max(0, s - dt * 2.5);
    this.gl.render(this.scene, this.camera);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    const halfH = Math.max(MIN_HALF_H, MIN_HALF_W / aspect);
    const halfW = halfH * aspect;
    Object.assign(this.camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    this.camera.updateProjectionMatrix();
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.gl.setSize(w, h);
  }
}
