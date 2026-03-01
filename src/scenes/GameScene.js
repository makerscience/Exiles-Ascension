// GameScene â€” Phaser scene rendering combat. Layout on 1280x720 canvas.

import Phaser from 'phaser';
import CombatEngine from '../systems/CombatEngine.js';
import TimeEngine from '../systems/TimeEngine.js';
import Store from '../systems/Store.js';
import { on, EVENTS } from '../events.js';
import { format } from '../systems/BigNum.js';
import { UI, LAYOUT, ZONE_THEMES, COMBAT_V2, PARALLAX, TREE_ROWS, FERN_ROWS, STANCES } from '../config.js';
import { getEnemyById } from '../data/enemies.js';
import { getActiveArmorSet, ARMOR_SETS } from '../config/playerSprites.js';
import { FEATURES } from '../config/features.js';
import { parseStackKey } from '../systems/InventorySystem.js';
import MusicManager from '../systems/MusicManager.js';

const PLAYER_X_RATIO = 200 / 960;
const ENEMY_X_RATIO = 700 / 960;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this._unsubs = [];
    this._parallaxLayers = [];
    this._treeLayers = [];
    this._fernLayers = [];
  }

  create() {
    const ga = LAYOUT.gameArea;
    this._playerX = ga.x + Math.round(ga.w * PLAYER_X_RATIO);
    const playerX = this._playerX;
    this._enemyX = ga.x + Math.round(ga.w * ENEMY_X_RATIO);
    this._combatY = ga.y + ga.h - 225;
    this._enemyY = this._combatY + 40;

    // Create parallax background first (lowest depth) — keyed on area, not zone
    this._createParallax(Store.getState().currentArea);

    // Active armor set (swaps when all 5 combat slots have a2_ items)
    this._armorSet = getActiveArmorSet(Store.getState().equipped, parseStackKey);

    // Player attack pose config (from armor set)
    this._playerAttackSprites = [...this._armorSet.attackSprites];
    this._lastAttackSprite = null;
    this._playerPoseTimer = null;
    this._playerAttacking = false; // true while attack pose is held (blocks hit reaction)
    this._hitReacting = false;     // true while hit reaction pose is held (blocks attacks)
    this._powerCharging = false;  // true when showing charge-up sprite at 50%
    this._skillVisualLockUntil = 0; // skill visuals override other player pose changes while active

    // Player HP bar + name above player head
    this._hpBarY = this._combatY - 375 / 2 - 16;
    this._nameLabelY = this._hpBarY - 18;

    // Player walk animation (per-stance frames)
    this._defaultWalkFrames = [...this._armorSet.walkFrames];
    this._fortressWalkFrames = [...this._armorSet.fortressWalkFrames];
    this._walkFrames = this._defaultWalkFrames;
    this._walkIndex = 0;

    // Player shadow (ellipse at feet)
    if (FEATURES.shadowsEnabled) {
      this._playerShadow = this.add.ellipse(playerX, this._combatY + 375 / 2 - 50, 100, 24, 0x000000, 0.3);
    }

    // Player sprite — start with first walk frame
    this.playerRect = this.add.image(playerX, this._combatY, this._armorSet.walkFrames[0]);
    this.playerRect.setDisplaySize(300, 375);
    this._bulwarkVisual = this.add.image(playerX, this._combatY, 'bulwarkvisual');
    this._bulwarkVisual.setVisible(false);
    this._bulwarkVisual.setAlpha(0.92);
    this._bulwarkVisual.setDepth((this.playerRect.depth ?? 0) + 1);
    this._bulwarkAnchorX = this._playerX + 110;
    this._bulwarkAnchorY = this._combatY - 26;
    const bulwarkFrameW = this._bulwarkVisual.frame?.cutWidth || 323;
    const bulwarkFrameH = this._bulwarkVisual.frame?.cutHeight || 763;
    this._bulwarkVisualBaseH = 225;
    this._bulwarkVisualBaseW = this._bulwarkVisualBaseH * (bulwarkFrameW / bulwarkFrameH);
    this._bulwarkVisualDurationMs = 0;
    this._bulwarkVisualEndAt = 0;
    this._bulwarkBreakFx = [];
    this._lastShieldHp = 0;
    this._bulwarkShakeTween = null;
    this._syncBulwarkVisual();

    // Looping walk cycle timer (~150ms per frame)
    this._walkTimer = this.time.addEvent({
      delay: 450,
      loop: true,
      callback: () => {
        // Hold pose until current animation finishes
        if (this._powerCharging || this._hitReacting || this._playerAttacking) return;

        this._walkIndex = (this._walkIndex + 1) % this._walkFrames.length;
        const key = this._walkFrames[this._walkIndex];
        this.playerRect.setTexture(key);

        const scale = (this._armorSet.scaleOverrides && this._armorSet.scaleOverrides[key])
          || (this._armorSet.largeFrames.includes(key) ? 1.05 : 1);
        this.playerRect.setDisplaySize(300 * scale, 375 * scale);
        this.playerRect.y = this._combatY;
      },
    });
    this.playerNameText = this.add.text(playerX, this._nameLabelY, 'Player', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    // Player HP bar
    this.playerHpBarBg = this.add.rectangle(playerX, this._hpBarY, 100, 8, 0x374151).setStrokeStyle(2, 0x000000);
    this.playerHpBarFill = this.add.rectangle(playerX - 50, this._hpBarY, 100, 8, 0x22c55e);
    this.playerHpBarFill.setOrigin(0, 0.5);

    // Stance indicator (left of HP bar)
    this._stanceIcon = this.add.text(playerX - 60, this._hpBarY, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(1, 0.5);

    // Attack charge bar (visible in ruin stance only)
    this._chargeBarY = this._hpBarY + 12;
    this._chargeBarBg = this.add.rectangle(playerX, this._chargeBarY, 100, 6, 0x374151).setStrokeStyle(2, 0x000000).setVisible(false);
    this._chargeBarFill = this.add.rectangle(playerX - 50, this._chargeBarY, 100, 6, 0xef4444);
    this._chargeBarFill.setOrigin(0, 0.5).setDisplaySize(0, 6).setVisible(false);

    // Shield HP bar (hidden until Bulwark activated)
    this._shieldBarY = this._hpBarY + 24;
    this._shieldMaxHp = 0;
    this.shieldBarBg = this.add.rectangle(playerX, this._shieldBarY, 100, 8, 0x1e3a5f).setStrokeStyle(2, 0x000000).setVisible(false);
    this.shieldBarFill = this.add.rectangle(playerX - 50, this._shieldBarY, 100, 8, 0x3b82f6);
    this.shieldBarFill.setOrigin(0, 0.5).setVisible(false);

    // Pre-create encounter slot views (hidden)
    this._enemySlots = [];
    this._attackLockCount = 0;
    for (let i = 0; i < COMBAT_V2.maxEncounterSize; i++) {
      const container = this.add.container(this._enemyX, this._enemyY);
      container.setVisible(false);

      // Shadow ellipse (at feet, behind sprite)
      const shadow = FEATURES.shadowsEnabled
        ? this.add.ellipse(0, 250 / 2 - 10, 80, 20, 0x000000, 0.3)
        : null;
      if (shadow) container.add(shadow);

      // Enemy rect fallback (centered in container at 0,0)
      const rect = this.add.rectangle(0, 0, 200, 250, 0xef4444);
      rect.setVisible(false);
      container.add(rect);

      // Enemy sprite (centered in container at 0,0)
      const sprite = this.add.image(0, 0, '__DEFAULT');
      sprite.setVisible(false);
      container.add(sprite);

      // Click handlers — target + attack on click
      const slotIndex = i;
      const onClick = () => {
        const s = this._enemySlots[slotIndex];
        if (s?.state?.instanceId) {
          CombatEngine.setTarget(s.state.instanceId);
          CombatEngine.playerAttack(true);
        }
      };
      rect.on('pointerdown', onClick);
      sprite.on('pointerdown', onClick);

      // Name label (above slot, relative to container)
      const nameText = this.add.text(0, -(250 / 2) - 60, '', {
        fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5);
      container.add(nameText);

      // HP bar background
      const hpBarBg = this.add.rectangle(0, -(250 / 2) - 42, 100, 8, 0x374151).setStrokeStyle(2, 0x000000);
      container.add(hpBarBg);

      // HP bar fill (left-anchored)
      const hpBarFill = this.add.rectangle(-50, -(250 / 2) - 42, 100, 8, 0x22c55e);
      hpBarFill.setOrigin(0, 0.5);
      container.add(hpBarFill);

      // Enemy attack charge bar (below HP bar, hidden by default)
      const chargeBarBg = this.add.rectangle(0, -(250 / 2) - 32, 100, 4, 0x374151).setStrokeStyle(1, 0x000000).setVisible(false);
      container.add(chargeBarBg);
      const chargeBarFill = this.add.rectangle(-50, -(250 / 2) - 32, 100, 4, 0xef4444);
      chargeBarFill.setOrigin(0, 0.5).setDisplaySize(0, 4).setVisible(false);
      container.add(chargeBarFill);
      const castText = this.add.text(0, -(250 / 2) - 42, '', {
        fontFamily: 'monospace', fontSize: '12px', color: '#93c5fd',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setVisible(false);
      container.add(castText);

      this._enemySlots.push({
        container,
        shadow,
        sprite,
        rect,
        hpBarBg,
        hpBarFill,
        chargeBarBg,
        chargeBarFill,
        castText,
        nameText,
        traitObjs: [],
        targetIndicator: null,
        state: {
          instanceId: null,
          enemyId: null,
          currentSprites: null,
          spriteW: 200,
          spriteH: 250,
          spriteOffsetY: 0,
          bottomAlignOffsetY: 0,
          lungeDist: 20,
          poseRevertTimer: null,
          reactDelayTimer: null,
          deathFadeTimer: null,
          extraObjects: [],
          enraged: false,
          dying: false,
          flapTimer: null,
          flapFrame: 0,
          atkTimerKey: null,
          castTimerKey: null,
          castKind: null,
          castDurationMs: 0,
          showAutoChargeBar: false,
        },
        baseX: this._enemyX,
        baseY: this._enemyY,
      });
    }

    // Subscribe to combat events
    this._unsubs.push(on(EVENTS.COMBAT_ENEMY_DAMAGED, (data) => this._onEnemyDamaged(data)));
    this._unsubs.push(on(EVENTS.COMBAT_ENEMY_KILLED, (data) => this._onEnemyKilled(data)));
    this._unsubs.push(on(EVENTS.COMBAT_ENEMY_ATTACKED, (data) => this._onEnemyAttacked(data)));
    this._unsubs.push(on(EVENTS.COMBAT_ENEMY_DODGED, (data) => this._onEnemyDodged(data)));
    this._unsubs.push(on(EVENTS.COMBAT_PLAYER_MISSED, (data) => this._onPlayerMissed(data)));
    this._unsubs.push(on(EVENTS.COMBAT_MEMBER_ADDED, (data) => this._onMemberAdded(data)));
    this._unsubs.push(on(EVENTS.COMBAT_ENEMY_CASTING, (data) => this._onEnemyCasting(data)));
    this._unsubs.push(on(EVENTS.COMBAT_ENEMY_CHARGE_RESOLVED, (data) => this._onChargeResolved(data)));
    this._unsubs.push(on(EVENTS.COMBAT_INTERRUPTED, (data) => this._onInterrupted(data)));
    this._unsubs.push(on(EVENTS.CORRUPTION_CHANGED, (data) => this._onCorruptionChanged(data)));
    this._unsubs.push(on(EVENTS.CORRUPTION_CLEANSED, (data) => this._onCorruptionCleansed(data)));
    this._unsubs.push(on(EVENTS.COMBAT_ENEMY_REGEN, (data) => this._onEnemyRegen(data)));
    this._unsubs.push(on(EVENTS.COMBAT_ENEMY_ENRAGED, (data) => this._onEnemyEnraged(data)));
    this._unsubs.push(on(EVENTS.COMBAT_ENEMY_ENRAGE_ENDED, (data) => this._onEnemyEnrageEnded(data)));
    this._unsubs.push(on(EVENTS.COMBAT_THORNS_DAMAGE, (data) => this._onThornsDamage(data)));
    this._unsubs.push(on(EVENTS.COMBAT_ARMOR_BROKEN, (data) => this._onArmorBroken(data)));
    this._unsubs.push(on(EVENTS.COMBAT_ARMOR_RESTORED, (data) => this._onArmorRestored(data)));

    // Encounter lifecycle events
    this._unsubs.push(on(EVENTS.COMBAT_ENCOUNTER_STARTED, (data) => this._onEncounterStarted(data)));
    this._unsubs.push(on(EVENTS.COMBAT_ENCOUNTER_ENDED, (data) => this._onEncounterEnded(data)));
    this._unsubs.push(on(EVENTS.COMBAT_TARGET_CHANGED, (data) => this._onTargetChanged(data)));

    // Player HP events
    this._unsubs.push(on(EVENTS.COMBAT_PLAYER_DAMAGED, (data) => this._onPlayerDamaged(data)));
    this._unsubs.push(on(EVENTS.COMBAT_PLAYER_DIED, () => this._onPlayerDied()));

    // Shield bar
    this._unsubs.push(on(EVENTS.BULWARK_ACTIVATED, (data) => {
      this._shieldMaxHp = data.shieldHp;
      this.shieldBarBg.setVisible(true);
      this.shieldBarFill.setDisplaySize(100, 8).setVisible(true);
      this._bulwarkVisualDurationMs = Math.max(0, Number(data.durationMs) || 0);
      this._bulwarkVisualEndAt = this.time.now + this._bulwarkVisualDurationMs;
      this._lastShieldHp = data.shieldHp;
      this._syncBulwarkVisual();
    }));
    this._unsubs.push(on(EVENTS.POWER_SMASH_USED, () => {
      this._activateSkillVisualLock(700);
    }));
    this._unsubs.push(on(EVENTS.RAPID_STRIKES_USED, (data) => {
      const hitCount = Math.max(1, Math.floor(data?.hitCount || 5));
      this._activateSkillVisualLock(hitCount * 200 + 350);
      this._announceFlurry();
    }));

    // Visual juice subscriptions
    this._unsubs.push(on(EVENTS.PROG_LEVEL_UP, () => this._onLevelUp()));
    this._unsubs.push(on(EVENTS.CHEAT_TOGGLED, (data) => {
      if (data.active) this._onCheatGlitch();
    }));

    // Parallax area change — only rebuild on area change, not zone change
    this._unsubs.push(on(EVENTS.WORLD_AREA_CHANGED, (data) => {
      this._destroyParallax();
      this._createParallax(data.area);
      this._applyStanceTint(Store.getState().currentStance);
    }));
    // Safety: if any flow mutates area without emitting WORLD_AREA_CHANGED,
    // re-apply tint on zone updates too.
    this._unsubs.push(on(EVENTS.WORLD_ZONE_CHANGED, () => {
      this._applyStanceTint(Store.getState().currentStance);
    }));

    // Stance tint on player sprite + announcement
    this._unsubs.push(on(EVENTS.STANCE_CHANGED, ({ stanceId }) => {
      this._applyStanceTint(stanceId);
      this._announceStance(stanceId);
    }));
    this._applyStanceTint(Store.getState().currentStance);

    // Armor set swap on equip/unequip/load
    this._unsubs.push(on(EVENTS.INV_ITEM_EQUIPPED, () => this._checkArmorSwap()));
    this._unsubs.push(on(EVENTS.SAVE_LOADED, () => this._checkArmorSwap()));

    // Register shutdown handler
    this.events.on('shutdown', () => this._shutdown());

    // Initialize combat engine (starts spawning enemies)
    CombatEngine.init();

    // Launch UI overlay scene (parallel, not replacing this scene)
    this.scene.launch('UIScene');

    // Launch OverworldScene (starts sleeping — toggled by UIScene via M key)
    if (this.scene.get('OverworldScene')) {
      this.scene.launch('OverworldScene');
    }

    // Launch SpritePreviewScene (starts sleeping — toggled by UIScene via P key)
    if (this.scene.get('SpritePreviewScene')) {
      this.scene.launch('SpritePreviewScene');
    }

    // Ensure shared soundtrack is running (persisted across Start/Game scenes).
    MusicManager.ensurePlaying();

    console.log('[GameScene] create â€" combat initialized');
  }

  update(_time, delta) {
    TimeEngine.update(delta);
    const shieldHpNow = CombatEngine.getShieldHp();

    // Update shield bar
    if (this._shieldMaxHp > 0) {
      if (shieldHpNow <= 0) {
        this._shieldMaxHp = 0;
        this.shieldBarBg.setVisible(false);
        this.shieldBarFill.setVisible(false);
      } else {
        const ratio = shieldHpNow / this._shieldMaxHp;
        this.shieldBarFill.setDisplaySize(Math.max(0, ratio * 100), 8);
      }
    }
    if (shieldHpNow < this._lastShieldHp) {
      this._shakeBulwarkVisual();
    }
    this._lastShieldHp = shieldHpNow;
    this._syncBulwarkVisual();

    // Update ruin stance charge bar + charge sprite
    if (this._chargeBarBg.visible) {
      const progress = TimeEngine.getProgress('combat:autoAttack');
      this._chargeBarFill.setDisplaySize(Math.max(0, progress * 100), 6);

      // Switch to charge-up sprite at 50% if not mid-attack
      if (!this._isSkillVisualLocked() && !this._playerAttacking && !this._hitReacting && progress >= 0.75 && !this._powerCharging) {
        this._powerCharging = true;
        this._walkTimer.paused = true;
        this.playerRect.setTexture(this._armorSet.powerCharge);
        this.playerRect.setDisplaySize(300, 375);
      } else if (!this._isSkillVisualLocked() && progress < 0.75 && this._powerCharging) {
        this._powerCharging = false;
        if (!this._playerAttacking && this._attackLockCount === 0 && !this._hitReacting) {
          this._walkTimer.elapsed = 0;
          this._walkTimer.paused = false;
        }
      }
    }

    // Update enemy attack charge bars + sync armor crack overlay
    for (const slot of this._enemySlots) {
      if (slot.state.castTimerKey && slot.chargeBarFill.visible) {
        const progress = TimeEngine.getProgress(slot.state.castTimerKey);
        if (slot.state.castKind === 'charge') {
          slot.chargeBarFill.setDisplaySize(Math.max(0, progress * 100), 4);
        } else if (slot.state.castKind === 'respawn') {
          slot.chargeBarFill.setDisplaySize(Math.max(0, (1 - progress) * 100), 4);
          if (slot.castText?.visible) {
            const remainingMs = Math.max(0, (slot.state.castDurationMs || 0) * (1 - progress));
            slot.castText.setText(`${(remainingMs / 1000).toFixed(1)}s`);
          }
        } else if (slot.state.castKind === 'enrage') {
          slot.chargeBarFill.setDisplaySize(Math.max(0, (1 - progress) * 100), 4);
          if (slot.castText?.visible) {
            const remainingMs = Math.max(0, (slot.state.castDurationMs || 0) * (1 - progress));
            slot.castText.setText(`${(remainingMs / 1000).toFixed(1)}s`);
          }
        }
      }
      if (slot.state.armorCrackOverlay) {
        slot.state.armorCrackOverlay.setPosition(slot.sprite.x, slot.sprite.y);
      }
    }

    const dt = delta / 1000;
    const ga = LAYOUT.gameArea;

    // Scroll parallax layers
    for (let i = 0; i < this._parallaxLayers.length; i++) {
      const layer = this._parallaxLayers[i];
      if (!layer || !layer.active) continue;

      if (layer.getData('isStatic')) {
        continue;
      } else if (layer.getData('isSkyLayer')) {
        // Slow dual-image horizontal scroll for sky
        const children = layer.getAll();
        const imgW = layer.getData('imgW');
        const speed = PARALLAX.baseSpeedPxPerSec * 0.5 * dt;
        for (const child of children) {
          child.x -= speed;
        }
        if (children[0] && children[0].x + imgW <= ga.x) {
          for (const child of children) {
            child.x += imgW;
          }
        }
      } else if (layer.getData('isImageLayer')) {
        // Dual-image horizontal scroll (delta-based)
        const children = layer.getAll();
        const imgW = layer.getData('imgW');
        const speed = PARALLAX.baseSpeedPxPerSec * 3 * 0.4 * dt;
        for (const child of children) {
          child.x -= speed;
        }
        if (children[0] && children[0].x + imgW <= ga.x) {
          for (const child of children) {
            child.x += imgW;
          }
        }
      } else {
        // Rectangle-based fallback (unchanged, frame-based)
        const speed = (i + 1) * 0.15;
        const children = layer.getAll();
        for (const child of children) {
          child.x -= speed;
          if (child.x + child.width < 0) {
            child.x = ga.w + Math.random() * 100;
          }
        }
      }
    }

    // Scroll ground (delta-based, equivalent to front layer rate)
    if (this._groundContainer && this._groundContainer.active) {
      const groundSpeed = PARALLAX.baseSpeedPxPerSec * 3 * dt;
      const children = this._groundContainer.getAll();
      const imgW = this._groundContainer.getData('imgW');
      for (const child of children) {
        child.x -= groundSpeed;
      }
      if (children[0] && children[0].x + imgW <= ga.x) {
        for (const child of children) {
          child.x += imgW;
        }
      }
    }

    // Scroll bare ground overlay (same speed as ground)
    if (this._bareGroundContainer && this._bareGroundContainer.active) {
      const bareSpeed = PARALLAX.baseSpeedPxPerSec * 3 * dt;
      const children = this._bareGroundContainer.getAll();
      const imgW = this._bareGroundContainer.getData('imgW');
      for (const child of children) {
        child.x -= bareSpeed;
      }
      if (children[0] && children[0].x + imgW <= ga.x) {
        for (const child of children) {
          child.x += imgW;
        }
      }
    }

    // Scroll path overlay (same speed as ground)
    if (this._pathContainer && this._pathContainer.active) {
      const pathSpeed = PARALLAX.baseSpeedPxPerSec * 3 * dt;
      const children = this._pathContainer.getAll();
      const imgW = this._pathContainer.getData('imgW');
      for (const child of children) {
        child.x -= pathSpeed;
      }
      if (children[0] && children[0].x + imgW <= ga.x) {
        for (const child of children) {
          child.x += imgW;
        }
      }
    }

    // Scroll tree layers (diagonal: upper-right â†' lower-left)
    if (this._treeLayers.length > 0) {
      const frontSpeed = PARALLAX.baseSpeedPxPerSec * 3;
      const diagRatio = PARALLAX.treeDiagRatio;
      for (const { row, trees, flatScroll } of this._treeLayers) {
        const xSpeed = frontSpeed * row.speedMult * dt;
        const ySpeed = flatScroll ? 0 : xSpeed * diagRatio * (row.diagMult ?? 1);
        for (const tree of trees) {
          tree.img.x -= xSpeed;
          tree.img.y += ySpeed;

          // Perspective growth: scale continuously from spawn to despawn (no clamping)
          if (row.growRange && !flatScroll) {
            const spawnX = ga.x + ga.w * 1.5;
            const despawnX = ga.x - tree.displayW * 0.5;
            const progress = Math.max(0, (spawnX - tree.img.x) / (spawnX - despawnX));
            const growMult = row.growRange[0] + progress * (row.growRange[1] - row.growRange[0]);
            tree.img.setDisplaySize(tree.displayW * growMult, tree.displayH * growMult);
          }

          // Wrap: past left edge or below game area â†' reset to upper-right off-screen
          const topY = tree.img.y - tree.displayH;
          if (tree.img.x + tree.displayW * 0.5 < ga.x || topY > ga.y + ga.h + 50) {
            tree.img.x = ga.x + ga.w + tree.displayW * 0.5 + Math.random() * 30;
            tree.img.y = flatScroll ? tree.img.y : ga.y + ga.h * row.yRange[0] + Math.random() * 30;
          }
        }
      }
    }

    // Scroll fern layers (dense diagonal band)
    if (this._fernLayers.length > 0) {
      const frontSpeed = PARALLAX.baseSpeedPxPerSec * 3;
      const diagRatio = PARALLAX.fernDiagRatio;
      for (const { row, ferns, yMin, yMax } of this._fernLayers) {
        const xSpeed = frontSpeed * row.speedMult * dt;
        const ySpeed = xSpeed * diagRatio;

        // Find rightmost fern for spacing-aware respawn
        let rightmostX = ga.x + ga.w;
        for (const fern of ferns) {
          if (fern.img.x > rightmostX) rightmostX = fern.img.x;
        }

        // Compute step from sample fern width + spacing multiplier
        const sampleW = ferns[0] ? ferns[0].displayW : 40;
        const step = Math.max(24, sampleW * row.xSpacingMult);

        for (const fern of ferns) {
          fern.img.x -= xSpeed;
          fern.img.y += ySpeed;

          // Perspective growth: scale up as fern travels right → left
          if (row.growRange) {
            const progress = 1 - Math.max(0, Math.min(1, (fern.img.x - ga.x) / ga.w));
            const growMult = row.growRange[0] + progress * (row.growRange[1] - row.growRange[0]);
            fern.img.setDisplaySize(fern.displayW * growMult, fern.displayH * growMult);
          }

          const topY = fern.img.y - fern.displayH;
          if (fern.img.x + fern.displayW * 0.5 < ga.x - 60 || topY > ga.y + ga.h + 80) {
            // Place one step after the current rightmost fern with slight jitter
            fern.img.x = rightmostX + step + (Math.random() - 0.5) * step * 0.3;
            rightmostX = fern.img.x;
            fern.img.y = yMin + Math.random() * Math.max(1, yMax - yMin);
          }
        }
      }
    }
  }

  // ── Slot lookup helpers ──────────────────────────────────────────

  _getSlotByInstanceId(instanceId) {
    return this._enemySlots.find(s => s.state.instanceId === instanceId) || null;
  }

  _getSlotByIndex(index) {
    return this._enemySlots[index] || null;
  }

  // ── Armor set swap ─────────────────────────────────────────────

  _checkArmorSwap() {
    const newSet = getActiveArmorSet(Store.getState().equipped, parseStackKey);
    if (newSet.id === this._armorSet.id) return;
    this._armorSet = newSet;
    this._playerAttackSprites = [...newSet.attackSprites];
    this._lastAttackSprite = null;
    this._defaultWalkFrames = [...newSet.walkFrames];
    this._fortressWalkFrames = [...newSet.fortressWalkFrames];
    // Re-apply stance to pick up new walk frames + texture
    this._applyStanceTint(Store.getState().currentStance);
  }

  // ── Stance tint ─────────────────────────────────────────────────

  _applyStanceTint(stanceId) {
    if (!this.playerRect) return;
    const areaTint = this._getAreaPlayerTint();
    switch (stanceId) {
      case 'tempest':
        this._stanceIcon.setText('⚡').setColor('#facc15');
        break;
      case 'fortress':
        this._stanceIcon.setText('⬢').setColor('#60a5fa');
        break;
      default:
        this._stanceIcon.setText('▲').setColor('#ef4444');
        break;
    }
    // Player tint is area-driven. Always clear first to prevent stale tint carryover.
    this.playerRect.clearTint();
    if (areaTint != null && areaTint !== 0xffffff) {
      this.playerRect.setTint(areaTint);
    }
    // Swap walk frames per stance
    this._walkFrames = stanceId === 'fortress' ? this._fortressWalkFrames : this._defaultWalkFrames;
    this._walkIndex = 0;
    const firstFrame = this._walkFrames[0];
    this.playerRect.setTexture(firstFrame);
    const frameScale = (this._armorSet.scaleOverrides && this._armorSet.scaleOverrides[firstFrame])
      || (this._armorSet.largeFrames.includes(firstFrame) ? 1.05 : 1);
    this.playerRect.setDisplaySize(300 * frameScale, 375 * frameScale);

    // Show charge bar only in ruin stance
    const showCharge = stanceId === 'ruin';
    this._chargeBarBg.setVisible(showCharge);
    this._chargeBarFill.setVisible(showCharge);
    if (!showCharge) {
      this._chargeBarFill.setDisplaySize(0, 6);
      this._powerCharging = false;
    }
  }

  _announceStance(stanceId) {
    const stance = STANCES[stanceId];
    if (!stance) return;

    const stanceStyles = {
      tempest:  { color: '#60a5fa', font: 'Impact, Arial Narrow, sans-serif' },
      ruin:     { color: '#fb923c', font: 'Georgia, Times New Roman, serif' },
      fortress: { color: '#a1a1aa', font: 'Trebuchet MS, Lucida Sans, sans-serif' },
    };
    const style = stanceStyles[stanceId] || stanceStyles.ruin;

    const tx = this._playerX;
    const ty = this._combatY - 280;

    // Kill any existing announcement
    if (this._stanceAnnounce) {
      this.tweens.killTweensOf(this._stanceAnnounce);
      this._stanceAnnounce.destroy();
    }

    const text = this.add.text(tx, ty, `${stance.label.toUpperCase()} STANCE`, {
      fontFamily: style.font,
      fontSize: '36px',
      fontStyle: 'bold',
      color: style.color,
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(100).setAlpha(0);

    this._stanceAnnounce = text;

    // Fade in, hold, fade out
    this.tweens.add({
      targets: text,
      alpha: 1,
      y: ty - 10,
      duration: 150,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: text,
          alpha: 0,
          y: ty - 30,
          duration: 400,
          delay: 300,
          ease: 'Quad.easeIn',
          onComplete: () => text.destroy(),
        });
      },
    });

    // Subtle screen shake
    this.cameras.main.shake(120, 0.003);
  }

  _announceFlurry() {
    const tx = this._playerX;
    const ty = this._combatY - 315;

    if (this._flurryAnnounce) {
      this.tweens.killTweensOf(this._flurryAnnounce);
      this._flurryAnnounce.destroy();
    }

    const text = this.add.text(tx, ty, 'FLURRY!!!', {
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize: '54px',
      fontStyle: 'bold',
      color: '#ef4444',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(110).setAlpha(0).setScale(0.9);

    this._flurryAnnounce = text;

    this.tweens.add({
      targets: text,
      alpha: 1,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 90,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: text,
          alpha: 0,
          y: ty - 25,
          scaleX: 1,
          scaleY: 1,
          duration: 300,
          delay: 140,
          ease: 'Quad.easeIn',
          onComplete: () => {
            text.destroy();
            if (this._flurryAnnounce === text) this._flurryAnnounce = null;
          },
        });
      },
    });
  }

  _announceEnrage(isSlimefang = false) {
    const ga = LAYOUT.gameArea;
    const cx = ga.x + ga.w / 2;
    const baseY = ga.y + ga.h * 0.34;

    const overlay = this.add.rectangle(
      cx,
      ga.y + ga.h / 2,
      ga.w,
      ga.h,
      0x7f1d1d,
      isSlimefang ? 0.2 : 0.12,
    ).setDepth(108).setAlpha(0);

    const headline = this.add.text(cx, baseY, 'ENRAGED!', {
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize: isSlimefang ? '76px' : '52px',
      fontStyle: 'bold',
      color: '#ff3b3b',
      stroke: '#000000',
      strokeThickness: isSlimefang ? 8 : 6,
    }).setOrigin(0.5).setDepth(110).setAlpha(0).setScale(0.92);

    const objects = [overlay, headline];
    if (isSlimefang) {
      const sub = this.add.text(cx, baseY + 64, 'DEFEND YOURSELF!', {
        fontFamily: 'Impact, Arial Black, sans-serif',
        fontSize: '58px',
        fontStyle: 'bold',
        color: '#ffd4d4',
        stroke: '#000000',
        strokeThickness: 7,
      }).setOrigin(0.5).setDepth(110).setAlpha(0).setScale(0.92);
      objects.push(sub);
    }

    this.cameras.main.shake(isSlimefang ? 180 : 120, isSlimefang ? 0.005 : 0.0035);

    this.tweens.add({
      targets: objects,
      alpha: 1,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 120,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: objects,
          alpha: 0,
          y: '-=20',
          scaleX: 1,
          scaleY: 1,
          duration: isSlimefang ? 500 : 360,
          delay: isSlimefang ? 220 : 140,
          ease: 'Quad.easeIn',
          onComplete: () => {
            for (const obj of objects) obj.destroy();
          },
        });
      },
    });
  }

  _getAreaEnemyTint() {
    const area = Store.getState().currentArea;
    const theme = ZONE_THEMES[area];
    if (!theme) return null;
    if (theme.enemyTint != null) return theme.enemyTint;
    return theme.playerTint != null ? theme.playerTint : null;
  }

  _getAreaPlayerTint() {
    const area = Store.getState().currentArea;
    const theme = ZONE_THEMES[area];
    if (!theme) return null;
    return theme.playerTint != null ? theme.playerTint : null;
  }

  _applyEnemyTint(sprite, effectTint, enemyBaseTint) {
    const areaTint = this._getAreaEnemyTint();
    const et = effectTint || 0xffffff;
    const bt = enemyBaseTint || 0xffffff;
    const at = areaTint || 0xffffff;
    if (areaTint == null && !effectTint && !enemyBaseTint) { sprite.clearTint(); return; }
    const r = ((et >> 16) & 0xff) * ((at >> 16) & 0xff) * ((bt >> 16) & 0xff) / (255 * 255);
    const g = ((et >> 8) & 0xff) * ((at >> 8) & 0xff) * ((bt >> 8) & 0xff) / (255 * 255);
    const b = (et & 0xff) * (at & 0xff) * (bt & 0xff) / (255 * 255);
    sprite.setTint((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b));
  }

  _syncBulwarkVisual(forceHide = false) {
    if (!this._bulwarkVisual) return;

    const shieldHp = forceHide ? 0 : CombatEngine.getShieldHp();
    if (shieldHp <= 0) {
      if (this._bulwarkShakeTween) {
        this.tweens.killTweensOf(this._bulwarkVisual);
        this._bulwarkShakeTween = null;
      }
      this._bulwarkVisual.setAngle(0);
      if (!forceHide && this._bulwarkVisual.visible) {
        const now = this.time.now;
        const brokeEarly = this._bulwarkVisualEndAt > 0 && now < (this._bulwarkVisualEndAt - 120);
        if (brokeEarly) this._playBulwarkBreakFx();
      }
      this._bulwarkVisual.setVisible(false);
      return;
    }

    const targetH = this._bulwarkVisualBaseH || 225;
    const targetW = this._bulwarkVisualBaseW || 95;

    // Fade as shield nears timeout.
    let alpha = 0.92;
    if (this._bulwarkVisualEndAt > 0 && this._bulwarkVisualDurationMs > 0) {
      const remaining = this._bulwarkVisualEndAt - this.time.now;
      const fadeWindow = Math.max(700, Math.min(2000, this._bulwarkVisualDurationMs * 0.25));
      if (remaining <= fadeWindow) {
        const t = Phaser.Math.Clamp(remaining / fadeWindow, 0, 1);
        alpha = 0.2 + (0.72 * t);
      }
    }

    this._bulwarkVisual.setVisible(true);
    if (!this._bulwarkShakeTween) {
      this._bulwarkVisual.setPosition(this._bulwarkAnchorX, this._bulwarkAnchorY);
      this._bulwarkVisual.setAngle(0);
    }
    this._bulwarkVisual.setDisplaySize(targetW, targetH);
    this._bulwarkVisual.setAlpha(alpha);
    this._bulwarkVisual.setDepth((this.playerRect?.depth ?? 0) + 1);
  }

  _shakeBulwarkVisual() {
    if (!this._bulwarkVisual || !this._bulwarkVisual.visible) return;

    const ax = this._bulwarkAnchorX;
    const ay = this._bulwarkAnchorY;

    if (this._bulwarkShakeTween) {
      this.tweens.killTweensOf(this._bulwarkVisual);
    }
    this._bulwarkShakeTween = null;
    this._bulwarkVisual.setPosition(ax, ay);
    this._bulwarkVisual.setAngle(0);

    const dir = Math.random() < 0.5 ? -1 : 1;
    const steps = [
      { x: ax + (dir * 26), y: ay - 12, angle: dir * 8, duration: 40, ease: 'Cubic.easeOut' },
      { x: ax - (dir * 22), y: ay + 9, angle: -dir * 7, duration: 45, ease: 'Cubic.easeInOut' },
      { x: ax + (dir * 16), y: ay - 6, angle: dir * 5, duration: 36, ease: 'Cubic.easeInOut' },
      { x: ax, y: ay, angle: 0, duration: 55, ease: 'Quad.easeOut' },
    ];
    const runStep = (index) => {
      if (!this._bulwarkVisual) {
        this._bulwarkShakeTween = null;
        return;
      }
      if (index >= steps.length) {
        this._bulwarkVisual.setPosition(ax, ay);
        this._bulwarkVisual.setAngle(0);
        this._bulwarkShakeTween = null;
        return;
      }
      const step = steps[index];
      this._bulwarkShakeTween = this.tweens.add({
        targets: this._bulwarkVisual,
        x: step.x,
        y: step.y,
        angle: step.angle,
        duration: step.duration,
        ease: step.ease,
        onComplete: () => runStep(index + 1),
      });
    };
    runStep(0);
  }

  _playBulwarkBreakFx() {
    if (!this._bulwarkVisual || !this._bulwarkVisual.visible) return;

    this._destroyBulwarkBreakFx();

    const x = this._bulwarkVisual.x;
    const y = this._bulwarkVisual.y;
    const w = this._bulwarkVisual.displayWidth;
    const h = this._bulwarkVisual.displayHeight;
    const baseDepth = this._bulwarkVisual.depth;
    const baseAlpha = this._bulwarkVisual.alpha;
    const frameW = this._bulwarkVisual.frame?.cutWidth || 323;
    const frameH = this._bulwarkVisual.frame?.cutHeight || 763;
    const halfFrameW = Math.floor(frameW / 2);

    const left = this.add.image(x - w * 0.25, y, 'bulwarkvisual');
    left.setDisplaySize(w * 0.5, h);
    left.setCrop(0, 0, halfFrameW, frameH);
    left.setAlpha(baseAlpha);
    left.setDepth(baseDepth + 1);

    const right = this.add.image(x + w * 0.25, y, 'bulwarkvisual');
    right.setDisplaySize(w * 0.5, h);
    right.setCrop(halfFrameW, 0, frameW - halfFrameW, frameH);
    right.setAlpha(baseAlpha);
    right.setDepth(baseDepth + 1);

    this._bulwarkBreakFx.push(left, right);

    const finishPiece = (piece) => {
      if (!piece) return;
      const idx = this._bulwarkBreakFx.indexOf(piece);
      if (idx !== -1) this._bulwarkBreakFx.splice(idx, 1);
      piece.destroy();
    };

    this.tweens.add({
      targets: left,
      x: left.x - 42,
      y: left.y + 135,
      angle: -24,
      alpha: 0,
      duration: 460,
      ease: 'Quad.easeIn',
      onComplete: () => finishPiece(left),
    });
    this.tweens.add({
      targets: right,
      x: right.x + 42,
      y: right.y + 135,
      angle: 24,
      alpha: 0,
      duration: 460,
      ease: 'Quad.easeIn',
      onComplete: () => finishPiece(right),
    });
  }

  _destroyBulwarkBreakFx() {
    if (!this._bulwarkBreakFx || this._bulwarkBreakFx.length === 0) return;
    for (const obj of this._bulwarkBreakFx) {
      if (!obj) continue;
      this.tweens.killTweensOf(obj);
      obj.destroy();
    }
    this._bulwarkBreakFx = [];
  }

  // ── Walk timer lock counting ────────────────────────────────────

  _lockWalk() {
    this._attackLockCount++;
    this._walkTimer.paused = true;
  }

  _isSkillVisualLocked() {
    return this.time.now < this._skillVisualLockUntil;
  }

  _activateSkillVisualLock(durationMs) {
    const lockMs = Math.max(0, Number(durationMs) || 0);
    if (lockMs <= 0) return;
    this._skillVisualLockUntil = Math.max(this._skillVisualLockUntil, this.time.now + lockMs);

    // Skill visuals have priority over reaction/charge visuals.
    this._hitReacting = false;
    this._playerAttacking = false;
    this._powerCharging = false;
    if (this._playerPoseTimer) {
      this._playerPoseTimer.remove();
      this._playerPoseTimer = null;
      this._unlockWalk();
    }
    this._walkTimer.paused = true;
    this.tweens.killTweensOf(this.playerRect);
    this.playerRect.x = this._playerX;
  }

  _unlockWalk() {
    this._attackLockCount = Math.max(0, this._attackLockCount - 1);
    if (this._attackLockCount === 0 && !this._playerAttacking && !this._powerCharging && !this._hitReacting && !this._isSkillVisualLocked()) {
      this._walkTimer.elapsed = 0;
      this._walkTimer.paused = false;
    }
  }

  // ── Encounter slot positioning ──────────────────────────────────

  _getSlotPositions(count) {
    let bonus = 0;
    if (count > 1) {
      for (const slot of this._enemySlots) {
        if (slot.state.instanceId && slot.state.spriteSpreadBonus > bonus) {
          bonus = slot.state.spriteSpreadBonus;
        }
      }
    }
    const spread = COMBAT_V2.encounterSpread + bonus;
    const startX = this._enemyX - ((count - 1) * spread) / 2;
    const positions = [];
    for (let i = 0; i < count; i++) {
      positions.push({ x: startX + i * spread, y: this._enemyY });
    }
    return positions;
  }

  _highlightTarget(_instanceId) {
    // All enemies render at full opacity — no dimming for non-targets
  }

  _isDuoSecondSlotSlime(enemyId) {
    return enemyId === 'a1_slime';
  }

  _getEncounterSlotYOffset(slotIndex, count, enemyId) {
    if (count === 2 && slotIndex === 1 && this._isDuoSecondSlotSlime(enemyId)) {
      return 20;
    }
    return 0;
  }

  _reflowEncounterSlots(layoutCount) {
    const count = Math.max(1, layoutCount);
    const positions = this._getSlotPositions(count);
    for (let i = 0; i < this._enemySlots.length; i++) {
      const slot = this._enemySlots[i];
      if (!slot.state.instanceId) continue;
      if (!positions[i]) continue;
      const yOffset = this._getEncounterSlotYOffset(i, count, slot.state.enemyId);
      slot.container.setPosition(positions[i].x, positions[i].y + yOffset);
      slot.baseX = positions[i].x;
      slot.baseY = positions[i].y + yOffset;
    }
  }

  _spawnEncounterMember(memberData, encounterId, layoutCount) {
    const slot = this._getSlotByIndex(memberData.slot);
    if (!slot) return;

    // Reusing a slot (for runtime summons) must clear stale visuals/state first.
    if (slot.state.instanceId && slot.state.instanceId !== memberData.instanceId) {
      this.tweens.killTweensOf(slot.sprite);
      this.tweens.killTweensOf(slot.rect);
      this.tweens.killTweensOf(slot.nameText);
      this.tweens.killTweensOf(slot.hpBarBg);
      this.tweens.killTweensOf(slot.hpBarFill);
      this.tweens.killTweensOf(slot.chargeBarBg);
      this.tweens.killTweensOf(slot.chargeBarFill);
      for (const t of slot.traitObjs) t.destroy();
      slot.traitObjs = [];
      if (slot.state.poseRevertTimer) { slot.state.poseRevertTimer.remove(); slot.state.poseRevertTimer = null; }
      if (slot.state.reactDelayTimer) { slot.state.reactDelayTimer.remove(); slot.state.reactDelayTimer = null; }
      if (slot.state.deathFadeTimer) { slot.state.deathFadeTimer.remove(); slot.state.deathFadeTimer = null; }
      if (slot.state.flapTimer) { slot.state.flapTimer.remove(); slot.state.flapTimer = null; }
      for (const obj of slot.state.extraObjects) obj.destroy();
      slot.state.extraObjects = [];
      this._applyEnemyTint(slot.sprite, null, slot.state.baseTint);
      slot.rect.setFillStyle(0xef4444);
    }

    const template = getEnemyById(memberData.enemyId)
      || (memberData.baseEnemyId ? getEnemyById(memberData.baseEnemyId) : null);
    const sprites = memberData.sprites || template?.sprites || null;
    const bossScale = memberData.isBoss ? 1.4 : 1;
    const baseSize = memberData.spriteSize || template?.spriteSize || { w: 200, h: 250 };
    const size = { w: baseSize.w * bossScale, h: baseSize.h * bossScale };
    const spriteOffsetY = memberData.spriteOffsetY ?? template?.spriteOffsetY ?? 0;
    const nameplateOffsetY = memberData.nameplateOffsetY ?? template?.nameplateOffsetY ?? 0;
    const baseH = baseSize.h;
    const hDiff = size.h - baseH;
    const bottomAlignOffsetY = hDiff > 0 ? -hDiff / 2 + 40 : 0;

    // Bind state
    slot.state.instanceId = memberData.instanceId;
    slot.state.enemyId = memberData.enemyId;
    slot.state.dying = false;
    slot.state.currentSprites = sprites;
    slot.state.spriteW = size.w;
    slot.state.spriteH = size.h;
    slot.state.spriteOffsetY = spriteOffsetY;
    slot.state.bottomAlignOffsetY = bottomAlignOffsetY;
    slot.state.lungeDist = (memberData.lungeDistance ?? template?.lungeDistance ?? 20) * 2;
    slot.state.attackSpriteOffsetY = memberData.attackSpriteOffsetY ?? template?.attackSpriteOffsetY ?? null;
    slot.state.attackSpriteOffsetX = memberData.attackSpriteOffsetX ?? template?.attackSpriteOffsetX ?? 0;
    slot.state.baseTint = memberData.spriteTint ?? template?.spriteTint ?? null;
    slot.state.attackSpriteScale = memberData.attackSpriteScale ?? template?.attackSpriteScale ?? 1;
    slot.state.reactionSpriteScale = memberData.reactionSpriteScale ?? template?.reactionSpriteScale ?? 1;
    slot.state.spriteSpreadBonus = memberData.spriteSpreadBonus ?? template?.spriteSpreadBonus ?? 0;
    slot.state.enraged = false;

    // Position container (layoutCount can grow as summons are added)
    const count = Math.max(layoutCount || 1, memberData.slot + 1);
    const positions = this._getSlotPositions(count);
    const pos = positions[memberData.slot];
    const yOffset = this._getEncounterSlotYOffset(memberData.slot, count, memberData.enemyId);
    slot.container.setPosition(pos.x, pos.y + yOffset);
    slot.baseX = pos.x;
    slot.baseY = pos.y + yOffset;

    // Reposition name/HP based on actual sprite height
    const halfH = size.h / 2;
    const npOff = nameplateOffsetY;
    slot.nameText.setY(-(halfH) - 60 + npOff);
    slot.hpBarBg.setY(-(halfH) - 42 + npOff);
    slot.hpBarFill.setY(-(halfH) - 42 + npOff);
    slot.hpBarFill.setX(-50); // reset left anchor

    // Resize & reposition shadow to match enemy feet
    if (slot.shadow) {
      const shadowOffY = memberData.shadowOffsetY ?? template?.shadowOffsetY ?? 0;
      slot.shadow.setPosition(0, halfH + spriteOffsetY + bottomAlignOffsetY - 65 + shadowOffY);
      slot.shadow.setDisplaySize(Math.min(size.w * 0.7, 120), 20);
    }

    // Configure sprite or rect
    if (sprites) {
      slot.sprite.setTexture(sprites.default);
      slot.sprite.setScale(1).setAngle(0).setOrigin(0.5, 0.5);
      slot.sprite.setDisplaySize(size.w, size.h);
      slot.sprite.setPosition(0, spriteOffsetY + bottomAlignOffsetY);
      slot.sprite.setVisible(true).setAlpha(1);
      this._applyEnemyTint(slot.sprite, null, slot.state.baseTint);
      slot.sprite.setInteractive({ useHandCursor: true });
      slot.rect.setVisible(false);
      slot.rect.disableInteractive();

      // Wing-flap animation: oscillate between default and default2 textures
      if (slot.state.flapTimer) { slot.state.flapTimer.remove(); slot.state.flapTimer = null; }
      if (sprites.default2) {
        slot.state.flapFrame = 0;
        const frames = [sprites.default, sprites.default2];
        slot.state.flapTimer = this.time.addEvent({
          delay: 300,
          loop: true,
          callback: () => {
            // Don't flap during reaction/attack/dead poses
            if (!slot.state.currentSprites) return;
            const tex = slot.sprite.texture.key;
            if (tex !== frames[0] && tex !== frames[1]) return;
            slot.state.flapFrame = (slot.state.flapFrame + 1) % 2;
            slot.sprite.setTexture(frames[slot.state.flapFrame]);
            slot.sprite.setDisplaySize(slot.state.spriteW, slot.state.spriteH);
          },
        });
      }
    } else {
      slot.rect.setFillStyle(0xef4444);
      slot.rect.setPosition(0, 0);
      slot.rect.setVisible(true).setAlpha(1).setScale(1);
      slot.rect.setInteractive({ useHandCursor: true });
      slot.sprite.setVisible(false);
      slot.sprite.disableInteractive();
    }

    // Name + HP bar
    slot.nameText.setText(memberData.name).setAlpha(1);
    slot.hpBarBg.setAlpha(1);
    slot.hpBarFill.setDisplaySize(100, 8).setAlpha(1);
    slot.hpBarFill.setFillStyle(0x22c55e);

    // Trait indicators
    for (const obj of slot.traitObjs) obj.destroy();
    slot.traitObjs = [];
    const traits = [];
    if (memberData.regen > 0) traits.push({ label: '✚', color: '#22c55e' });
    if (memberData.thorns > 0) traits.push({ label: '◆', color: '#a855f7' });
    if ((memberData.attackSpeed ?? 1.0) >= 1.4) traits.push({ label: '⚡', color: '#facc15' });
    if (memberData.armorPen > 0) traits.push({ label: '⊘', color: '#f97316' });
    if (memberData.dot > 0) traits.push({ label: '☠', color: '#84cc16' });
    if ((memberData.defense ?? 0) > 0) traits.push({ label: '⬢', color: '#60a5fa' });
    if ((memberData.evasion ?? 0) > 0) traits.push({ label: 'E', color: '#22d3ee' });
    if ((memberData.armor?.reduction ?? 0) > 0) traits.push({ label: 'A', color: '#93c5fd' });
    if ((memberData.corruption ?? 0) > 0) traits.push({ label: 'C', color: '#f472b6' });
    if (memberData.summon) traits.push({ label: 'S', color: '#f59e0b' });
    if (memberData.chargeAttack) traits.push({ label: '!', color: '#fb923c' });
    const traitY = -(halfH) - 42 + npOff;
    let traitX = 56;
    for (const t of traits) {
      const txt = this.add.text(traitX, traitY, t.label, {
        fontFamily: 'monospace', fontSize: '13px', color: t.color,
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0, 0.5);
      slot.container.add(txt);
      slot.traitObjs.push(txt);
      traitX += txt.width + 1;
    }
    slot._traitY = traitY;
    slot._nextTraitX = traitX;

    // Charge bar tracking
    slot.state.atkTimerKey = `enc:${encounterId}:atk:${memberData.instanceId}`;
    slot.state.castTimerKey = null;
    slot.state.castKind = null;
    slot.state.castDurationMs = 0;
    slot.state.chargeArmor = memberData.chargeArmor ?? template?.chargeArmor ?? 0;
    slot.state.showAutoChargeBar = false;

    const chargeY = -(halfH) - 32 + npOff;
    slot.chargeBarBg.setY(chargeY).setVisible(false).setAlpha(1);
    slot.chargeBarFill.setY(chargeY).setDisplaySize(0, 4).setVisible(false).setAlpha(1).setFillStyle(0xef4444);
    slot.castText.setY(chargeY - 10).setVisible(false).setText('');

    slot.container.setVisible(true).setAlpha(1);
  }

  // ── Encounter lifecycle ───────────────────────────────────────

  _onEncounterStarted(data) {
    for (const memberData of data.members) {
      this._spawnEncounterMember(memberData, data.encounterId, data.memberCount);
    }
    this._reflowEncounterSlots(data.memberCount);

    // Highlight initial target (first member)
    if (data.members.length > 0) {
      this._highlightTarget(data.members[0].instanceId);
    }
  }

  _onMemberAdded(data) {
    if (!data?.member) return;
    this._spawnEncounterMember(data.member, data.encounterId, data.memberCount);
    this._reflowEncounterSlots(Math.max(data.memberCount || 1, data.member.slot + 1));
  }

  _onEncounterEnded(_data) {
    // Reset walk lock count to prevent drift from replaced timers
    this._attackLockCount = 0;
    this._walkTimer.paused = false;

    for (const slot of this._enemySlots) {
      if (!slot.state.instanceId) continue;

      // Let dying slots finish their death animation
      if (slot.state.dying) {
        // Still clear combat timers that shouldn't persist
        if (slot.state.poseRevertTimer) { slot.state.poseRevertTimer.remove(); slot.state.poseRevertTimer = null; }
        if (slot.state.reactDelayTimer) { slot.state.reactDelayTimer.remove(); slot.state.reactDelayTimer = null; }
        if (slot.state.flapTimer) { slot.state.flapTimer.remove(); slot.state.flapTimer = null; }
        slot.state.atkTimerKey = null;
        slot.state.castTimerKey = null;
        slot.state.castKind = null;
        slot.state.castDurationMs = 0;
        slot.state.showAutoChargeBar = false;
        slot.castText.setVisible(false).setText('');
        continue;
      }

      // Kill tweens
      this.tweens.killTweensOf(slot.sprite);
      this.tweens.killTweensOf(slot.rect);
      this.tweens.killTweensOf(slot.nameText);
      for (const t of slot.traitObjs) { this.tweens.killTweensOf(t); t.destroy(); }
      slot.traitObjs = [];
      this.tweens.killTweensOf(slot.hpBarBg);
      this.tweens.killTweensOf(slot.hpBarFill);

      // Clear timers
      if (slot.state.poseRevertTimer) { slot.state.poseRevertTimer.remove(); slot.state.poseRevertTimer = null; }
      if (slot.state.reactDelayTimer) { slot.state.reactDelayTimer.remove(); slot.state.reactDelayTimer = null; }
      if (slot.state.deathFadeTimer) { slot.state.deathFadeTimer.remove(); slot.state.deathFadeTimer = null; }
      if (slot.state.flapTimer) { slot.state.flapTimer.remove(); slot.state.flapTimer = null; }

      // Clean up extra objects (e.g. stalker head)
      for (const obj of slot.state.extraObjects) obj.destroy();
      slot.state.extraObjects = [];

      // Hide + disable
      slot.container.setVisible(false);
      slot.sprite.disableInteractive();
      slot.rect.disableInteractive();

      // Reset state
      slot.state.instanceId = null;
      slot.state.enemyId = null;
      slot.state.currentSprites = null;
      slot.state.enraged = false;
      slot.state.dying = false;
      slot.state.atkTimerKey = null;
      slot.state.castTimerKey = null;
      slot.state.castKind = null;
      slot.state.castDurationMs = 0;
      slot.state.showAutoChargeBar = false;
      slot.chargeBarFill.setFillStyle(0xef4444).setDisplaySize(0, 4).setVisible(false);
      slot.chargeBarBg.setVisible(false);
      slot.castText.setVisible(false).setText('');
    }

  }

  _onTargetChanged(data) {
    this._highlightTarget(data.instanceId);
  }

  _onEnemyDamaged(data) {
    const slot = this._getSlotByInstanceId(data.instanceId);
      if (!slot) return;

      // Update HP bar
      const sRatio = data.maxHp.gt(0) ? data.remainingHp.div(data.maxHp).toNumber() : 0;
      const sBarWidth = Math.max(0, sRatio * 100);
      slot.hpBarFill.setDisplaySize(sBarWidth, 8);
      const sColor = sRatio > 0.5 ? 0x22c55e : sRatio > 0.25 ? 0xeab308 : 0xef4444;
      slot.hpBarFill.setFillStyle(sColor);

      const sIsPowerSmash = data.isPowerSmash || false;
      const sIsClick = data.isClick || false;
      const sSkipAttackAnim = data.skipAttackAnim || false;
      const sSource = data.source || null;
      const sIsRapidStrikesHit = sSource === 'rapid_strikes';
      const sIsSkillVisualDamage = sIsPowerSmash || sSource === 'rapid_strikes';

      if (sSource === 'rapid_strikes') {
        this.cameras.main.shake(85, 0.004);
      }

      // Click attacks (non-Power Smash): damage number only
      if (sIsClick && !sIsPowerSmash) {
        this._spawnDamageNumber(data.amount, data.isCrit, false, slot.baseX, slot.baseY);
        return;
      }

      if (sSkipAttackAnim) {
        this._spawnDamageNumber(data.amount, false, false, slot.baseX, slot.baseY);
        return;
      }

      // Sprite priority: hitReaction > attack > walk
      // Hit reaction overrides everything
      if (this._hitReacting && !sIsSkillVisualDamage) return;

      // While a skill visual is active, only skill-driven hits may update the player pose.
      const suppressPlayerPose = this._isSkillVisualLocked() && !sIsSkillVisualDamage;

      const isPowerStanceAttack = Store.getState().currentStance === 'ruin';
      const isPowerStance = Store.getState().currentStance === 'ruin';
      const isTempest = Store.getState().currentStance === 'tempest';

      if (!suppressPlayerPose) {
        // In tempest stance, don't let a new attack override a still-showing attack pose
        if (isTempest && this._playerPoseTimer && this._playerAttacking && !sIsRapidStrikesHit) {
          // Still do the lunge, just don't swap the texture
          this.tweens.killTweensOf(this.playerRect);
          this.playerRect.x = this._playerX;
          this.tweens.add({
            targets: this.playerRect,
            x: this._playerX + 20,
            duration: 80,
            ease: 'Quad.easeOut',
            yoyo: true,
          });
          return;
        }

        let sAttackKey;
        if (sIsPowerSmash || isPowerStanceAttack) {
          sAttackKey = this._armorSet.strongPunch;
        } else {
          const pool = this._playerAttackSprites.length > 1
            ? this._playerAttackSprites.filter(k => k !== this._lastAttackSprite)
            : this._playerAttackSprites;
          sAttackKey = pool[Math.floor(Math.random() * pool.length)];
        }
        this._lastAttackSprite = sAttackKey;
        this._lockWalk();
        this.playerRect.setTexture(sAttackKey);
        const sAtkScale = (this._armorSet.scaleOverrides && this._armorSet.scaleOverrides[sAttackKey])
          || (sAttackKey === 'player001_roundhousekick' ? 0.95 : 1);
        this.playerRect.setDisplaySize(300 * sAtkScale, 375 * sAtkScale);
        const sAtkYOff = (this._armorSet.yOffsets && this._armorSet.yOffsets[sAttackKey]) || 0;
        this.playerRect.y = this._combatY + sAtkYOff;
        const sLungeDist = sIsPowerSmash ? 40 : sIsRapidStrikesHit ? 14 : 20;
        const sLungeDur = sIsPowerSmash ? 100 : sIsRapidStrikesHit ? 55 : 80;
        this.tweens.killTweensOf(this.playerRect);
        this.playerRect.x = this._playerX;
        this.tweens.add({
          targets: this.playerRect,
          x: this._playerX + sLungeDist,
          duration: sLungeDur,
          ease: 'Quad.easeOut',
          yoyo: true,
        });
        if (sIsPowerSmash) this.cameras.main.shake(220, 0.01);

        // If replacing an existing timer, balance the lock count it would have released
        if (this._playerPoseTimer) {
          this._playerPoseTimer.remove();
          this._unlockWalk();
        }
        const poseDuration = sIsRapidStrikesHit ? 110 : isPowerStance ? 500 : 300;
        this._playerAttacking = true;
        this._powerCharging = false;
        this._playerPoseTimer = this.time.delayedCall(poseDuration, () => {
          this._playerAttacking = false;
          this._attackLockCount = 0;
          if (!this._hitReacting && !this._isSkillVisualLocked()) {
            this._walkTimer.elapsed = 0;
            this._walkTimer.paused = false;
          }
        });
      }

      const sKnockbackDist = sIsPowerSmash ? 24 : isPowerStance ? 24 : 12;
      const sReactDelay = 60;
      const forceEnemyRecoil = sIsSkillVisualDamage;
      const enemyReactDelay = forceEnemyRecoil ? 0 : sReactDelay;
      const enemyReactCooldownMs = forceEnemyRecoil ? 0 : 1000;
      const enemyRecoilDuration = forceEnemyRecoil ? 60 : 80;
      const enemyRevertDelay = forceEnemyRecoil ? 170 : 500;

      // Spawn damage text immediately
      if (sIsPowerSmash) {
        this._spawnSmashDamageText(data.amount, slot.baseX, slot.baseY);
      } else {
        this._spawnDamageNumber(data.amount, data.isCrit, false, slot.baseX, slot.baseY);
      }

      // chargeArmor: skip hit reaction when enemy attack is half-charged or more
      if (!forceEnemyRecoil && slot.state.chargeArmor > 0 && slot.state.atkTimerKey) {
        const progress = TimeEngine.getProgress(slot.state.atkTimerKey);
        if (progress >= slot.state.chargeArmor) return;
      }

      if (slot.state.currentSprites) {
        // Sprite hit reaction — cooldown so it doesn't flicker on rapid hits
        const now = this.time.now;
        if (enemyReactCooldownMs > 0 && now - (slot.state.lastReactTime || 0) < enemyReactCooldownMs) return;
        slot.state.lastReactTime = now;

        const runSpriteReaction = () => {
          const isSlimefang = slot.state.enemyId === 'boss_a1z5_the_hollow';
          if (isSlimefang) {
            slot.sprite.setTexture(slot.state.currentSprites.default);
            slot.sprite.setDisplaySize(slot.state.spriteW, slot.state.spriteH);
            this._applyEnemyTint(slot.sprite, 0xff5555, slot.state.baseTint);
          } else {
            slot.sprite.setTexture(slot.state.currentSprites.reaction);
            const reactScale = slot.state.reactionSpriteScale ?? 1;
            slot.sprite.setDisplaySize(slot.state.spriteW * reactScale, slot.state.spriteH * reactScale);
            this._applyEnemyTint(slot.sprite, 0xffffff, slot.state.baseTint);
            this.time.delayedCall(80, () => {
              this._applyEnemyTint(slot.sprite, slot.state.enraged ? 0xff6666 : null, slot.state.baseTint);
            });
          }

          // Reset to local home position before knockback
          this.tweens.killTweensOf(slot.sprite);
          slot.sprite.x = 0;
          slot.sprite.y = slot.state.spriteOffsetY + slot.state.bottomAlignOffsetY;

          this.tweens.add({
            targets: slot.sprite,
            x: sKnockbackDist,
            duration: enemyRecoilDuration,
            ease: 'Quad.easeOut',
            yoyo: true,
          });

          if (slot.state.poseRevertTimer) slot.state.poseRevertTimer.remove();
          slot.state.poseRevertTimer = this.time.delayedCall(enemyRevertDelay, () => {
            if (slot.state.currentSprites) {
              slot.sprite.setTexture(slot.state.currentSprites.default);
              slot.sprite.setDisplaySize(slot.state.spriteW, slot.state.spriteH);
              this._applyEnemyTint(slot.sprite, slot.state.enraged ? 0xff6666 : null, slot.state.baseTint);
            }
          });
        };

        if (slot.state.reactDelayTimer) slot.state.reactDelayTimer.remove();
        if (enemyReactDelay > 0) {
          slot.state.reactDelayTimer = this.time.delayedCall(enemyReactDelay, runSpriteReaction);
        } else {
          slot.state.reactDelayTimer = null;
          runSpriteReaction();
        }
      } else {
        // Rect hit reaction
        const runRectReaction = () => {
          slot.rect.setFillStyle(0xffffff);
          this.time.delayedCall(80, () => slot.rect.setFillStyle(0xef4444));

          this.tweens.killTweensOf(slot.rect);
          slot.rect.setScale(1);
          slot.rect.x = 0;
          this.tweens.add({
            targets: slot.rect,
            scaleX: 0.85,
            scaleY: 1.15,
            x: sIsPowerSmash ? 16 : 8,
            duration: forceEnemyRecoil ? 45 : 60,
            ease: 'Quad.easeOut',
            yoyo: true,
          });
        };

        if (enemyReactDelay > 0) {
          this.time.delayedCall(enemyReactDelay, runRectReaction);
        } else {
          runRectReaction();
        }
      }
  }

  _onEnemyRegen(data) {
    const slot = this._getSlotByInstanceId(data.instanceId);
    if (!slot) return;

    // Update HP bar
    const ratio = data.maxHp.gt(0) ? data.remainingHp.div(data.maxHp).toNumber() : 0;
    const barWidth = Math.max(0, ratio * 100);
    slot.hpBarFill.setDisplaySize(barWidth, 8);
    const color = ratio > 0.5 ? 0x22c55e : ratio > 0.25 ? 0xeab308 : 0xef4444;
    slot.hpBarFill.setFillStyle(color);

    // Green floating heal number
    const x = slot.baseX + (Math.random() - 0.5) * 40;
    const y = slot.baseY - 60;
    const text = this.add.text(x, y, `+${data.amount}`, {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#4ade80',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    const dur = UI.damageNumbers.duration;
    this.tweens.add({
      targets: text,
      y: y - UI.damageNumbers.floatDistance,
      duration: dur,
      ease: 'Power2',
    });
    this.tweens.add({
      targets: text,
      alpha: 0,
      delay: dur * 0.7,
      duration: dur * 0.3,
      ease: 'Linear',
      onComplete: () => text.destroy(),
    });
  }

  _onEnemyEnraged(data) {
    const slot = this._getSlotByInstanceId(data.instanceId);
    if (!slot) return;
    const isSlimefang = data?.enemyId === 'boss_a1z5_the_hollow';

    // Add enrage indicator as new trait object
    const hasEnrage = slot.traitObjs.some(t => t.text === '▲');
    if (!hasEnrage) {
      const txt = this.add.text(slot._nextTraitX, slot._traitY, '▲', {
        fontFamily: 'monospace', fontSize: '13px', color: '#ef4444',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0, 0.5);
      slot.container.add(txt);
      slot.traitObjs.push(txt);
      slot._nextTraitX += txt.width + 1;
    }

    // Persistent red tint on sprite/rect
    slot.state.enraged = true;
    if (slot.state.currentSprites) {
      this._applyEnemyTint(slot.sprite, 0xff6666, slot.state.baseTint);
    } else {
      slot.rect.setFillStyle(0xff4444);
    }
    if (data?.durationMs > 0 && data?.timerKey) {
      slot.state.castTimerKey = data.timerKey;
      slot.state.castKind = 'enrage';
      slot.state.castDurationMs = data.durationMs;
      slot.chargeBarBg.setVisible(true).setAlpha(1);
      slot.chargeBarFill.setDisplaySize(100, 4).setVisible(true).setAlpha(1).setFillStyle(0xef4444);
      slot.castText.setVisible(true).setText(`${(data.durationMs / 1000).toFixed(1)}s`);
    }

    this._announceEnrage(isSlimefang);

    // "ENRAGED!" floating text
    const x = slot.baseX;
    const y = slot.baseY - 80;
    const text = this.add.text(x, y, 'ENRAGED!', {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#ff4444',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
      shadow: { offsetX: 0, offsetY: 0, color: '#ff0000', blur: 10, fill: true },
    }).setOrigin(0.5);

    const dur = UI.damageNumbers.duration * 1.2;
    this.tweens.add({
      targets: text,
      y: y - UI.damageNumbers.floatDistance,
      duration: dur,
      ease: 'Power2',
    });
    this.tweens.add({
      targets: text,
      alpha: 0,
      delay: dur * 0.7,
      duration: dur * 0.3,
      ease: 'Linear',
      onComplete: () => text.destroy(),
    });
  }

  _onEnemyEnrageEnded(data) {
    const slot = this._getSlotByInstanceId(data.instanceId);
    if (!slot) return;

    slot.state.enraged = false;
    if (slot.state.currentSprites) {
      this._applyEnemyTint(slot.sprite, null, slot.state.baseTint);
    } else {
      slot.rect.setFillStyle(0xef4444);
    }

    const remove = slot.traitObjs.filter(t => t.text === '▲');
    for (const t of remove) {
      t.destroy();
      slot.traitObjs = slot.traitObjs.filter(obj => obj !== t);
    }
    let traitX = 56;
    for (const t of slot.traitObjs) {
      t.setX(traitX);
      traitX += t.width + 1;
    }
    slot._nextTraitX = traitX;

    if (slot.state.castKind === 'enrage') {
      this._restoreSlotAutoChargeBar(slot);
    }
  }

  _onArmorBroken(data) {
    const slot = this._getSlotByInstanceId(data.instanceId);
    if (!slot) return;

    // Remove existing overlay if re-applied
    if (slot.state.armorCrackOverlay) {
      slot.state.armorCrackOverlay.destroy();
      slot.state.armorCrackOverlay = null;
    }

    const overlay = this.add.image(
      slot.sprite.x,
      slot.sprite.y,
      'crackedarmor001'
    );
    overlay.setDisplaySize(slot.state.spriteW * 0.5, slot.state.spriteH * 0.5);
    overlay.setAlpha(0.6);
    overlay.setDepth(slot.sprite.depth + 1);
    slot.container.add(overlay);
    slot.state.armorCrackOverlay = overlay;
    slot.state.extraObjects.push(overlay);
  }

  _onArmorRestored(data) {
    const slot = this._getSlotByInstanceId(data.instanceId);
    if (!slot) return;
    if (!slot.state.armorCrackOverlay) return;

    const overlay = slot.state.armorCrackOverlay;
    this.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: 300,
      ease: 'Linear',
      onComplete: () => {
        overlay.destroy();
        slot.state.extraObjects = slot.state.extraObjects.filter(o => o !== overlay);
      },
    });
    slot.state.armorCrackOverlay = null;
  }

  _onThornsDamage(data) {
    // Purple damage number on the player (thorns reflects damage back)
    const x = this._playerX + (Math.random() - 0.5) * 40;
    const y = this._combatY - 60;
    const text = this.add.text(x, y, `-${data.amount}`, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#c084fc',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    const dur = UI.damageNumbers.duration;
    this.tweens.add({
      targets: text,
      y: y - UI.damageNumbers.floatDistance * 0.7,
      duration: dur,
      ease: 'Power2',
    });
    this.tweens.add({
      targets: text,
      alpha: 0,
      delay: dur * 0.7,
      duration: dur * 0.3,
      ease: 'Linear',
      onComplete: () => text.destroy(),
    });
  }

  _onEnemyKilled(data) {
    if (data.despawned) return;

    const slot = this._getSlotByInstanceId(data.instanceId);
      if (!slot) return;
      slot.state.castTimerKey = null;
      slot.state.castKind = null;
      slot.state.castDurationMs = 0;
      slot.state.dying = true;

      // Remove armor crack overlay immediately on death
      if (slot.state.armorCrackOverlay) {
        slot.state.armorCrackOverlay.destroy();
        slot.state.extraObjects = slot.state.extraObjects.filter(o => o !== slot.state.armorCrackOverlay);
        slot.state.armorCrackOverlay = null;
      }

      // Kill tweens + clear timers
      this.tweens.killTweensOf(slot.sprite);
      this.tweens.killTweensOf(slot.rect);
      if (slot.state.reactDelayTimer) { slot.state.reactDelayTimer.remove(); slot.state.reactDelayTimer = null; }
      if (slot.state.poseRevertTimer) { slot.state.poseRevertTimer.remove(); slot.state.poseRevertTimer = null; }
      if (slot.state.flapTimer) { slot.state.flapTimer.remove(); slot.state.flapTimer = null; }

      if (slot.state.currentSprites) {
        slot.sprite.setTexture(slot.state.currentSprites.dead);
        slot.sprite.setDisplaySize(slot.state.spriteW, slot.state.spriteH);
        slot.sprite.y = slot.state.spriteOffsetY + slot.state.bottomAlignOffsetY;
        slot.sprite.disableInteractive();

        if (slot.state.enemyId === 'a1_forest_rat' || slot.state.enemyId === 'a1_rat') {
          // Annoying Rat death: launch backward and upward.
          const liftY = slot.sprite.y - 260;
          this.tweens.add({
            targets: slot.sprite,
            x: 360,
            y: liftY,
            angle: 540,
            duration: 420,
            ease: 'Quad.easeOut',
            onComplete: () => {
              // Continue flying off-screen so it never appears frozen at the edge.
              this.tweens.add({
                targets: slot.sprite,
                x: 760,
                y: liftY - 120,
                duration: 240,
                ease: 'Quad.easeIn',
                onComplete: () => {
                  if (!slot.state.dying) return;
                  slot.container.setVisible(false);
                },
              });
            },
          });
        } else if (slot.state.enemyId === 'boss_a1z5_the_hollow') {
          // Slimefang: dead pose lingers while quake intensity ramps up, then fades over 10s.
          const absX = slot.baseX + slot.sprite.x;
          const absY = slot.baseY + slot.sprite.y;
          const corpse = this.add.image(absX, absY, slot.state.currentSprites.dead)
            .setDisplaySize(slot.state.spriteW, slot.state.spriteH)
            .setAlpha(1)
            .setDepth((slot.container.depth ?? 0) + 1);
          const tint = slot.sprite.tintTopLeft;
          if (typeof tint === 'number' && Number.isFinite(tint)) {
            corpse.setTint(tint);
          }

          // Hide the slot-bound sprite immediately; detached corpse continues even if slot is reused.
          slot.sprite.setAlpha(0);

          const shakeState = { amp: 1.5, rot: 1 };
          const shakeTimer = this.time.addEvent({
            delay: 65,
            loop: true,
            callback: () => {
              if (!corpse.active) return;
              corpse.x = absX + (Math.random() * 2 - 1) * shakeState.amp;
              corpse.y = absY + (Math.random() * 2 - 1) * (shakeState.amp * 0.55);
              corpse.angle = (Math.random() * 2 - 1) * shakeState.rot;
            },
          });

          this.tweens.add({
            targets: shakeState,
            amp: 34,
            rot: 19,
            duration: 10000,
            ease: 'Quad.easeIn',
          });
          this.tweens.add({
            targets: corpse,
            alpha: 0,
            duration: 10000,
            ease: 'Linear',
            onComplete: () => {
              shakeTimer.remove(false);
              corpse.destroy();
            },
          });
        } else if (
          slot.state.enemyId === 'a1_hollow_slime'
          || slot.state.enemyId === 'a1_slime'
        ) {
          // Friendly Slime: oversized death pose, then squash wider/shorter while fading.
          slot.sprite.setDisplaySize(slot.state.spriteW * 1.3, slot.state.spriteH * 1.3);
          slot.sprite.x = 0;
          this.tweens.add({
            targets: slot.sprite,
            scaleX: slot.sprite.scaleX * 1.45,
            scaleY: slot.sprite.scaleY * 0.55,
            alpha: 0,
            duration: 700,
            ease: 'Quad.easeIn',
          });
        } else if (slot.state.enemyId === 'a1_blighted_stalker' || slot.state.enemyId === 'a2_zombie') {
          // Decapitation — head is scene-level (absolute coords)
          const isZombie = slot.state.enemyId === 'a2_zombie';
          const dead2Key = isZombie ? 'bogzombie_dead2' : 'blightedstalker_dead2';
          const headKey = isZombie ? 'bogzombie_head' : 'blightedstalker_head';
          slot.sprite.setTexture(dead2Key);
          slot.sprite.setDisplaySize(slot.state.spriteW, slot.state.spriteH);

          const headSize = 80;
          const headX = slot.baseX + slot.sprite.x;
          const headY = slot.baseY + slot.sprite.y - slot.sprite.displayHeight / 2 - headSize * 0.25;
          const head = this.add.image(headX, headY, headKey)
            .setDisplaySize(headSize, headSize)
            .setDepth(slot.sprite.depth + 1);
          slot.state.extraObjects.push(head);

          this.tweens.add({
            targets: head,
            x: headX + 120, y: headY - 200,
            angle: 360 + Math.random() * 180,
            scaleX: 0.4, scaleY: 0.4, alpha: 0,
            duration: 700, ease: 'Quad.easeOut',
            onComplete: () => {
              head.destroy();
              slot.state.extraObjects = slot.state.extraObjects.filter(o => o !== head);
            },
          });

          this.tweens.add({
            targets: slot.sprite,
            alpha: 0, delay: 300, duration: 400, ease: 'Linear',
          });
        } else if (slot.state.enemyId === 'a1_big_slime') {
          // Greater Slime split — dead sprite fades, two small slimes emerge and split apart
          const absX = slot.baseX + slot.sprite.x;
          const absY = slot.baseY + slot.sprite.y;
          const childW = 160;  // Friendly Slime sprite size
          const childH = 240;

          // 1. Fade out the dead sprite
          this.tweens.add({
            targets: slot.sprite,
            alpha: 0, duration: 500, ease: 'Sine.easeIn',
          });

          // 2. Create two child slime sprites (default pose) at the center, initially invisible
          const leftChild = this.add.image(absX, absY, 'slime001_default')
            .setDisplaySize(childW, childH).setAlpha(0)
            .setDepth(slot.sprite.depth + 1);
          const rightChild = this.add.image(absX, absY, 'slime001_default')
            .setDisplaySize(childW, childH).setAlpha(0)
            .setDepth(slot.sprite.depth + 1);
          slot.state.extraObjects.push(leftChild, rightChild);

          // 3. After a short delay, fade children in while splitting apart
          this.time.delayedCall(350, () => {
            // Fade in + split left
            this.tweens.add({
              targets: leftChild,
              x: absX - 100, alpha: 1,
              duration: 350, ease: 'Quad.easeOut',
            });
            // Fade in + split right
            this.tweens.add({
              targets: rightChild,
              x: absX + 100, alpha: 1,
              duration: 350, ease: 'Quad.easeOut',
            });

            // 4. Hold briefly, then fade out before real spawns arrive at 1000ms
            this.time.delayedCall(450, () => {
              const cleanup = (obj) => {
                obj.destroy();
                slot.state.extraObjects = slot.state.extraObjects.filter(o => o !== obj);
              };
              this.tweens.add({
                targets: leftChild, alpha: 0, duration: 150, ease: 'Linear',
                onComplete: () => cleanup(leftChild),
              });
              this.tweens.add({
                targets: rightChild, alpha: 0, duration: 150, ease: 'Linear',
                onComplete: () => cleanup(rightChild),
              });
            });
          });
        } else if (slot.state.enemyId === 'a2_insect_swarm') {
          // Swarm dispersal — expand outward while fading
          const bsX = slot.sprite.scaleX;
          const bsY = slot.sprite.scaleY;
          this.tweens.add({
            targets: slot.sprite,
            scaleX: bsX * 2.5, scaleY: bsY * 2.5, alpha: 0,
            duration: 600, ease: 'Sine.easeOut',
          });
        } else if (slot.state.enemyId === 'a2_vine_crawler') {
          // Vine collapse — squish downward into the ground while fading
          slot.sprite.setOrigin(0.5, 1);
          slot.sprite.y += slot.sprite.displayHeight / 2;
          const bsY = slot.sprite.scaleY;
          this.tweens.add({
            targets: slot.sprite,
            scaleY: bsY * 0.05, alpha: 0,
            duration: 600, ease: 'Quad.easeIn',
          });
        } else if (slot.state.enemyId === 'a2_bog_revenant') {
          // Split in half — upper half pops up and falls
          const absX = slot.baseX + slot.sprite.x;
          const absY = slot.baseY + slot.sprite.y;
          const dw = slot.state.spriteW;
          const dh = slot.state.spriteH;
          const tex = this.textures.get('bogrevenant001_dead');
          const frame = tex.get();
          const fw = frame.width;
          const fh = frame.height;
          const halfFh = Math.floor(fh / 2);

          // Bottom half — stays in place, fades out
          const bottom = this.add.image(absX, absY, 'bogrevenant001_dead')
            .setDisplaySize(dw, dh)
            .setCrop(0, halfFh, fw, fh - halfFh)
            .setDepth(slot.sprite.depth + 1);
          slot.state.extraObjects.push(bottom);
          this.tweens.add({
            targets: bottom, alpha: 0, delay: 400, duration: 400, ease: 'Linear',
            onComplete: () => { bottom.destroy(); slot.state.extraObjects = slot.state.extraObjects.filter(o => o !== bottom); },
          });

          // Upper half — pops up then falls with rotation
          const top = this.add.image(absX, absY, 'bogrevenant001_dead')
            .setDisplaySize(dw, dh)
            .setCrop(0, 0, fw, halfFh)
            .setDepth(slot.sprite.depth + 2);
          slot.state.extraObjects.push(top);
          this.tweens.add({
            targets: top,
            y: absY - dh / 2 - 60,
            angle: -25,
            duration: 350, ease: 'Quad.easeOut',
            onComplete: () => {
              this.tweens.add({
                targets: top,
                y: absY + dh, angle: 15, alpha: 0,
                duration: 450, ease: 'Quad.easeIn',
                onComplete: () => { top.destroy(); slot.state.extraObjects = slot.state.extraObjects.filter(o => o !== top); },
              });
            },
          });

          // Hide original sprite
          slot.sprite.setAlpha(0);
        } else {
          // Default: knockback then slide away — local coords
          this.tweens.add({
            targets: slot.sprite,
            x: 40, duration: 120, ease: 'Quad.easeOut',
            onComplete: () => {
              this.tweens.add({
                targets: slot.sprite,
                x: 250, alpha: 0, duration: 200, ease: 'Quad.easeIn',
              });
            },
          });
        }

        // Fade name/HP
        this.tweens.add({
          targets: [slot.nameText, ...slot.traitObjs, slot.hpBarBg, slot.hpBarFill, slot.chargeBarBg, slot.chargeBarFill],
          alpha: 0, duration: 150, ease: 'Power2',
        });
      } else {
        // Rect death — local coords
        slot.rect.disableInteractive();
        this.tweens.add({
          targets: slot.rect,
          x: 40, scaleX: 1.2, scaleY: 1.2,
          duration: 120, ease: 'Quad.easeOut',
          onComplete: () => {
            this.tweens.add({
              targets: slot.rect,
              x: 250, alpha: 0, scaleX: 0.5, scaleY: 0.5,
              duration: 200, ease: 'Quad.easeIn',
            });
            this.tweens.add({
              targets: [slot.nameText, ...slot.traitObjs, slot.hpBarBg, slot.hpBarFill, slot.chargeBarBg, slot.chargeBarFill],
              alpha: 0, duration: 150, ease: 'Power2',
            });
          },
        });
      }

      // Gold particles from slot position
      this._spawnGoldParticles(slot.baseX, slot.baseY);
  }

  // â”€â”€ Damage numbers (magnitude-tiered) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _spawnDamageNumber(amount, isCrit, isPowerSmash = false, targetX = null, targetY = null) {
    const baseX = targetX ?? this._enemyX;
    const baseY = targetY ?? this._enemyY;
    const xOffset = (Math.random() - 0.5) * 60;
    const x = baseX + xOffset;
    const y = baseY - 50;

    // Select tier by magnitude
    const mag = amount.toNumber ? amount.toNumber() : Number(amount);
    const tiers = UI.damageNumbers.tiers;
    let tier = tiers[0];
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (mag >= tiers[i].min) {
        tier = tiers[i];
        break;
      }
    }

    let fontSize = tier.fontSize;
    if (isPowerSmash) fontSize += 8;
    else if (isCrit) fontSize += UI.damageNumbers.critBonusSize;

    // Power Smash appends ' SMASH!', crit appends '!'
    let suffix = '';
    if (isPowerSmash) suffix = ' SMASH!';
    else if (isCrit) suffix = '!';
    const displayText = format(amount) + suffix;

    // Power Smash + crit = crit yellow; Power Smash alone = orange
    let textColor;
    if (isPowerSmash && isCrit) textColor = '#fde047';
    else if (isPowerSmash) textColor = '#f97316';
    else if (isCrit) textColor = '#fde047';
    else textColor = tier.color;

    const textStyle = {
      fontFamily: 'monospace',
      fontSize: `${fontSize}px`,
      color: textColor,
      fontStyle: tier.style,
      stroke: '#000000',
      strokeThickness: isPowerSmash ? 5 : 4,
    };

    // Power Smash always gets orange glow
    if (isPowerSmash) {
      textStyle.shadow = {
        offsetX: 0,
        offsetY: 0,
        color: '#f97316',
        blur: 12,
        fill: true,
      };
    } else if (tier.min >= 1e6) {
      // 1M+ tier gets glow shadow
      textStyle.shadow = {
        offsetX: 0,
        offsetY: 0,
        color: '#f59e0b',
        blur: 8,
        fill: true,
      };
    }

    const text = this.add.text(x, y, displayText, textStyle).setOrigin(0.5);

    // Screen shake for big hits
    if (tier.shake > 0) {
      this.cameras.main.shake(100, tier.shake);
    }

    const dur = UI.damageNumbers.duration;

    // Float upward at full opacity
    this.tweens.add({
      targets: text,
      y: y - UI.damageNumbers.floatDistance,
      duration: dur,
      ease: 'Power2',
    });

    // Quick fade only in the last 30%
    this.tweens.add({
      targets: text,
      alpha: 0,
      delay: dur * 0.7,
      duration: dur * 0.3,
      ease: 'Linear',
      onComplete: () => text.destroy(),
    });
  }

  _spawnSmashDamageText(amount, targetX = null, targetY = null) {
    const ga = LAYOUT.gameArea;
    const baseX = targetX ?? this._enemyX;
    const baseY = targetY ?? this._enemyY;

    // Quick red screen flash on Smash impact.
    const overlay = this.add.rectangle(
      ga.x + ga.w / 2,
      ga.y + ga.h / 2,
      ga.w,
      ga.h,
      0xef4444,
      0.24
    ).setDepth(95);

    this.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => overlay.destroy(),
    });

    const text = this.add.text(baseX + 8, baseY - 52, `SMASH ${format(amount)}`, {
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize: '40px',
      fontStyle: 'bold',
      color: '#ef4444',
      stroke: '#000000',
      strokeThickness: 6,
      shadow: {
        offsetX: 0,
        offsetY: 0,
        color: '#7f1d1d',
        blur: 10,
        fill: true,
      },
    }).setOrigin(0.5).setDepth(120).setScale(1.06);

    // Fly backward from the enemy (enemy side -> further right) while fading.
    this.tweens.add({
      targets: text,
      x: baseX + 150,
      y: baseY - 82,
      angle: -10,
      scaleX: 0.95,
      scaleY: 0.95,
      duration: 500,
      ease: 'Cubic.easeOut',
    });
    this.tweens.add({
      targets: text,
      alpha: 0,
      delay: 380,
      duration: 320,
      ease: 'Linear',
      onComplete: () => text.destroy(),
    });
  }

  _spawnDodgeText() {
    const x = this._playerX + (Math.random() - 0.5) * 30;
    const y = this._combatY - 130;
    const text = this.add.text(x, y, 'DODGE!', {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#22d3ee',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: text,
      y: y - 55,
      duration: 900,
      ease: 'Power2',
    });
    this.tweens.add({
      targets: text,
      alpha: 0,
      delay: 520,
      duration: 380,
      ease: 'Linear',
      onComplete: () => text.destroy(),
    });
  }

  _spawnMissText(x, y) {
    const text = this.add.text(x, y, 'MISS!', {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#e5e7eb',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: text,
      y: y - 55,
      duration: 900,
      ease: 'Power2',
    });
    this.tweens.add({
      targets: text,
      alpha: 0,
      delay: 520,
      duration: 380,
      ease: 'Linear',
      onComplete: () => text.destroy(),
    });
  }

  _spawnStatusText(x, y, label, color = '#ffffff') {
    const text = this.add.text(x, y, label, {
      fontFamily: 'monospace',
      fontSize: '20px',
      color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: text,
      y: y - 45,
      duration: 700,
      ease: 'Power2',
    });
    this.tweens.add({
      targets: text,
      alpha: 0,
      delay: 400,
      duration: 300,
      ease: 'Linear',
      onComplete: () => text.destroy(),
    });
  }

  // â”€â”€ Visual juice â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _spawnPlayerDamageNumber(amount) {
    const x = this._playerX + (Math.random() - 0.5) * 40;
    const y = this._combatY - 60;
    const text = this.add.text(x, y, format(amount), {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ef4444',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    const dur = UI.damageNumbers.duration;
    this.tweens.add({
      targets: text,
      y: y - UI.damageNumbers.floatDistance * 0.7,
      duration: dur,
      ease: 'Power2',
    });
    this.tweens.add({
      targets: text,
      alpha: 0,
      delay: dur * 0.7,
      duration: dur * 0.3,
      ease: 'Linear',
      onComplete: () => text.destroy(),
    });
  }

  _spawnGoldParticles(sourceX = null, sourceY = null) {
    const baseX = sourceX ?? this._enemyX;
    const baseY = sourceY ?? this._enemyY;
    const count = 5 + Math.floor(Math.random() * 4); // 5-8
    const targetX = 20;
    const targetY = 25;

    for (let i = 0; i < count; i++) {
      const startX = baseX + (Math.random() - 0.5) * 40;
      const startY = baseY + (Math.random() - 0.5) * 40;
      const particle = this.add.circle(startX, startY, 3, 0xeab308);

      // Arc offset for variety
      const arcX = (Math.random() - 0.5) * 80;
      const arcY = -30 - Math.random() * 40;
      const controlX = (startX + targetX) / 2 + arcX;
      const controlY = (startY + targetY) / 2 + arcY;

      const duration = 400 + Math.random() * 200;
      const path = { t: 0 };

      this.tweens.add({
        targets: path,
        t: 1,
        duration,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          const t = path.t;
          const oneMinusT = 1 - t;
          // Quadratic Bezier interpolation (start -> control -> target).
          particle.x = oneMinusT * oneMinusT * startX + 2 * oneMinusT * t * controlX + t * t * targetX;
          particle.y = oneMinusT * oneMinusT * startY + 2 * oneMinusT * t * controlY + t * t * targetY;
        },
        onComplete: () => particle.destroy(),
      });
    }
  }

  _onLevelUp() {
    const ga = LAYOUT.gameArea;
    const overlay = this.add.rectangle(
      ga.x + ga.w / 2, ga.y + ga.h / 2,
      ga.w, ga.h,
      0xeab308, 0.3
    );
    this.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
      onComplete: () => overlay.destroy(),
    });
  }

  _onEnemyAttacked(data) {
    const slot = this._getSlotByInstanceId(data.instanceId);
      if (!slot) return;

      if (slot.state.currentSprites) {
        slot.sprite.setTexture(slot.state.currentSprites.attack);
        const atkScale = slot.state.attackSpriteScale;
        slot.sprite.setDisplaySize(slot.state.spriteW * atkScale, slot.state.spriteH * atkScale);

        // Reset to local home position before lunge
        this.tweens.killTweensOf(slot.sprite);
        slot.sprite.x = slot.state.attackSpriteOffsetX;
        const atkOffsetY = slot.state.attackSpriteOffsetY ?? slot.state.spriteOffsetY;
        slot.sprite.y = atkOffsetY + slot.state.bottomAlignOffsetY;

        const isLeaper = slot.state.enemyId === 'a1_forest_rat'
          || slot.state.enemyId === 'a1_rat'
          || slot.state.enemyId === 'a1_hollow_slime';
        const lungeDist = isLeaper ? slot.state.lungeDist * 2 : slot.state.lungeDist;
        const lungeProps = { x: -lungeDist };
        // Leaper lunge Y: local -100 (container is at _enemyY = _combatY + 40, target ~_combatY - 60)
        if (isLeaper) lungeProps.y = -100;

        this._lockWalk();
        this.tweens.add({
          targets: slot.sprite,
          ...lungeProps,
          duration: isLeaper ? 120 : 80,
          ease: 'Quad.easeOut',
          yoyo: true,
        });

        // If replacing an existing timer, balance the lock count it would have released
        if (slot.state.poseRevertTimer) {
          slot.state.poseRevertTimer.remove();
          this._unlockWalk();
        }
        slot.state.poseRevertTimer = this.time.delayedCall(500, () => {
          if (slot.state.currentSprites) {
            slot.sprite.setTexture(slot.state.currentSprites.default);
            slot.sprite.setDisplaySize(slot.state.spriteW, slot.state.spriteH);
            slot.sprite.x = 0;
            slot.sprite.y = slot.state.spriteOffsetY + slot.state.bottomAlignOffsetY;
          }
          this._unlockWalk();
        });
      } else {
        // Rect lunge — local coords
        this.tweens.add({
          targets: slot.rect,
          x: -slot.state.lungeDist,
          duration: 80,
          ease: 'Quad.easeOut',
          yoyo: true,
        });
      }
  }

  _onEnemyDodged(_data) {
    this._spawnDodgeText();
  }

  _restoreSlotAutoChargeBar(slot) {
    slot.state.castTimerKey = null;
    slot.state.castKind = null;
    slot.state.castDurationMs = 0;
    slot.chargeBarFill.setFillStyle(0xef4444);
    slot.chargeBarFill.setDisplaySize(0, 4).setVisible(false);
    slot.chargeBarBg.setVisible(false);
    slot.castText.setVisible(false).setText('');
  }

  _onEnemyCasting(data) {
    const slot = this._getSlotByInstanceId(data.instanceId) || this._getSlotByIndex(data.slot);
    if (!slot) return;
    if (data.castKind === 'charge') {
      slot.state.castTimerKey = `enc:${data.encounterId}:chargeCast:${data.instanceId}`;
      slot.state.castKind = 'charge';
      slot.state.castDurationMs = data.castTime || 0;
      slot.chargeBarBg.setVisible(true).setAlpha(1);
      slot.chargeBarFill.setDisplaySize(0, 4).setVisible(true).setAlpha(1).setFillStyle(0xf59e0b);
      slot.castText.setVisible(false).setText('');
      this._spawnStatusText(slot.baseX, slot.baseY - 115, 'CHARGING!', '#f59e0b');
      return;
    }
    if (data.castKind === 'respawn') {
      slot.state.castTimerKey = data.timerKey || null;
      slot.state.castKind = 'respawn';
      slot.state.castDurationMs = data.castTime || 0;
      slot.chargeBarBg.setVisible(true).setAlpha(1);
      slot.chargeBarFill.setDisplaySize(100, 4).setVisible(true).setAlpha(1).setFillStyle(0x38bdf8);
      slot.castText.setVisible(true).setText(`${((data.castTime || 0) / 1000).toFixed(1)}s`);
      this._spawnStatusText(slot.baseX, slot.baseY - 115, 'SLIME REFORMING', '#38bdf8');
      return;
    }
    this._spawnStatusText(slot.baseX, slot.baseY - 115, 'CASTING', '#f59e0b');
  }

  _onChargeResolved(data) {
    const slot = this._getSlotByInstanceId(data.instanceId);
    if (!slot) return;
    this._restoreSlotAutoChargeBar(slot);
  }

  _onInterrupted(data) {
    const slot = this._getSlotByInstanceId(data.instanceId);
    if (!slot) return;
    if (data.kind === 'charge') {
      this._restoreSlotAutoChargeBar(slot);
    }
    this._spawnStatusText(slot.baseX, slot.baseY - 115, 'INTERRUPTED!', '#22d3ee');
  }

  _onPlayerMissed(data) {
    const slot = this._getSlotByInstanceId(data.instanceId);
    if (!slot) return;
    this._spawnMissText(slot.baseX, slot.baseY - 80);
  }

  _onCorruptionChanged(data) {
    if (data.reason !== 'gain') return;
    this._spawnStatusText(this._playerX, this._combatY - 150, `CORRUPTION x${data.stacks}`, '#f472b6');
  }

  _onCorruptionCleansed(_data) {
    this._spawnStatusText(this._playerX, this._combatY - 150, 'CLEANSED', '#34d399');
  }

  _onPlayerDamaged(data) {
    // Update player HP bar
    const ratio = data.maxHp.gt(0) ? data.remainingHp.div(data.maxHp).toNumber() : 0;
    const barWidth = Math.max(0, ratio * 100);
    this.playerHpBarFill.setDisplaySize(barWidth, 8);
    const color = ratio > 0.5 ? 0x22c55e : ratio > 0.25 ? 0xeab308 : 0xef4444;
    this.playerHpBarFill.setFillStyle(color);

    // Skip hit reaction for zero-damage events (heals/regen reuse this event for HP bar updates).
    if (data.amount.lte(0)) return;

    // Red damage number above player
    this._spawnPlayerDamageNumber(data.amount);

    if (this._isSkillVisualLocked()) return;

    // Skip hit reaction visuals in fortress stance, while charging, or while holding attack pose
    const stance = Store.getState().currentStance;
    const now = this.time.now;
    if (!this._powerCharging && stance !== 'fortress'
        && now - (this._lastHitReactTime || 0) >= 1200) {
      this._lastHitReactTime = now;
      this._hitReacting = true;
      this._playerAttacking = false;
      this._powerCharging = false;
      this._attackLockCount = 0;
      this._walkTimer.paused = true;
      // Cancel any pending attack pose revert
      if (this._playerPoseTimer) {
        this._playerPoseTimer.remove();
        this._playerPoseTimer = null;
      }
      // Show reaction immediately (no delay — priority override)
      this.tweens.killTweensOf(this.playerRect);
      this.playerRect.x = this._playerX;
      this.playerRect.setTexture(this._armorSet.hitReaction);
      this.playerRect.setDisplaySize(300, 375);
      this.playerRect.y = this._combatY;
      this.playerRect.setTint(0xef4444);
      // Knockback on hit (away from enemy = left)
      this.tweens.add({
        targets: this.playerRect,
        x: this._playerX - 12,
        duration: 80,
        ease: 'Quad.easeOut',
        yoyo: true,
      });
      this.time.delayedCall(120, () => {
        if (this.playerRect && !this._hitReacting) this._applyStanceTint(Store.getState().currentStance);
      });
      this._playerPoseTimer = this.time.delayedCall(350, () => {
        this._hitReacting = false;
        this._attackLockCount = 0;
        this._walkTimer.elapsed = 0;
        this._walkTimer.paused = false;
        this._applyStanceTint(Store.getState().currentStance);
      });
    }
  }

  _onPlayerDied() {
    this._playerAttacking = false;

    // Hide shield bar
    this._shieldMaxHp = 0;
    this.shieldBarBg.setVisible(false);
    this.shieldBarFill.setVisible(false);
    this._bulwarkVisualEndAt = 0;
    this._bulwarkVisualDurationMs = 0;
    this._lastShieldHp = 0;
    if (this._bulwarkShakeTween) {
      this.tweens.killTweensOf(this._bulwarkVisual);
      this._bulwarkShakeTween = null;
    }
    if (this._bulwarkVisual) {
      this._bulwarkVisual.setPosition(this._bulwarkAnchorX, this._bulwarkAnchorY);
      this._bulwarkVisual.setAngle(0);
    }
    this._destroyBulwarkBreakFx();
    this._syncBulwarkVisual(true);

    const ga = LAYOUT.gameArea;

    // 1. Camera shake
    this.cameras.main.shake(250, 0.01);

    // 2. Red screen overlay (fades out over 800ms)
    const overlay = this.add.rectangle(
      ga.x + ga.w / 2, ga.y + ga.h / 2,
      ga.w, ga.h,
      0xef4444, 0.35
    );
    this.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => overlay.destroy(),
    });

    // 3. "DEFEATED" floating text
    const defText = this.add.text(
      ga.x + ga.w / 2, ga.y + ga.h / 2,
      'DEFEATED',
      {
        fontFamily: 'monospace',
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ef4444',
        stroke: '#ffffff',
        strokeThickness: 4,
      }
    ).setOrigin(0.5);
    this.tweens.add({
      targets: defText,
      y: defText.y - 60,
      duration: 1200,
      ease: 'Power2',
    });
    this.tweens.add({
      targets: defText,
      alpha: 0,
      delay: 840,
      duration: 360,
      ease: 'Linear',
      onComplete: () => defText.destroy(),
    });

    // 4. Player sprite death pose + knockback slide away
    this._walkTimer.paused = true;
    if (this._playerPoseTimer) this._playerPoseTimer.remove();
    this.tweens.killTweensOf(this.playerRect);
    this.playerRect.setTexture(this._armorSet.hitReaction);

    this.playerRect.setDisplaySize(300, 375);
    this.playerRect.setTint(0xef4444);
    // Knockback then slide away to the left
    this.tweens.add({
      targets: this.playerRect,
      x: this._playerX - 40,
      duration: 120,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: this.playerRect,
          x: this._playerX - 250,
          alpha: 0,
          duration: 200,
          ease: 'Quad.easeIn',
        });
      },
    });

    // 5. Disable enemy click interaction during death
    for (const slot of this._enemySlots) {
      slot.sprite.disableInteractive();
      slot.rect.disableInteractive();
    }

    // 6. Respawn restoration after delay
    this.time.delayedCall(COMBAT_V2.playerDeathRespawnDelay, () => {
      // Restore player sprite
      this.tweens.killTweensOf(this.playerRect);
      this._applyStanceTint(Store.getState().currentStance);
      this.playerRect.setAlpha(1);
      this.playerRect.x = this._playerX;
      this.playerRect.setTexture(this._walkFrames[0]);

      this.playerRect.setDisplaySize(300, 375);
      this._applyStanceTint(Store.getState().currentStance);
      this._walkTimer.paused = false;

      // Restore HP bar
      this.playerHpBarFill.setDisplaySize(100, 8);
      this.playerHpBarFill.setFillStyle(0x22c55e);
    });
  }

  _onCheatGlitch() {
    const ga = LAYOUT.gameArea;

    // Green overlay
    const overlay = this.add.rectangle(
      ga.x + ga.w / 2, ga.y + ga.h / 2,
      ga.w, ga.h,
      0x22c55e, 0.15
    );

    // 3-4 horizontal static lines
    const lines = [];
    const lineCount = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < lineCount; i++) {
      const ly = ga.y + Math.random() * ga.h;
      const line = this.add.rectangle(
        ga.x + ga.w / 2, ly,
        ga.w, 2,
        0x22c55e, 0.6
      );
      lines.push(line);
    }

    // Brief camera shake
    this.cameras.main.shake(50, 0.003);

    // Clear all after 150ms
    this.time.delayedCall(150, () => {
      overlay.destroy();
      for (const line of lines) line.destroy();
    });
  }

  // â”€â”€ Parallax backgrounds â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _createParallax(zone) {
    const theme = ZONE_THEMES[zone];
    if (!theme) return;

    const ga = LAYOUT.gameArea;
    const skyH = Math.floor(ga.h * 0.83);
    const battleBottomY = ga.y + ga.h;
    const midLayerBottomTargetY = 390;
    const foregroundTopTargetY = 270;

    if (theme.images) {
      for (let layerIdx = 0; layerIdx < theme.images.length; layerIdx++) {
        const key = theme.images[layerIdx];
        const layerH = skyH;

        // Rear layer (sky): slow-scrolling dual-image
        if (layerIdx === 0) {
          const container = this.add.container(0, 0);
          container.setDepth(-3);
          container.setData('isSkyLayer', true);
          const skyY = ga.y - (theme.skyOffsetY ?? 0);
          const skyScale = theme.skyHeightScale ?? 1;
          const skyDisplayH = (ga.h + (theme.skyOffsetY ?? 0)) * skyScale;
          const img1 = this.add.image(ga.x, skyY, key).setOrigin(0, 0);
          img1.setDisplaySize(ga.w, skyDisplayH);
          const img2 = this.add.image(ga.x + ga.w, skyY, key).setOrigin(0, 0);
          img2.setDisplaySize(ga.w, skyDisplayH);
          container.setData('imgW', ga.w);
          container.add([img1, img2]);
          this._parallaxLayers.push(container);
          continue;
        }

        // Mid layer: dual-image horizontal scroll
        if (layerIdx === 1) {
          const container = this.add.container(0, 0);
          container.setDepth(-2);
          container.setData('isImageLayer', true);
          const midH = layerH * (theme.midLayerScale ?? 1);
          const midLayerY = (theme.midLayerBottomY ?? midLayerBottomTargetY) - midH;
          const img1 = this.add.image(ga.x, midLayerY, key).setOrigin(0, 0);
          img1.setDisplaySize(ga.w, midH);
          const img2 = this.add.image(ga.x + ga.w, midLayerY, key).setOrigin(0, 0);
          img2.setDisplaySize(ga.w, midH);
          container.setData('imgW', ga.w);
          container.add([img1, img2]);
          this._parallaxLayers.push(container);
          continue;
        }
      }

      // Tree rows (replaces front strip layer)
      this._parallaxFlat = !!theme.flatScroll;
      if (theme.trees) {
        this._createTreeRows(theme.trees, ga, theme);
      }
      if (theme.ferns) {
        this._createFernRows(theme.ferns, ga);
      }
    } else {
      // Rectangle-based fallback for zones without images (unchanged)
      for (let layerIdx = 0; layerIdx < theme.layers.length; layerIdx++) {
        const color = theme.layers[layerIdx];
        const container = this.add.container(0, 0);
        container.setDepth(-3 + layerIdx);

        const rectCount = 8 + Math.floor(Math.random() * 5);
        for (let r = 0; r < rectCount; r++) {
          const w = 20 + Math.random() * 60;
          const h = 20 + Math.random() * 80;
          const x = ga.x + Math.random() * ga.w;
          const y = ga.y + Math.random() * skyH;
          const rect = this.add.rectangle(x, y, w, h, color, 0.3 + Math.random() * 0.3);
          container.add(rect);
        }

        this._parallaxLayers.push(container);
      }
    }

    // Foreground band: fixed top edge, down to bottom of battle window
    const groundY = Math.max(ga.y, Math.min(battleBottomY - 1, foregroundTopTargetY));
    const groundH = Math.max(1, battleBottomY - groundY) * (theme.groundHeightScale ?? 1);
    const groundActualY = battleBottomY - groundH;
    const groundKey = theme.ground || 'foreground002';
    const gImg1 = this.add.image(ga.x, groundActualY, groundKey).setOrigin(0, 0);
    gImg1.setDisplaySize(ga.w, groundH);
    const gImg2 = this.add.image(ga.x + ga.w, groundActualY, groundKey).setOrigin(0, 0);
    gImg2.setDisplaySize(ga.w, groundH);
    this._groundContainer = this.add.container(0, 0);
    this._groundContainer.setDepth(-2.5);
    this._groundContainer.setData('imgW', ga.w);
    this._groundContainer.add([gImg1, gImg2]);

    // Bare ground overlay — sits above foreground002 but behind trees/ferns
    // Top aligns with mid fern row start (Y=445), bottom at game area bottom
    if (theme.images && !theme.ground && this.textures.exists('fg_bare')) {
      const bareY = 445;
      const bareH = battleBottomY - bareY;
      const bImg1 = this.add.image(ga.x, bareY, 'fg_bare').setOrigin(0, 0);
      bImg1.setDisplaySize(ga.w, bareH);
      const bImg2 = this.add.image(ga.x + ga.w, bareY, 'fg_bare').setOrigin(0, 0);
      bImg2.setDisplaySize(ga.w, bareH);
      this._bareGroundContainer = this.add.container(0, 0);
      this._bareGroundContainer.setDepth(-0.48);
      this._bareGroundContainer.setData('imgW', ga.w);
      this._bareGroundContainer.add([bImg1, bImg2]);
    }

    // Path overlay — on top of foreground, compressed to bottom of screen
    if (theme.path && this.textures.exists(theme.path)) {
      const pathH = theme.pathHeight ?? 100;
      const pathY = battleBottomY - pathH;
      const pImg1 = this.add.image(ga.x, pathY, theme.path).setOrigin(0, 0);
      pImg1.setDisplaySize(ga.w, pathH);
      const pImg2 = this.add.image(ga.x + ga.w, pathY, theme.path).setOrigin(0, 0);
      pImg2.setDisplaySize(ga.w, pathH);
      this._pathContainer = this.add.container(0, 0);
      this._pathContainer.setDepth(-2.4);
      this._pathContainer.setData('imgW', ga.w);
      this._pathContainer.add([pImg1, pImg2]);
    }
  }

  _createTreeRows(treeKeys, ga, theme = {}) {
    const diagRatio = PARALLAX.treeDiagRatio;
    const overrides = theme.treeRowOverrides || [];

    const rowCount = Math.max(TREE_ROWS.length, overrides.length);
    for (let ri = 0; ri < rowCount; ri++) {
      const base = TREE_ROWS[ri] || {};
      const row = { ...base, ...overrides[ri] };
      if (row.skip) continue;
      const container = this.add.container(0, 0);
      container.setDepth(row.depth);

      // Geometry mask â€” clip to game area
      const maskGfx = this.make.graphics({ x: 0, y: 0, add: false });
      maskGfx.fillRect(ga.x, ga.y, ga.w, ga.h);
      const mask = maskGfx.createGeometryMask();
      container.setMask(mask);
      container.setData('maskGfx', maskGfx);
      container.setData('mask', mask);
      container.setData('isTreeLayer', true);

      const trees = [];
      const yStart = ga.y + ga.h * row.yRange[0];   // top of Y band (spawn Y at right edge)
      const diagDrop = ga.w * diagRatio;              // total Y drop across full width
      const overrideKeys = overrides[ri] && Array.isArray(overrides[ri].keys) ? overrides[ri].keys : null;
      const rowKeys = overrideKeys || (treeKeys.length > 0 ? treeKeys : (Array.isArray(row.keys) && row.keys.length > 0 ? row.keys : []));

      for (let i = 0; i < row.count; i++) {
        const key = rowKeys[Math.floor(Math.random() * rowKeys.length)];
        const scale = row.scaleRange[0] + Math.random() * (row.scaleRange[1] - row.scaleRange[0]);
        const displayW = 1024 * scale;
        const displayH = 1536 * scale;

        // Distribute trees across 1.5× screen width so off-screen trees are queued on the right
        const spawnWidth = ga.w * 1.5;
        const progress = i / row.count + (Math.random() * 0.3) / row.count;
        const x = ga.x + spawnWidth * (1 - progress);
        const yBand = ga.h * (row.yRange[1] - row.yRange[0]);
        const scaleSpan = row.scaleRange[1] - row.scaleRange[0];
        const scaleT = scaleSpan > 0 ? (scale - row.scaleRange[0]) / scaleSpan : Math.random();
        const y = this._parallaxFlat
          ? yStart + scaleT * yBand
          : yStart + diagDrop * progress;

        const img = this.add.image(x, y, key).setOrigin(0.5, 1);
        img.setDisplaySize(displayW, displayH);
        if (row.alpha != null) img.setAlpha(row.alpha);
        if (row.tint != null) img.setTint(row.tint);
        if (this._parallaxFlat && row.depthSort) img.setDepth(y);

        container.add(img);
        trees.push({ img, displayW, displayH, depthSort: !!row.depthSort });
      }

      if (row.depthSort) {
        container.sort('y');
      }
      this._treeLayers.push({ container, row, trees, flatScroll: this._parallaxFlat });
    }
  }

  _createFernRows(fernKeys, ga) {
    if (!fernKeys || fernKeys.length === 0) return;

    // Fern band starts around the middle of the battle window.
    const bandTop = ga.y + Math.floor(ga.h * 0.5);
    const bandBottom = ga.y + ga.h;
    const bandHeight = Math.max(40, bandBottom - bandTop);
    const sliceH = bandHeight / FERN_ROWS.length;

    for (let rowIdx = 0; rowIdx < FERN_ROWS.length; rowIdx++) {
      const row = FERN_ROWS[rowIdx];
      const container = this.add.container(0, 0);
      container.setDepth(row.depth);

      const maskGfx = this.make.graphics({ x: 0, y: 0, add: false });
      maskGfx.fillRect(ga.x, ga.y, ga.w, ga.h);
      const mask = maskGfx.createGeometryMask();
      container.setMask(mask);
      container.setData('maskGfx', maskGfx);
      container.setData('mask', mask);
      container.setData('isFernLayer', true);

      const yMin = rowIdx === 0 ? 385 : rowIdx === 1 ? 415 : rowIdx === 2 ? 445 : rowIdx === 3 ? 540 : bandTop + rowIdx * sliceH;
      const yMax = rowIdx === 0 ? 390 : rowIdx === 1 ? 450 : rowIdx === 2 ? 490 : rowIdx === 3 ? 560 : bandTop + (rowIdx + 1) * sliceH + sliceH * 0.35;
      const sampleScale = (row.scaleRange[0] + row.scaleRange[1]) * 0.5;
      const sampleTex = this.textures.get(fernKeys[0]).getSourceImage();
      const sampleW = sampleTex.width * sampleScale;
      const step = Math.max(24, sampleW * row.xSpacingMult);
      const spawnStartX = ga.x - 220;
      const spawnEndX = ga.x + ga.w + 220;
      const count = Math.ceil((spawnEndX - spawnStartX) / step);
      const ferns = [];

      let lastX = spawnStartX - step;
      for (let i = 0; i < count; i++) {
        const key = fernKeys[Math.floor(Math.random() * fernKeys.length)];
        const scale = row.scaleRange[0] + Math.random() * (row.scaleRange[1] - row.scaleRange[0]);
        const tex = this.textures.get(key);
        const source = tex.getSourceImage();
        const displayW = source.width * scale;
        const displayH = source.height * scale;
        // Place at least one step from the previous fern, with slight forward jitter
        const x = lastX + step + Math.random() * step * 0.15;
        lastX = x;
        const y = yMin + Math.random() * Math.max(1, yMax - yMin);
        const img = this.add.image(x, y, key).setOrigin(0.5, 1);
        img.setDisplaySize(displayW, displayH);
        img.setAlpha(row.alpha);
        container.add(img);
        ferns.push({ img, displayW, displayH });
      }

      this._fernLayers.push({ container, row, ferns, yMin, yMax });
    }
  }

  _destroyParallax() {
    for (const layer of this._parallaxLayers) {
      if (!layer) continue;

      // Remove custom texture frames
      const textureKey = layer.getData && layer.getData('textureKey');
      const frameNames = layer.getData && layer.getData('frameNames');
      if (textureKey && frameNames) {
        const texture = this.textures.get(textureKey);
        for (const name of frameNames) {
          if (texture.has(name)) texture.remove(name);
        }
      }

      // Clean up geometry mask
      const maskRef = layer.getData && layer.getData('mask');
      const maskGfx = layer.getData && layer.getData('maskGfx');
      if (maskRef) layer.clearMask();
      if (maskRef) maskRef.destroy();
      if (maskGfx) maskGfx.destroy();

      layer.destroy(true);
    }
    this._parallaxLayers = [];
    for (const { container } of this._treeLayers) {
      const maskRef = container.getData && container.getData('mask');
      const maskGfx = container.getData && container.getData('maskGfx');
      if (maskRef) container.clearMask();
      if (maskRef) maskRef.destroy();
      if (maskGfx) maskGfx.destroy();
      container.destroy(true);
    }
    this._treeLayers = [];
    for (const { container } of this._fernLayers) {
      const maskRef = container.getData && container.getData('mask');
      const maskGfx = container.getData && container.getData('maskGfx');
      if (maskRef) container.clearMask();
      if (maskRef) maskRef.destroy();
      if (maskGfx) maskGfx.destroy();
      container.destroy(true);
    }
    this._fernLayers = [];
    if (this._groundContainer) {
      this._groundContainer.destroy(true);
      this._groundContainer = null;
    }
    if (this._bareGroundContainer) {
      this._bareGroundContainer.destroy(true);
      this._bareGroundContainer = null;
    }
    if (this._pathContainer) {
      this._pathContainer.destroy(true);
      this._pathContainer = null;
    }
  }

  _shutdown() {
    this.scene.stop('OverworldScene');
    this.scene.stop('UIScene');
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._destroyParallax();
    if (this._bulwarkShakeTween) {
      this.tweens.killTweensOf(this._bulwarkVisual);
      this._bulwarkShakeTween = null;
    }
    this._destroyBulwarkBreakFx();
    if (this._bulwarkVisual) {
      this._bulwarkVisual.destroy();
      this._bulwarkVisual = null;
    }
    if (this._flurryAnnounce) {
      this.tweens.killTweensOf(this._flurryAnnounce);
      this._flurryAnnounce.destroy();
      this._flurryAnnounce = null;
    }

    // Clean up slot containers
    for (const slot of this._enemySlots) {
      if (slot.state.poseRevertTimer) slot.state.poseRevertTimer.remove();
      if (slot.state.reactDelayTimer) slot.state.reactDelayTimer.remove();
      if (slot.state.deathFadeTimer) slot.state.deathFadeTimer.remove();
      if (slot.state.flapTimer) slot.state.flapTimer.remove();
      for (const obj of slot.state.extraObjects) obj.destroy();
      slot.container.destroy(true);
    }
    this._enemySlots = [];

    CombatEngine.destroy();
    console.log('[GameScene] shutdown â€” cleaned up');
  }
}

