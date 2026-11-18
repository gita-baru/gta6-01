// Solmar Heat — the wanted system: heat, police pursuit on the road graph
// (BFS), ramming, and the helicopter at 4+ stars. Pure logic.
import { TUNE } from "./config.js";
import { bfs, nearestNode, randomRoadPoint } from "./city.js";
import { makeCar } from "./vehicles.js";
import { range } from "./random.js";

export function stars(S) {
  return Math.max(0, Math.min(5, Math.round(S.wanted)));
}

export function addWanted(S, n) {
  S.wanted = Math.max(0, Math.min(5, S.wanted + n));
  S.quietT = 0;
}

// Heat cools off only after a quiet spell with no new crimes.
export function updateWanted(S, dt) {
  S.quietT += dt;
  if (S.quietT > 12 && S.wanted > 0) {
    S.wanted = Math.max(0, S.wanted - TUNE.wantedDecay * dt);
  }
}

function spawnPoliceCar(S, city, rng) {
  // Spawn on a road node away from the player so they arrive, not appear.
  let node;
  for (let tries = 0; tries < 12; tries++) {
    const p = randomRoadPoint(rng);
    node = nearestNode(city, p.x, p.z);
    const d = Math.hypot(node.x - S.player.x, node.z - S.player.z);
    if (d > 70) break;
  }
  const car = makeCar(node.x, node.z, 0, 0x1a1a1a, "police");
  car.route = bfs(city, node.id, nearestNode(city, S.player.x, S.player.z).id);
  car.routeIdx = 1;
  car.repathT = range(rng, 0.8, 1.6);
  S.cars.push(car);
  return car;
}

export function updatePolice(S, dt, city, rng) {
  const want = stars(S);
  let cops = S.cars.filter((c) => c.kind === "police" && !c.disabled);
  while (cops.length < want) {
    cops.push(spawnPoliceCar(S, city, rng));
  }
  while (cops.length > want) {
    const gone = cops.pop();
    const i = S.cars.indexOf(gone);
    if (i >= 0) S.cars.splice(i, 1);
  }
  for (const cop of cops) {
    cop.repathT -= dt;
    if (cop.repathT <= 0 || cop.routeIdx >= cop.route.length) {
      cop.route = bfs(city, nearestNode(city, cop.x, cop.z).id, nearestNode(city, S.player.x, S.player.z).id);
      cop.routeIdx = 1;
      cop.repathT = 1.2;
    }
    const node = city.nodes[cop.route[cop.routeIdx]];
    if (!node) continue;
    const dx = node.x - cop.x;
    const dz = node.z - cop.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4) {
      cop.routeIdx++;
      continue;
    }
    const wantAngle = Math.atan2(dx, dz);
    let diff = wantAngle - cop.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.angle += Math.max(-3 * dt, Math.min(3 * dt, diff));
    const nearPlayer = Math.hypot(S.player.x - cop.x, S.player.z - cop.z);
    const target = nearPlayer < 30 ? TUNE.policeSpeed : TUNE.policeSpeed * 0.8;
    cop.speed += (target - cop.speed) * Math.min(1, dt * 2);
    cop.x += Math.sin(cop.angle) * cop.speed * dt;
    cop.z += Math.cos(cop.angle) * cop.speed * dt;
    // Ramming: touching the player hurts, and shoves a driven car.
    if (nearPlayer < 3.2) {
      cop.speed *= 0.4;
      if (S.player.onFoot) {
        S.health -= TUNE.policeRamDamage * dt * 3;
        S.fx.push({ type: "hit" });
      } else if (S.player.car) {
        S.player.car.speed *= 0.92;
        S.health -= TUNE.policeRamDamage * dt * 1.2;
        S.fx.push({ type: "hit" });
      }
    }
  }
}

// The helicopter circles the player once the heat hits four stars.
export function updateHeli(S, dt) {
  const on = stars(S) >= 4;
  if (on && !S.heli.active) {
    S.heli.active = true;
    S.heli.angle = 0;
  } else if (!on) {
    S.heli.active = false;
  }
  if (S.heli.active) {
    S.heli.angle += dt * 0.45;
    S.heli.x = S.player.x + Math.cos(S.heli.angle) * 26;
    S.heli.z = S.player.z + Math.sin(S.heli.angle) * 26;
    S.heli.y = 42;
  }
}
