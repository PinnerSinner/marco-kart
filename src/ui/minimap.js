// Minimap geometry: fit a track outline into a square SVG box. Pure, Node-safe.

/**
 * Build a projection from world (x, z) to minimap SVG coordinates.
 * The map is drawn as if seen from above with +Z pointing up the screen; because yaw 0 faces +Z and "right" is -X,
 * that means screen x = -worldX so turning right in the world turns right on the map.
 * @param {number[][]} outline closed loop of [x, z] points
 * @param {number} [size=100] side of the square view box
 * @param {number} [pad=10] margin inside the box
 * @returns {{ path: string, project: (x: number, z: number, out: {x:number, y:number}) => {x:number, y:number}, start: {x1:number,y1:number,x2:number,y2:number}|null }}
 */
export function fitMinimap(outline, size = 100, pad = 10) {
  const pts = Array.isArray(outline) ? outline.filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [];
  if (pts.length < 2) {
    return { path: '', project: (x, z, out) => { out.x = size / 2; out.y = size / 2; return out; }, start: null };
  }
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const [x, z] of pts) {
    const sx = -x; const sy = -z;
    if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
  }
  const w = Math.max(1e-6, maxX - minX); const h = Math.max(1e-6, maxY - minY);
  const scale = (size - pad * 2) / Math.max(w, h);
  const ox = (size - w * scale) / 2 - minX * scale;
  const oy = (size - h * scale) / 2 - minY * scale;
  const project = (x, z, out) => { out.x = -x * scale + ox; out.y = -z * scale + oy; return out; };
  const tmp = { x: 0, y: 0 };
  const parts = pts.map(([x, z], i) => { project(x, z, tmp); return `${i ? 'L' : 'M'}${tmp.x.toFixed(1)} ${tmp.y.toFixed(1)}`; });
  const path = `${parts.join('')}Z`;
  // start/finish tick: perpendicular to the first segment
  const a = project(pts[0][0], pts[0][1], { x: 0, y: 0 });
  const b = project(pts[1][0], pts[1][1], { x: 0, y: 0 });
  let dx = b.x - a.x; let dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
  const r = 6.6;
  const start = { x1: a.x - dy * r, y1: a.y + dx * r, x2: a.x + dy * r, y2: a.y - dx * r };
  return { path, project, start };
}
