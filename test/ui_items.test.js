// Item labelling: every one of the 24 items (20 general + 4 Biscuit-only) has a display name, ONE plain sentence (60 characters or fewer) that matches what it does,
// a "good against" tip and a how-to; the HUD captions and the Item Guide read the same copy; the swap control is listed everywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, ITEM_IDS, ITEM_CATEGORIES, ITEM_SLOTS } from '../src/core/config.js';
import { ITEM_DEFS } from '../src/race/itemDefs.js';
import { guideCopy, guideItems, guideCounts, GUIDE_FILTERS } from '../src/ui/itemGuide.js';
import { itemCopy, popupFor, POP_SECONDS, SLOT_KEYS } from '../src/ui/itemHud.js';
import { hintRows } from '../src/ui/controlsHint.js';
import { mockHud } from './ui_mocks.js';

const SKILL_ITEMS = ['capacitor', 'cronjob', 'legacy'];

// ---- the copy ------------------------------------------------------------------------------------------------------------------

test('labels: exactly 24 items (20 + 4 Biscuit-only), each with a definition in the race and a known category', () => {
  assert.equal(ITEM_IDS.length, 24);
  for (const id of ITEM_IDS) {
    assert.ok(ITEM_DEFS[id], `${id} has a race definition`);
    assert.equal(ITEMS[id].id, id);
    assert.ok(ITEM_CATEGORIES[ITEMS[id].category], `${id} category ${ITEMS[id].category}`);
  }
});

test('labels: every item has a display name that is short enough to never be cut off (24 characters or fewer) and unique', () => {
  const seen = new Set();
  for (const id of ITEM_IDS) {
    const { name } = ITEMS[id];
    assert.equal(typeof name, 'string');
    assert.ok(name.trim().length >= 3, `${id} has a name`);
    assert.ok(name.length <= 24, `${id} name "${name}" is ${name.length} characters`);
    assert.equal(name, name.trim()); assert.ok(!/\s{2,}/.test(name));
    assert.ok(!seen.has(name.toLowerCase()), `duplicate name ${name}`);
    seen.add(name.toLowerCase());
  }
});

test('labels: every item has ONE plain sentence of 60 characters or fewer, ending in a full stop', () => {
  const seen = new Set();
  for (const id of ITEM_IDS) {
    const { blurb, name } = ITEMS[id];
    assert.equal(typeof blurb, 'string', `${id} has a blurb`);
    assert.ok(blurb.length >= 20, `${id} blurb is too short to explain anything: "${blurb}"`);
    assert.ok(blurb.length <= 60, `${id} blurb is ${blurb.length} characters: "${blurb}"`);
    assert.ok(/^[A-Z0-9]/.test(blurb), `${id} starts with a capital: "${blurb}"`);
    assert.ok(/[.]$/.test(blurb), `${id} ends with a full stop: "${blurb}"`);
    assert.equal((blurb.match(/[.!?](\s|$)/g) ?? []).length, 1, `${id} is a single sentence: "${blurb}"`);
    assert.ok(!/\s{2,}/.test(blurb) && blurb === blurb.trim(), `${id} spacing`);
    assert.ok(!/TODO|TBD|lorem|\?\?\?/i.test(blurb), `${id} placeholder text`);
    assert.ok(!seen.has(blurb), `duplicate blurb for ${id}`);
    seen.add(blurb);
    assert.notEqual(blurb.toLowerCase(), name.toLowerCase(), `${id}: the sentence must say more than the name`);
  }
});

test('labels: every item also carries a "good against" tip and a how-to, for the Item Guide', () => {
  for (const id of ITEM_IDS) {
    const { good, how } = ITEMS[id];
    assert.ok(typeof good === 'string' && good.length >= 8 && good.length <= 70, `${id} good-against tip: "${good}"`);
    assert.ok(typeof how === 'string' && how.length >= 20 && how.length <= 220, `${id} how-to (${how?.length}): "${how}"`);
    assert.ok(/[.]$/.test(how), `${id} how-to ends with a full stop`);
  }
});

test('labels: exactly the timing items are flagged skill-based, and they are in the Skill category', () => {
  const flagged = ITEM_IDS.filter((id) => ITEMS[id].skill).sort();
  assert.deepEqual(flagged, SKILL_ITEMS);
  for (const id of ITEM_IDS) assert.equal(ITEMS[id].category === 'skill', SKILL_ITEMS.includes(id), `${id} category matches the flag`);
});

test('labels: the sentences agree with the numbers in the item definitions', () => {
  const has = (id, re) => assert.match(ITEMS[id].blurb, re, `${id}: "${ITEMS[id].blurb}"`);
  has('sudo', /eight seconds/i); assert.equal(ITEM_DEFS.sudo.seconds, 8);
  has('firewall', /10 seconds/); assert.equal(ITEM_DEFS.firewall.seconds, 10);
  has('fibre', /4\.5 seconds/); assert.equal(ITEM_DEFS.fibre.seconds, 4.5);
  has('outage', /7 seconds/); assert.equal(ITEM_DEFS.outage.shrinkSeconds, 7);
  has('autoscale', /6 seconds/); assert.equal(ITEM_DEFS.autoscale.seconds, 6);
  has('zeroday', /5 seconds/); assert.equal(ITEM_DEFS.zeroday.arming, 5);
  has('forcepush', /14 metres/); assert.equal(ITEM_DEFS.forcepush.impulse > 0, true);
  has('bsod', /45 metres/);
  has('ping', /three times/); assert.equal(ITEM_DEFS.ping.bounces, 3);
  has('pods', /Three pods/); assert.equal(ITEM_DEFS.pods.count, 3);
  has('cronjob', /6-second/); assert.equal(ITEM_DEFS.cronjob.fuse, 6);
  has('sniffer', /front item/i);
});

test('labels: British English (no "color", "armor", "defense"...)', () => {
  for (const id of ITEM_IDS) {
    const text = `${ITEMS[id].name} ${ITEMS[id].blurb} ${ITEMS[id].good} ${ITEMS[id].how}`;
    assert.ok(!/\b(color|colors|armor|defense|gray|meter\b|center|neighbor|favorite|license)\b/i.test(text), `${id}: ${text}`);
  }
});

// ---- the guide and the HUD read the same copy -----------------------------------------------------------------------------------

test('guide: lists all 24 items in config order, with the same copy the HUD shows', () => {
  const all = guideItems('all');
  assert.equal(all.length, 24);
  assert.deepEqual(all.map((c) => c.id), ITEM_IDS);
  for (const c of all) {
    assert.equal(c.name, ITEMS[c.id].name); assert.equal(c.blurb, ITEMS[c.id].blurb);
    assert.equal(c.categoryLabel, ITEM_CATEGORIES[c.category].label);
    assert.equal(itemCopy(c.id).blurb, c.blurb, 'the HUD caption is the guide sentence');
    assert.equal(itemCopy(c.id).name, c.name);
    assert.equal(typeof c.skill, 'boolean');
  }
  assert.deepEqual(guideItems().map((c) => c.id), ITEM_IDS, 'the default filter is All');
});

test('guide: filters partition the list, and the chip counts add up', () => {
  const counts = guideCounts();
  assert.equal(counts.all, 24);
  let sum = 0;
  for (const f of GUIDE_FILTERS) {
    const list = guideItems(f.id);
    assert.equal(list.length, counts[f.id], `${f.id} count`);
    if (f.id !== 'all') { sum += list.length; assert.ok(list.every((c) => c.category === f.id)); }
  }
  assert.equal(sum, 24, 'every item is in exactly one category');
  assert.deepEqual(guideItems('skill').map((c) => c.id).sort(), SKILL_ITEMS);
  assert.equal(GUIDE_FILTERS[0].id, 'all');
  assert.deepEqual(guideItems('nonsense'), [], 'an unknown filter shows nothing rather than everything');
});

test('guide: guideCopy exposes the skill flag, the tip and the how-to', () => {
  const c = guideCopy('capacitor');
  assert.equal(c.skill, true); assert.equal(c.name, 'Surge Capacitor');
  assert.ok(c.good.length > 0 && c.how.length > 0);
  assert.equal(guideCopy('cable').skill, false);
});

test('itemCopy: an unknown id returns an empty label instead of throwing', () => {
  assert.deepEqual(itemCopy('nope'), { name: 'nope', blurb: '', category: '', categoryLabel: '' });
  assert.equal(itemCopy('').name, '');
});

// ---- the pop-up caption -------------------------------------------------------------------------------------------------------

const S = (id1 = '', id2 = '', extra = {}) => ({ rolling: false, id1, id2, refused: 0, ...extra });

test('caption: a pickup names the item for a couple of seconds', () => {
  const ev = popupFor(S(), S('ping'));
  assert.equal(ev.kind, 'gain'); assert.deepEqual(ev.ids, ['ping']); assert.deepEqual(ev.slots, [1]);
  assert.ok(ev.seconds >= 1.8 && ev.seconds <= 3.5, `${ev.seconds} s`);
  assert.equal(POP_SECONDS.gain, ev.seconds);
});

test('caption: a second pickup captions the queued item (slot 2); a double box captions both, front first', () => {
  const one = popupFor(S('ping'), S('ping', 'sudo'));
  assert.equal(one.kind, 'gain'); assert.deepEqual(one.ids, ['sudo']); assert.deepEqual(one.slots, [2]);
  const two = popupFor(S(), S('ping', 'sudo'));
  assert.deepEqual(two.ids, ['ping', 'sudo']); assert.deepEqual(two.slots, [1, 2]);
});

test('caption: it reappears when the front item changes (swap, used up, queued one slides forward), for a shorter time', () => {
  const swap = popupFor(S('ping', 'sudo'), S('sudo', 'ping'));
  assert.equal(swap.kind, 'front'); assert.deepEqual(swap.ids, ['sudo']);
  assert.ok(swap.seconds < POP_SECONDS.gain);
  const promoted = popupFor(S('cable', 'sudo'), S('sudo', ''));
  assert.equal(promoted.kind, 'front'); assert.deepEqual(promoted.ids, ['sudo']);
});

test('caption: nothing changes, nothing pops; using the last item clears the caption', () => {
  assert.equal(popupFor(S('ping', 'sudo'), S('ping', 'sudo')), null);
  assert.equal(popupFor(S(), S()), null);
  assert.equal(popupFor(S('ping'), S()).kind, 'clear');
});

test('caption: the roulette shows "???" once, then the landing item is named', () => {
  const start = popupFor(S(), S('', '', { rolling: true }));
  assert.equal(start.kind, 'rolling');
  assert.equal(popupFor(S('', '', { rolling: true }), S('', '', { rolling: true })), null, 'no restart every frame');
  const landed = popupFor(S('', '', { rolling: true }), S('kernel_panic'));
  assert.equal(landed.kind, 'gain'); assert.deepEqual(landed.ids, ['kernel_panic']);
  // slot 2 rolling while slot 1 is held, then landing
  const landed2 = popupFor(S('ping', '', { rolling: true }), S('ping', 'sudo'));
  assert.deepEqual(landed2.slots, [2]);
});

test('caption: a refused box flashes "slots full"', () => {
  const ev = popupFor(S('ping', 'sudo'), S('ping', 'sudo', { refused: 1 }));
  assert.equal(ev.kind, 'full');
  assert.equal(popupFor(S('ping', 'sudo', { refused: 1 }), S('ping', 'sudo', { refused: 1 })), null);
});

// ---- controls ---------------------------------------------------------------------------------------------------------------------

test('controls: the swap control is labelled for every device (Q / Tab, LB, tap the small slot)', () => {
  assert.equal(SLOT_KEYS.keyboard.swap, 'Q'); assert.equal(SLOT_KEYS.keyboard.use, 'E');
  assert.equal(SLOT_KEYS.gamepad.swap, 'LB'); assert.equal(SLOT_KEYS.gamepad.use, 'X');
  assert.equal(SLOT_KEYS.touch.swap, 'TAP'); assert.equal(SLOT_KEYS.touch.use, null, 'touch uses the ITEM button');
  for (const d of ['keyboard', 'gamepad', 'touch']) {
    const text = hintRows(d).map((r) => r.join(' ')).join('|').toLowerCase();
    assert.ok(text.includes('swap'), `${d} hint mentions swap`);
  }
});

// ---- the HUD mock used by the UI demos matches the two-slot snapshot ---------------------------------------------------------------

test('mock HUD snapshot carries the two-slot fields the real snapshot has', () => {
  const m = mockHud({ item: { id: 'ping', count: 1 }, item2: { id: 'sudo', count: 1 } }, 0);
  for (const k of ['item', 'item2', 'roulette', 'swapLocked', 'boxRefused']) assert.ok(k in m, `mockHud.${k}`);
  assert.equal(ITEM_SLOTS, 2);
});
