// Entrada: teclado + ratón con Pointer Lock (movimiento en bruto, sin aceleración del sistema),
// teclas reasignables (también botón central y botones laterales del ratón) y entrada táctil
// (los controles táctiles escriben en este mismo estado, así el juego no distingue el origen).
import { store } from './Settings.js';

/** Botones del ratón asignables como «teclas»: central y laterales. */
const MOUSE_CODES = { 1: 'Mouse1', 3: 'Mouse3', 4: 'Mouse4' };

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.pressed = new Set();     // flancos de subida de este frame (por código)
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false, wheel: 0 };
    this.locked = false;
    this.enabled = false;         // solo true durante la partida
    this.forceLock = false;       // pruebas automáticas / pantallas táctiles (sin pointer lock)
    this.onLockChange = null;
    this.captureNext = null;      // reasignación de teclas

    addEventListener('keydown', (e) => {
      if (this.captureNext) { e.preventDefault(); const f = this.captureNext; this.captureNext = null; f(e.code); return; }
      if (!this.enabled) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'F1'].includes(e.code) || e.code.startsWith('Digit') || (e.ctrlKey && e.code === 'KeyW')) e.preventDefault();
      this.press(e.code);
    });
    addEventListener('keyup', (e) => this.release(e.code));
    addEventListener('blur', () => this.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      // algunos navegadores entregan picos espurios al capturar el puntero
      if (Math.abs(e.movementX) > 600 || Math.abs(e.movementY) > 600) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (this.captureNext && MOUSE_CODES[e.button]) { e.preventDefault(); const f = this.captureNext; this.captureNext = null; f(MOUSE_CODES[e.button]); return; }
      if (!this.active) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      else if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
      else if (MOUSE_CODES[e.button]) { e.preventDefault(); this.press(MOUSE_CODES[e.button]); }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      else if (e.button === 2) this.mouse.right = false;
      else if (MOUSE_CODES[e.button]) this.release(MOUSE_CODES[e.button]);
    });
    // los botones laterales disparan «atrás/adelante» en el navegador: se bloquea durante la partida
    document.addEventListener('auxclick', (e) => { if (this.enabled) e.preventDefault(); });
    addEventListener('mouseup', (e) => { if (this.enabled && (e.button === 3 || e.button === 4)) e.preventDefault(); });
    document.addEventListener('wheel', (e) => { if (this.active) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      if (!this.locked) this.clear();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { if (this.onLockChange) this.onLockChange(false); });
  }
  press(code) { if (!this.keys.has(code)) this.pressed.add(code); this.keys.add(code); }
  release(code) { this.keys.delete(code); }
  clear() { this.keys.clear(); this.mouse.left = this.mouse.right = false; }
  get active() { return this.enabled && (this.locked || this.forceLock); }
  lock() {
    if (this.forceLock) { if (this.onLockChange) this.onLockChange(true); return; }
    // movimiento en bruto (sin aceleración del sistema operativo) si el navegador lo admite
    const plain = () => { try { const p = this.dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* sin soporte */ } };
    if (!store.settings.rawInput) return plain();
    try {
      const p = this.dom.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch((err) => { if (err && err.name === 'NotSupportedError') plain(); });
    } catch { plain(); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(action) { return this.keys.has(store.settings.keys[action]); }
  hit(action) { return this.pressed.has(store.settings.keys[action]); }
  endFrame() { this.pressed.clear(); this.mouse.dx = this.mouse.dy = 0; this.mouse.leftPressed = false; this.mouse.rightPressed = false; this.mouse.wheel = 0; }
}

export function keyName(code) {
  if (!code) return '—';
  const MOUSE = { Mouse1: 'Botón central', Mouse3: 'Lateral atrás', Mouse4: 'Lateral adelante' };
  if (MOUSE[code]) return MOUSE[code];
  return code.replace('Key', '').replace('Digit', '').replace('ShiftLeft', 'Mayús izq.').replace('ShiftRight', 'Mayús der.')
    .replace('ControlLeft', 'Ctrl izq.').replace('ControlRight', 'Ctrl der.').replace('Space', 'Espacio').replace('AltLeft', 'Alt')
    .replace('Escape', 'Esc').replace('Arrow', 'Flecha ');
}
