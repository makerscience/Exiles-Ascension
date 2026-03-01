// StanceSwitcher — rotary button cycling through combat stances.
// Click cycles: tempest -> ruin -> fortress -> tempest.
// Positioned in the upper-left of the game area.

import Store from '../systems/Store.js';
import CombatEngine from '../systems/CombatEngine.js';
import { on, EVENTS } from '../events.js';
import { LAYOUT, STANCE_IDS } from '../config.js';
import { snapPx } from './ui-utils.js';

const STANCE_ICONS = {
  tempest:  'icon_tempest',
  ruin:     'icon_ruin',
  fortress: 'icon_fortress',
};

const STANCE_HINTS = {
  tempest:  'Fast Attack\nWeak Defense',
  ruin:     'Strong, Slow Attack\nModerate Defense',
  fortress: 'Weak Attack\nStrong Defense',
};

const BUTTON_SIZE = 120;
const HOVER_SCALE = 1.05;

export default class StanceSwitcher {
  constructor(scene) {
    this.scene = scene;
    this._unsubs = [];

    const ga = LAYOUT.gameArea;
    this._x = snapPx(ga.x + Math.round(ga.w * (50 / 960)));
    this._y = snapPx(ga.y + 67);

    // Stance icon (icon edge is button edge)
    const iconSize = snapPx(BUTTON_SIZE);
    this._icon = scene.add.image(this._x, this._y, 'icon_ruin')
      .setDisplaySize(iconSize, iconSize)
      .setTintFill(0xffffff)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(11);
    this._baseScaleX = this._icon.scaleX;
    this._baseScaleY = this._icon.scaleY;

    this._hintText = scene.add.text(
      snapPx(this._x + BUTTON_SIZE / 2 + 14),
      snapPx(this._y - 20),
      '',
      {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#e5e7eb',
        stroke: '#000000',
        strokeThickness: 3,
        lineSpacing: 2,
      },
    ).setOrigin(0, 0.5).setDepth(11);

    this._icon.on('pointerdown', () => this._cycle());
    this._icon.on('pointerover', () => this._icon.setScale(this._baseScaleX * HOVER_SCALE, this._baseScaleY * HOVER_SCALE));
    this._icon.on('pointerout', () => this._icon.setScale(this._baseScaleX, this._baseScaleY));

    this._unsubs.push(on(EVENTS.STANCE_CHANGED, ({ stanceId }) => this._updateVisual(stanceId)));
    this._unsubs.push(on(EVENTS.SAVE_LOADED, () => this._updateVisual(Store.getState().currentStance)));

    this._updateVisual(Store.getState().currentStance);
  }

  _cycle() {
    if (CombatEngine.isPlayerDead()) return;

    const current = Store.getState().currentStance;
    const idx = STANCE_IDS.indexOf(current);
    const next = STANCE_IDS[(idx + 1) % STANCE_IDS.length];
    Store.setStance(next);
  }

  _updateVisual(stanceId) {
    const iconKey = STANCE_ICONS[stanceId] || STANCE_ICONS.ruin;
    const hint = STANCE_HINTS[stanceId] || STANCE_HINTS.ruin;

    this._icon.setTexture(iconKey);
    this._icon.clearTint();
    this._hintText.setText(hint);

    // Brief pulse on switch
    this.scene.tweens.killTweensOf(this._icon);
    this._icon.setScale(this._baseScaleX, this._baseScaleY);
    this.scene.tweens.add({
      targets: this._icon,
      scaleX: this._baseScaleX * 1.2,
      scaleY: this._baseScaleY * 1.2,
      duration: 100,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  show() {
    this._icon.setVisible(true);
    this._hintText.setVisible(true);
  }

  hide() {
    this._icon.setVisible(false);
    this._hintText.setVisible(false);
  }

  destroy() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this.scene.tweens.killTweensOf(this._icon);
    if (this._icon) { this._icon.destroy(); this._icon = null; }
    if (this._hintText) { this._hintText.destroy(); this._hintText = null; }
  }
}
