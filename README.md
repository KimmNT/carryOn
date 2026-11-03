# CarryOn Chord Studio

A browser instrument built with React/Vinext and the Web Audio API. Run `npm install`, then `npm run dev` and open the Local URL (normally http://localhost:3000).

- Edit up to ten pads; physical number keys 1–0 trigger them once per press. Release to retrigger. Unassigned pads stay silent.
- Select Piano, Guitar, or Organ. All are synthesized approximations: decaying stiff-string modes, a fractional-delay plucked-string model, and sustained drawbars respectively.
- Set the fixed chord duration and volume. Holding a key does not extend the chord.
- Record, perform, then Stop. Replay and Download WAV preserve instrument/settings per event, timing, gaps, overlap, and full tails. Record new take replaces the previous take.
- After Stop, drag the trim handles or enter start/end seconds (millisecond precision). Replay and WAV download use only the selection, including chords already ringing at its start. Reset to full take restores the original; trimming never deletes it.
- After Stop, select a recorded chord in the timeline or the occurrence list. Choose a replacement root/type and press Replace. Only that occurrence changes; timing, duration, instrument, volume and trim boundaries stay fixed. Replay, Loop and WAV export use the correction. Undo edit restores changes in reverse order.
- Recordings are tab-local, capped at three minutes, and are not saved across page refresh. Download before closing. WAV is mono 16-bit PCM at the audio context's sample rate.

## Piano covers in Session

Open **Session**, choose an audio file, then select **Create piano cover**. The full song or a chosen time range is transcribed locally into three editable piano parts: melody, bass, and accompaniment. Files can be up to 80 MB and 10 minutes. The bundled Spotify Basic Pitch model and its Apache-2.0 license are in `public/models/basic-pitch`; audio is not uploaded to an analysis service.

This is an experimental transcription of the mixed recording, without source separation. Parts are estimated from note register and strength; they are not isolated original stems. Dense mixes, percussion, and vocals can produce incorrect or extra notes. The result uses CarryOn's synthesized piano. Review and correct the arrangement rather than expecting an exact cover.

Each layer supports solo, mute, volume, moving its start, and **Edit**. The note editor supports pitch, start, duration, volume, adding/deleting notes, transposing the selected section, and undo while the editor remains open. **Song sections** lets you name and time verses, pre-choruses, choruses, bridges, and other passages; labels are manual. Sections can play or loop and filter the note editor. Adding a section when the timeline is filled proposes splitting the final section.

Session displays cover layers as individual timed note/chord blocks. Melody and bass attacks within 20 ms are grouped; accompaniment attacks within 60 ms are grouped. Exact pitch-class matches are labeled with chord names, including inversions; other combinations retain their note names. Grouping is a view of the transcription and preserves the original note timing, duration, and dynamics. Click a block to edit note names/MIDI pitches, choose a replacement chord and octave, change timing/duration/volume, audition it, or delete it. **Undo block edit** restores the last block edit during this visit. Timeline zoom provides Overview, Notes, and Detail views. Pitch replacement affects that block's notes in playback and exports; timing-only edits retain its individual voices.

Layers and section markers stay in this browser. Original audio and note-editor undo history are not saved across refresh. Export **Download mix** for WAV or **Download MIDI** for separate piano tracks; both respect solo/mute and layer volume. MIDI preserves event timing, trims, offsets, and loops, but does not embed the synthesized piano sound.

## Validation

`npm test` checks key repeat/retrigger behavior, timing, gaps, tails, overlap, WAV encoding, all B chord qualities at 44.1/48 kHz, note spellings, tuning in each voice, voice differentiation and mixed-instrument takes. `npx tsc --noEmit` checks types; `npm run build` creates production output.

## Sound implementation notes

B uses the same interval mapping as other roots. Root-position voicings span C3–B3; B to C is therefore a downward eleven-semitone register change, not an adjacent upward step. Pitches have not been arbitrarily changed. B major displays B–D♯–F♯, and Bmaj7 displays A♯ instead of the enharmonic B♭.

Original piano/guitar harmonic recipes were too similar. Version 3 gives them separate sound models, a softer upper-frequency balance, and a sustained organ envelope. Automated measurements support distinct envelopes/waveforms and correct pitches; they cannot prove subjective harshness has disappeared on a user's speakers.

Audio buffers are cached by sound version, sample rate and captured sound settings. Replay prepares all buffers before choosing a start time, preventing synthesis work from delaying scheduled events. Cleanup and audio reinitialization also tolerate live development updates.
