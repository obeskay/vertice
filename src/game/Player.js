import * as THREE from 'three';

/**
 * Player — Precision Arcade Ship
 * Supports two elite control paradigms:
 * 1. ARCADE FLUID (Default): High-speed, silky smooth continuous 360° orbital steering
 *    with instant response, dynamic banking tilt, and jet thruster flares.
 * 2. LANES DISCRETE: Crisp discrete hopping between polygon sectors for puzzle precision.
 */
const TAU = Math.PI * 2;

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.radius = 1.35;
    this.angle = Math.PI / 2;
    this.prevAngle = this.angle;
    this.angularVel = 0;
    this.turboActive = false;

    // Control Mode: 'ARCADE' (continuous) | 'LANES' (discrete steps)
    this.controlMode = 'ARCADE';

    // Arcade movement tuning (snappy, highly responsive, zero deadzone)
    this.baseSpeed = 11.0;   // rad/s (instant, fluid arcade response)
    this.turboSpeed = 18.0;  // rad/s
    this.acceleration = 140.0;
    this.damping = 48.0;

    // Lanes mode variables
    this.lanes = 6;
    this.targetLane = 0;
    this.setLanes(6);

    // Hitbox calibration (fair, tight hitbox for exhilarating near-misses)
    this.halfArc = 0.068;
    this.hitBottom = 1.28;
    this.hitTop = 1.42;

    this.tilt = 0;

    this.meshGroup = new THREE.Group();

    // 1. Sleek Precision Arrow Ship
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.18);
    shape.lineTo(-0.115, -0.10);
    shape.lineTo(0, -0.045); // Aerodynamic notch
    shape.lineTo(0.115, -0.10);
    shape.closePath();

    const geometry = new THREE.ShapeGeometry(shape);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide
    });
    this.shipMesh = new THREE.Mesh(geometry, this.material);
    this.meshGroup.add(this.shipMesh);

    // Neobrutalist Black Border
    const edgesGeo = new THREE.EdgesGeometry(geometry);
    this.shipEdges = new THREE.LineSegments(
      edgesGeo,
      new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 })
    );
    this.shipEdges.scale.set(1.06, 1.06, 1.06);
    this.meshGroup.add(this.shipEdges);

    // 2. Thruster Flame / Jet Exhaust Flare
    const thrusterShape = new THREE.Shape();
    thrusterShape.moveTo(0, -0.045);
    thrusterShape.lineTo(-0.07, -0.28);
    thrusterShape.lineTo(0.07, -0.28);
    thrusterShape.closePath();
    this.thrusterMat = new THREE.MeshBasicMaterial({
      color: 0x00ff66,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0
    });
    this.thrusterMesh = new THREE.Mesh(new THREE.ShapeGeometry(thrusterShape), this.thrusterMat);
    this.meshGroup.add(this.thrusterMesh);

    // 3. Hexagonal Force Shield
    const shieldPts = [];
    for (let i = 0; i <= 6; i++) {
      const a = (i % 6) / 6 * TAU + TAU / 12;
      shieldPts.push(new THREE.Vector3(Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0));
    }
    this.shieldMat = new THREE.LineBasicMaterial({
      color: 0x00ff66,
      transparent: true,
      opacity: 0.95,
      linewidth: 2
    });
    this.shieldMesh = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(shieldPts),
      this.shieldMat
    );
    this.shieldMesh.visible = false;
    this.meshGroup.add(this.shieldMesh);

    this.scene.add(this.meshGroup);
    this._renderAngle = this.angle;
    this.updateMeshPosition(0, 1, 0.016);
  }

  setControlMode(mode) {
    this.controlMode = mode === 'LANES' ? 'LANES' : 'ARCADE';
    if (this.controlMode === 'LANES') {
      this.targetLane = this._nearestLane(this.angle);
    }
  }

  toggleControlMode() {
    this.setControlMode(this.controlMode === 'ARCADE' ? 'LANES' : 'ARCADE');
    return this.controlMode;
  }

  setLanes(n) {
    this.lanes = Math.max(2, n);
    this.targetLane = this._nearestLane(this.angle);
  }

  _nearestLane(angle) {
    const sector = TAU / this.lanes;
    const idx = Math.round(angle / sector - 0.5);
    return ((idx % this.lanes) + this.lanes) % this.lanes;
  }

  _laneAngle(lane) {
    const sector = TAU / this.lanes;
    return (lane + 0.5) * sector;
  }

  queueLaneMove(dir) {
    this.targetLane = ((this.targetLane + dir) % this.lanes + this.lanes) % this.lanes;
  }

  reset() {
    this.angle = Math.PI / 2;
    this.prevAngle = this.angle;
    this.angularVel = 0;
    this.tilt = 0;
    this.turboActive = false;
    this.meshGroup.visible = true;
    this.showShield(false);
    this.targetLane = this._nearestLane(this.angle);
    this.updateMeshPosition(0, 1, 0.016);
  }

  /**
   * Fixed Timestep Simulation Step
   */
  update(deltaTime, inputDir, turbo = false, pointerAngle = null) {
    this.prevAngle = this.angle;
    this.turboActive = turbo;

    // Pointer steer overrides
    if (pointerAngle !== null && pointerAngle !== undefined) {
      if (this.controlMode === 'LANES') {
        this.targetLane = this._nearestLane(((pointerAngle % TAU) + TAU) % TAU);
      } else {
        // Smooth direct tracking with shortest angular difference
        let diff = pointerAngle - this.angle;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const targetSpeed = Math.max(-this.turboSpeed, Math.min(this.turboSpeed, diff * 32.0));
        this.angularVel += (targetSpeed - this.angularVel) * Math.min(1, deltaTime * 40.0);
        this.angle = ((this.angle + this.angularVel * deltaTime) % TAU + TAU) % TAU;
        if (Math.abs(diff) < 0.002) {
          this.angle = pointerAngle;
          this.angularVel = 0;
        }
        return;
      }
    }

    if (this.controlMode === 'ARCADE') {
      // Fluid Arcade Continuous Steering
      const maxSpeed = turbo ? this.turboSpeed : this.baseSpeed;
      const targetVel = inputDir * maxSpeed;

      if (inputDir !== 0) {
        this.angularVel += (targetVel - this.angularVel) * Math.min(1, deltaTime * this.acceleration);
      } else {
        this.angularVel += (0 - this.angularVel) * Math.min(1, deltaTime * this.damping);
        if (Math.abs(this.angularVel) < 0.05) this.angularVel = 0;
      }

      this.angle = (this.angle + this.angularVel * deltaTime) % TAU;
      this.angle = (this.angle + TAU) % TAU;
    } else {
      // Lanes Mode Proportional Snapping
      const target = this._laneAngle(this.targetLane);
      let diff = target - this.angle;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;

      const stiffness = turbo ? 65 : 32;
      this.angularVel = diff * stiffness;
      this.angle = (this.angle + this.angularVel * deltaTime) % TAU;
      this.angle = (this.angle + TAU) % TAU;

      if (Math.abs(diff) < 0.0015) {
        this.angle = ((target % TAU) + TAU) % TAU;
        this.angularVel = 0;
      }
    }
  }

  /**
   * Interpolated Render Pass
   */
  updateMeshPosition(inputDir = 0, alpha = 1, dt = 0.016) {
    let diff = this.angle - this.prevAngle;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    const renderAngle = this.prevAngle + diff * alpha;
    this._renderAngle = renderAngle;

    this.meshGroup.position.x = Math.cos(renderAngle) * this.radius;
    this.meshGroup.position.y = Math.sin(renderAngle) * this.radius;
    this.meshGroup.position.z = 0.08;
    this.meshGroup.rotation.z = renderAngle - Math.PI / 2;

    // Banking tilt: Ship rolls into the turn
    const speedNorm = Math.max(-1, Math.min(1, this.angularVel / (this.baseSpeed * 0.95)));
    const targetTilt = -speedNorm * 0.40;
    this.tilt += (targetTilt - this.tilt) * Math.min(1, dt * 25);
    this.shipMesh.rotation.z = this.tilt;
    this.shipEdges.rotation.z = this.tilt;

    // Turbo aerodynamic elongation
    const stretch = this.turboActive ? 1.40 : (Math.abs(this.angularVel) > 1 ? 1.10 : 1.0);
    const cur = this.shipMesh.scale.x;
    const next = cur + (stretch - cur) * Math.min(1, dt * 16);
    this.shipMesh.scale.set(next, 1, 1);
    this.shipEdges.scale.set(1.06 * next, 1.06, 1.06);

    // Jet Thruster Flare
    const isMoving = Math.abs(this.angularVel) > 0.5 || this.turboActive;
    if (isMoving) {
      const baseOpacity = this.turboActive ? 0.95 : 0.70;
      this.thrusterMat.opacity = baseOpacity + (Math.random() - 0.5) * 0.2;
      const flareScale = this.turboActive ? 1.65 : 1.15;
      this.thrusterMesh.scale.set(flareScale * (1 + Math.random() * 0.2), flareScale * (1 + Math.random() * 0.3), 1);
    } else {
      this.thrusterMat.opacity = Math.max(0, this.thrusterMat.opacity - dt * 18);
    }

    if (this.shieldMesh.visible) {
      this.shieldMesh.rotation.z += dt * 4.0;
      const s = 1.0 + Math.sin(performance.now() * 0.012) * 0.09;
      this.shieldMesh.scale.set(s, s, 1);
    }
  }

  getRenderPosition() {
    return {
      x: this.meshGroup.position.x,
      y: this.meshGroup.position.y,
      angle: this._renderAngle,
      tilt: this.tilt
    };
  }

  showShield(on) {
    this.shieldMesh.visible = on;
  }

  setColor(colorHex) {
    if (typeof colorHex === 'number') {
      this.material.color.setHex(colorHex);
      if (this.thrusterMat) this.thrusterMat.color.setHex(colorHex);
    } else if (colorHex && colorHex.getHex) {
      this.material.color.copy(colorHex);
      if (this.thrusterMat) this.thrusterMat.color.copy(colorHex);
    }
  }

  setShieldColor(colorHex) {
    if (typeof colorHex === 'number') {
      this.shieldMat.color.setHex(colorHex);
    } else if (colorHex && colorHex.getHex) {
      this.shieldMat.color.copy(colorHex);
    }
  }

  getHitbox() {
    return {
      angle: this.angle,
      halfArc: this.halfArc,
      bottom: this.hitBottom,
      top: this.hitTop,
      radius: this.radius
    };
  }
}
