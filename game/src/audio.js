// Synthesized WebAudio: engine hum, sirens, gunshots, crashes — plus a
// simple synth radio station the player can toggle with R. Browser only.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null, engineGain = null;
  let sirenOsc = null, sirenGain = null, sirenT = 0;
  let muted = false;
  let radioOn = false;
  let radioTimer = null;
  let station = 0;

  // Three little sequencer stations: bassline + lead, different moods.
  const STATIONS = [
    { name: 'SOLMAR FM — Sunset Drive', bpm: 96, bass: [55, 0, 55, 0, 65.4, 0, 49, 0], lead: [220, 0, 261.6, 0, 329.6, 293.7, 261.6, 220] },
    { name: 'HEAT 101 — Night Chase', bpm: 128, bass: [55, 55, 0, 55, 65.4, 0, 55, 49], lead: [440, 0, 415.3, 0, 392, 440, 493.9, 0] },
    { name: 'PALM FM — Beach Vibes', bpm: 80, bass: [43.7, 0, 55, 0, 49, 0, 55, 0], lead: [329.6, 392, 440, 392, 329.6, 293.7, 261.6, 0] },
  ];

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, lowpass = 1200) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  function radioStep() {
    if (!ctx || !radioOn) return;
    const st = STATIONS[station];
    const stepDur = 60 / st.bpm / 2;
    const step = Math.floor(ctx.currentTime / stepDur) % 8;
    const bass = st.bass[step];
    const lead = st.lead[step];
    if (bass) blip(bass, stepDur * 0.9, 'triangle', 0.22);
    if (lead) blip(lead, stepDur * 0.8, 'square', 0.07);
    if (step % 2 === 0) noise(0.03, 0.05, 6000); // hat tick
    radioTimer = setTimeout(radioStep, stepDur * 1000);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    get muted() { return muted; },
    get radioOn() { return radioOn; },
    stationName() { return STATIONS[station].name; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    toggleRadio() {
      if (!ensure()) return false;
      radioOn = !radioOn;
      if (radioOn) radioStep();
      else if (radioTimer) clearTimeout(radioTimer);
      return radioOn;
    },
    nextStation() {
      station = (station + 1) % STATIONS.length;
      return STATIONS[station].name;
    },
    update(world, dt) {
      if (!ctx) return;
      const p = world.player;
      const speed = p.onFoot ? 0 : Math.abs(p.car.speed);
      if (engineGain) {
        engineGain.gain.value = p.onFoot ? 0 : 0.03 + Math.min(0.09, speed * 0.0022);
        engineOsc.frequency.value = 55 + speed * 3.2;
      }
      if (sirenGain) {
        const want = world.police.length > 0 && !muted;
        sirenT += dt;
        sirenOsc.frequency.value = 650 + Math.sin(sirenT * 5.2) * 220;
        sirenGain.gain.value += ((want ? 0.045 : 0) - sirenGain.gain.value) * Math.min(1, dt * 4);
      }
      for (const ev of world.events) {
        if (ev === 'shot') { noise(0.12, 0.5, 3200); blip(180, 0.08, 'square', 0.25); }
        if (ev === 'punch') noise(0.08, 0.3, 900);
        if (ev === 'crash') { noise(0.3, 0.5, 500); blip(70, 0.25, 'sine', 0.4); }
        if (ev === 'steal') blip(880, 0.12, 'sine', 0.2);
      }
    },
  };
}
