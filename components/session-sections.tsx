'use client';
import { useState } from 'react';
import { Plus, Play, Repeat2, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { validSections, type SongSection } from '@/lib/piano-cover';

export function SessionSections({
  sections,
  length,
  disabled,
  canPlay,
  onChange,
  onPlay,
}: {
  sections: SongSection[];
  length: number;
  disabled: boolean;
  canPlay: boolean;
  onChange: (sections: SongSection[]) => void;
  onPlay: (section: SongSection, loop: boolean) => void;
}) {
  const [edit, setEdit] = useState<SongSection | null>(null);
  const [error, setError] = useState('');
  const [splitId, setSplitId] = useState<string | null>(null);
  const labels = ['Intro', 'Verse', 'Pre-chorus', 'Chorus', 'Bridge', 'Outro'];
  const commit = () => {
    if (!edit) return;
    const next = [
      ...sections
        .filter((s) => s.id !== edit.id)
        .map((s) => (s.id === splitId ? { ...s, end: edit.start } : s)),
      { ...edit, name: edit.name.trim() },
    ].sort((a, b) => a.start - b.start);
    if (!validSections(next, length)) {
      setError(
        'Give the section a name and a valid range. Sections cannot overlap. Shorten an existing section to make room.',
      );
      return;
    }
    onChange(next);
    setEdit(null);
    setError('');
    setSplitId(null);
  };
  return (
    <section className="song-sections" aria-label="Song sections">
      <div className="cover-section-heading">
        <div>
          <h3>Song sections</h3>
          <p>
            Label passages to find and adjust a verse, pre-chorus, chorus, or
            bridge.
          </p>
        </div>
        <button
          disabled={disabled}
          onClick={() => {
            const sorted = [...sections].sort((a, b) => a.start - b.start);
            let start = 0,
              end = length;
            for (const s of sorted) {
              if (s.start > start) {
                end = s.start;
                break;
              }
              start = Math.max(start, s.end);
            }
            setSplitId(null);
            if (start >= length && sorted.length) {
              const last = sorted[sorted.length - 1];
              start = (last.start + last.end) / 2;
              end = last.end;
              setSplitId(last.id);
            }
            setEdit({
              id: crypto.randomUUID(),
              name: 'Verse',
              start: Math.min(start, length - 0.01),
              end,
            });
            setError('');
          }}
        >
          <Plus size={16} /> Add section
        </button>
      </div>
      {sections.length > 0 && (
        <div className="section-overview" aria-label="Section overview">
          {sections.map((s) => (
            <button
              key={s.id}
              style={{
                left: `${(s.start / length) * 100}%`,
                width: `${((s.end - s.start) / length) * 100}%`,
              }}
              disabled={disabled}
              onClick={() => {
                setEdit({ ...s });
                setError('');
                setSplitId(null);
              }}
              title={`${s.name}: ${s.start.toFixed(2)}–${s.end.toFixed(2)} seconds`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="section-list">
        {sections.map((s) => (
          <div className="section-card" key={s.id}>
            <button
              disabled={disabled}
              onClick={() => {
                setEdit({ ...s });
                setError('');
                setSplitId(null);
              }}
            >
              <strong>{s.name}</strong>
              <span>
                {s.start.toFixed(2)}–{s.end.toFixed(2)}s
              </span>
            </button>
            <button
              disabled={disabled || !canPlay}
              aria-label={`Play ${s.name}`}
              onClick={() => onPlay(s, false)}
            >
              <Play size={14} />
            </button>
            <button
              disabled={disabled || !canPlay}
              aria-label={`Loop ${s.name}`}
              onClick={() => onPlay(s, true)}
            >
              <Repeat2 size={14} />
            </button>
          </div>
        ))}
      </div>
      {edit && (
        <div className="section-edit">
          <label>
            Name
            <Input
              value={edit.name}
              list="song-section-names"
              disabled={disabled}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
          </label>
          <datalist id="song-section-names">
            {labels.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <label>
            Start (s)
            <Input
              type="number"
              min={0}
              max={length}
              step={0.01}
              value={edit.start}
              disabled={disabled}
              onChange={(e) =>
                setEdit({ ...edit, start: Number(e.target.value) })
              }
            />
          </label>
          <label>
            End (s)
            <Input
              type="number"
              min={0}
              max={length}
              step={0.01}
              value={edit.end}
              disabled={disabled}
              onChange={(e) =>
                setEdit({ ...edit, end: Number(e.target.value) })
              }
            />
          </label>
          <button disabled={disabled} onClick={commit}>
            Save section
          </button>
          <button
            disabled={disabled}
            onClick={() => {
              setEdit(null);
              setError('');
            }}
          >
            Cancel
          </button>
          {sections.some((s) => s.id === edit.id) && (
            <button
              disabled={disabled}
              aria-label={`Remove section ${edit.name}`}
              onClick={() => {
                onChange(sections.filter((s) => s.id !== edit.id));
                setEdit(null);
              }}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}
      {edit && splitId && (
        <p>
          Saving this section shortens “
          {sections.find((s) => s.id === splitId)?.name}” to end at the new
          start time.
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
