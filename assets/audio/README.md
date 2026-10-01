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
`synthesis.py` contains the original instruments, sound designs, motifs, rhythms
and arrangement; `music_projects/scores.json` records the editable score values.
Battle layers share their faction's tempo, 32-bar duration and phase origin.
Circular note tails preserve loop transitions. Music is not copied or generated
from a reference recording.

`voice.py` pins Kokoro repository revision
`f3ff3571791e39611d31c381e3a41a3af07b4987` and verifies model weights SHA-256
`496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4`.
Every export records the exact voice-weight hash. The model runs on CPU with two
threads to leave the GPU available for the sequential Blender batch. English
voices reflect fictional radio roles; the pipeline does not simulate national
accents. A mild radio bandpass preserves speech articulation.

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
