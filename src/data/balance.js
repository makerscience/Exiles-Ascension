// Per-entity stat multipliers applied on top of zone scaling.
// Sparse map format: { entityId: { stat: multiplier } }
// Missing entity/stat defaults to 1.0.

export const ENEMY_BALANCE = {
  'a1_rat': { atk: 1.14, xp: 1.25 },
  'a1_slime': { atk: 1.67, regen: 0.40 },
};

export const BOSS_BALANCE = {
  'boss_a1z1_rotfang': { atk: 0.80, speed: -0.65 },
};

export function getEnemyBias(enemyId, stat) {
  return ENEMY_BALANCE[enemyId]?.[stat] ?? 1.0;
}

export function getBossBias(bossId, stat) {
  return BOSS_BALANCE[bossId]?.[stat] ?? 1.0;
}

// Loot drop-rate overrides.
// areaDropRate keys: area id (1-based). zoneDropRate keys: global zone number.
// Values are absolute normal-drop chances in [0, 1], where 0.10 = 10%.
// Final normal drop chance resolution is: zone override -> area override -> LOOT_V2.normalDropChance.
export const LOOT_BALANCE = {
  areaDropRate: {},
  zoneDropRate: { 1: 0.3, 2: 0.2 },
};

function sanitizeDropRate(value, fallback) {
  if (!Number.isFinite(value)) return fallback;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function getAreaDropRate(areaId, fallback) {
  const value = LOOT_BALANCE.areaDropRate?.[areaId];
  return sanitizeDropRate(value, fallback);
}

export function getZoneDropRate(globalZone, fallback) {
  const value = LOOT_BALANCE.zoneDropRate?.[globalZone];
  return sanitizeDropRate(value, fallback);
}

export function getNormalDropChance(areaId, globalZone, baseChance) {
  const areaRate = getAreaDropRate(areaId, baseChance);
  return getZoneDropRate(globalZone, areaRate);
}

export const PLAYER_BALANCE = {
  xpBias: { 3: 1.05, 10: 1.05 },
  xpBase: {},
  statGrowthBias: {},
  xpOverride: {},
  statGrowthOverride: {},
};

export function getXpBias(level) {
  return PLAYER_BALANCE.xpBias[level] ?? 1.0;
}

export function getStatGrowthBias(stat) {
  return PLAYER_BALANCE.statGrowthBias[stat] ?? 1.0;
}

export function getXpOverride(level) {
  const v = PLAYER_BALANCE.xpOverride?.[level];
  if (!Number.isFinite(v)) return null;
  const n = Math.floor(v);
  return n > 0 ? n : null;
}

export function getXpBaseValue(level, canonicalBaseValue) {
  const v = PLAYER_BALANCE.xpBase?.[level];
  if (!Number.isFinite(v)) return Math.floor(canonicalBaseValue);
  const n = Math.floor(v);
  return n > 0 ? n : Math.floor(canonicalBaseValue);
}

export function getStatGrowthOverride(stat) {
  const v = PLAYER_BALANCE.statGrowthOverride?.[stat];
  return Number.isFinite(v) ? v : null;
}

export function getXpForLevelValue(level, baseValue) {
  const override = getXpOverride(level);
  if (override != null) return override;
  return Math.floor(getXpBaseValue(level, baseValue) * getXpBias(level));
}

export function getStatGrowthValue(stat, baseValue) {
  const override = getStatGrowthOverride(stat);
  if (override != null) return override;
  return baseValue * getStatGrowthBias(stat);
}
