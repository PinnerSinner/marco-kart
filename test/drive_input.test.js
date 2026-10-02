// InputManager tests with mocked window / navigator / document (no browser needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager, stickCurve } from '../src/core/input.js';

function setup({ pads = null, touch = false } = {}) {
  const win = new EventTarget();
  const created = [];
  const mkEl = (tag) => {
    const handlers = {};
    const el = {
      tag, className: '', style: {}, children: [], textContent: '', parentNode: null, id: '', handlers,
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
      appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
      removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentNode = null; },
      addEventListener(t, fn) { (handlers[t] ??= []).push(fn); },
      setPointerCapture() {}, querySelectorAll() { return []; },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
    };
    created.push(el); return el;
  };
  const doc = { hidden: false, head: mkEl('head'), body: mkEl('body'), createElement: mkEl, getElementById: () => null, addEventListener() {}, removeEventListener() {} };
  globalThis.window = win;
  globalThis.document = touch ? doc : undefined;
  Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: touch ? 5 : 0, getGamepads: pads ? () => pads.list : undefined }, configurable: true, writable: true });
  return { win, created, doc };
}
const key = (win, type, code, extra = {}) => { const e = Object.assign(new Event(type, { cancelable: true }), { code, repeat: false, ...extra }); win.dispatchEvent(e); return e; };
const button = (pressed, value) => ({ pressed, value: value ?? (pressed ? 1 : 0) });
const makePad = (over = {}) => ({ connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => button(false)), ...over });

test('keyboard: arrows and WASD drive throttle, brake, steer; opposite steer keys cancel', () => {
  const { win } = setup(); const im = new InputManager(null);
  assert.deepEqual({ ...im.read() }, { throttle: 0, brake: 0, steer: 0, drift: false, itemPressed: false, swapPressed: false, lookBack: false, pausePressed: false });
  key(win, 'keydown', 'ArrowUp'); key(win, 'keydown', 'ArrowRight');
  let r = im.read(); assert.equal(r.throttle, 1); assert.equal(r.steer, 1);
  key(win, 'keydown', 'KeyA'); assert.equal(im.read().steer, 0, 'left + right cancel');
  key(win, 'keyup', 'ArrowRight'); assert.equal(im.read().steer, -1);
  key(win, 'keyup', 'ArrowUp'); key(win, 'keydown', 'KeyS'); r = im.read(); assert.equal(r.brake, 1); assert.equal(r.throttle, 0);
  key(win, 'keyup', 'KeyS'); key(win, 'keyup', 'KeyA');
  key(win, 'keydown', 'KeyW'); key(win, 'keydown', 'KeyD'); r = im.read(); assert.deepEqual([r.throttle, r.steer], [1, 1]);
  im.dispose();
});

test('keyboard: Q and Tab swap the two held items (one-shot edge, separate from the use button)', () => {
  const { win } = setup(); const im = new InputManager(null);
  for (const code of ['KeyQ', 'Tab']) {
    key(win, 'keydown', code);
    const r = im.read();
    assert.equal(r.swapPressed, true, `${code} press`); assert.equal(r.itemPressed, false, `${code} is not the use button`);
    assert.equal(im.read().swapPressed, false, `${code} edge is single`);
    key(win, 'keydown', code, { repeat: true }); assert.equal(im.read().swapPressed, false, 'auto-repeat ignored');
    key(win, 'keyup', code);
  }
  key(win, 'keydown', 'KeyE'); const r = im.read(); assert.deepEqual([r.itemPressed, r.swapPressed], [true, false]);
  im.dispose();
});

test('keyboard: drift is held (Space / Shift), look back is held (C), item and pause are one-shot edges', () => {
  const { win } = setup(); const im = new InputManager(null);
  key(win, 'keydown', 'Space'); assert.equal(im.read().drift, true); assert.equal(im.read().drift, true);
  key(win, 'keyup', 'Space'); assert.equal(im.read().drift, false);
  key(win, 'keydown', 'ShiftLeft'); assert.equal(im.read().drift, true); key(win, 'keyup', 'ShiftLeft');
  for (const code of ['KeyC', 'KeyB']) { key(win, 'keydown', code); assert.equal(im.read().lookBack, true, code); key(win, 'keyup', code); assert.equal(im.read().lookBack, false); }
  for (const code of ['KeyE', 'Enter', 'KeyZ']) {
    key(win, 'keydown', code);
    assert.equal(im.read().itemPressed, true, `${code} press`); assert.equal(im.read().itemPressed, false, `${code} edge is single`);
    key(win, 'keydown', code, { repeat: true }); assert.equal(im.read().itemPressed, false, 'auto-repeat ignored');
    key(win, 'keyup', code);
  }
  for (const code of ['Escape', 'KeyP']) { key(win, 'keydown', code); assert.equal(im.read().pausePressed, true); assert.equal(im.read().pausePressed, false); key(win, 'keyup', code); }
  im.dispose();
});

test('keyboard: game keys are consumed, other keys and text fields are not; disabled manager ignores everything', () => {
  const { win } = setup(); const im = new InputManager(null);
  assert.equal(key(win, 'keydown', 'Space').defaultPrevented, true, 'space must not scroll the page');
  assert.equal(key(win, 'keydown', 'KeyX').defaultPrevented, false, 'a non-game key is left alone');
  assert.equal(key(win, 'keydown', 'KeyQ').defaultPrevented, true, 'Q (swap items) is a game key');
  const inField = Object.assign(new Event('keydown', { cancelable: true }), { code: 'KeyW', repeat: false });
  Object.defineProperty(inField, 'target', { value: { tagName: 'INPUT' } });
  win.dispatchEvent(inField); assert.equal(inField.defaultPrevented, false);
  key(win, 'keyup', 'Space');
  assert.equal(im.read().throttle, 0);
  im.setEnabled(false);
  const e = key(win, 'keydown', 'KeyW'); assert.equal(e.defaultPrevented, false, 'menus keep their keys');
  key(win, 'keydown', 'KeyE');
  im.setEnabled(true); const r = im.read();
  assert.deepEqual([r.throttle, r.itemPressed], [0, false], 'nothing leaks from the disabled period');
  key(win, 'keydown', 'KeyW'); assert.equal(im.read().throttle, 1);
  im.setEnabled(false); const rr = im.read(); assert.deepEqual([rr.throttle, rr.steer, rr.drift], [0, 0, false]);
  im.dispose();
});

test('keyboard: blur releases every key; legacy key names work without code', () => {
  const { win } = setup(); const im = new InputManager(null);
  key(win, 'keydown', 'ArrowUp'); key(win, 'keydown', 'Space'); win.dispatchEvent(new Event('blur'));
  const r = im.read(); assert.deepEqual([r.throttle, r.drift], [0, false]);
  const e = Object.assign(new Event('keydown', { cancelable: true }), { code: '', key: 'ArrowLeft', repeat: false }); win.dispatchEvent(e);
  assert.equal(im.read().steer, -1); im.dispose();
});

test('dispose removes listeners', () => {
  const { win } = setup(); const im = new InputManager(null);
  im.dispose(); key(win, 'keydown', 'KeyW'); assert.equal(im.read().throttle, 0);
});

test('stickCurve: dead zone, symmetric, monotonic, reaches 1', () => {
  assert.equal(stickCurve(0.1), 0); assert.equal(stickCurve(-0.13), 0);
  assert.ok(Math.abs(stickCurve(1) - 1) < 1e-9); assert.ok(Math.abs(stickCurve(-1) + 1) < 1e-9);
  let last = 0; for (let x = 0.15; x <= 1; x += 0.05) { const v = stickCurve(x); assert.ok(v > last, `monotonic at ${x}`); assert.equal(stickCurve(-x), -v); last = v; }
  assert.ok(stickCurve(0.5) < 0.5, 'expo curve gives fine control near the centre');
});

test('gamepad: triggers, A/B, stick with dead zone, d-pad, RB drift, X item edge, LB swap edge, Y look back, Start pause edge', () => {
  const pads = { list: [null] };
  const { win } = setup({ pads }); const im = new InputManager(null);
  void win;
  const pad = makePad(); pads.list = [pad];
  assert.deepEqual([im.read().throttle, im.read().steer], [0, 0]);
  pad.buttons[7] = button(true, 0.7); let r = im.read(); assert.ok(Math.abs(r.throttle - 0.7) < 1e-9);
  pad.buttons[7] = button(false, 0); pad.buttons[0] = button(true); assert.equal(im.read().throttle, 1); pad.buttons[0] = button(false);
  pad.buttons[6] = button(true, 0.4); r = im.read(); assert.ok(Math.abs(r.brake - 0.4) < 1e-9); pad.buttons[6] = button(false, 0);
  pad.buttons[1] = button(true); assert.equal(im.read().brake, 1); pad.buttons[1] = button(false);
  pad.axes[0] = 0.08; assert.equal(im.read().steer, 0); pad.axes[0] = 0.6; r = im.read(); assert.ok(r.steer > 0.2 && r.steer < 0.6);
  pad.axes[0] = -1; assert.equal(im.read().steer, -1); pad.axes[0] = 0;
  pad.buttons[15] = button(true); assert.equal(im.read().steer, 1); pad.buttons[15] = button(false);
  pad.buttons[14] = button(true); assert.equal(im.read().steer, -1); pad.buttons[14] = button(false);
  pad.buttons[5] = button(true); assert.equal(im.read().drift, true); pad.buttons[5] = button(false); assert.equal(im.read().drift, false);
  pad.buttons[3] = button(true); assert.equal(im.read().lookBack, true); pad.buttons[3] = button(false);
  pad.buttons[2] = button(true);
  assert.equal(im.read().itemPressed, true); assert.equal(im.read().itemPressed, false, 'held X gives one edge'); pad.buttons[2] = button(false); im.read();
  pad.buttons[4] = button(true); r = im.read(); assert.equal(r.swapPressed, true, 'LB swaps the two items'); assert.equal(r.itemPressed, false, 'LB is not the use button any more'); assert.equal(im.read().swapPressed, false, 'held LB gives one edge'); pad.buttons[4] = button(false); im.read();
  pad.buttons[9] = button(true); assert.equal(im.read().pausePressed, true); assert.equal(im.read().pausePressed, false); pad.buttons[9] = button(false);
  pad.buttons[7] = button(true, 1); pad.buttons[6] = button(true, 1); r = im.read(); assert.deepEqual([r.throttle, r.brake], [0, 1], 'brake wins');
  assert.equal(im.lastDevice, 'gamepad');
  pads.list = [null]; assert.equal(im.read().brake, 0);
  im.dispose();
});

test('keyboard and gamepad combine (steer adds, clamped)', () => {
  const pads = { list: [makePad({ axes: [1, 0, 0, 0] })] };
  const { win } = setup({ pads }); const im = new InputManager(null);
  key(win, 'keydown', 'ArrowLeft'); assert.equal(im.read().steer, 0);
  key(win, 'keyup', 'ArrowLeft'); key(win, 'keydown', 'ArrowRight'); assert.equal(im.read().steer, 1);
  im.dispose();
});

test('bindingsHelp lists every action with keys', () => {
  setup(); const im = new InputManager(null);
  const help = im.bindingsHelp();
  const actions = help.map((h) => h.action.toLowerCase());
  for (const need of ['accelerate', 'brake', 'steer', 'drift', 'item', 'swap', 'look back', 'pause']) assert.ok(actions.some((a) => a.includes(need)), need);
  assert.ok(help.every((h) => Array.isArray(h.keys) && h.keys.length > 0 && h.keys.every((k) => typeof k === 'string')));
  im.dispose();
});

test('touch overlay: created on touch devices, auto-accelerates, analog steer pad, DRIFT hold, ITEM edge, BRAKE, hides when disabled', () => {
  const { created } = setup({ touch: true });
  const im = new InputManager(null);
  const root = created.find((e) => e.id === 'mk-touch');
  assert.ok(root, 'overlay exists');
  const byClass = (c) => created.find((e) => e.className.split(' ').includes(c));
  const pad = byClass('mk-pad'), drift = byClass('mk-drift'), item = byClass('mk-item'), brake = byClass('mk-brake');
  const fire = (el, type, x = 0, id = 1) => el.handlers[type]?.forEach((fn) => fn({ pointerId: id, clientX: x, clientY: 0, preventDefault() {} }));
  let r = im.read(); assert.deepEqual([r.throttle, r.steer, r.drift], [1, 0, false], 'auto-accelerate on');
  fire(pad, 'pointerdown', 190); r = im.read(); assert.equal(r.steer, 1, 'right edge of the pad = full right');
  fire(pad, 'pointermove', 10); assert.equal(im.read().steer, -1);
  fire(pad, 'pointermove', 100); assert.equal(im.read().steer, 0);
  fire(pad, 'pointermove', 140); r = im.read(); assert.ok(r.steer > 0.1 && r.steer < 0.9, 'analog in between');
  fire(pad, 'pointerup'); assert.equal(im.read().steer, 0);
  fire(drift, 'pointerdown'); assert.equal(im.read().drift, true); assert.equal(im.read().drift, true); fire(drift, 'pointerup'); assert.equal(im.read().drift, false);
  fire(item, 'pointerdown'); assert.equal(im.read().itemPressed, true); assert.equal(im.read().itemPressed, false);
  fire(byClass('mk-look'), 'pointerdown'); assert.equal(im.read().lookBack, true); fire(byClass('mk-look'), 'pointerup'); assert.equal(im.read().lookBack, false);
  fire(brake, 'pointerdown'); r = im.read(); assert.deepEqual([r.throttle, r.brake], [0, 1]); fire(brake, 'pointerup'); assert.equal(im.read().brake, 0);
  im.setEnabled(false); assert.equal(root.style.display, 'none'); assert.equal(im.read().throttle, 0);
  im.setEnabled(true); assert.equal(root.style.display, 'block');
  im.setTouchVisible(false); assert.equal(root.style.display, 'none'); assert.equal(im.read().throttle, 0);
  im.setTouchVisible(true);
  im.dispose(); assert.equal(root.parentNode, null);
});

test('no touch overlay on non-touch devices', () => {
  const { created } = setup({ touch: false });
  const im = new InputManager(null);
  assert.equal(created.filter((e) => e.id === 'mk-touch' || e.className.includes('mk-')).length, 0); im.dispose();
});

test('gamepad: look back on Y or a right-stick click', () => {
  const pads = { list: [makePad()] }; setup({ pads }); const im = new InputManager(null);
  assert.equal(im.read().lookBack, false);
  for (const i of [3, 11]) { pads.list[0].buttons[i] = button(true); assert.equal(im.read().lookBack, true, `button ${i}`); pads.list[0].buttons[i] = button(false); }
  assert.equal(im.read().lookBack, false);
  im.dispose();
});
