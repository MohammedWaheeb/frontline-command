# Storage recovery rehearsal run-02 — independent read-only review

Reviewed the preserved `run-02/original-run.py`, `original-seed.go`, `original-verify.go`, receipt, extracted historical/current sources, source locks and post-build audit. The audit used only file reads, SHA checks and `git show`; it opened **no SQLite connection** and ran no tests, compiler, host or browser. All findings below concern run-02, regardless of later changes to the top-level helpers.

## Findings

1. **P2 — the drill does not establish that all Python database handles were closed.** `original-run.py` line 36 uses `with sqlite3.connect(...) as db`, and line 75 does the same for the future-version writer. A SQLite connection's transaction context manager does not close the connection. `database()` therefore relies on eventual object cleanup; the top-level future writer remains referenced beyond its `with` block. `stopped()` checks only for a nonempty `*-wal`, not an open connection. The Go subprocesses do explicitly call `Close` and exit, and the copied file hashes are compared, so this does not invalidate the recorded table/object equality; it invalidates the stronger all-handles-closed assertion. Use `contextlib.closing` or explicit `try/finally db.close()` for every connection, with an explicit transaction for the future edit. Preserve run-02 as the prior scope.

2. **P2 — invalid-input preservation and rejection evidence is narrower than its receipt label.** At line 77 only `frontline.db` is hashed before/after rejection. WAL, SHM, objects and identity files are not included in that particular invariant. The still-open future writer additionally permits the `user_version=9` change to exist in WAL at the time the main-file hash is captured. `original-verify.go` line 21 accepts *any* `storage.Open` error; a lock, permission or unrelated opening error would satisfy the same check. A successor should close the edit connection first, record the future header/version, compare the whole isolated directory before/after rejection and assert the expected future-version / SQLite corruption error. Do not reinterpret the existing generic rejection logs as that stronger proof.

Root acknowledged both and is preparing a separate run-03. No run-03 result was available for this review.

## What the existing evidence does support

- **Real historical source, not a fabricated old schema.** The schema-6 extraction contains 13 locked inputs from commit `2774b380e318de945e3b6b6f71b3748093510194`, and schema-7 contains 15 from `d316398...`; every non-helper historical input matches `git show` byte-for-byte. The current extraction has 16 locked files and also matches its lock. The only extra executable source is the explicit test helper. The seed invokes historical `storage.Open` and normal storage methods. It does not synthesize an old schema by editing current SQL or merely setting an older user version.
- Preserved SQLite main-file headers independently read as original **6/7**, upgraded **8**, future-negative **9** after the run. Current header reads are post-run facts; they do not prove when the future edit reached the main database during the original execution.
- All 19 command logs match their receipt hashes. The receipt's table comparisons preserve every old table's row-count and sorted, type-aware row digest. The backup tables equal the upgraded tables. Current `Backup` is actually called, including its refusal to overwrite the same backup path.
- The whole isolated data directory is copied and hash-compared while the drill has no live Go writer. Run-02 uses the actual `objects/` layout. All ten preserved `objects/exact-replay` copies independently match the original native replay bytes. The source also verifies exact save bytes/revisions, profile authentication, another profile's inability to fetch the save, deleted-slot absence, map privacy/revisions, settings, block relation and idempotent result insertion.
- The restored backup is reopened through current storage. Recreating a deleted save must continue the tombstone revision at 2; a subsequent stale revision 1 write must return `ErrConflict`. No new campaign progress is invented.

## Limits that must remain explicit

- The clean-copy path refuses a nonempty WAL. It therefore does **not** test recovery of an uncheckpointed WAL, interrupted write, crash, active host, or concurrent directory copy. No filesystem lock/host startup exclusivity is exercised.
- Table equality is meaningful for the populated tables and vacuous for the rest. Schema 6 populates 7 of 18 old tables; schema 7 populates 9 of 22. Active matches, match access/members, chat, moderation, ratings and reports are empty. The drill is not a populated migration proof for those records or for interrupted-match recovery.
- The map payload and void result are explicitly synthetic storage records. Save/replay payloads are exact existing native bytes, stored opaquely; there is no game-version migration, replay execution, earned-result, HTTP/archive authorization, or personal-data claim.
- `Backup` produces a database file; the separate object-directory copy is what preserves replay bytes. The database file alone is not a complete host backup.
- The row digest checks data, not every schema/index/trigger/constraint definition. Current storage behavior and selected new map/campaign APIs are exercised; exhaustive schema equivalence is not claimed.

`read-only-audit.json` records exact reviewed inputs, source comparisons, post-run header/sidecar hashes, table coverage and replay-object equality. It does not change or supersede the original run-02 receipt.
