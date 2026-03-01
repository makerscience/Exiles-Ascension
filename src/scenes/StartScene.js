import Phaser from 'phaser';
import { WORLD, PARALLAX } from '../config.js';
import { emit, EVENTS } from '../events.js';
import Store from '../systems/Store.js';
import SaveManager from '../systems/SaveManager.js';

const BUTTON_STYLE = {
  fontFamily: 'monospace',
  fontSize: '26px',
  color: '#f5f5f5',
  backgroundColor: '#1f2937',
  padding: { x: 22, y: 10 },
  fontStyle: 'bold',
  align: 'center',
};

const SLOT_COUNT = 3;

export default class StartScene extends Phaser.Scene {
  constructor() {
    super('StartScene');
    this._parallaxLayers = [];
    this._draggingVolume = false;
    this._settingsVisible = false;
    this._quitFadeTween = null;
    this._slotPickerMode = null; // 'new' or 'load' or null
    this._slotObjects = [];
    this._slotCards = [];
    this._slotDeleteConfirm = null;
    this._pendingNewGameSlot = null;
    this._slotStatusText = null;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b1220');

    this._createParallax();
    this._createChrome();
    this._createMenu();
    this._createSlotPicker();
    this._createSettingsPanel();
    this._createQuitMessage();

    this.events.on('shutdown', () => this._shutdown());
  }

  update(_time, delta) {
    const dt = delta / 1000;
    for (const layer of this._parallaxLayers) {
      const travel = layer.speed * dt;
      for (const image of layer.images) {
        image.x -= travel;
      }
      if (layer.images[0].x + layer.width <= 0) {
        for (const image of layer.images) {
          image.x += layer.width;
        }
      }
    }
  }

  _createParallax() {
    const layers = [
      { key: 'start_sky', y: 0, h: 460, speed: PARALLAX.baseSpeedPxPerSec * 0.5, depth: -30 },
      { key: 'start_ground', y: 460, h: WORLD.height - 460, speed: PARALLAX.baseSpeedPxPerSec * 3, depth: -10 },
    ];

    for (const layer of layers) {
      const imgA = this.add.image(0, layer.y, layer.key).setOrigin(0, 0);
      const imgB = this.add.image(WORLD.width, layer.y, layer.key).setOrigin(0, 0);
      imgA.setDisplaySize(WORLD.width, layer.h);
      imgB.setDisplaySize(WORLD.width, layer.h);
      imgA.setDepth(layer.depth);
      imgB.setDepth(layer.depth);
      this._parallaxLayers.push({
        images: [imgA, imgB],
        speed: layer.speed,
        width: WORLD.width,
      });
    }
  }

  _createChrome() {
    this.add.rectangle(
      WORLD.width / 2,
      WORLD.height / 2,
      WORLD.width,
      WORLD.height,
      0x000000,
      0.42
    ).setDepth(5);

    this.add.text(WORLD.width / 2, 150, "EXILE'S ASCENSION", {
      fontFamily: 'Georgia',
      fontSize: '58px',
      color: '#fef3c7',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(WORLD.width / 2, 198, 'A LitRPG Idle Adventure', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#d1d5db',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);
  }

  _createMenu() {
    const centerX = WORLD.width / 2;
    const startY = 300;
    const gap = 60;

    this._newGameBtn = this._createMenuButton(centerX, startY, 'NEW GAME', () => this._onNewGamePressed());

    const hasSave = SaveManager.hasSave();
    this._loadGameBtn = this._createMenuButton(centerX, startY + gap, 'LOAD GAME', () => this._onLoadGamePressed());
    if (!hasSave) {
      this._loadGameBtn.setAlpha(0.35);
      this._loadGameBtn.disableInteractive();
    }

    this._settingsBtn = this._createMenuButton(centerX, startY + gap * 2, 'SETTINGS', () => this._toggleSettings());
    this._quitBtn = this._createMenuButton(centerX, startY + gap * 3, 'QUIT', () => this._showQuitMessage());
  }

  _createSlotPicker() {
    const centerX = WORLD.width / 2;
    const cardW = 420;
    const cardH = 55;
    const cardGap = 15;
    const startY = 310;

    this._slotCards = [];
    this._slotObjects = [];

    // Build 3 slot cards
    for (let i = 0; i < SLOT_COUNT; i++) {
      const slotId = i + 1;
      const y = startY + i * (cardH + cardGap);

      // Card background
      const bg = this.add.rectangle(centerX, y, cardW, cardH, 0x1f2937)
        .setStrokeStyle(2, 0x4b5563)
        .setDepth(25)
        .setVisible(false)
        .setInteractive({ useHandCursor: true });

      const defaultFill = 0x1f2937;
      const hoverFill = 0x334155;

      bg.on('pointerover', () => {
        if (bg.input && bg.input.enabled) {
          bg.setFillStyle(hoverFill);
        }
      });
      bg.on('pointerout', () => {
        bg.setFillStyle(defaultFill);
      });
      bg.on('pointerdown', () => {
        this._onSlotSelected(slotId);
      });

      // Slot label
      const label = this.add.text(centerX - cardW / 2 + 18, y, `SLOT ${slotId}`, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#e5e7eb',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5).setDepth(26).setVisible(false);

      // Info text (empty or summary)
      const info = this.add.text(centerX, y, '', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#6b7280',
      }).setOrigin(0.5, 0.5).setDepth(26).setVisible(false);

      // Delete X button
      const delBtn = this.add.text(centerX + cardW / 2 - 24, y, 'X', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ef4444',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0.5).setDepth(27).setVisible(false)
        .setInteractive({ useHandCursor: true });

      delBtn.on('pointerdown', (_pointer, _localX, _localY, event) => {
        event.stopPropagation();
        this._onSlotDelete(slotId);
      });

      const card = { slotId, bg, label, info, delBtn };
      this._slotCards.push(card);
      this._slotObjects.push(bg, label, info, delBtn);
    }

    // Back button below cards
    const backY = startY + SLOT_COUNT * (cardH + cardGap) + 15;
    const backBtn = this._createMenuButton(centerX, backY, 'BACK', () => this._hideSlotPicker(), {
      fontSize: '20px',
      backgroundColor: '#334155',
      padding: { x: 16, y: 7 },
    });
    backBtn.setDepth(26).setVisible(false);
    this._slotObjects.push(backBtn);

    // Delete/overwrite confirm row
    const confirmY = backY + 60;
    const confirmWarning = this.add.text(centerX, confirmY - 22, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#fecaca',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(26).setVisible(false);

    const confirmYes = this._createMenuButton(centerX - 90, confirmY, 'CONFIRM', () => this._confirmSlotAction(), {
      fontSize: '20px',
      color: '#fef2f2',
      backgroundColor: '#991b1b',
      padding: { x: 14, y: 7 },
    });
    confirmYes.setDepth(26).setVisible(false);

    const confirmNo = this._createMenuButton(centerX + 90, confirmY, 'CANCEL', () => this._cancelSlotDelete(), {
      fontSize: '20px',
      color: '#f8fafc',
      backgroundColor: '#334155',
      padding: { x: 14, y: 7 },
    });
    confirmNo.setDepth(26).setVisible(false);

    this._slotConfirmWarning = confirmWarning;
    this._slotConfirmYes = confirmYes;
    this._slotConfirmNo = confirmNo;
    this._slotObjects.push(confirmWarning, confirmYes, confirmNo);

    const statusText = this.add.text(centerX, confirmY + 46, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#fca5a5',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(26).setVisible(false);
    this._slotStatusText = statusText;
    this._slotObjects.push(statusText);
  }

  _createSettingsPanel() {
    const cx = WORLD.width / 2;
    const cy = WORLD.height / 2;

    const panelBg = this.add.rectangle(cx, cy, 470, 190, 0x111827, 0.93).setDepth(30).setVisible(false);
    const panelBorder = this.add.rectangle(cx, cy, 470, 190).setStrokeStyle(2, 0x6b7280).setDepth(31).setVisible(false);
    const title = this.add.text(cx, cy - 62, 'SETTINGS', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#e5e7eb',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(31).setVisible(false);

    const trackW = 250;
    const trackH = 12;
    const trackX = cx - trackW / 2;
    const trackY = cy - 6;
    const volumeLabel = this.add.text(trackX, trackY - 26, 'Music Volume', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#d1d5db',
    }).setDepth(31).setVisible(false);

    const trackBg = this.add.rectangle(trackX, trackY, trackW, trackH, 0x374151).setOrigin(0, 0.5).setDepth(31).setVisible(false);
    const volume = Store.getState().settings.musicVolume;
    const trackFill = this.add.rectangle(trackX, trackY, trackW * volume, trackH, 0x22c55e).setOrigin(0, 0.5).setDepth(32).setVisible(false);
    const percent = this.add.text(trackX + trackW + 12, trackY - 10, `${Math.round(volume * 100)}%`, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#d1d5db',
    }).setDepth(31).setVisible(false);

    const sliderHit = this.add.rectangle(trackX, trackY, trackW, 28, 0x000000, 0.001)
      .setOrigin(0, 0.5)
      .setDepth(33)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    const closeBtn = this._createMenuButton(cx, cy + 58, 'BACK', () => this._toggleSettings(), {
      fontSize: '18px',
      backgroundColor: '#334155',
      padding: { x: 16, y: 6 },
    });
    closeBtn.setDepth(32).setVisible(false);

    const setVolumeFromPointer = (pointer) => {
      const localX = Phaser.Math.Clamp(pointer.x - trackX, 0, trackW);
      const newVol = Math.round((localX / trackW) * 100) / 100;
      Store.updateSetting('musicVolume', newVol);
      trackFill.setDisplaySize(trackW * newVol, trackH);
      percent.setText(`${Math.round(newVol * 100)}%`);
    };

    sliderHit.on('pointerdown', (pointer) => {
      setVolumeFromPointer(pointer);
      this._draggingVolume = true;
    });

    this._onPointerMove = (pointer) => {
      if (this._draggingVolume && this._settingsVisible) {
        setVolumeFromPointer(pointer);
      }
    };
    this._onPointerUp = () => {
      this._draggingVolume = false;
    };
    this.input.on('pointermove', this._onPointerMove);
    this.input.on('pointerup', this._onPointerUp);

    this._settingsObjects = [
      panelBg,
      panelBorder,
      title,
      volumeLabel,
      trackBg,
      trackFill,
      percent,
      sliderHit,
      closeBtn,
    ];
  }

  _createQuitMessage() {
    this._quitMessage = this.add.text(WORLD.width / 2, WORLD.height - 70, '', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#fca5a5',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20).setVisible(false);
  }

  _createMenuButton(x, y, label, onClick, overrideStyle = {}) {
    const btn = this.add.text(x, y, label, { ...BUTTON_STYLE, ...overrideStyle })
      .setOrigin(0.5)
      .setDepth(12)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerdown', onClick);
    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#4b5563' }));
    btn.on('pointerout', () => {
      const bg = overrideStyle.backgroundColor || BUTTON_STYLE.backgroundColor;
      btn.setStyle({ backgroundColor: bg });
    });

    return btn;
  }

  // --- Slot picker ---

  _showSlotPicker(mode) {
    this._slotPickerMode = mode;

    // Hide other UI
    this._setSettingsVisible(false);
    this._quitMessage.setVisible(false);

    // Hide main menu buttons
    this._newGameBtn.setVisible(false);
    this._loadGameBtn.setVisible(false);
    this._settingsBtn.setVisible(false);
    this._quitBtn.setVisible(false);

    // Hide confirm row
    this._slotConfirmWarning.setVisible(false);
    this._slotConfirmYes.setVisible(false);
    this._slotConfirmNo.setVisible(false);
    this._slotDeleteConfirm = null;
    this._pendingNewGameSlot = null;
    this._setSlotStatus('');

    // Refresh each card
    for (const card of this._slotCards) {
      const summary = SaveManager.getSlotSummary(card.slotId);
      const occupied = summary !== null;

      card.bg.setVisible(true);
      card.label.setVisible(true);
      card.info.setVisible(true);

      if (occupied) {
        card.info.setText(`Lv.${summary.level} - Area ${summary.area}, Zone ${summary.zone}`);
        card.info.setStyle({ color: '#a5b4fc' });
        card.delBtn.setVisible(true);
      } else {
        card.info.setText('- Empty -');
        card.info.setStyle({ color: '#6b7280' });
        card.delBtn.setVisible(false);
      }

      // In load mode, gray out empty slots
      if (mode === 'load' && !occupied) {
        card.bg.setAlpha(0.35);
        card.bg.disableInteractive();
      } else {
        card.bg.setAlpha(1);
        card.bg.setInteractive({ useHandCursor: true });
      }
    }

    // Show all slot objects (except confirm row which we hid above)
    for (const obj of this._slotObjects) {
      // Only show non-confirm objects; confirm row is handled separately
      if (obj === this._slotConfirmWarning || obj === this._slotConfirmYes || obj === this._slotConfirmNo) continue;
      obj.setVisible(true);
    }
  }

  _hideSlotPicker() {
    this._slotPickerMode = null;
    this._slotDeleteConfirm = null;
    this._pendingNewGameSlot = null;
    this._setSlotStatus('');

    // Hide all slot objects
    for (const obj of this._slotObjects) {
      obj.setVisible(false);
    }

    // Show main menu buttons
    this._newGameBtn.setVisible(true);
    this._loadGameBtn.setVisible(true);
    this._settingsBtn.setVisible(true);
    this._quitBtn.setVisible(true);

    // Re-evaluate Load Game availability
    const hasSave = SaveManager.hasSave();
    if (hasSave) {
      this._loadGameBtn.setAlpha(1);
      this._loadGameBtn.setInteractive({ useHandCursor: true });
    } else {
      this._loadGameBtn.setAlpha(0.35);
      this._loadGameBtn.disableInteractive();
    }
  }

  _onSlotSelected(slotId) {
    this._setSlotStatus('');

    // If confirm row is showing, ignore card clicks
    if (this._slotDeleteConfirm !== null || this._pendingNewGameSlot !== null) return;

    if (this._slotPickerMode === 'new') {
      const summary = SaveManager.getSlotSummary(slotId);
      if (summary !== null) {
        // Occupied — show overwrite confirm
        this._pendingNewGameSlot = slotId;
        this._slotConfirmWarning.setText(`Overwrite Slot ${slotId}?`);
        this._slotConfirmYes.setText('OVERWRITE');
        this._slotConfirmWarning.setVisible(true);
        this._slotConfirmYes.setVisible(true);
        this._slotConfirmNo.setVisible(true);
      } else {
        this._startNewGameInSlot(slotId);
      }
    } else if (this._slotPickerMode === 'load') {
      this._loadGameFromSlot(slotId);
    }
  }

  _startNewGameInSlot(slotId) {
    this._setSlotStatus('');
    SaveManager.clearSaveForNewGame(slotId);
    SaveManager.setActiveSlot(slotId);
    Store.resetState();
    emit(EVENTS.SAVE_REQUESTED, {});
    this.scene.start('GameScene');
  }

  _loadGameFromSlot(slotId) {
    this._setSlotStatus('');
    const loaded = SaveManager.load(slotId);
    if (!loaded) {
      this._setSlotStatus(`Could not load Slot ${slotId}. Save is missing or corrupted.`);
      return;
    }
    this.scene.start('GameScene');
  }

  // --- Delete handlers ---

  _onSlotDelete(slotId) {
    this._setSlotStatus('');
    this._slotDeleteConfirm = slotId;
    this._pendingNewGameSlot = null;
    this._slotConfirmWarning.setText(`Delete Slot ${slotId}?`);
    this._slotConfirmYes.setText('CONFIRM');
    this._slotConfirmWarning.setVisible(true);
    this._slotConfirmYes.setVisible(true);
    this._slotConfirmNo.setVisible(true);
  }

  _confirmSlotAction() {
    if (this._slotDeleteConfirm !== null) {
      const slotId = this._slotDeleteConfirm;
      SaveManager.clearSaveForNewGame(slotId);
      this._cancelSlotDelete();
      // Refresh the picker
      this._showSlotPicker(this._slotPickerMode);
    } else if (this._pendingNewGameSlot !== null) {
      const slotId = this._pendingNewGameSlot;
      this._pendingNewGameSlot = null;
      this._startNewGameInSlot(slotId);
    }
  }

  _cancelSlotDelete() {
    this._slotDeleteConfirm = null;
    this._pendingNewGameSlot = null;
    this._slotConfirmWarning.setVisible(false);
    this._slotConfirmYes.setVisible(false);
    this._slotConfirmNo.setVisible(false);
  }

  _setSlotStatus(message) {
    if (!this._slotStatusText) return;
    if (!message) {
      this._slotStatusText.setVisible(false);
      return;
    }
    this._slotStatusText.setText(message).setVisible(true);
  }

  // --- Menu handlers ---

  _onNewGamePressed() {
    this._showSlotPicker('new');
  }

  _onLoadGamePressed() {
    this._showSlotPicker('load');
  }

  _toggleSettings() {
    if (this._slotPickerMode) this._hideSlotPicker();
    this._setSettingsVisible(!this._settingsVisible);
  }

  _setSettingsVisible(visible) {
    this._settingsVisible = visible;
    this._draggingVolume = false;
    for (const obj of this._settingsObjects) {
      obj.setVisible(visible);
    }
    this._quitMessage.setVisible(false);
  }

  _showQuitMessage() {
    this._setSettingsVisible(false);
    if (this._slotPickerMode) this._hideSlotPicker();
    this._quitMessage.setText('There is no escape. Close the tab if you dare.');
    this._quitMessage.setAlpha(1).setVisible(true);

    if (this._quitFadeTween) {
      this._quitFadeTween.stop();
      this._quitFadeTween = null;
    }
    this._quitFadeTween = this.tweens.add({
      targets: this._quitMessage,
      alpha: 0,
      delay: 1600,
      duration: 600,
      ease: 'Linear',
      onComplete: () => {
        this._quitMessage.setVisible(false);
        this._quitFadeTween = null;
      },
    });
  }

  _shutdown() {
    this._draggingVolume = false;
    if (this._onPointerMove) this.input.off('pointermove', this._onPointerMove);
    if (this._onPointerUp) this.input.off('pointerup', this._onPointerUp);
    if (this._quitFadeTween) {
      this._quitFadeTween.stop();
      this._quitFadeTween = null;
    }
    this._parallaxLayers = [];
    this._settingsObjects = [];
    this._slotObjects = [];
    this._slotCards = [];
  }
}
