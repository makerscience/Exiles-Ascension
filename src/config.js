import { getXpBaseValue, getXpForLevelValue, getStatGrowthValue } from './data/balance.js';

// Game balance constants — all tuning numbers live here.

export const DAMAGE_FORMULAS = {
  mortal:   (str, wpn) => str * 1.2 + wpn,
  awakened: (str, wpn, skill) => str ** 2 + skill * wpn ** 2,
  godhood:  (str, wpn, skill) => wpn * Math.exp(skill / 10),
};

export const COMBAT = {
  critChance: 0.05,
  critMultiplier: 2,
  autoAttackInterval: 1600,   // ms
  spawnDelay: 1000,           // ms after kill before next enemy
  enemyAttackInterval: 3000,       // ms — enemy attacks every 3 seconds
  playerHpPerVit: 10,              // max HP = vit * playerHpPerVit
  playerRegenPercent: 0.02,        // 2% of max HP per second
  playerRegenInterval: 1000,       // regen tick every 1s
  playerDeathRespawnDelay: 1500,   // ms before player respawns after death
};

export const PROGRESSION = {
  xpForLevel: (level) => Math.floor(100 * level ** 1.5),
  statGrowthPerLevel: {
    str: 2,
    vit: 1,
    luck: 0.5,
  },
  startingStats: {
    str: 5,
    vit: 10,
    luck: 1,
    level: 1,
    xp: 0,
  },
};

export const ECONOMY = {
  startingGold: 0,
  startingFragments: 0,
  goldMultiplierPerZone: 1.5,
  fragmentDropChance: 0.08,
};

export const LOOT = {
  rarityWeights: {
    common:    70,
    uncommon:  20,
    rare:       8,
    epic:       2,
  },
  rarityMultiplier: {
    common:   1,
    uncommon: 1.5,
    rare:     2.5,
    epic:     5,
  },
  mergeThreshold: 10,
};

export const INVENTORY = {
  maxUniqueStacks: 20,
  dropChanceByZone: { 1: 0.40, 2: 0.35, 3: 0.35, 4: 0.30, 5: 0.25 },
};

export const PRESTIGE = {
  multiplierFormula: (count) => 1 + count * 0.25,
  goldRetention: 0.10,
  minZone: 4,     // legacy — kept for backward compat
  minArea: 4,     // prestige unlocks at area 4
};

export const WORLD = {
  zoneCount: 5,   // legacy — total number of areas (was zones)
  areaCount: 5,
  width: 1280,
  height: 720,
};

export const CHEATS = {
  lootHoarder: {
    id: 'loot_hoarder',
    fragmentsRequired: 10,
    dropMultiplier: 3,        // items per successful drop roll when active
    dropChanceBoost: 1.5,     // multiplier on base drop chance when active
    dropChanceCap: 0.80,      // cap after boost
  },
};

export const SAVE = {
  schemaVersion: 4,
  autosaveInterval: 30_000,   // ms
  minOfflineTime: 60_000,                // 60s — skip if quicker reload
  maxOfflineTime: 12 * 60 * 60 * 1000,  // 12 hours in ms
};

// ── V2 constants (GDD vertical slice) ─────────────────────────────

export const PROGRESSION_V2 = {
  xpTable: [50,75,110,155,210,280,360,450,560,680,
            820,980,1160,1360,1580,1830,2100,2400,2750,3120,
            3530,3980,4480,5020,5620,6280,7000,7800,8680,9640,
            10700,11870,13150,14560,16100],
  xpForLevel(level) {
    let base;
    if (level <= 0) base = 50;
    else if (level <= 35) base = this.xpTable[level - 1];
    else base = Math.floor(getXpBaseValue(35, this.xpTable[34]) * (1.1 ** (level - 35)));
    return getXpForLevelValue(level, base);
  },
  get statGrowthPerLevel() {
    return {
      str: getStatGrowthValue('str', 2),
      def: getStatGrowthValue('def', 2),
      hp: getStatGrowthValue('hp', 12),
      regen: getStatGrowthValue('regen', 0.1),
      agi: getStatGrowthValue('agi', 0.5),
    };
  },
  startingStats: { str: 10, def: 5, hp: 100, regen: 1, agi: 3, atkSpeed: 1.0, level: 1, xp: 0 },
};

export const COMBAT_V2 = {
  playerDamage: (str, enemyDef) => Math.max(str - (enemyDef * 0.3), 1),
  enemyDamage: (dmg, playerDef, armorPen = 0) => {
    const effDef = playerDef * (1 - armorPen);
    return Math.max(dmg - (effDef * 0.5), 1);
  },
  evadePerAgi: 2.0,
  accuracyBias: 60,
  minHitChance: 0.35,
  maxHitChance: 0.95,
  evadeRating(agi) {
    return Math.max(0, agi * this.evadePerAgi);
  },
  enemyHitChance(enemyAccuracy, evadeRating) {
    const acc = Math.max(1, enemyAccuracy || 80);
    const raw = (acc + this.accuracyBias) / (acc + evadeRating + this.accuracyBias);
    return Math.min(this.maxHitChance, Math.max(this.minHitChance, raw));
  },
  dodgeChance(enemyAccuracy, evadeRating) {
    return 1 - this.enemyHitChance(enemyAccuracy, evadeRating);
  },
  baseAttackIntervalMs: 2000,
  playerBaseAtkSpeed: 1.0,
  spawnDelay: 1000,
  playerDeathRespawnDelay: 1500,
  clickDamageScalar: 0.2,
  maxEncounterSize: 5,
  encounterSpread: 140,         // px between slot centers for multi-enemy layout
  summonedAddRewardMult: 0,     // summoned adds are non-farmable by default
  corruption: {
    maxStacks: 8,
    perStackRegenReduction: 0.1,
    perStackAtkReduction: 0.06,
    dotPerStack: 2,
    decayMs: 4000,
    tickMs: 1000,
  },
};

export const ABILITIES = {
  armorBreak: { durationMs: 6000, defReductionPercent: 0.35, cooldownMs: 15000 },
  interrupt: { cooldownMs: 10000, fallbackDelayMs: 1200 },
  cleanse: { cooldownMs: 20000 },
};

export const LOOT_V2 = {
  normalDropChance: 0.10,
  bossFirstKillDrops: 1,
  bossFirstKillUncommonChance: 0.30,
  bossRepeatDrops: 1,
  bossRepeatUncommonChance: 0.11,
  rarityWeights: { common: 89, uncommon: 11 },
  rarityMultiplier: { common: 1, uncommon: 1.5 },
  slotWeights: { main_hand: 16, chest: 15, head: 14, legs: 14, boots: 14, gloves: 14, amulet: 13 },
  pityThreshold: 5,
};

// ── Stances ──────────────────────────────────────────────────────────

export const STANCES = {
  tempest:  { id: 'tempest',  label: 'Tempest',  atkSpeedMult: 1.8, damageMult: 0.6, damageReduction: 0.0 },
  ruin:     { id: 'ruin',     label: 'Breaker',  atkSpeedMult: 0.55, damageMult: 2.0, damageReduction: 0.2 },
  fortress: { id: 'fortress', label: 'Fortress', atkSpeedMult: 0.8, damageMult: 0.8, damageReduction: 0.5 },
};

export const STANCE_IDS = ['tempest', 'ruin', 'fortress'];
export const STANCE_SWITCH_PAUSE_MS = 500;

// Re-export layout and theme for backward compatibility.
// Consumers can import directly from config/layout.js or config/theme.js instead.
export { LAYOUT, TERRITORY } from './config/layout.js';
export { COLORS, ZONE_THEMES, PARALLAX, TREE_ROWS, FERN_ROWS, UI } from './config/theme.js';

