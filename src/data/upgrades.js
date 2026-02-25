// Upgrade definitions — purchasable stat boosts (legit = gold, exploit = fragments).

const UPGRADES = [
  // ── Legit (gold cost) ─────────────────────────────────────────────
  {
    id: 'sharpen_blade',
    name: 'Sharpen Blade',
    description: '+10% click damage per level',
    category: 'legit',
    currency: 'skillPoints',
    maxLevel: 10,
    costFormula: () => 1,
    effect: { type: 'multiplier', target: 'clickDamage', valuePerLevel: 0.10 },
  },
  {
    id: 'battle_hardening',
    name: 'Battle Hardening',
    description: '+2 STR per level',
    category: 'legit',
    currency: 'skillPoints',
    maxLevel: 10,
    costFormula: () => 1,
    effect: { type: 'flat', target: 'str', valuePerLevel: 2 },
  },
  {
    id: 'auto_attack_speed',
    name: 'Auto-Attack Speed',
    description: '-10% auto-attack interval per level',
    category: 'legit',
    currency: 'skillPoints',
    maxLevel: 5,
    costFormula: () => 1,
    effect: { type: 'multiplier', target: 'autoAttackSpeed', valuePerLevel: 0.10 },
  },
  {
    id: 'gold_find',
    name: 'Gold Find',
    description: '+15% gold drops per level',
    category: 'legit',
    currency: 'skillPoints',
    maxLevel: 10,
    costFormula: () => 1,
    effect: { type: 'multiplier', target: 'goldMultiplier', valuePerLevel: 0.15 },
  },

  // ── Power Smash ─────────────────────────────────────────────────
  {
    id: 'power_smash_damage',
    name: 'Power Smash Damage',
    description: '+0.5x smash damage per level',
    category: 'legit',
    currency: 'skillPoints',
    maxLevel: 8,
    costFormula: () => 1,
    effect: { type: 'multiplier', target: 'powerSmashDamage', valuePerLevel: 0.5 },
  },
  {
    id: 'power_smash_recharge',
    name: 'Power Smash Recharge',
    description: '-10% smash cooldown per level',
    category: 'legit',
    currency: 'skillPoints',
    maxLevel: 5,
    costFormula: () => 1,
    effect: { type: 'multiplier', target: 'powerSmashCooldown', valuePerLevel: 0.10 },
  },

  // ── Exploit (fragment cost, visible after crackTriggered) ─────────
  {
    id: 'unstable_crit',
    name: 'Unstable Crit',
    description: '+5% crit chance per level',
    category: 'exploit',
    currency: 'glitchFragments',
    maxLevel: 5,
    costFormula: (level) => Math.floor(3 * 2 ** level),
    effect: { type: 'flat', target: 'critChance', valuePerLevel: 0.05 },
  },
  {
    id: 'memory_leak',
    name: 'Memory Leak',
    description: '+25% gold multiplier per level',
    category: 'exploit',
    currency: 'glitchFragments',
    maxLevel: 5,
    costFormula: (level) => Math.floor(5 * 2 ** level),
    effect: { type: 'multiplier', target: 'goldMultiplier', valuePerLevel: 0.25 },
  },
];

const upgradeMap = new Map(UPGRADES.map(u => [u.id, u]));

export function getUpgrade(id) {
  return upgradeMap.get(id) ?? null;
}

export function getUpgradesByCategory(category) {
  return UPGRADES.filter(u => u.category === category);
}

export function getAllUpgrades() {
  return UPGRADES;
}
