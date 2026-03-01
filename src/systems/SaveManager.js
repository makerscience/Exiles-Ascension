// SaveManager — persists Store state to localStorage with backup rotation.
// Receives Store as a parameter to init() to avoid circular imports.

import { SAVE } from '../config.js';
import { emit, on, EVENTS } from '../events.js';

const SLOT_PREFIX = 'litrpg_idle_vslice_save';
const ACTIVE_SLOT_KEY = 'litrpg_idle_active_slot';
const SLOT_IDS = [1, 2, 3];

function slotKey(slotId) { return `${SLOT_PREFIX}_slot${slotId}`; }
function slotBackupKey(slotId) { return `${SLOT_PREFIX}_slot${slotId}_backup`; }

// Legacy save keys — archived on first boot, never written to again
const LEGACY_PRIMARY_KEY = 'litrpg_idle_save';
const LEGACY_BACKUP_KEY = 'litrpg_idle_save_backup';
const LEGACY_ARCHIVED_KEY = 'litrpg_idle_legacy_archive';
const ENHANCEABLE_SLOT_IDS = ['head', 'chest', 'main_hand', 'legs', 'boots', 'gloves', 'amulet'];
const STANDARD_UPGRADE_IDS = [
  'sharpen_blade',
  'battle_hardening',
  'defensive_drills',
  'agility_drills',
  'bigger_swigs',
  'endurance_training',
  'auto_attack_speed',
  'gold_find',
  'power_smash_damage',
  'power_smash_recharge',
];
const REMOVED_PASSIVE_UPGRADES = [
  { id: 'battle_hardening', target: 'str', valuePerLevel: 2 },
  { id: 'defensive_drills', target: 'def', valuePerLevel: 2 },
  { id: 'agility_drills', target: 'agi', valuePerLevel: 1 },
];

function hasParsable(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return false;
  try { JSON.parse(raw); return true; } catch { return false; }
}

function parseCandidate(raw, source) {
  if (!raw) return null;
  try {
    return { data: JSON.parse(raw), source, raw };
  } catch {
    return null;
  }
}

function isLikelyFreshStart(data) {
  const level = Number(data?.playerStats?.level ?? 1);
  const area = Number(data?.currentArea ?? 1);
  const zone = Number(data?.currentZone ?? 1);
  const totalKills = Number(data?.totalKills ?? 0);
  const purchasedCount = Object.keys(data?.purchasedUpgrades || {}).length;
  const skillPoints = Number(data?.skillPoints ?? 0);
  const inventoryCount = Object.keys(data?.inventoryStacks || {}).length;

  return level <= 1
    && area === 1
    && zone === 1
    && totalKills <= 0
    && purchasedCount === 0
    && skillPoints <= 0
    && inventoryCount === 0;
}

function chooseSlotCandidate(primary, backup) {
  if (primary && backup) {
    const primaryFresh = isLikelyFreshStart(primary.data);
    const backupFresh = isLikelyFreshStart(backup.data);
    if (primaryFresh && !backupFresh) {
      return { ...backup, preferredByGuard: true };
    }
    return { ...primary, preferredByGuard: false };
  }
  if (primary) return { ...primary, preferredByGuard: false };
  if (backup) return { ...backup, preferredByGuard: false };
  return null;
}

function readSlotData(slotId) {
  const primary = parseCandidate(localStorage.getItem(slotKey(slotId)), 'primary');
  const backup = parseCandidate(localStorage.getItem(slotBackupKey(slotId)), 'backup');
  return chooseSlotCandidate(primary, backup);
}

let activeSlot = null;
let store = null;
let autosaveTimer = null;
let boundBeforeUnload = null;
let boundPageHide = null;
let boundVisibilityChange = null;
let saveRequestedUnsub = null;
let stateChangedUnsub = null;
let queuedSaveTimer = null;
let queuedSaveDeadline = 0;
let saveArmed = false;

const SETTINGS_SAVE_DEBOUNCE_MS = 300;
const GAMEPLAY_SAVE_DEBOUNCE_MS = 1500;

function queueSave(delayMs) {
  const clampedDelay = Math.max(0, Math.floor(delayMs || 0));
  const targetDeadline = Date.now() + clampedDelay;
  // Keep the earliest queued save; don't delay an already-earlier flush.
  if (queuedSaveTimer && queuedSaveDeadline <= targetDeadline) return;
  if (queuedSaveTimer) {
    clearTimeout(queuedSaveTimer);
  }
  queuedSaveDeadline = targetDeadline;
  queuedSaveTimer = setTimeout(() => {
    queuedSaveTimer = null;
    queuedSaveDeadline = 0;
    SaveManager.save();
  }, clampedDelay);
}

/** Migration functions keyed by target schemaVersion.
 *  Fresh save track for the vertical slice — starts at v1, no legacy migrations.
 */
const migrations = {
  2: (data) => {
    const next = { ...data };

    if (next.skillPoints == null) {
      const level = Number(next?.playerStats?.level ?? 1);
      const totalEarned = Math.max(level - 1, 0);
      const purchased = next.purchasedUpgrades || {};
      const spentOnStandard = STANDARD_UPGRADE_IDS.reduce((sum, id) => {
        const value = Number(purchased[id] || 0);
        return sum + (Number.isFinite(value) ? Math.max(0, value) : 0);
      }, 0);
      next.skillPoints = Math.max(totalEarned - spentOnStandard, 0);
    }

    if (next.enhancementLevels == null) {
      next.enhancementLevels = Object.fromEntries(ENHANCEABLE_SLOT_IDS.map(id => [id, 0]));
    } else {
      next.enhancementLevels = {
        ...Object.fromEntries(ENHANCEABLE_SLOT_IDS.map(id => [id, 0])),
        ...next.enhancementLevels,
      };
    }

    return next;
  },
  3: (data) => {
    const next = { ...data };
    const purchased = { ...(next.purchasedUpgrades || {}) };

    if (next.currentStance === 'power') next.currentStance = 'ruin';
    if (next.currentStance === 'flurry') next.currentStance = 'tempest';

    const smashDamageLevels = Math.max(0, Math.floor(Number(purchased.power_smash_damage) || 0));
    const smashRechargeLevels = Math.max(0, Math.floor(Number(purchased.power_smash_recharge) || 0));
    const refund = smashDamageLevels + smashRechargeLevels;
    if (refund > 0) {
      const currentSkillPoints = Math.max(0, Math.floor(Number(next.skillPoints) || 0));
      next.skillPoints = currentSkillPoints + refund;
    }

    delete purchased.power_smash_damage;
    delete purchased.power_smash_recharge;
    next.purchasedUpgrades = purchased;

    return next;
  },
  4: (data) => {
    const next = { ...data };
    const purchased = { ...(next.purchasedUpgrades || {}) };
    const playerStats = { ...(next.playerStats || {}) };
    let changedStats = false;
    let refund = 0;

    for (const removed of REMOVED_PASSIVE_UPGRADES) {
      const level = Math.max(0, Math.floor(Number(purchased[removed.id]) || 0));
      if (level <= 0) continue;

      refund += level;
      delete purchased[removed.id];

      const current = Number(playerStats[removed.target]);
      if (Number.isFinite(current)) {
        playerStats[removed.target] = Math.max(0, current - (removed.valuePerLevel * level));
        changedStats = true;
      }
    }

    if (refund > 0) {
      next.skillPoints = Math.max(0, Math.floor(Number(next.skillPoints) || 0) + refund);
    }
    next.purchasedUpgrades = purchased;
    if (changedStats) next.playerStats = playerStats;

    return next;
  },
};

/** Run all applicable migrations in order. */
function migrate(data) {
  let current = data.schemaVersion ?? 1;
  let next = data;
  const versions = Object.keys(migrations).map(Number).sort((a, b) => a - b);
  for (const version of versions) {
    if (current < version) {
      next = migrations[version](next);
      current = version;
    }
  }
  next.schemaVersion = current;
  return next;
}

const SaveManager = {
  /**
   * Initialize with a store reference.
   * Attempts to load existing save, then starts autosave interval + beforeunload.
   */
  init(storeRef) {
    store = storeRef;

    // One-time: archive legacy saves (old namespace) so they aren't lost
    this._archiveLegacySaves();

    // Migrate single-save to slot system if needed
    this._migrateToSlots();

    // Restore active slot from localStorage
    const savedSlot = localStorage.getItem(ACTIVE_SLOT_KEY);
    if (savedSlot && SLOT_IDS.includes(Number(savedSlot))) {
      activeSlot = Number(savedSlot);
    }
    saveArmed = false;

    // Bootstrap-load active slot before any autosave can run. This prevents
    // default in-memory state from overwriting valid slot progress on startup.
    if (activeSlot) {
      const loaded = this.load(activeSlot, { emitLoadedEvent: false });
      if (!loaded) {
        activeSlot = null;
        localStorage.removeItem(ACTIVE_SLOT_KEY);
      }
    }

    // Autosave on interval
    autosaveTimer = setInterval(() => this.save(), SAVE.autosaveInterval);

    // Save on page close
    boundBeforeUnload = () => this.save();
    boundPageHide = () => this.save();
    boundVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this.save();
      }
    };
    window.addEventListener('beforeunload', boundBeforeUnload);
    window.addEventListener('pagehide', boundPageHide);
    document.addEventListener('visibilitychange', boundVisibilityChange);

    // Save on explicit request (e.g. after prestige)
    saveRequestedUnsub = on(EVENTS.SAVE_REQUESTED, () => SaveManager.save());

    // Save shortly after state changes so dev reload/HMR does not drop recent progress.
    stateChangedUnsub = on(EVENTS.STATE_CHANGED, ({ changedKeys } = {}) => {
      if (!Array.isArray(changedKeys) || changedKeys.length === 0) return;
      const settingsOnly = changedKeys.length === 1 && changedKeys[0] === 'settings';
      if (settingsOnly) {
        queueSave(SETTINGS_SAVE_DEBOUNCE_MS);
      } else {
        queueSave(GAMEPLAY_SAVE_DEBOUNCE_MS);
      }
    });
  },

  destroy() {
    if (autosaveTimer) {
      clearInterval(autosaveTimer);
      autosaveTimer = null;
    }
    if (boundBeforeUnload) {
      window.removeEventListener('beforeunload', boundBeforeUnload);
      boundBeforeUnload = null;
    }
    if (boundPageHide) {
      window.removeEventListener('pagehide', boundPageHide);
      boundPageHide = null;
    }
    if (boundVisibilityChange) {
      document.removeEventListener('visibilitychange', boundVisibilityChange);
      boundVisibilityChange = null;
    }
    if (saveRequestedUnsub) {
      saveRequestedUnsub();
      saveRequestedUnsub = null;
    }
    if (stateChangedUnsub) {
      stateChangedUnsub();
      stateChangedUnsub = null;
    }
    if (queuedSaveTimer) {
      clearTimeout(queuedSaveTimer);
      queuedSaveTimer = null;
      queuedSaveDeadline = 0;
    }
    saveArmed = false;
    store = null;
    activeSlot = null;
  },

  /** Serialize state to localStorage. Rotates current → backup before writing. */
  save() {
    if (!store || window.__saveWiped || !activeSlot || !saveArmed) return;
    const state = store.getState();
    if (!state) return;
    const pk = slotKey(activeSlot);
    const bk = slotBackupKey(activeSlot);
    const existing = localStorage.getItem(pk);

    // Safety guard: never overwrite progressed slot data with a suspicious
    // fresh-start state unless the slot was intentionally cleared first.
    const existingParsed = parseCandidate(existing, 'primary');
    if (
      existingParsed
      && !isLikelyFreshStart(existingParsed.data)
      && isLikelyFreshStart(state)
    ) {
      console.warn('[SaveManager] Blocked suspicious fresh-state overwrite on active slot', { activeSlot });
      return;
    }

    store.updateTimestamps({ lastSave: Date.now(), lastOnline: Date.now() });
    const json = JSON.stringify(state);
    if (existing) localStorage.setItem(bk, existing);
    localStorage.setItem(pk, json);
    emit(EVENTS.SAVE_COMPLETED, {});
  },

  /** Load from localStorage. Falls back to backup if primary is corrupt. Returns true on success. */
  load(slotId, opts = {}) {
    if (!store) return false;
    const pk = slotKey(slotId);
    const bk = slotBackupKey(slotId);
    const primaryRaw = localStorage.getItem(pk);
    const backupRaw = localStorage.getItem(bk);
    let primaryCorrupt = false;
    let backupCorrupt = false;
    const primary = parseCandidate(primaryRaw, 'primary');
    const backup = parseCandidate(backupRaw, 'backup');
    if (primaryRaw && !primary) primaryCorrupt = true;
    if (backupRaw && !backup) backupCorrupt = true;

    const chosen = chooseSlotCandidate(primary, backup);
    let data = chosen?.data ?? null;
    const source = chosen?.source ?? null;
    const preferredByGuard = !!chosen?.preferredByGuard;

    if (!data) {
      if (primaryCorrupt && backupCorrupt) {
        emit(EVENTS.SAVE_CORRUPT, { source: 'both' });
      } else if (primaryCorrupt) {
        emit(EVENTS.SAVE_CORRUPT, { source: 'primary' });
      } else if (backupCorrupt) {
        emit(EVENTS.SAVE_CORRUPT, { source: 'backup' });
      }
      return false;
    }

    try {
      data = migrate(data);
      store.loadState(data);
    } catch {
      emit(EVENTS.SAVE_CORRUPT, { source: source || 'unknown', stage: 'hydrate' });
      return false;
    }

    // Self-heal slot when backup was used so future loads can use primary again.
    if (source === 'backup' && backupRaw) {
      localStorage.setItem(pk, backupRaw);
      emit(EVENTS.SAVE_CORRUPT, {
        source: preferredByGuard ? 'stale_primary' : 'primary',
        recoveredFrom: 'backup',
      });
    }

    activeSlot = slotId;
    saveArmed = true;
    localStorage.setItem(ACTIVE_SLOT_KEY, String(slotId));
    if (opts.emitLoadedEvent !== false) {
      emit(EVENTS.SAVE_LOADED, {});
    }
    return true;
  },

  /** True when a parseable save exists. Optionally check a specific slot. */
  hasSave(slotId) {
    if (slotId != null) {
      return hasParsable(slotKey(slotId)) || hasParsable(slotBackupKey(slotId));
    }
    return SLOT_IDS.some(id => hasParsable(slotKey(id)) || hasParsable(slotBackupKey(id)));
  },

  /** Clear persisted save data for gameplay New Game flow (non-debug path). */
  clearSaveForNewGame(slotId) {
    localStorage.removeItem(slotKey(slotId));
    localStorage.removeItem(slotBackupKey(slotId));
    if (activeSlot === slotId) {
      activeSlot = null;
      saveArmed = false;
      localStorage.removeItem(ACTIVE_SLOT_KEY);
    }
  },

  /** Wipe all save slots. Dev/debug tool.
   *  Sets window.__saveWiped to block orphaned HMR listeners from re-saving. */
  deleteSave() {
    window.__saveWiped = true;
    for (const id of SLOT_IDS) {
      localStorage.removeItem(slotKey(id));
      localStorage.removeItem(slotBackupKey(id));
    }
    localStorage.removeItem(ACTIVE_SLOT_KEY);
    activeSlot = null;
    saveArmed = false;
  },

  /** Return a brief summary of a slot's save data (for UI). */
  getSlotSummary(slotId) {
    const parsed = readSlotData(slotId);
    if (!parsed) return null;
    return {
      level: parsed.data?.playerStats?.level ?? 1,
      area: parsed.data?.currentArea ?? 1,
      zone: parsed.data?.currentZone ?? 1,
    };
  },

  setActiveSlot(slotId) {
    activeSlot = slotId;
    saveArmed = true;
    localStorage.setItem(ACTIVE_SLOT_KEY, String(slotId));
  },

  getActiveSlot() {
    return activeSlot;
  },

  /** Migrate single-save format to slot-based format (one-time). */
  _migrateToSlots() {
    if (SLOT_IDS.some(id => localStorage.getItem(slotKey(id)))) return;
    const oldPrimary = localStorage.getItem('litrpg_idle_vslice_save');
    const oldBackup = localStorage.getItem('litrpg_idle_vslice_save_backup');
    if (oldPrimary) {
      localStorage.setItem(slotKey(1), oldPrimary);
      if (oldBackup) localStorage.setItem(slotBackupKey(1), oldBackup);
      localStorage.removeItem('litrpg_idle_vslice_save');
      localStorage.removeItem('litrpg_idle_vslice_save_backup');
      localStorage.setItem(ACTIVE_SLOT_KEY, '1');
      console.log('[SaveManager] Migrated single save → slot 1');
    }
  },

  /** Archive legacy saves under a dedicated key (one-time, non-destructive). */
  _archiveLegacySaves() {
    if (localStorage.getItem(LEGACY_ARCHIVED_KEY)) return; // already done
    const legacyPrimary = localStorage.getItem(LEGACY_PRIMARY_KEY);
    const legacyBackup = localStorage.getItem(LEGACY_BACKUP_KEY);
    if (legacyPrimary || legacyBackup) {
      const archive = { primary: legacyPrimary, backup: legacyBackup, archivedAt: Date.now() };
      localStorage.setItem(LEGACY_ARCHIVED_KEY, JSON.stringify(archive));
      console.log('[SaveManager] Legacy saves archived under', LEGACY_ARCHIVED_KEY);
    } else {
      // No legacy saves — just mark as checked so we don't re-check
      localStorage.setItem(LEGACY_ARCHIVED_KEY, 'none');
    }
  },
};

export default SaveManager;
