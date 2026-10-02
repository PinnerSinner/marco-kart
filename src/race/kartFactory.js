// The single indirection through which Race creates karts and resolves kart-vs-kart collisions.
// `defaultKartFactory` uses A1's real KartPhysics; `simpleKartFactory` (the SimpleKart fixture) stays available so
// tests can run against both. Also home of the rubber-band lever (`setSpeedScale`).
import { KartPhysics, resolveKartCollisions } from '../kart/KartPhysics.js';
import { SimpleKart, resolveKartCollisions as resolveSimple } from '../kart/SimpleKart.js';

/**
 * SimpleKart plus the `speedScale` lever (multiplier on top speed, 1 = stock).
 * Only used as a fixture: the real physics is expected to honour `kart.speedScale` natively (see REQUESTS.md).
 */
class ScalableSimpleKart extends SimpleKart {
  constructor(track, opts) { super(track, opts); this.speedScale = 1; }

  /** @param {number} dt seconds @param {{throttle:number,brake:number,steer:number,drift:boolean}} input */
  update(dt, input) {
    const base = this.baseMax;
    this.baseMax = base * this.speedScale;
    super.update(dt, input);
    this.baseMax = base;
  }
}

/**
 * @typedef {object} KartFactory
 * @property {string} name
 * @property {(track: object, opts: {id:string,charId:string,kartId:string,stats:object}) => object} create
 * @property {(karts: object[]) => void} resolve  pairwise collision resolution, once per fixed step
 */

/** @type {KartFactory} */
export const simpleKartFactory = {
  name: 'simple',
  create: (track, opts) => new ScalableSimpleKart(track, opts),
  resolve: resolveSimple,
};

/** @type {KartFactory} */
export const realKartFactory = {
  name: 'physics',
  create: (track, opts) => new KartPhysics(track, opts),
  resolve: resolveKartCollisions,
};

/** @type {KartFactory} */
export const defaultKartFactory = realKartFactory;

/**
 * Sets the bounded rubber-band / difficulty speed multiplier on a kart (1 = stock top speed and acceleration).
 * Uses `kart.speedScale` when the kart implements it; otherwise scales the physics parameter block directly
 * (`params.top` and `params.a0` of KartPhysics; see REQUESTS.md for the clean lever we would like).
 * @param {object} kart @param {number} scale expected within about [1, 1.12]
 * @returns {boolean} whether the kart accepted the scale
 */
export function setSpeedScale(kart, scale) {
  if ('speedScale' in kart) { kart.speedScale = scale; return true; }
  const p = kart.params;
  if (p && Number.isFinite(p.top) && Number.isFinite(p.a0)) {
    if (kart._rbBase === undefined) kart._rbBase = { top: p.top, a0: p.a0 };
    p.top = kart._rbBase.top * scale;
    p.a0 = kart._rbBase.a0 * scale;
    return true;
  }
  return false;
}
