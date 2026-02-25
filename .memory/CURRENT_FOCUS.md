# CURRENT_FOCUS

## One-liner
- Balance GUI now has 4 tabs (Zones, Enemies, Bosses, Player); player progression biases wired into game logic; next step is manual balance/playtest validation and follow-up tuning.

## Active Objectives (max 3)
1. **Phase 7 manual gate:** Playtest zones 1-10 and run mechanic spot checks (miss, armor break, summon/interrupt, corruption/cleanse), plus boundary checks 10->11 and 20->21
2. **Post-implementation tuning:** Adjust evasion/armor/corruption/summon numbers and ABILITIES cooldowns from playtest data
3. **Data completeness cleanup:** Remove the validator warning by adding droppable item coverage for zones 31-35

## Next Actions
- [ ] Run focused Area 1 playthrough (zones 1-10) and note TTK/survival spikes by zone
- [ ] Run mechanic checklist in live combat and confirm feedback readability (`MISS!`, casting, interrupted, corruption stack UI)
- [ ] Tune `COMBAT_V2.corruption` and `ABILITIES` constants from observed pacing
- [ ] Add/retune item drop coverage for zones 31-35 and rerun `npm run validate:data`
- [ ] Capture any manual-test regressions as targeted checks in `scripts/verify-combat-mechanics.js`

## Open Loops / Blockers
- `npm run validate:data` passes with one warning: zones 31-35 have no droppable items
- `npm run build` passes with a pre-existing large bundle warning (Phaser chunk >500kB)
- Prestige, territory, and cheats remain behind feature gates during current balancing pass
- Enemy/boss sprite coverage for some late content is still incomplete

## How to Resume in 30 Seconds
- **Open:** `.memory/CURRENT_FOCUS.md`
- **Last change:** Added Player tab to Balance GUI; wired XP/stat-growth biases into game logic; fixed pre-existing `var` closure bug in zone slider save.
- **Key implementation files:**
  - `src/data/balance.js` (PLAYER_BALANCE + getXpBias/getStatGrowthBias)
  - `src/config.js` (xpForLevel applies xpBias)
  - `src/systems/Store.js` (applyLevelUp applies statGrowthBias)
  - `scripts/zone-balance-gui.js` (Player tab, /api/player-data, /api/save-player, var closure fix, Cache-Control headers)
- **Verification commands:** `npm run verify:combat`, `npm run build`, `npm run validate:data`

## Key Context
- Tech stack: Phaser 3, Vite 7, break_infinity.js, localStorage saves
- Platform: Desktop-first, 1280x720, targeting Itch.io
- Architecture: `ARCHITECTURE.md`
- GDD plan: `Plans/Redesign Plan.md`
- Enemy roster plan: `Plans/Enemy_Roster_Redesign_Plan.md`
- Memory files: `.memory/CURRENT_FOCUS.md`, `.memory/DECISIONS.md`, `.memory/LESSONS_LEARNED.md`
- Changelog: `CHANGELOG.md`
- Feature gates: `src/config/features.js`
- Save namespace: `litrpg_idle_vslice_save` (schema v1)

---

## Last Session Summary (max ~8 bullets)
- Added `PLAYER_BALANCE` to `src/data/balance.js` with `xpBias` and `statGrowthBias` sparse maps + accessor functions
- Wired `getXpBias(level)` into `PROGRESSION_V2.xpForLevel()` in `src/config.js`
- Wired `getStatGrowthBias(stat)` into `Store.applyLevelUp()` in `src/systems/Store.js`
- Added Player tab to Balance GUI: 5 stat-growth sliders + 35-row XP table with bias/effective/cumulative/growth%
- Added `/api/player-data` and `/api/save-player` endpoints + parse/format helpers in GUI server
- Fixed pre-existing `var` closure bug in `buildZones()` — zone slider changes were writing to `balance[31]` instead of correct zone, causing saves to silently lose all zone edits
- Added `Cache-Control: no-store` header to all `sendJson()` responses to prevent browser caching of API data
- `npm run build` passes

## Pinned References
- Governance rules: `CLAUDE.md`
- Architecture: `ARCHITECTURE.md`
- Redesign plan: `Plans/Redesign Plan.md`
- Enemy roster plan: `Plans/Enemy_Roster_Redesign_Plan.md`
- Lessons learned: `.memory/LESSONS_LEARNED.md`

Hard rule: If "Key Context" becomes a wall of text, move it into real docs and link here.
