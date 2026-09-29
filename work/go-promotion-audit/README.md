# Read-only Go 0.3.4 promotion recipe

> Historical proposal, superseded2026-09-29: the isolated3d49 integration
> earned437 native-short passes, vet, bounded race,102main+21optional,13authored
> skirmishes and fresh native/WASM/host parity. Root then reviewed and authorized
> exact83-path source plus seven-artifact promotion. Live source/runtime now
> report0.3.4. See [completed promotion and exact rollback archive](../runtime-034-integrated-source/PROMOTION.md)
> and [runtime receipts](../runtime-034-integrated-source/RUNTIME.md). Product/art
> packaging and the remaining full-product gates below remain separate. The
> original read-only inventory and its then-open gates are preserved below.

Audit date: 2026-09-29. **No promotion, build, browser launch or Go test was run
for this audit.** Shipping source and `client/public/runtime/version.json` both
still report simulation **0.3.3**. Parent retains the browser lane and the
immutable integration-v19 product; this document does not authorize replacing it.

## Exact proposed inputs

The proposed Go source is `work/navigation-lookup-candidate/source`, all **356
locked files reverified** against source-lock SHA-256
`c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122`.
It already contains the reviewed parking/boarding, tactical/combat disclosure,
owner-casualty, owner-ranges, direct protobuf conversion and collision-lookup
successors. Do not reconstruct this union by layering old patches again.

`selective-files.json` records exact live and proposed hashes at audit HEAD
`69fabaf` for every changed file. There are **34 source, three generated and
32 test files** to integrate, **69 total**. The other 12 differing files are old
`pkg/native-scenes/*` JSON/save artifacts and **must not be promoted**: they carry
an earlier experimental parking version and are preserved evidence only. The
275 identical locked files need no copy. No tracked Go/protocol file absent from
the candidate was found; this is not permission to delete newly created or
untracked work. In particular the live authored test files have working-tree
changes; preserve their exact bytes until the test-only merge below is reviewed.

No catalog/map/mission/go.mod/go.sum/storage/server.go change is part of this
promotion. All unchanged files retain their current source. No new database
migration is proposed. The candidate already sets simulation0.3.4, protocol1,
adapter1 and content hash
`318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`.
Parking reservations and combat event metadata deliberately change serialized
state: old0.3.3 saves/replays are rejected, never relabeled or implicitly migrated.
Optional wire fields remain additive, but that does not make old simulation
state compatible. Client and host must be rebuilt together.

### Runtime bytes already earned in isolation

Every output in `../navigation-lookup-candidate/runtime-build-receipt.json` was
rehash-verified during this audit. Key SHA-256 values:

| Artifact | SHA-256 |
|---|---|
| Go WASM | `f37220a4375f2ef1595e278673c811f1426807f41c6a4ad5925ddbcd66d2bd65` |
| Native host | `1c8c2bc468e2a76baf40a1fa878d56873a9e38ed02020a09b1b1b3678acb1379` |
| Native adapter | `7a03f5be61c70a1d03706b1c121f1c503382e66efe2e58e19321b29a7d5400e9` |
| Generated TypeScript protocol | `db86802c777fd6d2660a7956adce34c7b20a788dd72e6926365cdc46dc88199f` |

Current `worker.ts`, `errors.ts` and `types.ts` still equal the captured worker
inputs byte-for-byte. The final build additionally regenerates the service
worker and product pack; those packaging files were not certified by merely
verifying the isolated runtime receipt. Do not copy an old pack manifest after
changing any runtime byte.

## Checks already earned, with their actual source boundaries

| Gate | Existing evidence and limits |
|---|---|
| Combined parking/tactical/combat backend | Original combined lock `ed509668…`: full `go test ./... -short`, vet, focused simulation race440.669s; host/adapter codec race and strategic advice race. Logs in `../runtime-034-candidate/`. Native/WASM equality: six service records,15 combat artifacts,11 tactical artifacts and eight codec digests (`native-wasm-parity.json`). |
| Service geometry and interaction | Reviewed `db8f70…` candidate: ground/build exclusion, pruning, bounded allocation, capture/service loss, boarding/unload, full save/replay, authored air-heavy starts and native/WASM. Quiet ABBA retains688 actors/64returns/24interceptions and meets25/40ms tails. Original dense packed-hub layout still fails because legal apron space is absent; this tradeoff was not waived (`../service-parking-candidate/README.md`). |
| Native actual-Go artwork | Six actual layouts,325 checks and root inspection are recorded in `../art/go-parking-final-native/`, with fresh0.3.4 geometry amendment. This is composition evidence, not complete aircraft artwork or final product acceptance. Later billboard and six-scene renderer proofs are recorded in the implementation ledger. |
| Owner casualty privacy | `41c59c…`: own event-time loss after fog closes; allied/enemy denial, ownership transfer/passengers, state/save invariance,18 native/WASM artifacts, host codec and21.753s race. Three-engine browser course passes. |
| Owner range projection | `d5dd52…`: eight×1000tick canonical courses unchanged,41 native/WASM artifacts and30 codec records, full short/vet; **focused-race-bounded.log** passes49.273s. The similarly named `focused-race.log` was interrupted and is not a pass. Foreign privacy and optional presence are tested. |
| Direct snapshot codec | `199e088…`:201 reflection-populated oracle cases,31 actual saves/62views, native/WASM/host parity for ranges/casualty/combat, detached values/UTF-8/optional zeros, focused race3.698/5.825/5.986s and vet. Source generator is build-time only. |
| Final collision lookup | Exact c7e0: all75 units+specials,32state combinations,9600clearance queries versus old implementation, no state changes; three-package short PASS102.078/1.798/14.014s, lookup race5.400s and vet. This log is not an all-package race run. |
| Maximum native/WASM/render workload | Exact c7e0: quiet headed Metal two×600ticks meet20TPS budget with same hash; old converter baseline failure retained. `../combined-load-current/` then passes actual688/64returns/24intercepts/72batches,150owner boundaries, full/indexed replay, midpoint restore and same-page teardown twice. Final hash `71bf256a…beb8c1`. The latter browser timings are shared-host, incomplete-art evidence, not final quiet/reference-hardware approval. |
| Consolidated main/optional | `../runtime-034-consolidated-acceptance/`:102/102+21/21, zero failed/unrun,23,370accepted ordinary winning orders, all seven targeted optional IDs complete on all difficulties. **This commander retains original ed509668 production bytes, not c7e0.** Its hash/parity gates are within that source. |
| Authored skirmish balance/lifecycle |13/13 ordinary authored-map bot games pass on shipping0.3.3, with all ten rejected receipts individually classified. No complete13-case0.3.4 parking matrix is recorded in `docs/authored-skirmish-acceptance.md`; it must not be relabeled. Neither matrix certifies human balance. |

The owner/view/codec/lookup changes have focused equivalence proofs. Those are
useful evidence for integration review, but this audit does not silently turn
the original combined commander run into a final c7e0 campaign run.

### Actual 1–4 human evidence

See `../../docs/multiplayer-combat-acceptance.md` and
`../../docs/multiplayer-rematch-acceptance.md` for exact host/client/art boundaries.
The separate rendered lifecycle matrix uses labeled surrender and is not combat
victory evidence.

- 1H+1normalAI and2H+2normalAI have genuine ordinary victories and exact native
 replay on the earlier combined0.3.4 build; final integrated repetitions remain.
- 1H+3AI had a real atlas-lifetime failure. Its earned replay and repaired camera
 course pass; a fresh strict live FFA remains open.
- 3H ordinary combat/replay succeeded, but the complete course failed in recovery/
 archive. A separate copied-host recovery course passes; a fresh full live course
 remains open.
- 2H has two consecutive ordinary victories on the same pages/Applications with
 c7e0, exact replay/archive/rematch/reconnect and disposal checks. Each lasts
 about9m36s; this does not satisfy the explicit20-active-minute-per-game long
 qualification. The later Dry River expansion attempt preserves one valid long
 first game (tick44034, about36m37s active) and an aborted failed-policy second
 game, not a two-long-match pass. The corrected native-only policy win at
 tick37046 is also separate from rendered rematch qualification. See
 `docs/multiplayer-expansion-acceptance.md` and
 `docs/multiplayer-expansion-recovery.md`.
- 4H has an exact c7e0 strict zero-error quiet pass at tick12745, committed ordinary
 team2 victory and native replay/midpoint equality. Earlier shared-host
 advice_timeout503 failures remain failures and their pressure cause remains
 unresolved; a quiet pass does not establish that they were harmless.

These independent-context loopback tests are not physical LAN or cross-browser
long-match qualification. The final v19 UI/art freeze is separate from older
client/art receipts. Do not rerun these while root owns the browser lane.

## Proposed selective integration and build sequence — not executed

1. Obtain root's source/runtime promotion boundary and a quiet build ownership
   window. Reverify every c7e0 locked byte and the current live hashes from
   `selective-files.json`; stop on any new difference and resolve it explicitly.
   Use an isolated integration checkout first. Copy only the69 listed candidate
   source/generated/test paths; never directory-sync/delete or copy old
   `pkg/native-scenes`, experimental runtime outputs, account data or assets.
2. Independently merge the passing commander from
   `../runtime-034-observer-reboard/source`: the three changed authored tests
   and eleven new tests enumerated in its `production-unchanged-audit.json`.
   They are test-only additions, not part of the c7e0 source lock. Preserve live
   test edits, old failures, and the explicit SY03 test-bound history. Verify
   that **no non-test file** differs from the selected c7e0 production/content
   set, then make a new integration lock. Do not alter either original lock.
3. With pinned Go1.27.1, protoc7.36.2, protoc-gen-go1.36.12 and
   protoc-gen-es2.15.0, regenerate Go/TS protobuf and the explicit converter.
   The existing `runtime:build` generates **only TS protocol**, so it cannot
   replace the Go generation step. From the isolated checkout, planned commands:

   ```sh
   protoc -I protocol --go_out=protocol --go_opt=paths=source_relative protocol/frontline.proto
   npm --prefix client run gen:proto
   go generate ./internal/viewproto
   ```

   Compare all three generated outputs with their candidate hashes. From
   `internal/viewproto`, `go run ./gen -check` must report no generation drift.
   Do not hand-merge generated code. Identical pinned output is expected;
   investigate a difference before compiling consumers.
4. Coordinate one final integration verification window. Run the all-package
   native short suite and vet once, plus bounded named race/adapter/codec/privacy
   gates covering the changed areas (reuse explicit recorded selectors, avoid
   a broad expression that accidentally selects all long campaigns). Recheck
   valid-checksum0.3.3 save rejection, unchanged content/protocol metadata,
   malformed reservations/combat data, detached authorized views, fog-safe
   advice and own-only fields. Do not claim old full-race history as new coverage.
5. For a fully current mission acceptance claim, run the consolidated102+21
   serial commander against the newly locked c7e0 integration; preserve old
   passes and all new failures separately. Run the13 authored default-resource
   skirmishes for the parking boundary and classify receipts. Neither was run
   in this read-only task. Root should explicitly schedule these correctness
   gates; do not compete with the browser/Blender timing lane.
6. Build native adapter, host and Go WASM from that same checkout. Planned
   commands after source approval:

   ```sh
   npm --prefix client run runtime:build
   go build -trimpath -o bin/frontline ./cmd/frontline
   npm --prefix client run typecheck
   npm --prefix client run typecheck:app
   npm --prefix client run test:runtime
   npm --prefix client run build
   ```

   `runtime:build` emits `client/public/runtime/{frontline.wasm,wasm_exec.js,
   version.json,worker.js,worker.js.map}`, `bin/runtime-native` and
   `client/public/service-worker.{js,js.map}`. It does **not** build the host;
   the explicit host command above is required. Build runs in the new integration
   directory, not over root's immutable v19 product. Compare runtime-native
   version output and served version.json; lock every artifact/client/protocol/
   pack hash. Changes in compiler/VCS build metadata may change native binary
   hashes; record provenance and test semantics instead of relabeling them as
   the old binary. Rebuild the exact-byte base pack with the frozen art snapshot.
7. Re-run actual native/WASM/host codec/service/tactical/owner gates against the
   final binaries, then the coordinated supported-browser product checks and
   cold-offline install/load/save/replay. Verify protocol1+simulation0.3.4 on both
   ends, old-save readable rejection, new-save exact continuation, current pack
   hashes, owner/observer privacy and no stale0.3.3 worker. A successful build
   alone does not authorize promotion or constitute a release certificate.
8. Only after root accepts the source and integration evidence, selectively
   checkpoint the reviewed files and publish the matching local runtime/product
   together. Packaging through `make build`/`scripts/local.mjs build` writes
   runtime/dist and checks release content; do not run it earlier just to obtain
   an intermediate build. No deployment is part of this recipe.

## Open boundaries and release gates

- **Immediate Go integration gap:** approved selective source/test merge,
  regeneration, fresh integrated native/WASM/host checks and a new artifact lock
  have not occurred. Exact c7e0 full123 and13-skirmish coverage is not earned by
  the source-specific older reports. The code review has no newly identified
  blocker from this inventory; root still decides promotion.
- **Exterior policy:** larger physical landing aprons are intentional and the
  impossible dense fixture remains preserved. Actual player-facing blocked
  landing and producer-service status, cancellation/recovery and retained
  aircraft behavior must be verified in the final product. Generic source
  strings alone are not product proof. Root's new v19 actual-Go status course
  is being run separately; this audit does not preclaim its result.
- **Final client/package:** all six live human/bot cases on one integrated freeze,
  two qualifying long same-page matches, physical LAN, final supported desktop
  Chrome/Edge/Firefox/Safari, context-loss/focus/low-memory/reconnect recovery,
  cold offline and final assets/audio remain their own gates. Root's v19
  Chromium clarity8/8 pass and ongoing other engines are bounded UI evidence.
- **Performance:** the quiet M4 collision pair is earned; complete-art combined
  load, required Intel configurations and actual Safari hardware are unearned.
  Do not claim universal performance or erase earlier overload/timeouts.
- **Design/art:** the miss/blocked-shot wording audit intentionally adds no
  projectile collision mechanic. Unknown outcomes stay unknown. Complete art,
  authored presentation review and human balance are still release work; they
  must not be represented as solved by a Go source copy.

## Exact changed path inventory

Each row's old/new SHA-256 and add/replace action is in `selective-files.json`.
All paths are repository-relative and selected individually.

### Source — 34

- `cmd/wasm/editor.go`
- `cmd/wasm/session.go`
- `internal/server/advice.go`
- `internal/server/codec.go`
- `internal/viewproto/gen/main.go`
- `internal/viewproto/snapshot.go`
- `pkg/sim/abilities.go`
- `pkg/sim/ai_knowledge.go`
- `pkg/sim/aircraft.go`
- `pkg/sim/aircraft_rebase.go`
- `pkg/sim/combat.go`
- `pkg/sim/combat_feedback.go`
- `pkg/sim/economy.go`
- `pkg/sim/engine.go`
- `pkg/sim/mission.go`
- `pkg/sim/navigation.go`
- `pkg/sim/navigation_bridge.go`
- `pkg/sim/navigation_mobile.go`
- `pkg/sim/operation_views.go`
- `pkg/sim/orders.go`
- `pkg/sim/owner_ranges.go`
- `pkg/sim/preview.go`
- `pkg/sim/service_geometry.go`
- `pkg/sim/service_interactions.go`
- `pkg/sim/service_loss.go`
- `pkg/sim/service_navigation.go`
- `pkg/sim/service_parking.go`
- `pkg/sim/state.go`
- `pkg/sim/strategic_preview.go`
- `pkg/sim/support.go`
- `pkg/sim/validate.go`
- `pkg/sim/visibility.go`
- `pkg/sim/visible_effects.go`
- `protocol/frontline.proto`

### Generated — 3

- `client/src/protocol/frontline_pb.ts`
- `internal/viewproto/snapshot_generated.go`
- `protocol/frontline.pb.go`

### Regression tests — 32

- `cmd/wasm/combat_feedback_codec_test.go`
- `cmd/wasm/editor_test.go`
- `cmd/wasm/owner_casualty_codec_test.go`
- `cmd/wasm/owner_ranges_codec_test.go`
- `cmd/wasm/service_parking_candidate_test.go`
- `cmd/wasm/tactical_wire_test.go`
- `internal/server/advice_test.go`
- `internal/server/combat_feedback_codec_test.go`
- `internal/server/owner_casualty_codec_test.go`
- `internal/server/owner_ranges_codec_test.go`
- `internal/server/tactical_wire_test.go`
- `internal/viewproto/snapshot_test.go`
- `pkg/sim/air_orders_test.go`
- `pkg/sim/capture_test.go`
- `pkg/sim/combat_feedback_test.go`
- `pkg/sim/combat_rules_projection_test.go`
- `pkg/sim/navigation_lookup_reference_test.go`
- `pkg/sim/navigation_lookup_test.go`
- `pkg/sim/owner_casualty_test.go`
- `pkg/sim/owner_ranges_canonical_test.go`
- `pkg/sim/owner_ranges_test.go`
- `pkg/sim/service_boarding_test.go`
- `pkg/sim/service_parking_boundary_test.go`
- `pkg/sim/service_parking_candidate_test.go`
- `pkg/sim/service_parking_combined_test.go`
- `pkg/sim/service_parking_invariants_test.go`
- `pkg/sim/service_parking_maximum_test.go`
- `pkg/sim/service_parking_mission_test.go`
- `pkg/sim/sim_test.go`
- `pkg/sim/strategic_preview_test.go`
- `pkg/sim/tactical_canonical_test.go`
- `pkg/sim/tactical_view_test.go`

