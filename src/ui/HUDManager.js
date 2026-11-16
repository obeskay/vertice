const $ = (id) => document.getElementById(id);
const PLAY_LABEL = { menu: 'Jugar', paused: 'Continuar', over: 'Otra vez' };

/**
 * Everything on screen besides the canvas: the running time, one overlay
 * (menu, pause, result) and the sound button. body[data-state] drives the CSS.
 */
export class HUDManager {
  constructor({ onPlay, onSound }) {
    this.time = $('time');
    this.result = $('result');
    this.resultValue = $('result-value');
    this.best = $('best');
    this.bestValue = $('best-value');
    this.play = $('play');
    this.sound = $('sound');
    this.overlay = $('overlay');
    this._shown = '';
    this.play.addEventListener('click', onPlay);
    this.sound.addEventListener('click', onSound);
  }

  /** state: menu | playing | paused | over */
  setState(state, score) {
    document.body.dataset.state = state;
    // Faded-out controls must not take focus during a run
    this.overlay.inert = this.sound.inert = state === 'playing';
    const label = PLAY_LABEL[state];
    if (!label) return;
    this.play.setAttribute('aria-label', label);
    this.play.title = label;
    const record = state === 'over' && score.isNewRecord;
    this.resultValue.textContent = score.time.toFixed(2);
    this.result.classList.toggle('record', record);
    this.bestValue.textContent = score.best.toFixed(2);
    this.best.hidden = score.best <= 0 || record;
  }

  setTime(t) {
    const s = t.toFixed(2);
    if (s === this._shown) return;
    this._shown = s;
    this.time.textContent = s;
  }

  /** The running time turns accent once it passes the record */
  setBeaten(on) {
    this.time.classList.toggle('record', on);
  }

  setSound(on) {
    const label = on ? 'Silenciar' : 'Activar sonido';
    this.sound.classList.toggle('off', !on);
    this.sound.setAttribute('aria-label', label);
    this.sound.title = label;
  }
}
