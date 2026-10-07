/// <reference types="vite/client" />
import type { AudioTrack } from './instrument';
import AudioRenderWorker from './audio-render.worker.ts?worker';

let cached: { key: string; pcm: Float32Array } | null = null;

/** Render long arrangements off the UI thread; reuse unchanged audio for seeking. */
export async function renderAudioTracks(
  tracks: AudioTrack[],
  rate: number,
  duration: number,
  signal?: AbortSignal,
): Promise<Float32Array> {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const key = JSON.stringify([tracks, rate, duration]);
  if (cached?.key === key) return cached.pcm;
  return new Promise((resolve, reject) => {
    const worker = new AudioRenderWorker();
    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (
      event: MessageEvent<{ buffer?: ArrayBuffer; error?: string }>,
    ) => {
      cleanup();
      if (event.data.error || !event.data.buffer) {
        reject(new Error(event.data.error ?? 'Audio could not be rendered.'));
        return;
      }
      const pcm = new Float32Array(event.data.buffer);
      cached = { key, pcm };
      resolve(pcm);
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || 'Audio preparation failed.'));
    };
    worker.postMessage({ tracks, rate, duration });
  });
}
