'use client';
import { useEffect, useRef, useState } from 'react';
import { Play, Trash2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { QUALITIES, ROOTS, noteLabel, type Hit } from '@/lib/instrument';
import {
  editPianoEvent,
  parsePianoNotes,
  type PianoEvent,
} from '@/lib/session-events';

export function SessionEventEditor({
  event,
  name,
  hits,
  length,
  disabled,
  onSave,
  onDelete,
  onClose,
  onPreview,
}: {
  event: PianoEvent;
  name: string;
  hits: Hit[];
  length: number;
  disabled: boolean;
  onSave: (next: Hit[]) => boolean;
  onDelete: () => void;
  onClose: () => void;
  onPreview: (hits: Hit[], duration: number) => void;
}) {
  const initial = {
    notes: event.notes.map(noteLabel).join(' '),
    time: event.time.toFixed(3),
    duration: event.duration.toFixed(3),
    volume: event.volume.toFixed(2),
  };
  const [draft, setDraft] = useState(initial);
  const [root, setRoot] = useState(
    String(event.chord?.root ?? event.notes[0] % 12),
  );
  const [quality, setQuality] = useState(event.chord?.quality ?? 'major');
  const [octave, setOctave] = useState(
    String(Math.floor(event.notes[0] / 12) - 1),
  );
  const [error, setError] = useState('');
  const panel = useRef<HTMLElement | null>(null);
  useEffect(() => {
    panel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);
  const proposed = () => {
    if (Object.values(draft).some((v) => !v.trim()))
      throw new RangeError('Fill in all block fields.');
    return editPianoEvent(
      hits,
      event,
      {
        ...(draft.notes !== initial.notes
          ? { notes: parsePianoNotes(draft.notes) }
          : {}),
        ...(draft.time !== initial.time ? { time: Number(draft.time) } : {}),
        ...(draft.duration !== initial.duration
          ? { duration: Number(draft.duration) }
          : {}),
        ...(draft.volume !== initial.volume
          ? { volume: Number(draft.volume) }
          : {}),
      },
      length,
    );
  };
  const attempt = (action: () => void) => {
    try {
      action();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the block values.');
    }
  };
  return (
    <section
      ref={panel}
      className="session-event-editor"
      aria-label={`Edit block ${event.label}`}
    >
      <div className="cover-section-heading">
        <div>
          <p className="eyebrow">
            {event.notes.length === 1 ? 'NOTE' : 'CHORD / NOTES'} AT{' '}
            {event.time.toFixed(3)}s
          </p>
          <h3>
            {event.label} <span>· {name}</span>
          </h3>
        </div>
        <button aria-label="Close block editor" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="event-edit-fields">
        <label className="event-pitches">
          Notes
          <Input
            aria-label="Block notes"
            value={draft.notes}
            disabled={disabled}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
          <small>Example: C4 E4 G4, or 60 64 67</small>
        </label>
        <label>
          Start in layer (s)
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
      </div>
      <div className="event-chord-picker">
        <span>Choose a chord</span>
        <Select
          value={root}
          onValueChange={(v) => v !== null && setRoot(v)}
          disabled={disabled}
        >
          <SelectTrigger aria-label="Block chord root">
            <SelectValue>{ROOTS[Number(root)]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ROOTS.map((n, i) => (
              <SelectItem key={i} value={String(i)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={quality}
          onValueChange={(v) => v !== null && setQuality(v)}
          disabled={disabled}
        >
          <SelectTrigger aria-label="Block chord quality">
            <SelectValue>{QUALITIES[quality].label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(QUALITIES)
              .filter(([key]) => key !== 'off')
              .map(([key, q]) => (
                <SelectItem key={key} value={key}>
                  {q.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <label>
          Octave
          <Input
            type="number"
            min={0}
            max={7}
            value={octave}
            disabled={disabled}
            onChange={(e) => setOctave(e.target.value)}
          />
        </label>
        <button
          disabled={disabled}
          onClick={() =>
            attempt(() => {
              const base = (Number(octave) + 1) * 12 + Number(root);
              const notes = QUALITIES[quality].intervals.map((n) => base + n);
              if (!octave.trim() || !Number.isInteger(Number(octave)))
                throw new Error('Choose a whole octave number.');
              setDraft({
                ...draft,
                notes: parsePianoNotes(notes.join(' '))
                  .map(noteLabel)
                  .join(' '),
              });
            })
          }
        >
          Use chord
        </button>
      </div>
      <div className="event-editor-actions">
        <button
          className="event-save"
          disabled={disabled}
          onClick={() =>
            attempt(() => {
              onSave(proposed());
            })
          }
        >
          Save block
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            attempt(() => {
              proposed();
              const changedNotes = draft.notes !== initial.notes;
              const duration =
                draft.duration !== initial.duration
                  ? Number(draft.duration)
                  : event.duration;
              const volume =
                draft.volume !== initial.volume
                  ? Number(draft.volume)
                  : event.volume;
              const ratio = duration / event.duration;
              const selected: Hit[] = changedNotes
                ? [
                    {
                      pad: -1,
                      time: 0,
                      duration,
                      volume,
                      notes: parsePianoNotes(draft.notes),
                      label: 'Block preview',
                      instrument: 'piano',
                    },
                  ]
                : event.indices.map((i) => ({
                    ...hits[i],
                    time: (hits[i].time - event.time) * ratio,
                    duration: hits[i].duration * ratio,
                    ...(draft.volume !== initial.volume ? { volume } : {}),
                  }));
              onPreview(selected, duration);
            })
          }
        >
          <Play size={15} /> Listen to block
        </button>
        <button disabled={disabled} onClick={onDelete}>
          <Trash2 size={15} /> Delete block
        </button>
      </div>
      {event.notes.length > 1 && (
        <p className="event-hint">
          Notes with near-simultaneous attacks are grouped. Changing the pitches
          replaces this group; other blocks stay as recorded.
        </p>
      )}
      {error && (
        <p role="alert" className="cover-error">
          {error}
        </p>
      )}
    </section>
  );
}
