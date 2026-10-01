# Native fetch abort-report reproduction

The game's raw Chromium/Chrome abort reports also reproduce in a standalone page using native `fetch` and streamed body consumption. The test contains no React, Go, renderer, game state, image decode, global fetch/reader wrapper, request interception, retry, forced GC or production mutation. This establishes that game code is not necessary to produce the symptom under this Playwright/CDP setup. It does not identify the browser implementation defect, establish behavior without DevTools attached, or justify accepting unexplained game diagnostics.

The immutable inputs are a3,328-byte JSON atlas, a2,734-byte PNG and a287,401-byte PNG copied byte-for-byte from frozen v23. Every request has a unique full URL; each positive-path URL was served once and maps to one actual page-target CDP Fetch request with status200. The full native bodies are retained as byte arrays solely for hashing after each workload block; SHA256 and lengths match every source exactly. Native `Response.json()` is checked against the same parsed JSON value instead of claiming raw byte proof. All original sources, resources, browser/version/executable digests and final request ledgers are preserved per run.

Two observation levels avoid conflating all results with the full-App wrapper: `local` writes local JavaScript records until a block ends; `binding` additionally emits a native callback boundary through a synchronous CDP Runtime binding. Neither replaces `fetch`, Response or reader methods. Both still have DevTools Network attached, and observed counts are not performance or incidence-rate evidence.

## Results

Both corrected comparison runs executed1,120 requests. They each reported95 `net::ERR_ABORTED` events; the equal totals are incidental, while per-pattern counts differ. All native reads/JSON checks passed, no console/HTTP errors occurred, executable bytes stayed unchanged and final CDP/Playwright failure counts agree.

| Native pattern | Chrome154 local / binding | Chromium151 local / binding | Requests per block |
| --- | ---: | ---: | ---: |
| Stream, release lock, no signal | 6 / 3 | 4 / 5 | 48 |
| Stream, release lock, signal | 8 / 0 | 4 / 4 | 48 |
| Stream, retain response+reader, no lock release/signal | 8 / 4 | 8 / 6 | 48 |
| Stream, retain response+reader+controller, no lock release | 8 / 14 | 14 / 1 | 48 |
| Stream, released lock, retain response | 6 / 10 | 15 / 9 | 48 |
| Stream, released lock, retain reader | 8 / 11 | 6 / 8 | 48 |
| `arrayBuffer()`, no signal / signal | 0 / 0 for both | 0 / 0 for both | 48 each |
| `blob()`, no signal / signal | 0 / 0 for both | 0 / 0 for both | 48 each |
| `json()`, no signal / signal | 0 / 0 for both | 0 / 0 for both | 16 each |
| Stream, explicitly abort after EOF | 7 / 2 | 4 / 7 | 48 |

Chrome was genuine154.0.8037.58 at the verified task-local path, executable SHA256 `633aa60f1ee2346804e006071d8f6a2114106e9c17abd601fe61bf9754638740`. The comparison was bundled Chromium151.0.7922.34. Both used fresh temporary profiles and headless mode. No browser settings or personal profiles changed.

Every error in the explicitly bound stream blocks was delivered by CDP **before** the native JavaScript EOF observation:44/44 in Chrome154,40/40 in Chromium151. Native reads nevertheless subsequently reached EOF and exact full byte hashes. Even the explicit abort-after-EOF controls emitted their diagnostic before the requested abort. The appropriate description is therefore “network failure report followed by successful complete native consumption,” not “application canceled a completed request.” A fresh review of the v23 Chrome154 tracing receipt also finds68/68 error callbacks before its recorded EOF callbacks. Older uninstrumented reports have no such ordering proof.

This rules out application AbortController use, immediate lock release and dropped Response/reader references as **necessary** triggers. It does not prove one of those variables can never affect scheduling. Successful built-in readers are bounded observations, not a recommendation to replace protected streaming with an unbounded allocation.

The initial `chrome154-01` probe is retained as `failed-diagnostic-integrity`: the otherwise completed matrix also requested an absent favicon and emitted a404 console error. A data favicon removed that fixture mistake in `chrome154-02`; no diagnostic was suppressed. The first probe's100 raw stream errors remain recorded.

## Protected pipeTo follow-up

A separate test-only `boundedPipeRead` candidate pipes the original response into a WritableStream sink. It enforces the same64MiB per-image/2GiB total production-style limits, retains only checked chunks, propagates a parent AbortSignal, uses a cancelable15s deadline, detaches deadline/listener on sink close/failure and preserves the first actual failure. It is not imported by production.

One fresh genuine Chrome154 run compared this candidate with the existing stream-reader and native arrayBuffer controls:

| Pattern | Local failures / requests | Bound failures / requests |
| --- | ---: | ---: |
| Stream reader + signal | 11 / 48 | 4 / 48 |
| Native arrayBuffer + signal | 0 / 48 | 0 / 48 |
| Bounded pipeTo + signal | 6 / 48 | 0 / 48 |

All288 positive-path body hashes pass; no console/HTTP errors occurred. Actual HTTP negative controls separately verify per-file limit, cumulative limit, exact parent error identity and timeout type, accounting for four additional expected intentional abort reports. Six deterministic native-stream unit tests also verify cleanup, already-canceled/no-fetch behavior, oversize cause preservation while cancellation settles, native failures and exact bytes. The browser deadline control uses20ms against a deliberately300ms split response; the normal candidate default remains15s.

**pipeTo is not a demonstrated remedy.** Its uninstrumented-within-page block still produces6 reports, and its zero in one more heavily observed block cannot establish reliability. No production change or diagnostics whitelist was made. The browser lane is closed/released; a deeper browser/DevTools investigation is a separate task.

## Evidence and reproduction

- Driver: `client/tests/render/native-fetch-primitives.browser.mjs`
- Test-only sink: `client/tests/render/native-fetch-pipe-candidate.mjs`
- Focused tests: `client/tests/render/native-fetch-pipe-candidate.test.mjs`
- Compact source/executable/input/report hashes and complete per-pattern counts: `work/evidence/native-fetch-primitives/receipt.json`
- Full immutable sources/resources/native/CDP/PW ledgers: `work/evidence/native-fetch-primitives/{chrome154-01,chrome154-02,chromium151-01,chrome154-pipe-01}/`

```sh
node client/tests/render/native-fetch-primitives.browser.mjs \
 --product work/art/effects-opus-v2/integration-v23/product \
 --out work/evidence/native-fetch-primitives/NEW-UNIQUE-PATH \
 --iterations 16 \
 --executable 'work/tools/browsers/20260929-prerequisites/apps/Google Chrome.app/Contents/MacOS/Google Chrome'
```

Omit `--executable` for bundled Chromium; add `--pipe true` for the bounded sink/control probe. Each output directory must be new. The process preserves diagnostic outcomes rather than equating “all bytes matched” with a clean network acceptance gate. Browser plugin was unavailable; the established Playwright fallback was used.
