// Carga las armas detalladas (generadas con Blender: npm run armas) y las registra en WeaponModels.
// Si el archivo falta o falla la carga, el juego sigue con las armas de primitivas.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import weaponsUrl from '../assets/weapons.glb?url';
import { setDetailedWeapon } from './WeaponModels.js';

let promise = null;

export function loadWeaponAssets() {
  if (promise) return promise;
  promise = new Promise((resolve) => {
    new GLTFLoader().load(weaponsUrl, (gltf) => {
      const byId = new Map();
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const [id, part, mat] = o.name.split('__');
        if (!id || !part || !mat) return;
        const geo = o.geometry;
        if (!o.matrixWorld.equals(new THREE.Matrix4())) geo.applyMatrix4(o.matrixWorld);
        geo.computeBoundingSphere();
        if (!byId.has(id)) byId.set(id, []);
        byId.get(id).push({ part, mat, geometry: geo });
      });
      for (const [id, pieces] of byId) setDetailedWeapon(id, pieces);
      resolve(byId.size);
    }, undefined, (err) => { console.warn('Armas detalladas no disponibles; se usan las básicas.', err); resolve(0); });
  });
  return promise;
}
