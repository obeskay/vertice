/**
 * LevelSystem
 * Progressive Difficulty, Game Modes & Dynamic Rotation Breathing for VÉRTICE.
 * Modes:
 * - NORMAL: Standard arcade progression (Punto -> Vértice)
 * - HIPER: High-velocity challenge for seasoned pilots
 * - EXTREMO: Maximum speed and erratic world rotations
 * - ZEN: Flow practice mode without game over
 */
export class LevelSystem {
  constructor() {
    this.mode = 'NORMAL'; // 'NORMAL' | 'HIPER' | 'EXTREMO' | 'ZEN'
    this.sides = 6;
    this.speed = 4.5;
    this.rotationSpeed = 0.5;
    this.rotationDirection = 1;
    this.rotationTarget = 1;
    this.rotationSlew = 1.4;
    this.maxRotationSpeed = 0.5;
    this.flipTimer = 0;
    this.flipInterval = 4.0;

    this.modesConfig = {
      NORMAL: {
        baseSpeedMult: 1.0,
        rotSpeedMult: 1.0,
        ranks: [
          { time: 0,   name: 'PUNTO',     sides: 6, speed: 4.2, rotSpeed: 0.38 },
          { time: 10,  name: 'LÍNEA',     sides: 6, speed: 4.8, rotSpeed: 0.52 },
          { time: 22,  name: 'TRIÁNGULO', sides: 6, speed: 5.6, rotSpeed: 0.68 },
          { time: 38,  name: 'CUADRADO',  sides: 7, speed: 6.4, rotSpeed: 0.82 },
          { time: 55,  name: 'PENTÁGONO', sides: 8, speed: 7.2, rotSpeed: 0.98 },
          { time: 75,  name: 'HEXÁGONO',  sides: 10, speed: 8.2, rotSpeed: 1.15 },
          { time: 100, name: 'VÉRTICE',   sides: 12, speed: 9.4, rotSpeed: 1.35 }
        ]
      },
      HIPER: {
        baseSpeedMult: 1.35,
        rotSpeedMult: 1.3,
        ranks: [
          { time: 0,   name: 'HIPER PUNTO',     sides: 6, speed: 6.2, rotSpeed: 0.75 },
          { time: 10,  name: 'HIPER LÍNEA',     sides: 6, speed: 7.0, rotSpeed: 0.90 },
          { time: 22,  name: 'HIPER TRIÁNGULO', sides: 7, speed: 7.8, rotSpeed: 1.05 },
          { time: 38,  name: 'HIPER CUADRADO',  sides: 8, speed: 8.8, rotSpeed: 1.20 },
          { time: 55,  name: 'HIPER PENTÁGONO', sides: 10, speed: 9.8, rotSpeed: 1.40 },
          { time: 75,  name: 'HIPER HEXÁGONO',  sides: 12, speed: 11.0, rotSpeed: 1.60 }
        ]
      },
      EXTREMO: {
        baseSpeedMult: 1.7,
        rotSpeedMult: 1.6,
        ranks: [
          { time: 0,   name: 'OVERDRIVE', sides: 6, speed: 8.5, rotSpeed: 1.10 },
          { time: 10,  name: 'SINGULARIDAD', sides: 8, speed: 9.8, rotSpeed: 1.35 },
          { time: 25,  name: 'CAOS PURO', sides: 10, speed: 11.2, rotSpeed: 1.60 },
          { time: 45,  name: 'VÉRTICE ABSOLUTO', sides: 12, speed: 12.8, rotSpeed: 1.85 }
        ]
      },
      ZEN: {
        baseSpeedMult: 0.85,
        rotSpeedMult: 0.7,
        ranks: [
          { time: 0,   name: 'FLUJO ZEN', sides: 6, speed: 3.8, rotSpeed: 0.30 },
          { time: 30,  name: 'RESPIRACIÓN', sides: 6, speed: 4.2, rotSpeed: 0.40 },
          { time: 60,  name: 'MEDITACIÓN', sides: 8, speed: 4.8, rotSpeed: 0.50 }
        ]
      }
    };

    this.currentRankIndex = 0;
  }

  setMode(mode) {
    this.mode = this.modesConfig[mode] ? mode : 'NORMAL';
    this.reset();
  }

  get ranks() {
    return this.modesConfig[this.mode].ranks;
  }

  reset() {
    this.currentRankIndex = 0;
    const rank = this.ranks[0];
    this.sides = rank.sides;
    this.speed = rank.speed;
    this.maxRotationSpeed = rank.rotSpeed;
    this.rotationSpeed = 0;
    this.rotationDirection = 1;
    this.rotationTarget = 1;
    this.flipTimer = 0;
  }

  update(survivalTime, deltaTime) {
    const ranks = this.ranks;
    let newRankIndex = this.currentRankIndex;
    for (let i = ranks.length - 1; i >= 0; i--) {
      if (survivalTime >= ranks[i].time) {
        newRankIndex = i;
        break;
      }
    }

    let rankChanged = false;
    if (newRankIndex !== this.currentRankIndex) {
      this.currentRankIndex = newRankIndex;
      rankChanged = true;
    }

    const currentRank = ranks[this.currentRankIndex];
    this.sides = currentRank.sides;

    const extraTime = Math.max(0, survivalTime - currentRank.time);
    const baseSpeed = currentRank.speed + extraTime * 0.045;

    // Organic speed breathing wave (±8% variation keeps players dynamically alert)
    const wave = 1 + 0.08 * Math.sin(survivalTime * 0.45) + 0.03 * Math.sin(survivalTime * 1.8);
    this.speed = baseSpeed * wave;

    this.maxRotationSpeed = currentRank.rotSpeed + extraTime * 0.02;

    // Telegraph rotation direction flips
    this.flipTimer += deltaTime;
    if (this.flipTimer >= this.flipInterval) {
      this.flipTimer = 0;
      this.flipInterval = this.mode === 'EXTREMO' ? (1.8 + Math.random() * 2.5) : (2.5 + Math.random() * 3.8);
      this.rotationTarget *= -1;
    }

    const dirStep = this.rotationSlew * deltaTime;
    if (this.rotationDirection < this.rotationTarget) {
      this.rotationDirection = Math.min(this.rotationTarget, this.rotationDirection + dirStep);
    } else if (this.rotationDirection > this.rotationTarget) {
      this.rotationDirection = Math.max(this.rotationTarget, this.rotationDirection - dirStep);
    }

    const breathe = 0.88 + 0.12 * Math.sin(survivalTime * 0.75);
    this.rotationSpeed = this.maxRotationSpeed * breathe * this.rotationDirection;

    return {
      rankChanged,
      rankName: currentRank.name,
      sides: this.sides,
      speed: this.speed,
      mode: this.mode
    };
  }

  getCurrentWorldRotationDelta(deltaTime) {
    return this.rotationSpeed * deltaTime;
  }
}
