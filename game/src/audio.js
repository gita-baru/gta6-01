// Solmar Heat — all sound is synthesized with WebAudio: engine, sirens,
// gunfire and a three-station radio. Nothing is loaded from a file.
import { RADIO_STATIONS } from "./config.js";

const NOTES = {
  // Minor-key synthwave arpeggio (A minor).
  0: [220, 261.6, 329.6, 392, 440, 523.2, 392, 329.6],
  // Driving bassline (E minor).
  1: [82.4, 82.4, 123.5, 98, 82.4, 146.8, 123.5, 98],
  // Slow ambient pads (C major 7).
  2: [261.6, 329.6, 392, 493.9, 329.6, 261.6],
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.station = 0;
    this.step = 0;
    this.nextNoteT = 0;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.radioGain = null;
  }

  ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.value = 60;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 700;
      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = "square";
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.radioGain = this.ctx.createGain();
      this.radioGain.gain.value = 0.16;
      this.radioGain.connect(this.master);
      this.nextNoteT = this.ctx.currentTime + 0.1;
    } catch {
      this.ctx = null;
      return false;
    }
    return true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  nextStation() {
    this.station = (this.station + 1) % RADIO_STATIONS.length;
    this.step = 0;
    return RADIO_STATIONS[this.station];
  }

  stationName() {
    return RADIO_STATIONS[this.station];
  }

  blip(freq, dur, type = "sine", vol = 0.25, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst(dur, vol = 0.4) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(this.master);
    src.start();
  }

  playFx(type) {
    if (!this.ctx || this.muted) return;
    if (type === "shot") this.noiseBurst(0.14, 0.5);
    else if (type === "punch") this.blip(110, 0.12, "sine", 0.4);
    else if (type === "pickup") {
      this.blip(660, 0.12, "sine", 0.25);
      this.blip(880, 0.2, "sine", 0.25, 0.1);
    } else if (type === "paid") {
      this.blip(523, 0.12, "triangle", 0.3);
      this.blip(659, 0.12, "triangle", 0.3, 0.1);
      this.blip(784, 0.25, "triangle", 0.3, 0.2);
    } else if (type === "dry") this.blip(1400, 0.05, "square", 0.12);
    else if (type === "hit") this.blip(90, 0.15, "sine", 0.4);
    else if (type === "fail") {
      this.blip(392, 0.2, "sawtooth", 0.2);
      this.blip(311, 0.3, "sawtooth", 0.2, 0.18);
    }
  }

  update(S, dt) {
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    const speed = S.player.onFoot ? 0 : Math.abs(S.player.car ? S.player.car.speed : 0);
    this.engineOsc.frequency.value = 55 + speed * 3.2;
    this.engineGain.gain.value = S.player.onFoot ? 0 : 0.05 + Math.min(0.09, speed * 0.002);
    const wanted = S.wanted >= 1;
    this.sirenGain.gain.value = wanted ? 0.035 : 0;
    if (wanted) this.sirenOsc.frequency.value = Math.sin(S.time * 4) > 0 ? 720 : 950;
    // Radio: schedule the station's pattern one note at a time.
    const stepDur = this.station === 2 ? 0.55 : 0.24;
    while (this.nextNoteT < this.ctx.currentTime + 0.25) {
      const notes = NOTES[this.station];
      const freq = notes[this.step % notes.length];
      const type = this.station === 1 ? "square" : this.station === 2 ? "triangle" : "sawtooth";
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      const t = this.nextNoteT;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(this.station === 2 ? 0.1 : 0.14, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 0.95);
      o.connect(g);
      g.connect(this.radioGain);
      o.start(t);
      o.stop(t + stepDur);
      this.step++;
      this.nextNoteT += stepDur;
    }
    void dt;
  }
}
