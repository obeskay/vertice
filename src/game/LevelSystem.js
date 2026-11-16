/**
 * LevelSystem — one difficulty curve for every run, locked to the soundtrack.
 * Each stage is a whole number of bars at its tempo, so every stage change
 * lands on a downbeat (the "drop"). Speed and spin glide between stops; the
 * side count steps up at each one. Past the last stop the speed keeps
 * creeping up, so every run ends.
 */
export const STAGES = [
  { time: 0,   bpm: 128,   sides: 6,  speed: 4.4, spin: 0.9 },
  { time: 15,  bpm: 128,   sides: 6,  speed: 5.1, spin: 1.2 },
  { time: 30,  bpm: 144,   sides: 7,  speed: 5.9, spin: 1.5 },
  { time: 50,  bpm: 153.6, sides: 8,  speed: 6.8, spin: 1.8 },
  { time: 75,  bpm: 160,   sides: 10, speed: 7.9, spin: 2.1 },
  { time: 105, bpm: 170,   sides: 12, speed: 9.2, spin: 2.4 }
];
const lerp = (a, b, k) => a + (b - a) * k;

const stageAt = (t) => {
  let i = 0;
  while (i < STAGES.length - 1 && t >= STAGES[i + 1].time) i++;
  return i;
};

/** Where the song is at run time t: stage, beats since the start, bar index */
export function songPos(t) {
  const stage = stageAt(t);
  let beats = 0;
  for (let i = 0; i < stage; i++) beats += (STAGES[i + 1].time - STAGES[i].time) * STAGES[i].bpm / 60;
  const s = STAGES[stage];
  const inStage = (t - s.time) * s.bpm / 60;
  beats += inStage;
  const bars = Math.floor(inStage / 4); // bars since this stage began
  const end = STAGES[stage + 1];
  const stageBars = end ? Math.round((end.time - s.time) * s.bpm / 240) : Infinity;
  return { stage, beats, stageBeats: inStage, bar: Math.floor(beats / 4), bars, stageBars, bpm: s.bpm };
}

export class LevelSystem {
  constructor() {
    this.rng = Math.random; // the self-check swaps in a seeded one
    this.reset();
  }

  reset() {
    this.stage = 0;
    this.sides = STAGES[0].sides;
    this.speed = STAGES[0].speed;
    this.rotationSpeed = 0;
    this.direction = 1;
    this.rotationTarget = 1;
    this.nextFlipBar = 2;
    this.boost = 0;
  }

  /** t = seconds survived */
  update(t, dt) {
    const i = stageAt(t);
    const a = STAGES[i];
    const b = STAGES[i + 1];
    let spin;
    if (b) {
      const k = (t - a.time) / (b.time - a.time);
      this.speed = lerp(a.speed, b.speed, k);
      spin = lerp(a.spin, b.spin, k);
    } else {
      this.speed = a.speed + (t - a.time) * 0.03;
      spin = a.spin + (t - a.time) * 0.01;
    }
    this.sides = a.sides;
    if (i !== this.stage) {
      this.stage = i;
      this.boost = 1; // each drop kicks the spin
    }
    this.boost = Math.max(0, this.boost - dt * 1.2);

    // The world snaps into reverse on a downbeat every 1–3 bars
    const { bar } = songPos(t);
    if (bar >= this.nextFlipBar) {
      this.nextFlipBar = bar + 1 + Math.floor(this.rng() * 3);
      this.rotationTarget *= -1;
    }
    const step = 4 * dt;
    this.direction += Math.max(-step, Math.min(step, this.rotationTarget - this.direction));
    this.rotationSpeed = spin * (1 + 0.8 * this.boost) * this.direction;
  }
}

// The soundtrack's 16th-note grid: stage i starts at step STEP0[i] (whole bars each)
const STEP0 = [0];
for (let i = 1; i < STAGES.length; i++) {
  STEP0.push(STEP0[i - 1] + Math.round((STAGES[i].time - STAGES[i - 1].time) * STAGES[i - 1].bpm / 15));
}

/** 16th note n of the run: its stage, its index inside that stage, and its run time */
export function sixteenth(n) {
  let i = STAGES.length - 1;
  while (n < STEP0[i]) i--;
  const s = STAGES[i];
  const k = n - STEP0[i];
  return { stage: i, k, time: s.time + k * 15 / s.bpm, bpm: s.bpm, steps: (STEP0[i + 1] ?? Infinity) - STEP0[i] };
}
