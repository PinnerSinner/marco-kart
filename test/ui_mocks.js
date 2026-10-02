// Mock data for the UI demos and tests: fake HudSnapshots, results, standings and a mock InputManager.
import { CHARACTERS } from '../src/core/roster.js';

/** A stand-in for InputManager.bindingsHelp(). */
export const MOCK_INPUT = {
  bindingsHelp: () => [
    { action: 'Accelerate', keys: ['W', 'Up', 'RT', 'A'] },
    { action: 'Brake / reverse', keys: ['S', 'Down', 'LT', 'B'] },
    { action: 'Steer', keys: ['A', 'D', 'Left', 'Right', 'Left stick', 'D-pad'] },
    { action: 'Drift (hold)', keys: ['Space', 'Shift', 'RB'] },
    { action: 'Use item (front slot)', keys: ['E', 'Enter', 'Z', 'Gamepad: X'] },
    { action: 'Swap the two items', keys: ['Q', 'Tab', 'Gamepad: LB', 'Touch: tap the small slot'] },
    { action: 'Look back', keys: ['C', 'Y'] },
    { action: 'Pause', keys: ['Esc', 'P', 'Start'] },
  ],
  setEnabled() {}, setTouchVisible() {},
};

/** An elliptical-ish track outline with a wiggle, as a stand-in for track.minimapOutline(). */
export function mockOutline(n = 96) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 210 + 46 * Math.sin(a * 3) + 26 * Math.cos(a * 2);
    pts.push([Math.cos(a) * r * 1.35, Math.sin(a) * r * 0.85]);
  }
  return pts;
}

const OUTLINE = mockOutline();

/**
 * Build a HudSnapshot. Every field can be overridden.
 * @param {object} [o] overrides
 * @param {number} [t] animation time in seconds (moves the minimap dots)
 */
export function mockHud(o = {}, t = 0) {
  const chars = CHARACTERS.slice(0, 8);
  const place = o.place ?? 3;
  const order = chars.map((c, i) => ({ c, i }));
  // put the player (marco) at `place`
  const rest = order.filter((x) => x.c.id !== 'marco');
  rest.splice(place - 1, 0, order.find((x) => x.c.id === 'marco'));
  const standings = rest.map((x, idx) => ({ id: x.c.id, name: x.c.name, charId: x.c.id, place: idx + 1, lap: o.lap ?? 2, finished: !!o.finished && idx < 4, isPlayer: x.c.id === 'marco' }));
  const karts = chars.map((c, i) => {
    const a = (t * 0.15 + (8 - standings.find((s) => s.id === c.id).place) * 0.09) * Math.PI * 2;
    const k = OUTLINE[Math.floor(((a / (Math.PI * 2)) % 1 + 1) % 1 * OUTLINE.length)];
    return { id: c.id, x: k[0], z: k[1], isPlayer: c.id === 'marco', place: standings.find((s) => s.id === c.id).place, colour: c.colour };
  });
  return {
    state: 'racing', countdown: 0, time: 96.4, place, racers: 8, lap: 2, laps: 3, lapTimes: [48.211], bestLap: 48.211, speedKmh: 118,
    boost: { time: 0, power: 1 }, drift: { active: false, level: 0, charge: 0 }, item: null, item2: null, roulette: null, swapLocked: false, boxRefused: 0, shield: false,
    wrongWay: false, finished: false, finishTime: null, finalLap: false, standings,
    speedClass: 100, speedClassName: '100 Mbps', speedClassTag: 'Standard', speedC: 1,
    minimap: { outline: OUTLINE, karts }, ...o,
  };
}

/** Race results in the shape of race.results(). */
export function mockResults({ gp = false, playerPlace = 3 } = {}) {
  const order = CHARACTERS.filter((c) => c.id !== 'marco').map((c) => c.id);
  order.splice(playerPlace - 1, 0, 'marco');
  const pts = [15, 12, 10, 8, 6, 4, 2, 1];
  return order.map((id, i) => ({
    place: i + 1, id, name: CHARACTERS.find((c) => c.id === id).name, charId: id,
    time: i === 7 ? null : 178.2 + i * 2.37 + (id === 'marco' ? 0.4 : 0), bestLap: i === 7 ? null : 57.6 + i * 0.41,
    points: gp ? pts[i] : 0, isPlayer: id === 'marco',
  }));
}

/** GP standings (assumed shape: [{ id, name, charId, points, gained, isPlayer }]). */
export function mockStandings() {
  const res = mockResults({ gp: true, playerPlace: 2 });
  return res.map((r, i) => ({ id: r.id, name: r.name, charId: r.charId, points: r.points + [15, 30, 10, 22, 8, 4, 9, 3][i], gained: r.points, isPlayer: r.isPlayer, place: i + 1 }))
    .sort((a, b) => b.points - a.points).map((r, i) => ({ ...r, place: i + 1 }));
}
