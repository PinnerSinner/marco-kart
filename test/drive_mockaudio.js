// Test helper (not a test): a strict fake AudioContext. It records what was scheduled and throws on the same mistakes the
// real WebAudio API throws on (non-finite values, exponential ramps to <= 0, negative times / time constants), so audio code
// paths can be exercised in plain Node.
const METHODS = new Set(['connect', 'disconnect', 'start', 'stop', 'addEventListener', 'removeEventListener']);

function check(what, ...vals) { for (const v of vals) if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${what}: non-finite argument ${v}`); }

export function makeParam(stats, name, initial = 0) {
  const p = {
    _v: initial,
    get value() { return this._v; },
    set value(v) { check(`${name}.value`, v); this._v = v; },
    setValueAtTime(v, t) { check(`${name}.setValueAtTime`, v, t); if (t < 0) throw new RangeError(`${name}: negative time`); stats.paramEvents++; return p; },
    linearRampToValueAtTime(v, t) { check(`${name}.linearRamp`, v, t); if (t < 0) throw new RangeError('negative time'); stats.paramEvents++; return p; },
    exponentialRampToValueAtTime(v, t) { check(`${name}.expRamp`, v, t); if (!(v > 0)) throw new RangeError(`${name}: exponentialRamp to ${v}`); stats.paramEvents++; return p; },
    setTargetAtTime(v, t, tc) { check(`${name}.setTarget`, v, t, tc); if (tc < 0) throw new RangeError(`${name}: negative time constant`); stats.paramEvents++; return p; },
    cancelScheduledValues(t) { check(`${name}.cancel`, t); return p; },
  };
  return p;
}

function makeNode(stats, kind, extra = {}) {
  const target = { kind, _connections: [], _started: null, _stopped: null, ...extra };
  stats.nodes++; stats.byKind[kind] = (stats.byKind[kind] ?? 0) + 1;
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'symbol') return undefined;
      if (prop === 'connect') return (dest) => { if (!dest) throw new TypeError('connect(undefined)'); t._connections.push(dest); return dest; };
      if (prop === 'disconnect') return () => {};
      if (prop === 'start') return (when = 0) => { check(`${kind}.start`, when); if (t._started !== null) throw new Error(`${kind} started twice`); t._started = when; stats.starts.push(when); };
      if (prop === 'stop') return (when = 0) => { check(`${kind}.stop`, when); if (t._started === null) throw new Error(`${kind}.stop before start`); t._stopped = when; stats.stops.push(when); };
      if (METHODS.has(prop)) return () => {};
      t[prop] = makeParam(stats, `${kind}.${prop}`, prop === 'gain' || prop === 'Q' ? 1 : 0);
      return t[prop];
    },
    set(t, prop, v) {
      if (prop === 'frequency' || prop === 'gain' || prop === 'Q' || prop === 'detune' || prop === 'pan' || prop === 'delayTime') {
        if (!t[prop]) t[prop] = makeParam(stats, `${kind}.${prop}`);
        t[prop].value = v; return true;
      }
      t[prop] = v; return true;
    },
  });
}

/** @param {{sampleRate?: number}} [o] */
export function makeMockContext({ sampleRate = 44100 } = {}) {
  const stats = { nodes: 0, byKind: {}, starts: [], stops: [], paramEvents: 0 };
  const ctx = {
    sampleRate, currentTime: 0, state: 'running', stats,
    destination: makeNode(stats, 'destination'),
    resume() { this.state = 'running'; return Promise.resolve(); },
    suspend() { this.state = 'suspended'; return Promise.resolve(); },
    close() { this.state = 'closed'; return Promise.resolve(); },
    decodeAudioData: async () => ({ duration: 1, length: sampleRate, numberOfChannels: 1, sampleRate, getChannelData: () => new Float32Array(sampleRate) }),
    createBuffer(ch, n, rate) {
      if (!(n > 0) || !(rate > 0)) throw new RangeError('createBuffer');
      const data = Array.from({ length: ch }, () => new Float32Array(n));
      return { numberOfChannels: ch, length: n, sampleRate: rate, duration: n / rate, getChannelData: (i) => data[i] };
    },
  };
  for (const [fn, kind] of [['createGain', 'gain'], ['createOscillator', 'osc'], ['createBiquadFilter', 'biquad'], ['createBufferSource', 'source'],
    ['createStereoPanner', 'panner'], ['createConvolver', 'convolver'], ['createDelay', 'delay'], ['createWaveShaper', 'shaper'],
    ['createDynamicsCompressor', 'compressor']]) {
    ctx[fn] = () => makeNode(stats, kind);
  }
  return ctx;
}
