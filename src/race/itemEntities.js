// Per-type behaviour of world item entities. Called by ItemManager.update().
//   straight projectiles: ping (+ a hurled legacy server)   homing missiles: traceroute, kernel_panic, sniffer, pod (follow the ROAD SPLINE until close)
//   static hazards: cable, spill, zeroday          flier: pigeon          timed visual effects: bsod, forcepush, woof, ...
//   Biscuit-only: poo (hazard, leaves a stink cloud), stink (slowing cloud), stick (fetch: homing out, boomerang back), woof (ring effect)
//   skill items: bolt (charged capacitor shot, can pierce), legacy (trailing shield that can be hurled), cronjob (blast ring only)
// Homing items follow the road spline (track.sample) until close, then lock on directly, so they are robust on any track shape
// (hairpins, loops, ramps) without needing navigation. Force push repels them (see ItemManager).
import { CFG } from '../core/config.js';
import { bus } from '../core/bus.js';
import { clamp, wrapS } from '../core/util.js';
import { ITEM_DEFS, STRIKE } from './itemDefs.js';

/** Lifetime of the purely visual "effect" entities (seconds). */
const FX_LIFE = { bsod: 1.0, forcepush: 0.7, woof: ITEM_DEFS.woof.ringSeconds };
const MISSILES = { traceroute: 1, kernel_panic: 1, sniffer: 1, pod: 1 };

/**
 * Advances one entity by one fixed step.
 * @param {import('./ItemManager.js').ItemManager} m
 * @param {object} e entity
 * @param {number} dt seconds
 */
export function stepEntity(m, e, dt) {
  switch (e.type) {
    case 'cable': stepCable(m, e, dt); break;
    case 'ping': stepStraight(m, e, dt); break;
    case 'traceroute': case 'kernel_panic': case 'sniffer': case 'pod':
      if (e.state === 'blast') stepBlast(m, e, dt, ITEM_DEFS.kernel_panic.blastSeconds); else stepHoming(m, e, dt);
      break;
    case 'pigeon': stepPigeon(m, e, dt); break;
    case 'bolt': stepBolt(m, e, dt); break;
    case 'legacy': if (e.state === 'trail') stepTrail(m, e, dt); else stepStraight(m, e, dt); break;
    case 'cronjob': stepBlast(m, e, dt, ITEM_DEFS.cronjob.blastSeconds); break;
    case 'poo': stepPoo(m, e, dt); break;
    case 'stink': stepStink(m, e, dt); break;
    case 'fetch': stepStick(m, e, dt); break;
    case 'spill': stepSpill(m, e, dt); break;
    case 'zeroday': if (e.state === 'blast') stepBlast(m, e, dt, ITEM_DEFS.zeroday.blastSeconds); else stepMine(m, e, dt); break;
    default:
      if (FX_LIFE[e.type]) stepFx(m, e, dt);
      else m.remove(e);
  }
}

// ---- shared helpers --------------------------------------------------------------------------------------------

/** Horizontal overlap between an entity and a kart, with a vertical tolerance. */
function touching(e, r, tol = 3) {
  const k = r.kart;
  const dx = k.pos.x - e.pos.x, dz = k.pos.z - e.pos.z, R = e.radius + k.radius;
  return dx * dx + dz * dz < R * R && Math.abs(k.pos.y - e.pos.y) < tol;
}

/** A giant kart flattens whatever static hazard it drives over. */
function flattened(m, e) {
  for (const r of m.race.racers) {
    if (!(r.giant > 0) || r.finished) continue;
    const k = r.kart, dx = k.pos.x - e.pos.x, dz = k.pos.z - e.pos.z, R = e.radius + k.radius * 0.9;
    if (dx * dx + dz * dz < R * R && Math.abs(k.pos.y - e.pos.y) < 3) {
      bus.emit('item:flatten', { entityId: e.id, type: e.type, id: r.id, pos: e.pos.clone() });
      bus.emit('sfx', { name: 'item-hit-autoscale', pos: e.pos.clone() });
      m.remove(e);
      return true;
    }
  }
  return false;
}

/** A towed legacy server soaks up a projectile and falls apart. */
function breakLegacy(m, p, byId, item) {
  const o = m.race.byId.get(p.ownerId);
  bus.emit('item:block', { id: p.ownerId, item, byId, isPlayer: !!o?.isPlayer, kind: 'legacy' });
  bus.emit('sfx', { name: 'item-block', pos: p.pos.clone() });
  m.remove(p);
}

/** Does a hostile projectile touch someone else's towed legacy server? The server falls apart and the projectile is consumed. */
function hitShield(m, e) {
  for (let i = 0; i < m.entities.length; i++) {
    const p = m.entities[i];
    if (p.type !== 'legacy' || p.state !== 'trail' || p.ownerId === e.ownerId) continue;
    const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z, R = p.radius + e.radius;
    if (dx * dx + dz * dz < R * R && Math.abs(p.pos.y - e.pos.y) < 3) {
      breakLegacy(m, p, e.ownerId, e.type);
      m.remove(e); return true;
    }
  }
  return false;
}

/** Tests an entity against every unfinished racer; consumes it on a hit or a block. */
function tryHit(m, e, def) {
  if (m.shieldCount > 0 && hitShield(m, e)) return true;
  for (const r of m.race.racers) {
    if (r.finished) continue;
    if (r.id === e.ownerId && e.age < def.ownerGrace) continue;
    if (!touching(e, r)) continue;
    const res = m.strike(r, e.ownerId, e.type, def.spin, e.type);
    if (res !== STRIKE.IGNORED) { m.remove(e); return true; }
  }
  return false;
}

/** Track obstacles (`track.obstacles`): returns the first active one the entity overlaps. */
function obstacleAt(m, e) {
  const obs = m.race.obstacles;
  if (!obs) return null;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (!o.active) continue;
    const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, R = (o.radius ?? 1) + e.radius;
    if (dx * dx + dz * dz < R * R && Math.abs(e.pos.y - o.pos.y) < 4) return o;
  }
  return null;
}

/** Lands a thrown static hazard. Returns true while it is still in the air. */
function stepThrown(m, e, dt, lift) {
  e.vel.y -= CFG.gravity * dt;
  e.pos.addScaledVector(e.vel, dt);
  const pen = m.track.collideWalls(e.pos, e.radius, m._n);
  if (pen > 0) { e.pos.addScaledVector(m._n, pen); e.vel.x = 0; e.vel.z = 0; }
  const gy = m._groundY(e.pos.x, e.pos.z, e.pos.y) + lift;
  if (e.vel.y < 0 && e.pos.y <= gy) { e.pos.y = gy; e.vel.set(0, 0, 0); e.state = 'armed'; return false; }
  return true;
}

// ---- cable ------------------------------------------------------------------------------------------------------

function stepCable(m, e, dt) {
  const def = ITEM_DEFS.cable;
  e.age += dt;
  if (e.age > def.lifetime) { m.remove(e); return; }
  if (e.state === 'thrown') stepThrown(m, e, dt, 0.4);
  if (flattened(m, e)) return;
  tryHit(m, e, def);
}

// ---- straight projectiles ---------------------------------------------------------------------------------------

function stepStraight(m, e, dt) {
  const def = ITEM_DEFS[e.type];
  e.age += dt;
  if (e.age > def.lifetime) { m.remove(e); return; }
  e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
  const gy = m._groundY(e.pos.x, e.pos.z, e.pos.y - (def.hover ?? 0.6));
  e.pos.y = gy + def.hover;
  const pen = m.track.collideWalls(e.pos, e.radius, m._n);
  if (pen > 0) {
    if (!bounceOff(m, e, def, m._n.x, m._n.z, pen)) return;
  }
  const o = obstacleAt(m, e);
  if (o) {
    bus.emit('item:obstacle', { entityId: e.id, type: e.type, pos: e.pos.clone() });
    bus.emit('sfx', { name: 'item-hit', pos: e.pos.clone(), volume: 0.5, pitch: 1.3 });
    m.remove(e);
    return;
  }
  // weapons interact: packets shatter cables; anything armed-mine-sized detonates a zero-day
  for (let i = m.entities.length - 1; i >= 0; i--) {
    const c = m.entities[i];
    if (c === e) continue;
    if (c.type === 'cable' && (c.state === 'armed' || c.state === 'thrown')) {
      const dx = c.pos.x - e.pos.x, dz = c.pos.z - e.pos.z, R = c.radius + e.radius;
      if (dx * dx + dz * dz < R * R) {
        bus.emit('sfx', { name: 'item-hit', pos: c.pos.clone() });
        m.remove(c);
        m.remove(e); return;
      }
    } else if (c.type === 'zeroday' && c.state === 'armed') {
      const dx = c.pos.x - e.pos.x, dz = c.pos.z - e.pos.z, R = c.radius + e.radius;
      if (dx * dx + dz * dz < R * R) { blastMine(m, c); m.remove(e); return; }
    }
  }
  tryHit(m, e, def);
}

/** Reflects a straight projectile off a wall / obstacle. Returns false when it has run out of bounces (and was removed). */
function bounceOff(m, e, def, nx, nz, pen) {
  e.pos.x += nx * pen; e.pos.z += nz * pen;
  const d = e.vel.x * nx + e.vel.z * nz;
  if (d < 0) { e.vel.x -= 2 * d * nx; e.vel.z -= 2 * d * nz; }
  if (e.bounces >= (e.type === 'bolt' ? e.index : def.bounces)) { m.remove(e); return false; }      // the contact after the last bounce ends it
  e.bounces++;
  e.yaw = Math.atan2(e.vel.x, e.vel.z);
  bus.emit('sfx', { name: 'wall-hit', pos: e.pos.clone(), volume: 0.4, pitch: 1.6 });
  return true;
}

// ---- homing missiles --------------------------------------------------------------------------------------------

const _lockPos = { x: 0, y: 0, z: 0 };

function stepHoming(m, e, dt) {
  const def = ITEM_DEFS[e.type];
  e.age += dt;
  const blind = e.targetId === null;                       // a traceroute fired by the leader: no target, it just runs the road
  const target = blind ? null : m.race.byId.get(e.targetId);
  if (e.age > def.lifetime || (!blind && (!target || target.finished))) { m.remove(e); return; }
  const panic = e.type === 'kernel_panic';
  const alt = panic ? def.altitude : def.hover;
  const kt = target?.kart;
  let tProg = 0, tLat = 0;
  if (target) { tProg = target.progress; tLat = kt.ground.lateral; }
  if (e.state === 'seek') {
    e.prog += e.dir * def.speed * dt;
    const has = target;
    const gap = has ? e.dir * (tProg - e.prog) : Infinity;
    const sm = m.track.sample(wrapS(e.prog, m.track.length), m._sm);
    const maxLat = Math.max(0, (sm.width ?? 18) / 2 - 1.5);
    if (has) e.lat += (clamp(tLat, -maxLat, maxLat) - e.lat) * Math.min(1, def.latRate * dt);
    e.pos.copy(sm.pos).addScaledVector(sm.right, e.lat);
    e.pos.y += alt;
    e.yaw = Math.atan2(sm.tangent.x * e.dir, sm.tangent.z * e.dir);
    if (gap <= def.lockRange) e.state = 'lock';
    else if (has && gap < -(def.overshoot ?? 30)) { m.remove(e); return; }
  } else {
    _lockPos.x = kt.pos.x; _lockPos.y = kt.pos.y + 0.8; _lockPos.z = kt.pos.z;
    const dx = _lockPos.x - e.pos.x, dy = _lockPos.y - e.pos.y, dz = _lockPos.z - e.pos.z;
    const dist = Math.hypot(dx, dy, dz) || 1e-6;
    const step = Math.min(dist, def.speed * dt);
    e.pos.x += (dx / dist) * step; e.pos.y += (dy / dist) * step; e.pos.z += (dz / dist) * step;
    e.yaw = Math.atan2(dx, dz);
  }
  if (panic) {
    for (const r of m.race.racers) {
      if (r.finished || (r.id === e.ownerId && e.age < def.ownerGrace)) continue;
      if (r.id !== e.ownerId && touching(e, r)) { blast(m, e, def); return; }
    }
  } else if (e.type === 'sniffer') {
    if (target && touching(e, target)) { m.sniff(e, target); m.remove(e); }
  } else tryHit(m, e, def);
}

/** Kernel panic detonation: ring effect on every racer within `ringRadius`; the owner is exempt. */
function blast(m, e, def) {
  e.state = 'blast'; e.age = 0; e.vel.set(0, 0, 0); e.radius = def.ringRadius;
  bus.emit('sfx', { name: 'explosion', pos: e.pos.clone() });
  for (const r of m.race.racers) {
    if (r.finished || r.id === e.ownerId) continue;
    const k = r.kart;
    const dx = k.pos.x - e.pos.x, dz = k.pos.z - e.pos.z;
    if (dx * dx + dz * dz > def.ringRadius * def.ringRadius || Math.abs(k.pos.y - e.pos.y) > 10) continue;
    m.strike(r, e.ownerId, 'kernel_panic', def.spin, 'kernel_panic');
  }
  shatterCables(m, e, def.ringRadius);
}

function shatterCables(m, e, radius) {
  for (let i = m.entities.length - 1; i >= 0; i--) {
    const o = m.entities[i];
    if (o.type !== 'cable') continue;
    const dx = o.pos.x - e.pos.x, dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz < radius * radius) m.remove(o);
  }
}

function stepBlast(m, e, dt, life) {
  e.age += dt;
  if (e.age >= life) m.remove(e);
}

// ---- skill items ------------------------------------------------------------------------------------------------

/** Charged capacitor shot: straight, bounces `e.index` times, a perfect charge pierces `e.prog` racers. `e.aux2` is the spin time. */
function stepBolt(m, e, dt) {
  const def = ITEM_DEFS.bolt;
  e.age += dt;
  if (e.age > def.lifetime) { m.remove(e); return; }
  e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
  e.pos.y = m._groundY(e.pos.x, e.pos.z, e.pos.y - def.hover) + def.hover;
  const pen = m.track.collideWalls(e.pos, e.radius, m._n);
  if (pen > 0 && !bounceOff(m, e, def, m._n.x, m._n.z, pen)) return;
  const o = obstacleAt(m, e);
  if (o) {
    bus.emit('item:obstacle', { entityId: e.id, type: e.type, pos: e.pos.clone() });
    bus.emit('sfx', { name: 'item-hit', pos: e.pos.clone(), volume: 0.5, pitch: 1.3 });
    m.remove(e);
    return;
  }
  for (let i = m.entities.length - 1; i >= 0; i--) {
    const c = m.entities[i];
    if (c === e) continue;
    const near = (R) => { const dx = c.pos.x - e.pos.x, dz = c.pos.z - e.pos.z; return dx * dx + dz * dz < R * R; };
    if (c.type === 'cable' && (c.state === 'armed' || c.state === 'thrown') && near(c.radius + e.radius)) m.remove(c);
    else if (c.type === 'zeroday' && c.state === 'armed' && near(c.radius + e.radius)) { blastMine(m, c); m.remove(e); return; }
  }
  if (m.shieldCount > 0 && hitShield(m, e)) return;
  for (const r of m.race.racers) {
    if (r.finished || r.id === e.targetId) continue;
    if (r.id === e.ownerId && e.age < def.ownerGrace) continue;
    if (!touching(e, r)) continue;
    const res = m.strike(r, e.ownerId, 'capacitor', e.aux2, 'capacitor');
    if (res === STRIKE.IGNORED) continue;
    e.targetId = r.id;                               // never hits the same racer twice
    if (e.prog > 0) { e.prog--; continue; }
    m.remove(e);
    return;
  }
}

/** A legacy server towed behind its owner: swings on a rope, soaks up projectiles, rams anyone who tailgates. */
function stepTrail(m, e, dt) {
  const def = ITEM_DEFS.legacy;
  const o = m.race.byId.get(e.ownerId);
  e.age += dt;
  if (!o || o.finished || o.trailId !== e.id || e.age >= def.seconds) { m.remove(e); return; }
  o.trailT = def.seconds - e.age;
  const k = o.kart, d = def.trailDist * Math.max(1, k.scale || 1);
  const tx = k.pos.x - Math.sin(k.yaw) * d, tz = k.pos.z - Math.cos(k.yaw) * d;
  const f = Math.min(1, def.follow * dt);
  e.pos.x += (tx - e.pos.x) * f; e.pos.z += (tz - e.pos.z) * f;
  e.pos.y += (m._groundY(e.pos.x, e.pos.z, k.pos.y) + 0.7 - e.pos.y) * Math.min(1, 14 * dt);
  const sx = e.pos.x - k.pos.x, sz = e.pos.z - k.pos.z;
  e.yaw = Math.atan2(sx, sz);                        // points away from the kart: the rope end swings with the corner
  e.vel.set(0, 0, 0);
  for (const r of m.race.racers) {
    if (r.finished || r === o || !touching(e, r)) continue;
    const res = m.strike(r, e.ownerId, 'legacy', def.ramSpin, 'legacy');
    if (res !== STRIKE.IGNORED) { m.remove(e); return; }
  }
}

// ---- pigeon -----------------------------------------------------------------------------------------------------

function stepPigeon(m, e, dt) {
  const def = ITEM_DEFS.pigeon;
  e.age += dt;
  if (e.age > def.lifetime || e.aux >= def.distance) {
    bus.emit('sfx', { name: 'item-hit', pos: e.pos.clone(), volume: 0.35, pitch: 1.8 });
    m.remove(e);
    return;
  }
  const step = def.speed * dt;
  e.prog += e.dir * step; e.aux += step;
  const sm = m.track.sample(wrapS(e.prog, m.track.length), m._sm);
  const maxLat = Math.max(0, (sm.width ?? 18) / 2 - 1.5);
  // fly the road, drifting towards the nearest racer ahead of it (so "the first racer it passes" is usually a direct hit)
  let near = null, nd = 60;
  for (const r of m.race.racers) {
    if (r.finished || r.id === e.ownerId) continue;
    const d = e.dir * (r.progress - e.prog);
    if (d > -2 && d < nd) { nd = d; near = r; }
  }
  if (near) e.lat += (clamp(near.kart.ground.lateral, -maxLat, maxLat) - e.lat) * Math.min(1, def.latRate * dt);
  e.pos.copy(sm.pos).addScaledVector(sm.right, e.lat);
  const swoop = near ? clamp(nd / 25, 0, 1) : 1;
  e.pos.y += 1.5 + (def.hover - 1.5) * swoop + Math.sin(e.age * 9) * 0.15;
  e.yaw = Math.atan2(sm.tangent.x * e.dir, sm.tangent.z * e.dir);
  // splat the first racer it flies over
  for (const r of m.race.racers) {
    if (r.finished || r.id === e.ownerId) continue;
    const k = r.kart, dx = k.pos.x - e.pos.x, dz = k.pos.z - e.pos.z, d2 = dx * dx + dz * dz;
    const passR = k.radius + def.radius + def.passLateral * 1.6;
    if (d2 > passR * passR || Math.abs(k.pos.y - e.pos.y) > 5) continue;
    const direct = d2 < (k.radius + def.radius) * (k.radius + def.radius);
    const res = m.strike(r, e.ownerId, 'pigeon', direct ? def.spin : 0, 'pigeon', !direct);
    if (res === STRIKE.IGNORED) continue;
    if (res === STRIKE.HIT) { r.splat = def.splatSeconds; m._screen(r, 'splat', def.splatSeconds); bus.emit('item:splat', { id: r.id, direct, isPlayer: r.isPlayer, pos: k.pos.clone() }); }
    m.remove(e);
    return;
  }
}

// ---- puddle -----------------------------------------------------------------------------------------------------

function stepSpill(m, e, dt) {
  const def = ITEM_DEFS.spill;
  e.age += dt;
  if (e.age > def.lifetime) { m.remove(e); return; }
  if (e.state === 'thrown') stepThrown(m, e, dt, e.aux);
  if (flattened(m, e)) return;
  if (e.state === 'thrown') return;
  for (const r of m.race.racers) {
    if (r.finished) continue;
    const k = r.kart, dx = k.pos.x - e.pos.x, dz = k.pos.z - e.pos.z;
    const inside = dx * dx + dz * dz < (def.radius + k.radius * 0.5) * (def.radius + k.radius * 0.5) && Math.abs(k.pos.y - e.pos.y) < 2.5;
    if (!inside) { if (r._spillId === e.id) r._spillId = 0; continue; }
    if (k.status.invincible > 0 || r.sudo > 0 || r.fibre > 0 || !k.grounded) continue;
    if (r.id === e.ownerId && e.age < def.ownerGrace) continue;      // the dropper drives clear of their own puddle
    r.slickT = def.linger;
    if (r._spillId !== e.id) {
      r._spillId = e.id;
      if (r.id !== e.ownerId || e.age > def.ownerGrace) {
        bus.emit('item:hit', { victimId: r.id, byId: e.ownerId, item: 'spill', slick: true });
        bus.emit('sfx', { name: 'item-hit-spill', pos: k.pos.clone() });
      }
    }
  }
}

// ---- zero-day mine ----------------------------------------------------------------------------------------------

function stepMine(m, e, dt) {
  const def = ITEM_DEFS.zeroday;
  e.age += dt;
  if (e.age > def.lifetime) { m.remove(e); return; }
  if (e.state === 'thrown') { stepThrown(m, e, dt, e.aux); if (e.state === 'armed') e.age = 0; return; }
  if (flattened(m, e)) return;
  if (e.age < def.arming) return;                       // inert while arming: nobody can set it off
  for (const r of m.race.racers) {
    if (r.finished) continue;
    if (touching(e, r)) { blastMine(m, e); return; }
  }
}

/** Zero-day detonation: a large ring. Nobody is exempt (arming already protects the owner). */
function blastMine(m, e) {
  const def = ITEM_DEFS.zeroday;
  e.state = 'blast'; e.age = 0; e.vel.set(0, 0, 0); e.radius = def.blastRadius;
  bus.emit('sfx', { name: 'explosion', pos: e.pos.clone() });
  bus.emit('item:blast', { entityId: e.id, item: 'zeroday', pos: e.pos.clone(), radius: def.blastRadius });
  for (const r of m.race.racers) {
    if (r.finished) continue;
    const k = r.kart;
    const dx = k.pos.x - e.pos.x, dz = k.pos.z - e.pos.z;
    if (dx * dx + dz * dz > def.blastRadius * def.blastRadius || Math.abs(k.pos.y - e.pos.y) > 8) continue;
    m.strike(r, e.ownerId, 'zeroday', def.spin, 'zeroday');
  }
  shatterCables(m, e, def.blastRadius);
}

// ---- Biscuit-only: poo, stink cloud, fetch stick ---------------------------------------------------------------------

/** A steaming gift on the road: spins out the first kart to drive over it (human: a green smear on the screen), then leaves a stink cloud. */
function stepPoo(m, e, dt) {
  const def = ITEM_DEFS.poo;
  e.age += dt;
  if (e.age > def.lifetime) { m.remove(e); return; }
  if (e.state === 'thrown') stepThrown(m, e, dt, e.aux);
  if (flattened(m, e)) return;
  for (const r of m.race.racers) {
    if (r.finished) continue;
    if (r.id === e.ownerId && e.age < def.ownerGrace) continue;
    if (!touching(e, r)) continue;
    const res = m.strike(r, e.ownerId, 'poo', def.spin, 'poo');
    if (res === STRIKE.IGNORED) continue;
    if (res === STRIKE.HIT) {
      m._screen(r, 'smear', def.smearSeconds);
      bus.emit('item:smear', { id: r.id, isPlayer: r.isPlayer, byId: e.ownerId, pos: r.kart.pos.clone() });
    }
    const c = m._spawn('stink', { id: e.ownerId, kart: { yaw: 0 } }, 'cloud');
    c.pos.copy(e.pos); c.radius = def.stinkRadius;
    m.remove(e);
    return;
  }
}

/** The green cloud a poo leaves: every other kart inside it is slowed a little (`racer.stinkT`, read by `afterKart`). */
function stepStink(m, e, dt) {
  const def = ITEM_DEFS.poo;
  e.age += dt;
  if (e.age >= def.stinkSeconds) { m.remove(e); return; }
  for (const r of m.race.racers) {
    if (r.finished || r.id === e.ownerId || r.fibre > 0 || r.sudo > 0 || r.kart.status.invincible > 0) continue;
    const k = r.kart, dx = k.pos.x - e.pos.x, dz = k.pos.z - e.pos.z, R = e.radius + k.radius * 0.5;
    if (dx * dx + dz * dz > R * R || Math.abs(k.pos.y - e.pos.y) > 3.5) continue;
    if (!(r.stinkT > 0)) bus.emit('item:stink', { id: r.id, isPlayer: r.isPlayer, byId: e.ownerId });
    r.stinkT = 0.3;
  }
}

/** Fetch: a stick that homes on the racer ahead (road spline, then a direct lock), then boomerangs back to its owner. A catch gives a mini boost. */
function stepStick(m, e, dt) {
  const def = ITEM_DEFS.fetch;
  e.age += dt;
  const owner = m.race.byId.get(e.ownerId);
  if (!owner || owner.finished) { m.remove(e); return; }
  if (e.state === 'back') { stickBack(m, e, dt, def, owner); return; }
  const blind = e.targetId === null;                       // fired by the leader: it runs the road for a moment, then comes back
  const target = blind ? null : m.race.byId.get(e.targetId);
  if (e.age > (blind ? def.blindSeconds : def.lifetime) || (!blind && (!target || target.finished))) { stickReturn(m, e, false); return; }
  const kt = target?.kart;
  if (e.state === 'seek') {
    e.prog += e.dir * def.speed * dt;
    const gap = target ? e.dir * (target.progress - e.prog) : Infinity;
    const sm = m.track.sample(wrapS(e.prog, m.track.length), m._sm);
    const maxLat = Math.max(0, (sm.width ?? 18) / 2 - 1.5);
    if (target) e.lat += (clamp(kt.ground.lateral, -maxLat, maxLat) - e.lat) * Math.min(1, def.latRate * dt);
    e.pos.copy(sm.pos).addScaledVector(sm.right, e.lat);
    e.pos.y += def.hover;
    e.yaw = Math.atan2(sm.tangent.x * e.dir, sm.tangent.z * e.dir);
    if (gap <= def.lockRange) e.state = 'lock';
    else if (target && gap < -(def.overshoot ?? 30)) { stickReturn(m, e, false); return; }
  } else {
    const dx = kt.pos.x - e.pos.x, dy = kt.pos.y + 0.8 - e.pos.y, dz = kt.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dy, dz) || 1e-6, step = Math.min(dist, def.speed * dt);
    e.pos.x += (dx / dist) * step; e.pos.y += (dy / dist) * step; e.pos.z += (dz / dist) * step;
    e.yaw = Math.atan2(dx, dz);
  }
  if (m.shieldCount > 0 && hitShield(m, e)) return;           // a towed server eats it: no catch
  for (const r of m.race.racers) {
    if (r.finished || r.id === e.ownerId || !touching(e, r)) continue;
    const res = m.strike(r, e.ownerId, 'fetch', def.spin, 'fetch');
    if (res === STRIKE.IGNORED) continue;
    stickReturn(m, e, res === STRIKE.HIT);
    return;
  }
}

/** Switches a stick to its homeward leg. */
function stickReturn(m, e, hit) {
  e.state = 'back'; e.age = 0; e.vel.set(0, 0, 0); e.aux = hit ? 1 : 0;
  bus.emit('item:fetch', { id: e.ownerId, phase: 'return', hit, pos: e.pos.clone() });
}

function stickBack(m, e, dt, def, owner) {
  const k = owner.kart;
  if (e.age > def.backLifetime) { m.remove(e); return; }
  const dx = k.pos.x - e.pos.x, dy = k.pos.y + 0.9 - e.pos.y, dz = k.pos.z - e.pos.z;
  const dist = Math.hypot(dx, dy, dz) || 1e-6;
  if (dist < def.catchRadius + k.radius) {
    k.applyBoost(def.catchBoost, def.catchSeconds, 'item');
    bus.emit('item:catch', { id: owner.id, isPlayer: owner.isPlayer, hit: !!e.aux, pos: k.pos.clone() });
    bus.emit('sfx', { name: 'item-catch', pos: k.pos.clone() });
    m.remove(e);
    return;
  }
  const step = Math.min(dist, (def.backSpeed + Math.max(0, k.speed)) * dt);
  e.pos.x += (dx / dist) * step; e.pos.y += (dy / dist) * step; e.pos.z += (dz / dist) * step;
  e.yaw = Math.atan2(dx, dz);
}

// ---- timed visual effects -----------------------------------------------------------------------------------------

function stepFx(m, e, dt) {
  e.age += dt;
  if (e.age >= FX_LIFE[e.type]) m.remove(e);
}

export { MISSILES };
