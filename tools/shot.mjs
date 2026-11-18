// Solmar Heat — screenshot runner. Serves the game, opens each staged scene
// in stock Chromium, waits for the camera to settle, and captures 1280x720.
// Run: SHOT_CHROME=<path to chrome> node tools/shot.mjs
// Env: SHOT_CHROME overrides the Chromium binary; SHOT_URL overrides the base.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { writeFileSync } from "node:fs";

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
const SHOTS = [
  { name: "chase", file: "screenshots/1-chase.jpg" },
  { name: "street", file: "screenshots/2-street.jpg" },
  { name: "mission", file: "screenshots/3-mission.jpg" },
  { name: "title", file: "screenshots/4-title.jpg" },
];

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
server.stdout.on("data", (d) => process.stdout.write("[serve] " + d));
server.stderr.on("data", (d) => process.stderr.write("[serve] " + d));

const results = [];
try {
  await waitForServer(BASE + "/");
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(`${BASE}/?shot=${shot.name}`, { waitUntil: "load", timeout: 30000 });
    let ready = false;
    try {
      await page.waitForFunction(() => window.__shotReady === true, { timeout: 30000 });
      ready = true;
    } catch {
      ready = false;
    }
    const shotErrors = await page.evaluate(() => window.__shotErrors || 0).catch(() => -1);
    await page.waitForTimeout(700); // let the camera and the scene settle
    await page.screenshot({ path: shot.file, type: "jpeg", quality: 85 });
    const bytes = statSync(shot.file).size;
    results.push({ ...shot, ready, errors: shotErrors, consoleErrors: errors.length, bytes });
    console.log(JSON.stringify(results[results.length - 1]));
    await page.close();
  }
  await browser.close();
} finally {
  server.kill();
}

const bad = results.filter((r) => !r.ready || r.errors !== 0 || r.bytes > 262144);
console.log(`\nshots: ${results.length - bad.length}/${results.length} clean`);
if (bad.length) {
  console.log("problems:", JSON.stringify(bad));
  process.exit(1);
}
