// UpgradePanel - modal overlay for purchasing stat and skill tier upgrades.
// Toggle via SKILLS button or U key.

import Phaser from 'phaser';
import ModalPanel from './ModalPanel.js';
import { emit, on, EVENTS } from '../events.js';
import Store from '../systems/Store.js';
import UpgradeManager from '../systems/UpgradeManager.js';
import CombatEngine from '../systems/CombatEngine.js';
import TerritoryManager from '../systems/TerritoryManager.js';
import { D, format } from '../systems/BigNum.js';
import {
  getBaseDamage, getEffectiveMaxHp, getAutoAttackInterval, getGoldMultiplier,
} from '../systems/ComputedStats.js';
import { getUpgradesByGroup, getSkillUpgradesByStance, getUpgrade } from '../data/upgrades.js';
import { FAILED_PURCHASE } from '../data/dialogue.js';
import { makeButton } from './ui-utils.js';
import { COMBAT_V2, LAYOUT, STANCES } from '../config.js';

const PANEL_W = 760;
const PANEL_H = 560;
const ICON_SIZE = 128;
const SCROLLBAR_MIN_HANDLE_H = 44;

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
    this._currentTab = 'skills';
    this._tabStatsBtn = null;
    this._tabSkillsBtn = null;
    this._tabStatsText = null;
    this._tabSkillsText = null;
    this._skillsPulseTween = null;
    this._skillsBtnBaseScaleX = this._toggleBtn?.scaleX ?? 1;
    this._skillsBtnBaseScaleY = this._toggleBtn?.scaleY ?? 1;
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
    this._respecConfirmPending = false;

    // Pulse SKILLS toggle when unspent SP is available.
    this._unsubs.push(on(EVENTS.STATE_CHANGED, ({ changedKeys } = {}) => {
      if (!Array.isArray(changedKeys) || changedKeys.includes('all') || changedKeys.includes('skillPoints')) {
        this._syncSkillsButtonPulse();
      }
    }));
    this._unsubs.push(on(EVENTS.SAVE_LOADED, () => this._syncSkillsButtonPulse()));
    this._syncSkillsButtonPulse();
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
    if (this._title) {
      this._title.setY(this._title.y - 7);
    }
    const viewportX = this._cx - PANEL_W / 2 + 10;
    const viewportY = this._cy - PANEL_H / 2 + 84;
    const viewportW = PANEL_W - 32;
    const viewportH = PANEL_H - 106;
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

    this._dragHandler = (_pointer, gameObject, _dragX, dragY) => {
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
    // Tab controls are created in _buildContent() so their visual state is rebuilt deterministically.
  }

  _open() {
    this._respecConfirmPending = false;
    this._currentTab = 'skills';
    super._open();
  }

  _close() {
    this._respecConfirmPending = false;
    super._close();
  }

  _setTab(nextTab) {
    if (this._currentTab === nextTab) return;
    this._currentTab = nextTab;
    this._setScroll(0);
    this._refresh();
  }

  _buildTabControls() {
    const tabY = this._cy - PANEL_H / 2 + 64;
    const tabW = 104;
    const tabH = 28;
    const statsCx = this._cx - 58;
    const skillsCx = this._cx + 58;
    const statsActive = this._currentTab === 'stats';

    const statsBg = this.scene.add.rectangle(statsCx, tabY, tabW, tabH, statsActive ? 0x2563eb : 0x222222)
      .setStrokeStyle(1, 0x4b5563)
      .setInteractive({ useHandCursor: true });
    const skillsBg = this.scene.add.rectangle(skillsCx, tabY, tabW, tabH, statsActive ? 0x222222 : 0x2563eb)
      .setStrokeStyle(1, 0x4b5563)
      .setInteractive({ useHandCursor: true });

    const statsText = this.scene.add.text(statsCx, tabY, 'PASSIVE', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: statsActive ? '#ffffff' : '#9ca3af',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const skillsText = this.scene.add.text(skillsCx, tabY, 'ACTIVE', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: statsActive ? '#9ca3af' : '#ffffff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const onStats = () => this._setTab('stats');
    const onSkills = () => this._setTab('skills');
    statsBg.on('pointerdown', onStats);
    statsText.on('pointerdown', onStats);
    skillsBg.on('pointerdown', onSkills);
    skillsText.on('pointerdown', onSkills);

    this._dynamicObjects.push(statsBg, skillsBg, statsText, skillsText);
    this._tabStatsBtn = statsBg;
    this._tabSkillsBtn = skillsBg;
    this._tabStatsText = statsText;
    this._tabSkillsText = skillsText;
  }

  _buildContent() {
    const previousScroll = this._scrollY;
    this._buildTabControls();
    const state = Store.getState();
    const pointsText = this.scene.add.text(this._cx, this._cy - PANEL_H / 2 + 24, `Skill Points: ${state.skillPoints || 0}`, {
      fontFamily: 'monospace', fontSize: '15px', color: '#22c55e', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this._dynamicObjects.push(pointsText);
    this._buildRespecControls(state);

    const scrollStartIdx = this._dynamicObjects.length;
    let contentBottom = this._cy - PANEL_H / 2 + 84;
    if (this._currentTab === 'stats') {
      contentBottom = this._buildStatsTab(state);
    } else {
      contentBottom = this._buildSkillsTab();
    }

    this._mountScrollableObjects(scrollStartIdx);
    this._contentTopY = this._cy - PANEL_H / 2 + 84;
    this._contentBottomY = contentBottom;
    this._recomputeScrollBounds();
    this._setScroll(previousScroll);
  }

  _buildRespecControls(state) {
    if (!UpgradeManager.isSkillRespecUnlocked(state)) return;
    const level = state.playerStats?.level || 1;

    const cost = UpgradeManager.getSkillRespecCost(level);
    const refund = UpgradeManager.getSkillRespecRefundPoints();
    const canRespec = UpgradeManager.canRespecSkills();
    const rightX = this._cx + PANEL_W / 2 - 18;
    const topY = this._cy - PANEL_H / 2 + 24;

    const costLabel = this.scene.add.text(rightX, topY, `Respec: ${format(D(cost))}g`, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: canRespec ? '#facc15' : '#888888',
    }).setOrigin(1, 0);
    const refundLabel = this.scene.add.text(rightX, topY + 12, `Refund: ${refund} SP`, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: refund > 0 ? '#93c5fd' : '#6b7280',
    }).setOrigin(1, 0);
    this._dynamicObjects.push(costLabel, refundLabel);

    if (!this._respecConfirmPending) {
      const btn = makeButton(this.scene, rightX - 92, topY + 24, 'RESPEC', {
        color: canRespec ? '#f8fafc' : '#666666',
        bg: canRespec ? '#7f1d1d' : '#222222',
        hoverBg: canRespec ? '#991b1b' : '#222222',
        fontSize: '12px',
        padding: { x: 10, y: 4 },
        onDown: () => {
          if (!canRespec) return;
          this._respecConfirmPending = true;
          this._refresh();
        },
      }).setOrigin(1, 0);
      this._dynamicObjects.push(btn);
      return;
    }

    const confirmBtn = makeButton(this.scene, rightX - 156, topY + 24, 'CONFIRM', {
      color: canRespec ? '#fef2f2' : '#666666',
      bg: canRespec ? '#991b1b' : '#222222',
      hoverBg: canRespec ? '#b91c1c' : '#222222',
      fontSize: '12px',
      padding: { x: 8, y: 4 },
      onDown: () => {
        if (!canRespec) return;
        if (!UpgradeManager.respecSkills()) return;
        this._respecConfirmPending = false;
        this._refresh();
      },
    }).setOrigin(1, 0);
    const cancelBtn = makeButton(this.scene, rightX - 68, topY + 24, 'CANCEL', {
      color: '#e5e7eb',
      bg: '#374151',
      hoverBg: '#4b5563',
      fontSize: '12px',
      padding: { x: 8, y: 4 },
      onDown: () => {
        this._respecConfirmPending = false;
        this._refresh();
      },
    }).setOrigin(1, 0);
    this._dynamicObjects.push(confirmBtn, cancelBtn);
  }

  _buildStatsTab(state) {
    const leftX = this._cx - PANEL_W / 2 + 20;
    const rightX = this._cx + 20;
    const topY = this._cy - PANEL_H / 2 + 84;

    const legitHeader = this.scene.add.text(leftX, topY - 20, '-- Standard --', {
      fontFamily: 'monospace', fontSize: '15px', color: '#818cf8',
    });
    this._dynamicObjects.push(legitHeader);

    const allStat = getUpgradesByGroup('stat');
    const legit = allStat.filter((u) => u.category === 'legit' && UpgradeManager.isVisible(u.id));
    const exploit = allStat.filter((u) => u.category === 'exploit' && UpgradeManager.isVisible(u.id));

    const leftBottom = this._renderUpgradeColumn(legit, leftX, topY);
    let rightBottom = topY;

    if (state.flags.crackTriggered) {
      const exploitHeader = this.scene.add.text(rightX, topY - 20, '-- Exploits --', {
        fontFamily: 'monospace', fontSize: '15px', color: '#ef4444',
      });
      this._dynamicObjects.push(exploitHeader);
      rightBottom = this._renderUpgradeColumn(exploit, rightX, topY);
    }

    return Math.max(leftBottom, rightBottom);
  }

  _buildSkillsTab() {
    const leftX = this._cx - PANEL_W / 2 + 20;
    const rightX = this._cx + 20;
    const startY = this._cy - PANEL_H / 2 + 84;

    let leftY = this._renderSkillSection('ruin', leftX, startY);
    leftY += 14;
    const leftBottom = this._renderSkillSection('fortress', leftX, leftY);

    const rightBottom = this._renderSkillSection('tempest', rightX, startY);
    return Math.max(leftBottom, rightBottom);
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
        fontFamily: 'monospace', fontSize: '14px',
        color: upgrade.category === 'exploit' ? '#ef4444' : '#ffffff',
      });
      this._dynamicObjects.push(nameText);

      const descText = this.scene.add.text(startX, y + 18, upgrade.description, {
        fontFamily: 'monospace', fontSize: '12px', color: '#888888',
      });
      this._dynamicObjects.push(descText);

      const insight = this._getPassiveUpgradeInsight(upgrade.id);
      if (insight) {
        const insightText = this.scene.add.text(startX, y + 36, insight, {
          fontFamily: 'monospace',
          fontSize: '11px',
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

        const buyBtn = makeButton(this.scene, startX + 262, y - 1, `[BUY] ${costStr}`, {
          color: buyColor,
          bg: buyBg,
          hoverBg: '#555555',
          onDown: () => this._tryPurchase(upgrade.id),
        });
        this._dynamicObjects.push(buyBtn);
      } else {
        const maxLabel = this.scene.add.text(startX + 262, y + 4, 'MAXED', {
          fontFamily: 'monospace', fontSize: '13px', color: '#555555',
        });
        this._dynamicObjects.push(maxLabel);
      }

      y += insight ? 72 : 56;
    }

    return y;
  }

  _getPassiveUpgradeInsight(upgradeId) {
    if (this._currentTab !== 'stats') return null;
    switch (upgradeId) {
      case 'sharpen_blade':
        return `Current click dmg: ${this._formatCompact(this._getLiveClickDamage())}`;
      case 'bigger_swigs': {
        const level = UpgradeManager.getLevel('bigger_swigs');
        const perLevel = getUpgrade('bigger_swigs')?.effect?.valuePerLevel || 0.20;
        const bonusPct = level * perLevel * 100;
        return `Current bonus: ${bonusPct.toFixed(0)}%`;
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
      fontFamily: 'monospace', fontSize: '15px', color: meta.color,
    });
    this._dynamicObjects.push(sectionHeader);

    let y = startY + 26;
    const upgrades = getSkillUpgradesByStance(stanceId).filter((u) => UpgradeManager.isVisible(u.id));

    for (const upgrade of upgrades) {
      const level = UpgradeManager.getLevel(upgrade.id);
      const isOwned = level >= upgrade.maxLevel;
      const reqMet = !upgrade.requires || UpgradeManager.hasUpgrade(upgrade.requires);
      const canBuy = !isOwned && reqMet && UpgradeManager.canPurchase(upgrade.id);
      const tier = this._getTierFromId(upgrade.id);

      const nameColor = isOwned ? '#22c55e' : reqMet ? '#ffffff' : '#6b7280';
      const nameText = this.scene.add.text(startX, y, `[${tier}] ${upgrade.name}`, {
        fontFamily: 'monospace', fontSize: '14px', color: nameColor,
      });
      this._dynamicObjects.push(nameText);

      const descText = this.scene.add.text(startX, y + 18, upgrade.description, {
        fontFamily: 'monospace', fontSize: '11px', color: '#888888',
      });
      this._dynamicObjects.push(descText);

      if (isOwned) {
        const ownedLabel = this.scene.add.text(startX + 268, y + 2, 'OWNED', {
          fontFamily: 'monospace', fontSize: '12px', color: '#22c55e',
        });
        this._dynamicObjects.push(ownedLabel);
      } else if (!reqMet) {
        const reqName = getUpgrade(upgrade.requires)?.name || upgrade.requires;
        const reqLabel = this.scene.add.text(startX + 188, y + 2, `Requires: ${reqName}`, {
          fontFamily: 'monospace', fontSize: '11px', color: '#6b7280',
        });
        this._dynamicObjects.push(reqLabel);
      } else {
        const buyBtn = makeButton(this.scene, startX + 248, y - 3, '[BUY] 1 SP', {
          color: canBuy ? '#22c55e' : '#555555',
          bg: canBuy ? '#333333' : '#222222',
          hoverBg: '#555555',
          fontSize: '12px',
          padding: { x: 5, y: 2 },
          onDown: () => this._tryPurchase(upgrade.id),
        });
        this._dynamicObjects.push(buyBtn);
      }

      y += 44;
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

  _syncSkillsButtonPulse() {
    if (!this._toggleBtn) return;
    const shouldPulse = (Store.getState().skillPoints || 0) > 0;
    if (shouldPulse) {
      if (this._skillsPulseTween) return;
      this._toggleBtn.setScale(this._skillsBtnBaseScaleX, this._skillsBtnBaseScaleY);
      this._skillsPulseTween = this.scene.tweens.add({
        targets: this._toggleBtn,
        scaleX: this._skillsBtnBaseScaleX * 1.10,
        scaleY: this._skillsBtnBaseScaleY * 1.10,
        duration: 650,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
      return;
    }
    this._stopSkillsButtonPulse();
  }

  _stopSkillsButtonPulse() {
    if (this._skillsPulseTween) {
      this._skillsPulseTween.stop();
      this._skillsPulseTween = null;
    }
    if (this._toggleBtn) {
      this.scene.tweens.killTweensOf(this._toggleBtn);
      this._toggleBtn.setScale(this._skillsBtnBaseScaleX, this._skillsBtnBaseScaleY);
    }
  }

  _mountScrollableObjects(startIdx) {
    if (!this._contentContainer) return;
    for (let i = startIdx; i < this._dynamicObjects.length; i++) {
      const obj = this._dynamicObjects[i];
      if (!obj || obj.parentContainer === this._contentContainer) continue;
      this._contentContainer.add(obj);
    }
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
    this._stopSkillsButtonPulse();
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
