// TopBar — Gold display + Level label + XP bar.
// Plain class receiving a Phaser scene ref. Owns its Phaser objects and event subs.

import Store from '../systems/Store.js';
import { on, EVENTS } from '../events.js';
import { format } from '../systems/BigNum.js';
import { LAYOUT, COLORS, PRESTIGE } from '../config.js';

export default class TopBar {
  constructor(scene) {
    this.scene = scene;
    this._unsubs = [];
    this._goldHighlightTween = null;
    this._goldHighlightTimer = null;

    const { x, y, w, h } = LAYOUT.topBar;
    const state = Store.getState();

    // Background strip
    this.bg = scene.add.rectangle(x + w / 2, y + h / 2, w, h, COLORS.topBarBg);

    // Currency labels — left side
    const textStyle = { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' };
    const labelY = y + h / 2;

    this.goldText = scene.add.text(20, labelY, '', textStyle).setOrigin(0, 0.5);
    // Prestige counter — between gold and level
    this.prestigeText = scene.add.text(220, labelY, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#f59e0b',
    }).setOrigin(0, 0.5);

    // Level + XP bar — right side
    this.levelText = scene.add.text(w - 280, labelY, '', textStyle).setOrigin(0, 0.5);

    // XP bar
    const xpBarX = w - 180;
    const xpBarW = 160;
    const xpBarH = 12;
    this.xpBarBg = scene.add.rectangle(xpBarX, labelY, xpBarW, xpBarH, COLORS.xpBar.bg).setOrigin(0, 0.5);
    this.xpBarFill = scene.add.rectangle(xpBarX, labelY, xpBarW, xpBarH, COLORS.xpBar.fill).setOrigin(0, 0.5);
    this.xpBarFill.setDisplaySize(0, xpBarH);
    this.xpBarMaxW = xpBarW;

    // Separator line below top bar
    this.separator = scene.add.rectangle(x + w / 2, y + h, w, 1, COLORS.separator);

    // Initial render
    this._refreshGold(state);
    this._refreshPrestige(state);
    this._refreshLevel(state);
    this._refreshXp(state);

    // Subscribe to events
    this._unsubs.push(on(EVENTS.ECON_GOLD_GAINED, () => this._refreshGold(Store.getState(), true)));
    this._unsubs.push(on(EVENTS.PROG_XP_GAINED, () => this._refreshXp(Store.getState())));
    this._unsubs.push(on(EVENTS.PROG_LEVEL_UP, () => {
      const s = Store.getState();
      this._refreshLevel(s);
      this._refreshXp(s);
    }));
    // Refresh on currency spend (no pop — only pops on gain)
    this._unsubs.push(on(EVENTS.STATE_CHANGED, (data) => {
      if (data.changedKeys.includes('gold')) this._refreshGold(Store.getState());
    }));

    this._unsubs.push(on(EVENTS.PRESTIGE_PERFORMED, () => {
      const s = Store.getState();
      this._refreshPrestige(s);
      this._refreshGold(s);
      this._refreshLevel(s);
      this._refreshXp(s);
    }));

    this._unsubs.push(on(EVENTS.SAVE_LOADED, () => {
      const s = Store.getState();
      this._refreshGold(s);
      this._refreshPrestige(s);
      this._refreshLevel(s);
      this._refreshXp(s);
    }));

    this._unsubs.push(on(EVENTS.UI_HIGHLIGHT_GOLD, (payload = {}) => {
      if (payload.active === false) {
        this._stopGoldHighlight();
        return;
      }
      const durationMs = Number(payload.durationMs) || 2200;
      this._startGoldHighlight(durationMs);
    }));
  }

  _refreshGold(state, pop = false) {
    this.goldText.setText(`GOLD ${format(state.gold)}`);
    if (pop) this._popTween(this.goldText);
  }

  _refreshPrestige(state) {
    if (state.prestigeCount === 0) {
      this.prestigeText.setVisible(false);
    } else {
      const mult = PRESTIGE.multiplierFormula(state.prestigeCount);
      this.prestigeText.setText(`P${state.prestigeCount} (x${mult.toFixed(2)})`);
      this.prestigeText.setVisible(true);
    }
  }

  _refreshLevel(state) {
    this.levelText.setText(`Lv.${state.playerStats.level}`);
  }

  _refreshXp(state) {
    const { xp, xpToNext } = state.playerStats;
    const ratio = xpToNext.gt(0) ? xp.div(xpToNext).toNumber() : 0;
    const fillW = Math.max(0, Math.min(1, ratio)) * this.xpBarMaxW;
    this.xpBarFill.setDisplaySize(fillW, 12);
  }

  _popTween(target) {
    this.scene.tweens.add({
      targets: target,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 100,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  _startGoldHighlight(durationMs) {
    this._stopGoldHighlight();
    this.goldText.setColor('#facc15');

    this._goldHighlightTween = this.scene.tweens.add({
      targets: this.goldText,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 220,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this._goldHighlightTimer = this.scene.time.delayedCall(durationMs, () => {
      this._stopGoldHighlight();
    });
  }

  _stopGoldHighlight() {
    if (this._goldHighlightTween) {
      this._goldHighlightTween.stop();
      this._goldHighlightTween = null;
    }
    if (this._goldHighlightTimer) {
      this._goldHighlightTimer.remove(false);
      this._goldHighlightTimer = null;
    }
    this.scene.tweens.killTweensOf(this.goldText);
    this.goldText.setScale(1, 1);
    this.goldText.setColor('#ffffff');
  }

  destroy() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._stopGoldHighlight();
  }
}
