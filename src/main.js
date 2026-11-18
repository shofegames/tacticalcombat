// Punto de entrada: motor, entrada, HUD, menús y transición menú ⇄ partida.
// Parámetros de desarrollo: ?test (sin pointer lock) · ?play=tdm&map=modern (arranque directo).
import './ui/style.css';
import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { audio } from './core/Audio.js';
import { store } from './core/Settings.js';
import { Game } from './game/Game.js';
import { Hud } from './ui/Hud.js';
import { Menu, Loading, Pause } from './ui/Menu.js';
import { Backdrop } from './ui/Backdrop.js';
import { PLAYABLE_MAPS } from '../shared/maps/index.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('view');
const ui = document.getElementById('ui');
const engine = new Engine(canvas);
const input = new Input(canvas);
input.forceLock = q.has('test');
const hud = new Hud(ui);
const menu = new Menu(document.getElementById('menu'), input);
const loading = new Loading(document.getElementById('loading'));
const pause = new Pause(document.getElementById('pause'), input);

let game = null, backdrop = null, lastOpts = null, busy = false;

engine.updaters.push((dt, t) => {
  if (game) game.update(dt);
  else if (backdrop) backdrop.update(dt, t);
});
engine.start();

// El audio solo puede arrancar tras un gesto del usuario.
addEventListener('pointerdown', () => { audio.init(); if (!game) audio.startMusic(); }, { capture: true });

function startBackdrop() {
  backdrop = new Backdrop(engine);
  backdrop.load(PLAYABLE_MAPS[(Math.random() * PLAYABLE_MAPS.length) | 0]).catch((e) => console.error(e));
}

async function startMatch(opts) {
  if (busy) return;
  busy = true; lastOpts = opts;
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
  pause.hide();
  menu.setVisible(true);
  startBackdrop();
  if (audio.ready) audio.startMusic();
}

async function rematch() {
  const opts = lastOpts;
  if (game) { game.dispose(); game = null; }
  input.enabled = false;
  await startMatch(opts);
}

pause.onResume = () => input.lock();
pause.onQuit = () => exitToMenu();

input.onLockChange = (locked) => {
  if (!game || game.over) return;
  if (locked) { pause.hide(); game.paused = false; }
  else if (!busy) { game.paused = true; pause.show('pause'); }
};
// Sin pointer lock (modo ?test) Esc no libera el ratón: abre la pausa a mano.
addEventListener('keydown', (e) => { if (e.code === 'Escape' && input.forceLock && game && !game.paused && !game.over) input.onLockChange(false); });
// Clic sobre la vista con la partida en marcha y el ratón libre: recaptura.
canvas.addEventListener('click', () => { if (game && !game.over && !input.active && !pause.visible) input.lock(); });

menu.onStart = (opts) => startMatch(opts);

// Arranque directo para pruebas: ?play=tdm&map=modern
if (q.get('play')) {
  const mode = q.get('play');
  startMatch({ mode, map: mode === 'training' ? 'training' : q.get('map') || 'modern', difficulty: q.get('diff') || 'regular',
    bots: q.has('bots') ? +q.get('bots') : undefined, hostileBots: q.has('hostile') });
} else startBackdrop();

// Acceso para depuración desde la consola.
window.TC = { get game() { return game; }, engine, input, store, hud };
