// Save / load for MARAVILLA BAY via localStorage.
// Stores mission progress, cash, respect, health, weapon, ammo, owned
// cars and upgrades, the player's position and the day clock. Nothing
// else: traffic, police and pedestrians are re-seeded from the world seed
// on load, so a save stays small and deterministic.

const KEY = 'maravilla-bay-save-v1';

export function hasSave() {
  try {
    return !!window.localStorage.getItem(KEY);
  } catch (_err) {
    return false;
  }
}

export function writeSave(state) {
  const data = {
    v: 1,
    missionIndex: state.missionIndex,
    stepIndex: state.stepIndex,
    cash: state.cash,
    respect: state.respect,
    health: state.health,
    weapon: state.weapon,
    ammo: state.ammo,
    player: { x: state.player.x, z: state.player.z, heading: state.playerHeading },
    day: state.day,
    clockMinutes: state.clockMinutes,
    coinsTaken: state.coinsTaken,
    ownedCars: state.ownedCars,
    upgrades: state.upgrades,
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (_err) {
    return false;
  }
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch (_err) {
    return null;
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(KEY); } catch (_err) { /* best-effort */ }
}
