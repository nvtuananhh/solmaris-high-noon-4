// Police for MARAVILLA BAY: the wanted system and everyone who enforces it.
// - Police cars spawn at the edge of view and chase the player, ramming and
//   trying PIT manoeuvres; they despawn when the wanted level clears.
// - Foot police pursue on foot and try to arrest the player (stand still
//   near one for two seconds while wanted and you are busted).
// - At 4–5 stars a helicopter with a searchlight tracks the player from
//   above; at 3+ stars roadblocks of parked police cars sit across the
//   avenues ahead of the player.
// - Wanted decays while the player stays hidden (no police close and no
//   recent crime); the safehouse pays it off for cash.

import { CFG, POLICE_STATION_POS } from './config.js';
import { makeCar, syncCarMesh } from './vehicles.js';
import { buildPedMesh } from './pedestrians.js';
import { range, pick } from './random.js';

const THREE = window.THREE;

function buildHeliMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1d2733 });
  const accent = new THREE.MeshLambertMaterial({ color: 0xd8d832 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 4.6), bodyMat);
  body.castShadow = true;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.2), bodyMat);
  tail.position.set(0, 0.3, -4);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.35, 4.7), accent);
  stripe.position.y = 0.2;
  const rotorGeo = new THREE.BoxGeometry(9, 0.12, 0.5);
  const rotor = new THREE.Mesh(rotorGeo, new THREE.MeshLambertMaterial({ color: 0x22242a }));
  rotor.position.y = 1.1;
  const rotor2 = rotor.clone();
  rotor2.rotation.y = Math.PI / 2;
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 3.4), accent);
  skidL.position.set(-0.9, -1, 0);
  const skidR = skidL.clone();
  skidR.position.x = 0.9;
  // searchlight: a cone of light pointing down (tip just reaches the street)
  const coneGeo = new THREE.ConeGeometry(4.5, 20, 16, 1, true);
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
  }));
  cone.position.y = -10.5;
  cone.rotation.x = Math.PI;
  const spot = new THREE.SpotLight(0xfff2b0, 1.2, 60, 0.32, 0.5, 1);
  spot.position.set(0, -0.8, 0);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, -30, 0);
  g.add(spot, spotTarget);
  spot.target = spotTarget;
  g.add(body, tail, stripe, rotor, rotor2, skidL, skidR, cone);
  g.userData.rotor = rotor;
  g.userData.rotor2 = rotor2;
  g.userData.cone = cone;
  return g;
}

export function createPolice(scene, rng) {
  const cars = [];
  const foot = [];
  const heli = { mesh: buildHeliMesh(), active: false, angle: 0, pos: { x: 0, z: 0 } };
  heli.mesh.visible = false;
  scene.add(heli.mesh);
  const roadblocks = [];
  const state = {
    wanted: 0,
    hiddenTimer: 0,
    arrestTimer: 0,
    lastCrimeAt: -100,
    clock: 0,
  };

  function spawnCarNear(x, z) {
    const car = makeCar(rng, 1, 0x1d2733, { npc: true });
    // police livery: white doors via a second thin box
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.4, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xe8e4da })
    );
    door.position.y = 0.85;
    car.mesh.add(door);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2244ff })
    );
    bar.position.set(0, 1.85, -0.2);
    car.mesh.add(bar);
    car.mesh.userData.lightBar = bar;
    const ang = range(rng, 0, Math.PI * 2);
    const dist = range(rng, 55, 85);
    car.pos.x = x + Math.sin(ang) * dist;
    car.pos.z = z + Math.cos(ang) * dist;
    car.speed = 0;
    car.heading = Math.atan2(x - car.pos.x, z - car.pos.z);
    car.chase = true;
    scene.add(car.mesh);
    syncCarMesh(car);
    cars.push(car);
    return car;
  }

  function spawnFootNear(x, z) {
    const mesh = buildPedMesh(rng);
    // dark uniform
    mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0x1d2733 });
    const cop = {
      mesh,
      pos: { x: x + range(rng, -25, 25), z: z + range(rng, -25, 25) },
      heading: 0,
      speed: 5.2,
      walkPhase: 0,
    };
    scene.add(mesh);
    foot.push(cop);
    return cop;
  }

  function placeRoadblocks(px, pz, heading) {
    clearRoadblocks();
    // two blocks ahead of the player's heading, across the avenue
    for (let i = 0; i < 2; i++) {
      const ahead = 55 + i * 60;
      const bx = px + Math.sin(heading) * ahead;
      const bz = pz + Math.cos(heading) * ahead;
      for (let k = -1; k <= 1; k++) {
        const car = makeCar(rng, 1, 0x1d2733, { npc: true, parked: true });
        const off = k * 4.5;
        car.pos.x = bx + Math.cos(heading) * off;
        car.pos.z = bz - Math.sin(heading) * off;
        car.heading = heading + Math.PI / 2;
        car.speed = 0;
        scene.add(car.mesh);
        syncCarMesh(car);
        roadblocks.push(car);
      }
    }
  }

  function clearRoadblocks() {
    for (const c of roadblocks) scene.remove(c.mesh);
    roadblocks.length = 0;
  }

  return {
    state,
    cars,
    foot,
    heli,
    roadblocks,
    addWanted(n, clock) {
      state.wanted = Math.max(0, Math.min(5, state.wanted + n));
      state.lastCrimeAt = clock;
      state.hiddenTimer = 0;
    },
    setWanted(n, clock) {
      state.wanted = Math.max(0, Math.min(5, n));
      state.lastCrimeAt = clock;
      state.hiddenTimer = 0;
    },
    clearWanted() {
      state.wanted = 0;
      state.hiddenTimer = 0;
      for (const c of cars) scene.remove(c.mesh);
      cars.length = 0;
      for (const f of foot) scene.remove(f.mesh);
      foot.length = 0;
      heli.active = false;
      heli.mesh.visible = false;
      clearRoadblocks();
    },
    step(dt, clock, playerPos, playerInCar, playerSpeed, playerHeading, blocked) {
      state.clock = clock;
      const wanted = state.wanted;
      // --- spawn pressure: more stars, more cars ---
      const wantCars = wanted === 0 ? 0 : Math.min(CFG.policeMaxCars, 1 + wanted);
      while (cars.length < wantCars) spawnCarNear(playerPos.x, playerPos.z);
      while (cars.length > wantCars) {
        const c = cars.pop();
        scene.remove(c.mesh);
      }
      const wantFoot = wanted >= 2 && !playerInCar ? 2 : 0;
      while (foot.length < wantFoot) spawnFootNear(playerPos.x, playerPos.z);
      while (foot.length > wantFoot) {
        const f = foot.pop();
        scene.remove(f.mesh);
      }
      // --- helicopter at 4+ stars ---
      const wantHeli = wanted >= 4;
      if (wantHeli && !heli.active) {
        heli.active = true;
        heli.mesh.visible = true;
        heli.pos.x = playerPos.x; heli.pos.z = playerPos.z;
      } else if (!wantHeli && heli.active) {
        heli.active = false;
        heli.mesh.visible = false;
      }
      if (heli.active) {
        heli.angle += dt * 0.9;
        // low (16) and wide (22) orbit: the helicopter stays in the
        // third-person frame ahead of the player instead of hiding overhead
        heli.pos.x = playerPos.x + Math.sin(heli.angle) * 22;
        heli.pos.z = playerPos.z + Math.cos(heli.angle) * 22;
        heli.mesh.position.set(heli.pos.x, 16, heli.pos.z);
        heli.mesh.rotation.y = Math.atan2(playerPos.x - heli.pos.x, playerPos.z - heli.pos.z);
        heli.mesh.userData.rotor.rotation.y += dt * 22;
        heli.mesh.userData.rotor2.rotation.y += dt * 22;
      }
      // --- roadblocks at 3+ stars, re-laid ahead as the player moves ---
      if (wanted >= 3) {
        let nearestBlock = 1e9;
        for (const c of roadblocks) {
          nearestBlock = Math.min(nearestBlock, Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z));
        }
        if (roadblocks.length === 0 || nearestBlock > 130) {
          placeRoadblocks(playerPos.x, playerPos.z, playerHeading);
        }
      } else if (roadblocks.length > 0) {
        clearRoadblocks();
      }
      // --- chase cars: steer at the player, ram ---
      for (const car of cars) {
        const dx = playerPos.x - car.pos.x;
        const dz = playerPos.z - car.pos.z;
        const dist = Math.hypot(dx, dz);
        const wantHeading = Math.atan2(dx, dz);
        let dh = wantHeading - car.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        car.heading += Math.max(-1, Math.min(1, dh * 2.2)) * dt * 1.6;
        const targetSpeed = dist > 90 ? 40 : dist > 12 ? 30 : 16;
        car.speed += (targetSpeed - car.speed) * Math.min(1, 1.4 * dt);
        const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
        const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
        if (!blocked(nx, car.pos.z) && !blocked(car.pos.x, nz)) {
          car.pos.x = nx; car.pos.z = nz;
        } else {
          car.heading += dt * 2.2; // stuck on a building: swing around
          car.speed *= 0.6;
        }
        // light bar flashes
        if (car.mesh.userData.lightBar) {
          car.mesh.userData.lightBar.material.color.setHex(
            Math.floor(clock * 4) % 2 === 0 ? 0x2244ff : 0xff2222
          );
        }
        syncCarMesh(car);
      }
      // --- foot police: run at the player, arrest on contact ---
      let arresting = false;
      for (const cop of foot) {
        const dx = playerPos.x - cop.pos.x;
        const dz = playerPos.z - cop.pos.z;
        const dist = Math.hypot(dx, dz);
        cop.heading = Math.atan2(dx, dz);
        if (dist > 2.2) {
          const nx = cop.pos.x + Math.sin(cop.heading) * cop.speed * dt;
          const nz = cop.pos.z + Math.cos(cop.heading) * cop.speed * dt;
          if (!blocked(nx, nz)) { cop.pos.x = nx; cop.pos.z = nz; }
        } else if (!playerInCar) {
          arresting = true;
        }
        cop.walkPhase += dt * 8;
        cop.mesh.position.set(cop.pos.x, 0, cop.pos.z);
        cop.mesh.rotation.y = cop.heading;
        cop.mesh.userData.legL.rotation.x = Math.sin(cop.walkPhase) * 0.5;
        cop.mesh.userData.legR.rotation.x = -Math.sin(cop.walkPhase) * 0.5;
      }
      if (arresting && wanted > 0) {
        state.arrestTimer += dt;
      } else {
        state.arrestTimer = 0;
      }
      // --- wanted decay while hidden: no police within 35 and no recent crime ---
      let nearestPolice = 1e9;
      for (const c of cars) nearestPolice = Math.min(nearestPolice, Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z));
      for (const f of foot) nearestPolice = Math.min(nearestPolice, Math.hypot(f.pos.x - playerPos.x, f.pos.z - playerPos.z));
      if (heli.active) nearestPolice = Math.min(nearestPolice, 20);
      const hidden = nearestPolice > 35 && (clock - state.lastCrimeAt) > 4;
      if (wanted > 0 && hidden) {
        state.hiddenTimer += dt;
        if (state.hiddenTimer >= CFG.wanted.decayHiddenSeconds) {
          state.wanted -= 1;
          state.hiddenTimer = 0;
          if (state.wanted === 0) this.clearWanted();
        }
      } else {
        state.hiddenTimer = 0;
      }
    },
    nearestCarDist(x, z) {
      let best = 1e9;
      for (const c of cars) best = Math.min(best, Math.hypot(c.pos.x - x, c.pos.z - z));
      return best;
    },
    isBusted() {
      return state.arrestTimer > 2;
    },
    respawnPoint() {
      return { x: POLICE_STATION_POS.x, z: POLICE_STATION_POS.z };
    },
  };
}
