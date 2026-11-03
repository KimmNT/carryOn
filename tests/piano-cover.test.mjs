import assert from 'node:assert/strict';
import { test } from 'node:test';
import midiPackage from '@tonejs/midi';
const { Midi } = midiPackage;
import {
  arrangePianoCover,
  updateCoverNote,
  validSections,
  encodeCoverMidi,
} from '../lib/piano-cover.ts';
import { mixTracks } from '../lib/instrument.ts';

const note = (pitchMidi, startTimeSeconds = 0.2, durationSeconds = 0.4) => ({
  pitchMidi,
  startTimeSeconds,
  durationSeconds,
  amplitude: 0.7,
});
test('arrangement preserves accepted pitches and timing across three piano parts', () => {
  const source = [
    note(36),
    note(48),
    note(52),
    note(72),
    note(108, 1.9, 1),
    note(30, 2.1),
    note(109),
    note(40, -1),
    note(60, NaN),
  ];
  const before = structuredClone(source);
  const layers = arrangePianoCover(source, 2);
  assert.deepEqual(
    layers.find((l) => l.part === 'bass').hits.map((h) => h.notes[0]),
    [36],
  );
  assert.deepEqual(
    layers.find((l) => l.part === 'melody').hits.map((h) => h.notes[0]),
    [72, 108],
  );
  assert.deepEqual(
    layers.find((l) => l.part === 'accompaniment').hits.map((h) => h.notes[0]),
    [52, 48],
  );
  assert.equal(layers.flatMap((l) => l.hits).length, 5);
  assert.ok(
    layers
      .flatMap((l) => l.hits)
      .every((h) => h.instrument === 'piano' && h.time + h.duration <= 2),
  );
  assert.deepEqual(source, before);
});
test('note edits reject invalid values and preserve unrelated events', () => {
  const hit = arrangePianoCover([note(72)], 2)[0].hits[0];
  const changed = updateCoverNote(
    hit,
    { pitch: 74, time: 1, duration: 0.5, volume: 0.3 },
    2,
  );
  assert.equal(changed.notes[0], 74);
  assert.equal(changed.time, 1);
  assert.equal(changed.volume, 0.3);
  assert.equal(hit.notes[0], 72);
  for (const edit of [
    { pitch: 109 },
    { pitch: 60.5 },
    { time: -1 },
    { time: 1.9, duration: 0.5 },
    { volume: NaN },
    { duration: 0 },
  ])
    assert.throws(() => updateCoverNote(hit, edit, 2), RangeError);
});
test('sections allow adjacent boundaries and reject overlaps and invalid ranges', () => {
  const sections = [
    { id: '1', name: 'Verse', start: 0, end: 1 },
    { id: '2', name: 'Chorus', start: 1, end: 2 },
  ];
  assert.ok(validSections(sections, 2));
  assert.equal(
    validSections([{ ...sections[0], end: 1.1 }, sections[1]], 2),
    false,
  );
  assert.equal(validSections([{ ...sections[0], name: ' ' }], 2), false);
  assert.equal(validSections([{ ...sections[0], end: 3 }], 2), false);
});
test('layer gain affects the actual mix without modifying note volumes', () => {
  const hits = arrangePianoCover([note(72)], 1)[0].hits;
  const track = { hits, length: 1, trim: [0, 1] };
  const full = mixTracks([track], 8000, 1),
    quiet = mixTracks([{ ...track, gain: 0.25 }], 8000, 1);
  assert.ok(full.some((s) => s !== 0));
  full.forEach((s, i) => assert.ok(Math.abs(quiet[i] - s * 0.25) < 1e-7));
  assert.ok(mixTracks([{ ...track, gain: 0 }], 8000, 1).every((s) => s === 0));
});
test('MIDI export retains separate piano layers, offsets, trims, repeats, and edits', () => {
  const hits = arrangePianoCover([note(72, 0.2, 0.8)], 2)[0].hits;
  const edited = updateCoverNote(hits[0], { pitch: 74 }, 2);
  const midi = new Midi(
    encodeCoverMidi(
      [
        {
          name: 'Melody',
          hits: [edited],
          trim: [0.5, 1.5],
          offset: 0.5,
          loop: true,
        },
        { name: 'Muted', hits: [edited], trim: [0, 2], gain: 0 },
      ],
      2,
    ),
  );
  assert.equal(midi.tracks[0].name, 'Melody');
  assert.equal(midi.tracks[0].instrument.number, 0);
  assert.deepEqual(
    midi.tracks[0].notes.map((n) => n.midi),
    [74, 74],
  );
  assert.ok(Math.abs(midi.tracks[0].notes[0].time - 0.5) < 0.002);
  assert.ok(Math.abs(midi.tracks[0].notes[0].duration - 0.5) < 0.002);
  assert.equal(midi.tracks[1].notes.length, 0);
});
