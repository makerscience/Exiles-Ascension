// UpgradePanel - modal overlay for purchasing stat and skill tier upgrades.
// Toggle via SKILLS button or U key.

import ModalPanel from './ModalPanel.js';
import { emit, EVENTS } from '../events.js';
import Store from '../systems/Store.js';
import UpgradeManager from '../systems/UpgradeManager.js';
import { getUpgradesByGroup, getSkillUpgradesByStance, getUpgrade } from '../data/upgrades.js';
import { FAILED_PURCHASE } from '../data/dialogue.js';
import { makeButton } from './ui-utils.js';
import { LAYOUT } from '../config.js';

const PANEL_W = 760;
const PANEL_H = 560;

const STANCE_SECTIONS = {
  ruin: { label: 'RUIN', color: '#fb923c' },
  tempest: { label: 'TEMPEST', color: '#60a5fa' },
  fortress: { label: 'FORTRESS', color: '#a1a1aa' },
};

export default class UpgradePanel extends ModalPanel {
  constructor(scene) {
    super(scene, {
      key: 'upgrade',
      width: PANEL_W,
      height: PANEL_H,
      hotkey: 'U',
      buttonLabel: 'SKILLS [U]',
      buttonX: LAYOUT.gameArea.x + LAYOUT.gameArea.w / 2 + 80,
      buttonColor: '#ffffff',
    });

    this._lastFailedPurchaseTime = 0;
    this._currentTab = 'stats';
    this._tabStatsBtn = null;
    this._tabSkillsBtn = null;
  }

  _getTitle() { return 'SKILLS'; }

  _getEvents() {
    return [EVENTS.UPG_PURCHASED, EVENTS.PROG_LEVEL_UP, EVENTS.STATE_CHANGED, EVENTS.SAVE_LOADED];
  }

  _createStaticContent() {
    const tabY = this._cy - PANEL_H / 2 + 50;
    this._tabStatsBtn = makeButton(this.scene, this._cx - 52, tabY, 'STATS', {
      onDown: () => this._setTab('stats'),
      fontSize: '12px',
      padding: { x: 10, y: 5 },
    });
    this._tabSkillsBtn = makeButton(this.scene, this._cx + 16, tabY, 'SKILLS', {
      onDown: () => this._setTab('skills'),
      fontSize: '12px',
      padding: { x: 10, y: 5 },
    });
    this._modalObjects.push(this._tabStatsBtn, this._tabSkillsBtn);
    this._syncTabStyles();
  }

  _setTab(nextTab) {
    if (this._currentTab === nextTab) return;
    this._currentTab = nextTab;
    this._syncTabStyles();
    this._refresh();
  }

  _syncTabStyles() {
    if (!this._tabStatsBtn || !this._tabSkillsBtn) return;
    const statsActive = this._currentTab === 'stats';
    this._tabStatsBtn.setStyle({
      color: statsActive ? '#ffffff' : '#9ca3af',
      backgroundColor: statsActive ? '#2563eb' : '#222222',
    });
    this._tabSkillsBtn.setStyle({
      color: statsActive ? '#9ca3af' : '#ffffff',
      backgroundColor: statsActive ? '#222222' : '#2563eb',
    });
  }

  _buildContent() {
    this._syncTabStyles();
    const state = Store.getState();
    const pointsText = this.scene.add.text(this._cx, this._cy - PANEL_H / 2 + 24, `Skill Points: ${state.skillPoints || 0}`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#22c55e', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this._dynamicObjects.push(pointsText);

    if (this._currentTab === 'stats') {
      this._buildStatsTab(state);
    } else {
      this._buildSkillsTab();
    }
  }

  _buildStatsTab(state) {
    const sep = this.scene.add.rectangle(this._cx, this._cy + 10, 1, PANEL_H - 110, 0x444444);
    this._dynamicObjects.push(sep);

    const leftX = this._cx - PANEL_W / 2 + 20;
    const rightX = this._cx + 20;
    const topY = this._cy - PANEL_H / 2 + 84;

    const legitHeader = this.scene.add.text(leftX, topY - 20, '-- Standard --', {
      fontFamily: 'monospace', fontSize: '13px', color: '#818cf8',
    });
    this._dynamicObjects.push(legitHeader);

    const allStat = getUpgradesByGroup('stat');
    const legit = allStat.filter((u) => u.category === 'legit');
    const exploit = allStat.filter((u) => u.category === 'exploit');

    this._renderUpgradeColumn(legit, leftX, topY);

    if (state.flags.crackTriggered) {
      const exploitHeader = this.scene.add.text(rightX, topY - 20, '-- Exploits --', {
        fontFamily: 'monospace', fontSize: '13px', color: '#ef4444',
      });
      this._dynamicObjects.push(exploitHeader);
      this._renderUpgradeColumn(exploit, rightX, topY);
    }
  }

  _buildSkillsTab() {
    const leftX = this._cx - PANEL_W / 2 + 20;
    const rightX = this._cx + 20;
    const startY = this._cy - PANEL_H / 2 + 84;

    let leftY = this._renderSkillSection('ruin', leftX, startY);
    leftY += 14;
    this._renderSkillSection('fortress', leftX, leftY);

    this._renderSkillSection('tempest', rightX, startY);
  }

  _renderUpgradeColumn(upgrades, startX, startY) {
    let y = startY;

    for (const upgrade of upgrades) {
      const level = UpgradeManager.getLevel(upgrade.id);
      const isMaxed = level >= upgrade.maxLevel;
      const cost = isMaxed ? 0 : UpgradeManager.getCost(upgrade.id);
      const canBuy = UpgradeManager.canPurchase(upgrade.id);

      const levelStr = isMaxed ? 'MAX' : `Lv.${level}/${upgrade.maxLevel}`;
      const nameText = this.scene.add.text(startX, y, `${upgrade.name} [${levelStr}]`, {
        fontFamily: 'monospace', fontSize: '12px',
        color: upgrade.category === 'exploit' ? '#ef4444' : '#ffffff',
      });
      this._dynamicObjects.push(nameText);

      const descText = this.scene.add.text(startX, y + 16, upgrade.description, {
        fontFamily: 'monospace', fontSize: '10px', color: '#888888',
      });
      this._dynamicObjects.push(descText);

      if (!isMaxed) {
        let costStr = `${cost} Fragments`;
        if (upgrade.currency === 'gold') costStr = `${cost} Gold`;
        if (upgrade.currency === 'skillPoints') costStr = `${cost} SP`;
        const buyColor = canBuy ? '#22c55e' : '#555555';
        const buyBg = canBuy ? '#333333' : '#222222';

        const buyBtn = makeButton(this.scene, startX + 262, y + 4, `[BUY] ${costStr}`, {
          color: buyColor,
          bg: buyBg,
          hoverBg: '#555555',
          onDown: () => this._tryPurchase(upgrade.id),
        });
        this._dynamicObjects.push(buyBtn);
      } else {
        const maxLabel = this.scene.add.text(startX + 262, y + 4, 'MAXED', {
          fontFamily: 'monospace', fontSize: '11px', color: '#555555',
        });
        this._dynamicObjects.push(maxLabel);
      }

      y += 50;
    }
  }

  _renderSkillSection(stanceId, startX, startY) {
    const meta = STANCE_SECTIONS[stanceId];
    const sectionHeader = this.scene.add.text(startX, startY, `-- ${meta.label} --`, {
      fontFamily: 'monospace', fontSize: '13px', color: meta.color,
    });
    this._dynamicObjects.push(sectionHeader);

    let y = startY + 22;
    const upgrades = getSkillUpgradesByStance(stanceId).filter((u) => UpgradeManager.isVisible(u.id));

    for (const upgrade of upgrades) {
      const level = UpgradeManager.getLevel(upgrade.id);
      const isOwned = level >= upgrade.maxLevel;
      const reqMet = !upgrade.requires || UpgradeManager.hasUpgrade(upgrade.requires);
      const canBuy = !isOwned && reqMet && UpgradeManager.canPurchase(upgrade.id);
      const tier = this._getTierFromId(upgrade.id);

      const nameColor = isOwned ? '#22c55e' : reqMet ? '#ffffff' : '#6b7280';
      const nameText = this.scene.add.text(startX, y, `[${tier}] ${upgrade.name}`, {
        fontFamily: 'monospace', fontSize: '12px', color: nameColor,
      });
      this._dynamicObjects.push(nameText);

      const descText = this.scene.add.text(startX, y + 14, upgrade.description, {
        fontFamily: 'monospace', fontSize: '9px', color: '#888888',
      });
      this._dynamicObjects.push(descText);

      if (isOwned) {
        const ownedLabel = this.scene.add.text(startX + 268, y + 2, 'OWNED', {
          fontFamily: 'monospace', fontSize: '10px', color: '#22c55e',
        });
        this._dynamicObjects.push(ownedLabel);
      } else if (!reqMet) {
        const reqName = getUpgrade(upgrade.requires)?.name || upgrade.requires;
        const reqLabel = this.scene.add.text(startX + 188, y + 2, `Requires: ${reqName}`, {
          fontFamily: 'monospace', fontSize: '9px', color: '#6b7280',
        });
        this._dynamicObjects.push(reqLabel);
      } else {
        const buyBtn = makeButton(this.scene, startX + 248, y + 2, '[BUY] 1 SP', {
          color: canBuy ? '#22c55e' : '#555555',
          bg: canBuy ? '#333333' : '#222222',
          hoverBg: '#555555',
          fontSize: '10px',
          padding: { x: 5, y: 2 },
          onDown: () => this._tryPurchase(upgrade.id),
        });
        this._dynamicObjects.push(buyBtn);
      }

      y += 36;
    }

    return y;
  }

  _getTierFromId(upgradeId) {
    const m = /_t(\d+)$/.exec(upgradeId);
    return m ? `T${m[1]}` : 'T?';
  }

  _tryPurchase(upgradeId) {
    if (UpgradeManager.canPurchase(upgradeId)) {
      UpgradeManager.purchase(upgradeId);
      return;
    }

    const now = Date.now();
    if (now - this._lastFailedPurchaseTime < 10000) return;
    this._lastFailedPurchaseTime = now;
    const line = FAILED_PURCHASE[Math.floor(Math.random() * FAILED_PURCHASE.length)];
    emit(EVENTS.DIALOGUE_QUEUED, { text: line, emotion: 'sarcastic', context: 'Insufficient funds' });
  }
}
