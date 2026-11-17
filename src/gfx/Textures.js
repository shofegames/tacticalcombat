// Texturas PBR procedurales (albedo + normal + rugosidad/metal) generadas en tiempo de carga.
// No hay ficheros de imagen: todo se sintetiza con ruido fractal teselable y patrones.
import * as THREE from 'three';

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1274126177) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const sm = (t) => t * t * (3 - 2 * t);
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;

/** Ruido fractal teselable precalculado: Float32Array S*S en [0,1]. */
const fbmCache = new Map();
function fbm(S, freq, oct, seed) {
  const key = `${S}|${freq}|${oct}|${seed}`;
  if (fbmCache.has(key)) return fbmCache.get(key);
  const out = new Float32Array(S * S);
  let amp = 1, tot = 0, f = freq;
  for (let o = 0; o < oct; o++) {
    const lat = new Float32Array(f * f);
    for (let i = 0; i < f * f; i++) lat[i] = hash(i % f, (i / f) | 0, seed + o * 17);
    const sc = f / S;
    for (let y = 0; y < S; y++) {
      const fy = y * sc, y0 = Math.floor(fy), ty = sm(fy - y0), ya = (y0 % f) * f, yb = ((y0 + 1) % f) * f;
      for (let x = 0; x < S; x++) {
        const fx = x * sc, x0 = Math.floor(fx), tx = sm(fx - x0), xa = x0 % f, xb = (x0 + 1) % f;
        out[y * S + x] += amp * mix(mix(lat[ya + xa], lat[ya + xb], tx), mix(lat[yb + xa], lat[yb + xb], tx), ty);
      }
    }
    tot += amp; amp *= 0.5; f *= 2;
    if (f > S) break;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  fbmCache.set(key, out);
  return out;
}

// Cada generador: (u,v ∈ [0,1), i=índice de píxel, N=ruidos) -> escribe en o: r,g,b (0..1), h (altura), ro (rugosidad), me (metal), em (emisión)
const hex = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const shade = (o, c, k) => { o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; };
const gap = (t, n, w) => { const f = (t * n) % 1; return Math.min(f, 1 - f) < w / 2; };           // junta fina en rejilla
const cellId = (t, n) => Math.floor(t * n);

const GEN = {
  concrete(u, v, i, N, o) {
    const a = N[0][i], b = N[1][i], c = N[2][i];
    const crack = Math.abs(N[3][i] - 0.5) < 0.012 && a > 0.52 ? 1 : 0;
    const k = 0.5 + a * 0.22 + (b - 0.5) * 0.16 - crack * 0.22 - (c > 0.72 ? 0.07 : 0);
    shade(o, [1, 0.985, 0.96], k);
    o.h = b * 0.5 + a * 0.3 - crack * 0.8; o.ro = 0.86 + (b - 0.5) * 0.15;
  },
  sidewalk(u, v, i, N, o) {
    GEN.concrete(u, v, i, N, o);
    const j = gap(u, 4, 0.02) || gap(v, 4, 0.02);
    const id = hash(cellId(u, 4), cellId(v, 4), 7);
    const k = j ? 0.55 : 0.92 + id * 0.16;
    o.r *= k * 1.12; o.g *= k * 1.12; o.b *= k * 1.1; if (j) o.h -= 0.7;
  },
  asphalt(u, v, i, N, o) {
    const a = N[0][i], b = N[1][i], sp = N[4][i];
    const k = 0.13 + a * 0.07 + (sp > 0.6 ? (sp - 0.6) * 0.5 : 0) - (Math.abs(N[3][i] - 0.5) < 0.008 ? 0.06 : 0);
    shade(o, [1, 1, 1.04], k);
    o.h = sp * 0.6 + b * 0.2; o.ro = 0.9 - a * 0.25;
  },
  brick(u, v, i, N, o) {
    const rows = 16, cols = 8, row = cellId(v, rows), uu = u + (row % 2) * 0.5 / cols;
    const mortar = gap(v, rows, 0.14) || gap(uu, cols, 0.05);
    const id = hash(cellId(uu, cols) % cols, row, 3), a = N[1][i], b = N[0][i];
    if (mortar) { shade(o, [0.62, 0.6, 0.56], 0.8 + a * 0.3); o.h = 0.15 + a * 0.1; o.ro = 0.95; return; }
    const c = [mix(0.48, 0.62, id), mix(0.2, 0.3, hash(row, cellId(uu, cols), 9)), 0.17];
    shade(o, c, 0.75 + a * 0.35 - (b > 0.6 ? 0.12 : 0));
    o.h = 0.7 + a * 0.3; o.ro = 0.82 + a * 0.1;
  },
  plaster(u, v, i, N, o) {
    const a = N[0][i], b = N[1][i], st = N[2][i];
    const drip = clamp((N[5][i] - 0.55) * 3) * clamp(1 - v * 1.2);
    shade(o, [0.82, 0.79, 0.72], 0.82 + a * 0.2 - drip * 0.25 - (st > 0.7 ? 0.08 : 0));
    o.h = b * 0.35 + a * 0.2; o.ro = 0.9;
  },
  facade(u, v, i, N, o) {
    // 3 ventanas x 2 plantas por tesela; la emisión enciende algunas ventanas
    const cx = (u * 3) % 1, cy = (v * 2) % 1, id = hash(cellId(u, 3), cellId(v, 2), 11), a = N[0][i];
    const win = cx > 0.2 && cx < 0.8 && cy > 0.22 && cy < 0.78;
    const frame = !win && cx > 0.16 && cx < 0.84 && cy > 0.18 && cy < 0.82;
    if (win) {
      const mull = Math.abs(cx - 0.5) < 0.012 || Math.abs(cy - 0.52) < 0.012;
      const lit = id > 0.72 ? 1 : 0;
      shade(o, mull ? [0.2, 0.2, 0.2] : [0.1, 0.14, 0.2], 0.6 + a * 0.5 + (1 - cy) * 0.3);
      o.h = mull ? 0.5 : 0.2; o.ro = mull ? 0.6 : 0.12; o.me = mull ? 0 : 0.4;
      if (lit && !mull) { o.em = 0.55 + hash(cellId(u, 3), cellId(v, 2), 5) * 0.4; }
    } else {
      shade(o, [0.78, 0.76, 0.72], (frame ? 0.62 : 0.8) + a * 0.2 - (gap(v, 2, 0.012) ? 0.2 : 0));
      o.h = frame ? 0.75 : 0.9; o.ro = 0.88;
    }
  },
  stone(u, v, i, N, o) {
    // mampostería irregular (celdas tipo Voronoi baratas con desplazamiento por ruido)
    const w = N[0][i], rows = 9, row = cellId(v + (w - 0.5) * 0.03, rows);
    const cols = 4 + (row % 3), uu = u + hash(row, 0, 2) + (N[1][i] - 0.5) * 0.02;
    const mortar = gap(v + (w - 0.5) * 0.03, rows, 0.16) || gap(uu, cols, 0.07);
    const id = hash(cellId(uu, cols) % cols, row, 5), a = N[1][i];
    if (mortar) { shade(o, [0.45, 0.43, 0.39], 0.7 + a * 0.3); o.h = 0.1; o.ro = 0.95; return; }
    shade(o, [mix(0.5, 0.66, id), mix(0.48, 0.62, id), mix(0.42, 0.54, id)], 0.7 + a * 0.4 + (N[4][i] - 0.5) * 0.2);
    o.h = 0.6 + a * 0.4 + id * 0.15; o.ro = 0.9;
  },
  tile(u, v, i, N, o) {
    const j = gap(u, 8, 0.03) || gap(v, 8, 0.03), id = hash(cellId(u, 8), cellId(v, 8), 3), a = N[1][i];
    shade(o, [0.72, 0.7, 0.66], j ? 0.4 : 0.78 + id * 0.12 + a * 0.12);
    o.h = j ? 0.1 : 0.8; o.ro = j ? 0.9 : 0.42 + a * 0.2;
  },
  roof(u, v, i, N, o) {
    const rows = 10, row = cellId(v, rows), fv = (v * rows) % 1, uu = u + (row % 2) * 0.05;
    const fu = (uu * 10) % 1, a = N[1][i], id = hash(cellId(uu, 10) % 10, row, 4);
    const k = 0.55 + Math.sin(fu * Math.PI) * 0.3 - fv * 0.25 + a * 0.2;
    shade(o, [mix(0.5, 0.62, id), 0.24 + id * 0.06, 0.18], k);
    o.h = Math.sin(fu * Math.PI) * 0.7 + (1 - fv) * 0.3; o.ro = 0.85;
  },
  metal(u, v, i, N, o) {
    const j = gap(u, 2, 0.012) || gap(v, 2, 0.012), a = N[1][i], sc = N[5][i], b = N[0][i];
    const riv = (((u * 2) % 1) < 0.06 || ((u * 2) % 1) > 0.94 || ((v * 2) % 1) < 0.06 || ((v * 2) % 1) > 0.94) &&
      Math.hypot(((u * 16) % 1) - 0.5, ((v * 16) % 1) - 0.5) < 0.2;
    const wear = b > 0.68 ? 1 : 0;
    shade(o, [0.62, 0.64, 0.66], (j ? 0.4 : 0.72) + a * 0.14 + (sc - 0.5) * 0.1 + (riv ? 0.12 : 0) - wear * 0.1);
    o.h = j ? 0 : riv ? 1 : 0.6; o.ro = 0.42 + a * 0.25 + wear * 0.25; o.me = 0.85;
  },
  rust(u, v, i, N, o) {
    const rib = Math.sin(u * Math.PI * 2 * 14), a = N[0][i], b = N[1][i], r = clamp((N[2][i] - 0.48) * 4 + (1 - v) * 0.2 - 0.1);
    const base = [0.66, 0.68, 0.7], ru = [0.42, 0.22, 0.12];
    const k = 0.62 + rib * 0.16 + b * 0.14;
    o.r = mix(base[0], ru[0], r) * k; o.g = mix(base[1], ru[1], r) * k; o.b = mix(base[2], ru[2], r) * k;
    o.h = rib * 0.5 + 0.5 + a * 0.05; o.ro = mix(0.45, 0.92, r); o.me = mix(0.8, 0.15, r);
  },
  container(u, v, i, N, o) {
    const rib = Math.sin(u * Math.PI * 2 * 10), b = N[1][i], r = clamp((N[2][i] - 0.6) * 5);
    const k = 0.74 + rib * 0.17 + b * 0.1 - (gap(v, 1, 0.03) ? 0.25 : 0);
    o.r = mix(1, 0.5, r) * k; o.g = mix(1, 0.3, r) * k; o.b = mix(1, 0.2, r) * k;
    o.h = clamp(rib * 2, -1, 1) * 0.5 + 0.5; o.ro = 0.5 + r * 0.4 + b * 0.1; o.me = 0.5 - r * 0.4;
  },
  wood(u, v, i, N, o) {
    const pl = cellId(u, 4), id = hash(pl, 1, 8), g = N[6][i], a = N[1][i];
    const j = gap(u, 4, 0.02);
    const grain = Math.sin((v * 3 + g * 2.2 + id * 9) * 22) * 0.5 + 0.5;
    shade(o, [0.42 + id * 0.1, 0.29 + id * 0.06, 0.17], j ? 0.3 : 0.62 + grain * 0.26 + a * 0.2);
    o.h = j ? 0 : 0.6 + grain * 0.3; o.ro = 0.78;
  },
  planks(u, v, i, N, o) {
    const pl = cellId(v, 6), id = hash(pl, 2, 8), g = N[6][i], a = N[1][i];
    const uu = u + id, j = gap(v, 6, 0.03) || gap(uu, 2, 0.008);
    const grain = Math.sin((u * 3 + g * 2 + id * 7) * 26) * 0.5 + 0.5;
    shade(o, [0.6 + id * 0.1, 0.47 + id * 0.07, 0.31], j ? 0.25 : 0.6 + grain * 0.22 + a * 0.22);
    o.h = j ? 0 : 0.6 + grain * 0.3; o.ro = 0.8;
  },
  crate(u, v, i, N, o) {
    GEN.planks(u, v, i, N, o);
    const e = Math.min(u, 1 - u, v, 1 - v), d1 = Math.abs(u - v), d2 = Math.abs(u + v - 1);
    const frame = e < 0.09 || Math.min(d1, d2) < 0.05;
    if (frame) { o.r *= 0.72; o.g *= 0.7; o.b *= 0.66; o.h += 0.5; }
    const nail = e > 0.03 && e < 0.06 && Math.hypot(((u * 8) % 1) - 0.5, ((v * 8) % 1) - 0.5) < 0.12;
    if (nail) { shade(o, [0.3, 0.3, 0.32], 1); o.me = 0.8; o.ro = 0.4; }
  },
  dirt(u, v, i, N, o) {
    const a = N[0][i], b = N[1][i], p = N[4][i];
    shade(o, [0.42, 0.34, 0.24], 0.6 + a * 0.4 + (b - 0.5) * 0.25 + (p > 0.66 ? 0.14 : 0));
    o.h = a * 0.5 + b * 0.3 + (p > 0.66 ? 0.3 : 0); o.ro = 0.95;
  },
  mud(u, v, i, N, o) {
    const a = N[0][i], b = N[1][i], wet = clamp((N[2][i] - 0.5) * 5);
    shade(o, [0.3, 0.24, 0.17], 0.55 + a * 0.4 + (b - 0.5) * 0.2 - wet * 0.18);
    o.h = a * 0.6 + b * 0.2 - wet * 0.3; o.ro = mix(0.95, 0.25, wet);
  },
  grass(u, v, i, N, o) {
    const a = N[0][i], b = N[4][i], c = N[2][i], bare = clamp((c - 0.62) * 6);
    const g = [mix(0.2, 0.34, a), mix(0.3, 0.44, b), 0.13];
    o.r = mix(g[0], 0.4, bare) * (0.7 + b * 0.5); o.g = mix(g[1], 0.33, bare) * (0.7 + b * 0.5); o.b = mix(g[2], 0.22, bare) * (0.7 + b * 0.5);
    o.h = b * 0.8 + a * 0.2 - bare * 0.3; o.ro = 0.95;
  },
  sandbag(u, v, i, N, o) {
    const rows = 4, row = cellId(v, rows), uu = u + (row % 2) * 0.25, fu = (uu * 2) % 1, fv = (v * rows) % 1;
    const bulge = Math.sin(fu * Math.PI) ** 0.5 * Math.sin(fv * Math.PI) ** 0.5, a = N[1][i];
    const weave = (Math.sin(u * 400) * Math.sin(v * 400)) * 0.05;
    shade(o, [0.6, 0.53, 0.38], 0.35 + bulge * 0.55 + a * 0.15 + weave);
    o.h = bulge; o.ro = 0.97;
  },
  hedge(u, v, i, N, o) {
    const a = N[4][i], b = N[1][i], c = N[0][i];
    shade(o, [0.16 + c * 0.1, 0.3 + b * 0.16, 0.1], 0.45 + a * 0.9);
    o.h = a; o.ro = 0.9;
  },
  scifiPanel(u, v, i, N, o) {
    const j = gap(u, 2, 0.016) || gap(v, 2, 0.016), a = N[1][i], id = hash(cellId(u, 2), cellId(v, 2), 3);
    const inset = Math.abs(((u * 2) % 1) - 0.5) < 0.3 && Math.abs(((v * 2) % 1) - 0.5) < 0.12 && id > 0.45;
    shade(o, [0.6, 0.64, 0.7], (j ? 0.25 : inset ? 0.6 : 0.8) + a * 0.1);
    o.h = j ? 0 : inset ? 0.4 : 0.8; o.ro = 0.34 + a * 0.2; o.me = 0.75;
  },
  scifiFloor(u, v, i, N, o) {
    const j = gap(u, 4, 0.02) || gap(v, 4, 0.02), a = N[1][i];
    const tread = (Math.sin((u + v) * Math.PI * 64) > 0.55 || Math.sin((u - v) * Math.PI * 64) > 0.55) ? 1 : 0;
    const id = hash(cellId(u, 4), cellId(v, 4), 6);
    shade(o, [0.36, 0.39, 0.44], (j ? 0.3 : 0.72 + id * 0.12) + tread * 0.12 + a * 0.12);
    o.h = j ? 0 : 0.5 + tread * 0.5; o.ro = 0.4 + a * 0.2 - tread * 0.08; o.me = 0.7;
  },
  scifiDark(u, v, i, N, o) {
    const j = gap(u, 2, 0.02) || gap(v, 4, 0.02), a = N[1][i];
    shade(o, [0.17, 0.19, 0.23], (j ? 0.4 : 0.9) + a * 0.2);
    o.h = j ? 0 : 0.7; o.ro = 0.45 + a * 0.2; o.me = 0.7;
  },
  scifiWall(u, v, i, N, o) {
    const a = N[1][i], fv = v, band = fv > 0.3 && fv < 0.36;
    const j = gap(u, 2, 0.012) || Math.abs(fv - 0.62) < 0.006 || Math.abs(fv - 0.12) < 0.006;
    const vent = fv > 0.7 && fv < 0.9 && ((u * 2) % 1) > 0.3 && ((u * 2) % 1) < 0.7 && Math.sin(fv * 380) > 0;
    shade(o, [0.55, 0.59, 0.66], (j ? 0.25 : vent ? 0.3 : fv < 0.12 ? 0.5 : 0.78) + a * 0.1);
    o.h = j ? 0 : vent ? 0.2 : 0.8; o.ro = 0.4 + a * 0.2; o.me = 0.7;
    if (band) { shade(o, [0.2, 0.84, 1], 0.5); o.em = 0.9; o.ro = 0.3; o.me = 0; }
  },
  hazard(u, v, i, N, o) {
    const s = ((u + v) * 6) % 1 < 0.5, a = N[1][i], w = N[0][i] > 0.62 ? 0.7 : 1;
    shade(o, s ? [0.95, 0.72, 0.1] : [0.09, 0.09, 0.1], (0.75 + a * 0.2) * w);
    o.h = 0.5; o.ro = 0.6; o.me = 0.3;
  },
  camo(u, v, i, N, o) {
    const a = N[0][i], b = N[2][i], c = N[5][i];
    const col = a > 0.56 ? [0.2, 0.24, 0.14] : b > 0.55 ? [0.36, 0.32, 0.22] : c > 0.55 ? [0.12, 0.13, 0.1] : [0.3, 0.34, 0.2];
    shade(o, col, 0.85 + N[1][i] * 0.3); o.h = N[1][i]; o.ro = 0.92;
  },
  fabric(u, v, i, N, o) {
    const w = (Math.sin(u * 600) * Math.sin(v * 600)) * 0.08;
    shade(o, [1, 1, 1], 0.78 + w + N[1][i] * 0.2); o.h = 0.5 + w * 3; o.ro = 0.95;
  },
  gunmetal(u, v, i, N, o) {
    const a = N[1][i], s = N[5][i];
    shade(o, [1, 1, 1], 0.82 + a * 0.14 + (s - 0.5) * 0.12); o.h = a * 0.3 + s * 0.2; o.ro = 0.34 + a * 0.3; o.me = 0.9;
  },
  polymer(u, v, i, N, o) {
    const a = N[1][i], st = ((Math.sin(u * 300) + Math.sin(v * 300)) > 1.2) ? 1 : 0;
    shade(o, [1, 1, 1], 0.86 + a * 0.12); o.h = st * 0.6 + a * 0.2; o.ro = 0.62 + a * 0.2;
  },
  gunwood(u, v, i, N, o) {
    const g = N[6][i], a = N[1][i], grain = Math.sin((v * 2 + g * 3) * 30) * 0.5 + 0.5;
    shade(o, [0.5, 0.29, 0.14], 0.6 + grain * 0.35 + a * 0.15); o.h = grain * 0.4; o.ro = 0.5 + grain * 0.15;
  },
};
GEN.concreteDark = GEN.concrete;

// metros de mundo por tesela
export const TILE = {
  concrete: 4, concreteDark: 4, sidewalk: 6, asphalt: 6, brick: 2.4, plaster: 4, facade: 7.25, stone: 2.6, tile: 4, roof: 3,
  metal: 2, rust: 2.4, container: 2.44, wood: 1.6, planks: 2, crate: 1, dirt: 5, mud: 5, grass: 7, sandbag: 1.3, hedge: 2.5,
  scifiPanel: 2, scifiFloor: 4, scifiDark: 3, scifiWall: 4.2, hazard: 3,
};

const cache = new Map();
let anisotropy = 4;
export function setAnisotropy(a) { anisotropy = a; }

/** Devuelve {map, normalMap, roughnessMap(+metal), emissiveMap|null}. */
export function getTextureSet(name, S = 512) {
  const key = name + '|' + S;
  if (cache.has(key)) return cache.get(key);
  const gen = GEN[name] || GEN.concrete;
  const seed = [...name].reduce((p, c) => p * 31 + c.charCodeAt(0), 7) & 1023;
  const N = [fbm(S, 4, 6, seed + 1), fbm(S, 32, 4, seed + 2), fbm(S, 3, 4, seed + 3), fbm(S, 5, 5, seed + 4),
    fbm(S, 64, 2, seed + 5), fbm(S, 8, 5, seed + 6), fbm(S, 6, 3, seed + 7)];
  const alb = new Uint8ClampedArray(S * S * 4), orm = new Uint8ClampedArray(S * S * 4), H = new Float32Array(S * S);
  let em = null;
  const o = { r: 0, g: 0, b: 0, h: 0, ro: 0.8, me: 0, em: 0 };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x, p = i * 4;
      o.me = 0; o.em = 0; o.ro = 0.8; o.h = 0.5;
      gen(x / S, 1 - y / S, i, N, o);
      alb[p] = o.r * 255; alb[p + 1] = o.g * 255; alb[p + 2] = o.b * 255; alb[p + 3] = 255;
      orm[p] = 255; orm[p + 1] = clamp(o.ro) * 255; orm[p + 2] = clamp(o.me) * 255; orm[p + 3] = 255;
      H[i] = o.h;
      if (o.em > 0) {
        if (!em) em = new Uint8ClampedArray(S * S * 4);
        em[p] = o.r * 255 * o.em * 2.2; em[p + 1] = o.g * 255 * o.em * 2.2; em[p + 2] = o.b * 255 * o.em * 2.2; em[p + 3] = 255;
        if (name === 'facade') { em[p] = 255 * o.em; em[p + 1] = 214 * o.em; em[p + 2] = 150 * o.em; }
      }
    }
  }
  // Mapa de normales a partir de la altura (Sobel, teselable)
  const nrm = new Uint8ClampedArray(S * S * 4), str = 2.2 * (S / 512);
  for (let y = 0; y < S; y++) {
    const ym = ((y - 1 + S) % S) * S, yp = ((y + 1) % S) * S, yy = y * S;
    for (let x = 0; x < S; x++) {
      const xm = (x - 1 + S) % S, xp = (x + 1) % S;
      const dx = (H[yy + xp] - H[yy + xm]) * str, dy = (H[yp + x] - H[ym + x]) * str;
      const l = 1 / Math.hypot(dx, dy, 1), p = (yy + x) * 4;
      nrm[p] = (-dx * l * 0.5 + 0.5) * 255; nrm[p + 1] = (dy * l * 0.5 + 0.5) * 255; nrm[p + 2] = (l * 0.5 + 0.5) * 255; nrm[p + 3] = 255;
    }
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = anisotropy; t.flipY = false; t.needsUpdate = true;
    return t;
  };
  const set = { map: mk(alb, true), normalMap: mk(nrm, false), roughnessMap: mk(orm, false), emissiveMap: em ? mk(em, true) : null };
  cache.set(key, set);
  return set;
}

export function disposeTextures() {
  for (const s of cache.values()) for (const t of Object.values(s)) if (t) t.dispose();
  cache.clear(); fbmCache.clear();
}
export function clearNoiseCache() { fbmCache.clear(); }

/** Sprite radial suave para partículas (humo, destellos…). */
let _soft = null, _spark = null, _smoke = null;
export function softSprite() {
  if (_soft) return _soft;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _soft = new THREE.CanvasTexture(c); _soft.colorSpace = THREE.SRGBColorSpace;
  return _soft;
}
export function smokeSprite() {
  if (_smoke) return _smoke;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), n = fbm(S, 4, 5, 91), n2 = fbm(S, 9, 4, 33);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, d = Math.hypot(x / S - 0.5, y / S - 0.5) * 2;
    const a = clamp((1 - d) * 1.5) * clamp(n[i] * 1.5 - 0.25 + n2[i] * 0.3) * clamp((1 - d) * 3);
    const v = 200 + n2[i] * 55;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  _smoke = new THREE.CanvasTexture(c); _smoke.colorSpace = THREE.SRGBColorSpace;
  return _smoke;
}
export function flashSprite() {
  if (_spark) return _spark;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,230,170,0.9)'); gr.addColorStop(0.5, 'rgba(255,150,40,0.35)'); gr.addColorStop(1, 'rgba(255,90,0,0)');
  g.fillStyle = gr;
  for (let k = 0; k < 7; k++) {
    g.rotate((Math.PI * 2) / 7 + 0.2);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(S * 0.5, -S * 0.07); g.lineTo(S * 0.5, S * 0.07); g.closePath(); g.fill();
  }
  g.beginPath(); g.arc(0, 0, S * 0.22, 0, 7); g.fill();
  _spark = new THREE.CanvasTexture(c); _spark.colorSpace = THREE.SRGBColorSpace;
  return _spark;
}
