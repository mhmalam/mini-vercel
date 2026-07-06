// Original beat-synced score for the demo video. 120 BPM, 4/4 ??? one bar =
// 2s = 60 frames at 30fps, so scene cuts on bar lines land exactly on the
// music's downbeats. Sections mirror the video:
//   0-6s    intro      pads, kick enters bar 2, riser into...
//   6s      IMPACT     terminal scene cut
//   6-12s   groove A   four-on-floor + bass + hats + claps, riser into...
//   12s     IMPACT     pipeline scene cut (stabs every bar = stage flips)
//   12-22s  groove B
//   22s     IMPACT     card scene cut
//   26s     BIG HIT    the "live" flip (extra stab layer joins)
//   30-38s  outro      drums stop, pads resolve and fade
import { writeFileSync, mkdirSync } from "node:fs";

const SR = 44100;
const DUR = 46;
const N = SR * DUR;
const L = new Float64Array(N);
const R = new Float64Array(N);
const BEAT = 0.5; // 120 bpm
const BAR = 2.0;

const note = (s) => 440 * Math.pow(2, s / 12);
// semitones from A4 ??? roots + triads, cycling one chord per bar
const PROG = [
  { root: -24, triad: [-12, -9, -5] }, // Am
  { root: -28, triad: [-16, -12, -7] }, // F
  { root: -33, triad: [-21, -17, -12] }, // C
  { root: -26, triad: [-14, -10, -7] }, // G
];
const chordAt = (t) => PROG[Math.floor(t / BAR) % 4];

const add = (i, l, r) => {
  if (i >= 0 && i < N) {
    L[i] += l;
    R[i] += r;
  }
};

// ---------- instruments ----------

const kick = (t0, gain = 1) => {
  const s0 = Math.floor(t0 * SR);
  for (let i = 0; i < SR * 0.3; i++) {
    const t = i / SR;
    const f = 110 * Math.exp(-t * 28) + 44;
    const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 14) * 0.5 * gain;
    add(s0 + i, v, v);
  }
};

const hat = (t0, gain = 1) => {
  const s0 = Math.floor(t0 * SR);
  let lp = 0;
  for (let i = 0; i < SR * 0.04; i++) {
    const t = i / SR;
    const n = Math.random() * 2 - 1;
    lp = lp * 0.55 + n * 0.45;
    const v = (n - lp) * Math.exp(-t * 120) * 0.09 * gain;
    add(s0 + i, v * 0.7, v * 1.1);
  }
};

const clap = (t0, gain = 1) => {
  const s0 = Math.floor(t0 * SR);
  let bp = 0;
  for (let i = 0; i < SR * 0.16; i++) {
    const t = i / SR;
    const n = Math.random() * 2 - 1;
    bp = bp * 0.8 + n * 0.2;
    const flam = 1 + 0.5 * Math.sin(t * 300); // loose double-hit feel
    const v = (n - bp) * Math.exp(-t * 26) * 0.16 * flam * gain;
    add(s0 + i, v * 1.05, v * 0.85);
  }
};

const bass = (t0, semis, len, gain = 1) => {
  const s0 = Math.floor(t0 * SR);
  const f = note(semis);
  for (let i = 0; i < SR * len; i++) {
    const t = i / SR;
    const e = Math.min(1, t / 0.008) * Math.exp(-t * 7) * 0.22 * gain;
    // sine + a touch of 2nd harmonic for definition on small speakers
    const v =
      e * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t));
    add(s0 + i, v, v);
  }
};

const stab = (t0, triad, gain = 1, len = 0.22) => {
  const s0 = Math.floor(t0 * SR);
  for (const s of triad) {
    const f = note(s);
    const ph = Math.random() * 6.28;
    for (let i = 0; i < SR * len; i++) {
      const t = i / SR;
      const e = Math.min(1, t / 0.005) * Math.exp(-t * 16) * 0.085 * gain;
      const v = e * Math.sin(2 * Math.PI * f * t + ph);
      add(s0 + i, v * (s % 2 ? 1.1 : 0.8), v * (s % 2 ? 0.8 : 1.1));
    }
  }
};

const pad = (t0, triad, len, gain = 1) => {
  const s0 = Math.floor(t0 * SR);
  for (const s of triad) {
    const f = note(s);
    const phL = Math.random() * 6.28;
    const phR = Math.random() * 6.28;
    for (let i = 0; i < SR * len; i++) {
      const t = i / SR;
      const e =
        Math.min(1, t / 1.2) * Math.min(1, (len - t) / 1.2) * 0.05 * gain;
      add(
        s0 + i,
        e * Math.sin(2 * Math.PI * f * 0.999 * t + phL),
        e * Math.sin(2 * Math.PI * f * 1.001 * t + phR),
      );
    }
  }
};

const riser = (t0, len = 1.5, gain = 1) => {
  const s0 = Math.floor(t0 * SR);
  let lp = 0;
  for (let i = 0; i < SR * len; i++) {
    const t = i / SR;
    const p = t / len;
    const n = Math.random() * 2 - 1;
    lp = lp * (0.95 - 0.5 * p) + n * (0.05 + 0.5 * p); // opens up as it rises
    const v = lp * p * p * 0.16 * gain;
    add(s0 + i, v * (1 - p * 0.3), v);
  }
};

const impact = (t0, gain = 1) => {
  kick(t0, 1.5 * gain);
  const s0 = Math.floor(t0 * SR);
  for (let i = 0; i < SR * 0.7; i++) {
    const t = i / SR;
    const boom =
      Math.sin(2 * Math.PI * 52 * t) * Math.exp(-t * 5) * 0.3 * gain;
    const splash = (Math.random() * 2 - 1) * Math.exp(-t * 18) * 0.1 * gain;
    add(s0 + i, boom + splash, boom + splash * 0.8);
  }
};

// ---------- arrangement ----------

// pads run throughout, one chord per bar
for (let bar = 0; bar < DUR / BAR; bar++) {
  const t = bar * BAR;
  const c = chordAt(t);
  const fadeTail = t >= 38 ? 1.15 : 1; // let the outro pads breathe
  pad(t, c.triad, BAR + 0.4, fadeTail);
  pad(t, [c.root + 12], BAR + 0.4, 0.7); // octave root warmth
}

// intro: kick establishes on bar 2 (t=2s), half-time feel
for (let t = 2; t < 6; t += 1) kick(t, 0.8);
riser(4.5, 1.5, 0.9);
impact(6);

// groove sections: 6-30s
for (let t = 6; t < 38; t += BEAT) {
  const beatInBar = Math.round(((t % BAR) / BEAT) % 4);
  kick(t, 1);
  hat(t + BEAT / 2, 0.9);
  if (beatInBar === 1 || beatInBar === 3) clap(t, 0.9);
  // bass: root eighths with a passing octave on the last eighth of the bar
  const c = chordAt(t);
  bass(t, c.root, 0.24);
  bass(t + BEAT / 2, t % BAR > 1.4 ? c.root + 12 : c.root, 0.2, 0.8);
}

// stabs on every bar downbeat once the pipeline scene starts (12s) ???
// these are the accents the stage-flips cut on
for (let t = 12; t < 38; t += BAR) {
  const c = chordAt(t);
  stab(t, c.triad, t >= 26 ? 1.4 : 1);
  if (t >= 26) stab(t + 0.0, c.triad.map((s) => s + 12), 0.8, 0.3); // opened-up layer after "live"
}

// section transitions
riser(10.5, 1.5, 1);
impact(12, 1.1);
riser(20.5, 1.5, 1);
impact(22, 1.1);
riser(24.7, 1.3, 1.1);
impact(26, 1.5); // the "live" flip ??? biggest moment
// outro: last kick at 30, everything else decays
impact(30, 1.1);
riser(36.5, 1.5, 1);
impact(38, 1.2);

// ---------- master ----------
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 0.05) * Math.min(1, (DUR - t) / 3.5);
  L[i] = Math.tanh(L[i] * 1.25) * fade * 0.88;
  R[i] = Math.tanh(R[i] * 1.25) * fade * 0.88;
}

const bytes = Buffer.alloc(44 + N * 4);
bytes.write("RIFF", 0);
bytes.writeUInt32LE(36 + N * 4, 4);
bytes.write("WAVEfmt ", 8);
bytes.writeUInt32LE(16, 16);
bytes.writeUInt16LE(1, 20);
bytes.writeUInt16LE(2, 22);
bytes.writeUInt32LE(SR, 24);
bytes.writeUInt32LE(SR * 4, 28);
bytes.writeUInt16LE(4, 32);
bytes.writeUInt16LE(16, 34);
bytes.write("data", 36);
bytes.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  bytes.writeInt16LE(Math.max(-32768, Math.min(32767, (L[i] * 32767) | 0)), 44 + i * 4);
  bytes.writeInt16LE(Math.max(-32768, Math.min(32767, (R[i] * 32767) | 0)), 46 + i * 4);
}
mkdirSync("public", { recursive: true });
writeFileSync("public/music.wav", bytes);
console.log("wrote public/music.wav ??? 120bpm, beat-locked to the edit");
