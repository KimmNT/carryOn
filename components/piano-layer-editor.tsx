'use client';
import { useState } from 'react';
import { Play, Plus, Trash2, Undo2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { type SongSection } from '@/lib/piano-cover';
import {
  editPianoEvent,
  groupPianoEvents,
  parsePianoNotes,
  pianoEventLabel,
} from '@/lib/session-events';
import { noteLabel, type Hit } from '@/lib/instrument';

export function PianoLayerEditor({
  name,
  hits,
  length,
  offset,
  trimStart,
  sections,
  disabled,
  onChange,
  onPreview,
}: {
  name: string;
  hits: Hit[];
  length: number;
  offset: number;
  trimStart: number;
  sections: SongSection[];
  disabled: boolean;
  onChange: (hits: Hit[]) => boolean;
  onPreview: (hit: Hit) => void;
}) {
  const [sectionId, setSectionId] = useState('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState({
    pitch: '60',
    time: '0',
    duration: '0.5',
    volume: '0.7',
  });
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Hit[][]>([]);
  const section = sections.find((s) => s.id === sectionId);
  const from = section ? Math.max(0, section.start - offset + trimStart) : 0;
  const to = section
    ? Math.min(length, section.end - offset + trimStart)
    : length;
  const visible = hits
    .map((hit, index) => ({ hit, index }))
    .filter(({ hit }) => hit.time < to && hit.time + hit.duration > from);
  const pageCount = Math.max(1, Math.ceil(visible.length / 20));
  const shown = visible.slice(
    Math.min(page, pageCount - 1) * 20,
    (Math.min(page, pageCount - 1) + 1) * 20,
  );
  const pitches = visible.flatMap((n) => n.hit.notes);
  const low = Math.min(48, ...pitches),
    high = Math.max(72, ...pitches);
  const choose = (index: number) => {
    const h = hits[index];
    setSelected(index);
    setDraft({
      pitch: h.notes.map(noteLabel).join(' '),
      time: h.time.toFixed(3),
      duration: h.duration.toFixed(3),
      volume: h.volume.toFixed(2),
    });
    setError('');
  };
  const apply = (next: Hit[]) => {
    if (onChange(next.sort((a, b) => a.time - b.time))) {
      setHistory((h) => [...h.slice(-19), hits]);
      setSelected(null);
      setError('');
      return true;
    }
    return false;
  };
  const save = () => {
    if (selected === null) return;
    try {
      if (Object.values(draft).some((v) => !v.trim()))
        throw new Error('Fill in every note field.');
      const current = hits[selected];
      const event = { ...groupPianoEvents([current])[0], indices: [selected] };
      const next = editPianoEvent(
        hits,
        event,
        {
          notes: parsePianoNotes(draft.pitch),
          time: Number(draft.time),
          duration: Number(draft.duration),
          volume: Number(draft.volume),
        },
        length,
      );
      apply(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the note values.');
    }
  };
  const transpose = (step: number) => {
    try {
      apply(
        hits.map((h) => {
          if (!visible.some((n) => n.hit === h)) return h;
          const notes = parsePianoNotes(h.notes.map((n) => n + step).join(' '));
          return { ...h, notes, label: pianoEventLabel(notes) };
        }),
      );
    } catch {
      setError('Some notes would fall outside the piano range.');
    }
  };
  return (
    <section className="piano-layer-editor" aria-label={`Edit ${name}`}>
      <div className="cover-section-heading">
        <div>
          <p className="eyebrow">NOTE EDITOR</p>
          <h3>{name}</h3>
        </div>
        <div className="editor-actions">
          <Select
            value={sectionId}
            onValueChange={(v) => {
              if (v) {
                setSectionId(v);
                setPage(0);
                setSelected(null);
              }
            }}
            disabled={disabled}
          >
            <SelectTrigger aria-label="Filter notes by song section">
              <SelectValue>{section?.name ?? 'All sections'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            disabled={disabled || !visible.length}
            onClick={() => transpose(-1)}
          >
            −1 semitone
          </button>
          <button
            disabled={disabled || !visible.length}
            onClick={() => transpose(1)}
          >
            +1 semitone
          </button>
          <button
            disabled={disabled || !history.length}
            onClick={() => {
              const prev = history[history.length - 1];
              if (onChange(prev)) {
                setHistory((h) => h.slice(0, -1));
                setSelected(null);
              }
            }}
          >
            <Undo2 size={15} /> Undo
          </button>
          <button
            disabled={disabled || to <= from}
            onClick={() => {
              const time = Math.max(0, Math.min(from, length - 0.1));
              const h: Hit = {
                pad: -1,
                time,
                notes: [60],
                label: noteLabel(60),
                instrument: 'piano',
                duration: Math.min(0.5, length - time),
                volume: 0.7,
              };
              apply([...hits, h]);
            }}
          >
            <Plus size={15} /> Add note
          </button>
        </div>
      </div>
      <p>
        Click a note to change its pitch, timing, duration, or volume. Times are
        relative to this layer’s start.
      </p>
      <div className="piano-roll">
        <svg
          viewBox="0 0 1000 210"
          role="group"
          aria-label={`${name} piano roll`}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <line x1={45} x2={998} y1={i * 42 + 15} y2={i * 42 + 15} />
              <text x={3} y={i * 42 + 19}>
                {noteLabel(Math.round(high - ((high - low) * i) / 4))}
              </text>
            </g>
          ))}
          {visible.slice(0, 1500).flatMap(({ hit, index }) =>
            hit.notes.map((pitch) => (
              <rect
                key={`${index}-${pitch}`}
                tabIndex={disabled ? -1 : 0}
                role="button"
                aria-label={`${noteLabel(pitch)} at ${hit.time.toFixed(2)} seconds`}
                aria-pressed={selected === index}
                x={
                  45 +
                  Math.max(0, (hit.time - from) / Math.max(0.01, to - from)) *
                    950
                }
                y={12 + ((high - pitch) / (high - low + 1)) * 174}
                width={Math.max(
                  3,
                  ((Math.min(hit.time + hit.duration, to) -
                    Math.max(hit.time, from)) /
                    Math.max(0.01, to - from)) *
                    950,
                )}
                height={6}
                className={selected === index ? 'is-selected' : ''}
                onClick={() => {
                  if (!disabled) choose(index);
                }}
                onKeyDown={(e) => {
                  if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    choose(index);
                  }
                }}
              >
                <title>
                  {hit.label} · {hit.time.toFixed(3)}s ·{' '}
                  {hit.duration.toFixed(3)}s
                </title>
              </rect>
            )),
          )}
          <text x={45} y={205}>
            {from.toFixed(2)}s
          </text>
          <text x={940} y={205}>
            {Math.max(from, to).toFixed(2)}s
          </text>
        </svg>
      </div>
      {selected !== null && hits[selected] && (
        <div className="note-edit-form">
          <label>
            Notes (names or MIDI)
            <Input
              type="text"
              value={draft.pitch}
              disabled={disabled}
              onChange={(e) => setDraft({ ...draft, pitch: e.target.value })}
            />
          </label>
          <label>
            Start (s)
            <Input
              type="number"
              min={0}
              step={0.001}
              value={draft.time}
              disabled={disabled}
              onChange={(e) => setDraft({ ...draft, time: e.target.value })}
            />
          </label>
          <label>
            Duration (s)
            <Input
              type="number"
              min={0.02}
              step={0.001}
              value={draft.duration}
              disabled={disabled}
              onChange={(e) => setDraft({ ...draft, duration: e.target.value })}
            />
          </label>
          <label>
            Volume (0–1)
            <Input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={draft.volume}
              disabled={disabled}
              onChange={(e) => setDraft({ ...draft, volume: e.target.value })}
            />
          </label>
          <button disabled={disabled} onClick={save}>
            Save note
          </button>
          <button disabled={disabled} onClick={() => onPreview(hits[selected])}>
            <Play size={15} /> Listen
          </button>
          <button
            disabled={disabled}
            onClick={() => apply(hits.filter((_, i) => i !== selected))}
          >
            <Trash2 size={15} /> Delete
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="cover-error">
          {error}
        </p>
      )}
      <div className="note-table-wrap">
        <table className="note-table">
          <thead>
            <tr>
              <th>Note</th>
              <th>Start</th>
              <th>Duration</th>
              <th>Volume</th>
              <th>Edit</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ hit, index }) => (
              <tr
                key={index}
                className={selected === index ? 'is-selected' : ''}
              >
                <td>{hit.label}</td>
                <td>{hit.time.toFixed(3)} s</td>
                <td>{hit.duration.toFixed(3)} s</td>
                <td>{Math.round(hit.volume * 100)}%</td>
                <td>
                  <button disabled={disabled} onClick={() => choose(index)}>
                    Edit note
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note-pagination">
        <span>
          {visible.length} notes{' '}
          {visible.length > 1500
            ? '· first 1,500 shown in piano roll; all available below'
            : ''}
        </span>
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Previous
        </button>
        <span>
          {Math.min(page, pageCount - 1) + 1} / {pageCount}
        </span>
        <button
          disabled={page >= pageCount - 1}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
