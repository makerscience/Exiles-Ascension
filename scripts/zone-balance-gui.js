#!/usr/bin/env node

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AREAS_PATH = path.join(ROOT, 'src', 'data', 'areas.js');
const BALANCE_PATH = path.join(ROOT, 'src', 'data', 'balance.js');
const CONFIG_PATH = path.join(ROOT, 'src', 'config.js');
const SIM_PATH = path.join(ROOT, 'scripts', 'balance-sim.js');
const DUMP_PATH = path.join(__dirname, 'dump-zone-data.mjs');
const PORT = 3001;

const AREA_MAP = [
  { id: 1, name: 'The Whispering Woods', zones: [1, 10] },
  { id: 2, name: 'The Blighted Mire', zones: [11, 20] },
  { id: 3, name: 'The Shattered Ruins', zones: [21, 35] },
];
const TOTAL_ZONES = 35;

function parseZoneBalance(fileText) {
  const out = {};
  const m = fileText.match(/export const ZONE_BALANCE = \{([\s\S]*?)\n\};/);
  if (!m) return out;
  const re = /(\d+):\s*\{([^}]*)\}/g;
  let em;
  while ((em = re.exec(m[1])) !== null) {
    const zone = parseInt(em[1], 10);
    const stats = {};
    const kvRe = /(\w+):\s*([+-]?\d+(?:\.\d+)?)/g;
    let kv;
    while ((kv = kvRe.exec(em[2])) !== null) {
      const stat = kv[1];
      const raw = parseFloat(kv[2]);
      stats[stat] = (stat === 'speed' && Number.isFinite(raw)) ? Math.max(0.01, raw) : raw;
    }
    if (Object.keys(stats).length) out[zone] = stats;
  }
  return out;
}

function parseZoneScaling(fileText) {
  const out = {};
  const m = fileText.match(/export const ZONE_SCALING = \{([\s\S]*?)\};/);
  if (!m) return out;
  const kvRe = /(\w+):\s*([+-]?\d+(?:\.\d+)?)/g;
  let kv;
  while ((kv = kvRe.exec(m[1])) !== null) out[kv[1]] = parseFloat(kv[2]);
  return out;
}

function parseNormalDropChance(fileText) {
  const m = fileText.match(/normalDropChance:\s*([+-]?\d+(?:\.\d+)?)/);
  if (!m) return 0.10;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : 0.10;
}

function formatZoneBlock(balance) {
  const lines = Object.keys(balance).map(Number).sort((a, b) => a - b).map((z) => {
    const pairs = Object.entries(balance[z]).filter(([, v]) => Math.abs(v - 1) > 0.0001)
      .map(([k, v]) => `${k}: ${parseFloat(v.toFixed(2))}`).join(', ');
    return pairs ? `  ${z}: { ${pairs} },` : null;
  }).filter(Boolean);
  return lines.length ? `{\n${lines.join('\n')}\n}` : '{\n}';
}

function saveZoneBalance(balance) {
  const text = fs.readFileSync(AREAS_PATH, 'utf8');
  const updated = text.replace(
    /export const ZONE_BALANCE = \{[\s\S]*?\n\};/,
    `export const ZONE_BALANCE = ${formatZoneBlock(balance)};`,
  );
  fs.writeFileSync(AREAS_PATH, updated, 'utf8');
}

function parseEntityBalance(fileText, mapName) {
  const out = {};
  const m = fileText.match(new RegExp(`export const ${mapName} = \\{([\\s\\S]*?)\\n\\};`));
  if (!m) return out;
  const re = /['"]([^'"]+)['"]:\s*\{([^}]*)\}/g;
  let em;
  while ((em = re.exec(m[1])) !== null) {
    const stats = {};
    const kvRe = /(\w+):\s*([+-]?\d+(?:\.\d+)?)/g;
    let kv;
    while ((kv = kvRe.exec(em[2])) !== null) {
      const stat = kv[1];
      const raw = parseFloat(kv[2]);
      stats[stat] = (stat === 'speed' && Number.isFinite(raw)) ? Math.max(0.01, raw) : raw;
    }
    if (Object.keys(stats).length) out[em[1]] = stats;
  }
  return out;
}

function formatEntityBalance(map, mapName) {
  const lines = Object.keys(map).sort().map((id) => {
    const pairs = Object.entries(map[id]).filter(([, v]) => Math.abs(v - 1) > 0.0001)
      .map(([k, v]) => `${k}: ${parseFloat(v.toFixed(2)).toFixed(2)}`).join(', ');
    return pairs ? `  '${id}': { ${pairs} },` : null;
  }).filter(Boolean);
  return `export const ${mapName} = {\n${lines.join('\n')}\n};`;
}

function scaffoldBalanceFile() {
  return `// Per-entity stat multipliers applied on top of zone scaling.
// Sparse map format: { entityId: { stat: multiplier } }
// Missing entity/stat defaults to 1.0.

export const ENEMY_BALANCE = {
};

export const BOSS_BALANCE = {
};

export const LOOT_BALANCE = {
  areaDropRate: {},
  zoneDropRate: {},
};

export function getEnemyBias(enemyId, stat) {
  return ENEMY_BALANCE[enemyId]?.[stat] ?? 1.0;
}

export function getBossBias(bossId, stat) {
  return BOSS_BALANCE[bossId]?.[stat] ?? 1.0;
}

export function getAreaDropRate(areaId, fallback) {
  const v = LOOT_BALANCE.areaDropRate?.[areaId];
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
}

export function getZoneDropRate(globalZone, fallback) {
  const v = LOOT_BALANCE.zoneDropRate?.[globalZone];
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
}

export function getNormalDropChance(areaId, globalZone, baseChance) {
  const areaRate = getAreaDropRate(areaId, baseChance);
  return getZoneDropRate(globalZone, areaRate);
}
`;
}

function replaceOrAppend(src, mapName, block) {
  const re = new RegExp(`export const ${mapName} = \\{[\\s\\S]*?\\n\\};`);
  return re.test(src) ? src.replace(re, block) : `${src}\n${block}\n`;
}

function saveEntityBalance(enemyBalance, bossBalance) {
  let text = fs.existsSync(BALANCE_PATH) ? fs.readFileSync(BALANCE_PATH, 'utf8') : scaffoldBalanceFile();
  text = replaceOrAppend(text, 'ENEMY_BALANCE', formatEntityBalance(enemyBalance, 'ENEMY_BALANCE'));
  text = replaceOrAppend(text, 'BOSS_BALANCE', formatEntityBalance(bossBalance, 'BOSS_BALANCE'));
  fs.writeFileSync(BALANCE_PATH, text, 'utf8');
}

// ── Player balance parse / format / save ──────────────────────────

function parsePlayerBalance(fileText) {
  const out = { xpBias: {}, statGrowthBias: {}, xpBase: {}, xpOverride: {}, statGrowthOverride: {} };
  const m = fileText.match(/export const PLAYER_BALANCE = \{([\s\S]*?)\n\};/);
  if (!m) return out;
  // Parse xpBias sub-object
  const xpM = m[1].match(/xpBias:\s*\{([^}]*)\}/);
  if (xpM) {
    const kvRe = /(\d+):\s*([+-]?\d+(?:\.\d+)?)/g;
    let kv;
    while ((kv = kvRe.exec(xpM[1])) !== null) out.xpBias[parseInt(kv[1], 10)] = parseFloat(kv[2]);
  }
  // Parse xpBase sub-object
  const xbM = m[1].match(/xpBase:\s*\{([^}]*)\}/);
  if (xbM) {
    const kvRe = /(\d+):\s*([+-]?\d+(?:\.\d+)?)/g;
    let kv;
    while ((kv = kvRe.exec(xbM[1])) !== null) out.xpBase[parseInt(kv[1], 10)] = parseFloat(kv[2]);
  }
  // Parse statGrowthBias sub-object
  const sgM = m[1].match(/statGrowthBias:\s*\{([^}]*)\}/);
  if (sgM) {
    const kvRe = /(\w+):\s*([+-]?\d+(?:\.\d+)?)/g;
    let kv;
    while ((kv = kvRe.exec(sgM[1])) !== null) out.statGrowthBias[kv[1]] = parseFloat(kv[2]);
  }
  // Parse xpOverride sub-object
  const xoM = m[1].match(/xpOverride:\s*\{([^}]*)\}/);
  if (xoM) {
    const kvRe = /(\d+):\s*([+-]?\d+(?:\.\d+)?)/g;
    let kv;
    while ((kv = kvRe.exec(xoM[1])) !== null) out.xpOverride[parseInt(kv[1], 10)] = parseFloat(kv[2]);
  }
  // Parse statGrowthOverride sub-object
  const soM = m[1].match(/statGrowthOverride:\s*\{([^}]*)\}/);
  if (soM) {
    const kvRe = /(\w+):\s*([+-]?\d+(?:\.\d+)?)/g;
    let kv;
    while ((kv = kvRe.exec(soM[1])) !== null) out.statGrowthOverride[kv[1]] = parseFloat(kv[2]);
  }
  return out;
}

function formatPlayerBalance(pb) {
  // Format xpBias
  const xpKeys = Object.keys(pb.xpBias || {}).map(Number).sort((a, b) => a - b);
  const xpEntries = xpKeys
    .filter(k => Math.abs((pb.xpBias[k] ?? 1) - 1) > 0.0001)
    .map(k => `${k}: ${parseFloat(pb.xpBias[k].toFixed(2))}`);
  const xpLine = xpEntries.length ? `{ ${xpEntries.join(', ')} }` : '{}';

  // Format xpBase (absolute base XP by level)
  const xbKeys = Object.keys(pb.xpBase || {}).map(Number).sort((a, b) => a - b);
  const xbEntries = xbKeys
    .filter(k => Number.isFinite(pb.xpBase[k]) && pb.xpBase[k] > 0)
    .map(k => `${k}: ${Math.floor(pb.xpBase[k])}`);
  const xbLine = xbEntries.length ? `{ ${xbEntries.join(', ')} }` : '{}';

  // Format statGrowthBias
  const sgKeys = Object.keys(pb.statGrowthBias || {}).sort();
  const sgEntries = sgKeys
    .filter(k => Math.abs((pb.statGrowthBias[k] ?? 1) - 1) > 0.0001)
    .map(k => `${k}: ${parseFloat(pb.statGrowthBias[k].toFixed(2))}`);
  const sgLine = sgEntries.length ? `{ ${sgEntries.join(', ')} }` : '{}';

  // Format xpOverride (absolute xp required for level)
  const xoKeys = Object.keys(pb.xpOverride || {}).map(Number).sort((a, b) => a - b);
  const xoEntries = xoKeys
    .filter(k => Number.isFinite(pb.xpOverride[k]) && pb.xpOverride[k] > 0)
    .map(k => `${k}: ${Math.floor(pb.xpOverride[k])}`);
  const xoLine = xoEntries.length ? `{ ${xoEntries.join(', ')} }` : '{}';

  // Format statGrowthOverride (absolute stat gained per level)
  const soKeys = Object.keys(pb.statGrowthOverride || {}).sort();
  const soEntries = soKeys
    .filter(k => Number.isFinite(pb.statGrowthOverride[k]))
    .map(k => `${k}: ${parseFloat(pb.statGrowthOverride[k].toFixed(3))}`);
  const soLine = soEntries.length ? `{ ${soEntries.join(', ')} }` : '{}';

  return `export const PLAYER_BALANCE = {\n  xpBias: ${xpLine},\n  xpBase: ${xbLine},\n  statGrowthBias: ${sgLine},\n  xpOverride: ${xoLine},\n  statGrowthOverride: ${soLine},\n};`;
}

function savePlayerBalance(pb) {
  let text = fs.existsSync(BALANCE_PATH) ? fs.readFileSync(BALANCE_PATH, 'utf8') : scaffoldBalanceFile();
  text = replaceOrAppend(text, 'PLAYER_BALANCE', formatPlayerBalance(pb));
  fs.writeFileSync(BALANCE_PATH, text, 'utf8');
}

function parseLootBalance(fileText) {
  const out = { areaDropRate: {}, zoneDropRate: {} };
  const m = fileText.match(/export const LOOT_BALANCE = \{([\s\S]*?)\n\};/);
  if (!m) return out;
  const areaM = m[1].match(/areaDropRate:\s*\{([^}]*)\}/);
  if (areaM) {
    const kvRe = /(\d+):\s*([+-]?\d+(?:\.\d+)?)/g;
    let kv;
    while ((kv = kvRe.exec(areaM[1])) !== null) {
      const k = parseInt(kv[1], 10);
      const v = parseFloat(kv[2]);
      if (Number.isFinite(v)) out.areaDropRate[k] = v;
    }
  }
  const zoneM = m[1].match(/zoneDropRate:\s*\{([^}]*)\}/);
  if (zoneM) {
    const kvRe = /(\d+):\s*([+-]?\d+(?:\.\d+)?)/g;
    let kv;
    while ((kv = kvRe.exec(zoneM[1])) !== null) {
      const k = parseInt(kv[1], 10);
      const v = parseFloat(kv[2]);
      if (Number.isFinite(v)) out.zoneDropRate[k] = v;
    }
  }
  return out;
}

function formatLootBalance(lb) {
  const areaKeys = Object.keys(lb.areaDropRate || {}).map(Number).sort((a, b) => a - b);
  const areaEntries = areaKeys
    .filter(k => Number.isFinite(lb.areaDropRate[k]) && lb.areaDropRate[k] >= 0 && lb.areaDropRate[k] <= 1)
    .map(k => `${k}: ${parseFloat(lb.areaDropRate[k].toFixed(4))}`);
  const areaLine = areaEntries.length ? `{ ${areaEntries.join(', ')} }` : '{}';

  const zoneKeys = Object.keys(lb.zoneDropRate || {}).map(Number).sort((a, b) => a - b);
  const zoneEntries = zoneKeys
    .filter(k => Number.isFinite(lb.zoneDropRate[k]) && lb.zoneDropRate[k] >= 0 && lb.zoneDropRate[k] <= 1)
    .map(k => `${k}: ${parseFloat(lb.zoneDropRate[k].toFixed(4))}`);
  const zoneLine = zoneEntries.length ? `{ ${zoneEntries.join(', ')} }` : '{}';

  return `export const LOOT_BALANCE = {\n  areaDropRate: ${areaLine},\n  zoneDropRate: ${zoneLine},\n};`;
}

function saveLootBalance(lb) {
  let text = fs.existsSync(BALANCE_PATH) ? fs.readFileSync(BALANCE_PATH, 'utf8') : scaffoldBalanceFile();
  text = replaceOrAppend(text, 'LOOT_BALANCE', formatLootBalance(lb));
  fs.writeFileSync(BALANCE_PATH, text, 'utf8');
}

function loadEntityData() {
  return new Promise((resolve, reject) => {
    exec(`node "${DUMP_PATH}"`, { cwd: ROOT }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function handleApi(req, res) {
  if (req.method === 'GET' && req.url === '/api/data') {
    const text = fs.readFileSync(AREAS_PATH, 'utf8');
    sendJson(res, { balance: parseZoneBalance(text), scaling: parseZoneScaling(text), areas: AREA_MAP });
    return;
  }
  if (req.method === 'GET' && req.url === '/api/entity-data') {
    loadEntityData().then((d) => sendJson(res, d)).catch((e) => sendJson(res, { ok: false, error: e.message }, 500));
    return;
  }
  if (req.method === 'GET' && req.url === '/api/balance-data') {
    const text = fs.existsSync(BALANCE_PATH) ? fs.readFileSync(BALANCE_PATH, 'utf8') : '';
    const configText = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, 'utf8') : '';
    sendJson(res, {
      enemyBalance: parseEntityBalance(text, 'ENEMY_BALANCE'),
      bossBalance: parseEntityBalance(text, 'BOSS_BALANCE'),
      lootBalance: parseLootBalance(text),
      normalDropChance: parseNormalDropChance(configText),
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/api/save') {
    readBody(req).then((b) => {
      saveZoneBalance(b.balance || {});
      sendJson(res, { ok: true });
    }).catch((e) => sendJson(res, { ok: false, error: e.message }, 400));
    return;
  }
  if (req.method === 'POST' && req.url === '/api/save-balance') {
    readBody(req).then((b) => {
      saveEntityBalance(b.enemyBalance || {}, b.bossBalance || {});
      sendJson(res, { ok: true });
    }).catch((e) => sendJson(res, { ok: false, error: e.message }, 400));
    return;
  }
  if (req.method === 'GET' && req.url === '/api/player-data') {
    const text = fs.existsSync(BALANCE_PATH) ? fs.readFileSync(BALANCE_PATH, 'utf8') : '';
    sendJson(res, { playerBalance: parsePlayerBalance(text) });
    return;
  }
  if (req.method === 'POST' && req.url === '/api/save-player') {
    readBody(req).then((b) => {
      savePlayerBalance(b.playerBalance || {
        xpBias: {},
        xpBase: {},
        statGrowthBias: {},
        xpOverride: {},
        statGrowthOverride: {},
      });
      sendJson(res, { ok: true });
    }).catch((e) => sendJson(res, { ok: false, error: e.message }, 400));
    return;
  }
  if (req.method === 'POST' && req.url === '/api/save-loot') {
    readBody(req).then((b) => {
      saveLootBalance(b.lootBalance || { areaDropRate: {}, zoneDropRate: {} });
      sendJson(res, { ok: true });
    }).catch((e) => sendJson(res, { ok: false, error: e.message }, 400));
    return;
  }
  if (req.method === 'POST' && req.url === '/api/sim') {
    exec(`node "${SIM_PATH}"`, { cwd: ROOT }, (err, stdout, stderr) => {
      sendJson(res, { ok: !err, output: stdout || stderr || '' });
    });
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }
  res.writeHead(404);
  res.end('Not found');
}

const AREAS_JSON = JSON.stringify(AREA_MAP);
const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Balance GUI</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#1a1a2e;color:#ddd;font:12px monospace}
header{position:sticky;top:0;z-index:5;background:#16213e;border-bottom:2px solid #0f3460;padding:10px 12px;display:flex;gap:8px;flex-wrap:wrap}
h1{margin:0;font-size:14px;color:#e94560;flex:1}
button{background:#0f3460;color:#ddd;border:1px solid #e94560;border-radius:3px;padding:5px 10px;font:12px monospace;cursor:pointer}
button:hover{background:#e94560}.success{background:#2d6a4f!important;border-color:#52b788!important}
.rates{width:100%;color:#aaa}.tabs{display:flex;gap:4px;padding:8px 12px;background:#111;border-bottom:1px solid #2a2a2a}
.tab-btn{background:#1e1e1e;color:#888;border:none;padding:6px 14px}.tab-btn.active{background:#2a4a2a;color:#7abf7a}
.tab-panel{display:none}.tab-panel.active{display:block}
.sparks{display:flex;gap:8px;padding:8px 12px;background:#0f1a2e;border-bottom:1px solid #0f3460;flex-wrap:wrap}
.spark{display:flex;flex-direction:column;align-items:center;gap:2px}.spark span{font-size:10px;color:#888}
.wrap{overflow-x:auto;overflow-y:visible;padding:0 8px 12px}
table{border-collapse:collapse;width:100%;min-width:760px}
th{position:static;background:#16213e;color:#e94560;padding:4px 6px;border-bottom:1px solid #0f3460}
td{padding:2px 3px;border-bottom:1px solid #1e1e3a;text-align:center}
.stat{width:78px}.name{text-align:left;padding-left:8px;min-width:180px}.meta{font-size:10px;color:#888}
.areahead td{text-align:left;padding:5px 8px;background:#0f1a2e;color:#7a9cc5;border-top:2px solid #0f3460;border-bottom:1px solid #0f3460}
.zone{font-weight:bold;color:#aaa}
#zones thead th:nth-child(1){width:54px;min-width:54px;max-width:54px}
#zones thead th:nth-child(2){width:64px;min-width:64px;max-width:64px}
#zones thead th:nth-child(n+3){width:78px;min-width:78px;max-width:78px}
#zones tbody tr:not(.areahead) td:nth-child(1){width:54px;min-width:54px;max-width:54px;white-space:nowrap}
#zones tbody tr:not(.areahead) td:nth-child(2){width:64px;min-width:64px;max-width:64px;white-space:nowrap}
#zones table{table-layout:fixed}
.cell{display:flex;flex-direction:column;align-items:center;gap:2px}
input[type=range]{-webkit-appearance:none;width:68px;height:4px;border:none;border-radius:2px;background:#333}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:11px;border-radius:50%;background:#d0d0d0;border:1px solid #888}
input[type=range]::-moz-range-thumb{width:11px;height:11px;border-radius:50%;background:#d0d0d0;border:1px solid #888}
.read{font-size:10px;color:#bbb;cursor:pointer}.read:hover{color:#fff;text-decoration:underline}
.in{width:52px;padding:1px 3px;background:#0f0f1a;color:#ddd;border:1px solid #52b788;border-radius:2px;text-align:center;font:11px monospace}
.lv-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0 6px}
.lv-tools label{display:inline-flex;align-items:center;gap:4px}
.lv-tools .in{width:64px}
.lv-focus-range{width:180px}
.lv-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:6px;margin:4px 0 8px}
.lv-card{background:#0f1a2e;border:1px solid #0f3460;border-radius:3px;padding:4px 6px}
.lv-card .k{display:block;font-size:9px;color:#7a9cc5}
.lv-card .v{display:block;font-size:12px;color:#ddd}
#lvtable tbody tr{cursor:pointer}
#lvtable tbody tr.focus td{background:#203148}
.mini,.elite,.area{font-size:9px;padding:1px 5px;border-radius:2px}.mini{background:#303030;color:#999}.elite{background:#2e2810;color:#d4a830}.area{background:#2e1010;color:#d46060}
#sim{display:none;background:#0a0a1a;border-top:2px solid #0f3460;padding:10px 12px}#sim pre{white-space:pre;max-height:500px;overflow:auto}
</style></head><body>
<header><h1>Balance Dials</h1><button id="save">Save to areas.js</button><button id="simbtn">Run Sim</button><button id="copy">Copy Code</button><div id="rates" class="rates">Loading...</div></header>
<div class="tabs"><button class="tab-btn active" data-tab="zones">Zones</button><button class="tab-btn" data-tab="enemies">Enemies</button><button class="tab-btn" data-tab="bosses">Bosses</button><button class="tab-btn" data-tab="drops">Drops</button><button class="tab-btn" data-tab="player">Player</button></div>
<div id="zones" class="tab-panel active"><div id="sparks" class="sparks"></div><div class="wrap"><table><thead><tr><th>Zone</th><th>Area</th><th>hp</th><th>atk</th><th>def</th><th>speed</th><th>regen</th><th>gold</th><th>xp</th></tr></thead><tbody id="zbody"></tbody></table></div></div>
<div id="enemies" class="tab-panel"><div class="wrap"><table><thead><tr><th>Name</th><th>Zones</th><th>hp</th><th>atk</th><th>def</th><th>speed</th><th>regen</th><th>gold</th><th>Base XP</th><th>XP Value</th><th>XP Bias</th></tr></thead><tbody id="ebody"></tbody></table></div></div>
<div id="bosses" class="tab-panel"><div class="wrap"><table><thead><tr><th>Name</th><th>Zone</th><th>Type</th><th>hp</th><th>atk</th><th>def</th><th>speed</th><th>regen</th><th>gold</th><th>xp</th></tr></thead><tbody id="bbody"></tbody></table></div></div>
<div id="drops" class="tab-panel"><div class="wrap"><h3 style="color:#e94560;margin:8px 0 4px">Drop Rate Editor</h3><div class="meta" style="margin-bottom:4px">Edit absolute normal item drop rates. Zone values override area values; area values override global base.</div><div id="dropBase" class="meta" style="margin:2px 0 6px"></div><table><thead><tr><th>Area</th><th>Name</th><th>Base Drop %</th><th>Zones</th></tr></thead><tbody id="adbody"></tbody></table><h3 style="color:#e94560;margin:12px 0 4px">Zone Overrides</h3><table><thead><tr><th>Zone</th><th>Area</th><th>Base Drop %</th><th>Source</th></tr></thead><tbody id="zdbody"></tbody></table></div></div>
<div id="player" class="tab-panel"><div class="wrap"><h3 style="color:#e94560;margin:8px 0 4px">Stat Growth per Level</h3><div class="meta" style="margin-bottom:4px">Set a Bias multiplier and/or an exact Override value. Override takes priority.</div><table><thead><tr><th>Stat</th><th>Base</th><th>Bias</th><th>Override</th><th>Effective</th></tr></thead><tbody id="sgbody"></tbody></table><h3 style="color:#e94560;margin:12px 0 4px">XP per Level</h3><div class="meta" style="margin-bottom:4px">Edit Base XP directly per level. Bias multiplies the (possibly edited) base. Override XP forces an exact effective value.</div><label class="meta" style="display:inline-flex;align-items:center;gap:6px;margin:2px 0 6px"><input id="xpCascade" type="checkbox" checked> Cascade XP edits forward (base + override)</label><table><thead><tr><th>Lvl</th><th>Base XP</th><th>Bias</th><th>Override XP</th><th>Effective</th><th>Cumulative</th><th>Growth %</th></tr></thead><tbody id="xpbody"></tbody></table><h3 style="color:#e94560;margin:12px 0 4px">Level Inspector</h3><div class="meta" style="margin-bottom:4px">Live preview of player stats based on current growth + XP settings. Use controls or click rows.</div><div class="lv-tools"><label class="meta">Focus Lv <input id="lvFocus" class="in" type="number" min="1" step="1" value="1"></label><input id="lvFocusRange" class="lv-focus-range" type="range" min="1" max="35" step="1" value="1"><label class="meta">Preview To Lv <input id="lvMax" class="in" type="number" min="1" max="120" step="1" value="35"></label></div><div id="lvCards" class="lv-cards"></div><table id="lvtable"><thead><tr><th>Lv</th><th>STR</th><th>DEF</th><th>HP</th><th>REGEN/s</th><th>AGI</th><th>Evade</th><th>XP To Next</th><th>Total XP To Reach</th></tr></thead><tbody id="lvbody"></tbody></table></div></div>
<div id="sim"><h3>Sim Output</h3><pre id="simout"></pre></div>
<script>
var STATS=['hp','atk','def','speed','regen','gold','xp'],TOTAL_ZONES=${TOTAL_ZONES},AREA_MAP=${AREAS_JSON},SPW=120,SPH=44,SPC=22,SPM=18;
var balance={},enemyBalance={},bossBalance={},playerBalance={xpBias:{},xpBase:{},statGrowthBias:{},xpOverride:{},statGrowthOverride:{}},lootBalance={areaDropRate:{},zoneDropRate:{}},normalDropChance=0.10,entityData={enemies:[],bosses:[]},active='zones',cellRefs={};
var BASE_XP_TABLE=[50,75,110,155,210,280,360,450,560,680,820,980,1160,1360,1580,1830,2100,2400,2750,3120,3530,3980,4480,5020,5620,6280,7000,7800,8680,9640,10700,11870,13150,14560,16100];
var BASE_STAT_GROWTH={str:2,def:2,hp:12,regen:0.1,agi:0.5};
var PLAYER_STATS=['str','def','hp','regen','agi'];
var STARTING_PLAYER_STATS={str:10,def:5,hp:100,regen:1,agi:3};
var playerPreview={focus:1,max:35};
var CELL_SLIDER_MIN=-4.00,CELL_SLIDER_MAX=6.00,CELL_SLIDER_STEP=0.01,SPEED_BIAS_MIN=0.01;
function clampBias(v,min,max){var lo=Number.isFinite(min)?min:CELL_SLIDER_MIN,hi=Number.isFinite(max)?max:CELL_SLIDER_MAX;return Math.max(lo,Math.min(hi,v))}
var xpOverrideInputs={},xpBaseInputs={},enemyXpValueInputs={},enemyAbsInputs={};
var ENEMY_ABS_STATS=['hp','atk','def','speed','regen','gold'];
function areaForZone(z){for(var i=0;i<AREA_MAP.length;i++)if(z>=AREA_MAP[i].zones[0]&&z<=AREA_MAP[i].zones[1])return AREA_MAP[i];return AREA_MAP[0]}
function gv(z,s){return balance[z]&&balance[z][s]!==undefined?balance[z][s]:1}function sv(z,s,v){if(!balance[z])balance[z]={};balance[z][s]=v}
function gev(m,id,s){return m[id]&&m[id][s]!==undefined?m[id][s]:1}function sev(m,id,s,v){if(!m[id])m[id]={};m[id][s]=v}
function bg(td,v){if(Math.abs(v-1)<0.001){td.style.background='';return}var a=Math.min(0.45,Math.abs(v-1)*0.9);td.style.background=v<1?'rgba(231,111,81,'+a.toFixed(3)+')':'rgba(82,183,136,'+a.toFixed(3)+')'}
function track(sl,v,min,max){var lo=Number.isFinite(min)?min:CELL_SLIDER_MIN,hi=Number.isFinite(max)?max:CELL_SLIDER_MAX,span=hi-lo,pct=Math.max(0,Math.min(100,((v-lo)/(span<=0?1:span))*100)),fill=v<1?'#e76f51':'#52b788';sl.style.background='linear-gradient(to right,'+fill+' 0%,'+fill+' '+pct.toFixed(1)+'%,#333 '+pct.toFixed(1)+'%,#333 100%)'}
function mkCell(tr,key,getf,setf,onchg){var td=document.createElement('td');td.className='stat';var inner=document.createElement('div');inner.className='cell';var sl=document.createElement('input');sl.type='range';var isSpeed=/-speed$/.test(key),minAllowed=isSpeed?SPEED_BIAS_MIN:CELL_SLIDER_MIN,maxAllowed=CELL_SLIDER_MAX;sl.min=String(minAllowed);sl.max=String(maxAllowed);sl.step=String(CELL_SLIDER_STEP);var sp=document.createElement('span');sp.className='read';function apply(v){var c=clampBias(v,minAllowed,maxAllowed);sl.value=c;track(sl,c,minAllowed,maxAllowed);sp.textContent='x'+c.toFixed(2);bg(td,c)}apply(getf());cellRefs[key]={slider:sl,span:sp,td:td,min:minAllowed,max:maxAllowed};sl.addEventListener('input',function(){var v=parseFloat(this.value);if(isNaN(v))return;var c=clampBias(v,minAllowed,maxAllowed);setf(c);apply(c);if(onchg)onchg()});sp.addEventListener('click',function(){var ni=document.createElement('input');ni.type='number';ni.min=String(minAllowed);ni.max=String(maxAllowed);ni.step=String(CELL_SLIDER_STEP);ni.value=clampBias(getf(),minAllowed,maxAllowed).toFixed(2);ni.className='in';inner.replaceChild(ni,sp);ni.focus();ni.select();var done=false;function commit(){if(done)return;done=true;var v=parseFloat(ni.value);if(!isNaN(v))setf(clampBias(v,minAllowed,maxAllowed));if(ni.parentNode)inner.replaceChild(sp,ni);apply(getf());if(onchg)onchg()}ni.addEventListener('blur',commit);ni.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();commit()}if(e.key==='Escape'&&!done){done=true;inner.replaceChild(sp,ni)}})});inner.appendChild(sl);inner.appendChild(sp);td.appendChild(inner);tr.appendChild(td)}
function refreshCell(k,v){var r=cellRefs[k];if(!r)return;var c=clampBias(v,r.min,r.max);r.slider.value=c;track(r.slider,c,r.min,r.max);r.span.textContent='x'+c.toFixed(2);bg(r.td,c)}
function spark(stat){var svg=document.getElementById('sp-'+stat);if(!svg)return;var bw=SPW/TOTAL_ZONES,html='<line x1="0" y1="'+SPC+'" x2="'+SPW+'" y2="'+SPC+'" stroke="#444" stroke-width="1"/>';for(var z=1;z<=TOTAL_ZONES;z++){var v=gv(z,stat);if(Math.abs(v-1)<0.001)continue;var h=Math.max(1,Math.min(SPM,Math.abs(v-1)*SPM*2)),c=v>=1?'#52b788':'#e76f51',x=((z-1)*bw).toFixed(1),y=(v>=1?SPC-h:SPC).toFixed(1);html+='<rect class="sb" data-zone="'+z+'" x="'+x+'" y="'+y+'" width="'+Math.max(1,bw-0.5).toFixed(1)+'" height="'+h.toFixed(1)+'" fill="'+c+'"/>'}svg.innerHTML=html;svg.querySelectorAll('.sb').forEach(function(r){r.addEventListener('click',function(){var z=parseInt(r.dataset.zone,10),tr=document.querySelector('tr[data-zone="'+z+'"]');if(!tr)return;tr.scrollIntoView({behavior:'smooth',block:'center'});tr.classList.remove('hl');void tr.offsetWidth;tr.classList.add('hl');setTimeout(function(){tr.classList.remove('hl')},1300)})})}
function buildSparks(){var c=document.getElementById('sparks');c.innerHTML='';STATS.forEach(function(s){var w=document.createElement('div');w.className='spark';var l=document.createElement('span');l.textContent=s;var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='sp-'+s;svg.setAttribute('width',SPW);svg.setAttribute('height',SPH);w.appendChild(l);w.appendChild(svg);c.appendChild(w);spark(s)})}
function resetZone(z){for(var i=0;i<STATS.length;i++){var s=STATS[i];sv(z,s,1);refreshCell(z+'-'+s,1);spark(s)}}
function resetEnt(p,id,map){for(var i=0;i<STATS.length;i++){var s=STATS[i];sev(map,id,s,1);refreshCell(p+'-'+id+'-'+s,1)}}
function enemyAbsKey(id,stat){return id+':'+stat}
function enemyBaseStat(enemy,stat){
  if(stat==='hp') return Number(enemy&&enemy.hp)||0;
  if(stat==='atk') return Number(enemy&&enemy.attack)||0;
  if(stat==='def') return Number(enemy&&enemy.defense)||0;
  if(stat==='speed') return Number(enemy&&enemy.attackSpeed)||0;
  if(stat==='regen') return Number(enemy&&enemy.regen)||0;
  if(stat==='gold') return Number(enemy&&enemy.goldDrop)||0;
  if(stat==='xp') return Number(enemy&&enemy.xpDrop)||0;
  return 0;
}
function enemyStatValue(enemy,id,stat){
  var base=enemyBaseStat(enemy,stat),bias=gev(enemyBalance,id,stat),raw=base*bias;
  if(stat==='speed') return Math.max(SPEED_BIAS_MIN,raw);
  return Math.floor(raw);
}
function refreshEnemyAbsInput(id,stat){
  var slot=enemyAbsInputs[enemyAbsKey(id,stat)];
  if(!slot)return;
  var base=enemyBaseStat(slot.enemy,stat);
  if(stat==='speed'){
    slot.input.disabled=!(base>0);
    slot.input.value=(base>0?enemyStatValue(slot.enemy,id,stat):0).toFixed(2);
    return;
  }
  slot.input.disabled=(base===0);
  slot.input.value=String(base!==0?enemyStatValue(slot.enemy,id,stat):0);
}
function applyEnemyAbsInput(id,stat){
  var slot=enemyAbsInputs[enemyAbsKey(id,stat)];
  if(!slot)return;
  var key='e-'+id+'-'+stat,base=enemyBaseStat(slot.enemy,stat);
  if((stat==='speed'&&base<=0)||(stat!=='speed'&&base===0)){sev(enemyBalance,id,stat,1);refreshCell(key,1);refreshEnemyAbsInput(id,stat);return}
  var raw=(slot.input.value||'').trim();
  if(!raw){sev(enemyBalance,id,stat,1);refreshCell(key,1);refreshEnemyAbsInput(id,stat);return}
  var parsed=parseFloat(raw);
  if(!Number.isFinite(parsed)){refreshEnemyAbsInput(id,stat);return}
  var target=stat==='speed'?Math.max(SPEED_BIAS_MIN,parsed):Math.floor(parsed);
  var ratio=clampBias(target/base,stat==='speed'?SPEED_BIAS_MIN:CELL_SLIDER_MIN,CELL_SLIDER_MAX);
  if(!Number.isFinite(ratio)){refreshEnemyAbsInput(id,stat);return}
  sev(enemyBalance,id,stat,ratio);
  refreshCell(key,ratio);
  refreshEnemyAbsInput(id,stat);
}
function mkEnemyStatCell(tr,enemy,stat){
  var id=enemy.id,key='e-'+id+'-'+stat;
  mkCell(tr,key,function(){return gev(enemyBalance,id,stat)},function(v){sev(enemyBalance,id,stat,v)},function(){refreshEnemyAbsInput(id,stat)});
  var td=tr.lastChild,inner=td.querySelector('.cell');
  var absIn=document.createElement('input');
  absIn.type='number';
  if(stat==='speed') absIn.min=String(SPEED_BIAS_MIN);
  absIn.step=stat==='speed'?'0.01':'1';
  absIn.className='in';
  absIn.style.width='62px';
  absIn.title='Absolute value';
  inner.appendChild(absIn);
  enemyAbsInputs[enemyAbsKey(id,stat)]={input:absIn,enemy:enemy};
  refreshEnemyAbsInput(id,stat);
  absIn.addEventListener('change',function(){applyEnemyAbsInput(id,stat)});
  absIn.addEventListener('blur',function(){applyEnemyAbsInput(id,stat)});
}
function enemyBaseXp(enemy){var xp=Math.floor(Number(enemy&&enemy.xpDrop));return Number.isFinite(xp)&&xp>0?xp:0}
function refreshEnemyXpValueInput(id){var slot=enemyXpValueInputs[id];if(!slot)return;var base=slot.base;if(base<=0){slot.input.value='0';return}slot.input.value=String(Math.round(base*gev(enemyBalance,id,'xp')))}
function buildZones(){var tb=document.getElementById('zbody');tb.innerHTML='';var last=null;for(var z=1;z<=TOTAL_ZONES;z++){var a=areaForZone(z);if(a.id!==last){last=a.id;var hr=document.createElement('tr');hr.className='areahead';var hc=document.createElement('td');hc.colSpan=9;hc.textContent='A'+a.id+' - '+a.name+' (zones '+a.zones[0]+'-'+a.zones[1]+')';hr.appendChild(hc);tb.appendChild(hr)}var tr=document.createElement('tr');tr.dataset.zone=z;tr.addEventListener('dblclick',(function(zz){return function(){resetZone(zz)}})(z));tr.addEventListener('contextmenu',(function(zz){return function(e){e.preventDefault();resetZone(zz)}})(z));var zc=document.createElement('td');zc.className='zone';zc.textContent=z;tr.appendChild(zc);var ac=document.createElement('td');ac.className='meta';ac.textContent='A'+a.id;tr.appendChild(ac);(function(zz){STATS.forEach(function(s){mkCell(tr,zz+'-'+s,function(){return gv(zz,s)},function(v){sv(zz,s,v)},function(){spark(s)})})})(z);tb.appendChild(tr)}}
function buildEnemies(){
  var tb=document.getElementById('ebody');tb.innerHTML='';enemyXpValueInputs={};enemyAbsInputs={};
  var enemies=(entityData.enemies||[]).slice().sort(function(a,b){
    var az0=(a.zones&&a.zones[0])||999, bz0=(b.zones&&b.zones[0])||999;
    if(az0!==bz0)return az0-bz0;
    var az1=(a.zones&&a.zones[1])||999, bz1=(b.zones&&b.zones[1])||999;
    if(az1!==bz1)return az1-bz1;
    return String(a.name||a.id).localeCompare(String(b.name||b.id));
  });
  enemies.forEach(function(e){
    var tr=document.createElement('tr');
    tr.addEventListener('dblclick',function(){resetEnt('e',e.id,enemyBalance);ENEMY_ABS_STATS.forEach(function(s){refreshEnemyAbsInput(e.id,s)});refreshEnemyXpValueInput(e.id)});
    tr.addEventListener('contextmenu',function(ev){ev.preventDefault();resetEnt('e',e.id,enemyBalance);ENEMY_ABS_STATS.forEach(function(s){refreshEnemyAbsInput(e.id,s)});refreshEnemyXpValueInput(e.id)});
    var n=document.createElement('td');n.className='name';n.textContent=e.name;tr.appendChild(n);
    var z=document.createElement('td');z.className='meta';z.textContent=e.zones[0]+'-'+e.zones[1];tr.appendChild(z);
    ['hp','atk','def','speed','regen','gold'].forEach(function(s){mkEnemyStatCell(tr,e,s)});
    var baseXp=enemyBaseXp(e);
    var bc=document.createElement('td');bc.className='meta';bc.textContent=baseXp>0?String(baseXp):'-';tr.appendChild(bc);
    var vc=document.createElement('td');
    var vi=document.createElement('input');vi.type='number';vi.step='1';vi.className='in';vi.style.width='78px';
    enemyXpValueInputs[e.id]={input:vi,base:baseXp};
    refreshEnemyXpValueInput(e.id);
    function applyXpValue(){
      if(baseXp<=0){sev(enemyBalance,e.id,'xp',1);refreshCell('e-'+e.id+'-xp',1);refreshEnemyXpValueInput(e.id);return}
      var raw=(vi.value||'').trim();
      var parsed=Math.floor(parseFloat(raw));
      if(!raw||!Number.isFinite(parsed)){sev(enemyBalance,e.id,'xp',1);refreshCell('e-'+e.id+'-xp',1);refreshEnemyXpValueInput(e.id);return}
      var nextBias=clampBias(parsed/baseXp);
      sev(enemyBalance,e.id,'xp',nextBias);
      refreshCell('e-'+e.id+'-xp',nextBias);
      refreshEnemyXpValueInput(e.id);
    }
    vi.addEventListener('change',applyXpValue);
    vi.addEventListener('blur',applyXpValue);
    vc.appendChild(vi);
    tr.appendChild(vc);
    mkCell(tr,'e-'+e.id+'-xp',function(){return gev(enemyBalance,e.id,'xp')},function(v){sev(enemyBalance,e.id,'xp',v)},function(){refreshEnemyXpValueInput(e.id)});
    tb.appendChild(tr);
  });
}
function cls(t){if(t==='AREA')return'area';if(t==='ELITE')return'elite';return'mini'}
function buildBosses(){var tb=document.getElementById('bbody');tb.innerHTML='';(entityData.bosses||[]).forEach(function(b){var tr=document.createElement('tr');tr.addEventListener('dblclick',function(){resetEnt('b',b.id,bossBalance)});tr.addEventListener('contextmenu',function(ev){ev.preventDefault();resetEnt('b',b.id,bossBalance)});var n=document.createElement('td');n.className='name';n.textContent=b.name;tr.appendChild(n);var z=document.createElement('td');z.className='meta';z.textContent=String(b.zone);tr.appendChild(z);var t=document.createElement('td');t.className='meta';var badge=document.createElement('span');badge.className=cls(b.bossType);badge.textContent=b.bossType;t.appendChild(badge);tr.appendChild(t);STATS.forEach(function(s){mkCell(tr,'b-'+b.id+'-'+s,function(){return gev(bossBalance,b.id,s)},function(v){sev(bossBalance,b.id,s,v)})});tb.appendChild(tr)})}
function clampRate(v){if(!Number.isFinite(v))return 0;return Math.max(0,Math.min(1,v))}
function rateToPct(rate){return (clampRate(rate)*100).toFixed(2)}
function parsePct(raw){var p=parseFloat(raw);if(!Number.isFinite(p))return null;return clampRate(p/100)}
function areaDropRateFor(areaId){var v=lootBalance.areaDropRate&&lootBalance.areaDropRate[areaId];return Number.isFinite(v)?clampRate(v):clampRate(normalDropChance)}
function zoneDropRateFor(zone){var v=lootBalance.zoneDropRate&&lootBalance.zoneDropRate[zone];if(Number.isFinite(v))return clampRate(v);return areaDropRateFor(areaForZone(zone).id)}
function zoneDropSource(zone){if(Number.isFinite(lootBalance.zoneDropRate&&lootBalance.zoneDropRate[zone]))return'zone';if(Number.isFinite(lootBalance.areaDropRate&&lootBalance.areaDropRate[areaForZone(zone).id]))return'area';return'global'}
function buildDrops(){
  var base=document.getElementById('dropBase');if(base)base.textContent='Global base drop chance: '+rateToPct(normalDropChance)+'% (from LOOT_V2.normalDropChance)';
  var atb=document.getElementById('adbody');if(atb){atb.innerHTML='';AREA_MAP.forEach(function(a){
    var tr=document.createElement('tr');
    var ac=document.createElement('td');ac.className='zone';ac.textContent='A'+a.id;tr.appendChild(ac);
    var nc=document.createElement('td');nc.className='name';nc.textContent=a.name;tr.appendChild(nc);
    var rc=document.createElement('td');
    var ri=document.createElement('input');ri.type='number';ri.min='0';ri.max='100';ri.step='0.01';ri.className='in';ri.style.width='82px';ri.value=rateToPct(areaDropRateFor(a.id));
    function applyArea(){
      var raw=(ri.value||'').trim();
      if(!raw){delete lootBalance.areaDropRate[a.id];buildDrops();return}
      var rate=parsePct(raw);if(rate===null){buildDrops();return}
      if(Math.abs(rate-clampRate(normalDropChance))<0.000001) delete lootBalance.areaDropRate[a.id];
      else lootBalance.areaDropRate[a.id]=rate;
      buildDrops();
    }
    ri.addEventListener('change',applyArea);ri.addEventListener('blur',applyArea);
    rc.appendChild(ri);tr.appendChild(rc);
    var zc=document.createElement('td');zc.className='meta';zc.textContent=a.zones[0]+'-'+a.zones[1];tr.appendChild(zc);
    atb.appendChild(tr);
  })}
  var ztb=document.getElementById('zdbody');if(ztb){ztb.innerHTML='';for(var z=1;z<=TOTAL_ZONES;z++){
    var area=areaForZone(z),tr=document.createElement('tr');
    var zc=document.createElement('td');zc.className='zone';zc.textContent=String(z);tr.appendChild(zc);
    var ac=document.createElement('td');ac.className='meta';ac.textContent='A'+area.id;tr.appendChild(ac);
    var rc=document.createElement('td');
    var ri=document.createElement('input');ri.type='number';ri.min='0';ri.max='100';ri.step='0.01';ri.className='in';ri.style.width='82px';ri.value=rateToPct(zoneDropRateFor(z));
    function applyZone(zone,input){
      return function(){
        var raw=(input.value||'').trim();
        if(!raw){delete lootBalance.zoneDropRate[zone];buildDrops();return}
        var rate=parsePct(raw);if(rate===null){buildDrops();return}
        var fallback=areaDropRateFor(areaForZone(zone).id);
        if(Math.abs(rate-fallback)<0.000001) delete lootBalance.zoneDropRate[zone];
        else lootBalance.zoneDropRate[zone]=rate;
        buildDrops();
      };
    }
    ri.addEventListener('change',applyZone(z,ri));ri.addEventListener('blur',applyZone(z,ri));
    rc.appendChild(ri);tr.appendChild(rc);
    var sc=document.createElement('td');sc.className='meta';sc.textContent=zoneDropSource(z);tr.appendChild(sc);
    ztb.appendChild(tr);
  }}
}
function cleanLoot(){
  var out={areaDropRate:{},zoneDropRate:{}};
  Object.keys(lootBalance.areaDropRate||{}).forEach(function(k){var n=parseInt(k,10),v=clampRate(lootBalance.areaDropRate[k]);if(Number.isFinite(v)&&Math.abs(v-clampRate(normalDropChance))>0.000001)out.areaDropRate[n]=parseFloat(v.toFixed(4))});
  for(var z=1;z<=TOTAL_ZONES;z++){if(!Number.isFinite(lootBalance.zoneDropRate&&lootBalance.zoneDropRate[z]))continue;var v=clampRate(lootBalance.zoneDropRate[z]),fallback=areaDropRateFor(areaForZone(z).id);if(Math.abs(v-fallback)>0.000001)out.zoneDropRate[z]=parseFloat(v.toFixed(4))}
  return out;
}
function fmtLoot(lb){
  var areaKeys=Object.keys(lb.areaDropRate||{}).map(Number).sort(function(a,b){return a-b});
  var areaEntries=areaKeys.map(function(k){return k+': '+parseFloat(lb.areaDropRate[k].toFixed(4))});
  var zoneKeys=Object.keys(lb.zoneDropRate||{}).map(Number).sort(function(a,b){return a-b});
  var zoneEntries=zoneKeys.map(function(k){return k+': '+parseFloat(lb.zoneDropRate[k].toFixed(4))});
  return 'export const LOOT_BALANCE = {\\n  areaDropRate: '+(areaEntries.length?'{ '+areaEntries.join(', ')+' }':'{}')+',\\n  zoneDropRate: '+(zoneEntries.length?'{ '+zoneEntries.join(', ')+' }':'{}')+',\\n};';
}
function xpBiasForLevel(lv){return playerBalance.xpBias[lv]!==undefined?playerBalance.xpBias[lv]:1}
function xpBaseForLevel(lv){var v=playerBalance.xpBase&&playerBalance.xpBase[lv];if(Number.isFinite(v)){var n=Math.floor(v);if(n>0)return n}return BASE_XP_TABLE[lv-1]}
function xpOverrideForLevel(lv){var v=playerBalance.xpOverride&&playerBalance.xpOverride[lv];if(!Number.isFinite(v))return null;var n=Math.floor(v);return n>0?n:null}
function effectiveXpForLevel(lv){var ov=xpOverrideForLevel(lv);if(ov!==null)return ov;return Math.floor(xpBaseForLevel(lv)*xpBiasForLevel(lv))}
function statGrowthBiasFor(stat){return playerBalance.statGrowthBias[stat]!==undefined?playerBalance.statGrowthBias[stat]:1}
function statGrowthOverrideFor(stat){var v=playerBalance.statGrowthOverride&&playerBalance.statGrowthOverride[stat];return Number.isFinite(v)?v:null}
function effectiveStatGrowth(stat){var ov=statGrowthOverrideFor(stat);if(ov!==null)return ov;return BASE_STAT_GROWTH[stat]*statGrowthBiasFor(stat)}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function fmtNum(v,d){if(!Number.isFinite(v))return'-';var pow=Math.pow(10,d||0),n=Math.round(v*pow)/pow;return Math.abs(n-Math.round(n))<0.0001?Math.round(n).toLocaleString('en-US'):n.toLocaleString('en-US',{minimumFractionDigits:d||2,maximumFractionDigits:d||2})}
function xpBaseForAnyLevel(lv){if(lv<=35)return xpBaseForLevel(lv);return Math.max(1,Math.floor(xpBaseForLevel(35)*(1.1**(lv-35))))}
function effectiveXpForAnyLevel(lv){var ov=xpOverrideForLevel(lv);if(ov!==null)return ov;return Math.max(1,Math.floor(xpBaseForAnyLevel(lv)*xpBiasForLevel(lv)))}
function statsAtLevel(lv){var up=Math.max(0,lv-1);return{str:STARTING_PLAYER_STATS.str+up*effectiveStatGrowth('str'),def:STARTING_PLAYER_STATS.def+up*effectiveStatGrowth('def'),hp:STARTING_PLAYER_STATS.hp+up*effectiveStatGrowth('hp'),regen:STARTING_PLAYER_STATS.regen+up*effectiveStatGrowth('regen'),agi:STARTING_PLAYER_STATS.agi+up*effectiveStatGrowth('agi')}}
function wirePlayerPreviewControls(){
  var focusIn=document.getElementById('lvFocus'),range=document.getElementById('lvFocusRange'),maxIn=document.getElementById('lvMax');
  if(!focusIn||!range||!maxIn)return;
  if(focusIn.dataset.bound==='1')return;
  focusIn.dataset.bound='1';
  function syncFromControls(mode){
    var nextMax=clamp(Math.floor(parseFloat(maxIn.value)||35),1,120);
    var nextFocus=clamp(Math.floor(parseFloat(mode==='range'?range.value:focusIn.value)||playerPreview.focus||1),1,nextMax);
    playerPreview.max=nextMax;
    playerPreview.focus=nextFocus;
    maxIn.value=String(nextMax);
    focusIn.value=String(nextFocus);
    range.max=String(nextMax);
    range.value=String(nextFocus);
    recomputePlayerPreview();
  }
  focusIn.addEventListener('input',function(){syncFromControls('input')});
  focusIn.addEventListener('change',function(){syncFromControls('input')});
  range.addEventListener('input',function(){syncFromControls('range')});
  range.addEventListener('change',function(){syncFromControls('range')});
  maxIn.addEventListener('input',function(){syncFromControls('input')});
  maxIn.addEventListener('change',function(){syncFromControls('input')});
}
function recomputePlayerPreview(){
  var tbody=document.getElementById('lvbody'),cards=document.getElementById('lvCards'),focusIn=document.getElementById('lvFocus'),range=document.getElementById('lvFocusRange'),maxIn=document.getElementById('lvMax');
  if(!tbody||!cards||!focusIn||!range||!maxIn)return;
  var maxLevel=clamp(Math.floor(parseFloat(maxIn.value)||playerPreview.max||35),1,120);
  var focus=clamp(Math.floor(parseFloat(focusIn.value)||playerPreview.focus||1),1,maxLevel);
  playerPreview.max=maxLevel;playerPreview.focus=focus;
  maxIn.value=String(maxLevel);focusIn.value=String(focus);range.max=String(maxLevel);range.value=String(focus);
  var focusedStats=statsAtLevel(focus),toReach=0;
  for(var lv=1;lv<focus;lv++)toReach+=effectiveXpForAnyLevel(lv);
  var focusXp=effectiveXpForAnyLevel(focus),evade=focusedStats.agi*2;
  cards.innerHTML='<div class="lv-card"><span class="k">Focus Level</span><span class="v">'+focus+'</span></div>'
    +'<div class="lv-card"><span class="k">STR</span><span class="v">'+fmtNum(focusedStats.str,2)+'</span></div>'
    +'<div class="lv-card"><span class="k">DEF</span><span class="v">'+fmtNum(focusedStats.def,2)+'</span></div>'
    +'<div class="lv-card"><span class="k">HP</span><span class="v">'+fmtNum(focusedStats.hp,2)+'</span></div>'
    +'<div class="lv-card"><span class="k">REGEN/s</span><span class="v">'+fmtNum(focusedStats.regen,2)+'</span></div>'
    +'<div class="lv-card"><span class="k">AGI</span><span class="v">'+fmtNum(focusedStats.agi,2)+'</span></div>'
    +'<div class="lv-card"><span class="k">Evade Rating</span><span class="v">'+fmtNum(evade,2)+'</span></div>'
    +'<div class="lv-card"><span class="k">XP To Next</span><span class="v">'+fmtNum(focusXp,0)+'</span></div>'
    +'<div class="lv-card"><span class="k">Total XP To Reach</span><span class="v">'+fmtNum(toReach,0)+'</span></div>';
  tbody.innerHTML='';
  var cumulative=0;
  for(var i=1;i<=maxLevel;i++){
    var st=statsAtLevel(i),xpNext=effectiveXpForAnyLevel(i);
    var tr=document.createElement('tr');
    if(i===focus)tr.className='focus';
    tr.addEventListener('click',function(level){return function(){playerPreview.focus=level;focusIn.value=String(level);range.value=String(level);recomputePlayerPreview()}}(i));
    function td(text,cls){var c=document.createElement('td');if(cls)c.className=cls;c.textContent=text;return c}
    tr.appendChild(td(String(i),'zone'));
    tr.appendChild(td(fmtNum(st.str,2),'meta'));
    tr.appendChild(td(fmtNum(st.def,2),'meta'));
    tr.appendChild(td(fmtNum(st.hp,2),'meta'));
    tr.appendChild(td(fmtNum(st.regen,2),'meta'));
    tr.appendChild(td(fmtNum(st.agi,2),'meta'));
    tr.appendChild(td(fmtNum(st.agi*2,2),'meta'));
    tr.appendChild(td(fmtNum(xpNext,0),'meta'));
    tr.appendChild(td(fmtNum(cumulative,0),'meta'));
    cumulative+=xpNext;
    tbody.appendChild(tr);
  }
}
function xpCascadeEnabled(){var cb=document.getElementById('xpCascade');return !!(cb&&cb.checked)}
function refreshXpBaseInputs(){for(var lv=1;lv<=35;lv++){var input=xpBaseInputs[lv];if(!input)continue;input.value=String(xpBaseForLevel(lv))}}
function refreshXpOverrideInputs(){for(var lv=1;lv<=35;lv++){var input=xpOverrideInputs[lv];if(!input)continue;var ov=xpOverrideForLevel(lv);input.value=ov!==null?String(ov):''}}
function applyXpBaseCascade(fromLevel,targetValue){
  var anchorBase=BASE_XP_TABLE[fromLevel-1];
  if(anchorBase<=0)return;
  var ratio=targetValue/anchorBase;
  for(var lv=fromLevel;lv<=35;lv++){
    var casc=Math.max(1,Math.floor(BASE_XP_TABLE[lv-1]*ratio));
    if(casc===BASE_XP_TABLE[lv-1]) delete playerBalance.xpBase[lv];
    else playerBalance.xpBase[lv]=casc;
  }
}
function applyXpOverrideCascade(fromLevel,targetValue){
  var anchorBase=xpBaseForLevel(fromLevel);
  if(anchorBase<=0)return;
  var ratio=targetValue/anchorBase;
  for(var lv=fromLevel;lv<=35;lv++){
    var casc=Math.max(1,Math.floor(xpBaseForLevel(lv)*ratio));
    var fromBias=Math.floor(xpBaseForLevel(lv)*xpBiasForLevel(lv));
    if(casc===fromBias) delete playerBalance.xpOverride[lv];
    else playerBalance.xpOverride[lv]=casc;
  }
}
function recomputeXp(){var cum=0;for(var i=0;i<35;i++){var lv=i+1,eff=effectiveXpForLevel(lv);cum+=eff;var prev=i>0?effectiveXpForLevel(i):0;var growth=prev>0?((eff-prev)/prev*100).toFixed(1)+'%':'-';var row=document.getElementById('xpr-'+lv);if(!row)continue;var effCell=row.querySelector('.xp-eff');effCell.textContent=eff;effCell.style.color=xpOverrideForLevel(lv)!==null?'#7abf7a':'#888';row.querySelector('.xp-cum').textContent=cum;row.querySelector('.xp-grow').textContent=growth}recomputePlayerPreview()}
function buildPlayer(){
  var sgb=document.getElementById('sgbody');sgb.innerHTML='';
  PLAYER_STATS.forEach(function(s){
    var tr=document.createElement('tr');
    var n=document.createElement('td');n.className='name';n.style.textAlign='left';n.style.paddingLeft='8px';n.textContent=s;tr.appendChild(n);
    var b=document.createElement('td');b.className='meta';b.textContent=BASE_STAT_GROWTH[s];tr.appendChild(b);
    mkCell(tr,'sg-'+s,function(){return statGrowthBiasFor(s)},function(v){playerBalance.statGrowthBias[s]=v},function(){refreshEff();recomputePlayerPreview()});
    var ov=document.createElement('td');
    var ovIn=document.createElement('input');ovIn.type='number';ovIn.min='0';ovIn.step='0.01';ovIn.className='in';ovIn.style.width='70px';ovIn.placeholder='auto';
    var ovVal=statGrowthOverrideFor(s);if(ovVal!==null)ovIn.value=String(ovVal);
    function applyStatOverride(){
      var raw=(ovIn.value||'').trim();
      if(!raw){delete playerBalance.statGrowthOverride[s];refreshEff();recomputePlayerPreview();return;}
      var v=parseFloat(raw);
      if(!isNaN(v)&&v>=0){
        var fromBias=BASE_STAT_GROWTH[s]*statGrowthBiasFor(s);
        if(Math.abs(v-fromBias)<0.0001) delete playerBalance.statGrowthOverride[s];
        else playerBalance.statGrowthOverride[s]=parseFloat(v.toFixed(3));
      }
      refreshEff();
      recomputePlayerPreview();
    }
    ovIn.addEventListener('change',applyStatOverride);
    ovIn.addEventListener('blur',applyStatOverride);
    ov.appendChild(ovIn);
    tr.appendChild(ov);
    var e=document.createElement('td');e.className='meta sg-eff';
    function refreshEff(){var eff=effectiveStatGrowth(s);e.textContent=eff.toFixed(2);e.style.color=statGrowthOverrideFor(s)!==null?'#7abf7a':'#888'}
    refreshEff();
    tr.appendChild(e);
    sgb.appendChild(tr);
  });
  var xpb=document.getElementById('xpbody');xpb.innerHTML='';xpOverrideInputs={};xpBaseInputs={};
  for(var i=0;i<35;i++){
    var lv=i+1;
    var tr=document.createElement('tr');tr.id='xpr-'+lv;
    var lc=document.createElement('td');lc.className='zone';lc.textContent=lv;tr.appendChild(lc);
    var bc=document.createElement('td');
    var bcIn=document.createElement('input');bcIn.type='number';bcIn.min='0';bcIn.step='1';bcIn.className='in';bcIn.style.width='78px';bcIn.value=String(xpBaseForLevel(lv));
    xpBaseInputs[lv]=bcIn;
    bcIn.addEventListener('change',function(level,input){return function(){
      var raw=(input.value||'').trim();
      var parsed=Math.floor(parseFloat(raw));
      if(!raw||!Number.isFinite(parsed)||parsed<=0){
        if(xpCascadeEnabled()){for(var k=level;k<=35;k++) delete playerBalance.xpBase[k];}
        else delete playerBalance.xpBase[level];
        refreshXpBaseInputs();recomputeXp();return;
      }
      var v=parsed;
      if(Number.isFinite(v)&&v>0){
        if(xpCascadeEnabled()) applyXpBaseCascade(level,v);
        else {
          if(v===BASE_XP_TABLE[level-1]) delete playerBalance.xpBase[level];
          else playerBalance.xpBase[level]=v;
        }
      }
      refreshXpBaseInputs();
      recomputeXp();
    }}(lv,bcIn));
    bcIn.addEventListener('blur',function(input){return function(){input.dispatchEvent(new Event('change'))}}(bcIn));
    bc.appendChild(bcIn);
    tr.appendChild(bc);
    mkCell(tr,'xp-'+lv,function(l){return function(){return xpBiasForLevel(l)}}(lv),function(l){return function(v){playerBalance.xpBias[l]=v}}(lv),recomputeXp);
    var ov=document.createElement('td');
    var ovIn=document.createElement('input');ovIn.type='number';ovIn.min='0';ovIn.step='1';ovIn.className='in';ovIn.style.width='78px';ovIn.placeholder='auto';
    var ovVal=xpOverrideForLevel(lv);if(ovVal!==null)ovIn.value=String(ovVal);
    xpOverrideInputs[lv]=ovIn;
    ovIn.addEventListener('change',function(level,input){return function(){
      var raw=(input.value||'').trim();
      var parsed=Math.floor(parseFloat(raw));
      if(!raw||!Number.isFinite(parsed)||parsed<=0){
        if(xpCascadeEnabled()){for(var k=level;k<=35;k++) delete playerBalance.xpOverride[k];}
        else delete playerBalance.xpOverride[level];
        refreshXpOverrideInputs();recomputeXp();return;
      }
      var v=parsed;
      if(Number.isFinite(v)&&v>0){
        if(xpCascadeEnabled()) applyXpOverrideCascade(level,v);
        else {
          var fromBias=Math.floor(xpBaseForLevel(level)*xpBiasForLevel(level));
          if(v===fromBias) delete playerBalance.xpOverride[level];
          else playerBalance.xpOverride[level]=v;
        }
      }
      refreshXpOverrideInputs();
      recomputeXp();
    }}(lv,ovIn));
    ovIn.addEventListener('blur',function(input){return function(){input.dispatchEvent(new Event('change'))}}(ovIn));
    ov.appendChild(ovIn);
    tr.appendChild(ov);
    var ec=document.createElement('td');ec.className='meta xp-eff';
    tr.appendChild(ec);
    var cc=document.createElement('td');cc.className='meta xp-cum';tr.appendChild(cc);
    var gc=document.createElement('td');gc.className='meta xp-grow';tr.appendChild(gc);
    xpb.appendChild(tr);
  }
  recomputeXp();
  wirePlayerPreviewControls();
  recomputePlayerPreview();
}
function cleanZones(){var o={};for(var z=1;z<=TOTAL_ZONES;z++){var e={};for(var i=0;i<STATS.length;i++){var s=STATS[i],v=gv(z,s);if(s==='speed'&&Number.isFinite(v))v=Math.max(SPEED_BIAS_MIN,v);if(Math.abs(v-1)>0.0001)e[s]=parseFloat(v.toFixed(2))}if(Object.keys(e).length)o[z]=e}return o}
function cleanMap(map){var o={};Object.keys(map).forEach(function(id){var e={};STATS.forEach(function(s){var v=map[id]&&map[id][s]!==undefined?map[id][s]:1;if(s==='speed'&&Number.isFinite(v))v=Math.max(SPEED_BIAS_MIN,v);if(Math.abs(v-1)>0.0001)e[s]=parseFloat(v.toFixed(2))});if(Object.keys(e).length)o[id]=e});return o}
function sanitizeSpeedBias(v){return Number.isFinite(v)?Math.max(SPEED_BIAS_MIN,v):1}
function sanitizeSpeedInMap(map){Object.keys(map||{}).forEach(function(id){if(!map[id])return;if(map[id].speed!==undefined)map[id].speed=sanitizeSpeedBias(parseFloat(map[id].speed))})}
function sanitizeZoneSpeed(balanceMap){Object.keys(balanceMap||{}).forEach(function(z){if(!balanceMap[z])return;if(balanceMap[z].speed!==undefined)balanceMap[z].speed=sanitizeSpeedBias(parseFloat(balanceMap[z].speed))})}
function fmtZones(b){var ks=Object.keys(b).map(Number).sort(function(a,b2){return a-b2});if(!ks.length)return'export const ZONE_BALANCE = {};';var ls=ks.map(function(z){var p=Object.keys(b[z]).map(function(k){return k+': '+b[z][k]}).join(', ');return'  '+z+': { '+p+' },'});return'export const ZONE_BALANCE = {\\n'+ls.join('\\n')+'\\n};'}
function fmtMap(m,name){var ids=Object.keys(m).sort();if(!ids.length)return'export const '+name+' = {};';var ls=ids.map(function(id){var p=Object.keys(m[id]).map(function(k){return k+': '+parseFloat(m[id][k].toFixed(2)).toFixed(2)}).join(', ');return'  \\''+id+'\\': { '+p+' },'});return'export const '+name+' = {\\n'+ls.join('\\n')+'\\n};'}
function cleanPlayer(){var o={xpBias:{},xpBase:{},statGrowthBias:{},xpOverride:{},statGrowthOverride:{}};for(var lv=1;lv<=35;lv++){var b=xpBiasForLevel(lv);if(Math.abs(b-1)>0.0001)o.xpBias[lv]=parseFloat(b.toFixed(2));var xb=xpBaseForLevel(lv);if(xb!==BASE_XP_TABLE[lv-1])o.xpBase[lv]=xb;var ov=xpOverrideForLevel(lv);if(ov!==null){var fromBias=Math.floor(xb*b);if(ov!==fromBias)o.xpOverride[lv]=ov}}PLAYER_STATS.forEach(function(s){var b=statGrowthBiasFor(s);if(Math.abs(b-1)>0.0001)o.statGrowthBias[s]=parseFloat(b.toFixed(2));var ov=statGrowthOverrideFor(s);if(ov!==null){var fromBias=BASE_STAT_GROWTH[s]*b;if(Math.abs(ov-fromBias)>0.0001)o.statGrowthOverride[s]=parseFloat(ov.toFixed(3))}});return o}
function fmtPlayer(pb){var xpKeys=Object.keys(pb.xpBias).map(Number).sort(function(a,b){return a-b});var xpEntries=xpKeys.map(function(k){return k+': '+pb.xpBias[k]});var xpLine=xpEntries.length?'{ '+xpEntries.join(', ')+' }':'{}';var xbKeys=Object.keys(pb.xpBase).map(Number).sort(function(a,b){return a-b});var xbEntries=xbKeys.map(function(k){return k+': '+Math.floor(pb.xpBase[k])});var xbLine=xbEntries.length?'{ '+xbEntries.join(', ')+' }':'{}';var sgKeys=Object.keys(pb.statGrowthBias).sort();var sgEntries=sgKeys.map(function(k){return k+': '+pb.statGrowthBias[k]});var sgLine=sgEntries.length?'{ '+sgEntries.join(', ')+' }':'{}';var xoKeys=Object.keys(pb.xpOverride).map(Number).sort(function(a,b){return a-b});var xoEntries=xoKeys.map(function(k){return k+': '+Math.floor(pb.xpOverride[k])});var xoLine=xoEntries.length?'{ '+xoEntries.join(', ')+' }':'{}';var soKeys=Object.keys(pb.statGrowthOverride).sort();var soEntries=soKeys.map(function(k){return k+': '+parseFloat(pb.statGrowthOverride[k].toFixed(3))});var soLine=soEntries.length?'{ '+soEntries.join(', ')+' }':'{}';return'export const PLAYER_BALANCE = {\\n  xpBias: '+xpLine+',\\n  xpBase: '+xbLine+',\\n  statGrowthBias: '+sgLine+',\\n  xpOverride: '+xoLine+',\\n  statGrowthOverride: '+soLine+',\\n};'}
function setTab(tab){
  active=tab;
  document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.toggle('active',b.dataset.tab===tab)});
  document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.toggle('active',p.id===tab)});
  document.getElementById('save').textContent=tab==='zones'?'Save to areas.js':'Save to balance.js';
}
function load(){
  Promise.all([
    fetch('/api/data').then(function(r){return r.json()}),
    fetch('/api/entity-data').then(function(r){return r.json()}),
    fetch('/api/balance-data').then(function(r){return r.json()}),
    fetch('/api/player-data').then(function(r){return r.json()}),
  ]).then(function(all){
    var z=all[0],e=all[1],b=all[2],p=all[3];
    balance={};
    Object.keys(z.balance||{}).forEach(function(k){balance[parseInt(k,10)]=Object.assign({},z.balance[k])});
    enemyBalance=Object.assign({},b.enemyBalance||{});
    bossBalance=Object.assign({},b.bossBalance||{});
    sanitizeZoneSpeed(balance);
    sanitizeSpeedInMap(enemyBalance);
    sanitizeSpeedInMap(bossBalance);
    lootBalance=Object.assign({areaDropRate:{},zoneDropRate:{}},b.lootBalance||{});
    lootBalance.areaDropRate=Object.assign({},lootBalance.areaDropRate||{});
    lootBalance.zoneDropRate=Object.assign({},lootBalance.zoneDropRate||{});
    normalDropChance=Number.isFinite(b.normalDropChance)?b.normalDropChance:0.10;
    playerBalance=Object.assign({xpBias:{},xpBase:{},statGrowthBias:{},xpOverride:{},statGrowthOverride:{}},p.playerBalance||{});
    playerBalance.xpBias=Object.assign({},playerBalance.xpBias||{});
    playerBalance.xpBase=Object.assign({},playerBalance.xpBase||{});
    playerBalance.statGrowthBias=Object.assign({},playerBalance.statGrowthBias||{});
    playerBalance.xpOverride=Object.assign({},playerBalance.xpOverride||{});
    playerBalance.statGrowthOverride=Object.assign({},playerBalance.statGrowthOverride||{});
    entityData=e||{enemies:[],bosses:[]};
    var s=z.scaling||{};
    document.getElementById('rates').textContent='Base scaling: hp x'+(s.hp?(1+s.hp).toFixed(2):'?')+'/zone | atk x'+(s.atk?(1+s.atk).toFixed(2):'?')+'/zone | gold x'+(s.gold?(1+s.gold).toFixed(2):'?')+'/zone | xp x'+(s.xp?(1+s.xp).toFixed(2):'?')+'/zone';
    cellRefs={};
    buildZones();
    buildSparks();
    buildEnemies();
    buildBosses();
    buildDrops();
    buildPlayer();
    var xpc=document.getElementById('xpCascade');
    if(xpc){xpc.addEventListener('change',function(){refreshXpBaseInputs();refreshXpOverrideInputs();recomputeXp()})}
    setTab('zones');
  }).catch(function(err){document.getElementById('rates').textContent='Error: '+err.message});
}
document.querySelectorAll('.tab-btn').forEach(function(b){b.addEventListener('click',function(){setTab(b.dataset.tab)})});
document.getElementById('save').addEventListener('click',function(){var btn=this,url,payload;if(active==='zones'){url='/api/save';payload={balance:cleanZones()}}else if(active==='player'){url='/api/save-player';payload={playerBalance:cleanPlayer()}}else if(active==='drops'){url='/api/save-loot';payload={lootBalance:cleanLoot()}}else{url='/api/save-balance';payload={enemyBalance:cleanMap(enemyBalance),bossBalance:cleanMap(bossBalance)}}fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.json()}).then(function(j){if(!j.ok){alert('Save failed: '+(j.error||'unknown'));return}var label=active==='zones'?'Save to areas.js':'Save to balance.js';btn.textContent='Saved!';btn.classList.add('success');setTimeout(function(){btn.textContent=label;btn.classList.remove('success')},2000)}).catch(function(e){alert('Save error: '+e.message)})});
document.getElementById('simbtn').addEventListener('click',function(){var p=document.getElementById('sim'),o=document.getElementById('simout');p.style.display='block';o.textContent='Running simulation...';fetch('/api/sim',{method:'POST'}).then(function(r){return r.json()}).then(function(j){o.textContent=j.output||'(no output)';p.scrollIntoView({behavior:'smooth',block:'start'})}).catch(function(e){o.textContent='Error: '+e.message})});
document.getElementById('copy').addEventListener('click',function(){var btn=this,code='';if(active==='zones')code=fmtZones(cleanZones());else if(active==='player')code=fmtPlayer(cleanPlayer());else if(active==='drops')code=fmtLoot(cleanLoot());else if(active==='enemies')code=fmtMap(cleanMap(enemyBalance),'ENEMY_BALANCE');else code=fmtMap(cleanMap(bossBalance),'BOSS_BALANCE');navigator.clipboard.writeText(code).then(function(){btn.textContent='Copied!';setTimeout(function(){btn.textContent='Copy Code'},1500)}).catch(function(e){alert('Copy failed: '+e.message)})});
load();
</script></body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }
  if (req.url.startsWith('/api/')) {
    handleApi(req, res);
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log('');
  console.log('Balance GUI');
  console.log(`  ${url}`);
  console.log('  Press Ctrl+C to stop.');
  console.log('');
  exec(`start ${url}`, { shell: true });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Is another instance running?`);
    console.error(`Open http://localhost:${PORT} in your browser manually.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
