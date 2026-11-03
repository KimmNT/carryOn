import { arrangePianoCover, type TranscribedNote } from './piano-cover';

export async function transcribeAudio(
  buffer: AudioBuffer,
  from: number,
  to: number,
  signal: AbortSignal,
  progress: (percent: number, message: string) => void,
) {
  const check = () => {
    if (signal.aborted)
      throw new DOMException('Conversion cancelled', 'AbortError');
  };
  check();
  progress(0, 'Loading the piano transcription model…');
  const [{ BasicPitch, outputToNotesPoly, noteFramesToTime }, tf] =
    await Promise.all([
      import('@spotify/basic-pitch'),
      import('@tensorflow/tfjs'),
    ]);
  check();
  await tf.ready();
  const pitch = new BasicPitch('/models/basic-pitch/model.json');
  const model = await pitch.model;
  const length = to - from;
  const notes: TranscribedNote[] = [];
  try {
    // Small overlapping chunks bound tensors and frame arrays on full songs.
    for (let start = 0; start < length; start += 15) {
      check();
      const contextStart = Math.max(0, start - 0.5);
      const end = Math.min(length, start + 15);
      const contextEnd = Math.min(length, end + 0.5);
      const ctx = new OfflineAudioContext(
        1,
        Math.ceil((contextEnd - contextStart) * 22050),
        22050,
      );
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0, from + contextStart, contextEnd - contextStart);
      const mono = await ctx.startRendering();
      check();
      const frames: number[][] = [],
        onsets: number[][] = [];
      // Basic Pitch 1.0.1 leaves intermediate tensors alive. Scope each chunk,
      // with the model loaded outside the scope so its weights remain usable.
      tf.engine().startScope();
      try {
        await pitch.evaluateModel(
          mono.getChannelData(0),
          (f, o) => {
            frames.push(...f);
            onsets.push(...o);
          },
          (p) => {
            check();
            progress(
              Math.min(98, ((start + p * (end - start)) / length) * 98),
              `Transcribing ${Math.round(start)}–${Math.round(end)} seconds…`,
            );
          },
        );
        const detected = noteFramesToTime(
          outputToNotesPoly(frames, onsets, 0.35, 0.25, 7),
        );
        for (const n of detected) {
          const time = n.startTimeSeconds + contextStart;
          // Own notes by onset, so overlap never adds the same onset twice.
          if (time >= start && time < end)
            notes.push({ ...n, startTimeSeconds: time });
        }
      } finally {
        tf.engine().endScope();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    check();
    progress(99, 'Arranging melody, bass, and accompaniment…');
    const layers = arrangePianoCover(notes, length);
    if (!layers.some((layer) => layer.hits.length))
      throw new Error(
        'No pitched notes were detected. Try a clearer recording or a different section.',
      );
    return { layers, length };
  } finally {
    model.dispose();
  }
}
