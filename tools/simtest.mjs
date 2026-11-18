// Headless smoke tests for the simulation core. Run: node --test tools/simtest.mjs
// Imports only the simulation modules (no DOM, no three.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../game/src/random.js';
import { CFG } from '../game/src/config.js';
import { roadCoord, bfsPath, nearestNode, PLACES } from '../game/src/city.js';
import { makeCar, stepCarPhysics, spawnTraffic, stepTraffic, stepPolice, makeHeli, stepHeli } from '../game/src/vehicles.js';
import { makePlayer, tryShoot } from '../game/src/player.js';
import { spawnPeds, stepPeds } from '../game/src/peds.js';
import { createWorld, stepWorld, playerPos, enterCar, respawn } from '../game/src/world.js';
import { MISSIONS, startMission } from '../game/src/missions.js';
import { setWanted, addCrime } from '../game/src/wanted.js';
import { stageShot } from '../game/src/shots.js';
import { saveGame, loadGame, applySave } from '../game/src/save.js';
import { dist2d } from '../game/src/config.js';

const stepN = (world, input, n, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) stepWorld(world, input, dt);
};

test('rng is deterministic', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 50; i++) assert.equal(a.next(), b.next());
  assert.notEqual(makeRng(1).next(), makeRng(2).next());
});

test('bfs path crosses the grid contiguously', () => {
  const path = bfsPath(0, 0, 9, 9);
  assert.equal(path.length, 18);
  let [pi, pj] = [0, 0];
  for (const wp of path) {
    assert.equal(Math.abs(wp.i - pi) + Math.abs(wp.j - pj), 1);
    assert.equal(wp.x, roadCoord(wp.i));
    assert.equal(wp.z, roadCoord(wp.j));
    [pi, pj] = [wp.i, wp.j];
  }
  assert.deepEqual([pi, pj], [9, 9]);
  assert.deepEqual(bfsPath(3, 3, 3, 3), []);
});

test('car physics: accelerates, caps, brakes, reverses', () => {
  const rng = makeRng(1);
  const car = makeCar(rng, 'player', 0, 0, 0);
  for (let i = 0; i < 60; i++) stepCarPhysics(car, { throttle: 1, steer: 0 }, 1 / 60);
  assert.ok(car.speed > 15, `speed after 1s throttle: ${car.speed}`);
  for (let i = 0; i < 300; i++) stepCarPhysics(car, { throttle: 1, steer: 0 }, 1 / 60);
  assert.ok(car.speed <= CFG.carMaxSpeed + 0.01);
  const v = car.speed;
  for (let i = 0; i < 60; i++) stepCarPhysics(car, { throttle: -1, steer: 0 }, 1 / 60);
  assert.ok(car.speed < v, 'braking slows the car');
  for (let i = 0; i < 180; i++) stepCarPhysics(car, { throttle: -1, steer: 0 }, 1 / 60);
  assert.ok(car.speed < 0, 'reverses once stopped');
  assert.ok(car.speed >= -CFG.carReverseMax - 0.01);
});

test('traffic stays on the roads', () => {
  const rng = makeRng(7);
  const cars = spawnTraffic(rng, 10, { x: 0, z: 0 });
  assert.equal(cars.length, 10);
  for (let i = 0; i < 600; i++) for (const c of cars) stepTraffic(c, rng, 1 / 60);
  for (const c of cars) {
    const nearRoad = (v) => {
      const i = Math.round((v - CFG.cityMin) / CFG.pitch);
      return Math.abs(v - roadCoord(Math.max(0, Math.min(9, i))));
    };
    assert.ok(Math.min(nearRoad(c.x), nearRoad(c.z)) < 9, `car off road at ${c.x},${c.z}`);
  }
});

test('police BFS pursuit closes in on the player', () => {
  const rng = makeRng(3);
  const cop = makeCar(rng, 'police', roadCoord(0), roadCoord(0), 0);
  cop.speed = 10;
  const target = { x: roadCoord(9), z: roadCoord(9) };
  const d0 = dist2d(cop.x, cop.z, target.x, target.z);
  for (let i = 0; i < 1800; i++) stepPolice(cop, target, rng, 1 / 60);
  const d1 = dist2d(cop.x, cop.z, target.x, target.z);
  assert.ok(d1 < d0 * 0.35, `police did not close in: ${d0.toFixed(0)} -> ${d1.toFixed(0)}`);
});

test('world creation is deterministic', () => {
  const a = createWorld(11), b = createWorld(11);
  assert.deepEqual(a.traffic.map((c) => [c.x, c.z]), b.traffic.map((c) => [c.x, c.z]));
  assert.deepEqual(a.peds.map((p) => [p.x, p.z]), b.peds.map((p) => [p.x, p.z]));
});

test('stealing a car raises wanted and changes state', () => {
  const world = createWorld(5);
  const car = world.traffic[0];
  world.player.x = car.x; world.player.z = car.z;
  stepWorld(world, { enter: true }, 1 / 60);
  assert.equal(world.player.onFoot, false);
  assert.equal(world.player.car, car);
  assert.equal(world.wanted.stars, 1);
  assert.equal(world.stats.carsStolen, 1);
});

test('wanted: crime raises stars, helicopter joins at 4', () => {
  const world = createWorld(5);
  addCrime(world, 4);
  assert.equal(world.wanted.stars, 4);
  updateWantedCheck(world);
  assert.equal(world.heli.active, true);
  assert.ok(world.police.length >= 4);
  // Helicopter follows the player.
  const h = world.heli;
  stepHeli(h, playerPos(world), 1);
  const d = dist2d(h.x, h.z, world.player.x, world.player.z);
  assert.ok(d < 60, `heli too far: ${d}`);
});

function updateWantedCheck(world) {
  // One step with no input runs updateWanted inside stepWorld.
  stepWorld(world, {}, 1 / 60);
}

test('mission 1 completes and pays $500', () => {
  const world = createWorld(9);
  startMission(world, 0);
  assert.equal(world.missions.active, true);
  world.player.x = PLACES.docks.x; world.player.z = PLACES.docks.z;
  stepWorld(world, {}, 1 / 60);
  assert.equal(world.missions.step, 1);
  world.player.x = PLACES.hotel.x; world.player.z = PLACES.hotel.z;
  stepWorld(world, {}, 1 / 60);
  assert.equal(world.missions.done, true);
  assert.equal(world.cash, 250 + 500);
});

test('mission 2 spawns the Comet GT and wants 2 stars', () => {
  const world = createWorld(9);
  startMission(world, 1);
  assert.ok(world.comet, 'no comet spawned');
  assert.equal(world.comet.color, 0xf2c200);
  assert.equal(world.wanted.stars, 2);
});

test('mission 3 advances when heat is lost, then pays at the safehouse', () => {
  const world = createWorld(9);
  startMission(world, 2);
  assert.equal(world.wanted.stars, 3);
  setWanted(world, 0);
  stepWorld(world, {}, 1 / 60);
  assert.equal(world.missions.step, 1);
  world.player.x = PLACES.safehouse.x; world.player.z = PLACES.safehouse.z;
  stepWorld(world, {}, 1 / 60);
  assert.equal(world.missions.done, true);
  assert.equal(world.cash, 250 + 2000);
});

test('mission 4 timer fails when it runs out', () => {
  const world = createWorld(9);
  startMission(world, 3);
  stepN(world, {}, 60 * 151);
  assert.equal(world.missions.failed, true);
  assert.equal(world.missions.active, false);
});

test('shooting spends ammo and drops a ped in the cone', () => {
  const world = createWorld(4);
  const p = world.player;
  const ped = world.peds[0];
  ped.x = p.x; ped.z = p.z - 10; // due north
  // Move every other ped far away so only this one can be hit.
  for (const other of world.peds.slice(1)) { other.x = 400; other.z = 400; }
  p.heading = Math.PI; // facing north (-z)
  const ammo0 = p.ammo;
  const res = tryShoot(p, world.peds, Math.PI);
  assert.equal(res.fired, true);
  assert.equal(res.hit, ped);
  assert.equal(p.ammo, ammo0 - 1);
  assert.equal(ped.state, 'down');
});

test('peds flee gunfire', () => {
  const world = createWorld(4);
  const ped = world.peds[0];
  ped.x = 0; ped.z = 0;
  const d0 = dist2d(ped.x, ped.z, 0, 0);
  stepPeds(world.peds, { x: 200, z: 200 }, { x: 0, z: 0 }, null, 1);
  assert.equal(ped.state, 'flee');
  stepPeds(world.peds, { x: 200, z: 200 }, null, null, 1);
  assert.ok(dist2d(ped.x, ped.z, 0, 0) > d0 + 2);
});

test('busted and wasted respawn at the hospital', () => {
  const world = createWorld(6);
  world.player.health = 0;
  stepWorld(world, {}, 1 / 60);
  assert.equal(world.wasted, true);
  world.cash = 500;
  respawn(world);
  assert.equal(world.wasted, false);
  assert.equal(world.player.health, CFG.playerHealth);
  assert.equal(world.cash, 350);
  assert.ok(Math.abs(world.player.x - PLACES.hospital.x) < 12);
});

test('save / load round-trips through a fake storage', () => {
  const store = new Map();
  const storage = { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) ?? null };
  const world = createWorld(2);
  world.cash = 1234;
  world.stats.missionsDone = 2;
  assert.equal(saveGame(storage, world), true);
  const data = loadGame(storage);
  assert.equal(data.cash, 1234);
  const world2 = createWorld(2);
  applySave(world2, data);
  assert.equal(world2.cash, 1234);
  assert.equal(world2.stats.missionsDone, 2);
});

test('shot staging is deterministic and camera is finite', () => {
  for (const name of ['cover', 'street', 'mission', 'title']) {
    const a = createWorld(7), b = createWorld(7);
    const sa = stageShot(a, name), sb = stageShot(b, name);
    stepN(a, sa.input, sa.steps);
    stepN(b, sb.input, sb.steps);
    const pa = playerPos(a), pb = playerPos(b);
    assert.equal(pa.x, pb.x, `${name}: x differs`);
    assert.equal(pa.z, pb.z, `${name}: z differs`);
    const cam = sa.cameraFor(a);
    for (const v of [...cam.pos, ...cam.look]) assert.ok(Number.isFinite(v), `${name}: camera not finite`);
  }
});

test('five missions are defined with rewards', () => {
  assert.equal(MISSIONS.length, 5);
  assert.deepEqual(MISSIONS.map((m) => m.reward), [500, 1200, 2000, 1500, 3000]);
});
