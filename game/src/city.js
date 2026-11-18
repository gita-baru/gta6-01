// Solmar City layout, pure logic with no rendering dependency so the simulator and
// the tests can use it in Node. Streets form a 10x10 grid; blocks sit between them;
// the south edge is beach and ocean. The road graph (intersections + segments) is
// what traffic, police pursuit and the minimap all navigate on.
import { CITY, PALETTE } from './config.js';
import { makeRng, clamp } from './random.js';

export function streetCoords() {
  const out = [];
  for (let i = 0; i < CITY.STREET_COUNT; i++) {
    out.push(CITY.STREET_FIRST + i * CITY.STREET_STEP);
  }
  return out;
}

// Build the whole city from a seed. Returns roads, intersections, blocks, buildings,
// the BFS graph and helpers. Deterministic: same seed, same city.
export function buildCity(seed) {
  const rng = makeRng(seed);
  const streets = streetCoords();
  const intersections = [];
  const indexOf = new Map();
  for (let ix = 0; ix < streets.length; ix++) {
    for (let iz = 0; iz < streets.length; iz++) {
      const key = `${ix},${iz}`;
      indexOf.set(key, intersections.length);
      intersections.push({ ix, iz, x: streets[ix], z: streets[iz] });
    }
  }

  // Roads: one per street line, per axis. laneAxis is set explicitly per road
  // (a null default once piled every traffic car onto a single street).
  const roads = [];
  for (let i = 0; i < streets.length; i++) {
    roads.push({
      id: `x${i}`,
      axis: 'x',
      coord: streets[i],
      laneAxis: 'x',
      from: streets[0] - CITY.ROAD_HALF,
      to: streets[streets.length - 1] + CITY.ROAD_HALF,
    });
    roads.push({
      id: `z${i}`,
      axis: 'z',
      coord: streets[i],
      laneAxis: 'z',
      from: streets[0] - CITY.ROAD_HALF,
      to: streets[streets.length - 1] + CITY.ROAD_HALF,
    });
  }

  // Blocks between streets: 9x9. The centre block is the plaza; a few are parks.
  const blocks = [];
  const parkSpots = new Set(['2,6', '6,2', '7,7']);
  for (let bx = 0; bx < CITY.STREET_COUNT - 1; bx++) {
    for (let bz = 0; bz < CITY.STREET_COUNT - 1; bz++) {
      const cx = (streets[bx] + streets[bx + 1]) / 2;
      const cz = (streets[bz] + streets[bz + 1]) / 2;
      const key = `${bx},${bz}`;
      const isPlaza = bx === 4 && bz === 4;
      const isPark = parkSpots.has(key);
      // Southern row faces the beach: low beachfront bars, not towers.
      const beachfront = bz === CITY.STREET_COUNT - 2;
      blocks.push({
        bx,
        bz,
        cx,
        cz,
        kind: isPlaza ? 'plaza' : isPark ? 'park' : beachfront ? 'beachfront' : 'city',
      });
    }
  }

  // Buildings: 1-4 per block, taller toward downtown, low on the beachfront.
  const buildings = [];
  for (const block of blocks) {
    if (block.kind === 'plaza' || block.kind === 'park') continue;
    const downtown = 1 - (Math.abs(block.cx) + Math.abs(block.cz)) / 500;
    const count = block.kind === 'beachfront' ? rng.int(1, 2) : rng.int(1, 3);
    for (let n = 0; n < count; n++) {
      const w = rng.range(10, 18);
      const d = rng.range(10, 18);
      const maxH = block.kind === 'beachfront' ? 14 : 12 + downtown * 34;
      const h = Math.round(rng.range(8, Math.max(10, maxH)));
      const ox = count === 1 ? 0 : rng.range(-8, 8);
      const oz = count === 1 ? 0 : rng.range(-8, 8);
      buildings.push({
        x: block.cx + ox,
        z: block.cz + oz,
        w,
        d,
        h,
        color: rng.pick(PALETTE.BUILDING),
        block: `${block.bx},${block.bz}`,
      });
    }
  }

  // Palm trees along the beach and in parks, benches in the plaza.
  const palms = [];
  for (let x = -225; x <= 225; x += 25) {
    palms.push({ x: x + rng.range(-4, 4), z: CITY.BEACH_START + 12 + rng.range(-3, 3), h: rng.range(5, 8) });
  }
  for (const block of blocks) {
    if (block.kind !== 'park') continue;
    for (let n = 0; n < 5; n++) {
      palms.push({ x: block.cx + rng.range(-15, 15), z: block.cz + rng.range(-15, 15), h: rng.range(4, 7) });
    }
  }

  const city = { streets, intersections, indexOf, roads, blocks, buildings, palms, seed };
  city.nearestIntersection = (x, z) => nearestIntersection(city, x, z);
  city.bfs = (fromX, fromZ, toX, toZ) => bfsPath(city, fromX, fromZ, toX, toZ);
  city.onRoad = (x, z) => onRoad(city, x, z);
  city.collidesBuilding = (x, z, r) => collidesBuilding(city, x, z, r);
  return city;
}

export function nearestIntersection(city, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const node of city.intersections) {
    const dx = node.x - x;
    const dz = node.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = node;
    }
  }
  return best;
}

// Breadth-first search over the intersection grid. Returns a list of waypoints
// (intersection centres) from the caller's nearest intersection to the target's.
export function bfsPath(city, fromX, fromZ, toX, toZ) {
  const n = CITY.STREET_COUNT;
  const start = nearestIntersection(city, fromX, fromZ);
  const goal = nearestIntersection(city, toX, toZ);
  const startId = start.iz * n + start.ix;
  const goalId = goal.iz * n + goal.ix;
  if (startId === goalId) return [{ x: goal.x, z: goal.z }];
  const prev = new Int32Array(n * n).fill(-1);
  const queue = [startId];
  prev[startId] = startId;
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === goalId) break;
    const cx = cur % n;
    const cz = Math.floor(cur / n);
    const neighbours = [];
    if (cx > 0) neighbours.push(cur - 1);
    if (cx < n - 1) neighbours.push(cur + 1);
    if (cz > 0) neighbours.push(cur - n);
    if (cz < n - 1) neighbours.push(cur + n);
    for (const nb of neighbours) {
      if (prev[nb] === -1) {
        prev[nb] = cur;
        queue.push(nb);
      }
    }
  }
  if (prev[goalId] === -1) return [{ x: goal.x, z: goal.z }];
  const path = [];
  let cur = goalId;
  while (cur !== startId) {
    const cx = cur % n;
    const cz = Math.floor(cur / n);
    path.unshift({ x: city.streets[cx], z: city.streets[cz] });
    cur = prev[cur];
  }
  return path;
}

// True when (x, z) is on drivable asphalt (within a road strip).
export function onRoad(city, x, z) {
  const half = CITY.ROAD_HALF + 0.5;
  for (const s of city.streets) {
    if (Math.abs(x - s) <= half) return true;
    if (Math.abs(z - s) <= half) return true;
  }
  return false;
}

// Circle vs building AABBs. Returns the first building hit, or null.
export function collidesBuilding(city, x, z, r) {
  for (const b of city.buildings) {
    const nx = clamp(x, b.x - b.w / 2, b.x + b.w / 2);
    const nz = clamp(z, b.z - b.d / 2, b.z + b.d / 2);
    const dx = x - nx;
    const dz = z - nz;
    if (dx * dx + dz * dz < r * r) return b;
  }
  return null;
}

// Push a circle out of every building it overlaps. Returns true if any push happened.
export function resolveBuildingCollision(city, body, r) {
  let hit = false;
  for (const b of city.buildings) {
    const nx = clamp(body.x, b.x - b.w / 2, b.x + b.w / 2);
    const nz = clamp(body.z, b.z - b.d / 2, b.z + b.d / 2);
    let dx = body.x - nx;
    let dz = body.z - nz;
    let d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 < 1e-6) {
      // Centre inside the box: push out along the smallest penetration axis.
      const px = b.w / 2 + r - Math.abs(body.x - b.x);
      const pz = b.d / 2 + r - Math.abs(body.z - b.z);
      if (px < pz) body.x += body.x >= b.x ? px : -px;
      else body.z += body.z >= b.z ? pz : -pz;
      continue;
    }
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    body.x += dx * push;
    body.z += dz * push;
  }
  return hit;
}

// Keep a body inside the playable world (city + beach, not the deep ocean).
export function clampToWorld(body, margin = 4) {
  const lim = CITY.WORLD_HALF - margin;
  body.x = clamp(body.x, -lim, lim);
  body.z = clamp(body.z, -lim, CITY.SAND_END + 18);
}
