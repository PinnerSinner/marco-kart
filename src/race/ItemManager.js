// ItemManager: holds every item-related rule of the race: the roulette (one or two items), two item slots (hold, use, swap), world entities
// (cables, pings, traceroutes, mines, pigeons...), timed racer statuses (fibre, autoscale, splat, pods...), shields, and the single
// `strike()` routine through which every hostile hit passes (so shields, pods, sudo, fibre and invincibility behave consistently).
//
// Two item slots: `racer.item` is slot 1 (the FRONT item: the only one the use button fires) and `racer.item2` is slot 2 (queued).
//   Boxes fill the first empty slot and are refused (box stays, `item:full`) while both are taken. `swap(r)` exchanges the slots; it is
//   refused while slot 1 is "live" (capacitor charging, legacy server in tow, pods deployed). Using or losing slot 1 slides slot 2 forward.
//   Back of the pack: a box can give two different items at once (`doubleBoxChance`).
//   Extra events: item:swap {id, front, back}, item:swap-denied {id, reason}, item:full {id, index}. `item:get` carries `slot` 1|2.
// Racer fields owned here (all seconds unless noted): item, item2 (queued second item), shield/shieldTime, pods (count) + podTime,
// sudo, fibre, giant (+ giantScale), splat, slickT, screenFx ({kind, t, dur}|null, humans only).
//
// Events (SPEC section 6 plus): item:use, item:hit {victimId, byId, item}, item:block {id, item, byId, kind}, item:get, item:roulette, item:expire,
//   item:shield-break {id, kind:'firewall'|'pods', pods?}, item:steal {fromId, toId, item, consolation}, item:end {id, item},
//   item:deflect {entityId, type, byId}, item:flatten {entityId, type, id},
//   item:splat {id}, and sfx `item-use-<id>` / `item-hit-<id>` for every item.
// Biscuit-only items (`exclusive: 'biscuit'` in config ITEMS, never rolled by anyone else, never stolen by the sniffer): poo (`item:use`, a poo entity, then `item:hit`
//   {item:'poo'} + `item:smear {id}` + a stink cloud: `item:stink {id}`), woof (`item:use {shake, shout:'WOOF!'}` + `item:woof {id, pos, yaw, radius, hits}`; victims
//   get `item:hit {item:'woof', push:true}`), zoomies (`item:use`, racer.zoomies seconds left, `item:end`), fetch (`item:use`, `item:fetch {id, phase:'return', hit}`,
//   `item:catch {id}` on the catch). New racer fields: zoomies, startled (steering wobble), stinkT (in a stink cloud).
// Skill items: capacitor (tap to charge, tap again to release; `item:charge {id, zone, start?}`, `item:release {id, power, perfect, t}`,
//   `item:overload {id}`), legacy (tow it behind as a shield, tap to hurl it: `item:use {fire:true}`, `item:end`), cronjob (hot potato:
//   `item:potato {id, fromId, toId, fuse}`, `item:potato-boom {id, ownerId}`). New racer fields: charging, chargeT, trailId, trailT, potato, potatoNo.
import * as THREE from 'three';
import { CFG } from '../core/config.js';
import { bus } from '../core/bus.js';
import { clamp, damp } from '../core/util.js';
import { RACE } from './constants.js';
import { ITEM_DEFS, STRIKE, SLOTS, pickItemFor, defaultItemIds, activeIds, exclusiveIds, isExclusive, doubleBoxChance } from './itemDefs.js';
import { stepEntity } from './itemEntities.js';

export { STRIKE };

const _fwd = new THREE.Vector3();
const SPLAT_JITTER = 0.22;   // steering wobble of an AI driver under a pigeon splat
const STATUS_KEYS = ['giant', 'splat', 'slickT', 'podTime', 'stompImmune', 'chargeT', 'trailT', 'potato', 'potatoNo', 'trailId', 'zoomies', 'startled', 'stinkT'];

function makeEntity() {
  return {
    id: 0, type: '', pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, ownerId: '', state: '',
    radius: 1, targetId: null, age: 0, bounces: 0, dir: 1, prog: 0, lat: 0, stamp: 0,
    alive: false, aux: 0, aux2: 0, colour: 0, kartId: '', index: 0, hits: 0,
  };
}

export class ItemManager {
  /**
   * @param {import('./Race.js').Race} race
   * @param {{items?: Object<string, object>}} [opts] `items`: the item table that is live (default: `ITEMS`, or every item when the env flag
   *   MARCO_ALL_ITEMS is set). Tests pass `ALL_ITEMS` to exercise the v2 items before they are merged into `ITEMS`.
   */
  constructor(race, opts = {}) {
    this.race = race;
    this.track = race.track;
    /** Item ids that can be rolled (restricted to ids present in the live table). */
    this.ids = opts.items ? activeIds(opts.items) : defaultItemIds();
    /** The item table this manager rolls from (exclusive items are looked up in it per character). */
    this._table = opts.items ?? null;
    this._own = Object.create(null);    // charId -> that character's exclusive ids
    /** Active world items: [{ id, type, pos, vel, yaw, ownerId, state, radius, targetId? }] */
    this.entities = [];
    this._pool = [];
    this._nextId = 1;
    this._q = {};                       // scratch track.query result
    this._sm = {};                      // scratch track.sample result
    this._n = new THREE.Vector3();      // scratch wall normal
    this._p = new THREE.Vector3();      // scratch position
    this._tick = 0;
    this.shieldCount = 0;                // live towed legacy servers (the only entity that eats shots), so projectiles can skip the check
    for (const r of race.racers ?? []) this.ensure(r);
  }

  /** Makes sure a racer carries every item-related field. */
  ensure(r) {
    if (r._itemsInit) return r;
    r._itemsInit = true;
    for (const k of STATUS_KEYS) if (typeof r[k] !== 'number') r[k] = 0;
    r.giantScale = 1; r.pods = 0; r.item2 = null; r._item2 = null; r.screenFx = null; r._sfx = { kind: '', t: 0, dur: 0 };
    r._pgId = 0; r.kartsOwned = 0; r.charging = false; r._chargeZone = ''; r.potatoOwner = '';
    r.boxRefused = 0; r._fullAt = -99;
    return r;
  }

  // ---- roulette / inventory ----------------------------------------------------------------------------
  /** @returns {number} how many of the two item slots are empty */
  freeSlots(r) { return (r.item ? 0 : 1) + (r.item2 ? 0 : 1); }

  /** The exclusive item ids this racer can roll (Biscuit's four; an empty list for everybody else). @param {object} r Racer @returns {string[]} */
  ownIds(r) {
    const c = r.charId;
    return this._own[c] ?? (this._own[c] = exclusiveIds(c, this._table ?? undefined));
  }

  /** Can this racer take an item box right now? (alive, not already rolling, at least one empty slot) */
  canCollect(r) { return !r.finished && !r.itemRoulette && !(r.item && r.item2); }

  /**
   * How many items a box gives this racer: one, or two different items at the back of the pack when both slots are empty (rubber banding).
   * @param {object} r Racer @returns {1|2}
   */
  boxCount(r) {
    if (this.freeSlots(r) < 2) return 1;
    const p = doubleBoxChance(r.place, this.race.racers.length);
    return p > 0 && this.race.rng() < p ? 2 : 1;
  }

  /**
   * Starts the item roulette for a racer that has just driven through an item box.
   * @param {object} r Racer @param {number} [count] items granted when it ends (default: 1, or 2 for a lucky "double box" at the back)
   */
  startRoulette(r, count) {
    this.ensure(r);
    const n = Math.max(1, Math.min(SLOTS.count, count ?? this.boxCount(r)));
    const ro = r._roulette ?? (r._roulette = { active: true, t: 0, shown: null, next: 0, count: 1 });
    ro.active = true; ro.t = 0; ro.shown = null; ro.next = 0; ro.count = n;
    r.itemRoulette = ro;
  }

  /** A box was driven through with both slots full: it stays where it is and the HUD flashes "FULL" (rate limited per racer). */
  refuse(r, index = -1) {
    this.ensure(r);
    const t = this.race.simTime ?? 0;
    if (t - r._fullAt < SLOTS.fullFlashCooldown) return;
    r._fullAt = t; r.boxRefused++;
    bus.emit('item:full', { id: r.id, index, isPlayer: r.isPlayer });
    if (r.isPlayer) bus.emit('sfx', { name: 'item-full', volume: 0.9 });
  }

  /**
   * Puts an item straight into a racer's first slot (used when the roulette ends, and by tests / debug tools).
   * @param {object} r Racer @param {string} id item id
   */
  give(r, id) {
    this.ensure(r);
    const it = r._item ?? (r._item = { id, count: 1, live: false });
    it.id = id; it.count = ITEM_DEFS[id].uses; it.live = false;
    r.item = it;
    r.itemRoulette = null;
    bus.emit('item:get', { id: r.id, item: id, isPlayer: r.isPlayer, slot: 1 });
  }

  /**
   * Adds an item to the second (queued) slot. Returns false when the racer has no first item or the second slot is taken.
   * @param {object} r Racer @param {string} id item id @param {number} [count]
   */
  stack(r, id, count) {
    this.ensure(r);
    if (!r.item || r.item2) return false;
    const it = r._item2 ?? (r._item2 = { id, count: 1, live: false });
    it.id = id; it.count = count ?? ITEM_DEFS[id].uses; it.live = false;
    r.item2 = it;
    bus.emit('item:get', { id: r.id, item: id, isPlayer: r.isPlayer, slot: 2 });
    return true;
  }

  /** Gives an item to the first free slot. @returns {boolean} whether it fitted */
  grant(r, id, count) {
    if (!r.item) { this.give(r, id); if (count) r.item.count = count; return true; }
    return this.stack(r, id, count);
  }

  /** Empties slot 1 and slides the queued item (if any) into it. */
  _promote(r) {
    const src = r.item2;
    if (src) {
      const it = r._item ?? (r._item = { id: src.id, count: src.count, live: false });
      it.id = src.id; it.count = src.count; it.live = false;
      r.item = it; r.item2 = null;
    } else r.item = null;
  }

  /**
   * Is slot 1 "live" (capacitor charging, legacy server in tow, pods orbiting)? A live front item cannot be swapped away: it is still in use.
   * @param {object} r Racer @returns {boolean}
   */
  swapLocked(r) {
    const it = r.item;
    if (!it) return false;
    return !!(r.charging || r.trailId || (it.id === 'pods' && it.live));
  }

  /**
   * Exchanges slot 1 and slot 2 (the second item button). Does nothing with fewer than two items; refused while slot 1 is live.
   * @param {object} r Racer @returns {boolean} true when the slots were exchanged
   */
  swap(r) {
    if (r.finished) return false;
    this.ensure(r);
    if (!r.item || !r.item2) return false;
    if (this.swapLocked(r)) {
      bus.emit('item:swap-denied', { id: r.id, item: r.item.id, reason: r.charging ? 'charging' : r.trailId ? 'towing' : 'active', isPlayer: r.isPlayer });
      if (r.isPlayer) bus.emit('sfx', { name: 'ui-error', volume: 0.4, pitch: 1.2 });
      return false;
    }
    const a = r.item, b = r.item2;
    const id = a.id, count = a.count;
    a.id = b.id; a.count = b.count; a.live = false;
    b.id = id; b.count = count; b.live = false;
    bus.emit('item:swap', { id: r.id, front: a.id, back: b.id, isPlayer: r.isPlayer });
    if (r.isPlayer) bus.emit('sfx', { name: 'item-swap', volume: 0.9 });
    return true;
  }

  /** Removes the racer's held item(s) (outage). */
  dropItems(r) {
    r.item = null; r.item2 = null; r.itemRoulette = null;
    r.charging = false; r.chargeT = 0;
    if (r.trailId) { const t = this.findEntity(r.trailId); if (t) this.remove(t); r.trailId = 0; r.trailT = 0; }
  }

  /** @returns {object|null} the live world item with this id */
  findEntity(id) {
    for (let i = 0; i < this.entities.length; i++) if (this.entities[i].id === id) return this.entities[i];
    return null;
  }

  _stepRoulette(r, dt) {
    const ro = r.itemRoulette;
    ro.t += dt;
    const ids = this.ids;
    if (ro.t >= RACE.rouletteSeconds) {
      const n = ro.count ?? 1;
      const got = [];
      for (let i = 0; i < n; i++) {
        const own = this.ownIds(r);
        let id = pickItemFor(r.charId, r.place, this.race.racers.length, this.race.rng, ids, own);
        for (let tries = 0; tries < 10 && got.includes(id); tries++) id = pickItemFor(r.charId, r.place, this.race.racers.length, this.race.rng, ids, own);   // a double box gives two DIFFERENT items
        if (got.includes(id)) continue;
        if (this.grant(r, id)) got.push(id);
      }
      r.itemRoulette = null;
      ro.shown = got[0] ?? r.item?.id ?? null;
      if (r.isPlayer) bus.emit('item:roulette', { id: r.id, shown: ro.shown, done: true, items: got, double: got.length > 1 });
      return;
    }
    if (ro.t >= ro.next) {
      const own = this.ownIds(r);
      const pool = own.length ? ids.concat(own) : ids;           // the dog's reel also shows her own items
      let id = pool[this.race.rng.int(0, pool.length - 1)];
      if (id === ro.shown) id = pool[(pool.indexOf(id) + 1) % pool.length];
      ro.shown = id;
      const u = ro.t / RACE.rouletteSeconds;
      ro.next = ro.t + 0.05 + 0.17 * u * u;
      if (r.isPlayer) bus.emit('item:roulette', { id: r.id, shown: id, done: false });
    }
  }

  // ---- using items -------------------------------------------------------------------------------------
  /**
   * Uses the racer's FRONT item (slot 1); the queued item is never used directly (swap first). With slot 1 empty it fires a pod
   * from an orbiting cluster or shakes off an active firewall. Works while slot 2 is still rolling in a box.
   * @param {object} r Racer
   * @param {{itemPressed?: boolean, aimBack?: boolean, aimForward?: boolean}} [actions]
   *   aimBack: cable dropped / ping fired / traceroute sent backwards (every throwable supports it). aimForward: cable / spill / mine thrown ahead.
   * @returns {boolean} true if something happened
   */
  use(r, actions) {
    if (r.finished) return false;
    this.ensure(r);
    if (r.itemRoulette && !r.item) return false;             // slot 1 is still spinning: nothing to use yet
    const it = r.item;
    const aimBack = !!actions?.aimBack, aimForward = !!actions?.aimForward;
    if (!it) {
      if (r.pods > 0) return this._firePod(r, aimBack);
      if (r.shield) {
        r.shield = false; r.shieldTime = 0;
        bus.emit('item:use', { id: r.id, item: 'firewall', shake: true, isPlayer: r.isPlayer });
        bus.emit('item:shield-break', { id: r.id, kind: 'firewall', shake: true, isPlayer: r.isPlayer });
        return true;
      }
      return false;
    }
    const k = r.kart;
    const itemId = it.id;
    const def = ITEM_DEFS[itemId];
    if (!def) { this._consume(r, it); return false; }
    // skill items keep their slot while they are "live": charging a capacitor, towing a legacy server
    if (itemId === 'capacitor') return r.charging ? this._releaseCharge(r, it, aimBack) : this._startCharge(r);
    if (itemId === 'legacy') return r.trailId && this.findEntity(r.trailId) ? this._hurlLegacy(r, it, aimBack) : this._deployLegacy(r);
    if (itemId === 'pods') return r.pods > 0 && it.live ? this._firePod(r, aimBack) : this._deployPods(r, it, def);
    let target = null;
    switch (itemId) {
      case 'traceroute': target = this._neighbour(r, aimBack ? -1 : 1); break;      // none ahead (leader): it runs the road blind
      case 'kernel_panic': target = this._leaderFor(r); if (!target) return false; break;   // nobody to strike: keep the item
      case 'sniffer': target = this._sniffTarget(r); if (!target) return false; break;
      case 'fetch': target = this._neighbour(r, aimBack ? -1 : 1); break;            // none ahead (leader): the stick runs the road blind, then comes back
      default: break;
    }
    this._consume(r, it);
    bus.emit('item:use', { id: r.id, item: itemId, pos: k.pos.clone(), isPlayer: r.isPlayer, aimBack, ...(itemId === 'woof' ? { shake: true, shout: 'WOOF!' } : null) });
    bus.emit('sfx', { name: `item-use-${itemId}`, pos: k.pos.clone() });
    const dir = aimBack ? -1 : 1;
    switch (itemId) {
      case 'cable': this._spawnCable(r, aimForward && !aimBack); break;
      case 'ping': this._spawnPing(r, dir); break;
      case 'traceroute': this._spawnHoming(r, 'traceroute', dir, target); break;
      case 'kernel_panic': this._spawnHoming(r, 'kernel_panic', 1, target); break;
      case 'sniffer': this._spawnHoming(r, 'sniffer', 1, target); break;
      case 'pigeon': this._spawnPigeon(r, dir); break;
      case 'spill': this._spawnDrop(r, 'spill', aimForward && !aimBack); break;
      case 'zeroday': this._spawnDrop(r, 'zeroday', aimForward && !aimBack); break;
      case 'espresso': k.applyBoost(def.boostPower, def.boostSeconds, 'item'); break;
      case 'sudo':
        r.sudo = def.seconds;
        this._invincible(k, def.seconds);
        k.applyBoost(def.boostPower, def.seconds, 'item');
        break;
      case 'firewall': r.shield = true; r.shieldTime = def.seconds; break;
      case 'fibre':
        r.fibre = def.seconds;
        k.status.autopilot = true;
        this._invincible(k, def.seconds + def.grace);
        k.applyBoost(def.boostPower, def.seconds, 'fibre');
        break;
      case 'autoscale': r.giant = def.seconds; break;
      case 'outage': this._outage(r, def); break;
      case 'bsod': this._bsod(r, def); break;
      case 'forcepush': this._forcePush(r, def); break;
      case 'cronjob': this._lightFuse(r, def); break;
      case 'poo': this._spawnDrop(r, 'poo', aimForward && !aimBack); break;
      case 'woof': this._woof(r, def); break;
      case 'zoomies': r.zoomies = def.seconds; k.applyBoost(def.boostPower, def.seconds, 'item'); break;
      case 'fetch': this._spawnHoming(r, 'fetch', dir, target); break;
      default: break;
    }
    return true;
  }

  // ---- Biscuit-only items ----------------------------------------------------------------------------------------
  /** True when the road edge under this kart is a drop into the void (no wall to stop a kart that is shoved or wobbles wide). */
  _voidEdge(k) {
    const line = this.race.line;
    return !!line && line.at(line.margin, k.ground.s) > 5;
  }

  /**
   * Mega Woof: a shockwave in a cone ahead (and a small circle all round). Karts in it are shoved sideways and startled (steering wobble);
   * hostile projectiles are batted away. Beside a void edge the shove is gentler and there is no wobble. Shields / ghosts still block.
   */
  _woof(user, def) {
    const k = user.kart;
    const ring = this._spawn('woof', user, 'blast');
    ring.pos.copy(k.pos); ring.radius = def.radius; ring.yaw = k.yaw;
    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw), rx = -fz, rz = fx;
    let hits = 0;
    for (const v of this.race.racers) {
      if (v === user || v.finished) continue;
      const b = v.kart;
      let dx = b.pos.x - k.pos.x, dz = b.pos.z - k.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > def.radius || Math.abs(b.pos.y - k.pos.y) > 6 || (b.status.respawning ?? 0) > 0) continue;
      const n = d > 1e-3 ? 1 / d : 0;
      dx *= n; dz *= n;
      const along = dx * fx + dz * fz;
      if (d > def.closeRadius && along < def.cone) continue;
      if (this.strike(v, user.id, 'woof', 0, 'woof', true) !== STRIKE.HIT) continue;
      hits++;
      const edge = this._voidEdge(b);
      let side = dx * rx + dz * rz;
      if (Math.abs(side) < 0.35) side = side < 0 ? -0.35 : 0.35 * (side === 0 ? (v.gridIndex % 2 ? -1 : 1) : 1);
      let ox = rx * side + fx * along * 0.3, oz = rz * side + fz * along * 0.3;
      const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      const mag = def.impulse * (1 - 0.55 * d / def.radius) * (edge ? 0.4 : 1) / (b.scale > 1 ? b.scale * b.scale : 1);
      b.vel.x += ox * mag; b.vel.z += oz * mag;
      b.pos.x += ox * 0.3; b.pos.z += oz * 0.3;
      const m = Math.hypot(b.vel.x, b.vel.z);
      b.speed = (b.vel.x * Math.sin(b.yaw) + b.vel.z * Math.cos(b.yaw)) >= 0 ? m : -m;
      if (!edge) v.startled = def.startleSeconds;
      bus.emit('item:hit', { victimId: v.id, byId: user.id, item: 'woof', push: true });
    }
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const o = this.entities[i];
      if (!o || o === ring || o.ownerId === user.id) continue;
      const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > def.radius) continue;
      if (d > def.closeRadius && (dx * fx + dz * fz) / d < def.cone) continue;
      this._pushEntity(o, user, dx, dz, d, def);
    }
    bus.emit('item:woof', { id: user.id, isPlayer: user.isPlayer, pos: k.pos.clone(), yaw: k.yaw, radius: def.radius, hits });
  }

  // ---- skill items ---------------------------------------------------------------------------------------
  _startCharge(r) {
    r.charging = true; r.chargeT = 0; r._chargeZone = 'weak';
    bus.emit('item:charge', { id: r.id, zone: 'weak', start: true, isPlayer: r.isPlayer });
    bus.emit('sfx', { name: 'item-charge', pos: r.kart.pos.clone() });
    return true;
  }

  /** Charge zone for a charge time: 'weak' (too early), 'sweet' (perfect), 'over' (risky: nearly overloaded). */
  chargeZone(t) {
    const d = ITEM_DEFS.capacitor;
    return t < d.sweetMin ? 'weak' : t <= d.sweetMax ? 'sweet' : 'over';
  }

  _releaseCharge(r, it, aimBack) {
    const d = ITEM_DEFS.capacitor, k = r.kart, t = r.chargeT;
    const zone = this.chargeZone(t);
    const perfect = zone === 'sweet';
    const power = zone === 'weak' ? 0.22 + 0.5 * (t / d.sweetMin) : perfect ? 1 : 0.9;
    r.charging = false; r.chargeT = 0; r._chargeZone = '';
    this._consume(r, it);
    bus.emit('item:use', { id: r.id, item: 'capacitor', pos: k.pos.clone(), isPlayer: r.isPlayer, aimBack, power, perfect });
    bus.emit('item:release', { id: r.id, power, perfect, t, zone, isPlayer: r.isPlayer });
    bus.emit('sfx', { name: 'item-use-capacitor', pos: k.pos.clone(), pitch: 0.85 + power * 0.35 });
    this._spawnBolt(r, aimBack ? -1 : 1, power, perfect);
    return true;
  }

  _spawnBolt(r, dir, power, perfect) {
    const def = ITEM_DEFS.bolt, cd = ITEM_DEFS.capacitor, k = r.kart;
    _fwd.set(Math.sin(k.yaw) * dir, 0, Math.cos(k.yaw) * dir);
    const e = this._spawn('bolt', r, 'flying');
    const sp = def.speedMin + (def.speedMax - def.speedMin) * power;
    e.radius = def.radius + (def.radiusMax - def.radius) * power;
    e.pos.set(k.pos.x + _fwd.x * (k.radius + 1.8), k.pos.y + def.hover, k.pos.z + _fwd.z * (k.radius + 1.8));
    e.vel.set(_fwd.x * sp, 0, _fwd.z * sp);
    e.yaw = Math.atan2(_fwd.x, _fwd.z);
    e.aux = power; e.aux2 = def.spinMin + (def.spinMax - def.spinMin) * power;
    e.prog = perfect ? cd.perfectPierce : 0;           // pierce budget: extra racers it can pass through
    e.index = perfect ? cd.perfectBounces : def.bounces;   // wall bounces
    e.colour = perfect ? 1 : 0;
    return e;
  }

  /** Charged too long: the capacitor blows up in the user's face. */
  _overload(r) {
    const d = ITEM_DEFS.capacitor;
    r.charging = false; r.chargeT = 0; r._chargeZone = '';
    if (r.item?.id === 'capacitor') this._consume(r, r.item);
    bus.emit('item:overload', { id: r.id, isPlayer: r.isPlayer, pos: r.kart.pos.clone() });
    bus.emit('sfx', { name: 'explosion', pos: r.kart.pos.clone(), volume: 0.7 });
    this.strike(r, r.id, 'capacitor', d.selfSpin, 'capacitor');
  }

  _deployLegacy(r) {
    const def = ITEM_DEFS.legacy, k = r.kart;
    const e = this._spawn('legacy', r, 'trail');
    _fwd.set(Math.sin(k.yaw), 0, Math.cos(k.yaw));
    e.pos.set(k.pos.x - _fwd.x * def.trailDist, k.pos.y + 0.5, k.pos.z - _fwd.z * def.trailDist);
    r.trailId = e.id; r.trailT = def.seconds;
    bus.emit('item:use', { id: r.id, item: 'legacy', pos: k.pos.clone(), isPlayer: r.isPlayer, trail: true });
    bus.emit('sfx', { name: 'item-use-legacy', pos: k.pos.clone() });
    return true;
  }

  _hurlLegacy(r, it, aimBack) {
    const def = ITEM_DEFS.legacy, k = r.kart;
    const e = this.findEntity(r.trailId);
    r.trailId = 0; r.trailT = 0;
    this._consume(r, it);
    const dir = aimBack ? -1 : 1;
    _fwd.set(Math.sin(k.yaw) * dir, 0, Math.cos(k.yaw) * dir);
    e.state = 'flying'; e.age = 0; e.bounces = 0; e.radius = 1.2;
    const d = k.radius + 2.0;
    e.pos.set(k.pos.x + _fwd.x * d, k.pos.y + def.hover, k.pos.z + _fwd.z * d);
    const sp = def.speed + (dir > 0 ? Math.max(0, k.speed) * 0.4 : 0);
    e.vel.set(_fwd.x * sp, 0, _fwd.z * sp);
    e.yaw = Math.atan2(_fwd.x, _fwd.z);
    bus.emit('item:use', { id: r.id, item: 'legacy', pos: k.pos.clone(), isPlayer: r.isPlayer, fire: true, aimBack });
    bus.emit('sfx', { name: 'item-use-legacy', pos: k.pos.clone(), pitch: 1.3 });
    return true;
  }

  /** A trailing legacy server ended (timed out, broken by a hit, rammed something): the owner's slot empties. */
  _trailEnded(e) {
    const o = this.race.byId?.get(e.ownerId);
    if (!o) return;
    o.trailId = 0; o.trailT = 0;
    if (o.item?.id === 'legacy') this._consume(o, o.item);
    bus.emit('item:end', { id: o.id, item: 'legacy', isPlayer: o.isPlayer });
  }

  _lightFuse(r, def) {
    r.potato = def.fuse; r.potatoOwner = r.id; r.potatoNo = 0.6;
    r.kart.applyBoost(def.boostPower, def.fuse, 'item');
    bus.emit('item:potato', { id: r.id, fromId: null, toId: r.id, fuse: def.fuse, isPlayer: r.isPlayer });
  }

  /** Per step: the fuse burns, contact with a rival passes it on, at zero it goes off on whoever holds it. */
  _tickPotato(r, dt) {
    const def = ITEM_DEFS.cronjob, a = r.kart;
    r.potato -= dt;
    if (r.potato <= 0) { this._potatoBoom(r); return; }
    if (r.potatoNo > 0 || r.finished) return;
    for (const v of this.race.racers) {
      if (v === r || v.finished || v.potatoNo > 0 || v.potato > 0) continue;
      const b = v.kart;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const reach = a.radius + b.radius + def.passReach;
      if (dx * dx + dz * dz > reach * reach || Math.abs(b.pos.y - a.pos.y) > 2.5) continue;
      const res = this.strike(v, r.potatoOwner || r.id, 'cronjob', 0, 'cronjob', true);
      if (res === STRIKE.HIT) {
        const owner = r.potatoOwner;
        v.potato = def.passFuse; v.potatoOwner = owner; v.potatoNo = def.passCooldown;
        r.potato = 0; r.potatoNo = def.passCooldown;
        bus.emit('item:potato', { id: v.id, fromId: r.id, toId: v.id, fuse: def.passFuse, isPlayer: v.isPlayer });
        bus.emit('sfx', { name: 'item-use-cronjob', pos: b.pos.clone(), pitch: 1.4 });
        return;
      }
      r.potatoNo = 0.8;                                    // blocked by a shield: try again shortly
      return;
    }
  }

  _potatoBoom(r) {
    const def = ITEM_DEFS.cronjob, k = r.kart;
    const ownerId = r.potatoOwner || r.id;
    r.potato = 0; r.potatoNo = 0;
    const e = this._spawn('cronjob', r, 'blast');
    e.pos.copy(k.pos); e.radius = def.blastRadius;
    bus.emit('item:potato-boom', { id: r.id, ownerId, isPlayer: r.isPlayer, pos: k.pos.clone() });
    bus.emit('sfx', { name: 'explosion', pos: k.pos.clone() });
    this.strike(r, ownerId, 'cronjob', def.spin, 'cronjob');
    for (const v of this.race.racers) {
      if (v === r || v.finished) continue;
      const b = v.kart, dx = b.pos.x - k.pos.x, dz = b.pos.z - k.pos.z;
      if (dx * dx + dz * dz > def.blastRadius * def.blastRadius || Math.abs(b.pos.y - k.pos.y) > 6) continue;
      this.strike(v, ownerId, 'cronjob', def.splashSpin, 'cronjob');
    }
  }

  /**
   * AI carriers drift sideways towards the nearest rival ahead so they can pass the fuse on. Only a lateral nudge on top of the
   * AI's own road-following steering (never a heading change), and never near a jump or the road edge.
   */
  _potatoSeek(r, inp) {
    const a = r.kart, def = ITEM_DEFS.cronjob, g = a.ground;
    const line = this.race.line;
    if (line && line.at(line.pinW, g.s) > 0.02) return;
    const half = (g.width ?? 18) / 2;
    let best = null, bd = def.seekRange;
    for (const v of this.race.racers) {
      if (v === r || v.finished || v.fibre > 0 || v.sudo > 0 || v.potatoNo > 0) continue;
      const d = v.progress - r.progress;
      if (d > -3 && d < bd) { bd = d; best = v; }
    }
    if (!best) return;
    const want = clamp(best.kart.ground.lateral, -(half - 3.5), half - 3.5);
    const nudge = clamp((want - g.lateral) * 0.14, -0.45, 0.45);
    inp.steer = clamp(inp.steer + nudge, -1, 1);
    inp.throttle = 1;
  }

  /** Packet sniffer arrival: steals the target's held item (or gives a small boost when there is nothing to steal). */
  sniff(e, target) {
    const def = ITEM_DEFS.sniffer;
    const owner = this.race.byId.get(e.ownerId);
    if (!owner) return;
    const res = this.strike(target, e.ownerId, 'sniffer', 0, 'sniffer', true);
    if (res !== STRIKE.HIT) return;
    // the front item is stolen unless it is live (charging / towed / orbiting pods): then the queued item goes instead
    // Biscuit's own items (exclusive) are never stolen: they would break the rule that nobody else can hold them
    const front = target.item && !this.swapLocked(target) && !isExclusive(target.item.id);
    const stealable = front || (!!target.item2 && !isExclusive(target.item2.id));
    if (stealable) {
      const src = front ? target.item : target.item2;
      const id = src.id, count = src.count;
      if (front) this._promote(target); else target.item2 = null;
      const ok = this.grant(owner, id, count);
      bus.emit('item:steal', { fromId: target.id, toId: owner.id, item: id, consolation: !ok, isPlayer: owner.isPlayer });
      if (ok) return;
    } else bus.emit('item:steal', { fromId: target.id, toId: owner.id, item: null, consolation: true, isPlayer: owner.isPlayer });
    const c = ITEM_DEFS[def.consolation];
    owner.kart.applyBoost(c.boostPower, c.boostSeconds, 'item');
  }

  /** Uses up one charge of the racer's first slot; a stacked item slides forward. */
  _consume(r, it) {
    it.count -= 1;
    if (it.count <= 0) this._promote(r);
  }

  _invincible(kart, seconds) { if (kart.status.invincible < seconds) kart.setInvincible(seconds); }

  _outage(user, def) {
    for (const v of this.race.racers) {
      if (v === user || v.finished || v.place >= user.place) continue;   // only racers AHEAD of the user
      const res = this.strike(v, user.id, 'outage', 0, 'outage', true);
      if (res === STRIKE.BLOCKED) continue;
      if (res === STRIKE.HIT && this._shrink(v, def.shrinkSeconds)) this.dropItems(v);
    }
  }

  /** Shrinks a racer's kart; makes sure exactly one `kart:shrink` event goes out whether or not the physics emits it. */
  _shrink(v, seconds) {
    let seen = false;
    const off = bus.on('kart:shrink', (d) => { if (d?.id === v.id) seen = true; });
    const ok = v.kart.shrink(seconds);
    off();
    if (ok && !seen) bus.emit('kart:shrink', { id: v.id, seconds });
    return ok;
  }

  // ---- v2 instant effects --------------------------------------------------------------------------------
  _bsod(user, def) {
    const k = user.kart;
    const e = this._spawn('bsod', user, 'blast');
    e.pos.copy(k.pos); e.radius = def.radius;
    for (const v of this.race.racers) {
      if (v === user || v.finished) continue;
      const b = v.kart;
      const dx = b.pos.x - k.pos.x, dz = b.pos.z - k.pos.z;
      if (dx * dx + dz * dz > def.radius * def.radius || Math.abs(b.pos.y - k.pos.y) > 25) continue;
      if (this.strike(v, user.id, 'bsod', def.spin, 'bsod') === STRIKE.HIT) this._screen(v, 'bsod', def.screenSeconds);
    }
  }

  _forcePush(user, def) {
    const k = user.kart;
    const ring = this._spawn('forcepush', user, 'blast');
    ring.pos.copy(k.pos); ring.radius = def.radius;
    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw), rx = -fz, rz = fx;
    for (const v of this.race.racers) {
      if (v === user || v.finished) continue;
      const b = v.kart;
      let dx = b.pos.x - k.pos.x, dz = b.pos.z - k.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > def.radius || Math.abs(b.pos.y - k.pos.y) > 6 || (b.status.respawning ?? 0) > 0) continue;
      if (v.fibre > 0 || v.sudo > 0) { bus.emit('item:block', { id: v.id, item: 'forcepush', byId: user.id, isPlayer: v.isPlayer, kind: 'ghost' }); continue; }
      // sideways: keep the sideways part of the outward direction, damp the forward part
      const n = d > 1e-3 ? 1 / d : 0;
      dx *= n; dz *= n;
      let side = dx * rx + dz * rz;
      const along = dx * fx + dz * fz;
      if (Math.abs(side) < 0.35) side = side < 0 ? -0.35 : 0.35 * (side === 0 ? (v.gridIndex % 2 ? -1 : 1) : 1);
      let ox = rx * side + fx * along * 0.4, oz = rz * side + fz * along * 0.4;
      const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      const mag = def.impulse * (1 - 0.65 * d / def.radius) / (b.scale > 1 ? b.scale * b.scale : 1);
      b.vel.x += ox * mag; b.vel.z += oz * mag;
      b.pos.x += ox * 0.35; b.pos.z += oz * 0.35;
      if (typeof b.addImpulse === 'function' && false) b.addImpulse(ox * mag, 0, oz * mag);
      const m = Math.hypot(b.vel.x, b.vel.z);
      b.speed = (b.vel.x * Math.sin(b.yaw) + b.vel.z * Math.cos(b.yaw)) >= 0 ? m : -m;
      bus.emit('item:hit', { victimId: v.id, byId: user.id, item: 'forcepush', push: true });
      bus.emit('sfx', { name: 'item-hit-forcepush', pos: b.pos.clone() });
    }
    // items are bumped away too
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const o = this.entities[i];
      if (!o || o === ring || (o.ownerId === user.id && o.age < 0.35)) continue;
      const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > def.radius) continue;
      this._pushEntity(o, user, dx, dz, d, def);
    }
  }

  _pushEntity(o, user, dx, dz, d, def) {
    const n = d > 1e-3 ? 1 / d : 0;
    let ux = dx * n, uz = dz * n;
    if (d <= 1e-3) { ux = Math.sin(user.kart.yaw); uz = Math.cos(user.kart.yaw); }
    switch (o.type) {
      case 'ping': {
        const sp = Math.max(Math.hypot(o.vel.x, o.vel.z), ITEM_DEFS[o.type].speed * 0.9);
        o.vel.x = ux * sp; o.vel.z = uz * sp; o.yaw = Math.atan2(ux, uz);
        o.ownerId = user.id; o.age = 0; o.bounces = 0;
        bus.emit('item:deflect', { entityId: o.id, type: o.type, byId: user.id, pos: o.pos.clone() });
        break;
      }
      case 'traceroute': case 'kernel_panic': case 'sniffer': case 'pod': case 'pigeon': case 'fetch':
        bus.emit('item:deflect', { entityId: o.id, type: o.type, byId: user.id, pos: o.pos.clone(), destroyed: true });
        bus.emit('sfx', { name: 'item-hit', pos: o.pos.clone(), volume: 0.6, pitch: 1.4 });
        this.remove(o);
        break;
      case 'cable': case 'poo':
        o.state = 'thrown'; o.age = Math.min(o.age, 1);
        o.vel.set(ux * def.itemPush, def.itemPush * 0.55, uz * def.itemPush);
        bus.emit('item:deflect', { entityId: o.id, type: o.type, byId: user.id, pos: o.pos.clone() });
        break;
      default: break;
    }
  }

  // ---- statuses ------------------------------------------------------------------------------------------
  /** Sets the on-screen flag for the human ('bsod' | 'splat'). */
  _screen(r, kind, seconds) {
    if (!r.isPlayer) return;
    const s = r._sfx;
    s.kind = kind; s.t = seconds; s.dur = seconds;
    r.screenFx = s;
  }

  /** Called by Race just before `kart.update` (after the racer's input is written). */
  beforeKart(r, dt) {
    if (!r._itemsInit) this.ensure(r);
    const k = r.kart, inp = r.lastInput;
    if (r.slickT > 0 && k.grounded && k.status.invincible <= 0) {
      const g = k.ground;
      if (g.surface === 'road' || g.surface === 'kerb') g.surface = 'oil';        // physics reads grip from the last ground query
    }
    if (r.giant > 0 || r.giantScale > 1.05) inp.steer = clamp(inp.steer * ITEM_DEFS.autoscale.steerMul, -1, 1);
    if (r.potato > 0 && !r.isPlayer && !(r.fibre > 0)) this._potatoSeek(r, inp);
    if (r.zoomies > 0 && !(r.fibre > 0)) {
      // keen, slightly erratic steering; the wobble is dropped beside a void edge and for a human who is steering hard already
      const zd = ITEM_DEFS.zoomies, edge = this._voidEdge(k);
      inp.steer = clamp(inp.steer * zd.steerMul + (edge ? 0 : Math.sin(this.race.simTime * 9.7 + r.gridIndex * 1.9) * zd.wobble * (1 - Math.min(1, Math.abs(inp.steer)))), -1, 1);
    }
    if (r.startled > 0 && !(r.fibre > 0)) inp.steer = clamp(inp.steer + Math.sin(this.race.simTime * 17 + r.gridIndex * 2.3) * ITEM_DEFS.woof.wobble * Math.min(1, r.startled / 0.5), -1, 1);
    if (!r.isPlayer && r.splat > 0) {                                   // a splatted AI driver swerves about half blind
      inp.steer = clamp(inp.steer + Math.sin(this.race.simTime * 7.3 + r.gridIndex * 2.1) * SPLAT_JITTER, -1, 1);
      inp.throttle *= 0.93;
    }
  }

  /** Called by Race right after `kart.update`: scale, speed caps, kept boosts. */
  afterKart(r, dt) {
    if (!r._itemsInit) this.ensure(r);
    const k = r.kart;
    // giant scale (physics resets `scale` every step, so we re-assert it here)
    const gd = ITEM_DEFS.autoscale;
    const target = r.giant > 0 ? gd.scale : 1;
    if (r.giantScale !== target) {
      r.giantScale = damp(r.giantScale, target, gd.growRate, dt);
      if (Math.abs(r.giantScale - target) < 0.005) r.giantScale = target;
    }
    if (r.giantScale > 1.001 && !(k.status.stun > 0)) { k.scale = Math.max(k.scale, r.giantScale); k.radius = CFG.kart.radius * k.scale; }
    // zoomies keep their boost alive (a spin ends them: the boost is cancelled by the spin itself)
    if (r.zoomies > 0 && k.status.spin <= 0) {
      const zd = ITEM_DEFS.zoomies;
      if (k.boost.time < 0.3) k.boost.time = 0.3;
      if (k.boost.power < zd.boostPower) k.boost.power = zd.boostPower;
    }
    // speed caps: stink cloud, capacitor charge, giant weight
    let frac = 1;
    if (r.stinkT > 0) frac = Math.min(frac, ITEM_DEFS.poo.stinkSlow);
    if (r.charging) frac = Math.min(frac, ITEM_DEFS.capacitor.slow);
    if (r.giant > 0) frac = Math.min(frac, gd.speedFrac);
    if (frac < 1 && k.grounded) {
      const cap = Math.max(4, (k.maxSpeed || 30) * frac);
      const vx = k.vel.x, vz = k.vel.z, m = Math.hypot(vx, vz);
      if (m > cap) {
        const nm = Math.max(cap, m - (40 + 3 * (m - cap)) * dt);
        const s = nm / m;
        k.vel.x *= s; k.vel.z *= s;
        k.speed = k.speed >= 0 ? nm : -nm;
      }
    }
  }

  /** Clears timed statuses when a racer finishes. */
  onFinish(r) {
    if (!r._itemsInit) return;
    r.zoomies = 0; r.startled = 0; r.stinkT = 0;
    r.giant = 0; r.splat = 0; r.slickT = 0; r.pods = 0;
    r.potato = 0; r.charging = false; r.chargeT = 0;
    if (r.trailId) { const t = this.findEntity(r.trailId); if (t) this.remove(t); r.trailId = 0; r.trailT = 0; }
    r.screenFx = null;
    r.item = null; r.item2 = null; r.itemRoulette = null;      // a finished racer holds nothing (both slots; the HUD clears)
  }

  // ---- spawning entities -------------------------------------------------------------------------------
  _spawn(type, owner, state) {
    const e = this._pool.pop() ?? makeEntity();
    e.id = this._nextId++; e.type = type; e.ownerId = owner.id; e.state = state; e.alive = true;
    e.radius = ITEM_DEFS[type]?.radius ?? 1; e.targetId = null;
    e.age = 0; e.bounces = 0; e.dir = 1; e.prog = 0; e.lat = 0; e.yaw = owner.kart.yaw;
    e.aux = 0; e.aux2 = 0; e.colour = 0; e.kartId = ''; e.index = 0; e.hits = 0; e.stamp = 0;
    e.vel.set(0, 0, 0);
    this.entities.push(e);
    if (type === 'legacy') this.shieldCount++;
    return e;
  }

  /** Removes an entity (emits `item:expire`). */
  remove(e) {
    const i = this.entities.indexOf(e);
    if (i < 0) return;
    const last = this.entities.pop();
    if (last !== e) this.entities[i] = last;
    e.alive = false;
    if (e.type === 'legacy') this.shieldCount--;
    if (e.type === 'legacy' && e.state === 'trail') this._trailEnded(e);
    this._pool.push(e);
    bus.emit('item:expire', { entityId: e.id });
  }

  _groundY(x, z, fallbackY) {
    const q = this._q;
    this._p.set(x, fallbackY + 2, z);
    this.track.query(this._p, q);
    return q.inVoid || !Number.isFinite(q.height) ? fallbackY : q.height;
  }

  _spawnCable(r, thrown) {
    const def = ITEM_DEFS.cable, k = r.kart;
    _fwd.set(Math.sin(k.yaw), 0, Math.cos(k.yaw));
    const e = this._spawn('cable', r, thrown ? 'thrown' : 'armed');
    const dist = k.radius + (thrown ? 2.2 : def.dropBehind);
    const sgn = thrown ? 1 : -1;
    const x = k.pos.x + _fwd.x * dist * sgn, z = k.pos.z + _fwd.z * dist * sgn;
    e.pos.set(x, this._groundY(x, z, k.pos.y) + 0.4, z);
    if (thrown) e.vel.set(_fwd.x * (Math.max(k.speed, 0) + def.throwSpeed), def.throwLift, _fwd.z * (Math.max(k.speed, 0) + def.throwSpeed));
  }

  /** Spill / zero-day: dropped behind (or lobbed ahead). Both start `armed` (the mine is inert until `arming` seconds pass). */
  _spawnDrop(r, type, thrown) {
    const def = ITEM_DEFS[type], k = r.kart;
    _fwd.set(Math.sin(k.yaw), 0, Math.cos(k.yaw));
    const e = this._spawn(type, r, thrown ? 'thrown' : 'armed');
    const dist = k.radius + (thrown ? 2.2 : def.dropBehind);
    const sgn = thrown ? 1 : -1;
    const x = k.pos.x + _fwd.x * dist * sgn, z = k.pos.z + _fwd.z * dist * sgn;
    const lift = type === 'spill' ? 0.06 : 0.35;
    e.pos.set(x, this._groundY(x, z, k.pos.y) + lift, z);
    e.aux = lift;
    if (thrown) e.vel.set(_fwd.x * (Math.max(k.speed, 0) + def.throwSpeed), def.throwLift, _fwd.z * (Math.max(k.speed, 0) + def.throwSpeed));
  }

  _spawnPing(r, dir) {
    const def = ITEM_DEFS.ping, k = r.kart;
    _fwd.set(Math.sin(k.yaw) * dir, 0, Math.cos(k.yaw) * dir);
    const e = this._spawn('ping', r, 'flying');
    const d = k.radius + 1.6;
    e.pos.set(k.pos.x + _fwd.x * d, k.pos.y + def.hover, k.pos.z + _fwd.z * d);
    e.vel.set(_fwd.x * def.speed, 0, _fwd.z * def.speed);
    e.yaw = Math.atan2(_fwd.x, _fwd.z);
  }

  /** Traceroute: chases the racer directly ahead (or behind). Kernel panic: chases the leader. Sniffer: the racer worth robbing. */
  _spawnHoming(r, type, dir, target) {
    const def = ITEM_DEFS[type], k = r.kart;
    const e = this._spawn(type, r, 'seek');
    e.targetId = target ? target.id : null; e.dir = dir; e.prog = r.progress + dir * 2; e.lat = k.ground.lateral;
    e.pos.copy(k.pos); e.pos.y += type === 'kernel_panic' ? def.altitude : def.hover;
    e.yaw = k.yaw;
  }

  /**
   * Deploys the pod cluster: three pods orbit as a shield. The item stays in slot 1 (count = pods left, locked against swapping)
   * so the use button can launch them one at a time; it leaves the slot when the last pod is gone.
   */
  _deployPods(r, it, def) {
    const k = r.kart;
    r.pods = def.count; r.podTime = def.seconds;
    it.live = true; it.count = r.pods;
    bus.emit('item:use', { id: r.id, item: 'pods', pos: k.pos.clone(), isPlayer: r.isPlayer, aimBack: false });
    bus.emit('sfx', { name: 'item-use-pods', pos: k.pos.clone() });
    return true;
  }

  /** Keeps the slot that shows the pod cluster in step with the pods left: the count follows, the slot empties with the last pod. */
  _syncPods(r) {
    const it = r.item;
    if (!it || it.id !== 'pods' || !it.live) return;
    if (r.pods > 0) it.count = r.pods; else this._promote(r);
  }

  /** Fires one pod from the orbiting cluster as a homing projectile. */
  _firePod(r, aimBack) {
    const def = ITEM_DEFS.pod, k = r.kart;
    r.pods -= 1;
    if (r.pods <= 0) { r.pods = 0; r.podTime = 0; bus.emit('item:end', { id: r.id, item: 'pods', isPlayer: r.isPlayer }); }
    this._syncPods(r);
    const dir = aimBack ? -1 : 1;
    const target = this._neighbour(r, dir);
    bus.emit('item:use', { id: r.id, item: 'pods', pos: k.pos.clone(), isPlayer: r.isPlayer, fire: true, aimBack });
    bus.emit('sfx', { name: 'item-use-pods', pos: k.pos.clone() });
    const e = this._spawn('pod', r, 'seek');
    e.targetId = target ? target.id : null; e.dir = dir; e.prog = r.progress + dir * 2; e.lat = k.ground.lateral;
    e.pos.copy(k.pos); e.pos.y += def.hover + 0.6;
    e.yaw = k.yaw;
    return true;
  }

  _spawnPigeon(r, dir) {
    const def = ITEM_DEFS.pigeon, k = r.kart;
    const e = this._spawn('pigeon', r, 'fly');
    e.dir = dir; e.prog = r.progress + dir * 3; e.lat = k.ground.lateral; e.aux = 0;
    e.pos.copy(k.pos); e.pos.y += def.hover;
    e.yaw = k.yaw + (dir < 0 ? Math.PI : 0);
  }

  /** The nearest unfinished racer ahead (dir 1) or behind (dir -1) by race order. */
  _neighbour(r, dir) {
    let best = null;
    for (const o of this.race.racers) {
      if (o === r || o.finished) continue;
      if (dir > 0 ? o.place >= r.place : o.place <= r.place) continue;
      if (!best || (dir > 0 ? o.place > best.place : o.place < best.place)) best = o;
    }
    return best;
  }

  /** Sniffer target: the closest racer ahead (within three places) that is holding something, else the racer directly ahead. */
  _sniffTarget(r) {
    const direct = this._neighbour(r, 1);
    if (!direct) return null;
    let best = null;
    for (const o of this.race.racers) {
      if (o === r || o.finished || o.place >= r.place || r.place - o.place > 3 || !o.item) continue;
      if (!best || o.place > best.place) best = o;
    }
    return best ?? direct;
  }

  /** First place, or the best rival when the user is first themselves. */
  _leaderFor(user) {
    let best = null;
    for (const o of this.race.racers) {
      if (o === user || o.finished) continue;
      if (!best || o.place < best.place) best = o;
    }
    return best;
  }

  // ---- hostile hits ------------------------------------------------------------------------------------
  /**
   * The single route for every hostile item hit. Applies sudo/fibre/pods/firewall rules, then spins the victim.
   * @param {object} victim Racer
   * @param {string} byId id of the racer responsible
   * @param {string} itemId item id used in events (`item:hit` / `item:block`)
   * @param {number} spinSeconds spin-out duration (0 to only test blocking, e.g. outage)
   * @param {string} cause cause string passed to `kart.spinOut`
   * @param {boolean} [noSpin] true: only run the block checks (caller applies the effect on HIT)
   * @returns {'hit'|'blocked'|'ignored'}
   */
  strike(victim, byId, itemId, spinSeconds, cause, noSpin = false) {
    if (victim.finished) return STRIKE.IGNORED;
    const k = victim.kart;
    if (victim.sudo > 0 || victim.fibre > 0) {
      bus.emit('item:block', { id: victim.id, item: itemId, byId, isPlayer: victim.isPlayer, kind: 'sudo' });
      return STRIKE.BLOCKED;
    }
    if (victim.giant > 0 && itemId === 'outage') {
      bus.emit('item:block', { id: victim.id, item: itemId, byId, isPlayer: victim.isPlayer, kind: 'giant' });
      return STRIKE.BLOCKED;
    }
    if (victim.pods > 0) {
      victim.pods--;
      if (victim.pods <= 0) { victim.pods = 0; victim.podTime = 0; }
      this._syncPods(victim);
      bus.emit('item:block', { id: victim.id, item: itemId, byId, isPlayer: victim.isPlayer, kind: 'pods' });
      bus.emit('item:shield-break', { id: victim.id, kind: 'pods', pods: victim.pods, isPlayer: victim.isPlayer });
      return STRIKE.BLOCKED;
    }
    if (victim.shield) {
      victim.shield = false; victim.shieldTime = 0;
      bus.emit('item:block', { id: victim.id, item: itemId, byId, isPlayer: victim.isPlayer, kind: 'firewall' });
      bus.emit('item:shield-break', { id: victim.id, kind: 'firewall', isPlayer: victim.isPlayer });
      return STRIKE.BLOCKED;
    }
    if (k.status.invincible > 0 || k.status.spin > 0.5) return STRIKE.IGNORED;
    if (!noSpin && !k.spinOut(spinSeconds, cause)) return STRIKE.IGNORED;
    bus.emit('item:hit', { victimId: victim.id, byId, item: itemId });
    bus.emit('sfx', { name: `item-hit-${itemId}`, pos: k.pos.clone() });
    return STRIKE.HIT;
  }

  // ---- per-step update ---------------------------------------------------------------------------------
  /** @param {number} dt fixed step in seconds */
  update(dt) {
    const racers = this.race.racers;
    for (const r of racers) {
      if (!r._itemsInit) this.ensure(r);
      if (r.itemRoulette) this._stepRoulette(r, dt);
      if (r.shield && (r.shieldTime -= dt) <= 0) { r.shield = false; r.shieldTime = 0; }
      if (r.sudo > 0) r.sudo = Math.max(0, r.sudo - dt);
      if (r.sudoImmune > 0) r.sudoImmune = Math.max(0, r.sudoImmune - dt);
      if (r.stompImmune > 0) r.stompImmune = Math.max(0, r.stompImmune - dt);
      this._tickStatuses(r, dt);
      if (r.potatoNo > 0) r.potatoNo = Math.max(0, r.potatoNo - dt);
      if (r.charging) this._tickCharge(r, dt);
    }
    for (const r of racers) {
      if (r.finished) continue;
      if (r.potato > 0) this._tickPotato(r, dt);
      if (r.sudo > 0) this._sudoShove(r);
      if (r.giant > 0) this._giantStomp(r);
    }
    const tick = ++this._tick;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (!e || e.stamp === tick) continue;     // removed mid-loop, or already stepped after a swap-remove
      e.stamp = tick;
      stepEntity(this, e, dt);
    }
  }

  _tickCharge(r, dt) {
    const d = ITEM_DEFS.capacitor, st = r.kart.status;
    if (r.item?.id !== 'capacitor' || r.finished || st.spin > 0 || (st.respawning ?? 0) > 0) { r.charging = false; r.chargeT = 0; r._chargeZone = ''; return; }
    r.chargeT += dt;
    if (r.chargeT >= d.overload) { this._overload(r); return; }
    const z = this.chargeZone(r.chargeT);
    if (z !== r._chargeZone) {
      r._chargeZone = z;
      bus.emit('item:charge', { id: r.id, zone: z, isPlayer: r.isPlayer });
      if (z === 'sweet') bus.emit('sfx', { name: 'item-charge-ready', pos: r.kart.pos.clone() });
    }
  }

  _end(r, item) { bus.emit('item:end', { id: r.id, item, isPlayer: r.isPlayer }); }

  _tickStatuses(r, dt) {
    const k = r.kart;
    if (r.fibre > 0) {
      r.fibre -= dt;
      if (r.fibre <= 0) { r.fibre = 0; k.status.autopilot = false; }
    }
    if (r.giant > 0) { r.giant -= dt; if (r.giant <= 0) { r.giant = 0; this._end(r, 'autoscale'); } }
    if (r.splat > 0) { r.splat -= dt; if (r.splat <= 0) { r.splat = 0; this._end(r, 'pigeon'); } }
    if (r.zoomies > 0) { r.zoomies -= dt; if (r.zoomies <= 0) { r.zoomies = 0; this._end(r, 'zoomies'); } }
    if (r.startled > 0) r.startled = Math.max(0, r.startled - dt);
    if (r.stinkT > 0) r.stinkT = Math.max(0, r.stinkT - dt);
    if (r.slickT > 0) r.slickT = Math.max(0, r.slickT - dt);
    if (r.pods > 0) {
      r.podTime -= dt;
      if (r.podTime <= 0) { r.pods = 0; r.podTime = 0; this._syncPods(r); this._end(r, 'pods'); bus.emit('item:shield-break', { id: r.id, kind: 'pods', pods: 0, expired: true, isPlayer: r.isPlayer }); }
    }
    if (r.screenFx) {
      r._sfx.t -= dt;
      if (r._sfx.t <= 0) { r._sfx.t = 0; r.screenFx = null; }
    }
  }

  /** Sudo: rivals touching a sudo racer are knocked aside. */
  _sudoShove(user) {
    const def = ITEM_DEFS.sudo, a = user.kart;
    for (const v of this.race.racers) {
      if (v === user || v.finished || v.sudoImmune > 0) continue;
      const b = v.kart;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const reach = a.radius + b.radius + def.hitRadius;
      const d2 = dx * dx + dz * dz;
      if (d2 > reach * reach || Math.abs(b.pos.y - a.pos.y) > 2.5) continue;
      v.sudoImmune = def.hitCooldown;
      const d = Math.sqrt(d2) || 1;
      if (this.strike(v, user.id, 'sudo', def.spin, 'sudo') === STRIKE.HIT) {
        b.pos.x += (dx / d) * def.shove; b.pos.z += (dz / d) * def.shove;
      }
    }
  }

  /** Autoscale: rivals touched by the giant are spun; hazards under it are flattened (see itemEntities). */
  _giantStomp(user) {
    const def = ITEM_DEFS.autoscale, a = user.kart;
    for (const v of this.race.racers) {
      if (v === user || v.finished || v.stompImmune > 0) continue;
      const b = v.kart;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const reach = a.radius + b.radius + 0.3;
      const d2 = dx * dx + dz * dz;
      if (d2 > reach * reach || Math.abs(b.pos.y - a.pos.y) > 3.5) continue;
      v.stompImmune = def.stompCooldown;
      const d = Math.sqrt(d2) || 1;
      if (this.strike(v, user.id, 'autoscale', def.stompSpin, 'autoscale') === STRIKE.HIT) {
        b.pos.x += (dx / d) * 1.1; b.pos.z += (dz / d) * 1.1;
        bus.emit('item:stomp', { id: user.id, victimId: v.id });
      }
    }
  }

  /** Drops every world item (race end / restart). */
  clear() {
    while (this.entities.length) this.remove(this.entities[this.entities.length - 1]);
  }

  dispose() { this.entities.length = 0; this._pool.length = 0; this.shieldCount = 0; }
}
