import * as THREE from 'three';

/**
 * PowerUpManager — núcleo (Hermes)
 * Orbes coleccionables que viajan en los HUECOS de los anillos:
 * para agarrarlos tienes que atravesar el gap con precisión — riesgo/premio.
 *
 * - ESCUDO (cuadrado blanco): una muerte gratis. Se consume y aplasta muros.
 * - CALMA (círculo de acento): cámara lenta 3s para respirar.
 *
 * Spawn: como mucho 1 orbe activo, cada 14–22s, montado en el gap de un anillo
 * recién generado. La colección usa la MISMA lógica swept de los muros.
 */
export class PowerUpManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.orb = null;             // como mucho uno activo
    this.spawnCooldown = 8;      // primer orbe temprano para enseñar la mecánica
    this.nextSpawnIn = 8;
    this.onCollect = null;       // (type, x, y) => void

    // Geometrías compartidas — SOLO polígonos de bordes duros (nada de círculos)
    this.squareGeo = new THREE.PlaneGeometry(0.3, 0.3);
    this.squareEdges = new THREE.EdgesGeometry(this.squareGeo);
    const triShape = new THREE.Shape();
    triShape.moveTo(0, 0.2);
    triShape.lineTo(-0.18, -0.12);
    triShape.lineTo(0.18, -0.12);
    triShape.closePath();
    this.circleGeo = new THREE.ShapeGeometry(triShape); // CALMA = triángulo
    this.circleEdges = new THREE.EdgesGeometry(this.circleGeo);

    this.shieldFillMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    this.calmFillMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, side: THREE.DoubleSide });
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0x000000 });
  }

  reset() {
    this.removeOrb();
    this.spawnCooldown = 8;
    this.nextSpawnIn = 8;
  }

  setAccentColor(colorHex) {
    this.calmFillMat.color.setHex(colorHex);
  }

  /** Llamado por WallManager.onRingSpawned */
  onRingSpawned(ring) {
    if (this.orb) return;
    this.spawnCooldown -= 1; // un tick por anillo
    if (this.spawnCooldown > 0) return;
    if (!ring.gaps || ring.gaps.length === 0) return;

    const gapIndex = ring.gaps[Math.floor(Math.random() * ring.gaps.length)];
    const sectorAngle = (Math.PI * 2) / ring.sides;
    const angle = (gapIndex + 0.5) * sectorAngle;
    const type = Math.random() < 0.5 ? 'ESCUDO' : 'CALMA';

    const fillMat = type === 'ESCUDO' ? this.shieldFillMat : this.calmFillMat;
    const geo = type === 'ESCUDO' ? this.squareGeo : this.circleGeo;
    const edges = type === 'ESCUDO' ? this.squareEdges : this.circleEdges;

    const orbGroup = new THREE.Group();
    const mesh = new THREE.Mesh(geo, fillMat);
    orbGroup.add(mesh);
    const outline = new THREE.LineSegments(edges, this.edgeMat);
    outline.scale.set(1.15, 1.15, 1.15);
    orbGroup.add(outline);

    this.group.add(orbGroup);

    this.orb = {
      type,
      angle,
      ring,
      group: orbGroup,
      halfArc: 0.16 // generoso: se agarra fácil si vas por el gap
    };

    this.spawnCooldown = 0;
    this.nextSpawnIn = 14 + Math.random() * 8; // segundos hasta el siguiente (en ticks de anillo ≈ segundos)
    this.spawnCooldown = Math.ceil(this.nextSpawnIn / 1.2);
  }

  removeOrb() {
    if (this.orb) {
      this.group.remove(this.orb.group);
      this.orb = null;
    }
  }

  /**
   * Paso de simulación. Devuelve { collected: null | {type, x, y} }
   */
  update(deltaTime, playerHitbox, wallCenterRadius, wallThickness) {
    if (!this.orb) return { collected: null };

    const ring = this.orb.ring;
    // El orbe viaja pegado al centro de la banda del muro de su anillo
    const orbR = ring.radius * (wallCenterRadius + wallThickness * 0.5);
    const prevOrbR = ring.prevRadius * (wallCenterRadius + wallThickness * 0.5);

    // Swept: ¿el orbe cruzó la banda del jugador en este paso?
    const pLo = playerHitbox.bottom;
    const pHi = playerHitbox.top;
    let collected = null;

    if (prevOrbR >= pLo && orbR <= pHi) {
      // ¿Coinciden angularmente?
      const TAU = Math.PI * 2;
      const pMin = playerHitbox.angle - playerHitbox.halfArc - this.orb.halfArc;
      const pMax = playerHitbox.angle + playerHitbox.halfArc + this.orb.halfArc;
      let hit = false;
      for (const offset of [0, TAU, -TAU]) {
        if (this.orb.angle >= pMin + offset && this.orb.angle <= pMax + offset) {
          hit = true;
          break;
        }
      }
      if (hit) {
        collected = {
          type: this.orb.type,
          x: Math.cos(this.orb.angle) * playerHitbox.radius,
          y: Math.sin(this.orb.angle) * playerHitbox.radius
        };
        if (this.onCollect) this.onCollect(collected.type, collected.x, collected.y);
        this.removeOrb();
        return { collected };
      }
    }

    // Se fue el anillo (pasó al jugador): el orbe muere con él
    if (orbR < pLo - 0.5) {
      this.removeOrb();
    }

    return { collected };
  }

  /** Posiciona el mesh del orbe (llamar en render con alpha interpolado) */
  render(alpha, wallCenterRadius, wallThickness) {
    if (!this.orb) return;
    const ring = this.orb.ring;
    const r = ring.prevRadius + (ring.radius - ring.prevRadius) * alpha;
    const orbR = r * (wallCenterRadius + wallThickness * 0.5);
    this.orb.group.position.x = Math.cos(this.orb.angle) * orbR;
    this.orb.group.position.y = Math.sin(this.orb.angle) * orbR;
    this.orb.group.position.z = 0.1;
    // Pulso visual
    const s = 1 + Math.sin(performance.now() * 0.008) * 0.12;
    this.orb.group.scale.set(s, s, 1);
    this.orb.group.rotation.z += 0.03;
  }
}
