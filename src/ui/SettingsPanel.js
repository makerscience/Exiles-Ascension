// SettingsPanel - modal overlay for game settings.
// Toggle via gear button or ESC key.

import ModalPanel from './ModalPanel.js';
import SaveManager from '../systems/SaveManager.js';
import Store from '../systems/Store.js';
import { LAYOUT } from '../config.js';

const PANEL_W = 540;
const PANEL_H = 560;

export default class SettingsPanel extends ModalPanel {
  constructor(scene) {
    super(scene, {
      key: 'settings',
      width: PANEL_W,
      height: PANEL_H,
      hotkey: 'ESC',
      buttonLabel: 'SETTINGS',
      buttonX: LAYOUT.bottomBar.x + LAYOUT.bottomBar.w - 60,
      buttonIconKey: 'icon_settings_button',
      buttonIconSize: 128,
      buttonColor: '#a1a1aa',
      borderColor: 0xa1a1aa,
      titleColor: '#a1a1aa',
      titleSize: '18px',
    });

    this._wipePending = false;
    this._wipeTimer = null;
    this._saveMessage = '';
    this._saveMessageTimer = null;
    this._selectedSaveSlot = SaveManager.getActiveSlot() || 1;
    this._draggingVolume = false;
    this._volumeMoveHandler = null;
    this._volumeUpHandler = null;
  }

  _getTitle() { return 'SETTINGS'; }
  _getEvents() { return []; }

  _open() {
    this._wipePending = false;
    this._selectedSaveSlot = SaveManager.getActiveSlot() || this._selectedSaveSlot || 1;
    super._open();
  }

  _close() {
    this._wipePending = false;
    this._draggingVolume = false;
    if (this._wipeTimer) {
      clearTimeout(this._wipeTimer);
      this._wipeTimer = null;
    }
    this._teardownVolumeHandlers();
    super._close();
  }

  _buildContent() {
    const centerX = this._cx;
    const topY = this._cy - PANEL_H / 2 + 34;

    // SOUND
    this._addLabel(centerX, topY, 'SOUND', '#a1a1aa', '14px', true, true);

    const sliderY = topY + 32;
    const trackW = 220;
    const trackH = 12;
    const trackX = centerX - 30;
    const vol = Store.getState().settings.musicVolume;

    this._addLabel(trackX - 100, sliderY, 'Music Volume', '#d4d4d8', '13px', false, false);

    const trackBg = this.scene.add.rectangle(trackX, sliderY, trackW, trackH, 0x27272a).setOrigin(0, 0.5);
    this._dynamicObjects.push(trackBg);

    const trackFill = this.scene.add.rectangle(trackX, sliderY, trackW * vol, trackH, 0x22c55e).setOrigin(0, 0.5);
    this._dynamicObjects.push(trackFill);

    const pctLabel = this._addLabel(trackX + trackW + 12, sliderY - 7, `${Math.round(vol * 100)}%`, '#d4d4d8', '13px', false, false);

    const hitArea = this.scene.add.rectangle(trackX, sliderY, trackW, 28, 0x000000, 0.001).setOrigin(0, 0.5);
    hitArea.setInteractive({ useHandCursor: true });
    this._dynamicObjects.push(hitArea);

    const setVolume = (pointer) => {
      const localX = Math.max(0, Math.min(trackW, pointer.x - trackBg.x));
      const newVol = Math.round((localX / trackW) * 100) / 100;
      Store.updateSetting('musicVolume', newVol);
      trackFill.setDisplaySize(trackW * newVol, trackH);
      pctLabel.setText(`${Math.round(newVol * 100)}%`);
    };

    hitArea.on('pointerdown', (pointer) => {
      setVolume(pointer);
      this._draggingVolume = true;
    });

    this._teardownVolumeHandlers();
    this._volumeMoveHandler = (pointer) => {
      if (this._draggingVolume) setVolume(pointer);
    };
    this._volumeUpHandler = () => {
      this._draggingVolume = false;
    };
    this.scene.input.on('pointermove', this._volumeMoveHandler);
    this.scene.input.on('pointerup', this._volumeUpHandler);

    // SAVE MANAGEMENT
    const saveY = topY + 92;
    this._addLabel(centerX, saveY, 'SAVE MANAGEMENT', '#a1a1aa', '14px', true, true);
    this._addLabel(centerX, saveY + 22, 'Choose save target slot', '#a1a1aa', '12px', false, true);

    const slotY = saveY + 56;
    const slotW = 88;
    const slotGap = 12;
    const rowW = slotW * 3 + slotGap * 2;
    const slotStartX = centerX - rowW / 2 + slotW / 2;
    for (let i = 1; i <= 3; i++) {
      const x = slotStartX + (i - 1) * (slotW + slotGap);
      const active = this._selectedSaveSlot === i;
      const bg = active ? '#2563eb' : '#333333';
      const color = active ? '#ffffff' : '#d1d5db';
      const btn = this.scene.add.text(x, slotY, `SLOT ${i}`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color,
        backgroundColor: bg,
        padding: { x: 12, y: 6 },
        fontStyle: 'bold',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => this._selectSaveSlot(i));
      btn.on('pointerover', () => btn.setStyle({ backgroundColor: active ? '#1d4ed8' : '#555555' }));
      btn.on('pointerout', () => btn.setStyle({ backgroundColor: bg }));
      this._dynamicObjects.push(btn);
    }

    const summary = SaveManager.getSlotSummary(this._selectedSaveSlot);
    const summaryText = summary
      ? `Target: Slot ${this._selectedSaveSlot} (Lv.${summary.level} - Area ${summary.area}, Zone ${summary.zone})`
      : `Target: Slot ${this._selectedSaveSlot} (Empty)`;
    this._addLabel(centerX, slotY + 32, summaryText, '#a1a1aa', '12px', false, true);

    const saveNowBtn = this.scene.add.text(centerX, slotY + 66, 'SAVE NOW', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#f0fdf4',
      backgroundColor: '#166534',
      padding: { x: 18, y: 7 },
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    saveNowBtn.on('pointerdown', () => this._manualSave());
    saveNowBtn.on('pointerover', () => saveNowBtn.setStyle({ backgroundColor: '#15803d' }));
    saveNowBtn.on('pointerout', () => saveNowBtn.setStyle({ backgroundColor: '#166534' }));
    this._dynamicObjects.push(saveNowBtn);

    if (this._saveMessage) {
      this._addLabel(centerX, slotY + 96, this._saveMessage, '#93c5fd', '12px', false, true);
    }

    // SESSION
    const sessionY = saveY + 178;
    this._addLabel(centerX, sessionY, 'SESSION', '#a1a1aa', '14px', true, true);

    const manager = this.scene.scene.manager;
    const isGamePaused = !!manager?.isPaused?.('GameScene');
    const pauseLabel = isGamePaused ? 'RESUME GAME' : 'PAUSE GAME';
    const pauseBg = isGamePaused ? '#1d4ed8' : '#374151';
    const pauseHoverBg = isGamePaused ? '#2563eb' : '#4b5563';
    const pauseBtn = this.scene.add.text(centerX, sessionY + 34, pauseLabel, {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#f8fafc',
      backgroundColor: pauseBg,
      padding: { x: 18, y: 7 },
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    pauseBtn.on('pointerdown', () => this._togglePauseGame());
    pauseBtn.on('pointerover', () => pauseBtn.setStyle({ backgroundColor: pauseHoverBg }));
    pauseBtn.on('pointerout', () => pauseBtn.setStyle({ backgroundColor: pauseBg }));
    this._dynamicObjects.push(pauseBtn);

    const quitBtn = this.scene.add.text(centerX, sessionY + 70, 'QUIT TO MAIN MENU', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#f8fafc',
      backgroundColor: '#334155',
      padding: { x: 18, y: 7 },
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    quitBtn.on('pointerdown', () => this._quitToMainMenu());
    quitBtn.on('pointerover', () => quitBtn.setStyle({ backgroundColor: '#475569' }));
    quitBtn.on('pointerout', () => quitBtn.setStyle({ backgroundColor: '#334155' }));
    this._dynamicObjects.push(quitBtn);

    // DANGER ZONE
    const dangerY = sessionY + 120;
    this._addLabel(centerX, dangerY, '-- DANGER ZONE --', '#ef4444', '14px', true, true);
    this._addLabel(centerX, dangerY + 20, 'This will permanently delete all save slots.', '#a1a1aa', '12px', false, true);
    this._addLabel(centerX, dangerY + 38, 'All progress will be lost. This cannot be undone.', '#a1a1aa', '12px', false, true);

    const btnY = this._cy + PANEL_H / 2 - 42;
    const btnLabel = this._wipePending ? '!! ARE YOU SURE? !!' : 'WIPE ALL SAVES';
    const btnColor = this._wipePending ? '#ffffff' : '#ef4444';
    const btnBg = this._wipePending ? '#991b1b' : '#333333';

    const wipeBtn = this.scene.add.text(centerX, btnY, btnLabel, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: btnColor,
      backgroundColor: btnBg,
      padding: { x: 24, y: 8 },
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    wipeBtn.on('pointerdown', () => {
      if (this._wipePending) {
        this._wipePending = false;
        if (this._wipeTimer) {
          clearTimeout(this._wipeTimer);
          this._wipeTimer = null;
        }
        SaveManager.destroy();
        SaveManager.deleteSave();
        window.location.reload();
        return;
      }
      this._wipePending = true;
      this._refresh();
      this._wipeTimer = setTimeout(() => {
        this._wipePending = false;
        if (this._isOpen) this._refresh();
      }, 3000);
    });
    wipeBtn.on('pointerover', () => wipeBtn.setStyle({ backgroundColor: '#555555' }));
    wipeBtn.on('pointerout', () => wipeBtn.setStyle({ backgroundColor: btnBg }));
    this._dynamicObjects.push(wipeBtn);
  }

  _selectSaveSlot(slotId) {
    this._selectedSaveSlot = slotId;
    SaveManager.setActiveSlot(slotId);
    this._setSaveMessage(`Save target set to Slot ${slotId}.`);
  }

  _manualSave() {
    const slotId = this._selectedSaveSlot || SaveManager.getActiveSlot() || 1;
    SaveManager.setActiveSlot(slotId);
    SaveManager.save();
    this._setSaveMessage(`Saved to Slot ${slotId}.`);
  }

  _quitToMainMenu() {
    const slotId = this._selectedSaveSlot || SaveManager.getActiveSlot() || 1;
    SaveManager.setActiveSlot(slotId);
    SaveManager.save();

    const scenePlugin = this.scene.scene;
    const manager = scenePlugin?.manager;
    if (!scenePlugin || !manager) return;

    // Close this modal first so teardown is clean.
    this._close();

    // Use ScenePlugin ops (safer than direct manager ops during input callbacks).
    if (scenePlugin.isPaused('GameScene')) {
      scenePlugin.resume('GameScene');
    }
    scenePlugin.stop('OverworldScene');
    scenePlugin.stop('SpritePreviewScene');
    scenePlugin.stop('UIScene');
    scenePlugin.stop('GameScene');
    scenePlugin.start('StartScene');

    // Fallback: if something prevented scene transition, hard reload to recover.
    setTimeout(() => {
      if (!manager.isActive('StartScene')) {
        window.location.reload();
      }
    }, 120);
  }

  _togglePauseGame() {
    const manager = this.scene.scene.manager;
    if (!manager) return;
    if (!manager.isActive('GameScene')) return;

    if (manager.isPaused('GameScene')) {
      manager.resume('GameScene');
      this._setSaveMessage('Game resumed.');
    } else {
      manager.pause('GameScene');
      this._setSaveMessage('Game paused.');
    }
  }

  _setSaveMessage(message) {
    this._saveMessage = message || '';
    if (this._saveMessageTimer) {
      clearTimeout(this._saveMessageTimer);
      this._saveMessageTimer = null;
    }
    if (this._saveMessage) {
      this._saveMessageTimer = setTimeout(() => {
        this._saveMessage = '';
        if (this._isOpen) this._refresh();
      }, 2200);
    }
    if (this._isOpen) this._refresh();
  }

  _teardownVolumeHandlers() {
    if (this._volumeMoveHandler) {
      this.scene.input.off('pointermove', this._volumeMoveHandler);
      this._volumeMoveHandler = null;
    }
    if (this._volumeUpHandler) {
      this.scene.input.off('pointerup', this._volumeUpHandler);
      this._volumeUpHandler = null;
    }
  }

  _addLabel(x, y, text, color, fontSize = '12px', bold = false, centered = false) {
    const obj = this.scene.add.text(x, y, text, {
      fontFamily: 'monospace',
      fontSize,
      color,
      fontStyle: bold ? 'bold' : 'normal',
    });
    if (centered) obj.setOrigin(0.5);
    this._dynamicObjects.push(obj);
    return obj;
  }

  destroy() {
    if (this._wipeTimer) {
      clearTimeout(this._wipeTimer);
      this._wipeTimer = null;
    }
    if (this._saveMessageTimer) {
      clearTimeout(this._saveMessageTimer);
      this._saveMessageTimer = null;
    }
    this._teardownVolumeHandlers();
    super.destroy();
  }
}
