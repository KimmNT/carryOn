import assert from 'node:assert/strict';
import {
  QUALITIES,
  chordNotes,
  chordLabel,
  recordedChord,
  replaceRecordedChord,
  renderTake,
  trimAudio,
  encodeWav,
} from '../lib/instrument.ts';
for (let root = 0; root < 12; root++)
  for (const quality of Object.keys(QUALITIES).filter((q) => q !== 'off')) {
    const pad = { root, quality };
    assert.deepEqual(recordedChord({ notes: chordNotes(pad) }), pad);
  }
const old = {
  pad: 2,
  time: 0.375,
  notes: chordNotes({ root: 4, quality: '7' }),
  label: 'E7',
  instrument: 'guitar',
  duration: 2.4,
  volume: 0.7,
};
const original = [old, { ...old, time: 3.1 }],
  saved = structuredClone(original),
  rate = 44100;
const changed = replaceRecordedChord(original, 0, {
  root: 2,
  quality: 'major',
});
assert.equal(changed[0].label, 'D');
assert.deepEqual(changed[0].notes, [50, 54, 57]);
assert.equal(changed[1], original[1]);
for (const field of ['time', 'instrument', 'duration', 'volume', 'pad'])
  assert.equal(changed[0][field], old[field]);
assert.deepEqual(original, saved);
const expected = [{ ...old, label: 'D', notes: [50, 54, 57] }, original[1]];
assert.deepEqual(renderTake(changed, 6, rate), renderTake(expected, 6, rate));
const before = renderTake(original, 6, rate),
  after = renderTake(changed, 6, rate);
assert.deepEqual(
  before.subarray(3 * rate),
  after.subarray(3 * rate),
  'Only the selected occurrence changes audio.',
);
assert.notDeepEqual(
  before.subarray(rate, 2 * rate),
  after.subarray(rate, 2 * rate),
);
const selected = trimAudio(after, rate, 0.6, 1.6);
assert.equal(selected.length, rate);
assert.deepEqual(
  selected,
  after.slice(Math.round(0.6 * rate), Math.round(1.6 * rate)),
);
assert.equal(
  new DataView(encodeWav(selected, rate)).getUint32(40, true),
  rate * 2,
);
const undone = changed.map((hit, i) => (i === 0 ? old : hit));
assert.deepEqual(undone, original);
assert.deepEqual(renderTake(undone, 6, rate), before);
assert.throws(
  () => replaceRecordedChord(original, 2, { root: 2, quality: 'major' }),
  RangeError,
);
assert.throws(
  () => replaceRecordedChord(original, 0, { root: 2, quality: 'off' }),
  RangeError,
);
console.log(
  'PASS: E7 to D major, occurrence isolation, exact timing/sound settings, immutable original, corrected render/trim/WAV, undo restoration, all chord qualities.',
);
