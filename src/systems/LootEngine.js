// LootEngine — V2 drop model. Zone-based item pools, slot-weighted selection, pity system.
// Subscribes to COMBAT_ENEMY_KILLED (normal + boss drops) and BOSS_DEFEATED (pity advance).

import Store from './Store.js';
import { createScope, emit, EVENTS } from '../events.js';
import { LOOT_V2 } from '../config.js';
import { getItemsForZone, getItem } from '../data/items.js';
import { getBossForZone } from '../data/bosses.js';
import { getNormalDropChance } from '../data/balance.js';
import { getSlotUnlockZone, getPlayerGlobalZone, ACTIVE_SLOT_IDS } from '../data/equipSlots.js';
import InventorySystem from './InventorySystem.js';

// Maps equip slot IDs (Store.equipped keys) to item.slot values
const EQUIP_TO_ITEM_SLOT = {
  main_hand: 'weapon', chest: 'body', head: 'head',
  legs: 'legs', boots: 'boots', gloves: 'gloves', amulet: 'amulet',
};
const UNCOMMON_UNLOCK_GLOBAL_ZONE = 3;

let scope = null;

const LootEngine = {
  init() {
    scope = createScope();
    scope.on(EVENTS.COMBAT_ENEMY_KILLED, (data) => LootEngine._handleKill(data));
    scope.on(EVENTS.BOSS_DEFEATED, () => LootEngine._advancePity());
  },

  destroy() {
    scope?.destroy();
    scope = null;
  },

  // ── Kill dispatcher ──────────────────────────────────────────────

  _handleKill(data) {
    if (data.despawned) return;
    if (data.isBoss) {
      LootEngine._handleBossKill(data);
    } else {
      LootEngine._handleNormalKill(data);
    }
  },

  // ── Normal enemy kill: 10% drop chance ───────────────────────────

  _handleNormalKill(data) {
    const lootBonus = data.lootBonus || { dropChanceMult: 1.0, rarityBoost: 0 };
    const state = Store.getState();
    const areaId = state.currentArea;
    const globalZone = getPlayerGlobalZone();
    const baseChance = getNormalDropChance(areaId, globalZone, LOOT_V2.normalDropChance);
    const dropChance = Math.max(0, Math.min(1, baseChance * lootBonus.dropChanceMult));
    if (Math.random() > dropChance) return;

    const item = LootEngine._pickItem();
    if (!item) return;

    const rolledRarity = LootEngine._rollRarityV2(lootBonus.rarityBoost);
    const rarity = LootEngine._applyItemRarityRules(item, rolledRarity, globalZone);
    LootEngine._awardDrop(item, rarity);
  },

  // ── Boss kill: guaranteed drop, first-kill vs repeat uncommon chance ──

  _handleBossKill(_data) {
    const item = LootEngine._pickItem();
    if (!item) return;

    // Determine if this is a first kill.
    // COMBAT_ENEMY_KILLED fires synchronously, BossManager.onBossDefeated() is delayed 1300ms.
    // So bossesDefeated has NOT been updated yet — if zone is absent, it's a first kill.
    const state = Store.getState();
    const area = state.currentArea;
    const zone = state.currentZone;
    const progress = state.areaProgress[area];
    const isFirstKill = !progress || !progress.bossesDefeated.includes(zone);

    const uncommonUnlocked = getPlayerGlobalZone() >= UNCOMMON_UNLOCK_GLOBAL_ZONE;
    let rarity = 'common';
    if (uncommonUnlocked) {
      const uncommonChance = isFirstKill
        ? LOOT_V2.bossFirstKillUncommonChance
        : LOOT_V2.bossRepeatUncommonChance;
      rarity = Math.random() < uncommonChance ? 'uncommon' : 'common';
    }
    rarity = LootEngine._applyItemRarityRules(item, rarity, getPlayerGlobalZone());
    LootEngine._awardDrop(item, rarity);

    // Guaranteed first-kill bonus drop (e.g. waterskin from Rotfang)
    if (isFirstKill) {
      const globalZone = getPlayerGlobalZone();
      const boss = getBossForZone(globalZone);
      if (boss && boss.guaranteedFirstKillItem) {
        const bonusItem = getItem(boss.guaranteedFirstKillItem);
        if (bonusItem) {
          LootEngine._awardDrop(bonusItem, 'common');
        }
      }
    }
  },

  // ── Item selection: zone pool + slot weighting + pity ────────────

  _pickItem() {
    const globalZone = getPlayerGlobalZone();
    const allItems = getItemsForZone(globalZone);
    if (allItems.length === 0) return null;

    const state = Store.getState();
    const pity = state.lootPity;

    // Build weighted slot candidates from active slots that are unlocked
    const slotCandidates = [];
    for (const equipId of ACTIVE_SLOT_IDS) {
      const unlockZone = getSlotUnlockZone(equipId);
      if (globalZone < unlockZone) continue;

      const itemSlot = EQUIP_TO_ITEM_SLOT[equipId];
      const itemsForSlot = allItems.filter(i => i.slot === itemSlot);
      if (itemsForSlot.length === 0) continue;

      let weight = LOOT_V2.slotWeights[equipId] || 10;
      // Double weight when pity threshold reached
      if (pity[equipId] >= LOOT_V2.pityThreshold) {
        weight *= 2;
      }

      slotCandidates.push({ equipId, itemSlot, items: itemsForSlot, weight });
    }

    if (slotCandidates.length === 0) return null;

    // Weighted random slot pick
    const totalWeight = slotCandidates.reduce((sum, c) => sum + c.weight, 0);
    let roll = Math.random() * totalWeight;
    let chosen = slotCandidates[0];

    for (const candidate of slotCandidates) {
      roll -= candidate.weight;
      if (roll <= 0) {
        chosen = candidate;
        break;
      }
    }

    // Reset pity for the selected slot
    Store.resetLootPity(chosen.equipId);

    // Random item from the slot's pool
    const item = chosen.items[Math.floor(Math.random() * chosen.items.length)];
    return item;
  },

  // ── Rarity roll: weighted pick from rarityWeights ────────────────

  _rollRarityV2(rarityBoost = 0) {
    if (getPlayerGlobalZone() < UNCOMMON_UNLOCK_GLOBAL_ZONE) {
      return 'common';
    }
    const weights = { ...LOOT_V2.rarityWeights };
    // Boost uncommon weight for group encounter loot bonus
    if (rarityBoost > 0 && weights.uncommon != null) {
      weights.uncommon += rarityBoost;
    }
    const entries = Object.entries(weights);
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = Math.random() * totalWeight;

    for (const [rarity, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return rarity;
    }
    return 'common';
  },

  _applyItemRarityRules(item, rarity, globalZone = getPlayerGlobalZone()) {
    if (!item) return rarity || 'common';
    const rules = item.dropRules || {};
    let resolved = rarity || 'common';

    if (resolved === 'uncommon' && globalZone < UNCOMMON_UNLOCK_GLOBAL_ZONE) {
      resolved = 'common';
    }

    const uncommonMinZone = Number(rules.uncommonMinZone);
    if (resolved === 'uncommon' && Number.isFinite(uncommonMinZone) && globalZone < uncommonMinZone) {
      resolved = 'common';
    }

    const commonMaxZone = Number(rules.commonMaxZone);
    if (resolved === 'common' && Number.isFinite(commonMaxZone) && globalZone > commonMaxZone) {
      resolved = globalZone >= UNCOMMON_UNLOCK_GLOBAL_ZONE ? 'uncommon' : 'common';
    }

    return resolved;
  },

  // ── Award drop ───────────────────────────────────────────────────

  _awardDrop(item, rarity) {
    const added = InventorySystem.tryAddItem(item.id, 1, rarity);
    if (added) {
      emit(EVENTS.LOOT_DROPPED, { itemId: item.id, count: 1, rarity });
    }
  },

  // ── Pity advance: increments all slot counters on boss defeat ────

  _advancePity() {
    Store.incrementAllPity();
  },
};

export default LootEngine;
