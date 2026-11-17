# Original Frontline Command audio

This is the first production pass, pending listening review and final mix approval.
Every spoken line is an original script or the game's authored mission prose.
There are no franchise samples, voice clones, real-person imitations or online
speech calls during play. Build-time generation uses stock Kokoro voices.

## Reproduction

Use Python 3.12 with `assets/pipeline/audio/requirements-lock.txt`, system FFmpeg
with `libmp3lame`, and eSpeak NG. The prepared local environment is
`.local/audio-venv`. It is separate from the Blender tooling and is not shipped.

```sh
.local/audio-venv/bin/python assets/pipeline/audio/dialogue.py
.local/audio-venv/bin/python assets/pipeline/audio/synthesis.py
.local/audio-venv/bin/python assets/pipeline/audio/voice.py
.local/audio-venv/bin/python assets/pipeline/audio/common.py
```

`dialogue.py` contains faction and role-specific scripts and reads mission text
from the actual authored content. It exports reviewable Markdown under `scripts/`.
`synthesis.py` contains the original sound designs (SFX). Music moved to
`music.py` on 2026-11-08 (score engine v2):

```sh
.local/audio-venv/bin/python assets/pipeline/audio/music.py            # export all music
.local/audio-venv/bin/python assets/pipeline/audio/music.py --only battle_US --preview /tmp/wav
```

`music.py` holds the instruments (band-limited saw ensembles, brass, strings,
Karplus-Strong plucks, FM bells, ney, distorted power chords, synthesized drums),
the authored progressions and melodies for each faction, the arranger and the mix
(stereo convolution reverb, kick sidechain, glue compression). Melodies are written
in scale degrees and snapped to chord tones on strong beats. Each faction has an
identity (v3, see `work/evidence/audio/music-v2-critical-review.md`): US airborne
precision, IR drone network in 12/8 (santur, kamancheh, tombak, daf, telemetry),
SY guerrilla (buzuq, broken lo-fi beat, ambush drops), SA armored formation
(ardah-style war drums, low brass, machinery), menu industrial console. Loops are
64 bars. `music.victory_{US,IR,SY,SA}` are per-faction victory anthems: original
melodies in Latin dance-pop, Persian heroic anthem, dabke and ardah styles. Battle layers (calm, tension, combat) share their
faction's tempo, 32-bar duration and phase origin so the mixer can crossfade them.
Notes, delays and reverb tails wrap circularly, so loops are seamless. Music is
44.1 kHz stereo. It updates only the `music.*` entries in `index.json` and leaves
SFX and voice entries alone. `work/evidence/audio/music-v2-listen.html` is a
local page for auditioning the score and anthems. Music is not copied or generated from a
reference recording.

`voice.py` pins Kokoro repository revision
`f3ff3571791e39611d31c381e3a41a3af07b4987` and verifies model weights SHA-256
`496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4`.
Every export records the exact voice-weight hash. The model runs on CPU with two
threads to leave the GPU available for the sequential Blender batch. English
voices reflect fictional radio roles; the pipeline does not simulate national
accents. Male stock voices use a dry field-radio treatment: modest pitch
weight, chest resonance and parallel saturation, with consonants kept clear.

## Source and runtime separation

- `masters/`: editable float WAV masters; preserved locally, not in the game pack.
- `renders/`: source fingerprints, generator/provenance and decoded signal measures.
- `scripts/`: exact dialogue and captions.
- `licenses/`: Apache license text, the pinned model card and voice inventory.
- `assets/build/audio/`: browser Ogg/Vorbis, MP3 fallback and atomic index.

Both encodings have exact byte counts and SHA-256 values. The runtime index lists
only complete pairs. Source fingerprints permit interrupted production to resume.
The browser package includes only exported audio and its index; no model weights,
Python, FFmpeg or network account is required by the player.

## Licensing and attribution

Scripts, score, sound-design code and original synthesized effects were authored
for this project. The Kokoro inference package and model are marked Apache 2.0
by their authors. The model repository uses its model-card license declaration;
it does not provide a separate model `LICENSE` file. That declaration is preserved
in `licenses/kokoro-model-card.md`, and the full Apache text from the inference
repository is in `licenses/kokoro-code-LICENSE.md`.

The upstream model card also credits the Koniwa and SIWIS training material. Its
attribution table and links are preserved verbatim in the bundled source notice.
This project uses English stock voices and does not redistribute the model or
training data. Source links: [model](https://huggingface.co/hexgrad/Kokoro-82M),
[inference package](https://github.com/hexgrad/kokoro).

Signal validation and browser playback tests are recorded separately from listening
review. Passing decoding, headroom and event-routing checks does not establish
performance quality or a finished mix.

## Rougher field-radio pass — 8 November 2026

All faction roles use male stock voices. Unit responses, announcers and mission
radio share the same dry, gritty treatment; exact dialogue and captions remain
unchanged. This is a performance/timbre revision at the original loudness target.
The prior blanket output boost has been removed.

`voice.py` preserves the complete runtime index and merges each rendered voice
by exact URL. This pass follows the 745 published voice variants and their
shipped captions, including a legacy mission warning; unpublished source-only
mission lines are not added. It does not reconstruct music or effects from
missing master receipts. Original runtime encodings are retained in
`.local/audio-before-rough-20261108/`; new editable WAVs and provenance are under
`masters/` and `renders/`.

`combat_master.py` adds dry upper-body resonance, parallel grit and a sharper
attack to weapon shots and impacts, retaining their original peak budget and
exact sample count. It leaves music, UI and continuous ambience alone. Re-run:

```sh
HF_HUB_OFFLINE=1 .local/audio-venv/bin/python assets/pipeline/audio/voice.py
.local/audio-venv/bin/python assets/pipeline/audio/combat_master.py
```

Listening preference remains subjective; signal validation verifies playback
integrity, headroom and preserved routing, rather than artistic approval.

## Local-only victory-song overrides

Shipped victory music is the original `music.victory_{US,IR,SY,SA}` set above.
No commercial recording is downloaded or shipped. An operator may audition
their own files in a local build only: place `US.mp3`, `IR.mp3`, `SY.mp3`
and/or `SA.mp3` in `.local/victory-songs/` (git-ignored), then run:

```sh
.local/audio-venv/bin/python assets/pipeline/audio/import_victory_songs.py
```

It trims each file to a loop (60 s by default; `--start`, `--seconds`,
`--crossfade`, `--only US,IR` adjust it), re-encodes through the same export
path as `music.py`, and updates only the victory index entries. The first
import backs up the shipped originals under
`.local/victory-songs/backup-original/`; `--restore` puts them back. Never
commit or package imported encodings — restore before any release build.

## Moderate runtime compression — 16 November 2026

Runtime exports use Vorbis quality 3 (`soundfile` `compression_level=.70`, where
larger values mean more compression), 64 kbit/s MP3 for mono speech/effects, and
112 kbit/s MP3 for stereo music. Sample rates, channel counts, authored timing,
loop lengths, music layer phase, captions and mixer routing are preserved.
This changes codec precision, not the mix or loudness. Both browser formats remain
available; editable WAV masters are preserved outside the player package.

Apply or verify the migration with:

```sh
.local/audio-venv/bin/python assets/pipeline/audio/compress_runtime.py
.local/audio-venv/bin/python assets/pipeline/audio/compress_runtime.py --verify-only
```

The migration retains exact original Ogg/MP3 pairs, the original index and changed
render receipts in `.local/asset-compression-originals-20261116/audio/`. It uses
matching speech/combat WAV masters where available. Music and other effects with
no retained WAV use the preserved original Ogg once; rerunning verifies published
fingerprints instead of repeatedly transcoding lossy output. An encoding that
cannot save bytes retains its original. The complete index is updated by URL;
event routing, fallback URLs and captions are never reconstructed from partial
render receipts. Exact byte counts and SHA-256 values describe the published pair.

`compression-report.json` in that backup directory records before/after sizes,
source fingerprints and validation for every clip. The verifier decodes both
formats and checks exact sample count, rate, channels, duration, headroom, and
music layer alignment. These signal checks do not replace subjective listening.
Future speech, combat and music exports use the same codec settings.

The installed migration retains all **643 events and 927 Ogg/MP3 pairs**. Runtime
audio decreased from **183,503,330 to 121,302,498 bytes (33.90%)**. Of those clips,
846 used preserved WAV masters and 81 used the original Ogg export. Each output
retains its format's original decoded frame count, including any pre-existing
MP3 decoder-padding tail; those tails are not treated as authored loop changes.

Transient SFX and UI exports have an additional per-format quality guard against
their preserved runtime originals: RMS energy must stay within 5% and normalized
waveform correlation must be at least 0.97. Outputs below this guard retain the
exact original codec file. The v2 refinement restored 33 encodings at a cost of
235,646 bytes; voice/music stayed unchanged. Its report records before/final
metrics for all 310 effects/UI encodings. The previous report is retained as
`compression-report-v1.json`. This refinement requires no additional lossy encode:

```sh
.local/audio-venv/bin/python assets/pipeline/audio/compress_runtime.py --refine-effects
```
