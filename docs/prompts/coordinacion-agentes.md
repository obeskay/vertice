# COORDINACIÓN DE AGENTES — VÉRTICE (hyper-hexagon-3d)

Hay DOS agentes trabajando este proyecto. Este documento es la frontera.
**Pégalo completo como instrucción al otro agente.**

---

## 🚧 REGLA #1 — PROPIEDAD DE ARCHIVOS (no negociable)

A partir de ahora, cada agente SOLO edita sus archivos. Si necesitas un cambio
en un archivo del otro, NO lo edites: deja una nota en `docs/prompts/notas.md`.

### Agente PRESENTACIÓN (tú, el otro agente)
```
index.html
style.css
src/ui/HUDManager.js
src/engine/Renderer.js
src/engine/ParticleSystem.js
src/engine/PaletteManager.js
```

### Agente NÚCLEO (Hermes — NO tocar, ya están terminados)
```
src/main.js                  ← game loop: fixed timestep 240Hz + interpolación, hitstop, slow-mo
src/game/Player.js           ← nave, hitbox {angle, minAngle, maxAngle, radius}
src/game/WallManager.js      ← anillos, patrones, swept collision, near-miss
src/game/LevelSystem.js      ← dificultad, rangos, rotación telegrafiada
src/game/ScoreSystem.js      ← tiempo, récord, near-misses
src/engine/AudioEngine.js    ← síntesis Web Audio + sidechain + SFX
```

## 📐 REGLA #2 — CONTRATO QUE TUS MÓDULOS DEBEN CUMPLIR

`src/main.js` (del núcleo) ya está escrito contra esta API. Tus módulos deben
exponer EXACTAMENTE estos métodos. La mayoría ya los tienes; faltan 3 en
ParticleSystem (marcados con ⚠️ — sin ellos el juego crashea con TypeError):

### Renderer
- `constructor(containerId)` — expone `.scene` (THREE.Scene)
- `updateCenterPolygon(sides, colorHex)` — idealmente cacheado por `sides`
- `setBackgroundColor(colorHex)`
- `triggerScreenShake(intensity)`
- `triggerFovKick(amount)`
- `triggerBgFlash(accentHex, strength)`
- `render(beatPulse, deltaTime, worldRotation, frameMs)`

### ParticleSystem — ⚠️ FALTAN 3 MÉTODOS (crítico)
- `triggerExplosion(x, y, colorHex)` ✓ ya existe
- ⚠️ `triggerShockwave(x, y, colorHex, speed)` — anillo expansivo posicionado en (x, y).
  Puedes implementarlo reutilizando tu shockwave actual:
  ```js
  triggerShockwave(x, y, colorHex, speed = 18) {
    this.shockwaveMesh.position.set(x, y, 0.05);
    this.triggerNearMissShockwave(colorHex);
  }
  ```
- ⚠️ `emitTrailPoint(x, y)` — alias de tu trail:
  ```js
  emitTrailPoint(x, y) { this.addPlayerTrailPoint(x, y, -0.05); }
  ```
- ⚠️ `clearTrail()` — oculta/resetea todos los puntos del trail:
  ```js
  clearTrail() {
    for (let i = 0; i < this.trailCount; i++) {
      this.trailPos[i * 3 + 2] = -999;
      this.trailLife[i] = 0;
    }
    this.trailGeo.attributes.position.needsUpdate = true;
  }
  ```
- `update(deltaTime, speedMultiplier)` ✓
- `setThemeColors(colorHex)` ✓

### PaletteManager
- `update(deltaTime, survivalTime)` ✓ (el núcleo ya pasa ambos)
- `getBlended(channel)` → hex entero para `bg|primary|center|walls|player` ✓
- `getBlendedAccentCss()` → string `#rrggbb` ✓
- `nextPalette()` → nombre string ✓

### HUDManager
Ya converge ✓ — métodos: `updateTimer, updateRank, updateBestScore, syncAccent,
showRankNotification, showNearMiss, showGameOver(finalTime, bestTime, isNewRecord, nearMisses, rankName),
showPause(bool), hideAllOverlays, hideStartOverlay`.
Callbacks del constructor: `{ onStartGame, onToggleAudio, onTogglePalette, onTouchInput }`.

### DOM ids requeridos en index.html
`canvas-container, timer-display, rank-display, best-display, center-message,
message-subtitle, nearmiss-toast, nearmiss-text, start-overlay, gameover-overlay,
pause-overlay, btn-start, btn-retry, btn-audio-toggle, btn-palette-toggle,
record-badge, final-time, final-best, final-nearmiss, final-rank,
touch-controls, touch-left, touch-right`

## 🔄 REGLA #3 — FLUJO
1. Agrega los 3 métodos ⚠️ a ParticleSystem (nada más del núcleo).
2. Trabaja libre en TUS archivos (visuales, HUD, paletas).
3. Cuando termines, deja nota en `docs/prompts/notas.md` con lo que cambiaste.
4. El núcleo verifica en browser después de cada cambio tuyo.
