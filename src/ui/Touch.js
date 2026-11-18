// Controles táctiles (celulares y tabletas): joystick analógico a la izquierda, arrastre para mirar
// a la derecha y pocos botones grandes. Escriben en el mismo estado de Input que el teclado y el ratón.
//  · GRANADA: toque = fragmentación · mantener = granada táctica (humo / aturdidora)
//  · El cuchillo sale solo al disparar con un enemigo pegado (lo resuelve el equipo del jugador)
import { store } from '../core/Settings.js';

const LOOK = 2.2;          // píxeles de pantalla → «píxeles de ratón»
const HOLD = 0.38;         // s para que «mantener» cuente como pulsación larga

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
      <div class="t-stick-zone"><span class="t-hint">MOVERSE</span></div>
      <div class="t-stick"><i></i></div>
      <button class="t-btn t-pause" data-a="pause" aria-label="Pausa">❚❚</button>
      <button class="t-btn t-fire" data-a="fire"><b>●</b>FUEGO</button>
      <button class="t-btn t-ads" data-a="ads"><b>◎</b>MIRA</button>
      <button class="t-btn t-jump" data-k="jump"><b>▲</b>SALTO</button>
      <button class="t-btn t-crouch" data-k="crouch"><b>▼</b>AGACHAR</button>
      <button class="t-btn t-reload" data-k="reload"><b>↻</b>RECARGA</button>
      <button class="t-btn t-nade" data-a="nade"><b>✹</b><span>GRANADA</span><i class="t-ring"></i></button>
      <button class="t-btn t-swap" data-k="swap"><b>⇄</b>ARMA</button>
      <button class="t-btn t-interact" data-k="interact"><b>✦</b>ARMERO</button>
      <div class="t-rotate"><div><b>⟳</b>Gira el celular para jugar</div></div>`;
    parent.appendChild(root);
    this.stick = root.querySelector('.t-stick'); this.knob = this.stick.querySelector('i');
    this.nadeLabel = root.querySelector('.t-nade span');
    this.ptrs = new Map();       // pointerId -> {kind, x, y, ox, oy, code, el}
    this.ads = false;
    const opts = { passive: false };
    root.addEventListener('pointerdown', (e) => this._down(e), opts);
    root.addEventListener('pointermove', (e) => this._move(e), opts);
    root.addEventListener('pointerup', (e) => this._up(e), opts);
    root.addEventListener('pointercancel', (e) => this._up(e), opts);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS: evitar desplazamientos / rebotes y la lupa al mantener pulsado
    root.addEventListener('touchstart', (e) => e.preventDefault(), opts);
    root.addEventListener('touchmove', (e) => e.preventDefault(), opts);
  }

  show(on) { this.root.classList.toggle('hidden', !on); if (!on) this.reset(); }
  reset() {
    for (const p of this.ptrs.values()) { if (p.code) this.input.release(p.code); clearTimeout(p.timer); }
    this.ptrs.clear(); this.input.move = null; this.input.mouse.left = false; this.ads = false; this.input.mouse.right = false;
    this.stick.classList.remove('on', 'sprint'); this.root.querySelectorAll('.t-btn.on, .t-btn.hold').forEach((b) => b.classList.remove('on', 'hold'));
  }
  /** Nombre corto de la granada táctica para la etiqueta de «mantener». */
  setTactical(name) { this.root.querySelector('.t-nade').dataset.tac = name; }

  _tap(code) { if (code) { this.input.press(code); this.input.release(code); } }

  _down(e) {
    e.preventDefault();
    const t = e.target.closest('.t-btn, .t-stick-zone, .t-look');
    if (!t) return;
    try { t.setPointerCapture?.(e.pointerId); } catch { /* puntero ya liberado */ }
    const p = { kind: 'look', x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY, code: null, el: t };
    const keys = store.settings.keys;
    if (t.classList.contains('t-stick-zone')) {
      p.kind = 'stick';
      this.stick.style.left = `${e.clientX}px`; this.stick.style.top = `${e.clientY}px`; this.stick.classList.add('on');
      this.input.move = { x: 0, z: 0, sprint: false };
    } else if (t.dataset.a === 'fire') {
      p.kind = 'fire'; this.input.mouse.left = true; this.input.mouse.leftPressed = true; t.classList.add('on');
    } else if (t.dataset.a === 'ads') {
      p.kind = 'btn'; this.ads = !this.ads;
      if (store.settings.adsMode === 'toggle') this.input.mouse.rightPressed = true; else this.input.mouse.right = this.ads;
      t.classList.toggle('on', this.ads);
    } else if (t.dataset.a === 'pause') { p.kind = 'btn'; this.onPause?.(); }
    else if (t.dataset.a === 'nade') {
      // toque corto = granada; mantener = táctica (se lanza al soltar)
      p.kind = 'nade'; p.t0 = performance.now(); t.classList.add('on');
      p.timer = setTimeout(() => { t.classList.add('hold'); this.nadeLabel.textContent = (t.dataset.tac || 'TÁCTICA').toUpperCase(); }, HOLD * 1000);
    } else if (t.dataset.k) {
      p.kind = 'btn'; p.code = keys[t.dataset.k];
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
      const R = Math.min(64, innerHeight * 0.13);
      let dx = e.clientX - p.ox, dy = e.clientY - p.oy;
      const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
      // si el dedo se aleja mucho, el joystick lo sigue (no hay que volver al centro)
      if (d > R * 1.6) { p.ox += dx * (1 - (R * 1.6) / d); p.oy += dy * (1 - (R * 1.6) / d); this.stick.style.left = `${p.ox}px`; this.stick.style.top = `${p.oy}px`; }
      dx *= k; dy *= k;
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const mx = dx / R, mz = dy / R;
      this.input.move = { x: Math.abs(mx) < 0.15 ? 0 : mx, z: Math.abs(mz) < 0.15 ? 0 : mz, sprint: mz < -0.9 && Math.abs(mx) < 0.45 };
      this.stick.classList.toggle('sprint', this.input.move.sprint);
    } else if (p.kind === 'look' || p.kind === 'fire') {
      // se mira arrastrando sobre la zona libre o sobre el botón de disparo
      this.input.mouse.dx += (e.clientX - p.x) * LOOK; this.input.mouse.dy += (e.clientY - p.y) * LOOK;
    }
    p.x = e.clientX; p.y = e.clientY;
  }
  _up(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    const keys = store.settings.keys;
    if (p.kind === 'stick') { this.input.move = null; this.stick.classList.remove('on', 'sprint'); this.knob.style.transform = ''; }
    else if (p.kind === 'fire') { this.input.mouse.left = false; p.el.classList.remove('on'); }
    else if (p.kind === 'nade') {
      clearTimeout(p.timer);
      const long = (performance.now() - p.t0) / 1000 >= HOLD;
      this._tap(long ? keys.tactical : keys.lethal);
      p.el.classList.remove('on', 'hold'); this.nadeLabel.textContent = 'GRANADA';
    } else if (p.code) { this.input.release(p.code); p.el.classList.remove('on'); }
  }
}
