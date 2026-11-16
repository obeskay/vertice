import { Renderer } from './engine/Renderer.js';
import { AudioEngine } from './engine/AudioEngine.js';
import { ParticleSystem } from './engine/ParticleSystem.js';
import { Player } from './game/Player.js';
import { WallManager } from './game/WallManager.js';
import { LevelSystem, songPos } from './game/LevelSystem.js';
import { ScoreSystem } from './game/ScoreSystem.js';
import { HUDManager } from './ui/HUDManager.js';
import { SCENES } from './palette.js';

/**
 * VÉRTICE — steer around the center, slip through the gaps, last as long as
 * you can. Fixed 240 Hz simulation with interpolated rendering.
 */
const SIM_DT = 1 / 240;
const MAX_STEPS = 40;
const RESTART_AFTER = 0.3;  // s into the crash before a fresh press restarts
const CRASH_LENGTH = 0.95;  // s of slow motion before the result shows
const CHAIN_WINDOW = 1.5;   // s between grazes that still climbs the graze note
const STEER_KEYS = { ArrowLeft: 1, KeyA: 1, ArrowRight: -1, KeyD: -1 };
const START_KEYS = new Set(['Space', 'Enter', 'KeyR', ...Object.keys(STEER_KEYS)]);
const TILT = [0, 0.35, 0.6, 0.8, 1, 1]; // pseudo-3D lean per stage

class Game {
  constructor() {
    this.state = 'menu'; // menu | playing | dying | paused | over

    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new Renderer('canvas-container', this.reducedMotion);
    this.audio = new AudioEngine();
    this.particles = new ParticleSystem(this.renderer.world);
    this.player = new Player(this.renderer.world);
    this.walls = new WallManager(this.renderer.world);
    this.level = new LevelSystem();
    this.score = new ScoreSystem();
    this.hud = new HUDManager({
      onPlay: () => this.primary(),
      onSound: () => this.hud.setSound(!this.audio.toggleMute())
    });
    this.hud.setSound(!this.audio.muted);
    this.hud.setState('menu', this.score);
    this.renderer.setSides(this.level.sides);
    this.setScene(0, false);

    this.held = new Map(); // key code or pointer id -> steer direction, newest last
    this.accumulator = 0;
    this.hitStop = 0;
    this.crashTime = 0;
    this.rotation = this.prevRotation = 0;
    this.chain = 0;
    this.lastGraze = -Infinity;

    this.setupInput();
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  setupInput() {
    window.addEventListener('keydown', (e) => {
      // A focused button handles its own Space/Enter (the sound toggle must not start a run)
      if ((e.code === 'Space' || e.code === 'Enter') && e.target.closest?.('button')) return;
      if (START_KEYS.has(e.code) && this.state !== 'menu' && this.state !== 'over') e.preventDefault();
      if (e.repeat) return; // a key held through a crash must not restart
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
        return;
      }
      if (START_KEYS.has(e.code)) this.primary();
      if (e.code in STEER_KEYS) this.press(e.code, STEER_KEYS[e.code]);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));

    // Touch or click: hold the left half to go left, the right half to go right
    window.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || e.target.closest('button')) return; // right click would leave a stuck steer
      this.primary();
      this.press(e.pointerId, e.clientX < window.innerWidth / 2 ? 1 : -1);
    });
    // Mobile browsers only unlock audio on the release of a touch (iOS: touchend)
    const unlock = () => { if (this.state === 'playing') this.audio.init(); };
    const release = (e) => {
      this.held.delete(e.pointerId);
      unlock();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('touchend', unlock);

    window.addEventListener('blur', () => {
      this.held.clear();
      if (this.state === 'playing') this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
  }

  press(id, dir) {
    this.held.delete(id);
    this.held.set(id, dir);
  }

  /** The newest held input wins, so rolling from one side to the other just works */
  get steer() {
    let dir = 0;
    for (const d of this.held.values()) dir = d;
    return this.state === 'playing' ? dir : 0;
  }

  /** The one action: start, restart or resume */
  primary() {
    if (this.state === 'paused') this.resume();
    else if (this.state === 'menu' || this.state === 'over' ||
      (this.state === 'dying' && this.crashTime >= RESTART_AFTER)) this.start();
  }

  start() {
    this.state = 'playing';
    document.activeElement?.blur();
    this.score.reset();
    this.level.reset();
    this.player.reset();
    this.walls.reset(this.level.sides, this.player.angle, this.level.speed);
    this.renderer.setSides(this.level.sides);
    this.setScene(0);
    this.particles.clear();
    this.accumulator = 0;
    this.hitStop = 0;
    this.rotation = this.prevRotation = 0;
    this.chain = 0;
    this.lastGraze = -Infinity;
    this.beaten = false;
    this.hud.setBeaten(false);
    this.hud.setTime(0);
    this.hud.setProgress(0);
    this.hud.setState('playing', this.score);
    this.audio.start();
  }

  /** A new glyph set and duotone sweeps out from the center (a drop) */
  setScene(i, sweep = true) {
    this.sceneIndex = i;
    this.renderer.setScene(i, sweep);
    const s = SCENES[i % SCENES.length];
    this.hud.setColors(s.pri, s.acc);
  }

  pause() {
    this.state = 'paused';
    this.audio.suspend();
    this.hud.setState('paused', this.score);
  }

  resume() {
    this.state = 'playing';
    document.activeElement?.blur();
    this.audio.resume();
    this.hud.setState('playing', this.score);
  }

  crash(ring) {
    this.state = 'dying';
    this.crashTime = 0;
    this.score.commit();
    this.audio.playDeath();
    navigator.vibrate?.(50);
    this.walls.markKiller(ring);
    this.particles.burst(this.player.position);
    this.particles.ripple(this.player.position, 2.5);
    this.renderer.shake(this.reducedMotion ? 0.08 : 0.3);
  }

  step(dt) {
    this.score.update(dt);
    this.level.update(this.score.time, dt);
    const { sides, speed } = this.level;

    if (sides !== this.renderer.sides) this.renderer.setSides(sides);
    if (!this.beaten && this.score.prevBest > 0 && this.score.time > this.score.prevBest) {
      this.beaten = true;
      this.hud.setBeaten(true);
      this.audio.playChime();
    }

    this.player.update(dt, this.steer);
    const result = this.walls.update(dt, speed, sides, this.player.getHitbox());

    if (result.nearMiss) {
      this.chain = this.score.time - this.lastGraze < CHAIN_WINDOW ? this.chain + 1 : 1;
      this.lastGraze = this.score.time;
      this.audio.playGraze(this.chain);
      this.particles.ripple(this.player.position);
      this.hitStop = 0.018;
      navigator.vibrate?.(8);
    }

    this.prevRotation = this.rotation;
    this.rotation += this.level.rotationSpeed * dt;

    if (result.collision) this.crash(result.collision);
  }

  /** Visual beat from the song position: pulse on each beat, scene per stage, HUD progress */
  beat() {
    const t = this.score.time;
    if (this.state === 'menu') return { pulse: 0, tilt: 0, time: 0 };
    const pos = songPos(t);
    const last = pos.stage === SCENES.length - 1;
    const scene = last ? pos.stage + Math.floor(pos.bars / 16) : pos.stage;
    if (this.state === 'playing') {
      if (scene !== this.sceneIndex) this.setScene(scene);
      this.hud.setProgress(last ? (pos.stageBeats % 64) / 64 : pos.stageBeats / (pos.stageBars * 4));
    }
    // The last bar of a stage builds: the kick drops out for its second half, so does the pulse
    const build = pos.bars === pos.stageBars - 1 || (last && pos.bars % 16 === 15);
    const quiet = this.state !== 'playing' || (build && pos.stageBeats % 4 >= 2);
    return { pulse: quiet ? 0 : Math.exp(-(pos.beats % 1) * 7), tilt: TILT[pos.stage], time: t };
  }

  loop(now) {
    const dt = Math.max(0, Math.min(0.1, (now - this.lastTime) / 1000));
    this.lastTime = now;

    if (this.state === 'playing') {
      // Hit-stop freezes only the simulation; sound and drawing keep going
      if (this.hitStop > 0) this.hitStop -= dt;
      else this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= SIM_DT && steps < MAX_STEPS && this.state === 'playing') {
        this.step(SIM_DT);
        this.accumulator -= SIM_DT;
        steps++;
      }
      if (steps === MAX_STEPS) this.accumulator = 0;
      this.hud.setTime(this.score.time);
    } else if (this.state === 'dying') {
      this.crashTime += dt;
      const slow = this.crashTime < 0.15 ? 0 : 0.12; // freeze, then crawl
      this.prevRotation = this.rotation;
      this.rotation += this.level.rotationSpeed * dt * slow;
      if (this.crashTime >= CRASH_LENGTH) {
        this.state = 'over';
        this.hud.setState('over', this.score);
      }
    }

    this.audio.update(this.score.time);
    this.particles.update(dt);
    const alpha = this.state === 'playing' ? Math.min(1, this.accumulator / SIM_DT) : 1;
    this.player.render(alpha, dt);
    this.walls.render(alpha);
    this.renderer.render(dt, this.prevRotation + (this.rotation - this.prevRotation) * alpha, this.beat());

    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__game = new Game();
});
