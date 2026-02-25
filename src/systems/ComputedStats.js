// ComputedStats — pure functions that compute derived stats from state + system queries.
// No state mutation, no events — just math. Eliminates duplicate formulas across systems.

import Store from './Store.js';
import UpgradeManager from './UpgradeManager.js';
import TerritoryManager from './TerritoryManager.js';
import EnhancementManager from './EnhancementManager.js';
import { D } from './BigNum.js';
import { COMBAT_V2, STANCES } from '../config.js';
import { getScaledItem } from '../data/items.js';

let _combatDebuffs = {
  attackMult: 1,
  regenMult: 1,
};

function _clampMultiplier(value, fallback = 1) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, value);
}

/** Sum a single stat key across all equipped gear. */
function getEquipmentStatSum(statKey) {
  const state = Store.getState();
  let sum = 0;
  for (const [slotId, stackKey] of Object.entries(state.equipped)) {
    if (!stackKey) continue;
    const item = getScaledItem(stackKey);
    if (item && item.statBonuses[statKey]) {
      const mult = EnhancementManager.getBonusMultiplier(slotId);
      sum += item.statBonuses[statKey] * mult;
    }
  }
  return sum;
}

/** Effective STR after gear and territory buffs. */
export function getEffectiveStr() {
  const state = Store.getState();
  return state.playerStats.str + getEquipmentStatSum('str') + TerritoryManager.getBuffValue('flatStr');
}

/** Effective DEF after gear and territory buffs. */
export function getEffectiveDef() {
  const state = Store.getState();
  return state.playerStats.def + getEquipmentStatSum('def') + TerritoryManager.getBuffValue('flatDef');
}

/** Effective AGI after gear. */
export function getEffectiveAgi() {
  const state = Store.getState();
  return state.playerStats.agi + getEquipmentStatSum('agi');
}

/** Evade rating derived from effective AGI. */
export function getEvadeRating() {
  return COMBAT_V2.evadeRating(getEffectiveAgi());
}

/** Chance an enemy attack lands against the current player. */
export function getEnemyHitChance(enemyAccuracy = 80) {
  return COMBAT_V2.enemyHitChance(enemyAccuracy, getEvadeRating());
}

/** Chance the player dodges an enemy attack. */
export function getDodgeChance(enemyAccuracy = 80) {
  return COMBAT_V2.dodgeChance(enemyAccuracy, getEvadeRating());
}

/** Max HP after gear and territory multiplier. */
export function getEffectiveMaxHp() {
  const state = Store.getState();
  const baseHp = state.playerStats.hp + getEquipmentStatSum('hp');
  return D(baseHp).times(TerritoryManager.getBuffMultiplier('maxHp'));
}

/** Base damage = effective STR. Enemy defense applied at combat time. */
export function getBaseDamage() {
  return getEffectiveStr() * _combatDebuffs.attackMult;
}

/** Effective auto-attack damage per hit after all multipliers (prestige, territory, stance). */
export function getEffectiveDamage() {
  const state = Store.getState();
  const baseDmg = getBaseDamage();
  const prestigeMult = state.prestigeMultiplier;
  const territoryDmgMult = TerritoryManager.getBuffMultiplier('baseDamage');
  const stance = STANCES[state.currentStance] || STANCES.power;
  return Math.floor(baseDmg * prestigeMult * territoryDmgMult * stance.damageMult);
}

/** Effective click damage per hit (auto-attack damage x click damage upgrade multiplier, nerfed by clickDamageScalar). */
export function getClickDamage() {
  const clickDmgMult = UpgradeManager.getMultiplier('clickDamage');
  return Math.floor(getEffectiveDamage() * clickDmgMult * COMBAT_V2.clickDamageScalar);
}

/** Crit chance from base + upgrades + territory. */
export function getCritChance() {
  return UpgradeManager.getFlatBonus('critChance') +
    TerritoryManager.getBuffValue('critChance');
}

/** Crit multiplier (10x after crack, normal otherwise). */
export function getCritMultiplier() {
  const state = Store.getState();
  return state.flags.crackTriggered ? 10 : COMBAT_V2.critMultiplier ?? 2;
}

/** Damage reduction from current stance (0.0–1.0). */
export function getDamageReduction() {
  const state = Store.getState();
  const stance = STANCES[state.currentStance] || STANCES.power;
  return stance.damageReduction;
}

/** HP regen per second: flat from levels + gear, scaled by territory multiplier. */
export function getHpRegen() {
  const state = Store.getState();
  const baseRegen = state.playerStats.regen + getEquipmentStatSum('regen');
  const regenMult = TerritoryManager.getBuffMultiplier('hpRegen');
  return D(baseRegen).times(regenMult).times(_combatDebuffs.regenMult);
}

/** Runtime combat-only debuffs (used for encounter mechanics like Corruption). */
export function setCombatDebuffs(partial = {}) {
  _combatDebuffs = {
    attackMult: _clampMultiplier(partial.attackMult, _combatDebuffs.attackMult),
    regenMult: _clampMultiplier(partial.regenMult, _combatDebuffs.regenMult),
  };
}

/** Clear runtime combat debuffs. */
export function resetCombatDebuffs() {
  _combatDebuffs = { attackMult: 1, regenMult: 1 };
}

/** Player attack speed from base + gear. */
export function getPlayerAtkSpeed() {
  return COMBAT_V2.playerBaseAtkSpeed + getEquipmentStatSum('atkSpeed');
}

/** Player auto-attack interval in ms (gear speed + upgrade/territory bonuses + stance). Floor 400ms. */
export function getPlayerAutoAttackInterval() {
  const state = Store.getState();
  const stance = STANCES[state.currentStance] || STANCES.power;
  const effectiveSpeed = getPlayerAtkSpeed() * stance.atkSpeedMult;
  const baseInterval = Math.floor(COMBAT_V2.baseAttackIntervalMs / effectiveSpeed);
  // Apply upgrade and territory speed bonuses as reduction
  const speedBonus = UpgradeManager.getMultiplier('autoAttackSpeed') - 1;
  const territoryBonus = TerritoryManager.getBuffValue('autoAttackSpeed');
  const interval = baseInterval * (1 - speedBonus - territoryBonus);
  return Math.max(400, Math.floor(interval));
}

/** Auto-attack interval in ms (delegates to getPlayerAutoAttackInterval). */
export function getAutoAttackInterval() {
  return getPlayerAutoAttackInterval();
}

/** Total gold multiplier from upgrades, prestige, and territory. */
export function getGoldMultiplier() {
  const state = Store.getState();
  return UpgradeManager.getMultiplier('goldMultiplier') *
    state.prestigeMultiplier *
    TerritoryManager.getBuffMultiplier('goldGain');
}

/** Total XP multiplier from prestige and territory. */
export function getXpMultiplier() {
  const state = Store.getState();
  return state.prestigeMultiplier * TerritoryManager.getBuffMultiplier('xpGain');
}

/** Full computed stats object for UI display. */
export function getAllStats() {
  const state = Store.getState();
  return {
    effectiveStr: getEffectiveStr(),
    effectiveDef: getEffectiveDef(),
    effectiveAgi: getEffectiveAgi(),
    evadeRating: getEvadeRating(),
    effectiveMaxHp: getEffectiveMaxHp(),
    baseDamage: getBaseDamage(),
    effectiveDamage: getEffectiveDamage(),
    clickDamage: getClickDamage(),
    critChance: getCritChance(),
    critMultiplier: getCritMultiplier(),
    autoAttackInterval: getAutoAttackInterval(),
    playerAtkSpeed: getPlayerAtkSpeed(),
    goldMultiplier: getGoldMultiplier(),
    xpMultiplier: getXpMultiplier(),
    hpRegen: getHpRegen(),
    attackDebuffMult: _combatDebuffs.attackMult,
    regenDebuffMult: _combatDebuffs.regenMult,
    damageReduction: getDamageReduction(),
    dodgeChanceVsDefaultAcc: getDodgeChance(80),
    currentStance: state.currentStance,
    prestigeMultiplier: state.prestigeMultiplier,
  };
}
