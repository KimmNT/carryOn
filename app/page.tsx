'use client';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
  Trash2,
  Minus,
  Plus,
  Timer,
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
  takeLength,
  trimAudio,
  playbackPosition,
  renderTake,
  encodeWav,
  clampTrackStart,
  createNoteKeyGate,
  CHORD_RELEASE_SECONDS,
  heldChordPartials,
  midiNoteAt,
  noteLabel,
  NOTE_KEY_LABELS,
  NOTE_KEY_CODES,
  type Hit,
  type Pad,
  type Instrument,
} from '@/lib/instrument';

import { mixTracks } from '@/lib/instrument';
type Track = {
  offset?: number;
  loop?: boolean;
  muted?: boolean;
  solo?: boolean;
  color?: string;
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
const NOTE_KEYS = (() => {
  const blackPitches = new Set([1, 3, 6, 8, 10]);
  let whiteIndex = 0;
  return NOTE_KEY_LABELS.map((shortcut, index) => {
    const isBlack = blackPitches.has(index % 12);
    const key = { index, shortcut, isBlack, whiteIndex };
    if (!isBlack) whiteIndex++;
    return key;
  });
})();
const NOTE_WHITE_COUNT = NOTE_KEYS.filter((key) => !key.isBlack).length;
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
const rulerTime = (t: number) =>
  t >= 60
    ? `${Math.floor(t / 60)}:${Math.round(t % 60)
        .toString()
        .padStart(2, '0')}`
    : `${Math.round(t)}s`;
export default function Home() {
  const [pads, setPads] = useState<Pad[]>(DEFAULT_PADS),
    [playMode, setPlayMode] = useState<'chords' | 'notes'>('chords'),
    [baseOctave, setBaseOctave] = useState(3),
    [instrument, setInstrument] = useState<Instrument>('piano'),
    [selected, setSelected] = useState(0),
    [active, setActive] = useState<number[]>([]),
    [mode, setMode] = useState<'idle' | 'countin' | 'recording' | 'playing'>(
      'idle',
    ),
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
  const [tracks, setTracks] = useState<Track[]>([]);
  const volume = 0.7;
  const [tab, setTab] = useState<'record' | 'session'>('record');
  const [sessionLength, setSessionLength] = useState(10);
  const [takeName, setTakeName] = useState('');
  const [storageReady, setStorageReady] = useState(false);
  const [sessionCursor, setSessionCursor] = useState(0);
  const [scrubbingSession, setScrubbingSession] = useState(false);
  const [hearSessionWhileRecording, setHearSessionWhileRecording] =
    useState(true);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [tempo, setTempo] = useState(120);
  const [tempoInput, setTempoInput] = useState('120');
  const [draggingTrack, setDraggingTrack] = useState<number | null>(null);
  const drag = useRef<{
    index: number;
    pointerId: number;
    originX: number;
    originOffset: number;
    lastOffset: number;
    laneWidth: number;
    maxStart: number;
  } | null>(null);
  const soloActive = tracks.some((track) => track.solo && !track.muted);
  const selectedTracks = tracks.filter(
    (track) => !track.muted && (!soloActive || track.solo),
  );
  const longestSelected = Math.max(
    0,
    ...tracks.map((t) => t.trim[1] - t.trim[0]),
  );
  const mixLength = Math.max(sessionLength, longestSelected);
  const currentTracks = selectedTracks.map((track) => ({
    ...track,
    offset: clampTrackStart(
      track.offset ?? 0,
      track.trim[1] - track.trim[0],
      mixLength,
    ),
  }));
  useEffect(() => {
    setSessionLength((n) => Math.max(n, longestSelected));
  }, [longestSelected]);
  const hasMix = currentTracks.some((t) => t.hits.length > 0);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('carryon-takes-v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          Array.isArray(parsed) &&
          parsed.every(
            (t) =>
              typeof t.name === 'string' &&
              Array.isArray(t.hits) &&
              Array.isArray(t.trim) &&
              Number.isFinite(t.length),
          )
        ) {
          const normalized = parsed.map((track, index) => ({
            ...track,
            color: track.color ?? COLORS[index % COLORS.length],
          }));
          setTracks(normalized);
          localStorage.setItem('carryon-takes-v1', JSON.stringify(normalized));
        }
      }
    } catch {
      setStatus('Saved takes could not be loaded in this browser.');
    }
    setStorageReady(true);
  }, []);
  function persistTracks(next: Track[]) {
    try {
      localStorage.setItem('carryon-takes-v1', JSON.stringify(next));
      setTracks(next);
      return true;
    } catch {
      setStatus(
        'Could not save in this browser. Download your take to keep it.',
      );
      return false;
    }
  }
  function setTrackState(index: number, change: Partial<Track>) {
    persistTracks(
      tracks.map((track, trackIndex) =>
        trackIndex === index ? { ...track, ...change } : track,
      ),
    );
  }
  function removeTrack(index: number) {
    const track = tracks[index];
    if (!track) return;
    if (persistTracks(tracks.filter((_, trackIndex) => trackIndex !== index))) {
      setStatus(`${track.name} removed from Session`);
    }
  }
  function startTrackDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
    duration: number,
  ) {
    if (modeRef.current !== 'idle' || exporting) return;
    const lane = event.currentTarget.parentElement;
    if (!lane) return;
    const maxStart = Math.max(0, mixLength - duration);
    drag.current = {
      index,
      pointerId: event.pointerId,
      originX: event.clientX,
      originOffset: clampTrackStart(
        tracks[index].offset ?? 0,
        duration,
        mixLength,
      ),
      lastOffset: clampTrackStart(
        tracks[index].offset ?? 0,
        duration,
        mixLength,
      ),
      laneWidth: lane.getBoundingClientRect().width,
      maxStart,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingTrack(index);
  }
  function moveTrack(event: ReactPointerEvent<HTMLButtonElement>) {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    const secondsPerPixel = mixLength / activeDrag.laneWidth;
    const offset = Math.max(
      0,
      Math.min(
        activeDrag.maxStart,
        activeDrag.originOffset +
          (event.clientX - activeDrag.originX) * secondsPerPixel,
      ),
    );
    activeDrag.lastOffset = Math.round(offset * 10) / 10;
    setTracks((current) =>
      current.map((track, index) =>
        index === activeDrag.index
          ? { ...track, offset: activeDrag.lastOffset }
          : track,
      ),
    );
  }
  function finishTrackDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const next = tracks.map((track, index) =>
      index === activeDrag.index
        ? { ...track, offset: activeDrag.lastOffset }
        : track,
    );
    drag.current = null;
    setDraggingTrack(null);
    persistTracks(next);
  }
  function changeSessionLength(value: number) {
    if (!Number.isFinite(value)) return;
    const nextLength = Math.min(1800, Math.max(10, longestSelected, value));
    setSessionLength(nextLength);
    persistTracks(
      tracks.map((track) => ({
        ...track,
        offset: clampTrackStart(
          track.offset ?? 0,
          track.trim[1] - track.trim[0],
          nextLength,
        ),
      })),
    );
  }
  function saveTake() {
    if (
      !hits.length ||
      !takeName.trim() ||
      modeRef.current !== 'idle' ||
      !storageReady
    )
      return;
    const next = [
      ...tracks,
      {
        name: takeName.trim(),
        instrument,
        hits: structuredClone(hits),
        length,
        trim: [...trim] as [number, number],
        undo: [],
        color:
          COLORS.find(
            (color) => !tracks.some((track) => track.color === color),
          ) ?? COLORS[tracks.length % COLORS.length],
      },
    ];
    if (persistTracks(next)) {
      const savedName = takeName.trim();
      recorded.current = [];
      setHits([]);
      setLength(0);
      updateTrim(0, 0);
      setEditHit(null);
      setUndoEdits([]);
      setClock(0);
      takeCache.current = null;
      setTakeName('');
      setStatus('Saved ' + savedName + ' to Session · ready for a new take');
    }
  }
  const [countdown, setCountdown] = useState<number | null>(null);
  const countInToken = useRef(0);
  const takeCache = useRef<{
    hits: Hit[];
    length: number;
    rate: number;
    pcm: Float32Array;
  } | null>(null);
  const playbackRange = useRef({
    offset: 0,
    duration: 0,
    startOffset: 0,
    loop: false,
    all: false,
  });
  const heldChords = useRef(
    new Map<
      number,
      {
        gain: GainNode;
        voices: OscillatorNode[];
        startedAt: number;
        hit: Hit;
      }
    >(),
  );
  const pendingChords = useRef(
    new Map<number, { pressedAt: number; releasedAt?: number }>(),
  );
  const metronomeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const metronomeVoices = useRef(new Set<OscillatorNode>());
  const audio = useRef<AudioContext | null>(null),
    sources = useRef(new Set<AudioScheduledSourceNode>()),
    recording = useRef(false),
    start = useRef(0),
    recorded = useRef<Hit[]>([]),
    endTime = useRef(0),
    modeRef = useRef(mode),
    playModeRef = useRef(playMode),
    settings = useRef({ pads, instrument, volume, baseOctave }),
    triggerRef = useRef<(i: number) => void>(() => {}),
    releaseChordRef = useRef<(i: number) => void>(() => {}),
    releaseAllChordsRef = useRef<() => void>(() => {}),
    noteTriggerRef = useRef<(i: number) => void>(() => {}),
    stopRef = useRef(() => {});
  settings.current = { pads, instrument, volume, baseOctave };
  modeRef.current = mode;
  playModeRef.current = playMode;
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
    heldChords.current.forEach(({ gain }) => gain.disconnect());
    heldChords.current.clear();
    pendingChords.current.clear();
    setActive([]);
  }
  function playBuffer(
    ctx: AudioContext,
    buffer: AudioBuffer,
    when: number,
    loop = false,
    offset = 0,
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
    s.start(when, offset);
  }
  function stopMetronome() {
    if (metronomeTimer.current !== null) {
      clearInterval(metronomeTimer.current);
      metronomeTimer.current = null;
    }
    metronomeVoices.current.forEach((voice) => {
      try {
        voice.stop();
      } catch {}
    });
    metronomeVoices.current.clear();
  }
  function startMetronome(ctx: AudioContext, origin: number, bpm: number) {
    stopMetronome();
    const beatDuration = 60 / bpm;
    let beatIndex = Math.max(
      0,
      Math.ceil((ctx.currentTime + 0.01 - origin) / beatDuration - 0.000001),
    );
    const schedule = () => {
      beatIndex = Math.max(
        beatIndex,
        Math.ceil((ctx.currentTime - 0.005 - origin) / beatDuration),
      );
      while (origin + beatIndex * beatDuration < ctx.currentTime + 0.16) {
        const beatAt = origin + beatIndex * beatDuration;
        if (beatAt >= ctx.currentTime - 0.005) {
          const when = Math.max(ctx.currentTime + 0.001, beatAt);
          const accent = beatIndex % 4 === 0;
          const voice = ctx.createOscillator();
          const gain = ctx.createGain();
          voice.type = 'triangle';
          voice.frequency.setValueAtTime(accent ? 1250 : 900, when);
          gain.gain.setValueAtTime(0, when);
          gain.gain.linearRampToValueAtTime(
            accent ? 0.13 : 0.085,
            when + 0.002,
          );
          gain.gain.exponentialRampToValueAtTime(0.001, when + 0.055);
          voice.connect(gain).connect(ctx.destination);
          metronomeVoices.current.add(voice);
          voice.onended = () => {
            metronomeVoices.current.delete(voice);
            voice.disconnect();
            gain.disconnect();
          };
          voice.start(when);
          voice.stop(when + 0.06);
        }
        beatIndex++;
      }
    };
    schedule();
    metronomeTimer.current = setInterval(schedule, 25);
  }
  async function toggleMetronome() {
    if (metronomeOn) {
      stopMetronome();
      setMetronomeOn(false);
      return;
    }
    try {
      const ctx = await unlock();
      const origin =
        modeRef.current === 'recording'
          ? start.current
          : modeRef.current === 'playing'
            ? start.current - playbackRange.current.startOffset
            : ctx.currentTime + 0.06;
      startMetronome(ctx, origin, tempo);
      setMetronomeOn(true);
    } catch {
      setStatus('Metronome could not start. Try again.');
    }
  }
  function changeTempo(value: string) {
    setTempoInput(value);
    const next = Number(value);
    if (!value.trim() || !Number.isFinite(next) || next < 40 || next > 240)
      return;
    const bpm = Math.round(next);
    setTempo(bpm);
    if (metronomeOn && audio.current)
      startMetronome(audio.current, audio.current.currentTime + 0.06, bpm);
  }

  async function playHeld(i: number, snapshot: Hit) {
    if (modeRef.current === 'playing' || modeRef.current === 'countin') return;
    if (pendingChords.current.has(i)) return;
    const s = settings.current;
    const pending = {
      pressedAt: performance.now(),
      releasedAt: undefined as number | undefined,
    };
    pendingChords.current.set(i, pending);
    setActive((active) => [...new Set([...active, i])]);
    try {
      const ctx = await unlock();
      if (
        pendingChords.current.get(i) !== pending ||
        (modeRef.current as string) === 'playing' ||
        (modeRef.current as string) === 'countin'
      )
        return;
      const when = ctx.currentTime + 0.012;
      snapshot.time = recording.current ? Math.max(0, when - start.current) : 0;
      const gain = ctx.createGain();
      const attack = s.instrument === 'organ' ? 0.045 : 0.008;
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(0.055 * s.volume, when + attack);
      gain.connect(ctx.destination);
      const partials = heldChordPartials(s.instrument);
      const real = new Float32Array(partials.length + 1);
      const imaginary = new Float32Array(partials.length + 1);
      partials.forEach((amplitude, index) => {
        imaginary[index + 1] = amplitude;
      });
      const wave = ctx.createPeriodicWave(real, imaginary, {
        disableNormalization: true,
      });
      const voices = snapshot.notes.map((note, index) => {
        const oscillator = ctx.createOscillator();
        oscillator.setPeriodicWave(wave);
        oscillator.frequency.value = 440 * 2 ** ((note - 69) / 12);
        oscillator.connect(gain);
        sources.current.add(oscillator);
        oscillator.onended = () => {
          sources.current.delete(oscillator);
          oscillator.disconnect();
          if (voices.every((voice) => !sources.current.has(voice)))
            gain.disconnect();
        };
        oscillator.start(
          when + (s.instrument === 'guitar' ? index * 0.026 : 0),
        );
        return oscillator;
      });
      heldChords.current.set(i, {
        gain,
        voices,
        startedAt: when,
        hit: snapshot,
      });
      if (recording.current) {
        recorded.current.push(snapshot);
        setHits([...recorded.current]);
      }
      setStatus(`${snapshot.label} · ${s.instrument}`);
      if (pending.releasedAt !== undefined)
        releaseChord(
          i,
          Math.max(0.02, (pending.releasedAt - pending.pressedAt) / 1000),
        );
    } catch {
      pendingChords.current.delete(i);
      setActive((active) => active.filter((key) => key !== i));
      setStatus('Audio could not start. Try playing the key again.');
    }
  }
  function trigger(i: number) {
    const s = settings.current;
    const p = s.pads[i];
    if (!p || p.quality === 'off') return;
    void playHeld(i, {
      pad: i,
      time: 0,
      chord: { ...p },
      notes: chordNotes(p),
      label: chordLabel(p),
      instrument: s.instrument,
      duration: CHORD_RELEASE_SECONDS + 0.02,
      heldFor: 0.02,
      volume: s.volume,
    });
  }
  triggerRef.current = (i) => {
    void trigger(i);
  };
  function releaseChord(i: number, measuredHold?: number) {
    const pending = pendingChords.current.get(i);
    const held = heldChords.current.get(i);
    if (!held) {
      if (pending) pending.releasedAt = performance.now();
      setActive((active) => active.filter((key) => key !== i));
      return;
    }
    pendingChords.current.delete(i);
    heldChords.current.delete(i);
    const ctx = audio.current;
    if (!ctx) return;
    const releasedAt = Math.max(
      ctx.currentTime,
      held.startedAt + (measuredHold ?? 0.02),
    );
    const heldFor = releasedAt - held.startedAt;
    held.hit.heldFor = heldFor;
    held.hit.duration = heldFor + CHORD_RELEASE_SECONDS;
    held.gain.gain.cancelAndHoldAtTime(releasedAt);
    held.gain.gain.linearRampToValueAtTime(
      0,
      releasedAt + CHORD_RELEASE_SECONDS,
    );
    held.voices.forEach((voice) => {
      try {
        voice.stop(releasedAt + CHORD_RELEASE_SECONDS);
      } catch {}
    });
    setActive((active) => active.filter((key) => key !== i));
    if (recording.current) {
      setHits([...recorded.current]);
      takeCache.current = null;
    }
  }
  releaseChordRef.current = releaseChord;
  releaseAllChordsRef.current = () => {
    [...heldChords.current.keys()].forEach(releaseChord);
    pendingChords.current.clear();
  };
  function triggerNote(i: number) {
    const s = settings.current;
    const midi = midiNoteAt(i, s.baseOctave);
    void playHeld(i, {
      pad: i,
      time: 0,
      notes: [midi],
      label: noteLabel(midi),
      instrument: s.instrument,
      duration: CHORD_RELEASE_SECONDS + 0.02,
      heldFor: 0.02,
      volume: s.volume,
    });
  }
  noteTriggerRef.current = (i) => {
    void triggerNote(i);
  };
  function stop() {
    countInToken.current++;
    setCountdown(null);
    if (modeRef.current === 'countin')
      setStatus('Count-in cancelled · existing take kept');
    if (recording.current) {
      releaseAllChordsRef.current();
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
          ? 'Take ready · release tails preserved'
          : 'No sounds recorded. Press Record to try again.',
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
    if (
      (modeRef.current !== 'idle' &&
        !(modeRef.current === 'playing' && playbackRange.current.all)) ||
      exporting
    )
      return;
    const token = ++countInToken.current;
    modeRef.current = 'countin';
    setMode('countin');
    try {
      const ctx = await unlock();
      silence();
      const sessionPcm =
        hearSessionWhileRecording && hasMix
          ? mixTracks(currentTracks, ctx.sampleRate, mixLength)
          : null;
      const sessionBuffer = sessionPcm
        ? ctx.createBuffer(1, sessionPcm.length, ctx.sampleRate)
        : null;
      if (sessionBuffer && sessionPcm)
        sessionBuffer.getChannelData(0).set(sessionPcm);
      const beatDuration = metronomeOn ? 60 / tempo : 1;
      const countStart = ctx.currentTime + 0.08;
      if (metronomeOn) startMetronome(ctx, countStart, tempo);
      for (let n = 4; n >= 1; n--) {
        if (token !== countInToken.current) return;
        setCountdown(n);
        setStatus('Recording starts in ' + n);
        const nextBeat = countStart + (5 - n) * beatDuration;
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(0, (nextBeat - 0.025 - ctx.currentTime) * 1000),
          ),
        );
      }
      if (token !== countInToken.current) return;
      setCountdown(null);
      recorded.current = [];
      setHits([]);
      setEditHit(null);
      setUndoEdits([]);
      setLength(0);
      updateTrim(0, 0);
      takeCache.current = null;
      setClock(0);
      const downbeat = countStart + 4 * beatDuration;
      start.current = Math.max(ctx.currentTime + 0.012, downbeat);
      if (metronomeOn && start.current > downbeat + 0.02)
        startMetronome(ctx, start.current, tempo);
      if (sessionBuffer) playBuffer(ctx, sessionBuffer, start.current);
      recording.current = true;
      modeRef.current = 'recording';
      setMode('recording');
      setStatus(
        sessionBuffer
          ? `Recording with Session · play your ${playModeRef.current}`
          : `Recording · play your ${playModeRef.current}`,
      );
    } catch {
      if (token !== countInToken.current) return;
      setCountdown(null);
      if (metronomeOn) stopMetronome();
      modeRef.current = 'idle';
      setMode('idle');
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
  async function replay(loop = false, all = false, solo?: Track, seekAt = 0) {
    try {
      const ctx = await unlock();
      silence();
      const pcm = all
        ? mixTracks(
            solo ? [{ ...solo, loop: false, offset: 0 }] : currentTracks,
            ctx.sampleRate,
            solo ? 0 : mixLength,
          )
        : selectionAudio(ctx.sampleRate);
      const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
      buffer.getChannelData(0).set(pcm);
      const startOffset = all
        ? Math.max(
            0,
            Math.min(seekAt, Math.max(0, buffer.duration - 1 / ctx.sampleRate)),
          )
        : 0;
      // Prepare the selected audio before starting the playback clock.
      start.current = ctx.currentTime + 0.06;
      playbackRange.current = {
        offset: all ? 0 : trim[0],
        duration: buffer.duration,
        startOffset,
        loop,
        all,
      };
      endTime.current = start.current + buffer.duration - startOffset;
      playBuffer(ctx, buffer, start.current, loop, startOffset);
      if (metronomeOn) startMetronome(ctx, start.current - startOffset, tempo);
      setClock(startOffset);
      modeRef.current = 'playing';
      setMode('playing');
      setStatus(
        all
          ? loop
            ? 'Looping all tracks'
            : startOffset > 0
              ? `Playing Session from ${fmt(startOffset)}`
              : 'Playing all tracks'
          : loop
            ? 'Looping selected range · press Stop to finish'
            : isTrimmed
              ? 'Playing selected range once'
              : 'Playing your full take once',
      );
    } catch {
      silence();
      modeRef.current = 'idle';
      setMode('idle');
      setClock(0);
      setStatus('Playback could not start.');
    }
  }
  function selectRecordedHit(index: number) {
    if (
      modeRef.current !== 'idle' ||
      exporting ||
      !hits[index] ||
      !hits[index].chord
    )
      return;
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
        all ? mixTracks(currentTracks, rate, mixLength) : selectionAudio(rate),
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
    const chordGate = createKeyGate();
    const noteGate = createNoteKeyGate();
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (
        target.closest(
          'input,textarea,select,[role="combobox"],[role="listbox"],[role="slider"],[contenteditable="true"]',
        )
      )
        return;
      const notesMode = playModeRef.current === 'notes';
      const i = notesMode
        ? noteGate.down(e.code, e.repeat)
        : chordGate.down(e.code, e.repeat);
      if (i >= 0) {
        e.preventDefault();
        if (notesMode) noteTriggerRef.current(i);
        else triggerRef.current(i);
      }
    };
    const up = (e: KeyboardEvent) => {
      chordGate.up(e.code);
      noteGate.up(e.code);
      const index =
        playModeRef.current === 'notes'
          ? NOTE_KEY_CODES.indexOf(e.code as (typeof NOTE_KEY_CODES)[number])
          : /^Digit[0-9]$/.test(e.code)
            ? (Number(e.code.slice(-1)) + 9) % 10
            : -1;
      if (index >= 0) releaseChordRef.current(index);
    };
    const blur = () => {
      chordGate.clear();
      noteGate.clear();
      releaseAllChordsRef.current();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      countInToken.current++;
      if (metronomeTimer.current !== null)
        clearInterval(metronomeTimer.current);
      metronomeVoices.current.forEach((voice) => {
        try {
          voice.stop();
        } catch {}
      });
      metronomeVoices.current.clear();
      const context = audio.current;
      audio.current = null;
      sources.current.clear();
      if (context && context.state !== 'closed')
        void context.close().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (mode === 'idle' || mode === 'countin') return;
    const timer = setInterval(() => {
      const ctx = audio.current;
      if (!ctx) return;
      const t = Math.max(0, ctx.currentTime - start.current);
      const position =
        mode === 'playing'
          ? playbackPosition(
              t + playbackRange.current.startOffset,
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
          playbackRange.current.all
            ? []
            : hits
                .filter(
                  (h) =>
                    position + playbackRange.current.offset >= h.time &&
                    position + playbackRange.current.offset <
                      h.time + h.duration,
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
    chosen = pads[selected],
    recordedKind = hits.length
      ? hits.some((hit) => !hit.chord)
        ? 'note'
        : 'chord'
      : playMode === 'notes'
        ? 'note'
        : 'chord';
  const timelineWidth = Math.max(960, Math.min(18000, mixLength * 22));
  const timelineTicks = Array.from({ length: 11 }, (_, index) => {
    const seconds = (mixLength * index) / 10;
    return { seconds, left: `${index * 10}%` };
  });
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
              {playMode === 'chords' ? (
                <>
                  Hold <kbd>1</kbd> through <kbd>0</kbd> or hold a pad to
                  sustain its chord. Release to end it.
                </>
              ) : (
                <>
                  Hold a piano key on screen or its computer shortcut. Release
                  to end the note.
                </>
              )}
            </p>
          </div>
          <span className="session-label">
            <span /> LIVE SESSION
          </span>
        </div>
        <nav className="workspace-tabs" aria-label="Workspace">
          <button
            aria-pressed={tab === 'record'}
            disabled={mode !== 'idle' || exporting}
            onClick={() => setTab('record')}
          >
            Record
          </button>
          <button
            aria-pressed={tab === 'session'}
            disabled={mode !== 'idle' || exporting}
            onClick={() => {
              stopMetronome();
              setMetronomeOn(false);
              setTab('session');
            }}
          >
            Session · {tracks.length}
          </button>
        </nav>
        <div hidden={tab !== 'record'}>
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
                  ? 'Soft attack · sustained tone'
                  : instrument === 'guitar'
                    ? 'Bright strings · gentle strum'
                    : 'Warm drawbars · sustained tone'}
                <br />
                Synthesized approximation
              </small>
            </div>
            <div className="soundbar-play-mode">
              <span className="play-mode-label">Play mode</span>
              <fieldset className="play-mode-switch" aria-label="Play mode">
                <button
                  aria-pressed={playMode === 'chords'}
                  disabled={mode !== 'idle' || active.length > 0}
                  onClick={() => setPlayMode('chords')}
                >
                  Chords
                </button>
                <button
                  aria-pressed={playMode === 'notes'}
                  disabled={mode !== 'idle' || active.length > 0}
                  onClick={() => setPlayMode('notes')}
                >
                  Notes
                </button>
              </fieldset>
              <small className="keyboard-note">
                <Keyboard size={15} /> Computer keyboard ready
              </small>
            </div>
          </section>
          <section className="metronome-panel" aria-label="Metronome">
            <div className="metronome-heading">
              <span className="metronome-icon">
                <Timer size={19} />
              </span>
              <div>
                <strong>Metronome</strong>
                <small>
                  Four beats per bar · click stays out of your takes
                </small>
              </div>
            </div>
            <label className="metronome-tempo">
              Tempo
              <span>
                <Input
                  aria-label="Metronome tempo in beats per minute"
                  type="number"
                  min={40}
                  max={240}
                  step={1}
                  value={tempoInput}
                  disabled={mode !== 'idle'}
                  onChange={(event) => changeTempo(event.target.value)}
                  onBlur={() => setTempoInput(String(tempo))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
                BPM
              </span>
            </label>
            <button
              className="metronome-toggle"
              aria-pressed={metronomeOn}
              disabled={mode === 'countin'}
              onClick={() => void toggleMetronome()}
            >
              <span className="toggle-light" aria-hidden="true" />
              {metronomeOn ? 'Click on' : 'Start click'}
            </button>
          </section>
          <div className="section-heading">
            <h2>
              {playMode === 'chords' ? (
                <>
                  Chord pads <span>10 keys, endless combinations</span>
                </>
              ) : (
                <>
                  Note keyboard <span>25 keys, two octaves</span>
                </>
              )}
            </h2>
          </div>
          {playMode === 'chords' ? (
            <>
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
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        triggerRef.current(i);
                      }}
                      onPointerUp={() => releaseChordRef.current(i)}
                      onPointerCancel={() => releaseChordRef.current(i)}
                      onLostPointerCapture={() => releaseChordRef.current(i)}
                      onKeyDown={(event) => {
                        if (event.code !== 'Space' && event.code !== 'Enter')
                          return;
                        event.preventDefault();
                        if (!event.repeat) triggerRef.current(i);
                      }}
                      onKeyUp={(event) => {
                        if (event.code !== 'Space' && event.code !== 'Enter')
                          return;
                        event.preventDefault();
                        releaseChordRef.current(i);
                      }}
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
                  <span
                    className="edit-key"
                    style={{ color: COLORS[selected] }}
                  >
                    {KEYS[selected]}
                  </span>
                  <strong>Edit pad {KEYS[selected]}</strong>
                </div>
                <ChordPicker
                  chord={chosen}
                  prefix="Chord"
                  allowOff
                  onChange={(chord) =>
                    setPads((p) =>
                      p.map((x, i) => (i === selected ? chord : x)),
                    )
                  }
                />
                <p>
                  Choose a family, then an extension. Bass adds the note after
                  the slash. Sus and diminished use no extension.
                </p>
              </section>
            </>
          ) : (
            <section
              className="note-controller"
              aria-label="25-key note controller"
            >
              <div className="octave-bar">
                <span>
                  Range{' '}
                  <strong>
                    {noteLabel(midiNoteAt(0, baseOctave))}–
                    {noteLabel(midiNoteAt(24, baseOctave))}
                  </strong>
                </span>
                <div>
                  <button
                    aria-label="Octave down"
                    disabled={mode !== 'idle' || baseOctave <= 1}
                    onClick={() =>
                      setBaseOctave((octave) => Math.max(1, octave - 1))
                    }
                  >
                    <Minus size={15} /> Octave
                  </button>
                  <span>C{baseOctave}</span>
                  <button
                    aria-label="Octave up"
                    disabled={mode !== 'idle' || baseOctave >= 6}
                    onClick={() =>
                      setBaseOctave((octave) => Math.min(6, octave + 1))
                    }
                  >
                    <Plus size={15} /> Octave
                  </button>
                </div>
              </div>
              <div className="piano-scroll">
                <div className="piano-keyboard">
                  {NOTE_KEYS.filter((key) => !key.isBlack).map((key) => {
                    const midi = midiNoteAt(key.index, baseOctave);
                    return (
                      <button
                        key={key.index}
                        className={`piano-key white-key ${active.includes(key.index) ? 'active' : ''}`}
                        style={{
                          left: `${(key.whiteIndex / NOTE_WHITE_COUNT) * 100}%`,
                          width: `${100 / NOTE_WHITE_COUNT}%`,
                        }}
                        disabled={mode === 'playing' || mode === 'countin'}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return;
                          event.currentTarget.setPointerCapture(
                            event.pointerId,
                          );
                          noteTriggerRef.current(key.index);
                        }}
                        onPointerUp={() => releaseChordRef.current(key.index)}
                        onPointerCancel={() =>
                          releaseChordRef.current(key.index)
                        }
                        onLostPointerCapture={() =>
                          releaseChordRef.current(key.index)
                        }
                        onKeyDown={(event) => {
                          if (event.code !== 'Space' && event.code !== 'Enter')
                            return;
                          event.preventDefault();
                          if (!event.repeat) noteTriggerRef.current(key.index);
                        }}
                        onKeyUp={(event) => {
                          if (event.code !== 'Space' && event.code !== 'Enter')
                            return;
                          event.preventDefault();
                          releaseChordRef.current(key.index);
                        }}
                        aria-label={`Play ${noteLabel(midi)}, key ${key.shortcut}`}
                      >
                        <kbd>{key.shortcut}</kbd>
                        <span>{noteLabel(midi)}</span>
                      </button>
                    );
                  })}
                  {NOTE_KEYS.filter((key) => key.isBlack).map((key) => {
                    const midi = midiNoteAt(key.index, baseOctave);
                    return (
                      <button
                        key={key.index}
                        className={`piano-key black-key ${active.includes(key.index) ? 'active' : ''}`}
                        style={{
                          left: `calc(${(key.whiteIndex / NOTE_WHITE_COUNT) * 100}% - 2.15%)`,
                          width: '4.3%',
                        }}
                        disabled={mode === 'playing' || mode === 'countin'}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return;
                          event.currentTarget.setPointerCapture(
                            event.pointerId,
                          );
                          noteTriggerRef.current(key.index);
                        }}
                        onPointerUp={() => releaseChordRef.current(key.index)}
                        onPointerCancel={() =>
                          releaseChordRef.current(key.index)
                        }
                        onLostPointerCapture={() =>
                          releaseChordRef.current(key.index)
                        }
                        onKeyDown={(event) => {
                          if (event.code !== 'Space' && event.code !== 'Enter')
                            return;
                          event.preventDefault();
                          if (!event.repeat) noteTriggerRef.current(key.index);
                        }}
                        onKeyUp={(event) => {
                          if (event.code !== 'Space' && event.code !== 'Enter')
                            return;
                          event.preventDefault();
                          releaseChordRef.current(key.index);
                        }}
                        aria-label={`Play ${noteLabel(midi)}, key ${key.shortcut}`}
                      >
                        <kbd>{key.shortcut}</kbd>
                        <span>{noteLabel(midi)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="note-shortcuts">
                White keys: Z X C V B N M · Q W E R T Y U I
                <span>Black keys: S D G H J · 2 3 5 6 7</span>
              </p>
            </section>
          )}
          {tracks.length > 0 && (
            <section className="session-monitor" aria-label="Listen to Session">
              <div className="session-monitor-heading">
                <div>
                  <p className="eyebrow">PLAY ALONG</p>
                  <h2>Hear your Session</h2>
                  <p>
                    Listen to the current arrangement here, with its track
                    positions, loops, mutes, and solos.
                  </p>
                </div>
                <span className="session-monitor-time">
                  {fmt(
                    Math.min(
                      mixLength,
                      mode === 'recording' && hearSessionWhileRecording
                        ? clock
                        : mode === 'playing' &&
                            playbackRange.current.all &&
                            !scrubbingSession
                          ? clock
                          : Math.min(sessionCursor, mixLength),
                    ),
                  )}{' '}
                  / {fmt(mixLength)}
                </span>
              </div>
              <Slider
                className="session-monitor-slider"
                aria-label="Session listening position"
                min={0}
                max={mixLength}
                step={0.01}
                value={[
                  mode === 'playing' &&
                  playbackRange.current.all &&
                  !scrubbingSession
                    ? clock
                    : Math.min(sessionCursor, mixLength),
                ]}
                disabled={!hasMix || mode === 'countin' || mode === 'recording'}
                onValueChange={(value) => {
                  if (Array.isArray(value)) {
                    setScrubbingSession(true);
                    setSessionCursor(value[0]);
                  }
                }}
                onValueCommitted={(value) => {
                  if (!Array.isArray(value)) return;
                  setScrubbingSession(false);
                  setSessionCursor(value[0]);
                  if (
                    modeRef.current === 'playing' &&
                    playbackRange.current.all
                  )
                    void replay(false, true, undefined, value[0]);
                }}
              />
              <div className="session-monitor-actions">
                <button
                  disabled={!hasMix || mode !== 'idle' || exporting}
                  onClick={() =>
                    replay(
                      false,
                      true,
                      undefined,
                      Math.min(sessionCursor, mixLength),
                    )
                  }
                >
                  <Play size={15} fill="currentColor" /> Listen from here
                </button>
                <button
                  disabled={mode !== 'playing' || !playbackRange.current.all}
                  onClick={stop}
                >
                  <Square size={14} fill="currentColor" /> Stop
                </button>
                <button
                  className="session-monitor-toggle"
                  aria-pressed={hearSessionWhileRecording}
                  disabled={!hasMix || mode !== 'idle'}
                  onClick={() =>
                    setHearSessionWhileRecording((enabled) => !enabled)
                  }
                >
                  <span className="toggle-light" aria-hidden="true" />
                  Hear Session while recording
                </button>
              </div>
              <p className="session-monitor-hint">
                {hasMix
                  ? 'After the four-count, recording and Session playback start together from the beginning.'
                  : 'Unmute a saved take in Session to hear the arrangement here.'}
              </p>
            </section>
          )}
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
                      ? playbackRange.current.all
                        ? '▶ SESSION'
                        : playbackRange.current.loop
                          ? '↻ LOOP'
                          : '▶ PLAY'
                      : 'TAKE'}
                </span>
                {fmt(clock)}
              </div>
            </div>

            {countdown !== null && (
              <div className="count-in" role="status" aria-live="assertive">
                <span>GET READY</span>
                <strong key={countdown}>{countdown}</strong>
                <small>
                  {metronomeOn
                    ? `Counting in at ${tempo} BPM · Stop to cancel`
                    : 'Recording starts after 1 · Stop to cancel'}
                </small>
              </div>
            )}
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
                        ? `Listening for your first ${playMode === 'notes' ? 'note' : 'chord'}…`
                        : 'A little space for your next idea.'}
                      <small>
                        {mode === 'recording'
                          ? playMode === 'notes'
                            ? 'Play the piano keys or use the shown shortcuts.'
                            : 'Play a number key or tap a pad.'
                          : 'Press Record, play freely, then Stop.'}
                      </small>
                    </p>
                  </div>
                ) : (
                  hits.map((h, i) => (
                    <button
                      key={i}
                      disabled={mode !== 'idle' || exporting}
                      onClick={() => h.chord && selectRecordedHit(i)}
                      aria-label={`${h.chord ? 'Edit recorded chord' : 'Recorded note'} ${i + 1}: ${h.label} at ${h.time.toFixed(3)} seconds`}
                      aria-pressed={editHit === i}
                      title={`${h.label} at ${h.time.toFixed(3)}s · ${h.duration}s · ${h.instrument}`}
                      className={`clip ${!h.chord ? 'note-clip' : ''} ${editHit === i ? 'selected-clip' : ''}`}
                      style={{
                        left: `${(h.time / scale) * 100}%`,
                        width: `${(h.duration / scale) * 100}%`,
                        top: 8 + (h.pad % 4) * 27,
                        background: COLORS[h.pad % COLORS.length],
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
            {hits.length > 0 &&
              hits.every((hit) => hit.chord) &&
              mode !== 'recording' && (
                <section
                  className="recorded-editor"
                  aria-label="Edit recorded chord"
                >
                  <div className="recorded-editor-heading">
                    <h3>Correct a chord</h3>
                    <button
                      className="undo-edit"
                      disabled={
                        !undoEdits.length || mode !== 'idle' || exporting
                      }
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
                        {hits[editHit].instrument} · Timing and sound settings
                        stay the same
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
                  Drag either handle or enter exact times. Replay and download
                  use this range. Your original stays intact.
                </p>
              </section>
            )}
            <div className="save-take">
              <Input
                aria-label="Take name"
                placeholder="Name your take"
                value={takeName}
                onChange={(e) => setTakeName(e.target.value)}
                disabled={mode !== 'idle' || exporting}
              />
              <button
                onClick={saveTake}
                disabled={
                  !hits.length ||
                  !takeName.trim() ||
                  mode !== 'idle' ||
                  exporting ||
                  !storageReady
                }
              >
                Save to Session
              </button>
            </div>
            <div className="transport">
              <div className="transport-buttons">
                <button
                  className="record-button"
                  disabled={
                    (mode !== 'idle' &&
                      !(mode === 'playing' && playbackRange.current.all)) ||
                    exporting
                  }
                  onClick={record}
                >
                  <Circle size={15} fill="currentColor" />
                  {hits.length ? 'Re-record take' : 'Record take'}
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
                {hits.length} {recordedKind}
                {hits.length === 1 ? '' : 's'} · {length.toFixed(2)} s{' '}
                <span className="desktop-only">· No quantization</span>
              </span>
            </div>
          </section>
        </div>
        {tab === 'session' && (
          <section className="recorder session-panel" aria-label="Session">
            <div className="session-toolbar">
              <div>
                <p className="eyebrow">ARRANGEMENT</p>
                <h2>Session</h2>
              </div>
              <label className="session-duration">
                Session length
                <span>
                  <Input
                    aria-label="Session length in seconds"
                    type="number"
                    min={Math.max(10, longestSelected)}
                    max={1800}
                    step={1}
                    value={mixLength}
                    disabled={mode !== 'idle' || exporting}
                    onChange={(event) =>
                      changeSessionLength(Number(event.target.value))
                    }
                  />
                  sec
                </span>
              </label>
              <div className="session-transport">
                <button
                  className="session-play"
                  disabled={!hasMix || mode !== 'idle' || exporting}
                  onClick={() => replay(false, true)}
                >
                  <Play size={15} fill="currentColor" /> Play session
                </button>
                <button
                  disabled={!hasMix || mode !== 'idle' || exporting}
                  onClick={() => replay(true, true)}
                >
                  <Repeat2 size={15} /> Loop session
                </button>
                <button disabled={mode === 'idle'} onClick={stop}>
                  <Square size={14} fill="currentColor" /> Stop
                </button>
                <button
                  disabled={!hasMix || mode !== 'idle' || exporting}
                  onClick={() => download(true)}
                >
                  <Download size={15} /> Download mix
                </button>
              </div>
            </div>

            <div className="arrangement-help">
              Drag a take to place it. Solo hears one or more chosen tracks;
              Mute silences a track.
            </div>

            <div className="arrangement" aria-label="Session arrangement">
              <div
                className="arrangement-grid"
                style={
                  {
                    '--timeline-width': `${timelineWidth}px`,
                  } as React.CSSProperties
                }
              >
                <div className="track-list-heading">TRACKS</div>
                <div className="timeline-ruler" aria-hidden="true">
                  {timelineTicks.map((tick) => (
                    <span key={tick.seconds} style={{ left: tick.left }}>
                      {rulerTime(tick.seconds)}
                    </span>
                  ))}
                </div>

                {!tracks.length && (
                  <div className="session-empty">
                    <AudioLines size={26} />
                    <span>
                      No saved takes yet.
                      <small>
                        Record, name, and save a take to arrange it here.
                      </small>
                    </span>
                  </div>
                )}

                {tracks.map((track, index) => {
                  const takeDuration = track.trim[1] - track.trim[0];
                  const trackColor =
                    track.color ?? COLORS[index % COLORS.length];
                  const startTime = clampTrackStart(
                    track.offset ?? 0,
                    takeDuration,
                    mixLength,
                  );
                  const disabled = mode !== 'idle' || exporting;
                  return (
                    <div className="arrangement-row" key={index}>
                      <div
                        className="track-strip"
                        style={
                          {
                            '--track-color': trackColor,
                          } as React.CSSProperties
                        }
                      >
                        <div className="track-identity">
                          <span className="track-color" />
                          <span>
                            <strong>{track.name}</strong>
                            <small>
                              {track.instrument} · {takeDuration.toFixed(1)} s
                            </small>
                          </span>
                        </div>
                        <div className="track-controls">
                          <button
                            aria-label={'Solo ' + track.name}
                            aria-pressed={!!track.solo}
                            title="Solo"
                            disabled={disabled}
                            onClick={() =>
                              setTrackState(index, { solo: !track.solo })
                            }
                          >
                            S
                          </button>
                          <button
                            aria-label={'Mute ' + track.name}
                            aria-pressed={!!track.muted}
                            title="Mute"
                            disabled={disabled}
                            onClick={() =>
                              setTrackState(index, { muted: !track.muted })
                            }
                          >
                            M
                          </button>
                          <button
                            className="track-listen"
                            aria-label={'Listen to ' + track.name}
                            title="Listen to this take"
                            disabled={disabled}
                            onClick={() => replay(false, true, track)}
                          >
                            <Play size={12} fill="currentColor" />
                          </button>
                          <button
                            className="track-loop"
                            aria-label={'Loop ' + track.name}
                            aria-pressed={!!track.loop}
                            title="Repeat until the Session ends"
                            disabled={disabled}
                            onClick={() =>
                              setTrackState(index, { loop: !track.loop })
                            }
                          >
                            <Repeat2 size={13} />
                          </button>
                          <button
                            className="track-remove"
                            aria-label={'Remove ' + track.name}
                            title="Remove from Session"
                            disabled={disabled}
                            onClick={() => removeTrack(index)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <div className="arrangement-lane">
                        {timelineTicks.map((tick) => (
                          <i key={tick.seconds} style={{ left: tick.left }} />
                        ))}
                        <button
                          className={`arrangement-clip ${
                            draggingTrack === index ? 'is-dragging' : ''
                          } ${track.muted ? 'is-muted' : ''}`}
                          style={
                            {
                              left: `${(startTime / mixLength) * 100}%`,
                              width: `${Math.max(
                                1.25,
                                (takeDuration / mixLength) * 100,
                              )}%`,
                              '--track-color': trackColor,
                            } as React.CSSProperties
                          }
                          aria-label={`${track.name}, starts at ${startTime.toFixed(
                            1,
                          )} seconds. Drag to move.`}
                          title={`${track.name} · starts ${startTime.toFixed(
                            1,
                          )}s · drag to move`}
                          disabled={disabled}
                          onPointerDown={(event) =>
                            startTrackDrag(event, index, takeDuration)
                          }
                          onPointerMove={moveTrack}
                          onPointerUp={finishTrackDrag}
                          onPointerCancel={finishTrackDrag}
                          onKeyDown={(event) => {
                            if (
                              event.key !== 'ArrowLeft' &&
                              event.key !== 'ArrowRight'
                            )
                              return;
                            event.preventDefault();
                            const direction =
                              event.key === 'ArrowRight' ? 1 : -1;
                            const step = event.shiftKey ? 1 : 0.1;
                            setTrackState(index, {
                              offset: clampTrackStart(
                                startTime + direction * step,
                                takeDuration,
                                mixLength,
                              ),
                            });
                          }}
                        >
                          <span>{track.name}</span>
                          <small>
                            {startTime.toFixed(1)}s →{' '}
                            {(startTime + takeDuration).toFixed(1)}s
                          </small>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {tracks.length > 0 && mode === 'playing' && (
                  <div
                    className="session-playhead"
                    style={
                      {
                        '--playhead-left': `${(clock / mixLength) * timelineWidth}px`,
                      } as React.CSSProperties
                    }
                    aria-hidden="true"
                  />
                )}
              </div>
            </div>

            <div className="session-footer">
              <span role="status">
                {status} · {fmt(clock)}
              </span>
              <span>
                {tracks.length} take{tracks.length === 1 ? '' : 's'} ·{' '}
                {rulerTime(mixLength)} Session
              </span>
            </div>
            <small className="session-note">
              Looped takes repeat from their start position until the Session
              ends. Saved takes stay in this browser.
            </small>
          </section>
        )}
        <footer>
          <span>Make a progression. Make it yours.</span>
          <span>
            Save takes to Session · 3-minute takes · Download for backup
          </span>
        </footer>
      </div>
    </main>
  );
}
