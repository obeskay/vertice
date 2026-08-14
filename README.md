# VÉRTICE

![cover](assets/cover.png)

Arcade de precisión hipnótico para el browser. Neobrutalista, minimalista,
adictivo. Inspirado por Super Hexagon, con identidad propia: **controles fluidos a 360°, sintetizador de voz robótica arcade, progresión poligonal y sincronía musical en vivo**.

**Jugar local:**
```bash
python3 -m http.server 8089
# abre http://localhost:8089
```

## Características Principales

### 1. Control Dual: Arcade 360° & Carriles
- **ARCADE FLUIDO (Predeterminado)**: Movimiento orbital continuo a 360° ultra-rápido, con inclinación física de la nave (banking) y estelas de propulsión.
- **CARRILES DISCRETOS**: Salto preciso entre sectores del polígono para los amantes del puzzle geométrico.
- **MOUSE / PUNTERO**: Seguimiento angular 1:1 quirúrgico sin retardo.

### 2. Sintetizador de Voz Robótica Arcade
Locutor arcade integrado que anuncia en tiempo real:
`"BEGIN!"`, `"TRIÁNGULO!"`, `"CUADRADO!"`, `"HEXÁGONO!"`, `"VÉRTICE!"`, `"GAME OVER!"`, `"NEW RECORD!"`, `"ESCUDO!"`, `"SLOW MOTION!"`.

### 3. 4 Modos de Juego
| Modo | Velocidad | Descripción |
|---|---|---|
| **NORMAL** | 4.2 → 9.4 | Progresión clásica de Punto a Vértice. |
| **HIPER** | 6.2 → 11.0 | Desafío de alta velocidad para pilotos experimentados. |
| **EXTREMO** | 8.5 → 12.8 | Velocidad implacable y reversas impredecibles. |
| **ZEN** | 3.8 → 4.8 | Modo flujo infinito sin muerte para calentar y relajarse. |

### 4. Banda Sonora Darksynth con Sidechain Real
- Síntesis de bombo 808 potente con efecto *sidechain ducking* en acordes y bajos.
- Barridos dinámicos de filtro Low-Pass en cámara lenta y Game Over.
- Aceleración continua de BPM (145 → 220+ BPM).

### 5. Cámara Dinámica & 3D Neobrutalista
- *Camera Roll / Banking* dinámico ante giros e inversiones.
- Fondos de gajos hipnóticos alternados en contratono.
- 14 patrones rítmicos de muros (Spirals, Gauntlet, Cannon, Chevron, Slalom, etc.).
- Shader post-procesado con aberración cromática, speed lines en turbo y grano de película.

## Controles

- `←` / `→` o `A` / `D`: girar / mover
- `SHIFT` / `W` / `↑`: **TURBO** (velocidad ×1.6)
- **Mouse**: apunta directamente en órbita
- **Móvil**: toca izquierda/derecha, dos dedos = turbo
- `ESPACIO` / `ENTER` / `R`: empezar/reiniciar
- `ESC` / `P`: pausa

## Power-ups y Combos

- **ESCUDO** (cuadrado blanco): una muerte gratis, aplasta los muros cercanos
- **CALMA** (triángulo verde): cámara lenta 3.2s con filtro de audio sumergido
- **FLOW**: encadena 3 rozes (near-miss) y gana 1.5s de invulnerabilidad

## SYNC ♪ (Modo osu!)

Pulsa `SYNC ♪`, comparte una pestaña con audio (YouTube, Spotify web) y el juego sincronizará el spawn de muros y el pulso visual al BPM detectado en tiempo real.

## Estructura

```
src/
  main.js                Orquestador: game loop 240Hz, input, estados
  engine/
    Renderer.js          Cámara con banking, gajos de fondo, centro poligonal, shake/FOV
    ShaderPass.js        Post-procesado WebGL (aberración cromática, speed lines, grain)
    AudioEngine.js       Sintetizador Darksynth con sidechain ducking y filtros dinámicos
    VoiceEngine.js       Locutor robótico arcade (Web Speech API + synth fallback)
    PaletteManager.js    Deriva suave de hue HSL y contraste alto
    MusicSync.js         Beat tracking externo para modo osu!
    ParticleSystem.js    Estelas, ondas expansivas hexagonales y explosiones
  game/
    Player.js            Control arcade 360° / carriles, banking tilt, jet thruster
    WallManager.js       14 patrones rítmicos, swept collision, near-misses
    PowerUpManager.js    Orbes en los huecos de los anillos
    LevelSystem.js       Modos de juego, progresión de rangos y rotación orgánica
    ScoreSystem.js       Récords independientes por modo, calificaciones y leaderboard
  ui/
    HUDManager.js        HUD Neobrutalista, selector de modos, toggles y tablas
```

## Licencia

MIT. Juégalo, rómpelo, compártelo.
