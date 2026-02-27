// StanceSwitcher — rotary button cycling through combat stances.
// Click cycles: tempest -> ruin -> fortress -> tempest.
// Positioned in the upper-left of the game area.

import Store from '../systems/Store.js';
import CombatEngine from '../systems/CombatEngine.js';
import { on, EVENTS } from '../events.js';
import { LAYOUT, STANCE_IDS } from '../config.js';

const STANCE_COLORS = {
  tempest:  { bg: 0x20344c, icon: 0xf8fafc },
  ruin:     { bg: 0x442528, icon: 0xf8fafc },
  fortress: { bg: 0x2f343a, icon: 0xf8fafc },
};

const STANCE_ICONS = {
  tempest:  'icon_tempest',
  ruin:     'icon_ruin',
  fortress: 'icon_fortress',
};

const RADIUS = 39;

export default class StanceSwitcher {
  constructor(scene) {
    this.scene = scene;
    this._unsubs = [];

    const ga = LAYOUT.gameArea;
    this._x = ga.x + Math.round(ga.w * (50 / 960));
    this._y = ga.y + 57;

    this._label = scene.add.text(this._x, this._y - RADIUS - 11, 'STANCE SELECTOR', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#e5e7eb',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(12);

    // Background circle
    this._circle = scene.add.circle(this._x, this._y, RADIUS, 0x1f2937);
    this._circle.setStrokeStyle(2, 0xe5e7eb, 0.35);
    this._circle.setInteractive({ useHandCursor: true });
    this._circle.setDepth(10);

    // Stance icon
    const iconSize = RADIUS * 2.1;
    this._iconShadow = scene.add.image(this._x + 1, this._y + 1, 'icon_ruin')
      .setDisplaySize(iconSize, iconSize)
      .setTintFill(0x000000)
      .setAlpha(0.24)
      .setOrigin(0.5)
      .setDepth(10.8);
    this._icon = scene.add.image(this._x, this._y, 'icon_ruin')
      .setDisplaySize(iconSize, iconSize)
      .setTintFill(0xffffff)
      .setOrigin(0.5)
      .setDepth(11);

    this._circle.on('pointerdown', () => this._cycle());
    this._circle.on('pointerover', () => this._circle.setStrokeStyle(2, 0xe5e7eb, 0.75));
    this._circle.on('pointerout', () => this._circle.setStrokeStyle(2, 0xe5e7eb, 0.35));

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
    const colors = STANCE_COLORS[stanceId] || STANCE_COLORS.ruin;
    const iconKey = STANCE_ICONS[stanceId] || STANCE_ICONS.ruin;

    this._circle.setFillStyle(colors.bg);
    this._iconShadow.setTexture(iconKey);
    this._icon.setTexture(iconKey);
    this._icon.setTintFill(colors.icon);

    // Brief pulse on switch
    this.scene.tweens.killTweensOf(this._circle);
    this._circle.setScale(1);
    this.scene.tweens.add({
      targets: this._circle,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 100,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  show() {
    this._label.setVisible(true);
    this._circle.setVisible(true);
    this._iconShadow.setVisible(true);
    this._icon.setVisible(true);
  }

  hide() {
    this._label.setVisible(false);
    this._circle.setVisible(false);
    this._iconShadow.setVisible(false);
    this._icon.setVisible(false);
  }

  destroy() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this.scene.tweens.killTweensOf(this._circle);
    if (this._label) { this._label.destroy(); this._label = null; }
    if (this._iconShadow) { this._iconShadow.destroy(); this._iconShadow = null; }
    if (this._icon) { this._icon.destroy(); this._icon = null; }
    if (this._circle) { this._circle.destroy(); this._circle = null; }
  }
}
