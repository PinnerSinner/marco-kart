// Animator: registry of per-frame callbacks (spinning fans, cable cars, moving obstacles, flags, water...).
// Track.update(dt, time) runs every registered function. Callbacks must not allocate.
export class Animator {
  constructor() { this.fns = []; }

  /**
   * Register a callback.
   * @param {(dt:number, time:number)=>void} fn dt in seconds, time = total seconds
   * @returns {Function} the same fn (pass to remove())
   */
  add(fn) { this.fns.push(fn); return fn; }

  /** Unregister a callback. */
  remove(fn) { const i = this.fns.indexOf(fn); if (i >= 0) this.fns.splice(i, 1); }

  /** Run all callbacks. */
  update(dt, time) { const f = this.fns; for (let i = 0; i < f.length; i++) f[i](dt, time); }

  clear() { this.fns.length = 0; }
}
