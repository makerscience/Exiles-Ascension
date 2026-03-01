import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import StartScene from './scenes/StartScene.js';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';
import { WORLD } from './config.js';
import { FEATURES } from './config/features.js';
import Store from './systems/Store.js';
import SaveManager from './systems/SaveManager.js';
import TimeEngine from './systems/TimeEngine.js';
import CombatEngine from './systems/CombatEngine.js';
import LootEngine from './systems/LootEngine.js';
import InventorySystem from './systems/InventorySystem.js';
import UpgradeManager from './systems/UpgradeManager.js';
import OfflineProgress from './systems/OfflineProgress.js';

// Conditional imports for gated systems
import TerritoryManager from './systems/TerritoryManager.js';
import OverworldScene from './scenes/OverworldScene.js';
import SpritePreviewScene from './scenes/SpritePreviewScene.js';

// ── Boot sequence ───────────────────────────────────────────────────
Store.init();
SaveManager.init(Store);
TimeEngine.init();
LootEngine.init();
if (FEATURES.territoryEnabled) TerritoryManager.init();
OfflineProgress.apply();

const scenes = [BootScene, StartScene, GameScene, UIScene];
if (FEATURES.territoryEnabled) scenes.push(OverworldScene);
if (FEATURES.spritePreviewEnabled) scenes.push(SpritePreviewScene);

const config = {
  type: Phaser.AUTO,
  width: WORLD.width,
  height: WORLD.height,
  parent: 'game',
  backgroundColor: '#1a1a1a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: { default: false },
  scene: scenes,
};

const game = new Phaser.Game(config);

// Expose for dev console debugging
if (import.meta.env.DEV) {
  window.game = game;
  window.Store = Store;
  window.SaveManager = SaveManager;
  window.CombatEngine = CombatEngine;
  window.LootEngine = LootEngine;
  window.InventorySystem = InventorySystem;
  window.UpgradeManager = UpgradeManager;
  window.OfflineProgress = OfflineProgress;
  window.__unlockSkill = (name) => {
    const key = `unlocked${name}`;
    Store.setFlag(key, true);
    return Store.getState().flags[key];
  };
  window.__lockSkill = (name) => {
    const key = `unlocked${name}`;
    Store.setFlag(key, false);
    return Store.getState().flags[key];
  };
  window.__resetUnlockFlags = () => {
    const resetKeys = [
      'unlockedArmorBreak',
      'unlockedInterrupt',
      'unlockedCleanse',
      'shownUnlockArmorBreak',
      'shownUnlockInterrupt',
      'shownUnlockCleanse',
    ];
    for (const key of resetKeys) {
      Store.setFlag(key, false);
    }
    const flags = Store.getState().flags;
    return Object.fromEntries(resetKeys.map(key => [key, !!flags[key]]));
  };
  window.__grantSP = (amount = 1) => {
    Store.addSkillPoints(amount);
    return Store.getState().skillPoints;
  };
  if (FEATURES.territoryEnabled) window.TerritoryManager = TerritoryManager;
}

// In dev HMR flows, flush save state before module disposal.
if (import.meta.hot) {
  let forcingFullReload = false;

  // Some hot updates can partially swap singleton modules and reset runtime state.
  // Force a full reload (after save) so progress survives code edits consistently.
  import.meta.hot.on('vite:beforeUpdate', () => {
    if (forcingFullReload) return;
    forcingFullReload = true;
    try { SaveManager.save(); } catch {}
    window.location.reload();
  });

  import.meta.hot.dispose(() => {
    try { SaveManager.save(); } catch {}
    try { SaveManager.destroy(); } catch {}
    try { TimeEngine.destroy(); } catch {}
  });
}
