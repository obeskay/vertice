/**
 * PaletteManager
 * Continuous HSL Hue Shift Engine for VÉRTICE.
 * As survival time advances, the monochromatic hue shifts smoothly through the spectrum
 * while maintaining 100% stark contrast and zero memory allocations.
 */
export class PaletteManager {
  constructor() {
    this.baseHue = 145; // Start at Emerald Green (145°)
    this.hueSpeed = 6.0; // °/s — deriva sutil, HIPNÓTICA, no estroboscópica
    this.manualOffset = 0;

    this.currentHue = this.baseHue;

    this.colors = {
      bg: 0x0c0d12,
      primary: 0x00ff66,
      center: 0x161822,
      walls: 0x00ff66,
      player: 0xffffff,
      wedgeA: 0x14201a,
      wedgeB: 0x0b120e,
      hudAccent: '#00ff66'
    };
  }

  getCurrentPalette() {
    return {
      name: `HUE ${Math.round(this.currentHue)}°`,
      bg: this.colors.bg,
      primary: this.colors.primary,
      center: this.colors.center,
      walls: this.colors.walls,
      player: this.colors.player,
      hudAccent: this.colors.hudAccent
    };
  }

  getBlended(channel) {
    return this.colors[channel] !== undefined ? this.colors[channel] : 0x00ff66;
  }

  getBlendedAccentCss() {
    return this.colors.hudAccent;
  }

  nextPalette() {
    this.manualOffset = (this.manualOffset + 60) % 360;
    return `HUE ${Math.round((this.currentHue + 60) % 360)}°`;
  }

  update(deltaTime, survivalTime = 0) {
    this.currentHue = (this.baseHue + survivalTime * this.hueSpeed + this.manualOffset) % 360;

    // Acento vibrante (paredes, contornos)
    this.colors.primary = this.hslToHex(this.currentHue, 1.0, 0.50);
    this.colors.walls = this.colors.primary;

    // Gajos del fondo: dos tonos con CONTRASTE real del hue (la simetría
    // hipnótica estilo Super Hexagon — legibles, no casi-negros)
    this.colors.wedgeA = this.hslToHex(this.currentHue, 0.55, 0.235);
    this.colors.wedgeB = this.hslToHex(this.currentHue, 0.50, 0.135);

    // Centro poligonal profundo y fondo casi negro tintado (nunca #000 puro)
    this.colors.center = this.hslToHex(this.currentHue, 0.50, 0.13);
    this.colors.bg = this.hslToHex(this.currentHue, 0.55, 0.045);

    // Jugador: blanco tintado hacia el hue (nunca #fff puro)
    this.colors.player = this.hslToHex(this.currentHue, 0.25, 0.93);

    // CSS hex string for HUD accent badge
    this.colors.hudAccent = `#${this.colors.primary.toString(16).padStart(6, '0')}`;
  }

  /**
   * Sub-microsecond HSL to 24-bit Integer Hex conversion (Zero GC String allocations).
   */
  hslToHex(h, s, l) {
    h = (h % 360 + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;

    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    const R = Math.round((r + m) * 255);
    const G = Math.round((g + m) * 255);
    const B = Math.round((b + m) * 255);

    return (R << 16) | (G << 8) | B;
  }
}
