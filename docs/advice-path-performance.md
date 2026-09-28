# Advice-path diagnostic on preserved three-player saves

Status: isolated **test-only** profile, 2026-09-28. No production code, gameplay,
privacy policy, timeout, protocol or simulation version changed. These shared-host
measurements identify local work; they do not reproduce the live four-player
`advice_timeout` 503 or establish reference performance.

## Exact source and inputs

The successor `work/advice-path-profile/source` copies all 356 files from the
frozen navigation-lookup candidate without alteration. Parent source-lock SHA-256:
`c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122`.
Only `pkg/sim/advice_path_profile_test.go` is added. The successful source lock is
`f0c85a602aa1670d440f59202726b603c8e39c17234837c3d972e2ce69b97c26`;
compiled executable SHA-256
`68aabd349d8ed4ff961f354b39b36a92ae9ed881d66ce7c1c2678a19500b7776`.

Inputs are the actual earned three-human match in
`work/multiplayer-combat/2026-09-28T14-32-48.454Z/3h-native-audit`, never relabeled:

| Save | Tick / actors | State hash | Exact file SHA-256 |
| --- | --- | --- | --- |
| midpoint | 8037 / 55 |`e22506ac7cdc794943a05157f061448a31ad0ad69c771cff5c1f40cd95f1c655`|`5d70158099b59c91b2bad7a8d37b70ce3d816d3baa4a21bce8dd777955637ad0`|
| final | 16074 / 43 |`87e577699a4f0c97ad88b9d450f3731e917650eda8beff732bf297513eeac9f7`|`e7bc29b0ebb23fe622a5490b5186a2a00ccb4e38e31ab8ae6a4a64a512f5b396`|

Both use the original 160×160 Industrial Valley map and proposed simulation 0.3.4.
The midpoint's three humans remain active; player 1 owns only HQ and power. The
final match has ended, and two players are defeated. No actors, funds, flags or
outcome were changed to manufacture active final-state commands.

## Checks and preserved setup failure

`runs/20260928T154802Z` preserves the first diagnostic failure. Its assumption
that every active player has a mobile actor produced an empty player 1 context
batch and a correct `command_limit` error. No benchmark ran from that setup.
The successor uses a normal own-building rally when there is no mobile actor.
This changes only test input selection; the original source/test binary remains.

`runs/20260928T154906Z` passes:

- Exact original state hashes; all source save bytes and three authorized views
  unchanged after advice requests; no simulation ticks advanced.
- Full-save versus compact-advice sequential and contextual outputs match.
- Four **actual recorded** movement/training batches remain valid at the exact
  midpoint (players 2/3, original command ticks 8044/8092/8184/7792).
- Current own affordances for 2/23/18 actors; foreign selections are denied.
- One and 32 normal independent context probes are valid for each active player.
  The 32 case repeats a no-spending own move/rally, explicitly not 32 historical
  player actions. Detached stop/rally checks operate only on their private clone.
- Terminal final-state probes retain their real errors. Defeated players with no
  actors produce empty-context errors; those rows are not valid 32-order workloads
  or real host clone requests (the host rejects their affordances first).

Both original production and copied input hashes are rechecked around execution.
The test's full output and exact commands are retained in the run receipts.

## Measurements

Go 1.27.1, Darwin arm64, Apple M4, GOMAXPROCS=2. The four-player browser, host and
native replay audit had closed; other isolated menu/build/art work could continue.
The following are single-iteration diagnostic observations, **not** p95 values,
quiet comparisons or evidence that the HTTP deadline is sufficient under load.

| Work on midpoint | Time | Bytes allocated |
| --- | ---: | ---: |
| SaveForAdvice capture |22.08 ms|11,298,488|
| Restore full save |78.53 ms|14,429,056|
| Restore compact advice |69.98 ms|14,347,376|
| Map.Validate |2.38 ms|910,936|
| validateState |0.154 ms|2,992|
| recompute existing visibility |0.104 ms|0|
| own affordances |0.139–0.276 ms|30,360–119,528|
| actual valid recorded batches, including Restore |45.39–52.67 ms|14,349,232–14,379,592|
| one normal independent candidate |48.15–61.63 ms|14,353,040–14,363,536|
| 32 normal independent candidates |57.82–77.14 ms|14,507,144–14,848,248|
| detached own stop/rally, excluding Restore |0.112–0.284 ms|5,936–21,728|

Advice bytes are 1,445,867 at midpoint and 1,387,707 at final, compared with original
full save 1,474,244/1,445,382. SaveForAdvice already strips command/event/pending/
result/telemetry history, so it does not grow with the command-log window. Most
retained data here is the map and players' explored state.

A separate bounded CPU/allocation sample ran compact midpoint Restore 48 times:
58.57 ms/op,14,346,209 B/op and 920 allocations/op. The 3.72 s profile includes benchmark
setup, so its percentages describe that capture rather than an exclusive line
latency decomposition. `Restore` accounts for 80.61% cumulative CPU samples and
JSON `Decoder.Decode` 72.45%. Sampled allocated bytes are dominated by JSON decoder
buffers 57.11%, slice growth 20.89%, raw JSON copies 9.64%; map validation contributes
7.48%. Map flood and visibility are not the dominant cost in this sample.

## Bounded conclusion

There is **one Restore per request**, not per candidate order. The old combined
0.3.4 and navigation successor have byte-identical advice capture, preview,
affordance, Restore/map/state validation, handler and match-actor files. Their
server snapshot conversion differs: the older active host uses JSON→protojson,
while the successor has the separately verified direct mapper. That affects
ambient actor scheduling/allocation and prevents attributing a live timeout to
these isolated numbers alone.

The two-second context covers actor queue waiting, affordances/capture, detached
work and concurrent GC/scheduling. These measured stages are below that deadline;
the past 503 was **not reproduced** here. First measure those actual stage times
and tick/queue pressure on the optimized host with the same authenticated request
shape. Retain cancellation, rate/concurrency gates, strict user-save Restore and
fog-safe result rules. Internal serialization removal might be a later bounded
candidate, but it would require detached-copy/privacy equivalence proof; no such
redesign or validation bypass is implemented or justified as the timeout fix by
this profile alone.


## Captured 24-build follow-up

The optimized four-human course separately reproduced HTTP 503 on a captured
24-order barracks request. The exact request was profiled at four reconstructed
replay states spanning its periodic client observation bracket; the server
capture tick was never recorded. Three-iteration shared-host stage means were
53.9–73.4 ms for the complete saved batch and 0.243–0.366 ms for detached checks.
All source saves/views and full/indexed replay hashes remained identical. No
two-second reproduction or production change resulted. See
[the exact request, provenance, stage table and limitations](../work/advice-path-profile/build-batch-followup/README.md).
