// Lateral planning for AIDriver: chooses how far to shift off the racing line (a constant offset, + = right) so the kart
// clears other karts, moving obstacles and enemy cables, while still preferring the line and a nearby item box / boost pad.
// It scores a fixed set of candidate offsets, so the result is stable (hysteresis towards the current offset) and never
// needs a search. Runs at 10 Hz per driver; allocation-free after construction.
import { clamp } from '../core/util.js';

const CANDIDATES = [0, 1.5, -1.5, 3, -3, 4.5, -4.5, 6, -6, 7.5, -7.5, 9, -9];
const PREDICT_STEPS = 8;           // hazard prediction: 0.3 s .. 2.4 s ahead
const PREDICT_DT = 0.3;

/**
 * Scratch state kept by each AIDriver (predicted line points for the prediction horizon).
 * @returns {{base:Float64Array,bx:Float64Array,bz:Float64Array,rx:Float64Array,rz:Float64Array,lim:Float64Array,off:Float64Array,pt:{x:number,y:number,z:number}}}
 */
export function makeAvoidScratch() {
  return { base: new Float64Array(CANDIDATES.length), bx: new Float64Array(PREDICT_STEPS), bz: new Float64Array(PREDICT_STEPS), rx: new Float64Array(PREDICT_STEPS), rz: new Float64Array(PREDICT_STEPS),
    lim: new Float64Array(PREDICT_STEPS), off: new Float64Array(PREDICT_STEPS), pt: { x: 0, y: 0, z: 0 } };
}

const PACES = [1, 0.7, 0.45];      // speed fractions considered when a moving hazard cannot be side-stepped

/**
 * Plans the lateral shift (and, when a hazard cannot be side-stepped, a slower pace that lets it pass).
 * Reads `ai.near` (nearby karts: `{d, dP, speed, alongside}` for the first `ai.nearCount`), the race's obstacles / cables and
 * the attractor (`ai.attract`, `ai.attractW`); writes `ai.shiftTarget` and `ai.speedCap`.
 * @param {import('./AIDriver.js').AIDriver} ai
 */
export function planLateral(ai) {
  const T = ai.T, race = ai.race, kart = ai.racer.kart, line = ai.line, sc = ai.avoid;
  const s = kart.ground.s, v = Math.max(kart.speed, 8), w = ai.weight;
  const roomNow = line.at(line.room, s);
  const offNow = w * line.at(line.off, s);
  const clearance = T.clearance - ai.aggression * 0.6;
  // ---- hazards (moving obstacles, enemy cables)
  let nh = 0;
  const hz = ai.hazards;
  for (let i = 0; i < race.obstacleInfo.length && nh < hz.length; i++) {
    const o = race.obstacleInfo[i];
    if (!o.obstacle.active) continue;
    let ds = o.s - s; if (ds < 0) ds += line.length;
    if (ds < 2 || ds > 75) continue;
    const h = hz[nh++];
    h.x = o.obstacle.pos.x; h.z = o.obstacle.pos.z; h.vx = o.vx; h.vz = o.vz; h.r = o.obstacle.radius + 2.4;
  }
  const ents = race.items.entities;
  for (let i = 0; i < ents.length && nh < hz.length; i++) {
    const e = ents[i];
    if (e.type !== 'cable' || e.state !== 'armed' || (e.ownerId === ai.racer.id && e.age < 1.2)) continue;
    const dx = e.pos.x - kart.pos.x, dz = e.pos.z - kart.pos.z;
    if (dx * dx + dz * dz > 3600) continue;
    const h = hz[nh++];
    h.x = e.pos.x; h.z = e.pos.z; h.vx = 0; h.vz = 0; h.r = e.radius + 2.2;
  }
  // ---- candidate scores that do not depend on the pace: road edges, other karts, the line, the attractor
  const base = sc.base;
  for (let c = 0; c < CANDIDATES.length; c++) {
    const x = CANDIDATES[c];
    let cost = 0.35 * Math.abs(x) + 0.55 * Math.abs(x - ai.shift);
    if (ai.attractW > 0) cost += ai.attractW * 1.1 * Math.abs(x - ai.attract);
    const latNow = Math.abs(offNow + x);
    if (latNow > roomNow) cost += 25 + 4 * (latNow - roomNow);
    for (let k = 0; k < ai.nearCount; k++) {
      const o = ai.near[k];
      const over = clearance - Math.abs(x - o.d);
      if (over <= 0) continue;
      cost += o.alongside ? 2.2 * over : 3.2 * over * (1 - o.dP / T.aheadRange);
    }
    base[c] = cost;
  }
  // ---- predicted base path (racing line, no shift) at fixed distances ahead; a slower pace only delays the arrival time
  for (let i = 0; i < PREDICT_STEPS; i++) {
    const sp = s + v * PREDICT_DT * (i + 1);
    const off = w * line.at(line.off, sp);
    line.point(sp, off, sc.pt);
    sc.bx[i] = sc.pt.x; sc.bz[i] = sc.pt.z; sc.off[i] = off;
    sc.rx[i] = line.at(line.rx, sp); sc.rz[i] = line.at(line.rz, sp);
    sc.lim[i] = line.at(line.room, sp);
  }
  let best = 0, bestCost = Infinity, bestPace = 1, bestHazT = 0;
  const paces = nh > 0 ? PACES : PACES.slice(0, 1);
  for (let pi = 0; pi < paces.length; pi++) {
    const f = paces[pi];
    for (let c = 0; c < CANDIDATES.length; c++) {
      const x = CANDIDATES[c];
      let cost = base[c] + (1 - f) * 6;
      for (let i = 0; i < PREDICT_STEPS; i++) {
        const lat = sc.off[i] + x;
        if (Math.abs(lat) > sc.lim[i]) cost += 6 + 3 * (Math.abs(lat) - sc.lim[i]);
      }
      let firstT = 0;
      for (let h = 0; h < nh; h++) {
        const H = hz[h];
        for (let i = 0; i < PREDICT_STEPS; i++) {
          const t = (PREDICT_DT * (i + 1)) / f;
          const lat = clamp(sc.off[i] + x, -sc.lim[i], sc.lim[i]) - sc.off[i];
          const px = sc.bx[i] + sc.rx[i] * lat, pz = sc.bz[i] + sc.rz[i] * lat;
          const dx = px - (H.x + H.vx * t), dz = pz - (H.z + H.vz * t);
          if (dx * dx + dz * dz < H.r * H.r) { cost += 30 / (0.6 + t); if (firstT === 0 || t < firstT) firstT = t; break; }
        }
      }
      if (cost < bestCost) { bestCost = cost; best = x; bestPace = f; bestHazT = firstT; }
    }
  }
  ai.shiftTarget = best;
  // ---- speed cap: follow a blocker we cannot get past; slow down for a hazard we cannot dodge
  let cap = Infinity;
  for (let k = 0; k < ai.nearCount; k++) {
    const o = ai.near[k];
    if (o.alongside || o.dP > 11) continue;
    if (clearance - Math.abs(best - o.d) > 1.0 && o.speed < kart.speed) cap = Math.min(cap, o.speed * 1.03 + 1);
  }
  if (bestPace < 1) cap = Math.min(cap, Math.max(6, v * bestPace));
  else if (bestHazT > 0 && bestHazT < 1.6) cap = Math.min(cap, Math.max(7, v * 0.55));
  ai.speedCap = cap;
}
