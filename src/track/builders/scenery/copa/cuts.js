// Copacabana forks. Pure gameplay data (works headless): platforms (ribbon road, decks, kickers, pads), the declared shortcuts and the
// static goal-post obstacles. The dressing that draws them lives in ./setpieces.js (buildPitch, buildLines).
//
//   FORK 1 Beach boardwalk (s @forkA..@forkB, ~420 m)  the spline sweeps north round the kiosk plaza (a fast, wide, banked-looking arc); a full-width
//                                                      timber boardwalk runs STRAIGHT along the sand with a light weave round the lifeguard towers and
//                                                      three kickers, each landing on a boost pad. The boardwalk is a RibbonRoad (builders/branch.js).
//   FORK 2 The pitch (east hairpin)                    a 22 m turf pitch across the inside of the hairpin. Grass is slow, the corners at both ends are
//                                                      ~80 and ~100 degrees, the goal mouths carry a boost pad: risk and reward.
import { deckBetween } from '../routeGeom.js';
import { makeRibbon } from '../../branch.js';

const FLAT = { sideBevel: 0.4, startBevel: 0.4, endBevel: 0.4 };

export function copaCuts(G) {
  const ramps = [], obstacles = [], zones = [], shortcuts = [], boostPads = [];
  const out = { ramps, obstacles, zones, shortcuts, boostPads, pitch: null, beach: null };

  // ---------------------------------------------------------------- FORK 1: the beach boardwalk (a ribbon road beside the spline's sweep)
  {
    const A = G.at('@forkA-50'), B = G.at('@forkB+50'), dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, rx = -uz, rz = ux;
    const prof = [[0, 0], [0.1, 0], [0.27, 5], [0.43, -5], [0.6, 5.5], [0.76, -4], [0.9, 0], [1, 0]];     // a light weave: round the lifeguard towers
    const ctrl = prof.map(([u, l]) => ({ x: A.x + dx * u + rx * l, z: A.z + dz * u + rz * l, y: A.y + (B.y - A.y) * u, w: 20 }));
    const rb = makeRibbon({ pts: ctrl });
    out.beach = { rb, ctrl, A, B, kickers: [] };
    const q = {};
    [0.35, 0.515, 0.68].forEach((f, k) => {
      const u = rb.total * f, p = rb.at(u, q), yaw = p.yaw;
      ramps.push({ id: `beach-kick${k + 1}`, kind: 'ramp', x: p.x, z: p.z, yaw, length: 11, width: 9, y0: p.y, y1: p.y + 1.9 });
      const pd = rb.at(u + 24, {});
      ramps.push({ id: `beach-pad${k + 1}`, kind: 'pad', surface: 'boost', road: true, x: pd.x, z: pd.z, yaw: pd.yaw, length: 10, width: 6, y0: pd.y + 0.04, y1: pd.y + 0.04, ...FLAT });
      out.beach.kickers.push({ u, x: p.x, z: p.z, yaw });
    });
    for (const u of [rb.total * 0.2, rb.total * 0.85]) {                        // two plain pads on the straights keep the line fast
      const pd = rb.at(u, {});
      ramps.push({ id: `beach-boost${Math.round(u)}`, kind: 'pad', surface: 'boost', road: true, x: pd.x, z: pd.z, yaw: pd.yaw, length: 12, width: 6, y0: pd.y + 0.04, y1: pd.y + 0.04, ...FLAT });
    }
  }

  // ---------------------------------------------------------------- FORK 2: the pitch across the hairpin
  {
    const A = G.at('@hairIn-22', -12), B = G.at('@hair1+14', -12);
    const tr = G.track(), deck = deckBetween(A, B, { width: 22, y0: tr.heightAt(A.x, A.z) + 0.06, y1: tr.heightAt(B.x, B.z) + 0.06 });   // flush with the ground at both ends: no launch ramp off the verge
    const pf = { id: 'pitch', kind: 'deck', surface: 'grass', road: false, curve: 1, startBevel: 1.2, endBevel: 3, sideBevel: 1.2, ...deck };
    ramps.push(pf);
    // boost pads in the goal mouths (turf level at that distance along the pitch)
    const top = (u) => pf.y0 + (pf.y1 - pf.y0) * (u / pf.length);
    const fx = Math.sin(pf.yaw), fz = Math.cos(pf.yaw);
    const pad = (u, id) => ramps.push({ id, kind: 'pad', surface: 'boost', x: pf.x + fx * u, z: pf.z + fz * u, yaw: pf.yaw, length: 10, width: 6, y0: top(u), y1: top(u + 10), curve: 1, ...FLAT });
    pad(pf.length * 0.5 - 5, 'pitch-boost');
    // goal posts (4 bump obstacles) at each end: thread the goal mouth (7.3 m wide) or lose speed
    const r = [-Math.cos(pf.yaw), Math.sin(pf.yaw)];
    const goalAt = (u) => [-1, 1].map((k) => ({ x: pf.x + fx * u + r[0] * 3.65 * k, z: pf.z + fz * u + r[1] * 3.65 * k }));
    for (const u of [8, pf.length - 8]) for (const p of goalAt(u)) obstacles.push({ kind: 'post', x: p.x, z: p.z, radius: 0.6, hit: 'bump' });
    out.pitch = { ...pf, fx, fz, rx: r[0], rz: r[1], top };
    shortcuts.push({ from: '@hairIn-30', to: '@hair1+30', id: 'pitch-cut' });
  }
  return out;
}
