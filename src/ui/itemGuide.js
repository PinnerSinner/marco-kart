// The Item Guide: a filterable grid of every item (icon, name, category, ONE plain sentence, a "good against" tip, how to use it, and
// whether it is skill-based). Shared by the Item Guide screen (main menu) and the pause menu. All copy comes from ITEMS (config.js), so the
// guide can never drift from the HUD captions. `guideItems` / `guideCopy` are pure and Node-testable; DOM is only touched by `ItemGuide`.
import { ITEMS, ITEM_CATEGORIES } from '../core/config.js';
import { h } from './dom.js';
import { itemIcon } from './icons.js';

/** Filter chips, in display order. `skill` is a real category, so the chips are simply All plus every category. */
export const GUIDE_FILTERS = Object.freeze([{ id: 'all', label: 'All' }, ...Object.values(ITEM_CATEGORIES).map((c) => ({ id: c.id, label: c.label }))]);

/**
 * Everything the guide shows for one item.
 * @param {string} id item id
 * @returns {{id:string,name:string,blurb:string,good:string,how:string,category:string,categoryLabel:string,skill:boolean}}
 */
export function guideCopy(id) {
  const it = ITEMS[id];
  return {
    id, name: it.name, blurb: it.blurb, good: it.good, how: it.how, category: it.category,
    categoryLabel: ITEM_CATEGORIES[it.category]?.label ?? it.category, skill: !!it.skill,
    exclusive: it.exclusive ?? null, exclusiveLabel: it.exclusive ? `${(it.exclusive[0] ?? '').toUpperCase()}${it.exclusive.slice(1)} only` : '',
  };
}

/**
 * The items to list for a filter, in the order of `ITEMS`.
 * @param {string} [filter] 'all' or a category id
 * @returns {ReturnType<typeof guideCopy>[]}
 */
export function guideItems(filter = 'all') {
  const out = [];
  for (const id of Object.keys(ITEMS)) {
    const c = guideCopy(id);
    if (filter === 'all' || c.category === filter) out.push(c);
  }
  return out;
}

/** Number of items per filter chip: { all: 24, attack: 6, ... }. */
export function guideCounts() {
  const n = { all: 0 };
  for (const c of Object.keys(ITEM_CATEGORIES)) n[c] = 0;
  for (const it of Object.values(ITEMS)) { n.all++; n[it.category]++; }
  return n;
}

export class ItemGuide {
  /** @param {{ compact?: boolean, sfx?: (name: string) => void }} [opts] `compact`: the pause-menu variant (shorter intro) */
  constructor(opts = {}) {
    this.opts = opts;
    this.filter = 'all';
    this.chips = new Map();
    this.cards = new Map();
    this.el = this._build();
  }

  _build() {
    const counts = guideCounts();
    this.chipRow = h('div.ig-filters', { attrs: { role: 'group', 'aria-label': 'Filter items by kind' } });
    for (const f of GUIDE_FILTERS) {
      const chip = h(`button.ig-filter${f.id === 'all' ? '' : `.cat-${f.id}`}`, {
        attrs: { type: 'button', 'aria-pressed': f.id === 'all' ? 'true' : 'false' }, data: { nav: '', filter: f.id, sfx: 'ui-click' },
        on: { click: () => this.setFilter(f.id) },
      }, f.label, h('small', { text: String(counts[f.id]) }));
      if (f.id === 'all') chip.classList.add('on');
      this.chips.set(f.id, chip);
      this.chipRow.append(chip);
    }
    this.grid = h('div.ig-grid', { attrs: { role: 'list' } });
    for (const c of guideItems('all')) {
      const card = this._card(c);
      this.cards.set(c.id, card);
      this.grid.append(card);
    }
    this.empty = h('div.ig-empty', { text: 'Nothing here.', attrs: { hidden: '' } });
    this.scroll = h('div.ig-scroll', null, this.grid, this.empty);
    this.legend = h('p', null,
      h('b', { text: 'Two item slots. ' }),
      'The big slot is the one you fire; the small one waits behind it. Swap them with ',
      h('kbd.key', { text: 'Q' }), ' / ', h('kbd.key.wide', { text: 'Tab' }), ' (gamepad ', h('kbd.key.pad.wide', { text: 'LB' }), ', touch: tap the small slot). ',
      h('span.ig-skill-note', { text: 'SKILL-BASED' }), ' items reward good timing; the rest you simply press.');
    const intro = h('div.panel.ig-intro', null, this.legend);
    return h('div.ig', null, this.opts.compact ? null : intro, this.chipRow, this.scroll);
  }

  _card(c) {
    return h(`div.ig-card.cat-${c.category}${c.skill ? '.is-skill' : ''}${c.exclusive ? '.is-exclusive' : ''}`, {
      attrs: { role: 'listitem', tabindex: '0', 'aria-label': `${c.name}. ${c.blurb} Good against: ${c.good}. ${c.skill ? 'Skill-based. ' : ''}${c.exclusive ? `${c.exclusiveLabel}. ` : ''}${c.how}` },
      data: { nav: '', id: c.id, sfx: 'none' },
    },
    h('div.ig-ico', { html: itemIcon(c.id) }),
    h('div.ig-body', null,
      h('div.ig-head', null, h('span.ig-name', { text: c.name }), h('span.ig-chip', { text: c.categoryLabel }), c.skill ? h('span.ig-chip.skill-tag', { text: 'SKILL-BASED' }) : null, c.exclusive ? h('span.ig-chip.excl-tag', { text: c.exclusiveLabel }) : null),
      h('div.ig-blurb', { text: c.blurb }),
      h('div.ig-good', null, h('b', { text: 'Good against' }), h('span', { text: c.good })),
      h('div.ig-how', { text: c.how })));
  }

  /** @param {string} id 'all' or a category id: shows only those cards */
  setFilter(id) {
    if (!this.chips.has(id)) id = 'all';
    this.filter = id;
    for (const [fid, chip] of this.chips) { const on = fid === id; chip.classList.toggle('on', on); chip.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    let shown = 0;
    for (const [cid, card] of this.cards) {
      const show = id === 'all' || ITEMS[cid].category === id;
      card.hidden = !show;
      if (show) shown++;
    }
    this.empty.hidden = shown > 0;
    this.scroll.scrollTop = 0;
  }

  /** Back to "All", scrolled to the top (called when the screen opens). */
  reset() { this.setFilter('all'); }

  /** @returns {HTMLElement} the chip to focus first (the active filter) */
  firstFocus() { return this.chips.get(this.filter) ?? this.chips.get('all'); }
}
