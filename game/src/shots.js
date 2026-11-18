// Solmar Heat — screenshot staging: deterministic scenes for the four
// screenshots, with the camera snapped to its final pose (no drift).
import { makeCar } from "./vehicles.js";
import { startMission } from "./missions.js";
import { addWanted } from "./police.js";

function givePlayerCar(S, x, z, angle, speed, color) {
  if (S.player.car) {
    const i = S.cars.indexOf(S.player.car);
    if (i >= 0) S.cars.splice(i, 1);
  }
  const car = makeCar(x, z, angle, color, "player");
  car.speed = speed;
  S.cars.push(car);
  S.player.car = car;
  S.player.onFoot = false;
  S.player.x = x;
  S.player.z = z;
  S.player.angle = angle;
  return car;
}

function addCop(S, x, z, angle, speed) {
  const cop = makeCar(x, z, angle, 0x1a1a1a, "police");
  cop.speed = speed;
  cop.route = [];
  cop.routeIdx = 0;
  S.cars.push(cop);
  return cop;
}

export function applyShot(S, name) {
  // Clear any police the live game spawned, then stage the scene.
  S.cars = S.cars.filter((c) => c.kind !== "police");
  S.wanted = 0;
  S.quietT = 99;
  if (name === "chase") {
    S.clock = 17 * 3600 + 45 * 60;
    givePlayerCar(S, 26, 10, Math.PI, 38, 0xc0392b);
    addCop(S, 24, 34, Math.PI, 40);
    addCop(S, 29, 48, Math.PI, 40);
    addWanted(S, 3);
    S.quietT = 0;
  } else if (name === "street") {
    S.clock = 12 * 3600;
    if (S.player.car) {
      const i = S.cars.indexOf(S.player.car);
      if (i >= 0) S.cars.splice(i, 1);
      S.player.car = null;
    }
    S.player.onFoot = true;
    S.player.x = 26;
    S.player.z = 30;
    S.player.angle = 0.6;
    // Pack the plaza with traffic and pedestrians.
    const spots = [[26, -20], [26, 74], [-20, 26], [74, 26], [26, -74], [78, 26]];
    const traffic = S.cars.filter((c) => c.kind === "traffic");
    traffic.forEach((car, i) => {
      const s = spots[i % spots.length];
      car.x = s[0];
      car.z = s[1];
      car.angle = i % 2 === 0 ? 0 : Math.PI / 2;
      car.speed = 6;
    });
    S.peds.forEach((p, i) => {
      p.x = 26 + ((i * 37) % 50) - 25;
      p.z = 26 + ((i * 23) % 44) - 22;
      p.state = "walk";
    });
  } else if (name === "mission") {
    S.clock = 15 * 3600 + 30 * 60;
    startMission(S, 0);
    givePlayerCar(S, 130, 135, 0, 20, 0xc0392b);
  } else if (name === "title") {
    S.clock = 18 * 3600 + 20 * 60;
    if (S.player.car) {
      const i = S.cars.indexOf(S.player.car);
      if (i >= 0) S.cars.splice(i, 1);
      S.player.car = null;
    }
    S.player.onFoot = true;
    S.player.x = 0;
    S.player.z = 100;
    S.player.angle = Math.PI;
  }
}

export function shotCamera(name) {
  if (name === "chase") return { pos: [26, 9, 62], target: [26, 1, -5] };
  if (name === "street") return { pos: [58, 22, 66], target: [24, 1, 24] };
  if (name === "mission") return { pos: [130, 6, 105], target: [130, 2, 205] };
  return { pos: [180, 95, 330], target: [0, 0, 40] };
}

export const SHOT_NAMES = ["chase", "street", "mission", "title"];
