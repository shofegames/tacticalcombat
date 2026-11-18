// Ajustes, equipamiento y estadísticas persistentes (localStorage).
import { DEFAULT_LOADOUT, WEAPONS } from '../../shared/weapons.js';

// shadowEvery: cada cuántos fotogramas se recalculan las sombras (2 = a 30 Hz; los cambios son imperceptibles).
// shadowRange: hasta qué distancia proyectan sombra los soldados (lo más caro de dibujar).
export const QUALITY = {
  low: { label: 'Bajo', shadows: 0, post: false, bloom: false, msaa: 0, tex: 256, prCap: 1, scale: 0.8, lights: 3, particles: 0.5, aniso: 2, shadowEvery: 2, shadowRange: 0 },
  medium: { label: 'Medio', shadows: 1024, post: true, bloom: true, msaa: 0, tex: 512, prCap: 1, scale: 1, lights: 4, particles: 0.8, aniso: 4, shadowEvery: 2, shadowRange: 18 },
  high: { label: 'Alto', shadows: 2048, post: true, bloom: true, msaa: 2, tex: 512, prCap: 1.25, scale: 1, lights: 6, particles: 1, aniso: 8, shadowEvery: 1, shadowRange: 28 },
  ultra: { label: 'Ultra', shadows: 4096, post: true, bloom: true, msaa: 4, tex: 1024, prCap: 2, scale: 1, lights: 8, particles: 1.3, aniso: 16, shadowEvery: 1, shadowRange: 60 },
};
export const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];

export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', crouch: 'KeyC', sprint: 'ShiftLeft',
  leanLeft: 'KeyQ', leanRight: 'KeyE', reload: 'KeyR', primary: 'Digit1', secondary: 'Digit2', swap: 'KeyX',
  lethal: 'KeyG', tactical: 'KeyT', melee: 'KeyV', inspect: 'KeyI', scoreboard: 'Tab', pause: 'Escape', interact: 'KeyF',
  lookLeft: 'ArrowLeft', lookRight: 'ArrowRight', lookUp: 'ArrowUp', lookDown: 'ArrowDown',
};
export const KEY_LABELS = {
  forward: 'Avanzar', back: 'Retroceder', left: 'Izquierda', right: 'Derecha', jump: 'Saltar', crouch: 'Agacharse / deslizarse', sprint: 'Correr',
  leanLeft: 'Asomarse a la izquierda', leanRight: 'Asomarse a la derecha', reload: 'Recargar', primary: 'Arma principal', secondary: 'Arma secundaria',
  swap: 'Cambiar de arma', lethal: 'Granada', tactical: 'Granada táctica', melee: 'Cuchillo', inspect: 'Inspeccionar arma', scoreboard: 'Marcador', interact: 'Armero (entrenamiento)',
  lookLeft: 'Mirar a la izquierda', lookRight: 'Mirar a la derecha', lookUp: 'Mirar arriba', lookDown: 'Mirar abajo',
};
/** Versión del esquema de teclas: al subirla se migran las asignaciones guardadas. */
const KEYS_VERSION = 2;

const DEFAULTS = {
  quality: 'medium', dynamicRes: true, autoQuality: true, settingsVersion: 3, fov: 78, sensitivity: 1.0, adsSensitivity: 0.8, invertY: false,
  master: 0.8, sfx: 1.0, music: 0.5, ambience: 0.7,
  showFps: true, headBob: 1.0, crosshairColor: '#e8f4ff', name: 'Jugador', serverUrl: '',
  crouchMode: 'hold', adsMode: 'hold', sprintMode: 'hold', rawInput: false, keyLook: 1.0, aimAssist: 'auto', touch: 'auto',
  keys: { ...DEFAULT_KEYS }, keysVersion: KEYS_VERSION,
};

export const SKINS = {
  woodland: { name: 'Boscoso', cloth: 0x4a5236, vest: 0x2e3324, helmet: 0x3a4028, glove: 0x1e1e1c },
  desert: { name: 'Desierto', cloth: 0xb09a6c, vest: 0x7a6a48, helmet: 0xa08a5c, glove: 0x4a4030 },
  urban: { name: 'Urbano', cloth: 0x5d6368, vest: 0x2a2d30, helmet: 0x3a3d40, glove: 0x151515 },
  night: { name: 'Operaciones nocturnas', cloth: 0x1c1f24, vest: 0x101214, helmet: 0x14161a, glove: 0x0a0a0a },
  arctic: { name: 'Ártico', cloth: 0xcfd4d8, vest: 0x8a9096, helmet: 0xdfe3e6, glove: 0x2a2c2e },
};
export const WEAPON_FINISHES = {
  standard: { name: 'Estándar', color: null },
  tan: { name: 'Arena', color: 0xa38f66 },
  olive: { name: 'Oliva', color: 0x4d5a3a },
  arctic: { name: 'Blanco ártico', color: 0xd9dde0 },
  crimson: { name: 'Carmesí', color: 0x7a1c1c },
  gold: { name: 'Oro', color: 0xc9a23a, metal: 1, rough: 0.25 },
};
export const HELMETS = { standard: 'Casco táctico', cap: 'Gorra', beret: 'Boina', none: 'Sin casco' };
export const CHARMS = { none: 'Ninguno', tag: 'Chapa de identificación', bullet: 'Bala', skull: 'Calavera' };

function load(key, def) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? v : def; } catch { return def; }
}
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* almacenamiento no disponible */ } }

class Store {
  constructor() {
    const s = load('tc.settings', {});
    this.settings = { ...DEFAULTS, ...s, keys: { ...DEFAULT_KEYS, ...(s.keys || {}) } };
    if ((s.keysVersion || 1) < KEYS_VERSION) { // v1 usaba Q para cambiar de arma: ahora Q/E sirven para asomarse
      if (this.settings.keys.swap === 'KeyQ') this.settings.keys.swap = 'KeyX';
      this.settings.keysVersion = KEYS_VERSION;
    }
    if ((s.settingsVersion || 1) < 3) {
      // v0.4: «Alto» era el valor por defecto y resultó demasiado pesado para muchos equipos
      if (this.settings.quality === 'high' || this.settings.quality === 'ultra') this.settings.quality = 'medium';
      this.settings.dynamicRes = true; this.settings.autoQuality = true; this.settings.settingsVersion = 3;
      this.settings.rawInput = false;   // con touchpad, el movimiento en bruto (sin aceleración de Windows) se siente lentísimo
    }
    this.progress = { xp: 0, ...load('tc.progress', {}) };
    if (!QUALITY[this.settings.quality]) this.settings.quality = 'medium';
    const l = load('tc.loadout', {});
    this.loadout = { ...DEFAULT_LOADOUT, skin: 'woodland', finish: 'standard', helmet: 'standard', charm: 'none', tactical: 'smoke', ...l };
    if (!WEAPONS[this.loadout.primary]) this.loadout.primary = DEFAULT_LOADOUT.primary;
    if (!WEAPONS[this.loadout.secondary]) this.loadout.secondary = DEFAULT_LOADOUT.secondary;
    this.stats = { kills: 0, deaths: 0, headshots: 0, shots: 0, hits: 0, matches: 0, wins: 0, losses: 0, timePlayed: 0, bestStreak: 0,
      captures: 0, weaponKills: {}, modeMatches: {}, longestKill: 0, ...load('tc.stats', {}) };
    this.listeners = new Set();
  }
  get quality() { return QUALITY[this.settings.quality]; }
  set(k, v) { this.settings[k] = v; this.saveSettings(); for (const f of this.listeners) f(k, v); }
  onChange(f) { this.listeners.add(f); return () => this.listeners.delete(f); }
  saveSettings() { save('tc.settings', this.settings); }
  saveLoadout() { save('tc.loadout', this.loadout); }
  saveStats() { save('tc.stats', this.stats); }
  saveProgress() { save('tc.progress', this.progress); }
  resetStats() {
    this.stats = { kills: 0, deaths: 0, headshots: 0, shots: 0, hits: 0, matches: 0, wins: 0, losses: 0, timePlayed: 0, bestStreak: 0,
      captures: 0, weaponKills: {}, modeMatches: {}, longestKill: 0 };
    this.saveStats();
  }
  resetKeys() { this.settings.keys = { ...DEFAULT_KEYS }; this.saveSettings(); }
}
export const store = new Store();
/** Nombre legible de la tecla asignada a una acción. */
export function keyLabel(action) {
  const c = store.settings.keys[action] || '';
  return c.replace('Key', '').replace('Digit', '').replace('ShiftLeft', 'Mayús').replace('Space', 'Espacio').replace('Escape', 'Esc')
    .replace('Mouse1', 'Rueda').replace('Mouse3', 'Lateral 1').replace('Mouse4', 'Lateral 2');
}
