// The simulation: one world object, one step function. Pure — no DOM, no
// three.js, no Math.random (all randomness flows through the seeded rng).
import { CFG, clamp, dist2d } from './config.js';
import { makeRng } from './random.js';
import { PLACES } from './city.js';
import { makeCar, spawnTraffic, stepCarPhysics, stepTraffic, stepPolice, makeHeli, stepHeli } from './vehicles.js';
import { makePlayer, stepPlayerOnFoot, tryPunch, tryShoot } from './player.js';
import { spawnPeds, stepPeds } from './peds.js';
import { makeMissionState, updateMissions, currentTarget } from './missions.js';
import { makeWanted, updateWanted, addCrime } from './wanted.js';

export function createWorld(seed, opts = {}) {
  const rng = makeRng(seed);
  const start = opts.start || PLACES.plaza;
  const world = {
    seed,
    rng,
    time: 0,
    dayT: CFG.dayStart,
    cash: opts.cash ?? 250,
    player: makePlayer(start.x + 6, start.z + 6),
    traffic: [],
    police: [],
    peds: [],
    heli: makeHeli(),
    comet: null,
    wanted: makeWanted(),
    missions: makeMissionState(),
    objective: 'Press T to start the next job',
    busted: false,
    wasted: false,
    camYaw: Math.PI,       // camera looks north (-z) by default
    gunfire: null,
    stats: { missionsDone: 0, carsStolen: 0, shotsFired: 0, crashes: 0 },
    events: [],            // one-frame event flags for sound/HUD: 'shot','punch','crash','siren','pickup'
  };
  world.traffic = spawnTraffic(rng, CFG.trafficCount, { x: world.player.x, z: world.player.z });
  world.peds = spawnPeds(rng, CFG.pedCount, { x: world.player.x, z: world.player.z });
  return world;
}

export function playerPos(world) {
  const p = world.player;
  return p.onFoot ? { x: p.x, z: p.z } : { x: p.car.x, z: p.car.z };
}

// Find the nearest stealable car (traffic, or the Comet GT) to the player.
export function nearestCar(world, maxD = 5) {
  const p = world.player;
  let best = null, bestD = maxD;
  for (const car of world.traffic) {
    const d = dist2d(p.x, p.z, car.x, car.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

export function enterCar(world, car) {
  const p = world.player;
  p.onFoot = false;
  p.car = car;
  car.kind = 'player';
  car.cruise = 0;
  world.traffic = world.traffic.filter((c) => c !== car);
  world.stats.carsStolen++;
  addCrime(world, 1);
  world.events.push('steal');
}

export function exitCar(world) {
  const p = world.player;
  const car = p.car;
  car.speed = 0;
  car.kind = 'traffic';
  car.cruise = 11;
  world.traffic.push(car);
  p.x = car.x + Math.cos(car.heading) * 3;
  p.z = car.z - Math.sin(car.heading) * 3;
  p.heading = car.heading;
  p.onFoot = true;
  p.car = null;
}

// One simulation step. input: {mx, mz, run, throttle, steer, handbrake,
// enter, punch, shoot, aimHeading, mission, camYaw}.
export function stepWorld(world, input, dt) {
  world.time += dt;
  world.dayT = (CFG.dayStart + world.time / CFG.dayLength) % 1;
  world.events.length = 0;
  const p = world.player;
  if (input.camYaw !== undefined) world.camYaw = input.camYaw;

  if (world.busted || world.wasted) return;

  // --- Player ---
  if (p.onFoot) {
    stepPlayerOnFoot(p, { mx: input.mx || 0, mz: input.mz || 0, run: !!input.run }, dt);
    if (input.enter) {
      const car = nearestCar(world);
      if (car) enterCar(world, car);
    }
    if (input.punch) {
      const hit = tryPunch(p, world.peds);
      if (hit) { world.events.push('punch'); addCrime(world, 0.5); }
    }
    if (input.shoot) {
      const res = tryShoot(p, world.peds, input.aimHeading ?? p.heading);
      if (res.fired) {
        world.stats.shotsFired++;
        world.events.push('shot');
        world.gunfire = { x: p.x, z: p.z };
        if (res.hit) addCrime(world, 1);
        else addCrime(world, 0.25);
      }
    }
  } else {
    stepCarPhysics(p.car, {
      throttle: input.throttle || 0,
      steer: input.steer || 0,
      handbrake: !!input.handbrake,
    }, dt);
    p.x = p.car.x;
    p.z = p.car.z;
    p.heading = p.car.heading;
    if (input.enter) exitCar(world);
  }

  // --- Traffic, police, helicopter ---
  for (const car of world.traffic) stepTraffic(car, world.rng, dt);
  const pos = playerPos(world);
  for (const car of world.police) stepPolice(car, pos, world.rng, dt);
  if (world.heli.active) stepHeli(world.heli, pos, dt);

  // --- Pedestrians ---
  const threat = p.onFoot ? null : { x: p.car.x, z: p.car.z, speed: Math.abs(p.car.speed) };
  stepPeds(world.peds, pos, world.gunfire, threat, dt);
  world.gunfire = null;

  // --- Collisions: player car vs traffic / police ---
  if (!p.onFoot) {
    for (const car of [...world.traffic, ...world.police]) {
      if (dist2d(p.car.x, p.car.z, car.x, car.z) < 3.4 && Math.abs(p.car.speed) > 6) {
        car.crashed = 0.8;
        p.car.speed *= 0.55;
        p.health = Math.max(0, p.health - 4);
        world.stats.crashes++;
        world.events.push('crash');
      }
    }
    // Hitting a ped while driving.
    for (const ped of world.peds) {
      if (ped.state !== 'down' && dist2d(p.car.x, p.car.z, ped.x, ped.z) < 2.6 && Math.abs(p.car.speed) > 4) {
        ped.state = 'down';
        ped.downT = 5;
        p.car.speed *= 0.8;
        addCrime(world, 1);
        world.events.push('crash');
      }
    }
  } else {
    // A police car ramming the player on foot hurts.
    for (const car of world.police) {
      if (dist2d(p.x, p.z, car.x, car.z) < 2.8 && car.speed > 5) {
        p.health = Math.max(0, p.health - 12);
        car.speed *= 0.3;
        world.events.push('crash');
      }
    }
  }

  // --- Missions, wanted, clock ---
  updateMissions(world, dt);
  updateWanted(world, dt);
  if (world.wasted) world.events.push('wasted');
  if (world.busted) world.events.push('busted');
}

// In-game clock as HH:MM, starting at 17:12 and advancing with the day cycle.
export function clockString(world) {
  const hours = (CFG.clockStart + world.time / CFG.dayLength * 24) % 24;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function objectiveInfo(world) {
  const target = currentTarget(world);
  const pos = playerPos(world);
  const dist = target ? Math.round(dist2d(pos.x, pos.z, target.x, target.z)) : null;
  return { text: world.objective, dist, target };
}

// Respawn after busted/wasted: keep cash minus a fine, restart at the hospital.
export function respawn(world) {
  const p = world.player;
  world.cash = Math.max(0, world.cash - 150);
  world.wanted = makeWanted();
  world.police = [];
  world.heli.active = false;
  p.health = CFG.playerHealth;
  p.onFoot = true;
  p.car = null;
  const h = PLACES.hospital;
  p.x = h.x + 6;
  p.z = h.z + 6;
  world.busted = false;
  world.wasted = false;
  if (world.missions.active) {
    world.missions.active = false;
    world.missions.failed = false;
    world.objective = 'Press T to start the next job';
  }
}
