// Solmar Heat — keyboard and mouse state, with edge-triggered presses.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.clicks = 0;
    window.addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.clicks++;
    });
    window.addEventListener("blur", () => this.keys.clear());
  }

  down(code) {
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  consumeClick() {
    const n = this.clicks;
    this.clicks = 0;
    return n;
  }

  endFrame() {
    this.pressed.clear();
  }

  // Driving / walking intent from WASD + arrows.
  driveIntent() {
    return {
      up: this.down("KeyW") || this.down("ArrowUp"),
      down: this.down("KeyS") || this.down("ArrowDown"),
      left: this.down("KeyA") || this.down("ArrowLeft"),
      right: this.down("KeyD") || this.down("ArrowRight"),
      handbrake: this.down("Space"),
      run: this.down("ShiftLeft") || this.down("ShiftRight"),
    };
  }
}
