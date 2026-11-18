// Solmar Heat — boot, game loop, screens, shot mode. Browser only.
import { CFG } from './config.js';
import { createWorld, stepWorld, respawn, playerPos } from './world.js';
import { createRenderer, updateScene } from './render.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { saveGame, loadGame, applySave } from './save.js';
import { startMission, MISSIONS } from './missions.js';
import { stageShot } from './shots.js';

window.__shotErrors = 0;
window.addEventListener('error', () => { window.__shotErrors++; });
window.addEventListener('unhandledrejection', () => { window.__shotErrors++; });

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = parseInt(params.get('seed') || '7', 10);

const world = createWorld(seed);
const saved = loadGame(window.localStorage);
if (saved && !shotName) applySave(world, saved);

const container = document.getElementById('game');
const R = createRenderer(world, container);
const hud = createHud(world);
const audio = createAudio();
const input = createInput(container);

let state = shotName ? 'shot' : 'title';
let last = performance.now();
let titleT = 0;
let savedDone = world.stats.missionsDone;

function showStateScreen() {
  if (state === 'title') hud.showScreen('start');
  else if (state === 'paused') hud.showScreen('pause');
  else if (state === 'busted') hud.showScreen('busted');
  else if (state === 'wasted') hud.showScreen('wasted');
  else hud.hideScreens();
}

document.getElementById('btn-start').addEventListener('click', () => {
  audio.unlock();
  state = 'playing';
  hud.hideScreens();
  hud.showToast(MISSIONS[world.missions.index].name + ' — press T to start the job', 5);
});
document.getElementById('btn-resume').addEventListener('click', () => {
  state = 'playing';
  hud.hideScreens();
});
for (const id of ['btn-respawn-busted', 'btn-respawn-wasted']) {
  document.getElementById(id).addEventListener('click', () => {
    respawn(world);
    R.snapNext = true;
    state = 'playing';
    hud.hideScreens();
  });
}

function startPlaying() {
  audio.unlock();
  state = 'playing';
  hud.hideScreens();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state === 'title') {
    titleT += dt;
    stepWorld(world, {}, dt);
    const a = titleT * 0.045;
    R.camOverride = {
      pos: [Math.sin(a) * 200, 95, Math.cos(a) * 200 + 30],
      look: [0, 12, 0],
    };
    updateScene(R, world, dt, titleT);
    R.renderer.render(R.scene, R.camera);
    hud.update(dt);
    return;
  }

  if (state === 'paused' || state === 'busted' || state === 'wasted') {
    updateScene(R, world, 0, now / 1000);
    R.renderer.render(R.scene, R.camera);
    return;
  }

  // playing
  const mouse = input.takeMouse();
  if (world.player.onFoot) {
    world.camYaw += mouse.dx * 0.0026;
  } else {
    R.orbit += mouse.dx * 0.0026;
  }
  const inp = input.read(world.camYaw, world.player.onFoot);
  inp.shoot = input.takeShoot();
  if (inp.shoot) {
    const fwd = { x: -Math.sin(world.camYaw), z: -Math.cos(world.camYaw) };
    inp.aimHeading = Math.atan2(fwd.x, fwd.z);
  }
  inp.camYaw = world.camYaw;
  stepWorld(world, inp, dt);

  if (inp.mission) {
    const ms = world.missions;
    if (!ms.active && ms.index < MISSIONS.length) {
      const def = startMission(world, ms.index);
      hud.showToast(def.brief, 6);
      audio.unlock();
    } else if (ms.failed) {
      startMission(world, ms.index);
      hud.showToast('Retrying: ' + MISSIONS[ms.index].name, 4);
    }
  }
  if (inp.mute) {
    const muted = audio.toggleMute();
    hud.showToast(muted ? 'Sound muted' : 'Sound on', 2);
  }
  if (inp.radio) {
    const on = audio.toggleRadio();
    hud.showToast(on ? `Radio on — ${audio.stationName()}` : 'Radio off', 3);
  }
  if (inp.pause) {
    state = 'paused';
    saveGame(window.localStorage, world);
    showStateScreen();
  }
  if (world.busted) { state = 'busted'; showStateScreen(); }
  if (world.wasted) { state = 'wasted'; showStateScreen(); }
  if (world.stats.missionsDone > savedDone) {
    savedDone = world.stats.missionsDone;
    saveGame(window.localStorage, world);
    hud.showToast(world.missions.message, 5);
  }

  audio.update(world, dt);
  updateScene(R, world, dt, now / 1000);
  R.renderer.render(R.scene, R.camera);
  hud.update(dt);
}

// --- Shot mode: stage deterministically, snap the camera, signal ready. ---
if (shotName) {
  const staged = stageShot(world, shotName);
  if (staged.fov) {
    R.camera.fov = staged.fov;
    R.camera.updateProjectionMatrix();
  }
  const stepInput = { camYaw: world.camYaw, ...(staged.input || {}) };
  for (let i = 0; i < staged.steps; i++) {
    stepWorld(world, stepInput, 1 / 60);
  }
  updateScene(R, world, 0, 1);
  R.camOverride = staged.cameraFor(world);
  updateScene(R, world, 0, 1);
  R.renderer.render(R.scene, R.camera);
  hud.update(0);
  if (shotName === 'title') hud.showScreen('start');
  else hud.hideScreens();
  // One more render after the HUD settles, then signal ready.
  R.renderer.render(R.scene, R.camera);
  window.__shot = { ready: true, errors: window.__shotErrors, name: shotName };
} else {
  showStateScreen();
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (e) => {
  if ((e.code === 'Enter' || e.code === 'Space') && state === 'title') startPlaying();
  if ((e.code === 'Enter' || e.code === 'Space') && (state === 'busted' || state === 'wasted')) {
    respawn(world);
    R.snapNext = true;
    state = 'playing';
    hud.hideScreens();
  }
});

window.addEventListener('resize', () => {
  R.camera.aspect = container.clientWidth / container.clientHeight;
  R.camera.updateProjectionMatrix();
  R.renderer.setSize(container.clientWidth, container.clientHeight);
});
