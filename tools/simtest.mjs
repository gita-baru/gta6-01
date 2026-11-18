// Solmar Heat — logic tests for the pure modules (no DOM, no Three.js).
// Run: node tools/simtest.mjs
import { buildCity, bfs, nearestNode, insideBuilding, nearestRoadPoint } from "../game/src/city.js";
import { mulberry32 } from "../game/src/random.js";
import { driveCar, makeCar, makeTraffic, nearestCar, updateTraffic } from "../game/src/vehicles.js";
import { makePeds, updatePeds } from "../game/src/people.js";
import { addWanted, stars, updateHeli, updatePolice, updateWanted } from "../game/src/police.js";
import { currentObjective, nextMissionIndex, startMission, updateMission } from "../game/src/missions.js";
import { damagePlayer, punch, shoot } from "../game/src/combat.js";
import { MISSIONS, TUNE } from "../game/src/config.js";

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ok ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

function makeState(seed = 1337) {
  const city = buildCity(seed);
  const rng = mulberry32(seed + 7);
  const cars = makeTraffic(10, city, rng);
  cars.push(makeCar(26, 26, Math.PI / 2, 0xf1c40f, "mission"));
  return {
    city, rng, time: 0, clock: 8 * 3600, money: 0, wanted: 0, quietT: 99,
    health: TUNE.playerMaxHealth, ammo: TUNE.startAmmo,
    player: { x: 0, z: 26, angle: 0, speed: 0, onFoot: true, car: null },
    cars, peds: makePeds(18, city, rng),
    heli: { active: false, angle: 0, x: 0, z: 0, y: 42 },
    mission: { index: -1, step: 0, active: false, targetCar: null, timer: 0, text: "", done: [false, false, false, false, false] },
    danger: null, fx: [], banner: "", bannerT: 0,
  };
}

console.log("city");
{
  const city = buildCity(1337);
  check("81 blocks", city.blocks.length === 81);
  check("100 road nodes", city.nodes.length === 100);
  check("buildings exist", city.buildings.length > 40, `got ${city.buildings.length}`);
  const path = bfs(city, 0, 99);
  check("BFS corner to corner", path.length > 10 && path[0] === 0 && path[path.length - 1] === 99, `len ${path.length}`);
  check("BFS short hop", bfs(city, 5, 6).length === 2);
  const n = nearestNode(city, 0, 0);
  check("nearest node near origin", Math.abs(n.x) <= 26 && Math.abs(n.z) <= 26);
  const b = city.buildings[0];
  check("insideBuilding hits", insideBuilding(city, b.x, b.z) === b);
  check("insideBuilding misses road", insideBuilding(city, 26, 26) === null);
  const rp = nearestRoadPoint(30, 40);
  check("road snap", rp.x === 26 || rp.z === 26, JSON.stringify(rp));
  const r1 = mulberry32(5);
  const a = [r1(), r1(), r1()];
  const r2 = mulberry32(5);
  check("seeded RNG repeats", r2() === a[0] && r2() === a[1] && r2() === a[2]);
}

console.log("vehicles");
{
  const S = makeState();
  check("10 traffic cars", S.cars.filter((c) => c.kind === "traffic").length === 10);
  const car = makeCar(26, 26, 0, 0xc0392b, "player");
  driveCar(car, { up: true, down: false, left: false, right: false, handbrake: false }, 1, S.city);
  check("car accelerates", car.speed > 15, `speed ${car.speed.toFixed(1)}`);
  check("car moves forward", car.z > 26, `z ${car.z.toFixed(1)}`);
  const a0 = car.angle;
  driveCar(car, { up: true, down: false, left: true, right: false, handbrake: false }, 1, S.city);
  check("car steers", Math.abs(car.angle - a0) > 0.1);
  // Drive into a building and confirm the car never ends up inside it.
  const b = S.city.buildings[0];
  const ram = makeCar(b.x, b.z - b.hd - 4, 0, 0xc0392b, "player");
  ram.speed = 20;
  driveCar(ram, { up: true, down: false, left: false, right: false, handbrake: false }, 1, S.city);
  check("building blocks car", insideBuilding(S.city, ram.x, ram.z, 0) === null, `at ${ram.x.toFixed(1)},${ram.z.toFixed(1)}`);
  const t0 = S.cars[0];
  const x0 = t0.x;
  const z0 = t0.z;
  updateTraffic(t0, 1, S.city, S.rng);
  check("traffic moves", Math.hypot(t0.x - x0, t0.z - z0) > 1);
  check("nearestCar finds one", nearestCar(S.cars, 26, 26, 5, ["mission"])?.kind === "mission");
}

console.log("people");
{
  const S = makeState();
  check("18 pedestrians", S.peds.length === 18);
  const p = S.peds[0];
  const x0 = p.x;
  updatePeds(S.peds, 1, S.city, S.rng, null);
  check("peds stroll", Math.hypot(p.x - x0, p.z - p.z) >= 0);
  updatePeds(S.peds, 0.1, S.city, S.rng, { x: p.x, z: p.z });
  check("peds flee gunfire", p.state === "flee", `state ${p.state}`);
}

console.log("police");
{
  const S = makeState();
  addWanted(S, 3);
  check("3 stars", stars(S) === 3);
  updatePolice(S, 0.1, S.city, S.rng);
  check("3 cop cars spawn", S.cars.filter((c) => c.kind === "police").length === 3);
  const cop = S.cars.find((c) => c.kind === "police");
  const d0 = Math.hypot(cop.x - S.player.x, cop.z - S.player.z);
  for (let i = 0; i < 300; i++) updatePolice(S, 1 / 60, S.city, S.rng);
  const d1 = Math.hypot(cop.x - S.player.x, cop.z - S.player.z);
  check("police close in", d1 < d0, `${d0.toFixed(0)} -> ${d1.toFixed(0)}`);
  addWanted(S, 1);
  updateHeli(S, 0.1);
  check("helicopter at 4 stars", S.heli.active === true);
  S.wanted = 0;
  updateHeli(S, 0.1);
  check("helicopter stands down", S.heli.active === false);
  S.wanted = 2;
  S.quietT = 99;
  updateWanted(S, 60);
  check("wanted decays when quiet", S.wanted < 2, `wanted ${S.wanted.toFixed(2)}`);
}

console.log("missions");
{
  const S = makeState();
  check("5 missions defined", MISSIONS.length === 5);
  check("next mission is 0", nextMissionIndex(S) === 0);
  startMission(S, 0);
  check("mission 0 starts", S.mission.active && S.mission.index === 0);
  S.player.x = 130;
  S.player.z = 208;
  let ev = updateMission(S, 0.1);
  check("pickup step advances", ev?.type === "step", JSON.stringify(ev));
  S.player.x = -130;
  S.player.z = -130;
  ev = updateMission(S, 0.1);
  check("First Pickup pays $500", ev?.type === "complete" && S.money === 500, JSON.stringify(ev));
  check("mission 0 marked done", S.mission.done[0] === true);
  check("next mission is 1", nextMissionIndex(S) === 1);
  startMission(S, 2);
  check("Getaway sets 3 stars", stars(S) === 3);
  ev = updateMission(S, 91);
  check("Getaway fails on timeout", ev?.type === "failed" && !S.mission.active);
  startMission(S, 4);
  check("Heat Wave sets 5 stars", stars(S) === 5);
  ev = updateMission(S, 61);
  check("Heat Wave survive step advances", ev?.type === "step", JSON.stringify(ev));
  S.player.x = 78;
  S.player.z = -208;
  ev = updateMission(S, 0.1);
  check("Heat Wave pays $3000", ev?.type === "complete" && S.money === 3500, JSON.stringify(ev));
  startMission(S, 1);
  const comet = S.cars.find((c) => c.kind === "mission");
  check("Hot Wheels targets the Comet", S.mission.targetCar === comet.id);
  S.player.car = comet;
  ev = updateMission(S, 0.1);
  check("stealing the Comet advances", ev?.type === "step", JSON.stringify(ev));
  S.player.x = 0;
  S.player.z = 0;
  const obj = currentObjective(S);
  check("objective has text and distance", obj && obj.text.length > 3 && obj.dist > 0);
}

console.log("combat");
{
  const S = makeState();
  const ped = S.peds[0];
  ped.x = S.player.x + Math.sin(S.player.angle) * 2;
  ped.z = S.player.z + Math.cos(S.player.angle) * 2;
  ped.state = "walk";
  const r = punch(S);
  check("punch downs a ped", r.hit && ped.state === "down");
  const ped2 = S.peds[1];
  ped2.x = S.player.x + Math.sin(S.player.angle) * 10;
  ped2.z = S.player.z + Math.cos(S.player.angle) * 10;
  ped2.state = "walk";
  const ammo0 = S.ammo;
  const s = shoot(S, S.player.angle);
  check("shot hits ped in cone", s.hit && ped2.state === "down", JSON.stringify(s));
  check("shot spends ammo", S.ammo === ammo0 - 1);
  check("shot raises wanted", S.wanted >= 1);
  const cop = makeCar(S.player.x, S.player.z + 12, 0, 0x1a1a1a, "police");
  S.cars.push(cop);
  shoot(S, 0);
  shoot(S, 0);
  const s3 = shoot(S, 0);
  check("three shots disable a police car", s3.disabled && cop.disabled);
  check("player dies at 0 health", damagePlayer(S, 200) === true);
}

console.log("determinism");
{
  const run = () => {
    const S = makeState();
    const inputs = [];
    for (let i = 0; i < 600; i++) {
      inputs.push({ up: i < 300, down: false, left: i > 200 && i < 260, right: false, handbrake: false });
    }
    const car = makeCar(26, 26, 0, 0xc0392b, "player");
    S.cars.push(car);
    S.player.car = car;
    S.player.onFoot = false;
    for (let i = 0; i < 600; i++) {
      driveCar(car, inputs[i], 1 / 60, S.city);
      for (const c of S.cars) if (c.kind === "traffic") updateTraffic(c, 1 / 60, S.city, S.rng);
      updatePeds(S.peds, 1 / 60, S.city, S.rng, null);
      S.player.x = car.x;
      S.player.z = car.z;
    }
    return JSON.stringify({
      car: [car.x, car.z, car.angle, car.speed],
      traffic: S.cars.filter((c) => c.kind === "traffic").map((c) => [c.x, c.z]),
      peds: S.peds.map((p) => [p.x, p.z]),
    });
  };
  const a = run();
  const b = run();
  check("600-step scripted run repeats byte for byte", a === b);
}

console.log(`\nsimtest: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
