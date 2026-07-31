/**
 * MusicSync — núcleo (Hermes)
 * Sincronía con música EXTERNA (tu pestaña de YouTube, Spotify web, lo que sea)
 * estilo osu!:
 *
 * - Captura el audio de la pestaña vía getDisplayMedia({audio: true}).
 * - BEAT TRACKING: energía de bombo en la banda 40–190 Hz con umbral adaptativo
 *   (media móvil) y periodo refractario — detecta el kick en tiempo real.
 * - ESTIMACIÓN DE BPM: mediana de los últimos intervalos inter-beat, suavizada.
 * - El juego cuantiza el spawn de muros al beat y adapta la velocidad al BPM.
 *
 * Nota honesta: detecta BEATS y BPM. No identifica el nombre de la canción.
 *
 * Es testeable sin permisos: connectSource(anyAudioNode) permite inyectar
 * señal sintética (ver tests en consola).
 */
export class MusicSync {
  constructor(audioEngine) {
    this.audio = audioEngine;
    this.active = false;
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.freqData = null;

    this.bpm = 0;
    this.beatPulse = 0;
    this.level = 0;            // energía actual 0..1 (para fx)
    this.lastBeatTime = 0;
    this.intervals = [];
    this.energyAvg = 0;
    this.beatCount = 0;
    this._lastReportedBeat = 0;
    this.currentInterval = 0.45; // estimado mientras no hay BPM
  }

  /**
   * Pide permiso y captura el audio de la pestaña elegida (YouTube, etc).
   * Requiere gesto del usuario y HTTPS/localhost.
   */
  async start() {
    if (this.active) return true;

    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false }
    });
    // El video no se usa: se detiene al instante
    this.stream.getVideoTracks().forEach(t => t.stop());

    const audioTracks = this.stream.getAudioTracks();
    if (audioTracks.length === 0) {
      this.stream.getTracks().forEach(t => t.stop());
      throw new Error('La pestaña compartida no tiene audio (marca "Compartir audio de la pestaña")');
    }
    audioTracks[0].addEventListener('ended', () => this.stop());

    this.audio.init();
    if (this.audio.ctx.state === 'suspended') await this.audio.ctx.resume();

    const ctx = this.audio.ctx;
    this.source = ctx.createMediaStreamSource(this.stream);

    // Cadena de análisis: lowpass 190Hz → analyser (SIN salida a speakers:
    // la música ya suena en su propia pestaña)
    this.lowFilter = ctx.createBiquadFilter();
    this.lowFilter.type = 'lowpass';
    this.lowFilter.frequency.value = 190;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.4;

    this.source.connect(this.lowFilter);
    this.lowFilter.connect(this.analyser);

    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

    this.active = true;
    this.bpm = 0;
    this.intervals = [];
    this.energyAvg = 0;
    this.beatCount = 0;
    this._lastReportedBeat = 0;
    this.lastBeatTime = performance.now() / 1000;
    return true;
  }

  /** Inyecta una fuente de audio arbitraria (para tests sin getDisplayMedia) */
  connectSource(node) {
    this.audio.init();
    this.lowFilter = this.audio.ctx.createBiquadFilter();
    this.lowFilter.type = 'lowpass';
    this.lowFilter.frequency.value = 190;
    this.analyser = this.audio.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.4;
    node.connect(this.lowFilter);
    this.lowFilter.connect(this.analyser);
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.active = true;
    this.intervals = [];
    this.energyAvg = 0;
    this.beatCount = 0;
    this._lastReportedBeat = 0;
    this.lastBeatTime = performance.now() / 1000;
  }

  stop() {
    this.active = false;
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch (e) {}
      this.source = null;
    }
    this.bpm = 0;
    this.beatPulse = 0;
  }

  /** Energía de bombo: bins de 40–190 Hz (bin ≈ 46.9Hz a 48k/1024) */
  _kickEnergy() {
    this.analyser.getByteFrequencyData(this.freqData);
    let e = 0;
    const binHz = (this.audio.ctx.sampleRate / this.analyser.fftSize);
    const lo = Math.max(1, Math.floor(40 / binHz));
    const hi = Math.min(this.freqData.length - 1, Math.ceil(190 / binHz));
    for (let i = lo; i <= hi; i++) e += this.freqData[i];
    return (e / (hi - lo + 1)) / 255;
  }

  /**
   * Llamar cada frame. Devuelve true si hubo un beat NUEVO desde la vez pasada.
   */
  update(deltaTime) {
    if (!this.active || !this.analyser) return false;

    const e = this._kickEnergy();
    this.level = e;
    // Media móvil (~600ms) como umbral adaptativo
    this.energyAvg += (e - this.energyAvg) * Math.min(1, deltaTime * 3.2);

    const now = performance.now() / 1000;
    const refractory = this.bpm > 0 ? Math.max(0.18, (60 / this.bpm) * 0.5) : 0.24;
    let newBeat = false;

    if (e > this.energyAvg * 1.35 && e > 0.14 && (now - this.lastBeatTime) > refractory) {
      const interval = now - this.lastBeatTime;
      this.lastBeatTime = now;
      this.beatPulse = 1;
      this.beatCount++;
      newBeat = true;

      if (interval > 0.25 && interval < 1.5) {
        this.intervals.push(interval);
        if (this.intervals.length > 10) this.intervals.shift();
        const sorted = [...this.intervals].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        this.currentInterval = median;
        const rawBpm = 60 / median;
        const clamped = Math.max(60, Math.min(200, rawBpm));
        this.bpm = this.bpm === 0 ? clamped : this.bpm + (clamped - this.bpm) * 0.15;
      }
    }

    if (this.beatPulse > 0) {
      this.beatPulse = Math.max(0, this.beatPulse - deltaTime * 4.5);
    }
    return newBeat;
  }

  /** Fase del beat actual 0..1 (para fx anticipados) */
  getBeatPhase() {
    if (!this.active) return 0;
    const now = performance.now() / 1000;
    return Math.min(1, (now - this.lastBeatTime) / this.currentInterval);
  }

  /** Multiplicador de velocidad de juego según BPM (sutil: 0.9–1.2) */
  getSpeedMultiplier() {
    if (!this.active || this.bpm === 0) return 1;
    return Math.max(0.9, Math.min(1.2, this.bpm / 140));
  }
}
