import assert from 'node:assert/strict';
import { chordNotes, chordNoteNames, chordLabel } from '../lib/instrument.ts';
for (let root = 0; root < 12; root++) {
  assert.deepEqual(
    chordNotes({ root, quality: 'add9' }),
    [0, 4, 7, 14].map((n) => 48 + root + n),
  );
  assert.deepEqual(
    chordNotes({ root, quality: '6' }),
    [0, 4, 7, 9].map((n) => 48 + root + n),
  );
}
assert.deepEqual(chordNoteNames({ root: 0, quality: 'add9' }), [
  'C',
  'E',
  'G',
  'D',
]);
assert.deepEqual(chordNoteNames({ root: 0, quality: '6' }), [
  'C',
  'E',
  'G',
  'A',
]);
assert.deepEqual(chordNoteNames({ root: 2, quality: 'add9' }), [
  'D',
  'F♯',
  'A',
  'E',
]);
assert.deepEqual(chordNoteNames({ root: 2, quality: '6' }), [
  'D',
  'F♯',
  'A',
  'B',
]);
assert.equal(chordLabel({ root: 0, quality: 'add9' }), 'Cadd9');
assert.equal(chordLabel({ root: 0, quality: '6' }), 'C6');
console.log(
  'PASS: add9 and major-sixth intervals across all roots, labels and note spellings.',
);
