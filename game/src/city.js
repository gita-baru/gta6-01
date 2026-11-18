// Solmar City: a procedural sun-soaked coastal city. One grid of avenues and
// streets, buildings inside every block, palms and lamps along the sidewalks,
// a beach and ocean on the south edge. The data is plain numbers; render.js
// turns it into three.js meshes. Collisions are axis-aligned boxes.
// (v2, 18 Nov 2026) Unchanged: the same seeded city stages every shot.
import { BEACH_Z, BLOCK, CITY_HALF, GRID, PITCH, ROAD } from './config.js';

const PALETTE = [0xf2e6cf, 0xe8b48c, 0xd98a6c, 0x9fc4c2, 0xf5d9a0, 0xc9a06a, 0xe8e0d0, 0xb8d0e0, 0xe0a080];
const ROOFS = [0x8a6a4a, 0x6a7a8a, 0xa08060, 0x5a6a5a];

// Road centre lines: avenues run north-south (fixed x), streets east-west.
export function roadLines() {
  const lines = [];
  for (let i = 0; i <= GRID; i += 1) {
    const c = -CITY_HALF + i * PITCH;
    lines.push({ x: c, z: 0, along: 'z' });
    lines.push({ x: 0, z: c, along: 'x' });
  }
  return lines;
}

export function isOnRoad(x, z) {
  const half = ROAD / 2 + 1;
  for (let i = 0; i <= GRID; i += 1) {
    const c = -CITY_HALF + i * PITCH;
    if (Math.abs(x - c) < half && Math.abs(z) <= CITY_HALF + half) return true;
    if (Math.abs(z - c) < half && Math.abs(x) <= CITY_HALF + half) return true;
  }
  return false;
}

/** Nearest point on any road centre line, for traffic routing and police. */
export function nearestRoadPoint(x, z) {
  let best = { x: 0, z: 0, dist: Infinity };
  for (let i = 0; i <= GRID; i += 1) {
    const c = -CITY_HALF + i * PITCH;
    const px = Math.max(-CITY_HALF, Math.min(CITY_HALF, x));
    const d1 = Math.hypot(x - c, z - Math.max(-CITY_HALF, Math.min(CITY_HALF, z)));
    const cand1 = { x: c, z: Math.max(-CITY_HALF, Math.min(CITY_HALF, z)), dist: Math.abs(x - c) };
    const cand2 = { x: px, z: c, dist: Math.abs(z - c) };
    if (cand1.dist < best.dist) best = cand1;
    if (cand2.dist < best.dist) best = cand2;
    void d1;
  }
  return best;
}

export function randomRoadPoint(rng) {
  const i = rng.int(0, GRID);
  const c = -CITY_HALF + i * PITCH;
  const along = rng.range(-CITY_HALF, CITY_HALF);
  if (rng.next() < 0.5) return { x: c, z: along };
  return { x: along, z: c };
}

export function createCity(rng) {
  const buildings = [];
  const palms = [];
  const lamps = [];
  const centre = 0;
  for (let bx = 0; bx < GRID; bx += 1) {
    for (let bz = 0; bz < GRID; bz += 1) {
      const blockX = -CITY_HALF + bx * PITCH + ROAD / 2;
      const blockZ = -CITY_HALF + bz * PITCH + ROAD / 2;
      const distCentre = Math.hypot(blockX + BLOCK / 2 - centre, blockZ + BLOCK / 2 - centre);
      const downtown = 1 - Math.min(1, distCentre / (CITY_HALF * 1.1));
      const count = rng.int(2, 4);
      for (let k = 0; k < count; k += 1) {
        const w = rng.range(10, 18);
        const d = rng.range(10, 18);
        const x = blockX + rng.range(2, BLOCK - 2 - w);
        const z = blockZ + rng.range(2, BLOCK - 2 - d);
        const h = 7 + downtown * downtown * rng.range(10, 42) + rng.range(0, 8);
        buildings.push({
          x, z, w, d, h,
          color: rng.pick(PALETTE),
          roof: rng.pick(ROOFS),
          variant: rng.int(0, 2),
        });
      }
      // Palms and lamps along the block's south and east sidewalks.
      const palmCount = rng.int(1, 3);
      for (let p = 0; p < palmCount; p += 1) {
        palms.push({ x: blockX + rng.range(3, BLOCK - 3), z: blockZ + BLOCK - 1.5 });
      }
      lamps.push({ x: blockX + 2, z: blockZ + 2 });
      lamps.push({ x: blockX + BLOCK - 2, z: blockZ + BLOCK - 2 });
    }
  }

  // Named places for missions and spawns, all on roads.
  const spots = {
    playerStart: { x: -CITY_HALF + PITCH, z: -CITY_HALF + PITCH, heading: Math.PI / 2 },
    docks: { x: -CITY_HALF + 2 * PITCH, z: CITY_HALF - PITCH / 2 },
    hotel: { x: -PITCH / 2, z: -PITCH / 2 },
    garage: { x: CITY_HALF - PITCH, z: PITCH },
    safehouse: { x: -CITY_HALF + PITCH, z: -CITY_HALF + 2 * PITCH },
    sportsCar: { x: PITCH, z: -CITY_HALF + PITCH },
    pier: { x: 0, z: BEACH_Z - 8 },
  };

  return { buildings, palms, lamps, spots };
}

/** Push a circle out of every building it overlaps; returns the corrected position. */
export function collideCircle(buildings, x, z, radius) {
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    const nearestX = Math.max(b.x, Math.min(x, b.x + b.w));
    const nearestZ = Math.max(b.z, Math.min(z, b.z + b.d));
    const dx = x - nearestX;
    const dz = z - nearestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;
    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      x = nearestX + (dx / dist) * radius;
      z = nearestZ + (dz / dist) * radius;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const pushLeft = x - b.x + radius;
      const pushRight = b.x + b.w - x + radius;
      const pushUp = z - b.z + radius;
      const pushDown = b.z + b.d - z + radius;
      const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
      if (min === pushLeft) x = b.x - radius;
      else if (min === pushRight) x = b.x + b.w + radius;
      else if (min === pushUp) z = b.z - radius;
      else z = b.z + b.d + radius;
    }
  }
  return { x, z };
}
