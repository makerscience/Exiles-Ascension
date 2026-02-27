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
  'auto_attack_speed',
  'gold_find',
  'power_smash_damage',
  'power_smash_recharge',
];

function hasParsable(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return false;
  try { JSON.parse(raw); return true; } catch { return false; }
}

let activeSlot = null;
let store = null;
let autosaveTimer = null;
let boundBeforeUnload = null;
let saveRequestedUnsub = null;
let stateChangedUnsub = null;
let settingsSaveTimer = null;

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

    // Autosave on interval
    autosaveTimer = setInterval(() => this.save(), SAVE.autosaveInterval);

    // Save on page close
    boundBeforeUnload = () => this.save();
    window.addEventListener('beforeunload', boundBeforeUnload);

    // Save on explicit request (e.g. after prestige)
    saveRequestedUnsub = on(EVENTS.SAVE_REQUESTED, () => SaveManager.save());

    // Save settings quickly (debounced) so volume changes persist across short sessions.
    stateChangedUnsub = on(EVENTS.STATE_CHANGED, ({ changedKeys } = {}) => {
      if (!Array.isArray(changedKeys) || !changedKeys.includes('settings')) return;
      if (settingsSaveTimer) {
        clearTimeout(settingsSaveTimer);
      }
      settingsSaveTimer = setTimeout(() => {
        settingsSaveTimer = null;
        SaveManager.save();
      }, 300);
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
    if (saveRequestedUnsub) {
      saveRequestedUnsub();
      saveRequestedUnsub = null;
    }
    if (stateChangedUnsub) {
      stateChangedUnsub();
      stateChangedUnsub = null;
    }
    if (settingsSaveTimer) {
      clearTimeout(settingsSaveTimer);
      settingsSaveTimer = null;
    }
    store = null;
    activeSlot = null;
  },

  /** Serialize state to localStorage. Rotates current → backup before writing. */
  save() {
    if (!store || window.__saveWiped || !activeSlot) return;
    const state = store.getState();
    if (!state) return;
    store.updateTimestamps({ lastSave: Date.now(), lastOnline: Date.now() });
    const json = JSON.stringify(state);
    const pk = slotKey(activeSlot);
    const bk = slotBackupKey(activeSlot);
    const existing = localStorage.getItem(pk);
    if (existing) localStorage.setItem(bk, existing);
    localStorage.setItem(pk, json);
    emit(EVENTS.SAVE_COMPLETED, {});
  },

  /** Load from localStorage. Falls back to backup if primary is corrupt. */
  load(slotId) {
    if (!store) return;
    const pk = slotKey(slotId);
    const bk = slotBackupKey(slotId);
    let raw = localStorage.getItem(pk);
    let data = null;
    if (raw) {
      try { data = JSON.parse(raw); }
      catch { emit(EVENTS.SAVE_CORRUPT, { source: 'primary' }); data = null; }
    }
    if (!data) {
      raw = localStorage.getItem(bk);
      if (raw) {
        try { data = JSON.parse(raw); emit(EVENTS.SAVE_CORRUPT, { source: 'primary', recoveredFrom: 'backup' }); }
        catch { emit(EVENTS.SAVE_CORRUPT, { source: 'both' }); return; }
      }
    }
    if (!data) return;
    data = migrate(data);
    store.loadState(data);
    activeSlot = slotId;
    localStorage.setItem(ACTIVE_SLOT_KEY, String(slotId));
    emit(EVENTS.SAVE_LOADED, {});
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
  },

  /** Return a brief summary of a slot's save data (for UI). */
  getSlotSummary(slotId) {
    const raw = localStorage.getItem(slotKey(slotId));
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      return {
        level: data?.playerStats?.level ?? 1,
        area: data?.currentArea ?? 1,
        zone: data?.currentZone ?? 1,
      };
    } catch { return null; }
  },

  setActiveSlot(slotId) {
    activeSlot = slotId;
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
