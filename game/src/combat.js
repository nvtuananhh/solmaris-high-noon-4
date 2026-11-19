// Combat for MARAVILLA BAY.
// Melee (fists, then a bat pickup) and ranged (pistol, then SMG pickup)
// with a crosshair, ammo, muzzle flash, hit reactions and health packs.
// Enemies are rival crew members spawned by missions 6 and 8; they walk
// at the player and swing when close. Hitscan shooting keeps it simple
// and deterministic: a shot hits the nearest foe inside a narrow cone.

import { CFG } from './config.js';
import { buildPedMesh } from './pedestrians.js';
import { range } from './random.js';

const THREE = window.THREE;

export function createCombat(scene, rng, ctx) {
  // ctx: { state, playerPos, playerHeading, audio, notify, onFoeDown }
  const foes = [];
  const pickups = [];
  const state = ctx.state;

  // weapon pickups placed around the map at build time
  const pickupDefs = [
    { kind: 'bat', x: -300, z: -300, color: 0x8a6a3a },
    { kind: 'pistol', x: 100, z: 100, color: 0x2a2d33 },
    { kind: 'smg', x: 350, z: -100, color: 0x3a3a4a },
    { kind: 'health', x: -100, z: 300, color: 0x3eff7a },
    { kind: 'health', x: 200, z: -200, color: 0x3eff7a },
    { kind: 'pistol', x: -420, z: 200, color: 0x2a2d33 },
  ];
  for (const def of pickupDefs) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.5, 0.9),
      new THREE.MeshBasicMaterial({ color: def.color })
    );
    m.position.set(def.x, 0.7, def.z);
    scene.add(m);
    pickups.push({ ...def, mesh: m, taken: false });
  }

  // muzzle flash: a small additive sprite shown for one step after a shot
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 })
  );
  scene.add(flash);
  let flashAt = -10;

  function spawnFoes(x, z, count) {
    for (let i = 0; i < count; i++) {
      const mesh = buildPedMesh(rng);
      mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0x5a1f1f });
      const foe = {
        mesh,
        pos: { x: x + range(rng, -14, 14), z: z + range(rng, -14, 14) },
        heading: 0,
        health: 60,
        speed: range(rng, 3.4, 4.2),
        swingAt: 0,
        walkPhase: range(rng, 0, 6),
        hitFlash: 0,
      };
      scene.add(mesh);
      foes.push(foe);
    }
    ctx.notify(`${count} rival crew closing in — protect the witness!`);
  }

  return {
    foes,
    pickups,
    get weapon() { return state.weapon; },
    get ammo() { return state.ammo; },
    spawnFoes,
    // melee swing: hits the nearest foe or cop in range in front
    punch() {
      if (state.punchCooldown > 0) return;
      state.punchCooldown = CFG.player.punchCooldown;
      ctx.audio.punch();
      const p = ctx.playerPos();
      const h = ctx.playerHeading();
      const dmg = state.weapon === 'bat' ? 45 : CFG.player.punchDamage;
      for (const foe of foes) {
        const dx = foe.pos.x - p.x, dz = foe.pos.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > CFG.player.punchRange + 0.6) continue;
        const ang = Math.atan2(dx, dz);
        let dh = ang - h;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        if (Math.abs(dh) < 1.1) {
          foe.health -= dmg;
          foe.hitFlash = 0.25;
          if (foe.health <= 0) this.killFoe(foe);
        }
      }
      // punching a pedestrian is a crime
      ctx.onAssault();
    },
    // hitscan shot from the player along the camera heading
    shoot() {
      if (state.weapon !== 'pistol' && state.weapon !== 'smg') return false;
      if (state.ammo <= 0) { ctx.notify('Out of ammo — find a pickup.'); return false; }
      if (state.shotCooldown > 0) return false;
      state.shotCooldown = state.weapon === 'smg' ? 0.12 : 0.3;
      state.ammo -= 1;
      ctx.audio.gunshot();
      const p = ctx.playerPos();
      const h = ctx.playerHeading();
      // flash sits at the gun, off to the player's right, so it reads as
      // a muzzle flash instead of a halo over the head
      flash.position.set(
        p.x + Math.sin(h) * 1.4 + Math.cos(h) * 0.7,
        1.35,
        p.z + Math.cos(h) * 1.4 - Math.sin(h) * 0.7
      );
      flash.material.opacity = 0.8;
      flashAt = ctx.state.clock;
      ctx.onShotFired({ x: p.x, z: p.z });
      let best = null, bestD = 45;
      for (const foe of foes) {
        const dx = foe.pos.x - p.x, dz = foe.pos.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > bestD) continue;
        const ang = Math.atan2(dx, dz);
        let dh = ang - h;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        if (Math.abs(dh) < 0.12 + (1 - d / 45) * 0.1) { best = foe; bestD = d; }
      }
      if (best) {
        best.health -= state.weapon === 'smg' ? 34 : 50;
        best.hitFlash = 0.25;
        if (best.health <= 0) this.killFoe(best);
      }
      return true;
    },
    killFoe(foe) {
      const i = foes.indexOf(foe);
      if (i >= 0) foes.splice(i, 1);
      scene.remove(foe.mesh);
      ctx.onFoeDown();
    },
    step(dt) {
      state.punchCooldown = Math.max(0, state.punchCooldown - dt);
      state.shotCooldown = Math.max(0, state.shotCooldown - dt);
      if (flash.material.opacity > 0 && ctx.state.clock - flashAt > 0.06) {
        flash.material.opacity = 0;
      }
      // foes walk at the player and swing in range
      const p = ctx.playerPos();
      for (const foe of [...foes]) {
        const dx = p.x - foe.pos.x, dz = p.z - foe.pos.z;
        const d = Math.hypot(dx, dz);
        foe.heading = Math.atan2(dx, dz);
        if (d > 1.8) {
          foe.pos.x += Math.sin(foe.heading) * foe.speed * dt;
          foe.pos.z += Math.cos(foe.heading) * foe.speed * dt;
        } else {
          foe.swingAt -= dt;
          if (foe.swingAt <= 0) {
            foe.swingAt = 0.9;
            ctx.damagePlayer(12);
            ctx.audio.punch();
          }
        }
        foe.hitFlash = Math.max(0, foe.hitFlash - dt);
        foe.walkPhase += dt * 7;
        foe.mesh.position.set(foe.pos.x, 0, foe.pos.z);
        foe.mesh.rotation.y = foe.heading;
        foe.mesh.userData.legL.rotation.x = Math.sin(foe.walkPhase) * 0.5;
        foe.mesh.userData.legR.rotation.x = -Math.sin(foe.walkPhase) * 0.5;
        foe.mesh.children[0].material.color.setHex(foe.hitFlash > 0 ? 0xffffff : 0x5a1f1f);
      }
      // pickups: bob, spin, collect on touch
      for (const pk of pickups) {
        if (pk.taken) continue;
        pk.mesh.rotation.y += dt;
        pk.mesh.position.y = 0.7 + Math.sin(ctx.state.clock * 2 + pk.x) * 0.12;
        if (Math.hypot(p.x - pk.x, p.z - pk.z) < 1.8) {
          pk.taken = true;
          pk.mesh.visible = false;
          if (pk.kind === 'health') {
            state.health = Math.min(CFG.player.maxHealth, state.health + 50);
            ctx.notify('Health pack — +50 health.');
          } else if (pk.kind === 'bat') {
            state.weapon = 'bat';
            ctx.notify('Picked up a bat — F hits much harder.');
          } else {
            state.weapon = pk.kind;
            state.ammo = pk.kind === 'smg' ? 60 : 24;
            ctx.notify(`Picked up a ${pk.kind} — ${state.ammo} rounds. R or right-click to fire.`);
          }
          ctx.audio.pickup();
        }
      }
    },
  };
}
