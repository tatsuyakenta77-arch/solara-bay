// Solara Bay — all sound is synthesized with WebAudio: no audio files at all.
// Engine hum, two-tone siren, gunshots, pickups, UI blips and a looping synth groove.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.muted = false;
    this.volume = 0.7;
    this.started = false;
    // A mellow coastal groove: Am – F – C – G, eighth-note bass + sparkle arp.
    this.chords = [
      [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62],
    ];
    this.bassNotes = [45, 41, 36, 43];
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
      // Engine: two detuned saws through a lowpass, pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const engineOsc2 = this.ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      this.engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      engineOsc2.start();
      this._engineOsc2 = engineOsc2;
      // Siren: a sine that alternates between two notes.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.started = true;
    } catch { this.ctx = null; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }
  setVolume(v) {
    this.volume = v;
    if (this.master && this.ctx && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  _tone(freq, dur, type, gain, when = 0, slideTo = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  _noise(dur, gain, filterFreq, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t0);
  }

  gunshot() { this._noise(0.16, 0.5, 2400); this._tone(160, 0.09, 'square', 0.25, 0, 60); }
  enemyShot() { this._noise(0.12, 0.25, 1800); }
  punch() { this._noise(0.08, 0.35, 900); }
  reload() { this._tone(900, 0.05, 'square', 0.12); this._tone(620, 0.05, 'square', 0.12, 0.12); }
  pickup() { this._tone(660, 0.09, 'sine', 0.25); this._tone(990, 0.14, 'sine', 0.25, 0.09); }
  cash() { this._tone(880, 0.08, 'triangle', 0.25); this._tone(1174, 0.08, 'triangle', 0.25, 0.08); this._tone(1568, 0.18, 'triangle', 0.25, 0.16); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.28, i * 0.11)); }
  missionFail() { [392, 330, 262].forEach((f, i) => this._tone(f, 0.25, 'sawtooth', 0.14, i * 0.14)); }
  click() { this._tone(700, 0.05, 'square', 0.12); }
  skid() { this._noise(0.25, 0.18, 1400); }
  crash() { this._noise(0.3, 0.5, 700); this._tone(90, 0.25, 'sine', 0.4, 0, 40); }
  horn() { this._tone(370, 0.28, 'square', 0.12); this._tone(466, 0.28, 'square', 0.1); }
  doorSlam() { this._noise(0.1, 0.3, 500); }

  setEngine(speed01, on) {
    if (!this.ctx || !this.engineOsc) return;
    const target = on ? 0.05 + speed01 * 0.09 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    const f = 50 + speed01 * 130;
    this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.06);
    this._engineOsc2.frequency.setTargetAtTime(f * 0.5, this.ctx.currentTime, 0.06);
  }

  setSiren(on) {
    if (!this.ctx || !this.sirenOsc) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.1);
  }

  update(dt, wanted) {
    if (!this.ctx) return;
    // Siren wail: alternate 660 / 880 Hz twice a second while wanted.
    if (wanted > 0) {
      this.sirenTimer += dt;
      if (this.sirenTimer > 0.45) {
        this.sirenTimer = 0;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 880 : 660, this.ctx.currentTime, 0.05);
      }
    }
    // Music: one step every 0.21 s — bass note + occasional arp sparkle.
    this.musicTimer += dt;
    if (this.musicTimer >= 0.21) {
      this.musicTimer -= 0.21;
      const bar = Math.floor(this.musicStep / 8) % 4;
      const stepInBar = this.musicStep % 8;
      const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
      if (stepInBar === 0 || stepInBar === 4) {
        this._musicNote(midi(this.bassNotes[bar] - 12), 0.4, 'triangle', 0.5);
      }
      if (stepInBar % 2 === 0) {
        const chord = this.chords[bar];
        const note = chord[(this.musicStep / 2) % 3 | 0];
        this._musicNote(midi(note + 12), 0.18, 'sine', 0.22);
      }
      if (stepInBar === 7) this._musicNote(midi(this.chords[bar][1] + 24), 0.3, 'sine', 0.14);
      this.musicStep += 1;
    }
  }

  _musicNote(freq, dur, type, gain) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.musicGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
}
