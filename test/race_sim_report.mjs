// Sim report: headless AI races with per-racer lap times, hit counts and drift stats. Use it to tune the AI.
//   node test/race_sim_report.mjs [--track stub|fixture|copacabana|blighty|datacentre|marcoverse] [--difficulty professional]
//        [--laps 3] [--seed 1] [--n 8] [--solo] [--noitems] [--kart simple|physics] [--class 50|100|150|200]
// --solo: one racer at a time (each character) on an empty track, no items: clean lap times for calibrating pace.
import { StubTrack } from '../src/track/StubTrack.js';
import { Race } from '../src/race/Race.js';
import { simpleKartFactory, realKartFactory } from '../src/race/kartFactory.js';
import { CHARACTERS, KARTS } from '../src/core/roster.js';
import { bus } from '../src/core/bus.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def; };
const trackId = opt('track', 'stub');
const difficulty = opt('difficulty', 'professional');
const laps = Number(opt('laps', 3));
const seed = Number(opt('seed', 1));
const n = Number(opt('n', 8));
const speedClass = Number(opt('class', 100));
const solo = !!opt('solo', false);
const noItems = !!opt('noitems', false) || solo;
const kartFactory = opt('kart', 'physics') === 'simple' ? simpleKartFactory : realKartFactory;
const DT = 1 / 60;

async function loadTrack(id) {
  if (id === 'stub') return new StubTrack();
  if (id === 'fixture') {                                   // A2's synthetic circuit: hairpin, hill, esses, banked sweeper, jump, oil
    const { Track } = await import('../src/track/Track.js');
    const { fixtureDef } = await import('./tracks_fixture.js');
    return new Track(fixtureDef(), { headless: true });
  }
  const { createTrack } = await import('../src/track/index.js');
  return createTrack(id, { headless: true });
}

const fmt = (t) => (t == null ? '   --  ' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`);

function counters() {
  const c = { spin: 0, wall: 0, respawn: 0, drift: 0, driftLevel: new Map(), mini: new Map(), itemUse: new Map(), hitBy: new Map(), hitOn: new Map(), block: 0, overtakes: 0 };
  const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  const offs = [
    bus.on('kart:spin', (d) => bump(c.hitOn, d.id)),
    bus.on('kart:wall-hit', (d) => { c.wall++; bump(c.hitOn, `wall:${d.id}`); }),
    bus.on('kart:respawn', () => c.respawn++),
    bus.on('kart:drift-start', (d) => bump(c.driftLevel, d.id)),
    bus.on('kart:boost', (d) => { if (d.kind === 'drift') bump(c.mini, d.id); }),
    bus.on('item:use', (d) => bump(c.itemUse, d.item)),
    bus.on('item:hit', (d) => bump(c.hitBy, d.byId)),
    bus.on('item:block', () => c.block++),
    bus.on('race:overtake', () => c.overtakes++),
  ];
  c.off = () => offs.forEach((o) => o());
  return c;
}

function stripItems(track) { track.itemBoxes = []; return track; }

async function runRace(entries, label) {
  const track = await loadTrack(trackId);
  if (noItems) stripItems(track);
  const race = new Race({ track, entries, laps, difficulty, seed, kartFactory, speedClass });
  const c = counters();
  const t0 = performance.now();
  let steps = 0;
  while (race.state !== 'finished' && steps < 60 * 900) { race.step(DT, null); steps++; }
  const ms = performance.now() - t0;
  c.off();
  console.log(`\n== ${label}: ${track.id} ${laps} laps ${difficulty} seed ${seed} class ${speedClass} [${kartFactory.name}]  sim ${race.time.toFixed(1)} s in ${(ms / 1000).toFixed(2)} s wall (${(ms / steps).toFixed(3)} ms/step)`);
  console.log('place name               kart     total    best   laps');
  for (const r of race.results()) {
    const rc = race.byId.get(r.id);
    const spins = c.hitOn.get(r.id) ?? 0, walls = c.hitOn.get(`wall:${r.id}`) ?? 0, drifts = c.driftLevel.get(r.id) ?? 0, minis = c.mini.get(r.id) ?? 0;
    console.log(`${String(r.place).padStart(3)}   ${r.name.padEnd(18)} ${rc.kartId.padEnd(8)} ${fmt(r.time)} ${fmt(r.bestLap)}  ${rc.lapTimes.map((x) => x.toFixed(1)).join(' / ').padEnd(24)} spins ${spins} walls ${walls} drifts ${drifts} minis ${minis} hits ${c.hitBy.get(r.id) ?? 0}`);
  }
  const times = race.results().map((r) => r.time).filter((x) => x != null);
  if (times.length > 1) console.log(`spread: first ${fmt(times[0])} last ${fmt(times[times.length - 1])} (+${(times[times.length - 1] - times[0]).toFixed(1)} s)  respawns ${c.respawn} overtakes ${c.overtakes} blocks ${c.block}`);
  console.log('items used:', [...c.itemUse.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
  return { race, c };
}

const roster = CHARACTERS.slice(0, n);
if (solo) {
  for (const ch of roster) {
    const kartId = KARTS[CHARACTERS.indexOf(ch) % KARTS.length].id;
    await runRace([{ id: ch.id, name: ch.name, charId: ch.id, kartId, isPlayer: false }], `solo ${ch.name}`);
  }
} else {
  await runRace(roster.map((ch, i) => ({ id: ch.id, name: ch.name, charId: ch.id, kartId: KARTS[i % KARTS.length].id, isPlayer: false })), 'field');
}
