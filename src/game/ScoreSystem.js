/**
 * ScoreSystem
 * Tiempo de supervivencia con precisión de centésimas, near-misses,
 * y persistencia en localStorage SOLO al morir (nunca por frame).
 */
export class ScoreSystem {
  constructor() {
    this.currentTime = 0;
    this.bestTime = this.loadBestScore();
    this.isNewRecord = false;
    this.nearMisses = 0;
  }

  reset() {
    this.currentTime = 0;
    this.isNewRecord = false;
    this.nearMisses = 0;
  }

  update(deltaTime) {
    this.currentTime += deltaTime;
    if (this.currentTime > this.bestTime) {
      this.bestTime = this.currentTime;
      this.isNewRecord = true;
      // NO escribir aquí: localStorage es síncrono. Se persiste en commit().
    }
  }

  addNearMiss() {
    this.nearMisses++;
  }

  /** Persiste el récord (llamar al morir, una sola vez por partida) */
  commit() {
    if (this.isNewRecord) {
      this.saveBestScore(this.bestTime);
    }
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    const pad = (num, len = 2) => String(num).padStart(len, '0');
    return `${pad(mins)}:${pad(secs)}.${pad(ms)}`;
  }

  getFormattedCurrentTime() {
    return this.formatTime(this.currentTime);
  }

  getFormattedBestTime() {
    return this.formatTime(this.bestTime);
  }

  loadBestScore() {
    try {
      const saved = localStorage.getItem('vertice_best_score');
      return saved ? parseFloat(saved) : 0.0;
    } catch (e) {
      return 0.0;
    }
  }

  saveBestScore(score) {
    try {
      localStorage.setItem('vertice_best_score', score.toString());
    } catch (e) {
      // storage no disponible: ignorar
    }
  }
}
