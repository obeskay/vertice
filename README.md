# VÉRTICE

A Super Hexagon-style arcade for the browser, one-button simple. Walls close in on the center; steer your ship through the gaps for as long as you can. The whole screen is drawn in glyphs, the soundtrack drives the run, and every stage change lands on a drop.

<p align="center">
  <a href="https://obeskay.github.io/vertice/"><img src="docs/media/vertice-demo.gif" alt="VÉRTICE: a white ship circling the center while rings of glyphs close in, the colors and glyphs changing at each stage" width="560"></a>
</p>

<p align="center">
  <a href="https://obeskay.github.io/vertice/"><b>Play it now</b></a> · desktop and touch · <a href="README.es.md">Español</a>
</p>

## Run it

No build step and no `npm install`: vanilla ES modules plus a vendored Three.js.

```bash
git clone https://github.com/obeskay/vertice.git
cd vertice
python3 -m http.server 8089
```

Open `http://localhost:8089`. GitHub Pages serves `main` as is.

## How it plays

- Tap the play button (or press any steer key, `Space` or `Enter`) and survive. Your time is your score; your best is kept in the browser.
- The run is one song in six stages, each a whole number of bars. Every 15 to 30 seconds the last bar builds up (riser, snare roll, the kick drops out) and the next stage opens on a drop: a new glyph set and colors sweep out from the center, the tempo climbs (128 → 170 bpm), walls get faster, the spin gets stronger and the shape gains sides (6 → 7 → 8 → 10 → 12). After about 105 s it keeps creeping up on its own.
- The world spins hard, snaps into reverse on a downbeat, pulses on every beat and leans in 3D as the stages climb. A thin bar under the timer fills toward the next drop.
- Pass a hair from a wall edge and it chimes; chain those near misses and the note climbs the scale.
- The wall that kills you lights up in the stage's accent and the song winds down like a stopped tape. Any steer key or a tap starts again a moment later; holding a key through the crash never restarts by accident.
- The soundtrack is synthesized live with WebAudio: kick, rolling bass, claps, a 16th-note arp and a lead hook join as the run goes. The speaker button mutes it and remembers your choice. Reduced-motion settings drop the tilt and zoom and soften the pulse and spin.

## Controls

| Input | Action |
|---|---|
| `←` / `→` or `A` / `D` | Steer |
| Left / right half of the screen | Steer (touch or mouse) |
| `Space` / `Enter` / `R` | Play / play again |
| `Esc` / `P` | Pause |

## Code

```
index.html, style.css     One overlay (menu, pause, result), the timer and two buttons
src/main.js               240 Hz fixed-step loop, input, state machine (menu, playing, dying, paused, over)
src/palette.js            One glyph set and duotone per stage
src/engine/Renderer.js    The game drawn as data, then a full-screen glyph pass: scene sweeps, beat pulse, tilt
src/engine/AudioEngine.js The soundtrack and sound effects, scheduled from the run clock
src/engine/ParticleSystem.js Graze ripple and crash burst
src/game/Player.js        Orbiting ship with counter-steer
src/game/WallManager.js   Ring patterns, fair spacing and swept collision
src/game/LevelSystem.js   The stages, the song clock (bars and 16ths) and the rotation flips
src/game/ScoreSystem.js   Run time and best time
src/ui/HUDManager.js      DOM state for the overlay, timer and sound button
```

`docs/prompts/` and `docs/aprendizaje.md` describe earlier versions (modes, power-ups, voice, music sync) and are kept as history.

## Verify

```bash
node scripts/check-walls.mjs
```

Checks grazes, the fair first ring, ring spacing at low and high speed, seeded patterns, rotation flips, that the difficulty ramp never goes down and that every stage sits on the song's bar grid.

## License

MIT. Play it, fork it, share it.
