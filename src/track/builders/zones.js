// Zones: turn the def's s-ranges (walls, kerbs, edge surfaces, skirts, gaps) into per-station typed arrays.
import { wrapS } from '../../core/util.js';

export const EDGE_SURFACES = ['grass', 'sand', 'road', 'void'];

/**
 * Resolve a position along the lap. Accepts metres (number) or a mark reference: '@id', '@id+30', '@id-12.5'
 * where id is a control point id. Result wrapped into [0, length).
 * @param {number|string} v
 * @param {Record<string, number>} marks control point id -> arc length
 * @param {number} length loop length (m)
 * @returns {number}
 */
export function resolveS(v, marks, length) {
  if (typeof v === 'number') return wrapS(v, length);
  if (typeof v === 'string' && v[0] === '@') {
    const m = /^@([\w-]+?)([+-]\d+(?:\.\d+)?)?$/.exec(v.trim());
    if (m && m[1] in marks) return wrapS(marks[m[1]] + (m[2] ? parseFloat(m[2]) : 0), length);
    throw new Error(`Track def: unknown mark "${v}" (known: ${Object.keys(marks).join(', ') || 'none'})`);
  }
  throw new Error(`Track def: bad s value ${JSON.stringify(v)}`);
}

/**
 * Per-station flags built from def.defaults + def.zones.
 * A zone: { from, to, side?: 'left'|'right'|'both', left?: props, right?: props, ...props, gap? }
 * props: { wall: styleName|'none'|null, kerb: true|styleName|false, edge: 'grass'|'sand'|'road'|'void', skirt: metres }
 * zone-level extras: gap (true = no road / no ground: a real hole), thickness (metres of road slab / girder shown under the road)
 * Later zones override earlier ones. from > to wraps through the start line.
 * @param {import('./Centerline.js').Centerline} cl
 * @param {object} def track def
 * @param {string[]} wallNames wall style names (index+1 is stored; 0 = no wall)
 * @param {string[]} kerbNames kerb style names (index+1 is stored; 0 = no kerb)
 */
export function buildStationFlags(cl, def, wallNames, kerbNames, voidEdges = false) {
  const N = cl.N, ds = cl.ds;
  const F = {
    wallL: new Uint8Array(N), wallR: new Uint8Array(N), kerbL: new Uint8Array(N), kerbR: new Uint8Array(N),
    edgeL: new Uint8Array(N), edgeR: new Uint8Array(N), skirtL: new Float32Array(N), skirtR: new Float32Array(N),
    gap: new Uint8Array(N), thick: new Float32Array(N),
  };
  const dflt = def.defaults ?? {};
  const apply = (side, props, i) => {
    if (!props) return;
    const L = side === 'left';
    if ('wall' in props) {
      const w = props.wall && props.wall !== 'none' ? wallNames.indexOf(props.wall) + 1 : 0;
      if (props.wall && props.wall !== 'none' && w === 0) throw new Error(`Track def: unknown wall style "${props.wall}"`);
      (L ? F.wallL : F.wallR)[i] = w;
    }
    if ('kerb' in props) (L ? F.kerbL : F.kerbR)[i] = props.kerb && props.kerb !== 'none' ? (props.kerb === true ? 1 : kerbNames.indexOf(props.kerb) + 1) : 0;
    if ('edge' in props) {
      const e = EDGE_SURFACES.indexOf(props.edge);
      if (e < 0) throw new Error(`Track def: unknown edge surface "${props.edge}"`);
      (L ? F.edgeL : F.edgeR)[i] = e;
    }
    if ('skirt' in props) (L ? F.skirtL : F.skirtR)[i] = props.skirt;
  };
  const base = voidEdges ? { skirt: 0, edge: 'void', wall: null, kerb: false } : { skirt: 10, edge: 'grass', wall: null, kerb: false };
  const thick0 = def.road?.thickness ?? 0;
  F.thick.fill(thick0);
  for (let i = 0; i < N; i++) {
    apply('left', { ...base, ...(dflt.both ?? {}), ...(dflt.left ?? {}) }, i);
    apply('right', { ...base, ...(dflt.both ?? {}), ...(dflt.right ?? {}) }, i);
  }
  for (const z of def.zones ?? []) {
    const s0 = resolveS(z.from, cl.marks, cl.length), s1 = resolveS(z.to, cl.marks, cl.length);
    const common = {};
    for (const k of ['wall', 'kerb', 'edge', 'skirt']) if (k in z) common[k] = z[k];
    const sideKey = z.side ?? 'both';
    for (let i = 0; i < N; i++) {
      const s = i * ds;
      const inside = s0 <= s1 ? s >= s0 - 1e-6 && s <= s1 + 1e-6 : s >= s0 - 1e-6 || s <= s1 + 1e-6;
      if (!inside) continue;
      if (z.gap) F.gap[i] = 1;
      if ('thickness' in z) F.thick[i] = z.thickness;
      if (Object.keys(common).length) {
        if (sideKey === 'both' || sideKey === 'left') apply('left', common, i);
        if (sideKey === 'both' || sideKey === 'right') apply('right', common, i);
      }
      apply('left', z.left, i);
      apply('right', z.right, i);
    }
  }
  return F;
}
