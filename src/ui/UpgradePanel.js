// UpgradePanel - modal overlay for purchasing stat and skill tier upgrades.
// Toggle via SKILLS button or U key.

import ModalPanel from './ModalPanel.js';
import { emit, EVENTS } from '../events.js';
import Store from '../systems/Store.js';
import UpgradeManager from '../systems/UpgradeManager.js';
import CombatEngine from '../systems/CombatEngine.js';
import TerritoryManager from '../systems/TerritoryManager.js';
import { D, format } from '../systems/BigNum.js';
import {
  getBaseDamage, getEffectiveStr, getEffectiveDef, getDodgeChance, getEffectiveMaxHp, getAutoAttackInterval, getGoldMultiplier,
} from '../systems/ComputedStats.js';
import { getUpgradesByGroup, getSkillUpgradesByStance, getUpgrade } from '../data/upgrades.js';
import { FAILED_PURCHASE } from '../data/dialogue.js';
import { makeButton } from './ui-utils.js';
import { COMBAT_V2, LAYOUT, STANCES } from '../config.js';

const PANEL_W = 760;
const PANEL_H = 560;
const ICON_SIZE = 128;

const STANCE_SECTIONS = {
  ruin: { label: 'BREAKER', color: '#fb923c' },
  tempest: { label: 'TEMPEST', color: '#60a5fa' },
  fortress: { label: 'FORTRESS', color: '#a1a1aa' },
};

export default class UpgradePanel extends ModalPanel {
  constructor(scene) {
    super(scene, {
      key: 'upgrade',
      width: PANEL_W,
      height: PANEL_H,
      hotkey: 'U',
      buttonLabel: 'SKILLS [U]',
      // 128px to the right of Stats.
      buttonX: LAYOUT.bottomBar.x + ICON_SIZE / 2 + 128,
      buttonIconKey: 'icon_skills_button',
      buttonIconSize: ICON_SIZE,
      buttonColor: '#ffffff',
    });

    this._lastFailedPurchaseTime = 0;
    this._currentTab = 'stats';
    this._tabStatsBtn = null;
    this._tabSkillsBtn = null;
  }

  _getTitle() { return 'SKILLS'; }

  _getEvents() {
    return [
      EVENTS.UPG_PURCHASED,
      EVENTS.PROG_LEVEL_UP,
      EVENTS.STATE_CHANGED,
      EVENTS.SAVE_LOADED,
      EVENTS.COMBAT_TARGET_CHANGED,
      EVENTS.COMBAT_ENCOUNTER_STARTED,
      EVENTS.COMBAT_ENCOUNTER_ENDED,
    ];
  }

  _createStaticContent() {
    const tabY = this._cy - PANEL_H / 2 + 50;
    this._tabStatsBtn = makeButton(this.scene, this._cx - 62, tabY, 'PASSIVE', {
      onDown: () => this._setTab('stats'),
      fontSize: '12px',
      padding: { x: 10, y: 5 },
    });
    this._tabSkillsBtn = makeButton(this.scene, this._cx + 24, tabY, 'ACTIVE', {
      onDown: () => this._setTab('skills'),
      fontSize: '12px',
      padding: { x: 10, y: 5 },
    });
    this._modalObjects.push(this._tabStatsBtn, this._tabSkillsBtn);
    this._syncTabStyles();
  }

  _setTab(nextTab) {
    if (this._currentTab === nextTab) return;
    this._currentTab = nextTab;
    this._syncTabStyles();
    this._refresh();
  }

  _syncTabStyles() {
    if (!this._tabStatsBtn || !this._tabSkillsBtn) return;
    const statsActive = this._currentTab === 'stats';
    this._tabStatsBtn.setStyle({
      color: statsActive ? '#ffffff' : '#9ca3af',
      backgroundColor: statsActive ? '#2563eb' : '#222222',
    });
    this._tabSkillsBtn.setStyle({
      color: statsActive ? '#9ca3af' : '#ffffff',
      backgroundColor: statsActive ? '#222222' : '#2563eb',
    });
  }

  _buildContent() {
    this._syncTabStyles();
    const state = Store.getState();
    const pointsText = this.scene.add.text(this._cx, this._cy - PANEL_H / 2 + 24, `Skill Points: ${state.skillPoints || 0}`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#22c55e', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this._dynamicObjects.push(pointsText);

    if (this._currentTab === 'stats') {
      this._buildStatsTab(state);
    } else {
      this._buildSkillsTab();
    }
  }

  _buildStatsTab(state) {
    const sep = this.scene.add.rectangle(this._cx, this._cy + 10, 1, PANEL_H - 110, 0x444444);
    this._dynamicObjects.push(sep);

    const leftX = this._cx - PANEL_W / 2 + 20;
    const rightX = this._cx + 20;
    const topY = this._cy - PANEL_H / 2 + 84;

    const legitHeader = this.scene.add.text(leftX, topY - 20, '-- Standard --', {
      fontFamily: 'monospace', fontSize: '13px', color: '#818cf8',
    });
    this._dynamicObjects.push(legitHeader);

    const allStat = getUpgradesByGroup('stat');
    const legit = allStat.filter((u) => u.category === 'legit');
    const exploit = allStat.filter((u) => u.category === 'exploit');

    this._renderUpgradeColumn(legit, leftX, topY);

    if (state.flags.crackTriggered) {
      const exploitHeader = this.scene.add.text(rightX, topY - 20, '-- Exploits --', {
        fontFamily: 'monospace', fontSize: '13px', color: '#ef4444',
      });
      this._dynamicObjects.push(exploitHeader);
      this._renderUpgradeColumn(exploit, rightX, topY);
    }
  }

  _buildSkillsTab() {
    const leftX = this._cx - PANEL_W / 2 + 20;
    const rightX = this._cx + 20;
    const startY = this._cy - PANEL_H / 2 + 84;

    let leftY = this._renderSkillSection('ruin', leftX, startY);
    leftY += 14;
    this._renderSkillSection('fortress', leftX, leftY);

    this._renderSkillSection('tempest', rightX, startY);
  }

  _renderUpgradeColumn(upgrades, startX, startY) {
    let y = startY;

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

      const insight = this._getPassiveUpgradeInsight(upgrade.id);
      if (insight) {
        const insightText = this.scene.add.text(startX, y + 30, insight, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#93c5fd',
        });
        this._dynamicObjects.push(insightText);
      }

      if (!isMaxed) {
        let costStr = `${cost} Fragments`;
        if (upgrade.currency === 'gold') costStr = `${cost} Gold`;
        if (upgrade.currency === 'skillPoints') costStr = `${cost} SP`;
        const buyColor = canBuy ? '#22c55e' : '#555555';
        const buyBg = canBuy ? '#333333' : '#222222';

        const buyBtn = makeButton(this.scene, startX + 262, y + 4, `[BUY] ${costStr}`, {
          color: buyColor,
          bg: buyBg,
          hoverBg: '#555555',
          onDown: () => this._tryPurchase(upgrade.id),
        });
        this._dynamicObjects.push(buyBtn);
      } else {
        const maxLabel = this.scene.add.text(startX + 262, y + 4, 'MAXED', {
          fontFamily: 'monospace', fontSize: '11px', color: '#555555',
        });
        this._dynamicObjects.push(maxLabel);
      }

      y += insight ? 64 : 50;
    }
  }

  _getPassiveUpgradeInsight(upgradeId) {
    if (this._currentTab !== 'stats') return null;
    switch (upgradeId) {
      case 'sharpen_blade':
        return `Current click dmg: ${this._formatCompact(this._getLiveClickDamage())}`;
      case 'battle_hardening': {
        const str = getEffectiveStr();
        const now = COMBAT_V2.playerDamage(str, 0);
        const next = COMBAT_V2.playerDamage(str + 2, 0);
        const gain = next - now;
        return `STR: ${this._formatCompact(str)} | +1 Lv adds +${this._formatCompact(gain)} neutral dmg`;
      }
      case 'defensive_drills': {
        const def = getEffectiveDef();
        const blocked = def * 0.5;
        return `DEF: ${this._formatCompact(def)} | Blocks ~${this._formatCompact(blocked)} dmg (pre-floor/pen)`;
      }
      case 'agility_drills': {
        const dodge = getDodgeChance(80) * 100;
        return `Dodge vs ACC 80: ${dodge.toFixed(1)}%`;
      }
      case 'endurance_training':
        return `Current Max HP: ${format(getEffectiveMaxHp())}`;
      case 'auto_attack_speed': {
        const intervalMs = getAutoAttackInterval();
        const aps = 1000 / Math.max(1, intervalMs);
        return `Auto rate: ${intervalMs} ms/hit (${aps.toFixed(2)} atk/s)`;
      }
      case 'gold_find':
        return `Current gold mult: x${getGoldMultiplier().toFixed(2)}`;
      default:
        return null;
    }
  }

  _getLiveClickDamage() {
    const state = Store.getState();
    const target = CombatEngine.getTargetMember?.() || null;
    const enemyDef = target?.defense ?? 0;
    const raw = COMBAT_V2.playerDamage(getBaseDamage(), enemyDef);
    const clickMult = UpgradeManager.getMultiplier('clickDamage');
    const stance = STANCES[state.currentStance] || STANCES.ruin;
    const vulnerabilityMult = 1 + (target?._smashVulnerabilityMult || 0);

    let damage = D(raw)
      .times(clickMult)
      .times(state.prestigeMultiplier)
      .times(TerritoryManager.getBuffMultiplier('baseDamage'))
      .times(stance.damageMult)
      .times(vulnerabilityMult)
      .times(COMBAT_V2.clickDamageScalar);

    if (target?.armor?.reduction) {
      const shred = target?._armorShredPercent || 0;
      const reduction = Math.max(0, target.armor.reduction * (1 - shred));
      const mult = Math.max(0, 1 - reduction);
      damage = D(Math.max(1, damage.times(mult).floor().toNumber()));
    }

    return damage.toNumber();
  }

  _formatCompact(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    if (Math.abs(n) >= 1000) return format(D(n));
    if (Math.abs(n) >= 100) return Math.round(n).toString();
    if (Math.abs(n) >= 10) return n.toFixed(1).replace(/\.0$/, '');
    return n.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  }

  _renderSkillSection(stanceId, startX, startY) {
    const meta = STANCE_SECTIONS[stanceId];
    const sectionHeader = this.scene.add.text(startX, startY, `-- ${meta.label} --`, {
      fontFamily: 'monospace', fontSize: '13px', color: meta.color,
    });
    this._dynamicObjects.push(sectionHeader);

    let y = startY + 22;
    const upgrades = getSkillUpgradesByStance(stanceId).filter((u) => UpgradeManager.isVisible(u.id));

    for (const upgrade of upgrades) {
      const level = UpgradeManager.getLevel(upgrade.id);
      const isOwned = level >= upgrade.maxLevel;
      const reqMet = !upgrade.requires || UpgradeManager.hasUpgrade(upgrade.requires);
      const canBuy = !isOwned && reqMet && UpgradeManager.canPurchase(upgrade.id);
      const tier = this._getTierFromId(upgrade.id);

      const nameColor = isOwned ? '#22c55e' : reqMet ? '#ffffff' : '#6b7280';
      const nameText = this.scene.add.text(startX, y, `[${tier}] ${upgrade.name}`, {
        fontFamily: 'monospace', fontSize: '12px', color: nameColor,
      });
      this._dynamicObjects.push(nameText);

      const descText = this.scene.add.text(startX, y + 14, upgrade.description, {
        fontFamily: 'monospace', fontSize: '9px', color: '#888888',
      });
      this._dynamicObjects.push(descText);

      if (isOwned) {
        const ownedLabel = this.scene.add.text(startX + 268, y + 2, 'OWNED', {
          fontFamily: 'monospace', fontSize: '10px', color: '#22c55e',
        });
        this._dynamicObjects.push(ownedLabel);
      } else if (!reqMet) {
        const reqName = getUpgrade(upgrade.requires)?.name || upgrade.requires;
        const reqLabel = this.scene.add.text(startX + 188, y + 2, `Requires: ${reqName}`, {
          fontFamily: 'monospace', fontSize: '9px', color: '#6b7280',
        });
        this._dynamicObjects.push(reqLabel);
      } else {
        const buyBtn = makeButton(this.scene, startX + 248, y + 2, '[BUY] 1 SP', {
          color: canBuy ? '#22c55e' : '#555555',
          bg: canBuy ? '#333333' : '#222222',
          hoverBg: '#555555',
          fontSize: '10px',
          padding: { x: 5, y: 2 },
          onDown: () => this._tryPurchase(upgrade.id),
        });
        this._dynamicObjects.push(buyBtn);
      }

      y += 36;
    }

    return y;
  }

  _getTierFromId(upgradeId) {
    const m = /_t(\d+)$/.exec(upgradeId);
    return m ? `T${m[1]}` : 'T?';
  }

  _tryPurchase(upgradeId) {
    if (UpgradeManager.canPurchase(upgradeId)) {
      UpgradeManager.purchase(upgradeId);
      return;
    }

    const now = Date.now();
    if (now - this._lastFailedPurchaseTime < 10000) return;
    this._lastFailedPurchaseTime = now;
    const line = FAILED_PURCHASE[Math.floor(Math.random() * FAILED_PURCHASE.length)];
    emit(EVENTS.DIALOGUE_QUEUED, { text: line, emotion: 'sarcastic', context: 'Insufficient funds' });
  }
}
