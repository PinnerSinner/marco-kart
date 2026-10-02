// Layout helpers for authoring control points: a turtle that walks straights and arcs and closes the loop.
const DEG = Math.PI / 180;

/**
 * Turtle path builder. Heading is a yaw in DEGREES: 0 faces +Z, forward = (sin yaw, cos yaw); turning RIGHT lowers yaw.
 * Every element emits control points; the y / w / bank you pass are the values reached at the END of the element
 * (values in between are interpolated linearly, the spline smooths them). Call close() last: it drops the final point
 * (it coincides with the start) and spreads any small position error over the whole loop.
 *
 *   const t = turtle({ x: 0, z: 0, heading: 90, y: 0.5, w: 20 });
 *   t.straight(300).mark('hair'); t.arc(22, 180, { w: 16 }); t.straight(200, { y: 4 }); ... return t.close();
 *
 * @param {{x?:number,z?:number,heading?:number,y?:number,w?:number,bank?:number}} [start]
 */
export function turtle({ x = 0, z = 0, heading = 0, y = 0, w = 18, bank = 0 } = {}) {
  const pts = [{ x, z, y, w, bank, id: null, len: 0 }];
  let yaw = heading * DEG, len = 0;
  const cur = { y, w, bank };
  const push = (px, pz, dl, props) => {
    len += dl;
    pts.push({ x: px, z: pz, y: props.y, w: props.w, bank: props.bank, id: null, len });
  };
  const emit = (n, at, props) => {
    const from = { ...cur }, to = { y: props.y ?? cur.y, w: props.w ?? cur.w, bank: props.bank ?? cur.bank };
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const p = at(u);
      push(p.x, p.z, p.dl, { y: from.y + (to.y - from.y) * u, w: from.w + (to.w - from.w) * u, bank: from.bank + (to.bank - from.bank) * u });
    }
    Object.assign(cur, to);
  };
  const api = {
    /** Walk `length` metres straight ahead. */
    straight(length, props = {}, every = 70) {
      const x0 = pts[pts.length - 1].x, z0 = pts[pts.length - 1].z, fx = Math.sin(yaw), fz = Math.cos(yaw);
      emit(Math.max(1, Math.ceil(length / every)), (u) => ({ x: x0 + fx * length * u, z: z0 + fz * length * u, dl: length / Math.max(1, Math.ceil(length / every)) }), props);
      return api;
    },
    /** Turn `degrees` (positive = RIGHT, negative = LEFT) on a circle of `radius` metres. */
    arc(radius, degrees, props = {}, stepDeg = 22) {
      const sg = degrees >= 0 ? 1 : -1, ang = Math.abs(degrees) * DEG;
      const last = pts[pts.length - 1];
      const rx = -Math.cos(yaw), rz = Math.sin(yaw);
      const cx = last.x + sg * rx * radius, cz = last.z + sg * rz * radius;
      const yaw0 = yaw, n = Math.max(1, Math.ceil(Math.abs(degrees) / stepDeg));
      emit(n, (u) => {
        const yy = yaw0 - sg * ang * u;
        return { x: cx - sg * -Math.cos(yy) * radius, z: cz - sg * Math.sin(yy) * radius, dl: (radius * ang) / n };
      }, props);
      yaw = yaw0 - sg * ang;
      return api;
    },
    /** Attach a mark id to the most recent point (usable as '@id' in zones, ramps, checkpoints...). */
    mark(id) { pts[pts.length - 1].id = id; return api; },
    /** Jump the y / w / bank targets without moving. */
    set(props) { Object.assign(cur, props); pts[pts.length - 1].y = cur.y; pts[pts.length - 1].w = cur.w; pts[pts.length - 1].bank = cur.bank; return api; },
    /** The points laid so far, unclosed (for previews / debugging). */
    raw() { return pts.map((p) => ({ x: p.x, z: p.z, y: p.y, w: p.w, bank: p.bank, id: p.id })); },
    /** Current pose { x, z, headingDeg }. */
    pose() { const p = pts[pts.length - 1]; return { x: p.x, z: p.z, heading: yaw / DEG }; },
    /**
     * Auto-close: appends straight(L1), arc(radius, theta), straight(L2) so the path returns to the start point AND the
     * start heading, then calls close(). Throws if no solution with non-negative straights exists (adjust the layout).
     * @param {number} [radius=40] turn radius of the closing corner (m)
     * @param {object} [props] y / w / bank targets for the closing elements (defaults: hold current)
     */
    closeLoop(radius = 40, props = {}) {
      const first = pts[0], last = pts[pts.length - 1];
      let theta = ((yaw - heading * DEG) / DEG) % 360; if (theta > 180) theta -= 360; if (theta <= -180) theta += 360;
      const sg = theta >= 0 ? 1 : -1, ang = Math.abs(theta) * DEG, ye = yaw - theta * DEG;
      const rx = -Math.cos(yaw), rz = Math.sin(yaw);
      const cx = last.x + sg * rx * radius, cz = last.z + sg * rz * radius;
      const dEx = cx - sg * -Math.cos(ye) * radius - last.x, dEz = cz - sg * Math.sin(ye) * radius - last.z;
      const vx = first.x - last.x - dEx, vz = first.z - last.z - dEz;
      const f0x = Math.sin(yaw), f0z = Math.cos(yaw), fex = Math.sin(ye), fez = Math.cos(ye);
      const det = f0x * fez - fex * f0z;
      if (Math.abs(det) < 1e-3) throw new Error('turtle.closeLoop: closing heading is parallel to the current heading; add a turn before closing');
      const L1 = (vx * fez - fex * vz) / det, L2 = (f0x * vz - vx * f0z) / det;
      if (L1 < 0 || L2 < 0) throw new Error(`turtle.closeLoop: no solution (straights ${L1.toFixed(1)} m, ${L2.toFixed(1)} m); adjust the layout or radius`);
      if (L1 > 0.5) api.straight(L1, props);
      api.arc(radius, theta, props);
      if (L2 > 0.5) api.straight(L2, props);
      api.lastClosing = { L1, L2, theta };
      return api.close();
    },
    /**
     * Finish the loop. The last point should land on the first; the leftover error is spread over all points.
     * @returns {{ points: Array, closureError: number, headingError: number }} points plus diagnostics (metres, degrees)
     */
    close() {
      const first = pts[0], last = pts[pts.length - 1];
      const ex = last.x - first.x, ez = last.z - first.z, total = last.len || 1;
      const points = pts.slice(0, -1).map((p) => ({ x: p.x - ex * (p.len / total), z: p.z - ez * (p.len / total), y: p.y, w: p.w, bank: p.bank, id: p.id }));
      let he = (yaw / DEG - (heading)) % 360; if (he > 180) he -= 360; if (he < -180) he += 360;
      points.closureError = Math.hypot(ex, ez); points.headingError = he;
      return points;
    },
  };
  return api;
}
