import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NOTE_KEY_CODES,
  createNoteKeyGate,
  midiNoteAt,
  noteLabel,
  renderTake,
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
