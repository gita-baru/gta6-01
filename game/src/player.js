// The player on foot: walk and run relative to the camera, fists and a
// pistol, getting in and out of cars. Position is a circle for collisions.
// (v2, 18 Nov 2026) Unchanged: the street scene walks at these speeds.
import { PLAYER_RADIUS, RUN_SPEED, WALK_SPEED } from './config.js';
import { collideCircle } from './city.js';

export function createPlayer(x, z, heading) {
  return {
    x, z,
    heading,
    speed: 0,
    walkPhase: 0,
    health: 100,
    inCar: null, // car id, or null when on foot
    ammo: 24,
    punchCooldown: 0,
    shootCooldown: 0,
  };
}

export function stepPlayer(player, dt, moveX, moveZ, running, buildings) {
  if (player.inCar) return;
  const speed = running ? RUN_SPEED : WALK_SPEED;
  const len = Math.hypot(moveX, moveZ);
  if (len > 0.01) {
    const nx = moveX / len;
    const nz = moveZ / len;
    player.x += nx * speed * dt;
    player.z += nz * speed * dt;
    player.heading = Math.atan2(nx, nz);
    player.speed = speed;
    player.walkPhase += speed * dt * 1.6;
  } else {
    player.speed = 0;
  }
  const fixed = collideCircle(buildings, player.x, player.z, PLAYER_RADIUS);
  player.x = fixed.x;
  player.z = fixed.z;
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
}
