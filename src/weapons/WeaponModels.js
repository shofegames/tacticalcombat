// Modelos 3D procedurales de las armas. Convención: el cañón apunta a -Z, +Y arriba, origen en la empuñadura.
// Cada modelo expone puntos de anclaje (boca, expulsión, mira, mano izquierda) y piezas animables
// (corredera/cerrojo, cargador, bomba, tapa…). Añadir un arma = registrar aquí un constructor con su id.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getTextureSet } from '../gfx/Textures.js';
import { WEAPON_FINISHES } from '../core/Settings.js';

const matCache = new Map();
function wmat(kind, finish = 'standard') {
  const key = kind + '|' + finish;
  if (matCache.has(key)) return matCache.get(key);
  const fin = WEAPON_FINISHES[finish] || WEAPON_FINISHES.standard;
  let m;
  const tex = (n) => { const t = getTextureSet(n, 256); return { map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, metalnessMap: t.roughnessMap, roughness: 1, metalness: 1 }; };
  switch (kind) {
    case 'steel': m = new THREE.MeshStandardMaterial({ ...tex('gunmetal'), color: 0x34373c }); break;
    case 'dark': m = new THREE.MeshStandardMaterial({ ...tex('gunmetal'), color: 0x1b1c1f }); break;
    case 'bright': m = new THREE.MeshStandardMaterial({ ...tex('gunmetal'), color: 0x8a8e94 }); break;
    case 'body': // pieza pintable: aquí se aplica el acabado cosmético
      m = new THREE.MeshStandardMaterial({ ...tex(fin.metal ? 'gunmetal' : 'polymer'), color: fin.color ?? 0x232527 });
      if (fin.metal) { m.metalnessMap = null; m.metalness = 1; m.roughnessMap = null; m.roughness = fin.rough ?? 0.3; }
      break;
    case 'polymer': m = new THREE.MeshStandardMaterial({ ...tex('polymer'), color: 0x1a1b1d }); break;
    case 'wood': m = new THREE.MeshStandardMaterial({ ...tex('gunwood'), color: 0xffffff }); break;
    case 'brass': m = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.3 }); break;
    case 'lens': m = new THREE.MeshStandardMaterial({ color: 0x0a1420, metalness: 0.9, roughness: 0.05, emissive: 0x112a44, emissiveIntensity: 0.6 }); break;
    case 'dot': m = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.15, 0.1) }); break;
    case 'holo': m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.4, 3), transparent: true, opacity: 0.85 }); break;
    case 'glowC': m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 2.2, 3.0) }); break;
    case 'glowO': m = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.1, 0.25) }); break;
    case 'white': m = new THREE.MeshStandardMaterial({ ...tex('polymer'), color: 0xc9ced4 }); break;
    default: m = new THREE.MeshStandardMaterial({ color: 0x555555 });
  }
  matCache.set(key, m);
  return m;
}

const UB = new THREE.BoxGeometry(1, 1, 1);
const cylCache = new Map();
function cylG(ratio, seg) { const k = ratio.toFixed(3) + '|' + seg; if (!cylCache.has(k)) cylCache.set(k, new THREE.CylinderGeometry(ratio, 1, 1, seg)); return cylCache.get(k); }
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const HP = Math.PI / 2;

class Gun {
  constructor(finish) { this.finish = finish; this.parts = new Map(); this.meta = { muzzle: [0, 0.05, -0.5], eject: [0.03, 0.07, -0.05], sight: [0, 0.1, 0], left: [0, 0, -0.25], adsDist: 0.2 }; }
  _add(geo, mat, part) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(_m);
    const k = part + '|' + mat;
    if (!this.parts.has(k)) this.parts.set(k, { part, mat, list: [] });
    this.parts.get(k).list.push(g);
  }
  /** Caja centrada. */
  box(w, h, d, x, y, z, mat = 'steel', part = 'main', rx = 0, ry = 0, rz = 0) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(w, h, d)); this._add(UB, mat, part); return this;
  }
  /** Cilindro a lo largo de Z (cañones) centrado en (x,y,z). r2 = radio delantero. */
  tube(r, len, x, y, z, mat = 'steel', part = 'main', r2 = r, seg = 12) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(-HP, 0, 0)), _s.set(r, len, r)); this._add(cylG(r2 / r, seg), mat, part); return this;
  }
  /** Cilindro con rotación libre (eje Y local). */
  cyl(r, len, x, y, z, mat = 'steel', part = 'main', rx = 0, ry = 0, rz = 0, seg = 10, r2 = r) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(r, len, r)); this._add(cylG(r2 / r, seg), mat, part); return this;
  }
  set(k, v) { this.meta[k] = v; return this; }
  build() {
    const root = new THREE.Group(), groups = { main: root };
    for (const { part, mat, list } of this.parts.values()) {
      if (!groups[part]) { groups[part] = new THREE.Group(); groups[part].name = part; root.add(groups[part]); }
      const mesh = new THREE.Mesh(mergeGeometries(list, false), wmat(mat, this.finish));
      list.forEach((g) => g.dispose());
      mesh.castShadow = false; mesh.receiveShadow = false;
      groups[part].add(mesh);
    }
    const u = root.userData;
    u.parts = groups;
    for (const k of ['muzzle', 'eject', 'sight', 'left']) u[k] = new THREE.Vector3(...this.meta[k]);
    u.adsDist = this.meta.adsDist; u.magPos = this.meta.magPos ? new THREE.Vector3(...this.meta.magPos) : u.left.clone();
    u.leftOnPump = !!this.meta.leftOnPump; u.boltHand = this.meta.boltHand ? new THREE.Vector3(...this.meta.boltHand) : null;
    return root;
  }
}

// ---------- piezas reutilizables ----------
function ironSights(g, yBase, zFront, zRear, part = 'main') {
  g.box(0.006, 0.03, 0.008, 0, yBase + 0.015, zFront, 'dark', part);
  g.box(0.03, 0.012, 0.01, 0, yBase + 0.006, zRear, 'dark', part);
  g.box(0.008, 0.024, 0.01, -0.012, yBase + 0.016, zRear, 'dark', part); g.box(0.008, 0.024, 0.01, 0.012, yBase + 0.016, zRear, 'dark', part);
}
function redDot(g, y, z, holo = false) {
  g.box(0.04, 0.014, 0.075, 0, y + 0.007, z, 'dark');
  g.box(0.005, 0.046, 0.07, -0.022, y + 0.036, z, 'dark'); g.box(0.005, 0.046, 0.07, 0.022, y + 0.036, z, 'dark');
  g.box(0.049, 0.005, 0.07, 0, y + 0.061, z, 'dark');
  g.box(0.004, 0.004, 0.001, 0, y + 0.036, z - 0.02, holo ? 'holo' : 'dot');
  if (holo) { g.box(0.016, 0.001, 0.001, 0, y + 0.036, z - 0.02, 'holo'); g.box(0.001, 0.016, 0.001, 0, y + 0.036, z - 0.02, 'holo'); }
  return y + 0.036;
}
function scope(g, y, z, len, r) {
  g.tube(r, len, 0, y, z, 'dark', 'main', r, 14);
  g.tube(r * 1.35, len * 0.24, 0, y, z - len * 0.42, 'dark', 'main', r * 1.35, 14);
  g.tube(r * 1.25, len * 0.2, 0, y, z + len * 0.44, 'dark', 'main', r * 1.25, 14);
  g.tube(r * 1.2, 0.002, 0, y, z - len * 0.545, 'lens', 'main', r * 1.2, 14);
  g.tube(r * 1.1, 0.002, 0, y, z + len * 0.545, 'lens', 'main', r * 1.1, 14);
  g.box(0.02, r + 0.012, 0.028, 0, y - r * 0.5 - 0.012, z - len * 0.2, 'dark'); g.box(0.02, r + 0.012, 0.028, 0, y - r * 0.5 - 0.012, z + len * 0.2, 'dark');
  g.cyl(0.012, 0.02, 0, y + r + 0.008, z, 'dark'); g.cyl(0.012, 0.02, r + 0.008, y, z, 'dark', 'main', 0, 0, HP);
}
function pistolGrip(g, mat = 'polymer', z = 0.012, len = 0.11) {
  g.box(0.03, len, 0.046, 0, -len / 2 - 0.005, z + 0.018, mat, 'main', 0.3, 0, 0);
}
function trigger(g, z = -0.035) {
  g.box(0.006, 0.022, 0.006, 0, -0.012, z, 'dark');
  g.box(0.012, 0.004, 0.06, 0, -0.036, z, 'dark'); g.box(0.012, 0.03, 0.004, 0, -0.022, z - 0.03, 'dark');
}
function picatinny(g, y, z0, z1) {
  const n = Math.round(Math.abs(z1 - z0) / 0.012);
  for (let i = 0; i < n; i += 2) g.box(0.022, 0.006, 0.008, 0, y, z0 + (z1 - z0) * (i / n), 'dark');
}

// ---------- modelos ----------
const MODELS = {
  p9(g) {
    g.box(0.028, 0.03, 0.18, 0, 0.012, -0.055, 'body');                       // armazón
    g.box(0.03, 0.03, 0.195, 0, 0.042, -0.05, 'steel', 'slide');              // corredera
    for (let i = 0; i < 6; i++) g.box(0.032, 0.022, 0.003, 0, 0.044, 0.02 + i * 0.006, 'dark', 'slide');
    g.tube(0.007, 0.03, 0, 0.04, -0.155, 'dark');
    g.box(0.031, 0.11, 0.05, 0, -0.05, 0.025, 'body', 'main', 0.28, 0, 0);     // empuñadura
    g.box(0.024, 0.115, 0.034, 0, -0.052, 0.024, 'dark', 'mag', 0.28, 0, 0);
    g.box(0.026, 0.01, 0.045, 0, -0.105, 0.042, 'polymer', 'mag', 0.28, 0, 0);
    g.box(0.02, 0.014, 0.05, 0, -0.008, -0.105, 'body');                       // riel inferior
    trigger(g, -0.03); ironSights(g, 0.057, -0.14, 0.035, 'slide');
    g.set('muzzle', [0, 0.04, -0.175]).set('eject', [0.02, 0.05, -0.03]).set('sight', [0, 0.073, 0.035]).set('left', [-0.012, -0.045, 0.02])
      .set('magPos', [0, -0.07, 0.03]).set('adsDist', 0.3);
  },
  kestrel(g) {
    g.box(0.032, 0.032, 0.2, 0, 0.012, -0.06, 'steel');
    g.box(0.036, 0.04, 0.25, 0, 0.05, -0.075, 'bright', 'slide');
    g.box(0.03, 0.01, 0.2, 0, 0.074, -0.08, 'bright', 'slide');
    for (let i = 0; i < 7; i++) g.box(0.038, 0.03, 0.003, 0, 0.052, 0.015 + i * 0.006, 'steel', 'slide');
    g.tube(0.009, 0.03, 0, 0.048, -0.21, 'dark');
    g.box(0.036, 0.125, 0.056, 0, -0.058, 0.03, 'polymer', 'main', 0.25, 0, 0);
    g.box(0.038, 0.1, 0.03, 0, -0.058, 0.03, 'wood', 'main', 0.25, 0, 0);
    g.box(0.026, 0.13, 0.036, 0, -0.06, 0.028, 'dark', 'mag', 0.25, 0, 0);
    trigger(g, -0.03); ironSights(g, 0.079, -0.19, 0.035, 'slide');
    g.set('muzzle', [0, 0.048, -0.23]).set('eject', [0.022, 0.06, -0.03]).set('sight', [0, 0.095, 0.035]).set('left', [-0.014, -0.05, 0.022])
      .set('magPos', [0, -0.08, 0.03]).set('adsDist', 0.3);
  },
  mk4(g) {
    g.box(0.04, 0.05, 0.2, 0, 0.045, -0.03, 'body');                           // cajón superior e inferior
    g.box(0.036, 0.035, 0.15, 0, 0.012, -0.01, 'body');
    g.box(0.05, 0.05, 0.26, 0, 0.05, -0.26, 'body');                           // guardamanos
    for (let i = 0; i < 6; i++) { g.box(0.052, 0.012, 0.026, 0, 0.05, -0.16 - i * 0.04, 'dark'); }
    picatinny(g, 0.078, 0.06, -0.38);
    g.tube(0.009, 0.2, 0, 0.05, -0.48, 'steel');
    g.tube(0.012, 0.05, 0, 0.05, -0.585, 'dark', 'main', 0.011);               // apagallamas
    g.box(0.012, 0.045, 0.012, 0, 0.085, -0.4, 'dark');                        // punto de mira abatible
    g.tube(0.014, 0.19, 0, 0.045, 0.165, 'steel');                             // tubo de culata
    g.box(0.036, 0.075, 0.12, 0, 0.03, 0.26, 'polymer'); g.box(0.036, 0.11, 0.03, 0, 0.012, 0.325, 'polymer');
    pistolGrip(g, 'polymer'); trigger(g);
    g.box(0.026, 0.14, 0.052, 0, -0.07, -0.085, 'dark', 'mag', 0.14, 0, 0);    // cargador curvo
    g.box(0.026, 0.07, 0.05, 0, -0.16, -0.1, 'dark', 'mag', 0.32, 0, 0);
    g.box(0.014, 0.014, 0.06, 0, 0.074, 0.075, 'steel', 'slide');              // palanca de montar
    g.box(0.008, 0.03, 0.06, 0.022, 0.05, -0.04, 'dark');                      // ventana de expulsión
    const y = redDot(g, 0.08, -0.02);
    g.set('muzzle', [0, 0.05, -0.61]).set('eject', [0.03, 0.055, -0.04]).set('sight', [0, y, 0.02]).set('left', [-0.005, 0.01, -0.27])
      .set('magPos', [0, -0.1, -0.09]).set('adsDist', 0.18);
  },
  akv(g) {
    g.box(0.038, 0.058, 0.25, 0, 0.035, -0.03, 'steel');                       // cajón estampado
    g.box(0.04, 0.02, 0.24, 0, 0.072, -0.03, 'dark');                          // tapa
    g.box(0.044, 0.045, 0.17, 0, 0.03, -0.24, 'wood');                         // guardamanos de madera
    g.box(0.036, 0.03, 0.15, 0, 0.07, -0.25, 'wood');
    g.tube(0.009, 0.3, 0, 0.045, -0.47, 'steel');
    g.tube(0.007, 0.2, 0, 0.074, -0.4, 'steel');                               // tubo de gases
    g.box(0.016, 0.05, 0.02, 0, 0.065, -0.5, 'dark'); g.box(0.012, 0.04, 0.014, 0, 0.09, -0.58, 'dark');
    g.tube(0.012, 0.045, 0, 0.045, -0.635, 'dark', 'main', 0.013);
    g.box(0.034, 0.06, 0.24, 0, 0.02, 0.2, 'wood', 'main', -0.1, 0, 0);        // culata de madera
    g.box(0.036, 0.11, 0.02, 0, 0.0, 0.325, 'dark');
    g.box(0.03, 0.105, 0.042, 0, -0.055, 0.03, 'wood', 'main', 0.32, 0, 0); trigger(g);
    g.box(0.028, 0.1, 0.06, 0, -0.045, -0.09, 'dark', 'mag', 0.2, 0, 0);       // cargador «banana»
    g.box(0.028, 0.1, 0.058, 0, -0.125, -0.125, 'dark', 'mag', 0.55, 0, 0);
    g.box(0.028, 0.06, 0.056, 0, -0.185, -0.175, 'dark', 'mag', 0.85, 0, 0);
    g.box(0.03, 0.012, 0.035, 0.03, 0.062, -0.02, 'bright', 'slide');          // manivela del cerrojo
    g.box(0.03, 0.02, 0.012, 0, 0.09, -0.12, 'dark');                          // alza
    g.set('muzzle', [0, 0.045, -0.66]).set('eject', [0.03, 0.06, -0.03]).set('sight', [0, 0.106, -0.12]).set('left', [-0.005, 0.0, -0.25])
      .set('magPos', [0, -0.1, -0.11]).set('adsDist', 0.3);
  },
  viper9(g) {
    g.tube(0.024, 0.3, 0, 0.055, -0.09, 'body', 'main', 0.024, 14);            // cajón tubular
    g.box(0.036, 0.05, 0.2, 0, 0.02, -0.03, 'body');
    g.box(0.046, 0.05, 0.15, 0, 0.04, -0.27, 'polymer');                       // guardamanos
    g.tube(0.008, 0.07, 0, 0.055, -0.375, 'steel');
    g.box(0.012, 0.045, 0.012, 0, 0.1, -0.31, 'dark'); g.tube(0.02, 0.012, 0, 0.1, -0.31, 'dark', 'main', 0.02);
    g.box(0.03, 0.03, 0.02, 0, 0.09, 0.03, 'dark');
    g.box(0.01, 0.014, 0.22, -0.018, 0.045, 0.17, 'steel'); g.box(0.01, 0.014, 0.22, 0.018, 0.045, 0.17, 'steel');
    g.box(0.046, 0.09, 0.02, 0, 0.03, 0.285, 'polymer');
    pistolGrip(g); trigger(g);
    g.box(0.024, 0.16, 0.036, 0, -0.085, -0.1, 'dark', 'mag', 0.12, 0, 0);
    g.box(0.024, 0.06, 0.034, 0, -0.18, -0.118, 'dark', 'mag', 0.3, 0, 0);
    g.cyl(0.007, 0.03, -0.03, 0.065, -0.2, 'bright', 'slide', 0, 0, HP);        // palanca de montar
    g.set('muzzle', [0, 0.055, -0.415]).set('eject', [0.03, 0.06, -0.06]).set('sight', [0, 0.112, 0.03]).set('left', [-0.005, 0.0, -0.27])
      .set('magPos', [0, -0.1, -0.1]).set('adsDist', 0.2);
  },
  swift45(g) {
    g.box(0.044, 0.085, 0.2, 0, 0.03, -0.08, 'body');                          // cuerpo compacto
    g.box(0.04, 0.05, 0.1, 0, -0.02, -0.14, 'body', 'main', -0.35, 0, 0);
    g.box(0.046, 0.02, 0.24, 0, 0.078, -0.07, 'dark'); picatinny(g, 0.092, 0.04, -0.18);
    g.tube(0.011, 0.07, 0, 0.045, -0.21, 'dark'); g.tube(0.016, 0.1, 0, 0.045, -0.28, 'dark', 'main', 0.016);
    g.box(0.012, 0.014, 0.2, -0.02, 0.06, 0.12, 'steel'); g.box(0.012, 0.014, 0.2, 0.02, 0.06, 0.12, 'steel');
    g.box(0.05, 0.09, 0.02, 0, 0.035, 0.225, 'polymer');
    pistolGrip(g, 'polymer', 0.02); trigger(g, -0.02);
    g.box(0.026, 0.2, 0.034, 0, -0.1, -0.075, 'dark', 'mag');
    g.box(0.008, 0.02, 0.03, 0.026, 0.05, -0.1, 'bright', 'slide');
    const y = redDot(g, 0.094, -0.05);
    g.set('muzzle', [0, 0.045, -0.335]).set('eject', [0.03, 0.05, -0.06]).set('sight', [0, y, -0.01]).set('left', [-0.005, -0.03, -0.16])
      .set('magPos', [0, -0.12, -0.075]).set('adsDist', 0.2);
  },
  breacher(g) {
    g.box(0.04, 0.06, 0.24, 0, 0.035, -0.03, 'steel');                         // cajón
    g.tube(0.013, 0.5, 0, 0.055, -0.4, 'steel', 'main', 0.013, 14);            // cañón
    g.tube(0.012, 0.36, 0, 0.022, -0.33, 'dark', 'main', 0.012, 12);           // tubo almacén
    g.tube(0.024, 0.16, 0, 0.022, -0.3, 'polymer', 'pump', 0.024, 12);         // bomba
    for (let i = 0; i < 6; i++) g.tube(0.026, 0.008, 0, 0.022, -0.24 - i * 0.022, 'dark', 'pump', 0.026, 12);
    g.box(0.036, 0.065, 0.26, 0, 0.012, 0.2, 'polymer', 'main', -0.14, 0, 0);  // culata
    g.box(0.038, 0.115, 0.022, 0, -0.012, 0.335, 'dark');
    g.box(0.03, 0.09, 0.04, 0, -0.045, 0.04, 'polymer', 'main', 0.5, 0, 0); trigger(g);
    g.box(0.008, 0.012, 0.008, 0, 0.074, -0.64, 'brass');                      // punto de mira
    g.box(0.006, 0.02, 0.05, 0.022, 0.04, -0.06, 'dark');
    g.set('muzzle', [0, 0.055, -0.655]).set('eject', [0.03, 0.045, -0.06]).set('sight', [0, 0.082, 0.0]).set('left', [0, 0.0, -0.3])
      .set('magPos', [0, -0.02, -0.12]).set('leftOnPump', true).set('adsDist', 0.24);
  },
  striker(g) {
    g.box(0.044, 0.07, 0.3, 0, 0.035, -0.06, 'body');
    g.box(0.05, 0.055, 0.2, 0, 0.04, -0.3, 'polymer');
    for (let i = 0; i < 4; i++) g.box(0.052, 0.014, 0.03, 0, 0.04, -0.23 - i * 0.045, 'dark');
    g.tube(0.014, 0.2, 0, 0.05, -0.49, 'steel', 'main', 0.014, 14); g.tube(0.02, 0.05, 0, 0.05, -0.6, 'dark', 'main', 0.02, 10);
    picatinny(g, 0.073, 0.06, -0.38);
    g.box(0.038, 0.08, 0.14, 0, 0.03, 0.17, 'polymer'); g.box(0.04, 0.12, 0.03, 0, 0.012, 0.25, 'polymer');
    pistolGrip(g); trigger(g);
    g.box(0.036, 0.17, 0.075, 0, -0.085, -0.1, 'dark', 'mag', 0.1, 0, 0);
    g.box(0.008, 0.016, 0.035, 0.026, 0.05, -0.08, 'bright', 'slide');
    const y = redDot(g, 0.075, -0.03);
    g.set('muzzle', [0, 0.05, -0.63]).set('eject', [0.03, 0.05, -0.08]).set('sight', [0, y, 0.01]).set('left', [-0.005, 0.0, -0.3])
      .set('magPos', [0, -0.1, -0.1]).set('adsDist', 0.19);
  },
  longbow(g) {
    g.box(0.046, 0.06, 0.5, 0, 0.012, -0.12, 'body');                          // chasis
    g.box(0.05, 0.05, 0.26, 0, 0.012, -0.42, 'body');
    g.tube(0.02, 0.3, 0, 0.06, -0.02, 'steel', 'main', 0.02, 14);              // acción
    g.tube(0.013, 0.56, 0, 0.06, -0.44, 'steel', 'main', 0.011, 14);           // cañón pesado
    g.box(0.034, 0.03, 0.07, 0, 0.06, -0.75, 'dark'); g.box(0.04, 0.008, 0.05, 0, 0.06, -0.75, 'dark'); // freno de boca
    g.box(0.04, 0.09, 0.24, 0, 0.012, 0.25, 'body'); g.box(0.042, 0.03, 0.14, 0, 0.075, 0.24, 'polymer'); // culata + carrillera
    g.box(0.044, 0.13, 0.025, 0, 0.0, 0.38, 'polymer');
    g.box(0.032, 0.1, 0.045, 0, -0.05, 0.035, 'polymer', 'main', 0.25, 0, 0); trigger(g);
    g.box(0.03, 0.07, 0.085, 0, -0.045, -0.1, 'dark', 'mag');
    g.tube(0.009, 0.12, 0, 0.06, 0.1, 'bright', 'bolt');                       // cerrojo
    g.cyl(0.006, 0.055, 0.03, 0.045, 0.14, 'bright', 'bolt', 0, 0, -1.1); g.cyl(0.012, 0.02, 0.055, 0.03, 0.14, 'dark', 'bolt', 0, 0, -1.1, 8);
    g.box(0.006, 0.14, 0.006, -0.03, -0.07, -0.5, 'dark', 'main', 0, 0, 0.25); g.box(0.006, 0.14, 0.006, 0.03, -0.07, -0.5, 'dark', 'main', 0, 0, -0.25); // bípode
    scope(g, 0.118, -0.03, 0.3, 0.021);
    g.set('muzzle', [0, 0.06, -0.79]).set('eject', [0.03, 0.065, 0.0]).set('sight', [0, 0.118, 0.14]).set('left', [-0.005, -0.02, -0.33])
      .set('magPos', [0, -0.08, -0.1]).set('boltHand', [0.06, 0.035, 0.14]).set('adsDist', 0.1);
  },
  sentinel(g) {
    g.box(0.042, 0.055, 0.24, 0, 0.042, -0.03, 'body'); g.box(0.038, 0.035, 0.16, 0, 0.01, -0.01, 'body');
    g.box(0.05, 0.05, 0.34, 0, 0.048, -0.31, 'body');
    for (let i = 0; i < 5; i++) { g.box(0.052, 0.01, 0.04, 0, 0.048, -0.18 - i * 0.06, 'dark'); }
    picatinny(g, 0.077, 0.08, -0.46);
    g.tube(0.01, 0.22, 0, 0.048, -0.58, 'steel'); g.tube(0.016, 0.14, 0, 0.048, -0.72, 'dark', 'main', 0.016, 12); // silenciador corto
    g.tube(0.014, 0.16, 0, 0.042, 0.16, 'steel');
    g.box(0.038, 0.085, 0.16, 0, 0.03, 0.27, 'polymer'); g.box(0.04, 0.025, 0.1, 0, 0.082, 0.26, 'polymer'); g.box(0.04, 0.12, 0.028, 0, 0.012, 0.355, 'polymer');
    pistolGrip(g); trigger(g);
    g.box(0.03, 0.1, 0.065, 0, -0.055, -0.085, 'dark', 'mag', 0.08, 0, 0);
    g.box(0.014, 0.014, 0.06, 0, 0.074, 0.085, 'steel', 'slide');
    scope(g, 0.118, -0.02, 0.24, 0.018);
    g.set('muzzle', [0, 0.048, -0.8]).set('eject', [0.03, 0.055, -0.04]).set('sight', [0, 0.118, 0.12]).set('left', [-0.005, 0.005, -0.3])
      .set('magPos', [0, -0.09, -0.085]).set('adsDist', 0.1);
  },
  hammer(g) {
    g.box(0.05, 0.075, 0.34, 0, 0.04, -0.06, 'body');                          // cajón
    g.box(0.052, 0.014, 0.2, 0, 0.085, -0.05, 'dark', 'cover');                // tapa de alimentación
    g.box(0.05, 0.01, 0.02, 0, 0.094, -0.14, 'dark', 'cover');
    g.box(0.05, 0.05, 0.22, 0, 0.03, -0.34, 'polymer');                        // guardamanos
    g.tube(0.012, 0.42, 0, 0.055, -0.45, 'steel', 'main', 0.011, 12);
    g.tube(0.016, 0.24, 0, 0.055, -0.36, 'dark', 'main', 0.016, 10);           // funda térmica
    g.tube(0.014, 0.05, 0, 0.055, -0.685, 'dark', 'main', 0.013);
    g.cyl(0.006, 0.11, 0, 0.115, -0.3, 'dark', 'main', -HP + 0.5, 0, 0);       // asa de transporte
    g.box(0.014, 0.04, 0.014, 0, 0.1, -0.5, 'dark');
    g.box(0.11, 0.1, 0.13, -0.045, -0.04, -0.1, 'polymer', 'mag');             // caja de munición
    for (let i = 0; i < 6; i++) g.cyl(0.004, 0.03, -0.04 + i * 0.011, 0.082 - Math.abs(i - 2.5) * 0.004, -0.1, 'brass', 'mag', HP, 0, 0, 6);
    g.box(0.038, 0.07, 0.22, 0, 0.03, 0.21, 'polymer', 'main', -0.06, 0, 0); g.box(0.04, 0.11, 0.025, 0, 0.012, 0.325, 'polymer');
    pistolGrip(g); trigger(g);
    g.box(0.006, 0.12, 0.006, -0.03, -0.05, -0.56, 'dark', 'main', 0.3, 0, 0.2); g.box(0.006, 0.12, 0.006, 0.03, -0.05, -0.56, 'dark', 'main', 0.3, 0, -0.2);
    g.box(0.008, 0.018, 0.04, 0.03, 0.045, -0.1, 'bright', 'slide');
    g.box(0.03, 0.02, 0.012, 0, 0.105, 0.03, 'dark');
    g.set('muzzle', [0, 0.055, -0.71]).set('eject', [0.035, 0.02, -0.08]).set('sight', [0, 0.121, 0.03]).set('left', [-0.005, -0.005, -0.34])
      .set('magPos', [-0.045, -0.06, -0.1]).set('adsDist', 0.3);
  },
  garrison(g) {
    g.box(0.042, 0.055, 0.56, 0, 0.02, -0.2, 'wood');                          // caja de madera completa
    g.box(0.04, 0.06, 0.28, 0, 0.005, 0.2, 'wood', 'main', -0.12, 0, 0);
    g.box(0.042, 0.12, 0.02, 0, -0.03, 0.335, 'steel');
    g.box(0.036, 0.03, 0.26, 0, 0.058, -0.3, 'wood');                          // guardamanos superior
    g.box(0.036, 0.04, 0.17, 0, 0.062, -0.02, 'steel');                        // cajón de mecanismos
    g.tube(0.009, 0.2, 0, 0.055, -0.56, 'steel'); g.tube(0.011, 0.36, 0, 0.03, -0.47, 'steel');
    g.box(0.012, 0.035, 0.014, 0, 0.085, -0.63, 'dark'); g.box(0.03, 0.03, 0.02, 0, 0.09, 0.06, 'dark');
    g.box(0.03, 0.012, 0.09, 0, 0.082, -0.03, 'bright', 'slide');              // cerrojo
    g.box(0.008, 0.012, 0.16, 0.024, 0.055, -0.14, 'steel', 'slide'); g.box(0.02, 0.012, 0.014, 0.034, 0.055, -0.07, 'steel', 'slide');
    g.box(0.024, 0.05, 0.06, 0, 0.11, -0.03, 'brass', 'mag');                  // peine en bloque
    trigger(g, -0.02); g.box(0.03, 0.02, 0.07, 0, -0.035, -0.02, 'steel');
    g.set('muzzle', [0, 0.055, -0.665]).set('eject', [0.0, 0.1, -0.03]).set('sight', [0, 0.106, 0.06]).set('left', [-0.005, -0.01, -0.3])
      .set('magPos', [0.0, 0.2, -0.03]).set('adsDist', 0.26);
  },
  chicago(g) {
    g.box(0.044, 0.065, 0.3, 0, 0.035, -0.06, 'steel');                        // cajón fresado
    g.tube(0.012, 0.24, 0, 0.05, -0.33, 'steel', 'main', 0.012, 12);
    for (let i = 0; i < 9; i++) g.tube(0.017, 0.006, 0, 0.05, -0.23 - i * 0.02, 'steel', 'main', 0.017, 12); // aletas de refrigeración
    g.tube(0.018, 0.05, 0, 0.05, -0.47, 'dark', 'main', 0.02, 10);             // compensador
    g.box(0.036, 0.07, 0.05, 0, -0.03, -0.3, 'wood', 'main', 0.3, 0, 0);       // empuñadura delantera
    g.box(0.036, 0.06, 0.24, 0, 0.0, 0.2, 'wood', 'main', -0.16, 0, 0); g.box(0.038, 0.12, 0.02, 0, -0.035, 0.32, 'steel');
    g.box(0.032, 0.1, 0.045, 0, -0.05, 0.035, 'wood', 'main', 0.3, 0, 0); trigger(g);
    g.cyl(0.075, 0.05, 0, -0.035, -0.11, 'dark', 'mag', 0, 0, HP, 20);         // tambor
    g.cyl(0.078, 0.008, 0, -0.035, -0.11, 'steel', 'mag', 0, 0, HP, 20);
    g.cyl(0.012, 0.056, 0, -0.035, -0.11, 'bright', 'mag', 0, 0, HP, 8);
    g.cyl(0.008, 0.02, 0, 0.078, -0.04, 'bright', 'slide');                    // tirador superior
    g.box(0.03, 0.025, 0.012, 0, 0.085, 0.06, 'dark'); g.box(0.006, 0.02, 0.008, 0, 0.078, -0.44, 'dark');
    g.set('muzzle', [0, 0.05, -0.5]).set('eject', [0.03, 0.055, -0.07]).set('sight', [0, 0.1, 0.06]).set('left', [-0.005, -0.03, -0.3])
      .set('magPos', [0, -0.05, -0.11]).set('adsDist', 0.26);
  },
  jager98(g) {
    g.box(0.04, 0.05, 0.62, 0, 0.018, -0.24, 'wood');
    g.box(0.038, 0.06, 0.3, 0, 0.0, 0.2, 'wood', 'main', -0.14, 0, 0); g.box(0.04, 0.115, 0.02, 0, -0.04, 0.34, 'steel');
    g.box(0.034, 0.02, 0.3, 0, 0.052, -0.34, 'wood');
    g.tube(0.016, 0.2, 0, 0.055, 0.0, 'steel', 'main', 0.016, 12);
    g.tube(0.009, 0.2, 0, 0.052, -0.64, 'steel'); g.tube(0.012, 0.03, 0, 0.03, -0.56, 'steel');
    g.box(0.044, 0.014, 0.03, 0, 0.03, -0.42, 'steel'); g.box(0.044, 0.014, 0.03, 0, 0.03, -0.2, 'steel');
    g.box(0.008, 0.028, 0.01, 0, 0.075, -0.72, 'dark'); g.box(0.03, 0.022, 0.05, 0, 0.074, -0.14, 'dark');
    g.tube(0.008, 0.13, 0, 0.055, 0.1, 'bright', 'bolt');
    g.cyl(0.006, 0.06, 0.035, 0.05, 0.13, 'bright', 'bolt', 0, 0, -HP); g.cyl(0.013, 0.022, 0.068, 0.05, 0.13, 'bright', 'bolt', 0, 0, -HP, 10);
    trigger(g, -0.01); g.box(0.03, 0.02, 0.09, 0, -0.012, -0.08, 'steel');
    g.set('muzzle', [0, 0.052, -0.745]).set('eject', [0.02, 0.07, 0.0]).set('sight', [0, 0.09, -0.14]).set('left', [-0.005, -0.012, -0.32])
      .set('magPos', [0.0, 0.12, 0.0]).set('boltHand', [0.07, 0.05, 0.13]).set('adsDist', 0.32);
  },
  pulse(g) {
    g.box(0.05, 0.085, 0.36, 0, 0.045, -0.1, 'white');                         // carcasa
    g.box(0.054, 0.03, 0.2, 0, 0.02, -0.33, 'body'); g.box(0.04, 0.05, 0.22, 0, 0.075, -0.34, 'body');
    g.tube(0.014, 0.16, 0, 0.055, -0.47, 'dark', 'main', 0.014, 8);
    for (let i = 0; i < 4; i++) g.tube(0.02, 0.012, 0, 0.055, -0.4 - i * 0.035, 'glowC', 'main', 0.02, 8);  // anillos emisores
    g.box(0.056, 0.012, 0.3, 0, 0.045, -0.1, 'glowC');                         // línea de energía
    g.box(0.04, 0.09, 0.2, 0, 0.03, 0.17, 'body', 'main', -0.08, 0, 0); g.box(0.042, 0.12, 0.03, 0, 0.012, 0.27, 'polymer');
    pistolGrip(g, 'polymer'); trigger(g);
    g.box(0.038, 0.09, 0.08, 0, -0.04, -0.13, 'dark', 'mag');                  // célula de energía
    g.box(0.04, 0.05, 0.02, 0, -0.04, -0.17, 'glowC', 'mag'); g.box(0.04, 0.02, 0.085, 0, -0.07, -0.13, 'glowC', 'mag');
    const y = redDot(g, 0.1, -0.06, true);
    g.set('muzzle', [0, 0.055, -0.56]).set('eject', [0.03, 0.05, -0.1]).set('sight', [0, y, -0.02]).set('left', [-0.005, 0.0, -0.32])
      .set('magPos', [0, -0.08, -0.13]).set('adsDist', 0.19);
  },
  rail(g) {
    g.box(0.056, 0.1, 0.4, 0, 0.04, -0.06, 'body');
    g.box(0.016, 0.03, 0.56, -0.022, 0.085, -0.5, 'white'); g.box(0.016, 0.03, 0.56, 0.022, 0.085, -0.5, 'white');   // raíles
    g.box(0.016, 0.03, 0.56, -0.022, 0.025, -0.5, 'white'); g.box(0.016, 0.03, 0.56, 0.022, 0.025, -0.5, 'white');
    g.box(0.012, 0.03, 0.5, 0, 0.055, -0.48, 'glowO');                        // núcleo acelerador
    for (let i = 0; i < 6; i++) g.box(0.068, 0.1, 0.014, 0, 0.055, -0.3 - i * 0.085, 'dark');                        // bobinas
    g.box(0.044, 0.1, 0.22, 0, 0.03, 0.22, 'body', 'main', -0.06, 0, 0); g.box(0.046, 0.13, 0.03, 0, 0.012, 0.335, 'polymer');
    g.box(0.046, 0.03, 0.12, 0, 0.09, 0.2, 'polymer');
    pistolGrip(g, 'polymer'); trigger(g);
    g.box(0.05, 0.07, 0.12, 0, -0.04, -0.14, 'dark', 'mag'); g.box(0.052, 0.02, 0.1, 0, -0.04, -0.14, 'glowO', 'mag');
    scope(g, 0.135, -0.04, 0.22, 0.02);
    g.set('muzzle', [0, 0.055, -0.79]).set('eject', [0.03, 0.05, -0.1]).set('sight', [0, 0.135, 0.09]).set('left', [-0.005, -0.02, -0.3])
      .set('magPos', [0, -0.08, -0.14]).set('adsDist', 0.1);
  },
};

export function registerWeaponModel(id, fn) { MODELS[id] = fn; }

/** Crea el modelo de un arma con el acabado cosmético indicado. */
export function buildWeaponModel(id, finish = 'standard') {
  const g = new Gun(finish);
  (MODELS[id] || MODELS.mk4)(g);
  const m = g.build();
  m.userData.weaponId = id;
  return m;
}

export function disposeWeaponModel(m) { m.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
