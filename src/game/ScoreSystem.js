/**
 * ScoreSystem
 * Survival time tracking, per-mode best scores, near-miss stats and leaderboards.
 * Persists to localStorage only on run commit (zero runtime GC allocation).
 */
export class ScoreSystem {
  constructor() {
    this.mode = 'NORMAL';
    this.currentTime = 0;
    this.totalScore = 0;
    this.bestTimes = this.loadAllBestScores();
    this.rankScores = this.loadRankScores();
    this.isNewRecord = false;
    this.nearMisses = 0;

    // Combo & Hyperdrive system
    this.comboChain = 0;
    this.maxCombo = 0;
    this.comboMultiplier = 1;
    this.comboTimer = 0;

    // Ghost Ship Recording (20Hz sampling)
    this.currentTrajectory = [];
    this.lastSampleTime = 0;
    this.ghostTrajectory = this.loadGhostTrajectory(this.mode);
  }

  setMode(mode = 'NORMAL') {
    this.mode = mode;
    this.currentTime = 0;
    this.totalScore = 0;
    this.isNewRecord = false;
    this.comboChain = 0;
    this.maxCombo = 0;
    this.comboMultiplier = 1;
    this.comboTimer = 0;
    this.ghostTrajectory = this.loadGhostTrajectory(this.mode);
  }

  get bestTime() {
    return this.bestTimes[this.mode] || 0.0;
  }

  set bestTime(val) {
    this.bestTimes[this.mode] = val;
  }

  reset() {
    this.currentTime = 0;
    this.totalScore = 0;
    this.isNewRecord = false;
    this.nearMisses = 0;
    this.comboChain = 0;
    this.maxCombo = 0;
    this.comboMultiplier = 1;
    this.comboTimer = 0;
    this.currentTrajectory = [];
    this.lastSampleTime = 0;
    this.ghostTrajectory = this.loadGhostTrajectory(this.mode);
  }

  update(deltaTime) {
    this.currentTime += deltaTime;
    this.totalScore += deltaTime * 80 * this.comboMultiplier;

    if (this.comboTimer > 0) {
      this.comboTimer -= deltaTime;
      if (this.comboTimer <= 0) {
        this.comboChain = 0;
        this.comboMultiplier = 1;
      }
    }

    if (this.currentTime > this.bestTime) {
      this.bestTime = this.currentTime;
      this.isNewRecord = true;
    }
  }

  samplePlayerPosition(time, angle) {
    if (this.currentTrajectory.length === 0 || time - this.lastSampleTime >= 0.048) {
      this.lastSampleTime = time;
      this.currentTrajectory.push({
        t: Math.round(time * 100) / 100,
        a: Math.round(angle * 1000) / 1000
      });
    }
  }

  getGhostAngle(time) {
    if (!this.ghostTrajectory || this.ghostTrajectory.length === 0) return null;
    const traj = this.ghostTrajectory;
    if (time > traj[traj.length - 1].t) return null; // Ghost already crashed

    // Fast indexed binary search for time slot
    let low = 0, high = traj.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (traj[mid].t < time) low = mid + 1;
      else high = mid - 1;
    }

    const idx = Math.max(0, Math.min(traj.length - 1, low));
    if (idx === 0) return traj[0].a;
    const p0 = traj[idx - 1];
    const p1 = traj[idx];
    const span = p1.t - p0.t;
    if (span <= 0.0001) return p0.a;
    const alpha = (time - p0.t) / span;

    // Shortest angular interpolation
    const TAU = Math.PI * 2;
    let diff = p1.a - p0.a;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    return p0.a + diff * alpha;
  }

  addNearMiss() {
    this.nearMisses++;
    this.comboChain++;
    if (this.comboChain > this.maxCombo) this.maxCombo = this.comboChain;
    this.comboTimer = 2.4;
    this.comboMultiplier = Math.min(8, Math.floor((this.comboChain - 1) / 2) + 1);

    const pointsEarned = 150 * this.comboMultiplier;
    this.totalScore += pointsEarned;

    return {
      pointsEarned,
      comboChain: this.comboChain,
      comboMultiplier: this.comboMultiplier,
      isHyperdrive: this.comboChain >= 5
    };
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
      this.saveGhostTrajectory(this.mode, this.currentTrajectory);
      this.ghostTrajectory = [...this.currentTrajectory];
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
        score: Math.round(this.totalScore),
        maxCombo: this.maxCombo,
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

  loadGhostTrajectory(mode = this.mode) {
    try {
      const saved = localStorage.getItem(`vertice_ghost_${mode}`);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }

  saveGhostTrajectory(mode, trajectory) {
    try {
      if (!trajectory || trajectory.length === 0) return;
      localStorage.setItem(`vertice_ghost_${mode}`, JSON.stringify(trajectory));
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
