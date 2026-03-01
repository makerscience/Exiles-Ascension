// Store — centralized game state. Named mutation methods are the only write path.
// State holds live Decimal instances; strings only exist in localStorage.

import { D, fromJSON, Decimal } from './BigNum.js';
import { PROGRESSION_V2, ECONOMY, SAVE, PRESTIGE, STANCE_IDS } from '../config.js';
import { emit, EVENTS } from '../events.js';
import { AREAS } from '../data/areas.js';
import { ALL_SLOT_IDS } from '../data/equipSlots.js';

import { getEffectiveMaxHp } from './ComputedStats.js';

let state = null;

/** Build initial areaProgress for all areas. */
function createAreaProgress() {
  const progress = {};
  for (const areaId of Object.keys(AREAS)) {
    progress[areaId] = {
      furthestZone: 0,       // 0 = not yet entered (area locked)
      bossesDefeated: [],    // zone numbers where boss was beaten
      zoneClearKills: {},     // { zoneNum: killCount } — kills toward boss threshold
    };
  }
  // Area 1 starts unlocked
  progress[1].furthestZone = 1;
  return progress;
}

/** Build a fresh default state from config values. */
function createInitialState() {
  const stats = PROGRESSION_V2.startingStats;
  return {
    schemaVersion: SAVE.schemaVersion,
    gold: D(ECONOMY.startingGold),
    glitchFragments: D(ECONOMY.startingFragments),
    mana: D(100),
    playerStats: {
      str: stats.str,
      def: stats.def,
      hp: stats.hp,
      regen: stats.regen,
      agi: stats.agi,
      level: stats.level,
      xp: D(stats.xp),
      xpToNext: D(PROGRESSION_V2.xpForLevel(stats.level)),
    },
    playerHp: D(stats.hp),
    equipped: Object.fromEntries(ALL_SLOT_IDS.map(id => [id, null])),
    inventoryStacks: {},
    purchasedUpgrades: {},
    skillPoints: 0,
    enhancementLevels: Object.fromEntries(ENHANCEABLE_SLOT_IDS.map(id => [id, 0])),
    totalKills: 0,
    currentArea: 1,
    currentZone: 1,
    furthestArea: 1,
    areaProgress: createAreaProgress(),
    prestigeCount: 0,
    prestigeMultiplier: D(1),
    unlockedCheats: [],
    activeCheats: {},
    titles: [],
    flags: {
      crackTriggered: false, firstKill: false, firstLevelUp: false,
      reachedZone2: false, reachedZone3: false, reachedZone4: false, reachedZone5: false,
      firstEquip: false, firstFragment: false, firstMerge: false,
      firstPrestige: false, firstSell: false, firstLaunch: false,
      kills100: false, kills500: false, kills1000: false, kills5000: false,
      firstTerritoryClaim: false,
      unlockedArmorBreak: false, unlockedInterrupt: false, unlockedCleanse: false,
      shownUnlockArmorBreak: false, shownUnlockInterrupt: false, shownUnlockCleanse: false,
      firstStanceSwitch: false, firstThornsHit: false, firstEvasionDodge: false, firstRegenHeal: false,
      waterskinEquipHintDone: false,
      waterskinDropPopupShown: false,
      waterskinDrinkPopupShown: false,
      enhanceTutorialZone3KillCount: 0,
      enhanceTutorialIntroShown: false,
      enhanceTutorialStage: 'inactive',
      enhanceTutorialCompleted: false,
      // Area entrance flags
      reachedArea2: false, reachedArea3: false, reachedArea4: false, reachedArea5: false,
    },
    currentStance: 'tempest',
    settings: { autoAttack: false, musicVolume: 0 },
    lootPity: { head: 0, chest: 0, main_hand: 0, legs: 0, boots: 0, gloves: 0, amulet: 0 },
    killsPerEnemy: {},
    territories: {},
    timestamps: { lastSave: 0, lastOnline: 0 },
  };
}

// Fields that are stored as Decimal (BigNum) — used for hydration
const DECIMAL_FIELDS = ['gold', 'glitchFragments', 'mana', 'prestigeMultiplier', 'playerHp'];
const DECIMAL_STAT_FIELDS = ['xp', 'xpToNext'];
const ENHANCEABLE_SLOT_IDS = ['head', 'chest', 'main_hand', 'legs', 'boots', 'gloves', 'amulet'];

/**
 * Hydrate a saved plain object (strings from JSON) into live Decimal instances.
 * Merges field-by-field onto a fresh default so missing keys get defaults.
 */
function hydrateState(saved) {
  const fresh = createInitialState();

  // Schema version
  fresh.schemaVersion = saved.schemaVersion ?? fresh.schemaVersion;

  // Top-level Decimal fields
  for (const key of DECIMAL_FIELDS) {
    if (saved[key] != null) fresh[key] = fromJSON(saved[key]);
  }

  // playerStats — plain numbers + Decimal sub-fields
  if (saved.playerStats) {
    for (const key of ['str', 'def', 'hp', 'regen', 'agi', 'level']) {
      if (saved.playerStats[key] != null) fresh.playerStats[key] = saved.playerStats[key];
    }
    for (const key of DECIMAL_STAT_FIELDS) {
      if (saved.playerStats[key] != null) fresh.playerStats[key] = fromJSON(saved.playerStats[key]);
    }
  }

  // Simple objects / arrays — shallow copy
  if (saved.equipped) {
    fresh.equipped = { ...fresh.equipped, ...saved.equipped };
    // Migrate old slot key names (body→chest, weapon→main_hand)
    if (saved.equipped.body && !saved.equipped.chest) {
      fresh.equipped.chest = saved.equipped.body;
    }
    if (saved.equipped.weapon && !saved.equipped.main_hand) {
      fresh.equipped.main_hand = saved.equipped.weapon;
    }
    delete fresh.equipped.body;
    delete fresh.equipped.weapon;
  }
  if (saved.inventoryStacks) fresh.inventoryStacks = saved.inventoryStacks;
  if (saved.purchasedUpgrades) fresh.purchasedUpgrades = { ...saved.purchasedUpgrades };
  if (saved.skillPoints != null) {
    const points = Number(saved.skillPoints);
    fresh.skillPoints = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
  }
  if (saved.enhancementLevels) {
    const merged = {
      ...fresh.enhancementLevels,
      ...saved.enhancementLevels,
    };
    for (const slotId of Object.keys(merged)) {
      const lvl = Number(merged[slotId]);
      merged[slotId] = Number.isFinite(lvl) ? Math.max(0, Math.floor(lvl)) : 0;
    }
    fresh.enhancementLevels = merged;
  }
  if (saved.totalKills != null) fresh.totalKills = saved.totalKills;
  if (saved.currentArea != null) fresh.currentArea = saved.currentArea;
  if (saved.currentZone != null) fresh.currentZone = saved.currentZone;
  if (saved.furthestArea != null) fresh.furthestArea = saved.furthestArea;
  if (saved.areaProgress) fresh.areaProgress = JSON.parse(JSON.stringify(saved.areaProgress));
  if (saved.prestigeCount != null) fresh.prestigeCount = saved.prestigeCount;
  if (saved.unlockedCheats) fresh.unlockedCheats = [...saved.unlockedCheats];
  if (saved.activeCheats) fresh.activeCheats = { ...saved.activeCheats };
  if (saved.titles) fresh.titles = [...saved.titles];
  if (saved.currentStance) {
    const mappedStance = saved.currentStance === 'power'
      ? 'ruin'
      : saved.currentStance === 'flurry'
        ? 'tempest'
        : saved.currentStance;
    if (STANCE_IDS.includes(mappedStance)) {
      fresh.currentStance = mappedStance;
    }
  }
  if (saved.flags) fresh.flags = { ...fresh.flags, ...saved.flags };
  if (saved.settings) fresh.settings = { ...fresh.settings, ...saved.settings };
  if (saved.timestamps) fresh.timestamps = { ...fresh.timestamps, ...saved.timestamps };
  if (saved.lootPity) fresh.lootPity = { ...fresh.lootPity, ...saved.lootPity };
  if (saved.killsPerEnemy) fresh.killsPerEnemy = { ...saved.killsPerEnemy };
  if (saved.territories) fresh.territories = JSON.parse(JSON.stringify(saved.territories));

  return fresh;
}

// ── Public API ──────────────────────────────────────────────────────

const Store = {
  /** Initialize with default state. */
  init() {
    state = createInitialState();
  },

  /** Tear down — null out state. */
  destroy() {
    state = null;
  },

  /** Read-only access to live state. */
  getState() {
    return state;
  },

  /** Replace state with hydrated save data. Called by SaveManager on load. */
  loadState(saved) {
    state = hydrateState(saved);
  },

  /** Reset to factory defaults. */
  resetState() {
    state = createInitialState();
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['all'] });
  },

  // ── XP / Level mutations ────────────────────────────────────────

  /** Add raw XP without level-up processing. Use Progression.grantXp() for full XP flow. */
  addRawXp(amount) {
    const xpGain = D(amount);
    state.playerStats.xp = state.playerStats.xp.plus(xpGain);
    emit(EVENTS.PROG_XP_GAINED, { amount: xpGain });
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['playerStats'] });
  },

  /** Apply one level-up: subtract xpToNext, increment level, apply stat growth, recalculate xpToNext. */
  applyLevelUp() {
    state.playerStats.xp = state.playerStats.xp.minus(state.playerStats.xpToNext);
    state.playerStats.level += 1;

    const growth = PROGRESSION_V2.statGrowthPerLevel;
    state.playerStats.str += growth.str;
    state.playerStats.def += growth.def;
    state.playerStats.hp += growth.hp;
    state.playerStats.regen += growth.regen;
    state.playerStats.agi += growth.agi;

    state.playerStats.xpToNext = D(PROGRESSION_V2.xpForLevel(state.playerStats.level));
    state.skillPoints += 1;

    emit(EVENTS.PROG_LEVEL_UP, {
      level: state.playerStats.level,
      stats: { ...state.playerStats },
    });
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['playerStats', 'skillPoints'] });
  },

  // ── Currency mutations ──────────────────────────────────────────

  addGold(amount) {
    state.gold = state.gold.plus(D(amount));
    emit(EVENTS.ECON_GOLD_GAINED, { amount: D(amount) });
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['gold'] });
  },

  addFragments(amount) {
    state.glitchFragments = state.glitchFragments.plus(D(amount));
    emit(EVENTS.ECON_FRAGMENTS_GAINED, { amount: D(amount) });
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['glitchFragments'] });
  },

  setMana(current) {
    state.mana = D(current);
    emit(EVENTS.ECON_MANA_CHANGED, { mana: state.mana });
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['mana'] });
  },

  spendGold(amount) {
    state.gold = state.gold.minus(D(amount));
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['gold'] });
  },

  spendFragments(amount) {
    state.glitchFragments = state.glitchFragments.minus(D(amount));
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['glitchFragments'] });
  },

  addSkillPoints(amount) {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (n <= 0) return;
    state.skillPoints += n;
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['skillPoints'] });
  },

  spendSkillPoints(amount) {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (n <= 0) return true;
    if (state.skillPoints < n) return false;
    state.skillPoints -= n;
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['skillPoints'] });
    return true;
  },

  /** Multiply gold by a retention fraction (used during prestige). */
  retainGold(retention) {
    state.gold = state.gold.times(retention).floor();
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['gold'] });
  },

  // ── Navigation mutations ────────────────────────────────────────

  /** Navigate to a specific area and zone. */
  setAreaZone(area, zone) {
    const prevArea = state.currentArea;
    state.currentArea = area;
    state.currentZone = zone;

    emit(EVENTS.WORLD_ZONE_CHANGED, { zone, area });
    if (area !== prevArea) {
      emit(EVENTS.WORLD_AREA_CHANGED, { area, prevArea });
    }
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['currentArea', 'currentZone'] });
  },

  setFurthestArea(area) {
    state.furthestArea = Math.max(state.furthestArea, area);
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['furthestArea'] });
  },

  /** Update areaProgress for a specific area. */
  updateAreaProgress(areaId, updates) {
    if (!state.areaProgress[areaId]) {
      state.areaProgress[areaId] = { furthestZone: 0, bossesDefeated: [], zoneClearKills: {} };
    }
    Object.assign(state.areaProgress[areaId], updates);
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['areaProgress'] });
  },

  /** Record a boss defeated in areaProgress. */
  recordBossDefeated(areaId, zoneNum) {
    if (!state.areaProgress[areaId]) {
      state.areaProgress[areaId] = { furthestZone: 0, bossesDefeated: [], zoneClearKills: {} };
    }
    if (!state.areaProgress[areaId].bossesDefeated.includes(zoneNum)) {
      state.areaProgress[areaId].bossesDefeated.push(zoneNum);
    }
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['areaProgress'] });
  },

  /** Increment zone clear kills for boss threshold tracking. */
  incrementZoneClearKills(areaId, zoneNum) {
    if (!state.areaProgress[areaId]) {
      state.areaProgress[areaId] = { furthestZone: 0, bossesDefeated: [], zoneClearKills: {} };
    }
    const kills = state.areaProgress[areaId].zoneClearKills;
    kills[zoneNum] = (kills[zoneNum] || 0) + 1;
    // No event — high frequency (BossManager reads directly)
  },

  /** Advance furthest zone in an area's progress. */
  advanceAreaZone(areaId, zoneNum) {
    if (!state.areaProgress[areaId]) {
      state.areaProgress[areaId] = { furthestZone: 0, bossesDefeated: [], zoneClearKills: {} };
    }
    state.areaProgress[areaId].furthestZone = Math.max(
      state.areaProgress[areaId].furthestZone, zoneNum
    );
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['areaProgress'] });
  },

  /** Reset areaProgress to initial state (used during prestige). */
  resetAreaProgress() {
    state.areaProgress = createAreaProgress();
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['areaProgress'] });
  },

  // ── Player stat mutations ───────────────────────────────────────

  /** Add a flat bonus to a player stat (str, def, hp, regen, agi). */
  addFlatStat(stat, amount) {
    state.playerStats[stat] += amount;
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['playerStats'] });
  },

  /** Reset player stats to starting values (used during prestige). */
  resetPlayerStats() {
    const stats = PROGRESSION_V2.startingStats;
    state.playerStats.str = stats.str;
    state.playerStats.def = stats.def;
    state.playerStats.hp = stats.hp;
    state.playerStats.regen = stats.regen;
    state.playerStats.agi = stats.agi;
    state.playerStats.level = stats.level;
    state.playerStats.xp = D(stats.xp);
    state.playerStats.xpToNext = D(PROGRESSION_V2.xpForLevel(stats.level));
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['playerStats'] });
  },

  setFlag(key, value) {
    state.flags[key] = value;
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['flags'] });
  },

  // ── Inventory / Equipment mutations ─────────────────────────────

  addInventoryItem(stackKey, count = 1) {
    const stacks = state.inventoryStacks;
    if (stacks[stackKey]) {
      stacks[stackKey].count += count;
    } else {
      // Extract rarity from composite key (e.g. 'iron_dagger::rare' → 'rare')
      const rarity = stackKey.includes('::') ? stackKey.split('::')[1] : 'common';
      stacks[stackKey] = { count, tier: 0, rarity };
    }
    emit(EVENTS.INV_ITEM_ADDED, { itemId: stackKey, count, totalCount: stacks[stackKey].count });
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['inventoryStacks'] });
  },

  removeInventoryItem(itemId, count = 1) {
    const stacks = state.inventoryStacks;
    if (!stacks[itemId]) return;
    stacks[itemId].count -= count;
    if (stacks[itemId].count <= 0) {
      delete stacks[itemId];
    }
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['inventoryStacks'] });
  },

  equipItem(slot, itemId) {
    state.equipped[slot] = itemId;
    emit(EVENTS.INV_ITEM_EQUIPPED, { slot, itemId });
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['equipped'] });
  },

  unequipItem(slot) {
    state.equipped[slot] = null;
    emit(EVENTS.INV_ITEM_EQUIPPED, { slot, itemId: null });
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['equipped'] });
  },

  // ── Upgrade mutations ──────────────────────────────────────────

  upgradeLevel(upgradeId) {
    if (!state.purchasedUpgrades[upgradeId]) {
      state.purchasedUpgrades[upgradeId] = 0;
    }
    state.purchasedUpgrades[upgradeId] += 1;
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['purchasedUpgrades'] });
    return state.purchasedUpgrades[upgradeId];
  },

  getEnhancementLevel(slotId) {
    return state.enhancementLevels[slotId] || 0;
  },

  incrementEnhancementLevel(slotId) {
    if (!(slotId in state.enhancementLevels)) return 0;
    state.enhancementLevels[slotId] += 1;
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['enhancementLevels'] });
    return state.enhancementLevels[slotId];
  },

  /** Reset skill points to zero (used during prestige). */
  resetSkillPoints() {
    state.skillPoints = 0;
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['skillPoints'] });
  },

  /** Reset purchased upgrades (used during prestige). */
  resetPurchasedUpgrades() {
    state.purchasedUpgrades = {};
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['purchasedUpgrades'] });
  },

  // ── Cheat mutations ───────────────────────────────────────────────

  unlockCheat(cheatId) {
    if (state.unlockedCheats.includes(cheatId)) return;
    state.unlockedCheats.push(cheatId);
    state.activeCheats[cheatId] = true;
    emit(EVENTS.CHEAT_UNLOCKED, { cheatId });
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['unlockedCheats', 'activeCheats'] });
  },

  toggleCheat(cheatId) {
    state.activeCheats[cheatId] = !state.activeCheats[cheatId];
    emit(EVENTS.CHEAT_TOGGLED, { cheatId, active: state.activeCheats[cheatId] });
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['activeCheats'] });
  },

  isCheatActive(cheatId) {
    return state.activeCheats[cheatId] === true;
  },

  // ── Prestige mutations ────────────────────────────────────────────

  /** Increment prestige count and recalculate multiplier. */
  incrementPrestigeCount() {
    state.prestigeCount += 1;
    state.prestigeMultiplier = D(PRESTIGE.multiplierFormula(state.prestigeCount));
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['prestigeCount', 'prestigeMultiplier'] });
  },

  // ── Player HP mutations ──────────────────────────────────────────

  damagePlayer(amount) {
    state.playerHp = Decimal.max(state.playerHp.minus(D(amount)), D(0));
    const maxHp = getEffectiveMaxHp();
    emit(EVENTS.COMBAT_PLAYER_DAMAGED, {
      amount: D(amount),
      remainingHp: state.playerHp,
      maxHp,
    });
    if (state.playerHp.lte(0)) {
      emit(EVENTS.COMBAT_PLAYER_DIED, {});
    }
  },

  healPlayer(amount) {
    const maxHp = getEffectiveMaxHp();
    state.playerHp = Decimal.min(state.playerHp.plus(D(amount)), maxHp);
    emit(EVENTS.COMBAT_PLAYER_DAMAGED, {
      amount: D(0),
      remainingHp: state.playerHp,
      maxHp,
    });
  },

  getPlayerMaxHp() {
    return getEffectiveMaxHp();
  },

  resetPlayerHp() {
    state.playerHp = getEffectiveMaxHp();
  },

  // ── Kill tracking mutations ──────────────────────────────────────

  incrementKills() {
    state.totalKills += 1;
  },

  /** Reset total kills (used during prestige). */
  resetTotalKills() {
    state.totalKills = 0;
  },

  incrementEnemyKills(enemyId) {
    if (!state.killsPerEnemy[enemyId]) state.killsPerEnemy[enemyId] = 0;
    state.killsPerEnemy[enemyId] += 1;
    // High frequency — no event emit (TerritoryManager reads directly)
  },

  // ── Loot pity mutations ──────────────────────────────────────────

  /** Increment pity counters for all active slots. */
  incrementAllPity() {
    for (const slot of Object.keys(state.lootPity)) {
      state.lootPity[slot] += 1;
    }
  },

  /** Reset pity counter for a single slot. */
  resetLootPity(slot) {
    if (slot in state.lootPity) {
      state.lootPity[slot] = 0;
    }
  },

  conquerTerritory(territoryId) {
    state.territories[territoryId] = { conquered: true, conqueredAt: Date.now() };
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['territories'] });
  },

  // ── Stance mutations ────────────────────────────────────────────

  setStance(stanceId) {
    if (!STANCE_IDS.includes(stanceId)) return;
    if (state.currentStance === stanceId) return;
    const previousStance = state.currentStance;
    state.currentStance = stanceId;
    emit(EVENTS.STANCE_CHANGED, { stanceId, previousStance });
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['currentStance'] });
  },

  updateSetting(key, value) {
    state.settings[key] = value;
    emit(EVENTS.STATE_CHANGED, { changedKeys: ['settings'] });
  },

  updateTimestamps(partial) {
    Object.assign(state.timestamps, partial);
    // Internal bookkeeping — no event emitted
  },
};

export default Store;
