// Keyboard + mouse input for Solmar Heat. Tracks held keys, edge-triggered
// presses (for E, F, T, M, R, Esc), pointer drag for the camera and clicks
// for shooting. No dependencies.
export function makeInput() {
  const keys = new Set();
  const pressed = new Set(); // keys pressed since the last consume
  const input = {
    keys,
    mouseDown: false,
    mouseX: 0,
    mouseY: 0,
    dragDX: 0,
    dragDY: 0,
    dragging: false,
    attach(element) {
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        keys.add(e.code);
        pressed.add(e.code);
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
          e.preventDefault();
        }
      });
      window.addEventListener('keyup', (e) => keys.delete(e.code));
      window.addEventListener('blur', () => keys.clear());
      element.addEventListener('pointerdown', (e) => {
        input.mouseDown = true;
        input.dragging = true;
        input.mouseX = e.clientX;
        input.mouseY = e.clientY;
      });
      window.addEventListener('pointerup', () => {
        input.mouseDown = false;
        input.dragging = false;
      });
      window.addEventListener('pointermove', (e) => {
        if (!input.dragging) return;
        input.dragDX += e.clientX - input.mouseX;
        input.dragDY += e.clientY - input.mouseY;
        input.mouseX = e.clientX;
        input.mouseY = e.clientY;
      });
    },
    // True once per physical press; call once a frame.
    wasPressed(code) {
      return pressed.has(code);
    },
    endFrame() {
      pressed.clear();
      input.dragDX = 0;
      input.dragDY = 0;
    },
    // WASD / arrows as a -1..1 pair, in screen space (x right, y up).
    movePair() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
      return { x, y };
    },
    get run() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    get handbrake() {
      return keys.has('Space');
    },
  };
  return input;
}
