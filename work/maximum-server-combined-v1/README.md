# Combined static-grid and checkpoint candidate

29 September 2026. **Isolated preparation; real actor timing has not run.** Live Go/runtime, the original failed server-01 course and both independently reviewed candidates remain untouched. The earlier tick2 and tick600 overruns remain failures until a fresh course passes the unchanged gates.

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

After independent review and an explicit whole-asset quiet dispatch only:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 work/maximum-server-combined-v1/run-server.py server-01 \
  --conditions 'Actual coordinated quiet dispatch, hardware/power/background conditions'
```

One GOMAXPROCS1 compile is bounded60s; one exact600-tick test uses Go75s/outer80s. No adaptive rerun. The actual30-second ticker course and all original failures must be retained. Root coordinates shared rendering/browser/native holds.

`checks-01` is a preserved failed correctness attempt. Running all-package short against the instrumented tree failed when ordinary command packages imported `internal/server` without its `_test.go` probe definitions. The simulation short suite passed, but the all-package command failed and later stages did not run. No actor timing ran; no game defect is inferred from that harness build failure.

`prepare-clean.py` derives a separate clean correctness twin from3d49 plus the exact seven reviewed integration files. `clean-source-lock.json` SHA `a7ccba8c892abcf4bc643ed41109399741cf74d6b33161a0e5e29c977adcc5c0` pins359 files plus the allowed ignore file. It matches the instrumented source on358 common files; only match.go omits timing taps, and the timing test is absent. `clean-preflight.json` records this exact comparison. The original instrumented tree and failed checks are unchanged.

`run-clean-checks.py` uses that clean twin for serial all-package short, focused native checkpoint checks and actual Go/WASM artifact equality, checking both source locks before and after. It never launches the real actor course. Its distinct output is `checks-02`; command duration on the shared host is not a performance result. Original `run-checks.py` remains as failed-attempt provenance.

**`checks-02` passed:** all-package short72.24s, focused native3.40s, actual WASM5.14s command spans. Both complete source inventories/hashes passed before and after; root's five raster tests are included in the clean short suite. The retained688-actor tick600 save (`dd8de215…876a`,2983528bytes), boundary replay (`e33edfcf…11d5`,158677bytes) and packed checkpoint (`79556230…23ce`,78880bytes) are exact native/WASM matches and match the separately checked reuse candidate. These files remain local; the receipt contains full digests. No combined race repetition was needed after both unchanged slices' focused race proofs. Real actor timing remains unrun and no cadence pass is claimed.
