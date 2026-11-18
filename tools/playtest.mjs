// Headless playtest for Solmar Heat: loads the game in Chromium, starts it,
// walks, steals a car, drives, starts a mission and checks the police respond
// — the same systems the screenshots show, exercised end to end.
//   SHOT_CHROME=/path/to/chrome node tools/playtest.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_CORE ||
    '/home/hatch/workspace/makefun/pw-tools/node_modules/playwright-core',
);

const chromePath =
  process.env.SHOT_CHROME ||
  '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const base = process.env.SHOT_BASE || 'http://localhost:8080';

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log(`ok: ${name}`);
  } else {
    failed++;
    console.log(`FAIL: ${name}`);
  }
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message || e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(`${base}/`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 30000 });
check('game object loads', true);
check('title screen visible', await page.isVisible('#screen-title'));
check('no errors on load', errors.length === 0 && (await page.evaluate(() => window.__gameErrors.length)) === 0);

await page.click('#btn-start');
await page.waitForTimeout(800);
check('start button enters play mode', (await page.evaluate(() => window.__game.state.mode)) === 'playing');
check('HUD shows after start', await page.isVisible('#hud'));

// Walk forward: the player should move. Headless swiftshader renders the
// 3D scene slowly, so frames are sparse and game time runs well behind wall
// time (dt is clamped to 0.05s/frame) — wait for the movement itself rather
// than assuming a fixed wall-clock window.
const before = await page.evaluate(() => ({ x: window.__game.state.player.x, z: window.__game.state.player.z }));
await page.keyboard.down('KeyW');
let walked = false;
try {
  await page.waitForFunction(
    (b) => {
      const p = window.__game.state.player;
      return Math.hypot(p.x - b.x, p.z - b.z) > 2;
    },
    before,
    { timeout: 20000 },
  );
  walked = true;
} catch {
  walked = false;
}
await page.keyboard.up('KeyW');
check('player walks with W', walked);

// Minimap is actually drawn (pixels are not all one colour).
const mapDrawn = await page.evaluate(() => {
  const c = document.getElementById('minimap');
  const ctx = c.getContext('2d');
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  const colours = new Set();
  for (let i = 0; i < data.length; i += 400) colours.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  return colours.size > 8;
});
check('minimap draws the city', mapDrawn);
check('HUD money shows', (await page.textContent('#hud-money')).includes('$'));

// Steal a parked car: teleport beside one, press E, drive off.
await page.evaluate(() => {
  const g = window.__game;
  const car = g.state.parked[0];
  g.state.player.x = car.x + 2;
  g.state.player.z = car.z;
});
await page.keyboard.press('KeyE');
await page.waitForTimeout(400);
check('entering a car works', await page.evaluate(() => window.__game.state.player.inCar === true));
check('stealing raises wanted', (await page.evaluate(() => window.__game.state.wanted)) >= 1);
const speedBefore = await page.evaluate(() => window.__game.state.playerCar.speed);
await page.keyboard.down('KeyW');
let accelerated = false;
try {
  await page.waitForFunction(
    (sb) => {
      const s = window.__game.state.playerCar.speed;
      return s > 5 && s > sb;
    },
    speedBefore,
    { timeout: 20000 },
  );
  accelerated = true;
} catch {
  accelerated = false;
}
await page.keyboard.up('KeyW');
check('car accelerates', accelerated);

// A mission starts with T and shows an objective.
await page.keyboard.press('KeyT');
await page.waitForTimeout(400);
check('mission starts with T', (await page.evaluate(() => window.__game.state.missions.active !== null)));
check('objective text shows', (await page.textContent('#hud-objective')).length > 3);

// Wanted police actually spawn and chase.
await page.evaluate(() => window.__game.setWanted(3));
await page.waitForTimeout(2500);
const police = await page.evaluate(() => window.__game.state.police.length);
check('police spawn at 3 stars', police >= 2);
check('no errors during play', errors.length === 0 && (await page.evaluate(() => window.__gameErrors.length)) === 0);

await browser.close();
console.log(`\nplaytest: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
