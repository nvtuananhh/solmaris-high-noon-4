// Pedestrians for MARAVILLA BAY.
// ~40 walkers stroll the sidewalks, cross at crossings, and scatter when
// they hear gunfire or a crash nearby. A few of them are taxi customers:
// they wave at the kerb, and if you stop beside them they climb in and
// pay you to drive them to a marker.

import { CFG } from './config.js';
import { range, int, pick } from './random.js';

const THREE = window.THREE;

const SHIRT_COLORS = [0xc23b2e, 0x3f6fb5, 0xe8c832, 0x2e7a5a, 0x8e6a8e, 0xe8e4da, 0x22242a, 0xd86a2e];
const SKIN_COLORS = [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0];

export function buildPedMesh(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, SHIRT_COLORS) });
  const skin = new THREE.MeshLambertMaterial({ color: pick(rng, SKIN_COLORS) });
  const legs = new THREE.MeshLambertMaterial({ color: pick(rng, [0x2a2d33, 0x4a5a6d, 0x6d5a3a]) });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32), shirt);
  body.position.y = 1.05;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), legs);
  legL.position.set(-0.14, 0.31, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), shirt);
  armL.position.set(-0.36, 1.05, 0);
  const armR = armL.clone();
  armR.position.x = 0.36;
  g.add(body, head, legL, legR, armL, armR);
  g.userData.legL = legL; g.userData.legR = legR;
  g.userData.armL = armL; g.userData.armR = armR;
  return g;
}

export function createPedestrians(scene, rng, blocked) {
  const peds = [];
  for (let i = 0; i < CFG.pedCount; i++) {
    const mesh = buildPedMesh(rng);
    const ped = {
      mesh,
      pos: { x: range(rng, -520, 520), z: range(rng, -520, 480) },
      heading: range(rng, 0, Math.PI * 2),
      speed: range(rng, 1.2, 2.4),
      walkPhase: range(rng, 0, Math.PI * 2),
      state: 'walk', // walk | scatter | taxi | riding
      scatterAt: 0,
      targetX: 0, targetZ: 0,
      isTaxi: i < 6, // the first six spawned are taxi customers
      waving: false,
    };
    // keep them on sidewalks: nudge onto the nearest sidewalk line
    const snap = (v) => {
      const base = Math.round(v / 100) * 100;
      return base + (rng() < 0.5 ? 9.5 : -9.5);
    };
    if (rng() < 0.5) ped.pos.x = snap(ped.pos.x); else ped.pos.z = snap(ped.pos.z);
    if (blocked(ped.pos.x, ped.pos.z)) { ped.pos.x = 0; ped.pos.z = 0; }
    scene.add(mesh);
    peds.push(ped);
  }

  function syncPed(ped, dt) {
    ped.mesh.position.set(ped.pos.x, 0, ped.pos.z);
    ped.mesh.rotation.y = ped.heading;
    ped.walkPhase += dt * ped.speed * 4;
    const swing = Math.sin(ped.walkPhase) * 0.45;
    ped.mesh.userData.legL.rotation.x = swing;
    ped.mesh.userData.legR.rotation.x = -swing;
    if (ped.waving) {
      ped.mesh.userData.armR.rotation.z = 2.4 + Math.sin(ped.walkPhase * 2) * 0.3;
    } else {
      ped.mesh.userData.armL.rotation.x = -swing * 0.7;
      ped.mesh.userData.armR.rotation.x = swing * 0.7;
      ped.mesh.userData.armR.rotation.z = 0;
    }
  }

  return {
    peds,
    step(dt, playerPos, gunshotAt, crashAt) {
      for (const ped of peds) {
        if (ped.state === 'riding') continue;
        // scatter from gunfire / crashes
        let scare = null;
        if (gunshotAt) {
          const d = Math.hypot(ped.pos.x - gunshotAt.x, ped.pos.z - gunshotAt.z);
          if (d < 30) scare = gunshotAt;
        }
        if (!scare && crashAt) {
          const d = Math.hypot(ped.pos.x - crashAt.x, ped.pos.z - crashAt.z);
          if (d < 14) scare = crashAt;
        }
        if (scare) {
          ped.state = 'scatter';
          ped.scatterAt = 2.5;
          const away = Math.atan2(ped.pos.x - scare.x, ped.pos.z - scare.z);
          ped.heading = away;
        }
        if (ped.state === 'scatter') {
          ped.scatterAt -= dt;
          ped.speed = 5.5;
          if (ped.scatterAt <= 0) { ped.state = 'walk'; ped.speed = range(rng, 1.2, 2.4); }
        } else if (ped.state === 'taxi') {
          ped.waving = true;
          ped.speed = 0;
        } else {
          // stroll: walk straight, turn at intersections, avoid buildings
          ped.walkPhase += 0;
          const nx = ped.pos.x + Math.sin(ped.heading) * ped.speed * dt;
          const nz = ped.pos.z + Math.cos(ped.heading) * ped.speed * dt;
          if (blocked(nx, nz) || Math.abs(nx) > 560 || nz > 500 || nz < -560) {
            ped.heading += (rng() < 0.5 ? 1 : -1) * (Math.PI / 2);
          } else {
            ped.pos.x = nx; ped.pos.z = nz;
          }
          if (rng() < 0.002) ped.heading += range(rng, -0.9, 0.9);
        }
        // walking on the sidewalk band: drift back if they wandered
        syncPed(ped, dt);
      }
    },
    // Mark the nearest idle pedestrian as a taxi customer waving for a cab.
    hailTaxiNear(x, z) {
      let best = null, bestD = 60;
      for (const ped of peds) {
        if (ped.state !== 'walk') continue;
        const d = Math.hypot(ped.pos.x - x, ped.pos.z - z);
        if (d < bestD) { bestD = d; best = ped; }
      }
      if (best) { best.state = 'taxi'; best.waving = true; }
      return best;
    },
    nearest(x, z, maxDist) {
      let best = null, bestD = maxDist;
      for (const ped of peds) {
        if (ped.state === 'riding') continue;
        const d = Math.hypot(ped.pos.x - x, ped.pos.z - z);
        if (d < bestD) { bestD = d; best = ped; }
      }
      return best;
    },
  };
}
