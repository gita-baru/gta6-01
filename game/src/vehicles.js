// Solmar Heat — cars: arcade driving physics and traffic AI. Pure logic.
import { TUNE } from "./config.js";
import { bfs, insideBuilding, nearestNode, nearestRoadPoint, onSand, randomRoadPoint } from "./city.js";
import { pick, range } from "./random.js";

let nextId = 1;

export function makeCar(x, z, angle, color, kind) {
  return {
    id: nextId++,
    x, z, angle,
    speed: 0,
    steer: 0,
    color,
    kind, // 'traffic' | 'parked' | 'police' | 'mission' | 'player'
    route: [],
    routeIdx: 0,
    repathT: 0,
    hp: 100,
    disabled: false,
  };
}

// Arcade driving: throttle, steering that bites harder with speed, and a
// handbrake that cuts grip so the tail steps out. Returns distance driven.
export function driveCar(car, input, dt, city) {
  const was = { x: car.x, z: car.z };
  const sand = onSand(car.z);
  const grip = input.handbrake ? TUNE.handbrakeGrip : 1;
  const accel = input.up ? TUNE.carAccel : input.down ? -TUNE.carBrake : 0;
  car.speed += accel * dt;
  if (!input.up && !input.down) car.speed -= car.speed * TUNE.carDrag * dt;
  if (input.down && car.speed < 0.5) car.speed = Math.max(car.speed, -TUNE.carReverse);
  const max = (sand ? 0.45 : 1) * TUNE.carMaxSpeed;
  car.speed = Math.max(-TUNE.carReverse, Math.min(max, car.speed));
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const dir = car.speed >= 0 ? 1 : -1;
  car.angle += car.steer * TUNE.steerRate * grip * dt * Math.min(1, Math.abs(car.speed) / 8) * dir;
  car.x += Math.sin(car.angle) * car.speed * dt;
  car.z += Math.cos(car.angle) * car.speed * dt;
  const hit = insideBuilding(city, car.x, car.z, 1.6);
  if (hit) {
    // Push out along the smaller penetration axis and kill the speed.
    const dx = car.x - hit.x;
    const dz = car.z - hit.z;
    const px = hit.hw + 1.6 - Math.abs(dx);
    const pz = hit.hd + 1.6 - Math.abs(dz);
    if (px < pz) car.x = hit.x + Math.sign(dx || 1) * (hit.hw + 1.6);
    else car.z = hit.z + Math.sign(dz || 1) * (hit.hd + 1.6);
    car.speed *= 0.35;
  }
  if (car.z > 320) {
    car.z = 320;
    car.speed *= 0.5;
  }
  if (Math.abs(car.x) > 246) {
    car.x = Math.sign(car.x) * 246;
    car.speed *= 0.5;
  }
  if (car.z < -246) {
    car.z = -246;
    car.speed *= 0.5;
  }
  return Math.hypot(car.x - was.x, car.z - was.z);
}

// Spawn n traffic cars on the roads, each with a route to follow.
export function makeTraffic(n, city, rng) {
  const cars = [];
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint(rng);
    const dest = randomRoadPoint(rng);
    const car = makeCar(p.x, p.z, rng() * Math.PI * 2, pick(rng, [0xc0392b, 0x2e86c1, 0xf1c40f, 0x95a5a6, 0x2c3e50, 0xe67e22]), "traffic");
    car.route = bfs(city, nearestNode(city, p.x, p.z).id, nearestNode(city, dest.x, dest.z).id);
    car.routeIdx = 1;
    car.speed = range(rng, 7, 11);
    cars.push(car);
  }
  return cars;
}

// One traffic car follows its route node to node, easing into corners.
export function updateTraffic(car, dt, city, rng) {
  if (car.disabled) return;
  if (car.routeIdx >= car.route.length) {
    const dest = randomRoadPoint(rng);
    car.route = bfs(city, nearestNode(city, car.x, car.z).id, nearestNode(city, dest.x, dest.z).id);
    car.routeIdx = 1;
    if (car.route.length < 2) return;
  }
  const node = city.nodes[car.route[car.routeIdx]];
  const dx = node.x - car.x;
  const dz = node.z - car.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 3) {
    car.routeIdx++;
    return;
  }
  const want = Math.atan2(dx, dz);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  const target = Math.abs(diff) > 0.9 ? 5 : TUNE.trafficSpeed;
  car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
  car.x += Math.sin(car.angle) * car.speed * dt;
  car.z += Math.cos(car.angle) * car.speed * dt;
}

export function nearestCar(cars, x, z, maxD, kinds) {
  let best = null;
  let bestD = maxD;
  for (const c of cars) {
    if (kinds && !kinds.includes(c.kind)) continue;
    if (c.disabled) continue;
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export function snapCarToRoad(car, city) {
  const p = nearestRoadPoint(car.x, car.z);
  car.x = p.x;
  car.z = p.z;
}
