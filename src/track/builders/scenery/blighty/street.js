// Blighty street life: lamp posts, pillar and phone boxes, bus shelters, Belisha beacons, bunting across the high street,
// pedestrians with umbrellas, roadworks and rows of backdrop trees.
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { personGeo } from '../people.js';
import { roundTreeGeo } from '../flora.js';
import { lampGeo, lanternGeo, phoneBoxGeo, pillarBoxGeo, busStopGeo, binGeo, bollardGeo, beaconGeo, beaconGlobeGeo, buntingGeo, benchGeo } from './props.js';

const UMBRELLAS = [0x1a1c22, 0x1a1c22, 0x1d3a6e, 0xc8281f, 0x2a7f62, 0xe9b91c, 0x6b3fa0, 0xf15bb5];
const COATS = [0x2b3a55, 0x6b2b2b, 0x2f4f3e, 0x8a7a55, 0x3a3a3a, 0xa04a2a, 0x4a3a6b, 0xd9c26a];

function brollyGeo(rng, umbrella) {
  const g = personGeo({ shirt: rng.pick(COATS), legs: rng.pick([0x22305a, 0x202020, 0x3a3a48]), skin: rng.pick([0xf1c27d, 0xd9a066, 0xc68642, 0x8d5524, 0xffdbac]), hair: rng.pick([0x201510, 0x6b4423, 0xc9a227, 0x999999]), arms: 'down', s: rng.range(0.92, 1.08), phase: rng(), dress: rng() < 0.3 });
  const c = new THREE.Color(umbrella), seg = 8;
  const hgt = 2.05, r = 0.62;
  g.cyl(0.02, 0.02, 0.6, 4, { y: 1.5, x: 0.22, colour: 0x2a2d34, ao: 0 });
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, k = i % 2 ? 1 : 0.88;
    const top = g.vert(0.22, hgt + 0.32, 0, 0, 1, 0, 0, 0, c.r * k, c.g * k, c.b * k);
    const n0 = g.vert(0.22 + Math.cos(a0) * r, hgt, Math.sin(a0) * r, Math.cos(a0) * 0.5, 0.86, Math.sin(a0) * 0.5, 0, 0, c.r * k * 0.8, c.g * k * 0.8, c.b * k * 0.8);
    const n1 = g.vert(0.22 + Math.cos(a1) * r, hgt, Math.sin(a1) * r, Math.cos(a1) * 0.5, 0.86, Math.sin(a1) * 0.5, 0, 0, c.r * k * 0.8, c.g * k * 0.8, c.b * k * 0.8);
    g.tri(top, n1, n0);
  }
  // phase channel for the (subtle) walk bob
  const P = g.pos, U = g.uv, ph = rng(); for (let i = 0; i < P.length / 3; i++) { U[i * 2] = ph; U[i * 2 + 1] = Math.min(1, Math.max(0, P[i * 3 + 1] / 2.4)); }
  return g;
}

/**
 * @param {object} kit @param {object} M materials @param {(s:number,side:number)=>boolean} allowed street-side filter (false inside garages, bridge...)
 */
export function buildStreet(kit, M, ctx, allowed) {
  const { track, place, rng, statics } = kit, L = track.length;
  const S = (m) => track.S(m);
  const ok = (sp) => allowed(sp.s, sp.side) && !inCanalZone(ctx, sp.x, sp.z);

  // ---- lamp posts (instanced) + glowing lanterns, both sides
  const lamps = kit.instances(lampGeo(), M.solid, { cell: 300, name: 'lamps', cull: 300 });
  const lanterns = kit.instances(lanternGeo(), M.glow, { cell: 300, name: 'lanterns', castShadow: false, receiveShadow: false, cull: 300 });
  const lampSpots = place.along({ from: 12, to: L - 12, every: 34, side: 'both', offset: 2.3, filter: ok });
  for (const sp of lampSpots) { lamps.add(sp.x, sp.y, sp.z, {}); lanterns.add(sp.x, sp.y, sp.z, {}); }

  // ---- kerbside furniture (single geometry each, merged into the solid batch)
  const pillar = pillarBoxGeo(), phone = phoneBoxGeo(), stop = busStopGeo(), bin = binGeo(), bollard = bollardGeo(), bench = benchGeo();
  const at = (m, side, off, extra = 0) => { const s = S(m) + extra; const q = track.sample(s), lat = side * (q.width / 2 + off); const sp = place.spotAt(q.pos.x + q.right.x * lat, q.pos.z + q.right.z * lat); return sp; };
  const put = (geo, sp, o = {}) => { if (sp && !sp.onRoad) statics.at(M.solid, sp.x, sp.z).merge(geo, { x: sp.x, y: sp.y, z: sp.z, ry: sp.yaw + (o.turn ?? 0), s: o.s }); return sp; };
  const furniture = [
    ['@rb4+70', -1, 3.2, pillar], ['@es1+40', 1, 3.2, phone], ['@es1-30', -1, 3.6, phone], ['@es2-50', 1, 3.2, pillar], ['@c1-140', -1, 3.2, pillar], ['@c2+70', -1, 3.4, phone],
    ['@hair+150', -1, 3.4, pillar], ['@hill1-40', -1, 3.2, phone], ['@es1+90', -1, 3.0, bin], ['@es2-90', 1, 3.0, bin], ['@rb4+100', 1, 3.0, bin], ['@c2+95', 1, 3.0, bin],
  ];
  for (const [m, side, off, geo] of furniture) { const sp = at(m, side, off); if (sp && allowed(sp.s, sp.side)) put(geo, sp); }
  // bus shelters (front faces the road)
  for (const [m, side] of [['@rb4+120', -1], ['@es1+10', 1], ['@es2-30', -1], ['@c1-40', -1], ['@c2+50', 1], ['@hill2+80', -1]]) {
    const sp = at(m, side, 4.0); if (sp && !sp.onRoad && allowed(sp.s, sp.side)) put(stop, sp, { turn: side > 0 ? 0 : 0 });
  }
  // benches + bins along the park side of the start straight
  for (const sp of place.along({ from: 60, to: '@c1-30', every: 46, side: 'right', offset: 3.2, filter: ok })) put(bench, sp);
  for (const sp of place.along({ from: 40, to: '@c1-40', every: 90, side: 'right', offset: 3.0, filter: ok })) put(bin, sp);
  // zebra crossings: Belisha beacons + bollards (globes glow)
  const beacon = beaconGeo(), globe = kit.instances(beaconGlobeGeo(), M.glow, { cell: 300, name: 'globes', castShadow: false, receiveShadow: false });
  for (const m of ['@j1-25', '@j1+25', '@j2-25', '@j2+25']) for (const side of [-1, 1]) {
    const sp = at(m, side, 2.2); if (!sp || sp.onRoad) continue;
    statics.at(M.solid, sp.x, sp.z).merge(beacon, { x: sp.x, y: sp.y, z: sp.z }); globe.add(sp.x, sp.y, sp.z, {});
    statics.at(M.solid, sp.x, sp.z).merge(bollard, { x: sp.x, y: sp.y, z: sp.z + 0.0 });
  }

  // ---- bunting across the high street
  {
    const cloth = statics, sm = {}, out = [];
    const a = S('@rb4+30'), b = S('@es2+30');
    for (let s = a; s < b; s += 34) {
      track.sample(s, sm); const half = sm.width / 2 + 2.3;
      const pl = place.spotAt(sm.pos.x - sm.right.x * half, sm.pos.z - sm.right.z * half), pr = place.spotAt(sm.pos.x + sm.right.x * half, sm.pos.z + sm.right.z * half);
      if (!pl || !pr) continue;
      out.push([[pl.x, pl.y + 5.8, pl.z], [pr.x, pr.y + 5.8, pr.z]]);
    }
    for (const [p, q] of out) cloth.at(M.cloth, p[0], p[2]).merge(buntingGeo(p, q, { sag: 1.6 }));
  }

  // ---- pedestrians with umbrellas on the pavements (walking bob is subtle)
  {
    const people = kit.batch('people', { cell: 300, cull: 260, quality: 'medium', castShadow: false });
    const spots = [
      ...place.along({ from: '@rb4+20', to: '@es2+40', every: 13, side: 'both', offset: 3.1, jitterAlong: 5, jitterOffset: 0.7, chance: 0.55, filter: ok }),
      ...place.along({ from: '@c2+60', to: '@hair-10', every: 40, side: 'left', offset: 3.0, jitterAlong: 8, chance: 0.5, filter: ok }),
    ];
    for (const sp of spots) {
      const g = brollyGeo(rng, rng.pick(UMBRELLAS)), face = sp.along + (rng() < 0.5 ? 0 : Math.PI) + rng.range(-0.25, 0.25);
      people.at(M.people, sp.x, sp.z).merge(g, { x: sp.x, y: sp.y, z: sp.z, ry: face });
    }
  }

  // ---- roadworks around the crest ramp: striped barriers + cones each side
  {
    const barrier = new Geo(); barrier.box(0.12, 1.0, 0.12, { x: -1.4, colour: 0x2a2d34, ao: 0 }); barrier.box(0.12, 1.0, 0.12, { x: 1.4, colour: 0x2a2d34, ao: 0 });
    for (let i = 0; i < 6; i++) barrier.box(0.5, 0.22, 0.05, { x: -1.25 + i * 0.5, y: 0.7, colour: i % 2 ? 0xf5f5f0 : 0xd22f27, ao: 0 });
    barrier.box(3.2, 0.06, 0.06, { y: 0.98, colour: 0x2a2d34, ao: 0 });
    const cone = new Geo().cone(0.22, 0.65, 8, { colour: 0xf08a24, ao: 0.1 }).cyl(0.19, 0.2, 0.1, 8, { y: 0.28, colour: 0xf5f5f0, ao: 0 }).box(0.5, 0.04, 0.5, { colour: 0x22252b, ao: 0 });
    const q = track.sample(S('@crest+12'));
    void q;
    for (const side of [-1, 1]) for (let k = -1; k <= 3; k++) {
      const sm = track.sample(S('@crest+12') + k * 8), lat = side * (7.6), x = sm.pos.x + sm.right.x * lat, z = sm.pos.z + sm.right.z * lat, sp = place.spotAt(x, z);
      if (!sp) continue;
      statics.at(M.solid, x, z).merge(barrier, { x, y: sp.y, z, ry: Math.atan2(sm.tangent.x, sm.tangent.z) + Math.PI / 2 });
    }
    const cones = kit.instances(cone, M.solid, { cell: 300, name: 'cones', cull: 200 });
    for (let k = -30; k <= 46; k += 4) for (const side of [-1, 1]) {
      const sm = track.sample(S('@crest+12') + k), lat = side * (5.9 + (k > -8 && k < 34 ? 0 : 0)), sp = place.spotAt(sm.pos.x + sm.right.x * lat, sm.pos.z + sm.right.z * lat);
      if (sp) cones.add(sp.x, sp.y, sp.z, {});
    }
  }
}

function inCanalZone(ctx, x, z) { const c = ctx.canal; return x > c.x0 - 3 && x < c.x1 + 3 && z > c.z0 - 3 && z < c.z1 + 3; }
export { roundTreeGeo };

/** Shiny puddle decals: one per `water` patch (the slippery ones) plus small decorative pools along the kerbs. */
export function buildPuddles(kit, M, allowed) {
  const { track, rng } = kit, paint = kit.paint({ lift: 0.05, material: M.puddle });
  const blob = (sc, lc, hs, hl, seed) => {
    const pts = [], n = 22;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, w = 1 + 0.13 * Math.sin(3 * a + seed) + 0.08 * Math.sin(5 * a + seed * 2.3);
      pts.push([sc + Math.cos(a) * hs * w, lc + Math.sin(a) * hl * w]);
    }
    paint.poly(pts, 0x27374a);
    const inner = pts.map(([s, l]) => [sc + (s - sc) * 0.62, lc + (l - lc) * 0.62]);
    paint.poly(inner, 0x1c2a3a, 0.056);
  };
  for (const p of track.model.patches) if (p.kind === 'water') blob(p.sc, p.lc, p.hs * 0.94, p.hl * 0.94, p.sc * 0.37);
  const L = track.length;
  for (let s = 20; s < L - 20; s += rng.range(14, 30)) {
    if (!allowed(s, 1) && !allowed(s, -1)) continue;
    const side = rng() < 0.5 ? -1 : 1, hw = track.widthAt(s) / 2;
    blob(s, side * (hw - rng.range(0.6, 2.6)), rng.range(1.6, 4.2), rng.range(0.7, 1.5), rng.range(0, 6));
  }
}
