// All sound is synthesized with WebAudio: no audio files, no network. The
// engine hum, sirens, gunshots, crashes and pickup blips are oscillators and
// filtered noise, started only after the first user gesture.
// (v2, 18 Nov 2026) Unchanged: synthesized sound needs no audio files.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 400;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.5;
      const sirenLfoGain = ctx.createGain();
      sirenLfoGain.gain.value = 250;
      sirenLfo.connect(sirenLfoGain);
      sirenLfoGain.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
    } catch {
      ctx = null;
    }
  }

  function blip(freq, seconds, type, volume) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume || 0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  function noise(seconds, volume, filterFreq) {
    if (!ctx || muted) return;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    setEngine(speedRatio, on) {
      if (!ctx || !engineOsc) return;
      engineOsc.frequency.value = 45 + speedRatio * 130;
      engineGain.gain.value = muted || !on ? 0 : 0.05 + speedRatio * 0.05;
    },
    setSiren(on) {
      if (!ctx || !sirenGain) return;
      sirenGain.gain.value = muted || !on ? 0 : 0.045;
    },
    pickup() {
      blip(660, 0.09, 'sine', 0.25);
      setTimeout(() => blip(990, 0.14, 'sine', 0.25), 70);
    },
    gunshot() {
      noise(0.12, 0.5, 2500);
    },
    crash() {
      noise(0.25, 0.4, 300);
    },
    punch() {
      noise(0.08, 0.3, 800);
    },
    missionDone() {
      [523, 659, 784, 1047].forEach((freq, i) => setTimeout(() => blip(freq, 0.18, 'triangle', 0.22), i * 110));
    },
    busted() {
      [392, 311, 233].forEach((freq, i) => setTimeout(() => blip(freq, 0.3, 'sawtooth', 0.15), i * 180));
    },
  };
}
