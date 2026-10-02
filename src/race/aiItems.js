// Item decisions for AIDriver: when an AI presses "use" and with which aim. Runs at 10 Hz from AIDriver.update().
import { ITEM_DEFS } from './itemDefs.js';

/**
 * Decides what the AI does with its item slots now: use the front item, swap the queued item forward (it is fired on the next decision),
 * or keep waiting. Two slots: each item is judged by the same rules as before (`evaluate`), the front item first; the queued item
 * is swapped in only when IT is ready and the front one is not. When both slots are full the time-based triggers fire sooner,
 * so the AI does not sit on two items and walk past item boxes it cannot use.
 * @param {import('./AIDriver.js').AIDriver} ai
 * @param {number} dt seconds since the last decision (perception interval)
 * @param {{itemPressed:boolean, aimBack:boolean, aimForward:boolean, swapPressed?:boolean}} actions receives the decision
 */
export function decideItem(ai, dt, actions) {
  const me = ai.racer, race = ai.race, kart = me.kart;
  const it = me.item, it2 = me.item2;
  const held = ai.heldBy ?? (ai.heldBy = Object.create(null));
  // per-item "time held" (by id, so a swap does not reset it); items no longer held are forgotten
  const idle = race.state !== 'racing' || me.finished;
  if (idle || (!it && !it2)) {
    if (!idle && !it && me.pods > 0 && !me.itemRoulette) { decidePods(ai, dt, actions); return; }   // pods still orbiting with an empty slot
    for (const k in held) delete held[k];
    ai.itemHeld = 0; ai.itemHeldId = '';
    return;
  }
  const id1 = it ? it.id : '', id2 = it2 ? it2.id : '';
  for (const k in held) if (k !== id1 && k !== id2) delete held[k];
  if (id1) held[id1] = (held[id1] ?? 0) + dt;
  if (id2 && id2 !== id1) held[id2] = (held[id2] ?? 0) + dt;
  ai.itemHeld = id1 ? held[id1] : 0; ai.itemHeldId = id1;
  if (!it) return;                                                  // slot 1 still rolling
  const pressure = it2 ? 1.7 : 1;
  if (ai.itemCooldown > 0 || kart.status.spin > 0 || (kart.status.respawning ?? 0) > 0) return;
  const ctx = context(ai);
  // ---- front item
  if (held[id1] >= ai.reaction && evaluate(ai, ctx, it, held[id1] * pressure, actions)) { actions.itemPressed = true; return; }
  actions.aimBack = false; actions.aimForward = false;
  // ---- queued item: swap it forward when it is the better call right now (the front one must not be live)
  if (it2 && held[id2] >= ai.reaction && !race.items.swapLocked(me) && (race.simTime - (ai._swapAt ?? -99)) > 1.2) {
    const probe = ai._probe ?? (ai._probe = { itemPressed: false, aimBack: false, aimForward: false });
    probe.aimBack = false; probe.aimForward = false;
    const saved = ai.itemCooldown;
    if (evaluate(ai, ctx, it2, held[id2] * pressure, probe)) { actions.swapPressed = true; ai._swapAt = race.simTime; }
    ai.itemCooldown = saved;                                         // probing must not start a cooldown
  }
}

/**
 * On a track whose road edge is a drop into the void, a boost must run out before the next tight bend. Braking does not work against a boost (it
 * pushes the speed back up), so a kart that is still boosted when it reaches a hairpin (r 40, about 35 m/s at the limit of grip) arrives at 50 m/s and
 * leaves the road, with nothing to stop it. Walled tracks keep the old rules. `seconds` = how long the boost lasts.
 */
function boostClear(c, seconds) {
  const line = c.line, s = c.s;
  if (line.at(line.margin, s) <= 5) return true;
  const reach = seconds * 1.5 * c.kart.maxSpeed + 30;
  for (let d = 0; d <= reach; d += 6) if (Math.abs(line.at(line.lk, s + d)) > 1 / 65) return false;
  return true;
}

/** Situation shared by every item rule (computed once per decision). */
function context(ai) {
  const me = ai.racer, kart = me.kart, line = ai.line, s = kart.ground.s;
  const ahead = ai.aheadR, behind = ai.behindR;
  const straight = line.at(line.straight, s);
  const c = ai._ictx ?? (ai._ictx = {});
  c.kart = kart; c.me = me; c.line = line; c.s = s; c.ahead = ahead; c.behind = behind;
  c.straight = straight;
  c.aimedAhead = !!ahead && ai.aheadDp > 6 && ai.aheadDp < 65 && Math.abs(ai.aheadDLat) < 2.8 && straight > ai.aheadDp * 0.7;
  c.tailgater = !!behind && ai.behindDp > 3 && ai.behindDp < 26 && Math.abs(ai.behindDLat) < 4.5;
  c.aggr = ai.aggression;
  // nothing that spins a kart is fired or dropped around a jump (ours or the target's): one hit on the ramp is a fall into the gap
  c.jumpZone = line.at(line.pinW, s) > 0.02 || (!!ahead && line.at(line.pinW, ahead.kart.ground.s) > 0.02) || (!!behind && line.at(line.pinW, behind.kart.ground.s) > 0.02);
  c.threat = ai.threat || incoming(ai);
  c.near = rivalsNear(ai, 45); c.close = rivalsNear(ai, 14);
  c.notLeader = me.place > 1;
  return c;
}

/**
 * Should the AI use THIS item now? (the per-item rules). Aim flags go to `actions`.
 * @param {object} ai @param {object} c situation from `context` @param {{id:string}} it the item @param {number} held seconds held (scaled up when both slots are full)
 * @param {{aimBack:boolean, aimForward:boolean}} actions
 * @returns {boolean}
 */
function evaluate(ai, c, it, held, actions) {
  const { kart, me, line, ahead, behind, straight, aimedAhead, tailgater, aggr, jumpZone, threat, near, close, notLeader } = c;
  let use = false;
  switch (it.id) {
    case 'espresso': {
      const slow = kart.speed < kart.maxSpeed * 0.7 && held > 1.2;
      use = kart.grounded && kart.boost.time < 0.3 && (slow || (straight > 55 && kart.speed > 12)) && boostClear(c, ITEM_DEFS.espresso.boostSeconds);
      break;
    }
    case 'ping':
      if (jumpZone) break;
      if (aimedAhead) use = true;
      else if (tailgater && !ahead && Math.abs(ai.behindDLat) < 2.6 && aggr > 0.35) { use = true; actions.aimBack = true; }
      else if (held > 18 && ahead) use = true;
      break;
    case 'traceroute':
      if (jumpZone) break;
      use = !!ahead && ai.aheadDp > 10 && ai.aheadDp < 150 && (aggr > 0.3 || held > 2);
      if (!use && held > 16 && ahead) use = true;
      break;
    case 'cable':
      if (jumpZone) break;                                             // never litter the run-up to a jump: one cable there sends a whole pack into the gap
      if (tailgater) { use = true; actions.aimBack = true; }
      else if (ahead && ai.aheadDp > 5 && ai.aheadDp < 13 && Math.abs(ai.aheadDLat) < 2.2 && aggr > 0.6) { use = true; actions.aimForward = true; }
      else if (held > 22) { use = true; actions.aimBack = true; }
      break;
    case 'firewall':
      use = threat || held > 16;
      break;
    case 'sudo':
      use = held > 2.5 || (!!ahead && ai.aheadDp < 80) || !!(behind && ai.behindDp < 20);
      break;
    case 'fibre':
      use = kart.grounded && held > 0.6 && (straight < 160 || held > 5) && boostClear(c, ITEM_DEFS.fibre.seconds);
      break;
    case 'outage':
      use = (ai.racersAhead >= 2 || (ai.racersAhead >= 1 && held > 6)) && held > 1;
      break;
    case 'kernel_panic':
      if (jumpZone) break;
      use = notLeader && held > 1.0;
      break;
    case 'sniffer':
      if (jumpZone) break;
      use = !!ahead && ai.aheadDp < 120 && (held > 1.2 || !!ahead.item);
      break;
    case 'bsod':
      use = (near >= 2 && held > 0.8) || (near >= 1 && held > 7) || held > 25;
      break;
    case 'autoscale':                                                  // heavy and clumsy: only on a long straight, near traffic
      use = kart.grounded && held > 1.5 && straight > 90 && (near >= 1 || held > 8);
      break;
    case 'spill':
      if (jumpZone) break;
      if (tailgater) { use = true; actions.aimBack = true; }
      else if (ahead && ai.aheadDp > 5 && ai.aheadDp < 14 && Math.abs(ai.aheadDLat) < 2.5 && aggr > 0.5) { use = true; actions.aimForward = true; }
      else if (held > 14) { use = true; actions.aimBack = true; }
      break;
    case 'zeroday':                                                    // a mine is armed after 5 s: drop it anywhere on a clear stretch
      if (jumpZone) break;
      if (tailgater || (held > 6 && straight > 50)) { use = true; actions.aimBack = true; }
      else if (held > 20) { use = true; actions.aimBack = true; }
      break;
    case 'pods':
      if (me.pods > 0 && it.live && me.item === it) use = podsReady(ai, c, actions);   // out already: launch them
      else use = held > 0.8;                                           // the shield goes up at once
      break;
    case 'forcepush':
      use = (close >= 1 && held > 0.5) || (threat && held > 0.3) || held > 25;
      break;
    case 'pigeon':
      if (jumpZone) break;
      use = (!!ahead && ai.aheadDp < 200 && (aggr > 0.25 || held > 2)) || held > 12;
      break;
    // ---- skill items
    case 'capacitor':
      if (me.charging) {
        // release inside the sweet spot; weaker drivers wobble around it (some overload attempts, some early taps)
        const d = ITEM_DEFS.capacitor;
        const goal = (d.sweetMin + d.sweetMax) / 2 + (1 - ai.skill) * 1.4 * Math.sin(ai.index * 2.7 + held * 0.37);
        use = me.chargeT >= Math.min(goal, d.overload - 0.35);
        if (!use && ahead && ai.aheadDp < 14 && me.chargeT > d.sweetMin) use = true;      // target about to be passed: fire now
        if (use && tailgater && !aimedAhead && Math.abs(ai.behindDLat) < 3.5) actions.aimBack = true;
      } else {
        if (jumpZone) break;
        use = aimedAhead || (tailgater && aggr > 0.5) || held > 10;
      }
      break;
    case 'legacy':
      if (me.trailId) {
        // hurl it at whoever is ahead, or before it expires
        if (jumpZone) break;
        use = aimedAhead || me.trailT < 2.5 || (held > 5 && ahead && ai.aheadDp < 40);
      } else use = tailgater || threat || held > 3;
      break;
    case 'cronjob':                                                    // light it only with rivals in reach to pass it to
      use = (near >= 1 && held > 1) || held > 8;
      break;
    // ---- Biscuit-only items
    case 'poo':                                                        // a hazard like the cable: never in a jump run-up
      if (jumpZone) break;
      if (tailgater) { use = true; actions.aimBack = true; }
      else if (ahead && ai.aheadDp > 5 && ai.aheadDp < 14 && Math.abs(ai.aheadDLat) < 2.5 && aggr > 0.5) { use = true; actions.aimForward = true; }
      else if (held > 16) { use = true; actions.aimBack = true; }
      break;
    case 'woof': {                                                     // shoves sideways: not near a jump, and beside a drop into the void only to swat an incoming shot
      if (jumpZone) break;
      const edge = line.at(line.margin, c.s) > 5;
      use = (threat && held > 0.3) || (!edge && ((close >= 1 && held > 0.5) || held > 25));
      break;
    }
    case 'zoomies':                                                    // a boost with twitchy steering: open, clear road only
      use = kart.grounded && !jumpZone && kart.boost.time < 0.3 && held > 0.6 && (straight > 70 || held > 6) && boostClear(c, ITEM_DEFS.zoomies.seconds);
      break;
    case 'fetch':                                                      // homing, like the traceroute
      if (jumpZone) break;
      use = !!ahead && ai.aheadDp > 8 && ai.aheadDp < 140 && (aggr > 0.3 || held > 2);
      if (!use && held > 16 && ahead) use = true;
      break;
    default: break;
  }
  return use;
}

/** Pods orbiting an AI (still in slot 1): launch one at a racer ahead in range (or behind), or spend them before they time out. */
function podsReady(ai, c, actions) {
  const me = c.me, ahead = c.ahead, behind = c.behind;
  if (c.jumpZone) return false;
  let use = false;
  if (ahead && ai.aheadDp > 8 && ai.aheadDp < 70 && me.pods > 0 && (c.threat ? me.pods > 1 : true)) use = true;
  else if (behind && ai.behindDp < 22 && me.pods > 1 && ai.aggression > 0.5) { use = true; actions.aimBack = true; }
  else if (me.podTime < 2.5) use = true;
  if (use) ai.itemCooldown = 0.9;
  return use;
}

/** Any hostile projectile that is flying at this AI that the base "threat" test does not know about (sniffer, pods, bolts, a hurled legacy server...). */
export function incoming(ai) {
  const me = ai.racer, kart = me.kart;
  const ents = ai.race.items?.entities;
  if (!ents) return false;
  for (const e of ents) {
    if (e.ownerId === me.id) continue;
    const t = e.type;
    if (t === 'bolt' || (t === 'legacy' && e.state === 'flying')) {
      const dx = kart.pos.x - e.pos.x, dz = kart.pos.z - e.pos.z, d2 = dx * dx + dz * dz;
      if (d2 > 45 * 45 || e.vel.x * dx + e.vel.z * dz <= 0) continue;
      const cross = Math.abs((e.vel.x * dz - e.vel.z * dx) / (Math.hypot(e.vel.x, e.vel.z) || 1));
      if (cross < 6 && d2 > 16) return true;
    } else if ((t === 'pod' || t === 'sniffer' || (t === 'fetch' && e.state !== 'back')) && e.targetId === me.id) {
      const dx = kart.pos.x - e.pos.x, dz = kart.pos.z - e.pos.z;
      if (dx * dx + dz * dz < 110 * 110) return true;
    }
  }
  return false;
}

/** Number of unfinished rivals within `range` metres (horizontal, similar height). */
export function rivalsNear(ai, range) {
  const kart = ai.racer.kart, r2 = range * range, list = ai.race.racers;
  let n = 0;
  if (!list || !kart.pos) return 0;
  for (const o of list) {
    if (o === ai.racer || o.finished) continue;
    const dx = o.kart.pos.x - kart.pos.x, dz = o.kart.pos.z - kart.pos.z;
    if (dx * dx + dz * dz < r2 && Math.abs(o.kart.pos.y - kart.pos.y) < 8) n++;
  }
  return n;
}

/** Pods orbiting an AI: launch one at a racer ahead in range (or behind), or spend them before they time out. */
function decidePods(ai, dt, actions) {
  const me = ai.racer, kart = me.kart;
  ai.itemHeld += dt;
  if (ai.itemHeld < ai.reaction || ai.itemCooldown > 0 || kart.status.spin > 0) return;
  const line = ai.line, s = kart.ground.s;
  const jumpZone = line.at(line.pinW, s) > 0.02;
  const ahead = ai.aheadR, behind = ai.behindR;
  let use = false;
  if (!jumpZone) {
    if (ahead && ai.aheadDp > 8 && ai.aheadDp < 70 && me.pods > 0 && (ai.threat ? me.pods > 1 : true)) use = true;
    else if (behind && ai.behindDp < 22 && me.pods > 1 && ai.aggression > 0.5) { use = true; actions.aimBack = true; }
    else if (me.podTime < 2.5) use = true;
  }
  if (use) { actions.itemPressed = true; ai.itemCooldown = 0.9; } else { actions.aimBack = false; actions.aimForward = false; }
}
