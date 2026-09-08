# CarryOn Chord Studio

A browser instrument built with React/Vinext and the Web Audio API. Run `npm install`, then `npm run dev` and open the Local URL (normally http://localhost:3000).

- Edit up to ten pads; physical number keys 1–0 trigger them once per press. Release to retrigger. Unassigned pads stay silent.
- Select Piano, Guitar, or Organ. All are synthesized approximations: decaying stiff-string modes, a fractional-delay plucked-string model, and sustained drawbars respectively.
- Set the fixed chord duration and volume. Holding a key does not extend the chord.
- Record, perform, then Stop. Replay and Download WAV preserve instrument/settings per event, timing, gaps, overlap, and full tails. Record new take replaces the previous take.
- After Stop, drag the trim handles or enter start/end seconds (millisecond precision). Replay and WAV download use only the selection, including chords already ringing at its start. Reset to full take restores the original; trimming never deletes it.
- After Stop, select a recorded chord in the timeline or the occurrence list. Choose a replacement root/type and press Replace. Only that occurrence changes; timing, duration, instrument, volume and trim boundaries stay fixed. Replay, Loop and WAV export use the correction. Undo edit restores changes in reverse order.
- Recordings are tab-local, capped at three minutes, and are not saved across page refresh. Download before closing. WAV is mono 16-bit PCM at the audio context's sample rate.

## Validation

`npm test` checks key repeat/retrigger behavior, timing, gaps, tails, overlap, WAV encoding, all B chord qualities at 44.1/48 kHz, note spellings, tuning in each voice, voice differentiation and mixed-instrument takes. `npx tsc --noEmit` checks types; `npm run build` creates production output.

## Sound implementation notes

B uses the same interval mapping as other roots. Root-position voicings span C3–B3; B to C is therefore a downward eleven-semitone register change, not an adjacent upward step. Pitches have not been arbitrarily changed. B major displays B–D♯–F♯, and Bmaj7 displays A♯ instead of the enharmonic B♭.

Original piano/guitar harmonic recipes were too similar. Version 3 gives them separate sound models, a softer upper-frequency balance, and a sustained organ envelope. Automated measurements support distinct envelopes/waveforms and correct pitches; they cannot prove subjective harshness has disappeared on a user's speakers.

Audio buffers are cached by sound version, sample rate and captured sound settings. Replay prepares all buffers before choosing a start time, preventing synthesis work from delaying scheduled events. Cleanup and audio reinitialization also tolerate live development updates.
