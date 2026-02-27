# Three Save Slots Design

**Date:** 2026-02-27
**Status:** Approved

## Summary

Replace the single save file with 3 independent save slots. Each slot shows level, area, and zone. Players choose a slot when starting a new game or loading. Individual slots can be deleted with confirmation.

## Storage

- Slot keys: `litrpg_idle_vslice_save_slot{1,2,3}` + `_backup` each
- Active slot tracked in `localStorage` key `litrpg_idle_active_slot`
- Existing single save (`litrpg_idle_vslice_save`) migrated to slot 1 on first boot

## SaveManager Changes

- `save(slotId)`, `load(slotId)`, `hasSave(slotId)`, `clearSaveForNewGame(slotId)`
- `getSlotSummary(slotId)` — returns `{ level, area, zone }` or `null` (lightweight JSON parse)
- `activeSlot` property — autosave writes to this slot
- `setActiveSlot(slotId)` — sets which slot is in use
- Migration: on init, if old single-save key exists and no slot keys exist, copy to slot 1

## Start Screen Flow

- **New Game** → slot picker (all 3 slots). Empty = "Empty", occupied = "Lv.X - Area Y, Zone Z". Pick slot; if occupied, confirm overwrite.
- **Load Game** → slot picker (occupied slots clickable, empty grayed). Pick to load.
- Each occupied slot has delete (X) button with confirmation.
- **Back** button returns to main menu.

## Slot Picker UI

- 3 horizontal or vertical slot cards, centered on screen
- Each card: slot number, status text (empty or level/area/zone), delete button if occupied
- Matches existing button style (monospace, dark bg, hover highlight)
