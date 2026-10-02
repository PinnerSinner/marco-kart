// StubTrack: a stadium-shaped oval that implements the FULL Track interface (SPEC.md section 3).
// Purpose: lets physics / race / AI / UI be developed and tested before the real Track engine exists.
// Also serves as the executable reference for what query()/collideWalls()/sample() must return.
// Travel direction is a right-hand (clockwise seen from above) loop, so "right" = inside of the loop.
import * as THREE from 'three';
import { SURFACE, CFG } from '../core/config.js';
import { wrapS } from '../core/util.js';

export class StubTrack {
  constructor({ radius = 60, straight = 220, width = 18, laps = 3 } = {}) {
    this.id = 'stub';
    this.name = 'Stub Oval';
    this.lapCount = laps;
    this.R = radius; this.L = straight; this.width = width;
    this.wallOffset = width / 2 + 2.5;          // wall sits this far from the centreline
    this.length = 2 * straight + 2 * Math.PI * radius;
    this.checkpointS = Array.from({ length: 8 }, (_, i) => (i * this.length) / 8); // [0] is the start/finish line
    this.environment = {
      skyTop: 0x4aa8ff, skyBottom: 0xcfeaff, fogColor: 0xcfeaff, fogNear: 150, fogFar: 700,
      sunDir: new THREE.Vector3(0.5, 1, 0.3).normalize(), sunColor: 0xfff2d6, sunIntensity: 2.2,
      ambientColor: 0x9fc4ff, ambientIntensity: 0.9,
    };
    this.music = 'copacabana';
    this.itemBoxes = [];
    for (let k = 1; k <= 6; k++) for (const lat of [-5, 0, 5]) {
      const sm = this.sample((k * this.length) / 6 + 20);
      this.itemBoxes.push({ pos: sm.pos.clone().addScaledVector(sm.right, lat).setY(CFG.itemBox.hoverHeight) });
    }
    this.boostPads = [];   // [{s, lateral, length, width}]
    this.group = this._buildVisual();
  }

  // ---- centreline -------------------------------------------------------
  // Piecewise: [0, L/2) straight up +Z at x=+R; then arc A; straight down; arc B; last L/2 straight.
  sample(s, out = {}) {
    const { R, L } = this;
    s = wrapS(s, this.length);
    const arc = Math.PI * R;
    let x, z, tx, tz;
    if (s < L / 2) { x = R; z = s; tx = 0; tz = 1; }
    else if (s < L / 2 + arc) { const a = (s - L / 2) / R; x = R * Math.cos(a); z = L / 2 + R * Math.sin(a); tx = -Math.sin(a); tz = Math.cos(a); }
    else if (s < L / 2 + arc + L) { const u = s - (L / 2 + arc); x = -R; z = L / 2 - u; tx = 0; tz = -1; }
    else if (s < L / 2 + 2 * arc + L) { const a = Math.PI + (s - (L / 2 + arc + L)) / R; x = R * Math.cos(a); z = -L / 2 + R * Math.sin(a); tx = -Math.sin(a); tz = Math.cos(a); }
    else { const u = s - (L / 2 + 2 * arc + L); x = R; z = -L / 2 + u; tx = 0; tz = 1; }
    out.pos = (out.pos ?? new THREE.Vector3()).set(x, 0, z);
    out.tangent = (out.tangent ?? new THREE.Vector3()).set(tx, 0, tz);
    out.right = (out.right ?? new THREE.Vector3()).set(-tz, 0, tx);
    out.width = this.width;
    out.banking = 0;
    out.s = s;
    return out;
  }

  // ---- queries ----------------------------------------------------------
  // out = { height, normal:Vector3, surface, onRoad, s, lateral, inVoid }
  query(pos, out = {}, _hintS) {
    const { R, L } = this;
    // nearest point on the axis segment (0,-L/2)-(0,L/2)
    const az = Math.max(-L / 2, Math.min(L / 2, pos.z));
    const dx = pos.x, dz = pos.z - az;
    const d = Math.hypot(dx, dz);
    const lateral = R - d;                    // +ve = right of travel = inside of the loop
    // s from angle
    let s;
    if (pos.z > L / 2) {                                                      // arc A
      const a = Math.atan2(pos.z - L / 2, pos.x); s = L / 2 + Math.max(0, Math.min(Math.PI, a)) * R;
    } else if (pos.z <= -L / 2) {                                             // arc B
      let a = Math.atan2(pos.z + L / 2, pos.x); if (a < 0) a += 2 * Math.PI;  // [pi, 2pi]
      s = L / 2 + Math.PI * R + L + Math.max(0, Math.min(Math.PI, a - Math.PI)) * R;
    } else if (pos.x >= 0) { s = pos.z < 0 ? this.length + pos.z : pos.z; }   // right straight
    else { s = L / 2 + Math.PI * R + (L / 2 - pos.z); }                       // left straight
    out.s = wrapS(s, this.length);
    out.lateral = lateral;
    out.height = 0;
    (out.normal = out.normal ?? new THREE.Vector3()).set(0, 1, 0);
    const a = Math.abs(lateral), hw = this.width / 2;
    out.onRoad = a <= hw;
    out.inVoid = false;
    out.surface = a <= hw ? SURFACE.ROAD : a <= hw + 1.5 ? SURFACE.KERB : SURFACE.GRASS;
    return out;
  }

  // Pushes are resolved by the caller: returns penetration depth (>0 if the circle of `radius` at pos overlaps a wall)
  // and writes the unit normal pointing back INTO the track (horizontal) into outNormal.
  collideWalls(pos, radius, outNormal = new THREE.Vector3()) {
    const { R, L } = this;
    const az = Math.max(-L / 2, Math.min(L / 2, pos.z));
    const dx = pos.x, dz = pos.z - az;
    const d = Math.hypot(dx, dz) || 1e-6;
    const nx = dx / d, nz = dz / d;             // outward from the axis
    const outer = R + this.wallOffset - radius, inner = R - this.wallOffset + radius;
    if (d > outer) { outNormal.set(-nx, 0, -nz); return d - outer; }
    if (d < inner) { outNormal.set(nx, 0, nz); return inner - d; }
    return 0;
  }

  gridSlot(i) {
    const row = Math.floor(i / 2), lat = i % 2 === 0 ? -3.5 : 3.5;
    const sm = this.sample(-(8 + row * 6.5));
    const pos = sm.pos.clone().addScaledVector(sm.right, lat);
    return { pos, heading: Math.atan2(sm.tangent.x, sm.tangent.z) };
  }

  respawnAt(s) {
    const sm = this.sample(s);
    return { pos: sm.pos.clone(), heading: Math.atan2(sm.tangent.x, sm.tangent.z) };
  }

  minimapOutline(n = 96) {
    const pts = [];
    for (let i = 0; i < n; i++) { const p = this.sample((i / n) * this.length).pos; pts.push([p.x, p.z]); }
    return pts;
  }

  update(_dt, _time) {}
  dispose() { this.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }

  _buildVisual() {
    const g = new THREE.Group();
    const n = 240, verts = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const sm = this.sample((i / n) * this.length);
      const l = sm.pos.clone().addScaledVector(sm.right, -this.width / 2).setY(0.02);
      const r = sm.pos.clone().addScaledVector(sm.right, this.width / 2).setY(0.02);
      verts.push(l.x, l.y, l.z, r.x, r.y, r.z);
      if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x555a63, side: THREE.DoubleSide })));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: 0x4caf50 }));
    ground.rotation.x = -Math.PI / 2; g.add(ground);
    return g;
  }
}
