// Procedural engine and driving sounds. `PlayerEngine` is the full layered voice for the player's kart (engine with gear steps,
// tyre squeal, drift scrub, wind, off-road rumble, kerb rumble, boost roar); `RivalHum` is the cheap 2-oscillator voice used for
// nearby rivals. All parameters are driven through AudioParam automation at an explicit time `t`, so the very same code runs
// live (t = ctx.currentTime, every frame) and in an OfflineAudioContext (t = scripted time) for verification.
import { noiseSource } from './synth.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth01 = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

/** Gear boundaries as fractions of top speed. Within a gear the engine revs from ~0.32 to ~0.96 of its range. */
const GEARS = [0, 0.15, 0.32, 0.52, 0.74, 1.0];

/**
 * Engine "rpm" (0..1+) for a speed fraction, with gear steps: revs climb inside a gear and drop at each upshift.
 * @param {number} sf speed / top speed (0..1.4) @returns {number}
 */
export function rpmForSpeed(sf) {
  sf = clamp(sf, 0, 1.4);
  let g = GEARS.length - 2;
  for (let i = 0; i < GEARS.length - 1; i++) if (sf < GEARS[i + 1]) { g = i; break; }
  const lo = GEARS[g], hi = GEARS[g + 1];
  const frac = clamp((sf - lo) / (hi - lo), 0, 1.3);
  return 0.32 + 0.64 * Math.pow(frac, 0.85) + (g === 0 ? -0.06 : 0);
}

/** Fundamental frequency (Hz) for an rpm value. */
export const rpmToHz = (rpm) => 40 + clamp(rpm, 0, 1.2) * 175;

const shaperCurve = (() => {
  const n = 512, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(1.8 * x) / Math.tanh(1.8); }
  return c;
})();

/** Looping filtered noise layer with a gain you automate: returns { src, filter, amp } (amp is the GainNode). */
function noiseLayer(ctx, out, t, kind, type, freq, q) {
  const src = noiseSource(ctx, kind, t, 0, true);
  const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
  const amp = ctx.createGain(); amp.gain.value = 0;
  src.connect(filter); filter.connect(amp); amp.connect(out);
  return { src, filter, amp };
}

/** The buzzy kart engine itself (3 oscillators + roughness LFO + intake noise). */
export class EngineVoice {
  /** @param {BaseAudioContext} ctx @param {AudioNode} out @param {number} [t=0] start time */
  constructor(ctx, out, t = 0) {
    this.ctx = ctx;
    const mk = (type, f, gain, dest) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = gain; o.connect(g); g.connect(dest); o.start(t); return o; };
    const mix = ctx.createGain();
    this.oscA = mk('sawtooth', 80, 0.55, mix);
    this.oscB = mk('square', 40, 0.3, mix);
    this.oscC = mk('sawtooth', 80.4, 0.4, mix);
    const shaper = ctx.createWaveShaper(); shaper.curve = shaperCurve; shaper.oversample = '2x';
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 1.4; this.lp.frequency.value = 800;
    const notch = ctx.createBiquadFilter(); notch.type = 'peaking'; notch.frequency.value = 900; notch.gain.value = 4; notch.Q.value = 0.9;
    this.amp = ctx.createGain(); this.amp.gain.value = 0;
    mix.connect(shaper); shaper.connect(this.lp); this.lp.connect(notch); notch.connect(this.amp); this.amp.connect(out);
    // roughness: amplitude flutter
    this.lfo = ctx.createOscillator(); this.lfo.type = 'sine'; this.lfo.frequency.value = 12;
    const depth = ctx.createGain(); depth.gain.value = 0.045;
    this.lfo.connect(depth); depth.connect(this.amp.gain); this.lfo.start(t);
    // intake breath
    this.air = noiseLayer(ctx, out, t, 'pink', 'bandpass', 1200, 0.8);
  }

  /**
   * @param {number} t time (s) @param {number} rpm 0..1.2 @param {number} load 0..1 (throttle) @param {number} [gain=1]
   */
  set(t, rpm, load, gain = 1) {
    const f = rpmToHz(rpm), tc = 0.035;
    this.oscA.frequency.setTargetAtTime(f, t, tc);
    this.oscB.frequency.setTargetAtTime(f * 0.5, t, tc);
    this.oscC.frequency.setTargetAtTime(f * 1.006, t, tc);
    this.lfo.frequency.setTargetAtTime(f * 0.25, t, tc);
    this.lp.frequency.setTargetAtTime(420 + 4200 * (0.2 + 0.8 * load) * (0.3 + 0.7 * clamp(rpm, 0, 1)), t, 0.06);
    this.amp.gain.setTargetAtTime((0.11 + 0.11 * load + 0.05 * clamp(rpm, 0, 1)) * gain, t, 0.05);
    this.air.filter.frequency.setTargetAtTime(700 + 1800 * rpm, t, 0.08);
    this.air.amp.gain.setTargetAtTime((0.008 + 0.05 * load * rpm) * gain, t, 0.08);
  }

  /** Stop the oscillators at time t. */
  stop(t) { for (const o of [this.oscA, this.oscB, this.oscC, this.lfo, this.air.src]) { try { o.stop(t); } catch { /* already stopped */ } } }
}

/** Cheap engine hum for rivals: two oscillators, one filter, panned. */
export class RivalHum {
  /** @param {BaseAudioContext} ctx @param {AudioNode} out */
  constructor(ctx, out, t = 0) {
    this.ctx = ctx;
    this.a = ctx.createOscillator(); this.a.type = 'sawtooth';
    this.b = ctx.createOscillator(); this.b.type = 'square';
    const ga = ctx.createGain(); ga.gain.value = 0.6; const gb = ctx.createGain(); gb.gain.value = 0.3;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 700; this.lp.Q.value = 0.9;
    this.amp = ctx.createGain(); this.amp.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    this.a.connect(ga); this.b.connect(gb); ga.connect(this.lp); gb.connect(this.lp); this.lp.connect(this.amp); this.amp.connect(this.pan); this.pan.connect(out);
    this.a.start(t); this.b.start(t);
    this.id = null;
  }

  /** @param {number} t @param {number} rpm @param {number} gain 0..1 (distance already applied) @param {number} pan -1..1 */
  set(t, rpm, gain, pan) {
    const f = rpmToHz(rpm) * 1.02;
    this.a.frequency.setTargetAtTime(f, t, 0.06); this.b.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.lp.frequency.setTargetAtTime(350 + 1400 * rpm, t, 0.08);
    this.amp.gain.setTargetAtTime(0.11 * gain, t, 0.08);
    this.pan.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.06);
  }

  stop(t) { for (const o of [this.a, this.b]) { try { o.stop(t); } catch { /* already stopped */ } } }
}

/**
 * Everything the player's kart makes while driving, layered on one output node.
 * Call update(t, kart, dt) every frame with anything shaped like KartPhysics (speed, params.top, grounded, slip, drift, boost, ground.surface, status).
 */
export class PlayerEngine {
  /** @param {BaseAudioContext} ctx @param {AudioNode} out @param {number} [t=0] */
  constructor(ctx, out, t = 0) {
    this.ctx = ctx;
    this.out = ctx.createGain(); this.out.gain.value = 1; this.out.connect(out);
    this.engine = new EngineVoice(ctx, this.out, t);
    this.wind = noiseLayer(ctx, this.out, t, 'pink', 'bandpass', 3200, 0.35);
    this.squeal = noiseLayer(ctx, this.out, t, 'white', 'bandpass', 1900, 9);
    this.squeal2 = noiseLayer(ctx, this.out, t, 'white', 'bandpass', 3100, 7);
    this.scrub = noiseLayer(ctx, this.out, t, 'pink', 'bandpass', 900, 1.1);
    this.rumble = noiseLayer(ctx, this.out, t, 'brown', 'lowpass', 420, 0.7);
    this.grit = noiseLayer(ctx, this.out, t, 'pink', 'bandpass', 2400, 0.6);
    this.kerb = noiseLayer(ctx, this.out, t, 'brown', 'lowpass', 160, 1.4);
    // kerb rumble strips: the noise is amplitude-modulated at wheel-roll rate by a low-frequency oscillator
    const kerbAm = ctx.createGain(); kerbAm.gain.value = 0.5;
    this.kerb.amp.disconnect(); this.kerb.amp.connect(kerbAm); kerbAm.connect(this.out);
    this.kerbLfo = ctx.createOscillator(); this.kerbLfo.type = 'triangle'; this.kerbLfo.frequency.value = 20;
    const kerbDepth = ctx.createGain(); kerbDepth.gain.value = 0.5;
    this.kerbLfo.connect(kerbDepth); kerbDepth.connect(kerbAm.gain); this.kerbLfo.start(t);
    this.roar = noiseLayer(ctx, this.out, t, 'pink', 'bandpass', 900, 0.8);
    this.rpm = 0.2; this.load = 0; this.lastSpeed = 0; this.boostK = 0; this.time = t;
  }

  /** @param {number} t seconds on the context clock @param {object} k kart-like state @param {number} dt seconds since the last call */
  update(t, k, dt) {
    if (!(dt > 0)) dt = 1 / 60;
    const top = k.params?.top ?? 33;
    const sp = Math.abs(k.speed) || 0;
    const sf = clamp(sp / top, 0, 1.4);
    const accel = (k.speed - this.lastSpeed) / dt; this.lastSpeed = k.speed;
    const grounded = k.grounded !== false;
    const boosting = (k.boost?.time ?? 0) > 0.02;
    const spinning = (k.status?.spin ?? 0) > 0;

    // throttle estimate: accelerating, or pinned at top speed
    const loadTarget = spinning ? 0.1 : accel > 0.4 || sf > 0.93 ? 1 : accel < -2 ? 0 : 0.3;
    this.load += (loadTarget - this.load) * (1 - Math.exp(-7 * dt));

    let target = rpmForSpeed(sf);
    if (sf < 0.03) target = 0.2 + 0.12 * this.load;
    if (!grounded) target = Math.min(1.05, target + 0.22);
    if (boosting) target = Math.min(1.1, target + 0.1);
    if (spinning) target = 0.55;
    if (this.load < 0.2) target -= 0.1;
    const rate = target > this.rpm ? 10 : 4.5;             // revs rise fast, fall slower: audible gear steps
    this.rpm += (target - this.rpm) * (1 - Math.exp(-rate * dt));
    this.engine.set(t, this.rpm, this.load);

    // wind
    this.wind.filter.frequency.setTargetAtTime(1800 + 3800 * sf, t, 0.1);
    this.wind.amp.gain.setTargetAtTime(0.005 + 0.1 * sf * sf * (grounded ? 1 : 1.3), t, 0.1);

    // tyre squeal + drift scrub
    const slip = clamp(k.slip ?? 0, 0, 1);
    const driving = grounded && sp > 6;
    const sq = driving ? smooth01(0.25, 0.85, slip) * smooth01(6, 16, sp) : 0;
    const drifting = !!k.drift?.active && grounded;
    this.squeal.amp.gain.setTargetAtTime(0.14 * sq, t, 0.04);
    this.squeal.filter.frequency.setTargetAtTime(1500 + 1300 * clamp(sf, 0, 1) + 500 * slip, t, 0.05);
    this.squeal2.amp.gain.setTargetAtTime(0.06 * sq * sq, t, 0.04);
    this.scrub.amp.gain.setTargetAtTime(drifting ? 0.06 + 0.06 * slip : 0, t, 0.06);
    this.scrub.filter.frequency.setTargetAtTime(700 + 500 * sf, t, 0.08);

    // surface layers
    const surf = k.ground?.surface ?? 'road';
    const rough = grounded ? smooth01(2, 14, sp) : 0;
    const grassy = surf === 'grass' ? 1 : 0, sandy = surf === 'sand' ? 1 : 0, wet = surf === 'water' ? 1 : 0, kerbed = surf === 'kerb' ? 1 : 0;
    this.rumble.amp.gain.setTargetAtTime(rough * (0.2 * grassy + 0.12 * sandy + 0.08 * wet), t, 0.06);
    this.grit.amp.gain.setTargetAtTime(rough * (0.05 * grassy + 0.09 * sandy + 0.06 * wet), t, 0.06);
    this.grit.filter.frequency.setTargetAtTime(sandy ? 3800 : wet ? 4200 : 2200, t, 0.1);
    this.kerbLfo.frequency.setTargetAtTime(clamp(sp * 0.9, 6, 34), t, 0.05);
    this.kerb.amp.gain.setTargetAtTime(rough * kerbed * 0.3, t, 0.03);

    // boost roar
    this.boostK += ((boosting ? 1 : 0) - this.boostK) * (1 - Math.exp(-(boosting ? 8 : 3) * dt));
    const power = clamp(k.boost?.power ?? 1, 0.5, 2);
    this.roar.amp.gain.setTargetAtTime(this.boostK * 0.1 * power, t, 0.05);
    this.roar.filter.frequency.setTargetAtTime(600 + 1500 * this.boostK * power, t, 0.08);
  }

  /** Fade the whole player engine bus (pause / finish). */
  setLevel(t, level, tc = 0.08) { this.out.gain.setTargetAtTime(level, t, tc); }

  /** Stop all sources at time t. */
  stop(t) {
    this.engine.stop(t);
    try { this.kerbLfo.stop(t); } catch { /* already stopped */ }
    for (const l of [this.wind, this.squeal, this.squeal2, this.scrub, this.rumble, this.grit, this.kerb, this.roar]) { try { l.src.stop(t); } catch { /* already stopped */ } }
  }
}
