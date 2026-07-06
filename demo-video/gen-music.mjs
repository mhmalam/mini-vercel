// Generates an original ambient-electronic bed for the demo video.
// Pure synthesis (sine pads + sub bass + noise ticks) -> 16-bit stereo WAV.
// Composition: Am -> F -> C -> G, twice, ~85 BPM feel, 40s, fades in/out.
import { writeFileSync, mkdirSync } from "node:fs";

const SR = 44100;
const DUR = 40;
const N = SR * DUR;
const L = new Float64Array(N);
const R = new Float64Array(N);

const note = (semisFromA4) => 440 * Math.pow(2, semisFromA4 / 12);
// chord tones as semitone offsets from A4
const CHORDS = [
  [-24, -12, -9, -5, 0], // A minor  (A2 A3 C4 E4 A4)
  [-28, -16, -12, -7, -4], // F major (F2 F3 A3 C4 F4... voiced close)
  [-33, -21, -17, -12, -9], // C major (C2 C3 E3 G3 C4)
  [-26, -14, -10, -7, -2], // G major (G2 G3 B3 D4 G4)
];
const SEG = DUR / 8; // 8 chord segments

const env = (t, len, a, r) => {
  if (t < 0 || t > len) return 0;
  const att = Math.min(1, t / a);
  const rel = Math.min(1, (len - t) / r);
  return Math.min(att, rel);
};

for (let seg = 0; seg < 8; seg++) {
  const chord = CHORDS[seg % 4];
  const start = seg * SEG;
  const s0 = Math.floor(start * SR);
  const s1 = Math.floor((start + SEG) * SR);

  // --- pad: detuned sines per chord tone, slow swell ---
  for (const semis of chord.slice(1)) {
    const f = note(semis);
    const phL = Math.random() * Math.PI * 2;
    const phR = Math.random() * Math.PI * 2;
    for (let i = s0; i < s1 && i < N; i++) {
      const t = i / SR - start;
      const e = env(t, SEG, 1.6, 1.8) * 0.055;
      const tt = i / SR;
      L[i] += e * Math.sin(2 * Math.PI * f * 0.9990 * tt + phL);
      R[i] += e * Math.sin(2 * Math.PI * f * 1.0011 * tt + phR);
      // soft octave shimmer
      L[i] += e * 0.25 * Math.sin(2 * Math.PI * f * 2.001 * tt + phR);
      R[i] += e * 0.25 * Math.sin(2 * Math.PI * f * 1.999 * tt + phL);
    }
  }

  // --- sub bass: root, pulsing every 0.625s (96bpm-ish eighth feel) ---
  const rootF = note(chord[0]);
  for (let b = 0; b < SEG / 0.625; b++) {
    const bStart = start + b * 0.625;
    const bs = Math.floor(bStart * SR);
    for (let i = bs; i < bs + SR * 0.6 && i < N; i++) {
      const t = i / SR - bStart;
      const e = Math.exp(-t * 4.5) * 0.16;
      const tt = i / SR;
      const v = e * Math.sin(2 * Math.PI * rootF * tt);
      L[i] += v;
      R[i] += v;
    }
  }

  // --- tick: tiny filtered-noise hat every 1.25s, offbeat ---
  for (let b = 0; b < SEG / 1.25; b++) {
    const tStart = start + b * 1.25 + 0.625;
    const ts = Math.floor(tStart * SR);
    let lp = 0;
    for (let i = ts; i < ts + SR * 0.05 && i < N; i++) {
      const t = i / SR - tStart;
      const noise = Math.random() * 2 - 1;
      lp = lp * 0.6 + noise * 0.4; // crude high-ish band
      const v = (noise - lp) * Math.exp(-t * 90) * 0.05;
      L[i] += v * 0.8;
      R[i] += v * 1.1;
    }
  }
}

// master fades + gentle soft-clip
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 1.5) * Math.min(1, (DUR - t) / 3);
  L[i] = Math.tanh(L[i] * 1.2) * fade * 0.85;
  R[i] = Math.tanh(R[i] * 1.2) * fade * 0.85;
}

// --- write WAV (16-bit PCM stereo) ---
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
console.log("wrote public/music.wav", (bytes.length / 1024 / 1024).toFixed(1), "MB");
