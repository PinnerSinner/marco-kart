// Rack canyons: neon trim along the walls, hanging cable trays with pulsing fibre, truss gantries with status lights and light pools.
import * as THREE from 'three';
import { Ribbons, wallRanges, hdr, makePointer } from './util.js';
import { LED } from './textures.js';
import { AISLE, splitByAisle } from './aisles.js';

const C = { cyan: LED.cyan, magenta: LED.magenta, amber: LED.amber, blue: LED.blue, green: LED.green, white: LED.white };

export function wallTrim(kit, { M, AIS = [] }) {
  const track = kit.track, P = makePointer(track);
  const trim = new Ribbons(kit, M.neonBase, { name: 'dc-trim', chunk: 180 });
  const inner = (side, s) => side * (P.frame(s).width / 2 + track.road.wallGap - 0.02);
  for (const side of [-1, 1]) {
    for (const [a0, b0] of wallRanges(track, 'rack', side)) {
      for (const [a, b, kind] of AIS.length ? splitByAisle(a0, b0, AIS) : [[a0, b0, 'cold']]) {
        const A = AISLE[kind], hot = kind === 'hot';
        trim.band(a, b, { lat: (s) => inner(side, s), up0: 6.55, up1: 6.95, colour: hdr(A.crown, hot ? 1.15 : 0.95), step: 2 });          // crown: cyan (cold aisle) or amber (hot)
        trim.band(a, b, { lat: (s) => inner(side, s), up0: 0.05, up1: 0.28, colour: hdr(side < 0 && !hot ? C.magenta : A.base, 0.85), step: 2 });   // base glow
        trim.band(a, b, { lat: (s) => inner(side, s), up0: 3.53, up1: 3.62, colour: hdr(A.seam, 0.75), step: 2 });          // seam between the stacked cabinets
      }
    }
    for (const [a, b] of wallRanges(track, 'rail', side)) {
      const latF = (s) => side * (P.frame(s).width / 2 + track.road.wallGap - 0.02);
      trim.band(a, b, { lat: latF, up0: 1.32, up1: 1.55, colour: hdr(C.cyan, 1.55), step: 2 });
      trim.band(a, b, { lat: latF, up0: 0.02, up1: 0.2, colour: hdr(C.magenta, 0.9), step: 2 });
    }
  }
  trim.build();
}

/** Trays hung off the wall tops over the road edge with three fibre bundles that pulse along the lap, plus brackets every 9 m. */
export function cableTrays(kit, { M, AIS = [] }) {
  const track = kit.track, P = makePointer(track), rng = kit.rng;
  const fibres = [new Ribbons(kit, M.fibreA, { name: 'dc-fibA' }), new Ribbons(kit, M.fibreB, { name: 'dc-fibB' }), new Ribbons(kit, M.fibreC, { name: 'dc-fibC' })];
  const steel = kit.statics;
  const trayCol = new THREE.Color(0x1a2450), bracketCol = new THREE.Color(0x2c3970);
  for (const side of [-1, 1]) {
    for (const [a0, b0] of wallRanges(track, 'rack', side)) {
      const a = a0 + 6, b = b0 - 6; if (b - a < 20) continue;
      const lat0 = (s) => side * (P.frame(s).width / 2 - 1.6), up = 9.3;
      // three fibres in a bundle: colour set per side so the two walls read differently, and per aisle (cold = cyan / blue, hot = amber / red)
      for (const [a1, b1, kind] of AIS.length ? splitByAisle(a, b, AIS) : [[a, b, 'cold']]) {
        const cols = kind === 'hot' ? AISLE.hot.fibre : side < 0 ? [C.cyan, C.magenta, C.white] : [C.magenta, C.cyan, C.blue];
        fibres[0].tube(a1, b1, { lat: (s) => lat0(s) + side * 0.0, up, r: 0.09, colour: hdr(cols[0], 1), seg: 5, step: 5 });
        fibres[1].tube(a1, b1, { lat: (s) => lat0(s) - side * 0.42, up: up + 0.14, r: 0.07, colour: hdr(cols[1], 1), seg: 5, step: 5 });
        fibres[2].tube(a1, b1, { lat: (s) => lat0(s) + side * 0.42, up: up + 0.1, r: 0.07, colour: hdr(cols[2], 1), seg: 5, step: 5 });
      }
      // tray floor + brackets
      for (let s = a; s < b; s += 9) {
        const f = P.frame(s), lat = lat0(s), x = f.x + f.rx * lat, z = f.z + f.rz * lat, y = f.y - lat * Math.tan(f.banking);
        const g = steel.at(M.steel, x, z), yaw = f.yaw;
        g.box(1.7, 0.14, 8.4, { x: x + f.tx * 0, y: y + up - 0.32, z, ry: yaw, colour: trayCol, ao: 0.1 });                 // tray section (8.4 m along the road)
        g.box(0.2, 0.2, 0.2, { x, y: y + up + 0.3, z, ry: yaw, colour: bracketCol, ao: 0 });
        const wl = side * (f.width / 2 + track.road.wallGap + 0.8), mx = (lat + wl) / 2, wy = f.y - wl * Math.tan(f.banking);
        g.box(0.4, up - 6.9, 0.4, { x: f.x + f.rx * wl, y: wy + 6.95, z: f.z + f.rz * wl, ry: f.yaw, colour: bracketCol, ao: 0 });
        g.box(Math.abs(wl - lat) + 0.4, 0.28, 0.45, { x: f.x + f.rx * mx, y: y + up - 0.62, z: f.z + f.rz * mx, ry: f.yaw, colour: bracketCol, ao: 0 });
      }
      void rng;
    }
  }
  for (const f of fibres) f.build();
}
