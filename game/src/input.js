// Keyboard and mouse. Reads into a plain input object the simulation eats.
// Browser only.
export function createInput(canvasContainer) {
  const keys = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let shootQueued = false;
  let locked = false;

  const onKeyDown = (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const onMouseMove = (e) => {
    if (!locked) return;
    mouseDX += e.movementX || 0;
    mouseDY += e.movementY || 0;
  };
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    if (!locked) {
      canvasContainer.requestPointerLock?.();
      return;
    }
    shootQueued = true;
  };
  const onLockChange = () => {
    locked = document.pointerLockElement === canvasContainer || document.pointerLockElement === canvasContainer.firstChild;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  document.addEventListener('pointerlockchange', onLockChange);

  const edge = (code) => {
    if (keys.has(code)) { keys.delete(code); return true; }
    return false;
  };

  return {
    // Consume the accumulated mouse delta for this frame.
    takeMouse() {
      const dx = mouseDX, dy = mouseDY;
      mouseDX = 0; mouseDY = 0;
      return { dx, dy };
    },
    takeShoot() {
      const s = shootQueued;
      shootQueued = false;
      return s;
    },
    // Build the per-frame input for the simulation. camYaw is the current
    // camera yaw, used to make WASD camera-relative on foot.
    read(camYaw, onFoot) {
      const up = keys.has('KeyW') || keys.has('ArrowUp');
      const down = keys.has('KeyS') || keys.has('ArrowDown');
      const left = keys.has('KeyA') || keys.has('ArrowLeft');
      const right = keys.has('KeyD') || keys.has('ArrowRight');
      const fwd = { x: -Math.sin(camYaw), z: -Math.cos(camYaw) };
      const rgt = { x: -fwd.z, z: fwd.x };
      let mx = 0, mz = 0;
      if (up) { mx += fwd.x; mz += fwd.z; }
      if (down) { mx -= fwd.x; mz -= fwd.z; }
      if (right) { mx += rgt.x; mz += rgt.z; }
      if (left) { mx -= rgt.x; mz -= rgt.z; }
      return {
        mx, mz,
        run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        throttle: onFoot ? 0 : (up ? 1 : down ? -1 : 0),
        steer: (left ? -1 : 0) + (right ? 1 : 0),
        handbrake: keys.has('Space'),
        enter: edge('KeyE'),
        punch: edge('KeyF'),
        mission: edge('KeyT'),
        mute: edge('KeyM'),
        radio: edge('KeyR'),
        pause: edge('Escape'),
        shoot: false, // filled in by main.js from takeShoot()
      };
    },
  };
}
