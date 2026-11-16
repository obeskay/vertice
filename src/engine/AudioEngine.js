/**
 * AudioEngine — one soft voice for everything.
 * Every sound is the same mallet (triangle or sine, fast attack, slow decay,
 * low-passed, short echo) playing notes in A minor, so the music, the grazes
 * and the crash always agree. The music is an Am–F–C–G arpeggio whose tempo
 * and pulse climb with the run.
 */
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

const CHORDS = [ // Am, F, C, G: four chord tones each (MIDI)
  [57, 60, 64, 69],
  [53, 57, 60, 65],
  [55, 60, 64, 67],
  [55, 59, 62, 67]
];
const BASS = [45, 41, 48, 43];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3];               // chord-tone index per eighth note
const GRAZE = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91]; // A minor pentatonic, climbs with the chain
const MUTE_KEY = 'vertice_muted';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.playing = false;
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  /** Must run inside a user gesture the first time (browser autoplay rules) */
  init() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();

    const comp = c.createDynamicsCompressor();
    comp.connect(c.destination);
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp);

    // Short dark echo: gives every note the same room
    const delay = c.createDelay(1);
    delay.delayTime.value = 0.3;
    const feedback = c.createGain();
    feedback.gain.value = 0.3;
    const echoTone = c.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 1400;
    const wet = c.createGain();
    wet.gain.value = 0.25;
    delay.connect(echoTone).connect(feedback).connect(delay);
    echoTone.connect(wet).connect(this.master);

    this.voice = c.createBiquadFilter();
    this.voice.type = 'lowpass';
    this.voice.frequency.value = 2200;
    this.voice.Q.value = 0.3;
    this.voice.connect(this.master);
    this.voice.connect(delay);

    this.music = c.createGain();
    this.music.gain.value = 0.6;
    this.music.connect(this.voice);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {} // storage blocked: the choice lasts the session
    return this.muted;
  }

  start() {
    this.init();
    if (!this.ctx) return;
    this.playing = true;
    this.stepIndex = 0;
    this.nextAt = this.ctx.currentTime + 0.05;
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

  /** Schedules the music a little ahead; t = seconds survived */
  update(t) {
    if (!this.ctx || !this.playing) return;
    const now = this.ctx.currentTime;
    if (this.nextAt < now) this.nextAt = now + 0.03; // back from a stall: skip, don't burst
    const k = Math.min(1, t / 100);
    const eighth = 30 / (96 + 40 * k); // 96 → 136 bpm over the first 100 s
    while (this.nextAt < now + 0.12) {
      this._step(this.stepIndex++, this.nextAt, k);
      this.nextAt += eighth;
    }
  }

  _step(i, at, k) {
    const bar = Math.floor(i / 8) % 4;
    const beat = i % 8;
    this._note(CHORDS[bar][ARP[beat]], at, 0.07 + 0.03 * k, 0.45, 'triangle', this.music);
    if (beat === 0 || beat === 4) this._note(BASS[bar], at, 0.16, 0.9, 'sine', this.music);
    if (k > 0.15 && beat % 2 === 0) this._pulse(at, 0.18 * k);
  }

  _note(midi, at, vol, dur, type = 'triangle', dest = this.voice) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = midiHz(midi);
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(dest);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /** Soft low thump that fades in as the run speeds up */
  _pulse(at, vol) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.frequency.setValueAtTime(110, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    osc.connect(g).connect(this.master);
    osc.start(at);
    osc.stop(at + 0.2);
  }

  playGraze(chain) {
    if (this.ctx?.state !== 'running') return; // still locked: would all fire at once on unlock
    const midi = GRAZE[Math.min(chain, GRAZE.length) - 1];
    this._note(midi, this.ctx.currentTime, 0.14, 0.7, 'triangle');
  }

  /** Rising arpeggio: more sides, or a new record */
  playChime() {
    if (this.ctx?.state !== 'running') return;
    const at = this.ctx.currentTime;
    [69, 72, 76, 81].forEach((m, i) => this._note(m, at + i * 0.07, 0.1, 0.8, 'triangle'));
  }

  playDeath() {
    this.stop();
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    this._note(52, at, 0.22, 1.0, 'triangle');
    this._note(45, at + 0.11, 0.26, 1.6, 'triangle');
    this._note(33, at + 0.11, 0.2, 1.4, 'sine');
  }
}
