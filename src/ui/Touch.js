// Controles táctiles (celulares y tabletas): joystick analógico a la izquierda, arrastre para mirar
// a la derecha y botones de acción. Escriben en el mismo estado de Input que el teclado y el ratón.
import { store } from '../core/Settings.js';

const LOOK = 2.4;          // píxeles de pantalla → «píxeles de ratón»
const STICK_R = 56;

/** ¿Hay que usar controles táctiles en este dispositivo? */
export function wantsTouch() {
  const m = store.settings.touch;
  if (m === 'on' || window.__TC_FORCE_TOUCH) return true;
  if (m === 'off') return false;
  return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);
}

export class TouchControls {
  constructor(parent, input) {
    this.input = input;
    this.onPause = null;
    const root = (this.root = document.createElement('div'));
    root.className = 'touch hidden';
    root.innerHTML = `
      <div class="t-look"></div>
      <div class="t-stick-zone"><div class="t-stick"><i></i></div></div>
      <button class="t-btn t-pause" data-a="pause">❚❚</button>
      <button class="t-btn t-board" data-k="scoreboard">☰</button>
      <div class="t-actions">
        <button class="t-btn t-fire" data-a="fire">FUEGO</button>
        <button class="t-btn t-ads" data-a="ads">MIRA</button>
        <button class="t-btn t-jump" data-k="jump">SALTO</button>
        <button class="t-btn t-crouch" data-k="crouch">AGACH.</button>
        <button class="t-btn t-reload" data-k="reload">RECARGA</button>
        <button class="t-btn t-swap" data-k="swap">ARMA</button>
        <button class="t-btn t-frag" data-k="lethal">GRANADA</button>
        <button class="t-btn t-tac" data-k="tactical">TÁCTICA</button>
        <button class="t-btn t-knife" data-k="melee">CUCHILLO</button>
        <button class="t-btn t-lean-l" data-k="leanLeft">◀</button>
        <button class="t-btn t-lean-r" data-k="leanRight">▶</button>
        <button class="t-btn t-interact" data-k="interact">ARMERO</button>
      </div>`;
    parent.appendChild(root);
    this.stick = root.querySelector('.t-stick'); this.knob = this.stick.querySelector('i');
    this.zone = root.querySelector('.t-stick-zone');
    this.look = root.querySelector('.t-look');
    this.ptrs = new Map();       // pointerId -> {kind, x, y, ox, oy, code}
    this.ads = false;
    const opts = { passive: false };
    root.addEventListener('pointerdown', (e) => this._down(e), opts);
    root.addEventListener('pointermove', (e) => this._move(e), opts);
    root.addEventListener('pointerup', (e) => this._up(e), opts);
    root.addEventListener('pointercancel', (e) => this._up(e), opts);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  show(on) { this.root.classList.toggle('hidden', !on); if (!on) this.reset(); }
  reset() {
    for (const p of this.ptrs.values()) if (p.code) this.input.release(p.code);
    this.ptrs.clear(); this.input.move = null; this.input.mouse.left = false; this.ads = false; this.input.mouse.right = false;
    this.stick.classList.remove('on'); this.root.querySelectorAll('.t-btn.on').forEach((b) => b.classList.remove('on'));
  }

  _down(e) {
    e.preventDefault();
    const t = e.target.closest('.t-btn, .t-stick-zone, .t-look');
    if (!t) return;
    try { t.setPointerCapture?.(e.pointerId); } catch { /* puntero ya liberado */ }
    const p = { kind: 'look', x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY, code: null, el: t };
    if (t.classList.contains('t-stick-zone')) {
      p.kind = 'stick';
      this.stick.style.left = `${e.clientX}px`; this.stick.style.top = `${e.clientY}px`; this.stick.classList.add('on');
      this.input.move = { x: 0, z: 0, sprint: false };
    } else if (t.dataset.a === 'fire') {
      p.kind = 'fire'; this.input.mouse.left = true; this.input.mouse.leftPressed = true; t.classList.add('on');
    } else if (t.dataset.a === 'ads') {
      p.kind = 'btn'; this.ads = !this.ads;
      // con «mantener» el botón actúa como interruptor; con «alternar» se simula un clic
      if (store.settings.adsMode === 'toggle') this.input.mouse.rightPressed = true; else this.input.mouse.right = this.ads;
      t.classList.toggle('on', this.ads);
    } else if (t.dataset.a === 'pause') { p.kind = 'btn'; this.onPause?.(); }
    else if (t.dataset.k) {
      p.kind = 'btn'; p.code = store.settings.keys[t.dataset.k];
      if (p.code) this.input.press(p.code);
      t.classList.add('on');
    }
    this.ptrs.set(e.pointerId, p);
  }
  _move(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.kind === 'stick') {
      let dx = e.clientX - p.ox, dy = e.clientY - p.oy;
      const d = Math.hypot(dx, dy), k = d > STICK_R ? STICK_R / d : 1;
      dx *= k; dy *= k;
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const mx = dx / STICK_R, mz = dy / STICK_R;
      this.input.move = { x: Math.abs(mx) < 0.12 ? 0 : mx, z: Math.abs(mz) < 0.12 ? 0 : mz, sprint: mz < -0.92 && Math.abs(mx) < 0.45 };
      this.stick.classList.toggle('sprint', this.input.move.sprint);
    } else if (p.kind === 'look' || p.kind === 'fire') {
      // se puede mirar arrastrando sobre la zona libre o sobre el botón de disparo
      this.input.mouse.dx += (e.clientX - p.x) * LOOK; this.input.mouse.dy += (e.clientY - p.y) * LOOK;
    }
    p.x = e.clientX; p.y = e.clientY;
  }
  _up(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    if (p.kind === 'stick') { this.input.move = null; this.stick.classList.remove('on', 'sprint'); this.knob.style.transform = ''; }
    else if (p.kind === 'fire') { this.input.mouse.left = false; p.el.classList.remove('on'); }
    else if (p.code) { this.input.release(p.code); p.el.classList.remove('on'); }
  }
}
