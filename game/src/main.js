// MARAVILLA BAY — boot, UI wiring and the fixed-timestep game loop.
// Reads ?seed= and ?shot= from the URL. In normal play it runs the
// requestAnimationFrame loop with a fixed 1/60 s simulation step. In shot
// mode (?shot=cover|onfoot|driving|mission) it stages one deterministic
// scene, runs a fixed number of steps, renders once and reports ready —
// no animation loop, no wall-clock input, so the frame is reproducible.

import { CFG } from './config.js';
import { makeRng } from './random.js';
import { createWorld } from './world.js';
import { runShot } from './shots.js';

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed')) || CFG.seedDefault;
const shot = params.get('shot');
const rng = makeRng(seed);

const canvas = document.getElementById('game');
const world = createWorld({ canvas, rng, seed, doc: document });
const state = world.state;

function fitCanvas() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  world.resize(w, h);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// --- UI wiring: title, pause, busted, garage, settings ---
const $ = (id) => document.getElementById(id);
function bind(id, fn) {
  const el = $(id);
  if (el) el.addEventListener('click', fn);
}

bind('btn-new', () => { world.audio.unlock(); world.startNewGame(); });
bind('btn-continue', () => { world.audio.unlock(); world.loadGame(); });
bind('btn-resume', () => world.togglePause());
bind('btn-save', () => world.saveGame());
bind('btn-load', () => world.loadGame());
bind('btn-quit', () => {
  world.togglePause();
  state.mode = 'title';
  world.hud.showTitle(world.hasSave());
});
bind('btn-busted-ok', () => {
  world.hud.hideBusted();
  state.mode = 'playing';
});
bind('btn-garage-close', () => {
  world.hud.hideGarage();
  state.mode = 'playing';
});
bind('btn-repair', () => {});
const garageList = $('garage-list');
if (garageList) {
  garageList.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.upgrade) world.buyUpgrade(btn.dataset.upgrade);
    if (btn.dataset.repair) {
      if (state.cash >= 50 && state.inCar) {
        state.cash -= 50;
        state.inCar.health = 100;
        world.hud.setCash(state.cash);
        world.hud.showToast('Car repaired.');
        world.openGarage();
      } else {
        world.hud.showToast(state.inCar ? 'Not enough cash.' : 'No car here to repair.');
      }
    }
    if (btn.dataset.store) {
      if (state.inCar) {
        state.ownedCars.push({ model: state.inCar.modelIndex, color: state.inCar.mesh.userData.paintColor || 0 });
        world.hud.showToast('Car stored in the garage.');
      }
    }
  });
}
// settings
const vol = $('set-volume');
if (vol) vol.addEventListener('input', () => world.audio.setVolume(Number(vol.value)));
const sens = $('set-sens');
if (sens) sens.addEventListener('input', () => { world.settings.mouseSensitivity = Number(sens.value); });
const qual = $('set-quality');
if (qual) qual.addEventListener('change', () => {
  world.settings.graphicsQuality = qual.value;
  world.render.renderer.setPixelRatio(qual.value === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  world.render.renderer.shadowMap.enabled = qual.value !== 'low';
});
document.addEventListener('pointerdown', () => world.audio.unlock(), { once: true });

// --- test + shot hooks ---
window.__maravilla = {
  world,
  state,
  version: 'round13',
  startNewGame: () => world.startNewGame(),
  teleport: (x, z) => world.teleport(x, z),
  setWanted: (n) => world.setWanted(n),
  startMission: (i) => world.startMission(i),
  enterCar: () => world.tryEnterCar(),
  exitCar: () => world.exitCar(),
  saveGame: () => world.saveGame(),
  loadGame: () => world.loadGame(),
  giveCash: (n) => world.giveCash(n),
  giveRespect: (n) => world.giveRespect(n),
  giveWeapon: (w, a) => world.giveWeapon(w, a),
  hurt: (n) => world.hurt(n),
  togglePause: () => world.togglePause(),
  keyDown: (code) => world.input.testDown(code),
  keyUp: (code) => world.input.testUp(code),
  keyHit: (code) => world.input.testHit(code),
  stepN: (n) => { for (let i = 0; i < n; i++) world.update(CFG.step); world.renderFrame(); },
  shotDataUrl: () => canvas.toDataURL('image/jpeg', 0.92),
};

// --- boot ---
if (shot) {
  // deterministic shot mode: stage, step, render once
  state.mode = 'playing';
  const steps = runShot(world, shot);
  world.hud.setHealth(state.health, CFG.player.maxHealth);
  world.hud.setCash(state.cash);
  world.hud.setRespect(state.respect);
  world.hud.setWanted(state.wanted);
  world.__shotSteps = steps;
  window.__shotReady = true;
  window.__shotMode = shot;
} else {
  world.hud.showTitle(world.hasSave());
  let last = 0;
  let acc = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (!last) last = t;
    let dt = (t - last) / 1000;
    last = t;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let n = 0;
    while (acc >= CFG.step && n < 5) {
      world.update(CFG.step);
      acc -= CFG.step;
      n++;
    }
    if (n === 5) acc = 0; // drop backlog rather than spiral
    world.renderFrame();
  }
  requestAnimationFrame(frame);
}
