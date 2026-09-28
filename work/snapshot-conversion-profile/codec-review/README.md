# Independent read-only snapshot mapper review

Reviewed2026-09-28: `work/snapshot-codec-candidate/source/internal/viewproto/`
(`snapshot.go`, `snapshot_generated.go`, `snapshot_test.go`, `gen/main.go`),
plus the two `snapshot` wrappers in `cmd/wasm/session.go` and
`internal/server/codec.go`. Exact reviewed hashes and invocation logs are in
`receipt.json`; all six reviewed files were unchanged afterward. No candidate
source, generated output, runtime, shipping file or save was modified.

No current semantic or privacy blocker found.

- All35 generated mappers consume only the already-authorized `sim.View` graph.
  They do not read Engine, State or hidden entities, or recompute authorization.
- Current JSON tags and protobuf fields are paired by name, with build-time
  rejection of missing/unmapped public fields. `go run ./gen -check` passed;
  this mode compares in memory and does not write generated source.
- Nested messages, arrays and optional scalar pointers are newly allocated.
  Strings may share their immutable Go backing safely. Nil private data, optional
  ranges/interception and optional warning splash remain absent. Explicit
  zero/false projectile metadata, emergency deadlines and nonnil zero deadlines
  retain the old wire-presence behavior.
- Current numeric conversions are same-width named scalar types; no float64
  intermediate or JSON numeric rounding is introduced. Large64-bit integers and
  signed/unsigned extrema are included in the existing oracle coverage.
- Every string passes the shared UTF-8 helper. Valid strings are unchanged;
  invalid decoding units become U+FFFD, matching encoding/json before protojson.
  No extra case-folding, normalization or textual sanitization is introduced.
- Adapter wrappers call the same shared mapper, preserving online/offline output.
  Orders decoding is unchanged. No runtime reflection is used for snapshots.
- Nil versus empty repeated-field Go slices may differ internally, but protobuf
  equality and deterministic binary output treat both as empty; the reviewed
  consumers use protobuf messages/wire output. This is not a new wire disclosure.

Independent commands passed: `TestSnapshotMatchesPriorJSONContract` (201 generated
views, old JSON oracle, deterministic bytes and nested detachment),
`TestOptionalZeroPresenceAndAbsentPrivate`, and generator read-only `-check`.
The exact command log is in `oracle.log`/`generated-check.log`. These are existing
focused tests independently rerun, not new actual-scene or browser evidence.
Root separately owns actual current-save/native/WASM/performance gates; those
were not duplicated or claimed as this review's execution.
