import assert from 'node:assert/strict';
import {
  QUALITIES,
  BASS_NOTES,
  splitQuality,
  joinQuality,
  chordNotes,
  chordLabel,
  chordNoteNames,
  recordedChord,
  replaceRecordedChord,
  renderTake,
} from '../lib/instrument.ts';
for (const quality of Object.keys(QUALITIES)) {
  const { family, extension } = splitQuality(quality);
  assert.equal(joinQuality(family, extension), quality);
}
assert.equal(joinQuality('minor', 'add9'), 'minadd9');
assert.equal(joinQuality('sus2', '7'), 'sus2');
assert.deepEqual(
  chordNotes({ root: 0, quality: 'major', bass: 'G' }),
  [43, 48, 52, 55],
);
assert.deepEqual(
  chordNotes({ root: 2, quality: 'major', bass: 'C♭' }),
  [47, 50, 54, 57],
);
assert.deepEqual(chordNoteNames({ root: 2, quality: 'major', bass: 'F♭' }), [
  'F♭',
  'D',
  'F♯',
  'A',
]);
assert.deepEqual(chordNoteNames({ root: 0, quality: 'minadd9' }), [
  'C',
  'E♭',
  'G',
  'D',
]);
for (let root = 0; root < 12; root++)
  for (const bass of Object.keys(BASS_NOTES)) {
    const chord = { root, quality: 'min7', bass };
    const hit = {
      chord,
      notes: chordNotes(chord),
      label: chordLabel(chord),
      pad: 0,
      time: 0,
      duration: 0.1,
      instrument: 'piano',
      volume: 0.7,
    };
    assert.deepEqual(recordedChord(hit), chord);
    assert.ok(hit.notes[0] < Math.min(...hit.notes.slice(1)));
    const changed = replaceRecordedChord([hit], 0, {
      root,
      quality: 'major',
      bass,
    });
    assert.equal(recordedChord(changed[0]).bass, bass);
    assert.ok(renderTake(changed, 0.1, 8000).every(Number.isFinite));
  }
