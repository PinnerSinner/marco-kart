// Explicit waypoints: {x, z, y, w, bank, id}
const arc = (cx, cz, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; });
export default function () {
  const P = [];
  const add = (x, z, y, w = 22, bank = 0, id = null) => P.push({ x, z, y, w, bank, id });
  add(0, 0, 1, 22, 0, 'start');
  add(130, 2, 1); add(260, -2, 1); add(390, -12, 1, 22, 0, 'kiosks'); add(520, -10, 1); add(640, 6, 1); add(720, 8, 1);
  // east hairpin (left) centre (738,-38) r=46, from angle 90 to -90
  arc(738, -38, 46, 90, -90, 8).slice(1, 8).forEach(([x, z], i) => add(x, z, 1.4 + i * 0.05, 19, 0, i === 3 ? 'hair' : null));
  add(690, -90, 2.4, 20); add(600, -108, 4, 20); add(510, -138, 6.5, 20, 0, 'ess1'); add(430, -182, 9, 20); add(360, -196, 11, 20, 0, 'crest');
  add(290, -170, 12.5, 20); add(220, -186, 13, 20, 0, 'ess2'); add(150, -232, 11.5, 20);
  // west sweeper (left, banked) centre (-40,-115) r=115: angle -90 -> -270
  arc(-40, -115, 115, -90, -270, 10).forEach(([x, z], i) => add(x, z, 11.5 - (i / 10) * 10.5, 22, -13, i === 5 ? 'sweep' : null));
  return P;
}
