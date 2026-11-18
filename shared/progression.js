// Progreso: experiencia, niveles y desbloqueos (armas, camuflajes, acabados y granadas tácticas).
export const MAX_LEVEL = 30;

/** Experiencia total necesaria para alcanzar el nivel n (nivel 1 = 0). */
export function xpForLevel(n) {
  n = Math.max(1, Math.min(MAX_LEVEL, n));
  const k = n - 1;
  return k * 800 + 100 * k * (k - 1);
}
export function levelFromXp(xp) {
  let n = 1;
  while (n < MAX_LEVEL && xp >= xpForLevel(n + 1)) n++;
  return n;
}
/** {level, cur, need, frac}: progreso dentro del nivel actual. */
export function levelInfo(xp) {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, cur: 0, need: 0, frac: 1, max: true };
  const a = xpForLevel(level), b = xpForLevel(level + 1);
  return { level, cur: xp - a, need: b - a, frac: (xp - a) / (b - a), max: false };
}

/** Nivel requerido para cada objeto. Lo que no aparece está disponible desde el principio. */
export const UNLOCKS = {
  weapon: { p9: 1, mk4: 1, viper9: 1, breacher: 2, akv: 3, kestrel: 4, sentinel: 5, swift45: 6, striker: 8, longbow: 10,
    hammer: 12, garrison: 14, chicago: 16, jager98: 18, pulse: 21, rail: 25 },
  skin: { woodland: 1, desert: 3, urban: 6, night: 11, arctic: 15 },
  finish: { standard: 1, tan: 4, olive: 7, arctic: 13, crimson: 19, gold: 28 },
  tactical: { smoke: 1, flash: 5 },
};
export function unlockLevel(kind, id) { return UNLOCKS[kind]?.[id] ?? 1; }
export function isUnlocked(kind, id, level) { return level >= unlockLevel(kind, id); }
/** Objetos que se desbloquean al pasar del nivel a al nivel b (a < nivel <= b). */
export function unlocksBetween(a, b) {
  const out = [];
  for (const [kind, list] of Object.entries(UNLOCKS)) for (const [id, lv] of Object.entries(list)) if (lv > a && lv <= b) out.push({ kind, id, level: lv });
  return out.sort((x, y) => x.level - y.level);
}

/** Experiencia ganada en una partida. */
export function matchXp({ score = 0, won = false, draw = false, mode = 'tdm', minutes = 0 }) {
  if (mode === 'training') return { total: 0, parts: [] };
  const parts = [['Puntuación', Math.round(score)], ['Partida completada', 200]];
  if (won) parts.push(['Victoria', 500]); else if (draw) parts.push(['Empate', 250]);
  if (minutes > 0) parts.push(['Tiempo en combate', Math.round(Math.min(20, minutes) * 20)]);
  return { total: parts.reduce((s, p) => s + p[1], 0), parts };
}
