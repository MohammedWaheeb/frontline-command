# Historical native snapshot conversion profile

Measured2026-09-28 UTC on AppleM4,16GiB, Go1.27.1 darwin/arm64, GOMAXPROCS2.
This is a shared-desktop native diagnosis. Other browser/Blender work may occur;
it is not quiet-host timing, current0.3.4 evidence, browser FPS or reference-device
certification. No production code, save version or fixture content was changed.

The frozen0.3.1 source came from `work/evidence/aircraft-rebase/source`. The
688-actor opening and command stream came unchanged from
`work/evidence/terrain-height/load`. The existing adapter benchmark restored it,
ran600 ordinary ticks with150 player1 views, and matched the original final hash
`34473b9e07c2f822d77be9f2448f938fe994f26bce09a0b078401837a77c667c`.
A new **test-only** benchmark decomposes the exact final authorized view into
stages. It also checks that repeated view/conversion calls leave the hash intact.

## Exact boundaries

- Profile source lock: `c59c5142154b29de53ab57898641781234e645c3ccd32545df0ea8f140eae225`.
- Executable: `e439cc876003a88813bf7104fd549c7fb996968c4269fc2314c9d351787acaf7`.
- Opening: `68f3b795490f7fe2771b25c6e467380566c34a3e15f74a622f07ae98e7fb0f12`.
- Original143 copied source files are unchanged. Only
  `cmd/wasm/snapshot_profile_test.go` was added; all source hashes match after runs.
- Raw commands, profiles, source/binary hashes and benchmark logs are in
  `work/snapshot-conversion-profile/legacy-031`. Native final view has257 visible
  entities; JSON437,521 bytes versus binary protobuf68,812 bytes.

## Measured stage costs

| Operation | Native milliseconds/op | Bytes/op | Allocations/op |
| --- | ---: | ---: | ---: |
| PlayerView | 0.051 | 164,560 | 286 |
| JSONMarshal | 1.056 | 445,179 | 3 |
| ProtoJSONUnmarshal | 6.972 | 1,769,775 | 73,594 |
| SnapshotJSONRoundtrip | 8.925 | 2,430,724 | 73,601 |
| ProtobufMarshal | 0.215 | 73,728 | 1 |
| SessionView | 8.703 | 2,722,620 | 73,889 |

Independent subbenchmarks have normal sampling/GC variability; their measurements are
not expected to sum exactly. The full600-tick adapter iteration took4.519s and
allocated638,247,584 bytes in11,052,246 allocations. These per-iteration numbers
include150 complete views plus simulation and command handling; they are not
per-tick or browser numbers.

The full-iteration CPU profile sampled4.27s:75.18% was under Engine.Advance and
16.63% under the JSON snapshot converter. Within simulation, movement was44.73%
and fog update19.44% cumulative; overlapping cumulative percentages must not be
added. The converter is significant, but this profile does not establish it as
the only bottleneck.

The sampled allocation-object profile attributes94.11% to protojson.Unmarshal,
primarily repeated-list reflection (`reflect.Value.extendSlice`:80.16% flat).
Snapshot conversion accounts for57.95% of sampled allocated bytes; Session.View
including the view and binary packet accounts for62.66%. Allocation sampling is
approximate, so sampled object totals differ from exact benchmark counters.
CPU/allocation profiles include untimed restore/setup, while the benchmark's
reported allocation/time counters exclude the setup. The stage CPU profile also
contains its one real600-tick setup; use the named stage benchmark counters when
comparing individual conversions.

## Recommendation and limits

The proposed explicit shared Go View→protobuf mapping is supported by this
profile: it can avoid JSON materialization, parsing and per-element reflection.
It must preserve field names/semantics, optional zero presence, integer precision,
invalid-UTF8 behavior, perspective redaction and complete nested detachment.
Measure the candidate separately on actual current0.3.4 saves/native/WASM and
compare exact wire output before considering promotion. No optimization was made
in this profiling lane; shipping remains untouched.

Reproduction uses `profile.test` with the exact commands preserved in
`adapter-run.json` and `stages-run.json`. The environment variable
`FRONTLINE_BROWSER_LOAD_DIR` points to this directory's immutable `fixture/`,
with GOMAXPROCS2. The binary validates the native expected hash itself.

## Compact checkpoint reproduction

The checkpoint intentionally excludes the built `profile.test` executable and
full copied source tree. `legacy-source-reference.json` records the exact base
git revision and input file inventory; `legacy-source.patch` reconstructs the
historical source differences. Apply it only to a separate checkout/copy of that
base, then verify every original input hash in `input-lock.json`. Add the preserved
new `source/cmd/wasm/snapshot_profile_test.go` and verify `profile-source-lock.json`
before building. No legacy source patch is proposed for shipping.

`fixture/opening.json.gz` decompresses to the exact original opening hash; it is
compressed only for storage, not migrated. `fixture/native.json` retains the
original expected hash and public command stream. Runtime output, independent
profile data and receipts are checkpointed separately from renderer changes.
