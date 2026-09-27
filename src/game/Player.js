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

    // Phase Dash Mechanics
    this.dashCooldownDuration = 2.8;
    this.dashCooldownTimer = 0;
    this.dashInvulnDuration = 0.22;
    this.dashInvulnTimer = 0;

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

    // 4. Phantom Ghost Ship (Historical Personal Best Replay Shadow)
    this.ghostGroup = new THREE.Group();
    this.ghostMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide
    });
    this.ghostMesh = new THREE.Mesh(geometry, this.ghostMat);
    this.ghostGroup.add(this.ghostMesh);

    this.ghostEdges = new THREE.LineSegments(
      edgesGeo,
      new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.60, linewidth: 2 })
    );
    this.ghostEdges.scale.set(1.05, 1.05, 1.05);
    this.ghostGroup.add(this.ghostEdges);
    this.ghostGroup.visible = false;
    this.scene.add(this.ghostGroup);

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
    this.dashCooldownTimer = 0;
    this.dashInvulnTimer = 0;
    this.meshGroup.visible = true;
    this.ghostGroup.visible = false;
    this.showShield(false);
    this.targetLane = this._nearestLane(this.angle);
    this.updateMeshPosition(0, 1, 0.016);
  }

  triggerPhaseDash(dir = 0) {
    if (this.dashCooldownTimer > 0) return false;
    this.dashCooldownTimer = this.dashCooldownDuration;
    this.dashInvulnTimer = this.dashInvulnDuration;

    let dashDir = dir;
    if (dashDir === 0) {
      dashDir = Math.sign(this.angularVel) || 1;
    }

    if (this.controlMode === 'LANES') {
      this.queueLaneMove(dashDir);
      this.angularVel = dashDir * 38.0;
    } else {
      // Rapid orbital leap along the perimeter
      this.angularVel = dashDir * 32.0;
      this.angle = ((this.angle + dashDir * 0.42) % TAU + TAU) % TAU;
    }
    return true;
  }

  reduceDashCooldown(amount = 1.0) {
    this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - amount);
  }

  get isInvulnerable() {
    return this.dashInvulnTimer > 0;
  }

  get dashReady() {
    return this.dashCooldownTimer <= 0;
  }

  get dashProgress() {
    return 1 - Math.max(0, this.dashCooldownTimer / this.dashCooldownDuration);
  }

  setGhostVisible(visible) {
    this.ghostGroup.visible = visible;
  }

  updateGhostPosition(angle) {
    if (!this.ghostGroup.visible || angle === null || angle === undefined) return;
    this.ghostGroup.position.x = Math.cos(angle) * this.radius;
    this.ghostGroup.position.y = Math.sin(angle) * this.radius;
    this.ghostGroup.position.z = 0.07;
    this.ghostGroup.rotation.z = angle - Math.PI / 2;
  }

  setGhostColor(colorHex) {
    if (typeof colorHex === 'number') {
      this.ghostMat.color.setHex(colorHex);
      this.ghostEdges.material.color.setHex(colorHex);
    } else if (colorHex && colorHex.getHex) {
      this.ghostMat.color.copy(colorHex);
      this.ghostEdges.material.color.copy(colorHex);
    }
  }

  /**
   * Fixed Timestep Simulation Step
   */
  update(deltaTime, inputDir, turbo = false, pointerAngle = null) {
    this.prevAngle = this.angle;
    this.turboActive = turbo;

    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - deltaTime);
    }
    if (this.dashInvulnTimer > 0) {
      this.dashInvulnTimer = Math.max(0, this.dashInvulnTimer - deltaTime);
    }

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
      // Fluid Arcade Continuous Steering with Counter-Steer Boost
      const maxSpeed = turbo ? this.turboSpeed : this.baseSpeed;
      const targetVel = inputDir * maxSpeed;

      if (inputDir !== 0) {
        // Instant response counter-steering torque: eliminates sluggish turnaround
        const isCounterSteer = (this.angularVel > 0.5 && inputDir < 0) || (this.angularVel < -0.5 && inputDir > 0);
        const effectiveAccel = isCounterSteer ? this.acceleration * 3.5 : this.acceleration;
        this.angularVel += (targetVel - this.angularVel) * Math.min(1, deltaTime * effectiveAccel);
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

    // Phase Dash Invulnerability Aura Flare (set on the group so it never compounds with the stretch lerp)
    const pulseScale = 1.0 + (this.dashInvulnTimer / this.dashInvulnDuration) * 0.40;
    this.meshGroup.scale.set(pulseScale, pulseScale, 1);

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
