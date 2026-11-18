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
    case 'wood': m = new THREE.MeshStandardMaterial({ ...tex('gunwood'), color: 0xa8826a }); break;
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

/**
 * Constructor de armas. Cada llamada (box/tube/cyl/cut/hole) se anota en `ops`: es la «receta» que el
 * script de Blender (tools/blender/build_weapons.py) usa para generar la versión detallada (biseles,
 * suavizado y tallados). Si esa versión está cargada se usa; si no, se construye con primitivas.
 * Con record = true solo se anota (sin generar geometría).
 */
class Gun {
  constructor(finish, record = false) {
    this.finish = finish; this.record = record; this.parts = new Map(); this.ops = [];
    this.meta = { muzzle: [0, 0.05, -0.5], eject: [0.03, 0.07, -0.05], sight: [0, 0.1, 0], left: [0, 0, -0.25], adsDist: 0.2 };
  }
  _add(geo, mat, part) {
    if (this.record) return;
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(_m);
    const k = part + '|' + mat;
    if (!this.parts.has(k)) this.parts.set(k, { part, mat, list: [] });
    this.parts.get(k).list.push(g);
  }
  /** Caja centrada. */
  box(w, h, d, x, y, z, mat = 'steel', part = 'main', rx = 0, ry = 0, rz = 0) {
    this.ops.push({ t: 'box', s: [w, h, d], p: [x, y, z], r: [rx, ry, rz], mat, part });
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(w, h, d)); this._add(UB, mat, part); return this;
  }
  /** Cilindro a lo largo de Z (cañones) centrado en (x,y,z). r2 = radio delantero. */
  tube(r, len, x, y, z, mat = 'steel', part = 'main', r2 = r, seg = 12) {
    this.ops.push({ t: 'cyl', s: [r, len, r], k: r2 / r, seg, p: [x, y, z], r: [-HP, 0, 0], mat, part });
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(-HP, 0, 0)), _s.set(r, len, r)); this._add(cylG(r2 / r, seg), mat, part); return this;
  }
  /** Cilindro con rotación libre (eje Y local). */
  cyl(r, len, x, y, z, mat = 'steel', part = 'main', rx = 0, ry = 0, rz = 0, seg = 10, r2 = r) {
    this.ops.push({ t: 'cyl', s: [r, len, r], k: r2 / r, seg, p: [x, y, z], r: [rx, ry, rz], mat, part });
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(r, len, r)); this._add(cylG(r2 / r, seg), mat, part); return this;
  }
  /**
   * Perfil lateral extruido: pts = [[z, y], …] (vista de costado, el cañón hacia -Z) con grosor th centrado en x.
   * Sirve para culatas, empuñaduras, cargadores curvos o cajones con su silueta real.
   */
  prof(pts, th, x = 0, mat = 'steel', part = 'main') {
    this.ops.push({ t: 'prof', pts, th, x, mat, part });
    if (this.record) return this;
    const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false, curveSegments: 4 });
    // (u, v, w) de la extrusión → (x0 + th/2 - w, v, u): rotación propia, conserva la orientación de las caras
    _m.set(0, 0, -1, x + th / 2, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
    this._add(geo, mat, part); geo.dispose();
    return this;
  }
  /** Tallado rectangular (solo en la versión de Blender): ventanas, ranuras, estrías. */
  cut(w, h, d, x, y, z, part = 'main', rx = 0, ry = 0, rz = 0) { this.ops.push({ t: 'cut', s: [w, h, d], p: [x, y, z], r: [rx, ry, rz], part }); return this; }
  /** Agujero cilíndrico (solo en la versión de Blender), eje Y local. */
  hole(r, len, x, y, z, part = 'main', rx = 0, ry = 0, rz = 0, seg = 16) { this.ops.push({ t: 'hole', s: [r, len, r], seg, p: [x, y, z], r: [rx, ry, rz], part }); return this; }
  set(k, v) { this.meta[k] = v; return this; }
  /** Punto de giro de una pieza animable (p. ej. eje del cerrojo). */
  pivot(part, v) { (this.pivots ||= {})[part] = v; return this; }
  /** tpl: lista [{part, mat, geometry}] de la versión de Blender (opcional). */
  build(tpl = null) {
    const root = new THREE.Group(), groups = { main: root };
    const pieces = tpl || [...this.parts.values()].map(({ part, mat, list }) => {
      const geometry = mergeGeometries(list, false); list.forEach((g) => g.dispose());
      return { part, mat, geometry };
    });
    for (const { part, mat, geometry } of pieces) {
      if (!groups[part]) { groups[part] = new THREE.Group(); groups[part].name = part; root.add(groups[part]); }
      const mesh = new THREE.Mesh(geometry, wmat(mat, this.finish));
      mesh.castShadow = false; mesh.receiveShadow = false;
      const pv = this.pivots && this.pivots[part];
      if (pv) { groups[part].position.set(pv[0], pv[1], pv[2]); mesh.position.set(-pv[0], -pv[1], -pv[2]); }
      groups[part].add(mesh);
    }
    root.userData.detailed = !!tpl;
    const u = root.userData;
    u.parts = groups;
    for (const k in groups) if (k !== 'main') groups[k].userData.base = groups[k].position.clone();
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
  if (g.record) {
    // versión detallada: cuerpo de tubo con visor redondo tallado, montura y perillas
    g.box(0.03, 0.012, 0.05, 0, y + 0.006, z, 'dark');
    g.box(0.044, 0.048, 0.058, 0, y + 0.036, z, 'dark');
    g.hole(0.0175, 0.1, 0, y + 0.036, z, 'main', HP, 0, 0, 28);
    g.cyl(0.0075, 0.014, 0.027, y + 0.036, z + 0.004, 'dark', 'main', 0, 0, HP, 14);
    g.cyl(0.0075, 0.012, 0, y + 0.064, z + 0.004, 'dark', 'main', 0, 0, 0, 14);
    g.box(0.004, 0.004, 0.001, 0, y + 0.036, z - 0.02, holo ? 'holo' : 'dot', 'optic');
    if (holo) { g.box(0.016, 0.001, 0.001, 0, y + 0.036, z - 0.02, 'holo', 'optic'); g.box(0.001, 0.016, 0.001, 0, y + 0.036, z - 0.02, 'holo', 'optic'); }
    return y + 0.036;
  }
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
    // armazón de polímero con riel y guardamonte, empuñadura inclinada con cola de castor
    g.prof([[0.045, 0.029], [-0.138, 0.029], [-0.142, 0.012], [-0.136, -0.004], [-0.062, -0.004], [-0.048, -0.012], [0.004, -0.012], [0.018, 0.0], [0.045, 0.004]], 0.028, 0, 'body');
    g.prof([[0.004, -0.006], [0.044, 0.004], [0.056, 0.016], [0.062, 0.004], [0.078, -0.106], [0.07, -0.12], [0.026, -0.117], [0.016, -0.09], [0.019, -0.055], [0.008, -0.03]], 0.031, 0, 'body');
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) g.cut(0.004, 0.004, 0.05, s * 0.0155, -0.03 - i * 0.016, 0.045, 'main', 0.28, 0, 0);   // textura de agarre
    // corredera con estrías talladas y ventana de expulsión
    g.prof([[0.046, 0.062], [-0.146, 0.062], [-0.152, 0.054], [-0.152, 0.03], [0.046, 0.03]], 0.03, 0, 'steel', 'slide');
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) g.cut(0.006, 0.026, 0.0024, s * 0.0155, 0.045, 0.012 + i * 0.0048, 'slide');
    g.cut(0.016, 0.014, 0.036, 0.012, 0.058, -0.036, 'slide');
    g.hole(0.0046, 0.03, 0, 0.045, -0.15, 'slide', HP, 0, 0);
    g.box(0.018, 0.016, 0.04, 0.002, 0.05, -0.036, 'dark');                    // recámara vista por la ventana
    g.tube(0.0072, 0.02, 0, 0.045, -0.142, 'dark');
    g.box(0.024, 0.11, 0.032, 0, -0.058, 0.04, 'dark', 'mag', 0.28, 0, 0);
    g.box(0.03, 0.012, 0.044, 0, -0.118, 0.053, 'polymer', 'mag', 0.28, 0, 0);
    trigger(g, -0.03); ironSights(g, 0.062, -0.14, 0.035, 'slide');
    g.set('muzzle', [0, 0.045, -0.158]).set('eject', [0.02, 0.058, -0.036]).set('sight', [0, 0.078, 0.035]).set('left', [-0.012, -0.045, 0.02])
      .set('magPos', [0, -0.07, 0.04]).set('adsDist', 0.3);
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
    // cajón inferior con brocal del cargador
    g.prof([[0.075, 0.03], [0.075, 0.004], [0.05, -0.012], [-0.045, -0.012], [-0.052, -0.034], [-0.128, -0.034], [-0.133, -0.006], [-0.138, 0.03]], 0.034, 0, 'body');
    // cajón superior con ventana de expulsión, portacerrojo visible y asistente de cierre
    g.box(0.04, 0.044, 0.21, 0, 0.052, -0.03, 'body');
    g.cut(0.014, 0.02, 0.062, 0.02, 0.051, -0.035);
    g.box(0.03, 0.016, 0.058, 0.002, 0.051, -0.035, 'bright');
    g.cyl(0.0085, 0.022, 0.026, 0.062, 0.035, 'body', 'main', 0, 0, HP, 16);
    picatinny(g, 0.077, 0.07, -0.14);
    // guardamanos M-LOK con ranuras talladas y riel superior
    g.box(0.05, 0.052, 0.3, 0, 0.05, -0.285, 'body');
    for (let i = 0; i < 5; i++) g.cut(0.07, 0.011, 0.032, 0, 0.044, -0.18 - i * 0.05);
    for (let i = 0; i < 4; i++) g.cut(0.016, 0.03, 0.032, 0, 0.026, -0.205 - i * 0.05);
    picatinny(g, 0.079, -0.14, -0.43);
    // cañón, bloque de gases y freno de boca con puertos
    g.tube(0.0085, 0.17, 0, 0.05, -0.515, 'steel');
    g.box(0.022, 0.026, 0.024, 0, 0.053, -0.452, 'dark');
    g.tube(0.013, 0.055, 0, 0.05, -0.6, 'dark', 'main', 0.012, 16);
    for (let i = 0; i < 3; i++) g.hole(0.0042, 0.04, 0, 0.05, -0.585 - i * 0.012, 'main', 0, 0, HP, 12);
    g.hole(0.0045, 0.08, 0, 0.05, -0.6, 'main', HP, 0, 0, 12);
    g.box(0.012, 0.042, 0.012, 0, 0.088, -0.41, 'dark');                       // punto de mira abatible
    // culata ajustable con hueco aligerado y cantonera
    g.tube(0.014, 0.19, 0, 0.048, 0.165, 'steel');
    g.prof([[0.17, 0.074], [0.33, 0.064], [0.338, 0.05], [0.338, -0.04], [0.322, -0.05], [0.27, -0.022], [0.2, 0.016], [0.17, 0.022]], 0.038, 0, 'polymer');
    g.cut(0.05, 0.028, 0.05, 0, 0.015, 0.275);
    g.box(0.04, 0.094, 0.012, 0, 0.008, 0.337, 'dark');
    // empuñadura inclinada y guardamonte
    g.prof([[0.012, -0.01], [0.05, -0.01], [0.085, -0.112], [0.072, -0.124], [0.046, -0.12], [0.03, -0.07]], 0.03, 0, 'polymer');
    for (let i = 0; i < 4; i++) g.cut(0.04, 0.006, 0.012, 0, -0.045 - i * 0.018, 0.026 + i * 0.006, 'main', 0.35, 0, 0);
    trigger(g);
    // cargador curvo y su base
    g.prof([[-0.066, -0.008], [-0.118, -0.008], [-0.126, -0.07], [-0.142, -0.13], [-0.16, -0.172], [-0.112, -0.188], [-0.097, -0.135], [-0.08, -0.07]], 0.024, 0, 'dark', 'mag');
    g.prof([[-0.108, -0.184], [-0.164, -0.168], [-0.17, -0.18], [-0.112, -0.197]], 0.028, 0, 'polymer', 'mag');
    g.box(0.014, 0.014, 0.06, 0, 0.076, 0.075, 'steel', 'slide');              // palanca de montar
    const y = redDot(g, 0.084, -0.02);
    g.set('muzzle', [0, 0.05, -0.61]).set('eject', [0.03, 0.055, -0.04]).set('sight', [0, y, 0.02]).set('left', [-0.005, 0.01, -0.27])
      .set('magPos', [0, -0.1, -0.09]).set('adsDist', 0.18);
  },
  akv(g) {
    // cajón estampado con remaches, tapa nervada y ventana de expulsión
    g.prof([[0.09, 0.064], [-0.16, 0.064], [-0.16, 0.012], [-0.12, 0.006], [0.06, 0.006], [0.09, 0.02]], 0.038, 0, 'steel');
    g.prof([[0.095, 0.08], [0.085, 0.088], [-0.15, 0.084], [-0.155, 0.064], [0.095, 0.064]], 0.036, 0, 'dark');
    for (let i = 0; i < 6; i++) g.cut(0.04, 0.002, 0.004, 0, 0.087, 0.06 - i * 0.04);   // nervios de la tapa
    g.cut(0.012, 0.022, 0.078, 0.019, 0.05, -0.03);
    g.box(0.03, 0.018, 0.07, 0, 0.05, -0.03, 'bright', 'slide');               // portacerrojo (se mueve al montar)
    g.box(0.03, 0.012, 0.035, 0.032, 0.05, 0.0, 'bright', 'slide');            // manivela
    g.box(0.004, 0.012, 0.09, -0.0205, 0.04, -0.01, 'steel');                  // selector
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) g.cyl(0.003, 0.004, s * 0.0195, 0.02, -0.12 + i * 0.06, 'dark', 'main', 0, 0, HP, 8);
    // guardamanos de madera con su forma y abrazaderas
    g.prof([[-0.16, 0.06], [-0.33, 0.058], [-0.336, 0.03], [-0.33, 0.01], [-0.16, 0.006]], 0.046, 0, 'wood');
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) g.cut(0.006, 0.004, 0.014, s * 0.023, 0.03, -0.2 - i * 0.03);
    g.prof([[-0.165, 0.094], [-0.33, 0.09], [-0.335, 0.07], [-0.165, 0.07]], 0.036, 0, 'wood');
    g.box(0.05, 0.064, 0.008, 0, 0.036, -0.338, 'steel');
    // cañón, tubo de gases, bloque de gases y punto de mira triangular
    g.tube(0.009, 0.3, 0, 0.045, -0.47, 'steel');
    g.tube(0.0075, 0.2, 0, 0.08, -0.42, 'steel');
    g.prof([[-0.5, 0.09], [-0.522, 0.09], [-0.53, 0.036], [-0.492, 0.036]], 0.018, 0, 'dark');
    g.prof([[-0.56, 0.046], [-0.6, 0.046], [-0.59, 0.106], [-0.574, 0.106]], 0.014, 0, 'dark');
    g.hole(0.012, 0.02, 0, 0.09, -0.582, 'main', 0, 0, HP, 16);                // aro del punto de mira
    g.tube(0.012, 0.045, 0, 0.045, -0.635, 'dark', 'main', 0.013);
    g.hole(0.0045, 0.06, 0, 0.045, -0.635, 'main', HP, 0, 0, 12);
    // culata de madera con su silueta, cantonera y empuñadura
    g.prof([[0.09, 0.06], [0.32, 0.036], [0.336, 0.03], [0.336, -0.07], [0.32, -0.076], [0.15, -0.02], [0.09, 0.0]], 0.036, 0, 'wood');
    g.box(0.038, 0.11, 0.012, 0, -0.02, 0.339, 'steel');
    g.prof([[0.03, 0.006], [0.06, 0.006], [0.088, -0.1], [0.075, -0.11], [0.05, -0.105], [0.03, -0.03]], 0.03, 0, 'wood');
    trigger(g);
    // cargador «banana» con nervios
    g.prof([[-0.06, 0.008], [-0.115, 0.008], [-0.125, -0.05], [-0.15, -0.12], [-0.19, -0.18], [-0.235, -0.208], [-0.2, -0.226], [-0.15, -0.205], [-0.11, -0.15], [-0.085, -0.08]], 0.028, 0, 'dark', 'mag');
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) g.cut(0.004, 0.05, 0.006, s * 0.014, -0.06 - i * 0.045, -0.105 - i * 0.03, 'mag', 0.45 + i * 0.12, 0, 0);
    g.box(0.03, 0.02, 0.012, 0, 0.094, -0.12, 'dark');                         // alza
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
      .set('magPos', [0, -0.08, -0.1]).set('boltHand', [0.06, 0.035, 0.14]).set('adsDist', 0.1).pivot('bolt', [0, 0.06, 0]);
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
      .set('magPos', [0.0, 0.12, 0.0]).set('boltHand', [0.07, 0.05, 0.13]).set('adsDist', 0.32).pivot('bolt', [0, 0.055, 0]);
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

// ---------- detalles extra (se ven en la versión de Blender) ----------
const EXTRA = {
  longbow(g) {
    for (let i = 0; i < 3; i++) g.hole(0.0055, 0.06, 0, 0.06, -0.735 - i * 0.016, 'main', 0, 0, HP, 12);   // puertos del freno
    for (const [x, y] of [[0, 0.0115], [0.0112, 0], [-0.0112, 0]]) g.cut(0.0035, 0.0035, 0.3, x, 0.06 + y, -0.45);  // cañón estriado
  },
  hammer(g) { for (let i = 0; i < 6; i++) g.hole(0.0042, 0.012, 0, 0.071, -0.27 - i * 0.035, 'main', 0, 0, 0, 10); },
  chicago(g) { for (let i = 0; i < 3; i++) g.cut(0.0035, 0.01, 0.008, 0, 0.07, -0.462 - i * 0.011); },
  sentinel(g) { for (let i = 0; i < 4; i++) g.cut(0.04, 0.003, 0.004, 0, 0.064, -0.68 - i * 0.025); },
};
/** Ánima tallada en la boca de las armas de fuego (no en las de energía). */
function muzzleBore(g, id) {
  if (['pulse', 'rail', 'p9', 'akv', 'mk4'].includes(id)) return;
  const [x, y, z] = g.meta.muzzle;
  g.hole(0.0042, 0.07, x, y, z, 'main', HP, 0, 0, 12);
}
function runBuilder(id, g) { MODELS[id](g); EXTRA[id]?.(g); muzzleBore(g, id); }

export function registerWeaponModel(id, fn) { MODELS[id] = fn; }

// ---------- versión detallada (Blender) ----------
const detailed = new Map();   // id -> [{part, mat, geometry}]
/** Registra las piezas detalladas de un arma (cargadas del GLB generado con Blender). */
export function setDetailedWeapon(id, pieces) { detailed.set(id, pieces); }
export function hasDetailedWeapons() { return detailed.size > 0; }

/** Crea el modelo de un arma con el acabado cosmético indicado. */
export function buildWeaponModel(id, finish = 'standard') {
  const key = MODELS[id] ? id : 'mk4';
  const tpl = detailed.get(key) || null;
  const g = new Gun(finish, !!tpl);
  runBuilder(key, g);
  const m = g.build(tpl);
  m.userData.weaponId = id;
  return m;
}

/** Recetas de todas las armas (para el script de Blender). */
export function weaponSpecs() {
  const out = {};
  for (const id of Object.keys(MODELS)) {
    const g = new Gun('standard', true);
    runBuilder(id, g);
    out[id] = { ops: g.ops, pivots: g.pivots || {} };
  }
  return out;
}

/** Libera la geometría propia (la detallada es compartida y se conserva). */
export function disposeWeaponModel(m) { m.traverse((o) => { if (o.geometry && !m.userData.detailed) o.geometry.dispose(); }); }
