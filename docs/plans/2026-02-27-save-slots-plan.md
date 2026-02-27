# Save Slots Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace single save file with 3 independent save slots, each showing level/area/zone info on the start screen.

**Architecture:** SaveManager becomes slot-aware with parameterized keys. StartScene gets a slot picker overlay that New Game and Load Game both open. Existing single save migrates to slot 1 on first boot.

**Tech Stack:** Phaser 3, localStorage, existing SaveManager/Store/StartScene

---

### Task 1: Make SaveManager slot-aware

**Files:**
- Modify: `src/systems/SaveManager.js`

**Step 1: Replace single keys with slot-based key helpers**

Replace the top-level key constants and add slot infrastructure:

```javascript
// Replace:
const PRIMARY_KEY = 'litrpg_idle_vslice_save';
const BACKUP_KEY = 'litrpg_idle_vslice_save_backup';

// With:
const SLOT_PREFIX = 'litrpg_idle_vslice_save';
const ACTIVE_SLOT_KEY = 'litrpg_idle_active_slot';
const SLOT_IDS = [1, 2, 3];

function slotKey(slotId) { return `${SLOT_PREFIX}_slot${slotId}`; }
function slotBackupKey(slotId) { return `${SLOT_PREFIX}_slot${slotId}_backup`; }
```

Add `activeSlot` variable alongside existing module-level vars:
```javascript
let activeSlot = null;
```

**Step 2: Update `init()` to migrate old single save → slot 1**

After `_archiveLegacySaves()`, before `this.load()`:
```javascript
this._migrateToSlots();
```

Add migration method:
```javascript
_migrateToSlots() {
  // If slot keys already exist, skip
  if (SLOT_IDS.some(id => localStorage.getItem(slotKey(id)))) return;
  // If old single-save exists, copy to slot 1
  const oldPrimary = localStorage.getItem('litrpg_idle_vslice_save');
  const oldBackup = localStorage.getItem('litrpg_idle_vslice_save_backup');
  if (oldPrimary) {
    localStorage.setItem(slotKey(1), oldPrimary);
    if (oldBackup) localStorage.setItem(slotBackupKey(1), oldBackup);
    localStorage.removeItem('litrpg_idle_vslice_save');
    localStorage.removeItem('litrpg_idle_vslice_save_backup');
    localStorage.setItem(ACTIVE_SLOT_KEY, '1');
    console.log('[SaveManager] Migrated single save → slot 1');
  }
},
```

**Step 3: Update `init()` to restore active slot and auto-load**

Replace the current `this.load()` call:
```javascript
// Restore active slot from localStorage (or null if none)
const savedSlot = localStorage.getItem(ACTIVE_SLOT_KEY);
if (savedSlot && SLOT_IDS.includes(Number(savedSlot))) {
  activeSlot = Number(savedSlot);
}
// Don't auto-load here anymore — StartScene controls when to load
```

Remove `this.load()` from `init()`. The start screen will call `load(slotId)` explicitly.

**Step 4: Make `save()` slot-aware**

Replace hardcoded `PRIMARY_KEY`/`BACKUP_KEY` with active slot keys:
```javascript
save() {
  if (!store || window.__saveWiped || !activeSlot) return;
  const state = store.getState();
  if (!state) return;
  store.updateTimestamps({ lastSave: Date.now(), lastOnline: Date.now() });
  const json = JSON.stringify(state);
  const pk = slotKey(activeSlot);
  const bk = slotBackupKey(activeSlot);
  const existing = localStorage.getItem(pk);
  if (existing) localStorage.setItem(bk, existing);
  localStorage.setItem(pk, json);
  emit(EVENTS.SAVE_COMPLETED, {});
},
```

**Step 5: Make `load()` accept a slot ID**

```javascript
load(slotId) {
  if (!store) return;
  const pk = slotKey(slotId);
  const bk = slotBackupKey(slotId);
  let raw = localStorage.getItem(pk);
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); }
    catch { emit(EVENTS.SAVE_CORRUPT, { source: 'primary' }); data = null; }
  }
  if (!data) {
    raw = localStorage.getItem(bk);
    if (raw) {
      try { data = JSON.parse(raw); emit(EVENTS.SAVE_CORRUPT, { source: 'primary', recoveredFrom: 'backup' }); }
      catch { emit(EVENTS.SAVE_CORRUPT, { source: 'both' }); return; }
    }
  }
  if (!data) return;
  data = migrate(data);
  store.loadState(data);
  activeSlot = slotId;
  localStorage.setItem(ACTIVE_SLOT_KEY, String(slotId));
  emit(EVENTS.SAVE_LOADED, {});
},
```

**Step 6: Update `hasSave()`, `clearSaveForNewGame()`, `deleteSave()` to accept slot ID**

```javascript
hasSave(slotId) {
  if (slotId != null) {
    return hasParsable(slotKey(slotId)) || hasParsable(slotBackupKey(slotId));
  }
  // Any slot has a save
  return SLOT_IDS.some(id => hasParsable(slotKey(id)) || hasParsable(slotBackupKey(id)));
},

clearSaveForNewGame(slotId) {
  localStorage.removeItem(slotKey(slotId));
  localStorage.removeItem(slotBackupKey(slotId));
},

deleteSave() {
  window.__saveWiped = true;
  for (const id of SLOT_IDS) {
    localStorage.removeItem(slotKey(id));
    localStorage.removeItem(slotBackupKey(id));
  }
  localStorage.removeItem(ACTIVE_SLOT_KEY);
},
```

Extract the `hasParsable` helper to module level (currently inline in `hasSave`):
```javascript
function hasParsable(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return false;
  try { JSON.parse(raw); return true; } catch { return false; }
}
```

**Step 7: Add `getSlotSummary(slotId)` and `setActiveSlot(slotId)`**

```javascript
getSlotSummary(slotId) {
  const raw = localStorage.getItem(slotKey(slotId));
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return {
      level: data?.playerStats?.level ?? 1,
      area: data?.currentArea ?? 1,
      zone: data?.currentZone ?? 1,
    };
  } catch { return null; }
},

setActiveSlot(slotId) {
  activeSlot = slotId;
  localStorage.setItem(ACTIVE_SLOT_KEY, String(slotId));
},

getActiveSlot() {
  return activeSlot;
},
```

**Step 8: Verify build**

Run: `npm run build`
Expected: Compiles cleanly (Phaser chunk warning only).

**Step 9: Commit**

```bash
git add src/systems/SaveManager.js
git commit -m "feat: make SaveManager slot-aware with 3 save slots"
```

---

### Task 2: Update StartScene with slot picker

**Files:**
- Modify: `src/scenes/StartScene.js`

**Step 1: Add slot picker state and UI**

Add to constructor:
```javascript
this._slotPickerMode = null; // 'new' or 'load' or null
this._slotObjects = [];
this._slotDeleteConfirm = null; // slotId pending delete confirm
```

**Step 2: Create `_createSlotPicker()` method**

Called from `create()`. Builds 3 slot cards + back button, all initially hidden.

Each slot card at depth 25 (above main menu, below settings):
- Background rectangle (dark panel)
- Slot label: "SLOT 1", "SLOT 2", "SLOT 3"
- Info text: "Empty" or "Lv.23 - Area 2, Zone 15"
- Delete button (small "X") for occupied slots
- Full card is interactive (click to select)

Layout: 3 cards stacked vertically, centered, ~400px wide, ~55px tall each, 15px gap. Back button below.

```javascript
_createSlotPicker() {
  const cx = WORLD.width / 2;
  const startY = 310;
  const cardW = 420;
  const cardH = 55;
  const gap = 15;

  this._slotCards = [];

  for (let i = 0; i < 3; i++) {
    const slotId = i + 1;
    const y = startY + i * (cardH + gap);
    const summary = SaveManager.getSlotSummary(slotId);

    // Card background
    const bg = this.add.rectangle(cx, y, cardW, cardH, 0x1f2937, 0.95)
      .setStrokeStyle(1, 0x4b5563).setDepth(25);

    // Slot label
    const label = this.add.text(cx - cardW / 2 + 20, y, `SLOT ${slotId}`, {
      fontFamily: 'monospace', fontSize: '18px', color: '#e5e7eb', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(26);

    // Info text
    const infoStr = summary
      ? `Lv.${summary.level} - Area ${summary.area}, Zone ${summary.zone}`
      : 'Empty';
    const infoColor = summary ? '#a5b4fc' : '#6b7280';
    const info = this.add.text(cx + 20, y, infoStr, {
      fontFamily: 'monospace', fontSize: '15px', color: infoColor,
    }).setOrigin(0, 0.5).setDepth(26);

    // Delete button (only for occupied slots)
    let deleteBtn = null;
    if (summary) {
      deleteBtn = this.add.text(cx + cardW / 2 - 30, y, 'X', {
        fontFamily: 'monospace', fontSize: '16px', color: '#ef4444', fontStyle: 'bold',
        backgroundColor: '#1f2937', padding: { x: 6, y: 2 },
      }).setOrigin(0.5).setDepth(27).setInteractive({ useHandCursor: true });

      deleteBtn.on('pointerdown', (_, __, ___, event) => {
        event.stopPropagation();
        this._onSlotDelete(slotId);
      });
      deleteBtn.on('pointerover', () => deleteBtn.setStyle({ backgroundColor: '#991b1b' }));
      deleteBtn.on('pointerout', () => deleteBtn.setStyle({ backgroundColor: '#1f2937' }));
    }

    // Card interactivity
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this._onSlotSelected(slotId));
    bg.on('pointerover', () => bg.setFillStyle(0x334155));
    bg.on('pointerout', () => bg.setFillStyle(0x1f2937));

    const card = { bg, label, info, deleteBtn, slotId, summary };
    this._slotCards.push(card);
    this._slotObjects.push(bg, label, info);
    if (deleteBtn) this._slotObjects.push(deleteBtn);
  }

  // Back button
  const backY = startY + 3 * (cardH + gap) + 10;
  this._slotBackBtn = this._createMenuButton(cx, backY, 'BACK', () => this._hideSlotPicker(), {
    fontSize: '20px', backgroundColor: '#334155', padding: { x: 16, y: 6 },
  });
  this._slotBackBtn.setDepth(26);
  this._slotObjects.push(this._slotBackBtn);

  // Delete confirm row
  this._deleteWarning = this.add.text(cx, backY + 45, '', {
    fontFamily: 'monospace', fontSize: '14px', color: '#fecaca',
    stroke: '#000000', strokeThickness: 3,
  }).setOrigin(0.5).setDepth(26).setVisible(false);
  this._deleteYes = this._createMenuButton(cx - 90, backY + 70, 'DELETE', () => this._confirmSlotDelete(), {
    fontSize: '18px', color: '#fef2f2', backgroundColor: '#991b1b', padding: { x: 14, y: 6 },
  });
  this._deleteNo = this._createMenuButton(cx + 90, backY + 70, 'CANCEL', () => this._cancelSlotDelete(), {
    fontSize: '18px', backgroundColor: '#334155', padding: { x: 14, y: 6 },
  });
  this._deleteYes.setDepth(26).setVisible(false);
  this._deleteNo.setDepth(26).setVisible(false);
  this._slotObjects.push(this._deleteWarning, this._deleteYes, this._deleteNo);

  // Hide all initially
  for (const obj of this._slotObjects) obj.setVisible(false);
}
```

**Step 3: Add slot picker show/hide methods**

```javascript
_showSlotPicker(mode) {
  this._slotPickerMode = mode;
  this._slotDeleteConfirm = null;
  this._hideNewGameConfirm();
  this._setSettingsVisible(false);
  this._quitMessage.setVisible(false);

  // Refresh slot data
  for (const card of this._slotCards) {
    const summary = SaveManager.getSlotSummary(card.slotId);
    card.summary = summary;
    const infoStr = summary
      ? `Lv.${summary.level} - Area ${summary.area}, Zone ${summary.zone}`
      : 'Empty';
    card.info.setText(infoStr);
    card.info.setStyle({ color: summary ? '#a5b4fc' : '#6b7280' });

    // In load mode, gray out empty slots
    if (mode === 'load' && !summary) {
      card.bg.setAlpha(0.35);
      card.bg.disableInteractive();
    } else {
      card.bg.setAlpha(1);
      card.bg.setInteractive({ useHandCursor: true });
    }

    // Show/hide delete button based on whether slot is occupied
    if (card.deleteBtn) card.deleteBtn.setVisible(!!summary);
  }

  for (const obj of this._slotObjects) obj.setVisible(true);
  this._deleteWarning.setVisible(false);
  this._deleteYes.setVisible(false);
  this._deleteNo.setVisible(false);

  // Hide main menu buttons
  this._newGameBtn.setVisible(false);
  this._loadGameBtn.setVisible(false);
  this._settingsBtn.setVisible(false);
  this._quitBtn.setVisible(false);
}

_hideSlotPicker() {
  this._slotPickerMode = null;
  this._slotDeleteConfirm = null;
  for (const obj of this._slotObjects) obj.setVisible(false);

  // Show main menu buttons
  this._newGameBtn.setVisible(true);
  this._loadGameBtn.setVisible(true);
  this._settingsBtn.setVisible(true);
  this._quitBtn.setVisible(true);

  // Re-evaluate Load Game availability
  const anySlotHasSave = SaveManager.hasSave();
  if (anySlotHasSave) {
    this._loadGameBtn.setAlpha(1);
    this._loadGameBtn.setInteractive({ useHandCursor: true });
  } else {
    this._loadGameBtn.setAlpha(0.35);
    this._loadGameBtn.disableInteractive();
  }
}
```

**Step 4: Add slot selection handler**

```javascript
_onSlotSelected(slotId) {
  if (this._slotDeleteConfirm != null) return; // ignore if delete confirm is showing

  if (this._slotPickerMode === 'new') {
    const summary = SaveManager.getSlotSummary(slotId);
    if (summary) {
      // Slot occupied — show overwrite confirmation
      this._pendingNewGameSlot = slotId;
      this._deleteWarning.setText(`Overwrite Slot ${slotId}? Progress will be lost.`);
      this._deleteWarning.setVisible(true);
      this._deleteYes.setVisible(true);
      this._deleteNo.setVisible(true);
      // Repurpose delete confirm buttons for overwrite
      this._deleteYes.setText('OVERWRITE');
      this._deleteYes.off('pointerdown');
      this._deleteYes.on('pointerdown', () => {
        SaveManager.clearSaveForNewGame(slotId);
        this._startNewGameInSlot(slotId);
      });
      this._deleteNo.off('pointerdown');
      this._deleteNo.on('pointerdown', () => {
        this._deleteWarning.setVisible(false);
        this._deleteYes.setVisible(false);
        this._deleteNo.setVisible(false);
        this._pendingNewGameSlot = null;
      });
      return;
    }
    this._startNewGameInSlot(slotId);
  } else if (this._slotPickerMode === 'load') {
    this._loadGameFromSlot(slotId);
  }
}

_startNewGameInSlot(slotId) {
  SaveManager.clearSaveForNewGame(slotId);
  SaveManager.setActiveSlot(slotId);
  Store.resetState();
  emit(EVENTS.SAVE_REQUESTED, {});
  this.scene.start('GameScene');
}

_loadGameFromSlot(slotId) {
  SaveManager.load(slotId);
  this.scene.start('GameScene');
}
```

**Step 5: Add slot delete handlers**

```javascript
_onSlotDelete(slotId) {
  this._slotDeleteConfirm = slotId;
  this._deleteWarning.setText(`Delete Slot ${slotId}? This cannot be undone.`);
  this._deleteWarning.setVisible(true);
  this._deleteYes.setText('DELETE');
  this._deleteYes.setVisible(true);
  this._deleteNo.setVisible(true);
  this._deleteYes.off('pointerdown');
  this._deleteYes.on('pointerdown', () => this._confirmSlotDelete());
  this._deleteNo.off('pointerdown');
  this._deleteNo.on('pointerdown', () => this._cancelSlotDelete());
}

_confirmSlotDelete() {
  if (this._slotDeleteConfirm == null) return;
  SaveManager.clearSaveForNewGame(this._slotDeleteConfirm);
  this._cancelSlotDelete();
  // Refresh the picker
  this._showSlotPicker(this._slotPickerMode);
}

_cancelSlotDelete() {
  this._slotDeleteConfirm = null;
  this._deleteWarning.setVisible(false);
  this._deleteYes.setVisible(false);
  this._deleteNo.setVisible(false);
}
```

**Step 6: Update existing menu handlers**

Replace `_onNewGamePressed`:
```javascript
_onNewGamePressed() {
  this._showSlotPicker('new');
}
```

Replace `_onLoadGamePressed`:
```javascript
_onLoadGamePressed() {
  this._showSlotPicker('load');
}
```

Remove `_startNewGame`, `_showNewGameConfirm`, `_hideNewGameConfirm` methods and the `_createConfirmRow` method + its call in `create()`. The slot picker now handles all confirmation flows.

**Step 7: Add `_createSlotPicker()` call to `create()`**

Replace `this._createConfirmRow();` with `this._createSlotPicker();` in `create()`.

**Step 8: Verify build**

Run: `npm run build`

**Step 9: Commit**

```bash
git add src/scenes/StartScene.js
git commit -m "feat: add slot picker UI to start screen"
```

---

### Task 3: Update main.js init flow

**Files:**
- Modify: `src/main.js`

**Step 1: Remove auto-load from boot**

Since `SaveManager.init()` no longer auto-loads (the start screen handles it), and `OfflineProgress.apply()` should only run after a slot is loaded, wrap the offline progress call:

Check if `OfflineProgress.apply()` is called unconditionally — if so, it should be moved to after slot load. For now, keep it but guard it: it should be safe since Store is in default state if no save loaded.

No code changes needed in main.js if SaveManager.init() already skips auto-load (done in Task 1).

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit (if changes were needed)**

---

### Task 4: End-to-end verification

1. `npm run build` — compiles cleanly
2. `npm run dev` — test in browser:
   - **Fresh state (clear localStorage):** All 3 slots show "Empty". Load Game grayed. New Game → pick slot → enters game. Autosave writes to selected slot.
   - **Reload:** Load Game active. Slot shows "Lv.X - Area Y, Zone Z". Click to load.
   - **Migration:** If old single save exists, it appears in Slot 1 after reload.
   - **New Game on occupied slot:** Shows overwrite confirmation.
   - **Delete slot:** X button → confirm → slot becomes Empty.
   - **Multiple slots:** Can have saves in slots 1 and 3 but not 2. Each loads independently.
