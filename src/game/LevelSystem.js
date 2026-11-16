/**
 * LevelSystem — one difficulty curve for every run. Speed and spin glide
 * between the stops below; the side count steps up at each stop. Past the
 * last stop the speed keeps creeping up, so every run ends.
 */
const RAMP = [
  { time: 0,   sides: 6,  speed: 4.3, spin: 0.40 },
  { time: 15,  sides: 6,  speed: 5.1, spin: 0.55 },
  { time: 30,  sides: 7,  speed: 5.9, spin: 0.72 },
  { time: 50,  sides: 8,  speed: 6.8, spin: 0.90 },
  { time: 75,  sides: 10, speed: 7.9, spin: 1.10 },
  { time: 105, sides: 12, speed: 9.2, spin: 1.30 }
];
const lerp = (a, b, k) => a + (b - a) * k;

export class LevelSystem {
  constructor() {
    this.rng = Math.random; // the self-check swaps in a seeded one
    this.reset();
  }

  reset() {
    this.sides = RAMP[0].sides;
    this.speed = RAMP[0].speed;
    this.rotationSpeed = 0;
    this.direction = 1;
    this.rotationTarget = 1;
    this.flipTimer = 0;
    this.flipInterval = 4;
  }

  /** t = seconds survived */
  update(t, dt) {
    let i = 0;
    while (i < RAMP.length - 1 && t >= RAMP[i + 1].time) i++;
    const a = RAMP[i];
    const b = RAMP[i + 1];
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

    // The world reverses its spin every few seconds, easing through zero
    this.flipTimer += dt;
    if (this.flipTimer >= this.flipInterval) {
      this.flipTimer = 0;
      this.flipInterval = 2.4 + this.rng() * 3.5;
      this.rotationTarget *= -1;
    }
    const step = 1.6 * dt;
    this.direction += Math.max(-step, Math.min(step, this.rotationTarget - this.direction));
    this.rotationSpeed = spin * (0.9 + 0.1 * Math.sin(t * 0.8)) * this.direction;
  }
}
