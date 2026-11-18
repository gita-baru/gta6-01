// The wanted level: stars the player earns by committing crimes, police cars
// that arrive to match them, and a slow cooldown when the player lays low.
// (v2, 18 Nov 2026) Unchanged: 3 stars still fields 2 cruisers, as the cover shows.
import { MAX_WANTED, WANTED_DECAY_SECONDS } from './config.js';

export function createWanted() {
  return {
    level: 0,
    quietTimer: 0,
    decayTimer: 0,
  };
}

export function addCrime(wanted, stars) {
  wanted.level = Math.min(MAX_WANTED, wanted.level + stars);
  wanted.quietTimer = 0;
  wanted.decayTimer = 0;
}

/** How many police cars the current level fields. */
export function policeCount(level) {
  if (level <= 0) return 0;
  if (level <= 2) return 1;
  if (level <= 3) return 2;
  return 3;
}

export function updateWanted(wanted, dt, policeNear) {
  if (wanted.level <= 0) return;
  wanted.quietTimer += dt;
  if (wanted.quietTimer > WANTED_DECAY_SECONDS && !policeNear) {
    wanted.decayTimer += dt;
    if (wanted.decayTimer > 12) {
      wanted.level -= 1;
      wanted.decayTimer = 0;
    }
  } else {
    wanted.decayTimer = 0;
  }
}
