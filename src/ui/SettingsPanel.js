// SettingsPanel — modal overlay for game settings.
// Toggle via gear button or ESC key. Contains wipe save with two-click confirm.

import ModalPanel from './ModalPanel.js';
import SaveManager from '../systems/SaveManager.js';
import Store from '../systems/Store.js';
import { LAYOUT } from '../config.js';

const PANEL_W = 500;
const PANEL_H = 420;

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
  }

  _getTitle() { return 'SETTINGS'; }
  _getEvents() { return []; }

  _open() {
    this._wipePending = false;
    super._open();
  }

  _close() {
    this._wipePending = false;
    this._draggingVolume = false;
    if (this._wipeTimer) {
      clearTimeout(this._wipeTimer);
      this._wipeTimer = null;
    }
    super._close();
  }

  _buildContent() {
    const centerX = this._cx;

    // ── SOUND section ──────────────────────────────────────────────
    const soundY = this._cy - 80;
    this._addLabel(centerX, soundY, 'SOUND', '#a1a1aa', '14px', true, true);

    const sliderY = soundY + 35;
    const trackW = 200;
    const trackH = 12;
    const trackX = centerX - 40;  // left edge of track
    const vol = Store.getState().settings.musicVolume;

    // "Music Volume" label
    this._addLabel(trackX - 90, sliderY, 'Music Volume', '#d4d4d8', '13px', false, false);

    // Track background
    const trackBg = this.scene.add.rectangle(trackX, sliderY, trackW, trackH, 0x27272a).setOrigin(0, 0.5);
    this._dynamicObjects.push(trackBg);

    // Track fill
    const trackFill = this.scene.add.rectangle(trackX, sliderY, trackW * vol, trackH, 0x22c55e).setOrigin(0, 0.5);
    this._dynamicObjects.push(trackFill);

    // Percentage label
    const pctLabel = this._addLabel(trackX + trackW + 12, sliderY - 7, `${Math.round(vol * 100)}%`, '#d4d4d8', '13px', false, false);

    // Invisible hit area for interaction (slightly taller for easier clicking)
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
    this.scene.input.on('pointermove', (pointer) => {
      if (this._draggingVolume) setVolume(pointer);
    });
    this.scene.input.on('pointerup', () => {
      this._draggingVolume = false;
    });

    // ── Danger Zone ────────────────────────────────────────────────
    const dangerY = this._cy + 20;
    this._addLabel(centerX, dangerY, '-- DANGER ZONE --', '#ef4444', '14px', true, true);
    this._addLabel(centerX, dangerY + 30, 'This will permanently delete your save file.', '#a1a1aa', '12px', false, true);
    this._addLabel(centerX, dangerY + 50, 'All progress will be lost. This cannot be undone.', '#a1a1aa', '12px', false, true);

    // WIPE button (two-click safeguard)
    const btnY = this._cy + PANEL_H / 2 - 60;
    const btnLabel = this._wipePending ? '!! ARE YOU SURE? !!' : 'WIPE SAVE';
    const btnColor = this._wipePending ? '#ffffff' : '#ef4444';
    const btnBg = this._wipePending ? '#991b1b' : '#333333';

    const wipeBtn = this.scene.add.text(centerX, btnY, btnLabel, {
      fontFamily: 'monospace', fontSize: '16px', color: btnColor,
      backgroundColor: btnBg, padding: { x: 24, y: 8 }, fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    wipeBtn.on('pointerdown', () => {
      if (this._wipePending) {
        this._wipePending = false;
        if (this._wipeTimer) { clearTimeout(this._wipeTimer); this._wipeTimer = null; }
        SaveManager.destroy();
        SaveManager.deleteSave();
        window.location.reload();
      } else {
        this._wipePending = true;
        this._refresh();
        this._wipeTimer = setTimeout(() => {
          this._wipePending = false;
          if (this._isOpen) this._refresh();
        }, 3000);
      }
    });
    wipeBtn.on('pointerover', () => wipeBtn.setStyle({ backgroundColor: '#555555' }));
    wipeBtn.on('pointerout', () => wipeBtn.setStyle({ backgroundColor: btnBg }));
    this._dynamicObjects.push(wipeBtn);
  }

  _addLabel(x, y, text, color, fontSize = '12px', bold = false, centered = false) {
    const obj = this.scene.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize, color,
      fontStyle: bold ? 'bold' : 'normal',
    });
    if (centered) obj.setOrigin(0.5);
    this._dynamicObjects.push(obj);
    return obj;
  }

  destroy() {
    if (this._wipeTimer) { clearTimeout(this._wipeTimer); this._wipeTimer = null; }
    super.destroy();
  }
}
