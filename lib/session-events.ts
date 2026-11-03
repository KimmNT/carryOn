import {
  QUALITIES,
  ROOTS,
  noteLabel,
  type Hit,
  type Pad,
} from './instrument.ts';

export type PianoEvent = {
  id: string;
  indices: number[];
  time: number;
  duration: number;
  notes: number[];
  label: string;
  chord?: Pad;
  volume: number;
};

/** Exact pitch-class matching: uncertain combinations retain their note names. */
export function identifyPianoChord(notes: number[]): Pad | undefined {
  const unique = [...new Set(notes.map((n) => n % 12))];
  if (unique.length < 3) return;
  const bass = Math.min(...notes) % 12;
  for (const root of [
    bass,
    ...Array.from({ length: 12 }, (_, i) => i).filter((n) => n !== bass),
  ]) {
    for (const [quality, entry] of Object.entries(QUALITIES)) {
      const pcs = [...new Set(entry.intervals.map((n) => (n + root) % 12))];
      if (pcs.length === unique.length && pcs.every((n) => unique.includes(n)))
        return { root, quality };
    }
  }
}

export function pianoEventLabel(notes: number[]): string {
  const chord = identifyPianoChord(notes);
  if (!chord) return notes.map(noteLabel).join(' + ');
  const suffix: Record<string, string> = {
    major: '',
    minor: 'm',
    min7: 'm7',
    min6: 'm6',
    minmaj7: 'm(maj7)',
    minadd9: 'm(add9)',
  };
  const root = ROOTS[chord.root];
  const bass = Math.min(...notes) % 12;
  return (
    root +
    (suffix[chord.quality] ?? chord.quality) +
    (bass !== chord.root ? '/' + ROOTS[bass] : '')
  );
}

/** Group near-simultaneous attacks for display only; retain the original events. */
export function groupPianoEvents(hits: Hit[], tolerance = 0.06): PianoEvent[] {
  const sorted = hits
    .map((hit, index) => ({ hit, index }))
    .sort((a, b) => a.hit.time - b.hit.time);
  const groups: { indices: number[]; time: number }[] = [];
  for (const { hit, index } of sorted) {
    const last = groups[groups.length - 1];
    if (last && hit.time - last.time <= tolerance) last.indices.push(index);
    else groups.push({ indices: [index], time: hit.time });
  }
  return groups.map((group) => {
    const notes = [
      ...new Set(group.indices.flatMap((i) => hits[i].notes)),
    ].sort((a, b) => a - b);
    return {
      ...group,
      id: group.indices.join('-'),
      notes,
      label: pianoEventLabel(notes),
      chord: identifyPianoChord(notes),
      duration:
        Math.max(...group.indices.map((i) => hits[i].time + hits[i].duration)) -
        group.time,
      volume:
        group.indices.reduce((sum, i) => sum + hits[i].volume, 0) /
        group.indices.length,
    };
  });
}

export function parsePianoNotes(value: string): number[] {
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const letters: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const notes = parts.map((part) => {
    if (/^\d+$/.test(part)) return Number(part);
    const match = /^([A-Ga-g])([#♯b♭]?)(-?\d)$/.exec(part);
    if (!match)
      throw new RangeError(
        'Enter note names such as C4 E4 G4, or MIDI numbers such as 60 64 67.',
      );
    return (
      (Number(match[3]) + 1) * 12 +
      letters[match[1].toUpperCase()] +
      (['#', '♯'].includes(match[2])
        ? 1
        : ['b', '♭'].includes(match[2])
          ? -1
          : 0)
    );
  });
  if (
    !notes.length ||
    notes.length > 12 ||
    notes.some((n) => !Number.isInteger(n) || n < 21 || n > 108)
  )
    throw new RangeError('Choose 1–12 notes within the piano range A0–C8.');
  return [...new Set(notes)].sort((a, b) => a - b);
}

/** Modify only this block. Timing-only edits retain the original individual voices. */
export function editPianoEvent(
  hits: Hit[],
  event: PianoEvent,
  changes: {
    notes?: number[];
    time?: number;
    duration?: number;
    volume?: number;
  },
  length: number,
): Hit[] {
  if (
    !event.indices.length ||
    event.indices.some((i) => !Number.isInteger(i) || !hits[i])
  )
    throw new RangeError('Choose an existing note or chord block.');
  const time = changes.time ?? event.time,
    duration = changes.duration ?? event.duration;
  const volume = changes.volume ?? event.volume;
  const notes = changes.notes ?? event.notes;
  if (
    !Number.isFinite(time) ||
    time < 0 ||
    !Number.isFinite(duration) ||
    duration < 0.02 ||
    time + duration > length + 0.001 ||
    !Number.isFinite(volume) ||
    volume < 0 ||
    volume > 1 ||
    !notes.length ||
    notes.length > 12 ||
    notes.some((n) => !Number.isInteger(n) || n < 21 || n > 108)
  )
    throw new RangeError(
      'Keep the block within the layer and choose valid piano notes and volume.',
    );
  const changedNotes =
    changes.notes &&
    (notes.length !== event.notes.length ||
      notes.some((n, i) => n !== event.notes[i]));
  const selected = new Set(event.indices);
  if (changedNotes) {
    const hit: Hit = {
      pad: -1,
      time,
      duration,
      volume,
      notes: [...notes],
      label: pianoEventLabel(notes),
      instrument: 'piano',
    };
    return [...hits.filter((_, i) => !selected.has(i)), hit].sort(
      (a, b) => a.time - b.time,
    );
  }
  const ratio = duration / event.duration;
  return hits
    .map((hit, i) =>
      selected.has(i)
        ? {
            ...hit,
            time: time + (hit.time - event.time) * ratio,
            duration: hit.duration * ratio,
            ...(changes.volume !== undefined ? { volume } : {}),
          }
        : hit,
    )
    .sort((a, b) => a.time - b.time);
}

export type PositionedPianoEvent = PianoEvent & {
  start: number;
  end: number;
  lane: number;
  repeat: number;
};
export function positionPianoEvents(
  events: PianoEvent[],
  trim: [number, number],
  offset: number,
  length: number,
  loop = false,
): { blocks: PositionedPianoEvent[]; lanes: number } {
  const blocks: PositionedPianoEvent[] = [];
  const laneEnds: number[] = [];
  const duration = trim[1] - trim[0];
  if (duration <= 0) return { blocks, lanes: 1 };
  for (
    let start = offset, repeat = 0;
    start < length;
    start += duration, repeat++
  ) {
    for (const event of events) {
      const from = Math.max(event.time, trim[0]),
        to = Math.min(event.time + event.duration, trim[1]);
      const blockStart = start + from - trim[0],
        blockEnd = Math.min(length, start + to - trim[0]);
      if (to <= from || blockStart >= length || blockEnd <= 0) continue;
      let lane = laneEnds.findIndex((end) => end <= blockStart);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = blockEnd;
      blocks.push({
        ...event,
        start: Math.max(0, blockStart),
        end: blockEnd,
        lane,
        repeat,
      });
    }
    if (!loop) break;
  }
  return { blocks, lanes: Math.max(1, laneEnds.length) };
}
