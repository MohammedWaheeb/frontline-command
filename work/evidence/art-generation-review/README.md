# Independent frozen-v1 asset consumer review

The frozen candidate has two reproducible recovery/admission defects. It must
not be promoted on its unit and type checks alone. This review changed no
candidate, production, art, simulation, UI, or browser files and launched no
browser or host.

The reviewed input is `work/art-generation-consumer-v1/frozen-v1/client`, pinned
by `source-lock-v1.json` SHA256
`4859c10adaee194242b5f257d19cd4d02961d42a16278b560a69f7d417726037`.
All 242 client files present in that lock were independently rehashed and match.
The lock contains 247 total inputs. The root's mutable v2 is separate and was not
accepted or substituted for this reviewed input.

## 1. A catalog-sized metadata burst exceeds the new queue

`src/runtime/asset-generation.ts:75–76` allows four active reads and only 64
queued reads. `src/render/art.ts:175–184` starts one metadata read for each
distinct requested sheet, without an outer admission queue. The actual Go
catalog and production `authoredArtId` resolve to 136 distinct faction/unit/
building IDs.

`proof.ts` uses those exact IDs with small synthetic, manifest-declared metadata
bodies and calls the real `ArtLibrary.sheet()` API concurrently. Exactly 68
sheets load and 68 fail with `asset_busy`. A later request for a failed sheet,
after all other requests settle, makes zero fetches and still returns undefined.
This is a catalog-sized nonbrowser API reproduction, not a claim that an actual
current battle displayed every catalog type simultaneously. The normal actor,
environment, placement and cameo consumers have no common top-level admission
gate. Preflight is sequential and therefore does not establish that later
renderer fan-out fits this queue.

The page and UI paths share the same core queue. A corrected bound must account
for them too, rather than checking only 136 metadata requests. Keep four active
reads and the 128 MiB declared-byte bound. Either admit consumer work through a
bounded outer queue or size a lightweight descriptor queue from the supported
concurrent workload, with explicit overflow behavior. Regression checks should
cover concurrent metadata, UI pairs, terrain, visible frame pages and FX, while
showing the active/byte bounds never increase.

## 2. Transient failures become persistent missing art

The following are separate caches in frozen `src/render/art.ts`:

| Path | Frozen behavior | Proof or scope |
| --- | --- | --- |
| Sheet, lines 175–178 | The catch resolves undefined and keeps that promise. | One controlled metadata 503, restore exact bytes, retry: zero requests and still missing; `release()` permits recovery. |
| Image, lines 195–200 | The rejected promise stays in `images`. | One controlled image 503, restore exact bytes, explicit same-index `useIndex()`, retry: zero requests and still rejected. |
| Cameo, lines 204–206 | The catch resolves undefined and keeps that promise. | Source-confirmed; not separately decoded in these nonbrowser probes. |
| Sprite page, lines 56–79 | Any error sets `page.failed`; later frames return before trying again. | `page-retry-proof.ts`: one `asset_unavailable`, then 100 actual public `frame()` calls, zero additional attempts. |

The same-index shortcut at line 138 means an explicit retry does not recreate the
generation or clear the failed image/cameo caches. This is actionable even when
every manifest/index/asset byte is unchanged and the fault was only temporary.
Some rejected-promise behavior predates the candidate; the new queue makes an
additional ordinary cause of these persistent failures. This review does not
attribute every cache pattern to the generation change.

For v2, explicit idle `useIndex()` should recapture and verify the candidate,
including the same bytes, before atomically replacing the old binding. Remove
rejected sheet/image/cameo entries only if the map still contains that exact
promise, preserving successful deduplication and avoiding an older failure
deleting a newer request. Page retries need bounded cooldown for explicitly
temporary `asset_unavailable`/`asset_busy`; never retry on every animation frame.
Integrity, wrong-generation, undeclared-path and decode failures must remain
visible and must not silently adopt other bytes. Running games stay bound until
the explicit idle transition. Root reports these recovery changes are being
implemented in mutable v2; they are not part of frozen-v1 evidence.

## Corrected identity-reuse interpretation

The original `proof-result.json` also preserves a `sameIndexReload` probe. It
deliberately keeps the exact same index and `packs[].version` while substituting
another manifest/art marker. Frozen v1 makes zero requests and retains A. This
is descriptor identity reuse, **not a reproduction of normal current packaged
art publication**.

The current `client/scripts/ui/art-plugin.mjs:88–104` canonicalizes the generated
pack-version field, hashes the file graph, then writes the generated
`content-v1-<hash>` version into the packaged index. Ordinary new art therefore
changes index bytes. Directly inspected v25 evidence:

- Packaged index SHA256:
  `459a1889ae41be4fbe5c3f19a076931177ec1d4828ef95d1035dbb45572c1864`.
- Root content version: `2.0.0`.
- Base pack descriptor version:
  `content-v1-4738887f82cc56851a08b02dc0fb5e3d5ad3e25f95401ea9f54671ae020df876`.

The older v24 packaged index had a static pack version of `2.0.0`. An initial
review inference based on that older index was corrected after examining the
current packer and v25 output. The original probe/result is retained; it is not
relabeled as a normal-update defect. The transient same-generation retry proof
above remains valid independently.

## Other boundaries inspected

- `asset-generation.ts` validates the captured index against its selected
  manifest, binds file keys to manifest/path/hash, verifies bytes before return,
  and fails if a selected cache disappears. No confirmed unchecked A-metadata /
  B-pixel path was found in these core reads. This does not replace real two-tab
  upgrade/removal acceptance.
- `loadSheet()` captures the generation for all metadata and page reads; late
  image and cameo work checks that its captured generation remains current.
  Decoded page resources are closed after cancellation/replacement checks.
- `release()` chains earlier work and disposes settled old sheets. The tested
  failure paths settle with zero active/queued reads; page disposal reports zero
  resident and picking bytes. No release/dispose dependency cycle was found by
  source inspection. Pending native image decode and real GPU disposal remain
  browser gates.
- Application reload publishes the content registry only after candidate art
  verification, and SessionController preparation waits for a pending reload.
  `art.fetch` itself dynamically reads the currently bound generation. It must
  remain covered by idle-only reload and session cancellation checks; this
  review did not reproduce a live-session race or claim those browser paths
  accepted.
- FX retains its existing match-owned failure caches and explicit `retry()` API;
  CombatEffects does not call that retry API. Recreating the match-owned FX
  library is currently its recovery boundary. Queue capacity checks must include
  FX reads through the newly supplied `art.fetch` adapter.
- Native stream diagnostics were not exercised or reclassified here. Neither a
  successful hash nor this audit establishes the cause of prior `ERR_ABORTED`
  reports. The reader uses timeout signals; post-EOF timer cleanup and real
  cancellation remain independent tests, not an inferred explanation.

## Reproduction and evidence

Run from the repository root with installed client dependencies:

```sh
client/node_modules/.bin/esbuild work/evidence/art-generation-review/proof.ts --bundle --platform=node --format=esm --packages=external --outfile=client/.review-art-generation/proof.mjs
node client/.review-art-generation/proof.mjs
client/node_modules/.bin/esbuild work/evidence/art-generation-review/page-retry-proof.ts --bundle --platform=node --format=esm --packages=external --outfile=client/.review-art-generation/page-retry-proof.mjs
node client/.review-art-generation/page-retry-proof.mjs
```

The probes assert the frozen failure behavior so later regressions must use a
separate candidate/expected result. `proof-result.json`, `page-retry-result.json`
and their logs preserve the red evidence. `review-receipt.json` pins the proof
sources, outcomes, relevant inspected inputs and lock verification. Generated
esbuild bundles are transient and excluded. These checks do not certify actual
PNG decoding, rendered appearance, full-App startup, or the finished game.
