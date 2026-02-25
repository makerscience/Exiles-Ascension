# Plan: Skill Points + Equipment Enhancement System (Revised)

## Goal
Split progression into two currencies:
1. Skill Points (SP) for standard upgrades (1 SP per level-up).
2. Gold for per-slot equipment enhancement.

## Phase 1: Schema + Migration (authoritative)
Files: src/config.js, src/systems/SaveManager.js, src/systems/Store.js

- Bump SAVE.schemaVersion to 2.
- Add SaveManager migration v2:
  - Initialize skillPoints if missing:
    - totalEarned = max(level - 1, 0)
    - spentOnStandard = sum(levels of 6 standard upgrades)
    - skillPoints = max(totalEarned - spentOnStandard, 0)
  - Initialize enhancementLevels map (0 defaults) for:
    - head, chest, main_hand, legs, boots, gloves, amulet
  - Exclude waterskin.
- Store.createInitialState():
  - add skillPoints: 0
  - add enhancementLevels for allowed slots
- Store.hydrateState():
  - load skillPoints + enhancementLevels
- Store.applyLevelUp():
  - grant +1 skillPoints
- Add Store methods:
  - addSkillPoints(n), spendSkillPoints(n)
  - getEnhancementLevel(slotId), incrementEnhancementLevel(slotId)

## Phase 2: Convert standard upgrades to SP
Files: src/data/upgrades.js, src/systems/UpgradeManager.js

- For these 6 upgrades:
  - sharpen_blade
  - battle_hardening
  - auto_attack_speed
  - gold_find
  - power_smash_damage
  - power_smash_recharge
- Set currency: 'skillPoints'
- Set costFormula: () => 1
- Keep exploit upgrades on glitchFragments.
- UpgradeManager:
  - canPurchase(): support skillPoints check
  - purchase(): spend skillPoints via Store

## Phase 3: Enhancement system
Files: src/systems/EnhancementManager.js (new), src/events.js

Rules:
- maxLevel: 10
- bonusPerLevel: 0.05
- costGrowth: 1.5
- baseCosts:
  - early (head/chest/main_hand): 50
  - mid (legs/boots): 100
  - late (gloves/amulet): 200
- non-enhanceable: waterskin + legacy inactive slots

API:
- getLevel(slotId), getCost(slotId), getBonusMultiplier(slotId)
- canEnhance(slotId): equipped item + enough gold + below max + allowed slot
- enhance(slotId): spend gold, increment level, emit event

Events:
- Add ENHANCE_PURCHASED: 'enhance:purchased'
- Contract keys: ['slotId', 'level', 'cost']

## Phase 4: Wire enhancement into computed stats
File: src/systems/ComputedStats.js

- Update getEquipmentStatSum(statKey):
  - iterate Object.entries(state.equipped)
  - use slotId to apply EnhancementManager.getBonusMultiplier(slotId)
  - skip null/non-enhanceable slots naturally (multiplier 1)

## Phase 5: UI updates
Files: src/ui/UpgradePanel.js, src/ui/InventoryPanel.js

UpgradePanel:
- Rename title/button text to SKILLS
- Show Skill Points: X
- Cost label shows 1 SP for SP upgrades

InventoryPanel:
- Add +N enhancement badge on equipped slot boxes
- Change equipped-item interaction model:
  - primary click opens equipped item details (Enhance + Unequip)
  - shift-click (or right-click) quick-unequip
- In equipped item details show:
  - enhancement level
  - bonus %
  - next cost / maxed state
  - ENHANCE button with disabled reasons
- Subscribe refresh to ENHANCE_PURCHASED

## Phase 6: Verification
- npm run build
- Migration cases:
  - old save, no standard upgrades
  - old save, partial standard upgrades
  - old save, heavy upgrades (SP clamps to 0)
- Level up grants +1 SP
- SP purchase spends exactly 1 SP
- Enhancement spends gold, caps at 10
- Waterskin enhancement blocked
- Slot enhancement persists across gear swap
- Drag/sell/equip behavior in inventory still works
- npm run verify:combat
