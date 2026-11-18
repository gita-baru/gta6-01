// Marco on foot: movement relative to the camera, fists and pistol.
import { CFG, clamp, dist2d } from './config.js';

export function makePlayer(x, z) {
  return {
    x, z, heading: 0, speed: 0,
    health: CFG.playerHealth,
    onFoot: true,
    car: null,          // the car object when driving
    ammo: CFG.pistolAmmoStart,
    punchCd: 0,
    shootCd: 0,
    moving: false,
  };
}

// input: {mx, mz} move vector in world space (already camera-relative),
// {run} boolean. camYaw only affects facing when moving.
export function stepPlayerOnFoot(p, input, dt) {
  const len = Math.hypot(input.mx, input.mz);
  p.moving = len > 0.1;
  const speed = input.run ? CFG.runSpeed : CFG.walkSpeed;
  if (p.moving) {
    const nx = input.mx / len, nz = input.mz / len;
    p.heading = Math.atan2(nx, nz);
    p.speed = speed;
    p.x += nx * speed * dt;
    p.z += nz * speed * dt;
  } else {
    p.speed = 0;
  }
  p.x = clamp(p.x, CFG.cityMin - 8, CFG.cityMax + 8);
  p.z = clamp(p.z, CFG.cityMin - 8, CFG.beachZ + 44);
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
}

// Punch: hits the nearest ped in front of the player.
export function tryPunch(p, peds) {
  if (p.punchCd > 0) return null;
  p.punchCd = CFG.punchCooldown;
  let best = null, bestD = CFG.punchRange;
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const d = dist2d(p.x, p.z, ped.x, ped.z);
    if (d > bestD) continue;
    const ang = Math.atan2(ped.x - p.x, ped.z - p.z);
    let diff = Math.abs(ang - p.heading);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > 1.2) continue;
    best = ped; bestD = d;
  }
  if (best) {
    best.state = 'down';
    best.downT = 2.5;
    return best;
  }
  return null;
}

// Shoot: hits the nearest ped inside a narrow cone ahead of the aim direction.
export function tryShoot(p, peds, aimHeading) {
  if (p.shootCd > 0 || p.ammo <= 0) return { hit: null, fired: false };
  p.shootCd = 0.28;
  p.ammo--;
  let best = null, bestD = CFG.shootRange;
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const d = dist2d(p.x, p.z, ped.x, ped.z);
    if (d > bestD) continue;
    const ang = Math.atan2(ped.x - p.x, ped.z - p.z);
    let diff = Math.abs(ang - aimHeading);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > 0.22) continue;
    best = ped; bestD = d;
  }
  if (best) {
    best.state = 'down';
    best.downT = 6;
    return { hit: best, fired: true };
  }
  return { hit: null, fired: true };
}
