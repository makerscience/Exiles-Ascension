// Visual theming: colors, zone palettes, parallax, damage number tiers.

export const COLORS = {
  panelBg:      0x111111,
  topBarBg:     0x0a0a0a,
  separator:    0x333333,
  emotion: {
    sarcastic:  '#eab308',
    angry:      '#ef4444',
    impressed:  '#22c55e',
    worried:    '#38bdf8',
    neutral:    '#e5e5e5',
  },
  logText: {
    combat:     '#22c55e',
    gold:       '#eab308',
    system:     '#eab308',
    levelUp:    '#818cf8',
    zoneChange: '#38bdf8',
    loot:       '#a855f7',
    defeat:     '#e5e5e5',
    prestige:   '#f59e0b',
    warning:    '#f97316',
    dot:        '#ef4444',
    default:    '#a1a1aa',
  },
  rarity: {
    common:   '#a1a1aa',
    uncommon: '#22c55e',
    rare:     '#3b82f6',
    epic:     '#a855f7',
  },
  xpBar: {
    bg:         0x374151,
    fill:       0x6366f1,
  },
};

export const ZONE_THEMES = {
  1: {
    layers: [0x1a2a1a, 0x0d1f0d, 0x0a1a0a],
    images: ['bg002_rear', 'bg002_mid'],
    trees: ['fg_tree003', 'fg_tree004'],
    ferns: ['fern', 'fern002'],
    skyHeightScale: 0.333,
    playerTint: 0xffffff,
  },
  2: {
    layers: [0x1a2e1a, 0x152815, 0x0d1f0d],
    images: ['swamp_rear'],
    ground: 'swamp_front',
    trees: ['swamptree001', 'swamptree002', 'swamptree003'],
    flatScroll: true,
    treeRowOverrides: [
      { scaleRange: [0.03, 0.044], yRange: [0.5821, 0.5970], depth: -2.6, count: 12, alpha: 1.0, tint: 0x555555, keys: ['swamptree001_sm', 'swamptree002_sm', 'swamptree003_sm'] },
      { scaleRange: [0.10, 0.14], yRange: [0.6716, 0.7030], depth: -0.35, count: 8, alpha: 1.0, tint: 0xaaaaaa, depthSort: true, speedMult: 0.77, keys: ['swamptree001', 'swamptree002', 'swamptree003', 'fallentree001'] },
      { scaleRange: [0.2633, 0.3658], yRange: [0.82, 0.88], depth: -0.15, count: 3, speedMult: 1.0, depthSort: true },
      { scaleRange: [0.12, 0.14], yRange: [0.7910, 0.7985], depth: -0.25, count: 8, speedMult: 0.85, alpha: 0.7, keys: ['fog001'] },
      { scaleRange: [0.12, 0.14], yRange: [0.7910, 0.7985], depth: -0.25, count: 16, speedMult: 0.85, alpha: 0.7, keys: ['fog002', 'fog003'] },
      { scaleRange: [0.06, 0.10], yRange: [0.6648, 0.6948], depth: -0.50, count: 40, speedMult: 0.6, alpha: 0.4, keys: ['fog001', 'fog002', 'fog003'] },
      { scaleRange: [0.039, 0.071], yRange: [0.71, 0.7175], depth: -0.34, count: 4, speedMult: 0.924, keys: ['clutter001', 'clutter002'] },
      { scaleRange: [0.121, 0.1815], yRange: [0.8586, 0.8735], depth: -0.145, count: 10, speedMult: 1.14, alpha: 0.7, keys: ['fog001'] },
      { scaleRange: [0.1331, 0.19965], yRange: [0.8586, 0.8735], depth: -0.145, count: 22, speedMult: 1.14, alpha: 0.7, keys: ['fog002', 'fog003'] },
      { scaleRange: [0.10, 0.10], yRange: [0.8358, 0.8433], depth: -0.14, count: 2, speedMult: 1.0, keys: ['clutter001', 'clutter003'] },
    ],
    skyOffsetY: 0,
    skyHeightScale: 0.5775,
    groundHeightScale: 0.7,
    playerTint: 0xc4c4c4,
    enemyTint: 0xb3b3b3,
    path: 'swamp_path',
    pathHeight: 150,
  },
  3: {
    layers: [0x1a1a2e, 0x15152b, 0x0d0d1f],
    playerTint: 0xc8d0e6,
  },
};

export const PARALLAX = {
  baseSpeedPxPerSec: 9,
  treeDiagRatio: 0,
  fernDiagRatio: 0,
};

export const TREE_ROWS = [
  {
    count: 24,
    speedMult: 0.48,
    scaleRange: [0.15, 0.22],
    yRange: [0.486, 0.507],
    depth: -0.45,
    alpha: 1.0,
    diagMult: 0.65,
    depthSort: true,
    keys: ['fg_tree003', 'fg_tree004'],
  },
  {
    count: 16,
    speedMult: 0.7,
    scaleRange: [0.22, 0.32],
    yRange: [0.556, 0.576],
    depth: -0.35,
    alpha: 1.0,
    diagMult: 0.65,
    depthSort: true,
    keys: ['fg_tree003', 'fg_tree004'],
  },
  {
    count: 12,
    speedMult: 1.0,
    scaleRange: [0.40, 0.52],
    yRange: [0.721, 0.771],
    depth: -0.15,
    alpha: 1.0,
    diagMult: 1.2,
    depthSort: true,
    keys: ['fg_tree003', 'fg_tree004'],
  },
];

export const FERN_ROWS = [
  { speedMult: 0.54, scaleRange: [0.084, 0.112], depth: -0.4, alpha: 0.85, xSpacingMult: 0.6, depthSort: true },
  { speedMult: 0.85, scaleRange: [0.096, 0.128], depth: -0.25, alpha: 0.9, xSpacingMult: 0.3, depthSort: true },
  { speedMult: 1.0, scaleRange: [0.135, 0.18], depth: -0.14, alpha: 0.85, xSpacingMult: 0.58, depthSort: true },
  { speedMult: 1.0, scaleRange: [0.18, 0.24], depth: -0.12, alpha: 0.9, xSpacingMult: 0.28, depthSort: true },
];

export const UI = {
  formatThresholds: {
    thousand: 1e3,
    million: 1e6,
    billion: 1e9,
  },
  damageNumbers: {
    duration: 1000,
    floatDistance: 60,
    tiers: [
      { min: 0,      fontSize: 22, color: '#ffffff', style: 'bold',   shake: 0 },
      { min: 100,    fontSize: 26, color: '#ffffff', style: 'bold',   shake: 0 },
      { min: 1000,   fontSize: 30, color: '#fde047', style: 'bold',   shake: 0 },
      { min: 100000, fontSize: 34, color: '#fbbf24', style: 'bold',   shake: 0.002 },
      { min: 1e6,    fontSize: 40, color: '#fbbf24', style: 'bold',   shake: 0.004 },
    ],
    critBonusSize: 6,
  },
  logMaxLines: 50,
  dialogueMaxLines: 20,
};
