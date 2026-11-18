// Solara Bay — keyboard + mouse input, with edge-triggered "pressed" events.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.pointerLocked = false;
    this.canvas = canvas;
    this.onPause = null;
    this.onAnyKey = null;
    this._keydown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (this.onAnyKey) this.onAnyKey(e.code);
      if (e.code === 'Escape' && this.onPause) this.onPause();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    };
    this._keyup = (e) => this.keys.delete(e.code);
    this._mousedown = (e) => {
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
    };
    this._mouseup = (e) => { if (e.button === 0) this.mouseDown = false; };
    this._mousemove = (e) => {
      if (this.pointerLocked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    };
    this._blur = () => { this.keys.clear(); this.mouseDown = false; };
    window.addEventListener('keydown', this._keydown);
    window.addEventListener('keyup', this._keyup);
    canvas.addEventListener('mousedown', this._mousedown);
    window.addEventListener('mouseup', this._mouseup);
    window.addEventListener('mousemove', this._mousemove);
    window.addEventListener('blur', this._blur);
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
  }

  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  // WASD or arrow keys as a -1..1 axis pair.
  moveAxes() {
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, y };
  }
  lockPointer() {
    if (!this.pointerLocked) { try { this.canvas.requestPointerLock(); } catch { /* pointer lock unavailable */ } }
  }
  unlockPointer() { if (document.pointerLockElement) document.exitPointerLock(); }
  consumeMouse() { const dx = this.mouseDX, dy = this.mouseDY; this.mouseDX = 0; this.mouseDY = 0; return { dx, dy }; }
  consumeClick() { const c = this.mouseClicked; this.mouseClicked = false; return c; }
  endFrame() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; this.mouseClicked = false; }
  dispose() {
    window.removeEventListener('keydown', this._keydown);
    window.removeEventListener('keyup', this._keyup);
    this.canvas.removeEventListener('mousedown', this._mousedown);
    window.removeEventListener('mouseup', this._mouseup);
    window.removeEventListener('mousemove', this._mousemove);
    window.removeEventListener('blur', this._blur);
  }
}
