import * as THREE from 'three';

/**
 * Player — núcleo (Hermes)
 * MOVIMIENTO POR CARRILES: la identidad de VÉRTICE.
 * El nivel define el número de posiciones posibles:
 *   LÍNEA = 2, TRIÁNGULO = 3, CUADRADO = 4, PENTÁGONO = 5, HEXÁGONO = 6...
 * Cada input salta UN carril; la nave se desliza con control proporcional
 * (ease-out, ~80ms) — discreto como un puzzle, fluido como un arcade.
 * El mouse apunta al carril más cercano al cursor.
 */
const TAU = Math.PI * 2;

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.radius = 1.35;
    this.angle = Math.PI / 2;
    this.prevAngle = this.angle;
    this.vel = 0;
    this.turboActive = false;

    // Carriles
    this.lanes = 2;
    this.targetLane = 0;
    this.setLanes(2);

    this.halfArc = 0.075;
    this.hitBottom = 1.27;
    this.hitTop = 1.43;

    this.tilt = 0;

    this.meshGroup = new THREE.Group();

    const shape = new THREE.Shape();
    shape.moveTo(0, 0.16);
    shape.lineTo(-0.11, -0.10);
    shape.lineTo(0.11, -0.10);
    shape.closePath();

    const geometry = new THREE.ShapeGeometry(shape);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide
    });
    this.shipMesh = new THREE.Mesh(geometry, this.material);
    this.meshGroup.add(this.shipMesh);

    const edgesGeo = new THREE.EdgesGeometry(geometry);
    this.shipEdges = new THREE.LineSegments(
      edgesGeo,
      new THREE.LineBasicMaterial({ color: 0x000000 })
    );
    this.shipEdges.scale.set(1.1, 1.1, 1.1);
    this.meshGroup.add(this.shipEdges);

    // Escudo HEXAGONAL
    const shieldPts = [];
    for (let i = 0; i <= 6; i++) {
      const a = (i % 6) / 6 * TAU + TAU / 12;
      shieldPts.push(new THREE.Vector3(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0));
    }
    this.shieldMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9
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

  /** Cambia el número de carriles (al cambiar de nivel) */
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

  /** Un salto de carril (input discreto) */
  queueLaneMove(dir) {
    this.targetLane = ((this.targetLane + dir) % this.lanes + this.lanes) % this.lanes;
  }

  reset() {
    this.angle = Math.PI / 2;
    this.prevAngle = this.angle;
    this.vel = 0;
    this.tilt = 0;
    this.turboActive = false;
    this.meshGroup.visible = true;
    this.showShield(false);
    this.targetLane = this._nearestLane(this.angle);
    this.updateMeshPosition(0, 1, 0.016);
  }

  /**
   * Paso de simulación (timestep fijo).
   * @param pointerAngle ángulo del mouse → se traduce al carril más cercano
   */
  update(deltaTime, inputDir, turbo = false, pointerAngle = null) {
    this.prevAngle = this.angle;

    if (pointerAngle !== null && pointerAngle !== undefined) {
      this.targetLane = this._nearestLane(((pointerAngle % TAU) + TAU) % TAU);
    }

    const target = this._laneAngle(this.targetLane);
    let diff = target - this.angle;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;

    // Control proporcional: llegada rápida y suave (ease-out), sin rebote
    const stiffness = turbo ? 30 : 18;
    this.vel = diff * stiffness;
    this.angle = (this.angle + this.vel * deltaTime) % TAU;
    this.angle = (this.angle + TAU) % TAU;

    // Snap final para precisión de hitbox
    if (Math.abs(diff) < 0.0015) {
      this.angle = ((target % TAU) + TAU) % TAU;
      this.vel = 0;
    }

    this.turboActive = Math.abs(this.vel) > 6;
  }

  /** Render interpolado */
  updateMeshPosition(inputDir = 0, alpha = 1, dt = 0.016) {
    let diff = this.angle - this.prevAngle;
    if (diff > Math.PI) diff -= TAU;
    if (diff < -Math.PI) diff += TAU;
    const renderAngle = this.prevAngle + diff * alpha;
    this._renderAngle = renderAngle;

    this.meshGroup.position.x = Math.cos(renderAngle) * this.radius;
    this.meshGroup.position.y = Math.sin(renderAngle) * this.radius;
    this.meshGroup.position.z = 0.08;
    this.meshGroup.rotation.z = renderAngle - Math.PI / 2;

    const speedNorm = Math.max(-1, Math.min(1, this.vel / 10));
    const targetTilt = -speedNorm * 0.3;
    this.tilt += (targetTilt - this.tilt) * Math.min(1, dt * 16);
    this.shipMesh.rotation.z = this.tilt;
    this.shipEdges.rotation.z = this.tilt;

    const stretch = this.turboActive ? 1.22 : 1;
    const cur = this.shipMesh.scale.x;
    const next = cur + (stretch - cur) * Math.min(1, dt * 10);
    this.shipMesh.scale.set(next, 1, 1);
    this.shipEdges.scale.set(1.1 * next, 1.1, 1.1);

    if (this.shieldMesh.visible) {
      this.shieldMesh.rotation.z += dt * 2.5;
    }
  }

  getRenderPosition() {
    return {
      x: this.meshGroup.position.x,
      y: this.meshGroup.position.y,
      angle: this._renderAngle
    };
  }

  showShield(on) {
    this.shieldMesh.visible = on;
  }

  setColor(colorHex) {
    if (typeof colorHex === 'number') this.material.color.setHex(colorHex);
    else if (colorHex && colorHex.getHex) this.material.color.copy(colorHex);
  }

  setShieldColor(colorHex) {
    this.shieldMat.color.setHex(colorHex);
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
