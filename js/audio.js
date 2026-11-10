// Procedural ambient: soft wind + sparse pentatonic plucks (WebAudio, off by default). Original.
export class Ambient {
  constructor() { this.on = false; this.ctx = null; }
  init() {
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = 0; this.master.connect(C.destination);
    const rev = C.createConvolver(); const len = C.sampleRate * 3.2, ir = C.createBuffer(2, len, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    rev.buffer = ir; this.rev = C.createGain(); this.rev.gain.value = .55; this.rev.connect(rev); rev.connect(this.master);
    const nb = C.createBuffer(1, C.sampleRate * 4, C.sampleRate), nd = nb.getChannelData(0); let b = 0;
    for (let i = 0; i < nd.length; i++) { b = (b + .02 * (Math.random() * 2 - 1)) / 1.02; nd[i] = b * 3.5; }
    const ns = C.createBufferSource(); ns.buffer = nb; ns.loop = true; const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = .6;
    const lfo = C.createOscillator(), lg = C.createGain(); lfo.frequency.value = .07; lg.gain.value = 220; lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
    const wg = C.createGain(); wg.gain.value = .22; ns.connect(bp); bp.connect(wg); wg.connect(this.master); ns.start();
    const scale = [220, 246.94, 277.18, 329.63, 369.99, 440, 493.88, 554.37];
    const pluck = () => { if (!this.on) return; const t = C.currentTime, f = scale[Math.floor(Math.random() * scale.length)] * (Math.random() < .3 ? .5 : 1);
      const o = C.createOscillator(), o2 = C.createOscillator(), g = C.createGain(), lp = C.createBiquadFilter(); o.type = 'triangle'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.01;
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(500, t + 1.5);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .008); g.gain.exponentialRampToValueAtTime(.0008, t + 3.2);
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master); g.connect(this.rev); o.start(t); o2.start(t); o.stop(t + 3.3); o2.stop(t + 3.3);
      this.tm = setTimeout(pluck, 1400 + Math.random() * 2600); };
    this.pluck = pluck;
  }
  toggle() { if (!this.ctx) this.init(); this.on = !this.on; const C = this.ctx, t = C.currentTime;
    if (this.on) { C.resume(); this.master.gain.cancelScheduledValues(t); this.master.gain.setTargetAtTime(.5, t, .6); clearTimeout(this.tm); this.pluck(); }
    else { this.master.gain.cancelScheduledValues(t); this.master.gain.setTargetAtTime(0, t, .3); clearTimeout(this.tm); }
    return this.on; }
}
// micro-sounds (only audible when ambient sound is on): soft wood tick for hovers, ink "plop" for drops
Ambient.prototype.tick = function () { if (!this.on || !this.ctx) return; const C = this.ctx, t = C.currentTime; if (t - (this._lt || 0) < .06) return; this._lt = t;
  const o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(900, t + .03);
  g.gain.setValueAtTime(.05, t); g.gain.exponentialRampToValueAtTime(.0005, t + .06); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + .07); };
Ambient.prototype.plop = function () { if (!this.on || !this.ctx) return; const C = this.ctx, t = C.currentTime;
  const o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(140, t + .18);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.18, t + .01); g.gain.exponentialRampToValueAtTime(.0008, t + .35); o.connect(g); g.connect(this.master); g.connect(this.rev); o.start(t); o.stop(t + .4); };
