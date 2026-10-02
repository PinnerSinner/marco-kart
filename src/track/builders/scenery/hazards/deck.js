// Straight "chord" decks laid across the void (or across an open floor) from one point of the road to another: the raw material of the
// shortcuts. A chord is cut into segments (solid deck, jump ramp, gap, boost pad, flickering glitch tiles, sliding ferry deck); each becomes
// a world-placed Platform (see TRACKDEF section 6) whose top is solid even over the void.
import * as THREE from 'three';
import { Centerline } from '../../Centerline.js';
import { Geo } from '../../Geo.js';

/** Road numbers before a Track exists: `at(s, lat)` world point / heading, `S('mark', off)` metres. */
export function makeRoute(points, { spacing = 2, width = 18 } = {}) {
  const cl = new Centerline(points, { spacing, width }), E = {};
  const S = (m, o = 0) => (typeof m === 'number' ? m : cl.marks[m]) + o;
  const at = (s, lat = 0) => {
    cl.eval(((s % cl.length) + cl.length) % cl.length, E);
    return { x: E.x - E.tz * lat, y: E.y - lat * E.tanB, z: E.z + E.tx * lat, tx: E.tx, tz: E.tz, yaw: Math.atan2(E.tx, E.tz), width: E.width };
  };
  return { cl, S, at, length: cl.length };
}

/**
 * Solve a straight approach chord from A to a road point B that ends in a tangential arc, so the deck merges onto the road along its heading.
 * @param {{x:number,z:number}} A start point @param {{x:number,z:number,yaw:number}} B end pose (world heading yaw of the road there)
 * @param {number} r merge arc radius @returns {{ yaw:number, length:number, turn:number, arcLen:number }} turn = signed yaw change over the arc (- = right)
 */
export function solveApproach(A, B, r) {
  let psi = Math.atan2(B.x - A.x, B.z - A.z), turn = 0, L = 0;
  for (let it = 0; it < 12; it++) {
    turn = Math.atan2(Math.sin(B.yaw - psi), Math.cos(B.yaw - psi));
    const sg = turn < 0 ? -1 : 1, a = Math.abs(turn);
    // displacement of the arc in the frame of the chord: forward f, right-hand lateral q (right = (-cos psi, sin psi))
    const f = r * Math.sin(a), q = -sg * r * (1 - Math.cos(a));           // right turn (sg -1): moves to the right (+q)... expressed along right axis
    const fx = Math.sin(psi), fz = Math.cos(psi), rx = -Math.cos(psi), rz = Math.sin(psi);
    const px = B.x - (fx * f + rx * q), pz = B.z - (fz * f + rz * q);
    psi = Math.atan2(px - A.x, pz - A.z); L = Math.hypot(px - A.x, pz - A.z);
  }
  return { yaw: psi, length: L, turn, arcLen: r * Math.abs(turn) };
}

/**
 * Lay a deck along a turtle path (straights and arcs) as world-placed Platforms.
 * steps: { t: 'solid'|'ramp'|'gap'|'pad'|'glitch'|'slide', len } for a straight piece, or { t, arc: { r, deg } } (deg < 0 = right) for a curve.
 * Curves are cut into ~6 m chunks (each a straight Platform with a little overlap). Heights run linearly from y0 to y1 over the whole length.
 * @returns {{ id, pieces, specs, length, end:{x,z,yaw}, at:(u:number, v?:number)=>{x:number,z:number,yaw:number} }}
 */
export function pathDeck(o) {
  const W = o.width ?? 13;
  let x = o.x, z = o.z, yaw = o.yaw, u = 0;
  const total = o.steps.reduce((a, s) => a + (s.arc ? Math.abs(s.arc.r * s.arc.deg * Math.PI / 180) : s.len), 0);
  const yAt = (uu) => o.y0 + (((o.y1 ?? o.y0) - o.y0) * uu) / (total || 1);
  const pieces = [], specs = [], poses = [];
  o.steps.forEach((sg, i) => {
    const arcLen = sg.arc ? Math.abs(sg.arc.r * sg.arc.deg * Math.PI / 180) : 0, len = sg.arc ? arcLen : sg.len;
    const w = sg.width ?? W, id = `${o.id}:${i}`;
    const chunks = sg.arc ? Math.max(1, Math.ceil(len / 6)) : 1, sub = len / chunks;
    const dYaw = sg.arc ? (sg.arc.deg * Math.PI / 180) / chunks : 0, sgn = sg.arc ? (sg.arc.deg < 0 ? -1 : 1) : 0;
    const chunkIds = [];
    for (let k = 0; k < chunks; k++) {
      // heading at the middle of the chunk
      const ym = yaw + dYaw / 2, chord = sg.arc ? 2 * sg.arc.r * Math.sin(Math.abs(dYaw) / 2) : sub;
      const sx = x, sz = z;
      // start of the chunk = current point; a chunk is laid as a straight piece with the mean heading
      const pid = chunks > 1 ? `${id}.${k}` : id, len2 = sg.arc ? chord + 1.2 : sub, y0 = yAt(u), y1 = yAt(u + sub);
      if (sg.t !== 'gap') {
        const base = { id: pid, x: sx, z: sz, yaw: ym, length: len2, width: w, surface: 'road', road: true };
        let spec;
        if (sg.t === 'ramp') spec = { ...base, kind: 'ramp', y0, y1: y0 + (sg.rise ?? 2.4), lip: true, curve: sg.curve ?? 1.3, startBevel: 0.6, sideBevel: 0.3 };
        else if (sg.t === 'pad') spec = { ...base, kind: 'pad', y0: y0 + 0.02, y1: y0 + 0.02, lip: false, startBevel: 0.2, endBevel: 0.2, sideBevel: 0.1, surface: 'boost', material: sg.material };
        else spec = { ...base, kind: 'deck', y0, y1: y1 + (sg.arc ? 0 : 0), lip: false, startBevel: 0.3, endBevel: sg.arc ? 0.6 : 0.3, sideBevel: 0.15, curve: 1 };
        specs.push(spec); chunkIds.push(pid);
        pieces.push({ id: pid, t: sg.t, step: i, u0: u, u1: u + sub, width: w, spec, seg: sg, x: sx, z: sz, yaw: ym, len: len2, y0, y1 });
      } else pieces.push({ id: null, t: 'gap', step: i, u0: u, u1: u + sub, width: w, spec: null, seg: sg, x: sx, z: sz, yaw: ym, len: sub, y0, y1 });
      // advance
      if (sg.arc) { x += Math.sin(ym) * chord; z += Math.cos(ym) * chord; yaw += dYaw; }
      else { x += Math.sin(yaw) * sub; z += Math.cos(yaw) * sub; }
      u += sub;
    }
    void sgn; void chunkIds;
  });
  // boost pads laid ON the deck (overlays; the deck itself continues underneath). u = start along the deck, off = lateral offset (+ right)
  const padSpecs = [];
  (o.pads ?? []).forEach((p, k) => {
    const pc = pieces.find((q) => q.spec && p.u >= q.u0 && p.u < q.u1 && (q.t === 'solid' || q.t === 'glitch' || q.t === 'slide'));
    if (!pc) return;
    const d = p.u - pc.u0, fx = Math.sin(pc.yaw), fz = Math.cos(pc.yaw), rx = -Math.cos(pc.yaw), rz = Math.sin(pc.yaw), off = p.off ?? 0;
    const len = Math.min(p.len ?? 8, pc.u1 - p.u), y0 = yAt(p.u) + 0.03, y1 = yAt(p.u + len) + 0.03;
    const spec = { id: `${o.id}:pad${k}`, kind: 'pad', x: pc.x + fx * d + rx * off, z: pc.z + fz * d + rz * off, yaw: pc.yaw, length: len, width: p.w ?? 6, y0, y1, lip: false,
      startBevel: 0.2, endBevel: 0.2, sideBevel: 0.1, surface: 'boost', road: true, material: p.material, curve: 1 };
    padSpecs.push(spec); specs.push(spec);
    pieces.push({ id: spec.id, t: 'padover', step: -1, u0: p.u, u1: p.u + len, width: spec.width, spec, seg: p, x: spec.x, z: spec.z, yaw: pc.yaw, len, y0, y1, off });
  });
  const end = { x, z, yaw };
  const at = (uu, v = 0) => {
    const pc = pieces.find((p) => uu >= p.u0 - 1e-6 && uu <= p.u1 + 1e-6) ?? pieces[pieces.length - 1];
    const d = uu - pc.u0, fx = Math.sin(pc.yaw), fz = Math.cos(pc.yaw), rx = -Math.cos(pc.yaw), rz = Math.sin(pc.yaw);
    return { x: pc.x + fx * d + rx * v, z: pc.z + fz * d + rz * v, yaw: pc.yaw, y: yAt(uu) };
  };
  return { id: o.id, pieces, specs, length: total, end, at, yAt, width: W, y0: o.y0, y1: o.y1 ?? o.y0 };
}

/** Kill test for a rectangular pit / gap: true where a physical hole exists. `rects` = [{cx, cz, yaw, len, wid}] */
export function inRects(rects, x, z) {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i], dx = x - r.cx, dz = z - r.cz, s = Math.sin(r.yaw), c = Math.cos(r.yaw);
    const u = dx * s + dz * c, v = dx * -c + dz * s;
    if (Math.abs(u) <= r.len / 2 && Math.abs(v) <= r.wid / 2) return true;
  }
  return false;
}

const _c = new THREE.Color();
/**
 * Visual for the solid parts of a path deck: a slab with a dark skin, glowing edge strips and cross ribs. Hides the auto platform mesh of solid
 * pieces (ramps and pads keep the stock meshes). `mats` = { dark, glow }.
 */
export function dressDeck(kit, deck, mats, { colour = 0x22d3ee, colour2 = 0xff3fb4, thick = 1.3, skip = () => false } = {}) {
  const m = kit.track.model;
  for (const pc of deck.pieces) {
    if (!pc.spec || pc.t !== 'solid' || skip(pc)) continue;
    const pf = m.platforms.find((p) => p.def?.id === pc.id);
    if (pf?.mesh) pf.mesh.visible = false;
    const fx = Math.sin(pc.yaw), fz = Math.cos(pc.yaw), len = pc.len, cx = pc.x + fx * len / 2, cz = pc.z + fz * len / 2;
    const top = (pc.y0 + pc.y1) / 2, pitch = Math.atan2(pc.y0 - pc.y1, pc.u1 - pc.u0), W = pc.width;
    const dark = kit.statics.at(mats.dark, cx, cz), glow = kit.statics.at(mats.glow, cx, cz);
    dark.box(W, thick, len, { x: cx, y: top - thick - 0.03, z: cz, ry: pc.yaw, rx: pitch, colour: 0x1a1e56, top: 0x3a44a6, ao: 0.2 });
    dark.box(W - 0.8, 0.06, len, { x: cx, y: top - 0.07, z: cz, ry: pc.yaw, rx: pitch, colour: 0x2a3290, top: 0x3a44c0, ao: 0 });
    for (const sg of [-1, 1]) {
      const ex = cx - Math.cos(pc.yaw) * sg * (W / 2 - 0.2), ez = cz + Math.sin(pc.yaw) * sg * (W / 2 - 0.2);
      glow.box(0.3, 0.14, len, { x: ex, y: top - 0.02, z: ez, ry: pc.yaw, rx: pitch, colour: _c.set(sg > 0 ? colour2 : colour).multiplyScalar(2.6).clone(), ao: 0 });
    }
    if (pc.seg.ribs !== false && len > 8) {
      const n = Math.max(1, Math.floor(len / 8));
      for (let k = 0; k < n; k++) {
        const d = ((k + 0.5) * len) / n, px = pc.x + fx * d, pz = pc.z + fz * d;
        glow.box(W - 1.6, 0.05, 0.24, { x: px, y: top - 0.0 - (pc.y0 - pc.y1) * (d / len - 0.5) * 0, z: pz, ry: pc.yaw, rx: pitch, colour: _c.set(k % 2 ? colour : colour2).multiplyScalar(1.5).clone(), ao: 0 });
      }
    }
  }
}

export { Geo };
