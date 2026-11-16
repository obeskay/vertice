// Self-check for WallManager and LevelSystem: grazes fire, the mercy ring is fair, a seed
// is deterministic, rings are dense enough to read patterns, the difficulty only climbs and
// the stages sit on the soundtrack's bar grid.
// Run: node scripts/check-walls.mjs
import { register } from 'node:module';
import assert from 'node:assert/strict';

// The browser resolves 'three' through the import map; do the same for Node
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === 'three') return next(new URL('../vendor/three.module.js', ${JSON.stringify(import.meta.url)}).href, ctx);
    return next(spec, ctx);
  }`));

const { WallManager } = await import('../src/game/WallManager.js');
const THREE = await import('three');
const DT = 1 / 240;
const TAU = Math.PI * 2;
const mulberry32 = (a) => () => {
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hitbox = (angle) => ({ angle, halfArc: 0.068, bottom: 1.28, top: 1.42, radius: 1.35 });

// Push one ring with a single gap at `gap` past a static player; report what happened
function pass(angle, gap = 1, sides = 6) {
  const w = new WallManager(new THREE.Scene());
  const blocked = Array(sides).fill(true);
  blocked[gap] = false;
  w.createRingMesh(sides, blocked, 0);
  let grazes = 0, hit = false;
  for (let i = 0; i < 240 * 3; i++) {
    const r = w.update(DT, 5, sides, hitbox(angle), true);
    if (r.nearMiss) grazes++;
    if (r.collision) hit = true;
  }
  return { grazes, hit };
}

const sector = TAU / 6;
// Gap 1 spans [60°, 120°]. Hugging its edge is a graze; the centre is not; outside is a hit.
assert.deepEqual(pass(sector + 0.068 + 0.05), { grazes: 1, hit: false }, 'edge pass must graze');
assert.deepEqual(pass(sector * 1.5), { grazes: 0, hit: false }, 'centre pass must not graze');
assert.equal(pass(sector * 0.5).hit, true, 'blocked sector must collide');

// Mercy ring: gap under the player's spawn angle (π/2), and a single ring long
{
  const w = new WallManager(new THREE.Scene());
  w.rng = mulberry32(1);
  w.reset(6, Math.PI / 2);
  assert.equal(w.activeRings[0].blockedSectors[1], false, 'mercy gap must sit under the player');
  assert.ok(w._planned.newPattern, 'mercy is one ring, then a real pattern starts');
}

// Same seed, same walls and spacing
function sequence(seed, n = 200, speed = 4.3) {
  const w = new WallManager(new THREE.Scene());
  w.rng = mulberry32(seed);
  w.reset(6, Math.PI / 2, speed);
  const out = [];
  for (let i = 0; i < n; i++) {
    w.spawnRingPattern(6);
    out.push(w.spawnInterval.toFixed(4) + w.activeRings.at(-1).blockedSectors.map(Number).join(''));
  }
  return out;
}
assert.deepEqual(sequence(20261116), sequence(20261116), 'same seed must give same walls');
{
  // A previous run's leftover speed must not leak into the next run's spacing
  const w = new WallManager(new THREE.Scene());
  w.update(DT, 12, 6, hitbox(0), true);
  w.rng = mulberry32(3);
  w.reset(6, Math.PI / 2, 4.3);
  const first = w.spawnInterval;
  w.rng = mulberry32(3);
  w.reset(6, Math.PI / 2, 4.3);
  assert.equal(first, w.spawnInterval, 'reset must not depend on the previous run');
}
assert.notDeepEqual(sequence(20261116), sequence(20261117), 'different seeds must differ');

const { LevelSystem, STAGES, songPos, sixteenth } = await import('../src/game/LevelSystem.js');
// The soundtrack and the stages share one clock: every stage is whole bars, so drops land on a downbeat
for (let i = 0; i < STAGES.length - 1; i++) {
  const bars = (STAGES[i + 1].time - STAGES[i].time) * STAGES[i].bpm / 240;
  assert.ok(Math.abs(bars - Math.round(bars)) < 1e-9, `stage ${i} is ${bars} bars`);
}
{
  let prev = -1;
  for (let n = 0; n < 2400; n++) {
    const s = sixteenth(n);
    assert.ok(s.time > prev, `16th ${n} must come after the one before`);
    assert.ok(Math.abs(songPos(s.time + 1e-9).beats - n / 4) < 1e-6, `16th ${n} must sit on the song grid`);
    if (s.k === 0 && n > 0) assert.equal(songPos(s.time + 1e-9).bars, 0, `stage ${s.stage} must open on its first bar`);
    prev = s.time;
  }
}
// Rotation flips must not depend on a previous run either
{
  const flips = (dirty) => {
    const l = new LevelSystem();
    if (dirty) {
      l.rng = mulberry32(9);
      for (let i = 0; i < 240 * 20; i++) l.update(i * DT, DT);
      l.reset();
    }
    l.rng = mulberry32(5);
    let out = '';
    for (let i = 0; i < 240 * 30; i++) { l.update(i * DT, DT); out += l.rotationTarget > 0 ? '+' : '-'; }
    return out;
  };
  assert.equal(flips(true), flips(false), 'rotation flips must not depend on the previous run');
}

// One curve: speed and side count never drop, and the run gets hard
{
  const l = new LevelSystem();
  let speed = 0, sides = 0;
  for (let t = 0; t <= 200; t += 0.25) {
    l.update(t, 0.25);
    assert.ok(l.speed >= speed && l.sides >= sides, `difficulty dropped at ${t} s`);
    ({ speed, sides } = l);
  }
  assert.equal(sides, 12, 'ends at 12 sides');
  assert.ok(speed > 9.2, `still speeding up after the last stop (${speed.toFixed(2)})`);
}

// Density: at the opening speed rings now arrive well under the old fixed 1.77 s
for (const speed of [4.3, 9.8]) {
  const w = new WallManager(new THREE.Scene());
  w.rng = mulberry32(7);
  w.reset(6, Math.PI / 2, speed);
  let total = 0, min = Infinity;
  for (let i = 0; i < 300; i++) {
    w.spawnRingPattern(6);
    total += w.spawnInterval;
    min = Math.min(min, w.spawnInterval);
  }
  const lock = 0.53 / speed;
  assert.ok(min >= lock + 0.16, `speed ${speed}: every gap leaves at least 0.16 s beyond the wall (${min.toFixed(3)})`);
  assert.ok(total / 300 < 1.2, `speed ${speed}: mean gap ${(total / 300).toFixed(3)} s`);
  console.log(`speed ${speed}: mean ${(total / 300).toFixed(3)} s, min ${min.toFixed(3)} s between rings`);
}

console.log('check-walls: ok');
