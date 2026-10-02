// Shared particle presets (create once at import; emitting them allocates nothing). Additive presets go in the additive pool,
// the rest in the normal-blend pool (see RaceView).
import { makePreset as P, SHAPE } from './ParticlePool.js';

/** Drift level colours: 0 none, 1 cyan, 2 amber, 3 magenta (hex). */
export const DRIFT_COLOURS = [0xffffff, 0x2ad4ff, 0xffb020, 0xff3df0];
/** Brand-ish confetti palette. */
export const CONFETTI_COLOURS = [0xE63946, 0x22D3EE, 0xFFD166, 0xFFFFFF, 0x8338EC, 0x06D6A0, 0xEF476F];
export const RAINBOW = [0xff4d6d, 0xffa62b, 0xffe066, 0x5cf28a, 0x4dd8ff, 0x8f7bff, 0xff6ee7];

const sparkFor = (c) => P({ life: [0.25, 0.55], size: [0.16, 0.26], grow: 0.4, color: [0xffffff, c], alpha: [1, 0], gravity: 10, drag: 1.2, shape: SHAPE.STREAK, stretch: 0.06, bounce: 0.35, jitter: 1.5, glow: 2.4 });

export const FX = {
  // additive
  sparks: DRIFT_COLOURS.map(sparkFor),
  sparkleColour: DRIFT_COLOURS.map((c) => P({ life: [0.3, 0.55], size: [0.45, 0.8], grow: 0.2, color: [0xffffff, c], alpha: [1, 0], shape: SHAPE.SPARKLE, spin: [-4, 4], drag: 2, glow: 2 })),
  rainbowSparkle: RAINBOW.map((c) => P({ life: [0.35, 0.7], size: [0.25, 0.5], grow: 0.1, color: [0xffffff, c], alpha: [1, 0], shape: SHAPE.SPARKLE, spin: [-5, 5], gravity: -1, drag: 1.5, jitter: 0.7, glow: 1.8 })),
  glowPuff: (c) => P({ life: [0.25, 0.4], size: [0.6, 0.9], grow: 1.8, color: [c, c], alpha: [0.85, 0], shape: SHAPE.SOFT, glow: 1.6 }),
  flash: P({ life: [0.16, 0.2], size: [2.6, 3.2], grow: 1.9, color: [0xffffff, 0xffb347], alpha: [1, 0], shape: SHAPE.SOFT, glow: 1.8 }),
  fireball: P({ life: [0.35, 0.6], size: [1.0, 1.7], grow: 2.0, color: [0xffd23f, 0xff3b1a], alpha: [0.95, 0], shape: SHAPE.SOFT, drag: 3, gravity: -2, jitter: 0.6 }),
  ember: P({ life: [0.5, 0.9], size: [0.14, 0.26], grow: 0.3, color: [0xffe066, 0xff3b1a], alpha: [1, 0], shape: SHAPE.STREAK, stretch: 0.03, gravity: 9, drag: 0.7, bounce: 0.3, glow: 2 }),
  shockwave: P({ life: [0.45, 0.5], size: [1.5, 1.5], grow: 9, color: [0xffffff, 0xffb347], alpha: [0.9, 0], shape: SHAPE.FLAT_RING }),
  ringFlat: (c) => P({ life: [0.35, 0.4], size: [1.0, 1.0], grow: 4.5, color: [c, c], alpha: [0.95, 0], shape: SHAPE.FLAT_RING }),
  ringBillboard: (c) => P({ life: [0.3, 0.35], size: [0.8, 0.8], grow: 4, color: [c, c], alpha: [1, 0], shape: SHAPE.RING }),
  flameCore: P({ life: [0.14, 0.26], size: [0.36, 0.52], grow: 0.15, color: [0xffffff, 0xff9a1f], alpha: [1, 0], shape: SHAPE.SOFT, drag: 1.5, glow: 1.6 }),
  flameKind: {
    item: [0xffe08a, 0xff6a1a], drift1: [0xbdf3ff, 0x1fa8ff], drift2: [0xfff0b0, 0xff9a10], drift3: [0xffc8fb, 0xff2de0],
    pad: [0xe8f6ff, 0x2f86ff], start: [0xffffff, 0xffb000], fibre: [0xffffff, 0x66f0ff], jump: [0xfffbe0, 0xffc21a],
  },
  whoosh: P({ life: [0.2, 0.35], size: [0.06, 0.1], grow: 0.5, color: [0xffffff, 0xaee8ff], alpha: [0.7, 0], shape: SHAPE.STREAK, stretch: 0.09, drag: 0.5 }),
  wheelGlow: (c) => P({ life: [0.08, 0.12], size: [0.5, 0.7], grow: 0.4, color: [c, c], alpha: [0.8, 0], shape: SHAPE.SOFT }),
  bubblePop: P({ life: [0.3, 0.5], size: [0.16, 0.3], grow: 0.4, color: [0xffe07a, 0xff6a1a], alpha: [1, 0], shape: SHAPE.SPARKLE, spin: [-6, 6], drag: 2.5 }),
  ping: P({ life: [0.25, 0.4], size: [0.22, 0.34], grow: 0.2, color: [0xffffff, 0x2aa8ff], alpha: [0.9, 0], shape: SHAPE.SOFT, drag: 2 }),
  traceroute: P({ life: [0.3, 0.5], size: [0.3, 0.45], grow: 1.2, color: [0xffe066, 0xff4a1a], alpha: [0.9, 0], shape: SHAPE.SOFT, drag: 2 }),
  kernel: P({ life: [0.3, 0.55], size: [0.4, 0.7], grow: 1.5, color: [0xff5a5a, 0x5a0a20], alpha: [0.9, 0], shape: SHAPE.SOFT, drag: 2 }),
  beam: P({ life: [0.4, 0.8], size: [0.15, 0.3], grow: 0.2, color: [0xffffff, 0x66f0ff], alpha: [1, 0], shape: SHAPE.SPARKLE, gravity: -3, spin: [-3, 3] }),
  boxBurst: [0xff4fd8, 0x22d3ee, 0xffe066, 0xffffff].map((c) => P({ life: [0.4, 0.75], size: [0.4, 0.7], grow: 0.3, color: [0xffffff, c], alpha: [1, 0], shape: SHAPE.SPARKLE, spin: [-5, 5], drag: 2.2, gravity: 2, glow: 2 })),
  // perfect take-off (kart:perfect-jump): a gold spark fountain from the wheels
  jumpSpark: P({ life: [0.35, 0.65], size: [0.3, 0.6], grow: 0.1, color: [0xffffff, 0xffc21a], alpha: [1, 0], shape: SHAPE.SPARKLE, spin: [-7, 7], gravity: 4, drag: 1.4, jitter: 0.6, glow: 2.2 }),
  boxTwinkle: P({ life: [0.5, 0.9], size: [0.2, 0.36], grow: 0.1, color: [0xffffff, 0xa66bff], alpha: [1, 0], shape: SHAPE.SPARKLE, spin: [-3, 3], gravity: -0.5, drag: 0.5 }),
  dizzy: P({ life: [0.1, 0.13], size: [0.38, 0.38], grow: 1, color: [0xffe066, 0xffe066], alpha: [1, 0.6], shape: SHAPE.SPARKLE, spin: [0, 0] }),
  // normal blend
  dust: (c) => P({ life: [0.5, 0.9], size: [0.5, 0.9], grow: 2.6, color: [c, c], alpha: [0.5, 0], shape: SHAPE.SOFT, drag: 1.4, gravity: -0.6, spin: [-1, 1], jitter: 0.5 }),
  grass: P({ life: [0.5, 0.8], size: [0.12, 0.2], grow: 0.8, color: [0x6ec13a, 0x3d8a1a], alpha: [1, 0.2], shape: SHAPE.DISC, gravity: 16, drag: 0.4, bounce: 0.3, jitter: 1.2 }),
  clump: P({ life: [0.6, 0.9], size: [0.16, 0.26], grow: 0.9, color: [0x5a3b1e, 0x3a2412], alpha: [1, 0.3], shape: SHAPE.DISC, gravity: 18, bounce: 0.25, jitter: 1.5 }),
  spray: P({ life: [0.4, 0.7], size: [0.2, 0.38], grow: 1.8, color: [0xeaf8ff, 0xa8dcff], alpha: [0.75, 0], shape: SHAPE.SOFT, gravity: 6, drag: 1.2, jitter: 0.8 }),
  droplet: P({ life: [0.35, 0.6], size: [0.08, 0.13], grow: 0.5, color: [0xffffff, 0x9fd8ff], alpha: [1, 0], shape: SHAPE.STREAK, stretch: 0.05, gravity: 16, bounce: 0.15, jitter: 1 }),
  smoke: P({ life: [0.7, 1.2], size: [0.7, 1.1], grow: 3, color: [0x555a6a, 0x23262e], alpha: [0.6, 0], shape: SHAPE.SOFT, drag: 1.5, gravity: -1.4, spin: [-1.5, 1.5], jitter: 0.5 }),
  debris: P({ life: [0.6, 1.0], size: [0.14, 0.26], grow: 0.5, color: [0x8b93b3, 0x3a3f55], alpha: [1, 0], shape: SHAPE.DISC, gravity: 20, bounce: 0.4, jitter: 2 }),
  confetti: CONFETTI_COLOURS.map((c) => P({ life: [2.6, 4.2], size: [0.16, 0.26], grow: 1, color: [c, c], alpha: [1, 1], shape: SHAPE.CONFETTI, gravity: 6.5, drag: 1.3, spin: [-6, 6], flip: 9, jitter: 3 })),
  decalRing: (c) => P({ life: [0.5, 0.55], size: [0.8, 0.8], grow: 6, color: [c, c], alpha: [0.5, 0], shape: SHAPE.FLAT_RING }),
  landPuff: (c) => P({ life: [0.45, 0.7], size: [0.5, 0.8], grow: 2.6, color: [c, c], alpha: [0.5, 0], shape: SHAPE.SOFT, drag: 2, jitter: 0.7 }),
};
