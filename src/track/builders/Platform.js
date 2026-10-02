// Platform: an oriented rectangular height feature laid over the ground. Used for jump ramps (kickers with a lip),
// landing pads, speed bumps and shortcut bridges. The SAME height function feeds query() and the ramp mesh,
// so geometry and physics can never disagree.
import { clamp } from '../../core/util.js';

const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a || 1e-9), 0, 1); return t * t * (3 - 2 * t); };

export class Platform {
  /**
   * @param {object} spec
   * @param {number} spec.x @param {number} spec.z origin = centre of the START edge (world metres)
   * @param {number} spec.yaw heading of the platform's long axis (radians, forward = (sin yaw, cos yaw))
   * @param {number} spec.length metres along yaw   @param {number} spec.width metres across
   * @param {number} spec.y0 absolute surface height at the start edge (m)
   * @param {number} spec.y1 absolute surface height at the far end (m)
   * @param {number} [spec.curve=1.3] exponent shaping the rise (1 = straight wedge, >1 = kicks up late, like a real jump lip)
   * @param {boolean} [spec.lip=true] abrupt drop after the far end (jump) instead of a bevel
   * @param {number} [spec.startBevel=1.2] metres of soft entry before the start edge
   * @param {number} [spec.endBevel=2] metres of soft exit after the far end when lip=false
   * @param {number} [spec.sideBevel=1.4] metres of soft side edge
   * @param {string} [spec.surface='road'] surface reported on the top ('road' | 'sand' | 'boost' ...)
   * @param {boolean} [spec.road=true] onRoad flag reported on the top
   * @param {string} [spec.kind='ramp'] free label ('ramp' | 'pad' | 'bump')
   */
  constructor(spec) {
    Object.assign(this, {
      curve: 1.3, lip: true, startBevel: 1.2, endBevel: 2, sideBevel: 1.4, surface: 'road', road: true, kind: 'ramp',
    }, spec);
    this.fx = Math.sin(this.yaw); this.fz = Math.cos(this.yaw);
    this.rx = -Math.cos(this.yaw); this.rz = Math.sin(this.yaw);
    const ext = [-this.startBevel, this.lip ? this.length : this.length + this.endBevel];
    const hw = this.width / 2 + this.sideBevel;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const du of ext) for (const dv of [-hw, hw]) {
      const px = this.x + this.fx * du + this.rx * dv, pz = this.z + this.fz * du + this.rz * dv;
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minZ = Math.min(minZ, pz); maxZ = Math.max(maxZ, pz);
    }
    this.minX = minX; this.maxX = maxX; this.minZ = minZ; this.maxZ = maxZ;
  }

  /** Top-surface height at along-distance du (m from the start edge), clamped to the ramp. */
  topAt(du) {
    const t = clamp(du / this.length, 0, 1);
    return this.y0 + (this.y1 - this.y0) * Math.pow(t, this.curve);
  }

  /** Height with the underlying ground hBase blended in over the bevels. du/dv are local coordinates (m). */
  heightLocal(du, dv, hBase) {
    const adv = Math.abs(dv);
    const gv = 1 - smooth(this.width / 2, this.width / 2 + this.sideBevel, adv);
    const gs = du >= 0 ? 1 : smooth(-this.startBevel, 0, du);
    const ge = du <= this.length ? 1 : (this.lip ? 0 : 1 - smooth(this.length, this.length + this.endBevel, du));
    const g = gv * gs * ge;
    if (g <= 0) return hBase;
    return hBase + (this.topAt(du) - hBase) * g;
  }

  /**
   * Evaluate at world (x, z). Returns false if outside the footprint; otherwise writes { h, nx, ny, nz, top } into out
   * where `top` says the point lies on the platform's top surface (surface / onRoad overrides apply).
   * @param {number} x @param {number} z @param {number} hBase ground height below the platform (m)
   * @param {{h:number,nx:number,ny:number,nz:number,top:boolean}} out
   */
  evaluate(x, z, hBase, out) {
    if (x < this.minX || x > this.maxX || z < this.minZ || z > this.maxZ) return false;
    const px = x - this.x, pz = z - this.z;
    const du = px * this.fx + pz * this.fz, dv = px * this.rx + pz * this.rz;
    if (du < -this.startBevel || du > (this.lip ? this.length : this.length + this.endBevel)) return false;
    if (Math.abs(dv) > this.width / 2 + this.sideBevel) return false;
    const h = this.heightLocal(du, dv, hBase);
    const e = 0.25, uHi = this.lip ? this.length : this.length + this.endBevel;
    const u1 = Math.min(du + e, uHi), u0 = Math.max(du - e, -this.startBevel);
    const dhdu = (this.heightLocal(u1, dv, hBase) - this.heightLocal(u0, dv, hBase)) / (u1 - u0);
    const dhdv = (this.heightLocal(du, dv + e, hBase) - this.heightLocal(du, dv - e, hBase)) / (2 * e);
    let nx = -(dhdu * this.fx + dhdv * this.rx), nz = -(dhdu * this.fz + dhdv * this.rz);
    const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
    out.h = h; out.nx = nx * inv; out.ny = inv; out.nz = nz * inv;
    out.top = du >= 0 && du <= this.length && Math.abs(dv) <= this.width / 2;
    return true;
  }
}
