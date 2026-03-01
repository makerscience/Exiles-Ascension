// StatsPanel — modal overlay showing all player stats in one place.
// Toggle via STATS button or C key. Two-column layout: base/combat left, economy/progression right.

import Phaser from 'phaser';
import ModalPanel from './ModalPanel.js';
import { EVENTS, on } from '../events.js';
import { PRESTIGE, STANCES, LAYOUT } from '../config.js';
import Store from '../systems/Store.js';
import TerritoryManager from '../systems/TerritoryManager.js';
import * as ComputedStats from '../systems/ComputedStats.js';
import { format } from '../systems/BigNum.js';

const PANEL_W = 720;
const PANEL_H = 480;
const ICON_SIZE = 128;
const SCROLLBAR_MIN_HANDLE_H = 44;
const LIVE_STATE_REFRESH_KEYS = new Set([
  'all',
  'playerStats',
  'gold',
  'glitchFragments',
  'prestigeCount',
  'prestigeMultiplier',
  'currentStance',
  'equipped',
  'purchasedUpgrades',
  'enhancementLevels',
  'flags',
  'territories',
  'totalKills',
  'areaProgress',
]);
const STATE_REFRESH_THROTTLE_MS = 120;

export default class StatsPanel extends ModalPanel {
  constructor(scene) {
    super(scene, {
      key: 'stats',
      width: PANEL_W,
      height: PANEL_H,
      hotkey: 'C',
      buttonLabel: 'STATS [C]',
      // Left-most bottom-bar icon.
      buttonX: LAYOUT.bottomBar.x + ICON_SIZE / 2,
      buttonIconKey: 'icon_stats_button',
      buttonIconSize: ICON_SIZE,
      buttonColor: '#ffffff',
    });
    this._lastStateRefreshAt = 0;
    // _createStaticContent() is invoked inside super(...), so preserve refs if already created there.
    this._contentContainer ??= null;
    this._viewportRect ??= null;
    this._viewportMaskGfx ??= null;
    this._scrollTrack ??= null;
    this._scrollHandle ??= null;
    this._scrollY ??= 0;
    this._maxScroll ??= 0;
    this._contentTopY ??= 0;
    this._contentBottomY ??= 0;
    this._wheelHandler ??= null;
    this._dragHandler ??= null;

    // Avoid rebuilding this large panel on every combat tick while still keeping key values live.
    this._unsubs.push(on(EVENTS.STATE_CHANGED, ({ changedKeys } = {}) => {
      if (!this._isOpen) return;
      const keys = Array.isArray(changedKeys) ? changedKeys : ['all'];
      const shouldRefresh = keys.some((key) => LIVE_STATE_REFRESH_KEYS.has(key));
      if (!shouldRefresh) return;
      const now = this.scene?.time?.now ?? Date.now();
      if (now - this._lastStateRefreshAt < STATE_REFRESH_THROTTLE_MS) return;
      this._lastStateRefreshAt = now;
      this._refresh();
    }));
  }

  _getTitle() { return 'CHARACTER STATS'; }

  _getEvents() {
    return [
      EVENTS.PROG_LEVEL_UP, EVENTS.UPG_PURCHASED, EVENTS.TERRITORY_CLAIMED,
      EVENTS.SAVE_LOADED, EVENTS.PRESTIGE_PERFORMED,
      EVENTS.INV_ITEM_EQUIPPED, EVENTS.INV_ITEM_SOLD, EVENTS.STANCE_CHANGED,
    ];
  }

  _createStaticContent() {
    // Separator between columns
    this._sepLine = this.scene.add.rectangle(this._cx, this._cy, 1, PANEL_H - 30, 0x444444);
    this._modalObjects.push(this._sepLine);

    const viewportX = this._cx - PANEL_W / 2 + 10;
    const viewportY = this._cy - PANEL_H / 2 + 44;
    const viewportW = PANEL_W - 32;
    const viewportH = PANEL_H - 62;
    this._viewportRect = new Phaser.Geom.Rectangle(viewportX, viewportY, viewportW, viewportH);

    this._contentContainer = this.scene.add.container(0, 0);
    this._modalObjects.push(this._contentContainer);

    this._viewportMaskGfx = this.scene.add.graphics();
    this._viewportMaskGfx.fillStyle(0xffffff, 1);
    this._viewportMaskGfx.fillRect(viewportX, viewportY, viewportW, viewportH);
    this._viewportMaskGfx.setVisible(false);
    this._contentContainer.setMask(this._viewportMaskGfx.createGeometryMask());

    const trackX = this._cx + PANEL_W / 2 - 12;
    this._scrollTrack = this.scene.add.rectangle(trackX, viewportY + viewportH / 2, 6, viewportH, 0x222222)
      .setStrokeStyle(1, 0x4b5563)
      .setInteractive({ useHandCursor: true });
    this._scrollHandle = this.scene.add.rectangle(trackX, viewportY + SCROLLBAR_MIN_HANDLE_H / 2, 10, SCROLLBAR_MIN_HANDLE_H, 0x2563eb)
      .setStrokeStyle(1, 0x93c5fd)
      .setInteractive({ draggable: true, useHandCursor: true });
    this.scene.input.setDraggable(this._scrollHandle);

    this._scrollTrack.on('pointerdown', (pointer) => {
      if (!this._isOpen) return;
      this._setScrollFromPointer(pointer.y);
    });
    this._dragHandler = (pointer, gameObject, _dragX, dragY) => {
      if (!this._isOpen) return;
      if (gameObject !== this._scrollHandle) return;
      this._setScrollFromPointer(dragY);
    };
    this.scene.input.on('drag', this._dragHandler);

    this._wheelHandler = (pointer, _gameObjects, _deltaX, deltaY) => {
      if (!this._isOpen) return;
      if (!this._viewportRect || !Phaser.Geom.Rectangle.Contains(this._viewportRect, pointer.x, pointer.y)) return;
      if (this._maxScroll <= 0) return;
      this._setScroll(this._scrollY + deltaY);
    };
    this.scene.input.on('wheel', this._wheelHandler);

    this._modalObjects.push(this._scrollTrack, this._scrollHandle);
    this._syncScrollUi();
  }

  _buildContent() {
    const previousScroll = this._scrollY;
    const state = Store.getState();
    const leftX = this._cx - PANEL_W / 2 + 20;
    const rightX = this._cx + 14;
    const contentStartY = this._cy - PANEL_H / 2 + 50;

    // Left column — BASE STATS + COMBAT
    let y = contentStartY;
    y = this._renderSection(leftX, y, 'BASE STATS', this._getBaseStatRows(state));
    y += 8;
    const leftBottom = this._renderSection(leftX, y, 'COMBAT', this._getCombatRows());

    // Right column — ECONOMY + PROGRESSION
    let rightY = contentStartY;
    rightY = this._renderSection(rightX, rightY, 'ECONOMY', this._getEconomyRows(state));
    rightY += 8;
    const rightBottom = this._renderSection(rightX, rightY, 'PROGRESSION', this._getProgressionRows(state));

    this._contentTopY = contentStartY;
    this._contentBottomY = Math.max(leftBottom, rightBottom);
    this._recomputeScrollBounds();
    this._setScroll(previousScroll);
  }

  _getBaseStatRows(state) {
    const ps = state.playerStats;
    const stats = ComputedStats.getAllStats();
    const territoryStr = TerritoryManager.getBuffValue('flatStr');

    const strVal = territoryStr > 0
      ? `${stats.effectiveStr}  (${ps.str} + ${territoryStr})`
      : `${ps.str}`;

    return [
      { label: 'LEVEL', value: `${ps.level}`, desc: 'Increases STR, DEF, HP, Regen, and AGI on level up.' },
      { label: 'STR', value: strVal, desc: 'Scales base damage dealt to enemies.' },
      { label: 'DEF', value: `${stats.effectiveDef}`, desc: 'Reduces incoming enemy damage.' },
      { label: 'AGI', value: `${stats.effectiveAgi}`, desc: 'Increases evade rating and dodge chance.' },
      { label: 'HP', value: `${ps.hp}`, desc: 'Base max hit points from levels.' },
      { label: 'REGEN', value: `${ps.regen.toFixed(1)}/s`, desc: 'Base HP regeneration per second.' },
    ];
  }

  _getCombatRows() {
    const stats = ComputedStats.getAllStats();
    const stance = STANCES[stats.currentStance] || STANCES.ruin;
    const atkSpeed = (1000 / stats.autoAttackInterval).toFixed(2);
    const drPct = Math.round(stats.damageReduction * 100);

    return [
      { label: 'STANCE', value: stance.label, desc: `DMG x${stance.damageMult}, SPD x${stance.atkSpeedMult}, DR ${drPct}%.` },
      { label: 'MAX HP', value: format(stats.effectiveMaxHp), desc: 'Base HP + gear HP.' },
      { label: 'HP REGEN', value: `${format(stats.hpRegen)}/s`, desc: 'Flat HP/s from levels + gear.' },
      { label: 'BASE DMG', value: `${Math.floor(stats.baseDamage)}`, desc: 'Effective STR (base + gear).' },
      { label: 'AUTO DMG', value: `${stats.effectiveDamage}`, desc: 'Auto-attack damage per hit (stance-adjusted).' },
      { label: 'CLICK DMG', value: `${stats.clickDamage}`, desc: 'Manual click damage per hit.' },
      { label: 'CRIT %', value: `${(stats.critChance * 100).toFixed(1)}%`, desc: 'Chance each attack is a critical hit.' },
      { label: 'CRIT MULT', value: `${stats.critMultiplier}x`, desc: 'Damage multiplier on critical hits.' },
      { label: 'ATK SPEED', value: `${atkSpeed}/s`, desc: 'Auto-attacks per second (stance-adjusted).' },
      { label: 'DMG REDU', value: `${drPct}%`, desc: 'Incoming damage reduced by stance (Fortress).' },
      { label: 'DODGE', value: `${(stats.dodgeChanceVsDefaultAcc * 100).toFixed(1)}%`, desc: 'Dodge chance vs a baseline 80 enemy accuracy.' },
    ];
  }

  _getEconomyRows(state) {
    const stats = ComputedStats.getAllStats();

    return [
      { label: 'GOLD MULT', value: `x${stats.goldMultiplier.toFixed(2)}`, desc: 'Total gold multiplier from all sources.' },
      { label: 'XP MULT', value: `x${stats.xpMultiplier.toFixed(2)}`, desc: 'Total XP multiplier from all sources.' },
      { label: 'GOLD', value: format(state.gold), desc: 'Spent on upgrades and territories.' },
      { label: 'FRAGMENTS', value: format(state.glitchFragments), desc: 'Used for exploit upgrades.' },
    ];
  }

  _getProgressionRows(state) {
    const ps = state.playerStats;
    const xpPct = ps.xpToNext.gt(0)
      ? ps.xp.div(ps.xpToNext).times(100).toFixed(1) : '0.0';

    const prestigeCount = state.prestigeCount;
    const currentMult = PRESTIGE.multiplierFormula(prestigeCount).toFixed(2);
    const nextMult = PRESTIGE.multiplierFormula(prestigeCount + 1).toFixed(2);
    const conqueredCount = TerritoryManager.getConqueredCount();

    return [
      { label: 'XP', value: `${format(ps.xp)} / ${format(ps.xpToNext)}`, desc: `${xpPct}% to next level.` },
      { label: 'TOTAL KILLS', value: `${state.totalKills}`, desc: 'Enemies defeated this prestige cycle.' },
      { label: 'PRESTIGE', value: `#${prestigeCount} (x${currentMult})`, desc: `Next: x${nextMult}.` },
      { label: 'TERRITORIES', value: `${conqueredCount} conquered`, desc: 'Permanent buffs from the Overworld Map.' },
    ];
  }

  _renderSection(x, y, title, rows) {
    const header = this.scene.add.text(x, y, `-- ${title} --`, {
      fontFamily: 'monospace', fontSize: '15px', color: '#818cf8',
    });
    this._contentContainer.add(header);
    this._dynamicObjects.push(header);
    y += 26;

    for (const row of rows) {
      const label = this.scene.add.text(x + 4, y, row.label, {
        fontFamily: 'monospace', fontSize: '13px', color: '#a1a1aa',
      });
      this._contentContainer.add(label);
      this._dynamicObjects.push(label);

      const value = this.scene.add.text(x + 100, y, row.value, {
        fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
      });
      this._contentContainer.add(value);
      this._dynamicObjects.push(value);

      const desc = this.scene.add.text(x + 4, y + 14, row.desc, {
        fontFamily: 'monospace', fontSize: '11px', color: '#6b7280',
      });
      this._contentContainer.add(desc);
      this._dynamicObjects.push(desc);

      y += 36;
    }

    return y;
  }

  _recomputeScrollBounds() {
    if (!this._viewportRect) return;
    const contentHeight = Math.max(0, this._contentBottomY - this._contentTopY);
    this._maxScroll = Math.max(0, contentHeight - this._viewportRect.height);
    this._syncScrollUi();
  }

  _setScroll(nextScroll) {
    const clamped = Phaser.Math.Clamp(nextScroll || 0, 0, this._maxScroll);
    this._scrollY = clamped;
    if (this._contentContainer) {
      this._contentContainer.y = -clamped;
    }
    this._syncScrollUi();
  }

  _setScrollFromPointer(pointerY) {
    if (!this._viewportRect || !this._scrollHandle || this._maxScroll <= 0) return;
    const trackTop = this._viewportRect.y;
    const trackBottom = this._viewportRect.y + this._viewportRect.height;
    const handleH = this._scrollHandle.displayHeight;
    const minCenter = trackTop + handleH / 2;
    const maxCenter = trackBottom - handleH / 2;
    const centerY = Phaser.Math.Clamp(pointerY, minCenter, maxCenter);
    const usable = Math.max(1, this._viewportRect.height - handleH);
    const ratio = Phaser.Math.Clamp((centerY - minCenter) / usable, 0, 1);
    this._setScroll(ratio * this._maxScroll);
  }

  _syncScrollUi() {
    if (!this._viewportRect || !this._scrollTrack || !this._scrollHandle) return;
    const hasOverflow = this._maxScroll > 0;
    this._scrollTrack.setVisible(hasOverflow);
    this._scrollHandle.setVisible(hasOverflow);
    if (!hasOverflow) return;

    const contentHeight = Math.max(1, this._contentBottomY - this._contentTopY);
    const ratioVisible = Phaser.Math.Clamp(this._viewportRect.height / contentHeight, 0, 1);
    const handleH = Math.max(SCROLLBAR_MIN_HANDLE_H, Math.round(this._viewportRect.height * ratioVisible));
    this._scrollHandle.setSize(10, handleH);
    this._scrollHandle.setDisplaySize(10, handleH);

    const trackTop = this._viewportRect.y;
    const minCenter = trackTop + handleH / 2;
    const usable = Math.max(1, this._viewportRect.height - handleH);
    const ratio = this._maxScroll > 0 ? this._scrollY / this._maxScroll : 0;
    this._scrollHandle.y = minCenter + usable * ratio;
  }

  destroy() {
    if (this._wheelHandler) {
      this.scene.input.off('wheel', this._wheelHandler);
      this._wheelHandler = null;
    }
    if (this._dragHandler) {
      this.scene.input.off('drag', this._dragHandler);
      this._dragHandler = null;
    }
    if (this._viewportMaskGfx) {
      this._viewportMaskGfx.destroy();
      this._viewportMaskGfx = null;
    }
    super.destroy();
  }
}
