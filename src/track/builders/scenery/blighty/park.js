// Blighty green spaces: the town park inside the first half of the circuit, the market square in the hairpin and the hill.
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { noise2, fbm2 } from '../../noise.js';
import { coneTreeGeo } from '../flora.js';
import { stallGeo, fountainGeo, bandstandGeo, benchGeo, binGeo, lampGeo, lanternGeo, buntingGeo } from './props.js';
import { personGeo } from '../people.js';

const inR = (x, z, r, m = 0) => x > r[0] - m && x < r[2] + m && z > r[1] - m && z < r[3] + m;

const _c1 = new THREE.Color(), _c2 = new THREE.Color();
/** Low-poly park tree (~160 tris): trunk + four squashed leaf blobs. */
function parkTreeGeo({ height = 8, crown = 3.9, leaf = [0x2f6f34, 0x5c9440], seed = 1 } = {}) {
  const g = new Geo();
  g.cyl(0.2 * (crown / 3), 0.36 * (crown / 3), height * 0.62, 6, { colour: 0x5b4632, ao: 0.4 });
  for (let k = 0; k < 4; k++) {
    const a = k * 2.4 + seed, r = k === 0 ? 0 : crown * 0.42, y = height * 0.62 + (k === 0 ? crown * 0.5 : crown * (0.15 + 0.22 * (k % 3)));
    _c1.set(leaf[0]).lerp(_c2.set(leaf[1]), (k / 4) * 0.8 + 0.1);
    g.sphere(crown * (k === 0 ? 0.9 : 0.68), { x: Math.cos(a) * r, y, z: Math.sin(a) * r, colour: _c1.clone(), top: _c1.clone().offsetHSL(0, 0, 0.09), ao: 0.5, sy: 0.85 }, 6, 4);
  }
  return g;
}
function shrubGeo(seed = 1) {
  const g = new Geo(), blooms = [0xd94a76, 0xf2c14e, 0xf5f0e6];
  for (let k = 0; k < 3; k++) { const a = k * 2.1 + seed; g.sphere(0.95 - k * 0.12, { x: Math.cos(a) * 0.7 * (k ? 1 : 0), y: 0.1 * k, z: Math.sin(a) * 0.7 * (k ? 1 : 0), colour: _c1.set(0x2f6f34).lerp(_c2.set(0x5c9440), k / 3).clone(), top: _c1.clone().offsetHSL(0, 0, 0.08), ao: 0.5, sy: 0.8 }, 5, 3); }
  g.sphere(0.2, { x: 0.5, y: 1.05, z: 0.1, colour: blooms[seed % 3], ao: 0 }, 4, 3);
  return g;
}

/** Park, hill and market. ctx.market = { x, z, r }: centre and centre-line radius of the market hairpin; ctx.bandstand = { x, z }; ctx.wheel = { x, z } */
export function buildGreens(kit, M, ctx, allowed) {
  const { track, place, rng, statics } = kit;
  const PARK = [-150, 24, 330, 336], HILLR = [-540, 60, -190, 500], canal = ctx.canal;
  const bandstand = ctx.bandstand, fountainPos = { x: ctx.market.x, z: ctx.market.z + 5 };
  const clear = (sp) => !inR(sp.x, sp.z, [canal.x0, canal.z0, canal.x1, canal.z1], 12) && Math.hypot(sp.x - bandstand.x, sp.z - bandstand.z) > 14;

  // ---- trees: clumps and clearings from noise, three species (instanced, wind-swayed)
  const oak = kit.instances(parkTreeGeo({ height: 8, crown: 3.9, seed: 3 }), M.foliage, { cell: 260, name: 'oak', cull: 360 });
  const oak2 = kit.instances(parkTreeGeo({ height: 10.5, crown: 4.8, seed: 7, leaf: [0x2a6a3a, 0x7aa64a] }), M.foliage, { cell: 260, name: 'oak2', cull: 360 });
  const fir = kit.instances(coneTreeGeo({ height: 10, radius: 2.5, leaf: [0x1e5a34, 0x2f7a44] }), M.foliage, { cell: 260, name: 'fir', cull: 360 });
  const shrub = kit.instances(shrubGeo(2), M.foliage, { cell: 260, name: 'shrubs', cull: 170, quality: 'medium' });
  for (const sp of place.scatter({ rect: PARK, minDist: 11, roadMargin: 8, filter: (s) => clear(s) && noise2(s.x * 0.022, s.z * 0.022, 4) > 0.44 && allowedPark(s) })) {
    const k = rng(), set = k < 0.45 ? oak : k < 0.75 ? oak2 : fir;
    set.add(sp.x, sp.y - 0.05, sp.z, { ry: rng.range(0, 6.28), s: rng.range(0.8, 1.3) });
    if (Math.abs(sp.lateral) < track.widthAt(sp.s) / 2 + 12) track.model.addCollider(sp.x, sp.z, 0.6);
  }
  for (const sp of place.scatter({ rect: PARK, minDist: 9, roadMargin: 7, filter: (s) => clear(s) && noise2(s.x * 0.03 + 9, s.z * 0.03, 5) > 0.55 && allowedPark(s) })) shrub.add(sp.x, sp.y, sp.z, { ry: rng.range(0, 6), s: rng.range(0.8, 1.4) });
  // hill: fir woods
  for (const sp of place.scatter({ rect: HILLR, minDist: 12, roadMargin: 12, filter: (s) => fbm2(s.x * 0.02, s.z * 0.02, 6, 3) > 0.5 && s.y > 1.5 })) (rng() < 0.6 ? fir : oak).add(sp.x, sp.y - 0.05, sp.z, { ry: rng.range(0, 6.28), s: rng.range(0.8, 1.4) });
  function allowedPark(s) { return s.surface !== 'water'; }

  // ---- park furniture: bandstand, paths, benches, lamps
  {
    const { x, z } = bandstand, y = track.heightAt(x, z), g = statics.at(M.solid, x, z);
    g.merge(bandstandGeo(), { x, y, z, ry: 0.3 });
    track.model.addCollider(x, z, 5);
    // circular paved apron + paths radiating to the roads
    g.cyl(10.5, 10.6, 0.1, 24, { x, y: y + 0.02, z, colour: 0xa8a69f, ao: 0 });
    const bench = benchGeo(), lamp = lampGeo(), lantern = lanternGeo();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, bx = x + Math.cos(a) * 9, bz = z + Math.sin(a) * 9, by = track.heightAt(bx, bz);
      g.merge(bench, { x: bx, y: by + 0.08, z: bz, ry: -a - Math.PI / 2 });
      if (i % 2 === 0) { const lx = x + Math.cos(a + 0.5) * 11.5, lz = z + Math.sin(a + 0.5) * 11.5, ly = track.heightAt(lx, lz); g.merge(lamp, { x: lx, y: ly, z: lz }); statics.at(M.glow, lx, lz).merge(lantern, { x: lx, y: ly, z: lz }); }
    }
    // a gravel walk from the apron to Park Drive
    const walk = (x0, z0, x1, z1) => {
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 3);
      for (let i = 0; i <= n; i++) { const px = x0 + ((x1 - x0) * i) / n, pz = z0 + ((z1 - z0) * i) / n, py = track.heightAt(px, pz); statics.at(M.solid, px, pz).box(3.6, 0.08, 3.6, { x: px, y: py, z: pz, ry: Math.atan2(x1 - x0, z1 - z0), colour: 0xb9b6ab, ao: 0 }); }
    };
    if (ctx.bandstand.walkTo) walk(x + (ctx.bandstand.walkTo.x - x) * 0.14, z + (ctx.bandstand.walkTo.z - z) * 0.14, ctx.bandstand.walkTo.x, ctx.bandstand.walkTo.z);
  }

  // ---- market square inside the hairpin: a ring of striped stalls round a fountain, bunting, shoppers
  {
    const { x: mx, z: mz } = ctx.market, stalls = [], R = 14;
    const cols = [0xd22f27, 0x1d3a6e, 0x2a7f62, 0xe9b91c, 0x6b3fa0, 0xf08a24];
    for (let k = 0; k < 7; k++) {
      const a = (k / 6) * Math.PI, sx = mx + Math.cos(a) * R, sz = mz + 2 + Math.sin(a) * R * 0.95, sy = track.heightAt(sx, sz);
      statics.at(M.solid, sx, sz).merge(stallGeo(cols[k % cols.length]), { x: sx, y: sy + 0.02, z: sz, ry: -Math.PI / 2 - a * 0 + Math.atan2(mx - sx, mz - sz) + Math.PI / 2 });
      track.model.addCapsule(sx - Math.sin(a) * 1.6, sz + Math.cos(a) * 1.6, sx + Math.sin(a) * 1.6, sz - Math.cos(a) * 1.6, 1.2);
      stalls.push([sx, sz, sy]);
    }
    const fy = track.heightAt(fountainPos.x, fountainPos.z);
    statics.at(M.solid, fountainPos.x, fountainPos.z).merge(fountainGeo(), { x: fountainPos.x, y: fy, z: fountainPos.z });
    track.model.addCollider(fountainPos.x, fountainPos.z, 4.6);
    for (let i = 0; i + 1 < stalls.length; i++) { const a = stalls[i], b = stalls[i + 1]; statics.at(M.cloth, a[0], a[1]).merge(buntingGeo([a[0], a[2] + 3.4, a[1]], [b[0], b[2] + 3.4, b[1]], { sag: 0.7, flag: 0.7 })); }
    const people = kit.batch('market-people', { cell: 300, cull: 240, quality: 'medium', castShadow: false });
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, Math.PI), rr = rng.range(7, 22), px = mx + Math.cos(a) * rr, pz = mz + 2 + Math.sin(a) * rr, sp = place.spotAt(px, pz);
      if (!sp || sp.onRoad || Math.hypot(px - fountainPos.x, pz - fountainPos.z) < 6 || Math.abs(rr - R) < 2) continue;
      const g = personGeo({ shirt: rng.pick([0xc8281f, 0x1d3a6e, 0x2a7f62, 0xe9b91c, 0x6b3fa0, 0xf5f0e6]), legs: 0x22305a, skin: rng.pick([0xf1c27d, 0xd9a066, 0xc68642, 0x8d5524, 0xffdbac]), hair: rng.pick([0x201510, 0x6b4423, 0xc9a227]), arms: rng() < 0.5 ? 'down' : 'wave', phase: rng(), hat: rng() < 0.3 ? 0x1d3a6e : null });
      people.at(M.people, px, pz).merge(g, { x: px, y: sp.y, z: pz, ry: rng.range(0, 6.28) });
    }
  }
  void Geo; void THREE; void binGeo; void allowed;
}
