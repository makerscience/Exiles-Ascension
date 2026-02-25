// EnhancementManager - per-slot equipment enhancement paid with gold.

import Store from './Store.js';
import { emit, EVENTS } from '../events.js';

const MAX_LEVEL = 10;
const BONUS_PER_LEVEL = 0.05;
const COST_GROWTH = 1.5;
const BASE_COSTS = {
  head: 50,
  chest: 50,
  main_hand: 50,
  legs: 100,
  boots: 100,
  gloves: 200,
  amulet: 200,
};

function isEnhanceableSlot(slotId) {
  return slotId in BASE_COSTS;
}

const EnhancementManager = {
  isEnhanceableSlot,

  getLevel(slotId) {
    if (!isEnhanceableSlot(slotId)) return 0;
    const state = Store.getState();
    return state.enhancementLevels?.[slotId] || 0;
  },

  getCost(slotId) {
    if (!isEnhanceableSlot(slotId)) return 0;
    const level = this.getLevel(slotId);
    if (level >= MAX_LEVEL) return 0;
    return Math.floor(BASE_COSTS[slotId] * (COST_GROWTH ** level));
  },

  getBonusMultiplier(slotId) {
    if (!isEnhanceableSlot(slotId)) return 1;
    const level = this.getLevel(slotId);
    return 1 + (level * BONUS_PER_LEVEL);
  },

  canEnhance(slotId) {
    if (!isEnhanceableSlot(slotId)) return false;

    const state = Store.getState();
    const level = this.getLevel(slotId);
    if (level >= MAX_LEVEL) return false;
    if (!state.equipped?.[slotId]) return false;

    const cost = this.getCost(slotId);
    return state.gold.gte(cost);
  },

  enhance(slotId) {
    if (!this.canEnhance(slotId)) return false;

    const cost = this.getCost(slotId);
    Store.spendGold(cost);
    const level = Store.incrementEnhancementLevel(slotId);

    emit(EVENTS.ENHANCE_PURCHASED, { slotId, level, cost });
    return true;
  },

  getMaxLevel() {
    return MAX_LEVEL;
  },
};

export default EnhancementManager;
