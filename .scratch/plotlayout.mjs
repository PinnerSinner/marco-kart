// usage: node .scratch/plotlayout.mjs <layout module exporting default () => turtle> out.png
import fs from 'node:fs'; import { execSync } from 'node:child_process';
const [mod, out] = process.argv.slice(2);
const m = await import(new URL(mod, 'file://' + process.cwd() + '/').href);
const t = m.default();
let pts = t.raw(), note = '';
try { pts = t.closeLoop(m.closeRadius ?? 50, m.closeProps ?? {}); note = JSON.stringify(t.lastClosing); } catch (e) { note = e.message; pts.push(pts[0]); }
console.log(note, 'pose', JSON.stringify(t.pose()));
const line = pts.map((p) => [p.x, p.z]); if (line.length) line.push(line[0]);
const marks = pts.filter((p) => p.id).map((p) => [p.x, p.z, p.id]);
fs.writeFileSync('.scratch/lp.json', JSON.stringify({ line, marks, extra: [] }));
execSync(`python3 .scratch/plot.py .scratch/lp.json ${out}`);
