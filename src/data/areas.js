// V2 area definitions — 3 areas, 35 total zones.
// Enemies use zone-range filtering instead of area field matching.

import { ENEMIES } from './enemies.js';

const AREAS = {
  1: {
    id: 1,
    name: 'The Whispering Woods',
    zoneCount: 10,
    zoneStart: 1,
    enemies: () => getEnemiesForArea(1),
  },
  2: {
    id: 2,
    name: 'The Blighted Mire',
    zoneCount: 10,
    zoneStart: 11,
    enemies: () => getEnemiesForArea(2),
  },
  3: {
    id: 3,
    name: 'The Shattered Ruins',
    zoneCount: 15,
    zoneStart: 21,
    enemies: () => getEnemiesForArea(3),
  },
};

/** Total zones across all areas. */
export const TOTAL_ZONES = 35;

/** Number of areas. */
export const AREA_COUNT = 3;

// ── Boss multipliers ────────────────────────────────────────────────

export const BOSS_TYPES = {
  MINI:  { label: 'Mini-Boss',       hpMult: 6,  atkMult: 3,   sizeMult: 1.5 },
  ELITE: { label: 'Elite Mini-Boss', hpMult: 5,  atkMult: 2,   sizeMult: 1.5 },
  AREA:  { label: 'Area Boss',       hpMult: 8,  atkMult: 2.5, sizeMult: 2 },
};

// ── Zone scaling ────────────────────────────────────────────────────

/** Per-stat asymmetric scaling rates (replaces uniform 0.15). */
export const ZONE_SCALING = {
  hp:   0.10,  // Enemy HP scales slowly — creates snowball
  atk:  0.12,  // Enemy ATK scales moderately — danger rises
  gold: 0.18,  // Gold scales fast — rewards outpace difficulty
  xp:   0.08,  // XP scales slowly — prevents over-leveling
};

/** Stat multiplier applied to regular enemies based on zone number within an area. */
export function getZoneScaling(zoneNum, stat) {
  const rate = (stat && ZONE_SCALING[stat]) ?? 0.10;
  return 1 + (zoneNum - 1) * rate;
}

/**
 * Per-zone stat bias — multipliers applied ON TOP of getZoneScaling().
 * Key: global zone number. Stat keys: hp, atk, def, speed, regen, dot, gold, xp.
 * Omitting a stat (or a zone) = 1.0 (no correction). All other zones unaffected.
 *
 * Example:
 *   5: { atk: 0.85 },            // zone 5 enemies hit 15% softer than the curve
 *   7: { hp: 1.25, atk: 1.1 },  // zone 7 spike — tankier and harder
 */
export const ZONE_BALANCE = {
  2: { hp: 1.2, atk: 1.2, def: 1.2 },
  3: { hp: 1.2, atk: 1.2, def: 1.2 },
  4: { atk: 1.2 },
  5: { hp: 1.3, atk: 1.35, def: 1.3, gold: 1.3, xp: 1.3 },
};

/** Returns the bias multiplier for a given global zone + stat. Defaults to 1.0. */
export function getZoneBias(globalZone, stat) {
  const value = ZONE_BALANCE[globalZone]?.[stat];
  if (!Number.isFinite(value)) return 1.0;
  if (stat === 'speed') return Math.max(0.01, value);
  return value;
}

/** Kill threshold to trigger "Challenge Boss" button. */
const BOSS_KILL_THRESHOLDS = [
  10, 15, 15, 20, 20,
  25, 25, 30, 35, 35,
  40, 40, 45, 45, 50,
];

export function getBossKillThreshold(zoneNum, zoneCount = BOSS_KILL_THRESHOLDS.length) {
  const cappedCount = Math.max(1, Math.min(zoneCount, BOSS_KILL_THRESHOLDS.length));
  const cappedZone = Math.max(1, Math.min(zoneNum, cappedCount));
  return BOSS_KILL_THRESHOLDS[cappedZone - 1];
}

/** Gold/XP drop multiplier for bosses: base × hpMult × 1.5 */
export function getBossDropMultiplier(bossType) {
  return bossType.hpMult * 1.5;
}

// ── Boss type resolution ────────────────────────────────────────────

/**
 * Returns the boss type for a given zone within an area.
 * - Last zone of area: AREA boss
 * - Every 5th zone: ELITE mini-boss
 * - All other zones: MINI boss
 */
export function getBossType(areaId, zoneNum) {
  const area = AREAS[areaId];
  if (!area) return BOSS_TYPES.MINI;

  if (zoneNum === area.zoneCount) return BOSS_TYPES.AREA;
  if (zoneNum % 5 === 0) return BOSS_TYPES.ELITE;
  return BOSS_TYPES.MINI;
}

// ── Enemy access helpers ────────────────────────────────────────────

/**
 * Get all enemies whose zone range overlaps with an area's zone range.
 * Sorted by HP ascending (unlock order).
 */
function getEnemiesForArea(areaId) {
  const area = AREAS[areaId];
  if (!area) return [];
  const start = area.zoneStart;
  const end = start + area.zoneCount - 1;
  return ENEMIES
    .filter(e => e.zones[1] >= start && e.zones[0] <= end)
    .sort((a, b) => a.hp - b.hp);
}

/**
 * Get the enemies available at a specific zone within an area.
 * Uses zone-range filtering: enemy is available if globalZone falls within its [min, max] range.
 */
export function getUnlockedEnemies(areaId, zoneNum) {
  const area = AREAS[areaId];
  if (!area) return [];
  const globalZone = area.zoneStart + zoneNum - 1;
  return ENEMIES
    .filter(e => globalZone >= e.zones[0] && globalZone <= e.zones[1])
    .sort((a, b) => a.hp - b.hp);
}

/**
 * Get the strongest enemy available at a specific zone within an area.
 * Used as the base template for boss stat scaling.
 */
export function getStrongestEnemy(areaId, zoneNum) {
  const unlocked = getUnlockedEnemies(areaId, zoneNum);
  return unlocked.length > 0 ? unlocked[unlocked.length - 1] : null;
}

export function getArea(areaId) {
  return AREAS[areaId] || null;
}

export function getAllAreas() {
  return Object.values(AREAS);
}

export { AREAS };
