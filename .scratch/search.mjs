import { turtle } from '../src/track/builders/layout.js';
import { Centerline } from '../src/track/builders/Centerline.js';
import { makeRng } from '../src/core/util.js';
const rng = makeRng(5);
function build(p) {
  const t = turtle({ x: 0, z: 0, heading: 90, y: 1, w: 22 });
  t.straight(p.A, {}, 60);
  t.arc(34, -180);
  t.straight(p.b0);
  for (const [r, a] of p.ess) { t.arc(r, a); }
  t.straight(p.b1);
  return t;
}
let best = null, ok = 0, okLen = 0;
for (let it = 0; it < 20000; it++) {
  const nE = rng.int(2, 6), ess = [];
  let sum = 0;
  for (let k = 0; k < nE; k++) { const a = rng.range(25, 55) * (k % 2 ? -1 : 1); ess.push([rng.range(55, 90), a]); }
  const p = { A: rng.range(400, 650), b0: rng.range(40, 120), ess, b1: rng.range(0, 200) };
  const t = build(p);
  const R = rng.range(70, 110);
  let pts;
  try { pts = t.closeLoop(R); } catch { continue; }
  ok++; const cl = t.lastClosing; if (cl.L1 < 0 || cl.L2 < 0) continue;
  // length and separation
  let len = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; len += Math.hypot(a.x - b.x, a.z - b.z); }
  okLen++; (globalThis.lens ??= []).push(Math.round(len)); if (len < 1900 || len > 2600) continue;
  const cl2 = new Centerline(pts, { spacing: 6 }); const N = cl2.N; let minSep = 1e9;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const ds = Math.min(j - i, N - (j - i)) * cl2.ds; if (ds < 300) continue;
    const d = Math.hypot(cl2.x[i] - cl2.x[j], cl2.z[i] - cl2.z[j]); if (d < minSep) minSep = d;
  }
  (globalThis.seps ??= []).push(Math.round(minSep)); if (minSep < 95) continue;
  const score = minSep + Math.min(len, 2300) * 0.02;
  if (!best || score > best.score) best = { score, p, R, cl, len, minSep, nE };
}
console.log(globalThis.seps?.join(','), ok, okLen, globalThis.lens?.slice(0,30).join(','), JSON.stringify(best, null, 1));
