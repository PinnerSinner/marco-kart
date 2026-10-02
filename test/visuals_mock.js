// MockRace: the exact SPEC section 5 shape (racers, items.entities, itemBoxes, player, state) driven by SimpleKart on StubTrack.
// Used by visuals tests and demos until the real Race (A3) exists. Not a test file.
import * as THREE from 'three';
import { StubTrack } from '../src/track/StubTrack.js';
import { SimpleKart } from '../src/kart/SimpleKart.js';
import { CHARACTERS, KARTS, statsFor } from '../src/core/roster.js';
import { bus } from '../src/core/bus.js';
import { CFG } from '../src/core/config.js';

const KART_FOR = ['cruiser', 'buggy', 'hauler', 'rocket', 'buggy', 'cruiser', 'hauler', 'rocket'];

export class MockRace {
  /**
   * @param {{track?: StubTrack, count?: number, lateral?: number[]}} [o]
   */
  constructor({ track = new StubTrack(), count = 8 } = {}) {
    this.track = track;
    this.state = 'racing';
    this.time = 0; this.countdown = 0;
    this.racers = [];
    this.items = { entities: [] };
    this.itemBoxes = track.itemBoxes.map((b) => ({ pos: b.pos.clone(), active: true, respawn: 0 }));
    for (let i = 0; i < count; i++) {
      const ch = CHARACTERS[i % CHARACTERS.length];
      const kartId = KART_FOR[i % KART_FOR.length];
      const kart = new SimpleKart(track, { id: ch.id, charId: ch.id, kartId, stats: statsFor(ch.id, kartId) });
      const slot = track.gridSlot(i);
      kart.teleport(slot.pos, slot.heading);
      this.racers.push({ id: ch.id, name: ch.name, charId: ch.id, kartId, isPlayer: i === 0, kart, ai: null, place: i + 1, lap: 1, progress: 0, finished: false, finishTime: null, lapTimes: [], bestLap: null, item: null, itemRoulette: null, shield: false, lastInput: null, lat: (i % 2 ? 1 : -1) * 3.2 });
    }
    this.player = this.racers[0];
    this.entId = 1;
  }

  /** Advance one fixed step. Every kart follows the track with a small lateral offset. */
  step(dt = CFG.fixedDt) {
    this.time += dt;
    for (const r of this.racers) {
      const k = r.kart;
      const tgt = this.track.sample(k.ground.s + 16 + k.speed * 0.25);
      const px = tgt.pos.x + tgt.right.x * r.lat, pz = tgt.pos.z + tgt.right.z * r.lat;
      const want = Math.atan2(px - k.pos.x, pz - k.pos.z);
      let err = want - k.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
      k.update(dt, { throttle: r.throttle ?? 1, brake: 0, steer: Math.max(-1, Math.min(1, -err * 2.8)), drift: false });
      r.progress = k.ground.s;
    }
    for (const e of this.items.entities) { e.pos.addScaledVector(e.vel, dt); }
  }

  addEntity(type, pos, vel, yaw = 0) {
    const e = { id: this.entId++, type, pos: pos.clone(), vel: vel.clone(), yaw, ownerId: 'marco', state: 'active', radius: 0.7 };
    this.items.entities.push(e);
    return e;
  }
}

export { bus, KARTS };
