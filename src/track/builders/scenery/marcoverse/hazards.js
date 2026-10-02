// Marcoverse set-pieces with gameplay: the glitch bridge (flickering tiles + sliding ferry), the warp ring, the Plunge's gravity lens,
// glitch boost tiles in the Esses, security gates in the tube. Gameplay (obstacles, platform flags, kart hooks) is built headless too;
// meshes are skipped headless. All timing comes from the shared rig (see ../hazards/rig.js), so the picture is what hits you.
import * as THREE from 'three';
import { bus } from '../../../../core/bus.js';
import { makeRig, cyc, smooth, shiftPlatform, hazardCircle, warpKart } from '../hazards/rig.js';
import { MS } from './shortcuts.js';
import { PALETTE } from './palette.js';
import { hot, frameMatrix } from './util.js';
import { signTexture } from '../hazards/signs.js';

const _c = new THREE.Color(), _c2 = new THREE.Color();

/** Glitch tile k is lit (solid) or dark at time t. Off for MS.glitchOff of every cycle; tile k is 1.55 s behind tile k-1. */
export const tileState = (k, t) => {
  const P = MS.glitchOn + MS.glitchOff, u = cyc(t, P, -k * 1.55) * P;
  return { on: u < MS.glitchOn, warn: u >= MS.glitchOn - 0.8 && u < MS.glitchOn, u };
};

/** Ferry offset (m across the deck) at t: 6 s aligned, 0.7 s slide out, 1.6 s away, 0.7 s back; alternating side each cycle. */
export const FERRY = { period: 9, aligned: 6, slide: 0.7, out: 14 };
export const ferryOffset = (t) => {
  const P = FERRY.period, n = Math.floor(t / P), u = t - n * P, side = n & 1 ? -1 : 1;
  if (u < FERRY.aligned) return 0;
  if (u < FERRY.aligned + FERRY.slide) return side * FERRY.out * smooth(0, FERRY.slide, u - FERRY.aligned);
  if (u < P - FERRY.slide) return side * FERRY.out;
  return side * FERRY.out * (1 - smooth(0, FERRY.slide, u - (P - FERRY.slide)));
};

/** Security gate phase: which half is shut. 0 = left, 1 = right, -1 = both open (transition). Period 4 s. */
export const gateState = (t, phase = 0) => {
  const u = cyc(t, 4, phase * 4) * 4;
  if (u < 1.75) return { half: 0, u }; if (u < 2) return { half: -1, u };
  if (u < 3.75) return { half: 1, u }; return { half: -1, u };
};

export function installHazards(kit, ctx) {
  const { track } = kit, model = track.model, rig = makeRig(kit), { SC, M } = ctx, L = track.length;
  const pf = (id) => model.platforms.find((p) => p.def?.id === id);
  const vis = !kit.headless;

  // ---------------------------------------------------------------- glitch bridge tiles + ferry
  const tiles = [1, 2, 3, 4].map((i) => pf(`gb:${i}`)).filter(Boolean);
  const ferryPf = pf('gb:ferry');
  const tileMeshes = [];
  if (vis) {
    const mat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    tiles.forEach((p) => {
      const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(p.width, 0.55, p.length), mat());
      m.position.y = -0.3;
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(p.width, 0.55, p.length)), new THREE.LineBasicMaterial({ color: 0x8b5cff, toneMapped: false, transparent: true, opacity: 0.55 }));
      edge.position.y = -0.3;
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(p.width - 1, p.length - 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x22d3ee, toneMapped: false, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.y = 0.0;
      g.add(m, edge, glow);
      g.position.set(p.x + p.fx * p.length / 2, (p.y0 + p.y1) / 2, p.z + p.fz * p.length / 2); g.rotation.y = p.yaw;
      kit.add(g); tileMeshes.push({ g, m, edge, glow, p });
      if (p.mesh) p.mesh.visible = false;
    });
  }
  let ferryG = null;
  if (ferryPf && vis) {
    ferryPf.mesh && (ferryPf.mesh.visible = false);
    const g = new THREE.Group(), p = ferryPf;
    const body = new THREE.Mesh(new THREE.BoxGeometry(p.width, 0.8, p.length), new THREE.MeshStandardMaterial({ color: 0x252a78, emissive: 0x1a2a90, emissiveIntensity: 0.8, roughness: 0.4, metalness: 0.5 }));
    body.position.y = -0.45;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(p.width - 0.6, p.length - 0.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: hot(PALETTE.yellow, 1.2), toneMapped: false, transparent: true, opacity: 0.9 }));
    top.position.y = 0.02;
    const lamps = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3dffb0, toneMapped: false }));
      l.position.set(sx * (p.width / 2 - 0.4), 0.35, sz * (p.length / 2 - 0.4)); g.add(l); lamps.push(l);
    }
    g.add(body, top);
    g.position.set(p.x + p.fx * p.length / 2, (p.y0 + p.y1) / 2, p.z + p.fz * p.length / 2); g.rotation.y = p.yaw;
    kit.add(g); ferryG = { g, lamps, top };
  }
  rig.state((t) => {
    tiles.forEach((p, k) => { p.enabled = tileState(k, t).on; });
    if (ferryPf) { const o = ferryOffset(t); shiftPlatform(ferryPf, ferryPf.rx * o, ferryPf.rz * o); }
  });
  rig.look((t) => {
    tileMeshes.forEach((tm, k) => {
      const st = tileState(k, t), fl = st.warn ? (Math.sin(t * 46 + k * 3) > 0 ? 1 : 0.15) : 1;
      tm.m.visible = st.on; tm.glow.visible = st.on && fl > 0.5; tm.edge.visible = true;
      tm.m.material.color.copy(_c.set(PALETTE.cyan)).lerp(_c2.set(PALETTE.magenta), st.warn ? 0.7 : 0.15 + 0.1 * Math.sin(t * 5 + k)).multiplyScalar(0.55 * fl + 0.2);
      tm.edge.material.opacity = st.on ? 0.7 : 0.3 + 0.2 * Math.sin(t * 9 + k);
    });
    if (ferryG) {
      const o = ferryOffset(t), P = FERRY.period, u = t - Math.floor(t / P) * P, warn = u > FERRY.aligned - 1 && u < FERRY.aligned, away = Math.abs(o) > 3;
      ferryG.g.position.set(ferryPf.x + ferryPf.fx * ferryPf.length / 2, (ferryPf.y0 + ferryPf.y1) / 2, ferryPf.z + ferryPf.fz * ferryPf.length / 2);
      const col = away ? 0xff3b3b : warn ? (Math.sin(t * 24) > 0 ? 0xffb020 : 0x301800) : 0x3dffb0;
      for (const l of ferryG.lamps) l.material.color.set(col).multiplyScalar(2);
    }
  });

  // ---------------------------------------------------------------- warp ring: fly through it while boosting
  const ring = SC.ring, warp = SC.warp;
  rig.kart((kart) => {
    if (kart.grounded || kart.boost.time <= 0.05 || kart.status.respawning > 0) return;
    const dx = kart.pos.x - ring.x, dy = kart.pos.y - ring.y, dz = kart.pos.z - ring.z;
    if (dx * dx + dy * dy + dz * dz > ring.r * ring.r) return;
    warpKart(track, kart, warp.toS, 0, 1.2, 0.97);
    kart.applyBoost(0.9, 0.9, 'pad');
    bus.emit('track:warp', { id: kart.id });
  });
  let ringSpin = null;
  if (vis) {
    const g = new THREE.Group(); g.position.set(ring.x, ring.y, ring.z); g.rotation.y = ring.yaw;
    const torus = (r, tube, col, k) => new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), toneMapped: false }));
    const outer = torus(ring.r, 0.42, PALETTE.magenta, 2.6), mid = torus(ring.r * 0.82, 0.16, PALETTE.cyan, 2.2), core = new THREE.Mesh(new THREE.CircleGeometry(ring.r * 0.8, 40), new THREE.MeshBasicMaterial({ color: hot(PALETTE.violet, 0.9), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const arcs = new THREE.Mesh(new THREE.TorusGeometry(ring.r * 0.62, 0.14, 6, 40, Math.PI * 1.4), new THREE.MeshBasicMaterial({ color: hot(PALETTE.mint, 2.4), toneMapped: false }));
    g.add(outer, mid, core, arcs);
    // the ring stands facing the kicker (its axis = flight direction), a sign hangs above the kicker
    kit.add(g); ringSpin = { mid, arcs, outer };
    const tex = signTexture('OVERCLOCK GATE', 'boost through the ring to warp', PALETTE.magenta, { w: 1024, h: 160 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 14 * 160 / 1024), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }));
    const kk = SC.kick; sign.position.set(kk.x - Math.sin(kk.yaw) * 6 + Math.cos(kk.yaw) * 0, kk.y0 + 9.5, kk.z - Math.cos(kk.yaw) * 6); sign.rotation.y = kk.yaw + Math.PI;
    kit.add(sign);
    rig.look((t) => {
      arcs.rotation.z = t * 2.4; mid.rotation.z = -t * 1.2;
      const pulse = 0.75 + 0.25 * Math.sin(t * 4); outer.material.color.set(PALETTE.magenta).multiplyScalar(2.6 * pulse);
    });
  }

  // ---------------------------------------------------------------- the Plunge's gravity lens: half gravity while airborne in the dive
  const gz0 = track.S('@dive0+30'), gz1 = track.S('@dip+40');
  rig.kart((kart) => {
    const s = kart.ground.s;
    if (s < gz0 || s > gz1 || kart.grounded) return;
    kart.applyForce({ x: 0, y: 15, z: 0 }, 0.1);
  });
  if (vis) {
    const rings = [];
    const geo = new THREE.TorusGeometry(13.2, 0.22, 6, 64);        // (clear of the viaduct, 20 m up at the valley floor)
    for (let s = gz0 + 10; s < gz1; s += 36) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hot(PALETTE.cyan, 1.4), toneMapped: false, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      const M4 = frameMatrix(track, s, 4.6); m.matrixAutoUpdate = false; m.matrix.copy(M4); kit.add(m); rings.push(m);
    }
    rig.look((t) => { rings.forEach((m, i) => { const w = 0.5 + 0.5 * Math.sin(t * 2.2 - i * 0.6); m.material.opacity = 0.25 + 0.6 * w * w; }); });
  }

  // ---------------------------------------------------------------- glitch boost tiles in the Esses
  const gl = [];
  const esS = [track.S('@e1') - 62, track.S('@e1') - 22, track.S('@e1') + 18, track.S('@e1') + 58, track.S('@e2') - 24, track.S('@e2') + 16];
  esS.forEach((s, k) => {
    const lat = k % 2 ? 7 : -7, patch = model.addPatch({ kind: 'road', s, lateral: lat, length: 11, width: 6.5 });   // outboard: the middle 7.5 m stays clear (the AI's line is held there, a boost into a bend at 47 m/s is not takeable)
    gl.push({ s, lat, patch, k });
  });
  model._indexPatches();
  const glitchOn = (k, t) => { const u = cyc(t, 3.2, -k * 0.9) * 3.2; return u < 2.0; };
  rig.state((t) => { for (const g of gl) g.patch.kind = glitchOn(g.k, t) ? 'boost' : 'road'; });
  if (vis) {
    const plane = new THREE.PlaneGeometry(6.5, 11).rotateX(-Math.PI / 2);
    gl.forEach((g) => {
      const mesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: 0x22d3ee, toneMapped: false, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
      const M4 = frameMatrix(track, g.s, 0.08, undefined, g.lat); mesh.matrixAutoUpdate = false; mesh.matrix.copy(M4); kit.add(mesh); g.mesh = mesh;
    });
    rig.look((t) => {
      for (const g of gl) {
        const u = cyc(t, 3.2, -g.k * 0.9) * 3.2, on = u < 2.0, warn = u > 1.55 && u < 2.0, fl = warn ? (Math.sin(t * 40 + g.k) > 0 ? 1 : 0.1) : 1;
        g.mesh.material.color.copy(on ? _c.set(0x3dffe0).multiplyScalar(1.5 * fl) : _c.set(PALETTE.violet).multiplyScalar(0.18 + 0.1 * Math.sin(t * 13 + g.k * 5)));
        g.mesh.material.opacity = on ? 0.85 : 0.5;
      }
    });
  }

  // ---------------------------------------------------------------- security gates in the tube: one half shut at a time
  const gates = [track.S('@h2') + 128, track.S('@tube') + 56].map((s, i) => {
    track.surfacePoint(s, 0, new THREE.Vector3());
    const mk = (side) => {
      const v = new THREE.Vector3(); track.surfacePoint(s, side * 6.4, v);
      return hazardCircle(kit, { id: `gate${i}${side > 0 ? 'r' : 'l'}`, kind: 'gate', x: v.x, z: v.z, y: v.y, radius: 5.8, hit: 'bump' });
    };
    return { s, i, L: mk(-1), R: mk(1), phase: i * 0.5 };
  });
  rig.state((t) => { for (const g of gates) { const st = gateState(t, g.phase); g.L.active = st.half === 0; g.R.active = st.half === 1; } });
  if (vis) {
    for (const g of gates) {
      const sm = track.sample(g.s), hw = sm.width / 2, yaw = Math.atan2(sm.tangent.x, sm.tangent.z);
      const grp = new THREE.Group(); grp.position.set(sm.pos.x, sm.pos.y, sm.pos.z); grp.rotation.y = yaw;
      const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(hw + 1.4, 0.35, 8, 48, Math.PI), new THREE.MeshBasicMaterial({ color: hot(PALETTE.cyan, 2), toneMapped: false }));
      ringMesh.position.y = -0.2;
      const half = (side) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(hw, 5.2), new THREE.MeshBasicMaterial({ color: 0xff2d55, transparent: true, opacity: 0.4, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
        m.position.set(side * hw / 2, 2.6, 0); return m;
      };
      const hl = half(-1), hr = half(1);
      grp.add(ringMesh, hl, hr); kit.add(grp); g.vis = { hl, hr, ringMesh };
    }
    rig.look((t) => {
      for (const g of gates) {
        const st = gateState(t, g.phase), warn = st.half === -1 || (st.half === 0 && st.u > 1.3 && st.u < 1.75) || (st.half === 1 && st.u > 3.3 && st.u < 3.75);
        const fl = warn ? (Math.sin(t * 30) > 0 ? 1 : 0.35) : 1;
        g.vis.hl.visible = st.half === 0; g.vis.hr.visible = st.half === 1;
        for (const m of [g.vis.hl, g.vis.hr]) m.material.opacity = 0.42 * fl;
        g.vis.ringMesh.material.color.set(st.half === -1 ? 0x3dffb0 : PALETTE.cyan).multiplyScalar(2);
      }
    });
  }

  rig.install();
  return { tiles, ferryPf, gl, gates, rig };
}
