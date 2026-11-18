// Pedestrians: stroll the sidewalks, flee gunfire and speeding cars.
import { CFG, dist2d } from './config.js';
import { roadCoord, nearestNode } from './city.js';

export function spawnPeds(rng, count, avoid) {
  const peds = [];
  for (let n = 0; n < count; n++) {
    const i = rng.int(0, 9), j = rng.int(0, 9);
    const ped = {
      x: roadCoord(i) + rng.range(-8, 8),
      z: roadCoord(j) + rng.range(-8, 8),
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(CFG.pedSpeedMin, CFG.pedSpeedMax),
      state: 'stroll', // 'stroll' | 'flee' | 'down'
      downT: 0,
      color: rng.pick([0xd94f4f, 0x4f7ad9, 0x53b06a, 0xd9b24f, 0x9a5fd0, 0xdddddd]),
      axis: rng.chance(0.5) ? 'x' : 'z',
      dir: rng.chance(0.5) ? 1 : -1,
    };
    if (avoid && dist2d(ped.x, ped.z, avoid.x, avoid.z) < 25) { n--; continue; }
    peds.push(ped);
  }
  return peds;
}

// gunfire: {x, z} of the latest shot, or null. threat: {x, z, speed} of the
// player's car when it is moving fast nearby.
export function stepPeds(peds, playerPos, gunfire, threat, dt) {
  for (const ped of peds) {
    if (ped.state === 'down') {
      ped.downT -= dt;
      if (ped.downT <= 0) { ped.state = 'flee'; }
      continue;
    }
    let fleeFrom = null;
    if (gunfire && dist2d(ped.x, ped.z, gunfire.x, gunfire.z) < 45) fleeFrom = gunfire;
    else if (threat && threat.speed > 12 && dist2d(ped.x, ped.z, threat.x, threat.z) < 18) fleeFrom = threat;
    else if (dist2d(ped.x, ped.z, playerPos.x, playerPos.z) < 2.5) fleeFrom = playerPos;
    if (fleeFrom) ped.state = 'flee';
    else if (ped.state === 'flee' && !fleeFrom) ped.state = 'stroll';

    if (ped.state === 'flee' && fleeFrom) {
      const away = Math.atan2(ped.x - fleeFrom.x, ped.z - fleeFrom.z);
      ped.heading = away;
      ped.x += Math.sin(away) * 5.5 * dt;
      ped.z += Math.cos(away) * 5.5 * dt;
    } else {
      // Stroll along the nearest road, on the sidewalk edge.
      const node = nearestNode(ped.x, ped.z);
      if (ped.axis === 'x') {
        ped.x += ped.dir * ped.speed * dt;
        ped.z += (roadCoord(node.j) + 8.5 - ped.z) * Math.min(1, dt * 2);
      } else {
        ped.z += ped.dir * ped.speed * dt;
        ped.x += (roadCoord(node.i) + 8.5 - ped.x) * Math.min(1, dt * 2);
      }
      if (Math.abs(ped.x) > CFG.cityMax + 12 || Math.abs(ped.z) > CFG.cityMax + 12) {
        ped.x = roadCoord(node.i);
        ped.z = roadCoord(node.j);
        ped.axis = ped.axis === 'x' ? 'z' : 'x';
        ped.dir = -ped.dir;
      }
    }
    ped.x = Math.max(CFG.cityMin - 10, Math.min(CFG.cityMax + 10, ped.x));
    ped.z = Math.max(CFG.cityMin - 10, Math.min(CFG.beachZ + 40, ped.z));
  }
}
