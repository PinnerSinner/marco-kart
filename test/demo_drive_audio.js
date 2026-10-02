// Headless-Chromium audio verification. Renders every SFX, the engine and all seven music tracks with an OfflineAudioContext,
// prints one `AUDIO {json}` line per item (peak, RMS, NaN, duration, loop seam, key fit) and paints waveform + spectrogram
// sheets so the music structure can be reviewed by eye.
//   node tools/shot.mjs test/demo_drive_audio.js shots/drive/audio.png --wait 280000 --w 1500 --h 1500
//   node tools/shot.mjs test/demo_drive_audio.js shots/drive/audio_sfx.png --wait 60000 --w 1500 --h 700 --only sfx   (see ONLY below)
import { SFX, REQUIRED_SFX } from '../src/audio/sfx.js';
import { SONGS, MUSIC_KEYS } from '../src/audio/music/index.js';
import { renderSfx, renderSong, renderEngine, levels, audibleSeconds, envelope, correlation, chroma, spectrum } from '../src/audio/offline.js';
import { noteToMidi } from '../src/audio/synth.js';
import { expandProgression } from '../src/audio/music/sequencer.js';

const params = new URLSearchParams(location.search);
const ONLY = (window.__ONLY__ ?? '').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);
const say = (o) => console.log('AUDIO ' + JSON.stringify(o));
const r3 = (v) => Math.round(v * 1000) / 1000;
const ui = document.getElementById('ui-root');
ui.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:#0b1020;color:#dfe8ff;font:12px ui-monospace,monospace;pointer-events:none';
const log = document.createElement('pre'); log.style.cssText = 'position:absolute;left:8px;top:6px;margin:0;z-index:2'; ui.appendChild(log);
const status = (t) => { log.textContent = t; };

const KEY_TONIC = { menu: 0, copacabana: 2, blighty: 7, datacentre: 9, marcoverse: 2, results: 0, podium: 2 };
const KEY_MINOR = { datacentre: true, marcoverse: true };
const PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Fraction of the chroma energy that lies on the given pitch classes. */
function share(ch, pcs) { let tot = 0, hit = 0; for (let i = 0; i < 12; i++) { tot += ch[i]; if (pcs.has(i)) hit += ch[i]; } return tot > 0 ? hit / tot : 0; }

async function sfxAll() {
  const rows = [];
  for (const name of REQUIRED_SFX) {
    status(`sfx ${name}`);
    const def = SFX[name];
    const r = await renderSfx(name);
    const lv = levels(r.channels);
    const aud = audibleSeconds(r.channels, r.sampleRate);
    const row = { kind: 'sfx', name, peak: r3(lv.peak), rms: r3(lv.rms), nan: lv.nan, dc: r3(lv.dc), seconds: r3(aud), declared: def.dur };
    // also at the extremes of the pitch range the manager can request
    const hi = levels((await renderSfx(name, { pitch: 2 })).channels), lo = levels((await renderSfx(name, { pitch: 0.5 })).channels);
    row.peakPitch2 = r3(hi.peak); row.peakPitchHalf = r3(lo.peak); row.nan = row.nan || hi.nan || lo.nan;
    say(row); rows.push({ name, env: envelope(r.channels, r.sampleRate, 0.02), dur: aud });
  }
  return rows;
}

async function engineOne() {
  status('engine');
  const r = await renderEngine();
  const lv = levels(r.channels), env = envelope(r.channels, r.sampleRate, 0.5);
  // dominant frequency in windows across the run-up (4-12 s): should climb (with gear drops)
  const dom = [];
  for (let s = 3; s < 13; s += 0.5) {
    const mag = spectrum(r.channels, Math.floor(s * r.sampleRate), 16384);
    let best = 0, bi = 0; for (let i = 8; i < 900; i++) if (mag[i] > best) { best = mag[i]; bi = i; }
    dom.push(Math.round((bi * r.sampleRate) / 16384));
  }
  const seg = (a, b) => { const w = env.slice(Math.floor(a / 0.5), Math.floor(b / 0.5)); return w.reduce((x, y) => x + y, 0) / w.length; };
  say({ kind: 'engine', peak: r3(lv.peak), rms: r3(lv.rms), nan: lv.nan, seconds: r.seconds, idleRms: r3(seg(0.5, 3.5)), fullRms: r3(seg(9, 12)), driftRms: r3(seg(12.5, 15.5)), boostRms: r3(seg(16.5, 17.8)), grassRms: r3(seg(18.5, 20.5)), kerbRms: r3(seg(21.5, 22.8)), dominantHz: dom });
  return r;
}

const sheets = [];
async function songOne(key) {
  status(`music ${key}`);
  const song = SONGS[key];
  const t0 = performance.now();
  const loops = 3;
  const r = await renderSong(key, { loops });
  const sr = r.sampleRate, lv = levels(r.channels);
  const env = envelope(r.channels, sr, 0.25);
  const winsPerLoop = Math.round(r.loopSeconds / 0.25);
  const loopStartWin = Math.round((r.introSeconds + r.t0) / 0.25);
  const seg = (n) => env.slice(loopStartWin + n * winsPerLoop, loopStartWin + (n + 1) * winsPerLoop);
  const l2 = seg(1), l3 = seg(2);
  const corr = correlation(l2, l3);
  // energy just around the seam (loop2 -> loop3) relative to the median of the loop
  const sorted = [...l3].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
  const seam = env.slice(loopStartWin + 2 * winsPerLoop - 2, loopStartWin + 2 * winsPerLoop + 2);
  const seamRatio = Math.min(...seam) / Math.max(1e-9, med);
  // largest sample-to-sample jump at the seam vs elsewhere (click detector)
  const seamSample = Math.floor((r.t0 + r.introSeconds + 2 * r.loopSeconds) * sr);
  const jump = (a, b) => { let m = 0; for (let i = a; i < b; i++) m = Math.max(m, Math.abs(r.channels[0][i + 1] - r.channels[0][i])); return m; };
  const seamJump = jump(seamSample - 200, seamSample + 200), midJump = jump(seamSample + 2 * sr, seamSample + 2 * sr + 400) + jump(seamSample - 5 * sr, seamSample - 5 * sr + 400);
  // key fit + chord-tone share over the second loop
  const tonic = KEY_TONIC[key], minor = !!KEY_MINOR[key];
  const scale = new Set((minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).map((d) => (d + tonic) % 12));
  const chords = expandProgression(song.prog);
  const barSec = r.loopSeconds / song.loopBars;
  let keyShareSum = 0, chordShareSum = 0, n = 0, bassOk = 0, bassN = 0;
  for (let b = 0; b < song.loopBars; b += 2) {
    const start = r.t0 + r.introSeconds + r.loopSeconds + b * barSec;
    const ch = chroma(r.channels, sr, start, 2 * barSec - 0.1);
    const cn = new Set(chords[b].notes.map((m) => m % 12));
    // allow the extensions (9th/11th/13th) that are part of the chord names
    keyShareSum += share(ch, scale); chordShareSum += share(ch, cn); n++;
    let top = 0, topPc = 0; ch.forEach((v, i) => { if (v > top) { top = v; topPc = i; } });
    // the strongest pitch class of the whole bar pair should be in the chord (root/third/fifth/seventh) in most bars
    bassN++; if (cn.has(topPc) || chords[b].notes.map((m) => (m + 2) % 12).includes(topPc)) bassOk++;
  }
  const mid = Math.floor(r.loopSeconds / 2);
  say({ kind: 'music', name: key, peak: r3(lv.peak), rms: r3(lv.rms), nan: lv.nan, seconds: r3(r.introSeconds + r.loopSeconds), introSeconds: r3(r.introSeconds), loopSeconds: r3(r.loopSeconds), bpm: song.bpm,
    loopCorr: r3(corr), seamRatio: r3(seamRatio), seamJump: r3(seamJump), midJump: r3(midJump), keyShare: r3(keyShareSum / n), chordShare: r3(chordShareSum / n), topPcInChord: r3(bassOk / bassN), renderMs: Math.round(performance.now() - t0), mid });
  sheets.push({ key, r, song });
}

function paint() {
  const cw = 1480, rowH = 178;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = 40 + sheets.length * rowH; cv.style.cssText = 'position:absolute;left:0;top:34px';
  ui.appendChild(cv);
  const c = cv.getContext('2d'); c.fillStyle = '#0b1020'; c.fillRect(0, 0, cv.width, cv.height);
  sheets.forEach(({ key, r, song }, i) => {
    const y0 = 20 + i * rowH, sr = r.sampleRate;
    const from = r.t0 + r.introSeconds, len = Math.min(r.loopSeconds + 8, r.channels[0].length / sr - from - 0.1);
    c.fillStyle = '#9fb4ff'; c.fillText(`${key}   ${song.bpm} bpm   loop ${r.loopSeconds.toFixed(1)} s (+8 s of the repeat)   intro ${r.introSeconds.toFixed(1)} s (not shown)`, 8, y0 + 10);
    // waveform (min/max per pixel) over 60 px, spectrogram below (log-frequency, 90 px)
    const W = cw - 16, wave = 50, spec = 96, top = y0 + 16;
    const spp = (len * sr) / W;
    c.fillStyle = '#132040'; c.fillRect(8, top, W, wave);
    c.fillStyle = '#6fe3c1';
    for (let x = 0; x < W; x++) {
      let mn = 1, mx = -1; const a = Math.floor(from * sr + x * spp), b = Math.floor(a + spp);
      for (let k = a; k < b; k += 4) { const v = r.channels[0][k]; if (v < mn) mn = v; if (v > mx) mx = v; }
      c.fillRect(8 + x, top + wave / 2 - mx * wave * 0.9, 1, Math.max(1, (mx - mn) * wave * 0.9));
    }
    // seam marker
    const seamX = 8 + (r.loopSeconds / len) * W; c.fillStyle = '#ff5c7a'; c.fillRect(seamX, top, 1, wave + spec + 4);
    // section markers every 8 bars
    c.fillStyle = 'rgba(255,255,255,.25)'; for (let b = 8; b < song.loopBars; b += 8) c.fillRect(8 + ((b * r.loopSeconds) / song.loopBars / len) * W, top, 1, wave + spec + 4);
    const fft = 2048, cols = Math.floor(W / 3);
    for (let col = 0; col < cols; col++) {
      const start = Math.floor((from + (col / cols) * len) * sr);
      const mag = spectrum(r.channels, start, fft);
      for (let row = 0; row < spec; row++) {
        const f = 40 * Math.pow(9000 / 40, row / spec), bin = Math.min(mag.length - 1, Math.round((f * fft) / sr));
        const v = Math.min(1, Math.log10(1 + mag[bin] * 40) / 2.6);
        c.fillStyle = `hsl(${250 - 230 * v}, 90%, ${8 + 55 * v}%)`;
        c.fillRect(8 + col * 3, top + wave + 4 + spec - 1 - row, 3, 1);
      }
    }
  });
}

(async () => {
  const t0 = performance.now();
  let sfxRows = [];
  if (want('sfx')) sfxRows = await sfxAll();
  if (want('engine')) await engineOne();
  for (const key of MUSIC_KEYS) if (want(key)) await songOne(key);
  status('painting');
  if (sheets.length) paint();
  status(`done in ${Math.round((performance.now() - t0) / 1000)} s`);
  say({ kind: 'done', ms: Math.round(performance.now() - t0), sfx: sfxRows.length, music: sheets.length });
  window.__ready = true;
})().catch((e) => { console.error('audio verification failed', e); window.__ready = true; });
