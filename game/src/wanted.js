// Wanted level: stars, heat, police response, cooldown, bust/wasted checks.
import { CFG, dist2d } from './config.js';
import { makeCar } from './vehicles.js';
import { nearestRoadPoint } from './city.js';

export function makeWanted() {
  return {
    stars: 0,
    heat: 0,            // continuous heat; stars = ceil(heat)
    lastCrime: -999,    // world time of the last crime
    bustT: 0,           // how long police have been right on top of the player
  };
}

export function addCrime(world, amount) {
  const w = world.wanted;
  w.heat = Math.min(CFG.maxStars, w.heat + amount);
  w.stars = Math.max(w.stars, Math.ceil(w.heat));
  w.lastCrime = world.time;
}

export function setWanted(world, stars) {
  world.wanted.stars = stars;
  world.wanted.heat = stars;
  world.wanted.lastCrime = world.time;
}

// Keep the number of police cruisers in step with the stars; spawn them a
// couple of blocks away so they drive in instead of popping up on screen.
export function updateWanted(world, dt) {
  const w = world.wanted;
  // Heat decays only when the player has been clean for a while and no
  // police car is close; the helicopter at 4+ stars blocks the cooldown.
  const heliUp = w.stars >= CFG.heliStars;
  const policeNear = world.police.some((c) => dist2d(c.x, c.z, world.player.x, world.player.z) < 60);
  if (world.time - w.lastCrime > CFG.heatDecayDelay && !policeNear && !heliUp && w.heat > 0) {
    w.heat = Math.max(0, w.heat - CFG.heatDecayRate * dt);
    w.stars = Math.ceil(w.heat);
  }
  const want = w.stars;
  while (world.police.length < want) {
    const p = world.player;
    const spot = nearestRoadPoint(p.x + (world.rng.chance(0.5) ? 90 : -90), p.z + (world.rng.chance(0.5) ? 90 : -90));
    const car = makeCar(world.rng, 'police', spot.x, spot.z, world.rng.range(0, Math.PI * 2));
    car.speed = 12;
    world.police.push(car);
  }
  while (world.police.length > want) world.police.pop();
  world.heli.active = w.stars >= CFG.heliStars;

  // Busted: a cruiser sits on the player while on foot.
  const p = world.player;
  if (p.onFoot && w.stars > 0) {
    const close = world.police.some((c) => dist2d(c.x, c.z, p.x, p.z) < CFG.bustDist && c.speed < 6);
    if (close) {
      w.bustT += dt;
      if (w.bustT > CFG.bustTime) world.busted = true;
    } else {
      w.bustT = Math.max(0, w.bustT - dt * 2);
    }
  } else {
    w.bustT = 0;
  }
  if (p.health <= 0) world.wasted = true;
}
