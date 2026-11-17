// Mundo de colisiones compartido por cliente y servidor.
// Geometría estática = cajas alineadas a los ejes (AABB) indexadas en una rejilla XZ.
// Sin dependencias: se ejecuta igual en el navegador y en Node (validación del servidor).

export const F_MOVE = 1;   // bloquea el movimiento
export const F_BULLET = 2; // bloquea balas
export const F_SIGHT = 4;  // bloquea la visión de la IA
export const F_ALL = 7;

const EPS = 1e-4;

export class CollisionWorld {
  constructor(cell = 4) {
    this.cell = cell;
    this.boxes = [];
    this.grid = new Map();
    this.floorY = 0;
    this.bounds = { minx: -50, minz: -50, maxx: 50, maxz: 50 };
    this._stamp = 0;
    this._tmp = [];
  }

  /** box: {minx,miny,minz,maxx,maxy,maxz,flags,surf} */
  add(box) {
    box.flags = box.flags ?? F_ALL;
    box.surf = box.surf || 'concrete';
    box._s = 0;
    this.boxes.push(box);
    const c = this.cell;
    const x0 = Math.floor(box.minx / c), x1 = Math.floor(box.maxx / c);
    const z0 = Math.floor(box.minz / c), z1 = Math.floor(box.maxz / c);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = x * 73856093 ^ z * 19349663;
        let a = this.grid.get(k);
        if (!a) this.grid.set(k, (a = []));
        a.push(box);
      }
    }
    return box;
  }

  /** Devuelve (en `out`) las cajas cuya huella XZ toca el rectángulo dado. */
  query(minx, minz, maxx, maxz, out = this._tmp) {
    out.length = 0;
    const c = this.cell, stamp = ++this._stamp;
    const x0 = Math.floor(minx / c), x1 = Math.floor(maxx / c);
    const z0 = Math.floor(minz / c), z1 = Math.floor(maxz / c);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const a = this.grid.get(x * 73856093 ^ z * 19349663);
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const b = a[i];
          if (b._s === stamp) continue;
          b._s = stamp;
          if (b.maxx > minx && b.minx < maxx && b.maxz > minz && b.minz < maxz) out.push(b);
        }
      }
    }
    return out;
  }

  /** ¿Algún sólido intersecta este volumen? Devuelve la caja o null. */
  overlap(minx, miny, minz, maxx, maxy, maxz, mask = F_MOVE) {
    const a = this.query(minx, minz, maxx, maxz);
    for (let i = 0; i < a.length; i++) {
      const b = a[i];
      if ((b.flags & mask) && b.maxy > miny && b.miny < maxy) return b;
    }
    return null;
  }

  /**
   * Rayo contra el mundo (recorrido DDA de la rejilla). Dirección normalizada.
   * Devuelve {t, box, nx, ny, nz} o null. `out` se reutiliza si se pasa.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist = 500, mask = F_BULLET, out = {}) {
    let best = maxDist, hit = null, hnx = 0, hny = 0, hnz = 0;
    // Suelo implícito
    if (dy < -1e-9) {
      const t = (this.floorY - oy) / dy;
      if (t >= 0 && t < best) { best = t; hit = FLOOR; hnx = 0; hny = 1; hnz = 0; }
    }
    const c = this.cell, stamp = ++this._stamp;
    let cx = Math.floor(ox / c), cz = Math.floor(oz / c);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const idx = Math.abs(dx) > 1e-12 ? 1 / dx : Infinity * sx;
    const idz = Math.abs(dz) > 1e-12 ? 1 / dz : Infinity * sz;
    const idy = Math.abs(dy) > 1e-12 ? 1 / dy : Infinity;
    let tMaxX = Number.isFinite(idx) ? ((dx > 0 ? (cx + 1) * c : cx * c) - ox) * idx : Infinity;
    let tMaxZ = Number.isFinite(idz) ? ((dz > 0 ? (cz + 1) * c : cz * c) - oz) * idz : Infinity;
    const tDX = Number.isFinite(idx) ? c * Math.abs(idx) : Infinity;
    const tDZ = Number.isFinite(idz) ? c * Math.abs(idz) : Infinity;
    let tEnter = 0;
    for (let guard = 0; guard < 512; guard++) {
      const a = this.grid.get(cx * 73856093 ^ cz * 19349663);
      if (a) {
        for (let i = 0; i < a.length; i++) {
          const b = a[i];
          if (b._s === stamp || !(b.flags & mask)) continue;
          b._s = stamp;
          // Test de losas
          let t0 = 0, t1 = best, axis = -1, sign = 0;
          let ta, tb;
          if (Number.isFinite(idx)) {
            ta = (b.minx - ox) * idx; tb = (b.maxx - ox) * idx;
            let s = -1; if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
            if (ta > t0) { t0 = ta; axis = 0; sign = s; }
            if (tb < t1) t1 = tb;
            if (t0 > t1) continue;
          } else if (ox <= b.minx || ox >= b.maxx) continue;
          if (Number.isFinite(idy)) {
            ta = (b.miny - oy) * idy; tb = (b.maxy - oy) * idy;
            let s = -1; if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
            if (ta > t0) { t0 = ta; axis = 1; sign = s; }
            if (tb < t1) t1 = tb;
            if (t0 > t1) continue;
          } else if (oy <= b.miny || oy >= b.maxy) continue;
          if (Number.isFinite(idz)) {
            ta = (b.minz - oz) * idz; tb = (b.maxz - oz) * idz;
            let s = -1; if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
            if (ta > t0) { t0 = ta; axis = 2; sign = s; }
            if (tb < t1) t1 = tb;
            if (t0 > t1) continue;
          } else if (oz <= b.minz || oz >= b.maxz) continue;
          if (axis < 0) continue; // origen dentro de la caja: se ignora
          if (t0 < best) {
            best = t0; hit = b;
            hnx = axis === 0 ? sign : 0; hny = axis === 1 ? sign : 0; hnz = axis === 2 ? sign : 0;
          }
        }
      }
      tEnter = Math.min(tMaxX, tMaxZ);
      if (tEnter > best) break;
      if (tMaxX < tMaxZ) { cx += sx; tMaxX += tDX; } else { cz += sz; tMaxZ += tDZ; }
    }
    if (!hit) return null;
    out.t = best; out.box = hit; out.nx = hnx; out.ny = hny; out.nz = hnz;
    return out;
  }

  /** Línea de visión libre entre dos puntos. */
  los(ax, ay, az, bx, by, bz, mask = F_SIGHT) {
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-6) return true;
    dx /= d; dy /= d; dz /= d;
    return !this.raycast(ax, ay, az, dx, dy, dz, d - 0.05, mask, _losOut);
  }

  /** Altura del suelo bajo un punto (cara superior más alta por debajo de y). */
  groundAt(x, y, z, r = 0.05) {
    const a = this.query(x - r, z - r, x + r, z + r);
    let g = this.floorY;
    for (let i = 0; i < a.length; i++) {
      const b = a[i];
      if ((b.flags & F_MOVE) && b.maxy <= y + EPS && b.maxy > g) g = b.maxy;
    }
    return g;
  }

  /**
   * Mueve un cuerpo (caja vertical: centro en los pies) resolviendo colisiones,
   * escalones y adherencia al bajar. body: {x,y,z,r,h,onGround,stepHeight}
   * Devuelve banderas de impacto en `res`.
   */
  move(body, dx, dy, dz, res = _res) {
    res.hitX = res.hitZ = res.hitCeil = false; res.landed = false; res.stepped = 0;
    const wasGround = body.onGround;
    const lim = body.r * 0.9;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / lim));
    const sx = dx / n, sy = dy / n, sz = dz / n;
    for (let i = 0; i < n; i++) {
      if (sx !== 0) this._moveH(body, sx, 0, res);
      if (sz !== 0) this._moveH(body, sz, 2, res);
      if (sy !== 0) this._moveV(body, sy, res);
    }
    // Adherencia al bajar escalones/rampas (evita "flotar" al descender)
    if (wasGround && !body.onGround && dy <= 0) {
      const sh = body.stepHeight ?? 0.45;
      const r = body.r, a = this.query(body.x - r, body.z - r, body.x + r, body.z + r);
      let top = -Infinity;
      for (let i = 0; i < a.length; i++) {
        const b = a[i];
        if ((b.flags & F_MOVE) && b.maxy <= body.y + EPS && b.maxy >= body.y - sh && b.maxy > top) top = b.maxy;
      }
      if (top === -Infinity && this.floorY >= body.y - sh && this.floorY <= body.y + EPS) top = this.floorY;
      if (top !== -Infinity) { res.stepped += top - body.y; body.y = top + EPS; body.onGround = true; }
    }
    // Límites del escenario
    const bd = this.bounds;
    if (body.x < bd.minx + body.r) body.x = bd.minx + body.r;
    if (body.x > bd.maxx - body.r) body.x = bd.maxx - body.r;
    if (body.z < bd.minz + body.r) body.z = bd.minz + body.r;
    if (body.z > bd.maxz - body.r) body.z = bd.maxz - body.r;
    return res;
  }

  _moveH(body, d, axis, res) {
    const r = body.r, h = body.h;
    const nx = axis === 0 ? body.x + d : body.x, nz = axis === 2 ? body.z + d : body.z;
    const a = this.query(nx - r, nz - r, nx + r, nz + r);
    let blocked = false, maxTop = -Infinity, edge = d > 0 ? Infinity : -Infinity;
    for (let i = 0; i < a.length; i++) {
      const b = a[i];
      if (!(b.flags & F_MOVE) || b.maxy <= body.y + EPS * 2 || b.miny >= body.y + h) continue;
      blocked = true;
      if (b.maxy > maxTop) maxTop = b.maxy;
      if (axis === 0) edge = d > 0 ? Math.min(edge, b.minx) : Math.max(edge, b.maxx);
      else edge = d > 0 ? Math.min(edge, b.minz) : Math.max(edge, b.maxz);
    }
    if (!blocked) { body.x = nx; body.z = nz; return; }
    const sh = body.stepHeight ?? 0.45;
    if (body.onGround && maxTop - body.y <= sh + EPS) {
      const ny = maxTop + EPS * 2;
      if (!this.overlap(nx - r, ny, nz - r, nx + r, ny + h, nz + r, F_MOVE)) {
        res.stepped += ny - body.y;
        body.x = nx; body.z = nz; body.y = ny;
        return;
      }
    }
    if (axis === 0) {
      const tx = d > 0 ? edge - r - EPS : edge + r + EPS;
      if (d > 0 ? tx > body.x : tx < body.x) body.x = tx;
      res.hitX = true;
    } else {
      const tz = d > 0 ? edge - r - EPS : edge + r + EPS;
      if (d > 0 ? tz > body.z : tz < body.z) body.z = tz;
      res.hitZ = true;
    }
  }

  _moveV(body, d, res) {
    const r = body.r, h = body.h, ny = body.y + d;
    const a = this.query(body.x - r, body.z - r, body.x + r, body.z + r);
    if (d < 0) {
      let top = -Infinity;
      for (let i = 0; i < a.length; i++) {
        const b = a[i];
        if (!(b.flags & F_MOVE) || b.maxy <= ny || b.miny >= body.y + h) continue;
        if (b.maxy <= body.y + 0.05 && b.maxy > top) top = b.maxy;
      }
      if (top === -Infinity && ny <= this.floorY) top = this.floorY;
      if (top !== -Infinity) {
        body.y = top + EPS;
        if (!body.onGround) res.landed = true;
        body.onGround = true;
      } else { body.y = ny; body.onGround = false; }
    } else {
      let bottom = Infinity;
      for (let i = 0; i < a.length; i++) {
        const b = a[i];
        if (!(b.flags & F_MOVE) || b.miny >= ny + h || b.maxy <= body.y + h - 0.05) continue;
        if (b.miny < bottom) bottom = b.miny;
      }
      if (bottom !== Infinity) { body.y = Math.max(body.y, bottom - h - EPS); res.hitCeil = true; }
      else body.y = ny;
      body.onGround = false;
    }
  }

  /** ¿Cabe un cuerpo de altura h en esta posición? */
  fits(x, y, z, r, h) {
    return !this.overlap(x - r, y + EPS * 4, z - r, x + r, y + h, z + r, F_MOVE);
  }
}

const FLOOR = { minx: -1e9, miny: -1e9, minz: -1e9, maxx: 1e9, maxy: 0, maxz: 1e9, flags: F_ALL, surf: 'dirt', floor: true };
const _losOut = {};
const _res = { hitX: false, hitZ: false, hitCeil: false, landed: false, stepped: 0 };

// ---------- Cajas de impacto de los personajes ----------
export const BODY = { radius: 0.34, standH: 1.8, crouchH: 1.25, eyeStand: 1.62, eyeCrouch: 1.08 };

/**
 * Rayo contra un personaje. Devuelve {t, zone} (zone: 'head'|'torso'|'legs') o null.
 * (px,py,pz) = pies. Dirección normalizada.
 */
export function rayVsCharacter(ox, oy, oz, dx, dy, dz, px, py, pz, crouch, maxT, out = {}) {
  const h = crouch ? BODY.crouchH : BODY.standH;
  let best = maxT, zone = null;
  // Cabeza (esfera)
  const hy = py + h - 0.17, hr = 0.165;
  const lx = ox - px, ly = oy - hy, lz = oz - pz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - hr * hr;
  const disc = b * b - c;
  if (disc >= 0) {
    const t = -b - Math.sqrt(disc);
    if (t >= 0 && t < best) { best = t; zone = 'head'; }
  }
  // Torso y piernas (AABB)
  const split = h * 0.47;
  let t = rayBox(ox, oy, oz, dx, dy, dz, px - 0.27, py + split, pz - 0.27, px + 0.27, py + h - 0.3, pz + 0.27, best);
  if (t >= 0 && t < best) { best = t; zone = 'torso'; }
  t = rayBox(ox, oy, oz, dx, dy, dz, px - 0.22, py, pz - 0.22, px + 0.22, py + split, pz + 0.22, best);
  if (t >= 0 && t < best) { best = t; zone = 'legs'; }
  if (!zone) return null;
  out.t = best; out.zone = zone;
  return out;
}

export function rayBox(ox, oy, oz, dx, dy, dz, minx, miny, minz, maxx, maxy, maxz, maxT) {
  let t0 = 0, t1 = maxT;
  for (let i = 0; i < 3; i++) {
    const o = i === 0 ? ox : i === 1 ? oy : oz, d = i === 0 ? dx : i === 1 ? dy : dz;
    const mn = i === 0 ? minx : i === 1 ? miny : minz, mx = i === 0 ? maxx : i === 1 ? maxy : maxz;
    if (Math.abs(d) < 1e-12) { if (o < mn || o > mx) return -1; continue; }
    let a = (mn - o) / d, b = (mx - o) / d;
    if (a > b) { const q = a; a = b; b = q; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }
  return t0;
}
