# Isolated c7e0 and passing-commander integration

2026-09-29. Internal integration only; **shipping stays0.3.3**. No shared
runtime, product, asset, prior source lock or v19 input was changed. No host,
browser, WASM artifact build, full mission matrix or skirmish matrix was launched
by this preparation. Root owns those later scheduling/promotion decisions.

## Frozen source and merge decisions

The new355-file `source-lock.json` has SHA-256
`3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750`.
`prepare.py` verifies both complete input locks and the prior selective live-file
inventory before making a new source directory; it refuses to overwrite it.

- Production source: c7e0 lock
  `c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122`.
  Start from current live files and integrate only the reviewed69 source/test/
  generated paths. All12 historical `pkg/native-scenes` artifacts are omitted.
  The remaining344 candidate files are initially byte-identical to c7e0.
- Passing commander: lock
  `757b31785a0c0b869cca06ad01299ef199fd124989e722dce559c2919dddab8d`.
  Apply three changed and eleven new `_test.go` files. The three live authored
  tests equal the c7e0/original combined ancestor byte-for-byte, including their
  existing uncommitted edits. Thus no divergent merge/conflict resolution is
  needed. Original live bytes are preserved in `inputs/live-authored-tests/`;
  the exact accepted delta is `commander-only.diff`.
- Every non-test source, schema, generated binding, content, catalog and module
  byte is exact c7e0. No mission, objective, resources, rules or runtime limit
  changed. The explicit prior SY03 test-only wait-bound adjustment stays in the
  proven commander and does not change an authored deadline.
- Simulation0.3.4 is already the reviewed compatibility boundary. Protocol1,
  adapter1 and content hash remain unchanged. Old0.3.3 saved state is not relabeled.

`integration-receipt.json` records all copy/override/exclusion decisions and
the parent HEAD. Input source locks and the selective inventory are copied under
`inputs/`. The existing c7e0 and successful original-combined matrix are preserved.
This source has not yet earned its own123-case result merely by including the
previously passing commander.

## Generation and bounded checks

`checks.py` uses GOMAXPROCS=1 and Go package/compiler parallelism1, with one
subprocess at a time. Every stage verifies this source plus both original input
trees and the shipping inventory. It removes inherited FRONTLINE test selectors
and artifact-output variables so environment leftovers cannot launch long work.
Root's functional browser and Blender may run concurrently: elapsed times are
shared-host correctness receipts, never performance qualification.

Pinned toolchain checks and regeneration pass without any byte drift:

- Go1.27.1 darwin/arm64;
- `protoc --version` reports **libprotoc36.2** (generated Go header calls it
  protocv7.36.2); protoc-gen-go1.36.12 and protoc-gen-es2.15.0;
- Go protobuf, TypeScript protobuf and the explicit35-mapper view converter;
- the generator's `-check` no-drift gate.

The completed checks at `checks/20260929T071757Z/receipt.json` all pass;
`completed-checks.json` independently audits log hashes, exact selected names
and skips:

| Stage | Exact result |
|---|---|
| All-package native short |437 top-level tests pass;56 explicit skips; command71.539s |
| All-package vet | PASS; command1.571s |
| Bounded simulation race |44/44 selected top-level tests pass, zero skips; command155.154s |
| Bounded adapter/host/converter race |11 matching package/test pairs pass, zero skips; command11.906s |

All355 integrated bytes, both prior frozen source trees and the shipping
selective-file inventory remain exact after the final process exits. These
command durations include tool overhead and the stated concurrent work.
`race-selection.json` lists44 exact simulation test names plus9 adapter/host/
converter selectors. They cover service reservations, Return boundaries,
ground/build exclusion, boarding, actual authored aircraft starts, combat
metadata privacy, owner casualty/ranges, navigation equivalence, tactical
projection, strategic advice, optional protocol presence and authenticated
advice. Anchored names exclude complete campaigns, optional routes, skirmishes
and dense/maximum timing courses. Race testing these unit fixtures does not
establish multi-human product acceptance.

Actual-save codec tests that need supplied exported fixtures are intentionally
not counted as exercised by the default short suite. The next artifact stage
must provide exact current fixtures and compare native/WASM/host results; the
historical candidate parity receipts remain separately valid at their recorded
source boundaries. Skips are preserved in the JSON test logs.

## Prepared next gates — coordinate before running

`run-mission-matrix.py` is the audited serial runner adapted only to this source
lock and integration receipt. Its default planning invocation validates355
source bytes and writes `authored-matrix-plan.json` without compiling or running
Go. It enumerates exactly102 main and21 optional leaves. After root releases a
sustained correctness slot, planned separate phases are:

```sh
python3 work/runtime-034-integrated-source/run-mission-matrix.py --run main --execute-after-release
python3 work/runtime-034-integrated-source/run-mission-matrix.py --run optional --execute-after-release
```

Each compiles one isolated test binary, runs one leaf at a time under
GOMAXPROCS=1, records exact source/binary/artifact hashes and stops on resource
failure. Subsets must remain labeled subsets. Record actual concurrent host
conditions at launch. All old failed attempts and the original102+21 pass remain
unchanged; a fresh completed audit is needed for an integrated-source claim.

The unchanged `TestAuthoredSkirmishAcceptance` already defines13 serial real
matches: six faction pairs, four mirrors,3FFA,4FFA and2v2 on the original authored
launch maps, default resources and exact seeds28001–28013. A separately frozen
binary/output directory should run this opt-in test after coordination, using
`FRONTLINE_AUTHORED_AI=1`, a new absolute `FRONTLINE_AUTHORED_AI_EVIDENCE` directory,
GOMAXPROCS=1 and anchored `^TestAuthoredSkirmishAcceptance$`. Do not use `-short`
for that deliberate run. Its90-simulation-minute safety bound is unchanged.
Require actual ordinary elimination, income/spending, initial/final restore and
full replay equality; inspect every rejection rather than declaring all receipts
clean from a test-process exit. Preserve timeouts and exact state/trace artifacts.

Root must release an artifact-build window before rebuilding native host,
adapter and Go WASM together into a new isolated runtime directory. Reuse the
reviewed pinned build procedure, verify the new source lock before/after, and
regenerate the exact-byte pack with the selected product freeze. This preparation
does not overwrite `client/public/runtime`, `client/dist` or integration-v19.

Remaining full-product gates and their exact historical scope are in
`../go-promotion-audit/README.md`: fresh failed-configuration multiplayer repeats,
two qualifying long same-page matches, final browser/package/offline acceptance,
complete-art performance and reference hardware. Source integration is neither
a release certificate nor deployment permission.
