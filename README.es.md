# VÉRTICE

Un arcade al estilo Super Hexagon para el navegador, sencillo como un botón. Los muros se cierran hacia el centro; guía tu nave por los huecos tanto como aguantes. Toda la pantalla se dibuja con glifos que crecen en las zonas tranquilas y se encogen en los muros, el soundtrack lleva la partida y cada cambio de etapa cae en un drop.

<p align="center">
  <a href="https://obeskay.github.io/vertice/"><img src="docs/media/vertice-demo.gif" alt="VÉRTICE: una nave blanca orbitando el centro mientras se cierran anillos de glifos; los colores y los glifos cambian en cada etapa" width="480"></a>
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

- Toca el botón de jugar (o cualquier tecla de giro, `Espacio` o `Enter`) y sobrevive. Tu tiempo es tu marca; el navegador guarda tu mejor tiempo. En la primera pantalla una animación corta enseña los controles: las flechas en escritorio, las dos mitades de la pantalla en táctil.
- La partida es una sola canción en seis etapas, cada una con compases completos. Abre con un cuadrado lento y sin voltearse para aprender las teclas. Cada 15 a 30 segundos el último compás sube la tensión (barrido, se va el bombo, un redoble antes de los drops grandes) y la siguiente etapa abre con un drop: un juego de glifos y un campo de color nuevos salen desde el centro, el tempo sube (128 → 170 bpm), los muros van más rápido, el giro es más fuerte y la figura gana lados (4 → 6 → 7 → 8 → 10 → 12). Después de unos 105 s sigue subiendo sola, despacio.
- Los glifos pasan de angulosos a redondos conforme la figura gana lados: el polígono persigue un círculo que nunca alcanza. La pantalla de resultado dibuja la figura a la que llegaste.
- El mundo gira, se voltea de golpe en un tiempo fuerte, late con cada pulso y se inclina más en perspectiva con cada etapa, con un dolly zoom en cada drop. Una barra delgada bajo el cronómetro se llena hacia el siguiente drop.
- Si pasas a un pelo del borde de un muro suena una nota; encadena esos roces y la nota sube por la escala.
- El muro que te mata se enciende con el acento de la etapa y la canción se frena como cinta detenida. Cualquier tecla de giro o un toque empieza otra vez un momento después; dejar una tecla apretada durante el choque nunca reinicia por accidente.
- El soundtrack se sintetiza en vivo con WebAudio en Re dórico, una capa por etapa: pad y bombo, luego hats, palmas y un pluck FM, un bajo corrido, un gancho de lead, hats abiertos y una progresión más oscura antes de la última etapa. Un filtro se abre conforme sube la partida, los roces lo abren un instante y el choque resuelve en un acorde mayor dentro de una reverb de sala. El botón de la bocina lo silencia y recuerda tu elección. Con movimiento reducido se quitan la inclinación y el zoom, y el pulso y el giro se suavizan.

## Controles

| Entrada | Acción |
|---|---|
| `←` / `→` o `A` / `D` | Girar |
| Mitad izquierda / derecha de la pantalla | Girar (táctil o mouse) |
| `Espacio` / `Enter` / `R` | Jugar / jugar otra vez |
| `Esc` / `P` | Pausa |

## Instalar e incrustar

El juego es una PWA: en el teléfono, «Agregar a inicio» lo instala a pantalla completa y, tras una visita, se juega sin conexión (`sw.js`, primero la red y la caché de respaldo; sube `CACHE` cuando cambie la lista de archivos).

`?embed=1` lo corre dentro de otra página: se ocultan la marca y el botón de sonido, no hay service worker y las dos páginas hablan con `postMessage`, solo entre ellas (el origen del padre sale de `location.ancestorOrigins` o, si no, de `document.referrer`; un padre sin origen web recibe el juego normal, con su botón de sonido). Abierto fuera de un marco, `?embed=1` es el juego normal.

| Sentido | Mensaje |
|---|---|
| Juego → página | `{ source: 'vertice', type: 'ready' }` una vez y luego `{ source: 'vertice', type: 'state', state, time, best }` en cada cambio (`menu`, `playing`, `paused`, `over`) |
| Página → juego | `{ source: 'vertice-host', type: 'play' }`, `{ ..., type: 'pause' }`, `{ ..., type: 'mute', on: true \| false }` |

```html
<iframe src="https://obeskay.github.io/vertice/?embed=1" allow="autoplay" title="Vértice"></iframe>
```

## Código

```
index.html, style.css     Un overlay (menú, pausa, resultado), el cronómetro y dos botones
src/main.js               Loop de paso fijo a 240 Hz, entradas y máquina de estados (menu, playing, dying, paused, over)
src/palette.js            Un juego de glifos y un campo de color por etapa
src/engine/Renderer.js    El juego dibujado como datos y luego un pase de glifos de tamaño variable a pantalla completa: barridos de escena, pulso, inclinación en perspectiva
src/engine/AudioEngine.js El soundtrack (voces FM, reverb generada) y los efectos, programados desde el reloj de la partida
src/engine/ParticleSystem.js Onda del roce y estallido del choque
src/game/Player.js        Nave en órbita con contraviraje
src/game/WallManager.js   Patrones de anillos, espaciado justo y colisión por barrido
src/game/LevelSystem.js   Las etapas, el reloj de la canción (compases y semicorcheas) y los cambios de giro
src/game/ScoreSystem.js   Tiempo de la partida y mejor tiempo
src/ui/HUDManager.js      Estado del DOM del overlay, cronómetro, botón de sonido y figura del resultado
src/ui/hint.js            La animación de cómo jugar (runtime de Rive en vendor/rive/, archivo en assets/hint.riv)
rive/hint/                Fuente de la animación: build.py escribe scene.rml, `rive rive/hint --once` lo compila (copia build/hint.riv a assets/)
sw.js, manifest.webmanifest, icons/   Instalar y jugar sin conexión
```

`docs/prompts/` y `docs/aprendizaje.md` describen versiones anteriores (modos, power-ups, voz, sincronía con música) y se quedan como historia.

## Verificar

```bash
node scripts/check-walls.mjs
```

Revisa los roces, el primer anillo justo, el espaciado de anillos a velocidad baja y alta, los patrones con semilla, los cambios de giro, que la rampa de dificultad nunca baje y que cada etapa caiga en la rejilla de compases de la canción.

## Licencia

MIT. Juégalo, haz tu fork, compártelo.
