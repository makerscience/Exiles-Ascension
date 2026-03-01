import { emit, on, EVENTS } from '../events.js';
import { WORLD } from '../config.js';

export default class OnboardingPopup {
  constructor(scene) {
    this.scene = scene;
    this._isOpen = false;
    this._objects = [];
    this._pausedGameScene = false;
    this._activePopupId = null;
    this._unsubs = [
      on(EVENTS.UI_ONBOARDING_REQUESTED, (payload) => this.open(payload)),
    ];
  }

  open(payload = {}) {
    if (this._isOpen) return;

    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    if (lines.length === 0) return;

    this.scene.closeAllModals?.(this);
    this._isOpen = true;
    this._activePopupId = payload.id || null;

    if (!this.scene.scene.isPaused('GameScene')) {
      this.scene.scene.pause('GameScene');
      this._pausedGameScene = true;
    }

    const cx = WORLD.width / 2;
    const cy = WORLD.height / 2;

    const backdrop = this.scene.add.rectangle(cx, cy, WORLD.width, WORLD.height, 0x000000, 0.72)
      .setDepth(400)
      .setInteractive();
    // Backdrop is intentionally non-dismissable; close only via CONTINUE button.
    backdrop.on('pointerdown', () => {});

    const panelW = 700;
    const panelH = 430;
    const panel = this.scene.add.rectangle(cx, cy, panelW, panelH, 0x111827, 0.98)
      .setStrokeStyle(2, 0x22c55e)
      .setDepth(401);

    const title = this.scene.add.text(cx, cy - 170, payload.title || 'SYSTEM BRIEFING', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#22c55e',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(402);

    const body = this.scene.add.text(cx - 300, cy - 120, lines.join('\n\n'), {
      fontFamily: 'monospace',
      fontSize: '19px',
      color: '#e5e7eb',
      lineSpacing: 8,
      wordWrap: { width: 600 },
    }).setDepth(402);

    const hint = this.scene.add.text(cx, cy + (panelH / 2) + 12, 'Click CONTINUE to proceed', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#9ca3af',
    }).setOrigin(0.5).setDepth(402);

    const beginBtn = this.scene.add.text(cx, cy + (panelH / 2) + 44, 'CONTINUE', {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#f0fdf4',
      backgroundColor: '#166534',
      fontStyle: 'bold',
      padding: { x: 20, y: 8 },
    }).setOrigin(0.5).setDepth(403).setInteractive({ useHandCursor: true });
    beginBtn.on('pointerdown', () => this._close());
    beginBtn.on('pointerover', () => beginBtn.setStyle({ backgroundColor: '#15803d' }));
    beginBtn.on('pointerout', () => beginBtn.setStyle({ backgroundColor: '#166534' }));

    this._objects.push(backdrop, panel, title, body, hint, beginBtn);
  }

  _close() {
    if (!this._isOpen) return;
    this._isOpen = false;

    for (const obj of this._objects) {
      obj.destroy();
    }
    this._objects = [];

    if (this._pausedGameScene) {
      this.scene.scene.resume('GameScene');
      this._pausedGameScene = false;
    }

    emit(EVENTS.UI_ONBOARDING_DISMISSED, { id: this._activePopupId });
    this._activePopupId = null;
  }

  destroy() {
    this._close();
    for (const unsub of this._unsubs) {
      unsub();
    }
    this._unsubs = [];
  }
}
