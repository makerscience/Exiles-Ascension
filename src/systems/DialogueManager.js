// DialogueManager - data-driven SYSTEM dialogue with cooldowns and arbitration.
// Subscribes to game events, checks Store.flags, emits DIALOGUE_QUEUED.

import Store from './Store.js';
import TimeEngine from './TimeEngine.js';
import { createScope, emit, EVENTS } from '../events.js';
import { getCheat } from '../data/cheats.js';
import {
  FIRST_LAUNCH,
  FIRST_KILL, FIRST_LEVEL_UP, FIRST_EQUIP, FIRST_FRAGMENT, FIRST_SELL,
  ZONE_ENTRANCE, KILL_MILESTONES, COMBAT_COMMENTARY, EXPLOIT_UPGRADE,
  CHEAT_TOGGLE_ON, CHEAT_TOGGLE_OFF,
  PRESTIGE_AVAILABLE, PRESTIGE_PERFORMED, PRESTIGE_PERFORMED_DEFAULT, POST_PRESTIGE_COMBAT,
  BIG_DAMAGE, AMBIENT_SNARK, INVENTORY_FULL,
  FIRST_TERRITORY_CLAIM, TERRITORY_CLAIM_COMMENTARY,
  BOSS_CHALLENGE, BOSS_DEFEATED as BOSS_DEFEATED_LINES,
  ELITE_BOSS_DEFEATED, AREA_BOSS_DEFEATED,
  OFFLINE_RETURN,
  UNLOCK_ARMOR_BREAK, UNLOCK_CLEANSE, UNLOCK_INTERRUPT,
  FIRST_STANCE_SWITCH, FIRST_THORNS_HIT, FIRST_EVASION_DODGE, FIRST_REGEN_HEAL,
} from '../data/dialogue.js';
import { BOSS_TYPES } from '../data/areas.js';
import OfflineProgress from './OfflineProgress.js';

let scope = null;

// Cooldown tracker - stores last-fired timestamps (Date.now).
const cooldowns = {};
const sequenceTimers = new Set();
let sequenceCounter = 0;

const SEQUENCE_STEP_MS = 1800;

const STANCE_LABELS = {
  ruin: 'Breaker',
  tempest: 'Tempest',
  fortress: 'Fortress',
};

const UNLOCK_SEQUENCE_BY_SKILL = {
  armorBreak: {
    shownFlag: 'shownUnlockArmorBreak',
    lines: UNLOCK_ARMOR_BREAK,
    context: 'Skill unlocked: ARMOR BRK',
  },
  cleanse: {
    shownFlag: 'shownUnlockCleanse',
    lines: UNLOCK_CLEANSE,
    context: 'Skill unlocked: CLEANSE',
  },
  interrupt: {
    shownFlag: 'shownUnlockInterrupt',
    lines: UNLOCK_INTERRUPT,
    context: 'Skill unlocked: INTERRUPT',
  },
};
const GAME_COMPLETE_AREA = 2;

function isOnCooldown(key, durationMs) {
  const last = cooldowns[key] || 0;
  return (Date.now() - last) < durationMs;
}

function setCooldown(key) {
  cooldowns[key] = Date.now();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function say(text, emotion = 'sarcastic', context) {
  emit(EVENTS.DIALOGUE_QUEUED, { text, emotion, context });
}

function clearSequenceTimers() {
  for (const timerId of sequenceTimers) {
    TimeEngine.unregister(timerId);
  }
  sequenceTimers.clear();
}

function saySequence(lines, emotion = 'neutral', context) {
  if (!Array.isArray(lines) || lines.length === 0) return;

  const sequenceId = ++sequenceCounter;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0) {
      say(line, emotion, context);
      continue;
    }

    const timerId = `dialogue:sequence:${sequenceId}:${i}`;
    sequenceTimers.add(timerId);
    TimeEngine.scheduleOnce(timerId, () => {
      sequenceTimers.delete(timerId);
      say(line, emotion);
    }, SEQUENCE_STEP_MS * i);
  }
}

const DialogueManager = {
  init() {
    if (scope) return;
    scope = createScope();

    // Reset cooldowns on init.
    for (const k in cooldowns) delete cooldowns[k];
    clearSequenceTimers();

    // First kill (one-shot).
    scope.on(EVENTS.COMBAT_ENEMY_KILLED, (data) => {
      if (data.despawned) return;
      const state = Store.getState();
      if (!state.flags.firstKill) {
        Store.setFlag('firstKill', true);
        say(pick(FIRST_KILL), 'sarcastic', `${data.name} defeated!`);
      }
    });

    // Kill milestones + random combat commentary.
    scope.on(EVENTS.COMBAT_ENEMY_KILLED, (data) => {
      if (data.despawned) return;
      const state = Store.getState();
      const kills = state.totalKills;

      // Kill milestones (priority over random commentary).
      let milestoneHit = false;
      for (const [threshold, line] of Object.entries(KILL_MILESTONES)) {
        const t = Number(threshold);
        const flagKey = `kills${t}`;
        if (kills >= t && !state.flags[flagKey]) {
          Store.setFlag(flagKey, true);
          say(line, 'impressed', `Kill #${kills}`);
          milestoneHit = true;
          break; // one milestone per kill
        }
      }

      // Random combat commentary (~3% chance, 30s cooldown, suppressed by milestone).
      if (!milestoneHit && Math.random() < 0.03 && !isOnCooldown('combatCommentary', 30000)) {
        const area = state.currentArea;
        const lines = COMBAT_COMMENTARY[area];
        if (lines && lines.length > 0) {
          setCooldown('combatCommentary');
          say(pick(lines), 'sarcastic');
        }
      }
    });

    // First level up (one-shot).
    scope.on(EVENTS.PROG_LEVEL_UP, (data) => {
      const state = Store.getState();
      if (!state.flags.firstLevelUp) {
        Store.setFlag('firstLevelUp', true);
        say(pick(FIRST_LEVEL_UP), 'sarcastic', `Reached Level ${data.level}`);
      }
    });

    // Area entrances (one-shot per area).
    scope.on(EVENTS.WORLD_AREA_CHANGED, (data) => {
      const state = Store.getState();
      const area = data.area;
      if (area >= 2) {
        const flagKey = `reachedArea${area}`;
        if (!state.flags[flagKey] && ZONE_ENTRANCE[area]) {
          Store.setFlag(flagKey, true);
          say(ZONE_ENTRANCE[area], 'neutral', `Entered Area ${area}`);
        }
      }
    });

    // First equip (one-shot).
    scope.on(EVENTS.INV_ITEM_EQUIPPED, () => {
      const state = Store.getState();
      if (!state.flags.firstEquip) {
        Store.setFlag('firstEquip', true);
        say(pick(FIRST_EQUIP), 'sarcastic', 'Item equipped');
      }
    });

    // First sell (one-shot).
    scope.on(EVENTS.INV_ITEM_SOLD, () => {
      const state = Store.getState();
      if (!state.flags.firstSell) {
        Store.setFlag('firstSell', true);
        say(pick(FIRST_SELL), 'sarcastic', 'Item sold');
      }
    });

    // Inventory full (repeatable).
    scope.on(EVENTS.INV_FULL, () => {
      say(pick(INVENTORY_FULL), 'sarcastic', 'Inventory full');
    });

    // First glitch fragment (one-shot).
    scope.on(EVENTS.ECON_FRAGMENTS_GAINED, () => {
      const state = Store.getState();
      if (!state.flags.firstFragment) {
        Store.setFlag('firstFragment', true);
        say(pick(FIRST_FRAGMENT), 'worried', 'Glitch Fragment acquired');
      }
    });

    // First item merge (one-shot, reads from cheats.js data).
    scope.on(EVENTS.INV_ITEM_MERGED, () => {
      const state = Store.getState();
      if (!state.flags.firstMerge) {
        Store.setFlag('firstMerge', true);
        const cheat = getCheat('loot_hoarder');
        say(cheat.systemDialogue.onFirstMerge, 'worried', 'Items merged');
      }
    });

    // Unlock sequences (one-shot per skill).
    scope.on(EVENTS.SKILL_UNLOCKED, ({ skillId }) => {
      const unlock = UNLOCK_SEQUENCE_BY_SKILL[skillId];
      if (!unlock) return;

      const state = Store.getState();
      if (state.flags[unlock.shownFlag]) return;

      Store.setFlag(unlock.shownFlag, true);
      saySequence(unlock.lines, 'neutral', unlock.context);
    });

    // Phase 2 one-shot teaching quips.
    scope.on(EVENTS.STANCE_CHANGED, ({ stanceId }) => {
      const state = Store.getState();
      if (state.flags.firstStanceSwitch) return;
      Store.setFlag('firstStanceSwitch', true);
      const stanceLabel = STANCE_LABELS[stanceId] || stanceId;
      say(pick(FIRST_STANCE_SWITCH), 'neutral', `Stance switched: ${stanceLabel}`);
    });

    scope.on(EVENTS.COMBAT_THORNS_DAMAGE, () => {
      const state = Store.getState();
      if (state.flags.firstThornsHit) return;
      Store.setFlag('firstThornsHit', true);
      say(pick(FIRST_THORNS_HIT), 'worried');
    });

    scope.on(EVENTS.COMBAT_PLAYER_MISSED, () => {
      const state = Store.getState();
      if (state.flags.firstEvasionDodge) return;
      Store.setFlag('firstEvasionDodge', true);
      say(pick(FIRST_EVASION_DODGE), 'neutral');
    });

    scope.on(EVENTS.COMBAT_ENEMY_REGEN, () => {
      const state = Store.getState();
      if (state.flags.firstRegenHeal) return;
      Store.setFlag('firstRegenHeal', true);
      say(pick(FIRST_REGEN_HEAL), 'worried');
    });

    // Exploit upgrade snark.
    scope.on(EVENTS.UPG_PURCHASED, (data) => {
      if (data.category === 'exploit') {
        say(pick(EXPLOIT_UPGRADE), 'angry', 'Exploit upgrade purchased');
      }
    });

    // Cheat toggle snark.
    scope.on(EVENTS.CHEAT_TOGGLED, (data) => {
      if (data.active) {
        say(pick(CHEAT_TOGGLE_ON), 'angry', 'Cheat activated');
      } else {
        say(pick(CHEAT_TOGGLE_OFF), 'sarcastic', 'Cheat deactivated');
      }
    });

    // Prestige available (one-shot).
    scope.on(EVENTS.PRESTIGE_AVAILABLE, () => {
      say(pick(PRESTIGE_AVAILABLE), 'neutral');
    });

    // Prestige performed (count-indexed).
    scope.on(EVENTS.PRESTIGE_PERFORMED, (data) => {
      const line = PRESTIGE_PERFORMED[data.count] || PRESTIGE_PERFORMED_DEFAULT;
      say(line, 'impressed', `Prestige #${data.count}`);

      // Delayed post-prestige combat snark (5s).
      TimeEngine.scheduleOnce('dialogue:prestigeSnark', () => {
        say(pick(POST_PRESTIGE_COMBAT), 'sarcastic');
      }, 5000);
    });

    // Territory claims.
    scope.on(EVENTS.TERRITORY_CLAIMED, () => {
      const state = Store.getState();
      if (!state.flags.firstTerritoryClaim) {
        Store.setFlag('firstTerritoryClaim', true);
        say(pick(FIRST_TERRITORY_CLAIM), 'sarcastic', 'Territory claimed');
        return;
      }
      if (Math.random() < 0.5 && !isOnCooldown('territoryClaim', 30000)) {
        setCooldown('territoryClaim');
        say(pick(TERRITORY_CLAIM_COMMENTARY), 'sarcastic');
      }
    });

    // Boss challenge started.
    scope.on(EVENTS.BOSS_SPAWNED, () => {
      say(pick(BOSS_CHALLENGE), 'worried', 'Boss fight!');
    });

    // Boss defeated.
    scope.on(EVENTS.BOSS_DEFEATED, (data) => {
      if (data.bossType === BOSS_TYPES.ELITE) {
        say(pick(ELITE_BOSS_DEFEATED), 'impressed', `${data.name} defeated!`);
      } else {
        say(pick(BOSS_DEFEATED_LINES), 'impressed', `${data.name} defeated!`);
      }
    });

    // Area boss defeated.
    scope.on(EVENTS.AREA_BOSS_DEFEATED, (data) => {
      if (data.area === GAME_COMPLETE_AREA) {
        say('Congratulations! You finished the game!', 'impressed', 'GAME COMPLETE');
        emit(EVENTS.UI_ONBOARDING_REQUESTED, {
          title: 'SYSTEM',
          lines: ['Congratulations! You finished the game!'],
        });
      } else {
        say(pick(AREA_BOSS_DEFEATED), 'neutral', `${data.name} cleared!`);
      }
    });

    // Big damage (>1M, 15s cooldown).
    scope.on(EVENTS.COMBAT_ENEMY_DAMAGED, (data) => {
      if (data.amount.gte && data.amount.gte(1e6) && !isOnCooldown('bigDamage', 15000)) {
        setCooldown('bigDamage');
        say(pick(BIG_DAMAGE), 'impressed', 'Massive hit!');
      }
    });

    // Ambient snark (every ~120s, starts after 180s uptime).
    TimeEngine.register('dialogue:ambient', () => {
      say(pick(AMBIENT_SNARK), 'sarcastic');
    }, 120000, false); // starts disabled

    TimeEngine.scheduleOnce('dialogue:ambientEnable', () => {
      TimeEngine.setEnabled('dialogue:ambient', true);
    }, 180000);

    // First launch welcome (one-shot).
    const state0 = Store.getState();
    const offlineResult = OfflineProgress.getLastResult();
    if (!offlineResult && state0.totalKills === 0 && !state0.flags.firstLaunch) {
      Store.setFlag('firstLaunch', true);
      emit(EVENTS.UI_ONBOARDING_REQUESTED, {
        title: 'SYSTEM BRIEFING',
        lines: FIRST_LAUNCH,
      });
    }

    // Offline return quip (>5 min away).
    if (offlineResult && offlineResult.elapsedMs > 5 * 60 * 1000) {
      say(pick(OFFLINE_RETURN), 'sarcastic', `Away ${offlineResult.durationText}`);
    }
  },

  destroy() {
    scope?.destroy();
    scope = null;
    clearSequenceTimers();
    sequenceCounter = 0;
    TimeEngine.unregister('dialogue:prestigeSnark');
    TimeEngine.unregister('dialogue:ambient');
    TimeEngine.unregister('dialogue:ambientEnable');
  },
};

export default DialogueManager;
