const KEY = 'vertice_best_NORMAL';
const LEGACY_KEY = 'vertice_best_score'; // record from before modes existed

/** Seconds survived and the one record, saved when a run ends */
export class ScoreSystem {
  constructor() {
    try {
      this.best = parseFloat(localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)) || 0;
    } catch {
      this.best = 0; // storage blocked: records last the session
    }
    this.reset();
  }

  reset() {
    this.time = 0;
    this.prevBest = this.best;
    this.isNewRecord = false;
  }

  update(dt) {
    this.time += dt;
  }

  commit() {
    if (this.time <= this.best) return;
    this.best = this.time;
    this.isNewRecord = true;
    try {
      localStorage.setItem(KEY, String(this.best));
    } catch {} // private mode: the record just lasts the session
  }
}
