# Lessons Learned

Honest retrospective on the LitRPG Idle project. Two major phases of work are covered:
1. The original 9-phase **codebase redesign** (architectural cleanup of the MVP)
2. The 7-phase **GDD hard pivot** (complete gameplay model replacement for the vertical slice)

---

## Critical: Never Use Destructive Git Commands to Roll Back

**Incident:** User asked to roll back coding changes from the current session. Used `git checkout -- file1 file2` which nuked ~1 hour of pre-existing uncommitted work on those files. Unstaged changes are unrecoverable via git.

**Rule:** NEVER use `git checkout --`, `git restore`, or any destructive git command to undo changes. Always use the Edit tool to manually revert specific changes. Files almost always have uncommitted work from prior sessions that must be preserved.

**Recovery options when this happens:** Editor undo history (Ctrl+Z in VS Code) is the only realistic recovery path. `git fsck --lost-found` only recovers staged/committed objects, not unstaged edits.

---

## Part 1: Codebase Redesign (Phases 1-9)

### What Worked Better Than Expected

#### 1. Memory governance system (CLAUDE.md + .memory/)
The lightweight session protocol — read CURRENT_FOCUS, check DECISIONS, produce a session plan — was the single biggest productivity multiplier. Expected it to be bureaucratic overhead; instead it **prevented re-debating the same architectural questions** across sessions. The "resume in 30 seconds" section alone saved at least 10 minutes per session. DECISIONS.md caught two cases where we were about to undo a prior choice.

**Takeaway:** Invest in session continuity infrastructure early. The cost is ~5 minutes/session; the payoff is never losing context.

#### 2. Phased redesign with "always playable" constraint
Each redesign phase was independently valuable and left the game fully functional. Could have stopped after Phase 2 and the code would still be better. The phased approach also made it psychologically easier to start — "just do Phase 1" is less daunting than "redesign everything."

**Takeaway:** "Every phase leaves the game playable" is the right constraint for refactors. It prevents the trap of a multi-day rewrite that never converges.

#### 3. Event-driven architecture from day one
The canonical `events.js` with namespaced events (`domain:action`) was established in Phase 0 of the original MVP plan. It paid dividends continuously — systems stayed decoupled, dialogue triggers were trivial to add, and the EventScope pattern in Phase 8 was possible because the event system was already clean.

**Takeaway:** Event architecture is one of the few things worth getting right upfront. The cost of retrofitting it later is enormous.

#### 4. Store mutation boundary
Making all state writes go through named Store methods caught real bugs during the redesign. UpgradeManager was directly mutating `state.playerStats.str` — discovered and fixed during Phase 5. The boundary also made it trivial to add event emission to every write path.

**Takeaway:** Centralized mutation is worth the verbosity. Every `addFlatStat()` method is one more place to hook logging, validation, or events.

#### 5. Data-driven dialogue
80+ lines of SYSTEM personality, all in `dialogue.js`, all triggered by events with cooldowns. The game's entire personality lives in a data file. Adding new quips requires zero system changes — just append to an array.

**Takeaway:** Personality should be data, not code. Trigger conditions in the system, content in the data file.

#### 6. ModalPanel base class (Phase 1)
Eliminated ~500 lines of copy-pasted modal lifecycle code. After this, adding a new panel (StatsPanel) took 30 minutes instead of 2 hours. The mutual exclusion registry (`UIScene.closeAllModals()`) was the key insight — it replaced N² panel-to-panel coupling with a central registry.

**Takeaway:** UI base classes have enormous leverage when panels share lifecycle patterns. Do this before the third panel, not after the fifth.

#### 7. Stored result pattern for offline progress
Instead of emitting an event that no UI scene would catch (Phaser scenes don't exist yet during boot), OfflineProgress stores its result and UI reads it when ready. Zero timing issues, zero new events needed.

**Takeaway:** When the producer runs before the consumer exists, store-and-read beats emit-and-hope.

### Mistakes Made

#### 1. Redesign came too late
Built 8 feature phases, accumulated significant structural debt, THEN did a 9-phase redesign. The redesign would have been 60% cheaper if done after Phase 3-4 of the original MVP, when the architecture was simpler and fewer systems existed. By the time we redesigned, every change required understanding cross-system interactions.

**Takeaway:** Schedule a "structural health check" after every 3-4 feature phases. Refactor while the codebase is small enough to hold in your head.

#### 2. GameScene is still a 945-line god object
The redesign improved every system module but never touched GameScene — the single largest file. It mixes parallax rendering, combat visuals, damage number animations, particle effects, sprite management, and scene lifecycle. This is the file most likely to cause bugs in future development.

**Takeaway:** Don't skip the hardest file in a redesign. If it's too scary to split, at least extract the clearly separable concerns (parallax could be its own module; damage numbers could be a utility).

#### 3. Hardcoded magic numbers in visual code
Despite Phase 3 (config decomposition), GameScene and OverworldScene still have dozens of hardcoded Y positions, sizes, and spacing values. The config split extracted game balance and UI layout, but visual positioning was left scattered. Adding a 6th area would require hunting through multiple files.

**Takeaway:** Visual layout constants deserve the same treatment as game balance constants. If a number controls where something appears on screen, it belongs in a config file.

#### 4. No automated tests
Zero tests for any system. SaveManager migrations, Progression math, ComputedStats formulas, offline progress calculations — all verified manually by playing. One migration bug could corrupt every player's save with no automated way to catch it.

**Takeaway:** At minimum, write tests for: (a) save migrations, (b) core math formulas (damage, XP, offline rewards), (c) state mutation boundaries. These are the highest-leverage tests — not UI tests, not integration tests, just pure-function unit tests.

#### 5. Zone/Area naming confusion persists
The rename from flat "zones" to hierarchical "areas containing zones" left vestiges everywhere. `dropChanceByZone` is keyed by area number. `getZoneScaling()` scales within an area's zones. Function parameter names, comments, and config keys are inconsistent. The DECISIONS log records the rename but doesn't track cleanup.

**Takeaway:** When renaming a core concept, do a full grep-and-rename pass in the same session. Leaving "cosmetic" naming mismatches creates cognitive load that compounds over time.

#### 6. Save schema version 8 before release
Eight schema migrations for a pre-release game. Each migration is code that will never execute for new players. The data model changed too frequently during development — inventory format alone went through 3 revisions (flat → stacks → rarity-keyed stacks).

**Takeaway:** During early development, consider wiping saves between major changes instead of writing migrations. Save migrations have a purpose — protecting existing players' data. Before release, there are no existing players.

#### 7. Territory buff wiring left incomplete
`allIncome` and `prestigeMultiplier` territory buffs are defined in territory data, cost real gold and kills to unlock, but **do nothing**. They're not wired into ComputedStats or any multiplier path. A player who claims these territories gets zero benefit. This is a broken promise in the game design.

**Takeaway:** Don't ship (or commit) data that references unimplemented mechanics. Either wire the buffs or remove the data entries. "Deferred" is fine for a TODO, not for content the player can interact with.

#### 8. ARCHITECTURE.md drifted from reality
The architecture doc still describes the original event payload shapes (e.g., `combat:enemyKilled` with just `{ enemyId }` instead of the current `{ enemyId, name, isBoss }`). It references `DialogueDirector` (renamed to `DialogueManager`). It doesn't mention ComputedStats, Progression, EventScope, or OfflineProgress. The doc became a historical artifact rather than a living reference.

**Takeaway:** Architecture docs should be updated during the same session as architectural changes, or they become misleading. A wrong doc is worse than no doc.

#### 9. Over-built cheat infrastructure
The cheat system has a full unlock/toggle/persist lifecycle, CheatManager singleton, cheat data structure with dialogue hooks, a CheatDeck UI panel — all for a single cheat (Loot Hoarder). The infrastructure cost was probably 3x what a simple boolean flag would have been.

**Takeaway:** Build the second abstraction when you need the second instance, not when you build the first. One cheat doesn't justify a cheat framework.

#### 10. BigNum boundary is blurry
Some values are Decimal objects (gold, XP, HP), others are plain numbers (enemy HP, damage, stats). The conversion happens at inconsistent points — sometimes at the formula level, sometimes at the Store mutation level, sometimes at display time. This creates subtle bugs where `Number(decimal)` silently truncates.

**Takeaway:** Define a clear boundary: "Decimal above X threshold, plain number below." Document which fields are which type. In this game, most values don't need BigNum until very late prestige cycles.

---

## Part 2: GDD Hard Pivot (Phases 0-7)

The GDD pivot was a complete gameplay model replacement: new stat model, new combat formulas, new enemies/bosses/items, new loot system, new balance targets — built on top of the redesigned architecture. This section covers what the pivot taught that the redesign didn't.

### What Worked

#### 1. The prior redesign directly enabled the pivot
The 9-phase codebase redesign created clean module boundaries (Store, ComputedStats, CombatEngine, Progression, LootEngine) that made swapping the entire gameplay model feasible in 7 phases. V2 combat formulas went into CombatEngine without touching dialogue. V2 stat models went into Store/ComputedStats without touching loot. V2 loot went into LootEngine without touching combat. Each system was replaceable independently because the redesign had already separated concerns.

**Takeaway:** Architectural investment compounds when pivots happen. The redesign felt expensive at the time; the pivot would have been a full rewrite without it. Clean seams aren't just for readability — they're insurance against changing your mind.

#### 2. Feature gates as a pivot enabler
Phase 0 established a `features.js` module with boolean flags for prestige, territory, town, and cheats — all set to `false`. Boot guards checked these flags before initializing managers or rendering UI. This trivial pattern (4 booleans, ~20 guard checks) meant the pivot could happen incrementally without worrying about disabled systems interfering, throwing null errors, or confusing playtesters.

**Takeaway:** Feature gates are the cheapest pivot insurance you can buy. Add them before you need them. The cost is near-zero; the benefit is the ability to disable any system instantly without deleting code.

#### 3. Fresh save namespace instead of migrations
Starting with `litrpg_idle_vslice_save` (schema v1) instead of migrating old saves was the single best scoping decision. The V1→V2 stat model change (vit/luck → def/hp/regen) would have required complex migration logic with ambiguous mapping. A fresh namespace made it a non-problem and validated the earlier lesson about not writing migrations pre-release — this time we actually followed it.

**Takeaway:** When pivoting the data model fundamentally, a new save namespace is cheaper and safer than migration. Archive the old data non-destructively (we used `litrpg_idle_legacy_archive`) and move on.

#### 4. Data validator as a scaling tool
The `validate-data.js` script was created in Phase 1 (the earliest possible moment) and paid off every subsequent phase. It caught: missing `baseEnemyId` references on bosses, items with zone ranges outside their area, enemies with missing required fields, and zone coverage gaps. With 18 enemies, 45 items, and 30 bosses across 30 zones, manual cross-referencing would have been an error factory.

**Takeaway:** Write the data validator before the second data file, not after the fifth. For data-heavy games, the validator is as important as the data itself. Run it after every edit (`npm run validate:data`).

#### 5. Balance simulation before playtesting
The `balance-sim.js` script (Phase 7) models all 30 zones end-to-end: player leveling, optimal gear equipping, upgrade purchasing, per-zone combat math with exact formulas, DoT, and armor pen. It immediately revealed two critical problems invisible during manual play:
- Enemies were trivially weak (all dealt minimum 1 damage because ATK < DEF × 0.5)
- XP was far too generous (player double-leveled vs GDD targets)

Three balance iterations in the sim (enemy ATK ×3, boss ATK ×3.5, XP reduced) produced valid numbers in minutes. Manual playtesting would have taken hours to reach the same conclusions, and the problems wouldn't have been obvious until Area 3.

**Takeaway:** Write the balance sim before content authoring, not after. Math-first balance validation is 10-100x faster than play-first. The sim also serves as documentation of your combat formulas — if the sim matches the game, the formulas are correct.

#### 6. Content authoring conventions as a force multiplier
Locking formulas before authoring (enemy gold = HP × 0.25, boss gold = HP, XP = HP, sell values scale 2-4x per area) made writing 18 enemies and 30 bosses systematic rather than bespoke. Each entity was a fill-in-the-blanks exercise. The data validator enforced invariants (e.g., weapon `atk` must equal `str`).

**Takeaway:** Establish authoring conventions before the content sprint, not during it. When the formulas are locked, adding 10 enemies takes the same mental effort as adding 3.

#### 7. "Frankenstein state" tolerance
After Phase 1, the game ran V2 data with V1 combat (enemies died instantly). After Phase 2, V2 combat ran with V1 boss generation. After Phase 3, named bosses worked but loot was still V1. Each phase accepted a temporarily inconsistent state. This only worked because the "always playable" constraint ensured nothing crashed — the game was weird but functional.

**Takeaway:** Don't try to make everything consistent at every phase boundary. Tolerate mixed V1/V2 states as long as the game boots and runs. Trying to keep everything aligned at all times creates a "big bang" rewrite in disguise.

#### 8. Risk identification was accurate
The plan identified 4 primary risks before Phase 0. All four manifested, and all four were controlled by the planned mitigations:
- **Data volume risk** → validator caught schema/reference errors across 90+ data entries
- **Combat regression risk** → DoT bug caught in Phase 7 (late, but before ship)
- **Save/cutover confusion** → new namespace eliminated the entire problem class
- **Scope drift** → feature gates kept 4 disabled systems from interfering

**Takeaway:** Spend 15 minutes identifying risks and writing one-sentence controls before starting a multi-phase plan. The exercise forces you to think about what can go wrong while you can still prevent it cheaply.

#### 9. Phase checkpoints enabled natural scope migration
The plan allocated XP tables and stat gains to Phase 3, but they got done naturally in Phase 2 (because the stat engine was open anyway). Phase 3 shrank to just BossManager + BossChallenge. Phase 6 had many items pre-done from earlier phases. The plan was accurate for total scope but not per-phase allocation — and that was fine. Phase boundaries served as review checkpoints, not rigid contracts.

**Takeaway:** Plan phases by theme (data, combat, bosses, loot, UI, balance), not by rigid task lists. Tasks will naturally migrate to whichever phase has the file open. The phase boundary's job is to force a pause-and-check, not to be a contract.

### Mistakes Made

#### 1. The DoT bug survived 2 phases undetected
DoT was implemented in Phase 2 reading `enemy.dot.dmgPerSec`. In Phase 5, enemy data was authored with `dot` as a plain number (not an object). DoT silently dealt 0 damage from Phase 5 through Phase 7. The bug was invisible because DoT enemies still died from normal player attacks — the player just took less damage than designed.

This is exactly the class of bug that automated tests would catch. A single test — `expect(dotDamage(enemy)).toBeGreaterThan(0)` — would have failed immediately when the data format changed.

**Takeaway:** Silent failures in secondary mechanics are the hardest bugs to catch without tests. If a mechanic can fail to 0 without crashing, it **will** fail to 0 without anyone noticing. The balance sim eventually caught it, but 2 phases late. Priority test targets: any damage path that can silently produce 0.

#### 2. Balance sim was written last instead of first
The sim was created in Phase 7 (the final phase) as a validation tool. It should have been created in Phase 1 alongside the data validator. If the sim had existed when Phase 2 (combat engine) was completed, the ATK/XP imbalance would have been caught immediately instead of propagating through 5 phases of content authoring with wrong assumptions.

Worse: the Phase 5 content was authored using the original conventions (XP = HP, ATK = original values). When the sim revealed these were wrong in Phase 7, every enemy and boss needed individual stat updates (ATK ×3/×3.5, XP ×0.25/×0.5). If the sim existed first, the conventions would have been correct from the start.

**Takeaway:** The balance sim is a development tool, not a QA tool. Write it when you write the combat formulas, not when you're done with content. Convention → Sim → Validate → Author content. Not: Convention → Author content → Sim → Discover conventions were wrong → Re-author content.

#### 3. Convention changes required batch updates
When the Phase 7 balance pass changed conventions (ATK ×3, XP ×0.25), every entity authored under the old conventions needed individual updates. 18 enemies and 30 bosses had to be touched. The formulas were simple multipliers, but applying them manually to 48 entities was tedious and error-prone.

The existing conventions entry in DECISIONS.md was updated with a "SUPERSEDED" note, which was good. But there was no tooling to propagate the change — it was all manual.

**Takeaway:** If content authoring is formula-based, store the formula parameters in one place and derive the values, rather than baking computed values into each entity. Alternatively, write a script that can re-derive values from formulas when conventions change. The authoring convention should be the formula, not the result.

#### 4. Dead code accumulated without a cleanup pass
The pivot created dead code at every phase:
- V1 constants in `config.js` (COMBAT, PROGRESSION, DAMAGE_FORMULAS) — still defined, zero runtime imports
- `getBossType()`, `getStrongestEnemy()`, `getBossDropMultiplier()` in `areas.js` — from V1 boss auto-generation, bypassed by Phase 3
- `UpgradeManager.getAutoAttackInterval()` — ownership transferred to ComputedStats in Phase 2, never deleted
- Per-area loot tables duplicated in both `enemies.js` and `bosses.js` — LootEngine V2 doesn't read them at all
- 33-key `Store.equipped` object when only 7 keys are used at runtime

Every item is documented in CURRENT_FOCUS open loops, which is better than undocumented dead code. But documenting dead code is not the same as removing it. The cleanup pass was always "next" and never happened.

**Takeaway:** Schedule a dead code cleanup at the end of the pivot, before moving to playtesting. Dead code that survives into the "ship it" phase tends to survive forever. The documented open loops in CURRENT_FOCUS are a ready-made cleanup checklist — use it.

#### 5. No playtest gate in the plan
Phases 0-7 were all code and data work. Playtesting appears only as a post-plan "next step." This meant 7 phases of mechanical work before any human feel-validation. The balance sim partially compensated (it caught formula-level problems), but it can't catch feel problems: Is the pace satisfying? Do drops feel rewarding? Is the boss challenge timing right? Does DoT feel threatening or just annoying?

**Takeaway:** Insert a lightweight playtest checkpoint after the first area is mechanically complete (Phase 3 in this plan). It doesn't need to be formal — 15 minutes of playing through Area 1 would have caught the DoT bug, validated combat feel, and informed Phases 4-7. The balance sim validates math; only human play validates fun.

#### 6. Sprites deferred to "later" and never happened
Phase 5 authored 15 enemies and 25 bosses, all with `sprites: null`. The plan noted "Map placeholder sprites for all new enemies" as Phase 5 step 3, marked with a checkbox. It was never completed. Two phases later, the vertical slice is declared "shippable" but 83% of enemies render as colored rectangles.

**Takeaway:** Visual placeholders matter more than you think for playtesting. A red rectangle doesn't communicate "Blight Stalker Evolved with DoT" — it communicates "placeholder." Even crude 2-color silhouettes would improve playtest quality. If sprites are deferred, set a hard gate: the slice is not "shippable" until enemies are visually distinguishable.

---

## Patterns Worth Reusing

| Pattern | Where Used | Why It Works |
|---------|-----------|--------------|
| Memory governance (CLAUDE.md + .memory/) | Project root | Cross-session continuity without tooling overhead |
| Canonical event registry | events.js | Prevents ad-hoc string drift, enables validation |
| EventScope | events.js + all systems | Groups subscriptions, prevents leaks on destroy |
| Store mutation boundary | Store.js | Single write path = audit trail + event hooks |
| ComputedStats pure functions | ComputedStats.js | One formula per derived value, zero duplication |
| ModalPanel base class | ui/ModalPanel.js | Shared lifecycle eliminates 100+ lines per panel |
| Stored result pattern | OfflineProgress.js | Producer stores, consumer reads when ready |
| Data-driven triggers | dialogue.js + DialogueManager | Content in data files, logic in systems |
| Phased redesign | Codebase Redesign Plan.md | Always-playable constraint prevents rewrite hell |
| Feature gates | config/features.js | Boolean flags disable systems without deleting code |
| Fresh save namespace on pivot | SaveManager.js | Avoids migration complexity for fundamental model changes |
| Data validator | scripts/validate-data.js | Catches cross-reference and schema bugs at scale |
| Balance simulation | scripts/balance-sim.js | Math-first validation before manual playtesting |
| Authoring conventions | DECISIONS.md | Locked formulas make bulk content authoring systematic |
| Risk identification upfront | Redesign Plan.md | 15 minutes of risk analysis prevents days of firefighting |
| Claude Code skills for derived docs | .claude/skills/ | Regenerable docs never drift; skill = doc production recipe |
| Encounter templates as unit of abstraction | src/data/encounters.js | Composition + pacing + rewards + loot bonuses in one data object |
| Slot containers with local coords | GameScene.js _enemySlots | Move container = move everything; animate locally = no position math bugs |
| Ref-counted animation locks | GameScene.js _lockWalk/_unlockWalk | Multiple concurrent sources can suppress shared animation without jitter |

---

## Meta-Lesson: How the Two Phases Relate

The codebase redesign and the GDD pivot were different kinds of work, but the second was only possible because of the first.

The redesign created **replaceable modules** — Store holds state, ComputedStats derives values, CombatEngine runs combat, LootEngine rolls loot, Progression grants rewards. Each module has a clear API boundary and communicates through events.

The pivot **replaced the internals** of those modules while keeping the boundaries stable. V2 combat formulas went into CombatEngine. V2 stat models went into Store + ComputedStats. V2 loot logic went into LootEngine. The UI code barely changed because it read from the same APIs.

This is the strongest argument for doing architectural cleanup early: **you can't predict what will change, but you can make change cheap.** The redesign didn't know a GDD pivot was coming. It just made the code modular. When the pivot arrived, modularity was the difference between a 7-phase incremental replacement and a full rewrite.

**The lesson is not "always redesign first." The lesson is: if your architecture makes it scary to change one system without breaking others, fix that before adding more systems.** The redesign cost ~9 sessions. The pivot cost ~7 sessions. Without the redesign, the pivot would have cost 15-20+ sessions — and probably would have been abandoned halfway.

---

## What To Do Differently On The Next Project

### From the Redesign
1. **Redesign at phase 3, not phase 8.** Schedule a structural checkpoint after the core loop works.
2. **Tests for math and migrations.** 10 unit tests would catch 80% of the bugs that matter.
3. **Extract GameScene early.** Visual rendering should be split into composable modules (parallax, combat renderer, damage display) before it hits 500 lines.
4. **Don't write migrations pre-release.** Wipe saves during development. Write the first migration when the first real player exists.
5. **Wire it or delete it.** No data entries for unimplemented mechanics. "Deferred" belongs in a TODO, not in the game.
6. **Update ARCHITECTURE.md during the same session as architectural changes.** Treat it like a test — if it's out of date, the change isn't done.
7. **Config-ify visual layout.** Every hardcoded pixel position is a future bug.

### From the Pivot
8. **Write the balance sim before content, not after.** Convention → Sim → Validate → Author. The sim is a development tool, not a QA tool.
9. **Insert a playtest checkpoint after Area 1 is complete.** 15 minutes of play catches what math can't.
10. **Store formulas, not results.** If entities are formula-derived, keep the formula parameterized so convention changes are a one-line fix, not a 48-entity batch update.
11. **Feature gates on day one.** Every non-core system should have a boolean kill switch from inception.
12. **Schedule the dead code cleanup.** Document it in open loops AND schedule a cleanup phase. Documentation without a deadline is just a graveyard with nice headstones.
13. **Sprites before "shippable."** Visual identity matters for playtesting. Colored rectangles undermine feel-testing. Set a visual bar for "shippable" that's higher than "it doesn't crash."
14. **Test any damage path that can silently produce 0.** If a mechanic's failure mode is "deals no damage but nothing crashes," it will fail undetected. These are the highest-priority test candidates.

### From Ongoing Development
15. **Don't piggyback on existing events for different semantics.** Reusing `COMBAT_PLAYER_DAMAGED` with `amount: 0` to trigger HP bar updates from heals caused every handler (enemy lunge, player hit reaction, attack pose) to fire on regen ticks. The "quick fix" created a worse bug than the original problem. When an event implies "the player was attacked," emitting it for heals violates the contract. Either add a dedicated event (`PLAYER_HP_CHANGED`) or guard every handler against the new use case. We chose the guard (`amount.lte(0) → return`) which works but is fragile — any new handler must remember the guard.
16. **Codify regenerable docs as Claude Code skills.** When a reference doc (like `GAME_DATA_REFERENCE.md`) is derived from source files, create a `/skill` slash command that reads all sources and regenerates it. The skill definition captures *which* files to read, *what structure* to output, and *what verification* to run — so the doc never silently drifts from the data. The skill itself is the documentation of how the doc is produced.
17. **Single-file game data references are high-leverage.** A comprehensive markdown file covering all formulas, stats, items, enemies, bosses, and balance sim output in one place eliminates the need to grep across 7+ source files when reasoning about balance or answering design questions. Worth the 10 minutes to regenerate after any data change.
18. **Reversible feature-flag rollouts are safer than direct layout swaps.** Expanding gameplay into the right-side UI space affected every anchored component. Shipping it behind `expandedGameplayLayoutEnabled` with explicit fallback to classic when logs are enabled allowed full implementation plus low-risk rollback. Pattern: for cross-cutting UI changes, ship profile toggles first, then tune behavior.
19. **Layout profile centralization prevents anchor drift.** Defining `CLASSIC_LAYOUT` and `EXPANDED_LAYOUT` in one place was more robust than scene-level branching. Once `LAYOUT` became profile-driven, hardcoded `960/1280` assumptions were easy to detect and remove. Pattern: one authoritative geometry source + grep for magic numbers.
20. **Compile matrix checks catch profile-regression early.** Running builds in all 4 combinations (`logs on/off` x `expanded on/off`) immediately validated activation logic and fallback behavior. Pattern: if two flags interact, treat combinations as a test matrix, not as ad-hoc manual checks.

### From Agility + Dodge Implementation
25. **Contested formulas beat standalone curves for per-enemy differentiation.** The initial plan used `agi / (agi + 150)` — a single-variable curve where only the player's AGI matters. At starter AGI (3), this gives 2% dodge, making DEF strictly dominant. Switching to a contested formula `(acc + bias) / (acc + evadeRating + bias)` where both player AGI and enemy accuracy matter creates emergent archetype identity: fast swarm enemies miss more, heavy brutes land hits reliably. The formula also makes AGI useful from zone 1 without being overpowered at endgame. When adding a defensive stat that should feel different per enemy type, contest it against an enemy stat rather than computing it in isolation.
26. **Auto-deriving missing data from existing fields prevents authoring bottlenecks.** Instead of hand-authoring `accuracy` for all 18 enemies and 30 bosses, the implementation derives accuracy from existing fields (attackSpeed, defense, armorPen, dot) via a heuristic loop. This gets the system functional immediately while leaving room for hand-tuning later. Pattern: add the new field with a sensible auto-derivation default, validate the derived values in the balance sim, then hand-tune outliers. Don't block a feature on complete data authoring.
27. **Decoupling attack animation from hit outcome improves dodge feel.** Adding `COMBAT_ENEMY_ATTACKED` as a separate event from `COMBAT_ENEMY_DODGED` means the enemy lunge animation always plays (the enemy swings), but damage only applies on hit. "DODGE!" text spawns on miss. Without this split, dodged attacks would be invisible — the enemy wouldn't animate and the player wouldn't know they dodged. The visual: enemy swings → "DODGE!" feels much better than enemy doesn't swing → nothing happens.
28. **One-shot timers scheduled during death create race conditions with player-initiated actions.** The player death respawn uses `scheduleOnce` with a delay, but the UI remains interactive during that window. If the player clicks a boss challenge button mid-death, the boss spawns, then the respawn timer fires and unconditionally calls `spawnEnemy()`, overwriting the boss while `BossManager.activeBoss` stays set permanently. Fix requires both: (a) guard the respawn spawn against active boss state, and (b) block the action during the death window. Pattern: any delayed callback that mutates game state must check what happened in the interim, and UI actions that assume a live player must check `isPlayerDead()`.

### From Plan Critique Process (Multi-Enemy + Stances)
29. **Critique plans against the actual codebase, not against the design doc.** Both the Multi-Enemy and Stances plans looked reasonable in isolation but missed critical integration points when compared to the real code. The multi-enemy plan forgot OfflineProgress entirely. The stances plan proposed inserting damage multipliers in two places that would have doubled the effect. A plan written without reading the implementation is a wishlist, not a plan. The critique process (launch parallel research agents to analyze each subsystem, then synthesize) consistently found 6-8 issues per plan that would have been bugs during implementation.
30. **Natural costs beat artificial cooldowns for player commitment.** The stances plan originally proposed a 3-second cooldown between stance switches. During discussion, the user designed something better: no cooldown, but a 0.5s attack pause on each switch. This is a natural cost — your character stops attacking — rather than an artificial one — a greyed-out button with a timer. Natural costs communicate themselves visually (character standing idle) and scale with abuse (rapid cycling = extended vulnerability). Artificial cooldowns just feel like the game is preventing you from playing.
31. **"Three files following the same pattern" beats "one system with three modes."** The stances plan proposed an AbilityManager system to generalize Power Smash, Rapid Strikes, and Bulwark. But each ability is mechanically different: single burst, 5 staggered hits with carry-over, and an absorb shield. A generic `execute()` interface would immediately need ability-specific branches. Three self-contained files following SmashButton's pattern is simpler, more readable, and independently modifiable. Build the abstraction when you have 5+ things that truly share behavior, not 3 things that share a UI pattern but differ mechanically.
32. **Parallel pipelines for display vs combat are intentional, not a bug.** CombatEngine.getPlayerDamage() and ComputedStats.getEffectiveDamage() both apply prestige and territory multipliers independently. This looked like a duplication bug during critique, but it's the correct architecture — one computes actual combat damage (with enemy defense, crits, clicks), the other computes display damage (for StatsPanel, OfflineProgress). When adding new multipliers like stances, they must go in both places, but understanding that they're parallel (not stacked) prevents the double-multiplication bug.

### From Multi-Account Git Setup
15b. **SSH host aliases solve multi-account GitHub permanently.** HTTPS credential managers are OS-dependent and fragile — the wrong cached credential silently pushes to the wrong account. SSH keys with `~/.ssh/config` host aliases (`github-maker`, `github-otter`) bind each repo to an account at the remote URL level. Once set, there's nothing to remember or toggle per-session. The key trick is the host alias in the remote URL (`git@github-maker:` instead of `git@github.com:`) — it routes through the config to the correct key without any credential manager involvement. Set `user.name`/`user.email` per-repo at the same time to ensure commit attribution matches.

### From Multi-Enemy Implementation (Phases 1-14)
33. **Backward-compat gates that are "tested later" become invisible crash bugs.** The `_slotsActive` flag was added as a gate between old single-enemy code and new slot-based code, with the intent of removing the old code in a later cleanup phase. But the flag was never initialized or set to `true` — so the new code was dead and the old code tried to reference objects that no longer existed. The game would crash on the first combat event. If the cleanup hadn't happened in the same session, this would have shipped broken. Pattern: when adding a backward-compat code path, write a test or add an assertion that validates the gate is actually toggled. Or better: don't defer cleanup — remove the old path in the same PR that replaces it.
34. **14-phase plans work when each phase is independently verifiable.** The multi-enemy plan spanned 14 phases across CombatEngine, GameScene, 6 downstream systems, and 2 tooling scripts. It succeeded because each phase had a clear "build passes, game runs" checkpoint. The plan's sequential structure (contracts → data → engine scaffolding → spawn → combat → death → lifecycle → UI slots → rendering → animations → downstream → tooling → tuning → cleanup) meant each phase built on stable foundations. No phase required speculative work — every input was already verified.
35. **Encounter-based architecture simplifies downstream more than expected.** The shift from "one enemy at a time" to "one encounter at a time" simplified LootEngine (lootBonus per encounter template), OfflineProgress (weighted encounter pools), SystemLog (one log per encounter, not per member), and BossManager (threshold on encounter clear, not per kill). The encounter template is the right unit of abstraction for combat — it captures composition, pacing (attackSpeedMult), reward scaling (rewardMult), and loot bonuses in one data object.
36. **Slot containers with local coordinates eliminate position math bugs.** Using Phaser containers for each enemy slot meant all child positions (sprite, rect, HP bar, name) used local coordinates relative to the container origin. Moving a slot = moving the container. Animating a sprite knockback = tweening local x. The only exception was the stalker decapitation head (needs absolute scene coords for tumbling away), which was explicitly handled as a scene-level object in `slot.state.extraObjects`. Without containers, every animation would need absolute coordinate math with slot offsets — a reliable source of subtle position bugs.
37. **Ref-counted walk timer locks prevent animation jitter from concurrent sources.** With multiple enemies attacking on independent timers, naive `walkTimer.paused = true/false` creates visual jitter (rapid pause/unpause). The `_lockWalk()`/`_unlockWalk()` pattern with `_attackLockCount` ensures the walk animation only resumes when ALL concurrent attacks have finished their pose-revert timers. This pattern applies anywhere multiple independent sources need to temporarily suppress a shared animation.

### From TimeEngine Array Mutation Bug
41. **Never splice an array mid-iteration from within a callback.** TimeEngine's `update()` iterates the tickers array backward, but timer callbacks can call `unregister()` (which splices) or `register()` (which splices then pushes). When a timer at a high index kills an enemy and cleans up lower-index encounter timers, the splices shrink the array below the loop variable's value, producing `tickers[i] === undefined`. This was dormant for months because `combat:autoAttack` was usually at index 0 (registered first). Any re-registration (stance switch, equipment change, upgrade purchase) pushed it to the end, making the next enemy kill crash the game. Fix: guard the loop with `if (i >= tickers.length) continue`. Better fix for a future project: use mark-and-sweep (flag dead tickers, sweep after iteration) instead of splicing during iteration. **The general pattern: if a data structure is iterated by an outer loop and mutated by inner callbacks, the mutation must be deferred or the iteration must be bounds-checked every step.**

### From Rapid Strikes + TimeEngine One-Shot Splice Bug
43. **Index-based removal after a callback is wrong if the callback mutates the array.** TimeEngine's one-shot cleanup did `tickers.splice(i, 1)` after the callback, assuming the fired timer was still at index `i`. But the callback (via `_unregisterMemberTimers`) spliced encounter timers at *lower* indices, shifting the fired timer down. The splice removed the wrong element — the *next* rapid strike timer instead of the one that just fired. The stale timer stayed in the array, passed the `elapsed >= interval` check again on the next loop iteration, and fired a second time. In a multi-member encounter (3-rat pack), this cascaded: each re-fire killed the next enemy, triggered more splices, and the stale timer fired 3-4 times in a single frame — one rapid strike acting as an instant wipe. Fix: `tickers.indexOf(t)` finds the timer by object reference after the callback, so the splice always hits the right element regardless of index shifts. **The general pattern: after a callback that may mutate a collection, relocate the element by identity (object reference, unique ID) — never trust a stale index.** This is the second manifestation of the same root cause as lesson 41; the bounds guard caught the "array shrinks below loop variable" case but not the "element shifts to a different index" case.
44. **Cancel ability timers on encounter end, not just on stance switch or death.** Rapid Strikes timers were cancelled on stance switch (leaving Flurry), player death, and destroy — but NOT on encounter end. After the encounter cleared, remaining rapid strike timers survived and would fire into the spawn-delay gap. Normally they whiffed (`hasTarget()` → false), but if timing aligned with the new encounter spawn, they could damage the freshly spawned enemy. Adding `cancelRapidStrikes()` to `_onEncounterEnd` is the belt-and-suspenders fix: even if TimeEngine is perfect, ability timers from a dead encounter should never outlive it.

### From Enemy Traits Visuals
42. **Emitting events without subscribers is silently invisible.** Enemy regen ticked every second internally (modifying `member.hp` correctly), but the HP bar only updated on `COMBAT_ENEMY_DAMAGED` — so regen was mechanically working but visually invisible. The user reported "only one tick" because HP bar jumps only appeared when the next damage event read the updated HP. Lesson: when adding a mechanic that modifies state on a timer, verify that every visual consumer of that state has a subscription to the corresponding event. If the visual only updates on a different event (damage), the mechanic will appear broken despite working correctly. Add visual subscribers in the same phase as the mechanic, not in a later "polish" phase.

### From Multi-Enemy Playtesting Bug Fixes
38. **Ref-counted locks need balanced acquire/release on timer replacement.** The `_lockWalk()`/`_unlockWalk()` pattern (lesson 37) had a subtle leak: when a poseRevertTimer was replaced by a new enemy attack before firing, the old timer's `_unlockWalk()` was lost. The count grew without bound, eventually freezing the walk animation permanently. Fix: call `_unlockWalk()` before removing the old timer, and reset the count to 0 on encounter end as a safety net. Pattern: any ref-counted resource tied to a replaceable timer must release the old count before replacing the timer.
39. **Tween-animated UI children need explicit alpha/position reset on reuse.** Death animations tweened `nameText`, `hpBarBg`, `hpBarFill` alpha to 0 and rect position off-center. When the slot was reused for the next encounter, `container.setAlpha(1)` only set the container's alpha — children kept their individual alpha of 0. Similarly, `killTweensOf(slot.sprite)` didn't kill tweens on the name/HP bar objects. Fix: reset child alpha explicitly in encounter start, and kill tweens on ALL slot children in encounter end, not just sprite/rect.
40. **Guard scene launches behind existence checks.** `this.scene.launch('OverworldScene')` was called unconditionally but the scene wasn't registered when its feature gate was disabled. Phaser doesn't throw but it's a silent error. Any `scene.launch()` for a gated scene should be guarded by `this.scene.get(key)` or the feature flag.

### From the Balance Overhaul
18. **Uniform scaling hides structural problems.** When every enemy stat (HP, ATK, gold, XP) scales at the same rate, TTK curves are flat, rewards grow in lockstep with difficulty, and area transitions collapse. Asymmetric per-stat scaling (one formula change, four parameters) fixes multiple symptoms simultaneously: snowball within areas, rising danger, slower leveling, and gear mattering more. The root cause was one line of code; the symptoms looked like 8 separate issues.
19. **Area transition balance requires explicit calibration, not just scaling.** Zone scaling only controls *within-area* difficulty growth. The *between-area* jump depends entirely on base stats vs. expected player power at arrival. These are fundamentally different problems: scaling is a formula, transitions are data tuning. The sim showed zone 16 enemies were literally unkillable-by (eSurv 25,000x) because their ATK couldn't overcome the player's DEF + regen — no amount of within-area scaling fixes a base stat that's wrong.
20. **Enemy DEF is high-value, low-risk.** Adding DEF to a few armored archetypes creates gear-check moments that reward weapon upgrades, without touching any formula or scaling logic. Pure data change, immediate gameplay impact, zero cascade risk. When looking for safe balance improvements, data-only changes that activate unused formula branches are the best candidates.
21. **Critique the guide before implementing the guide.** The balance guide proposed 8 fixes, several of which were dangerous (halving STR growth cascades through all bosses), overengineered (gold-gated bosses), or design changes disguised as balance fixes (zone regression on death). Writing a critique that separated correct analysis from wrong prescriptions saved significant rework. The critique identified that 8 symptoms shared one root cause (uniform scaling), which the guide missed because it analyzed each issue independently.
22. **Run the sim after every change, not just at the end.** The initial asymmetric scaling change produced a sim with zone 16 eSurv of 25,560x — revealing the area-entry base stat problem immediately. A second sim after enemy calibration confirmed all 30 bosses passing with reasonable survival ratios. Each sim run takes 2 seconds and validates the entire 30-zone progression. There's no reason not to run it after every data change.
23. **Check Store field paths before referencing state in new code.** SmashButton's level-3 unlock gate checked `state.playerLevel` (nonexistent) instead of `state.playerStats.level`. The button was invisible with zero errors because `undefined >= 3` is `false`. When adding new UI that reads Store state, always verify the exact field path in Store.js first — silent `undefined` comparisons are a common failure mode.
24. **Cooldown-based abilities must recalculate on mid-cooldown upgrades.** The initial SmashButton set `_cooldownEnd` once on use. Buying a recharge upgrade mid-cooldown had no effect until the next use — confusing for the player who just spent gold. Fix: track `_cooldownStart`, listen for `UPG_PURCHASED`, and recalculate `_cooldownEnd = _cooldownStart + newCooldownMs`. If the new end is in the past, clear the cooldown entirely. This applies to any ability with an upgradeable timer.

### From Enemy Roster Redesign (Phases 5-7)
45. **Runtime encounter mutation needs first-class events, not assumptions.** Existing rendering assumed encounter members only arrive in `COMBAT_ENCOUNTER_STARTED`. Summoning breaks that assumption. Adding `COMBAT_MEMBER_ADDED` plus explicit cast lifecycle events (`COMBAT_ENEMY_CASTING`, `COMBAT_INTERRUPTED`) made runtime adds deterministic and debuggable. Pattern: if data can change after initialization, model it as a lifecycle event with a stable contract.
46. **Centralized layout ownership scales better than per-component visibility logic.** Two action buttons per stance made independent button classes collide. Moving slot ownership to `UIScene` (`_stanceActions` map + fixed Slot A/Slot B positions) turned a brittle distributed rule set into one clear source of truth. Pattern: when multiple UI elements share position and state, put orchestration in one parent scene/controller.
47. **Summons require explicit economy policy or they become farm loops.** Mechanically correct summoning still creates progression exploits unless reward rules are deliberate. Making adds progression-neutral by default (`summonedAddRewardMult: 0`, no loot bonus for add kills) prevents runaway gold/xp farming while preserving encounter pressure. Pattern: any renewable enemy generator must define reward semantics before shipping.
48. **"Unit-ish" Node harnesses are high leverage for combat systems.** A lightweight script (`npm run verify:combat`) caught exactly the risky edges for this phase: payload shape contracts, summon slot/max-add caps, interrupt cancellation, armor-break expiry, corruption clamp/cleanse restore. Pattern: for event-and-timer-heavy gameplay code, a small deterministic harness gives most of the value of formal tests with minimal setup overhead.

### From Balance GUI (Player Tab)
49. **`var` in `for` loops creates silent closure bugs in UI builders.** `buildZones()` used `for(var z=...)` with closures in `mkCell` callbacks. After the loop, all slider getters/setters referenced `z=31` (post-loop value). Initial display was correct (sync evaluation), but runtime slider interaction silently wrote to `balance[31]` — never saved because `cleanZones()` only iterates 1-30. The `dblclick`/`contextmenu` handlers in the same loop used IIFEs correctly, masking the inconsistency. Fix: wrap closures in an IIFE `(function(zz){...})(z)`. Pattern: any `for(var` loop with async callbacks needs IIFE capture or conversion to `.forEach()`.

### From Onboarding + Scene Flow Fixes
50. **Multi-step tutorials need persisted stage state, not only transient UI state.** The enhancement tutorial crossed popup, top-bar, and inventory systems. A single "shown" boolean was not enough to drive progression reliably. Explicit staged flags (`button`, `slot`, `enhance`, `done`) made the flow resumable and deterministic when panels reopened or refresh events fired.
51. **When chaining popups, arm downstream state at the earliest reliable dismiss point.** The inventory pulse occasionally failed because it depended on a follow-up popup dismiss event. Setting tutorial stage on first popup dismiss made the guidance robust even if secondary dismiss events were delayed or missed.
52. **Scene transitions triggered inside UI callbacks should prefer ScenePlugin flow and a fallback.** Direct SceneManager stop/start calls from Settings interactions caused freeze states. Closing the modal first, using ScenePlugin scene operations, and adding a short fallback reload prevents soft-locks during quit-to-main-menu.
53. **Boot-time debug visuals and synchronous preprocessing are expensive UX debt.** A forced splash delay plus runtime texture downscale created slow startup and noisy "Phase 0 Complete" flashes. Starting the menu immediately after preload improved perceived performance more than any micro-optimization in gameplay code.

### From Demo Endpoint + Slimefang Finale
54. **Final-boss handoff timing must respect death-animation duration.** Triggering end-state UI on boss-defeated events can cut/freeze long bespoke death animations. For Slimefang, delaying `BossManager.onBossDefeated()` to match the 10s death sequence preserved the intended dramatic payoff. Pattern: if the endpoint UX depends on a visual sequence, gate state transition timing to that sequence instead of the generic kill path.
55. **Boss-specific config is easy to misapply when nearby entries are similar.** Timed-enrage config was initially applied to Ragefang (Zone 3) instead of Slimefang (Zone 5), causing "missing timer" and "never expires" symptoms. Pattern: after adding boss-specific behavior, verify the exact `id` entry in data plus runtime mapping (`globalZone -> boss id`) before debugging engine/UI.
56. **Demo locks should be explicit, persisted, and UI-visible.** A clean vertical slice endpoint needed three layers: persisted `demoCompleted` flag, runtime gameplay gate (no more normal spawns/progression), and a clear full-screen completion surface. Any one layer alone feels buggy; all three together feel intentional.
57. **Scene-local media ownership creates transition bugs; shared managers prevent them.** When `GameScene` owned soundtrack creation/destruction, starting from menu and transitioning into gameplay naturally restarted or cut audio. Moving BGM lifecycle to a singleton (`MusicManager`) and letting scenes only "ensure playing" makes transitions idempotent and removes duplicate autoplay fallback logic.
58. **Startup ambiguity feels like a freeze even when everything is functioning.** Preload-heavy Phaser boots need immediate user-visible feedback. A minimal loading overlay (title + progress bar + percent) dramatically improves perceived responsiveness and reduces "did it hang?" confusion without changing actual load time.

### From Speed Semantics + Skill Bonus Clarification
59. **Treat editor constraints and runtime constraints as two independent safety layers.** Clamping speed values only in the balance GUI is not enough when data can also be hand-edited or loaded from older files. The robust fix required both UI sanitization (`>= 0.01`) and runtime guards in stat-bias resolution plus combat member construction.
60. **Ambiguous "increases by X%" wording causes immediate implementation drift.** Bigger Swigs initially shipped with a formula that technically increased healing, but not in the exact way the player intended. Explicitly defining expected checkpoints (Lv0, Lv1, LvMax) is faster than arguing formula semantics. If the checkpoints are stated, derive the formula from them.
61. **Encounter reflow can silently undo spawn-time visual tweaks.** A slot offset that is applied only on spawn but not on reflow will appear inconsistent as soon as members are added/removed. Any positional override must live in shared layout helpers used by both initial spawn and subsequent reflow passes.

