const arc = (cx, cz, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; });
export default function () {
  const P = [];
  const add = (x, z, w = 21, bank = 0, id = null) => P.push({ x, z, y: 1, w, bank, id });
  add(0, 0, 21, 0, 'start'); add(90, 0); add(190, 0, 21, 0, 'hs'); add(270, -1);
  arc(330, 62, 62, -90, 0, 6).slice(1, 6).forEach(([x, z], i) => add(x, z, 21, 4, i === 2 ? 'clock' : null));
  add(392, 100); add(392, 160, 21, 0, 'xing1'); add(392, 230); add(392, 285);
  arc(352, 340, 40, 0, 90, 6).slice(0, 6).forEach(([x, z], i) => add(x, z, 22, 5, i === 3 ? 'rbt' : null));
  // west leg heading west at z=380: ess between x=300 and x=110
  for (let x = 300; x >= 110; x -= 14) { const t = (300 - x) / 190; add(x, 381 + 24 * Math.sin(t * Math.PI * 2), 21, 0, x === 216 ? 'ess' : null); }
  add(85, 381); add(60, 381, 21, 0, 'bridge'); add(30, 381); add(-40, 381); add(-120, 381); add(-200, 381); add(-290, 381); add(-335, 381);
  arc(-350, 351, 30, 90, 270, 8).slice(1, 8).forEach(([x, z], i) => add(x, z, 20, 0, i === 3 ? 'hair' : null));
  add(-330, 321); add(-300, 321);
  arc(-250, 241, 80, 90, 0, 6).slice(0, 7).forEach(([x, z], i) => add(x, z, 22, -9, i === 3 ? 'sweep' : null));
  // north leg x=-170 with a smooth bulge east
  for (let z = 240 - 12; z > 76; z -= 12) { const t = (240 - z) / 170; add(-170 + 44 * Math.sin(Math.PI * t) ** 2, z, 21, 0, z === 156 ? 'pond' : null); }
  arc(-100, 70, 70, 180, 270, 6).slice(0, 7).forEach(([x, z], i) => add(x, z, 21, 4, i === 3 ? 'top' : null));
  add(-50, 0);
  return P;
}
