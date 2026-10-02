// Seeded value noise + fbm. Pure functions (no allocation): usable for terrain heights, colour variation and canvas textures.
const hash = (ix, iz, seed) => {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Smooth value noise in [0, 1]. */
export function noise2(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/** Fractal noise in [0, 1] (octaves of noise2, halving amplitude and doubling frequency). */
export function fbm2(x, z, octaves = 4, seed = 0) {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) { sum += amp * noise2(x * f, z * f, seed + o * 17); norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}

/** Tileable value noise: repeats every `period` cells (integer). Used by canvas texture generators. */
export function tileNoise2(x, z, period, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const w = (v) => ((v % period) + period) % period;
  const a = hash(w(ix), w(iz), seed), b = hash(w(ix + 1), w(iz), seed), c = hash(w(ix), w(iz + 1), seed), d = hash(w(ix + 1), w(iz + 1), seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/** Tileable fbm in [0, 1] over a texture of `cells` base cells. */
export function tileFbm2(x, z, cells, octaves = 4, seed = 0) {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) { sum += amp * tileNoise2(x * cells * f, z * cells * f, cells * f, seed + o * 31); norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}
