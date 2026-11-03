'use client';
import { memo } from 'react';
import type { PositionedPianoEvent, PianoEvent } from '@/lib/session-events';

export const SessionPianoEvents = memo(function SessionPianoEvents({
  blocks,
  length,
  color,
  muted,
  disabled,
  selected,
  name,
  track,
  onSelect,
}: {
  blocks: PositionedPianoEvent[];
  length: number;
  color: string;
  muted?: boolean;
  disabled: boolean;
  selected?: string;
  name: string;
  track: number;
  onSelect: (track: number, event: PianoEvent) => void;
}) {
  return (
    <div
      className={`piano-event-lane ${muted ? 'is-muted' : ''}`}
      aria-label={`${name} note and chord blocks`}
    >
      {blocks.map((block) => (
        <button
          key={`${block.id}-${block.repeat}`}
          className={`piano-event-block ${block.chord ? 'is-chord' : ''} ${selected === block.id ? 'is-selected' : ''}`}
          style={
            {
              left: `${(block.start / length) * 100}%`,
              width: `${((block.end - block.start) / length) * 100}%`,
              top: 14 + block.lane * 36,
              '--track-color': color,
            } as React.CSSProperties
          }
          aria-label={`${block.label} in ${name} at ${block.start.toFixed(2)} seconds, ${block.notes.length > 1 ? 'chord or note group' : 'note'}`}
          aria-pressed={selected === block.id}
          title={`${block.label} · ${block.start.toFixed(3)}–${block.end.toFixed(3)}s · Click to edit${block.repeat ? ' (edits all repeats)' : ''}`}
          disabled={disabled}
          onClick={() => onSelect(track, block)}
        >
          <strong>{block.label}</strong>
          <small>{(block.end - block.start).toFixed(2)}s</small>
        </button>
      ))}
      {!blocks.length && (
        <span className="piano-event-empty">No notes in this layer</span>
      )}
    </div>
  );
});
