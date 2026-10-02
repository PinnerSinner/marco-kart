// Copacabana set-pieces: one memorable thing per sector. Everything draws through the kit (statics / instances) and is skipped headless
// except the obstacles (goal posts, carnival floats) and colliders. Called from scenery/copacabana.js dressCopacabana().
//
//   wave arch (s 110)      mosaic wave gateway over the start straight
//   parade  (s 292, 428)   carnival floats crossing the promenade on a fixed cycle (timed gate)
//   traffic                trio-eléctrico floats on the sweep and the hill, a Rio bus past the tunnel, kombis on the esses: ALL rampable from behind
//   beach boardwalk        the straight timber road of fork 1 (ribbon): kerb stripes, rope posts, towers
//   tunnel                 the descent tunnel after the ridge esses
//   pitch   (hairpin)      the turf shortcut: lines, goals, floodlights, stands, corner flags
//   escadaria (crest)      tiled staircase climbing the favela hill
//   stands  (sweeper)      sambodromo grandstands full of crowd
//   bondinho (hairpin)     a low cable car passing over the hairpin apex
//   tide                   the sea rises and falls, foam lines wash up the beach
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { personGeo, addPerson } from '../people.js';
import { customTexture } from '../../textures.js';
import { addRibbon } from '../../branch.js';
import { addTraffic, cityBusGeo, kombiGeo, trioGeo } from '../hazards/traffic.js';

const MOSAIC = [0xe63946, 0xffd166, 0x2ec4b6, 0x3a86ff, 0xff9f1c, 0xf15bb5, 0x9ef01a, 0xffffff, 0x8338ec, 0x06d6a0];
const PLUMES = [0xe63946, 0xffd166, 0x2ec4b6, 0xf15bb5, 0x3a86ff, 0xff9f1c];
const WHITE = 0xf5f2ea, BLACK = 0x1b1d24;

// ------------------------------------------------------------------------------------------------------------------ carnival float
function floatGeo(a, b, c) {
  const g = new Geo();
  g.box(5.0, 0.9, 12.6, { y: 0.55, colour: 0x2a2f3a, ao: 0.3 });                         // chassis
  for (const z of [-4.2, 4.2]) for (const x of [-2.5, 2.5]) g.cyl(0.62, 0.62, 0.5, 8, { x, y: 0.62, z, rz: Math.PI / 2, colour: 0x14151a, ao: 0 });
  g.box(5.6, 0.34, 13.2, { y: 1.42, colour: a, ao: 0.1, top: c });                      // stage deck
  for (let i = 0; i < 9; i++) g.box(5.7, 0.5, 1.3, { y: 1.05, z: -5.6 + i * 1.4, colour: i % 2 ? b : c, ao: 0 });   // skirt stripes
  g.box(4.2, 1.9, 8.6, { y: 1.76, z: -1.2, colour: b, ao: 0.2, top: a });                // tier 1
  g.box(3.0, 1.7, 5.0, { y: 3.66, z: -1.2, colour: c, ao: 0.2, top: b });                // tier 2
  g.cyl(0.05, 0.05, 2.2, 5, { y: 5.3, z: -1.2, colour: 0xd0d0d0, ao: 0 });
  g.sphere(1.25, { y: 7.1, z: -1.2, colour: 0xffc233, ao: 0 }, 10, 7);                    // giant sun
  for (let k = 0; k < 14; k++) { const t = (k / 14) * Math.PI * 2; g.beam([Math.cos(t) * 1.3, 7.1 + Math.sin(t) * 1.3, -1.2], [Math.cos(t) * 2.5, 7.1 + Math.sin(t) * 2.5, -1.2], 0.24, 4, { colour: PLUMES[k % 6], rTop: 0.05 }); }
  for (const [x, z] of [[-2.5, 5.5], [2.5, 5.5], [-2.5, -6.2], [2.5, -6.2]]) for (let k = 0; k < 5; k++) g.beam([x, 1.6, z], [x + (k - 2) * 0.55, 4.6 + (k % 2) * 0.5, z + (x > 0 ? 0.3 : -0.3)], 0.2, 4, { colour: PLUMES[(k + (z > 0 ? 1 : 3)) % 6], rTop: 0.03 });   // feather plumes
  g.box(2.0, 0.8, 1.6, { y: 1.9, z: 5.8, colour: 0x1b6ca8, ao: 0.2 });                   // drum riser at the front
  for (const [x, z, s] of [[-1.7, 4.2, 0xe63946], [1.7, 4.2, 0xffd166], [-1.8, -4.4, 0x2ec4b6], [1.8, -4.4, 0xf15bb5], [0, 1.6, 0xffffff], [-1.2, -1.4, 0x8338ec], [1.2, -1.4, 0xff9f1c]]) {
    g.merge(personGeo({ shirt: s, legs: s, arms: 'up', dress: true, phase: 0.3, hat: PLUMES[Math.abs(Math.round(z * 3)) % 6] }), { x, y: 1.6, z, ry: x > 0 ? 0.4 : -0.4 });
  }
  for (const x of [-1, 1]) g.merge(personGeo({ shirt: 0xffffff, legs: 0x111111, arms: 'up', drum: true, phase: 0.6 }), { x: x * 0.8, y: 2.3, z: 5.9, ry: Math.PI });
  return g;
}

// ------------------------------------------------------------------------------------------------------------------ the parade + traffic
export function buildParade(kit, M, G) {
  const { obstacles } = kit, at = (s, l) => { const p = G.at(s, l); return [p.x, p.z]; };
  const palettes = [[0xe63946, 0x2ec4b6, 0xffd166], [0x8338ec, 0xffd166, 0xf15bb5], [0x3a86ff, 0xff9f1c, 0xffffff]];
  const mat = kit.headless ? null : kit.mat.vertex({ roughness: 0.6 }, 'floatmat');
  const mk = (i) => (kit.headless ? undefined : () => { const m = new THREE.Mesh(floatGeo(...palettes[i % 3]).build(), mat); m.castShadow = true; m.name = 'float'; return m; });
  // crossing floats: north plaza <-> beach across the whole road, ~2.5 s occupied per 16 s cycle, phase-staggered so lap 1 and lap 2 differ (side-on: timing hazards, not rampable)
  const crossings = [{ s: 292, from: -46, to: 58, phase: 3 }, { s: 428, from: 46, to: -48, phase: 9 }];
  crossings.forEach((c, i) => {
    obstacles.path({ id: `float-x${i}`, kind: 'float', points: [at(c.s, c.from), at(c.s, c.to)], speed: 12, mode: 'cross', wait: 8.5, phase: c.phase, length: 12.6, radius: 2.7, hit: 'spin', mesh: mk(i) });
  });
  // ---- rampable traffic (need-for-speed style: hit the tail ramp fast and lined up, fly over the roof, land beyond). Same direction as the race.
  const T = (o) => addTraffic(kit, G, { kind: 'float', hit: 'bump', ...o });
  const trio = (i) => () => trioGeo(...palettes[i % 3]);
  // the sweep round the kiosk plaza (fork 1, spline route): a convoy of two trio floats
  [0, 1].forEach((i) => T({ id: `trio-sweep${i}`, from: '@forkA+25', to: '@forkB-25', lat: i ? -4.6 : 4.6, speed: 9.5, phase: i * 15, wait: 3, geo: trio(i), length: 12, width: 3.2, height: 3.1, run: 6.5, merge: 24 }));
  // up the favela hill: two floats crawling the switchbacks, a lap apart
  [0, 1].forEach((i) => T({ id: `trio-hill${i}`, from: '@hair1+75', to: '@leg2+40', lat: 4.8, speed: 8.2, phase: i * 24, wait: 3, geo: trio(i + 1), length: 12, width: 3.2, height: 3.1, run: 6.5, merge: 22 }));
  // past the tunnel: a Rio city bus pulling away from the portal
  T({ id: 'bus-tunnel', kind: 'bus', from: '@tunB-30', to: '@sweep-20', lat: -4.8, speed: 10, phase: 6, wait: 5, geo: () => cityBusGeo(), length: 11, width: 2.6, height: 3.1, radius: 1.7, run: 6.5, merge: 0 });
  // kombis around the kiosk esses (small: chevron bumper instead of a big ramp)
  [0, 1].forEach((i) => T({ id: `kombi${i}`, kind: 'van', from: '@slalom+50', to: '@k2+40', lat: i ? 4.4 : -4.4, speed: 11.5, phase: 9 + i * 13, wait: 4, geo: () => kombiGeo(i ? { lower: 0xf15bb5, upper: 0xf5f2e8 } : { lower: 0x2ec4b6, upper: 0xf5f2e8 }), length: 4.2, width: 1.8, height: 2.0, radius: 1.2, ramp: 'chevron', run: 5, merge: 18 }));
}

// ------------------------------------------------------------------------------------------------------------------ fork 1: the beach boardwalk road
/** Register the boardwalk ribbon (works headless: the road is gameplay) and draw it with kerb stripes. */
export function addBeachRoad(kit, B) {
  const material = kit.headless ? null : kit.mat.lit({ map: kit.tex.plankTexture({ base: 0xd09a58, seed: 5 }), roughness: 0.78 }, 'boardwalk');
  return addRibbon(kit, { id: 'beach', rb: B.rb, material, tile: 3.2, kerb: { colours: [0xffd166, 0x1f9d4c], width: 0.7, every: 2.4, skip: [[0, 14], [B.rb.total - 14, B.rb.total]] } });
}

// ------------------------------------------------------------------------------------------------------------------ the wave arch
export function buildArch(kit, M, G, signs) {
  if (kit.headless) return;
  const { statics, track } = kit, p = G.at(112, 0), half = p.width / 2 + 4.6;
  const rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw);
  const g = new Geo();                                                                   // local to the road point (y relative to the road)
  for (const k of [-1, 1]) {                                                             // pylons: stacked black and white blocks, like the mosaic
    for (let i = 0; i < 9; i++) g.box(3.4 - i * 0.12, 1.6, 3.4 - i * 0.12, { x: rx * half * k, y: i * 1.6, z: rz * half * k, ry: p.yaw, colour: i % 2 ? WHITE : BLACK, ao: 0.15 });
    track.model.addCollider(p.x + rx * half * k, p.z + rz * half * k, 1.9);
  }
  const pts = [], N = 30;                                                                // the wave: a beam that rolls across the road, white and black segments
  for (let i = 0; i <= N; i++) { const u = (i / N) * 2 - 1; pts.push([rx * half * u, 15.6 + 2.2 * Math.sin(u * Math.PI * 2.5) * (1 - 0.35 * u * u), rz * half * u]); }
  for (let i = 0; i < N; i++) g.beam(pts[i], pts[i + 1], 0.85, 6, { colour: i % 2 ? WHITE : BLACK });
  statics.at(M.solid, p.x, p.z).merge(g, { x: p.x, y: p.y, z: p.z });
  statics.at(M.sign, p.x, p.z).panel(9.2, 3.4, { x: p.x, y: p.y + 11.6, z: p.z, ry: p.yaw + Math.PI, uv: signs.uv(8), colour: 0xffffff, both: true });   // hangs below the wave
  const bar = new Geo(); bar.box(9.6, 0.25, 0.3, { y: 15.0 }); void bar;
}

// ------------------------------------------------------------------------------------------------------------------ pitch (hairpin shortcut)
export function buildPitch(kit, M, C, signs) {
  const P = C.pitch;
  if (kit.headless || !P) return;
  const { statics, track } = kit, rng = kit.rng;
  // turf: mowing stripes along the pitch (a tiled canvas map would repeat every 2.2 m, so lay the stripes as a texture with 2 bands)
  const pf = track.model.platforms.find((q) => q.def?.id === 'pitch');
  if (pf?.mesh) {
    const tex = customTexture('turf', 64, 64, (ctx, w, h) => { ctx.fillStyle = '#3f9f47'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#4fb556'; ctx.fillRect(0, 0, w, h / 2); }, { aniso: 4 });
    pf.mesh.material = kit.mat.lit({ map: tex ?? null, color: tex ? 0xffffff : 0x40a04a, roughness: 0.95 }, 'turf');
    if (tex) { tex.repeat.set(1, 0.36); tex.needsUpdate = true; }
  }
  const world = (u, v) => [P.x + P.fx * u + P.rx * v, P.z + P.fz * u + P.rz * v];
  const lift = 0.045, W = P.width, L = P.length;
  const g = statics.at(M.solid, P.x, P.z), line = 0.16;
  const seg = (u0, v0, u1, v1) => { const [x0, z0] = world(u0, v0), [x1, z1] = world(u1, v1), y0 = P.top(u0) + lift, y1 = P.top(u1) + lift; g.beam([x0, y0, z0], [x1, y1, z1], line * 0.5, 4, { colour: 0xffffff, ao: 0 }); };
  const u0 = 5, u1 = L - 5, v = W / 2 - 1.6;
  seg(u0, -v, u1, -v); seg(u0, v, u1, v); seg(u0, -v, u0, v); seg(u1, -v, u1, v); seg((u0 + u1) / 2, -v, (u0 + u1) / 2, v);
  for (const uu of [u0, u1]) { const d = uu === u0 ? 1 : -1; seg(uu, -5, uu + d * 5, -5); seg(uu, 5, uu + d * 5, 5); seg(uu + d * 5, -5, uu + d * 5, 5); }
  const mid = (u0 + u1) / 2, ring = []; for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI * 2; ring.push([mid + Math.cos(a) * 4.2, Math.sin(a) * 4.2]); }
  for (let i = 0; i < 14; i++) seg(ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
  // goals (frame + net), corner flags, floodlights, stands, spectators
  const goal = new Geo();
  for (const k of [-3.65, 3.65]) goal.cyl(0.09, 0.09, 2.4, 6, { z: k, colour: 0xffffff, ao: 0 });
  goal.beam([0, 2.4, -3.65], [0, 2.4, 3.65], 0.09, 6, { colour: 0xffffff });
  goal.box(1.8, 2.3, 0.03, { z: -3.6, x: -0.9, ry: Math.PI / 2, colour: 0xe4e4e4, ao: 0 }); goal.box(1.8, 0.03, 7.2, { y: 2.3, x: -0.9, colour: 0xe4e4e4, ao: 0 });
  goal.box(0.03, 2.3, 7.2, { x: -1.8, colour: 0xd9d9d9, ao: 0 });
  for (const [uu, ry] of [[8, P.yaw - Math.PI / 2], [L - 8, P.yaw + Math.PI / 2]]) { const [x, z] = world(uu, 0); g.merge(goal, { x, y: P.top(uu), z, ry }); }
  const flags = new Geo(); flags.cyl(0.04, 0.05, 1.6, 4, { colour: 0xf2f2f2, ao: 0 }); flags.box(0.5, 0.35, 0.03, { y: 1.3, x: 0.25, colour: 0xffd166, ao: 0 });
  for (const uu of [u0, u1]) for (const vv of [-v, v]) { const [x, z] = world(uu, vv); g.merge(flags, { x, y: P.top(uu), z, ry: P.yaw }); }
  const fl = new Geo(); fl.cyl(0.18, 0.3, 17, 6, { colour: 0x9aa3ad, ao: 0.2 }); fl.box(3.6, 1.3, 0.5, { y: 16.6, colour: 0x30343e, ao: 0 });
  for (let i = 0; i < 4; i++) fl.box(0.7, 0.5, 0.06, { y: 17.0, x: -1.3 + i * 0.86, z: 0.3, colour: 0xfffbe0, ao: 0 });
  for (const [uu, vv] of [[-2, -W / 2 - 9], [-2, W / 2 + 9], [L + 2, -W / 2 - 9], [L + 2, W / 2 + 9]]) {
    const [x, z] = world(uu, vv), sp = track.heightAt(x, z);
    g.merge(fl, { x, y: sp - 0.6, z, ry: Math.atan2(P.x + P.fx * L * 0.5 - x, P.z + P.fz * L * 0.5 - z) + Math.PI });
    track.model.addCollider(x, z, 0.5);
  }
  // little terrace on the west side (facing the pitch) with a crowd
  const crowd = kit.batch('pitchcrowd', { cell: 200, cull: 300, quality: 'medium' });
  for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 9; k++) {
      const uu = 8 + k * ((L - 16) / 8), vv = side * (W / 2 + 4.2 + row * 1.4), [x, z] = world(uu, vv), y = track.heightAt(x, z);
      if (row === 0 || rng() < 0.7) addPerson(crowd, M.people, rng, x, y + row * 0.55, z, P.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2), { arms: 'up', shirt: rng.pick([0xffd166, 0x2a9d8f, 0xffffff, 0xe63946]) });
    }
    const [bx, bz] = world(L / 2, side * (W / 2 + 6.2)), by = track.heightAt(bx, bz);
    for (let row = 0; row < 3; row++) { const [px, pz] = world(L / 2, side * (W / 2 + 4.2 + row * 1.4)); g.box(1.3, 0.35, L - 20, { x: px, y: track.heightAt(px, pz) + row * 0.55 - 0.1, z: pz, ry: P.yaw, colour: row % 2 ? 0x2a9d8f : 0xffd166, ao: 0.2 }); }
    void bx; void bz; void by;
  }
  // players
  for (let i = 0; i < 8; i++) { const uu = 12 + rng() * (L - 24), vv = (rng() - 0.5) * (W - 6), [x, z] = world(uu, vv); addPerson(statics, M.people, rng, x, P.top(uu) + 0.05, z, rng.range(0, 6.28), { arms: 'down', shirt: i < 4 ? 0xffd166 : 0x2a9d8f, legs: i < 4 ? 0x2a4bb0 : 0xffffff }); }
  // signpost on the promenade: ATALHO
  const [sx, sz] = world(-9, -W / 2 - 4), sy = track.heightAt(sx, sz);
  statics.at(M.sign, sx, sz).panel(5.4, 2.7, { x: sx, y: sy + 1.8, z: sz, ry: Math.atan2(P.x - sx, P.z - sz) * 0 + Math.PI + P.yaw + 0.6, uv: signs.uv(9), colour: 0xffffff, both: true });
  statics.at(M.solid, sx, sz).cyl(0.12, 0.14, 2.0, 6, { x: sx, y: sy, z: sz, colour: 0x4a4f5c });
}

// ------------------------------------------------------------------------------------------------------------------ boost decals (platform pads)
export function buildPadDecals(kit) {
  if (kit.headless) return;
  const { track, statics } = kit, mat = kit.mat.glow(0x22e6ff, 1.5), dark = kit.mat.basic(0x0b2a3a);
  for (const pf of track.model.platforms) {
    if (pf.kind !== 'pad' || pf.surface !== 'boost') continue;
    const cx = pf.x + pf.fx * pf.length * 0.5, cz = pf.z + pf.fz * pf.length * 0.5, cy = pf.topAt(pf.length * 0.5) + 0.06;
    const d = new Geo(), pl = new Geo();
    pl.box(pf.width - 0.4, 0.02, pf.length - 0.4, { colour: 0x0b2a3a, ao: 0 });
    for (let k = 0; k < 3; k++) {
      const u = -pf.length * 0.28 + k * pf.length * 0.28, w = pf.width * 0.38;
      d.poly([[-w, u - 0.9], [0, u + 0.7], [w, u - 0.9], [w, u - 1.9], [0, u - 0.3], [-w, u - 1.9]], 0, { colour: 0xffffff, ao: 0 });
    }
    statics.at(dark, cx, cz).merge(pl, { x: cx, y: cy - 0.03, z: cz, ry: pf.yaw });
    statics.at(mat, cx, cz).merge(d, { x: cx, y: cy, z: cz, ry: pf.yaw });
  }
}

// ------------------------------------------------------------------------------------------------------------------ boardwalk dressing (fork 1)
export function buildLines(kit, M, G, C, signs) {
  if (kit.headless || !C.beach) return;
  const { statics, track } = kit, rb = C.beach.rb, q = {};
  // rope posts both sides, a rope between them; none where the boardwalk joins the promenade
  const post = new Geo(); post.cyl(0.08, 0.1, 1.0, 5, { colour: 0xf2ede2, ao: 0 }); post.sphere(0.13, { y: 1.05, colour: 0xd62839, ao: 0 }, 5, 4);
  for (let u = 26; u < rb.total - 26; u += 8) {
    const p = rb.at(u, q), n = rb.at(u + 8, {});
    for (const k of [-1, 1]) {
      const x = p.x + p.rx * k * 10.9, z = p.z + p.rz * k * 10.9, y = p.y;
      statics.at(M.solid, x, z).merge(post, { x, y, z });
      if (u < rb.total - 34) statics.at(M.solid, x, z).beam([x, y + 0.85, z], [n.x + n.rx * k * 10.9, n.y + 0.65, n.z + n.rz * k * 10.9], 0.035, 4, { colour: 0xe63946 });
    }
  }
  // kicker flags: a pair of tall flag poles at each ramp and a SALTOS! sign at the first
  const flag = new Geo(); flag.cyl(0.07, 0.1, 6.4, 5, { colour: 0xf2f2f2, ao: 0 }); flag.box(1.7, 1.0, 0.05, { y: 5.3, x: 0.9, colour: 0xff7f11, ao: 0 }); flag.box(1.7, 0.16, 0.06, { y: 5.3, x: 0.9, colour: 0xffffff, ao: 0 });
  C.beach.kickers.forEach((k, i) => {
    const p = rb.at(k.u + 5, q);
    for (const s of [-1, 1]) { const x = p.x + p.rx * s * 6.4, z = p.z + p.rz * s * 6.4; statics.at(M.solid, x, z).merge(flag, { x, y: p.y - 0.1, z, ry: p.yaw + (s > 0 ? 0 : Math.PI) }); }
    if (i === 0) { const t = rb.at(k.u - 22, {}), x = t.x + t.rx * 8.6, z = t.z + t.rz * 8.6; statics.at(M.sign, x, z).panel(5.4, 2.7, { x, y: t.y + 1.7, z, ry: t.yaw + Math.PI, uv: signs.uv(11), colour: 0xffffff, both: true }); statics.at(M.solid, x, z).cyl(0.12, 0.14, 1.9, 6, { x, y: t.y, z, colour: 0x4a4f5c }); }
  });
  // fork signs at the split, one for each road, either side of the gore
  const sign = (lat, uvId) => {
    const p = G.at('@forkA-18', lat), y = track.heightAt(p.x, p.z);
    statics.at(M.sign, p.x, p.z).panel(6.4, 3.2, { x: p.x, y: y + 2.5, z: p.z, ry: p.yaw + Math.PI, uv: signs.uv(uvId), colour: 0xffffff, both: true });
    for (const d of [-2.3, 2.3]) { const q = G.at('@forkA-18', lat + d); statics.at(M.solid, q.x, q.z).cyl(0.12, 0.14, 2.6, 6, { x: q.x, y, z: q.z, colour: 0x4a4f5c }); }
  };
  sign(-15, 13); sign(15, 12);
}

// ------------------------------------------------------------------------------------------------------------------ the tiled staircase on the favela hill
export function buildEscadaria(kit, M, G) {
  if (kit.headless) return;
  const { statics, track, rng } = kit;
  const base = G.at('@crest-30', 0), tr = track;
  // the hill rises to the north (-z): climb away from the road on whichever side points that way
  const side = Math.sin(base.yaw) >= 0 ? -1 : 1, nx = -Math.cos(base.yaw) * side, nz = Math.sin(base.yaw) * side;    // unit vector away from the road
  const x0 = base.x + nx * (base.width / 2 + 7), z0 = base.z + nz * (base.width / 2 + 7), yaw = Math.atan2(nx, nz);
  const N = 42, step = 1.25;
  for (let k = 0; k < N; k++) {
    const x = x0 + nx * k * step, z = z0 + nz * k * step, gy = tr.heightAt(x, z), y = gy + 0.12 + 0.03 * k * 0;
    const g = statics.at(M.solid, x, z);
    g.box(6.0, 0.5, step + 0.02, { x, y: gy - 0.2, z, ry: yaw, colour: MOSAIC[(k * 3 + ((k >> 2) % 3)) % MOSAIC.length], top: MOSAIC[(k * 7 + 2) % MOSAIC.length], ao: 0.1 });
    if (k % 2 === 0) g.box(0.32, 1.1, step + 0.02, { x: x + Math.cos(yaw) * 3.2, y: y - 0.2, z: z - Math.sin(yaw) * 3.2, ry: yaw, colour: 0xf5f0e6, ao: 0.1 });
    if (k % 2 === 0) g.box(0.32, 1.1, step + 0.02, { x: x - Math.cos(yaw) * 3.2, y: y - 0.2, z: z + Math.sin(yaw) * 3.2, ry: yaw, colour: 0xf5f0e6, ao: 0.1 });
  }
  // laundry lines and a rooftop water tank stand
  for (let k = 4; k < N - 3; k += 9) {
    const x = x0 + nx * k * step, z = z0 + nz * k * step, gy = tr.heightAt(x, z), ax = Math.cos(yaw) * 5.5, az = -Math.sin(yaw) * 5.5;
    const g = statics.at(M.solid, x, z);
    for (const s of [-1, 1]) g.cyl(0.07, 0.09, 4.6, 5, { x: x + ax * s, y: gy, z: z + az * s, colour: 0x5a4a3a, ao: 0 });
    g.beam([x + ax, gy + 4.4, z + az], [x - ax, gy + 4.2, z - az], 0.025, 4, { colour: 0xdddddd });
    for (let c = 0; c < 6; c++) { const t = (c + 0.5) / 6, fx = x + ax * (1 - 2 * t), fz = z + az * (1 - 2 * t); g.box(0.5, 0.9, 0.06, { x: fx, y: gy + 3.3, z: fz, ry: yaw, colour: MOSAIC[(c + k) % MOSAIC.length], ao: 0 }); }
  }
  void rng;
}

// ------------------------------------------------------------------------------------------------------------------ sambodromo grandstands (west sweeper)
export function buildStands(kit, M) {
  if (kit.headless) return;
  const { statics, track, place, rng } = kit;
  const bay = new Geo(), W = 20, rows = 6;
  for (let i = 0; i < rows; i++) bay.box(W, 1.0 + i * 0.7, 1.5, { z: -i * 1.5, y: 0, colour: i % 2 ? 0xf5f0e6 : 0xf6d14a, ao: 0.1, top: 0xe8dccb });
  bay.box(W + 1, 0.4, 9.5, { y: 6.6, z: -3.8, colour: 0xe63946, ao: 0 });
  for (const x of [-W / 2, W / 2]) bay.cyl(0.14, 0.18, 6.6, 5, { x, z: 0.4, colour: 0x707480, ao: 0 });
  for (const x of [-W / 2, W / 2]) bay.cyl(0.14, 0.18, 6.6, 5, { x, z: -7.4, colour: 0x707480, ao: 0 });
  bay.box(W + 1.4, 1.1, 0.2, { y: 5.4, z: 0.9, colour: 0x2ec4b6, ao: 0 });
  const crowd = kit.batch('standcrowd', { cell: 240, cull: 240, quality: 'medium' });
  const spots = place.along({ from: '@sweep-95', to: '@sweep+85', every: 21, side: 'right', offset: 7.5 });
  for (const sp of spots) {
    statics.at(M.solid, sp.x, sp.z).merge(bay, { x: sp.x, y: sp.y - 0.4, z: sp.z, ry: sp.yaw });
    const fx = Math.sin(sp.yaw), fz = Math.cos(sp.yaw), rx = -fz, rz = fx;
    track.model.addCapsule(sp.x - rx * 10, sp.z - rz * 10, sp.x + rx * 10, sp.z + rz * 10, 1.0);
    for (let r = 0; r < rows; r++) for (let k = 0; k < 7; k++) {
      if (rng() < 0.15) continue;
      const u = (k - 3) * 2.7 + rng.range(-0.4, 0.4), x = sp.x + rx * u - fx * (r * 1.5 + 0.2), z = sp.z + rz * u - fz * (r * 1.5 + 0.2);
      addPerson(crowd, M.people, rng, x, sp.y - 0.4 + 1.0 + r * 0.7, z, sp.yaw, { arms: 'up' });
    }
  }
}

// ------------------------------------------------------------------------------------------------------------------ low cable car over the hairpin
export function buildBondinho(kit, M, G) {
  if (kit.headless) return;
  const { statics, track } = kit, THREE_ = THREE;
  const a = { x: 905, z: -170 }, b = { x: 770, z: 62 }, H = 40;
  const ya = track.heightAt(a.x, a.z) + H, yb = track.heightAt(b.x, b.z) + H, sag = 3.5;
  const tower = (p) => { const g = new Geo(); const h = H, w0 = 3.2, w1 = 1.0; for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.beam([sx * w0, 0, sz * w0], [sx * w1, h, sz * w1], 0.36, 5, { colour: 0xd23b3b }); for (let k = 1; k <= 5; k++) { const y = (h * k) / 6, w = w0 + (w1 - w0) * (k / 6); g.box(w * 2, 0.3, 0.3, { y, colour: 0xf3f3ee, ao: 0 }); g.box(0.3, 0.3, w * 2, { y, colour: 0xf3f3ee, ao: 0 }); } g.box(9, 0.7, 1.4, { y: h, colour: 0x30343e, ao: 0 }); statics.at(M.solid, p.x, p.z).merge(g, { x: p.x, y: track.heightAt(p.x, p.z) - 0.6, z: p.z, ry: 0.35 }); };
  tower(a); tower(b);
  const pos = (t, o) => { o[0] = a.x + (b.x - a.x) * t; o[1] = ya + (yb - ya) * t - sag * 4 * t * (1 - t); o[2] = a.z + (b.z - a.z) * t; };
  const cab = new Geo(); cab.cyl(0.35, 0.35, 0.5, 6, { y: 1.4, colour: 0x30343e, ao: 0 }); cab.box(3.6, 2.0, 2.4, { y: -0.7, colour: 0xf2c94c, top: 0xf5f0e6, ao: 0.2 }); cab.box(3.3, 0.9, 2.5, { y: -0.1, colour: 0x9fd3ff, ao: 0 }); cab.box(3.8, 0.2, 2.6, { y: 1.3, colour: 0xf5f0e6, ao: 0 });
  const geo = cab.build(), cabins = [0, 1].map(() => { const m = new THREE_.Mesh(geo, M.solid); m.castShadow = true; kit.add(m); return m; });
  const cable = new Geo(), pts = [], nseg = 20, o = [0, 0, 0];
  for (let i = 0; i <= nseg; i++) { pos(i / nseg, o); pts.push([o[0], o[1], o[2]]); }
  for (let i = 0; i < nseg; i++) cable.beam(pts[i], pts[i + 1], 0.1, 4, { colour: 0x30343e });
  statics.at(M.solid, a.x, a.z).merge(cable, {});
  const yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
  kit.animate((dt, time) => {
    const u = 0.5 + 0.5 * Math.sin(time * 0.16 - 0.9);
    cabins.forEach((c, k) => { pos(k ? 1 - u : u, o); c.position.set(o[0], o[1] - 2.2, o[2]); c.rotation.y = yaw; c.rotation.z = Math.sin(time * 0.8 + k) * 0.035; });
  });
}

// ------------------------------------------------------------------------------------------------------------------ tide
export function buildTide(kit, ctx) {
  if (kit.headless) return;
  const { track } = kit, sea = track.group.getObjectByName('water');
  const x0 = -140, x1 = 880, n = 96, lines = 3;
  const pos = new Float32Array(lines * (n + 1) * 2 * 3), idx = [];
  for (let l = 0; l < lines; l++) for (let i = 0; i < n; i++) { const a = (l * (n + 1) + i) * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'foam'; mesh.renderOrder = 2; mesh.frustumCulled = false; kit.add(mesh);
  const P = geo.attributes.position;
  kit.animate((dt, t) => {
    const tide = Math.sin(t * 0.11) * 0.5 + 0.5;                                 // 0 low .. 1 high, a ~57 s cycle
    if (sea) sea.position.y = (tide - 0.5) * 0.44;
    for (let l = 0; l < lines; l++) {
      const ph = (t * 0.16 + l / lines) % 1, reach = 3 + ph * 15 - 7 + tide * 7 - 5;   // each wave runs up the beach and dies
      const width = 1.4 + 1.6 * (1 - ph), lift = 0.09 + l * 0.001;
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n, zc = ctx.shoreZ(x) + 0.5 + reach - l * 0, k = (l * (n + 1) + i) * 2 * 3;
        const w = width * (0.55 + 0.45 * Math.sin(x * 0.21 + t * 0.6 + l));
        P.array[k] = x; P.array[k + 1] = lift; P.array[k + 2] = zc - w; P.array[k + 3] = x; P.array[k + 4] = lift; P.array[k + 5] = zc + w;
      }
    }
    P.needsUpdate = true; mat.opacity = 0.35 + 0.3 * tide;
  });
}

// ------------------------------------------------------------------------------------------------------------------ the descent tunnel (after the ridge esses)
export function buildTunnel(kit, M, G) {
  if (kit.headless) return;
  const { statics, track } = kit, s0 = G.S('@tunA'), s1 = G.S('@tunB'), at = (s, l) => G.at(s, l), gy = (p) => track.heightAt(p.x, p.z);
  const roof = new Geo(), walls = new Geo(), lights = new Geo();
  for (let s = s0; s < s1; s += 10) {
    const c = at(s + 5, 0);
    roof.box(29.4, 1.0, 10.3, { x: c.x, y: gy(c) + 6.7, z: c.z, ry: c.yaw, colour: 0x8f8a80, ao: 0.4, top: 0x4f8a3e });
    lights.box(0.5, 0.12, 6.5, { x: c.x, y: gy(c) + 6.6, z: c.z, ry: c.yaw, colour: 0xfff3c8, ao: 0 });
    for (const l of [-1, 1]) {
      const w = at(s + 5, l * 12.9);
      walls.box(0.7, 6.8, 10.1, { x: w.x, y: gy(w) - 0.2, z: w.z, ry: w.yaw, colour: 0xe9e1d2, ao: 0.25 });
      walls.box(0.76, 0.55, 10.1, { x: w.x, y: gy(w) + 1.6, z: w.z, ry: w.yaw, colour: MOSAIC[Math.round(s / 10) % MOSAIC.length], ao: 0 });
    }
  }
  const mid = at((s0 + s1) / 2, 0);
  statics.at(M.solid, mid.x, mid.z).merge(roof, {}); statics.at(M.solid, mid.x, mid.z).merge(walls, {});
  const lm = new THREE.Mesh(lights.build(), new THREE.MeshBasicMaterial({ color: 0xfff3c8, toneMapped: false })); lm.frustumCulled = false; kit.add(lm);
  const portal = (s) => {                                                              // mosaic frame: stacked black and white blocks like the promenade pavement
    const c = at(s, 0), g = new Geo();
    for (const l of [-1, 1]) for (let i = 0; i < 5; i++) { const w = at(s, l * 13.6); g.box(2.6 - i * 0.1, 1.6, 2.6, { x: w.x, y: gy(w) - 0.3 + i * 1.6, z: w.z, ry: c.yaw, colour: i % 2 ? WHITE : BLACK, ao: 0.15 }); }
    for (let k = -7; k <= 7; k++) { const q = at(s, k * 1.9); g.box(1.9, 1.5, 2.6, { x: q.x, y: gy(q) + 6.9, z: q.z, ry: c.yaw, colour: k % 2 ? WHITE : BLACK, ao: 0.1 }); }
    statics.at(M.solid, c.x, c.z).merge(g, {});
  };
  portal(s0); portal(s1);
  for (const l of [-1, 1]) for (const s of [s0, s1]) { const w = at(s, l * 13.6); track.model.addCollider(w.x, w.z, 1.5); }
}
