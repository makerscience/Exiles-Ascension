// InventoryPanel — modal overlay for inventory and equipment.
// Toggle via BAG button or I key. Silhouette equipment screen on left, inventory grid on right.

import Phaser from 'phaser';
import ModalPanel from './ModalPanel.js';
import { EVENTS } from '../events.js';
import { COLORS } from '../config.js';
import { getItem, getScaledItem } from '../data/items.js';
import {
  getPlayerGlobalZone, getLeftSlots, getRightSlots, getAccessorySlots,
  getEquipSlotForItem, getSlotById,
} from '../data/equipSlots.js';
import Store from '../systems/Store.js';
import InventorySystem from '../systems/InventorySystem.js';
import { parseStackKey } from '../systems/InventorySystem.js';
import EnhancementManager from '../systems/EnhancementManager.js';
import { makeButton } from './ui-utils.js';

const PANEL_W = 880;
const PANEL_H = 560;

// Grid constants (inventory grid, right side)
const GRID_COLS = 5;
const GRID_ROWS = 4;
const SLOT_SIZE = 86;
const SLOT_GAP = 6;
const SLOT_STEP = SLOT_SIZE + SLOT_GAP;

// Equipment slot dimensions
const EQ_W = 72;
const EQ_H = 72;
const EQ_GAP = 6;

// Accessory slot dimensions (bottom row)
const ACC_W = 72;
const ACC_H = 26;
const ACC_GAP = 4;

// Rarity colors as hex numbers for Phaser graphics
const RARITY_HEX = {
  common:   0xa1a1aa,
  uncommon: 0x22c55e,
  rare:     0x3b82f6,
  epic:     0xa855f7,
};

export default class InventoryPanel extends ModalPanel {
  constructor(scene) {
    super(scene, {
      key: 'inventory',
      width: PANEL_W,
      height: PANEL_H,
      hotkey: 'I',
      buttonLabel: 'BAG [I]',
      buttonX: 480 - 80,
      buttonColor: '#ffffff',
    });

    this._selectedItemId = null;
    this._tooltipContainer = null;
    this._tooltipMoveHandler = null;
    this._equipSlotBgs = {};   // slotId → { bg, borderWidth, borderColor }
    this._dragGhost = null;
    this._dragData = null;      // { stackKey, equipSlotId }
    this._pendingClick = null;  // { action: 'select'|'equip', stackKey }
    this._sellZone = null;      // sell drop-zone rectangle
    this._refreshPending = false; // deferred refresh while dragging
  }

  _getTitle() { return 'INVENTORY'; }

  _getEvents() {
    return [
      EVENTS.INV_ITEM_ADDED, EVENTS.INV_ITEM_EQUIPPED,
      EVENTS.INV_ITEM_SOLD, EVENTS.INV_FULL, EVENTS.ENHANCE_PURCHASED, EVENTS.SAVE_LOADED,
    ];
  }

  _createStaticContent() {
    const panelLeft = this._cx - PANEL_W / 2;

    // Silhouette — large dimmed player sprite centered in left zone (5x scale, clips at panel edges)
    const silCx = panelLeft + 170;
    const silCy = this._cy + 10;
    this._silhouette = this.scene.add.image(silCx, silCy, 'player001_default');
    this._silhouette.setDisplaySize(540, 675);
    this._silhouette.setTint(0x333344);
    this._silhouette.setAlpha(0.4);
    this._modalObjects.push(this._silhouette);

    // Mask so silhouette doesn't bleed into the right zone or outside the panel
    const panelTop = this._cy - PANEL_H / 2;
    const maskShape = this.scene.make.graphics({ x: 0, y: 0, add: false });
    maskShape.fillRect(panelLeft, panelTop, 340, PANEL_H);
    this._silhouette.setMask(maskShape.createGeometryMask());

    // Store silhouette center for dynamic content
    this._silCx = silCx;
    this._silCy = silCy;

    // Equipment section label
    const eqX = panelLeft + 20;
    const eqY = this._cy - PANEL_H / 2 + 50;
    this._eqLabel = this.scene.add.text(eqX, eqY, 'Equipment', {
      fontFamily: 'monospace', fontSize: '15px', color: '#818cf8',
    });
    this._modalObjects.push(this._eqLabel);

    // Separator line between equipment and inventory
    const sepX = panelLeft + 345;
    this._sepLine = this.scene.add.rectangle(sepX, this._cy, 1, PANEL_H - 30, 0x444444);
    this._modalObjects.push(this._sepLine);

    // Inventory section label
    const invX = panelLeft + 360;
    const invY = this._cy - PANEL_H / 2 + 50;
    this._invLabel = this.scene.add.text(invX, invY, 'Inventory', {
      fontFamily: 'monospace', fontSize: '15px', color: '#818cf8',
    });
    this._modalObjects.push(this._invLabel);
  }

  _open() {
    this._selectedItemId = null;
    this._selectedEquippedSlotId = null;
    super._open();
  }

  _close() {
    this._hideTooltip();
    if (this._dragGhost) { this._dragGhost.destroy(); this._dragGhost = null; }
    this._dragData = null;
    this._pendingClick = null;
    this._selectedItemId = null;
    this._selectedEquippedSlotId = null;
    super._close();
  }

  // Override: defer refresh while dragging so the dragged slot isn't destroyed mid-drag
  _refresh() {
    if (!this._isOpen) return;
    if (this._dragData) {
      this._refreshPending = true;
      return;
    }
    this._refreshPending = false;
    this._clearDynamic();
    this._buildContent();
  }

  _buildContent() {
    // Tooltip intentionally NOT destroyed here — it persists across refreshes
    // and gets replaced naturally on the next pointerover
    this._equipSlotBgs = {};
    this._pendingClick = null;
    this._renderEquipmentSilhouette();
    this._renderInventoryGrid();
    this._renderItemDetail();

    // Re-apply equip slot highlight for selected item (survives refresh)
    if (this._selectedItemId) {
      const selItem = getItem(this._selectedItemId);
      if (selItem) {
        const selSlotId = getEquipSlotForItem(selItem.slot);
        if (selSlotId) this._highlightEquipSlot(selSlotId);
      }
    }
    if (this._selectedEquippedSlotId) {
      this._highlightEquipSlot(this._selectedEquippedSlotId);
    }
  }

  // --- Equipment Silhouette (left zone) ---

  _renderEquipmentSilhouette() {
    const state = Store.getState();
    const globalZone = getPlayerGlobalZone();
    const leftSlots = getLeftSlots(globalZone);
    const rightSlots = getRightSlots(globalZone);
    const accSlots = getAccessorySlots();

    const silCx = this._silCx;
    const silCy = this._silCy;

    // Connector lines graphics
    const gfx = this.scene.add.graphics();
    gfx.lineStyle(1, 0x555566, 0.6);
    this._dynamicObjects.push(gfx);

    // Left column — flush to left edge of panel
    const panelLeft = this._cx - PANEL_W / 2;
    const leftX = panelLeft + 10;
    this._layoutColumn(leftSlots, leftX, silCy, state, gfx, silCx, silCy, 'left');

    // Right column — flush to right edge of equipment zone (separator at panelLeft + 345)
    const rightX = panelLeft + 345 - EQ_W - 10;
    this._layoutColumn(rightSlots, rightX, silCy, state, gfx, silCx, silCy, 'right');

    // Accessory grid — bottom row
    if (accSlots.length > 0) {
      this._layoutAccessories(accSlots, silCx, silCy + 100, state);
    }
  }

  /**
   * Stack slots vertically in a column, centered on silCy.
   */
  _layoutColumn(slots, x, centerY, state, gfx, silCx, silCy, side) {
    if (slots.length === 0) return;

    // Panel bounds for clamping connector line endpoints
    const panelLeft = this._cx - PANEL_W / 2;
    const panelTop = this._cy - PANEL_H / 2 + 40; // below title
    const panelBottom = this._cy + PANEL_H / 2 - 10;
    const leftZoneRight = panelLeft + 340;

    const totalH = slots.length * EQ_H + (slots.length - 1) * EQ_GAP;
    let y = centerY - totalH / 2;

    for (const slotDef of slots) {
      const stackKey = state.equipped[slotDef.id];
      const item = stackKey ? getItem(stackKey) : null;
      const rarity = stackKey ? parseStackKey(stackKey).rarity : null;

      this._createEquipSlotSmall(x, y, slotDef, item, rarity, stackKey);

      // Connector line from slot edge to body anchor (clamped to panel bounds)
      if (slotDef.anchor) {
        const rawAnchorX = silCx + slotDef.anchor.x;
        const rawAnchorY = silCy + slotDef.anchor.y;
        const anchorX = Math.max(panelLeft + 5, Math.min(rawAnchorX, leftZoneRight - 5));
        const anchorY = Math.max(panelTop, Math.min(rawAnchorY, panelBottom));
        const lineStartX = side === 'left' ? x + EQ_W : x;
        const lineStartY = y + EQ_H / 2;

        gfx.beginPath();
        gfx.moveTo(lineStartX, lineStartY);
        gfx.lineTo(anchorX, anchorY);
        gfx.strokePath();

        // Small dot at anchor point
        gfx.fillStyle(0x555566, 0.8);
        gfx.fillCircle(anchorX, anchorY, 2);
      }

      y += EQ_H + EQ_GAP;
    }
  }

  /**
   * Layout accessory slots in a horizontal grid below the silhouette.
   */
  _layoutAccessories(slots, centerX, startY, state) {
    const cols = 4;
    const totalW = cols * ACC_W + (cols - 1) * ACC_GAP;
    const originX = centerX - totalW / 2;

    for (let i = 0; i < slots.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = originX + col * (ACC_W + ACC_GAP);
      const y = startY + row * (ACC_H + ACC_GAP);

      const slotDef = slots[i];
      const stackKey = state.equipped[slotDef.id];
      const item = stackKey ? getItem(stackKey) : null;
      const rarity = stackKey ? parseStackKey(stackKey).rarity : null;

      this._createAccessorySlot(x, y, slotDef, item, rarity);
    }
  }

  /**
   * Small equipment slot box (84x32) for body slots around silhouette.
   */
  _createEquipSlotSmall(x, y, slotDef, item, rarity, stackKey) {
    const displayRarity = rarity || (item ? item.rarity : null);
    const rarityColor = displayRarity ? (RARITY_HEX[displayRarity] || 0xa1a1aa) : 0x333333;
    const borderWidth = item ? 2 : 1;

    const bg = this.scene.add.rectangle(
      x + EQ_W / 2, y + EQ_H / 2, EQ_W, EQ_H, 0x3a3a4e
    );
    bg.setStrokeStyle(borderWidth, rarityColor);
    bg.setInteractive({ useHandCursor: !!item });
    this._dynamicObjects.push(bg);
    this._equipSlotBgs[slotDef.id] = { bg, borderWidth, borderColor: rarityColor };

    // Slot label (top-left, 8px grey)
    const label = this.scene.add.text(x + 3, y + 2, slotDef.label.toUpperCase(), {
      fontFamily: 'monospace', fontSize: '10px', color: '#666666',
    });
    this._dynamicObjects.push(label);

    if (item) {
      const enhancementLevel = EnhancementManager.getLevel(slotDef.id);
      if (enhancementLevel > 0) {
        const badge = this.scene.add.text(
          x + EQ_W - 4, y + 2, `+${enhancementLevel}`,
          { fontFamily: 'monospace', fontSize: '10px', color: '#facc15', fontStyle: 'bold' }
        ).setOrigin(1, 0);
        this._dynamicObjects.push(badge);
      }

      if (item.thumbnail && this.scene.textures.exists(item.thumbnail)) {
        const thumb = this.scene.add.image(
          x + EQ_W / 2, y + EQ_H / 2, item.thumbnail
        );
        thumb.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
        thumb.setDisplaySize(EQ_H - 6, EQ_H - 6);
        this._dynamicObjects.push(thumb);
      } else {
        const nameText = this.scene.add.text(
          x + EQ_W / 2, y + EQ_H / 2 + 4, item.name,
          {
            fontFamily: 'monospace', fontSize: '11px',
            color: COLORS.rarity[displayRarity] || '#a1a1aa',
            fontStyle: 'bold', align: 'center',
            wordWrap: { width: EQ_W - 8 },
          }
        ).setOrigin(0.5);
        this._dynamicObjects.push(nameText);
      }

      bg.on('pointerdown', (pointer) => {
        const quickUnequip = pointer.rightButtonDown() || pointer.event.shiftKey;
        if (quickUnequip) {
          pointer.event.preventDefault();
          InventorySystem.unequipItem(slotDef.id);
          if (this._selectedEquippedSlotId === slotDef.id) this._selectedEquippedSlotId = null;
          return;
        }
        this._selectedItemId = null;
        this._selectedEquippedSlotId = slotDef.id;
        this._refresh();
      });
      bg.on('pointerover', () => {
        bg.setStrokeStyle(3, 0xffffff);
        this._showTooltip(stackKey, rarity, slotDef, true);
      });
      bg.on('pointerout', () => {
        bg.setStrokeStyle(borderWidth, rarityColor);
        this._hideTooltip();
      });
    } else {
      const emptyText = this.scene.add.text(
        x + EQ_W / 2, y + EQ_H / 2 + 4, 'empty',
        { fontFamily: 'monospace', fontSize: '10px', color: '#444444' }
      ).setOrigin(0.5);
      this._dynamicObjects.push(emptyText);
    }
  }

  /**
   * Accessory slot box (72x26) for bottom accessories.
   */
  _createAccessorySlot(x, y, slotDef, item, rarity) {
    const displayRarity = rarity || (item ? item.rarity : null);
    const rarityColor = displayRarity ? (RARITY_HEX[displayRarity] || 0xa1a1aa) : 0x333333;
    const borderWidth = item ? 2 : 1;

    const bg = this.scene.add.rectangle(
      x + ACC_W / 2, y + ACC_H / 2, ACC_W, ACC_H, 0x3a3a4e
    );
    bg.setStrokeStyle(borderWidth, rarityColor);
    bg.setInteractive({ useHandCursor: !!item });
    this._dynamicObjects.push(bg);

    const label = this.scene.add.text(x + 3, y + 1, slotDef.label.toUpperCase(), {
      fontFamily: 'monospace', fontSize: '9px', color: '#666666',
    });
    this._dynamicObjects.push(label);

    if (item) {
      const nameText = this.scene.add.text(
        x + ACC_W / 2, y + ACC_H / 2 + 3, item.name,
        {
          fontFamily: 'monospace', fontSize: '10px',
          color: COLORS.rarity[displayRarity] || '#a1a1aa',
          fontStyle: 'bold', align: 'center',
          wordWrap: { width: ACC_W - 6 },
        }
      ).setOrigin(0.5);
      this._dynamicObjects.push(nameText);

      bg.on('pointerdown', () => InventorySystem.unequipItem(slotDef.id));
      bg.on('pointerover', () => bg.setStrokeStyle(3, 0xffffff));
      bg.on('pointerout', () => bg.setStrokeStyle(borderWidth, rarityColor));
    } else {
      const emptyText = this.scene.add.text(
        x + ACC_W / 2, y + ACC_H / 2 + 3, 'empty',
        { fontFamily: 'monospace', fontSize: '9px', color: '#444444' }
      ).setOrigin(0.5);
      this._dynamicObjects.push(emptyText);
    }
  }

  // --- Inventory Grid (5x4 on right) ---

  _renderInventoryGrid() {
    const state = Store.getState();
    const stacks = state.inventoryStacks;
    const entries = Object.entries(stacks);

    const panelLeft = this._cx - PANEL_W / 2;
    const gridOriginX = panelLeft + 360;
    const gridOriginY = this._cy - PANEL_H / 2 + 75;

    // Count label
    const countText = this.scene.add.text(
      this._cx + PANEL_W / 2 - 20, this._cy - PANEL_H / 2 + 50,
      `${entries.length}/20`,
      { fontFamily: 'monospace', fontSize: '13px', color: '#a1a1aa' }
    ).setOrigin(1, 0);
    this._dynamicObjects.push(countText);

    // Sell drop-zone (upper-right of inventory area)
    const sellX = this._cx + PANEL_W / 2 - 70;
    const sellY = this._cy - PANEL_H / 2 + 42;
    const sellW = 56;
    const sellH = 38;
    const sellBg = this.scene.add.rectangle(
      sellX + sellW / 2, sellY + sellH / 2, sellW, sellH, 0x3a3a4e
    );
    sellBg.setStrokeStyle(1, 0x8b5e1a);
    this._dynamicObjects.push(sellBg);
    const sellLabel = this.scene.add.text(
      sellX + sellW / 2, sellY + sellH / 2, 'SELL',
      { fontFamily: 'monospace', fontSize: '12px', color: '#eab308', fontStyle: 'bold' }
    ).setOrigin(0.5);
    this._dynamicObjects.push(sellLabel);
    this._sellZone = sellBg;

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const idx = row * GRID_COLS + col;
        const x = gridOriginX + col * SLOT_STEP;
        const y = gridOriginY + row * SLOT_STEP;

        if (idx < entries.length) {
          const [stackKey, stack] = entries[idx];
          const item = getItem(stackKey);
          if (item) {
            const isSelected = this._selectedItemId === stackKey;
            const rarity = stack.rarity || item.rarity;
            this._createSlot(x, y, item, stackKey, stack.count, isSelected, rarity);
          } else {
            this._createEmptySlot(x, y);
          }
        } else {
          this._createEmptySlot(x, y);
        }
      }
    }
  }

  _createSlot(x, y, item, stackKey, count, isSelected, rarity) {
    const rarityColor = RARITY_HEX[rarity] || 0xa1a1aa;
    const borderWidth = isSelected ? 3 : 2;
    const borderColor = isSelected ? 0xffffff : rarityColor;

    const bg = this.scene.add.rectangle(
      x + SLOT_SIZE / 2, y + SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 0x3a3a4e
    );
    bg.setStrokeStyle(borderWidth, borderColor);
    bg.setInteractive({ useHandCursor: true });
    this._dynamicObjects.push(bg);

    if (isSelected) {
      const glow = this.scene.add.rectangle(
        x + SLOT_SIZE / 2, y + SLOT_SIZE / 2, SLOT_SIZE + 6, SLOT_SIZE + 6
      );
      glow.setStrokeStyle(1, rarityColor);
      glow.setFillStyle(0x000000, 0);
      this._dynamicObjects.push(glow);
    }

    if (item.thumbnail && this.scene.textures.exists(item.thumbnail)) {
      const thumb = this.scene.add.image(
        x + SLOT_SIZE / 2, y + SLOT_SIZE / 2, item.thumbnail
      );
      thumb.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      thumb.setDisplaySize(SLOT_SIZE - 12, SLOT_SIZE - 12);
      this._dynamicObjects.push(thumb);
    } else {
      const nameText = this.scene.add.text(
        x + SLOT_SIZE / 2, y + SLOT_SIZE / 2 - (count > 1 ? 5 : 0), item.name,
        {
          fontFamily: 'monospace', fontSize: '11px',
          color: COLORS.rarity[rarity] || '#a1a1aa',
          fontStyle: 'bold', align: 'center',
          wordWrap: { width: SLOT_SIZE - 6 },
        }
      ).setOrigin(0.5);
      this._dynamicObjects.push(nameText);
    }

    if (count > 1) {
      const badge = this.scene.add.text(
        x + SLOT_SIZE - 4, y + SLOT_SIZE - 4, `x${count}`,
        { fontFamily: 'monospace', fontSize: '12px', color: '#eab308', fontStyle: 'bold' }
      ).setOrigin(1, 1);
      this._dynamicObjects.push(badge);
    }

    // Defer select/equip to pointerup so the bg survives long enough for drag
    bg.on('pointerdown', (pointer) => {
      if (pointer.event.shiftKey) {
        InventorySystem.sellItem(stackKey, count);
        return;
      }
      this._pendingClick = this._selectedItemId === stackKey
        ? { action: 'equip', stackKey }
        : { action: 'select', stackKey };
    });
    bg.on('pointerup', () => {
      const pending = this._pendingClick;
      this._pendingClick = null;
      if (!pending) return;
      if (pending.action === 'equip') {
        InventorySystem.equipItem(pending.stackKey);
        this._selectedItemId = null;
        this._selectedEquippedSlotId = null;
      } else {
        this._selectedItemId = pending.stackKey;
        this._selectedEquippedSlotId = null;
        this._refresh();
      }
    });

    const equipSlotId = getEquipSlotForItem(item.slot);
    const slotDef = equipSlotId ? getSlotById(equipSlotId) : null;
    bg.on('pointerover', () => {
      if (!isSelected) bg.setStrokeStyle(2, 0xffffff);
      this._showTooltip(stackKey, rarity, slotDef, false);
      if (equipSlotId) this._highlightEquipSlot(equipSlotId);
    });
    bg.on('pointerout', () => {
      if (!isSelected) bg.setStrokeStyle(borderWidth, borderColor);
      this._hideTooltip();
      if (equipSlotId) this._unhighlightEquipSlot(equipSlotId);
    });

    // Drag-to-equip
    this.scene.input.setDraggable(bg);

    bg.on('dragstart', (pointer) => {
      this._pendingClick = null; // cancel click — user is dragging
      this._dragData = { stackKey, equipSlotId, count };
      if (item.thumbnail && this.scene.textures.exists(item.thumbnail)) {
        this._dragGhost = this.scene.add.image(pointer.x, pointer.y, item.thumbnail);
        this._dragGhost.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
        this._dragGhost.setDisplaySize((SLOT_SIZE - 12) * 1.5, (SLOT_SIZE - 12) * 1.5);
      } else {
        this._dragGhost = this.scene.add.text(pointer.x, pointer.y, item.name, {
          fontFamily: 'monospace', fontSize: '12px',
          color: COLORS.rarity[rarity] || '#a1a1aa',
          fontStyle: 'bold', backgroundColor: '#1a1a2e',
          padding: { x: 4, y: 2 },
        }).setOrigin(0.5);
      }
      this._dragGhost.setDepth(300).setAlpha(0.9);
      if (equipSlotId) this._highlightEquipSlot(equipSlotId);
      if (this._sellZone) this._sellZone.setStrokeStyle(2, 0xeab308);
    });

    bg.on('drag', (pointer) => {
      if (this._dragGhost) this._dragGhost.setPosition(pointer.x, pointer.y);
      // Highlight sell zone on hover
      if (this._sellZone) {
        const over = this._sellZone.getBounds().contains(pointer.x, pointer.y);
        this._sellZone.setStrokeStyle(over ? 3 : 2, 0xeab308);
        this._sellZone.setFillStyle(over ? 0x3d2a0a : 0x3a3a4e);
      }
    });

    bg.on('dragend', (pointer) => {
      if (this._dragGhost) { this._dragGhost.destroy(); this._dragGhost = null; }

      const data = this._dragData;
      this._dragData = null;

      if (!data) return;

      // Check sell zone
      if (this._sellZone && this._sellZone.getBounds().contains(pointer.x, pointer.y)) {
        InventorySystem.sellItem(data.stackKey, data.count);
        if (this._selectedItemId === data.stackKey) this._selectedItemId = null;
        this._selectedEquippedSlotId = null;
        if (data.equipSlotId) this._unhighlightEquipSlot(data.equipSlotId);
        this._sellZone.setStrokeStyle(1, 0x8b5e1a);
        this._sellZone.setFillStyle(0x3a3a4e);
        if (this._refreshPending) { this._refreshPending = false; this._refresh(); }
        return;
      }

      // Check equip slot
      if (data.equipSlotId) {
        const entry = this._equipSlotBgs[data.equipSlotId];
        if (entry && entry.bg.getBounds().contains(pointer.x, pointer.y)) {
          InventorySystem.equipItem(data.stackKey);
          this._selectedItemId = null;
          this._selectedEquippedSlotId = null;
        }
        this._unhighlightEquipSlot(data.equipSlotId);
      }

      // Reset sell zone style
      if (this._sellZone) {
        this._sellZone.setStrokeStyle(1, 0x8b5e1a);
        this._sellZone.setFillStyle(0x3a3a4e);
      }

      // Flush any refresh that was deferred while dragging
      if (this._refreshPending) {
        this._refreshPending = false;
        this._refresh();
      }
    });
  }

  _createEmptySlot(x, y) {
    const bg = this.scene.add.rectangle(
      x + SLOT_SIZE / 2, y + SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 0x3a3a4e
    );
    bg.setStrokeStyle(1, 0x333333);
    this._dynamicObjects.push(bg);
  }

  // --- Item Detail Panel (below grid) ---

  _renderItemDetail() {
    const state = Store.getState();
    const panelLeft = this._cx - PANEL_W / 2;
    const detailX = panelLeft + 360;
    const detailY = this._cy + PANEL_H / 2 - 80;

    const renderStatLabel = (scaled) => {
      if (scaled.statBonuses.atk > 0) return `+${scaled.statBonuses.atk} ATK`;
      if (scaled.statBonuses.def > 0) return `+${scaled.statBonuses.def} DEF`;
      if (scaled.statBonuses.agi > 0) return `+${scaled.statBonuses.agi} AGI`;
      if (scaled.statBonuses.hp > 0) return `+${scaled.statBonuses.hp} HP`;
      return `+${scaled.statBonuses.regen} REGEN`;
    };

    if (this._selectedEquippedSlotId) {
      const slotId = this._selectedEquippedSlotId;
      const stackKey = state.equipped[slotId];
      if (!stackKey) {
        this._selectedEquippedSlotId = null;
        return;
      }

      const rarity = parseStackKey(stackKey).rarity || 'common';
      const scaled = getScaledItem(stackKey, rarity);
      if (!scaled) return;

      const rarityColor = COLORS.rarity[rarity] || '#a1a1aa';
      const statStr = renderStatLabel(scaled);
      const headerText = this.scene.add.text(
        detailX, detailY,
        `${scaled.name}  ${rarity} ${scaled.slot}  ${statStr}`,
        { fontFamily: 'monospace', fontSize: '13px', color: rarityColor }
      );
      this._dynamicObjects.push(headerText);

      const descText = this.scene.add.text(
        detailX, detailY + 16, `"${scaled.description}"`,
        {
          fontFamily: 'monospace', fontSize: '12px', color: '#888888',
          fontStyle: 'italic', wordWrap: { width: PANEL_W - 400 },
        }
      );
      this._dynamicObjects.push(descText);

      const level = EnhancementManager.getLevel(slotId);
      const maxLevel = EnhancementManager.getMaxLevel();
      const bonusPct = Math.round((EnhancementManager.getBonusMultiplier(slotId) - 1) * 100);
      const enhanceInfo = this.scene.add.text(
        detailX, detailY + 34, `Enhancement: +${level} (${bonusPct}% stats)`,
        { fontFamily: 'monospace', fontSize: '11px', color: '#facc15' }
      );
      this._dynamicObjects.push(enhanceInfo);

      const nextCost = EnhancementManager.getCost(slotId);
      const canEnhance = EnhancementManager.canEnhance(slotId);
      const atMax = level >= maxLevel;
      let statusText = atMax ? 'MAX LEVEL' : `Next: ${nextCost}g`;
      if (!atMax && !state.gold.gte(nextCost)) statusText = `Need: ${nextCost}g`;
      const enhanceStatus = this.scene.add.text(
        detailX, detailY + 48, statusText,
        { fontFamily: 'monospace', fontSize: '10px', color: atMax ? '#666666' : (canEnhance ? '#d1d5db' : '#f87171') }
      );
      this._dynamicObjects.push(enhanceStatus);

      let btnX = detailX;
      const btnY = detailY + 66;
      const enhanceBtn = makeButton(this.scene, btnX, btnY, '[ENHANCE]', {
        color: canEnhance ? '#facc15' : '#666666',
        bg: canEnhance ? '#333333' : '#222222',
        onDown: () => {
          if (!EnhancementManager.enhance(slotId)) return;
          this._refresh();
        },
      });
      this._dynamicObjects.push(enhanceBtn);
      btnX += enhanceBtn.width + 8;

      const unequipBtn = makeButton(this.scene, btnX, btnY, 'Unequip', {
        color: '#22c55e',
        onDown: () => {
          InventorySystem.unequipItem(slotId);
          this._selectedEquippedSlotId = null;
          this._refresh();
        },
      });
      this._dynamicObjects.push(unequipBtn);
      return;
    }

    if (!this._selectedItemId) return;

    const stack = state.inventoryStacks[this._selectedItemId];
    if (!stack) {
      this._selectedItemId = null;
      return;
    }

    const rarity = stack.rarity || 'common';
    const scaled = getScaledItem(this._selectedItemId, rarity);
    if (!scaled) return;

    const rarityColor = COLORS.rarity[rarity] || '#a1a1aa';
    const statStr = renderStatLabel(scaled);

    const headerText = this.scene.add.text(
      detailX, detailY,
      `${scaled.name}  ${rarity} ${scaled.slot}  ${statStr}`,
      { fontFamily: 'monospace', fontSize: '13px', color: rarityColor }
    );
    this._dynamicObjects.push(headerText);

    const descText = this.scene.add.text(
      detailX, detailY + 16, `"${scaled.description}"`,
      {
        fontFamily: 'monospace', fontSize: '12px', color: '#888888',
        fontStyle: 'italic', wordWrap: { width: PANEL_W - 400 },
      }
    );
    this._dynamicObjects.push(descText);

    // Action buttons
    const btnY = detailY + 36;
    let btnX = detailX;

    const sell1 = makeButton(this.scene, btnX, btnY, `Sell 1 (${scaled.sellValue}g)`, {
      color: '#eab308',
      onDown: () => {
        InventorySystem.sellItem(this._selectedItemId, 1);
        const s = Store.getState().inventoryStacks[this._selectedItemId];
        if (!s) this._selectedItemId = null;
        this._selectedEquippedSlotId = null;
      },
    });
    this._dynamicObjects.push(sell1);

    btnX += sell1.width + 8;

    if (stack.count > 1) {
      const totalGold = scaled.sellValue * stack.count;
      const sellAll = makeButton(this.scene, btnX, btnY, `Sell All x${stack.count} (${totalGold}g)`, {
        color: '#eab308',
        onDown: () => {
          InventorySystem.sellItem(this._selectedItemId, stack.count);
          this._selectedItemId = null;
          this._selectedEquippedSlotId = null;
        },
      });
      this._dynamicObjects.push(sellAll);
      btnX += sellAll.width + 8;
    }

    const equipBtn = makeButton(this.scene, btnX, btnY, 'Equip', {
      color: '#22c55e',
      onDown: () => {
        InventorySystem.equipItem(this._selectedItemId);
        this._selectedItemId = null;
        this._selectedEquippedSlotId = null;
      },
    });
    this._dynamicObjects.push(equipBtn);
  }

  // --- Equip Slot Highlighting ---

  _highlightEquipSlot(slotId) {
    const entry = this._equipSlotBgs[slotId];
    if (!entry) return;
    entry.bg.setStrokeStyle(3, 0xfbbf24); // bright amber
  }

  _unhighlightEquipSlot(slotId) {
    const entry = this._equipSlotBgs[slotId];
    if (!entry) return;
    entry.bg.setStrokeStyle(entry.borderWidth, entry.borderColor);
  }

  // --- Hover Tooltip ---

  _hideTooltip() {
    if (this._tooltipMoveHandler) {
      this.scene.input.off('pointermove', this._tooltipMoveHandler);
      this._tooltipMoveHandler = null;
    }
    if (this._tooltipContainer) {
      this._tooltipContainer.destroy();
      this._tooltipContainer = null;
    }
  }

  _showTooltip(stackKey, rarity, slotDef, isEquipped) {
    this._hideTooltip();

    const scaled = getScaledItem(stackKey, rarity);
    if (!scaled) return;

    const STAT_LABELS = {
      atk: 'ATK', def: 'DEF', hp: 'HP',
      regen: 'REGEN', atkSpeed: 'SPD', str: 'STR', agi: 'AGI',
    };
    const DEPTH = 200;
    const TT_W = 280;
    const PAD = 8;

    // Look up equipped item for comparison
    let equippedScaled = null;
    let eqRarity = null;
    if (!isEquipped && slotDef) {
      const equippedKey = Store.getState().equipped[slotDef.id];
      if (equippedKey) {
        eqRarity = parseStackKey(equippedKey).rarity;
        equippedScaled = getScaledItem(equippedKey, eqRarity);
      }
    }

    const container = this.scene.add.container(0, 0);
    container.setDepth(DEPTH);

    const _tt = (x, y, text, style) => {
      const t = this.scene.add.text(x, y, text, { fontFamily: 'monospace', ...style });
      container.add(t);
      return t;
    };

    // Row 1: Name + rarity/slot
    const rarityColor = COLORS.rarity[rarity] || '#a1a1aa';
    const slotLabel = slotDef ? slotDef.label : scaled.slot;
    const nameT = _tt(PAD, PAD, scaled.name, {
      fontSize: '12px', color: rarityColor, fontStyle: 'bold',
    });
    _tt(nameT.x + nameT.width + 6, PAD + 1, `${rarity} ${slotLabel}`, {
      fontSize: '10px', color: '#888888',
    });

    // Row 2: Stats with inline comparison diffs
    const stats = scaled.statBonuses;
    const isWpn = scaled.slot === 'weapon';
    const compStats = equippedScaled ? equippedScaled.statBonuses : null;
    const maxStatW = TT_W - PAD * 2;
    let sx = PAD;
    let sy = PAD + 16;

    for (const [key, val] of Object.entries(stats)) {
      if (val === 0) continue;
      if (isWpn && key === 'str' && stats.atk === stats.str) continue;

      const label = STAT_LABELS[key] || key.toUpperCase();
      const mainT = _tt(sx, sy, `+${val} ${label}`, {
        fontSize: '11px', color: '#cccccc',
      });
      sx += mainT.width + 3;

      if (compStats) {
        const eqVal = compStats[key] || 0;
        const diff = val - eqVal;
        if (diff > 0) {
          const d = _tt(sx, sy, `+${diff}`, { fontSize: '11px', color: '#22c55e' });
          sx += d.width + 6;
        } else if (diff < 0) {
          const d = _tt(sx, sy, `${diff}`, { fontSize: '11px', color: '#ef4444' });
          sx += d.width + 6;
        } else {
          sx += 6;
        }
      } else {
        sx += 6;
      }

      if (sx > PAD + maxStatW - 50) {
        sx = PAD;
        sy += 12;
      }
    }

    // Row 3: Description
    sy += 14;
    const descT = _tt(PAD, sy, `"${scaled.description}"`, {
      fontSize: '10px', color: '#666666', fontStyle: 'italic',
      wordWrap: { width: TT_W - PAD * 2 },
    });

    // Row 4: Comparison reference line
    sy += descT.height + 4;
    if (equippedScaled) {
      const eqColor = COLORS.rarity[eqRarity] || '#a1a1aa';
      const vsT = _tt(PAD, sy, `vs. ${equippedScaled.name}`, {
        fontSize: '10px', color: eqColor,
      });
      sy += vsT.height + 2;
    } else if (!isEquipped && slotDef) {
      const emptyT = _tt(PAD, sy, 'Empty slot', {
        fontSize: '10px', color: '#555555',
      });
      sy += emptyT.height + 2;
    }

    // Background (behind all content)
    const ttH = sy + PAD;
    const bg = this.scene.add.rectangle(TT_W / 2, ttH / 2, TT_W, ttH, 0x111122);
    bg.setStrokeStyle(1, 0x555566);
    container.addAt(bg, 0);

    // Position at cursor
    const pointer = this.scene.input.activePointer;
    this._positionTooltip(container, pointer.x, pointer.y, TT_W, ttH);

    // Follow cursor movement
    this._tooltipMoveHandler = (p) => {
      this._positionTooltip(container, p.x, p.y, TT_W, ttH);
    };
    this.scene.input.on('pointermove', this._tooltipMoveHandler);

    this._tooltipContainer = container;
  }

  _positionTooltip(container, px, py, w, h) {
    let x = px + 12;
    let y = py + 16;
    if (x + w > 1280) x = px - w - 4;
    if (y + h > 720) y = py - h - 4;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    container.setPosition(x, y);
  }
}
