// HUD for MARAVILLA BAY — plain DOM over the canvas.
// Health bar, cash, respect, wanted stars, clock + day, district name,
// mission objective banner, in-car speedometer, ammo, radio station,
// transient message toasts, and the title / pause / busted / garage
// screens. The HUD never touches the 3D scene; it only reads state.

export function createHud(doc) {
  const el = (id) => doc.getElementById(id);
  const hud = {
    healthFill: el('health-fill'),
    healthText: el('health-text'),
    cash: el('cash'),
    respect: el('respect'),
    stars: el('stars'),
    clock: el('clock'),
    district: el('district'),
    objective: el('objective'),
    speedo: el('speedo'),
    speedVal: el('speed-val'),
    ammo: el('ammo'),
    radio: el('radio'),
    toast: el('toast'),
    crosshair: el('crosshair'),
    hint: el('hint'),
    titleScreen: el('title-screen'),
    pauseScreen: el('pause-screen'),
    bustedScreen: el('busted-screen'),
    garageScreen: el('garage-screen'),
    missionCard: el('mission-card'),
    missionTitle: el('mission-title'),
    missionBrief: el('mission-brief'),
    garageList: el('garage-list'),
  };
  let toastTimer = 0;

  function showToast(msg) {
    if (!hud.toast) return;
    hud.toast.textContent = msg;
    hud.toast.classList.add('show');
    toastTimer = 4;
  }

  return {
    showToast,
    setHealth(h, max) {
      const pct = Math.max(0, Math.min(100, (h / max) * 100));
      if (hud.healthFill) hud.healthFill.style.width = `${pct}%`;
      if (hud.healthText) hud.healthText.textContent = `${Math.ceil(h)}`;
    },
    setCash(cash) {
      if (hud.cash) hud.cash.textContent = `$${cash.toLocaleString('en-US')}`;
    },
    setRespect(r) {
      if (hud.respect) hud.respect.textContent = `Respect ${r}`;
    },
    setWanted(n) {
      if (!hud.stars) return;
      let s = '';
      for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
      hud.stars.textContent = s;
      hud.stars.classList.toggle('hot', n >= 3);
    },
    setClock(day, hour, minute) {
      if (!hud.clock) return;
      const hh = String(hour).padStart(2, '0');
      const mm = String(minute).padStart(2, '0');
      hud.clock.textContent = `Day ${day}  ${hh}:${mm}`;
    },
    setDistrict(name) {
      if (hud.district) hud.district.textContent = name;
    },
    setObjective(text) {
      if (hud.objective) hud.objective.textContent = text;
    },
    setSpeed(kmh, inCar) {
      if (!hud.speedo) return;
      hud.speedo.style.display = inCar ? 'block' : 'none';
      if (hud.speedVal) hud.speedVal.textContent = `${Math.round(kmh)}`;
    },
    setAmmo(weapon, ammo) {
      if (!hud.ammo) return;
      if (weapon === 'fists') { hud.ammo.textContent = ''; return; }
      hud.ammo.textContent = weapon === 'bat' ? 'BAT' : `${weapon.toUpperCase()}  ${ammo}`;
    },
    setRadio(name) {
      if (hud.radio) hud.radio.textContent = name;
    },
    setCrosshair(armed) {
      if (hud.crosshair) hud.crosshair.style.display = armed ? 'block' : 'none';
    },
    setHint(text) {
      if (hud.hint) hud.hint.textContent = text || '';
    },
    showMissionCard(title, brief) {
      if (!hud.missionCard) return;
      hud.missionTitle.textContent = title;
      hud.missionBrief.textContent = brief;
      hud.missionCard.classList.add('show');
      setTimeout(() => hud.missionCard.classList.remove('show'), 5200);
    },
    showTitle(hasSave) {
      if (hud.titleScreen) hud.titleScreen.style.display = 'flex';
      const cont = doc.getElementById('btn-continue');
      if (cont) cont.style.display = hasSave ? 'block' : 'none';
    },
    hideTitle() {
      if (hud.titleScreen) hud.titleScreen.style.display = 'none';
    },
    showPause() {
      if (hud.pauseScreen) hud.pauseScreen.style.display = 'flex';
    },
    hidePause() {
      if (hud.pauseScreen) hud.pauseScreen.style.display = 'none';
    },
    showBusted(lost) {
      if (!hud.bustedScreen) return;
      hud.bustedScreen.style.display = 'flex';
      const lostEl = doc.getElementById('busted-lost');
      if (lostEl) lostEl.textContent = `You lost $${lost.toLocaleString('en-US')} and woke up at the station.`;
    },
    hideBusted() {
      if (hud.bustedScreen) hud.bustedScreen.style.display = 'none';
    },
    showGarage(itemsHtml) {
      if (!hud.garageScreen) return;
      if (hud.garageList) hud.garageList.innerHTML = itemsHtml;
      hud.garageScreen.style.display = 'flex';
    },
    hideGarage() {
      if (hud.garageScreen) hud.garageScreen.style.display = 'none';
    },
    tick(dt) {
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0 && hud.toast) hud.toast.classList.remove('show');
      }
    },
  };
}
