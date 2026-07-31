/**
 * LevelSystem — núcleo (Hermes)
 * Dificultad progresiva + VARIACIÓN SUTIL DE VELOCIDAD:
 * la velocidad de los muros respira en una onda lenta (±10%) para que
 * ningún tramo se sienta mecánico; el giro del mundo se telegrafía
 * suavizando las reversas pasando por cero.
 */
export class LevelSystem {
  constructor() {
    this.sides = 6; // Hexágono base para rotación orbital completa de 360°
    this.speed = 4.5;
    this.rotationSpeed = 0.5;
    this.rotationDirection = 1;
    this.rotationTarget = 1;
    this.rotationSlew = 1.4;
    this.maxRotationSpeed = 0.5;
    this.flipTimer = 0;
    this.flipInterval = 4.0;

    // Lados del nivel (mínimo 6 para permitir rotación circular completa de 360°)
    this.ranks = [
      { time: 0,   name: 'PUNTO',     sides: 6, speed: 4.2, rotSpeed: 0.35 },
      { time: 12,  name: 'LÍNEA',     sides: 6, speed: 4.8, rotSpeed: 0.50 },
      { time: 25,  name: 'TRIÁNGULO', sides: 6, speed: 5.5, rotSpeed: 0.65 },
      { time: 40,  name: 'CUADRADO',  sides: 7, speed: 6.2, rotSpeed: 0.80 },
      { time: 55,  name: 'PENTÁGONO', sides: 8, speed: 7.0, rotSpeed: 0.95 },
      { time: 75,  name: 'HEXÁGONO',  sides: 10, speed: 8.0, rotSpeed: 1.10 },
      { time: 100, name: 'VÉRTICE',   sides: 12, speed: 9.2, rotSpeed: 1.30 }
    ];

    this.currentRankIndex = 0;
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
    let newRankIndex = this.currentRankIndex;
    for (let i = this.ranks.length - 1; i >= 0; i--) {
      if (survivalTime >= this.ranks[i].time) {
        newRankIndex = i;
        break;
      }
    }

    let rankChanged = false;
    if (newRankIndex !== this.currentRankIndex) {
      this.currentRankIndex = newRankIndex;
      rankChanged = true;
    }

    const currentRank = this.ranks[this.currentRankIndex];
    this.sides = currentRank.sides;

    const extraTime = Math.max(0, survivalTime - currentRank.time);
    const baseSpeed = currentRank.speed + extraTime * 0.04;

    // Onda sutil de velocidad: los muros "respiran" ±10% (hipnótico, no mecánico)
    const wave = 1 + 0.10 * Math.sin(survivalTime * 0.45) + 0.04 * Math.sin(survivalTime * 1.7);
    this.speed = baseSpeed * wave;

    this.maxRotationSpeed = currentRank.rotSpeed + extraTime * 0.02;

    // Reversas de giro suavizadas (telegrafiadas)
    this.flipTimer += deltaTime;
    if (this.flipTimer >= this.flipInterval) {
      this.flipTimer = 0;
      this.flipInterval = 2.5 + Math.random() * 4.0;
      this.rotationTarget *= -1;
    }

    const dirStep = this.rotationSlew * deltaTime;
    if (this.rotationDirection < this.rotationTarget) {
      this.rotationDirection = Math.min(this.rotationTarget, this.rotationDirection + dirStep);
    } else if (this.rotationDirection > this.rotationTarget) {
      this.rotationDirection = Math.max(this.rotationTarget, this.rotationDirection - dirStep);
    }

    const breathe = 0.85 + 0.15 * Math.sin(survivalTime * 0.7);
    this.rotationSpeed = this.maxRotationSpeed * breathe * this.rotationDirection;

    return {
      rankChanged,
      rankName: currentRank.name,
      sides: this.sides,
      speed: this.speed
    };
  }

  getCurrentWorldRotationDelta(deltaTime) {
    return this.rotationSpeed * deltaTime;
  }
}
