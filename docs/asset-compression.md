# Runtime asset compression

The November 2026 profile reduces installed/download size with moderate color
quantization, a smaller high-resolution tier for larger units, and lower audio
bitrates. It preserves authored animation counts, headings, game geometry,
captions, routing and music timing. It does not regenerate artwork or alter mixes.

Measured package sizes (decimal MB, excluding private host data):

| Item | Before | After | Reduction |
|---|---:|---:|---:|
| PNG graphics | 1,188 MB | 676 MB | 43.1% |
| Ogg + MP3 audio | 183.5 MB | 121.3 MB | 33.9% |
| Complete package | 1,503 MB | 929 MB | 38.2% |
| Portable ZIP | 1,334 MB | 800 MB | 40.0% |

## Graphics

- Standard 1x sprite dimensions remain unchanged. Forty-five larger vehicle and
  aircraft sprites use 1.5 physical pixels per world pixel in the high tier,
  instead of 2. Infantry and other small unit frames keep their original 2x tier.
  Buildings, effects and UI retain their dimensions.
- Resizing extracts and filters each frame separately in premultiplied alpha,
  then repacks pages with two-pixel gaps. This avoids bleeding between poses.
- `atlas_resolution` declares physical pixels per world pixel. The existing
  `1x`/`2x` keys select quality tiers; `frame_size_2x`, `anchor_2x` and hardpoints
  remain logical 2x coordinates. Renderers and menu compositions account for the
  physical resolution. Atlas frame rectangles and ink bounds use physical pixels.
- PNG compression preserves mask/shadow decoded pixels exactly after the resize
  step. Beauty images must pass composited color and alpha checks. Exact-alpha
  RGB quantization is available when a palette would damage transparent edges.
  Effects are excluded from this pass to preserve their authored pack hashes.
- Originals and transformation receipts are retained outside the player package
  under `.local/asset-compression-originals-20261116/`. Raw artwork, Blender
  models and editable source files remain available.

For this asset generation, from the source root:

```sh
work/art/.venv/bin/python assets/pipeline/tools/resize_runtime_units.py
work/art/.venv/bin/python assets/pipeline/tools/compress_runtime_graphics.py --include-unit-high
work/art/.venv/bin/python assets/pipeline/tools/refresh_sprite_hashes.py
work/art/.venv/bin/python assets/pipeline/tools/refresh_sprite_hashes.py --check
work/art/.venv/bin/python assets/pipeline/tools/compress_runtime_graphics.py --include-unit-high --verify-idempotence
```

The graphics tool requires Pillow, NumPy and pngquant. The retained receipts
prevent repeated shrinking or lossy transcoding. Do not delete the backups and
rerun these transformations on already-compressed exports. If artwork is
reauthored, preserve this backup generation and explicitly start a new one for
that source revision.

## Audio

Runtime audio uses Vorbis quality 3, mono MP3 at 64 kbps and stereo MP3 at
112 kbps. Sample rates, channels and per-codec decoded lengths are preserved.
WAV masters are preferred; where a matching master is absent, the preserved
original Ogg is used once. MP3 remains available for browser compatibility.
SFX/UI encodings that shift RMS by over 5% or correlate below 0.97 with their
original codec are retained at their original quality. Voice/music use their
separate signal, size and timing checks.

```sh
.local/audio-venv/bin/python assets/pipeline/audio/compress_runtime.py --verify-only
```

The index and existing export receipts contain exact new sizes and SHA-256
values. All event metadata, captions and synchronized battle layers are retained.
This is validated by decoding and comparing signal/timing data; subjective
listening approval is not implied.

## Build and verification

Run `make build` after the transformations finish. The regular package builder
captures the new exports and verifies exact copied bytes, content identities and
the offline manifest. `make demo` verifies and opens the resulting package.
Preserve a stopped host's `data/` when replacing a package; browser saves remain
associated with the same localhost origin.

Relevant checks are the runtime suite, application type check, packed-atlas
geometry checks, resize regression tests, audio verification, sprite hash check,
package integrity and browser skirmish/audio checks at both quality settings.
The absence of cleaned raw per-frame intermediates is an existing limitation of
the broad asset checker; packed-atlas verification is the applicable check here.
