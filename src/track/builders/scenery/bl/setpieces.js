// Blighty set-pieces: timed hazards, traffic and the landmarks that announce them. Everything is placed by mark (or on a fork ribbon). Obstacles are created headless too (they are gameplay);
// every mesh is skipped when M is null. Called from scenery/blighty.js dressBlighty(). Everything is a pure function of track time.
//
//   phone-box chicane  (start straight, s 142..194)  three red boxes staggered across the road
//   union bunting      (start straight)              flag lines over the road
//   Tower Bridge gate  (canal bridge)                 barrier arms + amber/red lights + lifting leaves on a 30 s cycle; the canal leap skips it
//   high-street bus    (esses)                       a slow double-decker crawling along the left lane
//   roundabout cabs    (rb0..rb4)                    two black cabs circulating; overtake them or stay behind
//   Tube tunnel        (fork 2 ribbon)               a tiled tunnel with a cross-passage: a train crosses on a timed cycle, warning lamps flash first
//   Park Drive         (fork 1 ribbon)               pale tarmac across the lawns: lamps, benches, a humpback bridge over the brook, a milk float
//   fork signs         (parkA, mktB)                 PARK DRIVE / KINGS CORNER and THE TUBE / HILL ROAD boards at both splits
//   market van         (market cut)                  a delivery van crossing the market cut on a timed cycle
//   observation wheel  (park)                        a slow big wheel that shows you where you are
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { phoneBoxGeo, buntingGeo, doubleDeckerGeo } from '../blighty/props.js';
import { GATE } from './cuts.js';
import { lampGeo, lanternGeo, benchGeo } from '../blighty/props.js';
import { SIGN_IDS } from '../blighty/atlas.js';
import { addRibbon } from '../../branch.js';
import { addTraffic, taxiGeo, lorryGeo, milkFloatGeo } from '../hazards/traffic.js';

export const WHEEL = { x: 60, z: 190 };
const RED = 0xd22f27, NAVY = 0x1d3a6e, CREAM = 0xf3ead0, TILE = 0xe9e4d6;
const cyc = (t, c, phase) => (((t + phase) % c) + c) % c;
const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

// ------------------------------------------------------------------------------------------------------------------ vehicles
function cabGeo() {
  const g = new Geo();
  g.box(1.9, 0.9, 4.7, { y: 0.35, colour: 0x15161b, ao: 0.2 });
  g.box(1.8, 0.85, 2.6, { y: 1.22, z: -0.5, colour: 0x15161b, ao: 0.2, top: 0x1c1d24 });
  g.box(1.82, 0.5, 2.4, { y: 1.42, z: -0.5, colour: 0x2b3a4a, ao: 0 });
  g.box(0.5, 0.2, 0.26, { y: 2.1, z: 0.2, colour: 0xffe9a6, ao: 0 });                    // roof light
  for (const [x, z] of [[-0.95, 1.5], [0.95, 1.5], [-0.95, -1.5], [0.95, -1.5]]) g.cyl(0.36, 0.36, 0.3, 10, { x, y: 0.36, z, rz: Math.PI / 2, colour: 0x0d0d10, ao: 0 });
  g.box(1.5, 0.12, 0.05, { y: 0.75, z: 2.36, colour: 0xfff0c0, ao: 0 });
  return g;
}
function vanGeo() {
  const g = new Geo();
  g.box(2.1, 1.25, 3.4, { y: 0.4, z: -0.6, colour: 0xf2f1ea, ao: 0.2, top: 0xffffff });
  g.box(2.0, 1.0, 1.5, { y: 0.4, z: 1.6, colour: 0xf2f1ea, ao: 0.2 });
  g.box(1.9, 0.45, 0.06, { y: 0.95, z: 2.36, colour: 0x2b3a4a, ao: 0 });
  g.box(2.14, 0.32, 3.42, { y: 0.9, z: -0.6, colour: 0x2f6f3a, ao: 0 });                 // green livery band
  for (const [x, z] of [[-1.0, 1.5], [1.0, 1.5], [-1.0, -1.7], [1.0, -1.7]]) g.cyl(0.36, 0.36, 0.3, 10, { x, y: 0.36, z, rz: Math.PI / 2, colour: 0x0d0d10, ao: 0 });
  return g;
}
function trainGeo() {
  const g = new Geo(), L = 17;
  g.box(2.7, 3.1, L, { y: 0.5, colour: 0x2d4f8f, ao: 0.15, top: 0x8a919c });
  g.box(2.74, 0.32, L + 0.02, { y: 1.2, colour: 0xd22f27, ao: 0 });                      // red band
  g.box(2.74, 0.8, L - 1.6, { y: 2.2, colour: 0xffe9b8, ao: 0 });                        // lit windows (basic-lit by emissive-less vertex colour)
  for (let i = 0; i < 4; i++) g.box(2.78, 3.0, 0.1, { y: 0.5, z: -6.2 + i * 4.1, colour: 0x1b2438, ao: 0 });
  g.box(2.4, 0.9, 0.1, { y: 2.0, z: L / 2 + 0.03, colour: 0xfff6d8, ao: 0 });
  return g;
}


// ------------------------------------------------------------------------------------------------------------------ the fork roads
/** Register Park Drive and the Tube ribbons (works headless: they are gameplay) and draw them. Call BEFORE any scenery is placed. */
export function addForkRoads(kit, M, C) {
  const lit = (o, n) => kit.mat.lit(o, n), env = kit.headless ? null : kit.tex.skyEnvTexture();
  if (C.park) {
    const rb = C.park.rb, t = rb.total;
    const material = kit.headless ? null : lit({ map: kit.tex.asphaltTexture({ base: 0x9c9a92, wet: true, seed: 12 }), roughness: 0.45, metalness: 0.05, envMap: env, envMapIntensity: 0.6 }, 'parkdrive');
    addRibbon(kit, { id: 'park', rb, material, tile: 14, kerb: { colours: [0xe4e1d6, 0x7f8f7a], width: 0.6, every: 2.4, skip: [[0, 16], [t - 16, t]] } });
  }
  if (C.tube) {
    const rb = C.tube.rb, t = rb.total;
    const material = kit.headless ? null : lit({ map: kit.tex.asphaltTexture({ base: 0x2f3138, wet: true, seed: 7 }), roughness: 0.4, metalness: 0.1, envMap: env, envMapIntensity: 0.9 }, 'tuberoad');
    addRibbon(kit, { id: 'tube', rb, material, tile: 14, kerb: { colours: [0xffc21f, 0x14141a], width: 0.6, every: 2.4, skip: [[0, 16], [t - 16, t]] } });
    // the tunnel walls are capsule colliders (ribbons carry no walls); the cross-passage is open
    const [t0, t1] = C.tube.tunnelU, [g0, g1] = C.tube.gapU, HW = 9.0;
    for (const l of [-1, 1]) for (let u = t0; u < t1; u += 10) {
      if (u + 10 > g0 - 1 && u < g1 + 1) continue;
      const a = rb.at(u, {}), b = rb.at(u + 10, {});
      kit.track.model.addCapsule(a.x + a.rx * l * HW, a.z + a.rz * l * HW, b.x + b.rx * l * HW, b.z + b.rz * l * HW, 0.6);
    }
  }
  if (C.park) {                                                                           // the humpback bridge: low parapets either side of the crest
    const rb = C.park.rb, u = C.park.bridgeU;
    for (const l of [-1, 1]) { const a = rb.at(u - 6, {}), b = rb.at(u + 6, {}); kit.track.model.addCapsule(a.x + a.rx * l * 8.9, a.z + a.rz * l * 8.9, b.x + b.rx * l * 8.9, b.z + b.rz * l * 8.9, 0.55); }
  }
}

// ------------------------------------------------------------------------------------------------------------------ obstacles + dressing
export function buildRoadHazards(kit, M, G, ctx, C) {
  const { obstacles, statics, track } = kit, head = kit.headless, at = (s, l) => G.at(s, l), pt = (s, l) => { const p = at(s, l); return [p.x, p.z]; };
  const mesh = (geo, mat, name) => (head ? undefined : () => { const m = new THREE.Mesh(geo.build(), mat); m.castShadow = true; m.name = name; return m; });

  // ---- phone-box chicane
  [[142, 6.4], [168, -6.4], [194, 6.4]].forEach(([s, l], i) => {
    const p = at(s, l);
    obstacles.static({ id: `phone${i}`, kind: 'phonebox', x: p.x, z: p.z, radius: 0.95, hit: 'bump' });
    if (!head) statics.at(M.solid, p.x, p.z).merge(phoneBoxGeo(), { x: p.x, y: track.heightAt(p.x, p.z), z: p.z, ry: p.yaw });
  });

  // ---- Tower Bridge gate: barrier obstacles that are live only while the arms are down
  const bridgeS = ctx.G.S('@bridge'), gateS = bridgeS - 38, gates = [-7.5, -2.5, 2.5, 7.5].map((l, i) => { const p = at(gateS, l); return obstacles.static({ id: `barrier${i}`, kind: 'barrier', x: p.x, z: p.z, radius: 2.7, hit: 'spin' }); });
  const armAngle = (u) => 1.35 * (1 - smooth(GATE.warn, GATE.down, u)) + 1.35 * smooth(GATE.rise, GATE.up, u);         // radians above horizontal
  const leafAngle = (u) => 1.02 * (smooth(GATE.leafUp, GATE.leafTop, u) - smooth(GATE.leafFall, GATE.leafDown, u));
  const solid = (u) => u >= GATE.down + 0.4 && u <= GATE.rise + 0.3;
  const state = { u: 0 };
  kit.animate((dt, t) => { state.u = cyc(t, GATE.cycle, GATE.phase); const on = solid(state.u); for (const o of gates) o.active = on; });
  state.u = cyc(0, GATE.cycle, GATE.phase); for (const o of gates) o.active = solid(state.u);

  // ---- rampable traffic (need-for-speed style: hit the tail ramp / chevron bumper fast and lined up, fly over, land beyond). Same direction as the race.
  const T = (o) => addTraffic(kit, G, { hit: 'bump', ...o });
  const mailGeo = () => { const g = vanGeo(); return g; };
  // roundabout cabs: two black cabs circulating (chevron bumper; the ring is curved, so a launch only happens on the straighter stretches)
  [0, 17].forEach((ph, i) => T({ id: `cab${i}`, kind: 'cab', from: '@rb0+12', to: '@rb4-10', lat: 4.5, speed: 11.5, phase: ph, wait: 6, geo: () => taxiGeo(), length: 4.7, width: 1.9, height: 2.0, radius: 1.5, ramp: 'chevron', run: 5, every: 8 }));
  // high-street bus: a double-decker crawling along the left lane through the esses (own textured body, separate striped ramp)
  T({ id: 'bus-slow', kind: 'bus', from: '@es1-60', to: '@es2-30', lat: -5.2, speed: 7.2, phase: 5, wait: 6, geo: () => (head ? new Geo() : doubleDeckerGeo()), material: M?.bus, separateRamp: true, length: 10.4, width: 2.5, height: 4.3, radius: 2.0, run: 6.5, rise: 1.2, every: 16 });
  // the finishing straight: a brewery lorry and a milk float, a lap apart, well clear of the grid
  T({ id: 'lorry-line', kind: 'van', from: '@sw2+125', to: track.length - 60, lat: -4.6, speed: 8.4, phase: 0, wait: 6, geo: () => lorryGeo(), length: 8, width: 2.5, height: 3.3, radius: 1.6, run: 6, rise: 1.0 });
  T({ id: 'milk-line', kind: 'van', from: '@sw2+110', to: track.length - 70, lat: 4.6, speed: 5.6, phase: 14, wait: 5, geo: () => milkFloatGeo(), length: 4.2, width: 1.7, height: 1.8, radius: 1.2, ramp: 'chevron', run: 5 });
  // Park Drive: a milk float trundling between the bandstand and the brook; the Tube: a Royal Mail van just beyond the tunnel mouth
  if (C.park) T({ id: 'park-float', kind: 'van', ribbon: C.park.rb, u0: 60, u1: C.park.rb.total - 70, lat: 0, speed: 5.2, phase: 6, wait: 4, geo: () => milkFloatGeo(), length: 4.2, width: 1.7, height: 1.8, radius: 1.2, ramp: 'chevron', run: 5, every: 10 });
  if (C.tube) T({ id: 'tube-van', kind: 'van', ribbon: C.tube.rb, u0: C.tube.tunnelU[1] + 8, u1: C.tube.rb.total - 34, lat: 3.2, speed: 9, phase: 3, wait: 5, geo: () => mailGeo(), length: 5.0, width: 2.1, height: 2.2, radius: 1.35, ramp: 'chevron', run: 5, every: 10 });
  // ---- market van across the market cut
  if (C.market) {
    const d = C.market.deck, fx = Math.sin(d.yaw), fz = Math.cos(d.yaw), rx = fz, rz = -fx, u = d.length * 0.62;
    const cx = d.x + fx * u, cz = d.z + fz * u, half = d.width / 2 + 5;
    const geo = head ? null : vanGeo();
    obstacles.path({ id: 'van', kind: 'van', points: [[cx - rx * half, cz - rz * half], [cx + rx * half, cz + rz * half]], speed: 7, mode: 'cross', wait: 9, phase: 4, length: 5.0, radius: 1.35, hit: 'spin', mesh: mesh(geo ?? new Geo(), M?.solid, 'van') });
  }
  // ---- Tube cross-passage train: crosses the tunnel of fork 2 (side-on: a timing hazard, not rampable)
  const train = C.tube && (() => {
    const half = 31, geo = head ? null : trainGeo(), p = C.tube.rb.at(C.tube.trainU, {});
    return obstacles.path({ id: 'tube-train', kind: 'train', points: [[p.x - p.rx * half, p.z - p.rz * half], [p.x + p.rx * half, p.z + p.rz * half]], speed: 21, mode: 'cross', wait: 10, phase: 5, length: 17, radius: 1.75, hit: 'spin', mesh: mesh(geo ?? new Geo(), M?.solid, 'train') });
  })();

  if (head) return;

  // ================================================================ visuals
  // bunting lines over the start straight
  {
    const g = statics;
    for (let s = 34; s < 300; s += 36) {
      if (s > 130 && s < 210) continue;                                                // the phone boxes have their own show
      const L = at(s, -13), R = at(s, 13), y = track.heightAt(L.x, L.z);
      const geo = buntingGeo([L.x, y + 7.2, L.z], [R.x, track.heightAt(R.x, R.z) + 7.2, R.z], { sag: 1.3, flag: 1.0, colours: [RED, 0xf5f5f0, NAVY, 0xf5f5f0] });
      g.at(M.cloth, L.x, L.z).merge(geo, {});
      for (const P of [L, R]) statics.at(M.solid, P.x, P.z).cyl(0.09, 0.14, 7.4, 6, { x: P.x, y: track.heightAt(P.x, P.z) - 0.1, z: P.z, colour: 0x2f343d, ao: 0.1 });
    }
  }

  // ---- Tower Bridge
  {
    const cyl0 = at(bridgeS, 0), gy = (p) => track.heightAt(p.x, p.z);
    const lampMat = { red: new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }), amber: new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false }), dark: new THREE.MeshBasicMaterial({ color: 0x3a1512 }) };
    // arms: pivot on the left kerb, striped beam across the whole road
    const arm = new Geo(); for (let i = 0; i < 14; i++) arm.box(1.6, 0.26, 0.22, { x: 0.8 + i * 1.6, y: 0, colour: i % 2 ? 0xf5f5f0 : RED, ao: 0 });
    const armGeo = arm.build(), armMats = M.solid, pv = at(gateS, -11.4), pw = at(gateS, 11.4), sr = { x: at(gateS, 1).x - at(gateS, 0).x, z: at(gateS, 1).z - at(gateS, 0).z };
    const sideRy = Math.atan2(-sr.z, sr.x);
    const mkArm = (P, flip) => {
      const grp = new THREE.Group(), m = new THREE.Mesh(armGeo, armMats); m.position.y = 1.15; grp.add(m);
      grp.position.set(P.x, gy(P) - 0.1, P.z); grp.rotation.y = sideRy + (flip ? Math.PI : 0); kit.add(grp);
      statics.at(M.solid, P.x, P.z).cyl(0.22, 0.28, 1.2, 6, { x: P.x, y: gy(P) - 0.2, z: P.z, colour: 0x3a3f4a, ao: 0.2 });
      return grp;
    };
    const armL = mkArm(pv, false), armR = mkArm(pw, true);
    // wig-wag lamp posts either side, ahead of the barrier
    const lamps = [];
    for (const l of [-12.6, 12.6]) {
      const p = at(gateS - 14, l), y = gy(p);
      statics.at(M.solid, p.x, p.z).cyl(0.1, 0.13, 3.6, 6, { x: p.x, y, z: p.z, colour: 0x2f343d, ao: 0.2 });
      statics.at(M.solid, p.x, p.z).box(0.9, 1.9, 0.14, { x: p.x, y: y + 3.0, z: p.z, ry: p.yaw, colour: 0xf5f5f0, ao: 0 });
      for (const k of [-1, 1]) { const rx = -Math.cos(p.yaw) * k * 0.22, rz = Math.sin(p.yaw) * k * 0.22; const m = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), lampMat.dark); m.position.set(p.x + rx + Math.sin(p.yaw) * 0.09, y + 4.4, p.z + rz + Math.cos(p.yaw) * 0.09); m.rotation.y = p.yaw; kit.add(m); lamps.push({ m, k }); m.position.y = y + 4.1 + (k > 0 ? 0.45 : 0); }
    }
    // pylons (stone towers with turrets), gantries and walkways, lifting leaves
    const tower = new Geo(), TW = 5.6, TH = 20;
    tower.box(TW, TH, TW, { colour: 0xb9ad91, ao: 0.3, top: 0xa39880, facade: [3, 3] });
    tower.box(TW + 0.7, 0.9, TW + 0.7, { y: TH, colour: 0x8a8068, ao: 0.1 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { tower.box(1.3, 2.6, 1.3, { x: sx * 2.3, y: TH + 0.9, z: sz * 2.3, colour: 0xb9ad91, ao: 0.1 }); tower.cyl(0, 1.05, 3.2, 6, { x: sx * 2.3, y: TH + 3.5, z: sz * 2.3, colour: 0x2f5a78, ao: 0 }); }
    tower.cyl(0, 2.4, 5.0, 8, { y: TH + 0.9, colour: 0x2f5a78, ao: 0 });
    for (const s of [bridgeS - 15, bridgeS + 15]) for (const l of [-27, 27]) {
      const p = at(s, l); statics.at(M.stone, p.x, p.z).merge(tower, { x: p.x, y: gy(p) - 0.5, z: p.z, ry: p.yaw }); track.model.addCollider(p.x, p.z, 3.4);
    }
    // gantries across the road and walkways along both sides, in Thames blue
    const blue = 0x3f79b6, gg = new Geo();
    for (const s of [bridgeS - 15, bridgeS + 15]) { const a = at(s, -27), b = at(s, 27); gg.beam([a.x, gy(a) + 17.5, a.z], [b.x, gy(b) + 17.5, b.z], 0.55, 6, { colour: blue }); for (let k = 0; k <= 9; k++) { const t = k / 9, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; gg.beam([x, gy(a) + 17.5, z], [x, gy(a) + 19.6 + Math.sin(t * Math.PI) * 0.4, z], 0.16, 4, { colour: 0xf0f0ea }); } }
    for (const l of [-27, 27]) { const a = at(bridgeS - 15, l), b = at(bridgeS + 15, l); gg.beam([a.x, gy(a) + 19, a.z], [b.x, gy(b) + 19, b.z], 0.6, 6, { colour: blue }); gg.beam([a.x, gy(a) + 20.6, a.z], [b.x, gy(b) + 20.6, b.z], 0.2, 4, { colour: 0xf0f0ea }); }
    statics.at(M.solid, cyl0.x, cyl0.z).merge(gg, {});
    const leaf = new Geo(); leaf.box(2.6, 0.7, 14.2, { z: 7.1, colour: 0x3f79b6, ao: 0.2, top: 0x9fb6cf }); leaf.box(2.8, 0.2, 14.2, { y: 0.7, z: 7.1, colour: 0xf0f0ea, ao: 0 }); for (let i = 0; i < 7; i++) leaf.box(2.6, 1.3, 0.25, { y: 0.7, z: 1 + i * 2, colour: 0xd22f27, ao: 0 });
    const leafGeo = leaf.build(), leaves = [];
    for (const [s, l, back] of [[bridgeS - 15, -27, false], [bridgeS - 15, 27, false], [bridgeS + 15, -27, true], [bridgeS + 15, 27, true]]) {
      const p = at(s, l), grp = new THREE.Group(), m = new THREE.Mesh(leafGeo, M.solid); m.castShadow = true; grp.add(m);
      grp.position.set(p.x, gy(p) + 13.5, p.z); grp.rotation.y = p.yaw + (back ? Math.PI : 0); kit.add(grp); leaves.push({ grp, back });
    }
    // the same warning board at the approach, and one on the leap side saying the bridge can be jumped
    const board = (s, l, col) => { const p = at(s, l), y = gy(p); statics.at(M.solid, p.x, p.z).cyl(0.1, 0.12, 2.2, 6, { x: p.x, y, z: p.z, colour: 0x2f343d, ao: 0 }); statics.at(M.solid, p.x, p.z).box(3.0, 1.6, 0.14, { x: p.x, y: y + 2.2, z: p.z, ry: p.yaw + Math.PI, colour: col, ao: 0, top: col }); statics.at(M.solid, p.x, p.z).box(2.4, 0.5, 0.16, { x: p.x, y: y + 2.75, z: p.z, ry: p.yaw + Math.PI, colour: 0x14141a, ao: 0 }); };
    board(gateS - 60, -12.8, 0xffc21f); board(gateS - 60, 12.8, 0xffc21f); board(gateS - 34, 13.5, 0x2f6f3a);
    kit.animate((dt, t) => {
      const u = cyc(t, GATE.cycle, GATE.phase), a = armAngle(u), la = leafAngle(u);
      armL.rotation.z = a; armR.rotation.z = -a;
      for (const l of leaves) l.grp.rotation.x = -la;
      const closed = u >= GATE.down, warn = u >= GATE.warn && u < GATE.down, wag = Math.floor(t * 2.4) % 2;
      for (const { m, k } of lamps) m.material = closed ? ((k > 0) === !!wag ? lampMat.red : lampMat.dark) : warn ? lampMat.amber : lampMat.dark;
    });
  }

  // ---- Tube tunnel: a tiled tunnel over the Tube ribbon (fork 2), open at the cross-passage where the train crosses
  if (C.tube && train) {
    const T = C.tube, rb = T.rb, [t0, t1] = T.tunnelU, [g0, g1] = T.gapU, HW = 8.7, lights = new Geo(), tiles = new Geo(), roof = new Geo();
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff3c8, toneMapped: false }), amber = new THREE.MeshBasicMaterial({ color: 0xffa01e, toneMapped: false }), off = new THREE.MeshBasicMaterial({ color: 0x3a2210 });
    const P = (u, l = 0) => { const q = rb.at(u, {}); return { x: q.x + q.rx * l, z: q.z + q.rz * l, y: q.y, yaw: q.yaw }; };
    const inGap = (u) => u > g0 - 1 && u < g1 + 1;
    for (let u = t0; u < t1; u += 10) {
      const c = P(u + 5), gap = inGap(u + 5);
      if (!gap) roof.box(HW * 2 + 1.2, 0.9, 10.3, { x: c.x, y: c.y + 6.6, z: c.z, ry: c.yaw, colour: 0x777c88, ao: 0.4, top: 0x5c6a4a });
      if (!gap) lights.box(0.5, 0.12, 7.5, { x: c.x, y: c.y + 6.5, z: c.z, ry: c.yaw, colour: 0xffffff, ao: 0 });
      if (gap) continue;
      for (const l of [-1, 1]) {
        const w = P(u + 5, l * HW);
        tiles.box(0.5, 7.2, 10.1, { x: w.x, y: w.y - 0.6, z: w.z, ry: w.yaw, colour: TILE, ao: 0.2 });
        tiles.box(0.56, 0.5, 10.1, { x: w.x, y: w.y + 2.3, z: w.z, ry: w.yaw, colour: 0x2f5a78, ao: 0 });
        if (Math.round(u / 10) % 2 === 0) tiles.box(0.6, 7.3, 0.9, { x: w.x, y: w.y - 0.6, z: w.z, ry: w.yaw, colour: 0x9aa0aa, ao: 0.1 });
      }
    }
    const c0 = P((t0 + t1) / 2);
    statics.at(M.solid, c0.x, c0.z).merge(roof, {});
    statics.at(M.solid, c0.x, c0.z).merge(tiles, {});
    const lm = new THREE.Mesh(lights.build(), glowMat); lm.frustumCulled = false; kit.add(lm);
    // portals: heavy frames, the mouths in yellow-and-black chevrons so they read from a distance; the cross-passage has its own
    const portal = (u) => {
      const c = P(u), g = new Geo();
      for (const l of [-1, 1]) { const w = P(u, l * (HW + 0.2)); g.box(2.4, 8.4, 2.6, { x: w.x, y: w.y - 0.8, z: w.z, ry: c.yaw, colour: 0x7a7f8b, ao: 0.3 }); }
      g.box(HW * 2 + 3.6, 1.7, 2.6, { x: c.x, y: c.y + 6.5, z: c.z, ry: c.yaw, colour: 0x7a7f8b, ao: 0.3 });
      for (let k = -4; k <= 4; k++) { const q = P(u, k * 2.0); g.box(1.0, 0.7, 0.16, { x: q.x, y: q.y + 7.35, z: q.z, ry: c.yaw, colour: k % 2 ? 0xffc21f : 0x14141a, ao: 0 }); }
      statics.at(M.solid, c.x, c.z).merge(g, {});
    };
    portal(t0); portal(t1); portal(g0 - 1); portal(g1 + 1);
    // warning lamps for the cross-passage train, flashing amber before it arrives
    const lampMeshes = [];
    for (const [l, du] of [[-7.6, -9], [7.6, -9], [-7.6, 9], [7.6, 9]]) { const p = P(T.trainU + du, l), y = p.y; statics.at(M.solid, p.x, p.z).cyl(0.08, 0.1, 3.2, 6, { x: p.x, y, z: p.z, colour: 0x2f343d, ao: 0 }); const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), off); m.position.set(p.x, y + 3.5, p.z); kit.add(m); lampMeshes.push(m); }
    kit.animate((dt, t) => {
      const soon = train.position(t + 3.4).active || train.position(t).active, on = soon && Math.floor(t * 3) % 2 === 0;
      for (const m of lampMeshes) m.material = on ? amber : off;
    });
  }

  // ---- observation wheel in the park
  {
    const wx = WHEEL.x, wz = WHEEL.z, y = track.heightAt(wx, wz), R = 30, hub = R + 4, ry = 0.25;
    const leg = new Geo(); for (const k of [-1, 1]) { leg.beam([k * 9, 0, -2.2], [0, hub, -1.0], 0.55, 6, { colour: 0xf0f0ea }); leg.beam([k * 9, 0, 2.2], [0, hub, 1.0], 0.55, 6, { colour: 0xf0f0ea }); }
    statics.at(M.solid, wx, wz).merge(leg, { x: wx, y: y - 0.3, z: wz, ry });
    track.model.addCollider(wx, wz, 9);
    const rim = new Geo(); const N = 32;
    for (let i = 0; i < N; i++) { const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2; rim.beam([Math.cos(a0) * R, Math.sin(a0) * R, 0], [Math.cos(a1) * R, Math.sin(a1) * R, 0], 0.32, 5, { colour: 0xf0f0ea }); rim.beam([Math.cos(a0) * (R - 2.4), Math.sin(a0) * (R - 2.4), 0], [Math.cos(a1) * (R - 2.4), Math.sin(a1) * (R - 2.4), 0], 0.16, 4, { colour: 0x3f79b6 }); }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; rim.beam([0, 0, 0], [Math.cos(a) * R, Math.sin(a) * R, 0], 0.1, 4, { colour: 0xcfd6de }); }
    const wheel = new THREE.Group(), rm = new THREE.Mesh(rim.build(), M.solid); wheel.add(rm);
    const pod = new Geo(); pod.cyl(0.05, 0.05, 1.4, 4, { y: 0, colour: 0x777, ao: 0 }); pod.box(2.3, 1.7, 2.3, { y: -3.0, colour: 0xffffff, ao: 0.2, top: 0xf0f0ea }); pod.box(2.34, 0.7, 2.34, { y: -2.4, colour: 0x9fd3ff, ao: 0 }); pod.box(2.36, 0.24, 2.36, { y: -2.9, colour: RED, ao: 0 });
    const podGeo = pod.build(), pods = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, m = new THREE.Mesh(podGeo, M.solid); m.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); wheel.add(m); pods.push(m); }
    const root = new THREE.Group(); root.position.set(wx, y - 0.3 + hub, wz); root.rotation.y = ry; root.add(wheel); kit.add(root);
    kit.animate((dt, t) => { wheel.rotation.z = -t * 0.045; for (const m of pods) m.rotation.z = t * 0.045; });
  }
}

/** Retexture the shortcut decks: a pale tarmac park path and a cobbled market cut (the roadworks-stripe default stays on the canal ramp). */
export function dressDecks(kit) {
  if (kit.headless) return;
  const T = kit.tex, lit = kit.mat.lit;
  const cob = lit({ map: T.detailTexture({ kind: 'stone' }), color: 0x9a948a, roughness: 0.7 }, 'cobbles');
  for (const pf of kit.track.model.platforms) {
    const id = pf.def?.id ?? '';
    if (!pf.mesh) continue;
    if (id === 'market-cut') pf.mesh.material = cob;
  }
}

/** Anything that must keep clear of platforms and set-pieces (scenery placement filter). */
export function makeBlocked(kit) {
  const list = kit.track.model.platforms.map((p) => ({ x: p.x, z: p.z, fx: p.fx, fz: p.fz, L: p.length, W: p.width }));
  return (sp) => {
    for (const p of list) { const dx = sp.x - p.x, dz = sp.z - p.z, u = dx * p.fx + dz * p.fz, v = -dx * p.fz + dz * p.fx; if (u > -7 && u < p.L + 7 && Math.abs(v) < p.W / 2 + 6) return true; }
    if (Math.hypot(sp.x - WHEEL.x, sp.z - WHEEL.z) < 13) return true;                              // the wheel's feet
    for (const rb of kit.track.ribbons ?? []) if (rb.edgeDistance(sp.x, sp.z) < 7) return true;      // keep clear of the fork roads
    return false;
  };
}

// ------------------------------------------------------------------------------------------------------------------ fork furniture
/** Park Drive lamps and benches, the brook and the humpback parapets, and the signs that announce both forks. */
export function buildForkFurniture(kit, M, A, G, C) {
  if (kit.headless) return;
  const { statics, track } = kit, g = (p) => track.heightAt(p.x, p.z);
  const P = (rb, u, l = 0) => { const q = rb.at(u, {}); return { x: q.x + q.rx * l, z: q.z + q.rz * l, y: q.y, yaw: q.yaw }; };
  const sign = (p, id, y0 = 2.6) => {
    const y = track.heightAt(p.x, p.z);
    for (const k of [-1, 1]) { const x = p.x + Math.cos(p.yaw) * k * 2.4, z = p.z - Math.sin(p.yaw) * k * 2.4; statics.at(M.solid, x, z).cyl(0.09, 0.12, y0 + 0.4, 6, { x, y, z, colour: 0x2f343d, ao: 0 }); }
    statics.at(M.sign, p.x, p.z).panel(5.7, 1.0, { x: p.x, y: y + y0, z: p.z, ry: p.yaw + Math.PI, uv: A.signs.uv(id), colour: 0xffffff, ao: 0, both: true });
  };
  const at = (m, l) => G.at(G.S(m), l);
  sign(at('@parkA-34', 13.5), SIGN_IDS.parkdrive); sign(at('@parkA-34', -13.5), SIGN_IDS.kings);
  sign(at('@mktB-34', -13.5), SIGN_IDS.tube); sign(at('@mktB-34', 13.5), SIGN_IDS.hillroad);
  if (C.park) {
    const rb = C.park.rb, t = rb.total, lamp = lampGeo(), lantern = lanternGeo(), bench = benchGeo();
    for (let u = 40; u < t - 30; u += 34) for (const l of [-1, 1]) {
      if (Math.abs(u - C.park.bridgeU) < 14) continue;
      const p = P(rb, u, l * 9.6), y = g(p);
      statics.at(M.solid, p.x, p.z).merge(lamp, { x: p.x, y, z: p.z });
      statics.at(M.glow, p.x, p.z).merge(lantern, { x: p.x, y, z: p.z });
    }
    for (let u = 70; u < t - 60; u += 68) { const l = (Math.round(u / 68) % 2 ? 1 : -1), p = P(rb, u, l * 11.2); if (Math.abs(u - C.park.bridgeU) < 24) continue; statics.at(M.solid, p.x, p.z).merge(bench, { x: p.x, y: g(p) + 0.08, z: p.z, ry: p.yaw + (l > 0 ? Math.PI / 2 : -Math.PI / 2) }); }
    // the brook under the humpback bridge: a strip of water across the lawns and stone parapets either side of the crest
    const u = C.park.bridgeU, c = P(rb, u), stone = new Geo();
    for (const l of [-1, 1]) { const a = P(rb, u - 6, l * 8.9), b = P(rb, u + 6, l * 8.9); stone.beam([a.x, a.y + 0.6, a.z], [b.x, b.y + 0.6, b.z], 0.5, 6, { colour: 0xb9ad91 }); stone.box(0.9, 1.6, 0.9, { x: a.x, y: a.y - 0.5, z: a.z, colour: 0x8a8068, ao: 0.1 }); stone.box(0.9, 1.6, 0.9, { x: b.x, y: b.y - 0.5, z: b.z, colour: 0x8a8068, ao: 0.1 }); }
    statics.at(M.stone, c.x, c.z).merge(stone, {});
    const water = new Geo(), yaw = c.yaw;
    water.box(64, 0.05, 6.5, { x: c.x, y: g({ x: c.x - Math.cos(yaw) * 20, z: c.z + Math.sin(yaw) * 20 }) + 0.02, z: c.z, ry: yaw, colour: 0x3f6f86, ao: 0 });
    statics.at(M.solid, c.x, c.z).merge(water, {});
  }
}
