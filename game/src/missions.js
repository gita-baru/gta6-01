// The five jobs from Lena Voss. Each mission is a list of steps; a step is
// completed by arriving at its target (or by doing its action).
import { CFG, dist2d } from './config.js';
import { PLACES } from './city.js';

export const MISSIONS = [
  {
    id: 1, name: 'First Pickup', reward: 500, brief: 'Lena: pick up the package at the docks, deliver it to the Hotel Solmar.',
    steps: [
      { text: 'Collect the package at the docks', target: 'docks' },
      { text: 'Deliver the package to the Hotel Solmar', target: 'hotel' },
    ],
  },
  {
    id: 2, name: 'Hot Wheels', reward: 1200, brief: 'Lena: steal the yellow Comet GT uptown and bring it to the garage. Cops are already on you.',
    steps: [
      { text: 'Steal the yellow Comet GT uptown', target: 'uptown', action: 'steal' },
      { text: 'Bring the Comet GT to the garage', target: 'garage', action: 'deliverCar' },
    ],
  },
  {
    id: 3, name: 'The Getaway', reward: 2000, brief: 'Lena: lose the 3-star heat, then reach the safehouse. 90 seconds.',
    timer: CFG.getawayTime,
    steps: [
      { text: 'Lose the cops (get wanted to zero)', target: null, action: 'loseHeat' },
      { text: 'Reach the safehouse', target: 'safehouse' },
    ],
  },
  {
    id: 4, name: 'Night Run', reward: 1500, brief: 'Lena: three drops across the city, against the clock. 150 seconds.',
    timer: CFG.nightRunTime,
    steps: [
      { text: 'Drop 1 of 3: the pier', target: 'pier' },
      { text: 'Drop 2 of 3: the plaza', target: 'plaza' },
      { text: 'Drop 3 of 3: the marina', target: 'marina' },
    ],
  },
  {
    id: 5, name: 'Heat Wave', reward: 3000, brief: 'Lena: lose 4-star heat with the helicopter up, then reach the safehouse.',
    steps: [
      { text: 'Lose the cops and the helicopter', target: null, action: 'loseHeat' },
      { text: 'Reach the safehouse', target: 'safehouse' },
    ],
  },
];

export function makeMissionState() {
  return { index: 0, active: false, step: 0, timer: 0, failed: false, done: false, message: '' };
}

// Start mission i (0-based). Applies mission-specific setup (wanted level, the
// Comet GT for mission 2). Returns the mission definition.
export function startMission(world, i) {
  const def = MISSIONS[i];
  const ms = world.missions;
  ms.index = i;
  ms.active = true;
  ms.step = 0;
  ms.failed = false;
  ms.done = false;
  ms.timer = def.timer || 0;
  ms.message = def.brief;
  world.objective = def.steps[0].text;
  if (def.id === 2) {
    world.wanted.stars = 2;
    world.wanted.heat = 2;
    spawnCometGT(world);
  }
  if (def.id === 3) {
    world.wanted.stars = 3;
    world.wanted.heat = 3;
  }
  if (def.id === 5) {
    world.wanted.stars = 4;
    world.wanted.heat = 4;
  }
  return def;
}

// The yellow Comet GT waiting uptown for mission 2.
export function spawnCometGT(world) {
  if (world.comet) return;
  const p = PLACES.uptown;
  world.comet = {
    kind: 'traffic', x: p.x + 4, z: p.z, heading: Math.PI / 2, speed: 0,
    color: 0xf2c200, axis: 'x', dir: 1, lane: 3.2, cruise: 0,
    path: [], pathIdx: 0, repath: 0, ram: false, siren: false, crashed: 0,
    comet: true,
  };
  world.traffic.push(world.comet);
}

export function currentStep(world) {
  const ms = world.missions;
  if (!ms.active) return null;
  return MISSIONS[ms.index].steps[ms.step] || null;
}

export function currentTarget(world) {
  const step = currentStep(world);
  if (!step || !step.target) return null;
  return PLACES[step.target];
}

export function updateMissions(world, dt) {
  const ms = world.missions;
  if (!ms.active || ms.failed || ms.done) return;
  const def = MISSIONS[ms.index];
  if (ms.timer > 0) {
    ms.timer -= dt;
    if (ms.timer <= 0) {
      ms.failed = true;
      ms.active = false;
      ms.message = `Time up — ${def.name} failed. Press T to retry.`;
      world.objective = 'Job failed — press T to retry';
      return;
    }
  }
  const step = def.steps[ms.step];
  if (!step) return;
  const pos = world.player.onFoot
    ? { x: world.player.x, z: world.player.z }
    : { x: world.player.car.x, z: world.player.car.z };
  const arrive = (target) => dist2d(pos.x, pos.z, target.x, target.z) < CFG.arriveRadius;

  if (step.action === 'steal') {
    // Complete when the player is driving the Comet GT.
    if (!world.player.onFoot && world.player.car && world.player.car.comet) {
      advance(world);
    }
    return;
  }
  if (step.action === 'deliverCar') {
    if (!world.player.onFoot && world.player.car && world.player.car.comet && arrive(PLACES[step.target])) {
      advance(world);
    }
    return;
  }
  if (step.action === 'loseHeat') {
    if (world.wanted.stars === 0) advance(world);
    return;
  }
  if (step.target && arrive(PLACES[step.target])) advance(world);
}

function advance(world) {
  const ms = world.missions;
  const def = MISSIONS[ms.index];
  ms.step++;
  if (ms.step >= def.steps.length) {
    ms.done = true;
    ms.active = false;
    world.cash += def.reward;
    world.player.ammo = Math.min(CFG.pistolAmmoMax, world.player.ammo + 12);
    world.stats.missionsDone++;
    ms.message = `${def.name} complete — $${def.reward.toLocaleString()}!`;
    world.objective = 'Job done — press T for the next job';
    return;
  }
  world.objective = def.steps[ms.step].text;
  ms.message = def.steps[ms.step].text;
}
