// UpgradeManager — purchase logic + multiplier aggregation for upgrades.
// Pure data-reader: CombatEngine applies the multipliers during damage computation.

import Store from './Store.js';
import { D } from './BigNum.js';
import { emit, EVENTS } from '../events.js';
import { COMBAT_V2 } from '../config.js';
import { getUpgrade, getAllUpgrades } from '../data/upgrades.js';
import TerritoryManager from './TerritoryManager.js';

const UpgradeManager = {
  getLevel(upgradeId) {
    const state = Store.getState();
    return state.purchasedUpgrades[upgradeId] || 0;
  },

  canPurchase(upgradeId) {
    const upgrade = getUpgrade(upgradeId);
    if (!upgrade) return false;

    const level = this.getLevel(upgradeId);
    if (level >= upgrade.maxLevel) return false;

    const cost = D(upgrade.costFormula(level));
    const state = Store.getState();

    if (upgrade.currency === 'gold') {
      return state.gold.gte(cost);
    }
    if (upgrade.currency === 'skillPoints') {
      return state.skillPoints >= upgrade.costFormula(level);
    }
    if (upgrade.currency === 'glitchFragments') {
      return state.glitchFragments.gte(cost);
    }
    return false;
  },

  getCost(upgradeId) {
    const upgrade = getUpgrade(upgradeId);
    if (!upgrade) return 0;
    const level = this.getLevel(upgradeId);
    return upgrade.costFormula(level);
  },

  purchase(upgradeId) {
    if (!this.canPurchase(upgradeId)) return false;

    const upgrade = getUpgrade(upgradeId);
    const cost = upgrade.costFormula(this.getLevel(upgradeId));

    // Deduct currency
    if (upgrade.currency === 'gold') {
      Store.spendGold(cost);
    } else if (upgrade.currency === 'skillPoints') {
      if (!Store.spendSkillPoints(cost)) return false;
    } else if (upgrade.currency === 'glitchFragments') {
      Store.spendFragments(cost);
    }

    // Increment level
    const newLevel = Store.upgradeLevel(upgradeId);

    // Apply immediate flat stat bonus (e.g. STR)
    if (upgrade.effect.type === 'flat' && ['str', 'def', 'hp', 'regen', 'agi'].includes(upgrade.effect.target)) {
      Store.addFlatStat(upgrade.effect.target, upgrade.effect.valuePerLevel);
    }

    emit(EVENTS.UPG_PURCHASED, {
      upgradeId,
      name: upgrade.name,
      level: newLevel,
      category: upgrade.category,
    });

    return true;
  },

  /** Aggregate all multiplier-type upgrades for a given target. Returns 1 + sum. */
  getMultiplier(target) {
    let sum = 0;
    for (const upgrade of getAllUpgrades()) {
      if (upgrade.effect.type === 'multiplier' && upgrade.effect.target === target) {
        const level = this.getLevel(upgrade.id);
        sum += level * upgrade.effect.valuePerLevel;
      }
    }
    return 1 + sum;
  },

  /** Aggregate all flat-type upgrades for a given target. */
  getFlatBonus(target) {
    let sum = 0;
    for (const upgrade of getAllUpgrades()) {
      if (upgrade.effect.type === 'flat' && upgrade.effect.target === target) {
        const level = this.getLevel(upgrade.id);
        sum += level * upgrade.effect.valuePerLevel;
      }
    }
    return sum;
  },

  /** Computed auto-attack interval, floored at 200ms. */
  getAutoAttackInterval() {
    const speedBonus = this.getMultiplier('autoAttackSpeed') - 1; // strip the base 1
    const territoryBonus = TerritoryManager.getBuffValue('autoAttackSpeed');
    const baseInterval = Math.floor(1000 / COMBAT_V2.playerBaseAtkSpeed);
    const interval = baseInterval * (1 - speedBonus - territoryBonus);
    return Math.max(200, interval);
  },
};

export default UpgradeManager;
