// Solmar Heat: the game itself. Wires the pure-logic modules (city, cars, peds,
// police, combat, missions) to the renderer, the HUD and the sound, and runs the
// frame loop. Played with keyboard and mouse; the title screen starts it.
import { buildCity, resolveBuildingCollision, clampToWorld } from './city.js';
import { makeCar, updateDrivenCar, updateTrafficCar, separateCars } from './vehicles.js';
import { spawnPeds, updatePed, scarePeds, updatePlayerOnFoot } from './people.js';
import {
  makePolice, policeSpawnPoints, wantedPoliceCount, updatePoliceCar,
  updateWanted, updateBusted, makeHelicopter, updateHelicopter,
} from './police.js';
import { punch, shoot, applyHit, addStars, ramDamage, nearestPoliceDist } from './combat.js';
import { makeMissionState, startMission, updateMissions, currentObjective, objectiveDistance, missionsLeft } from './missions.js';
import { makeInput } from './input.js';
import { makeAudio } from './audio.js';
import { makeHud } from './hud.js';
import { createRenderer } from './render.js';
import { shotParams, stageShot } from './shots.js';
import { CITY, WORLD, PLAYER, CAR, WANTED, DAY, RADIO, PALETTE } from './config.js';
import { makeRng, clamp, dist2 } from './random.js';

const SAVE_KEY = 'solmar-heat-save-v1';
window.__gameErrors = [];

window.addEventListener('error', (e) => window.__gameErrors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => window.__gameErrors.push(String(e.reason)));

export function createGame() {
  const rng = makeRng(WORLD.SEED);
  const city = buildCity(WORLD.SEED);
  const canvas = document.getElementById('game');
  const render = createRenderer(canvas, city);
  const input = makeInput();
  input.attach(canvas);
  const audio = makeAudio();
  const hud = makeHud();
  hud.build();

  const state = {
    mode: 'title',
    city,
    player: {
      x: WORLD.PLAYER_START.x, z: WORLD.PLAYER_START.z,
      heading: Math.PI, speed: 0, walkPhase: 0,
      inCar: false, health: PLAYER.MAX_HEALTH, car: null,
    },
    playerCar: null,
    traffic: [],
    parked: [],
    police: [],
    peds: [],
    heli: makeHelicopter(),
    money: PLAYER.START_MONEY,
    ammo: PLAYER.START_AMMO,
    wanted: 0,
    secondsSinceCrime: 999,
    quietState: {},
    bustedState: {},
    missions: makeMissionState(),
    elapsed: 0,
    hour: DAY.START_HOUR,
    hourOverride: null, // a staged shot (or a night mission) pins the hour
    autoDrive: false, // staged shots keep the car rolling on their own
    lastRamAt: -99,
    camYaw: 0,
    titleTime: 0,
    tracer: null,
    tracerLife: 0,
    punchCooldown: 0,
    shotCooldown: 0,
    lastDamageAt: -99,
    saveTimer: 0,
    shot: null,
    shotFrames: 0,
  };

  // Traffic: 10 AI cars spread over the roads.
  for (let i = 0; i < WORLD.TRAFFIC_CARS; i++) {
    const car = makeCar({ kind: 'traffic', id: i, color: rng.pick(PALETTE.CAR_COLORS) });
    state.traffic.push(car);
  }
  // Parked cars the player can steal, tucked beside streets across the city.
  const parkSpots = [
    [-25, -175], [25, -125], [-175, -25], [125, -75], [-75, 75],
    [175, 25], [-125, 175], [75, 125], [-25, -25],
  ];
  parkSpots.forEach((spot, i) => {
    const car = makeCar({
      kind: 'parked', id: 100 + i, x: spot[0], z: spot[1],
      heading: rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
      color: i === 8 ? 0xd4a017 : rng.pick(PALETTE.CAR_COLORS),
    });
    car.missionCar = i === 8; // the gold Comet for Hot Wheels
    state.parked.push(car);
  });
  state.peds = spawnPeds(city, WORLD.PEDESTRIANS, rng);

  // Restore a previous save (money + missions), unless this is a staged shot.
  const params = shotParams();
  if (!params) {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (saved) {
        state.money = saved.money ?? state.money;
        if (Array.isArray(saved.done)) state.missions.done = saved.done.slice();
        if (typeof saved.x === 'number') {
          state.player.x = saved.x;
          state.player.z = saved.z;
        }
      }
    } catch {
      // A corrupt save never blocks the game.
    }
  }

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: state.money,
        done: state.missions.done,
        x: state.player.x,
        z: state.player.z,
      }));
    } catch {
      // Storage may be unavailable; the game still plays.
    }
  }

  const game = {
    state,
    showTitle() {
      state.mode = 'title';
      hud.showScreen('title');
    },
    setHour(h) {
      state.hour = h;
      state.hourOverride = h;
    },
    setWanted(n) {
      state.wanted = clamp(n, 0, WANTED.MAX);
      syncPolice();
    },
    spawnPolice(n) {
      syncPolice(n);
    },
    snapCamera() {
      render.snapCamera();
    },
    startMissionAt(i) {
      const def = startMission(state.missions, i);
      if (def) hud.setMessage(def.intro, 6);
      return def;
    },
    enterCar(car) {
      state.player.inCar = true;
      state.player.car = car;
      state.playerCar = car;
      car.kind = 'player';
      const pi = state.parked.indexOf(car);
      if (pi >= 0) state.parked.splice(pi, 1);
    },
  };

  function nearestParked(maxD) {
    let best = null;
    let bestD = maxD;
    for (const car of state.parked) {
      const d = dist2(state.player.x, state.player.z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function syncPolice(forceCount) {
    const want = forceCount !== undefined ? forceCount : wantedPoliceCount(state.wanted);
    const active = state.police.filter((c) => !c.disabled);
    if (active.length < want) {
      const spots = policeSpawnPoints(city, state.player.x, state.player.z, want - active.length, rng);
      spots.forEach((spot, i) => {
        state.police.push(makePolice(state.police.length + i, spot.x, spot.z));
      });
    } else if (active.length > want) {
      // Remove the farthest active cars first.
      const sorted = active
        .map((c) => ({ c, d: dist2(c.x, c.z, state.player.x, state.player.z) }))
        .sort((a, b) => b.d - a.d);
      for (let i = 0; i < active.length - want; i++) {
        const idx = state.police.indexOf(sorted[i].c);
        if (idx >= 0) state.police.splice(idx, 1);
      }
    }
  }

  function commitCrime(stars) {
    if (stars <= 0) return;
    state.wanted = addStars(state.wanted, stars);
    state.secondsSinceCrime = 0;
    syncPolice();
  }

  function startPlaying() {
    audio.ensure();
    state.mode = 'playing';
    hud.showScreen(null);
    hud.setMessage('Welcome to Solmar City. Press T for a job from Lena Voss.', 5);
  }

  function endGame(kind) {
    state.mode = kind;
    hud.showScreen(kind);
    audio.busted();
    save();
  }

  // ---- per-frame updates ----
  function updatePlayer(dt) {
    const p = state.player;
    const pair = input.movePair();
    if (p.inCar && state.playerCar) {
      const car = state.playerCar;
      updateDrivenCar(car, {
        throttle: pair.y > 0 || state.autoDrive,
        brake: pair.y < 0,
        steer: state.autoDrive ? 0 : pair.x,
        handbrake: input.handbrake,
      }, dt);
      if (resolveBuildingCollision(city, car, CAR.RADIUS)) car.speed *= 0.4;
      clampToWorld(car);
      p.x = car.x;
      p.z = car.z;
      p.heading = car.heading;
      p.speed = car.speed;
    } else {
      // On foot: A/D turn, W/S walk forward/back, Shift runs.
      p.heading += -pair.x * 2.6 * dt;
      const mx = Math.sin(p.heading) * pair.y;
      const mz = Math.cos(p.heading) * pair.y;
      updatePlayerOnFoot(p, { mx, mz, run: input.run }, dt, city);
    }
    // Camera orbit from mouse drag.
    state.camYaw += input.dragDX * 0.005;
    state.camYaw = clamp(state.camYaw, -1.2, 1.2);
  }

  function updateEnterExit() {
    const p = state.player;
    if (!input.wasPressed('KeyE')) return;
    if (p.inCar && state.playerCar) {
      const car = state.playerCar;
      p.inCar = false;
      p.car = null;
      state.playerCar = null;
      p.x = car.x + Math.cos(car.heading) * 2.5;
      p.z = car.z - Math.sin(car.heading) * 2.5;
      p.heading = car.heading;
      car.kind = 'parked';
      state.parked.push(car);
      car.speed = 0;
    } else {
      const car = nearestParked(4);
      if (car) {
        game.enterCar(car);
        commitCrime(WANTED.CRIME.STEAL_CAR);
        hud.setMessage(car.missionCar ? 'The gold Comet. Lena will be pleased.' : 'Car stolen. The law noticed.', 3);
        audio.blip(220, 0.12, 'square', 0.12);
      }
    }
  }

  function updateCombat(dt) {
    const p = state.player;
    state.punchCooldown = Math.max(0, state.punchCooldown - dt);
    state.shotCooldown = Math.max(0, state.shotCooldown - dt);
    if (state.tracerLife > 0) {
      state.tracerLife -= dt;
      if (state.tracerLife <= 0) state.tracer = null;
    }
    if (p.inCar) return;
    if (input.wasPressed('KeyF') && state.punchCooldown <= 0) {
      state.punchCooldown = PLAYER.PUNCH_COOLDOWN;
      const victims = punch(p, state.peds, state.police, state.traffic);
      let killed = false;
      for (const v of victims) {
        const ev = applyHit({ kind: v.kind, target: v.target }, PLAYER.PUNCH_DAMAGE, state);
        if (ev && ev.type === 'kill') killed = true;
        if (ev && ev.kind === 'ped' && ev.type === 'hurt') commitCrime(WANTED.CRIME.PUNCH_PED);
      }
      if (victims.length > 0) {
        audio.punchHit();
        if (killed) commitCrime(WANTED.CRIME.KILL);
      }
    }
    if (input.mouseDown && state.shotCooldown <= 0 && state.ammo > 0) {
      state.shotCooldown = PLAYER.SHOT_COOLDOWN;
      state.ammo--;
      const hit = shoot(p, p.heading, state.peds, state.police, state.traffic);
      const hx = hit ? hit.target.x : p.x + Math.sin(p.heading) * PLAYER.SHOT_RANGE;
      const hz = hit ? hit.target.z : p.z + Math.cos(p.heading) * PLAYER.SHOT_RANGE;
      state.tracer = { x1: p.x, z1: p.z, x2: hx, z2: hz, life: 0.08 };
      state.tracerLife = 0.08;
      audio.gunshot();
      scarePeds(state.peds, hx, hz, 40, rng);
      commitCrime(WANTED.CRIME.SHOOT);
      if (hit) {
        const ev = applyHit(hit, PLAYER.SHOT_DAMAGE, state);
        if (ev && ev.type === 'kill') commitCrime(WANTED.CRIME.KILL);
        if (ev && ev.kind === 'police') hud.setMessage('You hit a cop. That will cost you.', 3);
      }
    }
  }

  function updateWorld(dt) {
    // Traffic.
    for (const car of state.traffic) {
      updateTrafficCar(car, city, rng, dt, state.traffic);
      resolveBuildingCollision(city, car, CAR.RADIUS);
      clampToWorld(car);
    }
    // Parked cars never move, but keep them inside the world.
    for (const car of state.parked) clampToWorld(car);
    // Peds.
    for (const ped of state.peds) updatePed(ped, city, rng, dt);
    // Police pursuit + ramming.
    for (const car of state.police) {
      if (car.disabled) continue;
      if (car.frozen) {
        // Staged shot: hold the line straight ahead at the staged speed, so
        // the car stays in the camera's view instead of U-turning after the
        // player (the pursuit AI would bring it behind the camera).
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
      } else {
        updatePoliceCar(car, city, state.player, dt);
      }
      resolveBuildingCollision(city, car, CAR.RADIUS);
      clampToWorld(car);
    }
    // Car-car separation.
    const allCars = [...state.traffic, ...state.police, ...state.parked];
    if (state.playerCar) allCars.push(state.playerCar);
    for (let i = 0; i < allCars.length; i++) {
      for (let j = i + 1; j < allCars.length; j++) {
        if (separateCars(allCars[i], allCars[j])) {
          // A hard shunt hurts the player when a police car rams them, at most
          // once a second: without the cooldown one long contact drains all health.
          if (state.playerCar && (allCars[i] === state.playerCar || allCars[j] === state.playerCar)) {
            const other = allCars[i] === state.playerCar ? allCars[j] : allCars[i];
            if (other.kind === 'police' && Math.abs(other.speed) > 8 && state.elapsed - state.lastRamAt > 1) {
              state.lastRamAt = state.elapsed;
              damagePlayer(ramDamage(other.speed), other);
            }
          }
        }
      }
    }
    // Traffic running the player over on foot, at most once a second.
    if (!state.player.inCar) {
      for (const car of [...state.traffic, ...state.police]) {
        if (dist2(car.x, car.z, state.player.x, state.player.z) < CAR.RADIUS && Math.abs(car.speed) > 4) {
          if (state.elapsed - state.lastRamAt > 1) {
            state.lastRamAt = state.elapsed;
            damagePlayer(ramDamage(car.speed), car);
          }
          state.player.x += Math.sin(state.player.heading) * 2;
          state.player.z += Math.cos(state.player.heading) * 2;
        }
      }
    }
    // Helicopter at 4+ stars.
    updateHelicopter(state.heli, state.player, dt, state.wanted >= WANTED.HELI_STARS);
  }

  function damagePlayer(amount, source) {
    const p = state.player;
    if (state.mode !== 'playing') return;
    p.health -= amount;
    state.lastDamageAt = state.elapsed;
    if (p.health <= 0) {
      p.health = 0;
      endGame('wasted');
    }
  }

  function updateWantedAndBusted(dt) {
    state.secondsSinceCrime += dt;
    const nearest = nearestPoliceDist(state.police, state.player);
    const before = state.wanted;
    state.wanted = updateWanted(state.wanted, state.secondsSinceCrime, nearest, dt, state.quietState);
    if (state.wanted !== before) syncPolice();
    if (state.wanted > 0 && updateBusted(state.bustedState, state.police, state.player, dt)) {
      endGame('busted');
    }
    // Slow health regen after 10 quiet seconds.
    if (state.elapsed - state.lastDamageAt > 10 && state.player.health < PLAYER.MAX_HEALTH) {
      state.player.health = Math.min(PLAYER.MAX_HEALTH, state.player.health + 4 * dt);
    }
  }

  function updateMissionsFrame(dt) {
    if (input.wasPressed('KeyT') && !state.missions.active && state.missions.index < 5) {
      const def = game.startMissionAt(state.missions.index);
      if (def && def.wanted) {
        state.wanted = Math.max(state.wanted, def.wanted);
        syncPolice();
      }
      if (def) state.ammo = Math.max(state.ammo, PLAYER.START_AMMO);
    }
    const events = updateMissions(state.missions, state.player, dt);
    for (const ev of events) {
      if (ev.type === 'complete') {
        state.money += ev.reward;
        audio.missionDone();
        hud.setMessage(`Mission complete: ${ev.mission.name} — $${ev.reward}`, 5);
        save();
      } else if (ev.type === 'failed') {
        hud.setMessage(`Mission failed: ${ev.reason}`, 4);
        audio.busted();
      } else if (ev.type === 'stage') {
        audio.pickup();
        hud.setMessage(ev.label, 4);
      }
    }
  }

  // ---- frame loop ----
  let last = performance.now();
  let frames = 0;
  function frame(now) {
    const dt = clamp((now - last) / 1000, 0.001, 0.05);
    last = now;
    frames++;
    if (state.mode === 'title') {
      state.titleTime += dt;
      render.sync({
        player: state.player, playerCar: null, traffic: state.traffic,
        parked: state.parked, police: [], peds: state.peds,
        heli: { active: false }, objective: null, hour: state.hour,
        tracer: null, camYaw: 0, camMode: 'title', titleTime: state.titleTime,
      }, dt, now / 1000);
    } else if (state.mode === 'playing') {
      state.elapsed += dt;
      // A staged shot pins the hour; a night mission forces a late hour;
      // otherwise the clock runs from the 17:20 opening.
      const active = state.missions.active;
      state.hour = state.hourOverride ?? (active && active.night ? 22.4 : hud.hourOf(state.elapsed));
      updatePlayer(dt);
      updateEnterExit();
      updateCombat(dt);
      updateWorld(dt);
      updateWantedAndBusted(dt);
      updateMissionsFrame(dt);
      if (input.wasPressed('KeyM')) {
        audio.setMuted(!audio.muted);
      }
      if (input.wasPressed('KeyR')) {
        const name = audio.cycleStation();
        hud.setMessage(`Radio: ${name}`, 2);
      }
      if (input.wasPressed('Escape')) {
        state.mode = 'paused';
        hud.showScreen('pause');
      }
      const obj = currentObjective(state.missions);
      hud.update({
        money: state.money,
        wanted: state.wanted,
        health: state.player.health,
        ammo: state.ammo,
        speed: state.playerCar ? state.playerCar.speed : 0,
        inCar: state.player.inCar,
        objective: obj,
        objectiveDist: objectiveDistance(state.missions, state.player),
        missionsLeft: missionsLeft(state.missions),
        hour: state.hour,
        radio: RADIO[audio.station].name,
        muted: audio.muted,
        city,
        traffic: state.traffic,
        peds: state.peds,
        police: state.police,
        heli: state.heli,
        player: state.player,
      });
      audio.setEngine(state.playerCar ? Math.abs(state.playerCar.speed) / CAR.MAX_SPEED : 0, state.player.inCar);
      audio.setSiren(state.police.length > 0, nearestPoliceDist(state.police, state.player));
      render.sync({
        player: state.player, playerCar: state.playerCar, traffic: state.traffic,
        parked: state.parked, police: state.police, peds: state.peds,
        heli: state.heli, objective: obj, hour: state.hour,
        tracer: state.tracer, camYaw: state.camYaw, camMode: 'follow',
      }, dt, now / 1000);
      state.saveTimer += dt;
      if (state.saveTimer > 5) {
        state.saveTimer = 0;
        save();
      }
    } else if (state.mode === 'paused') {
      if (input.wasPressed('Escape')) {
        state.mode = 'playing';
        hud.showScreen(null);
      }
      render.sync({
        player: state.player, playerCar: state.playerCar, traffic: state.traffic,
        parked: state.parked, police: state.police, peds: state.peds,
        heli: state.heli, objective: currentObjective(state.missions), hour: state.hour,
        tracer: null, camYaw: state.camYaw, camMode: 'follow',
      }, 0.0001, now / 1000);
    }
    // Screenshot readiness: the camera has had its settle frames.
    if (state.shot) {
      state.shotFrames++;
      if (state.shotFrames >= state.shot.readyAfterFrames && !window.__shotReady) {
        window.__shotReady = true;
        document.title = 'shot-ready';
      }
    }
    input.endFrame();
    requestAnimationFrame(frame);
  }

  function resize() {
    render.resize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  // Title screen buttons.
  const startBtn = document.getElementById('btn-start');
  if (startBtn) startBtn.addEventListener('click', () => { audio.ensure(); startPlaying(); });
  const resumeBtn = document.getElementById('btn-resume');
  if (resumeBtn) resumeBtn.addEventListener('click', () => { state.mode = 'playing'; hud.showScreen(null); });
  const retryBtns = document.querySelectorAll('[data-retry]');
  retryBtns.forEach((btn) => btn.addEventListener('click', () => {
    state.player.health = PLAYER.MAX_HEALTH;
    state.player.x = WORLD.PLAYER_START.x;
    state.player.z = WORLD.PLAYER_START.z;
    state.player.inCar = false;
    state.player.car = null;
    state.playerCar = null;
    state.wanted = 0;
    state.police = [];
    state.mode = 'playing';
    hud.showScreen(null);
  }));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && state.mode === 'title') startPlaying();
  });

  // Staged screenshot? Set the world up, then play so the camera can settle.
  // The title shot stays on the title screen; the others play.
  if (params) {
    state.shot = stageShot(game, params);
    if (state.shot.name !== 'title') {
      state.mode = 'playing';
      hud.showScreen(null);
    }
  } else {
    game.showTitle();
  }

  window.__game = game;
  requestAnimationFrame(frame);
  return game;
}

createGame();
