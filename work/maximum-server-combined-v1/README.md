# Combined static-grid and checkpoint candidate

29 September 2026. **The single combined actor course passed the unchanged gates.** Live Go/runtime, the original failed server-01 course and both independently reviewed candidates remain untouched. The original tick2 and tick600 overruns are preserved as failures; the new result below is a separate source-specific proof.

## Actual result —18:07:50–18:08:27 UTC

`server-01/receipt.json` records one compile2.49s and one native test34.67s, both exit0. Root coordinated a quiet agent window after IR ISR completed render/pack/UI/native/handoff and held the next SA fighter; Einstein's browser/HTTP and root's heavy work were closed. Actual power was AC100%. No Blender/Go/compiler/host/test/automation-browser was active at prelaunch. Ordinary desktop/background activity remained, including WindowServer around35% CPU and single-digit wallpaper/Claude/node usage; the full process-name snapshot is retained. This is Apple M4/16GiB, Go1.27.1/GOMAXPROCS1, not an Intel/reference-hardware or fully idle OS claim.

All600 actual ticks passed: **zero actor spans at/over50ms, zero missed ticker slots**. Tick2 Advance was6.297ms (original142.362ms); tick600 actor total was42.876ms (original58.262ms). No warm-up or checkpoint sample was excluded.

| Span | p95 ms | p99 ms | Maximum ms |
| --- | --- | --- | --- |
| Engine.Advance |16.079 |19.581 |26.515 |
| Entire measured actor tick |20.421 |26.085 |42.876 |
| Four-view archive capture |3.348 |3.999 |4.333 |
| Peer encode/enqueue |3.579 |4.881 |5.434 |

The maximum is tick600:12.594ms Advance,3.341ms archive,24.646ms replay capture,0.000667ms save enqueue,2.292ms peer serialization/enqueue. Actual asynchronous SQLite checkpoint persistence took10.015ms and the independently read2983528-byte row matched exactly. All72 accepted batches,64 landings,24 interceptions,151 state deliveries per perspective, private-owner filtering, canonical final state, restore, full replay and checkpoint replay checks passed. Final hash is `71bf256a2a95d16e3a65c39977e5d247ebcd81b3088495864806fca313beb8c1`.

Both final/closed save files are byte-identical to the original failed timing run: `dd8de215f6a2f67d0d9a558f5ee1f5ba2b520dd98c4ffdc51836fbce82f9876a`. Both full/captured replay files likewise match:108026bytes, `357b19e8774d8e9f3b695a3a66e622cfbd890e3fca49746a539fe0a60fcf46bd`. Executable SHA is `7bcd3f5eb0d8e74d6db8752d294712bed692eba4e94913b38a8736debefc03aa`. `audit-result.py` independently verifies all13 artifact hashes, executable/source locks, raw600 samples and original save/replay byte equality; `server-01/postrun-audit.json` records the proof. Original receipt status remains failed. Per-peer byte/count totals also match, but are not relabeled as retained per-frame byte-equality proof.

All raw samples and compact receipts are checkpointed; large save/replay/SQLite objects and the executable remain locally at the hashed paths. The measured native memory-peer course excludes public HTTP/WebSocket/advice, slow clients, concurrent matches, final-art browser load and long-session/reference-device acceptance. No live source/runtime promotion has occurred.

## Source identity

`source-lock.json` SHA `7ac31472467322e374eee42781735b2ada2ab2f062445d38097ed43681e2abd3` records360 files plus the explicitly allowed exact `.gitignore`. Parent source is checkpoint-reuse lock36a7a736…c6444 from checkpointd95fade, itself based on the reviewed instrumented3d49 actor source. Exactly358 parent files are unchanged; `pkg/sim/navigation.go` is replaced and `pkg/sim/navigation_raster_test.go` added. Nothing is removed.

The imported root raster-v3 lock is `16f9b43d7f5fe97ee35f9a74ecbec529d4763a14e1d8eb86565675327dedfb74`. Imported implementation SHA `6a51329f420cebbff652e493409f0aa1337a03c47e12910d664008fe824732b9` and strengthened test SHA `120e4b387a6f6817500b8d61b5a9d1c79617b5341b915df4b0b6ee7a658b4b8f` are checked before and after copying. Root's profiling command and all other raster-tree files are excluded.

`prepare.py` records hashes and rejects a reused output directory. `preflight.json` identifies imported/unchanged files and runner hashes. The inherited runner initially referenced old `server-source/` paths; independent review caught that before execution. The original runner, preparer and preflight are preserved with `before-review` names. The corrected runner SHA is `0b2b1a451dd6d12a809817889d6ed4e25dbd23a62e87f237229111f22f4cf3a6`, using this directory's `source/` and `source-lock.json`. `author-checks.json` records actual path/source-guard verification and Python parsing. No Go source changed in that correction.

## Clean proposed integration

`production-inventory.json` SHA `5e245676eaf690224ee9ddc941abbff0889c7a3219819ea549dc5cb373f5fe77` records every baseline/candidate digest against integrated3d49. `production.diff` SHA `3dfd0ac8ac2a09c05a468a41a93b24d526c867ef90525498a35de53796d77805` and `production-files/` contain exactly four proposed production paths and three tests:

- `pkg/sim/navigation.go`: the reviewed static-clearance grid raster implementation.
- `pkg/sim/replay.go`: shared Capture implementation and owned checkpoint-save return API.
- `internal/server/replay_checkpoint.go`: save reuse with the original persistence fallback on recorder error.
- `internal/server/match.go`: only the checkpoint callsite replacement.
- `pkg/sim/navigation_raster_test.go`, `pkg/sim/replay_checkpoint_test.go`, `internal/server/replay_checkpoint_test.go`: focused regression/oracle tests.

The clean copies exclude every actor timing tap, global probe, fixture shutdown and coldprofile command. Do not promote the instrumented match.go. No version/state/wire/content change is included. This is an integration proposal, not shipping adoption.

## Unchanged actor qualification

The complete timing test is byte-identical SHA `f014953ce8253f4684751bde42aeb2055b05c55d8f4dd1ad1870cb797b94be8a`. It still executes the actual20Hz actor with688 legal actors,72 public command batches, four-perspective production serialization/archive delivery, real replay/checkpoint work and asynchronous SQLite persistence. Required600ticks,64 landings,24 interceptions,151 state deliveries per perspective, receipt/privacy checks, canonical final hash, save/full replay/checkpoint equivalence and strict simulation p95<25ms/p99<40ms remain unchanged. Every actor span must be below50ms with no missed ticker slots. The tick600 checkpoint is not exempted.

The runner retains the reviewed exact-inventory guard, before/after source checks, failure-preserving receipts, bounded compile/test process groups and fresh output requirement. New candidate output will be here at `server-01/`, distinct from the original failed course. Four bounded memory sinks remain; no public-network/advice/cloud/reference-hardware claim is added.

The single executed command used the following form after independent review and explicit whole-asset quiet dispatch; exact actual conditions are retained in its receipt:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 work/maximum-server-combined-v1/run-server.py server-01 \
  --conditions 'Actual coordinated quiet dispatch, hardware/power/background conditions'
```

One GOMAXPROCS1 compile is bounded60s; one exact600-tick test uses Go75s/outer80s. No adaptive rerun. The actual30-second ticker course and all original failures must be retained. Root coordinates shared rendering/browser/native holds.

`checks-01` is a preserved failed correctness attempt. Running all-package short against the instrumented tree failed when ordinary command packages imported `internal/server` without its `_test.go` probe definitions. The simulation short suite passed, but the all-package command failed and later stages did not run. No actor timing ran; no game defect is inferred from that harness build failure.

`prepare-clean.py` derives a separate clean correctness twin from3d49 plus the exact seven reviewed integration files. `clean-source-lock.json` SHA `a7ccba8c892abcf4bc643ed41109399741cf74d6b33161a0e5e29c977adcc5c0` pins359 files plus the allowed ignore file. It matches the instrumented source on358 common files; only match.go omits timing taps, and the timing test is absent. `clean-preflight.json` records this exact comparison. The original instrumented tree and failed checks are unchanged.

`run-clean-checks.py` uses that clean twin for serial all-package short, focused native checkpoint checks and actual Go/WASM artifact equality, checking both source locks before and after. It never launches the real actor course. Its distinct output is `checks-02`; command duration on the shared host is not a performance result. Original `run-checks.py` remains as failed-attempt provenance.

**`checks-02` passed:** all-package short72.24s, focused native3.40s, actual WASM5.14s command spans. Both complete source inventories/hashes passed before and after; root's five raster tests are included in the clean short suite. The retained688-actor tick600 save (`dd8de215…876a`,2983528bytes), boundary replay (`e33edfcf…11d5`,158677bytes) and packed checkpoint (`79556230…23ce`,78880bytes) are exact native/WASM matches and match the separately checked reuse candidate. These files remain local; the receipt contains full digests. No combined race repetition was needed after both unchanged slices' focused race proofs. The later actor qualification is separately documented above.
