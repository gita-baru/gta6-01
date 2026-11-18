// Pedestrians: they stroll the sidewalks, cross at corners, and run away
// from gunshots, speeding cars and the player's fists.
// (v2, 18 Nov 2026) Unchanged: the street scene stages them near the player.
import { BLOCK, CITY_HALF, GRID, PITCH, ROAD } from './config.js';
import { collideCircle } from './city.js';

const SHIRTS = [0xe05040, 0x40a0e0, 0x50c060, 0xe0c040, 0x9050c0, 0xe0e0e0, 0x404040, 0xe08040];

export function createPeds(rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const bx = rng.int(0, GRID - 1);
    const bz = rng.int(0, GRID - 1);
    const x = -CITY_HALF + bx * PITCH + ROAD / 2 + rng.range(1, BLOCK - 1);
    const z = -CITY_HALF + bz * PITCH + ROAD / 2 + rng.range(1, BLOCK - 1);
    peds.push({
      x, z,
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(1, 1.8),
      shirt: SHIRTS[i % SHIRTS.length],
      pants: 0x2a2f38,
      targetX: x,
      targetZ: z,
      scared: 0,
      walkPhase: rng.range(0, 6),
      down: false,
    });
  }
  return peds;
}

export function stepPeds(peds, dt, buildings, threats, rng) {
  for (const ped of peds) {
    if (ped.down) continue;
    // Fear: run away from the nearest threat.
    let fleeX = 0;
    let fleeZ = 0;
    let nearest = Infinity;
    for (const threat of threats) {
      const dx = ped.x - threat.x;
      const dz = ped.z - threat.z;
      const dist = Math.hypot(dx, dz);
      if (dist < threat.radius && dist < nearest) {
        nearest = dist;
        fleeX = dx / (dist || 1);
        fleeZ = dz / (dist || 1);
      }
    }
    if (nearest < Infinity) {
      ped.scared = 2.5;
      ped.targetX = ped.x + fleeX * 30;
      ped.targetZ = ped.z + fleeZ * 30;
    }
    ped.scared = Math.max(0, ped.scared - dt);
    const dx = ped.targetX - ped.x;
    const dz = ped.targetZ - ped.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.5) {
      // Pick a new stroll target on a nearby sidewalk.
      const bx = Math.max(0, Math.min(GRID - 1, Math.floor((ped.x + CITY_HALF - ROAD / 2) / PITCH)));
      const bz = Math.max(0, Math.min(GRID - 1, Math.floor((ped.z + CITY_HALF - ROAD / 2) / PITCH)));
      ped.targetX = -CITY_HALF + bx * PITCH + ROAD / 2 + rng.range(1, BLOCK - 1);
      ped.targetZ = -CITY_HALF + bz * PITCH + ROAD / 2 + rng.range(1, BLOCK - 1);
    } else {
      const speed = ped.scared > 0 ? 5.5 : ped.speed;
      ped.heading = Math.atan2(dx, dz);
      ped.x += (dx / dist) * speed * dt;
      ped.z += (dz / dist) * speed * dt;
      ped.walkPhase += speed * dt * 1.8;
    }
    const fixed = collideCircle(buildings, ped.x, ped.z, 0.4);
    ped.x = fixed.x;
    ped.z = fixed.z;
  }
}
