// Kart models: cruiser, buggy, hauler, rocket. Each is ONE vertex-coloured glossy paint mesh (+ outline), ONE unlit glow/LED mesh
// (lamps, blinking rack LEDs), four wheels and a steering wheel. Colourable by any hex with an automatic contrasting accent.
import * as THREE from 'three';
import { GeoBuilder, unionFlagGeometry, extrudePoly } from './geo.js';
import { cachedGeo } from './rig.js';
import { outlinedMesh, paintMaterial, clothMaterial, ledMaterial, ledTick, inkOf, shade } from './toon.js';
import { DRIVER_SCALE, SEAT_POS, WHEEL_POS, WHEEL_NORMAL, WHEEL_RADIUS } from './layout.js';
import { getCharacter, getKart } from '../core/roster.js';
import { createCharacterMesh } from './characters.js';

const CHROME = 0xdfe4ee;
const DARK = 0x20232e;
const RUBBER = 0x1b1b23;
const LEATHER = 0x8a5a34;

/** Contrasting accent for a paint colour. @param {number} colour @returns {number} */
export function accentFor(colour) {
  const c = new THREE.Color(colour);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return hsl.l > 0.58 ? 0x14213d : 0xfff3d6;
}

// ---- shared parts ------------------------------------------------------------------------------------------------

/** Tyre + hub + spokes as one geometry, axis along X. */
function wheelGeometry(radius, width, hub, knobby) {
  return cachedGeo(`wheel:${radius}:${width}:${hub}:${knobby}`, () => {
    const b = new GeoBuilder();
    const r = radius, w = width;
    b.lathe([[r * 0.5, -w / 2], [r * 0.86, -w / 2], [r * 0.96, -w * 0.36], [r, -w * 0.22], [r, w * 0.22], [r * 0.96, w * 0.36], [r * 0.86, w / 2], [r * 0.5, w / 2]], { c: RUBBER }, knobby ? 12 : 18);
    if (knobby) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        b.box(w * 0.86, r * 0.1, r * 0.16, { p: [0, 0, 0], c: 0x30303c, r: [0, 0, 0], q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a), s: 1 });
      }
    }
    b.cyl(r * 0.6, r * 0.6, w * 1.02, { c: shade(hub, -0.08), c2: hub }, 18);
    b.cyl(r * 0.24, r * 0.24, w * 1.14, { c: 0xf2f4fa }, 10);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.box(r * 0.14, w * 1.06, r * 0.5, { p: [Math.sin(a) * r * 0.36, 0, Math.cos(a) * r * 0.36], r: [0, a, 0], c: 0xf2f4fa });
    }
    for (const s of [-1, 1]) b.sphere(r * 0.075, { p: [0, s * w * 0.5, r * 0.8], c: 0xffffff }, 6, 5);
    const g = b.build();
    g.rotateZ(Math.PI / 2);
    return g;
  });
}

function steeringWheelGeometry() {
  return cachedGeo('steeringwheel', () => {
    const b = new GeoBuilder();
    b.torus(WHEEL_RADIUS, 0.034, { c: 0x2a2530, c2: 0x2a2530 }, 8, 24);
    b.cyl(0.07, 0.07, 0.06, { c: 0xdfe4ee, r: [Math.PI / 2, 0, 0] }, 12);
    for (const a of [Math.PI, 0, -Math.PI / 2]) b.box(WHEEL_RADIUS * 0.95, 0.05, 0.03, { c: 0x3a3542, p: [Math.cos(a) * WHEEL_RADIUS * 0.5, Math.sin(a) * WHEEL_RADIUS * 0.5, 0], r: [0, 0, a] });
    b.box(0.045, 0.08, 0.05, { c: 0xe63946, p: [0, WHEEL_RADIUS, 0] });
    return b.build();
  });
}

function palette(colour, accent) {
  return { c: colour, cD: shade(colour, -0.13), cL: shade(colour, 0.09), acc: accent ?? accentFor(colour), accD: shade(accent ?? accentFor(colour), -0.2) };
}

function fender(b, x, y, z, R, w, colour) {
  b.arc(R, 0.09, Math.PI, { p: [x, y, z], r: [0, Math.PI / 2, 0], s: [1, 1, w / 0.18], c: colour });
}

function ledGrid(gl, x0, y0, z, nx, ny, cols, seedShift = 0) {
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const col = cols[(i * 3 + j * 5 + seedShift) % cols.length];
    gl.box(0.034, 0.034, 0.02, { p: [x0 + i * 0.0625, y0 + j * 0.0625, z], c: col, k: 2.2 });
  }
}

// ---- cruiser: classic British tourer -------------------------------------------------------------------------------

const DEFS = {
  cruiser: {
    front: { x: 0.85, z: 0.98, r: 0.4, w: 0.32 }, rear: { x: 0.85, z: -0.95, r: 0.44, w: 0.36 },
    exhausts: [[-0.4, 0.46, -1.42], [0.4, 0.46, -1.42]], outline: 0.036,
    build(b, gl, P) {
      const { c, cD, cL, acc } = P;
      b.rbox([1.24, 0.2, 2.55], 0.08, { p: [0, 0.4, 0], c: 0x1a1c26 });
      b.rbox([1.32, 0.48, 2.05], 0.22, { p: [0, 0.68, -0.22], c: cD, c2: c });
      b.rbox([1.22, 0.38, 1.2], 0.19, { p: [0, 0.6, 0.98], c: cD, c2: cL });
      b.rbox([1.36, 0.22, 0.16], 0.07, { p: [0, 0.5, -1.27], c: acc });
      // running boards + fenders
      for (const s of [-1, 1]) {
        b.rbox([0.2, 0.06, 1.4], 0.03, { p: [s * 0.78, 0.42, -0.02], c: CHROME });
        fender(b, s * 0.85, 0.4, 0.98, 0.5, 0.36, cL);
        fender(b, s * 0.85, 0.44, -0.95, 0.54, 0.4, cL);
      }
      // union-flag racing stripe down the bonnet
      const bands = [[-0.19, 0x1d3f8f], [-0.115, 0xf6f3ea], [0, 0xd0202f], [0.115, 0xf6f3ea], [0.19, 0x1d3f8f]];
      const widths = [0.075, 0.08, 0.15, 0.08, 0.075];
      bands.forEach(([x, col], i) => b.rbox([widths[i], 0.02, 1.0], 0.008, { p: [x, 0.795, 1.0], c: col }, 1));
      for (const s of [-1, 1]) b.add(unionFlagGeometry(0.4, 0.25), { keep: true, p: [s * 0.665, 0.7, -0.3], r: [0, s * Math.PI / 2, 0] });
      // cockpit rim + leather
      b.rbox([1.1, 0.03, 1.15], 0.02, { p: [0, 0.915, -0.34], c: 0x2a1c14 });
      b.rbox([0.9, 0.34, 0.2], 0.1, { p: [0, 1.04, -0.78], c: LEATHER, c2: shade(LEATHER, 0.1) });
      b.rbox([0.9, 0.16, 0.5], 0.07, { p: [0, 0.95, -0.42], c: shade(LEATHER, -0.05) });
      for (const s of [-1, 1]) b.rbox([0.06, 0.04, 1.24], 0.02, { p: [s * 0.58, 0.96, -0.34], c: CHROME });
      // dash + windscreen
      b.rbox([1.24, 0.22, 0.42], 0.09, { p: [0, 0.99, 0.8], c: DARK });
      b.rbox([1.2, 0.2, 0.03], 0.01, { p: [0, 1.2, 0.945], r: [-0.42, 0, 0], c: 0x256fa8, c2: 0x5fb5e6 });
      b.rbox([1.26, 0.03, 0.05], 0.012, { p: [0, 1.3, 0.905], r: [-0.42, 0, 0], c: CHROME });
      for (const s of [-1, 1]) b.tube([s * 0.61, 1.0, 0.98], [s * 0.61, 1.29, 0.91], 0.025, { c: CHROME });
      b.tube([0, 1.1, 0.44], [0, 0.9, 0.78], 0.04, { c: DARK });
      // grille + bumpers
      b.rbox([0.56, 0.3, 0.07], 0.03, { p: [0, 0.6, 1.57], c: CHROME });
      b.rbox([0.46, 0.22, 0.08], 0.02, { p: [0, 0.6, 1.575], c: 0x151720 });
      for (let i = -2; i <= 2; i++) b.box(0.02, 0.2, 0.09, { p: [i * 0.085, 0.6, 1.58], c: 0xb9c0d0 });
      b.rbox([1.5, 0.1, 0.15], 0.05, { p: [0, 0.4, 1.56], c: CHROME });
      b.rbox([1.5, 0.1, 0.15], 0.05, { p: [0, 0.4, -1.3], c: CHROME });
      for (const s of [-1, 1]) {
        b.torus(0.155, 0.03, { p: [s * 0.46, 0.72, 1.5], c: CHROME }, 6, 16);
        b.cyl(0.075, 0.075, 0.42, { p: [s * 0.4, 0.46, -1.3], r: [Math.PI / 2, 0, 0], c: 0xc8ced9, c2: 0x8f96a5 });
        b.cyl(0.05, 0.05, 0.05, { p: [s * 0.4, 0.46, -1.5], r: [Math.PI / 2, 0, 0], c: 0x14141a });
      }
      // cup holder
      b.cyl(0.075, 0.06, 0.13, { p: [-0.62, 0.99, -0.42], c: 0xf6f3ea });
      b.torus(0.075, 0.015, { p: [-0.62, 1.055, -0.42], r: [Math.PI / 2, 0, 0], c: 0xe63946 }, 5, 12);
      // glow
      for (const s of [-1, 1]) {
        gl.sphere(0.12, { p: [s * 0.46, 0.72, 1.53], s: [1, 1, 0.6], c: 0xfff1b0 }, 10, 8);
        gl.rbox([0.22, 0.09, 0.05], 0.02, { p: [s * 0.55, 0.78, -1.32], c: 0xff2a3a, k: 1.4 }, 1);
        gl.cyl(0.05, 0.05, 0.03, { p: [s * 0.25, 1.05, 0.585], r: [Math.PI / 2, 0, 0], c: 0x22d3ee });
      }
    },
  },

  // ---- buggy: light open dune buggy with beach umbrella ----------------------------------------------------------
  buggy: {
    front: { x: 0.82, z: 1.0, r: 0.38, w: 0.3 }, rear: { x: 0.9, z: -0.92, r: 0.5, w: 0.5, knobby: true },
    exhausts: [[-0.32, 0.9, -1.34], [0.32, 0.9, -1.34]], outline: 0.036,
    build(b, gl, P) {
      const { c, cD, cL, acc } = P;
      b.rbox([1.14, 0.26, 2.0], 0.12, { p: [0, 0.48, -0.1], c: cD, c2: c });
      b.rbox([0.92, 0.3, 0.7], 0.14, { p: [0, 0.56, 1.02], c: c, c2: cL });
      for (const s of [-1, 1]) {
        b.rbox([0.2, 0.28, 1.3], 0.1, { p: [s * 0.64, 0.5, -0.2], c: acc });
        b.tube([s * 0.55, 0.52, 1.0], [s * 0.8, 0.5, 1.0], 0.04, { c: CHROME });
        b.tube([s * 0.55, 0.42, 0.78], [s * 0.8, 0.44, 1.02], 0.035, { c: CHROME });
        b.tube([s * 0.6, 0.6, -0.9], [s * 0.85, 0.55, -0.92], 0.045, { c: CHROME });
        b.tube([s * 0.6, 0.45, -0.6], [s * 0.85, 0.5, -0.92], 0.04, { c: CHROME });
        // roll-cage side rails
        b.tube([s * 0.56, 0.62, 0.55], [s * 0.56, 1.32, 0.35], 0.045, { c: CHROME });
        b.tube([s * 0.56, 1.32, 0.35], [s * 0.6, 1.55, -0.75], 0.045, { c: CHROME });
        b.tube([s * 0.6, 0.62, -0.75], [s * 0.6, 1.55, -0.75], 0.045, { c: CHROME });
      }
      b.tube([-0.6, 1.55, -0.75], [0.6, 1.55, -0.75], 0.045, { c: CHROME });
      b.tube([-0.56, 1.32, 0.35], [0.56, 1.32, 0.35], 0.045, { c: acc });
      b.arc(0.5, 0.04, Math.PI, { p: [0, 0.52, 1.42], r: [Math.PI / 2, 0, 0], c: CHROME });
      // seat
      b.rbox([0.76, 0.16, 0.7], 0.07, { p: [0, 0.68, -0.3], c: 0x2b3a67 });
      b.rbox([0.76, 0.4, 0.18], 0.09, { p: [0, 0.92, -0.72], c: 0x2b3a67, c2: 0x3d5296 });
      b.rbox([0.16, 0.4, 0.2], 0.07, { p: [0, 0.92, -0.72], c: acc });
      // dash
      b.rbox([1.0, 0.16, 0.3], 0.06, { p: [0, 0.94, 0.72], c: DARK });
      b.tube([0, 1.1, 0.44], [0, 0.86, 0.72], 0.04, { c: DARK });
      // cooler box + surfboard-style flip-flops
      b.rbox([0.44, 0.3, 0.4], 0.06, { p: [-0.34, 0.76, -1.06], c: acc });
      b.rbox([0.46, 0.06, 0.42], 0.02, { p: [-0.34, 0.93, -1.06], c: 0xf6f3ea });
      // umbrella mount + open beach umbrella leaning out to the left rear
      const base = [0.62, 0.55, -0.98], top = [1.0, 2.25, -1.28];
      b.tube(base, top, 0.032, { c: CHROME });
      b.cyl(0.07, 0.07, 0.14, { p: [0.62, 0.62, -0.98], c: acc });
      const dir = new THREE.Vector3(top[0] - base[0], top[1] - base[1], top[2] - base[2]).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const canopy = new THREE.LatheGeometry([[0.9, 0], [0.74, 0.13], [0.38, 0.32], [0.02, 0.4], [0.02, 0.35], [0.36, 0.27], [0.72, 0.08], [0.87, -0.03]].map((p) => new THREE.Vector2(p[0], p[1])), 8);
      b.add(canopy, {
        p: [top[0] - dir.x * 0.3, top[1] - dir.y * 0.3, top[2] - dir.z * 0.3], q,
        tri: (x, _y, z) => (Math.floor((Math.atan2(z, x) / (Math.PI * 2) + 1) * 8) % 2 === 0 ? acc : P.c),
      });
      b.sphere(0.045, { p: [top[0] + dir.x * 0.13, top[1] + dir.y * 0.13, top[2] + dir.z * 0.13], c: 0xffd23f });
      // exhaust pipes
      for (const s of [-1, 1]) b.tube([s * 0.32, 0.55, -1.0], [s * 0.32, 0.9, -1.34], 0.06, { c: 0xc8ced9 });
      for (const s of [-1, 1]) {
        gl.sphere(0.11, { p: [s * 0.3, 0.72, 1.36], s: [1, 1, 0.6], c: 0xfff1b0 }, 10, 8);
        gl.rbox([0.16, 0.08, 0.04], 0.02, { p: [s * 0.5, 0.62, -1.12], c: 0xff2a3a, k: 1.4 }, 1);
      }
    },
  },

  // ---- hauler: boxy server-rack truck -----------------------------------------------------------------------------
  hauler: {
    front: { x: 0.9, z: 1.02, r: 0.48, w: 0.42 }, rear: { x: 0.92, z: -0.98, r: 0.52, w: 0.46 },
    exhausts: [[-0.5, 0.62, -1.9], [0.5, 0.62, -1.9]], outline: 0.04,
    fans: [{ p: [0, 1.34, -1.36], r: 0.3 }],
    build(b, gl, P) {
      const { c, cD, cL, acc } = P;
      b.rbox([1.5, 0.24, 3.1], 0.08, { p: [0, 0.48, -0.1], c: 0x1a1c26 });
      // hood / engine block
      b.rbox([1.5, 0.66, 1.05], 0.16, { p: [0, 0.9, 1.0], c: cD, c2: c });
      b.rbox([1.3, 0.1, 0.9], 0.04, { p: [0, 1.28, 1.02], c: DARK });
      for (let i = -3; i <= 3; i++) b.box(0.05, 0.03, 0.8, { p: [i * 0.16, 1.335, 1.02], c: 0x0d0f16 });
      for (const s of [-1, 1]) {
        b.rbox([0.42, 0.14, 1.1], 0.06, { p: [s * 0.9, 0.98, 1.02], c: cL });
        b.rbox([0.42, 0.14, 1.1], 0.06, { p: [s * 0.94, 0.98, -0.98], c: cL });
      }
      // grille + bull bar
      b.rbox([1.3, 0.5, 0.08], 0.03, { p: [0, 0.88, 1.56], c: 0x14161f });
      for (let i = -4; i <= 4; i++) b.box(0.05, 0.42, 0.1, { p: [i * 0.13, 0.88, 1.56], c: 0x9aa3b6 });
      b.rbox([1.56, 0.1, 0.12], 0.04, { p: [0, 0.58, 1.66], c: CHROME });
      b.tube([-0.6, 0.58, 1.66], [-0.6, 1.1, 1.62], 0.05, { c: CHROME });
      b.tube([0.6, 0.58, 1.66], [0.6, 1.1, 1.62], 0.05, { c: CHROME });
      // cab / cockpit surround
      b.rbox([1.3, 0.2, 0.3], 0.07, { p: [0, 1.0, 0.62], c: DARK });
      b.tube([0, 1.1, 0.44], [0, 0.92, 0.66], 0.04, { c: DARK });
      b.rbox([1.32, 0.03, 1.1], 0.02, { p: [0, 0.75, -0.3], c: 0x14141a });
      b.rbox([0.84, 0.16, 0.66], 0.07, { p: [0, 0.83, -0.36], c: 0x3a3f52 });
      b.rbox([0.84, 0.36, 0.2], 0.09, { p: [0, 1.0, -0.76], c: 0x3a3f52, c2: 0x4f556e });
      // low roll cage (kept below shoulder height so the driver stays visible) + light bar on the hood
      for (const s of [-1, 1]) {
        b.tube([s * 0.72, 0.8, 0.55], [s * 0.72, 1.3, 0.42], 0.055, { c: acc });
        b.tube([s * 0.72, 1.3, 0.42], [s * 0.72, 1.3, -0.86], 0.055, { c: acc });
        b.tube([s * 0.72, 0.8, -0.86], [s * 0.72, 1.3, -0.86], 0.055, { c: acc });
      }
      b.tube([-0.72, 1.3, -0.86], [0.72, 1.3, -0.86], 0.055, { c: acc });
      b.rbox([0.9, 0.1, 0.12], 0.04, { p: [0, 1.36, 1.45], c: DARK });
      // server rack on the flatbed (face towards the rear so the chase camera sees the LEDs)
      b.rbox([1.4, 0.7, 0.7], 0.05, { p: [0, 0.92, -1.36], c: 0x232735, c2: 0x2f3547 });
      b.rbox([1.5, 0.07, 0.78], 0.03, { p: [0, 1.29, -1.36], c: acc });
      b.rbox([1.5, 0.07, 0.78], 0.03, { p: [0, 0.57, -1.36], c: acc });
      for (const s of [-1, 1]) b.rbox([0.08, 0.76, 0.78], 0.03, { p: [s * 0.72, 0.93, -1.36], c: acc });
      const unitCols = [0x22d3ee, 0x38f28d, 0xffd23f, 0xff4fd8];
      for (let u = 0; u < 5; u++) {
        const y = 0.68 + u * 0.125;
        b.rbox([1.26, 0.1, 0.04], 0.015, { p: [0, y, -1.72], c: 0xc9d0e0, c2: 0x8f98ad }, 1);
        b.box(0.6, 0.03, 0.05, { p: [0.28, y, -1.725], c: 0x1a1d29 });
        b.box(0.22, 0.03, 0.05, { p: [-0.48, y, -1.725], c: 0x2a2f42 });
        ledGrid(gl, -0.625, y - 0.03, -1.745, 8, 2, unitCols, u);
      }
      // cables draped off the side
      b.arc(0.26, 0.03, Math.PI, { p: [-0.74, 0.86, -1.5], r: [0, 0, 0], c: 0x22d3ee });
      b.arc(0.2, 0.03, Math.PI, { p: [0.74, 0.82, -1.5], r: [0, 0, 0], c: 0xff4fd8 });
      // exhaust stubs
      for (const s of [-1, 1]) {
        b.cyl(0.1, 0.1, 0.3, { p: [s * 0.5, 0.62, -1.78], r: [Math.PI / 2, 0, 0], c: 0xc8ced9, c2: 0x8f96a5 });
        gl.sphere(0.13, { p: [s * 0.62, 0.86, 1.6], s: [1, 1, 0.55], c: 0xfff1b0 }, 10, 8);
        gl.rbox([0.24, 0.1, 0.05], 0.02, { p: [s * 0.62, 0.7, -1.78], c: 0xff2a3a, k: 1.4 }, 1);
      }
      gl.box(0.76, 0.05, 0.05, { p: [0, 1.36, 1.52], c: 0xffb000, k: 2.4 });
    },
  },

  // ---- rocket: sleek finned racer ---------------------------------------------------------------------------------
  rocket: {
    front: { x: 0.86, z: 1.05, r: 0.38, w: 0.3 }, rear: { x: 0.92, z: -0.98, r: 0.44, w: 0.4 },
    exhausts: [[-0.3, 0.62, -1.9], [0.3, 0.62, -1.9]], outline: 0.036,
    build(b, gl, P) {
      const { c, cD, cL, acc } = P;
      b.sphere(1, { p: [0, 0.64, -0.15], s: [0.66, 0.38, 1.6], c: cD, c2: cL }, 30, 20);
      b.sphere(1, { p: [0, 0.6, 1.2], s: [0.44, 0.3, 0.95], c: c, c2: cL }, 24, 16);
      b.sphere(1, { p: [0, 0.645, -0.15], s: [0.11, 0.39, 1.62], c: acc }, 12, 24);
      b.sphere(1, { p: [0, 0.605, 1.2], s: [0.09, 0.305, 0.96], c: acc }, 10, 20);
      b.cone(0.2, 0.7, { p: [0, 0.58, 2.0], r: [Math.PI / 2, 0, 0], c: acc }, 14);
      for (const s of [-1, 1]) {
        b.capsule(0.22, 1.5, { p: [s * 0.66, 0.48, -0.55], r: [Math.PI / 2, 0, 0], c: cD, c2: cL });
        // swept side fins
        b.add(extrudePoly([[0, 0], [0.7, 0], [0.8, 0.1], [0.25, 0.42]], 0.06, { c: c, c2: cL }), { p: [s * 0.92, 0.62, -0.8], r: [0, Math.PI / 2, 0], keep: true });
        b.rbox([0.3, 0.05, 0.5], 0.02, { p: [s * 0.55, 0.42, 1.0], r: [0, s * 0.35, 0], c: acc });
        b.cyl(0.19, 0.24, 0.45, { p: [s * 0.3, 0.62, -1.68], r: [Math.PI / 2, 0, 0], c: 0x9aa3b6, c2: 0x5a6273 });
        gl.torus(0.15, 0.03, { p: [s * 0.3, 0.62, -1.9], c: 0x5cf2ff, k: 1.6 }, 6, 14);
        gl.sphere(0.08, { p: [s * 0.3, 0.62, -1.88], s: [1, 1, 0.5], c: 0xffffff }, 8, 6);
        gl.sphere(0.075, { p: [s * 0.28, 0.66, 1.9 - 0.36], s: [1, 1, 0.6], c: 0xfff1b0 }, 8, 6);
      }
      // central tail fin
      b.add(extrudePoly([[0, 0], [1.0, 0], [0.92, 0.2], [0.4, 0.62]], 0.08, { c: c, c2: cL }), { p: [0, 0.85, -0.9], r: [0, Math.PI / 2, 0], keep: true });
      // cockpit
      b.rbox([0.98, 0.05, 1.1], 0.03, { p: [0, 0.905, -0.34], c: 0x151720 });
      b.rbox([0.8, 0.36, 0.18], 0.08, { p: [0, 1.0, -0.74], c: 0x2a2f45, c2: 0x3a4266 });
      b.rbox([1.0, 0.18, 0.4], 0.08, { p: [0, 0.98, 0.72], c: DARK });
      b.tube([0, 1.1, 0.44], [0, 0.9, 0.72], 0.04, { c: DARK });
      b.rbox([0.9, 0.24, 0.04], 0.02, { p: [0, 1.22, 0.88], r: [-0.55, 0, 0], c: 0x2a86c4, c2: 0x7fd3f5 });
      gl.box(0.5, 0.04, 0.05, { p: [0, 0.94, 0.53], c: 0x22d3ee });
    },
  },
};

// ---- assembly ----------------------------------------------------------------------------------------------------

function makeWheel(spec, hub, isFront) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const geo = wheelGeometry(spec.r, spec.w, hub, !!spec.knobby);
  const m = outlinedMesh(geo, clothMaterial(), 0.02, 0x0a0a10);
  m.userData.outline.visible = false;
  g.add(m);
  g.userData = { front: isFront, radius: spec.r, tyre: m, steerable: isFront };
  g.position.set(0, spec.r, spec.z);
  return g;
}

/**
 * Build a kart. Origin = ground contact point at the kart's centre, faces +Z.
 * @param {string} kartId cruiser | buggy | hauler | rocket
 * @param {number} [colour=0xcc3333] paint colour (hex)
 * @param {number} [accent] contrasting accent (auto when omitted)
 * @returns {{group: THREE.Group, wheels: THREE.Object3D[], seat: THREE.Object3D, exhausts: THREE.Object3D[], body: THREE.Mesh, glow: THREE.Mesh, steeringWheel: THREE.Group, fans: THREE.Object3D[], animate: (dt:number, steer:number, speed:number) => void, kartId: string}}
 */
export function createKartMesh(kartId, colour = 0xcc3333, accent) {
  const k = getKart(kartId);
  const def = DEFS[k.id] ?? DEFS.cruiser;
  const P = palette(colour, accent);
  const key = `kart:${k.id}:${colour}:${P.acc}`;
  const paintGeo = cachedGeo(`${key}:paint`, () => {
    const b = new GeoBuilder(), gl = new GeoBuilder();
    def.build(b, gl, P);
    cachedGeo(`${key}:glow`, () => gl.build());
    return b.build({ ao: { y0: 0.3, y1: 0.95, min: 0.62 } });
  });
  const glowGeo = cachedGeo(`${key}:glow`, () => new GeoBuilder().build());
  const group = new THREE.Group();
  group.name = `kart-${k.id}`;
  const body = outlinedMesh(paintGeo, paintMaterial(), def.outline, inkOf(colour, 0.2));
  group.add(body);
  const glow = new THREE.Mesh(glowGeo, ledMaterial());
  glow.onBeforeRender = ledTick;
  glow.castShadow = false;
  group.add(glow);

  const hub = P.acc;
  const wheels = [];
  for (const [spec, isFront, sx] of [[def.front, true, 1], [def.front, true, -1], [def.rear, false, 1], [def.rear, false, -1]]) {
    const w = makeWheel(spec, hub, isFront);
    w.position.x = sx * spec.x;
    if (sx < 0) w.userData.mirror = true;
    group.add(w);
    wheels.push(w);
  }
  // wheels are authored symmetric about X; left/right ordering: [front +X (driver's left), front -X, rear +X, rear -X]
  const seat = new THREE.Object3D();
  seat.position.copy(SEAT_POS);
  group.add(seat);
  const exhausts = def.exhausts.map((p) => { const o = new THREE.Object3D(); o.position.set(p[0], p[1], p[2]); group.add(o); return o; });

  const steeringWheel = new THREE.Group();
  steeringWheel.position.copy(WHEEL_POS);
  steeringWheel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), WHEEL_NORMAL);
  const rim = outlinedMesh(steeringWheelGeometry(), clothMaterial(), 0.012, 0x0a0a10);
  steeringWheel.add(rim);
  steeringWheel.userData.rim = rim;
  group.add(steeringWheel);

  const fans = [];
  for (const f of def.fans ?? []) {
    const fan = outlinedMesh(cachedGeo(`fan:${f.r}`, () => {
      const b = new GeoBuilder();
      b.cyl(f.r * 0.22, f.r * 0.22, 0.05, { c: 0x2a2f42 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.box(f.r * 0.7, 0.025, f.r * 0.32, { p: [Math.cos(a) * f.r * 0.5, 0, Math.sin(a) * f.r * 0.5], r: [0, -a, 0.35], c: 0x9aa3b6 });
      }
      b.torus(f.r, 0.03, { r: [Math.PI / 2, 0, 0], c: 0x14161f }, 5, 16);
      return b.build();
    }), clothMaterial(), 0.012, 0x0a0a10);
    fan.position.set(f.p[0], f.p[1], f.p[2]);
    group.add(fan);
    fans.push(fan);
  }

  const st = { steerA: 0 };
  const animate = (dt, steer = 0, speed = 0) => {
    const yaw = -steer * 0.42;
    for (let i = 0; i < 4; i++) {
      const w = wheels[i];
      if (w.userData.front) w.rotation.y = yaw;
      let a = w.rotation.x + (speed * dt) / w.userData.radius;
      if (a > 6.2832 || a < -6.2832) a %= 6.2832;
      w.rotation.x = a;
    }
    st.steerA += (-steer * 1.05 - st.steerA) * Math.min(1, dt * 18);
    rim.rotation.z = st.steerA;
    for (let i = 0; i < fans.length; i++) fans[i].rotation.y += dt * (6 + Math.abs(speed) * 0.5);
  };
  group.userData = { kartId: k.id, colour, accent: P.acc };
  return { group, wheels, seat, exhausts, body, glow, steeringWheel, fans, animate, kartId: k.id };
}

/**
 * Kart with its driver seated. Same shape as {@link createKartMesh} plus `driver`.
 * @param {string} charId
 * @param {string} kartId
 * @returns {ReturnType<typeof createKartMesh> & {driver: THREE.Group, charId: string}}
 */
export function createDriverKart(charId, kartId) {
  const c = getCharacter(charId);
  const kart = createKartMesh(kartId, c.colour, c.accent === 0xFFFFFF || c.accent === undefined ? undefined : c.accent);
  const driver = createCharacterMesh(charId);
  kart.seat.add(driver);
  return { ...kart, driver, charId: c.id };
}
