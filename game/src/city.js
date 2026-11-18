// Solmar City layout: a 10x10 road grid (9x9 blocks), beach and ocean south.
// Pure data — no DOM, no three.js, so the sim tests can import it in Node.
import { CFG } from './config.js';

export const roadCoord = (i) => CFG.cityMin + i * CFG.pitch;

// Named places, given as grid intersections (i, j) so they always sit on roads.
const PLACE_GRID = {
  docks: [1, 9],       // south-west, on the beach road
  pier: [3, 9],
  hotel: [7, 4],       // Hotel Solmar, mid-east
  garage: [1, 1],      // north-west
  safehouse: [8, 0],   // north-east
  plaza: [5, 5],       // central square
  marina: [9, 8],      // south-east waterfront
  stadium: [2, 6],
  mall: [4, 2],
  uptown: [6, 1],      // where the yellow Comet GT waits
  hospital: [5, 3],
};

export const PLACES = {};
for (const [name, [i, j]] of Object.entries(PLACE_GRID)) {
  PLACES[name] = { x: roadCoord(i), z: roadCoord(j), i, j, label: name };
}

// Clamp a point into the drivable city, then snap it onto the nearest road.
export function nearestRoadPoint(x, z) {
  const c = (v) => {
    const clamped = Math.max(CFG.cityMin, Math.min(CFG.cityMax, v));
    const i = Math.round((clamped - CFG.cityMin) / CFG.pitch);
    return roadCoord(Math.max(0, Math.min(CFG.roads - 1, i)));
  };
  const rx = c(x);
  const rz = c(z);
  // Pick the nearer road axis.
  return Math.abs(x - rx) < Math.abs(z - rz) ? { x: rx, z } : { x, z: rz };
}

export function nearestNode(x, z) {
  const idx = (v) => Math.max(0, Math.min(CFG.roads - 1,
    Math.round((v - CFG.cityMin) / CFG.pitch)));
  return { i: idx(x), j: idx(z) };
}

// Breadth-first search over the intersection graph. Returns waypoints
// [{x, z}, ...] from the start node (exclusive) to the target node (inclusive).
export function bfsPath(si, sj, ti, tj) {
  if (si === ti && sj === tj) return [];
  const key = (i, j) => j * CFG.roads + i;
  const prev = new Map();
  const queue = [[si, sj]];
  prev.set(key(si, sj), null);
  while (queue.length) {
    const [i, j] = queue.shift();
    if (i === ti && j === tj) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= CFG.roads || nj >= CFG.roads) continue;
      const k = key(ni, nj);
      if (prev.has(k)) continue;
      prev.set(k, [i, j]);
      queue.push([ni, nj]);
    }
  }
  if (!prev.has(key(ti, tj))) return [];
  const nodes = [];
  let cur = [ti, tj];
  while (cur) {
    nodes.unshift(cur);
    cur = prev.get(key(cur[0], cur[1]));
  }
  nodes.shift(); // drop the start node
  return nodes.map(([i, j]) => ({ x: roadCoord(i), z: roadCoord(j), i, j }));
}

// Deterministic per-block flavour for the renderer: building height and
// palette seed for block (bi, bj), bi/bj in 0..8.
export function blockSeed(bi, bj) {
  let h = (bi * 374761393 + bj * 668265263) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
