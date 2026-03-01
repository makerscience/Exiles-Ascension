// StatsPanel — modal overlay showing all player stats in one place.
// Toggle via STATS button or C key. Two-column layout: base/combat left, economy/progression right.

import ModalPanel from './ModalPanel.js';
import { EVENTS } from '../events.js';
import { PRESTIGE, STANCES, LAYOUT } from '../config.js';
import Store from '../systems/Store.js';
import TerritoryManager from '../systems/TerritoryManager.js';
import * as ComputedStats from '../systems/ComputedStats.js';
import { format } from '../systems/BigNum.js';

const PANEL_W = 720;
const PANEL_H = 480;
const ICON_SIZE = 128;

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
  }

  _getTitle() { return 'CHARACTER STATS'; }

  _getEvents() {
    return [
      EVENTS.PROG_LEVEL_UP, EVENTS.UPG_PURCHASED, EVENTS.TERRITORY_CLAIMED,
      EVENTS.STATE_CHANGED, EVENTS.SAVE_LOADED, EVENTS.PRESTIGE_PERFORMED,
      EVENTS.INV_ITEM_EQUIPPED, EVENTS.INV_ITEM_SOLD, EVENTS.STANCE_CHANGED,
    ];
  }

  _createStaticContent() {
    // Separator between columns
    this._sepLine = this.scene.add.rectangle(this._cx, this._cy, 1, PANEL_H - 30, 0x444444);
    this._modalObjects.push(this._sepLine);
  }

  _buildContent() {
    const state = Store.getState();
    const leftX = this._cx - PANEL_W / 2 + 20;
    const rightX = this._cx + 14;

    // Left column — BASE STATS + COMBAT
    let y = this._cy - PANEL_H / 2 + 50;
    y = this._renderSection(leftX, y, 'BASE STATS', this._getBaseStatRows(state));
    y += 8;
    this._renderSection(leftX, y, 'COMBAT', this._getCombatRows());

    // Right column — ECONOMY + PROGRESSION
    y = this._cy - PANEL_H / 2 + 50;
    y = this._renderSection(rightX, y, 'ECONOMY', this._getEconomyRows(state));
    y += 8;
    this._renderSection(rightX, y, 'PROGRESSION', this._getProgressionRows(state));
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
      fontFamily: 'monospace', fontSize: '13px', color: '#818cf8',
    });
    this._dynamicObjects.push(header);
    y += 22;

    for (const row of rows) {
      const label = this.scene.add.text(x + 4, y, row.label, {
        fontFamily: 'monospace', fontSize: '11px', color: '#a1a1aa',
      });
      this._dynamicObjects.push(label);

      const value = this.scene.add.text(x + 100, y, row.value, {
        fontFamily: 'monospace', fontSize: '11px', color: '#ffffff',
      });
      this._dynamicObjects.push(value);

      const desc = this.scene.add.text(x + 4, y + 14, row.desc, {
        fontFamily: 'monospace', fontSize: '9px', color: '#6b7280',
      });
      this._dynamicObjects.push(desc);

      y += 30;
    }

    return y;
  }
}
