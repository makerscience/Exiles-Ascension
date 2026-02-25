// ZoneNav — two-tier area/zone navigation in the game area.
// Top row: area arrows (< Forest >)
// Bottom row: zone arrows (< Zone 3/5 >)

import Store from '../systems/Store.js';
import BossManager from '../systems/BossManager.js';
import { on, EVENTS } from '../events.js';
import { LAYOUT, WORLD, ZONE_THEMES } from '../config.js';
import { getArea, AREAS } from '../data/areas.js';

export default class ZoneNav {
  constructor(scene) {
    this.scene = scene;
    this._unsubs = [];

    const centerX = LAYOUT.zoneNav.centerX;
    const areaY = LAYOUT.zoneNav.y;
    const zoneY = areaY + 26;

    const strokeProps = { stroke: '#000000', strokeThickness: 4 };
    const textStyle = { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', ...strokeProps };
    const arrowStyle = { fontFamily: 'monospace', fontSize: '20px', color: '#ffffff', ...strokeProps };
    const smallTextStyle = { fontFamily: 'monospace', fontSize: '13px', color: '#e5e5e5', ...strokeProps };
    const smallArrowStyle = { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', ...strokeProps };

    // ── Area row (top) ────────────────────────────────────────────
    this.areaLeftArrow = scene.add.text(centerX - 90, areaY, '\u25C4', arrowStyle).setOrigin(0.5);
    this.areaLeftArrow.setInteractive({ useHandCursor: true });
    this.areaLeftArrow.on('pointerdown', () => this._changeArea(-1));

    this.areaLabel = scene.add.text(centerX, areaY, '', textStyle).setOrigin(0.5);

    this.areaRightArrow = scene.add.text(centerX + 90, areaY, '\u25BA', arrowStyle).setOrigin(0.5);
    this.areaRightArrow.setInteractive({ useHandCursor: true });
    this.areaRightArrow.on('pointerdown', () => this._changeArea(1));

    // ── Zone row (bottom) ─────────────────────────────────────────
    this.zoneLeftArrow = scene.add.text(centerX - 65, zoneY, '\u25C4', smallArrowStyle).setOrigin(0.5);
    this.zoneLeftArrow.setInteractive({ useHandCursor: true });
    this.zoneLeftArrow.on('pointerdown', () => this._changeZone(-1));

    this.zoneLabel = scene.add.text(centerX, zoneY, '', smallTextStyle).setOrigin(0.5);

    this.zoneRightArrow = scene.add.text(centerX + 65, zoneY, '\u25BA', smallArrowStyle).setOrigin(0.5);
    this.zoneRightArrow.setInteractive({ useHandCursor: true });
    this.zoneRightArrow.on('pointerdown', () => this._changeZone(1));

    // Boss progress indicator below zone row
    this.bossProgressText = scene.add.text(centerX, zoneY + 22, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#eab308',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    // Initial render
    this._refresh();

    // Subscribe to changes
    this._unsubs.push(on(EVENTS.WORLD_ZONE_CHANGED, () => this._refresh()));
    this._unsubs.push(on(EVENTS.WORLD_AREA_CHANGED, () => this._refresh()));
    this._unsubs.push(on(EVENTS.SAVE_LOADED, () => this._refresh()));
    this._unsubs.push(on(EVENTS.STATE_CHANGED, () => this._refresh()));
    this._unsubs.push(on(EVENTS.BOSS_CHALLENGE_READY, () => this._refresh()));
    this._unsubs.push(on(EVENTS.BOSS_DEFEATED, () => this._refresh()));
  }

  _refresh() {
    const state = Store.getState();
    const area = state.currentArea;
    const zone = state.currentZone;
    const furthestArea = state.furthestArea;
    const areaData = getArea(area);
    const areaProgress = state.areaProgress[area];

    // Area label
    const areaName = areaData?.name || ZONE_THEMES[area]?.name || `Area ${area}`;
    this.areaLabel.setText(areaName);

    // Area arrow boundaries
    const atMinArea = area <= 1;
    const atMaxArea = area >= furthestArea;

    this.areaLeftArrow.setVisible(!atMinArea);
    if (atMinArea) this.areaLeftArrow.disableInteractive();
    else this.areaLeftArrow.setInteractive({ useHandCursor: true });

    this.areaRightArrow.setVisible(!atMaxArea);
    if (atMaxArea) this.areaRightArrow.disableInteractive();
    else this.areaRightArrow.setInteractive({ useHandCursor: true });

    // Zone label
    const maxZoneCount = areaData ? areaData.zoneCount : 5;
    this.zoneLabel.setText(`Zone ${zone}/${maxZoneCount}`);

    // Zone arrow boundaries
    const maxUnlockedZone = areaProgress ? areaProgress.furthestZone : 1;
    const atMinZone = zone <= 1;
    const atMaxZone = zone >= maxUnlockedZone;

    this.zoneLeftArrow.setVisible(!atMinZone);
    if (atMinZone) this.zoneLeftArrow.disableInteractive();
    else this.zoneLeftArrow.setInteractive({ useHandCursor: true });

    this.zoneRightArrow.setVisible(!atMaxZone);
    if (atMaxZone) this.zoneRightArrow.disableInteractive();
    else this.zoneRightArrow.setInteractive({ useHandCursor: true });

    // Boss progress indicator
    const bossProgress = BossManager.getZoneProgress();
    if (bossProgress.defeated) {
      this.bossProgressText.setText('\u2714 Boss Cleared');
      this.bossProgressText.setStyle({ color: '#22c55e', stroke: '#000000', strokeThickness: 3 });
    } else if (bossProgress.ratio >= 1) {
      // Challenge button now occupies this line when ready.
      this.bossProgressText.setText('');
      this.bossProgressText.setStyle({ color: '#eab308', stroke: '#000000', strokeThickness: 3 });
    } else {
      this.bossProgressText.setText(`Kills: ${bossProgress.kills}/${bossProgress.threshold}`);
      this.bossProgressText.setStyle({ color: '#e5e5e5', stroke: '#000000', strokeThickness: 3 });
    }
  }

  _changeArea(delta) {
    const state = Store.getState();
    const newArea = state.currentArea + delta;
    if (newArea < 1 || newArea > state.furthestArea) return;

    // Navigate to area — go to zone 1 or furthest unlocked zone
    const areaProgress = state.areaProgress[newArea];
    const targetZone = areaProgress ? Math.max(1, areaProgress.furthestZone) : 1;
    Store.setAreaZone(newArea, targetZone);
  }

  _changeZone(delta) {
    const state = Store.getState();
    const areaProgress = state.areaProgress[state.currentArea];
    const maxUnlockedZone = areaProgress ? areaProgress.furthestZone : 1;
    const newZone = state.currentZone + delta;
    if (newZone < 1 || newZone > maxUnlockedZone) return;

    // Zone change within same area — no parallax rebuild
    Store.setAreaZone(state.currentArea, newZone);
  }

  show() {
    this.areaLeftArrow.setVisible(true);
    this.areaLabel.setVisible(true);
    this.areaRightArrow.setVisible(true);
    this.zoneLeftArrow.setVisible(true);
    this.zoneLabel.setVisible(true);
    this.zoneRightArrow.setVisible(true);
    this.bossProgressText.setVisible(true);
    this._refresh();
  }

  hide() {
    this.areaLeftArrow.setVisible(false);
    this.areaLabel.setVisible(false);
    this.areaRightArrow.setVisible(false);
    this.zoneLeftArrow.setVisible(false);
    this.zoneLabel.setVisible(false);
    this.zoneRightArrow.setVisible(false);
    this.bossProgressText.setVisible(false);
    this.areaLeftArrow.disableInteractive();
    this.areaRightArrow.disableInteractive();
    this.zoneLeftArrow.disableInteractive();
    this.zoneRightArrow.disableInteractive();
  }

  destroy() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
  }
}
