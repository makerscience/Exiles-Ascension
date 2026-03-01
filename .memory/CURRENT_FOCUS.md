# CURRENT_FOCUS

## One-liner
- Current work is focused on onboarding clarity and UI reliability: enhancement tutorial guidance, inventory usability, quit flow stability, and faster startup.

## Active Objectives (max 3)
1. **Onboarding reliability:** Confirm the enhancement tutorial runs end-to-end (gold callout -> inventory pulse -> main hand pulse -> enhance pulse -> complete flag).
2. **UI responsiveness:** Keep key panel interactions stable (inventory, settings, onboarding popup sequencing) under real play patterns.
3. **Startup speed:** Keep menu startup immediate and avoid boot-time visual/debug artifacts.

## Next Actions
- [ ] Full playtest: Area 1 Zone 3 enhancement tutorial from fresh save slot
- [ ] Verify empty-slot enhancement behavior in normal play (not only tutorial path)
- [ ] Verify quit-to-main-menu from paused and unpaused states
- [ ] Validate inventory gold readout placement/readability at different values

## Open Loops / Blockers
- `npm run build` passes; Vite Phaser chunk warning remains pre-existing
- Startup is improved, but full lazy-load split (menu assets vs gameplay assets) is still pending
- UI QA remains manual (no screenshot diff baseline)

## How to Resume in 30 Seconds
- **Open:** `.memory/CURRENT_FOCUS.md`
- **Last changes:**
  - Enhancement tutorial flow hardened with stage flags and popup-dismiss sequencing
  - Inventory now supports selecting and enhancing empty equipment slots
  - Inventory panel shows current gold next to the SELL control
  - Quit-to-main-menu no longer freezes (safer scene transition path + fallback)
  - Boot splash (`Phase 0 Complete`) and forced 1s delay removed
- **Key files (latest session):**
  - `src/systems/DialogueManager.js`
  - `src/systems/Store.js`
  - `src/systems/EnhancementManager.js`
  - `src/ui/InventoryPanel.js`
  - `src/ui/TopBar.js`
  - `src/ui/OnboardingPopup.js`
  - `src/ui/SettingsPanel.js`
  - `src/events.js`
  - `src/scenes/BootScene.js`
- **Verification command:** `npm run build`

## Key Context
- Tech stack: Phaser 3, Vite 7, break_infinity.js, localStorage saves
- Platform: Desktop-first, 1280x720, targeting Itch.io
- Save namespace: `litrpg_idle_vslice_save_slot{1,2,3}` (schema v3)
- Memory files: `.memory/CURRENT_FOCUS.md`, `.memory/DECISIONS.md`, `.memory/LESSONS_LEARNED.md`
