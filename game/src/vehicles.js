// Car physics and traffic AI, pure logic with no rendering dependency.
// A car is a point with a heading and a velocity; the arcade model keeps a forward
// speed and a small lateral slide, so drifting with the handbrake feels right.
import { CAR, CITY } from './config.js';
import { clamp, angleDiff, dist2 } from './random.js';

export function makeCar(opts) {
  return {
    kind: opts.kind || 'traffic', // traffic | player | police | mission
    x: opts.x || 0,
    z: opts.z || 0,
    heading: opts.heading || 0,
    speed: 0,
    slide: 0, // lateral velocity, metres per second
    steer: 0,
    color: opts.color ?? 0x808080,
    id: opts.id || 0,
    // Traffic state: which road the car is on and where it is going.
    road: opts.road || null,
    roadPos: 0,
    roadDir: 1,
    wait: 0,
    siren: false,
    // Police state.
    path: null,
    pathIndex: 0,
    repath: 0,
  };
}

// Arcade update for a driven car. input: {throttle, brake, steer (-1..1), handbrake}.
// dt in seconds. Returns nothing; mutates the car.
export function updateDrivenCar(car, input, dt) {
  const targetSteer = clamp(input.steer || 0, -1, 1) * CAR.STEER_MAX;
  car.steer += clamp(targetSteer - car.steer, -CAR.STEER_SPEED * dt, CAR.STEER_SPEED * dt);
  const steerFactor = clamp(Math.abs(car.speed) / 8, 0, 1);
  const turnRate = car.steer * steerFactor * (car.speed >= 0 ? 1 : -1);
  car.heading += turnRate * dt * 1.9;

  if (input.throttle) car.speed += CAR.ACCEL * dt;
  if (input.brake) {
    if (car.speed > 0.5) car.speed -= CAR.BRAKE * dt;
    else car.speed -= CAR.REVERSE_ACCEL * dt;
  }
  // Natural drag and rolling resistance.
  car.speed -= car.speed * 0.35 * dt;
  if (!input.throttle && !input.brake) car.speed -= car.speed * 0.5 * dt;
  car.speed = clamp(car.speed, -CAR.MAX_REVERSE, CAR.MAX_SPEED);

  // Lateral slide: grip pulls the slide back to zero; the handbrake lets it live.
  const grip = input.handbrake ? CAR.DRIFT_GRIP : CAR.GRIP;
  const lateral = car.slide;
  car.slide = lateral * Math.max(0, 1 - grip * dt);
  if (input.handbrake) car.slide += car.steer * car.speed * 0.35 * dt;
  car.slide = clamp(car.slide, -6, 6);

  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const rx = Math.cos(car.heading);
  const rz = -Math.sin(car.heading);
  car.x += (fx * car.speed + rx * car.slide) * dt;
  car.z += (fz * car.speed + rz * car.slide) * dt;
}

// Traffic: each car drives along its road; at an intersection it picks a new road.
// laneAxis is read off the road itself, never a null default.
export function updateTrafficCar(car, city, rng, dt, others) {
  if (car.wait > 0) {
    car.wait -= dt;
    car.speed = 0;
    return;
  }
  if (!car.road) assignRoad(car, city, rng);
  const road = car.road;
  const targetSpeed = CAR.TRAFFIC_SPEED + (car.id % 3);
  car.speed += clamp(targetSpeed - car.speed, -6 * dt, 4 * dt);

  // Follow the road's lane: right-hand side for the direction of travel.
  const lane = 2.4 * car.roadDir;
  let heading;
  if (road.axis === 'x') {
    car.x += car.roadDir * car.speed * dt;
    car.z += clamp(road.coord + lane - car.z, -4 * dt, 4 * dt);
    heading = car.roadDir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    car.z += car.roadDir * car.speed * dt;
    car.x += clamp(road.coord + lane - car.x, -4 * dt, 4 * dt);
    heading = car.roadDir > 0 ? 0 : Math.PI;
  }
  car.heading = heading;

  // Gentle separation from the car ahead on the same road.
  for (const other of others) {
    if (other === car || other.kind !== 'traffic') continue;
    if (other.road !== road || other.roadDir !== car.roadDir) continue;
    const ahead =
      road.axis === 'x'
        ? (other.x - car.x) * car.roadDir
        : (other.z - car.z) * car.roadDir;
    if (ahead > 0 && ahead < 9) {
      car.speed = Math.min(car.speed, Math.max(0, other.speed - 1));
      if (ahead < 6.5) car.speed = 0;
    }
  }

  // At the end of the road, pick a new one at the intersection.
  const atEnd =
    road.axis === 'x'
      ? car.roadDir > 0
        ? car.x >= road.to
        : car.x <= road.from
      : car.roadDir > 0
        ? car.z >= road.to
        : car.z <= road.from;
  if (atEnd) {
    const node = city.nearestIntersection(car.x, car.z);
    pickNextRoad(car, city, rng, node);
    car.wait = rng.chance(0.25) ? rng.range(0.5, 1.5) : 0;
  }
}

function assignRoad(car, city, rng) {
  const road = rng.pick(city.roads);
  car.road = road;
  car.roadDir = rng.chance(0.5) ? 1 : -1;
  if (road.axis === 'x') {
    car.x = rng.range(road.from + 10, road.to - 10);
    car.z = road.coord + 2.4 * car.roadDir;
  } else {
    car.z = rng.range(road.from + 10, road.to - 10);
    car.x = road.coord + 2.4 * car.roadDir;
  }
}

function pickNextRoad(car, city, rng, node) {
  const n = CITY.STREET_COUNT;
  // From this intersection, choose a road through it: continue straight, turn
  // left/right, or (rarely) turn back. The road's axis and direction follow.
  // roads[] layout: for street i, index 2i is the x-road, 2i+1 the z-road.
  const fixed = [];
  if (node.ix > 0) fixed.push({ road: city.roads[node.ix * 2 + 1], dir: -1 });
  if (node.ix < n - 1) fixed.push({ road: city.roads[node.ix * 2 + 1], dir: 1 });
  if (node.iz > 0) fixed.push({ road: city.roads[node.iz * 2], dir: -1 });
  if (node.iz < n - 1) fixed.push({ road: city.roads[node.iz * 2], dir: 1 });
  const choice = rng.pick(fixed);
  car.road = choice.road;
  car.roadDir = choice.dir;
  // Snap onto the new road's lane so the car never cuts a corner through a block.
  if (car.road.axis === 'x') car.z = car.road.coord + 2.4 * car.roadDir;
  else car.x = car.road.coord + 2.4 * car.roadDir;
}

// Circle-circle push-apart for two cars. Returns true on contact.
export function separateCars(a, b) {
  const min = CAR.RADIUS * 2 - 0.6;
  const d = dist2(a.x, a.z, b.x, b.z);
  if (d >= min || d < 1e-6) return false;
  const push = (min - d) / 2 / d;
  const px = (a.x - b.x) * push;
  const pz = (a.z - b.z) * push;
  a.x += px;
  a.z += pz;
  b.x -= px;
  b.z -= pz;
  return true;
}

// Steer a car toward a target point, arcade style. Returns the input to feed
// updateDrivenCar, with full throttle.
export function steerToward(car, tx, tz, speedCap) {
  const dx = tx - car.x;
  const dz = tz - car.z;
  const want = Math.atan2(dx, dz);
  const diff = angleDiff(car.heading, want);
  const steer = clamp(diff * 1.6, -1, 1);
  return {
    throttle: car.speed < (speedCap ?? CAR.MAX_SPEED),
    brake: false,
    steer,
    handbrake: Math.abs(diff) > 1.1 && car.speed > 12,
  };
}
