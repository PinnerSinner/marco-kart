// Rampable traffic (Need-for-Speed style): hit the REAR of a slower vehicle fast and lined up and the kart is launched up its tail ramp and
// over the roof, landing on the road beyond. Side hits and slow hits keep the normal bump / spin (Race._stepObstacles).
//
//   // in a track's dress(kit): create the vehicle the usual way, then register it (works headless)
//   const bus = kit.obstacles.path({ id: 'bus-slow', points, speed: 7.2, mode: 'cross', length: 10.4, radius: 2, hit: 'bump', mesh });
//   installVehicleRamps(kit).add({ id: 'bus-slow', path: bus, speed: 7.2, length: 10.4, width: 2.5, height: 4.4 });
//   // visuals: a sloped yellow/black tail ramp behind the rear, or a chevron bumper on small vehicles
//   geo.merge(rearRampGeo({ width: 3.2, rear: -5.2, run: 6, rise: 1.5 }));
//
// How it works: `installVehicleRamps` chains `track.updateKart(kart, dt, race)` (Race calls it for every kart right after the kart's own
// step and BEFORE the obstacle test), so a launch can pre-empt the obstacle collision. A kart is launched when, in the vehicle's frame,
//   * it is grounded, not spinning, and the vehicle is on the road (active),
//   * it is within `run` metres behind the rear edge, inside the vehicle's width (+ `laneMargin`),
//   * its velocity points within 35 degrees of the vehicle's heading and its speed is at least 60 % of its current top speed,
//   * planVehicleJump() finds a launch that is above the roof (+ clearance) over the whole body, and
//   * the predicted landing is on the road (inside the width, near the launch height, clear of other obstacles).
// It then calls `kart.launch(vy, { source: 'vehicle' })` (the perfect-takeoff boost is KartPhysics' job), pushes the forward speed up by a few
// percent, gives the racer a collision cooldown against the vehicle's obstacle circles, and emits bus `kart:vehicle-jump { id, vehicleId, speed }`.
// REWARD for the stunt: when the kart is in the air past the vehicle's front edge it is "cleared": bus `traffic:jumped { id, vehicleId, isPlayer,
// height, pos }` fires once, a sparkle burst + trail flies with the kart (visual, pooled), and on touching down the kart gets a small pad-style
// boost (VEHICLE_JUMP.reward*). Crossing vehicles (side-on) are not rampable: only along-road traffic is registered.
import * as THREE from 'three';
import { bus } from '../../../../core/bus.js';
import { CFG } from '../../../../core/config.js';
import { Geo } from '../../Geo.js';

/** Tunables of the vehicle jump. Distances in metres, speeds in m/s. */
export const VEHICLE_JUMP = {
  minSpeedFrac: 0.6,                      // kart speed / kart.maxSpeed needed to launch
  maxAngle: (35 * Math.PI) / 180,         // velocity vs the vehicle's heading
  laneMargin: 0.6,                        // m beyond the vehicle's half width that still counts as "lined up"
  run: 6,                                 // default length of the visible tail ramp (the launch happens up to `run + 3` m behind the rear)
  leadMin: 0.5, leadPerClosing: 0.36,     // takeoff distance behind the rear = clamp(0.36 * closing speed, run + 0.5, run + 3) m (never inside the painted ramp)
  clearance: 0.7,                         // m between the kart's base and the roof at the closest
  tail: 1.8,                              // m of kart body that must still be above the roof past the front edge
  maxVy: 34,                              // m/s: a launch needing more than this is refused (too slow / too tall): the hit bumps as before
  speedPush: 1.05,                        // forward speed multiplier at takeoff
  landMargin: 2.2,                        // m: the landing point must be this far inside the road edge
  landHeight: 2.6,                        // m: the landing ground may differ from the launch ground by this much
  cooldown: 0.9,                          // s of immunity to the vehicle's circles after the landing
  rewardPower: 0.8, rewardSeconds: 1.0,   // pad-style boost paid on touching down after clearing the vehicle
  clearHeight: 1.0,                       // m the kart base must be above the road past the front edge for the jump to count as cleared
};

const COS = (a) => Math.cos(a);

/**
 * Pure launch geometry. The kart leaves the ground `gap` m behind the rear edge at `closing` m/s relative to the vehicle with vertical
 * speed `vy`; its base is above the roof (+ clearance) for the whole body, plus `tail` metres past the front.
 * @param {{ closing:number, gap:number, length:number, height:number, clearance?:number, tail?:number, maxVy?:number, gravity?:number }} p
 *   closing = kart speed along the vehicle's heading minus the vehicle's speed; gap = rear edge distance at takeoff (> 0)
 * @returns {{ vy:number, flight:number, apex:number, landAhead:number, tRear:number, tFront:number }|null} null when no launch below `maxVy` clears it.
 *   `flight` is the level-ground flight time; `landAhead` = metres beyond the FRONT edge the kart lands (relative to the vehicle).
 */
export function planVehicleJump(p) {
  const g = p.gravity ?? CFG.gravity, cl = p.clearance ?? VEHICLE_JUMP.clearance, tail = p.tail ?? VEHICLE_JUMP.tail, maxVy = p.maxVy ?? VEHICLE_JUMP.maxVy;
  if (!(p.closing > 1) || !(p.gap > 0.2) || !(p.length > 0) || !(p.height >= 0)) return null;
  const H = p.height + cl, need = (t) => H / t + 0.5 * g * t;       // vertical speed that puts the kart exactly at H after t seconds
  const tRear = p.gap / p.closing, tFront = (p.gap + p.length + tail) / p.closing;
  const vy = Math.max(need(tRear), need(tFront)) * 1.03;
  if (!(vy <= maxVy)) return null;
  const flight = (2 * vy) / g;
  return { vy, flight, apex: (vy * vy) / (2 * g), landAhead: p.closing * flight - p.gap - p.length, tRear, tFront };
}

const _q = { height: 0, normal: new THREE.Vector3(), surface: '', onRoad: false, s: 0, lateral: 0, inVoid: false };
const _p = new THREE.Vector3();

/**
 * Where does a launch land, and is that road? Flies the kart in a straight horizontal line (with the physics' air drag) and samples the
 * road at the landing point and three points on the way.
 * @returns {boolean}
 */
export function landsOnRoad(track, pos, vel, vy, baseY, ignore = null) {
  const g = CFG.gravity, drag = 0.05, sp = Math.hypot(vel.x, vel.z);
  if (!(sp > 1e-3)) return false;
  const ux = vel.x / sp, uz = vel.z / sp;
  const at = (t) => (sp * (1 - Math.exp(-drag * t))) / drag;            // horizontal distance flown after t seconds
  let T = (2 * vy) / g;
  for (let it = 0; it < 3; it++) {                                        // landing time over the actual landing height
    const d = at(T); _p.set(pos.x + ux * d, baseY + 6, pos.z + uz * d);
    const h = track.query(_p, _q).height;
    const disc = vy * vy - 2 * g * (h - baseY);
    if (!(disc > 0)) return false;
    T = (vy + Math.sqrt(disc)) / g;
  }
  const W = VEHICLE_JUMP;
  for (const f of [0.35, 0.65, 1]) {
    const d = at(T * f); _p.set(pos.x + ux * d, baseY + 6, pos.z + uz * d);
    track.query(_p, _q, undefined);
    if (!_q.onRoad || _q.inVoid) return false;
    if (Math.abs(_q.lateral) > track.widthAt(_q.s) / 2 - W.landMargin) return false;
    if (f === 1) {
      if (Math.abs(_q.height - baseY) > W.landHeight) return false;
      for (const o of track.obstacles) {                                  // never land in another vehicle or a barrier
        if (!o.active || (ignore && ignore.has(o))) continue;
        const dx = o.pos.x - _p.x, dz = o.pos.z - _p.z, r = o.radius + 1.6;
        if (dx * dx + dz * dz < r * r) return false;
      }
    }
  }
  return true;
}

/** Registry of rampable vehicles for one track. Create with installVehicleRamps(kit). */
export class VehicleRamps {
  /** @param {object} track */
  constructor(track) {
    this.track = track;
    this.vehicles = [];
    this.time = 0;
    this.jumps = 0;
    this.cleared = 0;
    this._frameT = NaN;
    this._cosMax = COS(VEHICLE_JUMP.maxAngle);
    this._idx = new Map();                                                // race.obstacles -> Map(entry -> index)
    this.flights = new Map();                                             // kart id -> { v, t, cleared }
    this.sparkles = null;                                                 // visual pool (set by installVehicleRamps, null headless)
  }

  /**
   * Register a vehicle made with `kit.obstacles.path`.
   * @param {{ id:string, path:{ position:(t:number)=>{x:number,z:number,yaw:number,active:boolean}, entries:object[] }, speed:number,
   *   length:number, width:number, height:number, run?:number, enabled?:boolean }} v
   *   speed = m/s while driving (the path's own speed); length / width / height = the visible body in metres; run = tail ramp length
   * @returns {object} the registered record (`enabled` may be toggled at run time)
   */
  add(v) {
    const rec = { run: VEHICLE_JUMP.run, enabled: true, ...v, frame: { x: 0, z: 0, fx: 0, fz: 1, rx: -1, rz: 0, active: false, y: 0 }, entrySet: new Set(v.path.entries) };
    this.vehicles.push(rec);
    return rec;
  }

  _refresh() {
    for (const v of this.vehicles) {
      const st = v.path.position(this.time), f = v.frame;
      f.x = st.x; f.z = st.z; f.active = st.active && v.enabled;
      f.fx = Math.sin(st.yaw); f.fz = Math.cos(st.yaw); f.rx = -f.fz; f.rz = f.fx;
      f.y = v.path.entries[0]?.pos.y ?? 0;
    }
    this._frameT = this.time;
  }

  /**
   * Called for every kart each fixed step (through `track.updateKart`). Launches the kart over a vehicle when the conditions in the file
   * header hold. Returns the vehicle id it launched over, or null.
   * @param {object} kart KartPhysics @param {number} dt @param {object} [race] Race (for the collision cooldown)
   */
  update(kart, dt, race) {
    const list = this.vehicles;
    if (this.flights.size) this._flight(kart, dt);
    if (!list.length || !kart.pos || kart.status?.spin > 0 || kart._fallen) return null;
    if (!(kart.grounded || kart.pos.y - (kart.ground?.height ?? kart.pos.y) < 0.35)) return null;
    if (this._frameT !== this.time) this._refresh();
    const vel = kart.vel, sp = Math.hypot(vel.x, vel.z), W = VEHICLE_JUMP;
    if (!(sp > 5) || sp < W.minSpeedFrac * (kart.maxSpeed || 30)) return null;
    for (let i = 0; i < list.length; i++) {
      const v = list[i], f = v.frame;
      if (!f.active) continue;
      const dx = kart.pos.x - f.x, dz = kart.pos.z - f.z;
      const gap = -(dx * f.fx + dz * f.fz) - v.length / 2;                 // m behind the rear edge
      if (gap > v.run + 3 || gap < 0.3) continue;
      if (Math.abs(dx * f.rx + dz * f.rz) > v.width / 2 + W.laneMargin) continue;
      const cosA = (vel.x * f.fx + vel.z * f.fz) / sp;
      if (cosA < this._cosMax || Math.abs(kart.pos.y - f.y) > 2.5) continue;
      const closing = sp * cosA - v.speed;
      if (gap > Math.min(Math.max(W.leadPerClosing * closing, v.run + W.leadMin), v.run + 3)) continue;   // faster karts take off a little earlier: the arc stays tame
      const plan = planVehicleJump({ closing, gap, length: v.length, height: v.height });
      if (!plan || !landsOnRoad(this.track, kart.pos, vel, plan.vy, kart.ground?.height ?? f.y, v.entrySet)) continue;
      this._launch(kart, v, plan, sp, race);
      return v.id;
    }
    return null;
  }

  _launch(kart, v, plan, sp, race) {
    kart.launch(plan.vy, { source: 'vehicle' });
    const k = Math.min(VEHICLE_JUMP.speedPush, (kart.maxSpeed * 1.15) / Math.max(sp, 1));
    if (k > 1) { kart.vel.x *= k; kart.vel.z *= k; kart.speed *= k; }
    this.jumps++;
    const racer = race?.byId?.get(kart.id);
    if (racer?.obstacleCd && race.obstacles) {
      let map = this._idx.get(race.obstacles);
      if (!map) { map = new Map(race.obstacles.map((o, j) => [o, j])); this._idx.set(race.obstacles, map); }
      const cd = plan.flight + VEHICLE_JUMP.cooldown;
      for (const e of v.path.entries) { const j = map.get(e); if (j !== undefined && racer.obstacleCd[j] < cd) racer.obstacleCd[j] = cd; }
    }
    this.flights.set(kart.id, { v, t: 0, cleared: false });
    bus.emit('kart:vehicle-jump', { id: kart.id, vehicleId: v.id, speed: kart.speed });
  }

  /** Follow a launched kart: announce the clear jump when it is past the front edge, pay the boost on touchdown. */
  _flight(kart, dt) {
    const fl = this.flights.get(kart.id);
    if (!fl) return;
    fl.t += dt;
    const v = fl.v, f = v.frame, air = !kart.grounded && fl.t > 0.05;
    if (air && this.sparkles && fl.t < 4) this.sparkles.trail(kart.pos.x, kart.pos.y + 0.3, kart.pos.z, !!kart.isPlayer);
    if (!fl.cleared && air) {
      const u = (kart.pos.x - f.x) * f.fx + (kart.pos.z - f.z) * f.fz;
      if (u > v.length / 2 + 0.2 && kart.pos.y - (kart.ground?.height ?? f.y) > VEHICLE_JUMP.clearHeight) {
        fl.cleared = true; this.cleared++;
        bus.emit('traffic:jumped', { id: kart.id, vehicleId: v.id, isPlayer: !!kart.isPlayer, height: kart.pos.y - f.y, pos: { x: kart.pos.x, y: kart.pos.y, z: kart.pos.z } });
        this.sparkles?.burst(kart.pos.x, kart.pos.y + 0.4, kart.pos.z);
      }
    }
    if (fl.t > 0.25 && kart.grounded) {                                   // touched down
      if (fl.cleared) { kart.applyBoost?.(VEHICLE_JUMP.rewardPower, VEHICLE_JUMP.rewardSeconds, 'pad'); this.sparkles?.burst(kart.pos.x, kart.pos.y + 0.4, kart.pos.z, 10); }
      this.flights.delete(kart.id);
    } else if (fl.t > 4 || kart._fallen) this.flights.delete(kart.id);
  }
}

/**
 * Make the track's `updateKart` hook launch karts over registered vehicles. Safe to call more than once (returns the same registry).
 * Also records the animation clock the vehicles' positions are a function of.
 * @param {object} kit the track kit @returns {VehicleRamps} also available as `track.vehicleRamps`
 */
export function installVehicleRamps(kit) {
  const track = kit.track;
  if (track.vehicleRamps) return track.vehicleRamps;
  const reg = new VehicleRamps(track);
  track.vehicleRamps = reg;
  kit.animate((dt, t) => { reg.time = t; });
  if (!kit.headless) { reg.sparkles = makeSparkles(kit); kit.animate((dt) => reg.sparkles.update(dt)); }
  const prev = track.updateKart;
  track.updateKart = (kart, dt, race) => { prev?.(kart, dt, race); reg.update(kart, dt, race); };
  return reg;
}

// ---------------------------------------------------------------------------------------------------------------- visual cues
const RAMP_YELLOW = 0xf4b60f, RAMP_BLACK = 0x17171b;

/**
 * A sloped hazard-striped tail ramp (local frame: origin on the ground under the vehicle's centre, +Z forward). It rises from the road
 * `run` metres behind the rear face to `rise` metres at the rear face. Purely visual: the launch is scripted from the same numbers.
 * @param {{ width:number, rear:number, run?:number, rise?:number, stripes?:number, colours?:[number, number] }} o
 *   rear = z of the rear face (negative); `width` is the ramp width (vehicle width + ~0.8)
 * @returns {Geo}
 */
export function rearRampGeo(o) {
  const g = new Geo(), run = o.run ?? VEHICLE_JUMP.run, rise = o.rise ?? 1.4, hw = o.width / 2, n = o.stripes ?? Math.max(4, Math.round(run / 0.75));
  const [c0, c1] = o.colours ?? [RAMP_YELLOW, RAMP_BLACK], z1 = o.rear, z0 = z1 - run, col = new THREE.Color();
  const len = Math.hypot(run, rise), nx = 0, ny = run / len, nz = -rise / len;      // slope normal (up and back)
  const y = (z) => 0.03 + rise * ((z - z0) / run);
  for (let i = 0; i < n; i++) {
    const za = z0 + (run * i) / n, zb = z0 + (run * (i + 1)) / n, c = col.set(i % 2 ? c1 : c0);
    const a = g.vert(-hw, y(za), za, nx, ny, nz, 0, 0, c.r, c.g, c.b), b = g.vert(hw, y(za), za, nx, ny, nz, 1, 0, c.r, c.g, c.b);
    const d = g.vert(hw, y(zb), zb, nx, ny, nz, 1, 1, c.r, c.g, c.b), e = g.vert(-hw, y(zb), zb, nx, ny, nz, 0, 1, c.r, c.g, c.b);
    g.quad(a, b, d, e);
  }
  for (const sx of [-1, 1]) {                                                       // side cheeks, closed triangles
    const x = sx * hw, c = col.set(0x2b2d33);
    const a = g.vert(x, 0.03, z0, sx, 0, 0, 0, 0, c.r, c.g, c.b), b = g.vert(x, y(z1), z1, sx, 0, 0, 1, 1, c.r, c.g, c.b), d = g.vert(x, 0.03, z1, sx, 0, 0, 1, 0, c.r, c.g, c.b);
    if (sx > 0) g.tri(a, b, d); else g.tri(a, d, b);
  }
  g.box(o.width, 0.12, 0.3, { z: z1 - 0.05, y: rise - 0.02, colour: RAMP_BLACK, ao: 0 });   // lip bar where the ramp meets the body
  return g;
}

/** A yellow-and-black chevron bumper bar across the rear of a small vehicle (taxi, van): the "hit me fast" cue. */
export function chevronBumperGeo({ width, z, y = 0.3, height = 0.34 }) {
  const g = new Geo(), n = Math.max(4, Math.round(width / 0.4));
  for (let i = 0; i < n; i++) g.box(width / n, height, 0.14, { x: -width / 2 + (width * (i + 0.5)) / n, y, z, colour: i % 2 ? RAMP_BLACK : RAMP_YELLOW, ao: 0 });
  return g;
}

// ---------------------------------------------------------------------------------------------------------------- reward sparkles
/** A pooled additive point cloud: `burst` (ring of sparks) and `trail` (one spark per call), purely visual, ~64 points. */
export function makeSparkles(kit, N = 96) {
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.name = 'vehicle-sparkles';
  kit.add(pts);
  const PAL = [0xffd166, 0xfff3b0, 0x22d3ee, 0xff7f11], c = new THREE.Color();
  let head = 0;
  const spawn = (x, y, z, vx, vy, vz, life0, k) => {
    const i = head; head = (head + 1) % N;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz; life[i] = max[i] = life0;
    c.set(PAL[k % PAL.length]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  };
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -1e4;
  let n = 0;
  return {
    burst(x, y, z, count = 22) { for (let k = 0; k < count; k++) { const a = (k / count) * Math.PI * 2 + n, sp = 3 + (k % 3) * 1.4; spawn(x, y, z, Math.cos(a) * sp, 2 + (k % 4), Math.sin(a) * sp, 0.9, k + n); } n++; },
    trail(x, y, z) { n++; spawn(x + ((n * 7) % 5 - 2) * 0.15, y, z + ((n * 3) % 5 - 2) * 0.15, 0, 0.8, 0, 0.7, n); },
    update(dt) {
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { pos[i * 3 + 1] = -1e4; continue; }
        life[i] -= dt; const k = Math.max(0, life[i] / max[i]);
        vel[i * 3 + 1] -= 9 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (k < 0.5) { col[i * 3] *= 0.9; col[i * 3 + 1] *= 0.9; col[i * 3 + 2] *= 0.9; }
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
  };
}
