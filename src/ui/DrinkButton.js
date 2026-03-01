// DrinkButton - icon button that heals player when a waterskin is equipped.
// Visible only when a waterskin is equipped. Cooldown driven by the equipped item's cooldownMs.

import Store from '../systems/Store.js';
import UpgradeManager from '../systems/UpgradeManager.js';
import { getEffectiveMaxHp } from '../systems/ComputedStats.js';
import { getItem } from '../data/items.js';
import { on, emit, EVENTS } from '../events.js';
import { LAYOUT } from '../config.js';
import { snapPx } from './ui-utils.js';

const ICON_SIZE = 100;
const STATS_ICON_SIZE = 128;
const HOVER_SCALE = 1.05;
const COOLDOWN_DARK_ALPHA = 0.72;

export default class DrinkButton {
  constructor(scene) {
    this.scene = scene;
    this._unsubs = [];
    this._cooldownStart = 0;
    this._cooldownEnd = 0;
    this._cooldownMs = 0;
    this._cooldownTimer = null;

    const statsBtnX = LAYOUT.bottomBar.x + STATS_ICON_SIZE / 2;
    const statsBtnY = LAYOUT.bottomBar.y + LAYOUT.bottomBar.h / 2;
    const btnX = snapPx(statsBtnX - 10);
    const btnY = snapPx(statsBtnY - STATS_ICON_SIZE / 2 - 10);

    this._container = scene.add.container(btnX, btnY);
    this._container.setDepth(10).setVisible(false);

    this._icon = scene.add.image(0, 0, 'icon_drink_button');
    this._icon.setDisplaySize(ICON_SIZE, ICON_SIZE);
    this._icon.setInteractive({ useHandCursor: true });
    this._baseScaleX = this._icon.scaleX;
    this._baseScaleY = this._icon.scaleY;

    this._cooldownOverlay = scene.add.image(0, 0, 'icon_drink_button');
    this._cooldownOverlay.setDisplaySize(ICON_SIZE, ICON_SIZE);
    this._cooldownOverlay.setTint(0x000000);
    this._cooldownOverlay.setAlpha(COOLDOWN_DARK_ALPHA);
    this._cooldownOverlay.setVisible(false);

    this._container.add([this._icon, this._cooldownOverlay]);

    this._icon.on('pointerdown', () => this._onDrink());
    this._icon.on('pointerover', () => {
      if (this._container.visible && !this._isOnCooldown()) {
        this._icon.setScale(this._baseScaleX * HOVER_SCALE, this._baseScaleY * HOVER_SCALE);
      }
    });
    this._icon.on('pointerout', () => {
      if (this._container.visible && !this._isOnCooldown()) {
        this._icon.setScale(this._baseScaleX, this._baseScaleY);
      }
    });

    this._unsubs.push(on(EVENTS.INV_ITEM_EQUIPPED, () => this._refresh()));
    this._unsubs.push(on(EVENTS.SAVE_LOADED, () => this._refresh()));
    this._unsubs.push(on(EVENTS.COMBAT_PLAYER_DIED, () => this._resetCooldown()));

    this._refresh();
  }

  _getEquippedWaterskin() {
    const state = Store.getState();
    const stackKey = state.equipped.waterskin;
    if (!stackKey) return null;
    return getItem(stackKey);
  }

  _isOnCooldown() {
    return Date.now() < this._cooldownEnd;
  }

  _refresh() {
    const item = this._getEquippedWaterskin();
    if (item) {
      this._container.setVisible(true);
      this._updateCooldownVisual();
    } else {
      this._container.setVisible(false);
      this._stopCooldownTimer();
    }
  }

  _onDrink() {
    if (this._isOnCooldown()) return;

    const item = this._getEquippedWaterskin();
    if (!item) return;

    const baseHealPercent = item.healPercent || 0.20;
    const healBonusPercent = UpgradeManager.getFlatBonus('waterskinHealBonusPct');
    const healPercent = baseHealPercent * (1 + healBonusPercent);
    const cooldownMs = item.cooldownMs || 30000;

    const maxHp = getEffectiveMaxHp();
    const healAmount = Math.floor(maxHp.toNumber() * healPercent);
    Store.healPlayer(healAmount);

    emit(EVENTS.WATERSKIN_USED, { healAmount, itemId: item.id });

    this._cooldownMs = cooldownMs;
    this._cooldownStart = Date.now();
    this._cooldownEnd = this._cooldownStart + this._cooldownMs;
    this._startCooldownTimer();
  }

  _startCooldownTimer() {
    this._stopCooldownTimer();
    this._updateCooldownVisual();

    this._cooldownTimer = this.scene.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => this._updateCooldownVisual(),
    });
  }

  _updateCooldownVisual() {
    const remaining = this._cooldownEnd - Date.now();
    if (remaining <= 0) {
      this._stopCooldownTimer();
      this._cooldownOverlay.setVisible(false);
      this._cooldownOverlay.setCrop();
      this._cooldownOverlay.setAlpha(COOLDOWN_DARK_ALPHA);
      this._icon.setScale(this._baseScaleX, this._baseScaleY);
      return;
    }
    const ratio = Math.max(0, Math.min(1, this._cooldownMs > 0 ? remaining / this._cooldownMs : 0));
    const frameW = this._cooldownOverlay.frame.cutWidth;
    const frameH = this._cooldownOverlay.frame.cutHeight;
    const darkH = Math.round(frameH * ratio);
    if (darkH <= 0) {
      this._cooldownOverlay.setVisible(false);
      this._cooldownOverlay.setCrop(0, 0, frameW, 0);
    } else {
      this._cooldownOverlay.setVisible(true);
      this._cooldownOverlay.setAlpha(COOLDOWN_DARK_ALPHA);
      this._cooldownOverlay.setCrop(0, 0, frameW, darkH);
    }

  }

  _stopCooldownTimer() {
    if (this._cooldownTimer) {
      this._cooldownTimer.remove(false);
      this._cooldownTimer = null;
    }
  }

  _resetCooldown() {
    this._cooldownStart = 0;
    this._cooldownEnd = 0;
    this._cooldownMs = 0;
    this._stopCooldownTimer();
    this._cooldownOverlay.setVisible(false);
    this._cooldownOverlay.setCrop();
    this._icon.setScale(this._baseScaleX, this._baseScaleY);
    this._refresh();
  }

  show() {
    this._refresh();
  }

  hide() {
    this._container.setVisible(false);
  }

  setPosition(x, y) {
    this._container.setPosition(snapPx(x), snapPx(y));
  }

  destroy() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._stopCooldownTimer();
    if (this._container) {
      this._container.destroy();
      this._container = null;
    }
  }
}
