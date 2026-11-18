// Motor de render: WebGL2 + postprocesado (bloom, tonemapping ACES, viñeta, grano), niveles de calidad
// y dos pasadas de escena (mundo + arma en primera persona, que nunca atraviesa paredes).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { store, QUALITY_ORDER } from './Settings.js';
import { setAnisotropy } from '../gfx/Textures.js';

const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uDamage: { value: 0 }, uVig: { value: 0.55 }, uGrain: { value: 0.035 },
    uDesat: { value: 0 }, uCA: { value: 0.0022 }, uFlash: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime,uDamage,uVig,uGrain,uDesat,uCA,uFlash; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+uTime*7.13)*43758.5453); }
    void main(){
      vec2 d=vUv-0.5; float r2=dot(d,d);
      vec3 c; c.r=texture2D(tDiffuse,vUv+d*uCA*r2*4.0).r; c.g=texture2D(tDiffuse,vUv).g; c.b=texture2D(tDiffuse,vUv-d*uCA*r2*4.0).b;
      float l=dot(c,vec3(.299,.587,.114)); c=mix(c,vec3(l),uDesat);
      c*=1.0-uVig*smoothstep(0.12,0.75,r2);
      c+=(h(gl_FragCoord.xy)-0.5)*uGrain;
      c=mix(c,vec3(0.6,0.03,0.02),clamp(uDamage,0.,1.)*smoothstep(0.04,0.42,r2));
      c=mix(c,vec3(1.0),uFlash);
      gl_FragColor=vec4(c,1.0);
    }`,
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.08, 700);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    // Escena del arma en primera persona (FOV propio, profundidad independiente)
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 20);
    this.vmScene.add(this.vmCamera);
    this.fx = FinalShader.uniforms;
    this.time = 0; this.fps = 60; this._acc = 0; this._frames = 0;
    // rendimiento adaptativo: escala de resolución dinámica (0.6–1) y bajada automática de calidad
    this.dynScale = 1; this.adaptive = false; this._win = 0; this._winFrames = 0; this._good = 0; this._bad = 0; this._sf = 0;
    this.onAutoQuality = null;
    this.updaters = [];
    this.running = false;
    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.applyQuality();
    addEventListener('resize', () => this.resize());
    store.onChange((k) => { if (k === 'quality') this.applyQuality(); else if (k === 'dynamicRes') { this.dynScale = 1; this.resize(); } });
    this._tick = this._tick.bind(this);
  }

  applyQuality() {
    const q = store.quality;
    this.q = q;
    setAnisotropy(Math.min(q.aniso, this.maxAniso));
    this.renderer.shadowMap.enabled = q.shadows > 0;
    this.renderer.shadowMap.autoUpdate = (q.shadowEvery || 1) <= 1;
    this.renderer.shadowMap.needsUpdate = true;
    if (this.composer) { this.composer.dispose(); this.composer = null; }
    if (q.post) {
      const size = new THREE.Vector2(innerWidth, innerHeight);
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
      const c = new EffectComposer(this.renderer, rt);
      c.addPass(new RenderPass(this.scene, this.camera));
      const vm = new RenderPass(this.vmScene, this.vmCamera);
      vm.clear = false; vm.clearDepth = true;
      c.addPass(vm);
      if (q.bloom) { this.bloom = new UnrealBloomPass(size, 0.32, 0.55, 0.92); c.addPass(this.bloom); }
      c.addPass(new OutputPass());
      this.finalPass = new ShaderPass(FinalShader);
      this.finalPass.uniforms = this.fx;
      this.finalPass.material.uniforms = this.fx;
      c.addPass(this.finalPass);
      this.composer = c;
    }
    this.resize();
    this.scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => { x.needsUpdate = true; }); } });
    if (this.onQuality) this.onQuality(q);
  }

  resize() {
    const w = innerWidth, h = innerHeight, q = this.q;
    const pr = Math.min(devicePixelRatio || 1, q.prCap) * q.scale * (store.settings.dynamicRes ? this.dynScale : 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = this.vmCamera.aspect = w / h;
    this.camera.updateProjectionMatrix(); this.vmCamera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
  }

  setBloom(strength) { if (this.bloom) this.bloom.strength = 0.32 * strength; }

  start() { if (!this.running) { this.running = true; this._last = performance.now(); requestAnimationFrame(this._tick); } }

  _tick(now) {
    if (!this.running) return;
    requestAnimationFrame(this._tick);
    const raw = (now - this._last) / 1000;
    this._last = now;
    const dt = Math.min(raw, 0.05);
    this.time += dt;
    this._acc += raw; this._frames++;
    if (this._acc >= 0.5) { this.fps = Math.round(this._frames / this._acc); this._acc = 0; this._frames = 0; }
    this._win += raw; this._winFrames++;
    if (this._win >= 1) { this._adapt(this._winFrames / this._win); this._win = 0; this._winFrames = 0; }
    for (const u of this.updaters) u(dt, this.time);
    this.render();
  }

  /** Ajuste automático cada segundo: baja la resolución si faltan FPS, la sube si sobran; en último caso, baja la calidad. */
  _adapt(fps) {
    if (!this.adaptive || document.hidden) { this._good = this._bad = 0; return; }
    const s = store.settings;
    if (s.dynamicRes) {
      if (fps < 50 && this.dynScale > 0.6) { this.dynScale = Math.max(0.6, Math.round((this.dynScale - 0.1) * 100) / 100); this._good = 0; this.resize(); }
      else if (fps >= 57) { if (++this._good >= 4 && this.dynScale < 1) { this.dynScale = Math.min(1, Math.round((this.dynScale + 0.05) * 100) / 100); this._good = 0; this.resize(); } }
      else this._good = 0;
    }
    if (s.autoQuality) {
      const atMin = !s.dynamicRes || this.dynScale <= 0.6;
      if (fps < 40 && atMin) {
        if (++this._bad >= 4) {
          this._bad = 0;
          const i = QUALITY_ORDER.indexOf(s.quality);
          if (i > 0) { const nq = QUALITY_ORDER[i - 1]; this.dynScale = 0.85; store.set('quality', nq); this.onAutoQuality?.(nq); }
        }
      } else this._bad = 0;
    }
  }

  /**
   * Compila de antemano todos los materiales (también los de objetos ocultos: trazadoras, fogonazos,
   * granadas…) y dibuja un fotograma, para que la partida no se congele la primera vez que aparecen.
   */
  async warmup() {
    const hidden = [];
    for (const sc of [this.scene, this.vmScene]) sc.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try {
      if (this.renderer.compileAsync) { await this.renderer.compileAsync(this.scene, this.camera); await this.renderer.compileAsync(this.vmScene, this.vmCamera); }
      else { this.renderer.compile(this.scene, this.camera); this.renderer.compile(this.vmScene, this.vmCamera); }
      this.renderer.shadowMap.needsUpdate = true;
      this.render();
    } finally { for (const o of hidden) o.visible = false; }
    this.renderer.shadowMap.needsUpdate = true;
    this.render();
  }

  render() {
    const r = this.renderer;
    r.info.reset();
    this.fx.uTime.value = this.time;
    if (r.shadowMap.enabled && !r.shadowMap.autoUpdate && (this._sf = (this._sf + 1) % (this.q.shadowEvery || 1)) === 0) r.shadowMap.needsUpdate = true;
    if (this.composer) this.composer.render();
    else {
      r.setRenderTarget(null);
      r.clear();
      r.render(this.scene, this.camera);
      r.clearDepth();
      r.render(this.vmScene, this.vmCamera);
    }
  }
}
