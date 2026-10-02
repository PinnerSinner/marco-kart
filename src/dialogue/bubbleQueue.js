// Which floating speech texts are alive at the moment: one per speaker, at most BUBBLE.maxVisible, the human's own line always first.
// Pure logic (no DOM, no clock of its own): src/ui/worldBubbles.js draws what this decides. Node-importable and unit tested.
import { BUBBLE, bubbleStyle, bubbleState } from './bubbleMath.js';

/**
 * Does a bark float over a kart? Every racer's line does, the human's own included. Menu lines (title greeting, character pick) have no kart
 * to hang the text on.
 * @param {{text?: string, menu?: boolean}} d
 */
export const wantsBubble = (d) => !!d?.text && !d.menu;

/** Menu lines are the only ones shown as a (small, bottom-centre) subtitle: there is no kart to float over. There is no caption box in a race. */
export const wantsMenuSubtitle = (d) => !!d?.text && !!d.menu;

/** Order in which bubbles are kept: the human's own first, then the most recently started. */
const byRank = (a, b) => (b.isPlayer ? 1 : 0) - (a.isPlayer ? 1 : 0) || b.t0 - a.t0;

export class BubbleSet {
  /**
   * @param {{max?: number, onRemove?: (entry: object) => void}} [o] onRemove: called once for every entry that leaves (expired, replaced, evicted, cleared)
   */
  constructor({ max = BUBBLE.maxVisible, onRemove = null } = {}) {
    this.max = max; this.onRemove = onRemove;
    /** @type {{id:string, charId:string, text:string, ms:number, t0:number, isPlayer:boolean, mood:string, key:string|null, clip:boolean, style:string, rude:boolean, el:any}[]} */
    this.entries = [];
    this.enabled = true;
  }

  get size() { return this.entries.length; }

  _drop(i) {
    const [e] = this.entries.splice(i, 1);
    if (e && this.onRemove) { try { this.onRemove(e); } catch { /* the view is gone */ } }
  }

  /**
   * A new line. The same speaker's previous bubble is replaced; when the screen is full the oldest rival bubble makes room for the human's line,
   * or for a rival's once that one has been up for a while. Returns the entry, or null when there was no room.
   * @param {{id:string, charId:string, text:string, ms?:number, isPlayer?:boolean, mood?:string, key?:string|null, clip?:boolean, rude?:boolean}} bark
   * @param {number} nowMs
   */
  add(bark, nowMs) {
    if (!this.enabled || !wantsBubble(bark)) return null;
    this.prune(nowMs);
    const same = this.entries.findIndex((e) => e.id === bark.id);
    if (same >= 0) this._drop(same);
    if (this.entries.length >= this.max) {
      // the candidate to make room for a newcomer: the oldest bubble that is not the human's
      let victim = -1;
      for (let i = 0; i < this.entries.length; i++) {
        const e = this.entries[i];
        if (e.isPlayer && !bark.isPlayer) continue;
        if (victim < 0 || e.t0 < this.entries[victim].t0) victim = i;
      }
      if (victim < 0) return null;
      const v = this.entries[victim];
      // a rival's bubble only bumps another rival's after the first has had a fair look (40% of its life)
      if (!bark.isPlayer && nowMs - v.t0 < v.ms * 0.4) return null;
      this._drop(victim);
    }
    const e = {
      id: bark.id, charId: bark.charId, text: bark.text, ms: Math.max(BUBBLE.minMs, bark.ms || BUBBLE.minMs), t0: nowMs, isPlayer: !!bark.isPlayer,
      mood: bark.mood || 'neutral', key: bark.key ?? null, clip: !!bark.clip, style: bubbleStyle(bark.charId), rude: !!bark.rude, el: null,
    };
    this.entries.push(e);
    return e;
  }

  /** Remove the bubbles whose time is up. */
  prune(nowMs) {
    for (let i = this.entries.length - 1; i >= 0; i--) if (nowMs - this.entries[i].t0 >= this.entries[i].ms) this._drop(i);
  }

  /** The entries in drawing order (the human's first). Sorts in place; allocates nothing. */
  ordered() { return this.entries.sort(byRank); }

  /** Visual state of an entry right now. @returns {{phase:string, alpha:number, pop:number}} */
  state(e, nowMs) { return bubbleState(nowMs - e.t0, e.ms); }

  /** Drop everything (race over, pause menu, UI hidden). */
  clear() { while (this.entries.length) this._drop(this.entries.length - 1); }
}
