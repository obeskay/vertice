import * as THREE from 'three';

/**
 * WallManager — núcleo (Hermes)
 * El túnel hipnótico + las colisiones que se sienten JUSTAS:
 *
 * - Paredes 3D extruidas con borde negro (look Super Hexagon).
 * - SWEPT BAND COLLISION: la banda de la pared se barre entre frames y se
 *   intersecta con la BANDA RADIAL del jugador (no un punto). Cero tunelaje
 *   y cero muertes fantasma: la banda letal del jugador es más chica que su
 *   sprite, así que "rozar sin morir" es posible y se siente increíble.
 * - NEAR-MISS garantizado: se evalúa cuando el anillo termina de cruzar la
 *   banda del jugador — si quedaste a < margen angular del borde, cuenta.
 * - Geometría cacheada por lados (cero triangulación en caliente).
 * - Expone gaps por anillo + hook onRingSpawned (para power-ups).
 * - ghostTime: ventana de invulnerabilidad (escudo consumido).
 */
export class WallManager {
  constructor(scene) {
    this.scene = scene;
    this.wallsGroup = new THREE.Group();
    this.scene.add(this.wallsGroup);

    this.activeRings = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1.6;
    this.wallThickness = 0.55; // muros robustos: legibles a lo lejos (legibilidad > realismo)
    this.centerRadius = 1.0;
    this.spawnRadius = 16.0;
    this.nearMissMargin = 0.16;
    this.ghostTime = 0;

    this.currentPattern = 'SINGLE_GAP';
    this.patternStep = 0;
    this.patternLength = 6;
    this.patternGapIndex = 0;
    this.spiralDirection = 1;

    this.geoCache = new Map(); // sides -> { fill, edges }

    this.material = new THREE.MeshBasicMaterial({
      color: 0x00ff66,
      side: THREE.DoubleSide
    });
    this.edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });

    this.onRingSpawned = null; // hook: (ring) => void
  }

  reset() {
    while (this.wallsGroup.children.length > 0) {
      this.wallsGroup.remove(this.wallsGroup.children[0]);
    }
    this.activeRings = [];
    this.spawnTimer = 0;
    this.patternStep = 0;
    this.ghostTime = 0;
    this._mercyFirstRing = true; // el primer anillo siempre tiene gap donde estás
  }

  setColor(colorHex) {
    if (typeof colorHex === 'number') this.material.color.setHex(colorHex);
    else if (colorHex && colorHex.getHex) this.material.color.copy(colorHex);
  }

  /**
   * Sector TRAPEZOIDAL de bordes RECTOS — el muro sigue la forma del polígono
   * del nivel (5/6/7/8 lados), como en Super Hexagon. Nada de arcos redondos.
   */
  getSectorGeometry(sides) {
    let cached = this.geoCache.get(sides);
    if (cached) return cached;

    const sectorAngle = (Math.PI * 2) / sides;
    const innerR = this.centerRadius;
    const outerR = this.centerRadius + this.wallThickness;

    // 4 vértices: trapecio recto entre esquinas del polígono
    const shape = new THREE.Shape();
    shape.moveTo(Math.cos(0) * outerR, Math.sin(0) * outerR);
    shape.lineTo(Math.cos(sectorAngle) * outerR, Math.sin(sectorAngle) * outerR);
    shape.lineTo(Math.cos(sectorAngle) * innerR, Math.sin(sectorAngle) * innerR);
    shape.lineTo(Math.cos(0) * innerR, Math.sin(0) * innerR);
    shape.closePath();

    const fill = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false });
    const edges = new THREE.EdgesGeometry(fill, 20);

    cached = { fill, edges };
    this.geoCache.set(sides, cached);
    return cached;
  }

  /**
   * Paso de simulación (timestep fijo).
   * @param suppressSpawn true cuando el spawn lo gobierna el beat externo (MusicSync)
   * Devuelve { collision: bool, nearMiss: null | {x, y} }
   */
  update(deltaTime, speed, sides, playerHitbox, suppressSpawn = false) {
    this._lastHitbox = playerHitbox || this._lastHitbox;
    this.spawnInterval = Math.max(0.55, 7.5 / speed);

    if (!suppressSpawn) {
      this.spawnTimer += deltaTime;
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer = 0;
        this.spawnRingPattern(sides);
      }
    }

    if (this.ghostTime > 0) this.ghostTime -= deltaTime;

    let collision = false;
    let nearMiss = null;

    const pLo = playerHitbox.bottom !== undefined ? playerHitbox.bottom : playerHitbox.radius;
    const pHi = playerHitbox.top !== undefined ? playerHitbox.top : playerHitbox.radius;

    for (let i = this.activeRings.length - 1; i >= 0; i--) {
      const ring = this.activeRings[i];
      ring.prevRadius = ring.radius;
      ring.radius -= speed * deltaTime;

      // Banda de la pared barrida en este paso: [newInner, prevOuter]
      const newInner = ring.radius * this.centerRadius;
      const prevOuter = ring.prevRadius * (this.centerRadius + this.wallThickness);
      const newOuter = ring.radius * (this.centerRadius + this.wallThickness);

      // ¿La banda barrida intersecta la banda del jugador?
      const radialContact = newInner <= pHi && prevOuter >= pLo;

      if (!ring.hit && this.ghostTime <= 0 && radialContact) {
        if (this.checkAngularHit(ring, playerHitbox, ring.sides)) {
          collision = true;
          ring.hit = true;
        }
      }

      // ¿El anillo terminó de cruzar TODA la banda del jugador?
      if (!ring.hit && !ring.passedPlayer && prevOuter >= pHi && newOuter < pLo) {
        ring.passedPlayer = true;
        const dist = this.minAngularDistanceToWall(ring, playerHitbox, ring.sides);
        if (dist > 0 && dist < this.nearMissMargin) {
          nearMiss = {
            x: Math.cos(playerHitbox.angle) * playerHitbox.radius,
            y: Math.sin(playerHitbox.angle) * playerHitbox.radius
          };
        }
      }

      if (newOuter < 0.6) {
        this.wallsGroup.remove(ring.group);
        this.activeRings.splice(i, 1);
      }
    }

    return { collision, nearMiss };
  }

  /** Render interpolado de los anillos */
  render(alpha = 1) {
    for (const ring of this.activeRings) {
      const r = ring.prevRadius + (ring.radius - ring.prevRadius) * alpha;
      ring.group.scale.set(r, r, 1);
    }
  }

  /** Spawn inmediato gobernado por beat externo (modo MusicSync) */
  spawnNow(sides) {
    this.spawnRingPattern(sides);
  }

  /** Elimina visualmente los anillos cercanos al jugador (al consumir escudo) */
  crushNearbyWalls(playerRadius) {
    for (const ring of this.activeRings) {
      const outer = ring.radius * (this.centerRadius + this.wallThickness);
      if (outer < playerRadius + 2.2) {
        ring.hit = true; // ya no puede matar
        ring.group.visible = false;
      }
    }
  }

  spawnRingPattern(sides) {
    if (this._mercyFirstRing) {
      // PRIMER ANILLO: gap exactamente en el sector del jugador.
      // Enseña el pass-through gratis; nadie muere sin haber jugado.
      this._mercyFirstRing = false;
      this.currentPattern = 'SINGLE_GAP';
      this.patternLength = 3 + Math.floor(Math.random() * 3);
      this.patternStep = 0;
      if (this._lastHitbox) {
        const TAU = Math.PI * 2;
        const a = ((this._lastHitbox.angle % TAU) + TAU) % TAU;
        this.patternGapIndex = Math.floor(a / (TAU / sides)) % sides;
      }
      this.spiralDirection = Math.random() < 0.5 ? 1 : -1;
      this._stairsDir = this.spiralDirection;
    } else if (this.patternStep >= this.patternLength) {
      // Con pocos lados, solo patrones legibles de 1 gap
      let patterns;
      if (sides <= 3) patterns = Math.random() < 0.65 ? ['SINGLE_GAP'] : ['SINGLE_GAP', 'SPIRAL'];
      else if (sides === 4) patterns = ['SINGLE_GAP', 'SPIRAL', 'DOUBLE_FLANK', 'STAGGER'];
      else patterns = ['SINGLE_GAP', 'SPIRAL', 'DOUBLE_FLANK', 'STAGGER', 'VORTEX', 'STAIRS'];
      let next = patterns[Math.floor(Math.random() * patterns.length)];
      if (next === this.currentPattern) {
        next = patterns[(patterns.indexOf(next) + 1) % patterns.length];
      }
      this.currentPattern = next;
      this.patternStep = 0;
      this.patternLength = 4 + Math.floor(Math.random() * 6);
      this.patternGapIndex = Math.floor(Math.random() * sides);
      this.spiralDirection = Math.random() < 0.5 ? 1 : -1;
      this._stairsDir = this.spiralDirection;
    }

    const blockedSectors = new Array(sides).fill(true);

    switch (this.currentPattern) {
      case 'SINGLE_GAP':
        blockedSectors[this.patternGapIndex] = false;
        break;

      case 'SPIRAL':
        this.patternGapIndex = (this.patternGapIndex + this.spiralDirection + sides) % sides;
        blockedSectors[this.patternGapIndex] = false;
        break;

      case 'DOUBLE_FLANK': {
        blockedSectors[this.patternGapIndex] = false;
        const opp = (this.patternGapIndex + Math.floor(sides / 2)) % sides;
        blockedSectors[opp] = false;
        break;
      }

      case 'STAGGER':
        if (this.patternStep % 2 === 1) {
          this.patternGapIndex = (this.patternGapIndex + 1) % sides;
        }
        blockedSectors[this.patternGapIndex] = false;
        break;

      case 'VORTEX': {
        this.patternGapIndex = (this.patternGapIndex + this.spiralDirection + sides) % sides;
        const second = (this.patternGapIndex + 1) % sides;
        blockedSectors[this.patternGapIndex] = false;
        blockedSectors[second] = false;
        break;
      }

      case 'STAIRS': {
        if (this.patternStep > 0 && this.patternStep % 3 === 0) {
          this._stairsDir *= -1;
        }
        this.patternGapIndex = (this.patternGapIndex + this._stairsDir + sides) % sides;
        blockedSectors[this.patternGapIndex] = false;
        break;
      }
    }

    // GUARDIA: jamás un anillo completamente cerrado (muerte injusta)
    if (blockedSectors.every(b => b)) {
      blockedSectors[Math.floor(Math.random() * sides)] = false;
    }

    this.patternStep++;
    this.createRingMesh(sides, blockedSectors);
  }

  createRingMesh(sides, blockedSectors) {
    const ringGroup = new THREE.Group();
    const sectorAngle = (Math.PI * 2) / sides;
    const geo = this.getSectorGeometry(sides);
    const gaps = [];

    for (let i = 0; i < sides; i++) {
      if (!blockedSectors[i]) {
        gaps.push(i);
        continue;
      }
      const mesh = new THREE.Mesh(geo.fill, this.material);
      mesh.rotation.z = i * sectorAngle;
      ringGroup.add(mesh);

      const outline = new THREE.LineSegments(geo.edges, this.edgesMaterial);
      outline.rotation.z = i * sectorAngle;
      outline.position.z = 0.001;
      ringGroup.add(outline);
    }

    ringGroup.scale.set(this.spawnRadius, this.spawnRadius, 1);
    this.wallsGroup.add(ringGroup);

    const ring = {
      group: ringGroup,
      radius: this.spawnRadius,
      prevRadius: this.spawnRadius,
      blockedSectors,
      gaps,
      sides,
      hit: false,
      passedPlayer: false
    };
    this.activeRings.push(ring);

    if (this.onRingSpawned) this.onRingSpawned(ring);
  }

  /** ¿El arco del jugador intersecta algún sector bloqueado? (con wrap ±2π) */
  checkAngularHit(ring, playerHitbox, sides) {
    const sectorAngle = (Math.PI * 2) / sides;
    const TAU = Math.PI * 2;
    const halfArc = playerHitbox.halfArc !== undefined ? playerHitbox.halfArc : 0.07;
    const pMin = playerHitbox.angle - halfArc;
    const pMax = playerHitbox.angle + halfArc;

    for (let i = 0; i < sides; i++) {
      if (!ring.blockedSectors[i]) continue;
      const sMin = i * sectorAngle;
      const sMax = (i + 1) * sectorAngle;
      for (const offset of [0, TAU, -TAU]) {
        if (pMin + offset < sMax && pMax + offset > sMin) return true;
      }
    }
    return false;
  }

  /** Distancia angular del borde del jugador a la pared más cercana (0 = tocando) */
  minAngularDistanceToWall(ring, playerHitbox, sides) {
    const sectorAngle = (Math.PI * 2) / sides;
    const TAU = Math.PI * 2;
    const halfArc = playerHitbox.halfArc !== undefined ? playerHitbox.halfArc : 0.07;
    const pMin = playerHitbox.angle - halfArc;
    const pMax = playerHitbox.angle + halfArc;
    let best = Infinity;

    for (let i = 0; i < sides; i++) {
      if (!ring.blockedSectors[i]) continue;
      const sMin = i * sectorAngle;
      const sMax = (i + 1) * sectorAngle;
      for (const offset of [0, TAU, -TAU]) {
        const lo = pMin + offset;
        const hi = pMax + offset;
        if (hi < sMin) best = Math.min(best, sMin - hi);
        else if (lo > sMax) best = Math.min(best, lo - sMax);
        else return 0;
      }
    }
    return best;
  }
}
