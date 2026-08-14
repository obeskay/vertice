/**
 * ScoreSystem
 * Survival time tracking, per-mode best scores, near-miss stats and leaderboards.
 * Persists to localStorage only on run commit (zero runtime GC allocation).
 */
export class ScoreSystem {
  constructor() {
    this.mode = 'NORMAL';
    this.currentTime = 0;
    this.bestTimes = this.loadAllBestScores();
    this.rankScores = this.loadRankScores();
    this.isNewRecord = false;
    this.nearMisses = 0;
  }

  setMode(mode = 'NORMAL') {
    this.mode = mode;
    this.currentTime = 0;
    this.isNewRecord = false;
  }

  get bestTime() {
    return this.bestTimes[this.mode] || 0.0;
  }

  set bestTime(val) {
    this.bestTimes[this.mode] = val;
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
    if (this.mode === 'EXTREMO') {
      if (seconds >= 40) return { grade: 'S+', title: 'DIVINIDAD' };
      if (seconds >= 25) return { grade: 'S', title: 'IMPARABLE' };
      if (seconds >= 15) return { grade: 'A', title: 'REFLEJOS LUZ' };
      if (seconds >= 8)  return { grade: 'B', title: 'SOBREVIVIENTE' };
      return { grade: 'C', title: 'INICIADO' };
    }
    if (this.mode === 'HIPER') {
      if (seconds >= 60) return { grade: 'S+', title: 'HIPER DIOS' };
      if (seconds >= 40) return { grade: 'S', title: 'MAESTRO HIPER' };
      if (seconds >= 25) return { grade: 'A', title: 'AS DE ACERO' };
      if (seconds >= 15) return { grade: 'B', title: 'PILOTO VÉRTICE' };
      return { grade: 'C', title: 'APRENDIZ' };
    }
    // Normal Mode
    if (seconds >= 80) return { grade: 'S+', title: 'DIOS VÉRTICE' };
    if (seconds >= 55) return { grade: 'S', title: 'LEYENDA' };
    if (seconds >= 35) return { grade: 'A', title: 'AS DE ACERO' };
    if (seconds >= 20) return { grade: 'B', title: 'MAESTRO' };
    if (seconds >= 10) return { grade: 'C', title: 'PILOTO' };
    return { grade: 'D', title: 'NOVATO' };
  }

  commit(rankName = '') {
    if (this.isNewRecord) {
      this.saveBestScore(this.mode, this.bestTime);
    }
    if (rankName) {
      const key = `${this.mode}_${rankName}`;
      const currentRankBest = this.rankScores[key] || 0;
      if (this.currentTime > currentRankBest) {
        this.rankScores[key] = this.currentTime;
        this.saveRankScores(this.rankScores);
      }
    }
    this.recordRun(rankName);
  }

  recordRun(rankName = '') {
    try {
      const leaderboardKey = `vertice_leaderboard_${this.mode}`;
      const leaderboard = this.loadLeaderboard(leaderboardKey);
      const runInfo = {
        time: this.currentTime,
        formattedTime: this.getFormattedCurrentTime(),
        grade: this.getGrade().grade,
        rankName,
        nearMisses: this.nearMisses,
        mode: this.mode,
        date: new Date().toLocaleDateString()
      };
      leaderboard.push(runInfo);
      leaderboard.sort((a, b) => b.time - a.time);
      const top5 = leaderboard.slice(0, 5);
      localStorage.setItem(leaderboardKey, JSON.stringify(top5));
    } catch (e) {}
  }

  loadLeaderboard(key = `vertice_leaderboard_${this.mode}`) {
    try {
      const saved = localStorage.getItem(key);
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

  getFormattedBestTime(mode = this.mode) {
    return this.formatTime(this.bestTimes[mode] || 0.0);
  }

  loadAllBestScores() {
    const modes = ['NORMAL', 'HIPER', 'EXTREMO', 'ZEN'];
    const scores = {};
    modes.forEach(m => {
      scores[m] = this.loadBestScore(m);
    });
    return scores;
  }

  loadBestScore(mode = 'NORMAL') {
    try {
      const saved = localStorage.getItem(`vertice_best_${mode}`);
      if (saved) return parseFloat(saved);
      // Legacy fallback
      if (mode === 'NORMAL') {
        const legacy = localStorage.getItem('vertice_best_score');
        return legacy ? parseFloat(legacy) : 0.0;
      }
      return 0.0;
    } catch (e) {
      return 0.0;
    }
  }

  saveBestScore(mode, score) {
    try {
      localStorage.setItem(`vertice_best_${mode}`, score.toString());
      if (mode === 'NORMAL') {
        localStorage.setItem('vertice_best_score', score.toString());
      }
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
