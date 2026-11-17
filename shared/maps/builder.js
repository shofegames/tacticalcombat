// DSL de construcción de mapas. Los mapas son DATOS puros (cajas, cuñas, props, luces,
// spawns, zonas): el cliente genera mallas a partir de ellos y el servidor solo las colisiones.
import { CollisionWorld, F_MOVE, F_BULLET, F_SIGHT, F_ALL } from '../collision.js';

export const SURF = {
  asphalt: 'concrete', concrete: 'concrete', concreteDark: 'concrete', sidewalk: 'concrete', brick: 'concrete',
  plaster: 'concrete', facade: 'concrete', stone: 'concrete', tile: 'concrete', roof: 'concrete',
  metal: 'metal', rust: 'metal', container: 'metal', scifiPanel: 'metal', scifiFloor: 'metal', scifiDark: 'metal',
  scifiWall: 'metal', hazard: 'metal', wood: 'wood', crate: 'wood', planks: 'wood', dirt: 'dirt', mud: 'dirt',
  grass: 'dirt', sandbag: 'dirt', hedge: 'dirt', glass: 'glass', em: 'metal',
};

// Colisionadores locales de los props: [minx,miny,minz,maxx,maxy,maxz, flags?]
const M = F_MOVE, S = F_SIGHT, A = F_ALL;
export const PROP_COLLIDERS = {
  car: { surf: 'metal', boxes: [[-2.1, 0, -0.9, 2.1, 0.85, 0.9], [-1.0, 0.85, -0.8, 0.9, 1.4, 0.8]] },
  van: { surf: 'metal', boxes: [[-2.6, 0, -1.05, 2.6, 2.3, 1.05]] },
  barrel: { surf: 'metal', boxes: [[-0.32, 0, -0.32, 0.32, 0.95, 0.32]] },
  barrier: { surf: 'concrete', boxes: [[-1.5, 0, -0.3, 1.5, 0.95, 0.3]] },
  sandbags: { surf: 'dirt', boxes: [[-1.5, 0, -0.4, 1.5, 1.05, 0.4]] },
  dumpster: { surf: 'metal', boxes: [[-1.1, 0, -0.6, 1.1, 1.3, 0.6]] },
  lamp: { surf: 'metal', boxes: [[-0.1, 0, -0.1, 0.1, 5, 0.1, M]] },
  tree: { surf: 'wood', boxes: [[-0.3, 0, -0.3, 0.3, 5, 0.3]] },
  deadtree: { surf: 'wood', boxes: [[-0.25, 0, -0.25, 0.25, 4, 0.25]] },
  bush: { surf: 'dirt', boxes: [[-0.9, 0, -0.9, 0.9, 1.3, 0.9, S]] },
  tank: { surf: 'metal', boxes: [[-3.2, 0, -1.6, 3.2, 1.5, 1.6], [-1.3, 1.5, -1.1, 1.3, 2.3, 1.1]] },
  cannon: { surf: 'metal', boxes: [[-1.2, 0, -0.9, 1.2, 1.2, 0.9]] },
  haystack: { surf: 'dirt', boxes: [[-1.2, 0, -1.2, 1.2, 1.6, 1.2]] },
  cart: { surf: 'wood', boxes: [[-1.3, 0, -0.7, 1.3, 1.1, 0.7]] },
  barbwire: { surf: 'metal', boxes: [[-1.5, 0, -0.35, 1.5, 0.9, 0.35, M]] },
  well: { surf: 'concrete', boxes: [[-0.8, 0, -0.8, 0.8, 1.0, 0.8]] },
  pallets: { surf: 'wood', boxes: [[-0.6, 0, -0.5, 0.6, 0.9, 0.5]] },
  console: { surf: 'metal', boxes: [[-0.9, 0, -0.4, 0.9, 1.1, 0.4]] },
  rack: { surf: 'metal', boxes: [[-0.5, 0, -0.5, 0.5, 2.2, 0.5]] },
  holotable: { surf: 'metal', boxes: [[-1, 0, -1, 1, 0.9, 1]] },
  pod: { surf: 'metal', boxes: [[-0.6, 0, -0.6, 0.6, 2.4, 0.6]] },
  fcrate: { surf: 'metal', boxes: [[-0.7, 0, -0.7, 0.7, 1.1, 0.7]] },
  generator: { surf: 'metal', boxes: [[-1.2, 0, -0.7, 1.2, 1.5, 0.7]] },
  dropship: { surf: 'metal', boxes: [[-4.5, 0, -2, 4.5, 2.6, 2]] },
  smoke: { boxes: [] }, steam: { boxes: [] }, fire: { boxes: [] }, holo: { boxes: [] }, crater: { boxes: [] },
};

export class MapDef {
  constructor(id, name, opts = {}) {
    this.id = id; this.name = name;
    this.desc = opts.desc || '';
    this.era = opts.era || 'modern';
    this.bounds = opts.bounds || { minx: -50, minz: -50, maxx: 50, maxz: 50 };
    this.floorY = opts.floorY ?? 0;
    this.env = opts.env || {};
    this.boxes = []; this.wedges = []; this.props = []; this.lights = [];
    this.spawns = { a: [], b: [], ffa: [] };
    this.zones = []; this.targets = []; this.dummies = [];
  }

  /** Caja: x,z centro; y base. o: {tint, flags, collide, visual, surf, em} */
  box(x, y, z, w, h, d, mat = 'concrete', o = {}) {
    if (w <= 0.001 || h <= 0.001 || d <= 0.001) return null;
    const b = { x, y, z, w, h, d, mat, tint: o.tint ?? null, flags: o.flags ?? (mat === 'glass' ? F_MOVE : F_ALL),
      collide: o.collide ?? true, visual: o.visual ?? true, surf: o.surf || SURF[mat] || 'concrete', em: o.em || 0 };
    this.boxes.push(b);
    return b;
  }
  /** Caja definida por esquinas. */
  span(x0, y0, z0, x1, y1, z1, mat, o) {
    return this.box((x0 + x1) / 2, y0, (z0 + z1) / 2, Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), mat, o);
  }

  /** Rampa lisa (cuña visual + escalones de colisión invisibles). dir = sentido de subida. */
  ramp(x, y, z, w, h, d, dir, mat = 'concrete', o = {}) {
    this.wedges.push({ x, y, z, w, h, d, dir, mat, tint: o.tint ?? null });
    this._steps(x, y, z, w, h, d, dir, mat, 0.15, false, o);
  }
  /** Escalera visible. */
  stairs(x, y, z, w, h, d, dir, mat = 'concrete', o = {}) {
    this._steps(x, y, z, w, h, d, dir, mat, 0.2, true, o);
  }
  _steps(x, y, z, w, h, d, dir, mat, sh, visual, o) {
    const n = Math.max(1, Math.round(h / sh)), rise = h / n;
    const alongX = dir === '+x' || dir === '-x', len = alongX ? w : d, run = len / n;
    for (let i = 0; i < n; i++) {
      // el escalón i ocupa desde su arranque hasta el final de la rampa (maciza por debajo)
      const l = len - i * run, top = (i + 1) * rise;
      const off = (dir === '+x' || dir === '+z') ? (len / 2 - l / 2) : -(len / 2 - l / 2);
      const bx = alongX ? x + off : x, bz = alongX ? z : z + off;
      this.box(bx, y + i * rise, bz, alongX ? l : w, rise, alongX ? d : l, mat,
        { ...o, visual, collide: true, flags: o.flags ?? F_ALL });
      void top;
    }
  }

  /** Muro a lo largo de X en z fijo. ops: [{a,b,y0,y1,glass}] huecos (coordenadas x absolutas; y relativas a la base). */
  wallX(z, x0, x1, y, h, t, mat, ops = [], o = {}) { this._wall(true, z, x0, x1, y, h, t, mat, ops, o); }
  /** Muro a lo largo de Z en x fijo. */
  wallZ(x, z0, z1, y, h, t, mat, ops = [], o = {}) { this._wall(false, x, z0, z1, y, h, t, mat, ops, o); }
  _wall(alongX, c, a0, a1, y, h, t, mat, ops, o) {
    if (a0 > a1) { const q = a0; a0 = a1; a1 = q; }
    const put = (s0, s1, yy, hh, m, oo) => {
      if (s1 - s0 < 0.01 || hh < 0.01) return;
      if (alongX) this.box((s0 + s1) / 2, yy, c, s1 - s0, hh, m === 'glass' ? 0.06 : t, m, oo);
      else this.box(c, yy, (s0 + s1) / 2, m === 'glass' ? 0.06 : t, hh, s1 - s0, m, oo);
    };
    const list = ops.filter((p) => p.b > a0 && p.a < a1).map((p) => ({ ...p, a: Math.max(p.a, a0), b: Math.min(p.b, a1) })).sort((p, q) => p.a - q.a);
    let cur = a0;
    for (const p of list) {
      put(cur, p.a, y, h, mat, o);
      const y0 = p.y0 ?? 0, y1 = Math.min(p.y1 ?? 2.2, h);
      if (y0 > 0) put(p.a, p.b, y, y0, mat, o);
      if (y1 < h) put(p.a, p.b, y + y1, h - y1, mat, o);
      if (p.glass) put(p.a, p.b, y + y0, y1 - y0, 'glass', {});
      cur = p.b;
    }
    put(cur, a1, y, h, mat, o);
  }

  /** Losa rectangular con recortes (huecos de escalera, trincheras…). cuts: [[x0,z0,x1,z1], …] */
  slab(x0, z0, x1, z1, y0, y1, mat, cuts = [], o = {}) {
    const xs = new Set([x0, x1]), zs = new Set([z0, z1]);
    for (const c of cuts) {
      for (const v of [c[0], c[2]]) if (v > x0 && v < x1) xs.add(v);
      for (const v of [c[1], c[3]]) if (v > z0 && v < z1) zs.add(v);
    }
    const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
    const inCut = (cx, cz) => cuts.some((c) => cx > c[0] && cx < c[2] && cz > c[1] && cz < c[3]);
    for (let j = 0; j < Z.length - 1; j++) {
      let run = null;
      for (let i = 0; i < X.length - 1; i++) {
        const solid = !inCut((X[i] + X[i + 1]) / 2, (Z[j] + Z[j + 1]) / 2);
        if (solid) { if (run === null) run = X[i]; }
        if ((!solid || i === X.length - 2) && run !== null) {
          const end = solid ? X[i + 1] : X[i];
          this.span(run, y0, Z[j], end, y1, Z[j + 1], mat, o);
          run = null;
        }
      }
    }
  }

  /**
   * Edificio con interior. Lados: n=-z, s=+z, w=-x, e=+x.
   * o: {floors, floorH, mat, floorMat, roofMat, doors:[{side,at,w}], windows, glass, stairs, roofAccess, tint, y}
   */
  building(cx, cz, w, d, o = {}) {
    const floors = o.floors ?? 1, fh = o.floorH ?? 3.4, t = 0.3, y0 = o.y ?? 0;
    const mat = o.mat || 'brick', wo = { tint: o.tint ?? null };
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const sw = 1.2, run = Math.round(fh / 0.2) * 0.28;
    const stairs = o.stairs ?? floors > 1;
    for (let f = 0; f < floors; f++) {
      const y = y0 + f * fh;
      const ops = { n: [], s: [], w: [], e: [] };
      if (f === 0) for (const dr of o.doors || []) {
        const c = (dr.side === 'n' || dr.side === 's' ? cx : cz) + dr.at, hw = (dr.w || 1.5) / 2;
        ops[dr.side].push({ a: c - hw, b: c + hw, y0: 0, y1: dr.h || 2.3 });
      }
      if (o.windows !== false) {
        for (const side of ['n', 's', 'w', 'e']) {
          const a0 = (side === 'n' || side === 's') ? x0 : z0, a1 = (side === 'n' || side === 's') ? x1 : z1;
          const n = Math.max(1, Math.floor((a1 - a0 - 2) / (o.winSpacing || 3.6)));
          const stepW = (a1 - a0) / n;
          for (let i = 0; i < n; i++) {
            const c = a0 + stepW * (i + 0.5), ww = o.winW || 1.4;
            if (ops[side].some((p) => p.y0 === 0 && c + ww / 2 + 0.4 > p.a && c - ww / 2 - 0.4 < p.b)) continue;
            ops[side].push({ a: c - ww / 2, b: c + ww / 2, y0: 1.0, y1: 2.3, glass: o.glass && ((i + f) % 2 === 0) });
          }
        }
      }
      this.wallX(z0 + t / 2, x0, x1, y, fh, t, mat, ops.n, wo);
      this.wallX(z1 - t / 2, x0, x1, y, fh, t, mat, ops.s, wo);
      this.wallZ(x0 + t / 2, z0 + t, z1 - t, y, fh, t, mat, ops.w, wo);
      this.wallZ(x1 - t / 2, z0 + t, z1 - t, y, fh, t, mat, ops.e, wo);
      // Escalera interior: pared este en plantas pares, oeste en impares
      const hasUp = stairs && (f < floors - 1 || o.roofAccess);
      let cut = null;
      if (hasUp) {
        const east = f % 2 === 0;
        const sx = east ? x1 - t - sw / 2 - 0.05 : x0 + t + sw / 2 + 0.05;
        const sz0 = east ? cz - run / 2 : cz + run / 2;
        this.stairs(sx, y, cz, sw, fh, run, east ? '+z' : '-z', o.stairMat || 'concrete');
        cut = [sx - sw / 2 - 0.05, cz - run / 2 - 0.05, sx + sw / 2 + 0.05, cz + run / 2 - 0.3];
        if (!east) cut = [sx - sw / 2 - 0.05, cz - run / 2 + 0.3, sx + sw / 2 + 0.05, cz + run / 2 + 0.05];
        void sz0;
      }
      // Forjado superior (suelo de la planta siguiente o cubierta)
      const top = y + fh, isRoof = f === floors - 1;
      this.slab(x0 + (isRoof ? 0 : t), z0 + (isRoof ? 0 : t), x1 - (isRoof ? 0 : t), z1 - (isRoof ? 0 : t),
        top - 0.25, top, isRoof ? (o.roofMat || 'concreteDark') : (o.floorMat || 'planks'), cut ? [cut] : []);
      if (isRoof) {
        const ph = o.roofAccess ? 1.0 : 0.35;
        this.wallX(z0 + t / 2, x0, x1, top, ph, t, mat, [], wo);
        this.wallX(z1 - t / 2, x0, x1, top, ph, t, mat, [], wo);
        this.wallZ(x0 + t / 2, z0 + t, z1 - t, top, ph, t, mat, [], wo);
        this.wallZ(x1 - t / 2, z0 + t, z1 - t, top, ph, t, mat, [], wo);
      }
    }
    if (o.floor !== false) this.box(cx, y0, cz, w - 0.1, 0.04, d - 0.1, o.groundMat || 'tile', { collide: false });
  }

  /** Prop. q = cuartos de vuelta (0..3). Los colisionadores se rotan en múltiplos de 90°. */
  prop(type, x, y, z, q = 0, opts = {}) {
    this.props.push({ type, x, y, z, q, ...opts });
    const def = PROP_COLLIDERS[type];
    if (!def) return;
    for (const c of def.boxes) {
      let [ax, ay, az, bx, by, bz, fl] = c;
      for (let i = 0; i < (q & 3); i++) { // rotación +90° alrededor de Y: (x,z) -> (z,-x)
        const nax = az, naz = -bx, nbx = bz, nbz = -ax;
        ax = Math.min(nax, nbx); bx = Math.max(nax, nbx); az = Math.min(naz, nbz); bz = Math.max(naz, nbz);
      }
      this.box(x + (ax + bx) / 2, y + ay, z + (az + bz) / 2, bx - ax, by - ay, bz - az, 'concrete',
        { visual: false, flags: fl ?? F_ALL, surf: def.surf });
    }
  }

  light(x, y, z, color = 0xffffff, intensity = 1, dist = 14) { this.lights.push({ x, y, z, color, intensity, dist }); }
  spawn(team, x, y, z, yaw = 0) { this.spawns[team].push({ x, y, z, yaw }); }
  zone(name, x, y, z, r = 5) { this.zones.push({ name, x, y, z, r }); }
  target(x, y, z, o = {}) { this.targets.push({ x, y, z, ...o }); }
  dummy(x, y, z, o = {}) { this.dummies.push({ x, y, z, ...o }); }

  /** Genera el mundo de colisiones (usado por cliente y servidor). */
  buildCollision() {
    const w = new CollisionWorld(4);
    w.floorY = this.floorY;
    w.bounds = { ...this.bounds };
    for (const b of this.boxes) {
      if (!b.collide) continue;
      w.add({ minx: b.x - b.w / 2, miny: b.y, minz: b.z - b.d / 2, maxx: b.x + b.w / 2, maxy: b.y + b.h, maxz: b.z + b.d / 2,
        flags: b.flags, surf: b.surf });
    }
    return w;
  }
}

export { F_MOVE, F_BULLET, F_SIGHT, F_ALL };
