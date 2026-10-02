import test from 'node:test';
import assert from 'node:assert/strict';
import { SelectFlow, FLOW_STEPS } from '../src/ui/flow.js';

const run = (mode, picks = {}) => {
  const events = [];
  const flow = new SelectFlow(mode, { picks, emit: (n, d) => events.push([n, d]) });
  return { flow, events };
};

test('flow: step order per mode', () => {
  assert.deepEqual(FLOW_STEPS.gp, ['char', 'kart', 'difficulty']);
  assert.deepEqual(FLOW_STEPS.single, ['char', 'kart', 'difficulty', 'track']);
  assert.deepEqual(FLOW_STEPS.time, ['char', 'kart', 'track']);
  assert.throws(() => new SelectFlow('battle'));
});

test('flow: gp emits ui:start with charId, kartId, difficulty and NO track', () => {
  const { flow, events } = run('gp');
  assert.equal(flow.step, 'char');
  assert.equal(flow.confirm('subnet'), 'next');
  assert.equal(flow.step, 'kart');
  assert.equal(flow.confirm('rocket'), 'next');
  assert.equal(flow.step, 'difficulty');
  assert.equal(events.length, 0, 'nothing emitted before the last step');
  assert.equal(flow.confirm('specialty'), 'start');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], ['ui:start', { mode: 'gp', charId: 'subnet', kartId: 'rocket', difficulty: 'specialty' }]);
  assert.equal('trackId' in events[0][1], false);
});

test('flow: single race carries trackId and laps', () => {
  const { flow, events } = run('single');
  flow.confirm('lambda'); flow.confirm('buggy'); flow.confirm('associate');
  flow.pick('laps', 5);
  assert.equal(flow.step, 'track');
  assert.equal(flow.confirm('blighty'), 'start');
  assert.deepEqual(events[0], ['ui:start', { mode: 'single', charId: 'lambda', kartId: 'buggy', difficulty: 'associate', trackId: 'blighty', laps: 5 }]);
});

test('flow: time trial skips difficulty but still sends a valid one', () => {
  const { flow, events } = run('time', { difficulty: 'specialty' });
  flow.confirm(); flow.confirm();
  assert.equal(flow.step, 'track');
  flow.confirm('datacentre');
  assert.equal(events.length, 1);
  const p = events[0][1];
  assert.equal(p.mode, 'time');
  assert.equal(p.trackId, 'datacentre');
  assert.equal(p.laps, 3, 'default lap count');
  assert.equal(p.difficulty, 'specialty');
  assert.equal(p.charId, 'marco');
});

test('flow: confirm() without a value uses the browsed pick', () => {
  const { flow, events } = run('gp');
  flow.pick('charId', 'carlos'); flow.confirm();
  flow.pick('kartId', 'hauler'); flow.confirm();
  flow.confirm();
  assert.equal(events[0][1].charId, 'carlos');
  assert.equal(events[0][1].kartId, 'hauler');
  assert.equal(events[0][1].difficulty, 'professional');
});

test('flow: last picks seed the flow', () => {
  const { flow } = run('single', { charId: 'tilly', kartId: 'buggy', difficulty: 'associate', trackId: 'datacentre', laps: 4 });
  assert.deepEqual(flow.picks, { charId: 'tilly', kartId: 'buggy', difficulty: 'associate', trackId: 'datacentre', laps: 4 });
});

test('flow: invalid values never advance and never reach ui:start', () => {
  const { flow, events } = run('gp');
  assert.equal(flow.confirm('mario'), 'invalid');
  assert.equal(flow.step, 'char');
  assert.equal(flow.pick('kartId', 'tank'), false);
  assert.equal(flow.pick('laps', 7), false);
  assert.equal(flow.pick('laps', 4), true);
  flow.confirm('rex'); flow.confirm('cruiser');
  assert.equal(flow.confirm('easy'), 'invalid');
  assert.equal(flow.step, 'difficulty');
  assert.equal(events.length, 0);
});

test('flow: back walks up the steps and exits from the first', () => {
  const { flow, events } = run('single');
  assert.equal(flow.back(), 'exit');
  flow.confirm('rex'); flow.confirm('rocket');
  assert.equal(flow.step, 'difficulty');
  assert.equal(flow.back(), 'prev');
  assert.equal(flow.step, 'kart');
  assert.equal(flow.picks.charId, 'rex', 'earlier picks are kept');
  flow.confirm(); flow.confirm(); flow.confirm();
  assert.equal(events.length, 1);
  assert.equal(flow.confirm(), 'invalid', 'cannot fire ui:start twice');
  assert.equal(events.length, 1);
});
