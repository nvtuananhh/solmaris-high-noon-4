// Keyboard + mouse input for MARAVILLA BAY.
// Tracks held keys, edge-triggered presses, and camera orbit drag.
// Pointer lock is attempted on canvas click but the game never requires it:
// dragging with the mouse held down orbits the camera too, so headless and
// touch-free testing still work.

export function createInput(canvas, settings) {
  const keys = new Set();
  const pressed = new Set(); // edge-triggered: cleared after each sim step
  let orbitDX = 0;
  let orbitDY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function codeOf(e) {
    return e.code;
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(codeOf(e));
    pressed.add(codeOf(e));
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(codeOf(e)));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    if (e.button === 0 && settings.pointerLock) {
      try { canvas.requestPointerLock(); } catch (_err) { /* pointer lock is optional */ }
    }
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
      orbitDX += e.movementX;
      orbitDY += e.movementY;
    } else if (dragging) {
      orbitDX += (e.clientX - lastX);
      orbitDY += (e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
    }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const input = {
    down(code) { return keys.has(code); },
    // True only on the step right after the key went down.
    hit(code) { return pressed.has(code); },
    axis() {
      let x = 0, y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
      return { x, y };
    },
    sprint() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    // Consume accumulated orbit deltas (scaled by sensitivity) for this step.
    takeOrbit() {
      const sens = settings.mouseSensitivity || 1;
      const dx = orbitDX * 0.0035 * sens;
      const dy = orbitDY * 0.0035 * sens;
      orbitDX = 0; orbitDY = 0;
      return { dx, dy };
    },
    // Test hooks: pretend a key is down / was pressed (used by headless tests).
    testDown(code) { keys.add(code); },
    testUp(code) { keys.delete(code); },
    testHit(code) { pressed.add(code); },
    clearPressed() { pressed.clear(); },
  };
  return input;
}
