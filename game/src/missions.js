// The five story missions from fixer Lena Voss, as a pure state machine.
// A mission is a list of stages; each stage is a beacon to reach, a car to steal
// and deliver, or a stretch of time to survive. The machine only tracks progress;
// the renderer draws the beacon and the HUD shows the objective text.
import { MISSIONS } from './config.js';
import { dist2 } from './random.js';

export function makeMissionState() {
  return {
    index: 0, // which mission is active (0..4), -1 when all done
    stage: 0,
    stageTimer: 0, // seconds left in a timed stage, or seconds survived
    done: [], // completed mission ids
    active: null, // the mission object currently running
    message: '',
    messageTimer: 0,
  };
}

export function startMission(state, index) {
  const def = MISSIONS[index];
  if (!def) return null;
  state.index = index;
  state.stage = 0;
  state.stageTimer = 0;
  state.active = def;
  state.message = def.intro;
  state.messageTimer = 6;
  return def;
}

// Current objective: {label, x, z, radius, type} or null when no mission runs.
export function currentObjective(state) {
  if (!state.active) return null;
  const stage = state.active.stages[state.stage];
  if (!stage) return null;
  return {
    label: stage.label,
    type: stage.type,
    x: stage.x,
    z: stage.z,
    radius: stage.radius ?? 6,
    seconds: stage.seconds ?? 0,
  };
}

// Advance the mission machine by dt. player: {x, z, inCar, car}. Returns events:
// [{type: 'stage'|'complete'|'failed', ...}] for the HUD and the sound to react to.
export function updateMissions(state, player, dt) {
  const events = [];
  if (!state.active) return events;
  const stage = state.active.stages[state.stage];
  if (!stage) return events;

  if (stage.type === 'survive') {
    state.stageTimer += dt;
    if (state.stageTimer >= (stage.seconds || 30)) {
      events.push(advanceStage(state));
    }
    return events;
  }

  if (stage.timeLimit !== undefined) {
    state.stageTimer += dt;
    if (state.stageTimer >= stage.timeLimit) {
      events.push({ type: 'failed', reason: 'Time ran out.' });
      state.active = null;
      return events;
    }
  }

  if (stage.type === 'goto' || stage.type === 'deliver') {
    const d = dist2(player.x, player.z, stage.x, stage.z);
    if (stage.type === 'deliver' && !player.inCar) {
      // Deliveries need the car; standing there on foot does not count.
    } else if (d <= (stage.radius ?? 6)) {
      events.push(advanceStage(state));
    }
    return events;
  }

  if (stage.type === 'steal') {
    // Done when the player is driving the mission car (flagged on the car).
    if (player.inCar && player.car && player.car.missionCar) {
      events.push(advanceStage(state));
    }
    return events;
  }

  return events;
}

function advanceStage(state) {
  state.stage++;
  state.stageTimer = 0;
  if (state.stage >= state.active.stages.length) {
    const done = state.active;
    state.done.push(done.id);
    state.active = null;
    state.index++;
    const event = { type: 'complete', mission: done, reward: done.reward };
    state.message = `Mission complete: ${done.name} — $${done.reward}`;
    state.messageTimer = 5;
    return event;
  }
  const next = state.active.stages[state.stage];
  state.message = next.label;
  state.messageTimer = 4;
  return { type: 'stage', label: next.label };
}

// Distance to the current objective, for the HUD. Infinity when idle.
export function objectiveDistance(state, player) {
  const obj = currentObjective(state);
  if (!obj || obj.x === undefined) return Infinity;
  return dist2(player.x, player.z, obj.x, obj.z);
}

export function missionsLeft(state) {
  return MISSIONS.length - state.done.length;
}

export function allMissionsDone(state) {
  return state.done.length >= MISSIONS.length;
}
