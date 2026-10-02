import { turtle } from '../src/track/builders/layout.js';
for (const pre of [-40,-30,-20, 20, 30,40]) for (const R of [30, 40, 60]) {
const t = turtle({ x: 0, z: 0, heading: 0 });
t.straight(240); t.arc(22, 180); t.straight(120); t.arc(50, -40); t.arc(50, 40); t.straight(50); t.arc(45, pre);
try { const p = t.closeLoop(R); console.log(pre, R, JSON.stringify(t.lastClosing), p.closureError.toFixed(2), p.headingError.toFixed(2)); } catch (e) { console.log(pre, R, e.message); }
}
