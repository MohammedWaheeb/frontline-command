# Next isolated artifact stage — historical preparation

> Executed2026-09-29 with exact fresh inputs: see [results and preserved failures](RUNTIME.md).
> This original planning text is retained to distinguish intended and earned scope.

No native host, Go WASM, browser product, service worker or pack was built here.
The sustained native acceptance job is the sole owned native process. Root must
schedule the later artifact stage after that job reaches its result boundary.

`planned-artifact-inputs.json` records the current worker/error/type hashes.
All three still equal the c7e0 runtime inputs. They are external to the355-file
Go source lock, so recheck and copy them into the new build's input directory
before building; never assume a future mutable live file is the same input.
The generated TS protocol is already byte-identical to c7e0. Root's v19
product/art/source freeze remains owned by root and is not copied by this task.

## Build transaction

Use a new timestamped `runtime-builds/<stamp>/` directory, refusing an existing
path. Capture the exact source lock, worker inputs, pinned tool versions and
commands. Under one serial GOMAXPROCS=1 / Go package parallelism1 job:

1. Verify all355 source bytes. Build `./cmd/wasm` for js/wasm into
   `frontline.wasm`; build native `./cmd/wasm` and `./cmd/frontline` into the
   new directory's `bin/`. Use the reviewed `-trimpath` flags; never write live
   `bin`, `client/public/runtime` or an existing candidate/runtime.
2. Copy that Go toolchain's `lib/wasm/wasm_exec.js`. Read version metadata from
   the newly built native adapter, require0.3.4/protocol1/adapter1 and exact
   content hash, and write it as `version.json`. Copy the exact generated TS
   binding from this source. Bundle only the captured worker inputs with the
   pinned esbuild, retaining the worker source map and build provenance.
3. Reverify the source and worker input bytes; record each output's SHA-256
   and length. Do not require equality of old native executable hashes when
   VCS/build metadata differs; preserve exact new provenance and compare actual
   simulation results. The source's non-test runtime inputs match c7e0 exactly.
4. Keep product/service-worker/pack creation a separate root-owned integration
   step. The base pack must reference the exact new runtime bytes. Nothing in
   this plan copies account credentials, old manifests, experimental scene saves,
   or mutable art into an already accepted product directory.

## Actual fixture and parity plan

Generate fresh evidence outside `source/`, under the same new artifact output.
Do not relabel older saved state. These existing tests use ordinary engine
transitions or explicitly disclosed bounded test fixtures and export exact Go
bytes; they are distinct from the campaign's ordinary-play completion proofs.

| New inputs | Existing test/environment interface | Required comparison |
|---|---|---|
| Six approach/final service scenes | `TestCandidateServiceActualReturnsAndNativeScenes`; `FRONTLINE_SERVICE_SCENES` | Six real final layouts and18scene/save files; Restore valid before use |
| Combat/casualty/range fixtures | Selected `TestCombatFeedback*`, `TestOwnerCasualty*`, `TestOwnerRanges*`; `FRONTLINE_COMBAT_OUTPUT` | Current privacy and state assertions pass; ranges include exactly15 `ranges-*.start.save.json` inputs |
| Tactical/strategic views | Selected `TestTactical*` excluding the separate canonical-output harness; `FRONTLINE_TACTICAL_VIEW_DIR` | Same authorized field presence/absence and projected geometry |
| Service Session | `TestCandidateServiceSessionAdapterParity`; `FRONTLINE_SERVICE_INPUT` and mandatory distinct `FRONTLINE_SERVICE_ADAPTER_OUTPUT` | Native and actual js/WASM final state, owner wire and save digests equal for all six |
| Actual codec | Combat, owner casualty and owner range codec tests in both `cmd/wasm` and `internal/server`; the exact `FRONTLINE_{COMBAT,CASUALTY,RANGES}_INPUT` directories and separate codec-output files | Native adapter, native host and actual js/WASM outputs equal; no foreign private data or fabricated optional defaults |
| Direct conversion oracle | `TestActualGoSavedViewsMatchJSON`; `FRONTLINE_SNAPSHOT_SAVE_DIRS` path list | At least20 real saves/40perspectives, detached values and old-JSON deterministic-wire equivalence |

The old adapter script inherited GOMAXPROCS=2 into js/WASM and failed before
tests; that history must not be repeated. Explicitly use GOOS=js, GOARCH=wasm,
GOMAXPROCS=1 and the pinned `go_js_wasm_exec` for actual WASM tests. Never count
an environment-dependent skipped test as a parity pass. Keep package-specific
output files distinct so host/native/WASM cannot overwrite each other's records.

After full native/WASM parity, root chooses the final product freeze and browser
course. Those runs must verify new runtime metadata, exact saves/replays,
privacy, actual loading and disposal. They do not follow automatically from
this written plan or the historical c7e0 artifact receipt.
