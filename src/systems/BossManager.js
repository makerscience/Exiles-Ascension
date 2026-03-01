// BossManager — handles boss challenge state, looks up named bosses, tracks kill thresholds.
// Boss fights are triggered by clicking the "Challenge Boss" button, not automatically.

import Store from './Store.js';
import { createScope, emit, EVENTS } from '../events.js';
import { D } from './BigNum.js';
import {
  getArea, getBossKillThreshold, BOSS_TYPES, AREAS,
} from '../data/areas.js';
import { getBossForZone } from '../data/bosses.js';
import { getEnemyById } from '../data/enemies.js';

let scope = null;
let activeBoss = null;       // Currently active boss enemy (or null)
let bossDefeated = false;    // Was the boss just defeated this zone?

const BossManager = {
  init() {
    scope = createScope();

    // Check boss threshold after encounter cleared (zoneClearKills incremented before this fires)
    scope.on(EVENTS.COMBAT_ENCOUNTER_ENDED, (data) => {
      if (data.reason !== 'cleared') return;
      BossManager._checkThreshold();
    });

    // Reset boss state on zone/area navigation
    scope.on(EVENTS.WORLD_ZONE_CHANGED, () => {
      BossManager.cancelBoss();
    });
  },

  destroy() {
    scope?.destroy();
    scope = null;
    activeBoss = null;
    bossDefeated = false;
  },

  /** Convert current area + zone to global zone and look up boss data. */
  _getBossData() {
    const state = Store.getState();
    const areaData = getArea(state.currentArea);
    if (!areaData) return null;
    const globalZone = areaData.zoneStart + state.currentZone - 1;
    return getBossForZone(globalZone);
  },

  /** Check if the kill threshold for the current zone's boss is met. */
  _checkThreshold() {
    const state = Store.getState();
    const area = state.currentArea;
    const zone = state.currentZone;
    const areaData = getArea(area);
    const progress = state.areaProgress[area];
    if (!progress || !areaData) return;

    // No named boss for this zone
    if (!BossManager._getBossData()) return;

    // Already defeated this zone's boss
    if (progress.bossesDefeated.includes(zone)) return;

    const kills = progress.zoneClearKills[zone] || 0;
    const threshold = getBossKillThreshold(zone, areaData.zoneCount);

    if (kills >= threshold) {
      emit(EVENTS.BOSS_CHALLENGE_READY, { area, zone, kills, threshold });
    }
  },

  /** Is the boss challenge available for the current zone? */
  isChallengeReady() {
    const state = Store.getState();
    const area = state.currentArea;
    const zone = state.currentZone;
    const areaData = getArea(area);
    const progress = state.areaProgress[area];
    if (!progress || !areaData) return false;
    if (!BossManager._getBossData()) return false;
    if (progress.bossesDefeated.includes(zone)) return false;

    const kills = progress.zoneClearKills[zone] || 0;
    const threshold = getBossKillThreshold(zone, areaData.zoneCount);
    return kills >= threshold;
  },

  /** Build a boss template from named boss data in bosses.js. Returns an enemy-like object. */
  generateBossTemplate() {
    const boss = BossManager._getBossData();
    if (!boss) return null;

    // Resolve BOSS_TYPES object from string key (e.g. 'MINI' → BOSS_TYPES.MINI)
    const bossType = BOSS_TYPES[boss.bossType] || BOSS_TYPES.MINI;

    // Resolve base enemy for sprite data
    const baseEnemy = getEnemyById(boss.baseEnemyId);
    const baseSprites = boss.sprites || (baseEnemy?.sprites ?? null);
    const baseSpriteSize = boss.spriteSize || (baseEnemy?.spriteSize ?? { w: 200, h: 250 });
    const spriteOffsetY = boss.spriteOffsetY ?? (baseEnemy?.spriteOffsetY ?? 0);
    const nameplateOffsetY = boss.nameplateOffsetY ?? (baseEnemy?.nameplateOffsetY ?? 0);

    return {
      id: boss.id,
      name: boss.name,
      title: boss.title || null,
      description: boss.description || null,
      hp: String(boss.hp),
      attack: boss.attack,
      goldDrop: String(boss.goldDrop),
      xpDrop: String(boss.xpDrop),
      isBoss: true,
      bossType,
      baseEnemyId: boss.baseEnemyId,
      sprites: baseSprites,
      spriteSize: { w: baseSpriteSize.w * bossType.sizeMult, h: baseSpriteSize.h * bossType.sizeMult },
      spriteOffsetY,
      nameplateOffsetY,
      lootTable: boss.lootTable || [],
      defense: boss.defense ?? 0,
      armorPen: boss.armorPen ?? 0,
      attackSpeed: boss.attackSpeed ?? 1.0,
      regen: boss.regen ?? 0,
      dot: boss.dot ?? null,
      enrage: boss.enrage ?? null,
    };
  },

  /** Start the boss fight. Returns the boss template or null. */
  startBoss() {
    if (!BossManager.isChallengeReady()) return null;
    if (activeBoss) return null;

    const template = BossManager.generateBossTemplate();
    if (!template) return null;

    activeBoss = template;
    bossDefeated = false;
    emit(EVENTS.BOSS_SPAWNED, {
      area: Store.getState().currentArea,
      zone: Store.getState().currentZone,
      bossType: template.bossType,
      name: template.name,
    });
    return template;
  },

  /** Called when the boss is killed. Handles zone/area advancement. */
  onBossDefeated() {
    if (!activeBoss) return;

    const state = Store.getState();
    const area = state.currentArea;
    const zone = state.currentZone;
    const bossType = activeBoss.bossType;
    const areaData = getArea(area);

    // Record boss defeated
    Store.recordBossDefeated(area, zone);
    bossDefeated = true;

    emit(EVENTS.BOSS_DEFEATED, {
      area, zone, bossType,
      name: activeBoss.name,
    });

    // Demo endpoint: after Slimefang (A1Z5), stop progression and show end screen.
    if (activeBoss.id === 'boss_a1z5_the_hollow') {
      Store.setFlag('demoCompleted', true);
      emit(EVENTS.DEMO_COMPLETED, { area, zone, name: activeBoss.name });
      activeBoss = null;
      return;
    }

    // Area boss defeated → unlock next area
    if (bossType === BOSS_TYPES.AREA) {
      emit(EVENTS.AREA_BOSS_DEFEATED, { area, name: areaData.name });

      // Unlock next area
      const nextArea = area + 1;
      if (AREAS[nextArea]) {
        Store.setFurthestArea(nextArea);
        Store.advanceAreaZone(nextArea, 1);
        Store.setAreaZone(nextArea, 1);
      }
    }

    // Advance to next zone within area (if not the last zone)
    if (zone < areaData.zoneCount) {
      const nextZone = zone + 1;
      Store.advanceAreaZone(area, nextZone);
      // Auto-navigate to next zone
      Store.setAreaZone(area, nextZone);
    }

    activeBoss = null;
  },

  /** Cancel an active boss fight (e.g., player navigates away). */
  cancelBoss() {
    activeBoss = null;
    bossDefeated = false;
  },

  /** Is a boss fight currently active? */
  isBossActive() {
    return activeBoss !== null;
  },

  /** Get the active boss template (or null). */
  getActiveBoss() {
    return activeBoss;
  },

  /** Was the boss just defeated (for UI feedback)? */
  wasBossDefeated() {
    return bossDefeated;
  },

  /** Get current zone's kill progress toward boss threshold. */
  getZoneProgress() {
    const state = Store.getState();
    const area = state.currentArea;
    const zone = state.currentZone;
    const areaData = getArea(area);
    const progress = state.areaProgress[area];
    if (!progress || !areaData) return { kills: 0, threshold: 10, ratio: 0, defeated: false };

    const kills = progress.zoneClearKills[zone] || 0;
    const threshold = getBossKillThreshold(zone, areaData.zoneCount);
    const defeated = progress.bossesDefeated.includes(zone);

    return {
      kills,
      threshold,
      ratio: Math.min(1, kills / threshold),
      defeated,
    };
  },

  /** Get the named boss data for the current zone (or null). */
  getCurrentBossData() {
    return BossManager._getBossData();
  },

  /** Get boss type label for the current zone. */
  getCurrentBossLabel() {
    const boss = BossManager._getBossData();
    if (!boss) return BOSS_TYPES.MINI.label;
    const bossType = BOSS_TYPES[boss.bossType] || BOSS_TYPES.MINI;
    return bossType.label;
  },
};

export default BossManager;

