// Convierte una definición de mapa (datos) en escena 3D optimizada:
// geometría estática fusionada por material y sector, cielo + mapa de entorno, sol con sombras,
// reserva fija de luces puntuales reasignadas a las más cercanas, y props fusionados.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getMaterial, emissiveMaterial, TILE } from '../gfx/Materials.js';
import { clearNoiseCache } from '../gfx/Textures.js';
import { PropBatch, buildProp } from './Props.js';

const SECTOR = 32;
const DYNAMIC = new Set(['smoke', 'steam', 'fire', 'holo', 'core']);

class GeoBuf {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
  quad(a, b, c, d, nx, ny, nz, uv, col) {
    const k = this.p.length / 3;
    this.p.push(...a, ...b, ...c, ...d);
    for (let j = 0; j < 4; j++) { this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); }
    this.u.push(...uv);
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  tri(a, b, c, nx, ny, nz, uv, col) {
    const k = this.p.length / 3;
    this.p.push(...a, ...b, ...c);
    for (let j = 0; j < 3; j++) { this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); }
    this.u.push(...uv);
    this.i.push(k, k + 1, k + 2);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

const _col = new THREE.Color();
function tintOf(t, jitter) {
  if (t == null) _col.setRGB(1, 1, 1); else _col.set(t);
  const k = 0.94 + jitter * 0.12;
  return [_col.r * k, _col.g * k, _col.b * k];
}

function addBox(buf, b, floorY) {
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, y0 = b.y, y1 = b.y + b.h, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
  const T = TILE[b.mat] || 3, fit = b.mat === 'crate';
  const col = tintOf(b.tint, ((Math.abs(b.x * 13.7 + b.z * 7.3 + b.y * 3.1)) % 1));
  const uv = (ua, va, ub, vb) => fit ? [0, 0, 1, 0, 1, 1, 0, 1] : [ua / T, va / T, ub / T, va / T, ub / T, vb / T, ua / T, vb / T];
  // +X, -X
  buf.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, uv(-z1, y0, -z0, y1), col);
  buf.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, uv(z0, y0, z1, y1), col);
  // +Y, -Y
  buf.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, uv(x0, -z1, x1, -z0), col);
  if (y0 > floorY + 0.02) buf.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0, uv(x0, z0, x1, z1), col);
  // +Z, -Z
  buf.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, uv(x0, y0, x1, y1), col);
  buf.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, uv(-x1, y0, -x0, y1), col);
}

function addWedge(buf, w) {
  // Se construye para '+x' y se rota según dir
  const T = TILE[w.mat] || 3, col = tintOf(w.tint, 0.5);
  const alongX = w.dir === '+x' || w.dir === '-x', L = alongX ? w.w : w.d, W = alongX ? w.d : w.w, s = (w.dir === '+x' || w.dir === '+z') ? 1 : -1;
  const P = (l, y, t) => alongX ? [w.x + s * l, w.y + y, w.z + t * s] : [w.x - t * s, w.y + y, w.z + s * l];
  const a0 = P(-L / 2, 0, -W / 2), a1 = P(-L / 2, 0, W / 2), b0 = P(L / 2, 0, -W / 2), b1 = P(L / 2, 0, W / 2), c0 = P(L / 2, w.h, -W / 2), c1 = P(L / 2, w.h, W / 2);
  const len = Math.hypot(L, w.h), ny = L / len, nl = -w.h / len;
  const nrm = alongX ? [s * nl, ny, 0] : [0, ny, s * nl];
  buf.quad(a1, c1, c0, a0, nrm[0], nrm[1], nrm[2], [0, 0, len / T, 0, len / T, W / T, 0, W / T], col);
  const back = alongX ? [s, 0, 0] : [0, 0, s];
  buf.quad(b1, b0, c0, c1, back[0], back[1], back[2], [0, 0, W / T, 0, W / T, w.h / T, 0, w.h / T], col);
  const side = alongX ? [0, 0, s] : [-s, 0, 0];
  buf.tri(a1, b1, c1, side[0], side[1], side[2], [0, 0, L / T, 0, L / T, w.h / T], col);
  buf.tri(b0, a0, c0, -side[0], -side[1], -side[2], [0, 0, L / T, 0, 0, w.h / T], col);
}

export class MapRenderer {
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    this.anim = [];        // objetos animados (holos, núcleo)
    this.emitters = [];    // emisores de humo/vapor/fuego para el sistema de partículas
    this.lightDefs = [];
    this.pool = [];
    this._lt = 0;
  }

  /** Construcción progresiva (cede el hilo entre pasos para pintar la barra de carga). */
  async build(def, world, onProgress = () => {}) {
    const eng = this.engine, q = eng.q, scene = eng.scene;
    this.def = def;
    const step = async (p, label) => { onProgress(p, label); await new Promise((r) => setTimeout(r, 0)); };
    scene.add(this.group);

    // ---- 1. Geometría estática por material y sector ----
    await step(0.05, 'Generando texturas PBR');
    const bufs = new Map(), glass = new GeoBuf(), ems = new Map();
    const mats = new Set();
    for (const b of def.boxes) {
      if (!b.visual) continue;
      if (b.mat === 'glass') { addBox(glass, b, -1e9); continue; }
      if (b.mat === 'em') {
        const k = (b.tint ?? 0xffffff) + '|' + b.em;
        if (!ems.has(k)) ems.set(k, { buf: new GeoBuf(), tint: b.tint ?? 0xffffff, em: b.em });
        addBox(ems.get(k).buf, { ...b, tint: null }, -1e9); continue;
      }
      const big = Math.max(b.w, b.d) > SECTOR * 1.5;
      const key = b.mat + '|' + (big ? 'big' : Math.floor(b.x / SECTOR) + ',' + Math.floor(b.z / SECTOR));
      if (!bufs.has(key)) bufs.set(key, { buf: new GeoBuf(), mat: b.mat });
      addBox(bufs.get(key).buf, b, def.floorY);
      mats.add(b.mat);
    }
    for (const w of def.wedges) {
      const key = w.mat + '|' + Math.floor(w.x / SECTOR) + ',' + Math.floor(w.z / SECTOR);
      if (!bufs.has(key)) bufs.set(key, { buf: new GeoBuf(), mat: w.mat });
      addWedge(bufs.get(key).buf, w);
      mats.add(w.mat);
    }
    let i = 0;
    for (const m of mats) { getMaterial(m, q.tex); await step(0.05 + 0.45 * (++i / mats.size), 'Generando texturas PBR'); }
    await step(0.52, 'Construyendo geometría');
    for (const { buf, mat } of bufs.values()) {
      const mesh = new THREE.Mesh(buf.build(), getMaterial(mat, q.tex));
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
    for (const e of ems.values()) {
      const mesh = new THREE.Mesh(e.buf.build(), emissiveMaterial(e.tint, e.em));
      mesh.matrixAutoUpdate = false; this.group.add(mesh);
    }
    if (glass.p.length) {
      const mesh = new THREE.Mesh(glass.build(), getMaterial('glass'));
      mesh.renderOrder = 5; mesh.matrixAutoUpdate = false; this.group.add(mesh);
    }

    // ---- 2. Props (fusionados) ----
    await step(0.6, 'Colocando props');
    const batch = new PropBatch();
    def.props.forEach((p, idx) => {
      if (DYNAMIC.has(p.type)) {
        if (p.type === 'holo') this._holo(p); else if (p.type === 'core') this._core(p);
        else this.emitters.push({ type: p.type, x: p.x, y: p.y, z: p.z, t: Math.random() });
        return;
      }
      buildProp(batch, p, idx);
    });
    this._scatterGrass(batch, def, world, q);
    await step(0.7, 'Colocando props');
    for (const mesh of batch.build(q.tex)) { mesh.matrixAutoUpdate = false; this.group.add(mesh); }

    // ---- 3. Cielo, entorno e iluminación ----
    await step(0.8, 'Iluminación y atmósfera');
    const env = def.env, pm = new THREE.PMREMGenerator(eng.renderer);
    this.sunDir = new THREE.Vector3();
    if (env.sky) {
      const sky = new Sky(); sky.scale.setScalar(4000);
      const u = sky.material.uniforms;
      u.turbidity.value = env.sky.turbidity; u.rayleigh.value = env.sky.rayleigh; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.82;
      const phi = THREE.MathUtils.degToRad(90 - env.sky.elevation), theta = THREE.MathUtils.degToRad(env.sky.azimuth);
      this.sunDir.setFromSphericalCoords(1, phi, theta);
      u.sunPosition.value.copy(this.sunDir);
      this.group.add(sky); this.sky = sky;
      const tmp = new THREE.Scene(); const s2 = sky.clone(); tmp.add(s2);
      this.envRT = pm.fromScene(tmp, 0.02);
      scene.background = null;
      eng.renderer.setClearColor(env.fog, 1);
    } else {
      this.sunDir.set(...(env.sunDir || [0.3, 1, 0.2])).normalize();
      this.envRT = pm.fromScene(new RoomEnvironment(), 0.04);
      scene.background = new THREE.Color(env.background ?? 0x05070c);
      eng.renderer.setClearColor(env.background ?? 0x05070c, 1);
    }
    pm.dispose();
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = env.indoor ? 0.35 : 0.75;
    eng.vmScene.environment = this.envRT.texture;
    eng.vmScene.environmentIntensity = env.indoor ? 0.6 : 0.9;
    scene.fog = new THREE.FogExp2(env.fog, env.fogDensity);
    eng.renderer.toneMappingExposure = env.exposure ?? 1;
    eng.setBloom(env.bloom ?? 1);

    this.hemi = new THREE.HemisphereLight(env.ambient, env.indoor ? 0x1a2230 : 0x4a4238, env.ambientIntensity);
    this.sun = new THREE.DirectionalLight(env.sunColor, env.sunIntensity);
    this.sun.position.copy(this.sunDir).multiplyScalar(120);
    this.group.add(this.hemi, this.sun, this.sun.target);
    if (q.shadows) {
      const s = this.sun.shadow, R = env.indoor ? 34 : 48;
      this.sun.castShadow = true;
      s.mapSize.set(q.shadows, q.shadows);
      s.camera.left = -R; s.camera.right = R; s.camera.top = R; s.camera.bottom = -R; s.camera.near = 1; s.camera.far = 260;
      s.bias = -0.0004; s.normalBias = 0.045;
      this.shadowR = R;
    }
    // Luces del arma en primera persona (misma dirección del sol)
    this.vmHemi = new THREE.HemisphereLight(env.ambient, 0x30302c, env.ambientIntensity * 1.1);
    this.vmSun = new THREE.DirectionalLight(env.sunColor, env.sunIntensity * 0.8);
    eng.vmScene.add(this.vmHemi, this.vmSun, this.vmSun.target);

    // Reserva fija de luces puntuales (el número de luces nunca cambia => sin recompilar shaders)
    this.lightDefs = def.lights.map((l) => ({ ...l, pos: new THREE.Vector3(l.x, l.y, l.z) }));
    const n = Math.min(q.lights, this.lightDefs.length);
    for (let k = 0; k < n; k++) { const pl = new THREE.PointLight(0xffffff, 0, 10, 1.8); this.pool.push(pl); this.group.add(pl); }
    this.updateLights(new THREE.Vector3(0, 0, 0), true);

    await step(0.92, 'Compilando shaders');
    clearNoiseCache();
    try { eng.renderer.compile(scene, eng.camera); } catch { /* opcional */ }
    await step(1, 'Listo');
  }

  _scatterGrass(batch, def, world, q) {
    if (!def.boxes.some((b) => b.mat === 'grass')) return;
    const n = Math.round(1700 * q.particles), b = def.bounds, g = new THREE.PlaneGeometry(1, 1);
    let seed = 99; const r = () => ((seed = (seed * 16807 + 7) % 2147483647) / 2147483647);
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), qq = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
    batch.base.identity();
    for (let i = 0; i < n; i++) {
      const x = b.minx + r() * (b.maxx - b.minx), z = b.minz + r() * (b.maxz - b.minz);
      const gy = world.groundAt(x, 0.5, z, 0.3);
      if (Math.abs(gy) > 0.01 || world.overlap(x - 0.3, 0.05, z - 0.3, x + 0.3, 0.6, z + 0.3, 7)) continue;
      const sc = 0.5 + r() * 0.5, a = r() * 3.14;
      for (let k = 0; k < 2; k++) {
        m.compose(p.set(x, sc * 0.42, z), qq.setFromEuler(e.set(0, a + k * 1.57, 0)), s.set(sc * 1.1, sc * 0.9, 1));
        const gg = g.clone().applyMatrix4(m), col = new Float32Array(12);
        c.setRGB(0.5 + r() * 0.2, 0.62 + r() * 0.2, 0.3).toArray(col, 0); col.copyWithin(3, 0, 3); col.copyWithin(6, 0, 6);
        gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const nn = gg.toNonIndexed();
        // normales hacia arriba: iluminación suave de la hierba
        const na = nn.attributes.normal; for (let j = 0; j < na.count; j++) na.setXYZ(j, 0, 1, 0);
        if (!batch.byMat.has('leaf')) batch.byMat.set('leaf', []);
        batch.byMat.get('leaf').push(nn);
        gg.dispose();
      }
    }
  }

  _holo(p) {
    const g = new THREE.Group(); g.position.set(p.x, p.y, p.z);
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x35d6ff).multiplyScalar(2), wireframe: true, transparent: true, opacity: 0.7 });
    const a = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), m), b = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.01, 6, 40), m);
    b.rotation.x = 1.2; g.add(a, b);
    this.group.add(g);
    this.anim.push((dt, t) => { a.rotation.y += dt * 0.6; a.rotation.x += dt * 0.25; b.rotation.z += dt * 0.9; g.position.y = p.y + 0.5 + Math.sin(t * 1.3) * 0.06; });
  }

  _core(p) {
    const g = new THREE.Group(); g.position.set(p.x, p.y, p.z);
    const shell = getMaterial('scifiDark', this.engine.q.tex);
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x35d6ff).multiplyScalar(3.2) });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 11.5, 20), glow); col.position.y = 5.75; g.add(col);
    for (const y of [0.5, 3.2, 6.2, 9.2, 11]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.7, 8), shell); ring.position.y = y; ring.castShadow = true;
      const c = ring.geometry.attributes.position.count, colr = new Float32Array(c * 3).fill(1);
      ring.geometry.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      g.add(ring);
    }
    const rings = [];
    for (let k = 0; k < 3; k++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(2.0 + k * 0.25, 0.05, 8, 48), glow); t.position.y = 2 + k * 3.2; t.rotation.x = Math.PI / 2; g.add(t); rings.push(t);
    }
    this.group.add(g);
    this.anim.push((dt, t) => {
      const k = 2.6 + Math.sin(t * 2.2) * 0.5 + Math.sin(t * 13) * 0.08;
      glow.color.setRGB(0.21 * k, 0.84 * k, 1.0 * k);
      rings.forEach((r, i) => { r.position.y = 1.5 + ((t * 0.9 + i * 3.4) % 10); r.rotation.z = t * (0.4 + i * 0.2); });
    });
  }

  /** Reasigna la reserva de luces a las fuentes más cercanas (con fundido). */
  updateLights(pos, instant = false) {
    const defs = this.lightDefs;
    if (!this.pool.length) return;
    for (const d of defs) d.d2 = d.pos.distanceToSquared(pos);
    defs.sort((a, b) => a.d2 - b.d2);
    for (let k = 0; k < this.pool.length; k++) {
      const pl = this.pool[k], d = defs[k];
      if (pl.userData.def !== d) {
        pl.userData.def = d; pl.position.copy(d.pos); pl.color.set(d.color); pl.distance = d.dist;
        pl.userData.target = d.intensity; if (!instant) pl.intensity = 0;
      }
      if (instant) pl.intensity = d.intensity;
    }
  }

  update(dt, t, camPos, camDir) {
    this._lt -= dt;
    if (this._lt <= 0) { this._lt = 0.3; this.updateLights(camPos); }
    for (const pl of this.pool) { const tg = pl.userData.target ?? 0; pl.intensity += (tg - pl.intensity) * Math.min(1, dt * 6); }
    for (const a of this.anim) a(dt, t);
    if (this.sun.castShadow) {
      // La cámara de sombras sigue al jugador, alineada a téxeles para evitar parpadeo
      const R = this.shadowR, cx = camPos.x + camDir.x * R * 0.45, cz = camPos.z + camDir.z * R * 0.45;
      const tex = (2 * R) / this.sun.shadow.mapSize.x * 4;
      const sx = Math.round(cx / tex) * tex, sz = Math.round(cz / tex) * tex;
      this.sun.target.position.set(sx, 0, sz);
      this.sun.position.set(sx, 0, sz).addScaledVector(this.sunDir, 130);
      this.sun.target.updateMatrixWorld();
    }
    if (this.sky) this.sky.position.copy(camPos);
    // el sol del arma se expresa en espacio de cámara
    _v.copy(this.sunDir).applyQuaternion(_qi.copy(this.engine.camera.quaternion).invert());
    this.vmSun.position.copy(_v).multiplyScalar(10);
  }

  /** Luz ambiental local (interiores más oscuros) para el arma en primera persona. */
  setViewLight(k) { this.vmSun.intensity = this.def.env.sunIntensity * 0.8 * k; this.vmHemi.intensity = this.def.env.ambientIntensity * (0.75 + 0.35 * k); }

  dispose() {
    const eng = this.engine;
    eng.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    eng.vmScene.remove(this.vmHemi, this.vmSun, this.vmSun.target);
    if (this.envRT) this.envRT.dispose();
    eng.scene.environment = null; eng.vmScene.environment = null; eng.scene.fog = null;
  }
}
const _v = new THREE.Vector3(), _qi = new THREE.Quaternion();
