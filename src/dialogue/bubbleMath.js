// Speech-bubble maths: lifetimes, camera projection, edge clamping, distance scaling and which bubbles get shown.
// Pure functions (no DOM, no THREE import) so they are unit tested in Node; src/ui/worldBubbles.js does the DOM work with them.

export const BUBBLE = Object.freeze({
  minMs: 1300,          // a bubble is never up for less than this ...
  maxTextMs: 2600,      // ... and for a plain (silent) line never more than this
  maxSpeechMs: 3600,    // a line that is spoken stays up while it is said, up to this
  maxMs: 12500,         // hard cap: a line that carries one of Marco's recordings stays up for the whole clip (the longest is about 11 s)
  fadeMs: 260,          // fade-out at the end of the life
  popMs: 380,           // pop-in
  maxVisible: 3,        // bubbles on screen at once
  nearM: 14,            // full size inside this distance (metres)
  farM: 74,             // hidden beyond this (the speaker is too far away to be the one talking to you)
  minScale: 0.74,       // smallest size of a far-away bubble (keeps the text readable)
  meScale: 0.82,        // the player's own bubble is a bit smaller
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * How long a bubble stays up, in ms. A plain line: scaled by the length of the text (about 1.3 to 2.6 s). A line that is spoken aloud by the
 * browser stays up while it is said (the estimated speaking time, at most 3.6 s). A line that carries one of Marco's recordings stays up for the
 * whole clip, so a long one is never cut short.
 * @param {string} text
 * @param {number} [clipSec] length of the recording, seconds (0 or omitted for plain lines)
 * @param {number} [speechMs] estimated speaking time of a synthesised line, ms (0 or omitted when it is not spoken)
 */
export function bubbleMs(text, clipSec = 0, speechMs = 0) {
  if (clipSec > 0) return Math.round(clamp(clipSec * 1000 + 150, BUBBLE.minMs, BUBBLE.maxMs));
  const len = String(text ?? '').length;
  const plain = clamp(1100 + len * 20, BUBBLE.minMs, BUBBLE.maxTextMs);
  if (speechMs > 0) return Math.round(clamp(Math.max(plain, speechMs * 0.9 + 250), BUBBLE.minMs, BUBBLE.maxSpeechMs));
  return Math.round(plain);
}

/**
 * State of a bubble at `ageMs` into a life of `lifeMs`.
 * @returns {{phase: 'in'|'hold'|'out'|'done', alpha: number, pop: number}} pop = 0..~1.1 scale curve of the pop-in (overshoots a little)
 */
export function bubbleState(ageMs, lifeMs) {
  if (ageMs >= lifeMs) return { phase: 'done', alpha: 0, pop: 1 };
  const fadeStart = Math.max(BUBBLE.popMs, lifeMs - BUBBLE.fadeMs);
  if (ageMs < 0) return { phase: 'in', alpha: 0, pop: 0 };
  if (ageMs < BUBBLE.popMs) {
    const k = ageMs / BUBBLE.popMs;
    return { phase: 'in', alpha: clamp(k * 3, 0, 1), pop: k * (1 + 0.16 * Math.sin(Math.PI * k)) };
  }
  if (ageMs >= fadeStart) return { phase: 'out', alpha: clamp(1 - (ageMs - fadeStart) / Math.max(1, lifeMs - fadeStart), 0, 1), pop: 1 };
  return { phase: 'hold', alpha: 1, pop: 1 };
}

/**
 * Project a world point to screen pixels with a THREE-style camera (reads `matrixWorld` and `projectionMatrix` element arrays; the camera is
 * assumed to have no scale, which is true of every camera here). Writes into `out`.
 * @param {{matrixWorld:{elements:ArrayLike<number>}, projectionMatrix:{elements:ArrayLike<number>}}} cam
 * @returns {{x:number, y:number, depth:number, dist:number, behind:boolean, onScreen:boolean}}
 */
export function projectToScreen(cam, x, y, z, W, H, out = {}) {
  const m = cam.matrixWorld.elements, p = cam.projectionMatrix.elements;
  const dx = x - m[12], dy = y - m[13], dz = z - m[14];
  const cx = dx * m[0] + dy * m[1] + dz * m[2];
  const cy = dx * m[4] + dy * m[5] + dz * m[6];
  const cz = dx * m[8] + dy * m[9] + dz * m[10];            // the camera looks down its own -z
  out.depth = -cz;
  out.dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  out.behind = -cz < 0.3;
  if (out.behind) { out.x = W * 0.5; out.y = H * 0.5; out.onScreen = false; return out; }
  const nx = (p[0] * cx) / -cz, ny = (p[5] * cy) / -cz;
  out.x = (nx * 0.5 + 0.5) * W;
  out.y = (1 - (ny * 0.5 + 0.5)) * H;
  out.onScreen = out.x >= 0 && out.x <= W && out.y >= 0 && out.y <= H;
  return out;
}

/** Size of a bubble for a speaker `dist` metres from the camera: 1 when near, shrinking to `minScale` at the far limit. */
export function distanceScale(dist) {
  return clamp(1 - ((dist - BUBBLE.nearM) / (BUBBLE.farM - BUBBLE.nearM)) * (1 - BUBBLE.minScale), BUBBLE.minScale, 1);
}

/** Is a speaker at this distance close enough to get a bubble over their head? */
export const inBubbleRange = (dist) => dist <= BUBBLE.farM;

/**
 * Place a bubble of size (w, h) (already scaled) over an anchor at (ax, ay): centred above it (the bubble's bottom edge is at `ay`, where the
 * pointer tip sits), then pushed inside a safe rectangle of the screen so it never covers the HUD: `left`/`right` are fractions of the width
 * kept free (the standings and item slot on the left, the minimap on the right), `top`/`bottom` the fractions of the height that bound the
 * bubble's top and bottom edges (the speedometer and boost bar live below `bottom`).
 * @returns {{x:number, y:number, side: null|'l'|'r'|'t'|'b', tail:number}} x = bubble centre, y = bubble bottom edge, side = which screen edge the anchor is
 *  beyond (null = on screen), tail = where the pointer sits along the bubble, 10..90 (%), so it keeps pointing at the anchor when the bubble was pushed sideways
 */
export function placeBubble(ax, ay, w, h, W, H, { margin = 8, top = 0.12, bottom = 0.8, left = 0, right = 0 } = {}) {
  const loX = W * left + margin + w * 0.5, hiX = Math.max(loX, W * (1 - right) - margin - w * 0.5);
  const loY = H * top + h, hiY = Math.max(loY, H * bottom);
  const cx = clamp(ax, loX, hiX), cy = clamp(ay, loY, hiY);
  const side = ax < 0 ? 'l' : ax > W ? 'r' : ay < 0 ? 't' : ay > H ? 'b' : null;
  return { x: cx, y: cy, side, tail: clamp(50 + ((ax - cx) / Math.max(1, w)) * 100, 10, 90) };
}

/** Is the anchor close enough to the screen for its bubble to be worth showing? (A speaker further out than this has left the picture.) */
export const anchorInView = (ax, ay, W, H) => ax > -0.04 * W && ax < 1.04 * W && ay > -0.02 * H && ay < 0.96 * H;

/** The free part of the screen a bubble may use: clear of the HUD's left column (standings, item slot), right column (minimap) and bottom row (speedo, boost). */
export const SAFE = Object.freeze({ left: 0.2, right: 0.16, top: 0.1, bottom: 0.78 });

/**
 * Choose which bubbles are shown: at most `max`, the player's own first, then the most recent. Input entries need `isPlayer` and `t0`.
 * @template T
 * @param {T[]} entries
 * @returns {T[]}
 */
export function pickVisible(entries, max = BUBBLE.maxVisible) {
  return [...entries].sort((a, b) => (b.isPlayer ? 1 : 0) - (a.isPlayer ? 1 : 0) || b.t0 - a.t0).slice(0, max);
}

/** Per-character bubble styling (a CSS class suffix); mirrors the delivery quirks in src/audio/speech.js. */
export const BUBBLE_STYLE = Object.freeze({
  marco: 'plain', subnet: 'posh', lambda: 'shout', packet: 'glitch', carlos: 'drawl', tilly: 'whisper', rex: 'robot', biscuit: 'squeak',
});
export const bubbleStyle = (charId) => BUBBLE_STYLE[charId] ?? 'plain';
