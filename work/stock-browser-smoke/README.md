# Genuine stock Firefox / Safari App smoke — authoring handoff

## Execution update, 29 September

`firefox-02` passes all17 recorded checkpoints with real Firefox156.0.1/geckodriver0.37.1, exact Go save/export/import/load/replay and zero observed errors. The first attempt remains failed on a test-script quoting error, fixed by passing CSS selectors as WebDriver arguments. `safari-01` is setup-blocked on Safari's explicit “Allow remote automation” requirement; the user opt-in is requested and no setting was bypassed. All sessions/processes are closed. Full details and limitations: `docs/genuine-browser-acceptance.md`. Historical authoring-only statements below retain their original scope.

2026-09-29: **author preflight passes for both browsers; four dependency-free W3C helper tests pass. The actual browser course is UNRUN.** No browser, WebDriver server/session, HTTP server or game host was started by these checks. Root owns serial browser execution.

The shared runner is `client/tests/stock-browser/product-smoke.mjs`; it uses the W3C HTTP protocol directly, not Playwright's patched Firefox or WebKit. Existing esbuild bundles a passive observer against the exact frozen protocol. No additional package installation was needed.

## Exact inputs

- Product: `work/art/effects-opus-v2/integration-v23/product`.
- `build.json` SHA-256: `0debf4ba46647aa0af24d95ba216463f2ef0025e67b850ffa1749543fbe91777`.
- Source digest: `723651b29547fa9b62e37b1e96d148a2f186ca691f28af558cf8092a793a65c1`.
- Pack SHA-256: `d2e53993df9635172a11fb227ac7410bca482969a9ca04258b3d80fe548649e0`.
- Runtime WASM: `d1d7b97deaa4c73f58ba8b8035858d524d24c64d5c52f4ce4e71bcd47dbdb7ae`, simulation 0.3.4. The runner pins all frozen source files and core runtime bytes, then verifies every served product file against this pack. It never rewrites the product.
- Stock Firefox **156.0.1**, prepared task-local executable and Mozilla-signed geckodriver **0.37.1**, located through the preserved `work/tools/browsers/20260929-prerequisites/executables.json` receipt.
- Installed Safari **26.5** / **21624.2.5.11.4**, `/Applications/Safari.app/Contents/MacOS/Safari`, with Apple `/usr/bin/safaridriver`.

Both preflights rechecked executable hashes and code signatures (deep/strict app verification). Complete identities, signature outputs and core hashes are in `firefox-preflight-01/result.json` and `safari-preflight-01/result.json`, each with 145 inputs verified again at completion. Actual generated session capabilities do not exist yet; the real run must record them and assert the returned browser name/version matches the prepared executable. The prior absent Safari `AllowRemoteAutomation` preference key does not establish effective readiness.

## Authored gates — pending execution

The course requests a 1600×1000 outer window and records the actual inner viewport. It enters first-run settings with sound off, changes and reloads stored display preferences, then uses normal Skirmish controls to start Copper Junction / US against one Easy deterministic Go AI. The ordinary App-generated seed and exact player configuration are recorded, not overwritten.

Real W3C clicks select the owned engineering rig; a normal minimap click centers on a nearby point derived solely from the current owned view, followed by Move and a canvas click. Success requires the actual Go receipt and actor displacement, not just the click. HQ / Vehicles / Engineering rig then queues ordinary paid production: a started job with positive paid amount and a new completed owned rig are required. No resource grant, practice command, direct RPC, snapshot injection or engine change is used.

The pause menu must stop real ticks; Resume must advance them. Save operation and Archive replay run while paused. The archive's Export button must produce a real save Blob whose engine bytes/hash match the authoritative worker save. The same file goes through the ordinary file-import input using W3C Send Keys; both copies must remain. Load must pass those same bytes to Go, emit the same initial tick, and produce the same opening autosave hash. The replay archive then opens the real recorded replay, seeks to its exact final tick and back to its opening using timeline End/Home keys, exposes no production buttons or Save operation, and accepts no extra command from an ordinary context click. Each menu return must restore the initial live Go-worker count and remove battlefield/replay/targeting controls.

## Observation and limits

The isolated static server inserts one observer script into the HTML **response**, before the unchanged App bundle. It only observes real worker requests/replies, authorized protobuf views, clock, errors and App-generated download blobs. Original Worker methods run unchanged. Large save/export bodies are omitted from ordinary polling and read only for integrity evidence. Observation overflow fails explicitly.

The observer suppresses only the native OS dispatch of App-generated download anchors and captures their actual Blob bytes. The runner writes those bytes inside its evidence directory. This verifies App export generation and subsequent real file import, **not the Firefox/Safari download manager or user's Downloads folder**. No download preference changes occur. Firefox gets geckodriver's fresh temporary profile; Safari uses the standard driver's automation session. There is no `safaridriver --enable`, preference write, developer-menu bypass or patched-browser fallback. Unsupported Safari setup or file-input capability must fail with the original W3C code/message preserved.

Window/worker errors, unhandled rejections, `console.error`, observed fetch failures, static-server errors, rejected owned orders and cleanup failures fail the course. Screenshots and body text are taken at key boundaries. This W3C-only observer does not claim CDP/BiDi-complete network or browser-internal console coverage; resource element errors are observed and every served file is checked. No full match, combat victory, audio qualification, offline-install, responsiveness across aspects, performance, prolonged memory or release claim is earned by this short course.

The four helper tests use an in-memory fake fetch only: exact W3C new-session/capabilities and escaped element IDs; verbatim Safari setup failure without retry/fallback; actual pointer actions plus release; local-origin restriction and unswallowed polling errors. They do not count as browser coverage.

## Run commands for the lane owner

A new output directory is mandatory. Preserve any failed run; do not reuse its directory or relax a failed gate silently.

```sh
node client/tests/stock-browser/product-smoke.mjs \
  --product work/art/effects-opus-v2/integration-v23/product \
  --out work/stock-browser-smoke/firefox-01 \
  --browser firefox

node client/tests/stock-browser/product-smoke.mjs \
  --product work/art/effects-opus-v2/integration-v23/product \
  --out work/stock-browser-smoke/safari-01 \
  --browser safari
```

Run serially. Default driver ports are 4445 and 4446; an occupied port fails instead of attaching to or killing another driver. `--driver-port N` can choose another free local port. Session deletion and only the runner's own driver process cleanup are attempted on failure. The result retains requested and actual capabilities, precise failed phase, full setup error, command timings, screenshots, real exports, observation and immutable-file verification. Timings are diagnostic only.

For another browser-free author check, add `--author-preflight true` and use a fresh directory. `node --test client/tests/stock-browser/w3c.test.mjs` also starts no server. `handoff.json` locks the authored files and the two preflight receipts.

Primary protocol/reference sources: [W3C WebDriver](https://www.w3.org/TR/webdriver2/), [Mozilla capabilities](https://firefox-source-docs.mozilla.org/testing/geckodriver/Capabilities.html), [Mozilla temporary profiles](https://firefox-source-docs.mozilla.org/testing/geckodriver/Profiles.html), [Apple Safari WebDriver setup](https://developer.apple.com/documentation/safari-developer-tools/macos-enabling-webdriver). The [Playwright browser documentation](https://playwright.dev/docs/browsers) explains why its patched engines are separate evidence.
