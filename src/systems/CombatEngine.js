// CombatEngine — core combat module. No Phaser dependency.
// All callbacks reference CombatEngine.method() by name to avoid `this` binding issues.

import Store from './Store.js';
import TimeEngine from './TimeEngine.js';
import BossManager from './BossManager.js';
import Progression from './Progression.js';
import { D, Decimal } from './BigNum.js';
import { createScope, emit, EVENTS } from '../events.js';
import { ABILITIES, COMBAT_V2, STANCES, STANCE_IDS, STANCE_SWITCH_PAUSE_MS } from '../config.js';
import { getZoneScaling, getZoneBias, getArea } from '../data/areas.js';
import { getEnemyById } from '../data/enemies.js';
import { getEnemyBias, getBossBias } from '../data/balance.js';
import { pickRandomEncounter } from '../data/encounters.js';
import UpgradeManager from './UpgradeManager.js';
import TerritoryManager from './TerritoryManager.js';
import {
  getEffectiveMaxHp, getBaseDamage, getCritChance, getEffectiveDef, getPlayerAutoAttackInterval, getHpRegen, getEnemyHitChance,
  setCombatDebuffs, resetCombatDebuffs,
} from './ComputedStats.js';

let scope = null;
let forcedCritMultiplier = null;
let _playerDead = false;

// ── Bulwark shield (ephemeral, not saved) ──
let _shieldHp = 0;
let _shieldTimerId = null;

// ── Rapid Strikes timer tracking (populated in Phase 3) ──
let _rapidStrikeTimerIds = new Set();

// ── Encounter runtime ──
let encounter = null;
let _idCounter = 0;
function _generateId(prefix) {
  return `${prefix}_${++_idCounter}`;
}

const SUMMONED_ADD_REWARD_MULT = COMBAT_V2.summonedAddRewardMult ?? 0;
const ARMOR_BREAK_DURATION_MS = ABILITIES.armorBreak.durationMs;
const CORRUPTION_CFG = {
  maxStacks: COMBAT_V2.corruption?.maxStacks ?? 8,
  perStackRegenReduction: COMBAT_V2.corruption?.perStackRegenReduction ?? 0.1,
  perStackAtkReduction: COMBAT_V2.corruption?.perStackAtkReduction ?? 0.06,
  dotPerStack: COMBAT_V2.corruption?.dotPerStack ?? 2,
  decayMs: COMBAT_V2.corruption?.decayMs ?? 4000,
  tickMs: COMBAT_V2.corruption?.tickMs ?? 1000,
};

const CombatEngine = {
  init() {
    // Initialize BossManager
    BossManager.init();

    scope = createScope();

    // Register auto-attack ticker (enabled by default — it's an idle game)
    TimeEngine.register(
      'combat:autoAttack',
      () => CombatEngine.playerAttack(),
      getPlayerAutoAttackInterval(),
      true,
    );

    // Re-register auto-attack when speed upgrade purchased
    scope.on(EVENTS.UPG_PURCHASED, (data) => {
      if (data.upgradeId === 'auto_attack_speed') {
        TimeEngine.register(
          'combat:autoAttack',
          () => CombatEngine.playerAttack(),
          getPlayerAutoAttackInterval(),
          true,
        );
      }
    });

    // Re-register auto-attack when equipment changes (atkSpeed from gear may change)
    scope.on(EVENTS.INV_ITEM_EQUIPPED, () => {
      TimeEngine.register(
        'combat:autoAttack',
        () => CombatEngine.playerAttack(),
        getPlayerAutoAttackInterval(),
        true,
      );
    });

    // Player HP regen — fires every 1s
    TimeEngine.register(
      'combat:playerRegen',
      () => CombatEngine._regenPlayerHp(),
      1000,
      true,
    );

    // Subscribe to player death
    scope.on(EVENTS.COMBAT_PLAYER_DIED, () => {
      CombatEngine._onPlayerDeath();
    });

    // On level-up, restore HP to new max
    scope.on(EVENTS.PROG_LEVEL_UP, () => {
      Store.resetPlayerHp();
    });

    // Re-register auto-attack when territory attack speed buff is claimed
    scope.on(EVENTS.TERRITORY_CLAIMED, (data) => {
      if (data.buff.key === 'autoAttackSpeed') {
        TimeEngine.register(
          'combat:autoAttack',
          () => CombatEngine.playerAttack(),
          getPlayerAutoAttackInterval(),
          true,
        );
      }
    });

    // Stance switch: pause auto-attacks + cancel Rapid Strikes if leaving Flurry
    scope.on(EVENTS.STANCE_CHANGED, ({ stanceId, previousStance }) => {
      // 1. Cancel Rapid Strikes if leaving Flurry
      if (previousStance === 'flurry') {
        CombatEngine.cancelRapidStrikes();
      }

      // 2. Pause auto-attacks for STANCE_SWITCH_PAUSE_MS
      TimeEngine.unregister('combat:autoAttack');
      TimeEngine.scheduleOnce('combat:stancePause', () => {
        // Guard: don't restart if player died during the pause
        if (_playerDead) return;
        TimeEngine.register(
          'combat:autoAttack',
          () => CombatEngine.playerAttack(),
          getPlayerAutoAttackInterval(),
          true,
        );
      }, STANCE_SWITCH_PAUSE_MS);
    });

    // Subscribe to zone changes — spawn new enemy (not boss)
    scope.on(EVENTS.WORLD_ZONE_CHANGED, () => {
      TimeEngine.unregister('combat:spawnDelay');
      if (encounter) {
        CombatEngine._onEncounterEnd('zone_change');
      }
      CombatEngine.spawnEnemy();
    });

    // Spawn first enemy
    CombatEngine.spawnEnemy();
  },

  destroy() {
    BossManager.destroy();
    CombatEngine._clearEncounterTimers();
    resetCombatDebuffs();
    CombatEngine._clearShield();
    CombatEngine.cancelRapidStrikes();
    TimeEngine.unregister('combat:autoAttack');
    TimeEngine.unregister('combat:stancePause');
    TimeEngine.unregister('combat:spawnDelay');
    TimeEngine.unregister('combat:bossDefeatedDelay');
    TimeEngine.unregister('combat:playerRegen');
    TimeEngine.unregister('combat:playerRespawn');
    scope?.destroy();
    scope = null;
    encounter = null;
  },

  // ── Encounter member builder and timer helpers ──

  /**
   * Build one EnemyRuntime from scaled enemy/boss data.
   * @param {object} enemyData - Scaled stats (hp as number/string, attack, defense, etc.)
   * @param {number} slot - Visual slot index (0-based)
   * @param {object} opts - { isBoss, isAdd, attackSpeedMult }
   */
  _buildMember(enemyData, slot, opts = {}) {
    const effectiveAtkSpeed = (enemyData.attackSpeed ?? 1.0) * (opts.attackSpeedMult ?? 1.0);
    const armor = (
      enemyData.armor
      && typeof enemyData.armor === 'object'
      && typeof enemyData.armor.reduction === 'number'
    )
      ? { reduction: enemyData.armor.reduction }
      : null;
    const summon = (
      enemyData.summon
      && typeof enemyData.summon === 'object'
      && typeof enemyData.summon.enemyId === 'string'
    )
      ? {
          enemyId: enemyData.summon.enemyId,
          count: enemyData.summon.count ?? 1,
          castTime: enemyData.summon.castTime ?? 0,
          maxAdds: enemyData.summon.maxAdds ?? 0,
          cooldownMs: enemyData.summon.cooldownMs ?? 0,
        }
      : null;
    return {
      instanceId: _generateId('mem'),
      slot,
      enemyId: enemyData.id,
      name: enemyData.name,
      hp: D(enemyData.hp),
      maxHp: D(enemyData.hp),
      attack: enemyData.attack,
      attackSpeed: effectiveAtkSpeed,
      defense: enemyData.defense ?? 0,
      accuracy: enemyData.accuracy ?? 80,
      armorPen: enemyData.armorPen ?? 0,
      dot: enemyData.dot ?? null,
      regen: enemyData.regen ?? 0,
      enrage: enemyData.enrage ?? null,
      thorns: enemyData.thorns ?? 0,
      evasion: enemyData.evasion ?? 0,
      armor,
      corruption: enemyData.corruption ?? 0,
      summon: opts.isAdd ? null : summon,
      splitOnDeath: enemyData.splitOnDeath ?? null,
      _armorBroken: false,
      _armorBreakTimerId: null,
      _enraged: false,
      _summonCasting: false,
      _summonCastTimerId: null,
      lootTable: enemyData.lootTable,
      goldDrop: String(enemyData.goldDrop),
      xpDrop: String(enemyData.xpDrop),
      isBoss: opts.isBoss || false,
      isAdd: opts.isAdd || false,
      summonerId: opts.summonerId ?? null,
      baseEnemyId: enemyData.baseEnemyId ?? null,
      alive: true,
    };
  },

  /**
   * Build an EncounterRuntime from an array of built members and the source template.
   */
  _createEncounterRuntime(members, template, type) {
    const memberById = new Map();
    for (const m of members) memberById.set(m.instanceId, m);
    return {
      id: _generateId('enc'),
      templateId: template?.id ?? null,
      type,
      members,
      memberById,
      targetId: null,
      activeTimerIds: new Set(),
      bossMemberId: null,
      attackSpeedMult: template?.attackSpeedMult ?? 1.0,
      rewardMult: template?.rewardMult ?? 1.0,
      lootBonus: template?.lootBonus ?? { dropChanceMult: 1.0, rarityBoost: 0 },
      pendingSplits: 0,
      attackLockCount: 0,
      corruptionStacks: 0,
    };
  },

  _toMemberPayload(member) {
    return {
      instanceId: member.instanceId,
      slot: member.slot,
      enemyId: member.enemyId,
      name: member.name,
      maxHp: member.maxHp,
      isBoss: member.isBoss,
      armorPen: member.armorPen,
      dot: member.dot,
      regen: member.regen,
      enrage: member.enrage,
      thorns: member.thorns,
      evasion: member.evasion,
      armor: member.armor,
      corruption: member.corruption,
      summon: member.summon,
      attackSpeed: member.attackSpeed,
      defense: member.defense ?? 0,
      baseEnemyId: member.baseEnemyId ?? null,
      isAdd: member.isAdd || false,
      summonerId: member.summonerId ?? null,
    };
  },

  _getFreeEncounterSlot() {
    if (!encounter) return null;
    const occupied = new Set(encounter.members.filter(m => m.alive).map(m => m.slot));
    for (let i = 0; i < COMBAT_V2.maxEncounterSize; i++) {
      if (!occupied.has(i)) return i;
    }
    return null;
  },

  /**
   * Shared startup for both spawn paths.
   * Sets encounter state, registers timers, emits events.
   */
  _startEncounter(enc) {
    encounter = enc;
    enc.targetId = enc.members[0].instanceId;
    enc.corruptionStacks = 0;
    resetCombatDebuffs();

    // Per-member attack + DoT timers (staggered so they don't all fire at once)
    for (let i = 0; i < enc.members.length; i++) {
      CombatEngine._registerMemberTimers(enc.members[i], i);
    }

    // Emit encounter started with full member list
    emit(EVENTS.COMBAT_ENCOUNTER_STARTED, {
      encounterId: enc.id,
      templateId: enc.templateId,
      type: enc.type,
      memberCount: enc.members.length,
      members: enc.members.map(m => CombatEngine._toMemberPayload(m)),
    });
  },

  /** Register attack + DoT timers for a single encounter member.
   *  staggerIndex offsets the first attack so grouped enemies don't all swing at once. */
  _registerMemberTimers(member, staggerIndex = 0) {
    if (!encounter) return;
    const speed = member.attackSpeed;
    const interval = Math.max(400, Math.floor(COMBAT_V2.baseAttackIntervalMs / speed));
    const atkKey = `enc:${encounter.id}:atk:${member.instanceId}`;
    // Stagger: each subsequent enemy delays its first attack by a fraction of the interval
    const staggerOffset = staggerIndex > 0 ? -Math.floor(interval * staggerIndex / encounter.members.length) : 0;
    TimeEngine.register(atkKey, () => CombatEngine.enemyAttack(member.instanceId), interval, true, staggerOffset);
    encounter.activeTimerIds.add(atkKey);

    if (member.dot) {
      const dotKey = `enc:${encounter.id}:dot:${member.instanceId}`;
      let dotTickCount = 0;
      TimeEngine.register(dotKey, () => {
        CombatEngine._applyIncomingDamage(member.dot, 'dot');
        dotTickCount++;
        emit(EVENTS.COMBAT_DOT_TICK, {
          damage: member.dot,
          tickNumber: dotTickCount,
          encounterId: encounter.id,
          instanceId: member.instanceId,
          slot: member.slot,
        });
      }, 1000, true);
      encounter.activeTimerIds.add(dotKey);
    }

    if (member.regen > 0) {
      const regenKey = `enc:${encounter.id}:regen:${member.instanceId}`;
      TimeEngine.register(regenKey, () => {
        if (!member.alive) return;
        const before = member.hp;
        member.hp = Decimal.min(member.hp.plus(member.regen), member.maxHp);
        const healed = member.hp.minus(before).toNumber();
        if (healed > 0) {
          emit(EVENTS.COMBAT_ENEMY_REGEN, {
            amount: healed,
            remainingHp: member.hp,
            maxHp: member.maxHp,
            encounterId: encounter.id,
            instanceId: member.instanceId,
            slot: member.slot,
          });
        }
      }, 1000, true);
      encounter.activeTimerIds.add(regenKey);
    }

    if (member.summon) {
      const summonInterval = member.summon.cooldownMs || Math.max(1000, member.summon.castTime);
      const summonKey = `enc:${encounter.id}:summon:${member.instanceId}`;
      TimeEngine.register(summonKey, () => CombatEngine._tryStartSummonCast(member.instanceId), summonInterval, true);
      encounter.activeTimerIds.add(summonKey);
    }
  },

  /** Unregister attack + DoT + regen timers for a single member. */
  _unregisterMemberTimers(member) {
    if (!encounter) return;
    const atkKey = `enc:${encounter.id}:atk:${member.instanceId}`;
    const dotKey = `enc:${encounter.id}:dot:${member.instanceId}`;
    const regenKey = `enc:${encounter.id}:regen:${member.instanceId}`;
    const summonKey = `enc:${encounter.id}:summon:${member.instanceId}`;
    TimeEngine.unregister(atkKey);
    TimeEngine.unregister(dotKey);
    TimeEngine.unregister(regenKey);
    TimeEngine.unregister(summonKey);
    encounter.activeTimerIds.delete(atkKey);
    encounter.activeTimerIds.delete(dotKey);
    encounter.activeTimerIds.delete(regenKey);
    encounter.activeTimerIds.delete(summonKey);

    if (member._summonCastTimerId) {
      TimeEngine.unregister(member._summonCastTimerId);
      encounter.activeTimerIds.delete(member._summonCastTimerId);
      member._summonCastTimerId = null;
      member._summonCasting = false;
    }

    if (member._armorBreakTimerId) {
      TimeEngine.unregister(member._armorBreakTimerId);
      encounter.activeTimerIds.delete(member._armorBreakTimerId);
      member._armorBreakTimerId = null;
    }
  },

  /** Unregister all timers owned by the current encounter. */
  _clearEncounterTimers() {
    if (!encounter) return;
    for (const timerId of encounter.activeTimerIds) {
      TimeEngine.unregister(timerId);
    }
    encounter.activeTimerIds.clear();
  },

  /** Enable or disable all encounter timers (used during player death). */
  _setEncounterTimersEnabled(enabled) {
    if (!encounter) return;
    for (const timerId of encounter.activeTimerIds) {
      TimeEngine.setEnabled(timerId, enabled);
    }
  },

  _buildScaledEnemyForCurrentZone(enemyId) {
    const enemyTemplate = getEnemyById(enemyId);
    if (!enemyTemplate) return null;

    const state = Store.getState();
    const zone = state.currentZone;
    const areaData = getArea(state.currentArea);
    const globalZone = areaData ? areaData.zoneStart + zone - 1 : zone;
    const atkScale = getZoneScaling(zone, 'atk');
    const eb = (stat) => getEnemyBias(enemyTemplate.id, stat);
    return {
      ...enemyTemplate,
      hp: D(enemyTemplate.hp).times(getZoneScaling(zone, 'hp') * getZoneBias(globalZone, 'hp') * eb('hp')).floor().toString(),
      attack: Math.floor(enemyTemplate.attack * atkScale * getZoneBias(globalZone, 'atk') * eb('atk')),
      defense: Math.floor((enemyTemplate.defense || 0) * getZoneBias(globalZone, 'def') * eb('def')),
      attackSpeed: (enemyTemplate.attackSpeed ?? 1) * getZoneBias(globalZone, 'speed') * eb('speed'),
      goldDrop: D(enemyTemplate.goldDrop).times(getZoneScaling(zone, 'gold') * getZoneBias(globalZone, 'gold') * eb('gold')).floor().toString(),
      xpDrop: D(enemyTemplate.xpDrop).times(getZoneScaling(zone, 'xp') * getZoneBias(globalZone, 'xp') * eb('xp')).floor().toString(),
      regen: enemyTemplate.regen ? Math.floor(enemyTemplate.regen * atkScale * getZoneBias(globalZone, 'regen') * eb('regen')) : 0,
      thorns: enemyTemplate.thorns ? Math.floor(enemyTemplate.thorns * atkScale * getZoneBias(globalZone, 'atk') * eb('atk')) : 0,
    };
  },

  _addEncounterMember(enemyData, opts = {}) {
    if (!encounter) return null;
    const slot = CombatEngine._getFreeEncounterSlot();
    if (slot == null) return null;

    const member = CombatEngine._buildMember(enemyData, slot, {
      isAdd: opts.isAdd || false,
      summonerId: opts.summonerId ?? null,
      attackSpeedMult: encounter.attackSpeedMult,
    });

    encounter.members.push(member);
    encounter.memberById.set(member.instanceId, member);
    CombatEngine._registerMemberTimers(member, encounter.members.length - 1);

    if (!CombatEngine.hasTarget()) {
      encounter.targetId = member.instanceId;
      emit(EVENTS.COMBAT_TARGET_CHANGED, {
        encounterId: encounter.id,
        instanceId: member.instanceId,
        slot: member.slot,
        enemyId: member.enemyId,
      });
    }

    emit(EVENTS.COMBAT_MEMBER_ADDED, {
      encounterId: encounter.id,
      memberCount: CombatEngine.getLivingMembers().length,
      member: CombatEngine._toMemberPayload(member),
    });

    return member;
  },

  _tryStartSummonCast(instanceId) {
    if (!encounter) return;
    const summoner = encounter.memberById.get(instanceId);
    if (!summoner?.alive || !summoner.summon) return;
    if (summoner._summonCasting) return;
    const activeAdds = encounter.members.filter(m =>
      m.alive && m.isAdd && m.summonerId === summoner.instanceId).length;
    if (activeAdds >= summoner.summon.maxAdds) return;
    if (CombatEngine._getFreeEncounterSlot() == null) return;

    summoner._summonCasting = true;
    const castKey = `enc:${encounter.id}:summonCast:${summoner.instanceId}`;
    summoner._summonCastTimerId = castKey;
    TimeEngine.scheduleOnce(castKey, () => CombatEngine._resolveSummonCast(summoner.instanceId), summoner.summon.castTime);
    encounter.activeTimerIds.add(castKey);

    emit(EVENTS.COMBAT_ENEMY_CASTING, {
      encounterId: encounter.id,
      instanceId: summoner.instanceId,
      slot: summoner.slot,
      enemyId: summoner.enemyId,
      castTime: summoner.summon.castTime,
    });
  },

  _resolveSummonCast(instanceId) {
    if (!encounter) return;
    const summoner = encounter.memberById.get(instanceId);
    if (!summoner?.alive || !summoner.summon) return;

    if (summoner._summonCastTimerId) {
      encounter.activeTimerIds.delete(summoner._summonCastTimerId);
      summoner._summonCastTimerId = null;
    }
    summoner._summonCasting = false;

    const activeAdds = encounter.members.filter(m =>
      m.alive && m.isAdd && m.summonerId === summoner.instanceId).length;
    const remainingCap = Math.max(0, summoner.summon.maxAdds - activeAdds);
    if (remainingCap <= 0) return;

    const toSpawn = Math.min(summoner.summon.count, remainingCap);
    for (let i = 0; i < toSpawn; i++) {
      if (CombatEngine._getFreeEncounterSlot() == null) break;
      const scaledAdd = CombatEngine._buildScaledEnemyForCurrentZone(summoner.summon.enemyId);
      if (!scaledAdd) break;
      const newMember = CombatEngine._addEncounterMember(scaledAdd, {
        isAdd: true,
        summonerId: summoner.instanceId,
      });
      if (!newMember) break;
    }
  },

  _cancelSummonCast(member, source = 'interrupt') {
    if (!encounter || !member?._summonCasting || !member._summonCastTimerId) return false;
    TimeEngine.unregister(member._summonCastTimerId);
    encounter.activeTimerIds.delete(member._summonCastTimerId);
    member._summonCastTimerId = null;
    member._summonCasting = false;
    emit(EVENTS.COMBAT_INTERRUPTED, {
      encounterId: encounter.id,
      instanceId: member.instanceId,
      slot: member.slot,
      enemyId: member.enemyId,
      source,
    });
    return true;
  },

  interruptTarget() {
    const target = CombatEngine.getTargetMember();
    if (!target) return false;
    return CombatEngine._cancelSummonCast(target, 'player');
  },

  armorBreakTarget(durationMs = ARMOR_BREAK_DURATION_MS) {
    if (!encounter) return false;
    const target = CombatEngine.getTargetMember();
    if (!target?.alive || !target.armor) return false;

    target._armorBroken = true;
    emit(EVENTS.COMBAT_ARMOR_BROKEN, {
      encounterId: encounter.id,
      instanceId: target.instanceId,
      slot: target.slot,
      enemyId: target.enemyId,
    });

    if (target._armorBreakTimerId) {
      TimeEngine.unregister(target._armorBreakTimerId);
      encounter.activeTimerIds.delete(target._armorBreakTimerId);
    }

    const restoreKey = `enc:${encounter.id}:armorRestore:${target.instanceId}`;
    target._armorBreakTimerId = restoreKey;
    TimeEngine.scheduleOnce(restoreKey, () => {
      if (!encounter) return;
      const member = encounter.memberById.get(target.instanceId);
      if (!member?.alive) return;
      member._armorBroken = false;
      member._armorBreakTimerId = null;
      encounter.activeTimerIds.delete(restoreKey);
      emit(EVENTS.COMBAT_ARMOR_RESTORED, {
        encounterId: encounter.id,
        instanceId: member.instanceId,
        slot: member.slot,
        enemyId: member.enemyId,
      });
    }, durationMs);
    encounter.activeTimerIds.add(restoreKey);
    return true;
  },

  _syncCorruptionState() {
    if (!encounter) {
      resetCombatDebuffs();
      return;
    }

    const stacks = encounter.corruptionStacks ?? 0;
    const regenMult = Math.max(0.2, 1 - stacks * CORRUPTION_CFG.perStackRegenReduction);
    const attackMult = Math.max(0.5, 1 - stacks * CORRUPTION_CFG.perStackAtkReduction);
    setCombatDebuffs({ attackMult, regenMult });

    const dotKey = `enc:${encounter.id}:corruptionDot`;
    const decayKey = `enc:${encounter.id}:corruptionDecay`;
    if (stacks > 0) {
      if (!encounter.activeTimerIds.has(dotKey)) {
        TimeEngine.register(dotKey, () => {
          if (!encounter || (encounter.corruptionStacks ?? 0) <= 0) return;
          CombatEngine._applyIncomingDamage(encounter.corruptionStacks * CORRUPTION_CFG.dotPerStack, 'corruption');
        }, CORRUPTION_CFG.tickMs, true);
        encounter.activeTimerIds.add(dotKey);
      }
      if (!encounter.activeTimerIds.has(decayKey)) {
        TimeEngine.register(decayKey, () => {
          if (!encounter) return;
          CombatEngine._setCorruptionStacks(encounter.corruptionStacks - 1, 'decay');
        }, CORRUPTION_CFG.decayMs, true);
        encounter.activeTimerIds.add(decayKey);
      }
    } else {
      TimeEngine.unregister(dotKey);
      TimeEngine.unregister(decayKey);
      encounter.activeTimerIds.delete(dotKey);
      encounter.activeTimerIds.delete(decayKey);
    }
  },

  _setCorruptionStacks(nextStacks, reason = 'set', sourceMember = null) {
    if (!encounter) return;
    const prev = encounter.corruptionStacks ?? 0;
    const clamped = Math.max(0, Math.min(CORRUPTION_CFG.maxStacks, Math.floor(nextStacks)));
    if (clamped === prev) return;

    encounter.corruptionStacks = clamped;
    CombatEngine._syncCorruptionState();

    emit(EVENTS.CORRUPTION_CHANGED, {
      encounterId: encounter.id,
      stacks: clamped,
      maxStacks: CORRUPTION_CFG.maxStacks,
      reason,
      sourceInstanceId: sourceMember?.instanceId ?? null,
      sourceEnemyId: sourceMember?.enemyId ?? null,
    });

    if (prev > 0 && clamped === 0) {
      emit(EVENTS.CORRUPTION_CLEANSED, {
        encounterId: encounter.id,
        removedStacks: prev,
        reason,
      });
    }
  },

  _addCorruptionStacks(amount, sourceMember = null) {
    if (!encounter || amount <= 0) return;
    CombatEngine._setCorruptionStacks((encounter.corruptionStacks ?? 0) + amount, 'gain', sourceMember);
  },

  cleanseCorruption() {
    if (!encounter) return false;
    if ((encounter.corruptionStacks ?? 0) <= 0) return false;
    CombatEngine._setCorruptionStacks(0, 'cleanse');
    return true;
  },

  _resetCorruption(reason = 'reset') {
    if (!encounter) {
      resetCombatDebuffs();
      return;
    }
    CombatEngine._setCorruptionStacks(0, reason);
    resetCombatDebuffs();
  },

  /** Spawn a regular enemy using encounter templates + zone scaling. */
  spawnEnemy() {
    const state = Store.getState();
    const area = state.currentArea;
    const zone = state.currentZone;

    // Pick a weighted random encounter template for this area+zone
    const encTemplate = pickRandomEncounter(area, zone);
    if (!encTemplate) return;

    // Compute global zone for per-zone bias lookups
    const areaData = getArea(area);
    const globalZone = areaData ? areaData.zoneStart + zone - 1 : zone;

    // Build members array — scale each member's stats by zone
    const members = encTemplate.members.map((memberId, slotIndex) => {
      const enemyTemplate = getEnemyById(memberId);
      if (!enemyTemplate) return null;

      const atkScale = getZoneScaling(zone, 'atk');
      const eb = (stat) => getEnemyBias(enemyTemplate.id, stat);
      const scaledData = {
        ...enemyTemplate,
        hp:          D(enemyTemplate.hp).times(getZoneScaling(zone, 'hp') * getZoneBias(globalZone, 'hp') * eb('hp')).floor().toString(),
        attack:      Math.floor(enemyTemplate.attack * atkScale * getZoneBias(globalZone, 'atk') * eb('atk')),
        defense:     Math.floor((enemyTemplate.defense || 0) * getZoneBias(globalZone, 'def') * eb('def')),
        attackSpeed: (enemyTemplate.attackSpeed ?? 1) * getZoneBias(globalZone, 'speed') * eb('speed'),
        goldDrop:    D(enemyTemplate.goldDrop).times(getZoneScaling(zone, 'gold') * getZoneBias(globalZone, 'gold') * eb('gold')).floor().toString(),
        xpDrop:      D(enemyTemplate.xpDrop).times(getZoneScaling(zone, 'xp') * getZoneBias(globalZone, 'xp') * eb('xp')).floor().toString(),
        regen:       enemyTemplate.regen ? Math.floor(enemyTemplate.regen * atkScale * getZoneBias(globalZone, 'regen') * eb('regen')) : 0,
        thorns:      enemyTemplate.thorns ? Math.floor(enemyTemplate.thorns * atkScale * getZoneBias(globalZone, 'atk') * eb('atk')) : 0,
      };

      return CombatEngine._buildMember(scaledData, slotIndex, {
        attackSpeedMult: encTemplate.attackSpeedMult,
      });
    }).filter(Boolean);

    if (members.length === 0) return;

    const enc = CombatEngine._createEncounterRuntime(members, encTemplate, 'normal');
    CombatEngine._startEncounter(enc);
  },

  /** Spawn a boss enemy (called by BossManager via BossChallenge UI). */
  spawnBoss(bossTemplate) {
    // Cancel any pending spawn
    TimeEngine.unregister('combat:spawnDelay');

    // End current encounter properly so GameScene clears all enemy slots
    if (encounter) {
      CombatEngine._onEncounterEnd('boss_challenge');
    }

    // Build boss member — no zone scaling (boss stats are hand-authored)
    const bb = (stat) => getBossBias(bossTemplate.id, stat);
    const scaledBoss = {
      ...bossTemplate,
      hp:          D(bossTemplate.hp).times(bb('hp')).floor().toString(),
      attack:      Math.floor(bossTemplate.attack * bb('atk')),
      defense:     Math.floor((bossTemplate.defense || 0) * bb('def')),
      attackSpeed: (bossTemplate.attackSpeed ?? 1) * bb('speed'),
      goldDrop:    D(bossTemplate.goldDrop).times(bb('gold')).floor().toString(),
      xpDrop:      D(bossTemplate.xpDrop).times(bb('xp')).floor().toString(),
      regen:       bossTemplate.regen ? Math.floor(bossTemplate.regen * bb('regen')) : 0,
    };
    const bossMember = CombatEngine._buildMember(scaledBoss, 0, { isBoss: true });

    const enc = CombatEngine._createEncounterRuntime([bossMember], null, 'boss');
    enc.bossMemberId = bossMember.instanceId;
    CombatEngine._startEncounter(enc);
  },

  /** Power Smash — active ability dealing smashMultiplier × base click damage. */
  powerSmashAttack(smashMultiplier) {
    const target = CombatEngine.getTargetMember();
    if (!target) return;
    if (CombatEngine._playerAttackMissed(target, 'smash')) return;

    const state = Store.getState();
    const { damage, isCrit } = CombatEngine.getPlayerDamage(state, true);
    let smashDamage = damage.times(smashMultiplier).floor();
    smashDamage = CombatEngine._applyTargetArmorReduction(smashDamage, target);

    target.hp = Decimal.max(target.hp.minus(smashDamage), 0);

    emit(EVENTS.COMBAT_ENEMY_DAMAGED, {
      enemyId: target.enemyId,
      amount: smashDamage,
      isCrit,
      isPowerSmash: true,
      remainingHp: target.hp,
      maxHp: target.maxHp,
      encounterId: encounter?.id ?? null,
      instanceId: target.instanceId,
      slot: target.slot,
    });

    if (target.hp.lte(0)) {
      CombatEngine._onMemberDeath(target.instanceId);
    } else {
      CombatEngine._checkEnrage(target);
    }

    // Thorns: reflect damage to player (triggers even if target died)
    CombatEngine._applyThorns(target);
  },

  playerAttack(isClick = false) {
    const target = CombatEngine.getTargetMember();
    if (!target) return;
    if (CombatEngine._playerAttackMissed(target, isClick ? 'click' : 'auto')) return;

    const state = Store.getState();
    let { damage, isCrit } = CombatEngine.getPlayerDamage(state, isClick);

    if (isClick) {
      damage = damage.mul(COMBAT_V2.clickDamageScalar);
    }
    damage = CombatEngine._applyTargetArmorReduction(damage, target);

    target.hp = Decimal.max(target.hp.minus(damage), 0);

    emit(EVENTS.COMBAT_ENEMY_DAMAGED, {
      enemyId: target.enemyId,
      amount: damage,
      isCrit,
      isClick,
      remainingHp: target.hp,
      maxHp: target.maxHp,
      encounterId: encounter?.id ?? null,
      instanceId: target.instanceId,
      slot: target.slot,
    });

    if (target.hp.lte(0)) {
      CombatEngine._onMemberDeath(target.instanceId);
    } else {
      CombatEngine._checkEnrage(target);
    }

    // Thorns: reflect damage to player (triggers even if target died)
    CombatEngine._applyThorns(target);
  },

  _playerAttackMissed(target, source) {
    const evadeChance = target?.evasion ?? 0;
    if (evadeChance <= 0) return false;
    if (Math.random() >= evadeChance) return false;
    emit(EVENTS.COMBAT_PLAYER_MISSED, {
      encounterId: encounter?.id ?? null,
      instanceId: target.instanceId,
      slot: target.slot,
      enemyId: target.enemyId,
      source,
    });
    return true;
  },

  _applyTargetArmorReduction(rawDamage, target) {
    if (!target?.armor || target._armorBroken) return rawDamage;
    const reduction = target.armor.reduction ?? 0;
    if (reduction <= 0) return rawDamage;
    const multiplier = Math.max(0, 1 - reduction);
    return Decimal.max(rawDamage.times(multiplier).floor(), D(1));
  },

  getPlayerDamage(state, isClick = false) {
    const str = getBaseDamage();
    const target = CombatEngine.getTargetMember();
    const enemyDef = target?.defense ?? 0;
    const rawDamage = COMBAT_V2.playerDamage(str, enemyDef);

    const prestigeMult = state.prestigeMultiplier;
    const clickDmgMult = isClick ? UpgradeManager.getMultiplier('clickDamage') : 1;
    const critChance = getCritChance();

    // Forced crit from FirstCrackDirector consumes the override
    let isCrit;
    let critMult;
    if (forcedCritMultiplier != null) {
      isCrit = true;
      critMult = forcedCritMultiplier;
      forcedCritMultiplier = null;
    } else {
      isCrit = Math.random() < critChance;
      const baseCritMult = state.flags.crackTriggered ? 10 : (COMBAT_V2.critMultiplier ?? 2);
      critMult = isCrit ? baseCritMult : 1;
    }

    const stance = STANCES[state.currentStance] || STANCES.power;
    const stanceMult = isClick ? 1 : stance.damageMult;

    const damage = D(rawDamage).times(clickDmgMult).times(prestigeMult).times(critMult)
      .times(TerritoryManager.getBuffMultiplier('baseDamage')).times(stanceMult).floor();
    return { damage, isCrit };
  },

  setForcedCrit(mult) {
    forcedCritMultiplier = mult;
  },

  // ── Encounter selectors ──

  /** Returns the active EncounterRuntime or null. */
  getEncounter() {
    return encounter;
  },

  /** Returns the EnemyRuntime currently targeted, or null. */
  getTargetMember() {
    if (!encounter) return null;
    return encounter.memberById.get(encounter.targetId) ?? null;
  },

  /** Returns array of alive EnemyRuntime members. */
  getLivingMembers() {
    if (!encounter) return [];
    return encounter.members.filter(m => m.alive);
  },

  /** Map lookup by instanceId. */
  getMemberByInstanceId(id) {
    if (!encounter) return null;
    return encounter.memberById.get(id) ?? null;
  },

  /** True if there is a living target. */
  hasTarget() {
    if (!encounter) return false;
    const target = encounter.memberById.get(encounter.targetId);
    return target?.alive === true;
  },

  /** Set the current target to a living member. Emits COMBAT_TARGET_CHANGED. */
  setTarget(instanceId) {
    if (!encounter) return;
    const member = encounter.memberById.get(instanceId);
    if (!member || !member.alive) return;
    encounter.targetId = instanceId;
    emit(EVENTS.COMBAT_TARGET_CHANGED, {
      encounterId: encounter.id,
      instanceId: member.instanceId,
      slot: member.slot,
      enemyId: member.enemyId,
    });
  },

  // ── Enrage check ──

  /** One-time enrage trigger when a member's HP drops below threshold. */
  _checkEnrage(member) {
    if (!member.enrage || member._enraged) return;
    const ratio = member.hp.div(member.maxHp).toNumber();
    if (ratio >= member.enrage.threshold) return;

    member._enraged = true;
    member.attack = Math.floor(member.attack * member.enrage.atkMult);
    member.attackSpeed *= member.enrage.speedMult;

    // Re-register attack timer with boosted speed
    if (encounter) {
      const atkKey = `enc:${encounter.id}:atk:${member.instanceId}`;
      const interval = Math.max(400, Math.floor(COMBAT_V2.baseAttackIntervalMs / member.attackSpeed));
      TimeEngine.register(atkKey, () => CombatEngine.enemyAttack(member.instanceId), interval, true);
    }

    emit(EVENTS.COMBAT_ENEMY_ENRAGED, {
      enemyId: member.enemyId,
      name: member.name,
      encounterId: encounter?.id ?? null,
      instanceId: member.instanceId,
      slot: member.slot,
    });
  },

  // ── Thorns reflection ──

  /** Apply thorns damage to the player after a hit. Bypasses DEF. */
  _applyThorns(member) {
    if (!member.thorns || member.thorns <= 0) return;
    Store.damagePlayer(member.thorns);
    emit(EVENTS.COMBAT_THORNS_DAMAGE, {
      amount: member.thorns,
      encounterId: encounter?.id ?? null,
      instanceId: member.instanceId,
      slot: member.slot,
    });
  },

  // ── Incoming damage pipeline ──

  /**
   * Unified incoming damage: stance DR → Bulwark absorb → Store.damagePlayer.
   * @param {number} rawDamage - Pre-mitigation damage
   * @param {string} _source - 'attack' | 'dot' (for future logging/analysis)
   */
  _applyIncomingDamage(rawDamage, _source) {
    const state = Store.getState();
    const stance = STANCES[state.currentStance] || STANCES.power;

    // 1. Stance damage reduction (Fortress)
    let dmg = rawDamage * (1 - stance.damageReduction);

    // 2. Bulwark shield absorb
    if (_shieldHp > 0) {
      if (dmg <= _shieldHp) {
        _shieldHp -= dmg;
        return; // fully absorbed
      }
      dmg -= _shieldHp;
      _shieldHp = 0;
      CombatEngine._clearShield();
    }

    // 3. Apply remaining damage to player
    if (dmg > 0) {
      Store.damagePlayer(dmg);
    }
  },

  /**
   * Activate Rapid Strikes — 5 hits at 200ms spacing using auto-attack damage.
   * Each hit targets the current live target; whiffs if no target exists.
   */
  activateRapidStrikes() {
    const castId = _generateId('rapid');
    for (let i = 0; i < 5; i++) {
      const timerId = `ability:rapid:${castId}:${i}`;
      _rapidStrikeTimerIds.add(timerId);
      TimeEngine.scheduleOnce(timerId, () => {
        _rapidStrikeTimerIds.delete(timerId);
        // Whiff silently if no living target (spawn-delay gap)
        if (!CombatEngine.hasTarget()) return;
        CombatEngine.playerAttack(false);
      }, 200 * (i + 1));
    }
  },

  /** Cancel all active Rapid Strikes timers. */
  cancelRapidStrikes() {
    for (const timerId of _rapidStrikeTimerIds) {
      TimeEngine.unregister(timerId);
    }
    _rapidStrikeTimerIds.clear();
  },

  /** Activate Bulwark absorb shield. */
  activateShield(amount, durationMs) {
    _shieldHp = amount;
    // Clear any existing shield timer
    if (_shieldTimerId) {
      TimeEngine.unregister(_shieldTimerId);
    }
    _shieldTimerId = 'combat:shieldExpiry';
    TimeEngine.scheduleOnce(_shieldTimerId, () => {
      _shieldHp = 0;
      _shieldTimerId = null;
    }, durationMs);

    emit(EVENTS.BULWARK_ACTIVATED, { shieldHp: amount, durationMs });
  },

  /** Current shield HP (0 if no shield). */
  getShieldHp() {
    return _shieldHp;
  },

  /** Clear shield state (on death, encounter end, etc.). */
  _clearShield() {
    _shieldHp = 0;
    if (_shieldTimerId) {
      TimeEngine.unregister(_shieldTimerId);
      _shieldTimerId = null;
    }
  },

  enemyAttack(instanceId) {
    // Look up attacker by instanceId, fall back to target member for safety
    const member = instanceId
      ? CombatEngine.getMemberByInstanceId(instanceId)
      : CombatEngine.getTargetMember();
    if (!member?.alive) return;

    const accuracy = member.accuracy ?? 80;
    const hitChance = getEnemyHitChance(accuracy);
    emit(EVENTS.COMBAT_ENEMY_ATTACKED, {
      enemyId: member.enemyId,
      name: member.name,
      accuracy,
      hitChance,
      encounterId: encounter?.id ?? null,
      instanceId: member.instanceId,
      slot: member.slot,
    });
    if (Math.random() > hitChance) {
      emit(EVENTS.COMBAT_ENEMY_DODGED, {
        enemyId: member.enemyId,
        name: member.name,
        accuracy,
        hitChance,
        dodgeChance: 1 - hitChance,
        encounterId: encounter?.id ?? null,
        instanceId: member.instanceId,
        slot: member.slot,
      });
      return;
    }
    const playerDef = getEffectiveDef();
    const armorPen = member.armorPen ?? 0;
    const damage = COMBAT_V2.enemyDamage(member.attack, playerDef, armorPen);
    CombatEngine._applyIncomingDamage(damage, 'attack');
    if ((member.corruption ?? 0) > 0) {
      CombatEngine._addCorruptionStacks(member.corruption, member);
    }
  },

  _regenPlayerHp() {
    const regenAmount = getHpRegen();
    Store.healPlayer(regenAmount);
  },

  /** Delegates to ComputedStats.getEffectiveMaxHp(). Kept for backward compat. */
  getEffectiveMaxHp() {
    return getEffectiveMaxHp();
  },

  /** True while player is dead and waiting to respawn. */
  isPlayerDead() {
    return _playerDead;
  },

  _onPlayerDeath() {
    _playerDead = true;
    CombatEngine._clearShield();
    CombatEngine.cancelRapidStrikes();
    // Pause combat
    TimeEngine.setEnabled('combat:autoAttack', false);
    TimeEngine.setEnabled('combat:playerRegen', false);

    // If fighting a boss, cancel the boss fight
    if (encounter?.type === 'boss') {
      BossManager.cancelBoss();
    }

    // End the encounter properly so GameScene clears all enemy slots
    CombatEngine._onEncounterEnd('player_death');

    // Respawn after delay
    TimeEngine.scheduleOnce('combat:playerRespawn', () => {
      _playerDead = false;
      Store.resetPlayerHp();
      TimeEngine.setEnabled('combat:autoAttack', true);
      TimeEngine.setEnabled('combat:playerRegen', true);
      // Don't spawn a regular enemy if a boss fight was started during the death window
      if (!BossManager.isBossActive()) {
        CombatEngine.spawnEnemy();
      }
    }, COMBAT_V2.playerDeathRespawnDelay);
  },

  _onMemberDeath(instanceId) {
    if (!encounter) return;
    const member = encounter.memberById.get(instanceId);
    if (!member || !member.alive) return;

    // 1. Mark dead, stop this member's timers
    member.alive = false;
    CombatEngine._cancelSummonCast(member, 'death');
    CombatEngine._unregisterMemberTimers(member);

    // 2. Grant per-member rewards (gold, XP, kill counts) scaled by encounter rewardMult
    if (!member.isAdd || SUMMONED_ADD_REWARD_MULT > 0) {
      const rewardScale = member.isAdd ? SUMMONED_ADD_REWARD_MULT : 1;
      Progression.grantKillRewards(member, encounter.rewardMult * rewardScale);
    }

    // 3. Emit kill event with full encounter context
    emit(EVENTS.COMBAT_ENEMY_KILLED, {
      enemyId: member.enemyId,
      name: member.name,
      lootTable: member.lootTable,
      isBoss: member.isBoss,
      isAdd: member.isAdd || false,
      encounterId: encounter.id,
      instanceId: member.instanceId,
      slot: member.slot,
      lootBonus: member.isAdd ? { dropChanceMult: 0, rarityBoost: 0 } : encounter.lootBonus,
    });

    // 4. Split on death — spawn child enemies after a 1s pause (treated as adds, no rewards)
    if (member.splitOnDeath && !member.isAdd) {
      const splitKey = `enc:${encounter.id}:split:${member.instanceId}`;
      const parentId = member.instanceId;
      const { enemyId, count } = member.splitOnDeath;
      encounter.pendingSplits += 1;
      encounter.activeTimerIds.add(splitKey);
      TimeEngine.scheduleOnce(splitKey, () => {
        if (!encounter) return;
        encounter.activeTimerIds.delete(splitKey);
        encounter.pendingSplits -= 1;
        for (let i = 0; i < count; i++) {
          if (CombatEngine._getFreeEncounterSlot() == null) break;
          const scaledChild = CombatEngine._buildScaledEnemyForCurrentZone(enemyId);
          if (!scaledChild) break;
          CombatEngine._addEncounterMember(scaledChild, {
            isAdd: true,
            summonerId: parentId,
          });
        }
      }, 1000);
    }

    // 5. Boss killed → immediate encounter end
    if (member.instanceId === encounter.bossMemberId) {
      CombatEngine._onEncounterEnd('boss_killed');
      return;
    }

    // 6. Retarget if dead member was current target
    const hasPendingSplits = encounter.pendingSplits > 0;
    if (encounter.targetId === instanceId) {
      const living = CombatEngine.getLivingMembers();
      if (living.length === 0 && !hasPendingSplits) {
        CombatEngine._onEncounterEnd('cleared');
        return;
      }
      if (living.length > 0) {
        // Lowest-slot living member becomes new target
        living.sort((a, b) => a.slot - b.slot);
        const next = living[0];
        encounter.targetId = next.instanceId;
        emit(EVENTS.COMBAT_TARGET_CHANGED, {
          encounterId: encounter.id,
          instanceId: next.instanceId,
          slot: next.slot,
          enemyId: next.enemyId,
        });
      }
    } else {
      // Non-target died — check if encounter is fully cleared
      if (CombatEngine.getLivingMembers().length === 0 && !hasPendingSplits) {
        CombatEngine._onEncounterEnd('cleared');
      }
    }
  },

  _onEncounterEnd(reason) {
    if (!encounter) return;
    const enc = encounter;

    // 1. Clear all remaining encounter timers + any active Rapid Strikes
    CombatEngine._clearEncounterTimers();
    CombatEngine.cancelRapidStrikes();
    CombatEngine._resetCorruption('encounter_end');

    // 2. Despawn remaining alive members (boss adds) — no rewards
    for (const m of enc.members) {
      if (m.alive) {
        m.alive = false;
        emit(EVENTS.COMBAT_ENEMY_KILLED, {
          enemyId: m.enemyId, name: m.name,
          lootTable: m.lootTable, isBoss: m.isBoss,
          encounterId: enc.id, instanceId: m.instanceId,
          slot: m.slot, despawned: true,
        });
      }
    }

    // 3. Null state before emitting (prevent stale reads)
    encounter = null;

    // 4. Emit encounter ended
    emit(EVENTS.COMBAT_ENCOUNTER_ENDED, {
      encounterId: enc.id,
      type: enc.type,
      reason,
    });

    // 5. Reason-specific scheduling
    if (reason === 'cleared') {
      const state = Store.getState();
      Store.incrementZoneClearKills(state.currentArea, state.currentZone);
      TimeEngine.scheduleOnce('combat:spawnDelay', () => {
        CombatEngine.spawnEnemy();
      }, COMBAT_V2.spawnDelay);
    } else if (reason === 'boss_killed') {
      TimeEngine.scheduleOnce('combat:bossDefeatedDelay', () => {
        BossManager.onBossDefeated();
      }, 500);
    }
    // 'zone_change', 'player_death': no scheduling (Phase 7 wires these)
  },
};

export default CombatEngine;
