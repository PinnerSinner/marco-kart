// Tiny synchronous event bus. Everything cross-module goes through this (see SPEC.md section 6).
const map = new Map();

export const bus = {
  on(name, fn) {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(fn);
    return () => bus.off(name, fn);
  },
  once(name, fn) {
    const off = bus.on(name, (d) => { off(); fn(d); });
    return off;
  },
  off(name, fn) { map.get(name)?.delete(fn); },
  emit(name, data) {
    const set = map.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(data); } catch (e) { console.error(`[bus] handler for "${name}" threw`, e); }
    }
  },
  clear() { map.clear(); },
};
