// Motor de render: WebGL2 + postprocesado (bloom, tonemapping ACES, viñeta, grano), niveles de calidad
// y dos pasadas de escena (mundo + arma en primera persona, que nunca atraviesa paredes).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { store } from './Settings.js';
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
    this.updaters = [];
    this.running = false;
    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.applyQuality();
    addEventListener('resize', () => this.resize());
    store.onChange((k) => { if (k === 'quality') this.applyQuality(); });
    this._tick = this._tick.bind(this);
  }

  applyQuality() {
    const q = store.quality;
    this.q = q;
    setAnisotropy(Math.min(q.aniso, this.maxAniso));
    this.renderer.shadowMap.enabled = q.shadows > 0;
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
    const pr = Math.min(devicePixelRatio || 1, q.prCap) * q.scale;
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
    for (const u of this.updaters) u(dt, this.time);
    this.render();
  }

  render() {
    const r = this.renderer;
    r.info.reset();
    this.fx.uTime.value = this.time;
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
