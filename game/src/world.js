// The world: everything the game simulates, wired together. The player, the
// cars, the pedestrians, the police, the missions and the wanted level all
// live here; render.js only draws them and hud.js only reports them.
import {
  BEACH_Z, CAR_HEALTH, CITY_HALF, GRID, PITCH, PED_COUNT, PLAYER_HEALTH, STEP,
  TRAFFIC_COUNT,
} from './config.js';
import { createRandom } from './random.js';
import { createCity, isOnRoad, nearestRoadPoint, randomRoadPoint } from './city.js';
import { createPlayer, stepPlayer } from './player.js';
import {
  createCar, carForward, resolveCarCollisions, stepDrivenCar, stepPoliceCar,
  stepTrafficCar,
} from './vehicles.js';
import { createPeds, stepPeds } from './peds.js';
import {
  MISSIONS, createMissionState, currentMission, currentStep, failMission,
  startMission, updateMission,
} from './missions.js';
import { addCrime, createWanted, policeCount, updateWanted } from './wanted.js';
import { readSave, writeSave } from './save.js';
import { ACTION_ENTER, ACTION_MUTE, ACTION_PUNCH, ACTION_SHOOT } from './input.js';

export const EVENT_NONE = 0;

export function createWorld(seed, renderer, hud, audio) {
  const state = {
    seed,
    renderer,
    hud,
    audio,
    time: 0,
    timeOfDay: 0.42,
    cash: 0,
    screen: 'title',
    menuOpen: false,
    city: null,
    rng: null,
    player: null,
    cars: [],
    peds: [],
    police: [],
    mission: createMissionState(),
    wanted: createWanted(),
    camYaw: 0.6,
    camPitch: 0.34,
    camDist: 0, // screenshot scenes set this; 0 means the usual distance
    bustedTimer: 0,
    playerHurtCooldown: 0,
    nextCarId: 1,
    save: readSave(),
  };
  if (state.save) state.cash = state.save.cash;

  function spawnTrafficCar(x, z) {
    const p = x === undefined ? randomRoadPoint(state.rng) : { x, z };
    const car = createCar(state.nextCarId++, p.x, p.z, state.rng.range(0, Math.PI * 2), { traffic: true });
    state.cars.push(car);
    return car;
  }

  function spawnPoliceCar() {
    const angle = state.rng.range(0, Math.PI * 2);
    const px = playerX() + Math.sin(angle) * 90;
    const pz = playerZ() + Math.cos(angle) * 90;
    const road = nearestRoadPoint(px, pz);
    const car = createCar(state.nextCarId++, road.x, road.z, 0, { police: true });
    state.cars.push(car);
    state.police.push(car);
    return car;
  }

  function ensureCarMesh(car) {
    if (state.renderer.dynamic.has('car' + car.id)) return;
    const mesh = state.renderer.makeCarMesh(car.color, car.sport, car.police);
    state.renderer.scene.add(mesh.group);
    state.renderer.dynamic.set('car' + car.id, { ...mesh, kind: 'car', car, spin: 0 });
  }

  function ensurePersonMesh(id, shirt, pants) {
    if (state.renderer.dynamic.has(id)) return;
    const mesh = state.renderer.makePersonMesh(shirt, pants);
    state.renderer.scene.add(mesh.group);
    state.renderer.dynamic.set(id, { ...mesh, kind: 'person' });
  }

  function removeMesh(id) {
    const rec = state.renderer.dynamic.get(id);
    if (!rec) return;
    state.renderer.scene.remove(rec.group);
    state.renderer.dynamic.delete(id);
  }

  function reset(seedValue) {
    for (const id of [...state.renderer.dynamic.keys()]) removeMesh(id);
    state.seed = seedValue;
    state.time = 0;
    state.timeOfDay = 0.42;
    state.cash = state.save ? state.save.cash : 0;
    state.mission = createMissionState();
    state.wanted = createWanted();
    state.bustedTimer = 0;
    state.playerHurtCooldown = 0;
    state.nextCarId = 1;
    state.police = [];
    state.cars = [];
    state.peds = [];
    state.rng = createRandom(seedValue);
    state.city = createCity(state.rng);
    state.renderer.buildCity(state.city);
    const start = state.city.spots.playerStart;
    state.player = createPlayer(start.x, start.z, start.heading);
    state.player.health = PLAYER_HEALTH;
    state.camYaw = start.heading;
    state.camPitch = 0.34;
    state.camDist = 0;
    // Traffic.
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawnTrafficCar();
    // Parked cars, including the yellow sports car for mission 2.
    const sportSpot = state.city.spots.sportsCar;
    const sport = createCar(state.nextCarId++, sportSpot.x, sportSpot.z, Math.PI / 2, { sport: true, parked: true, color: 0xe0d040 });
    state.cars.push(sport);
    state.sportCar = sport;
    for (let i = 0; i < 5; i += 1) {
      const p = randomRoadPoint(state.rng);
      const parked = createCar(state.nextCarId++, p.x + 4.5, p.z, 0, { parked: true });
      state.cars.push(parked);
    }
    state.peds = createPeds(state.rng, PED_COUNT);
    state.renderer.setTimeOfDay(state.timeOfDay);
  }

  function playerCar() {
    if (!state.player.inCar) return null;
    return state.cars.find((c) => c.id === state.player.inCar) || null;
  }

  function playerX() {
    const car = playerCar();
    return car ? car.x : state.player.x;
  }

  function playerZ() {
    const car = playerCar();
    return car ? car.z : state.player.z;
  }

  function playerHeading() {
    const car = playerCar();
    return car ? car.heading : state.player.heading;
  }

  function missionTarget() {
    if (!state.mission.active) return null;
    const step = currentStep(state.mission);
    if (!step) return null;
    if (step.type === 'steal') return { x: state.sportCar.x, z: state.sportCar.z };
    return state.city.spots[step.spot] || null;
  }

  function nextMission() {
    return currentMission(state.mission);
  }

  function saveGame() {
    const save = {
      cash: Math.floor(state.cash),
      missionsDone: state.mission.done,
      best: Math.max(state.save ? state.save.best : 0, Math.floor(state.cash)),
    };
    state.save = save;
    writeSave(save);
  }

  function onCrash(x, z, impact) {
    state.renderer.spawnParticles(x, 1, z, 10, 6, 3);
    state.audio.crash();
  }

  function nearestCar(maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const car of state.cars) {
      if (car.wrecked) continue;
      const d = Math.hypot(car.x - state.player.x, car.z - state.player.z);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar() {
    const car = nearestCar(4.5);
    if (!car) return;
    state.player.inCar = car.id;
    car.parked = false;
    car.traffic = false;
    if (car.police) {
      addCrime(state.wanted, 2);
      state.hud.toast('You stole a police cruiser! The whole force is coming.');
    } else if (car === state.sportCar && state.mission.active && currentStep(state.mission)?.type === 'steal') {
      state.hud.toast('The Comet GT is yours. Lose the heat and get to the garage.');
    } else if (car.traffic || car.parked) {
      addCrime(state.wanted, 1);
      state.hud.toast('Car stolen — wanted level up!');
    }
    state.audio.unlock();
  }

  function exitCar() {
    const car = playerCar();
    if (!car) return;
    const f = carForward(car);
    state.player.x = car.x - f.x * 3;
    state.player.z = car.z - f.z * 3;
    state.player.heading = car.heading;
    state.player.inCar = null;
    car.speed *= 0.3;
  }

  function punch() {
    const p = state.player;
    if (p.punchCooldown > 0 || p.inCar) return;
    p.punchCooldown = 0.45;
    state.audio.punch();
    const f = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
    for (const ped of state.peds) {
      if (ped.down) continue;
      const dx = ped.x - p.x;
      const dz = ped.z - p.z;
      const dist = Math.hypot(dx, dz);
      const facing = (dx * f.x + dz * f.z) / (dist || 1);
      if (dist < 2.4 && facing > 0.3) {
        ped.down = true;
        addCrime(state.wanted, 1);
        state.hud.toast('You knocked out a pedestrian! Wanted level up.');
        state.renderer.spawnParticles(ped.x, 1.2, ped.z, 8, 4, 2);
        return;
      }
    }
    // Punching a car door dents it.
    const car = nearestCar(3);
    if (car) {
      car.health -= 4;
      state.renderer.spawnParticles(car.x, 1, car.z, 6, 4, 2);
    }
  }

  function shoot() {
    const p = state.player;
    if (p.shootCooldown > 0 || p.inCar || p.ammo <= 0) return;
    p.shootCooldown = 0.28;
    p.ammo -= 1;
    state.audio.gunshot();
    addCrime(state.wanted, 1);
    const yaw = state.camYaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const ox = p.x + fx * 0.5;
    const oz = p.z + fz * 0.5;
    state.renderer.spawnParticles(ox, 1.5, oz, 6, 2, 1);
    let best = null;
    let bestDist = 35;
    for (const ped of state.peds) {
      if (ped.down) continue;
      const dx = ped.x - p.x;
      const dz = ped.z - p.z;
      const dist = Math.hypot(dx, dz);
      const facing = (dx * fx + dz * fz) / (dist || 1);
      if (dist < bestDist && facing > 0.92) {
        bestDist = dist;
        best = { kind: 'ped', target: ped };
      }
    }
    for (const car of state.cars) {
      if (car.wrecked) continue;
      const dx = car.x - p.x;
      const dz = car.z - p.z;
      const dist = Math.hypot(dx, dz);
      const facing = (dx * fx + dz * fz) / (dist || 1);
      if (dist < bestDist && facing > 0.9) {
        bestDist = dist;
        best = { kind: 'car', target: car };
      }
    }
    if (best) {
      state.renderer.spawnParticles(best.target.x, 1.2, best.target.z, 12, 5, 3);
      if (best.kind === 'ped') {
        best.target.down = true;
        state.hud.toast('Pedestrian down!');
      } else {
        best.target.health -= 25;
        if (best.target.health <= 0) {
          best.target.wrecked = true;
          best.target.speed = 0;
        }
      }
    }
  }

  function syncMeshes(dt) {
    const now = performance.now();
    // Player.
    ensurePersonMesh('player', 0x2a6ac0, 0x2a2f38);
    const pm = state.renderer.dynamic.get('player');
    if (state.player.inCar) {
      pm.group.visible = false;
    } else {
      pm.group.visible = true;
      pm.group.position.set(state.player.x, 0, state.player.z);
      pm.group.rotation.y = state.player.heading;
      const swing = state.player.speed > 0.1 ? Math.sin(state.player.walkPhase) * 0.55 : 0;
      pm.legL.rotation.x = swing;
      pm.legR.rotation.x = -swing;
      pm.armL.rotation.x = -swing * 0.7;
      pm.armR.rotation.x = swing * 0.7;
    }
    // Cars.
    for (const car of state.cars) {
      ensureCarMesh(car);
      const rec = state.renderer.dynamic.get('car' + car.id);
      rec.group.position.set(car.x, 0, car.z);
      rec.group.rotation.y = car.heading - Math.PI / 2;
      rec.spin += car.speed * dt * 2.4;
      for (const wheel of rec.wheels) wheel.rotation.y = rec.spin;
      for (const pivot of rec.steer) pivot.rotation.y = car.steer * 0.9;
      if (rec.lightRed && rec.lightBlue) {
        const on = Math.floor(now / 260) % 2 === 0;
        rec.lightRed.visible = on && !car.wrecked;
        rec.lightBlue.visible = !on && !car.wrecked;
      }
      if (car.smoke > 0 && Math.random() < 0.3) {
        state.renderer.spawnParticles(car.x, 1.4, car.z, 2, 1.5, 2.5);
      }
    }
    // Pedestrians.
    state.peds.forEach((ped, i) => {
      const id = 'ped' + i;
      ensurePersonMesh(id, ped.shirt, ped.pants);
      const rec = state.renderer.dynamic.get(id);
      rec.group.position.set(ped.x, 0, ped.z);
      rec.group.rotation.y = ped.heading;
      if (ped.down) {
        rec.group.rotation.x = Math.PI / 2;
        rec.group.position.y = 0.3;
      } else {
        rec.group.rotation.x = 0;
        const swing = Math.sin(ped.walkPhase) * 0.5;
        rec.legL.rotation.x = swing;
        rec.legR.rotation.x = -swing;
        rec.armL.rotation.x = -swing * 0.6;
        rec.armR.rotation.x = swing * 0.6;
      }
    });
    // Remove meshes of despawned police.
    for (const id of [...state.renderer.dynamic.keys()]) {
      if (!id.startsWith('car')) continue;
      const carId = Number(id.slice(3));
      if (!state.cars.some((c) => c.id === carId)) removeMesh(id);
    }
  }

  function stepAmbient(dt) {
    // Title screen: traffic and pedestrians keep the city alive.
    for (const car of state.cars) {
      if (car.traffic && !car.wrecked) stepTrafficCar(car, dt, state.city.buildings, state.cars, state.rng);
    }
    stepPeds(state.peds, dt, state.city.buildings, [], state.rng);
    state.timeOfDay = Math.min(0.98, state.timeOfDay + dt / 600);
    state.renderer.setTimeOfDay(state.timeOfDay);
  }

  function stepPlay(dt, input, actions) {
    const p = state.player;
    const car = playerCar();
    // Camera orbit from the mouse.
    const mouse = input.takeMouseDelta();
    state.camYaw -= mouse.x * 0.0032;
    state.camPitch = Math.max(0.08, Math.min(1.1, state.camPitch + mouse.y * 0.0022));

    if (actions & ACTION_ENTER) {
      if (car) exitCar();
      else enterCar();
    }
    if (actions & ACTION_PUNCH) punch();
    if (actions & ACTION_SHOOT || input.mouseDown()) shoot();
    if (actions & ACTION_MUTE) state.audio.setMuted(!state.audio.isMuted());

    const forward = { x: Math.sin(state.camYaw), z: Math.cos(state.camYaw) };
    const right = { x: Math.cos(state.camYaw), z: -Math.sin(state.camYaw) };
    if (car && !car.wrecked) {
      stepDrivenCar(car, dt, input.drive(), input.steer(), input.handbrake(), state.city.buildings, state.cars, onCrash);
      if (input.handbrake() && Math.abs(car.speed) > 6 && Math.random() < 0.4) {
        state.renderer.spawnParticles(car.x, 0.2, car.z, 2, 2, 1);
      }
      state.audio.setEngine(Math.abs(car.speed) / 48, true);
      // Running over pedestrians.
      for (const ped of state.peds) {
        if (ped.down) continue;
        if (Math.hypot(ped.x - car.x, ped.z - car.z) < 2.2 && Math.abs(car.speed) > 2) {
          ped.down = true;
          addCrime(state.wanted, 1);
          state.hud.toast('You ran over a pedestrian! Wanted level up.');
        }
      }
    } else {
      const moveX = forward.x * input.drive() - right.x * input.steer();
      const moveZ = forward.z * input.drive() - right.z * input.steer();
      stepPlayer(p, dt, moveX, moveZ, input.run(), state.city.buildings);
      state.audio.setEngine(0, false);
    }

    // Traffic and pedestrians.
    for (const c of state.cars) {
      if (c.traffic && !c.wrecked && c !== car) stepTrafficCar(c, dt, state.city.buildings, state.cars, state.rng);
    }
    const threats = [{ x: playerX(), z: playerZ(), radius: 10 }];
    if (car) threats.push({ x: car.x, z: car.z, radius: 12 });
    stepPeds(state.peds, dt, state.city.buildings, threats, state.rng);
    resolveCarCollisions(state.cars, onCrash);

    // Police: match the wanted level, chase the player, ram on foot.
    const want = policeCount(state.wanted.level);
    while (state.police.length < want) spawnPoliceCar();
    if (state.police.length > want) {
      const extra = state.police.pop();
      state.cars = state.cars.filter((c) => c !== extra);
    }
    let policeNear = false;
    let anySiren = false;
    for (const cop of state.police) {
      stepPoliceCar(cop, dt, playerX(), playerZ(), state.city.buildings, state.cars, onCrash);
      const d = Math.hypot(cop.x - playerX(), cop.z - playerZ());
      if (d < 70) policeNear = true;
      if (d < 120) anySiren = true;
      // Ram the player on foot.
      if (!car && d < 2.6) {
        state.playerHurtCooldown -= dt;
        if (state.playerHurtCooldown <= 0) {
          state.player.health -= 12;
          state.playerHurtCooldown = 1;
          state.audio.crash();
          state.hud.toast('The police are beating you down!');
          const dx = p.x - cop.x;
          const dz = p.z - cop.z;
          const len = Math.hypot(dx, dz) || 1;
          const fixed = { x: p.x + (dx / len) * 3, z: p.z + (dz / len) * 3 };
          p.x = fixed.x;
          p.z = fixed.z;
        }
      }
    }
    state.audio.setSiren(anySiren);
    updateWanted(state.wanted, dt, policeNear);

    // Busted: caught on foot by the police.
    if (state.wanted.level > 0 && !car) {
      const nearCop = state.police.some((cop) => Math.hypot(cop.x - p.x, cop.z - p.z) < 4.5 && p.speed < 1.5);
      if (nearCop) {
        state.bustedTimer += dt;
        if (state.bustedTimer > 1.5) {
          state.audio.busted();
          saveGame();
          return 'busted';
        }
      } else {
        state.bustedTimer = 0;
      }
    } else {
      state.bustedTimer = 0;
    }
    if (p.health <= 0) {
      state.audio.busted();
      saveGame();
      return 'wasted';
    }

    // Missions.
    const missionEvent = updateMission(state.mission, dt, {
      playerX: playerX(),
      playerZ: playerZ(),
      spots: state.city.spots,
      drivingSport: !!(car && car === state.sportCar),
      wanted: state.wanted.level,
    });
    if (missionEvent === 'step') {
      state.audio.pickup();
      state.hud.toast('Objective updated.');
    } else if (missionEvent === 'done') {
      const mission = MISSIONS.find((m) => m.id === state.mission.done[state.mission.done.length - 1]);
      state.cash += mission.reward;
      state.audio.missionDone();
      saveGame();
      return 'mission-done';
    } else if (missionEvent === 'failed') {
      state.audio.busted();
      state.hud.toast('Job failed. Talk to Lena to try again.');
    }

    // Day cycle.
    state.timeOfDay = Math.min(0.98, state.timeOfDay + dt / 480);
    state.renderer.setTimeOfDay(state.timeOfDay);
    state.time += dt;
    return null;
  }

  function step(dt, input, actions) {
    if (state.screen === 'title') {
      stepAmbient(dt);
    } else if (state.screen === 'play') {
      return stepPlay(dt, input, actions);
    }
    return null;
  }

  function focus() {
    const car = playerCar();
    if (car) return { x: car.x, y: 1.5, z: car.z };
    return { x: state.player.x, y: 1.4, z: state.player.z };
  }

  function cameraDistance() {
    if (state.camDist) return state.camDist;
    return playerCar() ? 11 : 8;
  }

  return {
    state,
    reset,
    step,
    syncMeshes,
    playerCar,
    playerX,
    playerZ,
    playerHeading,
    missionTarget,
    nextMission,
    missionStep() {
      return currentStep(state.mission);
    },
    startMission() {
      return startMission(state.mission, state.wanted);
    },
    focus,
    cameraDistance,
    saveGame,
    get cash() { return state.cash; },
    get wanted() { return state.wanted; },
    get player() { return state.player; },
    get cars() { return state.cars; },
    get peds() { return state.peds; },
    get mission() { return state.mission; },
    get timeOfDay() { return state.timeOfDay; },
  };
}
