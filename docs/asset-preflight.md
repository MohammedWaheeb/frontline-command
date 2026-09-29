# Battlefield asset verification

`prepareBattleAssets` now verifies the selected world quality, the dedicated UI images actually used by `ArtLibrary.cameo`, and a conservative fallback graph. It uses one per-launch verifier; nothing in this change loads the whole roster into GPU memory or changes art, rendering, gameplay, lobby readiness revisions, or network admission.

## Bounded graph

The verified-file ceiling is 16,384. Its sealed-inventory justification is 14,222 sprite files + 22 terrain images + 136 roles × 4 UI files = 14,788, leaving 1,596 files of bounded margin. The sprite bound is the prior, larger standard-quality two-scale graph, so retaining it is conservative after this correction. The inventory contains 75 units, 61 faction building sheets and 26 props; two of those props are editor-only. See `work/art/roster-runtime-overlay-v1/preflight-budget/result.json` (SHA256 `4fa065cab4de58be70677e3d078eca37fd6dfc90b41c0b29f4ecedd2a3ebaf99`) and its append-only audit files. No extra catalog classes are assumed.

The encoded-byte limits remain unchanged: 8 MiB per JSON, 64 MiB per image, and 2 GiB per launch. The complete, final roster must still pass its actual encoded-byte gate. The older observed-family upper-rate estimate was already close to 2 GiB; unrendered PNG compression is not a guaranteed bound. The later completed strike delta does not change the original inventory receipt or this limitation.

- World sprite dependencies use `art.scale`, falling back to 1× only when the requested scale is absent, as `ArtLibrary.sheet` does.
- The actual illustrated UI uses 2× beauty/team PNG pairs. Portraits and build icons are verified when indexed; a missing build icon uses the portrait. Current 1× UI exports are unused by that consumer and are not fetched.
- Where no portrait exists, the fallback verifies **all** 2× beauty/team atlas descriptors and images, preserving every possible cameo state/direction and hull/aim combination. It does not require 2× shadows solely for UI. A role with a build icon but no portrait still gets this selection-cameo fallback.
- Only terrain materials present on the map are included in a real launch. Explicit environment assets, original catalog/faction resolution, missing-art fallback reporting, and progress labels retain their existing semantics.

Every URL is verified once per launch, including duplicate references across scales/layers. Metadata and small decoded dimensions are retained until that launch finishes; image blobs and bitmaps are not retained. A fresh launch verifies again. There is no persistent URL-only verification cache that could silently trust changed local assets. Atlas paths, metadata shape, frame bounds, declared versus decoded dimensions, and paired UI dimensions are checked. This is validation of the referenced graph, not a new cryptographic asset manifest or a claim that every declared pose has been artistically reviewed.

## Deadline and cancellation

Each real download receives its own 15-second deadline and forwards the caller's cancellation. The deadline is cleared and the caller listener detached immediately after the native reader reports EOF, or on failure before cancellation cleanup. Cleanup does not abort a finished response. In-flight cancellation and timeout remain failures with their original reasons; HTTP failures, malformed metadata, corrupt images and size violations also remain failures. A bitmap is closed even when cancellation happens during asynchronous decoding. Decodes remain sequential.

The original source used `AbortSignal.timeout(15000)` (and `AbortSignal.any` with the parent), leaving those signals live after the response body completed. The deterministic before/after course executes both production `prepareBattleAssets` implementations with the same controlled response/deadline oracle. The original makes four requests for three unique files and aborts all four after EOF; the correction makes three requests and leaves no deadline or parent callback attached after EOF. See `work/evidence/asset-preflight/deadline-proof.json` and its preserved original source.

This proves the source-level late-abort defect. It **does not** retroactively classify the 6,770 raw `ERR_ABORTED` records in `work/battlefield-clarity/chromium-09/browser.json`, which lack exact request ordinals and native EOF observations. Those records remain unclassified. Fresh whole-App tracing is still required; the separate passive helper is documented in `docs/full-app-response-tracing.md`.

`ArtLibrary.init()` remains the existing separate index loader/cache. Its initial `/art/index.json` request is outside the preflight file/byte counter and deadline; this change checks caller cancellation again immediately after it returns. Audio, FX, menu art, chrome and code-drawn overlays also retain their separate loaders.

## Frozen real-asset graph audit

`client/tests/render/asset-preflight-graph-audit.mjs` runs the production planner/verifier against the immutable `work/art/roster-runtime-overlay-v1/outputs/current-four-v19/product`. The four complete overlays are US fighter (896 poses), US airlift (656), US tank and SA mobile ABM. It verifies exact referenced bytes/hashes against the overlay receipt and uses actual PNG header dimensions as its injected oracle. It does **not** claim browser decoding, live actor state coverage, visual acceptance or GPU residency. The complete frozen index still contains only 69 sprite sheets and incomplete roster coverage.

| Scope | Quality | Old unique graph files / encoded bytes | Corrected files / encoded bytes |
|---|---|---:|---:|
| Four complete overlays | Standard | 464 / 110,165,529 | 250 / 28,208,090 |
| Four complete overlays | High | 234 / 82,606,489 | 250 / 82,951,987 |
| All 69 indexed sprites + all indexed terrain | Standard | 1,831 / 342,731,865 | 1,249 / 143,847,325 |
| All 69 indexed sprites + all indexed terrain | High | 961 / 257,323,276 | 1,057 / 259,385,215 |

The older comparison omits dedicated UI images because the original implementation did. It counts unique dependencies, not redundant requests made by that implementation. High-quality verification grows by the newly covered UI files. The all-index rows are a conservative frozen-graph audit, not a claim that one actual map uses every sheet or terrain image.

Evidence: `work/evidence/asset-preflight/frozen-four-01/audit.json`. Frozen index SHA256: `4927e9828da1f5bfc7efbca606fb6830cb5d4773ea67d39612da2836b8f047e3`; overlay build receipt: `410b78352d886c19144658ff8071723d44a934b8d2d5a263fc9be20f8851ec50`. Across both qualities, the audit checks 480 of the overlay's 496 files; the 16 omitted files are the four roles' unused 1× UI images. The largest checked PNG is 2,296,062 bytes; the largest metadata file is 144,364 bytes. No immutable product files changed.

## Focused checks and remaining product gate

Twenty focused tests pass, including a valid 4,550-file graph, the exact file-cap boundary using a tightened test limit, encoded limits, URL dedup, quality/UI fallback, cancellation before/during downloads and decoding, native EOF cleanup before a delayed decode, failure cleanup preserving its cause, sequential bitmap disposal, malformed/partial metadata, paths, and atlas/UI dimensions. Both app and runtime TypeScript checks pass. The initial test-only literal-limit typing failure is preserved in `runtime-typecheck-01.log`; the final check supersedes it. No shared runtime test output directory was modified.

No browser or host was launched for this change. Root owns the forthcoming frozen whole-App launch/readiness/cancel/retry and cross-engine decode gate. The passive native-response tracer should reconcile diagnostics only after final page/browser closure, and must retain unrelated or unproven failures.
