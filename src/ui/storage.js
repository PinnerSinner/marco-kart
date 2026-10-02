// Guarded key/value storage with an in-memory fallback. Safe to import in Node (no window access at import time).

/**
 * Create a JSON store. Uses window.localStorage when it is usable, otherwise a Map.
 * Every access is wrapped in try/catch because localStorage can throw (private windows, sandboxed iframes).
 * @param {{ prefix?: string, backend?: Storage|null }} [opts] backend override (tests) - pass null to force memory
 * @returns {{ get(key: string, fallback?: any): any, set(key: string, value: any): boolean, remove(key: string): void, readonly persistent: boolean }}
 */
export function createStore({ prefix = 'marcokart.v1.', backend } = {}) {
  const memory = new Map();
  let ls = null;
  try {
    ls = backend !== undefined ? backend : (typeof window !== 'undefined' ? window.localStorage : null);
    if (ls) {
      const probe = `${prefix}__probe`;
      ls.setItem(probe, '1');
      ls.removeItem(probe);
    }
  } catch {
    ls = null;
  }
  let persistent = !!ls;

  return {
    get persistent() { return persistent; },
    get(key, fallback = null) {
      const k = prefix + key;
      let raw = null;
      if (persistent) {
        try { raw = ls.getItem(k); } catch { persistent = false; }
      }
      if (raw == null) raw = memory.get(k) ?? null;
      if (raw == null) return fallback;
      try { return JSON.parse(raw); } catch { return fallback; }
    },
    set(key, value) {
      const k = prefix + key;
      let raw;
      try { raw = JSON.stringify(value); } catch { return false; }
      memory.set(k, raw);
      if (persistent) {
        try { ls.setItem(k, raw); return true; } catch { persistent = false; }
      }
      return false;
    },
    remove(key) {
      const k = prefix + key;
      memory.delete(k);
      if (persistent) { try { ls.removeItem(k); } catch { persistent = false; } }
    },
  };
}
