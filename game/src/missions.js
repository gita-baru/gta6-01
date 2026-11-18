// Solmar Heat — the five story jobs from fixer Lena Voss. A small state
// machine: each mission is a list of steps, each step a place or a trial.
import { MISSIONS } from "./config.js";
import { addWanted } from "./police.js";

export function startMission(S, index) {
  const m = MISSIONS[index];
  const done = S.mission.done;
  S.mission = {
    index,
    step: 0,
    active: true,
    targetCar: null,
    timer: m.steps[0].time || 0,
    text: m.steps[0].text,
    done,
  };
  if (m.id === "getaway") addWanted(S, 3);
  if (m.id === "nightrun") S.clock = 21 * 3600;
  if (m.id === "heatwave") addWanted(S, 5);
  if (m.id === "hotwheels") {
    const comet = S.cars.find((c) => c.kind === "mission");
    if (comet) S.mission.targetCar = comet.id;
  }
  S.fx.push({ type: "mission", text: `${m.name}: ${m.briefing}` });
  return m;
}

export function currentObjective(S) {
  if (!S.mission.active) return null;
  const m = MISSIONS[S.mission.index];
  const step = m.steps[S.mission.step];
  if (!step) return null;
  if (step.type === "survive") {
    return { text: step.text, x: S.player.x, z: S.player.z, dist: 0, timer: S.mission.timer };
  }
  const dist = Math.hypot(step.x - S.player.x, step.z - S.player.z);
  return { text: step.text, x: step.x, z: step.z, dist, timer: S.mission.timer };
}

function advance(S) {
  const m = MISSIONS[S.mission.index];
  S.mission.step++;
  if (S.mission.step >= m.steps.length) {
    S.money += m.reward;
    S.mission.done[S.mission.index] = true;
    S.mission.active = false;
    S.fx.push({ type: "paid", text: `${m.name} complete — $${m.reward.toLocaleString("en-US")}` });
    S.fx.push({ type: "pickup" });
    return { type: "complete", mission: m };
  }
  const step = m.steps[S.mission.step];
  S.mission.text = step.text;
  S.mission.timer = step.time || 0;
  return { type: "step", mission: m, step };
}

// Returns an event object when a step completes, a mission ends or fails.
export function updateMission(S, dt) {
  if (!S.mission.active) return null;
  const m = MISSIONS[S.mission.index];
  const step = m.steps[S.mission.step];
  if (!step) return null;
  if (step.type === "goto") {
    const d = Math.hypot(step.x - S.player.x, step.z - S.player.z);
    if (d < step.radius) {
      S.fx.push({ type: "pickup" });
      return advance(S);
    }
  } else if (step.type === "steal") {
    const car = S.player.car;
    if (car && S.mission.targetCar === car.id) return advance(S);
  } else if (step.type === "timed") {
    S.mission.timer -= dt;
    if (S.mission.timer <= 0) {
      S.mission.active = false;
      S.fx.push({ type: "fail", text: `${m.name} failed — out of time` });
      return { type: "failed", mission: m };
    }
    const d = Math.hypot(step.x - S.player.x, step.z - S.player.z);
    if (d < step.radius) return advance(S);
  } else if (step.type === "survive") {
    S.mission.timer -= dt;
    if (S.wanted < 5) addWanted(S, 5 - S.wanted);
    if (S.mission.timer <= 0) return advance(S);
  }
  return null;
}

export function nextMissionIndex(S) {
  for (let i = 0; i < MISSIONS.length; i++) {
    if (!S.mission.done[i]) return i;
  }
  return -1;
}
