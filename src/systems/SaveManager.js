// SaveManager — persists Store state to localStorage with backup rotation.
// Receives Store as a parameter to init() to avoid circular imports.

import { SAVE } from '../config.js';
import { emit, on, EVENTS } from '../events.js';

const PRIMARY_KEY = 'litrpg_idle_vslice_save';
const BACKUP_KEY = 'litrpg_idle_vslice_save_backup';

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

let store = null;
let autosaveTimer = null;
let boundBeforeUnload = null;
let saveRequestedUnsub = null;

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

    // Attempt to load existing save
    this.load();

    // Autosave on interval
    autosaveTimer = setInterval(() => this.save(), SAVE.autosaveInterval);

    // Save on page close
    boundBeforeUnload = () => this.save();
    window.addEventListener('beforeunload', boundBeforeUnload);

    // Save on explicit request (e.g. after prestige)
    saveRequestedUnsub = on(EVENTS.SAVE_REQUESTED, () => SaveManager.save());
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
    store = null;
  },

  /** Serialize state to localStorage. Rotates current → backup before writing. */
  save() {
    if (!store || window.__saveWiped) return;

    const state = store.getState();
    if (!state) return;

    // Update timestamp before serializing
    store.updateTimestamps({ lastSave: Date.now(), lastOnline: Date.now() });

    // Decimal.toJSON() auto-converts to string, so JSON.stringify just works
    const json = JSON.stringify(state);

    // Rotate: current → backup, then write new current
    const existing = localStorage.getItem(PRIMARY_KEY);
    if (existing) {
      localStorage.setItem(BACKUP_KEY, existing);
    }
    localStorage.setItem(PRIMARY_KEY, json);

    emit(EVENTS.SAVE_COMPLETED, {});
  },

  /** Load from localStorage. Falls back to backup if primary is corrupt. */
  load() {
    if (!store) return;

    let raw = localStorage.getItem(PRIMARY_KEY);
    let data = null;

    // Try primary
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        emit(EVENTS.SAVE_CORRUPT, { source: 'primary' });
        data = null;
      }
    }

    // Fall back to backup
    if (!data) {
      raw = localStorage.getItem(BACKUP_KEY);
      if (raw) {
        try {
          data = JSON.parse(raw);
          emit(EVENTS.SAVE_CORRUPT, { source: 'primary', recoveredFrom: 'backup' });
        } catch {
          emit(EVENTS.SAVE_CORRUPT, { source: 'both' });
          return; // No valid save — Store keeps its default state
        }
      }
    }

    if (!data) return; // Fresh game — no save exists

    // Run migrations
    data = migrate(data);

    // Hydrate store
    store.loadState(data);
    emit(EVENTS.SAVE_LOADED, {});
  },

  /** Wipe both save keys. Dev/debug tool.
   *  Sets window.__saveWiped to block orphaned HMR listeners from re-saving. */
  deleteSave() {
    window.__saveWiped = true;
    localStorage.removeItem(PRIMARY_KEY);
    localStorage.removeItem(BACKUP_KEY);
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
