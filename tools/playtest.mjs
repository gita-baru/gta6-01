// Solmar Heat — headless play test: start the game, walk, steal a car, drive,
// start a mission, shoot, and confirm the state changes. No screenshots.
// Run: SHOT_CHROME=<path to chrome> node tools/playtest.mjs
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
let chromium = null;
for (const p of [
  "/home/hatch/.npm/_npx/f0a362733743bae2/node_modules/playwright-core",
  "/home/hatch/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core",
  "playwright-core",
]) {
  try {
    chromium = require(p).chromium;
    break;
  } catch {
    // Try the next location.
  }
}
if (!chromium) {
  console.error("playwright-core not found");
  process.exit(1);
}

const CHROME = process.env.SHOT_CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const BASE = process.env.SHOT_URL || "http://localhost:8080";

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve(true);
      } catch {
        // Not up yet.
      }
      if (Date.now() - start > timeoutMs) return reject(new Error("server did not start"));
      setTimeout(tick, 300);
    };
    tick();
  });
}

const server = spawn("node", ["serve.ts"], {
  cwd: new URL("..", import.meta.url).pathname,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: "8080" },
});

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ok ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

try {
  await waitForServer(BASE + "/");
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(2500);
  check("page loads without errors", errors.length === 0, errors.join("; "));
  check("title screen shows", await page.evaluate(() => document.getElementById("title-screen").style.display === "flex"));
  const state = () => page.evaluate(() => {
    const S = window.__game;
    return {
      state: S.state,
      onFoot: S.player.onFoot,
      x: S.player.x,
      z: S.player.z,
      wanted: S.wanted,
      mission: S.mission.active,
      money: S.money,
      ammo: S.ammo,
    };
  });
  // Start the game (poll: headless frames are slow).
  async function waitFor(pred, timeoutMs = 15000, label = "") {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const s = await state();
      if (pred(s)) return s;
      await page.waitForTimeout(400);
    }
    return await state();
  }
  await page.keyboard.press("Enter");
  check("Enter starts the game", (await waitFor((s) => s.state === "playing")).state === "playing");
  // Walk forward until the player has actually moved (headless SwiftShader
  // renders slowly, so wall-clock waits understate game time — poll instead).
  const before = await state();
  async function movedMoreThan(minDist, timeoutMs = 25000) {
    const start = Date.now();
    let best = 0;
    while (Date.now() - start < timeoutMs) {
      const s = await state();
      best = Math.hypot(s.x - before.x, s.z - before.z);
      if (best >= minDist) return best;
      await page.waitForTimeout(400);
    }
    return best;
  }
  await page.keyboard.down("KeyW");
  const walked = await movedMoreThan(5);
  await page.keyboard.up("KeyW");
  check("player walks", walked > 5, `moved ${walked.toFixed(1)}m`);
  // Teleport next to a parked car (test hook) and steal it.
  await page.evaluate(() => {
    const S = window.__game;
    const car = S.cars.find((c) => c.kind === "parked");
    S.player.x = car.x + 2;
    S.player.z = car.z;
  });
  await page.keyboard.press("KeyE");
  const inCar = await waitFor((s) => s.onFoot === false);
  check("E steals a car", inCar.onFoot === false);
  check("stealing raises wanted", inCar.wanted > 0, `wanted ${inCar.wanted}`);
  // Drive until the car has actually covered ground.
  const d0 = await state();
  async function droveMoreThan(minDist, timeoutMs = 25000) {
    const start = Date.now();
    let best = 0;
    while (Date.now() - start < timeoutMs) {
      const s = await state();
      best = Math.hypot(s.x - d0.x, s.z - d0.z);
      if (best >= minDist) return best;
      await page.waitForTimeout(400);
    }
    return best;
  }
  await page.keyboard.down("KeyW");
  const drove = await droveMoreThan(10);
  await page.keyboard.up("KeyW");
  check("car drives", drove > 10, `drove ${drove.toFixed(1)}m`);
  // Start a mission.
  await page.keyboard.press("KeyT");
  check("T starts a mission", (await waitFor((s) => s.mission === true)).mission === true);
  // Shoot once (poll: headless frames are slow, so a fixed wait is too short).
  const a0 = (await state()).ammo;
  await page.mouse.click(480, 270);
  let ammoNow = a0;
  const shotStart = Date.now();
  while (Date.now() - shotStart < 10000 && ammoNow === a0) {
    await page.waitForTimeout(400);
    ammoNow = (await state()).ammo;
  }
  check("click shoots", ammoNow === a0 - 1, `ammo ${a0} -> ${ammoNow}`);
  // Pause and resume.
  await page.keyboard.press("Escape");
  check("Esc pauses", (await waitFor((s) => s.state === "paused")).state === "paused");
  await page.keyboard.press("Escape");
  check("Esc resumes", (await waitFor((s) => s.state === "playing")).state === "playing");
  await browser.close();
} finally {
  server.kill();
}

console.log(`\nplaytest: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
