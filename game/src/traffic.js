// Traffic for MARAVILLA BAY.
// ~24 cars cruise the avenue grid on the right-hand side of the road,
// looping around blocks, braking for the car ahead and for the player,
// and occasionally changing lane. All choices come from the seeded rng;
// each car keeps its own lane and speed so the flow is stable.

import { CFG } from './config.js';
import { makeCar, syncCarMesh } from './vehicles.js';
import { range, int, pick } from './random.js';

const AVENUES = [];
for (let v = -500; v <= 500; v += CFG.blockPitch) AVENUES.push(v);

function laneFor(axis, avenue, dir) {
  // right-hand side of the road: offset +3.5 in the direction of travel
  return avenue + (dir > 0 ? 3.5 : -3.5);
}

export function createTraffic(scene, rng, blocked) {
  const cars = [];
  for (let i = 0; i < CFG.trafficCount; i++) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const avenue = pick(rng, AVENUES);
    const dir = rng() < 0.5 ? 1 : -1;
    const along = range(rng, -550, 500);
    const car = makeCar(rng, int(rng, 0, 4), undefined, { npc: true });
    car.axis = axis;
    car.avenue = avenue;
    car.dir = dir;
    car.cruise = range(rng, 9, 15);
    car.laneChangeAt = range(rng, 8, 30);
    if (axis === 'x') {
      car.pos.x = along; car.pos.z = laneFor(axis, avenue, dir);
      car.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.pos.z = along; car.pos.x = laneFor(axis, avenue, dir);
      car.heading = dir > 0 ? 0 : Math.PI;
    }
    car.speed = car.cruise;
    scene.add(car.mesh);
    syncCarMesh(car);
    cars.push(car);
  }

  function carAhead(car) {
    let best = null;
    for (const o of cars) {
      if (o === car || o.axis !== car.axis || o.avenue !== car.avenue || o.dir !== car.dir) continue;
      const gap = car.axis === 'x' ? (o.pos.x - car.pos.x) * car.dir : (o.pos.z - car.pos.z) * car.dir;
      if (gap > 0 && gap < 16 && (!best || gap < best.gap)) best = { car: o, gap };
    }
    return best;
  }

  return {
    cars,
    step(dt, playerCar, playerPos) {
      for (const car of cars) {
        // occasional lane change to the next avenue over
        car.laneChangeAt -= dt;
        if (car.laneChangeAt <= 0) {
          car.laneChangeAt = range(rng, 14, 40);
          const idx = AVENUES.indexOf(car.avenue);
          const next = AVENUES[Math.max(0, Math.min(AVENUES.length - 1, idx + (rng() < 0.5 ? 1 : -1)))];
          if (next !== car.avenue) {
            car.avenue = next;
            if (car.axis === 'x') car.pos.z = laneFor('x', next, car.dir);
            else car.pos.x = laneFor('z', next, car.dir);
          }
        }
        // desired speed: cruise, slower if blocked ahead
        let target = car.cruise;
        const ahead = carAhead(car);
        if (ahead) target = Math.min(target, Math.max(0, ahead.car.speed * 0.8 - (14 - ahead.gap)));
        // brake for the player's car if it is right ahead
        if (playerCar) {
          const dx = playerCar.pos.x - car.pos.x;
          const dz = playerCar.pos.z - car.pos.z;
          const aheadDist = car.axis === 'x' ? dx * car.dir : dz * car.dir;
          const lateral = car.axis === 'x' ? Math.abs(dz) : Math.abs(dx);
          if (aheadDist > 0 && aheadDist < 12 && lateral < 4) target = 0;
        }
        // brake for the player on foot crossing in front
        if (playerPos) {
          const dx = playerPos.x - car.pos.x;
          const dz = playerPos.z - car.pos.z;
          const aheadDist = car.axis === 'x' ? dx * car.dir : dz * car.dir;
          const lateral = car.axis === 'x' ? Math.abs(dz) : Math.abs(dx);
          if (aheadDist > 0 && aheadDist < 9 && lateral < 3.5) target = 0;
        }
        car.speed += (target - car.speed) * Math.min(1, 1.6 * dt);
        if (car.axis === 'x') {
          car.pos.x += car.dir * car.speed * dt;
          if (car.pos.x > 580) car.pos.x = -580;
          if (car.pos.x < -580) car.pos.x = 580;
        } else {
          car.pos.z += car.dir * car.speed * dt;
          if (car.pos.z > 500) car.pos.z = -580;
          if (car.pos.z < -580) car.pos.z = 500;
        }
        syncCarMesh(car);
      }
    },
    // Nearest traffic car to a point (used for stealing an NPC car).
    nearest(x, z, maxDist) {
      let best = null, bestD = maxDist;
      for (const car of this.cars) {
        const d = Math.hypot(car.pos.x - x, car.pos.z - z);
        if (d < bestD) { bestD = d; best = car; }
      }
      return best;
    },
  };
}
