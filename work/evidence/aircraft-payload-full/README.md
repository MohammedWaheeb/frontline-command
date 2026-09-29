# Full-art aircraft payload course — authoring handoff

## 2026-09-29 browser execution

Corrected `firefox-01` and `webkit-01` **pass** all 80 rendered boundaries each, four replay courses, four cull/return checks and four deferred-page checks with zero recorded errors. `chromium-03` completes the same functional checks but **fails** the strict diagnostic gate on two raw damaged-smoke PNG aborts; no request is whitelisted. Cleanup returns worker/canvas/atlas/picking counts to zero, and all 264 inputs are reverified. Root's scoped screenshot review and limitations are recorded in `docs/aircraft-payload-full-course.md`; exact report hashes are in `three-engine-receipts.json`. Earlier pending statements below describe the preserved authoring checkpoints.

## 2026-09-29 adapter-delivery correction

`chromium-01` and `chromium-02` are preserved **failed** browser attempts. The first last-shot boundary had identical authoritative state/hash but a wire mismatch: raw `Engine.PlayerView` retained the tick's shot event, whereas `Session.Load`/`SeekReplay` initialize an empty pending-feedback buffer. `Session.View` emits and drains that buffer. A perspective change is another View; pause alone does not drain it. This is an oracle mismatch, not evidence of a production or payload-art defect.

`adapter-oracle-01` is a new isolated 358-file source: the exact original 357-file course source plus one `cmd/wasm` test. Source-lock SHA-256: `5b9a9eccdcc40645882b2f1fa82e2369c44c4e49da34d02a1361580fbe02aaee`. Native receipt SHA-256: `10e9427176941454d6665827a5f72aed67bf8231bbb711664008c78b139c90ac`. One serial GOMAXPROCS=1 native fixture passed 84 actual Session delivery records: 40 Load/View, 40 Seek/View and four last-shot continuations. Shared-host timings are not performance evidence. Original source, course views, saves and replays were verified unchanged.

The revised fixture compares full protobuf bytes with these native adapter outputs, without removing any JS fields. Static boundaries verify actual load/seek delivery and state hash; restored live saves also retain exact original save bytes. Final-shot presentation separately uses the original real replay: seek to shot tick minus one, choose the owner/foreign perspective, execute ordinary Step(1), then compare the resulting full current-event frame. It makes no post-Step perspective call. The same four native continuations equal the original raw Engine view including the genuine shot and explicitly prove feedback drains only once. No shot is injected.

The 80 visual boundaries now comprise 72 static loaded perspectives and eight real replay-continuation shot perspectives (two types, two qualities). The independent full replay comparison still checks 80 seek-delivery perspectives. This remains prepared-infrastructure component evidence, not App input or paid-opening proof. The short cosmetic cue restart after image decoding is unchanged and may use only the current authorized replay event.

`typecheck-02` and `build-only-04` pass. No browser/host was launched for this correction. **The corrected browser course remains unrun.** Use a new output directory and add:

```sh
--oracle work/evidence/aircraft-payload-full/adapter-oracle-01
```

`adapter_oracle_test.go` and `prepare-adapter-oracle.py` preserve the exact reproducible preparation. `adapter-oracle-evidence.tar.gz` is compact native oracle evidence; the original local saves/replays are still required to execute. Earlier authoring notes and their historical pending status remain below.

2026-09-29: native fixture and strict fixture TypeScript **PASS**; final browser build-only check **PASS**. **Browser execution and visual acceptance remain pending.** Root owns serial browser execution. No production Go, renderer, UI or asset changes belong to this course.

## Frozen inputs

- Product: `work/art/roster-runtime-overlay-v1/outputs/current-five-v19/product`; overlay `build.json` SHA-256 `069233376b8c34528986aa3712309fe0802e05a996136205740d3ee55ef2d964`.
- Renderer/runtime modules: exact `work/art/effects-opus-v2/integration-v19/source/client`, source digest `38b29b7f2664424d0a92830a325eb1afdc81b4ee025c7ba3b59f4d4c0e1ec549`. Fixture imports resolve to this frozen source, never the mutable shipping renderer.
- Art: actual complete `unit.US.fighter` (896 poses) and legacy `unit.IR.strike` (832 poses). Gunship is not covered or renamed to strike.
- Native production: exact frozen c7e0 source; one additional test file. The resulting 357-file source lock is `6cd1adb63bf12026a496355cc2d5f44a72322e5ba61bee1cb762a1c5960c9387`.
- Native output: `native-20260929T083415Z/`; receipt SHA-256 `db91a5131bcc19065bbfba97036c81a037398ea96a78faabc7000805ec5beb2f`. Isolated test binary SHA-256 `cab1a048618459366041c3d6130e5cb5c27f1f5309c44380c618ddfb799d7bd5`.

The driver verifies product, runtime, source and native artifact hashes before use and again at completion. Served product assets must match the frozen pack's byte lengths and hashes. `handoff.json` pins the final authored files, final build-only receipt and the prior fighter equivalence proof.

## Native evidence earned

One `GOMAXPROCS=1` fixture process ran on a shared browser/Blender host. These are correctness results, with no timing claim. The initial infrastructure, stationary sight providers and one remaining ammunition round are explicitly prepared fixture state. Subsequent changes use ordinary `Submit` and `Advance`; this is not a paid-opening or campaign proof.

| Actual type | Boundary ticks | Final hash |
| --- | --- | --- |
| US.fighter | 0, 10, 34, 194, 295, 397, 437, 486, 805, 806 | `d5a4486c16e1b6674a6af0b0d71d76c4a3e70655eb243e006c1dbc11da6a247c` |
| IR.strike | 0, 21, 58, 298, 399, 501, 541, 598, 1077, 1078 | `076c8c6b7482ed310f3bfa925d60f941b5fab3697299bd958765e958c61b527f` |

Each course captures: initial one round; actual last shot; Return/service admission; half service; power-disabled service held for 100 ticks; home sale and grounded emergency; emergency departure; backup service; final empty service tick; atomic refill. Fighter refills to six rounds; strike refills to two.

All 20 saves restore to the same authoritative hash and both authorized views. Each boundary includes a real currently-visible foreign view with no private aircraft fields. A replay with all checkpoints removed reproduces every captured hash and both views from its initial state. The new fighter `course.json` and all ten saved-state bytes equal the original `work/evidence/aircraft-payload/go-run-02/US.fighter` outputs. The previous gunship course is untouched.

`native-boundaries.tar.gz` contains ten compact evidence files (course views, map, results, logs, receipt and source lock), 104,809 compressed bytes; SHA-256 `8e1935d25b8a94c6f5b4f0ef9e7ae11259f3d3c423f4560ce89f890544551a80`. Its reopened entries were verified against `native-boundaries-archive.json`. The binary, 20 saves and two replay files remain local at the output path; every artifact hash is retained in the native receipt. The archive alone is not sufficient to execute the browser course.

## Authored browser gates — not yet earned

`client/tests/render/aircraft-payload-full-browser.mjs` bundles `aircraft-payload-full-fixture.ts` against the frozen v19 modules and uses the actual product Go WASM worker, ArtLibrary, ActorVisual and BattlefieldRenderer. Browser plugin was unavailable; the authored runner uses existing Playwright. Root has not yet executed this driver.

Each engine will exercise 80 rendered boundaries: two actual aircraft types × two art quality settings (1×/2×) × ten saved boundaries × owner/visible foreign perspective. It checks native/WASM hash, exact protobuf view, save-byte equality, current displayed pose/texture and nonempty actual beauty pixels. Owner empty payload variants must agree with real zero ammunition; foreign views must retain generic variants. Final-round cues use the actual current authorized Go shot event. Their short cosmetic clock is restarted after atlas decoding so screenshot timing does not depend on PNG decode latency; no extra shot is manufactured.

The same driver also requests four actual offscreen cull/return checks, four full replay courses (80 perspective comparisons), and four deferred real-PNG page checks. The page checks switch from an authorized visible-foreign service view to its real owner view, require stale loaded body pixels to disappear while the empty page is pending, then verify the admitted empty pose and different same-heading/frame loaded versus empty pixel hashes. Atlas, picking-byte, canvas and the actual Go worker disposal checks run at the end. Page errors, console errors, HTTP failures and request failures fail the course; warnings are retained.

These are component/runtime and restored-boundary checks, not App-control or continuous online-flight coverage. Pixel differences establish distinct loaded/empty images; human screenshot review must still judge payload readability and visual quality. The deferred-page test deliberately requires a genuinely new beauty-page request; a packing-related fixture assumption must be investigated and preserved if it fails. No alpha/payload assertion should be silently relaxed.

## Run handoff

From the repository root, with a fresh output directory:

```sh
node client/tests/render/aircraft-payload-full-browser.mjs \
  --product work/art/roster-runtime-overlay-v1/outputs/current-five-v19/product \
  --native work/evidence/aircraft-payload-full/native-20260929T083415Z \
  --out work/evidence/aircraft-payload-full/chromium-01 \
  --engine chromium
```

Run Firefox and WebKit serially by changing both engine and fresh output directory. Preserve any failed outputs. The runner records exact input hashes, browser version, per-boundary state/pixel records, screenshots, errors and cleanup in `browser.json`. Do not point it at a newer product or relabel the frozen v19 proof.

`build-only-03/browser.json` is the final authored-driver receipt: `compiled-only`, 174 frozen inputs verified after, zero rendered boundaries, and `noBrowserOrServer: true`. Earlier build-only receipts remain unchanged. `typecheck-01/receipt.json` records the strict semantic TypeScript pass against frozen v19 modules with the current fixture SHA. The final driver also passes `node --check`.

`prepare-native.py --run-native` documents the isolated native generation procedure and refuses to overwrite an existing source/output preparation. It has already run successfully; no further native compile is required for this handoff. No browser, host, compiler or native process remains active from this lane.
