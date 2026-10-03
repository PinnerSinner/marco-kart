// MARCO KART front end. DOM + CSS + inline SVG only; talks to the rest of the game exclusively through bus events (SPEC section 6)
// and the public methods below (SPEC section 8).
import { bus } from '../core/bus.js';
import { Assets } from '../core/assets.js';
import { createStore } from './storage.js';
import { SettingsModel } from './settings.js';
import { Progress } from './progress.js';
import { NavManager } from './nav.js';
import { h, fromHtml, anim, sleep, nowSec, U } from './dom.js';
import { buildCss } from './styles/index.js';
import { waveTileUrl } from './motifs.js';
import { Hud } from './hud.js';
import { caricatureBackdrop } from './caricatureUi.js';
import { WorldBubbles } from './worldBubbles.js';
import { wantsBubble, wantsMenuSubtitle } from '../dialogue/bubbleQueue.js';
import { makeRng } from '../core/util.js';
import { LoadingScreen } from './screens/loading.js';
import { TitleScreen } from './screens/title.js';
import { MenuScreen } from './screens/menu.js';
import { CharScreen, KartScreen, DifficultyScreen, TrackScreen } from './screens/select.js';
import { SelectFlow } from './flow.js';
import { Turntable } from './turntable.js';
import { SettingsScreen } from './screens/settings.js';
import { ItemGuideScreen } from './screens/items.js';
import { AboutScreen } from './screens/about.js';
import { ResultsScreen, StandingsScreen, PodiumScreen } from './screens/results.js';
import { PauseMenu } from './screens/pause.js';
import { normaliseStandings, normaliseFinal } from './normalise.js';
import { CUPS, getTrackInfo, getCharacter } from '../core/roster.js';
import { hex } from './colour.js';
import { speedClassInfo } from '../core/speedClass.js';

const STYLE_ID = 'mk-ui-style';
/** Screens that get the diagonal wipe when moving between each other. */
const WIPES = new Set(['title', 'menu', 'char', 'kart', 'difficulty', 'track', 'items', 'settings', 'about']);
const RESULT_SCREENS = new Set(['results', 'standings', 'podium']);

export class UI {
  /**
   * @param {{ store?: object, emit?: Function, countdownSfx?: boolean }} [opts] `store` and `emit` are injectable for tests;
   *   `countdownSfx:false` stops the UI emitting countdown-tick / countdown-go (if the audio module already reacts to race:countdown).
   */
  constructor(opts = {}) {
    this.opts = { countdownSfx: true, ...opts };
    this.emit = opts.emit ?? ((n, d) => bus.emit(n, d));
    this.store = opts.store ?? createStore();
    this.settings = new SettingsModel(this.store, this.emit);
    this.progress = new Progress(this.store);
    this.nav = new NavManager({ onSfx: (n) => this.sfx(n) });
    this.input = null;
    this.mounted = false;
    this.screens = {};
    this.current = null;
    this.shown = null;
    this._pauseClosedAt = -9;
    this.unavailableTracks = new Set();
    this.flow = null;
    this.turntable = new Turntable();
    this._lastTap = null;
    this.trackId = null;
    this._offs = [];
    this._wipeToken = 0;
    this._musicKey = null;
  }

  // ---- lifecycle ----------------------------------------------------------------------------------------------------
  /**
   * Build the UI inside `rootEl` (normally `#ui-root`). Emits `ui:settings` once so audio and the renderer pick up saved settings.
   * @param {HTMLElement} rootEl
   */
  mount(rootEl) {
    if (this.mounted) return;
    this.mounted = true;
    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement('style');
      st.id = STYLE_ID; st.textContent = buildCss();
      document.head.append(st);
    }
    this.root = h('div.mk', { data: { bg: 'none', screen: '' } });
    this.root.style.setProperty('--wave', waveTileUrl());
    this.bg = this._buildBackground();
    this.screensEl = h('div.screens');
    this.overlay = h('div.overlay-layer');
    this.wipe = h('div.wipe', null, h('i'), h('i'), h('i'), h('i'));
    this.hud = new Hud({ sfx: (n) => this.sfx(n), countdownSfx: this.opts.countdownSfx, onPause: () => this.emit('ui:pause', {}), onSwapItem: () => this.emit('ui:item-swap', {}) });
    this.root.append(this.bg, this.screensEl);
    this.bubbles = new WorldBubbles().mount(this.root);          // floating speech text over the racers: below the HUD, above the menus
    this.bubbles.setEnabled(this.settings.get().bubbles !== false);
    this.hud.build(this.root);
    this.subtitle = h('div.subtitle', { attrs: { 'aria-live': 'polite' } });       // menu lines only (no kart to float over)
    this.root.append(this.subtitle, this.overlay, this.wipe,
      h('div.rotate-hint', null, h('div.phone'), h('div.disp', { text: 'Turn your phone sideways' }), h('div.muted', { text: 'Marco Kart is a landscape game.' })));
    rootEl.append(this.root);

    const S = { loading: LoadingScreen, title: TitleScreen, menu: MenuScreen, char: CharScreen, kart: KartScreen, difficulty: DifficultyScreen, track: TrackScreen, settings: SettingsScreen, items: ItemGuideScreen, about: AboutScreen, results: ResultsScreen, standings: StandingsScreen, podium: PodiumScreen };
    for (const [name, Cls] of Object.entries(S)) this._register(new Cls(this));
    this.pause = new PauseMenu(this);
    this.overlay.append(this.pause.el);

    this.nav.attach();
    this.root.addEventListener('pointerdown', (e) => { this._lastPointer = e.pointerType; }, true);
    this.root.addEventListener('click', (e) => {
      const t = e.target.closest?.('[data-nav]');
      if (t && t.dataset.sfx !== 'none') this.sfx(t.dataset.sfx || 'ui-click');
    });
    this._offs.push(bus.on('bark', (d) => this._onBark(d)));
    this._offs.push(bus.on('music', (d) => { if (d?.key) this._musicKey = d.key; }));   // the game starts race music itself: remember it so the menu tune restarts after
    this._offs.push(bus.on('race:lap', (d) => this._onLap(d)));
    this._offs.push(bus.on('race:final-lap', () => this.hud.visible && this.hud.banner('FINAL LAP!', 'final', { ms: 2300 })));
    this._offs.push(bus.on('kart:perfect-jump', (d) => { if (d?.isPlayer && this.hud.visible) this.hud.pop('PERFECT JUMP', 'jump', { sub: 'TURBO!' }); }));
    this._offs.push(bus.on('ui:start', (d) => { this.lastStart = d; }));
    this.hud.setUnits(this.settings.get().units);
    this.settings.announce();
  }

  /** Remove the UI from the page and stop listening. */
  destroy() {
    if (!this.mounted) return;
    this.nav.detach();
    clearTimeout(this._menuCap); clearTimeout(this._subT);
    for (const off of this._offs) off();
    this._offs = [];
    for (const s of Object.values(this.screens)) s.leave();
    this.root.remove();
    document.getElementById(STYLE_ID)?.remove();
    this.mounted = false;
  }

  _register(screen) {
    this.screens[screen.name] = screen;
    screen.build();
    screen.built = true;
    this.screensEl.append(screen.el);
  }

  _buildBackground() {
    const rng = makeRng(5);
    const streaks = h('div.bg-streaks');
    for (let i = 0; i < 26; i++) {
      streaks.append(h('i', { style: { '--y': `${(rng() * 100).toFixed(1)}%`, '--l': U((60 + rng() * 240).toFixed(0)), '--h': U((1.5 + rng() * 3).toFixed(1)), '--d': `${(1.4 + rng() * 2.6).toFixed(2)}s`, '--dl': `${(-rng() * 4).toFixed(2)}s`, '--o': (0.25 + rng() * 0.6).toFixed(2) } }));
    }
    this.cari = caricatureBackdrop();                      // comic collage layers (menu, loading, select, items, podium); built lazily, absent without art
    return h('div.bg', null, h('div.bg-base'), h('div.bg-rays'), this.cari.el, h('div.bg-slab.a'), h('div.bg-slab.b'), h('div.bg-slab.c'), streaks, h('div.bg-wave'), h('div.bg-vignette'), h('div.bg-dim'));
  }

  // ---- helpers used by screens --------------------------------------------------------------------------------------
  /**
   * Emit an sfx event.
   * @param {string} name one of the SPEC sfx names
   * @param {object} [extra] volume / pitch
   */
  sfx(name, extra) {
    this.emit('sfx', { name, ...extra });
  }

  /**
   * Show a screen by name, with the wipe transition between menu screens.
   * @param {string} name registry key
   * @param {object} [params] passed to screen.enter()
   */
  show(name, params) {
    const scr = this.screens[name];
    if (!scr) { console.warn(`[ui] unknown screen "${name}"`); return; }
    if (this.shown === scr && this.current === scr) { scr.enter(params); this.nav.refresh(); return; }
    const prev = this.shown;
    this.current = scr;
    this.pause.hide();
    const swap = () => {
      if (this.current !== scr) return;
      // deactivate everything that is up, not just the last screen: rapid show() calls can leave a wipe half-done
      for (const other of Object.values(this.screens)) {
        if (other !== scr && other.el.classList.contains('is-active')) { other.leave(); other.el.classList.remove('is-active'); }
      }
      this.shown = scr;
      this.hud.setVisible(false);
      scr.el.classList.add('is-active');
      this.root.dataset.bg = scr.bg; this.root.dataset.screen = scr.name;
      this.cari?.show(scr.name);
      scr.enter(params);
      this.nav.setRoot(scr.el, scr.navOptions());
    };
    if (prev && WIPES.has(prev.name) && WIPES.has(name)) this._wipeThen(swap); else swap();
  }

  async _wipeThen(fn) {
    const token = ++this._wipeToken;
    const stripes = [...this.wipe.children];
    this.nav.clear();
    this.wipe.style.visibility = 'visible';
    stripes.forEach((s, i) => anim(s, [{ transform: 'translateX(-120%) skewX(-18deg)' }, { transform: 'translateX(0) skewX(-18deg)' }], { duration: 200, delay: i * 30, easing: 'cubic-bezier(.5,0,.2,1)' }));
    await sleep(200 + 3 * 30 + 10);
    if (token !== this._wipeToken) return;
    fn();
    stripes.forEach((s, i) => anim(s, [{ transform: 'translateX(0) skewX(-18deg)' }, { transform: 'translateX(120%) skewX(-18deg)' }], { duration: 260, delay: i * 30, easing: 'cubic-bezier(.6,0,.3,1)' }));
    await sleep(260 + 3 * 30 + 20);
    if (token === this._wipeToken) this.wipe.style.visibility = 'hidden';
  }

  _setMusic(key) {
    if (this._musicKey === key) return;
    this._musicKey = key;
    this.emit('music', { key });
  }

  // ---- public API (SPEC section 8) ----------------------------------------------------------------------------------
  /**
   * Loading / boot screen.
   * @param {string} [text] status line
   * @param {number} [progress] 0..1; omit for the indeterminate sweep
   */
  showLoading(text, progress) {
    this.show('loading');
    this.screens.loading.set(text, progress);
  }

  /** Title screen ("press any key" leads to the main menu). */
  showTitle() {
    this._setMusic('menu');
    this.show('title');
  }

  /** Main menu. */
  showMenu() {
    this._setMusic('menu');
    this.show('menu');
  }

  /** @param {boolean} on show or hide the race HUD */
  showHud(on) {
    this.hud.setVisible(!!on);
    if (on) {
      this.root.dataset.bg = 'none';
      this._hideSubtitle();
    } else this.bubbles?.clear();
  }

  /**
   * Per-frame speech bubble placement (call after the camera is final for the frame).
   * @param {object} camera THREE camera @param {(id: string, out: {x:number,y:number,z:number}) => boolean} anchorOf head position of a racer
   */
  updateBubbles(camera, anchorOf) {
    if (this.hud.visible) this.bubbles?.update(camera, anchorOf);
  }

  /** Remove every speech bubble (pause, quit). */
  clearBubbles() { this.bubbles?.clear(); }

  /** Floating speech text over the karts on or off (Settings). @param {boolean} on */
  setBubbles(on) { this.bubbles?.setEnabled(!!on); }

  /**
   * Per-frame HUD update.
   * @param {object} snap HudSnapshot from race.getHud()
   * @param {number} dt seconds
   */
  updateHud(snap, dt) {
    this.hud.update(snap, dt);
  }

  /** @param {number} n 3, 2, 1 or 0 (GO) */
  showCountdown(n) { this.hud.countdown(n); }

  /**
   * @param {string} text
   * @param {'final'|'wrong'|'best'|'good'|'bad'|'lap'|'info'} [kind]
   */
  showBanner(text, kind = 'info') { this.hud.banner(text, kind); }

  /** Open the pause menu over the HUD (call when `pausePressed` fires or after `ui:pause`). Idempotent. */
  showPause() {
    if (!this.mounted || this.pause.open) return;
    this.pause.show();
  }

  /** Close the pause menu without emitting anything. */
  hidePause() {
    if (!this.pause?.open) return;
    this.pause.hide();
    this._pauseClosedAt = nowSec();
  }

  /**
   * True while the pause menu is up and for 0.3 s afterwards, so the same Esc / Start press that closed it
   * cannot be read again by the game's InputManager as a fresh `pausePressed`.
   * @returns {boolean}
   */
  isPauseOpen() { return !!this.pause?.open || nowSec() - this._pauseClosedAt < 0.3; }

  /** Resume button, Esc or Start inside the pause menu: closes it and emits `ui:resume`. */
  resumeFromPause() { this.hidePause(); this.emit('ui:resume', {}); }

  /** Confirmed restart: closes the menu and emits `ui:restart`. */
  restartFromPause() { this.hidePause(); this.hud.clearFx(); this.emit('ui:restart', {}); }

  /** Confirmed quit: closes the menu and emits `ui:quit`. */
  quitFromPause() { this.hidePause(); this.emit('ui:quit', {}); }

  /**
   * Race results table (SPEC section 8). Also records best lap / best race time for the player.
   * @param {{ place: number, id: string, name: string, charId: string, time: number|null, bestLap: number|null, points: number, isPlayer: boolean }[]} results race.results()
   * @param {{ gp?: boolean, trackId?: string, laps?: number, raceIndex?: number, total?: number, speedClass?: number }} [opts] `trackId`/`laps` are optional extras used for best times; without them the UI infers them from `ui:start` and `race:lap`
   */
  showRaceResults(results, opts = {}) {
    const gp = !!opts.gp;
    const raceIndex = opts.raceIndex ?? this.gpRaceIndex ?? 0;
    const trackId = opts.trackId ?? (gp ? CUPS[0].tracks[raceIndex % CUPS[0].tracks.length] : this.lastStart?.trackId) ?? this.trackId;
    const laps = opts.laps ?? this._lastLaps ?? this.lastStart?.laps ?? 3;
    const me = (results ?? []).find((r) => r.isPlayer);
    let records = null;
    const speedClass = opts.speedClass ?? this.lastStart?.speedClass ?? this.settings.get().speedClass;
    if (me && trackId) records = this.progress.record(trackId, laps, { bestLap: me.bestLap, time: me.time }, speedClass);
    if (gp) { this.gpRaceIndex = raceIndex + 1; this._lastGain = new Map((results ?? []).map((r) => [r.id, r.points || 0])); }
    this._setMusic('results');
    this.hideAll();
    this.show('results', { results, gp, records, raceIndex, total: opts.total ?? CUPS[0].tracks.length, trackName: trackId ? getTrackInfo(trackId).name : '', speedName: speedClassInfo(speedClass).name });
  }

  /**
   * Grand Prix standings between races.
   * @param {any} standings `GrandPrix.standings()`: rows with id/charId/name/points (and optionally `gained`)
   * @param {{ raceIndex?: number, total?: number }} [opts]
   */
  showGpStandings(standings, { raceIndex = 0, total = CUPS[0].tracks.length } = {}) {
    const rows = normaliseStandings(standings, this._lastGain);
    if (!rows.length) return;
    this._setMusic('results');
    this.hideAll();
    this.show('standings', { rows, raceIndex, total });
  }

  /**
   * Podium / final screen with the trophy tier.
   * @param {any} finalResults `GrandPrix.finalResults()`: standings plus the player's trophy ('gold'|'silver'|'bronze'|'none')
   */
  showPodium(finalResults) {
    const f = normaliseFinal(finalResults);
    if (!f.rows.length) return;
    this._setMusic('podium');
    this.hideAll();
    this.show('podium', f);
  }

  _onLap(d) {
    if (!d) return;
    if (Number.isFinite(d.laps)) this._lastLaps = d.laps;
    if (!d.isPlayer || !this.hud?.visible || !this.lastStart) return;
    const tid = this.lastStart.trackId ?? (this.lastStart.mode === 'gp' ? CUPS[0].tracks[(this.gpRaceIndex ?? 0) % CUPS[0].tracks.length] : null);
    if (!tid) return;
    const prev = this.progress.getBest(tid, undefined, this.lastStart.speedClass ?? this.settings.get().speedClass).bestLap;
    if (prev != null && d.time < prev - 1e-6) this.hud.banner('NEW BEST LAP', 'best', { sub: 'Personal record', ms: 2300 });
  }

  /** Hide every screen, the HUD and all transient effects. */
  hideAll() {
    this._wipeToken++;
    this.wipe.style.visibility = 'hidden';
    for (const scr of Object.values(this.screens)) if (scr.el.classList.contains('is-active')) { scr.leave(); scr.el.classList.remove('is-active'); }
    this.current = null; this.shown = null;
    this.bubbles?.clear();
    this.subtitle?.classList.remove('on');
    this.pause.hide();
    this.nav.clear();
    this.hud.setVisible(false);
    this.turntable.stop();
    this.root.dataset.bg = 'none'; this.root.dataset.screen = '';
  }

  /** @param {object|null} inputManager the game's InputManager (for `bindingsHelp()`) */
  setInput(inputManager) { this.input = inputManager; }

  /** @returns {{ volume: {master:number,music:number,sfx:number,voice:number}, quality: string, cameraShake: number, touch: boolean, units: string }} */
  getSettings() { return this.settings.get(); }

  /**
   * Run the selection flow (SPEC section 8): character, kart, difficulty (gp/single), track (single/time), then `ui:start`.
   * @param {{ mode: 'gp'|'single'|'time' }} opts
   */
  showSelect({ mode = 'gp' } = {}) {
    this._setMusic('menu');
    this.flow = new SelectFlow(mode, { picks: { ...this.progress.getPicks(), speedClass: this.settings.get().speedClass }, emit: (n, d) => { if (n === 'ui:start') this.startRace(d); this.emit(n, d); } });
    this.show(this.flow.step);
  }

  /**
   * Switch the HUD to the phone layout (compact speed and lap readout at the top, position under the minimap) so it clears the touch controls.
   * @param {boolean} on
   */
  setTouchLayout(on) {
    if (this.mounted) this.root.classList.toggle('touch', !!on);
  }

  /** Mark tracks that cannot be raced yet (greyed out, "coming soon"). @param {string[]} ids */
  setUnavailableTracks(ids) {
    this.unavailableTracks = new Set(ids);
  }

  /**
   * Called just before `ui:start` goes out: remember the picks, free the preview GPU context, reset per-run trackers.
   * @param {object} payload the `ui:start` payload
   */
  startRace(payload) {
    this.progress.savePicks(this.flow.picks);
    this.turntable.dispose();
    this.gpRaceIndex = 0;
    this.lastStart = payload;
  }

  /**
   * Click helper for selection cards: mouse and keyboard confirm at once, touch selects on the first tap and confirms on the second
   * (so phones can see the preview before committing).
   * @param {HTMLElement} el the card
   * @param {Event} e the click event
   * @param {Function} confirm called when the tap should confirm
   */
  tapConfirm(el, e, confirm) {
    const touch = e.pointerType === 'touch' || this._lastPointer === 'touch';
    if (touch && this._lastTap !== el) { this._lastTap = el; this.nav.focus(el, { silent: true }); this.sfx('ui-hover'); return; }
    this._lastTap = null;
    confirm();
  }

  /**
   * A dialogue bark (recorded clip or not). In a race it floats as see-through white text over the speaker's kart (the player's own lines too);
   * there is no other race caption. Menu lines (title greeting, racer pick) have no kart, so they get the small bottom-centre subtitle.
   */
  _onBark(d) {
    if (!d || !d.text || !this.mounted) return;
    if (wantsMenuSubtitle(d)) {
      // the screen change that triggered the line wipes the screen about 300 ms later, so the subtitle appears just after that
      clearTimeout(this._menuCap);
      this._menuCap = setTimeout(() => { if (this.mounted && !this.hud.visible) this._showSubtitle(d.charId || 'marco', d.text, Math.max(1200, (d.ms || 2500) - 380)); }, 380);
      return;
    }
    if (this.hud.visible && this.bubbles?.enabled && wantsBubble(d)) this.bubbles.add(d);
  }

  _showSubtitle(charId, text, ms) {
    if (!this.subtitle) return;
    this.subtitle.textContent = text;
    this.subtitle.style.setProperty('--pc', hex(getCharacter(charId).colour));
    this.subtitle.classList.remove('on'); void this.subtitle.offsetWidth; this.subtitle.classList.add('on');
    clearTimeout(this._subT);
    this._subT = setTimeout(() => this._hideSubtitle(), ms);
  }

  _hideSubtitle() {
    clearTimeout(this._menuCap); clearTimeout(this._subT);
    this.subtitle?.classList.remove('on');
  }
}
