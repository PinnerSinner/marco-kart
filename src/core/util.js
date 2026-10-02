// Small math helpers shared by everything. Pure, no DOM, no three import.

export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp01(invLerp(a, b, v)));
export const sign = (v) => (v < 0 ? -1 : 1);
export const smoothstep = (a, b, v) => { const t = clamp01(invLerp(a, b, v)); return t * t * (3 - 2 * t); };

// Frame-rate independent exponential smoothing: current -> target with "lambda" (higher = snappier)
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

// Wrap angle to (-PI, PI]
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const angleDiff = (from, to) => wrapAngle(to - from);

// Wrap a distance s into [0, length)
export const wrapS = (s, length) => { s %= length; return s < 0 ? s + length : s; };
// Shortest signed difference a->b on a loop of given length, in (-length/2, length/2]
export const loopDiff = (a, b, length) => { let d = (b - a) % length; if (d > length / 2) d -= length; else if (d <= -length / 2) d += length; return d; };

export const yawToForward = (yaw, out = { x: 0, y: 0, z: 0 }) => { out.x = Math.sin(yaw); out.y = 0; out.z = Math.cos(yaw); return out; };
export const yawToRight = (yaw, out = { x: 0, y: 0, z: 0 }) => { out.x = -Math.cos(yaw); out.y = 0; out.z = Math.sin(yaw); return out; };
export const forwardToYaw = (x, z) => Math.atan2(x, z);

// Seeded RNG (mulberry32). Use for anything that should be reproducible (scenery layout, tests).
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + (hi - lo) * rng();
  rng.int = (lo, hi) => Math.floor(rng.range(lo, hi + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  return rng;
}

export function formatTime(seconds) {
  if (!isFinite(seconds)) return '--:--.---';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
