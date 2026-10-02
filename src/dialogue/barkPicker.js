// Bark selection: shuffle bags (every line is used once before any repeats, and never the same line twice in a row),
// item-aware pools, rival-specific pools and {other} substitution. Pure logic, Node-importable, no clock.

/** Normalise a bank entry to { t, key?, items?, rude? }. `rude: true` marks the edgy lines: the Settings toggle 'Rude banter' switches them off for a mild game. */
export const norm = (l) => (typeof l === 'string' ? { t: l } : l);

/** A shuffle bag over a list. `next(pred)` never returns the previously drawn item twice in a row when there is a choice. */
export class ShuffleBag {
  /** @param {any[]} items @param {() => number} rng */
  constructor(items, rng = Math.random) {
    this.items = items; this.rng = rng; this.left = []; this.last = -1;
  }

  _refill() {
    const idx = this.items.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    // the first draw of a new round must not repeat the last draw of the previous one
    if (idx.length > 1 && idx[idx.length - 1] === this.last) { const k = Math.floor(this.rng() * (idx.length - 1)); [idx[idx.length - 1], idx[k]] = [idx[k], idx[idx.length - 1]]; }
    this.left = idx;
  }

  /** @param {(item:any)=>boolean} [pred] only items satisfying it (null when none of the remaining ones do) */
  next(pred) {
    if (!this.items.length) return null;
    if (!this.left.length) this._refill();
    for (let n = this.left.length - 1; n >= 0; n--) {          // draw from the end of the shuffled remainder
      const i = this.left[n];
      if (pred && !pred(this.items[i])) continue;
      this.left.splice(n, 1);
      this.last = i;
      return this.items[i];
    }
    return null;
  }
}

/** Categories where a rival-specific ("vs") line can replace a general one. */
export const VS_CATEGORIES = new Set(['overtake', 'overtaken', 'item_hit_rival', 'item_use_attack', 'taunt', 'bump', 'bumped', 'hit_by_item', 'lose_lead', 'take_lead', 'roast']);

/** One character's bank with its bags. */
export class BarkBank {
  /** @param {Record<string, any>} bank @param {() => number} rng */
  constructor(bank, rng = Math.random) {
    this.bank = bank; this.rng = rng; this.bags = new Map();
  }

  has(cat) { return Array.isArray(this.bank[cat]) && this.bank[cat].length > 0; }

  _bag(id, make) {
    let b = this.bags.get(id);
    if (!b) { b = new ShuffleBag(make(), this.rng); this.bags.set(id, b); }
    return b;
  }

  /**
   * Draw a line.
   * @param {string} cat category
   * @param {{ item?: string, other?: string, hasOther?: boolean, avoid?: (line:object)=>boolean, prefer?: (line:object)=>boolean, preferChance?: number, rude?: boolean, rudeBias?: number, key?: string, noRudeOther?: boolean }} [ctx]
   *  `other` = rival character id (for vs pools), `hasOther` = a {other} name is available, `avoid` = reject lines (e.g. cooling voice keys),
   *  `prefer` = choose such a line with `preferChance` (used to favour Marco's recorded canonical lines),
   *  `rude` = false drops every line tagged `rude` (the mild game), `rudeBias` = how often a general pick draws from the edgy lines when they exist,
   *  `key` = only the line carrying this Marco voice key, `on` = the moment (throwaway lines tagged for it are preferred),
   *  `noRudeOther` = the other party is a real (customised) person: edgy lines that name them are dropped and the rival-specific pool is skipped.
   * @returns {{ t: string, key?: string, items?: string[], vs?: boolean }|null}
   */
  pick(cat, ctx = {}) {
    const { item, other, hasOther = !!other, avoid, prefer, preferChance = 0, rude = true, rudeBias = 0.6, key, noRudeOther = false, on } = ctx;
    const ok = (l) => (hasOther || !l.t.includes('{other}')) && !(avoid && avoid(l)) && (rude || !l.rude) && !(noRudeOther && l.rude && l.t.includes('{other}')) && (!key || l.key === key);
    // 1. rival-specific pool
    const vs = VS_CATEGORIES.has(cat) && other && !noRudeOther ? this.bank.vs?.[other] : null;
    if (vs?.length && this.rng() < 0.4) {
      const l = this._bag(`vs|${other}|${rude ? 'r' : 'm'}`, () => vs.map(norm).filter((x) => rude || !x.rude)).next(ok);
      if (l) return { ...l, vs: true };
    }
    const src = this.bank[cat];
    if (!src?.length) return null;
    // 2. item-specific lines, when this item has some
    if (key) {                                                   // a specific recorded line was asked for (menu greeting, forced clip)
      const hit = src.map(norm).find((l) => l.key === key);
      return hit && ok(hit) ? { ...hit } : null;
    }
    if (item) {
      const forItem = src.map(norm).filter((l) => l.items?.includes(item));
      if (forItem.length && this.rng() < 0.6) {
        const l = this._bag(`${cat}|item|${item}`, () => forItem).next(ok);
        if (l) return l;
      }
    }
    // 2b. lines for this moment (`on: ['jump', ...]`, the throwaway interjections), when this moment has some
    if (on) {
      const forOn = src.map(norm).filter((l) => l.on?.includes(on));
      if (forOn.length && this.rng() < 0.8) {
        const l = this._bag(`${cat}|on|${on}`, () => forOn).next(ok);
        if (l) return l;
      }
    }
    // 3. general pool (lines without an item restriction): a mild bag and, in a rude game, an edgy bag drawn from `rudeBias` of the time
    const mild = this._bag(cat, () => src.map(norm).filter((l) => !l.items && !l.on && !l.rude));
    const edgy = rude ? this._bag(`${cat}|rude`, () => src.map(norm).filter((l) => !l.items && !l.on && l.rude)) : null;
    const bags = edgy?.items.length ? [mild, edgy] : [mild];
    if (prefer && this.rng() < preferChance) for (const b of bags) { const l = b.next((x) => ok(x) && prefer(x)); if (l) return l; }
    if (bags.length > 1 && this.rng() < rudeBias) bags.reverse();
    for (const b of bags) {
      if (!b.items.length) continue;
      let l = b.next(ok);
      if (!l) { b.left = []; l = b.next(ok); }
      if (l) return l;
    }
    return null;
  }
}

/** Replace {other} (the rival's name) and {class} (the speed class in Mbps). */
export const fill = (text, otherName, vars = {}) => text.replace(/\{other\}/g, otherName || vars.you || 'you').replace(/\{class\}/g, vars.class ?? '100');
