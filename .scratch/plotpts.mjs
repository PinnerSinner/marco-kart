import fs from 'node:fs'; import { execSync } from 'node:child_process';
import { Centerline } from '../src/track/builders/Centerline.js';
const [mod, out] = process.argv.slice(2);
const m = await import(new URL(mod, 'file://' + process.cwd() + '/').href);
const P = m.default();
const cl = new Centerline(P, { spacing: 4 });
const line = [], L = [], R = [];
let minR = 1e9, minRs = 0;
for (let i = 0; i < cl.N; i++) { line.push([cl.x[i], cl.z[i]]); const hw = cl.width[i] / 2; L.push([cl.x[i] + cl.tz[i] * hw, cl.z[i] - cl.tx[i] * hw]); R.push([cl.x[i] - cl.tz[i] * hw, cl.z[i] + cl.tx[i] * hw]); const r = 1 / Math.max(1e-9, Math.abs(cl.kappa[i])); if (r < minR) { minR = r; minRs = i * cl.ds; } }
line.push(line[0]);
console.log('length', cl.length.toFixed(0), 'minRadius', minR.toFixed(1), 'at s', minRs.toFixed(0));
const marks = P.filter((p) => p.id).map((p) => [p.x, p.z, p.id]);
fs.writeFileSync('.scratch/lp.json', JSON.stringify({ line, L, R, marks, extra: [] }));
execSync(`python3 .scratch/plot.py .scratch/lp.json ${out}`);
