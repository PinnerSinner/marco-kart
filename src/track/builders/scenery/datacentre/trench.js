// The cable trench: a shortcut across the inside of the first dogleg corner. World-placed deck platforms (real geometry: the same height
// function feeds query() and the mesh), oil-spill pads with the `oil` surface, a boost pad, rack rows that confine the trench, and the wall
// openings where it leaves and rejoins the road. All numbers are derived from the route so the def, the dressing and the tests agree.

const DECK_W = 11;          // main diagonal deck width (m)
const LANE_W = 10;          // merge lane width (m)
const LANE_LAT = -14.2;     // merge lane centre, metres left of the road centre line (the lane touches the road edge)
const WALL_LAT = 11.2;      // mid-thickness of the road's rack wall (m from the centre line)
const CAP_R = 1.0;          // rack row collider radius

/** Nearest-station lateral offset (m, + = right) of a world point, searched near arc length sHint. */
function makeLateral(cl) {
  return (x, z, sHint) => {
    let best = 1e18, bi = 0;
    const N = cl.N, i0 = Math.round(sHint / cl.ds);
    for (let k = -50; k <= 50; k++) {
      const i = (((i0 + k) % N) + N) % N, dx = x - cl.x[i], dz = z - cl.z[i], d = dx * dx + dz * dz;
      if (d < best) { best = d; bi = i; }
    }
    return { lat: -(x - cl.x[bi]) * cl.tz[bi] + (z - cl.z[bi]) * cl.tx[bi], s: bi * cl.ds };
  };
}

/**
 * @param {ReturnType<import('./route.js').routeInfo>} R
 * @returns {object} { from, to, zones, platforms(M), deck, lane, oil, boost, capsules, mouths }
 */
export function trenchSpec(R, o = {}) {
  const { at, S, cl } = R, lateralOf = makeLateral(cl);
  const id = o.id ?? 'trench', sg = o.sg ?? -1, side = sg < 0 ? 'left' : 'right';
  const sA = o.sA ?? S('pre', -100), sQ = o.sQ ?? S('dl0', 45), sL2 = sQ - 4, L2len = o.laneLen ?? 56;
  const laneLat = sg * 14.2, wallLat = sg * WALL_LAT, kind = o.kind ?? 'oil';
  const P0 = at(sA, sg * 7), Q = at(sQ, laneLat);
  const dx = Q.x - P0.x, dz = Q.z - P0.z, dlen = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
  const deck = { x: P0.x, z: P0.z, yaw, length: dlen + 4, width: DECK_W, ax: Math.sin(yaw), az: Math.cos(yaw), rx: -Math.cos(yaw), rz: Math.sin(yaw) };
  const L2 = at(sL2, laneLat);
  const lane = { x: L2.x, z: L2.z, yaw: L2.yaw, length: L2len, width: LANE_W };
  /** World point at distance u along the deck axis and v to its right. */
  const dp = (u, v) => ({ x: deck.x + deck.ax * u + deck.rx * v, z: deck.z + deck.az * u + deck.rz * v });

  // where the two deck edges cross the rack wall of the road (left side of the road), scanning along each edge
  const cross = (v) => {
    for (let u = -18; u < deck.length; u += 0.25) {
      const p = dp(u, v), q = lateralOf(p.x, p.z, sA + u * 0.6);
      if (sg * q.lat >= WALL_LAT && Math.abs(q.s - sA) < 80) return { ...p, u, s: q.s };
    }
    return null;
  };
  const cNW = cross(-DECK_W / 2 - CAP_R * 0.5), cSE = cross(DECK_W / 2 + CAP_R * 0.5);   // which one is which is resolved by s below
  const sLo = Math.min(cNW.s, cSE.s) - 3, sHi = Math.max(cNW.s, cSE.s) + 3;
  const zones = [
    { from: sLo, to: sHi, side, wall: 'none' },
    { from: sQ - 13, to: sQ + L2len - 8, side, wall: 'none' },
  ];

  // rack rows confining the deck (capsules): from the road wall to the lane; the lane is closed at its far end and along its outer edge
  const capsules = [];
  const sideRow = (v, c) => { const a = c ? { x: c.x, z: c.z } : dp(0, v), b = dp(deck.length - 8, v); capsules.push([a.x, a.z, b.x, b.z, CAP_R]); };
  sideRow(-DECK_W / 2 - CAP_R * 0.5, cNW); sideRow(DECK_W / 2 + CAP_R * 0.5, cSE);
  const laneEdge = at(sL2 + 4, laneLat + sg * (LANE_W / 2 + CAP_R * 0.5)), laneEnd = at(sL2 + L2len - 2, laneLat + sg * (LANE_W / 2 + CAP_R * 0.5));
  const roadWallEnd = at(sL2 + L2len - 2, wallLat);
  capsules.push([laneEdge.x, laneEdge.z, laneEnd.x, laneEnd.z, CAP_R], [laneEnd.x, laneEnd.z, roadWallEnd.x, roadWallEnd.z, CAP_R]);

  // oil spills (surface 'oil') and a boost pad on the deck, at fractions of its length; lateral offsets alternate so the trench has to be weaved
  const oil = (kind === 'oil' ? [[0.2, 2.3, 7, 4.6], [0.36, -2.3, 7, 4.6], [0.52, 2.3, 7.5, 4.8], [0.66, -2.2, 6, 4.4]] : []).map(([f, v, len, w]) => {
    const u = dlen * f, p = dp(u - len / 2, v); return { x: p.x, z: p.z, yaw, length: len, width: w, u, v };
  });
  const bp = dp(dlen * 0.84 - 5, 0), boost = { x: bp.x, z: bp.z, yaw, length: 10, width: 6 };

  return {
    id, side, from: o.from ?? S('pre', -105), to: o.to ?? S('dl0', 72), sg, zones, deck, lane, oil, boost, capsules, sA, sQ, mouthA: { sLo, sHi }, dp,
    /** Platform defs (ramps list): the deck, the merge lane, oil pads and the boost pad. `M` supplies the platform materials. */
    platforms(M) {
      const flat = { kind: 'deck', lip: false, y0: R.Y0, y1: R.Y0, startBevel: 0.3, endBevel: 0.3, sideBevel: 0.15, surface: 'road', road: true };
      const pad = (id, o, surface, y, material) => ({ id, kind: 'pad', lip: false, y0: y, y1: y, startBevel: 0.25, endBevel: 0.25, sideBevel: 0.15, surface, road: true, material, ...o });
      return [
        { id: `${id}-deck`, ...flat, x: deck.x, z: deck.z, yaw: deck.yaw, length: deck.length, width: DECK_W, material: M.grating(DECK_W, 'magenta') },
        { id: `${id}-lane`, ...flat, x: lane.x, z: lane.z, yaw: lane.yaw, length: lane.length, width: LANE_W, y0: R.Y0 + 0.02, y1: R.Y0 + 0.02, material: M.grating(LANE_W, 'cyan') },
        ...oil.map((o, k) => pad(`${id}-spill${k}`, { x: o.x, z: o.z, yaw: o.yaw, length: o.length, width: o.width }, 'oil', R.Y0 + 0.04, M.spillMat(o.width, o.length))),
        pad(`${id}-boost`, { x: boost.x, z: boost.z, yaw: boost.yaw, length: boost.length, width: boost.width }, 'boost', R.Y0 + 0.04, M.boostMat(boost.width)),
      ];
    },
  };
}
