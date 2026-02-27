# DECISIONS

Format:
- Date:
- Tags: (workflow, architecture, tooling, convention, failure-mode)
- Decision:
- Rationale:
- Alternatives considered:
- Consequences / Follow-ups:

---

## 2026-02-27
- Tags: architecture
- Decision: Game title is "Exile's Ascension". StartScene sits between BootScene and GameScene as the main menu.
- Rationale: Game needed a proper start screen. Title captures the dark fantasy + progression identity better than "LitRPG Idle".
- Alternatives considered: No start screen (rejected: no presentation layer), title "Stancebound" / "Ruinborne" / "Shattered Stance" (rejected by user preference).
- Consequences / Follow-ups: May want to update package.json name, HTML `<title>`, and any Itch.io metadata to match new title.

## 2026-02-27
- Tags: architecture
- Decision: SaveManager uses `hasSave()` and `clearSaveForNewGame()` for menu-driven save management, distinct from `deleteSave()` which is the debug/dev wipe path.
- Rationale: `deleteSave()` sets `window.__saveWiped = true` which blocks future saves — unsafe for in-game New Game flow.
- Alternatives considered: Reusing `deleteSave()` directly (rejected: blocks autosave).
- Consequences / Follow-ups: StartScene uses `clearSaveForNewGame()` + `Store.resetState()` for New Game overwrite.

## 2026-02-27
- Tags: architecture
- Decision: 3 independent save slots using `litrpg_idle_vslice_save_slot{1,2,3}` keys. Existing single save auto-migrates to slot 1. Active slot tracked in `litrpg_idle_active_slot`.
- Rationale: Players want multiple characters/runs. Slot-based keys keep saves isolated. Migration preserves existing progress seamlessly.
- Alternatives considered: Single save with manual export/import (rejected: poor UX), unlimited saves (rejected: YAGNI, 3 is standard).
- Consequences / Follow-ups: SaveManager API is now slot-parameterized. `deleteSave()` (dev wipe) clears all slots. SettingsPanel wipe still works via `deleteSave()`.

## 2026-02-27
- Tags: convention
- Decision: Start screen uses its own parallax background images (`Images/Backgrounds/Start screen/`) separate from in-game area backgrounds.
- Rationale: Start screen has a bright, open-sky feel (blue sky + grass field) distinct from the dark forest/swamp gameplay areas.
- Alternatives considered: Reusing Area 1 forest backgrounds (rejected: user wanted distinct visual identity for start screen).

## 2026-02-27
- Tags: architecture
- Decision: Stance progression uses 3-tier upgrade system (maxLevel: 1 per tier, chained via `requires` field) instead of linear per-level upgrades. Each tier is a discrete qualitative change, not a numerical scaling.
- Rationale: Discrete tiers create meaningful build choices and feel like real power spikes. Linear scaling (e.g., old `power_smash_damage` with maxLevel 8) was forgettable. Tier 2 effects add new mechanics (vulnerability debuff, DOT, thorns reflect) instead of just bigger numbers.
- Alternatives considered: Keep linear upgrades alongside tiers (rejected: too many SP sinks, dilutes choices), discrete tiers with higher SP costs (rejected: 1 SP per tier matches existing economy).
- Consequences / Follow-ups: Old `power_smash_damage`/`power_smash_recharge` removed with SP refund migration (schema v3). Upgrade IDs use `flurry_*` prefix despite stance rename to `tempest` for save compatibility.

## 2026-02-27
- Tags: architecture
- Decision: Secondary skills (Armor Break, Interrupt, Cleanse) gated behind progression milestones (flag-based), not SP purchases. Unlock triggers fire mid-combat with SYSTEM narration sequences.
- Rationale: Player should feel the problem (armored enemy, DOT, charge attack) before getting the solution. Mid-combat unlock creates a memorable teaching moment. SP purchase would let players buy skills before encountering the problem they solve.
- Alternatives considered: SP purchase to unlock (rejected: no teaching moment), zone-based auto-unlock (rejected: player might not encounter the relevant enemy type).
- Consequences / Follow-ups: `SkillUnlockDirector` system handles detection separately from `DialogueManager`. Three flags: `unlockedArmorBreak`, `unlockedInterrupt`, `unlockedCleanse`. Secondary upgrade tiers hidden in UpgradePanel until flag set.

## 2026-02-27
- Tags: architecture
- Decision: Stance IDs renamed from `power`/`flurry` to `ruin`/`tempest` at the config/key level. Save migration maps old IDs. Upgrade IDs keep `flurry_*`/`smash_*` prefixes.
- Rationale: Better thematic names. Upgrade IDs left unchanged to avoid unnecessary save migration complexity — they're internal-only and don't appear in UI.
- Consequences / Follow-ups: `STANCE_IDS = ['tempest', 'ruin', 'fortress']`. Default stance: `'ruin'`. `hydrateState()` maps `'power'` → `'ruin'`, `'flurry'` → `'tempest'`.

## 2026-02-27
- Tags: workflow
- Decision: Planning done in Claude (Opus), implementation handed to Codex. Plans saved to `Plans/` folder as `.md` files.
- Rationale: User has limited Claude tokens per week; Codex is better suited for bulk implementation. Claude focuses on design, architecture, and planning.
- Consequences / Follow-ups: Plans must be self-contained with exact file paths, code snippets, and verification steps. Codex revises plans with assessment critiques before implementing.

---

## 2026-02-26
- Tags: architecture, convention
- Decision: Area 2 parallax uses `treeRowOverrides` array in `ZONE_THEMES` with `flatScroll: true` — all sprite layers (trees, fog, clutter) are unified under the tree row system with per-row overrides for `keys`, `skip`, `tint`, `alpha`, `depthSort`, `scaleRange`, `yRange`, `depth`, `count`, `speedMult`.
- Rationale: Reuses existing tree row infrastructure instead of creating separate fog/clutter systems. Per-row `keys` override allows mixing different sprite types in a single parallax system. `flatScroll` disables diagonal movement and growth scaling for non-forest areas.
- Alternatives considered: Separate fog/clutter systems (rejected: unnecessary code duplication), fern system for fog (rejected: too tightly coupled to area 1 layout).
- Consequences / Follow-ups: Extra overrides beyond TREE_ROWS.length are treated as standalone rows. Area 1 is unaffected (no overrides). Future areas can define their own layer configs via the same pattern.

## 2026-02-26
- Tags: convention, visual
- Decision: Per-area tinting for player (`playerTint`) and enemies (`enemyTint`) in theme config, blended multiplicatively with effect tints (stance, enrage, hit flash).
- Rationale: Area 2 swamp should feel darker. Multiplicative blend preserves combat feedback (red flash, enrage glow) while maintaining area mood. Separate enemy tint allows lighter darkening on enemies for readability.
- Alternatives considered: Global post-processing shader (rejected: Phaser 3 complexity), per-sprite manual tint (rejected: doesn't survive tint resets from combat effects).
- Consequences / Follow-ups: `_applyStanceTint` and `_applyEnemyTint` must be called instead of raw `clearTint()` after any combat effect. All `clearTint` calls on player/enemies replaced.

---

## 2026-02-25
- Tags: architecture, economy
- Decision: Upgrades cost skill points (1 SP per level, 1 SP per level-up, 35 total). Gold is spent exclusively on per-slot equipment enhancement (max +10, +5% stats/level, exponential cost).
- Rationale: Separates two progression currencies — SP for build choices (can't max all 48 upgrade levels with 35 SP), gold for incremental gear power. Creates meaningful tradeoffs.
- Alternatives considered: Gold for both (original, rejected: no build choices), 2 SP/level (rejected: too generous, no tension), per-item enhancement (rejected: punishes gear swaps).
- Consequences / Follow-ups: Save schema v2. Prestige resets SP + upgrades but keeps enhancement levels (permanent gold investment). Enhancement costs may need tuning after playtest.

## 2026-02-25
- Tags: architecture, combat
- Decision: `splitOnDeath` enemy field spawns child enemies as adds (no rewards) after a 1-second delay. `pendingSplits` counter on encounter prevents premature "cleared" state.
- Rationale: Split-on-death is visually distinct from summons (instant on death vs. cast-time loop). Delay allows death animation to play. Children as adds prevents farm exploits (consistent with summon reward policy).
- Alternatives considered: Reuse summon system (rejected: summons have cast times and cooldown loops, split is a one-shot on-death), immediate spawn (rejected: no time for death animation).
- Consequences / Follow-ups: Any enemy can use `splitOnDeath: { enemyId, count }`. Only non-adds can split (prevents recursive chains). Encounter slot cap still applies.

## 2026-02-25
- Tags: convention, ui
- Decision: Enemy sprites support `default2` for frame-oscillation animations (e.g., wing flapping) and `attackSpriteOffsetY` for per-pose vertical offset overrides.
- Rationale: Some enemies need idle animations (birds flapping) and different vertical positioning for attack vs. idle poses. Both are opt-in fields that fall back to existing behavior when absent.
- Alternatives considered: Spritesheet-based animation (rejected: overkill for 2-frame oscillation in a mostly-static idle game).
- Consequences / Follow-ups: Any future enemy can add `default2` for idle animation. `attackSpriteOffsetY` useful for enemies whose attack pose has different visual weight.

## 2026-02-24
- Tags: architecture, economy, failure-mode
- Decision: Summoned adds are progression-neutral by default. `COMBAT_V2.summonedAddRewardMult` is set to `0`, and add kills emit `lootBonus: { dropChanceMult: 0, rarityBoost: 0 }`.
- Rationale: Unlimited or repeatable summon chains can become a farm loop for gold/xp/loot if add kills pay normal rewards. Keeping adds as pressure-only mechanics avoids exploit paths while still enabling summon combat behaviors.
- Alternatives considered: Full rewards for adds (rejected: farm risk), hardcoded per-enemy exceptions (rejected: brittle and harder to reason about), global add kill cap per encounter (rejected: extra state complexity).
- Consequences / Follow-ups: Add fights increase difficulty without inflating economy progression. If design later wants partial rewards, increase `summonedAddRewardMult` as a single tuning knob and re-run balance verification.

## 2026-02-24
- Tags: architecture, convention
- Decision: Runtime summon flow uses an explicit member-add contract (`COMBAT_MEMBER_ADDED`) plus cast lifecycle events (`COMBAT_ENEMY_CASTING`, `COMBAT_INTERRUPTED`), each registered in `EVENTS` and `EVENT_CONTRACTS`.
- Rationale: Summons happen after encounter start, so GameScene cannot rely only on `COMBAT_ENCOUNTER_STARTED` payloads. A dedicated runtime add event keeps rendering/state updates deterministic and avoids ad-hoc polling or bridge hacks.
- Alternatives considered: Re-emit full `COMBAT_ENCOUNTER_STARTED` on every add (rejected: noisy and semantically wrong), direct GameScene method calls from CombatEngine (rejected: tight coupling), no contract entries (rejected: dev-mode warning spam and unstable payloads).
- Consequences / Follow-ups: New summon/cast visuals can subscribe to stable payloads. Any future runtime encounter mutation should follow the same pattern: named event + payload contract.

## 2026-02-24
- Tags: architecture, ui
- Decision: UIScene is the single owner of stance action layout/visibility with two fixed slots: Slot A for legacy stance skills (Smash/Flurry/Bulwark), Slot B for new utility skills (Armor Break/Interrupt/Cleanse).
- Rationale: Independent button classes at shared coordinates were already fragile. Two skills per stance makes per-button visibility logic error-prone and overlap-prone. Centralizing ownership in UIScene keeps stance-to-action mapping explicit and testable.
- Alternatives considered: Let each button self-manage stance visibility (rejected: duplicated logic and overlap risk), new AbilityManager UI layer (rejected: over-abstracted for six concrete buttons).
- Consequences / Follow-ups: New stance actions can be added by updating one `_stanceActions` map. Button classes remain focused on behavior/cooldown instead of cross-button layout logic.

## 2026-02-24
- Tags: tooling, workflow
- Decision: Added a targeted verification harness (`scripts/verify-combat-mechanics.js`) and npm command (`verify:combat`) as the Phase 7 automated gate for new combat mechanics.
- Rationale: Manual checks alone miss silent regressions (especially timer/state edge cases). A lightweight Node script can directly assert event payload keys, summon caps, interrupt behavior, corruption clamps, and armor break expiry with fast feedback.
- Alternatives considered: No automation (rejected: regression-prone), full formal test framework setup first (rejected: higher setup cost than needed for current scope).
- Consequences / Follow-ups: Current workflow gate is `npm run verify:combat` + `npm run build` + `npm run validate:data`. Add new checks to this harness whenever combat mechanics expand.

## 2026-02-20
- Tags: architecture, tooling
- Decision: Per-entity balance dials (ENEMY_BALANCE, BOSS_BALANCE) stored in a new `src/data/balance.js`, not in areas.js or enemies.js/bosses.js. GUI gets three tabs (Zones | Enemies | Bosses). Entity bias stacks with zone dials: `finalStat = base × zoneScale × zoneBias × entityBias`. Boss bias applied to hand-authored stats with no zone scaling.
- Rationale: Separate file keeps balance data cohesive and doesn't bloat areas.js (zone concern) or enemies.js (canonical template data). Multiplicative stacking is symmetric with ZONE_BALANCE and allows both systems to operate independently. Tabs are the cleanest layout given the page is already full-width with the zone table.
- Alternatives considered: Display-only columns (user rejected — wanted editable dials). Storing in enemies.js/bosses.js (pollutes canonical template data). Override instead of stack (less flexible — can't combine zone-wide boost with per-enemy tweak). Single row expansion instead of tabs (hard to scan 30 boss rows in collapsed rows).
- Consequences / Follow-ups: `balance-sim.js` does not yet apply entity biases — will give inaccurate output if ENEMY_BALANCE is populated. Should fold entityBias into sim after implementing the GUI. Boss bias bypasses zone scaling entirely (bosses are hand-authored absolutes).

## 2026-02-20
- Tags: architecture, convention
- Decision: When moving named bosses between zones, keep one boss per zone and preserve the final-zone area-boss gate. Rotfang moved to zone 5 and The Hollow moved to zone 1 with bossType swap (Rotfang `AREA`, The Hollow `MINI`) instead of moving Rotfang alone.
- Rationale: BossManager progression depends on a boss existing at the current zone. Moving Rotfang to zone 5 without backfilling zone 1 would leave zone 1 with no boss and risk progression dead-ends.
- Alternatives considered: Move only Rotfang to zone 5 (rejected: zone 1 boss gap). Keep boss types unchanged after zone swap (rejected: would put area-boss gate on zone 1 and break intended area flow).
- Consequences / Follow-ups: Area 1 keeps a coherent zone 1-5 boss ladder, and area unlock flow remains gated by zone 5.

## 2026-02-20
- Tags: convention, progression
- Decision: Guaranteed waterskin first-kill drop is anchored to the zone 1 boss milestone, not to Rotfang specifically. `guaranteedFirstKillItem: 'a1_rotfang_waterskin'` moved to The Hollow (current zone 1 boss).
- Rationale: Waterskin/DRINK is an onboarding sustain mechanic and should unlock at early progression timing regardless of boss-name reorder.
- Alternatives considered: Leave guaranteed drop on Rotfang after moving Rotfang to zone 5 (rejected: delays core sustain tool too far into Area 1).
- Consequences / Follow-ups: If Area 1 bosses are reordered again, keep the waterskin guarantee on whichever boss occupies zone 1 unless design intent changes.

## 2026-02-20
- Tags: tooling, failure-mode
- Decision: Zone Balance GUI now uses non-sticky table headers/tabs after repeated offset issues from sticky + nested overflow interactions.
- Rationale: Sticky offsets rendered headers far below table tops in the live tool, hurting usability.
- Alternatives considered: Hardcoded sticky offsets (failed). Dynamic computed sticky offsets (still unstable in this layout).
- Consequences / Follow-ups: Header placement is stable now. If sticky headers are needed later, reintroduce with a simpler DOM/CSS structure and cross-browser testing.

## 2026-02-19
- Tags: architecture, failure-mode
- Decision: TimeEngine one-shot timer removal now uses `tickers.indexOf(t)` (object reference lookup) instead of `tickers.splice(i, 1)` (stale index). Additionally, `CombatEngine._onEncounterEnd()` now calls `cancelRapidStrikes()` to clear any surviving ability timers.
- Rationale: When a one-shot timer's callback spliced lower-index timers (e.g., `_unregisterMemberTimers` removing encounter attack timers), the fired timer shifted to a lower index. `tickers.splice(i, 1)` at the stale index removed the wrong element — the next rapid strike timer. The stale timer remained in the array, passed `elapsed >= interval` on the next loop iteration, and re-fired. In multi-member encounters (3-rat pack), this cascaded: each re-fire killed the next enemy, causing more splices, and the stale timer fired 3-4 times in a single frame. This is the second manifestation of lesson 41's root cause (array mutation during iteration); the bounds guard caught "array shrinks below loop variable" but not "element shifts to a different index."
- Alternatives considered: Mark-and-sweep (flag fired one-shot timers, sweep after iteration) — cleaner but larger change. Cancelling rapid strikes on encounter end alone (prevents the specific cascade but doesn't fix the systemic TimeEngine bug). Both fixes applied together for defense in depth.
- Consequences / Follow-ups: `indexOf(t)` is O(n) per one-shot fire, but tickers array is small (<20 elements) and one-shots are rare — no perf concern. Rapid strikes from a completed encounter can no longer leak into the next encounter's spawn window. If TimeEngine needs further robustness, mark-and-sweep remains the ideal long-term solution.

## 2026-02-18
- Tags: architecture
- Decision: Removed `_slotsActive` backward-compat gate and all old single-enemy rendering code. Slot-based encounter rendering is now the only render path. `COMBAT_ENEMY_SPAWNED` event deleted (no subscribers). Old `enemyRect`, `enemySprite`, `hpBarFill`, `hpBarBg`, `enemyNameText` properties no longer exist.
- Rationale: The `_slotsActive` flag was never initialized or set to `true` — the new slot-based code paths were dead code while the old paths referenced objects that no longer existed (they were created in the removed `_onEnemySpawned` handler). The game would crash on any combat event. Removing the dual-path gating fixes the crash and eliminates ~280 lines of unreachable code.
- Alternatives considered: Fix by initializing `_slotsActive` and wiring the flag properly (preserves dead code for no benefit), keep old code behind feature gate (same problem — no one will ever test it).
- Consequences / Follow-ups: GameScene no longer has any single-enemy rendering capability. If encounters.js or CombatEngine breaks, there is no fallback — combat will be visually broken. This is acceptable because the old path was already broken (referenced non-existent objects).

## 2026-02-18
- Tags: architecture
- Decision: Stance switching uses no cooldown + 0.5s attack pause instead of a timed cooldown. Each switch resets the pause timer. Auto-attacks don't fire until 0.5s after the last switch. Enemies keep attacking during the pause.
- Rationale: The design vision calls for stances as a "decision, not a reflex." A timed cooldown (original plan: 3s) is an artificial gate that doesn't communicate the cost. The attack pause is a natural cost — rapid cycling means your character stands idle taking damage. Players can cycle freely to browse stances, but their DPS drops to zero until they commit. The punishment is proportional to indecision.
- Alternatives considered: 3s cooldown between switches (artificial, doesn't match idle game pacing), instant switch with no cost (no commitment, degenerate rapid-cycling), 0.5s cooldown (too fast to feel like a decision).
- Consequences / Follow-ups: CombatEngine unregisters auto-attack on STANCE_CHANGED, schedules `combat:stancePause` one-shot at 500ms that re-registers with new interval. TimeEngine.register overwrites existing keys, so rapid clicks naturally reset the timer.

## 2026-02-18
- Tags: architecture
- Decision: Ability cooldowns tick globally (wall-clock timestamps) regardless of which stance is active. Power Smash cooldown runs down even when player is in Flurry stance. No cooldown pausing or resetting on stance switch.
- Rationale: Rewards active stance swapping. The existing SmashButton cooldown uses `Date.now()` timestamps, which gives global ticking for free — no code changes needed. Pausing cooldowns per-stance would require tracking elapsed time instead of end timestamps, adding complexity for a worse player experience.
- Alternatives considered: Pause cooldowns when leaving stance (punishes switching, complex elapsed-time tracking), reset cooldowns on switch (too punishing, discourages experimentation).
- Consequences / Follow-ups: All three ability buttons (SmashButton, FlurryButton, BulwarkButton) use the same timestamp-based cooldown pattern. A player who uses Power Smash then switches to Flurry for 40s returns to find Power Smash ready.

## 2026-02-18
- Tags: architecture
- Decision: Three separate ability button files (SmashButton.js, FlurryButton.js, BulwarkButton.js) instead of an AbilityManager system. All three occupy the same screen position; stance switcher shows/hides the correct one.
- Rationale: Each ability is mechanically distinct — Power Smash is single-target burst, Rapid Strikes is 5 staggered hits with carry-over, Bulwark creates an absorb shield. A generic `execute(scene, state)` interface would immediately need ability-specific branches, creating a leaky abstraction. Three self-contained files following the same pattern (SmashButton is the template) is simpler and easier to modify independently.
- Alternatives considered: AbilityManager system with stance-to-ability mapping and shared cooldown tracking (over-abstracted for 3 abilities), single GenericAbilityButton that switches behavior via config (leaky — each ability's edge cases differ).
- Consequences / Follow-ups: SmashButton needs minimal changes (add STANCE_CHANGED visibility gate). FlurryButton and BulwarkButton are new files following SmashButton's pattern. No shared state manager. If future abilities share more mechanics, an AbilityManager can be extracted then.

## 2026-02-18
- Tags: architecture
- Decision: Click damage is stance-neutral — stance `damageMult` does NOT apply to clicks. In `CombatEngine.getPlayerDamage()`, use `isClick ? 1 : stanceMult`. Power Smash calls with `isClick=true` but applies its own `smashMultiplier` separately.
- Rationale: Clicks already apply `clickDamageScalar: 0.2`, making them weak. Stacking Flurry's 0.6x on top (0.2 x 0.6 = 0.12) would make clicks invisible. Clicks should feel consistent regardless of stance — the stance choice affects the auto-attack rhythm, not the clicking mini-game.
- Alternatives considered: Apply stance mult to clicks (Flurry clicks almost invisible), apply inverse stance mult to clicks (complex, unintuitive).
- Consequences / Follow-ups: ComputedStats.getClickDamage() does NOT include stanceDamageMult. Power Smash is technically `isClick=true` but its smash multiplier IS the Power stance's burst — the 2.0x stance damageMult is not double-applied.

## 2026-02-18
- Tags: architecture
- Decision: Bulwark ability uses an absorb shield (dual-capped: damage amount + time duration) instead of invulnerability. Shield absorbs up to 200% of max HP for up to 8 seconds, whichever is reached first. Shield HP stored as ephemeral module-level state in CombatEngine, not saved.
- Rationale: Absorb shield creates more interesting decisions than binary invulnerability — the player must choose when to activate (save it for the big hit or use it early?). Dual-capping prevents both infinite duration (saving a half-used shield forever) and infinite absorption. Stacks with Fortress base DR: incoming damage is reduced by 50% first, then remainder hits shield.
- Alternatives considered: 3s invulnerability (simpler but binary — no partial use or timing decisions), absorb shield with no time cap (can be saved indefinitely), shield that replaces base DR instead of stacking (less value from Fortress identity).
- Consequences / Follow-ups: CombatEngine.enemyAttack() gains shield check between DR and Store.damagePlayer(). Shield HP overflow spills to player HP. New CombatEngine.activateShield() and getShieldHp() methods. Shield cleared on: timer expiry, player death, or manual clear.

## 2026-02-18
- Tags: architecture
- Decision: Stance switcher UI is a single rotary button in the upper-left corner of the game area. Click cycles through stances in order (Flurry -> Power -> Fortress -> Flurry). v1 uses text placeholder art (colored circle with stance initial letter).
- Rationale: Three separate buttons take up too much space and create a "which do I click" moment. A single rotary button communicates "this is one thing with three states" and supports the rapid-cycling design (click-click-click to browse, then commit). Upper-left placement keeps it away from combat visuals and bottom-bar action buttons.
- Alternatives considered: Three tab buttons in bottom bar (space-heavy, conflicts with DRINK/ability buttons), dropdown menu (too many clicks for combat-speed switching), right-side panel (competes with log/dialogue area).
- Consequences / Follow-ups: StanceSwitcher.js is a new UI component. Position at ga.x + 50, ga.y + 50. During 0.5s attack pause: brief visual feedback (pulse or flash). Future: replace text placeholders with stance icon sprites.

## 2026-02-18
- Tags: architecture
- Decision: Contested accuracy-vs-evade dodge formula instead of standalone `agi / (agi + K)` curve. Formula: `hitChance = clamp((acc + bias) / (acc + evadeRating + bias), 0.35, 0.95)` where `evadeRating = agi * 2.0` and `bias = 60`. Enemy `accuracy` is a new per-enemy stat (auto-derived from archetypes if not authored).
- Rationale: Simple `agi / (agi + K)` is too weak at low AGI (2% dodge at agi=3), making DEF strictly dominant early game. Contested formula gives AGI meaningful early value by scaling against enemy accuracy — low-accuracy swarm enemies are dodgeable even with starter AGI, while high-accuracy brutes/bosses are harder to dodge. This creates archetype identity (fast swarms miss more, heavy brutes land hits) and makes AGI a real alternative to DEF from zone 1.
- Alternatives considered: Simple `agi / (agi + 150)` (too weak early, DEF dominates until endgame), flat dodge% on gear (two knobs for one mechanic, complicates tooltips), dodge as upgrade-only (no gear choices).
- Consequences / Follow-ups: All enemies need `accuracy` values — currently auto-derived from attackSpeed/defense/armorPen/dot. Hand-tuning accuracy per enemy may be needed after playtesting. Balance sim should model both DEF-priority and AGI-priority gear policies. Hit chance clamped at [35%, 95%] prevents both immunity and irrelevance.

## 2026-02-18
- Tags: architecture
- Decision: AGI is a base player stat (grows per level, starts at 3, +0.5/level) AND a gear stat, NOT gear-only like atkSpeed. Equipment converted: ~1/3 of armor per area to AGI-focused. Chest and legs stay DEF-only (tank core). Boots, head, gloves, amulet get AGI alternatives.
- Rationale: All players should get some baseline dodge from leveling (rewards progression), but the real build choice comes from gear. Making chest/legs always DEF ensures pure-AGI builds still take some damage, preventing invincibility. 9 items converted across 3 areas gives meaningful gear choices at every stage.
- Alternatives considered: AGI gear-only like atkSpeed (no dodge without lucky drops, bad early game), AGI on all slots (enables near-cap dodge too easily), separate `dodge` stat key on items (two stats for one outcome).
- Consequences / Follow-ups: `COMBAT_ENEMY_ATTACKED` event added to decouple enemy attack animation from hit/miss outcome — lunge plays on every attack, "DODGE!" text on miss. DoT bypasses dodge (consistent with bypassing DEF). Items use `agi: 0` default for all non-converted items via loop in items.js.

## 2026-02-18
- Tags: workflow, tooling
- Decision: Per-account SSH keys with host aliases for multi-GitHub-account authentication. `~/.ssh/config` defines `github-maker` and `github-otter` host aliases, each pointing to `github.com` with a different IdentityFile. Repo remotes use `git@github-maker:` / `git@github-otter:` instead of `git@github.com:`.
- Rationale: HTTPS credentials were routing to the wrong GitHub account on push. SSH host aliases permanently bind each repo to the correct account with zero per-push friction.
- Alternatives considered: HTTPS credential manager per-repo (fragile, OS-dependent), GitHub CLI auth switching (manual per-session), single SSH key added to both accounts (GitHub rejects — one key per account).
- Consequences / Follow-ups: New repos for either account must use the correct host alias in the remote URL. Per-repo `user.name`/`user.email` set to match each account. No passphrase on keys — can add later with `ssh-keygen -p`.

## 2026-02-14
- Tags: architecture
- Decision: Replace uniform zone scaling (0.15 for all stats) with asymmetric per-stat scaling: HP 0.10, ATK 0.12, Gold 0.18, XP 0.08. `getZoneScaling(zoneNum, stat)` accepts a stat parameter.
- Rationale: Uniform scaling produced flat TTK curves (HP and rewards grew in lockstep), zero snowball, and area transition collapse. Asymmetric scaling creates snowball (gold outpaces HP), rising danger (ATK outpaces HP), and prevents over-leveling (XP grows slowest).
- Alternatives considered: Halving per-level STR growth (cascade breakage through all bosses), reducing uniform scaling to 0.09 (incomplete — doesn't address reward/difficulty coupling).
- Consequences / Follow-ups: CombatEngine, OfflineProgress, and balance-sim all call `getZoneScaling(zone, 'hp'|'atk'|'gold'|'xp')`. Callers without a stat param default to 0.10 rate. Area-entry enemy stats calibrated to compensate — A2/A3 enemies got 30% HP and 65-75% ATK increases to create difficulty walls.

## 2026-02-14
- Tags: architecture, failure-mode
- Decision: Use native HTML5 `Audio` element for BGM instead of Phaser's Web Audio sound system.
- Rationale: Soundtrack is 207MB (~2.5hr MP3). Phaser's Web Audio decodes entire file into memory before playback — silently fails or hangs. HTML5 Audio streams from disk/network.
- Alternatives considered: Phaser `this.sound.add()` (failed — too large to decode), splitting file into smaller chunks.
- Consequences / Follow-ups: BGM lives outside Phaser's sound manager. Volume synced manually via `_bgm.volume`. If we add SFX later, those can use Phaser's sound system (small files).

## 2026-01-24
- Tags: architecture, workflow
- Decision: Governance-only memory (no MCP server) using CLAUDE.md + .memory files.
- Rationale: Minimum complexity while maintaining continuity across sessions.
- Alternatives considered: Full MCP project-memory server with ChromaDB.
- Consequences / Follow-ups: If memory friction grows, revisit adding MCP later.

## 2026-02-06
- Tags: architecture
- Decision: BigNum.js exports utility functions (D, format, fromJSON) — not a Decimal subclass. State holds live Decimal instances; strings only in localStorage.
- Rationale: Decimal already has toJSON() → string. No wrapper class needed. JSON.stringify just works.
- Alternatives considered: Custom BigNum class wrapping Decimal.
- Consequences / Follow-ups: All mutation methods must use D() to construct Decimals. Hydration in Store.loadState() converts strings → Decimals.

## 2026-02-06
- Tags: architecture
- Decision: Store is a module singleton with named mutation methods as the only write path. SaveManager receives Store as init() parameter.
- Rationale: Avoids circular imports. Named methods give a clear audit trail + event emission.
- Alternatives considered: Store as class instance, SaveManager importing Store directly.
- Consequences / Follow-ups: Every new state field needs a corresponding mutation method or integration into an existing one.

## 2026-02-08
- Tags: architecture, failure-mode
- Decision: Tree/fern sprites use normal blend mode (NORMAL) with PNG alpha transparency. No ADD, MULTIPLY, or SCREEN.
- Rationale: Tree images have dark-but-not-black backgrounds behind transparent areas. ADD/SCREEN made the non-black pixels visible as ghostly rectangles. MULTIPLY only works for white-bg images. PNG alpha handles it correctly with no blend tricks.
- Alternatives considered: ADD (ghost rectangles), SCREEN (same issue, slightly less), MULTIPLY (only works on white-bg tree003).
- Consequences / Follow-ups: Future foreground sprites should be PNGs with transparent backgrounds — no need for blend mode config per asset.

## 2026-02-08
- Tags: architecture
- Decision: Tree containers tracked in `_treeLayers` separately from `_parallaxLayers`. Not added to the main parallax array.
- Rationale: Main parallax loop's fallback branch was interfering with tree movement. Separating them ensures only the dedicated diagonal scroll code moves trees.
- Alternatives considered: `isTreeLayer` data flag with continue in main loop (caused intermittent issues).
- Consequences / Follow-ups: `_destroyParallax()` must iterate `_treeLayers` separately for cleanup.

## 2026-02-10
- Tags: architecture
- Decision: Overworld Territory Map runs as a parallel overlay scene (OverworldScene). GameScene stays active underneath so TimeEngine.update() keeps ticking. OverworldScene does NOT touch TimeEngine.
- Rationale: Eliminates double-tick and pause bugs. Map is opaque bg over game area, UIScene elements (TopBar, Log, Dialogue) remain visible since they're outside the game area rect.
- Alternatives considered: Sleep/wake GameScene when map opens (would pause combat). Run map in UIScene as a panel (too complex, different lifecycle).
- Consequences / Follow-ups: Territory buffs use TerritoryManager.getBuffValue/getBuffMultiplier pattern. Store doesn't import TerritoryManager (avoids circular deps) — CombatEngine provides getEffectiveMaxHp() wrapper instead.

## 2026-02-10
- Tags: architecture
- Decision: Territory `killsPerEnemy` and `territories` persist across prestige resets. They are NOT reset in Store.performPrestige().
- Rationale: Territories are meant to be permanent progression that rewards long-term play across prestige cycles.
- Alternatives considered: Reset territories on prestige (too punishing), reset kills only (confusing UX).
- Consequences / Follow-ups: Phase 2 will add `prestigeMultiplier` and `allIncome` buffs — need balance testing before integration.

## 2026-02-10
- Tags: architecture
- Decision: Renamed flat "zones" (1-5) to "areas". Each area contains multiple "zones" (sub-levels). Enemies use `area` field instead of `zone`.
- Rationale: Deeper progression system. 34 total zones across 5 areas. Progressive enemy unlocks and boss gates add more granular progression.
- Alternatives considered: Keep flat 5-zone system with more enemies per zone (less progression depth).
- Consequences / Follow-ups: Save migration v6→v7. `furthestArea` replaces `furthestZone` as high-water mark. `areaProgress` stores per-area zone clear state. Parallax rebuilds on area change only (not zone change). Territory gating uses `furthestArea`.

## 2026-02-10
- Tags: architecture
- Decision: Boss fights are player-initiated via "Challenge Boss" button, not automatic. Boss fight cancels if player navigates away.
- Rationale: Gives player agency over when to fight bosses. Prevents accidental boss fights when browsing zones. Reduces frustration from boss death loops.
- Alternatives considered: Auto-spawn boss after kill threshold (too punishing), persistent boss fight across navigation (complex state).
- Consequences / Follow-ups: BossManager tracks `activeBoss` state. CombatEngine.spawnBoss() is separate from spawnEnemy(). Zone change events cancel active boss.

## 2026-02-10
- Tags: architecture
- Decision: Zone progress (areaProgress) resets on prestige. Territories and killsPerEnemy persist. furthestArea is permanent.
- Rationale: Re-clearing zones each prestige cycle gives the prestige loop meaning. Territories are permanent progression that compounds across cycles. furthestArea gates territory access.
- Alternatives considered: Keep zone progress on prestige (trivializes replay), reset territories too (too punishing).
- Consequences / Follow-ups: createAreaProgress() called in performPrestige() to reset. Area 1 zone 1 starts unlocked on prestige.

## 2026-02-10
- Tags: architecture
- Decision: Inventory stack keys use composite format `itemId::rarity` (e.g. `iron_dagger::rare`). Equipment slots store full composite keys. `getItem()` transparently strips the rarity suffix for item lookups.
- Rationale: Allows same base item with different rarities to occupy separate inventory slots. Rarity is rolled at drop time by LootEngine and preserved through the full lifecycle (add → equip → unequip → sell).
- Alternatives considered: Array of stacks per itemId (more complex iteration), rarity as a stack field only without changing keys (can't differentiate stacks of same item).
- Consequences / Follow-ups: Save migration v8. All code touching inventoryStacks or equipped must use composite keys. `parseStackKey()` and `makeStackKey()` helpers in InventorySystem. Future: rarity could affect stat bonuses and sell value.

## 2026-02-11
- Tags: architecture
- Decision: ModalPanel base class uses `scene.closeAllModals(this)` for mutual exclusion instead of each panel checking every other panel. UIScene owns `_modals` array registry.
- Rationale: Adding a new panel no longer requires updating N existing panels. Central registry is the single source of truth.
- Alternatives considered: Each panel imports and checks others (original pattern, N² coupling), global event-based close (over-engineered).
- Consequences / Follow-ups: New panels just extend ModalPanel and get added to `_modals` in UIScene.create(). No other panels need modification.

## 2026-02-11
- Tags: architecture
- Decision: ComputedStats is a pure-function module (no state, no events). Store → ComputedStats circular import is acceptable because all usage is in function bodies, not at module evaluation time.
- Rationale: ESM handles circular imports correctly when functions are called lazily. ComputedStats needs Store.getState(), Store needs ComputedStats.getEffectiveMaxHp(). Neither calls the other during module init.
- Alternatives considered: Passing state as parameter (verbose, every caller must provide it), setter injection (unnecessary complexity).
- Consequences / Follow-ups: Store.js currently has a broken `require()` attempt — must be replaced with direct ESM `import` which will work fine.

## 2026-02-11
- Tags: architecture
- Decision: Dropped EffectChannels.js from Phase 2 plan. The existing buff key strings (`flatStr`, `baseDamage`, etc.) work fine without a formal registry.
- Rationale: Only 11 buff keys exist, all used consistently. A formal registry adds complexity for negligible benefit in a solo project.
- Alternatives considered: Implementing EffectChannels as planned (over-engineered for current scope).
- Consequences / Follow-ups: If buff keys proliferate or cause bugs, revisit.

## 2026-02-11
- Tags: architecture
- Decision: Store becomes a pure state container — no business logic. Progression.js owns XP/level-up. PrestigeManager owns prestige orchestration. Store only exposes granular mutation primitives.
- Rationale: Store was a god object mixing state, XP loop, prestige reset logic. Extracting business logic into domain systems reduces coupling and makes each module easier to understand.
- Alternatives considered: Keep Store.addXp() with level-up (simpler, but violates single responsibility). Full Progression system with kill rewards (deferred to Phase 6).
- Consequences / Follow-ups: CombatEngine imports Progression. UpgradeManager uses Store.addFlatStat() instead of direct mutation. Phase 6 will expand Progression with kill reward orchestration.

## 2026-02-11
- Tags: architecture
- Decision: Removed legacy state fields (currentWorld, top-level furthestZone) and legacy methods (setZone, setFurthestZone). No save migration needed — hydration defaults handle missing fields.
- Rationale: These fields were only written/read inside Store.js, kept in sync with currentArea/furthestArea. Nobody outside Store consumed them. Removing eliminates dead state.
- Alternatives considered: Keep for potential future multi-world support (YAGNI).
- Consequences / Follow-ups: Old saves with these fields silently ignore them during hydration. WORLD_ZONE_CHANGED event payload no longer includes `world` field (nobody read it).

## 2026-02-11
- Tags: architecture
- Decision: EventScope pattern (`createScope()`) replaces manual `let unsubs = []` arrays in all system singletons. Event contract registry validates payloads in dev mode only.
- Rationale: Manual unsubs arrays are error-prone (forget to push, forget to clear). Scope groups subscriptions and guarantees cleanup. Contracts catch payload shape bugs early without production overhead.
- Alternatives considered: Convert UI classes too (unnecessary — base classes already handle cleanup). Full runtime type validation (over-engineered for solo project).
- Consequences / Follow-ups: New systems should use `createScope()` instead of manual arrays. UI components keep `this._unsubs` via base classes (ModalPanel, ScrollableLog).

## 2026-02-11
- Tags: architecture
- Decision: All kill counting (total, per-enemy, zone-clear) centralized in Progression.grantKillRewards(). BossManager and TerritoryManager no longer count kills independently.
- Rationale: Three systems independently counting from the same event created consistency risk. Single source of truth in Progression ensures counts are always in sync.
- Alternatives considered: Keep distributed counting with event payload enrichment (still duplicated logic).
- Consequences / Follow-ups: BossManager listener simplified to threshold check only. TerritoryManager init/destroy are now empty (reads Store on demand via canClaim/getKillProgress).

## 2026-02-11
- Tags: architecture
- Decision: Offline progress uses rate-based calculation (DPS × time), not tick-by-tick simulation. Stored result pattern — OfflineProgress stores result, UI reads it when scenes create.
- Rationale: Rate-based is simpler, faster, and matches MVP Plan guidance. Stored result avoids timing dependency on Phaser scene creation order. Events fire during apply() but no UI listeners exist yet — harmless.
- Alternatives considered: Per-second tick simulation (expensive, unnecessary for coarse estimate). Event-based notification (timing issues with scenes not yet created).
- Consequences / Follow-ups: No loot/items, kill counters, boss sim, or death modeling offline. If offline rewards feel too generous/stingy, tune the formula or add an efficiency multiplier (<1.0).

## 2026-02-12
- Tags: architecture
- Decision: Equipment slot IDs in Store.equipped use descriptive names (`chest`, `main_hand`) instead of item slot field names (`body`, `weapon`). equipSlots.js maps between them via `itemSlot` field.
- Rationale: 33 equipment slots need clear names (e.g., `ring1`/`ring2` for two ring slots, `main_hand` vs future `off_hand`). Item `slot` field stays generic for filtering. equipSlots data bridges the two.
- Alternatives considered: Keep store keys matching item.slot (simpler but ambiguous for rings, future off-hand). Use numeric IDs (less readable).
- Consequences / Follow-ups: Save migration in hydrateState maps old `body`→`chest`, `weapon`→`main_hand`. SaveManager v7→v8 migration still uses old names (runs first, then hydration remaps). InventorySystem._resolveEquipSlot() handles item.slot → equipped key mapping.

## 2026-02-12
- Tags: architecture
- Decision: Hard pivot to GDD vertical slice. New save namespace `litrpg_idle_vslice_save` with schema v1. Feature gates disable prestige, territory, town, cheats. Legacy saves archived non-destructively.
- Rationale: Clean break from old progression model. New namespace avoids save conflicts. Feature gates prevent disabled systems from booting or showing in UI while keeping code intact for future re-enablement.
- Alternatives considered: Migrate old saves into new model (too error-prone, GDD stats are fundamentally different). Delete old saves (destructive, prevents rollback testing).
- Consequences / Follow-ups: Old save data preserved under `litrpg_idle_legacy_archive`. TerritoryManager remains imported as passive buff source (returns 0/1 defaults) — avoids null checks in ComputedStats/CombatEngine.

## 2026-02-12
- Tags: architecture
- Decision: V2 enemies use `zones: [min, max]` range instead of single `area` field. Enemy availability at a zone is `zone >= e.zones[0] && zone <= e.zones[1]`. Backward-compat `area` getter derived from `zones[0]`.
- Rationale: Zone ranges allow enemies to span multiple zones and overlap, giving smoother difficulty curves. One enemy can appear in zones 1-3 while another appears in 2-4, creating natural transitions. The old model locked each enemy to a single area with progressive-unlock slicing.
- Alternatives considered: Keep `area` field + unlock index (V1 model, less flexible). Add both `area` and `zones` fields (redundant data).
- Consequences / Follow-ups: `getUnlockedEnemies(areaId, zoneNum)` computes `globalZone = area.zoneStart + zoneNum - 1` then filters by range. `getEnemiesForArea()` filters by zone overlap with area's range. Areas 2-3 currently have no enemies (authored in Phase 5).

## 2026-02-12
- Tags: architecture
- Decision: V2 items use 6-key `statBonuses` object `{str, def, hp, regen, atkSpeed, atk}` with all keys always present (0 for unused). `atk` is an alias equal to `str` for weapons, 0 for non-weapons.
- Rationale: `InventorySystem.getEquippedWeaponDamage()` reads `item.statBonuses.atk`. Setting `atk = str` on weapons preserves backward compat without changing InventorySystem. All 6 keys always present avoids undefined checks when summing equipment bonuses.
- Alternatives considered: Remove `atk`, update InventorySystem to read `str` (premature system change in a data-only phase). Keep only `atk`/`def` (insufficient for V2 stat model).
- Consequences / Follow-ups: `getScaledItem()` now scales all stat keys uniformly via `Object.entries().map()`. Phase 2 will wire `ComputedStats` to sum hp/regen/atkSpeed from equipped gear.

## 2026-02-12
- Tags: architecture
- Decision: V2 bosses are hand-authored data in `src/data/bosses.js`, not auto-generated from enemy templates × multipliers. Each boss has fixed stats, a `baseEnemyId` for sprite reference, and `bossType` (MINI/AREA).
- Rationale: Named bosses with hand-tuned stats give better balance control and narrative identity than multiplicative generation. `baseEnemyId` links boss to an enemy for sprite reuse without coupling stats.
- Alternatives considered: Keep auto-generation from BossManager (less control, generic names). Hybrid approach with base stats from data + runtime multipliers (unnecessary complexity).
- Consequences / Follow-ups: BossManager still auto-generates bosses from enemy templates until Phase 3 rewrite. bosses.js is inert until then. Phase 3 will make BossManager look up bosses from data instead of generating them.

## 2026-02-12
- Tags: tooling
- Decision: Data validator script (`scripts/validate-data.js`, `npm run validate:data`) checks schema, cross-references, and zone coverage for all data files at build time.
- Rationale: With 30 zones, 30+ bosses, and 40+ items across 3 areas, manual cross-reference checking is error-prone. Automated validation catches broken lootTable itemIds, missing boss baseEnemyIds, zone gaps, and schema violations before they become runtime bugs.
- Alternatives considered: Runtime validation in dev mode only (harder to run in CI, mixes concerns). No validation (acceptable for V1's 12 items but not for V2's scale).
- Consequences / Follow-ups: Run after every data file edit. Will need updates as Area 2-3 content is authored (currently warns on empty zones 6-30, which is expected).

## 2026-02-12
- Tags: architecture
- Decision: atkSpeed is NOT stored in playerStats. Computed purely from gear via `ComputedStats.getPlayerAtkSpeed()`. Base value (1.0) lives in `COMBAT_V2.playerBaseAtkSpeed`.
- Rationale: Attack speed is a gear-only stat per GDD. Storing it in playerStats would imply level-ups could increase it, which contradicts the design. Gear-only derivation keeps the stat model clean.
- Alternatives considered: Store atkSpeed in playerStats with 0 growth (confusing — stat exists but never grows). Hardcode in CombatEngine (less flexible).
- Consequences / Follow-ups: ComputedStats.getPlayerAutoAttackInterval() computes the full interval from gear speed + upgrade/territory bonuses. CombatEngine re-registers auto-attack timer on INV_ITEM_EQUIPPED.

## 2026-02-12
- Tags: architecture
- Decision: Per-enemy attack speed replaces fixed global enemy attack interval. Each enemy's `attackSpeed` field determines its attack timer interval. Timer re-registered on every spawn.
- Rationale: GDD specifies different attack speeds per enemy (Feral Hound 1.2/s, Thornback Boar 0.8/s). Fixed 3s interval from V1 doesn't support this. Re-registering on spawn is clean since TimeEngine.register() overwrites existing keys.
- Alternatives considered: Keep fixed interval, scale damage instead (loses tactical feel). Store interval instead of speed (speed is more intuitive for authoring).
- Consequences / Follow-ups: `combat:enemyAttack` timer is unregistered on enemy death and zone change to prevent orphaned tickers. No enemy attack timer runs between spawns.

## 2026-02-12
- Tags: architecture
- Decision: DoT implemented as a `combat:enemyDot` TimeEngine ticker (1s interval) running while a DoT-capable enemy is alive. Flat damage bypasses defense. Cleared on enemy death, zone change, player death.
- Rationale: TimeEngine already handles periodic tickers with clean lifecycle. Flat bypassing defense matches GDD spec ("unavoidable environmental damage"). Strict clear-on-death/zone-change prevents phantom ticks.
- Alternatives considered: DoT as part of enemyAttack callback (couples two different damage sources). DoT as status effect system (over-engineered for current scope).
- Consequences / Follow-ups: _startDot()/_stopDot() called symmetrically in spawn/death/zone-change paths. If DoT becomes more complex (stacking, types), may need a StatusEffect system.

## 2026-02-12
- Tags: architecture
- Decision: ComputedStats owns equipment stat summation via `getEquipmentStatSum(statKey)`. Iterates all equipped slots, calls `getScaledItem()` on each, sums the requested stat. Used by getEffectiveStr, getEffectiveDef, getEffectiveMaxHp, getHpRegen, getPlayerAtkSpeed.
- Rationale: Equipment stats affect 5+ derived values. Centralizing the sum in one helper eliminates duplicate iteration logic. getScaledItem() handles rarity scaling transparently.
- Alternatives considered: Each function iterates equipped slots independently (duplicated code). InventorySystem provides stat sums (wrong responsibility — InventorySystem is for inventory mutations, not stat queries).
- Consequences / Follow-ups: getEquipmentStatSum() is called frequently but equipment changes are rare. If perf becomes an issue, cache sums and invalidate on INV_ITEM_EQUIPPED.

## 2026-02-12
- Tags: architecture
- Decision: V1 combat/progression constants (`COMBAT`, `PROGRESSION`, `DAMAGE_FORMULAS`) fully purged from all src/ imports. Only V2 equivalents (`COMBAT_V2`, `PROGRESSION_V2`) used by runtime code. V1 constants remain defined in config.js for reference but are dead code.
- Rationale: Clean break prevents accidental V1 formula usage. Having both constants available during the Phase 1→2 transition was useful, but now that Phase 2 is complete, no runtime code should reference V1.
- Alternatives considered: Delete V1 constants from config.js (premature — may need for comparison during balance tuning). Keep V1 imports as fallbacks (confusing dual-path logic).
- Consequences / Follow-ups: V1 constants can be removed from config.js in a future cleanup pass once balance is validated.

## 2026-02-13
- Tags: architecture
- Decision: LootEngine V2 uses zone-based item pools + slot-weighted random selection with pity. No per-enemy loot tables. Pity increments on BOSS_DEFEATED (zone clear), resets per-slot on drop.
- Rationale: Zone-based pools are simpler to maintain across 30 zones than per-enemy tables. Slot weighting ensures all gear slots get drops over time. Pity prevents bad-luck streaks from locking out slot upgrades.
- Alternatives considered: Keep per-enemy loot tables (doesn't scale), pure random item selection (some slots starved), pity on every kill (too fast).
- Consequences / Follow-ups: Items only need `zones: [min, max]` — no loot table cross-references needed. Boss lootTable field becomes unused by LootEngine (kept for validator/future use). ACTIVE_SLOT_IDS drives both pity tracking and drop filtering.

## 2026-02-13
- Tags: architecture
- Decision: Boss first-kill detection relies on BossManager.onBossDefeated() being delayed 1300ms after COMBAT_ENEMY_KILLED. LootEngine checks bossesDefeated at event time — absence = first kill.
- Rationale: No new state or events needed. The 1300ms delay exists for the boss defeat animation/transition, and the event ordering is deterministic. Clean separation of concerns.
- Alternatives considered: Add a `firstKill` flag to COMBAT_ENEMY_KILLED payload (requires BossManager to enrich CombatEngine events — coupling). Track first kills in LootEngine's own state (redundant with bossesDefeated).
- Consequences / Follow-ups: If the CombatEngine delay changes, first-kill detection must be re-verified. Document the timing dependency.

## 2026-02-13
- Tags: convention
- Decision: Per-area loot tables are duplicated in both `enemies.js` and `bosses.js` (not shared/imported). Each file defines its own `AREA_1_LOOT_TABLE`, `AREA_2_LOOT_TABLE`, `AREA_3_LOOT_TABLE` constants.
- Rationale: LootEngine V2 doesn't use loot tables at all (zone-based pools instead). The tables are vestigial — kept only for data validator schema consistency and potential future use. Duplicating avoids a cross-file import for dead data. If LootEngine ever reads loot tables again, consolidate into a shared module.
- Alternatives considered: Shared loot table module imported by both files (over-engineered for unused data). Remove loot tables entirely (breaks validator schema checks).
- Consequences / Follow-ups: When adding new items, update loot tables in both enemies.js and bosses.js. Consider removing loot tables from schema if they remain unused after balance tuning.

## 2026-02-13
- Tags: convention
- Decision: Content authoring conventions locked for all 3 areas: enemy gold = `Math.round(HP * 0.25)`, boss gold = HP, all XP = HP. Sell values scale ~2-4x per area tier. Item `atk` = `str` for weapons, 0 for non-weapons. All 6 statBonuses keys always present.
- Rationale: Consistent formulas across 18 enemies and 30 bosses prevent per-entity balance drift. The HP-based approach is simple and self-documenting. Validator enforces the atk/str invariant.
- Alternatives considered: Per-entity gold/XP tuning (time-consuming, error-prone at scale). Formula-based generation at runtime (hides values from data validator).
- Consequences / Follow-ups: **SUPERSEDED by Phase 7 balance pass (see 2026-02-13 balance decision below).** XP and ATK conventions changed: enemy XP ≈ hp × 0.25, boss XP ≈ hp × 0.5, enemy ATK ≈ original × 3, boss ATK ≈ original × 3.5. Gold and item conventions unchanged.

## 2026-02-13
- Tags: architecture
- Decision: COMBAT_ENEMY_SPAWNED payload enriched with `armorPen`, `dot`, `defense` fields. New `COMBAT_DOT_TICK` event emitted every 1s from DoT ticker.
- Rationale: SystemLog needs these fields to show spawn-time warnings and periodic DoT damage. Enriching the existing event is simpler than adding a separate mechanic-info event. DoT ticks are throttled in the UI (every 5th) to avoid log spam.
- Alternatives considered: Separate COMBAT_MECHANIC_INFO event (unnecessary indirection). SystemLog querying CombatEngine for enemy data (coupling).
- Consequences / Follow-ups: Any future combat mechanic feedback (e.g. crit vulnerability, elemental weakness) can follow the same pattern — enrich spawn payload, add a log handler.

## 2026-02-27
- Tags: architecture, ui-layout, feature-gates
- Decision: Gameplay layout now supports two profiles (`CLASSIC_LAYOUT`, `EXPANDED_LAYOUT`) in `src/config/layout.js`, selected by feature flags. Expanded profile activates only when `expandedGameplayLayoutEnabled=true` AND `systemLogsEnabled=false`.
- Rationale: We needed to reclaim right-side space after hiding `SystemDialogue`/`SystemLog`, but with a one-switch rollback path. Profile-based selection makes layout behavior explicit and reversible without branchy scene-level conditionals.
- Alternatives considered: Hard-switch to full width unconditionally (no rollback), scatter `if (expanded)` checks across UI components (fragile and hard to maintain).
- Consequences / Follow-ups: New layout work should derive anchors from `LAYOUT`/`WORLD`, not hardcoded `960`/`1280` values. Compile verification was run in all 4 flag combinations; visual QA pass remains the follow-up.

## 2026-02-27
- Tags: ui-layout
- Decision: Combat/UI anchor points moved to ratio-based positions relative to `LAYOUT.gameArea.w` for compatibility across classic and expanded modes.
- Rationale: Fixed pixel offsets tuned for a 960px gameplay region made controls and combat staging feel left-cramped in expanded mode. Ratio anchors preserve relative composition in both profiles with minimal code churn.
- Alternatives considered: Separate hardcoded positions per profile (duplication, more tuning surfaces), full auto-layout rewrite (too heavy for this pass).
- Consequences / Follow-ups: Ratios are initial tuning values, not final art direction. Next pass should be feel-based tuning under real gameplay conditions.

## 2026-02-27
- Tags: ui, architecture
- Decision: Added `UI_ONBOARDING_REQUESTED` event and `OnboardingPopup` modal so first-run teaching is presented as a pause-safe popup instead of only System log lines.
- Rationale: With logs hidden and onboarding content being critical, tutorial delivery needs a guaranteed surface. Popup + temporary `GameScene` pause improves readability and onboarding clarity.
- Alternatives considered: Keep onboarding in log only (easy to miss), hardcode popup spawn directly in UIScene (couples narrative triggers to scene code).
- Consequences / Follow-ups: Event-driven UI onboarding remains decoupled and can be reused for future milestone popups without tying logic to the log panels.

## 2026-02-13
- Tags: convention
- Decision: Area names are authoritative in `areas.js` only. ZONE_THEMES in theme.js holds visual config (layers, images, trees, ferns) but no names. ZoneNav, SystemLog, and DialogueManager all read names from `getArea()`.
- Rationale: ZONE_THEMES had stale V1 names ("Forest", "Wilderness") that shadowed V2 names. Single source of truth prevents drift.
- Alternatives considered: Keep names in both places (drift risk). Move visual config into areas.js (mixes data/presentation concerns).
- Consequences / Follow-ups: Any new area must add its name to areas.js and visual config to ZONE_THEMES separately.

## 2026-02-13
- Tags: architecture
- Decision: V2 balance conventions changed. Enemy ATK ×3 from original, XP = ~25% of HP (was 100%). Boss ATK ×3.5, XP = ~50% of HP (was 100%). Gold unchanged.
- Rationale: Original values made enemies trivially weak (ATK < defense*0.5 = minimum 1 damage), and XP too generous (player double-leveled vs GDD targets). New values produce meaningful combat with survival ratios 2-10x for regular zones and 1.2-2.0x for area bosses.
- Alternatives considered: Changing defense coefficient in combat formula (too fundamental), reducing XP table (last resort per plan), reducing kill thresholds (not in tuning scope).
- Consequences / Follow-ups: Balance sim script (`npm run balance:sim`) exists for future tuning. If new content is added, follow new conventions: `xpDrop ≈ hp * 0.25` for enemies, `xpDrop ≈ hp * 0.5` for bosses, `attack ≈ hp * 0.3-0.5` for enemies.

## 2026-02-14
- Tags: architecture, failure-mode
- Decision: Large combat sprites (928-2048px) are pre-downscaled to 2× display size via off-screen canvas in BootScene.create(), replacing the original Phaser texture with the canvas version under the same key.
- Rationale: WebGL bilinear filtering only samples 4 texels per pixel — at 3-8× downscale it skips most source pixels, producing blocky/aliased sprites. Browser canvas `drawImage` with `imageSmoothingQuality='high'` uses Lanczos resampling which considers many more source pixels. Downscaling to 2× display size leaves WebGL with a clean ≤2× bilinear pass.
- Alternatives considered: `texture.setFilter(LINEAR)` after every `setTexture()` call (redundant — LINEAR is already Phaser's default; doesn't help because the algorithm is still 4-texel bilinear). Pre-generating `_thumb.png` files on disk (works but requires regeneration when sizes change). WebGL mipmaps via `gl.generateMipmap()` (requires power-of-two textures in WebGL1; most sprites are NPOT).
- Consequences / Follow-ups: When adding new enemy sprites, add their texture keys + 2× spriteSize to `_downscaleCombatSprites()` in BootScene. Equipment thumbnails still use the `_thumb.png` approach (already 128px, no runtime downscale needed).

## 2026-02-16
- Tags: architecture
- Decision: Power Smash is a click-damage-based active ability using `CombatEngine.getPlayerDamage(state, true)` × multiplier. Upgrades stored in existing `purchasedUpgrades` object with custom `multiplier` targets (`powerSmashDamage`, `powerSmashCooldown`). No new save fields.
- Rationale: Reusing click damage calculation means Power Smash automatically benefits from STR, crit, prestige, territory, and click damage upgrades. Custom multiplier targets prevent the smash upgrades from accidentally applying as general stat bonuses. Zero save migration needed.
- Alternatives considered: Separate damage formula decoupled from click damage (less intuitive scaling), new save fields for cooldown/multiplier state (unnecessary — cooldown is ephemeral, multiplier is derived from upgrade levels).
- Consequences / Follow-ups: SmashButton tracks `_cooldownStart` to support mid-cooldown recalculation when recharge upgrades are purchased. Button positioned to the right of DRINK at `ga.x + 110`. Level 3 unlock checked via `state.playerStats.level`.

## 2026-02-19
- Tags: architecture, failure-mode
- Decision: Added bounds guard `if (i >= tickers.length) continue` to TimeEngine.update() backward loop. Timer callbacks that call `unregister()` (which splices the tickers array) can shrink the array below the current loop index, causing `tickers[i]` to be `undefined`.
- Rationale: The crash was triggered when `combat:autoAttack` was at a high array index (after re-registration from stance switch, equipment change, or upgrade purchase) and its callback killed an enemy, causing `_unregisterMemberTimers` to splice 2-3 encounter timers at lower indices. Each splice shifted the array left, eventually making the loop variable exceed `tickers.length`. The bug was dormant when autoAttack stayed at index 0 (first registered during init), but any re-registration event pushed it to the end.
- Alternatives considered: Mark-and-sweep (flag dead tickers during callbacks, sweep after iteration) — cleaner but larger change. Copy-on-iterate (snapshot array before loop) — wasteful for 60fps. The bounds guard is minimal and correct.
- Consequences / Follow-ups: Skipped tickers fire one frame late (16ms delay, imperceptible). If TimeEngine needs more robustness later, consider mark-and-sweep. All existing `register`/`unregister` calls from within callbacks are now safe.

## 2026-02-19
- Tags: architecture
- Decision: Enemy traits (regen, enrage, thorns) are data fields on enemy templates, processed by CombatEngine at runtime. Regen and thorns zone-scale by the `atk` rate. Enrage uses multiplier ratios (no scaling needed). Traits are composable — an enemy can have zero, one, or multiple.
- Rationale: Follows the existing pattern (dot, armorPen, defense are data fields processed at combat time). No new systems needed — regen is a timer like DoT, enrage modifies existing attack timer, thorns hooks into existing playerAttack flow. Zone scaling by atk rate keeps trait pressure relevant across zones.
- Alternatives considered: Trait system as a separate module (over-engineered for 3 traits), traits as buff/debuff status effects (would need a status effect system that doesn't exist).
- Consequences / Follow-ups: GameScene needs visual handlers for COMBAT_ENEMY_REGEN, COMBAT_ENEMY_ENRAGED, COMBAT_THORNS_DAMAGE (Phase 6). SystemLog needs trait messages. Balance sim needs trait columns. Thorns calls Store.damagePlayer synchronously inside playerAttack — the _onPlayerDamaged handler in GameScene may stomp on _playerPoseTimer set by _onEnemyDamaged (bounded at count=1, resets on encounter end, cosmetic only).

Tip: Search with `rg "Tags:.*workflow" .memory/DECISIONS.md`
