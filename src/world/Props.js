// Props 3D procedurales. Todas las piezas se fusionan por material => muy pocas draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMaterial } from '../gfx/Materials.js';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const geoCache = new Map();
function cylGeo(ratio, seg) {
  const k = `c${ratio.toFixed(2)}|${seg}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CylinderGeometry(ratio, 1, 1, seg));
  return geoCache.get(k);
}
function sphGeo(det) {
  const k = 's' + det;
  if (!geoCache.has(k)) {
    const g = new THREE.IcosahedronGeometry(1, det);
    geoCache.set(k, g);
  }
  return geoCache.get(k);
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class PropBatch {
  constructor() { this.byMat = new Map(); this.base = new THREE.Matrix4(); }
  setBase(x, y, z, ry = 0, s = 1) { this.base.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(s, s, s)); }
  add(geom, mat, color = 0xffffff) {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    g.applyMatrix4(_m);
    g.applyMatrix4(this.base);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(g);
  }
  _mat(x, y, z, sx, sy, sz, rx, ry, rz) { _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)); }
  /** Caja centrada en (x,y,z). */
  box(w, h, d, x, y, z, mat = 'flat', color = 0xffffff, rx = 0, ry = 0, rz = 0) { this._mat(x, y, z, w, h, d, rx, ry, rz); this.add(UNIT_BOX, mat, color); }
  /** Cilindro (rt = radio superior, rb = inferior) centrado. */
  cyl(rt, rb, h, x, y, z, mat = 'flat', color = 0xffffff, rx = 0, ry = 0, rz = 0, seg = 12) {
    this._mat(x, y, z, rb, h, rb, rx, ry, rz); this.add(cylGeo(rt / rb, seg), mat, color);
  }
  sph(r, x, y, z, mat = 'flat', color = 0xffffff, sx = 1, sy = 1, sz = 1, det = 1) { this._mat(x, y, z, r * sx, r * sy, r * sz, 0, 0, 0); this.add(sphGeo(det), mat, color); }
  build(texSize, shadows = true) {
    const out = [];
    for (const [mat, list] of this.byMat) {
      const g = mergeGeometries(list, false);
      list.forEach((x) => x.dispose());
      const mesh = new THREE.Mesh(g, typeof mat === 'string' ? getMaterial(mat, texSize) : mat);
      mesh.castShadow = shadows && mat !== 'darkglass'; mesh.receiveShadow = true;
      out.push(mesh);
    }
    this.byMat.clear();
    return out;
  }
}

function rng(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 16807 + 11) % 2147483647) / 2147483647); }
const H = Math.PI / 2;

function foliage(b, r, cx, cy, cz, rad, n, base = 0x6f9a48) {
  const g = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, e = (r() - 0.35) * Math.PI * 0.8, d = rad * (0.45 + r() * 0.55);
    const x = cx + Math.cos(a) * Math.cos(e) * d, y = cy + Math.sin(e) * d * 0.75, z = cz + Math.sin(a) * Math.cos(e) * d;
    const s = rad * (0.75 + r() * 0.6);
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(r() * 3, r() * 6.3, r() * 3)), _s.set(s, s, s));
    const k = 0.7 + r() * 0.5;
    b.add(g, 'leaf', _c.set(base).multiplyScalar(k).getHex());
  }
}

export const PROPS = {
  car(b, p) {
    const c = p.tint ?? 0x8a1f1a;
    b.box(4.2, 0.5, 1.78, 0, 0.58, 0, 'paint', c);
    b.box(1.15, 0.12, 1.7, 1.5, 0.86, 0, 'paint', c, 0, 0, -0.07);
    b.box(0.95, 0.12, 1.7, -1.6, 0.87, 0, 'paint', c, 0, 0, 0.05);
    b.box(2.0, 0.5, 1.6, -0.1, 1.13, 0, 'darkglass', 0x10161c);
    b.box(1.8, 0.06, 1.62, -0.1, 1.4, 0, 'paint', c);
    for (const x of [-0.95, 0.75]) b.box(0.07, 0.5, 1.64, x, 1.13, 0, 'paint', c);
    for (const [x, z] of [[1.35, 0.86], [1.35, -0.86], [-1.3, 0.86], [-1.3, -0.86]]) {
      b.cyl(0.34, 0.34, 0.24, x, 0.34, z, 'rubber', 0xffffff, H, 0, 0, 14);
      b.cyl(0.19, 0.19, 0.26, x, 0.34, z, 'chrome', 0xb8bcc0, H, 0, 0, 10);
    }
    b.box(0.06, 0.14, 0.4, 2.1, 0.66, 0.6, 'flat', 0xfff4d0); b.box(0.06, 0.14, 0.4, 2.1, 0.66, -0.6, 'flat', 0xfff4d0);
    b.box(0.06, 0.12, 0.4, -2.1, 0.7, 0.6, 'flat', 0x8a1010); b.box(0.06, 0.12, 0.4, -2.1, 0.7, -0.6, 'flat', 0x8a1010);
    b.box(0.2, 0.16, 1.8, 2.05, 0.38, 0, 'rubber'); b.box(0.2, 0.16, 1.8, -2.05, 0.38, 0, 'rubber');
  },
  van(b, p) {
    const c = p.tint ?? 0xd8d8d2;
    b.box(3.5, 1.75, 2.05, -0.8, 1.4, 0, 'paint', c);
    b.box(1.5, 1.0, 2.0, 1.8, 1.0, 0, 'paint', c);
    b.box(0.9, 0.7, 1.9, 1.55, 1.8, 0, 'darkglass', 0x10161c, 0, 0, -0.25);
    b.box(5.1, 0.25, 2.0, 0, 0.5, 0, 'rubber');
    for (const [x, z] of [[1.7, 1.0], [1.7, -1.0], [-1.6, 1.0], [-1.6, -1.0]]) {
      b.cyl(0.42, 0.42, 0.28, x, 0.42, z, 'rubber', 0xffffff, H, 0, 0, 14);
      b.cyl(0.22, 0.22, 0.3, x, 0.42, z, 'chrome', 0x9a9ea2, H, 0, 0, 10);
    }
    b.box(0.05, 0.16, 0.35, 2.56, 0.9, 0.7, 'flat', 0xfff4d0); b.box(0.05, 0.16, 0.35, 2.56, 0.9, -0.7, 'flat', 0xfff4d0);
    b.box(0.04, 1.5, 0.04, -2.56, 1.4, 0, 'rubber');
  },
  barrel(b, p) {
    const c = p.tint ?? 0x2b5c8a;
    b.cyl(0.31, 0.31, 0.93, 0, 0.47, 0, 'paint', c, 0, 0, 0, 16);
    for (const y of [0.03, 0.32, 0.62, 0.91]) b.cyl(0.325, 0.325, 0.04, 0, y, 0, 'paint', c, 0, 0, 0, 16);
    b.cyl(0.04, 0.04, 0.03, 0.18, 0.95, 0.05, 'chrome', 0x888888);
  },
  barrier(b) {
    b.box(3.0, 0.3, 0.6, 0, 0.15, 0, 'concrete', 0xc8c6c0);
    b.box(3.0, 0.68, 0.26, 0, 0.62, 0, 'concrete', 0xc8c6c0);
    b.box(3.0, 0.2, 0.42, 0, 0.36, 0, 'concrete', 0xc8c6c0);
    b.box(0.5, 0.12, 0.265, -0.9, 0.82, 0, 'flat', 0xd08a10); b.box(0.5, 0.12, 0.265, 0.9, 0.82, 0, 'flat', 0xd08a10);
  },
  sandbags(b, p, r) {
    for (let row = 0; row < 4; row++) {
      const n = row % 2 ? 3 : 4, y = 0.13 + row * 0.25, off = row % 2 ? 0.5 : 0;
      for (let i = 0; i < n; i++) {
        const x = -1.5 + off + (i + 0.5) * (3 / 4) + (r() - 0.5) * 0.06;
        b.sph(0.4, x, y, (r() - 0.5) * 0.08, 'fabric', 0x9a8a62, 1.0, 0.36, 0.9, 2);
      }
    }
  },
  dumpster(b, p) {
    const c = p.tint ?? 0x2f5a3c;
    b.box(2.2, 1.05, 1.2, 0, 0.62, 0, 'paint', c);
    b.box(2.26, 0.08, 1.26, 0, 1.2, 0, 'rubber', 0xffffff, 0.06, 0, 0);
    for (const x of [-1.05, 1.05]) b.box(0.06, 0.9, 1.22, x, 0.62, 0, 'paint', c);
    for (const [x, z] of [[-0.9, 0.5], [0.9, 0.5], [-0.9, -0.5], [0.9, -0.5]]) b.cyl(0.08, 0.08, 0.08, x, 0.06, z, 'rubber', 0xffffff, H);
    b.box(2.1, 0.1, 0.06, 0, 0.75, 0.62, 'paint', c);
  },
  lamp(b) {
    b.cyl(0.07, 0.1, 5, 0, 2.5, 0, 'paint', 0x3a3d40, 0, 0, 0, 8);
    b.cyl(0.16, 0.2, 0.3, 0, 0.15, 0, 'paint', 0x3a3d40, 0, 0, 0, 8);
    b.box(1.0, 0.07, 0.1, 0.45, 4.95, 0, 'paint', 0x3a3d40);
    b.box(0.5, 0.1, 0.24, 0.85, 4.88, 0, 'paint', 0x3a3d40);
  },
  tree(b, p, r) {
    const s = p.scale || 1, hT = 3.2 + r() * 1.2;
    b.cyl(0.16, 0.3, hT, 0, hT / 2, 0, 'bark', 0x6a5540, (r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.08, 8);
    for (let i = 0; i < 4; i++) {
      const a = r() * 6.28, l = 1.2 + r();
      b.cyl(0.04, 0.1, l, Math.cos(a) * l * 0.35, hT - 0.3 + l * 0.3, Math.sin(a) * l * 0.35, 'bark', 0x6a5540, Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8, 5);
    }
    const base = p.ghost ? 0x58804a : [0x6f9a48, 0x7fa650, 0x5f8c40][Math.floor(r() * 3)];
    foliage(b, r, 0, hT + 0.9, 0, 2.2 * s, p.ghost ? 26 : 42, base);
    foliage(b, r, 0.6, hT + 0.1, 0.4, 1.5 * s, p.ghost ? 8 : 16, base);
  },
  deadtree(b, p, r) {
    b.cyl(0.1, 0.26, 4, 0, 2, 0, 'bark', 0x3a332c, 0.04, 0, -0.05, 7);
    for (let i = 0; i < 6; i++) {
      const a = r() * 6.28, l = 1 + r() * 1.3, y = 2 + r() * 1.8;
      b.cyl(0.02, 0.07, l, Math.cos(a) * l * 0.4, y + l * 0.25, Math.sin(a) * l * 0.4, 'bark', 0x3a332c, Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0, 5);
    }
  },
  bush(b, p, r) { foliage(b, r, 0, 0.65, 0, 1.0, 26, 0x5f8a42); },
  tank(b, p) {
    const c = p.tint ?? 0x4d5440, d = 0x2a2c26;
    b.box(6.2, 0.75, 2.2, 0, 1.0, 0, 'gunmetal', c);
    b.box(1.4, 0.7, 2.2, 2.7, 0.85, 0, 'gunmetal', c, 0, 0, -0.5);
    b.box(6.3, 0.75, 0.55, 0, 0.42, 1.35, 'rubber', 0x2a2a2a); b.box(6.3, 0.75, 0.55, 0, 0.42, -1.35, 'rubber', 0x2a2a2a);
    for (let i = 0; i < 6; i++) for (const z of [1.36, -1.36]) b.cyl(0.36, 0.36, 0.58, -2.6 + i * 1.04, 0.4, z, 'gunmetal', d, H, 0, 0, 10);
    b.box(6.4, 0.08, 0.75, 0, 0.84, 1.35, 'gunmetal', c); b.box(6.4, 0.08, 0.75, 0, 0.84, -1.35, 'gunmetal', c);
    b.cyl(1.05, 1.25, 0.8, -0.2, 1.78, 0, 'gunmetal', c, 0, 0.5, 0, 8);
    b.cyl(0.09, 0.11, 3.4, 1.5, 1.72, 0.9, 'gunmetal', d, 0, -0.5, H + 0.12, 8);
    b.cyl(0.3, 0.3, 0.2, -0.5, 2.26, 0.2, 'gunmetal', c, 0, 0, 0, 10);
    b.box(0.9, 0.3, 0.6, -2.6, 1.5, 0.5, 'gunmetal', d);
  },
  cannon(b) {
    const c = 0x4d5440, d = 0x2a2c26;
    b.cyl(0.07, 0.1, 2.9, 0.7, 1.0, 0, 'gunmetal', d, 0, 0, H - 0.1, 8);
    b.box(0.1, 1.1, 1.8, 0.1, 0.95, 0, 'gunmetal', c, 0, 0, 0.12);
    b.box(0.9, 0.3, 0.4, -0.2, 0.75, 0, 'gunmetal', c);
    for (const z of [0.82, -0.82]) { b.cyl(0.45, 0.45, 0.14, 0, 0.45, z, 'rubber', 0xffffff, H, 0, 0, 14); b.cyl(0.2, 0.2, 0.16, 0, 0.45, z, 'gunmetal', c, H, 0, 0, 8); }
    b.box(1.6, 0.1, 0.12, -0.9, 0.35, 0.35, 'gunmetal', c, 0, 0.25, 0.2); b.box(1.6, 0.1, 0.12, -0.9, 0.35, -0.35, 'gunmetal', c, 0, -0.25, 0.2);
  },
  haystack(b, p, r) {
    b.cyl(1.0, 1.2, 1.0, 0, 0.5, 0, 'fabric', 0xc2a352, 0, 0, 0, 10);
    b.cyl(0.25, 1.0, 0.65, 0, 1.32, 0, 'fabric', 0xb8983f, 0, 0, 0, 10);
    for (let i = 0; i < 6; i++) b.box(0.5, 0.04, 0.04, (r() - 0.5) * 2.2, 0.05, (r() - 0.5) * 2.2, 'fabric', 0xc2a352, 0, r() * 3, 0);
  },
  cart(b) {
    const w = 0x6a4a2a;
    b.box(2.6, 0.1, 1.3, 0, 0.75, 0, 'wood', w);
    b.box(2.6, 0.45, 0.06, 0, 1.0, 0.65, 'wood', w); b.box(2.6, 0.45, 0.06, 0, 1.0, -0.65, 'wood', w);
    b.box(0.06, 0.45, 1.3, -1.3, 1.0, 0, 'wood', w);
    for (const z of [0.78, -0.78]) { b.cyl(0.55, 0.55, 0.08, 0.2, 0.55, z, 'wood', 0x4a3420, H, 0, 0, 14); b.cyl(0.1, 0.1, 0.14, 0.2, 0.55, z, 'gunmetal', 0x333333, H, 0, 0, 8); }
    b.box(1.6, 0.07, 0.07, 2.0, 0.55, 0.4, 'wood', w, 0, 0, -0.15); b.box(1.6, 0.07, 0.07, 2.0, 0.55, -0.4, 'wood', w, 0, 0, -0.15);
  },
  barbwire(b, p, r) {
    for (const x of [-1.4, 0, 1.4]) { b.box(0.07, 1.0, 0.07, x, 0.5, 0, 'wood', 0x5a4630, 0.5, 0, 0); b.box(0.07, 1.0, 0.07, x, 0.5, 0, 'wood', 0x5a4630, -0.5, 0, 0); }
    for (let i = 0; i < 5; i++) {
      const y = 0.25 + i * 0.15, z = (i % 2 ? 1 : -1) * (0.3 - i * 0.05);
      b.box(3.0, 0.012, 0.012, 0, y, z, 'chrome', 0x5a5a58, 0, 0, (r() - 0.5) * 0.06);
    }
    for (let i = 0; i < 10; i++) b.cyl(0.26, 0.26, 0.012, -1.35 + i * 0.3, 0.55, 0, 'chrome', 0x5a5a58, 0, 0, H, 10);
  },
  well(b) {
    b.cyl(0.8, 0.8, 0.9, 0, 0.45, 0, 'stone', 0xffffff, 0, 0, 0, 12);
    b.cyl(0.6, 0.6, 0.92, 0, 0.46, 0, 'rubber', 0x050505, 0, 0, 0, 12);
    b.box(0.1, 1.6, 0.1, -0.7, 1.5, 0, 'wood', 0x5a4630); b.box(0.1, 1.6, 0.1, 0.7, 1.5, 0, 'wood', 0x5a4630);
    b.box(1.9, 0.08, 0.9, 0, 2.45, 0.3, 'roof', 0xffffff, 0.5, 0, 0); b.box(1.9, 0.08, 0.9, 0, 2.45, -0.3, 'roof', 0xffffff, -0.5, 0, 0);
    b.cyl(0.05, 0.05, 1.5, 0, 1.9, 0, 'wood', 0x4a3420, 0, 0, H, 6);
  },
  pallets(b) {
    for (let k = 0; k < 6; k++) {
      const y = k * 0.15;
      for (let i = 0; i < 5; i++) b.box(1.2, 0.025, 0.14, 0, y + 0.135, -0.43 + i * 0.215, 'wood', 0xa0825a);
      for (const x of [-0.55, 0, 0.55]) b.box(0.1, 0.1, 1.0, x, y + 0.06, 0, 'wood', 0x8a6e4a);
    }
  },
  console(b) {
    b.box(1.8, 0.8, 0.7, 0, 0.4, 0, 'scifiPanel', 0xc8d0dc);
    b.box(1.8, 0.06, 0.8, 0, 0.9, 0.05, 'scifiDark', 0xffffff, 0.35, 0, 0);
    b.box(1.5, 0.02, 0.5, 0, 0.95, 0.04, EM(0x35d6ff, 1.4), 0xffffff, 0.35, 0, 0);
    b.box(1.82, 0.04, 0.04, 0, 0.2, 0.36, EM(0xff8a2a, 1.6));
  },
  rack(b, p, r) {
    b.box(1.0, 2.2, 1.0, 0, 1.1, 0, 'scifiDark');
    for (let i = 0; i < 9; i++) {
      b.box(0.82, 0.16, 0.02, 0, 0.3 + i * 0.21, 0.505, 'scifiPanel', 0x8a94a2);
      const c = r() > 0.3 ? 0x3affa0 : r() > 0.5 ? 0xff8a2a : 0x35d6ff;
      b.box(0.03, 0.03, 0.02, -0.3 + r() * 0.6, 0.3 + i * 0.21, 0.52, EM(c, 2.2));
      b.box(0.03, 0.03, 0.02, -0.3 + r() * 0.6, 0.33 + i * 0.21, 0.52, EM(0x3affa0, 2.2));
    }
  },
  holotable(b) {
    b.cyl(1.0, 0.7, 0.75, 0, 0.38, 0, 'scifiDark', 0xffffff, 0, 0, 0, 8);
    b.cyl(1.05, 1.05, 0.12, 0, 0.82, 0, 'scifiPanel', 0xc8d0dc, 0, 0, 0, 8);
    b.cyl(0.8, 0.8, 0.02, 0, 0.89, 0, EM(0x35d6ff, 1.6), 0xffffff, 0, 0, 0, 24);
  },
  pod(b) {
    b.cyl(0.6, 0.6, 0.3, 0, 0.15, 0, 'scifiDark', 0xffffff, 0, 0, 0, 14);
    b.cyl(0.6, 0.6, 0.3, 0, 2.25, 0, 'scifiDark', 0xffffff, 0, 0, 0, 14);
    b.cyl(0.5, 0.5, 1.8, 0, 1.2, 0, 'glass', 0xffffff, 0, 0, 0, 14);
    b.cyl(0.2, 0.2, 1.7, 0, 1.2, 0, EM(0x3affa0, 0.9), 0xffffff, 0, 0, 0, 8);
  },
  fcrate(b) {
    b.box(1.4, 1.1, 1.4, 0, 0.55, 0, 'scifiPanel', 0x8e98a8);
    for (const [x, z] of [[0.66, 0.66], [-0.66, 0.66], [0.66, -0.66], [-0.66, -0.66]]) b.box(0.12, 1.14, 0.12, x, 0.57, z, 'scifiDark');
    b.box(1.42, 0.05, 0.3, 0, 0.75, 0.56, EM(0xff8a2a, 1.3)); b.box(1.42, 0.05, 0.3, 0, 0.75, -0.56, EM(0xff8a2a, 1.3));
  },
  generator(b) {
    b.box(2.4, 1.3, 1.4, 0, 0.75, 0, 'metal', 0x9aa08a);
    b.box(2.5, 0.12, 1.5, 0, 0.06, 0, 'rubber');
    b.cyl(0.08, 0.08, 0.5, 0.8, 1.65, 0.3, 'gunmetal', 0x333333, 0, 0, 0, 8);
    b.box(0.8, 0.5, 0.03, -0.5, 0.9, 0.71, 'rubber', 0x151515);
    b.box(0.1, 0.06, 0.03, -0.2, 1.2, 0.72, EM(0x3affa0, 2));
  },
  dropship(b) {
    const c = 0x6a7484;
    b.box(7.4, 1.9, 3.2, 0, 1.65, 0, 'scifiPanel', c);
    b.box(2.0, 1.3, 2.6, 4.4, 1.5, 0, 'scifiPanel', c, 0, 0, -0.25);
    b.box(1.6, 0.7, 2.2, 4.3, 2.15, 0, 'darkglass', 0x0c1820, 0, 0, -0.5);
    b.box(3.0, 0.25, 9.5, -0.6, 2.5, 0, 'scifiDark');
    for (const z of [4.4, -4.4]) { b.cyl(0.75, 0.75, 1.5, -0.6, 2.4, z, 'scifiDark', 0xffffff, 0, 0, 0, 12); b.cyl(0.55, 0.55, 0.1, -0.6, 1.62, z, EM(0x35d6ff, 2), 0xffffff, 0, 0, 0, 12); }
    for (const [x, z] of [[2.5, 1.2], [2.5, -1.2], [-2.6, 1.2], [-2.6, -1.2]]) b.cyl(0.1, 0.14, 0.7, x, 0.35, z, 'gunmetal', 0x444444, 0, 0, 0, 6);
    b.box(1.6, 0.9, 0.3, -4.2, 1.1, 0, 'scifiDark', 0xffffff, 0, 0, 0.5);
    b.box(7.42, 0.08, 0.1, 0, 1.3, 1.61, EM(0xff8a2a, 1.4)); b.box(7.42, 0.08, 0.1, 0, 1.3, -1.61, EM(0xff8a2a, 1.4));
  },
  crater(b, p, r) {
    b.cyl(1.8, 2.3, 0.06, 0, 0.03, 0, 'mud', 0x6a6050, 0, r() * 3, 0, 12);
    b.cyl(1.0, 1.5, 0.05, 0, 0.065, 0, 'mud', 0x2a2620, 0, r() * 3, 0, 10);
    for (let i = 0; i < 7; i++) { const a = r() * 6.28, d = 1.4 + r() * 1.2; b.sph(0.1 + r() * 0.16, Math.cos(a) * d, 0.05, Math.sin(a) * d, 'stone', 0x8a8274, 1, 0.6, 1, 0); }
  },
};

// Material emisivo en línea para detalles de props
import { emissiveMaterial } from '../gfx/Materials.js';
function EM(color, strength) { return emissiveMaterial(color, strength); }

export function buildProp(batch, p, index) {
  const fn = PROPS[p.type];
  if (!fn) return false;
  batch.setBase(p.x, p.y, p.z, (p.q || 0) * Math.PI / 2, 1);
  fn(batch, p, rng(index * 7 + 3));
  return true;
}
