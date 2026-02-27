// PrestigePanel — modal overlay for prestige confirmation.
// Toggle via PRESTIGE button or P key. Shows keeps/resets/gains + two-click confirm.

import ModalPanel from './ModalPanel.js';
import { on, EVENTS } from '../events.js';
import { PRESTIGE, LAYOUT } from '../config.js';
import Store from '../systems/Store.js';
import PrestigeManager from '../systems/PrestigeManager.js';
import { format } from '../systems/BigNum.js';
import { makeButton } from './ui-utils.js';

const PANEL_W = 700;
const PANEL_H = 480;

export default class PrestigePanel extends ModalPanel {
  constructor(scene) {
    super(scene, {
      key: 'prestige',
      width: PANEL_W,
      height: PANEL_H,
      hotkey: 'P',
      buttonLabel: 'PRESTIGE [P]',
      buttonX: LAYOUT.gameArea.x + LAYOUT.gameArea.w / 2 + 240,
      buttonColor: '#f59e0b',
      borderColor: 0xf59e0b,
      titleColor: '#f59e0b',
      titleSize: '18px',
    });

    this._confirmPending = false;
    this._confirmTimer = null;

    // Prestige-specific event subscriptions (not refresh events)
    this._unsubs.push(on(EVENTS.PRESTIGE_AVAILABLE, () => {
      this._toggleBtn.setVisible(true);
    }));
    this._unsubs.push(on(EVENTS.PRESTIGE_PERFORMED, () => {
      if (this._isOpen) this._close();
    }));
    this._unsubs.push(on(EVENTS.SAVE_LOADED, () => {
      this._toggleBtn.setVisible(PrestigeManager.canPrestige());
    }));

    // Initial visibility
    this._toggleBtn.setVisible(PrestigeManager.canPrestige());
  }

  _getTitle() { return 'PRESTIGE'; }
  _getEvents() { return []; }

  _onHotkeyDown() {
    if (PrestigeManager.canPrestige()) this._toggle();
  }

  _open() {
    if (!PrestigeManager.canPrestige()) return;
    this._confirmPending = false;
    super._open();
  }

  _close() {
    this._confirmPending = false;
    if (this._confirmTimer) {
      clearTimeout(this._confirmTimer);
      this._confirmTimer = null;
    }
    super._close();
  }

  _buildContent() {
    const state = Store.getState();
    const leftX = this._cx - PANEL_W / 2 + 30;
    const rightX = this._cx + 30;
    const centerX = this._cx;
    let topY = this._cy - PANEL_H / 2 + 55;

    // -- KEEPS (green) --
    this._addLabel(leftX, topY, '-- KEEPS --', '#22c55e', '14px', true);
    const keeps = [
      'Equipped Gear', 'Inventory Items',
      `Glitch Fragments (${format(state.glitchFragments)})`,
      'Unlocked Cheats', 'Active Cheats', 'Titles', 'Crack Progress',
    ];
    let y = topY + 28;
    for (const line of keeps) {
      this._addLabel(leftX + 10, y, `+ ${line}`, '#22c55e', '12px');
      y += 22;
    }

    // -- RESETS (red) --
    this._addLabel(rightX, topY, '-- RESETS --', '#ef4444', '14px', true);
    const goldRetained = state.gold.times(PRESTIGE.goldRetention).floor();
    const resets = [
      'Area 1, Zone 1',
      `Gold: ${format(state.gold)} → ${format(goldRetained)} (keep 10%)`,
      'Level → 1 / Stats → Starting',
      'All Upgrades → Reset',
      `Kill Count: ${state.totalKills} → 0`,
    ];
    y = topY + 28;
    for (const line of resets) {
      this._addLabel(rightX + 10, y, `- ${line}`, '#ef4444', '12px');
      y += 22;
    }

    // -- GAINS (gold) --
    const gainsY = topY + 200;
    this._addLabel(centerX, gainsY, '-- GAINS --', '#f59e0b', '14px', true, true);

    const currentCount = state.prestigeCount;
    const nextCount = currentCount + 1;
    const currentMult = currentCount > 0 ? PRESTIGE.multiplierFormula(currentCount).toFixed(2) : '1.00';
    const nextMult = PRESTIGE.multiplierFormula(nextCount).toFixed(2);

    this._addLabel(centerX, gainsY + 30, `Prestige #${currentCount} → #${nextCount}`, '#f59e0b', '13px', false, true);
    this._addLabel(centerX, gainsY + 52, `Multiplier: x${currentMult} → x${nextMult}`, '#f59e0b', '13px', false, true);
    this._addLabel(centerX, gainsY + 74, `(Applies to Damage, Gold, and XP)`, '#888888', '11px', false, true);
    this._addLabel(centerX, gainsY + 96, `Gold retained: ${format(goldRetained)}`, '#eab308', '12px', false, true);

    // -- CONFIRM button (two-click safeguard) --
    const btnY = this._cy + PANEL_H / 2 - 50;
    const btnLabel = this._confirmPending ? '!! ARE YOU SURE? !!' : 'CONFIRM PRESTIGE';
    const btnColor = this._confirmPending ? '#ef4444' : '#f59e0b';
    const btnBg = this._confirmPending ? '#4a1515' : '#333333';

    const confirmBtn = this.scene.add.text(centerX, btnY, btnLabel, {
      fontFamily: 'monospace', fontSize: '16px', color: btnColor,
      backgroundColor: btnBg, padding: { x: 24, y: 8 }, fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    confirmBtn.on('pointerdown', () => {
      if (this._confirmPending) {
        this._confirmPending = false;
        if (this._confirmTimer) { clearTimeout(this._confirmTimer); this._confirmTimer = null; }
        PrestigeManager.performPrestige();
      } else {
        this._confirmPending = true;
        this._refresh();
        this._confirmTimer = setTimeout(() => {
          this._confirmPending = false;
          if (this._isOpen) this._refresh();
        }, 3000);
      }
    });
    confirmBtn.on('pointerover', () => confirmBtn.setStyle({ backgroundColor: '#555555' }));
    confirmBtn.on('pointerout', () => confirmBtn.setStyle({ backgroundColor: btnBg }));
    this._dynamicObjects.push(confirmBtn);
  }

  _addLabel(x, y, text, color, fontSize = '12px', bold = false, centered = false) {
    const obj = this.scene.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize, color,
      fontStyle: bold ? 'bold' : 'normal',
    });
    if (centered) obj.setOrigin(0.5);
    this._dynamicObjects.push(obj);
    return obj;
  }

  destroy() {
    if (this._confirmTimer) { clearTimeout(this._confirmTimer); this._confirmTimer = null; }
    super.destroy();
  }
}
