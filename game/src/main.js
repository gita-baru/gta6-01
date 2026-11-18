// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, the renderer paints what is there and the HUD reports
// it. Screens: title, play, paused, busted, wasted, and a mission-complete
// card. ?shot=cover|street|mission|title (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import {
  ACTION_CONFIRM, ACTION_PAUSE, ACTION_START_MISSION, createInput,
} from './input.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { MISSIONS } from './missions.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const hud = createHud();
const audio = createAudio();
const input = createInput(canvas);
const world = createWorld(seed, renderer, hud, audio);
world.reset(seed);
void createRandom;

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

function announce(message) {
  status.textContent = message;
}

function renderFrame() {
  const focus = world.focus();
  renderer.updateCamera(focus, world.state.camYaw, world.state.camPitch, world.cameraDistance(), 1 / 60);
  renderer.updateParticles(1 / 60);
  world.syncMeshes(1 / 60);
  const target = world.missionTarget();
  renderer.setBeacon(target ? target.x : 0, target ? target.z : 0, world.mission.active && !!target);
  renderer.render();
}

function runShot(name) {
  const scene = stageShot(name, world);
  if (scene.screen === 'title') {
    hud.showTitle(world.state.save, {
      start: () => {},
      continue: () => {},
      help: () => {},
    });
  }
  // Snap the chase camera to the staged angle before painting: the shot
  // paints only two frames, and the camera's smoothing lerp would
  // otherwise leave it a third of the way from its start position, so the
  // frame would show the wrong angle and distance.
  renderer.updateCamera(world.focus(), world.state.camYaw, world.state.camPitch, world.cameraDistance(), 1);
  hud.update(world);
  hud.drawMinimap(world);
  let painted = 0;
  function paint() {
    renderFrame();
    hud.update(world);
    hud.drawMinimap(world);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = 'title';
  let menuOpen = false;
  let last = performance.now();
  let accumulator = 0;

  hud.showTitle(world.state.save, {
    start: () => startGame(false),
    continue: () => startGame(true),
    help: () => hud.showHelp({ back: () => hud.showTitle(world.state.save, titleCallbacks()) }),
  });

  function titleCallbacks() {
    return {
      start: () => startGame(false),
      continue: () => startGame(true),
      help: () => hud.showHelp({ back: () => hud.showTitle(world.state.save, titleCallbacks()) }),
    };
  }

  function startGame(continued) {
    if (!continued) {
      world.reset(Math.floor(Math.random() * 4294967296));
      world.state.save = null;
      world.state.cash = 0;
    }
    audio.unlock();
    hud.hideMenu();
    menuOpen = false;
    screen = 'play';
    world.state.screen = 'play';
    announce('Playing. Follow the yellow marker. Press T for a job.');
    hud.toast('Welcome to Solmar City. Press T to take a job from Lena.', 5);
  }

  function openMissionComplete(mission) {
    menuOpen = true;
    hud.showMissionComplete(mission, {
      next: () => {
        hud.hideMenu();
        menuOpen = false;
      },
    });
  }

  function endGame(kind) {
    screen = kind;
    world.state.screen = kind;
    const stats = { cash: Math.floor(world.cash), jobs: world.mission.done.length };
    hud.showEnd(kind, stats, {
      retry: () => startGame(false),
      quit: () => {
        screen = 'title';
        world.state.screen = 'title';
        hud.showTitle(world.state.save, titleCallbacks());
      },
    });
    announce(kind === 'busted' ? 'Busted.' : 'Wasted.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_START_MISSION && screen === 'play' && !world.mission.active) {
      const mission = world.startMission();
      if (mission) {
        hud.bannerCall('📱 ' + mission.name, mission.intro, 7);
        audio.unlock();
      }
    }
    if (actions & ACTION_CONFIRM && screen === 'title' && !menuOpen) startGame(false);
    if (actions & ACTION_PAUSE && screen === 'play' && !menuOpen) {
      screen = 'paused';
      menuOpen = true;
      hud.showPause({
        resume: () => {
          hud.hideMenu();
          menuOpen = false;
          screen = 'play';
        },
        restart: () => startGame(false),
        quit: () => {
          hud.hideMenu();
          menuOpen = false;
          screen = 'title';
          world.state.screen = 'title';
          hud.showTitle(world.state.save, titleCallbacks());
        },
      });
    }
    return actions;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (screen === 'play' && !menuOpen) {
      accumulator += dt;
      while (accumulator >= STEP) {
        const event = world.step(STEP, input, actions);
        accumulator -= STEP;
        if (event === 'busted') {
          endGame('busted');
          break;
        }
        if (event === 'wasted') {
          endGame('wasted');
          break;
        }
        if (event === 'mission-done') {
          const doneId = world.mission.done[world.mission.done.length - 1];
          const doneMission = MISSIONS.find((m) => m.id === doneId) || { name: doneId, reward: 0 };
          openMissionComplete(doneMission);
          break;
        }
      }
    } else if (screen === 'title') {
      accumulator += dt;
      while (accumulator >= STEP) {
        world.step(STEP, input, 0);
        accumulator -= STEP;
      }
    }
    hud.tick(dt);
    hud.update(world);
    hud.drawMinimap(world);
    renderFrame();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play' && !menuOpen) {
      screen = 'paused';
      menuOpen = true;
      hud.showPause({
        resume: () => {
          hud.hideMenu();
          menuOpen = false;
          screen = 'play';
        },
        restart: () => startGame(false),
        quit: () => {
          hud.hideMenu();
          menuOpen = false;
          screen = 'title';
          world.state.screen = 'title';
          hud.showTitle(world.state.save, titleCallbacks());
        },
      });
    }
  });

  announce('Solmar Heat. Press Enter or click Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
