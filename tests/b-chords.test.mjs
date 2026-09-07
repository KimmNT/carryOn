import assert from 'node:assert/strict';
import {
  QUALITIES,
  chordNotes,
  chordNoteNames,
  synthesize,
  renderTake,
  encodeWav,
  scheduleTake,
} from '../lib/instrument.ts';
const expected = {
  major: [59, 63, 66],
  minor: [59, 62, 66],
  maj7: [59, 63, 66, 70],
  min7: [59, 62, 66, 69],
  7: [59, 63, 66, 69],
  sus2: [59, 61, 66],
  sus4: [59, 64, 66],
  dim: [59, 62, 65],
};
const spelling = {
  major: ['B', 'D♯', 'F♯'],
  minor: ['B', 'D', 'F♯'],
  maj7: ['B', 'D♯', 'F♯', 'A♯'],
  min7: ['B', 'D', 'F♯', 'A'],
  7: ['B', 'D♯', 'F♯', 'A'],
  sus2: ['B', 'C♯', 'F♯'],
  sus4: ['B', 'E', 'F♯'],
  dim: ['B', 'D', 'F'],
};
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
let maxPeak = 0,
  maxRmsDelta = 0;
for (const [quality, notes] of Object.entries(expected)) {
  assert.deepEqual(chordNotes({ root: 11, quality }), notes);
  assert.deepEqual(chordNoteNames({ root: 11, quality }), spelling[quality]);
  const below = chordNotes({ root: 10, quality });
  assert.deepEqual(
    notes,
    below.map((n) => n + 1),
  );
  // C is intentionally C3, so B3 -> C3 is an eleven-semitone downward step.
  assert.deepEqual(
    chordNotes({ root: 0, quality }),
    notes.map((n) => n - 11),
  );
  for (const instrument of ['piano', 'guitar', 'organ'])
    for (const rate of [44100, 48000]) {
      const hit = {
        pad: 0,
        time: 0.25,
        notes,
        label: 'B' + quality,
        instrument,
        duration: 2.4,
        volume: 1,
      };
      const pcm = synthesize(hit, rate),
        neighbor = synthesize({ ...hit, notes: below }, rate);
      assert.ok(pcm.every(Number.isFinite));
      const peak = pcm.reduce((p, x) => Math.max(p, Math.abs(x)), 0);
      maxPeak = Math.max(peak, maxPeak);
      assert.ok(peak < 0.25, 'An isolated B chord has ample headroom.');
      const delta = Math.abs(20 * Math.log10(rms(pcm) / rms(neighbor)));
      maxRmsDelta = Math.max(maxRmsDelta, delta);
      assert.ok(delta < 0.3, 'No B-specific loudness jump relative to B flat.');
      assert.ok(
        440 * 2 ** ((Math.max(...notes) - 69) / 12) * 12 < rate / 2,
        'All generated harmonics are below Nyquist.',
      );
      const take = renderTake([hit], 2.65, rate),
        wav = new DataView(encodeWav(take, rate));
      for (const t of [0.07, 0.5, 1.2, 2.39]) {
        const i = Math.floor(t * rate),
          start = Math.round(hit.time * rate);
        assert.equal(take[start + i], pcm[i]);
        const encoded = wav.getInt16(44 + (start + i) * 2, true),
          decoded = encoded / (encoded < 0 ? 32768 : 32767);
        assert.ok(
          Math.abs(decoded - pcm[i]) <= 1 / 32767,
          'WAV retains B samples within 16-bit rounding.',
        );
      }
    }
}
assert.deepEqual(chordNoteNames({ root: 10, quality: 'major' }), [
  'B♭',
  'D',
  'F',
]);
assert.deepEqual(chordNoteNames({ root: 1, quality: 'major' }), [
  'C♯',
  'E♯',
  'G♯',
]);
assert.deepEqual(chordNoteNames({ root: 0, quality: 'off' }), []);
let clock = 10;
const scheduled = [];
const hits = [{ time: 0 }, { time: 0.025 }, { time: 0.8 }, { time: 3 }];
const origin = scheduleTake(
  hits,
  (h) => {
    clock += 0.15;
    return h;
  },
  () => clock,
  (h, time) => {
    assert.ok(time > clock);
    scheduled.push(time);
  },
);
assert.equal(origin, clock + 0.06);
scheduled.forEach((t, i) =>
  assert.ok(Math.abs(t - origin - hits[i].time) < 1e-12),
);
console.log(
  JSON.stringify(
    {
      result:
        'PASS: all 8 B qualities, all 3 instruments at 44.1/48 kHz; mappings, names, headroom, neighboring-root loudness, harmonic limits, WAV fidelity, and scheduling after slow preparation.',
      maxPeak,
      maxRmsDeltaDb: maxRmsDelta,
    },
    null,
    2,
  ),
);
