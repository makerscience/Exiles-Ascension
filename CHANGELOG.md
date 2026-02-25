# CHANGELOG

## 2026-02-25 - Player Tab in Balance GUI + Zone Save Bugfix
- **New PLAYER_BALANCE in balance.js:** sparse `xpBias` (per-level) and `statGrowthBias` (per-stat) maps with accessor functions `getXpBias()` / `getStatGrowthBias()`
- **XP bias wired into config.js:** `PROGRESSION_V2.xpForLevel()` now multiplies base XP by `getXpBias(level)`
- **Stat growth bias wired into Store.js:** `applyLevelUp()` now multiplies each stat growth by `getStatGrowthBias(stat)`
- **Player tab added to Balance GUI:** 5 stat-growth sliders + 35-row XP table with bias sliders, effective/cumulative/growth% columns, live recomputation, save/copy support
- **Fixed zone slider save bug:** `var` closure in `buildZones()` caused all slider callbacks to reference post-loop `z=31`; zone edits were silently lost on save. Wrapped in IIFE to capture correct `z` per iteration. Added `Cache-Control: no-store` to API responses.

## 2026-02-24 - Enemy Roster Redesign Phases 0-4 (Data, Encounters, Bosses)
- **World structure updated to 35 zones:** `TOTAL_ZONES` is now 35, with area starts moved to 1/11/21 and Area 2/3 labels updated (`The Whispering Woods`, `The Blighted Mire`, `The Shattered Ruins`)
- **Boundary-sensitive data shifted by +5 for Areas 2-3:** enemy zone ranges, encounter area starts, and boss zone mappings were updated for the new global zone layout
- **Enemy schema expanded:** enemies now support additive optional fields for `evasion`, `armor`, `corruption`, and `summon`; validator checks were added for each
- **Roster rewrite completed:** enemy roster now covers zones 1-35 with redesigned trait distribution and updated area-boundary derivation (no hardcoded 1-5/6-15/16-30 split)
- **Encounter rewrite completed:** encounter template coverage and validation were updated for the 35-zone model (46 templates validated)
- **Boss roster expanded to one per zone:** 35 bosses validated, including new Area 1 zone 6-10 bosses (`Thornback Alpha`, `The Grime King`, `Hawkeye`, `Bandit Captain`, `Rotfang Reborn`)

## 2026-02-24 - Enemy Roster Redesign Phases 5-7 (Mechanics, UI, Verification)
- **Evasion path added:** player attacks can miss via `COMBAT_PLAYER_MISSED`, with GameScene visual feedback for misses
- **Armor break lifecycle added:** temporary armor debuff + timed restore with `COMBAT_ARMOR_BROKEN` and `COMBAT_ARMOR_RESTORED`
- **Summon/interrupt flow added:** cast timers, slot-cap safety, max-add safety, and runtime member insertion via `COMBAT_MEMBER_ADDED`, plus `COMBAT_ENEMY_CASTING` and `COMBAT_INTERRUPTED`
- **Summon reward policy hardened:** summoned adds are progression-neutral by default (`summonedAddRewardMult: 0`) and do not apply encounter loot bonuses
- **Corruption system added:** encounter-scoped stacks with clamp bounds, DoT, decay, cleanse, and debuff integration (`attackMult`, `regenMult`) plus `CORRUPTION_CHANGED`/`CORRUPTION_CLEANSED`
- **Stance action UI refactor completed:** UIScene now owns Slot A/Slot B stance actions; added `ArmorBreakButton`, `InterruptButton`, `CleanseButton`, and `CorruptionIndicator`
- **Ability constants centralized:** new `ABILITIES` config namespace in `src/config.js` for armor break, interrupt, and cleanse tuning
- **Automated verification gate added:** `scripts/verify-combat-mechanics.js` with `npm run verify:combat` now validates event contracts and key mechanic invariants
- **Verification status:** `npm run verify:combat` passed, `npm run build` passed, `npm run validate:data` passed with one warning (zones 31-35 have no droppable items)

## 2026-02-20 — Area 1 Boss Order Change (Rotfang to Zone 5)
- **Rotfang moved to zone 5:** `boss_a1z1_rotfang` now appears at global zone 5
- **Zone 1 boss backfilled:** `boss_a1z5_the_hollow` moved to global zone 1 so early progression still has a boss challenge
- **Area-boss gate preserved at zone 5:** Rotfang is now `bossType: 'AREA'`; The Hollow is now `bossType: 'MINI'`
- **Pacing stats swapped for natural curve:** Rotfang now has the former zone-5 boss values (`hp 1850`, `attack 63`, `gold 250`, `xp 125`), while The Hollow now has the former zone-1 boss values (`hp 660`, `attack 18`, `gold 45`, `xp 23`)
- **Waterskin guarantee moved to zone 1 boss:** `guaranteedFirstKillItem: 'a1_rotfang_waterskin'` now lives on The Hollow (zone 1) instead of Rotfang (zone 5)

## 2026-02-20 — Balance GUI Entity Tabs + Combat Entity Bias
- **New data module:** `src/data/balance.js` with sparse `ENEMY_BALANCE` and `BOSS_BALANCE` maps plus `getEnemyBias()` / `getBossBias()` accessors (default `1.0`)
- **New data dump helper:** `scripts/dump-zone-data.mjs` exports enemy and boss metadata JSON for the GUI server
- **Combat scaling update:** `CombatEngine.spawnEnemy()` now applies per-enemy bias on top of zone scaling/zone bias; `spawnBoss()` now applies per-boss bias to hand-authored boss stats
- **Balance GUI upgrade:** `scripts/zone-balance-gui.js` now includes **Zones / Enemies / Bosses** tabs, plus `/api/entity-data`, `/api/balance-data`, and `/api/save-balance` endpoints
- **GUI behavior updates:** entity tabs use the same 7 stat dials (`hp/atk/def/speed/regen/gold/xp`), save to `src/data/balance.js`, and Copy Code now exports the active tab block (`ZONE_BALANCE`, `ENEMY_BALANCE`, or `BOSS_BALANCE`)

## 2026-02-20 — Zone Balance GUI Visual Redesign
- **Upgrade 1 — Heat-map backgrounds:** `td.stat-cell` background fades orange (value < 1) or green (value > 1), interpolated from transparent at 1.0 to full color at ±0.5
- **Upgrade 2 — Slider + readout cells:** Each cell now has a `range` input (0.5–2.0, step 0.05) with a fill-color gradient track (orange left of center, green right); `×1.00` readout span below; clicking span opens inline `<input type="number">` for precision entry (blur/Enter commits, Escape cancels)
- **Upgrade 3 — Sparklines:** Row of 7 mini SVG bar charts (120×44px, one per stat) pinned above the table; bars above center = green (boost), below = orange (penalty); clicking a bar scrolls to that zone row with a brief red flash highlight
- **Shared state:** `cellRefs` object maps `zone-stat` keys to `{slider, span, td}` refs; `refreshCell()` and `resetRow()` use refs for zero-query updates; `redrawSparkline()` does full SVG innerHTML replace (fast for 30 bars)

## 2026-02-20 — Zone Balance GUI Editor
- **New:** `scripts/zone-balance-gui.js` — local HTTP server (port 3001) serving a visual GUI for editing `ZONE_BALANCE` in `areas.js`
- **Table layout:** 30 rows × 7 stat columns (hp, atk, def, speed, regen, gold, xp); color-coded inputs (green >1, orange <1)
- **Buttons:** Save to areas.js (writes sparse map, omits 1.0 entries), Run Sim (embeds balance-sim.js output), Copy Code (copies JS snippet to clipboard)
- **UX:** Double-click or right-click row to reset all stats to 1.0; area group headers with colored borders
- **`package.json`** — added `"balance:gui": "node scripts/zone-balance-gui.js"` script

---

## 2026-02-20 — Per-Zone Stat Dials (ZONE_BALANCE)
- **`ZONE_BALANCE`** sparse map + **`getZoneBias(globalZone, stat)`** added to `areas.js` — multiplier layer applied on top of `getZoneScaling()`; defaults to `1.0` (no change) when empty
- **`CombatEngine.spawnEnemy()`** applies bias to `hp`, `atk`, `def`, `speed`, `gold`, `xp`, `regen`, `thorns` — composed as `baseVal × zoneScale × zoneBias`
- **`OfflineProgress.js`** mirrors same bias on offline `hp/gold/xp` scales so offline rewards match runtime
- **`balance-sim.js`** folds bias into zone scale vars so `npm run balance:sim` reflects dials accurately
- `ZONE_BALANCE = {}` by default — zero behavior change until dials are populated

---

## 2026-02-20 — Area 1 Expanded to 10 Zones, Encounter Redesign (Zones 1–5)
- **Area 1 zoneCount**: 5 → 10; zones 6–10 placeholder-ready (boar solo + duo fills the gap)
- **Enemy solo zone ranges**: rat [1,3]→[1,2], slime [1,2]→[1,3], hound [1,5]→[2,4], boar [2,5]→[6,10]
- **Encounter templates redesigned**: rat_pair [2–4], rat_pack [3–5], slime_pair [3–5], hound_pair [4–5], boar_duo [6–10]; weights and rewardMults tuned per formation size

---

## 2026-02-19 — Thornback Boar Rework + Enemy Attack Charge Bars
- **Thornback Boar rebalanced**: attack doubled (15→30), attack speed halved (0.8→0.4) — slow heavy hitter archetype
- **Enemy attack charge bar**: red bar below HP bar telegraphs incoming attacks for slow enemies (attackSpeed < 0.6); fills left to right via TimeEngine.getProgress()

---

## 2026-02-19 — Stance Visuals, Trait Indicators & Combat UI Polish
- **Trait indicators on enemy nameplates**: colored symbols right of HP bar — ✚ regen (green), ◆ thorns (purple), ⚡ fast (yellow), ⊘ armor pen (orange), ☠ DoT (lime), ⬢ defense (blue), ▲ enrage (red, appears on trigger)
- **Player HP bar moved above head**: halved to 100x8, 2px black borders on all HP bars
- **Shield HP bar**: blue bar appears below player HP on Bulwark activation, drains in real-time, hides on depletion/death
- **Power stance charge bar**: red bar below HP fills via TimeEngine.getProgress(); charge-up sprite at 75%, strongpunch held 1s with hit reaction immunity
- **Per-stance walk sprites**: fortress uses fortressstance_001/002; fortress blocks all hit reactions; strongpunch removed from flurry/fortress attack rotation
- **Bulwark shield nerfed**: HP multiplier 2.0 → 0.1 (10% of max HP)
- **Stance indicator**: symbol left of player HP bar — ⚡ flurry, ⬢ fortress, ▲ power

---

## 2026-02-19 — Enemy Traits Phase 6: Combat Visuals + Player Damage Numbers
- **Regen visuals**: green `+N` floating heal numbers on enemy every regen tick, HP bar updates in real-time
- **Enrage visuals**: red `ENRAGED!` floating text with glow, persistent red tint on enraged enemy sprite/rect
- **Thorns visuals**: purple `-N` floating numbers above player on each thorns reflect
- **Player incoming damage numbers**: red floating numbers above player when hit by enemy attacks
- **Hollow Slime regen bumped** from 2 to 5

---

## 2026-02-19 — Enemy Traits Phase 5: Area 2-3 Trait Assignments + Balance Sim
- **7 new trait assignments**: Rot Vine Crawler (regen:3), Mire Lurker (enrage), Bog Revenant (thorns:4), Stone Sentry (thorns:5), Blighted Guardian (thorns:6), Ruin Pilgrim Frenzied (enrage), Hearthguard Construct (regen:5)
- **Balance sim now models traits**: regen reduces effective player DPS (flags unkillable if DPS <= regen), enrage blends normal/enraged DPS by threshold fraction, thorns adds flat reflect damage bypassing stance DR
- **All 30 zones pass** across all 6 gear×stance policies — no unkillable enemies, lowest eSurv is 2.74

---

## 2026-02-19 — Encounter Bug Fixes + Area 1 Rebalance
- **Fixed leftover enemy sprites on player death**: `_onPlayerDeath()` now calls `_onEncounterEnd('player_death')` so GameScene clears all enemy slots
- **Fixed leftover enemy sprites on boss challenge**: `spawnBoss()` now properly ends the current encounter before starting the boss fight
- **Fixed boss sprites not rendering**: bosses fall back to `baseEnemyId` for sprite/size lookup; bosses render at 1.4× base enemy size
- **Area 1 encounter rebalance**: added Slime Pair + Rat Pair (z1-2), removed Blighted Stalker from regular spawns, extended Hound (z1-5) and Boar (z2-5), moved 3-rat pack to z2-3

---

## 2026-02-18 — Post-Multi-Enemy Bug Fixes
- **Fixed game freeze (~1 min)**: `_attackLockCount` leaked — `_lockWalk()` called per enemy attack, but replacing `poseRevertTimer` lost the matching `_unlockWalk()`. Now balances count on timer replacement + resets to 0 on encounter end.
- **Fixed slot visual state between encounters**: death tween faded nameText/hpBarBg/hpBarFill alpha to 0 permanently; now reset to 1 on encounter start. Rect position also reset.
- **Fixed tween cleanup in encounter end**: `killTweensOf` now covers nameText/hpBarBg/hpBarFill (was only killing sprite/rect tweens)
- **Guarded OverworldScene launch**: `scene.launch('OverworldScene')` now checks scene exists first (was failing silently when territory disabled)

---

## 2026-02-18 — Multi-Enemy Phase 14: Cleanup
- **Removed old single-enemy rendering**: deleted all `_slotsActive`-gated fallback code in `_onEnemyDamaged`, `_onEnemyKilled`, `_onEnemyAttacked`, `_onPlayerDied` — slot-based path is now the only path
- **Removed `COMBAT_ENEMY_SPAWNED` event**: no subscribers remain; all systems now use `COMBAT_ENCOUNTER_STARTED`
- **Fixed crash bug**: `_slotsActive` flag was never initialized/set to `true`, so slot code never ran and old code path tried to reference non-existent objects (`enemyRect`, `enemySprite`, `hpBarFill`)
- **Removed stale `getCurrentEnemy()` comment** from CombatEngine `hasTarget()` doc

---

## 2026-02-18 — Multi-Enemy Phase 12: Tooling Updates
- **Data validator**: added encounter template validation — checks member enemy IDs exist, zones valid, weights positive, lootBonus schema; also validates boss `adds` field references
- **Balance sim**: models encounter pools with weighted average encounter HP (sum of member HPs), incoming DPS (per-member attack × attackSpeed × attackSpeedMult), and reward scaling via rewardMult

---

## 2026-02-18 — Multi-Enemy Phase 11: Downstream Integration
- **SmashButton**: replaced `getCurrentEnemy()` with `hasTarget()` for encounter-aware target checking
- **LootEngine**: reads `lootBonus` from kill event — `dropChanceMult` scales normal drop chance, `rarityBoost` adds to uncommon rarity weight for group encounters
- **SystemLog**: switched from `COMBAT_ENEMY_SPAWNED` to `COMBAT_ENCOUNTER_STARTED` — logs grouped encounter summaries ("A group of 3 Forest Rats appears!") and mechanic warnings for the most dangerous member
- **OfflineProgress**: models encounters as composite kills — weighted average HP/gold/XP across encounter pool with `rewardMult` applied; solo encounters produce identical results to old formula
- **CombatEngine**: enriched `COMBAT_ENCOUNTER_STARTED` members with `armorPen`/`dot` fields; added `lootBonus` to `COMBAT_ENEMY_KILLED` payload

---

## 2026-02-18 — Multi-Enemy Phases 9+10: Encounter Rendering + Per-Member Animations
- **Encounter slot rendering**: slots bind to encounter members on start — positioned, shown, and highlighted; hidden + cleaned up on end
- **Per-member damage/hit reactions**: HP bar updates, sprite reaction pose + knockback, and rect squish all routed to correct slot in local coordinates
- **Per-member death animations**: rat spin, slime wobble, stalker decapitation, and default slide-away all work per-slot; stalker head spawned as absolute scene object
- **Slot-aware positioning**: `_spawnDamageNumber` and `_spawnGoldParticles` accept optional position params for correct slot-relative VFX
- **Target switching**: click handlers on slot rects/sprites call `setTarget` + `playerAttack`; `_highlightTarget` dims non-target slots to 0.7 alpha

---

## 2026-02-18 — Multi-Enemy Phase 8: GameScene Slot Model
- **Slot view pool**: 5 hidden slot containers pre-created in `create()`, each with rect, sprite, name label, HP bar bg/fill — ready for Phase 9 binding
- **Slot lookup helpers**: `_getSlotByInstanceId()` and `_getSlotByIndex()` for encounter rendering
- **Walk timer lock counting**: `_lockWalk()` / `_unlockWalk()` with ref-counted `_attackLockCount` to safely pause/resume walk animation from multiple sources
- **Encounter event subscriptions**: `COMBAT_ENCOUNTER_STARTED`, `COMBAT_ENCOUNTER_ENDED`, `COMBAT_TARGET_CHANGED` wired to stub handlers (Phase 9 fills in rendering)
- **Slot cleanup on shutdown**: timers removed, extra objects destroyed, containers destroyed in `_shutdown()`

---

## 2026-02-18 — Multi-Enemy Phase 6: Death Handling, Retargeting & Encounter Completion
- **Per-member death**: `_onMemberDeath(instanceId)` replaces `_onEnemyDeath()` — handles rewards, retargeting, and encounter completion per member
- **Retargeting**: when target dies, lowest-slot living member becomes new target with bridge update and `COMBAT_TARGET_CHANGED` event
- **Encounter completion**: `_onEncounterEnd(reason)` handles timer cleanup, despawning remaining alive members, zone clear kills, and spawn scheduling
- **Despawned guards**: 6 downstream `COMBAT_ENEMY_KILLED` listeners now ignore `despawned: true` kills (boss adds cleaned up on encounter end)
- **BossManager threshold fix**: listener swapped to `COMBAT_ENCOUNTER_ENDED` so it reads post-increment `zoneClearKills`

---

## 2026-02-18 — Multi-Enemy Phase 5: Per-Member Combat Actions
- **Combat actions operate on encounter members**: `playerAttack`, `powerSmashAttack`, `enemyAttack`, DoT all read/write member data instead of `currentEnemy` bridge
- **Per-member timers**: each encounter member registers its own attack + DoT timers via `_registerMemberTimers()` — multi-member encounters now have independent attack cadences
- **Enriched event payloads**: `COMBAT_ENEMY_DAMAGED`, `COMBAT_ENEMY_ATTACKED`, `COMBAT_ENEMY_DODGED` now include `encounterId`, `instanceId`, `slot`
- **Bridge sync preserved**: `currentEnemy.hp` synced after player damage for `_onEnemyDeath` compat (Phase 6 removes bridge)

---

## 2026-02-18 — Click Damage Nerf
- **Click damage reduced to 20%**: manual clicks now deal 1/5th of previous damage via `clickDamageScalar: 0.2` in `COMBAT_V2`
- **Power Smash unaffected**: scalar applies only in the click path, not in `getPlayerDamage`, so Power Smash keeps full scaling
- **Stats panel updated**: `getClickDamage()` reflects the nerfed value

---

## 2026-02-18 — Agility Stat + Dodge Mechanic
- **New stat: AGI (Agility)**: base 3, +0.5/level, boosted by gear. Creates evasion build alternative to defense stacking
- **Contested dodge formula**: enemy accuracy vs player evade rating — `hitChance = clamp((acc + 60) / (acc + evadeRating + 60), 0.35, 0.95)`. Fast swarm enemies miss more, heavy brutes land hits reliably
- **Enemy accuracy stat**: auto-derived from archetypes (attackSpeed, defense, armorPen, dot). Bosses default to 90 accuracy
- **9 items converted to AGI-focused**: head (A1 uncommon, A2 tier 1, A3 tier A), boots (A2 tier 2, A2 uncommon, A3 tier B, A3 uncommon), gloves (A3 tier A), amulet (A3 tier B). Chest and legs stay DEF-only
- **Visual feedback**: floating cyan "DODGE!" text on successful dodge; enemy attack lunge plays on all attacks (hit or miss)
- **UI updates**: StatsPanel shows AGI in base stats + dodge % in combat stats; InventoryPanel tooltips show +AGI on gear

---

## 2026-02-18 — Blighted Stalker Decapitation Death + Damage Number Fix
- **Stalker death rework**: headless body (dead2 sprite) fades in place while severed head tumbles upward with random spin
- **New sprites loaded**: `blightedstalker_dead2` (headless body) and `blightedstalker_head` (severed head) with canvas pre-downscaling
- **Damage number fix**: numbers now spawn immediately on hit instead of inside a 60ms delayed callback — fixes Power Smash "SMASH!" text not appearing on one-shot kills

---

## 2026-02-16 — Power Smash Active Ability
- **New active ability**: Power Smash — 3x base damage burst on a 60s cooldown, unlocks at player level 3
- **SMASH button**: Appears bottom-left of game area (above DRINK) when unlocked; shows cooldown countdown, resets on death
- **Enhanced visuals**: forced strong punch sprite, bigger lunge (40px), screen shake, orange "SMASH!" damage numbers with glow
- **Two upgrade tracks**: Power Smash Damage (+0.5x per level, 8 levels) and Power Smash Recharge (-10% cooldown per level, 5 levels)
- **SystemLog integration**: "Power Smash!" combat message on use, "Power Smash unlocked!" announcement at level 3

---

## 2026-02-14 — Waterskin Polish, Sprite Drift Fix, Loot Cleanup
- **DRINK button repositioned**: moved to bottom-left of game area for better visibility
- **Instant heal feedback**: waterskin heal now updates HP bar immediately instead of waiting for next damage tick
- **Enemy sprite drift fix**: lunge/knockback tweens no longer leave sprites displaced when interrupted mid-animation (kill + reset before each new movement tween)
- **Waterskin thumbnail**: `waterskin001.png` art wired up via thumbnail generator + BootScene
- **Waterskin boss-only drop**: removed from normal loot pool (slotWeights, pity, EQUIP_TO_ITEM_SLOT) — now exclusively a Rotfang guaranteed first-kill drop

---

## 2026-02-14 — Waterskin Equipment System
- **New equippable slot**: Waterskin — added to V2 active slots, loot pool, and pity system
- **New item**: "Rotfang's Waterskin" — heals 20% max HP on use, 30s cooldown. Guaranteed first-kill drop from Rotfang (zone 1 boss)
- **DRINK button**: Appears in game area when a waterskin is equipped. Shows cooldown countdown, resets on player death
- **Guaranteed boss drops**: LootEngine now supports `guaranteedFirstKillItem` on any boss definition — bonus drop on top of normal loot
- **SystemLog integration**: "Drank from waterskin" message on use

---

## 2026-02-14 — Smooth Combat Sprites (Canvas Pre-Downscaling)
- **Fixed pixelated sprites**: player and enemy combat sprites (928–2048px sources) were being downscaled 3–8× by WebGL bilinear which only samples 4 texels — caused blocky/aliased rendering
- **BootScene canvas downscale**: after asset load, each combat sprite texture is redrawn to a 2× display-size canvas using the browser's high-quality Lanczos algorithm, then replaces the original texture
- **Targets**: all 11 player sprites → 600×750, enemy sprites → 2× each enemy's spriteSize (e.g. Forest Rat 1024→250, Thornback Boar 2048→560)
- **Result**: WebGL now only does ≤2× bilinear at runtime — sprites look smooth and crisp at all poses

---

## 2026-02-14 — Combat Movement Feedback (Lunge, Knockback, Death Slide)
- **Attack lunge**: Both player and enemy lunge 20px toward opponent on attack (80ms yoyo)
- **Hit knockback**: Both sides jolt 12px away from attacker on hit (80ms yoyo)
- **Death slide**: On kill, 40px knockback (120ms) then immediately rockets 250px offscreen while fading (200ms) — works for both player and enemy deaths
- **Staggered timing**: 60ms delay between attacker lunge and defender reaction — hit "connects" visually. Damage numbers also pop on impact
- **Boss defeated delay**: Reduced 1300ms to 500ms to match faster death animation

---

## 2026-02-14 — Player Death Visual Feedback
- **Full death sequence**: camera shake, red screen flash overlay, "DEFEATED" floating text, player sprite collapse/fade — death is now an unmistakable moment
- **Enemy click disabled during death**: prevents interaction while player is dead, re-enabled on respawn

---

## 2026-02-14 — Balance Overhaul: Asymmetric Scaling + Enemy/Gear Calibration
- **Asymmetric zone scaling**: `getZoneScaling(zone, stat)` now uses per-stat rates — HP +10%/zone, ATK +12%, Gold +18%, XP +8% (was uniform +15% for all). Creates snowball within areas and prevents over-leveling.
- **Enemy DEF on armored archetypes**: Stone Sentry (10), Blighted Guardian (15), Hearthguard Construct (20), plus 5 armored bosses (8-12). Gear-check moments that reward weapon upgrades.
- **Area-entry enemy stat calibration**: A2 and A3 enemies received ~30% HP and ~65-75% ATK increases so area transitions create meaningful walls (zone 6 eSurv 85x→7x, zone 16 eSurv 25,560x→14x).
- **Boss stat calibration**: A2/A3 bosses proportionally increased. Final boss survival ratio tightened to 1.27x (was 2.2x). All 30 bosses still pass.
- **Upgrade base costs +50%**: Battle Hardening 120→180, Auto-Attack Speed 150→225, Gold Find 60→90, Sharpen Blade 75→112. Creates early-game decision pressure.
- **Cross-tier gear jumps +30-40%**: Weapons, armor DEF/HP widened across all tiers. New-tier drops now feel like clear upgrades.

---

## 2026-02-14 — Comprehensive Game Data Reference Document
- **New file `GAME_DATA_REFERENCE.md`**: single-document reference covering all game data — combat formulas, player stats/growth, XP curve, upgrades with costs, equipment tables, all 20 enemies, all 30 bosses, zone scaling, loot system, and balance sim snapshot

---

## 2026-02-14 — Add Slime & Rat Enemies to Area 1
- **2 new enemies**: Hollow Slime (zones 1-2, HP 12, ATK 5, slow) and Forest Rat (zones 1-3, HP 15, ATK 7, fast) — tutorial-tier fodder below Feral Hound
- **Sprite loading updated**: slime001 and forestrat001 paths point to `Images/Enemies/area1/`; removed obsolete goblin001 sprite loads
- **Balance unchanged**: all 30 bosses still pass; new enemies lower average zone 1-3 difficulty slightly

---

## 2026-02-14 — Halve Attack Rate (baseAttackIntervalMs)
- **Combat pacing**: all auto-attack and enemy attack intervals doubled (attacks happen half as often) via new `COMBAT_V2.baseAttackIntervalMs = 2000` constant
- **Minimum interval floor**: raised from 200ms to 400ms for both player and enemies
- **Balance preserved**: survival ratios unchanged (both sides slowed equally); all 30 bosses still pass

---

## 2026-02-14 — Background Music + Volume Settings
- **Background music**: ambient progression track loops automatically on game start via HTML5 Audio streaming (handles autoplay policy with retry on first click)
- **Volume slider in Settings**: clickable/draggable horizontal bar with real-time percentage readout; changes apply instantly to audio
- **Persistent volume**: `musicVolume` saved with game state; old saves without it default to 50%
- **Store.updateSetting()**: new generic mutation method for settings, emits STATE_CHANGED

---

## 2026-02-14 — Bulk Equipment Thumbnails, Lanczos Downscaling, Thumb Generator
- **12 new equipment thumbnails**: Sentinel set (blade, visage, treads, gauntlets, half-plate, greaves), Warden's Oath, Pathfinder's Stride, Irongrip Gauntlets, Cracked Hearthstone, Ancient Sentinel Plate, Stoneguard Legplates
- **Crisp thumbnails**: source images (1024px) now pre-downscaled to 128px via Lanczos resampling; BootScene loads `_thumb.png` variants instead of full-size
- **Linear texture filtering**: `FilterMode.LINEAR` applied to all thumbnail images in InventoryPanel for smooth rendering at slot sizes
- **`npm run thumbs` script**: batch-generates 128px thumbnails from full-size source images in `Images/Equipment/`; skips up-to-date files; requires Pillow (`pip install Pillow`)

---

## 2026-02-13 — Equipment Thumbnails, Inventory Bug Fixes, Smooth Parallax
- **Equipment thumbnails**: items with a `thumbnail` field now display an image in inventory grid slots, equipment slots, and drag ghost instead of text; first thumbnail: Sharpened Stick
- **Equipment slot layout**: slots resized to 64x64 (matching inventory grid) and pushed to far left/right edges of the equipment zone
- **Inventory refresh fix**: tooltip and drag ghost no longer vanish when loot drops while the inventory panel is open; refresh deferred during active drag
- **Smooth parallax**: `roundPixels` moved from global game config to UIScene camera only — eliminates tree/fern jitter at slow scroll speeds while keeping UI text crisp

---

## 2026-02-13 — Inventory UX Overhaul: Drag, Tooltips, Sell Zone
- **Equip slot highlighting**: hovering or selecting an inventory item highlights the target equipment slot with an amber border
- **Drag-to-equip**: drag an inventory item onto its target equipment slot to equip it; ghost text follows cursor during drag
- **Drag-to-sell**: SELL drop zone in the upper-right of inventory; drag any item onto it to sell the full stack; highlights on hover during drag
- **Cursor-following tooltips**: compact tooltip (280px) follows the mouse instead of fixed at panel bottom; shows stats with inline green/red comparison diffs, description, and "vs." reference line
- **Font size increase**: all inventory panel text bumped +2px for readability
- **Crisp text rendering**: added `roundPixels: true` to Phaser game config, fixing sub-pixel blur on centered text

---

## 2026-02-13 — Inventory Hover Tooltip with Equipment Comparison
- **Hover tooltips**: hovering any equipped or inventory item shows full stats and description in a tooltip at the bottom of the panel
- **Equipment comparison**: hovering an inventory item shows stat diffs (green +N / red -N) vs. the currently equipped item in that slot; shows "Nothing equipped" when slot is empty
- **All stats shown**: tooltip displays all non-zero stat bonuses (ATK, DEF, HP, REGEN, ATK SPD, STR) — weapons skip redundant STR when it equals ATK

---

## 2026-02-13 (GDD Hard Pivot — Phase 7: Balance, QA, and Release Hardening)
- **DoT bug fixed**: `CombatEngine._startDot()` and `SystemLog` now read `dot` as a plain number instead of `dot.dmgPerSec` — DoT damage actually works now (was dealing 0 since Phase 5)
- **Balance pass**: enemy ATK tripled, boss ATK ×3.5, enemy XP reduced to ~25% of HP, boss XP to ~50% of HP — survival ratios now meaningful instead of infinite
- **Balance simulation script**: `npm run balance:sim` — standalone Node ESM script that models zone-by-zone idle progression with exact combat formulas, gear, and upgrades
- **Final boss validated**: THE FIRST KEEPER survival ratio 1.8x (target 1.1-2.0x), all 30 bosses beatable, level/HP checkpoints within ~10% of GDD targets
- **Build clean**: `npm run validate:data` 0 errors/0 warnings, `npm run build` passes

---

## 2026-02-13 (GDD Hard Pivot — Phase 6: UI and UX Alignment)
- **Area names fixed**: ZoneNav now shows V2 area names ("The Harsh Threshold", "The Overgrown Frontier", "The Broken Road") instead of old ZONE_THEMES names; dead theme entries 4-5 removed
- **Combat mechanic feedback**: enemy spawn log warns about Armor Penetration and DoT; DoT ticks shown every 5 seconds in SystemLog; new `COMBAT_DOT_TICK` event
- **Dialogue V2 alignment**: ZONE_ENTRANCE, COMBAT_COMMENTARY, and FINAL_BOSS_DEFEATED rewritten for V2 area names and enemies; dead entries 4-5 removed; final boss check fixed from area 5 to area 3
- **Equip log upgraded**: now shows all non-zero stat bonuses (STR, DEF, HP, Regen, AtkSpd) instead of just ATK/DEF; zone change log shows area name
- **First-launch welcome**: new players see "Welcome to the Harsh Threshold. Survive." in SystemLog and SYSTEM dialogue

---

## 2026-02-13 (GDD Hard Pivot — Phase 5: Area 2-3 Content Rollout)
- **15 new enemies**: 5 Area 2 (Rot Vine Crawler, Mire Lurker, Wisp Swarm, Blight Stalker Evolved, Bog Revenant) + 10 Area 3 (Stone Sentry, Fractured Echo, Ruin Pilgrim, Shade Remnant, Blighted Guardian, Ruin Pilgrim Frenzied, Hearthguard Construct, Blighted Scholar, Corruption Tendril, Shade of the Keeper) — introduces DoT at zone 11, armorPen at zone 21
- **39 new items**: Area 2 has 2 common tiers (zones 6-10, 11-15) + uncommons (zones 8-15) for 5 slots; Area 3 has 3 common tiers (zones 16-20, 21-25, 26-30) + uncommons for all 7 slots including gloves/amulet
- **25 new bosses**: 10 Area 2 (Rootmaw through THE LOST WARDEN) + 15 Area 3 (The Forgotten through THE FIRST KEEPER) — hand-tuned stats from GDD, ELITE at zones 10/20/25, AREA at zones 15/30
- **Full zone coverage**: all 30 zones now have enemies, items, and named bosses; validator passes with 0 errors, 0 warnings

---

## 2026-02-13 (GDD Hard Pivot — Phase 4: Loot and Equipment V2)
- **V2 drop model** (`LootEngine.js`): replaced V1 per-area drop rates + per-enemy loot tables with V2 system — 10% normal drop chance, 100% boss drops, zone-based item pools filtered by `item.zones` range
- **Boss loot differentiation**: first-kill = guaranteed drop with 30% uncommon chance; repeat-kill = guaranteed drop with 11% uncommon chance (exploits BossManager's 1300ms delayed `recordBossDefeated` for timing)
- **Pity system** (`Store.js` + `LootEngine.js`): per-slot pity counters increment on every boss defeat, reset on drop; after 5 boss kills without a drop for a slot, that slot's selection weight doubles
- **7 active equipment slots** (`equipSlots.js`): zone-based unlock replaces tier-based — head/chest/main_hand at zone 1, legs at zone 6, boots at zone 9, gloves at zone 17, amulet at zone 22; no accessory row
- **Data validator**: item zone coverage check ensures every Area 1 zone has droppable items (warns for Areas 2-3)

---

## 2026-02-12 (GDD Hard Pivot — Phase 3: BossManager V2)
- **Named boss lookup** (`BossManager.js`): `generateBossTemplate()` now looks up hand-authored bosses from `bosses.js` via `getBossForZone()` instead of auto-generating from enemy template multipliers
- **Boss data gating**: `isChallengeReady()` and `_checkThreshold()` now verify a named boss exists for the zone before enabling the challenge button
- **BossChallenge UI** (`BossChallenge.js`): challenge button shows named boss name (e.g. "CHALLENGE ROTFANG", "CHALLENGE THE HOLLOW") instead of generic "CHALLENGE BOSS"
- **Sprite resolution**: bosses inherit sprites from `baseEnemyId` enemy with `bossType.sizeMult` scaling; boss data can override with its own sprites

---

## 2026-02-12 (GDD Hard Pivot — Phase 2: Combat and Stat Engine V2)
- **V2 stat model** (`Store.js`): player stats switched from str/vit/luck to str/def/hp/regen — createInitialState, hydrateState, applyLevelUp, resetPlayerStats all use `PROGRESSION_V2`
- **ComputedStats rewrite** (`ComputedStats.js`): equipment stat summing via `getEquipmentStatSum()`, new exports `getEffectiveDef`, `getPlayerAtkSpeed`, `getPlayerAutoAttackInterval`, `getHpRegen` — flat regen model replaces %-of-maxHP
- **V2 combat engine** (`CombatEngine.js`): V2 damage formulas (`COMBAT_V2.playerDamage/enemyDamage`), per-enemy attack speed timers, gear-based player attack speed, DoT system (`combat:enemyDot` ticker), defense/armorPen on enemy spawn
- **BossManager V2 fields**: boss templates now pass through defense, armorPen, attackSpeed, dot from base enemies
- **StatsPanel V2 UI**: base stats show DEF/HP/REGEN instead of VIT/LUCK; combat descriptions updated for V2 formulas
- **V1 constant purge**: all `COMBAT`/`PROGRESSION` imports replaced with V2 equivalents across OfflineProgress, UpgradeManager, GameScene — no remaining V1 combat/progression references in src/

---

## 2026-02-12 (GDD Hard Pivot — Phase 1: Data Contracts + Area 1 Content)
- **V2 constants** (`config.js`): added `PROGRESSION_V2`, `COMBAT_V2`, `LOOT_V2` alongside V1 constants — new stat model (str/def/hp/regen/atkSpeed), combat formulas, and loot tuning
- **V2 enemies** (`enemies.js`): replaced 13 V1 enemies with 3 Area 1 enemies (Feral Hound, Thornback Boar, Blighted Stalker) — new schema adds attackSpeed, defense, armorPen, dot, zone-range filtering
- **V2 items** (`items.js`): replaced 12 V1 items with 6 Area 1 items (3 common, 3 uncommon) — new schema adds str/hp/regen/atkSpeed stats, `atk` alias for backward compat; `getScaledItem()` now scales all stat fields
- **V2 bosses** (`bosses.js`): new file with 5 named Area 1 bosses (Rotfang → THE HOLLOW) — not consumed until Phase 3 BossManager rewrite
- **V2 areas** (`areas.js`): 3 areas (The Harsh Threshold / The Overgrown Frontier / The Broken Road, zones 1-30) with zone-range enemy filtering replacing progressive-unlock model
- **Data validator** (`scripts/validate-data.js`): schema + cross-reference validator for enemies, items, bosses, areas; `npm run validate:data`

---

## 2026-02-12 (GDD Hard Pivot — Phase 0: Cutover Scaffold)
- **Feature gates** (`src/config/features.js`): prestige, territory, town, cheats all disabled for the vertical slice
- **New save namespace** `litrpg_idle_vslice_save` with schema v1 — fresh start, no progression carryover; legacy saves archived non-destructively under `litrpg_idle_legacy_archive`
- **Boot guards**: PrestigeManager, CheatManager, FirstCrackDirector only init when feature-enabled; PrestigePanel, CheatDeck, MAP button conditionally hidden in UIScene
- **OverworldScene** excluded from Phaser scene list when territory disabled
- **Build verified** clean — game boots and runs combat loop with all disabled systems safely inert

---

## 2026-02-12 (Character Silhouette Equipment Screen)
- **Equipment slot data** (`src/data/equipSlots.js`): declarative definitions for 33 equipment slots across 8 tiers (0–7), with body anchors, side placement, and tier-gated unlock helpers
- **Silhouette paper-doll layout**: inventory panel left side now shows a dimmed player sprite with equipment slots in left/right columns connected by lines to body anchor points, plus accessory grid below
- **Panel resized** to 880x560 (from 700x450) — separator and inventory grid/detail shifted right to accommodate equipment zone
- **Store equipped expansion**: `equipped` object now holds all 33 slot IDs (was 4); save migration renames old `body`→`chest`, `weapon`→`main_hand`
- **Equip slot resolution**: `InventorySystem._resolveEquipSlot()` maps item slot fields to equipped keys, with ring→ring1/ring2 disambiguation

---

## 2026-02-11 (Codebase Redesign — Phase 9: Offline Progress Engine)
- **Offline progress engine** (`src/systems/OfflineProgress.js`): rate-based catch-up rewards on load — computes gold/XP/fragments from player DPS × zone enemy pool × clamped offline duration (60s min, 12h max)
- **SystemLog summary**: "Welcome back! +X Gold, +Y XP" line with fragment/level-up info on game load
- **SYSTEM dialogue**: snarky welcome-back quip from 5 new `OFFLINE_RETURN` lines (triggers if away >5 min)
- **Config**: added `SAVE.minOfflineTime` (60s threshold to skip quick reloads)

---

## 2026-02-11 (Codebase Redesign — Phases 3, 6–8)
- **Config decomposition** (Phase 3): split `config.js` into `config/layout.js` (LAYOUT, TERRITORY) + `config/theme.js` (COLORS, ZONE_THEMES, PARALLAX, TREE_ROWS, FERN_ROWS, UI) — `config.js` re-exports for backward compat
- **CombatEngine decomposition** (Phase 6): kill reward orchestration (gold, XP, kill counters) moved into `Progression.grantKillRewards()` — CombatEngine now focused on enemy lifecycle + attack resolution
- **Unified kill tracking** (Phase 7): all kill counting centralized in Progression — BossManager simplified to threshold check, TerritoryManager kill listener removed (reads Store on demand)
- **EventScope helper** (Phase 8): `createScope()` in events.js replaces manual `unsubs` arrays across all 7 system singletons — eliminates leak risk
- **Event contracts** (Phase 8): dev-mode payload validation for `COMBAT_ENEMY_KILLED`, `STATE_CHANGED`, `PRESTIGE_PERFORMED`, `TERRITORY_CLAIMED`

---

## 2026-02-11 (Codebase Redesign — Store Slimming)
- **Progression module** (`src/systems/Progression.js`): extracted XP/level-up loop from Store into `Progression.grantXp()` — Store now exposes `addRawXp()` and `applyLevelUp()` as primitives
- **PrestigeManager owns prestige reset**: prestige orchestration moved from `Store.performPrestige()` into `PrestigeManager.performPrestige()`, calling granular Store mutations
- **New Store mutations**: `addFlatStat()`, `retainGold()`, `incrementPrestigeCount()`, `resetPlayerStats()`, `resetPurchasedUpgrades()`, `resetTotalKills()`, `resetAreaProgress()`
- **UpgradeManager mutation fix**: direct `state.playerStats.str +=` replaced with `Store.addFlatStat()` — no more bypassing Store mutation boundary
- **Legacy cleanup**: removed `Store.setZone()`, `Store.setFurthestZone()`, `Store.addXp()`, `Store.performPrestige()`, and dead state fields (`currentWorld`, top-level `furthestZone`)

---

## 2026-02-11 (Codebase Redesign — Phase 1 + Phase 2 complete)
- **ModalPanel base class** (`src/ui/ModalPanel.js`): extracted shared modal lifecycle (backdrop, panel chrome, toggle button, mutual exclusion, keyboard binding, event subscriptions, dynamic object management) into a single base class
- **All 5 modal panels refactored** to extend ModalPanel — InventoryPanel, UpgradePanel, PrestigePanel, SettingsPanel, StatsPanel now only contain their unique content logic (~400 lines of duplicated boilerplate eliminated)
- **ScrollableLog base class** (`src/ui/ScrollableLog.js`): extracted shared scroll/mask/render logic from SystemLog and SystemDialogue (~120 lines eliminated)
- **ui-utils.js** (`src/ui/ui-utils.js`): `makeButton()` helper (replaces 20+ inline pointer handler blocks), `TEXT_STYLES` presets, `addText()` helper
- **UIScene.closeAllModals()**: centralized modal registry replaces 5 hardcoded if-checks in `_toggleMap()` and per-panel mutual exclusion
- **ComputedStats module** (`src/systems/ComputedStats.js`): pure functions for all derived stats (effective damage, max HP, crit chance, gold/XP multipliers, HP regen, etc.)
- **CombatEngine + Store** now delegate to ComputedStats — Store HP methods (damage, heal, max, reset, prestige) use `getEffectiveMaxHp()`, fixing territory maxHP buff bug
- **StatsPanel** refactored to use `ComputedStats.getAllStats()`, removing direct imports of CombatEngine, UpgradeManager, InventorySystem, and DAMAGE_FORMULAS

---

## 2026-02-10 (Character Stats Panel)
- New STATS [C] panel showing all player stats in one place (base stats, combat, economy, progression)
- Two-column layout: left shows LEVEL/STR/VIT/LUCK + combat stats (MAX HP, DMG, CRIT, ATK SPEED), right shows ECONOMY + PROGRESSION
- Territory buff breakdowns shown inline (e.g. "7 + 2" for STR with territory bonus)
- Auto-refreshes on level up, upgrade purchase, territory claim, equip/unequip, prestige
- Mutual exclusion with all other modal panels (BAG, UPGRADES, PRESTIGE, SETTINGS, MAP)

---

## 2026-02-10 (Rarity-Separated Inventory Stacks + Stat Scaling)
- Items of different rarities now occupy separate inventory slots (Iron Dagger Common ≠ Iron Dagger Rare)
- Rarity now scales stats and sell value: common ×1, uncommon ×1.5, rare ×2.5, epic ×5
- Inventory uses composite stack keys (`itemId::rarity`) so each rarity variant is its own stack
- Equipment preserves rolled rarity through equip/unequip cycle
- Save migration v7→v8 converts existing inventory and equipment to new format

---

## 2026-02-10 (Grid-Based Slotted Inventory)
- Inventory panel now uses a 5x4 visual grid (20 slots) with 64px slot boxes instead of a text list
- Equipment section shows 4 box slots (HEAD/BODY/WEAPON/LEGS) with item abbreviations and rarity-colored borders
- Filled inventory slots display 4-char item abbreviation, rarity border color, and gold count badge (x3)
- Selected slot shows item detail panel below grid: name, rarity, slot, stat bonus, description, Sell/Equip buttons
- Added `abbr` field to all 12 items in items.js (IrDa, IrHe, LeTu, StSw, etc.)

---

## 2026-02-10 (ZoneNav Polish)
- Sewer Rat HP halved (100 → 50) for easier early game
- ZoneNav text: black stroke outlines, brighter colors, no transparency
- Navigation arrows moved closer to labels (area ±90px, zone ±65px)
- Arrows now hidden entirely when navigation in that direction is unavailable

---

## 2026-02-10 (Zone/Area Progression Restructure)
- Restructured flat 5-zone system into 5 areas with 34 total zones (Sewers 5, Wilderness 7, Deep Caverns 7, Volcanic Ruins 10, Dragon's Lair 5)
- Progressive enemy unlocks within areas: zone 1 = weakest enemy only, zone 2 adds next, zone 3+ adds all
- Zone scaling: enemies get 15% stronger per zone within an area
- Boss gate system: kill threshold per zone unlocks "Challenge Boss" button (mini-boss 3x, elite 5x every 5th, area boss 8x last zone)
- Two-tier navigation UI: area arrows (top row) + zone arrows (bottom row) with boss progress indicator
- Area bosses unlock next area on defeat; prestige resets zone progress but keeps area high-water mark
- Save migration v6→v7: existing progress mapped generously to new area/zone hierarchy
- Boss dialogue: encounter/defeat/area-clear lines with elite and final boss variants

---

## 2026-02-10 (Overworld Territory Map)
- Added overworld map overlay (M key / MAP button) with 13 conquerable territories across 5 zones
- Each territory requires kill threshold + gold cost to claim, grants a permanent buff (gold gain, XP, crit, STR, VIT, HP regen, damage, attack speed, fragment drops, max HP)
- Territory progress and conquered status persist across prestige resets
- Buff integration: CombatEngine (damage, gold, XP, crit, regen, max HP), LootEngine (fragment drops), UpgradeManager (attack speed)
- Save schema bumped to v6 with migration for killsPerEnemy/territories state

---

## 2026-02-08 (Parallax Spacing & Growth Tuning)
- Fixed fern clumping: spacing-aware respawn places each fern one step after the rightmost in its row
- Initial fern spawn enforces minimum step spacing with small forward jitter (no more overlaps)
- All tree rows now grow [0.8, 1.5] — continuous scaling from spawn to despawn with no plateau
- Front fern row moved down (yMin 540, yMax 560); back fern row raised 5px and sped up 20%
- Mid fern row speed matched to near tree row (speedMult 1.0)

---

## 2026-02-08 (Parallax Polish Pass)
- Added dense fern row between mid and near tree rows (depth -0.25, tight spacing)
- Tree perspective growth now spans full off-screen-to-despawn range (no flat spots)
- Near tree row downward drift increased to diagMult 1.2; far row speed bumped 20%
- Mid background scroll slowed to 0.4× front speed; shifted down to Y=380
- Back fern row moved down 5px and made less transparent (alpha 0.85)
- Tree wrap padding tightened (0–30px) and spawn range extended to 1.5× screen width for fewer gaps

---

## 2026-02-08 (Parallax Depth & Perspective Tuning)
- Perspective growth: trees and ferns scale from 90% → 130% (trees) / 110% (ferns) as they travel right to left
- Per-row `diagMult` controls downward drift rate independently from global `treeDiagRatio`
- Tree spawn Y ranges tightened (50% closer to end position) for subtler vertical travel
- Mid background layer shifted down 30px; mid fern row opacity increased to 0.85

## 2026-02-08 (Tree & Fern Parallax Overhaul)
- Replaced front layer strip system with individual tree sprites scrolling diagonally (upper-right → lower-left)
- Trees render as normal sprites with PNG transparency — no blend mode tricks needed
- Added fern rows (3 depth layers) and bare ground overlay (foreground001_bare) between foreground and ferns/trees
- Configurable diagonal slope via `treeDiagRatio` and `fernDiagRatio` in PARALLAX
- Mid fern row depth adjusted to render in front of near tree row

---

## 2026-02-08 (Diagonal Scroll Fix)
- Front layer strips now tile in a 2×2 grid (4 images per strip) for seamless vertical + horizontal wrapping
- Per-strip diagonal Y offset: rightmost strip (VP) sits 200px above leftmost, creating a diagonal top edge
- Vertical drift no longer pops — modulo wraps at tile height instead of fixed yDriftRange
- Config: added `frontDiagPx`, removed `yDriftRange`

---

## 2026-02-08 (Vertical-Strip Pseudo-3D)
- Front layer strips switched from horizontal bands to vertical columns for upper-right VP convergence
- Right strips (VP) are narrow + slow; left strips (camera) are wide + fast — perspective width variation
- Horizontal features (bricks, pipes) now bend/slant toward VP instead of vertical features bending
- Texture frames slice source image into vertical columns with integer-quantized widths (no seams)
- Removed unused `diagonalOffsetPx` config; convergence is now inherent in strip width distribution

## 2026-02-08 (Pseudo-3D Scanline Parallax)
- Zone 1 bg layers now use strip-based perspective scrolling (10 strips per layer)
- Per-strip scroll speed creates OutRun-style perspective depth within each layer
- Custom texture frames with integer-quantized sizes prevent sub-pixel seams
- Parallax and ground scroll converted to delta-based timing (FPS-independent)
- New `PARALLAX` config: `strips`, `perspectivePow`, `baseSpeedPxPerSec`

---

## 2026-02-08 (Combat UI Polish)
- Damage numbers: larger font sizes (+6-10px per tier), all bold, 4px black stroke, brighter yellows
- Damage numbers stay fully opaque for 70% of lifetime, fade only in the last 30%
- HP bars moved to bottom of battle window (60px from edge); name labels sit just above them
- Name labels (Player + enemy) have 4px black stroke outline for readability

---

## 2026-02-08 (White Defeat Lines + Context Lines + Panel Headers)
- Defeat lines in system log now render white instead of yellow (new `defeat` color type)
- SYSTEM dialogue window shows context lines above responses (muted `> Sewer Rat defeated!` style) so player knows what triggered the comment
- Context strings added to 15+ dialogue triggers; ambient/delayed lines intentionally omit context
- Direct DIALOGUE_QUEUED emitters (FirstCrackDirector, CheatManager, UpgradePanel) also carry context
- Dialogue panel header: "SYSTEM'S LOG" in bold bright green (18px); system log header: "SYSTEM LOG" in white (9px)

---

## 2026-02-08 (SYSTEM Dialogue Window)
- New SYSTEM dialogue panel above the system log (top 150px of right sidebar)
- Emotion-based text styling: sarcastic (yellow), angry (red/bold), impressed (green/bold), worried (blue/italic), neutral (white)
- Each `say()` call in DialogueManager now carries an emotion tag; FAILED_PURCHASE in UpgradePanel also tagged
- System log pushed down to y=201 (auto-adjusts via LAYOUT.logPanel); both panels scroll independently

---

## 2026-02-08 (Player Attack Sprites)
- Player now shows a random attack pose (7 sprites: punch, kick, elbow, jab, etc.) when hitting enemies
- Attack pose displays for 400ms then reverts to default stance
- Triggers on both click attacks and auto-attacks via existing COMBAT_ENEMY_DAMAGED event
- Player shows hit reaction sprite when taking enemy damage (400ms, with red tint flash)

---

## 2026-02-07 (Ground Layer + Background Overhaul)
- Added ground section covering bottom 25% of game area using ground001 texture
- Replaced background001 parallax images with background002 set
- Front parallax layer overlaps ground and scrolls together with it
- Rear and mid parallax layers sized to 83% height, sitting above the ground
- Ground and front layer scroll in sync at the same speed

---

## 2026-02-07 (Sewer Rat Sprites)
- Sewer Rat: 4 sprite poses (default, reaction, attack, dead) replacing red rectangle fallback
- Per-enemy sprite sizing: enemies can define custom spriteSize in data (Sewer Rat: 125x125)

---

## 2026-02-07 (Player Sprite + Layout Polish)
- Player sprite: replaced blue rectangle with Player001_default.png, scaled 50% larger (300x375)
- Moved player and enemy name labels higher above sprites
- Moved enemy HP bar below the enemy sprite

---

## 2026-02-07 (Settings Menu + Bug Fix)
- Settings panel: SETTINGS button in bottom bar + ESC key toggle, modal with close button and backdrop click-to-dismiss
- Wipe Save: two-click confirmation (3s timeout) that clears localStorage and reloads for a fresh start
- Mutual exclusion with all other panels (Inventory, Upgrades, Prestige)
- Fixed invisible enemy bug: death animation tweens outlasted spawn delay, fading new enemy to 0 alpha
- Increased enemy spawn delay from 400ms to 1000ms to let death animations complete

---

## 2026-02-07 (Post-Phase: Goblin Sprites + Enemy Attack / Player HP)
- Enemy sprite system: Goblin Grunt renders with 4 poses (default, reaction, attack, dead) instead of red rectangle; pose-switching on combat events
- Enemy attack mechanic: enemies deal damage to player every 3s, triggering attack pose on sprite enemies
- Player HP system: HP bar under player, HP = VIT * 10, 2% regen/sec, death at 0 HP pauses combat + respawns after 1.5s
- HP resets on level-up (VIT growth) and prestige; playerHp persists in save data
- Non-goblin enemies still render as red rectangles (graceful fallback for enemies without sprites)
- Sprite enemies use fade-only death animation (no squish/scale tweens) to avoid display size warping

---

## 2026-02-07 (Phase 8)
- 80+ SYSTEM dialogue lines across 15 trigger categories (data-driven `src/data/dialogue.js`), replacing hardcoded strings in DialogueManager
- Visual juice: gold particles on kill, expand→shrink death animation, level-up golden flash, cheat activation glitch effect
- Magnitude-tiered damage numbers (size/color/shake/glow scale with damage), screen shake on 100K+/1M+ hits
- Procedural parallax backgrounds per zone (5 themes, 3 scrolling layers each)
- Balance pass: ~50% HP reductions, XP bumps zones 2-3, cheaper early upgrades, faster auto-attack (800ms) + spawn (400ms), higher fragment/loot drop rates

---

## 2026-02-06 (Phase 7)
- Prestige loop: reset at zone 4+ for permanent +25% damage/gold/XP multiplier per prestige
- PrestigePanel modal with keeps/resets/gains display and two-click confirm safeguard
- PrestigeManager tracks furthestZone (permanent high-water mark), eligibility, and prestige execution
- TopBar prestige counter (P1 x1.25), SYSTEM dialogue on prestige available/performed + 5s post-prestige combat snark
- Save migration v3→v4 for furthestZone + firstPrestige flag; SAVE_REQUESTED event for immediate saves

---

## 2026-02-06 (Phase 6)
- Loot Hoarder cheat: auto-merges 10 items into 1 higher-tier weapon (iron_dagger→steel_sword→mithril_blade→adamantine_axe→dragonbone_blade chain)
- CheatDeck bottom bar UI: toggleable cheat cards with pulsing green glow, hidden until first cheat unlocked
- CheatManager: auto-unlocks Loot Hoarder at 10 glitch fragments with SYSTEM dialogue
- Drop pacing boost when Loot Hoarder active: 3x items per drop + 1.5x drop chance (capped 80%)
- Save migration v2→v3 for activeCheats, firstMerge flag; cheat data module at `src/data/cheats.js`

---

## 2026-02-06 (Phase 5)
- Upgrade system: 4 legit upgrades (gold-cost) + 2 exploit upgrades (fragment-cost) with scaling costs and max levels
- First Crack event at kill #20: scripted 4-step SYSTEM dialogue sequence, permanently sets crits to 10x
- Glitch fragment drops (5% after crack) with first-fragment SYSTEM snark dialogue
- UpgradePanel modal overlay with UPGRADES [U] toggle, mutual exclusion with inventory panel
- CombatEngine applies upgrade multipliers to damage/gold/crit/speed; save migration v1→v2 for new state fields

---

## 2026-02-06 (Phase 4)
- Loot system: enemies drop items on kill (40%/35%/30%/25%/20% by zone), weighted random from loot tables
- 12 items across 5 zones (weapons, head, body, legs) with stat bonuses in `src/data/items.js`
- Inventory system: stack-based (max 20 unique stacks), equip/unequip/sell via InventorySystem module
- InventoryPanel modal overlay: BAG [I] toggle, equipment slots + inventory grid + sell/equip buttons
- CombatEngine now reads equipped weapon ATK for damage; SystemLog + DialogueManager wired for loot events

---

## 2026-02-06 (Phase 3)
- UI Shell: TopBar (gold/mana/fragments + level/XP bar with pop-tween), SystemLog (scrollable masked green monospace log, color-coded by event type), ZoneNav (arrow navigation for zones 1-5)
- UIScene parallel overlay orchestrating all UI components
- DialogueManager with flag-gated one-shot SYSTEM triggers (first kill, first level-up, Zone 2)
- LAYOUT + COLORS constants in config.js; Store.setFlag() mutation method
- GameScene combat elements repositioned to 960px game area (right 320px reserved for log)
- Kill log lines condensed: "Sewer Rat defeated! +5 Gold, +8 XP" (single line per kill)

---

## 2026-02-06 (Phase 2)
- Combat loop: click enemy → damage → death → gold/XP → respawn after 500ms
- Enemy data for World 1 (5 zones, 13 enemies) in `src/data/enemies.js`
- TimeEngine tick scheduler with register/unregister/scheduleOnce
- CombatEngine module — damage calc, crit rolls (5%/2x), death/spawn cycle
- GameScene with HP bar, floating damage numbers, hit flash, death animation
- BootScene → GameScene auto-transition after 1s

## 2026-02-06 (Phase 1)
- BigNum utility module (`D()`, `format()`, Decimal re-export)
- Centralized Store with named mutation methods (addGold, addXp, etc.)
- SaveManager with localStorage persistence, backup rotation, migration framework
- TimeEngine stub for boot sequence
- Boot sequence wired: Store.init() → SaveManager.init() → TimeEngine.init() → Phaser

## 2026-02-06 (Phase 0)
- Phase 0 complete: Vite + Phaser 3 + break_infinity.js scaffolded
- EventBus with 33 canonical events (`src/events.js`)
- Balance/config constants for all game systems (`src/config.js`)
- BootScene renders green pulsing rectangle as proof of life
- Dev server, production build, and Phaser chunking all working

---

## 2026-01-24
- Initialized governance-only memory system (CLAUDE.md + .memory files).

