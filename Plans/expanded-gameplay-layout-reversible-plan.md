# Reversible Expanded Gameplay Layout Plan

## Objective

Introduce a reversible layout mode that expands gameplay/UI usage into the right-side space currently occupied by `SystemDialogue` and `SystemLog`, while preserving an easy rollback path.

This plan is designed to:
- Keep current behavior intact by default.
- Enable A/B comparison using feature flags.
- Minimize risk by implementing in small, testable steps.

## Scope

In scope:
- Feature-flagged layout profile selection.
- Expansion of gameplay region and bottom bar when logs are hidden.
- Anchor and positioning cleanup for components that assume fixed 960px gameplay width.
- Validation in both old and new modes.

Out of scope:
- New UI art/theme overhaul.
- Combat rebalance.
- Mobile/responsive redesign beyond current behavior.

## Current State Summary

- Canvas is `1280x720`.
- `LAYOUT.gameArea` is `960x670` and `LAYOUT.bottomBar` is `960x50`.
- Right-side `320px` region is used by:
  - `SystemDialogue` (`dialoguePanel`)
  - `SystemLog` (`logPanel`)
- Logs are already feature-gated by `FEATURES.systemLogsEnabled`.
- Several components still rely on fixed values (`960`, `1280`) and need normalization.

## Reversible Strategy

Two independent toggles:

1. `systemLogsEnabled`
   - Controls whether dialogue/log panels are shown.

2. `expandedGameplayLayoutEnabled` (new)
   - Controls whether gameplay/bottom-bar layout expands into right-side space.
   - Expansion only activates when logs are disabled.

Activation logic:
- `expandedLayoutActive = expandedGameplayLayoutEnabled && !systemLogsEnabled`

Rollback:
- Set `expandedGameplayLayoutEnabled = false` to immediately return to classic layout.
- Optionally set `systemLogsEnabled = true` to restore legacy right-panel logs.

## Implementation Steps

## Step 1: Add New Feature Flag

File:
- `src/config/features.js`

Changes:
- Add `expandedGameplayLayoutEnabled` boolean.
- Default value: `false`.

Acceptance criteria:
- Build compiles with no behavior change in default configuration.

## Step 2: Introduce Dual Layout Profiles

File:
- `src/config/layout.js`

Changes:
- Define two layout profiles:
  - `CLASSIC_LAYOUT`: current values.
  - `EXPANDED_LAYOUT`: full-width gameplay and bottom bar.
- Compute and export active `LAYOUT` based on:
  - `FEATURES.expandedGameplayLayoutEnabled`
  - `FEATURES.systemLogsEnabled`
- Keep `dialoguePanel` and `logPanel` values available (for classic/log mode).

Suggested expanded values:
- `gameArea`: `{ x: 0, y: 50, w: 1280, h: 670 }`
- `bottomBar`: `{ x: 0, y: 670, w: 1280, h: 50 }`
- `zoneNav.centerX`: `gameArea.x + gameArea.w / 2`

Acceptance criteria:
- Existing imports of `LAYOUT` continue to work without callsite changes.
- Classic mode remains pixel-identical.

## Step 3: Normalize Hardcoded Width Anchors

Files:
- `src/ui/SettingsPanel.js`
- `src/ui/InventoryPanel.js`

Changes:
- Replace fixed `960` assumptions with `LAYOUT.gameArea`/`LAYOUT.bottomBar`-derived values.
- Replace fixed `1280` bounds checks with `WORLD.width`.

Known targets:
- `SettingsPanel` toggle button `buttonX: 960 - 60` -> dynamic from active layout.
- `InventoryPanel` tooltip/popup edge clamp using `1280` -> `WORLD.width`.

Acceptance criteria:
- UI controls remain aligned in classic mode.
- No clipping/offscreen tooltips in expanded mode.

## Step 4: Expand Combat Staging Anchors Safely

File:
- `src/scenes/GameScene.js`

Changes:
- Convert fixed combat X anchors to ratios of active game area width:
  - Player X anchor (`_playerX`)
  - Enemy X anchor (`_enemyX`)
  - Any dependent spacing assumptions tied to classic width
- Keep Y positions unchanged unless overlap appears.

Suggested ratios (starting point):
- Player X ~= `ga.x + ga.w * 0.21`
- Enemy X ~= `ga.x + ga.w * 0.73`

Acceptance criteria:
- Combat readability preserved in classic mode.
- In expanded mode, entities are not cramped to left side.
- Enemy encounter spread still looks natural for 1-5 enemies.

## Step 5: Re-anchor UIScene Combat Controls

File:
- `src/scenes/UIScene.js`

Changes:
- Review placement for:
  - Stance switcher
  - Skill action slots
  - Corruption indicator
  - Zone nav center reference
- Ensure all coordinates derive from `LAYOUT.gameArea`.
- Preserve current relative visual hierarchy.

Acceptance criteria:
- Controls remain coherent in classic mode.
- Controls do not look left-compressed in expanded mode.
- No overlap with top bar, bottom bar, or each other.

## Step 6: Preserve Logs Behavior and Isolation

Files:
- `src/scenes/UIScene.js` (existing log gating already present)
- `src/config/layout.js`

Changes:
- Ensure expanded layout only activates when logs are disabled.
- If logs are enabled, force classic layout regardless of expanded flag.

Acceptance criteria:
- `systemLogsEnabled=true` always restores right-side log panels and classic layout behavior.

## Step 7: Verification Matrix

Run all four combinations:

1. `systemLogsEnabled=true`, `expandedGameplayLayoutEnabled=false`
   - Expected: classic baseline.

2. `systemLogsEnabled=false`, `expandedGameplayLayoutEnabled=false`
   - Expected: current no-log behavior with unused right space.

3. `systemLogsEnabled=false`, `expandedGameplayLayoutEnabled=true`
   - Expected: expanded gameplay/bottom bar usage across full width.

4. `systemLogsEnabled=true`, `expandedGameplayLayoutEnabled=true`
   - Expected: classic layout (expanded suppressed by logs enabled).

Validation checklist:
- Start screen -> game transition works.
- Combat scene renders correctly.
- UI controls remain interactive.
- Modals center correctly.
- No text/input clipping at right edge.
- Save/load/new game flows unchanged.

## Step 8: Rollback Procedure

Immediate rollback:
1. Set `expandedGameplayLayoutEnabled = false`.
2. Rebuild/run.

Full legacy restoration:
1. Set `systemLogsEnabled = true`.
2. Keep `expandedGameplayLayoutEnabled = false`.

No code deletion required for rollback.

## Risk Notes

Primary risks:
- Hidden fixed constants in UI files causing drift in expanded mode.
- Combat staging looking too sparse or too compressed after width expansion.
- Modal/backdrop assumptions tied to game area dimensions.

Mitigations:
- Implement in sequence above and test after each step.
- Keep ratio-based anchors centralized in `GameScene` for fast tuning.
- Avoid touching gameplay logic/state flow during layout pass.

## Deliverables

Code deliverables:
- New feature flag in `features.js`.
- Layout profile system in `layout.js`.
- Anchor normalization in affected UI/scene files.

Testing deliverables:
- Verification against the 4-mode matrix above.
- Build success confirmation.

## Definition of Done

Done when:
- Expanded mode is togglable via one feature flag.
- Logs mode is independently togglable.
- Both modes render correctly and are reversible without code edits.
- No regressions in combat, UI interaction, or save/load flows.
