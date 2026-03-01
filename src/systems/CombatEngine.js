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

// ── Rapid Strikes timer tracking ──
let _rapidStrikeTimerIds = new Set();
let _interruptSpeedBuffEndAt = 0;
let _cleanseImmunityEndAt = 0;

// ── Encounter runtime ──
let encounter = null;
let _idCounter = 0;
function _generateId(prefix) {
  return `${prefix}_${++_idCounter}`;
}

const SUMMONED_ADD_REWARD_MULT = COMBAT_V2.summonedAddRewardMult ?? 0;
const ARMOR_BREAK_DURATION_MS = ABILITIES.armorBreak.durationMs;
const SMASH_VULNERABILITY_BONUS = 0.15;
const SMASH_VULNERABILITY_DURATION_MS = 10000;
const BULWARK_REFLECT_BASE_ATTACK_RATIO = 0.5;
const RAPID_STRIKES_DOT_TICKS = 3;
const RAPID_STRIKES_DOT_INTERVAL_MS = 1000;
const RAPID_STRIKES_DOT_SCALAR = 0.15;
const INTERRUPT_BASE_STUN_MS = 1000;
const INTERRUPT_UPGRADED_STUN_MS = 2000;
const INTERRUPT_SPEED_BUFF_MULT = 1.30;
const INTERRUPT_SPEED_BUFF_MS = 3000;
const CLEANSE_IMMUNITY_MS = 3000;
const CLEANSE_PURGE_SCALAR = 0.4;
const CORRUPTION_CFG = {
  maxStacks: COMBAT_V2.corruption?.maxStacks ?? 8,
  perStackRegenReduction: COMBAT_V2.corruption?.perStackRegenReduction ?? 0.1,
  perStackAtkReduction: COMBAT_V2.corruption?.perStackAtkReduction ?? 0.06,
  dotPerStack: COMBAT_V2.corruption?.dotPerStack ?? 2,
  decayMs: COMBAT_V2.corruption?.decayMs ?? 4000,
  tickMs: COMBAT_V2.corruption?.tickMs ?? 1000,
};
const CHARGE_ATTACK_DEFAULT_DAMAGE_MULT = 4.0;
const CHARGE_ATTACK_DEFAULT_CAST_MS = 2500;
const CHARGE_ATTACK_DEFAULT_COOLDOWN_MS = 15000;
const SLIMEFANG_DEMO_END_DELAY_MS = 10200;

const AREA1_SLIME_BASE_VARIANTS = [
  { name: 'Friendly Slime', defaultKey: 'slime001_default' },
  { name: 'Frowny Slime', defaultKey: 'slime_frowny_default' },
  { name: 'Silly Slime', defaultKey: 'slime_silly_default' },
  { name: 'Scared Slime', defaultKey: 'slime_scared_default' },
  { name: 'Worried Slime', defaultKey: 'slime_worried_default' },
];

function pickOne(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

const CombatEngine = {
  init() {
    // Initialize BossManager
    BossManager.init();

    scope = createScope();

    // Register auto-attack ticker (enabled by default — it's an idle game)
    TimeEngine.register(
      'combat:autoAttack',
      () => CombatEngine.playerAttack(),
      CombatEngine._getCurrentAutoAttackInterval(),
      true,
    );

    // Re-register auto-attack when speed upgrade purchased
    scope.on(EVENTS.UPG_PURCHASED, (data) => {
      if (data.upgradeId === 'auto_attack_speed') {
        TimeEngine.register(
          'combat:autoAttack',
          () => CombatEngine.playerAttack(),
          CombatEngine._getCurrentAutoAttackInterval(),
          true,
        );
      }
    });

    // Re-register auto-attack when equipment changes (atkSpeed from gear may change)
    scope.on(EVENTS.INV_ITEM_EQUIPPED, () => {
      TimeEngine.register(
        'combat:autoAttack',
        () => CombatEngine.playerAttack(),
        CombatEngine._getCurrentAutoAttackInterval(),
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
          CombatEngine._getCurrentAutoAttackInterval(),
          true,
        );
      }
    });

    // Stance switch: pause auto-attacks + cancel Rapid Strikes if leaving Tempest
    scope.on(EVENTS.STANCE_CHANGED, ({ stanceId, previousStance }) => {
      // 1. Cancel Rapid Strikes if leaving Tempest
      if (previousStance === 'tempest') {
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
          CombatEngine._getCurrentAutoAttackInterval(),
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

  _getCurrentAutoAttackInterval() {
    const base = getPlayerAutoAttackInterval();
    if (Date.now() >= _interruptSpeedBuffEndAt) return base;
    return Math.max(200, Math.floor(base / INTERRUPT_SPEED_BUFF_MULT));
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
    TimeEngine.unregister('combat:interruptSpeedBuffEnd');
    TimeEngine.unregister('combat:playerRegen');
    TimeEngine.unregister('combat:playerRespawn');
    _interruptSpeedBuffEndAt = 0;
    _cleanseImmunityEndAt = 0;
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
    const effectiveAtkSpeed = Math.max(0.01, (enemyData.attackSpeed ?? 1.0) * (opts.attackSpeedMult ?? 1.0));
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
    const chargeAttack = (
      enemyData.chargeAttack
      && typeof enemyData.chargeAttack === 'object'
    )
      ? {
          damageMult: enemyData.chargeAttack.damageMult ?? CHARGE_ATTACK_DEFAULT_DAMAGE_MULT,
          castTimeMs: enemyData.chargeAttack.castTimeMs ?? CHARGE_ATTACK_DEFAULT_CAST_MS,
          cooldownMs: enemyData.chargeAttack.cooldownMs ?? CHARGE_ATTACK_DEFAULT_COOLDOWN_MS,
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
      _baseAttack: enemyData.attack,
      _baseAttackSpeed: effectiveAtkSpeed,
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
      chargeAttack,
      noAttack: !!enemyData.noAttack,
      sprites: enemyData.sprites ?? null,
      spriteSize: enemyData.spriteSize ?? null,
      spriteOffsetY: enemyData.spriteOffsetY ?? 0,
      nameplateOffsetY: enemyData.nameplateOffsetY ?? 0,
      shadowOffsetY: enemyData.shadowOffsetY ?? 0,
      lungeDistance: enemyData.lungeDistance ?? 20,
      attackSpriteScale: enemyData.attackSpriteScale ?? 1,
      attackSpriteOffsetX: enemyData.attackSpriteOffsetX ?? 0,
      attackSpriteOffsetY: enemyData.attackSpriteOffsetY ?? null,
      reactionSpriteScale: enemyData.reactionSpriteScale ?? 1,
      spriteTint: enemyData.spriteTint ?? null,
      spriteSpreadBonus: enemyData.spriteSpreadBonus ?? 0,
      chargeArmor: enemyData.chargeArmor ?? 0,
      splitOnDeath: enemyData.splitOnDeath ?? null,
      respawnOnDeath: enemyData.respawnOnDeath ?? null,
      _armorShredPercent: 0,
      _armorBreakTimerId: null,
      _smashVulnerabilityMult: 0,
      _smashVulnerabilityTimerId: null,
      _enraged: false,
      _enrageStage: 0,
      _enrageTimerId: null,
      _summonCasting: false,
      _summonCastTimerId: null,
      _chargeCasting: false,
      _chargeCastTimerId: null,
      _interruptStunTimerId: null,
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
      chargeAttack: member.chargeAttack,
      attackSpeed: member.attackSpeed,
      defense: member.defense ?? 0,
      baseEnemyId: member.baseEnemyId ?? null,
      isAdd: member.isAdd || false,
      summonerId: member.summonerId ?? null,
      noAttack: member.noAttack ?? false,
      sprites: member.sprites ?? null,
      spriteSize: member.spriteSize ?? null,
      spriteOffsetY: member.spriteOffsetY ?? 0,
      nameplateOffsetY: member.nameplateOffsetY ?? 0,
      shadowOffsetY: member.shadowOffsetY ?? 0,
      lungeDistance: member.lungeDistance ?? 20,
      attackSpriteScale: member.attackSpriteScale ?? 1,
      attackSpriteOffsetX: member.attackSpriteOffsetX ?? 0,
      attackSpriteOffsetY: member.attackSpriteOffsetY ?? null,
      reactionSpriteScale: member.reactionSpriteScale ?? 1,
      spriteTint: member.spriteTint ?? null,
      spriteSpreadBonus: member.spriteSpreadBonus ?? 0,
      chargeArmor: member.chargeArmor ?? 0,
    };
  },

  _getFrontlineMember() {
    if (!encounter) return null;
    let front = null;
    for (const m of encounter.members) {
      if (!m.alive) continue;
      if (!front || m.slot < front.slot) front = m;
    }
    return front;
  },

  _syncFrontlineTarget(emitChange = true) {
    if (!encounter) return null;
    const front = CombatEngine._getFrontlineMember();
    if (!front) {
      encounter.targetId = null;
      return null;
    }
    if (encounter.targetId !== front.instanceId) {
      encounter.targetId = front.instanceId;
      if (emitChange) {
        emit(EVENTS.COMBAT_TARGET_CHANGED, {
          encounterId: encounter.id,
          instanceId: front.instanceId,
          slot: front.slot,
          enemyId: front.enemyId,
        });
      }
    }
    return front;
  },

  _getFreeEncounterSlot(preferredSlot = null, requirePreferred = false) {
    if (!encounter) return null;
    const occupied = new Set(encounter.members.filter(m => m.alive).map(m => m.slot));
    if (
      Number.isInteger(preferredSlot)
      && preferredSlot >= 0
      && preferredSlot < COMBAT_V2.maxEncounterSize
    ) {
      if (!occupied.has(preferredSlot)) return preferredSlot;
      if (requirePreferred) return null;
    }
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
    enc.targetId = null;
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
    CombatEngine._syncFrontlineTarget(true);
  },

  /** Register attack + DoT timers for a single encounter member.
   *  staggerIndex offsets the first attack so grouped enemies don't all swing at once. */
  _registerMemberTimers(member, staggerIndex = 0) {
    if (!encounter) return;
    if (!member.noAttack) {
      const speed = member.attackSpeed;
      const interval = Math.max(400, Math.floor(COMBAT_V2.baseAttackIntervalMs / speed));
      const atkKey = `enc:${encounter.id}:atk:${member.instanceId}`;
      // Stagger: each subsequent enemy delays its first attack by a fraction of the interval
      const staggerOffset = staggerIndex > 0 ? -Math.floor(interval * staggerIndex / encounter.members.length) : 0;
      TimeEngine.register(atkKey, () => CombatEngine.enemyAttack(member.instanceId), interval, true, staggerOffset);
      encounter.activeTimerIds.add(atkKey);
    }

    if (member.dot) {
      const dotKey = `enc:${encounter.id}:dot:${member.instanceId}`;
      let dotTickCount = 0;
      TimeEngine.register(dotKey, () => {
        CombatEngine._applyIncomingDamage(member.dot, 'dot', member);
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

    if (member.chargeAttack) {
      const chargeInterval = member.chargeAttack.cooldownMs || CHARGE_ATTACK_DEFAULT_COOLDOWN_MS;
      const chargeKey = `enc:${encounter.id}:charge:${member.instanceId}`;
      TimeEngine.register(chargeKey, () => CombatEngine._tryStartChargeCast(member.instanceId), chargeInterval, true);
      encounter.activeTimerIds.add(chargeKey);
    }
  },

  /** Unregister attack + DoT + regen timers for a single member. */
  _unregisterMemberTimers(member) {
    if (!encounter) return;
    const atkKey = `enc:${encounter.id}:atk:${member.instanceId}`;
    const dotKey = `enc:${encounter.id}:dot:${member.instanceId}`;
    const regenKey = `enc:${encounter.id}:regen:${member.instanceId}`;
    const summonKey = `enc:${encounter.id}:summon:${member.instanceId}`;
    const chargeKey = `enc:${encounter.id}:charge:${member.instanceId}`;
    TimeEngine.unregister(atkKey);
    TimeEngine.unregister(dotKey);
    TimeEngine.unregister(regenKey);
    TimeEngine.unregister(summonKey);
    TimeEngine.unregister(chargeKey);
    encounter.activeTimerIds.delete(atkKey);
    encounter.activeTimerIds.delete(dotKey);
    encounter.activeTimerIds.delete(regenKey);
    encounter.activeTimerIds.delete(summonKey);
    encounter.activeTimerIds.delete(chargeKey);

    if (member._summonCastTimerId) {
      TimeEngine.unregister(member._summonCastTimerId);
      encounter.activeTimerIds.delete(member._summonCastTimerId);
      member._summonCastTimerId = null;
      member._summonCasting = false;
    }

    if (member._chargeCastTimerId) {
      TimeEngine.unregister(member._chargeCastTimerId);
      encounter.activeTimerIds.delete(member._chargeCastTimerId);
      member._chargeCastTimerId = null;
      member._chargeCasting = false;
    }

    if (member._armorBreakTimerId) {
      TimeEngine.unregister(member._armorBreakTimerId);
      encounter.activeTimerIds.delete(member._armorBreakTimerId);
      member._armorBreakTimerId = null;
    }
    member._armorShredPercent = 0;

    if (member._smashVulnerabilityTimerId) {
      TimeEngine.unregister(member._smashVulnerabilityTimerId);
      encounter.activeTimerIds.delete(member._smashVulnerabilityTimerId);
      member._smashVulnerabilityTimerId = null;
    }
    member._smashVulnerabilityMult = 0;

    if (member._interruptStunTimerId) {
      TimeEngine.unregister(member._interruptStunTimerId);
      encounter.activeTimerIds.delete(member._interruptStunTimerId);
      member._interruptStunTimerId = null;
    }

    if (member._enrageTimerId) {
      TimeEngine.unregister(member._enrageTimerId);
      encounter.activeTimerIds.delete(member._enrageTimerId);
      member._enrageTimerId = null;
    }
    member._enraged = false;
    member.attack = member._baseAttack;
    member.attackSpeed = member._baseAttackSpeed;
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

  _buildScaledEnemyForCurrentZone(enemyId, opts = {}) {
    const skipVariants = !!opts.skipVariants;
    const state = Store.getState();
    let enemyTemplate = getEnemyById(enemyId);
    if (!enemyTemplate) return null;
    if (!skipVariants) {
      enemyTemplate = CombatEngine._resolveArea1SlimeVariant(enemyTemplate, state);
    }
    const zone = state.currentZone;
    const areaData = getArea(state.currentArea);
    const globalZone = areaData ? areaData.zoneStart + zone - 1 : zone;
    const atkScale = getZoneScaling(zone, 'atk');
    const eb = (stat) => getEnemyBias(enemyTemplate.id, stat);
    const hpMult = enemyTemplate._variantHpMult ?? 1;
    const rewardMult = enemyTemplate._variantRewardMult ?? 1;
    return {
      ...enemyTemplate,
      hp: D(enemyTemplate.hp).times(getZoneScaling(zone, 'hp') * getZoneBias(globalZone, 'hp') * eb('hp') * hpMult).floor().toString(),
      attack: Math.floor(enemyTemplate.attack * atkScale * getZoneBias(globalZone, 'atk') * eb('atk')),
      defense: Math.floor((enemyTemplate.defense || 0) * getZoneBias(globalZone, 'def') * eb('def')),
      attackSpeed: Math.max(0.01, (enemyTemplate.attackSpeed ?? 1) * getZoneBias(globalZone, 'speed') * eb('speed')),
      goldDrop: D(enemyTemplate.goldDrop).times(getZoneScaling(zone, 'gold') * getZoneBias(globalZone, 'gold') * eb('gold') * rewardMult).floor().toString(),
      xpDrop: D(enemyTemplate.xpDrop).times(getZoneScaling(zone, 'xp') * getZoneBias(globalZone, 'xp') * eb('xp') * rewardMult).floor().toString(),
      regen: enemyTemplate.regen ? Math.floor(enemyTemplate.regen * atkScale * getZoneBias(globalZone, 'regen') * eb('regen')) : 0,
      thorns: enemyTemplate.thorns ? Math.floor(enemyTemplate.thorns * atkScale * getZoneBias(globalZone, 'atk') * eb('atk')) : 0,
    };
  },

  _buildArea1Zone4BroodSlime(mult = 1.5, useZoneVariants = true) {
    const base = CombatEngine._buildScaledEnemyForCurrentZone('a1_slime', { skipVariants: true });
    if (!base) return null;
    const variant = useZoneVariants
      ? (CombatEngine._buildScaledEnemyForCurrentZone('a1_slime', { skipVariants: false }) || base)
      : base;
    const variantDefault = variant?.sprites?.default || base?.sprites?.default || 'slime001_default';
    const variantName = variant?.name || 'Brood Slime';
    return {
      ...base,
      name: variantName,
      hp: D(base.hp).times(mult).floor().toString(),
      attack: Math.max(1, Math.floor((base.attack ?? 0) * mult)),
      defense: Math.max(0, Math.floor((base.defense ?? 0) * mult)),
      regen: Math.max(0, Math.floor((base.regen ?? 0) * mult)),
      noAttack: false,
      sprites: {
        ...base.sprites,
        default: variantDefault,
      },
    };
  },

  _resolveArea1SlimeVariant(enemyTemplate, state) {
    if (!enemyTemplate || enemyTemplate.id !== 'a1_slime' || state.currentArea !== 1) {
      return enemyTemplate;
    }

    const zone = state.currentZone;
    if (zone <= 1) {
      return {
        ...enemyTemplate,
        name: 'Friendly Slime',
        noAttack: false,
        _variantHpMult: 1,
        _variantRewardMult: 1,
        sprites: {
          ...enemyTemplate.sprites,
          default: 'slime001_default',
        },
      };
    }

    const variants = [...AREA1_SLIME_BASE_VARIANTS];
    if (zone >= 4 && zone <= 5) {
      variants.push({
        name: 'George',
        defaultKey: 'slime_george_default',
        noAttack: true,
        hpMult: 2,
        rewardMult: 2,
      });
    }

    const variant = pickOne(variants) || AREA1_SLIME_BASE_VARIANTS[0];
    return {
      ...enemyTemplate,
      name: variant.name,
      noAttack: !!variant.noAttack,
      _variantHpMult: variant.hpMult ?? 1,
      _variantRewardMult: variant.rewardMult ?? 1,
      sprites: {
        ...enemyTemplate.sprites,
        default: variant.defaultKey,
      },
    };
  },

  _addEncounterMember(enemyData, opts = {}) {
    if (!encounter) return null;
    const slot = CombatEngine._getFreeEncounterSlot(
      opts.preferredSlot ?? null,
      !!opts.requirePreferredSlot,
    );
    if (slot == null) return null;

    const member = CombatEngine._buildMember(enemyData, slot, {
      isAdd: opts.isAdd || false,
      summonerId: opts.summonerId ?? null,
      attackSpeedMult: encounter.attackSpeedMult,
    });

    encounter.members.push(member);
    encounter.memberById.set(member.instanceId, member);
    CombatEngine._registerMemberTimers(member, encounter.members.length - 1);
    CombatEngine._syncFrontlineTarget(true);

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
      castKind: 'summon',
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
      kind: 'summon',
    });
    return true;
  },

  _tryStartChargeCast(instanceId) {
    if (!encounter) return;
    const member = encounter.memberById.get(instanceId);
    if (!member?.alive || !member.chargeAttack) return;
    if (member._chargeCasting || member._summonCasting) return;
    if (member._interruptStunTimerId) return;

    member._chargeCasting = true;
    const castTimeMs = Math.max(100, member.chargeAttack.castTimeMs || CHARGE_ATTACK_DEFAULT_CAST_MS);
    const castKey = `enc:${encounter.id}:chargeCast:${member.instanceId}`;
    member._chargeCastTimerId = castKey;
    TimeEngine.scheduleOnce(castKey, () => CombatEngine._resolveChargeCast(member.instanceId), castTimeMs);
    encounter.activeTimerIds.add(castKey);

    emit(EVENTS.COMBAT_ENEMY_CASTING, {
      encounterId: encounter.id,
      instanceId: member.instanceId,
      slot: member.slot,
      enemyId: member.enemyId,
      castTime: castTimeMs,
      castKind: 'charge',
    });
  },

  _resolveChargeCast(instanceId) {
    if (!encounter) return;
    const member = encounter.memberById.get(instanceId);
    if (!member) return;
    const encounterId = encounter.id;
    const slot = member.slot;
    const enemyId = member.enemyId;

    if (member._chargeCastTimerId) {
      encounter.activeTimerIds.delete(member._chargeCastTimerId);
      member._chargeCastTimerId = null;
    }
    if (!member.alive || !member.chargeAttack) {
      member._chargeCasting = false;
      return;
    }

    member._chargeCasting = false;
    const rawDamage = Math.max(1, Math.floor(member.attack * Math.max(1, member.chargeAttack.damageMult || CHARGE_ATTACK_DEFAULT_DAMAGE_MULT)));
    CombatEngine._applyIncomingDamage(rawDamage, 'attack', member);
    emit(EVENTS.COMBAT_ENEMY_CHARGE_RESOLVED, {
      encounterId,
      instanceId: member.instanceId,
      slot,
      enemyId,
      damage: rawDamage,
    });
  },

  _cancelChargeCast(member, source = 'interrupt') {
    if (!encounter || !member?._chargeCasting || !member._chargeCastTimerId) return false;
    TimeEngine.unregister(member._chargeCastTimerId);
    encounter.activeTimerIds.delete(member._chargeCastTimerId);
    member._chargeCastTimerId = null;
    member._chargeCasting = false;
    emit(EVENTS.COMBAT_INTERRUPTED, {
      encounterId: encounter.id,
      instanceId: member.instanceId,
      slot: member.slot,
      enemyId: member.enemyId,
      source,
      kind: 'charge',
    });
    return true;
  },

  interruptTarget() {
    const target = CombatEngine.getTargetMember();
    if (!target) return false;

    const interrupted = CombatEngine._cancelChargeCast(target, 'player')
      || CombatEngine._cancelSummonCast(target, 'player');
    if (!interrupted) return false;

    const stunDuration = UpgradeManager.hasUpgrade('interrupt_t1')
      ? INTERRUPT_UPGRADED_STUN_MS
      : INTERRUPT_BASE_STUN_MS;
    CombatEngine._applyInterruptStun(target, stunDuration);

    if (UpgradeManager.hasUpgrade('interrupt_t2')) {
      CombatEngine._applyInterruptSpeedBuff();
    }

    return true;
  },

  _applyInterruptStun(target, durationMs) {
    if (!encounter || !target?.alive) return;

    const attackKey = `enc:${encounter.id}:atk:${target.instanceId}`;
    TimeEngine.unregister(attackKey);
    encounter.activeTimerIds.delete(attackKey);

    if (target._interruptStunTimerId) {
      TimeEngine.unregister(target._interruptStunTimerId);
      encounter.activeTimerIds.delete(target._interruptStunTimerId);
    }

    const recoverKey = `enc:${encounter.id}:interruptRecover:${target.instanceId}`;
    target._interruptStunTimerId = recoverKey;
    TimeEngine.scheduleOnce(recoverKey, () => {
      if (!encounter) return;
      const member = encounter.memberById.get(target.instanceId);
      encounter.activeTimerIds.delete(recoverKey);
      if (!member?.alive) return;
      member._interruptStunTimerId = null;
      if (member.noAttack) return;

      const interval = Math.max(400, Math.floor(COMBAT_V2.baseAttackIntervalMs / member.attackSpeed));
      TimeEngine.register(attackKey, () => CombatEngine.enemyAttack(member.instanceId), interval, true);
      encounter.activeTimerIds.add(attackKey);
    }, durationMs);
    encounter.activeTimerIds.add(recoverKey);
  },

  _applyInterruptSpeedBuff() {
    _interruptSpeedBuffEndAt = Date.now() + INTERRUPT_SPEED_BUFF_MS;
    TimeEngine.unregister('combat:interruptSpeedBuffEnd');
    TimeEngine.scheduleOnce('combat:interruptSpeedBuffEnd', () => {
      _interruptSpeedBuffEndAt = 0;
      if (_playerDead) return;
      TimeEngine.register(
        'combat:autoAttack',
        () => CombatEngine.playerAttack(),
        CombatEngine._getCurrentAutoAttackInterval(),
        true,
      );
    }, INTERRUPT_SPEED_BUFF_MS);

    if (!_playerDead) {
      TimeEngine.register(
        'combat:autoAttack',
        () => CombatEngine.playerAttack(),
        CombatEngine._getCurrentAutoAttackInterval(),
        true,
      );
    }
  },

  armorBreakTarget(durationMs = ARMOR_BREAK_DURATION_MS) {
    if (!encounter) return false;
    const target = CombatEngine.getTargetMember();
    if (!target?.alive || !target.armor) return false;

    const shredBonus = UpgradeManager.getFlatBonus('armorBreakShredBonus');
    target._armorShredPercent = Math.min(1, ABILITIES.armorBreak.defReductionPercent + shredBonus);
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
      if (!member) return;
      member._armorShredPercent = 0;
      member._armorBreakTimerId = null;
      encounter.activeTimerIds.delete(restoreKey);
      if (!member.alive) return;
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
    const removedStacks = encounter.corruptionStacks ?? 0;
    if (removedStacks <= 0) return false;
    CombatEngine._setCorruptionStacks(0, 'cleanse');

    if (UpgradeManager.hasUpgrade('cleanse_t1')) {
      _cleanseImmunityEndAt = Date.now() + CLEANSE_IMMUNITY_MS;
    }

    if (UpgradeManager.hasUpgrade('cleanse_t2')) {
      const target = CombatEngine.getTargetMember();
      if (target?.alive) {
        const purgeDamage = Math.max(1, Math.floor(getBaseDamage() * CLEANSE_PURGE_SCALAR * removedStacks));
        CombatEngine._dealDirectDamage(target, purgeDamage, {
          skipAttackAnim: true,
          source: 'cleanse_purge',
        });
      }
    }
    return true;
  },

  _resetCorruption(reason = 'reset') {
    _cleanseImmunityEndAt = 0;
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
    // Build members array using shared zone scaler (includes runtime variants).
    const members = encTemplate.members.map((memberId, slotIndex) => {
      const scaledData = CombatEngine._buildScaledEnemyForCurrentZone(memberId);
      if (!scaledData) return null;
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
      attackSpeed: Math.max(0.01, (bossTemplate.attackSpeed ?? 1) * bb('speed')),
      goldDrop:    D(bossTemplate.goldDrop).times(bb('gold')).floor().toString(),
      xpDrop:      D(bossTemplate.xpDrop).times(bb('xp')).floor().toString(),
      regen:       bossTemplate.regen ? Math.floor(bossTemplate.regen * bb('regen')) : 0,
    };

    // Special encounter: Area 1 Zone 4 (Blight Mother) is a 4-slime brood fight.
    // Replacements spawn 15s after a slime dies; no charge/cast system involved.
    if (bossTemplate.id === 'boss_a1z4_blight_mother') {
      const broodBase = CombatEngine._buildArea1Zone4BroodSlime(1.5, true);
      if (!broodBase) return;
      const respawnCfg = {
        enemyId: 'a1_slime',
        delayMs: 15000,
        hpMult: 1.5,
        attackMult: 1.5,
        defenseMult: 1.5,
        regenMult: 1.5,
        skipVariants: true,
        useZoneVariants: true,
      };

      const bossSlime = {
        ...scaledBoss,
        ...broodBase,
        id: scaledBoss.id,
        name: scaledBoss.name,
        title: scaledBoss.title ?? null,
        description: scaledBoss.description ?? null,
        hp: D(scaledBoss.hp).times(3).floor().toString(),
        attack: Math.max(1, Math.floor((scaledBoss.attack ?? broodBase.attack ?? 1) * 0.8)),
        defense: Math.max(12, Math.floor((scaledBoss.defense ?? 0) * 2 + 12)),
        spriteSize: scaledBoss.spriteSize ?? broodBase.spriteSize,
        spriteOffsetY: scaledBoss.spriteOffsetY ?? broodBase.spriteOffsetY,
        goldDrop: scaledBoss.goldDrop,
        xpDrop: scaledBoss.xpDrop,
        lootTable: scaledBoss.lootTable,
      };
      const bossMember = CombatEngine._buildMember(bossSlime, 3, { isBoss: true });

      const members = [];
      for (let i = 0; i < 3; i++) {
        const frontSlime = CombatEngine._buildArea1Zone4BroodSlime(1.5, true) || broodBase;
        const addMember = CombatEngine._buildMember(
          { ...frontSlime, respawnOnDeath: respawnCfg },
          i,
          { isAdd: true, summonerId: bossMember.instanceId },
        );
        members.push(addMember);
      }
      members.push(bossMember);

      const enc = CombatEngine._createEncounterRuntime(members, null, 'boss');
      enc.bossMemberId = bossMember.instanceId;
      CombatEngine._startEncounter(enc);
      return;
    }

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
      if (UpgradeManager.hasUpgrade('smash_t2')) {
        CombatEngine._applySmashVulnerability(target);
      }
      CombatEngine._checkEnrage(target);
    }

    // Thorns: reflect damage to player (triggers even if target died)
    CombatEngine._applyThorns(target);
  },

  _applySmashVulnerability(target) {
    if (!encounter || !target?.alive) return;
    target._smashVulnerabilityMult = SMASH_VULNERABILITY_BONUS;

    if (target._smashVulnerabilityTimerId) {
      TimeEngine.unregister(target._smashVulnerabilityTimerId);
      encounter.activeTimerIds.delete(target._smashVulnerabilityTimerId);
    }

    const restoreKey = `enc:${encounter.id}:smashVulnRestore:${target.instanceId}`;
    target._smashVulnerabilityTimerId = restoreKey;
    TimeEngine.scheduleOnce(restoreKey, () => {
      if (!encounter) return;
      const member = encounter.memberById.get(target.instanceId);
      encounter.activeTimerIds.delete(restoreKey);
      if (!member) return;
      member._smashVulnerabilityMult = 0;
      member._smashVulnerabilityTimerId = null;
    }, SMASH_VULNERABILITY_DURATION_MS);
    encounter.activeTimerIds.add(restoreKey);
  },

  playerAttack(isClick = false, source = null) {
    const target = CombatEngine.getTargetMember();
    if (!target) return;
    const attackSource = source || (isClick ? 'click' : 'auto');
    if (CombatEngine._playerAttackMissed(target, attackSource)) return;

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
      source: attackSource,
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
    if (!target?.armor) return rawDamage;
    const reduction = target.armor.reduction ?? 0;
    const shred = target._armorShredPercent ?? 0;
    const effectiveReduction = Math.max(0, reduction * (1 - shred));
    if (effectiveReduction <= 0) return rawDamage;
    const multiplier = Math.max(0, 1 - effectiveReduction);
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

    const stance = STANCES[state.currentStance] || STANCES.ruin;
    const stanceMult = isClick ? 1 : stance.damageMult;
    const vulnerabilityMult = 1 + (target?._smashVulnerabilityMult || 0);

    const damage = D(rawDamage).times(clickDmgMult).times(prestigeMult).times(critMult)
      .times(TerritoryManager.getBuffMultiplier('baseDamage')).times(stanceMult).times(vulnerabilityMult).floor();
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
    return CombatEngine._syncFrontlineTarget(false);
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
    return !!CombatEngine.getTargetMember();
  },

  /** Set the current target to a living member. Emits COMBAT_TARGET_CHANGED. */
  setTarget(instanceId) {
    if (!encounter) return;
    const member = encounter.memberById.get(instanceId);
    if (!member || !member.alive) return;
    const front = CombatEngine._syncFrontlineTarget(false);
    if (!front || front.instanceId !== instanceId) return;
    CombatEngine._syncFrontlineTarget(true);
  },

  // ── Enrage check ──

  _refreshMemberAttackTimer(member) {
    if (!encounter || !member || member.noAttack || !member.alive) return;
    const atkKey = `enc:${encounter.id}:atk:${member.instanceId}`;
    const interval = Math.max(400, Math.floor(COMBAT_V2.baseAttackIntervalMs / member.attackSpeed));
    TimeEngine.register(atkKey, () => CombatEngine.enemyAttack(member.instanceId), interval, true);
    encounter.activeTimerIds.add(atkKey);
  },

  _endTimedEnrage(instanceId, timerId) {
    if (!encounter) return;
    const member = encounter.memberById.get(instanceId);
    if (!member) {
      encounter.activeTimerIds.delete(timerId);
      return;
    }
    encounter.activeTimerIds.delete(timerId);
    if (member._enrageTimerId === timerId) member._enrageTimerId = null;
    if (!member.alive || !member._enraged) return;

    member._enraged = false;
    member.attack = member._baseAttack;
    member.attackSpeed = member._baseAttackSpeed;
    CombatEngine._refreshMemberAttackTimer(member);

    emit(EVENTS.COMBAT_ENEMY_ENRAGE_ENDED, {
      enemyId: member.enemyId,
      name: member.name,
      encounterId: encounter?.id ?? null,
      instanceId: member.instanceId,
      slot: member.slot,
      enrageStage: member._enrageStage,
    });

    // If HP is already below a later threshold, allow immediate re-trigger.
    CombatEngine._checkEnrage(member);
  },

  /** Enrage trigger(s): initial threshold, plus optional retrigger threshold. */
  _checkEnrage(member) {
    if (!member.enrage || member._enraged) return;
    const ratio = member.hp.div(member.maxHp).toNumber();
    const firstThreshold = Number(member.enrage.threshold ?? 0);
    const retriggerThreshold = Number(member.enrage.retriggerThreshold ?? Number.NaN);

    let shouldTrigger = false;
    if (member._enrageStage === 0 && ratio < firstThreshold) {
      shouldTrigger = true;
    } else if (
      member._enrageStage === 1
      && Number.isFinite(retriggerThreshold)
      && ratio < retriggerThreshold
    ) {
      shouldTrigger = true;
    }
    if (!shouldTrigger) return;

    member._enrageStage += 1;
    member._enraged = true;
    member.attack = Math.floor(member._baseAttack * member.enrage.atkMult);
    member.attackSpeed = member._baseAttackSpeed * member.enrage.speedMult;
    CombatEngine._refreshMemberAttackTimer(member);

    const durationMs = Math.max(0, Number(member.enrage.durationMs ?? 0));
    let timerKey = null;
    if (durationMs > 0 && encounter) {
      if (member._enrageTimerId) {
        TimeEngine.unregister(member._enrageTimerId);
        encounter.activeTimerIds.delete(member._enrageTimerId);
      }
      timerKey = `enc:${encounter.id}:enrage:${member.instanceId}:${member._enrageStage}`;
      member._enrageTimerId = timerKey;
      TimeEngine.scheduleOnce(timerKey, () => CombatEngine._endTimedEnrage(member.instanceId, timerKey), durationMs);
      encounter.activeTimerIds.add(timerKey);
    }

    emit(EVENTS.COMBAT_ENEMY_ENRAGED, {
      enemyId: member.enemyId,
      name: member.name,
      encounterId: encounter?.id ?? null,
      instanceId: member.instanceId,
      slot: member.slot,
      durationMs,
      timerKey,
      enrageStage: member._enrageStage,
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

  _dealDirectDamage(member, amount, opts = {}) {
    if (!encounter || !member?.alive) return false;

    let damage = D(amount).floor();
    if (damage.lte(0)) return false;
    if (opts.applyArmor !== false) {
      damage = CombatEngine._applyTargetArmorReduction(damage, member);
    }

    member.hp = Decimal.max(member.hp.minus(damage), 0);
    emit(EVENTS.COMBAT_ENEMY_DAMAGED, {
      enemyId: member.enemyId,
      amount: damage,
      isCrit: false,
      isClick: false,
      isPowerSmash: false,
      skipAttackAnim: !!opts.skipAttackAnim,
      source: opts.source || 'direct',
      remainingHp: member.hp,
      maxHp: member.maxHp,
      encounterId: encounter.id,
      instanceId: member.instanceId,
      slot: member.slot,
    });

    if (member.hp.lte(0)) {
      CombatEngine._onMemberDeath(member.instanceId);
    } else {
      CombatEngine._checkEnrage(member);
    }
    return true;
  },

  // ── Incoming damage pipeline ──

  /**
   * Unified incoming damage: stance DR → Bulwark absorb → Store.damagePlayer.
   * @param {number} rawDamage - Pre-mitigation damage
   * @param {string} source - 'attack' | 'dot' | 'corruption'
   * @param {?object} sourceMember - attacking member, if applicable
   */
  _applyIncomingDamage(rawDamage, source, sourceMember = null) {
    if ((source === 'dot' || source === 'corruption') && Date.now() < _cleanseImmunityEndAt) {
      return;
    }

    const state = Store.getState();
    const stance = STANCES[state.currentStance] || STANCES.ruin;

    // 1. Stance damage reduction (Fortress)
    let dmg = rawDamage * (1 - stance.damageReduction);

    // 2. Bulwark shield absorb
    if (_shieldHp > 0) {
      if (sourceMember?.alive && UpgradeManager.hasUpgrade('bulwark_t2')) {
        // Reflect uses attacker base attack (not mitigated incoming damage) and ignores enemy armor.
        const reflectDamage = Math.max(
          1,
          Math.floor((sourceMember.attack ?? 0) * BULWARK_REFLECT_BASE_ATTACK_RATIO),
        );
        CombatEngine._dealDirectDamage(sourceMember, reflectDamage, {
          applyArmor: false,
          skipAttackAnim: true,
          source: 'bulwark_reflect',
        });
      }
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
   * Activate Rapid Strikes — N hits at 200ms spacing using auto-attack damage.
   * Each hit targets the current live target; whiffs if no target exists.
   */
  activateRapidStrikes(hitCount = 5) {
    const castId = _generateId('rapid');
    const totalHits = Math.max(1, Math.floor(hitCount));
    let bleedAppliedThisCast = false;
    for (let i = 0; i < totalHits; i++) {
      const timerId = `ability:rapid:${castId}:${i}`;
      _rapidStrikeTimerIds.add(timerId);
      TimeEngine.scheduleOnce(timerId, () => {
        _rapidStrikeTimerIds.delete(timerId);
        // Whiff silently if no living target (spawn-delay gap)
        const target = CombatEngine.getTargetMember();
        if (!target) return;
        CombatEngine.playerAttack(false, 'rapid_strikes');
        if (!bleedAppliedThisCast && UpgradeManager.hasUpgrade('flurry_t2')) {
          CombatEngine._applyRapidStrikesDot(target);
          bleedAppliedThisCast = true;
        }
      }, 200 * (i + 1));
    }
  },

  _applyRapidStrikesDot(target) {
    if (!encounter || !target?.alive) return;
    const dotDamage = Math.max(1, Math.floor(COMBAT_V2.playerDamage(getBaseDamage(), target.defense ?? 0) * RAPID_STRIKES_DOT_SCALAR));
    const castId = _generateId('rapidDot');
    for (let i = 0; i < RAPID_STRIKES_DOT_TICKS; i++) {
      const timerId = `ability:rapidDot:${castId}:${i}`;
      _rapidStrikeTimerIds.add(timerId);
      TimeEngine.scheduleOnce(timerId, () => {
        _rapidStrikeTimerIds.delete(timerId);
        if (!encounter) return;
        const member = encounter.memberById.get(target.instanceId);
        if (!member?.alive) return;
        CombatEngine._dealDirectDamage(member, dotDamage, {
          applyArmor: false,
          skipAttackAnim: true,
          source: 'rapid_strikes_dot',
        });
      }, RAPID_STRIKES_DOT_INTERVAL_MS * (i + 1));
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
    if (!member?.alive || member.noAttack) return;

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
    CombatEngine._applyIncomingDamage(damage, 'attack', member);
    if (member.alive && (member.corruption ?? 0) > 0) {
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
    TimeEngine.unregister('combat:interruptSpeedBuffEnd');
    _interruptSpeedBuffEndAt = 0;
    _cleanseImmunityEndAt = 0;
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
      TimeEngine.register(
        'combat:autoAttack',
        () => CombatEngine.playerAttack(),
        CombatEngine._getCurrentAutoAttackInterval(),
        true,
      );
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
    CombatEngine._cancelChargeCast(member, 'death');
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

    // Optional delayed replacement spawn (used by specific boss encounter scripts).
    if (member.respawnOnDeath && member.instanceId !== encounter.bossMemberId) {
      const cfg = member.respawnOnDeath;
      const preferredSlot = member.slot;
      const respawnKey = `enc:${encounter.id}:respawn:${member.instanceId}:${Date.now()}`;
      encounter.pendingSplits += 1;
      encounter.activeTimerIds.add(respawnKey);
      emit(EVENTS.COMBAT_ENEMY_CASTING, {
        encounterId: encounter.id,
        instanceId: member.instanceId,
        slot: preferredSlot,
        enemyId: member.enemyId,
        castTime: Math.max(100, cfg.delayMs ?? 15000),
        castKind: 'respawn',
        timerKey: respawnKey,
      });
      TimeEngine.scheduleOnce(respawnKey, () => {
        if (!encounter) return;
        encounter.activeTimerIds.delete(respawnKey);
        encounter.pendingSplits = Math.max(0, encounter.pendingSplits - 1);

        const boss = encounter.memberById.get(encounter.bossMemberId);
        if (!boss?.alive) return;
        if (CombatEngine._getFreeEncounterSlot(preferredSlot, true) == null) return;

        const scaled = CombatEngine._buildScaledEnemyForCurrentZone(cfg.enemyId, {
          skipVariants: !!cfg.skipVariants,
        });
        if (!scaled) return;
        const variant = cfg.useZoneVariants
          ? (CombatEngine._buildScaledEnemyForCurrentZone(cfg.enemyId, { skipVariants: false }) || scaled)
          : scaled;

        const respawned = {
          ...scaled,
          name: cfg.name || variant.name || scaled.name,
          hp: D(scaled.hp).times(cfg.hpMult ?? 1).floor().toString(),
          attack: Math.max(1, Math.floor((scaled.attack ?? 0) * (cfg.attackMult ?? 1))),
          defense: Math.max(0, Math.floor((scaled.defense ?? 0) * (cfg.defenseMult ?? 1))),
          regen: Math.max(0, Math.floor((scaled.regen ?? 0) * (cfg.regenMult ?? 1))),
          noAttack: !!cfg.noAttack,
          sprites: {
            ...scaled.sprites,
            default: variant?.sprites?.default || scaled?.sprites?.default,
          },
          respawnOnDeath: cfg,
        };

        CombatEngine._addEncounterMember(respawned, {
          isAdd: true,
          summonerId: encounter.bossMemberId,
          preferredSlot,
          requirePreferredSlot: true,
        });
      }, Math.max(100, cfg.delayMs ?? 15000));
    }

    // 5. Boss killed → immediate encounter end
    if (member.instanceId === encounter.bossMemberId) {
      CombatEngine._onEncounterEnd('boss_killed');
      return;
    }

    // 6. Retarget to current frontline (leftmost living member).
    const hasPendingSplits = encounter.pendingSplits > 0;
    const living = CombatEngine.getLivingMembers();
    if (living.length === 0) {
      if (!hasPendingSplits) {
        CombatEngine._onEncounterEnd('cleared');
      } else {
        encounter.targetId = null;
      }
      return;
    }
    CombatEngine._syncFrontlineTarget(true);
  },

  _onEncounterEnd(reason) {
    if (!encounter) return;
    const enc = encounter;

    // 1. Clear all remaining encounter timers + any active Rapid Strikes
    CombatEngine._clearEncounterTimers();
    CombatEngine.cancelRapidStrikes();
    CombatEngine._resetCorruption('encounter_end');
    TimeEngine.unregister('combat:interruptSpeedBuffEnd');
    _interruptSpeedBuffEndAt = 0;
    if (!_playerDead) {
      TimeEngine.register(
        'combat:autoAttack',
        () => CombatEngine.playerAttack(),
        CombatEngine._getCurrentAutoAttackInterval(),
        true,
      );
    }

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

    // 4. Apply reason-specific state mutations that listeners depend on.
    if (reason === 'cleared') {
      const state = Store.getState();
      Store.incrementZoneClearKills(state.currentArea, state.currentZone);
    }

    // 5. Emit encounter ended
    emit(EVENTS.COMBAT_ENCOUNTER_ENDED, {
      encounterId: enc.id,
      type: enc.type,
      reason,
    });

    // 6. Reason-specific scheduling
    if (reason === 'cleared') {
      TimeEngine.scheduleOnce('combat:spawnDelay', () => {
        CombatEngine.spawnEnemy();
      }, COMBAT_V2.spawnDelay);
    } else if (reason === 'boss_killed') {
      const activeBoss = BossManager.getActiveBoss();
      const bossDefeatedDelayMs = activeBoss?.id === 'boss_a1z5_the_hollow'
        ? SLIMEFANG_DEMO_END_DELAY_MS
        : 500;
      TimeEngine.scheduleOnce('combat:bossDefeatedDelay', () => {
        BossManager.onBossDefeated();
      }, bossDefeatedDelayMs);
    }
    // 'zone_change', 'player_death': no scheduling (Phase 7 wires these)
  },
};

export default CombatEngine;

