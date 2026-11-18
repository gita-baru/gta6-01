// Combat: punches and pistol shots, pure logic. A shot is a 2D ray from the
// player; the first ped, police car or traffic car it crosses takes the damage.
// Every violent act feeds the wanted level.
import { PLAYER, WANTED } from './config.js';
import { dist2, clamp } from './random.js';

// Punch: anything living within range in front of the player takes damage.
// Returns the list of victims hit.
export function punch(player, peds, police, traffic) {
  const victims = [];
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  const hitOne = (target, radius, kind) => {
    const dx = target.x - player.x;
    const dz = target.z - player.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > PLAYER.PUNCH_RANGE + radius) return;
    if (d > 0.01 && (dx * fx + dz * fz) / d < 0.3) return; // must be roughly ahead
    victims.push({ target, kind });
  };
  for (const ped of peds) if (ped.alive) hitOne(ped, 0.8, 'ped');
  for (const car of police) hitOne(car, 2.2, 'police');
  for (const car of traffic) hitOne(car, 2.2, 'traffic');
  return victims;
}

// Shoot a ray from the player along the aim heading. Returns the first thing hit:
// {kind, target, distance} or null. Peds die, cars take damage (traffic flees).
export function shoot(player, aimHeading, peds, police, traffic) {
  const fx = Math.sin(aimHeading);
  const fz = Math.cos(aimHeading);
  let best = null;
  let bestT = PLAYER.SHOT_RANGE;
  const rayCircle = (target, radius, kind) => {
    // Ray-circle intersection: |o + t*d - c|^2 = r^2, d unit length.
    const ox = player.x - target.x;
    const oz = player.z - target.z;
    const b = ox * fx + oz * fz;
    const c = ox * ox + oz * oz - radius * radius;
    const disc = b * b - c;
    if (disc < 0) return;
    const t = -b - Math.sqrt(disc);
    if (t < 0 || t >= bestT) return;
    bestT = t;
    best = { kind, target, distance: t };
  };
  for (const ped of peds) if (ped.alive) rayCircle(ped, 0.9, 'ped');
  for (const car of police) rayCircle(car, 2.4, 'police');
  for (const car of traffic) rayCircle(car, 2.4, 'traffic');
  return best;
}

// Apply damage from a punch or a shot. Returns an event describing what happened:
// {type: 'kill'|'hurt'|'car-hit', kind, target} or null when nothing was hit.
export function applyHit(hit, damage, state) {
  if (!hit) return null;
  const { kind, target } = hit;
  if (kind === 'ped') {
    target.hp = (target.hp ?? 30) - damage;
    if (target.hp <= 0) {
      target.alive = false;
      state.kills = (state.kills || 0) + 1;
      return { type: 'kill', kind: 'ped', target };
    }
    return { type: 'hurt', kind: 'ped', target };
  }
  if (kind === 'police') {
    target.hp = (target.hp ?? 60) - damage;
    if (target.hp <= 0) {
      target.disabled = true;
      return { type: 'kill', kind: 'police', target };
    }
    return { type: 'hurt', kind: 'police', target };
  }
  // Traffic car: shot out, it stops and the driver bails (simplified: it stops).
  target.hp = (target.hp ?? 40) - damage;
  if (target.hp <= 0) target.wait = 999;
  return { type: 'car-hit', kind: 'traffic', target };
}

// Wanted stars gained for an event. Shooting itself is a crime even on a miss.
export function starsForEvent(event, wasShot) {
  if (wasShot) return WANTED.CRIME.SHOOT;
  if (!event) return 0;
  if (event.type === 'kill') return WANTED.CRIME.KILL;
  if (event.kind === 'ped' && event.type === 'hurt') return WANTED.CRIME.PUNCH_PED;
  return 0;
}

export function addStars(stars, gained) {
  return clamp(stars + gained, 0, WANTED.MAX);
}

const CAR_RAM_MAX = 18;

// A car's ram damage to the player, scaled by impact speed.
export function ramDamage(speed) {
  return Math.round(clamp(Math.abs(speed) * 0.45, 4, CAR_RAM_MAX));
}

// Distance from the player to the nearest police car (Infinity when none).
export function nearestPoliceDist(police, player) {
  let best = Infinity;
  for (const car of police) {
    const d = dist2(car.x, car.z, player.x, player.z);
    if (d < best) best = d;
  }
  return best;
}
