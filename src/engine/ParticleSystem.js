import * as THREE from 'three';

/**
 * ParticleSystem — Presentation Subsystem
 * High-performance particle system: player motion trail, radial shockwaves,
 * explosion bursts, and ambient warp speed dust.
 */
export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;

    // 1. Player Motion Trail
    this.trailCount = 40;
    this.trailGeo = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(this.trailCount * 3);
    this.trailLife = new Float32Array(this.trailCount);
    
    for (let i = 0; i < this.trailCount; i++) {
      this.trailPos[i * 3] = 0;
      this.trailPos[i * 3 + 1] = 0;
      this.trailPos[i * 3 + 2] = -999;
      this.trailLife[i] = 0;
    }
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    this.trailMat = new THREE.PointsMaterial({
      color: 0x00ff66,
      size: 0.12,
      transparent: true,
      opacity: 0.85
    });
    this.trailMesh = new THREE.Points(this.trailGeo, this.trailMat);
    this.scene.add(this.trailMesh);
    this.trailIndex = 0;

    // 2. Near-Miss / Rank-up Shockwave Ring
    const ringGeo = new THREE.RingGeometry(1.2, 1.35, 6, 1); // hexagonal: bordes duros, nada de círculos
    this.shockwaveMat = new THREE.MeshBasicMaterial({
      color: 0xff0055,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0
    });
    this.shockwaveMesh = new THREE.Mesh(ringGeo, this.shockwaveMat);
    this.shockwaveMesh.position.z = 0.05;
    this.scene.add(this.shockwaveMesh);
    this.shockwaveLife = 0;
    this.shockwaveSpeed = 18;

    // 3. Explosion Particles
    this.explosionCount = 160;
    this.explosionGeo = new THREE.BufferGeometry();
    this.explosionPos = new Float32Array(this.explosionCount * 3);
    this.explosionVel = new Float32Array(this.explosionCount * 3);
    this.explosionLife = new Float32Array(this.explosionCount);
    
    for (let i = 0; i < this.explosionCount; i++) {
      this.explosionPos[i * 3] = 0;
      this.explosionPos[i * 3 + 1] = 0;
      this.explosionPos[i * 3 + 2] = 0;
      this.explosionLife[i] = 0;
    }
    this.explosionGeo.setAttribute('position', new THREE.BufferAttribute(this.explosionPos, 3));
    this.explosionMat = new THREE.PointsMaterial({
      color: 0xff0055,
      size: 0.22,
      transparent: true,
      opacity: 0
    });
    this.explosionMesh = new THREE.Points(this.explosionGeo, this.explosionMat);
    this.scene.add(this.explosionMesh);

    // 4. Ambient Dust (Disabled for 100% clean visual clarity)
    this.dustCount = 0;
    this.dustGeo = new THREE.BufferGeometry();
    this.dustMat = new THREE.PointsMaterial({ opacity: 0, visible: false });
    this.dustMesh = new THREE.Points(this.dustGeo, this.dustMat);
  }

  clearTrail() {
    for (let i = 0; i < this.trailCount; i++) {
      this.trailPos[i * 3 + 2] = -999;
      this.trailLife[i] = 0;
    }
    this.trailGeo.attributes.position.needsUpdate = true;
  }

  addPlayerTrailPoint(x, y, z = -0.05) {
    this.trailPos[this.trailIndex * 3] = x;
    this.trailPos[this.trailIndex * 3 + 1] = y;
    this.trailPos[this.trailIndex * 3 + 2] = z;
    this.trailLife[this.trailIndex] = 1.0;
    this.trailIndex = (this.trailIndex + 1) % this.trailCount;
    this.trailGeo.attributes.position.needsUpdate = true;
  }

  emitTrailPoint(x, y) {
    this.addPlayerTrailPoint(x, y, -0.05);
  }

  triggerNearMissShockwave(colorHex) {
    if (typeof colorHex === 'number') {
      this.shockwaveMat.color.setHex(colorHex);
    } else if (colorHex && colorHex.getHex) {
      this.shockwaveMat.color.copy(colorHex);
    }
    this.shockwaveMat.opacity = 0.95;
    this.shockwaveMesh.scale.set(1.0, 1.0, 1.0);
    this.shockwaveLife = 1.0;
    this.shockwaveSpeed = 18;
  }

  triggerShockwave(x, y, colorHex, speed = 18) {
    this.shockwaveMesh.position.set(x || 0, y || 0, 0.05);
    this.shockwaveSpeed = speed || 18;
    this.triggerNearMissShockwave(colorHex);
  }

  triggerExplosion(x, y, colorHex) {
    if (typeof colorHex === 'number') {
      this.explosionMat.color.setHex(colorHex);
    } else if (colorHex && colorHex.getHex) {
      this.explosionMat.color.copy(colorHex);
    }
    this.explosionMat.opacity = 1.0;

    for (let i = 0; i < this.explosionCount; i++) {
      this.explosionPos[i * 3] = x;
      this.explosionPos[i * 3 + 1] = y;
      this.explosionPos[i * 3 + 2] = 0;

      const angle = Math.random() * Math.PI * 2;
      const speedVal = 5 + Math.random() * 15;
      this.explosionVel[i * 3] = Math.cos(angle) * speedVal;
      this.explosionVel[i * 3 + 1] = Math.sin(angle) * speedVal;
      this.explosionVel[i * 3 + 2] = (Math.random() - 0.5) * 3;

      this.explosionLife[i] = 1.0;
    }
    this.explosionGeo.attributes.position.needsUpdate = true;
  }

  update(deltaTime, speedMultiplier = 1.0) {
    // Update Player Trail
    for (let i = 0; i < this.trailCount; i++) {
      if (this.trailLife[i] > 0) {
        this.trailLife[i] -= deltaTime * 3.2;
      }
    }

    // Update Near-Miss / Rank Shockwave
    if (this.shockwaveLife > 0) {
      this.shockwaveLife -= deltaTime * 3.5;
      const expansion = (1.0 - this.shockwaveLife) * (this.shockwaveSpeed * 0.15);
      const s = 1.0 + expansion;
      this.shockwaveMesh.scale.set(s, s, 1.0);
      this.shockwaveMat.opacity = Math.max(0, this.shockwaveLife * 0.95);
    }

    // Update Explosion Particles
    if (this.explosionMat.opacity > 0) {
      for (let i = 0; i < this.explosionCount; i++) {
        if (this.explosionLife[i] > 0) {
          this.explosionLife[i] -= deltaTime * 2.0;
          this.explosionPos[i * 3] += this.explosionVel[i * 3] * deltaTime;
          this.explosionPos[i * 3 + 1] += this.explosionVel[i * 3 + 1] * deltaTime;
          this.explosionPos[i * 3 + 2] += this.explosionVel[i * 3 + 2] * deltaTime;
        }
      }
      this.explosionMat.opacity = Math.max(0, this.explosionMat.opacity - deltaTime * 1.5);
    this.explosionGeo.attributes.position.needsUpdate = true;
    }
  }

  setThemeColors(colorHex) {
    if (typeof colorHex === 'number') {
      this.trailMat.color.setHex(colorHex);
    } else if (colorHex && colorHex.getHex) {
      this.trailMat.color.copy(colorHex);
    }
  }
}

