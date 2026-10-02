import test from 'node:test';
import assert from 'node:assert/strict';
import { StubTrack } from '../src/track/StubTrack.js';
import { SimpleKart } from '../src/kart/SimpleKart.js';
import { loopDiff } from '../src/core/util.js';

test('SimpleKart can drive a lap of the stub oval with a trivial steering rule', () => {
  const t = new StubTrack();
  const k = new SimpleKart(t, {});
  const g = t.gridSlot(0);
  k.teleport(g.pos, g.heading);
  let travelled = 0, last = k.ground.s, time = 0;
  while (time < 120 && travelled < t.length) {
    // aim at a point 18 m ahead on the centreline
    const target = t.sample(k.ground.s + 18).pos;
    const dx = target.x - k.pos.x, dz = target.z - k.pos.z;
    const want = Math.atan2(dx, dz);
    let err = want - k.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
    k.update(1 / 60, { throttle: 1, brake: 0, steer: Math.max(-1, Math.min(1, -err * 2.5)) });
    travelled += loopDiff(last, k.ground.s, t.length); last = k.ground.s; time += 1 / 60;
    assert.ok(Number.isFinite(k.pos.x) && Number.isFinite(k.pos.z));
  }
  assert.ok(travelled >= t.length, `only travelled ${travelled.toFixed(0)} of ${t.length.toFixed(0)} m in ${time.toFixed(0)} s`);
  assert.ok(time < 60, `lap took ${time.toFixed(1)} s`);
});
