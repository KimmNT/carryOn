import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  groupPianoEvents,
  identifyPianoChord,
  parsePianoNotes,
  editPianoEvent,
  positionPianoEvents,
} from '../lib/session-events.ts';
import { renderTake } from '../lib/instrument.ts';

const hit = (pitch, time = 0, duration = 0.5, volume = 0.7) => ({
  pad: -1,
  time,
  duration,
  volume,
  notes: [pitch],
  label: 'test',
  instrument: 'piano',
});
test('groups simultaneous notes into exact named chords without changing the audio', () => {
  const hits = [hit(48), hit(52, 0.025, 0.6), hit(55, 0.05), hit(72, 1)];
  const original = structuredClone(hits);
  const before = renderTake(hits, 2, 8000);
  const events = groupPianoEvents(hits);
  assert.equal(events.length, 2);
  assert.equal(events[0].label, 'C');
  assert.deepEqual(events[0].indices, [0, 1, 2]);
  assert.deepEqual(events[1].notes, [72]);
  assert.deepEqual(hits, original);
  assert.deepEqual(renderTake(hits, 2, 8000), before);
  assert.deepEqual(identifyPianoChord([52, 55, 60]), {
    root: 0,
    quality: 'major',
  });
  assert.equal(groupPianoEvents([hit(52), hit(55), hit(60)])[0].label, 'C/E');
  assert.equal(identifyPianoChord([60, 61, 62]), undefined);
});
test('grouping does not chain adjacent melody notes into one long block', () => {
  const events = groupPianoEvents([hit(60, 0), hit(64, 0.05), hit(67, 0.1)]);
  assert.equal(events.length, 2);
  assert.deepEqual(events[0].indices, [0, 1]);
});
test('block timing edits preserve individual voices and isolate unrelated notes', () => {
  const hits = [
    hit(48, 0, 0.4, 0.5),
    hit(52, 0.02, 0.6, 0.8),
    hit(55, 0.04, 0.5, 0.7),
    hit(72, 2, 0.5, 0.9),
  ];
  const original = structuredClone(hits),
    event = groupPianoEvents(hits)[0];
  const changed = editPianoEvent(
    hits,
    event,
    { time: 0.5, duration: event.duration * 2 },
    3,
  );
  assert.equal(changed[0].time, 0.5);
  assert.equal(changed[1].time, 0.54);
  assert.equal(changed[1].duration, 1.2);
  assert.equal(changed[1].volume, 0.8);
  assert.strictEqual(changed[3], hits[3]);
  assert.deepEqual(hits, original);
  const replaced = editPianoEvent(hits, event, { notes: [50, 53, 57] }, 3);
  assert.equal(replaced.length, 2);
  assert.deepEqual(replaced[0].notes, [50, 53, 57]);
  assert.strictEqual(replaced[1], hits[3]);
  assert.throws(
    () => editPianoEvent(hits, event, { time: 2.9 }, 3),
    RangeError,
  );
});
test('accepts specific notes and MIDI numbers with valid piano bounds', () => {
  assert.deepEqual(parsePianoNotes('C4 E4 G4'), [60, 64, 67]);
  assert.deepEqual(parsePianoNotes('60, 64, 67'), [60, 64, 67]);
  assert.deepEqual(parsePianoNotes('Bb2 F#3'), [46, 54]);
  for (const text of ['', 'H4', 'C9', '20', '60.5'])
    assert.throws(() => parsePianoNotes(text), RangeError);
});
test('timeline blocks respect trims, offsets, silence, overlaps and loop boundaries', () => {
  const events = groupPianoEvents([
    hit(60, 0, 0.8),
    hit(64, 0.2, 0.7),
    hit(67, 1.5, 0.3),
  ]);
  const { blocks, lanes } = positionPianoEvents(
    events,
    [0.1, 1],
    0.5,
    2.1,
    true,
  );
  assert.equal(blocks.length, 4);
  assert.equal(lanes, 2);
  assert.equal(blocks[0].start, 0.5);
  assert.equal(blocks[0].end, 1.2);
  assert.ok(blocks.every((b) => b.end <= 2.1));
  assert.equal(blocks[2].repeat, 1);
  assert.deepEqual(positionPianoEvents(events, [2, 2], 0, 3).blocks, []);
});
