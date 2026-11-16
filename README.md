# VÉRTICE

A Super Hexagon-style arcade for the browser, one-button simple. Walls close in on the center; steer your ship through the gaps for as long as you can. The whole screen is drawn in glyphs that grow on calm areas and shrink on the walls, the soundtrack drives the run, and every stage change lands on a drop.

<p align="center">
  <a href="https://obeskay.github.io/vertice/"><img src="docs/media/vertice-demo.gif" alt="VÉRTICE: a white ship circling the center while rings of glyphs close in, the colors and glyphs changing at each stage" width="480"></a>
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

- Tap the play button (or press any steer key, `Space` or `Enter`) and survive. Your time is your score; your best is kept in the browser. On the first screen a short animation shows the controls: the arrow keys on desktop, the two halves of the screen on touch.
- The run is one song in six stages, each a whole number of bars. It opens on a slow, still square to learn the keys. Every 15 to 30 seconds the last bar builds up (riser, the kick drops out, a snare roll before the big drops) and the next stage opens on a drop: a new glyph set and color field sweep out from the center, the tempo climbs (128 → 170 bpm), walls get faster, the spin gets stronger and the shape gains sides (4 → 6 → 7 → 8 → 10 → 12). After about 105 s it keeps creeping up on its own.
- The glyphs go from angular to round as the shape gains sides: the polygon keeps reaching for a circle it never becomes. The result screen draws the shape you reached.
- The world spins, snaps into reverse on a downbeat, pulses on every beat and leans further into perspective with each stage, with a dolly zoom on each drop. A thin bar under the timer fills toward the next drop.
- Pass a hair from a wall edge and it chimes; chain those near misses and the note climbs the scale.
- The wall that kills you lights up in the stage's accent and the song winds down like a stopped tape. Any steer key or a tap starts again a moment later; holding a key through the crash never restarts by accident.
- The soundtrack is synthesized live with WebAudio in D Dorian, one layer per stage: pad and kick, then hats, claps and an FM pluck, a rolling bass, a lead hook, open hats, and a darker progression before the last stage. A filter opens as the run climbs, grazes open it for a moment, and a crash resolves into a major chord in a hall reverb. The speaker button mutes it and remembers your choice. Reduced-motion settings drop the tilt and zoom and soften the pulse and spin.

## Controls

| Input | Action |
|---|---|
| `←` / `→` or `A` / `D` | Steer |
| Left / right half of the screen | Steer (touch or mouse) |
| `Space` / `Enter` / `R` | Play / play again |
| `Esc` / `P` | Pause |

## Install and embed

The game is a PWA: on a phone, "Add to Home Screen" installs it full screen, and after one visit it plays offline (`sw.js`, network first with a cache fallback; bump `CACHE` when the file list changes).

`?embed=1` runs it inside another page: the wordmark and the sound button hide, there is no service worker, and the two pages talk with `postMessage`, only to each other (the parent's origin comes from `location.ancestorOrigins`, else from `document.referrer`; a parent with no web origin gets the normal game, sound button included). Opened outside a frame, `?embed=1` is the normal game.

| Direction | Message |
|---|---|
| Game → page | `{ source: 'vertice', type: 'ready' }` once, as soon as the first frame is on screen (fade the frame in on it), then `{ source: 'vertice', type: 'state', state, time, best }` on every change (`menu`, `playing`, `paused`, `over`) |
| Page → game | `{ source: 'vertice-host', type: 'play' }`, `{ ..., type: 'pause' }`, `{ ..., type: 'mute', on: true \| false }`, `{ ..., type: 'scroll', y }` (the section's scroll progress, 0 to 1: on the waiting screens the world turns with it, one symmetry step per pass; ignored during a run and under reduced motion) |

```html
<iframe src="https://obeskay.github.io/vertice/?embed=1" allow="autoplay" title="Vértice"></iframe>
```

## Code

```
index.html, style.css     One overlay (menu, pause, result), the timer and two buttons
src/main.js               240 Hz fixed-step loop, input, state machine (menu, playing, dying, paused, over)
src/palette.js            One glyph set and color field per stage
src/engine/Renderer.js    The game drawn as data, then a full-screen glyph pass with variable cell size: scene sweeps, beat pulse, perspective lean
src/engine/AudioEngine.js The soundtrack (FM voices, generated reverb) and sound effects, scheduled from the run clock
src/engine/ParticleSystem.js Graze ripple and crash burst
src/game/Player.js        Orbiting ship with counter-steer
src/game/WallManager.js   Ring patterns, fair spacing and swept collision
src/game/LevelSystem.js   The stages, the song clock (bars and 16ths) and the rotation flips
src/game/ScoreSystem.js   Run time and best time
src/ui/HUDManager.js      DOM state for the overlay, timer, sound button and the result shape
src/ui/hint.js            The how-to-play animation (Rive runtime vendored in vendor/rive/, file in assets/hint.riv)
rive/hint/                The hint's source: build.py writes scene.rml, `rive rive/hint --once` compiles it (copy build/hint.riv to assets/)
sw.js, manifest.webmanifest, icons/   Install and offline
```

`docs/prompts/` and `docs/aprendizaje.md` describe earlier versions (modes, power-ups, voice, music sync) and are kept as history.

## Verify

```bash
node scripts/check-walls.mjs
```

Checks grazes, the fair first ring, ring spacing at low and high speed, seeded patterns, rotation flips, that the difficulty ramp never goes down and that every stage sits on the song's bar grid.

## License

MIT. Play it, fork it, share it.
