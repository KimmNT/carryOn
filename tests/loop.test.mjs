import assert from 'node:assert/strict';
import { playbackPosition, trimAudio } from '../lib/instrument.ts';
assert.equal(playbackPosition(0, 6, true), 0);
assert.equal(playbackPosition(6, 6, true), 0);
assert.equal(playbackPosition(13.5, 6, true), 1.5);
assert.equal(playbackPosition(13.5, 6, false), 6);
assert.equal(playbackPosition(-0.05, 6, true), 0);
assert.equal(playbackPosition(3, 0, true), 0);
const original = Float32Array.from({ length: 100 }, (_, i) => i);
const selection = trimAudio(original, 10, 2, 8);
assert.equal(selection.length / 10, 6);
assert.equal(selection[0], 20);
assert.equal(selection.at(-1), 79);
assert.equal(selection[Math.floor(playbackPosition(6, 6, true) * 10)], 20);
assert.equal(original.length, 100);
console.log(
  'PASS: selected-range loop wraps on the audio clock; one-shot ends; full take remains unchanged.',
);
