# Frozen-v2 recovery review

Frozen input: `work/art-generation-consumer-v1/frozen-v2/client`.
`source-lock-v2.json` SHA256:
`1182bfcdf111eff36f84e491d7c51642276642caaeff25083c8675c7b3b7b1cf`.
All 242 locked client files independently rehash exactly. No candidate or
production source was changed by this review; no browser/host was launched.

The v1 admission and cached-failure findings are corrected in the focused
nonbrowser probes. One new hard-error reporting defect remains in this frozen
version. Root is preparing a separate v3; v2 is not accepted as final.

## Confirmed corrected behavior

`v2-recovery-proof.ts` reuses the actual catalog's 136 production-resolved art
IDs with small manifest-declared metadata and the real ArtLibrary/core APIs.

- All 136 concurrent sheet requests load, with no errors during that burst.
- After a metadata 503, restoring the exact bytes admits the sheet on one real
  additional request without calling `release()`.
- Two image calls after transport failure make two real requests. Two failed
  cameo calls make four UI-layer requests. This proves rejected promises are
  evicted; it does not claim real PNG decode/render success.
- Explicit `useIndex()` with the exact same index and generation identity makes
  new manifest and art-index requests. It no longer silently retains a failed
  cache solely because index bytes match.
- Disposing a 136-sheet burst with four active reads and 132 queued reads aborts
  all work. Exactly four fetches start, zero queued fetches start afterward, no
  late error is reported, and active count/bytes, queue and leases all reach zero.

The new core queue is finite at 1,024 waiting descriptors. Its four active reads
and 128 MiB declared in-flight byte ceiling are unchanged. The root's queue
envelope test covers 961 descriptor reads; actual rendered mixed page/cameo/FX
fan-out remains a browser integration gate, not certified by the metadata probe.

The first recovery report retained an array reference, so a later deliberately
injected metadata failure appeared in its earlier fan-out error field. The
fan-out assertion itself had passed with an empty array. That test-reporting
mistake is preserved in `v2-recovery-*-initial.*`; the successor snapshots the
array before later stages and reruns the unchanged frozen input. No product
failure or source change is hidden by that correction.

## New defect: terminal retry failure is not reported

Frozen `src/render/art.ts:79` reports only when `page.failures===1`. A first
`asset_unavailable` followed by a distinct hard error therefore leaves the page
permanently unavailable while displaying only the earlier temporary error.

`v2-hard-transition-proof.ts` checks three deterministic two-attempt cases:
`asset_integrity`, `asset_generation_unavailable`, and a decode Error. In each:

1. The initial temporary error is reported.
2. 100 immediate frame requests cause no retry, preserving the cooldown.
3. At exactly 250 ms, attempt two fails with the selected hard error.
4. 100 more frame requests after another 60 seconds do not retry the held page.
5. The error callback contains only `asset_unavailable`; the terminal cause is
   never surfaced.

The minimal correction is to report `!retry || failures===1` while not disposed.
That preserves quiet repeated temporary retries and reports the terminal cause
once before the held page prevents additional attempts. Hard failures should
not gain an automatic retry. The proof fails before texture construction; it is
not a GPU/decoder test.

## Reviewed boundaries and limits

The rejected-promise removal checks identity before deleting, so an older
failure cannot delete a newer cached promise under the same key. Successes
remain deduplicated. Generation-keyed image requests and epoch-keyed sheet/
cameo requests retain their existing stale-completion guards. No additional
confirmed cancellation/dependency-cycle defect was found in this narrow diff.

The same-index changed-manifest A/B probe remains an identity-reuse stress
case, not a normal current packer update; see the v1 README correction.
MenuDiorama's raw metadata/image fallback is a pre-existing separate consumer
outside the battle-art guarantee, to be inventoried separately. Real image
decode, pixel parity, two-tab upgrade, full-App recovery and GPU disposal remain
required browser gates. Old native-stream reports are not reclassified.
