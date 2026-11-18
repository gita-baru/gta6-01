// Cars: arcade driving physics for the player, lane-following traffic AI and
// police pursuit AI. A car is a circle for collisions (radius 2.1); steering
// and speed are the only state the physics needs.
import {
  CAR_ACCEL, CAR_BRAKE, CAR_HEALTH, CAR_LENGTH, CAR_MAX_SPEED, CAR_REVERSE,
  CAR_STEER, CITY_HALF, GRID, PITCH, SPORT_MAX_SPEED, TRAFFIC_SPEED,
} from './config.js';
import { collideCircle, nearestRoadPoint } from './city.js';

const CAR_COLORS = [0xc03028, 0x2a5ac0, 0xe0d040, 0x30a060, 0x8040a0, 0xd0d0d0, 0x303840, 0xe08030];

export function createCar(id, x, z, heading, options = {}) {
  return {
    id,
    x, z,
    heading,
    speed: 0,
    steer: 0,
    health: CAR_HEALTH,
    color: options.color ?? CAR_COLORS[id % CAR_COLORS.length],
    sport: !!options.sport,
    police: !!options.police,
    traffic: !!options.traffic,
    parked: !!options.parked,
    wrecked: false,
    smoke: 0,
    // Traffic AI: which road line it follows and which way. Null means
    // "pick the lane nearest to where the car is" on the first step, so
    // traffic spreads over the whole grid instead of piling onto one road.
    laneAxis: options.laneAxis || null,
    laneCoord: options.laneCoord || 0,
    laneDir: options.laneDir || 1,
    stuckTimer: 0,
  };
}

function maxSpeed(car) {
  return car.sport ? SPORT_MAX_SPEED : CAR_MAX_SPEED;
}

/** The car the player drives: throttle, steering, handbrake, collisions. */
export function stepDrivenCar(car, dt, drive, steerInput, handbrake, buildings, cars, onCrash) {
  if (car.wrecked) return;
  const top = maxSpeed(car);
  if (drive > 0) car.speed += CAR_ACCEL * dt * (car.sport ? 1.25 : 1);
  else if (drive < 0) {
    car.speed += car.speed > 0.5 ? -CAR_BRAKE * dt : -CAR_REVERSE * dt;
  }
  // Drag and rolling resistance.
  car.speed -= car.speed * 0.35 * dt;
  if (drive === 0) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 4 * dt);
  if (handbrake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 18 * dt);
    car.steer = steerInput * CAR_STEER * 1.6;
  } else {
    car.steer += (steerInput * CAR_STEER * (1 - Math.min(0.55, Math.abs(car.speed) / top)) - car.steer) * Math.min(1, dt * 8);
  }
  car.speed = Math.max(-CAR_REVERSE, Math.min(top, car.speed));
  car.heading += (car.speed / 2.8) * Math.tan(car.steer) * dt * (car.speed >= 0 ? 1 : -1);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const before = { x: car.x, z: car.z };
  const fixed = collideCircle(buildings, nx, nz, 2.1);
  car.x = fixed.x;
  car.z = fixed.z;
  if ((fixed.x !== nx || fixed.z !== nz) && Math.abs(car.speed) > 4) {
    car.health -= Math.abs(car.speed) * 0.5;
    car.speed *= 0.45;
    onCrash && onCrash(car.x, car.z, Math.abs(car.speed));
  }
  void before;
  car.smoke = Math.max(0, car.smoke - dt);
  if (car.health < 35) car.smoke = 0.4;
  if (car.health <= 0) {
    car.wrecked = true;
    car.speed = 0;
  }
}

/** Traffic: follow a road lane, turn at intersections, slow for the car ahead. */
export function stepTrafficCar(car, dt, buildings, cars, rng) {
  if (car.wrecked) return;
  // Pick a lane if none set.
  if (!car.laneAxis) {
    const p = nearestRoadPoint(car.x, car.z);
    car.laneAxis = Math.abs(car.x - p.x) < Math.abs(car.z - p.z) ? 'z' : 'x';
    car.laneCoord = car.laneAxis === 'z' ? p.x : p.z;
    car.laneDir = rng.next() < 0.5 ? 1 : -1;
  }
  let targetSpeed = TRAFFIC_SPEED;
  // Slow for a car ahead in the same lane.
  for (const other of cars) {
    if (other === car || other.wrecked) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const ahead = car.laneAxis === 'x' ? dz * 0 + dx * car.laneDir : dz * car.laneDir;
    const lateral = car.laneAxis === 'x' ? Math.abs(dz) : Math.abs(dx);
    if (ahead > 0 && ahead < 9 && lateral < 3) {
      targetSpeed = Math.min(targetSpeed, Math.max(0, other.speed * 0.8));
      break;
    }
  }
  car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
  // At an intersection, sometimes turn onto the crossing road.
  const along = car.laneAxis === 'x' ? car.x : car.z;
  const nearCrossing = (() => {
    for (let i = 0; i <= GRID; i += 1) {
      const c = -CITY_HALF + i * PITCH;
      if (Math.abs(along - c) < 4) return c;
    }
    return null;
  })();
  if (nearCrossing !== null && rng.next() < dt * 0.25) {
    const newAxis = car.laneAxis === 'x' ? 'z' : 'x';
    car.laneAxis = newAxis;
    car.laneCoord = nearCrossing;
    car.laneDir = rng.next() < 0.5 ? 1 : -1;
  }
  // Steer toward the lane centre line.
  const lateralPos = car.laneAxis === 'x' ? car.z : car.x;
  const laneOffset = car.laneDir > 0 ? 3 : -3;
  const want = car.laneCoord + laneOffset;
  const error = want - lateralPos;
  const desiredHeading = car.laneAxis === 'x'
    ? (car.laneDir > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.max(-0.5, Math.min(0.5, error * 0.12))
    : (car.laneDir > 0 ? 0 : Math.PI) + Math.max(-0.5, Math.min(0.5, -error * 0.12));
  let diff = desiredHeading - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const fixed = collideCircle(buildings, nx, nz, 2.1);
  car.x = fixed.x;
  car.z = fixed.z;
  if (fixed.x !== nx || fixed.z !== nz) {
    // Bumped a building: pick a new lane.
    car.laneAxis = null;
    car.speed *= 0.5;
  }
}

/** Police: chase the player along the road grid (BFS over intersections),
 *  then ram directly once close. Cruisers route around blocks like real
 *  traffic instead of pushing into buildings. */
function intersectionIndex(x, z) {
  const i = Math.max(0, Math.min(GRID, Math.round((x + CITY_HALF) / PITCH)));
  const j = Math.max(0, Math.min(GRID, Math.round((z + CITY_HALF) / PITCH)));
  return { i, j };
}

function intersectionPoint(i, j) {
  return { x: -CITY_HALF + i * PITCH, z: -CITY_HALF + j * PITCH };
}

function bfsPath(from, to) {
  const key = (i, j) => j * (GRID + 1) + i;
  const prev = new Map();
  const queue = [from];
  prev.set(key(from.i, from.j), null);
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.i === to.i && cur.j === to.j) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = cur.i + di;
      const nj = cur.j + dj;
      if (ni < 0 || ni > GRID || nj < 0 || nj > GRID) continue;
      if (prev.has(key(ni, nj))) continue;
      prev.set(key(ni, nj), cur);
      queue.push({ i: ni, j: nj });
    }
  }
  if (!prev.has(key(to.i, to.j))) return [];
  const path = [];
  let cur = to;
  while (cur) {
    path.unshift(intersectionPoint(cur.i, cur.j));
    cur = prev.get(key(cur.i, cur.j));
  }
  return path;
}

export function stepPoliceCar(car, dt, targetX, targetZ, buildings, cars, onCrash) {
  if (car.wrecked) return;
  const dx = targetX - car.x;
  const dz = targetZ - car.z;
  const dist = Math.hypot(dx, dz);
  let aimX = targetX;
  let aimZ = targetZ;
  if (dist > 14) {
    // Route along the roads to the player's nearest intersection.
    const targetNode = intersectionIndex(targetX, targetZ);
    const targetKey = targetNode.i + ',' + targetNode.j;
    if (!car.path || car.pathKey !== targetKey) {
      const fromNode = intersectionIndex(car.x, car.z);
      car.path = bfsPath(fromNode, targetNode);
      car.pathKey = targetKey;
      car.pathStep = 0;
    }
    const waypoint = car.path && car.path[car.pathStep];
    if (waypoint) {
      aimX = waypoint.x;
      aimZ = waypoint.z;
      if (Math.hypot(waypoint.x - car.x, waypoint.z - car.z) < 7) {
        car.pathStep += 1;
      }
    }
  }
  const desired = Math.atan2(aimX - car.x, aimZ - car.z);
  let diff = desired - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.steer = Math.max(-CAR_STEER, Math.min(CAR_STEER, diff * 1.2));
  const top = dist < 12 ? CAR_MAX_SPEED * 0.9 : SPORT_MAX_SPEED;
  car.speed += (top - car.speed) * Math.min(1, dt * 0.7);
  car.heading += (car.speed / 2.8) * Math.tan(car.steer) * dt;
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const fixed = collideCircle(buildings, nx, nz, 2.1);
  car.x = fixed.x;
  car.z = fixed.z;
  if ((fixed.x !== nx || fixed.z !== nz) && Math.abs(car.speed) > 5) {
    car.health -= 2;
    car.speed *= 0.5;
    onCrash && onCrash(car.x, car.z, Math.abs(car.speed));
  }
  if (car.health <= 0) {
    car.wrecked = true;
    car.speed = 0;
  }
}

/** Circle-vs-circle push-apart for every pair of cars; returns crash events. */
export function resolveCarCollisions(cars, onCrash) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.wrecked && b.wrecked) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= 4.2 || dist < 0.001) continue;
      const overlap = (4.2 - dist) / 2;
      const nx = dx / dist;
      const nz = dz / dist;
      if (!a.wrecked) { a.x -= nx * overlap; a.z -= nz * overlap; }
      if (!b.wrecked) { b.x += nx * overlap; b.z += nz * overlap; }
      const impact = Math.abs(a.speed - b.speed);
      if (impact > 3) {
        a.health -= impact * 0.4;
        b.health -= impact * 0.4;
        a.speed *= 0.7;
        b.speed *= 0.7;
        onCrash && onCrash((a.x + b.x) / 2, (a.z + b.z) / 2, impact);
        if (a.health <= 0) { a.wrecked = true; a.speed = 0; }
        if (b.health <= 0) { b.wrecked = true; b.speed = 0; }
      }
    }
  }
}

export function carForward(car) {
  return { x: Math.sin(car.heading), z: Math.cos(car.heading) };
}

export { CAR_LENGTH };
