// Solmar Heat — combat: fists and the pistol. Pure logic.
import { TUNE } from "./config.js";
import { addWanted } from "./police.js";

export function punch(S) {
  const p = S.player;
  for (const ped of S.peds) {
    if (ped.state === "down") continue;
    const d = Math.hypot(ped.x - p.x, ped.z - p.z);
    if (d > TUNE.punchRange) continue;
    let diff = Math.atan2(ped.x - p.x, ped.z - p.z) - p.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > TUNE.punchArc) continue;
    ped.state = "down";
    addWanted(S, 0.5);
    S.fx.push({ type: "punch" });
    return { hit: true, kind: "ped" };
  }
  S.fx.push({ type: "punch" });
  return { hit: false };
}

// Fire the pistol along an angle. Hits the closest ped or police car inside
// a narrow cone; every shot is a crime, and the street hears it.
export function shoot(S, angle) {
  if (S.ammo <= 0) {
    S.fx.push({ type: "dry" });
    return { hit: false, dry: true };
  }
  S.ammo--;
  S.fx.push({ type: "shot" });
  S.danger = { x: S.player.x, z: S.player.z };
  addWanted(S, 1);
  let best = null;
  let bestD = TUNE.gunRange;
  const consider = (x, z, kind, ref) => {
    const d = Math.hypot(x - S.player.x, z - S.player.z);
    if (d > bestD) return;
    let diff = Math.atan2(x - S.player.x, z - S.player.z) - angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > TUNE.gunCone + 1.2 / Math.max(d, 4)) return;
    bestD = d;
    best = { kind, ref };
  };
  for (const ped of S.peds) {
    if (ped.state !== "down") consider(ped.x, ped.z, "ped", ped);
  }
  for (const car of S.cars) {
    if (car.kind === "police" && !car.disabled) consider(car.x, car.z, "police", car);
  }
  if (!best) return { hit: false };
  if (best.kind === "ped") {
    best.ref.state = "down";
    return { hit: true, kind: "ped" };
  }
  best.ref.hp -= TUNE.gunDamage;
  if (best.ref.hp <= 0) {
    best.ref.disabled = true;
    best.ref.speed = 0;
  }
  return { hit: true, kind: "police", disabled: best.ref.disabled };
}

export function damagePlayer(S, amt) {
  S.health = Math.max(0, S.health - amt);
  S.fx.push({ type: "hit" });
  return S.health <= 0;
}
