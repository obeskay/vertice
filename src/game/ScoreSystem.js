/**
 * ScoreSystem
 * Tiempo de supervivencia con precisión de centésimas, near-misses,
 * y persistencia en localStorage SOLO al morir (nunca por frame).
 */
export class ScoreSystem {
  constructor() {
    this.currentTime = 0;
    this.bestTime = this.loadBestScore();
    this.rankScores = this.loadRankScores();
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
    }
  }

  addNearMiss() {
    this.nearMisses++;
  }

  getGrade(seconds = this.currentTime) {
    if (seconds >= 80) return { grade: 'S+', title: 'DIOS VÉRTICE' };
    if (seconds >= 55) return { grade: 'S', title: 'LEYENDA' };
    if (seconds >= 35) return { grade: 'A', title: 'AS DE ACERO' };
    if (seconds >= 20) return { grade: 'B', title: 'MAESTRO' };
    if (seconds >= 10) return { grade: 'C', title: 'PILOTO' };
    return { grade: 'D', title: 'NOVATO' };
  }

  /** Persiste el récord, estadísticas por rank y leaderboard (llamar al morir) */
  commit(rankName = '') {
    if (this.isNewRecord) {
      this.saveBestScore(this.bestTime);
    }
    if (rankName) {
      const currentRankBest = this.rankScores[rankName] || 0;
      if (this.currentTime > currentRankBest) {
        this.rankScores[rankName] = this.currentTime;
        this.saveRankScores(this.rankScores);
      }
    }
    this.recordRun(rankName);
  }

  recordRun(rankName = '') {
    try {
      const leaderboard = this.loadLeaderboard();
      const runInfo = {
        time: this.currentTime,
        formattedTime: this.getFormattedCurrentTime(),
        grade: this.getGrade().grade,
        rankName,
        nearMisses: this.nearMisses,
        date: new Date().toLocaleDateString()
      };
      leaderboard.push(runInfo);
      leaderboard.sort((a, b) => b.time - a.time);
      const top5 = leaderboard.slice(0, 5);
      localStorage.setItem('vertice_leaderboard', JSON.stringify(top5));
    } catch (e) {}
  }

  loadLeaderboard() {
    try {
      const saved = localStorage.getItem('vertice_leaderboard');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
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
    } catch (e) {}
  }

  loadRankScores() {
    try {
      const saved = localStorage.getItem('vertice_rank_scores');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  }

  saveRankScores(scores) {
    try {
      localStorage.setItem('vertice_rank_scores', JSON.stringify(scores));
    } catch (e) {}
  }
}
