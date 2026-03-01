# CURRENT_FOCUS

## One-liner
- Current work is focused on polished Area 1 demo flow (Slimefang finale timing + demo-complete UX), plus UI/skill polish and balance-tool safety fixes.

## Active Objectives (max 3)
1. **Demo finale integrity:** Slimefang death should fully play out before post-boss progression logic runs, then present a clear demo-complete screen.
2. **Skill UX clarity:** Passive skill changes (Bigger Swigs) should match explicit player-facing semantics and display exact bonus values.
3. **Balance editing safety:** Prevent invalid speed tuning values in the balance GUI from causing unintended combat cadence.

## Next Actions
- [ ] Full manual playtest from fresh save through Slimefang kill:
  - verify 10s death animation completes before handoff
  - verify demo-complete overlay appears reliably
  - verify no immediate next-round spawn after Slimefang death
- [ ] Validate Bigger Swigs progression in live run:
  - Lv0 shows 0% bonus
  - Lv1 shows 20% bonus
  - healing scales as base heal * (1 + bonus)
- [ ] Run a quick sanity pass on Area 1 duo encounters to verify second-slot slime offset still looks intentional after reflow/layout updates
- [ ] Optional cleanup pass: isolate unrelated pending branch changes into focused commits if needed

## Open Loops / Blockers
- `npm run build` passes; Vite Phaser chunk-size warning remains pre-existing.
- UI behavior is still primarily verified manually (no automated visual regression harness).
- Working tree contains multiple in-flight files from adjacent tasks; commit boundaries should be explicit.

## How to Resume in 30 Seconds
- **Open:** `.memory/CURRENT_FOCUS.md`
- **Recent key changes:**
  - Slimefang now waits for full death-sequence timing before boss-defeated handoff (`CombatEngine` delay path)
  - Slimefang defeat now emits demo completion and stops normal zone progression (`BossManager`)
  - UIScene now renders a dedicated demo-complete overlay with return-to-main-menu action
  - Replaced Battle Hardening / Defensive Drills / Agility Drills with Bigger Swigs
  - Bigger Swigs semantics corrected to true bonus scaling:
    - bonus per level is +20%
    - total heal = base heal * (1 + bonus)
    - insight text now shows only current bonus %
  - Balance GUI speed controls now clamp to min `0.01` and sanitize loaded/saved speed values
  - Runtime speed guardrails added in balance/zone bias and combat member construction
  - Duo encounter visual tweak: second-slot slime in duos gets +20px Y offset
  - Unfriendly Slime boss now has regen trait enabled
  - Slimy Waterskin copy updated to final requested flavor text
- **Key files (latest session):**
  - `src/systems/CombatEngine.js`
  - `src/systems/BossManager.js`
  - `src/scenes/UIScene.js`
  - `src/data/upgrades.js`
  - `src/ui/DrinkButton.js`
  - `src/ui/UpgradePanel.js`
  - `src/systems/SaveManager.js`
  - `src/config.js`
  - `scripts/zone-balance-gui.js`
  - `src/data/balance.js`
  - `src/data/areas.js`
  - `src/scenes/GameScene.js`
  - `src/data/bosses.js`
  - `src/data/items.js`
- **Verification command:** `npm run build`

## Key Context
- Tech stack: Phaser 3, Vite 7, break_infinity.js, localStorage saves
- Platform: Desktop-first, 1280x720, targeting Itch.io
- Save namespace: `litrpg_idle_vslice_save_slot{1,2,3}` (schema v4)
- Memory files: `.memory/CURRENT_FOCUS.md`, `.memory/DECISIONS.md`, `.memory/LESSONS_LEARNED.md`
