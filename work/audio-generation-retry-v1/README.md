# Private audio descriptor retry correction

The frozen-v3 baseline can return an A decoded buffer or pending A decode after
an explicit audio retry selects B metadata at the same URL. The private
candidate fixes that nonvisual cache/lifecycle defect. Live product, UI, art,
gameplay and browser files are unchanged. This is unit evidence with controlled
decoder objects, not real audio playback, listening review, or browser proof.

## Baseline reproduction

`baseline/client` copies the five required files from
`work/art-generation-consumer-v1/frozen-v3/client`. `baseline-lock.json` and
`supplemental-input.json` preserve their exact hashes and parent source lock
`a70a5df5cb053b9f1ee96f5ced310b83f99c2514764f6409c27b286d8ab21282`.

`tests/baseline-proof.ts` invokes the real AudioMixer index and buffer paths with
small exact-hashed HTTP bodies and a tagged decoder stand-in. Both cases in
`evidence/baseline-result.json` select caption/hash B yet return buffer A after
only one clip read/decode. One case starts from an already decoded buffer; the
other keeps A's decode pending through B's index replacement. No clip bytes are
changed after a hash check and no extra product request is introduced.

The first isolated bundle lacked crypto.ts's errors.ts dependency and never ran.
That setup failure is retained; the exact frozen dependency was then copied and
hashed. The first narrow typecheck lacked React resolution for the unchanged
Observable helper. Its log is retained, and a local, untracked dependency link
uses the existing client installation for the passing check.

## Candidate scope

Only `source/client/src/audio/index.ts` and `source/client/src/audio/mixer.ts`
differ from the baseline. `candidate-review.diff` is the full production delta.

- Decoded and pending buffers use a descriptor key containing URL, byte count,
  SHA256, expected duration and the complete optional MP3 fallback descriptor.
  The URL already identifies the selected primary codec. Cached results cannot
  bypass different byte/hash/codec expectations at the same URL.
- Audio index bytes are bounded and schema-validated before their SHA is
  committed. A changed, valid index resets old output/captions, aborts old loads,
  and advances existing generation guards before publishing new descriptors.
  A failed candidate keeps the old index, buffers and output intact.
- An exact-byte index retry verifies the index again and preserves coherent
  decoded buffers. It does not restart audio unnecessarily.
- Disposed mixers issue no new index request. Late old decodes retain the
  existing generation checks and exact-promise removal guard, so they cannot
  populate or delete the new generation's pending/cache entries.
- The existing four concurrent decode, 64 MiB decoded-memory and 24-voice
  limits, consent/gesture rules, focus handling, hash verification, duration/
  channel checks and codec fallback rules remain unchanged. Old decoders still
  count against the four-decode limit until they actually finish; reset does
  not pretend they have stopped.

Audio still obtains its index through its existing raw fetcher. This candidate
does **not** bind audio to the game's AssetGeneration, alter metadata, or claim
whole-pack coherence. That separate integration is described in
`docs/asset-consumer-generation-scope.md`.

## Validation and remaining gates

All 11 focused candidate tests pass (`evidence/candidate-tests-final.log`):
decoded/pending same-URL replacement, atomic failed-index retention, old-source/
caption cleanup only after a valid change, unchanged-index reuse, descriptor-key
coverage, exact deduplication, failed/corrupt retry, pending-decode disposal,
late-index disposal, and preservation of four-decode admission across a retry.
Strict source TypeScript passes (`evidence/source-typecheck.log`). The earlier
10-test log is retained separately.

Commands from the repository root:

```sh
client/node_modules/.bin/esbuild work/audio-generation-retry-v1/tests/baseline-proof.ts --bundle --platform=node --format=esm --packages=external --outfile=client/.review-art-generation/audio-baseline-proof.mjs
node client/.review-art-generation/audio-baseline-proof.mjs
client/node_modules/.bin/esbuild work/audio-generation-retry-v1/tests/candidate.test.ts --bundle --platform=node --format=esm --packages=external --outfile=client/.review-art-generation/audio-candidate.test.mjs
node --test client/.review-art-generation/audio-candidate.test.mjs
client/node_modules/.bin/tsc --strict --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM --noEmit work/audio-generation-retry-v1/source/client/src/audio/index.ts work/audio-generation-retry-v1/source/client/src/audio/mixer.ts
```

`source-lock-v1.json` pins all copied/private source, tests, docs, diff and evidence.
Compiled bundles and the machine-local node_modules link are excluded. Parent
review, integration with the full runtime/type suite, and a small real-browser
audio retry/consent/disposal course remain required before promotion. No broad
browser diagnostic whitelist or old-result reclassification is involved.
