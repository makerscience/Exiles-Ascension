// UpgradePanel — modal overlay for purchasing upgrades.
// Toggle via UPGRADES button or U key. Legit upgrades on left, exploit on right.

import ModalPanel from './ModalPanel.js';
import { emit, EVENTS } from '../events.js';
import Store from '../systems/Store.js';
import UpgradeManager from '../systems/UpgradeManager.js';
import { getUpgradesByCategory } from '../data/upgrades.js';
import { format } from '../systems/BigNum.js';
import { FAILED_PURCHASE } from '../data/dialogue.js';
import { makeButton } from './ui-utils.js';

const PANEL_W = 750;
const PANEL_H = 500;

export default class UpgradePanel extends ModalPanel {
  constructor(scene) {
    super(scene, {
      key: 'upgrade',
      width: PANEL_W,
      height: PANEL_H,
      hotkey: 'U',
      buttonLabel: 'SKILLS [U]',
      buttonX: 480 + 80,
      buttonColor: '#ffffff',
    });

    this._lastFailedPurchaseTime = 0;
  }

  _getTitle() { return 'SKILLS'; }

  _getEvents() {
    return [EVENTS.UPG_PURCHASED, EVENTS.PROG_LEVEL_UP, EVENTS.STATE_CHANGED, EVENTS.SAVE_LOADED];
  }

  _createStaticContent() {
    // Separator between legit and exploit columns
    this._sepLine = this.scene.add.rectangle(this._cx, this._cy, 1, PANEL_H - 30, 0x444444);
    this._modalObjects.push(this._sepLine);

    const leftX = this._cx - PANEL_W / 2 + 20;
    const rightX = this._cx + 20;

    this._legitHeader = this.scene.add.text(leftX, this._cy - PANEL_H / 2 + 50, '-- Standard --', {
      fontFamily: 'monospace', fontSize: '13px', color: '#818cf8',
    });
    this._modalObjects.push(this._legitHeader);

    this._exploitHeader = this.scene.add.text(rightX, this._cy - PANEL_H / 2 + 50, '-- Exploits --', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ef4444',
    });
    this._modalObjects.push(this._exploitHeader);
  }

  _buildContent() {
    const state = Store.getState();
    const pointsText = this.scene.add.text(this._cx, this._cy - PANEL_H / 2 + 24, `Skill Points: ${state.skillPoints || 0}`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#22c55e', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this._dynamicObjects.push(pointsText);

    // Render legit upgrades (left column)
    this._renderColumn(getUpgradesByCategory('legit'), this._cx - PANEL_W / 2 + 20, state);

    // Render exploit upgrades (right column) — only after crack
    if (state.flags.crackTriggered) {
      this._exploitHeader.setVisible(true);
      this._renderColumn(getUpgradesByCategory('exploit'), this._cx + 20, state);
    } else {
      this._exploitHeader.setVisible(false);
    }
  }

  _renderColumn(upgrades, startX, state) {
    let y = this._cy - PANEL_H / 2 + 75;

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

        const buyBtn = makeButton(this.scene, startX + 260, y + 4, `[BUY] ${costStr}`, {
          color: buyColor, bg: buyBg, hoverBg: '#555555',
          onDown: () => {
            if (UpgradeManager.canPurchase(upgrade.id)) {
              UpgradeManager.purchase(upgrade.id);
            } else {
              const now = Date.now();
              if (now - this._lastFailedPurchaseTime >= 10000) {
                this._lastFailedPurchaseTime = now;
                const line = FAILED_PURCHASE[Math.floor(Math.random() * FAILED_PURCHASE.length)];
                emit(EVENTS.DIALOGUE_QUEUED, { text: line, emotion: 'sarcastic', context: 'Insufficient funds' });
              }
            }
          },
        });
        this._dynamicObjects.push(buyBtn);
      } else {
        const maxLabel = this.scene.add.text(startX + 260, y + 4, 'MAXED', {
          fontFamily: 'monospace', fontSize: '11px', color: '#555555',
        });
        this._dynamicObjects.push(maxLabel);
      }

      y += 50;
    }
  }
}
