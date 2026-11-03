import { mixTracks, type AudioTrack } from './instrument';

self.onmessage = (
  event: MessageEvent<{ tracks: AudioTrack[]; rate: number; duration: number }>,
) => {
  try {
    const { tracks, rate, duration } = event.data;
    const pcm = mixTracks(tracks, rate, duration);
    self.postMessage({ buffer: pcm.buffer }, { transfer: [pcm.buffer] });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : 'Audio could not be rendered.',
    });
  }
};
