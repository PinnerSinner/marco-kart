// SimpleKart: a deliberately basic kinematic kart that implements the KartPhysics INTERFACE (SPEC.md section 4).
// It is a TEST FIXTURE so race / AI / visuals can be built before the real src/kart/KartPhysics.js exists.
// It is not meant to feel good. The real physics agent owns src/kart/KartPhysics.js and must match this shape.
import * as THREE from 'three';
import { CFG, SURFACE_PROPS } from '../core/config.js';
import { bus } from '../core/bus.js';
import { clamp, damp, yawToForward } from '../core/util.js';

const _n = new THREE.Vector3();
const _f = { x: 0, y: 0, z: 0 };

export class SimpleKart {
  constructor(track, { id = 'k', charId = 'marco', kartId = 'cruiser', stats = { speed: 3, accel: 3, handling: 3, weight: 3 } } = {}) {
    this.track = track; this.id = id; this.charId = charId; this.kartId = kartId; this.stats = stats;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.speed = 0; this.steer = 0; this.grounded = true; this.airTime = 0;
    this.radius = CFG.kart.radius; this.mass = 0.6 + stats.weight * 0.2;
    this.baseMax = 28 + stats.speed * 1.6;
    this.maxSpeed = this.baseMax;
    this.drift = { active: false, dir: 1, charge: 0, level: 0 };
    this.boost = { time: 0, power: 0 };
    this.status = { spin: 0, stun: 0, invincible: 0, autopilot: false };
    this.ground = { height: 0, normal: new THREE.Vector3(0, 1, 0), surface: 'road', onRoad: true, s: 0, lateral: 0, inVoid: false };
    this.scale = 1;
  }

  teleport(pos, yaw) {
    this.pos.copy(pos); this.vel.set(0, 0, 0); this.yaw = yaw; this.speed = 0; this.steer = 0;
    this.status.spin = 0; this.drift.active = false; this.drift.charge = 0; this.drift.level = 0;
    this.track.query(this.pos, this.ground);
    this.pos.y = this.ground.height;
  }

  applyBoost(power = 1, seconds = 1, _kind = 'item') {
    this.boost.time = Math.max(this.boost.time, seconds); this.boost.power = Math.max(this.boost.power, power);
    bus.emit('kart:boost', { id: this.id, kind: _kind, power, duration: seconds });
  }
  spinOut(seconds = 1.4, cause = 'hit') { if (this.status.invincible > 0) return false; this.status.spin = seconds; bus.emit('kart:spin', { id: this.id, cause }); return true; }
  shrink(seconds = 6) { if (this.status.invincible > 0) return false; this.status.stun = seconds; return true; }
  setInvincible(seconds) { this.status.invincible = seconds; }
  launch(vy) { this.vel.y = vy; this.grounded = false; }

  update(dt, input) {
    const st = this.status;
    st.spin = Math.max(0, st.spin - dt); st.stun = Math.max(0, st.stun - dt); st.invincible = Math.max(0, st.invincible - dt);
    this.boost.time = Math.max(0, this.boost.time - dt); if (this.boost.time === 0) this.boost.power = 0;
    this.track.query(this.pos, this.ground, this.ground.s);
    const sp = SURFACE_PROPS[this.ground.surface] ?? SURFACE_PROPS.road;
    if (sp.boostPad) this.applyBoost(1, 1.0, 'pad');
    const shrink = st.stun > 0 ? 0.7 : 1;
    this.maxSpeed = this.baseMax * sp.speed * shrink * (this.boost.time > 0 ? 1 + 0.35 * this.boost.power : 1);
    let throttle = input.throttle ?? 0, brake = input.brake ?? 0, steer = input.steer ?? 0;
    if (st.spin > 0) { throttle = 0; brake = 0; steer = 0; this.yaw += 9 * dt; }
    const accel = 8 + this.stats.accel * 2.2;
    if (throttle > 0) this.speed += (this.maxSpeed - this.speed) * clamp(accel / this.maxSpeed, 0, 1) * throttle * dt * 2.2;
    else this.speed = damp(this.speed, 0, 0.6, dt);
    if (brake > 0) this.speed = this.speed > 0 ? Math.max(0, this.speed - 40 * brake * dt) : Math.max(-8, this.speed - 12 * brake * dt);
    if (this.speed > this.maxSpeed) this.speed = damp(this.speed, this.maxSpeed, 3, dt);
    this.steer = damp(this.steer, steer, 12, dt);
    const turn = (0.9 + this.stats.handling * 0.18) * this.steer * clamp(this.speed / 12, -1, 1);
    if (st.spin === 0) this.yaw -= turn * dt;
    yawToForward(this.yaw, _f);
    this.vel.set(_f.x * this.speed, 0, _f.z * this.speed);
    this.pos.addScaledVector(this.vel, dt);
    const pen = this.track.collideWalls(this.pos, this.radius, _n);
    if (pen > 0) { this.pos.addScaledVector(_n, pen); this.speed *= 0.6; bus.emit('kart:wall-hit', { id: this.id, impact: 0.5 }); }
    this.track.query(this.pos, this.ground, this.ground.s);
    this.pos.y = this.ground.height; this.grounded = true;
  }
}

// Same signature the real module must export.
export function resolveKartCollisions(karts) {
  for (let i = 0; i < karts.length; i++) for (let j = i + 1; j < karts.length; j++) {
    const a = karts[i], b = karts[j];
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.radius + b.radius;
    if (d > 0 && d < min) {
      const nx = dx / d, nz = dz / d, push = (min - d) / 2;
      a.pos.x -= nx * push; a.pos.z -= nz * push; b.pos.x += nx * push; b.pos.z += nz * push;
    }
  }
}
