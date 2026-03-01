// ModalPanel — base class for all modal overlay panels.
// Handles: toggle button, backdrop, panel chrome, mutual exclusion, lifecycle.
// Subclasses override _buildContent(), _getTitle(), _getEvents().

import Phaser from 'phaser';
import { on } from '../events.js';
import { LAYOUT } from '../config.js';
import { snapPx } from './ui-utils.js';

export default class ModalPanel {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts
   * @param {string} opts.key           - Unique panel identifier
   * @param {number} opts.width         - Panel width in pixels
   * @param {number} opts.height        - Panel height in pixels
   * @param {string} opts.hotkey        - Phaser key code name (e.g. 'I', 'U', 'P', 'ESC', 'C')
   * @param {string} opts.buttonLabel   - Text on the bottom bar toggle button
   * @param {number} opts.buttonX       - X position of the toggle button
   * @param {string} [opts.buttonIconKey] - Optional texture key for icon toggle button
   * @param {number} [opts.buttonIconSize=40] - Optional icon toggle display size
   * @param {string} [opts.buttonColor='#ffffff'] - Button text color
   * @param {number} [opts.borderColor=0x444444]  - Panel border color
   * @param {string} [opts.titleColor='#ffffff']   - Title text color
   * @param {string} [opts.titleSize='16px']       - Title font size
   */
  constructor(scene, opts) {
    this.scene = scene;
    this._key = opts.key;
    this._isOpen = false;
    this._unsubs = [];
    this._modalObjects = [];
    this._dynamicObjects = [];

    this._panelW = opts.width;
    this._panelH = opts.height;
    this._borderColor = opts.borderColor ?? 0x444444;
    this._titleColor = opts.titleColor ?? '#ffffff';
    this._titleSize = opts.titleSize ?? '16px';

    this._cx = snapPx(LAYOUT.gameArea.x + LAYOUT.gameArea.w / 2);
    this._cy = snapPx(LAYOUT.gameArea.y + LAYOUT.gameArea.h / 2);

    this._createToggleButton(
      opts.buttonLabel,
      opts.buttonX,
      opts.buttonColor ?? '#ffffff',
      opts.buttonIconKey,
      opts.buttonIconSize ?? 40
    );
    this._createModal();
    this._createStaticContent();
    this._hideModal();

    // Keyboard binding
    if (opts.hotkey) {
      this._hotkey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[opts.hotkey]);
      this._hotkey.on('down', () => this._onHotkeyDown());
    }

    // Subscribe to refresh events
    for (const event of this._getEvents()) {
      this._unsubs.push(on(event, () => this._refresh()));
    }
  }

  /** Override to gate hotkey behavior (e.g. PrestigePanel checks canPrestige). */
  _onHotkeyDown() {
    this._toggle();
  }

  _createToggleButton(label, x, color, iconKey, iconSize) {
    const bx = snapPx(x);
    const by = snapPx(LAYOUT.bottomBar.y + LAYOUT.bottomBar.h / 2);

    if (iconKey && this.scene.textures.exists(iconKey)) {
      this._toggleBtn = this.scene.add.image(bx, by, iconKey)
        .setDisplaySize(snapPx(iconSize), snapPx(iconSize))
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      const baseScaleX = this._toggleBtn.scaleX;
      const baseScaleY = this._toggleBtn.scaleY;
      this._toggleBtn.on('pointerdown', () => this._toggle());
      this._toggleBtn.on('pointerover', () => this._toggleBtn.setScale(baseScaleX * 1.08, baseScaleY * 1.08));
      this._toggleBtn.on('pointerout', () => this._toggleBtn.setScale(baseScaleX, baseScaleY));
      return;
    }

    this._toggleBtn = this.scene.add.text(bx, by, label, {
      fontFamily: 'monospace', fontSize: '14px', color,
      backgroundColor: '#333333', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this._toggleBtn.on('pointerdown', () => this._toggle());
    this._toggleBtn.on('pointerover', () => this._toggleBtn.setStyle({ backgroundColor: '#555555' }));
    this._toggleBtn.on('pointerout', () => this._toggleBtn.setStyle({ backgroundColor: '#333333' }));
  }

  _createModal() {
    const ga = LAYOUT.gameArea;

    // Backdrop
    this._backdrop = this.scene.add.rectangle(
      ga.x + ga.w / 2, ga.y + ga.h / 2, ga.w, ga.h, 0x000000, 0.7
    );
    this._backdrop.setInteractive();
    this._backdrop.on('pointerdown', (pointer) => {
      const px = pointer.x;
      const py = pointer.y;
      const left = this._cx - this._panelW / 2;
      const right = this._cx + this._panelW / 2;
      const top = this._cy - this._panelH / 2;
      const bottom = this._cy + this._panelH / 2;
      if (px < left || px > right || py < top || py > bottom) {
        this._close();
      }
    });
    this._modalObjects.push(this._backdrop);

    // Panel background
    this._panelBg = this.scene.add.rectangle(
      this._cx, this._cy, this._panelW, this._panelH, 0x1a1a2e
    );
    this._panelBg.setStrokeStyle(2, this._borderColor);
    this._modalObjects.push(this._panelBg);

    // Title
    this._title = this.scene.add.text(
      this._cx, this._cy - this._panelH / 2 + 20,
      this._getTitle(),
      {
        fontFamily: 'monospace', fontSize: this._titleSize,
        color: this._titleColor, fontStyle: 'bold',
      }
    ).setOrigin(0.5);
    this._modalObjects.push(this._title);

    // Close button
    const closeX = snapPx(this._cx + this._panelW / 2 - 20);
    const closeY = snapPx(this._cy - this._panelH / 2 + 20);
    this._closeBtn = this.scene.add.text(closeX, closeY, 'X', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ef4444', fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this._closeBtn.on('pointerdown', () => this._close());
    this._modalObjects.push(this._closeBtn);
  }

  /** Override to add static content (separators, headers) to _modalObjects. */
  _createStaticContent() {}

  _toggle() {
    if (this._isOpen) {
      this._close();
    } else {
      this._open();
    }
  }

  _open() {
    this.scene.closeAllModals(this);
    this._isOpen = true;
    this._showModal();
    this._refresh();
  }

  _close() {
    this._isOpen = false;
    this._hideModal();
  }

  _showModal() {
    for (const obj of this._modalObjects) obj.setVisible(true);
  }

  _hideModal() {
    for (const obj of this._modalObjects) obj.setVisible(false);
    this._clearDynamic();
  }

  _clearDynamic() {
    for (const obj of this._dynamicObjects) obj.destroy();
    this._dynamicObjects = [];
  }

  _refresh() {
    if (!this._isOpen) return;
    this._clearDynamic();
    this._buildContent();
  }

  // --- Subclass hooks ---

  /** Override: return panel title string. */
  _getTitle() { return 'PANEL'; }

  /** Override: return array of event names that trigger refresh. */
  _getEvents() { return []; }

  /** Override: create dynamic content (called on every refresh). */
  _buildContent() {}

  destroy() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this._clearDynamic();
    for (const obj of this._modalObjects) obj.destroy();
    this._modalObjects = [];
    if (this._toggleBtn) { this._toggleBtn.destroy(); this._toggleBtn = null; }
    if (this._hotkey) { this._hotkey.destroy(); this._hotkey = null; }
  }
}
