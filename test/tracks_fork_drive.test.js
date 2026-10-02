// Drives the alternative road of every fork with a pure-pursuit "human" over a whole lap: the kart really takes Park Drive / the Tube /
// the beach boardwalk / the pitch, stays on the ribbon, needs no respawn and still gets its lap credited through the normal checkpoints.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrack } from '../src/track/index.js';
import { Race } from '../src/race/Race.js';
import { realKartFactory } from '../src/race/kartFactory.js';
import { bus } from '../src/core/bus.js';
import { DT, makeEntries, humanBot, freezeOthers } from './race_helpers.js';

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

for (const id of ['copacabana', 'blighty']) {
  const probe = createTrack(id, { headless: true });
  for (const fork of probe.def.forks ?? []) {
    test(`${id}: a human can take the ${fork.id} fork (${fork.alt}) for a whole lap: on the ribbon, no respawn, lap credited`, () => {
      const track = createTrack(id, { headless: true });
      let deckLen = 0, rb = track.ribbons.find((r) => r.def.id === fork.alt);
      if (!rb) {                                                  // a straight deck (the pitch): its centre line, with a run-in and run-out
        const d = track.model.platforms.find((p) => (p.def?.id ?? p.id) === fork.alt);
        assert.ok(d, 'alternative road found');
        const a = 30, L = d.length + a; deckLen = d.length;
        rb = { total: L, at: (u, o = {}) => { const t = u - a; o.x = d.x + d.fx * t; o.z = d.z + d.fz * t; return o; }, edgeDistance: (x, z) => { const dx = x - d.x, dz = z - d.z, u = dx * d.fx + dz * d.fz, v = -dx * d.fz + dz * d.fx; return u < -a || u > d.length ? 1 : Math.abs(v) - d.width / 2; } };
      }
      const race = new Race({ track, entries: makeEntries(8, 'marco'), laps: 1, difficulty: 'professional', player: 'marco', seed: 5, kartFactory: realKartFactory, updateTrack: true });
      freezeOthers(race, race.player);
      const k = race.player.kart, s0 = track.S(fork.from) - 28, s1 = track.S(fork.to) + 24, q = {};
      let respawns = 0, walls = 0; const o1 = bus.on('kart:respawn', (d) => { if (d?.id === race.player.id) respawns++; }), o2 = bus.on('kart:wall-hit', (d) => { if (d?.id === race.player.id) walls++; });
      let on = 0, inWin = 0, u = 0, steps = 0, within = false, minSpeed = 99;
      while (race.state !== 'finished' && steps < 60 * 400) {
        track.query(k.pos, q); const s = q.s, inW = s > s0 && s < s1;
        let inp;
        if (inW && race.state === 'racing' && !(deckLen && within && u >= rb.total - 1)) {
          if (!within) { within = true; let best = 1e9; for (let t = 0; t <= rb.total; t += 2) { const p = rb.at(t, {}); const d = Math.hypot(p.x - k.pos.x, p.z - k.pos.z); if (d < best) { best = d; u = t; } } }
          let best = 1e9; for (let t = Math.max(0, u - 6); t <= Math.min(rb.total, u + 30); t += 1) { const p = rb.at(t, {}); const d = Math.hypot(p.x - k.pos.x, p.z - k.pos.z); if (d < best) { best = d; u = t; } }
          const look = Math.min(rb.total, u + 12 + k.speed * 0.45), tp = rb.at(look, {}), err = wrap(Math.atan2(tp.x - k.pos.x, tp.z - k.pos.z) - k.yaw);
          inp = { throttle: k.speed < 21 ? 1 : 0.25, brake: k.speed > 27 ? 0.5 : 0, steer: Math.max(-1, Math.min(1, -2.2 * err)), drift: false };
          inWin++; if (rb.edgeDistance(k.pos.x, k.pos.z) < -0.5) on++; if (u > 20 && u < rb.total - 20) minSpeed = Math.min(minSpeed, k.speed);
        } else inp = humanBot(race);
        race.step(DT, inp); steps++;
      }
      o1(); o2();
      assert.equal(respawns, 0, 'no respawn on the fork road');
      assert.ok(within && inWin > 120, `drove the fork window (${inWin} steps)`);
      assert.ok(deckLen ? on > 1.2 * deckLen : on / inWin > 0.6, `on the alternative road ${on} of ${inWin} steps`);
      assert.ok(minSpeed > 6, `kept moving (min ${minSpeed.toFixed(1)} m/s)`);
      assert.equal(race.state, 'finished', `lap credited and race finished (${(steps * DT).toFixed(0)} s)`);
      assert.ok(walls <= 14, `${walls} wall hits`);
      race.dispose();
    });
  }
}
