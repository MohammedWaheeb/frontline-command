# Original-reader diagnostic successor

29 September 2026. **Author/build/type/unit preflight only; no browser or HTTP server launched.** This preserves the strict failed [v3-01 course](../art-generation-browser-v1/chromium-v3-01/receipt.json), including its three unclassified aborts and all 22 reached functional assertions. The consumer stays frozen at `../art-generation-consumer-v1/frozen-v3/client`, lock `a70a5df5cb053b9f1ee96f5ced310b83f99c2514764f6409c27b286d8ab21282`. No consumer, core, worker, product, art or live source was changed.

The driver is a separate copy of the prior transaction course. Its changes are diagnostic attachment, exact captured helper identities and retention/assertion of **every library's final resident page/byte, picking-byte and stale-picking callback counters**, in addition to native bitmap/blob cleanup. Original corruption/quota/cancel/rollback/removal/pixel/cold-start assertions and strict request-error gate remain unchanged. No error is converted to success by the new report.

## Exact three planned observations

| Request-start scenario | Public URL path | Planned immutable bytes |
|---|---|---|
| `install-and-capture-A` | `/upgrade/retired.txt` | A manifest's exact descriptor |
| `quota-ready-B` | `/art/offline-upgrade/page.png` | B's unmodified actual PNG descriptor |
| `pending-network-A-host-swap` | `/art/offline-upgrade/page.png` | A's unmodified actual PNG descriptor, captured before the existing response hold |

These identities are fixed by the prepared manifests before a browser starts. The reconciler never chooses whichever expected hash happens to match returned data. Server `finish`/`close` is retained for context but is **not an input to integrity proof**. Phase selects the planned scenario; it does not identify a native fetch. Native identity requires all the evidence below.

## Original native consumption and request identity

`helpers/` freezes six established test-only helpers from `client/tests/render`; `helper-lock.json` pins them and the new `native-diagnostic.mjs`. Each monitored page receives a unique Chromium page-target CDP session, debugger-labelled observer and random document scope before navigation. The ledger requires the actual default execution context, matching frame, observer call stack, full URL, method and unique native request ID. It joins the original reader by document scope and exact per-URL/method ordinal only after proving one-to-one cardinality and non-overlap. Redirects, service-worker-produced responses, unproved realms, duplicate identities, missing final document snapshots and incomplete traces are rejected as evidence.

The observer calls the original fetch exactly once with original arguments and preserves native reader/body-method results and rejections. It neither clones/tees a response nor adds another fetch/body read. Incremental SHA-256 observes original chunks and explicit EOF. Cancellation and its order are recorded only if actually observed. This instrumentation adds observation work/microtasks, so the successor is not timing evidence.

Bounds per document: 512 observed request records; 1 MiB per body; 32 MiB cumulative hashing; eight active incremental hashes (608 bytes each, no retained response chunks). Native returned-Blob local proof is explicitly separate and capped at 1 MiB per Blob / 2 MiB retained; the three target consumers use explicit readers. CDP ledger is capped at 4,096 records. Any overflow stays an incomplete diagnostic. No request headers, credentials or tokens are written.

`nativeDiagnostic.exactBodyReports` can say only that a uniquely identified request's original consumed bytes reached EOF and matched its planned byte count/SHA. Raw `ERR_ABORTED` remains in the report and the original strict gate. It does not assert a cancellation cause, successful decoding, a harmless browser bug or a clean course. CDP/Playwright error cardinalities must agree; errors without exact evidence remain unproved. The source captures ledgers before each context close and the persistent-browser restart, then preserves complete snapshots after cleanup.

## Preflight and prepared execution

`build-only-01` passed the seven focused reconciler tests, actual fixture bundle, strict fixture TypeScript and 266 pre/post source guards. `build-only-02` adds an explicit unchanged hash guard on the original failed receipt (267 guards). No browser, server, game host or native compiler runs in either author preflight. Tests include wrong/missing hash/bytes/EOF, reader mode, wrong realm/context, service-worker/redirect rejection, duplicate/overlapping identity, trace overflow, diagnostics disagreement, failure-before-EOF ordering and unknown scenario rejection.

Root controls the only browser lane and battery/runtime scheduling. Do not execute the browser course without its release.

```sh
node work/art-generation-diagnostic-v1/browser.mjs \
  --out work/art-generation-diagnostic-v1/build-only-next --build-only true

# Only after root releases the browser lane:
node work/art-generation-diagnostic-v1/browser.mjs \
  --out work/art-generation-diagnostic-v1/chromium-01
```

The default is pinned private consumer v3; an alternative requires all three explicit `--consumer`, `--lock`, `--lock-sha` arguments and reverified frozen inputs. The browser uses bundled Chromium, not branded Chrome/Edge or stock Firefox/Safari. There is no full-App, native Go, roster, audio, release or deployment claim from this tiny loader/transaction course.
