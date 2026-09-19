import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NOTE_KEY_CODES,
  createNoteKeyGate,
  midiNoteAt,
  noteLabel,
  renderTake,
  synthesize,
  CHORD_RELEASE_SECONDS,
  chordNotes,
  DEFAULT_PADS,
} from '../lib/instrument.ts';

test('the 25-key controller spans two octaves and the next C', () => {
  assert.equal(NOTE_KEY_CODES.length, 25);
  assert.equal(midiNoteAt(0, 3), 48);
  assert.equal(noteLabel(midiNoteAt(0, 3)), 'C3');
  assert.equal(noteLabel(midiNoteAt(12, 3)), 'C4');
  assert.equal(noteLabel(midiNoteAt(24, 3)), 'C5');
  assert.equal(noteLabel(midiNoteAt(1, 3)), 'C♯3');
});

test('the note keyboard gate follows the agreed shortcuts', () => {
  const gate = createNoteKeyGate();
  assert.equal(gate.down('KeyZ', false), 0);
  assert.equal(gate.down('KeyZ', true), -1);
  assert.equal(gate.down('KeyZ', false), -1);
  gate.up('KeyZ');
  assert.equal(gate.down('KeyZ', false), 0);
  assert.equal(gate.down('Digit2', false), 13);
  assert.equal(gate.down('KeyI', false), 24);
  assert.equal(gate.down('Digit1', false), -1);
});

test('a recorded single note renders through the take pipeline', () => {
  const samples = renderTake(
    [
      {
        pad: 0,
        time: 0,
        notes: [60],
        label: 'C4',
        instrument: 'piano',
        duration: 0.5,
        volume: 0.7,
      },
    ],
    0.5,
    44100,
  );
  assert.equal(samples.length, 22050);
  assert.ok(samples.some((sample) => sample !== 0));
});

test('held notes and chords remain audible until release and fade afterward', () => {
  const heldFor = 1.2;
  for (const notes of [[60], chordNotes(DEFAULT_PADS[0])]) {
    for (const instrument of ['piano', 'guitar', 'organ']) {
      const samples = synthesize(
        {
          pad: 0,
          time: 0,
          notes,
          label: 'Held',
          instrument,
          heldFor,
          duration: heldFor + CHORD_RELEASE_SECONDS,
          volume: 0.7,
        },
        44100,
      );
      const held = samples.subarray(0.9 * 44100, 1.0 * 44100);
      const average =
        held.reduce((sum, sample) => sum + sample * sample, 0) / held.length;
      assert.ok(average > 0.00001, `${instrument} remains audible`);
      const release = samples.subarray(
        Math.floor((heldFor + 0.17) * 44100),
        Math.floor((heldFor + 0.23) * 44100),
      );
      const releaseEnergy =
        release.reduce((sum, sample) => sum + sample * sample, 0) /
        release.length;
      assert.ok(releaseEnergy > 0.000005, `${instrument} has a soft tail`);
      assert.ok(Math.abs(samples.at(-1)) < 0.0001);
    }
  }
});
