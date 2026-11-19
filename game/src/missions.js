// Missions and side jobs for MARAVILLA BAY.
// The mission engine walks the 8-mission chain from config.js one step at
// a time. Each step kind has a clear completion test (reach a marker, get
// in a car, steal a parked car, hold hidden, lose the wanted level, defeat
// a set number of foes). Side jobs — taxi fares, street races, store
// robberies, bay coins, car deliveries — run alongside and pay cash and
// respect. The engine only reads the world; world.js owns the player.

import { MISSIONS, SIDE_JOBS, CFG } from './config.js';
import { range, pick, shuffle } from './random.js';

const THREE = window.THREE;

function makeBeacon(color) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.22, 8, 24),
    new THREE.MeshBasicMaterial({ color })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.4, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
  );
  pillar.position.y = 13;
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color })
  );
  diamond.position.y = 7;
  g.add(ring, pillar, diamond);
  g.userData.diamond = diamond;
  g.userData.ring = ring;
  return g;
}

export function createMissions(scene, rng, ctx) {
  // ctx: { state, police, combat, peds, notify(msg), addCash(n), addRespect(n) }
  const state = ctx.state;
  const beacon = makeBeacon(0xffd23e);
  beacon.visible = false;
  scene.add(beacon);

  // bay coins: 25 fixed spots from the seeded rng
  const coins = [];
  const coinGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.18, 14);
  coinGeo.rotateX(Math.PI / 2);
  const coinMat = new THREE.MeshBasicMaterial({ color: 0xffd23e });
  for (let i = 0; i < CFG.coinCount; i++) {
    let x = 0, z = 0, tries = 0;
    do {
      x = range(rng, -520, 520);
      z = range(rng, -520, 480);
      tries++;
    } while (ctx.blocked(x, z) && tries < 40);
    if (ctx.blocked(x, z)) continue;
    const m = new THREE.Mesh(coinGeo, coinMat);
    m.position.set(x, 1.4, z);
    scene.add(m);
    coins.push({ mesh: m, x, z, taken: false, spin: range(rng, 0, 6) });
  }

  // race checkpoints: three rings on the avenues
  const races = [
    { name: 'Marina Loop', points: [[0, 460], [300, 460], [300, 100], [0, 100]] },
    { name: 'Casino Sprint', points: [[50, -350], [450, -350], [450, -50], [50, -50]] },
    { name: 'Dock Dash', points: [[-420, 250], [-420, 460], [-150, 460], [-150, 250]] },
  ];
  const raceMarkers = [];
  for (const r of races) {
    for (const [x, z] of r.points) {
      const m = makeBeacon(0x3ec8ff);
      m.position.set(x, 0, z);
      m.visible = false;
      scene.add(m);
      raceMarkers.push(m);
    }
  }

  const side = {
    taxi: null, // { ped, destX, destZ, marker }
    race: null, // { def, idx, marker }
    robbery: null, // { x, z, timer }
    delivery: null,
  };
  const taxiMarker = makeBeacon(0x3eff7a);
  taxiMarker.visible = false;
  scene.add(taxiMarker);

  const engine = {
    missionIndex: 0, // 0-based into MISSIONS
    stepIndex: 0,
    holdTimer: 0,
    foesLeft: 0,
    done: false,
    coins,
    side,
    current() {
      if (this.missionIndex >= MISSIONS.length) return null;
      return MISSIONS[this.missionIndex];
    },
    currentStep() {
      const m = this.current();
      if (!m) return null;
      return m.steps[this.stepIndex] ?? null;
    },
    objectiveText() {
      const step = this.currentStep();
      if (!step) {
        if (this.missionIndex >= MISSIONS.length) return 'All missions complete — Maravilla Bay is yours.';
        return '';
      }
      const m = this.current();
      return `Mission ${m.id}: ${m.name} — ${step.label}`;
    },
    markerPos() {
      const step = this.currentStep();
      if (step && (step.kind === 'goto' || step.kind === 'drive-to' || step.kind === 'enter-car' ||
          step.kind === 'steal-parked' || step.kind === 'wait-hidden' || step.kind === 'combat')) {
        return { x: step.x, z: step.z, r: step.r };
      }
      if (side.taxi) return { x: side.taxi.destX, z: side.taxi.destZ, r: 8 };
      if (side.race) {
        const p = side.race.def.points[side.race.idx];
        return { x: p[0], z: p[1], r: 9 };
      }
      return null;
    },
    startMission(i) {
      this.missionIndex = i;
      this.stepIndex = 0;
      this.holdTimer = 0;
      const m = this.current();
      if (m) {
        ctx.notify(`Mission ${m.id}: ${m.name} — ${m.briefing}`);
        const step = this.currentStep();
        if (step && step.wanted) ctx.police.setWanted(step.wanted, ctx.state.clock);
      }
    },
    // called when the player steals a parked car / an NPC car
    onSteal(kind) {
      const step = this.currentStep();
      if (step && step.kind === 'steal-parked' && kind === 'parked') this.advance();
      if (step && step.kind === 'steal-parked' && kind === 'npc') this.advance();
    },
    onEnterCar() {
      const step = this.currentStep();
      if (step && step.kind === 'enter-car') this.advance();
    },
    onFoeDown() {
      const step = this.currentStep();
      if (step && step.kind === 'combat') {
        this.foesLeft -= 1;
        if (this.foesLeft <= 0) this.advance();
      }
    },
    advance() {
      const m = this.current();
      if (!m) return;
      this.stepIndex += 1;
      this.holdTimer = 0;
      if (this.stepIndex >= m.steps.length) {
        ctx.addCash(m.payout);
        ctx.addRespect(m.respect);
        ctx.notify(`Mission complete: ${m.name} — $${m.payout} and +${m.respect} respect.`);
        ctx.audio.missionDone();
        this.missionIndex += 1;
        this.stepIndex = 0;
        const next = this.current();
        if (next) {
          if (next.needsRespect && state.respect < next.needsRespect) {
            ctx.notify(`The Last Causeway needs ${next.needsRespect} respect — do side jobs first.`);
          } else {
            ctx.notify(`Mission ${next.id}: ${next.name} — ${next.briefing}`);
          }
        } else {
          this.done = true;
          ctx.notify('All 8 missions complete. Maravilla Bay is yours, Mara.');
        }
      } else {
        const step = this.currentStep();
        if (step && step.wanted) ctx.police.setWanted(step.wanted, ctx.state.clock);
        if (step && step.kind === 'combat') {
          this.foesLeft = step.foes;
          ctx.combat.spawnFoes(step.x, step.z, step.foes);
        }
      }
    },
    step(dt) {
      const step = this.currentStep();
      const m = this.current();
      const p = ctx.playerPos();
      const inCar = ctx.inCar();
      // beacon follows the current objective
      const mark = this.markerPos();
      if (mark) {
        beacon.visible = true;
        beacon.position.set(mark.x, 0, mark.z);
        beacon.userData.diamond.rotation.y += dt * 2;
        beacon.userData.diamond.position.y = 7 + Math.sin(ctx.state.clock * 2) * 0.5;
        beacon.userData.ring.scale.setScalar(1 + Math.sin(ctx.state.clock * 3) * 0.08);
      } else {
        beacon.visible = false;
      }
      if (!step || !m) return;
      // respect gate on the finale: hold the mission until respect is enough
      if (m.needsRespect && state.respect < m.needsRespect && this.stepIndex === 0) return;
      const d = Math.hypot(p.x - step.x, p.z - step.z);
      switch (step.kind) {
        case 'goto':
          if (d < step.r) this.advance();
          break;
        case 'drive-to':
          if (inCar && d < step.r) this.advance();
          break;
        case 'steal-parked':
          break; // completed by onSteal
        case 'enter-car':
          break; // completed by onEnterCar
        case 'wait-hidden': {
          const hidden = ctx.police.nearestCarDist(p.x, p.z) > 35 && ctx.state.wanted === 0;
          if (hidden && d < step.r) {
            this.holdTimer += dt;
            if (this.holdTimer >= (step.hold || 8)) this.advance();
          } else {
            this.holdTimer = 0;
          }
          break;
        }
        case 'lose-wanted':
          if (ctx.state.wanted === 0) this.advance();
          break;
        case 'combat':
          break; // completed by onFoeDown
        default:
          break;
      }
      // --- side jobs tick ---
      this.tickSide(dt, p, inCar);
      // --- coins ---
      for (const c of coins) {
        if (c.taken) continue;
        c.spin += dt;
        c.mesh.rotation.y = c.spin;
        c.mesh.position.y = 1.4 + Math.sin(c.spin * 2) * 0.15;
        if (Math.hypot(p.x - c.x, p.z - c.z) < 2.2) {
          c.taken = true;
          c.mesh.visible = false;
          ctx.addCash(SIDE_JOBS.coinValue);
          ctx.addRespect(1);
          ctx.audio.coin();
          ctx.notify(`Bay coin found — $${SIDE_JOBS.coinValue}.`);
        }
      }
    },
    tickSide(dt, p, inCar) {
      // taxi: destination marker while a fare rides
      if (side.taxi) {
        taxiMarker.visible = true;
        taxiMarker.position.set(side.taxi.destX, 0, side.taxi.destZ);
        const d = Math.hypot(p.x - side.taxi.destX, p.z - side.taxi.destZ);
        if (inCar && d < 9) {
          ctx.addCash(SIDE_JOBS.taxiFare);
          ctx.addRespect(2);
          ctx.notify(`Fare delivered — $${SIDE_JOBS.taxiFare}.`);
          ctx.audio.pickup();
          side.taxi.ped.state = 'walk';
          side.taxi.ped.waving = false;
          side.taxi = null;
          taxiMarker.visible = false;
        }
      } else {
        taxiMarker.visible = false;
      }
      // race: checkpoint rings in order
      if (side.race) {
        const def = side.race.def;
        const pt = def.points[side.race.idx];
        const d = Math.hypot(p.x - pt[0], p.z - pt[1]);
        if (inCar && d < 9) {
          side.race.idx += 1;
          if (side.race.idx >= def.points.length) {
            ctx.addCash(SIDE_JOBS.racePayout);
            ctx.addRespect(4);
            ctx.notify(`${def.name} won — $${SIDE_JOBS.racePayout}.`);
            ctx.audio.missionDone();
            side.race = null;
          } else {
            ctx.notify(`Checkpoint ${side.race.idx + 1}/${def.points.length}`);
          }
        }
      }
      // robbery timer
      if (side.robbery) {
        side.robbery.timer -= dt;
        if (side.robbery.timer <= 0) {
          ctx.addCash(SIDE_JOBS.robberyTake);
          ctx.police.addWanted(2, ctx.state.clock);
          ctx.notify(`Store robbed — $${SIDE_JOBS.robberyTake}. Lose the heat!`);
          side.robbery = null;
        }
      }
    },
    startTaxi(ped) {
      if (side.taxi) return false;
      const dest = pick(rng, [[0, 460], [50, -350], [-350, -350], [450, -250], [150, -450]]);
      side.taxi = { ped, destX: dest[0], destZ: dest[1] };
      ped.state = 'riding';
      ped.waving = false;
      ped.mesh.visible = false;
      ctx.notify('Fare picked up — drive to the marker.');
      return true;
    },
    startRace(i) {
      if (side.race) return false;
      side.race = { def: races[i % races.length], idx: 0 };
      ctx.notify(`${side.race.def.name} — hit the blue checkpoints in order.`);
      return true;
    },
    startRobbery(x, z) {
      if (side.robbery) return false;
      side.robbery = { x, z, timer: 5 };
      ctx.notify('Robbery in progress — hold on 5 seconds…');
      return true;
    },
    raceMarkerVisible() {
      return side.race !== null;
    },
  };
  return engine;
}
