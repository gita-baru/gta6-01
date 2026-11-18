// Synthesised sound for Solmar Heat: WebAudio only, no audio files.
// Engine hum, sirens, gunshots, punches and a 3-station radio (R cycles).
// Everything is created lazily on the first user gesture so browsers allow it.
import { RADIO } from './config.js';

export function makeAudio() {
  const audio = {
    ctx: null,
    master: null,
    muted: false,
    station: 0,
    radioTimer: null,
    engineOsc: null,
    engineGain: null,
    engineFilter: null,
    sirenOsc: null,
    sirenGain: null,
    step: 0,
    nextStepTime: 0,
    ensure() {
      if (audio.ctx) {
        if (audio.ctx.state === 'suspended') audio.ctx.resume();
        return true;
      }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      audio.ctx = new Ctx();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.5;
      audio.master.connect(audio.ctx.destination);
      // Engine: two detuned saws through a lowpass, pitch follows speed.
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 55;
      const osc2 = audio.ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = 58;
      audio.engineFilter = audio.ctx.createBiquadFilter();
      audio.engineFilter.type = 'lowpass';
      audio.engineFilter.frequency.value = 420;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(audio.engineFilter);
      osc2.connect(audio.engineFilter);
      audio.engineFilter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      osc2.start();
      audio.engineOsc2 = osc2;
      // Siren: a square wave that alternates 700/950 Hz.
      audio.sirenOsc = audio.ctx.createOscillator();
      audio.sirenOsc.type = 'square';
      audio.sirenOsc.frequency.value = 700;
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
      audio.startRadio();
      return true;
    },
    setMuted(muted) {
      audio.muted = muted;
      if (audio.master) audio.master.gain.value = muted ? 0 : 0.5;
    },
    setEngine(speedNorm, inCar) {
      if (!audio.ctx) return;
      const t = audio.ctx.currentTime;
      const target = inCar ? 0.05 + speedNorm * 0.05 : 0;
      audio.engineGain.gain.setTargetAtTime(target, t, 0.1);
      const freq = 55 + speedNorm * 130;
      audio.engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
      audio.engineOsc2.frequency.setTargetAtTime(freq * 1.01 + 2, t, 0.08);
    },
    setSiren(on, distance) {
      if (!audio.ctx) return;
      const t = audio.ctx.currentTime;
      const vol = on ? Math.max(0, 0.05 - distance * 0.0004) : 0;
      audio.sirenGain.gain.setTargetAtTime(vol, t, 0.2);
      if (on) {
        const phase = Math.floor(t * 2.2) % 2;
        audio.sirenOsc.frequency.setTargetAtTime(phase ? 950 : 700, t, 0.05);
      }
    },
    blip(freq, dur, type, vol) {
      if (!audio.ctx) return;
      const t = audio.ctx.currentTime;
      const osc = audio.ctx.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      const g = audio.ctx.createGain();
      g.gain.setValueAtTime(vol || 0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(audio.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },
    noiseBurst(dur, filterFreq, vol) {
      if (!audio.ctx) return;
      const t = audio.ctx.currentTime;
      const len = Math.floor(audio.ctx.sampleRate * dur);
      const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = audio.ctx.createBufferSource();
      src.buffer = buf;
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const g = audio.ctx.createGain();
      g.gain.value = vol;
      src.connect(filter);
      filter.connect(g);
      g.connect(audio.master);
      src.start(t);
    },
    gunshot() {
      audio.noiseBurst(0.14, 1800, 0.5);
      audio.blip(120, 0.08, 'square', 0.2);
    },
    punchHit() {
      audio.noiseBurst(0.09, 300, 0.4);
    },
    pickup() {
      audio.blip(660, 0.1, 'sine', 0.2);
      setTimeout(() => audio.blip(880, 0.16, 'sine', 0.2), 90);
    },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => audio.blip(f, 0.18, 'triangle', 0.22), i * 110));
    },
    busted() {
      [400, 350, 300].forEach((f, i) => setTimeout(() => audio.blip(f, 0.25, 'sawtooth', 0.15), i * 160));
    },
    cycleStation() {
      audio.station = (audio.station + 1) % RADIO.length;
      audio.step = 0;
      return RADIO[audio.station].name;
    },
    // The radio is a tiny step sequencer: a bass line and a lead line per
    // station, scheduled a few steps ahead so the loop never stutters.
    startRadio() {
      if (audio.radioTimer) return;
      audio.nextStepTime = audio.ctx.currentTime + 0.1;
      audio.radioTimer = setInterval(() => {
        if (!audio.ctx || audio.muted) return;
        const stepDur = audio.station === 1 ? 0.21 : 0.26;
        while (audio.nextStepTime < audio.ctx.currentTime + 0.25) {
          audio.scheduleStep(audio.step, audio.nextStepTime, stepDur);
          audio.step = (audio.step + 1) % 32;
          audio.nextStepTime += stepDur;
        }
      }, 80);
    },
    scheduleStep(step, time, stepDur) {
      const station = audio.station;
      // Bass lines: one pattern per station, in A minor.
      const bassNotes = [
        [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 55, 0, 82.4, 0],
        [55, 55, 0, 55, 0, 65.4, 0, 55, 49, 0, 49, 55, 0, 0, 73.4, 0],
        [110, 0, 0, 110, 0, 0, 98, 0, 0, 0, 110, 0, 0, 123.5, 0, 0],
      ];
      const leadNotes = [
        [220, 0, 261.6, 0, 329.6, 0, 261.6, 0, 220, 0, 0, 329.6, 0, 0, 392, 0],
        [0, 220, 0, 0, 261.6, 0, 220, 0, 0, 196, 0, 220, 0, 0, 0, 0],
        [440, 0, 0, 0, 415.3, 0, 0, 0, 392, 0, 0, 0, 440, 0, 0, 0],
      ];
      const idx = step % 16;
      const bass = bassNotes[station][idx];
      const lead = leadNotes[station][idx];
      const note = (freq, dur, type, vol) => {
        if (!freq) return;
        const osc = audio.ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        const g = audio.ctx.createGain();
        g.gain.setValueAtTime(vol, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + dur);
        osc.connect(g);
        g.connect(audio.master);
        osc.start(time);
        osc.stop(time + dur + 0.02);
      };
      note(bass, stepDur * 1.8, 'triangle', 0.11);
      if (step % 2 === 0) note(lead, stepDur * 0.9, 'sine', 0.045);
      // A soft hat tick on the off-beats of station 1.
      if (station === 1 && step % 2 === 1) {
        const len = Math.floor(audio.ctx.sampleRate * 0.03);
        const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = audio.ctx.createBufferSource();
        src.buffer = buf;
        const g = audio.ctx.createGain();
        g.gain.value = 0.05;
        src.connect(g);
        g.connect(audio.master);
        src.start(time);
      }
    },
  };
  return audio;
}
