// Blighty prop geometries (Geo, vertex coloured, origin at the base centre, facing +Z unless noted).
import * as THREE from 'three';
import { Geo } from '../../Geo.js';
import { BUS_UV } from './atlas.js';

const RED = 0xc8281f, BLACK = 0x1a1c22, PLAIN = [1e6, 1e6];

/** Victorian lamp post: green fluted column, ornate collar, glowing lantern (the lantern is a separate geometry so it can glow). */
export function lampGeo() {
  const g = new Geo();
  g.box(0.55, 0.9, 0.55, { colour: 0x1f3b2d, ao: 0.3 }); g.cyl(0.13, 0.19, 0.5, 8, { y: 0.9, colour: 0x1f3b2d, ao: 0.2 });
  g.cyl(0.085, 0.13, 3.6, 8, { y: 1.4, colour: 0x24463a, ao: 0.1 }); g.cyl(0.16, 0.11, 0.25, 8, { y: 5.0, colour: 0xc9a54a, ao: 0 });
  g.cone(0.32, 0.36, 6, { y: 5.9, colour: 0x1f3b2d, ao: 0 }); g.sphere(0.09, { y: 6.3, colour: 0xc9a54a, ao: 0 }, 5, 4);
  g.box(0.55, 0.12, 0.55, { y: 5.25, colour: 0x1f3b2d, ao: 0 });
  return g;
}
export function lanternGeo() { return new Geo().cyl(0.27, 0.2, 0.6, 6, { y: 5.28, colour: 0xffffff, ao: 0 }); }

/** Red telephone kiosk with glazing bars and a domed roof. */
export function phoneBoxGeo() {
  const g = new Geo(), w = 0.95;
  g.box(w, 2.5, w, { colour: RED, ao: 0.2, top: RED });
  g.box(w + 0.12, 0.12, w + 0.12, { y: 2.5, colour: RED, ao: 0 }); g.cyl(0.4, 0.55, 0.25, 12, { y: 2.6, colour: RED, ao: 0 }); g.cyl(0.05, 0.05, 0.15, 6, { y: 2.85, colour: 0xf1e6b8, ao: 0 });
  g.box(w + 0.06, 0.28, w + 0.06, { y: 2.22, colour: 0xf3ead0, ao: 0 });
  for (const [ry] of [[0], [Math.PI / 2], [Math.PI], [-Math.PI / 2]]) {
    const c = Math.cos(ry), s = Math.sin(ry), off = w / 2 + 0.012;
    for (let col = 0; col < 2; col++) for (let row = 0; row < 4; row++) {
      const lx = (col - 0.5) * 0.36, y = 0.7 + row * 0.36;
      g.box(0.3, 0.3, 0.02, { x: c * lx + s * off, y, z: -s * lx + c * off, ry, colour: 0x1b2b38, ao: 0, facade: PLAIN });
    }
    g.box(0.72, 0.16, 0.03, { x: s * off, y: 2.02, z: c * off, ry, colour: 0xfff5cc, ao: 0 });
  }
  return g;
}

/** Pillar box. */
export function pillarBoxGeo() {
  const g = new Geo();
  g.cyl(0.36, 0.4, 0.14, 12, { colour: 0x22262d, ao: 0 }); g.cyl(0.3, 0.33, 1.08, 12, { y: 0.14, colour: RED, ao: 0.15 });
  g.cyl(0.36, 0.3, 0.14, 12, { y: 1.2, colour: RED, ao: 0 }); g.sphere(0.34, { y: 1.34, colour: RED, ao: 0, sy: 0.4 }, 12, 4);
  g.box(0.36, 0.05, 0.04, { y: 0.92, z: 0.33, colour: BLACK, ao: 0 }); g.box(0.28, 0.16, 0.02, { y: 0.58, z: 0.34, colour: 0xf3ead0, ao: 0 });
  return g;
}

/** Bus shelter + flag sign. Front (open side) faces +Z. */
export function busStopGeo() {
  const g = new Geo();
  for (const x of [-1.6, 1.6]) g.box(0.1, 2.4, 0.1, { x, z: -0.6, colour: 0x3b4650, ao: 0.1 });
  g.box(3.5, 0.12, 1.5, { y: 2.4, z: -0.15, colour: 0x2e3841, ao: 0 });
  g.box(3.3, 2.0, 0.05, { y: 0.35, z: -0.62, colour: 0x8ab4c8, ao: 0, facade: PLAIN }); g.box(0.05, 2.0, 1.1, { x: -1.62, y: 0.35, z: -0.1, colour: 0x8ab4c8, ao: 0, facade: PLAIN });
  g.box(2.4, 0.08, 0.4, { y: 0.55, z: -0.4, colour: 0xb07a45, ao: 0 });
  g.cyl(0.04, 0.05, 3.0, 5, { x: 2.3, colour: 0x3b4650, ao: 0 }); g.cyl(0.4, 0.4, 0.05, 12, { x: 2.3, y: 2.85, z: 0.05, rx: Math.PI / 2, colour: RED, ao: 0 });
  g.cyl(0.26, 0.26, 0.06, 12, { x: 2.3, y: 2.85, z: 0.07, rx: Math.PI / 2, colour: 0xffffff, ao: 0 });
  return g;
}

export function benchGeo() {
  const g = new Geo();
  for (const x of [-0.8, 0.8]) g.box(0.08, 0.5, 0.5, { x, colour: 0x1f2a24, ao: 0 });
  for (let i = 0; i < 3; i++) g.box(1.9, 0.05, 0.13, { y: 0.45, z: -0.2 + i * 0.17, colour: 0x8b5a2b, ao: 0 });
  g.box(1.9, 0.4, 0.05, { y: 0.55, z: -0.25, rx: -0.15, colour: 0x8b5a2b, ao: 0 });
  return g;
}
export const binGeo = () => new Geo().cyl(0.3, 0.26, 0.9, 8, { colour: 0x1f3b2d, ao: 0.2 }).cyl(0.31, 0.31, 0.08, 8, { y: 0.9, colour: 0x101a14, ao: 0 });
export const bollardGeo = () => new Geo().cyl(0.11, 0.14, 0.85, 6, { colour: 0x2a2d34, ao: 0.2 }).sphere(0.11, { y: 0.85, colour: 0x2a2d34, ao: 0 }, 6, 4);

/** Belisha beacon: black-and-white banded pole; the globe is a separate glowing geometry. */
export function beaconGeo() {
  const g = new Geo();
  for (let i = 0; i < 6; i++) g.cyl(0.07, 0.07, 0.45, 8, { y: i * 0.45, colour: i % 2 ? 0x1a1c22 : 0xf5f5f0, ao: 0 });
  return g;
}
export const beaconGlobeGeo = () => new Geo().sphere(0.25, { y: 2.95, colour: 0xffffff, ao: 0 }, 8, 6);

/** Chimney stack with pots. */
export function chimneyGeo() {
  const g = new Geo();
  g.box(0.8, 1.7, 0.8, { colour: 0x8a4c3b, ao: 0.2, facade: [1.2, 1.2] }); g.box(0.95, 0.14, 0.95, { y: 1.7, colour: 0xd8d0c0, ao: 0 });
  for (const x of [-0.2, 0.2]) g.cyl(0.13, 0.15, 0.5, 6, { x, y: 1.84, colour: 0xc9713e, ao: 0 });
  return g;
}

/** Striped market stall. */
export function stallGeo(stripe = 0xd22f27) {
  const g = new Geo();
  for (const [x, z] of [[-1.5, -1], [1.5, -1], [-1.5, 1], [1.5, 1]]) g.cyl(0.05, 0.05, 2.5, 5, { x, z, colour: 0xd8d0c0, ao: 0 });
  const n = 8;
  for (let i = 0; i < n; i++) g.box(3.4 / n, 0.06, 2.5, { x: -1.7 + (i + 0.5) * (3.4 / n), y: 2.35 + 0.08, z: 0, rx: 0.14, colour: i % 2 ? 0xffffff : stripe, ao: 0 });
  g.box(3.2, 0.9, 1.0, { y: 0, z: 0.3, colour: 0x8b5a2b, ao: 0.3, top: 0xc99a5b });
  const produce = [0xe63946, 0x8ac926, 0xffd166, 0xff7f11, 0x9b5de5];
  for (let i = 0; i < 10; i++) g.sphere(0.18, { x: -1.35 + (i % 5) * 0.68, y: 0.9, z: 0.05 + Math.floor(i / 5) * 0.45, colour: produce[(i * 3) % 5], ao: 0 }, 5, 4);
  return g;
}

export function fountainGeo() {
  const g = new Geo(), S = 0xc9c6bc;
  g.cyl(4.2, 4.4, 0.9, 16, { colour: S, ao: 0.3 }); g.cyl(3.8, 3.8, 0.1, 16, { y: 0.82, colour: 0x6f8e96, ao: 0 });
  g.cyl(0.5, 0.8, 1.6, 10, { colour: S, ao: 0.2 }); g.cyl(1.9, 0.6, 0.35, 14, { y: 1.5, colour: S, ao: 0 });
  g.cyl(0.25, 0.4, 1.7, 8, { y: 1.85, colour: S, ao: 0 }); g.cyl(1.0, 0.3, 0.25, 12, { y: 3.4, colour: S, ao: 0 }); g.sphere(0.32, { y: 3.85, colour: 0xd9b45a, ao: 0 }, 8, 6);
  return g;
}

export function bandstandGeo() {
  const g = new Geo(), seg = 8, R = 3.6;
  g.cyl(4.6, 4.8, 0.9, seg, { colour: 0xd8d0c0, ao: 0.3, top: 0xb5a58a }); g.cyl(4.0, 4.0, 0.2, seg, { y: 0.9, colour: 0x9a5b3a, ao: 0 });
  for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2 + Math.PI / seg; g.cyl(0.13, 0.15, 3.6, 6, { x: Math.cos(a) * R, y: 1.1, z: Math.sin(a) * R, colour: 0x1f3b2d, ao: 0 }); }
  g.cyl(4.2, 4.3, 0.3, seg, { y: 4.7, colour: 0x1f3b2d, ao: 0 }); g.cone(4.6, 2.6, seg, { y: 5.0, colour: 0x5f8b78, ao: 0.1 }); g.cyl(0.05, 0.08, 1.4, 5, { y: 7.5, colour: 0xc9a54a, ao: 0 });
  return g;
}

/** Canal narrowboat, 15.5 m, origin at the waterline centre, bow +Z. */
export function narrowboatGeo({ hull = 0x1f4d8a, cabin = 0xc8281f, trim = 0xf2d16b } = {}) {
  const g = new Geo();
  g.box(2.0, 0.9, 15, { y: -0.6, colour: hull, ao: 0.2 }); g.cone(1.05, 1.4, 4, { y: -0.6, z: 8.1, rx: Math.PI / 2, ry: 0, colour: hull, ao: 0 });
  g.box(2.1, 0.12, 15.1, { y: 0.3, colour: trim, ao: 0 });
  g.box(1.85, 1.35, 9.5, { y: 0.4, z: -1.2, colour: cabin, ao: 0.2, top: 0x3b4650 });
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) g.box(0.03, 0.5, 0.7, { x: sx * 0.93, y: 0.95, z: -4.3 + i * 1.8, colour: 0x1b2b38, ao: 0, facade: PLAIN });
  g.cyl(0.13, 0.15, 0.9, 6, { x: 0.3, y: 1.7, z: -3, colour: 0x1a1c22, ao: 0 }); g.cyl(0.18, 0.13, 0.12, 6, { x: 0.3, y: 2.55, z: -3, colour: 0xc9a54a, ao: 0 });
  g.box(0.12, 0.12, 1.4, { y: 0.9, z: -6.6, colour: 0x2a2d34, ao: 0 });
  g.box(1.9, 0.08, 1.8, { y: 0.32, z: 5.2, colour: 0x6b4a2b, ao: 0 });
  return g;
}

/** Bunting between two points (world coordinates, sag metres) with alternating flags. Returns a Geo in world space. */
export function buntingGeo(a, b, { sag = 1.4, flag = 0.9, colours = [0xd22f27, 0xf5f5f0, 0x1d3a6e] } = {}) {
  const g = new Geo(), n = Math.max(6, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 1.1));
  const pt = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
  const dx = b[0] - a[0], dz = b[2] - a[2], dl = Math.hypot(dx, dz) || 1, nx = -dz / dl, nz = dx / dl, c = new THREE.Color();
  for (let i = 0; i < n; i++) g.beam(pt(i / n), pt((i + 1) / n), 0.02, 3, { colour: 0x2a2d34, ao: 0 });
  for (let i = 0; i < n; i++) {
    const t0 = (i + 0.2) / n, t1 = (i + 0.8) / n, p0 = pt(t0), p1 = pt(t1), pm = pt((t0 + t1) / 2);
    c.set(colours[i % colours.length]);
    const v0 = g.vert(p0[0], p0[1], p0[2], nx, 0, nz, 0, 0, c.r, c.g, c.b), v1 = g.vert(p1[0], p1[1], p1[2], nx, 0, nz, 1, 0, c.r, c.g, c.b), v2 = g.vert(pm[0], pm[1] - flag, pm[2], nx, 0, nz, 0.5, 1, c.r, c.g, c.b);
    g.tri(v0, v1, v2);
    const w0 = g.vert(p0[0], p0[1], p0[2], -nx, 0, -nz, 0, 0, c.r, c.g, c.b), w1 = g.vert(p1[0], p1[1], p1[2], -nx, 0, -nz, 1, 0, c.r, c.g, c.b), w2 = g.vert(pm[0], pm[1] - flag, pm[2], -nx, 0, -nz, 0.5, 1, c.r, c.g, c.b);
    g.tri(w0, w2, w1);
  }
  return g;
}

/**
 * Red double-decker, 10.4 m x 2.5 m x 4.4 m, origin at the base centre, front +Z. Uses the bus texture sheet (side + front panels, plain boxes
 * sample the white texel block).
 */
export function doubleDeckerGeo() {
  const g = new Geo(), L = 10.4, W = 2.5;
  g.box(W, 1.7, L, { y: 0.55, colour: 0xd22f27, ao: 0.15, top: 0xd22f27, facade: PLAIN });
  g.box(W - 0.06, 1.6, L - 0.1, { y: 2.35, colour: 0xd22f27, ao: 0.1, top: 0x2c3138, facade: PLAIN });
  g.box(W, 0.32, L, { y: 0.28, colour: 0x1a1a1e, ao: 0, facade: PLAIN });
  const side = BUS_UV.side, front = BUS_UV.front;
  for (const sx of [-1, 1]) g.panel(L, 4.4, { x: sx * (W / 2 + 0.012), y: 0.0, z: 0, ry: sx * Math.PI / 2, uv: side, colour: 0xffffff, ao: 0 });
  g.panel(W, 4.4, { z: L / 2 + 0.012, uv: front, colour: 0xffffff, ao: 0 });
  g.panel(W, 4.4, { z: -L / 2 - 0.012, ry: Math.PI, uv: [front[2], front[1], front[0], front[3]], colour: 0xffffff, ao: 0 });
  for (const [x, z] of [[-1.15, 3.2], [1.15, 3.2], [-1.15, -3.2], [1.15, -3.2]]) g.cyl(0.55, 0.55, 0.36, 12, { x, y: 0.55, z, rz: Math.PI / 2, colour: 0x111114, ao: 0, facade: PLAIN });
  return g;
}

/** Stone clock tower (~60 m). Clock dials are separate panels (see clockFaces). Origin at the centre of the base. */
export function clockTowerGeo() {
  const g = new Geo(), S = 0xe8dcb8, S2 = 0xdccfa6, D = 0xb5a684, F = [4, 3];
  g.cyl(13, 14, 1.4, 20, { colour: 0xc9c0a6, ao: 0.3 });
  g.box(13, 3.2, 13, { y: 1.4, colour: S, ao: 0.35, facade: F }); g.box(13.6, 0.5, 13.6, { y: 4.4, colour: D, ao: 0 });
  g.box(10, 24, 10, { y: 4.9, colour: S2, ao: 0.3, facade: [5, 4] });
  for (let k = 0; k < 6; k++) g.box(10.4, 0.35, 10.4, { y: 8 + k * 4, colour: D, ao: 0 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.box(1.5, 27, 1.5, { x: sx * 5.1, z: sz * 5.1, y: 4.6, colour: S, ao: 0.3, facade: F }); g.cone(0.95, 2.2, 4, { x: sx * 5.1, z: sz * 5.1, y: 31.6, ry: Math.PI / 4, colour: 0x5f8b78, ao: 0 }); }
  for (const sx of [-1, 1]) for (const rot of [0, 1]) { const x = rot ? 0 : sx * 5.02, z = rot ? sx * 5.02 : 0; g.box(rot ? 1.8 : 0.1, 5.5, rot ? 0.1 : 1.8, { x, z, y: 11, colour: 0x2b2f38, ao: 0 }); }
  g.box(12, 1.0, 12, { y: 28.9, colour: D, ao: 0 });
  g.box(11, 9.5, 11, { y: 29.9, colour: S, ao: 0.25, facade: [5.5, 4.75] });
  g.box(12, 0.8, 12, { y: 39.4, colour: D, ao: 0 });
  g.box(9, 6.6, 9, { y: 40.2, colour: S2, ao: 0.2, facade: [4.5, 3.3] });
  for (const rot of [0, 1]) for (const sg of [-1, 1]) g.box(rot ? 5.2 : 0.12, 4.2, rot ? 0.12 : 5.2, { x: rot ? 0 : sg * 4.5, z: rot ? sg * 4.5 : 0, y: 41.2, colour: 0x1a1a22, ao: 0 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.box(1.2, 6.6, 1.2, { x: sx * 4.2, z: sz * 4.2, y: 40.2, colour: S, ao: 0, facade: F });
  g.box(10.4, 0.7, 10.4, { y: 46.8, colour: D, ao: 0 });
  g.cone(7.6, 12.5, 4, { y: 47.5, ry: Math.PI / 4, colour: 0x5f8b78, ao: 0.1, top: 0x6f9d88 });
  g.cyl(0.12, 0.2, 6.5, 6, { y: 60, colour: 0xc9a54a, ao: 0 }); g.sphere(0.5, { y: 66, colour: 0xd9b45a, ao: 0 }, 8, 6);
  return g;
}

/** Clock dial texture is drawn in the scenery module; this builds the hands for one face (local +Z faces out, origin at the dial centre). */
export function clockHandsGeo() {
  const g = new Geo();
  g.box(0.34, 2.0, 0.08, { y: -0.1, colour: 0x14141a, ao: 0 });            // hour hand (points up)
  g.box(0.22, 2.9, 0.06, { y: -0.1, z: 0.09, colour: 0x14141a, ao: 0 });   // minute hand (separate mesh rotates faster; merged here for the static pose)
  return g;
}
export const hourHandGeo = () => new Geo().box(0.42, 1.9, 0.1, { y: -0.2, colour: 0x14141a, ao: 0 }).sphere(0.32, { y: 0, colour: 0xc9a54a, ao: 0 }, 6, 4);
export const minuteHandGeo = () => new Geo().box(0.26, 2.7, 0.08, { y: -0.3, z: 0.1, colour: 0x14141a, ao: 0 });

/** Garage front: brick building with roller-door bays and a sign band. Faces +Z, origin at the centre of the front face base. */
export function depotGeo({ w = 34, depth = 14, h = 9, door = 6.4, doorH = 5.2, brick = 0x9a4b3b } = {}) {
  const g = new Geo(), zc = -depth / 2, sw = (w - door) / 2;
  for (const sx of [-1, 1]) g.box(sw, h, depth, { x: sx * (door / 2 + sw / 2), z: zc, colour: brick, ao: 0.25, facade: [2.4, 2.4], top: 0x6b7078 });
  g.box(door, h - doorH, depth, { y: doorH, z: zc, colour: brick, ao: 0.1, facade: [2.4, 2.4], top: 0x6b7078 });
  g.box(door, 0.1, depth, { y: 0.02, z: zc, colour: 0x24272d, ao: 0, facade: PLAIN });                 // dark floor of the bay
  g.box(door, doorH, 0.4, { y: 0, z: -depth + 0.2, colour: 0x101216, ao: 0, facade: PLAIN });         // back wall (dark)
  for (const sx of [-1, 1]) g.box(0.5, doorH + 0.3, 0.6, { x: sx * (door / 2 + 0.25), y: 0, z: 0.1, colour: 0xd8d0c0, ao: 0.2 });
  g.box(door + 1.5, 0.5, 0.7, { y: doorH, z: 0.1, colour: 0xd8d0c0, ao: 0 });
  g.box(w + 0.6, 0.6, 1.0, { y: h, z: -0.1, colour: 0xd8d0c0, ao: 0 });
  // pilasters, string course, saw-tooth roof with glazing, roof vents
  for (let x = -w / 2 + 1.5; x <= w / 2 - 1; x += 6) if (Math.abs(x) > door / 2 + 1.2) g.box(0.7, h - 0.2, 0.3, { x, z: 0.12, colour: 0xd8d0c0, ao: 0.2 });
  g.box(w + 0.2, 0.3, 0.4, { y: 4.4, z: 0.05, colour: 0xd8d0c0, ao: 0 });
  const bays = Math.round(w / 12);
  for (let i = 0; i < bays; i++) {
    const cx = -w / 2 + (i + 0.5) * (w / bays);
    g.gable(w / bays - 0.6, 1.9, depth - 0.8, { x: cx, y: h + 0.5, z: zc, colour: 0x565b64, top: 0x565b64, ao: 0.1, overhang: 0.15 });
    g.box(0.5, 0.9, 0.5, { x: cx, y: h + 2.3, z: zc - 3, colour: 0x3b4048, ao: 0 });
  }
  return g;
}
