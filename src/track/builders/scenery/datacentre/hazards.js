// Data Centre set-pieces with gameplay: fan-wall gusts, laser-grid gates, robot tape-library arms, the firewall shutters and the shortcut
// gates. All timing runs on the shared rig clock (race.time), so the picture is what hits you; meshes are skipped headless.
import * as THREE from 'three';
import { makeRig, cyc, hazardCircle } from '../hazards/rig.js';
import { signTexture, sectorArch } from '../hazards/signs.js';
import { hdr } from './util.js';

export const GUST = { period: 7.2, warn: 1.1, blow: 1.7, force: 6.2 };
/** Fan gust at time t: dir +1 = blowing to the right, -1 = to the left, 0 = still; warn = spinning up for `dir` next. */
export function gustState(t) {
  const u = cyc(t, GUST.period) * GUST.period, h = GUST.period / 2;
  const k = u >= h ? 1 : 0, v = u - k * h, dir = k ? -1 : 1;
  if (v < GUST.warn) return { dir: 0, warn: dir, u: v };
  if (v < GUST.warn + GUST.blow) return { dir, warn: 0, u: v };
  return { dir: 0, warn: 0, u: v };
}

/** Half gate (lasers, tape shelves): 4.4 s cycle. half 0 = left shut, 1 = right shut, -1 = open; warn = the side about to shut. */
export function halfGate(t, phase = 0) {
  const u = cyc(t, 4.4, phase * 4.4) * 4.4;
  if (u < 1.8) return { half: 0, warn: -1 };
  if (u < 2.2) return { half: -1, warn: 1 };
  if (u < 4.0) return { half: 1, warn: -1 };
  return { half: -1, warn: 0 };
}

/** Shutter bays: bay k is shut for `shut` of every `period` s, staggered by `stride`. Returns { closed, warn } (warn: about to shut). */
export function bayState(t, k, period = 6, open = 2.6, stride = 2) {
  const u = cyc(t, period, -k * stride) * period;
  return { closed: u >= open, warn: u >= open - 0.6 && u < open };
}

const ARM = { period: 5.6, len: 10.5, pivotLat: 13.2, h: 8.4 };
const armAngle = (t, k) => (((t / ARM.period) + k * 0.37) % 1) * Math.PI * 2;

export function installDatacentreHazards(kit, ctx) {
  const { R, M, CUTS } = ctx, track = kit.track, rig = makeRig(kit), vis = !kit.headless, S = R.S, L = track.length;
  const road = (s, lat = 0) => R.at(s, lat);

  // ------------------------------------------------------------ fan-wall gusts: sideways pushes on the climb
  const gz0 = S('boost1', 30), gz1 = S('top', 60);
  rig.kart((kart, dt, race, t) => {
    const s = kart.ground.s;
    if (s < gz0 || s > gz1) return;
    const g = gustState(t);
    if (!g.dir) return;
    const sm = track.sample(s);
    kart.applyForce({ x: sm.right.x * g.dir * GUST.force, y: 0, z: sm.right.z * g.dir * GUST.force }, 0.12);
  });
  if (vis) {
    const left = new THREE.MeshBasicMaterial({ color: 0x22d3ee, toneMapped: false }), right = left.clone();
    const geo = new THREE.BoxGeometry(0.35, 3.4, 5);
    for (let s = gz0 + 8; s < gz1; s += 22) for (const sg of [-1, 1]) {
      const p = road(s, sg * 11.6), tex = null;
      const m = new THREE.Mesh(geo, sg < 0 ? left : right);
      m.position.set(p.x, p.y + 2.2, p.z); m.rotation.y = p.yaw; kit.add(m);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5.4, 6), M.steel); post.position.set(p.x - Math.cos(p.yaw) * sg * 0.55, p.y + 2.3, p.z + Math.sin(p.yaw) * sg * 0.55); post.rotation.y = p.yaw; kit.add(post);
    }
    // (the left nozzles blow to the right: they light when dir = +1)
    rig.look((t) => {
      const g = gustState(t), pulse = 0.5 + 0.5 * Math.sin(t * 16);
      const set = (mat, blowing, warning) => {
        if (blowing) mat.color.setRGB(2.6, 2.6, 3.4);
        else if (warning) mat.color.setRGB(2.4 * pulse + 0.5, 1.2 * pulse + 0.2, 0.05);
        else mat.color.setRGB(0.05, 0.4, 0.55);
      };
      set(left, g.dir === 1, g.warn === 1); set(right, g.dir === -1, g.warn === -1);
    });
  }

  // ------------------------------------------------------------ gates built from two half obstacles + beams (roads and shortcut decks)
  const gates = [];
  /** frame: { x, y, z, yaw }; halfW: half the passage width; kind 'laser' | 'shelf' */
  function halfGateAt(id, frame, halfW, phase, kind = 'laser', hit = 'bump') {
    const cx = Math.cos(frame.yaw), cz = -Math.sin(frame.yaw), off = halfW * 0.5, rad = halfW * 0.5 - 0.35;
    const obs = [-1, 1].map((sg) => hazardCircle(kit, { id: `${id}:${sg}`, kind: 'gate', x: frame.x + cx * sg * off, z: frame.z + cz * sg * off, y: frame.y, radius: rad, hit }));
    const g = { obs, phase, id, frame, halfW, kind, mats: null };
    gates.push(g);
    if (vis) {
      const mats = [0, 1].map(() => new THREE.MeshBasicMaterial({ color: 0x220a0a, toneMapped: false, transparent: true, opacity: 1 }));
      g.mats = mats;
      const grp = new THREE.Group(); grp.position.set(frame.x, frame.y, frame.z); grp.rotation.y = frame.yaw;
      const frameMat = M.steel;
      for (const sg of [-1, 0, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, kind === 'laser' ? 3.6 : 4.2, 0.7), frameMat); p.position.set(sg * halfW, kind === 'laser' ? 1.8 : 2.1, 0); grp.add(p); }
      const top = new THREE.Mesh(new THREE.BoxGeometry(2 * halfW + 0.8, 0.6, 0.8), frameMat); top.position.y = kind === 'laser' ? 3.7 : 4.3; grp.add(top);
      const bh = kind === 'laser' ? [0.5, 1.2, 1.9, 2.6] : [0.9, 2.1, 3.3];
      [0, 1].forEach((side) => {
        const sg = side ? 1 : -1;
        for (const y of bh) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(halfW - 0.5, kind === 'laser' ? 0.09 : 0.85, kind === 'laser' ? 0.09 : 0.5), mats[side]);
          bar.position.set(sg * halfW * 0.5, y, 0); grp.add(bar);
        }
      });
      kit.add(grp);
    }
    return g;
  }
  rig.state((t) => {
    for (const g of gates) { const h = halfGate(t, g.phase); g.obs[0].active = h.half === 0; g.obs[1].active = h.half === 1; }
  });
  rig.look((t) => {
    const pulse = 0.55 + 0.45 * Math.sin(t * 22);
    for (const g of gates) {
      if (!g.mats) continue;
      const h = halfGate(t, g.phase);
      g.mats.forEach((m, side) => {
        if (h.half === side) m.color.setRGB(g.kind === 'laser' ? 3.2 : 2.6, g.kind === 'laser' ? 0.15 : 0.5, 0.1), m.opacity = 1;
        else if (h.warn === side) m.color.setRGB(3 * pulse, 1.6 * pulse, 0.1), m.opacity = 1;
        else m.color.setRGB(0.05, 0.5, 0.6), m.opacity = 0.25;
      });
    }
  });

  // laser grid on the jump leg (road)
  for (const [k, off] of [[0, -100], [1, -56]]) {
    const p = road(S('jump', off));
    halfGateAt(`laser${k}`, p, 9, k * 0.5, 'laser', 'bump');
  }
  // fork 2: the short way (the straight) is gated; the patch-bay side road is open but longer
  halfGateAt('laser-bay', road(S('fk2a', 78)), 9, 0.25, 'laser', 'bump');

  // ------------------------------------------------------------ shortcut gates
  {
    const [T2, T3] = [CUTS[1], CUTS[2]];
    for (const [k, f] of [[0, 0.3], [1, 0.62]]) {
      const u = T2.deck.length * f, p = T2.dp(u, 0);
      halfGateAt(`shelf${k}`, { x: p.x, y: R.Y0, z: p.z, yaw: T2.deck.yaw }, 5.5, 0.25 + k * 0.5, 'shelf', 'bump');
    }
    // the battery yard: two shutter bays across the deck
    const bays = [];
    [0.35, 0.68].forEach((f, j) => {
      const u = T3.deck.length * f, w = 11, p = T3.dp(u, 0), yaw = T3.deck.yaw, cx = Math.cos(yaw), cz = -Math.sin(yaw);
      [-1, 1].forEach((sg, i) => {
        const ob = hazardCircle(kit, { id: `yard${j}:${i}`, kind: 'shutter', x: p.x + cx * sg * w * 0.25, z: p.z + cz * sg * w * 0.25, y: R.Y0, radius: 2.3, hit: 'bump' });
        bays.push({ ob, k: j * 2 + i, mesh: null, p, yaw, sg, w });
      });
    });
    ctx._yardBays = bays; ctx._bayHook = bays;
  }

  // ------------------------------------------------------------ firewall: three shutters on the last straight
  const fwS = L - 96;
  const fw = [-6, 0, 6].map((lat, i) => {
    const p = road(fwS, lat);
    return { i, lat, p, ob: hazardCircle(kit, { id: `fw${i}`, kind: 'firewall', x: p.x, z: p.z, y: p.y, radius: 3.05, hit: 'bump' }), mesh: null };
  });
  const allBays = () => [...(ctx._yardBays ?? []).map((b) => ({ ...b, fw: false }))];
  rig.state((t) => {
    for (const f of fw) f.ob.active = bayState(t, f.i, 6.4, 2.8, 2.1).closed;
    for (const b of ctx._yardBays ?? []) b.ob.active = bayState(t, b.k, 5, 3, 2.5).closed;
  });
  if (vis) {
    const shutter = (p, w, yaw, hex) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0x1a5566, toneMapped: false });
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 4.2, 0.55), mat); m.rotation.y = yaw; m.position.set(p.x, p.y + 2.1, p.z); kit.add(m);
      return { m, mat, y: p.y };
    };
    for (const f of fw) { f.mesh = shutter({ x: f.p.x, y: f.p.y, z: f.p.z }, 5.6, f.p.yaw); }
    for (const b of ctx._yardBays) { b.mesh = shutter({ x: b.ob.pos.x, y: R.Y0, z: b.ob.pos.z }, 4.6, b.yaw); }
    // frame: gantry over the firewall
    const p0 = road(fwS), post = new THREE.BoxGeometry(1, 9, 1);
    for (const sg of [-1, 1]) { const q = road(fwS, sg * 10.6), pm = new THREE.Mesh(post, M.steel); pm.position.set(q.x, q.y + 4.5, q.z); kit.add(pm); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(22.6, 1, 1), M.steel); beam.position.set(p0.x, p0.y + 9, p0.z); beam.rotation.y = p0.yaw; kit.add(beam);
    const tex = signTexture('FIREWALL', 'stay in the open bay', 0xff5533, { w: 1024, h: 200 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 14 * 200 / 1024), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }));
    sign.position.set(p0.x, p0.y + 7.7, p0.z); sign.rotation.y = p0.yaw + Math.PI; kit.add(sign);
    const paint = (b, closed, warn, t, drop) => {
      const shut = closed ? 1 : warn ? 0.5 : 0;
      b.m.position.y = b.y + 2.1 + (closed ? 0 : warn ? 1.6 : 4.4);
      if (closed) b.mat.color.setRGB(3, 0.35, 0.08);
      else if (warn) b.mat.color.setRGB(3 * (0.5 + 0.5 * Math.sin(t * 24)), 1.6, 0.1);
      else b.mat.color.setRGB(0.05, 0.6, 0.5);
    };
    rig.look((t) => {
      for (const f of fw) { const s = bayState(t, f.i, 6.4, 2.8, 2.1); paint(f.mesh, s.closed, s.warn, t); }
      for (const b of ctx._yardBays) { const s = bayState(t, b.k, 5, 3, 2.5); paint(b.mesh, s.closed, s.warn, t); }
    });
  }

  // ------------------------------------------------------------ tape-library robot arms on the north leg
  const arms = [[30, -1], [72, 1], [112, -1]].map(([off, sg], k) => {
    const s = S('bk0', off), piv = road(s, sg * ARM.pivotLat);
    const ob = hazardCircle(kit, { id: `arm${k}`, kind: 'arm', x: piv.x, z: piv.z, y: piv.y, radius: 1.9, hit: 'bump', active: true });
    return { k, sg, piv, road: road(s), ob };
  });
  const tip = (a, t) => {
    const th = armAngle(t, a.k), c = Math.cos(th), sn = Math.sin(th) * a.sg * -1, r = a.road;
    // sweeps from along the road towards the far edge: local (forward c, toward-road sn)
    const rx = -r.tz, rz = r.tx, side = -a.sg;      // toward the road centre from the pivot
    const f = c, w = Math.sin(th);
    return { x: a.piv.x + (r.tx * f + rx * side * w) * ARM.len, z: a.piv.z + (r.tz * f + rz * side * w) * ARM.len, th, dx: r.tx * f + rx * side * w, dz: r.tz * f + rz * side * w };
  };
  rig.state((t) => { for (const a of arms) { const q = tip(a, t); a.ob.pos.x = q.x; a.ob.pos.z = q.z; } });
  if (vis) {
    for (const a of arms) {
      const g = new THREE.Group(); g.position.set(a.piv.x, a.piv.y + ARM.h, a.piv.z);
      const mast = new THREE.Mesh(new THREE.BoxGeometry(1.6, ARM.h + 1, 1.6), M.steel); mast.position.set(a.piv.x, a.piv.y + ARM.h / 2, a.piv.z); kit.add(mast);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, ARM.len + 1), M.steel); beam.position.z = ARM.len / 2; g.add(beam);
      const lamp = new THREE.MeshBasicMaterial({ color: hdr(0xff8a00, 2.4), toneMapped: false });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, ARM.len), lamp); strip.position.set(0, -0.42, ARM.len / 2); g.add(strip);
      const cable = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.12), M.steel), claw = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 2.2), new THREE.MeshBasicMaterial({ color: hdr(0xff8a00, 1.8), toneMapped: false }));
      kit.add(g, cable, claw);
      const cy = a.piv.y + 1.4, top = a.piv.y + ARM.h - 0.4;
      cable.scale.y = top - cy; a.g = g; a.cable = cable; a.claw = claw; a.cy = cy; a.top = top; a.lamp = lamp;
    }
    rig.look((t) => {
      for (const a of arms) {
        const q = tip(a, t); a.g.rotation.y = Math.atan2(q.dx, q.dz);
        a.cable.position.set(q.x, (a.cy + a.top) / 2, q.z); a.claw.position.set(q.x, a.cy, q.z); a.claw.rotation.y = t;
      }
    });
  }

  // ------------------------------------------------------------ named arches (each sector gets its own colour and title)
  if (vis) {
    const mats = { dark: M.steel, glow: M.neon };
    const A = [
      ['boost1', 34, 'FAN WALL', 'gusts: lean into the wind', 0x22d3ee], ['top', 40, 'CLOUD ATRIUM', 'glass tunnel', 0x7dd3fc],
      ['sp0', 8, 'THE CORE', '540 spiral: hug the inside pads', 0xff3fd8], ['exit', 42, 'HOT AISLE', '41 C · banked esses', 0xff8a00],
      ['fk1a', -34, 'FORK: COLD OR HOT', 'bulge = fast · service lane = short', 0x22d3ee],
      ['pre', -44, 'CABLE TRENCH', 'left cut: weave the oil', 0xff3fd8], ['dl1', -60, 'BATTERY YARD', 'right cut: dodge the shutters', 0xffb020],
      ['jump', -150, 'LASER GRID', 'wait for the open side', 0xff4a3a], ['bk0', 6, 'TAPE LIBRARY', 'watch the robot arms', 0xa78bfa],
      ['br0', -36, 'THE BRIDGE', 'climb over the return straight', 0x7dd3fc], ['tear1', 52, 'HOT AISLE', 'under the bridge', 0xff8a00],
      ['fk2a', -30, 'FORK: PATCH BAY', 'straight = short · side road = boosts', 0xff2fb0],
    ];
    for (const [m, o, title, sub, colour] of A) sectorArch(kit, { s: kit.S ? kit.S(`@${m}${o >= 0 ? '+' : ''}${o}`) : S(m, o), title, sub, colour, mats, height: 9.4, board: 16 });
  }

  rig.install();
}
