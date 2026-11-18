// Headless screenshot driver for Solmar Heat: launches the local Chromium
// with the Hatch WebGL policy flags, opens a URL over CDP, optionally plays
// scripted keys, waits for window.__shotReady (or a fixed delay), captures a
// JPEG screenshot and prints console errors. No dependencies: Node 24's
// global WebSocket and fetch talk to Chrome's DevTools protocol.
//
// (v2, 18 Nov 2026) Use the stock Chromium via SHOT_CHROME: the Hatch build
// blocks localhost navigation, so the Playwright Chromium is the driver.
//
// Usage:
//   node tools/shot.mjs --url "http://localhost:8080/?shot=cover" --out shots/1.jpg
//   node tools/shot.mjs --url "http://localhost:8080/" --out shots/play.jpg \
//     --keys "Enter:800,KeyW:3000" --wait 2500
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const CHROME = process.env.SHOT_CHROME || '/opt/meta-chromium/chrome';
const POLICY = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const POLICY_SHA = createHash('sha256').update(
  (await import('node:fs')).readFileSync(POLICY),
).digest('hex');
const PORT = 9222;

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { width: 1280, height: 720, wait: 1500 };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--url') out.url = args[++i];
    else if (args[i] === '--out') out.out = args[++i];
    else if (args[i] === '--width') out.width = Number(args[++i]);
    else if (args[i] === '--height') out.height = Number(args[++i]);
    else if (args[i] === '--wait') out.wait = Number(args[++i]);
    else if (args[i] === '--keys') out.keys = args[++i];
    else if (args[i] === '--eval') out.eval = args[++i];
  }
  if (!out.url || !out.out) {
    console.error('usage: shot.mjs --url <url> --out <file.jpg> [--width 1280] [--height 720] [--wait ms] [--keys "Enter:800,KeyW:3000"] [--eval js]');
    process.exit(2);
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForChrome() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('chrome did not start');
}

const opts = parseArgs();
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage',
  '--disable-features=LocalNetworkAccessChecks',
  '--user-data-dir=/tmp/chrome-shot-profile',
  `--hatch-webgl-allowed-domains-file=${POLICY}`,
  `--hatch-webgl-allowed-domains-sha256=${POLICY_SHA}`,
  `--remote-debugging-port=${PORT}`,
  `--window-size=${opts.width},${opts.height}`,
  opts.url,
], { stdio: 'ignore' });

let exitCode = 0;
try {
  await waitForChrome();
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const target = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  const send = (method, params) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result || {});
      pending.delete(msg.id);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push('EXCEPTION: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 500));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push('CONSOLE: ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 500));
    }
    if (msg.method === 'Network.loadingFailed') {
      errors.push('NETFAIL: ' + (msg.params.errorText || ''));
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: opts.width, height: opts.height, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);

  // Scripted keys: "Enter:800,KeyW:3000" = press Enter, hold 800ms, then W for 3s.
  if (opts.keys) {
    for (const part of opts.keys.split(',')) {
      const [code, holdMs] = part.split(':');
      const hold = Number(holdMs || 300);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.replace('Key', '').replace('Arrow', '').toLowerCase() || code });
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: code.replace('Key', '').replace('Arrow', '').toLowerCase() || code });
      await sleep(hold);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code.replace('Key', '').replace('Arrow', '').toLowerCase() || code });
      await sleep(150);
    }
  }

  // Wait for the game's shot flag, or a fixed delay for live play.
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    const res = await send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
    if (res.result && res.result.value === true) { ready = true; break; }
    await sleep(250);
  }
  await sleep(opts.wait);

  if (opts.eval) {
    const res = await send('Runtime.evaluate', { expression: opts.eval, returnByValue: true });
    console.log('EVAL:', JSON.stringify(res.result?.value ?? res.result ?? res).slice(0, 1000));
  }

  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  if (!shot.data) throw new Error('no screenshot data');
  writeFileSync(opts.out, Buffer.from(shot.data, 'base64'));
  console.log(`saved ${opts.out} ready=${ready} errors=${errors.length}`);
  for (const e of errors.slice(0, 10)) console.log('  ' + e);
  ws.close();
} catch (err) {
  console.error('FAILED:', err.message);
  exitCode = 1;
} finally {
  chrome.kill('SIGKILL');
}
process.exit(exitCode);
