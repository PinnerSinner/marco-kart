// Live 3D turntable for character / kart select. Owns a SEPARATE small WebGL renderer + canvas so it never touches the game renderer.
// Degrades to nothing (the screen keeps its 2D artwork) when WebGL is unavailable.
import * as THREE from 'three';
import { createDriverKart } from '../visuals/factory.js';
import { getCharacter } from '../core/roster.js';

const soft = (size = 128) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(0,0,0,.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

export class Turntable {
  constructor() {
    this.host = null;
    this.canvas = null;
    this.renderer = null;
    this.failed = false;
    this.running = false;
    this.cache = new Map();
    this.current = null;
    this.yaw = -0.6;
    this.spin = 0.7;
    this.drag = null;
    this.pop = 1;
    this._raf = 0;
    this._last = 0;
    this._loop = this._loop.bind(this);
    this._onResize = this._onResize.bind(this);
  }

  _init() {
    if (this.renderer || this.failed) return;
    try {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'tt-canvas';
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
    } catch (e) {
      console.warn('[ui] turntable disabled (no WebGL):', e?.message ?? e);
      this.failed = true; this.renderer = null; this.canvas = null;
      return;
    }
    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x5a4636, 1.25));
    const key = new THREE.DirectionalLight(0xfff0d2, 3.0); key.position.set(4, 7, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0x5fd6ff, 2.2); rim.position.set(-6, 3, -5); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xff9ad8, 0.8); fill.position.set(-5, 2, 4); scene.add(fill);
    // platform: dark disc, two glowing rings and a soft contact shadow
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.85, 0.2, 56), new THREE.MeshStandardMaterial({ color: 0x14305f, roughness: 0.55, metalness: 0.2 }));
    disc.position.y = -0.1;
    this.ringMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 1.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.055, 10, 72), this.ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.01;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.03, 8, 72), new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.6 })); ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.01;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: soft(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012;
    this.pivot = new THREE.Group();
    scene.add(disc, ring, ring2, shadow, this.pivot);
    // drag to spin
    this.canvas.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, v: 0 }; this.canvas.setPointerCapture?.(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => { if (!this.drag) return; const dx = e.clientX - this.drag.x; this.drag.x = e.clientX; this.yaw += dx * 0.012; this.drag.v = dx * 0.012; });
    const end = () => { if (this.drag) { this.spin = Math.max(-2, Math.min(2, (this.drag.v || 0) * 30)) || 0.7; this.drag = null; } };
    this.canvas.addEventListener('pointerup', end); this.canvas.addEventListener('pointercancel', end);
  }

  /**
   * Attach the canvas inside `host` and size it. Safe to call again with a different host.
   * @param {HTMLElement} host
   * @returns {boolean} false when WebGL is unavailable
   */
  mount(host) {
    this._init();
    if (this.failed) return false;
    if (this._ro) this._ro.disconnect();
    this.host = host;
    host.append(this.canvas);
    if (typeof ResizeObserver !== 'undefined') { this._ro = new ResizeObserver(this._onResize); this._ro.observe(host); }
    this._onResize();
    return true;
  }

  _onResize() {
    if (!this.renderer || !this.host) return;
    const w = Math.max(2, this.host.clientWidth); const h = Math.max(2, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this._frame();
    this.render();
  }

  /** Point the camera so the current model fills the view. */
  _frame() {
    if (!this.camera) return;
    const size = this.current?.size ?? new THREE.Vector3(2, 1.6, 3.2);
    const radius = Math.max(size.x, size.z * 0.62, size.y * 1.1) * 0.5;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const dist = Math.max(radius / Math.tan(vfov / 2), radius / Math.tan(hfov / 2)) * 1.75 + 1.2;
    this.camera.position.set(dist * 0.42, dist * 0.30 + size.y * 0.5, dist * 0.86);
    this.camera.lookAt(0, size.y * 0.42, 0);
  }

  /**
   * Show a character in a kart.
   * @param {string} charId
   * @param {string} kartId
   */
  setModel(charId, kartId) {
    if (!this.renderer) return;
    const key = `${charId}|${kartId}`;
    if (this.current?.key === key) return;
    if (this.current) this.pivot.remove(this.current.dk.group);
    let entry = this.cache.get(key);
    if (!entry) {
      const dk = createDriverKart(charId, kartId);
      try { dk.driver?.userData?.setPose?.('drive'); dk.driver?.userData?.setExpression?.('happy'); } catch { /* optional API */ }
      const box = new THREE.Box3().setFromObject(dk.group);
      entry = { key, dk, size: box.getSize(new THREE.Vector3()) };
      this.cache.set(key, entry);
    }
    this.current = entry;
    this.pivot.add(entry.dk.group);
    this.pop = 0;
    this.ringMat.color.setHex(getCharacter(charId).colour); this.ringMat.emissive.setHex(getCharacter(charId).colour);
    this._frame();
    this.render();
  }

  /** Start animating (spin + wheels). */
  start() {
    if (this.running || !this.renderer) return;
    this.running = true;
    this._last = 0;
    this._raf = requestAnimationFrame(this._loop);
  }

  /** Stop animating (keeps GPU resources). */
  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  _loop(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._loop);
    const dt = this._last ? Math.min(0.05, (now - this._last) / 1000) : 0.016;
    this._last = now;
    if (document.hidden || !this.current) return;
    if (!this.drag) this.yaw += this.spin * dt;
    this.spin += (0.7 - this.spin) * Math.min(1, dt * 0.8);
    if (this.pop < 1) this.pop = Math.min(1, this.pop + dt / 0.45);
    for (const w of this.current.dk.wheels ?? []) w.rotation.x -= dt * 4;
    try { this.current.dk.driver?.userData?.lookSteer?.(Math.sin(now / 900) * 0.6, dt); } catch { /* optional API */ }
    this.render();
  }

  /** Draw one frame. */
  render() {
    if (!this.renderer || !this.current) return;
    const p = this.pop;
    const s = p >= 1 ? 1 : 1 + Math.sin(p * Math.PI) * 0.14 - (1 - p) * (1 - p) * 0.9;
    this.pivot.scale.setScalar(Math.max(0.05, s));
    this.pivot.rotation.y = this.yaw;
    this.renderer.render(this.scene, this.camera);
  }

  /** Free the GPU context. Call when leaving the select screens (a racing game should not hold a spare context). */
  dispose() {
    this.stop();
    if (this._ro) this._ro.disconnect();
    this._ro = null;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
    }
    this.canvas?.remove();
    this.cache.clear();
    this.renderer = null; this.canvas = null; this.current = null; this.host = null; this.failed = false;
  }
}
