// Screenshot demo: the touch overlay in a real browser + a scripted pointer session that logs what read() returns.
//   node tools/shot.mjs test/demo_drive_input.js shots/drive/touch.png --wait 2500 --w 900 --h 420
import { InputManager } from '../src/core/input.js';

document.body.style.background = 'linear-gradient(#4aa8ff,#cfeaff 60%,#3f8f4a 60%)';
const im = new InputManager(document.getElementById('game'), { touch: true });
const ev = (el, type, x, y, id = 1) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true }));
const $ = (sel) => document.querySelector(sel);
const pad = $('#mk-touch .mk-pad'), r = pad.getBoundingClientRect();
const log = (label) => { const s = im.read(); console.log(label, JSON.stringify({ t: +s.throttle.toFixed(2), b: s.brake, st: +s.steer.toFixed(2), d: s.drift, item: s.itemPressed, pause: s.pausePressed })); };
log('idle (auto-accelerate)');
ev(pad, 'pointerdown', r.left + r.width * 0.9, r.top + r.height / 2); log('pad far right');
ev(pad, 'pointermove', r.left + r.width * 0.3, r.top + r.height / 2); log('pad left of centre');
ev($('#mk-touch .mk-drift'), 'pointerdown', 0, 0, 2); log('drift held');
ev($('#mk-touch .mk-item'), 'pointerdown', 0, 0, 3); log('item tap'); log('item next read');
ev($('#mk-touch .mk-brake'), 'pointerdown', 0, 0, 4); log('brake held');
window.__ready = true;
