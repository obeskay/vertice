/**
 * VoiceEngine
 * Iconic Arcade Robotic Voice Synthesizer for VÉRTICE.
 * Speaks arcade announcements ("BEGIN!", "HEXAGON!", "GAME OVER!", "NEW RECORD!")
 * using Web Speech API with pitched robotic cadence and Web Audio fallback.
 */
export class VoiceEngine {
  constructor(audioEngine) {
    this.audio = audioEngine;
    this.enabled = true;
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.selectedVoice = null;
    this.speechAvailable = false;

    if (this.synth) {
      this.initVoices();
      if (typeof window !== 'undefined' && window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  initVoices() {
    if (!this.synth) return;
    try {
      const voices = this.synth.getVoices();
      if (voices && voices.length > 0) {
        this.speechAvailable = true;
        // Prefer English/Spanish clear female / neutral robotic arcade voice
        this.selectedVoice = voices.find(v => (v.lang.startsWith('es') || v.lang.startsWith('en')) && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Paulina'))) || voices[0];
      }
    } catch (e) {
      this.speechAvailable = false;
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  speak(text, priority = false) {
    if (!this.enabled) return;

    if (this.synth && this.speechAvailable) {
      try {
        if (priority) {
          this.synth.cancel(); // Interrupt previous speech for urgent events (like Game Over)
        }
        const utterance = new SpeechSynthesisUtterance(text);
        if (this.selectedVoice) utterance.voice = this.selectedVoice;
        utterance.pitch = 1.35; // Iconic high arcade pitch
        utterance.rate = 1.25;  // Fast arcade cadence
        utterance.volume = this.audio && this.audio.isMuted ? 0 : 0.85;
        this.synth.speak(utterance);
        return;
      } catch (e) {}
    }

    // Fallback: Web Audio arcade phonetic synth chime
    this.playRoboticChime();
  }

  playRoboticChime() {
    if (!this.audio || this.audio.isMuted || !this.audio.ctx) return;
    const time = this.audio.ctx.currentTime;
    const osc = this.audio.ctx.createOscillator();
    const gain = this.audio.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, time);
    osc.frequency.exponentialRampToValueAtTime(1200, time + 0.08);

    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    osc.connect(gain);
    gain.connect(this.audio.masterGain || this.audio.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.08);
  }

  // Common Arcade Announcements
  announceStart() {
    this.speak('VÉRTICE... START!', true);
  }

  announceRank(rankName) {
    this.speak(rankName.toUpperCase(), false);
  }

  announceGameOver() {
    this.speak('GAME OVER', true);
  }

  announceNewRecord() {
    this.speak('NEW RECORD!', true);
  }

  announceShield() {
    this.speak('ESCUDO', false);
  }

  announceSlowMo() {
    this.speak('CALMA', false);
  }

  announceFlow() {
    this.speak('FLOW COMBO!', false);
  }
}
