# VÉRTICE

![cover](assets/cover.png)

English · [Español](README.es.md)

Hypnotic browser precision arcade. Dual 360°/lane controls, procedural darksynth audio engine with sidechain ducking, 240Hz game loop, and real-time audio reactive osu! sync mode.

Inspired by *Super Hexagon*, redesigned with modern precision mechanics: **fluid 360° orbital physics, a procedural synthesizer with real audio sidechaining, robotic voice synthesis, geometric progression, and live external music synchronization**.

---

## Quickstart (Zero Build Step)

VÉRTICE is built with vanilla ES Modules and Three.js. It requires no bundler, no `npm install`, and runs directly from any local HTTP server:

```bash
# Clone the repository
git clone https://github.com/obeskay/vertice.git
cd vertice

# Serve the folder with any static HTTP server
python3 -m http.server 8089
```

Open `http://localhost:8089` in Chrome, Safari, Firefox, or Edge.

---

## Core Mechanics

### 1. Dual Control Schemes: 360° Arcade & Discrete Lanes

- **Arcade 360° (Default)**: Smooth orbital navigation around the polygon perimeter, featuring dynamic physics-based ship banking and particle thruster trails.
- **Discrete Lanes**: Snap instantly between polygon edges for players who prefer geometric puzzle-style movement.
- **Mouse / Pointer Steering**: 1:1 angular cursor tracking with zero input latency.
- **Mobile Touch**: Left/right split-screen tap zones with two-finger tap for Turbo boost.

### 2. Procedural Darksynth Audio with Sidechain Ducking

- **Custom Web Audio Synthesizer**: Generates dynamic arpeggios, pulsing sub-bass, and punchy 808 kicks natively in code without external audio sample files.
- **Sidechain Ducking**: Every kick drum strike ducks the bass and chord synth channels for punchy electronic compression.
- **Dynamic Low-Pass Filter**: Automatically sweeps filter cutoffs during slow-motion powerups and game-over states.
- **Accelerating BPM**: Music tempo climbs as your run progresses, from each mode's base tempo (120–176 BPM) up to a 240 BPM cap.

### 3. Robotic Voice Announcer

An integrated arcade commentator announces key milestones in real time using the Web Speech API, layered over a synthesized vocoder chime:
`"VÉRTICE... START!"`, rank names (`"TRIÁNGULO"`, `"CUADRADO"`, `"HEXÁGONO"`, `"VÉRTICE"`…), `"ESCUDO"`, `"CALMA"`, `"FLOW COMBO!"`, `"HYPERDRIVE!"`, `"GAME OVER"`, `"NEW RECORD!"`.

### 4. SYNC ♪ (Audio-Reactive osu! Mode)

Click `SYNC ♪` in the main menu to capture tab audio from YouTube, Spotify Web, or SoundCloud via the browser's MediaStream API. The game engine tracks live frequency peaks and synchronizes wall spawning, background pulses, and wall speed to the incoming music's BPM.

---

## Game Modes

| Mode | Speed Ramp | Characteristics |
|---|---|---|
| **NORMAL** | 4.3 → 9.8 | Classic geometric progression from Point to Vértice. Balanced speed curve. |
| **HIPER** | 6.5 → 11.6 | High-velocity reflex testing for experienced pilots. Shorter reaction windows. |
| **EXTREMO** | 8.8 → 13.5 | Relentless speed with unpredictable sudden rotation inversions. |
| **ZEN** | 3.9 → 5.0 | Endless flow state with mortality disabled. Ideal for rhythm warmups. |

---

## Controls

| Key / Input | Action | Behavior |
|---|---|---|
| `←` / `→` or `A` / `D` | Steer | Instantaneous counter-steer torque, zero slippery latency |
| `SPACE` / `S` / `↓` / `R-Click` | **Phase Dash** | Quantum orbital leap with 220ms i-frames (recharged by grazes) |
| `SHIFT` / `W` / `↑` | Turbo | Boost orbital velocity (×1.6 speed) with speed lines |
| **Mouse Cursor** | Direct Tracking | Aim ship directly to cursor angle (Right-click to Dash) |
| **Touch Controls** | Steer & Dash | Left/Right tap zones; Center `DASH` button |
| `ENTER` / `R` | Start / Restart | Instant restart with zero delay |
| `ESC` / `P` | Pause | Open the pause menu |

---

## Power-Ups & Core Mechanics

- **PHASE DASH** (`SPACE` / `S` / `↓` / `R-Click`): Instant quantum burst with 220ms invulnerability frames. Pierces directly through closing walls. 2.8s base cooldown, reduced by **1.0s on every near-miss graze**.
- **HYPERDRIVE COMBO**: Chain consecutive near-misses (`x1 → x2 → x3 → x4 → x5`). Each graze triggers an ascending pentatonic chime (C5 → E6) and raises the combo multiplier (up to ×8). At 5 grazes, activates **HYPERDRIVE**: 2.0s ghost phase, screen shake, and harmonic synth overdrive.
- **GHOST SHIP**: Automatically records your personal best trajectory at 20Hz and projects a translucent holographic shadow ship in real-time.
- **SHIELD** (White Square): Grants one free collision save. Absorbs the impact and crushes nearby walls.
- **CALMA** (Green Triangle): Triggers 3.2 seconds of slow-motion matrix flight accompanied by submerged low-pass audio filtering and heartbeat rhythm.
- **DYNAMIC PATTERNS**: Features rotating **Twister** rings, pulsing **Pulsar** gates, **Double Reflex** and **Corridor** patterns alongside 16 classic patterns.

---

## Architecture & Codebase Overview

The engine utilizes a **240Hz fixed-timestep simulation loop** (`SIM_DT = 1/240`) with sub-pixel interpolated WebGL rendering via Three.js, ensuring collision detection remains deterministic even at extreme rotational velocities.

```
vertice/
├── index.html               Neobrutalist HUD dock, overlays & import map
├── style.css                Space Grotesk typography & high-contrast UI styling
├── assets/
│   └── cover.png            Cover artwork
├── vendor/
│   └── three.module.js      Self-contained Three.js library (offline capable)
└── src/
    ├── main.js              240Hz game loop, input routing & state machine
    ├── engine/
    │   ├── Renderer.js      Three.js scene, camera roll/shake & background slices
    │   ├── ShaderPass.js    Post-processing (chromatic aberration, speed lines, film grain)
    │   ├── AudioEngine.js   Darksynth synth with sidechain ducking & biquad filters
    │   ├── VoiceEngine.js   Robotic arcade speech synthesis
    │   ├── PaletteManager.js Continuous HSL hue drift & high-contrast color roles
    │   ├── MusicSync.js     Live external audio beat tracker for osu! sync mode
    │   └── ParticleSystem.js Thruster trails, shockwaves & explosion fragments
    ├── game/
    │   ├── Player.js        Dual 360°/lane movement physics & banking tilt
    │   ├── WallManager.js   20 rhythmic hazard patterns & swept collision testing
    │   ├── PowerUpManager.js Spawn logic for shields and slow-motion tokens
    │   ├── LevelSystem.js   Rank scaling, polygon stages & organic rotations
    │   └── ScoreSystem.js   Per-mode records, letter grades (S+ to D) & local scores
    └── ui/
        └── HUDManager.js    DOM overlays, settings toggles & leaderboard tables
```

---

## Static Verification

To verify that all local assets, imports, and scripts are intact:

```bash
# Check local static asset integrity
python3 -c "
import os
files = ['index.html', 'style.css', 'vendor/three.module.js', 'src/main.js', 'assets/cover.png']
for f in files:
    assert os.path.exists(f), f'Missing: {f}'
print('All static assets verified successfully.')
"
```

---

## License

MIT. Play it, fork it, share it.
