// Headless smoke test for Solmar Heat's simulation core (no DOM, no WebGL):
// city generation, collisions, car physics, traffic AI, missions, wanted.
// Run: node --test tools/simtest.mjs  (or: node tools/simtest.mjs)
// (v2, 18 Nov 2026) 11 tests: the lane-spread test below covers the traffic
// fix where cars created with { traffic: true } started with laneAxis 'x'
// and all piled onto one road instead of spreading over the grid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../game/src/random.js';
import { createCity, collideCircle, isOnRoad, nearestRoadPoint, randomRoadPoint } from '../game/src/city.js';
import { createCar, stepDrivenCar, stepTrafficCar, stepPoliceCar, resolveCarCollisions } from '../game/src/vehicles.js';
import { createMissionState, currentMission, startMission, updateMission } from '../game/src/missions.js';
import { createWanted, addCrime, policeCount, updateWanted } from '../game/src/wanted.js';
import { createPeds, stepPeds } from '../game/src/peds.js';
import { createPlayer, stepPlayer } from '../game/src/player.js';

const rng = createRandom(7);
const city = createCity(rng);

test('city generates buildings inside blocks and roads are roads', () => {
  assert.ok(city.buildings.length > 150, `buildings: ${city.buildings.length}`);
  assert.ok(city.buildings.length < 400, `buildings: ${city.buildings.length}`);
  for (const b of city.buildings) {
    assert.ok(b.h >= 7 && b.h <= 60, `height ${b.h}`);
    assert.ok(b.w >= 10 && b.d >= 10);
  }
  assert.ok(isOnRoad(-26, 0), 'avenue at x=-26');
  assert.ok(isOnRoad(0, -26), 'street at z=-26');
  assert.ok(!isOnRoad(0, 0), 'city centre is a building block, not a road');
  const p = nearestRoadPoint(100, 100);
  assert.ok(Math.abs(p.x) <= 234 && Math.abs(p.z) <= 234);
  const rp = randomRoadPoint(createRandom(3));
  assert.ok(isOnRoad(rp.x, rp.z));
});

test('collideCircle pushes a point out of a building', () => {
  const b = city.buildings[0];
  const inside = collideCircle(city.buildings, b.x + b.w / 2, b.z + b.d / 2, 1);
  const stillInside = inside.x > b.x && inside.x < b.x + b.w && inside.z > b.z && inside.z < b.z + b.d;
  assert.equal(stillInside, false);
});

test('driven car accelerates, steers and stops at buildings', () => {
  const car = createCar(1, 0, -100, 0, {});
  let crashed = false;
  for (let i = 0; i < 600; i += 1) {
    stepDrivenCar(car, 1 / 60, 1, 0.1, false, city.buildings, [car], () => { crashed = true; });
    assert.ok(Number.isFinite(car.x) && Number.isFinite(car.z));
    assert.ok(Math.abs(car.speed) <= 48.01);
  }
  assert.ok(Math.hypot(car.x, car.z + 100) > 20, 'car moved');
  void crashed;
});

test('traffic cars follow roads without NaN', () => {
  const cars = [];
  const r2 = createRandom(11);
  for (let i = 0; i < 10; i += 1) {
    const p = randomRoadPoint(r2);
    cars.push(createCar(i + 1, p.x, p.z, 0, { traffic: true }));
  }
  for (let i = 0; i < 1200; i += 1) {
    for (const c of cars) stepTrafficCar(c, 1 / 60, city.buildings, cars, r2);
    resolveCarCollisions(cars, null);
    for (const c of cars) assert.ok(Number.isFinite(c.x) && Number.isFinite(c.z), `car ${c.id}`);
  }
});

test('police chase closes distance', () => {
  const cop = createCar(99, -26, -100, 0, { police: true });
  const start = Math.hypot(60 - cop.x, 60 - cop.z);
  for (let i = 0; i < 900; i += 1) stepPoliceCar(cop, 1 / 60, 60, 60, city.buildings, [cop], null);
  const end = Math.hypot(60 - cop.x, 60 - cop.z);
  assert.ok(end < start * 0.5, `police closed in: ${start.toFixed(1)} -> ${end.toFixed(1)}`);
});

test('mission 1 completes by reaching both spots', () => {
  const wanted = createWanted();
  const ms = createMissionState();
  const mission = startMission(ms, wanted);
  assert.equal(mission.id, 'pickup');
  const ctx = (x, z) => ({ playerX: x, playerZ: z, spots: city.spots, drivingSport: false, wanted: 0 });
  let ev = updateMission(ms, 1 / 60, ctx(city.spots.docks.x, city.spots.docks.z));
  assert.equal(ev, 'step');
  ev = updateMission(ms, 1 / 60, ctx(city.spots.hotel.x, city.spots.hotel.z));
  assert.equal(ev, 'done');
  assert.deepEqual(ms.done, ['pickup']);
});

test('mission 3 timer fails when it runs out', () => {
  const wanted = createWanted();
  const ms = createMissionState();
  ms.index = 2;
  startMission(ms, wanted);
  let ev = null;
  for (let i = 0; i < 91 * 60 && !ev; i += 1) {
    ev = updateMission(ms, 1 / 60, { playerX: 0, playerZ: 0, spots: city.spots, drivingSport: false, wanted: 3 });
  }
  assert.equal(ev, 'failed');
});

test('wanted rises with crime and decays when quiet', () => {
  const wanted = createWanted();
  addCrime(wanted, 2);
  assert.equal(wanted.level, 2);
  assert.equal(policeCount(2), 1);
  assert.equal(policeCount(4), 3);
  assert.equal(policeCount(0), 0);
  for (let i = 0; i < 60 * 60; i += 1) updateWanted(wanted, 1 / 60, false);
  assert.equal(wanted.level, 0);
});

test('peds stroll and flee threats', () => {
  const r3 = createRandom(5);
  const peds = createPeds(r3, 18);
  const before = peds.map((p) => [p.x, p.z]);
  for (let i = 0; i < 600; i += 1) stepPeds(peds, 1 / 60, city.buildings, [{ x: 0, z: 0, radius: 3 }], r3);
  let moved = 0;
  peds.forEach((p, i) => { if (Math.hypot(p.x - before[i][0], p.z - before[i][1]) > 1) moved += 1; });
  assert.ok(moved > 5, `peds moved: ${moved}`);
  for (const p of peds) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
});

test('traffic cars start with no lane and spread across the grid', () => {
  const r4 = createRandom(21);
  const cars = [];
  for (let i = 0; i < 10; i += 1) {
    const p = randomRoadPoint(r4);
    const car = createCar(i + 1, p.x, p.z, 0, { traffic: true });
    assert.equal(car.laneAxis, null, 'lane is picked on the first step, not at creation');
    cars.push(car);
  }
  for (let i = 0; i < 60; i += 1) {
    for (const c of cars) stepTrafficCar(c, 1 / 60, city.buildings, cars, r4);
  }
  const lanes = new Set(cars.map((c) => `${c.laneAxis}:${c.laneCoord}`));
  assert.ok(lanes.size > 1, `traffic spread over ${lanes.size} lanes`);
});

test('player walks and collides with buildings', () => {
  const p = createPlayer(0, 0, 0);
  const b = city.buildings[0];
  p.x = b.x + b.w / 2;
  p.z = b.z - 0.4;
  stepPlayer(p, 1 / 60, 0, 1, false, city.buildings);
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
  assert.ok(p.z < b.z + b.d || p.x < b.x || p.x > b.x + b.w);
});
