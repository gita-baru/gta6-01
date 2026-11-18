// Solmar Heat — the city model: streets, blocks, buildings and the road
// graph the traffic and the police drive on. Pure logic, no rendering.
import { BLOCK, BOUND, BUILDING_COLORS, PITCH, STREETS } from "./config.js";
import { chance, int, mulberry32, pick, range } from "./random.js";

export function nodeId(ix, iz) {
  return iz * 10 + ix;
}

// Build the whole city from one seed: blocks, buildings and the road graph.
export function buildCity(seed) {
  const rng = mulberry32(seed);
  const blocks = [];
  const buildings = [];
  for (let bx = 0; bx < 9; bx++) {
    for (let bz = 0; bz < 9; bz++) {
      const cx = -208 + bx * PITCH;
      const cz = -208 + bz * PITCH;
      const kind = chance(rng, 0.14) ? "park" : chance(rng, 0.12) ? "plaza" : "block";
      blocks.push({ x: cx, z: cz, kind });
      if (kind !== "block") continue;
      const count = int(rng, 1, 3);
      for (let i = 0; i < count; i++) {
        const w = range(rng, 10, 20);
        const d = range(rng, 10, 20);
        const x = cx + range(rng, -8, 8) * (count > 1 ? 0.7 : 0);
        const z = cz + range(rng, -8, 8) * (count > 1 ? 0.7 : 0);
        buildings.push({
          x,
          z,
          hw: w / 2,
          hd: d / 2,
          h: range(rng, 9, 42),
          color: pick(rng, BUILDING_COLORS),
        });
      }
    }
  }
  // Road graph: one node per intersection, edges along every street.
  const nodes = [];
  for (let iz = 0; iz < 10; iz++) {
    for (let ix = 0; ix < 10; ix++) {
      nodes.push({ id: nodeId(ix, iz), ix, iz, x: STREETS[ix], z: STREETS[iz] });
    }
  }
  const edges = new Map();
  for (const n of nodes) edges.set(n.id, []);
  for (let iz = 0; iz < 10; iz++) {
    for (let ix = 0; ix < 10; ix++) {
      const id = nodeId(ix, iz);
      if (ix < 9) edges.get(id).push(nodeId(ix + 1, iz));
      if (ix > 0) edges.get(id).push(nodeId(ix - 1, iz));
      if (iz < 9) edges.get(id).push(nodeId(ix, iz + 1));
      if (iz > 0) edges.get(id).push(nodeId(ix, iz - 1));
    }
  }
  return { seed, blocks, buildings, nodes, edges };
}

// Breadth-first shortest path on the road graph. Returns node ids.
export function bfs(city, fromId, toId) {
  if (fromId === toId) return [fromId];
  const prev = new Map([[fromId, -1]]);
  const queue = [fromId];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of city.edges.get(cur) || []) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      if (next === toId) {
        const path = [toId];
        let at = toId;
        while (prev.get(at) !== -1) {
          at = prev.get(at);
          path.unshift(at);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [fromId];
}

export function nearestNode(city, x, z) {
  let best = city.nodes[0];
  let bestD = Infinity;
  for (const n of city.nodes) {
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

// Snap a point to the nearest street centre line (roads run on the grid).
export function nearestRoadPoint(x, z) {
  let sx = STREETS[0];
  let sz = STREETS[0];
  for (const s of STREETS) {
    if (Math.abs(s - x) < Math.abs(sx - x)) sx = s;
    if (Math.abs(s - z) < Math.abs(sz - z)) sz = s;
  }
  if (Math.abs(sx - x) <= Math.abs(sz - z)) return { x: sx, z };
  return { x, z: sz };
}

export function randomRoadPoint(rng) {
  const s1 = pick(rng, STREETS);
  const s2 = pick(rng, STREETS);
  if (rng() < 0.5) return { x: s1, z: range(rng, -BOUND, BOUND) };
  return { x: range(rng, -BOUND, BOUND), z: s2 };
}

// True when a point is inside any building footprint (with a margin).
export function insideBuilding(city, x, z, margin = 0.6) {
  for (const b of city.buildings) {
    if (Math.abs(x - b.x) < b.hw + margin && Math.abs(z - b.z) < b.hd + margin) return b;
  }
  return null;
}

export function clampToCity(x, z) {
  return {
    x: Math.max(-BOUND - 6, Math.min(BOUND + 6, x)),
    z: Math.max(-BOUND - 6, Math.min(330, z)),
  };
}

export function onSand(z) {
  return z > 244;
}
