# Integrated0.3.4 isolated artifacts and actual parity

2026-09-29. Completed build `runtime-builds/20260929T081745Z` passes all23
recorded stages. `audit-runtime.py` independently rehashed its exact outputs,
inputs, logs, selected tests and results before promotion. Receipt SHA-256:
`cc990ac7f78d5a1094dd635d06bff0cb04d2c055ce413dbd114a7233bb176e69`.
No source/runtime was promoted until root separately reviewed this result and
the live-file manifest. See [promotion](PROMOTION.md) for that later action.

The355-file source remains lock3d49f3c0…53750, exact c7e0 production plus the
passing commander. Go1.27.1 darwin/arm64, protoc36.2, Go plugin1.36.12 and ES
plugin2.15.0 were checked again. Pinned Go/TS protobuf and35 converter mappers
regenerated without drift. One serial GOMAXPROCS1, Go package parallelism1 job
ran while root browser/Blender work could be active. Durations are diagnostic
receipts, not performance claims.

Production-equivalent build commands, executed from the frozen source:

```sh
GOOS=js GOARCH=wasm go build -trimpath -o <new-runtime>/frontline.wasm ./cmd/wasm
go build -trimpath -o <new-runtime>/bin/runtime-native ./cmd/wasm
go build -trimpath -o <new-runtime>/bin/frontline-host ./cmd/frontline
```

The matching Go `wasm_exec.js`, generated TypeScript binding and captured exact
worker inputs were packaged in that same new directory. The full commands,
tool paths, environments and orchestration source hashes are in `receipt.json`.
Simulation0.3.4, adapter1, protocol1, Go1.27.1 and content hash
`318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`
agree across the native version and actual production WASM API (also20ticks/s).

| Artifact under the new runtime | Bytes | SHA-256 |
|---|---:|---|
| `frontline.wasm` |11237971|`d1d7b97deaa4c73f58ba8b8035858d524d24c64d5c52f4ce4e71bcd47dbdb7ae`|
| `bin/runtime-native` |8629298|`2e7201360d5241f69b66a4dadffe1ee8ccba3dcb1802597bebbd362cb73320e5`|
| `bin/frontline-host` |20805138|`36ca8c93f538696206317113d50af6ee31ac92fcbcd626a0a9f9b0ceaab8a5e0`|
| `worker.js` |8198|`ced862a30a9d91dbab59befcf6ea0e4af9dabfc289acffbe7678a6dd33b2bed9`|
| `worker.js.map` |13055|`883f857ebdafa92063880bff097c0b648736a5c46f84d71f8f7edd66c0ee6dc8`|
| `wasm_exec.js` |16992|`0c949f4996f9a89698e4b5c586de32249c3b69b7baadb64d220073cc04acba14`|
| `version.json` |169|`8dae8e5b4addb054083ea188779e6104b5e79ca5846c0e1c4ca7b58bb9709bea`|
| `frontline_pb.ts` |55786|`db86802c777fd6d2660a7956adce34c7b20a788dd72e6926365cdc46dc88199f`|

Native executable build information records VCSf31c76d…+dirty instead of the
prior c7 runtime's4c235862…+dirty. Non-test source, modules and build flags are
exact reviewed inputs, but executable byte identity to old c7 is **not claimed**.
Worker executable text differs only in two esbuild input-path comments; source
maps differ only in source paths. `wasm_exec.js`, metadata and TS binding are
byte-identical to their prior c7 artifacts. The prior binaries remain unchanged.

## Earned comparisons

- 22 focused sim tests passed both natively and in actual Go js/WASM, exporting
  **73 exact byte-identical files** covering six service layouts/saves, combat
  privacy, owner casualty/ranges and tactical projection. No required selector
  skipped. These bounded prepared fixtures are separate from ordinary campaign
  completion evidence.
- Native adapter4, native host3 and WASM adapter4 selected tests passed. **40
  codec records per target** agree: eight combat, two casualty,30owner ranges.
  Six service adapter records agree across native and WASM.
- **29 actual valid saves/58 player views** match the old JSON conversion oracle
  with detached values and deterministic wire equality.
- `production-wasm-parity.mjs` instantiates the **actual produced frontline.wasm**,
  loads all six fresh native approach saves, advances through ordinary Return/
  service, and compares final tick, state hash, protobuf bytes and saved-state
  bytes against native. All six match; actual Go exit is confirmed.

The last course executes the exported Go API in Node, not browser input or
worker lifecycle. No new host multiplayer game, browser, cold-offline product,
art packaging or hardware performance qualification is claimed here.

## Preserved orchestration failures

`20260929T081201Z` built all three binaries but stopped at the metadata command
`go version -m frontline.wasm`: Go reports unrecognized file format. The
successor restricts that inspection to supported native executables and records
WASM identity through build/hash/version/session evidence.

`20260929T081559Z` passed fixtures, codecs, oracle and all six actual production
WASM comparisons, then its Node process failed after Go exit when a scheduled
runtime timer tried to resume the exited VM. Its aggregate remains **failed**,
despite the nested scene report passing. The successor synchronously records the
report after confirmed Go exit and ends Node, matching the pinned Go Node
runner's process lifetime. No product source, timer, simulation or browser worker
was changed to obtain this result.

`runtime-evidence.tar.gz` preserves171 exact compact files from all three
attempts: receipts, logs, captured inputs, native public fixtures and all parity
records. Its archive ledger verifies every entry on reopen. Large saves and
executables remain local in their original output directories; their digests are
in the retained receipts. Source/runtime promotion does not erase either failure.
