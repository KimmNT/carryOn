import assert from 'node:assert/strict';
import {
  createKeyGate,
  synthesize,
  renderTake,
  encodeWav,
  takeLength,
  chordNotes,
  DEFAULT_PADS,
} from '../lib/instrument.ts';
const gate = createKeyGate();
assert.equal(gate.down('Digit1', false), 0);
assert.equal(gate.down('Digit1', true), -1);
assert.equal(gate.down('Digit1', false), -1);
gate.up('Digit1');
assert.equal(gate.down('Digit1', false), 0);
assert.equal(gate.down('Digit0', false), 9);
gate.clear();
assert.equal(gate.down('Digit1', false), 0);
assert.equal(gate.down('KeyA', false), -1);
const rate = 44100;
const first = {
  pad: 0,
  time: 0.375,
  notes: chordNotes(DEFAULT_PADS[0]),
  label: 'C',
  instrument: 'piano',
  duration: 0.8,
  volume: 0.7,
};
const second = {
  ...first,
  pad: 2,
  time: 1.7,
  notes: chordNotes(DEFAULT_PADS[2]),
  label: 'Am',
  instrument: 'guitar',
  duration: 1.2,
};
const hits = [first, second];
assert.equal(takeLength(hits, 2), 2.9);
assert.equal(takeLength(hits, 4), 4);
const pcm = renderTake(hits, 4, rate);
assert.ok(pcm.subarray(0, Math.round(first.time * rate)).every((x) => x === 0));
assert.ok(
  pcm
    .subarray(Math.ceil(1.176 * rate), Math.floor(1.7 * rate))
    .every((x) => x === 0),
);
assert.ok(pcm.subarray(Math.ceil(2.901 * rate)).every((x) => x === 0));
assert.ok(pcm.some((x) => Math.abs(x) > 0.01));
const single = synthesize(first, rate),
  start = Math.round(first.time * rate);
for (let i = 0; i < single.length; i++) assert.equal(pcm[start + i], single[i]);
for (const instrument of ['piano', 'guitar', 'organ']) {
  const a = synthesize({ ...first, instrument }, rate),
    b = synthesize({ ...first, instrument }, rate);
  assert.deepEqual(a, b);
  assert.ok(a.every(Number.isFinite));
  assert.ok(Math.abs(a.at(-1)) < 0.0001);
}
const wav = encodeWav(pcm, rate),
  view = new DataView(wav);
assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF');
assert.equal(view.getUint32(24, true), rate);
assert.equal(view.getUint32(40, true), 4 * rate * 2);
assert.equal(wav.byteLength, 44 + 4 * rate * 2);
const overlap = renderTake([first, { ...first }], 2, rate);
assert.ok(Math.abs(overlap[start + 500] - single[500] * 2) < 1e-7);
console.log(
  'PASS: key-repeat gate, release/retrigger, key 0 mapping, exact PCM alignment, leading/internal/trailing silence, independent tails, overlap, all 3 deterministic instruments, valid 16-bit mono WAV.',
);
