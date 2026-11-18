// Cars: arcade driving, traffic AI, police pursuit (BFS over the road grid),
// and the police helicopter. Pure simulation — no DOM, no three.js.
import { CFG, clamp, angleDiff, dist2d } from './config.js';
import { roadCoord, nearestNode, bfsPath } from './city.js';

export const CAR_COLORS = [
  0x8a8f98, 0x2e4a6b, 0x7a2e2e, 0x3f6b3a, 0xc0c0c0, 0x1c1c22, 0xb0893c, 0x5b4a7a,
];

export function makeCar(rng, kind, x, z, heading = 0) {
  return {
    kind, // 'player' | 'traffic' | 'police'
    x, z, heading,
    speed: 0,
    color: kind === 'police' ? 0x11131a : rng.pick(CAR_COLORS),
    // traffic AI state
    axis: 'x', dir: 1, lane: 3.2,
    cruise: rng.range(CFG.trafficSpeedMin, CFG.trafficSpeedMax),
    // police state
    path: [], pathIdx: 0, repath: 0,
    ram: false,
    siren: kind === 'police',
    crashed: 0, // brief slowdown after a hit
  };
}

// Arcade car physics. input: {throttle (-1..1), steer (-1..1), handbrake}.
export function stepCarPhysics(car, input, dt) {
  const maxF = CFG.carMaxSpeed;
  const maxR = CFG.carReverseMax;
  if (input.throttle > 0) car.speed += CFG.carAccel * input.throttle * dt;
  else if (input.throttle < 0) {
    const t = -input.throttle;
    if (car.speed > 0.5) car.speed -= CFG.carBrake * t * dt;   // brake
    else car.speed -= CFG.carAccel * 0.6 * t * dt;              // reverse
  }
  car.speed -= car.speed * CFG.carDrag * dt;
  if (input.handbrake) car.speed -= Math.sign(car.speed) * CFG.carBrake * 0.8 * dt;
  car.speed = clamp(car.speed, -maxR, maxF);
  if (Math.abs(car.speed) < 0.05 && input.throttle === 0) car.speed = 0;
  const steerAuthority = clamp(Math.abs(car.speed) / 8, 0, 1);
  car.heading += input.steer * CFG.steerRate * steerAuthority * dt * Math.sign(car.speed || 1);
  if (input.handbrake) car.heading += input.steer * CFG.steerRate * 0.6 * dt * Math.sign(car.speed || 1);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
}

// --- Traffic: lane-following on the road grid, turns at intersections. ---
export function spawnTraffic(rng, count, avoid) {
  const cars = [];
  for (let n = 0; n < count; n++) {
    const i = rng.int(0, 9), j = rng.int(0, 9);
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const car = makeCar(rng, 'traffic', roadCoord(i), roadCoord(j), axis === 'x' ? Math.PI / 2 : 0);
    car.axis = axis;
    car.dir = rng.chance(0.5) ? 1 : -1;
    car.lane = rng.chance(0.5) ? 3.2 : -3.2;
    if (axis === 'x') { car.z = roadCoord(j) + car.lane; car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    else { car.x = roadCoord(i) + car.lane; car.heading = car.dir > 0 ? 0 : Math.PI; }
    car.speed = car.cruise;
    if (avoid && dist2d(car.x, car.z, avoid.x, avoid.z) < 40) { n--; continue; }
    cars.push(car);
  }
  return cars;
}

function atIntersection(car) {
  const n = nearestNode(car.x, car.z);
  const dx = car.x - roadCoord(n.i), dz = car.z - roadCoord(n.j);
  return Math.hypot(dx, dz) < 3 ? n : null;
}

export function stepTraffic(car, rng, dt) {
  // Drive along the current axis; snap the cross axis to the lane.
  const speed = car.crashed > 0 ? car.cruise * 0.3 : car.cruise;
  car.crashed = Math.max(0, car.crashed - dt);
  if (car.axis === 'x') {
    car.x += car.dir * speed * dt;
    car.z += (roadCoord(nearestNode(car.x, car.z).j) + car.lane - car.z) * Math.min(1, dt * 4);
    car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    car.z += car.dir * speed * dt;
    car.x += (roadCoord(nearestNode(car.x, car.z).i) + car.lane - car.x) * Math.min(1, dt * 4);
    car.heading = car.dir > 0 ? 0 : Math.PI;
  }
  const node = atIntersection(car);
  if (node && rng.chance(0.35)) {
    // Turn: pick a perpendicular leg (never a U-turn).
    const turnLeft = rng.chance(0.5);
    if (car.axis === 'x') {
      const newDir = turnLeft ? (car.dir > 0 ? -1 : 1) : (car.dir > 0 ? 1 : -1);
      car.axis = 'z'; car.dir = newDir; car.lane = rng.chance(0.5) ? 3.2 : -3.2;
    } else {
      const newDir = turnLeft ? (car.dir > 0 ? 1 : -1) : (car.dir > 0 ? -1 : 1);
      car.axis = 'x'; car.dir = newDir; car.lane = rng.chance(0.5) ? 3.2 : -3.2;
    }
    car.x = roadCoord(node.i);
    car.z = roadCoord(node.j);
  }
  // Keep inside the city: wrap around the far edge.
  if (car.x < CFG.cityMin - 10 || car.x > CFG.cityMax + 10 || car.z < CFG.cityMin - 10 || car.z > CFG.cityMax + 10) {
    car.x = roadCoord(rng.int(0, 9));
    car.z = roadCoord(rng.int(0, 9));
  }
}

// --- Police: BFS route to the player, ram when close. ---
export function stepPolice(car, target, rng, dt) {
  car.repath -= dt;
  const myNode = nearestNode(car.x, car.z);
  const tgtNode = nearestNode(target.x, target.z);
  const d = dist2d(car.x, car.z, target.x, target.z);
  car.ram = d < CFG.policeRamDist;
  if (car.repath <= 0 || car.pathIdx >= car.path.length) {
    car.path = bfsPath(myNode.i, myNode.j, tgtNode.i, tgtNode.j);
    car.pathIdx = 0;
    car.repath = 1.2;
  }
  let goal;
  if (car.ram) {
    goal = { x: target.x, z: target.z };
    car.speed = Math.min(car.speed + CFG.carAccel * 1.2 * dt, CFG.policeRamSpeed);
  } else if (car.path.length) {
    goal = car.path[Math.min(car.pathIdx, car.path.length - 1)];
    if (dist2d(car.x, car.z, goal.x, goal.z) < 5) car.pathIdx++;
    car.speed = Math.min(car.speed + CFG.carAccel * dt, CFG.carMaxSpeed * 0.85);
  } else {
    goal = { x: target.x, z: target.z };
    car.speed = Math.min(car.speed + CFG.carAccel * dt, CFG.carMaxSpeed * 0.7);
  }
  const want = Math.atan2(goal.x - car.x, goal.z - car.z);
  const turn = clamp(angleDiff(car.heading, want) * 2.2, -1, 1);
  car.heading += turn * CFG.steerRate * dt * (car.speed > 1 ? 1 : 0.4);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
}

// --- Helicopter: hovers above the player once wanted hits 4 stars. ---
export function makeHeli() {
  return { x: 0, z: 0, y: 46, heading: 0, rotor: 0, active: false };
}

export function stepHeli(heli, target, dt) {
  heli.rotor += dt * 22;
  const tx = target.x + 12, tz = target.z - 8;
  heli.x += (tx - heli.x) * Math.min(1, dt * 0.9);
  heli.z += (tz - heli.z) * Math.min(1, dt * 0.9);
  heli.y += (46 + Math.sin(heli.rotor * 0.05) * 2 - heli.y) * Math.min(1, dt * 1.5);
  heli.heading += dt * 0.4;
}
