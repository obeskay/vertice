import { Renderer } from './engine/Renderer.js';
import { AudioEngine } from './engine/AudioEngine.js';
import { ParticleSystem } from './engine/ParticleSystem.js';
import { Player } from './game/Player.js';
import { WallManager } from './game/WallManager.js';
import { LevelSystem, songPos } from './game/LevelSystem.js';
import { ScoreSystem } from './game/ScoreSystem.js';
import { HUDManager } from './ui/HUDManager.js';
import { SCENES } from './palette.js';
import { loadHint } from './ui/hint.js';

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
const TILT = [0, 0.42, 0.66, 0.83, 0.92, 1]; // perspective lean per stage, 1 = full
const CRAWL = 0.12;   // world speed through the crash, after the freeze
const TURN_W = 13;    // rad/s: the critically damped follow of the host's scroll (within 1 % in 0.51 s, never overshoots)
const SPIN_IN = 0.8;  // s: a run's spin glides up from wherever the world was turning

// ?embed=1: the game inside another page. That page frames it and owns the sound
// toggle; the two talk only to each other (see README, Embed).
const EMBED = new URLSearchParams(location.search).has('embed') && window.parent !== window;
// Only a web origin: a sandboxed or file: parent reads "null", which postMessage rejects
const parentOrigin = location.ancestorOrigins?.[0] ?? (document.referrer && new URL(document.referrer).origin);
const HOST = EMBED && /^https?:\/\//.test(parentOrigin) ? parentOrigin : null;
const post = (msg) => window.parent.postMessage({ source: 'vertice', ...msg }, HOST);
let held = []; // held until the first frame is on screen, so the host fades in a drawn game
const tell = (msg) => HOST && (held ? held.push(msg) : post(msg));
document.body.classList.toggle('embed', Boolean(HOST)); // no host to talk to: keep the own sound button

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
    this.show('menu');
    this.renderer.setSides(this.level.sides);
    this.setScene(0, false);

    this.held = new Map(); // key code or pointer id -> steer direction, newest last
    this.accumulator = 0;
    this.hitStop = 0;
    this.crashTime = 0;
    this.rotation = this.prevRotation = 0;
    this.spin = this.spin0 = 0; // rad/s the world turns at, and where this run's spin started
    this.turn = 0;              // where the host's scroll wants the waiting world
    this.chain = 0;
    this.lastGraze = -Infinity;

    this.setupInput();
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  setupInput() {
    // Mobile browsers only unlock audio on the release of a touch (iOS: touchend); a key works too
    const unlock = () => { if (this.state === 'playing') this.audio.init(); };
    window.addEventListener('keydown', (e) => {
      // A focused button handles its own Space/Enter (the sound toggle must not start a run)
      if ((e.code === 'Space' || e.code === 'Enter') && e.target.closest?.('button')) return;
      unlock();
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
    const release = (e) => {
      this.held.delete(e.pointerId);
      unlock();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('touchend', unlock);
    // iOS Safari shows its long-press loupe even with user-select: none (WebKit
    // 231161); only a cancelled touchstart stops it. Pointer events still fire,
    // and buttons keep their click.
    document.addEventListener('touchstart', (e) => {
      if (e.cancelable && !e.target.closest('button')) e.preventDefault();
    }, { passive: false });

    window.addEventListener('blur', () => {
      this.held.clear();
      if (this.state === 'playing') this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      this.held.clear(); // a release lost while hidden must not steer after resume
      if (this.state === 'playing') this.pause();
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
    // The spin the world shows now: a restart mid-crash picks up the crawl, not the run's full speed
    const spin = this.state === 'dying' ? this.spin * CRAWL : this.spin;
    this.hint?.done();
    this.hint = null;
    this.state = 'playing';
    document.activeElement?.blur();
    this.score.reset();
    this.level.reset();
    this.player.reset();
    this.walls.reset(this.level.sides, this.player.angle, this.level.speed);
    this.renderer.setSides(this.level.sides);
    this.setScene(0, this.sceneIndex !== 0); // already there (the first run): no sweep
    this.particles.clear();
    this.accumulator = 0;
    this.hitStop = 0;
    // The world keeps its angle and its spin: the run picks up from the waiting screen without a cut
    this.prevRotation = this.rotation;
    this.spin = this.spin0 = spin;
    this.chain = 0;
    this.lastGraze = -Infinity;
    this.beaten = false;
    this.hud.setBeaten(false);
    this.hud.setTime(0);
    this.hud.setProgress(0);
    this.show('playing');
    this.audio.start();
  }

  show(state, sides) {
    this.hud.setState(state, this.score, sides);
    tell({ type: 'state', state, time: this.score.time, best: this.score.best });
  }

  /** A new glyph set and duotone sweeps out from the center (a drop) */
  setScene(i, sweep = true) {
    this.sceneIndex = i;
    this.renderer.setScene(i, sweep);
    const s = SCENES[i % SCENES.length];
    this.hud.setColors(s.fa, s.acc, s.bg);
  }

  /** Embedded: the host's scroll (0..1 across its section) turns the waiting world, one symmetry step per pass */
  scroll(y) {
    const waiting = this.state === 'menu' || this.state === 'over';
    if (waiting && !this.reducedMotion && this.scrollY !== undefined) {
      this.turn += (y - this.scrollY) * Math.PI * 2 / this.renderer.sides;
    }
    this.scrollY = y;
  }

  pause() {
    this.state = 'paused';
    this.audio.suspend();
    this.show('paused');
  }

  resume() {
    this.state = 'playing';
    document.activeElement?.blur();
    this.audio.resume();
    this.show('playing');
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

    const k = Math.min(1, this.score.time / SPIN_IN);
    this.spin = this.spin0 + (this.level.rotationSpeed - this.spin0) * k * k * (3 - 2 * k);
    this.prevRotation = this.rotation;
    this.rotation += this.spin * dt;

    if (result.collision) this.crash(result.collision);
  }

  /** Visual beat from the song position: pulse on each beat, scene per stage, HUD progress */
  beat() {
    const t = this.score.time;
    if (this.state === 'menu') return { pulse: 0, tilt: 0 };
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
    return { pulse: quiet ? 0 : Math.exp(-(pos.beats % 1) * 7), tilt: TILT[pos.stage] };
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
      const slow = this.crashTime < 0.15 ? 0 : CRAWL; // freeze, then crawl
      this.prevRotation = this.rotation;
      this.rotation += this.spin * dt * slow;
      if (this.crashTime >= CRASH_LENGTH) {
        this.state = 'over';
        // Coast out of the crawl: aim the follow where it would stop, so it never turns back
        this.spin *= CRAWL;
        this.turn = this.rotation + this.spin / TURN_W;
        this.show('over', this.level.sides);
      }
    } else if (this.state === 'menu' || this.state === 'over') {
      // Follow the turn on a critically damped spring, closed form: position and velocity carry over
      const x = this.rotation - this.turn, c = this.spin + TURN_W * x, e = Math.exp(-TURN_W * dt);
      this.prevRotation = this.rotation;
      this.rotation = this.turn + e * (x + c * dt);
      this.spin = e * (this.spin - TURN_W * c * dt);
    }

    this.audio.update(this.score.time);
    this.particles.update(dt);
    const alpha = this.state === 'playing' ? Math.min(1, this.accumulator / SIM_DT) : 1;
    this.player.render(alpha, dt);
    this.player.group.visible = this.state !== 'over'; // the result shows the shape reached, not the wreck
    this.walls.render(alpha);
    this.renderer.render(dt, this.prevRotation + (this.rotation - this.prevRotation) * alpha, this.beat());

    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const game = window.__game = new Game();
  // 'ready' once the first frame is on screen (two frames in), then the states held until then.
  // The host's replies arrive after it, when the listener below is already attached.
  // A frame the host keeps hidden gets no frames at all: a second later it hears 'ready' anyway.
  const ready = () => {
    if (!held) return;
    post({ type: 'ready' });
    held.forEach(post);
    held = null;
  };
  if (HOST) {
    requestAnimationFrame(() => requestAnimationFrame(ready));
    setTimeout(ready, 1000);
  }
  if (!navigator.connection?.saveData) {
    const later = window.requestIdleCallback ?? ((f) => setTimeout(f, 300));
    later(() => { if (game.state === 'menu') game.hint = loadHint(document.getElementById('hint')); });
  }
  if (HOST) {
    window.addEventListener('message', (e) => {
      if (e.source !== window.parent || e.origin !== HOST || e.data?.source !== 'vertice-host') return;
      const { type, on } = e.data;
      if (type === 'play') game.primary();
      else if (type === 'pause' && game.state === 'playing') game.pause();
      else if (type === 'mute' && game.audio.muted !== Boolean(on)) game.hud.setSound(!game.audio.toggleMute());
      else if (type === 'scroll' && Number.isFinite(e.data.y)) game.scroll(Math.min(1, Math.max(0, e.data.y)));
    });
  } else if (!EMBED && 'serviceWorker' in navigator && isSecureContext) {
    navigator.serviceWorker.register('sw.js');
  }
});
