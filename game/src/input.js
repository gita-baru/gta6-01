// Keyboard and mouse input. Keys are read as a held set every frame; actions
// (enter car, punch, shoot, pause, confirm, mute) are edge-triggered and
// consumed once through takeActions().
// (v2, 18 Nov 2026) Unchanged: the same keys drive the live-play tests.
export const ACTION_ENTER = 1;
export const ACTION_PUNCH = 2;
export const ACTION_SHOOT = 4;
export const ACTION_PAUSE = 8;
export const ACTION_CONFIRM = 16;
export const ACTION_MUTE = 32;
export const ACTION_START_MISSION = 64;

const KEY_ACTIONS = {
  KeyE: ACTION_ENTER,
  KeyF: ACTION_PUNCH,
  Escape: ACTION_PAUSE,
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM,
  KeyM: ACTION_MUTE,
  KeyT: ACTION_START_MISSION,
};

export function createInput(canvas) {
  const held = new Set();
  let queued = 0;
  let mouseDown = false;
  let mouseDX = 0;
  let mouseDY = 0;
  let pointerLocked = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    held.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) queued |= action;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onMouseMove(event) {
    if (pointerLocked) {
      mouseDX += event.movementX;
      mouseDY += event.movementY;
    }
  }

  function onMouseDown(event) {
    if (event.button === 0) {
      mouseDown = true;
      queued |= ACTION_SHOOT;
    }
  }

  function onMouseUp(event) {
    if (event.button === 0) mouseDown = false;
  }

  function onClick() {
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
  }

  function onLockChange() {
    pointerLocked = document.pointerLockElement === canvas;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('click', onClick);

  return {
    // -1/0/1 drive and steer from WASD or the arrow keys.
    drive() {
      const up = held.has('KeyW') || held.has('ArrowUp');
      const down = held.has('KeyS') || held.has('ArrowDown');
      return (up ? 1 : 0) - (down ? 1 : 0);
    },
    steer() {
      const left = held.has('KeyA') || held.has('ArrowLeft');
      const right = held.has('KeyD') || held.has('ArrowRight');
      return (left ? 1 : 0) - (right ? 1 : 0);
    },
    run() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    handbrake() {
      return held.has('Space');
    },
    mouseDown() {
      return mouseDown;
    },
    takeMouseDelta() {
      const d = { x: mouseDX, y: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return d;
    },
    takeActions() {
      const actions = queued;
      queued = 0;
      return actions;
    },
  };
}
