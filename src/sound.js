// A loud crash, synthesized: a burst of noise, a low thump, and an inharmonic metal clang,
// through a compressor so a big hit stays loud without clipping. Browsers start audio
// only after a gesture, so the context is created on the first key, click or touch.

let ctx = null;
let out = null;
let noise = null;

function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 6;
    out = ctx.createGain();
    out.gain.value = 1.6;
    out.connect(comp).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}
for (const ev of ['keydown', 'pointerdown', 'touchstart']) addEventListener(ev, unlock, { passive: true });

function envelope(gain, t, peak, decay) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
}

// A two-tone alarm beep. urgency 0..1 raises the pitch as the target gets closer.
export function alarm(urgency) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const f = 880 + urgency * 500;
  for (const [dt, k] of [[0, 1], [0.09, 1.26]]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f * k;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + dt);
    g.gain.exponentialRampToValueAtTime(0.28, t + dt + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.08);
    o.connect(g).connect(out);
    o.start(t + dt);
    o.stop(t + dt + 0.1);
  }
}

// strength 0..1: how hard the hit was, already scaled down for distance by the caller.
export function crash(strength) {
  if (!ctx || ctx.state !== 'running' || strength < 0.02) return;
  const s = Math.min(strength, 1);
  const t = ctx.currentTime;

  // Noise burst, its filter closing as it decays.
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(5000, t);
  lp.frequency.exponentialRampToValueAtTime(300, t + 0.7);
  const ng = ctx.createGain();
  envelope(ng, t, 1.2 * s, 0.75);
  src.connect(lp).connect(ng).connect(out);
  src.start(t);
  src.stop(t + 0.8);

  // Low thump.
  const thump = ctx.createOscillator();
  thump.frequency.setValueAtTime(130, t);
  thump.frequency.exponentialRampToValueAtTime(38, t + 0.3);
  const tg = ctx.createGain();
  envelope(tg, t, 1.4 * s, 0.45);
  thump.connect(tg).connect(out);
  thump.start(t);
  thump.stop(t + 0.5);

  // Metal clang: inharmonic partials that ring a little longer.
  const f0 = 300 + Math.random() * 220;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 250;
  hp.connect(out);
  for (const [k, type, amp] of [[1, 'square', 0.22], [1.48, 'triangle', 0.3], [2.13, 'square', 0.14], [2.94, 'triangle', 0.2], [4.1, 'sine', 0.15]]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0 * k, t);
    o.frequency.exponentialRampToValueAtTime(f0 * k * 0.93, t + 0.9);
    const g = ctx.createGain();
    envelope(g, t, amp * s, 0.5 + Math.random() * 0.5);
    o.connect(g).connect(hp);
    o.start(t);
    o.stop(t + 1.1);
  }
}
