// PrestigeManager — prestige loop orchestrator.
// Tracks furthest area, eligibility, and executes prestige resets.
// Owns the full prestige sequence — Store provides granular mutations.

import Store from './Store.js';
import { createScope, emit, EVENTS } from '../events.js';
import { PRESTIGE } from '../config.js';

let scope = null;
let prestigeAvailableEmitted = false;
let justPrestiged = false;

const PrestigeManager = {
  init() {
    scope = createScope();

    // Handle already-loaded saves where SAVE_LOADED fired before manager init.
    const initialState = Store.getState();
    if (initialState.furthestArea >= PRESTIGE.minArea) {
      prestigeAvailableEmitted = true;
    }

    // Track furthest area on area changes
    scope.on(EVENTS.WORLD_AREA_CHANGED, (data) => {
      const state = Store.getState();
      const prevFurthest = state.furthestArea;
      Store.setFurthestArea(data.area);

      // Emit PRESTIGE_AVAILABLE once when first reaching minArea
      if (!prestigeAvailableEmitted && data.area >= PRESTIGE.minArea && prevFurthest < PRESTIGE.minArea) {
        prestigeAvailableEmitted = true;
        emit(EVENTS.PRESTIGE_AVAILABLE, {});
      }
    });

    // On save loaded, check if prestige already available
    scope.on(EVENTS.SAVE_LOADED, () => {
      const state = Store.getState();
      if (state.furthestArea >= PRESTIGE.minArea) {
        prestigeAvailableEmitted = true;
      }
    });
  },

  destroy() {
    scope?.destroy();
    scope = null;
    prestigeAvailableEmitted = false;
    justPrestiged = false;
  },

  canPrestige() {
    const state = Store.getState();
    return state.furthestArea >= PRESTIGE.minArea;
  },

  getNextMultiplier() {
    const state = Store.getState();
    return PRESTIGE.multiplierFormula(state.prestigeCount + 1);
  },

  getCurrentMultiplier() {
    const state = Store.getState();
    return PRESTIGE.multiplierFormula(state.prestigeCount);
  },

  performPrestige() {
    if (!PrestigeManager.canPrestige()) return;

    // Orchestrate prestige via granular Store mutations
    Store.incrementPrestigeCount();
    Store.retainGold(PRESTIGE.goldRetention);
    Store.setAreaZone(1, 1);
    // furthestArea NOT reset — permanent high-water mark
    Store.resetAreaProgress();
    Store.resetPlayerStats();
    Store.resetPlayerHp();
    Store.resetPurchasedUpgrades();
    Store.resetSkillPoints();
    Store.resetTotalKills();
    // Keeps: equipped, inventoryStacks, glitchFragments, unlockedCheats, activeCheats, titles, flags
    // Keeps: killsPerEnemy, territories (permanent progression)
    // Keeps: furthestArea (permanent high-water mark)
    // Keeps: enhancementLevels (permanent gold investment)

    justPrestiged = true;
    emit(EVENTS.PRESTIGE_PERFORMED, { count: Store.getState().prestigeCount });
    emit(EVENTS.SAVE_REQUESTED, {});
  },

  wasJustPrestiged() {
    return justPrestiged;
  },

  clearJustPrestiged() {
    justPrestiged = false;
  },
};

export default PrestigeManager;
