// Settings screen: volumes, quality, camera shake, touch controls, units. Every change applies live and emits `ui:settings`.
import { Screen } from './screen.js';
import { h, fromHtml } from '../dom.js';
import { glyph } from '../icons.js';
import { sliderRow, segRow, toggleRow } from '../widgets.js';
import { SHAKE_LEVELS } from '../settings.js';
import { SPEED_CLASS_IDS } from '../../core/speedClass.js';
import { PHOTO_PROPS, getPhotoProps, setPhotoProps } from '../photoUi.js';
import { CARICATURE_ART, getCaricatureArt, setCaricatureArt } from '../caricatureUi.js';

const VOLS = [['master', 'Master volume'], ['music', 'Music'], ['sfx', 'Effects'], ['voice', 'Voices']];

/** Map a stored 0..1 shake value onto the nearest labelled level id. */
export const shakeId = (v) => SHAKE_LEVELS.reduce((best, l) => (Math.abs(l.value - v) < Math.abs(best.value - v) ? l : best), SHAKE_LEVELS[0]).id;

/**
 * Rows for the volume sliders, shared with the pause menu.
 * @param {import('../UI.js').UI} ui
 * @param {string[]} keys which of master/music/sfx/voice
 * @returns {{ rows: HTMLElement[], refresh: () => void }}
 */
export function volumeRows(ui, keys) {
  let last = 0;
  const ctl = {};
  const rows = keys.map((k) => {
    const label = VOLS.find((v) => v[0] === k)[1];
    const r = sliderRow({ label, value: ui.settings.get().volume[k], onChange: (v) => {
      ui.settings.set({ volume: { [k]: v } });
      const now = performance.now();
      if (now - last > 90) { last = now; ui.sfx('ui-hover', { pitch: 0.8 + v * 0.6 }); }
    } });
    ctl[k] = r;
    return r.el;
  });
  return { rows, refresh() { const s = ui.settings.get(); for (const k of keys) ctl[k].set(s.volume[k]); } };
}

export class SettingsScreen extends Screen {
  constructor(ui) { super(ui, 'settings'); }

  build() {
    const ui = this.ui;
    const s = ui.settings.get();
    this.vols = volumeRows(ui, VOLS.map((v) => v[0]));
    this.quality = segRow({ label: 'Graphics', icon: 'gear', options: [{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }], value: s.quality, onChange: (q) => ui.settings.set({ quality: q }) });
    this.shake = segRow({ label: 'Camera shake', icon: 'bolt', options: SHAKE_LEVELS.map((l) => ({ id: l.id, label: l.id === 'off' ? 'Off' : l.id === 'low' ? 'Gentle' : 'Full' })), value: shakeId(s.cameraShake), onChange: (id) => ui.settings.set({ cameraShake: SHAKE_LEVELS.find((l) => l.id === id).value }) });
    this.photos = segRow({ label: 'Photo props', icon: 'flag', options: PHOTO_PROPS, value: getPhotoProps(), onChange: (id) => setPhotoProps(id) });
    this.cari = segRow({ label: 'Caricature art', icon: 'flag', options: CARICATURE_ART, value: getCaricatureArt(), onChange: (id) => setCaricatureArt(id) });
    this.cari.el.classList.add('row-cari');                 // a longer label than its siblings: tighter buttons so the row stays inside the panel
    this.speedClass = segRow({ label: 'Game speed (Mbps)', icon: 'bolt', options: SPEED_CLASS_IDS.map((id) => ({ id, label: String(id) })), value: s.speedClass, onChange: (id) => ui.settings.set({ speedClass: id }) });
    this.touch = toggleRow({ label: 'Touch controls', icon: 'pad', value: s.touch, onChange: (on) => ui.settings.set({ touch: on }) });
    this.speech = toggleRow({ label: 'Rival voices (speech)', icon: 'bolt', value: s.speech, onChange: (on) => ui.settings.set({ speech: on }) });
    this.speechMarco = toggleRow({ label: 'Read out Marco\'s missing lines', icon: 'bolt', value: s.speechMarco, onChange: (on) => ui.settings.set({ speechMarco: on }) });
    this.rude = toggleRow({ label: 'Rude banter (sweary)', icon: 'bolt', value: s.rude, onChange: (on) => ui.settings.set({ rude: on }) });
    this.blips = toggleRow({ label: 'Blip voices (babble)', icon: 'bolt', value: s.blips, onChange: (on) => ui.settings.set({ blips: on }) });
    this.bubbles = toggleRow({ label: 'Floating speech text', icon: 'flag', value: s.bubbles, onChange: (on) => ui.settings.set({ bubbles: on }) });
    this.speechNote = h('div.set-note', { text: 'Spoken lines come from your browser\'s own voice engine, which the game cannot mix: it speaks one line at a time at its own level (the Voices slider only turns it down below half way). Blip voices add a babble for every character that overlaps freely. Marco\'s recorded lines are levelled, overlap with everything and follow the Voices slider.', attrs: { style: 'font-size:12px;line-height:1.35;opacity:.7;padding:2px 6px 0' } });
    this.units = segRow({ label: 'Speed units', icon: 'flag', options: [{ id: 'kmh', label: 'km/h' }, { id: 'mph', label: 'mph' }], value: s.units, onChange: (u) => { ui.settings.set({ units: u }); ui.hud.setUnits(u); } });
    this.reset = h('button.btn.small', { attrs: { type: 'button' }, data: { nav: '', sfx: 'ui-confirm' }, on: { click: () => { ui.settings.reset(); this.sync(); ui.hud.setUnits(ui.settings.get().units); } } }, fromHtml(glyph('restart')), h('span', { text: 'Reset to defaults' }));
    this.backBtn = h('button.btn.small', { attrs: { type: 'button' }, data: { nav: '', sfx: 'ui-back' }, on: { click: () => this.back() } }, fromHtml(glyph('back')), h('span', { text: 'Back' }));
    const col = (title, ...rows) => h('div.set-col', null, h('div.set-h', { text: title }), ...rows);
    this.el.append(
      h('div.hdr.drop-in', null, h('div.hdr-l', null, h('div.hdr-title', { text: 'Settings' }), h('div.hdr-sub', { text: 'Changes apply straight away' }))),
      h('div.screen-body.set-body.rise', null,
        col('Sound', ...this.vols.rows, this.speech.el, this.speechMarco.el, this.rude.el, this.blips.el, this.speechNote),
        col('Game', this.speedClass.el, this.quality.el, this.photos.el, this.cari.el, this.shake.el, this.touch.el, this.bubbles.el, this.units.el)),
      h('div.ftr', null, h('div.ftr-btns', null, this.backBtn, this.reset)));
  }

  sync() {
    const s = this.ui.settings.get();
    this.vols.refresh(); this.quality.set(s.quality); this.photos.set(getPhotoProps()); this.cari.set(getCaricatureArt()); this.shake.set(shakeId(s.cameraShake)); this.touch.set(s.touch); this.units.set(s.units); this.speedClass.set(s.speedClass); this.speech.set(s.speech); this.speechMarco.set(s.speechMarco); this.rude.set(s.rude); this.blips.set(s.blips); this.bubbles.set(s.bubbles);
  }

  enter() { this.sync(); }

  back() { this.ui.showMenu(); }

  navOptions() { return { onBack: () => this.back() }; }
}
