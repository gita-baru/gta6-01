// Solmar Heat — pedestrians: sidewalk strollers who run from gunfire.
import { BOUND, TUNE } from "./config.js";
import { clampToCity, nearestRoadPoint } from "./city.js";
import { range } from "./random.js";

export function makePeds(n, city, rng) {
  const peds = [];
  for (let i = 0; i < n; i++) {
    const p = nearestRoadPoint(range(rng, -BOUND, BOUND), range(rng, -BOUND, BOUND));
    peds.push({
      x: p.x + range(rng, -8, 8),
      z: p.z + range(rng, -8, 8),
      angle: rng() * Math.PI * 2,
      speed: range(rng, 1.1, 2),
      state: "walk", // 'walk' | 'flee' | 'down'
      tx: p.x,
      tz: p.z,
      fleeT: 0,
      color: [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c][i % 6],
    });
  }
  return peds;
}

function pickStrollTarget(ped, rng) {
  const p = nearestRoadPoint(ped.x + range(rng, -60, 60), ped.z + range(rng, -60, 60));
  ped.tx = p.x + range(rng, -8, 8);
  ped.tz = p.z + range(rng, -8, 8);
}

export function updatePeds(peds, dt, city, rng, danger) {
  for (const p of peds) {
    if (p.state === "down") continue;
    if (danger) {
      const d = Math.hypot(p.x - danger.x, p.z - danger.z);
      if (d < 28) {
        p.state = "flee";
        p.fleeT = 3;
      }
    }
    if (p.state === "flee") {
      p.fleeT -= dt;
      if (danger) {
        const a = Math.atan2(p.x - danger.x, p.z - danger.z);
        p.angle = a;
        p.x += Math.sin(a) * TUNE.pedFlee * dt;
        p.z += Math.cos(a) * TUNE.pedFlee * dt;
      }
      if (p.fleeT <= 0) p.state = "walk";
    } else {
      const dx = p.tx - p.x;
      const dz = p.tz - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2) {
        pickStrollTarget(p, rng);
      } else {
        p.angle = Math.atan2(dx, dz);
        p.x += Math.sin(p.angle) * p.speed * dt;
        p.z += Math.cos(p.angle) * p.speed * dt;
      }
    }
    const c = clampToCity(p.x, p.z);
    p.x = c.x;
    p.z = Math.min(c.z, 300);
  }
}
