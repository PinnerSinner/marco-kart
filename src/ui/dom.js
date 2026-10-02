// Tiny DOM helpers. Only touch `document` inside functions, never at import time.

/**
 * Create an element. `tag` may carry classes and an id: "div.card.big#x".
 * @param {string} tag
 * @param {{ class?: string, text?: string, html?: string, style?: object, attrs?: object, data?: object, on?: object, [k: string]: any }|null} [props]
 * @param {...(Node|string|null|false|undefined)} kids
 * @returns {HTMLElement}
 */
export function h(tag, props, ...kids) {
  const m = /^([a-zA-Z0-9-]*)((?:[.#][\w-]+)*)$/.exec(tag);
  const el = document.createElement(m && m[1] ? m[1] : 'div');
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else if (k === 'attrs') { for (const [ak, av] of Object.entries(v)) if (av != null && av !== false) el.setAttribute(ak, av === true ? '' : av); }
      else if (k === 'data') { for (const [dk, dv] of Object.entries(v)) if (dv != null) el.dataset[dk] = dv; }
      else if (k === 'on') { for (const [ek, ev] of Object.entries(v)) el.addEventListener(ek, ev); }
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/**
 * Parse one element from an HTML/SVG string.
 * @param {string} markup
 * @returns {HTMLElement|SVGElement}
 */
export function fromHtml(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

/**
 * Set text only when it changed (avoids needless layout in per-frame HUD code).
 * @param {Node} el
 * @param {string|number} value
 * @returns {boolean} true if the DOM was touched
 */
export function setText(el, value) {
  const s = String(value);
  if (el.__t === s) return false;
  el.__t = s;
  el.textContent = s;
  return true;
}

/**
 * Toggle a class only when the state changed.
 * @param {Element} el
 * @param {string} cls
 * @param {boolean} on
 */
export function setClass(el, cls, on) {
  if (el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on);
}

/**
 * Web Animations helper that is a no-op where unsupported (old browsers, some test DOMs).
 * @param {Element} el
 * @param {Keyframe[]} frames
 * @param {KeyframeAnimationOptions} opts
 * @returns {Animation|null}
 */
export function anim(el, frames, opts) {
  if (!el || typeof el.animate !== 'function') return null;
  try { return el.animate(frames, { fill: 'both', ...opts }); } catch { return null; }
}

/** Springy scale pop, used for place changes, counters and button presses. */
export function pop(el, { from = 1.5, ms = 420, rot = 0 } = {}) {
  return anim(el, [
    { transform: `scale(${from}) rotate(${rot}deg)`, offset: 0 },
    { transform: 'scale(.92) rotate(0deg)', offset: 0.55 },
    { transform: 'scale(1.04)', offset: 0.78 },
    { transform: 'scale(1)', offset: 1 },
  ], { duration: ms, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'none' });
}

/**
 * A length in design units for inline styles (the stylesheet expands `12u` itself, inline styles cannot).
 * @param {number} n design units
 * @returns {string} css calc() expression
 */
export const U = (n) => `calc(var(--u)*${n})`;

/**
 * Remove every child of a node.
 * @param {Node} el
 */
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** @returns {number} monotonic seconds (performance.now based; falls back to Date) */
export function nowSec() {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}
