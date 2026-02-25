// BossChallenge — pulsing "CHALLENGE BOSS" button that appears when kill threshold is met.
// Click triggers boss spawn. Victory auto-advances zone. Different labels for elite/area bosses.

import BossManager from '../systems/BossManager.js';
import CombatEngine from '../systems/CombatEngine.js';
import { on, EVENTS } from '../events.js';
import { LAYOUT } from '../config.js';
import { BOSS_TYPES } from '../data/areas.js';

export default class BossChallenge {
  constructor(scene) {
    this.scene = scene;
    this._unsubs = [];
    this._pulseTween = null;

    const btnX = LAYOUT.zoneNav.centerX;
    const btnY = LAYOUT.zoneNav.y + 48;

    // Challenge button — hidden by default
    this._btn = scene.add.text(btnX, btnY, 'CHALLENGE BOSS', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
      backgroundColor: '#7c2d12',
      padding: { x: 10, y: 6 },
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this._btn.setVisible(false);
    this._btn.setDepth(10);

    this._btn.on('pointerdown', () => this._onChallenge());
    this._btn.on('pointerover', () => {
      if (this._btn.visible) this._btn.setStyle({ backgroundColor: '#9a3412' });
    });
    this._btn.on('pointerout', () => {
      if (this._btn.visible) this._btn.setStyle({ backgroundColor: '#7c2d12' });
    });

    // Subscribe to events
    this._unsubs.push(on(EVENTS.BOSS_CHALLENGE_READY, () => this._showButton()));
    this._unsubs.push(on(EVENTS.BOSS_SPAWNED, () => this._hideButton()));
    this._unsubs.push(on(EVENTS.BOSS_DEFEATED, () => this._hideButton()));
    this._unsubs.push(on(EVENTS.WORLD_ZONE_CHANGED, () => this._refresh()));
    this._unsubs.push(on(EVENTS.WORLD_AREA_CHANGED, () => this._refresh()));
    this._unsubs.push(on(EVENTS.SAVE_LOADED, () => this._refresh()));

    // Check initial state
    this._refresh();
  }

  _refresh() {
    if (BossManager.isChallengeReady() && !BossManager.isBossActive()) {
      this._showButton();
    } else {
      this._hideButton();
    }
  }

  _showButton() {
    const bossData = BossManager.getCurrentBossData();
    const bossLabel = BossManager.getCurrentBossLabel();

    let text;
    if (bossLabel === BOSS_TYPES.AREA.label) {
      const name = bossData?.name || 'AREA BOSS';
      text = `\u2694 CHALLENGE ${name.toUpperCase()} \u2694`;
      this._btn.setStyle({ backgroundColor: '#7c2d12', color: '#fbbf24' });
    } else if (bossLabel === BOSS_TYPES.ELITE.label) {
      const name = bossData?.name || 'ELITE BOSS';
      text = `\u2605 CHALLENGE ${name.toUpperCase()} \u2605`;
      this._btn.setStyle({ backgroundColor: '#4c1d95', color: '#c4b5fd' });
    } else {
      const name = bossData?.name || 'BOSS';
      text = `CHALLENGE ${name.toUpperCase()}`;
      this._btn.setStyle({ backgroundColor: '#7c2d12', color: '#ffffff' });
    }

    this._btn.setText(text);
    this._btn.setVisible(true);

    // Start pulse animation
    if (!this._pulseTween) {
      this._pulseTween = this.scene.tweens.add({
        targets: this._btn,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  _hideButton() {
    this._btn.setVisible(false);
    if (this._pulseTween) {
      this._pulseTween.stop();
      this._pulseTween = null;
      this._btn.setScale(1);
    }
  }

  _onChallenge() {
    // Don't allow boss challenges while the player is dead
    if (CombatEngine.isPlayerDead()) return;
    const bossTemplate = BossManager.startBoss();
    if (bossTemplate) {
      CombatEngine.spawnBoss(bossTemplate);
      this._hideButton();
    }
  }

  show() {
    this._refresh();
  }

  hide() {
    this._hideButton();
  }

  destroy() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    if (this._pulseTween) {
      this._pulseTween.stop();
      this._pulseTween = null;
    }
  }
}
