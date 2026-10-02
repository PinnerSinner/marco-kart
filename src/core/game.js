// Game: the integration layer. Owns the renderer, the loop and the state machine that wires every module together:
//   boot -> title -> menu -> select -> loading -> intro -> countdown/racing -> finish -> results -> (GP standings -> next race | podium) -> menu
// All UI communication is over the bus (SPEC section 6); all sim work happens in fixed 1/60 s steps.
import * as THREE from 'three';
import { bus } from './bus.js';
import { CFG } from './config.js';
import { resolveSpeedClass, speedClassFromQuery, speedClassInfo } from './speedClass.js';
import { Assets } from './assets.js';
import { clamp, clamp01, makeRng } from './util.js';
import { CHARACTERS, KARTS, TRACKS, CUPS, getCharacter, getTrackInfo } from './roster.js';
import { InputManager } from './input.js';
import { AudioManager } from '../audio/AudioManager.js';
import { UI } from '../ui/UI.js';
import { charName } from '../ui/chars.js';
import { DialogueDirector } from '../dialogue/director.js';
import { voiceTakes } from './voicelines.js';
import { Race, GrandPrix } from '../race/index.js';
import { ChaseCamera } from '../kart/ChaseCamera.js';
import { createTrack } from '../track/index.js';
import { RaceView } from '../visuals/RaceView.js';
import { applyEnvironment } from '../visuals/environment.js';
import { createPostFX } from '../visuals/postfx.js';
import { decorateTrack } from '../visuals/photoDecor.js';
import { decorateCaricature } from '../visuals/caricatureDecor.js';
import { decorateKarts } from '../visuals/caricatureKart.js';
import { HudFace } from '../ui/hudFace.js';
import { showIntroCard, getPhotoProps } from '../ui/photoUi.js';
import { getCaricatureArt } from '../ui/caricatureUi.js';

const PLAYER_ID = 'player';
const MAX_STEPS = 5;
const INTRO_SECONDS = 4.6;
const FINISH_WAIT = 9;          // s after the human finishes before the results screen appears at the latest
const FINISH_MIN = 4.5;         // ... and at the earliest, so the FINISH! banner and the victory orbit are always seen
const PIXEL_RATIO = { low: 1, medium: 1.5, high: 2 };
const _vp = new THREE.Vector3(), _vl = new THREE.Vector3();
const nextFrames = (n = 2) => new Promise((res) => { const f = () => (--n <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });

export class Game {
  /** @param {{canvas: HTMLCanvasElement, uiRoot: HTMLElement}} o */
  constructor({ canvas, uiRoot }) {
    this.canvas = canvas; this.uiRoot = uiRoot;
    this.phase = 'boot';           // boot | menu | loading | intro | racing | finishing | results
    this.paused = false;
    this.quality = 'high';
    this.session = null;           // { mode, charId, kartId, difficulty, trackId, laps, speedClass }
    this.settingsSpeedClass = resolveSpeedClass();   // the saved default game speed (Settings), kept up to date by applySettings
    this.gp = null;
    this.race = null; this.track = null; this.view = null; this.env = null; this.post = null;
    this._acc = 0; this._last = 0; this._finishTimer = 0; this._voiceAt = new Map(); this._raf = 0;
    this._loadToken = 0; this._swapQueued = false; this._edgeGuardUntil = 0; this._voiceBusyUntil = 0; this._voicePrio = 0;
    this._unsub = [];
    // head position of a racer for the speech bubbles (the name tag floats just above the head, the bubble above that)
    this._bubbleAnchor = (id, out) => {
      const kv = this.view?.byId.get(id);
      if (!kv) return false;
      const s = kv.scaleNow || 1;
      out.x = kv.x; out.z = kv.z;
      out.y = kv.y + (2.35 + 0.5 * s) * s + (kv.racer?.isPlayer ? -0.35 : 0.8);
      return true;
    };
  }

  /** Create everything and show the title. */
  async init() {
    const canvas = this.canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x0b0d1a, 1);
    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 2500);
    this.scene = new THREE.Scene();
    this.chase = new ChaseCamera(this.camera);
    this.input = new InputManager(canvas);
    this.audio = new AudioManager();
    this.ui = new UI({ countdownSfx: false });

    this._on('ui:start', (d) => this.startSession(d));
    this._on('ui:continue', () => this.onContinue());
    this._on('ui:pause', () => this.pause());
    this._on('ui:resume', () => this.resume());
    this._on('ui:item-swap', () => { this._swapQueued = true; });   // a tap on the small second item slot (touch / mouse)
    this._on('ui:restart', () => this.restart());
    this._on('ui:quit', () => this.quitToMenu());
    this._on('ui:settings', (s) => this.applySettings(s));
    this._on('ui:photoprops', (m) => this.decor?.setMode(m));
    this._on('ui:caricatureart', (m) => { this.cariDecor?.setMode(m); this.kartArt?.setMode(m); });
    this._on('race:countdown', (d) => this.onCountdown(d));
    this._on('race:finish', (d) => this.onFinish(d));
    // barks: the director turns bus events into character lines (speech bubbles, Marco's recordings, speech synthesis)
    this.dialogue = new DialogueDirector({
      bus, now: () => performance.now() / 1000,
      lookup: (id) => this.race?.racers.find((r) => r.id === id) ?? null,
      hasClip: (key) => voiceTakes(Assets, key).length > 0,
      nameOf: (c) => charName(c),
      isCustom: (c) => !!getCharacter(c)?.customSlot && !!Assets.text('custom_rival_name', ''),   // a real person in the custom slot is never named in an edgy line
    }).start();

    const unlock = () => this.audio.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });
    window.addEventListener('resize', () => this.resize());

    this.input.setPauseButton(false);     // the HUD has its own pause button
    this.ui.setInput(this.input);
    this.ui.mount(this.uiRoot);           // emits ui:settings once: volumes, quality etc. are applied by applySettings
    this.hudFace = new HudFace(PLAYER_ID);   // live driver portrait on the HUD (expression follows the race events)
    (this.uiRoot.querySelector('.hud') ?? this.uiRoot).append(this.hudFace.el);
    this.ui.showLoading('Warming up the engines…', 0.1);
    this.resize();
    await nextFrames(2);
    this.ui.setUnavailableTracks(this.probeTracks());
    this.ui.showLoading('Ready.', 1);
    await nextFrames(2);
    this.setPhase('menu');
    this.ui.showTitle();
    this._last = performance.now();
    this._raf = requestAnimationFrame((t) => this.frame(t));
  }

  _on(name, fn) { this._unsub.push(bus.on(name, fn)); }

  /** Ids of tracks that cannot be built yet (greyed out in the track select). */
  probeTracks() {
    const bad = [];
    for (const t of TRACKS) {
      try { createTrack(t.id, { headless: true }).dispose?.(); } catch (e) { bad.push(t.id); console.warn(`[game] track "${t.id}" unavailable: ${e.message}`); }
    }
    return bad;
  }

  // ---- settings / size -------------------------------------------------------------------------------------------------------

  applySettings(s) {
    if (!s) return;
    if (s.volume) this.audio.setVolumes(s.volume);
    if (s.speech !== undefined || s.speechMarco !== undefined || s.blips !== undefined) this.audio.setSpeech({ rivals: s.speech, marco: s.speechMarco, blips: s.blips });
    if (s.rude !== undefined && this.dialogue) this.dialogue.rude = !!s.rude;     // 'Rude banter' off = the mild bark banks only
    if (s.bubbles !== undefined) this.ui?.setBubbles(s.bubbles);
    if (s.quality && s.quality !== this.quality) this.setQuality(s.quality);
    if (s.cameraShake !== undefined) this.chase.setShakeScale(typeof s.cameraShake === 'boolean' ? (s.cameraShake ? 1 : 0) : s.cameraShake);
    if (s.touch !== undefined) this.input.setTouchVisible(!!s.touch);
    if (s.speedClass !== undefined) this.settingsSpeedClass = resolveSpeedClass(s.speedClass);
  }

  setQuality(q) {
    this.quality = PIXEL_RATIO[q] ? q : 'high';
    this.resize();
    this.view?.setQuality(this.quality);
    this.decor?.setQuality(this.quality);
    this.cariDecor?.setQuality(this.quality);
    this.env?.setQuality?.(this.quality);
    this.post?.setQuality(this.quality);
    this.track?.setQuality?.(this.quality);
  }

  resize() {
    const w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight);
    const pr = Math.min(window.devicePixelRatio || 1, PIXEL_RATIO[this.quality]);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post?.setSize(w * pr, h * pr);
  }

  // ---- sessions ---------------------------------------------------------------------------------------------------------------

  /** Roster entries for a race: the human plus the other seven characters, each in a kart of their own. */
  buildEntries(charId, kartId, mode) {
    const nameOf = (c) => (c.customSlot ? Assets.text('custom_rival_name', c.name) || c.name : c.name);
    const me = getCharacter(charId);
    const player = { id: PLAYER_ID, name: nameOf(me), charId: me.id, kartId, isPlayer: true };
    if (mode === 'time') return [player];
    const rng = makeRng(0xC0FFEE);
    const others = CHARACTERS.filter((c) => c.id !== me.id).map((c, i) => ({ id: c.id, name: nameOf(c), charId: c.id, kartId: KARTS[(i + Math.floor(rng() * 3)) % KARTS.length].id, isPlayer: false }));
    return [player, ...others];
  }

  /** ui:start handler. */
  async startSession(d) {
    if (!d) return;
    const mode = d.mode ?? 'single';
    // speed class (Mbps): the start payload wins, then ?class= (tools), then the saved setting, then 100
    const speedClass = resolveSpeedClass(d.speedClass, resolveSpeedClass(speedClassFromQuery(), this.settingsSpeedClass));
    this.session = { mode, charId: d.charId ?? 'marco', kartId: d.kartId ?? 'cruiser', difficulty: d.difficulty ?? 'professional', trackId: d.trackId, laps: d.laps, speedClass };
    this.gp = null;
    if (mode === 'gp') {
      this.gp = new GrandPrix({ cupId: CUPS[0].id, entries: this.buildEntries(this.session.charId, this.session.kartId, 'gp'), difficulty: this.session.difficulty });
      await this.loadRace({ trackId: this.gp.trackId, entries: this.gp.grid() });
    } else {
      const entries = this.buildEntries(this.session.charId, this.session.kartId, mode);
      if (mode === 'single' && entries.length > 5) { const [p] = entries.splice(0, 1); entries.splice(5, 0, p); }   // start mid-back, not on pole
      await this.loadRace({ trackId: this.session.trackId ?? TRACKS[0].id, entries, laps: this.session.laps });
    }
  }

  /** Builds the world for one race and starts the intro fly-through. */
  async loadRace({ trackId, entries, laps }) {
    const token = ++this._loadToken;
    this.setPhase('loading');
    this.ui.hideAll();
    this.ui.showLoading(`Building ${getTrackInfo(trackId).name}…`, 0.3);
    await nextFrames(2);
    if (token !== this._loadToken) return;          // quit or restarted while the loading screen was up
    this.disposeRace();
    let track;
    try { track = createTrack(trackId); } catch (e) {
      console.warn('[game] could not build track', trackId, e);
      this.ui.hideAll(); this.setPhase('menu'); this.ui.showMenu(); return;
    }
    this.ui.showLoading('Lining up the grid…', 0.7);
    await nextFrames(1);
    if (token !== this._loadToken) { track.dispose?.(); return; }
    this.curRace = { trackId, entries, laps };
    this.track = track;
    this.scene = new THREE.Scene();
    this.scene.add(track.group);
    this.env = applyEnvironment(this.scene, this.renderer, track.environment, this.quality);
    try { this.decor = decorateTrack(this.scene, track, trackId, { quality: this.quality, mode: getPhotoProps() }); } catch (e) { console.warn('[game] photo decor skipped', e); this.decor = null; }
    try { this.cariDecor = decorateCaricature(this.scene, track, trackId, { quality: this.quality, mode: getCaricatureArt(), photoMode: getPhotoProps() }); } catch (e) { console.warn('[game] caricature art skipped', e); this.cariDecor = null; }
    this.race = new Race({ track, entries, laps, difficulty: this.session.difficulty, player: PLAYER_ID, seed: (Math.random() * 1e9) | 0, updateTrack: true, speedClass: this.session.speedClass });
    this.view = new RaceView({ scene: this.scene, camera: this.camera, race: this.race, track, quality: this.quality });
    try { this.kartArt = decorateKarts(this.view.karts, { mode: getCaricatureArt() }); } catch (e) { console.warn('[game] kart stickers skipped', e); this.kartArt = null; }   // caricature stickers on Marco's own kart
    this.post = createPostFX(this.renderer, this.scene, this.camera, this.quality);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.post.setSize(size.x, size.y);
    const me = this.race.player;
    this.dialogue.beginRace({ playerId: PLAYER_ID, playerChar: me.charId, total: this.race.racers.length, laps: this.race.laps, ids: this.race.racers.map((r) => r.id), speedClass: this.race.speedClass });
    this.chase.setSpeedClass(this.race.speedClass);
    this.chase.setTarget(me.kart);
    this.audio.setRacePlayer(me.kart, this.race.racers.map((r) => r.kart));
    bus.emit('music', { key: track.music ?? trackId });   // via the bus so the UI's menu-music bookkeeping sees it and restarts the menu tune afterwards
    this._acc = 0; this._finishTimer = 0; this._finishing = false; this.paused = false; this._victory = null;
    this.ui.hideAll();
    this.ui.showHud(false);          // the HUD appears when the fly-through ends; the intro only shows the track card
    this.setPhase('intro');
    this.ui.showBanner(getTrackInfo(trackId).name, 'info', { sub: `${this.race.laps} ${this.race.laps === 1 ? 'lap' : 'laps'}  ·  ${speedClassInfo(this.race.speedClass).name}`, ms: 3800 });
    this.hudFace.setChar(this.session.charId);
    showIntroCard(this.uiRoot.querySelector('.mk') ?? this.uiRoot, trackId);
    this.chase.startIntro(track, INTRO_SECONDS).then(() => { if (token === this._loadToken && this.phase === 'intro') this.beginCountdown(); });
  }

  beginCountdown() {
    if (this.phase !== 'intro') return;
    this.chase.finishIntro();
    this.ui.showHud(true);
    this.setPhase('racing');
    this.say('ready', 0);
  }

  setPhase(p) { this.phase = p; this.syncInput(); }

  /** Game keys and the touch overlay are live only while a race is on screen and not paused. */
  syncInput() {
    const on = (this.phase === 'intro' || this.phase === 'racing' || this.phase === 'finishing') && !this.paused;
    if (this.input.enabled !== on) this.input.setEnabled(on);
  }

  disposeRace() {
    this.decor?.dispose(); this.decor = null;
    this.cariDecor?.dispose(); this.cariDecor = null;
    this.kartArt?.dispose(); this.kartArt = null;
    this.view?.dispose(); this.env?.dispose(); this.post?.dispose(); this.race?.dispose(); this.track?.dispose();
    this.audio?.setRacePlayer(null);
    this.view = this.env = this.post = this.race = this.track = null;
    this._victory = null;
    this.ui?.showHud(false);
  }

  // ---- flow -------------------------------------------------------------------------------------------------------------------

  finishRace() {
    if (this.phase === 'results') return;
    this.setPhase('results');
    const results = this.race.results();
    const gp = this.session.mode === 'gp';
    this.ui.showHud(false);
    this.ui.showRaceResults(results, { gp, trackId: this.curRace.trackId, laps: this.race.laps, raceIndex: this.gp?.raceIndex ?? 0, total: this.gp?.total, speedClass: this.race.speedClass });
    this._lastResults = results;
  }

  onContinue() {
    if (this.phase === 'podium') { this.quitToMenu(); return; }
    if (this.phase === 'standings') {
      if (this.gp.done) {
        const fin = this.gp.finalResults();
        this.setPhase('podium'); this.ui.showPodium(fin);
        bus.emit('gp:done', { charId: this.session?.charId, trophy: fin?.trophy });      // the dialogue director answers a gold cup with Marco's cup-win line
      }
      else { this.gp.next(); this.loadRace({ trackId: this.gp.trackId, entries: this.gp.grid() }); }
      return;
    }
    if (this.phase !== 'results') return;
    if (this.gp) {
      this.gp.record(this._lastResults);
      this.setPhase('standings');
      this.ui.showGpStandings(this.gp.standings(), { raceIndex: this.gp.raceIndex, total: this.gp.total });
    } else this.quitToMenu();
  }

  restart() {
    if (!this.curRace) return;
    this.paused = false;
    this.loadRace(this.curRace);
  }

  quitToMenu() {
    this._loadToken++;
    this.paused = false;
    this.disposeRace();
    this.gp = null;
    this.setPhase('menu');
    this.ui.hideAll();
    this.ui.showMenu();
  }

  pause() {
    if (this.paused || (this.phase !== 'racing' && this.phase !== 'finishing' && this.phase !== 'intro')) return;
    this.paused = true;
    this.audio.cancelSpeech();
    this.ui.clearBubbles();
    this.syncInput();
    this.ui.showPause();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false; this._last = performance.now();
    this._edgeGuardUntil = this._last + 200;      // the Enter / Esc that closed the menu must not count as "use item" or "pause"
    this.syncInput();
  }

  // ---- events -----------------------------------------------------------------------------------------------------------------

  onCountdown({ n }) {
    this.ui.showCountdown(n);
    if (n === 0) this.say('go', 0);
  }

  onFinish(d) {
    if (!d?.isPlayer) return;
    this._victory = { pos: this.camera.position.clone(), look: null };
    this._finishing = true; this._finishTimer = 0;
    this.setPhase('finishing');
  }

  /**
   * Marco's voice line (the audio module plays the clip if it exists; the UI shows a caption otherwise).
   * The clips are 1 to 5 s long and each new one cuts the last, so a line is dropped while a more important one is still playing.
   * @param {string} key voice key without the `voice_` prefix
   * @param {number} cooldown minimum seconds between two lines of the same key
   */
  say(key, cooldown) {
    void cooldown;             // cooldowns and priorities live in the dialogue director now
    this.dialogue?.sayPlayer(key);
  }

  /**
   * Victory camera: swings round in front of the kart and looks back at the driver's face. The position is derived from the track
   * centre line ahead of the kart (so it stays inside the road corridor and clear of walls on every track, including the indoor one).
   * @param {number} dt seconds
   * @param {number} alpha fixed-step interpolation factor
   */
  updateVictoryCam(dt, alpha) {
    const v = this._victory, k = this.race.player.kart;
    const a = clamp01(alpha);
    _vl.set(k.prevPos ? k.prevPos.x + (k.pos.x - k.prevPos.x) * a : k.pos.x, k.prevPos ? k.prevPos.y + (k.pos.y - k.prevPos.y) * a : k.pos.y, k.prevPos ? k.prevPos.z + (k.pos.z - k.prevPos.z) * a : k.pos.z);
    const s = k.ground?.s ?? 0;
    const sm = this.track.sample(s + 11 + Math.min(8, Math.max(0, k.speed) * 0.25), this._vs ?? (this._vs = {}));
    const lateral = Math.sin(this._finishTimer * 0.7) * 2;                  // slow sway across the road
    _vp.set(sm.pos.x + sm.right.x * lateral, sm.pos.y + 3.1, sm.pos.z + sm.right.z * lateral);
    const k1 = 1 - Math.exp(-dt * 2.6);
    v.pos.lerp(_vp, k1);
    if (!v.look) v.look = _vl.clone(); else v.look.lerp(_vl, 1 - Math.exp(-dt * 8));
    this.camera.position.copy(v.pos);
    this.camera.lookAt(v.look.x, v.look.y + 0.9, v.look.z);
  }

  // ---- frame loop -------------------------------------------------------------------------------------------------------------

  frame(nowMs) {
    this._raf = requestAnimationFrame((t) => this.frame(t));
    const dt = clamp((nowMs - this._last) / 1000, 0, CFG.maxFrameDt);
    this._last = nowMs;
    const ta = this.input.touchActive;
    if (ta !== this._touchLayout) { this._touchLayout = ta; this.ui.setTouchLayout(ta); }
    const inp = this.input.read();
    if (nowMs < this._edgeGuardUntil) { inp.itemPressed = false; inp.swapPressed = false; inp.pausePressed = false; }
    const race = this.race;
    if (!race) { this.renderer.clear(); return; }

    const live = this.phase === 'racing' || this.phase === 'finishing';
    if (inp.pausePressed && (live || this.phase === 'intro') && !this.paused && !this.ui.isPauseOpen()) { bus.emit('ui:pause', {}); }
    if (this.phase === 'intro' && (inp.itemPressed || inp.throttle > 0.5)) this.beginCountdown();

    let alpha = 1;
    if (live && !this.paused) {
      this._acc += dt;
      let steps = 0, first = true;
      const player = race.player;
      const input = { throttle: inp.throttle, brake: inp.brake, steer: inp.steer, drift: inp.drift };
      const swapNow = inp.swapPressed || this._swapQueued; this._swapQueued = false;
      while (this._acc >= CFG.fixedDt && steps < MAX_STEPS) {
        race.step(CFG.fixedDt, input, { itemPressed: first && inp.itemPressed, aimBack: inp.brake > 0.4, swapPressed: first && swapNow });
        first = false; this._acc -= CFG.fixedDt; steps++;
      }
      if (steps === MAX_STEPS) this._acc = 0;
      if (steps === 0 && swapNow) this._swapQueued = true;       // no fixed step ran this frame: keep the swap for the next one
      this.dialogue.update(dt, race);
      alpha = this._acc / CFG.fixedDt;
      if (this._finishing) {
        this._finishTimer += dt;
        if ((race.state === 'finished' && this._finishTimer > FINISH_MIN) || this._finishTimer > FINISH_WAIT) this.finishRace();
      } else if (race.state === 'finished') this.finishRace();
      void player;
    }

    const kart = race.player.kart;
    if (!this.paused) {
      const speedFrac = clamp01(kart.speed / Math.max(1, kart.maxSpeed));
      this.chase.update(dt, { boosting: kart.boost.time > 0, drifting: kart.drift.active, lookBack: inp.lookBack && live, speedFrac, alpha });
      if (this._victory) this.updateVictoryCam(dt, alpha);
      this.ui.hud?.setInputDevice(this.input.lastDevice); this.ui.hud?.setLookBack(inp.lookBack && live);
      this.audio.update(dt, { camera: this.camera });
      if (this.phase === 'intro') { race.simTime += dt; this.track.update(dt, race.simTime); }   // Race steps the track itself once the countdown starts
    }
    this.track.setViewer?.(this.camera.position);
    this.env.update(dt, this.camera.position, kart.pos);
    this.view.update(this.paused ? 0 : dt, alpha);
    if (!this.paused) { this.decor?.update(nowMs / 1000); this.cariDecor?.update(nowMs / 1000); }
    this.post.setBoost(kart.boost.time > 0 ? clamp01(kart.boost.power * 0.6) : 0);
    this.post.setSpeedLines(clamp01((kart.speed / Math.max(1, kart.maxSpeed) - 0.85) * 5) * (kart.boost.time > 0 ? 1 : 0.35));
    this.post.render(dt);
    if (this.phase !== 'results' && this.phase !== 'loading') {
      this.ui.updateHud(race.getHud(), dt);
      if (!this.paused) this.ui.updateBubbles(this.camera, this._bubbleAnchor);      // after the render: the camera matrices are final for this frame
    }
  }

  /** Test/automation hook: bypass menus. */
  autostart(p = {}) {
    const d = { mode: p.mode ?? 'single', charId: p.char ?? 'marco', kartId: p.kart ?? 'cruiser', difficulty: p.diff ?? 'professional', trackId: p.track ?? 'copacabana', laps: p.laps ? +p.laps : undefined };
    if (p.class !== undefined) d.speedClass = resolveSpeedClass(p.class);
    bus.emit('ui:start', d);
  }
}
