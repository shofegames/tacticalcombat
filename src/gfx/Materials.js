// Fábrica de materiales PBR con caché. Los materiales texturizados usan color de vértice como tinte.
import * as THREE from 'three';
import { getTextureSet, TILE } from './Textures.js';

const cache = new Map();
const FLAT = {
  // materiales sin textura para props (tinte por vértice)
  paint: { roughness: 0.38, metalness: 0.55 },
  flat: { roughness: 0.8, metalness: 0.0 },
  rubber: { roughness: 0.92, metalness: 0.0, color: 0x101012 },
  chrome: { roughness: 0.18, metalness: 1.0 },
  darkglass: { roughness: 0.08, metalness: 0.6, color: 0x0c1218 },
};

export function getMaterial(name, texSize = 512) {
  const key = name + '|' + texSize;
  if (cache.has(key)) return cache.get(key);
  let m;
  if (name === 'glass') {
    m = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, transparent: true, opacity: 0.22, roughness: 0.04, metalness: 0.3,
      envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide });
  } else if (FLAT[name]) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, ...FLAT[name] });
  } else if (name === 'leaf') {
    m = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true });
  } else {
    const t = getTextureSet(name, texSize);
    m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, metalnessMap: t.roughnessMap,
      roughness: 1, metalness: 1, vertexColors: true });
    m.normalScale.set(1.1, 1.1);
    if (t.emissiveMap) { m.emissiveMap = t.emissiveMap; m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = name === 'facade' ? 1.6 : 2.4; }
    if (name === 'concreteDark') m.color.setHex(0x8a8d92);
    if (name === 'mud' || name === 'asphalt') m.envMapIntensity = 0.6;
  }
  m.name = name;
  cache.set(key, m);
  return m;
}

const emCache = new Map();
/** Material emisivo HDR (alimenta el bloom). */
export function emissiveMaterial(color, strength) {
  const key = color + '|' + strength;
  if (!emCache.has(key)) {
    const c = new THREE.Color(color);
    if (strength > 0.2) c.multiplyScalar(1 + strength * 2.2);
    const m = strength > 0.2 ? new THREE.MeshBasicMaterial({ color: c }) : new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
    emCache.set(key, m);
  }
  return emCache.get(key);
}

let _leaf = null;
function leafTexture() {
  if (_leaf) return _leaf;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, y = rnd() * S, r = 7 + rnd() * 11, a = rnd() * Math.PI;
    const d = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
    if (d > 0.95) continue;
    const l = 150 + rnd() * 90;
    g.fillStyle = `rgb(${l * 0.82 | 0},${l | 0},${l * 0.62 | 0})`;
    g.beginPath(); g.ellipse(x, y, r, r * 0.42, a, 0, 7); g.fill();
    g.strokeStyle = 'rgba(40,60,20,0.5)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
  }
  _leaf = new THREE.CanvasTexture(c); _leaf.colorSpace = THREE.SRGBColorSpace; _leaf.anisotropy = 4;
  return _leaf;
}

export function disposeMaterials() {
  for (const m of cache.values()) m.dispose();
  for (const m of emCache.values()) m.dispose();
  cache.clear(); emCache.clear();
}
export { TILE };
