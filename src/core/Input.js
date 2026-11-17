// Entrada: teclado + ratón con Pointer Lock y teclas reasignables.
import { store } from './Settings.js';

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.pressed = new Set();     // flancos de subida de este frame (por acción)
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0 };
    this.locked = false;
    this.enabled = false;         // solo true durante la partida
    this.forceLock = false;       // pruebas automáticas / navegadores sin pointer lock
    this.onLockChange = null;
    this.captureNext = null;      // reasignación de teclas

    addEventListener('keydown', (e) => {
      if (this.captureNext) { e.preventDefault(); const f = this.captureNext; this.captureNext = null; f(e.code); return; }
      if (!this.enabled) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'F1'].includes(e.code) || e.code.startsWith('Digit')) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      // algunos navegadores entregan picos espurios al capturar el puntero
      if (Math.abs(e.movementX) > 600 || Math.abs(e.movementY) > 600) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.active) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.right = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    document.addEventListener('wheel', (e) => { if (this.active) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      if (!this.locked) { this.keys.clear(); this.mouse.left = this.mouse.right = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { if (this.onLockChange) this.onLockChange(false); });
  }
  get active() { return this.enabled && (this.locked || this.forceLock); }
  lock() {
    if (this.forceLock) { if (this.onLockChange) this.onLockChange(true); return; }
    try { const p = this.dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* sin soporte */ }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(action) { return this.keys.has(store.settings.keys[action]); }
  hit(action) { return this.pressed.has(store.settings.keys[action]); }
  endFrame() { this.pressed.clear(); this.mouse.dx = this.mouse.dy = 0; this.mouse.leftPressed = false; this.mouse.wheel = 0; }
}

export function keyName(code) {
  if (!code) return '—';
  return code.replace('Key', '').replace('Digit', '').replace('ShiftLeft', 'Mayús izq.').replace('ShiftRight', 'Mayús der.')
    .replace('ControlLeft', 'Ctrl izq.').replace('ControlRight', 'Ctrl der.').replace('Space', 'Espacio').replace('AltLeft', 'Alt')
    .replace('Escape', 'Esc').replace('Arrow', 'Flecha ');
}
