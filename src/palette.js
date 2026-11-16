// One scene per stage of the run: a glyph set and a soft color field, swapped
// on each drop. The glyphs go from angular to round as the shape gains sides:
// the polygon keeps reaching for a circle it never becomes.
// bg: the page; field (fa, fb): two soft blobs that tint every glyph, turning
// with the world; ink: what the brightest glyphs (the walls) lean toward;
// acc: the wall that kills you, and the HUD's live color.
const rgb = (hex) => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
const scene = (glyphs, bg, ink, fa, fb, acc) =>
  ({ glyphs, bg: rgb(bg), ink: rgb(ink), fa: rgb(fa), fb: rgb(fb), acc: rgb(acc) });

export const SCENES = [
  scene('.:-=+*#%@',  0x0b1410, 0xb8f5c8, 0x3e9a6c, 0x2f7f8a, 0xffb454), // phosphor
  scene('·.+┼╬▒▓█',   0x0a1230, 0xdce8ff, 0x4f7bff, 0x8a6bff, 0xff5a3c), // blueprint
  scene('·░▒▓█',      0x1a0d12, 0xffd9d0, 0xe0445a, 0xff8f5a, 0x7ce0c3), // tulip
  scene('⠁⠃⠇⠏⠟⠿⡿⣿',   0x140d05, 0xffe6b5, 0xff9a2e, 0xd9482b, 0x6fd3ff), // sodium
  scene('·∘○◍◉●',     0x0f0a1f, 0xeadfff, 0x8b5cff, 0x3fa9ff, 0xd8ff5a), // violet
  scene('·∙•◦○◯●',    0x061016, 0xe8faff, 0x48c9e8, 0xff6fb5, 0xfff05a)  // ice
];

export const SHIP = rgb(0xfff7ec);

// What the scene writes into its render target, read by the glyph pass:
// r = light (glyph density), g = killer wall, b = solid (ship and sparks)
export const DATA = {
  wedge: [0.15, 0.25, 0.2], // alternating background wedges; the odd one out
  center: 0.55,
  wall: 1
};
