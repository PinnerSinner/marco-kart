// Shared demo driver for the UI: mounts the real UI over mock data and exposes window.__demo.go(state) so every screen and every HUD state
// can be screenshotted (test/ui_shoot.mjs) or opened one at a time through tools/shot.mjs (test/demo_ui_*.js).
import { UI } from '../src/ui/UI.js';
import { bus } from '../src/core/bus.js';
import { mockHud, mockResults, mockStandings, MOCK_INPUT } from './ui_mocks.js';

const EVENTS = ['ui:start', 'ui:continue', 'ui:pause', 'ui:resume', 'ui:restart', 'ui:quit', 'ui:settings', 'sfx', 'music', 'voice'];

/**
 * Start the demo UI.
 * @param {string} [initial] state to open first
 * @returns {{ ui: UI, go: (state: string) => void, states: string[] }}
 */
export function startDemo(initial = 'title') {
  const canvas = document.getElementById('game');
  if (canvas) { canvas.style.background = 'radial-gradient(90% 90% at 50% 30%,#5aa7ff,#1a3d78 70%,#0b1d3a)'; }
  const ui = new UI();
  ui.mount(document.getElementById('ui-root'));
  ui.setInput(MOCK_INPUT);
  const log = window.__events = [];
  for (const n of EVENTS) bus.on(n, (d) => { if (n !== 'sfx' || !/hover/.test(d?.name)) log.push({ n, d }); });

  let hudState = null; let hudT0 = 0; let raf = 0; let hudOn = false;
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (!hudOn || !hudState) return;
    const t = (now - hudT0) / 1000;
    const snap = typeof hudState === 'function' ? hudState(t) : hudState;
    ui.updateHud(snap, 1 / 60);
  };
  raf = requestAnimationFrame(loop);
  const hud = (fn) => { hudState = fn; hudOn = true; hudT0 = performance.now(); ui.hideAll(); ui.showHud(true); };
  const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));

  // jump straight to a step of the flow (deterministic: no timers, no wipes)
  const step = (mode, n) => {
    ui.hideAll();
    ui.showSelect({ mode });
    for (let i = 0; i < n; i++) ui.flow.confirm();
    ui.show(ui.flow.step);
  };

  const S = {
    loading: () => ui.showLoading('Charging the flux capacitor', 0.62),
    'loading-sweep': () => ui.showLoading('Reticulating splines'),
    title: () => ui.showTitle(),
    menu: () => ui.showMenu(),
    controls: () => { ui.showMenu(); setTimeout(() => ui.show('controls', { from: 'menu' }), 30); },
    settings: () => { ui.showMenu(); setTimeout(() => ui.show('settings', { from: 'menu' }), 30); },
    about: () => { ui.showMenu(); setTimeout(() => ui.show('about', { from: 'menu' }), 30); },
    items: () => { ui.showMenu(); setTimeout(() => ui.show('items', { from: 'menu' }), 30); },
    'pause-items': () => { hud((t) => mockHud({ time: 50 }, t)); ui.showPause(); ui.pause._view('items'); },
    'select-char': () => ui.showSelect({ mode: 'gp' }),
    'select-kart': () => step('gp', 1),
    'select-difficulty': () => step('single', 2),
    'select-difficulty-gp': () => step('gp', 2),
    'select-track': () => step('single', 3),
    'select-track-tt': () => step('time', 2),
    'hud-race': () => hud((t) => mockHud({ time: 96.4 + t, speedKmh: 118 + Math.sin(t) * 10 }, t)),
    'hud-first': () => hud((t) => mockHud({ place: 1, time: 40 + t, speedKmh: 141, lap: 1, lapTimes: [], bestLap: null }, t)),
    'hud-drift1': () => hud((t) => mockHud({ time: 60 + t, speedKmh: 132, drift: { active: true, level: 1, charge: 0.5 } }, t)),
    'hud-drift3': () => hud((t) => mockHud({ time: 60 + t, speedKmh: 132, drift: { active: true, level: 3, charge: 1 } }, t)),
    'hud-class-200': () => hud((t) => mockHud({ time: 60 + t, speedKmh: 196 + Math.sin(t) * 12, speedClass: 200, speedClassName: '200 Mbps', speedClassTag: 'Extreme', speedC: 1.5 }, t)),
    'hud-perfect-jump': () => { hud((t) => mockHud({ time: 60 + t, speedKmh: 150, boost: { time: 0.9, power: 0.5 } }, t)); setTimeout(() => bus.emit('kart:perfect-jump', { id: 'marco', isPlayer: true }), 250); },
    'hud-boost': () => hud((t) => mockHud({ time: 60 + t, speedKmh: 205, boost: { time: 0.9, power: 1 }, drift: { active: false, level: 0, charge: 0 } }, t)),
    'hud-item': () => hud((t) => mockHud({ time: 70 + t, item: { id: 'traceroute', count: 1 } }, t)),
    'hud-item3': () => hud((t) => mockHud({ time: 70 + t, item: { id: 'espresso', count: 3 } }, t)),
    'hud-roulette': () => hud((t) => mockHud({ time: 70 + t, roulette: { active: true, shown: ['cable', 'ping', 'traceroute', 'espresso', 'sudo', 'firewall', 'fibre', 'outage', 'kernel_panic'][Math.floor(t * 12) % 9] } }, t)),
    // two item slots (items: ids; `two` shows both slots from the first frame, `full` adds a refused box)
    'hud-items-one': () => hud((t) => mockHud({ time: 70 + t, item: { id: 'traceroute', count: 1 } }, t)),
    'hud-items-two': () => hud((t) => mockHud({ time: 70 + t, item: { id: 'kernel_panic', count: 1 }, item2: { id: 'espresso', count: 3 } }, t)),
    'hud-items-swap': () => hud((t) => mockHud({ time: 70 + t, item: t < 1 ? { id: 'kernel_panic', count: 1 } : { id: 'espresso', count: 3 }, item2: t < 1 ? { id: 'espresso', count: 3 } : { id: 'kernel_panic', count: 1 } }, t)),
    'hud-items-roll2': () => hud((t) => mockHud({ time: 70 + t, item: { id: 'outage', count: 1 }, roulette: { active: true, slot: 2, double: false, shown: ['cable', 'ping', 'traceroute', 'espresso', 'sudo', 'firewall'][Math.floor(t * 12) % 6] } }, t)),
    'hud-items-touch': () => { hud((t) => mockHud({ time: 70 + t, item: { id: 'kernel_panic', count: 1 }, item2: { id: 'espresso', count: 3 } }, t)); ui.setTouchLayout(true); ui.hud?.setInputDevice('touch'); },
    'hud-items-full': () => hud((t) => mockHud({ time: 70 + t, item: { id: 'ping', count: 1 }, item2: { id: 'sudo', count: 1 }, boxRefused: t > 0.5 ? 1 : 0 }, t)),
    'hud-items-locked': () => hud((t) => mockHud({ time: 70 + t, item: { id: 'capacitor', count: 1 }, item2: { id: 'firewall', count: 1 }, swapLocked: true, itemFx: { charging: true, charge: 1.2, zone: 'sweet' } }, t)),
    'hud-wrong': () => hud((t) => mockHud({ time: 70 + t, wrongWay: true, speedKmh: 40 }, t)),
    'hud-final': () => hud((t) => mockHud(t < 0.3 ? { lap: 2, finalLap: false } : { lap: 3, finalLap: true, lapTimes: [48.2, 47.1], bestLap: 47.1, time: 100 + t }, t)),
    'hud-countdown': () => { hud((t) => mockHud({ state: 'countdown', countdown: Math.max(0.01, 3 - t), time: 0, lap: 1, lapTimes: [], bestLap: null, place: 5, speedKmh: 0 }, t)); },
    'hud-go': () => { hud((t) => mockHud({ state: t < 0.05 ? 'countdown' : 'racing', countdown: t < 0.05 ? 0.5 : 0, time: Math.max(0, t - 0.05), lap: 1, lapTimes: [], bestLap: null, place: 5, speedKmh: 20 }, t)); },
    'hud-finish': () => hud((t) => mockHud({ time: 172.4, lap: 3, laps: 3, lapTimes: [58.1, 57.3, 57.0], bestLap: 57.0, finished: t > 0.2, finishTime: 172.4, place: 2, speedKmh: 90 }, t)),
    'hud-caption': () => { hud((t) => mockHud({ time: 50 + t }, t)); setTimeout(() => bus.emit('voice', { key: 'voice_overtake', charId: 'marco' }), 200); },
    results: () => { ui.hideAll(); ui.showRaceResults(mockResults({ playerPlace: 3 }), { gp: false, trackId: 'blighty' }); },
    'results-gp': () => { ui.hideAll(); ui.showRaceResults(mockResults({ gp: true, playerPlace: 2 }), { gp: true, trackId: 'copacabana' }); },
    'gp-standings': () => { ui.hideAll(); ui.showGpStandings(mockStandings(), { raceIndex: 1, total: 4 }); },
    'podium-gold': () => { ui.hideAll(); ui.showPodium({ standings: mockStandings().map((s, i) => ({ ...s, place: i + 1 })), trophy: 'gold' }); },
    'podium-none': () => { ui.hideAll(); ui.showPodium({ standings: mockStandings().map((s, i) => ({ ...s, place: i + 1 })), trophy: 'none' }); },
    pause: () => { hud((t) => mockHud({ time: 50 }, t)); ui.showPause(); },
  };

  const go = (state) => {
    if (!S[state]) throw new Error(`unknown demo state ${state}`);
    hudOn = false; hudState = null;
    S[state]();
  };
  window.__demo = { go, states: Object.keys(S), ui, key };
  go(initial);
  window.__ready = true;
  return { ui, go, states: Object.keys(S) };
}
