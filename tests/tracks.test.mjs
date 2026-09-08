import assert from 'node:assert/strict';
import { mixTracks, renderTake, trimAudio } from '../lib/instrument.ts';
const rate = 8000;
const hit = {
  pad: 0,
  time: 0.1,
  notes: [48, 52, 55],
  label: 'C',
  instrument: 'piano',
  duration: 0.5,
  volume: 0.2,
};
const a = { hits: [hit], length: 1, trim: [0.2, 0.8] };
const b = {
  hits: [{ ...hit, instrument: 'guitar', time: 0.25 }],
  length: 1.2,
  trim: [0.1, 1.2],
};
const original = structuredClone([a, b]);
const solo = trimAudio(renderTake(a.hits, a.length, rate), rate, ...a.trim);
assert.deepEqual(mixTracks([a], rate), solo);
const other = trimAudio(renderTake(b.hits, b.length, rate), rate, ...b.trim);
const mixed = mixTracks([a, b], rate);
assert.equal(mixed.length, other.length);
for (let i = 0; i < mixed.length; i++)
  assert.ok(Math.abs(mixed[i] - ((solo[i] ?? 0) + other[i])) < 1e-7);
assert.deepEqual([a, b], original);
assert.equal(mixTracks([], rate).length, 0);
assert.deepEqual(
  mixTracks([a, { hits: [], length: 0, trim: [0, 0] }], rate),
  solo,
);
assert.ok(
  mixTracks(Array(100).fill(a), rate).every(
    (x) => Number.isFinite(x) && Math.abs(x) <= 1,
  ),
);
