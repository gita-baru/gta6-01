// Missions and the story: three jobs from Lena Voss, the fixer who calls the
// player on the in-game phone. Each mission is a list of steps; a step is a
// place to reach, a car to steal, or a getaway to survive.
// (v2, 18 Nov 2026) Unchanged: the mission scene drives step 2 of job 1.
import { MISSION_REWARDS } from './config.js';

export const MISSIONS = [
  {
    id: 'pickup',
    name: 'First Pickup',
    intro: 'Lena: "Marco, first job. A package is waiting at the docks. Bring it to the Hotel Solmar. No cops, no problems."',
    reward: MISSION_REWARDS[0],
    steps: [
      { type: 'goto', spot: 'docks', text: 'Pick up the package at the docks' },
      { type: 'goto', spot: 'hotel', text: 'Deliver the package to the Hotel Solmar' },
    ],
  },
  {
    id: 'hotwheels',
    name: 'Hot Wheels',
    intro: 'Lena: "A yellow Comet GT is parked uptown. It is not theirs anymore. Bring it to my garage — and expect company."',
    reward: MISSION_REWARDS[1],
    steps: [
      { type: 'steal', spot: 'sportsCar', text: 'Steal the yellow Comet GT uptown' },
      { type: 'goto', spot: 'garage', text: 'Deliver the Comet GT to the garage' },
    ],
    wantedOnStart: 2,
  },
  {
    id: 'getaway',
    name: 'The Getaway',
    intro: 'Lena: "The job went loud. Three stars and the whole Solmar PD is on you. Lose them and get to the safehouse. Ninety seconds."',
    reward: MISSION_REWARDS[2],
    steps: [
      { type: 'escape', spot: 'safehouse', text: 'Lose the cops and reach the safehouse', timer: 90 },
    ],
    wantedOnStart: 3,
  },
];

export function createMissionState() {
  return {
    index: 0, // which mission is offered next
    step: 0,
    active: false,
    done: [],
    timer: 0,
    failed: false,
  };
}

export function currentMission(state) {
  return state.index < MISSIONS.length ? MISSIONS[state.index] : null;
}

export function currentStep(state) {
  const mission = currentMission(state);
  return mission ? mission.steps[state.step] : null;
}

export function startMission(state, wanted) {
  const mission = currentMission(state);
  if (!mission) return null;
  state.active = true;
  state.step = 0;
  state.failed = false;
  const step = mission.steps[0];
  state.timer = step.timer || 0;
  if (mission.wantedOnStart) wanted.level = Math.max(wanted.level, mission.wantedOnStart);
  return mission;
}

export function failMission(state) {
  state.active = false;
  state.failed = true;
}

/**
 * Advance the mission state. Returns 'step', 'done', 'failed' or null.
 * `context` carries the world facts the steps need: player position, the car
 * the player is driving, the wanted level, and the spots table.
 */
export function updateMission(state, dt, context) {
  if (!state.active) return null;
  const mission = currentMission(state);
  if (!mission) return null;
  const step = mission.steps[state.step];
  if (step.timer) {
    state.timer -= dt;
    if (state.timer <= 0) {
      failMission(state);
      return 'failed';
    }
  }
  if (step.type === 'goto') {
    const spot = context.spots[step.spot];
    const dx = context.playerX - spot.x;
    const dz = context.playerZ - spot.z;
    if (Math.hypot(dx, dz) < 7) {
      state.step += 1;
      if (state.step >= mission.steps.length) {
        state.active = false;
        state.done.push(mission.id);
        state.index += 1;
        return 'done';
      }
      const next = mission.steps[state.step];
      state.timer = next.timer || 0;
      return 'step';
    }
  } else if (step.type === 'steal') {
    if (context.drivingSport) {
      state.step += 1;
      return 'step';
    }
  } else if (step.type === 'escape') {
    const spot = context.spots[step.spot];
    const dx = context.playerX - spot.x;
    const dz = context.playerZ - spot.z;
    if (Math.hypot(dx, dz) < 7) {
      state.active = false;
      state.done.push(mission.id);
      state.index += 1;
      return 'done';
    }
  }
  return null;
}
