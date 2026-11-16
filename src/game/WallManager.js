import * as THREE from 'three';
import { DATA } from '../palette.js';

/**
 * WallManager — rings of wall that shrink toward the center.
 * Picks patterns (spirals, zig-zags, double gates...), spaces each ring from
 * the move it demands, and tests collision with a swept radial band so a fast
 * wall can never skip over the player. The first ring always has its gap
 * under the ship.
 */
const TAU = Math.PI * 2;
const PLAYER_RAD_S = 11; // Player.speed
const STATIC_PATTERNS = new Set(['SINGLE_GAP', 'TUNNEL', 'PULSAR']);

// Walls fade in from the background's light between these world radii, so a
// ring never pops in at a corner (or on the far side of a leaning plane)
const FOG_FAR = 8.2;
const FOG_NEAR = 6.5;
const wallMaterial = (killer) => new THREE.ShaderMaterial({
  vertexShader: `varying float vR;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vR = length(w.xyz); // rotations keep the radius; only the beat zoom nudges it
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: `varying float vR;
    void main() {
      float f = 1.0 - smoothstep(${FOG_NEAR.toFixed(2)}, ${FOG_FAR.toFixed(2)}, vR);
      gl_FragColor = vec4(mix(${DATA.wedge[2].toFixed(2)}, ${DATA.wall.toFixed(2)}, f), ${killer ? '1.0' : '0.0'}, 0.0, 1.0);
    }`
});

export class WallManager {
  constructor(scene) {
    this.scene = scene;
    this.wallsGroup = new THREE.Group();
    this.scene.add(this.wallsGroup);

    this.activeRings = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1.35;
    this.wallThickness = 0.50;
    this.centerRadius = 1.05;
    this.spawnRadius = 7.6;
    this.rng = Math.random; // the self-check swaps in a seeded one
    this._speed = 5;
    this._planned = null;

    this.currentPattern = 'SINGLE_GAP';
    this.patternStep = 0;
    this.patternLength = 6;
    this.patternGapIndex = 0;
    this.spiralDirection = 1;
    this._stairsDir = 1;

    this.geoCache = new Map(); // sides -> sector geometry

    this.material = wallMaterial(false);
    this.killerMaterial = wallMaterial(true);
  }

  reset(sides = 6, playerAngle = Math.PI / 2, speed = 5) {
    while (this.wallsGroup.children.length > 0) {
      this.wallsGroup.remove(this.wallsGroup.children[0]);
    }
    this.activeRings = [];
    this.spawnTimer = 0;
    this.patternStep = 0;
    this._mercyFirstRing = true;
    this._mercyAngle = playerAngle;
    this._speed = speed; // not the last run's: the first gap must not depend on history
    this._planned = null;
    this.spawnRingPattern(sides);
  }

  /** One flat trapezoid sector per side count, shared by every ring */
  getSectorGeometry(sides) {
    let cached = this.geoCache.get(sides);
    if (cached) return cached;

    const sectorAngle = TAU / sides;
    const innerR = this.centerRadius;
    const outerR = this.centerRadius + this.wallThickness;

    const shape = new THREE.Shape();
    shape.moveTo(Math.cos(0) * outerR, Math.sin(0) * outerR);
    shape.lineTo(Math.cos(sectorAngle) * outerR, Math.sin(sectorAngle) * outerR);
    shape.lineTo(Math.cos(sectorAngle) * innerR, Math.sin(sectorAngle) * innerR);
    shape.lineTo(Math.cos(0) * innerR, Math.sin(0) * innerR);
    shape.closePath();

    cached = new THREE.ShapeGeometry(shape);
    this.geoCache.set(sides, cached);
    return cached;
  }

  /**
   * Fixed Timestep Simulation Update
   */
  update(deltaTime, speed, sides, playerHitbox, suppressSpawn = false) {
    this._speed = speed;

    if (!suppressSpawn) {
      this.spawnTimer += deltaTime;
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer -= this.spawnInterval;
        this.spawnRingPattern(sides);
      }
    }

    let collision = false;
    let nearMiss = null;

    const pLo = playerHitbox.bottom !== undefined ? playerHitbox.bottom : playerHitbox.radius;
    const pHi = playerHitbox.top !== undefined ? playerHitbox.top : playerHitbox.radius;

    for (let i = this.activeRings.length - 1; i >= 0; i--) {
      const ring = this.activeRings[i];
      ring.prevRadius = ring.radius;
      ring.radius -= speed * deltaTime;

      if (ring.rotSpeed) {
        ring.prevRotation = ring.rotation;
        ring.rotation += ring.rotSpeed * deltaTime;
      }

      const newInner = ring.radius * this.centerRadius;
      const prevOuter = ring.prevRadius * (this.centerRadius + this.wallThickness);
      const newOuter = ring.radius * (this.centerRadius + this.wallThickness);

      // Swept radial band test
      const radialContact = newInner <= pHi && prevOuter >= pLo;

      if (!ring.hit && radialContact) {
        if (this.checkAngularHit(ring, playerHitbox, ring.sides)) {
          collision = ring;
          ring.hit = true;
        } else {
          // Track the closest shave over the whole pass (a wall needs several steps to cross the band)
          ring.minDist = Math.min(ring.minDist, this.minAngularDistanceToWall(ring, playerHitbox, ring.sides));
        }
      }

      // Graze: the wall fully cleared the player after passing within the margin
      if (!ring.hit && !ring.passedPlayer && newOuter < pLo) {
        ring.passedPlayer = true;
        const margin = Math.min(0.12, (TAU / ring.sides) * 0.16);
        if (ring.minDist > 0 && ring.minDist < margin) {
          nearMiss = {
            x: Math.cos(playerHitbox.angle) * playerHitbox.radius,
            y: Math.sin(playerHitbox.angle) * playerHitbox.radius
          };
        }
      }

      if (newOuter < 0.50) {
        this.wallsGroup.remove(ring.group);
        this.activeRings.splice(i, 1);
      }
    }

    return { collision, nearMiss };
  }

  render(alpha = 1) {
    for (const ring of this.activeRings) {
      const r = ring.prevRadius + (ring.radius - ring.prevRadius) * alpha;
      ring.group.scale.set(r, r, 1);
      if (ring.rotSpeed) {
        const rot = ring.prevRotation + (ring.rotation - ring.prevRotation) * alpha;
        ring.group.rotation.z = rot;
      }
    }
  }

  /**
   * Emits the ring planned last time, then plans the next one and sizes the gap
   * between them from the move it demands: every sequence is survivable at base
   * steering speed, so spirals run dense and big jumps get room.
   */
  spawnRingPattern(sides) {
    if (this._planned && this._planned.sides !== sides) {
      // Side count changed (rank up): drop the stale plan and leave one breather beat
      this._planned = this._planRing(sides);
      this.spawnInterval = 0.45;
      return;
    }
    const ring = this._planned || this._planRing(sides);
    this.createRingMesh(sides, ring.blocked, ring.rotSpeed);
    this._planned = this._planRing(sides);
    this.spawnInterval = this._delayBetween(ring, this._planned, sides);
  }

  _delayBetween(a, b, sides) {
    // Worst case: the player sits in any gap of `a` and must reach the nearest gap of `b`
    let steps = 0;
    for (let p = 0; p < sides; p++) {
      if (a.blocked[p]) continue;
      let best = sides;
      for (let g = 0; g < sides; g++) {
        if (b.blocked[g]) continue;
        const d = Math.abs(p - g);
        best = Math.min(best, d, sides - d);
      }
      steps = Math.max(steps, best);
    }
    const speed = Math.max(1, this._speed);
    const lock = 0.53 / speed;                              // time the ring occupies the player band
    const travel = (steps + 0.5) * (TAU / sides) / PLAYER_RAD_S;
    const buffer = Math.min(0.42, Math.max(0.16, 0.55 - speed * 0.03));
    return lock + travel + buffer + (b.newPattern ? 0.22 : 0);
  }

  _planRing(sides) {
    const rng = this.rng;
    let newPattern = false;
    let mercyEdge = -1;
    if (this._mercyFirstRing) {
      this._mercyFirstRing = false;
      this.currentPattern = 'SINGLE_GAP';
      this.patternLength = 1;
      this.patternStep = 0;
      const a = ((this._mercyAngle % TAU) + TAU) % TAU;
      const at = a / (TAU / sides);
      this.patternGapIndex = Math.floor(at) % sides;
      // A spawn on a sector edge (4 sides puts π/2 right on one) opens the neighbour too
      const into = at - Math.floor(at);
      const reach = 0.17 / (TAU / sides); // hitbox half-arc plus a margin
      if (into < reach) mercyEdge = (this.patternGapIndex + sides - 1) % sides;
      else if (into > 1 - reach) mercyEdge = (this.patternGapIndex + 1) % sides;
      this.spiralDirection = rng() < 0.5 ? 1 : -1;
      this._stairsDir = this.spiralDirection;
    } else if (this.patternStep >= this.patternLength) {
      newPattern = true;
      const allPatterns = sides <= 3
        ? ['SINGLE_GAP', 'TUNNEL', 'SPIRAL', 'TWISTER']
        : sides === 4 // only the opening stage: gentle moves while the player finds the keys
        ? ['SINGLE_GAP', 'SPIRAL', 'DOUBLE_FLANK', 'STAGGER', 'TUNNEL']
        : [
            'SINGLE_GAP', 'SPIRAL', 'DOUBLE_FLANK', 'TRIPLE_GAP', 'STAGGER',
            'VORTEX', 'STAIRS', 'ZIG_ZAG', 'SLALOM', 'TUNNEL', 'CANNON',
            'CHEVRON', 'GAUNTLET', 'DOUBLE_GATE', 'LABYRINTH', 'CROSSOVER',
            'TWISTER', 'PULSAR', 'DOUBLE_REFLEX', 'CORRIDOR'
          ];

      let next = allPatterns[Math.floor(rng() * allPatterns.length)];
      if (next === this.currentPattern && allPatterns.length > 1) {
        next = allPatterns[(allPatterns.indexOf(next) + 1) % allPatterns.length];
      }
      this.currentPattern = next;
      this.patternStep = 0;
      this.patternLength = STATIC_PATTERNS.has(next)
        ? 2 + Math.floor(rng() * 2)
        : 4 + Math.floor(rng() * 4);
      this.patternGapIndex = Math.floor(rng() * sides);
      this.spiralDirection = rng() < 0.5 ? 1 : -1;
      this._stairsDir = this.spiralDirection;
    }

    const blockedSectors = new Array(sides).fill(true);
    let rotSpeed = 0;

    switch (this.currentPattern) {
      case 'SINGLE_GAP':
      case 'TUNNEL':
        blockedSectors[this.patternGapIndex] = false;
        break;

      case 'SPIRAL':
      case 'CANNON':
        this.patternGapIndex = (this.patternGapIndex + this.spiralDirection + sides) % sides;
        blockedSectors[this.patternGapIndex] = false;
        break;

      case 'TWISTER': {
        this.patternGapIndex = (this.patternGapIndex + this.spiralDirection + sides) % sides;
        blockedSectors[this.patternGapIndex] = false;
        rotSpeed = this.spiralDirection * 0.40;
        break;
      }

      case 'PULSAR': {
        blockedSectors[this.patternGapIndex] = false;
        if (this.patternStep % 2 === 0) {
          blockedSectors[(this.patternGapIndex + 1) % sides] = false;
        }
        break;
      }

      case 'DOUBLE_REFLEX': {
        const opp = (this.patternGapIndex + Math.floor(sides / 2)) % sides;
        const activeGap = (this.patternStep % 2 === 0) ? this.patternGapIndex : opp;
        blockedSectors[activeGap] = false;
        break;
      }

      case 'CORRIDOR': {
        this.patternGapIndex = (this.patternGapIndex + this.spiralDirection + sides) % sides;
        blockedSectors[this.patternGapIndex] = false;
        blockedSectors[(this.patternGapIndex + 1) % sides] = false;
        break;
      }

      case 'DOUBLE_FLANK': {
        blockedSectors[this.patternGapIndex] = false;
        const opp = (this.patternGapIndex + Math.floor(sides / 2)) % sides;
        blockedSectors[opp] = false;
        break;
      }

      case 'DOUBLE_GATE': {
        blockedSectors[this.patternGapIndex] = false;
        const gate2 = (this.patternGapIndex + Math.max(1, Math.floor(sides / 3))) % sides;
        blockedSectors[gate2] = false;
        break;
      }

      case 'TRIPLE_GAP': {
        const step = Math.max(1, Math.floor(sides / 3));
        blockedSectors[this.patternGapIndex] = false;
        blockedSectors[(this.patternGapIndex + step) % sides] = false;
        blockedSectors[(this.patternGapIndex + step * 2) % sides] = false;
        break;
      }

      case 'CHEVRON': {
        const offset = (this.patternStep % 2 === 0) ? 0 : Math.floor(sides / 2);
        const idx = (this.patternGapIndex + offset) % sides;
        blockedSectors[idx] = false;
        blockedSectors[(idx + 1) % sides] = false;
        break;
      }

      case 'STAGGER':
        if (this.patternStep % 2 === 1) {
          this.patternGapIndex = (this.patternGapIndex + 1) % sides;
        }
        blockedSectors[this.patternGapIndex] = false;
        break;

      case 'ZIG_ZAG': {
        const offset = (this.patternStep % 2 === 0) ? 1 : -1;
        this.patternGapIndex = (this.patternGapIndex + offset + sides) % sides;
        blockedSectors[this.patternGapIndex] = false;
        break;
      }

      case 'SLALOM': {
        const stepOffset = (this.patternStep % 2 === 0) ? (2 * this.spiralDirection) : (-1 * this.spiralDirection);
        this.patternGapIndex = (this.patternGapIndex + stepOffset + sides) % sides;
        blockedSectors[this.patternGapIndex] = false;
        break;
      }

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

      case 'GAUNTLET': {
        this.patternGapIndex = (this.patternGapIndex + (this.patternStep % 2 === 0 ? 2 : -2) + sides) % sides;
        blockedSectors[this.patternGapIndex] = false;
        break;
      }

      case 'LABYRINTH': {
        const gapA = this.patternGapIndex;
        const gapB = (this.patternGapIndex + (this.patternStep % 2 === 0 ? 1 : -1) + sides) % sides;
        blockedSectors[gapA] = false;
        blockedSectors[gapB] = false;
        break;
      }

      case 'CROSSOVER': {
        const jump = Math.floor(sides / 2) + (this.patternStep % 2 === 0 ? 1 : -1);
        this.patternGapIndex = (this.patternGapIndex + jump + sides) % sides;
        blockedSectors[this.patternGapIndex] = false;
        break;
      }
    }

    // Safety guard: never generate a fully sealed ring
    if (blockedSectors.every(b => b)) {
      blockedSectors[Math.floor(rng() * sides)] = false;
    }

    this.patternStep++;
    if (mercyEdge >= 0) blockedSectors[mercyEdge] = false;
    return { sides, blocked: blockedSectors, rotSpeed, newPattern };
  }

  createRingMesh(sides, blockedSectors, rotSpeed = 0) {
    const ringGroup = new THREE.Group();
    const sectorAngle = TAU / sides;
    const geo = this.getSectorGeometry(sides);
    const gaps = [];

    for (let i = 0; i < sides; i++) {
      if (!blockedSectors[i]) {
        gaps.push(i);
        continue;
      }
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.rotation.z = i * sectorAngle;
      ringGroup.add(mesh);
    }

    ringGroup.scale.set(this.spawnRadius, this.spawnRadius, 1);
    this.wallsGroup.add(ringGroup);

    const ring = {
      group: ringGroup,
      radius: this.spawnRadius,
      prevRadius: this.spawnRadius,
      rotation: 0,
      prevRotation: 0,
      rotSpeed,
      blockedSectors,
      gaps,
      sides,
      hit: false,
      passedPlayer: false,
      minDist: Infinity
    };
    this.activeRings.push(ring);
  }

  /** Repaints the ring that ended the run so the player sees what hit them */
  markKiller(ring) {
    if (!ring) return;
    for (const child of ring.group.children) child.material = this.killerMaterial;
  }

  checkAngularHit(ring, playerHitbox, sides) {
    const sectorAngle = TAU / sides;
    const halfArc = playerHitbox.halfArc !== undefined ? playerHitbox.halfArc : 0.068;
    const pMin = playerHitbox.angle - halfArc;
    const pMax = playerHitbox.angle + halfArc;
    const rot = ring.rotation || 0;

    for (let i = 0; i < sides; i++) {
      if (!ring.blockedSectors[i]) continue;
      const sMin = i * sectorAngle + rot;
      const sMax = (i + 1) * sectorAngle + rot;
      for (const offset of [0, TAU, -TAU]) {
        if (pMin + offset < sMax && pMax + offset > sMin) return true;
      }
    }
    return false;
  }

  minAngularDistanceToWall(ring, playerHitbox, sides) {
    const sectorAngle = TAU / sides;
    const halfArc = playerHitbox.halfArc !== undefined ? playerHitbox.halfArc : 0.068;
    const pMin = playerHitbox.angle - halfArc;
    const pMax = playerHitbox.angle + halfArc;
    const rot = ring.rotation || 0;
    let best = Infinity;

    for (let i = 0; i < sides; i++) {
      if (!ring.blockedSectors[i]) continue;
      const sMin = i * sectorAngle + rot;
      const sMax = (i + 1) * sectorAngle + rot;
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
