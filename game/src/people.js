// Pedestrians and the on-foot player, pure logic. Peds wander the sidewalks and
// run from gunfire; the player walks, runs and can be knocked around by cars.
import { PLAYER, CITY } from './config.js';
import { clamp, dist2, makeRng } from './random.js';

export function makePed(opts) {
  return {
    x: opts.x || 0,
    z: opts.z || 0,
    heading: opts.heading || 0,
    speed: 0,
    // Wander target the ped is walking toward.
    tx: opts.x || 0,
    tz: opts.z || 0,
    flee: 0, // seconds of fleeing left
    fleeX: 0,
    fleeZ: 0,
    color: opts.color ?? 0x888888,
    alive: true,
    walkPhase: Math.random() * Math.PI * 2,
  };
}

// Spawn peds on sidewalks (just off a street, never in the middle of a block).
export function spawnPeds(city, count, rng) {
  const peds = [];
  const colors = [0xc04040, 0x4080c0, 0x40a060, 0xd0a040, 0x9040a0, 0xdddddd, 0x303030, 0xe08050];
  for (let i = 0; i < count; i++) {
    const street = rng.pick(city.streets);
    const along = rng.range(-220, 220);
    const side = rng.chance(0.5) ? 1 : -1;
    const onXStreet = rng.chance(0.5);
    const ped = makePed({
      x: onXStreet ? along : street + side * 7,
      z: onXStreet ? street + side * 7 : along,
      color: rng.pick(colors),
    });
    pickWanderTarget(ped, city, rng);
    peds.push(ped);
  }
  return peds;
}

function pickWanderTarget(ped, city, rng) {
  const street = rng.pick(city.streets);
  const along = rng.range(-220, 220);
  const side = rng.chance(0.5) ? 1 : -1;
  if (rng.chance(0.5)) {
    ped.tx = along;
    ped.tz = street + side * 7;
  } else {
    ped.tx = street + side * 7;
    ped.tz = along;
  }
}

export function updatePed(ped, city, rng, dt) {
  if (!ped.alive) return;
  ped.walkPhase += dt * (ped.flee > 0 ? 11 : 6);
  if (ped.flee > 0) {
    ped.flee -= dt;
    const dx = ped.x - ped.fleeX;
    const dz = ped.z - ped.fleeZ;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    ped.heading = Math.atan2(dx / d, dz / d);
    ped.speed = 7.5;
    ped.x += Math.sin(ped.heading) * ped.speed * dt;
    ped.z += Math.cos(ped.heading) * ped.speed * dt;
    if (ped.flee <= 0) pickWanderTarget(ped, city, rng);
  } else {
    const dx = ped.tx - ped.x;
    const dz = ped.tz - ped.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1.5) {
      pickWanderTarget(ped, city, rng);
      return;
    }
    ped.heading = Math.atan2(dx / d, dz / d);
    ped.speed = 1.4 + (ped.x * 7 % 1) * 0.5;
    ped.x += Math.sin(ped.heading) * ped.speed * dt;
    ped.z += Math.cos(ped.heading) * ped.speed * dt;
  }
  // Keep peds inside the city and out of buildings.
  ped.x = clamp(ped.x, -245, 245);
  ped.z = clamp(ped.z, -245, CITY.SAND_END);
  const hit = city.collidesBuilding(ped.x, ped.z, 0.9);
  if (hit) {
    // Step back out along the approach direction and pick a new target.
    ped.x -= Math.sin(ped.heading) * 1.2;
    ped.z -= Math.cos(ped.heading) * 1.2;
    pickWanderTarget(ped, city, rng);
  }
}

// Every ped within range of a gunshot starts fleeing from the shot's position.
export function scarePeds(peds, x, z, range, rng) {
  let scared = 0;
  for (const ped of peds) {
    if (!ped.alive) continue;
    if (dist2(ped.x, ped.z, x, z) < range) {
      ped.flee = 3;
      ped.fleeX = x;
      ped.fleeZ = z;
      scared++;
    }
  }
  return scared;
}

// On-foot player movement. input: {mx, mz} unit-ish move vector in world space,
// run: boolean. Returns the speed actually moved at.
export function updatePlayerOnFoot(player, input, dt, city) {
  const speed = input.run ? PLAYER.RUN_SPEED : PLAYER.WALK_SPEED;
  const len = Math.hypot(input.mx, input.mz);
  if (len < 0.01) {
    player.speed = 0;
    return 0;
  }
  const nx = input.mx / len;
  const nz = input.mz / len;
  player.heading = Math.atan2(nx, nz);
  player.x += nx * speed * dt;
  player.z += nz * speed * dt;
  player.speed = speed;
  player.walkPhase = (player.walkPhase || 0) + dt * (input.run ? 11 : 7);
  // Buildings block the player; the world edge does too.
  const hit = city.collidesBuilding(player.x, player.z, PLAYER.RADIUS);
  if (hit) {
    player.x -= nx * speed * dt;
    player.z -= nz * speed * dt;
  }
  player.x = clamp(player.x, -245, 245);
  player.z = clamp(player.z, -245, CITY.SAND_END);
  return speed;
}

export function makeRngForTest(seed) {
  return makeRng(seed);
}
