// usage: node .scratch/dump.mjs <module-with-default-def-or-fixtureDef> out.json
import fs from 'node:fs';
const [mod, out] = process.argv.slice(2);
const m = await import(new URL(mod, 'file://' + process.cwd() + '/').href);
const defFn = m.default ?? m.fixtureDef ?? Object.values(m).find((v) => typeof v === 'function');
const def = typeof defFn === 'function' ? defFn() : defFn;
const { Track } = await import('../src/track/Track.js');
const t = new Track(def, { headless: true });
const line = [], L = [], R = [];
const v = new (await import('three')).Vector3();
for (let s = 0; s < t.length; s += 4) {
  t.surfacePoint(s, 0, v); line.push([v.x, v.z]);
  const w = t.widthAt(s) / 2;
  t.surfacePoint(s, -w, v); L.push([v.x, v.z]); t.surfacePoint(s, w, v); R.push([v.x, v.z]);
}
const marks = Object.entries(t.marks).map(([k, s]) => { t.surfacePoint(s, 0, v); return [v.x, v.z, k]; });
const extra = [];
t.checkpointS.forEach((s, i) => { t.surfacePoint(s, 0, v); extra.push([v.x, v.z, 'C' + i]); });
t.itemBoxes.forEach((b, i) => { if (i % 3 === 1) extra.push([b.pos.x, b.pos.z, '', 'y^']); });
t.boostPads.forEach((b) => { t.surfacePoint(b.s, b.lateral, v); extra.push([v.x, v.z, 'boost', 'c>']); });
t.jumpRamps.forEach((r) => extra.push([r.x, r.z, 'ramp', 'm^']));
fs.writeFileSync(out, JSON.stringify({ line, L, R, marks, extra }));
console.log('length', t.length.toFixed(0), 'N', t.model.N);
