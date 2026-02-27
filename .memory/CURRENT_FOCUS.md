# CURRENT_FOCUS

## One-liner
- Reversible expanded gameplay layout is implemented and active when logs are hidden.

## Active Objectives (max 3)
1. **Playtest expanded layout:** Validate full-width gameplay readability and spacing in combat/UI.
2. **Tune layout polish:** Adjust anchor ratios and control spacing based on feel.
3. **Keep rollback clean:** Preserve one-flag fallback to classic layout.

## Next Actions
- [ ] Playtest expanded mode (`systemLogsEnabled=false`, `expandedGameplayLayoutEnabled=true`)
- [ ] Compare against classic mode and log any spacing regressions
- [ ] Tune `GameScene` player/enemy X ratios if encounter composition feels cramped/wide
- [ ] Tune bottom-bar modal button spacing if controls feel too sparse in expanded mode
- [ ] Decide whether logs remain off by default or become runtime-toggleable

## Open Loops / Blockers
- `npm run build` passes with pre-existing large bundle warning (Phaser chunk >500kB)
- Expanded mode is compile-validated in all 4 flag combinations; visual QA pass still needed
- Prestige, territory, and cheats remain behind feature gates
- Upgrade IDs still use `flurry_*` prefix despite Tempest naming (intentional save compatibility)

## How to Resume in 30 Seconds
- **Open:** `.memory/CURRENT_FOCUS.md`
- **Last change:** Dual layout profiles (`classic` + `expanded`) with feature-gated activation
- **Key files (this session):**
  - `src/config/layout.js` (profile selection + expanded activation gate)
  - `src/config/features.js` (`systemLogsEnabled`, `expandedGameplayLayoutEnabled`)
  - `src/scenes/GameScene.js` (ratio-based player/enemy X anchors)
  - `src/scenes/UIScene.js` (scaled stance/action cluster anchors)
  - `src/ui/StanceSwitcher.js` (scaled X anchor + readability pass)
  - `src/ui/InventoryPanel.js`, `src/ui/SettingsPanel.js`, `src/ui/UpgradePanel.js`, `src/ui/StatsPanel.js`, `src/ui/PrestigePanel.js` (dynamic bottom-bar and tooltip anchors)
- **Verification command:** `npm run build`

## Key Context
- Tech stack: Phaser 3, Vite 7, break_infinity.js, localStorage saves
- Platform: Desktop-first, 1280x720, targeting Itch.io
- Architecture: `ARCHITECTURE.md`
- GDD plan: `Plans/Redesign Plan.md`
- Expanded layout plan: `Plans/expanded-gameplay-layout-reversible-plan.md`
- Memory files: `.memory/CURRENT_FOCUS.md`, `.memory/DECISIONS.md`, `.memory/LESSONS_LEARNED.md`
- Changelog: `CHANGELOG.md`
- Feature gates: `src/config/features.js`
- Save namespace: `litrpg_idle_vslice_save_slot{1,2,3}` (schema v3)

---

## Last Session Summary (max ~8 bullets)
- Added reversible layout architecture with `classic` and `expanded` profiles
- Expanded layout now uses full-width `gameArea` and `bottomBar` when logs are disabled
- Added new flag `expandedGameplayLayoutEnabled`
- Gated expanded activation behind `!systemLogsEnabled` to preserve safe fallback behavior
- Normalized fixed UI anchors that assumed 960/1280 constants
- Converted combat staging and stance cluster anchors to ratio-based positions
- Verified all four logs/expanded feature combinations compile
- Set `expandedGameplayLayoutEnabled=true` by default (reversible by one flag)

## Pinned References
- Governance rules: `CLAUDE.md`
- Architecture: `ARCHITECTURE.md`
- Redesign plan: `Plans/Redesign Plan.md`
- Expanded layout plan: `Plans/expanded-gameplay-layout-reversible-plan.md`
- Lessons learned: `.memory/LESSONS_LEARNED.md`
