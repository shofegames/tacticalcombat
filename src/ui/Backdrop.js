// Fondo animado del menú: un mapa real renderizado con una cámara orbital lenta.
import * as THREE from 'three';
import { getMapDef } from '../../shared/maps/index.js';
import { MapRenderer } from '../world/MapRenderer.js';
import { disposeMaterials } from '../gfx/Materials.js';
import { disposeTextures } from '../gfx/Textures.js';
import { store } from '../core/Settings.js';

const _d = new THREE.Vector3();
const VIEWS = {
  modern: { r: 34, y: 13, look: 2 },
  historic: { r: 32, y: 11, look: 3 },
  futuristic: { r: 30, y: 12, look: 4 },
};

export class Backdrop {
  constructor(engine) { this.engine = engine; this.mr = null; this.a = Math.random() * 6.28; this.ready = false; this.dead = false; }

  load(mapId) {
    this.map = mapId; this.view = VIEWS[mapId] || VIEWS.modern;
    this.loading = (async () => {
      const def = getMapDef(mapId), world = def.buildCollision();
      const mr = new MapRenderer(this.engine);
      await mr.build(def, world);
      if (this.dead) { mr.dispose(); return; }
      this.mr = mr; this.ready = true;
      const cam = this.engine.camera; cam.fov = store.settings.fov; cam.updateProjectionMatrix();
      this.update(0, 0);
      mr.updateLights(cam.position, true);
    })();
    return this.loading;
  }

  update(dt, t) {
    if (!this.ready) return;
    const v = this.view, cam = this.engine.camera;
    this.a += dt * 0.035;
    cam.position.set(Math.cos(this.a) * v.r, v.y + Math.sin(this.a * 0.7) * 1.5, Math.sin(this.a) * v.r);
    cam.lookAt(0, v.look, 0);
    cam.updateMatrixWorld();
    cam.getWorldDirection(_d);
    this.mr.update(dt, t, cam.position, _d);
  }

  async dispose() {
    this.dead = true;
    try { await this.loading; } catch { /* ignorado */ }
    if (this.mr) { this.mr.dispose(); this.mr = null; disposeMaterials(); disposeTextures(); }
    this.ready = false;
  }
}
