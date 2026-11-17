// Grafo de navegación multinivel generado automáticamente a partir de las colisiones.
// Cada celda XZ puede tener varios nodos (suelo, plantas superiores, pasarelas, trincheras…).
// Los enlaces respetan escalones, rampas y caídas de un solo sentido. Búsqueda A* con montículo binario.
import { F_MOVE } from './collision.js';

export class NavGraph {
  constructor(world, o = {}) {
    this.world = world;
    this.cell = o.cell ?? 0.8;
    this.r = o.r ?? 0.34;
    this.h = o.h ?? 1.75;
    this.step = o.step ?? 0.7;
    this.drop = o.drop ?? 3.2;
    this.seeds = o.seeds || null;
    this.nodes = [];
    this.build();
  }

  build() {
    const w = this.world, c = this.cell, b = w.bounds;
    this.ox = b.minx; this.oz = b.minz;
    this.nx = Math.ceil((b.maxx - b.minx) / c); this.nz = Math.ceil((b.maxz - b.minz) / c);
    this.cols = new Array(this.nx * this.nz);
    const nodes = this.nodes, tmp = [];
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const x = this.ox + (ix + 0.5) * c, z = this.oz + (iz + 0.5) * c;
        const ys = [w.floorY];
        w.query(x - 0.05, z - 0.05, x + 0.05, z + 0.05, tmp);
        for (const bx of tmp) if (bx.flags & F_MOVE) ys.push(bx.maxy);
        ys.sort((a, b2) => a - b2);
        const col = [];
        let last = -Infinity;
        for (let y of ys) {
          // altura real de reposo: el cuerpo descansa sobre la cara más alta bajo su huella
          for (let k = 0; k < 4; k++) {
            let top = y;
            w.query(x - this.r, z - this.r, x + this.r, z + this.r, tmp);
            for (const bx of tmp) if ((bx.flags & F_MOVE) && bx.maxy > top + 1e-3 && bx.maxy <= y + 0.45 && bx.miny < y + this.h) top = bx.maxy;
            if (top === y) break;
            y = top;
          }
          if (y - last < 0.05) continue;
          if (x < b.minx + this.r || x > b.maxx - this.r || z < b.minz + this.r || z > b.maxz - this.r) continue;
          if (!w.fits(x, y, z, this.r, this.h)) continue;
          last = y;
          const n = { i: nodes.length, x, y, z, ix, iz, nb: [], cost: [] };
          nodes.push(n); col.push(n);
        }
        this.cols[iz * this.nx + ix] = col;
      }
    }
    // Enlaces
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const n of nodes) {
      for (let k = 0; k < 8; k++) {
        const dx = D[k][0], dz = D[k][1];
        const col = this._col(n.ix + dx, n.iz + dz);
        if (!col) continue;
        for (const m of col) {
          const dy = m.y - n.y;
          if (Math.abs(dy) <= this.step) {
            const top = Math.max(n.y, m.y);
            if (dy > 0.3) { if (!this._canWalk(n, m)) continue; }
            else if (!w.fits((n.x + m.x) / 2, top, (n.z + m.z) / 2, this.r, this.h)) continue;
            if (k >= 4) { // diagonales: sin cortar esquinas
              if (!this._has(n.ix + dx, n.iz, top) || !this._has(n.ix, n.iz + dz, top)) continue;
            }
            n.nb.push(m.i); n.cost.push(Math.hypot(m.x - n.x, m.z - n.z) + Math.abs(dy) * 1.5);
          } else if (k < 4 && dy < 0 && dy >= -this.drop) {
            // caída de un solo sentido: debe poder salirse en horizontal del borde
            if (!w.fits(m.x, n.y, m.z, this.r, this.h) || !w.fits((n.x + m.x) / 2, n.y, (n.z + m.z) / 2, this.r, this.h)) continue;
            // solo si es el primer suelo bajo el borde
            if (w.groundAt(m.x, n.y, m.z) > m.y + 0.05) continue;
            n.nb.push(m.i); n.cost.push(c + 2 + Math.abs(dy));
          }
        }
      }
    }
    if (this.seeds && this.seeds.length) this._prune();
    const N = this.nodes.length;
    this._g = new Float32Array(N); this._f = new Float32Array(N);
    this._from = new Int32Array(N); this._st = new Uint32Array(N); this._cl = new Uint32Array(N);
    this._stamp = 0;
    this._heap = [];
  }

  /** Elimina los nodos no alcanzables desde las semillas (tejados cerrados, huecos aislados…). */
  _prune() {
    const nodes = this.nodes, seen = new Uint8Array(nodes.length), q = [];
    for (const sd of this.seeds) {
      const n = this.nearest(sd.x, sd.y, sd.z);
      if (n && !seen[n.i]) { seen[n.i] = 1; q.push(n.i); }
    }
    while (q.length) { const n = nodes[q.pop()]; for (const m of n.nb) if (!seen[m]) { seen[m] = 1; q.push(m); } }
    const map = new Int32Array(nodes.length).fill(-1), keep = [];
    for (const n of nodes) if (seen[n.i]) { map[n.i] = keep.length; keep.push(n); }
    for (const n of keep) {
      const nb = [], cost = [];
      for (let k = 0; k < n.nb.length; k++) if (map[n.nb[k]] >= 0) { nb.push(map[n.nb[k]]); cost.push(n.cost[k]); }
      n.nb = nb; n.cost = cost;
    }
    keep.forEach((n, i) => { n.i = i; });
    this.nodes = keep;
    for (let i = 0; i < this.cols.length; i++) this.cols[i] = this.cols[i].filter((n) => keep[n.i] === n);
  }

  /** Simula el paso real del personaje (con su altura de escalón) para validar enlaces de subida. */
  _canWalk(n, m) {
    const body = { x: n.x, y: n.y + 0.001, z: n.z, r: this.r, h: this.h, onGround: true, stepHeight: 0.45 };
    const dx = (m.x - n.x) / 10, dz = (m.z - n.z) / 10;
    for (let i = 0; i < 10; i++) this.world.move(body, dx, -0.04, dz);
    return Math.abs(body.y - m.y) < 0.12 && Math.abs(body.x - m.x) < 0.08 && Math.abs(body.z - m.z) < 0.08;
  }

  _col(ix, iz) { return ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz ? null : this.cols[iz * this.nx + ix]; }
  _has(ix, iz, y) {
    const col = this._col(ix, iz);
    if (!col) return false;
    for (const m of col) if (Math.abs(m.y - y) <= this.step) return true;
    return false;
  }

  /** Nodo más cercano a un punto (prioriza la misma altura). */
  nearest(x, y, z, maxR = 4) {
    const ix = Math.floor((x - this.ox) / this.cell), iz = Math.floor((z - this.oz) / this.cell);
    let best = null, bd = Infinity;
    for (let r = 0; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const col = this._col(ix + dx, iz + dz);
        if (!col) continue;
        for (const n of col) {
          const d = (n.x - x) ** 2 + (n.z - z) ** 2 + ((n.y - y) * 2.5) ** 2;
          if (d < bd) { bd = d; best = n; }
        }
      }
      if (best && bd < (r * this.cell) ** 2) break;
    }
    return best;
  }

  /** A*. Devuelve lista de nodos o null. `penalty(node)` opcional añade coste (zonas peligrosas). */
  findPath(a, b, penalty = null, maxIter = 9000) {
    if (!a || !b) return null;
    if (a === b) return [a];
    const nodes = this.nodes, g = this._g, f = this._f, from = this._from, st = this._st, cl = this._cl;
    const stamp = ++this._stamp, heap = this._heap;
    heap.length = 0;
    const hfn = (n) => Math.hypot(n.x - b.x, n.z - b.z) + Math.abs(n.y - b.y);
    g[a.i] = 0; f[a.i] = hfn(a); from[a.i] = -1; st[a.i] = stamp;
    this._push(a.i);
    let it = 0;
    while (heap.length && it++ < maxIter) {
      const ci = this._pop();
      if (cl[ci] === stamp) continue;
      cl[ci] = stamp;
      if (ci === b.i) {
        const path = [];
        for (let k = ci; k !== -1; k = from[k]) path.push(nodes[k]);
        return path.reverse();
      }
      const n = nodes[ci];
      for (let k = 0; k < n.nb.length; k++) {
        const mi = n.nb[k];
        if (cl[mi] === stamp) continue;
        const ng = g[ci] + n.cost[k] + (penalty ? penalty(nodes[mi]) : 0);
        if (st[mi] !== stamp || ng < g[mi]) {
          g[mi] = ng; f[mi] = ng + hfn(nodes[mi]); from[mi] = ci; st[mi] = stamp;
          this._push(mi);
        }
      }
    }
    return null;
  }
  _push(i) {
    const h = this._heap, f = this._f;
    let k = h.length; h.push(i);
    while (k > 0) { const p = (k - 1) >> 1; if (f[h[p]] <= f[h[k]]) break; const t = h[p]; h[p] = h[k]; h[k] = t; k = p; }
  }
  _pop() {
    const h = this._heap, f = this._f, top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last; let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1; let s = k;
        if (l < h.length && f[h[l]] < f[h[s]]) s = l;
        if (r < h.length && f[h[r]] < f[h[s]]) s = r;
        if (s === k) break;
        const t = h[s]; h[s] = h[k]; h[k] = t; k = s;
      }
    }
    return top;
  }

  /** ¿Se puede caminar en línea recta entre dos puntos del mismo nivel? (suavizado de rutas) */
  walkable(ax, ay, az, bx, by, bz) {
    if (Math.abs(ay - by) > 0.25) return false;
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.4), w = this.world;
    for (let i = 1; i < n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t;
      if (!w.fits(x, y + 0.05, z, this.r, this.h)) return false;
      if (y - w.groundAt(x, y + 0.3, z) > 0.3) return false;
    }
    return true;
  }

  /** Suaviza una ruta eliminando nodos intermedios cuando hay paso recto. */
  smooth(path) {
    if (!path || path.length < 3) return path;
    const out = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
      let j = Math.min(path.length - 1, i + 12);
      for (; j > i + 1; j--) {
        const a = path[i], b = path[j];
        if (this.walkable(a.x, a.y, a.z, b.x, b.y, b.z)) break;
      }
      out.push(path[j]); i = j;
    }
    return out;
  }

  /** Nodos dentro de un radio (para buscar coberturas, puntos de flanqueo, etc.). */
  around(x, z, radius, out = []) {
    out.length = 0;
    const c = this.cell, r = Math.ceil(radius / c);
    const ix = Math.floor((x - this.ox) / c), iz = Math.floor((z - this.oz) / c);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz > r * r) continue;
      const col = this._col(ix + dx, iz + dz);
      if (col) for (const n of col) out.push(n);
    }
    return out;
  }

  random(rng = Math.random) { return this.nodes[(rng() * this.nodes.length) | 0]; }
}
