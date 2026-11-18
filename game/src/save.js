// Save and load through localStorage: cash, finished missions and the best
// getaway score. Nothing here is needed for the game to run.
// (v2, 18 Nov 2026) Unchanged: the save shape stays v1 so old saves still load.
import { SAVE_KEY } from './config.js';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: Number(data.cash) || 0,
      missionsDone: Array.isArray(data.missionsDone) ? data.missionsDone : [],
      best: Number(data.best) || 0,
    };
  } catch {
    return null;
  }
}

export function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off: the game still plays, it just does not remember.
  }
}
