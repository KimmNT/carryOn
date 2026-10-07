'use client';
import { useEffect, useRef, useState } from 'react';
import { Upload, Piano, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import type { CoverLayer } from '@/lib/piano-cover';

export function PianoCoverImport({
  disabled,
  onImport,
}: {
  disabled: boolean;
  onImport: (name: string, layers: CoverLayer[], length: number) => boolean;
}) {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [range, setRange] = useState<[string, string]>(['0', '0']);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const operation = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const original = useRef<HTMLAudioElement | null>(null);
  const importCallback = useRef(onImport);
  useEffect(() => {
    importCallback.current = onImport;
  }, [onImport]);
  useEffect(() => {
    if (disabled || busy) original.current?.pause();
  }, [disabled, busy]);
  useEffect(() => () => operation.current?.abort(), []);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  async function open(file: File) {
    if (file.size > 80 * 1024 * 1024) {
      setError('Choose an audio file smaller than 80 MB.');
      return;
    }
    const controller = new AbortController();
    operation.current?.abort();
    operation.current = controller;
    setBusy(true);
    setError('');
    setMessage('Reading audio…');
    setPercent(0);
    const ctx = new AudioContext();
    try {
      const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
      if (controller.signal.aborted) return;
      if (decoded.duration > 600)
        throw new Error(
          'This first version supports songs up to 10 minutes. Choose a shorter file.',
        );
      if (decoded.duration < 0.2)
        throw new Error('Choose a longer audio recording.');
      setBuffer(decoded);
      setName(file.name.replace(/\.[^.]+$/, ''));
      setRange(['0', String(Math.floor(decoded.duration * 1000) / 1000)]);
      setUrl(URL.createObjectURL(file));
      setMessage('Audio ready. Choose the full song or a shorter passage.');
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : 'This audio format could not be opened. Try WAV or MP3.',
        );
    } finally {
      await ctx.close();
      if (operation.current === controller) setBusy(false);
    }
  }
  async function convert() {
    if (!buffer) return;
    const from = Number(range[0]),
      to = Number(range[1]);
    if (
      !range.every((s) => s.trim()) ||
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from < 0 ||
      to > buffer.duration ||
      to - from < 0.2
    ) {
      setError(
        'Choose a start and end within the song, at least 0.2 seconds apart.',
      );
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    original.current?.pause();
    setBusy(true);
    setError('');
    setPercent(0);
    try {
      const { transcribeAudio } = await import('@/lib/transcribe-audio');
      const result = await transcribeAudio(
        buffer,
        from,
        to,
        controller.signal,
        (p, m) => {
          setPercent(p);
          setMessage(m);
        },
      );
      if (controller.signal.aborted) return;
      if (!importCallback.current(name, result.layers, result.length))
        throw new Error(
          'The cover could not be saved. Free some browser storage and try again.',
        );
      setPercent(100);
      setMessage(
        'Piano cover added to Session. Solo a layer to check it, then edit the notes.',
      );
    } catch (e) {
      if (controller.signal.aborted)
        setMessage('Conversion cancelled. Your Session is unchanged.');
      else
        setError(
          e instanceof Error
            ? e.message
            : 'Conversion failed. Try a shorter passage.',
        );
    } finally {
      if (operation.current === controller) setBusy(false);
    }
  }
  return (
    <section className="cover-import" aria-label="Create a piano cover">
      <div className="cover-import-heading">
        <div>
          <p className="eyebrow">AUDIO TO PIANO</p>
          <h3>Bring a song into Session</h3>
        </div>
        <span className="cover-badge">
          <Piano size={16} /> Piano cover · experimental
        </span>
      </div>
      <p>
        Turn an audio file into editable melody, bass, and accompaniment layers.
        Mixed songs may need note corrections.
      </p>
      <div className="cover-import-actions">
        <input
          ref={input}
          type="file"
          accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg"
          aria-label="Import song audio"
          disabled={disabled || busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void open(file);
            e.target.value = '';
          }}
        />
        <button
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} />{' '}
          {buffer ? 'Choose another song' : 'Choose audio file'}
        </button>
        <span className="cover-file-name">
          {buffer
            ? `${name} · ${buffer.duration.toFixed(1)} seconds`
            : 'MP3, WAV, and browser-supported audio · up to 10 min / 80 MB'}
        </span>
      </div>
      {buffer && (
        <>
          <div className="cover-range">
            <label>
              Start (seconds)
              <Input
                type="number"
                min={0}
                max={buffer.duration}
                step={0.01}
                value={range[0]}
                disabled={disabled || busy}
                onChange={(e) => setRange([e.target.value, range[1]])}
              />
            </label>
            <label>
              End (seconds)
              <Input
                type="number"
                min={0}
                max={buffer.duration}
                step={0.01}
                value={range[1]}
                disabled={disabled || busy}
                onChange={(e) => setRange([range[0], e.target.value])}
              />
            </label>
            <button
              className="cover-convert"
              disabled={disabled || busy}
              onClick={() => void convert()}
            >
              <Piano size={16} /> Create piano cover
            </button>
            {busy && (
              <button onClick={() => operation.current?.abort()}>
                <X size={16} /> Cancel
              </button>
            )}
          </div>
          <label className="cover-original">
            Original song
            <audio
              ref={original}
              src={url}
              controls
              preload="metadata"
              onPlay={() => {
                if (busy || disabled) original.current?.pause();
              }}
            />
          </label>
        </>
      )}
      {busy && <Progress value={percent} aria-label="Piano cover progress" />}
      <div
        aria-live="polite"
        className={error ? 'cover-error' : 'cover-message'}
      >
        {error || message}
      </div>
      <small>
        Audio is analyzed on this device. Melody and bass are estimated from
        pitch; layers are editable piano parts. Section labels are added
        manually.
      </small>
    </section>
  );
}
