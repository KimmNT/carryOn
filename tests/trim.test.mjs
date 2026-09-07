import assert from 'node:assert/strict';
import {
  renderTake,
  trimAudio,
  encodeWav,
  chordNotes,
} from '../lib/instrument.ts';
for (const rate of [44100, 48000]) {
  const hit = {
    pad: 0,
    time: 0.25,
    notes: chordNotes({ root: 0, quality: 'major' }),
    label: 'C',
    instrument: 'organ',
    duration: 2.4,
    volume: 0.7,
  };
  const hits = [
    hit,
    { ...hit, time: 2.1, instrument: 'guitar', duration: 3 },
    { ...hit, time: 5.8, instrument: 'piano', duration: 2.4 },
  ];
  const original = renderTake(hits, 10, rate),
    copy = original.slice();
  const selected = trimAudio(original, rate, 0.6, 6.6);
  assert.equal(
    selected.length,
    6 * rate,
    'A ten-second take can provide exactly six seconds.',
  );
  assert.deepEqual(
    selected,
    original.slice(Math.round(0.6 * rate), Math.round(6.6 * rate)),
    'Trim is sample-exact across partial chords and overlap.',
  );
  assert.ok(
    Math.abs(selected[0]) > 0.00001,
    'An earlier chord is already ringing at selection start.',
  );
  assert.ok(
    Math.abs(selected.at(-1)) > 0.000001,
    'The final chord is cut at the requested boundary.',
  );
  const wav = encodeWav(selected, rate),
    v = new DataView(wav);
  assert.equal(
    v.getUint32(40, true) / (rate * 2),
    6,
    'Export duration equals the replay buffer duration.',
  );
  for (const i of [0, 1, rate, 3 * rate, selected.length - 1]) {
    const decoded = v.getInt16(44 + i * 2, true);
    assert.ok(
      Math.abs(decoded / (decoded < 0 ? 32768 : 32767) - selected[i]) <
        1 / 32767,
    );
  }
  assert.deepEqual(
    trimAudio(original, rate, 0, 10),
    copy,
    'Reset restores the entire original take.',
  );
  assert.deepEqual(original, copy, 'Trimming never mutates the original.');
  const leading = trimAudio(original, rate, 0.1, 0.5);
  assert.ok(
    leading.subarray(0, Math.round(0.15 * rate)).every((x) => x === 0),
    'Leading silence is retained.',
  );
  assert.ok(leading.some((x) => x !== 0));
  const silence = trimAudio(original, rate, 8.5, 9.5);
  assert.equal(silence.length, rate);
  assert.ok(
    silence.every((x) => x === 0),
    'An entirely silent selected interval remains valid.',
  );
  const short = trimAudio(original, rate, 1, 1.001);
  assert.equal(short.length, Math.round(1.001 * rate) - rate);
  for (const bounds of [
    [-1, 2],
    [2, 2],
    [3, 2],
    [0, 11],
    [NaN, 2],
    [0, Infinity],
  ])
    assert.throws(() => trimAudio(original, rate, ...bounds), RangeError);
}
console.log(
  'PASS: reversible PCM trim; partial chord at both boundaries; overlap; silence; full-range reset; exact six-second replay/export; one-millisecond selection; invalid bounds.',
);
