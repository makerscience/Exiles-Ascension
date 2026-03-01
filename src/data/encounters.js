// Encounter templates define weighted spawn options per zone range.
// Solo encounters are auto-generated for any enemy without a multi-member template.
// zones use global zone numbers (matching enemy zone ranges in enemies.js).

import { getUnlockedEnemies } from './areas.js';

// -- Authored multi-member encounters ----------------------------------------

const ENCOUNTERS = [
  // -- Area 1: The Whispering Woods (global zones 1-10) --------------------
  { id: 'a1_rat_pair', members: ['a1_rat', 'a1_rat'], weight: 2, zones: [2, 2], attackSpeedMult: 1.0, rewardMult: 1.1, lootBonus: { dropChanceMult: 1.0, rarityBoost: 0 } },
  { id: 'a1_rat_pack', members: ['a1_rat', 'a1_rat', 'a1_rat'], weight: 1, zones: [3, 5], attackSpeedMult: 1.0, rewardMult: 1.25, lootBonus: { dropChanceMult: 1.0, rarityBoost: 0 } },
  { id: 'a1_slime_pair', members: ['a1_slime', 'a1_slime'], weight: 2, zones: [2, 3], attackSpeedMult: 1.0, rewardMult: 1.1, lootBonus: { dropChanceMult: 1.0, rarityBoost: 0 } },
  { id: 'a1_hound_pair', members: ['a1_feral_hound', 'a1_feral_hound'], weight: 1, zones: [3, 5], attackSpeedMult: 0.9, rewardMult: 1.2, lootBonus: { dropChanceMult: 1.05, rarityBoost: 0 } },
  { id: 'a1_hound_slime_mix', members: ['a1_feral_hound', 'a1_slime'], weight: 2, zones: [3, 5], attackSpeedMult: 1.0, rewardMult: 1.15, lootBonus: { dropChanceMult: 1.0, rarityBoost: 0 } },
  { id: 'a1_beetle_duo', members: ['a2_giant_beetle', 'a2_giant_beetle'], weight: 1, zones: [6, 10], attackSpeedMult: 0.85, rewardMult: 1.3, lootBonus: { dropChanceMult: 1.15, rarityBoost: 0.02 } },
  { id: 'a1_bird_pair', members: ['a1_bird', 'a1_bird'], weight: 2, zones: [7, 10], attackSpeedMult: 1.0, rewardMult: 1.2, lootBonus: { dropChanceMult: 1.05, rarityBoost: 0 } },
  { id: 'a1_beetle_bird_mix', members: ['a2_giant_beetle', 'a1_bird'], weight: 2, zones: [7, 10], attackSpeedMult: 1.0, rewardMult: 1.25, lootBonus: { dropChanceMult: 1.08, rarityBoost: 0 } },
  { id: 'a1_big_slime_duo', members: ['a1_big_slime', 'a1_big_slime'], weight: 1, zones: [8, 9], attackSpeedMult: 0.9, rewardMult: 1.35, lootBonus: { dropChanceMult: 1.12, rarityBoost: 0.01 } },
  { id: 'a1_bandit_pair', members: ['a1_bandit', 'a1_bandit'], weight: 1, zones: [9, 10], attackSpeedMult: 1.0, rewardMult: 1.35, lootBonus: { dropChanceMult: 1.12, rarityBoost: 0.02 } },
  { id: 'a1_bird_bandit_mix', members: ['a1_bird', 'a1_bandit'], weight: 2, zones: [8, 10], attackSpeedMult: 1.0, rewardMult: 1.28, lootBonus: { dropChanceMult: 1.1, rarityBoost: 0.01 } },
  { id: 'a1_beetle_bandit_mix', members: ['a2_giant_beetle', 'a1_bandit'], weight: 2, zones: [9, 10], attackSpeedMult: 0.95, rewardMult: 1.32, lootBonus: { dropChanceMult: 1.12, rarityBoost: 0.01 } },

  // -- Area 2: The Blighted Mire (global zones 11-20) ---------------------
  { id: 'a2_scout_pair', members: ['a2_goblin_scout', 'a2_goblin_scout'], weight: 2, zones: [11, 15], attackSpeedMult: 1.0, rewardMult: 1.15, lootBonus: { dropChanceMult: 1.0, rarityBoost: 0 } },
  { id: 'a2_scout_trio', members: ['a2_goblin_scout', 'a2_goblin_scout', 'a2_goblin_scout'], weight: 1, zones: [12, 15], attackSpeedMult: 1.0, rewardMult: 1.28, lootBonus: { dropChanceMult: 1.03, rarityBoost: 0 } },
  { id: 'a2_fungi_pair', members: ['a2_fungi', 'a2_fungi'], weight: 2, zones: [11, 15], attackSpeedMult: 1.0, rewardMult: 1.15, lootBonus: { dropChanceMult: 1.0, rarityBoost: 0 } },
  { id: 'a2_zombie_pair', members: ['a2_zombie', 'a2_zombie'], weight: 1, zones: [12, 15], attackSpeedMult: 0.9, rewardMult: 1.2, lootBonus: { dropChanceMult: 1.03, rarityBoost: 0 } },
  { id: 'a2_scout_fungi_mix', members: ['a2_goblin_scout', 'a2_fungi'], weight: 2, zones: [11, 15], attackSpeedMult: 1.0, rewardMult: 1.18, lootBonus: { dropChanceMult: 1.02, rarityBoost: 0 } },
  { id: 'a2_zombie_fungi_mix', members: ['a2_zombie', 'a2_fungi'], weight: 2, zones: [12, 15], attackSpeedMult: 1.0, rewardMult: 1.2, lootBonus: { dropChanceMult: 1.03, rarityBoost: 0 } },
  { id: 'a2_boar_scout_mix', members: ['a1_thornback_boar', 'a2_goblin_scout'], weight: 1, zones: [14, 15], attackSpeedMult: 0.95, rewardMult: 1.25, lootBonus: { dropChanceMult: 1.05, rarityBoost: 0.01 } },
  { id: 'a2_warrior_pair', members: ['a2_goblin_warrior', 'a2_goblin_warrior'], weight: 1, zones: [17, 20], attackSpeedMult: 0.95, rewardMult: 1.35, lootBonus: { dropChanceMult: 1.1, rarityBoost: 0.02 } },
  { id: 'a2_swarm_pair', members: ['a2_insect_swarm', 'a2_insect_swarm'], weight: 2, zones: [16, 20], attackSpeedMult: 1.0, rewardMult: 1.22, lootBonus: { dropChanceMult: 1.05, rarityBoost: 0 } },
  { id: 'a2_swarm_trio', members: ['a2_insect_swarm', 'a2_insect_swarm', 'a2_insect_swarm'], weight: 1, zones: [17, 20], attackSpeedMult: 1.0, rewardMult: 1.35, lootBonus: { dropChanceMult: 1.08, rarityBoost: 0.01 } },
  { id: 'a2_vine_duo', members: ['a2_vine_crawler', 'a2_vine_crawler'], weight: 1, zones: [16, 20], attackSpeedMult: 1.0, rewardMult: 1.28, lootBonus: { dropChanceMult: 1.08, rarityBoost: 0.01 } },
  { id: 'a2_revenant_duo', members: ['a2_bog_revenant', 'a2_bog_revenant'], weight: 1, zones: [18, 20], attackSpeedMult: 0.9, rewardMult: 1.38, lootBonus: { dropChanceMult: 1.1, rarityBoost: 0.02 } },
  { id: 'a2_scout_warrior_mix', members: ['a2_goblin_scout', 'a2_goblin_warrior'], weight: 2, zones: [16, 18], attackSpeedMult: 1.0, rewardMult: 1.25, lootBonus: { dropChanceMult: 1.06, rarityBoost: 0.01 } },
  { id: 'a2_warrior_swarm_mix', members: ['a2_goblin_warrior', 'a2_insect_swarm'], weight: 2, zones: [16, 20], attackSpeedMult: 1.0, rewardMult: 1.28, lootBonus: { dropChanceMult: 1.08, rarityBoost: 0.01 } },
  { id: 'a2_warrior_vine_mix', members: ['a2_goblin_warrior', 'a2_vine_crawler'], weight: 2, zones: [17, 20], attackSpeedMult: 1.0, rewardMult: 1.3, lootBonus: { dropChanceMult: 1.09, rarityBoost: 0.01 } },
  { id: 'a2_swarm_vine_mix', members: ['a2_insect_swarm', 'a2_vine_crawler'], weight: 2, zones: [16, 20], attackSpeedMult: 1.0, rewardMult: 1.26, lootBonus: { dropChanceMult: 1.07, rarityBoost: 0 } },
  { id: 'a2_revenant_warrior_mix', members: ['a2_bog_revenant', 'a2_goblin_warrior'], weight: 2, zones: [18, 20], attackSpeedMult: 0.95, rewardMult: 1.35, lootBonus: { dropChanceMult: 1.1, rarityBoost: 0.02 } },

  // -- Area 3: The Shattered Ruins (global zones 21-35) -------------------
  { id: 'a3_stone_duo', members: ['a3_stone_sentry', 'a3_stone_sentry'], weight: 1, zones: [22, 25], attackSpeedMult: 0.9, rewardMult: 1.35, lootBonus: { dropChanceMult: 1.12, rarityBoost: 0.02 } },
  { id: 'a3_scavenger_duo', members: ['a3_cultist_scavenger', 'a3_cultist_scavenger'], weight: 1, zones: [22, 25], attackSpeedMult: 1.0, rewardMult: 1.3, lootBonus: { dropChanceMult: 1.1, rarityBoost: 0.01 } },
  { id: 'a3_wolf_pair', members: ['a3_corrupted_wolf', 'a3_corrupted_wolf'], weight: 1, zones: [22, 25], attackSpeedMult: 1.0, rewardMult: 1.32, lootBonus: { dropChanceMult: 1.1, rarityBoost: 0.01 } },
  { id: 'a3_stone_scavenger_mix', members: ['a3_stone_sentry', 'a3_cultist_scavenger'], weight: 2, zones: [21, 25], attackSpeedMult: 1.0, rewardMult: 1.3, lootBonus: { dropChanceMult: 1.1, rarityBoost: 0.01 } },
  { id: 'a3_scavenger_wolf_mix', members: ['a3_cultist_scavenger', 'a3_corrupted_wolf'], weight: 2, zones: [22, 25], attackSpeedMult: 1.0, rewardMult: 1.32, lootBonus: { dropChanceMult: 1.11, rarityBoost: 0.01 } },
  { id: 'a3_guardian_duo', members: ['a3_eternal_guardian', 'a3_eternal_guardian'], weight: 1, zones: [27, 30], attackSpeedMult: 0.9, rewardMult: 1.45, lootBonus: { dropChanceMult: 1.15, rarityBoost: 0.03 } },
  { id: 'a3_cultist_duo', members: ['a3_corrupted_cultist', 'a3_corrupted_cultist'], weight: 1, zones: [27, 30], attackSpeedMult: 1.0, rewardMult: 1.4, lootBonus: { dropChanceMult: 1.13, rarityBoost: 0.02 } },
  { id: 'a3_shade_trio', members: ['a3_shade_remnant', 'a3_shade_remnant', 'a3_shade_remnant'], weight: 1, zones: [27, 30], attackSpeedMult: 1.0, rewardMult: 1.42, lootBonus: { dropChanceMult: 1.14, rarityBoost: 0.02 } },
  { id: 'a3_guardian_shade_mix', members: ['a3_eternal_guardian', 'a3_shade_remnant'], weight: 2, zones: [26, 30], attackSpeedMult: 1.0, rewardMult: 1.38, lootBonus: { dropChanceMult: 1.13, rarityBoost: 0.02 } },
  { id: 'a3_cultist_shade_mix', members: ['a3_corrupted_cultist', 'a3_shade_remnant'], weight: 2, zones: [26, 30], attackSpeedMult: 1.0, rewardMult: 1.36, lootBonus: { dropChanceMult: 1.12, rarityBoost: 0.01 } },
  { id: 'a3_guardian_cultist_mix', members: ['a3_eternal_guardian', 'a3_corrupted_cultist'], weight: 2, zones: [27, 30], attackSpeedMult: 0.95, rewardMult: 1.4, lootBonus: { dropChanceMult: 1.14, rarityBoost: 0.02 } },
  { id: 'a3_scholar_duo', members: ['a3_cultist_scholar', 'a3_cultist_scholar'], weight: 1, zones: [32, 35], attackSpeedMult: 1.0, rewardMult: 1.5, lootBonus: { dropChanceMult: 1.16, rarityBoost: 0.03 } },
  { id: 'a3_resurrected_duo', members: ['a3_resurrected_shade', 'a3_resurrected_shade'], weight: 1, zones: [32, 35], attackSpeedMult: 0.9, rewardMult: 1.5, lootBonus: { dropChanceMult: 1.16, rarityBoost: 0.03 } },
  { id: 'a3_corrupted_guardian_duo', members: ['a3_corrupted_guardian', 'a3_corrupted_guardian'], weight: 1, zones: [33, 35], attackSpeedMult: 0.9, rewardMult: 1.55, lootBonus: { dropChanceMult: 1.18, rarityBoost: 0.04 } },
  { id: 'a3_scholar_resurrected_mix', members: ['a3_cultist_scholar', 'a3_resurrected_shade'], weight: 2, zones: [31, 35], attackSpeedMult: 1.0, rewardMult: 1.5, lootBonus: { dropChanceMult: 1.16, rarityBoost: 0.03 } },
  { id: 'a3_guardian_scholar_mix', members: ['a3_corrupted_guardian', 'a3_cultist_scholar'], weight: 2, zones: [33, 35], attackSpeedMult: 0.95, rewardMult: 1.55, lootBonus: { dropChanceMult: 1.18, rarityBoost: 0.04 } },
  { id: 'a3_guardian_resurrected_mix', members: ['a3_corrupted_guardian', 'a3_resurrected_shade'], weight: 2, zones: [33, 35], attackSpeedMult: 0.95, rewardMult: 1.55, lootBonus: { dropChanceMult: 1.18, rarityBoost: 0.04 } },
];

// -- Encounter pool builder --------------------------------------------------

/**
 * Build a solo encounter wrapper for an enemy template.
 * Used for any enemy that is not part of an authored multi-member encounter.
 */
export function getSoloEncounter(enemyTemplate) {
  return {
    id: `solo_${enemyTemplate.id}`,
    members: [enemyTemplate.id],
    weight: 3,
    attackSpeedMult: 1.0,
    rewardMult: 1.0,
    lootBonus: { dropChanceMult: 1.0, rarityBoost: 0 },
  };
}

/**
 * Get the weighted encounter pool for a given area + zone.
 * Combines authored multi-member encounters with auto-generated solo wrappers.
 * Returns array of { template, weight } objects for weighted random selection.
 */
export function getEncountersForZone(areaId, zoneNum) {
  // Import dynamically would be circular - areas.js already resolves this.
  const area = _getArea(areaId);
  if (!area) return [];
  const globalZone = area.zoneStart + zoneNum - 1;

  const pool = [];

  // 1. Add authored multi-member encounters whose zone range covers this zone.
  for (const enc of ENCOUNTERS) {
    if (globalZone >= enc.zones[0] && globalZone <= enc.zones[1]) {
      pool.push({ template: enc, weight: enc.weight });
    }
  }

  // 2. Add solo wrappers for all unlocked enemies at this zone.
  const enemies = getUnlockedEnemies(areaId, zoneNum);
  for (const enemy of enemies) {
    if (areaId === 1) {
      // Area 1 spawn shaping:
      // - no solo rat from zone 2+
      // - no solo slime (all variants share a1_slime id) from zone 3+
      if (enemy.id === 'a1_rat' && zoneNum >= 2) continue;
      if (enemy.id === 'a1_slime' && zoneNum >= 3) continue;
    }
    pool.push({ template: getSoloEncounter(enemy), weight: 3 });
  }

  return pool;
}

/**
 * Pick a weighted random encounter template from the pool.
 * Returns the encounter template object, or null if pool is empty.
 */
export function pickRandomEncounter(areaId, zoneNum) {
  const pool = getEncountersForZone(areaId, zoneNum);
  if (pool.length === 0) return null;

  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return entry.template;
  }

  // Fallback (should not reach here due to float precision).
  return pool[pool.length - 1].template;
}

// -- Area lookup (avoid circular import with areas.js) -----------------------

// Inline minimal area data to avoid importing AREAS from areas.js
// (areas.js already imports from enemies.js; adding encounters.js -> areas.js
// would create a potential import cycle).
const _AREA_ZONE_STARTS = { 1: 1, 2: 11, 3: 21 };

function _getArea(areaId) {
  const zoneStart = _AREA_ZONE_STARTS[areaId];
  if (zoneStart == null) return null;
  return { zoneStart };
}

export { ENCOUNTERS };
