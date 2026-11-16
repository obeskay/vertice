import { sixteenth } from '../game/LevelSystem.js';

/**
 * AudioEngine — a driving synth track locked to the run's clock.
 * Every 16th note is scheduled from run time (LevelSystem.sixteenth), so the
 * tempo climbs stage by stage and each stage change lands on a downbeat: the
 * last bar of a stage builds (riser, snare roll, the kick drops out) and the
 * next one opens with a crash. Layers join as the run goes: kick, offbeat bass
 * and hats first; claps, rolling bass and 16th arps next; then a lead hook.
 * Grazes and the crash stay in the same key.
 */
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

// One chord per bar: bass root (MIDI), four chord tones, and the lead hook
const AM = { bass: 45, tones: [57, 60, 64, 69], hook: [81, 79, 76, 79, 81, 84] };
const F = { bass: 41, tones: [53, 57, 60, 65], hook: [81, 77, 72, 77, 81, 84] };
const C = { bass: 48, tones: [55, 60, 64, 67], hook: [79, 76, 72, 76, 79, 84] };
const G = { bass: 43, tones: [55, 59, 62, 67], hook: [79, 74, 71, 74, 79, 83] };
const E = { bass: 40, tones: [56, 59, 64, 68], hook: [80, 76, 71, 76, 80, 83] };
const PROG_A = [AM, F, C, G];
const PROG_B = [AM, G, F, E]; // darker turn from stage 3 on

const HOOK_STEPS = [0, 3, 6, 8, 11, 14];           // 3-3-2 rhythm, twice per bar
const ARP16 = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1];
const ARP_CUTOFF = [1000, 1700, 2300, 2600, 3000, 3400];
const GRAZE = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91]; // A minor pentatonic, climbs with the chain
const LOOKAHEAD = 0.1;
const VOLUME = 0.72; // peaks stay under full scale (offline render: about -20 LUFS)
const MUTE_KEY = 'vertice_muted';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.key = 0;
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  /** Must run inside a user gesture the first time (browser autoplay rules). A ctx can be injected (offline render) */
  init(ctx) {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!ctx && !AC) return;
    const c = this.ctx = ctx || new AC();

    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.12;
    comp.connect(c.destination);
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : VOLUME;
    this.master.connect(comp);

    // Song path: drums + (ducked) music -> bus (fades on death) -> tone (closes on death)
    this.tone = c.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 18000;
    this.tone.Q.value = 0.5;
    this.tone.connect(this.master);
    this.bus = c.createGain();
    this.bus.connect(this.tone);
    this.drums = c.createGain();
    this.drums.connect(this.bus);
    this.duck = c.createGain(); // the kick pumps everything else
    this.duck.connect(this.bus);
    this.music = c.createGain();
    this.music.connect(this.duck);

    // Dotted-eighth echo for arps and lead; retimed at each stage
    this.delay = c.createDelay(1);
    const feedback = c.createGain();
    feedback.gain.value = 0.35;
    const echoTone = c.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 2600;
    const wet = c.createGain();
    wet.gain.value = 0.22;
    this.delay.connect(echoTone).connect(feedback).connect(this.delay);
    echoTone.connect(wet).connect(this.duck);
    this.send = c.createGain();
    this.send.connect(this.delay);

    // One second of white noise feeds hats, claps, snares, crashes and risers
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 1;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = seed / 1073741823.5 - 1;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : VOLUME, this.ctx.currentTime, 0.02);
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {} // storage blocked: the choice lasts the session
    return this.muted;
  }

  start() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const p of [this.tone.frequency, this.bus.gain, this.duck.gain]) p.cancelScheduledValues(now);
    this.tone.frequency.setValueAtTime(18000, now);
    this.bus.gain.setValueAtTime(1, now);
    this.duck.gain.setValueAtTime(1, now);
    this.playing = true;
    this.n = 0;
    this.offset = null;
    this.stage = -1;
  }

  stop() {
    this.playing = false;
  }

  suspend() {
    if (this.ctx) this.ctx.suspend();
  }

  resume() {
    if (this.ctx) this.ctx.resume();
  }

  /** Schedules the song a little ahead. t = run time; now = audio time */
  update(t, now = this.ctx?.currentTime) {
    if (!this.ctx || !this.playing || this.ctx.state !== 'running') return;
    // Audio time = run time + offset. Frame jitter is smoothed away; a pause or a stall re-anchors.
    const drift = now - t - (this.offset ?? Infinity);
    if (!(Math.abs(drift) < 0.25)) this.offset = now - t;
    else this.offset += drift * 0.05;

    for (;;) {
      const s = sixteenth(this.n);
      const at = s.time + this.offset;
      if (at > now + LOOKAHEAD) break;
      // Late (unlocked mid-run): skip, don't burst. A hair late plays now: a fresh context starts at 0, so `at` can be negative
      if (at > now - 0.02) this._step(s, Math.max(at, now));
      this.n++;
    }
  }

  _step({ stage, k, steps, bpm }, at) {
    const step = k % 16;
    const bar = Math.floor(k / 16);
    const last = Math.floor(steps / 16) - 1;
    const build = bar === last || (stage === 5 && bar % 16 === 15);
    const drop = step === 0 && ((stage > 0 && bar === 0) || (stage === 5 && bar > 0 && bar % 16 === 0));
    const sixteenthLen = 15 / bpm;

    if (stage !== this.stage) {
      this.stage = stage;
      this.key = stage === 5 ? 2 : 0;
      this.delay.delayTime.setValueAtTime(3 * sixteenthLen, at);
    }
    const chord = (stage >= 3 ? PROG_B : PROG_A)[bar % 4];
    const key = this.key;

    if (drop) this._crash(at);

    // Drums
    const half = build && step >= 8;
    if (step % 4 === 0 && !half) this._kick(at);
    if (stage > 0 || step % 4 === 2) this._hat(at, step % 4 === 2 ? 0.11 : 0.045);
    if (stage >= 1 && (step === 4 || step === 12) && !half) this._clap(at);
    if (build) {
      if (step === 0) this._riser(at, 16 * sixteenthLen);
      const every = step < 8 ? 4 : step < 12 ? 2 : 1;
      if (step % every === 0) this._snare(at, 0.08 + 0.3 * (step / 15));
    }

    // Bass: offbeats first, then a rolling line between the kicks
    if (stage === 0 ? step % 4 === 2 : step % 4 !== 0) {
      const up = stage >= 2 && step % 4 === 3 ? 12 : 0;
      this._bass(chord.bass + key + up, at, sixteenthLen * 0.9, stage);
    }

    // Arp: eighths in the intro, 16ths after
    if (stage > 0 || step % 2 === 0) {
      const i = ARP16[step];
      const midi = i === 4 ? chord.tones[1] + 24 : chord.tones[i] + 12;
      this._arp(midi + key, at, ARP_CUTOFF[stage], half ? 0.6 : 1);
    }

    // Lead hook from stage 2
    if (stage >= 2) {
      const h = HOOK_STEPS.indexOf(step);
      if (h >= 0) {
        const next = HOOK_STEPS[h + 1] ?? 16;
        this._lead(chord.hook[h] + key, at, (next - step) * sixteenthLen * 0.95);
      }
    }
  }

  _env(gain, at, peak, attack, dur) {
    gain.setValueAtTime(0, at);
    gain.linearRampToValueAtTime(peak, at + attack);
    gain.exponentialRampToValueAtTime(0.0001, at + dur);
  }

  _noise(at, dur, filterType, freq, q, dest) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true; // the riser and crash outlast the 1 s buffer
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    src.connect(f).connect(g).connect(dest);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.02);
    return { f, g };
  }

  _kick(at) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.frequency.setValueAtTime(160, at);
    osc.frequency.exponentialRampToValueAtTime(46, at + 0.12);
    const g = c.createGain();
    this._env(g.gain, at, 0.95, 0.002, 0.38);
    osc.connect(g).connect(this.drums);
    osc.start(at);
    osc.stop(at + 0.4);
    const click = this._noise(at, 0.012, 'highpass', 3000, 0.7, this.drums);
    this._env(click.g.gain, at, 0.18, 0.001, 0.012);
    this.duck.gain.setValueAtTime(0.4, at);
    this.duck.gain.linearRampToValueAtTime(1, at + 0.22);
  }

  _hat(at, vol) {
    const { g } = this._noise(at, 0.05, 'highpass', 7500, 0.7, this.drums);
    this._env(g.gain, at, vol, 0.001, 0.045);
  }

  _clap(at) {
    const { g } = this._noise(at, 0.2, 'bandpass', 1500, 0.8, this.drums);
    // Three quick slaps and a tail: the classic clap
    g.gain.setValueAtTime(0, at);
    for (let i = 0; i < 3; i++) {
      g.gain.linearRampToValueAtTime(0.32, at + i * 0.011 + 0.001);
      g.gain.linearRampToValueAtTime(0.06, at + i * 0.011 + 0.009);
    }
    g.gain.linearRampToValueAtTime(0.28, at + 0.034);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
  }

  _snare(at, vol) {
    const { g } = this._noise(at, 0.12, 'bandpass', 1900, 0.6, this.drums);
    this._env(g.gain, at, vol, 0.001, 0.11);
  }

  _crash(at) {
    const { g } = this._noise(at, 1.8, 'highpass', 4200, 0.5, this.drums);
    this._env(g.gain, at, 0.3, 0.002, 1.8);
  }

  _riser(at, dur) {
    const { f, g } = this._noise(at, dur, 'bandpass', 400, 2.5, this.music);
    f.frequency.setValueAtTime(400, at);
    f.frequency.exponentialRampToValueAtTime(7000, at + dur);
    g.gain.setValueAtTime(0.02, at);
    g.gain.exponentialRampToValueAtTime(0.4, at + dur);
    g.gain.linearRampToValueAtTime(0, at + dur + 0.02);
  }

  _bass(midi, at, dur, stage) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = midiHz(midi);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    const open = 700 + 180 * stage;
    f.frequency.setValueAtTime(open, at);
    f.frequency.exponentialRampToValueAtTime(180, at + dur);
    const g = c.createGain();
    this._env(g.gain, at, 0.26, 0.003, dur);
    osc.connect(f).connect(g).connect(this.music);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  _arp(midi, at, cutoff, vol) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.value = midiHz(midi);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = c.createGain();
    this._env(g.gain, at, 0.055 * vol, 0.002, 0.13);
    osc.connect(f).connect(g);
    g.connect(this.music);
    g.connect(this.send);
    osc.start(at);
    osc.stop(at + 0.15);
  }

  _lead(midi, at, dur) {
    const c = this.ctx;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(4200, at);
    f.frequency.exponentialRampToValueAtTime(1600, at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.07, at + 0.008);
    g.gain.setValueAtTime(0.07, at + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.06);
    f.connect(g);
    g.connect(this.music);
    g.connect(this.send);
    for (const cents of [-8, 8]) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiHz(midi);
      osc.detune.value = cents;
      osc.connect(f);
      osc.start(at);
      osc.stop(at + dur + 0.08);
    }
  }

  /** A soft mallet note for feedback, outside the song bus */
  _note(midi, at, vol, dur) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = midiHz(midi);
    const g = c.createGain();
    this._env(g.gain, at, vol, 0.004, dur);
    osc.connect(g).connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  playGraze(chain) {
    if (this.ctx?.state !== 'running') return; // still locked: would all fire at once on unlock
    const midi = GRAZE[Math.min(chain, GRAZE.length) - 1] + this.key;
    this._note(midi, this.ctx.currentTime, 0.2, 0.5);
  }

  /** Rising arpeggio: a new record */
  playChime() {
    if (this.ctx?.state !== 'running') return;
    const at = this.ctx.currentTime;
    [69, 72, 76, 81].forEach((m, i) => this._note(m + this.key, at + i * 0.07, 0.16, 0.7));
  }

  /** The song winds down like a stopped tape under a low boom */
  playDeath() {
    this.stop();
    if (this.ctx?.state !== 'running') return;
    const c = this.ctx;
    const at = c.currentTime;
    this.tone.frequency.cancelScheduledValues(at);
    this.tone.frequency.setTargetAtTime(110, at, 0.12);
    this.bus.gain.cancelScheduledValues(at);
    this.bus.gain.setValueAtTime(1, at);
    this.bus.gain.setTargetAtTime(0, at + 0.1, 0.25);

    const osc = c.createOscillator();
    osc.frequency.setValueAtTime(120, at);
    osc.frequency.exponentialRampToValueAtTime(32, at + 0.8);
    const g = c.createGain();
    this._env(g.gain, at, 0.6, 0.003, 1.1);
    osc.connect(g).connect(this.master);
    osc.start(at);
    osc.stop(at + 1.15);
    const thud = this._noise(at, 0.6, 'lowpass', 600, 0.7, this.master);
    this._env(thud.g.gain, at, 0.3, 0.002, 0.6);
  }
}
