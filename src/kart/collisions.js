// Kart-vs-kart collision response. Mass-weighted impulses, a sideways shove, boost loss on bumps.
// Called once per fixed step, after every kart has been updated (see KartPhysics.resolveKartCollisions).
import { bus } from '../core/bus.js';
import { clamp01 } from '../core/util.js';
import { TUNING as T } from './kartTuning.js';

const RESTITUTION = 0.62;        // how lively the bounce is
const MIN_SEPARATION_SPEED = 2.2; // m/s: overlapping karts always end up moving apart at least this fast
const VERTICAL_REACH = 1.9;       // karts further apart than this vertically do not touch (bridges, jumps)
const BUMP_EVENT_MIN = 0.08;      // ignore feather touches for events
const BUMP_COOLDOWN_TICKS = 12;   // 0.2 s at 60 Hz, per kart
const INVINCIBLE_MASS = 2.2;      // an invincible (Sudo) kart bulldozes
const STAGGER_REF = 14;          // m/s of velocity change that gives a kart its full post-bump stagger (kart type decides how long it lasts)

function effectiveMass(k) {
  const s = k.scale > 0 ? k.scale : 1;
  let m = k.mass * (0.4 + 0.6 * s * s);
  if (k.status.invincible > 0) m *= INVINCIBLE_MASS;
  return m;
}

function refreshSpeed(k) {
  const vx = k.vel.x, vz = k.vel.z;
  const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
  const mag = Math.sqrt(vx * vx + vz * vz);
  k.speed = vx * fx + vz * fz >= 0 ? mag : -mag;
}

/** Starts (or extends) the post-bump stagger of a kart that just changed velocity by `dv` m/s. */
function stagger(k, dv) {
  const t = k.params.stagger * clamp01(dv / STAGGER_REF);
  if (t > k._stagger) k._stagger = t;
}

/**
 * Pairwise kart bumps: positional separation + impulse along the contact normal, weighted by mass, plus a
 * small sideways shove. Emits `kart:bump {id, otherId, impact}` (impact 0..1) once per kart per 0.2 s.
 * Falling or respawning karts are ghosts. Deterministic (array order).
 * @param {import('./KartPhysics.js').KartPhysics[]} karts
 */
export function resolveKartCollisions(karts) {
  const n = karts.length;
  for (let i = 0; i < n; i++) {
    const a = karts[i];
    if (a._fallen || a.status.respawning > 0) continue;
    for (let j = i + 1; j < n; j++) {
      const b = karts[j];
      if (b._fallen || b.status.respawning > 0) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      if (Math.abs(a.pos.y - b.pos.y) > VERTICAL_REACH) continue;

      let d = Math.sqrt(d2), nx, nz;
      if (d > 1e-4) { nx = dx / d; nz = dz / d; }
      else { nx = Math.cos(a.yaw); nz = -Math.sin(a.yaw); d = 0; }   // exactly stacked: shove along a's right

      const avx = a.vel.x, avz = a.vel.z, bvx = b.vel.x, bvz = b.vel.z;
      const ma = effectiveMass(a), mb = effectiveMass(b);
      const inv = 1 / (ma + mb);
      const pen = min - d;
      // positional correction: the lighter kart moves more
      a.pos.x -= nx * pen * mb * inv; a.pos.z -= nz * pen * mb * inv;
      b.pos.x += nx * pen * ma * inv; b.pos.z += nz * pen * ma * inv;

      // impulse along the normal (n points a -> b)
      const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
      let closing = 0;
      if (rel < 0) {
        closing = -rel;
        const j1 = (1 + RESTITUTION) * closing / (1 / ma + 1 / mb);
        a.vel.x -= nx * j1 / ma; a.vel.z -= nz * j1 / ma;
        b.vel.x += nx * j1 / mb; b.vel.z += nz * j1 / mb;
      }
      // sideways shove so side-by-side karts visibly bounce apart, lighter kart more
      const after = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
      if (after < MIN_SEPARATION_SPEED) {
        const need = MIN_SEPARATION_SPEED - after;
        a.vel.x -= nx * need * mb * inv; a.vel.z -= nz * need * mb * inv;
        b.vel.x += nx * need * ma * inv; b.vel.z += nz * need * ma * inv;
      }

      const impact = clamp01(closing / (T.impactRef * a.params.c));
      refreshSpeed(a); refreshSpeed(b);
      if (impact < BUMP_EVENT_MIN) continue;
      // a heavy kart barely notices, a light one is knocked about and loses steering for a moment (recovery time: kart type)
      stagger(a, Math.hypot(a.vel.x - avx, a.vel.z - avz));
      stagger(b, Math.hypot(b.vel.x - bvx, b.vel.z - bvz));
      // lose boost time on a real bump: heavier karts lose less
      a.boost.time = Math.max(0, a.boost.time - impact * 0.5 * (1.4 - 0.2 * Math.min(5, a.params.weight)) * a.params.bumpKeep);
      b.boost.time = Math.max(0, b.boost.time - impact * 0.5 * (1.4 - 0.2 * Math.min(5, b.params.weight)) * b.params.bumpKeep);
      if (a.drift.active && impact > 0.35) a.drift.charge *= 0.75;
      if (b.drift.active && impact > 0.35) b.drift.charge *= 0.75;
      if (a._tick - a._bumpTick >= BUMP_COOLDOWN_TICKS) { a._bumpTick = a._tick; bus.emit('kart:bump', { id: a.id, otherId: b.id, impact }); }
      if (b._tick - b._bumpTick >= BUMP_COOLDOWN_TICKS) { b._bumpTick = b._tick; bus.emit('kart:bump', { id: b.id, otherId: a.id, impact }); }
    }
  }
}
