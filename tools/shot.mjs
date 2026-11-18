// Screenshot runner for Solmar Heat: opens the game in headless Chromium once
// per shot, waits for the game's own ready flag (the camera has snapped and
// settled), then captures a 1280x720 JPEG.
//   SHOT_CHROME=/path/to/chrome node tools/shot.mjs
// Chromium from Playwright's cache is used because it renders localhost; the
// --use-angle=swiftshader flag gives it a software WebGL path.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_CORE ||
    '/home/hatch/workspace/makefun/pw-tools/node_modules/playwright-core',
);
import { writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const chromePath =
  process.env.SHOT_CHROME ||
  '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const base = process.env.SHOT_BASE || 'http://localhost:8080';

const SHOTS = [
  { name: '1-chase.jpg', query: '?shot=chase&seed=1' },
  { name: '2-street.jpg', query: '?shot=street&seed=1' },
  { name: '3-mission.jpg', query: '?shot=mission&seed=1' },
  { name: '4-title.jpg', query: '?shot=title&seed=1' },
];

const only = process.argv[2]; // optionally a single shot name
const shots = only ? SHOTS.filter((s) => s.name === only) : SHOTS;
if (shots.length === 0) {
  console.error(`unknown shot ${only}`);
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
});
const results = [];
for (const shot of shots) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const url = `${base}/${shot.query}`;
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  let ready = false;
  try {
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 90000 });
    ready = true;
  } catch {
    ready = false;
  }
  const gameErrors = await page.evaluate(() => window.__gameErrors || []).catch(() => []);
  errors.push(...gameErrors);
  const outPath = join(repo, 'screenshots', shot.name);
  await page.screenshot({ path: outPath, type: 'jpeg', quality: 82 });
  const bytes = statSync(outPath).size;
  results.push({ name: shot.name, ready, errors: errors.length, errorText: errors.slice(0, 3), bytes });
  console.log(`${shot.name}: ready=${ready} errors=${errors.length} bytes=${bytes}`);
  await page.close();
}
await browser.close();
const bad = results.filter((r) => !r.ready || r.errors > 0 || r.bytes > 262144);
console.log(`shots: ${results.length - bad.length}/${results.length} clean`);
if (bad.length > 0) process.exit(1);
