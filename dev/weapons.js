// Vitrina de desarrollo: armas de costado con luz de estudio. ?ids=mk4,akv&basic (sin Blender)&ang=0.5
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWeaponModel } from '../src/weapons/WeaponModels.js';
import { loadWeaponAssets } from '../src/weapons/WeaponAssets.js';

const q = new URLSearchParams(location.search);
if (!q.has('basic')) await loadWeaponAssets();
const ids = (q.get('ids') || 'mk4,akv,p9').split(',');
const canvas = document.getElementById('c');
const r = new THREE.WebGLRenderer({ canvas, antialias: true });
r.setSize(innerWidth, innerHeight, false); r.setPixelRatio(1);
r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1b1f24);
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(1, 2, 1.5); scene.add(sun);
const cam = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.01, 50);
const ang = +(q.get('ang') ?? 0.35);
const rows = ids.length, gap = 0.3;
ids.forEach((id, i) => {
  const m = buildWeaponModel(id);
  m.rotation.y = -Math.PI / 2 + ang; m.rotation.x = 0.08;
  m.position.set(0, (rows - 1) * gap / 2 - i * gap, 0);
  scene.add(m);
});
cam.position.set(0, 0, 0.9 + rows * 0.42); cam.lookAt(0, 0, 0);
r.render(scene, cam);
window.__ready = true;
