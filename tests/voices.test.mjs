import assert from 'node:assert/strict';
import {
  synthesize,
  chordNotes,
  renderTake,
  encodeWav,
} from '../lib/instrument.ts';
const rate = 48000,
  base = {
    pad: 0,
    time: 0,
    notes: chordNotes({ root: 11, quality: 'major' }),
    label: 'B',
    duration: 2.4,
    volume: 0.7,
  };
const names = ['piano', 'guitar', 'organ'],
  voices = names.map((instrument) => synthesize({ ...base, instrument }, rate));
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const ratio = (a) =>
  rms(a.subarray(rate * 1.5, rate * 1.9)) /
  rms(a.subarray(rate * 0.1, rate * 0.4));
const corr = (a, b) => {
  let ab = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
  }
  return ab / Math.sqrt(aa * bb);
};
assert.ok(ratio(voices[0]) < 0.2, 'Piano rings down.');
assert.ok(ratio(voices[1]) < 0.15, 'Plucked string damps.');
assert.ok(ratio(voices[2]) > 0.9, 'Organ sustains until the release.');
for (let i = 0; i < 3; i++)
  for (let j = i + 1; j < 3; j++)
    assert.ok(
      Math.abs(corr(voices[i], voices[j])) < 0.85,
      'Voices differ in their waveform and envelope.',
    );
// Check the synthesized fundamentals independently at all B chord pitches.
function power(a, f) {
  let re = 0,
    im = 0;
  const begin = Math.round(0.08 * rate),
    end = Math.round(0.8 * rate),
    step = (2 * Math.PI * f) / rate,
    c = Math.cos(step),
    s = Math.sin(step);
  let x = Math.cos(step * begin),
    y = Math.sin(step * begin);
  for (let i = begin; i < end; i++) {
    re += a[i] * x;
    im += a[i] * y;
    const z = x * c - y * s;
    y = y * c + x * s;
    x = z;
  }
  return re * re + im * im;
}
for (const instrument of names)
  for (const midi of [59, 61, 62, 63, 64, 65, 66, 69, 70]) {
    const f = 440 * 2 ** ((midi - 69) / 12),
      pcm = synthesize({ ...base, notes: [midi], instrument }, rate),
      correct = power(pcm, f);
    assert.ok(
      correct > power(pcm, f * 2 ** (1 / 12)) * 20 &&
        correct > power(pcm, f * 2 ** (-1 / 12)) * 20,
      `${instrument} ${midi} retains the correct pitch.`,
    );
    assert.deepEqual(
      pcm,
      synthesize({ ...base, notes: [midi], instrument }, rate),
      'No random difference between live and export.',
    );
  }
// A take keeps the instrument at each trigger, even with later selector changes.
const hits = names.map((instrument, i) => ({
  ...base,
  instrument,
  time: 0.25 + i * 3,
}));
const mixed = renderTake(hits, 8.65, rate),
  wav = new DataView(encodeWav(mixed, rate));
hits.forEach((h, i) => {
  const start = Math.round(h.time * rate);
  for (const t of [0.1, 0.5, 1.8]) {
    const j = Math.round(t * rate);
    assert.equal(mixed[start + j], voices[i][j]);
    const v = wav.getInt16(44 + 2 * (start + j), true);
    assert.ok(Math.abs(v / (v < 0 ? 32768 : 32767) - voices[i][j]) < 1 / 32767);
  }
});
console.log(
  JSON.stringify(
    {
      result:
        'PASS: distinct envelopes/waveforms; all B member pitches in each voice; deterministic live/export samples; mixed-instrument take fidelity.',
      lateEarlyRmsRatio: Object.fromEntries(
        names.map((n, i) => [n, ratio(voices[i])]),
      ),
      correlations: {
        pianoGuitar: corr(voices[0], voices[1]),
        pianoOrgan: corr(voices[0], voices[2]),
        guitarOrgan: corr(voices[1], voices[2]),
      },
    },
    null,
    2,
  ),
);
