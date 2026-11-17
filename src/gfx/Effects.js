// Efectos: partículas (humo, polvo, chispas, fuego), trazadoras, casquillos, impactos y fogonazos.
// Todo en reservas fijas (sin crear objetos durante el combate).
import * as THREE from 'three';
import { softSprite, smokeSprite, flashSprite } from './Textures.js';

const VERT = `
attribute vec4 aColor; attribute float aSize; varying vec4 vColor; uniform float uScale; uniform float uFog;
void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv;
  gl_PointSize=min(aSize*uScale/max(0.1,-mv.z), 420.0);
  float f=exp(-uFog*uFog*mv.z*mv.z); vColor=vec4(aColor.rgb, aColor.a*mix(0.25,1.0,f)); }`;
const FRAG = `
uniform sampler2D uMap; varying vec4 vColor;
void main(){ vec4 t=texture2D(uMap,gl_PointCoord); gl_FragColor=vec4(vColor.rgb*t.rgb, vColor.a*t.a); if(gl_FragColor.a<0.004) discard; }`;

class Particles {
  constructor(n, tex, additive) {
    this.n = n; this.cur = 0;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.a0 = new Float32Array(n);
    this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.rgb = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uScale: { value: 800 }, uFog: { value: 0.01 } }, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Points(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 11 : 10;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0) {
    const i = this.cur; this.cur = (i + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a;
    this.rgb[i * 3] = r; this.rgb[i * 3 + 1] = g; this.rgb[i * 3 + 2] = b; this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    const { pos, vel, life, max, col, size } = this;
    for (let i = 0; i < this.n; i++) {
      if (life[i] <= 0) { if (col[i * 4 + 3] !== 0) { col[i * 4 + 3] = 0; size[i] = 0; } continue; }
      life[i] -= dt;
      const k = 1 - Math.max(0, life[i]) / max[i], d = Math.max(0, 1 - this.drag[i] * dt);
      vel[i * 3] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d - this.grav[i] * dt; vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      col[i * 4] = this.rgb[i * 3]; col[i * 4 + 1] = this.rgb[i * 3 + 1]; col[i * 4 + 2] = this.rgb[i * 3 + 2];
      col[i * 4 + 3] = life[i] <= 0 ? 0 : this.a0[i] * (k < 0.1 ? k * 10 : 1 - (k - 0.1) / 0.9);
    }
    const a = this.mesh.geometry.attributes;
    a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = true;
  }
}

const SURF_FX = {
  concrete: { dust: [0.72, 0.7, 0.66], sparks: 2, chips: [0.6, 0.58, 0.55] },
  metal: { dust: [0.5, 0.5, 0.5], sparks: 9, chips: [1, 0.8, 0.4] },
  wood: { dust: [0.62, 0.48, 0.32], sparks: 0, chips: [0.55, 0.4, 0.25] },
  dirt: { dust: [0.45, 0.36, 0.26], sparks: 0, chips: [0.35, 0.28, 0.2] },
  glass: { dust: [0.85, 0.92, 0.95], sparks: 3, chips: [0.9, 0.95, 1] },
  energy: { dust: [0.3, 0.8, 1], sparks: 8, chips: [0.4, 0.9, 1] },
};

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _z = new THREE.Vector3(0, 0, 1);
const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

export class Effects {
  constructor(engine, world, mapDef) {
    this.engine = engine; this.world = world;
    const q = engine.q, scale = q.particles;
    this.group = new THREE.Group(); engine.scene.add(this.group);
    this.smoke = new Particles(Math.round(500 * scale), smokeSprite(), false);
    this.sparks = new Particles(Math.round(500 * scale), softSprite(), true);
    this.group.add(this.smoke.mesh, this.sparks.mesh);
    const fog = mapDef.env.fogDensity || 0.01;
    this.smoke.mat.uniforms.uFog.value = fog; this.sparks.mat.uniforms.uFog.value = fog * 0.5;
    this.dustColor = new THREE.Color(mapDef.env.dust ?? 0xffffff);
    this.indoor = !!mapDef.env.indoor;

    // Trazadoras
    this.tracers = [];
    const tg = new THREE.BoxGeometry(0.02, 0.02, 1);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false; this.group.add(m);
      this.tracers.push({ m, t: 0, dur: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), len: 1, beam: false });
    }
    this.tracerCur = 0;

    // Impactos de bala (calcomanías instanciadas)
    this.decalN = 180; this.decalCur = 0;
    const dm = new THREE.MeshBasicMaterial({ map: holeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dm, this.decalN);
    this.decals.frustumCulled = false; this.decals.count = 0; this.decals.renderOrder = 3;
    this.group.add(this.decals);

    // Casquillos
    this.shellN = 40; this.shellCur = 0;
    const sg = new THREE.CylinderGeometry(0.006, 0.006, 0.028, 6); sg.rotateX(Math.PI / 2);
    this.shellMesh = new THREE.InstancedMesh(sg, new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.3 }), this.shellN);
    this.shellMesh.frustumCulled = false; this.group.add(this.shellMesh);
    this.shells = [];
    for (let i = 0; i < this.shellN; i++) {
      this.shells.push({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0, big: 1 });
      _m.makeScale(0, 0, 0); this.shellMesh.setMatrixAt(i, _m);
    }

    // Fogonazos del mundo (bots / otros jugadores) + una única luz compartida
    this.flashes = [];
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashSprite(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffffff }));
      sp.visible = false; this.group.add(sp); this.flashes.push({ sp, t: 0 });
    }
    this.flashCur = 0;
    this.flashLight = new THREE.PointLight(0xffc27a, 0, 14, 1.6); this.group.add(this.flashLight);
    this.emitters = [];
    this.onShellLand = null;

    // Motas de polvo ambiental alrededor de la cámara
    const dn = Math.round(160 * scale), dg = new THREE.BufferGeometry(), dp = new Float32Array(dn * 3);
    for (let i = 0; i < dn * 3; i++) dp[i] = rnd(1);
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.motes = new THREE.Points(dg, new THREE.PointsMaterial({ map: softSprite(), size: 0.035, transparent: true, opacity: this.indoor ? 0.35 : 0.5, depthWrite: false,
      color: this.dustColor, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.motes.frustumCulled = false; this.motes.scale.set(9, 5, 9); this.group.add(this.motes);
  }

  setEmitters(list) { this.emitters = list; }

  /** Impacto en el mundo. n = normal de la superficie. */
  impact(x, y, z, nx, ny, nz, surf = 'concrete', energy = false, decal = true) {
    const fx = SURF_FX[energy ? 'energy' : surf] || SURF_FX.concrete, d = fx.dust;
    for (let i = 0; i < 4; i++) {
      this.smoke.emit(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, nx * (0.6 + Math.random()) + rnd(0.5), ny * (0.6 + Math.random()) + rnd(0.5) + 0.3, nz * (0.6 + Math.random()) + rnd(0.5),
        0.5 + Math.random() * 0.5, 0.15, 0.9 + Math.random() * 0.5, d[0], d[1], d[2], 0.34, -0.2, 2.2);
    }
    const c = fx.chips;
    for (let i = 0; i < fx.sparks; i++) {
      const sp = 3 + Math.random() * 5;
      this.sparks.emit(x, y, z, (nx + rnd(0.8)) * sp, (ny + rnd(0.8)) * sp + 1, (nz + rnd(0.8)) * sp, 0.12 + Math.random() * 0.25, 0.09, 0.02, c[0] * 2.2, c[1] * 2.2, c[2] * 2.2, 1, 9, 1);
    }
    for (let i = 0; i < 3; i++) {
      const sp = 1.5 + Math.random() * 2.5;
      this.smoke.emit(x, y, z, (nx + rnd(0.9)) * sp, (ny + rnd(0.9)) * sp + 1.2, (nz + rnd(0.9)) * sp, 0.5, 0.045, 0.03, c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 0.95, 9.8, 0.4);
    }
    if (decal && surf !== 'glass') this._decal(x, y, z, nx, ny, nz, energy);
  }

  _decal(x, y, z, nx, ny, nz, energy) {
    const i = this.decalCur; this.decalCur = (i + 1) % this.decalN;
    if (this.decals.count < this.decalN) this.decals.count++;
    _v.set(nx, ny, nz); _q.setFromUnitVectors(_z, _v);
    const s = energy ? 0.2 : 0.085 + Math.random() * 0.05;
    _m.compose(_v.set(x + nx * 0.006, y + ny * 0.006, z + nz * 0.006), _q, _s.set(s, s, s));
    this.decals.setMatrixAt(i, _m); this.decals.instanceMatrix.needsUpdate = true;
  }

  /** Impacto sobre un combatiente (polvo de tela/impacto; sin gore explícito). */
  hitBody(x, y, z, dx, dy, dz) {
    for (let i = 0; i < 5; i++) {
      this.smoke.emit(x, y, z, -dx * 1.2 + rnd(0.8), -dy + rnd(0.8) + 0.4, -dz * 1.2 + rnd(0.8), 0.3 + Math.random() * 0.25, 0.08, 0.5, 0.42, 0.08, 0.07, 0.5, 2, 3);
    }
  }

  tracer(from, to, color = 0xffe2a8, beam = false) {
    const t = this.tracers[this.tracerCur]; this.tracerCur = (this.tracerCur + 1) % this.tracers.length;
    t.from.copy(from); t.to.copy(to);
    const dist = from.distanceTo(to);
    t.beam = beam; t.t = 0; t.dist = dist;
    t.dur = beam ? 0.16 : Math.max(0.03, dist / 320);
    t.len = beam ? dist : Math.min(dist, 7);
    t.m.material.color.set(color).multiplyScalar(beam ? 3 : 2.2);
    t.m.visible = true;
    t.m.quaternion.setFromUnitVectors(_z, _v.subVectors(to, from).normalize());
    this._placeTracer(t);
  }
  _placeTracer(t) {
    const k = t.t / t.dur;
    if (t.beam) {
      t.m.position.lerpVectors(t.from, t.to, 0.5); t.m.scale.set(2.5 * (1 - k), 2.5 * (1 - k), t.dist); t.m.material.opacity = 1 - k;
    } else {
      const head = Math.min(t.dist, k * t.dist + t.len * 0.5), tail = Math.max(0, head - t.len), mid = (head + tail) / 2 / t.dist;
      t.m.position.lerpVectors(t.from, t.to, mid); t.m.scale.set(1, 1, Math.max(0.05, head - tail)); t.m.material.opacity = 0.85;
    }
  }

  muzzleFlash(pos, color = 0xffc27a, size = 0.5) {
    const f = this.flashes[this.flashCur]; this.flashCur = (this.flashCur + 1) % this.flashes.length;
    f.sp.position.copy(pos); f.sp.scale.setScalar(size * (0.8 + Math.random() * 0.5)); f.sp.material.rotation = Math.random() * 6.28;
    f.sp.material.color.set(color).multiplyScalar(2.2); f.sp.visible = true; f.t = 0.05;
    this.flashLight.position.copy(pos); this.flashLight.color.set(color); this.flashLight.intensity = 26;
    this.smoke.emit(pos.x, pos.y, pos.z, rnd(0.3), 0.4, rnd(0.3), 0.6, 0.1, 0.7, 0.6, 0.6, 0.6, 0.16, -0.3, 2);
  }
  /** Solo luz (para el fogonazo del arma del jugador, que se dibuja en la escena del arma). */
  lightPulse(pos, color = 0xffc27a, k = 1) { this.flashLight.position.copy(pos); this.flashLight.color.set(color); this.flashLight.intensity = 34 * k; }

  shell(pos, vel, big = 1) {
    const i = this.shellCur; this.shellCur = (i + 1) % this.shellN;
    const s = this.shells[i];
    s.p.copy(pos); s.v.copy(vel); s.life = 2.6; s.big = big; s.bounced = 0;
    s.w.set(rnd(18), rnd(18), rnd(18));
  }

  update(dt, t, cam) {
    // Emisores ambientales del mapa
    for (const e of this.emitters) {
      if (cam.position.distanceToSquared(_v.set(e.x, e.y, e.z)) > 75 * 75) continue;
      e.t -= dt;
      if (e.t > 0) continue;
      if (e.type === 'smoke') {
        e.t = 0.16;
        const g = 0.12 + Math.random() * 0.1;
        this.smoke.emit(e.x + rnd(0.3), e.y, e.z + rnd(0.3), 0.5 + rnd(0.2), 1.3 + Math.random() * 0.5, 0.25 + rnd(0.2), 7 + Math.random() * 3, 1.2, 9, g, g, g, 0.5, -0.03, 0.12);
      } else if (e.type === 'steam') {
        e.t = 0.07;
        this.smoke.emit(e.x + rnd(0.1), e.y, e.z + rnd(0.1), rnd(0.3), 2.2 + Math.random(), rnd(0.3), 1.4, 0.2, 2.2, 0.8, 0.9, 1, 0.22, -0.4, 1.2);
      } else if (e.type === 'fire') {
        e.t = 0.045;
        this.sparks.emit(e.x + rnd(0.35), e.y + 0.1, e.z + rnd(0.35), rnd(0.25), 1.1 + Math.random() * 0.9, rnd(0.25), 0.5 + Math.random() * 0.4, 0.9, 0.25, 2.4, 0.95 + Math.random() * 0.5, 0.22, 0.75, -0.6, 0.6);
        if (Math.random() < 0.25) this.sparks.emit(e.x + rnd(0.3), e.y + 0.4, e.z + rnd(0.3), rnd(0.8), 2 + Math.random() * 2, rnd(0.8), 1.2, 0.05, 0.02, 3, 1.4, 0.3, 1, -0.5, 0.3);
        if (Math.random() < 0.2) this.smoke.emit(e.x, e.y + 0.9, e.z, 0.4 + rnd(0.2), 1.4, rnd(0.2), 4, 0.6, 4, 0.08, 0.08, 0.08, 0.4, -0.05, 0.2);
      }
    }
    this.smoke.update(dt); this.sparks.update(dt);
    for (const tr of this.tracers) {
      if (!tr.m.visible) continue;
      tr.t += dt;
      if (tr.t >= tr.dur) { tr.m.visible = false; continue; }
      this._placeTracer(tr);
    }
    for (const f of this.flashes) if (f.sp.visible) { f.t -= dt; if (f.t <= 0) f.sp.visible = false; }
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 420);
    // Casquillos con rebote
    let any = false;
    for (let i = 0; i < this.shellN; i++) {
      const s = this.shells[i];
      if (s.life <= 0) continue;
      any = true; s.life -= dt;
      s.v.y -= 9.8 * dt; s.p.addScaledVector(s.v, dt);
      s.r.x += s.w.x * dt; s.r.y += s.w.y * dt; s.r.z += s.w.z * dt;
      const gy = this.world.groundAt(s.p.x, s.p.y + 0.3, s.p.z) + 0.008;
      if (s.p.y < gy) {
        s.p.y = gy;
        if (s.v.y < -0.8 && s.bounced < 3) { s.v.y *= -0.38; s.v.x *= 0.6; s.v.z *= 0.6; s.w.multiplyScalar(0.6); if (!s.bounced && this.onShellLand) this.onShellLand(s.p); s.bounced++; }
        else { s.v.set(0, 0, 0); s.w.set(0, 0, 0); s.r.x = 0; s.r.z = 0; }
      }
      const sc = s.life <= 0 ? 0 : s.big;
      _m.compose(s.p, _q.setFromEuler(s.r), _s.set(sc, sc, sc)); this.shellMesh.setMatrixAt(i, _m);
    }
    if (any) this.shellMesh.instanceMatrix.needsUpdate = true;
    // Motas de polvo: siguen a la cámara con envoltura
    this.motes.position.set(Math.round(cam.position.x / 3) * 3, cam.position.y + Math.sin(t * 0.2) * 0.3, Math.round(cam.position.z / 3) * 3);
    this.motes.rotation.y = t * 0.02;
  }

  dispose() {
    this.engine.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
  }
}

let _hole = null;
function holeTexture() {
  if (_hole) return _hole;
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  let gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(8,8,8,1)'); gr.addColorStop(0.22, 'rgba(15,14,12,0.95)'); gr.addColorStop(0.4, 'rgba(60,56,50,0.5)'); gr.addColorStop(1, 'rgba(60,56,50,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(10,10,10,0.5)'; g.lineWidth = 1;
  for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3, r = 12 + (i * 37 % 14); g.beginPath(); g.moveTo(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6); g.lineTo(32 + Math.cos(a + 0.2) * r, 32 + Math.sin(a + 0.2) * r); g.stroke(); }
  _hole = new THREE.CanvasTexture(c); _hole.colorSpace = THREE.SRGBColorSpace;
  return _hole;
}
