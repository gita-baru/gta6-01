// Solmar Heat — the game itself: state, the loop, and every system wired up.
import { MISSIONS, RADIO_STATIONS, SAVE_KEY, TUNE } from "./config.js";
import { buildCity, insideBuilding } from "./city.js";
import { mulberry32, range } from "./random.js";
import { driveCar, makeCar, makeTraffic, nearestCar, updateTraffic } from "./vehicles.js";
import { makePeds, updatePeds } from "./people.js";
import { addWanted, stars, updateHeli, updatePolice, updateWanted } from "./police.js";
import { nextMissionIndex, startMission, updateMission } from "./missions.js";
import { damagePlayer, punch, shoot } from "./combat.js";
import { GameAudio } from "./audio.js";
import { showScreen, updateHud } from "./hud.js";
import { Renderer } from "./render.js";
import { Input } from "./input.js";
import { applyShot, shotCamera } from "./shots.js";

window.__shotReady = false;
window.__shotErrors = 0;
window.addEventListener("error", () => window.__shotErrors++);
window.addEventListener("unhandledrejection", () => window.__shotErrors++);

const params = new URLSearchParams(location.search);
const shotName = params.get("shot");

function createState(seed) {
  const city = buildCity(seed);
  const rng = mulberry32(seed + 7);
  const cars = makeTraffic(10, city, rng);
  const parked = [
    [-78, 26, 0x2e86c1], [78, -78, 0x95a5a6], [-26, 182, 0xe67e22],
    [130, -26, 0x7d3c98], [-182, 78, 0x2c3e50], [182, 130, 0x1e8449],
  ];
  for (const [x, z, color] of parked) {
    cars.push(makeCar(x, z, range(rng, 0, Math.PI * 2), color, "parked"));
  }
  // The yellow Comet Hot Wheels asks you to steal.
  cars.push(makeCar(26, 26, Math.PI / 2, 0xf1c40f, "mission"));
  const S = {
    city,
    time: 0,
    clock: 8 * 3600,
    money: 0,
    wanted: 0,
    quietT: 99,
    health: TUNE.playerMaxHealth,
    ammo: TUNE.startAmmo,
    player: { x: 0, z: 26, angle: 0, speed: 0, onFoot: true, car: null },
    cars,
    peds: makePeds(18, city, rng),
    heli: { active: false, angle: 0, x: 0, z: 0, y: 42 },
    mission: { index: -1, step: 0, active: false, targetCar: null, timer: 0, text: "", done: [false, false, false, false, false] },
    danger: null,
    fx: [],
    banner: "",
    bannerT: 0,
    state: "title",
    rng,
  };
  try {
    const save = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (save) {
      S.money = save.money || 0;
      if (Array.isArray(save.done)) S.mission.done = save.done.map(Boolean);
      if (save.ammo) S.ammo = save.ammo;
    }
  } catch {
    // No save yet — a fresh start.
  }
  return S;
}

function saveGame(S) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: S.money,
      done: S.mission.done,
      ammo: S.ammo,
    }));
  } catch {
    // Storage can be unavailable; the game plays on regardless.
  }
}

function setBanner(S, text, seconds = 4) {
  S.banner = text;
  S.bannerT = seconds;
}

function enterCar(S) {
  const car = nearestCar(S.cars, S.player.x, S.player.z, 4.5, ["traffic", "parked", "police", "mission"]);
  if (!car) return;
  if (car.kind === "traffic" || car.kind === "parked" || car.kind === "mission") {
    addWanted(S, 0.5);
    setBanner(S, "Car stolen — the street is watching", 3);
  }
  car.kind = "player";
  car.route = [];
  S.player.car = car;
  S.player.onFoot = false;
  S.player.x = car.x;
  S.player.z = car.z;
  S.player.angle = car.angle;
  S.fx.push({ type: "pickup" });
}

function exitCar(S) {
  const car = S.player.car;
  if (!car) return;
  car.kind = "parked";
  car.speed = 0;
  S.player.car = null;
  S.player.onFoot = true;
  S.player.x = car.x + Math.sin(car.angle + Math.PI / 2) * 2.5;
  S.player.z = car.z + Math.cos(car.angle + Math.PI / 2) * 2.5;
  S.player.angle = car.angle;
}

function respawn(S) {
  S.health = TUNE.playerMaxHealth;
  S.wanted = 0;
  S.quietT = 99;
  S.cars = S.cars.filter((c) => c.kind !== "police");
  S.heli.active = false;
  if (S.player.car) {
    const i = S.cars.indexOf(S.player.car);
    if (i >= 0) S.cars.splice(i, 1);
    S.player.car = null;
  }
  S.player.onFoot = true;
  S.player.x = -130;
  S.player.z = -122;
  S.player.angle = 0;
  S.state = "playing";
  showScreen("");
  setBanner(S, "Back on the streets of Solmar", 3);
}

const S = createState(1337);
// Exposed for headless play tests (tools/playtest.mjs) — harmless in play.
window.__game = S;
const input = new Input();
const audio = new GameAudio();
const renderer = new Renderer(document.getElementById("game"), S.city);
let saveT = 0;
let shotFrames = 0;
let shotStaged = false;

if (shotName) {
  applyShot(S, shotName);
  shotStaged = true;
  S.state = "playing";
  showScreen(shotName === "title" ? "title-screen" : "");
} else {
  showScreen("title-screen");
}

function setState(name) {
  S.state = name;
  showScreen(name === "playing" ? "" : name + "-screen");
}

function updatePlaying(dt) {
  const intent = input.driveIntent();
  const p = S.player;
  if (p.onFoot) {
    const speed = intent.run ? TUNE.runSpeed : TUNE.walkSpeed;
    p.angle += ((intent.left ? 1 : 0) - (intent.right ? 1 : 0)) * 2.8 * dt;
    const move = (intent.up ? 1 : 0) - (intent.down ? 1 : 0);
    const nx = p.x + Math.sin(p.angle) * speed * move * dt;
    const nz = p.z + Math.cos(p.angle) * speed * move * dt;
    if (!insideBuilding(S.city, nx, nz, 0.8)) {
      p.x = nx;
      p.z = nz;
    }
    p.speed = Math.abs(move) * speed;
  } else if (p.car) {
    driveCar(p.car, intent, dt, S.city);
    p.x = p.car.x;
    p.z = p.car.z;
    p.angle = p.car.angle;
    p.speed = Math.abs(p.car.speed);
  }
  if (input.wasPressed("KeyE")) {
    if (p.onFoot) enterCar(S);
    else exitCar(S);
  }
  if (input.wasPressed("KeyF")) punch(S);
  const clicks = input.consumeClick();
  if (clicks > 0 && S.state === "playing") {
    for (let i = 0; i < clicks; i++) shoot(S, p.angle);
  }
  if (input.wasPressed("KeyT") && !S.mission.active) {
    const next = nextMissionIndex(S);
    if (next >= 0) {
      const m = startMission(S, next);
      setBanner(S, `${m.name} — ${m.briefing}`, 6);
    } else {
      setBanner(S, "All five jobs are done. Solmar is yours.", 4);
    }
  }
  if (input.wasPressed("KeyR")) {
    const name = audio.nextStation();
    setBanner(S, "Radio: " + name, 2.5);
  }
  if (input.wasPressed("KeyM")) {
    audio.setMuted(!audio.muted);
    setBanner(S, audio.muted ? "Muted" : "Sound on", 2);
  }
  if (input.wasPressed("Escape")) setState("paused");
  for (const car of S.cars) {
    if (car.kind === "traffic") updateTraffic(car, dt, S.city, S.rng);
  }
  updatePeds(S.peds, dt, S.city, S.rng, S.danger);
  S.danger = null;
  updateWanted(S, dt);
  updatePolice(S, dt, S.city, S.rng);
  updateHeli(S, dt);
  const ev = updateMission(S, dt);
  if (ev && ev.type === "complete") {
    setBanner(S, `${ev.mission.name} complete — $${ev.mission.reward.toLocaleString("en-US")}`, 5);
    saveGame(S);
  } else if (ev && ev.type === "failed") {
    setBanner(S, ev.mission.name + " failed", 4);
  } else if (ev && ev.type === "step") {
    setBanner(S, ev.step.text, 4);
  }
  // Health creeps back when the heat is off.
  if (stars(S) === 0 && S.health < TUNE.playerMaxHealth) {
    S.health = Math.min(TUNE.playerMaxHealth, S.health + 2 * dt);
  }
  if (S.health <= 0) {
    const nearCop = S.cars.some(
      (c) => c.kind === "police" && Math.hypot(c.x - p.x, c.z - p.z) < 6
    );
    if (nearCop && p.onFoot) {
      S.money = Math.floor(S.money * 0.9);
      setState("busted");
    } else {
      setState("wasted");
    }
    saveGame(S);
  }
  S.clock = (S.clock + dt * 45) % 86400;
  if (S.bannerT > 0) S.bannerT -= dt;
  saveT += dt;
  if (saveT > 10) {
    saveT = 0;
    saveGame(S);
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (shotName) {
    // Staged scene: the world idles, the camera never moves. In the chase
    // the police hold their staged positions so they stay in frame.
    for (const car of S.cars) {
      if (car.kind === "traffic") updateTraffic(car, dt, S.city, S.rng);
    }
    updatePeds(S.peds, dt, S.city, S.rng, null);
    if (shotName !== "chase") updatePolice(S, dt, S.city, S.rng);
    updateHeli(S, dt);
    S.time += dt;
    renderer.followCamera(S, dt, true, shotCamera(shotName));
    renderer.sync(S, dt);
    updateHud(S, audio);
    shotFrames++;
    if (shotFrames >= 45) window.__shotReady = true;
  } else if (S.state === "playing") {
    S.time += dt;
    updatePlaying(dt);
    for (const fx of S.fx) audio.playFx(fx.type);
    audio.update(S, dt);
    S.fx = [];
    renderer.followCamera(S, dt, false);
    renderer.sync(S, dt);
    updateHud(S, audio);
  } else if (S.state === "title") {
    S.time += dt;
    const a = S.time * 0.03;
    renderer.camera.position.set(Math.sin(a) * 260, 110, 200 + Math.cos(a) * 120);
    renderer.camera.lookAt(0, 0, 40);
    renderer.sync(S, dt);
    if (input.wasPressed("Enter") || input.consumeClick() > 0) {
      audio.ensure();
      setState("playing");
    }
  } else {
    // Paused, busted or wasted: the city holds still behind the menu.
    renderer.sync(S, dt);
    if (S.state === "paused" && input.wasPressed("Escape")) setState("playing");
    if ((S.state === "busted" || S.state === "wasted") && (input.wasPressed("Enter") || input.consumeClick() > 0)) {
      respawn(S);
    }
    if (S.state === "paused" && input.consumeClick() > 0) setState("playing");
  }
  input.endFrame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
