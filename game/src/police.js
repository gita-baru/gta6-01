// Police pursuit and the helicopter, pure logic. Police cars spawn on the road
// graph, follow a BFS path to the player's neighbourhood, then ram. At four stars
// and above a helicopter circles overhead with a spotlight.
import { CAR, WANTED } from './config.js';
import { makeCar, steerToward, updateDrivenCar, separateCars } from './vehicles.js';
import { dist2, clamp } from './random.js';

export function makePolice(id, x, z) {
  const car = makeCar({ kind: 'police', x, z, color: 0x1a1a22, id });
  car.siren = true;
  car.path = null;
  car.pathIndex = 0;
  car.repath = 0;
  return car;
}

// Spawn points: intersections on the city edge, away from the player.
export function policeSpawnPoints(city, playerX, playerZ, count, rng) {
  const edge = city.intersections.filter(
    (n) => Math.abs(n.x) >= 175 || Math.abs(n.z) >= 175,
  );
  const far = edge
    .map((n) => ({ n, d: dist2(n.x, n.z, playerX, playerZ) }))
    .filter((o) => o.d > 90)
    .sort((a, b) => b.d - a.d);
  const out = [];
  for (let i = 0; i < count && i < far.length; i++) {
    out.push({ x: far[i].n.x, z: far[i].n.z });
  }
  // Fallback: any far intersection, even a central one.
  let i = 0;
  while (out.length < count && i < city.intersections.length) {
    const n = city.intersections[(i * 7 + 3) % city.intersections.length];
    if (dist2(n.x, n.z, playerX, playerZ) > 90) out.push({ x: n.x, z: n.z });
    i++;
  }
  return out;
}

export function wantedPoliceCount(stars) {
  return WANTED.POLICE_PER_STAR[clamp(stars, 0, WANTED.MAX)];
}

// One police car update: chase the player along the road graph, ram on contact.
export function updatePoliceCar(car, city, player, dt) {
  car.repath -= dt;
  const d = dist2(car.x, car.z, player.x, player.z);
  let input;
  if (d < 14) {
    // Close in: ram straight at the player, no path needed.
    input = steerToward(car, player.x, player.z, CAR.MAX_SPEED);
  } else {
    if (!car.path || car.repath <= 0 || car.pathIndex >= car.path.length) {
      car.path = city.bfs(car.x, car.z, player.x, player.z);
      car.pathIndex = 0;
      car.repath = 2.5;
    }
    const wp = car.path[Math.min(car.pathIndex, car.path.length - 1)];
    if (dist2(car.x, car.z, wp.x, wp.z) < 6) car.pathIndex++;
    input = steerToward(car, wp.x, wp.z, CAR.MAX_SPEED * 0.92);
  }
  updateDrivenCar(car, input, dt);
  return d;
}

export function makeHelicopter() {
  return {
    x: 0,
    z: 0,
    y: 42,
    angle: 0,
    radius: 26,
    active: false,
  };
}

// The helicopter circles the player and keeps its spotlight on them.
export function updateHelicopter(heli, player, dt, active) {
  heli.active = active;
  if (!active) return;
  heli.angle += dt * 0.55;
  heli.x = player.x + Math.cos(heli.angle) * heli.radius;
  heli.z = player.z + Math.sin(heli.angle) * heli.radius;
  heli.y = 42;
}

// Wanted decay: one star fades after DECAY_SECONDS with no crime and no police
// close by. Returns the new star count.
export function updateWanted(stars, secondsSinceCrime, nearestPoliceDist, dt, state) {
  state.quietFor = (state.quietFor || 0) + dt;
  if (secondsSinceCrime < WANTED.DECAY_SECONDS) state.quietFor = 0;
  if (nearestPoliceDist < WANTED.DECAY_POLICE_RANGE) state.quietFor = 0;
  if (stars > 0 && state.quietFor >= WANTED.DECAY_SECONDS) {
    state.quietFor = 0;
    return stars - 1;
  }
  return stars;
}

// Busted check: police close to the player on foot, held for BUSTED_HOLD seconds.
export function updateBusted(state, police, player, dt) {
  if (player.inCar) {
    state.bustedHold = 0;
    return false;
  }
  let near = false;
  for (const car of police) {
    if (dist2(car.x, car.z, player.x, player.z) < WANTED.BUSTED_RANGE) {
      near = true;
      break;
    }
  }
  state.bustedHold = near ? (state.bustedHold || 0) + dt : 0;
  return (state.bustedHold || 0) >= WANTED.BUSTED_HOLD;
}

export { separateCars };
