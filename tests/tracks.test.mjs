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

const looped = mixTracks([{ ...a, loop: true }, b], rate);
assert.equal(looped.length, other.length);
for (let i = 0; i < looped.length; i++)
  assert.ok(Math.abs(looped[i] - (solo[i % solo.length] + other[i])) < 1e-7);
assert.deepEqual(mixTracks([{ ...a, loop: true }], rate), solo);
assert.equal(
  mixTracks([{ hits: [], length: 0, trim: [0, 0], loop: true }], rate).length,
  0,
);
assert.deepEqual([a, b], original);
assert.equal(mixTracks([a], rate, 10).length, 10 * rate);
assert.deepEqual(mixTracks([a], rate, 10).slice(0, solo.length), solo);
assert.ok(
  mixTracks([a], rate, 10)
    .slice(solo.length)
    .every((x) => x === 0),
);
const extended = mixTracks([{ ...a, loop: true }], rate, 2);
assert.equal(extended.length, 2 * rate);
for (let i = 0; i < extended.length; i++)
  assert.equal(extended[i], solo[i % solo.length]);
assert.equal(mixTracks([b], rate, 0.1).length, other.length);
const delayed=mixTracks([{...a,offset:1}],rate,2);
assert.ok(delayed.slice(0,rate).every(x=>x===0));
assert.deepEqual(delayed.slice(rate,rate+solo.length),solo);
const delayedLoop=mixTracks([{...a,offset:1,loop:true}],rate,2);
for(let i=rate;i<delayedLoop.length;i++)assert.equal(delayedLoop[i],solo[(i-rate)%solo.length]);
assert.equal(mixTracks([{...b,offset:30}],rate,10).length,30*rate+other.length);
