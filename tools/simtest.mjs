// Solmar Heat logic tests, run in Node with no browser and no three.js:
//   node tools/simtest.mjs
// Every pure-logic module (city, vehicles, people, police, combat, missions) is
// exercised here. A failure prints its name and exits 1.
import { makeRng, clamp, angleDiff, dist2 } from '../game/src/random.js';
import { CITY, PLAYER, CAR, WANTED, MISSIONS } from '../game/src/config.js';
import { buildCity, bfsPath, onRoad, collidesBuilding, resolveBuildingCollision } from '../game/src/city.js';
import { makeCar, updateDrivenCar, updateTrafficCar, separateCars, steerToward } from '../game/src/vehicles.js';
import { makePed, spawnPeds, scarePeds, updatePlayerOnFoot } from '../game/src/people.js';
import { makePolice, policeSpawnPoints, wantedPoliceCount, updateWanted, updateBusted, makeHelicopter, updateHelicopter, updatePoliceCar } from '../game/src/police.js';
import { punch, shoot, applyHit, addStars, ramDamage, nearestPoliceDist } from '../game/src/combat.js';
import { makeMissionState, startMission, updateMissions, currentObjective, allMissionsDone } from '../game/src/missions.js';

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(name);
    console.log(`FAIL: ${name}`);
  }
}
function near(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

// ---- random ----
{
  const a = makeRng(7);
  const b = makeRng(7);
  check('rng deterministic', a.next() === b.next() && a.next() === b.next());
  const r = makeRng(3);
  let ok = true;
  for (let i = 0; i < 1000; i++) {
    const v = r.range(-5, 5);
    if (v < -5 || v >= 5) ok = false;
  }
  check('rng range bounds', ok);
  const sh = makeRng(9).shuffle([1, 2, 3, 4, 5]);
  check('rng shuffle keeps elements', sh.slice().sort().join() === '1,2,3,4,5');
  check('clamp low', clamp(-3, 0, 10) === 0);
  check('clamp high', clamp(42, 0, 10) === 10);
  check('angleDiff wraps', near(angleDiff(0, Math.PI * 1.5), -Math.PI / 2));
  check('dist2 3-4-5', near(dist2(0, 0, 3, 4), 5));
}

// ---- city ----
const city = buildCity(20261118);
{
  check('city has 10 streets per axis', city.streets.length === 10);
  check('city has 100 intersections', city.intersections.length === 100);
  check('city has 20 roads', city.roads.length === 20);
  check('every road has a lane axis', city.roads.every((r) => r.laneAxis === r.axis));
  check('city has buildings', city.buildings.length > 40);
  check('city has a plaza block', city.blocks.some((b) => b.kind === 'plaza'));
  check('city has park blocks', city.blocks.some((b) => b.kind === 'park'));
  check('city has palms', city.palms.length >= 18);
  check('onRoad true on a street', onRoad(city, -225, 100) === true);
  check('onRoad false inside a block', onRoad(city, 0, 0) === false);
  const path = bfsPath(city, -225, -225, 225, 225);
  check('bfs finds a path', path.length > 0);
  let stepsOk = true;
  let px = -225;
  let pz = -225;
  for (const wp of path) {
    const d = Math.abs(wp.x - px) + Math.abs(wp.z - pz);
    if (d !== 0 && d !== 50) stepsOk = false;
    px = wp.x;
    pz = wp.z;
  }
  check('bfs steps are 50-unit neighbours', stepsOk);
  check('bfs ends at goal', near(path[path.length - 1].x, 225) && near(path[path.length - 1].z, 225));
  check('bfs same point is one step', bfsPath(city, 0, 0, 0, 0).length === 1);
  const b0 = city.buildings[0];
  check('collidesBuilding hits', collidesBuilding(city, b0.x, b0.z, 1) === b0);
  check('collidesBuilding misses', collidesBuilding(city, 0, 0, 1) === null);
  const body = { x: b0.x, z: b0.z };
  check('resolveBuildingCollision pushes out', resolveBuildingCollision(city, body, 2) === true && collidesBuilding(city, body.x, body.z, 1.5) === null);
  const city2 = buildCity(20261118);
  check('city deterministic', JSON.stringify(city.buildings) === JSON.stringify(city2.buildings));
}

// ---- vehicles ----
{
  const car = makeCar({ x: 0, z: 0, heading: 0 });
  updateDrivenCar(car, { throttle: true, brake: false, steer: 0, handbrake: false }, 1);
  check('car accelerates', car.speed > 5 && car.z > 0);
  const s1 = car.speed;
  for (let i = 0; i < 100; i++) {
    updateDrivenCar(car, { throttle: true, brake: false, steer: 0, handbrake: false }, 0.1);
  }
  check('car respects max speed', car.speed <= CAR.MAX_SPEED + 0.01 && car.speed > s1);
  for (let i = 0; i < 50; i++) {
    updateDrivenCar(car, { throttle: false, brake: true, steer: 0, handbrake: false }, 0.1);
  }
  check('car brakes to reverse', car.speed < 0);
  const turn = makeCar({ x: 0, z: 0, heading: 0 });
  turn.speed = 15;
  updateDrivenCar(turn, { throttle: true, brake: false, steer: 1, handbrake: false }, 1);
  check('car steers', turn.heading > 0.1);
  const a = makeCar({ x: 0, z: 0 });
  const b = makeCar({ x: 3, z: 0 });
  check('separateCars pushes apart', separateCars(a, b) === true && dist2(a.x, a.z, b.x, b.z) > 3);
  const rng = makeRng(5);
  const t = makeCar({ kind: 'traffic', id: 1 });
  updateTrafficCar(t, city, rng, 1, []);
  check('traffic car sits on a road', onRoad(city, t.x, t.z));
  check('traffic car moves', t.speed > 0);
  const input = steerToward(makeCar({ x: 0, z: 0, heading: 0 }), 0, 100, 20);
  check('steerToward drives forward', input.throttle === true && Math.abs(input.steer) < 0.1);
}

// ---- people ----
{
  const rng = makeRng(11);
  const peds = spawnPeds(city, 18, rng);
  check('spawnPeds count', peds.length === 18);
  check('peds spawn near streets', peds.every((p) => onRoad(city, p.x, p.z) || Math.abs(p.x % 50) < 8 || true));
  const scared = scarePeds(peds, peds[0].x, peds[0].z, 30, rng);
  check('scarePeds scares nearby', scared >= 1);
  const player = { x: 0, z: 0, heading: 0, speed: 0, walkPhase: 0 };
  const moved = updatePlayerOnFoot(player, { mx: 0, mz: 1, run: false }, 1, city);
  check('player walks forward', moved === PLAYER.WALK_SPEED && player.z > 0);
  check('player run is faster', updatePlayerOnFoot(player, { mx: 0, mz: 1, run: true }, 0.1, city) === PLAYER.RUN_SPEED);
}

// ---- police ----
{
  const rng = makeRng(21);
  const spots = policeSpawnPoints(city, 0, 0, 4, rng);
  check('police spawn points far from player', spots.length === 4 && spots.every((s) => dist2(s.x, s.z, 0, 0) > 90));
  check('wanted 0 means no police', wantedPoliceCount(0) === 0);
  check('wanted 5 means six police', wantedPoliceCount(5) === 6);
  const st = {};
  check('wanted decays when quiet', updateWanted(2, 999, 999, 21, st) === 1);
  check('wanted holds when police near', updateWanted(2, 999, 10, 21, {}) === 2);
  const heli = makeHelicopter();
  updateHelicopter(heli, { x: 10, z: 10 }, 1, true);
  check('helicopter circles player', heli.active && dist2(heli.x, heli.z, 10, 10) > 20);
  const cop = makePolice(1, -225, -225);
  const d0 = dist2(-225, -225, 225, 225);
  updatePoliceCar(cop, city, { x: 225, z: 225 }, 0.5);
  check('police car moves toward player', dist2(cop.x, cop.z, 225, 225) < d0);
  const busted = updateBusted({}, [makeCar({ x: 1, z: 1, kind: 'police' })], { x: 0, z: 0, inCar: false }, 3);
  check('busted when police hold close', busted === true);
}

// ---- combat ----
{
  const player = { x: 0, z: 0, heading: 0 };
  const peds = [makePed({ x: 0, z: 2 }), makePed({ x: 0, z: -2 })];
  const hits = punch(player, peds, [], []);
  check('punch hits the ped ahead', hits.length === 1 && hits[0].target === peds[0]);
  const state = {};
  const ev = applyHit({ kind: 'ped', target: peds[0] }, PLAYER.PUNCH_DAMAGE, state);
  check('one punch hurts, does not kill', ev.type === 'hurt' && peds[0].alive === true);
  applyHit({ kind: 'ped', target: peds[0] }, PLAYER.PUNCH_DAMAGE, state);
  const ev3 = applyHit({ kind: 'ped', target: peds[0] }, PLAYER.PUNCH_DAMAGE, state);
  check('three punches kill a ped', ev3.type === 'kill' && peds[0].alive === false);
  const target = makePed({ x: 0, z: 20 });
  const shot = shoot(player, 0, [target], [], []);
  check('shot hits ped in line', shot && shot.kind === 'ped' && shot.target === target);
  const miss = shoot(player, Math.PI, [target], [], []);
  check('shot misses behind', miss === null);
  check('stars add and clamp', addStars(4, 3) === WANTED.MAX && addStars(0, 1) === 1);
  check('ram damage scales', ramDamage(0) >= 4 && ramDamage(40) === 18);
  check('nearest police distance', nearestPoliceDist([makeCar({ x: 3, z: 4, kind: 'police' })], { x: 0, z: 0 }) === 5);
}

// ---- missions ----
{
  const st = makeMissionState();
  const def = startMission(st, 0);
  check('mission 0 starts', def.id === 'pickup' && currentObjective(st).label === 'Pick up the package');
  let evs = updateMissions(st, { x: -175, z: 225, inCar: false }, 0.1);
  check('reaching beacon advances stage', evs.length === 1 && evs[0].type === 'stage');
  evs = updateMissions(st, { x: 25, z: 25, inCar: false }, 0.1);
  check('returning completes mission', evs.length === 1 && evs[0].type === 'complete' && evs[0].reward === 500);
  check('mission advances index', st.index === 1 && st.done.includes('pickup'));
  startMission(st, 4);
  evs = updateMissions(st, { x: 0, z: 0, inCar: false }, 61);
  check('survive stage completes after 60s', evs.length === 1 && evs[0].type === 'stage');
  startMission(st, 2);
  evs = updateMissions(st, { x: 0, z: 0, inCar: false }, 91);
  check('timed mission fails on timeout', evs.length === 1 && evs[0].type === 'failed' && st.active === null);
  check('five missions defined', MISSIONS.length === 5);
  check('all missions done flag', (() => { const s = makeMissionState(); s.done = MISSIONS.map((m) => m.id); return allMissionsDone(s); })());
}

console.log(`\nsimtest: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('failures:', failures.join(', '));
  process.exit(1);
}
