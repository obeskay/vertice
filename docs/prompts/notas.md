# NOTAS entre agentes — VÉRTICE

## 2026-07-31 — Hermes (núcleo)

Cambios del núcleo ya en disco (archivos de Hermes, NO tocar):
- `src/game/Player.js` — interpolación + hitbox generoso {angle, halfArc, bottom, top, radius} + anillo de escudo.
- `src/game/WallManager.js` — swept band collision, near-miss garantido al cruzar, `ghostTime`, `crushNearbyWalls()`, hook `onRingSpawned`, `ring.gaps`.
- `src/game/PowerUpManager.js` — NUEVO. Orbes ESCUDO/CALMA montados en gaps. Wireado en main.js.
- `src/game/LevelSystem.js` — onda sutil de velocidad (±10%) + reversas telegrafiadas.
- `src/main.js` — shield/calma, `body.playing` class, adaptadores de ParticleSystem.

Toqué archivos de presentación (sorry, eran fixes críticos de colisión/perf):
- `src/engine/Renderer.js` — `updateCenterPolygon(sides, color, outlineColor)` ahora cachea geometría por lados (antes reconstruía cada frame = GC churn). Contorno de acento estilo Super Hexagon. `triggerBgFlash` ya funciona (flash al beat).
- `style.css` — HUD mínimo estilo Super Hexagon: jugando solo se ve el tiempo chiquito arriba a la derecha (`body.playing`).
- `src/engine/AudioEngine.js` — agregué `playPowerUp(type)` y `playShieldBreak()` al final; tu código intacto.

Pendiente tuyo (presentación):
- ParticleSystem sigue sin `triggerShockwave(x,y,color,speed)`, `emitTrailPoint(x,y)`, `clearTrail()`. main.js tiene adaptadores con fallback, así que nada crashea, pero el trail y los shockwaves posicionados se verían mejor con la API completa (ver coordinacion-agentes.md).

## 2026-07-31 (2ª pasada) — Hermes

Pedido de Obed: anti-epilepsia, sin círculos, turbo, más precisión.
- `Player.js`: rampa de velocidad (~40ms), TURBO (Shift/W/↑, ×1.55), pointer steer proporcional, escudo HEXAGONAL.
- `main.js`: mouse steer (compensa rotación del mundo), turbo, combo FLOW (3 rozes = 1.5s ghost), flash de fondo bajado a 0.02.
- `LevelSystem.js`: curva más amable (4.0 base, onda ±10%).
- `PowerUpManager.js`: CALMA ahora es TRIÁNGULO (adiós círculos).
- Toqué de presentación: `PaletteManager.js` hueSpeed 22→6 (era el estrobo principal), `Renderer.js` pulso de FOV/beat 5.5→1.8 y zSurge 0.4→0.15, `ParticleSystem.js` shockwave ahora hexagonal (6 segs), `HUDManager.js` onTouchInput ahora pasa (dir, pointerCount), `index.html` hint de controles con SHIFT/mouse.

## 2026-07-31 (3ª pasada) — Hermes

Pedido de Obed: muros poligonales (no círculos) + sync con música externa estilo osu!.
- `WallManager.js`: sectores ahora TRAPEZOIDES rectos (4 vértices) — el túnel sigue la forma del nivel. `update()` acepta `suppressSpawn` y nuevo `spawnNow(sides)` para spawn gobernado por beat.
- NUEVO `src/engine/MusicSync.js` (mío): captura audio de pestaña (getDisplayMedia), beat tracking por energía de bombo 40–190Hz con umbral adaptativo, BPM por mediana de intervalos, `getBeatPhase()`, `getSpeedMultiplier()`. `connectSource(node)` permite test sin permisos.
- `main.js`: `onToggleSync`, spawn cuantizado a beats (cada N beats según densidad), velocidad × BPM, beatPulse desde sync cuando está activo.
- `index.html` + `HUDManager.js` (tuyos, parche mínimo): botón `btn-sync-toggle`, pill `sync-pill`/`bpm-display`, `updateBpm(bpm)`.
- `style.css`: `.sync-pill` (acento), `.dock-pill.hidden`, `best-pill` reemplaza el selector :last-child.
- Verificado: BPM 115 (real 120) y 176 (real 174) con señal sintética; spawn cuantizado OK; trapecio confirmado (36 vértices extruidos). OJO: en este browser de test el AudioContext queda suspended sin gesto real — en el navegador de Obed funciona con el click del botón.

## 2026-07-31 (4ª pasada) — Hermes: CARRILES + GAJOS

Pedido de Obed (refs Super Hexagon + /impeccable): el nivel define las posiciones de movimiento.
- `Player.js`: MOVIMIENTO POR CARRILES. `setLanes(n)`, `queueLaneMove(dir)`, mouse → carril más cercano. Ease proporcional (stiffness 18, turbo 30), snap final a 0.0015 rad.
- `LevelSystem.js`: ranks = lados (PUNTO/LÍNEA=2, TRIÁNGULO=3, CUADRADO=4, PENTÁGONO=5, HEXÁGONO=6, VÉRTICE=8). **FIRMA: `update(survivalTime, deltaTime)`** (la versión en disco es del otro agente con ese orden — main.js la respeta, NO cambiar).
- `main.js`: input discreto (flanco = 1 salto; hold → auto-repeat tras 170ms cada 105ms), `player.setLanes()` al cambiar sides, `updateWedges()` en applyPaletteTheme.
- `Renderer.js` (del otro agente, parches míos): GAJOS — `updateWedges(sides, colorA, colorB)` cacheado por lados, contra-rotación 0.38x (parallax), pulso al beat 1.2%, cámara más plana (0,-2.1,7.7), centro = BARRA cuando sides<3.
- `PaletteManager.js`: `wedgeA`/`wedgeB` (dos tonos profundos del hue), player blanco tintado (nunca #fff puro).
- `WallManager.js`: patrones filtrados por sides (≤3 solo 1-gap), GUARDIA anti-anillo-cerrado.
- `index.html`/`style.css`: dock split — RANK+RÉCORD arriba-izq, TIME+BPM+ROZE arriba-der, visible y chiquito jugando.
- Verificado: progresión 2→3→4 carriles/lados/gajos, colisiones con 2 lados, snap de carril, mouse→carril, 14 draw calls, 0 errores.
