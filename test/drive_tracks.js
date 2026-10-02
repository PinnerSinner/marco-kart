// Test helper (not a test): small synthetic tracks that exercise physics features the StubTrack cannot.
import * as THREE from 'three';
import { StubTrack } from '../src/track/StubTrack.js';
import { SURFACE } from '../src/core/config.js';

/** Infinite flat road: no walls, no void. Physics-only tests (drift, top speed, fuzz without walls). */
export class FlatTrack {
  constructor() { this.id = 'flat'; this.length = 1e6; this.killY = -40; }
  query(pos, out = {}) {
    out.height = 0; (out.normal ??= new THREE.Vector3()).set(0, 1, 0);
    out.surface = SURFACE.ROAD; out.onRoad = true; out.s = 0; out.lateral = 0; out.inVoid = false;
    return out;
  }
  collideWalls() { return 0; }
}

/**
 * StubTrack with a height field on the first straight (x = R side, running +Z):
 *   z 40..60  : ramp rising 0.2 m per metre (to 4 m), then a sheer drop back to 0 (a jump)
 *   z 120..170: a smooth hill (sin^2, 3 m high)
 *   z 200..    : untouched
 * plus a void gap for z in [gapStart, gapEnd] when `gap` is set.
 */
export class HillTrack extends StubTrack {
  constructor(opts = {}) { super(opts); this.gap = opts.gap ?? null; }
  h(x, z) {
    if (x < 30) return 0;
    if (z >= 40 && z < 60) return (z - 40) * 0.2;
    if (z >= 120 && z <= 170) { const t = (z - 120) / 50; return 3 * Math.sin(Math.PI * t) ** 2; }
    return 0;
  }
  query(pos, out = {}, hint) {
    super.query(pos, out, hint);
    const e = 0.05;
    const h = this.h(pos.x, pos.z);
    const dhx = (this.h(pos.x + e, pos.z) - this.h(pos.x - e, pos.z)) / (2 * e);
    const dhz = (this.h(pos.x, pos.z + e) - this.h(pos.x, pos.z - e)) / (2 * e);
    out.height = h;
    out.normal.set(-dhx, 1, -dhz).normalize();
    if (this.gap && pos.x > 30 && pos.z >= this.gap[0] && pos.z <= this.gap[1]) { out.inVoid = true; out.height = -Infinity; out.surface = SURFACE.VOID; out.onRoad = false; }
    return out;
  }
}

/** StubTrack whose edges are open: no walls, void beyond the kerb (space tracks). */
export class EdgeVoidTrack extends StubTrack {
  query(pos, out = {}, hint) {
    super.query(pos, out, hint);
    if (Math.abs(out.lateral) > this.width / 2 + 1.5) { out.inVoid = true; out.height = -Infinity; out.surface = SURFACE.VOID; out.onRoad = false; }
    return out;
  }
  collideWalls() { return 0; }
}

/** Flat, wall-less road whose surface depends on x: x < 20 road, 20..60 grass, 60..100 sand, 100..140 oil, > 140 water. */
export class SurfaceTrack extends FlatTrack {
  query(pos, out = {}) {
    super.query(pos, out);
    const x = pos.x;
    out.surface = x < 20 ? SURFACE.ROAD : x < 60 ? SURFACE.GRASS : x < 100 ? SURFACE.SAND : x < 140 ? SURFACE.OIL : SURFACE.WATER;
    out.onRoad = out.surface === SURFACE.ROAD || out.surface === SURFACE.OIL || out.surface === SURFACE.WATER;
    return out;
  }
}
