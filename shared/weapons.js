// Registro modular de armas. Añadir un arma = una llamada a registerWeapon() aquí
// + un constructor de modelo en src/weapons/WeaponModels.js. Nada más cambia.
// Estos datos los usa también el servidor para validar cadencia, munición y daño.

export const CATEGORIES = {
  pistol: 'Pistolas', assault: 'Rifles de asalto', smg: 'Subfusiles', shotgun: 'Escopetas',
  sniper: 'Francotirador', lmg: 'Ametralladoras', historic: 'Históricas', future: 'Futuristas',
};

const BASE = {
  slot: 'primary', mode: 'auto', burst: 1, pellets: 1,
  headMult: 1.6, legMult: 0.8, rangeNear: 20, rangeFar: 60, minFactor: 0.6,
  spreadHip: 2.2, spreadAds: 0.25, spreadMove: 1.2, bloom: 0.35, bloomMax: 3, bloomRecover: 6,
  recoilV: 1.0, recoilH: 0.35, recoilRecover: 7, kick: 1,
  adsZoom: 1.25, adsTime: 0.22, scope: false, moveMult: 1, equipTime: 0.55,
  reloadType: 'mag', reloadTime: 2.2, shellTime: 0.5,
  energy: false, tracer: 0xffe2a8, auto: false,
};

export const WEAPONS = {};
export const WEAPON_LIST = [];

export function registerWeapon(def) {
  const w = { ...BASE, ...def };
  w.interval = 60 / w.rpm;
  w.model = w.model || w.id;
  WEAPONS[w.id] = w;
  const i = WEAPON_LIST.findIndex((x) => x.id === w.id);
  if (i >= 0) WEAPON_LIST[i] = w; else WEAPON_LIST.push(w);
  return w;
}

/** Daño a una distancia y zona dadas (misma fórmula en cliente y servidor). */
export function damageAt(w, dist, zone) {
  let f = 1;
  if (dist > w.rangeNear) f = dist >= w.rangeFar ? w.minFactor : 1 - (1 - w.minFactor) * ((dist - w.rangeNear) / (w.rangeFar - w.rangeNear));
  const z = zone === 'head' ? w.headMult : zone === 'legs' ? w.legMult : 1;
  return w.damage * f * z;
}

// ---------------- PISTOLAS ----------------
registerWeapon({
  id: 'p9', name: 'P9 Guardian', category: 'pistol', slot: 'secondary', mode: 'semi',
  desc: 'Pistola de servicio 9 mm. Fiable, rápida de desenfundar y precisa a corta distancia.',
  damage: 26, rpm: 420, mag: 15, reserve: 60, reloadTime: 1.5, rangeNear: 14, rangeFar: 40, minFactor: 0.55,
  spreadHip: 1.5, spreadAds: 0.3, recoilV: 1.3, recoilH: 0.4, adsZoom: 1.15, adsTime: 0.14, moveMult: 1.06, equipTime: 0.32,
  sound: { kind: 'pistol', pitch: 1.15, body: 0.5, crack: 0.9, tail: 0.25 },
});
registerWeapon({
  id: 'kestrel', name: 'Kestrel .50', category: 'pistol', slot: 'secondary', mode: 'semi',
  desc: 'Pistola pesada de gran calibre. Siete cartuchos que golpean como un martillo.',
  damage: 52, rpm: 190, mag: 7, reserve: 35, reloadTime: 1.8, rangeNear: 18, rangeFar: 45, minFactor: 0.6, headMult: 1.9,
  spreadHip: 1.9, spreadAds: 0.25, recoilV: 3.4, recoilH: 0.9, kick: 1.9, adsZoom: 1.15, adsTime: 0.18, moveMult: 1.03, equipTime: 0.4,
  sound: { kind: 'pistol', pitch: 0.72, body: 1.0, crack: 1.0, tail: 0.5 },
});

// ---------------- RIFLES DE ASALTO ----------------
registerWeapon({
  id: 'mk4', name: 'MK4 Carbine', category: 'assault',
  desc: 'Carabina modular 5,56. Equilibrio ejemplar entre cadencia, control y alcance.',
  damage: 27, rpm: 760, mag: 30, reserve: 150, reloadTime: 2.1, rangeNear: 28, rangeFar: 75, minFactor: 0.7,
  spreadHip: 2.4, spreadAds: 0.18, recoilV: 0.95, recoilH: 0.38, adsZoom: 1.35, sight: 'reddot',
  sound: { kind: 'rifle', pitch: 1.05, body: 0.7, crack: 1.0, tail: 0.45 },
});
registerWeapon({
  id: 'akv', name: 'AKV-74 Volk', category: 'assault',
  desc: 'Fusil de asalto 7,62. Más daño por bala a cambio de un retroceso contundente.',
  damage: 34, rpm: 600, mag: 30, reserve: 120, reloadTime: 2.5, rangeNear: 26, rangeFar: 70, minFactor: 0.72,
  spreadHip: 2.7, spreadAds: 0.24, recoilV: 1.35, recoilH: 0.6, kick: 1.25, adsZoom: 1.3,
  sound: { kind: 'rifle', pitch: 0.84, body: 0.95, crack: 1.0, tail: 0.55 },
});

// ---------------- SUBFUSILES ----------------
registerWeapon({
  id: 'viper9', name: 'Viper-9', category: 'smg',
  desc: 'Subfusil compacto 9 mm. Muy controlable y letal en interiores.',
  damage: 22, rpm: 820, mag: 30, reserve: 150, reloadTime: 1.9, rangeNear: 13, rangeFar: 38, minFactor: 0.55,
  spreadHip: 1.8, spreadAds: 0.3, recoilV: 0.7, recoilH: 0.32, kick: 0.8, adsZoom: 1.2, adsTime: 0.17, moveMult: 1.05, equipTime: 0.45,
  sound: { kind: 'smg', pitch: 1.2, body: 0.5, crack: 0.8, tail: 0.3 },
});
registerWeapon({
  id: 'swift45', name: 'Swift .45', category: 'smg',
  desc: 'Subfusil .45 de cadencia extrema. Vacía el cargador en un parpadeo.',
  damage: 24, rpm: 1050, mag: 25, reserve: 150, reloadTime: 2.0, rangeNear: 11, rangeFar: 32, minFactor: 0.5,
  spreadHip: 2.0, spreadAds: 0.36, recoilV: 0.85, recoilH: 0.5, kick: 0.85, adsZoom: 1.2, adsTime: 0.17, moveMult: 1.05, equipTime: 0.45, sight: 'reddot',
  sound: { kind: 'smg', pitch: 0.95, body: 0.65, crack: 0.85, tail: 0.3 },
});

// ---------------- ESCOPETAS ----------------
registerWeapon({
  id: 'breacher', name: 'Breacher M12', category: 'shotgun', mode: 'pump',
  desc: 'Escopeta de corredera calibre 12. Ocho postas por disparo: devastadora de cerca.',
  damage: 17, pellets: 8, rpm: 68, mag: 6, reserve: 36, reloadType: 'shell', shellTime: 0.52, reloadTime: 0.6,
  rangeNear: 7, rangeFar: 22, minFactor: 0.25, headMult: 1.3,
  spreadHip: 4.6, spreadAds: 3.6, spreadMove: 0.4, bloom: 0, recoilV: 4.2, recoilH: 1.2, kick: 2.4, adsZoom: 1.12, adsTime: 0.24,
  sound: { kind: 'shotgun', pitch: 0.8, body: 1.2, crack: 0.9, tail: 0.7 },
});
registerWeapon({
  id: 'striker', name: 'Striker SA-8', category: 'shotgun', mode: 'semi',
  desc: 'Escopeta semiautomática con cargador. Menos daño por disparo, mucha más cadencia.',
  damage: 13, pellets: 8, rpm: 230, mag: 8, reserve: 40, reloadTime: 2.6,
  rangeNear: 6, rangeFar: 19, minFactor: 0.25, headMult: 1.3,
  spreadHip: 5.2, spreadAds: 4.2, spreadMove: 0.4, bloom: 0.3, recoilV: 3.0, recoilH: 1.3, kick: 1.9, adsZoom: 1.12,
  sound: { kind: 'shotgun', pitch: 0.95, body: 1.0, crack: 0.9, tail: 0.5 },
});

// ---------------- FRANCOTIRADORES ----------------
registerWeapon({
  id: 'longbow', name: 'Longbow .338', category: 'sniper', mode: 'bolt',
  desc: 'Rifle de cerrojo de largo alcance. Un disparo al torso o la cabeza es definitivo.',
  damage: 105, rpm: 44, mag: 5, reserve: 25, reloadTime: 3.1, rangeNear: 90, rangeFar: 200, minFactor: 0.85, headMult: 2.2, legMult: 0.7,
  spreadHip: 6.5, spreadAds: 0.0, spreadMove: 2.5, bloom: 0, recoilV: 4.6, recoilH: 0.8, kick: 2.6,
  adsZoom: 5.5, adsTime: 0.36, scope: true, moveMult: 0.9, equipTime: 0.75,
  sound: { kind: 'sniper', pitch: 0.7, body: 1.3, crack: 1.2, tail: 1.0 },
});
registerWeapon({
  id: 'sentinel', name: 'Sentinel DMR', category: 'sniper', mode: 'semi',
  desc: 'Rifle de tirador semiautomático 7,62 con óptica 4x. Dos impactos bastan.',
  damage: 58, rpm: 240, mag: 10, reserve: 50, reloadTime: 2.6, rangeNear: 60, rangeFar: 150, minFactor: 0.8, headMult: 1.9,
  spreadHip: 4.5, spreadAds: 0.04, spreadMove: 2, bloom: 0.5, recoilV: 2.3, recoilH: 0.55, kick: 1.6,
  adsZoom: 3.6, adsTime: 0.3, scope: true, moveMult: 0.94, equipTime: 0.65,
  sound: { kind: 'sniper', pitch: 0.9, body: 1.0, crack: 1.1, tail: 0.7 },
});

// ---------------- AMETRALLADORAS ----------------
registerWeapon({
  id: 'hammer', name: 'Hammer 249', category: 'lmg',
  desc: 'Ametralladora ligera de cinta. Cien cartuchos de fuego de supresión sostenido.',
  damage: 29, rpm: 720, mag: 100, reserve: 200, reloadType: 'belt', reloadTime: 4.6, rangeNear: 32, rangeFar: 85, minFactor: 0.75,
  spreadHip: 3.6, spreadAds: 0.4, spreadMove: 2, bloom: 0.22, bloomMax: 2.4, recoilV: 0.9, recoilH: 0.55, kick: 1.1,
  adsZoom: 1.3, adsTime: 0.36, moveMult: 0.84, equipTime: 0.9,
  sound: { kind: 'lmg', pitch: 0.92, body: 0.9, crack: 1.0, tail: 0.5 },
});

// ---------------- ARMAS HISTÓRICAS ----------------
registerWeapon({
  id: 'garrison', name: 'Garrison M1 (1936)', category: 'historic', mode: 'semi',
  desc: 'Fusil semiautomático de la Segunda Guerra Mundial. Peine de 8 cartuchos y su inconfundible «ping».',
  damage: 55, rpm: 290, mag: 8, reserve: 48, reloadType: 'clip', reloadTime: 2.2, rangeNear: 45, rangeFar: 110, minFactor: 0.8, headMult: 1.9,
  spreadHip: 3.2, spreadAds: 0.12, recoilV: 2.3, recoilH: 0.5, kick: 1.6, adsZoom: 1.4, adsTime: 0.25,
  sound: { kind: 'rifle', pitch: 0.7, body: 1.1, crack: 1.1, tail: 0.8, ping: true },
});
registerWeapon({
  id: 'chicago', name: 'Chicago M1928', category: 'historic',
  desc: 'El subfusil de tambor de los años veinte. Pesado, ruidoso y con 50 cartuchos del .45.',
  damage: 25, rpm: 700, mag: 50, reserve: 150, reloadTime: 3.0, rangeNear: 13, rangeFar: 36, minFactor: 0.5,
  spreadHip: 2.5, spreadAds: 0.4, recoilV: 0.85, recoilH: 0.5, adsZoom: 1.2, moveMult: 0.96,
  sound: { kind: 'smg', pitch: 0.78, body: 0.9, crack: 0.8, tail: 0.4 },
});
registerWeapon({
  id: 'jager98', name: 'Jäger 98', category: 'historic', mode: 'bolt',
  desc: 'Fusil de cerrojo de 1898 con miras abiertas. Lento, preciso y letal.',
  damage: 92, rpm: 50, mag: 5, reserve: 30, reloadType: 'shell', shellTime: 0.48, reloadTime: 0.7,
  rangeNear: 70, rangeFar: 160, minFactor: 0.85, headMult: 2.2,
  spreadHip: 4.0, spreadAds: 0.05, spreadMove: 2, bloom: 0, recoilV: 3.8, recoilH: 0.6, kick: 2.2, adsZoom: 1.6, adsTime: 0.28, moveMult: 0.95,
  sound: { kind: 'sniper', pitch: 0.8, body: 1.2, crack: 1.1, tail: 0.9 },
});

// ---------------- ARMAS FUTURISTAS (FICTICIAS) ----------------
registerWeapon({
  id: 'pulse', name: 'PX-7 Pulse', category: 'future', energy: true, tracer: 0x4fd8ff,
  desc: 'Rifle de pulsos de plasma. Sin caída de daño apreciable y célula de energía de 40 descargas.',
  damage: 25, rpm: 660, mag: 40, reserve: 160, reloadType: 'cell', reloadTime: 2.0, rangeNear: 50, rangeFar: 120, minFactor: 0.8,
  spreadHip: 2.0, spreadAds: 0.15, recoilV: 0.55, recoilH: 0.25, kick: 0.6, adsZoom: 1.4, sight: 'holo',
  sound: { kind: 'pulse', pitch: 1.0, body: 0.6, crack: 0.6, tail: 0.4 },
});
registerWeapon({
  id: 'rail', name: 'ARC-9 Railgun', category: 'future', energy: true, tracer: 0xff7a3c, mode: 'semi',
  desc: 'Acelerador magnético. Un proyectil hipersónico por disparo: daño enorme, cadencia mínima.',
  damage: 120, rpm: 38, mag: 4, reserve: 20, reloadType: 'cell', reloadTime: 2.8, rangeNear: 120, rangeFar: 250, minFactor: 0.9, headMult: 2.0,
  spreadHip: 3.5, spreadAds: 0.0, spreadMove: 2, bloom: 0, recoilV: 3.6, recoilH: 0.5, kick: 2.2,
  adsZoom: 3.2, adsTime: 0.34, scope: true, moveMult: 0.9, equipTime: 0.8,
  sound: { kind: 'rail', pitch: 1.0, body: 1.4, crack: 1.0, tail: 1.2 },
});

export const DEFAULT_LOADOUT = { primary: 'mk4', secondary: 'p9' };
