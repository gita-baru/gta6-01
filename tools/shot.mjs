// Headless-Chromium screenshot driver over CDP (no dependencies — Node 24
// has a global WebSocket client). Usage:
//   SHOT_CHROME=/path/to/chrome node tools/shot.mjs --url <url> --out <file> [--wait ms] [--no-ready]
// Waits for window.__shot.ready (unless --no-ready), then captures a JPEG and
// reports the page's error count. Exits non-zero if errors > 0 or on timeout.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CHROME = process.env.SHOT_CHROME
  || '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const url = opt('--url');
const out = opt('--out');
const waitMs = parseInt(opt('--wait', '5000'), 10);
const expectReady = !args.includes('--no-ready');
const timeoutMs = parseInt(opt('--timeout', '45000'), 10);
if (!url || !out) {
  console.error('usage: node tools/shot.mjs --url <url> --out <file> [--wait ms] [--no-ready]');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9333;
const profile = `/tmp/shot-profile-${process.pid}`;

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=1280,720', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

async function getJson(path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return res.json();
}

let ws = null;
let msgId = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true });
  return res?.result?.value;
}

let code = 0;
try {
  // Wait for DevTools to answer.
  let version = null;
  for (let i = 0; i < 60; i++) {
    try { version = await getJson('/json/version'); break; } catch { await sleep(500); }
  }
  if (!version) throw new Error('DevTools did not come up');

  const targets = await getJson('/json/list');
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id).resolve(msg.result);
      pending.delete(msg.id);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(1500);

  let ready = false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      ready = await evaluate('window.__shot && window.__shot.ready === true');
    } catch { ready = false; }
    if (ready || !expectReady) break;
    await sleep(500);
  }
  if (expectReady && !ready) throw new Error('timed out waiting for window.__shot.ready');
  if (!expectReady) await sleep(waitMs);

  const errors = (await evaluate('window.__shotErrors || 0')) ?? 0;
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  const buf = Buffer.from(shot.data, 'base64');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
  console.log(JSON.stringify({ ready: !!ready, errors, out, bytes: buf.length }));
  if (errors > 0) code = 1;
} catch (err) {
  console.error('shot failed:', err.message);
  code = 1;
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  chrome.kill('SIGKILL');
}
process.exit(code);
