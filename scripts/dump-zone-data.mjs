#!/usr/bin/env node

import { ENEMIES } from '../src/data/enemies.js';
import { BOSSES } from '../src/data/bosses.js';

console.log(JSON.stringify({
  enemies: ENEMIES.map((e) => ({
    id: e.id,
    name: e.name,
    zones: e.zones,
    hp: e.hp,
    attack: e.attack,
    defense: e.defense,
    attackSpeed: e.attackSpeed,
    regen: e.regen ?? 0,
    goldDrop: e.goldDrop,
    xpDrop: e.xpDrop,
  })),
  bosses: BOSSES.map((b) => ({ id: b.id, name: b.name, zone: b.zone, bossType: b.bossType })),
}));
