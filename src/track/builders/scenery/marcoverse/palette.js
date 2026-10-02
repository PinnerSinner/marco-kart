// Marcoverse palette: brand cyan / hot red / sun yellow from the spec, plus the space neons (violet, magenta, mint).
export const PALETTE = {
  cyan: 0x22d3ee, magenta: 0xff3fb4, violet: 0x8b5cff, red: 0xe63946, yellow: 0xffd166, mint: 0x3dffb0, orange: 0xff8a3d,
  deck: 0x2b3070, deckDark: 0x171a45, void: 0x0a0826,
};

/**
 * Sector colours: every stretch of the ribbon has its own neon so each corner is recognisable. [start s (m), colour, title, strapline].
 * The edge light, dust and tube hoops all follow this table (see neonAt in util.js); a 64 m blend hides each boundary.
 */
export const SECTORS = [
  { s: 0, hex: 0x22d3ee, title: null },
  { s: 118, hex: 0xff3fb4, title: 'PORTAL BEND', sub: 'bridge shortcut on the inside · hit the pads' },
  { s: 340, hex: 0x6f7bff, title: 'THE PLUNGE', sub: 'dive for the dip or fly the viaduct' },
  { s: 700, hex: 0x3dffb0, title: 'TIGHT TWO', sub: 'boost + kicker = overclock warp' },
  { s: 866, hex: 0xff8a3d, title: 'ASTEROID ESSES', sub: 'glitch tiles: catch the lit ones' },
  { s: 1014, hex: 0xe63946, title: 'THE CORKSCREW', sub: 'hold the inside line' },
  { s: 1399, hex: 0xffd166, title: 'AFTERBURN', sub: 'three pads · keep it flat' },
  { s: 1494, hex: 0x9dff3d, title: 'GLITCH CORNER', sub: 'cut the corner if you can time it' },
  { s: 1699, hex: 0xb46bff, title: 'TWIST CHICANE', sub: null },
  { s: 1790, hex: 0xff6bd6, title: 'SWITCHBACKS', sub: 'two hairpins · brake late, boost early' },
  { s: 2159, hex: 0x7fe8ff, title: 'THE TUBE', sub: 'security gates, or take the open skyline' },
  { s: 2417, hex: 0xffb04a, title: 'LAST HAIRPIN', sub: 'tight and banked · then boost for the Leap' },
  { s: 2660, hex: 0xffffff, title: 'THE LEAP', sub: 'mind the gap' },
  { s: 2826, hex: 0x22d3ee, title: null },
];
