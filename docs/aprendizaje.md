# Lo que aprendí construyendo un videojuego con IAs

*Cómo modelos como Kimi K3 convierten una tarde de ideas en un juego real, verificado y publicado.*

---

VÉRTICE empezó como un clon roto de Super Hexagon en mi localhost y terminó, en una
sola sesión, como un juego con identidad propia: mecánica de carriles, power-ups,
sincronía musical en vivo y publicación open source. No lo prohíbe ningún estudio.
Lo hicimos un humano con criterio y agentes de IA con herramientas. Esto es lo que
aprendí del proceso.

## 1. El humano dirige, la IA ejecuta (y esa división es el superpoder)

Las tres mejores ideas del juego no salieron de un modelo:

- "El fondo debería dividirse en gajos como en Super Hexagon"
- "Cuando somos una línea solo deberíamos movernos en dos posiciones; triángulo, tres"
- "Me da epilepsia, bájenle"

Eso es dirección creativa pura: gusto, referencias, y el cuerpo diciendo "esto se
siente mal". Ningún modelo lo genera solo. Lo que sí hizo la IA, en minutos:

- Convertir "línea = 2 posiciones" en un sistema de carriles con easing ease-out,
  auto-repeat de input y snap angular a 0.0015 radianes.
- Traducir "me da epilepsia" en tres fixes medibles: hue shift de 22°/s a 6°/s,
  pulso de FOV de 5.5 a 1.8, flash de fondo de 0.055 a 0.02.
- Reescribir las colisiones como barrido radial con arco real (adiós tunelaje,
  adiós muertes injustas).

El ciclo era: yo sentía algo jugando, lo decía mal y con typos, y la IA lo
convertía en matemáticas correctas. Esa traducción de "queja difusa" a "parámetro
exacto" es donde el modelo brilla.

## 2. Dos agentes coordinándose por un archivo markdown

En un punto hubo dos agentes editando el mismo repo a la vez (uno de núcleo de
juego, otro de presentación). La solución no fue mágica: fue ingeniería social de
agentes. Creamos `docs/prompts/coordinacion-agentes.md` con la frontera de
archivos de cada quien y `notas.md` como changelog entre agentes, con contratos
de API explícitos ("Player expone getHitbox()", "LevelSystem.update recibe
(survivalTime, deltaTime)").

Cuando un agente cambió el orden de los argumentos de LevelSystem, el otro lo
detectó en verificación, no en producción. Lección: los agentes multi-IA fallan
como equipos humanos (interfaces, no lógica), y se arreglan igual: contratos
escritos y tests que los ejercitan.

## 3. Verificar en el browser real cambia la especie del código

La diferencia entre "código que parece correcto" y "código que es correcto" fue
una consola de browser. El agente no escribió las colisiones y las declaró
buenas: ejecutó 7 tests empíricos contra el juego corriendo (morir en sector
bloqueado, sobrevivir a 0.01 rad del muro, tunelaje imposible, near-miss
disparando). El BPM detector se probó inyectando kicks sintéticos a 120 y 174 BPM
y reportó 115 y 176. El "funciona" siempre vino con número.

Modelos como Kimi K3 hacen esto posible porque no solo escriben código: operan
herramientas. Leen archivos, patchean, recargan el browser, evalúan JavaScript en
la página, miden draw calls. El loop completo de un game dev junior, pero en
segundos y sin ego.

## 4. El contexto largo es el estudio entero en la cabeza

Un juego chico son ~3,000 líneas repartidas en 15 archivos con contratos entre
ellos. Kimi K3 mantuvo en contexto el sistema completo: quién llama a quién, qué
archivo es de qué agente, qué bug ya se arregló y dónde. Cuando pedí "que el
centro cambie de forma con el nivel", el cambio tocó Renderer, LevelSystem,
Player y main de forma consistente, sin romper el adaptador de partículas que
existía por un conflicto anterior. Esa memoria de trabajo gigante es lo que
convierte prompts sueltos en refactors coherentes.

## 5. Lo que la IA no hizo (y probablemente no debería)

- La idea de los carriles. La estética de los gajos. Decidir que el juego
  "estaba listo".
- El nombre, la paleta inicial, el tono del HUD.
- Saber que un juego se siente bien. Eso se siente en las manos, no se infiere.

La IA tampoco se cansó, ni se encariñó con su código. Cuando tiramos a la basura
el sistema de colisiones completo dos veces, no hubo resistencia. Eso, cualquier
dev sabe, vale oro.

## 6. El aprendizaje que me llevo

Desarrollar videojuegos con IAs tipo Kimi K3 no es "pedirle un juego a ChatGPT".
Es dirigir un equipo que escribe a velocidad de conversación, verifica todo
empíricamente y nunca duerme, mientras tú aportas lo único que no se puede
descargar: criterio, referencias y la honestidad de decir "esto se siente mal".

El resultado es open source: [github.com/obeskay/vertice](https://github.com/obeskay/vertice).
Juégalo, rómpelo, y si algo se siente mal, dile a tu agente. Ahora sabes lo que
puede hacer con esa frase.

---

*VÉRTICE fue construido en una sesión con Hermes Agent (Kimi K3) + un segundo
agente de presentación, coordinados por markdown. El log real de coordinación
está en `docs/prompts/` del repo.*
