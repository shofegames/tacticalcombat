// Punto de entrada: motor, entrada, HUD, menús, controles táctiles y transición menú ⇄ partida.
// Parámetros de desarrollo: ?test (sin pointer lock) · ?play=tdm&map=modern (arranque directo) · ?touch (forzar táctil).
import './ui/style.css';
import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { audio } from './core/Audio.js';
import { store } from './core/Settings.js';
import { Game } from './game/Game.js';
import { Hud } from './ui/Hud.js';
import { Menu, Loading, Pause } from './ui/Menu.js';
import { Backdrop } from './ui/Backdrop.js';
import { TouchControls, wantsTouch } from './ui/Touch.js';
import { PLAYABLE_MAPS } from '../shared/maps/index.js';
import { GEAR } from '../shared/gear.js';
import { loadWeaponAssets } from './weapons/WeaponAssets.js';
loadWeaponAssets();   // descarga en segundo plano mientras se está en el menú

const q = new URLSearchParams(location.search);
// Primera vez en un dispositivo táctil: calidad baja (los móviles van más justos)
if (q.has('touch')) window.__TC_FORCE_TOUCH = true;
if (wantsTouch() && !store.settings.touchInit) { store.settings.touchInit = true; store.set('quality', 'low'); }

const canvas = document.getElementById('view');
const ui = document.getElementById('ui');
const engine = new Engine(canvas);
const input = new Input(canvas);
const hud = new Hud(ui);
const menu = new Menu(document.getElementById('menu'), input);
const loading = new Loading(document.getElementById('loading'));
const pause = new Pause(document.getElementById('pause'), input);
const touch = new TouchControls(document.body, input);

let game = null, backdrop = null, lastOpts = null, busy = false, isTouch = false;

/** Táctil o teclado: se decide al empezar cada partida (el ajuste puede cambiar en el menú). */
function applyInputMode() {
  isTouch = wantsTouch();
  input.forceLock = q.has('test') || isTouch;
  input.touch = isTouch;
  pause.touch = isTouch;
  document.body.classList.toggle('is-touch', isTouch);
}
applyInputMode();

engine.updaters.push((dt, t) => {
  if (game) game.update(dt);
  else if (backdrop) backdrop.update(dt, t);
});
engine.start();

// Sin zoom por pellizco en Safari (ignora user-scalable=no); el doble toque lo anula touch-action en el CSS.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());

// El audio solo puede arrancar tras un gesto del usuario.
addEventListener('pointerdown', () => { audio.init(); if (!game) audio.startMusic(); }, { capture: true });

function startBackdrop() {
  backdrop = new Backdrop(engine);
  backdrop.load(PLAYABLE_MAPS[(Math.random() * PLAYABLE_MAPS.length) | 0]).catch((e) => console.error(e));
}

async function startMatch(opts) {
  if (busy) return;
  busy = true; lastOpts = opts;
  applyInputMode();
  touch.root.classList.toggle('training', opts.mode === 'training');
  menu.setVisible(false);
  loading.show(opts);
  audio.stopMusic();
  if (backdrop) { const b = backdrop; backdrop = null; await b.dispose(); }
  try {
    const g = new Game(engine, input, hud, opts);
    await g.load((p, l) => loading.progress(p, l));
    g.paused = true;
    game = g;
    hud.onExit = () => exitToMenu();
    hud.onRematch = () => rematch();
    touch.setTactical(GEAR[g.player.gear?.tacType || 'smoke'].short);
    loading.hide();
    input.enabled = true;
    pause.show('ready');
  } catch (e) {
    console.error(e);
    loading.hide();
    exitToMenu();
  } finally { busy = false; }
}

function exitToMenu() {
  if (game) { game.dispose(); game = null; }
  input.enabled = false; input.unlock();
  touch.show(false);
  pause.hide();
  menu.setVisible(true);
  startBackdrop();
  if (audio.ready) audio.startMusic();
}

async function rematch() {
  const opts = lastOpts;
  if (game) { game.dispose(); game = null; }
  input.enabled = false; touch.show(false);
  await startMatch(opts);
}

pause.onResume = () => {
  // en celulares: pantalla completa y horizontal (si el navegador lo permite)
  if (isTouch && !document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  }
  input.lock();
};
pause.onQuit = () => exitToMenu();
touch.onPause = () => { if (game && !game.over && !game.paused) input.onLockChange(false); };

input.onLockChange = (locked) => {
  if (!game || game.over) return;
  if (locked) { pause.hide(); game.paused = false; touch.show(isTouch); }
  else if (!busy) { game.paused = true; touch.show(false); pause.show('pause'); }
};
// Sin pointer lock (modo ?test o táctil) Esc no libera el ratón: abre la pausa a mano.
addEventListener('keydown', (e) => { if (e.code === 'Escape' && input.forceLock && game && !game.paused && !game.over) input.onLockChange(false); });
// Clic sobre la vista con la partida en marcha y el ratón libre: recaptura.
canvas.addEventListener('click', () => { if (game && !game.over && !input.active && !pause.visible) input.lock(); });
// Al terminar la partida se ocultan los controles táctiles (la pantalla de resultados necesita los toques)
setInterval(() => { if (game?.over && !touch.root.classList.contains('hidden')) touch.show(false); }, 250);
// Celular puesto en vertical en plena partida: pausa (el juego se juega en horizontal)
matchMedia('(orientation: portrait)').addEventListener('change', (e) => { if (e.matches && isTouch && game && !game.over && !game.paused) input.onLockChange(false); });
// Cambiar de pestaña o minimizar en pleno combate: pausa automática
document.addEventListener('visibilitychange', () => { if (document.hidden && game && !game.over && !game.paused) input.onLockChange(false); });

menu.onStart = (opts) => startMatch(opts);

// Arranque directo para pruebas: ?play=tdm&map=modern
if (q.get('play')) {
  const mode = q.get('play');
  startMatch({ mode, map: mode === 'training' ? 'training' : q.get('map') || 'modern', difficulty: q.get('diff') || 'regular',
    bots: q.has('bots') ? +q.get('bots') : undefined, hostileBots: q.has('hostile') });
} else startBackdrop();

// Acceso para depuración desde la consola.
window.TC = { get game() { return game; }, engine, input, store, hud, touch };
