import { Track } from '../src/track/Track.js';
import { fixtureDef } from '../test/tracks_fixture.js';
const def = fixtureDef();
console.log('closure', def.points.closureError.toFixed(2), 'heading err', def.points.headingError.toFixed(2));
const t0 = performance.now();
const t = new Track(def, { headless: true });
console.log('built in', (performance.now()-t0).toFixed(1), 'ms; length', t.length.toFixed(1), 'N', t.model.N, 'layered', t.model.layered);
const out = {};
let worst = 0;
for (let s = 0; s < t.length; s += 1.7) for (const lat of [-8, -3, 0, 5, 8.5]) {
  const sm = t.sample(s);
  const p = t.surfacePoint(s, lat, new (sm.pos.constructor)());
  t.query(p, out);
  let ds = Math.abs(t.sDiff(s, out.s)); const dl = Math.abs(out.lateral - lat);
  const dh = Math.abs(out.height - p.y);
  worst = Math.max(worst, ds, dl);
  if (ds > 0.02 || dl > 0.02 || dh > 0.02) { console.log('MISMATCH', s.toFixed(1), lat, out.s.toFixed(3), out.lateral.toFixed(3), out.height.toFixed(3), p.y.toFixed(3), out.surface); break; }
}
console.log('worst', worst);
let minR = 1e9; for (let i=0;i<t.model.N;i++) minR = Math.min(minR, 1/Math.abs(t.model.cl.kappa[i]+1e-9));
console.log('min radius', minR.toFixed(1));
// perf
const p = t.sample(300).pos.clone(); const hint = 300;
let t1 = performance.now(); let n = 0;
for (let k = 0; k < 400000; k++) { const s = (k * 0.5) % t.length; t.surfacePoint(s, ((k*7)%13)-6, p); t.query(p, out, s); n++; }
let dt = performance.now() - t1; console.log('hinted q/s', (n/dt*1000/1000).toFixed(0), 'k (incl surfacePoint)');
t1 = performance.now(); n=0;
for (let k = 0; k < 400000; k++) { const s = (k * 0.5) % t.length; t.surfacePoint(s, ((k*7)%13)-6, p); t.query(p, out); n++; }
dt = performance.now() - t1; console.log('unhinted q/s', (n/dt*1000/1000).toFixed(0), 'k');
