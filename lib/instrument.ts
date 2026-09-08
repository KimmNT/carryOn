export type Instrument = 'piano' | 'guitar' | 'organ';
export type Pad = { root: number; quality: string };
export type Hit = {
  pad: number;
  time: number;
  notes: number[];
  label: string;
  instrument: Instrument;
  duration: number;
  volume: number;
};
export const ROOTS = [
  'C',
  'C♯',
  'D',
  'E♭',
  'E',
  'F',
  'F♯',
  'G',
  'A♭',
  'A',
  'B♭',
  'B',
];
export const QUALITIES: Record<string, { label: string; intervals: number[] }> =
  {
    major: { label: 'Major', intervals: [0, 4, 7] },
    minor: { label: 'Minor', intervals: [0, 3, 7] },
    maj7: { label: 'Major 7', intervals: [0, 4, 7, 11] },
    min7: { label: 'Minor 7', intervals: [0, 3, 7, 10] },
    '7': { label: 'Dominant 7', intervals: [0, 4, 7, 10] },
    sus2: { label: 'Sus 2', intervals: [0, 2, 7] },
    sus4: { label: 'Sus 4', intervals: [0, 5, 7] },
    dim: { label: 'Diminished', intervals: [0, 3, 6] },
    off: { label: 'Unassigned', intervals: [] },
  };
export const DEFAULT_PADS: Pad[] = [
  { root: 0, quality: 'major' },
  { root: 7, quality: 'major' },
  { root: 9, quality: 'minor' },
  { root: 5, quality: 'major' },
  { root: 2, quality: 'minor' },
  { root: 4, quality: 'minor' },
  { root: 0, quality: 'maj7' },
  { root: 9, quality: 'min7' },
  { root: 5, quality: 'maj7' },
  { root: 7, quality: '7' },
];
export function chordLabel(p: Pad) {
  return p.quality === 'off'
    ? '—'
    : ROOTS[p.root] +
        ({ major: '', minor: 'm', maj7: 'maj7', min7: 'm7' }[p.quality] ??
          p.quality);
}
export function chordNotes(p: Pad) {
  return QUALITIES[p.quality].intervals.map((n) => 48 + p.root + n);
}
// Spell chord members by scale degree (B major is B–D♯–F♯, not B–E♭–F♯).
export function chordNoteNames(p: Pad) {
  const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const natural = [0, 2, 4, 5, 7, 9, 11];
  const degrees =
    p.quality === 'sus2'
      ? [0, 1, 4]
      : p.quality === 'sus4'
        ? [0, 3, 4]
        : [0, 2, 4, 6];
  const rootLetter = letters.indexOf(ROOTS[p.root][0]);
  return chordNotes(p).map((note, i) => {
    const letter = (rootLetter + degrees[i]) % 7;
    const accidental = (((note % 12) - natural[letter] + 18) % 12) - 6;
    return (
      letters[letter] +
      (accidental < 0 ? '♭'.repeat(-accidental) : '♯'.repeat(accidental))
    );
  });
}
export function takeLength(hits: Hit[], stopped: number) {
  return Math.max(stopped, ...hits.map((h) => h.time + h.duration), 0);
}
export function scheduleTake<T>(
  hits: Hit[],
  prepare: (hit: Hit) => T,
  now: () => number,
  play: (buffer: T, time: number) => void,
) {
  // Expensive preparation must finish before the playback clock starts.
  const prepared = hits.map(prepare),
    start = now() + 0.06;
  hits.forEach((hit, i) => play(prepared[i], start + hit.time));
  return start;
}
export function createKeyGate() {
  const held = new Set<string>();
  return {
    down(code: string, repeat: boolean) {
      if (repeat || held.has(code) || !/^Digit[0-9]$/.test(code)) return -1;
      held.add(code);
      return (Number(code.slice(-1)) + 9) % 10;
    },
    up(code: string) {
      held.delete(code);
    },
    clear() {
      held.clear();
    },
  };
}
// The live player and WAV renderer use the same deterministic PCM synthesis.
export const SOUND_VERSION = 3;
export function synthesize(hit: Hit, rate: number): Float32Array {
  const data = new Float32Array(Math.ceil(hit.duration * rate));
  for (let n = 0; n < hit.notes.length; n++) {
    const f = 440 * 2 ** ((hit.notes[n] - 69) / 12);
    const delay = hit.instrument === 'guitar' ? n * 0.026 : 0;
    const first = Math.ceil(delay * rate),
      note = new Float64Array(data.length);
    if (hit.instrument === 'guitar') {
      // Karplus–Strong plucked string. The fractional delay compensates for the
      // averaging filter's half-sample delay, keeping every root in tune.
      const period = rate / f - 0.5,
        whole = Math.floor(period),
        fraction = period - whole;
      const size = whole + 2,
        ring = new Float64Array(size);
      for (let i = 0; i < size; i++) {
        const phase = (2 * Math.PI * f * (i - size)) / rate;
        for (let h = 1; h <= 12 && f * h < rate * 0.45; h++)
          ring[i] +=
            (Math.sin(Math.PI * 0.23 * h) / (h * h)) * Math.cos(h * phase);
      }
      const damping = Math.exp(-1.8 / f);
      let previous = 0;
      for (let i = first; i < data.length; i++) {
        const j = i - first,
          w = j % size;
        const delayed =
          ring[(w - whole + size) % size] * (1 - fraction) +
          ring[(w - whole - 1 + size) % size] * fraction;
        const value = (delayed + previous) * 0.5 * damping;
        previous = delayed;
        ring[w] = value;
        note[i] = value * 1.45;
      }
    } else {
      // Piano: struck, slightly stiff strings with fast-decaying upper modes.
      // Organ: warm drawbars with a steady envelope, no string decay.
      const partials =
        hit.instrument === 'piano'
          ? [1, 0.3, 0.105, 0.035, 0.012, 0.004]
          : [1, 0.22, 0.075, 0.025];
      for (let h = 0; h < partials.length; h++) {
        const k = h + 1,
          stiffness =
            hit.instrument === 'piano'
              ? Math.sqrt((1 + 0.00008 * k * k) / 1.00008)
              : 1;
        const omega = 2 * Math.PI * f * k * stiffness,
          step = omega / rate;
        const decayRate = hit.instrument === 'organ' ? 0 : 1.45 + h * 1.75;
        const c = Math.cos(step),
          q = Math.sin(step),
          decayStep = Math.exp(-decayRate / rate);
        let re = 1,
          im = 0,
          amplitude = partials[h];
        for (let i = first; i < data.length; i++) {
          note[i] += im * amplitude;
          const nextRe = re * c - im * q;
          im = im * c + re * q;
          re = nextRe;
          amplitude *= decayStep;
        }
      }
    }
    for (let i = first; i < data.length; i++) {
      const t = i / rate - delay,
        remaining = hit.duration - i / rate;
      const attackSeconds =
        hit.instrument === 'organ'
          ? 0.045
          : hit.instrument === 'piano'
            ? 0.007
            : 0.002;
      const attack = Math.min(1, t / attackSeconds);
      const body =
        hit.instrument === 'piano'
          ? 0.85 + 0.15 * Math.exp(-t * 18)
          : hit.instrument === 'organ'
            ? 0.985 + 0.015 * Math.cos(2 * Math.PI * 4.5 * t)
            : 1;
      data[i] +=
        note[i] *
        attack *
        Math.min(1, remaining / 0.16) *
        body *
        0.055 *
        hit.volume;
    }
  }
  // Gentle shared tone roll-off avoids brittle upper partials on higher roots.
  const coefficient =
    1 -
    Math.exp(
      (-2 * Math.PI * (hit.instrument === 'organ' ? 1700 : 2600)) / rate,
    );
  let filtered = 0;
  for (let i = 0; i < data.length; i++) {
    filtered += coefficient * (data[i] - filtered);
    data[i] = filtered;
  }
  return data;
}
export function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2),
    v = new DataView(buffer);
  const str = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) =>
    v.setInt16(
      44 + i * 2,
      Math.round(Math.max(-1, Math.min(1, x)) * (x < 0 ? 32768 : 32767)),
      true,
    ),
  );
  return buffer;
}
export function renderTake(hits: Hit[], length: number, rate: number) {
  const result = new Float32Array(Math.ceil(length * rate));
  for (const hit of hits) {
    const pcm = synthesize(hit, rate),
      start = Math.round(hit.time * rate);
    for (let i = 0; i < pcm.length && start + i < result.length; i++)
      result[start + i] += pcm[i];
  }
  return result;
}

/** Cut PCM, not trigger events: a chord that started earlier keeps ringing. */
export function trimAudio(
  samples: Float32Array,
  rate: number,
  start: number,
  end: number,
) {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start ||
    end > samples.length / rate + 1e-9
  )
    throw new RangeError(
      'Choose a start before the end, within the original take.',
    );
  const first = Math.round(start * rate);
  const last =
    Math.ceil(end * rate) >= samples.length
      ? samples.length
      : Math.round(end * rate);
  if (last <= first)
    throw new RangeError('The selection must contain audio samples.');
  return samples.slice(first, last);
}

/** Visual position follows the audio clock; native buffer looping owns timing. */
export function playbackPosition(
  elapsed: number,
  duration: number,
  loop: boolean,
) {
  if (duration <= 0) return 0;
  const time = Math.max(0, elapsed);
  return loop ? time % duration : Math.min(time, duration);
}
