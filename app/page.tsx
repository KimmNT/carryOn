'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Circle,
  Square,
  Play,
  Repeat2,
  Download,
  Music2,
  Headphones,
  Keyboard,
  AudioLines,
  Check,
  Undo2,
} from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import {
  ROOTS,
  BASS_NOTES,
  splitQuality,
  joinQuality,
  QUALITIES,
  DEFAULT_PADS,
  chordLabel,
  chordNotes,
  chordNoteNames,
  recordedChord,
  replaceRecordedChord,
  createKeyGate,
  synthesize,
  SOUND_VERSION,
  takeLength,
  trimAudio,
  playbackPosition,
  renderTake,
  encodeWav,
  type Hit,
  type Pad,
  type Instrument,
} from '@/lib/instrument';

import { mixTracks } from '@/lib/instrument';
type Track = {
  name: string;
  instrument: Instrument;
  hits: Hit[];
  length: number;
  trim: [number, number];
  undo: { index: number; hit: Hit }[];
};
const emptyTrack = (name: string, instrument: Instrument): Track => ({
  name,
  instrument,
  hits: [],
  length: 0,
  trim: [0, 0],
  undo: [],
});
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
function ChordPicker({
  chord,
  onChange,
  prefix,
  allowOff = false,
  disabled = false,
}: {
  chord: Pad;
  onChange: (chord: Pad) => void;
  prefix: string;
  allowOff?: boolean;
  disabled?: boolean;
}) {
  const { family, extension } = splitQuality(chord.quality);
  const basic = family === 'major' || family === 'minor';
  return (
    <div className="chord-picker">
      <div>
        <span>Root</span>
        <Choice
          label={prefix + ' root'}
          value={String(chord.root)}
          options={ROOTS.map((label, value) => ({
            label,
            value: String(value),
          }))}
          onChange={(v) => onChange({ ...chord, root: Number(v) })}
          disabled={disabled}
        />
      </div>
      <div>
        <span>Chord family</span>
        <Choice
          label={prefix + ' family'}
          value={family}
          options={[
            { value: 'major', label: 'Major' },
            { value: 'minor', label: 'Minor' },
            { value: 'sus2', label: 'Sus 2' },
            { value: 'sus4', label: 'Sus 4' },
            { value: 'dim', label: 'Diminished' },
            ...(allowOff ? [{ value: 'off', label: 'Unassigned' }] : []),
          ]}
          onChange={(v) =>
            onChange({ ...chord, quality: joinQuality(v, extension) })
          }
          disabled={disabled}
        />
      </div>
      <div>
        <span>Extension</span>
        <Choice
          label={prefix + ' extension'}
          value={extension}
          options={[
            { value: 'none', label: 'None' },
            { value: '6', label: '6' },
            { value: '7', label: '7' },
            { value: 'maj7', label: 'Major 7' },
            { value: 'add9', label: 'Add 9' },
          ]}
          onChange={(v) =>
            onChange({ ...chord, quality: joinQuality(family, v) })
          }
          disabled={disabled || !basic}
        />
      </div>
      <div>
        <span>Bass / slash</span>
        <Choice
          label={prefix + ' bass'}
          value={chord.bass ?? 'none'}
          options={[
            { value: 'none', label: 'Default' },
            ...Object.keys(BASS_NOTES).map((value) => ({
              value,
              label: value,
            })),
          ]}
          onChange={(v) =>
            onChange({ ...chord, bass: v === 'none' ? undefined : v })
          }
          disabled={disabled || family === 'off'}
        />
      </div>
    </div>
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
    [editHit, setEditHit] = useState<number | null>(null),
    [replacement, setReplacement] = useState<Pad>({
      root: 0,
      quality: 'major',
    }),
    [undoEdits, setUndoEdits] = useState<{ index: number; hit: Hit }[]>([]),
    [length, setLength] = useState(0),
    [clock, setClock] = useState(0),
    [trim, setTrim] = useState<[number, number]>([0, 0]),
    [trimDraft, setTrimDraft] = useState<[string, string]>(['0.000', '0.000']),
    [status, setStatus] = useState('Ready when you are'),
    [exporting, setExporting] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([
    emptyTrack('Track 1', 'piano'),
  ]);
  const [trackIndex, setTrackIndex] = useState(0);
  const [monitor, setMonitor] = useState(true);
  const currentTracks = tracks.map((track, i) =>
    i === trackIndex
      ? { ...track, instrument, hits, length, trim, undo: undoEdits }
      : track,
  );
  const hasMix = currentTracks.some((t) => t.hits.length > 0);
  function switchTrack(index: number, adding = false) {
    if (modeRef.current !== 'idle' || exporting) return;
    silence();
    const next = adding
      ? [
          ...currentTracks,
          emptyTrack('Track ' + (tracks.length + 1), instrument),
        ]
      : currentTracks;
    const track = next[index];
    setTracks(next);
    setTrackIndex(index);
    setInstrument(track.instrument);
    setHits(track.hits);
    recorded.current = track.hits;
    setLength(track.length);
    updateTrim(...track.trim);
    setUndoEdits(track.undo);
    setEditHit(null);
    setClock(0);
    takeCache.current = null;
    setStatus(track.name + ' selected');
  }
  const takeCache = useRef<{
    hits: Hit[];
    length: number;
    rate: number;
    pcm: Float32Array;
  } | null>(null);
  const playbackRange = useRef({ offset: 0, duration: 0, loop: false });
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
  function playBuffer(
    ctx: AudioContext,
    buffer: AudioBuffer,
    when: number,
    loop = false,
  ) {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = loop;
    s.loopStart = 0;
    s.loopEnd = buffer.duration;
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
      chord: { ...p },
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
      updateTrim(0, total);
      setClock(total);
      silence();
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
      const backing = monitor
        ? mixTracks(
            currentTracks.filter((_, i) => i !== trackIndex),
            ctx.sampleRate,
          )
        : new Float32Array(0);
      let backingBuffer: AudioBuffer | null = null;
      if (backing.length) {
        backingBuffer = ctx.createBuffer(1, backing.length, ctx.sampleRate);
        backingBuffer.getChannelData(0).set(backing);
      }
      recorded.current = [];
      setHits([]);
      setEditHit(null);
      setUndoEdits([]);
      setLength(0);
      updateTrim(0, 0);
      takeCache.current = null;
      setClock(0);
      start.current = ctx.currentTime + 0.06;
      if (backingBuffer) playBuffer(ctx, backingBuffer, start.current);
      recording.current = true;
      modeRef.current = 'recording';
      setMode('recording');
      setStatus('Recording · play your chords');
    } catch {
      setStatus('Audio unavailable. Try again.');
    }
  }
  const isTrimmed = trim[0] > 0 || trim[1] < length;
  useEffect(() => {
    if (length > 0 && trim[1] === 0) updateTrim(0, length);
  }, [length, trim]);
  function updateTrim(from: number, to: number) {
    setTrim([from, to]);
    setTrimDraft([from.toFixed(3), to.toFixed(3)]);
  }
  function commitTrim(index: 0 | 1) {
    const value = Number(trimDraft[index]);
    if (!trimDraft[index].trim() || !Number.isFinite(value)) {
      setTrimDraft([trim[0].toFixed(3), trim[1].toFixed(3)]);
      return;
    }
    const from =
      index === 0 ? Math.max(0, Math.min(value, trim[1] - 0.001)) : trim[0];
    const to =
      index === 1
        ? Math.min(length, Math.max(value, trim[0] + 0.001))
        : trim[1];
    updateTrim(from, to);
    setClock(0);
    setStatus('Selection updated · original take kept');
  }
  function selectionAudio(rate: number) {
    let cached = takeCache.current;
    if (
      !cached ||
      cached.hits !== hits ||
      cached.rate !== rate ||
      cached.length !== length
    ) {
      cached = { hits, rate, length, pcm: renderTake(hits, length, rate) };
      takeCache.current = cached;
    }
    return trimAudio(cached.pcm, rate, trim[0], trim[1]);
  }
  async function replay(loop = false, all = false) {
    try {
      const ctx = await unlock();
      silence();
      const pcm = all
        ? mixTracks(currentTracks, ctx.sampleRate)
        : selectionAudio(ctx.sampleRate);
      const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
      buffer.getChannelData(0).set(pcm);
      // Prepare the selected audio before starting the playback clock.
      start.current = ctx.currentTime + 0.06;
      playbackRange.current = {
        offset: all ? 0 : trim[0],
        duration: buffer.duration,
        loop,
      };
      endTime.current = start.current + buffer.duration;
      playBuffer(ctx, buffer, start.current, loop);
      setClock(0);
      modeRef.current = 'playing';
      setMode('playing');
      setStatus(
        all
          ? loop
            ? 'Looping all tracks'
            : 'Playing all tracks'
          : loop
            ? 'Looping selected range · press Stop to finish'
            : isTrimmed
              ? 'Playing selected range once'
              : 'Playing your full take once',
      );
    } catch {
      silence();
      setStatus('Playback could not start.');
    }
  }
  function selectRecordedHit(index: number) {
    if (modeRef.current !== 'idle' || exporting || !hits[index]) return;
    setEditHit(index);
    setReplacement(recordedChord(hits[index]));
  }
  function applyRecordedEdit() {
    if (modeRef.current !== 'idle' || exporting || editHit === null) return;
    const previous = hits[editHit];
    const next = replaceRecordedChord(hits, editHit, replacement);
    if (previous.label === next[editHit].label) return;
    silence();
    setUndoEdits((history) => [...history, { index: editHit, hit: previous }]);
    recorded.current = next;
    setHits(next);
    takeCache.current = null;
    setStatus(
      `${previous.label} replaced with ${next[editHit].label} at ${previous.time.toFixed(3)} s · timing kept`,
    );
  }
  function undoRecordedEdit() {
    if (modeRef.current !== 'idle' || exporting || !undoEdits.length) return;
    const last = undoEdits[undoEdits.length - 1];
    const next = hits.map((hit, index) =>
      index === last.index ? last.hit : hit,
    );
    silence();
    recorded.current = next;
    setHits(next);
    takeCache.current = null;
    setUndoEdits((history) => history.slice(0, -1));
    setEditHit(last.index);
    setReplacement(recordedChord(last.hit));
    setStatus(`Edit undone · ${last.hit.label} restored`);
  }
  async function download(all = false) {
    setExporting(true);
    setStatus('Preparing WAV…');
    try {
      await new Promise((r) => setTimeout(r, 30));
      const rate = audio.current?.sampleRate ?? 44100;
      const wav = encodeWav(
        all ? mixTracks(currentTracks, rate) : selectionAudio(rate),
        rate,
      );
      const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `carryon-${new Date().toISOString().replace(/[:.]/g, '-')}.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStatus(
        all
          ? 'All tracks downloaded as a mix'
          : isTrimmed
            ? 'Selected range downloaded · original take kept'
            : 'Full take downloaded',
      );
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
      const position =
        mode === 'playing'
          ? playbackPosition(
              t,
              playbackRange.current.duration,
              playbackRange.current.loop,
            )
          : t;
      setClock(position);
      if (mode === 'recording' && t >= 180) {
        stopRef.current();
        setStatus('Three-minute take complete · ready to export');
      }
      if (mode === 'playing') {
        setActive(
          hits
            .filter(
              (h) =>
                position + playbackRange.current.offset >= h.time &&
                t + playbackRange.current.offset < h.time + h.duration,
            )
            .map((h) => h.pad),
        );
        if (!playbackRange.current.loop && ctx.currentTime >= endTime.current) {
          setMode('idle');
          modeRef.current = 'idle';
          setClock(playbackRange.current.duration);
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
  const scale = mode === 'recording' ? Math.max(8, clock + 2) : length || 8,
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
          <ChordPicker
            chord={chosen}
            prefix="Chord"
            allowOff
            onChange={(chord) =>
              setPads((p) => p.map((x, i) => (i === selected ? chord : x)))
            }
          />
          <p>
            Choose a family, then an extension. Bass adds the note after the
            slash. Sus and diminished use no extension.
          </p>
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
                    ? playbackRange.current.loop
                      ? '↻ LOOP'
                      : '▶ PLAY'
                    : 'TAKE'}
              </span>
              {fmt(clock)}
            </div>
          </div>
          <section className="layer-panel" aria-label="Recording tracks">
            <div className="layer-tabs">
              {currentTracks.map((track, i) => (
                <button
                  key={i}
                  aria-pressed={i === trackIndex}
                  disabled={mode !== 'idle' || exporting}
                  onClick={() => switchTrack(i)}
                >
                  {track.name} · {track.instrument}{' '}
                  <small>
                    {track.hits.length
                      ? (track.trim[1] - track.trim[0]).toFixed(1) + ' s'
                      : 'Empty'}
                  </small>
                </button>
              ))}
              <button
                disabled={mode !== 'idle' || exporting}
                onClick={() => switchTrack(tracks.length, true)}
              >
                + Add track
              </button>
            </div>
            <p>
              Recording, trimming and chord edits affect the selected track.
              Trimmed tracks start together from zero.
            </p>
            <label>
              <input
                type="checkbox"
                checked={monitor}
                onChange={(e) => setMonitor(e.target.checked)}
                disabled={mode !== 'idle' || exporting}
              />{' '}
              Hear other tracks while recording
            </label>
            <div className="layer-actions">
              <button
                disabled={!hasMix || mode !== 'idle' || exporting}
                onClick={() => replay(false, true)}
              >
                Play all tracks
              </button>
              <button
                disabled={!hasMix || mode !== 'idle' || exporting}
                onClick={() => replay(true, true)}
              >
                Loop all tracks
              </button>
              <button
                disabled={!hasMix || mode !== 'idle' || exporting}
                onClick={() => download(true)}
              >
                Download mix
              </button>
            </div>
          </section>
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
                  <button
                    key={i}
                    disabled={mode !== 'idle' || exporting}
                    onClick={() => selectRecordedHit(i)}
                    aria-label={`Edit recorded chord ${i + 1}: ${h.label} at ${h.time.toFixed(3)} seconds`}
                    aria-pressed={editHit === i}
                    title={`${h.label} at ${h.time.toFixed(3)}s · ${h.duration}s · ${h.instrument}`}
                    className={`clip ${editHit === i ? 'selected-clip' : ''}`}
                    style={{
                      left: `${(h.time / scale) * 100}%`,
                      width: `${(h.duration / scale) * 100}%`,
                      top: 8 + (h.pad % 4) * 27,
                      background: COLORS[h.pad],
                    }}
                  >
                    {h.label}
                  </button>
                ))
              )}
              {hits.length > 0 && mode !== 'recording' && (
                <>
                  <div
                    className="trim-shade"
                    style={{ left: 0, width: `${(trim[0] / scale) * 100}%` }}
                  />
                  <div
                    className="trim-shade"
                    style={{ left: `${(trim[1] / scale) * 100}%`, right: 0 }}
                  />
                  <div
                    className="trim-edge"
                    style={{ left: `${(trim[0] / scale) * 100}%` }}
                  />
                  <div
                    className="trim-edge"
                    style={{ left: `${(trim[1] / scale) * 100}%` }}
                  />
                </>
              )}
              {mode !== 'idle' && (
                <div
                  className="playhead"
                  style={{
                    left: `${Math.min(100, ((clock + (mode === 'playing' ? playbackRange.current.offset : 0)) / scale) * 100)}%`,
                  }}
                />
              )}
            </div>
          </div>
          {hits.length > 0 && mode !== 'recording' && (
            <section
              className="recorded-editor"
              aria-label="Edit recorded chord"
            >
              <div className="recorded-editor-heading">
                <h3>Correct a chord</h3>
                <button
                  className="undo-edit"
                  disabled={!undoEdits.length || mode !== 'idle' || exporting}
                  onClick={undoRecordedEdit}
                >
                  <Undo2 size={15} /> Undo edit
                </button>
              </div>
              <p>
                Click a chord in the timeline, or choose it here. Only that
                occurrence changes.
              </p>
              <Choice
                label="Recorded chord"
                value={editHit === null ? 'none' : String(editHit)}
                options={[
                  { value: 'none', label: 'Choose a recorded chord' },
                  ...hits.map((hit, index) => ({
                    value: String(index),
                    label: `${index + 1}. ${hit.label} · ${hit.time.toFixed(3)} s`,
                  })),
                ]}
                onChange={(value) => {
                  if (value === 'none') setEditHit(null);
                  else selectRecordedHit(Number(value));
                }}
                disabled={mode !== 'idle' || exporting}
              />
              {editHit !== null && hits[editHit] && (
                <>
                  <div className="replacement-fields">
                    <ChordPicker
                      chord={replacement}
                      prefix="Replacement"
                      onChange={setReplacement}
                      disabled={mode !== 'idle' || exporting}
                    />
                    <button
                      className="replace-chord"
                      onClick={applyRecordedEdit}
                      disabled={
                        mode !== 'idle' ||
                        exporting ||
                        hits[editHit].label === chordLabel(replacement)
                      }
                    >
                      Replace {hits[editHit].label} with{' '}
                      {chordLabel(replacement)}
                    </button>
                  </div>
                  <small>
                    {hits[editHit].time.toFixed(3)} s ·{' '}
                    {hits[editHit].duration.toFixed(1)} s duration ·{' '}
                    {hits[editHit].instrument} · Timing and sound settings stay
                    the same
                  </small>
                </>
              )}
            </section>
          )}
          {hits.length > 0 && mode !== 'recording' && (
            <section className="trim-panel" aria-label="Trim recording">
              <div className="trim-heading">
                <h3>Trim your take</h3>
                <span>
                  <b>{(trim[1] - trim[0]).toFixed(3)} s</b> selected /{' '}
                  {length.toFixed(3)} s original
                </span>
              </div>
              <Slider
                className="trim-slider"
                aria-label="Selected audio range"
                min={0}
                max={length}
                step={0.001}
                minStepsBetweenValues={1}
                value={trim}
                disabled={mode !== 'idle' || exporting}
                onValueChange={(value) => {
                  if (Array.isArray(value)) {
                    updateTrim(value[0], value[1]);
                    setClock(0);
                    setStatus('Selection updated · original take kept');
                  }
                }}
              />
              <div className="trim-fields">
                {([0, 1] as const).map((index) => (
                  <label key={index} htmlFor={`trim-${index}`}>
                    {index === 0 ? 'Start (seconds)' : 'End (seconds)'}
                    <Input
                      id={`trim-${index}`}
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      min={index === 0 ? 0 : trim[0] + 0.001}
                      max={index === 0 ? trim[1] - 0.001 : length}
                      value={trimDraft[index]}
                      disabled={mode !== 'idle' || exporting}
                      onChange={(event) =>
                        setTrimDraft((draft) =>
                          index === 0
                            ? [event.target.value, draft[1]]
                            : [draft[0], event.target.value],
                        )
                      }
                      onBlur={() => commitTrim(index)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                      }}
                    />
                  </label>
                ))}
                <button
                  className="reset-trim"
                  disabled={!isTrimmed || mode !== 'idle' || exporting}
                  onClick={() => {
                    updateTrim(0, length);
                    setClock(0);
                    setStatus('Full take restored');
                  }}
                >
                  Reset to full take
                </button>
              </div>
              <p>
                Drag either handle or enter exact times. Replay and download use
                this range. Your original stays intact.
              </p>
            </section>
          )}
          <div className="transport">
            <div className="transport-buttons">
              <button
                className="record-button"
                disabled={mode !== 'idle' || exporting}
                onClick={record}
              >
                <Circle size={15} fill="currentColor" />
                {hits.length ? 'Re-record this track' : 'Record this track'}
              </button>
              <button disabled={mode === 'idle'} onClick={stop}>
                <Square size={15} fill="currentColor" />
                Stop
              </button>
              <button
                disabled={!hits.length || mode !== 'idle' || exporting}
                onClick={() => replay(false)}
              >
                <Play size={15} fill="currentColor" />
                Replay this track
              </button>
              <button
                disabled={!hits.length || mode !== 'idle' || exporting}
                onClick={() => replay(true)}
                aria-label="Loop selected range"
              >
                <Repeat2 size={16} />
                Loop
              </button>
            </div>
            <button
              className="download"
              disabled={!hits.length || mode !== 'idle' || exporting}
              onClick={() => download()}
            >
              <Download size={17} />
              {exporting
                ? 'Preparing…'
                : isTrimmed
                  ? 'Download trimmed WAV'
                  : 'Download WAV'}
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
