export type Instrument = 'piano' | 'guitar' | 'organ';
export type Pad = { root: number; quality: string; bass?: string };
export type Hit = {
  chord?: Pad;
  /** Seconds the player held a chord before its release tail. */
  heldFor?: number;
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
    add9: { label: 'Add 9', intervals: [0, 4, 7, 14] },
    minadd9: { label: 'Minor add 9', intervals: [0, 3, 7, 14] },
    '6': { label: 'Major 6', intervals: [0, 4, 7, 9] },
    min6: { label: 'Minor 6', intervals: [0, 3, 7, 9] },
    maj7: { label: 'Major 7', intervals: [0, 4, 7, 11] },
    minmaj7: { label: 'Minor major 7', intervals: [0, 3, 7, 11] },
    min7: { label: 'Minor 7', intervals: [0, 3, 7, 10] },
    '7': { label: 'Dominant 7', intervals: [0, 4, 7, 10] },
    sus2: { label: 'Sus 2', intervals: [0, 2, 7] },
    sus4: { label: 'Sus 4', intervals: [0, 5, 7] },
    dim: { label: 'Diminished', intervals: [0, 3, 6] },
    off: { label: 'Unassigned', intervals: [] },
  };
export const BASS_NOTES: Record<string, number> = {
  C: 0,
  'C♯': 1,
  'D♭': 1,
  D: 2,
  'D♯': 3,
  'E♭': 3,
  E: 4,
  'F♭': 4,
  'E♯': 5,
  F: 5,
  'F♯': 6,
  'G♭': 6,
  G: 7,
  'G♯': 8,
  'A♭': 8,
  A: 9,
  'A♯': 10,
  'B♭': 10,
  B: 11,
  'C♭': 11,
};
const CHORD_PARTS: Record<string, [string, string]> = {
  major: ['major', 'none'],
  minor: ['minor', 'none'],
  '6': ['major', '6'],
  min6: ['minor', '6'],
  '7': ['major', '7'],
  min7: ['minor', '7'],
  maj7: ['major', 'maj7'],
  minmaj7: ['minor', 'maj7'],
  add9: ['major', 'add9'],
  minadd9: ['minor', 'add9'],
  sus2: ['sus2', 'none'],
  sus4: ['sus4', 'none'],
  dim: ['dim', 'none'],
  off: ['off', 'none'],
};
export function splitQuality(quality: string) {
  const [family, extension] = CHORD_PARTS[quality];
  return { family, extension };
}
export function joinQuality(family: string, extension: string) {
  if (!['major', 'minor'].includes(family)) return family;
  return (
    Object.keys(CHORD_PARTS).find(
      (key) =>
        CHORD_PARTS[key][0] === family && CHORD_PARTS[key][1] === extension,
    ) ?? family
  );
}
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
export const NOTE_KEY_CODES = [
  'KeyZ',
  'KeyS',
  'KeyX',
  'KeyD',
  'KeyC',
  'KeyV',
  'KeyG',
  'KeyB',
  'KeyH',
  'KeyN',
  'KeyJ',
  'KeyM',
  'KeyQ',
  'Digit2',
  'KeyW',
  'Digit3',
  'KeyE',
  'KeyR',
  'Digit5',
  'KeyT',
  'Digit6',
  'KeyY',
  'Digit7',
  'KeyU',
  'KeyI',
] as const;
export const NOTE_KEY_LABELS = [
  'Z',
  'S',
  'X',
  'D',
  'C',
  'V',
  'G',
  'B',
  'H',
  'N',
  'J',
  'M',
  'Q',
  '2',
  'W',
  '3',
  'E',
  'R',
  '5',
  'T',
  '6',
  'Y',
  '7',
  'U',
  'I',
] as const;
export function midiNoteAt(index: number, baseOctave: number) {
  if (!Number.isInteger(index) || index < 0 || index >= NOTE_KEY_CODES.length)
    throw new RangeError('Choose one of the 25 note keys.');
  if (!Number.isInteger(baseOctave) || baseOctave < 0 || baseOctave > 7)
    throw new RangeError('Choose a valid base octave.');
  return (baseOctave + 1) * 12 + index;
}
export function noteLabel(midi: number) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127)
    throw new RangeError('Choose a valid MIDI note.');
  const names = [
    'C',
    'C♯',
    'D',
    'D♯',
    'E',
    'F',
    'F♯',
    'G',
    'G♯',
    'A',
    'A♯',
    'B',
  ];
  return names[midi % 12] + (Math.floor(midi / 12) - 1);
}
export function createNoteKeyGate() {
  const held = new Set<string>();
  return {
    down(code: string, repeat: boolean) {
      const index = NOTE_KEY_CODES.indexOf(
        code as (typeof NOTE_KEY_CODES)[number],
      );
      if (repeat || held.has(code) || index < 0) return -1;
      held.add(code);
      return index;
    },
    up(code: string) {
      held.delete(code);
    },
    clear() {
      held.clear();
    },
  };
}
export function chordLabel(p: Pad) {
  return p.quality === 'off'
    ? '—'
    : ROOTS[p.root] +
        ({
          major: '',
          minor: 'm',
          maj7: 'maj7',
          min7: 'm7',
          min6: 'm6',
          minadd9: 'm(add9)',
          minmaj7: 'm(maj7)',
        }[p.quality] ?? p.quality) +
        (p.bass ? '/' + p.bass : '');
}
export function chordNotes(p: Pad) {
  const notes = QUALITIES[p.quality].intervals.map((n) => 48 + p.root + n);
  return p.bass && notes.length ? [36 + BASS_NOTES[p.bass], ...notes] : notes;
}
// Spell chord members by scale degree (B major is B–D♯–F♯, not B–E♭–F♯).
export function chordNoteNames(p: Pad) {
  const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const natural = [0, 2, 4, 5, 7, 9, 11];
  const degrees =
    p.quality === 'add9' || p.quality === 'minadd9'
      ? [0, 2, 4, 8]
      : p.quality === '6' || p.quality === 'min6'
        ? [0, 2, 4, 5]
        : p.quality === 'sus2'
          ? [0, 1, 4]
          : p.quality === 'sus4'
            ? [0, 3, 4]
            : [0, 2, 4, 6];
  const rootLetter = letters.indexOf(ROOTS[p.root][0]);
  const upper = chordNotes({ ...p, bass: undefined }).map((note, i) => {
    const letter = (rootLetter + degrees[i]) % 7;
    const accidental = (((note % 12) - natural[letter] + 18) % 12) - 6;
    return (
      letters[letter] +
      (accidental < 0 ? '♭'.repeat(-accidental) : '♯'.repeat(accidental))
    );
  });
  return p.bass && upper.length ? [p.bass, ...upper] : upper;
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
export const CHORD_RELEASE_SECONDS = 0.34;
export function heldChordPartials(instrument: Instrument): number[] {
  return instrument === 'organ'
    ? [1, 0.22, 0.075, 0.025]
    : instrument === 'piano'
      ? [1, 0.3, 0.105, 0.035, 0.012]
      : [1, 0.4, 0.16, 0.07];
}
function synthesizeHeldChord(hit: Hit, rate: number): Float32Array {
  const data = new Float32Array(Math.ceil(hit.duration * rate));
  const heldFor = Math.max(0.02, hit.heldFor ?? 0.02);
  const partials = heldChordPartials(hit.instrument);
  const attack = hit.instrument === 'organ' ? 0.045 : 0.008;
  for (let n = 0; n < hit.notes.length; n++) {
    const frequency = 440 * 2 ** ((hit.notes[n] - 69) / 12);
    const delay = hit.instrument === 'guitar' ? n * 0.026 : 0;
    const phase = partials.map((_, harmonic) => {
      const step = (2 * Math.PI * frequency * (harmonic + 1)) / rate;
      return {
        real: 1,
        imaginary: 0,
        cosine: Math.cos(step),
        sine: Math.sin(step),
      };
    });
    for (let i = Math.ceil(delay * rate); i < data.length; i++) {
      const time = i / rate - delay;
      const release = Math.min(
        1,
        Math.max(
          0,
          (heldFor + CHORD_RELEASE_SECONDS - i / rate) / CHORD_RELEASE_SECONDS,
        ),
      );
      let wave = 0;
      for (let harmonic = 0; harmonic < partials.length; harmonic++) {
        const oscillator = phase[harmonic];
        wave += partials[harmonic] * oscillator.imaginary;
        const nextReal =
          oscillator.real * oscillator.cosine -
          oscillator.imaginary * oscillator.sine;
        oscillator.imaginary =
          oscillator.imaginary * oscillator.cosine +
          oscillator.real * oscillator.sine;
        oscillator.real = nextReal;
      }
      data[i] +=
        wave * Math.min(1, time / attack) * release * 0.055 * hit.volume;
    }
  }
  return data;
}
export function synthesize(hit: Hit, rate: number): Float32Array {
  if (hit.heldFor !== undefined) return synthesizeHeldChord(hit, rate);
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

/** Identify the chord captured in a take, independently of today's pad setup. */
export function recordedChord(hit: Hit): Pad {
  if (hit.chord) return { ...hit.chord };
  const root = (((hit.notes[0] - 48) % 12) + 12) % 12;
  const quality = Object.keys(QUALITIES).find((key) => {
    const notes = chordNotes({ root, quality: key });
    return (
      notes.length === hit.notes.length &&
      notes.every((note, i) => note === hit.notes[i])
    );
  });
  if (!quality)
    throw new Error('The recorded chord is not in the chord library.');
  return { root, quality };
}

export function replaceRecordedChord(
  hits: Hit[],
  index: number,
  chord: Pad,
): Hit[] {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= hits.length ||
    !Number.isInteger(chord.root) ||
    chord.root < 0 ||
    chord.root > 11 ||
    !Object.hasOwn(QUALITIES, chord.quality) ||
    chord.quality === 'off' ||
    (chord.bass !== undefined && !Object.hasOwn(BASS_NOTES, chord.bass))
  )
    throw new RangeError('Choose a recorded chord and a valid replacement.');
  return hits.map((hit, i) =>
    i === index
      ? {
          ...hit,
          chord: { ...chord },
          notes: chordNotes(chord),
          label: chordLabel(chord),
        }
      : hit,
  );
}
export type AudioTrack = {
  offset?: number;
  loop?: boolean;
  hits: Hit[];
  length: number;
  trim: [number, number];
};
export function clampTrackStart(
  offset: number,
  takeDuration: number,
  sessionDuration: number,
) {
  return Math.max(
    0,
    Math.min(
      Number.isFinite(offset) ? offset : 0,
      Math.max(0, sessionDuration - takeDuration),
    ),
  );
}
/** With a session duration, layers are clipped to its fixed end. */
export function mixTracks(
  tracks: AudioTrack[],
  rate: number,
  sessionDuration = 0,
) {
  const layers = tracks
    .filter((t) => t.hits.length && t.trim[1] > t.trim[0])
    .map((t) => ({
      loop: t.loop,
      start: Math.round(Math.max(0, t.offset ?? 0) * rate),
      pcm: trimAudio(renderTake(t.hits, t.length, rate), rate, ...t.trim),
    }));
  const mixed = new Float32Array(
    sessionDuration > 0
      ? Math.round(sessionDuration * rate)
      : Math.max(0, ...layers.map((p) => p.start + p.pcm.length)),
  );
  for (const layer of layers)
    for (
      let i = 0;
      i <
      Math.min(
        mixed.length - layer.start,
        layer.loop ? mixed.length - layer.start : layer.pcm.length,
      );
      i++
    )
      mixed[layer.start + i] += layer.pcm[i % layer.pcm.length];
  let peak = 1;
  for (const sample of mixed) peak = Math.max(peak, Math.abs(sample));
  if (peak > 1) for (let i = 0; i < mixed.length; i++) mixed[i] /= peak;
  return mixed;
}
