import { on, EVENTS } from '../events.js';
import Store from './Store.js';

const TRACK_URLS = [
  'Sound/soundtrack/track1.mp3',
  'Sound/soundtrack/track2.mp3',
  'Sound/soundtrack/track3.mp3',
  'Sound/soundtrack/track4.mp3',
];

let bgm = null;
let settingsUnsub = null;
let resumeBound = null;
let endedBound = null;
let currentTrackIndex = 0;

function getVolumeFromStore() {
  return Store.getState()?.settings?.musicVolume ?? 0.5;
}

function setTrack(index) {
  if (!bgm) return;
  currentTrackIndex = ((index % TRACK_URLS.length) + TRACK_URLS.length) % TRACK_URLS.length;
  bgm.src = TRACK_URLS[currentTrackIndex];
  bgm.load();
}

function playCurrentTrack() {
  if (!bgm) return Promise.resolve();
  return bgm.play()
    .then(() => removeResumeHandler())
    .catch((error) => {
      addResumeHandler();
      throw error;
    });
}

function playNextTrack() {
  if (!bgm) return Promise.resolve();
  setTrack(currentTrackIndex + 1);
  return playCurrentTrack();
}

function removeResumeHandler() {
  if (!resumeBound) return;
  document.removeEventListener('pointerdown', resumeBound);
  document.removeEventListener('keydown', resumeBound);
  resumeBound = null;
}

function addResumeHandler() {
  if (resumeBound) return;
  resumeBound = () => {
    if (!bgm) {
      removeResumeHandler();
      return;
    }
    playCurrentTrack().catch(() => {});
  };
  document.addEventListener('pointerdown', resumeBound);
  document.addEventListener('keydown', resumeBound);
}

const MusicManager = {
  init() {
    if (settingsUnsub) return;
    settingsUnsub = on(EVENTS.STATE_CHANGED, ({ changedKeys } = {}) => {
      if (!Array.isArray(changedKeys) || !changedKeys.includes('settings')) return;
      this.syncVolumeFromStore();
    });
  },

  ensurePlaying() {
    if (!bgm) {
      bgm = new Audio();
      bgm.loop = false;
      endedBound = () => {
        playNextTrack().catch(() => {});
      };
      bgm.addEventListener('ended', endedBound);
      setTrack(currentTrackIndex);
    }
    this.syncVolumeFromStore();
    playCurrentTrack().catch(() => {});
    return bgm;
  },

  syncVolumeFromStore() {
    this.setVolume(getVolumeFromStore());
  },

  setVolume(volume) {
    const clamped = Math.max(0, Math.min(1, Number(volume) || 0));
    if (bgm) bgm.volume = clamped;
  },

  destroy() {
    removeResumeHandler();
    if (settingsUnsub) {
      settingsUnsub();
      settingsUnsub = null;
    }
    if (bgm) {
      if (endedBound) {
        bgm.removeEventListener('ended', endedBound);
        endedBound = null;
      }
      bgm.pause();
      bgm.src = '';
      bgm = null;
    }
    currentTrackIndex = 0;
  },
};

export default MusicManager;
