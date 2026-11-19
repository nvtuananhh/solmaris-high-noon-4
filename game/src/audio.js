// WebAudio synth for MARAVILLA BAY — no audio files, no network.
// Everything is oscillators and filtered noise built at runtime:
// engine hum (pitch follows speed), two-tone police sirens, gunshots,
// footsteps, pickup chimes, and three radio stations made of tiny
// step-sequencer loops (coastal pop, latin groove, talk-radio bleeps).
// Audio starts only after a user gesture; every call is guarded so a
// headless run without audio never throws.

export function createAudio(settings) {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let radioTimer = null;
  let radioStep = 0;
  let station = 0; // 0 coastal pop, 1 latin groove, 2 talk radio
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = settings.volume ?? 0.7;
      master.connect(ctx.destination);
      started = true;
      return true;
    } catch (_err) {
      return false;
    }
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ensure() || !ctx) return;
    try {
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g); g.connect(master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    } catch (_err) { /* audio is best-effort */ }
  }

  // Deterministic noise: a tiny local LCG, so even the audio buffer never
  // touches Math.random (keeps the whole codebase grep-clean for it).
  let noiseSeed = 1234567;
  function noiseBurst(dur, vol, filterFreq) {
    if (!ensure() || !ctx) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        noiseSeed = (Math.imul(noiseSeed, 1103515245) + 12345) >>> 0;
        data[i] = ((noiseSeed / 4294967296) * 2 - 1) * (1 - i / len);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = filterFreq;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(filt); filt.connect(g); g.connect(master);
      src.start();
    } catch (_err) { /* best-effort */ }
  }

  const api = {
    unlock,
    get station() { return station; },
    setVolume(v) {
      settings.volume = v;
      if (master && ctx) master.gain.value = v;
    },
    // Engine hum: a sawtooth whose pitch follows speed. Created once.
    setEngine(speedNorm, on) {
      if (!ensure() || !ctx) return;
      try {
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineGain = ctx.createGain();
          engineOsc.type = 'sawtooth';
          engineOsc.frequency.value = 60;
          engineGain.gain.value = 0;
          const filt = ctx.createBiquadFilter();
          filt.type = 'lowpass'; filt.frequency.value = 700;
          engineOsc.connect(filt); filt.connect(engineGain); engineGain.connect(master);
          engineOsc.start();
        }
        engineOsc.frequency.value = 55 + speedNorm * 160;
        engineGain.gain.value = on ? 0.05 + speedNorm * 0.05 : 0;
      } catch (_err) { /* best-effort */ }
    },
    setSiren(on) {
      if (!ensure() || !ctx) return;
      try {
        if (on && !sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenGain = ctx.createGain();
          sirenOsc.type = 'sine';
          sirenOsc.frequency.value = 700;
          sirenGain.gain.value = 0.045;
          sirenLfo = ctx.createOscillator();
          const lfoGain = ctx.createGain();
          sirenLfo.type = 'square'; sirenLfo.frequency.value = 0.55;
          lfoGain.gain.value = 220;
          sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
          sirenOsc.connect(sirenGain); sirenGain.connect(master);
          sirenOsc.start(); sirenLfo.start();
        } else if (!on && sirenOsc) {
          try { sirenOsc.stop(); sirenLfo.stop(); } catch (_e) {}
          sirenOsc = null; sirenLfo = null; sirenGain = null;
        }
      } catch (_err) { /* best-effort */ }
    },
    gunshot() { noiseBurst(0.12, 0.5, 1800); tone(160, 0.08, 'square', 0.25, 0, 60); },
    punch() { noiseBurst(0.08, 0.35, 900); },
    footstep() { noiseBurst(0.05, 0.12, 500); },
    pickup() { tone(880, 0.12, 'sine', 0.25); tone(1318, 0.18, 'sine', 0.25, 0.09); },
    coin() { tone(1046, 0.1, 'triangle', 0.3); tone(1568, 0.22, 'triangle', 0.3, 0.07); },
    missionDone() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.3, i * 0.11)); },
    busted() { [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.2, i * 0.16)); },
    honk() { tone(370, 0.18, 'square', 0.2); tone(466, 0.18, 'square', 0.15); },
    crash() { noiseBurst(0.25, 0.5, 600); },
    cycleRadio() {
      station = (station + 1) % 3;
      radioStep = 0;
      return station;
    },
    radioName() {
      return ['Coastal Pop 98.1', 'Latin Groove 101.5', 'Bay Talk 870'][station];
    },
    // One sequencer tick per call (the game loop calls this ~8x/second
    // while driving). Notes are fixed per station — no wall-clock use.
    radioTick() {
      if (!ensure() || !ctx) return;
      const scales = [
        [262, 294, 330, 392, 440, 523], // coastal pop: bright major
        [220, 262, 294, 330, 370, 415], // latin groove: syncopated minor
        [180, 180, 220, 180, 165, 180], // talk radio: low bleeps
      ];
      const scale = scales[station];
      const note = scale[radioStep % scale.length];
      const isBeat = radioStep % 2 === 0;
      tone(note, 0.16, station === 2 ? 'square' : 'triangle', station === 2 ? 0.06 : 0.12);
      if (isBeat) tone(110, 0.1, 'sine', 0.16);
      if (station === 1 && radioStep % 4 === 2) tone(note * 1.5, 0.12, 'triangle', 0.1);
      radioStep++;
    },
    stopRadio() { radioStep = 0; },
  };
  return api;
}
