'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Circle,
  Square,
  Play,
  Download,
  Music2,
  Headphones,
  Keyboard,
  AudioLines,
  Check,
} from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  ROOTS,
  QUALITIES,
  DEFAULT_PADS,
  chordLabel,
  chordNotes,
  chordNoteNames,
  createKeyGate,
  synthesize,
  SOUND_VERSION,
  takeLength,
  scheduleTake,
  renderTake,
  encodeWav,
  type Hit,
  type Pad,
  type Instrument,
} from '@/lib/instrument';

const COLORS = [
  '#b9fa73',
  '#7ed6ff',
  '#c6a0ff',
  '#ffb779',
  '#7ce2cb',
  '#ff91b0',
  '#c9df6f',
  '#94b8ff',
  '#dcb3ed',
  '#ffd578',
];
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
function Choice({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => v !== null && onChange(v)}
      disabled={disabled}
    >
      <SelectTrigger aria-label={label} className="choice">
        <SelectValue>
          {options.find((o) => o.value === value)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
const fmt = (t: number) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
export default function Home() {
  const [pads, setPads] = useState<Pad[]>(DEFAULT_PADS),
    [instrument, setInstrument] = useState<Instrument>('piano'),
    [duration, setDuration] = useState(2.4),
    [volume, setVolume] = useState(0.7),
    [selected, setSelected] = useState(0),
    [active, setActive] = useState<number[]>([]),
    [mode, setMode] = useState<'idle' | 'recording' | 'playing'>('idle'),
    [hits, setHits] = useState<Hit[]>([]),
    [length, setLength] = useState(0),
    [clock, setClock] = useState(0),
    [status, setStatus] = useState('Ready when you are'),
    [exporting, setExporting] = useState(false);
  const buffers = useRef(new Map<string, AudioBuffer>());
  const audio = useRef<AudioContext | null>(null),
    sources = useRef(new Set<AudioBufferSourceNode>()),
    recording = useRef(false),
    start = useRef(0),
    recorded = useRef<Hit[]>([]),
    endTime = useRef(0),
    modeRef = useRef(mode),
    settings = useRef({ pads, instrument, duration, volume }),
    triggerRef = useRef<(i: number) => void>(() => {}),
    stopRef = useRef(() => {});
  settings.current = { pads, instrument, duration, volume };
  modeRef.current = mode;
  async function unlock() {
    if (!audio.current || audio.current.state === 'closed')
      audio.current = new AudioContext();
    if (audio.current.state !== 'running') await audio.current.resume();
    return audio.current;
  }
  function silence() {
    sources.current.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    sources.current.clear();
    setActive([]);
  }
  function prepareHit(ctx: AudioContext, h: Hit) {
    const key = JSON.stringify([
      SOUND_VERSION,
      ctx.sampleRate,
      h.notes,
      h.instrument,
      h.duration,
      h.volume,
    ]);
    const cached = buffers.current.get(key);
    if (cached) return cached;
    const pcm = synthesize(h, ctx.sampleRate),
      buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
    buffer.getChannelData(0).set(pcm);
    if (buffers.current.size >= 64)
      buffers.current.delete(buffers.current.keys().next().value!);
    buffers.current.set(key, buffer);
    return buffer;
  }
  function playBuffer(ctx: AudioContext, buffer: AudioBuffer, when: number) {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.connect(ctx.destination);
    sources.current.add(s);
    s.onended = () => {
      sources.current.delete(s);
      s.disconnect();
    };
    s.start(when);
  }

  async function trigger(i: number) {
    if (modeRef.current === 'playing') return;
    const s = settings.current,
      p = s.pads[i];
    if (!p || p.quality === 'off') return;
    const snapshot: Hit = {
      pad: i,
      time: 0,
      notes: chordNotes(p),
      label: chordLabel(p),
      instrument: s.instrument,
      duration: s.duration,
      volume: s.volume,
    };
    try {
      const ctx = await unlock();
      if ((modeRef.current as string) === 'playing') return;
      const buffer = prepareHit(ctx, snapshot);
      const when = ctx.currentTime + 0.012;
      snapshot.time = recording.current ? Math.max(0, when - start.current) : 0;
      playBuffer(ctx, buffer, when);
      if (recording.current) {
        recorded.current.push(snapshot);
        setHits([...recorded.current]);
      }
      setActive((a) => [...new Set([...a, i])]);
      setTimeout(() => setActive((a) => a.filter((n) => n !== i)), 180);
      setStatus(`${snapshot.label} · ${s.instrument}`);
    } catch {
      setStatus('Audio could not start. Try clicking a pad again.');
    }
  }
  triggerRef.current = (i) => {
    void trigger(i);
  };
  function stop() {
    if (recording.current) {
      recording.current = false;
      const elapsed = Math.max(
        0,
        (audio.current?.currentTime ?? start.current) - start.current,
      );
      const total = takeLength(recorded.current, elapsed);
      setLength(total);
      setClock(total);
      setStatus(
        recorded.current.length
          ? 'Take ready · chord tails preserved'
          : 'No chords recorded. Press Record to try again.',
      );
    } else if (modeRef.current === 'playing') {
      silence();
      setClock(0);
      setStatus('Playback stopped');
    }
    modeRef.current = 'idle';
    setMode('idle');
  }
  stopRef.current = stop;
  async function record() {
    try {
      const ctx = await unlock();
      silence();
      recorded.current = [];
      setHits([]);
      setLength(0);
      setClock(0);
      start.current = ctx.currentTime + 0.012;
      recording.current = true;
      modeRef.current = 'recording';
      setMode('recording');
      setStatus('Recording · play your chords');
    } catch {
      setStatus('Audio unavailable. Try again.');
    }
  }
  async function replay() {
    try {
      const ctx = await unlock();
      silence();
      start.current = scheduleTake(
        hits,
        (h) => prepareHit(ctx, h),
        () => ctx.currentTime,
        (buffer, time) => playBuffer(ctx, buffer, time),
      );
      endTime.current = start.current + length;
      setClock(0);
      modeRef.current = 'playing';
      setMode('playing');
      setStatus('Playing your take');
    } catch {
      silence();
      setStatus('Playback could not start.');
    }
  }
  async function download() {
    setExporting(true);
    setStatus('Preparing WAV…');
    try {
      await new Promise((r) => setTimeout(r, 30));
      const rate = audio.current?.sampleRate ?? 44100;
      const wav = encodeWav(renderTake(hits, length, rate), rate);
      const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `carryon-${new Date().toISOString().replace(/[:.]/g, '-')}.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStatus('WAV downloaded');
    } catch {
      setStatus('Could not export this take. Try a shorter recording.');
    } finally {
      setExporting(false);
    }
  }
  useEffect(() => {
    const gate = createKeyGate();
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (
        target.closest(
          'input,textarea,select,[role="combobox"],[role="listbox"],[role="slider"],[contenteditable="true"]',
        )
      )
        return;
      const i = gate.down(e.code, e.repeat);
      if (i >= 0) {
        e.preventDefault();
        triggerRef.current(i);
      }
    };
    const up = (e: KeyboardEvent) => gate.up(e.code);
    const blur = () => gate.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      const context = audio.current;
      audio.current = null;
      sources.current.clear();
      if (context && context.state !== 'closed')
        void context.close().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (mode === 'idle') return;
    const timer = setInterval(() => {
      const ctx = audio.current;
      if (!ctx) return;
      const t = Math.max(0, ctx.currentTime - start.current);
      setClock(t);
      if (mode === 'recording' && t >= 180) {
        stopRef.current();
        setStatus('Three-minute take complete · ready to export');
      }
      if (mode === 'playing') {
        setActive(
          hits
            .filter((h) => t >= h.time && t < h.time + 0.18)
            .map((h) => h.pad),
        );
        if (ctx.currentTime >= endTime.current) {
          setMode('idle');
          modeRef.current = 'idle';
          setClock(length);
          setStatus('Playback complete');
          setActive([]);
        }
      }
    }, 30);
    return () => clearInterval(timer);
  }, [mode, hits, length]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => void;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      context.registerTool(
        {
          name: 'configure_chord_pads',
          description:
            'Assign up to ten chord pads. Changes the visible pad collection.',
          inputSchema: {
            type: 'object',
            properties: {
              pads: {
                type: 'array',
                minItems: 1,
                maxItems: 10,
                items: {
                  type: 'object',
                  properties: {
                    root: { type: 'integer', minimum: 0, maximum: 11 },
                    quality: { type: 'string', enum: Object.keys(QUALITIES) },
                  },
                  required: ['root', 'quality'],
                  additionalProperties: false,
                },
              },
            },
            required: ['pads'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: (input: unknown) => {
            const p = (input as { pads?: Pad[] })?.pads;
            if (
              !Array.isArray(p) ||
              p.length < 1 ||
              p.length > 10 ||
              p.some(
                (x) =>
                  !x ||
                  !Number.isInteger(x.root) ||
                  x.root < 0 ||
                  x.root > 11 ||
                  !Object.hasOwn(QUALITIES, x.quality),
              )
            )
              throw new Error('Provide 1–10 valid root and quality pairs.');
            if (modeRef.current !== 'idle')
              throw new Error('Stop the performance first.');
            const next = Array.from({ length: 10 }, (_, i) =>
              p[i]
                ? { root: p[i].root, quality: p[i].quality }
                : { root: 0, quality: 'off' },
            );
            settings.current = { ...settings.current, pads: next };
            setPads(next);
            return { pads: next.map(chordLabel) };
          },
        },
        { signal: lifecycle.signal },
      );
    } catch {
      /* Optional browser capability. */
    }
    return () => lifecycle.abort();
  }, []);
  const scale = Math.max(8, mode === 'recording' ? clock + 2 : length),
    chosen = pads[selected];
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/" aria-label="CarryOn home">
          <span className="brand-icon">
            <AudioLines size={23} />
          </span>
          carry<span>on</span>
          <small>CHORD STUDIO</small>
        </a>
        <span className="local-note">
          <Headphones size={15} /> Headphones recommended
        </span>
      </header>
      <div className="workspace">
        <div className="title-row">
          <div>
            <p className="eyebrow">YOUR HANDS. YOUR TIMING.</p>
            <h1>Find your progression.</h1>
            <p className="intro">
              Press <kbd>1</kbd> through <kbd>0</kbd> or tap a pad. Every press
              plays one complete chord.
            </p>
          </div>
          <span className="session-label">
            <span /> LIVE SESSION
          </span>
        </div>
        <section className="soundbar" aria-label="Instrument settings">
          <div className="sound-icon">
            <Music2 />
          </div>
          <div className="field instrument">
            <label>Instrument</label>
            <Choice
              label="Instrument"
              value={instrument}
              onChange={(v) => setInstrument(v as Instrument)}
              options={[
                { value: 'piano', label: 'Piano' },
                { value: 'guitar', label: 'Guitar' },
                { value: 'organ', label: 'Organ' },
              ]}
            />
            <small>
              {instrument === 'piano'
                ? 'Soft hammer · decaying strings'
                : instrument === 'guitar'
                  ? 'Plucked strings · gentle strum'
                  : 'Warm drawbars · sustained tone'}
              <br />
              Synthesized approximation
            </small>
          </div>
          <div className="field duration">
            <label>
              Chord duration <b>{duration.toFixed(1)} s</b>
            </label>
            <Slider
              aria-label="Chord duration"
              min={0.4}
              max={5}
              step={0.1}
              value={[duration]}
              onValueChange={(v) => setDuration(Array.isArray(v) ? v[0] : v)}
            />
            <small>Plays out after you release the key</small>
          </div>
          <div className="field volume">
            <label>
              Volume <b>{Math.round(volume * 100)}%</b>
            </label>
            <Slider
              aria-label="Volume"
              min={0}
              max={1}
              step={0.01}
              value={[volume]}
              onValueChange={(v) => setVolume(Array.isArray(v) ? v[0] : v)}
            />
          </div>
        </section>
        <div className="section-heading">
          <h2>
            Chord pads <span>10 keys, endless combinations</span>
          </h2>
          <span className="keyboard-note">
            <Keyboard size={16} /> Keyboard ready
          </span>
        </div>
        <section className="pad-grid" aria-label="Chord pads">
          {pads.map((p, i) => (
            <div
              key={i}
              className={`pad-shell ${selected === i ? 'selected' : ''} ${active.includes(i) ? 'active' : ''}`}
              style={{ '--pad-color': COLORS[i] } as React.CSSProperties}
            >
              <button
                className="pad"
                disabled={mode === 'playing' || p.quality === 'off'}
                onClick={() => triggerRef.current(i)}
                aria-label={`Play ${chordLabel(p)}, key ${KEYS[i]}`}
              >
                <span className="pad-top">
                  <kbd>{KEYS[i]}</kbd>
                  <span className="pad-light" />
                </span>
                <strong>{chordLabel(p)}</strong>
                <span className="note-names">
                  {chordNoteNames(p).join(' · ') || 'No chord assigned'}
                </span>
                <span className="pad-lines">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </button>
              <button
                className="edit-pad"
                onClick={() => setSelected(i)}
                aria-label={`Edit pad ${KEYS[i]}`}
              >
                {selected === i ? (
                  <>
                    <Check size={12} /> Editing
                  </>
                ) : (
                  'Edit chord'
                )}
              </button>
            </div>
          ))}
        </section>
        <section className="editor" aria-label="Edit selected chord">
          <div>
            <span className="edit-key" style={{ color: COLORS[selected] }}>
              {KEYS[selected]}
            </span>
            <strong>Edit pad {KEYS[selected]}</strong>
          </div>
          <Choice
            label="Chord root"
            value={String(chosen.root)}
            options={ROOTS.map((r, i) => ({ value: String(i), label: r }))}
            onChange={(v) =>
              setPads((p) =>
                p.map((x, i) =>
                  i === selected ? { ...x, root: Number(v) } : x,
                ),
              )
            }
          />
          <Choice
            label="Chord type"
            value={chosen.quality}
            options={Object.entries(QUALITIES).map(([value, q]) => ({
              value,
              label: q.label,
            }))}
            onChange={(v) =>
              setPads((p) =>
                p.map((x, i) => (i === selected ? { ...x, quality: v } : x)),
              )
            }
          />
          <p>Choose a root and chord type. Use “Unassigned” for fewer pads.</p>
        </section>
        <section className="recorder" aria-label="Performance recorder">
          <div className="recorder-head">
            <div>
              <p className="eyebrow">PERFORMANCE</p>
              <h2>Your take</h2>
            </div>
            <div
              className={`time-display ${mode === 'recording' ? 'is-recording' : ''}`}
            >
              <span>
                {mode === 'recording'
                  ? '● REC'
                  : mode === 'playing'
                    ? '▶ PLAY'
                    : 'TAKE'}
              </span>
              {fmt(clock)}
            </div>
          </div>
          <div className="timeline">
            <div className="ruler">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i}>{((scale * i) / 4).toFixed(1)}s</span>
              ))}
            </div>
            <div className="tracks">
              {hits.length === 0 ? (
                <div className="empty-take">
                  <AudioLines size={25} />
                  <p>
                    {mode === 'recording'
                      ? 'Listening for your first chord…'
                      : 'A little space for your next idea.'}
                    <small>
                      {mode === 'recording'
                        ? 'Play a number key or tap a pad.'
                        : 'Press Record, play freely, then Stop.'}
                    </small>
                  </p>
                </div>
              ) : (
                hits.map((h, i) => (
                  <div
                    key={i}
                    title={`${h.label} at ${h.time.toFixed(3)}s · ${h.duration}s · ${h.instrument}`}
                    className="clip"
                    style={{
                      left: `${(h.time / scale) * 100}%`,
                      width: `${(h.duration / scale) * 100}%`,
                      top: 8 + (h.pad % 4) * 27,
                      background: COLORS[h.pad],
                    }}
                  >
                    {h.label}
                  </div>
                ))
              )}
              {mode !== 'idle' && (
                <div
                  className="playhead"
                  style={{ left: `${Math.min(100, (clock / scale) * 100)}%` }}
                />
              )}
            </div>
          </div>
          <div className="transport">
            <div className="transport-buttons">
              <button
                className="record-button"
                disabled={mode !== 'idle' || exporting}
                onClick={record}
              >
                <Circle size={15} fill="currentColor" />
                {hits.length ? 'Record new take' : 'Record'}
              </button>
              <button disabled={mode === 'idle'} onClick={stop}>
                <Square size={15} fill="currentColor" />
                Stop
              </button>
              <button
                disabled={!hits.length || mode !== 'idle' || exporting}
                onClick={replay}
              >
                <Play size={15} fill="currentColor" />
                Replay
              </button>
            </div>
            <button
              className="download"
              disabled={!hits.length || mode !== 'idle' || exporting}
              onClick={download}
            >
              <Download size={17} />
              {exporting ? 'Preparing…' : 'Download WAV'}
            </button>
          </div>
          <div className="take-meta">
            <span role="status">{status}</span>
            <span>
              {hits.length} chord{hits.length === 1 ? '' : 's'} ·{' '}
              {length.toFixed(2)} s{' '}
              <span className="desktop-only">· No quantization</span>
            </span>
          </div>
        </section>
        <footer>
          <span>Make a progression. Make it yours.</span>
          <span>
            Audio stays in this tab · 3-minute takes · Download before closing
          </span>
        </footer>
      </div>
    </main>
  );
}
