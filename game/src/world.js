// World state for MARAVILLA BAY: the state machine and the player.
// Owns the player on foot (walk / sprint / jump / crouch), entering and
// stealing cars, the title / playing / paused / busted flow, the day
// clock, the garage and safehouse interactions, and the per-step wiring
// between every system. Everything here runs on the fixed timestep and
// the seeded rng; the wall clock is never read.

import { CFG, GARAGE_POS, SAFEHOUSE_POS, CAR_MODELS, UPGRADES, MISSIONS } from './config.js';
import { buildCity } from './city.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createRender, createCameraRig } from './render.js';
import { makeCar, stepCar, syncCarMesh, setHeadlights } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPedestrians, buildPedMesh } from './pedestrians.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { hasSave, writeSave, readSave } from './save.js';
import { districtAt } from './config.js';
import { range, int, pick } from './random.js';

const THREE = window.THREE;

export function createWorld(opts) {
  const { canvas, rng, seed, doc } = opts;
  const render = createRender(canvas);
  const scene = render.scene;
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 3000);
  scene.add(camera);
  const rig = createCameraRig(camera);

  const settings = {
    volume: 0.7,
    mouseSensitivity: 1,
    graphicsQuality: 'high',
    pointerLock: false,
  };

  const state = {
    mode: 'title',
    seed,
    clock: 0, // sim seconds since boot
    day: 1,
    clockMinutes: 17 * 60 + 20, // golden hour
    cash: 200,
    respect: 0,
    health: CFG.player.maxHealth,
    weapon: 'fists',
    ammo: 0,
    punchCooldown: 0,
    shotCooldown: 0,
    wanted: 0,
    player: { x: -350, z: -330, y: 0, vy: 0, heading: Math.PI, onGround: true },
    inCar: null,
    camYaw: Math.PI,
    camPitch: 0.32,
    missionIndex: 0,
    stepIndex: 0,
    coinsTaken: 0,
    ownedCars: [],
    upgrades: {},
    gunshotAt: null,
    crashAt: null,
    speedPastPoliceAt: -100,
    radioTickAt: 0,
    bustedLost: 0,
  };

  const input = createInput(canvas, settings);
  const audio = createAudio(settings);
  const hud = createHud(doc);
  const minimap = createMinimap(doc.getElementById('minimap'));
  const city = buildCity(scene, rng);
  const traffic = createTraffic(scene, rng, city.blocked);
  const peds = createPedestrians(scene, rng, city.blocked);
  const police = createPolice(scene, rng);

  // --- Mara's figure: a walker in a red jacket, distinct from pedestrians ---
  const playerMesh = buildPedMesh(rng);
  playerMesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  playerMesh.scale.setScalar(1.05);
  scene.add(playerMesh);

  // --- parked cars: mission cars placed by hand, the rest seeded ---
  const parkedCars = [];
  function parkCar(modelIndex, color, x, z, heading) {
    const car = makeCar(rng, modelIndex, color, { x, z, heading, parked: true });
    scene.add(car.mesh);
    syncCarMesh(car);
    parkedCars.push(car);
    return car;
  }
  // Parked cars sit ON avenues (never inside a block) so the player can
  // always reach and drive them. Mission cars match the mission markers.
  parkCar(0, 0x3f6fb5, -360, -330, Math.PI / 2); // mission 1 sedan at the garage
  parkCar(2, 0xe8e4da, -103, -150, 0); // mission 2 steal target
  parkCar(1, 0xc23b2e, 50, -403, Math.PI); // mission 5 getaway car
  parkCar(3, 0x2e6f8e, -403, 250, Math.PI / 2); // mission 7 dock car
  parkCar(4, 0xd8d832, -250, 200, 0); // mission 8 score car
  parkCar(0, 0x8a8f96, 0, 440, Math.PI);
  parkCar(1, 0xe8c832, 103, -50, Math.PI / 2);
  parkCar(3, 0xb5651d, -50, 100, 0);
  parkCar(4, 0x18a058, 300, 300, -Math.PI / 2);
  parkCar(2, 0x4a7a5a, -200, 50, Math.PI);
  parkCar(0, 0xb5b0a6, 200, 200, 0);
  parkCar(1, 0x22242a, -100, -250, Math.PI / 2);
  parkCar(4, 0xd8d832, 0, 120, 0); // cover-shot chase car
  parkCar(1, 0xc23b2e, 0, 458, Math.PI); // driving-shot marina car

  // Tomas waits by the garage doors for mission 1 (static figure).
  const tomas = buildPedMesh(rng);
  tomas.children[0].material = new THREE.MeshLambertMaterial({ color: 0x2e7a5a });
  tomas.position.set(-344, 0, -328);
  tomas.rotation.y = Math.PI;
  scene.add(tomas);

  // The mission-6 witness: a static figure in a yellow jacket who waits
  // where the staging puts them.
  const witnesses = [];
  function spawnWitness(x, z) {
    const w = buildPedMesh(rng);
    w.children[0].material = new THREE.MeshLambertMaterial({ color: 0xe8c832 });
    w.position.set(x, 0, z);
    w.rotation.y = Math.PI * 0.75;
    // crouched, hands up: shrink a little and tilt forward
    w.scale.setScalar(0.92);
    w.rotation.x = 0.25;
    scene.add(w);
    witnesses.push(w);
    return w;
  }

  let missions;
  let combat;
  const notify = (msg) => hud.showToast(msg);
  const addCash = (n) => { state.cash += n; };
  const addRespect = (n) => { state.respect += n; };

  const missionCtx = {
    state,
    blocked: city.blocked,
    police,
    audio,
    notify,
    addCash,
    addRespect,
    playerPos: () => ({ x: state.player.x, z: state.player.z }),
    inCar: () => !!state.inCar,
    combat: null, // wired below, once combat exists
    onShotFired: () => {},
  };
  missions = createMissions(scene, rng, missionCtx);
  combat = createCombat(scene, rng, {
    state,
    playerPos: () => ({ x: state.player.x, z: state.player.z }),
    playerHeading: () => state.player.heading,
    audio,
    notify,
    onAssault: () => police.addWanted(CFG.wanted.assault, state.clock),
    onShotFired: (at) => {
      state.gunshotAt = at;
      police.addWanted(CFG.wanted.shooting, state.clock);
    },
    onFoeDown: () => missions.onFoeDown(),
    damagePlayer: (n) => damagePlayer(n),
  });
  // wire combat into the missions context (created before combat existed)
  missionCtx.combat = combat;

  function damagePlayer(n) {
    state.health -= n;
    if (state.health <= 0) {
      state.health = 0;
      bust('wasted');
    }
  }

  function bust(kind) {
    if (state.mode !== 'playing') return;
    const lost = Math.floor(state.cash * CFG.wanted.bustedCashLoss);
    state.cash -= lost;
    state.bustedLost = lost;
    state.health = CFG.player.maxHealth;
    state.wanted = 0;
    police.clearWanted();
    state.player.x = 150;
    state.player.z = -430;
    state.player.y = 0;
    state.player.vy = 0;
    if (state.inCar) {
      state.inCar = null;
    }
    audio.busted();
    state.mode = 'busted';
    hud.showBusted(lost);
    hud.setHealth(state.health, CFG.player.maxHealth);
    hud.setCash(state.cash);
    hud.setWanted(0);
  }

  function near(x, z, r) {
    return Math.hypot(state.player.x - x, state.player.z - z) < r;
  }

  function tryEnterCar() {
    // nearest parked car, else nearest traffic car
    let best = null, bestD = CFG.car.enterRadius;
    for (const car of parkedCars) {
      const d = Math.hypot(car.pos.x - state.player.x, car.pos.z - state.player.z);
      if (d < bestD) { bestD = d; best = { car, kind: 'parked' }; }
    }
    const npc = traffic.nearest(state.player.x, state.player.z, CFG.car.enterRadius);
    if (npc) {
      const d = Math.hypot(npc.pos.x - state.player.x, npc.pos.z - state.player.z);
      if (d < bestD) { bestD = d; best = { car: npc, kind: 'npc' }; }
    }
    if (!best) return false;
    const { car, kind } = best;
    if (kind === 'npc') {
      // driver flees on foot; stealing in view of police or a crowd is a crime
      const witnessed = police.nearestCarDist(state.player.x, state.player.z) < 45 ||
        peds.nearest(state.player.x, state.player.z, 15);
      if (witnessed) police.addWanted(CFG.wanted.stealNpc, state.clock);
      const idx = traffic.cars.indexOf(car);
      if (idx >= 0) traffic.cars.splice(idx, 1);
      const driver = peds.peds.find((p) => p.state === 'walk');
      if (driver) {
        driver.state = 'scatter';
        driver.scatterAt = 4;
        driver.pos.x = car.pos.x + 2;
        driver.pos.z = car.pos.z + 2;
      }
      notify('Carjacked! The driver fled.');
    } else {
      const idx = parkedCars.indexOf(car);
      if (idx >= 0) parkedCars.splice(idx, 1);
      if (police.nearestCarDist(state.player.x, state.player.z) < 40) {
        police.addWanted(CFG.wanted.stealParked, state.clock);
      }
      missions.onSteal('parked');
      notify(`Took the ${car.model.name}.`);
    }
    if (kind === 'npc') missions.onSteal('npc');
    car.npc = false;
    car.parked = false;
    state.inCar = car;
    state.player.heading = car.heading;
    state.camYaw = car.heading;
    audio.unlock();
    missions.onEnterCar();
    return true;
  }

  function exitCar() {
    const car = state.inCar;
    if (!car) return;
    state.inCar = null;
    state.player.x = car.pos.x + Math.sin(car.heading + Math.PI / 2) * 2.2;
    state.player.z = car.pos.z + Math.cos(car.heading + Math.PI / 2) * 2.2;
    state.player.heading = car.heading;
    state.camYaw = car.heading;
    parkedCars.push(car);
    car.parked = true;
    car.speed = 0;
    syncCarMesh(car);
  }

  function openGarage() {
    const items = UPGRADES.map((u) => {
      const owned = state.upgrades[u.id] > 0;
      return `<div class="garage-item"><b>${u.name}</b> — ${u.desc} — $${u.cost} ` +
        `<button data-upgrade="${u.id}" ${owned ? 'disabled' : ''}>${owned ? 'Owned' : 'Buy'}</button></div>`;
    }).join('');
    const storeBtn = state.inCar
      ? `<div class="garage-item"><b>Store this car</b> — park it here as an owned car. <button data-store="1">Store</button></div>`
      : '';
    hud.showGarage(items + storeBtn +
      `<div class="garage-item"><b>Repair</b> — fix the current car. <button data-repair="1">$50</button></div>`);
    state.mode = 'garage';
  }

  function buyUpgrade(id) {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u || state.cash < u.cost) { notify('Not enough cash.'); return; }
    state.cash -= u.cost;
    state.upgrades[id] = (state.upgrades[id] || 0) + 1;
    if (state.inCar) {
      if (id === 'engine') state.inCar.upgrades.engine += 1;
      if (id === 'brakes') state.inCar.upgrades.brakes += 1;
      if (id === 'nitro') state.inCar.upgrades.nitro += 1;
      if (id === 'armor') state.inCar.upgrades.armor += 1;
    }
    notify(`${u.name} installed.`);
    hud.setCash(state.cash);
    openGarage();
  }

  function startNewGame() {
    state.mode = 'playing';
    state.missionIndex = 0;
    state.stepIndex = 0;
    state.cash = 200;
    state.respect = 0;
    state.health = CFG.player.maxHealth;
    state.weapon = 'fists';
    state.ammo = 0;
    state.player.x = -350;
    state.player.z = -330;
    state.player.heading = Math.PI;
    state.camYaw = Math.PI;
    state.inCar = null;
    police.clearWanted();
    hud.hideTitle();
    hud.hideBusted();
    hud.hidePause();
    missions.startMission(0);
    hud.showMissionCard('Mission 1: Homecoming', MISSIONS[0].briefing);
    audio.unlock();
  }

  function loadGame() {
    const save = readSave();
    if (!save) return false;
    state.mode = 'playing';
    state.missionIndex = save.missionIndex;
    state.stepIndex = save.stepIndex;
    state.cash = save.cash;
    state.respect = save.respect;
    state.health = save.health;
    state.weapon = save.weapon;
    state.ammo = save.ammo;
    state.player.x = save.player.x;
    state.player.z = save.player.z;
    state.player.heading = save.player.heading;
    state.camYaw = save.player.heading;
    state.day = save.day;
    state.clockMinutes = save.clockMinutes;
    state.ownedCars = save.ownedCars || [];
    state.upgrades = save.upgrades || {};
    state.inCar = null;
    police.clearWanted();
    hud.hideTitle();
    hud.hidePause();
    missions.missionIndex = save.missionIndex;
    missions.stepIndex = save.stepIndex;
    const m = missions.current();
    if (m) hud.showMissionCard(`Mission ${m.id}: ${m.name}`, m.briefing);
    notify('Save loaded.');
    return true;
  }

  function saveGame() {
    state.missionIndex = missions.missionIndex;
    state.stepIndex = missions.stepIndex;
    state.coinsTaken = missions.coins.filter((c) => c.taken).length;
    const ok = writeSave(state);
    notify(ok ? 'Game saved.' : 'Save failed.');
    return ok;
  }

  function togglePause() {
    if (state.mode === 'playing') {
      state.mode = 'paused';
      hud.showPause();
    } else if (state.mode === 'paused') {
      state.mode = 'playing';
      hud.hidePause();
    }
  }

  // --- per-step player movement on foot ---
  function stepOnFoot(dt) {
    const ax = input.axis();
    const orbit = input.takeOrbit();
    state.camYaw -= orbit.dx;
    state.camPitch = Math.max(-0.15, Math.min(0.9, state.camPitch + orbit.dy));
    const sprint = input.sprint();
    const crouch = input.down('KeyC');
    const speed = crouch ? CFG.player.crouchSpeed : sprint ? CFG.player.sprintSpeed : CFG.player.walkSpeed;
    let mx = 0, mz = 0;
    if (ax.y !== 0 || ax.x !== 0) {
      // movement relative to camera yaw
      const forward = { x: Math.sin(state.camYaw), z: Math.cos(state.camYaw) };
      const right = { x: Math.cos(state.camYaw), z: -Math.sin(state.camYaw) };
      mx = forward.x * ax.y + right.x * ax.x;
      mz = forward.z * ax.y + right.z * ax.x;
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      state.player.heading = Math.atan2(mx, mz);
      if (Math.abs(speed - CFG.player.walkSpeed) > 0.01 && state.clock - (state.lastStepAt || 0) > 0.35) {
        state.lastStepAt = state.clock;
        audio.footstep();
      }
    }
    const r = CFG.player.radius;
    const nx = state.player.x + mx * speed * dt;
    const nz = state.player.z + mz * speed * dt;
    if (!city.blocked(nx + r, state.player.z) && !city.blocked(nx - r, state.player.z) &&
        !city.blocked(nx, state.player.z + r) && !city.blocked(nx, state.player.z - r)) {
      state.player.x = nx;
      state.player.z = nz;
    } else if (!city.blocked(nx, state.player.z)) {
      state.player.x = nx;
    } else if (!city.blocked(state.player.x, nz)) {
      state.player.z = nz;
    }
    state.player.x = Math.max(-590, Math.min(590, state.player.x));
    state.player.z = Math.max(-590, Math.min(680, state.player.z));
    // jump / gravity
    if (input.hit('Space') && state.player.onGround) {
      state.player.vy = CFG.player.jumpSpeed;
      state.player.onGround = false;
    }
    if (!state.player.onGround) {
      state.player.vy -= CFG.gravity * dt;
      state.player.y += state.player.vy * dt;
      if (state.player.y <= 0) {
        state.player.y = 0;
        state.player.vy = 0;
        state.player.onGround = true;
      }
    }
    // interactions: nearest thing wins — a car at your elbow beats the
    // garage door behind it, so try the car first, then the buildings.
    if (input.hit('KeyE')) {
      if (!tryEnterCar()) {
        if (near(GARAGE_POS.x, GARAGE_POS.z, 14)) { openGarage(); return; }
        if (near(SAFEHOUSE_POS.x, SAFEHOUSE_POS.z, 10)) {
          if (state.wanted > 0 && state.cash >= CFG.wanted.payoffCost) {
            state.cash -= CFG.wanted.payoffCost;
            police.clearWanted();
            notify(`Wanted level paid off — $${CFG.wanted.payoffCost}.`);
          } else if (state.wanted > 0) {
            notify('Payoff costs $250 — not enough cash.');
          } else {
            notify('Safehouse: nobody is looking for you right now.');
          }
          return;
        }
        // taxi hail: wave down a fare if a customer is near
        const ped = peds.nearest(state.player.x, state.player.z, 6);
        if (ped && ped.isTaxi && ped.state === 'walk') {
          ped.state = 'taxi';
          ped.waving = true;
          notify('Taxi customer is waiting — get in a car and stop beside them.');
        }
      }
    }
    if (input.hit('KeyF')) combat.punch();
    if (input.hit('KeyR') || input.hit('Mouse2')) combat.shoot();
    // robbery: hold E near a shop while a robbery is active is handled in missions
    if (input.hit('KeyG')) {
      const d = districtAt(state.player.x, state.player.z);
      if (d.name === 'Mercado Quarter' && !missions.side.robbery) {
        missions.startRobbery(state.player.x, state.player.z);
      }
    }
    // walk animation
    const moving = ax.x !== 0 || ax.y !== 0;
    state.walkPhase = (state.walkPhase || 0) + dt * (moving ? speed * 1.6 : 0);
    const swing = moving ? Math.sin(state.walkPhase) * 0.5 : 0;
    playerMesh.userData.legL.rotation.x = swing;
    playerMesh.userData.legR.rotation.x = -swing;
    playerMesh.userData.armL.rotation.x = -swing * 0.7;
    playerMesh.userData.armR.rotation.x = swing * 0.7;
    playerMesh.position.set(state.player.x, state.player.y, state.player.z);
    playerMesh.rotation.y = state.player.heading;
    playerMesh.visible = true;
  }

  // --- per-step driving ---
  function stepDriving(dt) {
    const car = state.inCar;
    const orbit = input.takeOrbit();
    state.camYaw -= orbit.dx;
    state.camPitch = Math.max(0.05, Math.min(0.9, state.camPitch + orbit.dy));
    const ax = input.axis();
    const drive = {
      throttle: ax.y,
      steer: -ax.x,
      handbrake: input.down('Space'),
      nitro: input.sprint(),
    };
    const ev = stepCar(car, drive, dt, city.blocked);
    if (ev.crashed) {
      audio.crash();
      state.crashAt = { x: car.pos.x, z: car.pos.z };
      peds.step(0, null, null, state.crashAt);
      if (car.health <= 0) {
        notify('Your car is wrecked — get out and find another.');
        exitCar();
        return;
      }
    }
    // engine + radio
    audio.setEngine(Math.abs(car.speed) / car.topSpeed(), true);
    if (state.clock - state.radioTickAt > 0.14) {
      state.radioTickAt = state.clock;
      audio.radioTick();
    }
    if (input.hit('KeyH')) audio.honk();
    if (input.hit('KeyR')) {
      const name = audio.cycleRadio();
      hud.setRadio(audio.radioName());
      notify(`Radio: ${audio.radioName()}`);
    }
    if (input.hit('KeyE')) exitCar();
    // speeding past police is a crime
    if (Math.abs(car.speed) > 26) {
      const d = police.nearestCarDist(car.pos.x, car.pos.z);
      if (d < 26 && state.clock - state.speedPastPoliceAt > 6) {
        state.speedPastPoliceAt = state.clock;
        police.addWanted(CFG.wanted.speedPastPolice, state.clock);
        notify('Speeding past police — wanted level up.');
      }
    }
    state.player.x = car.pos.x;
    state.player.z = car.pos.z;
    state.player.heading = car.heading;
    playerMesh.visible = false;
  }

  function update(dt) {
    // Escape must work even while paused (the early return below would
    // otherwise swallow it, since the loop stops stepping while paused).
    if (state.mode === 'paused' && input.hit('Escape')) {
      togglePause();
      input.clearPressed();
      return;
    }
    if (state.mode === 'garage' && input.hit('Escape')) {
      hud.hideGarage();
      state.mode = 'playing';
      input.clearPressed();
      return;
    }
    if (state.mode === 'title' || state.mode === 'paused' || state.mode === 'busted') {
      input.clearPressed();
      return;
    }
    if (state.mode === 'garage') {
      input.clearPressed();
      return;
    }
    state.clock += dt;
    // day clock: 1 game hour per 90 sim seconds
    state.clockMinutes += dt * (60 / 90);
    if (state.clockMinutes >= 24 * 60) {
      state.clockMinutes -= 24 * 60;
      state.day += 1;
    }
    const hour = Math.floor(state.clockMinutes / 60);
    const minute = Math.floor(state.clockMinutes % 60);
    const tod = Math.max(0, Math.min(1, (hour + minute / 60 - 16) / 6));
    render.setTimeOfDay(tod, city.streetlights);
    render.stepClouds(state.clock);

    // pause
    if (input.hit('Escape')) { togglePause(); input.clearPressed(); return; }

    if (state.inCar) stepDriving(dt);
    else stepOnFoot(dt);

    // world systems
    const playerCar = state.inCar;
    traffic.step(dt, playerCar, state.inCar ? null : { x: state.player.x, z: state.player.z });
    peds.step(dt, { x: state.player.x, z: state.player.z }, state.gunshotAt, state.crashAt);
    state.gunshotAt = null;
    state.crashAt = null;
    police.step(dt, state.clock, { x: state.player.x, z: state.player.z }, !!state.inCar,
      state.inCar ? Math.abs(state.inCar.speed) : 0, state.player.heading, city.blocked);
    state.wanted = police.state.wanted;
    if (police.isBusted()) { bust('arrested'); input.clearPressed(); return; }
    combat.step(dt);
    missions.step(dt);
    audio.setSiren(state.wanted >= 2);

    // headlights at dusk
    const dusk = tod > 0.72;
    for (const car of [...parkedCars, ...traffic.cars, ...police.cars]) setHeadlights(car, dusk);
    if (state.inCar) setHeadlights(state.inCar, dusk);

    // HUD
    hud.setHealth(state.health, CFG.player.maxHealth);
    hud.setCash(state.cash);
    hud.setRespect(state.respect);
    hud.setWanted(state.wanted);
    hud.setClock(state.day, hour, minute);
    hud.setDistrict(districtAt(state.player.x, state.player.z).name);
    hud.setObjective(missions.objectiveText());
    hud.setSpeed(state.inCar ? Math.abs(state.inCar.speed) * 3.6 : 0, !!state.inCar);
    hud.setAmmo(state.weapon, state.ammo);
    hud.setCrosshair(state.weapon === 'pistol' || state.weapon === 'smg');
    hud.setRadio(audio.radioName());
    hud.tick(dt);
    let hint = '';
    if (!state.inCar) {
      if (near(GARAGE_POS.x, GARAGE_POS.z, 14)) hint = 'E — Garage (repairs & upgrades)';
      else if (near(SAFEHOUSE_POS.x, SAFEHOUSE_POS.z, 10)) hint = 'E — Safehouse (pay off wanted: $250)';
      else hint = 'E — enter car   F — punch   R — fire   G — rob store (Mercado)';
    } else {
      hint = 'E — exit car   Space — handbrake   Shift — nitro   R — radio   H — honk';
    }
    hud.setHint(hint);

    // minimap
    minimap.draw({
      player: { x: state.player.x, z: state.player.z },
      playerHeading: state.player.heading,
      policeCars: police.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      heliActive: police.heli.active,
      heliX: police.heli.pos.x,
      heliZ: police.heli.pos.z,
      traffic: traffic.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      marker: missions.markerPos(),
    });

    // camera
    const target = state.inCar
      ? { x: state.inCar.pos.x, y: 1, z: state.inCar.pos.z }
      : { x: state.player.x, y: state.player.y, z: state.player.z };
    const yaw = state.inCar ? state.camYaw : state.camYaw;
    rig.update(target, yaw, state.camPitch, state.inCar ? 11 : 8, dt, false);
    input.clearPressed();
  }

  function renderFrame() {
    render.renderer.render(scene, camera);
  }

  function resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render.resize(w, h);
  }

  // --- deterministic shot staging is in shots.js; world exposes staging hooks ---
  const api = {
    state,
    settings,
    scene,
    camera,
    render,
    rig,
    city,
    traffic,
    peds,
    police,
    missions,
    combat,
    parkedCars,
    hud,
    audio,
    input,
    update,
    renderFrame,
    resize,
    startNewGame,
    loadGame,
    saveGame,
    togglePause,
    bust,
    tryEnterCar,
    // Enter the nearest parked car to a point (shot staging helper).
    tryEnterCarAt(x, z) {
      let best = null, bestD = 9;
      for (const car of parkedCars) {
        const d = Math.hypot(car.pos.x - x, car.pos.z - z);
        if (d < bestD) { bestD = d; best = car; }
      }
      if (!best) return false;
      state.player.x = best.pos.x + 2;
      state.player.z = best.pos.z;
      return tryEnterCar();
    },
    exitCar,
    buyUpgrade,
    openGarage,
    hasSave: () => hasSave(),
    // test / shot hooks
    teleport(x, z) {
      state.player.x = x; state.player.z = z;
      state.player.y = 0; state.player.vy = 0;
      if (state.inCar) { state.inCar.pos.x = x; state.inCar.pos.z = z; syncCarMesh(state.inCar); }
    },
    setWanted(n) { police.setWanted(n, state.clock); },
    startMission(i) { missions.startMission(i); },
    giveCash(n) { state.cash += n; },
    giveRespect(n) { state.respect += n; },
    giveWeapon(w, ammo) { state.weapon = w; state.ammo = ammo; },
    hurt(n) { damagePlayer(n); },
    spawnWitness,
    // Shot staging: move the first few walking pedestrians to fixed spots
    // so a frame can guarantee a crowd (deterministic: array order).
    gatherPeds(spots) {
      const walking = peds.peds.filter((p) => p.state === 'walk');
      for (let i = 0; i < Math.min(spots.length, walking.length); i++) {
        walking[i].pos.x = spots[i][0];
        walking[i].pos.z = spots[i][1];
        walking[i].heading = Math.PI * (0.2 + i * 0.35);
      }
    },
    snapCamera() {
      const target = state.inCar
        ? { x: state.inCar.pos.x, y: 1, z: state.inCar.pos.z }
        : { x: state.player.x, y: state.player.y, z: state.player.z };
      rig.snapTo(target, state.camYaw, state.camPitch, state.inCar ? 11 : 8);
    },
  };
  return api;
}
