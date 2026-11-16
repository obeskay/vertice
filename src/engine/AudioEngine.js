import { sixteenth } from '../game/LevelSystem.js';

/**
 * AudioEngine — a warm, driving track locked to the run's clock.
 * Every 16th note is scheduled from run time (LevelSystem.sixteenth), so the
 * tempo climbs stage by stage and each stage change lands on a downbeat.
 *
 * D Dorian, one chord per bar, voiced so only a voice or two moves between
 * chords. One layer joins per stage: pad, kick and a sparse pluck; then bass,
 * hats and clap; a rolling bass and 16th phrases; a melody; a darker turn
 * with open hats; and the last stage brings the theme back a whole step up.
 * Every stage ends on a build bar (a riser, the kick out for its second
 * half), but only two drops get the snare roll and the crash; the rest land
 * on a low impact. The music sits under a lowpass that opens as the run goes
 * and for a moment on every graze. Grazes and the record chime ring in key;
 * a crash stops the tape and resolves to a major chord.
 */
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
const _ = null;

// One chord per bar: bass root (MIDI) and four pad voices, rootless and close
const DM9 = { bass: 38, pad: [53, 57, 60, 64] };
const G13 = { bass: 43, pad: [53, 57, 59, 64] };
const BB9 = { bass: 46, pad: [53, 57, 60, 62] };
const AM9 = { bass: 45, pad: [52, 55, 59, 60] };
const GM9 = { bass: 43, pad: [53, 57, 58, 62] };
const A7S = { bass: 45, pad: [52, 55, 57, 62] };
const PROG_A = [DM9, G13, BB9, AM9];
const PROG_B = [DM9, BB9, GM9, A7S]; // the darker turn (stage 4)

// The melody, bar by bar along its progression: [16th, MIDI, length in 16ths]
const MEL_A = [
  [[0, 74, 3], [3, 72, 3], [6, 69, 6]],
  [[2, 71, 2], [4, 72, 2], [6, 74, 8]],
  [[0, 77, 3], [3, 76, 3], [6, 74, 4], [10, 72, 4]],
  [[0, 72, 6], [8, 69, 2], [10, 67, 2], [12, 69, 4]]
];
const MEL_B = [
  [[0, 81, 3], [3, 79, 3], [6, 77, 6], [12, 76, 4]],
  [[0, 74, 6], [8, 77, 4], [12, 76, 4]],
  [[0, 74, 3], [3, 70, 3], [6, 69, 6]],
  [[0, 76, 6], [8, 74, 4], [12, 69, 4]]
];

// Pluck phrases, one bar each: an index into the pad (4 = its second voice two octaves up), _ = rest
const SPARSE = [0, _, _, 2, _, _, 3, _, _, 1, _, _, 4, _, _, _];
const ARP_A = [0, 1, 2, _, 3, 2, _, 4, _, 1, 2, _, 3, _, 4, 2];
const ARP_B = [3, _, 2, 1, _, 2, 3, _, 4, _, 3, 2, _, 1, _, _];

const AIR = [2600, 4000, 6500, 9000, 12000, 16000]; // music lowpass per stage: the mix opens up
const PAD_OPEN = [900, 1100, 1400, 1700, 2000, 2400];
const PAD_VOL = [0.06, 0.06, 0.065, 0.07, 0.075, 0.08]; // the bed stays under the layers that join it
const PAN = [-0.45, -0.15, 0.15, 0.45];
const BIG_DROPS = new Set([2, 5]); // the only drops with a snare roll and a crash
const GRAZE = [74, 77, 79, 81, 84, 86, 89, 91, 93, 96]; // D minor pentatonic bells, climbing with the chain
const RESOLVE = [50, 57, 61, 64, 66]; // D major 9: the minor song resolves when the run ends
const LOOKAHEAD = 0.1;
const VOLUME = 1;
const MUTE_KEY = 'vertice_muted';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.key = 0;
    this.stage = -1;
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

    // Master: a gentle high shelf, glue compression, then a fast limiter
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.06;
    limiter.connect(c.destination);
    const glue = c.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.knee.value = 6;
    glue.ratio.value = 3;
    glue.attack.value = 0.01;
    glue.release.value = 0.15;
    glue.connect(limiter);
    const shelf = c.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 6500;
    shelf.gain.value = -3;
    shelf.connect(glue);
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : VOLUME;
    this.master.connect(shelf);

    // Song path: drums + (ducked, filtered) music -> bus (fades on death) -> tone (closes on death)
    this.tone = c.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 18000;
    this.tone.Q.value = 0.5;
    this.tone.connect(this.master);
    this.bus = c.createGain();
    this.bus.connect(this.tone);
    this.drums = c.createGain();
    this.drums.connect(this.bus);
    this.duck = c.createGain(); // the kick pumps the music
    this.duck.connect(this.bus);
    this.air = c.createBiquadFilter();
    this.air.type = 'lowpass';
    this.air.frequency.value = AIR[0];
    this.air.Q.value = 0.7;
    this.air.connect(this.duck);
    this.music = c.createGain();
    this.music.connect(this.air);

    // Dotted-eighth echo for plucks and the melody; retimed at each stage
    this.delay = c.createDelay(1);
    const feedback = c.createGain();
    feedback.gain.value = 0.32;
    const echoTone = c.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 2400;
    const wet = c.createGain();
    wet.gain.value = 0.2;
    this.delay.connect(echoTone).connect(feedback).connect(this.delay);
    echoTone.connect(wet).connect(this.duck);
    this.send = c.createGain();
    this.send.connect(this.delay);

    // A generated hall, after the bus: its tail rings on when the song stops
    const verb = c.createConvolver();
    verb.buffer = this._hall(2.8);
    const verbOut = c.createGain();
    verbOut.gain.value = 0.42;
    verb.connect(verbOut).connect(this.master);
    this.verbIn = c.createGain();
    this.verbIn.connect(verb);

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

  /** Stereo decaying noise that darkens as it fades: a plausible room, no file to load */
  _hall(seconds) {
    const c = this.ctx;
    const len = Math.round(c.sampleRate * seconds);
    const ir = c.createBuffer(2, len, c.sampleRate);
    let seed = 7;
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        const t = i / len;
        const k = 0.3 + 0.65 * t; // more smoothing further into the tail
        lp = lp * k + (seed / 1073741823.5 - 1) * (1 - k);
        d[i] = i < c.sampleRate * 0.012 ? 0 : lp * (1 - t) ** 2.5;
      }
    }
    return ir;
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
    for (const p of [this.tone.frequency, this.bus.gain, this.duck.gain, this.air.frequency]) p.cancelScheduledValues(now);
    this.tone.frequency.setValueAtTime(18000, now);
    this.bus.gain.setValueAtTime(1, now);
    this.duck.gain.setValueAtTime(1, now);
    this.air.frequency.setValueAtTime(AIR[0], now);
    this.playing = true;
    this.n = 0;
    this.offset = null;
    this.stage = -1;
    this.key = 0;
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
    const late = stage === 5;
    const build = bar === Math.floor(steps / 16) - 1 || (late && bar % 16 === 15);
    const len = 15 / bpm; // one 16th, s

    if (stage !== this.stage) {
      this.stage = stage;
      this.key = late ? 2 : 0;
      this.pump = stage === 0 ? 0.65 : 0.45;
      this.delay.delayTime.setValueAtTime(3 * len, at);
      this.air.frequency.setValueAtTime(AIR[stage], at);
    }
    const dark = stage === 4;
    const chord = (dark ? PROG_B : PROG_A)[bar % 4];
    const key = this.key;
    const half = build && step >= 8; // the kick sits out the second half of a build
    const roll = build && BIG_DROPS.has(late ? -1 : stage + 1);

    if (step === 0 && bar === 0 && BIG_DROPS.has(stage)) this._crash(at);
    else if (step === 0 && ((stage > 0 && bar === 0) || (late && bar > 0 && bar % 16 === 0))) this._impact(at);
    if (step === 0) this._pad(chord, key, at, 16 * len, stage);

    // Drums
    if (step % 4 === 0 && !half) this._kick(at);
    if (stage >= 4 && step % 8 === 6) this._openHat(at);
    else if (stage >= 1 && step % 4 === 2) this._hat(at, 0.09);
    else if (stage >= 2 && step % 2 === 1) this._hat(at, 0.03);
    if (stage >= 1 && (step === 4 || step === 12) && !half) this._clap(at);
    if (build && step === 0) this._riser(at, 16 * len);
    if (roll) {
      const every = step < 8 ? 4 : step < 12 ? 2 : 1;
      if (step % every === 0) this._snare(at, 0.08 + 0.3 * (step / 15));
    }

    // Bass: offbeats first, then a rolling line between the kicks
    if (stage === 1 ? step % 4 === 2 : stage >= 2 && step % 4 !== 0) {
      const up = stage >= 3 && step % 4 === 3 ? 12 : 0;
      this._bass(chord.bass + key + up, at, len * 0.9, stage);
    }

    // Plucks: a sparse phrase, 16th phrases with rests from stage 2
    const i = (stage < 2 ? SPARSE : bar % 2 ? ARP_B : ARP_A)[step];
    if (i !== _) {
      const midi = i === 4 ? chord.pad[1] + 24 : chord.pad[i] + 12;
      this._fm(midi + key, at, {
        ratio: 2, index: 2.4, attack: 0.002, hold: 0, release: 0.42,
        vol: (half ? 0.045 : 0.075), pan: PAN[step % 4] * 0.6, outs: [this.music, this.send, this.verbIn]
      });
    }

    // The melody from stage 3: four bars on, four bars of air
    const sing = late ? bar % 16 < 12 : stage >= 3 && Math.floor(bar / 4) % 2 === 0;
    if (sing && !build) {
      for (const [s, m, n] of (dark ? MEL_B : MEL_A)[bar % 4]) {
        if (s === step) {
          this._fm(m + key, at, {
            ratio: 1, index: 1.1, attack: 0.015, hold: n * len * 0.75, release: 0.2,
            vol: 0.06, outs: [this.music, this.send, this.verbIn]
          });
        }
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

  /**
   * Two-operator FM voice: the brightness falls faster than the level, so a
   * short note plucks and a held one softens. Used for plucks, the melody,
   * bells and the closing chord.
   */
  _fm(midi, at, { ratio, index, attack, hold, release, vol, pan = 0, outs }) {
    const c = this.ctx;
    const hz = midiHz(midi);
    const end = at + attack + hold + release;
    const car = c.createOscillator();
    car.frequency.value = hz;
    const mod = c.createOscillator();
    mod.frequency.value = hz * ratio;
    const depth = c.createGain();
    depth.gain.setValueAtTime(hz * index, at);
    depth.gain.setTargetAtTime(hz * index * 0.15, at, (end - at) * 0.25);
    mod.connect(depth).connect(car.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + attack);
    g.gain.setValueAtTime(vol, at + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    car.connect(g).connect(p);
    for (const o of outs) p.connect(o);
    for (const o of [car, mod]) {
      o.start(at);
      o.stop(end + 0.02);
    }
  }

  /** The chord for one bar: detuned saws spread across the field, a filter that breathes in and out */
  _pad(chord, key, at, dur, stage) {
    const c = this.ctx;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.8;
    const open = PAD_OPEN[stage];
    f.frequency.setValueAtTime(open * 0.45, at);
    f.frequency.linearRampToValueAtTime(open, at + dur * 0.5);
    f.frequency.linearRampToValueAtTime(open * 0.6, at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(PAD_VOL[stage], at + Math.min(0.3, dur * 0.25));
    g.gain.setValueAtTime(PAD_VOL[stage], at + dur);
    g.gain.setTargetAtTime(0, at + dur, 0.18);
    f.connect(g);
    g.connect(this.music);
    g.connect(this.verbIn);
    chord.pad.forEach((m, v) => {
      const p = c.createStereoPanner();
      p.pan.value = PAN[v];
      p.connect(f);
      for (const cents of [-7, 7]) {
        const osc = c.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midiHz(m + key);
        osc.detune.value = cents;
        osc.connect(p);
        osc.start(at);
        osc.stop(at + dur + 1);
      }
    });
  }

  _kick(at) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(48, at + 0.07);
    const g = c.createGain();
    this._env(g.gain, at, 0.95, 0.002, 0.24);
    osc.connect(g).connect(this.drums);
    osc.start(at);
    osc.stop(at + 0.26);
    const click = this._noise(at, 0.01, 'highpass', 3000, 0.7, this.drums);
    this._env(click.g.gain, at, 0.14, 0.001, 0.01);
    this.duck.gain.setValueAtTime(this.pump, at);
    this.duck.gain.linearRampToValueAtTime(1, at + 0.2);
  }

  _hat(at, vol) {
    const { g } = this._noise(at, 0.05, 'highpass', 7500, 0.7, this.drums);
    this._env(g.gain, at, vol, 0.001, 0.045);
  }

  _openHat(at) {
    const { g } = this._noise(at, 0.3, 'highpass', 6500, 0.7, this.drums);
    this._env(g.gain, at, 0.07, 0.002, 0.28);
  }

  _clap(at) {
    const { g } = this._noise(at, 0.2, 'bandpass', 1500, 0.8, this.drums);
    g.connect(this.verbIn);
    // Three quick slaps and a tail: the classic clap
    g.gain.setValueAtTime(0, at);
    for (let i = 0; i < 3; i++) {
      g.gain.linearRampToValueAtTime(0.26, at + i * 0.011 + 0.001);
      g.gain.linearRampToValueAtTime(0.05, at + i * 0.011 + 0.009);
    }
    g.gain.linearRampToValueAtTime(0.22, at + 0.034);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
  }

  _snare(at, vol) {
    const { g } = this._noise(at, 0.12, 'bandpass', 1900, 0.6, this.drums);
    this._env(g.gain, at, vol, 0.001, 0.11);
  }

  _crash(at) {
    const { g } = this._noise(at, 1.8, 'highpass', 4200, 0.5, this.drums);
    g.connect(this.verbIn);
    this._env(g.gain, at, 0.26, 0.002, 1.8);
  }

  /** The quieter drop: a falling sub and a puff of air into the hall */
  _impact(at) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.frequency.setValueAtTime(90, at);
    osc.frequency.exponentialRampToValueAtTime(36, at + 0.6);
    const g = c.createGain();
    this._env(g.gain, at, 0.5, 0.004, 1.1);
    osc.connect(g).connect(this.drums);
    osc.start(at);
    osc.stop(at + 1.15);
    const puff = this._noise(at, 0.5, 'lowpass', 1400, 0.5, this.verbIn);
    this._env(puff.g.gain, at, 0.3, 0.002, 0.5);
  }

  _riser(at, dur) {
    const { f, g } = this._noise(at, dur, 'bandpass', 400, 2.5, this.drums);
    f.frequency.setValueAtTime(400, at);
    f.frequency.exponentialRampToValueAtTime(7000, at + dur);
    g.gain.setValueAtTime(0.02, at);
    g.gain.exponentialRampToValueAtTime(0.3, at + dur);
    g.gain.linearRampToValueAtTime(0, at + dur + 0.02);
  }

  /** Saw for presence on small speakers, a sine under it for weight; dry, so the low end stays centered */
  _bass(midi, at, dur, stage) {
    const c = this.ctx;
    const saw = c.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = midiHz(midi);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(600 + 140 * stage, at);
    f.frequency.exponentialRampToValueAtTime(160, at + dur);
    const sub = c.createOscillator();
    sub.frequency.value = midiHz(midi);
    const g = c.createGain();
    this._env(g.gain, at, 0.2, 0.003, dur);
    saw.connect(f).connect(g);
    sub.connect(g);
    g.connect(this.music);
    for (const o of [saw, sub]) {
      o.start(at);
      o.stop(at + dur + 0.02);
    }
  }

  _bell(midi, at, vol) {
    this._fm(midi, at, { ratio: 3.5, index: 3, attack: 0.002, hold: 0, release: 1.1, vol, outs: [this.master, this.verbIn] });
  }

  /** A graze rings a bell and opens the music's filter for a moment */
  playGraze(chain) {
    if (this.ctx?.state !== 'running') return; // still locked: would all fire at once on unlock
    const now = this.ctx.currentTime;
    this._bell(GRAZE[Math.min(chain, GRAZE.length) - 1] + this.key, now, 0.14);
    const base = AIR[Math.max(0, this.stage)];
    const f = this.air.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(Math.min(18000, base * 2.2), now);
    f.setTargetAtTime(base, now + 0.05, 0.25);
  }

  /** Rising Dm9 in bells: a new record */
  playChime() {
    if (this.ctx?.state !== 'running') return;
    const at = this.ctx.currentTime;
    [74, 77, 81, 84, 88].forEach((m, i) => this._bell(m + this.key, at + i * 0.07, 0.11));
  }

  /** The song winds down like a stopped tape under a low boom, then resolves */
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
    this._env(g.gain, at, 0.55, 0.003, 1.1);
    osc.connect(g).connect(this.master);
    osc.start(at);
    osc.stop(at + 1.15);
    const thud = this._noise(at, 0.6, 'lowpass', 600, 0.7, this.master);
    this._env(thud.g.gain, at, 0.28, 0.002, 0.6);

    // As the result shows, the minor song lands on a major chord
    RESOLVE.forEach((m, i) => this._fm(m + this.key, at + 0.8 + i * 0.04, {
      ratio: 1, index: 0.6, attack: 0.35, hold: 0.4, release: 2.4,
      vol: 0.05, pan: (i - 2) * 0.2, outs: [this.master, this.verbIn]
    }));
  }
}
