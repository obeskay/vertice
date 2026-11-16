// One scene per stage of the run: a glyph set and a duotone, the way a music
// visualizer swaps scenes on a drop. The renderer draws the game as data
// (see DATA) and the glyph pass paints it with the current scene.
// pri: the walls (the brightest glyphs lean from here toward white)
// sec: shadows and the faint background dots
// acc: the wall that kills you, and the HUD's live color
const rgb = (hex) => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];

export const SCENES = [
  { glyphs: '·∙•◦○◎●■█',   pri: rgb(0xff6b3d), sec: rgb(0x4a1410), acc: rgb(0xfff1d6) },
  { glyphs: '·:░▒▓█▀▄▌▐',  pri: rgb(0x42d4ff), sec: rgb(0x0b2350), acc: rgb(0xff7a45) },
  { glyphs: '·.:-=+*#%@',  pri: rgb(0xb9f53a), sec: rgb(0x173d0d), acc: rgb(0xff4f8b) },
  { glyphs: '⠁⠂⠃⠇⠏⠟⠿⡿⣿', pri: rgb(0xff4f8b), sec: rgb(0x46103f), acc: rgb(0x48e6ff) },
  { glyphs: '·─│┼╳═║╬▓█',  pri: rgb(0xffc23a), sec: rgb(0x4a2208), acc: rgb(0x6e8bff) },
  { glyphs: '·∴∷※◈◆▲■█',   pri: rgb(0xb18cff), sec: rgb(0x1f0f55), acc: rgb(0xffd23a) }
];

export const SHIP = rgb(0xfff7ec);

// What the scene writes into its render target, read by the glyph pass:
// r = light (glyph density), g = killer wall, b = solid (ship and sparks)
export const DATA = {
  wedge: [0.15, 0.25, 0.2], // alternating background wedges; the odd one out
  center: 0.55,
  wall: 1
};
