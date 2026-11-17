// Audio 100 % sintetizado con Web Audio: disparos por capas con variación aleatoria en cada tiro,
// recargas, pasos por superficie, impactos, ambientes por mapa, música generativa y audio espacial.
import { store } from './Settings.js';

const R = (a, b) => a + Math.random() * (b - a);

class AudioEngine {
  constructor() { this.ctx = null; this.ready = false; this.ambTimers = []; this.ambNodes = []; this.musicOn = false; this._lp = { x: 0, y: 0, z: 0 }; }

  /** Debe llamarse desde un gesto del usuario. */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.18;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.music = c.createGain(); this.amb = c.createGain(); this.ui = c.createGain();
    for (const g of [this.sfx, this.music, this.amb, this.ui]) g.connect(this.master);
    this.reverb = c.createConvolver(); this.revGain = c.createGain(); this.revGain.gain.value = 0.35;
    this.reverb.connect(this.revGain); this.revGain.connect(this.sfx);
    this.setReverb(1.4);
    // ruido blanco y marrón compartidos
    const len = c.sampleRate * 2;
    this.white = c.createBuffer(1, len, c.sampleRate); this.brown = c.createBuffer(1, len, c.sampleRate);
    const w = this.white.getChannelData(0), b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { w[i] = Math.random() * 2 - 1; last = (last + 0.02 * w[i]) / 1.02; b[i] = last * 3.5; }
    this.ready = true;
    this.applyVolumes();
    store.onChange((k) => { if (['master', 'sfx', 'music', 'ambience'].includes(k)) this.applyVolumes(); });
  }
  applyVolumes() {
    if (!this.ready) return;
    const s = store.settings, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master, t, 0.03); this.sfx.gain.setTargetAtTime(s.sfx, t, 0.03);
    this.music.gain.setTargetAtTime(s.music * 0.6, t, 0.03); this.amb.gain.setTargetAtTime(s.ambience * 0.7, t, 0.03);
    this.ui.gain.setTargetAtTime(s.sfx * 0.7, t, 0.03);
  }
  setReverb(seconds) {
    if (!this.ctx) return;
    const c = this.ctx, len = Math.floor(c.sampleRate * seconds), buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (i < 400 ? i / 400 : 1);
    }
    this.reverb.buffer = buf;
  }

  setListener(x, y, z, fx, fy, fz) {
    if (!this.ready) return;
    const l = this.ctx.listener; this._lp.x = x; this._lp.y = y; this._lp.z = z;
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(x, t); l.positionY.setValueAtTime(y, t); l.positionZ.setValueAtTime(z, t);
      l.forwardX.setValueAtTime(fx, t); l.forwardY.setValueAtTime(fy, t); l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else { l.setPosition(x, y, z); l.setOrientation(fx, fy, fz, 0, 1, 0); }
  }

  /** Nodo de salida: espacial si hay posición; devuelve {node, dist}. */
  _out(pos, ref = 2, bus = this.sfx, wet = 0.2) {
    const c = this.ctx, g = c.createGain();
    let dist = 0;
    if (pos) {
      const p = c.createPanner();
      p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.maxDistance = 400; p.rolloffFactor = 1.1;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      dist = Math.hypot(pos.x - this._lp.x, pos.y - this._lp.y, pos.z - this._lp.z);
      // absorción del aire: los sonidos lejanos pierden agudos
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(700, 18000 - dist * 150);
      g.connect(lp); lp.connect(p); p.connect(bus);
      if (wet > 0) { const s = c.createGain(); s.gain.value = wet * Math.min(1, 0.4 + dist / 40); p.connect(s); s.connect(this.reverb); }
    } else {
      g.connect(bus);
      if (wet > 0) { const s = c.createGain(); s.gain.value = wet; g.connect(s); s.connect(this.reverb); }
    }
    return g;
  }
  _noise(dest, t, dur, gain, type, freq, q = 0.8, buf = this.white, freqEnd = 0, attack = 0.001) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  _tone(dest, t, dur, gain, type, f0, f1 = 0, attack = 0.001) {
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  /** Disparo. s = perfil de sonido del arma; pos = null para el propio jugador. */
  gunshot(s, pos = null, vol = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, p = s.pitch * R(0.96, 1.04), v = vol * R(0.92, 1.05);
    const out = this._out(pos, 6, this.sfx, 0.3 + s.tail * 0.25);
    out.gain.value = pos ? 1.25 : 0.85;
    const k = s.kind;
    if (k === 'pulse') {
      this._tone(out, t, 0.16, 0.34 * v, 'sawtooth', 2100 * p, 260 * p);
      this._tone(out, t, 0.2, 0.3 * v, 'square', 900 * p, 110 * p);
      this._noise(out, t, 0.09, 0.3 * v, 'bandpass', 3200, 1.2);
      this._tone(out, t, 0.14, 0.4 * v, 'sine', 180, 60);
      return;
    }
    if (k === 'rail') {
      this._tone(out, t, 0.5, 0.3 * v, 'sawtooth', 3600, 90);
      this._noise(out, t, 0.06, 0.9 * v, 'highpass', 2500);
      this._tone(out, t, 0.6, 0.9 * v, 'sine', 120, 28);
      this._noise(out, t + 0.02, 1.3, 0.35 * v, 'lowpass', 900, 0.7, this.white, 150);
      this._tone(out, t, 0.9, 0.12 * v, 'sine', 5200, 1800);
      return;
    }
    const body = s.body, cr = s.crack;
    // 1) chasquido supersónico  2) cuerpo  3) golpe grave  4) cola
    this._noise(out, t, 0.035 + 0.02 * body, 0.9 * cr * v, 'highpass', 1800 * p, 0.7);
    this._noise(out, t, 0.11 + 0.1 * body, 0.85 * v, 'lowpass', (k === 'shotgun' ? 1500 : 2600) * p, 0.9, this.white, 420 * p);
    this._tone(out, t, 0.09 + 0.07 * body, (0.55 + 0.35 * body) * v, 'triangle', (k === 'smg' || k === 'pistol' ? 210 : 150) * p, 48 * p);
    this._noise(out, t + 0.015, 0.3 + s.tail * 0.9, 0.26 * (0.5 + s.tail) * v, 'lowpass', 750 * p, 0.6, this.brown, 160);
    if (k === 'sniper' || k === 'shotgun') this._tone(out, t, 0.28, 0.5 * v, 'sine', 90 * p, 30);
    if (k === 'lmg' || k === 'rifle') this._noise(out, t, 0.05, 0.25 * v, 'bandpass', 900 * p, 3);   // resonancia mecánica
  }
  ping(pos = null) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.03, out = this._out(pos, 2, this.sfx, 0.3);
    for (const [f, g] of [[2380, 0.22], [3160, 0.12], [4720, 0.06], [6200, 0.03]]) this._tone(out, t, 0.75, g, 'sine', f * R(0.995, 1.005));
  }
  /** Sonidos mecánicos de manipulación del arma. */
  mech(type, pos = null) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, out = this._out(pos, 1.2, this.sfx, 0.08), p = R(0.94, 1.06);
    const click = (dt, f, g, d = 0.03) => { this._noise(out, t + dt, d, g, 'bandpass', f * p, 4); this._tone(out, t + dt, d * 0.8, g * 0.4, 'square', f * 0.31 * p); };
    switch (type) {
      case 'magOut': click(0, 1400, 0.4); this._noise(out, t + 0.03, 0.09, 0.14, 'lowpass', 900); break;
      case 'magIn': this._noise(out, t, 0.07, 0.14, 'lowpass', 1100); click(0.06, 900, 0.55, 0.045); this._tone(out, t + 0.06, 0.06, 0.25, 'sine', 140, 70); break;
      case 'bolt': click(0, 1900, 0.4); this._noise(out, t + 0.03, 0.12, 0.2, 'bandpass', 2600, 2); click(0.16, 1300, 0.5, 0.04); break;
      case 'boltUp': click(0, 2100, 0.35); this._noise(out, t + 0.02, 0.1, 0.18, 'bandpass', 2400, 2); break;
      case 'boltDown': this._noise(out, t, 0.1, 0.18, 'bandpass', 2700, 2); click(0.09, 1250, 0.5, 0.04); break;
      case 'pump': this._noise(out, t, 0.09, 0.3, 'bandpass', 1500, 1.5); click(0.08, 800, 0.5, 0.05); this._noise(out, t + 0.2, 0.09, 0.3, 'bandpass', 1900, 1.5); click(0.28, 1000, 0.55, 0.05); break;
      case 'shell': click(0, 1100, 0.32, 0.035); this._noise(out, t + 0.02, 0.06, 0.12, 'lowpass', 1400); break;
      case 'clipIn': this._noise(out, t, 0.08, 0.18, 'bandpass', 1700, 2); click(0.07, 950, 0.6, 0.05); click(0.2, 1500, 0.4); break;
      case 'cellOut': this._tone(out, t, 0.25, 0.14, 'sine', 900, 220); click(0, 1600, 0.3); break;
      case 'cellIn': click(0, 1200, 0.45, 0.04); this._tone(out, t + 0.05, 0.4, 0.14, 'sine', 240, 1300); this._tone(out, t + 0.42, 0.08, 0.1, 'sine', 1760); break;
      case 'belt': this._noise(out, t, 0.25, 0.2, 'bandpass', 3200, 3); click(0.1, 1700, 0.3); click(0.22, 2100, 0.3); break;
      case 'cover': click(0, 700, 0.5, 0.06); this._tone(out, t, 0.08, 0.2, 'sine', 180, 80); break;
      case 'dry': click(0, 2400, 0.35, 0.02); break;
      case 'equip': this._noise(out, t, 0.16, 0.16, 'bandpass', 1300, 0.8, this.white, 500, 0.04); click(0.12, 1600, 0.2); break;
      case 'ads': this._noise(out, t, 0.08, 0.05, 'bandpass', 900, 0.8, this.white, 0, 0.02); break;
      case 'shellLand': this._tone(out, t, 0.05, 0.1, 'sine', R(3800, 5200)); this._tone(out, t + 0.07, 0.04, 0.05, 'sine', R(4200, 5600)); break;
      default: click(0, 1500, 0.3);
    }
  }
  footstep(surf = 'concrete', pos = null, run = false, vol = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, out = this._out(pos, 1.6, this.sfx, 0.12), v = vol * (run ? 0.5 : 0.3) * R(0.8, 1.1), p = R(0.85, 1.15);
    if (surf === 'metal') { this._noise(out, t, 0.07, v, 'bandpass', 1100 * p, 1.2); this._tone(out, t, 0.14, v * 0.45, 'sine', R(380, 520)); this._tone(out, t, 0.1, v * 0.3, 'sine', R(820, 1100)); }
    else if (surf === 'wood') { this._noise(out, t, 0.06, v * 0.8, 'lowpass', 900 * p); this._tone(out, t, 0.09, v * 0.9, 'sine', 170 * p, 80); }
    else if (surf === 'dirt') { this._noise(out, t, 0.13, v * 0.9, 'lowpass', 650 * p, 0.6, this.brown, 0, 0.012); this._noise(out, t + 0.02, 0.08, v * 0.35, 'bandpass', 2600 * p, 0.8); }
    else { this._noise(out, t, 0.055, v, 'bandpass', 780 * p, 0.9); this._noise(out, t + 0.012, 0.04, v * 0.45, 'highpass', 2600); this._tone(out, t, 0.05, v * 0.5, 'sine', 120, 60); }
  }
  land(surf, pos = null, k = 1) { if (!this.ready) return; const t = this.ctx.currentTime, out = this._out(pos, 1.6, this.sfx, 0.12); this._tone(out, t, 0.14, 0.5 * k, 'sine', 110, 40); this._noise(out, t, 0.12, 0.3 * k, 'lowpass', 700); this.footstep(surf, pos, true, 1.2); }
  jump() { if (!this.ready) return; const t = this.ctx.currentTime; this._noise(this._out(null, 1, this.sfx, 0), t, 0.1, 0.08, 'bandpass', 600, 0.7, this.white, 0, 0.03); }
  impact(surf, pos) {
    if (!this.ready) return;
    const d = Math.hypot(pos.x - this._lp.x, pos.y - this._lp.y, pos.z - this._lp.z);
    if (d > 45) return;
    const t = this.ctx.currentTime, out = this._out(pos, 1.5, this.sfx, 0.1), p = R(0.85, 1.2);
    if (surf === 'metal') { this._tone(out, t, 0.22, 0.2, 'sine', R(1800, 3600), R(700, 1200)); this._noise(out, t, 0.04, 0.4, 'highpass', 3000); }
    else if (surf === 'wood') { this._noise(out, t, 0.06, 0.4, 'lowpass', 1200 * p); this._tone(out, t, 0.06, 0.3, 'sine', 240 * p, 100); }
    else if (surf === 'dirt') this._noise(out, t, 0.12, 0.4, 'lowpass', 800 * p, 0.6, this.brown);
    else if (surf === 'glass') { for (let i = 0; i < 4; i++) this._tone(out, t + i * 0.015, 0.12, 0.1, 'sine', R(2800, 6400)); this._noise(out, t, 0.08, 0.25, 'highpass', 4000); }
    else { this._noise(out, t, 0.07, 0.45, 'bandpass', 1500 * p, 0.8); this._noise(out, t, 0.03, 0.2, 'highpass', 4000); }
  }
  whiz(pos) { if (!this.ready) return; const t = this.ctx.currentTime, out = this._out(pos, 1.5, this.sfx, 0.05); this._noise(out, t, 0.16, 0.5, 'bandpass', R(2400, 3600), 6, this.white, R(700, 1100), 0.02); }
  bodyHit(pos = null) { if (!this.ready) return; const t = this.ctx.currentTime, out = this._out(pos, 1.5, this.sfx, 0.05); this._noise(out, t, 0.07, 0.5, 'lowpass', 700); this._tone(out, t, 0.08, 0.35, 'sine', 150, 60); }
  /** Sonidos de interfaz/feedback (no espaciales). */
  uiSound(type) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.ui;
    switch (type) {
      case 'hover': this._tone(o, t, 0.04, 0.05, 'sine', 1900); break;
      case 'click': this._tone(o, t, 0.06, 0.14, 'triangle', 620, 420); this._noise(o, t, 0.02, 0.08, 'highpass', 3000); break;
      case 'back': this._tone(o, t, 0.08, 0.12, 'triangle', 420, 260); break;
      case 'hit': this._noise(o, t, 0.022, 0.32, 'bandpass', 2300, 3); this._tone(o, t, 0.03, 0.12, 'square', 1250); break;
      case 'headshot': this._tone(o, t, 0.2, 0.22, 'sine', 2640); this._tone(o, t, 0.25, 0.1, 'sine', 3960); this._noise(o, t, 0.03, 0.3, 'bandpass', 2600, 3); break;
      case 'kill': this._tone(o, t, 0.09, 0.2, 'triangle', 880); this._tone(o, t + 0.08, 0.16, 0.2, 'triangle', 1320); break;
      case 'hurt': this._tone(o, t, 0.12, 0.3, 'sine', 180, 70); this._noise(o, t, 0.08, 0.3, 'lowpass', 500); break;
      case 'death': this._tone(o, t, 0.7, 0.3, 'sawtooth', 220, 40); this._noise(o, t, 0.5, 0.2, 'lowpass', 400); break;
      case 'capture': for (const [i, f] of [392, 523, 659].entries()) this._tone(o, t + i * 0.09, 0.22, 0.16, 'triangle', f); break;
      case 'lost': for (const [i, f] of [523, 415, 330].entries()) this._tone(o, t + i * 0.11, 0.24, 0.14, 'triangle', f); break;
      case 'countdown': this._tone(o, t, 0.1, 0.16, 'square', 660); break;
      case 'go': this._tone(o, t, 0.4, 0.2, 'square', 990); break;
      case 'win': for (const [i, f] of [392, 494, 587, 784].entries()) this._tone(o, t + i * 0.14, 0.5, 0.18, 'triangle', f); break;
      case 'lose': for (const [i, f] of [392, 349, 311, 262].entries()) this._tone(o, t + i * 0.18, 0.6, 0.16, 'triangle', f); break;
      case 'spawn': this._tone(o, t, 0.25, 0.1, 'sine', 300, 900); break;
      default: break;
    }
  }

  // ---------------- Ambientes ----------------
  stopAmbience() {
    this.ambTimers.forEach(clearTimeout); this.ambTimers = [];
    for (const n of this.ambNodes) { try { n.stop(); } catch { /* ya detenido */ } }
    this.ambNodes = [];
  }
  _loop(buf, type, freq, q, gain, lfoHz = 0, lfoAmt = 0) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(this.amb);
    if (lfoHz) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = lfoHz; lg.gain.value = lfoAmt; l.connect(lg); lg.connect(g.gain); l.start(); this.ambNodes.push(l); }
    s.start(0, Math.random()); this.ambNodes.push(s);
  }
  _hum(freq, gain, type = 'sine') {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = freq; g.gain.value = gain;
    o.connect(g); g.connect(this.amb); o.start(); this.ambNodes.push(o);
  }
  _every(min, max, fn) {
    const tick = () => { if (this.ctx.state === 'running') fn(this.ctx.currentTime); this.ambTimers[i] = setTimeout(tick, R(min, max) * 1000); };
    const i = this.ambTimers.length; this.ambTimers.push(setTimeout(tick, R(min, max) * 1000));
  }
  startAmbience(kind, reverb = 1.4) {
    if (!this.ready) return;
    this.stopAmbience(); this.setReverb(reverb);
    const far = () => { const g = this.ctx.createGain(); g.gain.value = 0.5; g.connect(this.amb); const s = this.ctx.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(this.reverb); return g; };
    if (kind === 'city') {
      this._loop(this.brown, 'lowpass', 220, 0.5, 0.55, 0.07, 0.15); this._loop(this.white, 'bandpass', 900, 0.4, 0.035, 0.11, 0.015);
      this._every(9, 22, (t) => { const o = far(), f = R(520, 700); for (let i = 0; i < 4; i++) { this._tone(o, t + i * 0.9, 0.9, 0.035, 'sine', f, f * 1.35); } });        // sirena lejana
      this._every(6, 16, (t) => { const o = far(); for (let i = 0; i < 3 + Math.random() * 5; i++) this._noise(o, t + i * R(0.09, 0.14), 0.12, 0.09, 'lowpass', 900, 0.7, this.brown); }); // tiroteo lejano
      this._every(14, 30, (t) => this._noise(far(), t, 2.5, 0.16, 'lowpass', 140, 0.7, this.brown, 60, 0.4));                                                         // estruendo
    } else if (kind === 'battlefield') {
      this._loop(this.white, 'bandpass', 420, 0.5, 0.09, 0.09, 0.05); this._loop(this.brown, 'lowpass', 160, 0.5, 0.4, 0.05, 0.12);
      this._every(4, 11, (t) => { const o = far(); this._tone(o, t, 1.4, 0.3, 'sine', 62, 26); this._noise(o, t, 2.2, 0.26, 'lowpass', 260, 0.7, this.brown, 70); });   // artillería
      this._every(3, 9, (t) => { const o = far(), n = 2 + Math.random() * 9, iv = R(0.07, 0.11); for (let i = 0; i < n; i++) this._noise(o, t + i * iv, 0.1, 0.07, 'bandpass', R(500, 900), 1, this.white); });
      this._every(10, 24, (t) => this._tone(far(), t, 1.6, 0.03, 'sine', 1900, 700));                                                                                 // proyectil silbando
    } else if (kind === 'station') {
      this._hum(55, 0.11); this._hum(110.6, 0.045); this._hum(165, 0.016, 'triangle');
      this._loop(this.white, 'bandpass', 1900, 0.6, 0.02, 0.13, 0.008); this._loop(this.brown, 'lowpass', 300, 0.5, 0.22, 0.2, 0.06);
      this._every(5, 14, (t) => { const f = [880, 1175, 1320, 1760][(Math.random() * 4) | 0]; const o = far(); this._tone(o, t, 0.08, 0.04, 'sine', f); if (Math.random() < 0.5) this._tone(o, t + 0.14, 0.08, 0.04, 'sine', f * 1.25); });
      this._every(9, 20, (t) => this._noise(far(), t, 1.2, 0.07, 'bandpass', 3200, 1, this.white, 900, 0.1));                                                         // vapor
    } else {
      this._loop(this.white, 'bandpass', 520, 0.5, 0.06, 0.08, 0.035); this._loop(this.brown, 'lowpass', 200, 0.5, 0.18, 0.06, 0.06);
      this._every(2, 7, (t) => { const o = far(), f = R(2600, 4200); for (let i = 0; i < 2 + Math.random() * 4; i++) this._tone(o, t + i * R(0.09, 0.16), 0.07, 0.03, 'sine', f * R(0.9, 1.15), f * R(1.1, 1.4)); }); // pájaros
    }
  }

  // ---------------- Música generativa del menú ----------------
  startMusic() {
    if (!this.ready || this.musicOn) return;
    this.musicOn = true;
    const c = this.ctx, bpm = 76, beat = 60 / bpm;
    const bus = c.createGain(); bus.gain.value = 0; bus.gain.linearRampToValueAtTime(1, c.currentTime + 3); bus.connect(this.music);
    const wet = c.createGain(); wet.gain.value = 0.5; bus.connect(wet); wet.connect(this.reverb);
    this._musicBus = bus;
    const chords = [[38, 45, 53, 57], [34, 46, 53, 58], [36, 43, 52, 55], [33, 45, 52, 57]]; // Dm · Bb · C · Am(add)
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    let next = c.currentTime + 0.1, bar = 0;
    const pad = (t, notes, dur) => {
      for (const n of notes) for (const det of [-6, 5]) {
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det;
        f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(950, t + dur * 0.5); f.frequency.linearRampToValueAtTime(300, t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.1);
      }
    };
    const drum = (t, g = 0.5) => { this._tone(bus, t, 0.5, g, 'sine', 95, 38); this._noise(bus, t, 0.2, g * 0.3, 'lowpass', 300, 0.7, this.brown); };
    const tick = (t, g) => this._noise(bus, t, 0.03, g, 'highpass', 6000);
    const sched = () => {
      if (!this.musicOn) return;
      while (next < c.currentTime + 1.2) {
        const ch = chords[bar % 4], len = beat * 4;
        pad(next, ch, len * 1.08);
        this._tone(bus, next, len * 0.9, 0.12, 'sine', hz(ch[0] - 12));
        drum(next, 0.5); drum(next + beat * 2.5, 0.3);
        if (bar % 2 === 1) { drum(next + beat * 3.5, 0.24); drum(next + beat * 3.75, 0.3); }
        for (let i = 0; i < 8; i++) tick(next + i * beat * 0.5, i % 2 ? 0.012 : 0.022);
        if (bar % 4 === 2 || bar % 8 === 7) { // motivo melódico
          const mel = [ch[3] + 12, ch[2] + 12, ch[3] + 14, ch[2] + 12];
          mel.forEach((n, i) => this._tone(bus, next + beat * (i * 0.75 + 0.5), 0.9, 0.05, 'triangle', hz(n)));
        }
        next += len; bar++;
      }
      this._musicTimer = setTimeout(sched, 300);
    };
    sched();
  }
  stopMusic() {
    if (!this.musicOn) return;
    this.musicOn = false; clearTimeout(this._musicTimer);
    const b = this._musicBus, t = this.ctx.currentTime;
    b.gain.cancelScheduledValues(t); b.gain.setValueAtTime(b.gain.value, t); b.gain.linearRampToValueAtTime(0, t + 1.2);
    setTimeout(() => { try { b.disconnect(); } catch { /* ok */ } }, 2500);
  }
}

export const audio = new AudioEngine();
