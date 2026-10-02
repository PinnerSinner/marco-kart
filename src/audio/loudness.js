// Loudness normalisation for Marco's recorded clips (they were recorded at very different levels). Pure maths on sample arrays (Node-safe).
// Each decoded clip is measured once (gated RMS + peak) and given a gain that brings it to a common target loudness. The gain is capped so the
// clip's peak cannot go far over full scale: the voice bus has a limiter that catches the rest, so nothing clips.

export const VOICE_TARGET_RMS = 0.0141;     // -37 dBFS RMS of the speech itself (silences gated out) going INTO the voice bus; the two voice dynamics stages then add about 13.5 dB of automatic makeup gain (VOICE_MAKEUP_DB in AudioManager, measured), so the voice lands near -24 dBFS: about 5 dB over the default music (-29)
export const PEAK_CEILING = 0.891;          // -1 dBFS: where a peak may land before the bus limiter
export const LIMITER_HEADROOM = 1.5;        // the limiter may be asked to take peaks up to this multiple of the ceiling (+3.5 dB)
export const MIN_GAIN = 0.003;               // -50 dB: some recordings are normalised very hot (RMS near full scale) and must come down a long way to the target
export const MAX_GAIN = 14;                 // +23 dB: quiet recordings can be lifted a long way
const WINDOW_SEC = 0.02;
const GATE_DB = -38;                        // windows more than this far below the loudest window are silence, not speech

export const toDb = (x) => 20 * Math.log10(Math.max(x, 1e-9));
export const fromDb = (db) => Math.pow(10, db / 20);

/**
 * @param {ArrayLike<number>[]} channels one array per channel @param {number} sampleRate
 * @returns {{peak: number, rms: number, seconds: number}} peak: max |sample|; rms: of the windows that are not silence (mono mix of the channels)
 */
export function measureChannels(channels, sampleRate = 44100) {
  const n = channels.length ? channels[0].length : 0;
  let peak = 0;
  for (const ch of channels) for (let i = 0; i < n; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; }
  const win = Math.max(16, Math.round(sampleRate * WINDOW_SEC));
  const powers = [];
  for (let s = 0; s + win <= n; s += win) {
    let sum = 0;
    for (const ch of channels) { for (let i = s; i < s + win; i++) sum += ch[i] * ch[i]; }
    powers.push(sum / (win * channels.length));
  }
  if (!powers.length && n) { let sum = 0; for (const ch of channels) for (let i = 0; i < n; i++) sum += ch[i] * ch[i]; powers.push(sum / (n * channels.length)); }
  const top = Math.max(0, ...powers);
  const gate = top * Math.pow(10, GATE_DB / 10);          // power gate
  let acc = 0, cnt = 0;
  for (const p of powers) if (p >= gate && p > 0) { acc += p; cnt++; }
  return { peak, rms: cnt ? Math.sqrt(acc / cnt) : 0, seconds: n / sampleRate };
}

/**
 * The gain that takes a clip with this measurement to the target loudness, held back so its peak stays within what the limiter can handle.
 * A silent / unmeasurable clip gets 1.
 */
export function normGain({ peak, rms }, target = VOICE_TARGET_RMS) {
  if (!(rms > 1e-5) || !(peak > 0)) return 1;
  const byRms = target / rms;
  const byPeak = (PEAK_CEILING * LIMITER_HEADROOM) / peak;
  return Math.min(MAX_GAIN, Math.max(MIN_GAIN, Math.min(byRms, byPeak)));
}

/** Sample the gain onto an AudioBuffer-like object. @returns {number} */
export function bufferGain(buf, target) {
  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  return normGain(measureChannels(chans, buf.sampleRate), target);
}

/** Soft-limit a sample: what the bus limiter does at the extreme (used by tests to predict clipping). */
export const softLimit = (x, ceiling = PEAK_CEILING) => (Math.abs(x) <= ceiling ? x : Math.sign(x) * (ceiling + (1 - ceiling) * Math.tanh((Math.abs(x) - ceiling) / (1 - ceiling))));

/** Transfer curve of the voice bus's final soft clipper (range -2..2): unity for small signals, asymptote at `ceiling`. For a WaveShaperNode. */
export function softClipCurve(ceiling = 0.9, points = 2049, range = 2) {
  const c = new Float32Array(points);
  for (let i = 0; i < points; i++) { const x = (i / (points - 1) * 2 - 1) * range; c[i] = ceiling * Math.tanh(x / ceiling); }
  return c;
}
