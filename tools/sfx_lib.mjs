// Offline rendering and measuring of the synthesised sfx in Node (uses the `node-web-audio-api` dev dependency: a real OfflineAudioContext).
// Shared by tools/sfx_audition.mjs and test/audio_items.test.js.
import fs from 'node:fs';

export const RATE = 44100;
let _api;
/** @returns {Promise<any|null>} the web-audio module, or null when it is not installed */
export async function webAudio() {
  if (_api === undefined) { try { _api = await import('node-web-audio-api'); installParamShim(_api); } catch { _api = null; } }
  return _api;
}

// node-web-audio-api computes a setTargetAtTime that is followed by a later event incorrectly once more than ~15 time constants separate them
// (the gain explodes to 1e20; browsers are fine, and synth.js's adsr() does exactly this). So in Node every automation call is recorded and, just
// before rendering, replayed with each setTargetAtTime expanded into short exact-exponential steps. Same curve, none of the numeric trouble.
function installParamShim(api) {
  const P = api.AudioParam.prototype, store = new Map();
  const rec = (p, e) => { let l = store.get(p); if (!l) { l = []; store.set(p, l); } l.push(e); return p; };
  const native = { set: P.setValueAtTime, lin: P.linearRampToValueAtTime, exp: P.exponentialRampToValueAtTime };
  P.setValueAtTime = function (v, t) { return (rec(this, { k: 'set', v, t }), this); };
  P.linearRampToValueAtTime = function (v, t) { rec(this, { k: 'lin', v, t }); return this; };
  P.exponentialRampToValueAtTime = function (v, t) { rec(this, { k: 'exp', v, t }); return this; };
  P.setTargetAtTime = function (v, t, tc) { rec(this, { k: 'target', v, t, tc }); return this; };
  P.cancelScheduledValues = function (t) { const l = store.get(this); if (l) store.set(this, l.filter((e) => e.t < t)); return this; };
  const flush = () => {
    for (const [p, list] of store) {
      const ev = list.map((e, i) => ({ ...e, i })).sort((a, b) => a.t - b.t || a.i - b.i);
      let cur = { t: 0, v: p.value, target: null };            // value model: after `t` it is `v`, or an exponential approach to target
      const at = (t) => (cur.target ? cur.target.v + (cur.v - cur.target.v) * Math.exp(-(t - cur.t) / cur.target.tc) : cur.v);
      ev.forEach((e, k) => {
        if (e.k === 'set') { native.set.call(p, e.v, e.t); cur = { t: e.t, v: e.v, target: null }; }
        else if (e.k === 'lin') { native.lin.call(p, e.v, e.t); cur = { t: e.t, v: e.v, target: null }; }
        else if (e.k === 'exp') { native.exp.call(p, Math.max(e.v, 1e-6), e.t); cur = { t: e.t, v: e.v, target: null }; }
        else {
          const v0 = at(e.t), tc = Math.max(e.tc, 1e-5), end = Math.min(ev[k + 1] ? ev[k + 1].t : Infinity, e.t + tc * 9);
          const step = Math.max(Math.min(0.0012, tc / 4), (end - e.t) / 3000);
          native.set.call(p, v0, e.t);
          for (let t = e.t + step; t < end; t += step) native.set.call(p, e.v + (v0 - e.v) * Math.exp(-(t - e.t) / tc), t);
          cur = { t: e.t, v: v0, target: { v: e.v, tc } };
        }
      });
    }
    store.clear();
  };
  const O = api.OfflineAudioContext.prototype, start = O.startRendering;
  O.startRendering = function (...a) { flush(); return start.apply(this, a); };
}

/**
 * Render one sound definition to stereo float arrays.
 * @param {{dur: number, play: Function, raw?: Function}} def @param {{pitch?: number, vol?: number, raw?: boolean, tail?: number}} [o]
 */
export async function renderDef(def, { pitch = 1, vol = 1, raw = false, tail = 0.9 } = {}) {
  const api = await webAudio();
  if (!api) throw new Error('node-web-audio-api is not installed');
  const ctx = new api.OfflineAudioContext(2, Math.ceil((def.dur + tail) * RATE), RATE);
  const bus = ctx.createGain();
  bus.connect(ctx.destination);
  (raw && def.raw ? def.raw : def.play)(ctx, bus, 0.02, { pitch, vol });
  const buf = await ctx.startRendering();
  return { channels: [buf.getChannelData(0), buf.getChannelData(1)], sampleRate: RATE };
}

/** Peak, loudest 150 ms RMS (dBFS-style linear values), audible length and NaN count of a render. */
export function measure({ channels, sampleRate }) {
  const n = channels[0].length;
  let peak = 0, nan = 0, first = -1, last = -1;
  for (let i = 0; i < n; i++) {
    for (const ch of channels) {
      const v = ch[i];
      if (!Number.isFinite(v)) { nan++; continue; }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a > 0.004) { if (first < 0) first = i; last = i; }
    }
  }
  const win = Math.round(sampleRate * 0.15), hop = Math.round(sampleRate * 0.03);
  let best = 0;
  for (let s = 0; s + win <= n; s += hop) {
    let sum = 0;
    for (const ch of channels) for (let i = s; i < s + win; i++) { const v = ch[i]; if (Number.isFinite(v)) sum += v * v; }
    best = Math.max(best, Math.sqrt(sum / (win * channels.length)));
  }
  return { peak, rms: best, nan, seconds: first < 0 ? 0 : (last - first) / sampleRate, startSec: first < 0 ? 0 : first / sampleRate, endSec: last < 0 ? 0 : last / sampleRate };
}

export const toDb = (x) => 20 * Math.log10(Math.max(x, 1e-9));
export const CALIBRATION = Object.freeze({ targetDb: -15, peakCeiling: 0.72 });   // loudest 150 ms RMS of every item sound, and its peak ceiling (the soft clipper holds it at 0.7, about -3 dBFS)

/** 16-bit PCM stereo WAV bytes. */
export function wavBytes({ channels, sampleRate }) {
  const n = channels[0].length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[c][i])) * 32767), 44 + i * 4 + c * 2);
  return buf;
}
export const writeWav = (file, render) => fs.writeFileSync(file, wavBytes(render));
