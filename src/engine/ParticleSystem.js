import * as THREE from 'three';

const TAU = Math.PI * 2;
const SOLID = new THREE.Color().setRGB(0, 0, 1); // data color: drawn crisp, not as glyphs
const SHARDS = 24;

/** Canvas feedback: a ripple when you graze a wall, a burst when you crash */
export class ParticleSystem {
  constructor(scene) {
    this.rippleMat = new THREE.MeshBasicMaterial({ color: SOLID, transparent: true, opacity: 0, depthWrite: false });
    this.rippleMesh = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.235, 48), this.rippleMat);
    scene.add(this.rippleMesh);
    this.rippleLife = 0;
    this.rippleSize = 1;

    this.pos = new Float32Array(SHARDS * 3);
    this.vel = new Float32Array(SHARDS * 2);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.burstMat = new THREE.PointsMaterial({ color: SOLID, size: 7, sizeAttenuation: false, transparent: true, opacity: 0 });
    this.points = new THREE.Points(this.geo, this.burstMat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  ripple(p, size = 1) {
    this.rippleMesh.position.set(p.x, p.y, 0.28);
    this.rippleLife = 1;
    this.rippleSize = size;
  }

  burst(p) {
    for (let i = 0; i < SHARDS; i++) {
      const a = (i / SHARDS) * TAU + Math.random() * 0.3;
      const v = 2 + Math.random() * 3;
      this.pos.set([p.x, p.y, 0.29], i * 3);
      this.vel[i * 2] = Math.cos(a) * v;
      this.vel[i * 2 + 1] = Math.sin(a) * v;
    }
    this.burstMat.opacity = 1;
    this.geo.attributes.position.needsUpdate = true;
  }

  clear() {
    this.rippleLife = 0;
    this.rippleMat.opacity = 0;
    this.burstMat.opacity = 0;
  }

  update(dt) {
    if (this.rippleLife > 0) {
      this.rippleLife = Math.max(0, this.rippleLife - dt * 2.8);
      const s = 1 + (1 - this.rippleLife) * 2.5 * this.rippleSize;
      this.rippleMesh.scale.set(s, s, 1);
      this.rippleMat.opacity = this.rippleLife * 0.8;
    }
    if (this.burstMat.opacity > 0) {
      const drag = Math.exp(-dt * 3);
      for (let i = 0; i < SHARDS; i++) {
        this.pos[i * 3] += this.vel[i * 2] * dt;
        this.pos[i * 3 + 1] += this.vel[i * 2 + 1] * dt;
        this.vel[i * 2] *= drag;
        this.vel[i * 2 + 1] *= drag;
      }
      this.burstMat.opacity = Math.max(0, this.burstMat.opacity - dt * 0.9);
      this.geo.attributes.position.needsUpdate = true;
    }
  }
}
