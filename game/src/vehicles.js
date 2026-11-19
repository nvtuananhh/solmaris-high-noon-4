// Cars for MARAVILLA BAY: box-built car meshes plus arcade driving.
// A car is a group: body, cabin, four wheels, headlights, a damage-smoke
// puff. Physics is deliberately arcade — velocity along the heading with
// steering that bites harder at speed, a handbrake that kills grip, and a
// nitro boost when the car has the kit fitted.

import { CFG, CAR_MODELS } from './config.js';
import { pick } from './random.js';

const THREE = window.THREE;

export function buildCarMesh(model, color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1d2733 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x181a1e });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 4.4), paint);
  body.position.y = 0.75;
  body.castShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.2), glass);
  cabin.position.set(0, 1.35, -0.2);
  cabin.castShadow = true;
  g.add(cabin);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.4, 0.5), paint);
  nose.position.set(0, 0.62, 2.35);
  g.add(nose);

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(wx, 0.42, wz);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }

  // headlights (two small emissive discs) and tail lights
  const headMat = new THREE.MeshBasicMaterial({ color: 0x444433 });
  const heads = [];
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), headMat);
    h.position.set(sx, 0.75, 2.62);
    g.add(h);
    heads.push(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x550000 });
  for (const sx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), tailMat);
    t.position.set(sx, 0.8, -2.24);
    g.add(t);
  }

  // damage smoke: a grey sprite-ish sphere that fades in as health drops
  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0 })
  );
  smoke.position.set(0, 1.6, 1.6);
  g.add(smoke);

  g.userData.wheels = wheels;
  g.userData.headMat = headMat;
  g.userData.smoke = smoke;
  return g;
}

// A live car: mesh + physics state + upgrades. `opts.npc` marks traffic
// cars (driven by traffic.js instead of the player).
export function makeCar(rng, modelIndex, color, opts = {}) {
  const model = CAR_MODELS[modelIndex % CAR_MODELS.length];
  const mesh = buildCarMesh(model, color ?? pick(rng, model.colors));
  return {
    mesh,
    model,
    modelIndex,
    heading: opts.heading ?? 0,
    pos: { x: opts.x ?? 0, z: opts.z ?? 0 },
    speed: 0,
    steerAngle: 0,
    health: 100,
    nitro: 1, // 0..1 charge
    upgrades: { engine: 0, brakes: 0, nitro: 0, armor: 0 },
    npc: !!opts.npc,
    parked: !!opts.parked,
    driver: opts.driver ?? null, // pedestrian driving it, if any
    honkAt: -1,
    crashedAt: -1,
    topSpeed() {
      return this.model.top + this.upgrades.engine * 6;
    },
    accelRate() {
      return this.model.accel + this.upgrades.engine * 4;
    },
  };
}

export function syncCarMesh(car) {
  car.mesh.position.set(car.pos.x, 0, car.pos.z);
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * 0.016;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  const damaged = car.health < 55;
  car.mesh.userData.smoke.material.opacity = damaged ? (0.55 - car.health / 200) : 0;
  const s = 0.7 + 0.35 * Math.sin(car.mesh.position.x * 0 + (car.crashedAt >= 0 ? 1 : 0));
  car.mesh.userData.smoke.scale.setScalar(damaged ? s : 1);
}

// One fixed-step of arcade driving. `drive` is {throttle:-1..1, steer:-1..1,
// handbrake:bool, nitro:bool}. Returns a small event bag for sound/FX.
export function stepCar(car, drive, dt, blocked) {
  const top = car.topSpeed();
  const ev = { crashed: false, nitroUsed: false };
  let throttle = drive.throttle;
  if (drive.nitro && car.upgrades.nitro > 0 && car.nitro > 0.05 && throttle > 0) {
    throttle *= 1 + 0.6;
    car.nitro = Math.max(0, car.nitro - CFG.car.nitroDrain * dt);
    ev.nitroUsed = true;
  } else {
    car.nitro = Math.min(1, car.nitro + dt * 0.08);
  }
  const accel = throttle >= 0 ? car.accelRate() : CFG.car.brake;
  car.speed += throttle * accel * dt;
  // drag + rolling resistance, stronger grip when handbraking
  const grip = drive.handbrake ? CFG.car.handbrakeGrip : CFG.car.grip;
  car.speed -= car.speed * 0.35 * dt;
  car.speed = Math.max(-CFG.car.maxReverse, Math.min(top + (ev.nitroUsed ? CFG.car.nitroBoost : 0), car.speed));
  if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;

  const steerAuthority = Math.min(1, Math.abs(car.speed) / 8);
  const targetSteer = drive.steer * CFG.car.steer * steerAuthority * (car.speed >= 0 ? 1 : -1);
  car.steerAngle += (targetSteer - car.steerAngle) * Math.min(1, grip * dt);
  car.heading += car.steerAngle * dt * Math.sign(car.speed || 1) * Math.min(1, Math.abs(car.speed) / 6 + 0.25);

  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
  if (blocked(nx, car.pos.z) || blocked(car.pos.x, nz)) {
    // hit something: stop, take damage, bounce back a little
    if (Math.abs(car.speed) > 6) {
      car.health -= Math.abs(car.speed) * (car.upgrades.armor > 0 ? 0.35 : 0.8);
      ev.crashed = true;
      car.crashedAt = 0;
    }
    car.speed *= -0.25;
  } else {
    car.pos.x = nx;
    car.pos.z = nz;
  }
  // keep inside the map
  car.pos.x = Math.max(-590, Math.min(590, car.pos.x));
  car.pos.z = Math.max(-590, Math.min(680, car.pos.z));
  if (car.crashedAt >= 0) car.crashedAt += dt;
  syncCarMesh(car);
  return ev;
}

export function setHeadlights(car, on) {
  car.mesh.userData.headMat.color.setHex(on ? 0xfff2b0 : 0x444433);
}
