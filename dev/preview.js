// Vista previa de desarrollo: renderiza un mapa con cámara fija, arma en primera persona y soldados.
// Parámetros: ?map=modern&cam=x,y,z&look=x,y,z&weapon=mk4&ads=0&soldiers=x,z;x,z
import * as THREE from 'three';
import { Engine } from '../src/core/Engine.js';
import { getMapDef } from '../shared/maps/index.js';
import { MapRenderer } from '../src/world/MapRenderer.js';
import { Effects } from '../src/gfx/Effects.js';
import { ViewModel } from '../src/weapons/ViewModel.js';
import { Soldier } from '../src/entities/Soldier.js';
import { WEAPONS } from '../shared/weapons.js';

const q = new URLSearchParams(location.search);
if (!q.has('basic')) await (await import('../src/weapons/WeaponAssets.js')).loadWeaponAssets();
const v3 = (s, d) => (s ? s.split(',').map(Number) : d);
const engine = new Engine(document.getElementById('c'));
const def = getMapDef(q.get('map') || 'modern'), world = def.buildCollision();
const mr = new MapRenderer(engine);
await mr.build(def, world);
const fx = new Effects(engine, world, def);
fx.setEmitters(mr.emitters);
const cam = engine.camera;
cam.position.set(...v3(q.get('cam'), [0, 1.7, 20]));
cam.lookAt(new THREE.Vector3(...v3(q.get('look'), [0, 1.5, 0])));
if (q.get('fov')) { cam.fov = +q.get('fov'); cam.updateProjectionMatrix(); }
cam.updateMatrixWorld();
let vm = null;
if (q.get('weapon')) { vm = new ViewModel(engine); vm.setWeapon(WEAPONS[q.get('weapon')]); }
const soldiers = [];
(q.get('soldiers') || '').split(';').filter(Boolean).forEach((s, i) => {
  const [x, z, team = 'b', crouch = '0'] = s.split(',');
  const so = new Soldier({ team, skin: ['woodland', 'urban', 'desert', 'night'][i % 4], seed: i });
  so.setWeapon(['mk4', 'akv', 'hammer', 'viper9'][i % 4]);
  engine.scene.add(so.root);
  const y = world.groundAt(+x, 10, +z);
  const yaw = Math.atan2(-(cam.position.x - +x), -(cam.position.z - +z)) + Math.PI;
  soldiers.push({ so, st: { x: +x, y, z: +z, yaw: yaw + Math.PI, pitch: 0, speed: i % 2 ? 3 : 0, crouch: crouch === '1', fwd: 1, firing: false } });
});
const ads = +(q.get('ads') || 0);
let t = 0;
engine.updaters.push((dt, time) => {
  t += dt;
  mr.update(dt, time, cam.position, cam.getWorldDirection(new THREE.Vector3()));
  fx.update(dt, time, cam);
  for (const s of soldiers) s.so.update(dt, s.st);
  if (vm) vm.update({ dt, time, anim: { kind: 'idle', u: 0, empty: false, reloadType: 'mag' }, ads, sprint: false, speed: 0, onGround: true, vy: 0, bobPhase: 0, mdx: 0, mdy: 0, landed: 0, bobScale: 1 });
});
// Modo «still»: sin bucle continuo; se simulan unos fotogramas y se renderiza uno (capturas automáticas).
if (q.get('still')) {
  for (let i = 0; i < 40; i++) { engine.time += 1 / 30; for (const u of engine.updaters) u(1 / 30, engine.time); }
  engine.render();
  window.__shot = engine.renderer.domElement.toDataURL('image/png');
  window.__ready = true;
} else { engine.start(); setTimeout(() => { window.__ready = true; }, 2500); }
