// Canonical event names — always import from here, never use ad-hoc strings.

export const EVENTS = {
  // State / Save
  STATE_CHANGED:        'state:changed',
  SAVE_REQUESTED:       'save:requested',
  SAVE_COMPLETED:       'save:completed',
  SAVE_LOADED:          'save:loaded',
  SAVE_CORRUPT:         'save:corrupt',

  // World / Navigation
  WORLD_ZONE_CHANGED:   'world:zoneChanged',
  WORLD_AREA_CHANGED:   'world:areaChanged',

  // Combat — encounter lifecycle
  COMBAT_ENCOUNTER_STARTED: 'combat:encounterStarted',
  COMBAT_ENCOUNTER_ENDED:   'combat:encounterEnded',
  COMBAT_TARGET_CHANGED:    'combat:targetChanged',

  // Combat — per-member events
  COMBAT_ENEMY_DAMAGED: 'combat:enemyDamaged',
  COMBAT_ENEMY_KILLED:  'combat:enemyKilled',
  COMBAT_ENEMY_ATTACKED:'combat:enemyAttacked',
  COMBAT_ENEMY_DODGED:  'combat:enemyDodged',
  COMBAT_PLAYER_DAMAGED:'combat:playerDamaged',
  COMBAT_PLAYER_DIED:   'combat:playerDied',
  COMBAT_PLAYER_MISSED: 'combat:playerMissed',
  COMBAT_DOT_TICK:      'combat:dotTick',
  COMBAT_MEMBER_ADDED:  'combat:memberAdded',
  COMBAT_ENEMY_CASTING: 'combat:enemyCasting',
  COMBAT_ENEMY_CHARGE_RESOLVED: 'combat:enemyChargeResolved',
  COMBAT_INTERRUPTED:   'combat:interrupted',
  CORRUPTION_CHANGED:   'corruption:changed',
  CORRUPTION_CLEANSED:  'corruption:cleansed',

  // Economy / Currencies
  ECON_GOLD_GAINED:     'econ:goldGained',
  ECON_FRAGMENTS_GAINED:'econ:fragmentsGained',
  ECON_MANA_CHANGED:    'econ:manaChanged',

  // Progression
  PROG_XP_GAINED:       'prog:xpGained',
  PROG_LEVEL_UP:        'prog:levelUp',

  // Loot / Inventory
  LOOT_DROPPED:         'loot:dropped',
  INV_ITEM_ADDED:       'inv:itemAdded',
  INV_ITEM_EQUIPPED:    'inv:itemEquipped',
  INV_ITEM_SOLD:        'inv:itemSold',
  INV_ITEM_MERGED:      'inv:itemMerged',
  INV_FULL:             'inv:full',

  // Upgrades / Cheats / Prestige
  UPG_PURCHASED:        'upg:purchased',
  ENHANCE_PURCHASED:    'enhance:purchased',
  CHEAT_UNLOCKED:       'cheat:unlocked',
  CHEAT_TOGGLED:        'cheat:toggled',
  PRESTIGE_AVAILABLE:   'prestige:available',
  PRESTIGE_PERFORMED:   'prestige:performed',

  // Boss
  BOSS_CHALLENGE_READY:       'boss:challengeReady',
  BOSS_SPAWNED:               'boss:spawned',
  BOSS_DEFEATED:              'boss:defeated',
  AREA_BOSS_DEFEATED:         'boss:areaDefeated',

  // Territory
  TERRITORY_CLAIMED:          'territory:claimed',
  TERRITORY_PROGRESS_UPDATED: 'territory:progressUpdated',

  // Stances
  STANCE_CHANGED:       'stance:changed',
  BULWARK_ACTIVATED:    'ability:bulwarkActivated',

  // Enemy Traits
  COMBAT_ENEMY_REGEN:   'combat:enemyRegen',
  COMBAT_ENEMY_ENRAGED: 'combat:enemyEnraged',
  COMBAT_THORNS_DAMAGE: 'combat:thornsDamage',
  COMBAT_ARMOR_BROKEN:  'combat:armorBroken',
  COMBAT_ARMOR_RESTORED:'combat:armorRestored',

  // Consumable / Abilities
  WATERSKIN_USED:       'waterskin:used',
  POWER_SMASH_USED:     'ability:powerSmashUsed',
  RAPID_STRIKES_USED:   'ability:rapidStrikesUsed',

  // Dialogue / UI
  DIALOGUE_QUEUED:      'dialogue:queued',
  DIALOGUE_DISPLAYED:   'dialogue:displayed',
  UI_ONBOARDING_REQUESTED: 'ui:onboardingRequested',
  UI_ONBOARDING_DISMISSED: 'ui:onboardingDismissed',
  UI_HIGHLIGHT_GOLD:    'ui:highlightGold',
  SKILL_UNLOCKED:       'skill:unlocked',
  UI_TOAST:             'ui:toast',
};

/**
 * Standalone EventBus — Map-based, not tied to Phaser.
 */
class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);
    return () => this._listeners.get(event)?.delete(handler);
  }

  /**
   * Emit an event with an optional payload.
   */
  emit(event, payload) {
    const handlers = this._listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload);
      }
    }
  }

  /**
   * Remove all listeners for a specific event, or all events if none specified.
   */
  removeAllListeners(event) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }
}

// Singleton instance
export const bus = new EventBus();

// Convenience helpers
export const on = (event, handler) => bus.on(event, handler);

/**
 * Create a scoped event subscription group.
 * Call scope.on() to subscribe; scope.destroy() unsubscribes all at once.
 */
export function createScope() {
  const unsubs = [];
  return {
    on(event, handler) { unsubs.push(on(event, handler)); },
    destroy() { unsubs.forEach(fn => fn()); unsubs.length = 0; },
  };
}

// --- Event contracts (dev-mode validation) ---

const EVENT_CONTRACTS = {
  // Encounter lifecycle
  [EVENTS.COMBAT_ENCOUNTER_STARTED]: ['encounterId', 'templateId', 'type', 'memberCount', 'members'],
  [EVENTS.COMBAT_ENCOUNTER_ENDED]:   ['encounterId', 'type', 'reason'],
  [EVENTS.COMBAT_TARGET_CHANGED]:    ['encounterId', 'instanceId', 'slot', 'enemyId'],

  // Per-member combat (enriched with encounterId, instanceId, slot)
  [EVENTS.COMBAT_ENEMY_KILLED]:  ['enemyId', 'name', 'isBoss', 'encounterId', 'instanceId', 'slot'],
  [EVENTS.COMBAT_ENEMY_ATTACKED]:['enemyId', 'name', 'hitChance', 'accuracy', 'encounterId', 'instanceId', 'slot'],
  [EVENTS.COMBAT_ENEMY_DODGED]:  ['enemyId', 'name', 'hitChance', 'dodgeChance', 'accuracy', 'encounterId', 'instanceId', 'slot'],
  [EVENTS.COMBAT_PLAYER_MISSED]: ['encounterId', 'instanceId', 'slot', 'enemyId', 'source'],
  [EVENTS.COMBAT_MEMBER_ADDED]:  ['encounterId', 'memberCount', 'member'],
  [EVENTS.COMBAT_ENEMY_CASTING]: ['encounterId', 'instanceId', 'slot', 'enemyId', 'castTime', 'castKind'],
  [EVENTS.COMBAT_ENEMY_CHARGE_RESOLVED]: ['encounterId', 'instanceId', 'slot', 'enemyId', 'damage'],
  [EVENTS.COMBAT_INTERRUPTED]:   ['encounterId', 'instanceId', 'slot', 'enemyId', 'source', 'kind'],
  [EVENTS.CORRUPTION_CHANGED]:   ['encounterId', 'stacks', 'maxStacks', 'reason'],
  [EVENTS.CORRUPTION_CLEANSED]:  ['encounterId', 'removedStacks', 'reason'],

  // Other
  [EVENTS.STATE_CHANGED]:        [],
  [EVENTS.PRESTIGE_PERFORMED]:   ['count'],
  [EVENTS.ENHANCE_PURCHASED]:    ['slotId', 'level', 'cost'],
  [EVENTS.TERRITORY_CLAIMED]:    ['territoryId', 'name', 'buff'],
  [EVENTS.POWER_SMASH_USED]:     ['multiplier'],
  [EVENTS.RAPID_STRIKES_USED]:   ['hitCount'],
  [EVENTS.STANCE_CHANGED]:       ['stanceId', 'previousStance'],
  [EVENTS.BULWARK_ACTIVATED]:    ['shieldHp', 'durationMs'],
  [EVENTS.COMBAT_ENEMY_REGEN]:   ['amount', 'remainingHp', 'maxHp', 'encounterId', 'instanceId', 'slot'],
  [EVENTS.COMBAT_ENEMY_ENRAGED]: ['enemyId', 'name', 'encounterId', 'instanceId', 'slot'],
  [EVENTS.COMBAT_THORNS_DAMAGE]: ['amount', 'encounterId', 'instanceId', 'slot'],
  [EVENTS.COMBAT_ARMOR_BROKEN]:  ['encounterId', 'instanceId', 'slot', 'enemyId'],
  [EVENTS.COMBAT_ARMOR_RESTORED]:['encounterId', 'instanceId', 'slot', 'enemyId'],
  [EVENTS.SKILL_UNLOCKED]:       ['skillId'],
};

export function emit(event, payload) {
  if (import.meta.env?.DEV) {
    const required = EVENT_CONTRACTS[event];
    if (required) {
      for (const key of required) {
        if (payload == null || !(key in payload)) {
          console.warn(`[EventBus] Missing "${key}" in ${event} payload`, payload);
        }
      }
    }
  }
  bus.emit(event, payload);
}
