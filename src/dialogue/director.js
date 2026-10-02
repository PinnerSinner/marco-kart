// DialogueDirector: turns bus events into character barks. Decides WHO speaks (the human's character, or a rival involved in the event),
// WHAT they say (BarkBank shuffle bags), and WHETHER they should (per-category cooldowns, chances, a global rival budget, clip priority).
// Output: bus event `bark { id, charId, name, text, category, key, clip, isPlayer, mood, ms, prio, cut, menu, rude }`, consumed by the world-space
// speech bubbles (src/ui/worldBubbles.js), by the HUD subtitle, and by the audio module (Marco's recorded clip when `clip`, otherwise speech
// synthesis or the blip voice). `rude` marks the edgy lines: with Settings 'Rude banter' off (director.rude = false) they are never picked.
// Nothing here silences anybody: voices overlap freely (see src/audio/voiceRegistry.js). The only gate between two lines of ONE speaker is a gentle
// anti-spam gap (SPEAKER_GAP, 0.4 s) on top of the per-category cooldowns; there is no shared channel, global rival budget or 'a clip holds the floor' rule.
// Throwaway interjections ('Weeeee!', 'Here we go!', 1 to 4 words) are the ambient chatter of the whole field: any racer, not just the player, fires one
// on a jump, a boost, a drift, a near miss, passing or being passed, a trick, an item box, a bump, at the green light, and now and then for no reason
// at all (per-character cooldown 4 to 8 s, a chance per moment, an idle filler so the field is never silent for long).
// Node-importable; time comes from an injected clock.
import { BANKS } from './barks/index.js';
import { BarkBank, fill } from './barkPicker.js';
import { MARCO_VOICE, voiceLine, clipPlaySeconds } from '../core/voicelines.js';
import { bubbleMs } from './bubbleMath.js';
import { estimateSpeechMs, VOICE_PROFILES } from '../audio/speech.js';
import { loopDiff } from '../core/util.js';

export { bubbleMs };

/** Per-category tuning: cd = min seconds between the same category from the same speaker, p = chance (player), r = chance (rival). */
const CAT = {
  ready: { cd: 0, p: 1, r: 0 }, go: { cd: 0, p: 1, r: 0.3 }, start: { cd: 30, p: 0.5, r: 0.4 }, class_select: { cd: 0, p: 0.7, r: 0 },
  boost: { cd: 10, p: 0.8, r: 0.25 }, mini_turbo: { cd: 7, p: 0.55, r: 0.15 }, max_charge: { cd: 12, p: 0.8, r: 0.12 }, perfect_release: { cd: 14, p: 0.8, r: 0.12 },
  drift: { cd: 25, p: 0.4, r: 0.12 }, speed: { cd: 20, p: 1, r: 0.15 },
  rocket_start: { cd: 0, p: 1, r: 0.6 }, bad_start: { cd: 0, p: 1, r: 0.55 },
  overtake: { cd: 8, p: 0.9, r: 0.55 }, overtaken: { cd: 8, p: 0.9, r: 0.6 },
  take_lead: { cd: 12, p: 1, r: 0.45 }, lose_lead: { cd: 15, p: 1, r: 0.4 }, last_place: { cd: 30, p: 1, r: 0.25 }, comeback: { cd: 20, p: 1, r: 0.25 },
  hit: { cd: 6, p: 1, r: 0.6 }, hit_by_item: { cd: 6, p: 1, r: 0.6 }, hit_kernel_panic: { cd: 6, p: 1, r: 0.65 }, hit_bsod: { cd: 6, p: 1, r: 0.65 },
  hit_popups: { cd: 6, p: 1, r: 0.65 }, hit_shrink: { cd: 6, p: 1, r: 0.65 }, hit_spill: { cd: 6, p: 1, r: 0.55 }, hit_zeroday: { cd: 6, p: 1, r: 0.65 }, hit_pigeon: { cd: 6, p: 1, r: 0.65 },
  item_get: { cd: 12, p: 0.85, r: 0.18 }, item_use_attack: { cd: 6, p: 0.85, r: 0.4 }, item_use_defence: { cd: 8, p: 0.85, r: 0.25 },
  item_hit_rival: { cd: 4, p: 1, r: 0.6 }, miss: { cd: 6, p: 0.9, r: 0.35 }, dodged: { cd: 6, p: 1, r: 0.5 }, block: { cd: 5, p: 1, r: 0.6 },
  swap_item: { cd: 6, p: 1, r: 0.35 }, double_item: { cd: 8, p: 1, r: 0.45 },
  wall: { cd: 6, p: 0.9, r: 0.3 }, bump: { cd: 10, p: 0.5, r: 0.3 }, bumped: { cd: 10, p: 0.5, r: 0.4 },
  fall: { cd: 3, p: 1, r: 0.7 }, respawn: { cd: 3, p: 0.9, r: 0.3 }, offroad: { cd: 15, p: 1, r: 0.2 },
  jump: { cd: 8, p: 0.6, r: 0.15 }, perfect_jump: { cd: 8, p: 1, r: 0.4 }, jump_vehicle: { cd: 10, p: 1, r: 0.45 },
  trick: { cd: 8, p: 1, r: 0.4 }, trick_fail: { cd: 10, p: 1, r: 0.4 }, shortcut: { cd: 10, p: 1, r: 0.4 }, near_miss: { cd: 12, p: 1, r: 0.3 },
  wrong_way: { cd: 10, p: 1, r: 0 }, lap2: { cd: 0, p: 1, r: 0 }, final_lap: { cd: 20, p: 1, r: 0 },
  finish_win: { cd: 0, p: 1, r: 0.95 }, finish_podium: { cd: 0, p: 1, r: 0.7 }, finish_lose: { cd: 0, p: 1, r: 0.4 }, photo_finish: { cd: 0, p: 1, r: 0.8 },
  taunt: { cd: 30, p: 0.5, r: 1 }, quip: { cd: 45, p: 0.5, r: 1 }, roast: { cd: 25, p: 0, r: 1 },
  throwaway: { cd: 0, p: 1, r: 1 },        // paced by TWOTA below (per-character cooldown, chance per moment), not by this row
};
const DEF = { cd: 8, p: 1, r: 0.35 };

/** Marco voice key that the game historically used for each category-independent call (game.say('boost') etc.). */
export const KEY_TO_CAT = { ready: 'ready', go: 'go', boost: 'boost', hit: 'hit', item: 'item_get', final_lap: 'final_lap', overtake: 'overtake', win: 'finish_win', lose: 'finish_lose' };

/** Priority of a category (higher wins): while one of Marco's clips plays, a player bark of lower or equal priority is dropped, a higher one cuts it. */
const PRIO = {
  welcome: 5, select_me: 5, gp_win: 5, finish_win: 5, finish_podium: 5, finish_lose: 5, photo_finish: 5,
  go: 4, final_lap: 4, ready: 3, lap2: 3, rocket_start: 3, bad_start: 3,
  fall: 2, hit: 2, take_lead: 2, lose_lead: 2, class_select: 2, perfect_jump: 2, jump_vehicle: 2, double_item: 2,
  throwaway: 0,
};

const MOODS = {
  sad: new Set(['hit', 'hit_by_item', 'hit_kernel_panic', 'hit_bsod', 'hit_popups', 'hit_shrink', 'hit_spill', 'hit_zeroday', 'hit_pigeon', 'fall', 'lose_lead', 'overtaken', 'wall', 'bad_start', 'last_place', 'finish_lose', 'miss', 'trick_fail', 'wrong_way', 'offroad']),
  happy: new Set(['boost', 'mini_turbo', 'max_charge', 'perfect_release', 'rocket_start', 'take_lead', 'overtake', 'item_hit_rival', 'block', 'dodged', 'trick', 'shortcut', 'comeback', 'finish_win', 'finish_podium', 'photo_finish', 'go', 'jump', 'speed', 'gp_win', 'perfect_jump', 'jump_vehicle', 'double_item', 'swap_item', 'welcome', 'select_me']),
};
export const moodFor = (cat) => (MOODS.sad.has(cat) ? 'sad' : MOODS.happy.has(cat) ? 'happy' : 'neutral');

const DEFENCE = new Set(['zoomies', 'firewall', 'pods', 'proxy', 'sudo', 'fibre', 'vpn', 'autoscale', 'overclock', 'cuppa', 'espresso', 'espresso3']);
const HIT_CAT = { kernel_panic: 'hit_kernel_panic', bsod: 'hit_bsod', popups: 'hit_popups', outage: 'hit_shrink', spill: 'hit_spill', zeroday: 'hit_zeroday', pigeon: 'hit_pigeon' };
const ROAD = new Set(['road', 'kerb', 'boost']);

/** World items a kart can dodge (they move) and ones it can scrape past (they sit still). */
const FLYING = new Set(['ping', 'ddos', 'coconut', 'traceroute', 'kernel_panic', 'sniffer', 'pod', 'pigeon', 'bolt']);
const STATIC = new Set(['cable', 'spill', 'zeroday']);

/** Throwaway interjections: the chance that a moment makes a racer blurt one, and the pacing. */
export const TWOTA = Object.freeze({
  chance: { jump: 0.5, go: 0.5, boost: 0.3, drift: 0.2, near: 0.5, pass: 0.45, passed: 0.4, trick: 0.75, item: 0.3, bump: 0.4, idle: 1 },
  cooldown: [4, 8],        // s a character stays quiet after a throwaway (random in the range, drawn after each one)
  globalGap: 1.1,          // s between two throwaways anywhere (the green-light chorus excepted)
  idle: [3.2, 5.2],        // s without any throwaway before the idle filler makes somebody blurt one (counted from the last one)
  playerFactor: 0.8,       // the human's own character blurts a little less than the others
});

/** With Rude banter on, how often a category that has edgy lines draws from them (the rest of the time a mild line, so the edgy ones stay a treat). */
const RUDE_BIAS = 0.62;
/** How strongly Marco's recorded line is preferred over his spoken ones: nearly always for the big moments, often for the rest. */
const BIG_MOMENTS = new Set(['ready', 'go', 'final_lap', 'lap2', 'rocket_start', 'bad_start', 'finish_win', 'finish_podium', 'finish_lose', 'photo_finish', 'welcome', 'select_me', 'gp_win', 'take_lead', 'lose_lead', 'comeback', 'wrong_way', 'fall', 'respawn']);
const recordedBias = (cat) => (BIG_MOMENTS.has(cat) ? 0.9 : 0.6);

const SPEAKER_GAP = 0.4;      // s before the same speaker may start another line (gentle anti-spam; nobody else is ever held back)
const NEAR_GAP = 1.5;         // m: an item or kart that passes this close (beyond touching) without a hit counts as a near miss

export class DialogueDirector {
  /**
   * @param {object} o
   * @param {{on:Function, emit:Function}} o.bus
   * @param {() => number} [o.rng]
   * @param {() => number} [o.now] seconds
   * @param {(id:string) => ({id:string,charId:string,isPlayer?:boolean,place?:number,name?:string}|null|undefined)} [o.lookup] racer by id
   * @param {(key:string) => boolean} [o.hasClip] whether Marco has a recording for voice key
   * @param {(charId:string) => string} [o.nameOf] display name
   * @param {Record<string, object>} [o.banks]
   * @param {(charId:string) => boolean} [o.isCustom] the character is a real person the player has put into the custom slot: no edgy line names them
   */
  constructor({ bus, rng = Math.random, now = () => Date.now() / 1000, lookup = () => null, hasClip = () => false, nameOf = (c) => c, banks = BANKS, isCustom = () => false } = {}) {
    this.bus = bus; this.rng = rng; this.now = now; this.lookup = lookup; this.hasClip = hasClip; this.nameOf = nameOf; this.banks = banks; this.isCustom = isCustom;
    this.enabled = true;
    this.rude = true;                // false filters out every line tagged `rude` (Settings: Rude banter)
    this._bank = new Map();
    this._cd = new Map();            // `${speaker}|${category}` -> time last said
    this._keyCd = new Map();         // Marco voice key -> time last said
    this._lastAny = new Map();       // speaker -> time of their last bark
    this._offs = [];
    this._pending = new Map();       // victim id -> { at, item, by, cause }
    this._off = new Map();           // id -> time they left the road
    this._lastHit = new Map();       // racer id -> time they were last hit / spun
    this._rel = new Map();           // `${racer}|${thing}` -> previous relative position (near-miss tracking)
    this._lastS = new Map();         // racer id -> centre-line distance at the last poll (shortcut detection)
    this._placeSince = 0; this._stablePlace = 0; this._hist = [];
    this.playerId = 'player'; this.playerChar = 'marco'; this.total = 0; this.laps = 3; this.speedClass = 100;
    this._menuAt = -1e9; this._quipAt = 0; this._taunt = 0; this._roastAt = -1e9;
    this._busyUntil = new Map();     // speaker -> time their last line (and its floating text) is over: a throwaway never replaces it
    this._twNext = new Map();        // speaker -> earliest time of their next throwaway
    this._twAt = -1e9; this._twIdleAt = 0; this._pl = new Map(); this._plAt = 0;   // last throwaway anywhere, idle filler due time, previous places (rival passes)
    this._speedT = 0; this._raceT = 0; this._startBoost = false; this._finishTimes = []; this._nearAt = 0; this._welcomed = false; this._lateQuip = null;
    this.log = [];                   // last barks (tests / debugging)
  }

  // ---- lifecycle -------------------------------------------------------------------------------------------------------------

  /** Begin listening (idempotent). */
  start() {
    if (this._offs.length) return this;
    const on = (n, f) => this._offs.push(this.bus.on(n, (d) => { if (this.enabled) { try { f(d ?? {}); } catch (e) { console.warn('[dialogue]', n, e); } } }));
    on('kart:boost', (d) => this._boost(d));
    on('kart:drift-start', (d) => { this.say(d.id, 'drift'); this._tw(d.id, 'drift'); });
    on('kart:drift-level', (d) => { if (d.level >= 3) this.say(d.id, 'max_charge'); });
    on('kart:perfect-release', (d) => this.say(d.id, 'perfect_release'));
    on('kart:spin', (d) => this._queueHit(d.id, { cause: d.cause }));
    on('kart:shrink', (d) => this._queueHit(d.id, { item: 'outage', force: true }));
    on('item:splat', (d) => this._queueHit(d.id, { item: 'pigeon', force: true }));
    on('item:hit', (d) => this._itemHit(d));
    on('item:get', (d) => { this.say(d.id, d.slot === 2 ? 'double_item' : 'item_get'); this._tw(d.id, 'item'); });
    on('item:swap', (d) => this.say(d.id, 'swap_item'));
    on('item:use', (d) => this._itemUse(d));
    on('item:block', (d) => { this.say(d.id, 'block', { otherId: d.byId }); if (d.byId && d.byId !== d.id) this.say(d.byId, 'miss', { chance: 0.6 }); });
    on('item:deflect', (d) => d.byId && this.say(d.byId, 'block'));
    on('item:pop', (d) => { if (d.item === 'expire' && d.ownerId && !d.byId) this.say(d.ownerId, 'miss', { chance: 0.5 }); });
    on('item:stomp', (d) => { this.say(d.id, 'item_hit_rival', { otherId: d.victimId }); this._queueHit(d.victimId, { item: 'stomp' }); });
    on('kart:wall-hit', (d) => { if ((d.impact ?? 1) >= 0.25) { this.say(d.id, 'wall'); if (d.id === this.playerId) this._roast('wall'); } else this._tw(d.id, 'bump'); });
    on('kart:bump', (d) => this._bump(d));
    on('kart:land', (d) => { if ((d.impact ?? 0) >= 0.4) this.say(d.id, 'jump'); });
    on('kart:takeoff', (d) => { if (d.perfect) this.say(d.id, 'perfect_jump'); else if (d.source === 'vehicle') this.say(d.id, 'jump_vehicle'); this._tw(d.id, 'jump'); });
    on('kart:perfect-jump', (d) => this.say(d.id, 'perfect_jump'));
    on('kart:trick-land', (d) => { this.say(d.id, d.ok ? 'trick' : 'trick_fail'); if (d.ok) this._tw(d.id, 'trick'); });
    on('kart:fall', (d) => { this.say(d.id, 'fall'); if (d.id === this.playerId) this._roast('fall'); });
    on('kart:respawn', (d) => this.say(d.id, 'respawn'));
    on('kart:surface', (d) => { if (ROAD.has(d.surface) || d.surface === 'oil') this._off.delete(d.id); else if (!this._off.has(d.id)) this._off.set(d.id, this.now()); });
    on('race:wrong-way', (d) => { if (d.on) { this.say(this.playerId, 'wrong_way'); this._roast('wrong_way'); } });
    on('race:shortcut', (d) => this.say(d.id ?? this.playerId, 'shortcut'));
    on('race:overtake', (d) => this._overtake(d));
    on('race:lap', (d) => { if (d.isPlayer && d.lap === 1 && d.laps > 2) this.say(d.id, 'lap2'); });
    on('race:final-lap', (d) => this.say(d.id ?? this.playerId, 'final_lap'));
    on('race:countdown', (d) => {
      if (d.n === 3) this._rivalSay('start');
      else if (d.n === 2) this.say(this.playerId, 'class_select', { item: `c${this.speedClass}` });
      else if (d.n === 0) { this._rivalSay('go'); this._goChorus(); }
    });
    on('race:start', () => { this._raceT = 0; this._startBoost = false; this._finishTimes = []; this._badStartChecked = false; });
    on('race:finish', (d) => this._finish(d));
    // menus: Marco greets you on the first key press at the title screen, and the racer you pick answers
    on('ui:title-key', () => this._welcome());
    on('ui:pick', (d) => { if (d.field === 'charId' && d.value) this._selectMe(d.value); });
    on('gp:done', (d) => this._gpDone(d));
    return this;
  }

  stop() { for (const off of this._offs) off(); this._offs.length = 0; }

  /** Call when a race is built. @param {{playerId?:string, playerChar:string, total:number, laps:number, ids?:string[], speedClass?:number}} o */
  beginRace({ playerId = 'player', playerChar = 'marco', total = 8, laps = 3, ids = [], speedClass = 100 } = {}) {
    this.playerId = playerId; this.playerChar = playerChar; this.total = total; this.laps = laps; this.speedClass = speedClass;
    this._cd.clear(); this._keyCd.clear(); this._lastAny.clear(); this._pending.clear(); this._off.clear(); this._lastHit.clear(); this._rel.clear(); this._lastS.clear();
    this._stablePlace = 0; this._hist.length = 0; this._speedT = 0; this._raceT = 0; this._lateQuip = null;
    this._busyUntil.clear(); this._twNext.clear(); this._pl.clear(); this._plAt = 0;
    this._ids = ids.slice();
    const t = this.now(); this._quipAt = t + 25 + this.rng() * 30; this._taunt = t + 8 + this.rng() * 8; this._roastAt = t; this._nearAt = t;
    this._twAt = -1e9; this._twIdleAt = t + 9 + this.rng() * 4;
  }

  // ---- speaking --------------------------------------------------------------------------------------------------------------

  bankFor(charId) {
    let b = this._bank.get(charId);
    if (!b) { const src = this.banks[charId]; if (!src) return null; b = new BarkBank(src, this.rng); this._bank.set(charId, b); }
    return b;
  }

  /**
   * Try to make a racer say something. Applies every gate; returns the bark that was emitted, or null.
   * @param {string} id racer id (or a character id when no racer has that id)
   * @param {string} cat category
   * @param {{ item?: string, otherId?: string, chance?: number, force?: boolean, otherChar?: string, key?: string, on?: string }} [o] key: only this Marco voice key; on: the moment (throwaway lines)
   */
  say(id, cat, o = {}) {
    if (!id) return null;
    const r = this.lookup(id);
    const isPlayer = id === this.playerId || !!r?.isPlayer;
    const charId = r?.charId ?? (isPlayer ? this.playerChar : id);
    const bank = this.bankFor(charId);
    if (!bank?.has(cat)) return null;
    const t = this.now();
    const cfg = CAT[cat] ?? DEF;
    const speaker = isPlayer ? 'player' : id;
    const ck = `${speaker}|${cat}`;
    const prio = PRIO[cat] ?? 1;
    // The only gates between two lines: the category cooldown, the line's chance, and a gentle anti-spam gap for ONE speaker (SPEAKER_GAP). Nobody is held
    // back by somebody else talking, and nothing is cut: voices overlap (src/audio/voiceRegistry.js caps and trims them).
    if (!o.force) {
      if (t - (this._cd.get(ck) ?? -1e9) < cfg.cd) return null;
      const p = o.chance !== undefined ? o.chance : (isPlayer ? cfg.p : cfg.r);
      if (this.rng() >= p) return null;
      if (t - (this._lastAny.get(speaker) ?? -1e9) < SPEAKER_GAP) return null;
    }
    if (cat === 'throwaway' && t < (this._busyUntil.get(speaker) ?? 0)) return null;      // their floating text is still up: no interjection on top of it
    // who is the other party
    const other = o.otherId ? this.lookup(o.otherId) : null;
    const otherChar = o.otherChar ?? other?.charId;
    // choose the line (Marco: favour recorded canonical lines, skip keys that are cooling down)
    const isMarco = charId === 'marco';
    const line = bank.pick(cat, {
      item: o.item, on: o.on, other: otherChar, hasOther: !!otherChar, rude: this.rude, rudeBias: RUDE_BIAS, key: o.key, noRudeOther: !!otherChar && this.isCustom(otherChar),
      avoid: isMarco && !o.key ? (l) => !!l.key && t - (this._keyCd.get(l.key) ?? -1e9) < (voiceLine(l.key)?.cooldown ?? 0) : null,
      prefer: isMarco ? (l) => !!l.key && this.hasClip(l.key) : null, preferChance: isMarco ? recordedBias(cat) : 0,
    });
    if (!line) return null;
    if (isMarco && line.key && !o.key) {
      const vl = voiceLine(line.key);
      if (vl?.chance !== undefined && this.rng() >= vl.chance && !o.force) return null;
    }
    const clip = isMarco && !!line.key && this.hasClip(line.key);
    const text = fill(line.t, otherChar ? this.nameOf(otherChar) : '', { class: this.speedClass, you: charId === 'carlos' ? 'você' : 'you' });
    this._cd.set(ck, t); this._lastAny.set(speaker, t);
    if (line.key) this._keyCd.set(line.key, t);
    const clipSec = clip ? clipPlaySeconds(line.key) : 0;
    const speechMs = clip ? 0 : estimateSpeechMs(text, VOICE_PROFILES[charId]?.rate ?? 1);
    const ms = bubbleMs(text, clipSec, speechMs);
    this._busyUntil.set(speaker, t + ms / 1000);
    const bark = { id, charId, name: this.nameOf(charId), text, category: cat, key: line.key ?? null, clip, isPlayer, mood: moodFor(cat), ms, prio, cut: false, menu: false, rude: !!line.rude };
    this.log.push(bark); if (this.log.length > 60) this.log.shift();
    this.bus.emit('bark', bark);
    return bark;
  }

  /**
   * A menu line (title greeting, character pick): not tied to a racer and never gated by a race, so it works before any race exists.
   * @param {string} charId @param {string} cat @param {{key?: string, force?: boolean}} [o]
   */
  sayMenu(charId, cat, o = {}) {
    const bank = this.bankFor(charId);
    if (!bank?.has(cat)) return null;
    const t = this.now();
    if (!o.force && t - this._menuAt < 0.5) return null;
    const line = bank.pick(cat, { key: o.key, rude: this.rude, rudeBias: RUDE_BIAS, hasOther: false });
    if (!line) return null;
    const clip = charId === 'marco' && !!line.key && this.hasClip(line.key);
    const text = fill(line.t, '');
    const clipSec = clip ? clipPlaySeconds(line.key) : 0;
    this._menuAt = t;
    const bark = { id: 'menu', charId, name: this.nameOf(charId), text, category: cat, key: line.key ?? null, clip, isPlayer: true, mood: moodFor(cat), ms: bubbleMs(text, clipSec, clip ? 0 : estimateSpeechMs(text, VOICE_PROFILES[charId]?.rate ?? 1)), prio: 5, cut: false, menu: true, rude: !!line.rude };
    this.log.push(bark); if (this.log.length > 60) this.log.shift();
    this.bus.emit('bark', bark);
    return bark;
  }

  /** Legacy Game.say(key): a voice key (or category) said by the human's character. */
  sayPlayer(keyOrCat) { return this.say(this.playerId, KEY_TO_CAT[keyOrCat] ?? keyOrCat); }

  /** A random rival (not the player) says something; used for group moments like the countdown. */
  _rivalSay(cat) {
    const ids = this._rivals();
    if (!ids.length) return null;
    return this.say(ids[Math.floor(this.rng() * ids.length)], cat);
  }

  _rivals() { const out = []; for (const id of this._ids ?? []) { const r = this.lookup(id); if (r && !r.isPlayer && id !== this.playerId && !r.finished) out.push(id); } return out; }

  // ---- throwaway interjections -----------------------------------------------------------------------------------------------

  /**
   * One racer blurts a throwaway ('Weeeee!', 'Here we go!', ...) for a moment. Paced so the chatter is lively but not constant: the character's own
   * cooldown (4 to 8 s, random), a chance per moment (TWOTA.chance, scaled by `scale`), a short gap between any two, never while the speaker's own
   * floating text is still up. Floating text and blips only; no recording exists for these.
   * @param {string} id racer id @param {string|null} moment jump|go|boost|drift|near|pass|passed|trick|item|bump|null (idle: any line) @param {number} [scale] extra chance factor
   * @param {{force?: boolean}} [o] force: skip the chance and the cooldowns (tests, idle filler)
   * @returns {object|null} the bark
   */
  _tw(id, moment, scale = 1, o = {}) {
    if (!id || id === 'menu') return null;
    const t = this.now();
    const r = this.lookup(id);
    const isPlayer = id === this.playerId || !!r?.isPlayer;
    const speaker = isPlayer ? 'player' : id;
    if (r?.finished) return null;
    if (!o.force) {
      if (t < (this._twNext.get(speaker) ?? 0)) return null;
      if (moment !== 'go' && t - this._twAt < TWOTA.globalGap) return null;
      const p = (TWOTA.chance[moment ?? 'idle'] ?? 0.3) * scale * (isPlayer ? TWOTA.playerFactor : 1);
      if (this.rng() >= p) return null;
    }
    const b = this.say(id, 'throwaway', { chance: 1, on: moment ?? undefined });
    if (!b) return null;
    this._twNext.set(speaker, t + TWOTA.cooldown[0] + this.rng() * (TWOTA.cooldown[1] - TWOTA.cooldown[0]));
    this._twAt = t;
    this._twIdleAt = t + TWOTA.idle[0] + this.rng() * (TWOTA.idle[1] - TWOTA.idle[0]);
    return b;
  }

  /** The lights go green: every rival may shout "Here we go!" at once (a chorus; the player's own start line is Marco's recorded one). */
  _goChorus() {
    for (const id of this._rivals()) this._tw(id, 'go');
  }

  /** Nobody has blurted anything for a while: somebody near the player (else anybody) does, for no reason at all. */
  _twIdle(race, t) {
    this._twIdleAt = t + 1;                                   // try again soon if nobody was free
    const pk = race.player?.kart?.pos;
    const cands = race.racers.filter((r) => !r.finished && r.kart?.pos);
    const near = pk ? cands.filter((r) => (r.kart.pos.x - pk.x) ** 2 + (r.kart.pos.z - pk.z) ** 2 < 70 * 70) : [];
    const pool = near.length ? near : cands;
    for (let n = 0; n < 5 && pool.length; n++) {
      const r = pool[Math.floor(this.rng() * pool.length)];
      if (this._tw(r.id, null, 1, { force: false })) return true;
    }
    return false;
  }

  /** Rival-against-rival passes (the race only emits `race:overtake` when the human is one of the two): a racer who has gone up one place while the one now behind them has gone down one. */
  _pollPasses(race, t) {
    if (t - this._plAt < 0.15) return;
    this._plAt = t;
    const rs = race.racers ?? [];
    const gained = [], lost = [];
    for (const r of rs) {
      if (r.finished || r.place === undefined) { this._pl.delete(r.id); continue; }
      const prev = this._pl.get(r.id);
      this._pl.set(r.id, r.place);
      if (prev === undefined || prev === r.place) continue;
      (r.place < prev ? gained : lost).push({ r, from: prev, to: r.place });
    }
    if (this._raceT < 4) return;                                // the start line shuffle is not an overtake
    for (const g of gained) {
      const o = lost.find((x) => x.from === g.to && x.to === g.from);
      if (!o || g.r.isPlayer || o.r.isPlayer) continue;          // passes involving the human come from `race:overtake`
      this._tw(g.r.id, 'pass'); this._tw(o.r.id, 'passed');
    }
  }

  // ---- menus -----------------------------------------------------------------------------------------------------------------

  _welcome() {
    if (this._welcomed) return;
    this._welcomed = true;
    this.sayMenu('marco', 'welcome', { key: this.hasClip('menu_welcome') ? 'menu_welcome' : undefined, force: true });
  }

  _selectMe(charId) {
    // picking Marco: his recording most of the time, one of his spoken lines now and then; anybody else answers in their own voice
    const key = charId === 'marco' && this.hasClip('select_me') && this.rng() < 0.7 ? 'select_me' : undefined;
    this.sayMenu(charId, 'select_me', { key, force: true });
  }

  _gpDone(d) {
    const charId = d?.charId ?? this.playerChar;
    if (d?.trophy === 'gold') this.sayMenu(charId, 'gp_win', { key: charId === 'marco' && this.hasClip('gp_win') ? 'gp_win' : undefined, force: true });
  }

  // ---- event handlers --------------------------------------------------------------------------------------------------------

  _boost(d) {
    this._boostBark(d);
    if (d.kind !== 'jump' && d.kind !== 'trick') this._tw(d.id, 'boost', d.kind === 'pad' ? 0.5 : 1);   // after the real line: the anti-spam gap lets that one win
  }

  _boostBark(d) {
    switch (d.kind) {
      case 'drift': this.say(d.id, 'mini_turbo'); break;
      case 'start': this._startBoost = true; this.say(d.id, 'rocket_start'); break;
      case 'trick': break;
      case 'jump': break;                                          // perfect take-off boost: kart:perfect-jump speaks for it
      case 'pad': this.say(d.id, 'boost', { chance: 0.3 }); break;
      default: this.say(d.id, 'boost');
    }
  }

  _itemUse(d) {
    if (d.fire || d.shake || !d.item) return;
    const cat = DEFENCE.has(d.item) ? 'item_use_defence' : 'item_use_attack';
    // aim the taunt at the racer directly ahead of an attacker (or behind for a trap)
    const r = this.lookup(d.id);
    let otherId = null;
    if (cat === 'item_use_attack' && r) otherId = this._neighbour(r, d.aimBack ? 1 : -1);
    this.say(d.id, cat, { item: d.item, otherId });
  }

  _itemHit(d) {
    if (!d.victimId || d.victimId === d.byId) return;
    this._queueHit(d.victimId, { item: d.item, by: d.byId });
    if (d.byId) this.say(d.byId, 'item_hit_rival', { otherId: d.victimId, item: d.item });
  }

  _queueHit(id, info) {
    if (!id) return;
    this._lastHit.set(id, this.now());
    const prev = this._pending.get(id);
    if (prev && !info.item && !info.force) return;
    this._pending.set(id, { at: this.now() + 0.06, ...(prev ?? {}), ...info });
  }

  _flushHits(t) {
    for (const [id, h] of this._pending) {
      if (t < h.at) continue;
      this._pending.delete(id);
      const cat = h.item && HIT_CAT[h.item] ? HIT_CAT[h.item] : h.item && h.item !== 'stomp' ? 'hit_by_item' : 'hit';
      // Marco's recorded "Not again!" is the canonical hit reaction: use the plain category often when that clip exists
      const r = this.lookup(id);
      const isP = !!r?.isPlayer || id === this.playerId;
      const plain = isP && this.playerChar === 'marco' && this.hasClip('hit') && this.rng() < 0.35;
      this.say(id, plain ? 'hit' : cat, { otherId: h.by, item: plain ? undefined : h.item });
      if (isP) this._roast('hit');
    }
  }

  _bump(d) {
    const cat = this.rng() < 0.5 ? 'bump' : 'bumped';
    this.say(d.id, cat, { otherId: d.otherId });
    this._tw(d.id, 'bump');
    if (d.otherId) this._tw(d.otherId, 'bump');
  }

  _overtake(d) {
    const a = this.say(d.id, 'overtake', { otherId: d.passedId });
    this.say(d.passedId, 'overtaken', { otherId: d.id });
    this._tw(d.id, 'pass'); this._tw(d.passedId, 'passed');
    // Marco's "that's a slash twenty-four for you" quip, a couple of seconds after he has passed someone
    if (a && d.id === this.playerId && this.playerChar === 'marco' && this.hasClip('quip_subnet') && this.rng() < 0.3) this._lateQuip = { at: this.now() + 2.6, key: 'quip_subnet' };
  }

  /** One of the rivals (the nearest, else a random one) roasts the human's driving after a mishap. */
  _roast(reason) {
    const t = this.now();
    if (t - this._roastAt < 9) return null;
    const ids = this._rivals();
    if (!ids.length) return null;
    const me = this.lookup(this.playerId)?.kart?.pos;
    let pick = ids[Math.floor(this.rng() * ids.length)], best = 1e9;
    if (me) for (const id of ids) { const p = this.lookup(id)?.kart?.pos; if (!p) continue; const d = (p.x - me.x) ** 2 + (p.z - me.z) ** 2; if (d < best) { best = d; pick = id; } }
    const b = this.say(pick, 'roast', { otherId: this.playerId, chance: 0.5 });
    if (b) this._roastAt = t;
    void reason;
    return b;
  }

  _finish(d) {
    const r = this.lookup(d.id);
    const isPlayer = d.isPlayer || d.id === this.playerId;
    this._finishTimes[d.place] = d.time;
    let cat = d.place === 1 ? 'finish_win' : d.place <= 3 ? 'finish_podium' : 'finish_lose';
    if (isPlayer && this.playerChar === 'marco' && cat === 'finish_podium' && !this.hasClip('podium') && this.hasClip('win')) cat = 'finish_win';   // his "win" clip covers 1st to 3rd
    const gap = d.place > 1 ? Math.abs(d.time - (this._finishTimes[d.place - 1] ?? -99)) : 99;
    if (isPlayer) {
      if (gap < 0.3 && d.place <= 3 && this.rng() < (this.playerChar === 'marco' && this.hasClip('photo_finish') ? 0.9 : 0.5)) this.say(d.id, 'photo_finish', { force: true });
      else this.say(d.id, cat, { force: true });
    } else if (r) this.say(d.id, cat);
  }

  /** Id of the racer directly ahead (dir -1) or behind (+1) of `r` by place. */
  _neighbour(r, dir) {
    const want = (r.place ?? 0) + dir;
    for (const id of this._ids ?? []) { const o = this.lookup(id); if (o && o.place === want) return o.id; }
    return null;
  }

  // ---- polling ---------------------------------------------------------------------------------------------------------------

  /**
   * Per-frame update while racing.
   * @param {number} dt seconds
   * @param {{racers:object[], player:{kart:object,place:number,id:string}, state?:string, items?:{entities:object[]}, obstacles?:object[], track?:{length:number, shortcuts?:object[]}}} race
   */
  update(dt, race) {
    if (!this.enabled || !race?.player) return;
    const t = this.now();
    if (!this._ids?.length) this._ids = race.racers.map((r) => r.id);
    this._raceT += dt;
    if (this._pending.size) this._flushHits(t);
    const p = race.player, k = p.kart;
    if (this._lateQuip && t >= this._lateQuip.at) { const q = this._lateQuip; this._lateQuip = null; this.say(p.id, 'quip', { key: q.key, chance: 1 }); }
    // start: stalled?
    if (!this._badStartChecked && this._raceT > 1.6 && race.state === 'racing') {
      this._badStartChecked = true;
      if (!this._startBoost && k.speed < 0.25 * Math.max(1, k.maxSpeed)) { this.say(p.id, 'bad_start'); this._roast('bad_start'); }
    }
    // full speed for a few seconds
    if (k.speed > 0.93 * Math.max(1, k.maxSpeed) && k.ground?.onRoad !== false && k.grounded !== false) { this._speedT += dt; if (this._speedT > 4) { this._speedT = 0; this.say(p.id, 'speed'); } } else this._speedT = 0;
    // off-road for a while
    const off = this._off.get(p.id);
    if (off !== undefined && t - off > 1.4) { this._off.set(p.id, t + 5); this.say(p.id, 'offroad'); }
    // place changes (only once they have held for a second)
    const place = p.place ?? 1;
    if (place !== this._stablePlace) {
      if (this._placeSince === 0 || this._placePending !== place) { this._placePending = place; this._placeSince = t; }
      if (t - this._placeSince > 1.0) {
        const prev = this._stablePlace; this._stablePlace = place; this._placeSince = 0;
        if (prev) this._placeChange(p, prev, place, t);
      }
    } else this._placeSince = 0;
    // near misses, dodged items and shortcuts (only while racing)
    if (race.state === 'racing' || race.state === undefined) {
      this._pollNear(race, t); this._pollShortcuts(race); this._pollPasses(race, t);
      if (t >= this._twIdleAt && this._raceT > 5) this._twIdle(race, t);
    }
    // idle chatter: quips for the player, and a rival (the leader most often) now and then
    if (t > this._quipAt) {
      this._quipAt = t + 24 + this.rng() * 32;
      if (place <= 3 && this.rng() < 0.6) this.say(p.id, 'taunt', { otherId: this._neighbour(p, 1) });
      else this.say(p.id, 'quip');
    }
    if (t > this._taunt) {
      this._taunt = t + 8 + this.rng() * 11;
      this._rivalChatter(race);
    }
  }

  /** Idle talk between rivals: a random (leader-weighted) rival taunts, quips or roasts somebody. */
  _rivalChatter(race) {
    const rivals = race.racers.filter((r) => !r.isPlayer && !r.finished);
    if (!rivals.length) return;
    const lead = rivals.find((r) => r.place === Math.min(...rivals.map((x) => x.place ?? 99)));
    const who = lead && this.rng() < 0.3 ? lead : rivals[Math.floor(this.rng() * rivals.length)];
    const roll = this.rng();
    const target = this.rng() < 0.5 ? this.playerId : rivals[Math.floor(this.rng() * rivals.length)]?.id;
    const otherId = target && target !== who.id ? target : this.playerId;
    if (roll < 0.4) this.say(who.id, 'taunt', { otherId });
    else if (roll < 0.65) this.say(who.id, 'roast', { otherId });
    else this.say(who.id, 'quip', { otherId });
  }

  /**
   * Near misses and dodged items: a hostile item (or a kart, or a track hazard) that passes within NEAR_GAP metres of a kart without touching
   * it. Uses the closest approach between two consecutive frames, so fast missiles are not missed between frames.
   */
  _pollNear(race, t) {
    if (t - this._nearAt < 0.03) return;
    this._nearAt = t;
    const ents = race.items?.entities ?? [];
    const racers = race.racers ?? [];
    for (const r of racers) {
      const k = r.kart;
      if (!k?.pos || r.finished) continue;
      const kx = k.pos.x, kz = k.pos.z;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (!e.alive || e.ownerId === r.id || e.state === 'blast' || e.state === 'trail') continue;
        const flying = FLYING.has(e.type);
        if (!flying && !STATIC.has(e.type)) continue;
        this._near(`${r.id}|e${e.id}`, e.pos.x - kx, e.pos.z - kz, (e.radius ?? 1) + (k.radius ?? 1), r, t, flying ? 'dodged' : 'near_miss', Math.abs(e.pos.y - k.pos.y) < 3);
      }
    }
    // the human only: hazards on the track and the karts around
    const p = race.player;
    if (!p?.kart?.pos) return;
    const pk = p.kart;
    const obs = race.obstacles ?? [];
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (o.active === false || !o.pos) continue;
      this._near(`${p.id}|o${i}`, o.pos.x - pk.pos.x, o.pos.z - pk.pos.z, (o.radius ?? 1) + (pk.radius ?? 1) * 0.8, p, t, 'near_miss', Math.abs(o.pos.y - pk.pos.y) < 3.5);
    }
    for (const r of racers) {
      if (r === p || r.isPlayer || !r.kart?.pos) continue;
      const rk = r.kart;
      const rs = Math.hypot((rk.vel?.x ?? 0) - (pk.vel?.x ?? 0), (rk.vel?.z ?? 0) - (pk.vel?.z ?? 0));
      if (rs < 6) { this._rel.delete(`${p.id}|k${r.id}`); continue; }          // side by side at the same speed is not a scrape
      this._near(`${p.id}|k${r.id}`, rk.pos.x - pk.pos.x, rk.pos.z - pk.pos.z, (rk.radius ?? 1) + (pk.radius ?? 1), p, t, 'near_miss', Math.abs(rk.pos.y - pk.pos.y) < 2.5, NEAR_GAP * 0.7);
    }
  }

  /** One pair (thing relative to racer). Fires when the two have just passed their closest approach within (hitR, hitR + gap). */
  _near(key, rx, rz, hitR, racer, t, cat, sameLevel, gap = NEAR_GAP) {
    const prev = this._rel.get(key);
    const d2 = rx * rx + rz * rz;
    if (d2 > 26 * 26 || !sameLevel) { if (prev) this._rel.delete(key); return; }
    if (!prev) { this._rel.set(key, { x: rx, z: rz, t }); return; }
    const wx = rx - prev.x, wz = rz - prev.z;
    const w2 = wx * wx + wz * wz;
    const dotPrev = prev.x * wx + prev.z * wz, dotNow = rx * wx + rz * wz;
    prev.x = rx; prev.z = rz; prev.t = t;
    if (w2 < 1e-6 || !(dotPrev < 0 && dotNow >= 0)) return;                        // not past the closest point (yet)
    const dmin = Math.sqrt(Math.max(0, d2 - (dotNow * dotNow) / w2));
    this._rel.delete(key);
    if (dmin <= hitR * 0.98 || dmin > hitR + gap) return;                           // touched it (a hit), or passed too wide to count
    if (t - (this._lastHit.get(racer.id) ?? -1e9) < 0.6) return;
    this.say(racer.id, cat);
    this._tw(racer.id, 'near');
  }

  /** Did a racer just jump across one of the track's declared shortcuts? (`s` jumps by far more than a kart can drive in a frame.) */
  _pollShortcuts(race) {
    const tr = race.track, sc = tr?.shortcuts;
    if (!sc?.length || !tr.length) return;
    const L = tr.length;
    for (const r of race.racers ?? []) {
      const s = r.lastS;
      if (s === undefined) continue;
      const prev = this._lastS.get(r.id);
      this._lastS.set(r.id, s);
      if (prev === undefined) continue;
      const ds = loopDiff(prev, s, L);
      if (ds < 25 || ds > L * 0.5) continue;
      for (const c of sc) {
        const span = loopDiff(c.from, c.to, L);
        if (loopDiff(c.from - 40, prev, L) >= 0 && loopDiff(c.from - 40, prev, L) <= 80 && ds >= span * 0.5) { this.say(r.id, 'shortcut'); break; }
      }
    }
  }

  _placeChange(p, prev, now, t) {
    this._hist.push({ t, p: now }); while (this._hist.length && t - this._hist[0].t > 12) this._hist.shift();
    if (now === 1 && prev > 1) this.say(p.id, 'take_lead');
    else if (prev === 1 && now > 1) this.say(p.id, 'lose_lead');
    else if (this.total > 2 && now === this.total && prev < now) this.say(p.id, 'last_place');
    else if (now < prev) {
      const worst = Math.max(prev, ...this._hist.map((h) => h.p));
      if (worst - now >= 2) this.say(p.id, 'comeback');
    }
  }
}

export { MARCO_VOICE };
