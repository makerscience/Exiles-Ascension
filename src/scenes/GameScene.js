// GameScene â€” Phaser scene rendering combat. Layout on 1280x720 canvas.

import Phaser from 'phaser';
import CombatEngine from '../systems/CombatEngine.js';
import TimeEngine from '../systems/TimeEngine.js';
import Store from '../systems/Store.js';
import { on, EVENTS } from '../events.js';
import { format } from '../systems/BigNum.js';
import { UI, LAYOUT, ZONE_THEMES, COMBAT_V2, PARALLAX, TREE_ROWS, FERN_ROWS, STANCES } from '../config.js';
import { getEnemyById } from '../data/enemies.js';

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
    this._playerX = ga.x + 200;
    const playerX = this._playerX;
    this._enemyX = ga.x + 700;
    this._combatY = ga.y + ga.h - 225;
    this._enemyY = this._combatY + 40;

    // Create parallax background first (lowest depth) — keyed on area, not zone
    this._createParallax(Store.getState().currentArea);

    // Player attack pose config
    this._playerAttackSprites = [
      'player001_jumpkick', 'player001_kick',
      'player001_elbow', 'player001_kneestrike', 'player001_roundhousekick',
      'player001_jab',
    ];
    this._playerPoseTimer = null;
    this._playerAttacking = false; // true while attack pose is held (blocks hit reaction)
    this._powerCharging = false;  // true when showing charge-up sprite at 50%

    // Player HP bar + name above player head
    this._hpBarY = this._combatY - 375 / 2 - 16;
    this._nameLabelY = this._hpBarY - 18;

    // Player walk animation (per-stance frames)
    this._defaultWalkFrames = ['player001_walk1', 'player001_walk3'];
    this._fortressWalkFrames = ['fortressstance_001', 'fortressstance_002'];
    this._walkFrames = this._defaultWalkFrames;
    this._walkIndex = 0;

    // Player sprite — start with first walk frame
    this.playerRect = this.add.image(playerX, this._combatY, 'player001_walk1');
    this.playerRect.setDisplaySize(300, 375);

    // Looping walk cycle timer (~150ms per frame)
    this._walkTimer = this.time.addEvent({
      delay: 450,
      loop: true,
      callback: () => {
        // Hold charge sprite until attack fires
        if (this._powerCharging) return;

        this._walkIndex = (this._walkIndex + 1) % this._walkFrames.length;
        const key = this._walkFrames[this._walkIndex];
        this.playerRect.setTexture(key);

        const scale = (key === 'player001_walk3' || key.startsWith('fortressstance_')) ? 1.05 : 1;
        this.playerRect.setDisplaySize(300 * scale, 375 * scale);
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

    // Attack charge bar (visible in power stance only)
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

      this._enemySlots.push({
        container,
        sprite,
        rect,
        hpBarBg,
        hpBarFill,
        chargeBarBg,
        chargeBarFill,
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
          flapTimer: null,
          flapFrame: 0,
          atkTimerKey: null,
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
    this._unsubs.push(on(EVENTS.COMBAT_INTERRUPTED, (data) => this._onInterrupted(data)));
    this._unsubs.push(on(EVENTS.CORRUPTION_CHANGED, (data) => this._onCorruptionChanged(data)));
    this._unsubs.push(on(EVENTS.CORRUPTION_CLEANSED, (data) => this._onCorruptionCleansed(data)));
    this._unsubs.push(on(EVENTS.COMBAT_ENEMY_REGEN, (data) => this._onEnemyRegen(data)));
    this._unsubs.push(on(EVENTS.COMBAT_ENEMY_ENRAGED, (data) => this._onEnemyEnraged(data)));
    this._unsubs.push(on(EVENTS.COMBAT_THORNS_DAMAGE, (data) => this._onThornsDamage(data)));

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
    }));

    // Stance tint on player sprite
    this._unsubs.push(on(EVENTS.STANCE_CHANGED, ({ stanceId }) => this._applyStanceTint(stanceId)));
    this._applyStanceTint(Store.getState().currentStance);

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

    // Background music — use HTML5 Audio for streaming (file is ~200MB, too large for Web Audio decode)
    this._bgm = new Audio('Sound/soundtrack/ambient progression.mp3');
    this._bgm.loop = true;
    this._bgm.volume = Store.getState().settings.musicVolume;
    this._bgm.play().catch(() => {
      // Autoplay blocked — retry on first user interaction
      const resume = () => {
        this._bgm.play().catch(() => {});
        document.removeEventListener('pointerdown', resume);
      };
      document.addEventListener('pointerdown', resume);
    });

    // Sync volume when settings change
    this._unsubs.push(on(EVENTS.STATE_CHANGED, ({ changedKeys }) => {
      if (changedKeys.includes('settings') && this._bgm) {
        this._bgm.volume = Store.getState().settings.musicVolume;
      }
    }));

    console.log('[GameScene] create â€" combat initialized');
  }

  update(_time, delta) {
    TimeEngine.update(delta);

    // Update shield bar
    if (this._shieldMaxHp > 0) {
      const shieldHp = CombatEngine.getShieldHp();
      if (shieldHp <= 0) {
        this._shieldMaxHp = 0;
        this.shieldBarBg.setVisible(false);
        this.shieldBarFill.setVisible(false);
      } else {
        const ratio = shieldHp / this._shieldMaxHp;
        this.shieldBarFill.setDisplaySize(Math.max(0, ratio * 100), 8);
      }
    }

    // Update power stance charge bar + charge sprite
    if (this._chargeBarBg.visible) {
      const progress = TimeEngine.getProgress('combat:autoAttack');
      this._chargeBarFill.setDisplaySize(Math.max(0, progress * 100), 6);

      // Switch to charge-up sprite at 50% if not mid-attack
      if (!this._playerAttacking && progress >= 0.75 && !this._powerCharging) {
        this._powerCharging = true;
        this._walkTimer.paused = true;
        this.playerRect.setTexture('powerstance_001charge');
        this.playerRect.setDisplaySize(300, 375);
      } else if (progress < 0.75 && this._powerCharging) {
        this._powerCharging = false;
        if (!this._playerAttacking && this._attackLockCount === 0) {
          this._walkTimer.paused = false;
        }
      }
    }

    // Update enemy attack charge bars
    for (const slot of this._enemySlots) {
      if (slot.state.atkTimerKey && slot.chargeBarFill.visible) {
        const progress = TimeEngine.getProgress(slot.state.atkTimerKey);
        slot.chargeBarFill.setDisplaySize(Math.max(0, progress * 100), 4);
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

    // Scroll tree layers (diagonal: upper-right â†' lower-left)
    if (this._treeLayers.length > 0) {
      const frontSpeed = PARALLAX.baseSpeedPxPerSec * 3;
      const diagRatio = PARALLAX.treeDiagRatio;
      for (const { row, trees } of this._treeLayers) {
        const xSpeed = frontSpeed * row.speedMult * dt;
        const ySpeed = xSpeed * diagRatio * (row.diagMult ?? 1);
        for (const tree of trees) {
          tree.img.x -= xSpeed;
          tree.img.y += ySpeed;

          // Perspective growth: scale continuously from spawn to despawn (no clamping)
          if (row.growRange) {
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
            tree.img.y = ga.y + ga.h * row.yRange[0] + Math.random() * 30;
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

  // ── Stance tint ─────────────────────────────────────────────────

  _applyStanceTint(stanceId) {
    if (!this.playerRect) return;
    switch (stanceId) {
      case 'flurry':
        this.playerRect.setTint(0xaaccff);
        this._stanceIcon.setText('⚡').setColor('#facc15');
        break;
      case 'fortress':
        this.playerRect.setTint(0xccccdd);
        this._stanceIcon.setText('⬢').setColor('#60a5fa');
        break;
      default:
        this.playerRect.clearTint();
        this._stanceIcon.setText('▲').setColor('#ef4444');
        break;
    }
    // Swap walk frames per stance
    this._walkFrames = stanceId === 'fortress' ? this._fortressWalkFrames : this._defaultWalkFrames;
    this._walkIndex = 0;
    const firstFrame = this._walkFrames[0];
    this.playerRect.setTexture(firstFrame);
    const frameScale = (firstFrame === 'player001_walk3' || firstFrame.startsWith('fortressstance_')) ? 1.05 : 1;
    this.playerRect.setDisplaySize(300 * frameScale, 375 * frameScale);

    // Show charge bar only in power stance
    const showCharge = stanceId === 'power';
    this._chargeBarBg.setVisible(showCharge);
    this._chargeBarFill.setVisible(showCharge);
    if (!showCharge) {
      this._chargeBarFill.setDisplaySize(0, 6);
      this._powerCharging = false;
    }
  }

  // ── Walk timer lock counting ────────────────────────────────────

  _lockWalk() {
    this._attackLockCount++;
    this._walkTimer.paused = true;
  }

  _unlockWalk() {
    this._attackLockCount = Math.max(0, this._attackLockCount - 1);
    if (this._attackLockCount === 0 && !this._playerAttacking && !this._powerCharging) {
      this._walkTimer.paused = false;
    }
  }

  // ── Encounter slot positioning ──────────────────────────────────

  _getSlotPositions(count) {
    const spread = COMBAT_V2.encounterSpread;
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

  _reflowEncounterSlots(layoutCount) {
    const positions = this._getSlotPositions(Math.max(1, layoutCount));
    for (let i = 0; i < this._enemySlots.length; i++) {
      const slot = this._enemySlots[i];
      if (!slot.state.instanceId) continue;
      if (!positions[i]) continue;
      slot.container.setPosition(positions[i].x, positions[i].y);
      slot.baseX = positions[i].x;
      slot.baseY = positions[i].y;
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
      slot.sprite.clearTint();
      slot.rect.setFillStyle(0xef4444);
    }

    const template = getEnemyById(memberData.enemyId)
      || (memberData.baseEnemyId ? getEnemyById(memberData.baseEnemyId) : null);
    const sprites = template?.sprites || null;
    const bossScale = memberData.isBoss ? 1.4 : 1;
    const baseSize = template?.spriteSize || { w: 200, h: 250 };
    const size = { w: baseSize.w * bossScale, h: baseSize.h * bossScale };
    const spriteOffsetY = template?.spriteOffsetY ?? 0;
    const nameplateOffsetY = template?.nameplateOffsetY ?? 0;
    const baseH = baseSize.h;
    const hDiff = size.h - baseH;
    const bottomAlignOffsetY = hDiff > 0 ? -hDiff / 2 + 40 : 0;

    // Bind state
    slot.state.instanceId = memberData.instanceId;
    slot.state.enemyId = memberData.enemyId;
    slot.state.currentSprites = sprites;
    slot.state.spriteW = size.w;
    slot.state.spriteH = size.h;
    slot.state.spriteOffsetY = spriteOffsetY;
    slot.state.bottomAlignOffsetY = bottomAlignOffsetY;
    slot.state.lungeDist = (template?.lungeDistance || 20) * 2;
    slot.state.attackSpriteOffsetY = template?.attackSpriteOffsetY ?? null;
    slot.state.enraged = false;

    // Position container (layoutCount can grow as summons are added)
    const count = Math.max(layoutCount || 1, memberData.slot + 1);
    const positions = this._getSlotPositions(count);
    const pos = positions[memberData.slot];
    slot.container.setPosition(pos.x, pos.y);
    slot.baseX = pos.x;
    slot.baseY = pos.y;

    // Reposition name/HP based on actual sprite height
    const halfH = size.h / 2;
    const npOff = nameplateOffsetY;
    slot.nameText.setY(-(halfH) - 60 + npOff);
    slot.hpBarBg.setY(-(halfH) - 42 + npOff);
    slot.hpBarFill.setY(-(halfH) - 42 + npOff);
    slot.hpBarFill.setX(-50); // reset left anchor

    // Configure sprite or rect
    if (sprites) {
      slot.sprite.setTexture(sprites.default);
      slot.sprite.setScale(1).setAngle(0).setOrigin(0.5, 0.5);
      slot.sprite.setDisplaySize(size.w, size.h);
      slot.sprite.setPosition(0, spriteOffsetY + bottomAlignOffsetY);
      slot.sprite.setVisible(true).setAlpha(1);
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
    slot.state.chargeArmor = template?.chargeArmor ?? 0;

    const atkSpeed = memberData.attackSpeed ?? 1.0;
    if (atkSpeed <= 0.8 && template?.chargeBar !== false) {
      const chargeY = -(halfH) - 32 + npOff;
      slot.chargeBarBg.setY(chargeY).setVisible(true).setAlpha(1);
      slot.chargeBarFill.setY(chargeY).setDisplaySize(0, 4).setVisible(true).setAlpha(1);
    } else {
      slot.chargeBarBg.setVisible(false);
      slot.chargeBarFill.setVisible(false);
    }

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
      slot.state.atkTimerKey = null;
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

      // Click attacks (non-Power Smash): damage number only
      if (sIsClick && !sIsPowerSmash) {
        this._spawnDamageNumber(data.amount, data.isCrit, false, slot.baseX, slot.baseY);
        return;
      }

      // Player attack pose + lunge
      const isPowerStanceAttack = Store.getState().currentStance === 'power';
      const sAttackKey = (sIsPowerSmash || isPowerStanceAttack)
        ? 'player001_strongpunch'
        : this._playerAttackSprites[Math.floor(Math.random() * this._playerAttackSprites.length)];
      this._lockWalk();
      this.playerRect.setTexture(sAttackKey);
      if (sAttackKey === 'player001_roundhousekick') {
        this.playerRect.setDisplaySize(300 * 0.95, 375 * 0.95);
      } else {
        this.playerRect.setDisplaySize(300, 375);
      }
      const sLungeDist = sIsPowerSmash ? 40 : 20;
      const sLungeDur = sIsPowerSmash ? 100 : 80;
      this.tweens.killTweensOf(this.playerRect);
      this.playerRect.x = this._playerX;
      this.tweens.add({
        targets: this.playerRect,
        x: this._playerX + sLungeDist,
        duration: sLungeDur,
        ease: 'Quad.easeOut',
        yoyo: true,
      });
      if (sIsPowerSmash) this.cameras.main.shake(150, 0.006);

      // If replacing an existing timer, balance the lock count it would have released
      if (this._playerPoseTimer) {
        this._playerPoseTimer.remove();
        this._unlockWalk();
      }
      const isPowerStance = Store.getState().currentStance === 'power';
      const poseDuration = isPowerStance ? 1000 : 400;
      this._playerAttacking = isPowerStance;
      this._powerCharging = false;
      this._playerPoseTimer = this.time.delayedCall(poseDuration, () => {
        this._playerAttacking = false;
        this._attackLockCount = 0;
        this._walkTimer.paused = false;
      });

      const sKnockbackDist = sIsPowerSmash ? 24 : isPowerStance ? 24 : 12;
      const sReactDelay = 60;

      // Spawn damage number immediately
      this._spawnDamageNumber(data.amount, data.isCrit, sIsPowerSmash, slot.baseX, slot.baseY);

      // chargeArmor: skip hit reaction when enemy attack is half-charged or more
      if (slot.state.chargeArmor > 0 && slot.state.atkTimerKey) {
        const progress = TimeEngine.getProgress(slot.state.atkTimerKey);
        if (progress >= slot.state.chargeArmor) return;
      }

      if (slot.state.currentSprites) {
        // Sprite hit reaction
        if (slot.state.reactDelayTimer) slot.state.reactDelayTimer.remove();
        slot.state.reactDelayTimer = this.time.delayedCall(sReactDelay, () => {
          slot.sprite.setTexture(slot.state.currentSprites.reaction);
          slot.sprite.setDisplaySize(slot.state.spriteW, slot.state.spriteH);
          slot.sprite.setTint(0xffffff);
          this.time.delayedCall(80, () => {
            if (slot.state.enraged) slot.sprite.setTint(0xff6666);
            else slot.sprite.clearTint();
          });

          // Reset to local home position before knockback
          this.tweens.killTweensOf(slot.sprite);
          slot.sprite.x = 0;
          slot.sprite.y = slot.state.spriteOffsetY + slot.state.bottomAlignOffsetY;

          this.tweens.add({
            targets: slot.sprite,
            x: sKnockbackDist,
            duration: 80,
            ease: 'Quad.easeOut',
            yoyo: true,
          });

          if (slot.state.poseRevertTimer) slot.state.poseRevertTimer.remove();
          slot.state.poseRevertTimer = this.time.delayedCall(500, () => {
            if (slot.state.currentSprites) {
              slot.sprite.setTexture(slot.state.currentSprites.default);
              slot.sprite.setDisplaySize(slot.state.spriteW, slot.state.spriteH);
            }
          });
        });
      } else {
        // Rect hit reaction
        this.time.delayedCall(sReactDelay, () => {
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
            duration: 60,
            ease: 'Quad.easeOut',
            yoyo: true,
          });
        });
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
      slot.sprite.setTint(0xff6666);
    } else {
      slot.rect.setFillStyle(0xff4444);
    }

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

      // Kill tweens + clear timers
      this.tweens.killTweensOf(slot.sprite);
      this.tweens.killTweensOf(slot.rect);
      if (slot.state.reactDelayTimer) { slot.state.reactDelayTimer.remove(); slot.state.reactDelayTimer = null; }
      if (slot.state.poseRevertTimer) { slot.state.poseRevertTimer.remove(); slot.state.poseRevertTimer = null; }

      if (slot.state.currentSprites) {
        slot.sprite.setTexture(slot.state.currentSprites.dead);
        slot.sprite.setDisplaySize(slot.state.spriteW, slot.state.spriteH);
        slot.sprite.y = slot.state.spriteOffsetY + slot.state.bottomAlignOffsetY;
        slot.sprite.disableInteractive();

        if (slot.state.enemyId === 'a1_forest_rat') {
          // Rat spin — local coords
          this.tweens.add({
            targets: slot.sprite,
            x: 350, y: slot.sprite.y - 400,
            angle: 720, scaleX: 0.3, scaleY: 0.3, alpha: 0,
            duration: 500, ease: 'Quad.easeIn',
          });
        } else if (slot.state.enemyId === 'a1_hollow_slime') {
          // Slime wobble — local coords
          this.tweens.add({
            targets: slot.sprite,
            x: 200, y: slot.sprite.y + 250, alpha: 0,
            duration: 700, ease: 'Sine.easeIn',
          });
          const bsX = slot.sprite.scaleX;
          const bsY = slot.sprite.scaleY;
          this.tweens.add({
            targets: slot.sprite,
            scaleX: { from: bsX * 1.15, to: bsX * 0.8 },
            scaleY: { from: bsY * 0.85, to: bsY * 1.2 },
            duration: 140, yoyo: true, repeat: 2, ease: 'Sine.easeInOut',
          });
        } else if (slot.state.enemyId === 'a1_blighted_stalker') {
          // Stalker decapitation — head is scene-level (absolute coords)
          slot.sprite.setTexture('blightedstalker_dead2');
          slot.sprite.setDisplaySize(slot.state.spriteW, slot.state.spriteH);

          const headSize = 80;
          const headX = slot.baseX + slot.sprite.x;
          const headY = slot.baseY + slot.sprite.y - slot.sprite.displayHeight / 2 - headSize * 0.25;
          const head = this.add.image(headX, headY, 'blightedstalker_head')
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
          const childW = 160;  // Hollow Slime sprite size
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
        slot.sprite.setDisplaySize(slot.state.spriteW, slot.state.spriteH);

        // Reset to local home position before lunge
        this.tweens.killTweensOf(slot.sprite);
        slot.sprite.x = 0;
        const atkOffsetY = slot.state.attackSpriteOffsetY ?? slot.state.spriteOffsetY;
        slot.sprite.y = atkOffsetY + slot.state.bottomAlignOffsetY;

        const isLeaper = slot.state.enemyId === 'a1_forest_rat' || slot.state.enemyId === 'a1_hollow_slime';
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

  _onEnemyCasting(data) {
    const slot = this._getSlotByInstanceId(data.instanceId);
    if (!slot) return;
    this._spawnStatusText(slot.baseX, slot.baseY - 115, 'CASTING', '#f59e0b');
  }

  _onInterrupted(data) {
    const slot = this._getSlotByInstanceId(data.instanceId);
    if (!slot) return;
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

    // Skip hit reaction visuals in fortress stance, while charging, or while holding attack pose
    const stance = Store.getState().currentStance;
    if (!this._playerAttacking && !this._powerCharging && stance !== 'fortress') {
      // Delay player reaction so the enemy lunge lands first.
      this._walkTimer.paused = true;
      this.time.delayedCall(60, () => {
        if (this._playerAttacking) return; // guard against race
        this.playerRect.setTexture('player001_hitreaction');
        this.playerRect.setDisplaySize(300, 375);
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
          if (this.playerRect) this.playerRect.clearTint();
        });
      });
      if (this._playerPoseTimer) this._playerPoseTimer.remove();
      this._playerPoseTimer = this.time.delayedCall(460, () => {
        this._walkTimer.paused = false;
      });
    }
  }

  _onPlayerDied() {
    this._playerAttacking = false;

    // Hide shield bar
    this._shieldMaxHp = 0;
    this.shieldBarBg.setVisible(false);
    this.shieldBarFill.setVisible(false);

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
    this.playerRect.setTexture('player001_hitreaction');

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
      this.playerRect.clearTint();
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
    const midLayerBottomTargetY = 380;
    const foregroundTopTargetY = 270;

    if (theme.images) {
      for (let layerIdx = 0; layerIdx < theme.images.length; layerIdx++) {
        const key = theme.images[layerIdx];
        const layerH = skyH;

        // Rear layer (sky): static full-screen image, no scrolling
        if (layerIdx === 0) {
          const container = this.add.container(0, 0);
          container.setDepth(-3);
          container.setData('isStatic', true);
          const img = this.add.image(ga.x, ga.y, key).setOrigin(0, 0);
          img.setDisplaySize(ga.w, layerH);
          container.add(img);
          this._parallaxLayers.push(container);
          continue;
        }

        // Mid layer: dual-image horizontal scroll
        if (layerIdx === 1) {
          const container = this.add.container(0, 0);
          container.setDepth(-2);
          container.setData('isImageLayer', true);
          const midLayerY = midLayerBottomTargetY - layerH;
          const img1 = this.add.image(ga.x, midLayerY, key).setOrigin(0, 0);
          img1.setDisplaySize(ga.w, layerH);
          const img2 = this.add.image(ga.x + ga.w, midLayerY, key).setOrigin(0, 0);
          img2.setDisplaySize(ga.w, layerH);
          container.setData('imgW', ga.w);
          container.add([img1, img2]);
          this._parallaxLayers.push(container);
          continue;
        }
      }

      // Tree rows (replaces front strip layer)
      if (theme.trees) {
        this._createTreeRows(theme.trees, ga);
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
    const groundH = Math.max(1, battleBottomY - groundY);
    const gImg1 = this.add.image(ga.x, groundY, 'foreground002').setOrigin(0, 0);
    gImg1.setDisplaySize(ga.w, groundH);
    const gImg2 = this.add.image(ga.x + ga.w, groundY, 'foreground002').setOrigin(0, 0);
    gImg2.setDisplaySize(ga.w, groundH);
    this._groundContainer = this.add.container(0, 0);
    this._groundContainer.setDepth(-2.5);
    this._groundContainer.setData('imgW', ga.w);
    this._groundContainer.add([gImg1, gImg2]);

    // Bare ground overlay — sits above foreground002 but behind trees/ferns
    // Top aligns with mid fern row start (Y=445), bottom at game area bottom
    if (theme.images && this.textures.exists('fg_bare')) {
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
  }

  _createTreeRows(treeKeys, ga) {
    const diagRatio = PARALLAX.treeDiagRatio;

    for (const row of TREE_ROWS) {
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
      const rowKeys = Array.isArray(row.keys) && row.keys.length > 0 ? row.keys : treeKeys;

      for (let i = 0; i < row.count; i++) {
        const key = rowKeys[Math.floor(Math.random() * rowKeys.length)];
        const scale = row.scaleRange[0] + Math.random() * (row.scaleRange[1] - row.scaleRange[0]);
        const displayW = 1024 * scale;
        const displayH = 1536 * scale;

        // Distribute trees across 1.5× screen width so off-screen trees are queued on the right
        const spawnWidth = ga.w * 1.5;
        const progress = i / row.count + (Math.random() * 0.3) / row.count;
        const x = ga.x + spawnWidth * (1 - progress);
        const y = yStart + diagDrop * progress;

        const img = this.add.image(x, y, key).setOrigin(0.5, 1);
        img.setDisplaySize(displayW, displayH);

        container.add(img);
        trees.push({ img, displayW, displayH });
      }

      this._treeLayers.push({ container, row, trees });
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

      const yMin = rowIdx === 0 ? 375 : rowIdx === 1 ? 415 : rowIdx === 2 ? 445 : rowIdx === 3 ? 540 : bandTop + rowIdx * sliceH;
      const yMax = rowIdx === 0 ? 380 : rowIdx === 1 ? 450 : rowIdx === 2 ? 490 : rowIdx === 3 ? 560 : bandTop + (rowIdx + 1) * sliceH + sliceH * 0.35;
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
  }

  _shutdown() {
    if (this._bgm) { this._bgm.pause(); this._bgm.src = ''; this._bgm = null; }
    this.scene.stop('OverworldScene');
    this.scene.stop('UIScene');
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._destroyParallax();

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

