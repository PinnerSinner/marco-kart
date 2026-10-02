// Race: the rules of a race (SPEC section 5). Owns the karts, the AI drivers, the item system and all race events.
// Pure logic: no rendering, no clock (the caller drives it with fixed 1/60 s steps), Node-importable.
//
//   const race = new Race({ track, entries, laps, difficulty, player });
//   // every fixed step, after track.update(dt, time):
//   race.step(dt, playerInput, { itemPressed, aimBack, swapPressed });
//   const hud = race.getHud();
import { CFG, DIFFICULTIES, GP_POINTS } from '../core/config.js';
import { bus } from '../core/bus.js';
import { statsFor } from '../core/roster.js';
import { clamp, makeRng, wrapS } from '../core/util.js';
import { RACE } from './constants.js';
import { defaultKartFactory } from './kartFactory.js';
import { createRacer } from './Racer.js';
import { ProgressTracker } from './ProgressTracker.js';
import { ItemManager } from './ItemManager.js';
import { EasterEggs } from './easterEggs.js';
import { AIDriver } from './AIDriver.js';
import { AutoDriver } from './AutoDriver.js';
import { HudBuilder } from './HudBuilder.js';
import { getRacingLine } from './RacingLine.js';
import { AI_TUNE } from './aiTuning.js';
import { resolveSpeedClass, speedClassInfo } from '../core/speedClass.js';

const IDLE = Object.freeze({ throttle: 0, brake: 0, steer: 0, drift: false });
const num = (v, lo, hi) => (Number.isFinite(v) ? clamp(v, lo, hi) : 0);

export class Race {
  /**
   * @param {object} o
   * @param {object} o.track Track (SPEC section 3)
   * @param {Array<{id:string,name?:string,charId:string,kartId:string,isPlayer?:boolean}>} o.entries up to 8; grid order = array order
   * @param {number} [o.laps] defaults to `track.lapCount`
   * @param {string} [o.difficulty='professional'] 'associate' | 'professional' | 'specialty'
   * @param {string|null} [o.player] id of the human racer (or set `isPlayer` on an entry); none = all AI
   * @param {number} [o.seed=1] seeds every random choice (items, AI): same seed + same inputs = same race
   * @param {object} [o.kartFactory] override the kart implementation (tests); see kartFactory.js
   * @param {boolean} [o.updateTrack=false] true: Race.step() also calls `track.update(dt, simTime)`
   * @param {object} [o.aiTune] overrides for `AI_TUNE` (tuning experiments only)
   * @param {number} [o.speedClass=100] game speed class in Mbps: 50 | 100 | 150 | 200 (CFG.speedClasses; scales karts, AI pace, rubber band, HUD dial. Item projectile speeds are NOT scaled: they stay in m/s at 100 Mbps)
   */
  constructor({ track, entries, laps, difficulty = 'professional', player = null, seed = 1, kartFactory, updateTrack = false, aiTune, speedClass }) {
    if (!track) throw new Error('Race: a track is required');
    if (!entries?.length) throw new Error('Race: at least one entry is required');
    this.track = track;
    this.laps = Math.max(1, laps ?? track.lapCount ?? CFG.defaultLaps);
    this.difficulty = DIFFICULTIES.find((d) => d.id === difficulty || d === difficulty) ?? DIFFICULTIES[1];
    this.speedClass = resolveSpeedClass(speedClass);            // Mbps; kart.speedClass / params are built from it
    this.speedInfo = speedClassInfo(this.speedClass);           // { name, tag, speed (time scale c), aiPace, aiRubber, fov, fx }
    this.speedC = this.speedInfo.speed;                         // time scale of the driving model (1 at 100 Mbps)
    this.seed = seed >>> 0;
    this.rng = makeRng(this.seed);
    this.factory = kartFactory ?? defaultKartFactory;
    this.updateTrack = updateTrack;
    this.aiTune = aiTune ? { ...AI_TUNE, ...aiTune } : AI_TUNE;
    this.state = 'countdown';
    this.time = 0;
    this.countdown = CFG.countdownSeconds;
    this.simTime = 0;
    this.wrongWay = false;
    this.finishCount = 0;
    this.tracker = new ProgressTracker(track);
    this.line = getRacingLine(track);
    this.killY = track.killY ?? -40;
    this.boostPads = track.boostPads ?? [];
    this._nextCountdown = CFG.countdownSeconds;
    this._humansDoneAt = null;
    this._aiDoneAt = null;
    this._collidable = [];
    this._playerActions = { itemPressed: false, aimBack: false, aimForward: false, swapPressed: false };
    this._rubberTimer = 0;
    this._obsAge = 0;
    this._scratchQ = {};
    this.disposed = false;

    // ---- world data
    this.obstacles = track.obstacles ?? [];
    this.obstacleInfo = this.obstacles.map((o) => ({ obstacle: o, s: 0, lateral: 0, vx: 0, vz: 0, px: o.pos.x, pz: o.pos.z }));
    this.itemBoxes = (track.itemBoxes ?? []).map((b) => ({ pos: b.pos.clone(), active: true, respawn: 0, s: 0, lateral: 0 }));
    for (const b of this.itemBoxes) { track.query(b.pos, this._scratchQ); b.s = this._scratchQ.s; b.lateral = this._scratchQ.lateral; }
    this._refreshObstacleInfo(0, true);

    // ---- racers
    this.racers = [];
    this.byId = new Map();
    this.player = null;
    const list = entries.slice(0, CFG.racers);
    list.forEach((entry, i) => {
      const isPlayer = !this.player && (entry.isPlayer === true || (player != null && entry.id === player));
      const kart = this.factory.create(track, { id: entry.id, charId: entry.charId, kartId: entry.kartId, stats: statsFor(entry.charId, entry.kartId), speedClass: this.speedClass });
      const r = createRacer(entry, i, kart, isPlayer, this.obstacles.length);
      kart.isPlayer = isPlayer;                                   // bus events (kart:takeoff / kart:perfect-jump) carry it for the HUD and audio
      const slot = track.gridSlot(i);
      kart.teleport(slot.pos, slot.heading);
      track.query(kart.pos, kart.ground);
      this.tracker.init(r, kart.ground.s);
      r.safeProgress = r.progress;
      this.racers.push(r);
      this.byId.set(r.id, r);
      if (isPlayer) this.player = r;
    });
    this.items = new ItemManager(this);
    this.eggs = new EasterEggs(this);                             // Biscuit's easter eggs (hydrant, random woof, paw prints, ...): see easterEggs.js
    for (const r of this.racers) if (!r.isPlayer) r.ai = new AIDriver(this, r, { index: r.gridIndex });
    this.order = this.racers.slice();
    this._hudBuilder = new HudBuilder(this);
    this._humans = this.player ? [this.player] : [];
    this._offFall = bus.on('kart:fall', (d) => { const r = this.byId.get(d?.id); if (r) r.fallFlag = true; });
  }

  /** true while the race is being run (after GO, before the race is over) */
  get isRacing() { return this.state === 'racing'; }

  // =====================================================================================================
  // Stepping
  // =====================================================================================================
  /**
   * Advances the race by ONE fixed step.
   * @param {number} dt fixed step in seconds (1/60)
   * @param {{throttle:number,brake:number,steer:number,drift:boolean,itemPressed?:boolean}} [playerInput] the human's input
   * @param {{itemPressed?:boolean, aimBack?:boolean, aimForward?:boolean, swapPressed?:boolean}} [playerActions] edge actions; aimBack = brake held while pressing use; swapPressed = exchange item slots 1 and 2
   */
  step(dt, playerInput, playerActions) {
    if (this.disposed || !(dt > 0)) return;
    if (this.updateTrack) this.track.update(dt, this.simTime);
    this.simTime += dt;
    this._refreshObstacleInfo(dt);
    if (this.state === 'countdown') this._stepCountdown(dt, playerInput);
    else this._stepRunning(dt, playerInput, playerActions);
  }

  _stepCountdown(dt, input) {
    this.countdown = Math.max(0, this.countdown - dt);
    const p = this.player;
    if (p) {
      const held = num(input?.throttle, 0, 1) > 0.5;
      if (held && !p.thrHeld) p.thrPressedAt = this.countdown;      // remaining seconds at the moment the throttle went down
      p.thrHeld = held;
    }
    while (this._nextCountdown > 0 && this.countdown <= this._nextCountdown + 1e-6) {
      bus.emit('race:countdown', { n: this._nextCountdown });
      this._nextCountdown -= 1;
    }
    for (const r of this.racers) r.kart.update(dt, IDLE);
    if (this.countdown <= 1e-6) this._go();
  }

  _go() {
    this.state = 'racing';
    this.countdown = 0;
    this.time = 0;
    bus.emit('race:countdown', { n: 0 });
    bus.emit('race:start', {});
    for (const r of this.racers) {
      r.lapStart = 0;
      const rocket = r.isPlayer
        ? r.thrHeld && r.thrPressedAt <= RACE.rocketWindow
        : !!r.ai?.rocketStart;
      if (rocket) r.kart.applyBoost(RACE.rocketPower, RACE.rocketSeconds, 'start');
    }
  }

  _stepRunning(dt, input, actions) {
    const over = this.state === 'finished';
    if (!over) this.time += dt;
    // ---- 1. inputs and item use
    const col = this._collidable;
    col.length = 0;
    for (const r of this.racers) {
      this._control(r, dt, input, actions, over);
      this.items.beforeKart(r, dt);                // item statuses that act on this step's input (giant steering, slick surface, AI jitter, fuse seeking)
      this.eggs.beforeKart(r, r.lastInput);
      r.kart.update(dt, r.lastInput);
      this.items.afterKart(r, dt);                 // giant scale, zoomies keep-alive, speed caps
      this.track.updateKart?.(r.kart, dt, this);   // track-specific interactions (gates, wind, trick ramps, triggers...)
      if (!r.finished && !over) col.push(r.kart);
    }
    if (over) for (const r of this.racers) if (!r.finished) col.push(r.kart);
    // ---- 2. kart-vs-kart
    this.factory.resolve(col);
    // ---- 3. rules
    for (const r of this.racers) this._afterKart(r, dt, over);
    if (over) return;
    this._stepBoxes(dt);
    this._stepObstacles(dt);
    this.items.update(dt);
    this.eggs.update(dt);
    this._rank();
    this._stepRubber(dt);
    this._stepWrongWay(dt);
    this._checkOver();
  }

  /** Fills `r.lastInput` (human, AI, fibre autopilot or cruise) and handles the item button. */
  _control(r, dt, input, actions, over) {
    const inp = r.lastInput;
    if (r.finished || over) {
      (r.auto ?? (r.auto = new AutoDriver(this.track, { mode: 'cruise', kart: r.kart }))).update(r.kart, dt, inp);
      return;
    }
    if (r.fibre > 0) {
      (r.fibreDriver ?? (r.fibreDriver = new AutoDriver(this.track, { mode: 'fibre', kart: r.kart }))).update(r.kart, dt, inp);
      return;
    }
    if (r.control) {                                           // scripted racer (tests, attract mode): control(racer, dt, input, race) -> actions?
      const a = r.control(r, dt, inp, this);
      if (a?.swapPressed) this.items.swap(r);
      if (a?.itemPressed) this.items.use(r, a);
      return;
    }
    if (r === this.player) {
      inp.throttle = num(input?.throttle, 0, 1); inp.brake = num(input?.brake, 0, 1);
      inp.steer = num(input?.steer, -1, 1); inp.drift = !!input?.drift;
      if (actions?.swapPressed) this.items.swap(r);            // second item button: exchange slot 1 and slot 2
      const pressed = !!(actions?.itemPressed ?? input?.itemPressed);
      if (pressed) {
        const a = this._playerActions;
        a.itemPressed = true; a.aimBack = actions?.aimBack ?? inp.brake > 0.3; a.aimForward = !!actions?.aimForward;
        this.items.use(r, a);
      }
      return;
    }
    r.ai.update(dt, inp);
    if (r.ai.actions.swapPressed) this.items.swap(r);
    if (r.ai.actions.itemPressed) this.items.use(r, r.ai.actions);
  }

  // =====================================================================================================
  // Per-racer rules: progress, laps, finish, respawn
  // =====================================================================================================
  _afterKart(r, dt, over) {
    const k = r.kart, g = k.ground;
    if (!Number.isFinite(k.pos.x + k.pos.y + k.pos.z + k.yaw)) { this._respawn(r); return; }
    if (over) return;
    const onRoad = g.onRoad && !g.inVoid;
    if (!k.grounded) r.airSinceRoad = true;
    const creditJump = r.airSinceRoad || (onRoad && r.prevOnRoad);
    const passed = r.finished ? 0 : this.tracker.update(r, g.s, creditJump);
    if (r.finished) r.progress = this.tracker.progressOf(r, g.s);
    if (onRoad && k.grounded) { r.airSinceRoad = false; r.safeProgress = r.progress; }
    r.prevOnRoad = onRoad;
    if (passed > 0 && r.g > r.maxG) {
      const t = this.time - dt * (1 - r.crossFrac);
      for (let gg = r.maxG + 1; gg <= r.g; gg++) this._onGate(r, gg, t);
      r.maxG = r.g;
    }
    if (!r.finished) r.lap = this.tracker.lapOf(r.g, this.laps);
    this._checkRespawn(r, dt);
  }

  _onGate(r, gate, t) {
    const N = this.tracker.N;
    if (gate < N || gate % N !== 0) return;                   // only crossings of the start/finish line after the first count
    const lap = gate / N;
    if (lap > this.laps || r.finished) return;
    const lapTime = t - r.lapStart;
    r.lapStart = t;
    r.lapTimes.push(lapTime);
    if (r.bestLap === null || lapTime < r.bestLap) r.bestLap = lapTime;
    const final = lap === this.laps;
    bus.emit('race:lap', { id: r.id, lap, laps: this.laps, time: lapTime, isPlayer: r.isPlayer, final });
    if (final) this._finishRacer(r, t);
    else if (lap + 1 === this.laps && r.isPlayer) bus.emit('race:final-lap', { id: r.id, isPlayer: true });
  }

  _finishRacer(r, t) {
    r.finished = true;
    r.finishTime = t;
    r.finishOrder = ++this.finishCount;
    r.lap = this.laps;
    r.itemRoulette = null; r.fibre = 0; r.kart.status.autopilot = false;
    this.items.onFinish(r);
    if (r === this.player && this.wrongWay) { this.wrongWay = false; bus.emit('race:wrong-way', { on: false }); }
    bus.emit('race:finish', { id: r.id, place: r.finishOrder, time: t, isPlayer: r.isPlayer });
    this.eggs?.onFinish(r, r.finishOrder);
  }

  _checkRespawn(r, dt) {
    if (r.finished) return;
    const k = r.kart, g = k.ground;
    let go = k.pos.y < this.killY;
    if (r.fallFlag || (g.inVoid && !k.grounded)) { r.fallTime += dt; if (r.fallTime >= RACE.fallDelay) go = true; } else r.fallTime = 0;
    const respawning = k.status.respawning > 0;
    if (!respawning && k.status.spin <= 0 && r.lastInput.throttle > 0.3 && Math.abs(k.speed) < RACE.stuckSpeed && this.time > 1) r.stuckTime += dt;
    else r.stuckTime = Math.max(0, r.stuckTime - 2 * dt);
    if (r.stuckTime >= RACE.stuckSeconds) go = true;
    const up = Math.cos(k.roll || 0) * Math.cos(k.pitch || 0);
    if (up < -0.15) r.flipTime += dt; else r.flipTime = 0;
    if (r.flipTime >= RACE.flipSeconds) go = true;
    const half = this.line.at(this.line.half, g.s);
    if (!g.onRoad && !g.inVoid && Math.abs(g.lateral) > half + RACE.offRoadLateral) r.offRoadTime += dt; else r.offRoadTime = Math.max(0, r.offRoadTime - dt);
    if (r.offRoadTime >= RACE.offRoadSeconds) go = true;
    if (go) this._respawn(r);
  }

  /** Puts a racer back on the road (last safe position, a few metres behind) with brief invincibility. */
  _respawn(r) {
    const k = r.kart, L = this.track.length;
    const s = wrapS(r.safeProgress - RACE.respawnBack, L);
    const spot = this.track.respawnAt(s);
    k.teleport(spot.pos, spot.heading);
    this.track.query(k.pos, k.ground);
    if (k.status.invincible < RACE.respawnInvincible) k.setInvincible(RACE.respawnInvincible);
    if (typeof k.status.respawning === 'number') k.status.respawning = RACE.respawnFx;
    r.stuckTime = 0; r.flipTime = 0; r.offRoadTime = 0; r.fallTime = 0; r.fallFlag = false; r.airSinceRoad = false; r.prevOnRoad = true;
    if (r.fibre > 0) { r.fibre = 0; k.status.autopilot = false; }
    this.tracker.resync(r, k.ground.s);
    r.ai?.reset();
    r.auto?.reset();
    if (r === this.player && this.wrongWay) { this.wrongWay = false; bus.emit('race:wrong-way', { on: false }); }
    r.wrongTime = 0; r.rightTime = 0;
    bus.emit('kart:respawn', { id: r.id, isPlayer: r.isPlayer });
  }

  // =====================================================================================================
  // Item boxes, obstacles
  // =====================================================================================================
  _stepBoxes(dt) {
    const boxes = this.itemBoxes;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.active) continue;
      b.respawn -= dt;
      if (b.respawn <= 0) { b.respawn = 0; b.active = true; }
    }
    const reach = CFG.itemBox.radius + CFG.kart.radius;
    for (const r of this.racers) {
      if (r.finished || r.itemRoulette) continue;
      const full = !!(r.item && r.item2);                      // two item slots: a box is refused (and stays) while both are taken
      const p = r.kart.pos;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (!b.active) continue;
        const dx = p.x - b.pos.x, dz = p.z - b.pos.z;
        if (dx * dx + dz * dz > reach * reach || Math.abs(p.y - b.pos.y) > RACE.boxPickupHeight) continue;
        if (full) { this.items.refuse(r, i); break; }
        b.active = false; b.respawn = CFG.itemBox.respawn;
        this.items.startRoulette(r);
        bus.emit('item:box', { id: r.id, index: i, isPlayer: r.isPlayer });
        break;
      }
    }
  }

  /**
   * Keeps (s, lateral) and a velocity estimate per obstacle for the AI. Refreshed at 10 Hz so it works whether the track is
   * updated every fixed step or once per rendered frame; a jump (a vehicle wrapping round its route) resets the velocity.
   * @param {number} dt seconds since the last call @param {boolean} [force] refresh now (construction)
   */
  _refreshObstacleInfo(dt, force = false) {
    const info = this.obstacleInfo;
    this._obsAge += dt;
    if (!info.length || (this._obsAge < 0.1 && !force)) return;
    const span = this._obsAge;
    this._obsAge = 0;
    for (let i = 0; i < info.length; i++) {
      const o = info[i], p = o.obstacle.pos;
      const dx = p.x - o.px, dz = p.z - o.pz;
      if (span > 0 && dx * dx + dz * dz < 25) { o.vx = dx / span; o.vz = dz / span; } else { o.vx = 0; o.vz = 0; }
      o.px = p.x; o.pz = p.z;
      this.track.query(p, this._scratchQ); o.s = this._scratchQ.s; o.lateral = this._scratchQ.lateral;
    }
  }

  _stepObstacles(dt) {
    const obs = this.obstacles;
    if (!obs.length) return;
    for (const r of this.racers) {
      if (r.finished) continue;
      const k = r.kart;
      for (let i = 0; i < obs.length; i++) {
        if (r.obstacleCd[i] > 0) { r.obstacleCd[i] -= dt; continue; }
        const o = obs[i];
        if (!o.active) continue;
        const dx = k.pos.x - o.pos.x, dz = k.pos.z - o.pos.z, R = o.radius + k.radius * 0.8;
        if (dx * dx + dz * dz > R * R || Math.abs(k.pos.y - o.pos.y) > 3.5) continue;
        r.obstacleCd[i] = RACE.obstacleCooldown;
        if (k.status.invincible > 0) continue;
        if (o.hit === 'bump') this._bump(r, o, dx, dz);
        else k.spinOut(RACE.obstacleSpin, 'obstacle');
      }
    }
  }

  /** A 'bump' obstacle: knocks the kart aside and takes some speed. */
  _bump(r, o, dx, dz) {
    const k = r.kart, d = Math.hypot(dx, dz) || 1;
    const impact = clamp(Math.abs(k.speed) / 30, 0.2, 1);
    k.pos.x += (dx / d) * 0.6; k.pos.z += (dz / d) * 0.6;
    k.speed *= RACE.obstacleBumpFactor; k.vel.multiplyScalar(RACE.obstacleBumpFactor);
    bus.emit('kart:bump', { id: r.id, otherId: o.id, impact });
  }

  // =====================================================================================================
  // Ranking, rubber band, wrong way, race end
  // =====================================================================================================
  _rank() {
    const order = this.order, H = RACE.rankHysteresis;
    for (let i = 1; i < order.length; i++) {
      let j = i;
      while (j > 0 && this._shouldPass(order[j - 1], order[j], H)) {
        const back = order[j], front = order[j - 1];
        order[j - 1] = back; order[j] = front;
        j--;
        this._overtake(back, front, j + 1);
      }
    }
    for (let i = 0; i < order.length; i++) order[i].place = i + 1;
  }

  /** Should `back` (currently behind) move ahead of `front`? Unfinished racers need a lead of `H` metres. */
  _shouldPass(front, back, H) {
    if (front.finished) return back.finished && back.finishOrder < front.finishOrder;
    if (back.finished) return true;
    return back.progress > front.progress + H;
  }

  _overtake(passer, passed, place) {
    if (this.state !== 'racing' || this.time < RACE.overtakeGrace || passer.finished || passed.finished) return;
    if (this.player && passer !== this.player && passed !== this.player) return;    // only overtakes involving the human are announced
    const memo = passer._ovt ?? (passer._ovt = {});
    const last = memo[passed.id];
    if (last !== undefined && this.time - last < RACE.overtakeCooldown) return;
    memo[passed.id] = this.time;
    bus.emit('race:overtake', { id: passer.id, passedId: passed.id, place, isPlayer: passer.isPlayer });
  }

  _stepRubber(dt) {
    this._rubberTimer -= dt;
    if (this._rubberTimer > 0) return;
    this._rubberTimer = RACE.rubberInterval;
    let ref;
    const p = this.player;
    if (p && !p.finished) ref = p.progress;
    else {
      let sum = 0, n = 0;
      for (const r of this.racers) if (!r.finished) { sum += r.progress; n++; }
      ref = n ? sum / n : 0;
    }
    for (const r of this.racers) if (r.ai) r.ai.setRubber(r.finished ? 0 : (r.progress - ref) / RACE.rubberFullGap);
  }

  _stepWrongWay(dt) {
    const p = this.player;
    if (!p || p.finished) return;
    const v = p.dsLast / dt;                                    // m/s along the track (negative = backwards)
    if (v < -RACE.wrongWaySpeed) { p.wrongTime += dt; p.rightTime = 0; }
    else if (v > 0.5) { p.rightTime += dt; p.wrongTime = Math.max(0, p.wrongTime - 2 * dt); }
    if (!this.wrongWay && p.wrongTime > RACE.wrongWaySeconds) { this.wrongWay = true; bus.emit('race:wrong-way', { on: true }); }
    else if (this.wrongWay && p.rightTime > RACE.wrongWayClear) { this.wrongWay = false; p.wrongTime = 0; bus.emit('race:wrong-way', { on: false }); }
  }

  _checkOver() {
    const rs = this.racers;
    let allDone = true, humansDone = true, aiDone = true, hasAi = false;
    for (const r of rs) {
      if (!r.isPlayer) hasAi = true;
      if (r.finished) continue;
      allDone = false;
      if (r.isPlayer) humansDone = false; else aiDone = false;
    }
    let over = allDone || this.time >= RACE.maxRaceTime;
    if (!over) {
      const humanless = this._humans.length === 0;
      if (humanless ? this.finishCount > 0 : humansDone) {
        if (this._humansDoneAt === null) this._humansDoneAt = this.time;
        if (this.time - this._humansDoneAt >= RACE.postHumanTimeout) over = true;
      }
      if (!humanless && hasAi && aiDone && !humansDone) {
        if (this._aiDoneAt === null) this._aiDoneAt = this.time;
        if (this.time - this._aiDoneAt >= RACE.humanGraceAfterAi) over = true;
      }
    }
    if (over) this._endRace();
  }

  _endRace() {
    this._rank();
    this.state = 'finished';
    this.items.clear();
    if (this.wrongWay) { this.wrongWay = false; bus.emit('race:wrong-way', { on: false }); }
    bus.emit('race:over', { results: this.results() });
  }

  // =====================================================================================================
  // Outputs
  // =====================================================================================================
  /**
   * HudSnapshot for the human (or the first racer when there is no human). The same object is reused every call.
   * @returns {object}
   */
  getHud() { return this._hudBuilder.build(this); }

  /**
   * Standings so far (final once `state === 'finished'`).
   * @returns {Array<{place:number,id:string,name:string,charId:string,kartId:string,time:number|null,bestLap:number|null,points:number,isPlayer:boolean}>}
   */
  results() {
    return this.order.map((r, i) => ({
      place: i + 1, id: r.id, name: r.name, charId: r.charId, kartId: r.kartId,
      time: r.finished ? r.finishTime : null, bestLap: r.bestLap, points: GP_POINTS[i] ?? 0, isPlayer: r.isPlayer,
    }));
  }

  /** Detaches bus listeners and drops world items. The Race must not be stepped afterwards. */
  dispose() {
    this.disposed = true;
    this._offFall?.();
    this.items.dispose();
    this.eggs?.dispose();
  }
}
