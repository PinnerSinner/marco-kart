// Every item has its own recognisable sound (use / hit / end), all synthesised, short, loud enough, never clipping, and different from each other.
// Rendered for real with node-web-audio-api's OfflineAudioContext (see tools/sfx_lib.mjs); skipped when that dev dependency is missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SFX } from '../src/audio/sfx.js';
import { ITEM_IDS } from '../src/core/config.js';
import { ITEM_RECIPES, levelledNames } from '../src/audio/sfx_items.js';
import { ITEM_LEVELS } from '../src/audio/sfx_levels.js';
import { AudioManager } from '../src/audio/AudioManager.js';
import { makeMockContext } from './drive_mockaudio.js';
import { webAudio, renderDef, measure, toDb, CALIBRATION } from '../tools/sfx_lib.mjs';

const HIT = ['cable', 'ping', 'traceroute', 'sudo', 'outage', 'kernel_panic', 'sniffer', 'bsod', 'autoscale', 'spill', 'zeroday', 'pods',
  'forcepush', 'pigeon', 'capacitor', 'legacy', 'cronjob', 'poo', 'woof', 'fetch'];
const END = ['sudo', 'firewall', 'fibre', 'autoscale', 'pods', 'legacy', 'zoomies'];
const SLOT_SOUNDS = ['roulette-tick', 'roulette-land', 'item-get', 'box-pickup', 'item-swap', 'item-full', 'ui-error'];
const itemSounds = () => Object.keys(SFX).filter((n) => /^item-(use|hit|end)-/.test(n));

test('all 24 items have their own use sound; hostile items a hit sound; timed items an end cue; none is an alias of another', () => {
  assert.equal(ITEM_IDS.length, 24);
  const seen = new Map();
  for (const id of ITEM_IDS) {
    const d = SFX[`item-use-${id}`];
    assert.ok(d, `item-use-${id} exists`);
    assert.notEqual(d, SFX['item-use'], `${id} does not fall back to the generic item-use`);
  }
  for (const id of HIT) assert.ok(SFX[`item-hit-${id}`], `item-hit-${id}`);
  for (const id of END) assert.ok(SFX[`item-end-${id}`], `item-end-${id}`);
  for (const name of [...itemSounds(), 'item-charge', 'item-charge-ready', 'item-catch', ...SLOT_SOUNDS]) {
    const d = SFX[name]; assert.ok(d, name);
    const src = String((d.raw ?? d.play));
    assert.ok(!seen.has(d) && !seen.has(src), `${name} shares its recipe with ${seen.get(d) ?? seen.get(src)}`);
    seen.set(d, name); seen.set(src, name);
  }
  assert.ok(itemSounds().length >= 50, `${itemSounds().length} item sounds`);
  // every sound that gets a loudness trim has one, and every recipe is levelled
  for (const n of levelledNames()) assert.ok(ITEM_LEVELS[n] > 0, `${n} has a calibrated level`);
  for (const n of Object.keys(ITEM_RECIPES)) assert.ok(SFX[n].raw, `${n} keeps its raw recipe for calibration`);
});

test('the slot sounds (roulette landing, swap, full) are distinct from the pickup and from each other', () => {
  for (const n of ['roulette-land', 'item-swap', 'item-full']) { assert.ok(SFX[n]); assert.ok(SFX[n].dur < 0.6); }
  assert.notEqual(String(SFX['item-swap'].raw), String(SFX['roulette-tick'].play));
});

test('item sounds render without NaN, never clip, are short, and share one loudness', async (t) => {
  if (!(await webAudio())) return t.skip('node-web-audio-api not installed');
  const rows = [];
  for (const name of [...itemSounds(), 'item-charge', 'item-charge-ready', 'item-catch', 'roulette-land', 'item-swap', 'item-full']) {
    const m = measure(await renderDef(SFX[name]));
    rows.push({ name, ...m });
    assert.equal(m.nan, 0, `${name} NaN`);
    assert.ok(m.peak < 0.75, `${name} peak ${m.peak.toFixed(2)} (soft clip holds 0.7)`);
    assert.ok(m.peak > 0.15, `${name} is not silent (peak ${m.peak.toFixed(3)})`);
    assert.ok(m.seconds >= 0.15 && m.seconds <= 1.25, `${name} audible ${m.seconds.toFixed(2)} s`);
    assert.ok(Math.abs(toDb(m.rms) - CALIBRATION.targetDb) <= 2, `${name} loudness ${toDb(m.rms).toFixed(1)} dB vs ${CALIBRATION.targetDb}`);
  }
  assert.ok(rows.length >= 55, `${rows.length} sounds rendered`);
});

/** A rough fingerprint: 16-bin RMS envelope (shape and rhythm), zero-crossing rate (pitch / brightness) and length. */
function fingerprint({ channels, sampleRate }) {
  const x = channels[0], n = x.length, m = measure({ channels, sampleRate });
  const a = Math.floor(m.startSec * sampleRate), b = Math.max(a + 1, Math.floor(m.endSec * sampleRate));
  const env = [], bins = 16;
  let zc = 0;
  for (let i = a + 1; i < b && i < n; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) zc++;
  for (let k = 0; k < bins; k++) { let s = 0; const lo = a + Math.floor(((b - a) * k) / bins), hi = a + Math.floor(((b - a) * (k + 1)) / bins); for (let i = lo; i < hi; i++) s += x[i] * x[i]; env.push(Math.sqrt(s / Math.max(1, hi - lo))); }
  const top = Math.max(...env, 1e-9);
  return { env: env.map((v) => v / top), zcr: zc / Math.max(1e-3, (b - a) / sampleRate), len: (b - a) / sampleRate };
}
const distance = (p, q) => {
  let e = 0; for (let i = 0; i < p.env.length; i++) e += Math.abs(p.env[i] - q.env[i]);
  return e / p.env.length + 0.35 * Math.abs(Math.log2(Math.max(p.zcr, 50) / Math.max(q.zcr, 50))) + 0.25 * Math.abs(Math.log2(p.len / q.len));
};

test('the 24 item-use sounds are pairwise clearly different (envelope / rhythm, pitch-brightness and length)', async (t) => {
  if (!(await webAudio())) return t.skip('node-web-audio-api not installed');
  const fp = {};
  for (const id of ITEM_IDS) fp[id] = fingerprint(await renderDef(SFX[`item-use-${id}`]));
  let min = Infinity, pair = '';
  for (let i = 0; i < ITEM_IDS.length; i++) for (let j = i + 1; j < ITEM_IDS.length; j++) {
    const d = distance(fp[ITEM_IDS[i]], fp[ITEM_IDS[j]]);
    if (d < min) { min = d; pair = `${ITEM_IDS[i]} / ${ITEM_IDS[j]}`; }
  }
  assert.ok(min > 0.12, `closest pair ${pair}: distance ${min.toFixed(3)}`);
});

test('player-owned item sounds are centred and clear; a rival\'s far item sound is positional and quieter or dropped', () => {
  const am = new AudioManager({ autoAttach: false });
  am.ctx = makeMockContext(); am.unlocked = true; am._buildGraph();
  am.player = { id: 1, pos: { x: 0, y: 0, z: 0 } };
  am._cam = { x: 0, y: 3, z: -9, rx: 1, rz: 0, ready: true };         // chase camera behind the kart
  const panners = () => am.ctx.stats.byKind.panner ?? 0;
  assert.equal(am._onSfxEvent({ name: 'item-use-ping', pos: { x: 0.5, y: 0, z: 1 } }), true);
  assert.equal(panners(), 0, 'own item: centred, no panner');
  am.ctx.currentTime += 1;
  assert.equal(am._onSfxEvent({ name: 'item-use-sudo', pos: { x: 30, y: 0, z: 10 } }), true);
  assert.ok(panners() >= 1, 'a rival\'s item is panned');
  am.ctx.currentTime += 1;
  assert.equal(am._onSfxEvent({ name: 'item-use-cable', pos: { x: 400, y: 0, z: 10 } }), false, 'out of earshot: dropped');
  // the bus cues map onto the new sounds
  assert.ok(SFX['roulette-land'] && SFX['item-swap'] && SFX['item-full']);
  am.dispose();
});
