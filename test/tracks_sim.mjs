// Traffic-aware AI sim for the Copacabana and Blighty tracks: a Race with `updateTrack: true`, so moving traffic, gates and floats really move
// (test/race_sim_report.mjs builds Race WITHOUT it, which freezes everything driven by track.update).
//   node test/tracks_sim.mjs [--track copacabana|blighty|all] [--laps 3] [--n 8] [--seed 1] [--class 100] [--difficulty professional]
// Prints per-racer times and counts respawns, vehicle jumps (kart:vehicle-jump), cleared jumps (traffic:jumped), spins, wall hits and falls.
// Exit code 1 when any racer needed a respawn or the race did not finish.
import { Race } from '../src/race/Race.js';
import { realKartFactory } from '../src/race/kartFactory.js';
import { CHARACTERS, KARTS } from '../src/core/roster.js';
import { bus } from '../src/core/bus.js';
import { createTrack } from '../src/track/index.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def; };
const which = opt('track', 'all'), laps = Number(opt('laps', 3)), n = Number(opt('n', 8)), seed = Number(opt('seed', 1)), speedClass = Number(opt('class', 100));
const difficulty = opt('difficulty', 'professional'), DT = 1 / 60;
const fmt = (t) => (t == null ? '   --  ' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`);

export async function simTrack(trackId, { laps: L = laps, n: N = n, seed: S = seed, speedClass: C = speedClass, quiet = false } = {}) {
  const track = createTrack(trackId, { headless: true });
  const roster = CHARACTERS.slice(0, N);
  const entries = roster.map((ch, i) => ({ id: ch.id, name: ch.name, charId: ch.id, kartId: KARTS[i % KARTS.length].id, isPlayer: false }));
  const race = new Race({ track, entries, laps: L, difficulty, seed: S, kartFactory: realKartFactory, updateTrack: true, speedClass: C });
  const c = { respawn: 0, spin: 0, wall: 0, vjump: 0, cleared: 0, fall: 0, respawnIds: new Map(), jumpBy: new Map() };
  const offs = [
    bus.on('kart:respawn', (d) => { c.respawn++; c.respawnIds.set(d?.id, (c.respawnIds.get(d?.id) ?? 0) + 1); }),
    bus.on('kart:spin', () => c.spin++), bus.on('kart:wall-hit', () => c.wall++),
    bus.on('kart:vehicle-jump', (d) => { c.vjump++; c.jumpBy.set(d.vehicleId, (c.jumpBy.get(d.vehicleId) ?? 0) + 1); }),
    bus.on('traffic:jumped', () => c.cleared++),
    bus.on('kart:fall', () => c.fall++),
  ];
  // fork usage: which racers spend time on each ribbon road (sampled 5 times a second); wall hits by 50 m of track
  const forks = new Map(), wallAt = new Map(), tmp = {}, ribbons = track.ribbons ?? [];
  const offW = bus.on('kart:wall-hit', (d) => { const rc = race.byId.get(d.id); if (rc?.kart?.pos) { track.sample(track.query(rc.kart.pos, {}).s, tmp); const k = Math.floor(track.query(rc.kart.pos, {}).s / 50) * 50; wallAt.set(k, (wallAt.get(k) ?? 0) + 1); } });
  const t0 = performance.now();
  let steps = 0;
  while (race.state !== 'finished' && steps < 60 * 900) {
    race.step(DT, null); steps++;
    if (ribbons.length && steps % 12 === 0) for (const rc of race.racers) { const p = rc.kart?.pos; if (!p) continue; const q = track.query(p, {}); if (Math.abs(q.lateral) <= track.widthAt(q.s) / 2 + 1) continue; for (const rb of ribbons) if (rb.edgeDistance(p.x, p.z) < -1) { const k = `${rb.def.id}`; if (!forks.has(k)) forks.set(k, new Set()); forks.get(k).add(rc.id + '#' + rc.lap); } }
  }
  offW();
  const ms = performance.now() - t0;
  offs.forEach((o) => o());
  const res = race.results(), done = res.filter((r) => r.time != null);
  if (!quiet) {
    console.log(`\n== ${track.id} ${L} laps ${difficulty} seed ${S} class ${C}  ${race.time.toFixed(1)} s sim, ${(ms / 1000).toFixed(1)} s wall  length ${track.length.toFixed(0)} m`);
    for (const r of res) {
      const rc = race.byId.get(r.id);
      console.log(`${String(r.place).padStart(3)} ${r.name.padEnd(16)} ${rc.kartId.padEnd(8)} ${fmt(r.time)} best ${fmt(r.bestLap)}  ${rc.lapTimes.map((x) => x.toFixed(1)).join(' / ')}`);
    }
    console.log(`finished ${done.length}/${res.length}  respawns ${c.respawn}  spins ${c.spin}  wall hits ${c.wall}  falls ${c.fall}  vehicle jumps ${c.vjump} (cleared ${c.cleared})`);
    if (forks.size) console.log('fork road passes (racer-laps):', [...forks.entries()].map(([k, v]) => `${k}:${v.size}`).join(' '));
    if (wallAt.size) console.log('wall hits by s:', [...wallAt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`).join(' '));
    if (c.jumpBy.size) console.log('jumps by vehicle:', [...c.jumpBy.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
  }
  return { track, race, c, finished: done.length === res.length, lapTime: done.length ? Math.min(...done.map((r) => r.bestLap ?? Infinity)) : null };
}

if (process.argv[1].endsWith('tracks_sim.mjs')) {
  let bad = 0;
  for (const id of which === 'all' ? ['copacabana', 'blighty'] : [which]) {
    const r = await simTrack(id);
    if (r.c.respawn > 0 || !r.finished) bad++;
  }
  process.exit(bad ? 1 : 0);
}
