// UI layout and positioning constants.

import { FEATURES } from './features.js';

const CLASSIC_LAYOUT = {
  topBar:         { x: 0, y: 0, w: 1280, h: 50 },
  gameArea:       { x: 0, y: 50, w: 960, h: 670 },
  dialoguePanel:  { x: 960, y: 50, w: 320, h: 150 },
  logPanel:       { x: 960, y: 201, w: 320, h: 519 },
  bottomBar:      { x: 0, y: 670, w: 960, h: 50 },
  zoneNav:        { y: 70, centerX: 480 },
};

const EXPANDED_LAYOUT = {
  topBar:         { x: 0, y: 0, w: 1280, h: 50 },
  gameArea:       { x: 0, y: 50, w: 1280, h: 670 },
  // Kept for compatibility; these are hidden when logs are disabled.
  dialoguePanel:  { x: 960, y: 50, w: 320, h: 150 },
  logPanel:       { x: 960, y: 201, w: 320, h: 519 },
  bottomBar:      { x: 0, y: 670, w: 1280, h: 50 },
  zoneNav:        { y: 70, centerX: 640 },
};

const expandedLayoutActive = FEATURES.expandedGameplayLayoutEnabled && !FEATURES.systemLogsEnabled;

export const LAYOUT = expandedLayoutActive ? EXPANDED_LAYOUT : CLASSIC_LAYOUT;

export const TERRITORY = {
  nodeRadius: 28,
  colors: {
    locked:    0x444444,
    unlocked:  0x666666,
    claimable: 0x22c55e,
    conquered: 0xeab308,
  },
  infoPanelX: 600,
  infoPanelW: 340,
};
