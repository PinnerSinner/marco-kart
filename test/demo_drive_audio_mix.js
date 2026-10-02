// Mix analysis (development aid): renders 8 bars of every song with a mono tap on each mixer channel and prints per-stem RMS and peak,
// so the channel levels can be balanced numerically. Bars are chosen from the fullest section of each song.
//   node tools/shot.mjs test/demo_drive_audio_mix.js /tmp/x.png --wait 200000
import { MUSIC_KEYS, SONGS } from '../src/audio/music/index.js';
import { renderSong } from '../src/audio/offline.js';

const FULL = { menu: 24, copacabana: 24, blighty: 24, datacentre: 24, marcoverse: 24, results: 0, podium: 8 };
const r3 = (v) => Math.round(v * 1000) / 1000;
const st = (a, sr = 44100) => { let p = 0, s = 0, at = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; if (Math.abs(v) > p) { p = Math.abs(v); at = i; } s += v * v; } return { peak: r3(p), rms: r3(Math.sqrt(s / a.length)), at: r3(at / sr) }; };
(async () => {
  const only = (window.__ONLY__ ?? '').split(',').filter(Boolean);
  for (const key of MUSIC_KEYS) {
    if (only.length && !only.includes(key)) continue;
    const song = SONGS[key];
    const r = await renderSong(key, { stems: true, startBar: FULL[key], bars: Math.min(8, song.loopBars - FULL[key]) });
    const skip = Math.floor(0.3 * r.sampleRate);
    const mix = [r.channels[0].subarray(skip), r.channels[1].subarray(skip)];
    const out = { kind: 'mix', name: key, L: st(mix[0]), R: st(mix[1]), stems: {} };
    for (const [n, a] of Object.entries(r.stems)) out.stems[n] = st(a.subarray(skip));
    console.log('MIX ' + JSON.stringify(out));
  }
  window.__ready = true;
})().catch((e) => { console.error('mix failed', e); window.__ready = true; });
