// SmashButton — "SMASH" button for the Power Smash active ability.
// Visible when stance is 'power'. Cooldown driven by upgrade levels.

import CombatEngine from '../systems/CombatEngine.js';
import UpgradeManager from '../systems/UpgradeManager.js';
import { on, emit, EVENTS } from '../events.js';
import { LAYOUT } from '../config.js';

export default class SmashButton {
  constructor(scene) {
    this.scene = scene;
    this._unsubs = [];
    this._cooldownStart = 0;
    this._cooldownEnd = 0;
    this._cooldownTimer = null;
    this._manualVisible = false;

    const ga = LAYOUT.gameArea;
    const btnX = ga.x + 110;
    const btnY = ga.y + ga.h - 10;

    this._btn = scene.add.text(btnX, btnY, 'SMASH', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold',
      backgroundColor: '#7c2d12',
      padding: { x: 16, y: 8 },
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0, 1).setInteractive({ useHandCursor: true });

    this._btn.setVisible(false);
    this._btn.setDepth(10);

    this._btn.on('pointerdown', () => this._onSmash());
    this._btn.on('pointerover', () => {
      if (this._btn.visible && !this._isOnCooldown()) {
        this._btn.setStyle({ backgroundColor: '#9a3412' });
      }
    });
    this._btn.on('pointerout', () => {
      if (this._btn.visible && !this._isOnCooldown()) {
        this._btn.setStyle({ backgroundColor: '#7c2d12' });
      }
    });

    this._unsubs.push(on(EVENTS.SAVE_LOADED, () => this._refreshVisibility()));
    this._unsubs.push(on(EVENTS.UPG_PURCHASED, (data) => {
      if (data.upgradeId === 'power_smash_recharge' && this._isOnCooldown()) {
        this._recalcCooldown();
      }
    }));

    this._refreshVisibility();
  }

  _isOnCooldown() {
    return Date.now() < this._cooldownEnd;
  }

  _getDamageMultiplier() {
    return 3.0 + (UpgradeManager.getMultiplier('powerSmashDamage') - 1);
  }

  _getCooldownMs() {
    return 30000 * (1 - (UpgradeManager.getMultiplier('powerSmashCooldown') - 1));
  }

  _refreshVisibility() {
    if (this._manualVisible) {
      this._btn.setVisible(true);
      if (!this._isOnCooldown()) {
        this._btn.setText('SMASH');
        this._btn.setStyle({ backgroundColor: '#7c2d12', color: '#ffffff' });
      }
    } else {
      this._btn.setVisible(false);
    }
  }

  _onSmash() {
    if (this._isOnCooldown()) return;
    if (!CombatEngine.hasTarget()) return;

    const multiplier = this._getDamageMultiplier();
    const cooldownMs = this._getCooldownMs();

    emit(EVENTS.POWER_SMASH_USED, { multiplier });
    CombatEngine.powerSmashAttack(multiplier);

    this._cooldownStart = Date.now();
    this._cooldownEnd = this._cooldownStart + cooldownMs;
    this._startCooldownTimer();
  }

  _startCooldownTimer() {
    this._stopCooldownTimer();
    this._btn.setStyle({ backgroundColor: '#333333', color: '#888888' });
    this._updateCooldownText();

    this._cooldownTimer = this.scene.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => this._updateCooldownText(),
    });
  }

  _updateCooldownText() {
    const remaining = this._cooldownEnd - Date.now();
    if (remaining <= 0) {
      this._stopCooldownTimer();
      this._btn.setText('SMASH');
      this._btn.setStyle({ backgroundColor: '#7c2d12', color: '#ffffff' });
      return;
    }
    const secs = Math.ceil(remaining / 1000);
    this._btn.setText(`SMASH (${secs}s)`);
  }

  _stopCooldownTimer() {
    if (this._cooldownTimer) {
      this._cooldownTimer.remove(false);
      this._cooldownTimer = null;
    }
  }

  _recalcCooldown() {
    const newEnd = this._cooldownStart + this._getCooldownMs();
    if (newEnd <= Date.now()) {
      this._resetCooldown();
    } else {
      this._cooldownEnd = newEnd;
      this._updateCooldownText();
    }
  }

  _resetCooldown() {
    this._cooldownStart = 0;
    this._cooldownEnd = 0;
    this._stopCooldownTimer();
    this._refreshVisibility();
  }

  show() {
    this._manualVisible = true;
    this._refreshVisibility();
  }

  hide() {
    this._manualVisible = false;
    this._btn.setVisible(false);
  }

  setPosition(x, y) {
    this._btn.setPosition(x, y);
  }

  destroy() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._stopCooldownTimer();
  }
}
