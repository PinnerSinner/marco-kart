// Item definitions: numbers for every item plus the place-weighted item table (24 live items: 17 general, 3 skill items, 4 Biscuit-only; 20 of them rollable by everyone).
// Behaviour lives in ItemManager.js / itemEntities.js; icons in src/ui; meshes in src/visuals.
import { ITEM_IDS, ITEMS, EXCLUSIVE_ITEMS } from '../core/config.js';

/** Result codes of `ItemManager.strike()`. */
export const STRIKE = Object.freeze({ HIT: 'hit', BLOCKED: 'blocked', IGNORED: 'ignored' });

const F = (o) => Object.freeze(o);

/**
 * Static item data. Times in seconds, speeds in m/s, radii in metres.
 * `uses` is how many times the item can be used before the slot empties.
 */
export const ITEM_DEFS = Object.freeze({
  // ---- general
  cable:        F({ id: 'cable', uses: 1, radius: 1.25, spin: 1.4, lifetime: 60, ownerGrace: 1.0, dropBehind: 1.9, throwSpeed: 16, throwLift: 10 }),
  ping:         F({ id: 'ping', uses: 1, radius: 0.9, spin: 1.4, speed: 66, bounces: 3, lifetime: 5, ownerGrace: 0.3, hover: 0.9 }),
  traceroute:   F({ id: 'traceroute', uses: 1, radius: 1.1, spin: 1.6, speed: 60, lockRange: 34, lifetime: 9, ownerGrace: 0.3, hover: 0.9, latRate: 3.5, overshoot: 22 }),
  espresso:     F({ id: 'espresso', uses: 1, boostSeconds: 1.2, boostPower: 1 }),
  sudo:         F({ id: 'sudo', uses: 1, seconds: 8, boostPower: 0.5, spin: 1.0, hitRadius: 0.5, hitCooldown: 1.5, shove: 0.9 }),
  firewall:     F({ id: 'firewall', uses: 1, seconds: 10 }),
  fibre:        F({ id: 'fibre', uses: 1, seconds: 4.5, boostPower: 1.6, grace: 0.5 }),
  outage:       F({ id: 'outage', uses: 1, shrinkSeconds: 7 }),
  kernel_panic: F({ id: 'kernel_panic', uses: 1, radius: 1.6, spin: 2.0, speed: 82, lockRange: 46, lifetime: 12, ownerGrace: 0.3, ringRadius: 9, blastSeconds: 0.7, altitude: 8, latRate: 4 }),
  sniffer:      F({ id: 'sniffer', uses: 1, radius: 1.0, spin: 0, speed: 70, lockRange: 40, lifetime: 8, ownerGrace: 0.3, hover: 1.1, latRate: 4, overshoot: 24, consolation: 'espresso' }),
  bsod:         F({ id: 'bsod', uses: 1, radius: 45, spin: 1.5, flashSeconds: 1.0, screenSeconds: 2.8 }),
  autoscale:    F({ id: 'autoscale', uses: 1, seconds: 6, scale: 2, steerMul: 0.62, speedFrac: 0.96, stompSpin: 1.3, stompCooldown: 1.2, growRate: 5 }),
  spill:        F({ id: 'spill', uses: 1, radius: 3.2, lifetime: 15, grip: 0.22, ownerGrace: 0.8, dropBehind: 2.6, throwSpeed: 14, throwLift: 8, linger: 0.25 }),
  zeroday:      F({ id: 'zeroday', uses: 1, radius: 1.7, arming: 5, blastRadius: 9, spin: 1.8, lifetime: 90, dropBehind: 2.4, blastSeconds: 0.8, throwSpeed: 15, throwLift: 9 }),
  pods:         F({ id: 'pods', uses: 1, count: 3, seconds: 25 }),
  pod:          F({ id: 'pod', uses: 0, radius: 1.0, spin: 1.3, speed: 62, lockRange: 34, lifetime: 6, ownerGrace: 0.25, hover: 0.9, latRate: 4, overshoot: 22 }),
  forcepush:    F({ id: 'forcepush', uses: 1, radius: 14, impulse: 17, ringSeconds: 0.7, itemPush: 18 }),
  pigeon:       F({ id: 'pigeon', uses: 1, radius: 1.3, distance: 120, speed: 52, spin: 1.0, splatSeconds: 3.8, hover: 3.2, latRate: 3, passLateral: 1.7, lifetime: 6 }),
  // ---- skill items
  // capacitor: tap to start charging, tap again to release. Sweet spot [sweetMin, sweetMax] = "perfect" (fast, piercing, bounces);
  // early = weak; past sweetMax it is still strong but risky; at `overload` it blows up in your face.
  capacitor:    F({ id: 'capacitor', uses: 1, chargeMax: 2.4, sweetMin: 0.9, sweetMax: 1.7, overload: 2.4, slow: 0.86, selfSpin: 1.2,
                    perfectPierce: 2, perfectBounces: 2 }),
  bolt:         F({ id: 'bolt', uses: 0, radius: 0.85, radiusMax: 1.3, speedMin: 46, speedMax: 88, spinMin: 0.7, spinMax: 1.9, bounces: 1, lifetime: 4, ownerGrace: 0.25, hover: 0.9 }),
  // legacy: trails behind as a shield for `seconds` (absorbs a projectile, rams anyone who tailgates), tap again to hurl it.
  legacy:       F({ id: 'legacy', uses: 1, radius: 1.45, seconds: 14, trailDist: 3.4, follow: 9, speed: 62, spin: 1.6, ramSpin: 1.3, bounces: 1, lifetime: 4, ownerGrace: 0.3, hover: 0.8 }),
  // cronjob: lit fuse (boost while you carry it). Touch a rival to pass it on; if it goes off you spin, and so does whoever is close.
  cronjob:      F({ id: 'cronjob', uses: 1, fuse: 6, passFuse: 5, boostPower: 0.35, passReach: 0.6, passCooldown: 1.3, blastRadius: 7, spin: 1.8, splashSpin: 1.0, seekRange: 46, blastSeconds: 0.8 }),
  // ---- Biscuit-only (`exclusive: 'biscuit'`)
  // poo: dropped behind / lobbed ahead; a kart that drives over it spins and (human) gets a green smear; it leaves a stink cloud that slows karts a little.
  poo:          F({ id: 'poo', uses: 1, radius: 1.1, spin: 1.3, lifetime: 45, ownerGrace: 0.9, dropBehind: 2.0, throwSpeed: 15, throwLift: 9,
                    smearSeconds: 2.6, stinkSeconds: 4, stinkRadius: 4.5, stinkSlow: 0.86 }),
  // woof: a shockwave bark: karts within `radius` in a cone ahead (or within `closeRadius` all round) are shoved sideways and startled (steering wobble).
  woof:         F({ id: 'woof', uses: 1, radius: 17, closeRadius: 6, cone: 0.25, impulse: 12.5, itemPush: 20, startleSeconds: 1.3, wobble: 0.55, ringSeconds: 0.8 }),
  // zoomies: boost with keen, twitchy steering; the wobble is switched off beside a drop into the void.
  zoomies:      F({ id: 'zoomies', uses: 1, seconds: 5, boostPower: 0.8, steerMul: 1.3, wobble: 0.2 }),
  // fetch: homing stick out, boomerang back (tracks the owner), a mini boost on the catch.
  fetch:        F({ id: 'fetch', uses: 1, radius: 1.0, spin: 1.1, speed: 64, lockRange: 34, lifetime: 9, backSpeed: 58, backLifetime: 5, ownerGrace: 0.3, hover: 1.1,
                    latRate: 4, overshoot: 22, blindSeconds: 1.5, catchRadius: 2.4, catchBoost: 0.75, catchSeconds: 1.2 }),
});

/**
 * Two item slots (Mario-Kart-like): item boxes fill the first empty slot, slot 1 is fired by the use button, a second button swaps them.
 * `doubleBox`: at the back of the pack a box can hand out TWO different items at once (rubber banding). Only when both slots are empty.
 */
export const SLOTS = Object.freeze({
  count: 2,
  doubleBox: Object.freeze({ fromFraction: 0.6, minChance: 0.08, maxChance: 0.36, minRacers: 4 }),
  fullFlashCooldown: 1.2,       // s between two "slots full" notices for the same racer
});

/**
 * Chance that an item box gives two items, by place: 0 in the front 60 % of the field, rising to `maxChance` for last place.
 * @param {number} place 1-based place @param {number} count racers in the race
 * @returns {number} probability 0..1
 */
export function doubleBoxChance(place, count) {
  const d = SLOTS.doubleBox;
  if (count < d.minRacers) return 0;
  const f = (place - 1) / (count - 1);
  if (f < d.fromFraction) return 0;
  return d.minChance + (d.maxChance - d.minChance) * Math.min(1, (f - d.fromFraction) / (1 - d.fromFraction));
}

/** Every id that has a definition and can be held (all 24, the Biscuit-only ones included). */
export const ALL_ITEM_IDS = Object.freeze(Object.keys(ITEM_DEFS).filter((id) => ITEM_DEFS[id].uses > 0));

/**
 * Selection weights per finishing place (columns = places 1..8). Rows are items.
 * Leaders get cheap / defensive / nuisance items, the middle gets homing and utility, the back gets comeback items.
 * Items that need a target ahead (traceroute, sniffer, kernel_panic, outage) are zero at the front.
 */
export const ITEM_WEIGHTS = Object.freeze({
  //               1   2   3   4   5   6   7   8
  // front of the pack: cheap, defensive and trap items (no homing, nothing that needs a target ahead)
  cable:        [22, 18, 10,  4,  2,  0,  0,  0],
  ping:         [22, 22, 18, 10,  6,  2,  0,  0],
  espresso:     [14, 14, 12, 12, 10,  6,  3,  1],      // the only plain boost that reaches the middle, so it stays common there
  firewall:     [10, 12, 10,  6,  3,  1,  0,  0],
  spill:        [16, 14,  8,  4,  1,  0,  0,  0],
  zeroday:      [10, 10,  8,  5,  2,  0,  0,  0],
  legacy:       [10, 12, 10,  6,  3,  1,  0,  0],      // skill: defensive trailing shield, so front-runners
  pods:         [ 6,  8, 10,  8,  5,  3,  1,  0],
  forcepush:    [ 4,  6,  8,  8,  6,  4,  3,  2],
  // middle: homing, stealing and skill items
  traceroute:   [ 0,  6, 16, 18, 14,  9,  5,  2],
  pigeon:       [ 0,  4, 10, 12, 10,  6,  3,  1],
  sniffer:      [ 0,  3,  8, 12, 12,  8,  4,  2],
  capacitor:    [ 0,  4, 10, 14, 12,  8,  5,  2],      // skill: mid pack
  cronjob:      [ 0,  2,  6, 10, 12, 12, 10,  8],      // skill, risk / reward: needs rivals near, so not for the leader
  // back of the pack: comeback items
  bsod:         [ 0,  0,  0,  4,  8, 12, 14, 14],
  autoscale:    [ 0,  0,  0,  2,  8, 14, 18, 20],
  sudo:         [ 0,  0,  0,  4, 10, 16, 20, 22],
  fibre:        [ 0,  0,  0,  4, 10, 16, 20, 22],
  outage:       [ 0,  0,  0,  2,  6, 10, 12, 14],
  kernel_panic: [ 0,  0,  0,  0,  4, 10, 14, 18],
  // Biscuit-only: used for the share of her draws that come from her own pool (see `pickItemFor`)
  poo:          [14, 14, 12, 10,  8,  6,  5,  4],
  woof:         [ 6, 10, 14, 14, 12, 10,  8,  6],
  zoomies:      [ 4,  6, 10, 14, 16, 16, 16, 16],
  fetch:        [ 0,  8, 14, 14, 12, 10,  8,  6],
});

/** Share of Biscuit's item draws that come from her own exclusive pool (the rest are normal items, picked as for anyone). */
export const BISCUIT_SHARE = 0.4;
/** Is this an item only one character can roll? */
export const isExclusive = (id) => !!EXCLUSIVE_ITEMS[id];

/**
 * The item ids active for a given item table (defaults to the live `ITEMS`): ids with a definition and a weight row.
 * @param {Object<string, object>} [table] e.g. `ITEMS` or `ALL_ITEMS`
 * @returns {string[]}
 */
export function activeIds(table) {
  const src = table ?? ITEMS;
  return Object.keys(src).filter((id) => ITEM_DEFS[id] && ITEM_WEIGHTS[id] && !src[id].exclusive);
}

/** The exclusive ids in a table that belong to this character (empty for everybody but Biscuit). @param {string} charId @param {Object<string, object>} [table] */
export function exclusiveIds(charId, table) {
  const src = table ?? ITEMS;
  return Object.keys(src).filter((id) => ITEM_DEFS[id] && ITEM_WEIGHTS[id] && src[id].exclusive === charId);
}

/** The live table: `ITEMS`, or every item when the env flag MARCO_ALL_ITEMS is set (tests / debugging). */
export function defaultItemIds() {
  if (typeof process !== 'undefined' && process.env && process.env.MARCO_ALL_ITEMS) return ALL_ITEM_IDS.filter((id) => !isExclusive(id));
  return activeIds(ITEMS);
}

/**
 * Weights for a given place, interpolating the 8-column table when fewer racers are in the race.
 * @param {number} place 1-based finishing place
 * @param {number} count number of racers in the race
 * @param {Object<string, number>} [out] reused result object
 * @param {string[]} [ids] restrict to these ids (default: the live item ids)
 * @returns {Object<string, number>} item id -> weight
 */
export function itemWeights(place, count = 8, out = {}, ids = defaultItemIds()) {
  const col = count <= 1 ? 0 : Math.min(7, Math.max(0, ((place - 1) / (count - 1)) * 7));
  const lo = Math.floor(col), hi = Math.min(7, lo + 1), t = col - lo;
  for (const id of ids) {
    const row = ITEM_WEIGHTS[id];
    out[id] = row ? row[lo] + (row[hi] - row[lo]) * t : 0;
  }
  return out;
}

const scratch = {};

/**
 * Picks an item id for a place using the weighted table.
 * @param {number} place 1-based place
 * @param {number} count number of racers
 * @param {() => number} rand RNG returning [0, 1)
 * @param {string[]} [ids] restrict to these ids (default: the live item ids)
 * @returns {string} item id
 */
export function pickItem(place, count, rand, ids = defaultItemIds()) {
  const w = itemWeights(place, count, scratch, ids);
  let total = 0;
  for (const id of ids) total += w[id];
  let r = rand() * total;
  for (const id of ids) {
    r -= w[id];
    if (r < 0 && w[id] > 0) return id;
  }
  return ids.includes('ping') ? 'ping' : ids[0];
}

/**
 * Like `pickItem`, for a particular character: a character with exclusive items (Biscuit) takes `BISCUIT_SHARE` of its draws from them.
 * Everybody else only ever sees `ids` (the general list), so an exclusive item can never be rolled by anyone but its owner.
 * @param {string} charId @param {number} place @param {number} count @param {() => number} rand @param {string[]} ids general ids @param {string[]} [own] the character's exclusive ids
 * @returns {string}
 */
export function pickItemFor(charId, place, count, rand, ids = defaultItemIds(), own = exclusiveIds(charId)) {
  if (own.length && rand() < BISCUIT_SHARE) return pickItem(place, count, rand, own);
  return pickItem(place, count, rand, ids);
}

// keep the import used for documentation of the live set
export const LIVE_ITEM_IDS = ITEM_IDS;
