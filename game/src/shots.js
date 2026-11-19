// Deterministic screenshot staging for MARAVILLA BAY.
// Each `?shot=<mode>&seed=1` mode builds one exact scene: fixed player
// and camera placement, fixed time of day, fixed mission state, and a
// fixed number of simulation steps run before the single render. Nothing
// here reads the wall clock or unseeded randomness, so two runs with the
// same seed render byte-identical frames.

import { CFG } from './config.js';

// Steps to simulate before the render, per shot.
export const SHOT_STEPS = {
  cover: 300,
  onfoot: 150,
  driving: 240,
  mission: 120,
};

export function stageShot(world, mode) {
  const s = world.state;
  const input = world.input;
  s.mode = 'playing';
  world.hud.hideTitle();
  world.hud.hidePause();
  world.hud.hideBusted();
  world.audio.setVolume(0); // shots are silent

  if (mode === 'cover') {
    // Police chase: 4 stars, helicopter overhead, roadblock ahead,
    // traffic all around, mission objective on screen.
    world.startMission(4); // mission 5: Casino Row getaway (index 4)
    world.teleport(0, 120);
    s.player.heading = 0; // south, down the avenue toward the marina
    s.camYaw = 0;
    s.camPitch = 0.12;
    s.clockMinutes = 17 * 60 + 45;
    world.tryEnterCarAt(0, 120);
    world.setWanted(4);
    input.testDown('KeyW'); // drive forward through the chase
    return { holdKeys: ['KeyW'] };
  }

  if (mode === 'onfoot') {
    // Mara on foot in Mercado Quarter among pedestrians and storefronts.
    world.startMission(0);
    world.teleport(50, 50);
    s.player.heading = Math.PI * 0.75;
    s.camYaw = Math.PI * 0.75;
    s.camPitch = 0.32;
    s.clockMinutes = 17 * 60 + 20;
    input.testDown('KeyW'); // stroll forward
    return { holdKeys: ['KeyW'] };
  }

  if (mode === 'driving') {
    // Dusk drive down Marina Strip: skyline, traffic, minimap.
    world.startMission(0);
    world.teleport(0, 460);
    s.player.heading = Math.PI; // north, up the strip
    s.camYaw = Math.PI;
    s.camPitch = 0.28;
    s.clockMinutes = 20 * 60 + 10; // dusk: streetlights on
    world.tryEnterCarAt(0, 460);
    input.testDown('KeyW');
    return { holdKeys: ['KeyW'] };
  }

  if (mode === 'mission') {
    // Mission 6 rooftop combat: witness, rival crew, pistol out.
    world.giveRespect(40);
    world.startMission(5); // mission 6 (index 5)
    world.teleport(350, -128);
    s.player.heading = Math.PI * 0.25;
    s.camYaw = Math.PI * 0.25;
    s.camPitch = 0.3;
    s.clockMinutes = 18 * 60 + 5;
    world.giveWeapon('pistol', 24);
    // jump to the combat step and spawn the crew
    world.missions.stepIndex = 1;
    world.missions.foesLeft = 4;
    world.combat.spawnFoes(350, -120, 4);
    return { holdKeys: [] };
  }

  return { holdKeys: [] };
}

// After staging, run the fixed steps and render once. Returns the number
// of steps run (for the test log).
export function runShot(world, mode) {
  const staged = stageShot(world, mode);
  const steps = SHOT_STEPS[mode] ?? 120;
  for (let i = 0; i < steps; i++) {
    world.update(CFG.step);
  }
  if (mode === 'cover') {
    // swing the helicopter to the front of the frame, then settle it
    world.police.heli.angle = world.state.camYaw;
    world.update(CFG.step);
    world.update(CFG.step);
  }
  if (mode === 'mission') {
    // one aimed shot for the muzzle flash in frame
    world.combat.shoot();
    world.update(CFG.step);
    world.renderFrame();
  }
  world.snapCamera();
  world.renderFrame();
  for (const k of staged.holdKeys) world.input.testUp(k);
  return steps;
}
