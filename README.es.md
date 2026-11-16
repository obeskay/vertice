# VÉRTICE

Un arcade al estilo Super Hexagon para el navegador, sencillo como un botón. Los muros se cierran hacia el centro; guía tu nave por los huecos tanto como aguantes. Un solo modo, sin menús, y la dificultad sube poco a poco mientras más duras.

<p align="center">
  <a href="https://obeskay.github.io/vertice/"><img src="docs/media/vertice-demo.gif" alt="VÉRTICE: una nave naranja orbitando un hexágono oscuro mientras se cierran anillos oscuros sobre un fondo claro" width="560"></a>
</p>

<p align="center">
  <a href="https://obeskay.github.io/vertice/"><b>Juega ahora</b></a> · escritorio y táctil · <a href="README.md">English</a>
</p>

## Correrlo

Sin build ni `npm install`: ES modules nativos y Three.js incluido en `vendor/`.

```bash
git clone https://github.com/obeskay/vertice.git
cd vertice
python3 -m http.server 8089
```

Abre `http://localhost:8089`. GitHub Pages publica `main` tal cual.

## Cómo se juega

- Toca el botón de jugar (o cualquier tecla de giro, `Espacio` o `Enter`) y sobrevive. Tu tiempo es tu marca; el navegador guarda tu mejor tiempo.
- Cada 15 a 30 segundos la partida sube un escalón: los muros van más rápido, el giro es más fuerte y la figura gana lados (6 → 7 → 8 → 10 → 12). Después de unos 105 s sigue subiendo sola, despacio.
- Si pasas a un pelo del borde de un muro suena una nota; encadena esos roces y la nota sube por la escala.
- El muro que te mata se pinta de naranja. Cualquier tecla de giro o un toque empieza otra vez un momento después; dejar una tecla apretada durante el choque nunca reinicia por accidente.
- La música es un arpegio suave en La menor que acelera con la partida. Todos los sonidos, de los roces al choque, usan la misma voz y la misma tonalidad. El botón de la bocina lo silencia y recuerda tu elección.

## Controles

| Entrada | Acción |
|---|---|
| `←` / `→` o `A` / `D` | Girar |
| Mitad izquierda / derecha de la pantalla | Girar (táctil o mouse) |
| `Espacio` / `Enter` / `R` | Jugar / jugar otra vez |
| `Esc` / `P` | Pausa |

## Código

```
index.html, style.css     Un overlay (menú, pausa, resultado), el cronómetro y dos botones
src/main.js               Loop de paso fijo a 240 Hz, entradas y máquina de estados (menu, playing, dying, paused, over)
src/palette.js            Los tres colores: papel, tinta y acento
src/engine/Renderer.js    Escena ortográfica de Three.js: gajos de fondo y polígono central
src/engine/AudioEngine.js Música y efectos con WebAudio, todo con una sola voz de mazo
src/engine/ParticleSystem.js Onda del roce y estallido del choque
src/game/Player.js        Nave en órbita con contraviraje
src/game/WallManager.js   Patrones de anillos, espaciado justo y colisión por barrido
src/game/LevelSystem.js   La rampa de dificultad y los cambios de giro
src/game/ScoreSystem.js   Tiempo de la partida y mejor tiempo
src/ui/HUDManager.js      Estado del DOM del overlay, cronómetro y botón de sonido
```

`docs/prompts/` y `docs/aprendizaje.md` describen versiones anteriores (modos, power-ups, voz, sincronía con música) y se quedan como historia.

## Verificar

```bash
node scripts/check-walls.mjs
```

Revisa los roces, el primer anillo justo, el espaciado de anillos a velocidad baja y alta, los patrones con semilla, los cambios de giro y que la rampa de dificultad nunca baje.

## Licencia

MIT. Juégalo, haz tu fork, compártelo.
