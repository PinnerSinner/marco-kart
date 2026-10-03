// A photo card that fades through Marco's hero photos (title screen and main menu share it). Photos that are missing or fail to load are skipped.
import { h } from './dom.js';
import { Assets } from '../core/assets.js';
import { HERO_PHOTOS } from './copy.js';

/**
 * Build the slides for the photos that exist in the asset registry.
 * @param {string} cls class of the card element that holds the slides
 * @returns {{ el: HTMLElement|null, show: (i: number) => void, start: (ms?: number) => void, stop: () => void }} `el` is null when no photo exists
 */
export function photoCycle(cls = 'hero-card') {
  const photos = HERO_PHOTOS.filter((k) => Assets.has(k.key));
  if (!photos.length) return { el: null, show() {}, start() {}, stop() {} };
  const slides = photos.map((k, i) => h('div.hero-slide' + (k.fit === 'contain' ? '.contain' : '') + (i === 0 ? '.on' : ''), null,
    h('img', { attrs: { src: Assets.uri(k.key), alt: 'Marco', draggable: 'false' }, on: { error: (e) => e.target.closest('.hero-slide').classList.add('missing') } }),
    h('span.hero-cap', { text: k.cap })));
  const api = {
    el: h(`div.${cls}`, null, ...slides),
    idx: 0,
    timer: 0,
    /** @param {number} i slide to show (wraps; skips slides that failed to load) */
    show(i) {
      for (let n = 0; n < slides.length; n++) { api.idx = (i + n) % slides.length; if (!slides[api.idx].classList.contains('missing')) break; }
      slides.forEach((e, k) => e.classList.toggle('on', k === api.idx));
    },
    /** Restart from the first photo and cycle every `ms`. @param {number} [ms] */
    start(ms = 3400) {
      clearInterval(api.timer);
      api.show(0);
      if (slides.length > 1) api.timer = setInterval(() => api.show(api.idx + 1), ms);
    },
    stop() { clearInterval(api.timer); },
  };
  return api;
}
