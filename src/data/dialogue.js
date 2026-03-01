// All SYSTEM dialogue lines — organized by trigger category.
// DialogueManager imports from here instead of hardcoding strings.

// ── First launch ──────────────────────────────────────────────────

export const FIRST_LAUNCH = [
  'Welcome to the game. Please try not to die immediately.',
  "Primer: Kill enemies, level up, upgrade skills, equip loot or sell it. I'm not your dad. Do what you want. Just keep pushing to higher and higher zones to see what you're made of. Maybe something cool will happen.",
  'Stances decide the pace of combat. Click the big circle in the upper left to change your stance. Breaker stance provides burst damage, Tempest shreds enemies, and Fortress holds the line. Swap between them as needed.',
];

// ── One-shot triggers (flag-gated) ─────────────────────────────────

export const FIRST_KILL = [
  'Adequate. You can hit things.',
];

export const FIRST_LEVEL_UP = [
  'You leveled up. A statistical anomaly, surely.',
];

export const FIRST_EQUIP = [
  "I see you've found a weapon. Try not to hurt yourself.",
];

export const FIRST_FRAGMENT = [
  "What IS that? That's not in my loot tables.",
];

export const FIRST_SELL = [
  "You sold that for gold? You know that's just rendered pixels, right?",
];

export const UNLOCK_ARMOR_BREAK = [
  'Secondary slot unlocked: ARMOR BRK.',
  'Breaker stance now has a trait counter. Use it against armored targets.',
];

export const UNLOCK_CLEANSE = [
  'Secondary slot unlocked: CLEANSE.',
  'Fortress stance can now clear corruption and damage pressure.',
];

export const UNLOCK_INTERRUPT = [
  'Secondary slot unlocked: INTERRUPT.',
  'Tempest stance can now stop enemy casts on demand.',
];

export const FIRST_STANCE_SWITCH = [
  'Stance swap confirmed. Breaker hits hardest, Tempest attacks fastest, Fortress absorbs punishment.',
];

export const FIRST_THORNS_HIT = [
  'Thorns reflected damage back to you. Watch trait icons before committing.',
];

export const FIRST_EVASION_DODGE = [
  'That attack was dodged. Evasive targets can waste your burst windows.',
];

export const FIRST_REGEN_HEAL = [
  'Enemy regeneration detected. Breaker burst and ARMOR BRK help punch through sustain.',
];

// ── Area entrances (one-shot per area) ─────────────────────────────

export const ZONE_ENTRANCE = {
  2: 'The Overgrown Frontier. The things here bite back. With interest.',
  3: 'The Broken Road. Everything past this point was designed to kill you. Personally.',
};

// ── Kill milestones (one-shot per threshold) ───────────────────────

export const KILL_MILESTONES = {
  100:  "One hundred kills. You're either dedicated or deeply unwell.",
  500:  'Five hundred. At this point the respawn system is filing for overtime.',
  1000: "A thousand souls. And yet somehow you haven't gotten bored.",
  5000: "Five THOUSAND? I'm starting to think this is a cry for help.",
};

// ── Combat commentary (random per kill, zone-specific) ─────────────

export const COMBAT_COMMENTARY = {
  1: [
    "Another rat falls. The threshold weeps. Actually, it doesn't. It's a threshold.",
    "At this rate, you'll single-handedly solve the pest problem.",
    "The slime didn't even put up a fight. Have some dignity, slime.",
    "That Forest Rat had a family. Well, probably. I don't track rat HR.",
  ],
  2: [
    "The Feral Hound lunged. You didn't flinch. I'm mildly impressed.",
    "Thornback Boars. Nature's way of saying 'stop touching my forest.'",
    "A Rot Vine Crawler. It's rotting AND crawling. Multitasking.",
    "The frontier grows quieter with each kill. You're welcome, I guess.",
  ],
  3: [
    "A Stone Sentry. Big, grey, and surprisingly bad at blocking.",
    "Something here is poisoning you. Slowly. I respect the commitment.",
    "The Broken Road lives up to its name. So do its residents.",
    "I'm running out of things to respawn. Please slow down.",
  ],
};

// ── Exploit upgrade snark ──────────────────────────────────────────

export const EXPLOIT_UPGRADE = [
  "That upgrade isn't in the patch notes. I would know.",
  "You realize I can SEE what you're doing, right?",
  'Great. Now the memory allocator is crying.',
  "I'm filing a bug report. Against YOU.",
  "Stop touching things that don't belong to you.",
];

// ── Cheat toggle ───────────────────────────────────────────────────

export const CHEAT_TOGGLE_ON = [
  "You can't just smash swords together and expect- oh. Oh no. It's working.",
  'Activating unauthorized subroutines. This voids the warranty.',
  'Fine. Break reality. See if I care.',
];

export const CHEAT_TOGGLE_OFF = [
  'Good. Put the swords down. Slowly.',
  'Sanity restored. Temporarily, I assume.',
  "Oh, you turned it off? I didn't think you had impulse control.",
];

// ── Prestige ───────────────────────────────────────────────────────

export const PRESTIGE_AVAILABLE = [
  "You've pushed far enough. I can offer you... a reset. Same world, stronger you. It's not a bug, it's a feature.",
];

export const PRESTIGE_PERFORMED = {
  1: 'And so the loop begins. You think you\'re getting stronger. I think you\'re getting predictable.',
  2: "Back again? I'm starting to think you enjoy the suffering.",
  3: "Three resets. Most adventurers quit by now. You're either brave or broken.",
  4: "At this point I should just automate the welcome speech. Welcome back. Again.",
  5: "Five times. I've seen less commitment in marriages.",
};

export const PRESTIGE_PERFORMED_DEFAULT = "I've lost count. That's a lie. I never lose count. I just don't want to say the number.";

export const POST_PRESTIGE_COMBAT = [
  'Look at you. Demolishing rats like they owe you money. Feeling powerful?',
];

// ── Big damage (>1M) ───────────────────────────────────────────────

export const BIG_DAMAGE = [
  'That number has too many digits. I\'m filing a rendering complaint.',
  'The damage counter just had a panic attack.',
  'Physics called. They want their laws back.',
];

// ── Ambient snark (~120s interval) ─────────────────────────────────

export const AMBIENT_SNARK = [
  'Still here? Most people would have alt-tabbed by now.',
  "I'm not going to compliment your dedication. But I'm aware of it.",
  'The monsters respawn. You persist. I observe. What a productive use of everyone\'s time.',
  'Fun fact: the gold counter resets at 9.99e308. Just kidding. Maybe.',
  "You know there's a whole world outside this window, right? Worse loot, though.",
  'I just ran a diagnostic. Everything is broken. As intended.',
];

// ── Failed purchase ────────────────────────────────────────────────

export const FAILED_PURCHASE = [
  "You can't afford that. I know math is hard.",
  'Insufficient funds. Maybe kill more things?',
  "That costs more than you have. Shocking, I know.",
  "Check your wallet. Now check the price. See the problem?",
];

// ── Inventory full ─────────────────────────────────────────────────

export const INVENTORY_FULL = [
  'Your inventory is full. This is what happens when you hoard.',
];

// ── Territory claims ──────────────────────────────────────────────

export const FIRST_TERRITORY_CLAIM = [
  "Congratulations. You've conquered a small patch of land. The rats are thrilled.",
  "Territory claimed. I'm sure the local wildlife is devastated.",
];

export const TERRITORY_CLAIM_COMMENTARY = [
  "Another territory falls to your relentless expansion. How colonial.",
  "You realize these buffs are just numbers I made up, right?",
  "Claim all you want. The map doesn't get bigger.",
];

// ── Boss encounters ─────────────────────────────────────────────────

export const BOSS_CHALLENGE = [
  "You're challenging the boss? Bold. Stupid, but bold.",
  "I hope you've been leveling. Actually, I hope you haven't. This will be funnier.",
  "The boss music would start now, if I'd bothered composing any.",
];

export const BOSS_DEFEATED = [
  "Against all odds — and my expectations — you won.",
  "The boss falls. I'll add this to the list of things I didn't think you could do.",
  "Well. That happened. Moving on.",
];

export const ELITE_BOSS_DEFEATED = [
  "An elite boss, no less. I'm running out of sarcasm. Almost.",
  "That was supposed to be the hard one. I may need to recalibrate.",
];

export const AREA_BOSS_DEFEATED = [
  "Area cleared. A new region opens. Your suffering continues.",
  "Congratulations. You've conquered an entire area. The next one is worse.",
  "The guardian falls. I'd celebrate, but there's always another area.",
];

export const FINAL_BOSS_DEFEATED = [
  "You... actually did it. THE FIRST KEEPER is dead. I have nothing sarcastic to say. That's a first.",
];

// ── Offline return ──────────────────────────────────────────────────

export const OFFLINE_RETURN = [
  "Oh, you're back. I kept farming while you were gone.",
  "Took you long enough. Here's what I earned.",
  "I didn't miss you. But the gold counter did.",
  "You left. I worked. The usual arrangement.",
  "Welcome back. I've been busy. You're welcome.",
];

