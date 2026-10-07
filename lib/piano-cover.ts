import { noteLabel, type Hit } from './instrument.ts';

export type CoverPart = 'melody' | 'bass' | 'accompaniment';
export type SongSection = {
  id: string;
  name: string;
  start: number;
  end: number;
};
export type TranscribedNote = {
  startTimeSeconds: number;
  durationSeconds: number;
  pitchMidi: number;
  amplitude: number;
};
export type CoverLayer = { part: CoverPart; hits: Hit[] };

/** Register-based arrangement, not source separation or instrument identification. */
export function arrangePianoCover(
  notes: TranscribedNote[],
  length: number,
): CoverLayer[] {
  if (!Number.isFinite(length) || length <= 0)
    throw new RangeError('Choose a positive cover duration.');
  const layers: CoverLayer[] = [
    { part: 'melody', hits: [] },
    { part: 'bass', hits: [] },
    { part: 'accompaniment', hits: [] },
  ];
  const clean = notes
    .filter(
      (n) =>
        Number.isFinite(n.startTimeSeconds) &&
        Number.isFinite(n.durationSeconds) &&
        Number.isFinite(n.amplitude) &&
        Number.isInteger(n.pitchMidi) &&
        n.pitchMidi >= 21 &&
        n.pitchMidi <= 108 &&
        n.durationSeconds >= 0.08 &&
        n.startTimeSeconds >= 0 &&
        n.startTimeSeconds < length &&
        n.amplitude >= 0.15,
    )
    .sort(
      (a, b) =>
        a.startTimeSeconds - b.startTimeSeconds || b.pitchMidi - a.pitchMidi,
    );
  // Strong upper notes are melody candidates; keep middle voices as accompaniment.
  // This deliberately leaves every accepted note editable rather than discarding it.
  for (let i = 0; i < clean.length; i++) {
    const n = clean[i];
    const nearby = clean
      .slice(Math.max(0, i - 30), i + 31)
      .filter(
        (other) =>
          Math.abs(other.startTimeSeconds - n.startTimeSeconds) < 0.09 &&
          other.pitchMidi >= 60 &&
          other.amplitude >= n.amplitude * 0.7,
      );
    const part: CoverPart =
      n.pitchMidi < 48
        ? 'bass'
        : n.pitchMidi >= 60 &&
            !nearby.some((other) => other.pitchMidi > n.pitchMidi)
          ? 'melody'
          : 'accompaniment';
    const duration = Math.min(n.durationSeconds, length - n.startTimeSeconds);
    layers
      .find((layer) => layer.part === part)!
      .hits.push({
        pad: -1,
        time: n.startTimeSeconds,
        notes: [n.pitchMidi],
        label: noteLabel(n.pitchMidi),
        instrument: 'piano',
        duration,
        volume: Math.max(0.15, Math.min(1, n.amplitude)),
      });
  }
  return layers;
}

export function updateCoverNote(
  hit: Hit,
  changes: {
    pitch?: number;
    time?: number;
    duration?: number;
    volume?: number;
  },
  length: number,
): Hit {
  const pitch = changes.pitch ?? hit.notes[0];
  const time = changes.time ?? hit.time;
  const duration = changes.duration ?? hit.duration;
  const volume = changes.volume ?? hit.volume;
  if (
    !Number.isInteger(pitch) ||
    pitch < 21 ||
    pitch > 108 ||
    !Number.isFinite(time) ||
    time < 0 ||
    !Number.isFinite(duration) ||
    duration < 0.02 ||
    time + duration > length + 0.001 ||
    !Number.isFinite(volume) ||
    volume < 0 ||
    volume > 1
  )
    throw new RangeError(
      'Keep the note within the layer, with pitch 21–108 and volume 0–1.',
    );
  return {
    ...hit,
    chord: undefined,
    heldFor: undefined,
    notes: [pitch],
    label: noteLabel(pitch),
    time,
    duration,
    volume,
  };
}

export function validSections(
  sections: SongSection[],
  length: number,
): boolean {
  const sorted = [...sections].sort((a, b) => a.start - b.start);
  return sorted.every(
    (s, i) =>
      s.name.trim().length > 0 &&
      Number.isFinite(s.start) &&
      Number.isFinite(s.end) &&
      s.start >= 0 &&
      s.end > s.start &&
      s.end <= length &&
      (i === 0 || s.start >= sorted[i - 1].end),
  );
}

/** Type-1 MIDI: separate piano tracks with original timing, at a fixed 120 BPM timebase. */
export function encodeCoverMidi(
  layers: {
    name: string;
    hits: Hit[];
    gain?: number;
    offset?: number;
    trim: [number, number];
    loop?: boolean;
  }[],
  length: number,
): Uint8Array {
  const varint = (value: number) => {
    const out = [value & 127];
    while ((value = Math.floor(value / 128)) > 0)
      out.unshift((value & 127) | 128);
    return out;
  };
  const chunk = (tag: string, data: number[]) => [
    ...Array.from(tag, (c) => c.charCodeAt(0)),
    (data.length >>> 24) & 255,
    (data.length >>> 16) & 255,
    (data.length >>> 8) & 255,
    data.length & 255,
    ...data,
  ];
  const tracks: number[][] = [
    chunk('MTrk', [0, 255, 81, 3, 7, 161, 32, 0, 255, 47, 0]),
  ];
  for (const layer of layers) {
    const events: { tick: number; data: number[] }[] = [];
    const duration = layer.trim[1] - layer.trim[0];
    if (duration <= 0) continue;
    for (let offset = layer.offset ?? 0; offset < length; offset += duration) {
      for (const hit of layer.hits) {
        if (hit.volume <= 0 || (layer.gain ?? 1) <= 0) continue;
        const start = Math.max(0, hit.time - layer.trim[0]);
        const end = Math.min(
          duration,
          hit.time + (hit.heldFor ?? hit.duration) - layer.trim[0],
        );
        if (end <= start || offset + start >= length) continue;
        for (const pitch of hit.notes) {
          events.push({
            tick: Math.round((offset + start) * 960),
            data: [
              144,
              pitch,
              Math.max(
                1,
                Math.min(127, Math.round(hit.volume * (layer.gain ?? 1) * 100)),
              ),
            ],
          });
          events.push({
            tick: Math.round(Math.min(length, offset + end) * 960),
            data: [128, pitch, 0],
          });
        }
      }
      if (!layer.loop) break;
    }
    events.sort((a, b) => a.tick - b.tick || a.data[0] - b.data[0]);
    const name = Array.from(
      new TextEncoder().encode(layer.name.replaceAll(' · ', ' - ')),
    );
    const data = [0, 255, 3, ...varint(name.length), ...name, 0, 192, 0];
    let last = 0;
    for (const event of events) {
      data.push(...varint(event.tick - last), ...event.data);
      last = event.tick;
    }
    data.push(0, 255, 47, 0);
    tracks.push(chunk('MTrk', data));
  }
  const out = [
    77,
    84,
    104,
    100,
    0,
    0,
    0,
    6,
    0,
    1,
    (tracks.length >>> 8) & 255,
    tracks.length & 255,
    1,
    224,
  ];
  for (const track of tracks) for (const byte of track) out.push(byte);
  return new Uint8Array(out);
}
